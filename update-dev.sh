#!/usr/bin/env bash
set -euo pipefail

# Reusable updater for this DEV runtime.
#
# DEV now runs from the WSL source workspace. update-dev therefore activates
# current source by restarting the local app process(es), not by building and
# applying a package into /opt/learnplay on the old stack host.

PKG_DIR="${PKG_DIR:-}"
PKG_PATH="${PKG_PATH:-}"
COMPONENT="${COMPONENT:-all}"      # all | app-db | lppadmin
SCOPE="${SCOPE:-cloud}"            # cloud | onprem
DO_BUILD=1
LOCAL_APPS_SCRIPT="/antigravity/Cloud-On-Prem/scripts/dev-workspace/local-apps.sh"

usage() {
  cat <<EOF
Usage:
  $0 [options]

Options:
  --pkg-dir <dir>           Accepted for compatibility; ignored on WSL DEV
  --package <file>          Accepted for compatibility; ignored on WSL DEV
  --scope <cloud|onprem>    Runtime scope to update (default: ${SCOPE})
  --component <mode>        Accepted for compatibility; WSL DEV restarts app source
  --skip-build              Accepted for compatibility; WSL DEV never builds here
  -h, --help                Show this help

Examples:
  $0
  $0 --scope onprem
  $0 --skip-build
  $0 --component app-db
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pkg-dir) PKG_DIR="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --package) PKG_PATH="$2"; shift 2 ;;
    --component) COMPONENT="$2"; shift 2 ;;
    --skip-build) DO_BUILD=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

case "$COMPONENT" in
  all|app-db|lppadmin) ;;
  *) echo "Invalid --component '$COMPONENT' (expected all|app-db|lppadmin)" >&2; exit 1 ;;
esac

case "$SCOPE" in
  cloud|onprem) ;;
  *) echo "Invalid --scope '$SCOPE' (expected cloud|onprem)" >&2; exit 1 ;;
esac

if [[ ! -x "$LOCAL_APPS_SCRIPT" ]]; then
  echo "Local WSL app supervisor not found or not executable: $LOCAL_APPS_SCRIPT" >&2
  exit 1
fi

if [[ -n "$PKG_PATH" || -n "$PKG_DIR" || "$DO_BUILD" -eq 0 || "$COMPONENT" != "all" ]]; then
  echo "Note: package/component/build flags are compatibility no-ops for WSL DEV."
fi

echo "[1/2] Activating current source in WSL DEV (${SCOPE})..."
bash "$LOCAL_APPS_SCRIPT" restart "$SCOPE"

echo "[2/2] WSL DEV status..."
bash "$LOCAL_APPS_SCRIPT" status "$SCOPE"

echo "Completed WSL DEV ${SCOPE^^} source update on host: $(hostname -f 2>/dev/null || hostname)"
