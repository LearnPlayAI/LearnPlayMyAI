#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_DIR="${LEARNPLAY_LOCAL_APPS_RUN_DIR:-/tmp/learnplay-local-apps}"
LOG_DIR="${LEARNPLAY_LOCAL_APPS_LOG_DIR:-/tmp/learnplay-local-apps/logs}"

log() { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  bash scripts/dev-workspace/local-apps.sh <command> [cloud|onprem|all]

Commands:
  start      Start cloud and/or onprem if not already running.
  ensure     Same as start; safe to run at Codex/session startup.
  stop       Stop cloud and/or onprem.
  restart    Stop, then start cloud and/or onprem.
  status     Show process and health status.
  logs       Print the log file paths.

Defaults:
  scope      all
  cloud      http://localhost:8010
  onprem     http://localhost:8020
EOF
}

require_scope_or_all() {
  case "${1:-all}" in
    cloud|onprem|all) ;;
    *) die "Expected scope cloud, onprem, or all; got: ${1:-<empty>}" ;;
  esac
}

variants_for_scope() {
  case "${1:-all}" in
    cloud) printf 'cloud\n' ;;
    onprem) printf 'onprem\n' ;;
    all) printf 'cloud\nonprem\n' ;;
    *) die "Expected scope cloud, onprem, or all; got: ${1:-<empty>}" ;;
  esac
}

env_file_for_variant() {
  local variant="$1"
  printf '%s/.env.%s.local' "$APP_DIR" "$variant"
}

pid_file_for_variant() {
  local variant="$1"
  printf '%s/%s.pid' "$RUN_DIR" "$variant"
}

log_file_for_variant() {
  local variant="$1"
  printf '%s/%s.log' "$LOG_DIR" "$variant"
}

read_env_value() {
  local env_file="$1"
  local key="$2"
  [ -f "$env_file" ] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^["'\''"]|["'\''"]$/, "", value)
      print value
      exit
    }
  ' "$env_file"
}

port_for_variant() {
  local variant="$1"
  local env_file port
  env_file="$(env_file_for_variant "$variant")"
  port="$(read_env_value "$env_file" PORT || true)"
  [ -n "$port" ] || die "Could not read PORT from $env_file"
  printf '%s' "$port"
}

pid_for_variant() {
  local variant="$1"
  local pid_file
  pid_file="$(pid_file_for_variant "$variant")"
  [ -f "$pid_file" ] || return 1
  tr -d '[:space:]' < "$pid_file"
}

is_pid_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

pid_matches_variant() {
  local pid="$1"
  local variant="$2"
  [ -r "/proc/$pid/environ" ] || return 1
  tr '\0' '\n' < "/proc/$pid/environ" | grep -qx "LEARNPLAY_LOCAL_APP_VARIANT=$variant"
}

pid_listening_on_port() {
  local port="$1"
  ss -H -ltnp "( sport = :$port )" 2>/dev/null \
    | sed -nE 's/.*pid=([0-9]+).*/\1/p' \
    | head -n 1
}

variant_pid_from_port() {
  local variant="$1"
  local port pid
  port="$(port_for_variant "$variant")"
  pid="$(pid_listening_on_port "$port" || true)"
  if is_pid_running "$pid" && pid_matches_variant "$pid" "$variant"; then
    printf '%s' "$pid"
    return 0
  fi
  return 1
}

variant_pids_from_env() {
  local variant="$1"
  local pid
  for env_path in /proc/[0-9]*/environ; do
    [ -r "$env_path" ] || continue
    pid="${env_path#/proc/}"
    pid="${pid%/environ}"
    if { tr '\0' '\n' < "$env_path"; } 2>/dev/null | grep -qx "LEARNPLAY_LOCAL_APP_VARIANT=$variant"; then
      printf '%s\n' "$pid"
    fi
  done | sort -n | uniq
}

is_variant_running() {
  local variant="$1"
  local pid
  pid="$(pid_for_variant "$variant" || true)"
  is_pid_running "$pid" && pid_matches_variant "$pid" "$variant"
}

health_url_for_variant() {
  local variant="$1"
  printf 'http://127.0.0.1:%s/api/health' "$(port_for_variant "$variant")"
}

wait_for_health() {
  local variant="$1"
  local url deadline
  url="$(health_url_for_variant "$variant")"
  deadline=$((SECONDS + 45))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_variant() {
  local variant="$1"
  local env_file pid_file log_file port pid
  env_file="$(env_file_for_variant "$variant")"
  pid_file="$(pid_file_for_variant "$variant")"
  log_file="$(log_file_for_variant "$variant")"
  port="$(port_for_variant "$variant")"
  [ -f "$env_file" ] || die "Missing $env_file. Run: bash scripts/dev-workspace/bootstrap-wsl-dev.sh env"

  mkdir -p "$RUN_DIR" "$LOG_DIR"
  if is_variant_running "$variant"; then
    if curl -fsS "$(health_url_for_variant "$variant")" >/dev/null 2>&1; then
      log "$variant already healthy at http://localhost:$port (pid $(pid_for_variant "$variant"))"
      return 0
    fi
    warn "$variant process is running but health check failed; restarting it."
    stop_variant "$variant"
  fi

  pid="$(variant_pid_from_port "$variant" || true)"
  if is_pid_running "$pid"; then
    printf '%s\n' "$pid" > "$pid_file"
    if curl -fsS "$(health_url_for_variant "$variant")" >/dev/null 2>&1; then
      log "$variant already healthy at http://localhost:$port (adopted pid $pid)"
      return 0
    fi
    warn "$variant has an orphaned local process on port $port (pid $pid); restarting it."
    stop_variant "$variant"
  fi

  if ss -ltn "( sport = :$port )" | grep -q ":$port"; then
    pid="$(pid_listening_on_port "$port" || true)"
    die "$variant port $port is already in use by another process${pid:+ (pid $pid)}."
  fi

  log "Starting $variant on port $port"
  : > "$log_file"
  setsid bash -lc "
    set -euo pipefail
    source \"\$HOME/.nvm/nvm.sh\"
    nvm use 20 >/dev/null
    cd \"$APP_DIR\"
    export TMPDIR=/tmp
    export TSX_DISABLE_IPC=1
    export LEARNPLAY_LOCAL_APP_VARIANT=\"$variant\"
    export LEARNPLAY_ENV_FILE=\"$env_file\"
    exec npx tsx watch \
      --exclude 'uploads/**' \
      --exclude 'artifacts/**' \
      --exclude 'dist/**' \
      --exclude 'vite.config.ts.timestamp-*' \
      server/index.ts
  " </dev/null >> "$log_file" 2>&1 &
  pid="$!"
  printf '%s\n' "$pid" > "$pid_file"

  if wait_for_health "$variant"; then
    log "$variant healthy at http://localhost:$port"
    return 0
  fi

  warn "$variant did not become healthy. Last log lines:"
  tail -n 80 "$log_file" >&2 || true
  return 1
}

stop_variant() {
  local variant="$1"
  local pid_file pid extra_pid
  pid_file="$(pid_file_for_variant "$variant")"
  pid="$(pid_for_variant "$variant" || true)"
  if ! is_pid_running "$pid" || ! pid_matches_variant "$pid" "$variant"; then
    pid="$(variant_pid_from_port "$variant" || true)"
    if is_pid_running "$pid"; then
      printf '%s\n' "$pid" > "$pid_file"
    fi
  fi
  if ! is_pid_running "$pid" || ! pid_matches_variant "$pid" "$variant"; then
    while IFS= read -r extra_pid; do
      [ -n "$extra_pid" ] || continue
      is_pid_running "$extra_pid" || continue
      log "Stopping orphaned $variant process (pid $extra_pid)"
      kill -- "-$extra_pid" >/dev/null 2>&1 || kill "$extra_pid" >/dev/null 2>&1 || true
    done < <(variant_pids_from_env "$variant")
    sleep 1
    while IFS= read -r extra_pid; do
      [ -n "$extra_pid" ] || continue
      is_pid_running "$extra_pid" || continue
      kill -9 -- "-$extra_pid" >/dev/null 2>&1 || kill -9 "$extra_pid" >/dev/null 2>&1 || true
    done < <(variant_pids_from_env "$variant")
    rm -f "$pid_file"
    log "$variant is not running"
    return 0
  fi

  log "Stopping $variant (pid $pid)"
  kill -- "-$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do
    if ! is_pid_running "$pid"; then
      break
    fi
    sleep 1
  done
  if is_pid_running "$pid"; then
    kill -9 -- "-$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
  fi
  while IFS= read -r extra_pid; do
    [ -n "$extra_pid" ] || continue
    is_pid_running "$extra_pid" || continue
    log "Stopping orphaned $variant process (pid $extra_pid)"
    kill -- "-$extra_pid" >/dev/null 2>&1 || kill "$extra_pid" >/dev/null 2>&1 || true
  done < <(variant_pids_from_env "$variant")
  sleep 1
  while IFS= read -r extra_pid; do
    [ -n "$extra_pid" ] || continue
    is_pid_running "$extra_pid" || continue
    kill -9 -- "-$extra_pid" >/dev/null 2>&1 || kill -9 "$extra_pid" >/dev/null 2>&1 || true
  done < <(variant_pids_from_env "$variant")
  rm -f "$pid_file"
}

status_variant() {
  local variant="$1"
  local port pid pid_file log_file url state
  port="$(port_for_variant "$variant")"
  pid_file="$(pid_file_for_variant "$variant")"
  pid="$(pid_for_variant "$variant" || true)"
  log_file="$(log_file_for_variant "$variant")"
  url="$(health_url_for_variant "$variant")"
  if ! is_pid_running "$pid" || ! pid_matches_variant "$pid" "$variant"; then
    pid="$(variant_pid_from_port "$variant" || true)"
    if is_pid_running "$pid"; then
      printf '%s\n' "$pid" > "$pid_file"
    fi
  fi
  if is_pid_running "$pid" && pid_matches_variant "$pid" "$variant"; then
    state="running"
  else
    rm -f "$pid_file"
    pid=""
    state="stopped"
  fi
  if curl -fsS "$url" >/dev/null 2>&1; then
    printf '%-7s %-8s port=%s pid=%s health=ok log=%s\n' "$variant" "$state" "$port" "${pid:-n/a}" "$log_file"
  else
    printf '%-7s %-8s port=%s pid=%s health=fail log=%s\n' "$variant" "$state" "$port" "${pid:-n/a}" "$log_file"
  fi
}

run_for_scope() {
  local command="$1"
  local scope="${2:-all}"
  local variant
  require_scope_or_all "$scope"
  while IFS= read -r variant; do
    [ -n "$variant" ] || continue
    case "$command" in
      start|ensure) start_variant "$variant" ;;
      stop) stop_variant "$variant" ;;
      restart) stop_variant "$variant"; start_variant "$variant" ;;
      status) status_variant "$variant" ;;
      logs) printf '%-7s %s\n' "$variant" "$(log_file_for_variant "$variant")" ;;
      *) die "Unknown command: $command" ;;
    esac
  done < <(variants_for_scope "$scope")
}

main() {
  local command="${1:-}"
  local scope="${2:-all}"
  case "$command" in
    start|ensure|stop|restart|status|logs) run_for_scope "$command" "$scope" ;;
    help|-h|--help|"") usage ;;
    *) usage; die "Unknown command: $command" ;;
  esac
}

main "$@"
