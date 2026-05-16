#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"
NGINX_LIMITS="/etc/nginx/conf.d/learnplay-limits.conf"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
ENC_FILE="$APP_DIR/.env.enc"
LOG_FILE="/var/log/learnplay/admin.log"
BACKUP_DIR="${LEARNPLAY_BACKUP_DIR:-/lppbackups}/nginx"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WAS_ENCRYPTED=false

mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ssl] $*" | tee -a "$LOG_FILE"; }

run_cert_automation() {
  local action="${1:-update-status}"
  local cert_script="$SCRIPT_DIR/cert-automation.sh"
  if [ -x "$cert_script" ]; then
    LEARNPLAY_APP_DIR="$APP_DIR" "$cert_script" "$action" >/dev/null 2>&1 || true
  fi
}

get_app_port() {
  local APP_DIR="${LEARNPLAY_DIR:-/opt/learnplay}"
  local port=""
  if [ -f "$APP_DIR/.env" ]; then
    port=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  fi
  echo "${port:-3000}"
}

get_nginx_ports() {
  local APP_DIR="${LEARNPLAY_DIR:-/opt/learnplay}"
  local http_port="" https_port=""
  if [ -f "$APP_DIR/.env" ]; then
    http_port=$(grep -E "^NGINX_HTTP_PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    https_port=$(grep -E "^NGINX_HTTPS_PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  fi
  NGINX_HTTP_PORT="${http_port:-80}"
  NGINX_HTTPS_PORT="${https_port:-443}"
}

ensure_env_decrypted() {
  if [ -f "$ENC_FILE" ] && [ ! -f "$ENV_FILE" ]; then
    log "Secrets are encrypted. Decrypting for SSL mode change..."
    if [ -x "$SCRIPT_DIR/secrets-manager.sh" ]; then
      "$SCRIPT_DIR/secrets-manager.sh" decrypt
    else
      bash "$SCRIPT_DIR/secrets-manager.sh" decrypt
    fi
    WAS_ENCRYPTED=true
    log "Auto-decrypted .env for SSL mode editing"
  fi
}

reencrypt_if_needed() {
  if [ "$WAS_ENCRYPTED" = true ]; then
    log "Re-encrypting secrets after SSL mode change..."
    if [ -x "$SCRIPT_DIR/secrets-manager.sh" ]; then
      "$SCRIPT_DIR/secrets-manager.sh" encrypt
    else
      bash "$SCRIPT_DIR/secrets-manager.sh" encrypt
    fi
    log "Auto-re-encrypted .env"
  fi
}

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

get_domain() {
  local domain=""
  if [ ! -f "$ENV_FILE" ] && [ -f "$ENC_FILE" ]; then
    ensure_env_decrypted
  fi
  if [ -f "$ENV_FILE" ]; then
    domain=$(grep -E '^BASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | sed 's/^BASE_URL=https\?:\/\///' | tr -d '[:space:]')
  fi
  if [ -z "$domain" ] && [ -f "$NGINX_CONF" ]; then
    domain=$(grep -m1 'server_name' "$NGINX_CONF" 2>/dev/null | awk '{print $2}' | tr -d ';' | tr -d '[:space:]')
  fi
  if [ -z "$domain" ]; then
    echo "❌ Cannot determine domain. Ensure $ENV_FILE or $NGINX_CONF exists."
    exit 1
  fi
  echo "$domain"
}

get_upload_dir() {
  local upload_dir="/opt/learnplay/uploads"
  if [ -f "$ENV_FILE" ]; then
    local env_val
    env_val=$(grep -E '^UPLOAD_DIR=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]')
    if [ -n "$env_val" ]; then
      upload_dir="$env_val"
    fi
  fi
  echo "$upload_dir"
}

is_behind_caddy_mode() {
  local setup_ssl=""
  local behind_caddy=""
  if [ -f "$ENV_FILE" ]; then
    setup_ssl=$(grep -E '^LEARNPLAY_SETUP_SSL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)
    behind_caddy=$(grep -E '^LEARNPLAY_BEHIND_CADDY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]' || true)
  fi
  if [ "$setup_ssl" = "caddy-http" ] || [ "${behind_caddy:-false}" = "true" ]; then
    return 0
  fi
  return 1
}

get_current_mode() {
  if [ ! -f "$NGINX_CONF" ]; then
    echo "unknown"
    return
  fi
  if grep -qE 'listen [0-9]+ ssl' "$NGINX_CONF" 2>/dev/null; then
    if grep -q 'return 444' "$NGINX_CONF" 2>/dev/null; then
      echo "https"
    elif grep -q 'return 301 https' "$NGINX_CONF" 2>/dev/null; then
      echo "prefer-https"
    else
      echo "https"
    fi
  else
    echo "http"
  fi
}

get_cert_path() {
  local domain="$1"
  if [ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
    echo "/etc/letsencrypt/live/$domain/fullchain.pem"
  elif [ -f "/etc/ssl/learnplay/fullchain.pem" ] && [ -f "/etc/ssl/learnplay/privkey.pem" ]; then
    echo "/etc/ssl/learnplay/fullchain.pem"
  else
    echo ""
  fi
}

get_cert_source() {
  local domain="$1"
  local cert_path
  cert_path=$(get_cert_path "$domain")
  if [ -z "$cert_path" ]; then
    echo "none"
    return
  fi
  if [[ "$cert_path" == /etc/ssl/learnplay/* ]]; then
    local issuer
    issuer=$(openssl x509 -issuer -noout -in "$cert_path" 2>/dev/null || echo "")
    if echo "$issuer" | grep -qi "Let's Encrypt"; then
      echo "letsencrypt"
    else
      local subject
      subject=$(openssl x509 -subject -noout -in "$cert_path" 2>/dev/null || echo "")
      if [ "$issuer" = "$subject" ] 2>/dev/null; then
        echo "self-signed"
      else
        echo "custom"
      fi
    fi
  elif [[ "$cert_path" == /etc/letsencrypt/* ]]; then
    echo "letsencrypt"
  else
    echo "unknown"
  fi
}

check_cert() {
  local domain="$1"
  if [ -f "/etc/ssl/learnplay/fullchain.pem" ] && [ -f "/etc/ssl/learnplay/privkey.pem" ]; then
    return 0
  fi
  if [ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
    return 0
  fi
  return 1
}

get_cert_expiry() {
  local domain="$1"
  local cert_path
  cert_path=$(get_cert_path "$domain")
  if [ -n "$cert_path" ]; then
    openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2
  else
    echo "N/A"
  fi
}

get_cert_expiry_date() {
  local domain="$1"
  local cert_path
  cert_path=$(get_cert_path "$domain")
  if [ -n "$cert_path" ]; then
    openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2 | xargs -I{} date -d {} '+%Y-%m-%d' 2>/dev/null || echo "unknown"
  else
    echo "N/A"
  fi
}

is_cert_valid() {
  local domain="$1"
  local cert_path
  cert_path=$(get_cert_path "$domain")
  if [ -n "$cert_path" ]; then
    openssl x509 -checkend 0 -noout -in "$cert_path" 2>/dev/null
    return $?
  fi
  return 1
}

backup_config() {
  if [ -f "$NGINX_CONF" ]; then
    local ts
    ts=$(date '+%Y%m%d_%H%M%S')
    cp "$NGINX_CONF" "$BACKUP_DIR/learnplay_nginx_$ts.conf"
    log "Backed up current Nginx config to $BACKUP_DIR/learnplay_nginx_$ts.conf"
  fi
  if [ -f "$NGINX_LIMITS" ]; then
    local ts
    ts=$(date '+%Y%m%d_%H%M%S')
    cp "$NGINX_LIMITS" "$BACKUP_DIR/learnplay-limits_$ts.conf"
  fi
}

write_rate_limits() {
  cat > "$NGINX_LIMITS" << 'LIMITS_EOF'
# LearnPlay Rate Limiting Zones
# Auto-generated by ssl-mode.sh — do not edit manually

# General API rate limit: 30 requests per second
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

# Login endpoint rate limit: 5 requests per minute (prevents brute force)
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
LIMITS_EOF
  log "Rate limiting zones written to $NGINX_LIMITS"
}

generate_common_locations() {
  local upload_dir="$1"
  local forwarded_proto="\$scheme"
  if is_behind_caddy_mode; then
    forwarded_proto="\$http_x_forwarded_proto"
  fi
  cat << LOCATIONS_EOF
    # File Upload Configuration
    client_max_body_size 100M;
    client_body_buffer_size 10M;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;

    # Course Transfer Uploads: Large Streamed Jobs
    location ~ ^/api/courses/(import-analyze|import-job|import)$ {
        client_max_body_size 0;
        proxy_pass http://127.0.0.1:$(get_app_port);
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${forwarded_proto};
        proxy_connect_timeout 60s;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_request_buffering off;
        proxy_buffering off;
    }

    # Static File Serving: /uploads/
    location /uploads/ {
        alias ${upload_dir}/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # Login Endpoint: Rate-Limited
    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://127.0.0.1:$(get_app_port);
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${forwarded_proto};
        proxy_buffering off;
    }

    # WebSocket Support: /socket.io/
    location /socket.io/ {
        proxy_pass http://127.0.0.1:$(get_app_port);
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${forwarded_proto};
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
        proxy_connect_timeout 7d;
    }

    # Public Objects: Served directly from filesystem
    # Theme thumbnails, image styles, and other public assets
    location /api/public-objects/ {
        alias ${upload_dir}/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # API Endpoints: Rate-Limited
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://127.0.0.1:$(get_app_port);
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${forwarded_proto};
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }

    # All Other Routes
    location / {
        proxy_pass http://127.0.0.1:$(get_app_port);
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${forwarded_proto};
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
LOCATIONS_EOF
}

generate_security_headers() {
  cat << 'HEADERS_EOF'
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
HEADERS_EOF
}

generate_ssl_headers() {
  cat << 'SSLHEADERS_EOF'
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
SSLHEADERS_EOF
}

generate_ssl_block() {
  local domain="$1"
  local cert_path key_path

  if [ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]; then
    cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
    key_path="/etc/letsencrypt/live/${domain}/privkey.pem"
  elif [ -f "/etc/ssl/learnplay/fullchain.pem" ] && [ -f "/etc/ssl/learnplay/privkey.pem" ]; then
    cert_path="/etc/ssl/learnplay/fullchain.pem"
    key_path="/etc/ssl/learnplay/privkey.pem"
  else
    echo "    # ERROR: No SSL certificates found"
    return 1
  fi

  if [[ "$cert_path" == /etc/letsencrypt/* ]]; then
    cat << SSL_EOF
    # SSL/TLS Configuration (Let's Encrypt)
    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
SSL_EOF
  else
    cat << SSL_EOF
    # SSL/TLS Configuration (Custom/Self-Signed)
    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
SSL_EOF
  fi
}

generate_http_config() {
  local domain="$1"
  local upload_dir="$2"
  get_nginx_ports
  cat << EOF
# LearnPlay Nginx Configuration — HTTP Only
# Generated by ssl-mode.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)

server {
    listen $NGINX_HTTP_PORT;
    listen [::]:$NGINX_HTTP_PORT;
    server_name ${domain};

    # ACME challenge for SSL certificate issuance
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

$(generate_security_headers)

$(generate_common_locations "$upload_dir")
}
EOF
}

generate_https_config() {
  local domain="$1"
  local upload_dir="$2"
  get_nginx_ports
  cat << EOF
# LearnPlay Nginx Configuration — HTTPS Only
# Generated by ssl-mode.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)

server {
    listen $NGINX_HTTP_PORT;
    listen [::]:$NGINX_HTTP_PORT;
    server_name ${domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 444;
    }
}

server {
    listen $NGINX_HTTPS_PORT ssl http2;
    listen [::]:$NGINX_HTTPS_PORT ssl http2;
    server_name ${domain};

$(generate_ssl_block "$domain")

$(generate_security_headers)
$(generate_ssl_headers)

$(generate_common_locations "$upload_dir")
}
EOF
}

generate_prefer_https_config() {
  local domain="$1"
  local upload_dir="$2"
  local http_behavior_block
  get_nginx_ports
  if is_behind_caddy_mode; then
    http_behavior_block=$(cat <<'EOF'
    location / {
        # Behind Caddy: keep local HTTP backend available (no redirect).
        proxy_pass http://127.0.0.1:__APP_PORT__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Caddy terminates TLS upstream; force https for backend session security.
        proxy_set_header X-Forwarded-Proto https;
    }
EOF
)
    http_behavior_block="${http_behavior_block//__APP_PORT__/$(get_app_port)}"
  else
    http_behavior_block=$(cat <<'EOF'
    location / {
        return 301 https://$host$request_uri;
    }
EOF
)
  fi
  cat << EOF
# LearnPlay Nginx Configuration — HTTPS Preferred (HTTP → HTTPS redirect)
# Generated by ssl-mode.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)

server {
    listen $NGINX_HTTP_PORT;
    listen [::]:$NGINX_HTTP_PORT;
    server_name ${domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

${http_behavior_block}
}

server {
    listen $NGINX_HTTPS_PORT ssl http2;
    listen [::]:$NGINX_HTTPS_PORT ssl http2;
    server_name ${domain};

$(generate_ssl_block "$domain")

$(generate_security_headers)
$(generate_ssl_headers)

$(generate_common_locations "$upload_dir")
}
EOF
}

update_env() {
  local mode="$1"
  local domain="$2"

  ensure_env_decrypted

  if [ ! -f "$ENV_FILE" ]; then
    log "⚠️  $ENV_FILE not found, skipping env update"
    return
  fi

  local scheme="https"
  local cookie_secure="true"
  if [ "$mode" = "http" ]; then
    scheme="http"
    cookie_secure="false"
  fi

  local base_url="${scheme}://${domain}"

  if grep -q '^COOKIE_SECURE=' "$ENV_FILE"; then
    sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=$cookie_secure|" "$ENV_FILE"
  else
    echo "COOKIE_SECURE=$cookie_secure" >> "$ENV_FILE"
  fi

  if grep -q '^BASE_URL=' "$ENV_FILE"; then
    sed -i "s|^BASE_URL=.*|BASE_URL=$base_url|" "$ENV_FILE"
  else
    echo "BASE_URL=$base_url" >> "$ENV_FILE"
  fi

  if grep -q '^FRONTEND_URL=' "$ENV_FILE"; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$base_url|" "$ENV_FILE"
  else
    echo "FRONTEND_URL=$base_url" >> "$ENV_FILE"
  fi

  if grep -q '^VITE_DOMAIN=' "$ENV_FILE"; then
    sed -i "s|^VITE_DOMAIN=.*|VITE_DOMAIN=$base_url|" "$ENV_FILE"
  else
    echo "VITE_DOMAIN=$base_url" >> "$ENV_FILE"
  fi

  if grep -q '^PUBLIC_BASE_URL=' "$ENV_FILE"; then
    sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$base_url|" "$ENV_FILE"
  else
    echo "PUBLIC_BASE_URL=$base_url" >> "$ENV_FILE"
  fi

  log "Updated .env: COOKIE_SECURE=$cookie_secure, BASE_URL=$base_url, PUBLIC_BASE_URL=$base_url"

  reencrypt_if_needed
}

apply_mode() {
  local mode="$1"
  local domain
  domain=$(get_domain)
  local upload_dir
  upload_dir=$(get_upload_dir)

  log "Switching to SSL mode: $mode (domain: $domain)"

  if [ "$mode" = "https" ] || [ "$mode" = "prefer-https" ]; then
    if ! check_cert "$domain"; then
      log "⚠️  No SSL certificate found"
      if [ -n "${LEARNPLAY_SSL_MODE:-}" ]; then
        log "❌ Cannot use $mode without SSL certificates. Falling back to HTTP-only."
        mode="http"
      else
        echo ""
        echo "No SSL certificate found for $domain."
        echo "  1) Run Certbot now to obtain a certificate"
        echo "  2) Fall back to HTTP-only mode"
        echo ""
        read -p "Select [1-2]: " cert_choice
        case "$cert_choice" in
          1)
            run_certbot "$domain"
            if ! check_cert "$domain"; then
              log "❌ Certbot failed. Falling back to HTTP-only."
              mode="http"
            fi
            ;;
          *)
            log "Falling back to HTTP-only mode."
            mode="http"
            ;;
        esac
      fi
    fi
  fi

  backup_config
  write_rate_limits

  mkdir -p /var/www/certbot

  local new_config
  case "$mode" in
    http)
      new_config=$(generate_http_config "$domain" "$upload_dir")
      ;;
    https)
      new_config=$(generate_https_config "$domain" "$upload_dir")
      ;;
    prefer-https)
      new_config=$(generate_prefer_https_config "$domain" "$upload_dir")
      ;;
    *)
      log "❌ Unknown mode: $mode"
      exit 1
      ;;
  esac

  echo "$new_config" > "$NGINX_CONF"
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$APP_NAME"

  if nginx -t 2>&1; then
    log "✅ Nginx config test passed"
  else
    log "❌ Nginx config test FAILED — rolling back"
    local latest_backup
    latest_backup=$(ls -t "$BACKUP_DIR"/learnplay_nginx_*.conf 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
      cp "$latest_backup" "$NGINX_CONF"
      log "Restored from $latest_backup"
    fi
    local latest_limits_backup
    latest_limits_backup=$(ls -t "$BACKUP_DIR"/learnplay-limits_*.conf 2>/dev/null | head -1)
    if [ -n "$latest_limits_backup" ]; then
      cp "$latest_limits_backup" "$NGINX_LIMITS"
    fi
    exit 1
  fi

  update_env "$mode" "$domain"

  systemctl reload nginx
  log "✅ Nginx reloaded"

  if command -v pm2 &>/dev/null; then
    sudo -u "$APP_USER" pm2 restart "$APP_NAME" 2>/dev/null && log "✅ PM2 app restarted" || log "⚠️  PM2 restart skipped (app may not be running)"
  else
    log "⚠️  PM2 not found, skipping app restart"
  fi
  run_cert_automation update-status

  log "✅ SSL mode set to: $mode"
  echo ""
  echo "✅ SSL mode changed to: $mode"
  echo "   Domain: $domain"
  if [ "$mode" = "http" ]; then
    echo "   URL:    http://$domain"
  else
    echo "   URL:    https://$domain"
  fi
}

offer_switch_to_https() {
  local current_mode
  current_mode=$(get_current_mode)
  if [ "$current_mode" = "https" ] || [ "$current_mode" = "prefer-https" ]; then
    return 0
  fi
  echo "  Would you like to switch to HTTPS mode now?"
  echo "    1) HTTPS Preferred (redirect HTTP → HTTPS) — recommended"
  echo "    2) HTTPS Only (no HTTP access)"
  echo "    3) No, stay on HTTP for now"
  echo ""
  read -p "  Select [1-3]: " switch_choice
  case "$switch_choice" in
    1) apply_mode "prefer-https" ;;
    2) apply_mode "https" ;;
    *) echo "  Staying on HTTP mode. You can switch later from the SSL menu." ;;
  esac
}

run_certbot() {
  local domain="${1:-$(get_domain)}"

  log "Running Certbot for $domain..."

  local admin_email=""
  if [ -f "$ENV_FILE" ]; then
    admin_email=$(grep -E '^EMAIL_FROM=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]')
  fi

  mkdir -p /var/www/certbot

  local certbot_args=(
    certonly
    --webroot
    -w /var/www/certbot
    -d "$domain"
    --non-interactive
    --agree-tos
  )

  if [ -n "$admin_email" ]; then
    certbot_args+=(--email "$admin_email")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi

  if certbot "${certbot_args[@]}" 2>&1 | tee -a "$LOG_FILE"; then
    run_cert_automation install
    log "✅ SSL certificate obtained for $domain"
    echo "✅ Certificate obtained successfully!"
    offer_switch_to_https
  else
    log "❌ Certbot failed for $domain"
    echo "❌ Failed to obtain certificate. Check DNS and firewall settings."
    return 1
  fi
}

import_custom_cert() {
  local domain
  domain=$(get_domain)

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║       Import Custom SSL Certificate      ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "Domain: $domain"
  echo ""

  read -p "Path to certificate file (fullchain .pem or .crt): " cert_file
  read -p "Path to private key file (.key or .pem): " key_file

  if [ ! -f "$cert_file" ] || [ ! -r "$cert_file" ]; then
    echo "❌ Certificate file not found or not readable: $cert_file"
    log "Custom cert import failed: cert file not found or not readable: $cert_file"
    return 1
  fi

  if [ ! -f "$key_file" ] || [ ! -r "$key_file" ]; then
    echo "❌ Private key file not found or not readable: $key_file"
    log "Custom cert import failed: key file not found or not readable: $key_file"
    return 1
  fi

  local cert_mod key_mod
  cert_mod=$(openssl x509 -noout -modulus -in "$cert_file" 2>/dev/null | md5sum | awk '{print $1}')
  key_mod=$(openssl rsa -noout -modulus -in "$key_file" 2>/dev/null | md5sum | awk '{print $1}')

  if [ -z "$cert_mod" ] || [ -z "$key_mod" ]; then
    echo "❌ Failed to read certificate or key. Ensure they are valid PEM files."
    log "Custom cert import failed: could not parse cert or key"
    return 1
  fi

  if [ "$cert_mod" != "$key_mod" ]; then
    echo "❌ Certificate and private key do NOT match."
    log "Custom cert import failed: cert/key modulus mismatch"
    return 1
  fi

  local cert_cn cert_san
  cert_cn=$(openssl x509 -noout -subject -in "$cert_file" 2>/dev/null | sed -n 's/.*CN\s*=\s*\([^ ,]*\).*/\1/p')
  cert_san=$(openssl x509 -noout -ext subjectAltName -in "$cert_file" 2>/dev/null | grep -oP 'DNS:\K[^,\s]+' || echo "")

  local domain_match=false
  if [ "$cert_cn" = "$domain" ]; then
    domain_match=true
  fi
  if echo "$cert_san" | grep -qw "$domain"; then
    domain_match=true
  fi

  if [ "$domain_match" = false ]; then
    echo "⚠️  Warning: Domain '$domain' not found in certificate CN ($cert_cn) or SANs."
    read -p "Continue anyway? [y/N]: " cont
    if [ "$cont" != "y" ] && [ "$cont" != "Y" ]; then
      echo "Aborted."
      return 1
    fi
  fi

  if ! openssl x509 -checkend 0 -noout -in "$cert_file" 2>/dev/null; then
    echo "❌ Certificate is expired."
    log "Custom cert import failed: certificate is expired"
    return 1
  fi

  mkdir -p /etc/ssl/learnplay
  cp "$cert_file" /etc/ssl/learnplay/fullchain.pem
  cp "$key_file" /etc/ssl/learnplay/privkey.pem
  chmod 644 /etc/ssl/learnplay/fullchain.pem
  chmod 600 /etc/ssl/learnplay/privkey.pem
  chown root:root /etc/ssl/learnplay/fullchain.pem /etc/ssl/learnplay/privkey.pem

  local expiry_date
  expiry_date=$(openssl x509 -enddate -noout -in /etc/ssl/learnplay/fullchain.pem 2>/dev/null | cut -d= -f2 | xargs -I{} date -d {} '+%Y-%m-%d' 2>/dev/null || echo "unknown")

  log "✅ Custom SSL certificate imported for $domain (expires $expiry_date)"
  echo ""
  echo "✅ Custom SSL certificate imported successfully!"
  echo "   Domain:  $domain"
  echo "   Cert:    /etc/ssl/learnplay/fullchain.pem"
  echo "   Key:     /etc/ssl/learnplay/privkey.pem"
  echo "   Expires: $expiry_date"
  echo ""
  offer_switch_to_https
}

generate_self_signed() {
  local domain
  domain=$(get_domain)

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║     Generate Self-Signed Certificate     ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "⚠️  WARNING: Self-signed certificates are for testing/internal use only."
  echo "   Browsers will display a security warning to users."
  echo ""
  echo "Domain: $domain"
  echo ""
  read -p "Continue? [y/N]: " cont
  if [ "$cont" != "y" ] && [ "$cont" != "Y" ]; then
    echo "Aborted."
    return 0
  fi

  mkdir -p /etc/ssl/learnplay

  log "Generating self-signed certificate for $domain..."

  if openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/learnplay/privkey.pem \
    -out /etc/ssl/learnplay/fullchain.pem \
    -subj "/CN=${domain}" \
    -addext "subjectAltName=DNS:${domain}" 2>&1 | tee -a "$LOG_FILE"; then

    chmod 644 /etc/ssl/learnplay/fullchain.pem
    chmod 600 /etc/ssl/learnplay/privkey.pem
    chown root:root /etc/ssl/learnplay/fullchain.pem /etc/ssl/learnplay/privkey.pem

    local expiry_date
    expiry_date=$(openssl x509 -enddate -noout -in /etc/ssl/learnplay/fullchain.pem 2>/dev/null | cut -d= -f2 | xargs -I{} date -d {} '+%Y-%m-%d' 2>/dev/null || echo "unknown")

    log "✅ Self-signed certificate generated for $domain (expires $expiry_date)"
    echo ""
    echo "✅ Self-signed certificate generated successfully!"
    echo "   Domain:  $domain"
    echo "   Cert:    /etc/ssl/learnplay/fullchain.pem"
    echo "   Key:     /etc/ssl/learnplay/privkey.pem"
    echo "   Expires: $expiry_date"
    echo ""
    offer_switch_to_https
  else
    log "❌ Failed to generate self-signed certificate"
    echo "❌ Failed to generate self-signed certificate."
    return 1
  fi
}

show_status() {
  local domain
  domain=$(get_domain)
  local current_mode
  current_mode=$(get_current_mode)

  local mode_display=""
  local mode_icon=""
  case "$current_mode" in
    http)
      mode_display="HTTP Only"
      mode_icon="🔓"
      ;;
    https)
      mode_display="HTTPS Only"
      mode_icon="🔒"
      ;;
    prefer-https)
      mode_display="HTTPS-Preferred"
      mode_icon="🔒"
      ;;
    *)
      mode_display="Unknown"
      mode_icon="❓"
      ;;
  esac

  local cert_status="❌ Not found"
  local cert_expiry=""
  local cert_source_label=""
  if check_cert "$domain"; then
    local source
    source=$(get_cert_source "$domain")
    case "$source" in
      letsencrypt)   cert_source_label="Let's Encrypt" ;;
      self-signed)   cert_source_label="Self-Signed" ;;
      custom)        cert_source_label="Custom" ;;
      *)             cert_source_label="Unknown" ;;
    esac
    if is_cert_valid "$domain"; then
      cert_expiry=$(get_cert_expiry_date "$domain")
      cert_status="✅ Valid (expires $cert_expiry)"
    else
      cert_status="⚠️  Expired"
    fi
  fi

  echo ""
  echo "Current Mode: $mode_icon $mode_display"
  echo "Domain:       $domain"
  echo "Certificate:  $cert_status"
  if [ -n "$cert_source_label" ]; then
    echo "Cert Source:  $cert_source_label"
  fi
  echo "Nginx Config: $NGINX_CONF"
  echo "Env File:     $ENV_FILE"
  echo ""
}

show_cert_submenu() {
  echo ""
  echo "  Certificate Source:"
  echo "    a) Let's Encrypt (Certbot) — automatic, free, requires public DNS"
  echo "    b) Custom Certificate — provide your own cert & key files"
  echo "    c) Self-Signed — for testing/internal use (browsers will show warning)"
  echo "    d) Back"
  echo ""
  read -p "  Select [a-d]: " cert_choice

  case "$cert_choice" in
    a|A) run_certbot ;;
    b|B) import_custom_cert ;;
    c|C) generate_self_signed ;;
    d|D) return 0 ;;
    *)   echo "Invalid option." ;;
  esac
}

show_menu() {
  local domain
  domain=$(get_domain)
  local current_mode
  current_mode=$(get_current_mode)

  local mode_display=""
  local mode_icon=""
  case "$current_mode" in
    http)        mode_display="HTTP Only";       mode_icon="🔓" ;;
    https)       mode_display="HTTPS Only";      mode_icon="🔒" ;;
    prefer-https) mode_display="HTTPS-Preferred"; mode_icon="🔒" ;;
    *)           mode_display="Unknown";         mode_icon="❓" ;;
  esac

  local cert_status="❌ Not found"
  local cert_source_label=""
  if check_cert "$domain"; then
    local source
    source=$(get_cert_source "$domain")
    case "$source" in
      letsencrypt)   cert_source_label="Let's Encrypt" ;;
      self-signed)   cert_source_label="Self-Signed" ;;
      custom)        cert_source_label="Custom" ;;
      *)             cert_source_label="Unknown" ;;
    esac
    if is_cert_valid "$domain"; then
      local cert_expiry
      cert_expiry=$(get_cert_expiry_date "$domain")
      cert_status="✅ Valid (expires $cert_expiry) [$cert_source_label]"
    else
      cert_status="⚠️  Expired [$cert_source_label]"
    fi
  fi

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║       LearnPlay SSL/HTTP Mode            ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "Current Mode: $mode_icon $mode_display"
  echo "Domain: $domain"
  echo "Certificate: $cert_status"
  echo ""
  echo "  1) HTTP Only (no encryption)"
  echo "  2) HTTPS Only (encrypted, recommended)"
  echo "  3) HTTPS Preferred (redirect HTTP → HTTPS)"
  echo "  4) Setup/Renew SSL Certificate"
  echo "  5) View current status"
  echo "  6) Back / Exit"
  echo ""
  read -p "Select option [1-6]: " choice

  case "$choice" in
    1) apply_mode "http" ;;
    2) apply_mode "https" ;;
    3) apply_mode "prefer-https" ;;
    4) show_cert_submenu ;;
    5) show_status ;;
    6) echo "Exiting."; exit 0 ;;
    *) echo "Invalid option."; exit 1 ;;
  esac
}

if [ -n "${LEARNPLAY_SSL_MODE:-}" ]; then
  apply_mode "$LEARNPLAY_SSL_MODE"
  exit 0
fi

case "${1:-}" in
  http)          apply_mode "http" ;;
  https)         apply_mode "https" ;;
  prefer-https)  apply_mode "prefer-https" ;;
  status)        show_status ;;
  setup-cert)    run_certbot ;;
  import-cert)   import_custom_cert ;;
  self-signed)   generate_self_signed ;;
  "")            show_menu ;;
  *)
    echo "Usage: $0 {http|https|prefer-https|status|setup-cert|import-cert|self-signed}"
    echo "       $0              # interactive menu"
    echo ""
    echo "Environment:"
    echo "  LEARNPLAY_SSL_MODE=http|https|prefer-https  # non-interactive"
    exit 1
    ;;
esac
