#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
ENC_FILE="$APP_DIR/.env.enc"
LOG_FILE="/var/log/learnplay/admin.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SENSITIVE_KEYS="SMTP_PASS|MAILERSEND_API_KEY|GEMENI_API_KEY|GEMINI_API_KEY|GAMMA_API_KEY|SESSION_SECRET|DATABASE_URL|PASSWORD_RESET_SECRET|EMAIL_VERIFICATION_SECRET|GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS|MASTER_PASSWORD_HASH|LEARNPLAY_MASTER_KEY"
CUSTOM_SENSITIVE_KEYS_VAR="LEARNPLAY_SENSITIVE_KEYS"

WAS_ENCRYPTED=false
CONFIG_CHANGED=false

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [config] $*" | tee -a "$LOG_FILE"; }

msg_success() { echo -e "${GREEN}✅ $*${NC}"; }
msg_error()   { echo -e "${RED}❌ $*${NC}"; }
msg_warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
msg_info()    { echo -e "${CYAN}ℹ️  $*${NC}"; }

normalize_key_name() {
  echo "$1" | tr '[:lower:]' '[:upper:]' | tr '-' '_' | tr ' ' '_'
}

canonicalize_key_name() {
  local key
  key="$(normalize_key_name "$1")"
  case "$key" in
    GEMENI_API_KEY) echo "GEMINI_API_KEY" ;;
    *) echo "$key" ;;
  esac
}

is_sensitive_key() {
  local key
  key="$(normalize_key_name "$1")"
  local custom_sensitive
  custom_sensitive="$(get_env_value "$CUSTOM_SENSITIVE_KEYS_VAR" | tr ',' '\n' | tr '[:lower:]' '[:upper:]' | tr '-' '_' | tr -d '[:space:]' || true)"
  if [ -n "$custom_sensitive" ] && echo "$custom_sensitive" | grep -qx "$key"; then
    return 0
  fi
  if echo "$key" | grep -qE "^(${SENSITIVE_KEYS})$"; then
    return 0
  fi
  if echo "$key" | grep -qE "(_SECRET|_TOKEN|_PASSWORD|_PASS|_API_KEY|_KEY|PRIVATE_KEY)$"; then
    return 0
  fi
  return 1
}

mark_key_sensitive() {
  local key
  key="$(canonicalize_key_name "$1")"
  local existing raw normalized
  existing="$(get_env_value "$CUSTOM_SENSITIVE_KEYS_VAR")"
  raw="${existing},${key}"
  normalized="$(echo "$raw" | tr ',' '\n' | tr '[:lower:]' '[:upper:]' | tr '-' '_' | tr -d '[:space:]' | awk 'NF && !seen[$0]++' | paste -sd',' -)"
  set_env_value "$CUSTOM_SENSITIVE_KEYS_VAR" "$normalized"
}

usage() {
  echo ""
  echo -e "${BOLD}LearnPlay Configuration Manager${NC}"
  echo ""
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  smtp         Configure SMTP / email settings"
  echo "  url          Configure base URL & domain"
  echo "  api-keys     Manage API keys & secrets (masked)"
  echo "  storage      Configure local upload storage path"
  echo "  security     Configure security settings"
  echo "  show         Show all current configuration (sensitive values masked)"
  echo "  ports        Configure application & service ports"
  echo "  manage       Manage secrets & environment variables (CRUD)"
  echo "  set KEY VAL  Set a specific configuration key"
  echo "  get KEY      Get a specific key's current value"
  echo "  test-smtp    Send a test email to verify SMTP configuration"
  echo ""
  echo "No arguments launches the interactive menu."
  echo ""
  echo "Non-interactive mode:"
  echo "  Set LEARNPLAY_<KEY> env vars before running (e.g., LEARNPLAY_SMTP_HOST=mail.example.com)"
  echo ""
  echo "Examples:"
  echo "  sudo $0 smtp"
  echo "  sudo $0 set GEMINI_API_KEY sk-abc123"
  echo "  sudo $0 get BASE_URL"
  echo "  sudo $0 show"
  echo "  sudo $0 test-smtp"
  echo ""
}

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ This script must be run as root (sudo)${NC}"
  exit 1
fi

mkdir -p /var/log/learnplay

# ============================================
# Helper: Auto-decrypt / re-encrypt integration
# ============================================
ensure_env_decrypted() {
  if [ -f "$ENC_FILE" ] && [ ! -f "$ENV_FILE" ]; then
    msg_info "Secrets are encrypted. Decrypting for editing..."
    if [ -x "$SCRIPT_DIR/secrets-manager.sh" ]; then
      "$SCRIPT_DIR/secrets-manager.sh" decrypt
    else
      bash "$SCRIPT_DIR/secrets-manager.sh" decrypt
    fi
    WAS_ENCRYPTED=true
    log "Auto-decrypted .env for configuration editing"
  fi

  if [ ! -f "$ENV_FILE" ]; then
    msg_error "No .env file found at $ENV_FILE"
    msg_info "Run the application installer first or create a .env file."
    exit 1
  fi
}

finalize() {
  if [ "$CONFIG_CHANGED" = true ]; then
    chown "$APP_USER:$APP_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"

    log "Restarting application via PM2..."
    msg_info "Restarting application..."
    if sudo -u "$APP_USER" pm2 restart "$APP_NAME" 2>&1 | tee -a "$LOG_FILE"; then
      msg_success "Application restarted"
    else
      msg_warn "PM2 restart returned an error. Check: sudo -u $APP_USER pm2 logs $APP_NAME"
    fi
  fi

  if [ "$WAS_ENCRYPTED" = true ]; then
    if [ "$CONFIG_CHANGED" = true ]; then
      msg_info "Waiting for application to become healthy before re-encrypting..."
      local healthy=false
      local health_port
      health_port=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "3000")
      health_port="${health_port:-3000}"
      for i in $(seq 1 10); do
        if curl -sf "http://127.0.0.1:${health_port}/api/health" > /dev/null 2>&1; then
          healthy=true
          break
        fi
        sleep 3
      done
      if [ "$healthy" = true ]; then
        msg_success "Application is healthy"
      else
        msg_warn "Health check did not pass within 30s — re-encrypting anyway"
        msg_warn "App may need manual restart: sudo lppadmin → 9 → 3 (Start app with encrypted secrets)"
      fi
    fi

    msg_info "Re-encrypting secrets..."
    if [ -x "$SCRIPT_DIR/secrets-manager.sh" ]; then
      "$SCRIPT_DIR/secrets-manager.sh" encrypt
    else
      bash "$SCRIPT_DIR/secrets-manager.sh" encrypt
    fi
    log "Auto-re-encrypted .env after configuration editing"
  fi
}

trap finalize EXIT

# ============================================
# Helper: Get a value from .env
# ============================================
get_env_value() {
  local key="$1"
  local value=""
  if [ -f "$ENV_FILE" ]; then
    value=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2-)
  fi
  echo "$value"
}

# ============================================
# Helper: Set a value in .env
# ============================================
set_env_value() {
  local key
  key="$(canonicalize_key_name "$1")"
  local value="$2"

  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  elif grep -qE "^#\s*${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^#\s*${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi

  CONFIG_CHANGED=true
  if is_sensitive_key "$key"; then
    log "Set ${key}=****"
  else
    log "Set ${key}=$value"
  fi
}

disable_env_key() {
  local key
  key="$(normalize_key_name "$1")"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|# ${key}=|" "$ENV_FILE"
    CONFIG_CHANGED=true
  fi
}

# ============================================
# Helper: Mask sensitive values
# ============================================
mask_value() {
  local key
  key="$(normalize_key_name "$1")"
  local value="$2"
  if [ -z "$value" ]; then
    echo -e "${DIM}(not set)${NC}"
    return
  fi
  if is_sensitive_key "$key"; then
    local len=${#value}
    if [ "$len" -le 4 ]; then
      echo "****"
    else
      local tail="${value: -4}"
      echo "****${tail}"
    fi
  else
    echo "$value"
  fi
}

# ============================================
# Helper: Prompt for a value with default
# ============================================
prompt_value() {
  local key="$1"
  local label="$2"
  local current="$3"
  local env_var="LEARNPLAY_${key}"

  if [ -n "${!env_var:-}" ]; then
    set_env_value "$key" "${!env_var}"
    return
  fi

  local masked
  masked=$(mask_value "$key" "$current")
  local prompt_text
  if [ -n "$current" ]; then
    prompt_text="  ${label} [${masked}]: "
  else
    prompt_text="  ${label}: "
  fi

  read -p "$prompt_text" new_value
  if [ -n "$new_value" ]; then
    set_env_value "$key" "$new_value"
  fi
}

prompt_value_secret() {
  local key="$1"
  local label="$2"
  local current="$3"
  local env_var="LEARNPLAY_${key}"

  if [ -n "${!env_var:-}" ]; then
    set_env_value "$key" "${!env_var}"
    return
  fi

  local masked
  masked=$(mask_value "$key" "$current")
  local prompt_text
  if [ -n "$current" ]; then
    prompt_text="  ${label} [${masked}]: "
  else
    prompt_text="  ${label}: "
  fi

  read -sp "$prompt_text" new_value
  echo ""
  if [ -n "$new_value" ]; then
    set_env_value "$key" "$new_value"
  fi
}

# ============================================
# Header
# ============================================
print_header() {
  local title="$1"
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  printf "${CYAN}║${NC}  %-40s${CYAN}║${NC}\n" "$title"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

print_section() {
  local title="$1"
  echo ""
  echo -e "${BOLD}── ${title} ──${NC}"
  echo ""
}

is_integration_managed_key() {
  local key
  key="$(canonicalize_key_name "${1:-}")"
  case "$key" in
    GEMINI_API_KEY|GEMENI_API_KEY|GAMMA_API_KEY|ELEVENLABS_API_KEY|PODCAST_API_KEY|MAILERSEND_API_KEY|MAILERSEND_WEBHOOK_SECRET|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|SMTP_SECURE|SMTP_FROM|YOCO_TEST_SECRET_KEY|YOCO_TEST_PUBLIC_KEY|YOCO_LIVE_SECRET_KEY|YOCO_LIVE_PUBLIC_KEY|YOCO_WEBHOOK_SECRET)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# ============================================
# SMTP / Email Settings
# ============================================
do_smtp() {
  print_header "Email / SMTP Settings"
  msg_warn "SMTP/MailerSend secrets are managed in-app at /admin/integration-settings."
  msg_info "This command is intentionally disabled for secret maintenance."
  return 0

  echo -e "${BOLD}Current SMTP Configuration:${NC}"
  for key in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_SECURE SMTP_FROM EMAIL_FROM MAILERSEND_API_KEY; do
    local val
    val=$(get_env_value "$key")
    local masked
    masked=$(mask_value "$key" "$val")
    printf "  %-22s %s\n" "${key}:" "$masked"
  done
  echo ""

  print_section "SMTP Server Settings"
  msg_info "Press Enter to keep current value."
  echo ""

  prompt_value "SMTP_HOST" "SMTP Host" "$(get_env_value SMTP_HOST)"
  prompt_value "SMTP_PORT" "SMTP Port (25/465/587)" "$(get_env_value SMTP_PORT)"

  local current_user current_pass
  current_user=$(get_env_value SMTP_USER)
  current_pass=$(get_env_value SMTP_PASS)

  if [ -n "${LEARNPLAY_SMTP_AUTH:-}" ]; then
    local smtp_auth="$LEARNPLAY_SMTP_AUTH"
  else
    local auth_default="N"
    if [ -n "$current_user" ]; then
      auth_default="y"
    fi
    read -p "  Authentication required? (y/N): " smtp_auth_input
    local smtp_auth=$( [ "$smtp_auth_input" = "y" ] || [ "$smtp_auth_input" = "Y" ] && echo "true" || echo "false" )
  fi

  if [ "$smtp_auth" = "true" ]; then
    prompt_value "SMTP_USER" "SMTP Username" "$current_user"
    prompt_value_secret "SMTP_PASS" "SMTP Password" "$current_pass"
  else
    if [ -n "$current_user" ] || [ -n "$current_pass" ]; then
      msg_info "Clearing SMTP credentials (no authentication)"
      if grep -qE "^SMTP_USER=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^SMTP_USER=.*|# SMTP_USER=|" "$ENV_FILE"
        CONFIG_CHANGED=true
      fi
      if grep -qE "^SMTP_PASS=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^SMTP_PASS=.*|# SMTP_PASS=|" "$ENV_FILE"
        CONFIG_CHANGED=true
      fi
    fi
  fi

  echo "  (Use 'true' for port 465 implicit TLS. Port 587 uses STARTTLS automatically)"
  prompt_value "SMTP_SECURE" "Use TLS (true/false)" "$(get_env_value SMTP_SECURE)"

  local current_from
  current_from=$(get_env_value EMAIL_FROM)
  prompt_value "EMAIL_FROM" "Sender Email (From address)" "$current_from"
  local new_from
  new_from=$(get_env_value EMAIL_FROM)
  if [ -n "$new_from" ]; then
    set_env_value "SMTP_FROM" "$new_from"
  fi

  print_section "MailerSend (Alternative to SMTP)"
  prompt_value_secret "MAILERSEND_API_KEY" "MailerSend API Key" "$(get_env_value MAILERSEND_API_KEY)"

  echo ""
  if [ -z "${LEARNPLAY_SMTP_HOST:-}" ]; then
    read -p "  Send a test email now? (y/N): " send_test
    if [ "$send_test" = "y" ] || [ "$send_test" = "Y" ]; then
      do_test_smtp
    fi
  fi

  msg_success "Email configuration updated"
}

# ============================================
# Base URL & Domain
# ============================================
do_url() {
  ensure_env_decrypted
  print_header "Base URL & Domain Configuration"

  echo -e "${BOLD}Current URL Configuration:${NC}"
  for key in BASE_URL PUBLIC_BASE_URL FRONTEND_URL VITE_DOMAIN PLATFORM_DOMAINS; do
    local val
    val=$(get_env_value "$key")
    printf "  %-22s %s\n" "${key}:" "${val:-(not set)}"
  done
  echo ""

  msg_info "Press Enter to keep current value."
  echo ""

  local old_base_url
  old_base_url=$(get_env_value BASE_URL)

  prompt_value "BASE_URL" "Base URL (https://...)" "$(get_env_value BASE_URL)"

  local new_base_url
  new_base_url=$(get_env_value BASE_URL)

  if [ -z "${LEARNPLAY_FRONTEND_URL:-}" ]; then
    local current_frontend
    current_frontend=$(get_env_value FRONTEND_URL)
    if [ "$current_frontend" = "$old_base_url" ] || [ -z "$current_frontend" ]; then
      read -p "  Set FRONTEND_URL same as BASE_URL ($new_base_url)? (Y/n): " same_frontend
      if [ "$same_frontend" != "n" ] && [ "$same_frontend" != "N" ]; then
        set_env_value "FRONTEND_URL" "$new_base_url"
      else
        prompt_value "FRONTEND_URL" "Frontend URL" "$current_frontend"
      fi
    else
      prompt_value "FRONTEND_URL" "Frontend URL" "$current_frontend"
    fi
  else
    prompt_value "FRONTEND_URL" "Frontend URL" "$(get_env_value FRONTEND_URL)"
  fi

  if [ -z "${LEARNPLAY_VITE_DOMAIN:-}" ]; then
    local current_vite
    current_vite=$(get_env_value VITE_DOMAIN)
    if [ "$current_vite" = "$old_base_url" ] || [ -z "$current_vite" ]; then
      set_env_value "VITE_DOMAIN" "$new_base_url"
      msg_info "VITE_DOMAIN set to $new_base_url"
    else
      prompt_value "VITE_DOMAIN" "Vite Domain" "$current_vite"
    fi
  else
    prompt_value "VITE_DOMAIN" "Vite Domain" "$(get_env_value VITE_DOMAIN)"
  fi

  local current_public_base
  current_public_base=$(get_env_value PUBLIC_BASE_URL)
  if [ "$current_public_base" = "$old_base_url" ] || [ -z "$current_public_base" ]; then
    set_env_value "PUBLIC_BASE_URL" "$new_base_url"
    msg_info "PUBLIC_BASE_URL set to $new_base_url"
  else
    set_env_value "PUBLIC_BASE_URL" "$new_base_url"
    msg_info "PUBLIC_BASE_URL updated to $new_base_url"
  fi

  prompt_value "PLATFORM_DOMAINS" "Additional Domains (comma-separated)" "$(get_env_value PLATFORM_DOMAINS)"

  if [ "$old_base_url" != "$new_base_url" ] && [ -n "$old_base_url" ]; then
    local new_domain
    new_domain=$(echo "$new_base_url" | sed 's|https\?://||' | sed 's|/.*||')

    if [ -f "$NGINX_CONF" ]; then
      msg_info "Updating Nginx server_name to $new_domain..."
      sed -i "s|server_name .*;|server_name ${new_domain};|" "$NGINX_CONF"
      if nginx -t 2>&1; then
        systemctl reload nginx
        msg_success "Nginx updated for $new_domain"
        log "Nginx server_name updated to $new_domain"
      else
        msg_warn "Nginx config test failed. Please check $NGINX_CONF"
      fi
    fi

    if [ -d "$APP_DIR/client" ]; then
      msg_info "Updating frontend domain references..."
      find "$APP_DIR/client" -name "*.js" -exec sed -i "s|${old_base_url}|${new_base_url}|g" {} + 2>/dev/null || true
      find "$APP_DIR/client" -name "*.html" -exec sed -i "s|${old_base_url}|${new_base_url}|g" {} + 2>/dev/null || true
      msg_success "Frontend references updated"
    fi

    if [ -z "${LEARNPLAY_BASE_URL:-}" ]; then
      read -p "  Re-run SSL setup for $new_domain? (y/N): " rerun_ssl
      if [ "$rerun_ssl" = "y" ] || [ "$rerun_ssl" = "Y" ]; then
        if [ -x "$SCRIPT_DIR/ssl-mode.sh" ]; then
          "$SCRIPT_DIR/ssl-mode.sh"
        else
          bash "$SCRIPT_DIR/ssl-mode.sh" 2>/dev/null || {
            msg_info "Running certbot directly..."
            certbot --nginx -d "$new_domain" --non-interactive --agree-tos 2>&1 | tee -a "$LOG_FILE" || true
          }
        fi
      fi
    fi
  fi

  msg_success "URL configuration updated"
}

# ============================================
# API Keys
# ============================================
do_storage() {
  ensure_env_decrypted

  echo ""
  echo -e "${BOLD}── File Storage Configuration ──${NC}"
  echo ""
  local upload_dir="/opt/learnplay/uploads"
  set_env_value "UPLOAD_DIR" "$upload_dir"
  set_env_value "GOOGLE_SERVICE_ACCOUNT_JSON" ""
  set_env_value "GOOGLE_APPLICATION_CREDENTIALS" ""
  msg_success "Uploads are configured for local filesystem storage: $upload_dir"
  CONFIG_CHANGED=true

  finalize
}


do_api_keys() {
  print_header "API Keys Configuration"
  msg_warn "API keys are managed in-app at /admin/integration-settings."
  msg_info "This command is intentionally disabled for secret maintenance."
  return 0

  echo -e "${BOLD}Current API Keys:${NC}"
  for key in GEMINI_API_KEY GAMMA_API_KEY; do
    local val
    val=$(get_env_value "$key")
    local masked
    masked=$(mask_value "$key" "$val")
    printf "  %-25s %s\n" "${key}:" "$masked"
  done
  echo ""

  msg_info "Press Enter to keep current value."
  echo ""

  print_section "Google Gemini"
  local current_gemini
  current_gemini="$(get_env_value GEMINI_API_KEY)"
  if [ -z "$current_gemini" ]; then
    current_gemini="$(get_env_value GEMENI_API_KEY)"
  fi
  prompt_value_secret "GEMINI_API_KEY" "Gemini API Key" "$current_gemini"
  disable_env_key "GEMENI_API_KEY"

  print_section "Gamma.app"
  prompt_value_secret "GAMMA_API_KEY" "Gamma API Key" "$(get_env_value GAMMA_API_KEY)"

  print_section "Custom API Keys"
  if [ -z "${LEARNPLAY_CUSTOM_KEYS:-}" ]; then
    while true; do
      read -p "  Add a custom API key? (y/N): " add_custom
      if [ "$add_custom" != "y" ] && [ "$add_custom" != "Y" ]; then
        break
      fi
      read -p "    Key name (e.g., MY_SERVICE_API_KEY): " custom_key
      if [ -z "$custom_key" ]; then
        msg_warn "Key name cannot be empty"
        continue
      fi
      custom_key=$(canonicalize_key_name "$custom_key")
      read -sp "    Value: " custom_value
      echo ""
      if [ -n "$custom_value" ]; then
        set_env_value "$custom_key" "$custom_value"
        mark_key_sensitive "$custom_key"
        msg_success "Set $custom_key"
      fi
    done
  else
    IFS=',' read -ra CUSTOM_PAIRS <<< "$LEARNPLAY_CUSTOM_KEYS"
    for pair in "${CUSTOM_PAIRS[@]}"; do
      local ckey cval
      ckey=$(echo "$pair" | cut -d'=' -f1)
      cval=$(echo "$pair" | cut -d'=' -f2-)
      if [ -n "$ckey" ] && [ -n "$cval" ]; then
        set_env_value "$ckey" "$cval"
      fi
    done
  fi

  # Sync Gemini key to aiConfig database table (source of truth for the backend)
  local gemini_val
  gemini_val=$(get_env_value "GEMINI_API_KEY")
  if [ -n "$gemini_val" ]; then
    local db_url
    db_url=$(get_env_value "DATABASE_URL")
    if [ -n "$db_url" ]; then
      local sql_key="${gemini_val//\'/\'\'}"
      local admin_id
      admin_id=$(psql "$db_url" -tAc "SELECT id FROM users WHERE \"isSuperAdmin\" = true OR \"isCustSuper\" = true LIMIT 1" 2>/dev/null || echo '')
      if [ -n "$admin_id" ]; then
        psql "$db_url" -v ON_ERROR_STOP=1 2>/dev/null <<EOSQL_SYNC || msg_warn "Could not sync Gemini key to database"
DO \$\$
DECLARE
  v_admin_id TEXT := '${admin_id}';
  v_api_key TEXT := '${sql_key}';
BEGIN
  IF EXISTS (SELECT 1 FROM "aiConfig" WHERE purpose = 'text' AND "isActive" = true) THEN
    UPDATE "aiConfig" SET "apiKey" = v_api_key, "updatedAt" = NOW()
    WHERE purpose = 'text' AND "isActive" = true;
  ELSE
    INSERT INTO "aiConfig" (id, provider, "apiKey", "modelName", purpose, "isActive", "createdBy")
    VALUES (gen_random_uuid()::text, 'gemini', v_api_key, 'gemini-2.5-flash', 'text', true, v_admin_id);
  END IF;
  IF EXISTS (SELECT 1 FROM "aiConfig" WHERE purpose = 'image' AND "isActive" = true) THEN
    UPDATE "aiConfig" SET "apiKey" = v_api_key, "updatedAt" = NOW()
    WHERE purpose = 'image' AND "isActive" = true;
  ELSE
    INSERT INTO "aiConfig" (id, provider, "apiKey", "modelName", purpose, "isActive", "createdBy")
    VALUES (gen_random_uuid()::text, 'gemini', v_api_key, 'gemini-2.0-flash-exp', 'image', true, v_admin_id);
  END IF;
END
\$\$;
EOSQL_SYNC
        msg_success "Gemini key synced to AI config database"
      fi
    fi
  fi

  msg_success "API keys configuration updated"
}

# ============================================
# Security Settings
# ============================================
do_security() {
  ensure_env_decrypted
  print_header "Security Settings"

  echo -e "${BOLD}Current Security Configuration:${NC}"
  for key in SESSION_SECRET COOKIE_SECURE SESSION_AUTH_ENABLED; do
    local val
    val=$(get_env_value "$key")
    local masked
    masked=$(mask_value "$key" "$val")
    printf "  %-22s %s\n" "${key}:" "$masked"
  done
  echo ""

  msg_info "Press Enter to keep current value."
  echo ""

  local current_session
  current_session=$(get_env_value SESSION_SECRET)
  if [ -z "${LEARNPLAY_SESSION_SECRET:-}" ]; then
    if [ -n "$current_session" ]; then
      read -p "  Regenerate SESSION_SECRET? (y/N): " regen
      if [ "$regen" = "y" ] || [ "$regen" = "Y" ]; then
        local new_secret
        new_secret=$(openssl rand -hex 32)
        set_env_value "SESSION_SECRET" "$new_secret"
        msg_success "SESSION_SECRET regenerated"
        msg_warn "All active user sessions will be invalidated!"
      fi
    else
      local new_secret
      new_secret=$(openssl rand -hex 32)
      set_env_value "SESSION_SECRET" "$new_secret"
      msg_success "SESSION_SECRET generated"
    fi
  else
    prompt_value_secret "SESSION_SECRET" "Session Secret" "$current_session"
  fi

  prompt_value "COOKIE_SECURE" "Secure Cookies (true/false)" "$(get_env_value COOKIE_SECURE)"
  prompt_value "SESSION_AUTH_ENABLED" "Session Auth Enabled (true/false)" "$(get_env_value SESSION_AUTH_ENABLED || echo true)"

  msg_success "Security settings updated"
}

# ============================================
# Show All Configuration
# ============================================
do_show() {
  ensure_env_decrypted
  print_header "Current Configuration"

  local current_section=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^#[[:space:]]*=+ ]]; then
      continue
    elif [[ "$line" =~ ^#[[:space:]]*(.+) ]]; then
      local comment="${BASH_REMATCH[1]}"
      if [[ ! "$comment" =~ ^= ]]; then
        if [ "$current_section" != "$comment" ]; then
          current_section="$comment"
          echo ""
          echo -e "${BOLD}${comment}${NC}"
        fi
      fi
      continue
    elif [[ "$line" =~ ^[[:space:]]*$ ]]; then
      continue
    elif [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
      local key="${BASH_REMATCH[1]}"
      if [ "$key" = "GEMENI_API_KEY" ]; then
        continue
      fi
      local val="${BASH_REMATCH[2]}"
      local display
      display=$(mask_value "$key" "$val")
      printf "  ${CYAN}%-30s${NC} %s\n" "$key" "$display"
    fi
  done < "$ENV_FILE"

  local sys_type
  sys_type=$(get_env_value "SYSTEM_TYPE" 2>/dev/null || echo "")
  if [ -n "$sys_type" ]; then
    echo ""
    echo -e "${BOLD}System Type (read-only — set during installation)${NC}"
    printf "  ${CYAN}%-30s${NC} %s\n" "SYSTEM_TYPE" "$sys_type"
  fi

  echo ""
}

# ============================================
# Set a specific key
# ============================================
do_set() {
  local key="${1:-}"
  local value="${2:-}"

  if [ -z "$key" ] || [ -z "$value" ]; then
    msg_error "Usage: $0 set KEY VALUE"
    msg_info "Example: $0 set GEMINI_API_KEY sk-abc123"
    exit 1
  fi

  ensure_env_decrypted
  key="$(canonicalize_key_name "$key")"
  if is_integration_managed_key "$key"; then
    msg_error "Key '$key' is integration-managed. Update it in /admin/integration-settings."
    exit 1
  fi
  set_env_value "$key" "$value"
  if [ "$key" = "GEMINI_API_KEY" ]; then
    disable_env_key "GEMENI_API_KEY"
  fi
  local display
  display=$(mask_value "$key" "$value")
  msg_success "${key} set to ${display}"
}

# ============================================
# Get a specific key
# ============================================
do_get() {
  local key="${1:-}"

  if [ -z "$key" ]; then
    msg_error "Usage: $0 get KEY"
    msg_info "Example: $0 get BASE_URL"
    exit 1
  fi

  ensure_env_decrypted
  key="$(canonicalize_key_name "$key")"
  if is_integration_managed_key "$key"; then
    msg_error "Key '$key' is integration-managed and not maintained in .env."
    msg_info "View its state in /admin/integration-settings."
    exit 1
  fi
  local value
  value=$(get_env_value "$key")
  if [ -n "$value" ]; then
    local display
    display=$(mask_value "$key" "$value")
    echo -e "${CYAN}${key}${NC}=${GREEN}${display}${NC}"
  else
    msg_warn "Key '$key' not found in $ENV_FILE"
    exit 1
  fi
}

# ============================================
# Test SMTP
# ============================================
do_test_smtp() {
  print_header "Test Email Configuration"
  msg_warn "SMTP/MailerSend testing is now performed via Integration Settings provider tests."
  msg_info "Open /admin/integration-settings and use 'Test Connection'."
  return 0

  local smtp_host smtp_port smtp_user smtp_pass smtp_secure smtp_from email_from
  smtp_host=$(get_env_value SMTP_HOST)
  smtp_port=$(get_env_value SMTP_PORT)
  smtp_user=$(get_env_value SMTP_USER)
  smtp_pass=$(get_env_value SMTP_PASS)
  smtp_secure=$(get_env_value SMTP_SECURE)
  smtp_from=$(get_env_value SMTP_FROM)
  email_from=$(get_env_value EMAIL_FROM)
  local mailersend_key
  mailersend_key=$(get_env_value MAILERSEND_API_KEY)

  local from_addr="${smtp_from:-${email_from:-noreply@localhost}}"

  local test_to
  if [ -n "${LEARNPLAY_TEST_EMAIL:-}" ]; then
    test_to="$LEARNPLAY_TEST_EMAIL"
  else
    read -p "  Send test email to: " test_to
    if [ -z "$test_to" ]; then
      msg_error "Email address is required"
      return 1
    fi
  fi

  if [ -n "$mailersend_key" ] && [ "$mailersend_key" != "your_mailersend_api_key_here" ]; then
    msg_info "Sending test email via MailerSend..."
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "https://api.mailersend.com/v1/email" \
      -H "Authorization: Bearer ${mailersend_key}" \
      -H "Content-Type: application/json" \
      -d "{
        \"from\": {\"email\": \"${from_addr}\", \"name\": \"LearnPlay Test\"},
        \"to\": [{\"email\": \"${test_to}\"}],
        \"subject\": \"LearnPlay Test Email\",
        \"text\": \"This is a test email from your LearnPlay on-premises installation. If you received this, your email configuration is working correctly. Sent at: $(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }" 2>&1)

    local http_code
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
      msg_success "Test email sent to $test_to via MailerSend"
      log "Test email sent to $test_to via MailerSend (HTTP $http_code)"
    else
      msg_error "MailerSend returned HTTP $http_code"
      echo -e "  ${DIM}Response: $body${NC}"
      log "Test email failed via MailerSend (HTTP $http_code)"
    fi

  elif [ -n "$smtp_host" ]; then
    msg_info "Sending test email via SMTP ($smtp_host:${smtp_port:-587})..."

    local curl_args=()
    local proto="smtp"
    local port="${smtp_port:-587}"
    local secure="${smtp_secure:-false}"

    if [ "$port" = "465" ]; then
      proto="smtps"
    fi

    local url="${proto}://${smtp_host}:${port}"
    curl_args+=(--url "$url")
    curl_args+=(--mail-from "$from_addr")
    curl_args+=(--mail-rcpt "$test_to")

    if [ -n "$smtp_user" ] && [ -n "$smtp_pass" ]; then
      curl_args+=(--user "${smtp_user}:${smtp_pass}")
    fi

    if [ "$proto" != "smtps" ] && [ "$secure" = "true" ]; then
      curl_args+=(--ssl-reqd)
    fi

    local email_body
    email_body=$(cat <<EMAILEOF
From: LearnPlay Test <${from_addr}>
To: ${test_to}
Subject: LearnPlay Test Email
Date: $(date -R)
Content-Type: text/plain; charset=UTF-8

This is a test email from your LearnPlay on-premises installation.
If you received this, your SMTP configuration is working correctly.

Sent at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EMAILEOF
)

    if echo "$email_body" | curl -s "${curl_args[@]}" -T - 2>&1; then
      msg_success "Test email sent to $test_to via SMTP"
      log "Test email sent to $test_to via SMTP ($smtp_host)"
    else
      msg_error "SMTP test failed. Check your SMTP settings."
      log "Test email failed via SMTP ($smtp_host)"
    fi

  else
    msg_error "No email configuration found."
    msg_info "Configure SMTP settings or a MailerSend API key first."
    msg_info "Run: $0 smtp"
  fi
}

# ============================================
# Manage Secrets & Environment Variables
# ============================================
do_manage_secrets() {
  ensure_env_decrypted
  print_header "Manage Secrets & Environment Variables"

  while true; do
    echo ""
    echo "  1) View all variables (sensitive values masked)"
    echo "  2) View a specific variable"
    echo "  3) Set / Update a variable"
    echo "  4) Add a new variable"
    echo "  5) Remove a variable"
    echo "  6) Back"
    echo ""
    read -p "Select option [1-6]: " choice

    case "$choice" in
      1) do_show ;;
      2)
        read -p "  Enter key name: " view_key
        if [ -n "$view_key" ]; then
          view_key=$(canonicalize_key_name "$view_key")
          if is_integration_managed_key "$view_key"; then
            msg_error "Key '$view_key' is integration-managed. View it in /admin/integration-settings."
            continue
          fi
          local val
          val=$(get_env_value "$view_key")
          if [ -n "$val" ]; then
            local masked
            masked=$(mask_value "$view_key" "$val")
            echo -e "  ${CYAN}${view_key}${NC} = ${masked}"
          else
            msg_warn "Key '$view_key' not found"
          fi
        fi
        ;;
      3)
        read -p "  Enter key name to update: " update_key
        if [ -n "$update_key" ]; then
          update_key=$(canonicalize_key_name "$update_key")
          if is_integration_managed_key "$update_key"; then
            msg_error "Key '$update_key' is integration-managed. Update it in /admin/integration-settings."
            continue
          fi
          local current
          current=$(get_env_value "$update_key")
          if [ -z "$current" ]; then
            msg_warn "Key '$update_key' not found. Use option 4 to add new variables."
          else
            local is_sensitive=false
            is_sensitive_key "$update_key" && is_sensitive=true
            if [ "$is_sensitive" = true ]; then
              prompt_value_secret "$update_key" "$update_key" "$current"
            else
              prompt_value "$update_key" "$update_key" "$current"
            fi
            msg_success "Updated $update_key"
          fi
        fi
        ;;
      4)
        read -p "  Enter new key name (e.g., MY_API_KEY): " new_key
        if [ -n "$new_key" ]; then
          new_key=$(canonicalize_key_name "$new_key")
          if is_integration_managed_key "$new_key"; then
            msg_error "Key '$new_key' is integration-managed. Add it in /admin/integration-settings."
            continue
          fi
          local existing
          existing=$(get_env_value "$new_key")
          if [ -n "$existing" ]; then
            msg_warn "Key '$new_key' already exists. Use option 3 to update."
          else
            read -p "  Is this a sensitive value? (y/N): " is_sens
            if [ "$is_sens" = "y" ] || [ "$is_sens" = "Y" ]; then
              read -sp "  Enter value: " new_val
              echo ""
              mark_key_sensitive "$new_key"
            else
              read -p "  Enter value: " new_val
            fi
            if [ -n "$new_val" ]; then
              set_env_value "$new_key" "$new_val"
              msg_success "Added $new_key"
            else
              msg_warn "Empty value, skipping."
            fi
          fi
        fi
        ;;
      5)
        read -p "  Enter key name to remove: " del_key
        if [ -n "$del_key" ]; then
          del_key=$(canonicalize_key_name "$del_key")
          if is_integration_managed_key "$del_key"; then
            msg_error "Key '$del_key' is integration-managed. Remove it in /admin/integration-settings."
            continue
          fi
          local del_val
          del_val=$(get_env_value "$del_key")
          if [ -z "$del_val" ]; then
            msg_warn "Key '$del_key' not found"
          else
            read -p "  Are you sure you want to remove '$del_key'? (y/N): " confirm_del
            if [ "$confirm_del" = "y" ] || [ "$confirm_del" = "Y" ]; then
              sed -i "s|^${del_key}=.*|# ${del_key}=|" "$ENV_FILE"
              CONFIG_CHANGED=true
              log "Removed ${del_key}"
              msg_success "Removed $del_key (commented out in .env)"
            fi
          fi
        fi
        ;;
      6) return ;;
      *) msg_error "Invalid option" ;;
    esac

    echo ""
    read -p "Press Enter to continue..." _
  done
}

configure_ports() {
  ensure_env_decrypted
  print_header "Port Configuration"

  local current_app_port current_db_port current_nginx_http current_nginx_https
  current_app_port=$(get_env_value PORT)
  current_db_port=$(get_env_value DB_PORT)
  current_nginx_http=$(get_env_value NGINX_HTTP_PORT)
  current_nginx_https=$(get_env_value NGINX_HTTPS_PORT)

  current_app_port="${current_app_port:-3000}"
  current_db_port="${current_db_port:-5432}"
  current_nginx_http="${current_nginx_http:-80}"
  current_nginx_https="${current_nginx_https:-443}"

  echo -e "${BOLD}Current Port Configuration:${NC}"
  printf "  %-22s %s\n" "Application Port:" "$current_app_port"
  printf "  %-22s %s\n" "PostgreSQL Port:" "$current_db_port"
  printf "  %-22s %s\n" "Nginx HTTP Port:" "$current_nginx_http"
  printf "  %-22s %s\n" "Nginx HTTPS Port:" "$current_nginx_https"
  echo ""

  msg_info "Press Enter to keep current value."
  echo ""

  local new_app_port="$current_app_port"
  while true; do
    read -p "  Application Port [$current_app_port]: " input_port
    if [ -z "$input_port" ]; then
      break
    fi
    if [[ "$input_port" =~ ^[0-9]+$ ]] && [ "$input_port" -ge 1 ] && [ "$input_port" -le 65535 ]; then
      new_app_port="$input_port"
      break
    fi
    msg_warn "Port must be a number between 1 and 65535"
  done

  local new_db_port="$current_db_port"
  while true; do
    read -p "  PostgreSQL Port [$current_db_port]: " input_port
    if [ -z "$input_port" ]; then
      break
    fi
    if [[ "$input_port" =~ ^[0-9]+$ ]] && [ "$input_port" -ge 1 ] && [ "$input_port" -le 65535 ]; then
      new_db_port="$input_port"
      break
    fi
    msg_warn "Port must be a number between 1 and 65535"
  done

  local new_nginx_http="$current_nginx_http"
  while true; do
    read -p "  Nginx HTTP Port [$current_nginx_http]: " input_port
    if [ -z "$input_port" ]; then
      break
    fi
    if [[ "$input_port" =~ ^[0-9]+$ ]] && [ "$input_port" -ge 1 ] && [ "$input_port" -le 65535 ]; then
      new_nginx_http="$input_port"
      break
    fi
    msg_warn "Port must be a number between 1 and 65535"
  done

  local new_nginx_https="$current_nginx_https"
  while true; do
    read -p "  Nginx HTTPS Port [$current_nginx_https]: " input_port
    if [ -z "$input_port" ]; then
      break
    fi
    if [[ "$input_port" =~ ^[0-9]+$ ]] && [ "$input_port" -ge 1 ] && [ "$input_port" -le 65535 ]; then
      new_nginx_https="$input_port"
      break
    fi
    msg_warn "Port must be a number between 1 and 65535"
  done

  if [ "$new_app_port" != "$current_app_port" ]; then
    set_env_value "PORT" "$new_app_port"
    msg_info "Application port updated: $current_app_port → $new_app_port"
  fi

  if [ "$new_db_port" != "$current_db_port" ]; then
    set_env_value "DB_PORT" "$new_db_port"
    local current_url
    current_url=$(get_env_value DATABASE_URL)
    if [ -n "$current_url" ]; then
      local new_url
      new_url=$(echo "$current_url" | sed "s/localhost:[0-9]*/localhost:$new_db_port/")
      set_env_value "DATABASE_URL" "$new_url"
    fi
    msg_info "PostgreSQL port updated: $current_db_port → $new_db_port"

    local pg_conf="/etc/postgresql/*/main/postgresql.conf"
    if ls $pg_conf 1>/dev/null 2>&1; then
      sed -i "s/^port = .*/port = $new_db_port/" $pg_conf
      msg_info "Updated postgresql.conf"
      systemctl restart postgresql 2>/dev/null && msg_info "PostgreSQL restarted on port $new_db_port" || msg_warn "Could not restart PostgreSQL"
    fi
  fi

  if [ "$new_nginx_http" != "$current_nginx_http" ] || [ "$new_nginx_https" != "$current_nginx_https" ]; then
    set_env_value "NGINX_HTTP_PORT" "$new_nginx_http"
    set_env_value "NGINX_HTTPS_PORT" "$new_nginx_https"
    msg_info "Nginx ports updated: HTTP $new_nginx_http, HTTPS $new_nginx_https"

    if [ -f "$NGINX_CONF" ]; then
      sed -i "s/listen [0-9]* default_server;/listen $new_nginx_http default_server;/" "$NGINX_CONF"
      sed -i "s/listen \[::\]:[0-9]* default_server;/listen [::]:$new_nginx_http default_server;/" "$NGINX_CONF"
      sed -i "s/listen [0-9]* ssl/listen $new_nginx_https ssl/" "$NGINX_CONF"
      sed -i "s/listen \[::\]:[0-9]* ssl/listen [::]:$new_nginx_https ssl/" "$NGINX_CONF"
      if nginx -t 2>/dev/null; then
        systemctl reload nginx
        msg_info "Nginx reloaded with new ports"
      else
        msg_warn "Nginx config test failed. Please check $NGINX_CONF"
      fi
    fi

    if command -v ufw >/dev/null 2>&1; then
      ufw allow "$new_nginx_http"/tcp >/dev/null 2>&1
      ufw allow "$new_nginx_https"/tcp >/dev/null 2>&1
      msg_info "Firewall rules updated"
    fi
  fi

  if [ "$CONFIG_CHANGED" = true ]; then
    msg_success "Port configuration updated successfully"
  else
    msg_info "No port changes made"
  fi
}

# ============================================
# Interactive Menu
# ============================================
show_menu() {
  ensure_env_decrypted

  while true; do
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║    LearnPlay Configuration Manager       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "  1) Email / SMTP Settings"
    echo "  2) Base URL & Domain"
    echo "  3) API Keys & Secrets (all, masked)"
    echo "  4) Security Settings"
    echo "  5) View Current Configuration"
    echo "  6) Manage Secrets & Environment Variables"
    echo "  7) Port Configuration"
    echo "  8) Set Custom Variable"
    echo "  9) Test Email Configuration"
    echo " 10) Back / Exit"
    echo ""
    read -p "Select option [1-10]: " choice

    case "$choice" in
      1) do_smtp ;;
      2) do_url ;;
      3) do_manage_secrets ;;
      4) do_security ;;
      5) do_show ;;
      6) do_manage_secrets ;;
      7) configure_ports ;;
      8)
        read -p "  Variable name: " var_name
        if [ -z "$var_name" ]; then
          msg_warn "Variable name cannot be empty"
          continue
        fi
        var_name=$(canonicalize_key_name "$var_name")
        if is_integration_managed_key "$var_name"; then
          msg_error "Key '$var_name' is integration-managed. Update it in /admin/integration-settings."
          continue
        fi
        local is_sensitive=false
        is_sensitive_key "$var_name" && is_sensitive=true
        if [ "$is_sensitive" = true ]; then
          read -sp "  Value: " var_value
          echo ""
        else
          read -p "  Value: " var_value
        fi
        if [ -n "$var_value" ]; then
          set_env_value "$var_name" "$var_value"
          if [ "$var_name" = "GEMINI_API_KEY" ]; then
            disable_env_key "GEMENI_API_KEY"
          fi
          local display
          display=$(mask_value "$var_name" "$var_value")
          msg_success "${var_name} set to ${display}"
        else
          msg_warn "Value cannot be empty"
        fi
        ;;
      9) do_test_smtp ;;
      10)
        msg_info "Goodbye!"
        exit 0
        ;;
      *)
        msg_error "Invalid option. Please select 1-10."
        ;;
    esac

    echo ""
    read -p "Press Enter to continue..." _
  done
}

# ============================================
# Command dispatcher
# ============================================
case "${1:-}" in
  smtp)       do_smtp ;;
  url)        do_url ;;
  api-keys)   do_manage_secrets ;;
  security)   do_security ;;
  show)       do_show ;;
  set)        do_set "${2:-}" "${3:-}" ;;
  get)        do_get "${2:-}" ;;
  test-smtp)  do_test_smtp ;;
  secrets|manage)  do_manage_secrets ;;
  ports)    configure_ports ;;
  help|--help|-h)
    usage
    ;;
  "")
    show_menu
    ;;
  *)
    msg_error "Unknown command: $1"
    usage
    exit 1
    ;;
esac
