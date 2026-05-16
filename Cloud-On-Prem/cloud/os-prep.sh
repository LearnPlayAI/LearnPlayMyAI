#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/var/log/learnplay-os-prep.log"

# Quick admin setup mode — delegates to lppadmin.sh do_setup() which handles
# copying scripts to /opt/learnplay/scripts/, creating the symlink, and
# installing the MOTD. Safe to run multiple times (idempotent).
if [ "${1:-}" = "--setup-admin" ]; then
  if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (sudo)"
    exit 1
  fi

  LPADMIN_SCRIPT="$SCRIPT_DIR/lppadmin.sh"
  if [ ! -f "$LPADMIN_SCRIPT" ]; then
    echo "❌ lppadmin.sh not found at $LPADMIN_SCRIPT"
    exit 1
  fi

  bash "$LPADMIN_SCRIPT" setup
  exit $?
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

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

echo "============================================"
echo "  LearnPlay OS Preparation Script"
echo "  Cloud Installation Baseline Setup"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ============================================
# INTERACTIVE PROMPTS
# ============================================
# Support non-interactive mode via LEARNPLAY_* env vars (from master-install.sh)
if [ -n "${LEARNPLAY_SSH_PORT:-}" ]; then
  SSH_PORT="$LEARNPLAY_SSH_PORT"
else
  read -p "SSH port [22]: " SSH_PORT
  SSH_PORT="${SSH_PORT:-22}"
fi

if [ -n "${LEARNPLAY_ADMIN_EMAIL:-}" ]; then
  ADMIN_EMAIL="$LEARNPLAY_ADMIN_EMAIL"
else
  read -p "Admin email (for alerts): " ADMIN_EMAIL
  while [ -z "$ADMIN_EMAIL" ]; do
    read -p "Admin email is required: " ADMIN_EMAIL
  done
fi

if [ -n "${LEARNPLAY_TIMEZONE:-}" ]; then
  TIMEZONE_RAW="$LEARNPLAY_TIMEZONE"
else
  confirm_utc=""
  TIMEZONE_DEFAULT="$(detect_current_system_timezone)"
  while true; do
    read -p "Timezone [${TIMEZONE_DEFAULT}] (IANA, e.g., Africa/Johannesburg): " TIMEZONE_RAW
    TIMEZONE_RAW="$(printf '%s' "${TIMEZONE_RAW:-}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [ -n "$TIMEZONE_RAW" ]; then
      break
    fi
    if [ "$TIMEZONE_DEFAULT" = "Etc/UTC" ] && [ "${LEARNPLAY_ALLOW_UTC_DEFAULT:-false}" != "true" ]; then
      read -p "  Keep timezone as Etc/UTC? (y/N): " confirm_utc
      confirm_utc="$(printf '%s' "${confirm_utc:-}" | tr '[:upper:]' '[:lower:]')"
      if [ "$confirm_utc" = "y" ] || [ "$confirm_utc" = "yes" ]; then
        TIMEZONE_RAW="$TIMEZONE_DEFAULT"
        break
      fi
      echo "  ↳ Please enter your preferred IANA timezone (e.g., Africa/Johannesburg)."
      continue
    fi
    TIMEZONE_RAW="$TIMEZONE_DEFAULT"
    break
  done
fi
TIMEZONE="$(normalize_timezone_input "$TIMEZONE_RAW")"
if ! is_valid_iana_timezone "$TIMEZONE"; then
  log "❌ Invalid timezone '$TIMEZONE_RAW'. Use an IANA timezone like UTC or Africa/Johannesburg."
  exit 1
fi
if [ "$TIMEZONE" != "$TIMEZONE_RAW" ]; then
  log "ℹ️  Normalized timezone '$TIMEZONE_RAW' to '$TIMEZONE'"
fi

log ""
log "============================================"
log "  Starting OS Preparation"
log "============================================"
log "SSH Port:     $SSH_PORT"
log "Admin Email:  $ADMIN_EMAIL"
log "Timezone:     $TIMEZONE"
log ""

# ============================================
# 1. SYSTEM UPDATES
# ============================================
log "📦 Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get dist-upgrade -y -qq
apt-get autoremove -y -qq

# ============================================
# 2. SET TIMEZONE
# ============================================
log "🕐 Setting timezone to $TIMEZONE..."
timedatectl set-timezone "$TIMEZONE"

# ============================================
# 3. NTP TIME SYNCHRONIZATION
# ============================================
log "🕐 Configuring NTP time synchronization..."
apt-get install -y -qq systemd-timesyncd
timedatectl set-ntp true
# Verify
timedatectl status | grep -i "synchronized" || log "⚠️  NTP sync may take a moment"

# ============================================
# 4. CLOUD INSTALLER SECURITY HARDENING (DISABLED)
# ============================================
log "ℹ️  Cloud installer security hardening is disabled by policy."
log "   Skipping firewall, SSH hardening, fail2ban, auditd, sysctl, and login restrictions."

# ============================================
# 15. INSTALL ADMIN TOOLS (delegates to lppadmin.sh setup)
# ============================================
log "🛠️  Installing admin tools..."

LPADMIN_SCRIPT="$SCRIPT_DIR/lppadmin.sh"
if [ -f "$LPADMIN_SCRIPT" ]; then
  if ! bash "$LPADMIN_SCRIPT" --install-command 2>&1 | tee -a "$LOG_FILE"; then
    log "  ⚠️  Admin tools setup encountered an error — continuing installation"
    log "  ℹ️  You can re-run later with: sudo lppadmin --install-command"
    mkdir -p /var/log/learnplay
  fi
else
  log "  ⚠️  lppadmin.sh not found — lppadmin command not installed"
  mkdir -p /var/log/learnplay
fi

# ============================================
# 16. FINAL SUMMARY
# ============================================
log ""
log "============================================"
log "  ✅ OS Preparation Complete"
log "============================================"
log ""
log "Security Configuration:"
log "  SSH Port:          $SSH_PORT"
log "  Timezone:          $TIMEZONE"
log "  Firewall:          ⏭️  Not modified by installer"
log "  SSH Hardening:     ⏭️  Not modified by installer"
log "  fail2ban:          ⏭️  Not configured by installer"
log "  Audit Logging:     ⏭️  Not configured by installer"
log "  Kernel Hardening:  ⏭️  Not modified by installer"
log "  Auto Updates:      ⏭️  Not modified by installer"
log "  NTP Sync:          ✅ Enabled"
log "  Password Policy:   ⏭️  Not modified by installer"
log "  Session Timeout:   ⏭️  Not modified by installer"
log "  Admin Tool:        ✅ sudo lppadmin"
log "  Welcome Screen:    ✅ Shows on SSH login"
log ""
log "Next step: Run install-deps.sh"
log ""
