#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-9222}"
URL="http://127.0.0.1:${PORT}/json/version"

if ! curl -fsS "$URL" >/dev/null; then
  echo "CDP not reachable at $URL" >&2
  exit 1
fi

echo "CDP OK: $URL"
curl -fsS "$URL" | sed -n '1,12p'
