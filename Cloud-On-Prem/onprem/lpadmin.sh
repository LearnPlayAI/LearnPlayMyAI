#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
LOG_FILE="/var/log/learnplay/admin.log"
UPLOAD_DIR="${UPLOAD_DIR:-/opt/learnplay/uploads}"
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m'

mkdir -p /var/log/learnplay 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [admin] $*" | tee -a "$LOG_FILE"; }

audit() {
  local action="$1"
  local user="${SUDO_USER:-$USER}"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [admin] Action: $action (user: $user)" >> "$LOG_FILE"
}

msg_success() { echo -e "${GREEN}✅ $*${NC}"; }
msg_error()   { echo -e "${RED}❌ $*${NC}"; }
msg_warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
msg_info()    { echo -e "${CYAN}ℹ️  $*${NC}"; }

run_script() {
  local script="$1"
  shift
  local script_path="$SCRIPT_DIR/$script"
  if [ -f "$script_path" ]; then
    if [ -x "$script_path" ]; then
      "$script_path" "$@"
    else
      bash "$script_path" "$@"
    fi
  else
    msg_error "Script not found: $script_path"
    return 1
  fi
}

refresh_scripts_from_dist() {
  local dist_dir=""
  local PERMANENT_SCRIPTS_DIR="$APP_DIR/scripts"

  if [ -d /opt/learnplay/.dist-staging/server ] && [ -f /opt/learnplay/.dist-staging/package.json ]; then
    dist_dir="/opt/learnplay/.dist-staging"
  elif [ -f "$APP_DIR/.dist-source" ]; then
    local saved
    saved="$(cat "$APP_DIR/.dist-source" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$saved" ] && [ -d "$saved/server" ] && [ -f "$saved/package.json" ]; then
      dist_dir="$saved"
    fi
  fi
  for search_dir in /tmp/dist-onprem /var/tmp/dist-onprem; do
    if [ -z "$dist_dir" ] && [ -d "$search_dir/server" ] && [ -f "$search_dir/package.json" ]; then
      dist_dir="$search_dir"
    fi
  done
  if [ -z "$dist_dir" ]; then
    for search_dir in /tmp/dist-onprem-*; do
      if [ -d "$search_dir/server" ] && [ -f "$search_dir/package.json" ]; then
        dist_dir="$search_dir"
        break
      fi
    done
  fi

  if [ -z "$dist_dir" ]; then
    msg_warn "No distribution package found — running with existing scripts"
    return 0
  fi

  local scripts_src="$dist_dir/scripts"
  if [ ! -d "$scripts_src" ]; then
    scripts_src="$dist_dir/onprem"
  fi
  if [ ! -d "$scripts_src" ]; then
    msg_warn "No scripts directory in $dist_dir — running with existing scripts"
    return 0
  fi

  local file_count=0
  mkdir -p "$PERMANENT_SCRIPTS_DIR"
  for src_file in "$scripts_src"/*.sh "$scripts_src"/*.md; do
    [ -f "$src_file" ] || continue
    local fname
    fname="$(basename "$src_file")"
    local dest_file="$PERMANENT_SCRIPTS_DIR/$fname"
    if ! [ -f "$dest_file" ] || ! cmp -s "$src_file" "$dest_file"; then
      cp "$src_file" "$dest_file"
      chmod +x "$dest_file" 2>/dev/null || true
      file_count=$((file_count + 1))
    fi
  done

  if [ "$file_count" -gt 0 ]; then
    msg_success "Refreshed $file_count script(s) from latest distribution"
  else
    msg_info "Scripts already up to date with distribution"
  fi

  echo "$dist_dir" > "$APP_DIR/.dist-source"
  chmod 600 "$APP_DIR/.dist-source"
  chown root:root "$APP_DIR/.dist-source"

  SCRIPT_DIR="$PERMANENT_SCRIPTS_DIR"
  return 0
}

do_setup() {
  local changed=0
  local PERMANENT_SCRIPTS_DIR="$APP_DIR/scripts"

  echo ""
  echo "============================================"
  echo "  LearnPlay Admin Tools Setup"
  echo "============================================"
  echo ""

  # --- Step 1: Copy scripts to permanent location ---
  # If running from outside /opt/learnplay (e.g. /tmp after extraction),
  # copy the entire scripts directory to /opt/learnplay/scripts/ so that
  # everything survives /tmp cleanup and system reboots.
  local source_dir="$SCRIPT_DIR"
  local resolved_source
  resolved_source="$(readlink -f "$source_dir")"

  if [ "$resolved_source" != "$PERMANENT_SCRIPTS_DIR" ]; then
    echo "  Source:      $resolved_source"
    echo "  Destination: $PERMANENT_SCRIPTS_DIR"
    echo ""

    mkdir -p "$PERMANENT_SCRIPTS_DIR"

    local file_count=0
    local skip_count=0
    for src_file in "$source_dir"/*.sh "$source_dir"/*.md; do
      [ -f "$src_file" ] || continue
      local fname
      fname="$(basename "$src_file")"
      local dest_file="$PERMANENT_SCRIPTS_DIR/$fname"

      if [ -f "$dest_file" ] && cmp -s "$src_file" "$dest_file"; then
        skip_count=$((skip_count + 1))
      else
        cp "$src_file" "$dest_file"
        chmod +x "$dest_file" 2>/dev/null || true
        file_count=$((file_count + 1))
      fi
    done

    if [ "$file_count" -gt 0 ]; then
      msg_success "Copied $file_count file(s) to $PERMANENT_SCRIPTS_DIR"
      changed=1
    fi
    if [ "$skip_count" -gt 0 ]; then
      msg_info "$skip_count file(s) already up to date — skipped"
    fi

    SCRIPT_DIR="$PERMANENT_SCRIPTS_DIR"

    # --- Step 1b: Save original dist-onprem source path ---
    # Record where the dist-onprem package lives so app-install.sh / update.sh
    # can find server/, client/, data/, etc. even when running from /opt/learnplay/scripts/
    local dist_source_dir
    dist_source_dir="$(dirname "$resolved_source")"
    if [ -d "$dist_source_dir/server" ] && [ -f "$dist_source_dir/package.json" ]; then
      echo "$dist_source_dir" > "$APP_DIR/.dist-source"
      chmod 600 "$APP_DIR/.dist-source"
      chown root:root "$APP_DIR/.dist-source"
      msg_success "Distribution source saved: $dist_source_dir"
    fi
  else
    msg_info "Scripts already at permanent location: $PERMANENT_SCRIPTS_DIR"
  fi

  # --- Step 2: Create lppadmin command symlink ---
  # Prefer the modern lppadmin script when present; keep lpadmin.sh fallback for legacy bundles.
  local target_script="$PERMANENT_SCRIPTS_DIR/lppadmin.sh"
  if [ ! -f "$target_script" ]; then
    target_script="$PERMANENT_SCRIPTS_DIR/lpadmin.sh"
  fi
  local existing_target=""
  if [ -L /usr/local/bin/lppadmin ]; then
    existing_target="$(readlink -f /usr/local/bin/lppadmin 2>/dev/null || true)"
  fi

  if [ "$existing_target" = "$(readlink -f "$target_script")" ]; then
    msg_info "lppadmin symlink already points to $target_script — no change needed"
  else
    ln -sf "$target_script" /usr/local/bin/lppadmin
    chmod +x "$target_script"
    if [ -n "$existing_target" ]; then
      msg_success "lppadmin symlink updated → $target_script"
    else
      msg_success "lppadmin symlink created: /usr/local/bin/lppadmin → $target_script"
    fi
    changed=1
  fi

  ln -sf "$target_script" /usr/local/bin/lppadmin

  # --- Step 3: Install MOTD welcome screen ---
  local motd_src="$PERMANENT_SCRIPTS_DIR/learnplay-motd.sh"
  if [ -f "$motd_src" ]; then
    if [ -f /etc/profile.d/learnplay-motd.sh ] && cmp -s "$motd_src" /etc/profile.d/learnplay-motd.sh; then
      msg_info "Welcome screen already up to date — no change needed"
    else
      cp "$motd_src" /etc/profile.d/learnplay-motd.sh
      chmod +x /etc/profile.d/learnplay-motd.sh
      msg_success "Welcome screen installed/updated at /etc/profile.d/learnplay-motd.sh"
      changed=1
    fi
  else
    msg_warn "MOTD source not found at $motd_src — skipping welcome screen"
  fi

  # --- Step 4: Ensure log directory ---
  mkdir -p /var/log/learnplay

  # --- Step 5: Mount point verification ---
  echo ""
  echo "  Mount Point Verification:"
  local required_mounts="/opt/learnplay /opt/learnplay/uploads /opt/lpdb /lppbackups /var/log /tmp"
  local recommended_mounts="/home/lppadmin /boot /boot/efi"
  local mount_ok=true

  for mp in $required_mounts; do
    if mountpoint -q "$mp" 2>/dev/null; then
      local usage
      usage=$(df "$mp" 2>/dev/null | awk 'NR==2 {print $5}')
      echo -e "    ${GREEN}✓${NC} $mp (mounted, ${usage} used)"
    elif [ -d "$mp" ]; then
      echo -e "    ${YELLOW}⚠${NC} $mp (exists but not a separate mount — recommended)"
      mount_ok=false
    else
      echo -e "    ${RED}✗${NC} $mp (not found — required)"
      mount_ok=false
    fi
  done

  for mp in $recommended_mounts; do
    if mountpoint -q "$mp" 2>/dev/null; then
      local usage
      usage=$(df "$mp" 2>/dev/null | awk 'NR==2 {print $5}')
      echo -e "    ${GREEN}✓${NC} $mp (mounted, ${usage} used)"
    elif [ -d "$mp" ]; then
      echo -e "    ${YELLOW}~${NC} $mp (exists, not a separate mount)"
    fi
  done

  if [ "$mount_ok" = false ]; then
    echo ""
    echo -e "    ${YELLOW}⚠  Some required mount points are not dedicated partitions.${NC}"
    echo -e "    ${YELLOW}   See the Installation Guide for recommended partition layout.${NC}"
  fi

  # --- Summary ---
  echo ""
  echo "============================================"
  if [ "$changed" -eq 1 ]; then
    msg_success "Setup complete! Scripts installed at $PERMANENT_SCRIPTS_DIR"
  else
    msg_success "Everything is already up to date."
  fi
  echo "============================================"
  echo ""
  echo "  You can now run:"
  echo "    sudo lppadmin            Interactive menu"
  echo "    sudo lppadmin help       List all commands"
  echo ""
  echo "  Log out and back in to see the welcome screen."
  echo ""
}

do_uninstall() {
  if [ -L /usr/local/bin/lppadmin ]; then
    rm -f /usr/local/bin/lppadmin
    msg_success "Removed /usr/local/bin/lppadmin symlink"
  else
    msg_info "/usr/local/bin/lppadmin not found — nothing to remove"
  fi
  [ -L /usr/local/bin/lppadmin ] && rm -f /usr/local/bin/lppadmin || true

  if [ -f /etc/profile.d/learnplay-motd.sh ]; then
    rm -f /etc/profile.d/learnplay-motd.sh
    msg_success "Removed /etc/profile.d/learnplay-motd.sh"
  else
    msg_info "MOTD file not found — nothing to remove"
  fi

  echo ""
  msg_success "Uninstall complete."
}

get_database_url() {
  local db_url=""
  if [ -f "$APP_DIR/.env" ]; then
    db_url=$(sudo -u "$APP_USER" grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
  fi
  if [ -z "$db_url" ]; then
    db_url=$(sudo -u "$APP_USER" pm2 env 0 2>/dev/null | grep -E '^DATABASE_URL:' | head -1 | sed 's/^DATABASE_URL:\s*//' | tr -d '[:space:]' || true)
  fi
  echo "$db_url"
}

do_full_uninstall() {
  log "Starting full uninstall..."

  # Step 1: DR backup as safety net
  log "📦 Creating DR backup before uninstall..."
  if [ -f "$SCRIPT_DIR/dr-backup.sh" ]; then
    bash "$SCRIPT_DIR/dr-backup.sh" --yes 2>&1 | tee -a "$LOG_FILE" || msg_warn "DR backup failed — proceeding anyway"
  else
    msg_warn "DR backup script not found — skipping safety backup"
  fi

  # Step 2: Stop PM2 processes
  log "🛑 Stopping services..."
  if command -v pm2 &>/dev/null; then
    sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true
    sudo -u "$APP_USER" pm2 delete all 2>/dev/null || true
    sudo -u "$APP_USER" pm2 save --force 2>/dev/null || true
    log "   ✅ PM2 processes stopped and removed"
  fi

  # Step 3: Drop all database objects
  log "🗄️  Dropping database objects..."
  if true; then
    local db_url
    db_url=$(get_database_url)
    if [ -n "$db_url" ]; then
      psql "$db_url" -v ON_ERROR_STOP=0 <<'DROPALL' 2>/dev/null || msg_warn "Some objects could not be dropped"
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
  END LOOP;
  FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS "' || r.typname || '" CASCADE';
  END LOOP;
  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS "' || r.sequence_name || '" CASCADE';
  END LOOP;
END $$;
DROPALL
      log "   ✅ Database objects dropped"
    else
      msg_warn "No DATABASE_URL found — database not wiped"
    fi
  fi

  # Step 4: Remove uploaded files
  log "📂 Removing uploaded files..."
  if [ -d "$UPLOAD_DIR" ]; then
    rm -rf "${UPLOAD_DIR:?}/"*
    log "   ✅ Upload directory cleaned"
  fi

  # Step 5: Remove application files (preserve scripts and backups)
  log "📁 Removing application files..."
  for item in server client shared migrations node_modules data \
              package.json package-lock.json version.json ecosystem.config.cjs \
              schema-full.sql create-enums.sql .env .env.backup-* \
              drizzle.config.ts tsconfig.json vite.config.ts; do
    rm -rf "$APP_DIR/$item" 2>/dev/null || true
  done
  log "   ✅ Application files removed"

  # Step 6: Remove install state (allow fresh reinstall)
  rm -f /opt/learnplay/.install-state 2>/dev/null || true

  echo ""
  log "═══════════════════════════════════════════════"
  msg_success "LearnPlay has been fully uninstalled."
  log "═══════════════════════════════════════════════"
  echo ""
  echo "  Preserved:"
  echo "    • DR backups:  ${LEARNPLAY_BACKUP_DIR:-/lppbackups}/"
  echo "    • Admin tool:  /usr/local/bin/lppadmin"
  echo "    • Scripts:     $APP_DIR/scripts/"
  echo "    • Logs:        /var/log/learnplay/"
  echo ""
  echo "  To reinstall: sudo lppadmin install"
  echo ""
}

usage() {
  echo ""
  echo -e "${BOLD}LearnPlay Administration — On-Premises Control Panel${NC}"
  echo ""
  echo "Usage: sudo lppadmin [command] [options]"
  echo ""
  echo "Setup:"
  echo "  setup                        Install lppadmin command & welcome screen"
  echo "  uninstall                    Remove lppadmin command & welcome screen"
  echo "  full-uninstall                Full uninstall (DR backup + wipe)"
  echo "  install                      Run full LearnPlay installation"
  echo ""
  echo "Commands:"
  echo "  start                        Start all services"
  echo "  stop                         Stop all services"
  echo "  restart                      Restart all services"
  echo "  status                       Show service status"
  echo "  health                       Run health check"
  echo "  backup [full|base]           Database backup"
  echo "  restore [latest|pitr <time>] Database restore"
  echo "  config [smtp|url|api-keys|ports|manage|show] Configuration management"
  echo "  ssl [http|https|prefer-https]   SSL/HTTPS mode"
  echo "  secrets [encrypt|decrypt|status] Secrets management"
  echo "  reset-admin                    Reset password & assign admin role"
  echo "  logs [app|nginx|admin|postgres]  View logs"
  echo "  update [/path/to/pkg] [--yes] Update application"
  echo "  tune                         Performance tuning"
  echo "  help                         Show this help"
  echo ""
  echo "Disaster Recovery:"
  echo "  dr-backup [--encrypt] [--yes] Create full system DR backup"
  echo "  dr-restore <archive> [opts]  Restore system from DR backup"
  echo ""
  echo "License & Keys:"
  echo "  license status               Check current license status"
  echo "  keys status                  Show current key bundle status"
  echo "  keys import <path>           Import a provision bundle"
  echo ""
  echo "Run without arguments for interactive menu."
  echo ""
}

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ This script must be run as root (sudo)${NC}"
  exit 1
fi

get_system_status() {
  local pg_ok=false app_ok=false nginx_ok=false

  if systemctl is-active --quiet postgresql 2>/dev/null; then
    pg_ok=true
  fi

  if sudo -u "$APP_USER" pm2 jlist 2>/dev/null | grep -q '"name":"'$APP_NAME'".*"status":"online"'; then
    app_ok=true
  fi

  if systemctl is-active --quiet nginx 2>/dev/null; then
    nginx_ok=true
  fi

  local running=0
  $pg_ok && running=$((running + 1))
  $app_ok && running=$((running + 1))
  $nginx_ok && running=$((running + 1))

  if [ "$running" -eq 3 ]; then
    echo -e "${GREEN}✅ All Services Running${NC}"
  elif [ "$running" -eq 0 ]; then
    echo -e "${RED}❌ Services Down${NC}"
  else
    echo -e "${YELLOW}⚠️  Degraded${NC} ($running/3 running)"
  fi
}

get_version() {
  if [ -f "$APP_DIR/version.json" ]; then
    local ver
    ver=$(grep -oP '"version"\s*:\s*"\K[^"]+' "$APP_DIR/version.json" 2>/dev/null || cat "$APP_DIR/version.json" 2>/dev/null | tr -d '{}"\n ' | sed 's/version://' | cut -d',' -f1)
    echo "${ver:-unknown}"
  else
    echo "unknown"
  fi
}

get_domain() {
  if [ -f "$APP_DIR/.env" ]; then
    local base_url
    base_url=$(grep -E '^BASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d'=' -f2-)
    if [ -n "$base_url" ]; then
      echo "$base_url" | sed 's|https\?://||' | sed 's|/.*||'
      return
    fi
  fi

  if [ -f "$APP_DIR/.env.enc" ]; then
    local pm2_env_url
    pm2_env_url=$(sudo -u "$APP_USER" pm2 env 0 2>/dev/null | grep -E '^BASE_URL:' | head -1 | sed 's/^BASE_URL:\s*//' | tr -d '[:space:]' || echo "")
    if [ -n "$pm2_env_url" ]; then
      echo "$pm2_env_url" | sed 's|https\?://||' | sed 's|/.*||'
      return
    fi
    echo "encrypted"
    return
  fi

  echo "not configured"
}

pause_for_menu() {
  echo ""
  read -rp "Press Enter to return to main menu..." _
}

# ============================================
# SuperAdmin Master Password (bcrypt hash)
# NOTE: This is SEPARATE from LEARNPLAY_MASTER_KEY.
#   - LEARNPLAY_MASTER_KEY = encryption passphrase for .env secrets (managed by secrets-manager.sh)
#   - MASTER_PASSWORD_HASH = bcrypt hash used to gate SuperAdmin role assignment (below)
# These two credentials serve different purposes and must never be confused.
# ============================================
get_master_password_hash() {
  local hash=""
  if [ -f "$APP_DIR/.env" ]; then
    hash=$(sudo -u "$APP_USER" grep -E '^MASTER_PASSWORD_HASH=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
  fi
  if [ -z "$hash" ]; then
    hash=$(sudo -u "$APP_USER" pm2 env 0 2>/dev/null | grep -E '^MASTER_PASSWORD_HASH:' | head -1 | sed 's/^MASTER_PASSWORD_HASH:\s*//' | tr -d '[:space:]' || true)
  fi
  echo "$hash"
}

do_reset_admin() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║        Reset Password & Assign Role              ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "  1) Reset Password & Assign Customer Super Admin (CustSuper)"
  echo "  2) Reset Password & Assign SuperAdmin (requires master password)"
  echo "  3) Set/Update Master Password Hash"
  echo "  0) Back to main menu"
  echo ""
  read -rp "  Select option [0-3]: " role_choice

  case "$role_choice" in
    1)
      _do_reset_admin_role "CustSuper"
      ;;
    2)
      _do_reset_admin_role "SuperAdmin"
      ;;
    3)
      _do_set_master_hash
      ;;
    0)
      return 0
      ;;
    *)
      msg_error "Invalid option"
      return 1
      ;;
  esac
}

_do_set_master_hash() {
  echo ""
  echo -e "${CYAN}  Set or update the master password hash used for SuperAdmin role assignment.${NC}"
  echo ""
  echo -e "  You can enter either:"
  echo -e "    - A pre-computed bcrypt hash (starts with \$2b\$ or \$2a\$)"
  echo -e "    - A plaintext password (min 8 chars) — will be hashed on this server"
  echo ""
  read -rsp "  Enter bcrypt hash or plaintext password: " HASH_INPUT
  echo ""

  if [ -z "$HASH_INPUT" ]; then
    msg_error "Input cannot be empty."
    return 1
  fi

  local FINAL_HASH=""

  if [[ "$HASH_INPUT" == \$2* ]]; then
    FINAL_HASH="$HASH_INPUT"
    msg_info "Detected bcrypt hash format — storing directly."
  else
    if [ ${#HASH_INPUT} -lt 8 ]; then
      msg_error "Password must be at least 8 characters."
      return 1
    fi
    msg_info "Hashing plaintext password..."
    FINAL_HASH=$(echo -n "$HASH_INPUT" | (cd "$APP_DIR" && node -e 'const bcrypt = require("bcrypt"); let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>bcrypt.hash(d,10).then(h=>console.log(h)).catch(e=>{console.error(e.message);process.exit(1)}));') 2>&1)
    if [ -z "$FINAL_HASH" ] || [[ "$FINAL_HASH" != \$2* ]]; then
      msg_error "Failed to hash password. Ensure Node.js and bcrypt are installed in $APP_DIR."
      [ -n "$FINAL_HASH" ] && echo "  Error output: $FINAL_HASH"
      return 1
    fi
  fi

  local ENV_FILE="$APP_DIR/.env"
  if [ ! -f "$ENV_FILE" ]; then
    msg_error ".env file not found at $ENV_FILE"
    return 1
  fi

  if sudo -u "$APP_USER" grep -q '^MASTER_PASSWORD_HASH=' "$ENV_FILE" 2>/dev/null; then
    sudo -u "$APP_USER" sed -i "s|^MASTER_PASSWORD_HASH=.*|MASTER_PASSWORD_HASH=$FINAL_HASH|" "$ENV_FILE"
  else
    echo "MASTER_PASSWORD_HASH=$FINAL_HASH" | sudo -u "$APP_USER" tee -a "$ENV_FILE" > /dev/null
  fi

  audit "set-master-hash"
  msg_success "Master password hash updated in .env"
  echo ""
  msg_info "If the app is running, restart it for changes to take effect:"
  echo "  lpadmin → Service Control → Restart"
}

_do_reset_admin_role() {
  local ROLE="$1"
  echo ""

  if [ "$ROLE" = "SuperAdmin" ]; then
    local MASTER_PASSWORD_HASH
    MASTER_PASSWORD_HASH=$(get_master_password_hash)
    if [ -z "$MASTER_PASSWORD_HASH" ]; then
      msg_error "MASTER_PASSWORD_HASH not found in .env or PM2 environment."
      msg_error "Please set MASTER_PASSWORD_HASH in your .env file or re-run the installer."
      return 1
    fi

    read -rsp "  Enter master password: " MASTER_INPUT
    echo ""
    if [ -z "$MASTER_INPUT" ]; then
      msg_error "Master password cannot be empty."
      return 1
    fi
    local master_ok
    master_ok=$(echo -n "$MASTER_INPUT" | (cd "$APP_DIR" && node -e 'const bcrypt = require("bcrypt"); let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>bcrypt.compare(d,process.argv[1]).then(r=>console.log(r?"true":"false")).catch(e=>{console.error(e.message);process.exit(1)}));' -- "$MASTER_PASSWORD_HASH") 2>&1)
    if [ -z "$master_ok" ]; then
      msg_error "bcrypt verification returned empty output. Check that Node.js and bcrypt are installed in $APP_DIR."
      return 1
    fi
    if [ "$master_ok" != "true" ]; then
      msg_error "Invalid master password."
      return 1
    fi
    msg_success "Master password verified."
    echo ""
  fi

  if ! command -v psql &>/dev/null; then
    msg_error "psql command not found. Please ensure PostgreSQL client is installed."
    return 1
  fi

  local DATABASE_URL="${DATABASE_URL:-}"
  if [ -z "$DATABASE_URL" ]; then
    DATABASE_URL=$(get_database_url)
  fi

  if [ -z "$DATABASE_URL" ]; then
    msg_error "DATABASE_URL not found. Ensure the application is running (PM2) or .env exists."
    return 1
  fi

  read -rp "  Enter user email address: " EMAIL
  if [ -z "$EMAIL" ]; then
    msg_error "Email address cannot be empty."
    return 1
  fi

  if [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    msg_error "Invalid email format"
    return 1
  fi

  local SAFE_EMAIL="${EMAIL//\'/\'\'}"

  local ACCOUNT_INFO=""
  local DB_ERROR=""
  DB_ERROR=$(mktemp)
  ACCOUNT_INFO=$(psql "$DATABASE_URL" -t -A -F'|' -c "SELECT id, email, \"gamerName\" FROM users WHERE email = '${SAFE_EMAIL}';" 2>"$DB_ERROR") || true

  if [ -z "$ACCOUNT_INFO" ]; then
    if [ -s "$DB_ERROR" ]; then
      msg_error "Database error while looking up user:"
      cat "$DB_ERROR"
    else
      msg_error "No user account found with email: $EMAIL"
    fi
    rm -f "$DB_ERROR"
    return 1
  fi
  rm -f "$DB_ERROR"

  local GAMER_NAME
  GAMER_NAME=$(echo "$ACCOUNT_INFO" | cut -d'|' -f3)
  local FOUND_EMAIL
  FOUND_EMAIL=$(echo "$ACCOUNT_INFO" | cut -d'|' -f2)
  echo ""
  msg_info "Found user: $GAMER_NAME ($FOUND_EMAIL)"
  echo ""

  read -rsp "  Enter new password: " NEW_PASSWORD
  echo ""
  read -rsp "  Confirm new password: " CONFIRM_PASSWORD
  echo ""

  if [ -z "$NEW_PASSWORD" ]; then
    msg_error "Password cannot be empty."
    return 1
  fi

  if [ ${#NEW_PASSWORD} -lt 8 ]; then
    msg_error "Password must be at least 8 characters."
    return 1
  fi

  if [ "$NEW_PASSWORD" != "$CONFIRM_PASSWORD" ]; then
    msg_error "Passwords do not match."
    return 1
  fi

  local HASH
  HASH=$(echo -n "$NEW_PASSWORD" | (cd "$APP_DIR" && node -e 'const bcrypt = require("bcrypt"); let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>bcrypt.hash(d,10).then(h=>console.log(h)).catch(e=>{console.error(e.message);process.exit(1)}));') 2>&1)

  if [ -z "$HASH" ] || [[ "$HASH" != \$2* ]]; then
    msg_error "Failed to generate password hash. Ensure Node.js and bcrypt are installed in $APP_DIR."
    [ -n "$HASH" ] && echo "  Error output: $HASH"
    return 1
  fi

  echo ""
  local SAFE_HASH="${HASH//\'/\'\'}"
  local UPDATE_SQL=""
  if [ "$ROLE" = "CustSuper" ]; then
    UPDATE_SQL="UPDATE users SET password = '${SAFE_HASH}', \"isCustSuper\" = true, \"isSuperAdmin\" = false WHERE email = '${SAFE_EMAIL}';"
  else
    UPDATE_SQL="UPDATE users SET password = '${SAFE_HASH}', \"isSuperAdmin\" = true, \"isCustSuper\" = false WHERE email = '${SAFE_EMAIL}';"
  fi

  psql "$DATABASE_URL" -c "$UPDATE_SQL" || { msg_error "Failed to update password in database."; return 1; }

  audit "reset-admin ($ROLE): $EMAIL"
  msg_success "Password reset and $ROLE role assigned successfully for $EMAIL."
}

show_logs_submenu() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║              View Logs                           ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "  1) PM2 Application Logs (live stream, Ctrl+C to stop)"
  echo "  2) Nginx Access Log (live stream, Ctrl+C to stop)"
  echo "  3) Nginx Error Log (live stream, Ctrl+C to stop)"
  echo "  4) Admin Audit Log (live stream, Ctrl+C to stop)"
  echo "  5) PostgreSQL Log (live stream, Ctrl+C to stop)"
  echo "  0) Back to Main Menu"
  echo ""
  read -rp "  Select log [0-5]: " log_choice

  case "$log_choice" in
    1)
      audit "logs app"
      echo ""
      echo -e "${BOLD}PM2 Application Logs (live stream):${NC}"
      echo -e "\n  ${YELLOW}Press Ctrl+C to stop viewing and return to menu${NC}\n"
      trap 'echo ""; return 0' INT
      sudo -u "$APP_USER" pm2 logs "$APP_NAME" --lines 50 2>/dev/null || msg_warn "No PM2 logs available"
      trap - INT
      ;;
    2)
      audit "logs nginx-access"
      echo ""
      echo -e "${BOLD}Nginx Access Log (live stream):${NC}"
      echo -e "\n  ${YELLOW}Press Ctrl+C to stop viewing and return to menu${NC}\n"
      if [ -f /var/log/nginx/access.log ]; then
        trap 'echo ""; return 0' INT
        tail -f /var/log/nginx/access.log
        trap - INT
      else
        msg_warn "Nginx access log not found at /var/log/nginx/access.log"
      fi
      ;;
    3)
      audit "logs nginx-error"
      echo ""
      echo -e "${BOLD}Nginx Error Log (live stream):${NC}"
      echo -e "\n  ${YELLOW}Press Ctrl+C to stop viewing and return to menu${NC}\n"
      if [ -f /var/log/nginx/error.log ]; then
        trap 'echo ""; return 0' INT
        tail -f /var/log/nginx/error.log
        trap - INT
      else
        msg_warn "Nginx error log not found at /var/log/nginx/error.log"
      fi
      ;;
    4)
      audit "logs admin"
      echo ""
      echo -e "${BOLD}Admin Audit Log (live stream):${NC}"
      echo -e "\n  ${YELLOW}Press Ctrl+C to stop viewing and return to menu${NC}\n"
      if [ -f "$LOG_FILE" ]; then
        trap 'echo ""; return 0' INT
        tail -f "$LOG_FILE"
        trap - INT
      else
        msg_warn "Admin log not found at $LOG_FILE"
      fi
      ;;
    5)
      audit "logs postgres"
      echo ""
      echo -e "${BOLD}PostgreSQL Log (live stream):${NC}"
      echo -e "\n  ${YELLOW}Press Ctrl+C to stop viewing and return to menu${NC}\n"
      local pg_log
      pg_log=$(find /var/log/postgresql -name "*.log" -type f 2>/dev/null | sort -r | head -1)
      if [ -n "$pg_log" ]; then
        trap 'echo ""; return 0' INT
        tail -f "$pg_log"
        trap - INT
      else
        msg_warn "PostgreSQL log not found in /var/log/postgresql/"
      fi
      ;;
    0)
      return 0
      ;;
    *)
      msg_error "Invalid option"
      ;;
  esac
}

show_logs_cli() {
  local target="${1:-}"
  case "$target" in
    app)
      trap 'return 0' INT
      sudo -u "$APP_USER" pm2 logs "$APP_NAME" --lines 50 2>/dev/null || msg_warn "No PM2 logs available"
      trap - INT
      ;;
    nginx)
      if [ -f /var/log/nginx/access.log ]; then
        trap 'return 0' INT
        tail -f /var/log/nginx/access.log
        trap - INT
      else
        msg_warn "Nginx access log not found"
      fi
      ;;
    admin)
      if [ -f "$LOG_FILE" ]; then
        trap 'return 0' INT
        tail -f "$LOG_FILE"
        trap - INT
      else
        msg_warn "Admin log not found"
      fi
      ;;
    postgres)
      local pg_log
      pg_log=$(find /var/log/postgresql -name "*.log" -type f 2>/dev/null | sort -r | head -1)
      if [ -n "$pg_log" ]; then
        trap 'return 0' INT
        tail -f "$pg_log"
        trap - INT
      else
        msg_warn "PostgreSQL log not found"
      fi
      ;;
    *)
      echo "Usage: $0 logs [app|nginx|admin|postgres]"
      return 1
      ;;
  esac
}

show_menu() {
  while true; do
    clear

    local status_line
    status_line=$(get_system_status)
    local version
    version=$(get_version)
    local domain
    domain=$(get_domain)

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                  ║${NC}"
    echo -e "${CYAN}║${NC}${WHITE}${BOLD}          LearnPlay Administration                ${NC}${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}${WHITE}          On-Premises Control Panel               ${NC}${CYAN}║${NC}"
    echo -e "${CYAN}║                                                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  System Status: $status_line"
    echo -e "  Version: ${BOLD}$version${NC}  |  Domain: ${BOLD}$domain${NC}"
    echo ""
    echo -e "  ${BOLD}─── Services ─────────────────────────────${NC}"
    echo "   1) Start / Stop / Restart Services"
    echo "   2) View Service Status & Health"
    echo ""
    echo -e "  ${BOLD}─── Configuration ────────────────────────${NC}"
    echo "   3) Email / SMTP Settings"
    echo "   4) Base URL & Domain"
    echo "   5) API Keys & Secrets Management"
    echo "   6) SSL / HTTPS Mode"
    echo "   7) Port Configuration"
    echo ""
    echo -e "  ${BOLD}─── Database ─────────────────────────────${NC}"
    echo "   8) Backup Database"
    echo "   9) Restore Database"
    echo ""
    echo -e "  ${BOLD}─── Security ─────────────────────────────${NC}"
    echo "  10) Secrets Manager (Encrypt/Decrypt)"
    echo "  11) Reset Password & Assign Admin Role"
    echo "  12) Security Lockdown"
    echo ""
    echo -e "  ${BOLD}─── Maintenance ──────────────────────────${NC}"
    echo "  13) Update Application"
    echo "  14) Performance Tuning"
    echo "  15) View Logs"
    echo ""
    echo -e "  ${BOLD}─── Disaster Recovery ─────────────────────${NC}"
    echo "  16) Create DR Backup (Full System)"
    echo "  17) Restore from DR Backup"
    echo ""
    echo -e "  ${BOLD}─── Setup & Installation ─────────────────${NC}"
    echo "  18) Install lppadmin Command & Welcome Screen"
    echo "  19) Full Installation (master-install.sh)"
    echo "  20) View Installation Log"
    echo ""
    echo "  21) Uninstall LearnPlay (Full Wipe)"
    echo ""
    echo "   0) Exit"
    echo ""
    read -rp "  Select option [0-21]: " choice

    echo ""
    case "$choice" in
      1)
        audit "service-control interactive"
        run_script "service-control.sh" || msg_error "Service control encountered an error"
        pause_for_menu
        ;;
      2)
        audit "service status+health"
        run_script "service-control.sh" status || msg_error "Status check encountered an error"
        echo ""
        run_script "service-control.sh" health || msg_error "Health check encountered an error"
        pause_for_menu
        ;;
      3)
        audit "config smtp"
        run_script "configure-env.sh" smtp || msg_error "SMTP configuration encountered an error"
        pause_for_menu
        ;;
      4)
        audit "config url"
        run_script "configure-env.sh" url || msg_error "URL configuration encountered an error"
        pause_for_menu
        ;;
      5)
        audit "config api-keys+secrets"
        run_script "configure-env.sh" || msg_error "Configuration manager encountered an error"
        pause_for_menu
        ;;
      6)
        audit "ssl interactive"
        run_script "ssl-mode.sh" || msg_error "SSL mode configuration encountered an error"
        pause_for_menu
        ;;
      7)
        audit "config ports"
        run_script "configure-env.sh" ports || msg_error "Port configuration encountered an error"
        pause_for_menu
        ;;
      8)
        audit "backup interactive"
        run_script "db-backup.sh" || msg_error "Database backup encountered an error"
        pause_for_menu
        ;;
      9)
        audit "restore interactive"
        run_script "db-restore.sh" || msg_error "Database restore encountered an error"
        pause_for_menu
        ;;
      10)
        audit "secrets interactive"
        run_script "secrets-manager.sh" || msg_error "Secrets manager encountered an error"
        pause_for_menu
        ;;
      11)
        audit "reset-admin interactive"
        do_reset_admin
        pause_for_menu
        ;;
      12)
        audit "security-lockdown"
        run_script "security-lockdown.sh" || msg_error "Security lockdown encountered an error"
        pause_for_menu
        ;;
      13)
        audit "update"
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║              Update Application                   ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  Current version: ${BOLD}$(get_version)${NC}"
        echo ""
        echo "  To update, you need an update package directory."
        echo "  This is the extracted release archive containing"
        echo "  server/, client/, migrations/, and version.json."
        echo ""
        read -rp "  Enter path to update package (or 'q' to cancel): " update_pkg_path
        
        if [ "$update_pkg_path" = "q" ] || [ -z "$update_pkg_path" ]; then
          msg_info "Update cancelled."
        elif [ ! -d "$update_pkg_path" ]; then
          msg_error "Directory not found: $update_pkg_path"
        elif [ ! -f "$update_pkg_path/version.json" ]; then
          msg_error "Not a valid update package (missing version.json)"
        else
          local new_ver
          new_ver=$(grep -oP '"version"\s*:\s*"\K[^"]+' "$update_pkg_path/version.json" 2>/dev/null || echo "unknown")
          echo ""
          echo -e "  Current: ${BOLD}$(get_version)${NC}"
          echo -e "  Package: ${GREEN}${BOLD}$new_ver${NC}"
          echo ""
          read -rp "  Proceed with update? [y/N]: " confirm_update
          if [[ "$confirm_update" =~ ^[Yy]$ ]]; then
            local pkg_update_script="$update_pkg_path/onprem/update.sh"
            if [ -f "$pkg_update_script" ]; then
              bash "$pkg_update_script" --yes || msg_error "Update encountered an error"
            elif [ -f "$update_pkg_path/scripts/update.sh" ]; then
              bash "$update_pkg_path/scripts/update.sh" --yes || msg_error "Update encountered an error"
            else
              msg_error "Update script not found in the package"
            fi
          else
            msg_info "Update cancelled."
          fi
        fi
        pause_for_menu
        ;;
      14)
        audit "perf-tune"
        run_script "perf-tune.sh" || msg_error "Performance tuning encountered an error"
        pause_for_menu
        ;;
      15)
        audit "logs submenu"
        show_logs_submenu
        pause_for_menu
        ;;
      16)
        audit "dr-backup interactive"
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║         Disaster Recovery Backup                 ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
        echo ""
        echo "  This creates a FULL system backup including:"
        echo "    • Database (complete dump)"
        echo "    • All uploaded files"
        echo "    • Environment configuration (encrypted)"
        echo "    • Nginx, SSL, and PM2 configs"
        echo "    • OS settings snapshot"
        echo ""
        read -rp "  Encrypt the DR backup? [y/N]: " dr_encrypt
        if [[ "$dr_encrypt" =~ ^[Yy]$ ]]; then
          run_script "dr-backup.sh" --encrypt || msg_error "DR backup encountered an error"
        else
          run_script "dr-backup.sh" || msg_error "DR backup encountered an error"
        fi
        pause_for_menu
        ;;
      17)
        audit "dr-restore interactive"
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║         Disaster Recovery Restore                ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  ${YELLOW}⚠️  This will restore an entire system from a DR backup.${NC}"
        echo -e "  ${YELLOW}   Use this on a clean/fresh host for disaster recovery.${NC}"
        echo ""
        local dr_dir="${LEARNPLAY_BACKUP_DIR:-/lppbackups}/disaster-recovery"
        if [ -d "$dr_dir" ] && ls "$dr_dir"/dr_*.tar.gz* 2>/dev/null | head -1 > /dev/null 2>&1; then
          echo "  Available DR backups:"
          local dr_idx=0
          local -a dr_files=()
          while IFS= read -r drf; do
            dr_idx=$((dr_idx + 1))
            dr_files+=("$drf")
            local dr_size
            dr_size=$(du -h "$drf" | cut -f1)
            local dr_date
            dr_date=$(stat -c '%y' "$drf" | cut -d'.' -f1)
            echo "    $dr_idx) $(basename "$drf")  ($dr_size, $dr_date)"
          done < <(ls -t "$dr_dir"/dr_*.tar.gz* 2>/dev/null)
          echo ""
          read -rp "  Select DR backup [1-$dr_idx] or enter path (q to cancel): " dr_selection
          if [[ "$dr_selection" == "q" || -z "$dr_selection" ]]; then
            msg_info "DR restore cancelled."
          elif [[ "$dr_selection" =~ ^[0-9]+$ ]] && [ "$dr_selection" -ge 1 ] && [ "$dr_selection" -le "$dr_idx" ]; then
            run_script "dr-restore.sh" "${dr_files[$((dr_selection - 1))]}" || msg_error "DR restore encountered an error"
          elif [ -f "$dr_selection" ]; then
            run_script "dr-restore.sh" "$dr_selection" || msg_error "DR restore encountered an error"
          else
            msg_error "Invalid selection or file not found: $dr_selection"
          fi
        else
          echo "  No DR backups found in $dr_dir"
          echo ""
          read -rp "  Enter path to DR backup archive (or 'q' to cancel): " dr_path
          if [[ "$dr_path" == "q" || -z "$dr_path" ]]; then
            msg_info "DR restore cancelled."
          elif [ -f "$dr_path" ]; then
            run_script "dr-restore.sh" "$dr_path" || msg_error "DR restore encountered an error"
          else
            msg_error "File not found: $dr_path"
          fi
        fi
        pause_for_menu
        ;;
      18)
        audit "setup lppadmin"
        do_setup
        pause_for_menu
        ;;
      19)
        audit "full installation"
        echo ""
        msg_info "Refreshing scripts from latest distribution package..."
        refresh_scripts_from_dist
        echo ""
        run_script "master-install.sh" || msg_error "Full installation encountered an error"
        pause_for_menu
        ;;
      20)
        audit "view install log"
        local summary_log="/var/log/learnplay/install-summary.log"
        local master_log="/var/log/learnplay-master-install.log"
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║            Installation Log                      ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
        echo ""
        if [ -f "$summary_log" ]; then
          echo -e "  ${BOLD}Installation Summary:${NC}"
          echo ""
          cat "$summary_log"
        else
          msg_warn "No installation summary found at $summary_log"
        fi
        echo ""
        if [ -f "$master_log" ]; then
          echo -e "  ${BOLD}Full installation log:${NC} $master_log"
          echo "  (Use 'less $master_log' to view the full log)"
        fi
        pause_for_menu
        ;;
      21)
        audit "full-uninstall interactive"
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║       Full Uninstall — LearnPlay Removal         ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  ${RED}⚠️  WARNING: This will permanently remove LearnPlay${NC}"
        echo ""
        echo "  This will:"
        echo "    • Create a DR backup first (safety net)"
        echo "    • Stop all services (PM2, Nginx)"
        echo "    • Drop all database objects"
        echo "    • Remove uploaded files"
        echo "    • Remove application files"
        echo ""
        echo "  This will PRESERVE:"
        echo "    • DR backups in ${LEARNPLAY_BACKUP_DIR:-/lppbackups}/"
        echo "    • lppadmin tool (for future reinstall)"
        echo "    • Installation logs"
        echo ""
        echo -e "  ${RED}Type 'UNINSTALL' to confirm:${NC}"
        read -rp "  > " uninstall_confirm
        if [ "$uninstall_confirm" != "UNINSTALL" ]; then
          msg_info "Uninstall cancelled."
        else
          echo ""
          do_full_uninstall
        fi
        pause_for_menu
        ;;
      0)
        audit "exit"
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;
      *)
        msg_error "Invalid option. Please select 0-21."
        sleep 1
        ;;
    esac
  done
}

if [ $# -eq 0 ]; then
  show_menu
  exit 0
fi

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
  start)
    audit "start $*"
    run_script "service-control.sh" start "$@"
    ;;
  stop)
    audit "stop $*"
    run_script "service-control.sh" stop "$@"
    ;;
  restart)
    audit "restart $*"
    run_script "service-control.sh" restart "$@"
    ;;
  status)
    audit "status $*"
    run_script "service-control.sh" status "$@"
    ;;
  health)
    audit "health"
    run_script "service-control.sh" health
    ;;
  backup)
    audit "backup $*"
    run_script "db-backup.sh" "$@"
    ;;
  restore)
    audit "restore $*"
    run_script "db-restore.sh" "$@"
    ;;
  config)
    audit "config $*"
    run_script "configure-env.sh" "$@"
    ;;
  ssl)
    audit "ssl $*"
    run_script "ssl-mode.sh" "$@"
    ;;
  secrets)
    audit "secrets $*"
    run_script "secrets-manager.sh" "$@"
    ;;
  reset-admin)
    audit "reset-admin $*"
    do_reset_admin
    ;;
  reset-admin-custsuper)
    audit "reset-admin-custsuper $*"
    _do_reset_admin_role "CustSuper"
    ;;
  reset-admin-super)
    audit "reset-admin-super $*"
    _do_reset_admin_role "SuperAdmin"
    ;;
  logs)
    audit "logs $*"
    show_logs_cli "${1:-}"
    ;;
  update)
    audit "update $*"
    UPDATE_PKG="${1:-}"
    if [ -n "$UPDATE_PKG" ] && [ -d "$UPDATE_PKG" ]; then
      if [ -f "$UPDATE_PKG/onprem/update.sh" ]; then
        bash "$UPDATE_PKG/onprem/update.sh" "${@:2}"
      elif [ -f "$UPDATE_PKG/scripts/update.sh" ]; then
        bash "$UPDATE_PKG/scripts/update.sh" "${@:2}"
      else
        msg_error "Update script not found in package: $UPDATE_PKG"
        exit 1
      fi
    elif [ -f "$SCRIPT_DIR/update.sh" ]; then
      run_script "update.sh" "$@"
    else
      echo ""
      echo "Usage: $0 update /path/to/update-package [--yes]"
      echo ""
      echo "  The update package is the extracted release archive."
      echo "  Use --yes to skip confirmation prompts."
      echo ""
      msg_error "Provide the path to the update package directory."
      exit 1
    fi
    ;;
  tune)
    audit "perf-tune"
    run_script "perf-tune.sh" "$@"
    ;;
  setup)
    audit "setup"
    do_setup
    ;;
  uninstall)
    audit "uninstall"
    do_uninstall
    ;;
  install)
    audit "install $*"
    refresh_scripts_from_dist
    run_script "master-install.sh" "$@"
    ;;
  dr-backup)
    audit "dr-backup $*"
    run_script "dr-backup.sh" "$@"
    ;;
  dr-restore)
    audit "dr-restore $*"
    run_script "dr-restore.sh" "$@"
    ;;
  keys)
    audit "keys $*"
    case "${1:-}" in
      status)
        if [ -f "/opt/learnplay/keys/provision-bundle.json" ]; then
          echo -e "${GREEN}✅ Provision bundle found at /opt/learnplay/keys/provision-bundle.json${NC}"
          python3 -c "
import json
with open('/opt/learnplay/keys/provision-bundle.json') as f:
    bundle = json.load(f)
payload = json.loads(bundle.get('payload', '{}'))
keys = payload.get('keys', {})
print(f'  Customer: {payload.get(\"enterpriseCustomerId\", \"unknown\")}')
print(f'  Issued: {payload.get(\"issuedAt\", \"unknown\")}')
for purpose, info in keys.items():
    print(f'  Key [{purpose}]: version={info.get(\"version\",\"?\")} keyId={info.get(\"keyId\",\"?\")[:16]}...')
" 2>/dev/null || echo "  (Could not parse bundle)"
        else
          echo -e "${YELLOW}⚠️  No provision bundle found at /opt/learnplay/keys/provision-bundle.json${NC}"
          echo "  Download your key bundle from the enterprise portal and place it there."
        fi
        ;;
      import)
        src="${2:-}"
        if [ -z "$src" ]; then
          echo -e "${RED}Usage: lpadmin keys import <path-to-bundle.json>${NC}"
          exit 1
        fi
        if [ ! -f "$src" ]; then
          echo -e "${RED}File not found: $src${NC}"
          exit 1
        fi
        mkdir -p /opt/learnplay/keys
        cp "$src" /opt/learnplay/keys/provision-bundle.json
        chmod 600 /opt/learnplay/keys/provision-bundle.json
        chown "$APP_USER:$APP_USER" /opt/learnplay/keys/provision-bundle.json
        echo -e "${GREEN}✅ Provision bundle imported to /opt/learnplay/keys/provision-bundle.json${NC}"
        ;;
      *)
        echo "Usage: lpadmin keys <command>"
        echo ""
        echo "Commands:"
        echo "  status    Show current key bundle status"
        echo "  import    Import a provision bundle from the enterprise portal"
        echo ""
        ;;
    esac
    ;;
  license)
    audit "license $*"
    case "${1:-}" in
      status)
        curl -s http://localhost:5000/api/onprem/license/validate 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('valid'):
    print(f'✅ License: VALID')
    print(f'   System Type: {data.get(\"systemType\", \"unknown\")}')
    print(f'   Expires: {data.get(\"expiresAt\", \"unknown\")}')
else:
    print(f'❌ License: {\"EXPIRED\" if data.get(\"isExpired\") else \"NOT FOUND\"}')
    if not data.get('hasLicense'):
        print('   No license installed. Generate a request and submit to the cloud portal.')
" 2>/dev/null || echo "❌ Could not connect to application (is it running?)"
        ;;
      *)
        echo "Usage: lpadmin license <command>"
        echo ""
        echo "Commands:"
        echo "  status    Check current license status"
        echo ""
        ;;
    esac
    ;;
  full-uninstall)
    audit "full-uninstall $*"
    echo ""
    echo -e "${RED}⚠️  Full uninstall will permanently remove LearnPlay.${NC}"
    echo -e "${RED}   A DR backup will be created first.${NC}"
    echo ""
    echo -e "Type 'UNINSTALL' to confirm:"
    read -rp "  > " uninstall_confirm
    if [ "$uninstall_confirm" != "UNINSTALL" ]; then
      msg_info "Uninstall cancelled."
    else
      do_full_uninstall
    fi
    ;;
  install-log)
    audit "install-log"
    local summary_log="/var/log/learnplay/install-summary.log"
    if [ -f "$summary_log" ]; then
      cat "$summary_log"
    else
      echo "No installation summary found."
      echo "Run a full installation first, or check $summary_log"
      exit 1
    fi
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    msg_error "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac
