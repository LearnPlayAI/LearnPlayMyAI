#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
LOG_FILE="/var/log/learnplay/admin.log"

ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
ENC_FILE="$APP_DIR/.env.enc"
KEY_HASH_FILE="$APP_DIR/.key-hash"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

KEY_FILE=""
DEFAULT_BUNDLE="/opt/learnplay/keys/provision-bundle.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [secrets] $*" | tee -a "$LOG_FILE"; }

extract_key_from_bundle() {
  local bundle_file="$1"
  local purpose="${2:-master}"
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

msg_success() { echo -e "${GREEN}✅ $*${NC}"; }
msg_error()   { echo -e "${RED}❌ $*${NC}"; }
msg_warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
msg_info()    { echo -e "${CYAN}ℹ️  $*${NC}"; }

usage() {
  echo ""
  echo -e "${BOLD}LearnPlay Secrets Manager${NC}"
  echo ""
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  encrypt      Encrypt .env to .env.enc and shred plaintext"
  echo "  decrypt      Decrypt .env.enc back to .env"
  echo "  start-app    Decrypt secrets, start PM2, then remove plaintext .env"
  echo "  rotate-key   Change the master passphrase"
  echo "  status       Show whether secrets are encrypted or plaintext"
  echo "  edit         Decrypt, open in editor, re-encrypt after saving"
  echo "  verify <KEY> Check if a specific key exists in secrets (without showing its value)"
  echo ""
  echo "Options:"
  echo "  --key-file=PATH  Use a provision bundle JSON file for master passphrase"
  echo "  LEARNPLAY_MASTER_KEY env var can be set for non-interactive mode (CI/automation)"
  echo ""
  echo "Examples:"
  echo "  sudo $0 encrypt"
  echo "  sudo $0 verify GEMENI_API_KEY"
  echo ""
}

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ This script must be run as root (sudo)${NC}"
  exit 1
fi

mkdir -p /var/log/learnplay

get_passphrase() {
  local prompt="${1:-Enter master passphrase}"

  if [ -n "$KEY_FILE" ] && [ -f "$KEY_FILE" ]; then
    local bundle_key
    bundle_key=$(extract_key_from_bundle "$KEY_FILE" "master")
    if [ -n "$bundle_key" ]; then
      PASSPHRASE="$bundle_key"
      return
    fi
  fi

  if [ -f "$DEFAULT_BUNDLE" ]; then
    local bundle_key
    bundle_key=$(extract_key_from_bundle "$DEFAULT_BUNDLE" "master")
    if [ -n "$bundle_key" ]; then
      PASSPHRASE="$bundle_key"
      return
    fi
  fi

  if [ -n "${LEARNPLAY_MASTER_KEY:-}" ]; then
    PASSPHRASE="$LEARNPLAY_MASTER_KEY"
    return
  fi
  read -sp "$prompt: " PASSPHRASE
  echo ""
  if [ -z "$PASSPHRASE" ]; then
    msg_error "Passphrase cannot be empty"
    exit 1
  fi
}

get_passphrase_confirm() {
  local prompt="${1:-Enter master passphrase}"
  get_passphrase "$prompt"
  local first="$PASSPHRASE"
  if [ -z "${LEARNPLAY_MASTER_KEY:-}" ]; then
    read -sp "Confirm passphrase: " PASSPHRASE
    echo ""
    if [ "$first" != "$PASSPHRASE" ]; then
      msg_error "Passphrases do not match"
      exit 1
    fi
  fi
}

store_key_hash() {
  local hash
  hash=$(echo -n "$PASSPHRASE" | sha256sum | awk '{print $1}')
  echo "$hash" > "$KEY_HASH_FILE"
  chmod 600 "$KEY_HASH_FILE"
  chown root:root "$KEY_HASH_FILE"
}

verify_passphrase() {
  if [ ! -f "$KEY_HASH_FILE" ]; then
    return 0
  fi
  local stored_hash current_hash
  stored_hash=$(cat "$KEY_HASH_FILE")
  current_hash=$(echo -n "$PASSPHRASE" | sha256sum | awk '{print $1}')
  if [ "$stored_hash" != "$current_hash" ]; then
    msg_error "Passphrase does not match the stored key hash"
    msg_warn "If you have lost your master passphrase, encrypted secrets are unrecoverable."
    msg_warn "You must re-create the .env file and re-encrypt with a new passphrase."
    exit 1
  fi
}

secure_delete() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  if command -v shred &>/dev/null; then
    shred -u "$file"
  else
    rm -f "$file"
  fi
}

get_status() {
  local has_enc=false
  local has_env=false
  [ -f "$ENC_FILE" ] && has_enc=true
  [ -f "$ENV_FILE" ] && has_env=true

  if $has_enc && ! $has_env; then
    echo "encrypted"
  elif $has_env && ! $has_enc; then
    echo "plaintext"
  elif $has_enc && $has_env; then
    echo "both"
  else
    echo "none"
  fi
}

do_encrypt() {
  log "Encrypting secrets..."

  if [ ! -f "$ENV_FILE" ]; then
    msg_error "No .env file found at $ENV_FILE"
    msg_info "Nothing to encrypt."
    exit 1
  fi

  if [ -f "$ENC_FILE" ]; then
    msg_warn "Encrypted file already exists at $ENC_FILE"
    if [ -z "${LEARNPLAY_MASTER_KEY:-}" ]; then
      read -p "Overwrite? (y/N): " OVERWRITE
      if [ "${OVERWRITE:-n}" != "y" ] && [ "${OVERWRITE:-n}" != "Y" ]; then
        msg_info "Aborted."
        exit 0
      fi
    fi
  fi

  get_passphrase_confirm "Set master passphrase"

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "$ENV_FILE" -out "$ENC_FILE" -pass pass:"$PASSPHRASE"

  chmod 600 "$ENC_FILE"
  chown root:root "$ENC_FILE"

  store_key_hash

  secure_delete "$ENV_FILE"

  log "Secrets encrypted successfully"
  msg_success "Secrets encrypted to $ENC_FILE"
  msg_success "Plaintext .env has been securely deleted"
}

do_decrypt() {
  log "Decrypting secrets..."

  if [ ! -f "$ENC_FILE" ]; then
    msg_error "No encrypted file found at $ENC_FILE"
    msg_info "Nothing to decrypt."
    exit 1
  fi

  if [ -f "$ENV_FILE" ]; then
    msg_warn "Plaintext .env already exists at $ENV_FILE"
    if [ -z "${LEARNPLAY_MASTER_KEY:-}" ]; then
      read -p "Overwrite? (y/N): " OVERWRITE
      if [ "${OVERWRITE:-n}" != "y" ] && [ "${OVERWRITE:-n}" != "Y" ]; then
        msg_info "Aborted."
        exit 0
      fi
    fi
  fi

  get_passphrase "Enter master passphrase"
  verify_passphrase

  if ! openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
    -in "$ENC_FILE" -out "$ENV_FILE" -pass pass:"$PASSPHRASE" 2>/dev/null; then
    msg_error "Decryption failed — wrong passphrase or corrupted file"
    rm -f "$ENV_FILE"
    exit 1
  fi

  chmod 600 "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"

  log "Secrets decrypted successfully"
  msg_success "Secrets decrypted to $ENV_FILE"
}

do_start_app() {
  log "Starting app with encrypted secrets..."

  if [ ! -f "$ENC_FILE" ]; then
    if [ -f "$ENV_FILE" ]; then
      msg_warn "No encrypted file found, but .env exists — starting directly"
    else
      msg_error "No .env or .env.enc found. Cannot start application."
      exit 1
    fi
  fi

  local needs_cleanup=false

  if [ -f "$ENC_FILE" ] && [ ! -f "$ENV_FILE" ]; then
    get_passphrase "Enter master passphrase"
    verify_passphrase

    if ! openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
      -in "$ENC_FILE" -out "$ENV_FILE" -pass pass:"$PASSPHRASE" 2>/dev/null; then
      msg_error "Decryption failed — wrong passphrase or corrupted file"
      rm -f "$ENV_FILE"
      exit 1
    fi

    chmod 600 "$ENV_FILE"
    chown "$APP_USER:$APP_USER" "$ENV_FILE"
    needs_cleanup=true
    msg_success "Secrets decrypted temporarily"
  fi

  msg_info "Starting PM2..."
  cd "$APP_DIR"
  sudo -u "$APP_USER" pm2 start ecosystem.config.cjs 2>&1 | tee -a "$LOG_FILE"
  sudo -u "$APP_USER" pm2 save 2>&1 | tee -a "$LOG_FILE"

  msg_info "Waiting for application health check..."
  sleep 8

  local sm_app_port=""
  if [ -f "$ENV_FILE" ]; then
    sm_app_port=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  fi
  sm_app_port="${sm_app_port:-3000}"

  HEALTH_OK=false
  for i in $(seq 1 5); do
    if curl -sf "http://127.0.0.1:${sm_app_port}/api/health" > /dev/null 2>&1; then
      HEALTH_OK=true
      break
    fi
    msg_info "Attempt $i/5 — waiting..."
    sleep 3
  done

  if [ "$HEALTH_OK" = true ]; then
    msg_success "Application is healthy!"
  else
    msg_warn "Health check didn't pass yet. App may need more time."
    msg_info "Check logs: sudo -u $APP_USER pm2 logs $APP_NAME --lines 50"
  fi

  if [ "$needs_cleanup" = true ]; then
    secure_delete "$ENV_FILE"
    msg_success "Plaintext .env removed from disk"
  fi

  log "Application started $([ "$HEALTH_OK" = true ] && echo "successfully" || echo "with warnings")"
}

do_rotate_key() {
  log "Rotating master passphrase..."

  if [ ! -f "$ENC_FILE" ]; then
    msg_error "No encrypted file found at $ENC_FILE"
    msg_info "Encrypt secrets first with: $0 encrypt"
    exit 1
  fi

  msg_info "Step 1: Decrypt with current passphrase"
  get_passphrase "Enter current master passphrase"
  verify_passphrase

  local tmp_file
  tmp_file=$(mktemp "$APP_DIR/.env.tmp.XXXXXX")

  if ! openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
    -in "$ENC_FILE" -out "$tmp_file" -pass pass:"$PASSPHRASE" 2>/dev/null; then
    msg_error "Decryption failed — wrong passphrase or corrupted file"
    rm -f "$tmp_file"
    exit 1
  fi

  msg_info "Step 2: Set new passphrase"
  get_passphrase_confirm "Enter new master passphrase"

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "$tmp_file" -out "$ENC_FILE" -pass pass:"$PASSPHRASE"

  chmod 600 "$ENC_FILE"
  chown root:root "$ENC_FILE"

  store_key_hash

  secure_delete "$tmp_file"

  log "Master passphrase rotated successfully"
  msg_success "Master passphrase has been rotated"
  msg_success "Encrypted file re-encrypted with new passphrase"
}

do_status() {
  local status
  status=$(get_status)

  echo ""
  case "$status" in
    encrypted)
      echo -e "Current Status: ${GREEN}🔒 Encrypted${NC}"
      echo -e "  Encrypted file: ${CYAN}$ENC_FILE${NC} ($(stat -c%s "$ENC_FILE" 2>/dev/null || echo "?") bytes)"
      echo -e "  Plaintext file: ${YELLOW}not present${NC}"
      if [ -f "$KEY_HASH_FILE" ]; then
        echo -e "  Key hash:       ${GREEN}stored${NC}"
      fi
      ;;
    plaintext)
      echo -e "Current Status: ${YELLOW}🔓 Decrypted (plaintext)${NC}"
      echo -e "  Plaintext file: ${CYAN}$ENV_FILE${NC} ($(stat -c%s "$ENV_FILE" 2>/dev/null || echo "?") bytes)"
      echo -e "  Encrypted file: ${YELLOW}not present${NC}"
      msg_warn "Secrets are currently in plaintext. Run '$0 encrypt' to secure them."
      ;;
    both)
      echo -e "Current Status: ${YELLOW}⚠️  Both files exist${NC}"
      echo -e "  Encrypted file: ${CYAN}$ENC_FILE${NC} ($(stat -c%s "$ENC_FILE" 2>/dev/null || echo "?") bytes)"
      echo -e "  Plaintext file: ${CYAN}$ENV_FILE${NC} ($(stat -c%s "$ENV_FILE" 2>/dev/null || echo "?") bytes)"
      msg_warn "Both plaintext and encrypted files exist."
      msg_warn "Run '$0 encrypt' to re-encrypt and remove plaintext."
      ;;
    none)
      echo -e "Current Status: ${RED}❌ No secrets found${NC}"
      echo -e "  No .env or .env.enc files found in $APP_DIR"
      msg_info "Create a .env file first, then encrypt it."
      ;;
  esac
  echo ""
}

do_edit() {
  log "Editing secrets..."

  local was_encrypted=false

  if [ -f "$ENC_FILE" ] && [ ! -f "$ENV_FILE" ]; then
    was_encrypted=true
    get_passphrase "Enter master passphrase"
    verify_passphrase

    if ! openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
      -in "$ENC_FILE" -out "$ENV_FILE" -pass pass:"$PASSPHRASE" 2>/dev/null; then
      msg_error "Decryption failed — wrong passphrase or corrupted file"
      rm -f "$ENV_FILE"
      exit 1
    fi

    chmod 600 "$ENV_FILE"
    chown root:root "$ENV_FILE"
    msg_success "Secrets decrypted for editing"
  elif [ ! -f "$ENV_FILE" ]; then
    msg_error "No .env or .env.enc found. Nothing to edit."
    exit 1
  fi

  local editor="${EDITOR:-nano}"
  msg_info "Opening $ENV_FILE in $editor..."
  "$editor" "$ENV_FILE"

  if [ "$was_encrypted" = true ]; then
    msg_info "Re-encrypting secrets..."

    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
      -in "$ENV_FILE" -out "$ENC_FILE" -pass pass:"$PASSPHRASE"

    chmod 600 "$ENC_FILE"
    chown root:root "$ENC_FILE"

    secure_delete "$ENV_FILE"

    log "Secrets edited and re-encrypted"
    msg_success "Secrets re-encrypted after editing"
    msg_success "Plaintext .env removed"
  else
    log "Secrets edited (plaintext mode)"
    msg_success "Secrets saved"
    msg_warn "Secrets are still in plaintext. Run '$0 encrypt' to secure them."
  fi
}

do_verify() {
  local key="${1:-}"
  if [ -z "$key" ]; then
    msg_error "Usage: $0 verify <KEY_NAME>"
    msg_info "Example: $0 verify GEMENI_API_KEY"
    exit 1
  fi

  local source_file=""
  local tmp_decrypted=false

  if [ -f "$ENV_FILE" ]; then
    source_file="$ENV_FILE"
  elif [ -f "$ENC_FILE" ]; then
    get_passphrase "Enter master passphrase"
    verify_passphrase

    source_file=$(mktemp "$APP_DIR/.env.verify.XXXXXX")
    chmod 600 "$source_file"

    if ! openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
      -in "$ENC_FILE" -out "$source_file" -pass pass:"$PASSPHRASE" 2>/dev/null; then
      msg_error "Decryption failed — wrong passphrase or corrupted file"
      rm -f "$source_file"
      exit 1
    fi

    tmp_decrypted=true
  else
    msg_error "No .env or .env.enc found"
    exit 1
  fi

  local value
  value=$(grep -E "^${key}=" "$source_file" 2>/dev/null | head -1 | cut -d'=' -f2-)

  if [ "$tmp_decrypted" = true ]; then
    secure_delete "$source_file"
  fi

  if [ -n "$value" ]; then
    local masked
    masked=$(echo "$value" | sed 's/./*/g')
    msg_success "$key exists (${#value} characters, value: $masked)"
  else
    msg_warn "Key '$key' not found in secrets"
    exit 1
  fi
}

show_menu() {
  while true; do
    local status
    status=$(get_status)
    local status_display

    case "$status" in
      encrypted)  status_display="${GREEN}🔒 Encrypted${NC}" ;;
      plaintext)  status_display="${YELLOW}🔓 Decrypted${NC}" ;;
      both)       status_display="${YELLOW}⚠️  Both files exist${NC}" ;;
      none)       status_display="${RED}❌ No secrets found${NC}" ;;
    esac

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     LearnPlay Secrets Manager            ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Current Status: $status_display"
    echo ""
    echo "  1) Encrypt secrets (lock .env)"
    echo "  2) Decrypt secrets (unlock .env)"
    echo "  3) Start app with encrypted secrets"
    echo "  4) Rotate master passphrase"
    echo "  5) Edit secrets (decrypt → edit → encrypt)"
    echo "  6) Verify a secret key exists"
    echo "  7) Back / Exit"
    echo ""
    read -p "Select option [1-7]: " choice

    case "$choice" in
      1) do_encrypt ;;
      2) do_decrypt ;;
      3) do_start_app ;;
      4) do_rotate_key ;;
      5) do_edit ;;
      6)
        read -p "Enter key name to verify (e.g., GEMENI_API_KEY): " key_name
        do_verify "$key_name"
        ;;
      7)
        msg_info "Goodbye!"
        exit 0
        ;;
      *)
        msg_error "Invalid option. Please select 1-7."
        ;;
    esac

    echo ""
    read -p "Press Enter to continue..." _
  done
}

for arg in "$@"; do
  case "$arg" in
    --key-file=*) KEY_FILE="${arg#--key-file=}" ;;
  esac
done

case "${1:-}" in
  encrypt)    do_encrypt ;;
  decrypt)    do_decrypt ;;
  start-app)  do_start_app ;;
  rotate-key) do_rotate_key ;;
  status)     do_status ;;
  edit)       do_edit ;;
  verify)     do_verify "${2:-}" ;;
  help|--help|-h)
    usage
    ;;
  "")
    show_menu
    ;;
  --key-file=*)
    show_menu
    ;;
  *)
    msg_error "Unknown command: $1"
    usage
    exit 1
    ;;
esac
