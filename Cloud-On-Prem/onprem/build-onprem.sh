#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/dist-onprem"
BUILD_SOURCE_ROOT="$PROJECT_ROOT"
STAGING_DIR=""

read_db_url_from_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    grep -E '^DATABASE_URL=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
    return 0
  fi
  return 1
}

read_env_value_from_file() {
  local env_file="$1"
  local key="$2"
  if [ -f "$env_file" ]; then
    grep -E "^${key}=" "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
    return 0
  fi
  return 1
}

resolve_onprem_schema_db_url() {
  local db_url
  if [ -n "${ONPREM_SCHEMA_DATABASE_URL:-}" ]; then
    printf '%s' "$ONPREM_SCHEMA_DATABASE_URL"
    return 0
  fi
  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "$DATABASE_URL"
    return 0
  fi
  db_url="$(read_db_url_from_env_file "/opt/learnplay/onprem/.env" || true)"
  if [ -n "$db_url" ]; then
    printf '%s' "$db_url"
    return 0
  fi
  db_url="$(read_db_url_from_env_file "$PROJECT_ROOT/.env.onprem.local" || true)"
  if [ -n "$db_url" ]; then
    printf '%s' "$db_url"
    return 0
  fi
  return 1
}

resolve_cloud_data_export_db_url() {
  local db_url=""
  if [ -n "${CLOUD_DATA_DATABASE_URL:-}" ]; then
    printf '%s' "$CLOUD_DATA_DATABASE_URL"
    return 0
  fi
  db_url="$(read_db_url_from_env_file "/opt/learnplay/cloud/.env" || true)"
  if [ -n "$db_url" ]; then
    printf '%s' "$db_url"
    return 0
  fi
  db_url="$(read_db_url_from_env_file "$PROJECT_ROOT/.env.cloud.local" || true)"
  if [ -n "$db_url" ]; then
    printf '%s' "$db_url"
    return 0
  fi
  db_url="$(read_db_url_from_env_file "$PROJECT_ROOT/.env" || true)"
  if [ -n "$db_url" ]; then
    printf '%s' "$db_url"
    return 0
  fi
  return 1
}

enforce_devadmin_build_context() {
  if [ "${LEARNPLAY_BUILD_INVOKER_TOOL:-}" != "devadmin" ]; then
    echo "❌ Package builds must be started by devadmin (set by devadmin build pipeline)."
    exit 1
  fi
  if [ "${LEARNPLAY_ALLOW_NON_INTERNAL_BUILD:-false}" != "true" ] && [ ! -d "/antigravity/Cloud-On-Prem" ]; then
    echo "❌ Package build environment must be the internal LearnPlay DEV host (/antigravity/Cloud-On-Prem)."
    exit 1
  fi
}

generate_dev_baseline_migration_if_needed() {
  local db_url="$1"
  local state_dir="${LEARNPLAY_DEV_BUILD_STATE_DIR:-/antigravity/packages/.build-state}"
  node "$PROJECT_ROOT/scripts/dev-db-baseline-migrations.mjs" \
    --scope onprem \
    --db-url "$db_url" \
    --migrations-dir "$PROJECT_ROOT/migrations" \
    --state-dir "$state_dir" \
    --write-state true
  node "$PROJECT_ROOT/scripts/migration-governance.mjs" validate --deployment-mode onprem --auto-remediate-journal
}

prepare_packaged_migrations() {
  local source_root="$1"
  local source_dir="$source_root/migrations"
  local package_mode="${LEARNPLAY_PACKAGE_MIGRATION_MODE:-baseline-only}"
  mkdir -p "$BUILD_DIR/migrations/meta"
  rm -f "$BUILD_DIR"/migrations/*.sql
  rm -f "$BUILD_DIR"/migrations/meta/*.json

  if [ "$package_mode" = "baseline-only" ]; then
    local latest_baseline_file=""
    local ts_ms
    local idx=0
    local migration_tags=()
    ts_ms="$(($(date +%s) * 1000))"
    shopt -s nullglob
    local scoped_files=("$source_dir"/*_dev_runtime_onprem_*.sql)
    local all_files=("$source_dir"/*.sql)
    shopt -u nullglob

    if [ ${#all_files[@]} -eq 0 ]; then
      echo "⚠️  No migration SQL files found; emitting empty baseline migration journal."
      cat > "$BUILD_DIR/migrations/meta/_journal.json" <<EOF
{
  "version": "7",
  "dialect": "postgresql",
  "entries": []
}
EOF
      return 0
    fi

    if [ ${#scoped_files[@]} -gt 0 ]; then
      latest_baseline_file="$(printf '%s\n' "${scoped_files[@]}" | sort | tail -n1)"
    fi

    local sorted_all_files
    sorted_all_files="$(printf '%s\n' "${all_files[@]}" | sort)"

    if [ -n "$latest_baseline_file" ] && [ -f "$latest_baseline_file" ]; then
      while IFS= read -r migration_file; do
        [ -z "$migration_file" ] && continue
        if [[ "$(basename "$migration_file")" < "$(basename "$latest_baseline_file")" ]]; then
          continue
        fi
        cp "$migration_file" "$BUILD_DIR/migrations/"
        migration_tags+=("$(basename "$migration_file" .sql)")
      done <<< "$sorted_all_files"
    else
      # Fallback: no scoped baseline present, keep latest migration only.
      local latest_file
      latest_file="$(printf '%s\n' "${all_files[@]}" | sort | tail -n1)"
      cp "$latest_file" "$BUILD_DIR/migrations/"
      migration_tags+=("$(basename "$latest_file" .sql)")
    fi

    if [ ${#migration_tags[@]} -eq 0 ]; then
      echo "❌ Failed to select packaged migrations in baseline-only mode"
      exit 1
    fi

    local journal_entries=""
    for tag in "${migration_tags[@]}"; do
      if [ -n "$journal_entries" ]; then
        journal_entries+=","
      fi
      journal_entries+=$'\n'"    {"$'\n'"      \"idx\": $idx,"$'\n'"      \"version\": \"7\","$'\n'"      \"when\": $((ts_ms + idx)),"$'\n'"      \"tag\": \"$tag\","$'\n'"      \"breakpoints\": true"$'\n'"    }"
      idx=$((idx + 1))
    done

    cat > "$BUILD_DIR/migrations/meta/_journal.json" <<EOF
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [${journal_entries}
  ]
}
EOF
    if [ -n "$latest_baseline_file" ]; then
      echo "📦 Migration package mode: baseline-only (kept baseline $(basename "$latest_baseline_file") + ${#migration_tags[@]} migration file(s) from baseline onward)"
    else
      echo "📦 Migration package mode: baseline-only (no scoped baseline found; kept latest migration ${migration_tags[0]}.sql)"
    fi
    return 0
  fi

  cp -r "$source_dir"/*.sql "$BUILD_DIR/migrations/" 2>/dev/null || true
  cp -r "$source_dir"/meta/* "$BUILD_DIR/migrations/meta/" 2>/dev/null || true
  echo "📦 Migration package mode: full-history"
}

enforce_devadmin_build_context

SCHEMA_DATABASE_URL="$(resolve_onprem_schema_db_url || true)"
CLOUD_EXPORT_DATABASE_URL="$(resolve_cloud_data_export_db_url || true)"

if [ -z "$SCHEMA_DATABASE_URL" ]; then
  echo "❌ Onprem schema DATABASE_URL not set."
  echo "   Set ONPREM_SCHEMA_DATABASE_URL or ensure /opt/learnplay/onprem/.env has DATABASE_URL."
  exit 1
fi
if [ -z "$CLOUD_EXPORT_DATABASE_URL" ]; then
  echo "❌ Cloud data export DATABASE_URL not set."
  echo "   Set CLOUD_DATA_DATABASE_URL or ensure /opt/learnplay/cloud/.env has DATABASE_URL."
  exit 1
fi

echo "🔁 Detecting DEV runtime schema changes since last successful build..."
generate_dev_baseline_migration_if_needed "$SCHEMA_DATABASE_URL"

# ============================================
# 0. VALIDATE MIGRATION COMPATIBILITY CONTRACT
# ============================================
echo "🔎 Validating migration compatibility..."
if [ -x "$PROJECT_ROOT/scripts/validate-migrations.sh" ]; then
  "$PROJECT_ROOT/scripts/validate-migrations.sh" "$PROJECT_ROOT/migrations" "onprem"
else
  echo "❌ Missing migration validator: $PROJECT_ROOT/scripts/validate-migrations.sh"
  exit 1
fi

cleanup() {
  if [ -n "$STAGING_DIR" ] && [ -d "$STAGING_DIR" ]; then
    rm -rf "$STAGING_DIR"
  fi
}
trap cleanup EXIT ERR INT TERM

create_isolated_build_workspace() {
  STAGING_DIR="$(mktemp -d /tmp/learnplay-onprem-build.XXXXXX)"
  local stage_root="$STAGING_DIR/workspace"
  mkdir -p "$stage_root"

  echo "🧪 Creating isolated onprem build workspace at $stage_root"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude ".git" \
      --exclude "dist-onprem" \
      --exclude "dist-cloud" \
      --exclude "node_modules" \
      --exclude "*.cloud-backup" \
      "$PROJECT_ROOT/" "$stage_root/"
  else
    cp -a "$PROJECT_ROOT/." "$stage_root/"
    rm -rf "$stage_root/.git" "$stage_root/dist-onprem" "$stage_root/dist-cloud" "$stage_root/node_modules"
    find "$stage_root" -type f -name "*.cloud-backup" -delete || true
  fi

  if [ -d "$PROJECT_ROOT/node_modules" ]; then
    ln -s "$PROJECT_ROOT/node_modules" "$stage_root/node_modules"
  fi

  cp "$stage_root/server/db-onprem.ts" "$stage_root/server/db.ts"
  cp "$stage_root/server/migrate-onprem.ts" "$stage_root/server/migrate.ts"
  cp "$stage_root/server/objectStorage-onprem.ts" "$stage_root/server/objectStorage.ts"
  cp "$stage_root/server/vite-onprem.ts" "$stage_root/server/vite.ts"

  BUILD_SOURCE_ROOT="$stage_root"
  echo "✅ Isolated workspace ready (source tree remains unchanged)"
}

# ============================================
# 1. CLEAN BUILD DIRECTORY
# ============================================
echo "🧹 Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{server,client,migrations,data,scripts}

# ============================================
# 2. CREATE ISOLATED BUILD WORKSPACE
# ============================================
create_isolated_build_workspace

# ============================================
# 3. FRONTEND BUILD
# ============================================
echo "🏗️  Building frontend..."
cd "$BUILD_SOURCE_ROOT"
npx vite build --outDir "$BUILD_DIR/client"

# ============================================
# 4. SERVER BUILD
# ============================================
echo "🏗️  Building server..."
npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir="$BUILD_DIR/server"

# ============================================
# 5. BUILD MIGRATION RUNNER
# ============================================
echo "🏗️  Building migration runner..."
npx esbuild "$BUILD_SOURCE_ROOT/server/migrate-onprem.ts" \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outfile="$BUILD_DIR/scripts/migrate.js"

# ============================================
# 5b. BUILD PODCAST HLS BACKFILL RUNNER
# ============================================
echo "🏗️  Building podcast HLS backfill runner..."
npx esbuild "$BUILD_SOURCE_ROOT/server/scripts/backfillPodcastHls.ts" \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outfile="$BUILD_DIR/scripts/backfillPodcastHls.js"

# ============================================
# 5c. COPY MIGRATION GOVERNANCE TOOLING
# ============================================
echo "📋 Copying migration governance tooling..."
mkdir -p "$BUILD_DIR/scripts/lib"
cp "$BUILD_SOURCE_ROOT/scripts/migration-governance.mjs" "$BUILD_DIR/scripts/migration-governance.mjs"
cp "$BUILD_SOURCE_ROOT/scripts/remediate-snake-case-tables.mjs" "$BUILD_DIR/scripts/remediate-snake-case-tables.mjs"
cp "$BUILD_SOURCE_ROOT/scripts/data-parity-gate.mjs" "$BUILD_DIR/scripts/data-parity-gate.mjs"
cp "$BUILD_SOURCE_ROOT/scripts/lib/migration-governance-lib.js" "$BUILD_DIR/scripts/lib/migration-governance-lib.js"
chmod +x "$BUILD_DIR/scripts/migration-governance.mjs"
chmod +x "$BUILD_DIR/scripts/remediate-snake-case-tables.mjs"
chmod +x "$BUILD_DIR/scripts/data-parity-gate.mjs"

# ============================================
# 6. COPY MIGRATIONS
# ============================================
echo "📋 Copying migrations..."
prepare_packaged_migrations "$BUILD_SOURCE_ROOT"
cp "$SCRIPT_DIR/create-enums.sql" "$BUILD_DIR/" 2>/dev/null || true

echo "📋 Generating complete schema SQL via pg_dump..."
if [ -z "${SCHEMA_DATABASE_URL:-}" ]; then
  echo "⚠️  DATABASE_URL not set — checking for existing schema-full.sql..."
  if [ -f "$SCRIPT_DIR/schema-full.sql" ]; then
    cp "$SCRIPT_DIR/schema-full.sql" "$BUILD_DIR/"
    echo "   Using pre-built schema-full.sql"
  else
    echo "❌ Cannot generate schema: DATABASE_URL not set and no pre-built schema-full.sql found"
    exit 1
  fi
else
  pg_dump --schema-only --no-owner --no-privileges --no-comments --no-tablespaces --no-security-labels --schema=public "$SCHEMA_DATABASE_URL" 2>/dev/null | \
    sed '/^\\restrict/d' | \
    sed '/^\\unrestrict/d' | \
    sed '/^CREATE SCHEMA public;/d' | \
    sed 's/public\.//g' | \
    sed '/^SET /d' | \
    sed '/^SELECT pg_catalog/d' > "$BUILD_DIR/schema-full.raw.sql"
  echo "   Raw schema captured ($(grep -c 'CREATE TABLE' "$BUILD_DIR/schema-full.raw.sql") tables, $(grep -c 'CREATE TYPE' "$BUILD_DIR/schema-full.raw.sql") types)"

  echo "🔧 Making schema-full.sql fully idempotent..."
  awk '
  BEGIN { alter_table_line = "" }

  # --- CREATE TYPE "xxx" AS ENUM -> wrap in DO/EXCEPTION ---
  /^CREATE TYPE [^ ]+ AS ENUM/ {
    enum_block = $0
    if ($0 !~ /;[[:space:]]*$/) {
      while ((getline line) > 0) {
        enum_block = enum_block "\n" line
        if (line ~ /;[[:space:]]*$/) break
      }
    }
    print "DO $$ BEGIN"
    print enum_block
    print "EXCEPTION WHEN duplicate_object THEN NULL;"
    print "END $$;"
    next
  }

  # --- CREATE TABLE -> add IF NOT EXISTS ---
  /^CREATE TABLE / && !/IF NOT EXISTS/ {
    sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
  }

  # --- CREATE INDEX -> add IF NOT EXISTS ---
  /^CREATE INDEX / && !/IF NOT EXISTS/ {
    sub(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
  }

  # --- CREATE UNIQUE INDEX -> add IF NOT EXISTS ---
  /^CREATE UNIQUE INDEX / && !/IF NOT EXISTS/ {
    sub(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  }

  # --- CREATE SEQUENCE -> add IF NOT EXISTS ---
  /^CREATE SEQUENCE / && !/IF NOT EXISTS/ {
    sub(/^CREATE SEQUENCE /, "CREATE SEQUENCE IF NOT EXISTS ")
  }

  # --- CREATE SCHEMA -> add IF NOT EXISTS ---
  /^CREATE SCHEMA / && !/IF NOT EXISTS/ {
    sub(/^CREATE SCHEMA /, "CREATE SCHEMA IF NOT EXISTS ")
  }

  # --- ALTER TABLE ONLY ... ALTER COLUMN SET DEFAULT (single-line) -> wrap ---
  /^ALTER TABLE ONLY .* ALTER COLUMN .* SET DEFAULT / {
    print "DO $$ BEGIN"
    print $0
    print "EXCEPTION WHEN duplicate_object THEN NULL;"
    print "END $$;"
    next
  }

  # --- ALTER TABLE ONLY "xxx" (line before ADD CONSTRAINT) ---
  /^ALTER TABLE ONLY / {
    alter_table_line = $0
    next
  }

  # --- ADD CONSTRAINT (following ALTER TABLE ONLY) -> wrap in DO/EXCEPTION ---
  /^[[:space:]]+ADD CONSTRAINT / && alter_table_line != "" {
    constraint_block = alter_table_line "\n" $0
    if ($0 !~ /;[[:space:]]*$/) {
      while ((getline line) > 0) {
        constraint_block = constraint_block "\n" line
        if (line ~ /;[[:space:]]*$/) break
      }
    }
    print "DO $$ BEGIN"
    print constraint_block
    print "EXCEPTION WHEN duplicate_object THEN NULL;"
    print "END $$;"
    alter_table_line = ""
    next
  }

  # --- ALTER TABLE ONLY ... ALTER COLUMN ... SET DEFAULT -> wrap in DO/EXCEPTION ---
  alter_table_line != "" && /ALTER COLUMN.*SET DEFAULT/ {
    print "DO $$ BEGIN"
    print alter_table_line
    print $0
    print "EXCEPTION WHEN duplicate_object THEN NULL;"
    print "END $$;"
    alter_table_line = ""
    next
  }

  # --- If we had an ALTER TABLE ONLY but next line is not ADD CONSTRAINT ---
  alter_table_line != "" {
    print alter_table_line
    alter_table_line = ""
  }

  { print }

  END {
    if (alter_table_line != "") print alter_table_line
  }
  ' "$BUILD_DIR/schema-full.raw.sql" > "$BUILD_DIR/schema-full.sql"
  rm -f "$BUILD_DIR/schema-full.raw.sql"

  echo "   ✅ Idempotent schema ready ($(grep -c 'IF NOT EXISTS' "$BUILD_DIR/schema-full.sql") guarded statements, $(grep -c 'EXCEPTION WHEN duplicate_object' "$BUILD_DIR/schema-full.sql") exception blocks)"

  echo "🔍 Validating schema-full.sql against shared/schema.ts..."
  SCHEMA_VALIDATION_FAILED=false
  REQUIRED_COLUMNS=(
    "isCustSuper"
    "isSuperAdmin"
    "sessionVersion"
    "lpCreditBalance"
    "isDisabled"
    "preferredLanguage"
    "emailVerified"
    "orgCreditWallet"
    "useOrgCreditWallet"
    "trialCreditsAwarded"
    "syncAuthMode"
    "syncAuthVersion"
    "syncAuthSecretHash"
    "syncAuthRevokedAt"
  )
  for col in "${REQUIRED_COLUMNS[@]}"; do
    if ! grep -q "\"$col\"" "$BUILD_DIR/schema-full.sql"; then
      echo "   ❌ MISSING COLUMN: \"$col\" not found in schema-full.sql"
      SCHEMA_VALIDATION_FAILED=true
    fi
  done
  REQUIRED_TABLES=(
    "users"
    "organizations"
    "userOrganizationRoles"
    "brandingThemes"
    "organizationLicenses"
    "creditTransactions"
    "courses"
    "courseLessons"
  )
  for tbl in "${REQUIRED_TABLES[@]}"; do
    if ! grep -q "CREATE TABLE.*\"$tbl\"\|CREATE TABLE.*${tbl}" "$BUILD_DIR/schema-full.sql"; then
      echo "   ❌ MISSING TABLE: \"$tbl\" not found in schema-full.sql"
      SCHEMA_VALIDATION_FAILED=true
    fi
  done
  if [ "$SCHEMA_VALIDATION_FAILED" = true ]; then
    echo ""
    echo "   ❌ Schema validation FAILED!"
    echo "   The live database is missing columns/tables that shared/schema.ts defines."
    echo "   Apply all pending migrations to the live DB before building."
    echo "   Example: psql \$ONPREM_SCHEMA_DATABASE_URL -f migrations/0052_add_cust_super_role.sql"
    exit 1
  fi
  echo "   ✅ Schema validation passed (${#REQUIRED_COLUMNS[@]} columns, ${#REQUIRED_TABLES[@]} tables verified)"
fi

echo "📋 Capturing schema parity fingerprint..."
psql "$SCHEMA_DATABASE_URL" -At > "$BUILD_DIR/schema-fingerprint.env" <<'SQL'
SELECT 'EXPECTED_TABLES=' || count(*) FROM information_schema.tables WHERE table_schema='public';
SELECT 'EXPECTED_COLUMNS=' || count(*) FROM information_schema.columns WHERE table_schema='public';
SELECT 'EXPECTED_CONSTRAINTS=' || count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace;
SELECT 'EXPECTED_INDEXES=' || count(*) FROM pg_indexes WHERE schemaname='public';
SELECT 'EXPECTED_ENUMS=' || count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e';
SELECT 'EXPECTED_CORE_TABLES=' || coalesce(string_agg(table_name, ',' ORDER BY table_name), '')
FROM information_schema.tables
WHERE table_schema='public';
SELECT 'EXPECTED_CORE_TABLE_COUNT=' || count(*)
FROM information_schema.tables
WHERE table_schema='public';
SELECT 'EXPECTED_CORE_COLUMN_COUNT=' || count(*)
FROM information_schema.columns
WHERE table_schema='public';
SELECT 'EXPECTED_CORE_ENUM_COUNT=' || count(*)
FROM pg_type t
JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typtype='e';
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
SELECT 'EXPECTED_CORE_SCHEMA_SIG=' || md5(string_agg(s, E'\n' ORDER BY s))
FROM (
  SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public'
  UNION ALL
  SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'')
  FROM information_schema.columns WHERE table_schema='public'
  UNION ALL
  SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public'
) x;
SQL
echo "   ✅ schema-fingerprint.env captured"
{
  echo "CONTRACT_PRODUCT=shared"
  echo "CONTRACT_VERSION=1"
  echo "CONTRACT_GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat "$BUILD_DIR/schema-fingerprint.env"
} > "$BUILD_DIR/schema-contract.env"
echo "   ✅ schema-contract.env captured (product=shared)"

echo "🔧 Patching migration SQL for idempotent execution..."
for sql_file in "$BUILD_DIR/migrations"/*.sql; do
  [ -f "$sql_file" ] || continue
  awk '
  /^DO \$\$/ || /^DO \$\$ BEGIN/ { in_do_block=1 }
  /^END \$\$;/ { in_do_block=0; print; next }
  /^CREATE TYPE "[^"]+" AS ENUM/ && !in_do_block {
    print "DO $$ BEGIN"
    print "  " $0
    print "EXCEPTION WHEN duplicate_object THEN null;"
    print "END $$;"
    next
  }
  /ALTER TABLE .* ADD CONSTRAINT/ && !in_do_block {
    stmt = $0
    sub(/--> statement-breakpoint$/, "", stmt)
    gsub(/;[[:space:]]*$/, "", stmt)
    print "DO $$ BEGIN"
    print "  " stmt ";"
    print "EXCEPTION WHEN duplicate_object THEN null;"
    print "END $$;"
    next
  }
  /^CREATE TABLE / && !/IF NOT EXISTS/ {
    sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
  }
  /^CREATE INDEX / && !/IF NOT EXISTS/ {
    sub(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
  }
  /^CREATE UNIQUE INDEX / && !/IF NOT EXISTS/ {
    sub(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  }
  /ALTER TABLE .* ADD COLUMN / && !/IF NOT EXISTS/ && !in_do_block {
    sub(/ADD COLUMN /, "ADD COLUMN IF NOT EXISTS ")
  }
  { print }
  ' "$sql_file" > "${sql_file}.tmp" && mv "${sql_file}.tmp" "$sql_file"
done

# ============================================
# 8. GENERATE PACKAGE.JSON (on-prem deps only)
# ============================================
echo "📦 Generating on-prem package.json..."
cat > "$BUILD_DIR/package.json" << 'PKGJSON'
{
  "name": "learnplay-onprem",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node server/index.js",
    "migrate": "node scripts/migrate.js"
  },
  "dependencies": {
    "pg": "^8.13.0",
    "drizzle-orm": "^0.39.1",
    "express": "^4.21.2",
    "express-session": "^1.18.2",
    "connect-pg-simple": "^10.0.0",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "bcrypt": "^6.0.0",
    "sharp": "^0.34.3",
    "multer": "^2.0.2",
    "archiver": "^7.0.1",
    "axios": "^1.13.2",
    "date-fns": "^3.6.0",
    "date-fns-tz": "^3.2.0",
    "docx": "^9.5.1",
    "fast-xml-parser": "^5.3.2",
    "mailersend": "^2.6.0",
    "nodemailer": "^6.9.0",
    "mammoth": "^1.11.0",
    "memoizee": "^0.4.17",
    "memorystore": "^1.6.7",
    "openid-client": "^6.7.1",
    "pdf-parse": "^2.4.5",
    "pdfkit": "^0.17.2",
    "pptx-in-html-out": "^0.0.2",
    "socket.io": "^4.8.1",
    "unzipper": "^0.12.3",
    "ws": "^8.18.0",
    "zod": "^3.24.2",
    "zod-validation-error": "^3.4.0",
    "@google/genai": "^1.22.0",
    "drizzle-zod": "^0.7.0"
  }
}
PKGJSON

# ============================================
# 9. GENERATE VERSION.JSON
# ============================================
echo "📋 Generating version metadata..."
cat > "$BUILD_DIR/version.json" << EOF
{
  "version": "${RELEASE_VERSION_OVERRIDE:-$(date +%Y%m%d%H%M%S)}",
  "buildDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "gitCommit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "platform": "onprem",
  "changelog": [
    "EC P-256 asymmetric crypto for license keys (ECDSA signing) and license requests (ECDH+AES-256-GCM hybrid encryption)",
    "Per-customer AES-256 encryption keys for backups, secrets, and vault operations via provision bundles",
    "DR backup/restore 3 modes: clone (exact replica), create-prod (exclude transactional data), system-copy (data refresh preserving target identity)",
    "Per-customer key file support in all backup/restore scripts (--key-file flag with provision bundle JSON)",
    "Cloud license public key bundled for local ECDSA signature verification (no call-home)",
    "lpadmin CLI: keys status/import commands for provision bundle management",
    "lpadmin CLI: license status command for checking license validity",
    "ONPREM_MODE route gating for cloud-only enterprise features",
    "Python3 availability check in key extraction with legacy passphrase fallback",
    "Key file permissions enforcement (chmod 600) on provision bundles"
  ]
}
EOF

# ============================================
# 9a. GENERATE RELEASE NOTES
# ============================================
BUILD_VERSION_CURRENT="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$BUILD_DIR/version.json" | head -1)"
BUILD_DATE_CURRENT="$(sed -n 's/.*"buildDate"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$BUILD_DIR/version.json" | head -1)"
if [ -n "${RELEASE_NOTES_SCRIPT:-}" ] && [ -x "${RELEASE_NOTES_SCRIPT}" ]; then
  "${RELEASE_NOTES_SCRIPT}" \
    --scope "${RELEASE_NOTES_SCOPE:-onprem}" \
    --version "${BUILD_VERSION_CURRENT}" \
    --changelog-file "${RELEASE_CHANGELOG_FILE:-/antigravity/docs/handoverdocs/CHANGELOG.md}" \
    --marker-file "${RELEASE_NOTES_MARKER_FILE:-${RELEASE_NOTES_PACKAGE_DIR:-/antigravity/packages/onprem}/.release-notes-marker-onprem.env}" \
    --state-output "${RELEASE_NOTES_STATE_OUTPUT:-$BUILD_DIR/release-notes-state.env}" \
    --changelog-output "$BUILD_DIR/CHANGELOG_PACKAGE.md" \
    --output "$BUILD_DIR/RELEASE_NOTES.txt"
  echo "   ✅ RELEASE_NOTES.txt generated"
else
  cat > "$BUILD_DIR/RELEASE_NOTES.txt" << EOF
LearnPlay Release Notes
Package Scope: onprem
Package Version: ${BUILD_VERSION_CURRENT}
Build Date (System TZ): $(date +"%Y-%m-%d %H:%M:%S %Z %:z")

Issue: Release notes generator was not configured for this build.
Fix: Added a fallback release notes file so package metadata remains complete.
EOF
  cat > "$BUILD_DIR/CHANGELOG_PACKAGE.md" << EOF
LearnPlay Packaged Changelog
Package Scope: onprem
Package Version: ${BUILD_VERSION_CURRENT}
Build Date (System TZ): $(date +"%Y-%m-%d %H:%M:%S %Z %:z")

No changelog entries were packaged because the changelog generator was not configured.
EOF
  echo "   ⚠️  RELEASE_NOTES.txt fallback generated (no release notes generator configured)"
fi

# ============================================
# 10. COPY CLOUD LICENSE PUBLIC KEY
# ============================================
if [ -f "$PROJECT_ROOT/server/config/cloud-license-public-key.pem" ]; then
  mkdir -p "$BUILD_DIR/server/config"
  cp "$PROJECT_ROOT/server/config/cloud-license-public-key.pem" "$BUILD_DIR/server/config/"
  echo "  ✅ Cloud license public key bundled"
else
  echo "  ⚠️  Warning: cloud-license-public-key.pem not found — license verification may fail on-prem"
fi

# ============================================
# 11. COPY DEPLOYMENT TEMPLATES
# ============================================
echo "📋 Copying deployment files..."
cp "$SCRIPT_DIR/.env.example" "$BUILD_DIR/" 2>/dev/null || true
cp "$SCRIPT_DIR/ecosystem.config.cjs" "$BUILD_DIR/" 2>/dev/null || true
cp "$SCRIPT_DIR/nginx.conf.template" "$BUILD_DIR/" 2>/dev/null || true
EXCLUDE_SCRIPTS="build-onprem.sh generate-schema-sql.sh generate-vault.sh"
script_count=0
for script_file in "$SCRIPT_DIR"/*.sh; do
  script_name="$(basename "$script_file")"
  skip=false
  for exclude in $EXCLUDE_SCRIPTS; do
    if [ "$script_name" = "$exclude" ]; then
      skip=true
      break
    fi
  done
  if [ "$skip" = false ]; then
    cp "$script_file" "$BUILD_DIR/scripts/"
    script_count=$((script_count + 1))
  fi
done
echo "   Copied $script_count scripts to $BUILD_DIR/scripts/"
for doc_file in "$SCRIPT_DIR"/*.md; do
  [ -f "$doc_file" ] && cp "$doc_file" "$BUILD_DIR/"
done
echo "   Copied documentation files"

# Guardrail: devadmin tooling must NEVER ship in installer/update packages.
if [ -f "$BUILD_DIR/scripts/devadmin.sh" ]; then
  echo "❌ Packaging policy violation: dist-onprem/scripts/devadmin.sh must not be bundled"
  exit 1
fi

# Guardrail: WSL/Codex workstation tooling is local-development only and must
# never ship in installer/update packages.
WORKSTATION_TOOLING_FILES="$(find "$BUILD_DIR" \( \
  -path '*/scripts/dev-workspace/*' \
  -o -name 'local-apps.sh' \
  -o -name 'install-local-apps-autostart.sh' \
  -o -name 'bootstrap-wsl-dev.sh' \
  -o -name 'restore-runtime-data.sh' \
  -o -name 'wsl-devadmin.sh' \
  -o -name 'CODEX_DESKTOP_MASTER_PROMPT.md' \
\) -print)"
if [ -n "$WORKSTATION_TOOLING_FILES" ]; then
  echo "   Blocked workstation-only files:"
  printf '%s\n' "$WORKSTATION_TOOLING_FILES" | sed 's#^#   - #'
  echo "❌ Packaging policy violation: WSL/Codex workstation tooling must not be bundled"
  exit 1
fi

# ============================================
# 12. VAULT REMOVED (Mode B no longer supported)
# ============================================
echo "ℹ️  Vault generation skipped — customers must provide their own API keys"
# Remove any leftover vault.enc from build directory
rm -f "$BUILD_DIR/vault.enc"

# ============================================
# 13. EXPORT PLATFORM DATA
# ============================================
echo "📦 Exporting platform data from cloud database..."
if [ -z "${CLOUD_EXPORT_DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set — cannot package on-prem installer without full platform data"
  exit 1
fi

export DATABASE_URL="$CLOUD_EXPORT_DATABASE_URL"
if [ -z "${LEARNPLAY_UPLOAD_DIR:-}" ]; then
  LEARNPLAY_UPLOAD_DIR="$(read_env_value_from_file "/opt/learnplay/cloud/.env" "LEARNPLAY_UPLOAD_DIR" || true)"
fi
if [ -z "${LEARNPLAY_UPLOAD_DIR:-}" ]; then
  LEARNPLAY_UPLOAD_DIR="$(read_env_value_from_file "/opt/learnplay/onprem/.env" "LEARNPLAY_UPLOAD_DIR" || true)"
fi
if [ -z "${LEARNPLAY_UPLOAD_DIR:-}" ]; then
  if [ -d "/opt/learnplay/cloud/uploads" ]; then
    LEARNPLAY_UPLOAD_DIR="/opt/learnplay/cloud/uploads"
  elif [ -d "/opt/learnplay/onprem/uploads" ]; then
    LEARNPLAY_UPLOAD_DIR="/opt/learnplay/onprem/uploads"
  fi
fi
if [ -n "${LEARNPLAY_UPLOAD_DIR:-}" ]; then
  export LEARNPLAY_UPLOAD_DIR
  echo "   ℹ️  Using upload root for export: $LEARNPLAY_UPLOAD_DIR"
fi
bash "$SCRIPT_DIR/export-platform-data.sh" "$BUILD_DIR/data" 2>&1
echo "   ✅ Platform data exported"

echo "🔎 Validating packaged runtime data/assets..."
SEED_COUNT=$(find "$BUILD_DIR/data" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
STYLE_COUNT=$(find "$BUILD_DIR/data/assets/gamma/image-styles" -type f 2>/dev/null | wc -l | tr -d ' ')
THEME_COUNT=$(find "$BUILD_DIR/data/assets/gamma/themes" -type f 2>/dev/null | wc -l | tr -d ' ')
BRANDING_COUNT=$(find "$BUILD_DIR/data/assets/branding/platform" -type f 2>/dev/null | wc -l | tr -d ' ')
ASSET_SUMMARY_FILE="$BUILD_DIR/data/asset-export-summary.json"

if [ "$SEED_COUNT" -lt 30 ]; then
  echo "❌ Missing required seed JSON files in package (found: $SEED_COUNT, required: >=30)"
  exit 1
fi
if [ ! -s "$ASSET_SUMMARY_FILE" ]; then
  echo "❌ Missing asset export summary: $ASSET_SUMMARY_FILE"
  exit 1
fi
ASSET_REF_COUNT="$(sed -n 's/.*"uniqueReferences"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$ASSET_SUMMARY_FILE" | head -1)"
ASSET_COPIED_COUNT="$(sed -n 's/.*"copied"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$ASSET_SUMMARY_FILE" | head -1)"
ASSET_MISSING_COUNT="$(sed -n 's/.*"missing"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$ASSET_SUMMARY_FILE" | head -1)"
ASSET_STAGED_TOTAL="$(sed -n 's/.*"stagedTotal"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$ASSET_SUMMARY_FILE" | head -1)"

ASSET_REF_COUNT="${ASSET_REF_COUNT:-0}"
ASSET_COPIED_COUNT="${ASSET_COPIED_COUNT:-0}"
ASSET_MISSING_COUNT="${ASSET_MISSING_COUNT:-0}"
ASSET_STAGED_TOTAL="${ASSET_STAGED_TOTAL:-0}"

if [ "$ASSET_MISSING_COUNT" -ne 0 ]; then
  echo "❌ Missing required packaged assets (missing: $ASSET_MISSING_COUNT)"
  echo "   Summary: $ASSET_SUMMARY_FILE"
  exit 1
fi
if [ "$ASSET_COPIED_COUNT" -lt "$ASSET_REF_COUNT" ]; then
  echo "❌ Packaged assets are incomplete (copied: $ASSET_COPIED_COUNT, required refs: $ASSET_REF_COUNT)"
  echo "   Summary: $ASSET_SUMMARY_FILE"
  exit 1
fi
if [ "$ASSET_REF_COUNT" -gt 0 ] && [ "$ASSET_STAGED_TOTAL" -lt 1 ]; then
  echo "❌ Packaged assets are missing (stagedTotal: $ASSET_STAGED_TOTAL)"
  echo "   Summary: $ASSET_SUMMARY_FILE"
  exit 1
fi
if [ "$ASSET_REF_COUNT" -eq 0 ] && [ "$ASSET_STAGED_TOTAL" -eq 0 ]; then
  echo "   ⚠️  No platform asset references in seed data; continuing with empty staged assets."
fi
echo "   ✅ Package runtime assets validated (seed=$SEED_COUNT, refs=$ASSET_REF_COUNT, copied=$ASSET_COPIED_COUNT, missing=$ASSET_MISSING_COUNT, stagedTotal=$ASSET_STAGED_TOTAL, styles=$STYLE_COUNT, themes=$THEME_COUNT, branding=$BRANDING_COUNT)"

echo "📦 Bundling baseline runtime public assets..."
BASELINE_UPLOADS_ROOT="$PROJECT_ROOT/uploads/public"
if [ ! -d "$BASELINE_UPLOADS_ROOT/gamma" ]; then
  echo "❌ Missing baseline gamma assets at $BASELINE_UPLOADS_ROOT/gamma"
  exit 1
fi
if [ ! -d "$BASELINE_UPLOADS_ROOT/branding/platform" ]; then
  echo "❌ Missing baseline branding assets at $BASELINE_UPLOADS_ROOT/branding/platform"
  exit 1
fi
mkdir -p "$BUILD_DIR/uploads/public"
cp -R "$BASELINE_UPLOADS_ROOT/gamma" "$BUILD_DIR/uploads/public/"
mkdir -p "$BUILD_DIR/uploads/public/branding"
cp -R "$BASELINE_UPLOADS_ROOT/branding/platform" "$BUILD_DIR/uploads/public/branding/"
BASE_STYLE_COUNT=$(find "$BUILD_DIR/uploads/public/gamma/image-styles" -type f 2>/dev/null | wc -l | tr -d ' ')
BASE_BRANDING_COUNT=$(find "$BUILD_DIR/uploads/public/branding/platform" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$BASE_STYLE_COUNT" -lt 1 ]; then
  echo "❌ Missing baseline gamma style assets in packaged uploads"
  exit 1
fi
if [ "$BASE_BRANDING_COUNT" -lt 1 ]; then
  echo "❌ Missing baseline platform branding assets in packaged uploads"
  exit 1
fi
echo "   ✅ Baseline runtime public assets bundled (gammaStyles=$BASE_STYLE_COUNT, branding=$BASE_BRANDING_COUNT)"

# ============================================
# 14. GENERATE RELEASE MANIFEST (update/install contract)
# ============================================
BUILD_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$BUILD_DIR/version.json" | head -1)"
BUILD_DATE="$(sed -n 's/.*"buildDate"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$BUILD_DIR/version.json" | head -1)"
MIN_SUPPORTED_VERSION="${RELEASE_MIN_SUPPORTED_VERSION:-0}"

cat > "$BUILD_DIR/release-manifest.json" << MANIFEST
{
  "product": "onprem",
  "channel": "enterprise-customer",
  "version": "${BUILD_VERSION}",
  "buildDate": "${BUILD_DATE}",
  "minSupportedVersion": "${MIN_SUPPORTED_VERSION}",
  "requiresMigrationRunner": "scripts/migrate.js",
  "requiredPaths": [
    "server",
    "client",
    "scripts",
    "migrations",
    "data",
    "uploads",
    "version.json",
    "RELEASE_NOTES.txt",
    "CHANGELOG_PACKAGE.md",
    "package.json",
    "release-manifest.json",
    "package-inventory.txt"
  ]
}
MANIFEST

# ============================================
# 15. SOURCE EXCLUSION GATE + PACKAGE INVENTORY
# ============================================
echo "🔒 Running source exclusion gate..."
# Variant contamination guardrails (onprem package must default to onprem runtime mode).
if [ -f "$BUILD_DIR/.env.example" ] && ! grep -Eq '^ONPREM_MODE=true' "$BUILD_DIR/.env.example"; then
  echo "❌ Contamination guard failed: dist-onprem/.env.example missing ONPREM_MODE=true"
  exit 1
fi
if [ -f "$BUILD_DIR/.env.example" ] && grep -Eq '^ONPREM_MODE=false' "$BUILD_DIR/.env.example"; then
  echo "❌ Contamination guard failed: dist-onprem/.env.example sets ONPREM_MODE=false"
  exit 1
fi
if [ -f "$BUILD_DIR/.env.example" ] && ! grep -Eq '^ONPREM_LICENSE_ENFORCEMENT=true' "$BUILD_DIR/.env.example"; then
  echo "❌ Contamination guard failed: dist-onprem/.env.example missing ONPREM_LICENSE_ENFORCEMENT=true"
  exit 1
fi
if [ -f "$BUILD_DIR/.env.example" ] && grep -Eq '^ONPREM_LICENSE_ENFORCEMENT=false' "$BUILD_DIR/.env.example"; then
  echo "❌ Contamination guard failed: dist-onprem/.env.example sets ONPREM_LICENSE_ENFORCEMENT=false"
  exit 1
fi
if find "$BUILD_DIR" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.map' \) | grep -q .; then
  echo "   Blocked files:"
  find "$BUILD_DIR" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.map' \) | sed 's#^#   - #'
  echo "❌ Source exclusion gate failed (TypeScript/source maps found in dist-onprem)"
  exit 1
fi
if find "$BUILD_DIR" -type d \( -name 'src' -o -name '.git' -o -name 'tests' \) | grep -q .; then
  echo "   Blocked directories:"
  find "$BUILD_DIR" -type d \( -name 'src' -o -name '.git' -o -name 'tests' \) | sed 's#^#   - #'
  echo "❌ Source exclusion gate failed (dev/source directories found in dist-onprem)"
  exit 1
fi
echo "   ✅ Source exclusion gate passed"

INVENTORY_FILE="$BUILD_DIR/package-inventory.txt"
TOTAL_FILES=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$BUILD_DIR" | awk '{print $1}')
{
  echo "LearnPlay OnPrem dist-onprem package inventory"
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Total files: $TOTAL_FILES"
  echo "Total size: $TOTAL_SIZE"
  echo ""
  echo "Top-level contents:"
  find "$BUILD_DIR" -mindepth 1 -maxdepth 1 | sort
} > "$INVENTORY_FILE"
echo "   ✅ Package inventory written: $INVENTORY_FILE"

CHECKSUM_FILE="$BUILD_DIR/package-checksums.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$BUILD_DIR"
    find . -type f ! -name "$(basename "$CHECKSUM_FILE")" -print0 \
      | sort -z \
      | xargs -0 sha256sum > "$(basename "$CHECKSUM_FILE")"
  )
  echo "   ✅ Package checksums written: $CHECKSUM_FILE"
else
  echo "   ⚠️  sha256sum not available — skipping checksum manifest"
fi

# Optional cryptographic manifest signing.
if [ -n "${RELEASE_SIGNING_KEY_PATH:-}" ] && [ -f "${RELEASE_SIGNING_KEY_PATH}" ] && command -v openssl >/dev/null 2>&1; then
  echo "🔏 Signing release manifest..."
  openssl dgst -sha256 -sign "${RELEASE_SIGNING_KEY_PATH}" -out "$BUILD_DIR/release-manifest.sig" "$BUILD_DIR/release-manifest.json"
  echo "   ✅ release-manifest.sig created"
else
  echo "ℹ️  Manifest signing skipped (set RELEASE_SIGNING_KEY_PATH to enable)"
fi
if [ -n "${RELEASE_PUBLIC_KEY_PATH:-}" ] && [ -f "${RELEASE_PUBLIC_KEY_PATH}" ]; then
  mkdir -p "$BUILD_DIR/server/config"
  cp "${RELEASE_PUBLIC_KEY_PATH}" "$BUILD_DIR/server/config/release-signing-public.pem"
  echo "   ✅ release-signing-public.pem bundled"
fi

# ============================================
# 16. FINAL SUMMARY
# ============================================
echo ""
echo "✅ On-prem build complete!"
echo "   Output: $BUILD_DIR"
echo "   Version: $(cat "$BUILD_DIR/version.json" 2>/dev/null | grep '"version"' | head -1 || echo 'unknown')"
echo ""
echo "📦 To create a distributable archive:"
echo "   cd $(dirname $BUILD_DIR) && tar czf learnplay-onprem.tar.gz dist-onprem/"
