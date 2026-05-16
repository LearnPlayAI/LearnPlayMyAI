#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="${1:-$PROJECT_ROOT/migrations}"
DEPLOYMENT_MODE="${2:-${DEPLOYMENT_MODE:-onprem}}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Migration validation failed: directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

validate_args=(
  "$PROJECT_ROOT/scripts/migration-governance.mjs"
  "validate"
  "--migrations-dir" "$MIGRATIONS_DIR"
  "--deployment-mode" "$DEPLOYMENT_MODE"
)

if [ "${LEARNPLAY_ALLOW_SCHEMA_JOURNAL_REPAIR:-true}" = "true" ]; then
  validate_args+=("--auto-remediate-journal")
fi

if ! node "${validate_args[@]}"; then
  exit 1
fi

echo "✅ Migration validation passed"
