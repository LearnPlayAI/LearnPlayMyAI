#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

resolve_app_dir() {
  if [ -n "${LEARNPLAY_APP_DIR:-}" ] && [ -d "${LEARNPLAY_APP_DIR}" ]; then
    echo "$LEARNPLAY_APP_DIR"
    return 0
  fi
  if [ -f "$SCRIPT_DIR/../.env" ]; then
    cd "$SCRIPT_DIR/.." && pwd
    return 0
  fi
  if [ -f /opt/learnplay/cloud/.env ]; then
    echo /opt/learnplay/cloud
    return 0
  fi
  if [ -f /opt/learnplay/onprem/.env ]; then
    echo /opt/learnplay/onprem
    return 0
  fi
  if [ -f /opt/learnplay/.env ]; then
    echo /opt/learnplay
    return 0
  fi
  echo /opt/learnplay
}

APP_DIR="$(resolve_app_dir)"
SCOPE_ID="learnplay"
case "$APP_DIR" in
  */cloud) SCOPE_ID="cloud" ;;
  */onprem) SCOPE_ID="onprem" ;;
esac
ENV_FILE="$APP_DIR/.env"
NGINX_CONF="/etc/nginx/sites-available/learnplay"
LOG_FILE="/var/log/learnplay/cert-renew-${SCOPE_ID}.log"
STATE_DIR="/var/lib/learnplay"
STATE_FILE="$STATE_DIR/cert-renew-${SCOPE_ID}.state"
STATUS_JSON="$STATE_DIR/cert-status-${SCOPE_ID}.json"
LOCK_FILE="/var/lock/learnplay-cert-renew-${SCOPE_ID}.lock"
CRON_FILE="/etc/cron.d/learnplay-cert-renew-${SCOPE_ID}"
GLOBAL_CONF_FILE="/etc/lppadmin/config.env"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S %Z')] [cert-automation] $*"
  mkdir -p "$(dirname "$LOG_FILE")" >/dev/null 2>&1 || true
  echo "$line" >> "$LOG_FILE" 2>/dev/null || true
  echo "$line"
}

err() {
  echo "ERROR: $*" >&2
}

require_root() {
  if [ "$EUID" -ne 0 ]; then
    err "This command must be run as root."
    exit 1
  fi
}

extract_host() {
  local raw="$1"
  raw="${raw#http://}"
  raw="${raw#https://}"
  raw="${raw%%/*}"
  raw="${raw%%:*}"
  echo "$raw"
}

detect_domain() {
  local domain=""
  if [ -f "$ENV_FILE" ]; then
    domain="$(grep -E '^BASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]' || true)"
    domain="$(extract_host "$domain")"
  fi
  if [ -z "$domain" ] && [ -f "$NGINX_CONF" ]; then
    domain="$(awk '/server_name/ {print $2; exit}' "$NGINX_CONF" 2>/dev/null | tr -d ';' | tr -d '[:space:]' || true)"
  fi
  if [ -z "$domain" ]; then
    domain="localhost"
  fi
  echo "$domain"
}

scope_name() {
  echo "$SCOPE_ID"
}

resolve_cert_from_nginx() {
  if [ -f "$NGINX_CONF" ]; then
    awk '/ssl_certificate[[:space:]]+/ {print $2; exit}' "$NGINX_CONF" 2>/dev/null | tr -d ';' | tr -d '[:space:]'
  fi
}

cert_path() {
  local domain cert
  domain="$(detect_domain)"

  cert="$(resolve_cert_from_nginx || true)"
  if [ -n "$cert" ] && [ -f "$cert" ]; then
    echo "$cert"
    return 0
  fi

  if [ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]; then
    echo "/etc/letsencrypt/live/${domain}/fullchain.pem"
    return 0
  fi

  local scope
  scope="$(scope_name)"
  if [ -f "/etc/ssl/learnplay/${scope}.crt" ]; then
    echo "/etc/ssl/learnplay/${scope}.crt"
    return 0
  fi
  if [ -f "/etc/ssl/learnplay/fullchain.pem" ]; then
    echo "/etc/ssl/learnplay/fullchain.pem"
    return 0
  fi

  echo ""
}

cert_mode() {
  local cert issuer subject
  cert="$(cert_path)"
  if [ -z "$cert" ] || [ ! -f "$cert" ]; then
    echo "missing"
    return 0
  fi
  if [[ "$cert" == /etc/letsencrypt/* ]]; then
    echo "letsencrypt"
    return 0
  fi
  issuer="$(openssl x509 -issuer -noout -in "$cert" 2>/dev/null || true)"
  subject="$(openssl x509 -subject -noout -in "$cert" 2>/dev/null || true)"
  if printf '%s' "$issuer" | grep -qi "Let's Encrypt"; then
    echo "letsencrypt"
  elif [ -n "$issuer" ] && [ "$issuer" = "$subject" ]; then
    echo "self-signed"
  else
    echo "custom"
  fi
}

cert_expiry_raw() {
  local cert
  cert="$(cert_path)"
  if [ -z "$cert" ] || [ ! -f "$cert" ]; then
    echo ""
    return 0
  fi
  openssl x509 -enddate -noout -in "$cert" 2>/dev/null | cut -d= -f2-
}

cert_expiry_iso_utc() {
  local raw
  raw="$(cert_expiry_raw)"
  if [ -z "$raw" ]; then
    echo ""
    return 0
  fi
  date -u -d "$raw" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo ""
}

cert_days_left() {
  local raw end now
  raw="$(cert_expiry_raw)"
  if [ -z "$raw" ]; then
    echo "-1"
    return 0
  fi
  end="$(date -d "$raw" +%s 2>/dev/null || echo "")"
  now="$(date +%s)"
  if [ -z "$end" ]; then
    echo "-1"
    return 0
  fi
  echo $(( (end - now) / 86400 ))
}

threshold_days() {
  local v="${LEARNPLAY_CERT_THRESHOLD_DAYS:-}"
  if [ -z "$v" ] && [ -f "$GLOBAL_CONF_FILE" ]; then
    v="$(grep -E '^CERT_RENEW_THRESHOLD_DAYS=' "$GLOBAL_CONF_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '[:space:]' || true)"
  fi
  if ! [[ "${v:-}" =~ ^[0-9]+$ ]]; then
    v="10"
  fi
  echo "$v"
}

read_state() {
  local key="$1"
  if [ ! -f "$STATE_FILE" ]; then
    return 0
  fi
  grep -E "^${key}=" "$STATE_FILE" 2>/dev/null | tail -1 | cut -d= -f2-
}

set_state() {
  local key="$1" value="$2"
  local tmp
  mkdir -p "$STATE_DIR" >/dev/null 2>&1 || true
  tmp="$(mktemp)"
  if [ -f "$STATE_FILE" ]; then
    awk -F= -v k="$key" '$1 != k {print}' "$STATE_FILE" > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$STATE_FILE"
  rm -f "$tmp"
  chmod 600 "$STATE_FILE"
}

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  printf '%s' "$s"
}

cron_installed() {
  [ -f "$CRON_FILE" ]
}

next_cron_run_local_iso() {
  local target_h=2 target_m=17 now_h now_m today tomorrow
  now_h="$(date +%H)"
  now_m="$(date +%M)"
  if [ "$now_h" -lt "$target_h" ] || { [ "$now_h" -eq "$target_h" ] && [ "$now_m" -lt "$target_m" ]; }; then
    today="$(date '+%Y-%m-%d')"
    date -d "${today} ${target_h}:${target_m}:00" '+%Y-%m-%dT%H:%M:%S%z'
  else
    tomorrow="$(date -d 'tomorrow' '+%Y-%m-%d')"
    date -d "${tomorrow} ${target_h}:${target_m}:00" '+%Y-%m-%dT%H:%M:%S%z'
  fi
}

write_status_json() {
  mkdir -p "$STATE_DIR" >/dev/null 2>&1 || true
  if ! [ -w "$STATE_DIR" ] && ! [ -w "$STATUS_JSON" ]; then
    return 0
  fi
  local domain mode cert expiry_iso days threshold enabled next_run now
  domain="$(detect_domain)"
  mode="$(cert_mode)"
  cert="$(cert_path)"
  expiry_iso="$(cert_expiry_iso_utc)"
  days="$(cert_days_left)"
  threshold="$(threshold_days)"
  enabled="false"
  if cron_installed; then
    enabled="true"
  fi
  next_run=""
  if [ "$enabled" = "true" ]; then
    next_run="$(next_cron_run_local_iso)"
  fi
  now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  cat > "$STATUS_JSON" <<JSON
{
  "generatedAtUtc": "$(json_escape "$now")",
  "appDir": "$(json_escape "$APP_DIR")",
  "domain": "$(json_escape "$domain")",
  "certificateMode": "$(json_escape "$mode")",
  "certificatePath": "$(json_escape "$cert")",
  "expiryUtc": "$(json_escape "$expiry_iso")",
  "daysToExpiry": $days,
  "renewThresholdDays": $threshold,
  "autoRenewEnabled": $enabled,
  "autoRenewCron": "17 2 * * *",
  "nextAutoRenewLocal": "$(json_escape "$next_run")",
  "lastRenewAttemptUtc": "$(json_escape "$(read_state last_renew_attempt_utc)")",
  "lastRenewStatus": "$(json_escape "$(read_state last_renew_status)")",
  "lastRenewMessage": "$(json_escape "$(read_state last_renew_message)")",
  "lastSuccessfulRenewalUtc": "$(json_escape "$(read_state last_successful_renewal_utc)")",
  "lastSuccessfulExpiryUtc": "$(json_escape "$(read_state last_successful_expiry_utc)")",
  "lastFailureUtc": "$(json_escape "$(read_state last_failure_utc)")"
}
JSON
  chmod 644 "$STATUS_JSON"
}

print_status() {
  write_status_json
  local domain mode cert expiry_iso days threshold next_run
  domain="$(detect_domain)"
  mode="$(cert_mode)"
  cert="$(cert_path)"
  expiry_iso="$(cert_expiry_iso_utc)"
  days="$(cert_days_left)"
  threshold="$(threshold_days)"
  next_run=""
  if cron_installed; then
    next_run="$(next_cron_run_local_iso)"
  fi

  echo "LearnPlay Certificate Status"
  echo "  App dir:            $APP_DIR"
  echo "  Domain:             $domain"
  echo "  Certificate mode:   $mode"
  echo "  Certificate path:   ${cert:-missing}"
  if [ "$days" -ge 0 ]; then
    echo "  Days to expiry:     $days"
    echo "  Expiry (UTC):       ${expiry_iso:-unknown}"
  else
    echo "  Days to expiry:     n/a"
    echo "  Expiry (UTC):       unknown"
  fi
  echo "  Renew threshold:    $threshold days"
  if cron_installed; then
    echo "  Auto renew:         enabled ($CRON_FILE)"
    echo "  Next run (local):   ${next_run:-unknown}"
  else
    echo "  Auto renew:         disabled"
  fi
  echo "  Last renew status:  $(read_state last_renew_status)"
  echo "  Last renew message: $(read_state last_renew_message)"
  echo "  Last success UTC:   $(read_state last_successful_renewal_utc)"
  echo "  Last failure UTC:   $(read_state last_failure_utc)"
  echo "  Status JSON:        $STATUS_JSON"
}

renew_internal() {
  local force="$1"
  require_root
  mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR" >/dev/null 2>&1 || true
  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "Another certificate renewal process is already running"
    set_state last_renew_attempt_utc "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    set_state last_renew_status "skipped"
    set_state last_renew_message "another renewal process is already running"
    write_status_json
    return 0
  fi

  local mode domain cert days threshold ts out_file msg expiry_after
  mode="$(cert_mode)"
  domain="$(detect_domain)"
  cert="$(cert_path)"
  days="$(cert_days_left)"
  threshold="$(threshold_days)"
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  set_state last_renew_attempt_utc "$ts"

  if [ "$mode" != "letsencrypt" ]; then
    msg="auto-renew skipped: certificate mode is ${mode}"
    log "$msg"
    set_state last_renew_status "skipped"
    set_state last_renew_message "$msg"
    write_status_json
    return 0
  fi

  if [ -z "$cert" ] || [ ! -f "$cert" ]; then
    msg="auto-renew failed: certificate file not found"
    log "$msg"
    set_state last_renew_status "failed"
    set_state last_renew_message "$msg"
    set_state last_failure_utc "$ts"
    write_status_json
    return 1
  fi

  if [ "$force" != "true" ] && [ "$days" -gt "$threshold" ]; then
    msg="auto-renew skipped: ${days} day(s) remaining (> ${threshold})"
    log "$msg"
    set_state last_renew_status "skipped"
    set_state last_renew_message "$msg"
    write_status_json
    return 0
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    msg="auto-renew failed: certbot command not found"
    log "$msg"
    set_state last_renew_status "failed"
    set_state last_renew_message "$msg"
    set_state last_failure_utc "$ts"
    write_status_json
    return 1
  fi

  out_file="$(mktemp)"
  log "Starting certbot renewal for ${domain} (force=${force}, days_left=${days}, threshold=${threshold})"

  if certbot renew --cert-name "$domain" --quiet --deploy-hook "systemctl reload nginx" >"$out_file" 2>&1 || \
     certbot renew --quiet --deploy-hook "systemctl reload nginx" >>"$out_file" 2>&1; then
    expiry_after="$(cert_expiry_iso_utc)"
    msg="renewal succeeded; new expiry=${expiry_after:-unknown}"
    log "$msg"
    set_state last_renew_status "success"
    set_state last_renew_message "$msg"
    set_state last_successful_renewal_utc "$ts"
    set_state last_successful_expiry_utc "$expiry_after"
    write_status_json
    rm -f "$out_file"
    return 0
  fi

  msg="renewal failed: $(tail -n 1 "$out_file" 2>/dev/null | tr -d '\r')"
  log "$msg"
  cat "$out_file" >> "$LOG_FILE" 2>/dev/null || true
  set_state last_renew_status "failed"
  set_state last_renew_message "$msg"
  set_state last_failure_utc "$ts"
  write_status_json
  rm -f "$out_file"
  return 1
}

install_automation() {
  require_root
  mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR" >/dev/null 2>&1 || true
  local threshold script_to_run
  threshold="$(threshold_days)"
  script_to_run="$SCRIPT_PATH"

  # Default policy: no local certbot autorenew cron. TLS may be offloaded (e.g., Caddy/LB).
  # Set LEARNPLAY_ENABLE_CERT_CRON=true only if you explicitly want host-level certbot cron.
  rm -f "$CRON_FILE" \
    /etc/cron.d/learnplay-cert-renew \
    /etc/cron.d/learnplay-cert-renew-cloud \
    /etc/cron.d/learnplay-cert-renew-onprem \
    /etc/cron.d/learnplay-certbot-renew 2>/dev/null || true
  if [ "${LEARNPLAY_ENABLE_CERT_CRON:-false}" = "true" ]; then
    cat > "$CRON_FILE" <<CRON
SHELL=/bin/bash
PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/bin
17 2 * * * root LEARNPLAY_APP_DIR="$APP_DIR" LEARNPLAY_CERT_THRESHOLD_DAYS="$threshold" "$script_to_run" renew-if-due >> "$LOG_FILE" 2>&1
CRON
    chmod 644 "$CRON_FILE"
    log "Installed certificate auto-renew cron (${CRON_FILE}) with threshold ${threshold} day(s)"
  else
    log "Local certificate auto-renew cron is disabled by policy (LEARNPLAY_ENABLE_CERT_CRON=false)"
  fi

  write_status_json
}

usage() {
  cat <<USAGE
Usage: sudo $(basename "$0") <command>

Commands:
  install         Install/refresh auto-renew cron and refresh status snapshot
  status          Print certificate and renewal status
  status-json     Print the status JSON file
  update-status   Refresh status snapshot without renewal
  renew-if-due    Renew Let's Encrypt cert only when <= threshold days (default 10)
  renew-now       Force renewal attempt now
USAGE
}

cmd="${1:-status}"
case "$cmd" in
  install)
    install_automation
    ;;
  status)
    print_status
    ;;
  status-json)
    write_status_json
    cat "$STATUS_JSON"
    ;;
  update-status)
    write_status_json
    ;;
  renew-if-due)
    renew_internal false
    ;;
  renew-now)
    renew_internal true
    ;;
  *)
    usage
    exit 1
    ;;
esac
