#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
SCOPED_APP_DIR="/opt/learnplay/onprem"
LEGACY_APP_DIR_ONPREM="/opt/learnplay-onprem"
LEGACY_APP_DIR_SHARED="/opt/learnplay"
resolve_onprem_app_dir() {
  if [ -n "${LEARNPLAY_APP_DIR:-}" ]; then
    echo "$LEARNPLAY_APP_DIR"
    return 0
  fi
  if [ -f "${SCOPED_APP_DIR}/.env" ] || [ -d "${SCOPED_APP_DIR}" ]; then
    echo "${SCOPED_APP_DIR}"
    return 0
  fi
  # Enforce scoped runtime path for all installs and updates.
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

is_internal_learnplay_dev_host() {
  [ -d "/antigravity/Cloud-On-Prem" ] && [ -f "/antigravity/devadmin.sh" ]
}

update_invoker_user() {
  if [ -n "${LEARNPLAY_UPDATE_ACTOR_OVERRIDE:-}" ]; then
    echo "${LEARNPLAY_UPDATE_ACTOR_OVERRIDE}"
    return 0
  fi
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    echo "$SUDO_USER"
    return 0
  fi
  id -un 2>/dev/null || echo "unknown"
}

enforce_update_actor_policy() {
  local actor
  actor="$(update_invoker_user)"
  if is_internal_learnplay_dev_host; then
    case "$actor" in
      devadmin|lppadmin) return 0 ;;
      *)
        echo "❌ Internal DEV update policy: only devadmin or lppadmin may run update deployments (detected: ${actor})."
        exit 1
        ;;
    esac
  fi

  if [ "$actor" != "lppadmin" ]; then
    echo "❌ External on-prem update policy: only lppadmin may run update deployments (detected: ${actor})."
    exit 1
  fi
}

enforce_update_actor_policy

resolve_db_name() {
  local db_url raw db_name
  if [ -f "$ENV_FILE" ]; then
    db_url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  fi
  if [ -n "${db_url:-}" ]; then
    raw="${db_url#*://}"
    raw="${raw#*@}"
    raw="${raw#*/}"
    raw="${raw%%\?*}"
    raw="${raw%%\#*}"
    db_name="${raw%%/*}"
    if [ -n "$db_name" ]; then
      echo "$db_name"
      return 0
    fi
  fi
  echo "$APP_NAME"
}

resolve_db_url() {
  local db_url=""
  if [ -f "$ENV_FILE" ]; then
    db_url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  fi
  echo "$db_url"
}

resolve_db_owner() {
  local db_url raw userinfo owner
  db_url="$(resolve_db_url)"
  if [ -n "${db_url:-}" ]; then
    raw="${db_url#*://}"
    userinfo="${raw%%@*}"
    if [ "$userinfo" != "$raw" ] && [ -n "$userinfo" ]; then
      owner="${userinfo%%:*}"
      if [ -n "$owner" ]; then
        echo "$owner"
        return 0
      fi
    fi
  fi
  echo "$APP_USER"
}

enforce_onprem_env_key_true() {
  local key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return 0
  fi

  local current
  current="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)"

  if [ -z "$current" ]; then
    echo "${key}=true" >> "$ENV_FILE"
    ok "Set ${key}=true (mandatory)"
    return 0
  fi

  if [ "${current,,}" != "true" ]; then
    sed -i "s/^${key}=.*/${key}=true/" "$ENV_FILE"
    warn "Updated ${key}=${current} -> true (mandatory on onprem)"
  fi
}

ensure_onprem_runtime_flags_mandatory() {
  if [ ! -f "$ENV_FILE" ]; then
    return 0
  fi
  enforce_onprem_env_key_true "ONPREM_MODE"
  enforce_onprem_env_key_true "ONPREM_LICENSE_ENFORCEMENT"
  local sync_secret=""
  sync_secret="$(grep -E '^ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true)"
  if [ -z "$sync_secret" ]; then
    local env_sync_secret="${LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD:-}"
    if [ -n "${env_sync_secret:-}" ]; then
      echo "ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD=${env_sync_secret}" >> "$ENV_FILE"
      ok "Set ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD from install/update environment"
    else
      warn "ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD is not configured. Shared-mode bootstrap auth to Cloud PRD will be unavailable; per-system sync credentials remain supported."
    fi
  fi
}

migrate_legacy_onprem_layout_if_needed() {
  if [ "$APP_DIR" != "$SCOPED_APP_DIR" ]; then
    return 0
  fi
  if [ -f "${SCOPED_APP_DIR}/.env" ]; then
    return 0
  fi

  local source_dir=""
  if [ -f "${LEGACY_APP_DIR_ONPREM}/.env" ]; then
    source_dir="${LEGACY_APP_DIR_ONPREM}"
  elif [ -f "${LEGACY_APP_DIR_SHARED}/.env" ]; then
    source_dir="${LEGACY_APP_DIR_SHARED}"
  fi
  if [ -z "$source_dir" ]; then
    return 0
  fi

  echo "ℹ️  Migrating legacy runtime layout: ${source_dir} -> ${SCOPED_APP_DIR}"
  mkdir -p "${SCOPED_APP_DIR}"

  local items=(
    ".env"
    ".runtime-identity.json"
    ".release-provenance.json"
    ".dist-source"
    "version.json"
    "release-manifest.json"
    "package-inventory.txt"
    "package-checksums.sha256"
    "server"
    "client"
    "scripts"
    "migrations"
    "uploads"
    "data"
    "node_modules"
    "package.json"
    "package-lock.json"
    "ecosystem.config.cjs"
  )
  local item
  for item in "${items[@]}"; do
    if [ -e "${source_dir}/${item}" ] && [ ! -e "${SCOPED_APP_DIR}/${item}" ]; then
      mv "${source_dir}/${item}" "${SCOPED_APP_DIR}/${item}"
    fi
  done

  APP_DIR="${SCOPED_APP_DIR}"
  ENV_FILE="${APP_DIR}/.env"
}

migrate_legacy_onprem_layout_if_needed
DB_NAME="$(resolve_db_name)"
DB_URL="$(resolve_db_url)"

APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    APP_USER="${SUDO_USER}"
  else
    APP_USER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || true)"
    if [ -z "$APP_USER" ] || [ "$APP_USER" = "root" ]; then
      APP_USER="lppadmin"
    fi
  fi
fi
DB_OWNER="$(resolve_db_owner)"
APP_USER_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)"
if [ -z "$APP_USER_HOME" ]; then
  APP_USER_HOME="/home/$APP_USER"
fi
UPLOAD_DIR="${UPLOAD_DIR:-${APP_DIR}/uploads}"
BACKUP_DIR="$(resolve_backup_dir)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-learnplay-onprem}"
# Legacy full schema replay/pruning path is retired; update flow uses schema-contract-first
# reconciliation only via migration runner + runtime contract verification.
REQUESTED_FULL_SCHEMA_RECONCILIATION="${LEARNPLAY_APPLY_FULL_SCHEMA_RECONCILIATION:-false}"
LEARNPLAY_APPLY_FULL_SCHEMA_RECONCILIATION="false"
if [ "$REQUESTED_FULL_SCHEMA_RECONCILIATION" = "true" ]; then
  echo "❌ LEARNPLAY_APPLY_FULL_SCHEMA_RECONCILIATION is no longer supported in update flow."
  echo "   Use packaged schema contract reconciliation (default behavior)."
  exit 1
fi

is_systemd_app_service() {
  systemctl list-unit-files "${APP_SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "^${APP_SERVICE_NAME}\\.service"
}

resolve_app_port() {
  local app_port=""
  if [ -f "$ENV_FILE" ]; then
    app_port="$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"' | tr -d "'" || true)"
  fi
  app_port="${app_port:-3000}"
  echo "$app_port"
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

ensure_systemd_app_service() {
  local app_port unit_file app_log_dir app_log_file
  app_port="$(resolve_app_port)"
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
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
UPDATE_LOG="$BACKUP_DIR/update_${TIMESTAMP}.log"
AUTO_YES=false
ROLLBACK_DB=false
UPDATE_COMPONENT="all"
UPDATE_TX_ID="onprem-${TIMESTAMP}-$RANDOM"
RUNTIME_MARKER_FILE="${APP_DIR}/.runtime-identity.json"
PROVENANCE_FILE="${APP_DIR}/.release-provenance.json"
UPDATE_APP_PORT="3000"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$UPDATE_LOG"; }

database_size_bytes() {
  local bytes
  bytes="$(sudo -u postgres psql -d postgres -tAc "SELECT pg_database_size('${DB_NAME}');" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$bytes" =~ ^[0-9]+$ ]]; then
    echo "$bytes"
  else
    echo "0"
  fi
}

pg_dump_with_progress() {
  local output_file="$1"
  local estimated_bytes current_bytes dump_pid next_pct rc
  estimated_bytes="$(database_size_bytes)"
  next_pct=0

  echo "DB_DUMP (BACKUP) : 0% Complete..."
  sudo -u postgres pg_dump "$DB_NAME" > "$output_file" 2>/dev/null &
  dump_pid=$!

  while kill -0 "$dump_pid" >/dev/null 2>&1; do
    if [ "$estimated_bytes" -gt 0 ] && [ -f "$output_file" ]; then
      current_bytes="$(stat -c%s "$output_file" 2>/dev/null || echo 0)"
      if [[ "$current_bytes" =~ ^[0-9]+$ ]]; then
        local pct
        pct=$(( current_bytes * 100 / estimated_bytes ))
        [ "$pct" -gt 99 ] && pct=99
        while [ "$pct" -ge "$next_pct" ] && [ "$next_pct" -lt 100 ]; do
          if [ "$next_pct" -gt 0 ]; then
            echo "DB_DUMP (BACKUP) : ${next_pct}% Complete..."
          fi
          next_pct=$((next_pct + 10))
        done
      fi
    fi
    sleep 1
  done

  wait "$dump_pid"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "DB_DUMP (BACKUP) : 100% Complete..."
  fi
  return "$rc"
}

ensure_platform_superadmin() {
  local superadmin_email="admin@learnplay.co.za"
  local sql_hash=""
  local existing_count="0"
  local master_hash=""

  existing_count="$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM users WHERE lower(email)=lower('${superadmin_email}')" 2>/dev/null | tr -d '[:space:]' || echo "0")"

  if [ "${existing_count:-0}" -eq 0 ]; then
    master_hash="$(grep -E '^MASTER_PASSWORD_HASH=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
    if [ -n "$master_hash" ] && [[ "$master_hash" == \$2* ]]; then
      sql_hash="${master_hash//\'/\'\'}"
    fi
  fi

  if sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<EOSQL
DO \$\$
DECLARE
  has_failed_login_attempts boolean;
  has_locked_until boolean;
  has_is_locked boolean;
  has_is_disabled boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE lower(email)=lower('${superadmin_email}')) THEN
    UPDATE users
    SET
      "gamerName" = 'superadmin',
      "firstName" = 'LearnPlay',
      "lastName" = 'SuperAdmin',
      "isSuperAdmin" = true,
      "isCustSuper" = false,
      "emailVerified" = true
    WHERE lower(email)=lower('${superadmin_email}');
  ELSE
    INSERT INTO users (id, "gamerName", email, password, "firstName", "lastName", "isSuperAdmin", "isCustSuper", "emailVerified")
    VALUES (
      gen_random_uuid()::text,
      'superadmin',
      '${superadmin_email}',
      CASE
        WHEN '${sql_hash}' <> '' THEN '${sql_hash}'
        ELSE crypt('learnplayadmin', gen_salt('bf'))
      END,
      'LearnPlay',
      'SuperAdmin',
      true,
      false,
      true
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='failedLoginAttempts'
  ) INTO has_failed_login_attempts;
  IF has_failed_login_attempts THEN
    EXECUTE 'UPDATE users SET "failedLoginAttempts" = 0 WHERE lower(email)=lower(''' || '${superadmin_email}' || ''')';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='lockedUntil'
  ) INTO has_locked_until;
  IF has_locked_until THEN
    EXECUTE 'UPDATE users SET "lockedUntil" = NULL WHERE lower(email)=lower(''' || '${superadmin_email}' || ''')';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='isLocked'
  ) INTO has_is_locked;
  IF has_is_locked THEN
    EXECUTE 'UPDATE users SET "isLocked" = false WHERE lower(email)=lower(''' || '${superadmin_email}' || ''')';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='isDisabled'
  ) INTO has_is_disabled;
  IF has_is_disabled THEN
    EXECUTE 'UPDATE users SET "isDisabled" = false WHERE lower(email)=lower(''' || '${superadmin_email}' || ''')';
  END IF;
END
\$\$;
EOSQL
  then
    return 0
  fi

  return 1
}

ensure_support_bootstrap_user() {
  local supportEmail="support@learnplay.co.za"
  local supportHashDefault='$2b$10$p9i86UUxH83d6tuhn0BG3OHHUtVOj6IrfcwRMdbc1Sg.4Y42OHJ/W'
  local supportHash=""
  local sqlSupportHash=""

  supportHash="$(grep -E '^SUPPORT_BOOTSTRAP_PASSWORD_HASH=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  supportHash="${supportHash%\"}"
  supportHash="${supportHash#\"}"
  supportHash="$(echo "$supportHash" | tr -d '[:space:]')"
  if [ -z "$supportHash" ] || [[ "$supportHash" != \$2* ]]; then
    supportHash="$supportHashDefault"
  fi
  sqlSupportHash="${supportHash//\'/\'\'}"

  if sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<EOSQL
DO \$\$
DECLARE
  has_failed_login_attempts boolean;
  has_locked_until boolean;
  has_is_locked boolean;
  has_is_disabled boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE lower(email)=lower('${supportEmail}')) THEN
    UPDATE users
    SET
      "gamerName" = 'support',
      "firstName" = 'LearnPlay',
      "lastName" = 'Support',
      "isSuperAdmin" = false,
      "isCustSuper" = true,
      "emailVerified" = true,
      password = '${sqlSupportHash}'
    WHERE lower(email)=lower('${supportEmail}');
  ELSE
    INSERT INTO users (id, "gamerName", email, password, "firstName", "lastName", "isSuperAdmin", "isCustSuper", "emailVerified")
    VALUES (
      gen_random_uuid()::text,
      'support',
      '${supportEmail}',
      '${sqlSupportHash}',
      'LearnPlay',
      'Support',
      false,
      true,
      true
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='failedLoginAttempts'
  ) INTO has_failed_login_attempts;
  IF has_failed_login_attempts THEN
    EXECUTE 'UPDATE users SET "failedLoginAttempts" = 0 WHERE lower(email)=lower(''' || '${supportEmail}' || ''')';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='lockedUntil'
  ) INTO has_locked_until;
  IF has_locked_until THEN
    EXECUTE 'UPDATE users SET "lockedUntil" = NULL WHERE lower(email)=lower(''' || '${supportEmail}' || ''')';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='isLocked'
  ) INTO has_is_locked;
  IF has_is_locked THEN
    EXECUTE 'UPDATE users SET "isLocked" = false WHERE lower(email)=lower(''' || '${supportEmail}' || ''')';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='isDisabled'
  ) INTO has_is_disabled;
  IF has_is_disabled THEN
    EXECUTE 'UPDATE users SET "isDisabled" = false WHERE lower(email)=lower(''' || '${supportEmail}' || ''')';
  END IF;
END
\$\$;
EOSQL
  then
    return 0
  fi

  return 1
}

json_field() {
  local key="$1"
  local file="$2"
  grep -oP "\"${key}\"\\s*:\\s*\"\\K[^\"]+" "$file" 2>/dev/null | head -1 || true
}

validate_runtime_identity_for_update() {
  local marker_product
  if [ ! -f "$RUNTIME_MARKER_FILE" ]; then
    return 0
  fi
  marker_product="$(json_field "product" "$RUNTIME_MARKER_FILE")"
  if [ -n "$marker_product" ] && [ "$marker_product" != "onprem" ]; then
    fail "Runtime identity mismatch: marker product is '$marker_product', expected 'onprem'"
    return 1
  fi
  return 0
}

write_runtime_identity() {
  local now version build_id system_type
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  version="$(get_version_from "$APP_DIR")"
  build_id="$(get_build_date_from "$APP_DIR")"
  system_type="$(get_env_value SYSTEM_TYPE)"
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
  chmod 640 "$RUNTIME_MARKER_FILE" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$RUNTIME_MARKER_FILE" 2>/dev/null || true
}

write_release_provenance() {
  local now version build_date manifest_version manifest_min system_type
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  version="$(get_version_from "$APP_DIR")"
  build_date="$(get_build_date_from "$APP_DIR")"
  manifest_version="$(manifest_field "version" "$MANIFEST_FILE")"
  manifest_min="$(manifest_field "minSupportedVersion" "$MANIFEST_FILE")"
  system_type="$(get_env_value SYSTEM_TYPE)"
  system_type="${system_type:-production}"
  cat > "$PROVENANCE_FILE" <<EOF
{
  "transactionId": "${UPDATE_TX_ID}",
  "product": "onprem",
  "systemType": "${system_type}",
  "action": "update",
  "timestamp": "${now}",
  "runtimeRoot": "${APP_DIR}",
  "backupRoot": "${BACKUP_DIR}",
  "installedVersion": "${version}",
  "buildDate": "${build_date}",
  "manifestVersion": "${manifest_version}",
  "manifestMinSupportedVersion": "${manifest_min}",
  "lppadminVersion": "${LPPADMIN_VERSION:-unknown}"
}
EOF
  chmod 640 "$PROVENANCE_FILE" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$PROVENANCE_FILE" 2>/dev/null || true
}

check_backup_volume_guardrails() {
  local usage
  usage="$(df -P "$BACKUP_DIR" 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}' || echo "0")"
  usage="${usage:-0}"
  if [ "$usage" -ge 95 ]; then
    fail "Backup volume usage is ${usage}% (>=95%). Free space before updating."
    return 1
  fi
  if [ "$usage" -ge 80 ]; then
    warn "Backup volume usage is ${usage}% (warning threshold 80%)."
  fi
  return 0
}

apply_backup_retention() {
  local now keep_days max_weeks daily_cap max_snapshots path ts epoch age_days week_key day_key
  now="$(date +%s)"
  keep_days="${LEARNPLAY_BACKUP_RETENTION_DAYS:-3}"
  max_weeks="${LEARNPLAY_BACKUP_RETENTION_WEEKS:-4}"
  daily_cap="${LEARNPLAY_BACKUP_RETENTION_DAILY_CAP:-2}"
  max_snapshots="${LEARNPLAY_BACKUP_RETENTION_MAX_SNAPSHOTS:-20}"
  [[ "$keep_days" =~ ^[0-9]+$ ]] || keep_days=3
  [[ "$max_weeks" =~ ^[0-9]+$ ]] || max_weeks=4
  [[ "$daily_cap" =~ ^[0-9]+$ ]] || daily_cap=2
  [[ "$max_snapshots" =~ ^[0-9]+$ ]] || max_snapshots=20
  [ "$daily_cap" -ge 1 ] || daily_cap=1
  [ "$max_snapshots" -ge 5 ] || max_snapshots=5
  declare -A keep_map=()
  declare -A week_kept=()
  declare -A day_kept=()
  declare -a paths=()
  mapfile -t paths < <(ls -1dt "$BACKUP_DIR"/backup_* 2>/dev/null || true)
  [ "${#paths[@]}" -gt 0 ] || return 0

  local kept=0
  for path in "${paths[@]}"; do
    ts="$(basename "$path" | sed -n 's/^backup_\([0-9]\{8\}_[0-9]\{6\}\).*$/\1/p')"
    if [ -z "$ts" ]; then
      continue
    fi
    epoch="$(date -d "${ts:0:8} ${ts:9:2}:${ts:11:2}:${ts:13:2}" +%s 2>/dev/null || echo 0)"
    [ "$epoch" -gt 0 ] || continue
    age_days=$(( (now - epoch) / 86400 ))
    if [ "$age_days" -le "$keep_days" ]; then
      day_key="$(date -u -d "@$epoch" +%Y-%m-%d 2>/dev/null || true)"
      if [ -n "$day_key" ]; then
        day_kept["$day_key"]=$(( ${day_kept["$day_key"]:-0} + 1 ))
        if [ "${day_kept["$day_key"]}" -le "$daily_cap" ]; then
          keep_map["$path"]=1
          kept=$((kept + 1))
        fi
      fi
      continue
    fi
    week_key="$(date -u -d "@$epoch" +%G-%V 2>/dev/null || true)"
    if [ -n "$week_key" ] && [ "${#week_kept[@]}" -lt "$max_weeks" ] && [ -z "${week_kept[$week_key]:-}" ]; then
      week_kept["$week_key"]=1
      keep_map["$path"]=1
      kept=$((kept + 1))
    fi
  done

  local kept_budget=0
  for path in "${paths[@]}"; do
    if [ -n "${keep_map[$path]:-}" ]; then
      kept_budget=$((kept_budget + 1))
      if [ "$kept_budget" -gt "$max_snapshots" ]; then
        unset 'keep_map[$path]'
      fi
    fi
  done

  kept=0
  for path in "${paths[@]}"; do
    if [ -n "${keep_map[$path]:-}" ]; then
      kept=$((kept + 1))
    else
      rm -rf "$path" 2>/dev/null || true
    fi
  done
  log "Backup retention applied (kept ${kept} snapshots: ${keep_days}d/${daily_cap}-per-day + ${max_weeks} weekly, max ${max_snapshots})"
}

apply_runtime_space_optimization() {
  local release_keep update_log_keep staging_days path
  release_keep="${LEARNPLAY_RELEASE_RETENTION_COUNT:-8}"
  update_log_keep="${LEARNPLAY_UPDATE_LOG_RETENTION_COUNT:-60}"
  staging_days="${LEARNPLAY_STAGING_RETENTION_DAYS:-2}"
  [[ "$release_keep" =~ ^[0-9]+$ ]] || release_keep=8
  [[ "$update_log_keep" =~ ^[0-9]+$ ]] || update_log_keep=60
  [[ "$staging_days" =~ ^[0-9]+$ ]] || staging_days=2
  [ "$release_keep" -ge 3 ] || release_keep=3
  [ "$update_log_keep" -ge 20 ] || update_log_keep=20
  [ "$staging_days" -ge 1 ] || staging_days=1

  if [ -d "${APP_DIR}/releases" ]; then
    local removed_release=0
    mapfile -t release_archives < <(ls -1t "${APP_DIR}"/releases/LP-OP-V*.tar.gz 2>/dev/null || true)
    if [ "${#release_archives[@]}" -gt "$release_keep" ]; then
      for path in "${release_archives[@]:$release_keep}"; do
        rm -f "$path" "${path}.sha256" 2>/dev/null || true
        removed_release=$((removed_release + 1))
      done
    fi
    log "Release retention applied (kept ${release_keep}, removed ${removed_release})"
  fi

  local removed_logs=0
  mapfile -t update_logs < <(ls -1t "${BACKUP_DIR}"/update_*.log 2>/dev/null || true)
  if [ "${#update_logs[@]}" -gt "$update_log_keep" ]; then
    for path in "${update_logs[@]:$update_log_keep}"; do
      rm -f "$path" 2>/dev/null || true
      removed_logs=$((removed_logs + 1))
    done
  fi
  log "Update-log retention applied (kept ${update_log_keep}, removed ${removed_logs})"

  find /tmp /var/tmp -maxdepth 1 -mindepth 1 -type d -name 'dist-onprem*' -mtime +"$staging_days" -exec rm -rf {} + 2>/dev/null || true
  if [ "${LEARNPLAY_CLEAN_APT_CACHE:-true}" = "true" ] && command -v apt-get >/dev/null 2>&1; then
    apt-get clean >> "$UPDATE_LOG" 2>&1 || true
  fi
}

get_env_value() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
  fi
}

step() {
  local num="$1"; shift
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Step $num: $*${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  log "Step $num: $*"
}

fail() { echo -e "${RED}❌ $*${NC}"; log "FAILED: $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; log "OK: $*"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; log "WARN: $*"; }
info() { echo -e "${CYAN}ℹ️  $*${NC}"; }

ensure_required_supported_languages() {
  echo -n "  Ensuring required supported languages... "
  if sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 >>"$UPDATE_LOG" 2>&1 <<'EOSQL_LANGUAGES'; then
DO $$
BEGIN
  WITH ranked AS (
    SELECT ctid, code, ROW_NUMBER() OVER (PARTITION BY code ORDER BY ctid) AS rn
    FROM "supportedLanguages"
    WHERE code IS NOT NULL
  )
  DELETE FROM "supportedLanguages" sl
  USING ranked r
  WHERE sl.ctid = r.ctid
    AND r.rn > 1;

  ALTER TABLE ONLY "supportedLanguages"
    ADD CONSTRAINT "supportedLanguages_pkey" PRIMARY KEY (code);
EXCEPTION
  WHEN duplicate_object OR invalid_table_definition THEN
    NULL;
END
$$;

INSERT INTO "supportedLanguages" (code, name, "nativeName", region, "isActive", "sortOrder", "createdAt")
VALUES
  ('en', 'English', 'English', 'Global', true, 0, NOW()),
  ('af', 'Afrikaans', 'Afrikaans', 'Africa', true, 1, NOW()),
  ('zu', 'isiZulu', 'isiZulu', 'Africa', true, 2, NOW()),
  ('xh', 'isiXhosa', 'isiXhosa', 'Africa', true, 3, NOW()),
  ('sw', 'Kiswahili', 'Kiswahili', 'Africa', true, 4, NOW()),
  ('ar', 'Arabic', 'Arabic', 'Middle East', true, 5, NOW()),
  ('fr', 'French', 'Francais', 'Europe', true, 6, NOW()),
  ('de', 'German', 'Deutsch', 'Europe', true, 7, NOW()),
  ('es', 'Spanish', 'Espanol', 'Europe', true, 8, NOW()),
  ('it', 'Italian', 'Italiano', 'Europe', true, 9, NOW()),
  ('pt', 'Portuguese', 'Portugues', 'Europe', true, 10, NOW()),
  ('nl', 'Dutch', 'Nederlands', 'Europe', true, 11, NOW()),
  ('pl', 'Polish', 'Polski', 'Europe', true, 12, NOW()),
  ('ro', 'Romanian', 'Romana', 'Europe', true, 13, NOW()),
  ('el', 'Greek', 'Greek', 'Europe', true, 14, NOW()),
  ('cs', 'Czech', 'Cestina', 'Europe', true, 15, NOW()),
  ('hu', 'Hungarian', 'Magyar', 'Europe', true, 16, NOW()),
  ('sv', 'Swedish', 'Svenska', 'Europe', true, 17, NOW()),
  ('da', 'Danish', 'Dansk', 'Europe', true, 18, NOW()),
  ('fi', 'Finnish', 'Suomi', 'Europe', true, 19, NOW()),
  ('sk', 'Slovak', 'Slovencina', 'Europe', true, 20, NOW()),
  ('bg', 'Bulgarian', 'Bulgarian', 'Europe', true, 21, NOW()),
  ('hr', 'Croatian', 'Hrvatski', 'Europe', true, 22, NOW()),
  ('lt', 'Lithuanian', 'Lietuviu', 'Europe', true, 23, NOW()),
  ('sl', 'Slovenian', 'Slovenscina', 'Europe', true, 24, NOW()),
  ('lv', 'Latvian', 'Latviesu', 'Europe', true, 25, NOW()),
  ('et', 'Estonian', 'Eesti', 'Europe', true, 26, NOW()),
  ('ga', 'Irish', 'Gaeilge', 'Europe', true, 27, NOW()),
  ('mt', 'Maltese', 'Malti', 'Europe', true, 28, NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    "nativeName" = EXCLUDED."nativeName",
    region = EXCLUDED.region,
    "isActive" = true,
    "sortOrder" = EXCLUDED."sortOrder";
EOSQL_LANGUAGES
    ok "Ready"
  else
    fail "Supported language required-data step failed — check $UPDATE_LOG"
    return 1
  fi
}

stage_new_update_script() {
  if [ -f "$DIST_DIR/scripts/update.sh" ]; then
    cp -f "$DIST_DIR/scripts/update.sh" "$APP_DIR/scripts/update.sh.next"
    chmod 0755 "$APP_DIR/scripts/update.sh.next" || true
    chown "$APP_USER:$APP_USER" "$APP_DIR/scripts/update.sh.next" 2>/dev/null || true
  fi
}

promote_staged_update_script() {
  if [ -f "$APP_DIR/scripts/update.sh.next" ]; then
    mv -f "$APP_DIR/scripts/update.sh.next" "$APP_DIR/scripts/update.sh"
    chmod 0755 "$APP_DIR/scripts/update.sh" || true
    chown "$APP_USER:$APP_USER" "$APP_DIR/scripts/update.sh" 2>/dev/null || true
    ok "Updater script refreshed"
  fi
}

run_psql_sql() {
  local sql="$1"
  local mode="${2:-log}"
  local db_url
  db_url="$(get_env_value DATABASE_URL)"
  if [ -n "$db_url" ]; then
    if [ "$mode" = "capture" ]; then
      if sudo -u "$APP_USER" psql "$db_url" -v ON_ERROR_STOP=1 -At -c "$sql"; then
        return 0
      fi
    else
      if sudo -u "$APP_USER" psql "$db_url" -v ON_ERROR_STOP=1 -c "$sql" >> "$UPDATE_LOG" 2>&1; then
        return 0
      fi
    fi
  fi
  if [ "$mode" = "capture" ]; then
    sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -At -c "$sql"
  else
    sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$sql" >> "$UPDATE_LOG" 2>&1
  fi
}

run_psql_file() {
  local sql_file="$1"
  local db_url
  db_url="$(get_env_value DATABASE_URL)"
  if [ -n "$db_url" ]; then
    if sudo -u "$APP_USER" psql "$db_url" -v ON_ERROR_STOP=1 -f "$sql_file" >> "$UPDATE_LOG" 2>&1; then
      return 0
    fi
  fi
  sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$sql_file" >> "$UPDATE_LOG" 2>&1
}

run_psql_file_allow_duplicate_ddl() {
  local sql_file="$1"
  local db_url output_file rc filtered_errors
  db_url="$(get_env_value DATABASE_URL)"
  output_file="$(mktemp)"
  rc=0

  if [ -n "$db_url" ]; then
    sudo -u "$APP_USER" psql "$db_url" -v ON_ERROR_STOP=0 -f "$sql_file" >"$output_file" 2>&1 || rc=$?
  else
    sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=0 -f "$sql_file" >"$output_file" 2>&1 || rc=$?
  fi

  cat "$output_file" >> "$UPDATE_LOG"

  if [ "$rc" -ne 0 ]; then
    rm -f "$output_file"
    return "$rc"
  fi

  # Full contract replay is an additive safety net and may attempt to recreate
  # existing constraints/indexes. Ignore only duplicate-object SQL errors.
  filtered_errors="$(grep 'ERROR:' "$output_file" | grep -Ev 'already exists|multiple primary keys for table' || true)"
  rm -f "$output_file"
  if [ -n "$filtered_errors" ]; then
    return 1
  fi
  return 0
}

reconcile_public_asset_links() {
  local branding_dir logo_file favicon_file logoUrl faviconUrl
  local sqlLogoUrl sqlFaviconUrl

  branding_dir="$UPLOAD_DIR/public/branding/platform"
  logo_file=""
  favicon_file=""

  if [ -d "$branding_dir" ]; then
    logo_file="$(find "$branding_dir" -maxdepth 1 -type f -name 'logo-*' 2>/dev/null | sort | tail -1 || true)"
    favicon_file="$(find "$branding_dir" -maxdepth 1 -type f -name 'favicon-*' 2>/dev/null | sort | tail -1 || true)"
  fi

  logoUrl=""
  faviconUrl=""
  if [ -n "$logo_file" ]; then
    logoUrl="/api/public/branding/platform/$(basename "$logo_file")"
  fi
  if [ -n "$favicon_file" ]; then
    faviconUrl="/api/public/branding/platform/$(basename "$favicon_file")"
  fi

  sqlLogoUrl="${logoUrl//\'/\'\'}"
  sqlFaviconUrl="${faviconUrl//\'/\'\'}"

  echo -n "  Reconciling branding/gamma asset links... "
  if run_psql_sql "
DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='brandingThemes'
  ) THEN
    IF EXISTS (SELECT 1 FROM \"brandingThemes\" WHERE \"organizationId\" IS NULL) THEN
      UPDATE \"brandingThemes\"
      SET
        status = 'active',
        \"orgName\" = COALESCE(NULLIF(\"orgName\", ''), 'LearnPlay'),
        \"logoUrl\" = COALESCE(NULLIF(\"logoUrl\", ''), NULLIF('${sqlLogoUrl}', '')),
        \"faviconUrl\" = COALESCE(NULLIF(\"faviconUrl\", ''), NULLIF('${sqlFaviconUrl}', '')),
        \"updatedAt\" = NOW()
      WHERE \"organizationId\" IS NULL;
    ELSE
      INSERT INTO \"brandingThemes\" (
        id, \"organizationId\", \"orgName\", status, tokens, \"logoUrl\", \"faviconUrl\", \"fontHeading\", \"fontBody\",
        \"allowEmailBranding\", \"enableContrastCorrections\", \"customCopy\"
      ) VALUES (
        gen_random_uuid()::text, NULL, 'LearnPlay', 'active', '{}'::jsonb,
        NULLIF('${sqlLogoUrl}', ''), NULLIF('${sqlFaviconUrl}', ''),
        'Inter', 'Inter', false, true, '{}'::jsonb
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='gammaImageStyles'
  ) THEN
    INSERT INTO \"gammaImageStyles\" (
      id, \"styleKey\", \"displayName\", description, \"thumbnailUrl\", \"recommendedUseCases\",
      source, \"isActive\", weight, \"lastSyncedAt\", \"createdAt\", \"updatedAt\"
    )
    VALUES
      (
        gen_random_uuid()::text, 'photorealistic', 'Photorealistic', 'High-quality realistic images',
        '/api/public-objects/gamma/image-styles/photorealistic.jpeg',
        '[\"Professional presentations\",\"Business reports\",\"Academic content\"]'::jsonb,
        'manual', true, 100, NULL, NOW(), NOW()
      ),
      (
        gen_random_uuid()::text, 'illustrated', 'Illustrated', 'Hand-drawn, artistic illustrations',
        '/api/public-objects/gamma/image-styles/illustrated.jpeg',
        '[\"Creative projects\",\"Storytelling\",\"Educational content\"]'::jsonb,
        'manual', true, 80, NULL, NOW(), NOW()
      ),
      (
        gen_random_uuid()::text, 'minimal', 'Minimal', 'Clean, simple, minimalist design',
        '/api/public-objects/gamma/image-styles/minimal.jpeg',
        '[\"Modern presentations\",\"Startup pitches\",\"Tech content\"]'::jsonb,
        'manual', true, 60, NULL, NOW(), NOW()
      ),
      (
        gen_random_uuid()::text, 'corporate', 'Corporate', 'Professional business-style images',
        '/api/public-objects/gamma/image-styles/corporate.jpeg',
        '[\"Business meetings\",\"Corporate training\",\"Financial reports\"]'::jsonb,
        'manual', true, 40, NULL, NOW(), NOW()
      ),
      (
        gen_random_uuid()::text, 'playful', 'Playful', 'Fun and creative cartoon-style images',
        '/api/public-objects/gamma/image-styles/playful.jpeg',
        '[\"Children''s content\",\"Creative projects\",\"Casual presentations\"]'::jsonb,
        'manual', true, 20, NULL, NOW(), NOW()
      )
    ON CONFLICT (\"styleKey\") DO UPDATE
      SET
        \"displayName\" = EXCLUDED.\"displayName\",
        description = EXCLUDED.description,
        \"recommendedUseCases\" = EXCLUDED.\"recommendedUseCases\",
        source = EXCLUDED.source,
        \"isActive\" = EXCLUDED.\"isActive\",
        weight = EXCLUDED.weight,
        \"thumbnailUrl\" = COALESCE(NULLIF(\"gammaImageStyles\".\"thumbnailUrl\", ''), EXCLUDED.\"thumbnailUrl\"),
        \"updatedAt\" = NOW();
  END IF;
END
\$\$;
"; then
    ok "Done"
  else
    warn "Asset link reconciliation failed (continuing)"
  fi
}

EXPECTED_CONTRACT_PRODUCT="onprem"
read_expected_schema_fingerprint() {
  local contract_file="${DIST_DIR}/schema-contract.env"
  local legacy_file="${DIST_DIR}/schema-fingerprint.env"
  local selected_file=""

  if [ -f "$contract_file" ]; then
    selected_file="$contract_file"
  elif [ -f "$legacy_file" ]; then
    selected_file="$legacy_file"
  else
    return 1
  fi

  # shellcheck disable=SC1090
  . "$selected_file"

  if [ -f "$contract_file" ] && [ -n "${CONTRACT_PRODUCT:-}" ]; then
    case "${CONTRACT_PRODUCT}" in
      "${EXPECTED_CONTRACT_PRODUCT}"|shared)
        ;;
      *)
        fail "Schema contract product mismatch (expected ${EXPECTED_CONTRACT_PRODUCT} or shared, got ${CONTRACT_PRODUCT})"
        return 1
        ;;
    esac
  fi
  return 0
}

capture_current_schema_fingerprint() {
  local core_table_in_list=""
  if [ -n "${EXPECTED_CORE_TABLES:-}" ]; then
    core_table_in_list="$(printf '%s' "${EXPECTED_CORE_TABLES}" | awk -F',' '
      BEGIN { first=1 }
      {
        for (i=1; i<=NF; i++) {
          t=$i
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", t)
          if (t == "") continue
          gsub(/\047/, "\047\047", t)
          if (!first) printf ","
          printf "\047%s\047", t
          first=0
        }
      }
    ')"
  fi

  CURRENT_TABLES="$(run_psql_sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" capture | tr -d '[:space:]')"
  CURRENT_COLUMNS="$(run_psql_sql "SELECT count(*) FROM information_schema.columns WHERE table_schema='public';" capture | tr -d '[:space:]')"
  CURRENT_CONSTRAINTS="$(run_psql_sql "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace;" capture | tr -d '[:space:]')"
  CURRENT_INDEXES="$(run_psql_sql "SELECT count(*) FROM pg_indexes WHERE schemaname='public';" capture | tr -d '[:space:]')"
  CURRENT_ENUMS="$(run_psql_sql "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e';" capture | tr -d '[:space:]')"
  CURRENT_SCHEMA_SIG="$(run_psql_sql "SELECT md5(string_agg(s, E'\\n' ORDER BY s)) FROM (SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public' UNION ALL SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' UNION ALL SELECT 'K|'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace UNION ALL SELECT 'I|'||schemaname||'|'||tablename||'|'||indexname||'|'||indexdef FROM pg_indexes WHERE schemaname='public' UNION ALL SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') x;" capture | tr -d '[:space:]')"
  if [ -n "$core_table_in_list" ]; then
    CURRENT_CORE_TABLES="$(run_psql_sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${core_table_in_list});" capture | tr -d '[:space:]')"
    CURRENT_CORE_COLUMNS="$(run_psql_sql "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${core_table_in_list});" capture | tr -d '[:space:]')"
    CURRENT_CORE_ENUMS="$(run_psql_sql "SELECT count(*) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.oid IN (SELECT DISTINCT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname IN (${core_table_in_list}) AND a.attnum > 0 AND NOT a.attisdropped);" capture | tr -d '[:space:]')"
    CURRENT_CORE_SCHEMA_SIG="$(run_psql_sql "SELECT md5(string_agg(s, E'\\n' ORDER BY s)) FROM (SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${core_table_in_list}) UNION ALL SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${core_table_in_list}) UNION ALL SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.oid IN (SELECT DISTINCT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname IN (${core_table_in_list}) AND a.attnum > 0 AND NOT a.attisdropped)) x;" capture | tr -d '[:space:]')"
  else
    CURRENT_CORE_TABLES="${CURRENT_TABLES}"
    CURRENT_CORE_COLUMNS="${CURRENT_COLUMNS}"
    CURRENT_CORE_ENUMS="${CURRENT_ENUMS}"
    CURRENT_CORE_SCHEMA_SIG="$(run_psql_sql "SELECT md5(string_agg(s, E'\\n' ORDER BY s)) FROM (SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public' UNION ALL SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' UNION ALL SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') x;" capture | tr -d '[:space:]')"
  fi
}

verify_schema_parity_fingerprint() {
  echo -n "  Verifying schema parity fingerprint... "
  local expected_core_sig=""
  local expected_core_tables=""
  local expected_core_columns=""
  local expected_core_enums=""
  local functional_mismatch=false
  local core_sig_mismatch=false
  local structural_minimums_mismatch=false
  local full_sig_mismatch=false
  if ! read_expected_schema_fingerprint; then
    warn "schema contract missing from package; parity check skipped"
    return 0
  fi
  capture_current_schema_fingerprint
  expected_core_sig="${EXPECTED_CORE_SCHEMA_SIG:-${EXPECTED_SCHEMA_SIG:-}}"
  expected_core_tables="${EXPECTED_CORE_TABLE_COUNT:-${EXPECTED_TABLES:-0}}"
  expected_core_columns="${EXPECTED_CORE_COLUMN_COUNT:-${EXPECTED_COLUMNS:-0}}"
  expected_core_enums="${EXPECTED_CORE_ENUM_COUNT:-${EXPECTED_ENUMS:-0}}"

  if [ "${CURRENT_CORE_TABLES:-0}" -lt "${expected_core_tables:-0}" ] || \
     [ "${CURRENT_CORE_COLUMNS:-0}" -lt "${expected_core_columns:-0}" ] || \
     [ "${CURRENT_CORE_ENUMS:-0}" -lt "${expected_core_enums:-0}" ]; then
    functional_mismatch=true
  fi
  if [ -n "$expected_core_sig" ] && [ "${CURRENT_CORE_SCHEMA_SIG:-}" != "${expected_core_sig:-}" ]; then
    core_sig_mismatch=true
  fi
  if [ "${CURRENT_CONSTRAINTS:-0}" -lt "${EXPECTED_CONSTRAINTS:-0}" ] || \
     [ "${CURRENT_INDEXES:-0}" -lt "${EXPECTED_INDEXES:-0}" ]; then
    structural_minimums_mismatch=true
  fi
  if [ "${CURRENT_SCHEMA_SIG:-}" != "${EXPECTED_SCHEMA_SIG:-}" ]; then
    full_sig_mismatch=true
  fi

  if [ "$functional_mismatch" = true ]; then
    fail "Functional schema parity mismatch (expected CORE T/C/E >= ${expected_core_tables}/${expected_core_columns}/${expected_core_enums} with sig ${expected_core_sig:-n/a}; got ${CURRENT_CORE_TABLES:-0}/${CURRENT_CORE_COLUMNS:-0}/${CURRENT_CORE_ENUMS:-0} with sig ${CURRENT_CORE_SCHEMA_SIG:-n/a})"
    fail "Update halted: apply missing migrations or repair functional schema drift before retrying."
    return 1
  fi

  if [ "$structural_minimums_mismatch" = true ]; then
    warn "Structural parity minimums mismatch for constraints/indexes (expected K/I >= ${EXPECTED_CONSTRAINTS}/${EXPECTED_INDEXES}; got ${CURRENT_CONSTRAINTS}/${CURRENT_INDEXES})"
  fi
  if [ "$core_sig_mismatch" = true ]; then
    warn "Core schema signature drift detected (expected CORE=${expected_core_sig:-n/a}; got ${CURRENT_CORE_SCHEMA_SIG:-n/a})"
  fi
  if [ "$full_sig_mismatch" = true ]; then
    warn "Functional parity satisfied; structural signature drift tolerated (extra/renamed constraints or indexes may exist)."
    return 0
  fi

  ok "Functional parity matched package baseline"
  return 0
}

extract_contract_tables() {
  local schema_file="$1"
  local out_file="$2"
  awk '
    /^CREATE TABLE / {
      if (match($0, /^CREATE TABLE (IF NOT EXISTS )?(public\.)?"?([A-Za-z0-9_]+)"? \($/, m)) {
        print m[3];
      }
    }
  ' "$schema_file" | sort -u > "$out_file"
}

extract_contract_types() {
  local schema_file="$1"
  local out_file="$2"
  awk '
    /^CREATE TYPE / {
      if (match($0, /^CREATE TYPE (IF NOT EXISTS )?(public\.)?"?([A-Za-z0-9_]+)"? /, m)) {
        print m[3];
      }
    }
  ' "$schema_file" | sort -u > "$out_file"
}

replay_full_schema_contract() {
  local schema_file="${DIST_DIR}/schema-full.sql"
  local filtered_schema=""
  echo -n "  Replaying full schema definitions... "
  if [ ! -f "$schema_file" ]; then
    fail "schema-full.sql missing from package ($schema_file)"
    return 1
  fi
  filtered_schema="$(mktemp)"
  # Internal drizzle journal tables are managed by migrate.js.
  # Exclude them from full schema replay to avoid duplicate PK/sequence DDL conflicts.
  awk '
    BEGIN { skip_tbl=0; skip_seq=0 }
    skip_seq==1 {
      if ($0 ~ /;[[:space:]]*$/) {
        skip_seq=0
      }
      next
    }
    skip_tbl==1 {
      if ($0 ~ /^\);$/) {
        skip_tbl=0
      }
      next
    }
    $0 ~ /^CREATE TABLE( IF NOT EXISTS)? "?__drizzle_migrations"? \($/ {
      skip_tbl=1
      next
    }
    $0 ~ /^CREATE SEQUENCE( IF NOT EXISTS)? "?__drizzle_migrations[^"]*"?/ {
      skip_seq=1
      next
    }
    $0 ~ /__drizzle_migrations/ { next }
    { print }
  ' "$schema_file" > "$filtered_schema"
  chmod 0644 "$filtered_schema" 2>/dev/null || true
  if run_psql_file_allow_duplicate_ddl "$filtered_schema"; then
    rm -f "$filtered_schema"
    ok "Done"
    return 0
  fi
  rm -f "$filtered_schema"
  if [ "${LEARNPLAY_SCHEMA_REPLAY_STRICT:-false}" = "true" ]; then
    fail "Full schema replay failed"
    return 1
  fi
  warn "Full schema replay reported non-fatal conflicts; continuing (set LEARNPLAY_SCHEMA_REPLAY_STRICT=true to enforce)"
  return 0
}

resolve_known_schema_data_conflicts() {
  local enabled="${LEARNPLAY_SCHEMA_AUTOFIX_CONFLICTS:-true}"
  local schema_file="${DIST_DIR}/schema-full.sql"
  local legacy_schema="${LEARNPLAY_SCHEMA_LEGACY_SCHEMA:-learnplay_legacy_archive}"
  local unique_cols_file
  local table col type_info data_type udt_name max_len
  local dup_count archive_table archive_name
  local resolved_groups=0
  local unresolved_groups=0

  if [ "$enabled" != "true" ]; then
    return 0
  fi
  if [ ! -f "$schema_file" ]; then
    return 0
  fi

  extract_contract_unique_single_columns() {
    local in_file="$1"
    local out_file="$2"
    awk '
      BEGIN { tbl="" }
      /^ALTER TABLE( ONLY)? / {
        if (match($0, /^ALTER TABLE( ONLY)? "?([A-Za-z0-9_]+)"?$/, m)) {
          tbl=m[2];
        } else {
          tbl="";
        }
        next;
      }
      tbl!="" && /ADD CONSTRAINT/ && / UNIQUE \(/ {
        if (match($0, /UNIQUE \("([^"]+)"\)/, u)) {
          print tbl "|" u[1];
        } else if (match($0, /UNIQUE \(([A-Za-z0-9_]+)\)/, u2)) {
          print tbl "|" u2[1];
        }
        next;
      }
      /^CREATE UNIQUE INDEX / {
        if (match($0, / ON "?([A-Za-z0-9_]+)"? .*\\((.*)\\)/, m)) {
          cols=m[2];
          gsub(/[[:space:]]/, "", cols);
          if (index(cols, ",")==0 && cols !~ /\(/) {
            gsub(/"/, "", cols);
            if (cols != "") {
              print m[1] "|" cols;
            }
          }
        }
      }
    ' "$in_file" | sort -u > "$out_file"
  }

  echo -n "  Resolving known schema data conflicts... "
  if ! run_psql_sql "CREATE SCHEMA IF NOT EXISTS \"$legacy_schema\";"; then
    fail "Failed to ensure legacy schema for conflict resolution"
    return 1
  fi

  unique_cols_file="$(mktemp)"
  extract_contract_unique_single_columns "$schema_file" "$unique_cols_file"

  while IFS='|' read -r table col; do
    [ -n "$table" ] || continue
    [ -n "$col" ] || continue

    type_info="$(run_psql_sql "SELECT coalesce(data_type,'') || '|' || coalesce(udt_name,'') || '|' || coalesce(character_maximum_length::text,'') FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${col}' LIMIT 1;" capture 2>/dev/null | head -n 1 || true)"
    [ -n "$type_info" ] || continue
    data_type="${type_info%%|*}"
    udt_name="$(printf '%s' "$type_info" | cut -d'|' -f2)"
    max_len="$(printf '%s' "$type_info" | cut -d'|' -f3)"

    case "$udt_name" in
      text|varchar|bpchar|citext) ;;
      *)
        continue
        ;;
    esac

    dup_count="$(run_psql_sql "SELECT COUNT(*) FROM (SELECT \"$col\" FROM \"$table\" WHERE \"$col\" IS NOT NULL GROUP BY \"$col\" HAVING COUNT(*) > 1) d;" capture 2>/dev/null | tr -d '[:space:]' || echo "0")"
    [ -n "$dup_count" ] || dup_count="0"
    if [ "$dup_count" = "0" ]; then
      continue
    fi

    archive_name="$(printf '%s_%s' "$table" "$col" | tr -c 'A-Za-z0-9_' '_')"
    archive_table="${archive_name}_dedup_${TIMESTAMP}"
    if ! run_psql_sql "CREATE TABLE IF NOT EXISTS \"$legacy_schema\".\"$archive_table\" AS SELECT * FROM \"$table\" t WHERE t.\"$col\" IS NOT NULL AND t.\"$col\" IN (SELECT \"$col\" FROM \"$table\" WHERE \"$col\" IS NOT NULL GROUP BY \"$col\" HAVING COUNT(*) > 1);"; then
      rm -f "$unique_cols_file"
      fail "Failed to archive duplicate rows for ${table}.${col}"
      return 1
    fi

    if [ -n "$max_len" ]; then
      if ! run_psql_sql "WITH ranked AS (SELECT ctid, \"$col\" AS val, ROW_NUMBER() OVER (PARTITION BY \"$col\" ORDER BY ctid ASC) AS rn FROM \"$table\" WHERE \"$col\" IS NOT NULL) UPDATE \"$table\" t SET \"$col\" = LEFT(ranked.val, GREATEST($max_len - LENGTH(' (legacy-' || ranked.rn || ')'), 1)) || ' (legacy-' || ranked.rn || ')' FROM ranked WHERE t.ctid = ranked.ctid AND ranked.rn > 1;"; then
        rm -f "$unique_cols_file"
        fail "Failed to normalize duplicate values for ${table}.${col}"
        return 1
      fi
    else
      if ! run_psql_sql "WITH ranked AS (SELECT ctid, \"$col\" AS val, ROW_NUMBER() OVER (PARTITION BY \"$col\" ORDER BY ctid ASC) AS rn FROM \"$table\" WHERE \"$col\" IS NOT NULL) UPDATE \"$table\" t SET \"$col\" = ranked.val || ' (legacy-' || ranked.rn || ')' FROM ranked WHERE t.ctid = ranked.ctid AND ranked.rn > 1;"; then
        rm -f "$unique_cols_file"
        fail "Failed to normalize duplicate values for ${table}.${col}"
        return 1
      fi
    fi
    resolved_groups=$((resolved_groups + dup_count))
  done < "$unique_cols_file"

  rm -f "$unique_cols_file"
  if [ "$unresolved_groups" -gt 0 ]; then
    fail "Unresolved schema data conflicts detected (${unresolved_groups})"
    return 1
  fi
  if [ "$resolved_groups" -gt 0 ]; then
    ok "resolved (${resolved_groups} duplicate group(s))"
  else
    ok "none"
  fi
  return 0
}

resolve_foreign_key_type_mismatches() {
  local enabled="${LEARNPLAY_SCHEMA_ALIGN_FK_TYPES:-true}"
  local schema_file="${DIST_DIR}/schema-full.sql"
  local fk_file types_file
  local table col ref_table ref_col
  local src_type ref_type
  local adjusted=0
  local total=0
  local processed=0
  local next_pct=10
  declare -A col_type_map=()

  if [ "$enabled" != "true" ]; then
    return 0
  fi
  if [ ! -f "$schema_file" ]; then
    return 0
  fi

  fk_file="$(mktemp)"
  awk '
    BEGIN { tbl="" }
    /^ALTER TABLE( ONLY)? / {
      if (match($0, /^ALTER TABLE( ONLY)? "?([A-Za-z0-9_]+)"?$/, m)) {
        tbl=m[2];
      } else {
        tbl="";
      }
      next;
    }
    tbl!="" && / FOREIGN KEY / && / REFERENCES / {
      fk_col=""; ref_tbl=""; ref_col="";
      line=$0;
      gsub(/"/, "", line);
      if (match(line, /FOREIGN KEY \(([A-Za-z0-9_]+)\) REFERENCES ([A-Za-z0-9_]+)\(([A-Za-z0-9_]+)\)/, m)) {
        fk_col=m[1]; ref_tbl=m[2]; ref_col=m[3];
      }
      if (fk_col != "" && ref_tbl != "" && ref_col != "") {
        print tbl "|" fk_col "|" ref_tbl "|" ref_col;
      }
    }
  ' "$schema_file" | sort -u > "$fk_file"

  echo -n "  Aligning FK column types to contract... "
  total="$(wc -l < "$fk_file" | tr -d '[:space:]')"
  types_file="$(mktemp)"
  if ! run_psql_sql "COPY (SELECT c.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped) TO STDOUT;" capture > "$types_file"; then
    rm -f "$fk_file" "$types_file"
    fail "Failed to load current column type map for FK alignment"
    return 1
  fi

  while IFS='|' read -r table col src_type; do
    [ -n "$table" ] || continue
    [ -n "$col" ] || continue
    col_type_map["$table|$col"]="$src_type"
  done < "$types_file"

  while IFS='|' read -r table col ref_table ref_col; do
    [ -n "$table" ] || continue
    [ -n "$col" ] || continue
    [ -n "$ref_table" ] || continue
    [ -n "$ref_col" ] || continue

    src_type="${col_type_map["$table|$col"]:-}"
    ref_type="${col_type_map["$ref_table|$ref_col"]:-}"
    [ -n "$src_type" ] || continue
    [ -n "$ref_type" ] || continue

    if [ "$src_type" != "$ref_type" ]; then
      if run_psql_sql "ALTER TABLE \"${table}\" ALTER COLUMN \"${col}\" TYPE ${ref_type} USING \"${col}\"::${ref_type};"; then
        adjusted=$((adjusted + 1))
      else
        rm -f "$fk_file" "$types_file"
        fail "Failed to align FK type for ${table}.${col} (${src_type} -> ${ref_type})"
        return 1
      fi
    fi

    processed=$((processed + 1))
    if [ "$total" -gt 0 ]; then
      local pct
      pct=$(( processed * 100 / total ))
      while [ "$pct" -ge "$next_pct" ] && [ "$next_pct" -le 100 ]; do
        echo "FK_ALIGN (SCHEMA) : ${next_pct}% Complete... (${processed}/${total})"
        next_pct=$((next_pct + 10))
      done
    fi
  done < "$fk_file"

  rm -f "$fk_file" "$types_file"
  if [ "$adjusted" -gt 0 ]; then
    ok "adjusted (${adjusted} column type change(s))"
  else
    ok "none"
  fi
  return 0
}

prune_non_contract_columns() {
  local enabled="${LEARNPLAY_SCHEMA_PRUNE_EXTRA_COLUMNS:-false}"
  local schema_file="${DIST_DIR}/schema-full.sql"
  local legacy_schema="${LEARNPLAY_SCHEMA_LEGACY_SCHEMA:-learnplay_legacy_archive}"
  local contract_cols current_cols contract_tables
  local key table col archive_table
  local dropped=0
  local -A keep_col=()
  local -A keep_table=()
  local -A archived_table=()

  if [ "$enabled" != "true" ]; then
    return 0
  fi
  if [ ! -f "$schema_file" ]; then
    return 0
  fi

  contract_cols="$(mktemp)"
  contract_tables="$(mktemp)"
  current_cols="$(mktemp)"
  extract_schema_contract_columns "$schema_file" "$contract_cols"
  awk -F'\t' 'NF>=2 {print $1 "|" $2}' "$contract_cols" | sort -u > "${contract_cols}.pairs"
  awk -F'|' '{print $1}' "${contract_cols}.pairs" | sort -u > "$contract_tables"

  while IFS= read -r key; do
    [ -n "$key" ] && keep_col["$key"]=1
  done < "${contract_cols}.pairs"
  while IFS= read -r table; do
    [ -n "$table" ] && keep_table["$table"]=1
  done < "$contract_tables"

  if ! run_psql_sql "COPY (SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position) TO STDOUT;" capture > "$current_cols"; then
    rm -f "$contract_cols" "${contract_cols}.pairs" "$contract_tables" "$current_cols"
    fail "Failed to inspect current public columns"
    return 1
  fi

  run_psql_sql "CREATE SCHEMA IF NOT EXISTS \"$legacy_schema\";" || {
    rm -f "$contract_cols" "${contract_cols}.pairs" "$contract_tables" "$current_cols"
    fail "Failed to ensure legacy schema: $legacy_schema"
    return 1
  }

  echo -n "  Pruning non-contract columns... "
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    table="${key%%|*}"
    col="${key#*|}"
    case "$table" in
      __drizzle_*) continue ;;
    esac
    if [ -z "${keep_table[$table]:-}" ]; then
      continue
    fi
    if [ -n "${keep_col[$key]:-}" ]; then
      continue
    fi

    if [ -z "${archived_table[$table]:-}" ]; then
      archive_table="${table}_extra_cols_${TIMESTAMP}"
      if ! run_psql_sql "CREATE TABLE IF NOT EXISTS \"$legacy_schema\".\"$archive_table\" AS SELECT * FROM \"$table\";"; then
        rm -f "$contract_cols" "${contract_cols}.pairs" "$contract_tables" "$current_cols"
        fail "Failed to archive table before pruning extra columns: $table"
        return 1
      fi
      archived_table["$table"]="$archive_table"
    fi

    if ! run_psql_sql "ALTER TABLE \"$table\" DROP COLUMN IF EXISTS \"$col\" CASCADE;"; then
      rm -f "$contract_cols" "${contract_cols}.pairs" "$contract_tables" "$current_cols"
      fail "Failed to drop non-contract column: ${table}.${col}"
      return 1
    fi
    dropped=$((dropped + 1))
  done < "$current_cols"

  rm -f "$contract_cols" "${contract_cols}.pairs" "$contract_tables" "$current_cols"
  if [ "$dropped" -gt 0 ]; then
    ok "dropped (${dropped} extra column(s); archived to ${legacy_schema})"
  else
    ok "none"
  fi
  return 0
}

prune_non_contract_constraints_indexes() {
  local enabled="${LEARNPLAY_SCHEMA_PRUNE_EXTRA_KEYS:-false}"
  local schema_file="${DIST_DIR}/schema-full.sql"
  local contract_tables contract_constraints contract_indexes
  local current_constraints current_indexes
  local entry table name
  local dropped_constraints=0
  local dropped_indexes=0
  local -A keep_table=()
  local -A keep_constraint=()
  local -A keep_index=()

  if [ "$enabled" != "true" ]; then
    return 0
  fi
  if [ ! -f "$schema_file" ]; then
    return 0
  fi

  contract_tables="$(mktemp)"
  contract_constraints="$(mktemp)"
  contract_indexes="$(mktemp)"
  current_constraints="$(mktemp)"
  current_indexes="$(mktemp)"

  extract_contract_tables "$schema_file" "$contract_tables"
  awk '
    BEGIN { tbl="" }
    {
      line=$0;
      sub(/^[[:space:]]+/, "", line);
    }
    line ~ /^ALTER TABLE( ONLY)? / {
      if (match(line, /^ALTER TABLE( ONLY)? "?([A-Za-z0-9_]+)"?$/, m)) {
        tbl=m[2];
      } else {
        tbl="";
      }
      next;
    }
    tbl!="" && line ~ /ADD CONSTRAINT/ {
      if (match(line, /ADD CONSTRAINT "?([A-Za-z0-9_]+)"? /, c)) {
        print tbl "|" c[1];
      }
    }
  ' "$schema_file" | sort -u > "$contract_constraints"
  awk '
    {
      line=$0;
      sub(/^[[:space:]]+/, "", line);
    }
    line ~ /^CREATE( UNIQUE)? INDEX / {
      if (match(line, /^CREATE( UNIQUE)? INDEX (IF NOT EXISTS )?"?([A-Za-z0-9_]+)"? ON "?([A-Za-z0-9_]+)"? /, m)) {
        print m[4] "|" m[3];
      }
    }
  ' "$schema_file" | sort -u > "$contract_indexes"

  while IFS= read -r table; do
    [ -n "$table" ] && keep_table["$table"]=1
  done < "$contract_tables"
  while IFS= read -r entry; do
    [ -n "$entry" ] && keep_constraint["$entry"]=1
  done < "$contract_constraints"
  while IFS= read -r entry; do
    [ -n "$entry" ] && keep_index["$entry"]=1
  done < "$contract_indexes"

  if ! run_psql_sql "COPY (SELECT conrelid::regclass::text || '|' || conname FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text, conname) TO STDOUT;" capture > "$current_constraints"; then
    rm -f "$contract_tables" "$contract_constraints" "$contract_indexes" "$current_constraints" "$current_indexes"
    fail "Failed to inspect current constraints"
    return 1
  fi
  if ! run_psql_sql "COPY (SELECT t.relname || '|' || i.relname FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_index ix ON ix.indrelid=t.oid JOIN pg_class i ON i.oid=ix.indexrelid LEFT JOIN pg_constraint c ON c.conindid=ix.indexrelid WHERE n.nspname='public' AND c.oid IS NULL ORDER BY t.relname, i.relname) TO STDOUT;" capture > "$current_indexes"; then
    rm -f "$contract_tables" "$contract_constraints" "$contract_indexes" "$current_constraints" "$current_indexes"
    fail "Failed to inspect current indexes"
    return 1
  fi

  echo -n "  Pruning non-contract constraints/indexes... "
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    table="${entry%%|*}"
    name="${entry#*|}"
    table="${table#public.}"
    table="${table//\"/}"
    case "$table" in
      __drizzle_*) continue ;;
    esac
    if [ -z "${keep_table[$table]:-}" ]; then
      continue
    fi
    if [ -n "${keep_constraint[$entry]:-}" ]; then
      continue
    fi
    if ! run_psql_sql "ALTER TABLE \"$table\" DROP CONSTRAINT IF EXISTS \"$name\" CASCADE;"; then
      rm -f "$contract_tables" "$contract_constraints" "$contract_indexes" "$current_constraints" "$current_indexes"
      fail "Failed to drop non-contract constraint: ${table}.${name}"
      return 1
    fi
    dropped_constraints=$((dropped_constraints + 1))
  done < "$current_constraints"

  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    table="${entry%%|*}"
    name="${entry#*|}"
    table="${table#public.}"
    table="${table//\"/}"
    case "$table" in
      __drizzle_*) continue ;;
    esac
    if [ -z "${keep_table[$table]:-}" ]; then
      continue
    fi
    if [ -n "${keep_index[$entry]:-}" ]; then
      continue
    fi
    if ! run_psql_sql "DROP INDEX IF EXISTS \"$name\" CASCADE;"; then
      rm -f "$contract_tables" "$contract_constraints" "$contract_indexes" "$current_constraints" "$current_indexes"
      fail "Failed to drop non-contract index: ${table}.${name}"
      return 1
    fi
    dropped_indexes=$((dropped_indexes + 1))
  done < "$current_indexes"

  rm -f "$contract_tables" "$contract_constraints" "$contract_indexes" "$current_constraints" "$current_indexes"
  if [ "$dropped_constraints" -gt 0 ] || [ "$dropped_indexes" -gt 0 ]; then
    ok "dropped (constraints: ${dropped_constraints}, indexes: ${dropped_indexes})"
  else
    ok "none"
  fi
  return 0
}

archive_non_contract_public_objects() {
  local schema_file="${DIST_DIR}/schema-full.sql"
  local enabled="${LEARNPLAY_SCHEMA_ARCHIVE_EXTRA_OBJECTS:-false}"
  local legacy_schema="${LEARNPLAY_SCHEMA_LEGACY_SCHEMA:-learnplay_legacy_archive}"
  local contract_tables contract_types current_tables current_types obj
  local -A keep_table=()
  local -A keep_type=()
  local moved_tables=0
  local moved_types=0
  local row_count=""

  if [ "$enabled" != "true" ]; then
    return 0
  fi
  if [ ! -f "$schema_file" ]; then
    return 0
  fi

  contract_tables="$(mktemp)"
  contract_types="$(mktemp)"
  current_tables="$(mktemp)"
  current_types="$(mktemp)"

  extract_contract_tables "$schema_file" "$contract_tables"
  extract_contract_types "$schema_file" "$contract_types"

  while IFS= read -r obj; do
    [ -n "$obj" ] && keep_table["$obj"]=1
  done < "$contract_tables"
  while IFS= read -r obj; do
    [ -n "$obj" ] && keep_type["$obj"]=1
  done < "$contract_types"

  if ! run_psql_sql "COPY (SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name) TO STDOUT;" capture > "$current_tables"; then
    rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
    fail "Failed to inspect current public tables"
    return 1
  fi
  if ! run_psql_sql "COPY (SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d') ORDER BY t.typname) TO STDOUT;" capture > "$current_types"; then
    rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
    fail "Failed to inspect current public types"
    return 1
  fi

  run_psql_sql "CREATE SCHEMA IF NOT EXISTS \"$legacy_schema\";" || {
    rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
    fail "Failed to ensure legacy schema: $legacy_schema"
    return 1
  }

  while IFS= read -r obj; do
    [ -n "$obj" ] || continue
    case "$obj" in
      __drizzle_*) continue ;;
    esac
    if [ -n "${keep_table[$obj]:-}" ]; then
      continue
    fi
    row_count="$(run_psql_sql "SELECT count(*) FROM public.\"$obj\";" capture | tr -d '[:space:]' || true)"
    if ! [[ "${row_count:-}" =~ ^[0-9]+$ ]]; then
      rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
      fail "Failed to inspect extra public table row-count: $obj"
      return 1
    fi
    if [ "$row_count" -gt 0 ]; then
      rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
      fail "Extra public table '$obj' contains data (${row_count} row(s)); manual schema drift remediation required before update can continue."
      return 1
    fi
    if run_psql_sql "ALTER TABLE IF EXISTS public.\"$obj\" SET SCHEMA \"$legacy_schema\";"; then
      moved_tables=$((moved_tables + 1))
    else
      rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
      fail "Failed to archive extra public table: $obj"
      return 1
    fi
  done < "$current_tables"

  while IFS= read -r obj; do
    [ -n "$obj" ] || continue
    if [ -n "${keep_type[$obj]:-}" ]; then
      continue
    fi
    if run_psql_sql "ALTER TYPE public.\"$obj\" SET SCHEMA \"$legacy_schema\";"; then
      moved_types=$((moved_types + 1))
    else
      warn "Could not archive extra public type '$obj' (still referenced)"
    fi
  done < "$current_types"

  rm -f "$contract_tables" "$contract_types" "$current_tables" "$current_types"
  if [ "$moved_tables" -gt 0 ] || [ "$moved_types" -gt 0 ]; then
    ok "Archived extra objects (tables: ${moved_tables}, types: ${moved_types}) to schema ${legacy_schema}"
  fi
  return 0
}

extract_schema_contract_columns() {
  local schema_file="$1"
  local out_file="$2"
  awk '
    BEGIN {
      in_table=0; table="";
    }
    /^CREATE TABLE / {
      if (match($0, /^CREATE TABLE (IF NOT EXISTS )?(public\.)?"?([A-Za-z0-9_]+)"? \($/, m)) {
        table=m[3];
        in_table=1;
      }
      next;
    }
    in_table==1 && /^\);$/ { in_table=0; table=""; next; }
    in_table==1 {
      line=$0;
      sub(/^[[:space:]]+/, "", line);
      if (line ~ /^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)/) next;
      if (line ~ /^$/) next;

      col=line;
      # Trim only the trailing column delimiter, not commas inside type modifiers
      # (e.g. numeric(10,2)).
      sub(/,[[:space:]]*$/, "", col);
      if (match(col, /^"([^"]+)"[[:space:]]+(.*)$/, cm)) {
        cname=cm[1];
        cdef=cm[2];
      } else if (match(col, /^([A-Za-z0-9_]+)[[:space:]]+(.*)$/, cm2)) {
        cname=cm2[1];
        cdef=cm2[2];
      } else {
        next;
      }
      gsub(/\t/, " ", cdef);
      print table "\t" cname "\t" cdef;
    }
  ' "$schema_file" > "$out_file"
}

ensure_schema_contract_compatibility() {
  local schema_file="${DIST_DIR}/schema-full.sql"
  local contract_file current_tables current_columns
  local table col def key create_sql missing_preview create_sql_file
  local allow_table_replay="${LEARNPLAY_SCHEMA_REPLAY_CREATE_TABLES:-true}"
  local -A has_table=()
  local -A has_col=()
  local -A create_done=()
  local -A missing_seen=()
  local -a missing_tables=()
  local created_tables=0
  local added_columns=0

  echo -n "  Enforcing full schema contract... "
  if [ ! -f "$schema_file" ]; then
    fail "schema-full.sql missing from package ($schema_file)"
    return 1
  fi

  contract_file="$(mktemp)"
  current_tables="$(mktemp)"
  current_columns="$(mktemp)"
  extract_schema_contract_columns "$schema_file" "$contract_file"

  if ! run_psql_sql "COPY (SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name) TO STDOUT;" capture > "$current_tables"; then
    rm -f "$contract_file" "$current_tables" "$current_columns"
    fail "Failed to read current table list"
    return 1
  fi
  if ! run_psql_sql "COPY (SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position) TO STDOUT;" capture > "$current_columns"; then
    rm -f "$contract_file" "$current_tables" "$current_columns"
    fail "Failed to read current column list"
    return 1
  fi

  while IFS= read -r table; do
    [ -n "$table" ] && has_table["$table"]=1
  done < "$current_tables"
  while IFS= read -r key; do
    [ -n "$key" ] && has_col["$key"]=1
  done < "$current_columns"

  while IFS=$'\t' read -r table col def; do
    [ -n "$table" ] || continue
    [ -n "$col" ] || continue

    # Internal migration journal tables are managed by migrate.js and should not be enforced
    # via schema contract replay.
    case "$table" in
      __drizzle_*) continue ;;
    esac

    key="${table}|${col}"

    if [ -z "${has_table[$table]:-}" ] && [ -z "${create_done[$table]:-}" ]; then
      if [ "$allow_table_replay" = "true" ]; then
        create_sql="$(awk -v t="$table" '
          BEGIN {capture=0}
          $0 ~ "^CREATE TABLE (IF NOT EXISTS )?(public\\.)?\"?" t "\"? \\($" {capture=1}
          capture==1 {print}
          capture==1 && $0 ~ /^[[:space:]]*\);[[:space:]]*$/ {exit}
        ' "$schema_file")"
        if [ -n "$create_sql" ]; then
          create_sql_file="$(mktemp)"
          printf '%s\n' "$create_sql" > "$create_sql_file"
          chmod 0644 "$create_sql_file" 2>/dev/null || true
          if run_psql_file "$create_sql_file"; then
            rm -f "$create_sql_file"
            has_table["$table"]=1
            create_done["$table"]=1
            created_tables=$((created_tables + 1))
          else
            rm -f "$create_sql_file"
            rm -f "$contract_file" "$current_tables" "$current_columns"
            fail "Failed to create missing table: $table"
            return 1
          fi
        else
          rm -f "$contract_file" "$current_tables" "$current_columns"
          fail "Table missing and CREATE TABLE not found in contract: $table"
          return 1
        fi
      else
        if [ -z "${missing_seen[$table]:-}" ]; then
          missing_seen["$table"]=1
          missing_tables+=("$table")
        fi
        create_done["$table"]=1
        continue
      fi
    fi

    if [ -z "${has_col[$key]:-}" ]; then
      if run_psql_sql "ALTER TABLE \"$table\" ADD COLUMN IF NOT EXISTS \"$col\" $def;"; then
        has_col["$key"]=1
        added_columns=$((added_columns + 1))
      else
        rm -f "$contract_file" "$current_tables" "$current_columns"
        fail "Failed to add missing column: ${table}.${col}"
        return 1
      fi
    fi
  done < "$contract_file"

  if [ "${#missing_tables[@]}" -gt 0 ]; then
    missing_preview="$(printf '%s, ' "${missing_tables[@]}")"
    missing_preview="${missing_preview%, }"
    rm -f "$contract_file" "$current_tables" "$current_columns"
    fail "Missing tables after migrations: ${missing_preview}. Normal updates do not auto-create tables; verify migrate.js output or use LEARNPLAY_SCHEMA_REPLAY_CREATE_TABLES=true for recovery."
    return 1
  fi

  rm -f "$contract_file" "$current_tables" "$current_columns"
  ok "Schema contract enforced (tables created: ${created_tables}, columns added: ${added_columns})"
  return 0
}

ensure_slide_conversion_dependencies() {
  echo -n "  Checking media conversion dependencies... "
  local missing=()
  if ! command -v libreoffice >/dev/null 2>&1 && ! command -v soffice >/dev/null 2>&1; then
    missing+=("libreoffice-impress")
  fi
  if ! command -v pdftoppm >/dev/null 2>&1; then
    missing+=("poppler-utils")
  fi
  if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
    missing+=("ffmpeg")
  fi

  if [ "${#missing[@]}" -eq 0 ]; then
    local lo_bin="libreoffice"
    if ! command -v libreoffice >/dev/null 2>&1; then
      lo_bin="soffice"
    fi
    ok "ready (${lo_bin}, pdftoppm, ffmpeg)"
    return 0
  fi

  warn "missing: ${missing[*]} — installing now"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${missing[@]}" >> "$UPDATE_LOG" 2>&1 || return 1

  if { command -v libreoffice >/dev/null 2>&1 || command -v soffice >/dev/null 2>&1; } \
    && command -v pdftoppm >/dev/null 2>&1 \
    && command -v ffmpeg >/dev/null 2>&1 \
    && command -v ffprobe >/dev/null 2>&1; then
    ok "installed (${missing[*]})"
    return 0
  fi
  return 1
}

resolve_runtime_database_url() {
  local resolved="${DB_URL:-}"
  if [ -z "$resolved" ] && [ -f "$APP_DIR/.env" ]; then
    resolved="$(grep -E "^DATABASE_URL=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)"
  fi
  printf '%s' "$resolved"
}

get_podcast_hls_backfill_target_count() {
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

run_podcast_hls_backfill() {
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
    info "Skipping podcast HLS backfill (disabled: LEARNPLAY_PODCAST_HLS_BACKFILL_MAX_LESSONS=${max_lessons})"
    return 0
  fi

  local db_runtime_url
  db_runtime_url="$(resolve_runtime_database_url)"
  if [ -z "$db_runtime_url" ]; then
    warn "Skipping podcast HLS backfill: DATABASE_URL not available"
    return 0
  fi

  if [ ! -f "$backfill_script" ]; then
    warn "Skipping podcast HLS backfill: script not found in runtime package"
    return 0
  fi

  precheck_count="$(get_podcast_hls_backfill_target_count "$db_runtime_url" || true)"
  if [[ "$precheck_count" =~ ^[0-9]+$ ]]; then
    if [ "$precheck_count" -le 0 ]; then
      info "Skipping podcast HLS backfill: no completed podcast versions found in database"
      return 0
    fi
    if [ "$precheck_count" -lt "$max_lessons" ]; then
      max_lessons="$precheck_count"
    fi
    info "Podcast HLS backfill candidates detected: ${precheck_count} (this run maxLessons=${max_lessons})"
  else
    info "Podcast HLS backfill pre-check unavailable (psql not present or query failed); scheduling cautiously"
  fi

  if pgrep -u "$APP_USER" -f "backfillPodcastHls.js --live" >/dev/null 2>&1; then
    info "Podcast HLS backfill already running in background (non-blocking)"
    return 0
  fi

  mkdir -p /var/log/learnplay 2>/dev/null || true
  mkdir -p /var/lock 2>/dev/null || true
  touch "$backfill_log" 2>/dev/null || true
  touch "$backfill_status" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$backfill_log" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "$backfill_status" 2>/dev/null || true

  echo -n "  Scheduling podcast HLS backfill in background... "
  if command -v systemd-run >/dev/null 2>&1; then
    systemctl stop "${unit_name}.service" >/dev/null 2>&1 || true
    systemctl reset-failed "${unit_name}.service" >/dev/null 2>&1 || true
    if systemd-run --unit="$unit_name" --uid="$APP_USER" \
      --property=WorkingDirectory="$APP_DIR" \
      --property=RuntimeMaxSec=20m \
      --property=StandardOutput=append:"$backfill_log" \
      --property=StandardError=append:"$backfill_log" \
      --setenv=DATABASE_URL="$db_runtime_url" \
      /usr/bin/node "$backfill_script" --live --maxLessons="${max_lessons}" --lockFile="$backfill_lock" --statusFile="$backfill_status" \
      >> "$UPDATE_LOG" 2>&1; then
      ok "Scheduled via systemd-run (maxLessons=${max_lessons})"
      info "Podcast HLS backfill status: $backfill_status"
      info "Podcast HLS backfill log: $backfill_log"
      return 0
    fi
    warn "systemd-run scheduling failed; falling back to nohup background launch"
  fi

  if sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && nohup env DATABASE_URL='$db_runtime_url' node '$backfill_script' --live --maxLessons=${max_lessons} --lockFile='$backfill_lock' --statusFile='$backfill_status' >> '$backfill_log' 2>&1 < /dev/null &"; then
    ok "Scheduled via nohup (maxLessons=${max_lessons})"
    info "Podcast HLS backfill status: $backfill_status"
    info "Podcast HLS backfill log: $backfill_log"
    return 0
  fi

  warn "Unable to schedule podcast HLS backfill (non-fatal). See $UPDATE_LOG"
  return 0
}

update_lppadmin_command() {
  local local_script_backup="$BACKUP_DIR/lppadmin.sh.pre-update.${TIMESTAMP}"
  local local_ssl_backup="$BACKUP_DIR/ssl-mode.sh.pre-update.${TIMESTAMP}"
  local local_motd_backup="$BACKUP_DIR/learnplay-motd.sh.pre-update.${TIMESTAMP}"
  local local_bin_backup="$BACKUP_DIR/lppadmin.bin.pre-update.${TIMESTAMP}"
  local local_motd_profile_backup="$BACKUP_DIR/learnplay-motd.profile.pre-update.${TIMESTAMP}"

  if [ ! -f "$DIST_DIR/scripts/lppadmin.sh" ]; then
    fail "Package is missing scripts/lppadmin.sh"
    return 1
  fi

  mkdir -p "$APP_DIR/scripts"
  [ -e "$APP_DIR/scripts/lppadmin.sh" ] && cp -a "$APP_DIR/scripts/lppadmin.sh" "$local_script_backup" 2>/dev/null || true
  [ -e "$APP_DIR/scripts/ssl-mode.sh" ] && cp -a "$APP_DIR/scripts/ssl-mode.sh" "$local_ssl_backup" 2>/dev/null || true
  [ -e "$APP_DIR/scripts/learnplay-motd.sh" ] && cp -a "$APP_DIR/scripts/learnplay-motd.sh" "$local_motd_backup" 2>/dev/null || true
  [ -e /usr/local/bin/lppadmin ] && cp -a /usr/local/bin/lppadmin "$local_bin_backup" 2>/dev/null || true
  [ -e /etc/profile.d/learnplay-motd.sh ] && cp -a /etc/profile.d/learnplay-motd.sh "$local_motd_profile_backup" 2>/dev/null || true

  local required_scripts=(lppadmin.sh ssl-mode.sh learnplay-motd.sh)
  local script_name
  for script_name in "${required_scripts[@]}"; do
    if [ ! -f "$DIST_DIR/scripts/$script_name" ]; then
      fail "Package is missing scripts/$script_name"
      return 1
    fi
    if ! cp "$DIST_DIR/scripts/$script_name" "$APP_DIR/scripts/$script_name"; then
      fail "Failed to copy $script_name from package"
      [ -e "$local_script_backup" ] && cp -a "$local_script_backup" "$APP_DIR/scripts/lppadmin.sh" 2>/dev/null || true
      [ -e "$local_ssl_backup" ] && cp -a "$local_ssl_backup" "$APP_DIR/scripts/ssl-mode.sh" 2>/dev/null || true
      [ -e "$local_motd_backup" ] && cp -a "$local_motd_backup" "$APP_DIR/scripts/learnplay-motd.sh" 2>/dev/null || true
      [ -e "$local_bin_backup" ] && cp -a "$local_bin_backup" /usr/local/bin/lppadmin 2>/dev/null || true
      [ -e "$local_motd_profile_backup" ] && cp -a "$local_motd_profile_backup" /etc/profile.d/learnplay-motd.sh 2>/dev/null || true
      return 1
    fi
    chmod 0755 "$APP_DIR/scripts/$script_name"
  done

  if ! ln -sfn "$APP_DIR/scripts/lppadmin.sh" /usr/local/bin/lppadmin; then
    fail "Failed to install /usr/local/bin/lppadmin symlink"
    [ -e "$local_script_backup" ] && cp -a "$local_script_backup" "$APP_DIR/scripts/lppadmin.sh" 2>/dev/null || true
    [ -e "$local_bin_backup" ] && cp -a "$local_bin_backup" /usr/local/bin/lppadmin 2>/dev/null || true
    return 1
  fi

  # Rebuild /etc/lppadmin profile cache from the freshly installed script.
  mkdir -p /etc/lppadmin
  rm -f /etc/lppadmin/environment.env
  /usr/local/bin/lppadmin onprem self-check >/dev/null 2>&1 || true

  install -m 755 "$APP_DIR/scripts/learnplay-motd.sh" /etc/profile.d/learnplay-motd.sh 2>/dev/null || true

  ok "Updated admin scripts (lppadmin, ssl-mode, MOTD)"
  ok "Installed /usr/local/bin/lppadmin symlink"
  return 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y)
      AUTO_YES=true
      shift
      ;;
    --component)
      if [ $# -lt 2 ]; then
        echo -e "${RED}❌ --component requires a value (all|app-db|lppadmin)${NC}"
        exit 1
      fi
      UPDATE_COMPONENT="$2"
      shift 2
      ;;
    --component=*)
      UPDATE_COMPONENT="${1#*=}"
      shift
      ;;
    *)
      echo -e "${RED}❌ Unknown argument: $1${NC}"
      echo "Usage: $0 [--yes] [--component all|app-db|lppadmin]"
      exit 1
      ;;
  esac
done

UPDATE_COMPONENT="$(printf '%s' "$UPDATE_COMPONENT" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
case "$UPDATE_COMPONENT" in
  all|app-db|lppadmin) ;;
  *)
    echo -e "${RED}❌ Invalid --component value: $UPDATE_COMPONENT (expected all, app-db, or lppadmin)${NC}"
    exit 1
    ;;
esac

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Must be run as root (sudo)${NC}"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
echo "Using backup root: $BACKUP_DIR" >> "$UPDATE_LOG"
echo "Update transaction ID: $UPDATE_TX_ID" >> "$UPDATE_LOG"

get_version_from() {
  local dir="$1"
  if [ -f "$dir/version.json" ]; then
    grep -oP '"version"\s*:\s*"\K[^"]+' "$dir/version.json" 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

get_build_date_from() {
  local dir="$1"
  if [ -f "$dir/version.json" ]; then
    grep -oP '"buildDate"\s*:\s*"\K[^"]+' "$dir/version.json" 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

display_release_version() {
  local value="${1:-unknown}"
  case "$value" in
    LP-CL-V*|LP-OP-V*) echo "$value" ;;
    unknown|missing|"") echo "${value:-unknown}" ;;
    *) echo "$value" ;;
  esac
}

manifest_field() {
  local key="$1"
  local file="$2"
  grep -oP "\"${key}\"\\s*:\\s*\"\\K[^\"]+" "$file" 2>/dev/null | head -1 || true
}

version_lt() {
  local a="$1"
  local b="$2"
  normalize_release_version() {
    local v="$1"
    if [[ "$v" =~ ^LP-[A-Z]{2}-V([0-9]+)\.([0-9]{2})\.([0-9]{3})$ ]]; then
      printf '%09d.%03d.%03d\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
      return 0
    fi
    printf '%s\n' "$v"
  }
  local na nb
  na="$(normalize_release_version "$a")"
  nb="$(normalize_release_version "$b")"
  [ "$na" != "$nb" ] && [ "$(printf '%s\n%s\n' "$na" "$nb" | sort -V | head -n1)" = "$na" ]
}

run_bridge_upgrades_if_needed() {
  local minimum_version="$1"
  local bridge_dir="$DIST_DIR/bridges"
  if [ -z "$minimum_version" ] || [ "$minimum_version" = "0" ] || ! version_lt "$CURRENT_VERSION" "$minimum_version"; then
    return 0
  fi
  if [ ! -d "$bridge_dir" ]; then
    fail "Installed version $(display_release_version "$CURRENT_VERSION") is below minimum supported $(display_release_version "$minimum_version") and no bridge scripts are available."
    return 1
  fi
  warn "Installed version $(display_release_version "$CURRENT_VERSION") is below minimum supported $(display_release_version "$minimum_version"). Running bridge upgrades..."
  local bridge_count=0
  local bridge
  for bridge in "$bridge_dir"/*.sh; do
    [ -f "$bridge" ] || continue
    bridge_count=$((bridge_count + 1))
    log "Running bridge script: $(basename "$bridge")"
    if ! bash "$bridge" "$APP_DIR" "$ENV_FILE" >> "$UPDATE_LOG" 2>&1; then
      fail "Bridge script failed: $(basename "$bridge")"
      return 1
    fi
  done
  if [ "$bridge_count" -eq 0 ]; then
    fail "No executable bridge scripts found in $bridge_dir"
    return 1
  fi
  CURRENT_VERSION="$(get_version_from "$APP_DIR")"
  if version_lt "$CURRENT_VERSION" "$minimum_version"; then
    fail "Bridge upgrades completed but installed version $(display_release_version "$CURRENT_VERSION") is still below minimum supported $(display_release_version "$minimum_version")"
    return 1
  fi
  ok "Bridge upgrades complete (current version: $(display_release_version "$CURRENT_VERSION"))"
}

verify_package_checksums() {
  local checksum_file="$DIST_DIR/package-checksums.sha256"
  if [ ! -f "$checksum_file" ]; then
    warn "Package checksum manifest not found ($checksum_file)"
    return 0
  fi
  if ! command -v sha256sum >/dev/null 2>&1; then
    warn "sha256sum not available; skipping package checksum verification"
    return 0
  fi
  (cd "$DIST_DIR" && sha256sum -c "$(basename "$checksum_file")" >> "$UPDATE_LOG" 2>&1)
}

verify_manifest_signature() {
  local manifest_file="$DIST_DIR/release-manifest.json"
  local signature_file="$DIST_DIR/release-manifest.sig"
  local public_key="${RELEASE_PUBLIC_KEY_PATH:-}"
  local packaged_key="$DIST_DIR/server/config/release-signing-public.pem"
  local installed_key="$APP_DIR/server/config/release-signing-public.pem"

  [ -n "$public_key" ] && [ -f "$public_key" ] || public_key=""
  if [ -z "$public_key" ] && [ -f "$packaged_key" ]; then
    public_key="$packaged_key"
  fi
  if [ -z "$public_key" ] && [ -f "$installed_key" ]; then
    public_key="$installed_key"
  fi

  if [ ! -f "$signature_file" ] && [ -z "$public_key" ]; then
    warn "No release signature key material found; skipping signature verification"
    return 0
  fi
  if [ ! -f "$signature_file" ]; then
    fail "Signature verification required but release-manifest.sig is missing"
    return 1
  fi
  if [ -z "$public_key" ]; then
    fail "Signature verification required but no release public key is available"
    return 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    fail "openssl is required for signature verification"
    return 1
  fi
  openssl dgst -sha256 -verify "$public_key" -signature "$signature_file" "$manifest_file" >> "$UPDATE_LOG" 2>&1
}

CURRENT_VERSION=$(get_version_from "$APP_DIR")
NEW_VERSION=$(get_version_from "$DIST_DIR")
CURRENT_BUILD=$(get_build_date_from "$APP_DIR")
NEW_BUILD=$(get_build_date_from "$DIST_DIR")
CURRENT_VERSION_DISPLAY="$(display_release_version "$CURRENT_VERSION")"
NEW_VERSION_DISPLAY="$(display_release_version "$NEW_VERSION")"
MANIFEST_FILE="$DIST_DIR/release-manifest.json"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                      ║${NC}"
echo -e "${CYAN}║${NC}${WHITE}${BOLD}            LearnPlay Update Manager                  ${NC}${CYAN}║${NC}"
echo -e "${CYAN}║                                                      ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                      ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Installed:  ${BOLD}${CURRENT_VERSION_DISPLAY}${NC} ${DIM}(built ${CURRENT_BUILD})${NC}"
echo -e "${CYAN}║${NC}  Package:    ${GREEN}${BOLD}${NEW_VERSION_DISPLAY}${NC} ${DIM}(built ${NEW_BUILD})${NC}"
echo -e "${CYAN}║${NC}  Component:  ${BOLD}${UPDATE_COMPONENT}${NC}"
echo -e "${CYAN}║${NC}                                                      ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -f "$DIST_DIR/RELEASE_NOTES.txt" ]; then
  echo -e "${BOLD}Release Notes Preview${NC}"
  echo "──────────────────────────────────────────────────────"
  sed -n '1,120p' "$DIST_DIR/RELEASE_NOTES.txt"
  if [ "$(wc -l < "$DIST_DIR/RELEASE_NOTES.txt" 2>/dev/null || echo 0)" -gt 120 ]; then
    echo "..."
    echo "(truncated, full file: $DIST_DIR/RELEASE_NOTES.txt)"
  fi
  echo "──────────────────────────────────────────────────────"
  echo ""
fi

if [ "$CURRENT_VERSION" = "$NEW_VERSION" ] && [ "$CURRENT_BUILD" = "$NEW_BUILD" ]; then
  warn "The installed version matches the update package."
  if [ "$AUTO_YES" != true ]; then
    read -rp "  Continue anyway? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo "  Update cancelled."
      exit 0
    fi
  fi
fi

if [ "$UPDATE_COMPONENT" = "lppadmin" ]; then
  step 1 "Updating lppadmin Command"
  info "Component mode: lppadmin-only (no app file, dependency, or DB migration changes)"
  update_lppadmin_command || exit 1
  log "lppadmin-only update complete"
  exit 0
fi

step 1 "Pre-flight Checks"

PREFLIGHT_OK=true

if ! validate_runtime_identity_for_update; then
  PREFLIGHT_OK=false
fi
echo -n "  Applying backup retention...     "
if apply_backup_retention; then
  ok "retention completed"
else
  warn "retention encountered non-fatal issues"
fi
if ! check_backup_volume_guardrails; then
  PREFLIGHT_OK=false
fi

echo -n "  Checking disk space...          "
AVAIL_KB=$(df --output=avail "$APP_DIR" 2>/dev/null | tail -1 | tr -d ' ')
AVAIL_MB=$((AVAIL_KB / 1024))
if [ "$AVAIL_MB" -lt 1024 ]; then
  fail "Only ${AVAIL_MB}MB free (need 1024MB minimum)"
  PREFLIGHT_OK=false
else
  ok "${AVAIL_MB}MB available"
fi

echo -n "  Checking database connectivity... "
if [ -n "$DB_URL" ] && psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
  ok "PostgreSQL is reachable (DATABASE_URL)"
elif sudo -u postgres psql -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
  ok "PostgreSQL is reachable"
else
  if [ -n "$DB_URL" ]; then
    fail "Cannot connect using DATABASE_URL (fallback DB name '$DB_NAME' also failed)"
  else
    fail "Cannot connect to database '$DB_NAME'"
  fi
  PREFLIGHT_OK=false
fi

echo -n "  Checking update package...       "
MISSING=""
[ ! -d "$DIST_DIR/server" ] && MISSING="$MISSING server/"
[ ! -d "$DIST_DIR/client" ] && MISSING="$MISSING client/"
[ ! -f "$DIST_DIR/version.json" ] && MISSING="$MISSING version.json"
[ ! -f "$DIST_DIR/package.json" ] && MISSING="$MISSING package.json"
[ ! -f "$MANIFEST_FILE" ] && MISSING="$MISSING release-manifest.json"
if [ -n "$MISSING" ]; then
  fail "Missing from package:$MISSING"
  PREFLIGHT_OK=false
else
  ok "Package is complete"
fi

echo -n "  Verifying package checksums...   "
if verify_package_checksums; then
  ok "Checksums validated"
else
  fail "Checksum validation failed"
  PREFLIGHT_OK=false
fi

echo -n "  Verifying manifest signature...  "
if verify_manifest_signature; then
  ok "Signature valid (or verification skipped)"
else
  fail "Manifest signature verification failed"
  PREFLIGHT_OK=false
fi

echo -n "  Validating release manifest...   "
if [ -f "$MANIFEST_FILE" ]; then
  MANIFEST_PRODUCT="$(manifest_field "product" "$MANIFEST_FILE")"
  MANIFEST_VERSION="$(manifest_field "version" "$MANIFEST_FILE")"
  MANIFEST_MIN="$(manifest_field "minSupportedVersion" "$MANIFEST_FILE")"
  MANIFEST_MIN="${MANIFEST_MIN:-0}"
  if [ "$MANIFEST_PRODUCT" != "onprem" ]; then
    fail "Package product '$MANIFEST_PRODUCT' is not valid for onprem runtime"
    PREFLIGHT_OK=false
  elif [ -n "$MANIFEST_VERSION" ] && [ "$MANIFEST_VERSION" != "$NEW_VERSION" ]; then
    fail "Manifest version ($(display_release_version "$MANIFEST_VERSION")) does not match version.json ($(display_release_version "$NEW_VERSION"))"
    PREFLIGHT_OK=false
  elif [ "$MANIFEST_MIN" != "0" ] && version_lt "$CURRENT_VERSION" "$MANIFEST_MIN"; then
    if ! run_bridge_upgrades_if_needed "$MANIFEST_MIN"; then
      PREFLIGHT_OK=false
    else
      ok "Bridge pre-upgrades applied (minimum supported baseline satisfied)"
    fi
  else
    ok "Manifest valid (product=onprem, minSupported=${MANIFEST_MIN})"
  fi
else
  fail "release-manifest.json missing"
  PREFLIGHT_OK=false
fi

echo -n "  Checking current app status...   "
ensure_systemd_app_service
if systemctl is-active --quiet "$APP_SERVICE_NAME"; then
  ok "Application is running (systemd: ${APP_SERVICE_NAME})"
else
  warn "Application is not running (will be started by systemd after update)"
fi

if ! ensure_slide_conversion_dependencies; then
  fail "Could not install/verify media conversion dependencies (libreoffice/soffice + pdftoppm + ffmpeg)"
  PREFLIGHT_OK=false
fi

if [ "$PREFLIGHT_OK" != true ]; then
  echo ""
  fail "Pre-flight checks failed. Fix the issues above and try again."
  exit 1
fi

step 2 "Migration Preview"

PENDING_MIGRATIONS=0
if [ -d "$DIST_DIR/migrations" ]; then
  migration_files=()
  while IFS= read -r sql_file; do
    [ -n "$sql_file" ] || continue
    migration_files+=("$sql_file")
  done < <(find "$DIST_DIR/migrations" -maxdepth 1 -name "*.sql" | sort)

  TOTAL_MIGRATIONS=${#migration_files[@]}
  PENDING_MIGRATIONS=$TOTAL_MIGRATIONS
  if [ "$TOTAL_MIGRATIONS" -eq 0 ]; then
    ok "No packaged migrations found"
  else
    info "${TOTAL_MIGRATIONS} packaged migration(s) will be evaluated and applied idempotently:"
    echo ""
    for sql_file in "${migration_files[@]}"; do
      BASENAME=$(basename "$sql_file")
      echo -e "    ${YELLOW}→ $BASENAME (packaged baseline migration)${NC}"
    done
  fi
else
  warn "No migrations directory in update package"
fi
echo ""

if [ "$AUTO_YES" != true ]; then
  echo -e "${BOLD}  Ready to update ${CURRENT_VERSION_DISPLAY} → ${NEW_VERSION_DISPLAY}${NC}"
  echo ""
  echo "  This will:"
  echo "    • Create a full backup (files + database)"
  echo "    • Stop the application"
  echo "    • Update application files"
  echo "    • Install new dependencies"
  [ "$PENDING_MIGRATIONS" -gt 0 ] && echo "    • Apply $PENDING_MIGRATIONS database migration(s)"
  echo "    • Start the application"
  echo "    • Verify health"
  echo ""
  read -rp "  Proceed with update? [y/N]: " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "  Update cancelled."
    exit 0
  fi
fi

step 3 "Upload Directory Migration Check"

OLD_UPLOAD_DIR="/var/lib/$APP_NAME/uploads"
if [ -d "$OLD_UPLOAD_DIR" ] && [ "$(ls -A "$OLD_UPLOAD_DIR" 2>/dev/null)" ]; then
  if [ ! -d "$UPLOAD_DIR" ] || [ -z "$(ls -A "$UPLOAD_DIR" 2>/dev/null)" ]; then
    warn "Legacy upload directory detected at $OLD_UPLOAD_DIR"
    info "New upload directory is $UPLOAD_DIR"
    MIGRATE_UPLOADS=false
    if [ "$AUTO_YES" = true ]; then
      MIGRATE_UPLOADS=true
    else
      read -rp "  Migrate uploads from $OLD_UPLOAD_DIR to $UPLOAD_DIR? [Y/n]: " migrate_confirm
      if [[ ! "$migrate_confirm" =~ ^[Nn]$ ]]; then
        MIGRATE_UPLOADS=true
      fi
    fi
    if [ "$MIGRATE_UPLOADS" = true ]; then
      echo -n "  Migrating uploads...            "
      mkdir -p "$UPLOAD_DIR"
      rsync -a "$OLD_UPLOAD_DIR/" "$UPLOAD_DIR/" >> "$UPDATE_LOG" 2>&1
      chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR"
      ok "Uploads migrated to $UPLOAD_DIR"
    else
      warn "Upload migration skipped — files remain at $OLD_UPLOAD_DIR"
    fi
  else
    ok "Upload directory $UPLOAD_DIR already exists with files — no migration needed"
  fi
else
  ok "No legacy upload directory found — using $UPLOAD_DIR"
fi

step 4 "Creating Backup"

BACKUP_PATH="$BACKUP_DIR/backup_${TIMESTAMP}"
mkdir -p "$BACKUP_PATH"
cat > "$BACKUP_PATH/update-transaction.json" <<EOF
{
  "transactionId": "${UPDATE_TX_ID}",
  "product": "onprem",
  "startedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "fromVersion": "${CURRENT_VERSION}",
  "toVersion": "${NEW_VERSION}",
  "component": "${UPDATE_COMPONENT}",
  "runtimeRoot": "${APP_DIR}",
  "backupRoot": "${BACKUP_DIR}"
}
EOF

echo -n "  Backing up application files... "
cp -r "$APP_DIR/server" "$BACKUP_PATH/" 2>/dev/null || true
cp -r "$APP_DIR/client" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/package.json" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/package-lock.json" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/version.json" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/release-manifest.json" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/release-manifest.sig" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/.env" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/ecosystem.config.cjs" "$BACKUP_PATH/" 2>/dev/null || true
cp "$APP_DIR/server/config/release-signing-public.pem" "$BACKUP_PATH/" 2>/dev/null || true
if [ -d "$APP_DIR/scripts" ]; then
  cp -r "$APP_DIR/scripts" "$BACKUP_PATH/" 2>/dev/null || true
fi
if [ -d "$APP_DIR/migrations" ]; then
  cp -r "$APP_DIR/migrations" "$BACKUP_PATH/" 2>/dev/null || true
fi
ok "Files backed up"

echo -n "  Backing up database...          "
if pg_dump_with_progress "$BACKUP_PATH/database_${TIMESTAMP}.sql"; then
  DB_SIZE=$(du -sh "$BACKUP_PATH/database_${TIMESTAMP}.sql" 2>/dev/null | cut -f1)
  echo "DB_DUMP_SIZE : ${DB_SIZE}"
  ok "Database backed up ($DB_SIZE)"
  ROLLBACK_DB=true
else
  fail "Database backup failed (pg_dump). Aborting update before any runtime mutation."
  exit 1
fi

echo ""
info "Backup location: $BACKUP_PATH"
DATA_PARITY_BASELINE_FILE="/tmp/learnplay-onprem-data-parity-baseline-${TIMESTAMP}.json"
DATA_PARITY_ALLOW_EMPTY_DROP_TABLES=""
DATA_PARITY_SNAKE_TABLES_RAW="$(sudo -u "$APP_USER" bash -c '
  DB_URL="$(grep -E "^DATABASE_URL=" "'"$APP_DIR"'/.env" 2>/dev/null | tail -n 1 | cut -d= -f2-)"
  psql -X -At -d "${DB_URL:-}" -c "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = ''public'' AND table_type = ''BASE TABLE'' AND table_name ~ ''^[a-z0-9]+(_[a-z0-9]+)+$'';" 2>/dev/null || true
')"
if [ -n "${DATA_PARITY_SNAKE_TABLES_RAW:-}" ] && [ "${DATA_PARITY_SNAKE_TABLES_RAW}" != "null" ]; then
  DATA_PARITY_ALLOW_EMPTY_DROP_TABLES="sessions,${DATA_PARITY_SNAKE_TABLES_RAW}"
fi
DATA_PARITY_SNAPSHOT_SCRIPT="$APP_DIR/scripts/data-parity-gate.mjs"
if [ ! -f "$DATA_PARITY_SNAPSHOT_SCRIPT" ] && [ -f "$DIST_DIR/scripts/data-parity-gate.mjs" ]; then
  DATA_PARITY_SNAPSHOT_SCRIPT="$DIST_DIR/scripts/data-parity-gate.mjs"
fi
echo -n "  Capturing pre-update data parity baseline... "
if sudo -u "$APP_USER" bash -c '
  set -a
  if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
  set +a
  node "'"$DATA_PARITY_SNAPSHOT_SCRIPT"'" snapshot --db-url "${DATABASE_URL:-}" --out "'"$DATA_PARITY_BASELINE_FILE"'"
' >> "$UPDATE_LOG" 2>&1; then
  ok "Done"
else
  fail "Failed to capture pre-update data parity baseline — check $UPDATE_LOG"
  exit 1
fi

step 5 "Stopping Application"

echo -n "  Stopping LearnPlay...           "
systemctl stop "$APP_SERVICE_NAME" 2>/dev/null || true
stop_pm2_app_runtime
sleep 3
ok "Application stopped"

step 6 "Updating Files"

echo -n "  Copying server files...         "
cp -r "$DIST_DIR/server" "$APP_DIR/"
ok "Done"

echo -n "  Copying client files...         "
cp -r "$DIST_DIR/client" "$APP_DIR/"
ok "Done"

if [ -d "$DIST_DIR/migrations" ]; then
  if [ -d "$APP_DIR/migrations" ]; then
    declare -A package_migration_files=()
    declare -A runtime_prefix_seen=()
    declare -A runtime_prefix_dupe=()
    runtime_only_migrations=()
    while IFS= read -r pkg_sql; do
      [ -f "$pkg_sql" ] || continue
      package_migration_files["$(basename "$pkg_sql")"]=1
    done < <(find "$DIST_DIR/migrations" -maxdepth 1 -name "*.sql" | sort)

    while IFS= read -r runtime_sql; do
      [ -f "$runtime_sql" ] || continue
      runtime_name="$(basename "$runtime_sql")"
      runtime_prefix="${runtime_name%%_*}"
      if [[ "$runtime_prefix" =~ ^[0-9]{4}$ ]]; then
        if [ -n "${runtime_prefix_seen[$runtime_prefix]:-}" ]; then
          runtime_prefix_dupe["$runtime_prefix"]=1
        fi
        runtime_prefix_seen["$runtime_prefix"]=1
      fi
      if [ -z "${package_migration_files[$runtime_name]:-}" ]; then
        runtime_only_migrations+=("$runtime_name")
      fi
    done < <(find "$APP_DIR/migrations" -maxdepth 1 -name "*.sql" | sort)

    if [ "${#runtime_only_migrations[@]}" -gt 0 ] || [ "${#runtime_prefix_dupe[@]}" -gt 0 ]; then
      warn "Stale runtime migration set detected before sync (runtime-only files: ${#runtime_only_migrations[@]}, duplicate runtime prefixes: ${#runtime_prefix_dupe[@]}). Clean migration sync will replace runtime migrations."
      if [ "${#runtime_only_migrations[@]}" -gt 0 ]; then
        warn "Runtime-only migrations (sample): $(printf '%s, ' "${runtime_only_migrations[@]:0:8}" | sed 's/, $//')"
      fi
      if [ "${#runtime_prefix_dupe[@]}" -gt 0 ]; then
        warn "Duplicate runtime migration prefixes: $(printf '%s, ' "${!runtime_prefix_dupe[@]}" | sed 's/, $//')"
      fi
    fi
  fi

  echo -n "  Syncing migrations (clean)...   "
  rm -rf "$APP_DIR/migrations"
  cp -r "$DIST_DIR/migrations" "$APP_DIR/"
  ok "Done"
fi

if [ -d "$DIST_DIR/scripts" ]; then
  echo -n "  Copying scripts...              "
  mkdir -p "$APP_DIR/scripts"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude 'update.sh' "$DIST_DIR/scripts/" "$APP_DIR/scripts/" >> "$UPDATE_LOG" 2>&1
  else
    for script_file in "$DIST_DIR/scripts"/*; do
      [ -f "$script_file" ] || continue
      if [ "$(basename "$script_file")" = "update.sh" ]; then
        continue
      fi
      cp -f "$script_file" "$APP_DIR/scripts/"
    done
  fi
  stage_new_update_script
  ok "Done"
fi

echo -n "  Updating version info...        "
cp "$DIST_DIR/package.json" "$APP_DIR/"
if [ -f "$DIST_DIR/package-lock.json" ]; then
  cp "$DIST_DIR/package-lock.json" "$APP_DIR/"
fi
if [ -f "$DIST_DIR/ecosystem.config.cjs" ]; then
  cp "$DIST_DIR/ecosystem.config.cjs" "$APP_DIR/"
fi
cp "$DIST_DIR/version.json" "$APP_DIR/"
cp "$DIST_DIR/release-manifest.json" "$APP_DIR/"
if [ -f "$DIST_DIR/schema-full.sql" ]; then
  cp "$DIST_DIR/schema-full.sql" "$APP_DIR/"
fi
if [ -f "$DIST_DIR/create-enums.sql" ]; then
  cp "$DIST_DIR/create-enums.sql" "$APP_DIR/"
fi
if [ -f "$DIST_DIR/schema-fingerprint.env" ]; then
  cp "$DIST_DIR/schema-fingerprint.env" "$APP_DIR/"
fi
if [ -f "$DIST_DIR/schema-contract.env" ]; then
  cp "$DIST_DIR/schema-contract.env" "$APP_DIR/"
fi
if [ -f "$DIST_DIR/release-manifest.sig" ]; then
  cp "$DIST_DIR/release-manifest.sig" "$APP_DIR/"
else
  rm -f "$APP_DIR/release-manifest.sig" 2>/dev/null || true
fi
if [ -f "$DIST_DIR/server/config/release-signing-public.pem" ]; then
  mkdir -p "$APP_DIR/server/config"
  cp "$DIST_DIR/server/config/release-signing-public.pem" "$APP_DIR/server/config/"
fi
ok "Done"

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
info "Note: .env is preserved (not overwritten)"
ensure_onprem_runtime_flags_mandatory

CRITICAL_FAILURE=false
SKIP_INTERNAL_DEV_DIFF_CHECK=false
if is_internal_learnplay_dev_host; then
  SKIP_INTERNAL_DEV_DIFF_CHECK=true
fi

step 7 "Installing Dependencies"

echo -n "  Installing production dependencies... "
cd "$APP_DIR"
DEPS_FINGERPRINT_FILE="$APP_DIR/node_modules/.learnplay-deps-fingerprint.sha256"
DEPS_FINGERPRINT_CURRENT="$( ( [ -f "$APP_DIR/package-lock.json" ] && cat "$APP_DIR/package-lock.json"; cat "$APP_DIR/package.json" ) | sha256sum | awk '{print $1}' )"
DEPS_FINGERPRINT_PREVIOUS="$(cat "$DEPS_FINGERPRINT_FILE" 2>/dev/null | tr -d '[:space:]' || true)"
if [ -d "$APP_DIR/node_modules" ] && [ -n "$DEPS_FINGERPRINT_PREVIOUS" ] && [ "$DEPS_FINGERPRINT_PREVIOUS" = "$DEPS_FINGERPRINT_CURRENT" ]; then
  ok "Already up to date (dependency fingerprint match)"
else
  if npm install --omit=dev >> "$UPDATE_LOG" 2>&1; then
    mkdir -p "$APP_DIR/node_modules" 2>/dev/null || true
    printf '%s\n' "$DEPS_FINGERPRINT_CURRENT" > "$DEPS_FINGERPRINT_FILE" 2>/dev/null || true
    ok "Dependencies updated"
  else
    fail "npm install failed — check $UPDATE_LOG"
    CRITICAL_FAILURE=true
  fi
fi

if [ "$CRITICAL_FAILURE" != true ]; then

step 8 "Running Database Migrations"

echo -n "  Enforcing snake->camel table parity... "
if sudo -u "$APP_USER" bash -c '
  set -a
  if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
  set +a
  node "'"$APP_DIR"'/scripts/remediate-snake-case-tables.mjs" --db-url "${DATABASE_URL:-}"
' >> "$UPDATE_LOG" 2>&1; then
  ok "Done"
else
  fail "Snake->camel table parity remediation failed — check $UPDATE_LOG"
  CRITICAL_FAILURE=true
fi

if [ "$SKIP_INTERNAL_DEV_DIFF_CHECK" = true ]; then
  info "Skipping DEV drift/parity preflight on internal DEV host (DEV DB is source of truth here)."
else
  echo -n "  Migration governance preflight... "
  if sudo -u "$APP_USER" bash -c '
    node "'"$APP_DIR"'/scripts/migration-governance.mjs" validate --deployment-mode onprem
  ' >> "$UPDATE_LOG" 2>&1; then
    ok "Preflight complete"
  else
    fail "Migration governance preflight failed — check $UPDATE_LOG"
    CRITICAL_FAILURE=true
  fi
fi

if [ "$CRITICAL_FAILURE" = true ]; then
  :
else
echo -n "  Executing migration runner...   "
if sudo -u "$APP_USER" bash -c '
  set -a
  if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
  set +a
  DEPLOYMENT_MODE=onprem node "'"$APP_DIR"'/scripts/migrate.js"
' >> "$UPDATE_LOG" 2>&1; then
  ok "Migrations complete"
else
  warn "Migration runner failed in standard mode; attempting guarded recovery retry."
  if sudo -u "$APP_USER" bash -c '
    set -a
    if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
    set +a
    export DEPLOYMENT_MODE=onprem
    export MIGRATION_RECOVERY_MODE=true
    export ALLOW_JOURNAL_REPAIR=true
    node "'"$APP_DIR"'/scripts/migrate.js"
  ' >> "$UPDATE_LOG" 2>&1; then
    ok "Migrations complete (recovery retry)"
  else
    fail "Migration failed — check $UPDATE_LOG for details"
    CRITICAL_FAILURE=true
  fi
fi
fi

if [ "$CRITICAL_FAILURE" != true ]; then
  if ! ensure_required_supported_languages; then
    CRITICAL_FAILURE=true
  fi
fi

if [ "$CRITICAL_FAILURE" != true ]; then
  if [ "$SKIP_INTERNAL_DEV_DIFF_CHECK" = true ]; then
    info "Skipping post-migration DEV drift/parity verify on internal DEV host."
  else
    echo -n "  Post-migration governance verify... "
    if sudo -u "$APP_USER" bash -c '
      set -a
      if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
      set +a
      node "'"$APP_DIR"'/scripts/migration-governance.mjs" verify-runtime-contract --deployment-mode onprem --db-url "${DATABASE_URL:-}" --contract-schema-file "'"$APP_DIR"'/schema-full.sql" --functional-only
    ' >> "$UPDATE_LOG" 2>&1; then
      ok "Verified"
    else
      fail "Post-migration governance verify failed — check $UPDATE_LOG"
      CRITICAL_FAILURE=true
    fi
  fi
fi

if [ "$CRITICAL_FAILURE" != true ]; then
  if [ "$SKIP_INTERNAL_DEV_DIFF_CHECK" = true ]; then
    info "Skipping functional schema contract auto-repair on internal DEV host."
  else
    echo -n "  Reconciling functional schema contract... "
    if ensure_schema_contract_compatibility && LEARNPLAY_SCHEMA_ARCHIVE_EXTRA_OBJECTS=true archive_non_contract_public_objects; then
      ok "Done"
    else
      fail "Functional schema contract reconciliation failed — check $UPDATE_LOG"
      CRITICAL_FAILURE=true
    fi
  fi
fi

info "Schema replay/pruning legacy path remains disabled in automated update flow for data safety."

if [ "$CRITICAL_FAILURE" != true ]; then
  if ! verify_schema_parity_fingerprint; then
    CRITICAL_FAILURE=true
  fi
fi

if [ "$CRITICAL_FAILURE" != true ] && [ -n "${DATA_PARITY_BASELINE_FILE:-}" ] && [ -f "$DATA_PARITY_BASELINE_FILE" ]; then
  echo -n "  Verifying post-migration data parity... "
  if sudo -u "$APP_USER" bash -c '
    set -a
    if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
    set +a
    if [ -n "'"${DATA_PARITY_ALLOW_EMPTY_DROP_TABLES:-}"'" ]; then
      node "'"$APP_DIR"'/scripts/data-parity-gate.mjs" verify --db-url "${DATABASE_URL:-}" --before "'"$DATA_PARITY_BASELINE_FILE"'" --allow-empty-drop-tables "'"${DATA_PARITY_ALLOW_EMPTY_DROP_TABLES}"'"
    else
      node "'"$APP_DIR"'/scripts/data-parity-gate.mjs" verify --db-url "${DATABASE_URL:-}" --before "'"$DATA_PARITY_BASELINE_FILE"'"
    fi
  ' >> "$UPDATE_LOG" 2>&1; then
    ok "Done"
  else
    fail "Post-migration data parity verification failed — check $UPDATE_LOG"
    CRITICAL_FAILURE=true
  fi
fi

if [ -n "${DATA_PARITY_BASELINE_FILE:-}" ] && [ -f "$DATA_PARITY_BASELINE_FILE" ]; then
  rm -f "$DATA_PARITY_BASELINE_FILE" 2>/dev/null || true
fi

if [ "$CRITICAL_FAILURE" != true ]; then
  echo -n "  Verifying platform access baseline... "
  if ! ensure_platform_superadmin || ! ensure_support_bootstrap_user; then
    if [ "$SKIP_INTERNAL_DEV_DIFF_CHECK" = true ]; then
      warn "Platform access baseline verification failed on internal DEV host — continuing (non-blocking)"
    else
      fail "Platform access baseline verification failed"
      CRITICAL_FAILURE=true
    fi
  else
    ok "Done"
  fi
fi

info "Skipping packaged platform data sync during update (migration-only upgrades enforced)."

if [ -d "$DIST_DIR/uploads" ]; then
  echo -n "  Syncing file assets...          "
  rsync -a --ignore-existing "$DIST_DIR/uploads/" "$UPLOAD_DIR/" >> "$UPDATE_LOG" 2>&1
  chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR"
  ok "Assets synced"
fi

reconcile_public_asset_links

if [ -n "${BASE_URL:-}" ]; then
  echo -n "  Patching domain references...   "
  find "$APP_DIR/client" -name "*.js" -exec sed -i "s|https://learnplay.replit.app|$BASE_URL|g" {} + 2>/dev/null || true
  find "$APP_DIR/client" -name "*.html" -exec sed -i "s|https://learnplay.replit.app|$BASE_URL|g" {} + 2>/dev/null || true
  ok "Done"
fi

SKIP_NGINX_AUTOCONFIG="$(get_env_value LEARNPLAY_SKIP_NGINX_AUTOCONFIG)"
SKIP_NGINX_AUTOCONFIG="${SKIP_NGINX_AUTOCONFIG:-false}"
if [ "$SKIP_NGINX_AUTOCONFIG" = "true" ]; then
  echo -n "  Updating Nginx configuration... "
  ok "Skipped (LEARNPLAY_SKIP_NGINX_AUTOCONFIG=true)"
elif [ -f "$DIST_DIR/nginx.conf.template" ] && [ -f "$APP_DIR/.env" ]; then
  echo -n "  Updating Nginx configuration... "
  UPD_DOMAIN=$(grep -E "^BASE_URL=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2- | sed 's|https\?://||' | sed 's|/.*||' || true)
  UPD_UPLOAD_DIR=$(grep -E "^UPLOAD_DIR=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 || echo "${APP_DIR}/uploads")
  UPD_APP_PORT=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  UPD_HTTP_PORT=$(grep -E "^NGINX_HTTP_PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  UPD_HTTPS_PORT=$(grep -E "^NGINX_HTTPS_PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  UPD_SSL_SETUP=$(grep -E "^LEARNPLAY_SETUP_SSL=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  UPD_BEHIND_CADDY=$(grep -E "^LEARNPLAY_BEHIND_CADDY=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
  UPD_DOMAIN="${UPD_DOMAIN:-localhost}"
  UPD_UPLOAD_DIR="${UPD_UPLOAD_DIR:-${APP_DIR}/uploads}"
  UPD_APP_PORT="${UPD_APP_PORT:-3000}"
  UPD_HTTP_PORT="${UPD_HTTP_PORT:-80}"
  UPD_HTTPS_PORT="${UPD_HTTPS_PORT:-443}"

  NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"

  FORCE_HTTP_BACKEND=false
  if [ "$UPD_SSL_SETUP" = "caddy-http" ] || [ "$(printf '%s' "${UPD_BEHIND_CADDY:-false}" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
    FORCE_HTTP_BACKEND=true
  fi

  CURRENT_SSL_MODE="http"
  if [ "$FORCE_HTTP_BACKEND" != true ] && [ -f "$NGINX_CONF" ] && grep -qE 'listen [0-9]+ ssl' "$NGINX_CONF" 2>/dev/null; then
    if grep -q 'return 444' "$NGINX_CONF" 2>/dev/null; then
      CURRENT_SSL_MODE="https"
    elif grep -q 'return 301 https' "$NGINX_CONF" 2>/dev/null; then
      CURRENT_SSL_MODE="prefer-https"
    else
      CURRENT_SSL_MODE="https"
    fi
  fi

  if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "$NGINX_CONF.pre-update" 2>/dev/null || true
  fi

  sed "s/__DOMAIN__/$UPD_DOMAIN/g; s|__UPLOAD_DIR__|$UPD_UPLOAD_DIR|g; s/__APP_PORT__/$UPD_APP_PORT/g; s/__NGINX_HTTP_PORT__/$UPD_HTTP_PORT/g; s/__NGINX_HTTPS_PORT__/$UPD_HTTPS_PORT/g" \
    "$DIST_DIR/nginx.conf.template" > "$NGINX_CONF"
  ln -sfn "$NGINX_CONF" "/etc/nginx/sites-enabled/$APP_NAME"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

  NGINX_REGEN_OK=false
  if [ "$FORCE_HTTP_BACKEND" = true ]; then
    if nginx -t >> "$UPDATE_LOG" 2>&1; then
      systemctl reload nginx >> "$UPDATE_LOG" 2>&1 || true
      NGINX_REGEN_OK=true
      ok "Done (Behind Caddy mode: HTTP backend preserved)"
    fi
  elif [ "$CURRENT_SSL_MODE" != "http" ] && [ -f "$APP_DIR/scripts/ssl-mode.sh" ]; then
    if bash "$APP_DIR/scripts/ssl-mode.sh" "$CURRENT_SSL_MODE" >> "$UPDATE_LOG" 2>&1; then
      NGINX_REGEN_OK=true
      ok "Done (SSL mode: $CURRENT_SSL_MODE preserved)"
    fi
  else
    if nginx -t >> "$UPDATE_LOG" 2>&1; then
      systemctl reload nginx >> "$UPDATE_LOG" 2>&1 || true
      NGINX_REGEN_OK=true
      ok "Done (HTTP mode)"
    fi
  fi

  if [ "$NGINX_REGEN_OK" != true ]; then
    if [ -f "$NGINX_CONF.pre-update" ]; then
      cp "$NGINX_CONF.pre-update" "$NGINX_CONF"
      nginx -t >> "$UPDATE_LOG" 2>&1 && systemctl reload nginx >> "$UPDATE_LOG" 2>&1 || true
      warn "Nginx config regeneration failed — previous config restored"
    else
      warn "Nginx config test failed — check $UPDATE_LOG"
    fi
  fi
  rm -f "$NGINX_CONF.pre-update" 2>/dev/null || true
fi

fi # end CRITICAL_FAILURE guard for steps 8+

HEALTH_OK=false

if [ "$CRITICAL_FAILURE" != true ]; then

step 9 "Starting Application"

echo -n "  Starting LearnPlay...           "
cd "$APP_DIR"
ensure_systemd_app_service
stop_pm2_app_runtime
systemctl start "$APP_SERVICE_NAME" >> "$UPDATE_LOG" 2>&1
ok "Started"

echo -n "  Waiting for health check...     "
sleep 8

UPDATE_APP_PORT=""
if [ -f "$APP_DIR/.env" ]; then
  UPDATE_APP_PORT=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
fi
UPDATE_APP_PORT="${UPDATE_APP_PORT:-3000}"

for i in $(seq 1 10); do
  if curl -sf "http://127.0.0.1:${UPDATE_APP_PORT}/api/health" > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  echo -n "."
  sleep 3
done

if [ "$HEALTH_OK" = true ]; then
  ok "Application is healthy"
else
  fail "Health check failed after 30 seconds"
fi

fi # end CRITICAL_FAILURE guard for step 9

if [ "$HEALTH_OK" = true ]; then
  step 10 "Post-Update Media Backfill"
  run_podcast_hls_backfill

  COMPLETE_STEP=11
else
  COMPLETE_STEP=10
fi

if [ "$HEALTH_OK" = true ]; then
  step "$COMPLETE_STEP" "Update Complete"
  
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                                      ║${NC}"
  echo -e "${GREEN}║${NC}${WHITE}${BOLD}         Update Completed Successfully!               ${NC}${GREEN}║${NC}"
  echo -e "${GREEN}║                                                      ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║${NC}                                                      ${GREEN}║${NC}"
  echo -e "${GREEN}║${NC}  Previous: ${DIM}${CURRENT_VERSION_DISPLAY}${NC}"
  echo -e "${GREEN}║${NC}  Current:  ${GREEN}${BOLD}${NEW_VERSION_DISPLAY}${NC}"
  [ "$PENDING_MIGRATIONS" -gt 0 ] && echo -e "${GREEN}║${NC}  Migrations applied: ${BOLD}${PENDING_MIGRATIONS}${NC}"
  echo -e "${GREEN}║${NC}  Backup:   ${DIM}${BACKUP_PATH}${NC}"
  echo -e "${GREEN}║${NC}  Log:      ${DIM}${UPDATE_LOG}${NC}"
  echo -e "${GREEN}║${NC}                                                      ${GREEN}║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  write_runtime_identity
  write_release_provenance
  promote_staged_update_script
  if [ "$UPDATE_COMPONENT" = "all" ] || [ "$UPDATE_COMPONENT" = "app-db" ]; then
    step $((COMPLETE_STEP + 1)) "Updating lppadmin Command"
    update_lppadmin_command || warn "lppadmin command update failed; app update remains successful"
  fi
else
  step 10 "Rolling Back"
  
  warn "Health check failed — initiating automatic rollback..."
  echo ""

  echo -n "  Stopping failed deployment...   "
  systemctl stop "$APP_SERVICE_NAME" >> "$UPDATE_LOG" 2>&1 || true
  stop_pm2_app_runtime
  ok "Stopped"

  echo -n "  Restoring application files...  "
  cp -r "$BACKUP_PATH/server" "$APP_DIR/" 2>/dev/null || true
  cp -r "$BACKUP_PATH/client" "$APP_DIR/" 2>/dev/null || true
  cp "$BACKUP_PATH/package.json" "$APP_DIR/" 2>/dev/null || true
  cp "$BACKUP_PATH/package-lock.json" "$APP_DIR/" 2>/dev/null || true
  cp "$BACKUP_PATH/version.json" "$APP_DIR/" 2>/dev/null || true
  cp "$BACKUP_PATH/release-manifest.json" "$APP_DIR/" 2>/dev/null || true
  cp "$BACKUP_PATH/release-manifest.sig" "$APP_DIR/" 2>/dev/null || true
  if [ -f "$BACKUP_PATH/release-signing-public.pem" ]; then
    mkdir -p "$APP_DIR/server/config"
    cp "$BACKUP_PATH/release-signing-public.pem" "$APP_DIR/server/config/"
  fi
  if [ -d "$BACKUP_PATH/migrations" ]; then
    cp -r "$BACKUP_PATH/migrations" "$APP_DIR/" 2>/dev/null || true
  fi
  if [ -d "$BACKUP_PATH/scripts" ]; then
    cp -r "$BACKUP_PATH/scripts" "$APP_DIR/" 2>/dev/null || true
  fi
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  ok "Files restored"

  echo -n "  Restoring dependencies...       "
  cd "$APP_DIR"
  npm install --omit=dev >> "$UPDATE_LOG" 2>&1 || true
  ok "Dependencies restored"

  if [ "$ROLLBACK_DB" = true ] && [ -f "$BACKUP_PATH/database_${TIMESTAMP}.sql" ]; then
    echo -n "  Restoring database...           "
    if sudo -u postgres dropdb --if-exists "$DB_NAME" >> "$UPDATE_LOG" 2>&1; then
      :
    else
      warn "dropdb reported an error for '$DB_NAME' (continuing with recreate)"
    fi

    if sudo -u postgres psql -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname='${DB_OWNER//\'/\'\'}'" | grep -q 1; then
      if ! sudo -u postgres createdb -O "$DB_OWNER" "$DB_NAME" >> "$UPDATE_LOG" 2>&1; then
        fail "Failed to recreate database '$DB_NAME' with owner '$DB_OWNER' during rollback"
        exit 1
      fi
    else
      warn "Role '$DB_OWNER' not found in PostgreSQL; recreating '$DB_NAME' owned by postgres"
      if ! sudo -u postgres createdb "$DB_NAME" >> "$UPDATE_LOG" 2>&1; then
        fail "Failed to recreate database '$DB_NAME' during rollback"
        exit 1
      fi
    fi

    if sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" < "$BACKUP_PATH/database_${TIMESTAMP}.sql" >> "$UPDATE_LOG" 2>&1; then
      ok "Database restored from backup"
    else
      fail "Database restore failed for '$DB_NAME' — rollback is incomplete"
      exit 1
    fi
  else
    warn "Database was NOT rolled back (no backup available)"
    info "Manual restore: psql $DB_NAME < $BACKUP_PATH/database_${TIMESTAMP}.sql"
  fi

  echo -n "  Restarting previous version...  "
  cd "$APP_DIR"
  ensure_systemd_app_service
  stop_pm2_app_runtime
  systemctl start "$APP_SERVICE_NAME" >> "$UPDATE_LOG" 2>&1 || true
  sleep 5

  rollback_port="$(get_env_value PORT)"
  rollback_port="${rollback_port:-$UPDATE_APP_PORT}"
  rollback_port="${rollback_port:-3000}"

  if curl -sf "http://127.0.0.1:${rollback_port}/api/health" > /dev/null 2>&1; then
    ok "Previous version restored and healthy"
  else
    fail "Rollback completed but health check still failing"
    info "Check logs: sudo journalctl -u ${APP_SERVICE_NAME}.service -n 200 --no-pager"
  fi

  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                                                      ║${NC}"
  echo -e "${RED}║${NC}${WHITE}${BOLD}          Update Failed — Rolled Back                 ${NC}${RED}║${NC}"
  echo -e "${RED}║                                                      ║${NC}"
  echo -e "${RED}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${RED}║${NC}                                                      ${RED}║${NC}"
  echo -e "${RED}║${NC}  Version:  ${BOLD}${CURRENT_VERSION_DISPLAY}${NC} ${DIM}(restored)${NC}"
  echo -e "${RED}║${NC}  Log:      ${DIM}${UPDATE_LOG}${NC}"
  echo -e "${RED}║${NC}                                                      ${RED}║${NC}"
  echo -e "${RED}║${NC}  ${YELLOW}Review the log file for details on the failure.${NC}"
  echo -e "${RED}║${NC}                                                      ${RED}║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
  exit 1
fi

echo ""
log "🧹 Cleaning old backups (keeping last 5)..."
apply_backup_retention
log "🧹 Optimizing runtime disk usage..."
apply_runtime_space_optimization

log "Update log saved to: $UPDATE_LOG"
