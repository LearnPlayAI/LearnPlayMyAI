#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib.sh"

CLOUD_DB_URL=""
ONPREM_DB_URL=""
TABLES_FILE="$PROJECT_ROOT/contracts/schema/shared-tables.txt"
OUT_ENV="$PROJECT_ROOT/contracts/schema/shared-contract.env"
OUT_JSON="$PROJECT_ROOT/contracts/schema/shared-contract.json"

while [ $# -gt 0 ]; do
  case "$1" in
    --cloud-db-url)
      CLOUD_DB_URL="${2:-}"
      shift 2
      ;;
    --onprem-db-url)
      ONPREM_DB_URL="${2:-}"
      shift 2
      ;;
    --tables-file)
      TABLES_FILE="${2:-}"
      shift 2
      ;;
    --out-env)
      OUT_ENV="${2:-}"
      shift 2
      ;;
    --out-json)
      OUT_JSON="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[ -n "$CLOUD_DB_URL" ] || CLOUD_DB_URL="$(resolve_product_db_url cloud || true)"
[ -n "$ONPREM_DB_URL" ] || ONPREM_DB_URL="$(resolve_product_db_url onprem || true)"

[ -n "$CLOUD_DB_URL" ] || { echo "❌ Missing cloud DB URL" >&2; exit 1; }
[ -n "$ONPREM_DB_URL" ] || { echo "❌ Missing onprem DB URL" >&2; exit 1; }
[ -f "$TABLES_FILE" ] || { echo "❌ Shared tables file not found: $TABLES_FILE" >&2; exit 1; }

TABLES_TMP="$(mktemp)"
sanitize_table_list "$TABLES_FILE" > "$TABLES_TMP"
if [ ! -s "$TABLES_TMP" ]; then
  echo "❌ Shared tables list is empty: $TABLES_FILE" >&2
  rm -f "$TABLES_TMP"
  exit 1
fi

TABLE_IN_LIST="$(build_sql_in_list_from_stdin < "$TABLES_TMP")"
TABLES_CSV="$(paste -sd, "$TABLES_TMP")"
TABLES_JSON_ARRAY="$(awk 'BEGIN{first=1; printf "["} { gsub(/"/, "\\\"", $0); if (!first) printf ","; printf "\"%s\"", $0; first=0 } END{ printf "]" }' "$TABLES_TMP")"

# Ensure table list exists on both sides before generating baseline
for DB in "$CLOUD_DB_URL" "$ONPREM_DB_URL"; do
  missing_count="$(psql "$DB" -Atc "SELECT count(*) FROM (SELECT unnest(string_to_array('${TABLES_CSV}', ',')) AS tbl) t LEFT JOIN information_schema.tables i ON i.table_schema='public' AND i.table_name=t.tbl WHERE i.table_name IS NULL;" | tr -d '[:space:]')"
  if [ "${missing_count:-0}" != "0" ]; then
    echo "❌ Shared table list contains table(s) missing from DB: $DB" >&2
    rm -f "$TABLES_TMP"
    exit 1
  fi
done

mkdir -p "$(dirname "$OUT_ENV")" "$(dirname "$OUT_JSON")"

TMP_ENV="$(mktemp)"
{
  echo "CONTRACT_PRODUCT=shared"
  echo "CONTRACT_VERSION=1"
  echo "CONTRACT_GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "SHARED_TABLES=${TABLES_CSV}"
  capture_shared_contract_env "$CLOUD_DB_URL" "$TABLE_IN_LIST"
} > "$TMP_ENV"

cp "$TMP_ENV" "$OUT_ENV"
# shellcheck disable=SC1090
. "$TMP_ENV"
cat > "$OUT_JSON" <<JSON
{
  "product": "shared",
  "version": "${CONTRACT_VERSION}",
  "generatedAt": "${CONTRACT_GENERATED_AT}",
  "tables": ${TABLES_JSON_ARRAY},
  "expected": {
    "tables": ${EXPECTED_TABLES},
    "columns": ${EXPECTED_COLUMNS},
    "constraints": ${EXPECTED_CONSTRAINTS},
    "indexes": ${EXPECTED_INDEXES},
    "enums": ${EXPECTED_ENUMS},
    "schemaSignature": "${EXPECTED_SCHEMA_SIG}"
  }
}
JSON

rm -f "$TMP_ENV" "$TABLES_TMP"
echo "✅ Wrote shared contract env:  $OUT_ENV"
echo "✅ Wrote shared contract json: $OUT_JSON"
