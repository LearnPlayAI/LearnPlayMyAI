#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib.sh"

PRODUCT=""
DB_URL=""
CONTRACT_ENV=""

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
    --contract-env)
      CONTRACT_ENV="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$PRODUCT" ] || { [ "$PRODUCT" != "cloud" ] && [ "$PRODUCT" != "onprem" ]; }; then
  echo "Usage: $0 --product cloud|onprem [--db-url <url>] [--contract-env <path>]" >&2
  exit 1
fi

if [ -z "$DB_URL" ]; then
  DB_URL="$(resolve_product_db_url "$PRODUCT" || true)"
fi
if [ -z "$DB_URL" ]; then
  echo "❌ Could not resolve DATABASE_URL for product '$PRODUCT'" >&2
  exit 1
fi

if [ -z "$CONTRACT_ENV" ]; then
  CONTRACT_ENV="$PROJECT_ROOT/contracts/schema/${PRODUCT}-contract.env"
fi

if [ ! -f "$CONTRACT_ENV" ]; then
  echo "❌ Contract file not found: $CONTRACT_ENV" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$CONTRACT_ENV"

if [ "${CONTRACT_PRODUCT:-}" != "$PRODUCT" ]; then
  echo "❌ Contract product mismatch: expected '$PRODUCT', found '${CONTRACT_PRODUCT:-unset}'" >&2
  exit 1
fi

CURRENT_ENV="$(mktemp)"
capture_full_contract_env "$DB_URL" > "$CURRENT_ENV"
# shellcheck disable=SC1090
. "$CURRENT_ENV"

CURRENT_TABLES="$EXPECTED_TABLES"
CURRENT_COLUMNS="$EXPECTED_COLUMNS"
CURRENT_CONSTRAINTS="$EXPECTED_CONSTRAINTS"
CURRENT_INDEXES="$EXPECTED_INDEXES"
CURRENT_ENUMS="$EXPECTED_ENUMS"
CURRENT_SCHEMA_SIG="$EXPECTED_SCHEMA_SIG"

# reload expected contract values
# shellcheck disable=SC1090
. "$CONTRACT_ENV"

FAILED=0
check_metric() {
  local label="$1"
  local expected="$2"
  local current="$3"
  if [ "$expected" != "$current" ]; then
    echo "❌ ${label}: expected=${expected}, current=${current}"
    FAILED=1
  else
    echo "✅ ${label}: ${current}"
  fi
}

echo "Validating $PRODUCT contract against live DB..."
check_metric "tables" "$EXPECTED_TABLES" "$CURRENT_TABLES"
check_metric "columns" "$EXPECTED_COLUMNS" "$CURRENT_COLUMNS"
check_metric "constraints" "$EXPECTED_CONSTRAINTS" "$CURRENT_CONSTRAINTS"
check_metric "indexes" "$EXPECTED_INDEXES" "$CURRENT_INDEXES"
check_metric "enums" "$EXPECTED_ENUMS" "$CURRENT_ENUMS"
check_metric "schemaSignature" "$EXPECTED_SCHEMA_SIG" "$CURRENT_SCHEMA_SIG"

rm -f "$CURRENT_ENV"

if [ "$FAILED" -ne 0 ]; then
  exit 2
fi

echo "✅ Contract validation passed"
