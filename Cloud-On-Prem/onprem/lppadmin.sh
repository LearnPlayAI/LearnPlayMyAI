#!/usr/bin/env bash
set -euo pipefail

# Recover when invoked from a removed working directory (common after /tmp dist cleanup).
if ! pwd >/dev/null 2>&1; then
  cd /tmp 2>/dev/null || cd /
fi

LPPADMIN_VERSION="2026.03.10.2"

SELF_SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
SELF_SCRIPT_DIR="$(cd "$(dirname "$SELF_SCRIPT_PATH")" && pwd)"
SELF_APP_ROOT="$(cd "$SELF_SCRIPT_DIR/.." && pwd)"

# Canonical installed runtime roots.
INSTALLED_CLOUD_ROOT="/opt/learnplay/cloud"
INSTALLED_ONPREM_ROOT="/opt/learnplay/onprem"

# Legacy installed runtime roots (transition compatibility).
LEGACY_INSTALLED_CLOUD_ROOT="/opt/learnplay"
LEGACY_INSTALLED_ONPREM_ROOT="/opt/learnplay-onprem"

# Resolve roots for both dev workspace and installed hosts.
# Prioritize installed-runtime script locations when invoked from /opt paths.
if [[ "$SELF_SCRIPT_PATH" == /opt/learnplay/cloud/scripts/* ]]; then
  CLOUD_ROOT="$INSTALLED_CLOUD_ROOT"
elif [[ "$SELF_SCRIPT_PATH" == /opt/learnplay/onprem/scripts/* ]]; then
  CLOUD_ROOT="$INSTALLED_CLOUD_ROOT"
elif [ -d "/antigravity/Cloud-On-Prem" ]; then
  CLOUD_ROOT="/antigravity/Cloud-On-Prem"
elif [ -f "$SELF_APP_ROOT/.env" ] && [ -d "$SELF_APP_ROOT/server" ]; then
  CLOUD_ROOT="$SELF_APP_ROOT"
elif [ -f "${INSTALLED_CLOUD_ROOT}/.env" ]; then
  CLOUD_ROOT="$INSTALLED_CLOUD_ROOT"
elif [ -f "${LEGACY_INSTALLED_CLOUD_ROOT}/.env" ]; then
  CLOUD_ROOT="$LEGACY_INSTALLED_CLOUD_ROOT"
else
  CLOUD_ROOT="$SELF_APP_ROOT"
fi

if [[ "$SELF_SCRIPT_PATH" == /opt/learnplay/onprem/scripts/* ]]; then
  ONPREM_ROOT="$INSTALLED_ONPREM_ROOT"
elif [[ "$SELF_SCRIPT_PATH" == /opt/learnplay/cloud/scripts/* ]]; then
  ONPREM_ROOT="$INSTALLED_ONPREM_ROOT"
elif [ -d "/antigravity/Cloud-On-Prem" ]; then
  ONPREM_ROOT="/antigravity/Cloud-On-Prem"
elif [ -f "${INSTALLED_ONPREM_ROOT}/.env" ]; then
  ONPREM_ROOT="$INSTALLED_ONPREM_ROOT"
elif [ -f "${LEGACY_INSTALLED_ONPREM_ROOT}/.env" ]; then
  ONPREM_ROOT="$LEGACY_INSTALLED_ONPREM_ROOT"
else
  ONPREM_ROOT="$CLOUD_ROOT"
fi

if [ -d "$CLOUD_ROOT/cloud" ]; then
  CLOUD_SCRIPT_DIR="$CLOUD_ROOT/cloud"
elif [ -d "$CLOUD_ROOT/scripts" ]; then
  CLOUD_SCRIPT_DIR="$CLOUD_ROOT/scripts"
else
  CLOUD_SCRIPT_DIR="$CLOUD_ROOT"
fi

if [ -d "$ONPREM_ROOT/onprem" ]; then
  ONPREM_SCRIPT_DIR="$ONPREM_ROOT/onprem"
elif [ -d "$ONPREM_ROOT/scripts" ]; then
  ONPREM_SCRIPT_DIR="$ONPREM_ROOT/scripts"
else
  ONPREM_SCRIPT_DIR="$ONPREM_ROOT"
fi

DEFAULT_CLOUD_ROOT="$CLOUD_ROOT"
DEFAULT_ONPREM_ROOT="$ONPREM_ROOT"
DEFAULT_CLOUD_SCRIPT_DIR="$CLOUD_SCRIPT_DIR"
DEFAULT_ONPREM_SCRIPT_DIR="$ONPREM_SCRIPT_DIR"

GLOBAL_CONF_DIR="/etc/lppadmin"
GLOBAL_CONF_FILE="$GLOBAL_CONF_DIR/config.env"
ENV_PROFILE_FILE="$GLOBAL_CONF_DIR/environment.env"
GLOBAL_LOG_DIR="/var/log/learnplay-admin"
GLOBAL_LOG_FILE="$GLOBAL_LOG_DIR/lppadmin.log"
GLOBAL_JOURNAL_FILE="$GLOBAL_LOG_DIR/lppadmin-journal.log"
SECURITY_PATCH_REPORT_ROOT="${GLOBAL_LOG_DIR}/security-patches"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCOPE=""
SCOPE_LABEL=""
SCOPE_ROOT=""
SCOPE_SCRIPTS=""
SCOPE_ENV=""
ENV_FILE=""
SCOPE_SERVICE=""
SCOPE_APP_PORT=""
SCOPE_DEFAULT_DOMAIN=""
SCOPE_UPLOAD_DEFAULT="./uploads"
USE_WHIPTAIL=0
USE_DIALOG=0
WHIPTAIL_HAS_EXTRA=0
DIALOG_HAS_EXTRA=0

ACTION_STEPS=0
ACTION_FAILURES=0
ACTION_REPORT=""
ACTION_SUMMARY=""
ACTION_STEP_LOG_DIR=""
ACTION_LABEL=""
ADMIN_VARIANT="cloud"
LPPADMIN_PROFILE="dev_workspace"
HAS_CLOUD_SCOPE=1
HAS_ONPREM_SCOPE=1
MENU_BREADCRUMB="Home"
ENV_PROFILE_SOURCE="auto"

msg() { echo -e "$*"; }
log() {
  mkdir -p "$GLOBAL_LOG_DIR"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$GLOBAL_LOG_FILE"
}
sanitize_action_slug() {
  local raw="$1"
  local slug
  slug="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-')"
  slug="${slug#-}"
  slug="${slug%-}"
  [ -n "$slug" ] || slug="action"
  echo "$slug"
}
persist_action_report() {
  local label="$1"
  local status="$2"
  local summary="$3"
  local report="$4"
  local ts scope_name action_slug status_slug dir file latest_link
  ts="$(date '+%Y%m%d_%H%M%S')"
  scope_name="${SCOPE:-global}"
  action_slug="$(sanitize_action_slug "$label")"
  status_slug="$(printf '%s' "$status" | tr '[:upper:]' '[:lower:]')"
  dir="${GLOBAL_LOG_DIR}/actions/${scope_name}"
  file="${dir}/${ts}-${action_slug}-${status_slug}.log"
  latest_link="${dir}/latest-${action_slug}.log"
  mkdir -p "$dir"
  {
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "Scope: ${scope_name}"
    echo "Action: ${label}"
    echo "Status: ${status}"
    echo "Summary: ${summary}"
    echo ""
    printf "%b\n" "$report"
  } > "$file"
  ln -sfn "$(basename "$file")" "$latest_link"
  echo "$file"
}
journal_log() {
  mkdir -p "$GLOBAL_LOG_DIR"
  local event="$1"
  local status="$2"
  local detail="$3"
  echo "$(date '+%Y-%m-%d %H:%M:%S')|${SCOPE:-global}|${event}|${status}|${detail}" >> "$GLOBAL_JOURNAL_FILE"
}
err() { msg "${RED}ERROR:${NC} $*"; }
ok() { msg "${GREEN}OK:${NC} $*"; }
warn() { msg "${YELLOW}WARN:${NC} $*"; }
info() { msg "${CYAN}INFO:${NC} $*"; }

ui_init() {
  USE_DIALOG=0
  USE_WHIPTAIL=0
  WHIPTAIL_HAS_EXTRA=0
  DIALOG_HAS_EXTRA=0
  if [ ! -t 1 ] || [ "${NO_COLOR:-}" = "1" ]; then
    RED=''
    GREEN=''
    YELLOW=''
    CYAN=''
    BOLD=''
    NC=''
  fi
}

ui_term_width() {
  local w=100
  if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
    w="$(tput cols 2>/dev/null || echo 100)"
  fi
  if ! [[ "$w" =~ ^[0-9]+$ ]]; then
    w=100
  fi
  if [ "$w" -lt 70 ]; then
    w=70
  fi
  echo "$w"
}

ui_repeat() {
  local char="$1"
  local count="$2"
  local out=""
  local i
  for ((i=0; i<count; i++)); do
    out+="$char"
  done
  printf "%s" "$out"
}

ui_divider() {
  local width="${1:-$(ui_term_width)}"
  ui_repeat "-" "$width"
}

ui_status_badge() {
  local state="$1"
  case "${state^^}" in
    OK|ACTIVE|SUCCESS|PASS) printf "%b[OK]%b" "$GREEN" "$NC" ;;
    WARN|WARNING|DEGRADED) printf "%b[WARN]%b" "$YELLOW" "$NC" ;;
    FAIL|FAILED|ERROR|UNHEALTHY|INACTIVE) printf "%b[FAIL]%b" "$RED" "$NC" ;;
    *) printf "%b[INFO]%b" "$CYAN" "$NC" ;;
  esac
}

action_is_high_risk() {
  local label="$1"
  case "$label" in
    "Restore database from backup"|"Restore disaster recovery backup"|"Restore complete system backup"|"Rollback from snapshot"|"Edit table content"|"Run full update rehearsal (OS+app+db+webserver)"|"Update full package"|"Safe full update")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ui_recent_actions_block() {
  local out=""
  local lines
  if [ -f "$GLOBAL_JOURNAL_FILE" ]; then
    lines="$(tail -n 3 "$GLOBAL_JOURNAL_FILE" 2>/dev/null || true)"
  fi
  if [ -z "${lines:-}" ]; then
    echo "Recent Actions: none"
    return 0
  fi
  out="Recent Actions"$'\n'
  while IFS='|' read -r ts scope event status detail; do
    [ -n "${ts:-}" ] || continue
    out+="- ${ts} ${scope}/${event} (${status})"$'\n'
  done <<< "$lines"
  printf "%s" "$out"
}

ui_menu_choices_hint() {
  local -a keys=("$@")
  local joined=""
  local key
  for key in "${keys[@]}"; do
    if [ -n "$joined" ]; then
      joined+=", "
    fi
    joined+="$key"
  done
  printf "Select action [%s]: " "${joined:-b, x}"
}

ui_plain_status_line() {
  local host scope profile svc app_state
  host="$(hostname -s 2>/dev/null || echo "unknown-host")"
  scope="${SCOPE:-unset}"
  profile="${LPPADMIN_PROFILE:-unknown}"
  svc="${SCOPE_SERVICE:-n/a}"
  app_state="unknown"
  if command -v systemctl >/dev/null 2>&1 && [ -n "$svc" ] && [ "$svc" != "n/a" ]; then
    app_state="$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")"
  fi
  printf "Context: host=%s | scope=%s | profile=%s | app=%s %s\n" \
    "$host" "$scope" "$profile" "$svc" "$(ui_status_badge "$app_state")"
}

ui_home_status_panel() {
  local app nginx pg
  app="unknown"
  nginx="unknown"
  pg="unknown"
  if command -v systemctl >/dev/null 2>&1; then
    app="$(systemctl is-active "${SCOPE_SERVICE:-}" 2>/dev/null || echo "inactive")"
    nginx="$(systemctl is-active nginx 2>/dev/null || echo "inactive")"
    pg="$(postgres_service_active_state)"
  fi
  cat <<PANEL
System Status: app $(ui_status_badge "$app")  nginx $(ui_status_badge "$nginx")  postgresql $(ui_status_badge "$pg")
PANEL
}

main_brand_banner() {
  cat <<'BANNER'
LearnPlay
Learning made easy for everyone
BANNER
}

ui_msgbox() {
  local text="$1"
  if [ "$USE_DIALOG" -eq 1 ]; then
    dialog --title "LearnPlay lppadmin" --msgbox "$text" 12 90 || true
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    whiptail --title "LearnPlay lppadmin" --msgbox "$text" 12 90 || true
  else
    echo "$text"
  fi
}

ui_pause() {
  if [ "$USE_WHIPTAIL" -eq 1 ] || [ "$USE_DIALOG" -eq 1 ]; then
    # Avoid noisy extra dialogs after every action in whiptail mode.
    true
  else
    if [ -t 0 ]; then
      echo ""
      read -rp "Press Enter to continue..." _ || true
    fi
  fi
}

ui_menu() {
  local title="$1"
  local prompt="$2"
  local hint="${prompt}"$'\n\n'"Navigation: Arrow keys or type the menu number and press Enter."
  shift 2
  local choice rc
  local -a menu_keys=()
  local -a menu_items=("$@")
  local idx=0
  while [ "$idx" -lt "${#menu_items[@]}" ]; do
    menu_keys+=("${menu_items[$idx]}")
    idx=$((idx + 2))
  done
  if [ "$USE_DIALOG" -eq 1 ]; then
    if [ "$DIALOG_HAS_EXTRA" -eq 1 ]; then
      choice="$(dialog --stdout --title "$title" --extra-button --extra-label "Type Number" --menu "$hint" 24 100 16 "$@")"
    else
      choice="$(dialog --stdout --title "$title" --menu "$hint" 24 100 16 "$@")"
    fi
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "$choice"
      return 0
    fi
    if [ "$rc" -eq 3 ] && [ "$DIALOG_HAS_EXTRA" -eq 1 ]; then
      ui_inputbox "$title" "Type menu number to select:" ""
      return $?
    fi
    return 1
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    if [ "$WHIPTAIL_HAS_EXTRA" -eq 1 ]; then
      choice="$(whiptail --title "$title" --extra-button --extra-label "Type Number" --menu "$hint" 24 100 16 "$@" 3>&1 1>&2 2>&3)"
    else
      choice="$(whiptail --title "$title" --menu "$hint" 24 100 16 "$@" 3>&1 1>&2 2>&3)"
    fi
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "$choice"
      return 0
    fi
    if [ "$rc" -eq 3 ] && [ "$WHIPTAIL_HAS_EXTRA" -eq 1 ]; then
      ui_inputbox "$title" "Type menu number to select:" ""
      return $?
    fi
    return 1
  else
    while true; do
      local width
      width="$(ui_term_width)"
      printf "\n%b\n" "$(ui_divider "$width")" >&2
      printf "%b%s%b\n" "$BOLD" "$title" "$NC" >&2
      printf "%b\n" "$(ui_divider "$width")" >&2
      printf "%b\n" "$prompt" >&2
      printf "%b\n" "$(ui_plain_status_line)" >&2
      local i=0
      while [ "$i" -lt "${#menu_items[@]}" ]; do
        local key="${menu_items[$i]}"
        local label="${menu_items[$((i + 1))]}"
        printf "  %-4s %s\n" "${key})" "$label" >&2
        i=$((i + 2))
      done
      printf "%b\n" "$(ui_divider "$width")" >&2
      printf "Tips: b=Back (same as 0) | x=Exit | /=Filter menu\n" >&2
      local opt prompt_text
      prompt_text="$(ui_menu_choices_hint "${menu_keys[@]}")"
      if ! read -rp "$prompt_text" opt; then
        echo "0"
        return 0
      fi
      opt="$(printf '%s' "$opt" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      if [[ "$opt" == /* ]]; then
        local q
        q="${opt#/}"
        q="${q,,}"
        printf "\nFilter results for '%s':\n" "$q" >&2
        local matched=0 j=0
        while [ "$j" -lt "${#menu_items[@]}" ]; do
          local fkey="${menu_items[$j]}"
          local flabel="${menu_items[$((j + 1))]}"
          if [[ "${fkey,,}" == *"$q"* || "${flabel,,}" == *"$q"* ]]; then
            printf "  %-4s %s\n" "${fkey})" "$flabel" >&2
            matched=1
          fi
          j=$((j + 2))
        done
        if [ "$matched" -eq 0 ]; then
          printf "  (no matches)\n" >&2
        fi
        continue
      fi
      case "$(normalize_menu_choice "$opt")" in
        x|q|quit|exit) exit 0 ;;
        b) opt="0" ;;
      esac
      echo "$opt"
      return 0
    done
  fi
}

set_breadcrumb() {
  MENU_BREADCRUMB="$1"
}

menu_header_text() {
  local title="$1"
  local host ts recent
  host="$(hostname -s 2>/dev/null || echo "unknown-host")"
  ts="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  recent="$(ui_recent_actions_block)"
  cat <<HDR
$(ui_divider)
LearnPlay Administration (lppadmin ${LPPADMIN_VERSION})
$(ui_divider)
Breadcrumb: ${MENU_BREADCRUMB} | Scope: ${SCOPE:-unset} | Profile: ${LPPADMIN_PROFILE} | Host: ${host}
Generated: ${ts}

${title}
$(ui_divider)
${recent}
HDR
}

ui_menu_nav() {
  local title="$1"
  shift
  local prompt
  prompt="$(menu_header_text "$title")"
  local -a items=("$@")
  items+=("b" "Back [return to parent menu]")
  items+=("x" "Exit [close lppadmin]")
  ui_menu "$title" "$prompt" "${items[@]}"
}

normalize_menu_choice() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  printf '%s' "${value,,}"
}

handle_back_or_exit() {
  local opt
  opt="$(normalize_menu_choice "${1:-}")"
  case "$opt" in
    b|0) return 10 ;;
    x|q|quit|exit) exit 0 ;;
    *) return 0 ;;
  esac
}

# Wrapper for callers running under errexit (`set -e`).
# It preserves the return code from handle_back_or_exit without triggering
# immediate shell termination before the caller can inspect `$?`.
handle_back_or_exit_safe() {
  local opt="$1"
  local rc
  local had_errexit=0
  case "$-" in
    *e*) had_errexit=1; set +e ;;
  esac
  handle_back_or_exit "$opt"
  rc=$?
  if [ "$had_errexit" -eq 1 ]; then
    set -e
  fi
  return "$rc"
}

is_back_selected() {
  local opt="$1"
  local rc
  if handle_back_or_exit_safe "$opt"; then
    return 1
  fi
  rc=$?
  case "$rc" in
    10) return 0 ;;
    *) return "$rc" ;;
  esac
}

ui_checklist() {
  local title="$1"
  local prompt="$2"
  shift 2
  local out
  if [ "$USE_DIALOG" -eq 1 ]; then
    out="$(dialog --stdout --separate-output --checklist "$prompt" 24 100 16 "$@")" || return 1
    echo "$out"
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    out="$(whiptail --title "$title" --separate-output --checklist "$prompt" 24 100 16 "$@" 3>&1 1>&2 2>&3)" || return 1
    echo "$out"
  else
    printf "\n" >&2
    printf "%b\n" "${BOLD}${title}${NC}" >&2
    printf "%b\n" "$prompt" >&2
    local idx=1
    while [ "$#" -gt 2 ]; do
      local tag="$1"
      local item="$2"
      printf "  %s) %s [%s]\n" "$idx" "$item" "$tag" >&2
      shift 3
      idx=$((idx + 1))
    done
    local raw
    read -rp "Enter comma-separated component numbers (blank to cancel): " raw || return 1
    [ -n "$raw" ] || return 1
    IFS=',' read -r -a picks <<< "$raw"
    for p in "${picks[@]}"; do
      p="${p// /}"
      case "$p" in
        1) echo "postgresql" ;;
        2) echo "nginx" ;;
        3) echo "app" ;;
      esac
    done
  fi
}

ui_inputbox() {
  local title="$1"
  local prompt="$2"
  local default="${3:-}"
  if [ "$USE_DIALOG" -eq 1 ]; then
    dialog --stdout --title "$title" --inputbox "$prompt" 10 90 "$default" || return 1
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    whiptail --title "$title" --inputbox "$prompt" 10 90 "$default" 3>&1 1>&2 2>&3 || return 1
  else
    local v
    read -rp "$prompt " v || return 1
    if [ -z "$v" ]; then
      v="$default"
    fi
    echo "$v"
  fi
}

ui_passwordbox() {
  local title="$1"
  local prompt="$2"
  if [ "$USE_DIALOG" -eq 1 ]; then
    dialog --stdout --title "$title" --passwordbox "$prompt" 10 90 || return 1
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    whiptail --title "$title" --passwordbox "$prompt" 10 90 3>&1 1>&2 2>&3 || return 1
  else
    local v
    read -rsp "$prompt " v || return 1
    echo ""
    echo "$v"
  fi
}

ui_yesno() {
  local title="$1"
  local prompt="$2"
  if [ "${LPPADMIN_ASSUME_YES:-false}" = "true" ]; then
    return 0
  fi
  if [ "$USE_DIALOG" -eq 1 ]; then
    if dialog --title "$title" --yesno "$prompt" 12 90; then
      return 0
    fi
    return 1
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    if whiptail --title "$title" --yesno "$prompt" 12 90; then
      return 0
    fi
    return 1
  fi
  local v
  printf "\n%b\n" "${BOLD}${title}${NC}" >&2
  printf "%b\n" "$prompt" >&2
  read -rp "[y/N]: " v || return 1
  [[ "${v,,}" =~ ^(y|yes)$ ]]
}

ui_confirm_keyword() {
  local title="$1"
  local prompt="$2"
  local keyword="${3:-YES}"
  local typed=""
  if [ "$USE_DIALOG" -eq 1 ]; then
    typed="$(dialog --stdout --title "$title" --inputbox "${prompt}\n\nType ${keyword} to continue." 14 100 "" || true)"
    [ "$typed" = "$keyword" ]
    return $?
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    typed="$(whiptail --title "$title" --inputbox "${prompt}\n\nType ${keyword} to continue." 14 100 "" 3>&1 1>&2 2>&3 || true)"
    [ "$typed" = "$keyword" ]
    return $?
  fi
  printf "\n%b\n" "${BOLD}${title}${NC}" >&2
  printf "%b\n\n" "$prompt" >&2
  read -rp "Type ${keyword} to continue: " typed || return 1
  [ "$typed" = "$keyword" ]
}

ui_impact_card() {
  local label="$1"
  local details="$2"
  local risk="$3"
  local width
  width="$(ui_term_width)"
  cat <<CARD
$(ui_divider "$width")
Action: ${label}
Risk: ${risk}
Scope: ${SCOPE_LABEL} (${SCOPE})
Service: ${SCOPE_SERVICE}
Root: ${SCOPE_ROOT}
$(ui_divider "$width")
Impact:
${details}
CARD
}

ui_textbox() {
  local title="$1"
  local content="$2"
  local h="${3:-24}"
  local w="${4:-100}"
  if [ "$USE_DIALOG" -eq 1 ]; then
    local tmp
    tmp="$(mktemp)"
    printf "%b" "$content" > "$tmp"
    dialog --title "$title" --textbox "$tmp" "$h" "$w" || true
    rm -f "$tmp"
  elif [ "$USE_WHIPTAIL" -eq 1 ]; then
    local tmp
    tmp="$(mktemp)"
    printf "%b" "$content" > "$tmp"
    whiptail --title "$title" --scrolltext --textbox "$tmp" "$h" "$w" || true
    rm -f "$tmp"
  else
    echo ""
    printf "%b\n" "$content"
  fi
}

action_report_reset() {
  ACTION_STEPS=0
  ACTION_FAILURES=0
  ACTION_REPORT=""
  ACTION_SUMMARY=""
  ACTION_STEP_LOG_DIR="$(mktemp -d /tmp/lppadmin-steps-XXXXXX)"
}

action_report_add_text() {
  local text="$1"
  ACTION_REPORT+="$text"$'\n'
}

action_report_set_summary() {
  ACTION_SUMMARY="$1"
}

run_cmd_step() {
  local description="$1"
  shift
  local tmp rc cmd_display output step_log
  cmd_display="$(printf "%s " "$@")"
  cmd_display="${cmd_display% }"
  [ -n "${ACTION_STEP_LOG_DIR:-}" ] || ACTION_STEP_LOG_DIR="$(mktemp -d /tmp/lppadmin-steps-XXXXXX)"
  ACTION_STEPS=$((ACTION_STEPS + 1))
  step_log="${ACTION_STEP_LOG_DIR}/step-${ACTION_STEPS}.log"
  tmp="$step_log"

  local step_label
  step_label="[Step ${ACTION_STEPS}]"
  printf "\n%b %s\n" "$step_label" "$description"
  printf "Command: %s\n" "$cmd_display"

  set +e
  "$@" 2>&1 | tee "$tmp"
  rc=${PIPESTATUS[0]}
  if [ "$rc" -eq 0 ]; then
    printf "Result: %b\n" "$(ui_status_badge OK)"
  else
    printf "Result: %b\n" "$(ui_status_badge FAIL)"
  fi
  printf "Step log: %s\n" "$step_log"
  set -e
  output="$(cat "$tmp")"

  action_report_add_text "[Step ${ACTION_STEPS}] ${description}"
  action_report_add_text "Command: ${cmd_display}"
  action_report_add_text "Exit code: ${rc}"
  action_report_add_text "Logs: ${step_log}"
  if [ -n "$output" ]; then
    action_report_add_text "Output:"
    action_report_add_text "$output"
  else
    action_report_add_text "Output: (none)"
  fi
  action_report_add_text ""
  if [ "$rc" -ne 0 ]; then
    ACTION_FAILURES=$((ACTION_FAILURES + 1))
  fi
  return "$rc"
}

run_cmd_step_optional() {
  local description="$1"
  shift
  if run_cmd_step "$description" "$@"; then
    return 0
  fi
  ACTION_FAILURES=$((ACTION_FAILURES - 1))
  action_report_add_text "Note: Step failure marked as non-fatal."
  action_report_add_text ""
  return 0
}

run_cmd_step_sh() {
  local description="$1"
  local command="$2"
  run_cmd_step "$description" /bin/bash -lc "$command"
}

resolve_workspace_user() {
  local preferred_root="${1:-}"
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    echo "${SUDO_USER}"
    return 0
  fi
  if [ -n "$preferred_root" ] && [ -d "$preferred_root" ]; then
    local owner
    owner="$(stat -c '%U' "$preferred_root" 2>/dev/null || true)"
    if [ -n "$owner" ] && [ "$owner" != "root" ]; then
      echo "$owner"
      return 0
    fi
  fi
  echo ""
}

run_cmd_step_sh_as_user() {
  local description="$1"
  local run_user="$2"
  local command="$3"
  if [ -z "$run_user" ] || [ "$run_user" = "root" ]; then
    run_cmd_step_sh "$description" "$command"
    return $?
  fi
  if command -v runuser >/dev/null 2>&1; then
    run_cmd_step "$description" runuser -u "$run_user" -- /bin/bash -lc "$command"
  else
    run_cmd_step "$description" su -s /bin/bash - "$run_user" -c "$command"
  fi
}

confirm_action_if_needed() {
  local label="$1"
  local details=""
  case "$label" in
    "One-click repair")
      details="This will modify files and service state:\n- Ensure session/env settings\n- Fix upload directory permissions\n- Create/update systemd service if missing\n- Reload nginx and start app service"
      ;;
    "Start full stack components")
      details="You will choose execution scope next:\n- All components (postgresql, nginx, ${SCOPE_SERVICE})\n- Or selected components only\n\nSafe order is enforced automatically."
      ;;
    "Stop full stack components")
      details="You will choose execution scope next:\n- All components (postgresql, nginx, ${SCOPE_SERVICE})\n- Or selected components only\n\nSafe order is enforced automatically."
      ;;
    "Restart full stack components")
      details="You will choose execution scope next:\n- All components (postgresql, nginx, ${SCOPE_SERVICE})\n- Or selected components only\n\nSafe order is enforced automatically."
      ;;
    "Create/update systemd service")
      details="This will write /etc/systemd/system/${SCOPE_SERVICE}.service,\nrun daemon-reload, and enable the unit."
      ;;
    "App service start only")
      details="This will run: systemctl start ${SCOPE_SERVICE}"
      ;;
    "App service stop only")
      details="This will run: systemctl stop ${SCOPE_SERVICE}"
      ;;
    "App service restart only")
      details="This will run: systemctl restart ${SCOPE_SERVICE}"
      ;;
    "Restore database from backup")
      details="This will restore SQL into DATABASE_URL and may overwrite current data."
      ;;
    "VACUUM ANALYZE")
      details="This runs VACUUM (ANALYZE) on the database."
      ;;
    "Deploy latest changes")
      details="This runs dependency install, DB migration, optional build, and stack restart."
      ;;
    "Update OS packages only")
      details="This applies apt package updates.\nYou must confirm a full OS snapshot exists before running.\nUse this first in dev, then in production."
      ;;
    "Run full update rehearsal (OS+app+db+webserver)")
      details="This runs a full pre-production update rehearsal:\n1) OS package updates (apt)\n2) npm dependency update\n3) DB migrations\n4) app build (if available)\n5) restart/reload web/db/app stack"
      ;;
    "Update full package"|"Safe full update")
      details="This will apply ALL packaged release changes (app, db, scripts, lppadmin).\nA backup is strongly recommended before continuing."
      ;;
    "Update app and database")
      details="This will apply packaged app and database changes.\nService restart and migration changes may occur."
      ;;
    "Update lppadmin command")
      details="This updates the lppadmin command script and command symlink."
      ;;
    "Apply update package")
      details="This discovers and applies an update package from configured sources."
      ;;
    "Create complete system backup")
      details="This creates a full backup archive including app, database, and uploads."
      ;;
    "Create disaster recovery backup"|"Create encrypted DR backup")
      details="This creates a DR backup archive intended for full host recovery."
      ;;
    "Restore disaster recovery backup"|"Restore complete system backup")
      details="This operation can overwrite current state with backup data."
      ;;
    "Edit table content")
      details="This executes direct SQL data changes. A backup should be created before commit."
      ;;
    "Build and package cloud installer")
      details="This will run in the dev workspace:\n- Build dist-cloud package\n- Create tar.gz installer archive\n- Generate SHA256 checksum\n\nUse this package for LearnPlay cloud production systems."
      ;;
    "Build and package on-prem installer")
      details="This will run in the dev workspace:\n- Build dist-onprem package\n- Create tar.gz installer archive\n- Generate SHA256 checksum\n\nImportant: this package forces ONPREM_MODE=true and disables the cloud enterprise portal login."
      ;;
    *)
      return 0
      ;;
  esac
  local risk
  if action_is_high_risk "$label"; then
    risk="HIGH"
  else
    risk="NORMAL"
  fi
  local prompt
  prompt="$(ui_impact_card "$label" "$details" "$risk")"
  if [ "$risk" = "HIGH" ]; then
    ui_confirm_keyword "${SCOPE_LABEL} Confirm Action (High Risk)" "${prompt}" "YES"
  else
    ui_yesno "${SCOPE_LABEL} Confirm Action" "${prompt}\n\nProceed?"
  fi
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    err "Run with sudo: sudo lppadmin"
    exit 1
  fi
}

systemd_unit_name_exists() {
  local svc="$1"
  systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -qx "${svc}.service"
}

ui_scan_note() {
  local msg="$1"
  if [ -t 1 ] && [ "${LPPADMIN_SCAN_VERBOSE:-true}" = "true" ]; then
    printf "Scanning %s...\n" "$msg" >&2
  fi
}

detect_runtime_service_name() {
  local scope="${1:-${SCOPE:-cloud}}"
  local app_root=""
  local candidates=()
  local fallback_candidates=()
  local app_user=""
  local cache_var=""
  local cached=""

  case "$scope" in
    cloud) cache_var="DETECTED_SERVICE_CLOUD" ;;
    onprem) cache_var="DETECTED_SERVICE_ONPREM" ;;
  esac
  if [ -n "$cache_var" ]; then
    cached="$(eval "printf '%s' \"\${$cache_var:-}\"")"
    if [ -n "$cached" ]; then
      echo "$cached"
      return 0
    fi
  fi

  if [ "$scope" = "onprem" ]; then
    app_root="${SCOPE_ROOT:-${ONPREM_ROOT:-}}"
    candidates=(
      "learnplay-onprem"
      "learnplay"
      "pm2-learnplay-onprem"
      "pm2-learnplay"
    )
  else
    app_root="${SCOPE_ROOT:-${CLOUD_ROOT:-}}"
    candidates=(
      "learnplay-cloud"
      "learnplay"
      "pm2-learnplay"
    )
  fi

  if [ -n "${SCOPE_ENV:-}" ] && [ -f "$SCOPE_ENV" ]; then
    app_user="$(grep -E '^LP_ADMIN_USER=' "$SCOPE_ENV" 2>/dev/null | cut -d= -f2 || true)"
  fi
  if [ -z "$app_user" ] && [ -n "$app_root" ]; then
    app_user="$(stat -c '%U' "$app_root" 2>/dev/null || echo "")"
  fi
  if [ -z "$app_user" ]; then
    app_user="${SUDO_USER:-}"
  fi

  local unit unit_name wd exec_start
  if [ -n "$app_root" ] && command -v systemctl >/dev/null 2>&1; then
    ui_scan_note "${scope} runtime service from systemd units"
    while IFS= read -r unit; do
      unit_name="${unit%.service}"
      [ -n "$unit_name" ] || continue
      # Never treat lppadmin's own service as the application runtime service.
      if [[ "$unit_name" == *lppadmin* ]]; then
        continue
      fi
      wd="$(systemctl show "$unit_name" -p WorkingDirectory --value 2>/dev/null || true)"
      exec_start="$(systemctl show "$unit_name" -p ExecStart --value 2>/dev/null || true)"
      if [ "$wd" = "$app_root" ] || [[ "$exec_start" == *"$app_root/"* ]]; then
        [ -n "$cache_var" ] && eval "$cache_var=\"\$unit_name\""
        echo "$unit_name"
        return 0
      fi
    done < <(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}')
  fi

  local c
  ui_scan_note "${scope} runtime service from known candidates"
  for c in "${candidates[@]}"; do
    if systemd_unit_name_exists "$c"; then
      [ -n "$cache_var" ] && eval "$cache_var=\"\$c\""
      echo "$c"
      return 0
    fi
  done

  if [ -n "$app_user" ]; then
    fallback_candidates+=("pm2-${app_user}")
  fi
  for c in "${fallback_candidates[@]}"; do
    if systemd_unit_name_exists "$c"; then
      [ -n "$cache_var" ] && eval "$cache_var=\"\$c\""
      echo "$c"
      return 0
    fi
  done

  [ -n "$cache_var" ] && eval "$cache_var=\"\${candidates[0]}\""
  echo "${candidates[0]}"
}
detect_lppadmin_profile() {
  LPPADMIN_PROFILE="dev_workspace"
  HAS_CLOUD_SCOPE=1
  HAS_ONPREM_SCOPE=0

  # Installed runtime can invoke lppadmin via /usr/local/bin symlink.
  # Detect by deployed app roots, not only script location.
  if [ -f "${INSTALLED_CLOUD_ROOT}/.env" ] || [ -f "${LEGACY_INSTALLED_CLOUD_ROOT}/.env" ]; then
    LPPADMIN_PROFILE="installed_runtime"
    HAS_CLOUD_SCOPE=1
    if [ -f "${INSTALLED_ONPREM_ROOT}/.env" ] || [ -f "${LEGACY_INSTALLED_ONPREM_ROOT}/.env" ]; then
      HAS_ONPREM_SCOPE=1
    else
      HAS_ONPREM_SCOPE=0
    fi
    return 0
  fi

  case "$SELF_SCRIPT_DIR" in
    /opt/learnplay/cloud/scripts|/opt/learnplay/cloud/scripts/*|/opt/learnplay/onprem/scripts|/opt/learnplay/onprem/scripts/*|/opt/learnplay/scripts|/opt/learnplay/scripts/*|/opt/learnplay-onprem/scripts|/opt/learnplay-onprem/scripts/*)
      LPPADMIN_PROFILE="installed_runtime"
      if [ -f "${INSTALLED_CLOUD_ROOT}/.env" ] || [ -f "${LEGACY_INSTALLED_CLOUD_ROOT}/.env" ]; then
        HAS_CLOUD_SCOPE=1
      else
        HAS_CLOUD_SCOPE=0
      fi
      if [ -f "${INSTALLED_ONPREM_ROOT}/.env" ] || [ -f "${LEGACY_INSTALLED_ONPREM_ROOT}/.env" ]; then
        HAS_ONPREM_SCOPE=1
      else
        HAS_ONPREM_SCOPE=0
      fi
      ;;
  esac
  if [ "$LPPADMIN_PROFILE" = "dev_workspace" ]; then
    HAS_ONPREM_SCOPE=1
  fi
}

write_environment_profile() {
  mkdir -p "$GLOBAL_CONF_DIR"
  cat > "$ENV_PROFILE_FILE" <<EOF
PROFILE=${LPPADMIN_PROFILE}
AVAILABLE_SCOPES=$( [ "$HAS_CLOUD_SCOPE" -eq 1 ] && printf "cloud" ; [ "$HAS_ONPREM_SCOPE" -eq 1 ] && printf ",onprem" )
ACTIVE_SCOPE=${SCOPE:-cloud}
CLOUD_ROOT=${CLOUD_ROOT}
ONPREM_ROOT=${ONPREM_ROOT}
CLOUD_SCRIPTS=${CLOUD_SCRIPT_DIR}
ONPREM_SCRIPTS=${ONPREM_SCRIPT_DIR}
CLOUD_ENV=${CLOUD_ROOT}/.env
ONPREM_ENV=${ONPREM_ROOT}/.env
CLOUD_SERVICE="${CLOUD_SERVICE:-learnplay-cloud}"
ONPREM_SERVICE="${ONPREM_SERVICE:-learnplay-onprem}"
LAST_DETECTED=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
DETECTION_SOURCE=${ENV_PROFILE_SOURCE}
EOF
  chmod 600 "$ENV_PROFILE_FILE"
}

load_environment_profile() {
  if [ ! -f "$ENV_PROFILE_FILE" ]; then
    return 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_PROFILE_FILE"
  # Reject stale dev-workspace profiles when installed runtime exists.
  if [ "${PROFILE:-}" = "dev_workspace" ] && { [ -f "${INSTALLED_CLOUD_ROOT}/.env" ] || [ -f "${LEGACY_INSTALLED_CLOUD_ROOT}/.env" ]; }; then
    return 1
  fi
  # Reject stale temporary dist roots from previous update sessions.
  if [ -n "${CLOUD_ROOT:-}" ] && [[ "$CLOUD_ROOT" == /tmp/dist-* ]]; then
    return 1
  fi
  if [ -n "${ONPREM_ROOT:-}" ] && [[ "$ONPREM_ROOT" == /tmp/dist-* ]]; then
    return 1
  fi
  # Installed profile must point at real runtime roots with env files.
  if [ "${PROFILE:-}" = "installed_runtime" ] && [ -n "${CLOUD_ROOT:-}" ] && [ ! -f "${CLOUD_ROOT}/.env" ]; then
    return 1
  fi
  # Self-heal stale profile entries after runtime path migrations.
  if [ -n "${CLOUD_ROOT:-}" ] && [[ "$CLOUD_ROOT" == *"/Linux-On-Prem"* ]]; then
    return 1
  fi
  if [ -n "${ONPREM_ROOT:-}" ] && [[ "$ONPREM_ROOT" == *"/Linux-On-PRem"* ]]; then
    return 1
  fi
  if [ -n "${ONPREM_ROOT:-}" ] && [[ "$ONPREM_ROOT" == *"/Linux-On-Prem"* ]]; then
    return 1
  fi
  return 0
}

refresh_environment_profile() {
  CLOUD_ROOT="$DEFAULT_CLOUD_ROOT"
  ONPREM_ROOT="$DEFAULT_ONPREM_ROOT"
  CLOUD_SCRIPT_DIR="$DEFAULT_CLOUD_SCRIPT_DIR"
  ONPREM_SCRIPT_DIR="$DEFAULT_ONPREM_SCRIPT_DIR"
  ENV_PROFILE_SOURCE="auto"
  detect_lppadmin_profile
  write_environment_profile
}

show_environment_profile() {
  local out=""
  out+="Environment Profile"$'\n'
  out+="File: ${ENV_PROFILE_FILE}"$'\n\n'
  if [ -f "$ENV_PROFILE_FILE" ]; then
    out+="$(cat "$ENV_PROFILE_FILE")"
  else
    out+="Profile file not found."
  fi
  ui_textbox "Environment Profile" "$out" 28 120
}

edit_environment_profile() {
  mkdir -p "$GLOBAL_CONF_DIR"
  touch "$ENV_PROFILE_FILE"
  chmod 600 "$ENV_PROFILE_FILE"
  local key value
  key="$(ui_menu_nav "Environment Profile Edit [choose field to update]" \
    "1" "ACTIVE_SCOPE [set cloud or onprem]" \
    "2" "CLOUD_ROOT [set cloud root path]" \
    "3" "ONPREM_ROOT [set onprem root path]" \
    "4" "CLOUD_SERVICE [set cloud service name]" \
    "5" "ONPREM_SERVICE [set onprem service name]" \
    "6" "DETECTION_SOURCE [set source marker]")" || return 0
  if is_back_selected "$key"; then return 0; fi
  case "$key" in
    1) key="ACTIVE_SCOPE"; value="$(ui_inputbox "Environment Profile" "ACTIVE_SCOPE value (cloud/onprem):" "${ACTIVE_SCOPE:-cloud}")" || return 0 ;;
    2) key="CLOUD_ROOT"; value="$(ui_inputbox "Environment Profile" "CLOUD_ROOT value:" "${CLOUD_ROOT}")" || return 0 ;;
    3) key="ONPREM_ROOT"; value="$(ui_inputbox "Environment Profile" "ONPREM_ROOT value:" "${ONPREM_ROOT}")" || return 0 ;;
    4) key="CLOUD_SERVICE"; value="$(ui_inputbox "Environment Profile" "CLOUD_SERVICE value:" "${CLOUD_SERVICE:-learnplay-cloud}")" || return 0 ;;
    5) key="ONPREM_SERVICE"; value="$(ui_inputbox "Environment Profile" "ONPREM_SERVICE value:" "${ONPREM_SERVICE:-learnplay-onprem}")" || return 0 ;;
    6) key="DETECTION_SOURCE"; value="$(ui_inputbox "Environment Profile" "DETECTION_SOURCE value:" "manual")" || return 0 ;;
    *) return 0 ;;
  esac
  upsert_kv_file "$ENV_PROFILE_FILE" "$key" "$value"
  ok "Updated ${key} in ${ENV_PROFILE_FILE}"
}

reset_environment_profile() {
  rm -f "$ENV_PROFILE_FILE"
  refresh_environment_profile
  ok "Environment profile reset and re-detected."
}

environment_profile_health_check() {
  local out="" fails=0
  out+="Environment Profile Health Check"$'\n\n'
  if [ ! -f "$ENV_PROFILE_FILE" ]; then
    out+="FAIL: ${ENV_PROFILE_FILE} missing"$'\n'
    fails=$((fails + 1))
  else
    out+="OK: ${ENV_PROFILE_FILE} exists"$'\n'
  fi
  [ -d "$CLOUD_ROOT" ] && out+="OK: CLOUD_ROOT exists (${CLOUD_ROOT})"$'\n' || { out+="FAIL: CLOUD_ROOT missing (${CLOUD_ROOT})"$'\n'; fails=$((fails + 1)); }
  [ -d "$ONPREM_ROOT" ] && out+="OK: ONPREM_ROOT exists (${ONPREM_ROOT})"$'\n' || { out+="WARN: ONPREM_ROOT missing (${ONPREM_ROOT})"$'\n'; }
  [ -d "$CLOUD_SCRIPT_DIR" ] && out+="OK: CLOUD_SCRIPTS exists (${CLOUD_SCRIPT_DIR})"$'\n' || { out+="FAIL: CLOUD_SCRIPTS missing (${CLOUD_SCRIPT_DIR})"$'\n'; fails=$((fails + 1)); }
  [ -d "$ONPREM_SCRIPT_DIR" ] && out+="OK: ONPREM_SCRIPTS exists (${ONPREM_SCRIPT_DIR})"$'\n' || { out+="WARN: ONPREM_SCRIPTS missing (${ONPREM_SCRIPT_DIR})"$'\n'; }
  if [ "$fails" -eq 0 ]; then
    out+=$'\n'"Overall: PASS"
  else
    out+=$'\n'"Overall: FAIL (${fails})"
  fi
  ui_textbox "Environment Profile Health" "$out" 24 110
}

load_global_conf() {
  mkdir -p "$GLOBAL_CONF_DIR" "$GLOBAL_LOG_DIR"
  if [ ! -f "$GLOBAL_CONF_FILE" ]; then
    cat > "$GLOBAL_CONF_FILE" <<CFG
BACKUP_ROOT=/lppbackups
BACKUP_COMPRESS=true
BACKUP_RETENTION_DAYS=30
DEFAULT_TLS_MODE=self-signed
CERT_RENEW_THRESHOLD_DAYS=10
ENABLE_HEALTH_ALERTS=false
ALERT_WEBHOOK_URL=
ALERT_EMAIL_TO=
CFG
    chmod 600 "$GLOBAL_CONF_FILE"
  fi
  # shellcheck disable=SC1090
  source "$GLOBAL_CONF_FILE"
  BACKUP_ROOT="$(resolve_backup_root_base "${BACKUP_ROOT:-/lppbackups}")"
}

upsert_kv_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  if [ -f "$file" ]; then
    awk -v k="$key" '
      $0 ~ ("^" k "=") { next }
      { print }
    ' "$file" > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

save_global_conf_value() {
  local key="$1"
  local value="$2"
  upsert_kv_file "$GLOBAL_CONF_FILE" "$key" "$value"
}

can_use_backup_root() {
  local root="$1"
  [ -n "$root" ] || return 1
  mkdir -p "$root" 2>/dev/null || return 1
  [ -w "$root" ]
}

resolve_backup_root_base() {
  local preferred="$1"
  local fallback="/opt/lpdb/lppbackups"

  if can_use_backup_root "$preferred"; then
    echo "$preferred"
    return 0
  fi

  if [ "$preferred" != "/lppbackups" ] && can_use_backup_root "/lppbackups"; then
    warn "Configured BACKUP_ROOT is unavailable (${preferred}); using /lppbackups"
    echo "/lppbackups"
    return 0
  fi

  mkdir -p /opt/lpdb 2>/dev/null || true
  if can_use_backup_root "$fallback"; then
    warn "Primary backup root unavailable (${preferred}); using fallback ${fallback}"
    echo "$fallback"
    return 0
  fi

  # Last-resort local fallback.
  echo "/tmp/lppbackups"
}

select_scope() {
  local choice="$1"
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
    if [ "$choice" = "cloud" ] && [ "$HAS_CLOUD_SCOPE" -ne 1 ]; then
      err "Cloud scope is not available on this host."
      return 1
    fi
    if [ "$choice" = "onprem" ] && [ "$HAS_ONPREM_SCOPE" -ne 1 ]; then
      err "OnPrem scope is not available on this host."
      return 1
    fi
  fi
  case "$choice" in
    cloud)
      SCOPE="cloud"
      SCOPE_LABEL="Cloud"
      SCOPE_ROOT="$CLOUD_ROOT"
      SCOPE_SCRIPTS="$CLOUD_SCRIPT_DIR"
      SCOPE_ENV="$CLOUD_ROOT/.env"
      if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
        SCOPE_SERVICE="$(detect_runtime_service_name cloud)"
        SCOPE_APP_PORT="3000"
        SCOPE_DEFAULT_DOMAIN="learnplay.co.za"
        SCOPE_UPLOAD_DEFAULT="${SCOPE_ROOT}/uploads"
      else
        SCOPE_SERVICE="learnplay-cloud-dev"
        SCOPE_APP_PORT="8000"
        SCOPE_DEFAULT_DOMAIN="cloud.learnplay.co.za"
        SCOPE_UPLOAD_DEFAULT="./uploads"
      fi
      ;;
    onprem)
      SCOPE="onprem"
      SCOPE_LABEL="OnPrem"
      SCOPE_ROOT="$ONPREM_ROOT"
      SCOPE_SCRIPTS="$ONPREM_SCRIPT_DIR"
      SCOPE_ENV="$ONPREM_ROOT/.env"
      if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
        SCOPE_SERVICE="$(detect_runtime_service_name onprem)"
        SCOPE_APP_PORT="3000"
        SCOPE_DEFAULT_DOMAIN="onprem.learnplay.co.za"
        SCOPE_UPLOAD_DEFAULT="${SCOPE_ROOT}/uploads"
      else
        SCOPE_SERVICE="learnplay-onprem-dev"
        SCOPE_APP_PORT="9000"
        SCOPE_DEFAULT_DOMAIN="onprem.learnplay.co.za"
        SCOPE_UPLOAD_DEFAULT="./uploads"
      fi
      ;;
    *)
      err "Unknown scope: $choice"
      return 1
      ;;
  esac
  ENV_FILE="$SCOPE_ENV"
  BACKUP_ROOT="$(resolve_backup_root_base "${BACKUP_ROOT:-/lppbackups}")"
}

parse_base_host() {
  local base_url="$1"
  base_url="${base_url#http://}"
  base_url="${base_url#https://}"
  echo "${base_url%%/*}"
}

backup_single_file() {
  local file_path="$1"
  local kind="$2"
  if [ ! -f "$file_path" ]; then
    return 0
  fi
  local ts
  ts="$(date '+%Y%m%d_%H%M%S')"
  local dst_dir="${BACKUP_ROOT}/${SCOPE}/config-backups/${kind}"
  mkdir -p "$dst_dir"
  cp -a "$file_path" "$dst_dir/$(basename "$file_path").${ts}.bak"
}

ensure_env_exists() {
  if [ -f "$SCOPE_ENV" ]; then
    repair_env_file "$SCOPE_ENV"
    normalize_scope_env_permissions
    return 0
  fi

  local template=""
  if [ "$SCOPE" = "cloud" ]; then
    template="$SCOPE_ROOT/.env.example"
  else
    template="$SCOPE_ROOT/onprem/.env.example"
  fi

  if [ ! -f "$template" ]; then
    err "Template not found: $template"
    return 1
  fi

  cp "$template" "$SCOPE_ENV"
  repair_env_file "$SCOPE_ENV"
  normalize_scope_env_permissions
  ok "Created $SCOPE_ENV from template"
}

env_get() {
  local key="$1"
  if [ ! -f "$SCOPE_ENV" ]; then
    echo ""
    return 0
  fi
  local line
  line="$(grep -m1 -E "^${key}=" "$SCOPE_ENV" 2>/dev/null || true)"
  if [ -z "$line" ]; then
    echo ""
  else
    normalize_secret_input_value "${line#*=}"
  fi
}

env_get_from_file() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    echo ""
    return 0
  fi
  local line
  line="$(grep -m1 -E "^${key}=" "$file" 2>/dev/null || true)"
  if [ -z "$line" ]; then
    echo ""
  else
    normalize_secret_input_value "${line#*=}"
  fi
}

is_behind_caddy_mode() {
  local setup_ssl behind_caddy
  setup_ssl="$(env_get LEARNPLAY_SETUP_SSL)"
  behind_caddy="$(env_get LEARNPLAY_BEHIND_CADDY)"
  behind_caddy="$(printf '%s' "${behind_caddy:-false}" | tr '[:upper:]' '[:lower:]')"
  if [ "$setup_ssl" = "caddy-http" ] || [ "$behind_caddy" = "true" ]; then
    return 0
  fi
  return 1
}

repair_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0

  local tmp pending_key line
  tmp="$(mktemp)"
  pending_key=""

  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$pending_key" ]; then
      if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || [[ "$line" =~ ^[[:space:]]*# ]] || [ -z "$line" ]; then
        printf '%s=\n' "$pending_key" >> "$tmp"
        pending_key=""
      else
        if is_secret_key "$pending_key"; then
          printf '%s=%s\n' "$pending_key" "$(normalize_env_stored_value "$line")" >> "$tmp"
        else
          printf '%s=%s\n' "$pending_key" "$line" >> "$tmp"
        fi
        pending_key=""
        continue
      fi
    fi

    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*=(.*)$ ]]; then
      local key="${line%%=*}"
      local value="${line#*=}"
      if [ -z "$value" ]; then
        pending_key="$key"
      else
        if is_secret_key "$key"; then
          printf '%s=%s\n' "$key" "$(normalize_env_stored_value "$value")" >> "$tmp"
        else
          printf '%s\n' "$line" >> "$tmp"
        fi
      fi
    elif [[ "$line" =~ ^[[:space:]]*# ]] || [ -z "$line" ]; then
      printf '%s\n' "$line" >> "$tmp"
    else
      printf '# LPPADMIN_RECOVERED_ORPHAN: %s\n' "$line" >> "$tmp"
    fi
  done < "$file"

  if [ -n "$pending_key" ]; then
    printf '%s=\n' "$pending_key" >> "$tmp"
  fi

  cat "$tmp" > "$file"
  rm -f "$tmp"
}

quote_env_value() {
  local value="$1"
  if [[ "$value" =~ ^[A-Za-z0-9_./:@%+=,-]*$ ]]; then
    printf '%s' "$value"
    return 0
  fi
  local escaped
  escaped="$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
  printf "'%s'" "$escaped"
}

trim_whitespace() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

normalize_secret_input_value() {
  local value="$1"
  value="$(trim_whitespace "$value")"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  value="$(trim_whitespace "$value")"
  printf '%s' "$value"
}

normalize_env_stored_value() {
  local value="$1"
  value="$(trim_whitespace "$value")"
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then
    local inner
    inner="$(trim_whitespace "${BASH_REMATCH[1]}")"
    inner="$(printf '%s' "$inner" | sed "s/'/'\\\\''/g")"
    printf "'%s'" "$inner"
    return 0
  fi
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    local inner
    inner="$(trim_whitespace "${BASH_REMATCH[1]}")"
    inner="${inner//\"/\\\"}"
    printf '"%s"' "$inner"
    return 0
  fi
  printf '%s' "$value"
}

normalize_scope_env_permissions() {
  [ -n "${SCOPE_ENV:-}" ] || return 0
  [ -f "$SCOPE_ENV" ] || return 0

  local run_user run_group
  run_user="$(detect_scope_app_user)"
  if [ -z "$run_user" ] || ! id -u "$run_user" >/dev/null 2>&1; then
    run_user="${SUDO_USER:-lppadmin}"
  fi
  if [ -n "$run_user" ] && id -u "$run_user" >/dev/null 2>&1; then
    run_group="$(id -gn "$run_user" 2>/dev/null || echo "$run_user")"
    chown "$run_user:$run_group" "$SCOPE_ENV" 2>/dev/null || true
  fi

  # Runtime services source this file; keep strict but readable by runtime user.
  chmod 640 "$SCOPE_ENV" 2>/dev/null || true
}

normalize_scope_runtime_permissions() {
  local run_user run_group f
  run_user="$(detect_scope_app_user)"
  if [ -z "$run_user" ] || ! id -u "$run_user" >/dev/null 2>&1; then
    run_user="${SUDO_USER:-lppadmin}"
  fi
  if [ -z "$run_user" ] || ! id -u "$run_user" >/dev/null 2>&1; then
    return 0
  fi
  run_group="$(id -gn "$run_user" 2>/dev/null || echo "$run_user")"

  for f in \
    "$SCOPE_ROOT/.runtime-identity.json" \
    "$SCOPE_ROOT/version.json" \
    "$SCOPE_ROOT/release-manifest.json"; do
    [ -f "$f" ] || continue
    chown "$run_user:$run_group" "$f" 2>/dev/null || true
    chmod 644 "$f" 2>/dev/null || true
  done
}

scope_env_file() {
  local scope="$1"
  if [ "$scope" = "cloud" ]; then
    echo "$CLOUD_ROOT/.env"
  else
    echo "$ONPREM_ROOT/.env"
  fi
}

env_set() {
  local key="$1"
  local raw_value="$2"
  local value tmp
  ensure_env_exists
  # On on-prem scope, these flags are absolute and cannot be changed by operators.
  if [ "$SCOPE" = "onprem" ]; then
    case "$key" in
      ONPREM_MODE|ONPREM_LICENSE_ENFORCEMENT)
        raw_value="true"
        ;;
    esac
  fi
  raw_value="${raw_value//$'\r'/}"
  raw_value="${raw_value//$'\n'/ }"
  value="$(quote_env_value "$raw_value")"
  backup_single_file "$SCOPE_ENV" "env"

  tmp="$(mktemp)"
  if ! awk -v k="$key" '
    $0 ~ ("^" k "=") { next }
    $0 ~ ("^#[[:space:]]*" k "=") { next }
    { print }
  ' "$SCOPE_ENV" > "$tmp"; then
    rm -f "$tmp"
    err "Failed updating env file: $SCOPE_ENV"
    return 1
  fi

  if ! printf '%s=%s\n' "$key" "$value" >> "$tmp"; then
    rm -f "$tmp"
    err "Failed writing env key: $key"
    return 1
  fi

  if ! mv "$tmp" "$SCOPE_ENV"; then
    rm -f "$tmp"
    err "Failed replacing env file: $SCOPE_ENV"
    return 1
  fi

  normalize_scope_env_permissions

  if is_secret_key "$key"; then
    journal_log "secret_update:${key}" "ok" "updated in ${SCOPE_ENV}"
  fi
}

secret_key_regex() {
  cat <<'RX'
(SECRET|TOKEN|API_KEY|PRIVATE_KEY|PASSWORD|PASS|WEBHOOK|DATABASE_URL|SMTP_|MAILERSEND|STRIPE_|YOCO_|OPENAI|GEMINI|ANTHROPIC|AWS_|GCP_|S3_|JWT|OAUTH|CLIENT_SECRET|CERT|ENCRYPTION_KEY|VAPID)
RX
}

is_secret_key() {
  local key="$1"
  case "$key" in
    ONPREM_OWN_API_KEYS|*_API_KEYS)
      return 1
      ;;
  esac
  local rx
  rx="$(secret_key_regex)"
  [[ "$key" =~ $rx ]]
}

mask_secret_value() {
  local value="$1"
  local len=${#value}
  if [ "$len" -le 2 ]; then
    echo "**"
  elif [ "$len" -le 8 ]; then
    echo "${value:0:1}***${value: -1}"
  else
    echo "${value:0:3}***${value: -3}"
  fi
}

collect_secret_keys() {
  ensure_env_exists
  local tmp
  tmp="$(mktemp)"

  if [ -f "$SCOPE_ENV" ]; then
    awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' "$SCOPE_ENV" >> "$tmp" || true
  fi

  awk 'NF{print}' "$tmp" | sort -u | while read -r key; do
    if is_secret_key "$key"; then
      echo "$key"
    fi
  done

  rm -f "$tmp"
}

secrets_table() {
  local keys=("$@")
  local out=""
  local sep1 sep2 sep3
  sep1="$(printf '%*s' 40 '' | tr ' ' '-')"
  sep2="$(printf '%*s' 10 '' | tr ' ' '-')"
  sep3="$(printf '%*s' 26 '' | tr ' ' '-')"

  out+="$(printf "%-40s | %-10s | %-26s" "KEY" "STATUS" "VALUE (MASKED)")"
  out+=$'\n'
  out+="$(printf "%s-+-%s-+-%s" "$sep1" "$sep2" "$sep3")"
  out+=$'\n'

  local key val masked status
  for key in "${keys[@]}"; do
    val="$(env_get "$key")"
    if [ -n "$val" ]; then
      masked="$(mask_secret_value "$val")"
      status="SET"
    else
      masked="-"
      status="MISSING"
    fi
    out+="$(printf "%-40s | %-10s | %-26s" "$key" "$status" "$masked")"
    out+=$'\n'
  done
  printf "%s" "$out"
}

list_secrets_status() {
  ensure_env_exists
  local keys
  mapfile -t keys < <(collect_secret_keys)
  if [ "${#keys[@]}" -eq 0 ]; then
    warn "No secret-like keys discovered."
    return 0
  fi

  local out
  out="${SCOPE_LABEL} Secrets Status"$'\n\n'
  out+="$(secrets_table "${keys[@]}")"

  if [ "$USE_WHIPTAIL" -eq 1 ]; then
    local tmp
    tmp="$(mktemp)"
    printf "%b" "$out" > "$tmp"
    whiptail --title "${SCOPE_LABEL} Secrets Status" --scrolltext --textbox "$tmp" 22 100 || true
    rm -f "$tmp"
  else
    echo ""
    printf "%b" "$out"
  fi
}

choose_secret_key() {
  local title="$1"
  local keys
  mapfile -t keys < <(collect_secret_keys)
  if [ "${#keys[@]}" -eq 0 ]; then
    echo "__CUSTOM__"
    return 0
  fi

  if [ "$USE_WHIPTAIL" -eq 1 ]; then
    local items=()
    local key state
    for key in "${keys[@]}"; do
      if [ -n "$(env_get "$key")" ]; then
        state="SET"
      else
        state="MISSING"
      fi
      items+=("$key" "$state")
    done
    items+=("__CUSTOM__" "Enter custom key name")
    whiptail --title "$title" --menu "Select secret key to edit" 26 100 16 "${items[@]}" 3>&1 1>&2 2>&3 || return 1
  else
    local menu_items=()
    local key state
    for key in "${keys[@]}"; do
      if [ -n "$(env_get "$key")" ]; then
        state="SET"
      else
        state="MISSING"
      fi
      menu_items+=("$key" "$state")
    done
    menu_items+=("__CUSTOM__" "Enter custom key name")
    ui_menu "$title" "Select secret key to edit" "${menu_items[@]}"
  fi
}

is_protected_runtime_key() {
  local key="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  case "$key" in
    DEPLOYMENT_MODE|PLATFORM_ENV|ONPREM_MODE|ONPREM_LICENSE_ENFORCEMENT|SYSTEM_TYPE|COOKIE_NAME|COOKIE_DOMAIN|SESSION_COOKIE_NAME|SESSION_COOKIE_DOMAIN|APP_VARIANT|RUNTIME_VARIANT)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

set_or_update_secret() {
  ensure_env_exists
  local key value
  if ! key="$(choose_secret_key "${SCOPE_LABEL} Secret Editor")"; then
    return 0
  fi

  if [ "$key" = "__CUSTOM__" ]; then
    if ! key="$(ui_inputbox "${SCOPE_LABEL} Secret Editor" "Secret key name (e.g. GEMINI_API_KEY):" "")"; then
      return 0
    fi
  fi

  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    err "Invalid key name"
    return 1
  fi
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ] && is_protected_runtime_key "$key"; then
    err "Protected runtime key cannot be changed from installed runtime: $key"
    return 1
  fi

  if ! value="$(ui_passwordbox "${SCOPE_LABEL} Secret Editor" "Enter value for ${key}:")"; then
    return 0
  fi
  value="$(normalize_secret_input_value "$value")"
  if [ -z "$value" ]; then
    err "Empty value not allowed"
    return 1
  fi
  if ! env_set "$key" "$value"; then
    err "Secret update failed: $key"
    return 1
  fi
  ok "Secret updated: $key"
  log "Secret updated in ${SCOPE}: $key"
}

add_new_secret() {
  ensure_env_exists
  local key value
  key="$(ui_inputbox "${SCOPE_LABEL} Add Secret" "New secret key name (e.g. MY_API_KEY):" "")" || return 0
  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    err "Invalid key name"
    return 1
  fi
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ] && is_protected_runtime_key "$key"; then
    err "Protected runtime key cannot be changed from installed runtime: $key"
    return 1
  fi
  value="$(ui_passwordbox "${SCOPE_LABEL} Add Secret" "Value for ${key}:")" || return 0
  value="$(normalize_secret_input_value "$value")"
  if [ -z "$value" ]; then
    err "Empty value not allowed"
    return 1
  fi
  if ! env_set "$key" "$value"; then
    err "Secret add/update failed: $key"
    return 1
  fi
  show_action_result "${SCOPE_LABEL} Secret Added" "Secret '${key}' was added/updated successfully."
}

generate_and_set_secret() {
  ensure_env_exists
  local opt
  opt="$(ui_menu "${SCOPE_LABEL} Generate Secret" "Choose secret target" \
    "1" "SESSION_SECRET (64 hex chars)" \
    "2" "JWT_SECRET (64 hex chars)" \
    "3" "ENCRYPTION_KEY (64 hex chars)" \
    "4" "Custom key" \
    "b" "Back" \
    "0" "Back")" || return 0

  local key
  case "$opt" in
    1) key="SESSION_SECRET" ;;
    2) key="JWT_SECRET" ;;
    3) key="ENCRYPTION_KEY" ;;
    4)
      key="$(ui_inputbox "${SCOPE_LABEL} Generate Secret" "Custom key name:" "")" || return 0
      ;;
    b|0) return 0 ;;
    *)
      err "Invalid option"
      return 1
      ;;
  esac

  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    err "Invalid key name"
    return 1
  fi
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ] && is_protected_runtime_key "$key"; then
    err "Protected runtime key cannot be changed from installed runtime: $key"
    return 1
  fi

  local value
  value="$(openssl rand -hex 32)"
  if ! env_set "$key" "$value"; then
    err "Failed setting generated secret: $key"
    return 1
  fi
  ok "Generated and set $key"
  log "Generated secret in ${SCOPE}: $key"
}

clear_secret_value() {
  ensure_env_exists
  local key
  key="$(ui_inputbox "${SCOPE_LABEL} Clear Secret" "Secret key to clear (value becomes empty):" "")" || return 0
  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    err "Invalid key name"
    return 1
  fi
  if ! env_set "$key" ""; then
    err "Failed clearing secret value for $key"
    return 1
  fi
  ok "Cleared value for $key"
  log "Cleared secret value in ${SCOPE}: $key"
}

remove_secret_key() {
  ensure_env_exists
  local key
  key="$(ui_inputbox "${SCOPE_LABEL} Remove Secret" "Secret key to remove entirely from ${SCOPE_ENV}:" "")" || return 0
  if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    err "Invalid key name"
    return 1
  fi
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ] && is_protected_runtime_key "$key"; then
    err "Protected runtime key cannot be removed from installed runtime: $key"
    return 1
  fi
  backup_single_file "$SCOPE_ENV" "env"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" '
    $0 ~ ("^" k "=") { next }
    $0 ~ ("^#[[:space:]]*" k "=") { next }
    { print }
  ' "$SCOPE_ENV" > "$tmp" || true
  cat "$tmp" > "$SCOPE_ENV"
  rm -f "$tmp"
  normalize_scope_env_permissions
  ok "Removed key: $key"
  log "Removed secret key in ${SCOPE}: $key"
}

validate_required_secrets() {
  ensure_env_exists
  local required_common=(
    SESSION_SECRET DATABASE_URL
  )
  local required_cloud=(CLOUD_LICENSE_PRIVATE_KEY)
  local required_onprem=()
  local missing=0
  local key

  echo ""
  printf "%b\n" "${BOLD}Required secret checks (${SCOPE_LABEL})${NC}"
  for key in "${required_common[@]}"; do
    if [ -n "$(env_get "$key")" ]; then
      echo "  [OK] $key"
    else
      echo "  [MISSING] $key"
      missing=$((missing + 1))
    fi
  done

  if [ "$SCOPE" = "cloud" ]; then
    for key in "${required_cloud[@]}"; do
      if [ -n "$(env_get "$key")" ]; then
        echo "  [OK] $key"
      else
        echo "  [MISSING] $key"
        missing=$((missing + 1))
      fi
    done

    echo "  [INFO] Integration provider secrets/config are validated in /admin/integration-settings."
  fi

  if [ "$SCOPE" = "onprem" ]; then
    for key in "${required_onprem[@]}"; do
      if [ -n "$(env_get "$key")" ]; then
        echo "  [OK] $key"
      else
        echo "  [MISSING] $key"
        missing=$((missing + 1))
      fi
    done
  fi

  if [ -z "$(env_get ENCRYPTION_KEY)" ]; then
    echo "  [MISSING] ENCRYPTION_KEY"
    missing=$((missing + 1))
    if ui_yesno "${SCOPE_LABEL} Missing ENCRYPTION_KEY" "ENCRYPTION_KEY is missing.\n\nGenerate a secure ENCRYPTION_KEY now?"; then
      env_set ENCRYPTION_KEY "$(openssl rand -hex 32)"
      echo "  [OK] ENCRYPTION_KEY generated."
      missing=$((missing - 1))
    fi
  fi

  if [ "$missing" -eq 0 ]; then
    ok "All required secrets are present."
  else
    warn "$missing required secret(s) missing."
  fi
}

is_placeholder_secret_value() {
  local v="${1,,}"
  [[ "$v" =~ (changeme|change_me|placeholder|your_|example|dummy|test_key|replace_me|password@123|your_session_secret) ]]
}

secrets_audit_report() {
  ensure_env_exists
  local keys
  mapfile -t keys < <(collect_secret_keys)
  if [ "${#keys[@]}" -eq 0 ]; then
    warn "No secret keys discovered."
    return 1
  fi

  local out=""
  out+="${SCOPE_LABEL} Secrets Audit"$'\n'
  out+="Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"$'\n\n'
  out+="$(printf "%-36s | %-8s | %-11s | %-20s | %s" "KEY" "SET" "PLACEHOLDER" "LAST UPDATED" "MASKED")"$'\n'
  out+="$(printf "%-36s-+-%-8s-+-%-11s-+-%-20s-+-%s" "------------------------------------" "--------" "-----------" "--------------------" "----------------------")"$'\n'

  local key val set_flag ph_flag masked last
  for key in "${keys[@]}"; do
    val="$(env_get "$key")"
    if [ -n "$val" ]; then
      set_flag="yes"
      masked="$(mask_secret_value "$val")"
      if is_placeholder_secret_value "$val"; then ph_flag="yes"; else ph_flag="no"; fi
    else
      set_flag="no"
      ph_flag="n/a"
      masked="-"
    fi
    last="$(awk -F'|' -v k="secret_update:${key}" '$3==k {ts=$1} END {print ts}' "$GLOBAL_JOURNAL_FILE" 2>/dev/null || true)"
    last="${last:-unknown}"
    out+="$(printf "%-36s | %-8s | %-11s | %-20s | %s" "$key" "$set_flag" "$ph_flag" "$last" "$masked")"$'\n'
  done

  ui_textbox "${SCOPE_LABEL} Secrets Audit" "$out" 30 120
}

export_secrets_audit_report() {
  ensure_env_exists
  local report_dir report_file
  report_dir="${BACKUP_ROOT}/${SCOPE}/reports"
  mkdir -p "$report_dir"
  report_file="${report_dir}/secrets-audit-$(date '+%Y%m%d_%H%M%S').txt"
  {
    echo "${SCOPE_LABEL} Secrets Audit"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo ""
    mapfile -t keys < <(collect_secret_keys)
    for key in "${keys[@]}"; do
      val="$(env_get "$key")"
      if [ -n "$val" ]; then
        masked="$(mask_secret_value "$val")"
      else
        masked="-"
      fi
      printf "%-36s %s\n" "$key" "$masked"
    done
  } > "$report_file"
  ok "Secrets audit exported: $report_file"
}

sync_secrets_from_infisical() {
  ensure_env_exists
  if ! command -v infisical >/dev/null 2>&1; then
    err "Infisical CLI is not installed."
    return 1
  fi

  local env_name project_id
  env_name="$(env_get INFISICAL_ENV)"
  project_id="$(env_get INFISICAL_PROJECT_ID)"

  read -rp "Infisical environment [${env_name:-dev}]: " v
  env_name="${v:-${env_name:-dev}}"
  read -rp "Infisical project ID [${project_id:-unset}]: " v
  project_id="${v:-$project_id}"
  if [ -z "$project_id" ]; then
    err "INFISICAL_PROJECT_ID is required."
    return 1
  fi

  local tmp
  tmp="$(mktemp)"
  if ! infisical secrets --projectId "$project_id" --env "$env_name" --format dotenv > "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    err "Failed pulling secrets from Infisical. Verify CLI auth/permissions."
    return 1
  fi

  backup_single_file "$SCOPE_ENV" "env"
  while IFS= read -r line; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    local key val
    key="${line%%=*}"
    val="${line#*=}"
    env_set "$key" "$val"
  done < "$tmp"
  rm -f "$tmp"
  env_set INFISICAL_PROJECT_ID "$project_id"
  env_set INFISICAL_ENV "$env_name"
  ok "Infisical secrets synced into $SCOPE_ENV"
  log "Infisical sync for ${SCOPE} env=${env_name}"
}

secrets_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Secrets Management" "Manage all ${SCOPE_LABEL} secrets in ${SCOPE_ENV}" \
      "1" "List discovered secrets (masked)" \
      "2" "Edit secret (select from list)" \
      "3" "Generate and set secure secret" \
      "4" "Clear a secret value" \
      "5" "Remove secret key (delete line)" \
      "6" "Validate required secrets" \
      "7" "Sync secrets from Infisical" \
      "8" "Add new custom secret" \
      "b" "Back" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "List discovered secrets" list_secrets_status ;;
      2) run_safe "Set/update secret" set_or_update_secret ;;
      3) run_safe "Generate secure secret" generate_and_set_secret ;;
      4) run_safe "Clear secret value" clear_secret_value ;;
      5) run_safe "Remove secret key" remove_secret_key ;;
      6) run_safe "Validate required secrets" validate_required_secrets ;;
      7) run_safe "Sync secrets from Infisical" sync_secrets_from_infisical ;;
      8) run_safe "Add new custom secret" add_new_secret ;;
      x|b|0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

ensure_session_secret() {
  local cur
  cur="$(env_get SESSION_SECRET)"
  if [ -z "$cur" ] || [ "$cur" = "your_session_secret_here_min_32_chars" ]; then
    env_set SESSION_SECRET "$(openssl rand -hex 32)"
  fi
}

configure_scope_defaults() {
  info "Applying $SCOPE_LABEL defaults"
  ensure_env_exists
  local run_user="${SUDO_USER:-lppadmin}"
  local base_host

  env_set NODE_ENV development
  env_set PORT "$SCOPE_APP_PORT"
  env_set NGINX_HTTP_PORT 80
  env_set NGINX_HTTPS_PORT 443
  env_set BASE_URL "https://${SCOPE_DEFAULT_DOMAIN}"
  env_set FRONTEND_URL "https://${SCOPE_DEFAULT_DOMAIN}"
  env_set VITE_DOMAIN "https://${SCOPE_DEFAULT_DOMAIN}"
  env_set COOKIE_SECURE true
  env_set UPLOAD_DIR ./uploads

  if [ "$SCOPE" = "cloud" ]; then
    base_host="$(parse_base_host "$(env_get BASE_URL)")"
    base_host="${base_host:-$SCOPE_DEFAULT_DOMAIN}"
    env_set PLATFORM_ENV cloud
    env_set DEPLOYMENT_MODE cloud
    env_set ONPREM_MODE false
    env_set ONPREM_OWN_API_KEYS false
    env_set PAYMENT_GATEWAY_ENABLED true
    env_set SESSION_COOKIE_NAME lp_cloud.sid
    env_set SESSION_COOKIE_DOMAIN "$base_host"
    env_set STORAGE_BACKEND local
    if [ -z "$(env_get DATABASE_URL)" ]; then
      warn "DATABASE_URL is missing for cloud scope; set it via Environment (.env) or Secrets manager."
    fi
  else
    base_host="$(parse_base_host "$(env_get BASE_URL)")"
    base_host="${base_host:-$SCOPE_DEFAULT_DOMAIN}"
    env_set PLATFORM_ENV onprem
    env_set DEPLOYMENT_MODE onprem
    env_set ONPREM_MODE true
    env_set ONPREM_OWN_API_KEYS true
    env_set PAYMENT_GATEWAY_ENABLED false
    env_set SESSION_COOKIE_NAME lp_onprem.sid
    env_set SESSION_COOKIE_DOMAIN "$base_host"
    env_set STORAGE_BACKEND local
    env_set DB_PORT 5432
    if [ -z "$(env_get DATABASE_URL)" ]; then
      warn "DATABASE_URL is missing for onprem scope; set it via Environment (.env) or Secrets manager."
    fi
  fi

  ensure_session_secret
  mkdir -p "$SCOPE_ROOT/uploads/public" "$SCOPE_ROOT/uploads/private"
  chown -R "${run_user}:${run_user}" "$SCOPE_ROOT/uploads" 2>/dev/null || true
  chmod -R u+rwX,g+rwX "$SCOPE_ROOT/uploads" 2>/dev/null || true
  ok "Defaults applied to $SCOPE_ENV"
  log "Defaults applied for $SCOPE"
}

variant_isolation_health_check() {
  ensure_env_exists
  local fails=0 warns=0 out expected_mode expected_onprem expected_port expected_cookie expected_cookie_domain
  local base host dep_mode onprem_flag db_url cookie_name cookie_domain other_scope other_env other_db nginx_file proxy_target

  out="${SCOPE_LABEL} Variant Isolation Health"$'\n\n'
  add_vcheck() {
    local st="$1" check="$2" detail="$3"
    [ "$st" = "FAIL" ] && fails=$((fails+1))
    [ "$st" = "WARN" ] && warns=$((warns+1))
    out+="$(printf "%-6s | %-36s | %s" "$st" "$check" "$detail")"$'\n'
  }
  out+="$(printf "%-6s | %-36s | %s" "STATE" "CHECK" "DETAIL")"$'\n'
  out+="$(printf "%-6s-+-%-36s-+-%s" "------" "------------------------------------" "------------------------------")"$'\n'

  base="$(env_get BASE_URL)"
  host="$(parse_base_host "${base:-}")"
  if [ "$SCOPE" = "cloud" ]; then
    expected_mode="cloud"; expected_onprem="false"; expected_port="8000"; expected_cookie="lp_cloud.sid"; expected_cookie_domain="${host:-$SCOPE_DEFAULT_DOMAIN}"; other_scope="onprem"
  else
    expected_mode="onprem"; expected_onprem="true"; expected_port="9000"; expected_cookie="lp_onprem.sid"; expected_cookie_domain="${host:-$SCOPE_DEFAULT_DOMAIN}"; other_scope="cloud"
  fi
  dep_mode="$(env_get DEPLOYMENT_MODE)"
  onprem_flag="$(env_get ONPREM_MODE)"
  db_url="$(env_get DATABASE_URL)"
  cookie_name="$(env_get SESSION_COOKIE_NAME)"
  cookie_domain="$(env_get SESSION_COOKIE_DOMAIN)"

  [ "$dep_mode" = "$expected_mode" ] && add_vcheck "OK" "DEPLOYMENT_MODE" "$dep_mode" || add_vcheck "FAIL" "DEPLOYMENT_MODE" "expected ${expected_mode}, got ${dep_mode:-unset}"
  [ "$onprem_flag" = "$expected_onprem" ] && add_vcheck "OK" "ONPREM_MODE flag" "$onprem_flag" || add_vcheck "FAIL" "ONPREM_MODE flag" "expected ${expected_onprem}, got ${onprem_flag:-unset}"
  [ -n "$base" ] && add_vcheck "OK" "BASE_URL present" "$base" || add_vcheck "FAIL" "BASE_URL present" "missing"
  [ -n "$host" ] && [ "$host" = "$expected_cookie_domain" ] && add_vcheck "OK" "BASE_URL host" "$host" || add_vcheck "WARN" "BASE_URL host" "expected ${expected_cookie_domain}, got ${host:-unset}"
  [ "$(env_get PORT)" = "$expected_port" ] && add_vcheck "OK" "App port" "$expected_port" || add_vcheck "FAIL" "App port" "expected ${expected_port}, got $(env_get PORT)"
  [ "$cookie_name" = "$expected_cookie" ] && add_vcheck "OK" "SESSION_COOKIE_NAME" "$cookie_name" || add_vcheck "FAIL" "SESSION_COOKIE_NAME" "expected ${expected_cookie}, got ${cookie_name:-unset}"
  [ "$cookie_domain" = "$expected_cookie_domain" ] && add_vcheck "OK" "SESSION_COOKIE_DOMAIN" "$cookie_domain" || add_vcheck "WARN" "SESSION_COOKIE_DOMAIN" "expected ${expected_cookie_domain}, got ${cookie_domain:-unset}"

  other_env="$(scope_env_file "$other_scope")"
  other_db="$(env_get_from_file "$other_env" DATABASE_URL)"
  if [ -n "$db_url" ] && [ -n "$other_db" ] && [ "$db_url" = "$other_db" ]; then
    add_vcheck "FAIL" "DB isolation" "DATABASE_URL matches ${other_scope}"
  elif [ -n "$db_url" ]; then
    add_vcheck "OK" "DB isolation" "DATABASE_URL differs from ${other_scope}"
  else
    add_vcheck "FAIL" "DB isolation" "DATABASE_URL missing"
  fi

  nginx_file="/etc/nginx/sites-enabled/learnplay-${SCOPE}.conf"
  if [ -f "$nginx_file" ]; then
    proxy_target="$(grep -Eo 'proxy_pass +http://127\.0\.0\.1:[0-9]+' "$nginx_file" | awk -F: 'NR==1{print $NF}')"
    if [ "$proxy_target" = "$expected_port" ]; then
      add_vcheck "OK" "Nginx proxy target" "127.0.0.1:${proxy_target}"
    else
      add_vcheck "FAIL" "Nginx proxy target" "expected ${expected_port}, got ${proxy_target:-none}"
    fi
  else
    add_vcheck "WARN" "Nginx scope config" "${nginx_file} missing"
  fi

  if [ -f "/etc/nginx/sites-enabled/00-default-deny.conf" ]; then
    add_vcheck "OK" "Nginx default deny" "enabled"
  else
    add_vcheck "WARN" "Nginx default deny" "00-default-deny.conf not enabled"
  fi

  out+=$'\n'"OVERALL: "
  if [ "$fails" -gt 0 ]; then out+="FAILED (${fails} fail, ${warns} warn)"; else out+="PASSED (${warns} warn)"; fi
  ui_textbox "${SCOPE_LABEL} Variant Isolation" "$out" 28 120
  [ "$fails" -eq 0 ]
}

variant_isolation_quick_check() {
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
    return 0
  fi
  local expected_mode expected_onprem expected_port expected_cookie expected_cookie_domain
  local dep_mode onprem_flag app_port cookie_name cookie_domain db_url other_db other_scope other_env
  if [ "$SCOPE" = "cloud" ]; then
    expected_mode="cloud"; expected_onprem="false"; expected_port="8000"; expected_cookie="lp_cloud.sid"; other_scope="onprem"
  else
    expected_mode="onprem"; expected_onprem="true"; expected_port="9000"; expected_cookie="lp_onprem.sid"; other_scope="cloud"
  fi
  dep_mode="$(env_get DEPLOYMENT_MODE)"
  onprem_flag="$(env_get ONPREM_MODE)"
  app_port="$(env_get PORT)"
  cookie_name="$(env_get SESSION_COOKIE_NAME)"
  cookie_domain="$(env_get SESSION_COOKIE_DOMAIN)"
  expected_cookie_domain="$(parse_base_host "$(env_get BASE_URL)")"
  expected_cookie_domain="${expected_cookie_domain:-$SCOPE_DEFAULT_DOMAIN}"
  db_url="$(env_get DATABASE_URL)"
  other_env="$(scope_env_file "$other_scope")"
  other_db="$(env_get_from_file "$other_env" DATABASE_URL)"

  [ "$dep_mode" = "$expected_mode" ] || return 1
  [ "$onprem_flag" = "$expected_onprem" ] || return 1
  [ "$app_port" = "$expected_port" ] || return 1
  [ "$cookie_name" = "$expected_cookie" ] || return 1
  [ "$cookie_domain" = "$expected_cookie_domain" ] || return 1
  [ -n "$db_url" ] || return 1
  [ -n "$other_db" ] || return 1
  [ "$db_url" != "$other_db" ] || return 1
  return 0
}

repair_variant_isolation() {
  ensure_env_exists
  local expected_mode expected_onprem expected_port expected_cookie expected_cookie_domain expected_base
  expected_base="$(env_get BASE_URL)"
  if [ -z "$expected_base" ]; then
    expected_base="https://${SCOPE_DEFAULT_DOMAIN}"
  fi
  expected_cookie_domain="$(parse_base_host "$expected_base")"
  expected_cookie_domain="${expected_cookie_domain:-$SCOPE_DEFAULT_DOMAIN}"
  if [ "$SCOPE" = "cloud" ]; then
    expected_mode="cloud"; expected_onprem="false"; expected_port="8000"; expected_cookie="lp_cloud.sid"
  else
    expected_mode="onprem"; expected_onprem="true"; expected_port="9000"; expected_cookie="lp_onprem.sid"
  fi

  run_cmd_step_optional "Set DEPLOYMENT_MODE ${expected_mode}" env_set DEPLOYMENT_MODE "$expected_mode"
  run_cmd_step_optional "Set ONPREM_MODE ${expected_onprem}" env_set ONPREM_MODE "$expected_onprem"
  run_cmd_step_optional "Set PORT ${expected_port}" env_set PORT "$expected_port"
  run_cmd_step_optional "Set BASE_URL ${expected_base}" env_set BASE_URL "$expected_base"
  run_cmd_step_optional "Set FRONTEND_URL ${expected_base}" env_set FRONTEND_URL "$expected_base"
  run_cmd_step_optional "Set VITE_DOMAIN ${expected_base}" env_set VITE_DOMAIN "$expected_base"
  run_cmd_step_optional "Set SESSION_COOKIE_NAME ${expected_cookie}" env_set SESSION_COOKIE_NAME "$expected_cookie"
  run_cmd_step_optional "Set SESSION_COOKIE_DOMAIN ${expected_cookie_domain}" env_set SESSION_COOKIE_DOMAIN "$expected_cookie_domain"
  run_cmd_step_optional "Validate nginx config" nginx -t
  run_cmd_step_optional "Reload nginx" systemctl reload nginx
  run_cmd_step_optional "Restart ${SCOPE_SERVICE}" systemctl restart "$SCOPE_SERVICE"

  action_report_set_summary "Variant isolation repair applied. Re-run Variant isolation health check to verify."
  ok "Variant isolation repair completed."
}

prompt_edit_env() {
  ensure_env_exists

  local base_url
  base_url="$(env_get BASE_URL)"
  local default_base="https://${SCOPE_DEFAULT_DOMAIN}"
  v="$(ui_inputbox "${SCOPE_LABEL} Environment" "BASE_URL" "${base_url:-$default_base}")" || return 0
  if [ -n "$v" ]; then
    env_set BASE_URL "$v"
    env_set FRONTEND_URL "$v"
    env_set VITE_DOMAIN "$v"
  elif [ -z "$base_url" ]; then
    env_set BASE_URL "$default_base"
    env_set FRONTEND_URL "$default_base"
    env_set VITE_DOMAIN "$default_base"
  fi

  local port
  port="$(env_get PORT)"
  v="$(ui_inputbox "${SCOPE_LABEL} Environment" "App PORT" "${port:-$SCOPE_APP_PORT}")" || return 0
  if [ -n "$v" ]; then
    env_set PORT "$v"
  elif [ -z "$port" ]; then
    env_set PORT "$SCOPE_APP_PORT"
  fi

  if [ "$SCOPE" = "onprem" ]; then
    env_set ONPREM_MODE true
    env_set ONPREM_OWN_API_KEYS true
    env_set PAYMENT_GATEWAY_ENABLED false
    env_set STORAGE_BACKEND local
    env_set PLATFORM_ENV onprem
  else
    env_set ONPREM_MODE false
    env_set ONPREM_OWN_API_KEYS false
    env_set PAYMENT_GATEWAY_ENABLED true
    env_set STORAGE_BACKEND local
    env_set PLATFORM_ENV cloud
  fi

  ensure_session_secret
  ok "Environment updated"
}

install_packages_if_missing() {
  local pkgs=(nginx openssl curl)
  if command -v apt-get >/dev/null 2>&1; then
    run_cmd_step_sh "Refresh apt package index" "DEBIAN_FRONTEND=noninteractive apt-get update -y" || return 1
    run_cmd_step_sh "Install required packages (nginx openssl curl)" \
      "DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkgs[*]}" || return 1
  elif command -v dnf >/dev/null 2>&1; then
    run_cmd_step "Install required packages via dnf (nginx openssl curl)" dnf install -y "${pkgs[@]}" || return 1
  elif command -v zypper >/dev/null 2>&1; then
    run_cmd_step "Install required packages via zypper (nginx openssl curl)" zypper --non-interactive install "${pkgs[@]}" || return 1
  else
    warn "No supported package manager detected; install nginx/openssl/curl manually"
    return 1
  fi
  ok "Verified required packages."
}

create_or_update_systemd_unit() {
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
    err "Create/update systemd service is disabled on installed systems."
    err "Use the managed runtime service '${SCOPE_SERVICE}' instead."
    return 1
  fi
  local run_user="${SUDO_USER:-lppadmin}"
  if ! id -u "$run_user" >/dev/null 2>&1; then
    run_user="lppadmin"
  fi
  if ! id -u "$run_user" >/dev/null 2>&1; then
    run_user="root"
  fi

  local unit_file="/etc/systemd/system/${SCOPE_SERVICE}.service"
  local app_log_file="${GLOBAL_LOG_DIR}/${SCOPE}-app.log"
  mkdir -p "$GLOBAL_LOG_DIR"
  touch "$app_log_file"
  chmod 640 "$app_log_file" || true
  chown "$run_user":"$run_user" "$app_log_file" || true
  backup_single_file "$unit_file" "systemd"

  cat > "$unit_file" <<UNIT
[Unit]
Description=LearnPlay ${SCOPE_LABEL} Development Service
After=network.target

[Service]
Type=simple
User=${run_user}
WorkingDirectory=${SCOPE_ROOT}
Environment=HOME=/home/${run_user}
Environment=NODE_ENV=development
EnvironmentFile=-${SCOPE_ENV}
ExecStart=/bin/bash -lc 'set -a; [ -f "${SCOPE_ENV}" ] && source "${SCOPE_ENV}"; set +a; source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && npm run dev'
StandardOutput=append:${app_log_file}
StandardError=append:${app_log_file}
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

  run_cmd_step "Reload systemd daemon" systemctl daemon-reload || return 1
  run_cmd_step_optional "Enable systemd unit" systemctl enable "$SCOPE_SERVICE"
  action_report_set_summary "Systemd unit ${SCOPE_SERVICE} updated and daemon reloaded."
  ok "Systemd unit ready: $SCOPE_SERVICE"
}

write_nginx_conf() {
  local domain="$1"
  local cert_path="$2"
  local key_path="$3"
  local app_port
  app_port="$(env_get PORT)"
  app_port="${app_port:-$SCOPE_APP_PORT}"

  local conf="/etc/nginx/sites-available/learnplay-${SCOPE}.conf"
  backup_single_file "$conf" "nginx"

  local extra_names=""
  if [ "$domain" = "learnplay.co.za" ]; then
    extra_names=" www.learnplay.co.za"
  fi
  local http_location_block
  if is_behind_caddy_mode; then
    http_location_block=$(cat <<'EOF'
    location / {
        # Behind Caddy: keep local HTTP backend available (no HTTP->HTTPS redirect here).
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
    http_location_block="${http_location_block//__APP_PORT__/${app_port}}"
    cat > "$conf" <<NG
server {
    listen 80;
    server_name ${domain}${extra_names};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

${http_location_block}
}
NG
    ln -sf "$conf" "/etc/nginx/sites-enabled/learnplay-${SCOPE}.conf"
    rm -f /etc/nginx/sites-enabled/default
    mkdir -p /var/www/certbot
    run_cmd_step "Validate nginx config" nginx -t || return 1
    run_cmd_step_optional "Enable nginx service" systemctl enable nginx
    run_cmd_step "Restart nginx service" systemctl restart nginx || return 1
    ok "Nginx configured for $SCOPE_LABEL (${domain}) in Caddy reverse-proxy mode"
    return 0
  else
    http_location_block=$(cat <<'EOF'
    location / {
        return 301 https://$host$request_uri;
    }
EOF
)
  fi

  cat > "$conf" <<NG
server {
    listen 80;
    server_name ${domain}${extra_names};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

${http_location_block}
}

server {
    listen 443 ssl http2;
    server_name ${domain}${extra_names};

    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:${app_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NG

  ln -sf "$conf" "/etc/nginx/sites-enabled/learnplay-${SCOPE}.conf"
  rm -f /etc/nginx/sites-enabled/default
  mkdir -p /var/www/certbot

  run_cmd_step "Validate nginx config" nginx -t || return 1
  run_cmd_step_optional "Enable nginx service" systemctl enable nginx
  run_cmd_step "Restart nginx service" systemctl restart nginx || return 1
  ok "Nginx configured for $SCOPE_LABEL (${domain})"
}

setup_self_signed_tls() {
  if ! preflight_gate_for_risky_action "tls-self-signed"; then
    return 1
  fi
  install_packages_if_missing
  ensure_env_exists
  local base_url domain
  base_url="$(env_get BASE_URL)"
  base_url="${base_url:-https://${SCOPE_DEFAULT_DOMAIN}}"
  domain="$(parse_base_host "$base_url")"

  local cert_dir="/etc/ssl/learnplay"
  local cert_path="${cert_dir}/${SCOPE}.crt"
  local key_path="${cert_dir}/${SCOPE}.key"

  mkdir -p "$cert_dir"
  if [ ! -f "$cert_path" ] || [ ! -f "$key_path" ]; then
    run_cmd_step "Generate self-signed certificate for ${domain}" \
      openssl req -x509 -nodes -newkey rsa:4096 -days 365 \
      -keyout "$key_path" -out "$cert_path" \
      -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=LearnPlay/CN=${domain}" || return 1
    ok "Self-signed certificate generated for ${domain}"
  else
    info "Self-signed certificate already exists for $SCOPE"
  fi

  write_nginx_conf "$domain" "$cert_path" "$key_path"
  save_global_conf_value DEFAULT_TLS_MODE self-signed
  ensure_tls_automation_installed || true
}

setup_caddy_http_proxy_mode() {
  if ! preflight_gate_for_risky_action "tls-caddy-http"; then
    return 1
  fi
  install_packages_if_missing
  ensure_env_exists

  local base_url domain cert_dir cert_path key_path
  base_url="$(env_get BASE_URL)"
  base_url="${base_url:-https://${SCOPE_DEFAULT_DOMAIN}}"
  domain="$(parse_base_host "$base_url")"
  cert_dir="/etc/ssl/learnplay"
  cert_path="${cert_dir}/${SCOPE}.crt"
  key_path="${cert_dir}/${SCOPE}.key"

  env_set LEARNPLAY_SETUP_SSL caddy-http
  env_set LEARNPLAY_BEHIND_CADDY true
  env_set COOKIE_SECURE true
  env_set TRUST_PROXY true
  env_set SESSION_COOKIE_SAMESITE lax

  write_nginx_conf "$domain" "$cert_path" "$key_path"
  save_global_conf_value DEFAULT_TLS_MODE caddy-http
  ensure_tls_automation_installed || true
  ok "Configured ${SCOPE_LABEL} for HTTPS via Caddy reverse proxy (HTTP backend mode)."
}

setup_letsencrypt_tls() {
  if ! preflight_gate_for_risky_action "tls-letsencrypt"; then
    return 1
  fi
  install_packages_if_missing
  ensure_env_exists

  local base_url domain
  base_url="$(env_get BASE_URL)"
  if [ -z "$base_url" ]; then
    err "BASE_URL is missing. Configure environment first."
    return 1
  fi
  domain="$(parse_base_host "$base_url")"

  if ! getent hosts "$domain" >/dev/null 2>&1; then
    err "DNS preflight failed for $domain. Add DNS A/AAAA record first."
    return 1
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      run_cmd_step_sh "Refresh apt package index" "DEBIAN_FRONTEND=noninteractive apt-get update -y" || return 1
      run_cmd_step_sh "Install certbot packages" \
        "DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx" || return 1
    elif command -v dnf >/dev/null 2>&1; then
      run_cmd_step "Install certbot packages via dnf" dnf install -y certbot python3-certbot-nginx || return 1
    elif command -v zypper >/dev/null 2>&1; then
      run_cmd_step "Install certbot packages via zypper" zypper --non-interactive install certbot python3-certbot-nginx || return 1
    else
      err "Unsupported package manager for certbot install"
      return 1
    fi
  fi

  local domains=(-d "$domain")
  if [ "$domain" = "learnplay.co.za" ]; then
    domains+=(-d "www.learnplay.co.za")
  fi

  run_cmd_step "Request Let's Encrypt certificate via certbot" \
    certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email "${domains[@]}" || return 1

  local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
  local key_path="/etc/letsencrypt/live/${domain}/privkey.pem"
  if [ ! -f "$cert_path" ] || [ ! -f "$key_path" ]; then
    err "Let's Encrypt certificate files not found after certbot run"
    return 1
  fi

  write_nginx_conf "$domain" "$cert_path" "$key_path"
  save_global_conf_value DEFAULT_TLS_MODE letsencrypt
  ensure_tls_automation_installed || true
  ok "Let's Encrypt configured for ${domain}"
}

tls_certificate_manager() {
  ensure_env_exists
  local cert key domain base out days
  base="$(env_get BASE_URL)"
  domain="$(parse_base_host "${base:-}")"
  cert="$(cert_file_for_scope)"
  key=""
  if [ -n "$domain" ] && [ -f "/etc/letsencrypt/live/${domain}/privkey.pem" ]; then
    key="/etc/letsencrypt/live/${domain}/privkey.pem"
  elif [ -f "/etc/ssl/learnplay/${SCOPE}.key" ]; then
    key="/etc/ssl/learnplay/${SCOPE}.key"
  fi
  out="${SCOPE_LABEL} TLS Certificate Manager"$'\n'
  out+="Domain: ${domain:-unset}"$'\n'
  out+="Cert: ${cert:-not found}"$'\n'
  out+="Key: ${key:-not found}"$'\n'
  if [ -n "$cert" ] && [ -f "$cert" ]; then
    days="$(cert_expiry_days "$cert")"
    out+="Expires in: ${days} day(s)"$'\n'
    out+=$'\n'"Certificate details"$'\n'
    out+="$(openssl x509 -in "$cert" -noout -subject -issuer -startdate -enddate 2>/dev/null)"$'\n'
    if openssl verify "$cert" >/dev/null 2>&1; then
      out+=$'\n'"Chain validation: OK"$'\n'
    else
      out+=$'\n'"Chain validation: WARN/FAILED (common for self-signed)"$'\n'
    fi
  else
    out+=$'\n'"Certificate details unavailable."$'\n'
  fi
  ui_textbox "${SCOPE_LABEL} TLS Manager" "$out" 28 120
}

tls_renewal_dry_run() {
  info "Certificate renewal automation is disabled. TLS is managed by Caddy or customer infrastructure."
  return 0
}

cert_automation_script() {
  if [ -n "${SCOPE_SCRIPTS:-}" ] && [ -f "${SCOPE_SCRIPTS}/cert-automation.sh" ]; then
    echo "${SCOPE_SCRIPTS}/cert-automation.sh"
    return 0
  fi
  if [ -f "${SELF_SCRIPT_DIR}/cert-automation.sh" ]; then
    echo "${SELF_SCRIPT_DIR}/cert-automation.sh"
    return 0
  fi
  echo ""
}

ensure_tls_automation_installed() {
  return 0
}

tls_auto_renew_status() {
  ui_msgbox "TLS auto-renew automation is disabled. Certificate management is external to LearnPlay."
  return 0
}

tls_auto_renew_now() {
  info "TLS auto-renew automation is disabled."
  return 0
}

tls_auto_renew_logs() {
  local scope_key="${SCOPE:-learnplay}"
  local log_file="/var/log/learnplay/cert-renew-${scope_key}.log"
  local out
  out="${SCOPE_LABEL} TLS Auto-Renew Logs"$'\n\n'
  out+="Log file: ${log_file}"$'\n\n'
  if [ -f "$log_file" ]; then
    out+="$(tail -n 200 "$log_file" 2>/dev/null)"
  else
    out+="No certificate auto-renew log file found yet."
  fi
  ui_textbox "${SCOPE_LABEL} TLS Auto-Renew Logs" "$out" 28 120
}

tls_auto_renew_set_threshold() {
  load_global_conf
  local v
  v="$(ui_inputbox "${SCOPE_LABEL} TLS Auto-Renew" "Threshold is unused while automation is disabled. Enter to continue." "${CERT_RENEW_THRESHOLD_DAYS:-10}")" || return 0
  info "TLS auto-renew threshold is ignored because automation is disabled."
  return 0
}

run_setup_dev_script() {
  local setup_script="$SCOPE_SCRIPTS/setup-dev.sh"
  if [ ! -f "$setup_script" ]; then
    err "Missing script: $setup_script"
    return 1
  fi
  if ! preflight_gate_for_risky_action "setup-dev"; then
    return 1
  fi
  run_cmd_step "Run setup-dev.sh" bash "$setup_script"
}

preflight_gate_for_risky_action() {
  local action="$1"
  ensure_env_exists
  local issues=()
  local skip_db_reachability=0
  if [ "$action" = "stack-start" ] || [ "$action" = "stack-restart" ]; then
    # Full stack start/restart must be allowed when DB is currently down.
    skip_db_reachability=1
  fi
  if [ -z "$(env_get BASE_URL)" ]; then
    issues+=("BASE_URL missing")
  fi
  if [[ "$action" =~ ^(stack-start|stack-restart|service-start|service-restart)$ ]]; then
    if ! variant_isolation_quick_check; then
      issues+=("Variant isolation check failed (DEPLOYMENT_MODE/cookie scope/DB isolation)")
    fi
  fi
  if [ -z "$(env_get DATABASE_URL)" ]; then
    issues+=("DATABASE_URL missing")
  elif [ "$skip_db_reachability" -eq 0 ] && command -v psql >/dev/null 2>&1; then
    if ! psql "$(env_get DATABASE_URL)" -c "select 1;" >/dev/null 2>&1; then
      issues+=("Database unreachable")
    fi
  fi
  mkdir -p "$BACKUP_ROOT" 2>/dev/null || true
  if [ ! -w "$BACKUP_ROOT" ]; then
    issues+=("Backup root not writable: $BACKUP_ROOT")
  fi

  if [ "${#issues[@]}" -eq 0 ]; then
    return 0
  fi

  local msg="Preflight blocked action '${action}'.\n\n"
  local i=1
  for issue in "${issues[@]}"; do
    msg+="${i}. ${issue}\n"
    i=$((i + 1))
  done
  ui_msgbox "$msg"
  return 1
}

service_action() {
  local action="$1"
  if [ "$action" = "start" ] || [ "$action" = "restart" ]; then
    if ! preflight_gate_for_risky_action "service-${action}"; then
      return 1
    fi
  fi
  case "$action" in
    start|stop|restart)
      if [ "$action" = "start" ] || [ "$action" = "restart" ] || [ "$action" = "stop" ]; then
        stop_pm2_scope_apps
      fi
      run_cmd_step "systemctl ${action} ${SCOPE_SERVICE}" systemctl "$action" "$SCOPE_SERVICE" || return 1
      action_report_set_summary "Service ${SCOPE_SERVICE} ${action} completed. Current state: $(systemctl_active_safe "$SCOPE_SERVICE")"
      ;;
    status)
      if systemd_unit_exists "$SCOPE_SERVICE"; then
        local active enabled sub_state main_pid active_since exec_code exec_status state_text summary_text human
        active="$(systemctl_active_safe "$SCOPE_SERVICE")"
        enabled="$(systemctl_enabled_safe "$SCOPE_SERVICE")"
        sub_state="$(systemctl show "$SCOPE_SERVICE" -p SubState --value 2>/dev/null || true)"
        main_pid="$(systemctl show "$SCOPE_SERVICE" -p MainPID --value 2>/dev/null || true)"
        active_since="$(systemctl show "$SCOPE_SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null || true)"
        exec_code="$(systemctl show "$SCOPE_SERVICE" -p ExecMainCode --value 2>/dev/null || true)"
        exec_status="$(systemctl show "$SCOPE_SERVICE" -p ExecMainStatus --value 2>/dev/null || true)"

        case "$active" in
          active) state_text="Running" ;;
          inactive) state_text="Stopped" ;;
          failed) state_text="Failed" ;;
          activating) state_text="Starting" ;;
          deactivating) state_text="Stopping" ;;
          *) state_text="${active:-Unknown}" ;;
        esac

        run_cmd_step_optional "Read concise service facts ${SCOPE_SERVICE}" \
          systemctl show "$SCOPE_SERVICE" -p Id -p Description -p ActiveState -p SubState -p UnitFileState -p MainPID -p ActiveEnterTimestamp -p ExecMainCode -p ExecMainStatus --no-pager

        human="${SCOPE_LABEL} Service Status"$'\n\n'
        human+="Service: ${SCOPE_SERVICE}"$'\n'
        human+="Current state: ${state_text} (${active}/${sub_state:-n/a})"$'\n'
        human+="Enabled on boot: ${enabled}"$'\n'
        human+="Main PID: ${main_pid:-n/a}"$'\n'
        human+="Active since: ${active_since:-n/a}"$'\n'
        if [ "$active" = "failed" ]; then
          human+="Failure code: ${exec_code:-n/a}, status: ${exec_status:-n/a}"$'\n'
          human+="Tip: Open 'Service logs' for failure details."$'\n'
        fi
        show_action_result "${SCOPE_LABEL} Service Status" "$human"

        summary_text="Service ${SCOPE_SERVICE} is ${state_text} and ${enabled} on boot."
        if [ "$active" = "failed" ]; then
          summary_text+=" Failure code=${exec_code:-n/a}, status=${exec_status:-n/a}."
        fi
        action_report_set_summary "$summary_text"
      else
        action_report_set_summary "Systemd unit ${SCOPE_SERVICE}.service is not installed."
        show_action_result "${SCOPE_LABEL} Service Status" "Systemd unit ${SCOPE_SERVICE}.service is not installed.\n\nRuntime mode: $(app_runtime_mode "$(env_get PORT)")\nApp port: $(env_get PORT)\n\nUse:\n- System Administration -> Create/update systemd service\n- Start full stack components"
      fi
      ;;
    logs)
      if systemd_unit_exists "$SCOPE_SERVICE"; then
        local jlog
        jlog="$(journalctl -u "$SCOPE_SERVICE" -n 200 --no-pager 2>&1 || true)"
        action_report_add_text "[Step $((ACTION_STEPS + 1))] Read recent service logs"
        action_report_add_text "Command: journalctl -u ${SCOPE_SERVICE} -n 200 --no-pager"
        action_report_add_text "Output:"
        action_report_add_text "${jlog:-No log lines returned.}"
        ACTION_STEPS=$((ACTION_STEPS + 1))
        ui_textbox "${SCOPE_LABEL} Service Logs" "${jlog:-No log lines returned for ${SCOPE_SERVICE}.}" 28 120
        if ui_yesno "${SCOPE_LABEL} Service Logs" "Start live log tail now?\n\nCommand:\njournalctl -u ${SCOPE_SERVICE} -f"; then
          journalctl -u "$SCOPE_SERVICE" -f || true
        fi
        action_report_set_summary "Displayed logs for ${SCOPE_SERVICE}. Journal path tip: journalctl -u ${SCOPE_SERVICE}"
      elif app_pm2_process_online; then
        local pm2_recent_cmd pm2_follow_cmd
        pm2_recent_cmd="$(pm2_logs_command '--lines 200 --nostream')"
        pm2_follow_cmd="$(pm2_logs_command '')"
        action_report_set_summary "Systemd unit missing; displayed PM2 logs for active app process."
        view_recent_and_follow \
          "${SCOPE_LABEL} Service Logs (PM2)" \
          "${pm2_recent_cmd}" \
          "${pm2_follow_cmd}"
      else
        action_report_set_summary "Systemd unit ${SCOPE_SERVICE}.service is not installed; journal logs unavailable."
        show_action_result "${SCOPE_LABEL} Service Logs" "Systemd unit ${SCOPE_SERVICE}.service is not installed, so journal logs are unavailable.\n\nUse 'Application log tail' for live/manual runtime diagnostics,\nor create the systemd service first."
      fi
      ;;
    *)
      err "Unsupported service action: $action"
      return 1
      ;;
  esac
}

application_log_tail() {
  local app_port mode out
  app_port="$(env_get PORT)"; app_port="${app_port:-$SCOPE_APP_PORT}"
  mode="$(app_runtime_mode "$app_port")"
  local app_log_file="${GLOBAL_LOG_DIR}/${SCOPE}-app.log"
  if systemd_unit_exists "$SCOPE_SERVICE"; then
    if [ -f "$app_log_file" ]; then
      if ui_yesno "${SCOPE_LABEL} Application Logs" "Open live tail of ${app_log_file} now?\n\nSelect 'No' to show recent 200 lines."; then
        tail -f "$app_log_file" || true
      else
        tail -n 200 "$app_log_file" || true
      fi
    else
      if ui_yesno "${SCOPE_LABEL} Application Logs" "Open live journal tail for ${SCOPE_SERVICE} now?\n\nSelect 'No' to show recent 200 lines."; then
        journalctl -u "$SCOPE_SERVICE" -f || true
      else
        journalctl -u "$SCOPE_SERVICE" -n 200 --no-pager || true
      fi
    fi
    action_report_set_summary "Application logs opened. OS paths: ${app_log_file} and journalctl -u ${SCOPE_SERVICE}"
    return 0
  fi

  if app_pm2_process_online; then
    local pm2_recent_cmd pm2_follow_cmd
    pm2_recent_cmd="$(pm2_logs_command '--lines 200 --nostream')"
    pm2_follow_cmd="$(pm2_logs_command '')"
    view_recent_and_follow \
      "${SCOPE_LABEL} App Logs (PM2)" \
      "${pm2_recent_cmd}" \
      "${pm2_follow_cmd}"
    action_report_set_summary "Opened PM2 application logs."
    return 0
  fi

  # Try PID-based journald lookup for manual runtime.
  local pid=""
  pid="$(ss -ltnp "( sport = :${app_port} )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -1)"
  if [ -n "$pid" ]; then
    local pid_journal
    pid_journal="$(journalctl _PID="$pid" -n 200 --no-pager 2>/dev/null || true)"
    if [ -n "$pid_journal" ] && [ "$pid_journal" != "-- No entries --" ]; then
      ui_textbox "${SCOPE_LABEL} App Log Tail (PID ${pid})" "$pid_journal" 28 120
      return 0
    fi
  fi

  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
    local managed_state managed_recent managed_out
    managed_state="$(systemctl_active_safe "$SCOPE_SERVICE")"
    managed_recent="$(journalctl -u "$SCOPE_SERVICE" -n 200 --no-pager 2>/dev/null || true)"
    if [ -n "$managed_recent" ] && [ "$managed_recent" != "-- No entries --" ]; then
      ui_textbox "${SCOPE_LABEL} App Log Tail (${SCOPE_SERVICE})" "$managed_recent" 28 120
      if ui_yesno "${SCOPE_LABEL} App Log Tail" "Start live log tail now?\n\nCommand:\njournalctl -u ${SCOPE_SERVICE} -f"; then
        journalctl -u "$SCOPE_SERVICE" -f || true
      fi
      action_report_set_summary "Opened managed runtime journal for ${SCOPE_SERVICE}."
      return 0
    fi

    managed_out="${SCOPE_LABEL} Application Log Tail"$'\n\n'
    managed_out+="Managed runtime profile: installed_runtime"$'\n'
    managed_out+="Service: ${SCOPE_SERVICE}"$'\n'
    managed_out+="State: ${managed_state}"$'\n\n'
    managed_out+="No recent journal entries were found yet."$'\n'
    managed_out+="Use these commands for diagnostics:"$'\n'
    managed_out+="- systemctl status ${SCOPE_SERVICE} --no-pager -l"$'\n'
    managed_out+="- journalctl -u ${SCOPE_SERVICE} -n 200 --no-pager"$'\n'
    managed_out+="- journalctl -u ${SCOPE_SERVICE} -f"
    ui_textbox "${SCOPE_LABEL} App Log Tail" "$managed_out" 20 110
    action_report_set_summary "Managed runtime is installed; no recent journal entries were available."
    return 0
  fi

  if ui_yesno "${SCOPE_LABEL} App Log Tail" "No persistent logs found for manual runtime.\n\nWould you like lppadmin to create/start the systemd service now so logs can be tailed persistently?"; then
    create_or_update_systemd_unit || return 1
    run_cmd_step "Start ${SCOPE_SERVICE}" systemctl start "$SCOPE_SERVICE" || return 1
    if [ "$(systemctl_active_safe "$SCOPE_SERVICE")" != "active" ]; then
      local svc_state svc_status svc_journal
      svc_state="$(systemctl_active_safe "$SCOPE_SERVICE")"
      svc_status="$(systemctl status "$SCOPE_SERVICE" --no-pager -l 2>&1 || true)"
      svc_journal="$(journalctl -u "$SCOPE_SERVICE" -n 80 --no-pager 2>&1 || true)"
      action_report_add_text "[Step $((ACTION_STEPS + 1))] Read failed service diagnostics"
      action_report_add_text "Command: systemctl status ${SCOPE_SERVICE} --no-pager -l"
      action_report_add_text "Output:"
      action_report_add_text "${svc_status:-No status output.}"
      ACTION_STEPS=$((ACTION_STEPS + 1))
      action_report_add_text "[Step $((ACTION_STEPS + 1))] Read recent service journal"
      action_report_add_text "Command: journalctl -u ${SCOPE_SERVICE} -n 80 --no-pager"
      action_report_add_text "Output:"
      action_report_add_text "${svc_journal:-No journal output.}"
      ACTION_STEPS=$((ACTION_STEPS + 1))
      action_report_set_summary "Failed to start ${SCOPE_SERVICE}; state=${svc_state}. Diagnostic output included."
      ui_textbox "${SCOPE_LABEL} App Log Tail" "Failed to start ${SCOPE_SERVICE}. Current state: ${svc_state}\n\nDiagnostics were captured in Action Report.\n\nTip: journalctl -u ${SCOPE_SERVICE} -n 200 --no-pager" 20 110
      return 1
    fi
    if [ -f "$app_log_file" ]; then
      if ui_yesno "${SCOPE_LABEL} App Log Tail" "Service is active. Open live tail now?\n\nLog file: ${app_log_file}"; then
        tail -f "$app_log_file" || true
      else
        tail -n 200 "$app_log_file" || true
      fi
    else
      if ui_yesno "${SCOPE_LABEL} App Log Tail" "Service is active. Open live journal tail now?\n\nCommand: journalctl -u ${SCOPE_SERVICE} -f"; then
        journalctl -u "$SCOPE_SERVICE" -f || true
      else
        journalctl -u "$SCOPE_SERVICE" -n 200 --no-pager || true
      fi
    fi
    action_report_set_summary "Persistent logging enabled and opened. Paths: ${app_log_file} and journalctl -u ${SCOPE_SERVICE}"
    return 0
  fi

  out="${SCOPE_LABEL} Application Log Tail"$'\n\n'
  out+="Systemd unit is not installed for ${SCOPE_SERVICE}."$'\n'
  out+="Runtime mode: ${mode}"$'\n'
  out+="App port ${app_port}: $(port_listening_state "$app_port")"$'\n\n'
  out+="Manual mode tip:"$'\n'
  out+="- If app was started in another terminal via npm run dev, logs live in that terminal session."$'\n'
  out+="- Recommended: create systemd unit and use Service logs / journalctl for persistent logs."
  out+=$'\n'"OS log access tip:"$'\n'
  out+="- File logs: ${app_log_file}"$'\n'
  out+="- Journal: journalctl -u ${SCOPE_SERVICE} -n 200 --no-pager"
  ui_textbox "${SCOPE_LABEL} App Log Tail" "$out" 20 110
  action_report_set_summary "No persistent logs were available. Provided runtime and log path guidance."
}

view_recent_and_follow() {
  local description="$1"
  local recent_cmd="$2"
  local follow_cmd="$3"
  echo ""
  echo "== ${description}: recent output =="
  /bin/bash -lc "$recent_cmd" || true
  echo ""
  echo "== ${description}: live follow (Ctrl+C to stop) =="
  /bin/bash -lc "$follow_cmd" || true
}

view_error_only_logs() {
  if [ -n "${SCOPE_SERVICE:-}" ]; then
    view_recent_and_follow \
      "${SCOPE_LABEL} Error Logs" \
      "journalctl -u '$SCOPE_SERVICE' -p err..alert -n 200 --no-pager" \
      "journalctl -u '$SCOPE_SERVICE' -p err..alert -f"
  elif app_pm2_process_online; then
    local pm2_recent_cmd pm2_follow_cmd
    pm2_recent_cmd="$(pm2_logs_command '--lines 400 --nostream') | grep -Ei 'error|fatal|exception|panic|fail' | tail -n 200"
    pm2_follow_cmd="$(pm2_logs_command '') | grep --line-buffered -Ei 'error|fatal|exception|panic|fail'"
    view_recent_and_follow \
      "${SCOPE_LABEL} Error Logs (PM2)" \
      "${pm2_recent_cmd}" \
      "${pm2_follow_cmd}"
  else
    local app_log_file="${GLOBAL_LOG_DIR}/${SCOPE}-app.log"
    if [ -f "$app_log_file" ]; then
      view_recent_and_follow \
        "${SCOPE_LABEL} Error Logs (file)" \
        "grep -Ei 'error|fatal|exception|panic|fail' '$app_log_file' | tail -n 200" \
        "tail -n 200 -f '$app_log_file' | grep --line-buffered -Ei 'error|fatal|exception|panic|fail'"
    else
      warn "No service journal or app log file found."
    fi
  fi
}

stack_action() {
  local action="$1"
  local scope_opt
  local pg_target
  pg_target="$(postgres_service_target)"
  scope_opt="$(ui_menu "${SCOPE_LABEL} Stack ${action^}" "Choose execution scope for ${action}." \
    "1" "All stack components (${pg_target}, nginx, app service)" \
    "2" "Select components")" || return 0
  if is_back_selected "$scope_opt"; then return 0; fi

  local selected=()
  if [ "$scope_opt" = "1" ]; then
    selected=("postgresql" "nginx" "app")
  elif [ "$scope_opt" = "2" ]; then
    local chosen
    chosen="$(ui_checklist "${SCOPE_LABEL} Stack ${action^}" "Select components to ${action}." \
      "postgresql" "PostgreSQL database service (${pg_target})" "ON" \
      "nginx" "Nginx ingress service" "ON" \
      "app" "Application service (${SCOPE_SERVICE})" "ON")" || return 0
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      selected+=("${line%\"}")
    done <<< "${chosen%\"}"
  else
    warn "Invalid execution scope selection"
    return 1
  fi

  if [ "${#selected[@]}" -eq 0 ]; then
    action_report_set_summary "No components selected. No action executed."
    return 0
  fi

  local ordered=()
  local c
  case "$action" in
    start)
      preflight_gate_for_risky_action "stack-start" || return 1
      for c in postgresql nginx app; do
        for s in "${selected[@]}"; do
          [ "$c" = "$s" ] && ordered+=("$c")
        done
      done
      ;;
    stop)
      for c in nginx app postgresql; do
        for s in "${selected[@]}"; do
          [ "$c" = "$s" ] && ordered+=("$c")
        done
      done
      ;;
    restart)
      preflight_gate_for_risky_action "stack-restart" || return 1
      for c in postgresql nginx app; do
        for s in "${selected[@]}"; do
          [ "$c" = "$s" ] && ordered+=("$c")
        done
      done
      ;;
    *)
      err "Unsupported stack action: $action"
      return 1
      ;;
  esac

  local any_failure=0
  local pgstat_note=""
  for c in "${ordered[@]}"; do
    case "$c" in
      postgresql)
        if ! run_cmd_step "${action^} ${pg_target}" systemctl "$action" "$pg_target"; then any_failure=1; fi
        ;;
      nginx)
        if ! run_cmd_step "${action^} nginx" systemctl "$action" nginx; then any_failure=1; fi
        ;;
      app)
        if [ "$action" = "stop" ] || [ "$action" = "restart" ]; then
          stop_pm2_scope_apps
        fi
        if [ "$action" = "start" ] && app_pm2_process_online; then
          stop_pm2_scope_apps
        fi
        if [ "$action" = "start" ] || [ "$action" = "restart" ]; then
          if ! systemd_unit_exists "$SCOPE_SERVICE"; then
            if ! create_or_update_systemd_unit; then
              any_failure=1
              continue
            fi
          fi
        fi
        if [ "$action" = "stop" ] && ! systemd_unit_exists "$SCOPE_SERVICE"; then
          if ! stop_manual_app_runtime; then any_failure=1; fi
        else
          if ! run_cmd_step "${action^} ${SCOPE_SERVICE}" systemctl "$action" "$SCOPE_SERVICE"; then any_failure=1; fi
        fi
        ;;
    esac
  done

  if [ "$action" = "start" ] || [ "$action" = "restart" ]; then
    local db_url
    db_url="$(env_get DATABASE_URL)"
    if [ -n "$db_url" ]; then
      local selected_has_postgres=0
      for c in "${selected[@]}"; do
        if [ "$c" = "postgresql" ]; then
          selected_has_postgres=1
          break
        fi
      done
      if [ "$selected_has_postgres" -eq 1 ]; then
      action_report_add_text "[Step $((ACTION_STEPS + 1))] Ensure pg_stat_statements is enabled by default"
      action_report_add_text "Command group: SHOW/ALTER SYSTEM shared_preload_libraries, restart postgresql (if needed), CREATE EXTENSION"
      ACTION_STEPS=$((ACTION_STEPS + 1))
        if ensure_pg_stat_statements_enabled "$db_url" "silent"; then
          action_report_add_text "Result: pg_stat_statements is enabled."
        else
          action_report_add_text "Result: skipped (non-fatal). Could not auto-enable pg_stat_statements with current DB privileges."
          action_report_add_text "Tip: Run 'Enable slow query extension' as a PostgreSQL superuser."
          pgstat_note=" Slow-query auto-enable was skipped (insufficient privileges)."
        fi
        action_report_add_text ""
      fi
    fi
  fi

  local app_port mode
  app_port="$(env_get PORT)"; app_port="${app_port:-$SCOPE_APP_PORT}"
  mode="$(app_runtime_mode "$app_port")"
  action_report_add_text "Post-${action} runtime mode: ${mode}"
  action_report_add_text "Post-${action} app port ${app_port}: $(port_listening_state "$app_port")"
  action_report_add_text "Post-${action} service state (${SCOPE_SERVICE}): $(systemctl_active_safe "$SCOPE_SERVICE")"
  action_report_add_text "Post-${action} service state (nginx): $(systemctl_active_safe nginx)"
  action_report_add_text "Post-${action} service state ($(postgres_service_target)): $(postgres_service_active_state)"
  action_report_add_text ""

  if [ "$any_failure" -eq 0 ]; then
    action_report_set_summary "Stack ${action} completed for selected components: ${selected[*]}.${pgstat_note}"
  else
    action_report_set_summary "Stack ${action} completed with failures for selected components: ${selected[*]}. See command output.${pgstat_note}"
  fi
}

detect_scope_app_user() {
  local app_user="" unit_file
  if [ -n "${SCOPE_ENV:-}" ] && [ -f "$SCOPE_ENV" ]; then
    app_user="$(grep -E '^LP_ADMIN_USER=' "$SCOPE_ENV" 2>/dev/null | cut -d= -f2 || true)"
    app_user="$(printf '%s' "$app_user" | tr -d '"' | tr -d "'" | tr -d '[:space:]')"
  fi
  if [ -z "$app_user" ] && [ -n "${SCOPE_SERVICE:-}" ]; then
    unit_file="/etc/systemd/system/${SCOPE_SERVICE}.service"
    if [ -f "$unit_file" ]; then
      app_user="$(sed -n 's/^User=//p' "$unit_file" | head -1 | tr -d '[:space:]' || true)"
      if [ "$app_user" = "root" ]; then
        app_user=""
      fi
    fi
  fi
  if [ -z "$app_user" ] && [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    app_user="${SUDO_USER}"
  fi
  if [ -z "$app_user" ] && [ -d "${SCOPE_ROOT:-}" ]; then
    app_user="$(stat -c '%U' "$SCOPE_ROOT" 2>/dev/null || true)"
    if [ "$app_user" = "root" ]; then
      app_user=""
    fi
  fi
  if [ -z "$app_user" ]; then
    app_user="lppadmin"
  fi
  echo "$app_user"
}

stop_pm2_scope_apps() {
  local app_user
  local pm2_cmd plist
  app_user="$(detect_scope_app_user)"
  pm2_cmd="id -u '$app_user' >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1 && home=\$(getent passwd '$app_user' | cut -d: -f6) && [ -n \"\$home\" ] && sudo -u '$app_user' env HOME=\"\$home\" PM2_HOME=\"\$home/.pm2\" pm2"
  run_cmd_step_optional "Stop PM2 app '${SCOPE_SERVICE}' for user ${app_user}" \
    /bin/bash -lc "$pm2_cmd stop '$SCOPE_SERVICE' >/dev/null 2>&1 || true"
  run_cmd_step_optional "Delete PM2 app '${SCOPE_SERVICE}' for user ${app_user}" \
    /bin/bash -lc "$pm2_cmd delete '$SCOPE_SERVICE' >/dev/null 2>&1 || true"
  # Legacy cloud PM2 process name.
  if [ "$SCOPE" = "cloud" ] && [ "$SCOPE_SERVICE" != "learnplay" ]; then
    run_cmd_step_optional "Stop PM2 app 'learnplay' for user ${app_user}" \
      /bin/bash -lc "$pm2_cmd stop learnplay >/dev/null 2>&1 || true"
    run_cmd_step_optional "Delete PM2 app 'learnplay' for user ${app_user}" \
      /bin/bash -lc "$pm2_cmd delete learnplay >/dev/null 2>&1 || true"
  fi
  run_cmd_step_optional "Persist PM2 process list for user ${app_user}" \
    /bin/bash -lc "$pm2_cmd save --force >/dev/null 2>&1 || true"
  plist="$(/bin/bash -lc "$pm2_cmd jlist 2>/dev/null | tr -d '\n' || true")"
  if [ "${plist:-[]}" = "[]" ]; then
    run_cmd_step_optional "Stop PM2 startup unit pm2-${app_user}" systemctl stop "pm2-${app_user}"
  fi
}

stop_manual_app_runtime() {
  local app_port app_user pid_list pid
  app_port="$(env_get PORT)"; app_port="${app_port:-$SCOPE_APP_PORT}"
  app_user="$(detect_scope_app_user)"

  stop_pm2_scope_apps

  pid_list="$(ss -ltnp "( sport = :${app_port} )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)"
  if [ -z "$pid_list" ]; then
    action_report_add_text "No manual process found listening on port ${app_port}."
    action_report_add_text ""
    return 0
  fi

  for pid in $pid_list; do
    run_cmd_step_optional "Terminate process ${pid} listening on port ${app_port}" kill -TERM "$pid"
  done
  sleep 2

  pid_list="$(ss -ltnp "( sport = :${app_port} )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)"
  if [ -n "$pid_list" ]; then
    for pid in $pid_list; do
      run_cmd_step_optional "Force-kill process ${pid} still on port ${app_port}" kill -KILL "$pid"
    done
  fi

  if [ "$(port_listening_state "$app_port")" = "LISTENING" ]; then
    action_report_add_text "Manual runtime stop result: port ${app_port} is still LISTENING."
    action_report_add_text ""
    return 1
  fi
  action_report_add_text "Manual runtime stop result: port ${app_port} is CLOSED."
  action_report_add_text ""
  return 0
}

resolve_upload_dir() {
  local u
  u="$(env_get UPLOAD_DIR)"
  u="${u:-$SCOPE_UPLOAD_DEFAULT}"
  if [[ "$u" = /* ]]; then
    echo "$u"
  else
    echo "$SCOPE_ROOT/$u"
  fi
}

create_full_backup() {
  ensure_env_exists
  local ts
  ts="$(date '+%Y%m%d_%H%M%S')"
  local root="${BACKUP_ROOT}/${SCOPE}"
  local tmp_dir="${root}/tmp/${ts}"
  local snap_dir="${root}/snapshots"
  local db_dir="${root}/database"
  local up_dir="${root}/uploads"
  mkdir -p "$tmp_dir" "$snap_dir" "$db_dir" "$up_dir"

  cp -a "$SCOPE_ENV" "$tmp_dir/.env" 2>/dev/null || true

  local nginx_conf="/etc/nginx/sites-available/learnplay-${SCOPE}.conf"
  [ -f "$nginx_conf" ] && cp -a "$nginx_conf" "$tmp_dir/"

  local unit_file="/etc/systemd/system/${SCOPE_SERVICE}.service"
  [ -f "$unit_file" ] && cp -a "$unit_file" "$tmp_dir/"

  local db_url
  db_url="$(env_get DATABASE_URL)"
  if [ -n "$db_url" ] && command -v pg_dump >/dev/null 2>&1; then
    if [ "${BACKUP_COMPRESS}" = "true" ]; then
      pg_dump "$db_url" | gzip -c > "${db_dir}/${SCOPE}_db_${ts}.sql.gz" || warn "DB backup failed"
    else
      pg_dump "$db_url" > "${db_dir}/${SCOPE}_db_${ts}.sql" || warn "DB backup failed"
    fi
  else
    warn "Skipping DB backup (DATABASE_URL or pg_dump missing)"
  fi

  local upload_path
  upload_path="$(resolve_upload_dir)"
  if [ -d "$upload_path" ]; then
    if [ "${BACKUP_COMPRESS}" = "true" ]; then
      tar -czf "${up_dir}/${SCOPE}_uploads_${ts}.tar.gz" -C "$upload_path" .
    else
      tar -cf "${up_dir}/${SCOPE}_uploads_${ts}.tar" -C "$upload_path" .
    fi
  else
    warn "Upload directory not found: $upload_path"
  fi

  local snapshot_file
  if [ "${BACKUP_COMPRESS}" = "true" ]; then
    snapshot_file="${snap_dir}/${SCOPE}_snapshot_${ts}.tar.gz"
    tar -czf "$snapshot_file" -C "$tmp_dir" .
  else
    snapshot_file="${snap_dir}/${SCOPE}_snapshot_${ts}.tar"
    tar -cf "$snapshot_file" -C "$tmp_dir" .
  fi

  rm -rf "$tmp_dir"
  ok "Backup created: $snapshot_file"
  show_action_result "${SCOPE_LABEL} Full Backup" "Full backup completed successfully.\n\nSnapshot: ${snapshot_file}\nDatabase backup directory: ${db_dir}\nUploads backup directory: ${up_dir}"
  apply_retention_policy
}

create_complete_system_backup() {
  ensure_env_exists
  local ts root full_dir app_dir db_dir up_dir manifest
  ts="$(date '+%Y%m%d_%H%M%S')"
  root="${BACKUP_ROOT}/${SCOPE}"
  full_dir="${root}/full-system"
  app_dir="${root}/app"
  db_dir="${root}/database"
  up_dir="${root}/uploads"
  mkdir -p "$full_dir" "$app_dir" "$db_dir" "$up_dir"

  # Create regular component backups first
  create_full_backup

  # Back up application workspace content
  local app_archive
  if [ "${BACKUP_COMPRESS}" = "true" ]; then
    app_archive="${app_dir}/${SCOPE}_app_${ts}.tar.gz"
    tar -czf "$app_archive" -C "$SCOPE_ROOT" .
  else
    app_archive="${app_dir}/${SCOPE}_app_${ts}.tar"
    tar -cf "$app_archive" -C "$SCOPE_ROOT" .
  fi

  # Build an aggregate full-system archive with references and latest artifacts.
  local latest_snap latest_db latest_up latest_full
  latest_snap="$(latest_file_in_dir "${root}/snapshots")"
  latest_db="$(latest_file_in_dir "$db_dir")"
  latest_up="$(latest_file_in_dir "$up_dir")"
  manifest="$(mktemp)"
  {
    echo "scope=${SCOPE}"
    echo "timestamp=${ts}"
    echo "workspace=${SCOPE_ROOT}"
    echo "app_archive=${app_archive}"
    echo "snapshot=${root}/snapshots/${latest_snap}"
    echo "database=${db_dir}/${latest_db}"
    echo "uploads=${up_dir}/${latest_up}"
  } > "$manifest"

  if [ "${BACKUP_COMPRESS}" = "true" ]; then
    latest_full="${full_dir}/${SCOPE}_full_system_${ts}.tar.gz"
    tar -czf "$latest_full" -C / "$(realpath --relative-to=/ "$manifest")" "$(realpath --relative-to=/ "$app_archive")" \
      "$(realpath --relative-to=/ "${root}/snapshots/${latest_snap}")" \
      "$(realpath --relative-to=/ "${db_dir}/${latest_db}")" \
      "$(realpath --relative-to=/ "${up_dir}/${latest_up}")"
  else
    latest_full="${full_dir}/${SCOPE}_full_system_${ts}.tar"
    tar -cf "$latest_full" -C / "$(realpath --relative-to=/ "$manifest")" "$(realpath --relative-to=/ "$app_archive")" \
      "$(realpath --relative-to=/ "${root}/snapshots/${latest_snap}")" \
      "$(realpath --relative-to=/ "${db_dir}/${latest_db}")" \
      "$(realpath --relative-to=/ "${up_dir}/${latest_up}")"
  fi
  rm -f "$manifest"
  show_action_result "${SCOPE_LABEL} Complete System Backup" "Complete backup created.\n\nArchive: ${latest_full}\nIncludes:\n- App workspace archive\n- Latest full snapshot (.env/nginx/systemd)\n- Latest DB backup\n- Latest uploads backup"
}

apply_retention_policy() {
  local retention="${BACKUP_RETENTION_DAYS:-0}"
  if [ "$retention" = "0" ] || [ -z "$retention" ]; then
    return 0
  fi
  find "${BACKUP_ROOT}/${SCOPE}" -type f -mtime "+${retention}" -delete 2>/dev/null || true
  ok "Retention applied (${retention} days)"
}

verify_backup_integrity() {
  local snap_dir db_dir out latest_snap latest_db marker_dir
  snap_dir="${BACKUP_ROOT}/${SCOPE}/snapshots"
  db_dir="${BACKUP_ROOT}/${SCOPE}/database"
  marker_dir="${BACKUP_ROOT}/${SCOPE}/integrity"
  mkdir -p "$marker_dir"

  latest_snap="$(latest_file_in_dir "$snap_dir")"
  latest_db="$(latest_file_in_dir "$db_dir")"

  local fail=0
  out="${SCOPE_LABEL} Backup Integrity Verification"$'\n\n'
  if [ -n "$latest_snap" ] && [ -f "${snap_dir}/${latest_snap}" ]; then
    if tar -tf "${snap_dir}/${latest_snap}" >/dev/null 2>&1; then
      out+="[OK] Snapshot readable: ${latest_snap}"$'\n'
    else
      out+="[FAIL] Snapshot unreadable: ${latest_snap}"$'\n'
      fail=1
    fi
  else
    out+="[FAIL] No snapshot backup found"$'\n'
    fail=1
  fi

  if [ -n "$latest_db" ] && [ -f "${db_dir}/${latest_db}" ]; then
    if [[ "$latest_db" == *.gz ]]; then
      if gzip -t "${db_dir}/${latest_db}" >/dev/null 2>&1; then
        out+="[OK] DB dump gzip integrity: ${latest_db}"$'\n'
      else
        out+="[FAIL] DB dump gzip integrity failed: ${latest_db}"$'\n'
        fail=1
      fi
    elif grep -qE "^(--|CREATE|SET|INSERT|COPY|ALTER)" "${db_dir}/${latest_db}" 2>/dev/null; then
      out+="[OK] DB dump parse check: ${latest_db}"$'\n'
    else
      out+="[WARN] DB dump parse check inconclusive: ${latest_db}"$'\n'
    fi
  else
    out+="[FAIL] No database backup found"$'\n'
    fail=1
  fi

  local marker="${marker_dir}/verify-$(date '+%Y%m%d_%H%M%S').txt"
  {
    echo "scope=${SCOPE}"
    echo "timestamp=$(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "result=$([ "$fail" -eq 0 ] && echo PASS || echo FAIL)"
    echo "snapshot=${latest_snap:-none}"
    echo "database=${latest_db:-none}"
  } > "$marker"

  out+=$'\n'"Marker: ${marker}"$'\n'
  if [ "$fail" -eq 0 ]; then
    out+="OVERALL: PASS"
  else
    out+="OVERALL: FAIL"
  fi
  ui_textbox "${SCOPE_LABEL} Backup Integrity" "$out" 22 110
  [ "$fail" -eq 0 ]
}

rollback_from_snapshot() {
  local snap_dir="${BACKUP_ROOT}/${SCOPE}/snapshots"
  if [ ! -d "$snap_dir" ]; then
    err "No snapshot directory: $snap_dir"
    return 1
  fi

  mapfile -t snapshots < <(ls -1t "$snap_dir" 2>/dev/null | head -20)
  if [ "${#snapshots[@]}" -eq 0 ]; then
    err "No snapshots found"
    return 1
  fi

  msg "${BOLD}Available snapshots:${NC}"
  local i=1
  for f in "${snapshots[@]}"; do
    echo "  $i) $f"
    i=$((i + 1))
  done
  read -rp "Select snapshot number: " sel
  if ! [[ "$sel" =~ ^[0-9]+$ ]] || [ "$sel" -lt 1 ] || [ "$sel" -gt "${#snapshots[@]}" ]; then
    err "Invalid selection"
    return 1
  fi

  local chosen="${snapshots[$((sel - 1))]}"
  local src="${snap_dir}/${chosen}"
  local tmp
  tmp="$(mktemp -d)"

  tar -xf "$src" -C "$tmp"

  if [ -f "$tmp/.env" ]; then
    backup_single_file "$SCOPE_ENV" "env"
    cp -a "$tmp/.env" "$SCOPE_ENV"
    normalize_scope_env_permissions
    ok "Restored .env"
  fi

  local conf="/etc/nginx/sites-available/learnplay-${SCOPE}.conf"
  if [ -f "$tmp/learnplay-${SCOPE}.conf" ]; then
    backup_single_file "$conf" "nginx"
    cp -a "$tmp/learnplay-${SCOPE}.conf" "$conf"
    nginx -t >/dev/null && systemctl reload nginx
    ok "Restored nginx config"
  fi

  local unit="/etc/systemd/system/${SCOPE_SERVICE}.service"
  if [ -f "$tmp/${SCOPE_SERVICE}.service" ]; then
    backup_single_file "$unit" "systemd"
    cp -a "$tmp/${SCOPE_SERVICE}.service" "$unit"
    systemctl daemon-reload
    ok "Restored systemd unit"
  fi

  rm -rf "$tmp"
  ok "Rollback completed for $SCOPE_LABEL"
}

configure_backup_policy() {
  load_global_conf
  v="$(ui_inputbox "${SCOPE_LABEL} Backup Policy" "Backup root" "${BACKUP_ROOT}")" || return 0
  if [ -n "$v" ]; then
    BACKUP_ROOT="$v"
    save_global_conf_value BACKUP_ROOT "$BACKUP_ROOT"
  fi

  v="$(ui_inputbox "${SCOPE_LABEL} Backup Policy" "Compress backups? (true/false)" "${BACKUP_COMPRESS}")" || return 0
  if [ -n "$v" ]; then
    BACKUP_COMPRESS="$v"
    save_global_conf_value BACKUP_COMPRESS "$BACKUP_COMPRESS"
  fi

  v="$(ui_inputbox "${SCOPE_LABEL} Backup Policy" "Retention days (0 = keep forever)" "${BACKUP_RETENTION_DAYS}")" || return 0
  if [ -n "$v" ]; then
    BACKUP_RETENTION_DAYS="$v"
    save_global_conf_value BACKUP_RETENTION_DAYS "$BACKUP_RETENTION_DAYS"
  fi

  ok "Backup policy saved"
}

run_variant_script_menu() {
  mapfile -t scripts < <(find "$SCOPE_SCRIPTS" -maxdepth 1 -type f -name '*.sh' | sort)
  if [ "${#scripts[@]}" -eq 0 ]; then
    err "No scripts found in $SCOPE_SCRIPTS"
    return 1
  fi

  msg "${BOLD}Variant scripts (${SCOPE_LABEL}):${NC}"
  local i=1
  for s in "${scripts[@]}"; do
    local name
    name="$(basename "$s")"
    echo "  $i) $name"
    i=$((i + 1))
  done
  read -rp "Select script number to run: " sel
  if ! [[ "$sel" =~ ^[0-9]+$ ]] || [ "$sel" -lt 1 ] || [ "$sel" -gt "${#scripts[@]}" ]; then
    err "Invalid selection"
    return 1
  fi

  local script="${scripts[$((sel - 1))]}"
  info "Running $(basename "$script")"
  bash "$script"
}

cleanup_tmp_artifacts() {
  # Trim stale temporary artifacts created by lppadmin operations.
  # Keep recent files for active troubleshooting.
  find /tmp -maxdepth 1 -mindepth 1 -type d -name 'lppadmin-steps-*' -mmin +240 -exec rm -rf {} + 2>/dev/null || true
  find /tmp -maxdepth 1 -mindepth 1 -type d -name 'lppadmin-update-*' -mmin +240 -exec rm -rf {} + 2>/dev/null || true
  find /tmp -maxdepth 1 -mindepth 1 -type f \
    \( -name 'lpp-seq-reset-*.log' \
    -o -name 'lpp_http_body.*' \
    -o -name 'lpp_gemini.*' \
    -o -name 'lpp_mailersend.*' \
    -o -name 'lpp_gamma.*' \
    -o -name 'lpp_yoco.*' \
    -o -name 'lpp_app_health.*' \
    -o -name 'lpp_db_restore.log' \
    -o -name 'lpp_certbot_dryrun.log' \
    -o -name 'dr-postcheck-runtime-*.txt' \) \
    -mmin +240 -delete 2>/dev/null || true
}

run_safe() {
  local label="$1"
  shift
  local rc status summary action_log_file
  ACTION_LABEL="$label"
  action_report_reset
  if ! confirm_action_if_needed "$label"; then
    journal_log "$label" "cancel" "cancelled by user"
    return 0
  fi

  set +e
  "$@"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    ACTION_FAILURES=$((ACTION_FAILURES + 1))
  fi
  if [ "$ACTION_FAILURES" -gt 0 ]; then
    status="FAILED"
  else
    status="SUCCESS"
  fi
  if [ "$rc" -ne 0 ] && [ -z "${ACTION_SUMMARY:-}" ]; then
    ACTION_SUMMARY="Action failed with exit code ${rc}."
  fi
  summary="${ACTION_SUMMARY:-Action completed.}"
  local report
  report="Action: ${label}"$'\n'
  report+="Status: ${status}"$'\n'
  report+="Summary: ${summary}"$'\n'
  report+="Executed steps: ${ACTION_STEPS}"$'\n'
  report+=$'\n'"Details"$'\n'
  if [ -n "$ACTION_REPORT" ]; then
    report+="${ACTION_REPORT}"
  else
    report+="No command steps were recorded for this action (informational view or direct checks)."$'\n'
  fi
  if [ "$rc" -ne 0 ]; then
    report+=$'\n'"Exit code: ${rc}"$'\n'
  fi
  action_log_file="$(persist_action_report "$label" "$status" "$summary" "$report" 2>/dev/null || true)"
  if [ -n "$action_log_file" ]; then
    report+=$'\n'"Persistent log: ${action_log_file}"$'\n'
  fi
  local outcome_body
  outcome_body="$(ui_divider)"$'\n'
  outcome_body+="Action: ${label}"$'\n'
  outcome_body+="Status: ${status}"$'\n'
  outcome_body+="Summary: ${summary}"$'\n'
  outcome_body+="Executed steps: ${ACTION_STEPS}"$'\n'
  outcome_body+="Persistent log: ${action_log_file:-unavailable}"$'\n'
  if [ "$ACTION_FAILURES" -gt 0 ]; then
    outcome_body+="Next step: Inspect persistent log and failing step logs, then rerun from the relevant menu."$'\n'
  else
    outcome_body+="Next step: Continue to next operation or run a health check for verification."$'\n'
  fi
  outcome_body+="$(ui_divider)"

  if [ "$ACTION_FAILURES" -gt 0 ]; then
    printf "\nResult: %b (%s)\n" "${RED}FAILED${NC}" "$label"
    echo "Detailed log: ${action_log_file:-unavailable}"
    ui_textbox "${SCOPE_LABEL} Action Result" "$outcome_body" 16 110
    log "Action failed: ${label} | ${summary} | log=${action_log_file:-n/a}"
    journal_log "$label" "fail" "$summary"
    return 0
  fi
  printf "\nResult: %b (%s)\n" "${GREEN}OK${NC}" "$label"
  echo "Detailed log: ${action_log_file:-unavailable}"
  ui_textbox "${SCOPE_LABEL} Action Result" "$outcome_body" 16 110
  log "Action succeeded: ${label} | ${summary} | log=${action_log_file:-n/a}"
  journal_log "$label" "ok" "$summary"
  return 0
}

os_family() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "${ID_LIKE:-$ID}" in
      *suse*|*opensuse*) echo "suse" ;;
      *rhel*|*fedora*|*centos*) echo "rhel" ;;
      *debian*|*ubuntu*) echo "debian" ;;
      *) echo "${ID:-unknown}" ;;
    esac
  else
    echo "unknown"
  fi
}

latest_file_in_dir() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  ls -1t "$dir" 2>/dev/null | head -1
}

cert_file_for_scope() {
  ensure_env_exists
  local base_url domain
  base_url="$(env_get BASE_URL)"
  domain="$(parse_base_host "${base_url:-}")"
  if [ -n "$domain" ] && [ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]; then
    echo "/etc/letsencrypt/live/${domain}/fullchain.pem"
    return 0
  fi
  if [ -f "/etc/ssl/learnplay/${SCOPE}.crt" ]; then
    echo "/etc/ssl/learnplay/${SCOPE}.crt"
    return 0
  fi
  echo ""
}

cert_expiry_days() {
  local cert="$1"
  if [ -z "$cert" ] || [ ! -f "$cert" ]; then
    echo "n/a"
    return 0
  fi
  local end epoch_now epoch_end days
  end="$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null | cut -d= -f2- || true)"
  if [ -z "$end" ]; then
    echo "n/a"
    return 0
  fi
  epoch_now="$(date +%s)"
  epoch_end="$(date -d "$end" +%s 2>/dev/null || true)"
  if [ -z "$epoch_end" ]; then
    echo "n/a"
    return 0
  fi
  days="$(( (epoch_end - epoch_now) / 86400 ))"
  echo "$days"
}

scope_dashboard_block() {
  local sc="$1"
  select_scope "$sc" >/dev/null 2>&1 || return 0
  ensure_env_exists
  local app_port db_url db_port cert cert_days base latest_snap latest_db mode
  app_port="$(env_get PORT)"; app_port="${app_port:-$SCOPE_APP_PORT}"
  db_url="$(env_get DATABASE_URL)"
  db_port="$(parse_db_port_from_url "$db_url")"
  mode="$(app_runtime_mode "$app_port")"
  cert="$(cert_file_for_scope)"
  cert_days="$(cert_expiry_days "$cert")"
  base="$(env_get BASE_URL)"
  latest_snap="$(latest_file_in_dir "${BACKUP_ROOT}/${SCOPE}/snapshots")"
  latest_db="$(latest_file_in_dir "${BACKUP_ROOT}/${SCOPE}/database")"

  printf "%s Dashboard\n" "$SCOPE_LABEL"
  printf "%s\n" "----------------------------------------"
  if [ "$mode" = "systemd" ]; then
    printf "Runtime Mode: Managed by systemd (%s)\n" "$SCOPE_SERVICE"
  elif [ "$mode" = "manual" ]; then
    printf "Runtime Mode: Running manually on port %s (not systemd-managed)\n" "$app_port"
  else
    printf "Runtime Mode: Stopped\n"
  fi
  printf "Nginx Service: %s\n" "$(systemctl_active_safe nginx)"
  printf "PostgreSQL Service (%s): %s\n" "$(postgres_service_target)" "$(postgres_service_active_state)"
  printf "Public HTTP (80): %s\n" "$(port_listening_state 80)"
  printf "Public HTTPS (443): %s\n" "$(port_listening_state 443)"
  printf "App Port (%s): %s\n" "$app_port" "$(port_listening_state "$app_port")"
  printf "DB Port (%s): %s\n" "$db_port" "$(port_listening_state "$db_port")"
  if [ -n "$db_url" ] && command -v psql >/dev/null 2>&1 && psql "$db_url" -c "select 1;" >/dev/null 2>&1; then
    printf "DB Connectivity: OK\n"
  else
    printf "DB Connectivity: FAIL\n"
  fi
  printf "TLS Certificate: %s\n" "${cert:-missing}"
  printf "TLS Expiry (days): %s\n" "$cert_days"
  printf "Latest Full Snapshot: %s\n" "${latest_snap:-none}"
  printf "Latest DB Backup: %s\n" "${latest_db:-none}"
  printf "Base URL: %s\n\n" "${base:-unset}"
}

scope_is_enabled() {
  local sc="$1"
  if [ "$sc" = "cloud" ]; then
    [ "$HAS_CLOUD_SCOPE" -eq 1 ]
  else
    [ "$HAS_ONPREM_SCOPE" -eq 1 ]
  fi
}

main_dashboard() {
  local disk mem out
  disk="$(df -h / | awk 'NR==2 {print $3 "/" $2 " used (" $5 ")"}')"
  mem="$(free -h | awk '/Mem:/ {print $3 "/" $2 " used"}')"
  out="LearnPlay Dashboard"$'\n'
  out+="Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"$'\n'
  out+="Host OS family: $(os_family)"$'\n'
  out+="Disk (/): ${disk}"$'\n'
  out+="Memory: ${mem}"$'\n\n'
  if scope_is_enabled cloud; then
    out+="$(scope_dashboard_block cloud)"$'\n'
  fi
  if scope_is_enabled onprem; then
    out+="$(scope_dashboard_block onprem)"$'\n'
  fi
  ui_textbox "LearnPlay Dashboard" "$out" 30 120
}

send_health_alert() {
  local level="$1"
  local message="$2"
  load_global_conf
  if [ "${ENABLE_HEALTH_ALERTS:-false}" != "true" ]; then
    return 0
  fi
  if [ -n "${ALERT_WEBHOOK_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    curl -sS -X POST "$ALERT_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"scope\":\"${SCOPE}\",\"level\":\"${level}\",\"message\":\"${message//\"/\\\"}\"}" >/dev/null 2>&1 || true
  fi
  if [ -n "${ALERT_EMAIL_TO:-}" ] && command -v mail >/dev/null 2>&1; then
    printf "%s\n" "$message" | mail -s "LearnPlay ${SCOPE_LABEL} health ${level}" "$ALERT_EMAIL_TO" || true
  fi
}

configure_health_alerts() {
  load_global_conf
  local v
  v="$(ui_inputbox "Health Alerts" "Enable alerts? true/false:" "${ENABLE_HEALTH_ALERTS:-false}")" || return 0
  ENABLE_HEALTH_ALERTS="$v"; save_global_conf_value ENABLE_HEALTH_ALERTS "$ENABLE_HEALTH_ALERTS"
  v="$(ui_inputbox "Health Alerts" "Webhook URL (optional):" "${ALERT_WEBHOOK_URL:-}")" || return 0
  ALERT_WEBHOOK_URL="$v"; save_global_conf_value ALERT_WEBHOOK_URL "$ALERT_WEBHOOK_URL"
  v="$(ui_inputbox "Health Alerts" "Email recipient (optional):" "${ALERT_EMAIL_TO:-}")" || return 0
  ALERT_EMAIL_TO="$v"; save_global_conf_value ALERT_EMAIL_TO "$ALERT_EMAIL_TO"
  ok "Health alert settings saved"
}

test_health_alerts() {
  send_health_alert "TEST" "Manual test alert from lppadmin on ${SCOPE_LABEL} at $(date '+%F %T')"
  ok "Test alert dispatched (check webhook/email targets)."
}

preflight_checks() {
  ensure_env_exists
  local fails=0 warns=0 out base domain db_url cert upload_path
  out="${SCOPE_LABEL} Preflight Checks"$'\n\n'
  add_pf() {
    local st="$1" check="$2" detail="$3"
    [ "$st" = "FAIL" ] && fails=$((fails+1))
    [ "$st" = "WARN" ] && warns=$((warns+1))
    out+="$(printf "%-6s | %-36s | %s" "$st" "$check" "$detail")"$'\n'
  }
  out+="$(printf "%-6s | %-36s | %s" "STATE" "CHECK" "DETAIL")"$'\n'
  out+="$(printf "%-6s-+-%-36s-+-%s" "------" "------------------------------------" "------------------------------")"$'\n'

  base="$(env_get BASE_URL)"
  if [ -n "$base" ]; then add_pf "OK" "BASE_URL present" "$base"; else add_pf "FAIL" "BASE_URL present" "BASE_URL missing"; fi
  domain="$(parse_base_host "${base:-}")"
  if [ -n "$domain" ] && getent hosts "$domain" >/dev/null 2>&1; then
    local dns_addrs
    dns_addrs="$(getent ahosts "$domain" 2>/dev/null | awk '{print $1}' | sort -u | paste -sd, -)"
    add_pf "OK" "DNS resolves" "${domain} -> ${dns_addrs:-resolved}"
  elif [ -n "$domain" ]; then
    add_pf "WARN" "DNS resolves" "${domain} not resolving via getent hosts (A/AAAA lookup). Check public DNS records."
  else
    add_pf "WARN" "DNS resolves" "No domain to test"
  fi

  cert="$(cert_file_for_scope)"
  if [ -n "$cert" ] && [ -f "$cert" ]; then
    add_pf "OK" "TLS cert file" "$cert (expires in $(cert_expiry_days "$cert") days)"
  else
    add_pf "WARN" "TLS cert file" "No cert file found for scope"
  fi

  db_url="$(env_get DATABASE_URL)"
  if [ -n "$db_url" ] && command -v psql >/dev/null 2>&1 && psql "$db_url" -c "select 1;" >/dev/null 2>&1; then
    add_pf "OK" "Database reachability" "psql connect ok"
  else
    add_pf "FAIL" "Database reachability" "DB connect failed or DATABASE_URL missing"
  fi

  upload_path="$(resolve_upload_dir)"
  mkdir -p "$upload_path" 2>/dev/null || true
  if [ -w "$upload_path" ]; then add_pf "OK" "Upload path writable" "$upload_path"; else add_pf "FAIL" "Upload path writable" "$upload_path not writable"; fi
  mkdir -p "$BACKUP_ROOT" 2>/dev/null || true
  if [ -w "$BACKUP_ROOT" ]; then add_pf "OK" "Backup root writable" "$BACKUP_ROOT"; else add_pf "FAIL" "Backup root writable" "$BACKUP_ROOT not writable"; fi

  if [ -n "$(env_get SESSION_SECRET)" ]; then add_pf "OK" "SESSION_SECRET present" "set"; else add_pf "FAIL" "SESSION_SECRET present" "missing"; fi
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
    add_pf "OK" "Runtime profile" "installed system profile active"
  else
    if variant_isolation_quick_check; then
      add_pf "OK" "Variant isolation health" "all critical checks passed"
    else
      add_pf "WARN" "Variant isolation health" "run 'Variant isolation health check' for details"
    fi
  fi
  if [ "$SCOPE" = "cloud" ]; then
    if [ -n "$(env_get YOCO_SECRET_KEY)" ] || [ -n "$(env_get YOCO_LIVE_SECRET_KEY)" ] || [ -n "$(env_get YOCO_TEST_SECRET_KEY)" ]; then
      add_pf "OK" "YOCO secret key present" "cloud payments ready"
    else
      add_pf "FAIL" "YOCO secret key present" "missing for cloud purchases"
    fi
  fi

  out+=$'\n'"OVERALL: "
  if [ "$fails" -gt 0 ]; then out+="FAILED (${fails} fail, ${warns} warn)"; else out+="PASSED (${warns} warn)"; fi
  ui_textbox "${SCOPE_LABEL} Preflight Checks" "$out" 28 120
  [ "$fails" -eq 0 ]
}

repair_common_issues() {
  ensure_env_exists
  local run_user="${SUDO_USER:-lppadmin}"
  ensure_session_secret
  mkdir -p "$SCOPE_ROOT/uploads/public" "$SCOPE_ROOT/uploads/private" "$BACKUP_ROOT" || true
  run_cmd_step_optional "Set upload ownership" chown -R "${run_user}:${run_user}" "$SCOPE_ROOT/uploads"
  run_cmd_step_optional "Set upload permissions" chmod -R u+rwX,g+rwX "$SCOPE_ROOT/uploads"
  run_cmd_step_optional "Set env ownership" chown "$run_user":"$run_user" "$SCOPE_ENV"
  run_cmd_step_optional "Set env permissions" chmod 640 "$SCOPE_ENV"
  run_cmd_step_optional "Normalize runtime file ownership/permissions" normalize_scope_runtime_permissions
  if [ "$LPPADMIN_PROFILE" != "installed_runtime" ] && ! systemd_unit_exists "$SCOPE_SERVICE"; then
    create_or_update_systemd_unit || return 1
  fi
  if [ -f "/etc/nginx/sites-available/learnplay-${SCOPE}.conf" ]; then
    run_cmd_step_optional "Validate nginx config" nginx -t
    run_cmd_step_optional "Reload nginx" systemctl reload nginx
  fi
  if systemd_unit_exists "$SCOPE_SERVICE"; then
    run_cmd_step_optional "Start ${SCOPE_SERVICE}" systemctl start "$SCOPE_SERVICE"
  fi
  action_report_set_summary "One-click repair completed. app=$(systemctl_active_safe "$SCOPE_SERVICE"), nginx=$(systemctl_active_safe nginx)"
  ok "One-click repair completed. Run preflight/health checks to confirm."
}

systemctl_active_safe() {
  local svc="$1"
  systemctl is-active "$svc" 2>/dev/null || true
}

systemctl_enabled_safe() {
  local svc="$1"
  systemctl is-enabled "$svc" 2>/dev/null || true
}

systemd_unit_exists() {
  local svc="$1"
  local load_state
  load_state="$(systemctl show "${svc}.service" -p LoadState --value 2>/dev/null || true)"
  [ -n "$load_state" ] && [ "$load_state" != "not-found" ]
}

postgres_cluster_unit() {
  if ! command -v pg_lsclusters >/dev/null 2>&1; then
    return 1
  fi
  local ver cluster unit
  while read -r ver cluster _; do
    [ -n "${ver:-}" ] || continue
    unit="postgresql@${ver}-${cluster}"
    if systemd_unit_exists "$unit"; then
      echo "$unit"
      return 0
    fi
  done < <(pg_lsclusters --no-header 2>/dev/null || true)
  return 1
}

postgres_service_target() {
  local unit
  unit="$(postgres_cluster_unit || true)"
  if [ -n "$unit" ]; then
    echo "$unit"
  else
    echo "postgresql"
  fi
}

postgres_service_active_state() {
  local unit
  unit="$(postgres_service_target)"
  if [ "$unit" = "postgresql" ]; then
    systemctl_active_safe postgresql
    return 0
  fi
  local state
  state="$(systemctl_active_safe "$unit")"
  if [ "$state" = "active" ]; then
    echo "active"
    return 0
  fi
  # If any PostgreSQL cluster unit is active, report active.
  if systemctl list-units "postgresql@*.service" --no-legend 2>/dev/null | awk '$4=="running"{found=1} END{exit !found}'; then
    echo "active"
  else
    echo "$state"
  fi
}

postgres_service_enabled_state() {
  local unit
  unit="$(postgres_service_target)"
  if [ "$unit" = "postgresql" ]; then
    systemctl_enabled_safe postgresql
  else
    systemctl_enabled_safe "$unit"
  fi
}

port_listening_state() {
  local port="$1"
  if ss -ltn "( sport = :${port} )" 2>/dev/null | awk 'NR>1{found=1} END{exit !found}'; then
    echo "LISTENING"
  else
    echo "CLOSED"
  fi
}

app_runtime_mode() {
  local app_port="$1"
  if [ "$(systemctl_active_safe "$SCOPE_SERVICE")" = "active" ]; then
    echo "systemd"
  elif app_pm2_process_online; then
    echo "pm2"
  elif [ "$(port_listening_state "$app_port")" = "LISTENING" ]; then
    echo "manual"
  else
    echo "stopped"
  fi
}

app_pm2_user() {
  local u=""
  if [ -f "$SCOPE_ENV" ]; then
    u="$(grep -E '^LP_ADMIN_USER=' "$SCOPE_ENV" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'" || true)"
  fi
  if [ -z "$u" ] && [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    u="$SUDO_USER"
  fi
  if [ -z "$u" ]; then
    u="lppadmin"
  fi
  echo "$u"
}

app_pm2_process_online() {
  local u home plist escaped_scope
  u="$(app_pm2_user)"
  home="$(getent passwd "$u" | cut -d: -f6 || true)"
  [ -n "$home" ] || home="/home/$u"
  escaped_scope="$(printf '%s' "$SCOPE_SERVICE" | sed 's/[][\.^$*+?(){}|]/\\&/g')"
  # Resolve PM2 in the runtime user's shell context (root PATH may not include pm2).
  plist="$(sudo -u "$u" env HOME="$home" PM2_HOME="$home/.pm2" /bin/bash -lc 'command -v pm2 >/dev/null 2>&1 && pm2 jlist' 2>/dev/null | tr -d '\n' || true)"
  if printf '%s' "$plist" | grep -Eq "\"name\":\"(learnplay|${escaped_scope})\"[^}]*\"status\":\"online\""; then
    return 0
  fi
  return 1
}

app_pm2_startup_state() {
  local u svc
  u="$(app_pm2_user)"
  svc="pm2-${u}"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl_enabled_safe "$svc"
    return 0
  fi
  echo "unknown"
}

pm2_logs_command() {
  local pm2_extra="${1:-}"
  local u home proc
  u="$(app_pm2_user)"
  home="$(getent passwd "$u" | cut -d: -f6 || true)"
  [ -n "$home" ] || home="/home/$u"
  proc="learnplay"
  if ! sudo -u "$u" env HOME="$home" PM2_HOME="$home/.pm2" pm2 describe "$proc" >/dev/null 2>&1; then
    proc="${SCOPE_SERVICE:-learnplay}"
  fi
  if [ -n "$pm2_extra" ]; then
    echo "sudo -u '$u' env HOME='$home' PM2_HOME='$home/.pm2' pm2 logs '$proc' $pm2_extra"
  else
    echo "sudo -u '$u' env HOME='$home' PM2_HOME='$home/.pm2' pm2 logs '$proc'"
  fi
}

service_component_version() {
  local component="$1"
  local version=""
  case "$component" in
    app)
      version="$(installed_app_version 2>/dev/null || true)"
      ;;
    nginx)
      version="$(dpkg-query -W -f='${Version}' nginx 2>/dev/null || true)"
      [ -n "$version" ] || version="$(nginx -v 2>&1 | sed -n 's#.*nginx/\([^ ]*\).*#\1#p' | head -1 || true)"
      ;;
    postgresql)
      local pg_unit pg_major
      pg_unit="$(postgres_service_target 2>/dev/null || true)"
      if [[ "$pg_unit" =~ ^postgresql@([0-9]+)- ]]; then
        pg_major="${BASH_REMATCH[1]}"
        version="$(dpkg-query -W -f='${Version}' "postgresql-${pg_major}" 2>/dev/null || true)"
      fi
      [ -n "$version" ] || version="$(dpkg-query -W -f='${Version}' postgresql 2>/dev/null || true)"
      [ -n "$version" ] || version="$(psql --version 2>/dev/null | awk '{print $3}' | head -1 || true)"
      ;;
  esac
  echo "${version:-unknown}"
}

show_action_result() {
  local title="$1"
  local body="$2"
  local out
  out="$(ui_divider)"$'\n'
  out+="${title}"$'\n'
  out+="$(ui_divider)"$'\n'
  out+="${body}"$'\n'
  out+="$(ui_divider)"
  ui_textbox "$title" "$out" 18 110
}

parse_db_port_from_url() {
  local db_url="$1"
  local port
  port="$(echo "$db_url" | sed -n 's#.*:\([0-9][0-9]*\)/[^/]*$#\1#p')"
  echo "${port:-5432}"
}

system_status_overview() {
  ensure_env_exists

  local app_port db_url db_port
  app_port="$(env_get PORT)"
  app_port="${app_port:-$SCOPE_APP_PORT}"
  db_url="$(env_get DATABASE_URL)"
  db_port="$(parse_db_port_from_url "$db_url")"

  local app_active app_enabled nginx_active nginx_enabled pg_active pg_enabled mode
  app_active="$(systemctl_active_safe "$SCOPE_SERVICE")"
  app_enabled="$(systemctl_enabled_safe "$SCOPE_SERVICE")"
  mode="$(app_runtime_mode "$app_port")"
  nginx_active="$(systemctl_active_safe nginx)"
  nginx_enabled="$(systemctl_enabled_safe nginx)"
  pg_active="$(postgres_service_active_state)"
  pg_enabled="$(postgres_service_enabled_state)"

  local out=""
  out+="${SCOPE_LABEL} System Status"$'\n'
  out+="Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"$'\n'
  out+=$'\n'
  out+="Services"$'\n'
  out+="App Runtime Mode: "
  if [ "$mode" = "systemd" ]; then
    out+="Managed by systemd ($SCOPE_SERVICE)"$'\n'
  elif [ "$mode" = "pm2" ]; then
    out+="Managed by PM2 (process: learnplay)"$'\n'
  elif [ "$mode" = "manual" ]; then
    out+="Running manually on port ${app_port} (unit not used)"$'\n'
  else
    out+="Stopped"$'\n'
  fi
  out+=$'\n'
  out+="$(printf "%-24s | %-10s | %-14s | %-22s" "SERVICE" "ACTIVE" "ENABLED" "VERSION")"$'\n'
  out+="$(printf "%-24s-+-%-10s-+-%-14s-+-%-22s" "------------------------" "----------" "--------------" "----------------------")"$'\n'
  if systemd_unit_exists "$SCOPE_SERVICE"; then
    out+="$(printf "%-24s | %-10s | %-14s | %-22s" "$SCOPE_SERVICE" "${app_active:-unknown}" "${app_enabled:-unknown}" "$(service_component_version app)")"$'\n'
  elif [ "$mode" = "pm2" ]; then
    out+="$(printf "%-24s | %-10s | %-14s | %-22s" "$SCOPE_SERVICE" "active(pm2)" "$(app_pm2_startup_state)" "$(service_component_version app)")"$'\n'
  else
    out+="$(printf "%-24s | %-10s | %-14s | %-22s" "$SCOPE_SERVICE" "n/a" "n/a" "$(service_component_version app)")"$'\n'
  fi
  out+="$(printf "%-24s | %-10s | %-14s | %-22s" "nginx" "${nginx_active:-unknown}" "${nginx_enabled:-unknown}" "$(service_component_version nginx)")"$'\n'
  out+="$(printf "%-24s | %-10s | %-14s | %-22s" "$(postgres_service_target)" "${pg_active:-unknown}" "${pg_enabled:-unknown}" "$(service_component_version postgresql)")"$'\n'
  out+=$'\n'
  out+="Ports"$'\n'
  out+="$(printf "%-24s | %-8s | %-10s | %-26s" "COMPONENT" "PORT" "STATE" "NOTES")"$'\n'
  out+="$(printf "%-24s-+-%-8s-+-%-10s-+-%-26s" "------------------------" "--------" "----------" "--------------------------")"$'\n'
  out+="$(printf "%-24s | %-8s | %-10s | %-26s" "Public HTTP" "80" "$(port_listening_state 80)" "nginx ingress")"$'\n'
  out+="$(printf "%-24s | %-8s | %-10s | %-26s" "Public HTTPS" "443" "$(port_listening_state 443)" "nginx TLS ingress")"$'\n'
  out+="$(printf "%-24s | %-8s | %-10s | %-26s" "App internal" "$app_port" "$(port_listening_state "$app_port")" "$SCOPE_SERVICE")"$'\n'
  out+="$(printf "%-24s | %-8s | %-10s | %-26s" "PostgreSQL" "$db_port" "$(port_listening_state "$db_port")" "database listener")"$'\n'
  out+=$'\n'
  out+="Environment"$'\n'
  out+="  BASE_URL: $(env_get BASE_URL)"$'\n'
  out+="  DATABASE_URL: ${db_url:-unset}"$'\n'

  ui_textbox "${SCOPE_LABEL} System Status" "$out" 28 110
}

system_health_check() {
  ensure_env_exists

  local app_port db_url db_port
  app_port="$(env_get PORT)"
  app_port="${app_port:-$SCOPE_APP_PORT}"
  db_url="$(env_get DATABASE_URL)"
  db_port="$(parse_db_port_from_url "$db_url")"

  local checks_total=0
  local checks_fail=0
  local checks_warn=0
  local out=""
  out+="${SCOPE_LABEL} System Health"$'\n'
  out+="Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"$'\n'
  out+=$'\n'
  out+="$(printf "%-6s | %-46s | %s" "STATE" "CHECK" "DETAIL")"$'\n'
  out+="$(printf "%-6s-+-%-46s-+-%s" "------" "----------------------------------------------" "------------------------------")"$'\n'

  add_check() {
    local state="$1"
    local check="$2"
    local detail="$3"
    checks_total=$((checks_total + 1))
    if [ "$state" = "FAIL" ]; then
      checks_fail=$((checks_fail + 1))
    elif [ "$state" = "WARN" ]; then
      checks_warn=$((checks_warn + 1))
    fi
    out+="$(printf "%-6s | %-46s | %s" "$state" "$check" "$detail")"$'\n'
  }

  local app_port_state runtime_mode
  runtime_mode="$(app_runtime_mode "$app_port")"
  app_port_state="$(port_listening_state "$app_port")"
  if [ "$(systemctl_active_safe "$SCOPE_SERVICE")" = "active" ]; then
    add_check "OK" "App service active" "$SCOPE_SERVICE is running"
  elif [ "$runtime_mode" = "pm2" ]; then
    add_check "OK" "App service active" "App managed by PM2 (process online)"
  elif [ "$app_port_state" = "LISTENING" ]; then
    add_check "WARN" "App service active" "App running on port ${app_port} outside systemd"
  elif ! systemd_unit_exists "$SCOPE_SERVICE"; then
    add_check "FAIL" "App service active" "${SCOPE_SERVICE}.service not found"
  else
    add_check "FAIL" "App service active" "$SCOPE_SERVICE is not running"
  fi

  if [ "$(systemctl_active_safe nginx)" = "active" ]; then
    add_check "OK" "Nginx active" "nginx is running"
  else
    add_check "FAIL" "Nginx active" "nginx is not running"
  fi

  if [ "$app_port_state" = "LISTENING" ]; then
    add_check "OK" "Internal app port listening" "port ${app_port} open"
  else
    add_check "FAIL" "Internal app port listening" "port ${app_port} closed"
  fi

  if is_behind_caddy_mode; then
    if [ "$(port_listening_state 443)" = "LISTENING" ]; then
      add_check "OK" "HTTPS ingress port listening" "port 443 open"
    else
      add_check "OK" "HTTPS ingress port listening" "port 443 handled upstream by Caddy"
    fi
    add_check "OK" "TLS certificate expiry" "managed by Caddy reverse proxy"
  else
    if [ "$(port_listening_state 443)" = "LISTENING" ]; then
      add_check "OK" "HTTPS ingress port listening" "port 443 open"
    else
      add_check "FAIL" "HTTPS ingress port listening" "port 443 closed"
    fi

    local cert cert_days cert_mode
    cert="$(cert_file_for_scope)"
    cert_days="$(cert_expiry_days "$cert")"
    cert_mode="unknown"
    if [ -n "$cert" ] && [[ "$cert" == /etc/letsencrypt/* ]]; then
      cert_mode="letsencrypt"
    elif [ -n "$cert" ] && [ -f "$cert" ]; then
      local issuer subject
      issuer="$(openssl x509 -in "$cert" -noout -issuer 2>/dev/null || true)"
      subject="$(openssl x509 -in "$cert" -noout -subject 2>/dev/null || true)"
      if printf '%s' "$issuer" | grep -qi "Let's Encrypt"; then
        cert_mode="letsencrypt"
      elif [ -n "$issuer" ] && [ "$issuer" = "$subject" ]; then
        cert_mode="self-signed"
      else
        cert_mode="custom"
      fi
    fi
    if [ -n "$cert" ] && [ "$cert_days" != "n/a" ]; then
      if [ "$cert_days" -le 7 ]; then
        add_check "FAIL" "TLS certificate expiry" "${cert_mode}, ${cert_days} day(s) remaining"
      elif [ "$cert_days" -le 20 ]; then
        add_check "WARN" "TLS certificate expiry" "${cert_mode}, ${cert_days} day(s) remaining"
      else
        add_check "OK" "TLS certificate expiry" "${cert_mode}, ${cert_days} day(s) remaining"
      fi
    else
      add_check "WARN" "TLS certificate expiry" "certificate not detected"
    fi
  fi

  if [ -n "$db_url" ] && command -v psql >/dev/null 2>&1; then
    if psql "$db_url" -c "select 1;" >/dev/null 2>&1; then
      add_check "OK" "Database connectivity" "psql connect ok"
    else
      add_check "FAIL" "Database connectivity" "psql connection failed"
    fi
  else
    add_check "WARN" "Database connectivity" "DATABASE_URL or psql missing"
  fi

  if [ "$(port_listening_state "$db_port")" = "LISTENING" ]; then
    add_check "OK" "Database port listening" "port ${db_port} open"
  else
    add_check "WARN" "Database port listening" "port ${db_port} closed (may be remote DB)"
  fi

  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    add_check "OK" "Media packaging dependencies" "ffmpeg/ffprobe available"
  else
    add_check "FAIL" "Media packaging dependencies" "ffmpeg/ffprobe missing (podcast seek packaging unavailable)"
  fi

  if [ "$SCOPE" = "cloud" ]; then
    if [ -n "$(env_get YOCO_SECRET_KEY)" ] || [ -n "$(env_get YOCO_LIVE_SECRET_KEY)" ] || [ -n "$(env_get YOCO_TEST_SECRET_KEY)" ]; then
      add_check "OK" "Cloud payment secret present" "YOCO secret detected"
    else
      add_check "FAIL" "Cloud payment secret present" "Missing YOCO secret key(s)"
    fi
  fi

  out+=$'\n'
  if [ "$checks_fail" -eq 0 ] && [ "$checks_warn" -eq 0 ]; then
    out+="OVERALL: HEALTHY (all ${checks_total} checks passed)"
  elif [ "$checks_fail" -eq 0 ]; then
    out+="OVERALL: DEGRADED (${checks_warn} warning(s), ${checks_total} checks)"
    send_health_alert "WARN" "${SCOPE_LABEL} health degraded (${checks_warn} warning(s))"
  else
    out+="OVERALL: UNHEALTHY (${checks_fail} failure(s), ${checks_warn} warning(s), ${checks_total} checks)"
    send_health_alert "FAIL" "${SCOPE_LABEL} health unhealthy (${checks_fail} failure(s), ${checks_warn} warning(s))"
  fi

  ui_textbox "${SCOPE_LABEL} System Health" "$out" 28 120
}

show_scope_summary() {
  ensure_env_exists
  local base_url port db app_ver
  base_url="$(env_get BASE_URL)"
  port="$(env_get PORT)"
  db="$(env_get DATABASE_URL)"
  app_ver="$(display_release_version "$(installed_app_version)")"
  echo ""
  printf "%b\n" "${BOLD}${SCOPE_LABEL} Summary${NC}"
  echo "  Workspace:   $SCOPE_ROOT"
  echo "  Env file:    $SCOPE_ENV"
  echo "  Service:     $SCOPE_SERVICE"
  echo "  App version: ${app_ver}"
  echo "  BASE_URL:    ${base_url:-unset}"
  echo "  PORT:        ${port:-unset}"
  echo "  DATABASE_URL:${db:-unset}"
  echo ""
}

installed_app_version() {
  local version_file="${SCOPE_ROOT}/.version"
  local version_json="${SCOPE_ROOT}/version.json"
  local value=""
  # Prefer version.json because packaged updates always refresh it.
  if [ -f "$version_json" ]; then
    value="$(grep '"version"' "$version_json" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2 || true)"
  fi
  if [ -z "$value" ] && [ -f "$version_file" ]; then
    value="$(grep -E '^version=' "$version_file" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  fi
  echo "${value:-unknown}"
}

display_release_version() {
  local value="${1:-unknown}"
  case "$value" in
    LP-CL-V*|LP-OP-V*) echo "$value" ;;
    unknown|missing|"") echo "${value:-unknown}" ;;
    *) echo "$value" ;;
  esac
}

runtime_version_report() {
  ensure_env_exists || return 1
  local version_json manifest runtime_marker out
  local version build_date git_commit git_branch manifest_version manifest_product manifest_min
  local marker_product marker_system_type marker_last_updated

  version_json="${SCOPE_ROOT}/version.json"
  manifest="${SCOPE_ROOT}/release-manifest.json"
  runtime_marker="${SCOPE_ROOT}/.runtime-identity.json"

  version="$(grep -oP '"version"\s*:\s*"\K[^"]+' "$version_json" 2>/dev/null | head -1 || true)"
  build_date="$(grep -oP '"buildDate"\s*:\s*"\K[^"]+' "$version_json" 2>/dev/null | head -1 || true)"
  git_commit="$(grep -oP '"gitCommit"\s*:\s*"\K[^"]+' "$version_json" 2>/dev/null | head -1 || true)"
  git_branch="$(grep -oP '"gitBranch"\s*:\s*"\K[^"]+' "$version_json" 2>/dev/null | head -1 || true)"
  manifest_version="$(grep -oP '"version"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  manifest_product="$(grep -oP '"product"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  manifest_min="$(grep -oP '"minSupportedVersion"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  marker_product="$(grep -oP '"product"\s*:\s*"\K[^"]+' "$runtime_marker" 2>/dev/null | head -1 || true)"
  marker_system_type="$(grep -oP '"systemType"\s*:\s*"\K[^"]+' "$runtime_marker" 2>/dev/null | head -1 || true)"
  marker_last_updated="$(grep -oP '"lastUpdatedAt"\s*:\s*"\K[^"]+' "$runtime_marker" 2>/dev/null | head -1 || true)"

  out=""
  out+="Scope: ${SCOPE}"$'\n'
  out+="RuntimeRoot: ${SCOPE_ROOT}"$'\n'
  out+="VersionJson: ${version_json}"$'\n'
  out+="InstalledVersion: $(display_release_version "${version:-unknown}")"$'\n'
  out+="InstalledVersionRaw: ${version:-unknown}"$'\n'
  out+="BuildDate: ${build_date:-unknown}"$'\n'
  out+="GitCommit: ${git_commit:-unknown}"$'\n'
  out+="GitBranch: ${git_branch:-unknown}"$'\n'
  out+="Manifest: ${manifest}"$'\n'
  out+="ManifestProduct: ${manifest_product:-missing}"$'\n'
  out+="ManifestVersion: $(display_release_version "${manifest_version:-missing}")"$'\n'
  out+="ManifestVersionRaw: ${manifest_version:-missing}"$'\n'
  out+="ManifestMinSupported: ${manifest_min:-missing}"$'\n'
  out+="RuntimeMarker: ${runtime_marker}"$'\n'
  out+="RuntimeMarkerProduct: ${marker_product:-missing}"$'\n'
  out+="RuntimeSystemType: ${marker_system_type:-missing}"$'\n'
  out+="RuntimeLastUpdatedAt: ${marker_last_updated:-missing}"$'\n'
  ui_textbox "${SCOPE_LABEL} Runtime Version" "$out" 22 110
}

parity_report() {
  ensure_env_exists || return 1
  local version build manifest manifest_product manifest_version manifest_min lppadmin_ver mig_count mig_table out runtime_marker runtime_product runtime_system_type provenance_file
  local schema_tables schema_columns schema_enums schema_constraints schema_indexes schema_status
  version="$(installed_app_version)"
  build="$(grep -E '^buildDate=' "${SCOPE_ROOT}/.version" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  manifest="${SCOPE_ROOT}/release-manifest.json"
  runtime_marker="${SCOPE_ROOT}/.runtime-identity.json"
  provenance_file="${SCOPE_ROOT}/.release-provenance.json"
  manifest_product=""
  manifest_version=""
  manifest_min=""
  runtime_product=""
  runtime_system_type=""
  if [ -f "$manifest" ]; then
    manifest_product="$(grep -oP '"product"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
    manifest_version="$(grep -oP '"version"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
    manifest_min="$(grep -oP '"minSupportedVersion"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  fi
  if [ -f "$runtime_marker" ]; then
    runtime_product="$(grep -oP '"product"\s*:\s*"\K[^"]+' "$runtime_marker" 2>/dev/null | head -1 || true)"
    runtime_system_type="$(grep -oP '"systemType"\s*:\s*"\K[^"]+' "$runtime_marker" 2>/dev/null | head -1 || true)"
  fi
  lppadmin_ver="$LPPADMIN_VERSION"
  mig_table="absent"
  mig_count="0"
  schema_tables="n/a"
  schema_columns="n/a"
  schema_enums="n/a"
  schema_constraints="n/a"
  schema_indexes="n/a"
  schema_status="DATABASE_URL or psql unavailable"
  if command -v psql >/dev/null 2>&1; then
    local db_url
    db_url="$(env_get DATABASE_URL)"
    if [ -n "$db_url" ]; then
      schema_tables="$(psql "$db_url" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d '[:space:]' || true)"
      schema_columns="$(psql "$db_url" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public';" 2>/dev/null | tr -d '[:space:]' || true)"
      schema_enums="$(psql "$db_url" -tAc "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname='public' AND t.typtype='e';" 2>/dev/null | tr -d '[:space:]' || true)"
      schema_constraints="$(psql "$db_url" -tAc "SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace WHERE nsp.nspname='public' AND con.contype IN ('p','u','f','c');" 2>/dev/null | tr -d '[:space:]' || true)"
      schema_indexes="$(psql "$db_url" -tAc "SELECT count(*) FROM pg_indexes WHERE schemaname='public';" 2>/dev/null | tr -d '[:space:]' || true)"
      if [ -n "$schema_tables" ] && [ -n "$schema_columns" ] && [ -n "$schema_enums" ]; then
        schema_status="ok"
      else
        schema_status="query failed"
      fi
      if psql "$db_url" -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='__drizzle_migrations')" 2>/dev/null | grep -q "t"; then
        mig_table="present"
        mig_count="$(psql "$db_url" -tAc "SELECT COUNT(*) FROM __drizzle_migrations" 2>/dev/null | tr -d '[:space:]' || echo "0")"
      fi
    fi
  fi

  out=""
  out+="Scope: ${SCOPE}"$'\n'
  out+="RuntimeRoot: ${SCOPE_ROOT}"$'\n'
  out+="Version: $(display_release_version "${version}")"$'\n'
  out+="VersionRaw: ${version}"$'\n'
  out+="BuildDate: ${build:-unknown}"$'\n'
  out+="Manifest: ${manifest}"$'\n'
  out+="ManifestProduct: ${manifest_product:-missing}"$'\n'
  out+="ManifestVersion: $(display_release_version "${manifest_version:-missing}")"$'\n'
  out+="ManifestVersionRaw: ${manifest_version:-missing}"$'\n'
  out+="ManifestMinSupported: ${manifest_min:-missing}"$'\n'
  out+="RuntimeMarker: ${runtime_marker}"$'\n'
  out+="RuntimeProduct: ${runtime_product:-missing}"$'\n'
  out+="RuntimeSystemType: ${runtime_system_type:-n/a}"$'\n'
  out+="ProvenanceFile: ${provenance_file}"$'\n'
  out+="DrizzleMigrationsTable: ${mig_table}"$'\n'
  out+="DrizzleMigrationsCount: ${mig_count}"$'\n'
  out+="SchemaStatus: ${schema_status}"$'\n'
  out+="SchemaTables: ${schema_tables:-n/a}"$'\n'
  out+="SchemaColumns: ${schema_columns:-n/a}"$'\n'
  out+="SchemaEnums: ${schema_enums:-n/a}"$'\n'
  out+="SchemaConstraints: ${schema_constraints:-n/a}"$'\n'
  out+="SchemaIndexes: ${schema_indexes:-n/a}"$'\n'
  out+="LppadminVersion: ${lppadmin_ver}"$'\n'
  out+="BackupRoot: ${BACKUP_ROOT}"$'\n'
  ui_textbox "${SCOPE_LABEL} Rollout Verification" "$out" 30 110
}

backup_root_status() {
  local resolved expected
  resolved="$(resolve_backup_root_base "${BACKUP_ROOT:-/lppbackups}")"
  if [ "$SCOPE" = "cloud" ]; then
    expected="/opt/lpdb/lppbackups/cloud"
  else
    expected="/opt/lpdb/lppbackups/onprem"
  fi
  local out=""
  out+="Configured BACKUP_ROOT: ${BACKUP_ROOT}"$'\n'
  out+="Resolved BACKUP_ROOT: ${resolved}"$'\n'
  out+="Scope fallback path: ${expected}"$'\n'
  if [ -w "$resolved" ]; then
    out+="Writable: yes"$'\n'
  else
    out+="Writable: no"$'\n'
  fi
  ui_textbox "${SCOPE_LABEL} Backup Root Status" "$out" 16 100
}

verify_package() {
  prepare_update_dist_dir_for_scope || return 1
  local dist_dir expected_product manifest version min_supported product out
  dist_dir="${LPP_PREPARED_UPDATE_DIST_DIR:-}"
  manifest="${dist_dir}/release-manifest.json"
  expected_product="$SCOPE"
  out=""
  out+="Distribution: ${dist_dir}"$'\n'
  out+="Manifest: ${manifest}"$'\n'
  if [ ! -f "$manifest" ]; then
    err "Manifest not found: $manifest"
    return 1
  fi
  version="$(grep -oP '"version"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  min_supported="$(grep -oP '"minSupportedVersion"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  product="$(grep -oP '"product"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  out+="Product: ${product}"$'\n'
  out+="Version: $(display_release_version "${version}")"$'\n'
  out+="VersionRaw: ${version}"$'\n'
  out+="MinSupported: ${min_supported}"$'\n'
  if [ "$product" != "$expected_product" ]; then
    out+=$'\n'"Result: FAIL (expected product=${expected_product})"
    ui_textbox "${SCOPE_LABEL} Verify Package" "$out" 18 100
    return 1
  fi
  out+=$'\n'"Result: PASS"
  ui_textbox "${SCOPE_LABEL} Verify Package" "$out" 18 100
}

update_preflight() {
  local dist_dir manifest product version min_supported checksum_file expected_product out free_mb
  expected_product="$SCOPE"
  if ! prepare_update_dist_dir_for_scope; then
    return 1
  fi
  dist_dir="${LPP_PREPARED_UPDATE_DIST_DIR:-}"
  manifest="${dist_dir}/release-manifest.json"
  checksum_file="${dist_dir}/package-checksums.sha256"
  free_mb="$(df -m "$SCOPE_ROOT" 2>/dev/null | awk 'NR==2{print $4}' || echo "0")"

  out=""
  out+="Scope: ${SCOPE}"$'\n'
  out+="RuntimeRoot: ${SCOPE_ROOT}"$'\n'
  out+="DistDir: ${dist_dir}"$'\n'
  out+="DiskFreeMB: ${free_mb}"$'\n'
  out+="ManifestExists: $([ -f "$manifest" ] && echo yes || echo no)"$'\n'
  out+="ChecksumsExists: $([ -f "$checksum_file" ] && echo yes || echo no)"$'\n'

  if [ ! -f "$manifest" ]; then
    out+=$'\n'"Result: FAIL (manifest missing)"
    ui_textbox "${SCOPE_LABEL} Update Preflight" "$out" 20 110
    return 1
  fi

  product="$(grep -oP '"product"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  version="$(grep -oP '"version"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  min_supported="$(grep -oP '"minSupportedVersion"\s*:\s*"\K[^"]+' "$manifest" 2>/dev/null | head -1 || true)"
  out+="ManifestProduct: ${product:-missing}"$'\n'
  out+="ManifestVersion: ${version:-missing}"$'\n'
  out+="ManifestMinSupported: ${min_supported:-missing}"$'\n'

  if [ "$product" != "$expected_product" ]; then
    out+=$'\n'"Result: FAIL (expected product=${expected_product}, got ${product:-missing})"
    ui_textbox "${SCOPE_LABEL} Update Preflight" "$out" 22 110
    return 1
  fi

  if [ -f "$checksum_file" ] && command -v sha256sum >/dev/null 2>&1; then
    if (cd "$dist_dir" && sha256sum -c "$(basename "$checksum_file")" >/dev/null 2>&1); then
      out+="ChecksumValidation: pass"$'\n'
    else
      out+="ChecksumValidation: fail"$'\n'
      out+=$'\n'"Result: FAIL (checksum validation failed)"
      ui_textbox "${SCOPE_LABEL} Update Preflight" "$out" 22 110
      return 1
    fi
  else
    out+="ChecksumValidation: skipped"$'\n'
  fi

  out+=$'\n'"Result: PASS"
  ui_textbox "${SCOPE_LABEL} Update Preflight" "$out" 22 110
}

install_global_command() {
  local target="/usr/local/bin/lppadmin"
  local runtime_script=""
  if [ -n "${SCOPE_SCRIPTS:-}" ]; then
    runtime_script="${SCOPE_SCRIPTS}/lppadmin.sh"
  fi
  local installed_cloud_script="${INSTALLED_CLOUD_ROOT}/scripts/lppadmin.sh"
  local installed_onprem_script="${INSTALLED_ONPREM_ROOT}/scripts/lppadmin.sh"
  local is_ephemeral_runtime=0
  case "${runtime_script:-}" in
    /tmp/*|/var/tmp/*) is_ephemeral_runtime=1 ;;
  esac
  case "${SELF_SCRIPT_PATH:-}" in
    /tmp/*|/var/tmp/*) is_ephemeral_runtime=1 ;;
  esac
  if [ "$is_ephemeral_runtime" -eq 1 ]; then
    if [ "${SCOPE:-}" = "onprem" ]; then
      runtime_script="$installed_onprem_script"
    else
      runtime_script="$installed_cloud_script"
    fi
  fi
  local resolved_script=""
  if [ -n "$runtime_script" ] && [ -f "$SELF_SCRIPT_PATH" ]; then
    run_cmd_step_sh "Ensure runtime script directory exists" "mkdir -p '$(dirname "$runtime_script")'" || return 1
    run_cmd_step "Install runtime lppadmin script" install -m 755 "$SELF_SCRIPT_PATH" "$runtime_script" || return 1
    run_cmd_step_sh "Verify runtime lppadmin script is executable" "test -x '$runtime_script'" || return 1
    resolved_script="$runtime_script"
  elif [ -n "$runtime_script" ] && [ -f "$runtime_script" ]; then
    resolved_script="$runtime_script"
  elif [ -f "$SELF_SCRIPT_PATH" ]; then
    resolved_script="$SELF_SCRIPT_PATH"
  fi
  if [ -z "$resolved_script" ]; then
    err "Unable to locate lppadmin.sh to install command symlink."
    return 1
  fi

  run_cmd_step_sh "Install /usr/local/bin/lppadmin symlink" "ln -sfn '$resolved_script' '$target'" || return 1
  run_cmd_step_sh "Verify lppadmin is executable" "test -x '$target'" || return 1
  run_cmd_step_sh "Verify symlink target" "[ \"\$(readlink -f '$target')\" = \"\$(readlink -f '$resolved_script')\" ]" || return 1
  run_cmd_step_sh "Show installed lppadmin header" "head -n 8 '$resolved_script'" || return 1
  local motd_src="${SCOPE_SCRIPTS}/learnplay-motd.sh"
  if [ ! -f "$motd_src" ] && [ -f "${SELF_SCRIPT_DIR}/learnplay-motd.sh" ]; then
    motd_src="${SELF_SCRIPT_DIR}/learnplay-motd.sh"
  fi
  if [ -f "$motd_src" ]; then
    run_cmd_step "Install/update login MOTD script" install -m 755 "$motd_src" /etc/profile.d/learnplay-motd.sh || return 1
  else
    warn "MOTD source missing: $motd_src"
  fi
  ensure_tls_automation_installed || true
  action_report_set_summary "lppadmin installed at $target, MOTD refreshed, cert auto-renew policy ensured."
  ok "Installed $target"
}

show_help() {
  local help_text
  if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
    help_text="$(cat <<HELP
LearnPlay lppadmin ${LPPADMIN_VERSION}

Installed runtime mode:
  - Menus are limited to production operations (health, services, backups, TLS, secrets, env edits).
  - Workspace/developer actions are hidden on installed systems.
  - Scope visibility depends on what is installed on this host.

Notes:
  - Cloud installs use /opt/learnplay/cloud (legacy: /opt/learnplay).
  - OnPrem installs use /opt/learnplay/onprem (legacy: /opt/learnplay-onprem).
  - Runtime service is auto-detected (usually pm2-managed).
HELP
)"
  else
    help_text="$(cat <<HELP
LearnPlay lppadmin ${LPPADMIN_VERSION}

Menu areas:
  1) Cloud dashboard
  2) System Administration (status, health, preflight, repair, services)
  3) Database Administration (status, backups, migrations, slow queries, maintenance)
  4) Security Administration (secrets, audits, TLS manager, renew checks)
  5) Application Administration (app health + integration tests)
  6) Performance Administration (analysis + approve/apply tuning)
  7) Environment Administration (defaults, env edits, setup)
  8) Backup & Recovery (full backup, rollback, integrity verification)
  9) Maintenance Administration (history, alerts, compatibility, install wizard)
 10) Infisical OSS quickstart help

Notes:
  - Public HTTPS uses port 443 only.
  - Internal app ports default to 8000 (Cloud) and 9000 (OnPrem).
  - Dev TLS defaults to self-signed unless changed.
HELP
)"
  fi
  if [ "$USE_WHIPTAIL" -eq 1 ]; then
    whiptail --title "lppadmin Help" --msgbox "$help_text" 22 100 || true
  else
    echo "$help_text"
  fi
}

show_cli_help() {
  cat <<HELP
LearnPlay lppadmin ${LPPADMIN_VERSION}

Usage:
  sudo lppadmin [cloud|onprem] [command]
  sudo lppadmin help

Common commands:
  help                 Show this command reference
  menu                 Open interactive lppadmin menu
  dashboard            Show dashboard summary
  status               Show system status overview
  health               Run system health checks
  logs                 Show last 200 lines of app service journal logs
  start                Start app service (${SCOPE_SERVICE:-auto})
  stop                 Stop app service (${SCOPE_SERVICE:-auto})
  restart              Restart app service (${SCOPE_SERVICE:-auto})
  stack-start          Start full stack components
  stack-stop           Stop full stack components
  stack-restart        Restart full stack components
  secrets              Open secrets quick-access menu
  update               Run package updater (component selection menu)
  update-app-db        Run updater for application + database component
  update-lppadmin      Run updater for lppadmin command component
  update-os-packages   Apply OS package updates only (apt-based)
  patch-check          Check latest OS/runtime package patch levels and write report
  patch-apply          Apply latest OS/runtime package patches with preflight checks
  patch-report         Show security patch report history and latest details
  install-command      Install/update /usr/local/bin/lppadmin command
  runtime-version      Show installed runtime version and manifest details
  parity-report        Show runtime parity/provenance summary
  verify-package       Validate current update package manifest for selected scope
  update-preflight     Validate package + runtime preflight gates before update
  backup-root-status   Show effective backup root and fallback selection
  self-check           Print lppadmin scope/profile diagnostics

Examples:
  sudo lppadmin
  sudo lppadmin cloud
  sudo lppadmin onprem
  sudo lppadmin cloud status
  sudo lppadmin cloud logs
  sudo lppadmin onprem update-app-db
  sudo lppadmin cloud update-lppadmin
  sudo lppadmin onprem update-os-packages
  sudo lppadmin onprem patch-check
  sudo lppadmin onprem patch-apply
  sudo lppadmin onprem patch-report

Notes:
  - If scope is omitted, onprem is used by default (cloud fallback if onprem is unavailable).
  - If command is omitted for an explicit scope, menu is used by default.
  - Dev workspace requires explicit scope argument (cloud or onprem).
  - Updater expects package extracted at /tmp/dist-cloud (or /tmp/dist-cloud-*),
    or LEARNPLAY_DIST_DIR set explicitly.
HELP
}

find_latest_update_tarball() {
  local latest=""
  latest="$(ls -1t /tmp/learnplay*.tar.gz 2>/dev/null | head -1 || true)"
  echo "$latest"
}

resolve_update_dist_dir_for_scope() {
  local expected_dir="/tmp/dist-cloud"
  if [ "$SCOPE" = "onprem" ]; then
    expected_dir="/tmp/dist-onprem"
  fi

  if [ -n "${LEARNPLAY_DIST_DIR:-}" ] && [ -d "${LEARNPLAY_DIST_DIR}/server" ] && [ -f "${LEARNPLAY_DIST_DIR}/package.json" ]; then
    echo "$LEARNPLAY_DIST_DIR"
    return 0
  fi

  if [ -d "${expected_dir}/server" ] && [ -f "${expected_dir}/package.json" ]; then
    echo "$expected_dir"
    return 0
  fi

  local glob_dir=""
  if [ "$SCOPE" = "onprem" ]; then
    glob_dir="$(ls -1dt /tmp/dist-onprem-* 2>/dev/null | head -1 || true)"
  else
    glob_dir="$(ls -1dt /tmp/dist-cloud-* 2>/dev/null | head -1 || true)"
  fi
  if [ -n "$glob_dir" ] && [ -d "${glob_dir}/server" ] && [ -f "${glob_dir}/package.json" ]; then
    echo "$glob_dir"
    return 0
  fi

  return 1
}

extract_update_package_for_scope() {
  local tarball="$1"
  local expected_subdir="dist-cloud"
  if [ "$SCOPE" = "onprem" ]; then
    expected_subdir="dist-onprem"
  fi
  local ts tmp_root dist_dir
  ts="$(date '+%Y%m%d_%H%M%S')"
  tmp_root="/tmp/lppadmin-update-${SCOPE}-${ts}"
  dist_dir="${tmp_root}/${expected_subdir}"

  mkdir -p "$tmp_root"
  run_cmd_step_sh "Extract update package $(basename "$tarball")" "tar xzf '$tarball' -C '$tmp_root'" || return 1

  if [ -d "${dist_dir}/server" ] && [ -f "${dist_dir}/package.json" ]; then
    LPP_PREPARED_UPDATE_DIST_DIR="$dist_dir"
    return 0
  fi

  local discovered
  discovered="$(find "$tmp_root" -maxdepth 3 -type d -name "$expected_subdir" | head -1 || true)"
  if [ -n "$discovered" ] && [ -d "${discovered}/server" ] && [ -f "${discovered}/package.json" ]; then
    LPP_PREPARED_UPDATE_DIST_DIR="$discovered"
    return 0
  fi

  err "Extracted package does not contain ${expected_subdir}/server and ${expected_subdir}/package.json"
  return 1
}

prepare_update_dist_dir_for_scope() {
  local dist_dir tarball

  # Explicit override always wins.
  if [ -n "${LEARNPLAY_DIST_DIR:-}" ] && [ -d "${LEARNPLAY_DIST_DIR}/server" ] && [ -f "${LEARNPLAY_DIST_DIR}/package.json" ]; then
    LPP_PREPARED_UPDATE_DIST_DIR="$LEARNPLAY_DIST_DIR"
    return 0
  fi

  dist_dir="$(resolve_update_dist_dir_for_scope || true)"
  tarball="$(find_latest_update_tarball)"

  # If a tarball exists and is newer than the extracted dist dir (or no dist dir exists),
  # extract and use the tarball so update flows pick up the latest uploaded package.
  if [ -n "$tarball" ] && { [ -z "$dist_dir" ] || [ "$tarball" -nt "$dist_dir" ]; }; then
    echo "Using update package (newer tarball detected): $tarball" >&2
    extract_update_package_for_scope "$tarball" || return 1
    [ -n "${LPP_PREPARED_UPDATE_DIST_DIR:-}" ] || return 1
    return 0
  fi

  if [ -n "$dist_dir" ]; then
    LPP_PREPARED_UPDATE_DIST_DIR="$dist_dir"
    return 0
  fi

  if [ -z "$tarball" ]; then
    err "No extracted dist directory found and no /tmp/learnplay*.tar.gz package is available."
    return 1
  fi

  # No extracted dist dir found; fall back to latest available tarball.
  echo "Using update package: $tarball" >&2
  extract_update_package_for_scope "$tarball" || return 1
  [ -n "${LPP_PREPARED_UPDATE_DIST_DIR:-}" ]
}

run_update_component() {
  local component="$1"
  local update_script="$SCOPE_SCRIPTS/update.sh"
  local dist_dir
  local actor_override="${LEARNPLAY_UPDATE_ACTOR_OVERRIDE:-}"
  prepare_update_dist_dir_for_scope || return 1
  dist_dir="${LPP_PREPARED_UPDATE_DIST_DIR:-}"
  if [ -z "$dist_dir" ]; then
    err "Failed to resolve update distribution directory."
    return 1
  fi
  if [ -f "$dist_dir/scripts/update.sh" ]; then
    update_script="$dist_dir/scripts/update.sh"
  fi
  if [ ! -f "$update_script" ]; then
    err "Update script not found: $update_script"
    return 1
  fi
  action_report_add_text "Using distribution directory: $dist_dir"
  action_report_add_text "Using update script: $update_script"
  if [ -z "$actor_override" ] || [ "$actor_override" = "root" ]; then
    if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
      actor_override="$SUDO_USER"
    else
      actor_override="$(resolve_workspace_user "$SCOPE_ROOT")"
    fi
  fi
  if [ -z "$actor_override" ] || [ "$actor_override" = "root" ]; then
    actor_override="lppadmin"
  fi
  action_report_add_text "Update actor override: $actor_override"
  run_cmd_step_sh "Run update script (--component ${component})" \
    "LEARNPLAY_UPDATE_ACTOR_OVERRIDE='$actor_override' LEARNPLAY_DIST_DIR='$dist_dir' bash '$update_script' --yes --component '$component'" || return 1
}

run_cli_command() {
  local cmd="$1"
  local arg2="${2:-}"

  USE_WHIPTAIL=0
  USE_DIALOG=0

  if [ "$cmd" = "cloud" ] || [ "$cmd" = "onprem" ]; then
    select_scope "$cmd" || return 1
    cmd="${arg2:-menu}"
  else
    if [ "$LPPADMIN_PROFILE" = "dev_workspace" ]; then
      err "Dev workspace requires explicit scope. Example: sudo lppadmin cloud status"
      return 1
    fi
    # Default scope for no explicit scope is onprem, then cloud fallback.
    select_scope onprem || select_scope cloud
  fi

  case "$cmd" in
    help|-h|--help) show_cli_help ;;
    menu) main_menu_v2 ;;
    dashboard) main_dashboard ;;
    status) system_status_overview ;;
    health) system_health_check ;;
    logs) service_action logs ;;
    start) service_action start ;;
    stop) service_action stop ;;
    restart) service_action restart ;;
    stack-start) stack_action start ;;
    stack-stop) stack_action stop ;;
    stack-restart) stack_action restart ;;
    secrets) secrets_menu ;;
    backup) create_complete_system_backup ;;
    dr-backup) create_disaster_recovery_backup_full ;;
    update) apply_update_package ;;
    update-app-db) run_safe "Update app and database" run_update_component app-db ;;
    update-lppadmin) run_safe "Update lppadmin command" run_update_component lppadmin ;;
    update-os-packages) run_safe "Update OS packages only" update_system_packages ;;
    patch-check) run_safe "Security patch check" security_patch_check_updates ;;
    patch-apply) run_safe "Security patch apply" security_patch_apply_updates ;;
    patch-report) run_safe "Security patch report" security_patch_update_report ;;
    install-command) run_safe "Install/update lppadmin command" install_global_command ;;
    runtime-version) run_safe "Runtime version report" runtime_version_report ;;
    parity-report) run_safe "Parity report" parity_report ;;
    rollout-verify) run_safe "Rollout verification" parity_report ;;
    verify-package) run_safe "Verify package" verify_package ;;
    update-preflight) run_safe "Update preflight" update_preflight ;;
    backup-root-status) run_safe "Backup root status" backup_root_status ;;
    self-check)
      echo "LPPADMIN_PROFILE=${LPPADMIN_PROFILE}"
      echo "HAS_CLOUD_SCOPE=${HAS_CLOUD_SCOPE}"
      echo "HAS_ONPREM_SCOPE=${HAS_ONPREM_SCOPE}"
      echo "ACTIVE_SCOPE=${SCOPE:-unset}"
      echo "CLOUD_ROOT=${CLOUD_ROOT}"
      echo "ONPREM_ROOT=${ONPREM_ROOT}"
      ;;
    *)
      err "Unknown command: $cmd"
      echo ""
      show_cli_help
      return 1
      ;;
  esac
}

show_infisical_help() {
  local inf_text
  inf_text="$(cat <<INF
Infisical OSS (recommended path):

1. Deploy Infisical server (self-hosted) and create project environments.
2. Store secrets (GEMINI_API_KEY, MAILERSEND_API_KEY, SESSION_SECRET, etc.).
3. Install CLI on app host and authenticate service identity.
4. Sync secrets into runtime env before starting service:
   infisical run --env=dev -- npm run dev
5. In production, replace direct .env usage with Infisical injection in systemd.

Current status in this workspace:
  - .env remains the active source of truth.
  - lppadmin backups and rollback protect .env changes.
  - Infisical integration can be added without breaking current workflows.
INF
)"
  if [ "$USE_WHIPTAIL" -eq 1 ]; then
    whiptail --title "Infisical Guide" --msgbox "$inf_text" 22 100 || true
  else
    echo "$inf_text"
  fi
}

check_admin_parity() {
  # Intentionally no-op. Cloud and OnPrem admin tools are independent.
  return 0
}

database_status_overview() {
  ensure_env_exists
  local db_url db_port pg_active pg_enabled conn_state conn_detail
  db_url="$(env_get DATABASE_URL)"
  db_port="$(parse_db_port_from_url "$db_url")"
  pg_active="$(postgres_service_active_state)"
  pg_enabled="$(postgres_service_enabled_state)"

  if [ -z "$db_url" ]; then
    conn_state="FAIL"
    conn_detail="DATABASE_URL is missing"
  elif ! command -v psql >/dev/null 2>&1; then
    conn_state="WARN"
    conn_detail="psql is not installed"
  elif psql "$db_url" -c "select now();" >/dev/null 2>&1; then
    conn_state="OK"
    conn_detail="Connection successful"
  else
    conn_state="FAIL"
    conn_detail="Connection failed"
  fi

  local out=""
  out+="${SCOPE_LABEL} Database Status"$'\n'
  out+="Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"$'\n'
  out+=$'\n'
  out+="$(printf "%-28s | %-12s | %-28s" "CHECK" "STATE" "DETAIL")"$'\n'
  out+="$(printf "%-28s-+-%-12s-+-%-28s" "----------------------------" "------------" "----------------------------")"$'\n'
  out+="$(printf "%-28s | %-12s | %-28s" "PostgreSQL service active" "${pg_active:-unknown}" "$(postgres_service_target)")"$'\n'
  out+="$(printf "%-28s | %-12s | %-28s" "PostgreSQL service enabled" "${pg_enabled:-unknown}" "$(postgres_service_target)")"$'\n'
  out+="$(printf "%-28s | %-12s | %-28s" "Database port ${db_port}" "$(port_listening_state "$db_port")" "listener check")"$'\n'
  out+="$(printf "%-28s | %-12s | %-28s" "DB connectivity test" "$conn_state" "$conn_detail")"$'\n'
  out+=$'\n'
  out+="DATABASE_URL"$'\n'
  out+="  ${db_url:-unset}"$'\n'

  ui_textbox "${SCOPE_LABEL} Database Status" "$out" 24 110
}

database_backup_now() {
  ensure_env_exists
  local db_url
  db_url="$(env_get DATABASE_URL)"
  if [ -z "$db_url" ]; then
    err "DATABASE_URL is missing."
    return 1
  fi
  if ! command -v pg_dump >/dev/null 2>&1; then
    err "pg_dump is not installed."
    return 1
  fi

  local ts out_file db_dir
  ts="$(date '+%Y%m%d_%H%M%S')"
  db_dir="${BACKUP_ROOT}/${SCOPE}/database"
  mkdir -p "$db_dir"
  if [ "${BACKUP_COMPRESS}" = "true" ]; then
    out_file="${db_dir}/${SCOPE}_db_${ts}.sql.gz"
    run_cmd_step_sh "Create compressed database backup" \
      "set -o pipefail && pg_dump \"$db_url\" | gzip -c > \"$out_file\"" || return 1
  else
    out_file="${db_dir}/${SCOPE}_db_${ts}.sql"
    run_cmd_step_sh "Create database backup" \
      "pg_dump \"$db_url\" > \"$out_file\"" || return 1
  fi

  local size sum
  size="$(du -h "$out_file" | awk '{print $1}')"
  sum="$(sha256sum "$out_file" | awk '{print $1}')"
  ok "Database backup created: $out_file"
  show_action_result "${SCOPE_LABEL} Database Backup" "Backup completed successfully.\n\nFile: ${out_file}\nSize: ${size}\nSHA256: ${sum}"
  apply_retention_policy
}

list_database_backups() {
  local db_dir out
  db_dir="${BACKUP_ROOT}/${SCOPE}/database"
  mkdir -p "$db_dir"
  out="${SCOPE_LABEL} Database Backups"$'\n\n'
  if ls -1 "$db_dir" >/dev/null 2>&1; then
    out+="$(ls -lh "$db_dir" | sed -n '1,200p')"
  else
    out+="No backups found in ${db_dir}"
  fi
  ui_textbox "${SCOPE_LABEL} DB Backups" "$out" 28 120
}

restore_database_backup() {
  ensure_env_exists
  local db_url db_dir files backup selected tmp_sql
  db_url="$(env_get DATABASE_URL)"
  [ -n "$db_url" ] || { err "DATABASE_URL missing."; return 1; }
  db_dir="${BACKUP_ROOT}/${SCOPE}/database"
  mkdir -p "$db_dir"
  mapfile -t files < <(ls -1t "$db_dir" 2>/dev/null | head -50)
  if [ "${#files[@]}" -eq 0 ]; then
    err "No database backups found in $db_dir"
    return 1
  fi

  if [ "$USE_WHIPTAIL" -eq 1 ]; then
    local items=()
    for backup in "${files[@]}"; do
      items+=("$backup" "")
    done
    selected="$(whiptail --title "${SCOPE_LABEL} DB Restore" --menu "Select backup to restore into ${db_url}" 28 120 16 "${items[@]}" 3>&1 1>&2 2>&3)" || return 0
  else
    local menu=()
    for backup in "${files[@]}"; do
      menu+=("$backup" "")
    done
    selected="$(ui_menu "${SCOPE_LABEL} DB Restore" "Select backup to restore into ${db_url}" "${menu[@]}")"
  fi

  [ -n "$selected" ] || return 0
  backup="${db_dir}/${selected}"
  [ -f "$backup" ] || { err "Selected backup not found: $backup"; return 1; }

  preflight_gate_for_risky_action "db-restore" || return 1

  tmp_sql="$(mktemp)"
  if [[ "$backup" == *.gz ]]; then
    gzip -dc "$backup" > "$tmp_sql"
  else
    cp "$backup" "$tmp_sql"
  fi

  if run_cmd_step_sh "Restore database from backup into target DB" \
    "set -o pipefail && psql \"$db_url\" -v ON_ERROR_STOP=1 -f \"$tmp_sql\" | tee /tmp/lpp_db_restore.log"; then
    rm -f "$tmp_sql"
    show_action_result "${SCOPE_LABEL} Database Restore" "Restore completed successfully.\n\nBackup: ${backup}\nTarget DB: ${db_url}\nLog: /tmp/lpp_db_restore.log"
  else
    rm -f "$tmp_sql"
    err "Restore failed. See /tmp/lpp_db_restore.log"
    return 1
  fi
}

database_migrations_status() {
  ensure_env_exists
  local db_url out
  db_url="$(env_get DATABASE_URL)"
  if [ -z "$db_url" ]; then
    err "DATABASE_URL missing."
    return 1
  fi
  out="${SCOPE_LABEL} Migration Status"$'\n\n'
  if psql "$db_url" -tAc "SELECT to_regclass('public.__drizzle_migrations');" 2>/dev/null | grep -q "__drizzle_migrations"; then
    out+="Drizzle migrations table found."$'\n\n'
    out+="$(psql "$db_url" -P pager=off -c "SELECT * FROM __drizzle_migrations ORDER BY 1 DESC LIMIT 30;" 2>/dev/null || echo 'Failed to query migration rows')"
  else
    out+="No __drizzle_migrations table found."$'\n'
  fi
  ui_textbox "${SCOPE_LABEL} Migrations" "$out" 28 120
}

database_table_row_counts() {
  ensure_env_exists
  local db_url out
  db_url="$(env_get DATABASE_URL)"
  [ -n "$db_url" ] || { err "DATABASE_URL missing."; return 1; }
  out="${SCOPE_LABEL} Table Row Counts (Top 40)"$'\n\n'
  out+="$(psql "$db_url" -P pager=off -c 'SELECT relname AS table, n_live_tup::bigint AS est_rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC NULLS LAST LIMIT 40;' 2>/dev/null || echo 'Query failed')"
  ui_textbox "${SCOPE_LABEL} Table Row Counts" "$out" 28 120
}

database_slow_query_snapshot() {
  ensure_env_exists
  local db_url out snapshot_rows
  db_url="$(env_get DATABASE_URL)"
  [ -n "$db_url" ] || { err "DATABASE_URL missing."; return 1; }
  out="${SCOPE_LABEL} Slow Query Snapshot"$'\n\n'
  if ! ensure_pg_stat_statements_enabled "$db_url" "report"; then
    out+="Slow query analytics are unavailable because pg_stat_statements could not be enabled automatically."$'\n'
    out+=$'\n'"What lppadmin attempted:"$'\n'
    out+="- Configure shared_preload_libraries to include pg_stat_statements"$'\n'
    out+="- Restart PostgreSQL"$'\n'
    out+="- Create extension pg_stat_statements"$'\n'
    out+=$'\n'"Check Action Report details for exact command errors."$'\n'
    action_report_set_summary "Slow query snapshot unavailable: failed to auto-enable pg_stat_statements."
    ui_textbox "${SCOPE_LABEL} Slow Queries" "$out" 28 120
    return 1
  fi

  snapshot_rows="$(psql "$db_url" -P pager=off -c "SELECT LEFT(query,120) AS query, calls, ROUND(total_exec_time::numeric,2) AS total_ms, ROUND((total_exec_time/calls)::numeric,2) AS avg_ms FROM pg_stat_statements WHERE calls > 0 ORDER BY total_exec_time DESC NULLS LAST LIMIT 20;" 2>/dev/null || true)"
  if [ -n "${snapshot_rows// }" ]; then
    action_report_add_text "[Step $((ACTION_STEPS + 1))] Read slow query snapshot rows"
    action_report_add_text "Command: psql DATABASE_URL -c SELECT ... FROM pg_stat_statements ..."
    action_report_add_text "Output:"
    action_report_add_text "$snapshot_rows"
    ACTION_STEPS=$((ACTION_STEPS + 1))
    out+="$snapshot_rows"
    action_report_set_summary "Slow query snapshot collected successfully from pg_stat_statements."
  else
    out+="pg_stat_statements is enabled, but no query statistics are available yet."$'\n'
    out+="Run normal application workload, then retry snapshot."$'\n'
    action_report_set_summary "pg_stat_statements is enabled; no slow-query rows available yet."
  fi
  ui_textbox "${SCOPE_LABEL} Slow Queries" "$out" 28 120
}

ensure_pg_stat_statements_enabled() {
  local db_url="$1"
  local mode="${2:-silent}"
  local ext_present current_preload new_preload

  ext_present="$(psql "$db_url" -tAc "SELECT extname FROM pg_extension WHERE extname='pg_stat_statements';" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$ext_present" = "pg_stat_statements" ]; then
    return 0
  fi

  current_preload="$(psql "$db_url" -tAc "SHOW shared_preload_libraries;" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ ",${current_preload}," != *",pg_stat_statements,"* ]]; then
    if [ -n "$current_preload" ]; then
      new_preload="${current_preload},pg_stat_statements"
    else
      new_preload="pg_stat_statements"
    fi

    if [ "$mode" = "report" ]; then
      run_cmd_step "Configure shared_preload_libraries for pg_stat_statements" \
        psql "$db_url" -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET shared_preload_libraries='${new_preload}';" || return 1
      run_cmd_step "Restart $(postgres_service_target) to apply preload libraries" systemctl restart "$(postgres_service_target)" || return 1
    else
      psql "$db_url" -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET shared_preload_libraries='${new_preload}';" >/dev/null 2>&1 || return 1
      systemctl restart "$(postgres_service_target)" >/dev/null 2>&1 || return 1
    fi
  fi

  if [ "$mode" = "report" ]; then
    run_cmd_step "Enable extension pg_stat_statements" \
      psql "$db_url" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" || return 1
  else
    psql "$db_url" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" >/dev/null 2>&1 || return 1
  fi

  ext_present="$(psql "$db_url" -tAc "SELECT extname FROM pg_extension WHERE extname='pg_stat_statements';" 2>/dev/null | tr -d '[:space:]' || true)"
  [ "$ext_present" = "pg_stat_statements" ]
}

enable_slow_query_extension() {
  ensure_env_exists
  local db_url
  db_url="$(env_get DATABASE_URL)"
  [ -n "$db_url" ] || { err "DATABASE_URL missing."; return 1; }
  if ! ui_yesno "${SCOPE_LABEL} Enable Slow Query Extension" "This will ensure slow-query analytics are fully enabled:\n\n1) Configure shared_preload_libraries to include pg_stat_statements\n2) Restart $(postgres_service_target) (if config changed)\n3) CREATE EXTENSION IF NOT EXISTS pg_stat_statements\n\nProceed?"; then
    return 0
  fi
  if ensure_pg_stat_statements_enabled "$db_url" "report"; then
    action_report_set_summary "pg_stat_statements is enabled and ready for slow-query snapshots."
    show_action_result "${SCOPE_LABEL} Slow Query Extension" "Slow-query analytics are enabled.\n\npg_stat_statements is now ready.\nIf snapshot has no rows yet, run workload and retry."
  else
    action_report_set_summary "Failed to fully enable pg_stat_statements. Command diagnostics were captured."
    err "Failed to enable pg_stat_statements. See Action Report for exact command output."
    return 1
  fi
}

database_vacuum_analyze() {
  ensure_env_exists
  local db_url
  db_url="$(env_get DATABASE_URL)"
  [ -n "$db_url" ] || { err "DATABASE_URL missing."; return 1; }
  if ! ui_yesno "${SCOPE_LABEL} VACUUM ANALYZE" "This runs PostgreSQL VACUUM (ANALYZE) to reclaim space and refresh query planner statistics.\n\nProceed on database:\n${db_url}"; then
    return 0
  fi
  local started ended
  started="$(date '+%Y-%m-%d %H:%M:%S')"
  if run_cmd_step "Run VACUUM (ANALYZE)" psql "$db_url" -c "VACUUM (ANALYZE);"; then
    ended="$(date '+%Y-%m-%d %H:%M:%S')"
    ok "VACUUM ANALYZE completed."
    show_action_result "${SCOPE_LABEL} VACUUM ANALYZE" "Completed successfully.\n\nStart: ${started}\nEnd: ${ended}\nDatabase: ${db_url}"
  else
    err "VACUUM ANALYZE failed."
    return 1
  fi
}

database_restore_dry_run() {
  local db_dir latest_db path out
  db_dir="${BACKUP_ROOT}/${SCOPE}/database"
  latest_db="$(latest_file_in_dir "$db_dir")"
  if [ -z "$latest_db" ]; then
    err "No DB backup found in $db_dir"
    return 1
  fi
  path="${db_dir}/${latest_db}"
  out="${SCOPE_LABEL} Restore Dry-Run"$'\n\n'
  out+="Backup file: ${path}"$'\n'
  if [[ "$path" == *.gz ]]; then
    if gzip -t "$path" >/dev/null 2>&1; then
      out+="Integrity: OK (gzip test passed)"$'\n'
      out+="Preview:"$'\n'
      out+="$(gzip -dc "$path" | head -40)"
    else
      out+="Integrity: FAIL (gzip test failed)"$'\n'
    fi
  else
    if [ -s "$path" ]; then
      out+="Integrity: OK (file is non-empty)"$'\n'
      out+="Preview:"$'\n'
      out+="$(head -40 "$path")"
    else
      out+="Integrity: FAIL (file is empty)"$'\n'
    fi
  fi
  ui_textbox "${SCOPE_LABEL} Restore Dry-Run" "$out" 28 120
}

show_action_history() {
  local out=""
  out+="Recent Action History (journal)"$'\n\n'
  out+="Log locations"$'\n'
  out+="- Journal: ${GLOBAL_JOURNAL_FILE}"$'\n'
  out+="- Change log: ${GLOBAL_LOG_FILE}"$'\n'
  out+="- Action reports: ${GLOBAL_LOG_DIR}/actions/<scope>/"$'\n\n'
  if [ -f "$GLOBAL_JOURNAL_FILE" ]; then
    out+="$(tail -n 200 "$GLOBAL_JOURNAL_FILE")"
  else
    out+="No journal entries yet."
  fi
  local recent_reports
  recent_reports="$(ls -1t "${GLOBAL_LOG_DIR}"/actions/*/*.log 2>/dev/null | head -20 || true)"
  if [ -n "$recent_reports" ]; then
    out+=$'\n\n'"Recent persisted action reports"$'\n'
    out+="$recent_reports"
  fi
  ui_textbox "Action History" "$out" 28 120
}

show_change_journal() {
  local out=""
  out+="Recent Change Log"$'\n\n'
  out+="File: ${GLOBAL_LOG_FILE}"$'\n\n'
  if [ -f "$GLOBAL_LOG_FILE" ]; then
    out+="$(tail -n 200 "$GLOBAL_LOG_FILE")"
  else
    out+="No log entries yet."
  fi
  ui_textbox "Change Journal" "$out" 28 120
}

cross_platform_compat_report() {
  local out fam
  fam="$(os_family)"
  out="Cross-Platform Compatibility Layer"$'\n\n'
  out+="Detected OS family: ${fam}"$'\n'
  out+="Supported families: debian (Ubuntu), rhel (RHEL/CentOS/Fedora), suse (SLES/openSUSE)"$'\n\n'
  out+="Command mapping"$'\n'
  out+="- Package install: apt-get / dnf / zypper"$'\n'
  out+="- TLS tooling: certbot packages per OS family"$'\n'
  out+="- Service manager: systemd (systemctl) expected"$'\n'
  out+="- This wrapper auto-selects package manager in install/configure flows"$'\n'
  ui_textbox "Compatibility Report" "$out" 20 110
}

guided_production_install_wizard() {
  ensure_env_exists
  local base tls_mode backup_root upload_dir start_now
  base="$(ui_inputbox "${SCOPE_LABEL} Install Wizard" "Production BASE_URL (e.g. https://learnplay.co.za):" "$(env_get BASE_URL)")" || return 0
  tls_mode="$(ui_inputbox "${SCOPE_LABEL} Install Wizard" "TLS mode (self-signed|letsencrypt|caddy-http):" "${DEFAULT_TLS_MODE:-self-signed}")" || return 0
  backup_root="$(ui_inputbox "${SCOPE_LABEL} Install Wizard" "Backup root path:" "${BACKUP_ROOT:-/lppbackups}")" || return 0
  upload_dir="$(ui_inputbox "${SCOPE_LABEL} Install Wizard" "Upload dir (absolute or relative):" "$(env_get UPLOAD_DIR)")" || return 0

  env_set BASE_URL "$base"
  env_set FRONTEND_URL "$base"
  env_set VITE_DOMAIN "$base"
  [ -n "$upload_dir" ] && env_set UPLOAD_DIR "$upload_dir"
  BACKUP_ROOT="$backup_root"; save_global_conf_value BACKUP_ROOT "$BACKUP_ROOT"
  save_global_conf_value DEFAULT_TLS_MODE "$tls_mode"

  create_or_update_systemd_unit
  if [ "$tls_mode" = "letsencrypt" ]; then
    setup_letsencrypt_tls
  elif [ "$tls_mode" = "caddy-http" ]; then
    setup_caddy_http_proxy_mode
  else
    setup_self_signed_tls
  fi
  preflight_checks || true

  start_now="$(ui_inputbox "${SCOPE_LABEL} Install Wizard" "Start service now? (yes/no)" "yes")" || return 0
  if [[ "${start_now,,}" =~ ^(y|yes)$ ]]; then
    service_action start || true
  fi
  ok "Guided production wizard completed."
}

system_admin_menu() {
  while true; do
    local opt
    if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
      opt="$(ui_menu "${SCOPE_LABEL} System Administration" "Service and runtime operations" \
        "1" "System status overview" \
        "2" "System health check" \
        "3" "Preflight checks" \
        "4" "One-click repair" \
        "5" "Start full stack components" \
        "6" "Stop full stack components" \
        "7" "Restart full stack components" \
        "8" "Service status" \
        "9" "Service logs" \
        "10" "Application log tail" \
        "11" "App service start only" \
        "12" "App service stop only" \
        "13" "App service restart only" \
        "0" "Back")" || return 0
    else
      opt="$(ui_menu "${SCOPE_LABEL} System Administration" "Service and runtime operations" \
        "1" "System status overview" \
        "2" "System health check" \
        "3" "Preflight checks" \
        "4" "One-click repair" \
        "5" "Start full stack components" \
        "6" "Stop full stack components" \
        "7" "Restart full stack components" \
        "8" "Create/update systemd service" \
        "9" "Service status" \
        "10" "Service logs" \
        "11" "Application log tail" \
        "12" "App service start only" \
        "13" "App service stop only" \
        "14" "App service restart only" \
        "15" "Variant isolation health check" \
        "16" "Repair variant isolation" \
        "0" "Back")" || return 0
    fi
    case "$opt" in
      1) run_safe "System status overview" system_status_overview ;;
      2) run_safe "System health check" system_health_check ;;
      3) run_safe "Preflight checks" preflight_checks ;;
      4) run_safe "One-click repair" repair_common_issues ;;
      5) run_safe "Start full stack components" stack_action start ;;
      6) run_safe "Stop full stack components" stack_action stop ;;
      7) run_safe "Restart full stack components" stack_action restart ;;
      8)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Service status" service_action status
        else
          run_safe "Create/update systemd service" create_or_update_systemd_unit
        fi
        ;;
      9)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Service logs" service_action logs
        else
          run_safe "Service status" service_action status
        fi
        ;;
      10)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Application log tail" application_log_tail
        else
          run_safe "Service logs" service_action logs
        fi
        ;;
      11)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "App service start only" service_action start
        else
          run_safe "Application log tail" application_log_tail
        fi
        ;;
      12)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "App service stop only" service_action stop
        else
          run_safe "App service start only" service_action start
        fi
        ;;
      13)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "App service restart only" service_action restart
        else
          run_safe "App service stop only" service_action stop
        fi
        ;;
      14)
        if [ "$LPPADMIN_PROFILE" != "installed_runtime" ]; then
          run_safe "App service restart only" service_action restart
        else
          warn "Invalid option"
        fi
        ;;
      15)
        if [ "$LPPADMIN_PROFILE" != "installed_runtime" ]; then
          run_safe "Variant isolation health check" variant_isolation_health_check
        else
          warn "Invalid option"
        fi
        ;;
      16)
        if [ "$LPPADMIN_PROFILE" != "installed_runtime" ]; then
          run_safe "Repair variant isolation" repair_variant_isolation
        else
          warn "Invalid option"
        fi
        ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

database_admin_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Database Administration" "Database monitoring and backup tasks" \
      "1" "Database status/connectivity" \
      "2" "Create database backup now" \
      "3" "List database backups" \
      "4" "Restore database from backup" \
      "5" "Migration status" \
      "6" "Table row counts" \
      "7" "Slow query snapshot" \
      "8" "Enable slow query extension" \
      "9" "VACUUM ANALYZE" \
      "10" "Restore dry-run check" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "Database status/connectivity" database_status_overview ;;
      2) run_safe "Create database backup now" database_backup_now ;;
      3) run_safe "List database backups" list_database_backups ;;
      4) run_safe "Restore database from backup" restore_database_backup ;;
      5) run_safe "Migration status" database_migrations_status ;;
      6) run_safe "Table row counts" database_table_row_counts ;;
      7) run_safe "Slow query snapshot" database_slow_query_snapshot ;;
      8) run_safe "Enable slow query extension" enable_slow_query_extension ;;
      9) run_safe "VACUUM ANALYZE" database_vacuum_analyze ;;
      10) run_safe "Restore dry-run check" database_restore_dry_run ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

db_exec_stream() {
  local sql="$1"
  ensure_env_exists
  local db_url
  db_url="$(env_get DATABASE_URL)"
  if [ -z "$db_url" ]; then
    err "DATABASE_URL is not configured."
    return 1
  fi
  psql "$db_url" -v ON_ERROR_STOP=1 -P pager=off -c "$sql"
}

db_user_management_menu() {
  while true; do
    set_breadcrumb "Home > Operations > Database > DB User Management"
    local opt
    opt="$(ui_menu_nav "DB User Management [manage roles and privileges]" \
      "1" "List users/roles [show role attributes and memberships]" \
      "2" "Create application user [create least-privileged login role]" \
      "3" "Rotate user password [update role password securely]" \
      "4" "Grant privileges [grant schema/table privileges]" \
      "5" "Revoke privileges [revoke schema/table privileges]" \
      "6" "Lock/unlock user [toggle LOGIN permission]" \
      "7" "Drop user safely [drop role after dependency checks]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    local role pass schema table priv lock_mode
    case "$opt" in
      1) db_exec_stream "SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolvaliduntil FROM pg_roles ORDER BY rolname;" || true ;;
      2)
        role="$(ui_inputbox "Create DB User" "Role name:" "")" || continue
        pass="$(ui_inputbox "Create DB User" "Password:" "")" || continue
        schema="$(ui_inputbox "Create DB User" "Schema (default: public):" "public")" || continue
        db_exec_stream "CREATE ROLE \"$role\" LOGIN PASSWORD '$pass'; GRANT CONNECT ON DATABASE $(psql "$(env_get DATABASE_URL)" -Atqc 'select current_database();') TO \"$role\"; GRANT USAGE ON SCHEMA \"$schema\" TO \"$role\";" || true
        ;;
      3)
        role="$(ui_inputbox "Rotate Password" "Role name:" "")" || continue
        pass="$(ui_inputbox "Rotate Password" "New password:" "")" || continue
        db_exec_stream "ALTER ROLE \"$role\" PASSWORD '$pass';" || true
        ;;
      4)
        role="$(ui_inputbox "Grant Privileges" "Role name:" "")" || continue
        schema="$(ui_inputbox "Grant Privileges" "Schema:" "public")" || continue
        table="$(ui_inputbox "Grant Privileges" "Table name (or * for all tables in schema):" "*")" || continue
        priv="$(ui_inputbox "Grant Privileges" "Privileges (SELECT,INSERT,UPDATE,DELETE):" "SELECT")" || continue
        if [ "$table" = "*" ]; then
          db_exec_stream "GRANT ${priv} ON ALL TABLES IN SCHEMA \"$schema\" TO \"$role\";" || true
        else
          db_exec_stream "GRANT ${priv} ON TABLE \"$schema\".\"$table\" TO \"$role\";" || true
        fi
        ;;
      5)
        role="$(ui_inputbox "Revoke Privileges" "Role name:" "")" || continue
        schema="$(ui_inputbox "Revoke Privileges" "Schema:" "public")" || continue
        table="$(ui_inputbox "Revoke Privileges" "Table name (or * for all tables in schema):" "*")" || continue
        priv="$(ui_inputbox "Revoke Privileges" "Privileges to revoke:" "ALL")" || continue
        if [ "$table" = "*" ]; then
          db_exec_stream "REVOKE ${priv} ON ALL TABLES IN SCHEMA \"$schema\" FROM \"$role\";" || true
        else
          db_exec_stream "REVOKE ${priv} ON TABLE \"$schema\".\"$table\" FROM \"$role\";" || true
        fi
        ;;
      6)
        role="$(ui_inputbox "Lock/Unlock User" "Role name:" "")" || continue
        lock_mode="$(ui_menu_nav "Lock/Unlock User [choose action]" \
          "1" "Lock user [disable LOGIN]" \
          "2" "Unlock user [enable LOGIN]")" || continue
        if is_back_selected "$lock_mode"; then continue; fi
        if [ "$lock_mode" = "1" ]; then
          db_exec_stream "ALTER ROLE \"$role\" NOLOGIN;" || true
        else
          db_exec_stream "ALTER ROLE \"$role\" LOGIN;" || true
        fi
        ;;
      7)
        role="$(ui_inputbox "Drop User" "Role name to drop:" "")" || continue
        warn "Dropping role can break dependent objects."
        if ui_yesno "Drop User Confirmation" "Run dependency check and drop role '$role' if possible?"; then
          db_exec_stream "REASSIGN OWNED BY \"$role\" TO CURRENT_USER; DROP OWNED BY \"$role\"; DROP ROLE \"$role\";" || true
        fi
        ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

db_table_view_content() {
  local schema table filter order_by limit
  schema="$(ui_inputbox "View Table Content" "Schema:" "public")" || return 0
  table="$(ui_inputbox "View Table Content" "Table:" "")" || return 0
  filter="$(ui_inputbox "View Table Content" "WHERE filter (blank for no filter):" "")" || return 0
  order_by="$(ui_inputbox "View Table Content" "ORDER BY clause (default id DESC):" "id DESC")" || return 0
  limit="$(ui_inputbox "View Table Content" "Row limit:" "100")" || return 0
  local sql="SELECT * FROM \"$schema\".\"$table\""
  [ -n "$filter" ] && sql+=" WHERE ${filter}"
  [ -n "$order_by" ] && sql+=" ORDER BY ${order_by}"
  sql+=" LIMIT ${limit};"
  db_exec_stream "$sql" || true
}

db_table_edit_content() {
  warn "Direct table edits can break the system."
  if ! ui_yesno "Dangerous Operation" "lppadmin will create a database backup before edits.\n\nContinue?"; then
    return 0
  fi
  database_backup_now || return 1
  local ack
  ack="$(ui_inputbox "Dangerous Operation" "Type: I UNDERSTAND" "")" || return 0
  if [ "$ack" != "I UNDERSTAND" ]; then
    warn "Confirmation phrase mismatch. Aborted."
    return 0
  fi
  local sql
  sql="$(ui_inputbox "SQL Edit" "Enter SQL (INSERT/UPDATE/DELETE). It will run exactly as provided:" "")" || return 0
  [ -n "$sql" ] || return 0
  db_exec_stream "BEGIN; ${sql}; COMMIT;" || {
    warn "Edit failed. Attempting rollback."
    db_exec_stream "ROLLBACK;" || true
    return 1
  }
}

db_table_management_menu() {
  while true; do
    set_breadcrumb "Home > Operations > Database > DB Table Management"
    local opt schema table index_name
    opt="$(ui_menu_nav "DB Table Management [inspect and maintain table data]" \
      "1" "List tables and size [show largest tables first]" \
      "2" "Table health summary [basic table and index statistics]" \
      "3" "View table content [browse rows with filters, sort, and limits]" \
      "4" "Edit table content [dangerous; backup before commit]" \
      "5" "Analyze table [refresh planner stats]" \
      "6" "Vacuum table [cleanup dead tuples]" \
      "7" "Reindex table/index [rebuild table indexes]" \
      "8" "Archive/purge helper [execute retention delete SQL]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1)
        db_exec_stream "SELECT schemaname, relname AS table_name, pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size FROM pg_stat_user_tables ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;" || true
        ;;
      2)
        db_exec_stream "SELECT schemaname, relname, n_live_tup, n_dead_tup, seq_scan, idx_scan FROM pg_stat_user_tables ORDER BY n_dead_tup DESC, n_live_tup DESC LIMIT 100;" || true
        ;;
      3) db_table_view_content ;;
      4) db_table_edit_content ;;
      5)
        schema="$(ui_inputbox "Analyze Table" "Schema:" "public")" || continue
        table="$(ui_inputbox "Analyze Table" "Table:" "")" || continue
        db_exec_stream "ANALYZE \"$schema\".\"$table\";" || true
        ;;
      6)
        schema="$(ui_inputbox "Vacuum Table" "Schema:" "public")" || continue
        table="$(ui_inputbox "Vacuum Table" "Table:" "")" || continue
        db_exec_stream "VACUUM (ANALYZE) \"$schema\".\"$table\";" || true
        ;;
      7)
        schema="$(ui_inputbox "Reindex" "Schema:" "public")" || continue
        table="$(ui_inputbox "Reindex" "Table:" "")" || continue
        index_name="$(ui_inputbox "Reindex" "Index name (blank to reindex whole table):" "")" || continue
        if [ -n "$index_name" ]; then
          db_exec_stream "REINDEX INDEX \"$schema\".\"$index_name\";" || true
        else
          db_exec_stream "REINDEX TABLE \"$schema\".\"$table\";" || true
        fi
        ;;
      8)
        local purge_sql
        purge_sql="$(ui_inputbox "Archive/Purge Helper" "Enter safe DELETE SQL with WHERE clause:" "")" || continue
        if [ -n "$purge_sql" ] && ui_yesno "Archive/Purge Helper" "Run provided purge SQL?\n\n${purge_sql}"; then
          db_exec_stream "$purge_sql" || true
        fi
        ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

db_maintenance_advanced_menu() {
  while true; do
    set_breadcrumb "Home > Operations > Database > Advanced Maintenance"
    local opt limit
    opt="$(ui_menu_nav "DB Advanced Maintenance [diagnostics and cleanup utilities]" \
      "1" "Active sessions monitor [list active sessions and wait states]" \
      "2" "Blocked queries view [show blockers and blocked queries]" \
      "3" "Long query terminator [terminate selected backend pid]" \
      "4" "Index usage report [find low-use indexes]" \
      "5" "Backup verification restore test [run restore dry-run checks]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1)
        db_exec_stream "SELECT pid, usename, state, wait_event_type, wait_event, now()-query_start AS runtime, left(query,120) AS query FROM pg_stat_activity WHERE pid <> pg_backend_pid() ORDER BY query_start NULLS LAST;" || true
        ;;
      2)
        db_exec_stream "SELECT blocked.pid AS blocked_pid, blocked.query AS blocked_query, blocking.pid AS blocking_pid, blocking.query AS blocking_query FROM pg_stat_activity blocked JOIN pg_locks bl ON blocked.pid = bl.pid JOIN pg_locks kl ON bl.locktype = kl.locktype AND bl.database IS NOT DISTINCT FROM kl.database AND bl.relation IS NOT DISTINCT FROM kl.relation AND bl.page IS NOT DISTINCT FROM kl.page AND bl.tuple IS NOT DISTINCT FROM kl.tuple AND bl.virtualxid IS NOT DISTINCT FROM kl.virtualxid AND bl.transactionid IS NOT DISTINCT FROM kl.transactionid AND bl.classid IS NOT DISTINCT FROM kl.classid AND bl.objid IS NOT DISTINCT FROM kl.objid AND bl.objsubid IS NOT DISTINCT FROM kl.objsubid AND bl.pid <> kl.pid JOIN pg_stat_activity blocking ON kl.pid = blocking.pid WHERE NOT bl.granted AND kl.granted;" || true
        ;;
      3)
        limit="$(ui_inputbox "Long Query Terminator" "Backend PID to terminate:" "")" || continue
        [ -n "$limit" ] && db_exec_stream "SELECT pg_terminate_backend(${limit});" || true
        ;;
      4)
        db_exec_stream "SELECT schemaname, relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan ASC LIMIT 100;" || true
        ;;
      5) database_restore_dry_run || true ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

security_admin_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Security Administration" "Secrets and TLS security configuration" \
      "1" "Manage secrets" \
      "2" "Validate required secrets" \
      "3" "Secrets audit report" \
      "4" "Export secrets audit report" \
      "5" "Sync secrets from Infisical" \
      "6" "TLS certificate manager" \
      "7" "TLS renewal dry-run" \
      "8" "TLS auto-renew status" \
      "9" "TLS auto-renew set threshold" \
      "10" "TLS auto-renew run now" \
      "11" "TLS auto-renew logs" \
      "12" "Configure HTTPS (self-signed)" \
      "13" "Configure HTTPS (Let's Encrypt)" \
      "14" "Configure HTTPS (Behind Caddy reverse proxy)" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "Manage secrets" secrets_menu ;;
      2) run_safe "Validate required secrets" validate_required_secrets ;;
      3) run_safe "Secrets audit report" secrets_audit_report ;;
      4) run_safe "Export secrets audit report" export_secrets_audit_report ;;
      5) run_safe "Sync secrets from Infisical" sync_secrets_from_infisical ;;
      6) run_safe "TLS certificate manager" tls_certificate_manager ;;
      7) run_safe "TLS renewal dry-run" tls_renewal_dry_run ;;
      8) run_safe "TLS auto-renew status" tls_auto_renew_status ;;
      9) run_safe "TLS auto-renew set threshold" tls_auto_renew_set_threshold ;;
      10) run_safe "TLS auto-renew run now" tls_auto_renew_now ;;
      11) run_safe "TLS auto-renew logs" tls_auto_renew_logs ;;
      12) run_safe "Configure HTTPS (self-signed)" setup_self_signed_tls ;;
      13) run_safe "Configure HTTPS (Let's Encrypt)" setup_letsencrypt_tls ;;
      14) run_safe "Configure HTTPS (Behind Caddy reverse proxy)" setup_caddy_http_proxy_mode ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

http_status_code() {
  local url="$1"
  curl -k -sS -o /tmp/lpp_http_body.$$ -w "%{http_code}" "$url" 2>/dev/null || echo "000"
}

test_gemini_integration() {
  local out
  out="${SCOPE_LABEL} Gemini Integration Test"$'\n\n'
  out+="Moved to Integration Settings UI."$'\n'
  out+="Go to: /admin/integration-settings and run provider test for Gemini."
  ui_textbox "${SCOPE_LABEL} Gemini Test" "$out" 14 100
  return 0
}

test_mailersend_integration() {
  local out
  out="${SCOPE_LABEL} MailerSend Integration Test"$'\n\n'
  out+="Moved to Integration Settings UI."$'\n'
  out+="Go to: /admin/integration-settings and run provider test for MailerSend/SMTP."
  ui_textbox "${SCOPE_LABEL} MailerSend Test" "$out" 14 100
  return 0
}

test_gamma_integration() {
  local out
  out="${SCOPE_LABEL} Gamma Integration Test"$'\n\n'
  out+="Moved to Integration Settings UI."$'\n'
  out+="Go to: /admin/integration-settings and run provider test for Gamma."
  ui_textbox "${SCOPE_LABEL} Gamma Test" "$out" 14 100
  return 0
}

test_yoco_integration() {
  local out
  out="${SCOPE_LABEL} YOCO Integration Test"$'\n\n'
  out+="Moved to Integration Settings UI."$'\n'
  out+="Go to: /admin/integration-settings and run provider test for YOCO."
  ui_textbox "${SCOPE_LABEL} YOCO Test" "$out" 14 100
  return 0
}

application_health_check() {
  ensure_env_exists
  local app_port health_status health_body base base_health base_status db_url out
  app_port="$(env_get PORT)"; app_port="${app_port:-$SCOPE_APP_PORT}"
  health_status="$(http_status_code "http://127.0.0.1:${app_port}/api/health")"
  curl -sS -o /tmp/lpp_app_health.$$ "http://127.0.0.1:${app_port}/api/health" 2>/dev/null || true
  health_body="$(cat /tmp/lpp_app_health.$$ 2>/dev/null || true)"
  rm -f /tmp/lpp_app_health.$$

  base="$(env_get BASE_URL)"
  base_health="${base%/}/api/health"
  base_status="$(http_status_code "$base_health")"

  db_url="$(env_get DATABASE_URL)"
  out="${SCOPE_LABEL} Application Health"$'\n\n'
  out+="Runtime mode: $(app_runtime_mode "$app_port")"$'\n'
  out+="Local health endpoint: http://127.0.0.1:${app_port}/api/health -> ${health_status}"$'\n'
  out+="Public health endpoint: ${base_health} -> ${base_status}"$'\n'
  if [ -n "$db_url" ] && psql "$db_url" -c "select 1;" >/dev/null 2>&1; then
    out+="Database connectivity: OK"$'\n'
  else
    out+="Database connectivity: FAIL"$'\n'
  fi
  out+="Uploads directory writable: "
  if [ -w "$(resolve_upload_dir)" ]; then out+="YES"; else out+="NO"; fi
  out+=$'\n'
  out+=$'\n'"Local health response snippet:"$'\n'"${health_body:0:300}"
  ui_textbox "${SCOPE_LABEL} Application Health" "$out" 24 120
}

run_all_integration_tests() {
  local out fails=0
  out="${SCOPE_LABEL} Integration Test Summary"$'\n\n'
  if run_cmd_step "Test Gemini integration" test_gemini_integration; then out+="[OK] Gemini"$'\n'; else out+="[FAIL] Gemini"$'\n'; fails=$((fails+1)); fi
  if run_cmd_step "Test MailerSend integration" test_mailersend_integration; then out+="[OK] MailerSend"$'\n'; else out+="[FAIL] MailerSend"$'\n'; fails=$((fails+1)); fi
  if run_cmd_step "Test Gamma integration" test_gamma_integration; then out+="[OK] Gamma"$'\n'; else out+="[FAIL] Gamma"$'\n'; fails=$((fails+1)); fi
  if [ "$SCOPE" = "cloud" ]; then
    if run_cmd_step "Test YOCO integration" test_yoco_integration; then out+="[OK] YOCO"$'\n'; else out+="[FAIL] YOCO"$'\n'; fails=$((fails+1)); fi
  fi
  out+=$'\n'
  if [ "$fails" -eq 0 ]; then out+="OVERALL: PASS"; else out+="OVERALL: FAIL (${fails} integration(s) failed)"; fi
  ui_textbox "${SCOPE_LABEL} Integration Summary" "$out" 20 100
  [ "$fails" -eq 0 ]
}

application_admin_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Application Administration" "Application health and integration testing" \
      "1" "Application health check" \
      "2" "Run all integration tests" \
      "3" "Test Gemini integration" \
      "4" "Test MailerSend integration" \
      "5" "Test Gamma integration" \
      "6" "Test YOCO integration (cloud-only)" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "Application health check" application_health_check ;;
      2) run_safe "Run all integration tests" run_all_integration_tests ;;
      3) run_safe "Test Gemini integration" test_gemini_integration ;;
      4) run_safe "Test MailerSend integration" test_mailersend_integration ;;
      5) run_safe "Test Gamma integration" test_gamma_integration ;;
      6) run_safe "Test YOCO integration" test_yoco_integration ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

recommended_tuning_values() {
  local ram_mb cpu node_old db_max db_min ses_max ses_min
  local pg_shared pg_effective pg_work pg_maint nginx_workers nginx_conn
  ram_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  cpu="$(nproc 2>/dev/null || echo 2)"
  node_old=$(( ram_mb * 60 / 100 ))
  [ "$node_old" -lt 512 ] && node_old=512
  [ "$node_old" -gt 8192 ] && node_old=8192
  db_max=$(( cpu * 8 ))
  [ "$db_max" -lt 20 ] && db_max=20
  [ "$db_max" -gt 80 ] && db_max=80
  db_min=$(( cpu ))
  [ "$db_min" -lt 2 ] && db_min=2
  ses_max=$(( cpu * 2 ))
  [ "$ses_max" -lt 5 ] && ses_max=5
  [ "$ses_max" -gt 20 ] && ses_max=20
  ses_min=1
  pg_shared=$(( ram_mb / 4 ))
  [ "$pg_shared" -lt 128 ] && pg_shared=128
  pg_effective=$(( ram_mb * 3 / 4 ))
  pg_work=$(( ram_mb / (cpu * 8) ))
  [ "$pg_work" -lt 4 ] && pg_work=4
  pg_maint=$(( ram_mb / 16 ))
  [ "$pg_maint" -lt 64 ] && pg_maint=64
  nginx_workers="$cpu"
  nginx_conn=$(( 1024 * cpu ))
  echo "NODE_OPTIONS=--max-old-space-size=${node_old}"
  echo "ENABLE_OPTIMIZED_POOL=true"
  echo "DB_POOL_MAX=${db_max}"
  echo "DB_POOL_MIN=${db_min}"
  echo "SESSION_POOL_MAX=${ses_max}"
  echo "SESSION_POOL_MIN=${ses_min}"
  echo "PG_SHARED_BUFFERS_MB=${pg_shared}"
  echo "PG_EFFECTIVE_CACHE_SIZE_MB=${pg_effective}"
  echo "PG_WORK_MEM_MB=${pg_work}"
  echo "PG_MAINTENANCE_WORK_MEM_MB=${pg_maint}"
  echo "NGINX_WORKER_PROCESSES=${nginx_workers}"
  echo "NGINX_WORKER_CONNECTIONS=${nginx_conn}"
}

performance_tuning_recommendations() {
  local out current
  out="${SCOPE_LABEL} Performance Tuning Recommendations"$'\n\n'
  out+="System profile"$'\n'
  out+="  CPU cores: $(nproc 2>/dev/null || echo n/a)"$'\n'
  out+="  RAM (MB): $(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"$'\n\n'
  out+="Recommended values"$'\n'
  out+="$(recommended_tuning_values)"$'\n\n'
  out+="Current values"$'\n'
  while IFS='=' read -r k _; do
    current="$(env_get "$k")"
    out+="  ${k}=${current:-unset}"$'\n'
  done < <(recommended_tuning_values)
  ui_textbox "${SCOPE_LABEL} Perf Recommendations" "$out" 28 110
}

apply_performance_tuning() {
  ensure_env_exists
  local rec k v out pg_shared pg_effective pg_work pg_maint nginx_workers nginx_conn
  rec="$(recommended_tuning_values)"
  out="Apply these performance settings?\n\n${rec}\n\nThis will update .env and restart stack components."
  if ! ui_yesno "${SCOPE_LABEL} Perf Tuning" "$out"; then
    return 0
  fi
  while IFS='=' read -r k v; do
    env_set "$k" "$v"
  done < <(printf "%s\n" "$rec")

  # Try to tune PostgreSQL max_connections if possible.
  local target_conn
  target_conn="$(printf "%s\n" "$rec" | awk -F= '/^DB_POOL_MAX=/{print $2+30}')"
  pg_shared="$(printf "%s\n" "$rec" | awk -F= '/^PG_SHARED_BUFFERS_MB=/{print $2}')"
  pg_effective="$(printf "%s\n" "$rec" | awk -F= '/^PG_EFFECTIVE_CACHE_SIZE_MB=/{print $2}')"
  pg_work="$(printf "%s\n" "$rec" | awk -F= '/^PG_WORK_MEM_MB=/{print $2}')"
  pg_maint="$(printf "%s\n" "$rec" | awk -F= '/^PG_MAINTENANCE_WORK_MEM_MB=/{print $2}')"
  nginx_workers="$(printf "%s\n" "$rec" | awk -F= '/^NGINX_WORKER_PROCESSES=/{print $2}')"
  nginx_conn="$(printf "%s\n" "$rec" | awk -F= '/^NGINX_WORKER_CONNECTIONS=/{print $2}')"
  if command -v sudo >/dev/null 2>&1 && id -u postgres >/dev/null 2>&1; then
    run_cmd_step_optional "Set PostgreSQL max_connections=${target_conn}" \
      sudo -u postgres psql -d postgres -c "ALTER SYSTEM SET max_connections='${target_conn}';"
    run_cmd_step_optional "Set PostgreSQL shared_buffers=${pg_shared}MB" \
      sudo -u postgres psql -d postgres -c "ALTER SYSTEM SET shared_buffers='${pg_shared}MB';"
    run_cmd_step_optional "Set PostgreSQL effective_cache_size=${pg_effective}MB" \
      sudo -u postgres psql -d postgres -c "ALTER SYSTEM SET effective_cache_size='${pg_effective}MB';"
    run_cmd_step_optional "Set PostgreSQL work_mem=${pg_work}MB" \
      sudo -u postgres psql -d postgres -c "ALTER SYSTEM SET work_mem='${pg_work}MB';"
    run_cmd_step_optional "Set PostgreSQL maintenance_work_mem=${pg_maint}MB" \
      sudo -u postgres psql -d postgres -c "ALTER SYSTEM SET maintenance_work_mem='${pg_maint}MB';"
  fi
  if [ -f /etc/nginx/nginx.conf ]; then
    sed -i "s|^[[:space:]]*worker_processes[[:space:]].*;|worker_processes ${nginx_workers};|g" /etc/nginx/nginx.conf || true
    sed -i "s|^[[:space:]]*worker_connections[[:space:]].*;|        worker_connections ${nginx_conn};|g" /etc/nginx/nginx.conf || true
  fi

  stack_action restart || true
  show_action_result "${SCOPE_LABEL} Perf Tuning Applied" "Performance recommendations were applied.\n\nUpdated .env values:\n${rec}\n\nStack restart was attempted."
}

performance_analysis() {
  ensure_env_exists
  local out cpu load1 load5 load15 ram_total ram_avail ram_used_pct app_port mode
  cpu="$(nproc 2>/dev/null || echo 1)"
  read -r load1 load5 load15 _ < /proc/loadavg
  ram_total="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  ram_avail="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
  ram_used_pct=$(( ( (ram_total - ram_avail) * 100 ) / ram_total ))
  app_port="$(env_get PORT)"; app_port="${app_port:-$SCOPE_APP_PORT}"
  mode="$(app_runtime_mode "$app_port")"

  out="${SCOPE_LABEL} Performance Analysis"$'\n\n'
  out+="Current metrics"$'\n'
  out+="  CPU cores: ${cpu}"$'\n'
  out+="  Load avg (1/5/15): ${load1} / ${load5} / ${load15}"$'\n'
  out+="  Memory used: ${ram_used_pct}% (${ram_total-ram_avail}MB / ${ram_total}MB)"$'\n'
  out+="  App runtime mode: ${mode}"$'\n'
  out+="  App port ${app_port}: $(port_listening_state "$app_port")"$'\n'
  out+="  DB connectivity: "
  if psql "$(env_get DATABASE_URL)" -c "select 1;" >/dev/null 2>&1; then out+="OK"; else out+="FAIL"; fi
  out+=$'\n\n'
  out+="Recommendations"$'\n'
  if (( ram_used_pct > 85 )); then out+="  - High memory usage detected. Apply performance tuning and reduce concurrent workloads."$'\n'; fi
  awk "BEGIN{exit !($load1 > $cpu)}" && out+="  - CPU load exceeds core count. Consider scaling or reducing background jobs."$'\n' || true
  if [ "$mode" != "systemd" ]; then out+="  - Run app under systemd for stable lifecycle and restart behavior."$'\n'; fi
  if [ "$(systemctl_active_safe nginx)" != "active" ]; then out+="  - nginx is not active; start stack components."$'\n'; fi
  out+="  - Use 'Performance Tuning Recommendations' then 'Apply Performance Tuning' for guided optimization."
  ui_textbox "${SCOPE_LABEL} Perf Analysis" "$out" 28 120
}

performance_admin_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Performance Administration" "Performance analysis and guided tuning" \
      "1" "Performance analysis" \
      "2" "Performance tuning recommendations" \
      "3" "Apply performance tuning (approve + auto-restart)" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "Performance analysis" performance_analysis ;;
      2) run_safe "Performance tuning recommendations" performance_tuning_recommendations ;;
      3) run_safe "Apply performance tuning" apply_performance_tuning ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

environment_admin_menu() {
  while true; do
    local opt
    if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
      opt="$(ui_menu "${SCOPE_LABEL} Environment Administration" "Runtime environment settings" \
        "1" "Edit key environment settings" \
        "0" "Back")" || return 0
    else
      opt="$(ui_menu "${SCOPE_LABEL} Environment Administration" "Workspace environment and initialization tasks" \
        "1" "Apply recommended dev defaults" \
        "2" "Edit key environment settings" \
        "3" "Run setup-dev.sh" \
        "0" "Back")" || return 0
    fi
    case "$opt" in
      1)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Edit environment settings" prompt_edit_env
        else
          run_safe "Apply recommended dev defaults" configure_scope_defaults
        fi
        ;;
      2)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          warn "Invalid option"
        else
          run_safe "Edit environment settings" prompt_edit_env
        fi
        ;;
      3)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          warn "Invalid option"
        else
          run_safe "Run setup-dev.sh" run_setup_dev_script
        fi
        ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

run_db_migrations() {
  err "Direct migration runner execution is disabled."
  err "Use packaged updater only: update / update-app-db / update-lppadmin."
  return 1
}

run_app_build() {
  err "Direct application build is disabled in lppadmin."
  err "Build packages with devadmin on DEV host, then apply via packaged updater."
  return 1
}

install_or_update_dependencies() {
  err "Direct dependency installation is disabled in lppadmin."
  err "Use packaged updater only."
  return 1
}

repair_gamma_style_thumbnails() {
  if [ ! -f "$SCOPE_ROOT/scripts/repair-gamma-thumbnails.ts" ]; then
    err "Repair script not found: $SCOPE_ROOT/scripts/repair-gamma-thumbnails.ts"
    return 1
  fi
  (cd "$SCOPE_ROOT" && npx tsx scripts/repair-gamma-thumbnails.ts)
  show_action_result "${SCOPE_LABEL} Gamma Thumbnails" "Gamma image-style thumbnail repair completed.\n\nReload /gamma-themes to verify images."
}

deploy_latest_changes() {
  err "Legacy deploy-latest workflow is disabled."
  err "Use packaged updater flow only."
  return 1
}

apply_update_package() {
  local update_script="$SCOPE_SCRIPTS/update.sh"
  local update_mode=""
  local component="all"
  if [ ! -f "$update_script" ]; then
    err "Update script not found: $update_script"
    return 1
  fi
  update_mode="$(ui_menu "${SCOPE_LABEL} Update Components" "Choose which components to update from package." \
    "1" "Full package: App + DB + lppadmin (recommended)" \
    "2" "App + DB only" \
    "3" "lppadmin command only" \
    "0" "Cancel")" || return 0
  case "$update_mode" in
    1) component="all" ;;
    2) component="app-db" ;;
    3) component="lppadmin" ;;
    0|*) return 0 ;;
  esac
  if ! ui_yesno "${SCOPE_LABEL} Apply Update Package" "Run updater now?\n\nlppadmin will automatically:\n- Use LEARNPLAY_DIST_DIR when set\n- Reuse /tmp/dist-cloud if present\n- Or extract latest /tmp/learnplay*.tar.gz package"; then
    return 0
  fi
  run_update_component "$component"
}

is_installer_packaging_dev_workspace() {
  # Strictly limit this feature to LearnPlay dev workspaces under /antigravity.
  case "$SCOPE_ROOT" in
    /antigravity/Cloud-On-Prem) ;;
    *) return 1 ;;
  esac
  [ -x "$SCOPE_ROOT/onprem/build-onprem.sh" ] || return 1
  [ -x "$SCOPE_ROOT/build-cloud-linux.sh" ] || return 1
  return 0
}

installer_release_marker_file() {
  local scope="$1"
  local root="$2"
  case "$scope" in
    cloud) echo "${root}/.release-notes-marker-cloud.env" ;;
    onprem) echo "${root}/.release-notes-marker-onprem.env" ;;
    *) return 1 ;;
  esac
}

persist_installer_release_marker() {
  local scope="$1"
  local root="$2"
  local state_file="$3"
  local marker_file
  marker_file="$(installer_release_marker_file "$scope" "$root")"
  [ -f "$state_file" ] || return 0
  cp "$state_file" "${marker_file}.tmp"
  mv "${marker_file}.tmp" "$marker_file"
}

next_installer_release_version() {
  local scope="$1"
  local root="$2"
  local prefix regex pkg ver
  local max_major=0
  local max_minor=0
  local max_patch=-1
  local major minor patch

  case "$scope" in
    cloud)
      prefix="LP-CL-V"
      regex='^LP-CL-V([0-9]+)\.([0-9]{2})\.([0-9]{3})$'
      ;;
    onprem)
      prefix="LP-OP-V"
      regex='^LP-OP-V([0-9]+)\.([0-9]{2})\.([0-9]{3})$'
      ;;
    *)
      return 1
      ;;
  esac

  shopt -s nullglob
  for pkg in "$root"/${prefix}*.tar.gz; do
    ver="$(basename "${pkg%.tar.gz}")"
    if [[ "$ver" =~ $regex ]]; then
      major="${BASH_REMATCH[1]}"
      minor="${BASH_REMATCH[2]}"
      patch="${BASH_REMATCH[3]}"
      if ((10#$major > 10#$max_major)) || \
         ((10#$major == 10#$max_major && 10#$minor > 10#$max_minor)) || \
         ((10#$major == 10#$max_major && 10#$minor == 10#$max_minor && 10#$patch > 10#$max_patch)); then
        max_major="$major"
        max_minor="$minor"
        max_patch="$patch"
      fi
    fi
  done
  shopt -u nullglob

  if [ "$max_patch" -lt 0 ]; then
    major=1
    minor=0
    patch=0
  else
    major=$((10#$max_major))
    minor=$((10#$max_minor))
    patch=$((10#$max_patch + 1))
    if [ "$patch" -gt 999 ]; then
      patch=0
      minor=$((minor + 1))
      if [ "$minor" -gt 99 ]; then
        minor=0
        major=$((major + 1))
      fi
    fi
  fi

  printf '%s%d.%02d.%03d\n' "$prefix" "$major" "$minor" "$patch"
}

build_and_package_cloud_installer() {
  err "Package builds are managed by devadmin only."
  err "Use: sudo devadmin build-cloud"
  return 1

  local source_root ts build_version raw_version pkg_name pkg_sha latest_link build_log build_user marker_file state_file
  source_root="$(dirname "$(dirname "$(readlink -f "$0")")")"
  build_user="$(resolve_workspace_user "$source_root")"
  ts="$(date '+%Y%m%d_%H%M%S')"
  build_version="$(next_installer_release_version cloud "$source_root")"
  latest_link="learnplay-cloud.tar.gz"
  build_log="/tmp/lppadmin-cloud-build-${ts}.log"
  marker_file="$(installer_release_marker_file cloud "$source_root")"
  state_file="$source_root/dist-cloud/release-notes-state.env"

  action_report_set_summary "Cloud installer packaging started."
  run_cmd_step_sh_as_user "Build cloud distribution package" "$build_user" \
    "set -o pipefail && cd \"$source_root\" && RELEASE_VERSION_OVERRIDE=\"$build_version\" RELEASE_NOTES_SCOPE=\"cloud\" RELEASE_NOTES_SCRIPT=\"/antigravity/scripts/devadmin/generate-release-notes.sh\" RELEASE_NOTES_PACKAGE_DIR=\"$source_root\" RELEASE_CHANGELOG_FILE=\"/antigravity/docs/handoverdocs/CHANGELOG.md\" RELEASE_NOTES_MARKER_FILE=\"$marker_file\" RELEASE_NOTES_STATE_OUTPUT=\"$state_file\" bash build-cloud-linux.sh | tee \"$build_log\""
  raw_version="$(sed -n 's/.*\"version\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' "$source_root/dist-cloud/version.json" | head -1)"
  build_version="$(printf '%s' "${raw_version:-$build_version}" | tr -cd 'A-Za-z0-9._-')"
  if [ -z "$build_version" ]; then
    build_version="$ts"
  fi
  pkg_name="${build_version}.tar.gz"
  pkg_sha="${pkg_name}.sha256"
  run_cmd_step_sh_as_user "Create installer archive" "$build_user" \
    "cd \"$source_root\" && tar czf \"$pkg_name\" dist-cloud"
  run_cmd_step_sh_as_user "Generate installer SHA256 checksum" "$build_user" \
    "cd \"$source_root\" && sha256sum \"$pkg_name\" > \"$pkg_sha\""
  run_cmd_step_sh_as_user "Update latest installer symlink" "$build_user" \
    "cd \"$source_root\" && ln -sfn \"$pkg_name\" \"$latest_link\""
  persist_installer_release_marker cloud "$source_root" "$state_file"

  if [ ! -s "${source_root}/${pkg_name}" ]; then
    action_report_set_summary "Installer archive was not created or is empty."
    action_report_add_text "Expected archive: ${source_root}/${pkg_name}"
    action_report_add_text "Build log: ${build_log}"
    action_report_add_text "Last 80 lines of build log:"
    if [ -f "$build_log" ]; then
      action_report_add_text "$(tail -n 80 "$build_log")"
    else
      action_report_add_text "(build log not found)"
    fi
    return 1
  fi
  if [ ! -s "${source_root}/${pkg_sha}" ]; then
    action_report_set_summary "Installer checksum file was not created."
    action_report_add_text "Expected checksum: ${source_root}/${pkg_sha}"
    return 1
  fi
  if [ ! -L "${source_root}/${latest_link}" ]; then
    action_report_set_summary "Latest installer symlink was not created."
    action_report_add_text "Expected symlink: ${source_root}/${latest_link}"
    return 1
  fi

  action_report_set_summary "Installer package created and verified."
  show_action_result "${SCOPE_LABEL} Installer Package" \
    "Cloud installer package created successfully.\n\nArchive: ${source_root}/${pkg_name}\nChecksum: ${source_root}/${pkg_sha}\nLatest link: ${source_root}/${latest_link}\nBuild log: ${build_log}"
}

build_and_package_onprem_installer() {
  err "Package builds are managed by devadmin only."
  err "Use: sudo devadmin build-onprem"
  return 1

  local source_root ts build_version raw_version pkg_name pkg_sha latest_link build_log build_user marker_file state_file
  source_root="$(dirname "$(dirname "$(readlink -f "$0")")")"
  build_user="$(resolve_workspace_user "$source_root")"
  ts="$(date '+%Y%m%d_%H%M%S')"
  build_version="$(next_installer_release_version onprem "$source_root")"
  latest_link="learnplay-onprem.tar.gz"
  build_log="/tmp/lppadmin-onprem-build-${ts}.log"
  marker_file="$(installer_release_marker_file onprem "$source_root")"
  state_file="$source_root/dist-onprem/release-notes-state.env"

  action_report_set_summary "On-prem installer packaging started."
  run_cmd_step_sh_as_user "Build on-prem distribution package" "$build_user" \
    "set -o pipefail && cd \"$source_root\" && RELEASE_VERSION_OVERRIDE=\"$build_version\" RELEASE_NOTES_SCOPE=\"onprem\" RELEASE_NOTES_SCRIPT=\"/antigravity/scripts/devadmin/generate-release-notes.sh\" RELEASE_NOTES_PACKAGE_DIR=\"$source_root\" RELEASE_CHANGELOG_FILE=\"/antigravity/docs/handoverdocs/CHANGELOG.md\" RELEASE_NOTES_MARKER_FILE=\"$marker_file\" RELEASE_NOTES_STATE_OUTPUT=\"$state_file\" bash onprem/build-onprem.sh | tee \"$build_log\""
  raw_version="$(sed -n 's/.*\"version\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' "$source_root/dist-onprem/version.json" | head -1)"
  build_version="$(printf '%s' "${raw_version:-$build_version}" | tr -cd 'A-Za-z0-9._-')"
  if [ -z "$build_version" ]; then
    build_version="$ts"
  fi
  pkg_name="${build_version}.tar.gz"
  pkg_sha="${pkg_name}.sha256"
  run_cmd_step_sh_as_user "Create installer archive" "$build_user" \
    "cd \"$source_root\" && tar czf \"$pkg_name\" dist-onprem"
  run_cmd_step_sh_as_user "Generate installer SHA256 checksum" "$build_user" \
    "cd \"$source_root\" && sha256sum \"$pkg_name\" > \"$pkg_sha\""
  run_cmd_step_sh_as_user "Update latest installer symlink" "$build_user" \
    "cd \"$source_root\" && ln -sfn \"$pkg_name\" \"$latest_link\""
  persist_installer_release_marker onprem "$source_root" "$state_file"

  if [ ! -s "${source_root}/${pkg_name}" ]; then
    action_report_set_summary "Installer archive was not created or is empty."
    action_report_add_text "Expected archive: ${source_root}/${pkg_name}"
    action_report_add_text "Build log: ${build_log}"
    action_report_add_text "Last 80 lines of build log:"
    if [ -f "$build_log" ]; then
      action_report_add_text "$(tail -n 80 "$build_log")"
    else
      action_report_add_text "(build log not found)"
    fi
    return 1
  fi
  if [ ! -s "${source_root}/${pkg_sha}" ]; then
    action_report_set_summary "Installer checksum file was not created."
    action_report_add_text "Expected checksum: ${source_root}/${pkg_sha}"
    return 1
  fi
  if [ ! -L "${source_root}/${latest_link}" ]; then
    action_report_set_summary "Latest installer symlink was not created."
    action_report_add_text "Expected symlink: ${source_root}/${latest_link}"
    return 1
  fi

  action_report_set_summary "Installer package created and verified."
  show_action_result "${SCOPE_LABEL} Installer Package" \
    "Installer package created successfully.\n\nArchive: ${source_root}/${pkg_name}\nChecksum: ${source_root}/${pkg_sha}\nLatest link: ${source_root}/${latest_link}\nBuild log: ${build_log}"
}

build_deploy_admin_menu() {
  while true; do
    local opt
    local menu_items=(
      "1" "Apply update package (full)"
      "2" "Apply update package (app + db)"
      "3" "Apply update package (lppadmin only)"
      "4" "Preview update package"
      "5" "Restart full stack components"
      "6" "Install/update lppadmin command (/usr/local/bin/lppadmin)"
      "7" "Update OS packages only (apt security/critical)"
      "8" "Build and package cloud installer (dev workspace only)"
      "9" "Build and package on-prem installer (dev workspace only)"
    )
    menu_items+=("0" "Back")

    opt="$(ui_menu "${SCOPE_LABEL} Build and Deployment" "Package architecture only: apply signed package updates and service operations" "${menu_items[@]}")" || return 0
    case "$opt" in
      1) run_safe "Update full package" run_update_component all ;;
      2) run_safe "Update app and database" run_update_component app-db ;;
      3) run_safe "Update lppadmin command" run_update_component lppadmin ;;
      4) run_safe "Update package preview" prepare_update_dist_dir_for_scope ;;
      5) run_safe "Restart full stack components" stack_action restart ;;
      6) run_safe "Install/update lppadmin command" install_global_command ;;
      7) run_safe "Update OS packages only" update_system_packages ;;
      8)
        if is_installer_packaging_dev_workspace; then
          run_safe "Build and package cloud installer" build_and_package_cloud_installer
        else
          warn "Installer packaging is not available on this system."
        fi
        ;;
      9)
        if is_installer_packaging_dev_workspace; then
          run_safe "Build and package on-prem installer" build_and_package_onprem_installer
        else
          warn "Installer packaging is not available on this system."
        fi
        ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

update_system_packages() {
  local mode
  if ! command -v apt-get >/dev/null 2>&1; then
    err "This operation currently supports Debian/Ubuntu systems with apt-get."
    return 1
  fi

  preview_os_package_updates || return 1

  if ! ui_yesno "${SCOPE_LABEL} OS & Package Updates" "Before continuing, create a FULL system backup (VM/OS snapshot).\n\nCritical package updates can introduce incompatibilities and may break services.\n\nDo you confirm a full system backup is already available?"; then
    action_report_set_summary "Cancelled: full system backup was not confirmed."
    return 0
  fi

  mode="$(ui_menu "${SCOPE_LABEL} OS & Package Updates" "Choose package update strategy" \
    "1" "Standard upgrades (apt update + apt upgrade)" \
    "2" "Full distribution upgrade (apt full-upgrade)" \
    "0" "Back")" || return 0

  case "$mode" in
    1)
      run_cmd_step_sh "Refresh apt package index" "DEBIAN_FRONTEND=noninteractive apt-get update" || return 1
      run_cmd_step_sh "Apply package upgrades" "DEBIAN_FRONTEND=noninteractive apt-get upgrade -y" || return 1
      run_cmd_step_optional "Remove obsolete packages (optional)" /bin/bash -lc "DEBIAN_FRONTEND=noninteractive apt-get autoremove -y"
      action_report_set_summary "Standard OS/package updates completed."
      ;;
    2)
      if ! ui_yesno "${SCOPE_LABEL} Full Upgrade Warning" "FULL upgrade may replace or remove core packages and has higher breakage risk.\n\nProceed only if you have a tested rollback snapshot.\n\nContinue with apt full-upgrade?"; then
        action_report_set_summary "Cancelled: full-upgrade not approved."
        return 0
      fi
      run_cmd_step_sh "Refresh apt package index" "DEBIAN_FRONTEND=noninteractive apt-get update" || return 1
      run_cmd_step_sh "Apply full distribution upgrade" "DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y" || return 1
      run_cmd_step_optional "Remove obsolete packages (optional)" /bin/bash -lc "DEBIAN_FRONTEND=noninteractive apt-get autoremove -y"
      action_report_set_summary "Full distribution upgrade completed."
      ;;
    0) return 0 ;;
    *) warn "Invalid option"; return 1 ;;
  esac

  if ui_yesno "${SCOPE_LABEL} Restart Stack" "Package updates can affect nginx, PostgreSQL, and runtime libraries.\n\nRestart LearnPlay stack components now?"; then
    stack_action restart || true
  fi
}

run_full_update_rehearsal() {
  err "Legacy full update rehearsal is disabled."
  err "Use packaged updater and health checks instead."
  return 1
}

security_patch_report_dir() {
  echo "${SECURITY_PATCH_REPORT_ROOT}/${SCOPE:-global}"
}

security_patch_write_report() {
  local mode="$1"
  local status="$2"
  local summary="$3"
  local body="$4"
  local report_dir ts file latest_link
  report_dir="$(security_patch_report_dir)"
  mkdir -p "$report_dir"
  ts="$(date '+%Y%m%d_%H%M%S')"
  file="${report_dir}/${ts}-${mode}-${status}.log"
  latest_link="${report_dir}/latest-${mode}.log"
  {
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "Scope: ${SCOPE:-unknown}"
    echo "Mode: ${mode}"
    echo "Status: ${status}"
    echo "Summary: ${summary}"
    echo ""
    printf "%b\n" "$body"
  } > "$file"
  ln -sfn "$(basename "$file")" "$latest_link"
  echo "$file"
}

security_patch_apt_lock_holder() {
  local lock
  for lock in /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock; do
    if [ -e "$lock" ] && command -v fuser >/dev/null 2>&1 && fuser "$lock" >/dev/null 2>&1; then
      echo "$lock"
      return 0
    fi
  done
  return 1
}

security_patch_preflight_check() {
  local min_kb=1048576
  local avail_kb lock_path
  avail_kb="$(df -Pk / | awk 'NR==2 {print $4}' 2>/dev/null || echo 0)"
  action_report_add_text "[Step $((ACTION_STEPS + 1))] Security patch preflight"
  if ! command -v apt-get >/dev/null 2>&1; then
    action_report_add_text "Result: FAIL"
    action_report_add_text "Reason: apt-get not found (Debian/Ubuntu required)."
    action_report_add_text ""
    return 1
  fi
  lock_path="$(security_patch_apt_lock_holder 2>/dev/null || true)"
  if [ -n "$lock_path" ]; then
    action_report_add_text "Result: FAIL"
    action_report_add_text "Reason: apt/dpkg lock currently held on ${lock_path}."
    action_report_add_text ""
    return 1
  fi
  if ! [[ "$avail_kb" =~ ^[0-9]+$ ]]; then
    avail_kb=0
  fi
  action_report_add_text "Root filesystem free space: ${avail_kb} KB"
  if [ "$avail_kb" -lt "$min_kb" ]; then
    action_report_add_text "Result: FAIL"
    action_report_add_text "Reason: less than 1 GB free on root filesystem."
    action_report_add_text ""
    return 1
  fi
  action_report_add_text "Result: OK"
  action_report_add_text ""
  return 0
}

security_patch_service_state() {
  local svc="$1"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl is-active "$svc" 2>/dev/null || echo "unknown"
  else
    echo "unsupported"
  fi
}

security_patch_component_versions() {
  local out=""
  out+="$(printf '  - %-20s %s -> %s\n' "nodejs" "$(dpkg_installed_version nodejs)" "$(apt_candidate_version nodejs)")"
  out+="$(printf '  - %-20s %s -> %s\n' "npm" "$(dpkg_installed_version npm)" "$(apt_candidate_version npm)")"
  out+="$(printf '  - %-20s %s -> %s\n' "nginx" "$(dpkg_installed_version nginx)" "$(apt_candidate_version nginx)")"
  out+="$(printf '  - %-20s %s -> %s\n' "postgresql" "$(dpkg_installed_version postgresql)" "$(apt_candidate_version postgresql)")"
  out+="$(printf '  - %-20s %s -> %s\n' "postgresql-16" "$(dpkg_installed_version postgresql-16)" "$(apt_candidate_version postgresql-16)")"
  out+="$(printf '  - %-20s %s -> %s\n' "openssl" "$(dpkg_installed_version openssl)" "$(apt_candidate_version openssl)")"
  out+="$(printf '  - %-20s %s -> %s\n' "curl" "$(dpkg_installed_version curl)" "$(apt_candidate_version curl)")"
  out+="$(printf '  - %-20s %s -> %s\n' "libreoffice-impress" "$(dpkg_installed_version libreoffice-impress)" "$(apt_candidate_version libreoffice-impress)")"
  out+="$(printf '  - %-20s %s -> %s\n' "ffmpeg" "$(dpkg_installed_version ffmpeg)" "$(apt_candidate_version ffmpeg)")"
  printf "%s" "$out"
}

security_patch_check_updates() {
  local upgradable count summary report_file report_body
  security_patch_preflight_check || {
    report_file="$(security_patch_write_report "check" "failed" "Security patch check failed during preflight." "${ACTION_REPORT}")"
    action_report_set_summary "Security patch check failed. Report: ${report_file}"
    return 1
  }
  run_cmd_step_sh "Refresh apt package index (security patch check)" "DEBIAN_FRONTEND=noninteractive apt-get update" || return 1
  upgradable="$(apt list --upgradable 2>/dev/null | sed '1d' || true)"
  if [ -n "$upgradable" ]; then
    count="$(printf '%s\n' "$upgradable" | grep -c '.')"
  else
    count=0
  fi
  action_report_add_text "[Step $((ACTION_STEPS + 1))] Security patch status snapshot"
  action_report_add_text "Upgradable package count: ${count}"
  action_report_add_text "LearnPlay runtime components (installed -> candidate):"
  action_report_add_text "$(security_patch_component_versions)"
  action_report_add_text ""
  if [ "$count" -gt 0 ]; then
    action_report_add_text "Upgradable package list (first 150):"
    action_report_add_text "$(printf '%s\n' "$upgradable" | head -150)"
    action_report_add_text ""
  fi
  summary="Detected ${count} upgradable package(s)."
  report_body="${ACTION_REPORT}"
  report_file="$(security_patch_write_report "check" "ok" "$summary" "$report_body")"
  action_report_set_summary "${summary} Report: ${report_file}"
  show_action_result "${SCOPE_LABEL} Security Patch Check" "${report_body}\nReport file: ${report_file}"
}

security_patch_apply_updates() {
  local before_upgradable before_count after_upgradable after_count
  local pre_nginx pre_postgres pre_app post_nginx post_postgres post_app
  local summary report_file report_body

  security_patch_preflight_check || {
    report_file="$(security_patch_write_report "apply" "failed" "Security patch apply failed during preflight." "${ACTION_REPORT}")"
    action_report_set_summary "Security patch apply failed. Report: ${report_file}"
    return 1
  }

  run_cmd_step_sh "Refresh apt package index (security patch apply)" "DEBIAN_FRONTEND=noninteractive apt-get update" || return 1
  before_upgradable="$(apt list --upgradable 2>/dev/null | sed '1d' || true)"
  if [ -n "$before_upgradable" ]; then
    before_count="$(printf '%s\n' "$before_upgradable" | grep -c '.')"
  else
    before_count=0
  fi

  pre_nginx="$(security_patch_service_state nginx)"
  pre_postgres="$(security_patch_service_state "$(postgres_service_target)")"
  pre_app="$(security_patch_service_state "$SCOPE_SERVICE")"
  action_report_add_text "[Step $((ACTION_STEPS + 1))] Pre-update service states"
  action_report_add_text "  - nginx: ${pre_nginx}"
  action_report_add_text "  - $(postgres_service_target): ${pre_postgres}"
  action_report_add_text "  - ${SCOPE_SERVICE}: ${pre_app}"
  action_report_add_text ""

  if [ "$before_count" -eq 0 ]; then
    summary="No upgradable packages found. System already up to date."
    report_body="${ACTION_REPORT}"
    report_file="$(security_patch_write_report "apply" "ok" "$summary" "$report_body")"
    action_report_set_summary "${summary} Report: ${report_file}"
    show_action_result "${SCOPE_LABEL} Security Patch Apply" "${report_body}\nReport file: ${report_file}"
    return 0
  fi

  run_cmd_step_sh "Apply latest package updates" "DEBIAN_FRONTEND=noninteractive apt-get upgrade -y" || return 1
  run_cmd_step_optional "Autoremove unused packages (optional)" /bin/bash -lc "DEBIAN_FRONTEND=noninteractive apt-get autoremove -y"

  after_upgradable="$(apt list --upgradable 2>/dev/null | sed '1d' || true)"
  if [ -n "$after_upgradable" ]; then
    after_count="$(printf '%s\n' "$after_upgradable" | grep -c '.')"
  else
    after_count=0
  fi

  post_nginx="$(security_patch_service_state nginx)"
  post_postgres="$(security_patch_service_state "$(postgres_service_target)")"
  post_app="$(security_patch_service_state "$SCOPE_SERVICE")"

  action_report_add_text "[Step $((ACTION_STEPS + 1))] Post-update state"
  action_report_add_text "Upgradable packages before: ${before_count}"
  action_report_add_text "Upgradable packages after:  ${after_count}"
  action_report_add_text "LearnPlay runtime components (installed -> candidate after update):"
  action_report_add_text "$(security_patch_component_versions)"
  action_report_add_text ""
  action_report_add_text "Service states after update:"
  action_report_add_text "  - nginx: ${post_nginx}"
  action_report_add_text "  - $(postgres_service_target): ${post_postgres}"
  action_report_add_text "  - ${SCOPE_SERVICE}: ${post_app}"
  action_report_add_text ""

  if [ -f /var/run/reboot-required ]; then
    action_report_add_text "Reboot required: YES"
    if [ -f /var/run/reboot-required.pkgs ]; then
      action_report_add_text "Packages requiring reboot:"
      action_report_add_text "$(cat /var/run/reboot-required.pkgs 2>/dev/null | head -100)"
      action_report_add_text ""
    fi
  else
    action_report_add_text "Reboot required: NO"
    action_report_add_text ""
  fi

  summary="Applied latest package updates. Before=${before_count}, After=${after_count}."
  report_body="${ACTION_REPORT}"
  report_file="$(security_patch_write_report "apply" "ok" "$summary" "$report_body")"
  action_report_set_summary "${summary} Report: ${report_file}"
  show_action_result "${SCOPE_LABEL} Security Patch Apply" "${report_body}\nReport file: ${report_file}"
}

security_patch_update_report() {
  local report_dir report_text latest_file
  report_dir="$(security_patch_report_dir)"
  if [ ! -d "$report_dir" ]; then
    show_action_result "${SCOPE_LABEL} Security Patch Report" "No security patch reports found yet.\n\nRun a patch check or patch apply first."
    return 0
  fi
  report_text="Security patch reports (${SCOPE_LABEL})"$'\n\n'
  while IFS= read -r file; do
    [ -f "$file" ] || continue
    local ts mode status summary
    ts="$(grep -m1 '^Timestamp:' "$file" | sed 's/^Timestamp:[[:space:]]*//')"
    mode="$(grep -m1 '^Mode:' "$file" | sed 's/^Mode:[[:space:]]*//')"
    status="$(grep -m1 '^Status:' "$file" | sed 's/^Status:[[:space:]]*//')"
    summary="$(grep -m1 '^Summary:' "$file" | sed 's/^Summary:[[:space:]]*//')"
    report_text+="- ${ts} | mode=${mode} | status=${status}"$'\n'
    report_text+="  ${summary}"$'\n'
  done < <(ls -1t "${report_dir}"/*.log 2>/dev/null | head -20)
  latest_file="$(ls -1t "${report_dir}"/*.log 2>/dev/null | head -1 || true)"
  if [ -n "$latest_file" ] && [ -f "$latest_file" ]; then
    report_text+=$'\n'"Latest report file: ${latest_file}"$'\n'
    report_text+=$'\n'"--- Latest report details ---"$'\n'
    report_text+="$(cat "$latest_file")"
  fi
  show_action_result "${SCOPE_LABEL} Security Patch Report" "$report_text"
}

security_patches_menu_v2() {
  while true; do
    set_breadcrumb "Home > Security Patches"
    local opt
    opt="$(ui_menu_nav "Security patches [weekly lppatch Tuesday workflow]" \
      "1" "Check for updates [current vs latest, with report]" \
      "2" "Apply latest updates [safe preflight + patch apply]" \
      "3" "Update report [view patch history and latest details]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Security patch check" security_patch_check_updates ;;
      2) run_safe "Security patch apply" security_patch_apply_updates ;;
      3) run_safe "Security patch report" security_patch_update_report ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

dpkg_installed_version() {
  local pkg="$1"
  dpkg-query -W -f='${Version}' "$pkg" 2>/dev/null || echo "not-installed"
}

apt_candidate_version() {
  local pkg="$1"
  local cand
  cand="$(apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}')"
  [ -n "$cand" ] || cand="unknown"
  [ "$cand" != "(none)" ] || cand="not-available"
  echo "$cand"
}

append_pkg_preview_line() {
  local label="$1"
  local pkg="$2"
  action_report_add_text "$(printf '  - %-18s %s -> %s' "$label" "$(dpkg_installed_version "$pkg")" "$(apt_candidate_version "$pkg")")"
}

preview_os_package_updates() {
  local upgradable count preview
  run_cmd_step_sh "Refresh apt package index (preview)" "DEBIAN_FRONTEND=noninteractive apt-get update" || return 1
  upgradable="$(apt list --upgradable 2>/dev/null | sed '1d' || true)"
  if [ -n "$upgradable" ]; then
    count="$(printf '%s\n' "$upgradable" | grep -c '.')"
  else
    count=0
  fi

  action_report_add_text "[Step $((ACTION_STEPS + 1))] Package update preview"
  action_report_add_text "Command: apt list --upgradable"
  action_report_add_text "Upgradable packages detected: ${count}"
  action_report_add_text "Key runtime packages (installed -> candidate):"
  append_pkg_preview_line "postgresql" "postgresql"
  append_pkg_preview_line "postgresql-16" "postgresql-16"
  append_pkg_preview_line "postgresql-17" "postgresql-17"
  append_pkg_preview_line "postgresql-18" "postgresql-18"
  append_pkg_preview_line "nginx" "nginx"
  append_pkg_preview_line "openssl" "openssl"
  append_pkg_preview_line "curl" "curl"
  action_report_add_text ""

  preview="${SCOPE_LABEL} OS Package Update Preview"$'\n\n'
  preview+="Upgradable packages: ${count}"$'\n'
  preview+=$'\n'"Key runtime packages (installed -> candidate)"$'\n'
  preview+="$(printf '  - %-18s %s -> %s\n' "postgresql" "$(dpkg_installed_version postgresql)" "$(apt_candidate_version postgresql)")"
  preview+="$(printf '  - %-18s %s -> %s\n' "postgresql-16" "$(dpkg_installed_version postgresql-16)" "$(apt_candidate_version postgresql-16)")"
  preview+="$(printf '  - %-18s %s -> %s\n' "postgresql-17" "$(dpkg_installed_version postgresql-17)" "$(apt_candidate_version postgresql-17)")"
  preview+="$(printf '  - %-18s %s -> %s\n' "postgresql-18" "$(dpkg_installed_version postgresql-18)" "$(apt_candidate_version postgresql-18)")"
  preview+="$(printf '  - %-18s %s -> %s\n' "nginx" "$(dpkg_installed_version nginx)" "$(apt_candidate_version nginx)")"
  preview+="$(printf '  - %-18s %s -> %s\n' "openssl" "$(dpkg_installed_version openssl)" "$(apt_candidate_version openssl)")"
  preview+="$(printf '  - %-18s %s -> %s\n' "curl" "$(dpkg_installed_version curl)" "$(apt_candidate_version curl)")"
  if [ "$count" -gt 0 ]; then
    preview+=$'\n'"Sample upgradable packages:"$'\n'
    preview+="$(printf '%s\n' "$upgradable" | head -40)"
  fi
  show_action_result "${SCOPE_LABEL} Update Preview" "$preview"
}

update_management_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Update Management" "Apply safe component updates on installed systems" \
      "1" "Update full package: app + db + lppadmin (safe + rollback)" \
      "2" "Update app and database only (safe + rollback)" \
      "3" "Update lppadmin command only" \
      "4" "Rollback from snapshot" \
      "5" "Create complete system backup (app+db+uploads)" \
      "6" "Update OS packages only (apt security/critical)" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "Update full package" run_update_component all ;;
      2) run_safe "Update app and database" run_update_component app-db ;;
      3) run_safe "Update lppadmin command" run_update_component lppadmin ;;
      4) run_safe "Rollback from snapshot" rollback_from_snapshot ;;
      5) run_safe "Create complete system backup" create_complete_system_backup ;;
      6) run_safe "Update OS packages only" update_system_packages ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

backup_recovery_menu() {
  while true; do
    local opt
    opt="$(ui_menu "${SCOPE_LABEL} Backup and Recovery" "Backups, rollback, and retention policy" \
      "1" "Create full backup" \
      "2" "Create complete system backup (app+db+uploads)" \
      "3" "Rollback from snapshot" \
      "4" "Backup policy settings" \
      "5" "Verify backup integrity" \
      "0" "Back")" || return 0
    case "$opt" in
      1) run_safe "Create full backup" create_full_backup ;;
      2) run_safe "Create complete system backup" create_complete_system_backup ;;
      3) run_safe "Rollback from snapshot" rollback_from_snapshot ;;
      4) run_safe "Backup policy settings" configure_backup_policy ;;
      5) run_safe "Verify backup integrity" verify_backup_integrity ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

maintenance_admin_menu() {
  while true; do
    local opt
    if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
      opt="$(ui_menu "${SCOPE_LABEL} Maintenance Administration" "Operational tools and help" \
        "1" "Show action history" \
        "2" "Show change journal" \
        "3" "Configure health alerts" \
        "4" "Send test health alert" \
        "5" "Apply update package" \
        "6" "Help for this system" \
        "0" "Back")" || return 0
    else
      opt="$(ui_menu "${SCOPE_LABEL} Maintenance Administration" "Script tools and contextual help" \
        "1" "Run variant script" \
        "2" "Show action history" \
        "3" "Show change journal" \
        "4" "Configure health alerts" \
        "5" "Send test health alert" \
        "6" "Guided production install wizard" \
        "7" "Help for this system" \
        "0" "Back")" || return 0
    fi
    case "$opt" in
      1)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Show action history" show_action_history
        else
          run_safe "Run variant script" run_variant_script_menu
        fi
        ;;
      2)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Show change journal" show_change_journal
        else
          run_safe "Show action history" show_action_history
        fi
        ;;
      3)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Configure health alerts" configure_health_alerts
        else
          run_safe "Show change journal" show_change_journal
        fi
        ;;
      4)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Send test health alert" test_health_alerts
        else
          run_safe "Configure health alerts" configure_health_alerts
        fi
        ;;
      5)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Apply update package" apply_update_package
        else
          run_safe "Send test health alert" test_health_alerts
        fi
        ;;
      6)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Help" show_help
        elif [ "$LPPADMIN_PROFILE" != "installed_runtime" ]; then
          run_safe "Guided production install wizard" guided_production_install_wizard
        else
          warn "Invalid option"
        fi
        ;;
      7)
        if [ "$LPPADMIN_PROFILE" != "installed_runtime" ]; then
          run_safe "Help" show_help
        else
          warn "Invalid option"
        fi
        ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

create_disaster_recovery_backup_full() {
  local dr_script="$SCOPE_SCRIPTS/dr-backup.sh"
  if [ -x "$dr_script" ]; then
    run_cmd_step_sh "Run disaster recovery backup script" "bash '$dr_script'"
  else
    warn "DR backup script not found; falling back to complete system backup."
    create_complete_system_backup
  fi
}

restore_disaster_recovery_backup_full() {
  local dr_script="$SCOPE_SCRIPTS/dr-restore.sh"
  if [ ! -x "$dr_script" ]; then
    err "DR restore script not found: $dr_script"
    return 1
  fi
  local archive
  archive="$(ui_inputbox "${SCOPE_LABEL} DR Restore" "Enter full path to DR backup archive:" "")" || return 0
  [ -n "$archive" ] || return 0
  run_cmd_step_sh "Run disaster recovery restore script" "bash '$dr_script' '$archive'"
}

quick_status_menu() {
  while true; do
    set_breadcrumb "Home > Quick Actions > Status Summary"
    local opt
    opt="$(ui_menu_nav "Status Summary [status shortcuts]" \
      "1" "Full system status [services, ports, URLs and env summary]" \
      "2" "App runtime status [service state and runtime mode]" \
      "3" "Database status [connectivity and db service status]" \
      "4" "Web/TLS status [nginx and tls listener checks]" \
      "5" "Runtime version [installed version and package manifest]" \
      "6" "Rollout verification [version plus DB schema counts]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "System status overview" system_status_overview ;;
      2) run_safe "Service status" service_action status ;;
      3) run_safe "Database status/connectivity" database_status_overview ;;
      4) run_safe "System health check" system_health_check ;;
      5) run_safe "Runtime version report" runtime_version_report ;;
      6) run_safe "Rollout verification" parity_report ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

quick_restart_menu() {
  while true; do
    set_breadcrumb "Home > Quick Actions > Restart App"
    local opt
    opt="$(ui_menu_nav "Restart App [restart shortcuts]" \
      "1" "Restart app service [restart only the app service]" \
      "2" "Restart full stack [restart app + nginx + postgresql]" \
      "3" "Graceful restart + verify [restart app and run health check]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "App service restart only" service_action restart ;;
      2) run_safe "Restart full stack components" stack_action restart ;;
      3) run_safe "App restart and verify" service_action restart; run_safe "System health check" system_health_check ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

quick_logs_menu() {
  while true; do
    set_breadcrumb "Home > Quick Actions > View Logs"
    local opt
    opt="$(ui_menu_nav "View Logs [live and recent logs]" \
      "1" "Live app logs [follow app logs continuously]" \
      "2" "Recent app logs [show recent logs then follow]" \
      "3" "Service journal logs [show service journal with follow]" \
      "4" "Error-only log view [show and follow error-level logs]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) application_log_tail ;;
      2) view_recent_and_follow "${SCOPE_LABEL} App Logs" "journalctl -u '$SCOPE_SERVICE' -n 200 --no-pager" "journalctl -u '$SCOPE_SERVICE' -f" ;;
      3) service_action logs ;;
      4) view_error_only_logs ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

quick_health_menu() {
  while true; do
    set_breadcrumb "Home > Quick Actions > Health Check"
    local opt
    opt="$(ui_menu_nav "Health Check [diagnostics shortcuts]" \
      "1" "Quick health check [core service and port checks]" \
      "2" "Full health check [extended connectivity and runtime checks]" \
      "3" "App endpoint check [check app endpoint responsiveness]" \
      "4" "Health check + export [run checks and keep report log]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "System health check" system_health_check ;;
      2) run_safe "System health check" system_health_check ;;
      3) run_safe "Application health check" application_health_check ;;
      4) run_safe "System health check" system_health_check ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

quick_backup_menu() {
  while true; do
    set_breadcrumb "Home > Quick Actions > Backup Now"
    local opt
    opt="$(ui_menu_nav "Backup Now [immediate backup actions]" \
      "1" "Database backup [create db backup immediately]" \
      "2" "Full backup [backup app, db and config snapshot]" \
      "3" "Disaster recovery backup [full host-recoverable backup archive]" \
      "4" "Verify last backup [validate latest backup integrity]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Create database backup now" database_backup_now ;;
      2) run_safe "Create complete system backup" create_complete_system_backup ;;
      3) run_safe "Create disaster recovery backup" create_disaster_recovery_backup_full ;;
      4) run_safe "Verify backup integrity" verify_backup_integrity ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

quick_update_menu() {
  while true; do
    set_breadcrumb "Home > Quick Actions > Apply Update (Safe)"
    local opt
    opt="$(ui_menu_nav "Apply Update (Safe) [safe packaged updates]" \
      "1" "Safe full update [apply full package to match developer release]" \
      "2" "Update app + db only [skip lppadmin script update]" \
      "3" "Update lppadmin only [update admin scripts only]" \
      "4" "Preview update package [show package source and manifest info]" \
      "5" "Post-update verify [run health checks after update]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Update full package" run_update_component all ;;
      2) run_safe "Update app and database" run_update_component app-db ;;
      3) run_safe "Update lppadmin command" run_update_component lppadmin ;;
      4) run_safe "Update package preview" prepare_update_dist_dir_for_scope ;;
      5) run_safe "System health check" system_health_check ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

quick_actions_menu_v2() {
  while true; do
    set_breadcrumb "Home > Quick Actions"
    local opt
    opt="$(ui_menu_nav "Quick Actions [most frequently used actions]" \
      "1" "Status summary [view current system status quickly]" \
      "2" "Restart app [restart app safely with minimal steps]" \
      "3" "View logs [open live and recent log views]" \
      "4" "Health check [run quick or full diagnostics]" \
      "5" "Backup now [create immediate backup artifacts]" \
      "6" "Apply update (safe) [apply packaged updates safely]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) quick_status_menu ;;
      2) quick_restart_menu ;;
      3) quick_logs_menu ;;
      4) quick_health_menu ;;
      5) quick_backup_menu ;;
      6) quick_update_menu ;;
      *) warn "Invalid option" ;;
    esac
  done
}

guided_update_wizard_all() {
  run_safe "Backup before update" create_complete_system_backup || return 1
  run_safe "Execute full update" run_update_component all || return 1
  run_safe "Verify DB migrations" database_migrations_status || return 1
  run_safe "Restart needed services" stack_action restart || return 1
  run_safe "Health and smoke test" system_health_check || return 1
}

guided_tasks_menu_v2() {
  while true; do
    set_breadcrumb "Home > Guided Tasks"
    local opt
    opt="$(ui_menu_nav "Guided Tasks [step-by-step workflows]" \
      "1" "First-time setup wizard [run guided setup sequence]" \
      "2" "Update wizard [guided package update workflow]" \
      "3" "TLS/SSL wizard [guided certificate setup and checks]" \
      "4" "Disaster recovery wizard [guided backup and restore workflows]" \
      "5" "Secrets setup wizard [guided required secrets setup]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Guided production install wizard" guided_production_install_wizard ;;
      2)
        while true; do
          set_breadcrumb "Home > Guided Tasks > Update Wizard"
          local uopt
          uopt="$(ui_menu_nav "Update Wizard [guided full update sequence]" \
            "1" "One-click full update flow [backup -> update -> verify -> restart -> health]" \
            "2" "Backup before update [create complete system backup]" \
            "3" "Execute full update [apply all package components]" \
            "4" "Verify db migrations [check migration state]" \
            "5" "Restart needed services [restart stack components]" \
            "6" "Health + smoke test [validate app and services]")" || break
          if is_back_selected "$uopt"; then break; fi
          case "$uopt" in
            1) guided_update_wizard_all ;;
            2) run_safe "Backup before update" create_complete_system_backup ;;
            3) run_safe "Execute full update" run_update_component all ;;
            4) run_safe "Verify DB migrations" database_migrations_status ;;
            5) run_safe "Restart needed services" stack_action restart ;;
            6) run_safe "Health and smoke test" system_health_check ;;
            *) warn "Invalid option" ;;
          esac
          ui_pause
        done
        ;;
      3) run_safe "TLS certificate manager" tls_certificate_manager ;;
      4)
        while true; do
          set_breadcrumb "Home > Guided Tasks > Disaster Recovery Wizard"
          local dropt
          dropt="$(ui_menu_nav "Disaster Recovery Wizard [full backup and restore]" \
            "1" "Create DR backup [full disaster recovery archive]" \
            "2" "Create encrypted DR backup [encrypted DR archive]" \
            "3" "Restore DR backup [guided DR restore]" \
            "4" "Post-restore validation [run health checks after restore]")" || break
          if is_back_selected "$dropt"; then break; fi
          case "$dropt" in
            1) run_safe "Create disaster recovery backup" create_disaster_recovery_backup_full ;;
            2) run_safe "Create encrypted DR backup" run_cmd_step_sh "Run encrypted DR backup script" "bash '$SCOPE_SCRIPTS/dr-backup.sh' --encrypt" ;;
            3) run_safe "Restore disaster recovery backup" restore_disaster_recovery_backup_full ;;
            4) run_safe "Post-restore validation" system_health_check ;;
            *) warn "Invalid option" ;;
          esac
          ui_pause
        done
        ;;
      5) run_safe "Manage secrets" secrets_menu ;;
      *) warn "Invalid option" ;;
    esac
  done
}

operations_services_menu_v2() {
  while true; do
    set_breadcrumb "Home > Operations > Services"
    local opt
    opt="$(ui_menu_nav "Services [service lifecycle operations]" \
      "1" "System status [show service and port status summary]" \
      "2" "Start full stack [start app and dependent services]" \
      "3" "Stop full stack [stop app and dependent services]" \
      "4" "Restart full stack [restart app and dependent services]" \
      "5" "Start app service [start app service only]" \
      "6" "Stop app service [stop app service only]" \
      "7" "Restart app service [restart app service only]" \
      "8" "Service logs [show and follow service logs]" \
      "9" "Recreate/repair service unit [rewrite systemd unit if needed]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "System status overview" system_status_overview ;;
      2) run_safe "Start full stack components" stack_action start ;;
      3) run_safe "Stop full stack components" stack_action stop ;;
      4) run_safe "Restart full stack components" stack_action restart ;;
      5) run_safe "App service start only" service_action start ;;
      6) run_safe "App service stop only" service_action stop ;;
      7) run_safe "App service restart only" service_action restart ;;
      8) run_safe "Service logs" service_action logs ;;
      9) run_safe "Create/update systemd service" create_or_update_systemd_unit ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

operations_application_checks_menu_v2() {
  while true; do
    set_breadcrumb "Home > Operations > Application Checks"
    local opt
    opt="$(ui_menu_nav "Application Checks [app and integration diagnostics]" \
      "1" "Application health check [run app health diagnostics]" \
      "2" "Run all integration tests [test all integrations]" \
      "3" "Gemini integration test [verify Gemini API integration]" \
      "4" "MailerSend integration test [verify email provider integration]" \
      "5" "Gamma integration test [verify Gamma integration]" \
      "6" "YOCO integration test [verify YOCO payment integration]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Application health check" application_health_check ;;
      2) run_safe "Run all integration tests" run_all_integration_tests ;;
      3) run_safe "Test Gemini integration" test_gemini_integration ;;
      4) run_safe "Test MailerSend integration" test_mailersend_integration ;;
      5) run_safe "Test Gamma integration" test_gamma_integration ;;
      6) run_safe "Test YOCO integration" test_yoco_integration ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

operations_database_menu_v2() {
  while true; do
    set_breadcrumb "Home > Operations > Database"
    local opt
    opt="$(ui_menu_nav "Database [database administration and maintenance]" \
      "1" "DB connectivity/status [run db status checks]" \
      "2" "Create DB backup [create a database backup]" \
      "3" "List DB backups [show available database backups]" \
      "4" "Restore DB backup [restore selected database backup]" \
      "5" "Restore dry-run [validate restore readiness]" \
      "6" "Migration status [show migration state]" \
      "7" "Apply packaged app+db update [no direct migration execution]" \
      "8" "Table row counts [show row counts for key tables]" \
      "9" "Slow query snapshot [capture slow query view]" \
      "10" "Enable slow query extension [enable pg_stat_statements]" \
      "11" "VACUUM ANALYZE [run database vacuum analyze]" \
      "12" "DB user management [manage DB roles and privileges]" \
      "13" "DB table management [inspect and edit table content]" \
      "14" "Advanced DB maintenance [session/locks/index diagnostics]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Database status/connectivity" database_status_overview ;;
      2) run_safe "Create database backup now" database_backup_now ;;
      3) run_safe "List database backups" list_database_backups ;;
      4) run_safe "Restore database from backup" restore_database_backup ;;
      5) run_safe "Restore dry-run check" database_restore_dry_run ;;
      6) run_safe "Migration status" database_migrations_status ;;
      7) run_safe "Update app and database" run_update_component app-db ;;
      8) run_safe "Table row counts" database_table_row_counts ;;
      9) run_safe "Slow query snapshot" database_slow_query_snapshot ;;
      10) run_safe "Enable slow query extension" enable_slow_query_extension ;;
      11) run_safe "VACUUM ANALYZE" database_vacuum_analyze ;;
      12) db_user_management_menu ;;
      13) db_table_management_menu ;;
      14) db_maintenance_advanced_menu ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

operations_security_menu_v2() {
  while true; do
    set_breadcrumb "Home > Operations > Security"
    local opt
    opt="$(ui_menu_nav "Security [secrets, TLS and sync controls]" \
      "1" "Secrets manager [manage secrets values and audits]" \
      "2" "TLS manager [configure and inspect TLS certificates]" \
      "3" "Infisical sync [sync secrets from Infisical]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Manage secrets" secrets_menu ;;
      2) run_safe "TLS certificate manager" tls_certificate_manager ;;
      3) run_safe "Sync secrets from Infisical" sync_secrets_from_infisical ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

operations_environment_menu_v2() {
  while true; do
    set_breadcrumb "Home > Operations > Environment"
    local opt
    opt="$(ui_menu_nav "Environment (.env) [runtime environment management]" \
      "1" "Edit key env settings [interactive env key editor]" \
      "2" "Apply recommended defaults [set default scope env values]" \
      "3" "Show effective runtime values [show key env values]" \
      "4" "Validate critical env keys [check required values]" \
      "5" "Backup current env file [create timestamped env backup]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Edit environment settings" prompt_edit_env ;;
      2) run_safe "Apply recommended dev defaults" configure_scope_defaults ;;
      3) run_safe "Show scope summary" show_scope_summary ;;
      4) run_safe "Validate required secrets" validate_required_secrets ;;
      5) run_safe "Backup env file" backup_single_file "$SCOPE_ENV" "env" ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

operations_menu_v2() {
  while true; do
    set_breadcrumb "Home > Operations"
    local opt
    opt="$(ui_menu_nav "Operations [direct administration modules]" \
      "1" "Services [service lifecycle controls]" \
      "2" "Application checks [health and integration tests]" \
      "3" "Database [database administration and maintenance]" \
      "4" "Security [secrets, tls and sync]" \
      "5" "Environment (.env) [runtime env configuration]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) operations_services_menu_v2 ;;
      2) operations_application_checks_menu_v2 ;;
      3) operations_database_menu_v2 ;;
      4) operations_security_menu_v2 ;;
      5) operations_environment_menu_v2 ;;
      *) warn "Invalid option" ;;
    esac
  done
}

updates_recovery_menu_v2() {
  while true; do
    set_breadcrumb "Home > Updates & Recovery"
    local opt
    opt="$(ui_menu_nav "Updates & Recovery [update and restore workflows]" \
      "1" "Safe full update [apply full package with verification]" \
      "2" "Update app + db only [apply app/database package parts]" \
      "3" "Update lppadmin only [apply admin script updates]" \
      "4" "Apply update package [auto-detect and apply package]" \
      "5" "Rollback / restore [rollback snapshots and restore backups]" \
      "6" "Backup policy [configure backup settings]" \
      "7" "Verify backup integrity [validate backup archives]" \
      "8" "Update preview and source info [show package source details]" \
      "9" "Security patches [check/apply/report patching workflow]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Update full package" run_update_component all ;;
      2) run_safe "Update app and database" run_update_component app-db ;;
      3) run_safe "Update lppadmin command" run_update_component lppadmin ;;
      4) run_safe "Apply update package" apply_update_package ;;
      5)
        while true; do
          set_breadcrumb "Home > Updates & Recovery > Rollback / Restore"
          local ropt
          ropt="$(ui_menu_nav "Rollback / Restore [recovery operations]" \
            "1" "Rollback from snapshot [restore previous app/db snapshot]" \
            "2" "Restore database backup [restore selected DB backup]" \
            "3" "Restore complete backup [restore complete system backup]" \
            "4" "Restore DR backup [restore disaster recovery backup]")" || break
          if is_back_selected "$ropt"; then break; fi
          case "$ropt" in
            1) run_safe "Rollback from snapshot" rollback_from_snapshot ;;
            2) run_safe "Restore database from backup" restore_database_backup ;;
            3) run_safe "Restore complete system backup" rollback_from_snapshot ;;
            4) run_safe "Restore disaster recovery backup" restore_disaster_recovery_backup_full ;;
            *) warn "Invalid option" ;;
          esac
          ui_pause
        done
        ;;
      6) run_safe "Backup policy settings" configure_backup_policy ;;
      7) run_safe "Verify backup integrity" verify_backup_integrity ;;
      8) run_safe "Update package preview" prepare_update_dist_dir_for_scope ;;
      9) security_patches_menu_v2 ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

misc_environment_profile_menu() {
  while true; do
    set_breadcrumb "Home > Misc > Environment Profile Manager"
    local opt
    opt="$(ui_menu_nav "Environment Profile Manager [manage cached environment profile]" \
      "1" "Detect/refresh environment profile [auto-detect and rewrite profile]" \
      "2" "Show environment profile [display current profile values]" \
      "3" "Edit environment details [manually update profile fields]" \
      "4" "Reset to auto-detect defaults [remove overrides and re-detect]" \
      "5" "Validate profile health [check profile paths and consistency]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Refresh environment profile" refresh_environment_profile ;;
      2) run_safe "Show environment profile" show_environment_profile ;;
      3) run_safe "Edit environment profile" edit_environment_profile ;;
      4) run_safe "Reset environment profile" reset_environment_profile ;;
      5) run_safe "Environment profile health check" environment_profile_health_check ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

misc_performance_menu_v2() {
  while true; do
    set_breadcrumb "Home > Misc > Performance Tuning (Advanced)"
    local opt
    opt="$(ui_menu_nav "Performance Tuning (Advanced) [cpu+ram based optimization]" \
      "1" "Analyze current performance [collect runtime performance metrics]" \
      "2" "Generate tuning plan [derive recommended values from CPU and RAM]" \
      "3" "Preview current vs proposed values [show tuning diffs]" \
      "4" "Apply tuning plan [apply recommended tuning values]" \
      "5" "Post-tuning verification [run health checks after tuning]" \
      "6" "Revert tuning [restore previous env and service settings]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Performance analysis" performance_analysis ;;
      2) run_safe "Performance tuning recommendations" performance_tuning_recommendations ;;
      3) run_safe "Performance tuning recommendations" performance_tuning_recommendations ;;
      4) run_safe "Apply performance tuning" apply_performance_tuning ;;
      5) run_safe "System health check" system_health_check ;;
      6) run_safe "Revert tuning (env restore)" rollback_from_snapshot ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

misc_menu_v2() {
  while true; do
    set_breadcrumb "Home > Misc"
    local opt
    if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
      opt="$(ui_menu_nav "Misc [less-used and advanced tools]" \
        "1" "Environment profile manager [detect, view and edit cached environment]" \
        "2" "Performance tuning (advanced) [cpu+ram based system tuning]" \
        "3" "OS package updates (advanced) [apt package maintenance]" \
        "4" "Variant isolation tools [check and repair variant isolation]" \
        "5" "Action history / change journal [view historical actions and changes]" \
        "6" "Health alerts [configure and test alerting]")" || return 0
    else
      opt="$(ui_menu_nav "Misc [less-used and advanced tools]" \
        "1" "Environment profile manager [detect, view and edit cached environment]" \
        "2" "Performance tuning (advanced) [cpu+ram based system tuning]" \
        "3" "OS package updates (advanced) [apt package maintenance]" \
        "4" "Variant isolation tools [check and repair variant isolation]" \
        "5" "Action history / change journal [view historical actions and changes]" \
        "6" "Health alerts [configure and test alerting]" \
        "7" "Script runner (expert) [run variant scripts directly]" \
        "8" "Dev build/deploy tools [developer build and packaging tasks]")" || return 0
    fi
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) misc_environment_profile_menu ;;
      2) misc_performance_menu_v2 ;;
      3) run_safe "Update OS packages only" update_system_packages ;;
      4) run_safe "Variant isolation health check" variant_isolation_health_check ;;
      5) run_safe "Show action history" show_action_history; run_safe "Show change journal" show_change_journal ;;
      6) run_safe "Configure health alerts" configure_health_alerts ;;
      7)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          warn "Script runner is disabled on installed runtime profiles."
        else
          run_safe "Run variant script" run_variant_script_menu
        fi
        ;;
      8)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          warn "Build/deploy developer tools are disabled on installed runtime profiles."
        else
          run_safe "Build and deployment" build_deploy_admin_menu
        fi
        ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

help_menu_v2() {
  while true; do
    set_breadcrumb "Home > Help"
    local opt
    opt="$(ui_menu_nav "Help [usage and workflow guidance]" \
      "1" "What each option does [high-level module descriptions]" \
      "2" "Common workflows [quick guides for frequent tasks]" \
      "3" "Command reference [direct CLI command usage]" \
      "4" "Show current environment setup [display active scope/profile]")" || return 0
    if is_back_selected "$opt"; then return 0; fi
    case "$opt" in
      1) run_safe "Help" show_help ;;
      2) run_safe "Help" show_help ;;
      3) run_safe "CLI help" show_cli_help ;;
      4) run_safe "Show environment profile" show_environment_profile ;;
      *) warn "Invalid option" ;;
    esac
    ui_pause
  done
}

main_menu_v2() {
  # Interactive menu navigation relies on helper functions that may return non-zero
  # for control flow (e.g. Back). Disable errexit while in menu loop to prevent
  # accidental process exit on valid navigation paths.
  local had_errexit=0
  case "$-" in
    *e*) had_errexit=1; set +e ;;
  esac
  while true; do
    set_breadcrumb "Home"
    local opt
    local home_title
    home_title="LearnPlay Administration (lppadmin ${LPPADMIN_VERSION})"$'\n'"Choose an administrative area."$'\n'"$(ui_home_status_panel)"
    opt="$(ui_menu_nav "$home_title" \
      "1" "Quick Actions [most frequently used actions]" \
      "2" "Guided Tasks [step-by-step workflows]" \
      "3" "Operations [direct administration modules]" \
      "4" "Updates & Recovery [update and restore management]" \
      "5" "Misc [less-used and advanced tools]" \
      "6" "Security patches [weekly patch check/apply/report]" \
      "7" "Help [option guidance and command reference]")" || exit 0
    if is_back_selected "$opt"; then continue; fi
    case "$opt" in
      1) quick_actions_menu_v2 ;;
      2) guided_tasks_menu_v2 ;;
      3) operations_menu_v2 ;;
      4) updates_recovery_menu_v2 ;;
      5) misc_menu_v2 ;;
      6) security_patches_menu_v2 ;;
      7) help_menu_v2 ;;
      *) warn "Invalid option" ;;
    esac
  done
  if [ "$had_errexit" -eq 1 ]; then
    set -e
  fi
}

scope_menu() {
  while true; do
    local opt summary
    if [ "$USE_WHIPTAIL" -eq 1 ]; then
      ensure_env_exists
      local app_ver
      app_ver="$(display_release_version "$(installed_app_version)")"
      summary="Workspace: ${SCOPE_ROOT}
Env file: ${SCOPE_ENV}
Service: ${SCOPE_SERVICE}
App version: ${app_ver}
BASE_URL: $(env_get BASE_URL)
PORT: $(env_get PORT)"
      if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
        opt="$(ui_menu "${SCOPE_LABEL} Administration" "$summary" \
          "1" "System Administration" \
          "2" "Database Administration" \
          "3" "Security Administration" \
          "4" "Application Administration" \
          "5" "Performance Administration" \
          "6" "Environment Administration" \
          "7" "Update Management (package updates)" \
          "8" "Backup and Recovery" \
          "9" "Maintenance Administration" \
          "0" "Back")" || return 0
      else
        opt="$(ui_menu "${SCOPE_LABEL} Administration" "$summary" \
          "1" "System Administration" \
          "2" "Database Administration" \
          "3" "Security Administration" \
          "4" "Application Administration" \
          "5" "Performance Administration" \
          "6" "Environment Administration" \
          "7" "Build and Deployment" \
          "8" "Backup and Recovery" \
          "9" "Maintenance Administration" \
          "0" "Back")" || return 0
      fi
    else
      show_scope_summary
      if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
        opt="$(ui_menu "${SCOPE_LABEL} Menu" "Choose an action" \
          "1" "System Administration" \
          "2" "Database Administration" \
          "3" "Security Administration" \
          "4" "Application Administration" \
          "5" "Performance Administration" \
          "6" "Environment Administration" \
          "7" "Update Management (package updates)" \
          "8" "Backup and Recovery" \
          "9" "Maintenance Administration" \
          "0" "Back")"
      else
        opt="$(ui_menu "${SCOPE_LABEL} Menu" "Choose an action" \
          "1" "System Administration" \
          "2" "Database Administration" \
          "3" "Security Administration" \
          "4" "Application Administration" \
          "5" "Performance Administration" \
          "6" "Environment Administration" \
          "7" "Build and Deployment" \
          "8" "Backup and Recovery" \
          "9" "Maintenance Administration" \
          "0" "Back")"
      fi
    fi
    case "$opt" in
      1) run_safe "System Administration" system_admin_menu ;;
      2) run_safe "Database Administration" database_admin_menu ;;
      3) run_safe "Security Administration" security_admin_menu ;;
      4) run_safe "Application Administration" application_admin_menu ;;
      5) run_safe "Performance Administration" performance_admin_menu ;;
      6) run_safe "Environment Administration" environment_admin_menu ;;
      7)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Update Management" update_management_menu
        else
          run_safe "Build and Deployment" build_deploy_admin_menu
        fi
        ;;
      8)
        if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
          run_safe "Backup and Recovery" backup_recovery_menu
        else
          run_safe "Backup and Recovery" backup_recovery_menu
        fi
        ;;
      9)
        run_safe "Maintenance Administration" maintenance_admin_menu
        ;;
      0) return ;;
      *) warn "Invalid option" ;;
    esac
  done
}

main_menu() {
  while true; do
    local opt
    local prompt
    prompt="$(main_brand_banner)"
    prompt+=$'\n\nSelect the system or task to manage'
    if [ "$LPPADMIN_PROFILE" = "installed_runtime" ]; then
      opt="$(ui_menu "LearnPlay Administration (lppadmin ${LPPADMIN_VERSION})" "$prompt" \
        "1" "Dashboard" \
        "2" "Manage Cloud system" \
        "3" "Cloud secrets (quick access)" \
        "4" "Apply update package (/tmp/learnplay*.tar.gz)" \
        "5" "Help" \
        "0" "Exit")" || exit 0
      case "$opt" in
        1) run_safe "Main dashboard" main_dashboard ;;
        2) select_scope cloud; scope_menu ;;
        3) select_scope cloud; secrets_menu ;;
        4) select_scope cloud; run_safe "Apply update package" apply_update_package ;;
        5) show_help ;;
        0) exit 0 ;;
        *) warn "Invalid option" ;;
      esac
    else
      opt="$(ui_menu "LearnPlay Administration (lppadmin ${LPPADMIN_VERSION})" "$prompt" \
        "1" "Dashboard (Cloud)" \
        "2" "Manage Cloud workspace" \
        "3" "Cloud secrets (quick access)" \
        "4" "Install/update /usr/local/bin/lppadmin" \
        "5" "Help" \
        "6" "Infisical OSS guide" \
        "0" "Exit")" || exit 0
      case "$opt" in
        1) run_safe "Main dashboard" main_dashboard ;;
        2) select_scope cloud; scope_menu ;;
        3) select_scope cloud; secrets_menu ;;
        4) install_global_command ;;
        5) show_help ;;
        6) show_infisical_help ;;
        0) exit 0 ;;
        *) warn "Invalid option" ;;
      esac
    fi
  done
}

main() {
  require_root
  cleanup_tmp_artifacts
  ui_init
  detect_lppadmin_profile
  load_global_conf
  if ! load_environment_profile; then
    refresh_environment_profile
    load_environment_profile || true
  fi
  check_admin_parity

  if [ "${1:-}" = "--install-command" ] || [ "${1:-}" = "install-command" ]; then
    run_safe "Install/update lppadmin command" install_global_command
    exit 0
  fi
  if [ "${1:-}" = "--self-check" ] || [ "${1:-}" = "self-check" ]; then
    echo "LPPADMIN_PROFILE=${LPPADMIN_PROFILE}"
    echo "HAS_CLOUD_SCOPE=${HAS_CLOUD_SCOPE}"
    echo "HAS_ONPREM_SCOPE=${HAS_ONPREM_SCOPE}"
    if command -v psql >/dev/null 2>&1; then
      PG_DATA_DIR="$(sudo -u postgres psql -tAc 'SHOW data_directory;' 2>/dev/null | tr -d '[:space:]' || true)"
      PG_LOG_DIR="$(sudo -u postgres psql -tAc 'SHOW log_directory;' 2>/dev/null | tr -d '[:space:]' || true)"
      echo "POSTGRES_DATA_DIRECTORY=${PG_DATA_DIR:-unknown}"
      echo "POSTGRES_LOG_DIRECTORY=${PG_LOG_DIR:-unknown}"
    else
      echo "POSTGRES_DATA_DIRECTORY=psql-not-available"
      echo "POSTGRES_LOG_DIRECTORY=psql-not-available"
    fi
    exit 0
  fi

  if [ "${1:-}" != "" ]; then
    run_cli_command "${1}" "${2:-}"
    exit $?
  fi

  if [ "$LPPADMIN_PROFILE" = "dev_workspace" ]; then
    err "Dev workspace requires explicit scope. Use: sudo lppadmin cloud  OR  sudo lppadmin onprem"
    exit 1
  fi

  # Default interactive entrypoint is OnPrem menu when scope is omitted.
  select_scope onprem || select_scope cloud
  main_menu_v2
}

main "$@"
