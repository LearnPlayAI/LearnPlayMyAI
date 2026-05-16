#!/usr/bin/env bash
set -euo pipefail

CLOUD_DIR="/antigravity/Cloud-On-Prem/cloud"
ONPREM_DIR="/antigravity/Cloud-On-Prem/onprem"

usage() {
  echo "Usage: $0 [cloud-to-onprem|onprem-to-cloud]"
  exit 1
}

MODE="${1:-cloud-to-onprem}"
case "$MODE" in
  cloud-to-onprem)
    SRC="$CLOUD_DIR"
    DST="$ONPREM_DIR"
    ;;
  onprem-to-cloud)
    SRC="$ONPREM_DIR"
    DST="$CLOUD_DIR"
    ;;
  *)
    usage
    ;;
esac

for f in lppadmin.sh sync-admin-parity.sh; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "$DST/$f"
    chmod +x "$DST/$f"
    echo "Synced: $f"
  fi
done

echo "Parity sync complete: $MODE"
