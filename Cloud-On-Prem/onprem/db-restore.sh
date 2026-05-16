#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
UPLOAD_DIR="${UPLOAD_DIR:-/opt/learnplay/uploads}"
BACKUP_DIR="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
FULL_DIR="$BACKUP_DIR/full"
BASE_DIR="$BACKUP_DIR/base"
WAL_DIR="$BACKUP_DIR/wal"
PG_CONF="/etc/postgresql/16/main/postgresql.conf"
resolve_pg_data_dir() {
  local configured="${LEARNPLAY_PGDATA:-}"
  local detected=""
  local conf_dir=""

  if [ -n "$configured" ]; then
    echo "$configured"
    return 0
  fi

  detected=$(sudo -u postgres psql -tAc "SHOW data_directory;" 2>/dev/null | tr -d '[:space:]' || true)
  if [ -n "$detected" ]; then
    echo "$detected"
    return 0
  fi

  if [ -f "$PG_CONF" ]; then
    conf_dir=$(awk -F= '/^[[:space:]]*data_directory[[:space:]]*=/ {print $2; exit}' "$PG_CONF" \
      | sed -e "s/[\"']//g" -e 's/[[:space:]]//g' || true)
    if [ -n "$conf_dir" ]; then
      echo "$conf_dir"
      return 0
    fi
  fi

  if [ -d /opt/lpdb/onprem/pg16/main ]; then
    echo "/opt/lpdb/onprem/pg16/main"
    return 0
  fi
  if [ -d /opt/lpdb/shared/pg16/main ]; then
    echo "/opt/lpdb/shared/pg16/main"
    return 0
  fi
  echo "/opt/lpdb/onprem/pg16/main"
}
PG_DATA="$(resolve_pg_data_dir)"
LOG_FILE="/var/log/learnplay/admin.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

KEY_FILE=""
DEFAULT_BUNDLE="/opt/learnplay/keys/provision-bundle.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [restore] $*" | tee -a "$LOG_FILE"; }

extract_key_from_bundle() {
  local bundle_file="$1"
  local purpose="${2:-backup}"
  if ! command -v python3 &>/dev/null; then
    echo ""
    return 1
  fi
  python3 -c "
import json, sys
with open('$bundle_file') as f:
    bundle = json.load(f)
payload = json.loads(bundle.get('payload', '{}'))
keys = payload.get('keys', {})
k = keys.get('$purpose', {})
print(k.get('key', ''))
" 2>/dev/null
}

die() {
  echo -e "${RED}❌ $*${NC}" >&2
  log "ERROR: $*"
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠️  $*${NC}"
  log "WARNING: $*"
}

success() {
  echo -e "${GREEN}✅ $*${NC}"
  log "$*"
}

header() {
  echo -e "${CYAN}"
  echo "╔══════════════════════════════════════════╗"
  echo "║     LearnPlay Database Restore           ║"
  echo "╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

if [ "$EUID" -ne 0 ]; then
  die "This script must be run as root (sudo)"
fi

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$FULL_DIR" "$BASE_DIR" "$WAL_DIR"

# ============================================
# UTILITY FUNCTIONS
# ============================================

confirm() {
  local prompt="${1:-Are you sure?}"
  echo -e "${YELLOW}${prompt}${NC}"
  read -rp "Type 'yes' to confirm: " answer
  [[ "$answer" == "yes" ]]
}

double_confirm() {
  local prompt="${1:-Are you sure?}"
  echo ""
  echo -e "${RED}${BOLD}══════════════════════════════════════════${NC}"
  echo -e "${RED}${BOLD}  DANGER: This operation is DESTRUCTIVE   ${NC}"
  echo -e "${RED}${BOLD}══════════════════════════════════════════${NC}"
  echo -e "${RED}${prompt}${NC}"
  echo ""
  read -rp "Type 'yes' to confirm: " answer1
  if [[ "$answer1" != "yes" ]]; then
    return 1
  fi
  echo ""
  echo -e "${RED}${BOLD}Final confirmation — this CANNOT be undone!${NC}"
  read -rp "Type 'RESTORE' to proceed: " answer2
  [[ "$answer2" == "RESTORE" ]]
}

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

# ============================================
# PRE-RESTORE BACKUP
# ============================================

create_pre_restore_backup() {
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="$FULL_DIR/pre_restore_${timestamp}.sql.gz"

  log "Creating pre-restore backup of current database..."
  echo -e "${CYAN}💾 Creating pre-restore backup...${NC}"

  if sudo -u postgres pg_dump "$APP_NAME" 2>/dev/null | gzip > "$backup_file"; then
    local size
    size=$(stat -c%s "$backup_file" 2>/dev/null || echo "0")
    success "Pre-restore backup saved: $backup_file ($(human_size "$size"))"
  else
    warn "Pre-restore backup failed — database may not exist yet"
    rm -f "$backup_file"
  fi
}

# ============================================
# SERVICE ORCHESTRATION
# ============================================

stop_app() {
  log "Stopping LearnPlay application..."
  echo -e "${CYAN}⏸️  Stopping LearnPlay application (PM2)...${NC}"
  sudo -u "$APP_USER" pm2 stop "$APP_NAME" --silent 2>/dev/null || true
  sleep 2
  success "Application stopped"
}

stop_postgresql() {
  log "Stopping PostgreSQL..."
  echo -e "${CYAN}⏸️  Stopping PostgreSQL...${NC}"
  systemctl stop postgresql
  sleep 2
  success "PostgreSQL stopped"
}

start_postgresql() {
  log "Starting PostgreSQL..."
  echo -e "${CYAN}🚀 Starting PostgreSQL...${NC}"
  systemctl start postgresql
  sleep 3
  if systemctl is-active --quiet postgresql; then
    success "PostgreSQL started"
  else
    die "PostgreSQL failed to start — check: journalctl -xeu postgresql"
  fi
}

start_app() {
  log "Starting LearnPlay application..."
  echo -e "${CYAN}🚀 Starting LearnPlay application...${NC}"
  cd "$APP_DIR"
  sudo -u "$APP_USER" pm2 start ecosystem.config.cjs 2>/dev/null || true
  sleep 5
  success "Application started"
}

start_nginx() {
  log "Starting Nginx..."
  echo -e "${CYAN}🚀 Starting Nginx...${NC}"
  systemctl start nginx 2>/dev/null || true
  if systemctl is-active --quiet nginx 2>/dev/null; then
    success "Nginx started"
  else
    warn "Nginx not available or failed to start"
  fi
}

health_check() {
  log "Running health check..."
  echo -e "${CYAN}🔍 Running health check...${NC}"
  local hc_port=""
  if [ -f "$APP_DIR/.env" ]; then
    hc_port=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  fi
  hc_port="${hc_port:-3000}"
  local ok=false
  for i in $(seq 1 10); do
    if curl -sf "http://127.0.0.1:${hc_port}/api/health" > /dev/null 2>&1; then
      ok=true
      break
    fi
    echo "  Attempt $i/10 — waiting..."
    sleep 3
  done

  if [ "$ok" = true ]; then
    success "Health check passed — application is running"
  else
    warn "Health check failed — application may need manual attention"
    warn "Check logs: sudo -u $APP_USER pm2 logs $APP_NAME"
  fi
}

post_restore_startup() {
  start_postgresql
  health_check_db
  start_app
  start_nginx
  health_check
}

health_check_db() {
  log "Checking database connectivity..."
  echo -e "${CYAN}🔍 Checking database connectivity...${NC}"
  local ok=false
  for i in $(seq 1 10); do
    if sudo -u postgres psql -d "$APP_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
      ok=true
      break
    fi
    echo "  Attempt $i/10 — waiting..."
    sleep 2
  done

  if [ "$ok" = true ]; then
    success "Database is accessible"
  else
    die "Database connectivity check failed"
  fi
}

# ============================================
# DECRYPTION
# ============================================

decrypt_if_needed() {
  local file="$1"

  if [[ "$file" != *.enc ]]; then
    echo "$file"
    return 0
  fi

  log "Encrypted backup detected — decrypting..."
  echo -e "${CYAN}🔐 Encrypted backup detected${NC}"

  local passphrase=""

  if [ -n "$KEY_FILE" ] && [ -f "$KEY_FILE" ]; then
    passphrase=$(extract_key_from_bundle "$KEY_FILE" "backup")
  fi

  if [ -z "$passphrase" ] && [ -f "$DEFAULT_BUNDLE" ]; then
    passphrase=$(extract_key_from_bundle "$DEFAULT_BUNDLE" "backup")
  fi

  if [ -z "$passphrase" ]; then
    passphrase="${LEARNPLAY_BACKUP_KEY:-}"
  fi

  if [ -z "$passphrase" ]; then
    read -rsp "Enter backup encryption passphrase: " passphrase
    echo ""
    if [ -z "$passphrase" ]; then
      die "No passphrase provided"
    fi
  fi

  local decrypted="${file%.enc}"
  if openssl enc -aes-256-cbc -d -pbkdf2 -in "$file" -out "$decrypted" -pass "pass:$passphrase" 2>/dev/null; then
    success "Backup decrypted successfully"
    echo "$decrypted"
  else
    rm -f "$decrypted"
    die "Decryption failed — wrong passphrase or corrupted file"
  fi
}

# ============================================
# VALIDATION
# ============================================

validate_backup_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    die "Backup file not found: $file"
  fi

  if [ ! -r "$file" ]; then
    die "Backup file is not readable: $file"
  fi

  local size
  size=$(stat -c%s "$file" 2>/dev/null || echo "0")
  if [ "$size" -eq 0 ]; then
    die "Backup file is empty: $file"
  fi

  local mod_date
  mod_date=$(stat -c%y "$file" 2>/dev/null | cut -d'.' -f1)

  echo ""
  echo -e "${BOLD}Backup Details:${NC}"
  echo "  File:     $file"
  echo "  Size:     $(human_size "$size")"
  echo "  Modified: $mod_date"
  echo ""
}

verify_gzip_integrity() {
  local file="$1"

  echo -e "${CYAN}🔍 Verifying gzip integrity...${NC}"
  if gzip -t "$file" 2>/dev/null; then
    success "Gzip integrity check passed"
    return 0
  else
    die "Gzip integrity check FAILED — backup file is corrupted: $file"
  fi
}

verify_backup() {
  local file="$1"

  file=$(decrypt_if_needed "$file")

  validate_backup_file "$file"

  if [[ "$file" == *.sql.gz ]]; then
    verify_gzip_integrity "$file"

    echo -e "${CYAN}🔍 Checking SQL content...${NC}"
    local line_count
    line_count=$(zcat "$file" 2>/dev/null | head -100 | wc -l)
    if [ "$line_count" -gt 0 ]; then
      success "SQL content verified ($line_count+ lines)"
    else
      die "Backup appears to have no SQL content"
    fi

    local tables
    tables=$(zcat "$file" 2>/dev/null | grep -c "^CREATE TABLE" || true)
    echo "  Tables found: $tables"

  elif [[ "$file" == *.sql ]]; then
    echo -e "${CYAN}🔍 Checking SQL content...${NC}"
    local line_count
    line_count=$(head -100 "$file" | wc -l)
    if [ "$line_count" -gt 0 ]; then
      success "SQL content verified ($line_count+ lines)"
    else
      die "Backup appears to have no SQL content"
    fi
  else
    warn "Unknown backup format — cannot fully verify"
  fi

  echo ""
  success "Backup verification complete"
}

# ============================================
# FULL RESTORE
# ============================================

restore_full() {
  local file="$1"

  file=$(decrypt_if_needed "$file")

  validate_backup_file "$file"

  if [[ "$file" == *.sql.gz ]]; then
    verify_gzip_integrity "$file"
  fi

  echo ""
  echo -e "${RED}${BOLD}⚠️  WARNING: This will REPLACE ALL current data!${NC}"
  echo -e "${RED}The database '$APP_NAME' will be dropped and recreated.${NC}"
  echo ""

  if ! confirm "Proceed with full database restore?"; then
    log "Restore cancelled by user"
    echo "Restore cancelled."
    return 0
  fi

  create_pre_restore_backup

  stop_app

  log "Dropping and recreating database..."
  echo -e "${CYAN}🔄 Dropping and recreating database...${NC}"

  sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$APP_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS $APP_NAME;" 2>/dev/null
  sudo -u postgres psql -c "CREATE DATABASE $APP_NAME OWNER $APP_NAME;" 2>/dev/null
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $APP_NAME TO $APP_NAME;" 2>/dev/null

  success "Database recreated"

  log "Restoring from backup: $file"
  echo -e "${CYAN}📥 Restoring database from backup...${NC}"
  echo "  This may take several minutes for large databases."
  echo ""

  if [[ "$file" == *.sql.gz ]]; then
    if zcat "$file" | sudo -u postgres psql -d "$APP_NAME" --quiet 2>&1 | tail -5; then
      success "Database restored from compressed backup"
    else
      die "Restore failed — check $LOG_FILE for details"
    fi
  elif [[ "$file" == *.sql ]]; then
    if sudo -u postgres psql -d "$APP_NAME" --quiet -f "$file" 2>&1 | tail -5; then
      success "Database restored from SQL backup"
    else
      die "Restore failed — check $LOG_FILE for details"
    fi
  else
    die "Unsupported backup format: $file"
  fi

  log "Setting ownership..."
  sudo -u postgres psql -d "$APP_NAME" -c "
    DO \$\$
    DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO $APP_NAME';
      END LOOP;
      FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequencename) || ' OWNER TO $APP_NAME';
      END LOOP;
    END \$\$;
  " 2>/dev/null || warn "Ownership transfer had warnings (may be OK)"

  local table_count
  table_count=$(sudo -u postgres psql -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_catalog = '$APP_NAME';" 2>/dev/null || echo "?")
  log "Restore complete — $table_count tables in database"
  echo ""
  echo -e "${BOLD}Restored $table_count tables${NC}"

  start_app
  start_nginx
  health_check

  echo ""
  success "Full restore completed successfully!"
  log "Full restore completed"
}

# ============================================
# FIND LATEST BACKUP
# ============================================

find_latest_backup() {
  local latest=""

  latest=$(find "$FULL_DIR" "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" -o -name "*.sql.gz.enc" 2>/dev/null | sort -r | head -1)

  if [ -z "$latest" ]; then
    latest=$(find "$BACKUP_DIR" -maxdepth 2 -name "*.sql.gz" -o -name "*.sql.gz.enc" 2>/dev/null | sort -r | head -1)
  fi

  if [ -z "$latest" ]; then
    die "No backup files found in $BACKUP_DIR"
  fi

  echo "$latest"
}

# ============================================
# LIST BACKUPS
# ============================================

list_backups() {
  echo ""
  echo -e "${BOLD}Available Backups:${NC}"
  echo "────────────────────────────────────────────────────────────────"
  printf "  ${BOLD}%-4s %-50s %-12s %-20s${NC}\n" "#" "File" "Size" "Date"
  echo "────────────────────────────────────────────────────────────────"

  local i=0
  local -a backup_files=()

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    i=$((i + 1))
    backup_files+=("$file")
    local size
    size=$(stat -c%s "$file" 2>/dev/null || echo "0")
    local mod_date
    mod_date=$(stat -c%y "$file" 2>/dev/null | cut -d'.' -f1)
    local basename
    basename=$(basename "$file")
    printf "  %-4s %-50s %-12s %-20s\n" "$i)" "$basename" "$(human_size "$size")" "$mod_date"
  done < <(find "$FULL_DIR" "$BACKUP_DIR" -maxdepth 2 \( -name "*.sql.gz" -o -name "*.sql.gz.enc" -o -name "*.sql" \) 2>/dev/null | sort -r)

  echo "────────────────────────────────────────────────────────────────"

  if [ "$i" -eq 0 ]; then
    echo "  No backups found."
    echo ""
    return 1
  fi

  echo ""
  read -rp "Select backup number [1-$i] (or 'q' to cancel): " selection

  if [[ "$selection" == "q" || "$selection" == "Q" ]]; then
    echo "Cancelled."
    return 0
  fi

  if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$i" ]; then
    die "Invalid selection: $selection"
  fi

  local selected_file="${backup_files[$((selection - 1))]}"
  log "User selected backup: $selected_file"
  restore_full "$selected_file"
}

# ============================================
# PITR — POINT-IN-TIME RECOVERY
# ============================================

show_pitr_info() {
  echo ""
  echo -e "${BOLD}Point-in-Time Recovery (PITR) Information${NC}"
  echo "════════════════════════════════════════════"
  echo ""

  echo -e "${BOLD}Available Base Backups:${NC}"
  local base_count=0
  local oldest_base=""
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    base_count=$((base_count + 1))
    local mod_date
    mod_date=$(stat -c%y "$dir" 2>/dev/null | cut -d'.' -f1)
    local size
    size=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "  $base_count) $(basename "$dir")  —  $mod_date  ($size)"
    if [ -z "$oldest_base" ]; then
      oldest_base="$mod_date"
    fi
  done < <(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

  if [ "$base_count" -eq 0 ]; then
    die "No base backups found in $BASE_DIR. PITR requires at least one base backup created with pg_basebackup."
  fi

  echo ""
  echo -e "${BOLD}WAL Archive:${NC}"
  local wal_count
  wal_count=$(find "$WAL_DIR" -type f -name "0*" 2>/dev/null | wc -l)
  if [ "$wal_count" -eq 0 ]; then
    die "No WAL files found in $WAL_DIR. PITR requires archived WAL segments."
  fi

  local oldest_wal
  oldest_wal=$(find "$WAL_DIR" -type f -name "0*" -printf "%T+ %p\n" 2>/dev/null | sort | head -1 | cut -d' ' -f1 | cut -d'.' -f1 | tr 'T' ' ')
  local newest_wal
  newest_wal=$(find "$WAL_DIR" -type f -name "0*" -printf "%T+ %p\n" 2>/dev/null | sort -r | head -1 | cut -d' ' -f1 | cut -d'.' -f1 | tr 'T' ' ')

  echo "  WAL segments: $wal_count files"
  echo "  Oldest WAL:   $oldest_wal"
  echo "  Newest WAL:   $newest_wal"
  echo ""
  echo -e "${BOLD}Valid recovery range: ${GREEN}$oldest_base${NC} → ${GREEN}$newest_wal${NC}"
  echo ""
}

validate_pitr_timestamp() {
  local ts="$1"

  if ! date -d "$ts" > /dev/null 2>&1; then
    die "Invalid timestamp format: $ts (use ISO 8601, e.g., '2026-02-13 14:30:00')"
  fi

  local ts_epoch
  ts_epoch=$(date -d "$ts" +%s)

  local oldest_base_epoch
  oldest_base_epoch=$(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d -printf "%T@\n" 2>/dev/null | sort | head -1 | cut -d'.' -f1)
  if [ -z "$oldest_base_epoch" ]; then
    die "No base backups available for PITR"
  fi

  local newest_wal_epoch
  newest_wal_epoch=$(find "$WAL_DIR" -type f -name "0*" -printf "%T@\n" 2>/dev/null | sort -r | head -1 | cut -d'.' -f1)
  if [ -z "$newest_wal_epoch" ]; then
    die "No WAL files available for PITR"
  fi

  if [ "$ts_epoch" -lt "$oldest_base_epoch" ]; then
    die "Requested time is before the oldest base backup. Cannot recover that far back."
  fi

  if [ "$ts_epoch" -gt "$newest_wal_epoch" ]; then
    die "Requested time is beyond the newest WAL file. Cannot recover to the future."
  fi

  success "Timestamp $ts is within valid recovery range"
}

select_base_backup() {
  local target_epoch
  target_epoch=$(date -d "$1" +%s)

  local selected=""
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    local dir_epoch
    dir_epoch=$(stat -c%Y "$dir" 2>/dev/null || echo "0")
    if [ "$dir_epoch" -le "$target_epoch" ]; then
      selected="$dir"
    fi
  done < <(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

  if [ -z "$selected" ]; then
    selected=$(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | head -1)
  fi

  if [ -z "$selected" ]; then
    die "No suitable base backup found"
  fi

  echo "$selected"
}

restore_pitr() {
  local target_time="$1"

  echo ""
  echo -e "${RED}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}${BOLD}║  POINT-IN-TIME RECOVERY — EXTREMELY DESTRUCTIVE ║${NC}"
  echo -e "${RED}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "  This operation will:"
  echo "    1. Stop ALL services (app + PostgreSQL)"
  echo "    2. ERASE the entire PostgreSQL data directory"
  echo "    3. Restore from a base backup"
  echo "    4. Replay WAL logs to: ${BOLD}$target_time${NC}"
  echo ""
  echo -e "  ${RED}ALL databases on this PostgreSQL instance will be affected!${NC}"
  echo ""

  show_pitr_info
  validate_pitr_timestamp "$target_time"

  if ! double_confirm "Proceed with PITR to '$target_time'?"; then
    log "PITR cancelled by user"
    echo "PITR cancelled."
    return 0
  fi

  local base_backup
  base_backup=$(select_base_backup "$target_time")
  log "Selected base backup: $base_backup"
  echo -e "${CYAN}Using base backup: $(basename "$base_backup")${NC}"

  create_pre_restore_backup

  log "=== PITR STARTED: target=$target_time ==="

  stop_app
  stop_postgresql

  log "Clearing PostgreSQL data directory: $PG_DATA"
  echo -e "${CYAN}🗑️  Clearing PostgreSQL data directory...${NC}"

  if [ ! -d "$PG_DATA" ]; then
    die "PostgreSQL data directory not found: $PG_DATA"
  fi

  rm -rf "${PG_DATA:?}"/*
  success "Data directory cleared"

  log "Restoring base backup to $PG_DATA"
  echo -e "${CYAN}📥 Restoring base backup...${NC}"

  cp -a "$base_backup"/. "$PG_DATA"/
  chown -R postgres:postgres "$PG_DATA"
  chmod 700 "$PG_DATA"

  success "Base backup restored"

  log "Configuring recovery settings..."
  echo -e "${CYAN}⚙️  Configuring recovery...${NC}"

  touch "$PG_DATA/recovery.signal"
  chown postgres:postgres "$PG_DATA/recovery.signal"

  local pg_conf_file="$PG_CONF"
  if [ ! -f "$pg_conf_file" ]; then
    pg_conf_file="$PG_DATA/postgresql.conf"
  fi

  if [ ! -f "$pg_conf_file" ]; then
    die "Cannot find postgresql.conf at $PG_CONF or $PG_DATA/postgresql.conf"
  fi

  sed -i '/^# PITR Recovery Settings/,/^# END PITR Recovery Settings/d' "$pg_conf_file" 2>/dev/null || true
  sed -i '/^restore_command\s*=/d' "$pg_conf_file" 2>/dev/null || true
  sed -i '/^recovery_target_time\s*=/d' "$pg_conf_file" 2>/dev/null || true
  sed -i '/^recovery_target_action\s*=/d' "$pg_conf_file" 2>/dev/null || true

  cat >> "$pg_conf_file" << EOF

# PITR Recovery Settings (added by db-restore.sh)
restore_command = 'cp $WAL_DIR/%f %p'
recovery_target_time = '$target_time'
recovery_target_action = 'promote'
# END PITR Recovery Settings
EOF

  chown postgres:postgres "$pg_conf_file"
  success "Recovery configured"

  log "Starting PostgreSQL for WAL replay..."
  echo -e "${CYAN}🚀 Starting PostgreSQL (WAL replay will begin)...${NC}"
  echo "  Recovering to: $target_time"
  echo "  This may take several minutes..."
  echo ""

  start_postgresql

  log "Waiting for recovery to complete..."
  echo -e "${CYAN}⏳ Waiting for recovery to complete...${NC}"

  local recovery_done=false
  for i in $(seq 1 120); do
    local in_recovery
    in_recovery=$(sudo -u postgres psql -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "error")

    if [ "$in_recovery" = "f" ]; then
      recovery_done=true
      break
    elif [ "$in_recovery" = "error" ]; then
      echo "  Attempt $i/120 — PostgreSQL not ready yet..."
    else
      echo "  Attempt $i/120 — recovery in progress..."
    fi
    sleep 5
  done

  if [ "$recovery_done" = true ]; then
    success "Recovery complete — database has been promoted"
  else
    warn "Recovery may still be in progress or stuck"
    warn "Check: sudo -u postgres psql -c 'SELECT pg_is_in_recovery();'"
  fi

  log "Cleaning up recovery settings from postgresql.conf..."
  echo -e "${CYAN}🧹 Cleaning up recovery settings...${NC}"

  sed -i '/^# PITR Recovery Settings/,/^# END PITR Recovery Settings/d' "$pg_conf_file" 2>/dev/null || true
  sed -i '/^restore_command\s*=/d' "$pg_conf_file" 2>/dev/null || true
  sed -i '/^recovery_target_time\s*=/d' "$pg_conf_file" 2>/dev/null || true
  sed -i '/^recovery_target_action\s*=/d' "$pg_conf_file" 2>/dev/null || true

  rm -f "$PG_DATA/recovery.signal" 2>/dev/null || true

  systemctl reload postgresql 2>/dev/null || true

  success "Recovery settings cleaned up"

  start_app
  start_nginx
  health_check

  echo ""
  success "Point-in-Time Recovery to '$target_time' completed!"
  log "=== PITR COMPLETED: target=$target_time ==="
}

# ============================================
# INTERACTIVE MENU
# ============================================

interactive_menu() {
  header

  echo -e "${YELLOW}⚠️  WARNING: Restore operations REPLACE all current data!${NC}"
  echo "A pre-restore backup will be created automatically."
  echo ""
  echo "  1) Restore Latest Full Backup"
  echo "  2) Select from Available Backups"
  echo "  3) Restore from Specific File"
  echo "  4) Point-in-Time Recovery (PITR)"
  echo "  5) Verify a Backup File"
  echo "  6) Back / Exit"
  echo ""
  read -rp "Select option [1-6]: " choice

  case "$choice" in
    1)
      log "User selected: Restore Latest Full Backup"
      local latest
      latest=$(find_latest_backup)
      echo ""
      echo -e "${BOLD}Latest backup found:${NC} $(basename "$latest")"
      restore_full "$latest"
      ;;
    2)
      log "User selected: Select from Available Backups"
      list_backups
      ;;
    3)
      log "User selected: Restore from Specific File"
      echo ""
      read -rp "Enter full path to backup file: " filepath
      if [ -z "$filepath" ]; then
        die "No file path provided"
      fi
      restore_full "$filepath"
      ;;
    4)
      log "User selected: Point-in-Time Recovery"
      show_pitr_info
      echo ""
      read -rp "Enter target timestamp (e.g., 2026-02-13 14:30:00): " target_ts
      if [ -z "$target_ts" ]; then
        die "No timestamp provided"
      fi
      restore_pitr "$target_ts"
      ;;
    5)
      log "User selected: Verify Backup"
      echo ""
      read -rp "Enter full path to backup file: " filepath
      if [ -z "$filepath" ]; then
        die "No file path provided"
      fi
      verify_backup "$filepath"
      ;;
    6)
      echo "Exiting."
      exit 0
      ;;
    *)
      die "Invalid option: $choice"
      ;;
  esac
}

# ============================================
# COMMAND-LINE INTERFACE
# ============================================

usage() {
  echo "Usage: $0 [command] [options] [--key-file=PATH]"
  echo ""
  echo "Commands:"
  echo "  latest                  Restore the most recent full backup"
  echo "  list                    List available backups for selection"
  echo "  file <path>             Restore from a specific backup file"
  echo "  pitr <timestamp>        Point-in-time recovery (ISO 8601)"
  echo "  verify <path>           Verify a backup file without restoring"
  echo ""
  echo "Options:"
  echo "  --key-file=PATH  Use a provision bundle JSON file for decryption key"
  echo ""
  echo "No arguments launches the interactive menu."
  echo ""
  echo "Examples:"
  echo "  $0 latest"
  echo "  $0 list"
  echo "  $0 file /lppbackups/full/db_daily_20260213.sql.gz"
  echo "  $0 pitr \"2026-02-13 14:30:00\""
  echo "  $0 verify /lppbackups/full/db_daily_20260213.sql.gz"
  echo "  $0 latest --key-file=/opt/learnplay/keys/provision-bundle.json"
}

# ============================================
# MAIN
# ============================================

for arg in "$@"; do
  case "$arg" in
    --key-file=*) KEY_FILE="${arg#--key-file=}" ;;
  esac
done

log "=== db-restore.sh invoked: args='$*' ==="

case "${1:-}" in
  "")
    interactive_menu
    ;;
  latest)
    header
    log "CLI: Restore latest backup"
    latest=$(find_latest_backup)
    echo -e "${BOLD}Latest backup:${NC} $(basename "$latest")"
    restore_full "$latest"
    ;;
  list)
    header
    log "CLI: List backups"
    list_backups
    ;;
  file)
    header
    if [ -z "${2:-}" ]; then
      die "Usage: $0 file <path>"
    fi
    log "CLI: Restore from file: $2"
    restore_full "$2"
    ;;
  pitr)
    header
    if [ -z "${2:-}" ]; then
      die "Usage: $0 pitr <timestamp>"
    fi
    log "CLI: PITR to: $2"
    restore_pitr "$2"
    ;;
  verify)
    header
    if [ -z "${2:-}" ]; then
      die "Usage: $0 verify <path>"
    fi
    log "CLI: Verify backup: $2"
    verify_backup "$2"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    die "Unknown command: $1. Run '$0 --help' for usage."
    ;;
esac
