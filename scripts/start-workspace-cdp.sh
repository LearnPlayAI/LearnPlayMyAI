#!/usr/bin/env bash
set -euo pipefail

# Workspace-local CDP launcher.
# Runs Chrome in this workspace context and forces LearnPlay domains to Caddy.

CDP_PORT="${CDP_PORT:-9222}"
CDP_ADDR="${CDP_ADDR:-127.0.0.1}"
CADDY_IP="${CADDY_IP:-192.168.89.10}"
PROFILE_DIR="${CDP_PROFILE_DIR:-$PWD/.cdp-profile}"
HEADLESS_MODE="${CDP_HEADLESS:-new}"   # new | old | false

CHROME_BIN="${CHROME_BIN:-}"
if [[ -z "$CHROME_BIN" ]]; then
  for b in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$b" >/dev/null 2>&1; then
      CHROME_BIN="$b"
      break
    fi
  done
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "No Chrome/Chromium binary found. Set CHROME_BIN explicitly." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

RESOLVER_RULES="MAP stcloud.learnplay.co.za ${CADDY_IP}, MAP stonprem.learnplay.co.za ${CADDY_IP}"

ARGS=(
  --remote-debugging-address="${CDP_ADDR}"
  --remote-debugging-port="${CDP_PORT}"
  --user-data-dir="${PROFILE_DIR}"
  --no-first-run
  --no-default-browser-check
  --host-resolver-rules="${RESOLVER_RULES}"
  about:blank
)

if [[ "$HEADLESS_MODE" != "false" ]]; then
  ARGS=(--headless="${HEADLESS_MODE}" --disable-gpu "${ARGS[@]}")
fi

run_browser() {
  exec "$CHROME_BIN" "${ARGS[@]}"
}

# If no DISPLAY and xvfb-run is available, use it automatically.
if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
  echo "No DISPLAY detected; launching with xvfb-run"
  exec xvfb-run -a -s "-screen 0 1920x1080x24" "$CHROME_BIN" "${ARGS[@]}"
fi

run_browser
