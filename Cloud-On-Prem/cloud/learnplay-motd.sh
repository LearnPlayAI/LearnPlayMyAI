#!/usr/bin/env bash
#
# LearnPlay Cloud (Linux) MOTD (Message of the Day)
# Displays system status and platform information on SSH login
# Install at: /etc/profile.d/learnplay-motd.sh
#

# Exit if not an interactive shell
[[ $- != *i* ]] && return 0

# Configuration
APP_NAME="learnplay"
resolve_app_dir() {
  if [ -n "${LEARNPLAY_APP_DIR:-}" ] && [ -d "${LEARNPLAY_APP_DIR}" ]; then
    echo "${LEARNPLAY_APP_DIR}"
    return 0
  fi
  if [ -f "/opt/learnplay/cloud/.env" ]; then
    echo "/opt/learnplay/cloud"
    return 0
  fi
  if [ -f "/opt/learnplay/.env" ]; then
    echo "/opt/learnplay"
    return 0
  fi
  echo "/opt/learnplay/cloud"
}
APP_DIR="$(resolve_app_dir)"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
BACKUP_DIR="${LEARNPLAY_BACKUP_DIR:-/lppbackups}"

# Color codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m'

# Helper functions for formatting
check_mark() { echo -e "${GREEN}✓${NC}"; }
cross_mark() { echo -e "${RED}✗${NC}"; }
status_symbol() { [ "$1" = true ] && check_mark || cross_mark; }

# Get app version from version.json
get_version() {
  if [ -f "$APP_DIR/version.json" ]; then
    grep -oP '"version"\s*:\s*"\K[^"]+' "$APP_DIR/version.json" 2>/dev/null || echo "unknown"
  else
    echo "not installed"
  fi
}

# Get configured domain from BASE_URL in .env
get_domain() {
  if [ -f "$APP_DIR/.env" ]; then
    grep -E '^BASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's|https\?://||' | sed 's|/.*||' || echo "not configured"
  else
    echo "not configured"
  fi
}

# Check if using HTTPS/SSL
get_ssl_mode() {
  if [ -f "$APP_DIR/.env" ]; then
    local base_url
    base_url=$(grep -E '^BASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d'=' -f2-)
    if [[ "$base_url" =~ ^https:// ]]; then
      echo "HTTPS"
    else
      echo "HTTP"
    fi
  else
    echo "unknown"
  fi
}

cert_script_path() {
  if [ -x "$APP_DIR/scripts/cert-automation.sh" ]; then
    echo "$APP_DIR/scripts/cert-automation.sh"
    return 0
  fi
  if [ -x "/opt/learnplay/scripts/cert-automation.sh" ]; then
    echo "/opt/learnplay/scripts/cert-automation.sh"
    return 0
  fi
  echo ""
}

cert_status_json_path() {
  local scope="learnplay"
  case "$APP_DIR" in
    */cloud) scope="cloud" ;;
    */onprem) scope="onprem" ;;
  esac
  echo "/var/lib/learnplay/cert-status-${scope}.json"
}

read_cert_status_field() {
  local key="$1"
  local json
  json="$(cert_status_json_path)"
  if [ ! -f "$json" ]; then
    echo ""
    return 0
  fi
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$json" | head -1
}

read_cert_status_number() {
  local key="$1"
  local json
  json="$(cert_status_json_path)"
  if [ ! -f "$json" ]; then
    echo ""
    return 0
  fi
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\\([-0-9]\\+\\).*/\\1/p" "$json" | head -1
}

refresh_cert_status_snapshot() {
  local cert_script
  cert_script="$(cert_script_path)"
  [ -n "$cert_script" ] || return 0
  LEARNPLAY_APP_DIR="$APP_DIR" "$cert_script" update-status >/dev/null 2>&1 || true
}

# Check PostgreSQL status
check_postgres() {
  if command -v systemctl &> /dev/null && systemctl is-active --quiet postgresql 2>/dev/null; then
    echo true
  else
    echo false
  fi
}

# Check PM2 app status
check_pm2_app() {
  local app_user="${APP_USER:-learnplay}"
  
  # Find PM2 binary — may not be on PATH for login shells
  local pm2_bin="pm2"
  if ! command -v pm2 &>/dev/null; then
    for p in /usr/local/bin/pm2 /usr/bin/pm2 /opt/learnplay/node_modules/.bin/pm2; do
      [ -x "$p" ] && pm2_bin="$p" && break
    done
  fi
  
  # Method 1 (most reliable): sudo to the app user
  if sudo -n -u "$app_user" "$pm2_bin" jlist 2>/dev/null | grep -q '"name":"'$APP_NAME'".*"status":"online"'; then
    echo true
    return
  fi
  
  # Method 2: Direct PM2_HOME check (if sudo not available)
  local user_home
  user_home=$(eval echo "~$app_user" 2>/dev/null)
  [ -z "$user_home" ] || [ "$user_home" = "~$app_user" ] && user_home="/home/$app_user"
  
  if PM2_HOME="$user_home/.pm2" "$pm2_bin" jlist 2>/dev/null | grep -q '"name":"'$APP_NAME'".*"status":"online"'; then
    echo true
    return
  fi
  
  # Method 3: Check systemd service as last resort
  if command -v systemctl &>/dev/null && systemctl is-active --quiet "pm2-${app_user}" 2>/dev/null; then
    echo true
    return
  fi
  
  echo false
}

# Check Nginx status
check_nginx() {
  if command -v systemctl &> /dev/null && systemctl is-active --quiet nginx 2>/dev/null; then
    echo true
  else
    echo false
  fi
}

# Get last backup time
get_last_backup() {
  if [ -d "$BACKUP_DIR" ]; then
    local newest
    newest=$(find "$BACKUP_DIR" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    if [ -n "$newest" ]; then
      stat -c %y "$newest" 2>/dev/null | awk '{print $1 " " $2}'
    else
      echo "No backups found"
    fi
  else
    echo "No backups found"
  fi
}

# Get disk usage percentage
get_disk_usage() {
  df "$1" 2>/dev/null | awk 'NR==2 {print $5}' || echo "N/A"
}

# Get system uptime in human-readable format
get_uptime() {
  uptime -p 2>/dev/null | sed 's/^up //'
}

# Get load average
get_load_average() {
  uptime 2>/dev/null | awk -F'load average:' '{print $2}' | xargs || echo "N/A"
}

# Check if a path is a separate mount point
is_separate_mount() {
  local path="$1"
  [ -d "$path" ] && mountpoint -q "$path" 2>/dev/null
}

# Format disk usage with color
format_disk_usage() {
  local usage="$1"
  local label="$2"
  local usage_num="${usage%\%}"

  if ! [[ "$usage_num" =~ ^[0-9]+$ ]]; then
    echo -e "  ${label}: ${WHITE}N/A${NC}"
    return
  fi

  if [ "$usage_num" -ge 90 ]; then
    echo -e "  ${label}: ${RED}${usage}${NC} (critical)"
  elif [ "$usage_num" -ge 75 ]; then
    echo -e "  ${label}: ${YELLOW}${usage}${NC} (warning)"
  else
    echo -e "  ${label}: ${GREEN}${usage}${NC}"
  fi
}

# Main MOTD display
display_motd() {
  # Banner
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}               ${WHITE}LearnPlay  —  Cloud (Linux)${NC}                 ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}               ${WHITE}Gamified Learning Platform${NC}               ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # Date and time
  echo -e "${BOLD}System Information${NC} — $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  
  # System Health
  echo -e "${BOLD}System Health${NC}"
  local pg_ok=$(check_postgres)
  local pm2_ok=$(check_pm2_app)
  local nginx_ok=$(check_nginx)
  
  echo -n "  PostgreSQL: "
  [ "$pg_ok" = true ] && echo -e "${GREEN}$(check_mark) Running${NC}" || echo -e "${RED}$(cross_mark) Down${NC}"
  
  echo -n "  PM2 App:    "
  [ "$pm2_ok" = true ] && echo -e "${GREEN}$(check_mark) Running${NC}" || echo -e "${RED}$(cross_mark) Down${NC}"
  
  echo -n "  Nginx:      "
  [ "$nginx_ok" = true ] && echo -e "${GREEN}$(check_mark) Running${NC}" || echo -e "${RED}$(cross_mark) Down${NC}"
  
  echo ""
  
  # Platform Info
  echo -e "${BOLD}Platform Information${NC}"
  echo -e "  Version: ${WHITE}$(get_version)${NC}"
  echo -e "  Domain:  ${WHITE}$(get_domain)${NC}"
  echo -e "  SSL:     ${WHITE}$(get_ssl_mode)${NC}"
  echo ""

  refresh_cert_status_snapshot
  echo -e "${BOLD}Certificate Status${NC}"
  local cert_mode cert_days cert_expiry cert_next cert_last_status cert_last_message
  cert_mode="$(read_cert_status_field certificateMode)"
  cert_days="$(read_cert_status_number daysToExpiry)"
  cert_expiry="$(read_cert_status_field expiryUtc)"
  cert_next="$(read_cert_status_field nextAutoRenewLocal)"
  cert_last_status="$(read_cert_status_field lastRenewStatus)"
  cert_last_message="$(read_cert_status_field lastRenewMessage)"
  [ -n "$cert_mode" ] || cert_mode="unknown"
  echo -e "  Mode: ${WHITE}${cert_mode}${NC}"
  if [ -n "$cert_days" ] && [ "$cert_days" -ge 0 ] 2>/dev/null; then
    echo -e "  Expires in: ${WHITE}${cert_days} day(s)${NC} (${cert_expiry:-unknown})"
  else
    echo -e "  Expires in: ${WHITE}n/a${NC}"
  fi
  if [ "$cert_mode" = "letsencrypt" ]; then
    echo -e "  Next auto-renew: ${WHITE}${cert_next:-not scheduled}${NC}"
    echo -e "  Last renew: ${WHITE}${cert_last_status:-unknown}${NC}"
    if [ "${cert_last_status:-}" = "failed" ]; then
      echo -e "  Message: ${YELLOW}${cert_last_message:-Use sudo lppadmin to view certificate update logs}${NC}"
      echo -e "  Action:  ${WHITE}Run sudo lppadmin -> Security -> TLS auto-renew status/logs${NC}"
    elif [ -n "$cert_last_message" ]; then
      echo -e "  Message: ${WHITE}${cert_last_message}${NC}"
    fi
  fi
  echo ""
  
  # Last Backup
  echo -e "${BOLD}Database Backup${NC}"
  echo -e "  Last backup: ${WHITE}$(get_last_backup)${NC}"
  echo ""
  
  # Resources — show all platform mount points
  echo -e "${BOLD}System Resources${NC}"
  format_disk_usage "$(get_disk_usage /)" "Root (/)"
  is_separate_mount /opt/learnplay && format_disk_usage "$(get_disk_usage /opt/learnplay)" "App (/opt/learnplay)"
  is_separate_mount /opt/learnplay/uploads && format_disk_usage "$(get_disk_usage /opt/learnplay/uploads)" "Uploads (/opt/learnplay/uploads)"
  is_separate_mount /opt/lpdb && format_disk_usage "$(get_disk_usage /opt/lpdb)" "Database (/opt/lpdb)"
  is_separate_mount "$BACKUP_DIR" && format_disk_usage "$(get_disk_usage "$BACKUP_DIR")" "Backups ($BACKUP_DIR)"
  is_separate_mount /home/lppadmin && format_disk_usage "$(get_disk_usage /home/lppadmin)" "Admin Home (/home/lppadmin)"
  is_separate_mount /var/log && format_disk_usage "$(get_disk_usage /var/log)" "Logs (/var/log)"
  is_separate_mount /tmp && format_disk_usage "$(get_disk_usage /tmp)" "Temp (/tmp)"
  is_separate_mount /boot && format_disk_usage "$(get_disk_usage /boot)" "Boot (/boot)"
  echo -e "  Uptime: $(get_uptime)"
  echo -e "  Load Average: $(get_load_average)"
  echo ""
  
  # Footer
  echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}Manage LearnPlay:${NC} Run ${WHITE}sudo lppadmin${NC} to access the admin console"
  echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# Run display
display_motd
