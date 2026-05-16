#!/usr/bin/env bash
set -euo pipefail

if command -v k6 >/dev/null 2>&1; then
  exec k6 "$@"
fi

LOCAL_K6="/antigravity/Cloud-On-Prem/.tools/k6/k6"
if [[ -x "$LOCAL_K6" ]]; then
  exec "$LOCAL_K6" "$@"
fi

echo "k6 binary not found. Install k6 globally or place executable at $LOCAL_K6" >&2
exit 127
