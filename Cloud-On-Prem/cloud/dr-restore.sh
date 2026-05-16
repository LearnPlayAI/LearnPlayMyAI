#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="${LEARNPLAY_APP_DIR:-/opt/learnplay/cloud}"
if [ ! -f "${APP_DIR}/.env" ] && [ -f "/opt/learnplay/.env" ]; then
  APP_DIR="/opt/learnplay"
fi
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
UPLOAD_DIR="${UPLOAD_DIR:-${APP_DIR}/uploads}"
BACKUP_DIR="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
DR_DIR="$BACKUP_DIR/disaster-recovery/cloud"
LOG_FILE="/var/log/learnplay/admin.log"
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

STAGING_DIR=""
FLAG_FULL=false
FLAG_SKIP_PREP=false
FLAG_YES=false
FLAG_NEW_DOMAIN=""
ARCHIVE_PATH=""
DOMAIN_CHANGED=false
OLD_DOMAIN=""
NEW_DOMAIN=""
KEY_FILE=""
DR_MODE="clone"
FLAG_VALIDATE_ONLY=false
WARNINGS=()
RESTORED_COMPONENTS=()

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [dr-restore] $*" | tee -a "$LOG_FILE"; }

die() {
  echo -e "${RED}❌ $*${NC}" >&2
  log "ERROR: $*"
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠️  $*${NC}"
  log "WARNING: $*"
  WARNINGS+=("$*")
}

success() {
  echo -e "${GREEN}✅ $*${NC}"
  log "$*"
}

phase_header() {
  local phase="$1"
  local title="$2"
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  Phase ${phase}: ${title}${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  log "=== Phase ${phase}: ${title} ==="
}

header() {
  echo -e "${CYAN}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║     LearnPlay Disaster Recovery Restore          ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

confirm() {
  local prompt="${1:-Are you sure?}"
  if [ "$FLAG_YES" = true ]; then
    return 0
  fi
  echo -e "${YELLOW}${prompt}${NC}"
  read -rp "Type 'yes' to confirm: " answer
  [[ "$answer" == "yes" ]]
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

cleanup() {
  if [ -n "$STAGING_DIR" ] && [ -d "$STAGING_DIR" ]; then
    log "Cleaning up staging directory: $STAGING_DIR"
    rm -rf "$STAGING_DIR"
  fi
}

trap cleanup EXIT

usage() {
  echo ""
  echo "Usage: dr-restore.sh <archive_path> [options]"
  echo ""
  echo "Restore a complete LearnPlay system from a DR backup archive."
  echo ""
  echo "Options:"
  echo "  --full              Run full system prep (os-prep + install-deps) automatically"
  echo "  --skip-prep         Skip system preparation"
  echo "  --yes               Skip confirmation prompts"
  echo "  --new-domain <domain>  Set a new domain (skip interactive prompt)"
  echo "  --key-file=PATH     Path to provision bundle JSON for backup decryption key"
  echo "  --validate-only     Validate archive and manifest only (no restore)"
  echo "  --help              Show this help"
  echo ""
  echo "DR Modes (detected automatically from backup manifest):"
  echo "  clone        Full restore of everything (default)"
  echo "  create-prod  New production instance — skips env/SSL, resets sessions/license"
  echo "  system-copy  Refresh content data only — preserves target system identity"
  echo ""
}

manifest_get() {
  local path="$1"
  local default_value="${2:-}"
  if [ ! -f "$STAGING_DIR/manifest.json" ] || ! command -v python3 >/dev/null 2>&1; then
    printf '%s' "$default_value"
    return 0
  fi
  python3 - "$STAGING_DIR/manifest.json" "$path" "$default_value" <<'PY' 2>/dev/null || printf '%s' "$default_value"
import json
import sys

manifest_path = sys.argv[1]
path = sys.argv[2]
default_value = sys.argv[3]

try:
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    value = data
    for part in path.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            print(default_value, end="")
            sys.exit(0)
    if value is None:
        print(default_value, end="")
    elif isinstance(value, (dict, list)):
        print(json.dumps(value), end="")
    else:
        print(str(value), end="")
except Exception:
    print(default_value, end="")
PY
}

get_encryption_key() {
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

  local key="${LEARNPLAY_BACKUP_KEY:-}"
  if [ -z "$key" ]; then
    read -rsp "Enter backup encryption passphrase: " key
    echo ""
    if [ -z "$key" ]; then
      die "No passphrase provided"
    fi
  fi
  echo "$key"
}

run_sibling_script() {
  local script="$1"
  shift
  local script_path="$SCRIPT_DIR/$script"
  if [ -f "$script_path" ]; then
    bash "$script_path" "$@"
  else
    warn "Script not found: $script_path — skipping"
    return 1
  fi
}

create_pre_restore_backup() {
  if ! command -v psql &>/dev/null; then
    return 0
  fi
  if ! sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$APP_NAME"; then
    return 0
  fi

  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  mkdir -p "$DR_DIR"
  local backup_file="$DR_DIR/pre_dr_restore_${timestamp}.sql.gz"

  log "Creating pre-restore backup of current database..."
  echo -e "${CYAN}💾 Creating pre-restore backup of existing database...${NC}"

  if sudo -u postgres pg_dump "$APP_NAME" 2>/dev/null | gzip > "$backup_file"; then
    local size
    size=$(stat -c%s "$backup_file" 2>/dev/null || echo "0")
    if [ "$size" -gt 0 ]; then
      success "Pre-restore backup saved: $backup_file ($(human_size "$size"))"
    else
      rm -f "$backup_file"
      warn "Pre-restore backup was empty — database may not have data"
    fi
  else
    warn "Pre-restore backup failed — continuing anyway"
    rm -f "$backup_file"
  fi
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --full)
        FLAG_FULL=true
        shift
        ;;
      --skip-prep)
        FLAG_SKIP_PREP=true
        shift
        ;;
      --yes)
        FLAG_YES=true
        shift
        ;;
      --key-file=*)
        KEY_FILE="${1#--key-file=}"
        if [ ! -f "$KEY_FILE" ]; then
          die "Key file not found: $KEY_FILE"
        fi
        shift
        ;;
      --validate-only)
        FLAG_VALIDATE_ONLY=true
        FLAG_SKIP_PREP=true
        shift
        ;;
      --new-domain)
        if [ -z "${2:-}" ]; then
          die "--new-domain requires a domain argument"
        fi
        FLAG_NEW_DOMAIN="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        if [ -z "$ARCHIVE_PATH" ]; then
          ARCHIVE_PATH="$1"
        else
          die "Unexpected argument: $1"
        fi
        shift
        ;;
    esac
  done

  if [ -z "$ARCHIVE_PATH" ]; then
    usage
    die "Archive path is required"
  fi
}

phase_0_validation() {
  phase_header "0" "Validation"

  if [ "$EUID" -ne 0 ]; then
    die "This script must be run as root (sudo)"
  fi

  if [ ! -f "$ARCHIVE_PATH" ]; then
    die "Archive not found: $ARCHIVE_PATH"
  fi

  if [ ! -r "$ARCHIVE_PATH" ]; then
    die "Archive is not readable: $ARCHIVE_PATH"
  fi

  local archive_size
  archive_size=$(stat -c%s "$ARCHIVE_PATH" 2>/dev/null || echo "0")
  if [ "$archive_size" -eq 0 ]; then
    die "Archive file is empty: $ARCHIVE_PATH"
  fi

  echo -e "${BOLD}Archive:${NC} $(basename "$ARCHIVE_PATH") ($(human_size "$archive_size"))"
  echo ""

  local working_archive="$ARCHIVE_PATH"

  if [[ "$ARCHIVE_PATH" == *.enc ]]; then
    echo -e "${CYAN}🔐 Encrypted archive detected — decrypting...${NC}"
    local key
    key=$(get_encryption_key)

    local decrypted="${ARCHIVE_PATH%.enc}"
    if openssl enc -aes-256-cbc -d -pbkdf2 -in "$ARCHIVE_PATH" -out "$decrypted" -pass "pass:$key" 2>/dev/null; then
      success "Archive decrypted"
      working_archive="$decrypted"
    else
      rm -f "$decrypted"
      die "Decryption failed — wrong passphrase or corrupted file"
    fi
  fi

  if [[ "$working_archive" != *.tar.gz ]]; then
    die "Archive must be a .tar.gz (or .tar.gz.enc) file"
  fi

  echo -e "${CYAN}🔍 Verifying archive integrity...${NC}"
  if ! gzip -t "$working_archive" 2>/dev/null; then
    die "Archive failed gzip integrity check — file may be corrupted"
  fi
  success "Archive integrity verified"

  STAGING_DIR=$(mktemp -d /tmp/learnplay-dr-restore-XXXXXX)
  log "Extracting archive to staging directory: $STAGING_DIR"
  echo -e "${CYAN}📦 Extracting archive to staging directory...${NC}"

  if ! tar xzf "$working_archive" -C "$STAGING_DIR" 2>/dev/null; then
    die "Failed to extract archive"
  fi
  success "Archive extracted"

  if [ ! -f "$STAGING_DIR/manifest.json" ]; then
    warn "manifest.json not found in archive — falling back to clone mode"
    DR_MODE="clone"
  else
    success "Manifest found"
    DR_MODE=$(manifest_get "mode" "clone")
    if [ "$DR_MODE" != "clone" ] && [ "$DR_MODE" != "create-prod" ] && [ "$DR_MODE" != "system-copy" ]; then
      warn "Invalid DR mode '$DR_MODE' in manifest — falling back to clone"
      DR_MODE="clone"
    fi
  fi
  log "DR mode detected: $DR_MODE"
  echo -e "${BOLD}DR Mode:${NC}        $DR_MODE"

  echo -e "${CYAN}🔍 Validating checksums...${NC}"

  local manifest_db_checksum manifest_uploads_checksum
  manifest_db_checksum=$(manifest_get "components.database.checksum" "")
  manifest_uploads_checksum=$(manifest_get "components.uploads.checksum" "")
  if [ -z "$manifest_db_checksum" ]; then
    manifest_db_checksum=$(manifest_get "database_checksum" "")
  fi
  if [ -z "$manifest_uploads_checksum" ]; then
    manifest_uploads_checksum=$(manifest_get "uploads_checksum" "")
  fi

  if [ -f "$STAGING_DIR/database.sql.gz" ] && [ -n "$manifest_db_checksum" ]; then
    local actual_db_checksum
    actual_db_checksum=$(sha256sum "$STAGING_DIR/database.sql.gz" | awk '{print $1}')
    if [ "$actual_db_checksum" != "$manifest_db_checksum" ]; then
      die "Database checksum mismatch! Archive may be corrupted."
    fi
    success "Database checksum verified"
  elif [ -f "$STAGING_DIR/database.sql.gz" ]; then
    warn "No database checksum in manifest — skipping verification"
  fi

  if [ -f "$STAGING_DIR/uploads.tar.gz" ] && [ -n "$manifest_uploads_checksum" ]; then
    local actual_uploads_checksum
    actual_uploads_checksum=$(sha256sum "$STAGING_DIR/uploads.tar.gz" | awk '{print $1}')
    if [ "$actual_uploads_checksum" != "$manifest_uploads_checksum" ]; then
      die "Uploads checksum mismatch! Archive may be corrupted."
    fi
    success "Uploads checksum verified"
  elif [ -f "$STAGING_DIR/uploads.tar.gz" ]; then
    warn "No uploads checksum in manifest — skipping verification"
  fi


  echo ""
  echo -e "${BOLD}Archive Information:${NC}"

  local ar_created ar_hostname ar_version ar_os ar_pg_version
  ar_created=$(manifest_get "created_at" "")
  if [ -z "$ar_created" ]; then
    ar_created=$(manifest_get "created" "unknown")
  fi
  ar_hostname=$(manifest_get "hostname" "unknown")
  ar_version=$(manifest_get "app_version" "unknown")
  ar_os=$(manifest_get "os_version" "")
  if [ -z "$ar_os" ]; then
    ar_os=$(manifest_get "os" "unknown")
  fi
  ar_pg_version=$(manifest_get "postgres_version" "")
  if [ -z "$ar_pg_version" ]; then
    ar_pg_version=$(manifest_get "pg_version" "unknown")
  fi

  echo "  Created:      $ar_created"
  echo "  Hostname:     $ar_hostname"
  echo "  App Version:  $ar_version"
  echo "  OS:           $ar_os"
  echo "  PostgreSQL:   $ar_pg_version"
  echo ""

  local current_os current_pg_version
  current_os=$(lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || echo "unknown")
  current_pg_version=$(psql --version 2>/dev/null | awk '{print $3}' || echo "not installed")

  if [ "$ar_os" != "unknown" ] && [ "$current_os" != "unknown" ] && [ "$ar_os" != "$current_os" ]; then
    warn "OS differs: archive='$ar_os' vs current='$current_os'"
  fi

  if [ "$ar_pg_version" != "unknown" ] && [ "$current_pg_version" != "not installed" ]; then
    local ar_pg_major current_pg_major
    ar_pg_major=$(echo "$ar_pg_version" | grep -oE '[0-9]+' | head -1 || true)
    current_pg_major=$(echo "$current_pg_version" | grep -oE '[0-9]+' | head -1 || true)
    if [ -n "$ar_pg_major" ] && [ -n "$current_pg_major" ] && [ "$ar_pg_major" != "$current_pg_major" ]; then
      warn "PostgreSQL major version differs: archive=$ar_pg_major vs current=$current_pg_major"
    fi
  fi

  if [ "$FLAG_YES" != true ]; then
    echo ""
    if ! confirm "Proceed with DR restore from this archive?"; then
      log "DR restore cancelled by user"
      echo "Restore cancelled."
      exit 0
    fi
  fi

  success "Phase 0 complete — archive validated"
}

phase_1_system_prep() {
  phase_header "1" "System Preparation"

  if [ "$FLAG_SKIP_PREP" = true ]; then
    echo -e "${YELLOW}⏭️  System preparation skipped (--skip-prep)${NC}"
    log "System preparation skipped by flag"
    return 0
  fi

  if [ "$FLAG_FULL" = true ]; then
    echo -e "${CYAN}Running full system preparation (--full)...${NC}"
    echo ""

    echo -e "${BOLD}Step 1: OS Preparation${NC}"
    if [ -f "$STAGING_DIR/os-settings.json" ]; then
      local saved_ssh_port saved_timezone
      saved_ssh_port=$(grep -oP '"ssh_port"\s*:\s*"\K[^"]+' "$STAGING_DIR/os-settings.json" 2>/dev/null || echo "22")
      saved_timezone=$(grep -oP '"timezone"\s*:\s*"\K[^"]+' "$STAGING_DIR/os-settings.json" 2>/dev/null || echo "UTC")
      export LEARNPLAY_SSH_PORT="$saved_ssh_port"
      export LEARNPLAY_TIMEZONE="$saved_timezone"
      export LEARNPLAY_ADMIN_EMAIL="${LEARNPLAY_ADMIN_EMAIL:-admin@localhost}"
      echo "  Using saved settings: SSH port=$saved_ssh_port, timezone=$saved_timezone"
    fi
    run_sibling_script "os-prep.sh" || warn "OS preparation had issues"
    echo ""

    echo -e "${BOLD}Step 2: Installing Dependencies${NC}"
    run_sibling_script "install-deps.sh" || warn "Dependency installation had issues"

    success "Full system preparation complete"
    return 0
  fi

  echo "  This appears to be a fresh host. Would you like to:"
  echo ""
  echo "    1) Run OS preparation (security hardening)"
  echo "    2) Install dependencies (Node.js, PostgreSQL, Nginx, PM2)"
  echo "    3) Skip — system is already prepared"
  echo ""
  read -rp "  Select option [1-3]: " prep_choice

  case "$prep_choice" in
    1)
      echo ""
      if [ -f "$STAGING_DIR/os-settings.json" ]; then
        local saved_ssh_port saved_timezone
        saved_ssh_port=$(grep -oP '"ssh_port"\s*:\s*"\K[^"]+' "$STAGING_DIR/os-settings.json" 2>/dev/null || echo "22")
        saved_timezone=$(grep -oP '"timezone"\s*:\s*"\K[^"]+' "$STAGING_DIR/os-settings.json" 2>/dev/null || echo "UTC")
        export LEARNPLAY_SSH_PORT="$saved_ssh_port"
        export LEARNPLAY_TIMEZONE="$saved_timezone"
        export LEARNPLAY_ADMIN_EMAIL="${LEARNPLAY_ADMIN_EMAIL:-admin@localhost}"
        echo "  Using saved settings: SSH port=$saved_ssh_port, timezone=$saved_timezone"
      fi
      run_sibling_script "os-prep.sh" || warn "OS preparation had issues"
      success "OS preparation complete"
      ;;
    2)
      echo ""
      run_sibling_script "install-deps.sh" || warn "Dependency installation had issues"
      success "Dependency installation complete"
      ;;
    3)
      echo -e "${YELLOW}⏭️  System preparation skipped${NC}"
      log "System preparation skipped by user"
      ;;
    *)
      warn "Invalid selection — skipping system preparation"
      ;;
  esac
}

phase_2_app_deployment() {
  phase_header "2" "Application Deployment"

  if [ -d "$APP_DIR/server" ] && [ -f "$APP_DIR/package.json" ]; then
    success "Application code already exists at $APP_DIR"
    RESTORED_COMPONENTS+=("Application (existing)")
    return 0
  fi

  echo "  Application code not found at $APP_DIR."
  echo ""

  local dist_dir=""

  if [ -d "$SCRIPT_DIR/../server" ] && [ -f "$SCRIPT_DIR/../package.json" ]; then
    dist_dir="$(cd "$SCRIPT_DIR/.." && pwd)"
    echo "  Found on-prem package at: $dist_dir"
  fi

  if [ "$FLAG_YES" != true ] && [ -z "$dist_dir" ]; then
    echo "  Options:"
    echo "    1) Provide path to on-prem package"
    echo "    2) Skip — will deploy app code manually later"
    echo ""
    read -rp "  Select option [1-2]: " app_choice

    case "$app_choice" in
      1)
        read -rp "  Enter path to on-prem package directory: " dist_dir
        if [ ! -d "$dist_dir" ] || [ ! -f "$dist_dir/package.json" ]; then
          warn "Invalid package directory: $dist_dir — skipping app deployment"
          return 0
        fi
        ;;
      2)
        warn "Application deployment skipped — deploy app code before starting services"
        return 0
        ;;
      *)
        warn "Invalid selection — skipping app deployment"
        return 0
        ;;
    esac
  fi

  if [ -n "$dist_dir" ] && [ -d "$dist_dir" ]; then
    echo -e "${CYAN}📦 Deploying application from $dist_dir...${NC}"

    mkdir -p "$APP_DIR"

    if id "$APP_USER" &>/dev/null; then
      :
    else
      useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" --create-home "$APP_USER" 2>/dev/null || true
    fi

    cp -r "$dist_dir/server" "$APP_DIR/" 2>/dev/null || true
    cp -r "$dist_dir/client" "$APP_DIR/" 2>/dev/null || true
    cp -r "$dist_dir/migrations" "$APP_DIR/" 2>/dev/null || true
    cp -r "$dist_dir/scripts" "$APP_DIR/" 2>/dev/null || true
    cp "$dist_dir/package.json" "$APP_DIR/" 2>/dev/null || true
    cp "$dist_dir/version.json" "$APP_DIR/" 2>/dev/null || true
    cp "$dist_dir/ecosystem.config.cjs" "$APP_DIR/" 2>/dev/null || true
    cp -r "$dist_dir/data" "$APP_DIR/" 2>/dev/null || true
    cp "$dist_dir/create-enums.sql" "$APP_DIR/" 2>/dev/null || true
    cp "$dist_dir/schema-full.sql" "$APP_DIR/" 2>/dev/null || true

    chown -R "$APP_USER:$APP_USER" "$APP_DIR"

    echo -e "${CYAN}📦 Installing npm dependencies...${NC}"
    cd "$APP_DIR"
    npm install --omit=dev 2>&1 | tail -3
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"

    success "Application deployed to $APP_DIR"
    RESTORED_COMPONENTS+=("Application code")
  else
    warn "No package directory available — skipping app deployment"
  fi
}

phase_3_restore_env() {
  phase_header "3" "Restore Environment (.env)"

  if [ "$DR_MODE" = "create-prod" ]; then
    log "create-prod mode: skipping .env restore (generate fresh config)"
    echo -e "${YELLOW}⏭️  Skipping .env restore — create-prod mode generates fresh config${NC}"
    return 0
  fi

  if [ "$DR_MODE" = "system-copy" ]; then
    log "system-copy mode: preserving target system .env"
    echo -e "${YELLOW}⏭️  Preserving existing .env — system-copy mode keeps target identity${NC}"
    return 0
  fi

  if [ ! -f "$STAGING_DIR/env_backup.enc" ]; then
    warn "env_backup.enc not found in archive — skipping .env restore"
    return 0
  fi

  echo -e "${CYAN}🔐 Decrypting environment backup...${NC}"
  local key
  key=$(get_encryption_key)

  local decrypted_env="$STAGING_DIR/env_backup.dec"
  if openssl enc -aes-256-cbc -d -pbkdf2 -in "$STAGING_DIR/env_backup.enc" -out "$decrypted_env" -pass "pass:$key" 2>/dev/null; then
    success "Environment file decrypted"
  else
    rm -f "$decrypted_env"
    die "Failed to decrypt env_backup.enc — wrong passphrase?"
  fi

  mkdir -p "$APP_DIR"
  cp "$decrypted_env" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"

  local original_domain=""
  if [ -f "$STAGING_DIR/os-settings.json" ]; then
    original_domain=$(grep -oP '"hostname"\s*:\s*"\K[^"]+' "$STAGING_DIR/os-settings.json" 2>/dev/null || echo "")
  fi

  if [ -z "$original_domain" ]; then
    original_domain=$(grep -oP '"hostname"\s*:\s*"\K[^"]+' "$STAGING_DIR/manifest.json" 2>/dev/null || echo "")
  fi

  if [ -z "$original_domain" ] && [ -f "$APP_DIR/.env" ]; then
    original_domain=$(grep -E '^BASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | sed 's|^BASE_URL=https\?://||' | sed 's|/.*||' || echo "")
  fi

  local current_hostname
  current_hostname=$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo "")

  if [ -n "$FLAG_NEW_DOMAIN" ]; then
    OLD_DOMAIN="$original_domain"
    NEW_DOMAIN="$FLAG_NEW_DOMAIN"
    DOMAIN_CHANGED=true
  elif [ -n "$original_domain" ] && [ "$original_domain" != "$current_hostname" ]; then
    echo ""
    echo -e "${YELLOW}  Original domain was: ${BOLD}$original_domain${NC}"
    echo -e "${YELLOW}  Current hostname is: ${BOLD}$current_hostname${NC}"
    echo ""

    if [ "$FLAG_YES" = true ]; then
      OLD_DOMAIN="$original_domain"
      NEW_DOMAIN="$original_domain"
    else
      read -rp "  Enter new domain (or press Enter to keep '$original_domain'): " input_domain
      if [ -n "$input_domain" ]; then
        OLD_DOMAIN="$original_domain"
        NEW_DOMAIN="$input_domain"
        DOMAIN_CHANGED=true
      else
        OLD_DOMAIN="$original_domain"
        NEW_DOMAIN="$original_domain"
      fi
    fi
  fi

  if [ "$DOMAIN_CHANGED" = true ] && [ -n "$NEW_DOMAIN" ] && [ -n "$OLD_DOMAIN" ]; then
    echo -e "${CYAN}🔄 Updating domain: $OLD_DOMAIN → $NEW_DOMAIN${NC}"
    sed -i "s|$OLD_DOMAIN|$NEW_DOMAIN|g" "$APP_DIR/.env"
    success "Domain updated in .env"
    WARNINGS+=("Domain changed from $OLD_DOMAIN to $NEW_DOMAIN")
  fi

  if id "$APP_USER" &>/dev/null; then
    chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  fi

  success "Environment file restored to $APP_DIR/.env"
  RESTORED_COMPONENTS+=("Environment (.env)")

  if [ -f "$STAGING_DIR/vault.enc" ]; then
    warn "Legacy vault.enc found in backup — skipping restore (Mode B no longer supported)"
    warn "Ensure API keys are configured in .env (customer-provided)"
  fi
}

phase_4_restore_database() {
  phase_header "4" "Restore Database"

  if [ ! -f "$STAGING_DIR/database.sql.gz" ]; then
    warn "database.sql.gz not found in archive — skipping database restore"
    return 0
  fi

  if ! command -v psql &>/dev/null; then
    die "PostgreSQL client (psql) not found — install PostgreSQL first"
  fi

  if ! systemctl is-active --quiet postgresql 2>/dev/null; then
    echo -e "${CYAN}🚀 Starting PostgreSQL...${NC}"
    systemctl start postgresql 2>/dev/null || die "Failed to start PostgreSQL"
    sleep 3
  fi
  success "PostgreSQL is running"

  local db_exists=false
  if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$APP_NAME"; then
    db_exists=true
  fi

  if [ "$db_exists" = true ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Database '$APP_NAME' already exists!${NC}"
    if [ "$FLAG_YES" != true ]; then
      if ! confirm "Drop and recreate the database? All existing data will be lost."; then
        warn "Database restore skipped — existing database preserved"
        return 0
      fi
    fi

    create_pre_restore_backup

    echo -e "${CYAN}🔄 Dropping and recreating database...${NC}"
    sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$APP_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $APP_NAME;" 2>/dev/null
  fi

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$APP_NAME'" 2>/dev/null | grep -q 1; then
    echo -e "${CYAN}👤 Creating database user '$APP_NAME'...${NC}"
    local db_password
    db_password=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    sudo -u postgres psql -c "CREATE ROLE $APP_NAME WITH LOGIN PASSWORD '$db_password';" 2>/dev/null
    success "Database user created"
  fi

  echo -e "${CYAN}📦 Creating database '$APP_NAME'...${NC}"
  sudo -u postgres psql -c "CREATE DATABASE $APP_NAME OWNER $APP_NAME;" 2>/dev/null
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $APP_NAME TO $APP_NAME;" 2>/dev/null
  success "Database created"

  echo -e "${CYAN}📥 Restoring database from backup...${NC}"
  echo "  This may take several minutes for large databases."
  echo ""

  if zcat "$STAGING_DIR/database.sql.gz" | sudo -u postgres psql -d "$APP_NAME" --quiet 2>&1 | tail -5; then
    success "Database restored from backup"
  else
    die "Database restore failed"
  fi

  log "Fixing table/sequence ownership..."
  echo -e "${CYAN}🔧 Fixing table and sequence ownership...${NC}"
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
  " 2>/dev/null || warn "Ownership transfer had some warnings (may be OK)"

  local table_count
  table_count=$(sudo -u postgres psql -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_catalog = '$APP_NAME';" 2>/dev/null || echo "?")

  if [ "$DR_MODE" = "create-prod" ]; then
    log "create-prod mode: clearing session data and resetting license state"
    echo -e "${CYAN}🔄 create-prod: clearing sessions and resetting license state...${NC}"
    sudo -u postgres psql -d "$APP_NAME" -c "DELETE FROM sessions;" 2>/dev/null || true
    sudo -u postgres psql -d "$APP_NAME" -c "UPDATE settings SET value = 'unlicensed' WHERE key = 'license_status';" 2>/dev/null || true
    sudo -u postgres psql -d "$APP_NAME" -c "DELETE FROM settings WHERE key IN ('license_key', 'license_activated_at');" 2>/dev/null || true
    success "create-prod: session data cleared and license state reset"
  fi

  if [ "$DR_MODE" = "system-copy" ]; then
    local target_domain=""
    if [ -f "$APP_DIR/.env" ]; then
      target_domain=$(grep -E '^BASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | sed 's|^BASE_URL=https\?://||' | sed 's|/.*||' || echo "")
    fi
    if [ -n "$target_domain" ]; then
      local source_domain
      source_domain=$(grep -oP '"hostname"\s*:\s*"\K[^"]+' "$STAGING_DIR/manifest.json" 2>/dev/null || echo "")
      if [ -n "$source_domain" ] && [ "$source_domain" != "$target_domain" ]; then
        log "system-copy mode: updating base URL references from $source_domain to $target_domain"
        echo -e "${CYAN}🔄 system-copy: updating base URL references to match target domain...${NC}"
        sudo -u postgres psql -d "$APP_NAME" -c "UPDATE settings SET value = REPLACE(value, '$source_domain', '$target_domain') WHERE value LIKE '%$source_domain%';" 2>/dev/null || true
        success "system-copy: base URL references updated ($source_domain → $target_domain)"
      fi
    fi
  fi

  success "Database restored — $table_count tables"
  RESTORED_COMPONENTS+=("Database ($table_count tables)")
}

phase_5_restore_uploads() {
  phase_header "5" "Restore Uploads"

  if [ ! -f "$STAGING_DIR/uploads.tar.gz" ]; then
    warn "uploads.tar.gz not found in archive — skipping uploads restore"
    return 0
  fi

  echo -e "${CYAN}📁 Creating upload directory structure...${NC}"
  mkdir -p "$UPLOAD_DIR/public" "$UPLOAD_DIR/private"

  echo -e "${CYAN}📥 Extracting uploads...${NC}"
  if tar xzf "$STAGING_DIR/uploads.tar.gz" -C "$UPLOAD_DIR/" 2>/dev/null; then
    success "Uploads extracted"
  else
    warn "Some uploads could not be extracted"
  fi

  if id "$APP_USER" &>/dev/null; then
    chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR"
  fi

  local file_count upload_size
  file_count=$(find "$UPLOAD_DIR" -type f 2>/dev/null | wc -l)
  upload_size=$(du -sh "$UPLOAD_DIR" 2>/dev/null | cut -f1 || echo "0")

  success "Uploads restored — $file_count files ($upload_size)"
  RESTORED_COMPONENTS+=("Uploads ($file_count files, $upload_size)")
}

phase_6_restore_configs() {
  phase_header "6" "Restore Configurations"

  if [ "$DR_MODE" = "create-prod" ] || [ "$DR_MODE" = "system-copy" ]; then
    log "$DR_MODE mode: skipping nginx/SSL/domain config restore"
    echo -e "${YELLOW}⏭️  Skipping nginx/SSL config — $DR_MODE mode preserves target system config${NC}"

    if [ -f "$STAGING_DIR/ecosystem.config.cjs" ]; then
      echo ""
      echo -e "${CYAN}⚙️  Restoring PM2 configuration...${NC}"
      cp "$STAGING_DIR/ecosystem.config.cjs" "$APP_DIR/" 2>/dev/null || warn "Failed to copy ecosystem.config.cjs"
      if id "$APP_USER" &>/dev/null; then
        chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.cjs" 2>/dev/null || true
      fi
      success "PM2 configuration restored"
      RESTORED_COMPONENTS+=("PM2 config (ecosystem.config.cjs)")
    fi
    return 0
  fi

  if [ -f "$STAGING_DIR/nginx-site.conf" ]; then
    echo -e "${CYAN}🌐 Restoring Nginx configuration...${NC}"

    local nginx_conf="$STAGING_DIR/nginx-site.conf"

    if [ "$DOMAIN_CHANGED" = true ] && [ -n "$OLD_DOMAIN" ] && [ -n "$NEW_DOMAIN" ]; then
      sed -i "s|$OLD_DOMAIN|$NEW_DOMAIN|g" "$nginx_conf"
      echo "  Domain references updated in nginx config"
    fi

    cp "$nginx_conf" "/etc/nginx/sites-available/$APP_NAME" 2>/dev/null || warn "Failed to copy nginx config"
    ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME" 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    if [ -f "$STAGING_DIR/nginx-limits.conf" ]; then
      cp "$STAGING_DIR/nginx-limits.conf" /etc/nginx/conf.d/ 2>/dev/null || warn "Failed to copy nginx limits config"
      echo "  Nginx rate limits config restored"
    fi

    if command -v nginx &>/dev/null; then
      if nginx -t 2>&1; then
        systemctl reload nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true
        success "Nginx configuration restored and reloaded"
      else
        warn "Nginx config test failed — check configuration manually"
      fi
    else
      warn "Nginx not installed — config saved but not activated"
    fi

    RESTORED_COMPONENTS+=("Nginx configuration")
  else
    echo "  No nginx-site.conf found in archive — skipping"
  fi

  if [ -d "$STAGING_DIR/ssl" ]; then
    echo ""
    echo -e "${CYAN}🔐 Restoring SSL certificates...${NC}"

    if [ "$DOMAIN_CHANGED" = true ]; then
      warn "Domain changed — SSL certificates may not match new domain '$NEW_DOMAIN'"
      if [ "$FLAG_YES" != true ]; then
        echo -e "${YELLOW}  Skip SSL cert restore? (certificates won't match new domain)${NC}"
        read -rp "  Skip? [Y/n]: " skip_ssl
        if [ "$skip_ssl" != "n" ] && [ "$skip_ssl" != "N" ]; then
          warn "SSL certificate restore skipped — run 'sudo lppadmin ssl' to get new certs"
          WARNINGS+=("SSL certificates skipped due to domain change")
        else
          cp -r "$STAGING_DIR/ssl"/* /etc/letsencrypt/ 2>/dev/null || warn "Failed to copy SSL certs"
          success "SSL certificates restored (may not match new domain)"
        fi
      else
        warn "SSL certificates skipped due to domain change (--yes mode)"
        WARNINGS+=("SSL certificates skipped due to domain change")
      fi
    else
      cp -r "$STAGING_DIR/ssl"/* /etc/letsencrypt/ 2>/dev/null || warn "Failed to copy SSL certs"
      success "SSL certificates restored"
      RESTORED_COMPONENTS+=("SSL certificates")
    fi
  else
    echo "  No SSL certificates found in archive — skipping"
  fi

  if [ -f "$STAGING_DIR/ecosystem.config.cjs" ]; then
    echo ""
    echo -e "${CYAN}⚙️  Restoring PM2 configuration...${NC}"
    cp "$STAGING_DIR/ecosystem.config.cjs" "$APP_DIR/" 2>/dev/null || warn "Failed to copy ecosystem.config.cjs"
    if id "$APP_USER" &>/dev/null; then
      chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.cjs" 2>/dev/null || true
    fi
    success "PM2 configuration restored"
    RESTORED_COMPONENTS+=("PM2 config (ecosystem.config.cjs)")
  fi

  if [ -f "$STAGING_DIR/crontab.txt" ]; then
    echo ""
    echo -e "${CYAN}📋 Crontab backup found...${NC}"

    if [ "$FLAG_YES" != true ]; then
      echo -e "${BOLD}  Archived crontab:${NC}"
      cat "$STAGING_DIR/crontab.txt" | sed 's/^/    /'
      echo ""

      echo -e "${BOLD}  Current crontab:${NC}"
      crontab -l 2>/dev/null | sed 's/^/    /' || echo "    (empty)"
      echo ""

      read -rp "  Restore archived crontab? [y/N]: " restore_cron
      if [[ "$restore_cron" =~ ^[Yy]$ ]]; then
        crontab "$STAGING_DIR/crontab.txt"
        success "Crontab restored"
        RESTORED_COMPONENTS+=("Crontab")
      else
        echo "  Crontab restore skipped"
      fi
    else
      echo "  Crontab found but not auto-restored (review manually)"
      echo "  Saved at: $STAGING_DIR/crontab.txt"
    fi
  fi

  if [ -f "$STAGING_DIR/postgresql.conf" ]; then
    echo ""
    echo -e "${CYAN}🐘 PostgreSQL tuning configuration found...${NC}"

    local pg_conf
    pg_conf=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)

    if [ -n "$pg_conf" ]; then
      if [ "$FLAG_YES" != true ]; then
        read -rp "  Restore PostgreSQL tuning settings? [y/N]: " restore_pg
      else
        restore_pg="n"
      fi

      if [[ "${restore_pg:-n}" =~ ^[Yy]$ ]]; then
        local tuning_params=("shared_buffers" "effective_cache_size" "maintenance_work_mem" "work_mem" "wal_buffers" "max_connections" "checkpoint_completion_target" "random_page_cost" "effective_io_concurrency" "max_wal_size" "min_wal_size")

        for param in "${tuning_params[@]}"; do
          local value
          value=$(grep -E "^${param}\s*=" "$STAGING_DIR/postgresql.conf" 2>/dev/null | head -1)
          if [ -n "$value" ]; then
            sed -i "s|^#\?${param}\s*=.*|${value}|" "$pg_conf" 2>/dev/null || true
            if ! grep -q "^${param}" "$pg_conf" 2>/dev/null; then
              echo "$value" >> "$pg_conf"
            fi
          fi
        done

        success "PostgreSQL tuning settings restored"
        warn "PostgreSQL restart required for tuning changes to take effect"
        RESTORED_COMPONENTS+=("PostgreSQL tuning")
      else
        echo "  PostgreSQL tuning restore skipped"
        echo "  Saved at: $STAGING_DIR/postgresql.conf"
      fi
    else
      warn "postgresql.conf not found on this system — skipping PG tuning restore"
    fi
  fi
}

phase_7_start_services() {
  phase_header "7" "Start Services & Health Check"

  if ! systemctl is-active --quiet postgresql 2>/dev/null; then
    echo -e "${CYAN}🚀 Starting PostgreSQL...${NC}"
    systemctl start postgresql 2>/dev/null || warn "Failed to start PostgreSQL"
    sleep 3
    if systemctl is-active --quiet postgresql 2>/dev/null; then
      success "PostgreSQL started"
    else
      warn "PostgreSQL may not be running — check manually"
    fi
  else
    success "PostgreSQL is already running"
  fi

  local app_started=false
  local app_runtime="none"

  if [ -f "$APP_DIR/ecosystem.config.cjs" ] && command -v pm2 &>/dev/null && id "$APP_USER" &>/dev/null; then
    echo -e "${CYAN}🚀 Starting LearnPlay application (PM2)...${NC}"
    cd "$APP_DIR"
    sudo -u "$APP_USER" pm2 stop "$APP_NAME" --silent 2>/dev/null || true
    sleep 1
    if sudo -u "$APP_USER" pm2 start ecosystem.config.cjs --silent 2>/dev/null; then
      sudo -u "$APP_USER" pm2 save 2>/dev/null || true
      success "PM2 application started"
      app_started=true
      app_runtime="pm2"
    else
      warn "PM2 start had issues"
    fi
  fi

  if [ "$app_started" != true ]; then
    local service_unit=""
    for candidate in learnplay-cloud.service learnplay.service; do
      if systemctl list-unit-files "$candidate" --no-legend 2>/dev/null | grep -q "^$candidate"; then
        service_unit="$candidate"
        break
      fi
    done

    if [ -n "$service_unit" ]; then
      echo -e "${CYAN}🚀 Starting LearnPlay application (systemd: ${service_unit})...${NC}"
      if systemctl restart "$service_unit" 2>/dev/null || systemctl start "$service_unit" 2>/dev/null; then
        success "Application started via systemd ($service_unit)"
        app_started=true
        app_runtime="systemd:${service_unit}"
      else
        warn "Failed to start application via systemd ($service_unit)"
      fi
    fi
  fi

  if [ "$app_started" != true ]; then
    warn "Could not start application runtime automatically (PM2/systemd unavailable)"
  fi

  if command -v nginx &>/dev/null; then
    echo -e "${CYAN}🚀 Starting/reloading Nginx...${NC}"
    if systemctl is-active --quiet nginx 2>/dev/null; then
      systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
      success "Nginx reloaded"
    else
      systemctl start nginx 2>/dev/null || warn "Failed to start Nginx"
      if systemctl is-active --quiet nginx 2>/dev/null; then
        success "Nginx started"
      fi
    fi
  else
    warn "Nginx not installed"
  fi

  echo ""
  echo -e "${CYAN}🔍 Running health check...${NC}"
  local restore_app_port=""
  if [ -f "$APP_DIR/.env" ]; then
    restore_app_port=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  fi
  restore_app_port="${restore_app_port:-3000}"
  local health_ok=false
  for i in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:${restore_app_port}/api/health" > /dev/null 2>&1; then
      health_ok=true
      break
    fi
    echo "  Attempt $i/15 — waiting..."
    sleep 3
  done

  if [ "$health_ok" = true ]; then
    success "Health check passed — application is running"
  else
    warn "Health check failed — application may need manual attention"
    if [ "$app_runtime" = "pm2" ]; then
      warn "Check logs: sudo -u $APP_USER pm2 logs $APP_NAME --lines 50"
    elif [[ "$app_runtime" == systemd:* ]]; then
      warn "Check logs: journalctl -u ${app_runtime#systemd:} -n 100 --no-pager"
    else
      warn "Check logs: journalctl -u learnplay-cloud.service -n 100 --no-pager"
    fi
  fi

  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║         DR Restore Complete — Summary            ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  echo -e "${BOLD}Restored Components:${NC}"
  if [ ${#RESTORED_COMPONENTS[@]} -gt 0 ]; then
    for component in "${RESTORED_COMPONENTS[@]}"; do
      echo -e "  ${GREEN}✅${NC} $component"
    done
  else
    echo "  (none)"
  fi
  echo ""

  local base_url=""
  if [ -f "$APP_DIR/.env" ]; then
    base_url=$(grep -E '^BASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d'=' -f2-)
  fi
  if [ -n "$base_url" ]; then
    echo -e "${BOLD}Application URL:${NC} $base_url"
    echo ""
  fi

  if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${BOLD}${YELLOW}Warnings:${NC}"
    for warning in "${WARNINGS[@]}"; do
      echo -e "  ${YELLOW}⚠️${NC}  $warning"
    done
    echo ""
  fi

  echo -e "${BOLD}Next Steps:${NC}"
  echo "  1. Test login at ${base_url:-http://your-domain}"
  echo "  2. Verify data integrity and uploads"
  if [ "$DOMAIN_CHANGED" = true ]; then
    echo "  3. Update DNS records to point to this server"
    echo "  4. Set up SSL: sudo lppadmin ssl"
  fi
  echo ""

  log "DR restore completed successfully"
  success "Disaster Recovery restore completed!"
}

main() {
  parse_args "$@"
  header
  phase_0_validation
  if [ "$FLAG_VALIDATE_ONLY" = true ]; then
    success "Validation-only mode complete. Archive is ready for restore."
    return 0
  fi
  phase_1_system_prep
  phase_2_app_deployment
  phase_3_restore_env
  phase_4_restore_database
  phase_5_restore_uploads
  phase_6_restore_configs
  phase_7_start_services
}

main "$@"
