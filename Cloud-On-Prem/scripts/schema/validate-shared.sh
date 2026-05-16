#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib.sh"

CLOUD_DB_URL=""
ONPREM_DB_URL=""
CONTRACT_ENV="$PROJECT_ROOT/contracts/schema/shared-contract.env"

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

[ -n "$CLOUD_DB_URL" ] || CLOUD_DB_URL="$(resolve_product_db_url cloud || true)"
[ -n "$ONPREM_DB_URL" ] || ONPREM_DB_URL="$(resolve_product_db_url onprem || true)"

[ -n "$CLOUD_DB_URL" ] || { echo "❌ Missing cloud DB URL" >&2; exit 1; }
[ -n "$ONPREM_DB_URL" ] || { echo "❌ Missing onprem DB URL" >&2; exit 1; }
[ -f "$CONTRACT_ENV" ] || { echo "❌ Shared contract env not found: $CONTRACT_ENV" >&2; exit 1; }

# shellcheck disable=SC1090
. "$CONTRACT_ENV"
if [ "${CONTRACT_PRODUCT:-}" != "shared" ]; then
  echo "❌ Contract product mismatch: expected 'shared', got '${CONTRACT_PRODUCT:-unset}'" >&2
  exit 1
fi

if [ -z "${SHARED_TABLES:-}" ]; then
  echo "❌ SHARED_TABLES is missing in shared contract" >&2
  exit 1
fi

TABLE_IN_LIST="$(tr ',' '\n' <<< "$SHARED_TABLES" | build_sql_in_list_from_stdin)"

CLOUD_CURRENT_FILE="$(mktemp)"
ONPREM_CURRENT_FILE="$(mktemp)"
capture_shared_contract_env "$CLOUD_DB_URL" "$TABLE_IN_LIST" > "$CLOUD_CURRENT_FILE"
capture_shared_contract_env "$ONPREM_DB_URL" "$TABLE_IN_LIST" > "$ONPREM_CURRENT_FILE"

# shellcheck disable=SC1090
. "$CLOUD_CURRENT_FILE"
CLOUD_TABLES="$EXPECTED_TABLES"
CLOUD_COLUMNS="$EXPECTED_COLUMNS"
CLOUD_CONSTRAINTS="$EXPECTED_CONSTRAINTS"
CLOUD_INDEXES="$EXPECTED_INDEXES"
CLOUD_ENUMS="$EXPECTED_ENUMS"
CLOUD_SIG="$EXPECTED_SCHEMA_SIG"

# shellcheck disable=SC1090
. "$ONPREM_CURRENT_FILE"
ONPREM_TABLES="$EXPECTED_TABLES"
ONPREM_COLUMNS="$EXPECTED_COLUMNS"
ONPREM_CONSTRAINTS="$EXPECTED_CONSTRAINTS"
ONPREM_INDEXES="$EXPECTED_INDEXES"
ONPREM_ENUMS="$EXPECTED_ENUMS"
ONPREM_SIG="$EXPECTED_SCHEMA_SIG"

# reload expected baseline
# shellcheck disable=SC1090
. "$CONTRACT_ENV"

FAILED=0
check_metric() {
  local label="$1"
  local expected="$2"
  local cloud="$3"
  local onprem="$4"
  if [ "$expected" != "$cloud" ] || [ "$expected" != "$onprem" ]; then
    echo "❌ ${label}: expected=${expected}, cloud=${cloud}, onprem=${onprem}"
    FAILED=1
  else
    echo "✅ ${label}: ${expected}"
  fi
}

echo "Validating shared contract across cloud + onprem..."
check_metric "tables" "$EXPECTED_TABLES" "$CLOUD_TABLES" "$ONPREM_TABLES"
check_metric "columns" "$EXPECTED_COLUMNS" "$CLOUD_COLUMNS" "$ONPREM_COLUMNS"
check_metric "constraints" "$EXPECTED_CONSTRAINTS" "$CLOUD_CONSTRAINTS" "$ONPREM_CONSTRAINTS"
check_metric "indexes" "$EXPECTED_INDEXES" "$CLOUD_INDEXES" "$ONPREM_INDEXES"
check_metric "enums" "$EXPECTED_ENUMS" "$CLOUD_ENUMS" "$ONPREM_ENUMS"
check_metric "schemaSignature" "$EXPECTED_SCHEMA_SIG" "$CLOUD_SIG" "$ONPREM_SIG"

rm -f "$CLOUD_CURRENT_FILE" "$ONPREM_CURRENT_FILE"

if [ "$FAILED" -ne 0 ]; then
  exit 2
fi

echo "✅ Shared contract validation passed"
