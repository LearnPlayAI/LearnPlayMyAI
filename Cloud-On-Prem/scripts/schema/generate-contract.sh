#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib.sh"

PRODUCT=""
DB_URL=""
OUT_ENV=""
OUT_JSON=""

while [ $# -gt 0 ]; do
  case "$1" in
    --product)
      PRODUCT="${2:-}"
      shift 2
      ;;
    --db-url)
      DB_URL="${2:-}"
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

if [ -z "$PRODUCT" ] || { [ "$PRODUCT" != "cloud" ] && [ "$PRODUCT" != "onprem" ]; }; then
  echo "Usage: $0 --product cloud|onprem [--db-url <url>] [--out-env <path>] [--out-json <path>]" >&2
  exit 1
fi

if [ -z "$DB_URL" ]; then
  DB_URL="$(resolve_product_db_url "$PRODUCT" || true)"
fi

if [ -z "$DB_URL" ]; then
  echo "❌ Could not resolve DATABASE_URL for product '$PRODUCT'" >&2
  exit 1
fi

if [ -z "$OUT_ENV" ]; then
  OUT_ENV="$PROJECT_ROOT/contracts/schema/${PRODUCT}-contract.env"
fi
if [ -z "$OUT_JSON" ]; then
  OUT_JSON="$PROJECT_ROOT/contracts/schema/${PRODUCT}-contract.json"
fi

mkdir -p "$(dirname "$OUT_ENV")"
mkdir -p "$(dirname "$OUT_JSON")"

TMP_ENV="$(mktemp)"
{
  echo "CONTRACT_PRODUCT=$PRODUCT"
  echo "CONTRACT_VERSION=1"
  echo "CONTRACT_GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  capture_full_contract_env "$DB_URL"
} > "$TMP_ENV"

cp "$TMP_ENV" "$OUT_ENV"

# shellcheck disable=SC1090
. "$TMP_ENV"
cat > "$OUT_JSON" <<JSON
{
  "product": "${CONTRACT_PRODUCT}",
  "version": "${CONTRACT_VERSION}",
  "generatedAt": "${CONTRACT_GENERATED_AT}",
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

rm -f "$TMP_ENV"
echo "✅ Wrote contract env:  $OUT_ENV"
echo "✅ Wrote contract json: $OUT_JSON"
