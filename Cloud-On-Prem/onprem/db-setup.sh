#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/learnplay-db-setup.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

echo "============================================"
echo "  LearnPlay Database Setup"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

PG_TARGET_DIR="${LEARNPLAY_PGDATA:-/opt/lpdb/onprem/pg16/main}"

set_pg_conf_param() {
  local key="$1"
  local value="$2"
  local conf="$3"
  if grep -Eq "^[# ]*${key}[ ]*=" "$conf"; then
    sed -i -E "s|^[# ]*${key}[ ]*=.*|${key} = ${value}|" "$conf"
  else
    echo "${key} = ${value}" >> "$conf"
  fi
}

relocate_postgres_data_dir_if_needed() {
  local pg_conf current_data_dir new_data_dir old_dir
  pg_conf=$(find /etc/postgresql -name postgresql.conf | head -1)
  if [ -z "$pg_conf" ]; then
    log "❌ postgresql.conf not found"
    exit 1
  fi

  current_data_dir=$(sudo -u postgres psql -tAc "SHOW data_directory;" | tr -d '[:space:]')
  if [ -z "$current_data_dir" ]; then
    log "❌ Could not determine current PostgreSQL data_directory"
    exit 1
  fi

  log "📁 PostgreSQL data directory check: current=$current_data_dir target=$PG_TARGET_DIR"
  if [ "$current_data_dir" = "$PG_TARGET_DIR" ]; then
    log "   ✅ PostgreSQL data directory already aligned"
    return 0
  fi

  old_dir="$current_data_dir"
  log "   Moving PostgreSQL data directory to $PG_TARGET_DIR..."
  systemctl stop postgresql
  mkdir -p "$PG_TARGET_DIR"
  rsync -aHAX --numeric-ids --delete "$old_dir/" "$PG_TARGET_DIR/"
  chown -R postgres:postgres "$PG_TARGET_DIR"
  chmod 700 "$PG_TARGET_DIR"

  set_pg_conf_param "data_directory" "'$PG_TARGET_DIR'" "$pg_conf"
  systemctl start postgresql

  new_data_dir=$(sudo -u postgres psql -tAc "SHOW data_directory;" | tr -d '[:space:]')
  if [ "$new_data_dir" != "$PG_TARGET_DIR" ]; then
    log "❌ PostgreSQL data directory relocation failed (current: $new_data_dir)"
    exit 1
  fi
  log "   ✅ PostgreSQL data directory set to $new_data_dir"
}

# ============================================
# INTERACTIVE PROMPTS
# ============================================
if [ -n "${LEARNPLAY_DB_PASSWORD:-}" ]; then
  DB_PASSWORD="$LEARNPLAY_DB_PASSWORD"
else
  if [ -t 0 ]; then
    read -sp "Database password (press Enter to auto-generate): " DB_PASSWORD
    echo ""
    if [ -z "$DB_PASSWORD" ]; then
      DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
      log "🔑 Generated database password: $DB_PASSWORD"
      log "   ⚠️  Save this password! You'll need it for the .env file."
    fi
  else
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    log "🔑 No LEARNPLAY_DB_PASSWORD provided in non-interactive mode; generated database password."
  fi
fi

# ============================================
# 1. VERIFY POSTGRESQL IS RUNNING
# ============================================
log "🔍 Checking PostgreSQL status..."
if ! systemctl is-active --quiet postgresql; then
  log "Starting PostgreSQL..."
  systemctl start postgresql
fi
systemctl enable postgresql
log "✅ PostgreSQL is running"
relocate_postgres_data_dir_if_needed

# ============================================
# 2. CREATE DATABASE USER (IDEMPOTENT)
# ============================================
log "👤 Setting up database user..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='learnplay'" | grep -q 1; then
  log "   User 'learnplay' already exists, updating password..."
  sudo -u postgres psql -c "ALTER USER learnplay WITH PASSWORD '$DB_PASSWORD';"
else
  log "   Creating user 'learnplay'..."
  sudo -u postgres psql -c "CREATE USER learnplay WITH PASSWORD '$DB_PASSWORD';"
fi

# ============================================
# 3. CREATE DATABASE (IDEMPOTENT)
# ============================================
log "📦 Setting up database..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='learnplay'" | grep -q 1; then
  log "   Database 'learnplay' already exists"
else
  log "   Creating database 'learnplay'..."
  sudo -u postgres psql -c "CREATE DATABASE learnplay OWNER learnplay;"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE learnplay TO learnplay;"

# ============================================
# 4. CONFIGURE PG_HBA.CONF FOR LOCAL-ONLY ACCESS
# ============================================
log "🔒 Configuring database access control..."
PG_HBA=$(find /etc/postgresql -name pg_hba.conf | head -1)
if [ -z "$PG_HBA" ]; then
  log "❌ pg_hba.conf not found"
  exit 1
fi

# Backup existing config
cp "$PG_HBA" "${PG_HBA}.bak-$(date +%Y%m%d)" 2>/dev/null || true

# Check if learnplay entries already exist
if grep -q "learnplay" "$PG_HBA"; then
  log "   LearnPlay entries already exist in pg_hba.conf"
else
  log "   Adding LearnPlay access entries..."
  # Add before the default entries
  cat >> "$PG_HBA" << 'EOF'

# LearnPlay application access (local only)
local   learnplay   learnplay                   scram-sha-256
host    learnplay   learnplay   127.0.0.1/32    scram-sha-256
host    learnplay   learnplay   ::1/128         scram-sha-256
EOF
fi

# ============================================
# 5. ENABLE POSTGRESQL SSL
# ============================================
log "🔐 Configuring database SSL..."
PG_CONF=$(find /etc/postgresql -name postgresql.conf | head -1)
if [ -z "$PG_CONF" ]; then
  log "❌ postgresql.conf not found"
  exit 1
fi

# Enable SSL (PostgreSQL ships with a self-signed snakeoil cert by default on Ubuntu)
if grep -q "^ssl = on" "$PG_CONF"; then
  log "   SSL already enabled"
else
  sed -i "s/^#\?ssl = .*/ssl = on/" "$PG_CONF"
  log "   ✅ SSL enabled"
fi

# Configure custom PostgreSQL listen port if non-default
SETUP_DB_PORT="${LEARNPLAY_DB_PORT:-5432}"
if [ "$SETUP_DB_PORT" != "5432" ]; then
  log "🔧 Configuring PostgreSQL to listen on port $SETUP_DB_PORT..."
  sed -i "s/^#\?port = .*/port = $SETUP_DB_PORT/" "$PG_CONF"
  log "   ✅ PostgreSQL port set to $SETUP_DB_PORT"
fi

systemctl restart postgresql
sleep 2

# ============================================
# 6. SET UP LOG ROTATION FOR POSTGRESQL
# ============================================
log "📋 Configuring PostgreSQL log rotation..."
# PostgreSQL logs are typically handled by its own logging collector
# Ensure logging is enabled
mkdir -p /var/log/postgresql
chown postgres:postgres /var/log/postgresql
chmod 750 /var/log/postgresql
sed -i "s/^#\?logging_collector = .*/logging_collector = on/" "$PG_CONF" 2>/dev/null || true
sed -i "s|^#\\?log_directory = .*|log_directory = '/var/log/postgresql'|" "$PG_CONF" 2>/dev/null || true
sed -i "s/^#\?log_filename = .*/log_filename = 'postgresql-%Y-%m-%d.log'/" "$PG_CONF" 2>/dev/null || true
sed -i "s/^#\?log_rotation_age = .*/log_rotation_age = 1d/" "$PG_CONF" 2>/dev/null || true
sed -i "s/^#\?log_rotation_size = .*/log_rotation_size = 100MB/" "$PG_CONF" 2>/dev/null || true
sed -i "s/^#\?log_truncate_on_rotation = .*/log_truncate_on_rotation = on/" "$PG_CONF" 2>/dev/null || true

# Log slow queries (useful for performance monitoring)
sed -i "s/^#\?log_min_duration_statement = .*/log_min_duration_statement = 1000/" "$PG_CONF" 2>/dev/null || true

systemctl reload postgresql

# ============================================
# 7. SET UP AUTOMATED DAILY BACKUPS
# ============================================
log "💾 Setting up automated daily backups..."

# Create backup script
cat > /usr/local/bin/learnplay-backup.sh << 'BACKUP_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database backup (compressed)
sudo -u postgres pg_dump learnplay | gzip > "$BACKUP_DIR/db_daily_${TIMESTAMP}.sql.gz"

# Upload directory backup (weekly, only on Sundays)
if [ "$(date +%u)" = "7" ]; then
  tar czf "$BACKUP_DIR/uploads_weekly_${TIMESTAMP}.tar.gz" /opt/learnplay/uploads/ 2>/dev/null || true
fi

# Cleanup old backups
find "$BACKUP_DIR" -name "db_daily_*.sql.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "uploads_weekly_*.tar.gz" -mtime +90 -delete 2>/dev/null || true

echo "[$(date)] Backup completed: db_daily_${TIMESTAMP}.sql.gz"
BACKUP_SCRIPT

chmod +x /usr/local/bin/learnplay-backup.sh

# Add to root crontab (idempotent — remove existing, add new)
crontab -l 2>/dev/null | grep -v "learnplay-backup" | crontab - || true
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/learnplay-backup.sh >> /var/log/learnplay/backup.log 2>&1") | crontab -
log "   ✅ Daily backup at 2:00 AM configured"
log "   ✅ Weekly upload backup on Sundays"
log "   ✅ Retention: 30 days (DB), 90 days (uploads)"

# ============================================
# 8. SET UP VACUUM/ANALYZE MAINTENANCE SCHEDULE
# ============================================
log "🔧 Setting up database maintenance schedule..."

cat > /usr/local/bin/learnplay-db-maintenance.sh << 'MAINT_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

# Run VACUUM ANALYZE on the learnplay database
sudo -u postgres psql -d learnplay -c "VACUUM ANALYZE;" 2>/dev/null

echo "[$(date)] Database maintenance (VACUUM ANALYZE) completed"
MAINT_SCRIPT

chmod +x /usr/local/bin/learnplay-db-maintenance.sh

# Run weekly maintenance (Sunday 3:00 AM, after backup)
crontab -l 2>/dev/null | grep -v "learnplay-db-maintenance" | crontab - || true
(crontab -l 2>/dev/null; echo "0 3 * * 0 /usr/local/bin/learnplay-db-maintenance.sh >> /var/log/learnplay/maintenance.log 2>&1") | crontab -
log "   ✅ Weekly VACUUM ANALYZE on Sundays at 3:00 AM"

# ============================================
# 9. URL-ENCODE PASSWORD HELPER
# ============================================
DB_PORT="${LEARNPLAY_DB_PORT:-5432}"
DB_PASSWORD_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$DB_PASSWORD', safe=''))")
DATABASE_URL="postgresql://learnplay:${DB_PASSWORD_ENCODED}@localhost:${DB_PORT}/learnplay"

# ============================================
# 10. TEST DATABASE CONNECTION
# ============================================
log "🔍 Testing database connection..."
if PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$DB_PORT" -U learnplay -d learnplay -c "SELECT 1;" > /dev/null 2>&1; then
  log "   ✅ Database connection successful"
else
  log "   ❌ Database connection failed. Check password and pg_hba.conf"
  exit 1
fi

# ============================================
# 11. SAVE CONNECTION INFO
# ============================================
# Save DB credentials for later scripts (secured file)
cat > /tmp/learnplay-db-credentials << EOF
DB_PASSWORD=$DB_PASSWORD
DB_PASSWORD_ENCODED=$DB_PASSWORD_ENCODED
DATABASE_URL=$DATABASE_URL
DB_PORT=$DB_PORT
EOF
chmod 600 /tmp/learnplay-db-credentials

# ============================================
# 12. SUMMARY
# ============================================
log ""
log "============================================"
log "  ✅ Database Setup Complete"
log "============================================"
log ""
log "Database Configuration:"
log "  Host:       localhost:${DB_PORT}"
log "  Database:   learnplay"
log "  User:       learnplay"
log "  SSL:        Enabled"
log "  Access:     Local only (pg_hba.conf)"
log ""
log "Maintenance Schedule:"
log "  Daily 2:00 AM  — Database backup (gzip, 30-day retention)"
log "  Sunday 2:00 AM — Upload directory backup (90-day retention)"
log "  Sunday 3:00 AM — VACUUM ANALYZE"
log ""
log "Connection URL:"
log "  $DATABASE_URL"
log ""
log "Credentials saved to /tmp/learnplay-db-credentials (secured)"
log "⚠️  This file will be consumed by app-install.sh and then deleted"
log ""
log "Next step: Run perf-tune.sh"
