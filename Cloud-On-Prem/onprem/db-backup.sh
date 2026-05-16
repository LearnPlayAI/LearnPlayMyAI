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
LOG_FILE="/var/log/learnplay/admin.log"

FULL_RETENTION_DAYS="${LEARNPLAY_BACKUP_RETENTION_DAYS:-30}"
BASE_RETENTION_COUNT="${LEARNPLAY_BASE_RETENTION_COUNT:-4}"
DISK_WARN_THRESHOLD=20

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

KEY_FILE=""
DEFAULT_BUNDLE="/opt/learnplay/keys/provision-bundle.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] $*" | tee -a "$LOG_FILE"; }

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

check_root() {
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ This script must be run as root (sudo)${NC}"
    exit 1
  fi
}

ensure_dirs() {
  if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}⚠️  Backup directory $BACKUP_DIR does not exist.${NC}"
    echo -e "${YELLOW}   Recommended: Mount a dedicated disk at /lppbackups (50GB+)${NC}"
    echo -e "${YELLOW}   Creating directory...${NC}"
    mkdir -p "$BACKUP_DIR"
  fi
  mkdir -p "$FULL_DIR" "$BASE_DIR" "$WAL_DIR"
  chown -R postgres:postgres "$WAL_DIR"
  mkdir -p "$(dirname "$LOG_FILE")"
}

check_disk_space() {
  local mount_point
  mount_point=$(df "$BACKUP_DIR" --output=target | tail -1)
  local pct_used
  pct_used=$(df "$mount_point" --output=pcent | tail -1 | tr -d ' %')
  local pct_free=$((100 - pct_used))

  if [ "$pct_free" -lt "$DISK_WARN_THRESHOLD" ]; then
    log "⚠️  WARNING: Only ${pct_free}% disk space free on $mount_point"
    echo -e "${YELLOW}⚠️  WARNING: Only ${pct_free}% disk space free on ${mount_point}${NC}"
    echo -e "${YELLOW}   Consider running rotation cleanup before proceeding.${NC}"
    return 1
  fi
  return 0
}

get_encryption_key() {
  if [ -n "$KEY_FILE" ] && [ -f "$KEY_FILE" ]; then
    local bundle_key
    bundle_key=$(extract_key_from_bundle "$KEY_FILE" "backup")
    if [ -n "$bundle_key" ]; then
      echo "$bundle_key"
      return 0
    fi
  fi

  if [ -f "$DEFAULT_BUNDLE" ]; then
    local bundle_key
    bundle_key=$(extract_key_from_bundle "$DEFAULT_BUNDLE" "backup")
    if [ -n "$bundle_key" ]; then
      echo "$bundle_key"
      return 0
    fi
  fi

  if [ -n "${LEARNPLAY_BACKUP_KEY:-}" ]; then
    echo "$LEARNPLAY_BACKUP_KEY"
    return 0
  fi

  read -sp "Enter encryption passphrase: " passphrase
  echo ""
  if [ -z "$passphrase" ]; then
    echo -e "${RED}❌ Passphrase cannot be empty${NC}"
    return 1
  fi
  read -sp "Confirm passphrase: " passphrase_confirm
  echo ""
  if [ "$passphrase" != "$passphrase_confirm" ]; then
    echo -e "${RED}❌ Passphrases do not match${NC}"
    return 1
  fi
  echo "$passphrase"
}

encrypt_file() {
  local src="$1"
  local key="$2"
  local dest="${src}.enc"

  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$src" -out "$dest" -pass "pass:$key"
  if [ $? -eq 0 ]; then
    rm -f "$src"
    log "🔐 Encrypted: $(basename "$dest")"
    echo "$dest"
  else
    log "❌ Encryption failed for $(basename "$src")"
    echo "$src"
    return 1
  fi
}

do_full_backup() {
  local encrypt="${1:-false}"

  log "Starting full database backup..."
  ensure_dirs

  if ! check_disk_space; then
    read -p "Continue anyway? [y/N] " -r
    [[ ! $REPLY =~ ^[Yy]$ ]] && { log "Backup cancelled by user"; return 1; }
  fi

  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="$FULL_DIR/backup_${timestamp}.sql.gz"

  log "📦 Dumping database '$APP_NAME'..."
  if sudo -u postgres pg_dump "$APP_NAME" | gzip > "$backup_file"; then
    local file_size
    file_size=$(stat -c%s "$backup_file" 2>/dev/null || echo "0")

    if [ "$file_size" -eq 0 ]; then
      log "❌ Backup file is empty — backup failed"
      rm -f "$backup_file"
      return 1
    fi

    if ! gzip -t "$backup_file" 2>/dev/null; then
      log "❌ Backup file failed gzip integrity check"
      return 1
    fi

    local human_size
    human_size=$(du -h "$backup_file" | cut -f1)
    log "✅ Full backup complete: backup_${timestamp}.sql.gz ($human_size)"

    if [ "$encrypt" = "true" ]; then
      local key
      key=$(get_encryption_key) || return 1
      backup_file=$(encrypt_file "$backup_file" "$key")
    fi

    echo -e "${GREEN}✅ Full backup saved: ${backup_file}${NC}"
  else
    log "❌ pg_dump failed"
    rm -f "$backup_file"
    return 1
  fi
}

do_base_backup() {
  local encrypt="${1:-false}"

  log "Starting base backup (pg_basebackup) for PITR..."
  ensure_dirs

  if ! check_disk_space; then
    read -p "Continue anyway? [y/N] " -r
    [[ ! $REPLY =~ ^[Yy]$ ]] && { log "Backup cancelled by user"; return 1; }
  fi

  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_path="$BASE_DIR/base_${timestamp}"

  log "📦 Running pg_basebackup..."
  if sudo -u postgres pg_basebackup -D "$backup_path" -Ft -z -Xs -P; then
    local human_size
    human_size=$(du -sh "$backup_path" | cut -f1)
    log "✅ Base backup complete: base_${timestamp}/ ($human_size)"
    echo -e "${GREEN}✅ Base backup saved: ${backup_path}${NC}"

    if [ "$encrypt" = "true" ]; then
      local key
      key=$(get_encryption_key) || return 1
      local tar_file="$BASE_DIR/base_${timestamp}.tar.gz"
      tar czf "$tar_file" -C "$BASE_DIR" "base_${timestamp}"
      rm -rf "$backup_path"
      encrypt_file "$tar_file" "$key"
    fi
  else
    log "❌ pg_basebackup failed (exit code: $?)"
    rm -rf "$backup_path"
    return 1
  fi
}

do_setup_wal() {
  log "Configuring WAL archiving for point-in-time recovery..."

  local pg_conf
  pg_conf=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
  if [ -z "$pg_conf" ]; then
    log "❌ postgresql.conf not found"
    echo -e "${RED}❌ postgresql.conf not found in /etc/postgresql${NC}"
    return 1
  fi

  ensure_dirs
  chown postgres:postgres "$WAL_DIR"

  log "📝 Backing up postgresql.conf..."
  cp "$pg_conf" "${pg_conf}.bak-$(date +%Y%m%d)" 2>/dev/null || true

  local changes_made=false

  if ! grep -q "^wal_level = replica" "$pg_conf"; then
    sed -i "s/^#\?wal_level = .*/wal_level = replica/" "$pg_conf"
    if ! grep -q "^wal_level" "$pg_conf"; then
      echo "wal_level = replica" >> "$pg_conf"
    fi
    changes_made=true
    log "   Set wal_level = replica"
  fi

  if ! grep -q "^archive_mode = on" "$pg_conf"; then
    sed -i "s/^#\?archive_mode = .*/archive_mode = on/" "$pg_conf"
    if ! grep -q "^archive_mode" "$pg_conf"; then
      echo "archive_mode = on" >> "$pg_conf"
    fi
    changes_made=true
    log "   Set archive_mode = on"
  fi

  local archive_cmd="cp %p $WAL_DIR/%f"
  if ! grep -q "^archive_command.*$WAL_DIR" "$pg_conf"; then
    sed -i "s|^#\?archive_command = .*|archive_command = '$archive_cmd'|" "$pg_conf"
    if ! grep -q "^archive_command" "$pg_conf"; then
      echo "archive_command = '$archive_cmd'" >> "$pg_conf"
    fi
    changes_made=true
    log "   Set archive_command = '$archive_cmd'"
  fi

  if ! grep -q "^max_wal_size = 1GB" "$pg_conf"; then
    sed -i "s/^#\?max_wal_size = .*/max_wal_size = 1GB/" "$pg_conf"
    if ! grep -q "^max_wal_size" "$pg_conf"; then
      echo "max_wal_size = 1GB" >> "$pg_conf"
    fi
    changes_made=true
    log "   Set max_wal_size = 1GB"
  fi

  if [ "$changes_made" = true ]; then
    echo ""
    echo -e "${YELLOW}⚠️  PostgreSQL must be restarted for WAL archiving changes to take effect.${NC}"
    echo -e "${YELLOW}   This will briefly interrupt database connections.${NC}"
    echo ""
    read -p "Restart PostgreSQL now? [y/N] " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      log "🔄 Restarting PostgreSQL..."
      systemctl restart postgresql
      sleep 3
      if systemctl is-active --quiet postgresql; then
        log "✅ PostgreSQL restarted successfully — WAL archiving enabled"
        echo -e "${GREEN}✅ PostgreSQL restarted — WAL archiving is now active${NC}"
      else
        log "❌ PostgreSQL failed to restart!"
        echo -e "${RED}❌ PostgreSQL failed to restart! Check: journalctl -u postgresql${NC}"
        return 1
      fi
    else
      log "⚠️  WAL archiving configured but PostgreSQL NOT restarted"
      echo -e "${YELLOW}⚠️  Config saved. Run 'systemctl restart postgresql' to activate.${NC}"
    fi
  else
    log "✅ WAL archiving is already configured"
    echo -e "${GREEN}✅ WAL archiving is already configured and active${NC}"
  fi
}

do_schedule() {
  log "Setting up automated backup schedule..."

  local script_path
  script_path=$(readlink -f "$0")

  crontab -l 2>/dev/null | grep -v "db-backup.sh" | crontab - || true

  (
    crontab -l 2>/dev/null
    echo "0 2 * * * $script_path full >> /var/log/learnplay/backup-cron.log 2>&1"
    echo "0 3 * * 0 $script_path base >> /var/log/learnplay/backup-cron.log 2>&1"
    echo "0 4 * * * $script_path rotate >> /var/log/learnplay/backup-cron.log 2>&1"
  ) | crontab -

  log "✅ Backup schedule configured:"
  log "   Daily 2:00 AM  — Full database backup (pg_dump)"
  log "   Sunday 3:00 AM — Base backup (pg_basebackup for PITR)"
  log "   Daily 4:00 AM  — Rotation cleanup"

  echo -e "${GREEN}✅ Backup schedule configured:${NC}"
  echo "   Daily 2:00 AM  — Full database backup (pg_dump)"
  echo "   Sunday 3:00 AM — Base backup (pg_basebackup for PITR)"
  echo "   Daily 4:00 AM  — Rotation cleanup"
  echo ""
  echo "   WAL archiving is continuous once enabled (see setup-wal)"
}

do_list() {
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║                  Available Backups                          ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  echo -e "${BOLD}Full Backups (pg_dump):${NC}"
  if ls "$FULL_DIR"/backup_*.sql.gz* 2>/dev/null | head -1 > /dev/null 2>&1; then
    for f in $(ls -t "$FULL_DIR"/backup_*.sql.gz* 2>/dev/null); do
      local fname
      fname=$(basename "$f")
      local fsize
      fsize=$(du -h "$f" | cut -f1)
      local fdate
      fdate=$(stat -c '%y' "$f" | cut -d'.' -f1)
      local enc_marker=""
      [[ "$fname" == *.enc ]] && enc_marker=" 🔐"
      echo "  $fdate  $fsize  $fname${enc_marker}"
    done
  else
    echo "  (none)"
  fi

  echo ""
  echo -e "${BOLD}Base Backups (pg_basebackup):${NC}"
  if ls -d "$BASE_DIR"/base_* 2>/dev/null | head -1 > /dev/null 2>&1; then
    for d in $(ls -dt "$BASE_DIR"/base_* 2>/dev/null); do
      local dname
      dname=$(basename "$d")
      local dsize
      dsize=$(du -sh "$d" | cut -f1)
      local ddate
      ddate=$(stat -c '%y' "$d" | cut -d'.' -f1)
      local enc_marker=""
      [[ "$dname" == *.enc ]] && enc_marker=" 🔐"
      echo "  $ddate  $dsize  $dname${enc_marker}"
    done
  else
    echo "  (none)"
  fi

  echo ""
  echo -e "${BOLD}WAL Archives:${NC}"
  local wal_count
  wal_count=$(find "$WAL_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l)
  if [ "$wal_count" -gt 0 ]; then
    local wal_size
    wal_size=$(du -sh "$WAL_DIR" | cut -f1)
    echo "  $wal_count WAL files ($wal_size total)"
  else
    echo "  (none)"
  fi
  echo ""
}

do_verify() {
  local backup_path="${1:-}"
  if [ -z "$backup_path" ]; then
    echo -e "${RED}❌ Usage: db-backup.sh verify <backup_path>${NC}"
    return 1
  fi

  if [ ! -e "$backup_path" ]; then
    echo -e "${RED}❌ File not found: $backup_path${NC}"
    return 1
  fi

  echo -e "${BOLD}Verifying: $(basename "$backup_path")${NC}"

  if [[ "$backup_path" == *.enc ]]; then
    echo -e "${YELLOW}  ⚠️  Encrypted backup — cannot verify contents without decryption${NC}"
    local fsize
    fsize=$(stat -c%s "$backup_path" 2>/dev/null || echo "0")
    if [ "$fsize" -gt 0 ]; then
      echo -e "${GREEN}  ✅ File exists and is non-empty ($(du -h "$backup_path" | cut -f1))${NC}"
    else
      echo -e "${RED}  ❌ File is empty${NC}"
      return 1
    fi
    return 0
  fi

  if [[ "$backup_path" == *.sql.gz ]]; then
    local fsize
    fsize=$(stat -c%s "$backup_path" 2>/dev/null || echo "0")
    if [ "$fsize" -eq 0 ]; then
      echo -e "${RED}  ❌ File is empty${NC}"
      return 1
    fi
    echo -e "${GREEN}  ✅ File size: $(du -h "$backup_path" | cut -f1)${NC}"

    if gzip -t "$backup_path" 2>/dev/null; then
      echo -e "${GREEN}  ✅ Gzip integrity: OK${NC}"
    else
      echo -e "${RED}  ❌ Gzip integrity: FAILED${NC}"
      return 1
    fi

    local table_count
    table_count=$(zcat "$backup_path" 2>/dev/null | grep -c "^CREATE TABLE" || echo "0")
    echo -e "${GREEN}  ✅ Contains $table_count CREATE TABLE statements${NC}"
    log "Verified full backup: $(basename "$backup_path") — OK ($table_count tables)"
    return 0
  fi

  if [ -d "$backup_path" ]; then
    local dsize
    dsize=$(du -sh "$backup_path" | cut -f1)
    local file_count
    file_count=$(find "$backup_path" -type f | wc -l)
    if [ "$file_count" -gt 0 ]; then
      echo -e "${GREEN}  ✅ Base backup directory: $dsize ($file_count files)${NC}"
      log "Verified base backup: $(basename "$backup_path") — OK ($file_count files, $dsize)"
    else
      echo -e "${RED}  ❌ Base backup directory is empty${NC}"
      return 1
    fi
    return 0
  fi

  echo -e "${YELLOW}  ⚠️  Unknown backup format${NC}"
  return 1
}

do_rotate() {
  log "Running backup rotation cleanup..."

  local full_deleted=0
  while IFS= read -r f; do
    log "🗑️  Removing old full backup: $(basename "$f")"
    rm -f "$f"
    full_deleted=$((full_deleted + 1))
  done < <(find "$FULL_DIR" -name "backup_*.sql.gz*" -mtime +"$FULL_RETENTION_DAYS" 2>/dev/null)

  local base_deleted=0
  local base_count
  base_count=$(ls -dt "$BASE_DIR"/base_* 2>/dev/null | wc -l)
  if [ "$base_count" -gt "$BASE_RETENTION_COUNT" ]; then
    while IFS= read -r d; do
      log "🗑️  Removing old base backup: $(basename "$d")"
      rm -rf "$d"
      base_deleted=$((base_deleted + 1))
    done < <(ls -dt "$BASE_DIR"/base_* 2>/dev/null | tail -n +"$((BASE_RETENTION_COUNT + 1))")
  fi

  local wal_deleted=0
  local oldest_base
  oldest_base=$(ls -dt "$BASE_DIR"/base_* 2>/dev/null | tail -1)
  if [ -n "$oldest_base" ]; then
    local oldest_ts
    oldest_ts=$(stat -c '%Y' "$oldest_base" 2>/dev/null)
    if [ -n "$oldest_ts" ]; then
      while IFS= read -r w; do
        local wal_ts
        wal_ts=$(stat -c '%Y' "$w" 2>/dev/null || echo "0")
        if [ "$wal_ts" -lt "$oldest_ts" ]; then
          rm -f "$w"
          wal_deleted=$((wal_deleted + 1))
        fi
      done < <(find "$WAL_DIR" -maxdepth 1 -type f 2>/dev/null)
    fi
  fi

  log "✅ Rotation complete: $full_deleted full, $base_deleted base, $wal_deleted WAL files removed"
  echo -e "${GREEN}✅ Rotation complete:${NC}"
  echo "   Full backups removed:  $full_deleted (keeping last $FULL_RETENTION_DAYS days)"
  echo "   Base backups removed:  $base_deleted (keeping last $BASE_RETENTION_COUNT)"
  echo "   WAL files removed:     $wal_deleted"
}

do_status() {
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║               Backup System Status                          ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  local pg_conf
  pg_conf=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
  if [ -n "$pg_conf" ] && grep -q "^archive_mode = on" "$pg_conf" 2>/dev/null; then
    echo -e "  WAL Archiving:    ${GREEN}✅ Enabled${NC}"
  else
    echo -e "  WAL Archiving:    ${RED}❌ Disabled${NC}"
  fi

  local last_full
  last_full=$(ls -t "$FULL_DIR"/backup_*.sql.gz* 2>/dev/null | head -1)
  if [ -n "$last_full" ]; then
    local lf_date
    lf_date=$(stat -c '%y' "$last_full" | cut -d'.' -f1)
    local lf_size
    lf_size=$(du -h "$last_full" | cut -f1)
    echo -e "  Last Full Backup: ${GREEN}$lf_date ($lf_size)${NC}"
  else
    echo -e "  Last Full Backup: ${YELLOW}None${NC}"
  fi

  local last_base
  last_base=$(ls -dt "$BASE_DIR"/base_* 2>/dev/null | head -1)
  if [ -n "$last_base" ]; then
    local lb_date
    lb_date=$(stat -c '%y' "$last_base" | cut -d'.' -f1)
    local lb_size
    lb_size=$(du -sh "$last_base" | cut -f1)
    echo -e "  Last Base Backup: ${GREEN}$lb_date ($lb_size)${NC}"
  else
    echo -e "  Last Base Backup: ${YELLOW}None${NC}"
  fi

  local backup_size
  backup_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "0")
  local mount_point
  mount_point=$(df "$BACKUP_DIR" --output=target 2>/dev/null | tail -1 || echo "/")
  local total_space
  total_space=$(df -h "$mount_point" --output=size 2>/dev/null | tail -1 | tr -d ' ' || echo "?")
  local pct_used
  pct_used=$(df "$mount_point" --output=pcent 2>/dev/null | tail -1 | tr -d ' ' || echo "?")
  echo -e "  Backup Disk Used: ${BOLD}$backup_size / $total_space ($pct_used)${NC}"

  if crontab -l 2>/dev/null | grep -q "db-backup.sh"; then
    echo -e "  Scheduled:        ${GREEN}✅ Daily 2am + Weekly Sun 3am${NC}"
  else
    echo -e "  Scheduled:        ${YELLOW}❌ Not configured${NC}"
  fi

  echo ""

  local full_count
  full_count=$(find "$FULL_DIR" -name "backup_*.sql.gz*" 2>/dev/null | wc -l)
  local base_count
  base_count=$(ls -d "$BASE_DIR"/base_* 2>/dev/null | wc -l)
  local wal_count
  wal_count=$(find "$WAL_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l)

  echo -e "  ${BOLD}Backup Inventory:${NC}"
  echo "    Full backups:   $full_count (retention: $FULL_RETENTION_DAYS days)"
  echo "    Base backups:   $base_count (retention: last $BASE_RETENTION_COUNT)"
  echo "    WAL archives:   $wal_count files"
  echo ""
}

do_encrypt_existing() {
  echo -e "${BOLD}Select a backup to encrypt:${NC}"
  echo ""

  local files=()
  local idx=1

  while IFS= read -r f; do
    [[ "$f" == *.enc ]] && continue
    files+=("$f")
    echo "  $idx) $(basename "$f") ($(du -h "$f" | cut -f1))"
    idx=$((idx + 1))
  done < <(ls -t "$FULL_DIR"/backup_*.sql.gz 2>/dev/null)

  while IFS= read -r d; do
    [[ "$(basename "$d")" == *.enc ]] && continue
    files+=("$d")
    echo "  $idx) $(basename "$d")/ ($(du -sh "$d" | cut -f1))"
    idx=$((idx + 1))
  done < <(ls -dt "$BASE_DIR"/base_* 2>/dev/null)

  if [ ${#files[@]} -eq 0 ]; then
    echo -e "${YELLOW}  No unencrypted backups found${NC}"
    return 0
  fi

  echo ""
  read -p "Select backup [1-$((idx - 1))]: " selection
  if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -ge "$idx" ]; then
    echo -e "${RED}❌ Invalid selection${NC}"
    return 1
  fi

  local target="${files[$((selection - 1))]}"
  local key
  key=$(get_encryption_key) || return 1

  if [ -d "$target" ]; then
    local tar_file="${target}.tar.gz"
    log "📦 Compressing base backup for encryption..."
    tar czf "$tar_file" -C "$(dirname "$target")" "$(basename "$target")"
    rm -rf "$target"
    encrypt_file "$tar_file" "$key"
  else
    encrypt_file "$target" "$key"
  fi

  echo -e "${GREEN}✅ Backup encrypted successfully${NC}"
}

show_menu() {
  while true; do
    echo -e "${BOLD}${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║      LearnPlay Database Backup           ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    do_status 2>/dev/null || true

    echo "  1) Run Full Backup Now"
    echo "  2) Run Base Backup Now (for PITR)"
    echo "  3) Setup WAL Archiving"
    echo "  4) Configure Backup Schedule"
    echo "  5) List All Backups"
    echo "  6) Verify a Backup"
    echo "  7) Encrypt a Backup"
    echo "  8) Run Rotation Cleanup"
    echo "  9) View Backup Status"
    echo "  0) Back / Exit"
    echo ""
    read -p "Select option [0-9]: " choice

    case "$choice" in
      1)
        echo ""
        read -p "Encrypt this backup? [y/N] " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
          do_full_backup true
        else
          do_full_backup false
        fi
        echo ""
        read -p "Press Enter to continue..."
        ;;
      2)
        echo ""
        read -p "Encrypt this backup? [y/N] " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
          do_base_backup true
        else
          do_base_backup false
        fi
        echo ""
        read -p "Press Enter to continue..."
        ;;
      3)
        echo ""
        do_setup_wal
        echo ""
        read -p "Press Enter to continue..."
        ;;
      4)
        echo ""
        do_schedule
        echo ""
        read -p "Press Enter to continue..."
        ;;
      5)
        echo ""
        do_list
        read -p "Press Enter to continue..."
        ;;
      6)
        echo ""
        read -p "Enter backup path to verify: " verify_path
        if [ -n "$verify_path" ]; then
          do_verify "$verify_path"
        fi
        echo ""
        read -p "Press Enter to continue..."
        ;;
      7)
        echo ""
        do_encrypt_existing
        echo ""
        read -p "Press Enter to continue..."
        ;;
      8)
        echo ""
        do_rotate
        echo ""
        read -p "Press Enter to continue..."
        ;;
      9)
        echo ""
        do_status
        read -p "Press Enter to continue..."
        ;;
      0)
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;
      *)
        echo -e "${RED}Invalid option${NC}"
        sleep 1
        ;;
    esac
  done
}

check_root

for arg in "$@"; do
  case "$arg" in
    --key-file=*) KEY_FILE="${arg#--key-file=}" ;;
  esac
done

ensure_dirs

case "${1:-}" in
  full)
    do_full_backup "${2:-false}"
    ;;
  base)
    do_base_backup "${2:-false}"
    ;;
  setup-wal)
    do_setup_wal
    ;;
  schedule)
    do_schedule
    ;;
  list)
    do_list
    ;;
  verify)
    do_verify "${2:-}"
    ;;
  rotate)
    do_rotate
    ;;
  status)
    do_status
    ;;
  "")
    show_menu
    ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    echo ""
    echo "Usage: $0 {full|base|setup-wal|schedule|list|verify <path>|rotate|status} [--key-file=PATH]"
    echo ""
    echo "Commands:"
    echo "  full        Run full pg_dump backup now"
    echo "  base        Run pg_basebackup now"
    echo "  setup-wal   Configure WAL archiving in PostgreSQL"
    echo "  schedule    Set up cron jobs for automated backups"
    echo "  list        List all available backups with sizes and dates"
    echo "  verify      Verify a specific backup file"
    echo "  rotate      Run rotation cleanup now"
    echo "  status      Show backup system status"
    echo ""
    echo "Options:"
    echo "  --key-file=PATH  Use a provision bundle JSON file for encryption key"
    echo ""
    echo "No arguments launches the interactive menu."
    exit 1
    ;;
esac
