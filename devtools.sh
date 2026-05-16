#!/usr/bin/env bash
set -euo pipefail

DEVTOOLS_VERSION="2026.04.29.1"
DEVADMIN="${DEVADMIN:-/usr/local/bin/devadmin}"
WSL_DEVADMIN="${WSL_DEVADMIN:-/antigravity/Cloud-On-Prem/scripts/dev-workspace/wsl-devadmin.sh}"
ACTIVE_SCOPE="${DEVTOOLS_SCOPE:-all}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$1"; }
err() { printf '\033[0;31mERROR:\033[0m %s\n' "$1" >&2; }
ok() { printf '\033[0;32mOK:\033[0m %s\n' "$1"; }

require_devadmin() {
  if [ ! -x "$DEVADMIN" ]; then
    err "devadmin not found or not executable: $DEVADMIN"
    exit 1
  fi
}

workspace_user() {
  local owner
  owner="$(stat -c '%U' /antigravity/Cloud-On-Prem 2>/dev/null || true)"
  if [ -n "$owner" ] && [ "$owner" != "root" ]; then
    printf '%s' "$owner"
    return 0
  fi
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    printf '%s' "$SUDO_USER"
    return 0
  fi
  printf 'lppadmin'
}

run_as_workspace_user() {
  local cmd="$1"
  local u
  u="$(workspace_user)"
  if [ "$(id -u)" -eq 0 ] && [ "$u" != "root" ]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "$u" -- /bin/bash -lc "$cmd"
    else
      su -s /bin/bash - "$u" -c "$cmd"
    fi
  else
    /bin/bash -lc "$cmd"
  fi
}

run_action() {
  local label="$1"
  shift
  printf "\n"
  bold "Running: ${label}"
  "$@"
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "${label} completed"
  else
    err "${label} failed with exit code ${rc}"
  fi
  return "$rc"
}

scope_label() {
  case "${1:-all}" in
    cloud) printf 'Cloud' ;;
    onprem) printf 'OnPrem' ;;
    all) printf 'Cloud + OnPrem' ;;
    *) printf '%s' "$1" ;;
  esac
}

run_for_scope() {
  local scope="$1"
  shift
  case "$scope" in
    cloud|onprem) "$@" "$scope" ;;
    all)
      "$@" cloud
      "$@" onprem
      ;;
    *) err "Invalid scope: $scope"; return 1 ;;
  esac
}

choose_scope() {
  local prompt="${1:-Scope}"
  local scope
  printf "\n" >&2
  echo "  1) Cloud" >&2
  echo "  2) OnPrem" >&2
  echo "  3) Cloud + OnPrem" >&2
  printf "%s [1-3]: " "$prompt" >&2
  read -r scope || return 1
  case "$scope" in
    1|cloud|Cloud) printf 'cloud' ;;
    2|onprem|OnPrem|onpremise) printf 'onprem' ;;
    3|all|both|Both) printf 'all' ;;
    *) warn "Invalid scope: $scope"; return 1 ;;
  esac
}

change_active_scope() {
  local scope
  scope="$(choose_scope "Active scope")" || return 1
  ACTIVE_SCOPE="$scope"
  ok "Active scope set to $(scope_label "$ACTIVE_SCOPE")"
}

print_active_scope() {
  echo "Current scope: $(scope_label "$ACTIVE_SCOPE")"
}

local_dev_menu() {
  local opt
  while true; do
    printf "\n"
    bold "Local DEV"
    print_active_scope
    echo "  1) Restart local WSL apps"
    echo "  2) Show local app status"
    echo "  3) Show local app log paths"
    echo "  s) Change scope"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-3, s, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Restart $(scope_label "$ACTIVE_SCOPE") DEV apps" bash "$WSL_DEVADMIN" update-dev "$ACTIVE_SCOPE" ;;
      2) run_action "Show $(scope_label "$ACTIVE_SCOPE") DEV status" bash "$WSL_DEVADMIN" system-status "$ACTIVE_SCOPE" ;;
      3) run_action "Show $(scope_label "$ACTIVE_SCOPE") DEV logs" bash "$WSL_DEVADMIN" system-logs "$ACTIVE_SCOPE" ;;
      s) change_active_scope ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

build_deploy_dev_scope() {
  run_as_workspace_user "bash $(printf '%q' "$WSL_DEVADMIN") build-deploy-dev $(printf '%q' "$1")"
}

build_deploy_dev_menu() {
  local opt
  while true; do
    printf "\n"
    bold "Build + Deploy To DEV"
    print_active_scope
    echo "  1) Build package, run DB migrations, restart DEV apps"
    echo "  s) Change scope"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1, s, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Build + deploy $(scope_label "$ACTIVE_SCOPE") to DEV" build_deploy_dev_scope "$ACTIVE_SCOPE" ;;
      s) change_active_scope ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

build_packages_menu() {
  local opt
  while true; do
    printf "\n"
    bold "Build Packages"
    print_active_scope
    echo "  1) Build package"
    echo "  2) List packages"
    echo "  3) Verify package checksums"
    echo "  s) Change scope"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-3, s, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Build $(scope_label "$ACTIVE_SCOPE") packages" build_scope "$ACTIVE_SCOPE" ;;
      2) run_action "List $(scope_label "$ACTIVE_SCOPE") packages" "$DEVADMIN" list "$ACTIVE_SCOPE" ;;
      3) run_action "Verify $(scope_label "$ACTIVE_SCOPE") packages" "$DEVADMIN" verify "$ACTIVE_SCOPE" ;;
      s) change_active_scope ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

build_scope() {
  case "$1" in
    cloud) "$DEVADMIN" build-cloud ;;
    onprem) "$DEVADMIN" build-onprem ;;
    all) "$DEVADMIN" build-all ;;
    *) err "Invalid scope: $1"; return 1 ;;
  esac
}

deploy_acc_scope() {
  "$DEVADMIN" github-deploy-acc "$1"
}

deploy_prd_scope() {
  "$DEVADMIN" github-deploy-prd "$1"
}

full_rollout_scope() {
  "$DEVADMIN" deploy-all "$1"
}

deploy_menu() {
  local title="$1"
  local action="$2"
  local opt
  while true; do
    printf "\n"
    bold "$title"
    print_active_scope
    echo "  1) Run for current scope"
    echo "  s) Change scope"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1, s, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) ;;
      s) change_active_scope; continue ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt"; continue ;;
    esac
    case "$action" in
      acc) run_action "Deploy $(scope_label "$ACTIVE_SCOPE") to ACC" run_for_scope "$ACTIVE_SCOPE" deploy_acc_scope ;;
      prd) run_action "Deploy $(scope_label "$ACTIVE_SCOPE") to PRD" run_for_scope "$ACTIVE_SCOPE" deploy_prd_scope ;;
      full) run_action "Full landscape rollout for $(scope_label "$ACTIVE_SCOPE")" run_for_scope "$ACTIVE_SCOPE" full_rollout_scope ;;
      *) err "Invalid deploy action: $action"; return 1 ;;
    esac
  done
}

compare_3way_scope() {
  "$DEVADMIN" compare-versions-3way "$1"
}

compare_acc_scope() {
  "$DEVADMIN" compare-versions "$1"
}

compare_prd_scope() {
  "$DEVADMIN" compare-versions-prd "$1"
}

targets_checks_menu() {
  local opt
  while true; do
    printf "\n"
    bold "Targets & Checks"
    print_active_scope
    echo "  1) Show ACC/PRD targets"
    echo "  2) Compare DEV vs ACC versions + DB tables/columns/enums"
    echo "  3) Compare DEV vs PRD versions + DB tables/columns/enums"
    echo "  4) Compare DEV vs ACC vs PRD versions + DB tables/columns/enums"
    echo "  5) Verify latest package checksums"
    echo "  s) Change scope"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-5, s, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Show ACC/PRD targets" "$DEVADMIN" env-show all ;;
      2) run_action "Compare DEV vs ACC for $(scope_label "$ACTIVE_SCOPE")" run_for_scope "$ACTIVE_SCOPE" compare_acc_scope ;;
      3) run_action "Compare DEV vs PRD for $(scope_label "$ACTIVE_SCOPE")" run_for_scope "$ACTIVE_SCOPE" compare_prd_scope ;;
      4) run_action "Compare DEV vs ACC vs PRD for $(scope_label "$ACTIVE_SCOPE")" run_for_scope "$ACTIVE_SCOPE" compare_3way_scope ;;
      5) run_action "Verify latest package checksums for $(scope_label "$ACTIVE_SCOPE")" "$DEVADMIN" verify "$ACTIVE_SCOPE" ;;
      s) change_active_scope ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

main_menu() {
  local opt
  while true; do
    printf "\n"
    bold "LearnPlay DevTools ${DEVTOOLS_VERSION}"
    print_active_scope
    echo "  1) Local DEV"
    echo "  2) Build Packages"
    echo "  3) Build + Deploy To DEV"
    echo "  4) Roll Out To ACC"
    echo "  5) Roll Out To PRD"
    echo "  6) Full Landscape Rollout"
    echo "  7) Targets & Checks"
    echo "  s) Change scope"
    echo "  x) Exit"
    read -rp "Select action [1-7, s, x]: " opt || exit 0
    case "${opt,,}" in
      1) local_dev_menu ;;
      2) build_packages_menu ;;
      3) build_deploy_dev_menu ;;
      4) deploy_menu "Roll Out To ACC" acc ;;
      5) deploy_menu "Roll Out To PRD" prd ;;
      6) deploy_menu "Full Landscape Rollout" full ;;
      7) targets_checks_menu ;;
      s) change_active_scope ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

main() {
  if [ "$(id -u)" -ne 0 ]; then
    exec sudo "$0" "$@"
  fi
  require_devadmin
  case "${1:-menu}" in
    menu|-h|--help|help) main_menu ;;
    *) err "Unknown command: $1"; exit 1 ;;
  esac
}

main "$@"
