#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Backward-compatible non-interactive setup entrypoint used by installer scripts.
if [ "${1:-}" = "setup" ] || [ "${1:-}" = "--setup-admin" ]; then
  shift || true
  exec "$SCRIPT_DIR/lppadmin.sh" --install-command "$@"
fi

exec "$SCRIPT_DIR/lppadmin.sh" "$@"
