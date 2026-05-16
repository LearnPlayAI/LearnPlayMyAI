#!/usr/bin/env bash
# ============================================
# DEPRECATED — Use the new automated scripts:
#   master-install.sh (recommended, runs all steps)
#   os-prep.sh + install-deps.sh (replaces this script)
# ============================================
echo "⚠️  This script is DEPRECATED."
echo "   Use master-install.sh or the individual scripts:"
echo "   os-prep.sh → install-deps.sh → db-setup.sh → perf-tune.sh → app-install.sh"
echo ""
read -p "Continue anyway? (y/N): " CONT
[ "$CONT" != "y" ] && [ "$CONT" != "Y" ] && exit 0

set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
APP_USER_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)"
if [ -z "$APP_USER_HOME" ]; then
  APP_USER_HOME="/home/$APP_USER"
fi
UPLOAD_DIR="/opt/learnplay/uploads"
LOG_DIR="/var/log/$APP_NAME"

echo "🖥️  LearnPlay Server Preparation Script"
echo "========================================"
echo ""

# Must be run as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ============================================
# CREATE SYSTEM USER
# ============================================
echo "👤 Setting up system user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$APP_USER_HOME" --create-home "$APP_USER"
  echo "✅ Created system user: $APP_USER"
else
  echo "ℹ️  User $APP_USER already exists"
fi

# ============================================
# UPDATE SYSTEM
# ============================================
echo ""
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

# ============================================
# INSTALL DEPENDENCIES
# ============================================
echo ""
echo "📥 Installing base dependencies..."
apt-get install -y curl wget gnupg2 software-properties-common build-essential

# ============================================
# INSTALL NODE.JS 20
# ============================================
echo ""
echo "⬢ Installing Node.js 20 from NodeSource..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# ============================================
# INSTALL POSTGRESQL 16
# ============================================
echo ""
echo "🗄️  Installing PostgreSQL 16..."
apt-get install -y postgresql postgresql-contrib postgresql-16

# Start and enable PostgreSQL
systemctl enable postgresql
systemctl start postgresql
echo "✅ PostgreSQL installed and started"

# ============================================
# INSTALL NGINX
# ============================================
echo ""
echo "🌐 Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx
echo "✅ Nginx installed and started"

# ============================================
# INSTALL CERTBOT & PYTHON3-CERTBOT-NGINX
# ============================================
echo ""
echo "🔒 Installing Certbot for Let's Encrypt..."
apt-get install -y certbot python3-certbot-nginx
echo "✅ Certbot installed"

# ============================================
# INSTALL UFW (FIREWALL)
# ============================================
echo ""
echo "🛡️  Configuring UFW firewall..."
apt-get install -y ufw
ufw allow OpenSSH
NGINX_HTTP="${LEARNPLAY_NGINX_HTTP_PORT:-80}"
NGINX_HTTPS="${LEARNPLAY_NGINX_HTTPS_PORT:-443}"
if [ "$NGINX_HTTP" = "80" ] && [ "$NGINX_HTTPS" = "443" ]; then
  ufw allow 'Nginx Full'
else
  ufw allow "$NGINX_HTTP"/tcp comment 'LearnPlay HTTP'
  ufw allow "$NGINX_HTTPS"/tcp comment 'LearnPlay HTTPS'
fi
ufw --force enable
echo "✅ Firewall configured and enabled"

# ============================================
# INSTALL PM2 GLOBALLY
# ============================================
echo ""
echo "⚙️  Installing PM2 process manager..."
npm install -g pm2
# Ensure PM2 home exists in the app user's home (never under /opt/learnplay/.pm2)
mkdir -p "$APP_USER_HOME/.pm2"
chown -R "$APP_USER:$APP_USER" "$APP_USER_HOME"
# Generate and execute PM2 startup script for systemd
# When run as root, pm2 configures directly without printing a sudo command
PM2_STARTUP_OUTPUT=$(pm2 startup systemd -u "$APP_USER" --hp "$APP_USER_HOME" 2>&1 || true)
PM2_STARTUP_CMD=$(echo "$PM2_STARTUP_OUTPUT" | grep "sudo" | sed 's/^\$ //' || true)
if [ -n "$PM2_STARTUP_CMD" ]; then
  echo "   Executing PM2 startup command..."
  eval "$PM2_STARTUP_CMD" || echo "⚠️  PM2 startup command failed"
else
  echo "   PM2 startup configured directly (running as root)"
fi
# Ensure the service is enabled
systemctl enable "pm2-${APP_USER}" 2>/dev/null || true
echo "✅ PM2 installed and configured"

# ============================================
# CREATE DIRECTORY STRUCTURE
# ============================================
echo ""
echo "📁 Creating directory structure..."
mkdir -p "$APP_DIR"
mkdir -p "$UPLOAD_DIR/public"
mkdir -p "$UPLOAD_DIR/private"
mkdir -p "$LOG_DIR"
mkdir -p /var/www/certbot

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR"
chown -R "$APP_USER:$APP_USER" "$LOG_DIR"

echo "✅ Directory structure created and permissions set"

# ============================================
# POSTGRESQL SETUP
# ============================================
echo ""
echo "🗄️  Setting up PostgreSQL database..."

# Create database user and database
if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = '$APP_NAME'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER $APP_NAME WITH PASSWORD 'CHANGE_ME_DURING_INSTALL';"
  echo "✅ Created PostgreSQL user: $APP_NAME"
else
  echo "ℹ️  PostgreSQL user $APP_NAME already exists"
fi

if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -wq "$APP_NAME"; then
  sudo -u postgres psql -c "CREATE DATABASE $APP_NAME OWNER $APP_NAME;"
  echo "✅ Created PostgreSQL database: $APP_NAME"
else
  echo "ℹ️  PostgreSQL database $APP_NAME already exists"
fi

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $APP_NAME TO $APP_NAME;"
echo "✅ Database permissions granted"

# ============================================
# POSTGRESQL DATA DIRECTORY RELOCATION TO /opt/lpdb/onprem/pg16/main
# ============================================
echo ""
echo "📁 PostgreSQL Data Directory Relocation"

PG_TARGET_DIR="${LEARNPLAY_PGDATA:-/opt/lpdb/onprem/pg16/main}"
CURRENT_DATA_DIR=$(sudo -u postgres psql -t -c 'SHOW data_directory;' | tr -d '[:space:]')
echo "  Current data directory: $CURRENT_DATA_DIR"
echo "  Target data directory:  $PG_TARGET_DIR"

if [ "$CURRENT_DATA_DIR" = "$PG_TARGET_DIR" ]; then
  echo "  ✅ PostgreSQL data is already at $PG_TARGET_DIR — no relocation needed"
else
  PG_OLD_DIR="$CURRENT_DATA_DIR"

  echo "  Stopping PostgreSQL..."
  systemctl stop postgresql

  echo "  Creating new data directory..."
  mkdir -p "$PG_TARGET_DIR"

  echo "  Copying data (this may take a while)..."
  rsync -av "$PG_OLD_DIR/" "$PG_TARGET_DIR/"
  chown -R postgres:postgres "$PG_TARGET_DIR"
  chmod 700 "$PG_TARGET_DIR"

  echo "  Updating PostgreSQL configuration..."
  PG_CONF=$(find /etc/postgresql -name postgresql.conf | head -1)
  sed -i "s|data_directory = '.*'|data_directory = '$PG_TARGET_DIR'|" "$PG_CONF"

  echo "  Starting PostgreSQL..."
  systemctl start postgresql

  NEW_DIR=$(sudo -u postgres psql -t -c 'SHOW data_directory;' | tr -d '[:space:]')
  if [ "$NEW_DIR" = "$PG_TARGET_DIR" ]; then
    echo "  ✅ PostgreSQL data directory relocated to: $PG_TARGET_DIR"
    echo "  ⚠️  Old data directory preserved at: $PG_OLD_DIR (remove manually after verification)"
  else
    echo "  ❌ Relocation failed! Reverting..."
    sed -i "s|data_directory = '.*'|data_directory = '$PG_OLD_DIR'|" "$PG_CONF"
    systemctl restart postgresql
    exit 1
  fi
fi

# ============================================
# PM2 HARDWARE TUNING INFO
# ============================================
echo ""
echo "📊 Hardware Detection:"
echo "  CPUs: $(nproc)"
echo "  RAM: $(free -h | awk '/^Mem:/ {print $2}')"
echo "  Disk: $(df -h / | awk 'NR==2 {print $2}')"
echo ""

# ============================================
# FINAL SUMMARY
# ============================================
echo "✅ Server preparation complete!"
echo ""
echo "Next steps:"
echo "  1. Transfer the dist-onprem package to $APP_DIR"
echo "  2. Run the install script: sudo bash $APP_DIR/scripts/install.sh"
echo ""
echo "Important paths:"
echo "  Application: $APP_DIR"
echo "  Uploads:     $UPLOAD_DIR"
echo "  Backups:     ${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
echo "  Logs:        $LOG_DIR"
echo ""
