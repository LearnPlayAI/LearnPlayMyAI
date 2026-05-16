#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/learnplay"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
APP_USER_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)"
if [ -z "$APP_USER_HOME" ]; then
  APP_USER_HOME="/home/$APP_USER"
fi
LEARNPLAY_SCOPE="${LEARNPLAY_SCOPE:-onprem}"
PG_VARIANT_DIR="${LEARNPLAY_PGDATA:-/opt/lpdb/${LEARNPLAY_SCOPE}/pg16/main}"

LOG_FILE="/var/log/learnplay-install-deps.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

echo "============================================"
echo "  LearnPlay Dependency Installation"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ============================================
# 1. BASE DEPENDENCIES
# ============================================
log "📦 Installing base dependencies..."
apt-get update -qq
apt-get install -y -qq curl wget gnupg2 software-properties-common build-essential lsb-release ca-certificates

# ============================================
# 2. NODE.JS 20 (NODESOURCE)
# ============================================
if command -v node &>/dev/null && node --version | grep -q "^v20"; then
  log "✅ Node.js $(node --version) already installed"
else
  log "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  log "✅ Node.js $(node --version) installed"
fi

# ============================================
# 3. POSTGRESQL 16
# ============================================
if command -v psql &>/dev/null && psql --version | grep -q "16"; then
  log "✅ PostgreSQL $(psql --version | awk '{print $3}') already installed"
else
  log "📦 Installing PostgreSQL 16..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null || true
  echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq postgresql-16 postgresql-contrib-16
  systemctl enable postgresql
  systemctl start postgresql
  log "✅ PostgreSQL 16 installed"
fi

# ============================================
# 4. NGINX
# ============================================
if command -v nginx &>/dev/null; then
  log "✅ Nginx $(nginx -v 2>&1 | awk -F/ '{print $2}') already installed"
else
  log "📦 Installing Nginx..."
  apt-get install -y -qq nginx
  systemctl enable nginx
  systemctl start nginx
  log "✅ Nginx installed"
fi

# ============================================
# 5. CERTBOT
# ============================================
if command -v certbot &>/dev/null; then
  log "✅ Certbot already installed"
else
  log "📦 Installing Certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
  log "✅ Certbot installed"
fi

# ============================================
# 5a. LIBREOFFICE (PPTX to PDF conversion)
# ============================================
if command -v libreoffice &>/dev/null; then
  log "✅ LibreOffice already installed"
else
  log "📦 Installing LibreOffice Impress..."
  apt-get install -y -qq libreoffice-impress --no-install-recommends
  log "✅ LibreOffice $(libreoffice --version 2>/dev/null | awk '{print $2}' || echo 'installed')"
fi

# ============================================
# 5b. POPPLER-UTILS (PDF to PNG slide images)
# ============================================
if command -v pdftoppm &>/dev/null; then
  log "✅ poppler-utils (pdftoppm) already installed"
else
  log "📦 Installing poppler-utils (pdftoppm) for PDF→PNG slide conversion..."
  apt-get install -y -qq poppler-utils
  log "✅ poppler-utils $(pdftoppm -v 2>&1 | head -1 || echo 'installed')"
fi

# ============================================
# 5c. FFMPEG (Podcast HLS packaging)
# ============================================
if command -v ffmpeg &>/dev/null && command -v ffprobe &>/dev/null; then
  log "✅ ffmpeg/ffprobe already installed"
else
  log "📦 Installing ffmpeg for podcast streaming and seek support..."
  apt-get install -y -qq ffmpeg
  log "✅ ffmpeg $(ffmpeg -version 2>/dev/null | head -1 || echo 'installed')"
fi

# ============================================
# 6. PM2
# ============================================
if command -v pm2 &>/dev/null; then
  log "✅ PM2 $(pm2 --version) already installed"
else
  log "📦 Installing PM2..."
  npm install -g pm2
  log "✅ PM2 installed"
fi

# ============================================
# 7. ENSURE APP USER EXISTS (IDEMPOTENT)
# ============================================
if id "$APP_USER" &>/dev/null; then
  log "✅ App user '$APP_USER' already exists"
else
  log "👤 Creating app user '$APP_USER'..."
  useradd --system --shell /usr/sbin/nologin --home-dir "$APP_USER_HOME" --create-home "$APP_USER"
  log "✅ App user created"
fi

# ============================================
# 8. PM2 STARTUP
# ============================================
log "⚙️  Configuring PM2 startup..."
# PM2 must run as the same app user that owns/runs the app runtime process.
# Use the app user's actual home directory for PM2_HOME (never /opt/learnplay/.pm2).
mkdir -p "$APP_USER_HOME/.pm2"
chown -R "$APP_USER:$APP_USER" "$APP_USER_HOME"

# When run as root, pm2 configures directly without printing a sudo command
PM2_STARTUP_OUTPUT=$(pm2 startup systemd -u "$APP_USER" --hp "$APP_USER_HOME" 2>&1 || true)
PM2_STARTUP_CMD=$(echo "$PM2_STARTUP_OUTPUT" | grep "sudo" | sed 's/^\$ //' || true)
if [ -n "$PM2_STARTUP_CMD" ]; then
  log "   Executing PM2 startup command..."
  eval "$PM2_STARTUP_CMD" 2>&1 | tee -a "$LOG_FILE" || log "⚠️  PM2 startup command failed"
else
  log "   PM2 startup configured directly (running as root)"
fi
# Ensure the service is enabled (service name matches the PM2 user)
systemctl enable "pm2-$APP_USER" 2>/dev/null || true

# ============================================
# 9. CREATE DIRECTORY STRUCTURE (IDEMPOTENT)
# ============================================
log "📁 Creating directory structure..."
mkdir -p /opt/learnplay
mkdir -p /opt/learnplay/uploads/public
mkdir -p /opt/learnplay/uploads/private
mkdir -p "${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
mkdir -p /var/log/learnplay
mkdir -p /var/log/learnplay-admin
mkdir -p /var/log/postgresql
mkdir -p /var/www/certbot
mkdir -p /opt/lpdb
mkdir -p "$PG_VARIANT_DIR"
mkdir -p /tmp/learnplay-cache/npm
mkdir -p /tmp/learnplay-cache/xdg
mkdir -p /home/lppadmin

chown -R "$APP_USER:$APP_USER" /opt/learnplay
chown -R "$APP_USER:$APP_USER" /opt/learnplay/uploads
chown -R "$APP_USER:$APP_USER" /var/log/learnplay
chown -R "$APP_USER:$APP_USER" /var/log/learnplay-admin
chown -R "$APP_USER:$APP_USER" /tmp/learnplay-cache
chown -R postgres:postgres /var/log/postgresql
chown postgres:postgres /opt/lpdb
chown -R postgres:postgres "$PG_VARIANT_DIR"
chmod 700 /opt/lpdb
chmod 700 "$PG_VARIANT_DIR"
chmod 1777 /tmp/learnplay-cache
chmod 1777 /tmp/learnplay-cache/npm
chmod 1777 /tmp/learnplay-cache/xdg

# Keep PM2 logs on /var/log and away from /home to avoid root FS growth.
mkdir -p /var/log/learnplay/pm2
chown -R "$APP_USER:$APP_USER" /var/log/learnplay/pm2
if [ -e "$APP_USER_HOME/.pm2/logs" ] && [ ! -L "$APP_USER_HOME/.pm2/logs" ]; then
  rm -rf "$APP_USER_HOME/.pm2/logs"
fi
mkdir -p "$APP_USER_HOME/.pm2"
ln -sfn /var/log/learnplay/pm2 "$APP_USER_HOME/.pm2/logs"
chown -h "$APP_USER:$APP_USER" "$APP_USER_HOME/.pm2/logs" 2>/dev/null || true

# Persist npm/XDG cache relocation to /tmp.
cat > /home/lppadmin/.npmrc << 'EOF'
cache=/tmp/learnplay-cache/npm
EOF
chown lppadmin:lppadmin /home/lppadmin/.npmrc 2>/dev/null || true
chmod 0644 /home/lppadmin/.npmrc 2>/dev/null || true

cat > /etc/profile.d/learnplay-cache.sh << 'EOF'
export NPM_CONFIG_CACHE=/tmp/learnplay-cache/npm
export XDG_CACHE_HOME=/tmp/learnplay-cache/xdg
EOF
chmod 0644 /etc/profile.d/learnplay-cache.sh

# ============================================
# 10. LOG ROTATION SETUP
# ============================================
log "📋 Configuring log rotation..."
cat > /etc/logrotate.d/learnplay << EOF
/var/log/learnplay/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_USER
    sharedscripts
}
EOF

cat > /etc/logrotate.d/learnplay-admin << EOF
/var/log/learnplay-admin/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_USER
    sharedscripts
}
EOF

cat > /etc/logrotate.d/postgresql-learnplay << 'EOF'
/var/log/postgresql/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 postgres adm
    su postgres adm
    sharedscripts
}
EOF

cat > /usr/local/bin/learnplay-storage-maintenance.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
find /tmp/learnplay-cache -mindepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null || true
EOF
chmod 0755 /usr/local/bin/learnplay-storage-maintenance.sh
cat > /etc/cron.daily/learnplay-storage-maintenance << 'EOF'
#!/usr/bin/env bash
exec /usr/local/bin/learnplay-storage-maintenance.sh
EOF
chmod 0755 /etc/cron.daily/learnplay-storage-maintenance

# PM2 native logrotate can conflict with OS logrotate policies; remove if present.
if command -v pm2 &>/dev/null; then
  sudo -u "$APP_USER" pm2 uninstall pm2-logrotate 2>/dev/null || true
fi

# ============================================
# 11. SUMMARY
# ============================================
log ""
log "============================================"
log "  ✅ Dependency Installation Complete"
log "============================================"
log ""
log "Installed Software:"
log "  Node.js:     $(node --version 2>/dev/null || echo 'not found')"
log "  npm:         $(npm --version 2>/dev/null || echo 'not found')"
log "  PostgreSQL:  $(psql --version 2>/dev/null | awk '{print $3}' || echo 'not found')"
log "  Nginx:       $(nginx -v 2>&1 | awk -F/ '{print $2}' || echo 'not found')"
log "  Certbot:     $(certbot --version 2>&1 | awk '{print $2}' || echo 'not found')"
log "  LibreOffice: $(libreoffice --version 2>/dev/null | awk '{print $2}' || echo 'not found')"
log "  pdftoppm:    $(pdftoppm -v 2>&1 | head -1 || echo 'not found')"
log "  ffmpeg:      $(ffmpeg -version 2>/dev/null | head -1 || echo 'not found')"
log "  PM2:         $(pm2 --version 2>/dev/null || echo 'not found')"
log ""
log "Directories Created:"
log "  /opt/learnplay          — Application code"
log "  /opt/learnplay/uploads             — Uploads (dedicated mount)"
log "  $PG_VARIANT_DIR — PostgreSQL data files"
log "  /var/log/learnplay      — Application logs"
log ""
log "Next step: Run db-setup.sh"
