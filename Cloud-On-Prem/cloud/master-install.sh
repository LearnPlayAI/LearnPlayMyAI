#!/usr/bin/env bash
#
# LearnPlay Master Installer
# ═══════════════════════════════════════════════════════════════════════════
#
# This orchestrator script:
#   1. Collects ALL user inputs upfront (non-interactive after collection)
#   2. Exports inputs as environment variables: LEARNPLAY_*
#   3. Runs installation scripts in sequence
#   4. Displays comprehensive final summary
#
# Environment variables exported by this script (for individual scripts to check):
#   LEARNPLAY_SSH_PORT        — SSH port (default: 22)
#   LEARNPLAY_TIMEZONE        — Server timezone (default: current system timezone)
#   LEARNPLAY_DOMAIN          — Application domain (required)
#   LEARNPLAY_ADMIN_EMAIL     — Admin email for alerts (required)
#   LEARNPLAY_DB_PASSWORD     — Database password (auto-generated if empty)
#   LEARNPLAY_SMTP_FROM       — Default sender address (non-sensitive)
#   LEARNPLAY_UPLOAD_DIR      — Local upload storage path (default: /opt/learnplay/cloud/uploads)
#   LEARNPLAY_MODE            — Operating mode (always "A" — LearnPlay-managed keys)
#   Integration secrets (SMTP/MailerSend/Gemini/Gamma/YOCO/ElevenLabs) are managed after install in /admin/integration-settings
#   LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY — Cloud license private key (required)
#   LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD — Shared HMAC secret for onprem -> Cloud PRD signed check-ins (optional bootstrap path)
#   LEARNPLAY_ORG_NAME        — Organization name (required)
#   LEARNPLAY_ADMIN_PASSWORD  — Admin password (required)
#   LEARNPLAY_SETUP_SSL       — SSL setup mode (self-signed-https|letsencrypt-https|caddy-http)
#   LEARNPLAY_DIST_DIR        — Path to dist-cloud distribution package
#
# Usage:
#   sudo bash /path/to/master-install.sh
#
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

LOG_FILE="/var/log/learnplay-master-install.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${LEARNPLAY_APP_DIR:-/opt/learnplay/cloud}"
ENV_FILE="$APP_DIR/.env"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

resolve_backup_root() {
  local preferred="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"
  local fallback="/opt/lpdb/cloud/lppbackups"
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
  echo "/tmp/lppbackups/cloud"
}
LEARNPLAY_BACKUP_DIR="$(resolve_backup_root)"

normalize_timezone_input() {
  local raw="$1"
  local upper
  upper="$(echo "$raw" | tr '[:lower:]' '[:upper:]')"
  case "$upper" in
    SAST) echo "Africa/Johannesburg" ;;
    UTC|GMT|Z) echo "UTC" ;;
    EST) echo "America/New_York" ;;
    CST) echo "America/Chicago" ;;
    MST) echo "America/Denver" ;;
    PST) echo "America/Los_Angeles" ;;
    BST) echo "Europe/London" ;;
    CET) echo "Europe/Paris" ;;
    EET) echo "Europe/Athens" ;;
    IST) echo "Asia/Kolkata" ;;
    JST) echo "Asia/Tokyo" ;;
    AEST) echo "Australia/Sydney" ;;
    NZST) echo "Pacific/Auckland" ;;
    *) echo "$raw" ;;
  esac
}

ssl_mode_label() {
  case "${1:-self-signed-https}" in
    letsencrypt-https) echo "HTTPS-only (Let's Encrypt)" ;;
    caddy-http) echo "Behind Caddy (HTTP backend, no local TLS redirect)" ;;
    *) echo "HTTPS-only (self-signed)" ;;
  esac
}

is_valid_iana_timezone() {
  local tz="$1"
  timedatectl list-timezones 2>/dev/null | grep -Fxq "$tz"
}

detect_current_system_timezone() {
  local tz=""
  tz="$(timedatectl show -p Timezone --value 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -z "$tz" ] && [ -f /etc/timezone ]; then
    tz="$(head -n 1 /etc/timezone 2>/dev/null | tr -d '[:space:]' || true)"
  fi
  tz="$(normalize_timezone_input "${tz:-}")"
  if is_valid_iana_timezone "$tz"; then
    echo "$tz"
    return 0
  fi
  echo "Africa/Johannesburg"
}

prompt_for_timezone() {
  local input normalized default_tz confirm_utc
  default_tz="$(detect_current_system_timezone)"
  while true; do
    read -p "Timezone [${default_tz}] (IANA, e.g., Africa/Johannesburg): " input
    input="$(printf '%s' "${input:-}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [ -z "$input" ]; then
      if [ "$default_tz" = "Etc/UTC" ] && [ "${LEARNPLAY_ALLOW_UTC_DEFAULT:-false}" != "true" ]; then
        read -p "  Keep timezone as Etc/UTC? (y/N): " confirm_utc
        confirm_utc="$(printf '%s' "${confirm_utc:-}" | tr '[:upper:]' '[:lower:]')"
        if [ "$confirm_utc" != "y" ] && [ "$confirm_utc" != "yes" ]; then
          echo "  ↳ Please enter your preferred IANA timezone (e.g., Africa/Johannesburg)."
          continue
        fi
      fi
      input="$default_tz"
    fi
    normalized="$(normalize_timezone_input "$input")"
    if is_valid_iana_timezone "$normalized"; then
      if [ "$normalized" != "$input" ]; then
        echo "  ↳ Using $normalized for input '$input'"
      fi
      LEARNPLAY_TIMEZONE="$normalized"
      return 0
    fi
    echo "  ❌ Invalid timezone '$input'. Use an IANA timezone like UTC or Africa/Johannesburg."
  done
}

resolve_app_user() {
  local user=""
  if [ -f "$ENV_FILE" ]; then
    user=$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
  fi
  if [ -z "$user" ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    user="$SUDO_USER"
  fi
  if [ -z "$user" ] && [ -d "$APP_DIR" ]; then
    user=$(stat -c '%U' "$APP_DIR" 2>/dev/null)
  fi
  echo "${user:-root}"
}
APP_USER="$(resolve_app_user)"

has_mount_option() {
  local target="$1"
  local option="$2"
  local opts=""
  opts=$(findmnt -no OPTIONS "$target" 2>/dev/null || true)
  if [ -z "$opts" ]; then
    return 1
  fi
  IFS=',' read -r -a arr <<< "$opts"
  for o in "${arr[@]}"; do
    [ "$o" = "$option" ] && return 0
  done
  return 1
}

validate_required_directories() {
  log "📁 Validating required production directories..."
  local pg_target_dir="${LEARNPLAY_PGDATA:-/opt/lpdb/cloud/pg16/main}"

  # Required application and backup paths.
  mkdir -p "$APP_DIR" "$LEARNPLAY_BACKUP_DIR"
  chmod 755 "$APP_DIR" "$LEARNPLAY_BACKUP_DIR"

  # Local PostgreSQL data path is required when local DB is used.
  # We create it proactively so db-setup can place PG data here when selected.
  mkdir -p /opt/lpdb "$pg_target_dir"
  chown -R postgres:postgres "$pg_target_dir" 2>/dev/null || true
  chmod 700 /opt/lpdb
  chmod 700 "$pg_target_dir"

  # /home/lppadmin is expected for LearnPlay admin workflows, but do not hard-fail
  # if the customer uses a different admin account.
  if [ ! -d /home/lppadmin ]; then
    log "   ⚠️  /home/lppadmin not found (recommended for standardized admin operations)"
  fi

  # Mount option policy checks (warn-only; host policy may vary).
  has_mount_option "$APP_DIR" nosuid || log "   ⚠️  $APP_DIR is missing mount option: nosuid"
  has_mount_option /opt/lpdb nosuid || log "   ⚠️  /opt/lpdb is missing mount option: nosuid"
  has_mount_option "$LEARNPLAY_BACKUP_DIR" nosuid || log "   ⚠️  $LEARNPLAY_BACKUP_DIR is missing mount option: nosuid"
  has_mount_option /var/log nosuid || log "   ⚠️  /var/log is missing mount option: nosuid"
  has_mount_option /var/log noexec || log "   ⚠️  /var/log is missing mount option: noexec"

  log "   ✅ Directory validation complete"
}

# ─────────────────────────────────────────────────────────────────────────────
# DIST_DIR RESOLUTION
# ─────────────────────────────────────────────────────────────────────────────

resolve_dist_dir() {
  local candidate=""

  # 1. Explicit env var override
  if [ -n "${LEARNPLAY_DIST_DIR:-}" ] && [ -d "${LEARNPLAY_DIST_DIR}/server" ] && [ -f "${LEARNPLAY_DIST_DIR}/package.json" ]; then
    echo "$LEARNPLAY_DIST_DIR"
    return 0
  fi

  # 2. Common extraction locations (prefer freshly uploaded/corrected package)
  for search_dir in /tmp/dist-cloud /var/tmp/dist-cloud; do
    if [ -d "$search_dir/server" ] && [ -f "$search_dir/package.json" ]; then
      echo "$search_dir"
      return 0
    fi
  done

  # 3. Try glob for renamed dist-cloud dirs in /tmp
  for search_dir in /tmp/dist-cloud-*; do
    if [ -d "$search_dir/server" ] && [ -f "$search_dir/package.json" ]; then
      echo "$search_dir"
      return 0
    fi
  done

  # 4. Permanent staging directory (survives /tmp cleanup)
  if [ -d "${APP_DIR}/.dist-staging/server" ] && [ -f "${APP_DIR}/.dist-staging/package.json" ]; then
    echo "${APP_DIR}/.dist-staging"
    return 0
  fi

  # 5. Saved dist source path (written by lppadmin setup)
  if [ -f "${APP_DIR}/.dist-source" ]; then
    candidate="$(cat "${APP_DIR}/.dist-source" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$candidate" ] && [ -d "$candidate/server" ] && [ -f "$candidate/package.json" ]; then
      echo "$candidate"
      return 0
    fi
  fi

  return 1
}

read_dist_version() {
  local dist_dir="$1"
  local ver_file="$dist_dir/version.json"
  if [ -f "$ver_file" ]; then
    grep '"version"' "$ver_file" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2
    return 0
  fi
  echo "unknown"
}

# ─────────────────────────────────────────────────────────────────────────────
# STATE FILE & RESUME SUPPORT
# ─────────────────────────────────────────────────────────────────────────────

STATE_FILE="${APP_DIR}/.install-state"

save_state() {
  mkdir -p "$APP_DIR"
  local sf="$STATE_FILE"
  : > "$sf"
  chmod 600 "$sf"
  chown root:root "$sf"
  local vars=(
    LEARNPLAY_SSH_PORT LEARNPLAY_TIMEZONE LEARNPLAY_DOMAIN LEARNPLAY_ADMIN_EMAIL
    LEARNPLAY_ORG_NAME LEARNPLAY_ADMIN_PASSWORD
    LEARNPLAY_DB_PASSWORD LEARNPLAY_MAILERSEND_KEY LEARNPLAY_SMTP_HOST
    LEARNPLAY_SMTP_PORT LEARNPLAY_SMTP_SECURE LEARNPLAY_SMTP_USER LEARNPLAY_SMTP_PASS
    LEARNPLAY_SMTP_FROM LEARNPLAY_MODE LEARNPLAY_GEMINI_KEY LEARNPLAY_GAMMA_KEY
    LEARNPLAY_YOCO_TEST_PUBLIC_KEY LEARNPLAY_YOCO_TEST_SECRET_KEY
    LEARNPLAY_YOCO_LIVE_PUBLIC_KEY LEARNPLAY_YOCO_LIVE_SECRET_KEY
    LEARNPLAY_YOCO_WEBHOOK_SECRET LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY
    LEARNPLAY_SETUP_SSL LEARNPLAY_BEHIND_CADDY LEARNPLAY_SYSTEM_TYPE
    LEARNPLAY_UPLOAD_DIR LEARNPLAY_GCS_SA_JSON LEARNPLAY_GCS_KEY_FILE
    LEARNPLAY_APP_PORT LEARNPLAY_DB_PORT LEARNPLAY_NGINX_HTTP_PORT LEARNPLAY_NGINX_HTTPS_PORT
    LEARNPLAY_DIST_DIR
  )
  for var in "${vars[@]}"; do
    local val="${!var:-}"
    val="${val//\'/\'\\\'\'}"
    printf "%s='%s'\n" "$var" "$val" >> "$sf"
  done
  printf "PHASE_1_DONE='%s'\n" "${PHASE_1_DONE:-false}" >> "$sf"
  printf "PHASE_2_DONE='%s'\n" "${PHASE_2_DONE:-false}" >> "$sf"
  printf "PHASE_3_DONE='%s'\n" "${PHASE_3_DONE:-false}" >> "$sf"
  printf "PHASE_4_DONE='%s'\n" "${PHASE_4_DONE:-false}" >> "$sf"
  printf "PHASE_5_DONE='%s'\n" "${PHASE_5_DONE:-false}" >> "$sf"
}

# ─────────────────────────────────────────────────────────────────────────────
# DIST STAGING — Copy distribution to permanent location
# ─────────────────────────────────────────────────────────────────────────────

STAGING_DIR="${APP_DIR}/.dist-staging"

stage_dist_package() {
  local source_dir="$1"

  # Skip if already staged from same source
  if [ -d "$STAGING_DIR/server" ] && [ -f "$STAGING_DIR/package.json" ]; then
    if [ -f "$STAGING_DIR/.staged-from" ] && [ "$(cat "$STAGING_DIR/.staged-from" 2>/dev/null)" = "$source_dir" ]; then
      if [ -f "$STAGING_DIR/runtime-assets-manifest.txt" ] && [ -d "$STAGING_DIR/uploads" ]; then
        log "   Distribution already staged from $source_dir"
        return 0
      fi
      log "   Existing staged package is incomplete; re-staging from $source_dir"
    fi
  fi

  # Check disk space (need ~500MB for staging)
  local avail_kb
  avail_kb=$(df -k "$APP_DIR" 2>/dev/null | tail -1 | awk '{print $4}')
  if [ -n "$avail_kb" ] && [ "$avail_kb" -lt 512000 ]; then
    log "❌ Insufficient disk space for staging (need ~500MB, have $((avail_kb / 1024))MB)"
    return 1
  fi

  log "📦 Staging distribution package to permanent location..."
  log "   Source: $source_dir"
  log "   Target: $STAGING_DIR"

  # Remove old staging if exists
  rm -rf "$STAGING_DIR"
  mkdir -p "$STAGING_DIR"

  # Copy essential directories and files
  for item in server client shared data migrations scripts package.json package-lock.json \
              drizzle.config.ts tsconfig.json vite.config.ts tailwind.config.ts \
              postcss.config.js theme.json version.json schema-full.sql create-enums.sql \
              schema-contract.env schema-fingerprint.env \
              ecosystem.config.cjs nginx.conf.template runtime-assets-manifest.txt package-inventory.txt \
              uploads; do
    if [ -e "$source_dir/$item" ]; then
      cp -a "$source_dir/$item" "$STAGING_DIR/" 2>/dev/null || true
    fi
  done

  # Record where we staged from
  echo "$source_dir" > "$STAGING_DIR/.staged-from"

  chmod 700 "$STAGING_DIR"
  chown -R root:root "$STAGING_DIR"

  log "   ✅ Distribution staged successfully"
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# INSTALLATION SUMMARY LOG — Permanent proof of installation outcome
# ─────────────────────────────────────────────────────────────────────────────

INSTALL_SUMMARY="/var/log/learnplay/install-summary.log"

write_install_summary() {
  local outcome="$1"  # "SUCCESS" or "FAILED"
  local failed_phase="${2:-}"

  mkdir -p /var/log/learnplay

  cat > "$INSTALL_SUMMARY" << SUMMARY
═══════════════════════════════════════════════════════════════════
  LearnPlay Installation Summary
  Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')
═══════════════════════════════════════════════════════════════════

  Outcome:          $outcome
  Duration:         ${DURATION:-0} minutes
  Install Date:     $(date '+%Y-%m-%d %H:%M:%S %Z')
  Installer Host:   $(hostname -f 2>/dev/null || hostname)

─── Configuration ─────────────────────────────────────────────────

  Domain:           ${LEARNPLAY_DOMAIN:-not set}
  Admin Email:      ${LEARNPLAY_ADMIN_EMAIL:-not set}
  Organization:     ${LEARNPLAY_ORG_NAME:-not set}
  SSH Port:         ${LEARNPLAY_SSH_PORT:-22}
  Timezone:         ${LEARNPLAY_TIMEZONE:-$(detect_current_system_timezone)}
  API Keys:         LearnPlay-managed (internal cloud)
  System Type:      $([ "${LEARNPLAY_SYSTEM_TYPE:-development}" = "production" ] && echo "Production" || echo "Development")
  App Port:         ${LEARNPLAY_APP_PORT:-3000}
  DB Port:          ${LEARNPLAY_DB_PORT:-5432}
  HTTP Port:        ${LEARNPLAY_NGINX_HTTP_PORT:-80}
  HTTPS Port:       ${LEARNPLAY_NGINX_HTTPS_PORT:-443}
  SSL:              $(ssl_mode_label "${LEARNPLAY_SETUP_SSL:-self-signed-https}")

─── Email ─────────────────────────────────────────────────────────

  Transport:        Configure in Integration Settings UI
  From (default):   ${LEARNPLAY_SMTP_FROM:-not set}

─── Phase Results ─────────────────────────────────────────────────

  Phase 1 (OS Preparation):      $([ "${PHASE_1_DONE:-false}" = "true" ] && echo "✅ PASSED" || echo "⬜ NOT RUN")
  Phase 2 (Dependencies):        $([ "${PHASE_2_DONE:-false}" = "true" ] && echo "✅ PASSED" || echo "⬜ NOT RUN")
  Phase 3 (Database Setup):      $([ "${PHASE_3_DONE:-false}" = "true" ] && echo "✅ PASSED" || echo "⬜ NOT RUN")
  Phase 4 (Performance Tuning):  $([ "${PHASE_4_DONE:-false}" = "true" ] && echo "✅ PASSED" || echo "⬜ NOT RUN")
  Phase 5 (Application):         $([ "${PHASE_5_DONE:-false}" = "true" ] && echo "✅ PASSED" || echo "⬜ NOT RUN")
$([ -n "$failed_phase" ] && echo "
  ❌ FAILED AT: Phase $failed_phase" || echo "")

─── Deployment Details ────────────────────────────────────────────

  Integrations:     Configure after install in /admin/integration-settings
  Cloud License PK: $([ -n "${LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY:-}" ] && echo "Configured" || echo "Not configured")
  OnPrem Sync Auth: $([ -n "${LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD:-}" ] && echo "Configured" || echo "Not configured")
  Payment Gateway:  Configure in /admin/integration-settings
  Admin Role:       SuperAdmin (cloud)

─── Filesystem Layout ─────────────────────────────────────────────

  Application:      ${APP_DIR}/
  Uploads:          ${APP_DIR}/uploads/
  Database:         ${LEARNPLAY_PGDATA:-/opt/lpdb/cloud/pg16/main} (PostgreSQL)
  Backups:          ${LEARNPLAY_BACKUP_DIR:-/lppbackups}/
  Logs:             /var/log/learnplay/

─── Post-Installation ─────────────────────────────────────────────

  Admin Console:    sudo lppadmin
  Full Log:         $LOG_FILE
  This Summary:     $INSTALL_SUMMARY

═══════════════════════════════════════════════════════════════════
SUMMARY

  chmod 644 "$INSTALL_SUMMARY"
  log "   📋 Installation summary written to: $INSTALL_SUMMARY"
}

# ─────────────────────────────────────────────────────────────────────────────
# BANNER & ROOT CHECK
# ─────────────────────────────────────────────────────────────────────────────

if [ -t 1 ] && [ -n "${TERM:-}" ] && [ "${TERM:-}" != "unknown" ]; then
  clear || true
fi
echo "╔════════════════════════════════════════════════╗"
echo "║                                                ║"
echo "║  LearnPlay Cloud (Linux) Master Installer        ║"
echo "║  Complete Server Setup & Deployment            ║"
echo "║                                                ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# PREVIOUS INSTALL DETECTION & INPUT REUSE
# ─────────────────────────────────────────────────────────────────────────────

if [ -f "$STATE_FILE" ]; then
  if bash -n "$STATE_FILE" 2>/dev/null; then
    source "$STATE_FILE"
  else
    echo "  ⚠️  Previous installation state file is corrupted."
    echo "     Starting fresh installation."
    echo ""
    rm -f "$STATE_FILE"
  fi
fi

clear_saved_inputs() {
  local vars=(
    LEARNPLAY_SSH_PORT LEARNPLAY_TIMEZONE LEARNPLAY_DOMAIN LEARNPLAY_ADMIN_EMAIL
    LEARNPLAY_ORG_NAME LEARNPLAY_ADMIN_PASSWORD
    LEARNPLAY_DB_PASSWORD LEARNPLAY_MAILERSEND_KEY LEARNPLAY_SMTP_HOST
    LEARNPLAY_SMTP_PORT LEARNPLAY_SMTP_SECURE LEARNPLAY_SMTP_USER LEARNPLAY_SMTP_PASS
    LEARNPLAY_SMTP_FROM LEARNPLAY_MODE LEARNPLAY_GEMINI_KEY LEARNPLAY_GAMMA_KEY
    LEARNPLAY_YOCO_TEST_PUBLIC_KEY LEARNPLAY_YOCO_TEST_SECRET_KEY
    LEARNPLAY_YOCO_LIVE_PUBLIC_KEY LEARNPLAY_YOCO_LIVE_SECRET_KEY
    LEARNPLAY_YOCO_WEBHOOK_SECRET LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY
    LEARNPLAY_SETUP_SSL LEARNPLAY_BEHIND_CADDY LEARNPLAY_SYSTEM_TYPE LEARNPLAY_UPLOAD_DIR
    LEARNPLAY_GCS_SA_JSON LEARNPLAY_GCS_KEY_FILE
    LEARNPLAY_APP_PORT LEARNPLAY_DB_PORT LEARNPLAY_NGINX_HTTP_PORT LEARNPLAY_NGINX_HTTPS_PORT
    LEARNPLAY_DIST_DIR
  )
  local v
  for v in "${vars[@]}"; do
    unset "$v" || true
  done
  PHASE_1_DONE=false
  PHASE_2_DONE=false
  PHASE_3_DONE=false
  PHASE_4_DONE=false
  PHASE_5_DONE=false
}

if [ -f "$STATE_FILE" ]; then
  COMPLETED=0
  [ "${PHASE_1_DONE:-}" = "true" ] && COMPLETED=$((COMPLETED + 1))
  [ "${PHASE_2_DONE:-}" = "true" ] && COMPLETED=$((COMPLETED + 1))
  [ "${PHASE_3_DONE:-}" = "true" ] && COMPLETED=$((COMPLETED + 1))
  [ "${PHASE_4_DONE:-}" = "true" ] && COMPLETED=$((COMPLETED + 1))
  [ "${PHASE_5_DONE:-}" = "true" ] && COMPLETED=$((COMPLETED + 1))

  if [ "$COMPLETED" -lt 5 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Incomplete Installation Detected"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Completed phases:"
    [ "${PHASE_1_DONE:-}" = "true" ] && echo "    ✅ Phase 1: OS Preparation"
    [ "${PHASE_2_DONE:-}" = "true" ] && echo "    ✅ Phase 2: Dependencies"
    [ "${PHASE_3_DONE:-}" = "true" ] && echo "    ✅ Phase 3: Database Setup"
    [ "${PHASE_4_DONE:-}" = "true" ] && echo "    ✅ Phase 4: Performance Tuning"
    [ "${PHASE_5_DONE:-}" = "true" ] && echo "    ✅ Phase 5: Application"
    [ "$COMPLETED" -eq 0 ] && echo "    ⬜ No phase completed yet (inputs were saved)"
    echo ""
    echo "  Saved configuration:"
    echo "    Domain:   ${LEARNPLAY_DOMAIN:-not set}"
    echo "    Email:    ${LEARNPLAY_ADMIN_EMAIL:-not set}"
    echo "    Org:      ${LEARNPLAY_ORG_NAME:-not set}"
    echo "    Integrations: Configure in Integration Settings UI"
    echo ""
    echo "  Options:"
    echo "    K) Keep previous inputs and continue installation"
    echo "    N) Enter all inputs again (replace previous inputs)"
    echo "    Q) Quit"
    echo ""

    REUSE_CHOICE="${LEARNPLAY_REUSE_PREVIOUS_INPUTS:-}"
    if [ -n "$REUSE_CHOICE" ]; then
      REUSE_CHOICE="$(echo "$REUSE_CHOICE" | tr '[:lower:]' '[:upper:]')"
      if [ "$REUSE_CHOICE" = "TRUE" ] || [ "$REUSE_CHOICE" = "YES" ]; then
        REUSE_CHOICE="K"
      elif [ "$REUSE_CHOICE" = "FALSE" ] || [ "$REUSE_CHOICE" = "NO" ]; then
        REUSE_CHOICE="N"
      fi
    elif [ -t 0 ]; then
      read -p "  Choice [K]: " REUSE_CHOICE
      REUSE_CHOICE="${REUSE_CHOICE:-K}"
      REUSE_CHOICE="$(echo "$REUSE_CHOICE" | tr '[:lower:]' '[:upper:]')"
    else
      REUSE_CHOICE="K"
    fi

    if [ "$REUSE_CHOICE" = "Q" ]; then
      echo "  Exiting."
      exit 0
    elif [ "$REUSE_CHOICE" = "N" ]; then
      rm -f "$STATE_FILE"
      clear_saved_inputs
      RESUME_FROM=1
      echo ""
      echo "  Starting fresh configuration..."
      echo ""
    else
      RESUME_FROM=$((COMPLETED + 1))
      [ "$RESUME_FROM" -lt 1 ] && RESUME_FROM=1
      # Force package re-resolution so a corrected uploaded installer is preferred.
      LEARNPLAY_DIST_DIR=""
      echo ""
      echo "  Reusing previous inputs and continuing from Phase $RESUME_FROM..."
      echo ""
    fi
  elif [ "$COMPLETED" -eq 5 ]; then
    echo ""
    echo "  ✅ Installation was previously completed successfully."
    echo ""
    echo "  Options:"
    echo "    D) Restore from a DR backup (keeps app, restores data)"
    echo "    R) Reinstall from scratch (wipe everything)"
    echo "    Q) Quit"
    echo ""
    read -p "  Choice [Q]: " REINSTALL_CHOICE
    REINSTALL_CHOICE="${REINSTALL_CHOICE:-Q}"
    REINSTALL_CHOICE=$(echo "$REINSTALL_CHOICE" | tr '[:lower:]' '[:upper:]')

    if [ "$REINSTALL_CHOICE" = "D" ]; then
      echo ""
      echo "── DR Restore ──"
      dr_dir="${LEARNPLAY_BACKUP_DIR:-/lppbackups}/disaster-recovery"
      if [ -d "$dr_dir" ] && ls "$dr_dir"/dr_*.tar.gz* 2>/dev/null | head -1 > /dev/null 2>&1; then
        echo "  Available DR backups:"
        dr_idx=0
        declare -a dr_files=()
        while IFS= read -r drf; do
          dr_idx=$((dr_idx + 1))
          dr_files+=("$drf")
          dr_size=""
          dr_date=""
          dr_size=$(du -h "$drf" | cut -f1)
          dr_date=$(stat -c '%y' "$drf" 2>/dev/null | cut -d'.' -f1)
          echo "    $dr_idx) $(basename "$drf")  ($dr_size, $dr_date)"
        done < <(ls -t "$dr_dir"/dr_*.tar.gz* 2>/dev/null)
        echo ""
        read -p "  Select backup [1-$dr_idx] or path (q to cancel): " dr_sel
        if [[ "$dr_sel" == "q" || -z "$dr_sel" ]]; then
          echo "  Cancelled."
          exit 0
        elif [[ "$dr_sel" =~ ^[0-9]+$ ]] && [ "$dr_sel" -ge 1 ] && [ "$dr_sel" -le "$dr_idx" ]; then
          dr_archive="${dr_files[$((dr_sel - 1))]}"
          echo ""
          log "🔄 Restoring from DR backup: $(basename "$dr_archive")"
          if [ -f "$SCRIPT_DIR/dr-restore.sh" ]; then
            bash "$SCRIPT_DIR/dr-restore.sh" "$dr_archive" || { log "❌ DR restore failed"; exit 1; }
          elif [ -f "$APP_DIR/scripts/dr-restore.sh" ]; then
            bash "$APP_DIR/scripts/dr-restore.sh" "$dr_archive" || { log "❌ DR restore failed"; exit 1; }
          else
            log "❌ dr-restore.sh not found"
            exit 1
          fi
          echo ""
          log "🔄 Applying incremental migrations on restored database..."
          if [ -f "$APP_DIR/scripts/migrate.js" ]; then
            set +eo pipefail
            sudo -u "$APP_USER" bash -c '
              set -a
              if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
              set +a
              DR_RESTORE=true node "'"$APP_DIR"'/scripts/migrate.js"
            ' 2>&1 | tee -a "$LOG_FILE"
            MIGRATE_EXIT=${PIPESTATUS[0]}
            set -euo pipefail
            if [ "$MIGRATE_EXIT" -ne 0 ]; then
              log "   ⚠️  Migration returned exit code $MIGRATE_EXIT — check log"
            else
              log "   ✅ Migrations applied to restored database"
            fi
          fi
          echo ""
          log "✅ DR restore complete. Your data has been restored."
          exit 0
        elif [ -f "$dr_sel" ]; then
          echo ""
          log "🔄 Restoring from DR backup: $dr_sel"
          if [ -f "$SCRIPT_DIR/dr-restore.sh" ]; then
            bash "$SCRIPT_DIR/dr-restore.sh" "$dr_sel" || { log "❌ DR restore failed"; exit 1; }
          elif [ -f "$APP_DIR/scripts/dr-restore.sh" ]; then
            bash "$APP_DIR/scripts/dr-restore.sh" "$dr_sel" || { log "❌ DR restore failed"; exit 1; }
          else
            log "❌ dr-restore.sh not found"
            exit 1
          fi
          echo ""
          log "🔄 Applying incremental migrations on restored database..."
          if [ -f "$APP_DIR/scripts/migrate.js" ]; then
            set +eo pipefail
            sudo -u "$APP_USER" bash -c '
              set -a
              if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
              set +a
              DR_RESTORE=true node "'"$APP_DIR"'/scripts/migrate.js"
            ' 2>&1 | tee -a "$LOG_FILE"
            MIGRATE_EXIT=${PIPESTATUS[0]}
            set -euo pipefail
            if [ "$MIGRATE_EXIT" -ne 0 ]; then
              log "   ⚠️  Migration returned exit code $MIGRATE_EXIT — check log"
            else
              log "   ✅ Migrations applied to restored database"
            fi
          fi
          echo ""
          log "✅ DR restore complete. Your data has been restored."
          exit 0
        else
          echo "  ❌ Invalid selection or file not found."
          exit 1
        fi
      else
        echo "  No DR backups found in $dr_dir"
        read -p "  Enter path to DR backup archive (q to cancel): " dr_path
        if [[ "$dr_path" == "q" || -z "$dr_path" ]]; then
          echo "  Cancelled."
          exit 0
        elif [ -f "$dr_path" ]; then
          log "🔄 Restoring from DR backup: $dr_path"
          if [ -f "$SCRIPT_DIR/dr-restore.sh" ]; then
            bash "$SCRIPT_DIR/dr-restore.sh" "$dr_path" || { log "❌ DR restore failed"; exit 1; }
          elif [ -f "$APP_DIR/scripts/dr-restore.sh" ]; then
            bash "$APP_DIR/scripts/dr-restore.sh" "$dr_path" || { log "❌ DR restore failed"; exit 1; }
          else
            log "❌ dr-restore.sh not found"
            exit 1
          fi
          echo ""
          log "🔄 Applying incremental migrations on restored database..."
          if [ -f "$APP_DIR/scripts/migrate.js" ]; then
            set +eo pipefail
            sudo -u "$APP_USER" bash -c '
              set -a
              if [ -f "'"$APP_DIR"'/.env" ]; then . "'"$APP_DIR"'/.env"; fi
              set +a
              DR_RESTORE=true node "'"$APP_DIR"'/scripts/migrate.js"
            ' 2>&1 | tee -a "$LOG_FILE"
            MIGRATE_EXIT=${PIPESTATUS[0]}
            set -euo pipefail
            if [ "$MIGRATE_EXIT" -ne 0 ]; then
              log "   ⚠️  Migration returned exit code $MIGRATE_EXIT — check log"
            else
              log "   ✅ Migrations applied to restored database"
            fi
          fi
          echo ""
          log "✅ DR restore complete."
          exit 0
        else
          echo "  ❌ File not found: $dr_path"
          exit 1
        fi
      fi
    elif [ "$REINSTALL_CHOICE" = "R" ]; then
      rm -f "$STATE_FILE"
      RESUME_FROM=1
      echo ""
      echo "  Starting fresh installation..."
      echo ""
    else
      echo "  Exiting."
      exit 0
    fi
  fi
fi

RESUME_FROM="${RESUME_FROM:-1}"

# ─────────────────────────────────────────────────────────────────────────────
# INFO BANNER (only on fresh install)
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -eq 1 ] && [ -z "${LEARNPLAY_DOMAIN:-}" ]; then
  echo "This script will:"
  echo "  1. Harden the OS with EU security standards"
  echo "  2. Install all software dependencies"
  echo "  3. Set up and optimize the database"
  echo "  4. Tune performance for your hardware"
  echo "  5. Deploy the LearnPlay application"
  echo ""
  echo "Total time: approximately 10-20 minutes"
  echo ""
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1: COLLECT ALL INPUTS
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -eq 1 ] && [ -z "${LEARNPLAY_DOMAIN:-}" ]; then

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Step 1 of 1: Configuration"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # OS Settings
  echo "── OS Settings ──"
  read -p "SSH port [22]: " INPUT_SSH_PORT
  LEARNPLAY_SSH_PORT="${INPUT_SSH_PORT:-22}"

  prompt_for_timezone

  echo ""

  # Domain & Contact
  echo "── Domain & Contact ──"
  read -p "Domain name (e.g., learn.example.com): " LEARNPLAY_DOMAIN
  while [ -z "$LEARNPLAY_DOMAIN" ]; do
    read -p "Domain name is required: " LEARNPLAY_DOMAIN
  done

  read -p "Admin email: " LEARNPLAY_ADMIN_EMAIL
  while [ -z "$LEARNPLAY_ADMIN_EMAIL" ]; do
    read -p "Admin email is required: " LEARNPLAY_ADMIN_EMAIL
  done

  read -p "Organization name (your company name): " LEARNPLAY_ORG_NAME
  while [ -z "$LEARNPLAY_ORG_NAME" ]; do
    read -p "Organization name is required: " LEARNPLAY_ORG_NAME
  done

  read -sp "Admin password (min 8 characters): " LEARNPLAY_ADMIN_PASSWORD
  echo ""
  while [ -z "$LEARNPLAY_ADMIN_PASSWORD" ] || [ ${#LEARNPLAY_ADMIN_PASSWORD} -lt 8 ]; do
    read -sp "Password must be at least 8 characters: " LEARNPLAY_ADMIN_PASSWORD
    echo ""
  done

  echo ""

  # Database
  echo "── Database ──"
  read -sp "Database password (Enter to auto-generate): " LEARNPLAY_DB_PASSWORD
  echo ""
  if [ -z "$LEARNPLAY_DB_PASSWORD" ]; then
    LEARNPLAY_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    echo "   🔑 Generated password: $LEARNPLAY_DB_PASSWORD"
  fi

  echo ""

  # Integration settings are configured post-install in admin UI.
  echo "── Integration Configuration ──"
  echo ""
  echo "  Integration secrets/config are managed in:"
  echo "    /admin/integration-settings"
  echo ""
  echo "  Installer will only set non-sensitive defaults."
  LEARNPLAY_SMTP_HOST=""
  LEARNPLAY_SMTP_PORT=""
  LEARNPLAY_SMTP_SECURE=""
  LEARNPLAY_SMTP_USER=""
  LEARNPLAY_SMTP_PASS=""
  LEARNPLAY_SMTP_FROM="noreply@$LEARNPLAY_DOMAIN"
  LEARNPLAY_MAILERSEND_KEY=""
  LEARNPLAY_GEMINI_KEY=""
  LEARNPLAY_GAMMA_KEY=""
  LEARNPLAY_YOCO_TEST_PUBLIC_KEY=""
  LEARNPLAY_YOCO_TEST_SECRET_KEY=""
  LEARNPLAY_YOCO_LIVE_PUBLIC_KEY=""
  LEARNPLAY_YOCO_LIVE_SECRET_KEY=""
  LEARNPLAY_YOCO_WEBHOOK_SECRET=""

  echo ""
  echo "── Cloud License Key ──"
  echo ""
  echo "  Required for generating customer system license keys in Enterprise portal."
  read -s -p "  CLOUD_LICENSE_PRIVATE_KEY: " LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY
  echo ""
  while [ -z "$LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY" ]; do
    read -s -p "  CLOUD_LICENSE_PRIVATE_KEY is required: " LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY
    echo ""
  done

  echo ""
  echo "── On-Prem Bootstrap Signing Secret (Optional) ──"
  echo ""
  echo "  Optional legacy fallback. Per-system sync credentials are preferred."
  read -r -p "  Configure ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD now? [y/N]: " _lp_use_legacy_sync
  if [[ "${_lp_use_legacy_sync,,}" = "y" || "${_lp_use_legacy_sync,,}" = "yes" ]]; then
    read -s -p "  ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD: " LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD
    echo ""
  fi

  # Local upload storage
  echo ""
  echo "── File Storage ──"
  echo ""
  echo "  LearnPlay stores uploads on local filesystem."
  echo "  Upload directory: ${APP_DIR}/uploads"
  echo ""
  LEARNPLAY_UPLOAD_DIR="${LEARNPLAY_UPLOAD_DIR:-${APP_DIR}/uploads}"
  LEARNPLAY_GCS_SA_JSON=""
  LEARNPLAY_GCS_KEY_FILE=""

  LEARNPLAY_MODE="A"

  echo ""

  # System Type
  echo "── System Type ──"
  echo ""
  echo "  LearnPlay can be deployed as:"
  echo ""
  echo "    1) Development  — For testing and evaluation."
  echo "                      Learner registration is always disabled."
  echo ""
  echo "    2) Production   — For live use."
  echo "                      Learner registration requires a valid production license."
  echo ""
  read -p "  Select system type (1/2) [1]: " SYSTEM_TYPE_CHOICE
  SYSTEM_TYPE_CHOICE="${SYSTEM_TYPE_CHOICE:-1}"
  while [ "$SYSTEM_TYPE_CHOICE" != "1" ] && [ "$SYSTEM_TYPE_CHOICE" != "2" ]; do
    read -p "  Please enter 1 or 2: " SYSTEM_TYPE_CHOICE
  done
  if [ "$SYSTEM_TYPE_CHOICE" = "2" ]; then
    LEARNPLAY_SYSTEM_TYPE="production"
  else
    LEARNPLAY_SYSTEM_TYPE="development"
  fi

  echo ""

  # Ports
  echo "── Port Configuration ──"
  echo ""
  echo "  Configure ports for this LearnPlay instance."
  echo "  Multiple instances can run on different ports."
  echo ""

  read -p "  Application Port [3000]: " LEARNPLAY_APP_PORT
  LEARNPLAY_APP_PORT="${LEARNPLAY_APP_PORT:-3000}"
  while ! [[ "$LEARNPLAY_APP_PORT" =~ ^[0-9]+$ ]] || [ "$LEARNPLAY_APP_PORT" -lt 1 ] || [ "$LEARNPLAY_APP_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [3000]: " LEARNPLAY_APP_PORT
    LEARNPLAY_APP_PORT="${LEARNPLAY_APP_PORT:-3000}"
  done

  read -p "  PostgreSQL Port [5432]: " LEARNPLAY_DB_PORT
  LEARNPLAY_DB_PORT="${LEARNPLAY_DB_PORT:-5432}"
  while ! [[ "$LEARNPLAY_DB_PORT" =~ ^[0-9]+$ ]] || [ "$LEARNPLAY_DB_PORT" -lt 1 ] || [ "$LEARNPLAY_DB_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [5432]: " LEARNPLAY_DB_PORT
    LEARNPLAY_DB_PORT="${LEARNPLAY_DB_PORT:-5432}"
  done

  read -p "  Nginx HTTP Port [80]: " LEARNPLAY_NGINX_HTTP_PORT
  LEARNPLAY_NGINX_HTTP_PORT="${LEARNPLAY_NGINX_HTTP_PORT:-80}"
  while ! [[ "$LEARNPLAY_NGINX_HTTP_PORT" =~ ^[0-9]+$ ]] || [ "$LEARNPLAY_NGINX_HTTP_PORT" -lt 1 ] || [ "$LEARNPLAY_NGINX_HTTP_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [80]: " LEARNPLAY_NGINX_HTTP_PORT
    LEARNPLAY_NGINX_HTTP_PORT="${LEARNPLAY_NGINX_HTTP_PORT:-80}"
  done

  read -p "  Nginx HTTPS Port [443]: " LEARNPLAY_NGINX_HTTPS_PORT
  LEARNPLAY_NGINX_HTTPS_PORT="${LEARNPLAY_NGINX_HTTPS_PORT:-443}"
  while ! [[ "$LEARNPLAY_NGINX_HTTPS_PORT" =~ ^[0-9]+$ ]] || [ "$LEARNPLAY_NGINX_HTTPS_PORT" -lt 1 ] || [ "$LEARNPLAY_NGINX_HTTPS_PORT" -gt 65535 ]; do
    read -p "  Port must be 1-65535 [443]: " LEARNPLAY_NGINX_HTTPS_PORT
    LEARNPLAY_NGINX_HTTPS_PORT="${LEARNPLAY_NGINX_HTTPS_PORT:-443}"
  done

  # Port collision check
  all_ports=("$LEARNPLAY_SSH_PORT" "$LEARNPLAY_APP_PORT" "$LEARNPLAY_DB_PORT" "$LEARNPLAY_NGINX_HTTP_PORT" "$LEARNPLAY_NGINX_HTTPS_PORT")
  unique_ports=($(printf '%s\n' "${all_ports[@]}" | sort -u))
  if [ "${#unique_ports[@]}" -ne "${#all_ports[@]}" ]; then
    echo ""
    echo "  ⚠️  Port collision detected! Each port must be unique:"
    echo "    SSH:        $LEARNPLAY_SSH_PORT"
    echo "    App:        $LEARNPLAY_APP_PORT"
    echo "    Database:   $LEARNPLAY_DB_PORT"
    echo "    HTTP:       $LEARNPLAY_NGINX_HTTP_PORT"
    echo "    HTTPS:      $LEARNPLAY_NGINX_HTTPS_PORT"
    echo ""
    echo "  Please re-run the installer with unique ports."
    exit 1
  fi

  echo ""

  # SSL
  echo "── SSL / Reverse Proxy Mode ──"
  echo "  Select how TLS/HTTP should be handled."
  echo ""
  echo "    1) Self-signed certificate"
  echo "    2) Let's Encrypt certificate (auto-renew enabled)"
  echo "    3) Behind Caddy reverse proxy (HTTP backend, Caddy handles TLS)"
  echo ""
  read -p "  Select mode (1/2/3) [1]: " SSL_CHOICE
  SSL_CHOICE="${SSL_CHOICE:-1}"
  while [ "$SSL_CHOICE" != "1" ] && [ "$SSL_CHOICE" != "2" ] && [ "$SSL_CHOICE" != "3" ]; do
    read -p "  Please enter 1, 2, or 3: " SSL_CHOICE
  done
  case "$SSL_CHOICE" in
    2) LEARNPLAY_SETUP_SSL="letsencrypt-https" ;;
    3) LEARNPLAY_SETUP_SSL="caddy-http" ;;
    *) LEARNPLAY_SETUP_SSL="self-signed-https" ;;
  esac
  if [ "$LEARNPLAY_SETUP_SSL" = "caddy-http" ]; then
    LEARNPLAY_BEHIND_CADDY="true"
  else
    LEARNPLAY_BEHIND_CADDY="false"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Configuration Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  SSH Port:      $LEARNPLAY_SSH_PORT"
  echo "  Timezone:      $LEARNPLAY_TIMEZONE"
  echo "  Domain:        $LEARNPLAY_DOMAIN"
  echo "  Admin Email:   $LEARNPLAY_ADMIN_EMAIL"
  echo "  DB Password:   ${LEARNPLAY_DB_PASSWORD:0:4}****"
  if [ -n "$LEARNPLAY_SMTP_HOST" ]; then
    echo "  Email:         SMTP → $LEARNPLAY_SMTP_HOST:$LEARNPLAY_SMTP_PORT (TLS: $LEARNPLAY_SMTP_SECURE)"
  elif [ -n "$LEARNPLAY_MAILERSEND_KEY" ]; then
    echo "  Email:         MailerSend (configured)"
  else
    echo "  Email:         ⚠️  Not configured (email features disabled)"
  fi
  echo "  App Port:      $LEARNPLAY_APP_PORT"
  echo "  DB Port:       $LEARNPLAY_DB_PORT"
  echo "  HTTP Port:     $LEARNPLAY_NGINX_HTTP_PORT"
  echo "  HTTPS Port:    $LEARNPLAY_NGINX_HTTPS_PORT"
  echo "  SSL:           $(ssl_mode_label "$LEARNPLAY_SETUP_SSL")"
  echo "  System Type:   $([ "$LEARNPLAY_SYSTEM_TYPE" = "production" ] && echo "Production" || echo "Development")"
  echo "  Upload Dir:    $LEARNPLAY_UPLOAD_DIR"
  echo "  Integrations:  Configure in /admin/integration-settings"
  echo "  Cloud License: $([ -n "$LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY" ] && echo "Configured" || echo "Not configured")"
  echo "  OnPrem Sync:   $([ -n "${LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD:-}" ] && echo "Configured" || echo "Not configured")"
  echo ""

  read -p "Proceed with installation? (Y/n): " CONFIRM
  if [ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ]; then
    echo "❌ Installation cancelled."
    exit 0
  fi

  save_state
fi

# ─────────────────────────────────────────────────────────────────────────────
# RESOLVE DIST DIR (after resume detection so state-saved path is available)
# ─────────────────────────────────────────────────────────────────────────────

if [ -z "${LEARNPLAY_DIST_DIR:-}" ] || [ ! -d "${LEARNPLAY_DIST_DIR}/server" ]; then
  LEARNPLAY_DIST_DIR="$(resolve_dist_dir)" || {
    echo ""
    echo "❌ Cannot find the LearnPlay distribution package."
    echo ""
    echo "   The installer needs the original dist-cloud directory containing"
    echo "   server/, client/, and package.json files."
    if [ "${LEARNPLAY_NONINTERACTIVE:-false}" = "true" ]; then
      echo "   Non-interactive mode is enabled. Aborting without additional prompts."
      exit 1
    fi
    echo ""
    echo "   Enter the path to the dist-cloud directory,"
    echo "   or press Enter to abort:"
    echo ""
    read -p "   Path: " MANUAL_DIST_DIR
    if [ -n "$MANUAL_DIST_DIR" ] && [ -d "$MANUAL_DIST_DIR/server" ] && [ -f "$MANUAL_DIST_DIR/package.json" ]; then
      LEARNPLAY_DIST_DIR="$MANUAL_DIST_DIR"
    else
      echo "   ❌ Invalid path or missing files. Aborting."
      exit 1
    fi
  }
fi

echo ""
START_TIME=$(date +%s)

# ─────────────────────────────────────────────────────────────────────────────
# STAGE DIST PACKAGE (permanent copy survives /tmp cleanup)
# ─────────────────────────────────────────────────────────────────────────────

if [ ! -d "$STAGING_DIR/server" ] || [ ! -f "$STAGING_DIR/package.json" ]; then
  stage_dist_package "$LEARNPLAY_DIST_DIR" || {
    log "❌ Failed to stage distribution package. Aborting."
    exit 1
  }
fi

# Point DIST_DIR at staging from now on
LEARNPLAY_DIST_DIR="$STAGING_DIR"
save_state

DIST_VERSION="$(read_dist_version "$LEARNPLAY_DIST_DIR")"
log "📦 Installer package version: $DIST_VERSION"

log "🚀 Starting LearnPlay installation..."
log ""

validate_required_directories

# ─────────────────────────────────────────────────────────────────────────────
# EXPORT ENVIRONMENT VARIABLES
# ─────────────────────────────────────────────────────────────────────────────

export LEARNPLAY_SSH_PORT
export LEARNPLAY_TIMEZONE
export LEARNPLAY_DOMAIN
export LEARNPLAY_ADMIN_EMAIL
export LEARNPLAY_DB_PASSWORD
export LEARNPLAY_MAILERSEND_KEY
export LEARNPLAY_SMTP_HOST
export LEARNPLAY_SMTP_PORT
export LEARNPLAY_SMTP_SECURE
export LEARNPLAY_SMTP_USER
export LEARNPLAY_SMTP_PASS
export LEARNPLAY_SMTP_FROM
export LEARNPLAY_GEMINI_KEY
export LEARNPLAY_GAMMA_KEY
export LEARNPLAY_YOCO_TEST_PUBLIC_KEY
export LEARNPLAY_YOCO_TEST_SECRET_KEY
export LEARNPLAY_YOCO_LIVE_PUBLIC_KEY
export LEARNPLAY_YOCO_LIVE_SECRET_KEY
export LEARNPLAY_YOCO_WEBHOOK_SECRET
export LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY
export LEARNPLAY_ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD
export LEARNPLAY_ORG_NAME
export LEARNPLAY_ADMIN_PASSWORD
export LEARNPLAY_SETUP_SSL
export LEARNPLAY_BEHIND_CADDY="${LEARNPLAY_BEHIND_CADDY:-$([ "${LEARNPLAY_SETUP_SSL:-self-signed-https}" = "caddy-http" ] && echo true || echo false)}"
export LEARNPLAY_SYSTEM_TYPE
export LEARNPLAY_UPLOAD_DIR
export LEARNPLAY_GCS_SA_JSON
export LEARNPLAY_GCS_KEY_FILE
export LEARNPLAY_APP_PORT
export LEARNPLAY_DB_PORT
export LEARNPLAY_NGINX_HTTP_PORT
export LEARNPLAY_NGINX_HTTPS_PORT
export LEARNPLAY_MODE
export LEARNPLAY_NONINTERACTIVE=true
export GCS_SA_JSON="${LEARNPLAY_GCS_SA_JSON:-}"
export GCS_KEY_FILE="${LEARNPLAY_GCS_KEY_FILE:-}"
export LEARNPLAY_DIST_DIR

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1: OS PREPARATION
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -le 1 ]; then

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  Phase 1/5: OS Preparation"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  if [ ! -f "$SCRIPT_DIR/os-prep.sh" ]; then
    log "❌ Script not found: $SCRIPT_DIR/os-prep.sh"
    exit 1
  fi

  set +eo pipefail
  bash "$SCRIPT_DIR/os-prep.sh" 2>&1 | tee -a "$LOG_FILE"
  PHASE1_EXIT=${PIPESTATUS[0]}
  set -euo pipefail
  if [ "$PHASE1_EXIT" -ne 0 ]; then
    log ""
    log "❌ Phase 1 failed (exit code: $PHASE1_EXIT)"
    log "   Check log: $LOG_FILE"
    END_TIME=$(date +%s)
    DURATION=$(( (END_TIME - START_TIME) / 60 ))
    write_install_summary "FAILED" "1"
    exit 1
  fi

  log ""
  log "✅ Phase 1 complete"
  log ""

  PHASE_1_DONE=true
  save_state

fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2: INSTALL DEPENDENCIES
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -le 2 ]; then

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  Phase 2/5: Installing Dependencies"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  if [ ! -f "$SCRIPT_DIR/install-deps.sh" ]; then
    log "❌ Script not found: $SCRIPT_DIR/install-deps.sh"
    exit 1
  fi

  set +eo pipefail
  bash "$SCRIPT_DIR/install-deps.sh" 2>&1 | tee -a "$LOG_FILE"
  PHASE2_EXIT=${PIPESTATUS[0]}
  set -euo pipefail
  if [ "$PHASE2_EXIT" -ne 0 ]; then
    log ""
    log "❌ Phase 2 failed (exit code: $PHASE2_EXIT)"
    log "   Check log: $LOG_FILE"
    END_TIME=$(date +%s)
    DURATION=$(( (END_TIME - START_TIME) / 60 ))
    write_install_summary "FAILED" "2"
    exit 1
  fi

  log ""
  log "✅ Phase 2 complete"
  log ""

  PHASE_2_DONE=true
  save_state

fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3: DATABASE SETUP
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -le 3 ]; then

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  Phase 3/5: Database Setup"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  if [ ! -f "$SCRIPT_DIR/db-setup.sh" ]; then
    log "❌ Script not found: $SCRIPT_DIR/db-setup.sh"
    exit 1
  fi

  set +eo pipefail
  bash "$SCRIPT_DIR/db-setup.sh" 2>&1 | tee -a "$LOG_FILE"
  PHASE3_EXIT=${PIPESTATUS[0]}
  set -euo pipefail
  if [ "$PHASE3_EXIT" -ne 0 ]; then
    log ""
    log "❌ Phase 3 failed (exit code: $PHASE3_EXIT)"
    log "   Check log: $LOG_FILE"
    END_TIME=$(date +%s)
    DURATION=$(( (END_TIME - START_TIME) / 60 ))
    write_install_summary "FAILED" "3"
    exit 1
  fi

  log ""
  log "✅ Phase 3 complete"
  log ""

  PHASE_3_DONE=true
  save_state

fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4: PERFORMANCE TUNING
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -le 4 ]; then

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  Phase 4/5: Performance Tuning"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  if [ ! -f "$SCRIPT_DIR/perf-tune.sh" ]; then
    log "❌ Script not found: $SCRIPT_DIR/perf-tune.sh"
    exit 1
  fi

  set +eo pipefail
  bash "$SCRIPT_DIR/perf-tune.sh" 2>&1 | tee -a "$LOG_FILE"
  PHASE4_EXIT=${PIPESTATUS[0]}
  set -euo pipefail
  if [ "$PHASE4_EXIT" -ne 0 ]; then
    log ""
    log "❌ Phase 4 failed (exit code: $PHASE4_EXIT)"
    log "   Check log: $LOG_FILE"
    END_TIME=$(date +%s)
    DURATION=$(( (END_TIME - START_TIME) / 60 ))
    write_install_summary "FAILED" "4"
    exit 1
  fi

  log ""
  log "✅ Phase 4 complete"
  log ""

  PHASE_4_DONE=true
  save_state

fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 5: APPLICATION INSTALLATION
# ─────────────────────────────────────────────────────────────────────────────

if [ "$RESUME_FROM" -le 5 ]; then

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  Phase 5/5: Application Installation"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  if [ ! -f "$SCRIPT_DIR/app-install.sh" ]; then
    log "❌ Script not found: $SCRIPT_DIR/app-install.sh"
    exit 1
  fi

  set +eo pipefail
  bash "$SCRIPT_DIR/app-install.sh" 2>&1 | tee -a "$LOG_FILE"
  PHASE5_EXIT=${PIPESTATUS[0]}
  set -euo pipefail
  if [ "$PHASE5_EXIT" -ne 0 ]; then
    log ""
    log "❌ Phase 5 failed (exit code: $PHASE5_EXIT)"
    log "   Check log: $LOG_FILE"
    if [ -f /var/log/learnplay-app-install.log ]; then
      log "   Last 40 lines from /var/log/learnplay-app-install.log:"
      tail -40 /var/log/learnplay-app-install.log 2>/dev/null | while IFS= read -r line; do
        log "     $line"
      done
    fi
    END_TIME=$(date +%s)
    DURATION=$(( (END_TIME - START_TIME) / 60 ))
    write_install_summary "FAILED" "5"
    exit 1
  fi

  log ""
  log "✅ Phase 5 complete"
  log ""

  PHASE_5_DONE=true
  save_state

fi

# ─────────────────────────────────────────────────────────────────────────────
# CLEANUP TEMP FILES
# ─────────────────────────────────────────────────────────────────────────────

[ -f /tmp/learnplay-db-credentials ] && rm -f /tmp/learnplay-db-credentials
[ -f /tmp/learnplay-perf-settings ] && rm -f /tmp/learnplay-perf-settings

# ─────────────────────────────────────────────────────────────────────────────
# FINAL SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

END_TIME=$(date +%s)
DURATION=$(( (END_TIME - START_TIME) / 60 ))

log ""
log "╔════════════════════════════════════════════════╗"
log "║                                                ║"
log "║  ✅ Installation Complete!                     ║"
log "║                                                ║"
log "╚════════════════════════════════════════════════╝"
log ""

log "  Application URL:   $([ "${LEARNPLAY_SETUP_SSL:-self-signed-https}" = "caddy-http" ] && echo "http://$LEARNPLAY_DOMAIN (served by local backend; Caddy should expose HTTPS)" || echo "https://$LEARNPLAY_DOMAIN")"
log "  Installation Time: ${DURATION} minutes"
log ""

log "  Database:"
log "    Host:           localhost:${LEARNPLAY_DB_PORT:-5432}"
log "    Database:       learnplay"
log "    User:           learnplay"
log "    Password:       ${LEARNPLAY_DB_PASSWORD:0:4}**** (saved in .env)"
log ""

log "  Ports:"
log "    Application:    ${LEARNPLAY_APP_PORT:-3000}"
log "    PostgreSQL:     ${LEARNPLAY_DB_PORT:-5432}"
log "    Nginx HTTP:     ${LEARNPLAY_NGINX_HTTP_PORT:-80}"
log "    Nginx HTTPS:    ${LEARNPLAY_NGINX_HTTPS_PORT:-443}"
log ""

log "  Server Configuration:"
log "    SSH Port:       ${LEARNPLAY_SSH_PORT:-22}"
log "    Timezone:       ${LEARNPLAY_TIMEZONE:-Africa/Johannesburg}"
log "    SSL:            $(ssl_mode_label "$LEARNPLAY_SETUP_SSL")"
log ""

log "  Management:"
log "    Admin Console:  sudo lppadmin"
log "    Quick Status:   sudo lppadmin status"
log "    View Logs:      sudo lppadmin logs"
log "    Restart App:    sudo lppadmin restart"
log ""

log "  Important Files:"
log "    App:            ${APP_DIR}/"
log "    Config:         ${APP_DIR}/.env"
log "    Uploads:        ${APP_DIR}/uploads/"
log "    Backups:        ${LEARNPLAY_BACKUP_DIR:-/lppbackups}/"
log "    Logs:           /var/log/learnplay/"
log "    Installation:   $LOG_FILE"
log ""

log "  Email Configuration:"
log "    Transport:      Configure in /admin/integration-settings"
log ""
log "  Deployment:"
log "    Integrations:   Configure in /admin/integration-settings"
log "    Cloud License:  $([ -n "$LEARNPLAY_CLOUD_LICENSE_PRIVATE_KEY" ] && echo "Configured" || echo "Not configured")"
log "    Payments:       Configure in /admin/integration-settings"
log "    Admin Access:   SuperAdmin platform administration"
log ""

log "  ⚠️  IMPORTANT: Security Lockdown"
log "  ────────────────────────────────────────────"
log "  SSH password login is currently ENABLED for setup."
log "  After you've configured SSH key access, run:"
log ""
log "    sudo bash ${APP_DIR}/scripts/security-lockdown.sh"
log ""
log "  This will disable password login and enforce"
log "  EU security standards (GDPR compliance)."
log ""

log "  🚀 NEXT STEPS:"
log "  ────────────────────────────────────────────"
log "  1. Verify the application is running:"
log "     sudo -u $APP_USER pm2 status"
log ""
log "  2. Check the web interface:"
log "     https://$LEARNPLAY_DOMAIN"
log ""
log "  3. Configure SSH key authentication (recommended)"
log ""
log "  4. Run security lockdown:"
log "     sudo bash ${APP_DIR}/scripts/security-lockdown.sh"
log ""
log "  5. Review logs for any warnings:"
log "     tail -f /var/log/learnplay/*.log"
log ""

log "  Full installation log: $LOG_FILE"
log ""

# ─────────────────────────────────────────────────────────────────────────────
# CLEANUP & INSTALLATION PROOF
# ─────────────────────────────────────────────────────────────────────────────

write_install_summary "SUCCESS"

# Clean up staging directory (app files are now in $APP_DIR/)
if [ -d "$STAGING_DIR" ]; then
  rm -rf "$STAGING_DIR"
  log "   📦 Staging directory cleaned up"
fi

# Clean up .dist-source (no longer needed after successful install)
rm -f "${APP_DIR}/.dist-source" 2>/dev/null || true

rm -f "$STATE_FILE"
log "   State file cleaned up (installation complete)"
