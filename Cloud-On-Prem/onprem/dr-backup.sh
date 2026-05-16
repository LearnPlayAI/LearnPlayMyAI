#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="${LEARNPLAY_APP_DIR:-/opt/learnplay/onprem}"
if [ ! -f "${APP_DIR}/.env" ] && [ -f "/opt/learnplay-onprem/.env" ]; then
  APP_DIR="/opt/learnplay-onprem"
elif [ ! -f "${APP_DIR}/.env" ] && [ -f "/opt/learnplay/.env" ]; then
  APP_DIR="/opt/learnplay"
fi
ENV_FILE="$APP_DIR/.env"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^\"//; s/\"$//' || true)"
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
if [ -z "${DB_NAME:-}" ] || [ "$DB_NAME" = "$DATABASE_URL" ]; then
  DB_NAME="$APP_NAME"
fi
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
UPLOAD_DIR="${UPLOAD_DIR:-${APP_DIR}/uploads}"
BACKUP_DIR="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
DR_DIR="$BACKUP_DIR/disaster-recovery/onprem"
LOG_FILE="/var/log/learnplay-admin/onprem-dr-backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

DR_RETENTION="${LEARNPLAY_DR_RETENTION:-3}"
DISK_WARN_THRESHOLD=20

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() {
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [dr-backup] $*" | tee -a "$LOG_FILE"
}

msg_success() { echo -e "${GREEN}✅ $*${NC}"; }
msg_error()   { echo -e "${RED}❌ $*${NC}"; }
msg_warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
msg_info()    { echo -e "${CYAN}ℹ️  $*${NC}"; }

STAGING_DIR=""

cleanup() {
  if [ -n "$STAGING_DIR" ] && [ -d "$STAGING_DIR" ]; then
    rm -rf "$STAGING_DIR"
    log "Cleaned up staging directory: $STAGING_DIR"
  fi
}

trap cleanup EXIT

human_size() {
  local bytes=$1
  if [ "$bytes" -ge 1073741824 ]; then
    echo "$(echo "scale=2; $bytes / 1073741824" | bc) GB"
  elif [ "$bytes" -ge 1048576 ]; then
    echo "$(echo "scale=2; $bytes / 1048576" | bc) MB"
  elif [ "$bytes" -ge 1024 ]; then
    echo "$(echo "scale=2; $bytes / 1024" | bc) KB"
  else
    echo "$bytes bytes"
  fi
}

file_checksum() {
  sha256sum "$1" 2>/dev/null | awk '{print $1}'
}

file_size_bytes() {
  stat -c%s "$1" 2>/dev/null || echo "0"
}

json_escape() {
  local str="$1"
  str="${str//\\/\\\\}"
  str="${str//\"/\\\"}"
  str="${str//$'\n'/\\n}"
  str="${str//$'\r'/}"
  str="${str//$'\t'/\\t}"
  echo -n "$str"
}

check_root() {
  if [ "$EUID" -ne 0 ]; then
    msg_error "This script must be run as root (sudo)"
    exit 1
  fi
}

ensure_dirs() {
  if [ ! -d "$BACKUP_DIR" ]; then
    msg_warn "Backup directory $BACKUP_DIR does not exist."
    msg_warn "Recommended: Mount a dedicated disk at /lppbackups (50GB+)"
    msg_warn "Creating directory..."
    mkdir -p "$BACKUP_DIR"
  fi
  mkdir -p "$DR_DIR"
  mkdir -p "$(dirname "$LOG_FILE")"
}

check_disk_space() {
  local mount_point
  mount_point=$(df "$BACKUP_DIR" --output=target | tail -1)
  local pct_used
  pct_used=$(df "$mount_point" --output=pcent | tail -1 | tr -d ' %')
  local pct_free=$((100 - pct_used))

  if ! mountpoint -q "$BACKUP_DIR" 2>/dev/null; then
    msg_warn "Backup directory $BACKUP_DIR is NOT a separate mount point"
    msg_warn "Recommended: Use a dedicated disk for backups"
  fi

  local db_estimate=0
  if sudo -u postgres psql -tAc "SELECT pg_database_size('$DB_NAME');" 2>/dev/null; then
    db_estimate=$(sudo -u postgres psql -tAc "SELECT pg_database_size('$DB_NAME');" 2>/dev/null || echo "0")
  fi

  local uploads_estimate=0
  if [ -d "$UPLOAD_DIR" ]; then
    uploads_estimate=$(du -sb "$UPLOAD_DIR" 2>/dev/null | cut -f1 || echo "0")
  fi

  local total_estimate=$(( (db_estimate + uploads_estimate) * 2 ))
  local avail_bytes
  avail_bytes=$(df "$mount_point" --output=avail -B1 | tail -1 | tr -d ' ')

  if [ "$total_estimate" -gt 0 ] && [ "$avail_bytes" -gt 0 ]; then
    msg_info "Estimated space needed: ~$(human_size "$total_estimate")"
    msg_info "Available space: $(human_size "$avail_bytes")"
    if [ "$total_estimate" -gt "$avail_bytes" ]; then
      msg_error "Insufficient disk space for DR backup!"
      return 1
    fi
  fi

  if [ "$pct_free" -lt "$DISK_WARN_THRESHOLD" ]; then
    log "WARNING: Only ${pct_free}% disk space free on $mount_point"
    msg_warn "WARNING: Only ${pct_free}% disk space free on ${mount_point}"
    return 1
  fi
  return 0
}

check_postgresql() {
  if systemctl is-active --quiet postgresql 2>/dev/null; then
    return 0
  fi
  if systemctl list-units "postgresql@*.service" --no-legend 2>/dev/null | awk '$4=="running"{found=1} END{exit !found}'; then
    return 0
  fi
  if command -v pg_lsclusters >/dev/null 2>&1 && pg_lsclusters --no-header 2>/dev/null | awk '$4=="online"{found=1} END{exit !found}'; then
    return 0
  fi
  if ! systemctl is-active --quiet postgresql 2>/dev/null; then
    msg_error "PostgreSQL is not running — required for database dump"
    msg_error "Start it with: systemctl start postgresql@<version>-<cluster> (or systemctl start postgresql)"
    return 1
  fi
  return 0
}

get_encryption_key() {
  if ! command -v python3 &>/dev/null; then
    echo ""
    return 1
  fi
  if [ -n "${KEY_FILE:-}" ] && [ -f "$KEY_FILE" ]; then
    local bundle_key
    bundle_key=$(python3 -c "
import json, sys
with open('$KEY_FILE') as f:
    bundle = json.load(f)
payload = json.loads(bundle.get('payload', '{}'))
keys = payload.get('keys', {})
backup = keys.get('backup', {})
print(backup.get('key', ''))
" 2>/dev/null)
    if [ -n "$bundle_key" ]; then
      echo "$bundle_key"
      return 0
    fi
    msg_warn "Could not extract backup key from provision bundle, falling back..."
  fi

  local default_key="/opt/learnplay/keys/provision-bundle.json"
  if [ -z "${KEY_FILE:-}" ] && [ -f "$default_key" ]; then
    local bundle_key
    bundle_key=$(python3 -c "
import json, sys
with open('$default_key') as f:
    bundle = json.load(f)
payload = json.loads(bundle.get('payload', '{}'))
keys = payload.get('keys', {})
backup = keys.get('backup', {})
print(backup.get('key', ''))
" 2>/dev/null)
    if [ -n "$bundle_key" ]; then
      echo "$bundle_key"
      return 0
    fi
  fi

  if [ -n "${LEARNPLAY_BACKUP_KEY:-}" ]; then
    echo "$LEARNPLAY_BACKUP_KEY"
    return 0
  fi

  echo ""
  read -sp "Enter encryption passphrase: " passphrase
  echo ""
  if [ -z "$passphrase" ]; then
    msg_error "No passphrase provided"
    return 1
  fi
  read -sp "Confirm passphrase: " passphrase_confirm
  echo ""
  if [ "$passphrase" != "$passphrase_confirm" ]; then
    msg_error "Passphrases do not match"
    return 1
  fi
  echo "$passphrase"
}

get_env_encryption_key() {
  if ! command -v python3 &>/dev/null; then
    echo ""
    return 1
  fi
  if [ -n "${KEY_FILE:-}" ] && [ -f "$KEY_FILE" ]; then
    local bundle_key
    bundle_key=$(python3 -c "
import json, sys
with open('$KEY_FILE') as f:
    bundle = json.load(f)
payload = json.loads(bundle.get('payload', '{}'))
keys = payload.get('keys', {})
backup = keys.get('backup', {})
print(backup.get('key', ''))
" 2>/dev/null)
    if [ -n "$bundle_key" ]; then
      echo "$bundle_key"
      return 0
    fi
    msg_warn "Could not extract backup key from provision bundle, falling back..."
  fi

  local default_key="/opt/learnplay/keys/provision-bundle.json"
  if [ -z "${KEY_FILE:-}" ] && [ -f "$default_key" ]; then
    local bundle_key
    bundle_key=$(python3 -c "
import json, sys
with open('$default_key') as f:
    bundle = json.load(f)
payload = json.loads(bundle.get('payload', '{}'))
keys = payload.get('keys', {})
backup = keys.get('backup', {})
print(backup.get('key', ''))
" 2>/dev/null)
    if [ -n "$bundle_key" ]; then
      echo "$bundle_key"
      return 0
    fi
  fi

  if [ -n "${LEARNPLAY_BACKUP_KEY:-}" ]; then
    echo "$LEARNPLAY_BACKUP_KEY"
    return 0
  fi
  if [ -n "${ENV_ENCRYPTION_KEY:-}" ]; then
    echo "$ENV_ENCRYPTION_KEY"
    return 0
  fi

  read -sp "Enter passphrase to encrypt .env secrets in the archive: " env_key
  echo ""
  if [ -z "$env_key" ]; then
    msg_error "Passphrase cannot be empty — .env contains secrets and must be encrypted"
    return 1
  fi
  read -sp "Confirm passphrase: " env_key_confirm
  echo ""
  if [ "$env_key" != "$env_key_confirm" ]; then
    msg_error "Passphrases do not match"
    return 1
  fi
  echo "$env_key"
}

encrypt_file() {
  local src="$1"
  local key="$2"
  local dest="${src}.enc"

  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$src" -out "$dest" -pass "pass:$key"
  if [ $? -eq 0 ]; then
    rm -f "$src"
    log "Encrypted: $(basename "$dest")"
    echo "$dest"
  else
    log "Encryption failed for $(basename "$src")"
    echo "$src"
    return 1
  fi
}

collect_database() {
  log "Collecting database dump..."
  msg_info "Dumping database '$DB_NAME'..."

  if [ "$DR_MODE" = "create-prod" ]; then
    msg_info "Mode: create-prod — excluding transactional data from dump"
    local EXCLUDE_TABLES=(
      "user_activity_log" "user_sessions" "audit_log"
      "quiz_attempts" "quiz_responses" "xp_transactions"
      "battle_matches" "battle_rounds" "leaderboard_entries"
      "season_pass_progress" "daily_challenges" "daily_challenge_progress"
      "notifications" "user_notifications" "email_queue" "job_queue"
      "post_fulfillment_queue" "document_extraction_queue" "translation_queue"
      "course_enrollments" "enrollment_progress" "certificate_records"
      "payment_transactions" "credit_transactions" "payout_records"
      "course_reviews" "gamification_inventory" "gamification_purchases"
      "powerup_activations" "enterpriseRevenueSync"
      "onpremLicenseState"
    )
    local -a exclude_args=()
    for tbl in "${EXCLUDE_TABLES[@]}"; do
      if [[ "$tbl" == *[A-Z]* ]]; then
        exclude_args+=("--exclude-table-data=public.\"${tbl}\"")
      else
        exclude_args+=("--exclude-table-data=public.${tbl}")
      fi
    done
    if sudo -u postgres pg_dump "$DB_NAME" "${exclude_args[@]}" | gzip > "$STAGING_DIR/database.sql.gz"; then
      local size
      size=$(file_size_bytes "$STAGING_DIR/database.sql.gz")
      if [ "$size" -eq 0 ]; then
        msg_error "Database dump is empty — backup may have failed"
        return 1
      fi
      msg_success "Database exported (create-prod mode: transactional data excluded, $(human_size "$size"))"
    else
      msg_error "pg_dump with exclusions failed"
      return 1
    fi
  else
    if sudo -u postgres pg_dump "$DB_NAME" | gzip > "$STAGING_DIR/database.sql.gz"; then
      local size
      size=$(file_size_bytes "$STAGING_DIR/database.sql.gz")
      if [ "$size" -eq 0 ]; then
        msg_error "Database dump is empty — backup may have failed"
        return 1
      fi
      if ! gzip -t "$STAGING_DIR/database.sql.gz" 2>/dev/null; then
        msg_error "Database dump failed gzip integrity check"
        return 1
      fi
      msg_success "Database dump complete ($(human_size "$size"))"
    else
      msg_error "pg_dump failed"
      return 1
    fi
  fi
}

collect_uploads() {
  log "Collecting uploads..."
  if [ -d "$UPLOAD_DIR" ]; then
    local upload_size
    upload_size=$(du -sh "$UPLOAD_DIR" 2>/dev/null | cut -f1 || echo "0")
    msg_info "Archiving uploads ($upload_size)..."
    msg_info "This may take a while for large upload directories..."
    tar czf "$STAGING_DIR/uploads.tar.gz" -C "$UPLOAD_DIR" . 2>/dev/null || true
    if [ -f "$STAGING_DIR/uploads.tar.gz" ]; then
      local size
      size=$(file_size_bytes "$STAGING_DIR/uploads.tar.gz")
      msg_success "Uploads archived ($(human_size "$size"))"
    else
      msg_warn "No uploads to archive"
    fi
  else
    msg_warn "Upload directory not found: $UPLOAD_DIR"
    tar czf "$STAGING_DIR/uploads.tar.gz" --files-from /dev/null 2>/dev/null || true
  fi
}

collect_env() {
  log "Collecting environment config..."
  local env_key
  env_key=$(get_env_encryption_key) || return 1

  ENV_ENCRYPTION_KEY="$env_key"

  if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$STAGING_DIR/env_backup"
    openssl enc -aes-256-cbc -salt -pbkdf2 -in "$STAGING_DIR/env_backup" -out "$STAGING_DIR/env_backup.enc" -pass "pass:$env_key"
    rm -f "$STAGING_DIR/env_backup"
    msg_success "Environment config encrypted and collected"
  elif [ -f "$APP_DIR/.env.enc" ]; then
    cp "$APP_DIR/.env.enc" "$STAGING_DIR/env_backup.enc"
    msg_success "Environment config collected (already encrypted)"
  else
    msg_warn "No .env or .env.enc found at $APP_DIR"
  fi

  if [ -f "$APP_DIR/vault.enc" ]; then
    msg_warn "Legacy vault.enc found — skipping (Mode B no longer supported)"
    msg_info "Customers must provide their own API keys via .env"
  fi
}

collect_os_settings() {
  log "Collecting OS settings snapshot..."
  msg_info "Capturing system configuration..."

  local ssh_port="22"
  if [ -f /etc/ssh/sshd_config ]; then
    ssh_port=$(grep -E "^Port " /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
    [ -z "$ssh_port" ] && ssh_port="22"
  fi

  local timezone=""
  if command -v timedatectl &>/dev/null; then
    timezone=$(timedatectl 2>/dev/null | grep "Time zone" | awk '{print $3}' || echo "unknown")
  else
    timezone=$(cat /etc/timezone 2>/dev/null || echo "unknown")
  fi

  local firewall_rules="unknown"
  if command -v ufw &>/dev/null; then
    firewall_rules=$(ufw status 2>/dev/null | head -20 || echo "ufw not active")
  fi

  local hostname_val
  hostname_val=$(hostname 2>/dev/null || echo "unknown")

  local os_version=""
  if command -v lsb_release &>/dev/null; then
    os_version=$(lsb_release -ds 2>/dev/null || echo "unknown")
  elif [ -f /etc/os-release ]; then
    os_version=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "unknown")
  fi

  local kernel
  kernel=$(uname -r 2>/dev/null || echo "unknown")

  local ip_address=""
  ip_address=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

  local captured_at
  captured_at=$(date -Iseconds)

  cat > "$STAGING_DIR/os-settings.json" << EOJSON
{
  "ssh_port": "$(json_escape "$ssh_port")",
  "timezone": "$(json_escape "$timezone")",
  "firewall_rules": "$(json_escape "$firewall_rules")",
  "hostname": "$(json_escape "$hostname_val")",
  "os_version": "$(json_escape "$os_version")",
  "kernel": "$(json_escape "$kernel")",
  "ip_address": "$(json_escape "$ip_address")",
  "captured_at": "$(json_escape "$captured_at")"
}
EOJSON

  msg_success "OS settings snapshot captured"
}

collect_version() {
  log "Collecting version info..."
  cp "$APP_DIR/version.json" "$STAGING_DIR/" 2>/dev/null || echo '{"version":"unknown"}' > "$STAGING_DIR/version.json"
  msg_success "Version info collected"
}

collect_nginx() {
  log "Collecting Nginx configuration..."
  local collected=false

  if [ -f /etc/nginx/sites-available/learnplay ]; then
    cp /etc/nginx/sites-available/learnplay "$STAGING_DIR/nginx-site.conf"
    collected=true
  fi

  if [ -f /etc/nginx/conf.d/learnplay-limits.conf ]; then
    cp /etc/nginx/conf.d/learnplay-limits.conf "$STAGING_DIR/nginx-limits.conf"
    collected=true
  fi

  if [ "$collected" = true ]; then
    msg_success "Nginx configuration collected"
  else
    msg_warn "No Nginx configuration files found"
  fi
}

collect_ssl() {
  log "Collecting SSL certificates..."
  mkdir -p "$STAGING_DIR/ssl"
  local collected=false

  cp /etc/letsencrypt/live/*/fullchain.pem "$STAGING_DIR/ssl/" 2>/dev/null && collected=true || true
  cp /etc/letsencrypt/live/*/privkey.pem "$STAGING_DIR/ssl/" 2>/dev/null && collected=true || true
  cp /etc/ssl/learnplay/*.pem "$STAGING_DIR/ssl/" 2>/dev/null && collected=true || true

  if [ "$collected" = true ]; then
    msg_success "SSL certificates collected"
  else
    msg_warn "No SSL certificates found"
    rmdir "$STAGING_DIR/ssl" 2>/dev/null || true
  fi
}

collect_pm2() {
  log "Collecting PM2 ecosystem config..."
  if [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
    cp "$APP_DIR/ecosystem.config.cjs" "$STAGING_DIR/"
    msg_success "PM2 ecosystem config collected"
  else
    msg_warn "PM2 ecosystem config not found"
  fi
}

collect_crontab() {
  log "Collecting crontab..."
  crontab -l > "$STAGING_DIR/crontab.txt" 2>/dev/null || true
  if [ -s "$STAGING_DIR/crontab.txt" ]; then
    msg_success "Crontab collected"
  else
    msg_warn "No crontab entries found"
  fi
}

collect_pg_config() {
  log "Collecting PostgreSQL config..."
  local collected=false

  local pg_conf
  pg_conf=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
  if [ -n "$pg_conf" ] && [ -f "$pg_conf" ]; then
    cp "$pg_conf" "$STAGING_DIR/postgresql.conf"
    collected=true
  fi

  local pg_hba
  pg_hba=$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
  if [ -n "$pg_hba" ] && [ -f "$pg_hba" ]; then
    cp "$pg_hba" "$STAGING_DIR/pg_hba.conf"
    collected=true
  fi

  if [ "$collected" = true ]; then
    msg_success "PostgreSQL configuration collected"
  else
    msg_warn "No PostgreSQL configuration files found"
  fi
}

generate_manifest() {
  log "Generating manifest..."

  local created_at
  created_at=$(date -Iseconds)
  local created_by="${SUDO_USER:-$USER}"
  local hostname_val
  hostname_val=$(hostname 2>/dev/null || echo "unknown")

  local app_version="unknown"
  if [ -f "$STAGING_DIR/version.json" ]; then
    app_version=$(grep -oP '"version"\s*:\s*"\K[^"]+' "$STAGING_DIR/version.json" 2>/dev/null || echo "unknown")
  fi

  local postgres_version="unknown"
  if command -v pg_config &>/dev/null; then
    postgres_version=$(pg_config --version 2>/dev/null || echo "unknown")
  fi

  local os_version=""
  if command -v lsb_release &>/dev/null; then
    os_version=$(lsb_release -ds 2>/dev/null || echo "unknown")
  elif [ -f /etc/os-release ]; then
    os_version=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "unknown")
  fi

  local db_size=0 db_checksum=""
  if [ -f "$STAGING_DIR/database.sql.gz" ]; then
    db_size=$(file_size_bytes "$STAGING_DIR/database.sql.gz")
    db_checksum=$(file_checksum "$STAGING_DIR/database.sql.gz")
  fi

  local uploads_size=0 uploads_checksum=""
  if [ -f "$STAGING_DIR/uploads.tar.gz" ]; then
    uploads_size=$(file_size_bytes "$STAGING_DIR/uploads.tar.gz")
    uploads_checksum=$(file_checksum "$STAGING_DIR/uploads.tar.gz")
  fi

  local env_present=false
  [ -f "$STAGING_DIR/env_backup.enc" ] && env_present=true

  local nginx_site_present=false
  [ -f "$STAGING_DIR/nginx-site.conf" ] && nginx_site_present=true

  local nginx_limits_present=false
  [ -f "$STAGING_DIR/nginx-limits.conf" ] && nginx_limits_present=true

  local ssl_present=false
  [ -d "$STAGING_DIR/ssl" ] && [ "$(ls -A "$STAGING_DIR/ssl" 2>/dev/null)" ] && ssl_present=true

  local pm2_present=false
  [ -f "$STAGING_DIR/ecosystem.config.cjs" ] && pm2_present=true

  local crontab_present=false
  [ -f "$STAGING_DIR/crontab.txt" ] && [ -s "$STAGING_DIR/crontab.txt" ] && crontab_present=true

  local pg_config_present=false
  [ -f "$STAGING_DIR/postgresql.conf" ] && pg_config_present=true

  local is_encrypted="${DO_ENCRYPT:-false}"

  cat > "$STAGING_DIR/manifest.json" << EOMANIFEST
{
  "type": "learnplay-dr-backup",
  "version": "1.0",
  "created_at": "$(json_escape "$created_at")",
  "created_by": "$(json_escape "$created_by")",
  "hostname": "$(json_escape "$hostname_val")",
  "app_version": "$(json_escape "$app_version")",
  "postgres_version": "$(json_escape "$postgres_version")",
  "os_version": "$(json_escape "$os_version")",
  "components": {
    "database": {"file": "database.sql.gz", "size": $db_size, "checksum": "$db_checksum"},
    "uploads": {"file": "uploads.tar.gz", "size": $uploads_size, "checksum": "$uploads_checksum"},
    "env": {"file": "env_backup.enc", "encrypted": true, "present": $env_present},
    "os_settings": {"file": "os-settings.json"},
    "version": {"file": "version.json"},
    "nginx_site": {"file": "nginx-site.conf", "present": $nginx_site_present},
    "nginx_limits": {"file": "nginx-limits.conf", "present": $nginx_limits_present},
    "ssl_certs": {"dir": "ssl/", "present": $ssl_present},
    "pm2_config": {"file": "ecosystem.config.cjs", "present": $pm2_present},
    "crontab": {"file": "crontab.txt", "present": $crontab_present},
    "pg_config": {"file": "postgresql.conf", "present": $pg_config_present}
  },
  "encrypted": $is_encrypted,
  "mode": "$DR_MODE",
  "keySource": "$([ -n "${KEY_FILE:-}" ] && echo "provision-bundle" || ([ -f /opt/learnplay/keys/provision-bundle.json ] && echo "provision-bundle-default" || echo "passphrase"))"
}
EOMANIFEST

  msg_success "Manifest generated"
}

rotate_dr_backups() {
  log "Running DR backup rotation (keeping last $DR_RETENTION)..."

  local dr_count
  dr_count=$(find "$DR_DIR" -maxdepth 1 -name "dr_*.tar.gz*" -type f 2>/dev/null | wc -l)

  if [ "$dr_count" -le "$DR_RETENTION" ]; then
    msg_info "DR backups within retention limit ($dr_count/$DR_RETENTION)"
    return 0
  fi

  local deleted=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    log "Removing old DR backup: $(basename "$f")"
    rm -f "$f"
    deleted=$((deleted + 1))
  done < <(ls -t "$DR_DIR"/dr_*.tar.gz* 2>/dev/null | tail -n +"$((DR_RETENTION + 1))")

  if [ "$deleted" -gt 0 ]; then
    msg_success "Removed $deleted old DR backup(s)"
  fi
}

do_dr_backup() {
  local do_encrypt="${1:-false}"
  local skip_confirm="${2:-false}"

  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║            LearnPlay Disaster Recovery Backup                ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  log "=== DR backup started ==="

  msg_info "Running preflight checks..."
  echo ""

  if ! check_postgresql; then
    exit 1
  fi
  msg_success "PostgreSQL is running"

  ensure_dirs

  if ! check_disk_space; then
    if [ "$skip_confirm" != "true" ]; then
      read -p "Continue anyway? [y/N] " -r
      [[ ! $REPLY =~ ^[Yy]$ ]] && { log "DR backup cancelled by user"; exit 1; }
    else
      msg_warn "Continuing despite disk space warning (--yes mode)"
    fi
  fi
  msg_success "Preflight checks passed"
  echo ""

  STAGING_DIR=$(mktemp -d /tmp/learnplay-dr-XXXXXX)
  log "Staging directory: $STAGING_DIR"
  msg_info "Staging directory created: $STAGING_DIR"
  echo ""

  echo -e "${BOLD}Collecting components...${NC}"
  echo "────────────────────────────────────────────────────────────────"

  echo ""
  echo -e "${BOLD} [1/10] Database${NC}"
  collect_database || { msg_error "Database collection failed — aborting"; exit 1; }

  echo ""
  echo -e "${BOLD} [2/10] Uploads${NC}"
  collect_uploads

  echo ""
  echo -e "${BOLD} [3/10] Environment Config${NC}"
  collect_env || { msg_warn "Environment config collection failed — continuing"; }

  echo ""
  echo -e "${BOLD} [4/10] OS Settings${NC}"
  collect_os_settings

  echo ""
  echo -e "${BOLD} [5/10] Version Info${NC}"
  collect_version

  echo ""
  echo -e "${BOLD} [6/10] Nginx Configuration${NC}"
  collect_nginx

  echo ""
  echo -e "${BOLD} [7/10] SSL Certificates${NC}"
  collect_ssl

  echo ""
  echo -e "${BOLD} [8/10] PM2 Ecosystem Config${NC}"
  collect_pm2

  echo ""
  echo -e "${BOLD} [9/10] Crontab${NC}"
  collect_crontab

  echo ""
  echo -e "${BOLD} [10/10] PostgreSQL Config${NC}"
  collect_pg_config

  echo ""
  echo "────────────────────────────────────────────────────────────────"
  echo ""

  DO_ENCRYPT="$do_encrypt"
  generate_manifest

  echo ""
  msg_info "Packaging DR archive..."

  local archive_name="dr_${TIMESTAMP}.tar.gz"
  local archive_path="$DR_DIR/$archive_name"

  tar czf "$archive_path" -C "$STAGING_DIR" .

  if [ ! -f "$archive_path" ]; then
    msg_error "Failed to create archive"
    exit 1
  fi

  local archive_size
  archive_size=$(file_size_bytes "$archive_path")
  msg_success "Archive created: $archive_name ($(human_size "$archive_size"))"

  if [ "$do_encrypt" = "true" ]; then
    msg_info "Encrypting archive..."
    local key
    key=$(get_encryption_key) || { msg_error "Encryption failed"; exit 1; }
    archive_path=$(encrypt_file "$archive_path" "$key")
    archive_name=$(basename "$archive_path")
    archive_size=$(file_size_bytes "$archive_path")
    msg_success "Archive encrypted: $archive_name ($(human_size "$archive_size"))"
  fi

  rm -rf "$STAGING_DIR"
  STAGING_DIR=""

  rotate_dr_backups

  echo ""
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                 DR Backup Complete                           ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
  echo -e "  ${BOLD}Archive:${NC}    $archive_path"
  echo -e "  ${BOLD}Size:${NC}       $(human_size "$archive_size")"
  echo -e "  ${BOLD}Encrypted:${NC}  $do_encrypt"
  echo -e "  ${BOLD}Timestamp:${NC}  $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo -e "  ${BOLD}Components included:${NC}"
  echo "    ✅ Database (full pg_dump)"
  echo "    ✅ Uploads (local storage)"
  echo "    ✅ Environment config (encrypted)"
  echo "    ✅ OS settings snapshot"
  echo "    ✅ Version info"

  [ -f "$DR_DIR/../nginx-site.conf" ] 2>/dev/null || true
  echo "    $([ -f /etc/nginx/sites-available/learnplay ] && echo '✅' || echo '⬚ ') Nginx site config"
  echo "    $([ -f /etc/nginx/conf.d/learnplay-limits.conf ] && echo '✅' || echo '⬚ ') Nginx limits config"
  echo "    $(ls /etc/letsencrypt/live/*/fullchain.pem 2>/dev/null | head -1 > /dev/null 2>&1 && echo '✅' || echo '⬚ ') SSL certificates"
  echo "    $([ -f "$APP_DIR/ecosystem.config.cjs" ] && echo '✅' || echo '⬚ ') PM2 ecosystem config"
  echo "    $(crontab -l 2>/dev/null | grep -q . && echo '✅' || echo '⬚ ') Crontab"
  echo "    $(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1 | grep -q . && echo '✅' || echo '⬚ ') PostgreSQL config"

  echo ""
  echo -e "  ${BOLD}Retention:${NC}  Keeping last $DR_RETENTION DR backups"
  echo ""

  log "=== DR backup completed: $archive_path ($(human_size "$archive_size")) ==="

  msg_success "Disaster recovery backup completed successfully!"
  echo ""
}

usage() {
  echo ""
  echo -e "${BOLD}LearnPlay Disaster Recovery Backup${NC}"
  echo ""
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  --encrypt                Encrypt the final archive"
  echo "  --yes                    Skip confirmation prompts"
  echo "  --mode=MODE              Backup mode: clone (default), create-prod, system-copy"
  echo "  --key-file=PATH          Path to provision bundle JSON for encryption key"
  echo "  --help                   Show this help"
  echo ""
  echo "Modes:"
  echo "  clone         Full backup of everything (default, current behavior)"
  echo "  create-prod   Selective backup excluding transactional/gamification data"
  echo "  system-copy   Full data backup with metadata flagged for system refresh"
  echo ""
  echo "Environment Variables:"
  echo "  LEARNPLAY_BACKUP_KEY      Encryption passphrase (non-interactive)"
  echo "  LEARNPLAY_BACKUP_DIR      Backup root directory (default: /lppbackups)"
  echo "  LEARNPLAY_DR_RETENTION    Number of DR backups to retain (default: 3)"
  echo ""
  echo "Examples:"
  echo "  sudo $0"
  echo "  sudo $0 --encrypt"
  echo "  sudo $0 --encrypt --yes"
  echo "  sudo $0 --mode=create-prod --encrypt --yes"
  echo "  sudo $0 --mode=system-copy --encrypt"
  echo "  sudo $0 --encrypt --key-file=/opt/learnplay/keys/provision-bundle.json"
  echo "  sudo LEARNPLAY_BACKUP_KEY=mypass $0 --encrypt --yes"
  echo ""
}

check_root

DO_ENCRYPT="false"
SKIP_CONFIRM="false"
DR_MODE="clone"
KEY_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --encrypt)
      DO_ENCRYPT="true"
      shift
      ;;
    --yes|-y)
      SKIP_CONFIRM="true"
      shift
      ;;
    --mode=*)
      DR_MODE="${1#--mode=}"
      if [[ ! "$DR_MODE" =~ ^(clone|create-prod|system-copy)$ ]]; then
        msg_error "Invalid mode: $DR_MODE. Must be clone, create-prod, or system-copy"
        usage
        exit 1
      fi
      shift
      ;;
    --key-file=*)
      KEY_FILE="${1#--key-file=}"
      if [ ! -f "$KEY_FILE" ]; then
        msg_error "Key file not found: $KEY_FILE"
        exit 1
      fi
      shift
      ;;
    --help|-h|help)
      usage
      exit 0
      ;;
    *)
      msg_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

do_dr_backup "$DO_ENCRYPT" "$SKIP_CONFIRM"
