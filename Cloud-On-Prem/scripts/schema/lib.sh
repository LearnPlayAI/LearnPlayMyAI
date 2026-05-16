#!/usr/bin/env bash
set -euo pipefail

read_db_url_from_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    grep -E '^DATABASE_URL=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
    return 0
  fi
  return 1
}

resolve_product_db_url() {
  local product="$1"
  local db_url=""
  case "$product" in
    cloud)
      db_url="$(read_db_url_from_env_file /opt/learnplay/cloud/.env || true)"
      [ -n "$db_url" ] && { printf '%s' "$db_url"; return 0; }
      ;;
    onprem)
      db_url="$(read_db_url_from_env_file /opt/learnplay/onprem/.env || true)"
      [ -n "$db_url" ] && { printf '%s' "$db_url"; return 0; }
      ;;
  esac

  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "$DATABASE_URL"
    return 0
  fi

  db_url="$(read_db_url_from_env_file "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env" || true)"
  if [ -n "$db_url" ]; then
    printf '%s' "$db_url"
    return 0
  fi

  return 1
}

sanitize_table_list() {
  local input_file="$1"
  awk '
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      if ($0 == "" || $0 ~ /^#/) next
      print $0
    }
  ' "$input_file" | sort -u
}

build_sql_in_list_from_stdin() {
  awk '
    BEGIN { first = 1 }
    {
      gsub(/\047/, "\047\047", $0)
      if (!first) printf ","
      printf "\047%s\047", $0
      first = 0
    }
  '
}

capture_full_contract_env() {
  local db_url="$1"
  psql "$db_url" -At <<'SQL'
SELECT 'EXPECTED_TABLES=' || count(*) FROM information_schema.tables WHERE table_schema='public';
SELECT 'EXPECTED_COLUMNS=' || count(*) FROM information_schema.columns WHERE table_schema='public';
SELECT 'EXPECTED_CONSTRAINTS=' || count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace;
SELECT 'EXPECTED_INDEXES=' || count(*) FROM pg_indexes WHERE schemaname='public';
SELECT 'EXPECTED_ENUMS=' || count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e';
SELECT 'EXPECTED_SCHEMA_SIG=' || md5(string_agg(s, E'\n' ORDER BY s))
FROM (
  SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public'
  UNION ALL
  SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'')
  FROM information_schema.columns WHERE table_schema='public'
  UNION ALL
  SELECT 'K|'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid)
  FROM pg_constraint WHERE connamespace='public'::regnamespace
  UNION ALL
  SELECT 'I|'||schemaname||'|'||tablename||'|'||indexname||'|'||indexdef
  FROM pg_indexes WHERE schemaname='public'
  UNION ALL
  SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public'
) x;
SQL
}

capture_shared_contract_env() {
  local db_url="$1"
  local table_in_list="$2"

  psql "$db_url" -At <<SQL
SELECT 'EXPECTED_TABLES=' || count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${table_in_list});
SELECT 'EXPECTED_COLUMNS=' || count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${table_in_list});
SELECT 'EXPECTED_CONSTRAINTS=0';
SELECT 'EXPECTED_INDEXES=0';
SELECT 'EXPECTED_ENUMS=' || count(*)
FROM pg_type t
JOIN pg_enum e ON e.enumtypid=t.oid
JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.oid IN (
  SELECT DISTINCT a.atttypid
  FROM pg_attribute a
  JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relname IN (${table_in_list}) AND a.attnum > 0 AND NOT a.attisdropped
);
SELECT 'EXPECTED_SCHEMA_SIG=' || md5(string_agg(s, E'\\n' ORDER BY s))
FROM (
  SELECT 'T|'||table_name AS s
  FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN (${table_in_list})
  UNION ALL
  SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'')
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN (${table_in_list})
  UNION ALL
  SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid=t.oid
  JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public' AND t.oid IN (
    SELECT DISTINCT a.atttypid
    FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relname IN (${table_in_list}) AND a.attnum > 0 AND NOT a.attisdropped
  )
) x;
SQL
}
