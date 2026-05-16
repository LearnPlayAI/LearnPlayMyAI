#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
SCOPED_APP_DIR="/opt/learnplay/onprem"
resolve_onprem_app_dir() {
  if [ -n "${LEARNPLAY_APP_DIR:-}" ]; then
    echo "$LEARNPLAY_APP_DIR"
    return 0
  fi
  if [ -f "${SCOPED_APP_DIR}/.env" ] || [ -d "${SCOPED_APP_DIR}" ]; then
    echo "${SCOPED_APP_DIR}"
    return 0
  fi
  # Enforce scoped runtime path for all new installs.
  echo "${SCOPED_APP_DIR}"
}
resolve_backup_dir() {
  local preferred="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
  local fallback="/opt/lpdb/onprem/lppbackups"
  mkdir -p "$preferred" 2>/dev/null || true
  if [ -d "$preferred" ] && [ -w "$preferred" ]; then
    echo "$preferred"
    return 0
  fi
  mkdir -p "$fallback" 2>/dev/null || true
  if [ -d "$fallback" ] && [ -w "$fallback" ]; then
    echo "$fallback"
    return 0
  fi
  echo "/tmp/lppbackups/onprem"
}
APP_DIR="$(resolve_onprem_app_dir)"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
APP_USER_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)"
if [ -z "$APP_USER_HOME" ]; then
  APP_USER_HOME="/home/$APP_USER"
fi
UPLOAD_DIR="${LEARNPLAY_UPLOAD_DIR:-${UPLOAD_DIR:-${APP_DIR}/uploads}}"
BACKUP_DIR="$(resolve_backup_dir)"
LOG_FILE="/var/log/learnplay-app-install.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NON_INTERACTIVE="${LEARNPLAY_NONINTERACTIVE:-false}"
INSTALL_TX_ID="onprem-install-$(date +%Y%m%d_%H%M%S)-$RANDOM"
RUNTIME_MARKER_FILE="${APP_DIR}/.runtime-identity.json"
PROVENANCE_FILE="${APP_DIR}/.release-provenance.json"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-learnplay-onprem}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

resolve_dist_dir() {
  local candidate=""

  # 1. Explicit env var override
  if [ -n "${LEARNPLAY_DIST_DIR:-}" ] && [ -d "${LEARNPLAY_DIST_DIR}/server" ] && [ -f "${LEARNPLAY_DIST_DIR}/package.json" ]; then
    echo "$LEARNPLAY_DIST_DIR"
    return 0
  fi

  # 2. Permanent staging directory (survives /tmp cleanup)
  if [ -d "${APP_DIR}/.dist-staging/server" ] && [ -f "${APP_DIR}/.dist-staging/package.json" ]; then
    echo "${APP_DIR}/.dist-staging"
    return 0
  fi

  # 3. Saved dist source path (written by lppadmin setup)
  if [ -f "${APP_DIR}/.dist-source" ]; then
    candidate="$(cat "${APP_DIR}/.dist-source" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$candidate" ] && [ -d "$candidate/server" ] && [ -f "$candidate/package.json" ]; then
      echo "$candidate"
      return 0
    fi
  fi

  # 4. Common extraction locations
  for search_dir in /tmp/dist-onprem /var/tmp/dist-onprem; do
    if [ -d "$search_dir/server" ] && [ -f "$search_dir/package.json" ]; then
      echo "$search_dir"
      return 0
    fi
  done

  # 5. Try glob for renamed dist-onprem dirs in /tmp
  for search_dir in /tmp/dist-onprem-*; do
    if [ -d "$search_dir/server" ] && [ -f "$search_dir/package.json" ]; then
      echo "$search_dir"
      return 0
    fi
  done

  return 1
}

DIST_DIR="$(resolve_dist_dir)" || {
  echo ""
  echo "❌ Cannot find the LearnPlay distribution package."
  echo ""
  echo "   The installer needs the original dist-onprem directory containing"
  echo "   server/, client/, and package.json files."
  echo ""
  echo "   Solutions:"
  echo "   1. Set the path explicitly:"
  echo "      export LEARNPLAY_DIST_DIR=/path/to/dist-onprem"
  echo "      Then re-run this script."
  echo ""
  echo "   2. Re-extract the distribution package:"
  echo "      cd /tmp && unzip dist-onprem.zip"
  echo ""
  exit 1
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

get_podcast_hls_backfill_target_count_install() {
  local db_url="$1"
  if ! command -v psql >/dev/null 2>&1; then
    printf ''
    return 0
  fi
  PGPASSWORD="" psql "$db_url" -Atq <<'SQL' 2>/dev/null
SELECT COUNT(*)
FROM lessons
WHERE COALESCE(jsonb_typeof(metadata->'podcast'->'versions'),'null')='array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(metadata->'podcast'->'versions') v
    WHERE v->>'status'='completed'
  );
SQL
}

run_podcast_hls_backfill_install() {
  local max_lessons="${LEARNPLAY_PODCAST_HLS_BACKFILL_MAX_LESSONS:-50}"
  local backfill_script="$APP_DIR/scripts/backfillPodcastHls.js"
  local backfill_log="/var/log/learnplay/${APP_SERVICE_NAME}-podcast-hls-backfill.log"
  local backfill_status="/var/log/learnplay/${APP_SERVICE_NAME}-podcast-hls-backfill.status.json"
  local backfill_lock="/var/lock/${APP_SERVICE_NAME}-podcast-hls-backfill.lock"
  local unit_name="${APP_SERVICE_NAME}-podcast-hls-backfill"
  local precheck_count=""
  if ! [[ "$max_lessons" =~ ^[0-9]+$ ]]; then
    max_lessons=50
  fi
  if [ "$max_lessons" -le 0 ]; then
    log "   ℹ️  Skipping podcast HLS backfill (disabled by LEARNPLAY_PODCAST_HLS_BACKFILL_MAX_LESSONS=${max_lessons})"
    return 0
  fi
  if [ ! -f "$backfill_script" ]; then
    log "   ⚠️  Skipping podcast HLS backfill: script missing in runtime package"
    return 0
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    log "   ⚠️  Skipping podcast HLS backfill: DATABASE_URL unavailable"
    return 0
  fi

  precheck_count="$(get_podcast_hls_backfill_target_count_install "$DATABASE_URL" || true)"
  if [[ "$precheck_count" =~ ^[0-9]+$ ]]; then
    if [ "$precheck_count" -le 0 ]; then
      log "   ℹ️  Skipping podcast HLS backfill: no completed podcast versions found in database"
      return 0
    fi
    if [ "$precheck_count" -lt "$max_lessons" ]; then
      max_lessons="$precheck_count"
    fi
    log "   ℹ️  Podcast HLS backfill candidates: ${precheck_count} (this run maxLessons=${max_lessons})"
  else
    log "   ℹ️  Podcast HLS pre-check unavailable (psql not present or query failed); scheduling cautiously"
  fi

  if pgrep -u "$APP_USER" -f "backfillPodcastHls.js --live" >/dev/null 2>&1; then
    log "   ℹ️  Podcast HLS backfill already running in background"
    return 0
  fi

  mkdir -p /var/log/learnplay 2>/dev/null || true
  mkdir -p /var/lock 2>/dev/null || true
  touch "$backfill_log" 2>/dev/null || true
  touch "$backfill_status" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$backfill_log" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$backfill_status" 2>/dev/null || true

  log "   🔧 Scheduling podcast HLS backfill in background (maxLessons=${max_lessons})..."
  if command -v systemd-run >/dev/null 2>&1; then
    systemctl stop "${unit_name}.service" >/dev/null 2>&1 || true
    systemctl reset-failed "${unit_name}.service" >/dev/null 2>&1 || true
    if systemd-run --unit="$unit_name" --uid="$APP_USER" \
      --property=WorkingDirectory="$APP_DIR" \
      --property=RuntimeMaxSec=20m \
      --property=StandardOutput=append:"$backfill_log" \
      --property=StandardError=append:"$backfill_log" \
      --setenv=DATABASE_URL="$DATABASE_URL" \
      /usr/bin/node "$backfill_script" --live --maxLessons="${max_lessons}" --lockFile="$backfill_lock" --statusFile="$backfill_status" \
      >> "$LOG_FILE" 2>&1; then
      log "   ✅ Podcast HLS backfill scheduled via systemd-run"
      log "   ℹ️  Backfill status: $backfill_status"
      log "   ℹ️  Backfill log: $backfill_log"
      return 0
    fi
    log "   ⚠️  systemd-run scheduling failed; falling back to nohup"
  fi

  if sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && nohup env DATABASE_URL='$DATABASE_URL' node '$backfill_script' --live --maxLessons=${max_lessons} --lockFile='$backfill_lock' --statusFile='$backfill_status' >> '$backfill_log' 2>&1 < /dev/null &"; then
    log "   ✅ Podcast HLS backfill scheduled via nohup"
    log "   ℹ️  Backfill status: $backfill_status"
    log "   ℹ️  Backfill log: $backfill_log"
    return 0
  fi

  log "   ⚠️  Unable to schedule podcast HLS backfill (non-fatal). See $LOG_FILE"
}

ensure_systemd_app_service() {
  local app_port unit_file app_log_dir app_log_file
  app_port="${APP_PORT:-3000}"
  unit_file="/etc/systemd/system/${APP_SERVICE_NAME}.service"
  app_log_dir="/var/log/learnplay"
  app_log_file="${app_log_dir}/${APP_SERVICE_NAME}.log"
  local tuning_script_dir="${APP_DIR}/bin"
  local tuning_script_file="${tuning_script_dir}/runtime-tuning-env.sh"

  mkdir -p "$app_log_dir"
  mkdir -p "$tuning_script_dir"
  touch "$app_log_file"
  chmod 640 "$app_log_file" || true
  chown "$APP_USER:$APP_USER" "$app_log_file" || true

  cat > "$tuning_script_file" <<'TUNING'
#!/usr/bin/env bash
# Dynamic runtime tuning loaded at every service start.
# Recomputes Node heap and DB pools from current host resources.

if [ "${LEARNPLAY_DYNAMIC_TUNING:-true}" = "false" ]; then
  return 0 2>/dev/null || exit 0
fi

mem_total_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)"
cpu_count="$(nproc 2>/dev/null || echo 2)"

if ! [[ "$mem_total_mb" =~ ^[0-9]+$ ]] || [ "$mem_total_mb" -le 0 ]; then
  mem_total_mb=2048
fi
if ! [[ "$cpu_count" =~ ^[0-9]+$ ]] || [ "$cpu_count" -le 0 ]; then
  cpu_count=2
fi

app_slots="${LEARNPLAY_HOST_APP_SLOTS:-}"
if ! [[ "$app_slots" =~ ^[0-9]+$ ]] || [ "$app_slots" -le 0 ]; then
  app_slots=0
  for unit in /etc/systemd/system/learnplay-*.service; do
    [ -f "$unit" ] || continue
    case "$(basename "$unit")" in
      learnplay-cloud.service|learnplay-onprem.service)
        app_slots=$((app_slots + 1))
        ;;
    esac
  done
  [ "$app_slots" -le 0 ] && app_slots=1
fi
[ "$app_slots" -gt 4 ] && app_slots=4

pg_reserve_mb=$((mem_total_mb / 4))
[ "$pg_reserve_mb" -lt 768 ] && pg_reserve_mb=768
os_reserve_mb=768
app_budget_mb=$((mem_total_mb - pg_reserve_mb - os_reserve_mb))
[ "$app_budget_mb" -lt 1024 ] && app_budget_mb=$((mem_total_mb / 2))
per_app_budget_mb=$((app_budget_mb / app_slots))
[ "$per_app_budget_mb" -lt 768 ] && per_app_budget_mb=768

node_heap_mb=$((per_app_budget_mb * 75 / 100))
[ "$node_heap_mb" -lt 768 ] && node_heap_mb=768
[ "$node_heap_mb" -gt 6144 ] && node_heap_mb=6144

db_pool_max=$((cpu_count * 8 / app_slots))
[ "$db_pool_max" -lt 10 ] && db_pool_max=10
[ "$db_pool_max" -gt 40 ] && db_pool_max=40
db_pool_min=$((db_pool_max / 4))
[ "$db_pool_min" -lt 2 ] && db_pool_min=2

session_pool_max=$((cpu_count * 2 / app_slots))
[ "$session_pool_max" -lt 3 ] && session_pool_max=3
[ "$session_pool_max" -gt 12 ] && session_pool_max=12
[ "$session_pool_max" -gt "$db_pool_max" ] && session_pool_max="$db_pool_max"
session_pool_min=1

clean_node_opts="$(printf '%s' "${NODE_OPTIONS:-}" | sed -E 's/(^|[[:space:]])--max-old-space-size=[0-9]+([[:space:]]|$)/ /g' | tr -s ' ' | sed -e 's/^ //' -e 's/ $//')"
if [ -n "$clean_node_opts" ]; then
  export NODE_OPTIONS="${clean_node_opts} --max-old-space-size=${node_heap_mb}"
else
  export NODE_OPTIONS="--max-old-space-size=${node_heap_mb}"
fi

export MAX_OLD_SPACE_SIZE="${node_heap_mb}"
export ENABLE_OPTIMIZED_POOL="true"
export DB_POOL_MAX="${db_pool_max}"
export DB_POOL_MIN="${db_pool_min}"
export SESSION_POOL_MAX="${session_pool_max}"
export SESSION_POOL_MIN="${session_pool_min}"

echo "[runtime-tuning] mem=${mem_total_mb}MB cpu=${cpu_count} slots=${app_slots} heap=${node_heap_mb}MB db_pool=${db_pool_min}-${db_pool_max} session_pool=${session_pool_min}-${session_pool_max}" >&2
TUNING

  chmod 755 "$tuning_script_file"
  chown "$APP_USER:$APP_USER" "$tuning_script_file" || true

  cat > "$unit_file" <<UNIT
[Unit]
Description=LearnPlay OnPrem Service
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=HOME=${APP_USER_HOME}
Environment=NODE_ENV=production
Environment=PORT=${app_port}
ExecStart=/bin/bash -lc 'set -a; [ -f "${ENV_FILE}" ] && source "${ENV_FILE}"; set +a; [ -f "${tuning_script_file}" ] && source "${tuning_script_file}"; if [ -s ~/.nvm/nvm.sh ]; then source ~/.nvm/nvm.sh && nvm use 20 >/dev/null; fi; exec node server/index.js'
StandardOutput=append:${app_log_file}
StandardError=append:${app_log_file}
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable "$APP_SERVICE_NAME" >/dev/null 2>&1 || true
}

stop_pm2_app_runtime() {
  if sudo -u "$APP_USER" /bin/bash -lc "command -v pm2 >/dev/null 2>&1" 2>/dev/null; then
    sudo -u "$APP_USER" /bin/bash -lc "pm2 stop \"$APP_NAME\" --silent >/dev/null 2>&1 || true"
    sudo -u "$APP_USER" /bin/bash -lc "pm2 delete \"$APP_NAME\" >/dev/null 2>&1 || true"
    sudo -u "$APP_USER" /bin/bash -lc "pm2 stop \"$APP_SERVICE_NAME\" --silent >/dev/null 2>&1 || true"
    sudo -u "$APP_USER" /bin/bash -lc "pm2 delete \"$APP_SERVICE_NAME\" >/dev/null 2>&1 || true"
    sudo -u "$APP_USER" /bin/bash -lc "pm2 save --force >/dev/null 2>&1 || true"
  fi
}

is_non_interactive() {
  [ "$NON_INTERACTIVE" = "true" ] || [ "$NON_INTERACTIVE" = "1" ] || [ "$NON_INTERACTIVE" = "yes" ]
}

trim_value() {
  local value="$1"
  value="${value//$'\r'/}"
  value="$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  printf '%s' "$value"
}

require_value_non_interactive() {
  local key="$1"
  local value="$2"
  if is_non_interactive && [ -z "$value" ]; then
    log "   ❌ ${key} is required in non-interactive mode"
    exit 1
  fi
}

collect_onprem_sync_shared_secret() {
  local value=""
  read -r -s -p "  ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD: " value
  echo ""
  value="$(trim_value "$value")"
  if [ -z "$value" ]; then
    return 1
  fi
  ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD="$value"
  return 0
}

write_runtime_identity() {
  local now version build_id system_type
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  version="$(grep '"version"' "$APP_DIR/version.json" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2 || echo "unknown")"
  build_id="$(grep '"buildDate"' "$APP_DIR/version.json" 2>/dev/null | head -1 | sed 's/.*: *"//; s/",\?$//' || echo "unknown")"
  system_type="$(grep -E '^SYSTEM_TYPE=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'" || true)"
  system_type="${system_type:-production}"
  cat > "$RUNTIME_MARKER_FILE" <<EOF
{
  "product": "onprem",
  "systemType": "${system_type}",
  "runtimeRoot": "${APP_DIR}",
  "installedAt": "${now}",
  "lastUpdatedAt": "${now}",
  "version": "${version}",
  "buildId": "${build_id}"
}
EOF
  chown "$APP_USER:$APP_USER" "$RUNTIME_MARKER_FILE" 2>/dev/null || true
  chmod 640 "$RUNTIME_MARKER_FILE" 2>/dev/null || true
}

write_release_provenance() {
  local now version build_date system_type
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  version="$(grep '"version"' "$APP_DIR/version.json" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2 || echo "unknown")"
  build_date="$(grep '"buildDate"' "$APP_DIR/version.json" 2>/dev/null | head -1 | sed 's/.*: *"//; s/",\?$//' || echo "unknown")"
  system_type="$(grep -E '^SYSTEM_TYPE=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'" || true)"
  system_type="${system_type:-production}"
  cat > "$PROVENANCE_FILE" <<EOF
{
  "transactionId": "${INSTALL_TX_ID}",
  "product": "onprem",
  "systemType": "${system_type}",
  "action": "install",
  "timestamp": "${now}",
  "runtimeRoot": "${APP_DIR}",
  "backupRoot": "${BACKUP_DIR}",
  "installedVersion": "${version}",
  "buildDate": "${build_date}",
  "lppadminVersion": "${LPPADMIN_VERSION:-unknown}"
}
EOF
  chown "$APP_USER:$APP_USER" "$PROVENANCE_FILE" 2>/dev/null || true
  chmod 640 "$PROVENANCE_FILE" 2>/dev/null || true
}

echo "============================================"
echo "  LearnPlay Application Installation"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ============================================
# Pre-Flight: Detect Existing Installation
# ============================================
EXISTING_INSTALL=false
if [ -d "$APP_DIR/server" ] && [ -f "$APP_DIR/.env" ]; then
  EXISTING_INSTALL=true
fi

if [ "$EXISTING_INSTALL" = true ]; then
  echo ""
  echo "⚠️  ============================================"
  echo "⚠️   EXISTING INSTALLATION DETECTED"
  echo "⚠️  ============================================"
  echo ""
  echo "   An existing LearnPlay installation was found at: $APP_DIR"

  EXISTING_VERSION="unknown"
  if [ -f "$APP_DIR/version.json" ]; then
    EXISTING_VERSION=$(grep '"version"' "$APP_DIR/version.json" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2)
  fi
  echo "   Installed version: ${EXISTING_VERSION:-unknown}"
  echo ""
  echo "   A clean re-install will:"
  echo "     - Stop the running application (PM2)"
  echo "     - DROP ALL database tables and data"
  echo "     - Remove all uploaded files"
  echo "     - Remove the current application files"
  echo "     - Install a fresh copy from scratch"
  echo ""
  echo "   ⚠️  THIS CANNOT BE UNDONE. All data will be permanently lost."
  echo ""

  if [ -n "${LEARNPLAY_REINSTALL:-}" ]; then
    REINSTALL_ANSWER="$LEARNPLAY_REINSTALL"
  else
    read -p "   Do you want to remove everything and re-install? (yes/NO): " REINSTALL_ANSWER
  fi

  if [ "$REINSTALL_ANSWER" != "yes" ]; then
    echo ""
    echo "   Installation aborted. Your existing installation is unchanged."
    echo "   To update without losing data, use: sudo bash scripts/update.sh"
    exit 0
  fi

  echo ""
  log "🗑️  Removing existing installation..."

  # 1. Stop PM2 if running
  if command -v pm2 &>/dev/null; then
    log "   Stopping PM2 processes..."
    sudo -u "$APP_USER" pm2 stop all 2>/dev/null || true
    sudo -u "$APP_USER" pm2 delete all 2>/dev/null || true
    log "   ✅ PM2 processes stopped"
  fi

  # 2. Load DATABASE_URL from existing .env for cleanup
  EXISTING_DB_URL=""
  if [ -f "$APP_DIR/.env" ]; then
    EXISTING_DB_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
  fi

  # 3. Drop and recreate the database
  if [ -n "$EXISTING_DB_URL" ]; then
    log "   Dropping all database tables..."
    psql "$EXISTING_DB_URL" -v ON_ERROR_STOP=0 <<'DROPALL' 2>/dev/null || log "   ⚠️  Some tables could not be dropped (may not exist)"
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop all tables in public schema
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
  END LOOP;
  -- Drop all custom types in public schema
  FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS "' || r.typname || '" CASCADE';
  END LOOP;
  -- Drop all sequences in public schema
  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS "' || r.sequence_name || '" CASCADE';
  END LOOP;
END $$;
DROPALL
    log "   ✅ Database wiped clean"
  else
    log "   ⚠️  Could not find DATABASE_URL in existing .env — database not wiped"
  fi

  # 4. Remove uploaded files
  if [ -d "$UPLOAD_DIR" ]; then
    log "   Removing uploaded files..."
    rm -rf "$UPLOAD_DIR"
    mkdir -p "$UPLOAD_DIR/public" "$UPLOAD_DIR/private"
    chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR"
    log "   ✅ Upload directory cleaned"
  fi

  # 5. Remove application files (keep .env backup for reference)
  log "   Removing application files..."
  cp "$APP_DIR/.env" "/tmp/learnplay-env-backup-$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
  rm -rf "$APP_DIR/server" "$APP_DIR/client" "$APP_DIR/migrations" "$APP_DIR/scripts" \
         "$APP_DIR/node_modules" "$APP_DIR/package.json" "$APP_DIR/package-lock.json" \
         "$APP_DIR/version.json" "$APP_DIR/release-manifest.json" "$APP_DIR/release-manifest.sig" \
         "$APP_DIR/package-inventory.txt" "$APP_DIR/package-checksums.sha256" \
         "$APP_DIR/ecosystem.config.cjs" "$APP_DIR/data" \
         "$APP_DIR/schema-full.sql" "$APP_DIR/create-enums.sql" "$APP_DIR/.env"
  log "   ✅ Application files removed"

  log "✅ Existing installation removed. Proceeding with fresh install..."
  echo ""
fi

# Ensure app directory structure exists
mkdir -p "$APP_DIR"
mkdir -p "$UPLOAD_DIR/public" "$UPLOAD_DIR/private" "$BACKUP_DIR"
mkdir -p /opt/learnplay/keys
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$UPLOAD_DIR" /opt/learnplay/keys 2>/dev/null || true

PROVISION_BUNDLE=""
if [ -f /opt/learnplay/keys/provision-bundle.json ]; then
  chmod 600 /opt/learnplay/keys/provision-bundle.json
  chown "$APP_USER:$APP_USER" /opt/learnplay/keys/provision-bundle.json
  PROVISION_BUNDLE="/opt/learnplay/keys/provision-bundle.json"
  log "   ✅ Provision bundle found at $PROVISION_BUNDLE"
fi

# ============================================
# Step 1: Load Saved Configuration
# ============================================
log "📋 Loading saved configuration..."

# Load DB credentials from db-setup.sh
if [ -f /tmp/learnplay-db-credentials ]; then
  source /tmp/learnplay-db-credentials
  log "   ✅ Database credentials loaded"
else
  log "   ⚠️  No saved DB credentials found, will prompt..."
  read -sp "Database password: " DB_PASSWORD
  echo ""
  DB_PASSWORD_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$DB_PASSWORD', safe=''))")
  DATABASE_URL="postgresql://learnplay:${DB_PASSWORD_ENCODED}@localhost:${DB_PORT:-5432}/learnplay"
fi

# Load perf settings from perf-tune.sh
if [ -f /tmp/learnplay-perf-settings ]; then
  source /tmp/learnplay-perf-settings
  log "   ✅ Performance settings loaded"
else
  NODE_MAX_OLD_SPACE=2048
  PM2_INSTANCES=1
  DB_POOL_MAX=20
  DB_POOL_MIN=2
  MAX_CONNECTIONS=100
fi

# ============================================
# Step 2: Collect Application Configuration
# ============================================
log ""
log "📋 Application Configuration"
log "───────────────────────────"

if [ -n "${LEARNPLAY_DOMAIN:-}" ]; then
  DOMAIN="$LEARNPLAY_DOMAIN"
else
  read -p "Domain name (e.g., learn.example.com): " DOMAIN
  while [ -z "$DOMAIN" ]; do
    read -p "Domain name is required: " DOMAIN
  done
fi

if [ -n "${LEARNPLAY_ADMIN_EMAIL:-}" ]; then
  ADMIN_EMAIL="$LEARNPLAY_ADMIN_EMAIL"
else
  read -p "Admin email: " ADMIN_EMAIL
  while [ -z "$ADMIN_EMAIL" ]; do
    read -p "Admin email is required: " ADMIN_EMAIL
  done
fi

# Integration credentials are managed inside the application at /admin/integration-settings.
# Installer no longer collects SMTP/MailerSend/Gemini/Gamma/ElevenLabs/YOCO secrets.
SMTP_FROM="${LEARNPLAY_SMTP_FROM:-noreply@$DOMAIN}"
SMTP_FROM="$(trim_value "$SMTP_FROM")"
# API providers are configured post-install by CustSuper/SuperAdmin.
DEPLOY_MODE="A"
GEMINI_KEY=""
GAMMA_KEY=""
ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD="${LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD:-}"
ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD="$(trim_value "$ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD")"

if [ -z "$ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD" ]; then
  echo ""
  echo -e "${BOLD}Cloud PRD Check-In Signing Secret (Optional)${NC}"
  echo -e "${DIM}Legacy bootstrap-only. Per-system sync credentials are preferred and provisioned after successful cloud linking/check-in.${NC}"
  if ! is_non_interactive; then
    read -r -p "  Configure ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD now? [y/N]: " use_legacy_sync
    if [[ "${use_legacy_sync,,}" == "y" || "${use_legacy_sync,,}" == "yes" ]]; then
      while ! collect_onprem_sync_shared_secret; do
        echo -e "${YELLOW}  Please provide a non-empty value, or press Ctrl+C to skip.${NC}"
      done
    fi
  fi
fi

# ============================================
# Admin User Configuration (fixed policy)
# ============================================
echo ""
echo -e "${BOLD}Admin User Configuration${NC}"
echo -e "${DIM}OnPrem installations always run as OS user 'lppadmin'.${NC}"
echo ""

LP_ADMIN_USER="lppadmin"

if ! id "$LP_ADMIN_USER" &>/dev/null; then
  echo -e "${RED}❌ User '$LP_ADMIN_USER' does not exist on this system${NC}"
  exit 1
fi

APP_USER="$LP_ADMIN_USER"
APP_USER_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)"
if [ -z "$APP_USER_HOME" ]; then
  APP_USER_HOME="/home/$APP_USER"
fi
log "   ✅ Admin user: $LP_ADMIN_USER"

# ============================================
# System Type Selection
# ============================================
echo ""
echo -e "${BOLD}System Type Selection${NC}"
echo -e "${DIM}Choose the intended purpose of this LearnPlay installation.${NC}"
echo ""
echo "  1) Development  — For testing and evaluation. Learner registration is always disabled."
echo "  2) QA/Testing   — For integration/UAT. Learner registration is always disabled."
echo "  3) Production   — For live use. No on-prem license is required on LearnPlay cloud."
echo ""

SYSTEM_TYPE_INPUT="${LEARNPLAY_SYSTEM_TYPE:-}"

if [ -z "$SYSTEM_TYPE_INPUT" ]; then
  read -p "  Select system type (1/2/3) [1]: " SYSTEM_TYPE_CHOICE
  SYSTEM_TYPE_CHOICE="${SYSTEM_TYPE_CHOICE:-1}"
  while [ "$SYSTEM_TYPE_CHOICE" != "1" ] && [ "$SYSTEM_TYPE_CHOICE" != "2" ] && [ "$SYSTEM_TYPE_CHOICE" != "3" ]; do
    read -p "  Please enter 1, 2, or 3: " SYSTEM_TYPE_CHOICE
  done
  if [ "$SYSTEM_TYPE_CHOICE" = "3" ]; then
    SYSTEM_TYPE_INPUT="production"
  elif [ "$SYSTEM_TYPE_CHOICE" = "2" ]; then
    SYSTEM_TYPE_INPUT="qa"
  else
    SYSTEM_TYPE_INPUT="development"
  fi
fi

SYSTEM_TYPE="$SYSTEM_TYPE_INPUT"
case "$(echo "$SYSTEM_TYPE" | tr '[:upper:]' '[:lower:]')" in
  development|dev|onprem) SYSTEM_TYPE="development" ;;
  qa|test|testing|quality_assurance|quality-assurance) SYSTEM_TYPE="qa" ;;
  production|prod) SYSTEM_TYPE="production" ;;
  *)
    log "   ⚠️  Unknown SYSTEM_TYPE '$SYSTEM_TYPE' provided; defaulting to development"
    SYSTEM_TYPE="development"
    ;;
esac
log "   ✅ System type: $SYSTEM_TYPE"

if [ "$SYSTEM_TYPE" = "development" ] || [ "$SYSTEM_TYPE" = "qa" ]; then
  echo ""
  echo -e "${YELLOW}   Note: ${SYSTEM_TYPE^^} systems never allow learner self-registration.${NC}"
fi

# ============================================
# Step 3: Configure Ports
# ============================================
log ""
log "🔧 Port Configuration"
log "   Configure ports for this LearnPlay instance."
log "   Multiple instances can run on different ports."
log ""

APP_PORT="${LEARNPLAY_APP_PORT:-}"
if [ -z "$APP_PORT" ]; then
  read -p "  Application Port [3000]: " APP_PORT
  APP_PORT="${APP_PORT:-3000}"
  while ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [3000]: " APP_PORT
    APP_PORT="${APP_PORT:-3000}"
  done
fi

if lsof -i :"$APP_PORT" -sTCP:LISTEN -t > /dev/null 2>&1; then
  EXISTING_PID=$(lsof -i :"$APP_PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)
  EXISTING_PROC=$(ps -p "$EXISTING_PID" -o comm= 2>/dev/null || echo "unknown")
  log "   ⚠️  Port $APP_PORT is in use by $EXISTING_PROC (PID: $EXISTING_PID)"
  read -p "   Kill existing process and continue? [y/N]: " KILL_EXISTING
  if [[ "$KILL_EXISTING" =~ ^[Yy] ]]; then
    kill "$EXISTING_PID" 2>/dev/null
    sleep 2
    if lsof -i :"$APP_PORT" -sTCP:LISTEN -t > /dev/null 2>&1; then
      kill -9 "$EXISTING_PID" 2>/dev/null
      sleep 1
    fi
    log "   ✅ Process terminated"
  else
    log "   ❌ Cannot proceed with port $APP_PORT in use"
    exit 1
  fi
fi
log "   ✅ Application port: $APP_PORT"

DB_PORT="${LEARNPLAY_DB_PORT:-}"
if [ -z "$DB_PORT" ]; then
  read -p "  PostgreSQL Port [5432]: " DB_PORT
  DB_PORT="${DB_PORT:-5432}"
  while ! [[ "$DB_PORT" =~ ^[0-9]+$ ]] || [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [5432]: " DB_PORT
    DB_PORT="${DB_PORT:-5432}"
  done
fi
log "   ✅ Database port: $DB_PORT"

if [ "${DB_PORT}" != "5432" ]; then
  DATABASE_URL=$(echo "$DATABASE_URL" | sed "s/@localhost:[0-9]*\//@localhost:${DB_PORT}\//")
fi

NGINX_HTTP_PORT="${LEARNPLAY_NGINX_HTTP_PORT:-}"
if [ -z "$NGINX_HTTP_PORT" ]; then
  read -p "  Nginx HTTP Port [80]: " NGINX_HTTP_PORT
  NGINX_HTTP_PORT="${NGINX_HTTP_PORT:-80}"
  while ! [[ "$NGINX_HTTP_PORT" =~ ^[0-9]+$ ]] || [ "$NGINX_HTTP_PORT" -lt 1 ] || [ "$NGINX_HTTP_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [80]: " NGINX_HTTP_PORT
    NGINX_HTTP_PORT="${NGINX_HTTP_PORT:-80}"
  done
fi
log "   ✅ Nginx HTTP port: $NGINX_HTTP_PORT"

NGINX_HTTPS_PORT="${LEARNPLAY_NGINX_HTTPS_PORT:-}"
if [ -z "$NGINX_HTTPS_PORT" ]; then
  read -p "  Nginx HTTPS Port [443]: " NGINX_HTTPS_PORT
  NGINX_HTTPS_PORT="${NGINX_HTTPS_PORT:-443}"
  while ! [[ "$NGINX_HTTPS_PORT" =~ ^[0-9]+$ ]] || [ "$NGINX_HTTPS_PORT" -lt 1 ] || [ "$NGINX_HTTPS_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [443]: " NGINX_HTTPS_PORT
    NGINX_HTTPS_PORT="${NGINX_HTTPS_PORT:-443}"
  done
fi
log "   ✅ Nginx HTTPS port: $NGINX_HTTPS_PORT"

# ============================================
# Step 4: Generate .env File
# ============================================
log "📝 Generating environment file..."

if [ -f "$APP_DIR/.env" ]; then
  BACKUP_SUFFIX=$(date +%Y%m%d_%H%M%S)
  cp "$APP_DIR/.env" "$APP_DIR/.env.backup-${BACKUP_SUFFIX}"
  chmod 600 "$APP_DIR/.env.backup-${BACKUP_SUFFIX}"
  log "   📋 Existing .env backed up to .env.backup-${BACKUP_SUFFIX}"
fi

SESSION_SECRET=$(openssl rand -hex 32)
EMAIL_VERIFICATION_SECRET=$(openssl rand -hex 32)
BASE_URL="http://$DOMAIN"
PUBLIC_BASE_URL=$BASE_URL

cat > "$APP_DIR/.env" << EOF
# ============================================
# LearnPlay On-Premises Configuration
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ============================================

# Platform
PLATFORM_ENV=onprem
NODE_ENV=production
PORT=${APP_PORT:-3000}
DB_PORT=${DB_PORT:-5432}
NGINX_HTTP_PORT=${NGINX_HTTP_PORT:-80}
NGINX_HTTPS_PORT=${NGINX_HTTPS_PORT:-443}
LP_ADMIN_USER=$LP_ADMIN_USER
SYSTEM_TYPE=$SYSTEM_TYPE
LEARNPLAY_SETUP_SSL=${LEARNPLAY_SETUP_SSL:-self-signed-https}
LEARNPLAY_BEHIND_CADDY=${LEARNPLAY_BEHIND_CADDY:-false}

# URLs (updated to https:// automatically when SSL is enabled via lpadmin ssl)
BASE_URL=$BASE_URL
PUBLIC_BASE_URL=$BASE_URL
FRONTEND_URL=$BASE_URL
VITE_DOMAIN=$BASE_URL
PLATFORM_DOMAINS=$DOMAIN,www.$DOMAIN

# Database
DATABASE_URL=$DATABASE_URL

# Session & Security
SESSION_SECRET=$SESSION_SECRET
EMAIL_VERIFICATION_SECRET=$EMAIL_VERIFICATION_SECRET
COOKIE_SECURE=false
SESSION_AUTH_ENABLED=true

# File Storage
UPLOAD_DIR=$UPLOAD_DIR

# Integration defaults (non-secret only; secrets are DB-managed via Integration Settings UI)
EMAIL_FROM=${SMTP_FROM:-noreply@$DOMAIN}
INTEGRATION_EMAIL_ACTIVE_PROVIDER=mailersend

# On-Premises Mode
ONPREM_MODE=true
ONPREM_OWN_API_KEYS=true
ONPREM_LICENSE_ENFORCEMENT=true
ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD=$ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD
PAYMENT_GATEWAY_ENABLED=false
ENABLE_QUIZ_CREDIT_CHARGING=true

# Performance (auto-tuned)
MAX_OLD_SPACE_SIZE=$NODE_MAX_OLD_SPACE
ENABLE_OPTIMIZED_POOL=true
DB_POOL_MAX=$DB_POOL_MAX
DB_POOL_MIN=$DB_POOL_MIN
EOF

chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
log "   ✅ Environment file created"

# ============================================
# Step 5: Copy Application Files
# ============================================
log "📦 Copying application files..."
cp -r "$DIST_DIR/server" "$APP_DIR/"
cp -r "$DIST_DIR/client" "$APP_DIR/"
cp -r "$DIST_DIR/migrations" "$APP_DIR/" 2>/dev/null || true
cp -r "$DIST_DIR/scripts" "$APP_DIR/"
cp "$DIST_DIR/package.json" "$APP_DIR/"
cp "$DIST_DIR/package-lock.json" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/version.json" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/release-manifest.json" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/release-manifest.sig" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/package-inventory.txt" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/package-checksums.sha256" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/schema-contract.env" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/schema-fingerprint.env" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/ecosystem.config.cjs" "$APP_DIR/" 2>/dev/null || true
if [ -f "$DIST_DIR/server/config/release-signing-public.pem" ]; then
  mkdir -p "$APP_DIR/server/config"
  cp "$DIST_DIR/server/config/release-signing-public.pem" "$APP_DIR/server/config/"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
log "   ✅ Application files copied"

# ============================================
# Step 6: Install npm Dependencies
# ============================================
log "📦 Installing npm dependencies..."
cd "$APP_DIR"
DEPS_FINGERPRINT_FILE="$APP_DIR/node_modules/.learnplay-deps-fingerprint.sha256"
DEPS_FINGERPRINT_CURRENT="$( ( [ -f "$APP_DIR/package-lock.json" ] && cat "$APP_DIR/package-lock.json"; cat "$APP_DIR/package.json" ) | sha256sum | awk '{print $1}' )"
DEPS_FINGERPRINT_PREVIOUS="$(cat "$DEPS_FINGERPRINT_FILE" 2>/dev/null | tr -d '[:space:]' || true)"
if [ -d "$APP_DIR/node_modules" ] && [ -n "$DEPS_FINGERPRINT_PREVIOUS" ] && [ "$DEPS_FINGERPRINT_PREVIOUS" = "$DEPS_FINGERPRINT_CURRENT" ]; then
  log "   ✅ Dependencies already up to date (fingerprint match)"
else
  npm install --omit=dev 2>&1 | tail -5 | while read line; do log "   $line"; done
  mkdir -p "$APP_DIR/node_modules" 2>/dev/null || true
  printf '%s\n' "$DEPS_FINGERPRINT_CURRENT" > "$DEPS_FINGERPRINT_FILE" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$DEPS_FINGERPRINT_FILE" 2>/dev/null || true
  log "   ✅ Dependencies installed"
fi

# ============================================
# Step 6b: Validate Schema Contract Metadata
# ============================================
log "🔎 Validating schema contract metadata..."
if [ ! -f "$DIST_DIR/schema-contract.env" ]; then
  log "   ❌ Missing schema-contract.env in package"
  echo -e "${RED}❌ Installer package is missing schema-contract.env (schema parity contract). Rebuild the installer package.${NC}"
  exit 1
fi
set -a
source "$DIST_DIR/schema-contract.env"
set +a
if [ "${CONTRACT_PRODUCT:-}" != "shared" ]; then
  log "   ❌ Invalid contract product: ${CONTRACT_PRODUCT:-unknown} (expected: shared)"
  echo -e "${RED}❌ Invalid installer contract metadata. Expected CONTRACT_PRODUCT=shared.${NC}"
  exit 1
fi
log "   ✅ Contract product: ${CONTRACT_PRODUCT}, version: ${CONTRACT_VERSION:-unknown}, schema signature: ${EXPECTED_SCHEMA_SIG:-unknown}"

# ============================================
# Step 7: Run Database Migrations
# ============================================
log "🔄 Running database migrations..."
cp "$DIST_DIR/create-enums.sql" "$APP_DIR/" 2>/dev/null || true
cp "$DIST_DIR/schema-full.sql" "$APP_DIR/" 2>/dev/null || true
if [ -f "$APP_DIR/scripts/migrate.js" ]; then
  if ! grep -q "schema-full.sql" "$APP_DIR/scripts/migrate.js" 2>/dev/null; then
    log "   ❌ Unsupported migration runner detected in package (missing schema-full bootstrap support)"
    log "   ❌ Rebuild installer package from latest source and retry"
    exit 1
  fi
  sudo -u "$APP_USER" bash -c '
    set -a
    if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
    set +a
    # IMPORTANT: Never force fresh installs during package deploy/update.
    # The migration runner auto-detects fresh databases safely.
    ALLOW_JOURNAL_REPAIR=true node "'"$APP_DIR"'/scripts/migrate.js"
  ' 2>&1 | tee -a "$LOG_FILE"
  log "   ✅ Migrations complete"
else
  log "   ⚠️  Migration script not found, skipping"
fi

# ============================================
# Step 7b: Set Up Master Password (for SuperAdmin role assignment via lpadmin)
# ============================================
# Auto-generated from the platform SuperAdmin password — no user prompt needed.
log "🔑 Setting up master password for lpadmin..."

MASTER_HASH="${LEARNPLAY_MASTER_PASSWORD_HASH:-}"
MASTER_PASSWORD_VALUE="${LEARNPLAY_MASTER_PASSWORD:-${LEARNPLAY_ADMIN_PASSWORD:-}}"

if [ -z "$MASTER_HASH" ] || [[ "$MASTER_HASH" != \$2* ]]; then
  if [ -n "$MASTER_PASSWORD_VALUE" ]; then
    MASTER_HASH=$(echo -n "$MASTER_PASSWORD_VALUE" | (cd "$APP_DIR" && node -e "
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  import('bcrypt').then(b => b.default.hash(data, 10)).then(h => { process.stdout.write(h); process.exit(0); }).catch(() => process.exit(1));
});
") 2>/dev/null || echo '')
  fi
fi

if [ -z "$MASTER_HASH" ] || [[ "$MASTER_HASH" != \$2* ]]; then
  log "   ❌ Failed to generate master password hash from LEARNPLAY_MASTER_PASSWORD/LEARNPLAY_ADMIN_PASSWORD."
  echo -e "${RED}❌ Failed to hash master password. Set LEARNPLAY_MASTER_PASSWORD (or LEARNPLAY_ADMIN_PASSWORD) and ensure bcrypt is installed.${NC}"
  exit 1
fi

echo "MASTER_PASSWORD_HASH=$MASTER_HASH" >> "$APP_DIR/.env"
log "   ✅ Master password hash stored in .env"

# ============================================
# Step 8: Seed Admin User & Organization (before platform data so FK references work)
# ============================================
log "👤 Seeding admin user and organization..."

# Derive gamerName from admin email (take prefix before @)
ADMIN_EMAIL="${LEARNPLAY_ADMIN_EMAIL:-$ADMIN_EMAIL}"
if [ "$(echo "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')" = "admin@learnplay.co.za" ]; then
  log "   ❌ Installer admin email cannot be admin@learnplay.co.za"
  echo -e "${RED}❌ Please use your organization's admin email. admin@learnplay.co.za is reserved for the platform SuperAdmin account.${NC}"
  exit 1
fi
ADMIN_GAMER_NAME=$(echo "$ADMIN_EMAIL" | cut -d@ -f1 | sed 's/[^a-zA-Z0-9_]//g')
# Ensure gamerName is not empty
[ -z "$ADMIN_GAMER_NAME" ] && ADMIN_GAMER_NAME="Admin"

# Admin password — require env var or prompt; never use a hardcoded default
if [ -n "${LEARNPLAY_ADMIN_PASSWORD:-}" ]; then
  ADMIN_PASSWORD="$LEARNPLAY_ADMIN_PASSWORD"
elif [ -t 0 ]; then
  echo ""
  echo -e "${CYAN}Set the initial admin password:${NC}"
  while true; do
    read -rsp "  Enter admin password (min 8 chars): " ADMIN_PASSWORD
    echo ""
    if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
      echo -e "${RED}  Password must be at least 8 characters.${NC}"
      continue
    fi
    read -rsp "  Confirm admin password: " CONFIRM_PASSWORD
    echo ""
    if [ "$ADMIN_PASSWORD" != "$CONFIRM_PASSWORD" ]; then
      echo -e "${RED}  Passwords do not match. Try again.${NC}"
      continue
    fi
    break
  done
else
  ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | head -c 16)
  echo ""
  log "   Generated random admin password: $ADMIN_PASSWORD"
  echo -e "${YELLOW}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  IMPORTANT: Save this admin password NOW             ║${NC}"
  echo -e "${YELLOW}║  Password: ${BOLD}${ADMIN_PASSWORD}${NC}${YELLOW}                              ║${NC}"
  echo -e "${YELLOW}║  It will NOT be shown again.                         ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
fi

# Hash admin password via stdin (never expose in process args)
ADMIN_HASH=$(echo -n "$ADMIN_PASSWORD" | (cd "$APP_DIR" && node -e "
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  import('bcrypt').then(b => b.default.hash(data, 10)).then(h => { process.stdout.write(h); process.exit(0); }).catch(() => process.exit(1));
});
") 2>/dev/null || echo '')

if [ -z "$ADMIN_HASH" ] || [[ "$ADMIN_HASH" != \$2* ]]; then
  log "   ❌ Failed to hash admin password. Ensure Node.js and bcrypt are installed."
  echo -e "${RED}❌ Failed to hash admin password. Cannot proceed without a valid password hash.${NC}"
  exit 1
fi

# Generate invite code for organization
INVITE_CODE=$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')

# Organization name from installer prompt
ORG_NAME="${LEARNPLAY_ORG_NAME:-My Organization}"

# On on-prem, the installer-provided admin account is always Customer Super Admin.
# Platform SuperAdmin is separately seeded as admin@learnplay.co.za.
IS_CUST_SUPER="true"
IS_SUPER_ADMIN="false"

SQL_ADMIN_EMAIL="${ADMIN_EMAIL//\'/\'\'}"
SQL_ADMIN_GAMER_NAME="${ADMIN_GAMER_NAME//\'/\'\'}"
SQL_ORG_NAME="${ORG_NAME//\'/\'\'}"
SQL_ADMIN_HASH="${ADMIN_HASH//\'/\'\'}"

# ============================================
# Step 8a: Seed Hidden SuperAdmin User
# ============================================
# Every installation gets a hidden SuperAdmin user (admin@learnplay.co.za).
# This user is required for platform data imports (FK references) and
# internal LearnPlay operations. The password is never prompted.
log "👤 Seeding platform SuperAdmin user..."
# SECURITY: SuperAdmin initial hash is derived from installer admin password
# (MASTER_HASH) instead of a hardcoded shared credential.
SUPERADMIN_HASH="$MASTER_HASH"

if [ -n "$SUPERADMIN_HASH" ] && [[ "$SUPERADMIN_HASH" == \$2* ]]; then
  SQL_SUPERADMIN_HASH="${SUPERADMIN_HASH//\'/\'\'}"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 2>&1 <<EOSQL_SA | tee -a "$LOG_FILE"
DO \$\$
BEGIN
  INSERT INTO users (id, "gamerName", email, password, "firstName", "lastName", "isSuperAdmin", "isCustSuper", "emailVerified")
  VALUES (
    gen_random_uuid()::text,
    'superadmin',
    'admin@learnplay.co.za',
    '${SQL_SUPERADMIN_HASH}',
    'LearnPlay',
    'SuperAdmin',
    true,
    false,
    true
  )
  ON CONFLICT (email) DO UPDATE SET
    "isSuperAdmin" = true,
    "emailVerified" = true,
    password = EXCLUDED.password;
END
\$\$;
EOSQL_SA
  then
    log "   ✅ Platform SuperAdmin user seeded (admin@learnplay.co.za)"
  else
    log "   ❌ SuperAdmin seeding failed"
    echo -e "${RED}❌ Failed to seed required SuperAdmin user (admin@learnplay.co.za).${NC}"
    exit 1
  fi
else
  log "   ❌ Failed to hash SuperAdmin password"
  echo -e "${RED}❌ Failed to hash required SuperAdmin password.${NC}"
  exit 1
fi

# Harden/repair reserved platform SuperAdmin flags, then verify.
# This avoids false negatives if prior seed state drifted.
if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 2>&1 <<'EOSQL_SUPERADMIN_REPAIR' | tee -a "$LOG_FILE"
UPDATE users
SET "isSuperAdmin" = true,
    "isCustSuper" = false,
    "emailVerified" = true,
    "isDisabled" = false
WHERE lower(email) = lower('admin@learnplay.co.za');
EOSQL_SUPERADMIN_REPAIR
then
  log "   ❌ SuperAdmin post-seed repair failed"
  exit 1
fi

SUPERADMIN_COUNT="$(
  psql "$DATABASE_URL" -tAc "
    SELECT COUNT(*)
    FROM users
    WHERE lower(email) = lower('admin@learnplay.co.za')
      AND COALESCE(\"isSuperAdmin\", false) = true
      AND COALESCE(\"emailVerified\", false) = true
      AND COALESCE(\"isDisabled\", false) = false;
  " 2>/dev/null | tr -d '[:space:]'
)"

if [ -n "$SUPERADMIN_COUNT" ] && [ "$SUPERADMIN_COUNT" -ge 1 ] 2>/dev/null; then
  log "   ✅ SuperAdmin verification passed"
else
  log "   ❌ SuperAdmin verification failed"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -x -c "
    SELECT id, email, \"isSuperAdmin\", \"isCustSuper\", \"emailVerified\", \"isDisabled\"
    FROM users
    WHERE lower(email) = lower('admin@learnplay.co.za');
  " 2>&1 | tee -a "$LOG_FILE" || true
  exit 1
fi

# Step 8a.1: Seed required support bootstrap account for onprem tracks.
SUPPORT_BOOTSTRAP_HASH_DEFAULT='$2b$10$p9i86UUxH83d6tuhn0BG3OHHUtVOj6IrfcwRMdbc1Sg.4Y42OHJ/W'
SUPPORT_BOOTSTRAP_HASH="$(grep -E '^SUPPORT_BOOTSTRAP_PASSWORD_HASH=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
SUPPORT_BOOTSTRAP_HASH="${SUPPORT_BOOTSTRAP_HASH%\"}"
SUPPORT_BOOTSTRAP_HASH="${SUPPORT_BOOTSTRAP_HASH#\"}"
SUPPORT_BOOTSTRAP_HASH="$(echo "$SUPPORT_BOOTSTRAP_HASH" | tr -d '[:space:]')"
if [ -z "$SUPPORT_BOOTSTRAP_HASH" ] || [[ "$SUPPORT_BOOTSTRAP_HASH" != \$2* ]]; then
  SUPPORT_BOOTSTRAP_HASH="$SUPPORT_BOOTSTRAP_HASH_DEFAULT"
fi
SQL_SUPPORT_BOOTSTRAP_HASH="${SUPPORT_BOOTSTRAP_HASH//\'/\'\'}"
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 2>&1 <<EOSQL_SUPPORT_BOOTSTRAP | tee -a "$LOG_FILE"
DO \$\$
DECLARE
  has_failed_login_attempts boolean;
  has_locked_until boolean;
  has_is_locked boolean;
  has_is_disabled boolean;
BEGIN
  INSERT INTO users (id, "gamerName", email, password, "firstName", "lastName", "isSuperAdmin", "isCustSuper", "emailVerified")
  VALUES (
    gen_random_uuid()::text,
    'support',
    'support@learnplay.co.za',
    '${SQL_SUPPORT_BOOTSTRAP_HASH}',
    'LearnPlay',
    'Support',
    false,
    true,
    true
  )
  ON CONFLICT (email) DO UPDATE SET
    "gamerName" = 'support',
    "firstName" = 'LearnPlay',
    "lastName" = 'Support',
    "isSuperAdmin" = false,
    "isCustSuper" = true,
    "emailVerified" = true,
    password = EXCLUDED.password;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='failedLoginAttempts'
  ) INTO has_failed_login_attempts;
  IF has_failed_login_attempts THEN
    UPDATE users SET "failedLoginAttempts" = 0 WHERE lower(email)=lower('support@learnplay.co.za');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='lockedUntil'
  ) INTO has_locked_until;
  IF has_locked_until THEN
    UPDATE users SET "lockedUntil" = NULL WHERE lower(email)=lower('support@learnplay.co.za');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='isLocked'
  ) INTO has_is_locked;
  IF has_is_locked THEN
    UPDATE users SET "isLocked" = false WHERE lower(email)=lower('support@learnplay.co.za');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='isDisabled'
  ) INTO has_is_disabled;
  IF has_is_disabled THEN
    UPDATE users SET "isDisabled" = false WHERE lower(email)=lower('support@learnplay.co.za');
  END IF;
END
\$\$;
EOSQL_SUPPORT_BOOTSTRAP
then
  log "   ✅ Support bootstrap user seeded (support@learnplay.co.za, role=custsuper)"
else
  log "   ❌ Support bootstrap user seeding failed"
  exit 1
fi

# ============================================
# Step 8b: Seed Customer Admin User & Organization
# ============================================
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 2>&1 <<EOSQL | tee -a "$LOG_FILE"
DO \$\$
DECLARE
  v_user_id TEXT;
  v_org_id TEXT;
BEGIN
  -- Upsert admin user
  INSERT INTO users (id, "gamerName", email, password, "firstName", "lastName", "isSuperAdmin", "isCustSuper", "emailVerified")
  VALUES (
    gen_random_uuid()::text,
    '${SQL_ADMIN_GAMER_NAME}',
    '${SQL_ADMIN_EMAIL}',
    '${SQL_ADMIN_HASH}',
    'Platform',
    'Admin',
    ${IS_SUPER_ADMIN},
    ${IS_CUST_SUPER},
    true
  )
  ON CONFLICT (email) DO UPDATE SET
    "isSuperAdmin" = ${IS_SUPER_ADMIN},
    "isCustSuper" = ${IS_CUST_SUPER},
    "emailVerified" = true,
    password = EXCLUDED.password
  RETURNING id INTO v_user_id;

  -- Create organization if it doesn't already exist (no unique constraint on name)
  SELECT id INTO v_org_id FROM organizations WHERE name = '${SQL_ORG_NAME}' LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (id, name, "inviteCode", type, "subscriptionStatus", "isDemo", "useOrgCreditWallet", "allowTeachersToSpendCredits")
    VALUES (
      gen_random_uuid()::text,
      '${SQL_ORG_NAME}',
      '${INVITE_CODE}',
      'business',
      'active',
      true,
      true,
      true
    )
    RETURNING id INTO v_org_id;
  ELSE
    UPDATE organizations SET "subscriptionStatus" = 'active', "isDemo" = COALESCE("isDemo", true), "useOrgCreditWallet" = COALESCE("useOrgCreditWallet", true), "allowTeachersToSpendCredits" = COALESCE("allowTeachersToSpendCredits", true) WHERE id = v_org_id;
  END IF;

  -- Ensure installer admin belongs to the created organization.
  INSERT INTO "userOrganizationAssignments" ("userId", "organizationId")
  SELECT v_user_id, v_org_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM "userOrganizationAssignments"
    WHERE "userId" = v_user_id
      AND "organizationId" = v_org_id
  );

  -- Ensure installer admin has organization admin role in that organization.
  INSERT INTO "userOrganizationRoles" ("userId", "organizationId", role)
  SELECT v_user_id, v_org_id, 'org_admin'
  WHERE NOT EXISTS (
    SELECT 1
    FROM "userOrganizationRoles"
    WHERE "userId" = v_user_id
      AND "organizationId" = v_org_id
      AND role = 'org_admin'
  );

  RAISE NOTICE 'Admin user: % (%), Org: % (%), InviteCode: %', v_user_id, '${SQL_ADMIN_EMAIL}', v_org_id, '${SQL_ORG_NAME}', '${INVITE_CODE}';
END
\$\$;
EOSQL
then
  log "   ✅ Admin user '${ADMIN_GAMER_NAME}' seeded (email: ${ADMIN_EMAIL})"
  log "   ✅ Organization '${ORG_NAME}' created (invite code: ${INVITE_CODE})"
  log "   ✅ CustSuper role assigned to installer admin user"
else
  log "   ⚠️  Admin/organization seeding failed — check database connectivity"
fi

# ============================================
# Step 8b: Seed AI Configuration into Database
# ============================================
# The backend reads AI config from the aiConfig table (not .env).
# If the installer provided a Gemini key (Mode A), upsert it into the DB
# so AI features work immediately without manual UI configuration.
if [ -n "$GEMINI_KEY" ]; then
  log "🤖 Seeding AI configuration into database..."
  ADMIN_USER_ID=$(psql "$DATABASE_URL" -tAc "SELECT id FROM users WHERE email = '${SQL_ADMIN_EMAIL}' LIMIT 1" 2>/dev/null || echo '')
  if [ -n "$ADMIN_USER_ID" ]; then
    SQL_GEMINI_KEY="${GEMINI_KEY//\'/\'\'}"
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 2>&1 <<EOSQL_AI | tee -a "$LOG_FILE"
DO \$\$
DECLARE
  v_admin_id TEXT := '${ADMIN_USER_ID}';
  v_api_key TEXT := '${SQL_GEMINI_KEY}';
BEGIN
  -- Upsert text AI config: update existing active text config or insert new one
  IF EXISTS (SELECT 1 FROM "aiConfig" WHERE purpose = 'text' AND "isActive" = true) THEN
    UPDATE "aiConfig" SET "apiKey" = v_api_key, "modelName" = 'gemini-2.5-flash', "updatedAt" = NOW()
    WHERE purpose = 'text' AND "isActive" = true;
  ELSE
    INSERT INTO "aiConfig" (id, provider, "apiKey", "modelName", purpose, "isActive", "createdBy")
    VALUES (gen_random_uuid()::text, 'gemini', v_api_key, 'gemini-2.5-flash', 'text', true, v_admin_id);
  END IF;

  -- Upsert image AI config: update existing active image config or insert new one
  IF EXISTS (SELECT 1 FROM "aiConfig" WHERE purpose = 'image' AND "isActive" = true) THEN
    UPDATE "aiConfig" SET "apiKey" = v_api_key, "modelName" = 'gemini-2.0-flash-exp', "updatedAt" = NOW()
    WHERE purpose = 'image' AND "isActive" = true;
  ELSE
    INSERT INTO "aiConfig" (id, provider, "apiKey", "modelName", purpose, "isActive", "createdBy")
    VALUES (gen_random_uuid()::text, 'gemini', v_api_key, 'gemini-2.0-flash-exp', 'image', true, v_admin_id);
  END IF;
END
\$\$;
EOSQL_AI
    then
      log "   ✅ AI configuration seeded (Gemini key for text + image)"
    else
      log "   ⚠️  AI config DB seed failed — configure via UI after login"
    fi
  else
    log "   ⚠️  Could not find admin user ID — skipping AI config seed"
  fi
else
  log "   ℹ️  No Gemini key provided — AI config can be set via UI"
fi

# ============================================
# Step 9: Import Platform Data
# ============================================
if [ -d "$DIST_DIR/data" ] && [ "$(ls -A "$DIST_DIR/data" 2>/dev/null)" ]; then
  log "📦 Importing platform data..."
  cp -r "$DIST_DIR/data" "$APP_DIR/"
  if [ -f "$APP_DIR/scripts/import-platform-data.sh" ]; then
    export DATABASE_URL
    APP_DIR="$APP_DIR" UPLOAD_DIR="$UPLOAD_DIR" bash "$APP_DIR/scripts/import-platform-data.sh" "$APP_DIR/data" 2>&1 | tee -a "$LOG_FILE"
    log "   ✅ Platform data imported"
    ASSET_SUMMARY_FILE="$APP_DIR/data/asset-export-summary.json"
    if [ ! -s "$ASSET_SUMMARY_FILE" ]; then
      log "   ❌ Missing required asset summary file: $ASSET_SUMMARY_FILE"
      exit 1
    fi
    EXPECTED_ASSETS="$(sed -n 's/.*"stagedTotal"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$ASSET_SUMMARY_FILE" | head -1)"
    EXPECTED_ASSETS="${EXPECTED_ASSETS:-0}"
    ACTUAL_ASSETS="$(find "$UPLOAD_DIR/public" -type f 2>/dev/null | wc -l | tr -d ' ')"
    ACTUAL_ASSETS="${ACTUAL_ASSETS:-0}"
    if [ "$ACTUAL_ASSETS" -lt "$EXPECTED_ASSETS" ]; then
      log "   ❌ Upload assets verification failed (actual=$ACTUAL_ASSETS expected>=$EXPECTED_ASSETS)"
      exit 1
    fi
    log "   ✅ Upload assets verified (actual=$ACTUAL_ASSETS expected>=$EXPECTED_ASSETS)"
  else
    log "   ❌ Import script not found: $APP_DIR/scripts/import-platform-data.sh"
    exit 1
  fi
else
  log "   ❌ No platform data found in package: $DIST_DIR/data"
  exit 1
fi

# ============================================
# Step 10: Configure Nginx
# ============================================
log "🌐 Configuring Nginx..."

# Remove default site
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

mkdir -p /var/www/certbot 2>/dev/null || true

if [ -f "$DIST_DIR/nginx.conf.template" ]; then
  sed "s/__DOMAIN__/$DOMAIN/g; s|__UPLOAD_DIR__|$UPLOAD_DIR|g; s/__APP_PORT__/${APP_PORT:-3000}/g; s/__NGINX_HTTP_PORT__/${NGINX_HTTP_PORT:-80}/g; s/__NGINX_HTTPS_PORT__/${NGINX_HTTPS_PORT:-443}/g" \
    "$DIST_DIR/nginx.conf.template" > "/etc/nginx/sites-available/$APP_NAME"
  
  ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
  
  if nginx -t 2>&1; then
    systemctl reload nginx
    log "   ✅ Nginx configured for $DOMAIN (HTTP mode)"
    log "   ℹ️  To enable HTTPS later, run: sudo lpadmin ssl"
  else
    log "   ❌ Nginx config test failed! Check the configuration."
    nginx -t 2>&1 | tee -a "$LOG_FILE"
  fi
else
  log "   ⚠️  Nginx template not found, skipping"
fi

# ============================================
# Step 11: SSL Certificate Setup
# ============================================
log ""
log "🔐 SSL / Reverse Proxy Setup"
log "───────────────────────────────────"

ensure_letsencrypt_auto_renewal() {
  local cert_automation="$APP_DIR/scripts/cert-automation.sh"
  if [ -x "$cert_automation" ]; then
    LEARNPLAY_APP_DIR="$APP_DIR" "$cert_automation" install >> "$LOG_FILE" 2>&1 || true
    log "   ✅ Installed LearnPlay certificate auto-renew policy (10-day threshold)"
  else
    log "   ⚠️  cert-automation.sh not found; skipping managed cert auto-renew setup"
  fi
}

generate_self_signed_cert() {
  mkdir -p /etc/ssl/learnplay
  if openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/learnplay/privkey.pem \
    -out /etc/ssl/learnplay/fullchain.pem \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN}" 2>&1 | tee -a "$LOG_FILE"; then
    chmod 644 /etc/ssl/learnplay/fullchain.pem
    chmod 600 /etc/ssl/learnplay/privkey.pem
    chown root:root /etc/ssl/learnplay/fullchain.pem /etc/ssl/learnplay/privkey.pem
    log "   ✅ Self-signed certificate generated"
    return 0
  fi
  return 1
}

SSL_SETUP="${LEARNPLAY_SETUP_SSL:-self-signed-https}"
if [ "$SSL_SETUP" = "caddy-http" ]; then
  log "   Behind Caddy mode selected: keeping backend on HTTP without local TLS redirect..."
elif [ "$SSL_SETUP" = "letsencrypt-https" ]; then
  log "   Obtaining Let's Encrypt certificate and enabling auto-renew..."
  if [ ! -x "$(command -v certbot || true)" ]; then
    log "   ❌ certbot is not installed"
    exit 1
  fi
  CERTBOT_EMAIL_ARGS=(--register-unsafely-without-email)
  if [ -n "${ADMIN_EMAIL:-}" ]; then
    CERTBOT_EMAIL_ARGS=(--email "$ADMIN_EMAIL")
  fi
  if certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos "${CERTBOT_EMAIL_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"; then
    ensure_letsencrypt_auto_renewal
    rm -f /etc/ssl/learnplay/fullchain.pem /etc/ssl/learnplay/privkey.pem 2>/dev/null || true
    log "   ✅ Let's Encrypt certificate provisioned"
  else
    log "   ❌ Failed to obtain Let's Encrypt certificate"
    if is_non_interactive; then
      FALLBACK_SELF_SIGNED="y"
      log "   ℹ️  Non-interactive mode: falling back to self-signed certificates"
    else
      read -p "   Continue with self-signed certificates instead? (y/N): " FALLBACK_SELF_SIGNED
    fi
    if [[ "$FALLBACK_SELF_SIGNED" =~ ^[Yy]$ ]]; then
      log "   Falling back to self-signed certificate setup..."
      if ! generate_self_signed_cert; then
        log "   ❌ Failed to generate self-signed certificate during fallback"
        exit 1
      fi
    else
      exit 1
    fi
  fi
else
  log "   Generating self-signed certificate and enforcing HTTPS-only mode..."
  if ! generate_self_signed_cert; then
    log "   ❌ Failed to generate self-signed certificate"
    exit 1
  fi
fi

sed -i "s|^BASE_URL=http://|BASE_URL=https://|" "$APP_DIR/.env"
sed -i "s|^PUBLIC_BASE_URL=http://|PUBLIC_BASE_URL=https://|" "$APP_DIR/.env"
sed -i "s|^FRONTEND_URL=http://|FRONTEND_URL=https://|" "$APP_DIR/.env"
sed -i "s|^VITE_DOMAIN=http://|VITE_DOMAIN=https://|" "$APP_DIR/.env"
if grep -q '^COOKIE_SECURE=' "$APP_DIR/.env"; then
  sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" "$APP_DIR/.env"
else
  echo "COOKIE_SECURE=true" >> "$APP_DIR/.env"
fi
if grep -q '^SESSION_COOKIE_SAMESITE=' "$APP_DIR/.env"; then
  sed -i "s|^SESSION_COOKIE_SAMESITE=.*|SESSION_COOKIE_SAMESITE=lax|" "$APP_DIR/.env"
else
  echo "SESSION_COOKIE_SAMESITE=lax" >> "$APP_DIR/.env"
fi
if [ "$SSL_SETUP" = "caddy-http" ]; then
  if grep -q '^LEARNPLAY_BEHIND_CADDY=' "$APP_DIR/.env"; then
    sed -i "s|^LEARNPLAY_BEHIND_CADDY=.*|LEARNPLAY_BEHIND_CADDY=true|" "$APP_DIR/.env"
  else
    echo "LEARNPLAY_BEHIND_CADDY=true" >> "$APP_DIR/.env"
  fi
  if grep -q '^LEARNPLAY_SETUP_SSL=' "$APP_DIR/.env"; then
    sed -i "s|^LEARNPLAY_SETUP_SSL=.*|LEARNPLAY_SETUP_SSL=caddy-http|" "$APP_DIR/.env"
  else
    echo "LEARNPLAY_SETUP_SSL=caddy-http" >> "$APP_DIR/.env"
  fi
fi
BASE_URL="https://$DOMAIN"
log "   ✅ Environment updated for HTTPS-only cookies"

SSL_MODE_SCRIPT="$APP_DIR/scripts/ssl-mode.sh"
if [ ! -f "$SSL_MODE_SCRIPT" ]; then
  log "   ❌ ssl-mode.sh not found — cannot enforce HTTPS-only mode"
  exit 1
fi
if [ "$SSL_SETUP" = "caddy-http" ]; then
  log "   ✅ Nginx left in HTTP backend mode for reverse proxy"
else
  if LEARNPLAY_SSL_MODE="https" bash "$SSL_MODE_SCRIPT" https 2>&1 | tee -a "$LOG_FILE"; then
    log "   ✅ Nginx configured to HTTPS-only mode"
  else
    log "   ❌ Failed to activate HTTPS-only mode"
    exit 1
  fi
  ensure_letsencrypt_auto_renewal
fi
if [ -f "$APP_DIR/scripts/learnplay-motd.sh" ]; then
  install -m 755 "$APP_DIR/scripts/learnplay-motd.sh" /etc/profile.d/learnplay-motd.sh 2>/dev/null || true
fi
if [ -f "$APP_DIR/scripts/lppadmin.sh" ]; then
  chmod 0755 "$APP_DIR/scripts/lppadmin.sh" 2>/dev/null || true
  ln -sfn "$APP_DIR/scripts/lppadmin.sh" /usr/local/bin/lppadmin
  mkdir -p /etc/lppadmin
  rm -f /etc/lppadmin/environment.env
  /usr/local/bin/lppadmin onprem self-check >/dev/null 2>&1 || true
  log "   ✅ Refreshed lppadmin command symlinks and /etc/lppadmin profile cache"
else
  log "   ⚠️  scripts/lppadmin.sh not found; skipped lppadmin command/profile refresh"
fi

# ============================================
# Step 12: Frontend Domain Replacement
# ============================================
log "🔄 Updating frontend domain references..."
find "$APP_DIR/client" -name "*.js" -exec sed -i "s|https://learnplay.replit.app|$BASE_URL|g" {} + 2>/dev/null || true
find "$APP_DIR/client" -name "*.html" -exec sed -i "s|https://learnplay.replit.app|$BASE_URL|g" {} + 2>/dev/null || true
log "   ✅ Domain references updated"

# ============================================
# Step 13: Start Application Service
# ============================================
log "🚀 Starting application..."
cd "$APP_DIR"

# Update ecosystem.config.cjs with correct max-old-space-size
if [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
  sed -i "s/--max-old-space-size=[0-9]*/--max-old-space-size=$NODE_MAX_OLD_SPACE/" "$APP_DIR/ecosystem.config.cjs" 2>/dev/null || true
fi

ensure_systemd_app_service
stop_pm2_app_runtime
if systemctl start "$APP_SERVICE_NAME" 2>&1 | tee -a "$LOG_FILE"; then
  log "   ✅ Systemd service started: ${APP_SERVICE_NAME}"
else
  log "   ❌ Failed to start systemd service: ${APP_SERVICE_NAME}"
fi

# ============================================
# Step 14: Health Check
# ============================================
log "⏳ Waiting for application to start..."
sleep 8

HEALTH_OK=false
for i in $(seq 1 5); do
  if curl -sf "http://127.0.0.1:${APP_PORT:-3000}/api/health" > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  log "   Attempt $i/5 - waiting..."
  sleep 3
done

if [ "$HEALTH_OK" = true ]; then
  log "   ✅ Application is healthy!"
  run_podcast_hls_backfill_install
else
  log "   ⚠️  Health check didn't pass yet. This may be normal if the app needs more time."
  log "   Check logs: sudo journalctl -u ${APP_SERVICE_NAME} -n 100 --no-pager"
fi

# ============================================
# Step 15: Persist install metadata
# ============================================
log "🏷️  Persisting installed version metadata..."
if [ -f "$APP_DIR/version.json" ]; then
  VERSION_VALUE=$(grep '"version"' "$APP_DIR/version.json" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2 || echo "unknown")
  BUILD_DATE_VALUE=$(grep '"buildDate"' "$APP_DIR/version.json" 2>/dev/null | head -1 | sed 's/.*: *"//; s/",\?$//' || echo "unknown")
  COMMIT_VALUE=$(grep '"gitCommit"' "$APP_DIR/version.json" 2>/dev/null | head -1 | sed 's/.*: *"//; s/",\?$//' || echo "unknown")
  {
    echo "version=$VERSION_VALUE"
    echo "buildDate=$BUILD_DATE_VALUE"
    echo "gitCommit=$COMMIT_VALUE"
    echo "installedAt=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$APP_DIR/.version"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.version"
  chmod 640 "$APP_DIR/.version"
  log "   ✅ Version metadata written to $APP_DIR/.version"
else
  log "   ⚠️  version.json missing — could not persist .version metadata"
fi
write_runtime_identity
write_release_provenance
log "   ✅ Runtime marker: $RUNTIME_MARKER_FILE"
log "   ✅ Release provenance: $PROVENANCE_FILE"

# ============================================
# Step 16: Cleanup Temp Files
# ============================================
log "🧹 Cleaning up temporary files..."
rm -f /tmp/learnplay-db-credentials 2>/dev/null || true
rm -f /tmp/learnplay-perf-settings 2>/dev/null || true

# ============================================
# Step 17: Final Summary
# ============================================
log ""
log "============================================"
log "  ✅ LearnPlay Installation Complete!"
log "============================================"
log ""
log "Application:"
if [ "${LEARNPLAY_SETUP_SSL:-self-signed-https}" = "caddy-http" ]; then
  log "  URL:        https://$DOMAIN (public via Caddy), backend on http://$DOMAIN"
else
  log "  URL:        https://$DOMAIN"
fi
log "  Status:     $([ "$HEALTH_OK" = true ] && echo "✅ Running" || echo "⚠️  Check logs")"
log "  API Keys:   Customer-provided"
log "  Version:    $(cat "$APP_DIR/version.json" 2>/dev/null | grep version | head -1 | tr -d ' ",' | cut -d: -f2 || echo 'unknown')"
log ""
log "Management:"
log "  Service status: sudo systemctl status ${APP_SERVICE_NAME} --no-pager"
log "  Service logs:   sudo journalctl -u ${APP_SERVICE_NAME} -f --no-pager"
log "  Restart:        sudo systemctl restart ${APP_SERVICE_NAME}"
log "  Stop:           sudo systemctl stop ${APP_SERVICE_NAME}"
log ""
log "Important Paths:"
log "  Application:  $APP_DIR"
log "  Environment:  $APP_DIR/.env"
log "  Uploads:      $UPLOAD_DIR"
log "  Backups:      ${BACKUP_DIR}"
log "  Key Files:    /opt/learnplay/keys/"
log "  Logs:         /var/log/$APP_NAME"
if [ -n "$PROVISION_BUNDLE" ]; then
  log "  Bundle:       $PROVISION_BUNDLE (detected)"
fi
log ""
log "⚠️  NEXT STEPS:"
if [ "${LEARNPLAY_SETUP_SSL:-self-signed-https}" = "caddy-http" ]; then
  log "  1. Verify HTTPS through Caddy at https://$DOMAIN"
else
  log "  1. Verify the application at https://$DOMAIN"
fi
log "  2. Set up your SSH keys for this server"
log "  3. Run security-lockdown.sh to enforce EU security standards:"
log "     sudo bash $APP_DIR/scripts/security-lockdown.sh"
log ""
