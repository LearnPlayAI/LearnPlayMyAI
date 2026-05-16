#!/usr/bin/env bash
set -euo pipefail

DEVADMIN_VERSION="2026.03.22.8"
WORKSPACE_ROOT="/antigravity/Cloud-On-Prem"
PACKAGES_ROOT="/antigravity/packages"
DEVADMIN_PACKAGE_RETENTION_COUNT="${DEVADMIN_PACKAGE_RETENTION_COUNT:-24}"
LOG_DIR="/var/log/learnplay-admin/devadmin"
DEVADMIN_SOURCE_SCRIPT="/antigravity/devadmin.sh"
DEVADMIN_COMMAND_PATH="/usr/local/bin/devadmin"
DEFAULT_ACC_HOST="${DEFAULT_ACC_HOST:-}"
DEFAULT_ACC_CLOUD_HOST="${DEFAULT_ACC_CLOUD_HOST:-$DEFAULT_ACC_HOST}"
DEFAULT_ACC_ONPREM_HOST="${DEFAULT_ACC_ONPREM_HOST:-$DEFAULT_ACC_HOST}"
DEFAULT_ACC_USER="${DEFAULT_ACC_USER:-}"
DEFAULT_PRD_HOST="${DEFAULT_PRD_HOST:-}"
DEFAULT_PRD_CLOUD_HOST="${DEFAULT_PRD_CLOUD_HOST:-$DEFAULT_PRD_HOST}"
DEFAULT_PRD_ONPREM_HOST="${DEFAULT_PRD_ONPREM_HOST:-$DEFAULT_PRD_HOST}"
DEFAULT_PRD_USER="${DEFAULT_PRD_USER:-}"
TARGETS_CONF_DIR="/etc/learnplay-admin"
TARGETS_CONF_FILE="${TARGETS_CONF_DIR}/devadmin-targets.env"
TARGETS_SECRETS_KEY_FILE="${TARGETS_CONF_DIR}/devadmin-targets.key"
TARGETS_SECRETS_FILE="${TARGETS_CONF_DIR}/devadmin-targets.secrets.enc"
PROMOTION_STATE_FILE="${TARGETS_CONF_DIR}/devadmin-promotions.env"
DR_SCRIPTS_DIR="/antigravity/scripts/dr"
GITHUB_STATE_FILE="${TARGETS_CONF_DIR}/devadmin-github.env"
LAST_ACTION_STATUS=0
DEFAULT_GITHUB_REPO_ROOT="/antigravity"
GITHUB_REPO_ROOT="${DEFAULT_GITHUB_REPO_ROOT}"
GITHUB_DEFAULT_USERNAME="LearnPlayAI"
GITHUB_BACKUP_LOG_DIR="${LOG_DIR}/github"

if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo "ERROR: Workspace not found at $WORKSPACE_ROOT" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

ensure_devadmin_command_symlink() {
  # Keep devadmin as a live symlink to the workspace script (never a copied wrapper).
  if [ "$EUID" -ne 0 ]; then
    return 0
  fi
  if [ ! -f "$DEVADMIN_SOURCE_SCRIPT" ]; then
    return 0
  fi
  if [ -L "$DEVADMIN_COMMAND_PATH" ] && [ "$(readlink -f "$DEVADMIN_COMMAND_PATH" 2>/dev/null || true)" = "$(readlink -f "$DEVADMIN_SOURCE_SCRIPT")" ]; then
    return 0
  fi
  ln -sfn "$DEVADMIN_SOURCE_SCRIPT" "$DEVADMIN_COMMAND_PATH"
}

cleanup_tmp_artifacts() {
  # Remove stale temp dirs/files from interrupted devadmin/dr runs.
  find /tmp -maxdepth 1 -mindepth 1 -type d \
    \( -name 'devadmin-dr-verify.*' -o -name 'learnplay-dev-dr-bundle.*' -o -name 'learnplay-dev-dr-scripts.*' -o -name 'learnplay-dr-restore.*' \) \
    -mmin +240 -exec rm -rf {} + 2>/dev/null || true
  # Keep lppadmin step traces for a day, then prune.
  find /tmp -maxdepth 1 -mindepth 1 -type d -name 'lppadmin-steps-*' \
    -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
  # Prune stale dist extractions and transient diagnostics.
  find /tmp -maxdepth 1 -mindepth 1 -type d \
    \( -name 'dist-cloud' -o -name 'dist-onprem' \) \
    -mmin +720 -exec rm -rf {} + 2>/dev/null || true
  find /tmp -maxdepth 1 -mindepth 1 -type f \
    \( -name 'learnplay-dr-nginx-test.log' -o -name 'dr-postcheck-runtime-*.txt' \) \
    -mmin +240 -delete 2>/dev/null || true
}

apply_package_retention_for_scope() {
  local scope="${1:-}"
  local keep_count="${DEVADMIN_PACKAGE_RETENTION_COUNT:-24}"
  local pkg_dir prefix removed=0
  local -a pkgs=()

  [ -n "$scope" ] || return 0
  [[ "$keep_count" =~ ^[0-9]+$ ]] || keep_count=24
  [ "$keep_count" -ge 5 ] || keep_count=5

  pkg_dir="$(package_dir_for_scope "$scope")"
  prefix="$(package_prefix_for_scope "$scope")"
  [ -d "$pkg_dir" ] || return 0

  mapfile -t pkgs < <(ls -1t "$pkg_dir"/${prefix}*.tar.gz 2>/dev/null || true)
  if [ "${#pkgs[@]}" -le "$keep_count" ]; then
    return 0
  fi

  local idx pkg sha
  for ((idx=keep_count; idx<${#pkgs[@]}; idx+=1)); do
    pkg="${pkgs[$idx]}"
    [ -f "$pkg" ] || continue
    sha="${pkg}.sha256"
    rm -f "$pkg" 2>/dev/null || true
    rm -f "$sha" 2>/dev/null || true
    removed=$((removed + 1))
  done

  if [ "$removed" -gt 0 ]; then
    ok "Pruned ${removed} old $(scope_label "$scope") package artifact(s) (kept latest ${keep_count})"
  fi
}

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$1"; }
err() { printf '\033[0;31mERROR:\033[0m %s\n' "$1" >&2; }
ok() { printf '\033[0;32mOK:\033[0m %s\n' "$1"; }

legacy_parallel_path_blocked() {
  local cmd="${1:-legacy-command}"
  err "Command '${cmd}' is disabled."
  err "Legacy parallel update paths were removed."
  err "Use package architecture commands only: build-*, update-dev, update-acc, update-prd, deploy-all."
  return 1
}

scope_label() {
  case "${1:-}" in
    cloud) echo "Cloud" ;;
    onprem) echo "OnPrem" ;;
    *) echo "$1" ;;
  esac
}

ensure_target_is_configured() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  if [ -n "$host" ] && [ -n "$user" ]; then
    case "$scope" in
      cloud)
        if [[ "$host" == *-onprem-devadmin ]]; then
          err "Invalid ${scope}/${env_name} target host '${host}'. It appears to be an onprem alias."
          err "Use a cloud target (for example: acc-cloud-devadmin or prd-cloud-devadmin)."
          return 1
        fi
        ;;
      onprem)
        if [[ "$host" == *-cloud-devadmin ]]; then
          err "Invalid ${scope}/${env_name} target host '${host}'. It appears to be a cloud alias."
          err "Use an onprem target (for example: acc-onprem-devadmin or prd-onprem-devadmin)."
          return 1
        fi
        ;;
    esac
    return 0
  fi
  err "Missing ${scope}/${env_name} target host/user. Configure it in devadmin -> Environment Targets."
  return 1
}

target_alias_for_scope_env() {
  local scope="${1:-}"
  local env_name="${2:-}"
  case "${scope}:${env_name}" in
    cloud:acc) echo "acc-cloud-devadmin" ;;
    cloud:prd) echo "prd-cloud-devadmin" ;;
    onprem:acc) echo "acc-onprem-devadmin" ;;
    onprem:prd) echo "prd-onprem-devadmin" ;;
    *) return 1 ;;
  esac
}

target_alias_exists() {
  local alias="${1:-}"
  [ -n "$alias" ] || return 1
  run_as_workspace_user "ssh -G $(printf '%q' "$alias") >/dev/null 2>&1"
}

execution_target_host_for_scope_env() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local alias=""
  # Alias-first for ACC/PRD remote operations: use SSH config identity/options
  # even when saved target hosts are raw hostnames or user@host strings.
  alias="$(target_alias_for_scope_env "$scope" "$env_name" 2>/dev/null || true)"
  if [ -n "$alias" ] && target_alias_exists "$alias"; then
    echo "$alias"
    return 0
  fi
  if [ -n "$host" ]; then
    echo "$host"
    return 0
  fi
  echo ""
}

default_acc_host_for_scope() {
  local raw
  case "${1:-cloud}" in
    onprem)
      raw="${ACC_ONPREM_HOST:-$DEFAULT_ACC_ONPREM_HOST}"
      execution_target_host_for_scope_env onprem acc "$raw"
      ;;
    *)
      raw="${ACC_CLOUD_HOST:-$DEFAULT_ACC_CLOUD_HOST}"
      execution_target_host_for_scope_env cloud acc "$raw"
      ;;
  esac
}

default_prd_host_for_scope() {
  local raw
  case "${1:-cloud}" in
    onprem)
      raw="${PRD_ONPREM_HOST:-$DEFAULT_PRD_ONPREM_HOST}"
      execution_target_host_for_scope_env onprem prd "$raw"
      ;;
    *)
      raw="${PRD_CLOUD_HOST:-$DEFAULT_PRD_CLOUD_HOST}"
      execution_target_host_for_scope_env cloud prd "$raw"
      ;;
  esac
}

default_acc_user_for_scope() {
  case "${1:-cloud}" in
    onprem) echo "${ACC_ONPREM_USER:-$DEFAULT_ACC_USER}" ;;
    *) echo "${ACC_CLOUD_USER:-$DEFAULT_ACC_USER}" ;;
  esac
}

default_prd_user_for_scope() {
  case "${1:-cloud}" in
    onprem) echo "${PRD_ONPREM_USER:-$DEFAULT_PRD_USER}" ;;
    *) echo "${PRD_CLOUD_USER:-$DEFAULT_PRD_USER}" ;;
  esac
}

load_environment_targets() {
  ACC_CLOUD_HOST="$DEFAULT_ACC_CLOUD_HOST"
  ACC_CLOUD_USER="$DEFAULT_ACC_USER"
  ACC_ONPREM_HOST="$DEFAULT_ACC_ONPREM_HOST"
  ACC_ONPREM_USER="$DEFAULT_ACC_USER"
  PRD_CLOUD_HOST="$DEFAULT_PRD_CLOUD_HOST"
  PRD_CLOUD_USER="$DEFAULT_PRD_USER"
  PRD_ONPREM_HOST="$DEFAULT_PRD_ONPREM_HOST"
  PRD_ONPREM_USER="$DEFAULT_PRD_USER"
  ACC_CLOUD_PASSWORD=""
  ACC_ONPREM_PASSWORD=""
  PRD_CLOUD_PASSWORD=""
  PRD_ONPREM_PASSWORD=""
  TESTED_CLOUD_PACKAGE=""
  TESTED_ONPREM_PACKAGE=""

  if [ -f "$TARGETS_CONF_FILE" ]; then
    # shellcheck disable=SC1090
    source "$TARGETS_CONF_FILE"
  fi

  ACC_CLOUD_HOST="${ACC_CLOUD_HOST:-$DEFAULT_ACC_CLOUD_HOST}"
  ACC_CLOUD_USER="${ACC_CLOUD_USER:-$DEFAULT_ACC_USER}"
  ACC_ONPREM_HOST="${ACC_ONPREM_HOST:-$DEFAULT_ACC_ONPREM_HOST}"
  ACC_ONPREM_USER="${ACC_ONPREM_USER:-$DEFAULT_ACC_USER}"
  PRD_CLOUD_HOST="${PRD_CLOUD_HOST:-$DEFAULT_PRD_CLOUD_HOST}"
  PRD_CLOUD_USER="${PRD_CLOUD_USER:-$DEFAULT_PRD_USER}"
  PRD_ONPREM_HOST="${PRD_ONPREM_HOST:-$DEFAULT_PRD_ONPREM_HOST}"
  PRD_ONPREM_USER="${PRD_ONPREM_USER:-$DEFAULT_PRD_USER}"
  TESTED_CLOUD_PACKAGE="${TESTED_CLOUD_PACKAGE:-}"
  TESTED_ONPREM_PACKAGE="${TESTED_ONPREM_PACKAGE:-}"
  load_promotion_state
  load_environment_passwords
}

load_promotion_state() {
  PROMO_CLOUD_ACC_APPROVED_PKG=""
  PROMO_CLOUD_ACC_APPROVED_SHA=""
  PROMO_CLOUD_ACC_APPROVED_AT=""
  PROMO_CLOUD_DEV_APPROVED_PKG=""
  PROMO_CLOUD_DEV_APPROVED_SHA=""
  PROMO_CLOUD_DEV_APPROVED_AT=""
  PROMO_ONPREM_ACC_APPROVED_PKG=""
  PROMO_ONPREM_ACC_APPROVED_SHA=""
  PROMO_ONPREM_ACC_APPROVED_AT=""
  PROMO_ONPREM_DEV_APPROVED_PKG=""
  PROMO_ONPREM_DEV_APPROVED_SHA=""
  PROMO_ONPREM_DEV_APPROVED_AT=""
  if [ -f "$PROMOTION_STATE_FILE" ]; then
    # shellcheck disable=SC1090
    source "$PROMOTION_STATE_FILE"
  fi
}

save_promotion_state() {
  mkdir -p "$TARGETS_CONF_DIR"
  cat > "$PROMOTION_STATE_FILE" <<EOF
# LearnPlay devadmin promotion approvals
# Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
PROMO_CLOUD_ACC_APPROVED_PKG="${PROMO_CLOUD_ACC_APPROVED_PKG:-}"
PROMO_CLOUD_ACC_APPROVED_SHA="${PROMO_CLOUD_ACC_APPROVED_SHA:-}"
PROMO_CLOUD_ACC_APPROVED_AT="${PROMO_CLOUD_ACC_APPROVED_AT:-}"
PROMO_CLOUD_DEV_APPROVED_PKG="${PROMO_CLOUD_DEV_APPROVED_PKG:-}"
PROMO_CLOUD_DEV_APPROVED_SHA="${PROMO_CLOUD_DEV_APPROVED_SHA:-}"
PROMO_CLOUD_DEV_APPROVED_AT="${PROMO_CLOUD_DEV_APPROVED_AT:-}"
PROMO_ONPREM_ACC_APPROVED_PKG="${PROMO_ONPREM_ACC_APPROVED_PKG:-}"
PROMO_ONPREM_ACC_APPROVED_SHA="${PROMO_ONPREM_ACC_APPROVED_SHA:-}"
PROMO_ONPREM_ACC_APPROVED_AT="${PROMO_ONPREM_ACC_APPROVED_AT:-}"
PROMO_ONPREM_DEV_APPROVED_PKG="${PROMO_ONPREM_DEV_APPROVED_PKG:-}"
PROMO_ONPREM_DEV_APPROVED_SHA="${PROMO_ONPREM_DEV_APPROVED_SHA:-}"
PROMO_ONPREM_DEV_APPROVED_AT="${PROMO_ONPREM_DEV_APPROVED_AT:-}"
EOF
  chmod 600 "$PROMOTION_STATE_FILE" 2>/dev/null || true
}

ensure_targets_secret_key() {
  mkdir -p "$TARGETS_CONF_DIR"
  if [ ! -f "$TARGETS_SECRETS_KEY_FILE" ]; then
    umask 077
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -base64 48 > "$TARGETS_SECRETS_KEY_FILE"
    else
      head -c 48 /dev/urandom | base64 > "$TARGETS_SECRETS_KEY_FILE"
    fi
    chmod 600 "$TARGETS_SECRETS_KEY_FILE" 2>/dev/null || true
  fi
}

load_environment_passwords() {
  ACC_CLOUD_PASSWORD="${ACC_CLOUD_PASSWORD:-}"
  ACC_ONPREM_PASSWORD="${ACC_ONPREM_PASSWORD:-}"
  PRD_CLOUD_PASSWORD="${PRD_CLOUD_PASSWORD:-}"
  PRD_ONPREM_PASSWORD="${PRD_ONPREM_PASSWORD:-}"
  if [ ! -f "$TARGETS_SECRETS_FILE" ] || [ ! -f "$TARGETS_SECRETS_KEY_FILE" ]; then
    return 0
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    warn "openssl not found; encrypted target passwords cannot be loaded."
    return 0
  fi
  # shellcheck disable=SC1090
  source <(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass "file:${TARGETS_SECRETS_KEY_FILE}" -in "$TARGETS_SECRETS_FILE" 2>/dev/null || true)
}

save_environment_passwords() {
  ensure_targets_secret_key
  if ! command -v openssl >/dev/null 2>&1; then
    warn "openssl not found; skipping encrypted password save."
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
ACC_CLOUD_PASSWORD=$(printf '%q' "${ACC_CLOUD_PASSWORD:-}")
ACC_ONPREM_PASSWORD=$(printf '%q' "${ACC_ONPREM_PASSWORD:-}")
PRD_CLOUD_PASSWORD=$(printf '%q' "${PRD_CLOUD_PASSWORD:-}")
PRD_ONPREM_PASSWORD=$(printf '%q' "${PRD_ONPREM_PASSWORD:-}")
EOF
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -pass "file:${TARGETS_SECRETS_KEY_FILE}" \
    -in "$tmp" -out "$TARGETS_SECRETS_FILE"
  rm -f "$tmp"
  chmod 600 "$TARGETS_SECRETS_FILE" 2>/dev/null || true
}

save_environment_targets() {
  mkdir -p "$TARGETS_CONF_DIR"
  cat > "$TARGETS_CONF_FILE" <<EOF
# LearnPlay devadmin environment targets
# Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
ACC_CLOUD_HOST="${ACC_CLOUD_HOST}"
ACC_CLOUD_USER="${ACC_CLOUD_USER}"
ACC_ONPREM_HOST="${ACC_ONPREM_HOST}"
ACC_ONPREM_USER="${ACC_ONPREM_USER}"
PRD_CLOUD_HOST="${PRD_CLOUD_HOST}"
PRD_CLOUD_USER="${PRD_CLOUD_USER}"
PRD_ONPREM_HOST="${PRD_ONPREM_HOST}"
PRD_ONPREM_USER="${PRD_ONPREM_USER}"
TESTED_CLOUD_PACKAGE="${TESTED_CLOUD_PACKAGE:-}"
TESTED_ONPREM_PACKAGE="${TESTED_ONPREM_PACKAGE:-}"
EOF
  chmod 600 "$TARGETS_CONF_FILE" 2>/dev/null || true
  save_environment_passwords
}

set_environment_target() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  case "${scope}:${env_name}" in
    cloud:acc) ACC_CLOUD_HOST="$host"; ACC_CLOUD_USER="$user" ;;
    onprem:acc) ACC_ONPREM_HOST="$host"; ACC_ONPREM_USER="$user" ;;
    cloud:prd) PRD_CLOUD_HOST="$host"; PRD_CLOUD_USER="$user" ;;
    onprem:prd) PRD_ONPREM_HOST="$host"; PRD_ONPREM_USER="$user" ;;
    *) err "Invalid target scope/environment: ${scope}/${env_name}"; return 1 ;;
  esac
}

set_environment_password() {
  local scope="$1"
  local env_name="$2"
  local password="$3"
  case "${scope}:${env_name}" in
    cloud:acc) ACC_CLOUD_PASSWORD="$password" ;;
    onprem:acc) ACC_ONPREM_PASSWORD="$password" ;;
    cloud:prd) PRD_CLOUD_PASSWORD="$password" ;;
    onprem:prd) PRD_ONPREM_PASSWORD="$password" ;;
    *) err "Invalid password scope/environment: ${scope}/${env_name}"; return 1 ;;
  esac
}

get_environment_password() {
  local scope="$1"
  local env_name="$2"
  case "${scope}:${env_name}" in
    cloud:acc) echo "${ACC_CLOUD_PASSWORD:-}" ;;
    onprem:acc) echo "${ACC_ONPREM_PASSWORD:-}" ;;
    cloud:prd) echo "${PRD_CLOUD_PASSWORD:-}" ;;
    onprem:prd) echo "${PRD_ONPREM_PASSWORD:-}" ;;
    *) echo "" ;;
  esac
}

print_environment_targets() {
  local scope="${1:-all}"
  printf "\n"
  bold "Configured Environment Targets"
  printf "%-8s | %-4s | %-36s | %-16s | %-8s\n" "SCOPE" "ENV" "HOST" "USER" "PASSWD"
  printf "%-8s-+-%-4s-+-%-36s-+-%-16s-+-%-8s\n" "--------" "----" "------------------------------------" "----------------" "--------"
  if [ "$scope" = "cloud" ] || [ "$scope" = "all" ]; then
    printf "%-8s | %-4s | %-36s | %-16s | %-8s\n" "cloud" "ACC" "$ACC_CLOUD_HOST" "$ACC_CLOUD_USER" "$( [ -n "${ACC_CLOUD_PASSWORD:-}" ] && echo "set" || echo "-" )"
    printf "%-8s | %-4s | %-36s | %-16s | %-8s\n" "cloud" "PRD" "$PRD_CLOUD_HOST" "$PRD_CLOUD_USER" "$( [ -n "${PRD_CLOUD_PASSWORD:-}" ] && echo "set" || echo "-" )"
  fi
  if [ "$scope" = "onprem" ] || [ "$scope" = "all" ]; then
    printf "%-8s | %-4s | %-36s | %-16s | %-8s\n" "onprem" "ACC" "$ACC_ONPREM_HOST" "$ACC_ONPREM_USER" "$( [ -n "${ACC_ONPREM_PASSWORD:-}" ] && echo "set" || echo "-" )"
    printf "%-8s | %-4s | %-36s | %-16s | %-8s\n" "onprem" "PRD" "$PRD_ONPREM_HOST" "$PRD_ONPREM_USER" "$( [ -n "${PRD_ONPREM_PASSWORD:-}" ] && echo "set" || echo "-" )"
  fi
  echo ""
  echo "Tested package defaults (used as PRD prompt default):"
  echo "  cloud : ${TESTED_CLOUD_PACKAGE:-<none>}"
  echo "  onprem: ${TESTED_ONPREM_PACKAGE:-<none>}"
}

artifact_pattern_for_scope() {
  local prefix
  case "${1:-all}" in
    cloud)
      prefix="$(package_prefix_for_scope cloud)"
      echo "${prefix}*.tar.gz"
      ;;
    onprem)
      prefix="$(package_prefix_for_scope onprem)"
      echo "${prefix}*.tar.gz"
      ;;
    *)
      echo "LP-*-V*.tar.gz"
      ;;
  esac
}

package_prefix_for_scope() {
  case "${1:-cloud}" in
    cloud) echo "LP-CL-V" ;;
    onprem) echo "LP-OP-V" ;;
    *) return 1 ;;
  esac
}

version_regex_for_scope() {
  case "${1:-cloud}" in
    cloud) echo '^LP-CL-V([0-9]+)\.([0-9]{2})\.([0-9]{3})$' ;;
    onprem) echo '^LP-OP-V([0-9]+)\.([0-9]{2})\.([0-9]{3})$' ;;
    *) return 1 ;;
  esac
}

release_version_floor_for_scope() {
  case "${1:-cloud}" in
    cloud) echo '1.01.009' ;;
    onprem) echo '1.01.009' ;;
    *) return 1 ;;
  esac
}

next_release_version_for_scope() {
  local scope="$1"
  local pkg_dir prefix regex basename ver pkg
  local max_major=0
  local max_minor=0
  local max_patch=-1
  local major minor patch floor floor_major floor_minor floor_patch

  pkg_dir="$(package_dir_for_scope "$scope")"
  prefix="$(package_prefix_for_scope "$scope")"
  regex="$(version_regex_for_scope "$scope")"

  shopt -s nullglob
  for pkg in "$pkg_dir"/${prefix}*.tar.gz; do
    [ -f "$pkg" ] || continue
    basename="$(basename "$pkg")"
    ver="${basename%.tar.gz}"
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

  floor="$(release_version_floor_for_scope "$scope")"
  IFS=. read -r floor_major floor_minor floor_patch <<< "$floor"
  if ((major < 10#$floor_major)) || \
     ((major == 10#$floor_major && minor < 10#$floor_minor)) || \
     ((major == 10#$floor_major && minor == 10#$floor_minor && patch < 10#$floor_patch)); then
    major=$((10#$floor_major))
    minor=$((10#$floor_minor))
    patch=$((10#$floor_patch))
  fi

  printf '%s%d.%02d.%03d\n' "$prefix" "$major" "$minor" "$patch"
}

package_dir_for_scope() {
  case "${1:-cloud}" in
    cloud) echo "${PACKAGES_ROOT}/cloud" ;;
    onprem) echo "${PACKAGES_ROOT}/onprem" ;;
    *) echo "${PACKAGES_ROOT}" ;;
  esac
}

release_notes_marker_for_scope() {
  local scope="$1"
  local pkg_dir
  pkg_dir="$(package_dir_for_scope "$scope")"
  case "$scope" in
    cloud) echo "${pkg_dir}/.release-notes-marker-cloud.env" ;;
    onprem) echo "${pkg_dir}/.release-notes-marker-onprem.env" ;;
    *) return 1 ;;
  esac
}

persist_release_notes_marker() {
  local scope="$1"
  local state_file="$2"
  local marker_file
  marker_file="$(release_notes_marker_for_scope "$scope")"
  [ -f "$state_file" ] || return 0
  mkdir -p "$(dirname "$marker_file")"
  cp "$state_file" "${marker_file}.tmp"
  mv "${marker_file}.tmp" "$marker_file"
}

latest_package_basename_for_scope() {
  local scope="$1"
  local pkg
  local pkg_dir
  local prefix
  pkg_dir="$(package_dir_for_scope "$scope")"
  prefix="$(package_prefix_for_scope "$scope")"
  pkg="$(ls -1t "$pkg_dir"/${prefix}*.tar.gz 2>/dev/null | head -1 || true)"
  if [ -n "$pkg" ]; then
    basename "$pkg"
  else
    echo ""
  fi
}

get_tested_package_for_scope() {
  case "${1:-cloud}" in
    cloud) echo "${TESTED_CLOUD_PACKAGE:-}" ;;
    onprem) echo "${TESTED_ONPREM_PACKAGE:-}" ;;
    *) echo "" ;;
  esac
}

set_tested_package_for_scope() {
  local scope="$1"
  local pkg="$2"
  case "$scope" in
    cloud) TESTED_CLOUD_PACKAGE="$pkg" ;;
    onprem) TESTED_ONPREM_PACKAGE="$pkg" ;;
    *) return 1 ;;
  esac
}

package_checksum_for_scope() {
  local scope="$1"
  local pkg_basename="$2"
  local pkg_dir sha_file
  pkg_dir="$(package_dir_for_scope "$scope")"
  sha_file="${pkg_dir}/${pkg_basename}.sha256"
  if [ -f "$sha_file" ]; then
    awk '{print $1}' "$sha_file" | head -1
    return 0
  fi
  echo ""
}

promotion_set_stage_approval() {
  local scope="$1"
  local stage="$2"   # acc|dev
  local pkg="$3"
  local sha="$4"
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  case "${scope}:${stage}" in
    cloud:acc)
      PROMO_CLOUD_ACC_APPROVED_PKG="$pkg"
      PROMO_CLOUD_ACC_APPROVED_SHA="$sha"
      PROMO_CLOUD_ACC_APPROVED_AT="$ts"
      ;;
    cloud:dev)
      PROMO_CLOUD_DEV_APPROVED_PKG="$pkg"
      PROMO_CLOUD_DEV_APPROVED_SHA="$sha"
      PROMO_CLOUD_DEV_APPROVED_AT="$ts"
      ;;
    onprem:acc)
      PROMO_ONPREM_ACC_APPROVED_PKG="$pkg"
      PROMO_ONPREM_ACC_APPROVED_SHA="$sha"
      PROMO_ONPREM_ACC_APPROVED_AT="$ts"
      ;;
    onprem:dev)
      PROMO_ONPREM_DEV_APPROVED_PKG="$pkg"
      PROMO_ONPREM_DEV_APPROVED_SHA="$sha"
      PROMO_ONPREM_DEV_APPROVED_AT="$ts"
      ;;
    *) return 1 ;;
  esac
  save_promotion_state
}

promotion_get_stage_pkg() {
  local scope="$1"
  local stage="$2"
  case "${scope}:${stage}" in
    cloud:acc) echo "${PROMO_CLOUD_ACC_APPROVED_PKG:-}" ;;
    cloud:dev) echo "${PROMO_CLOUD_DEV_APPROVED_PKG:-}" ;;
    onprem:acc) echo "${PROMO_ONPREM_ACC_APPROVED_PKG:-}" ;;
    onprem:dev) echo "${PROMO_ONPREM_DEV_APPROVED_PKG:-}" ;;
    *) echo "" ;;
  esac
}

promotion_get_stage_sha() {
  local scope="$1"
  local stage="$2"
  case "${scope}:${stage}" in
    cloud:acc) echo "${PROMO_CLOUD_ACC_APPROVED_SHA:-}" ;;
    cloud:dev) echo "${PROMO_CLOUD_DEV_APPROVED_SHA:-}" ;;
    onprem:acc) echo "${PROMO_ONPREM_ACC_APPROVED_SHA:-}" ;;
    onprem:dev) echo "${PROMO_ONPREM_DEV_APPROVED_SHA:-}" ;;
    *) echo "" ;;
  esac
}

promotion_get_stage_time() {
  local scope="$1"
  local stage="$2"
  case "${scope}:${stage}" in
    cloud:acc) echo "${PROMO_CLOUD_ACC_APPROVED_AT:-}" ;;
    cloud:dev) echo "${PROMO_CLOUD_DEV_APPROVED_AT:-}" ;;
    onprem:acc) echo "${PROMO_ONPREM_ACC_APPROVED_AT:-}" ;;
    onprem:dev) echo "${PROMO_ONPREM_DEV_APPROVED_AT:-}" ;;
    *) echo "" ;;
  esac
}

promotion_clear_scope() {
  local scope="$1"
  case "$scope" in
    cloud)
      PROMO_CLOUD_ACC_APPROVED_PKG=""
      PROMO_CLOUD_ACC_APPROVED_SHA=""
      PROMO_CLOUD_ACC_APPROVED_AT=""
      PROMO_CLOUD_DEV_APPROVED_PKG=""
      PROMO_CLOUD_DEV_APPROVED_SHA=""
      PROMO_CLOUD_DEV_APPROVED_AT=""
      ;;
    onprem)
      PROMO_ONPREM_ACC_APPROVED_PKG=""
      PROMO_ONPREM_ACC_APPROVED_SHA=""
      PROMO_ONPREM_ACC_APPROVED_AT=""
      PROMO_ONPREM_DEV_APPROVED_PKG=""
      PROMO_ONPREM_DEV_APPROVED_SHA=""
      PROMO_ONPREM_DEV_APPROVED_AT=""
      ;;
    *)
      return 1
      ;;
  esac
  save_promotion_state
}

show_promotion_status() {
  local scope="$1"
  local label
  label="$(scope_label "$scope")"
  printf "\n"
  bold "${label} Internal Promotion Status (ACC -> DEV -> PRD)"
  printf "%-8s | %-44s | %-64s | %-20s\n" "STAGE" "APPROVED PACKAGE" "SHA256" "APPROVED AT (UTC)"
  printf "%-8s-+-%-44s-+-%-64s-+-%-20s\n" "--------" "--------------------------------------------" "----------------------------------------------------------------" "--------------------"
  printf "%-8s | %-44s | %-64s | %-20s\n" \
    "ACC" \
    "$(promotion_get_stage_pkg "$scope" acc | sed 's/^$/<none>/')" \
    "$(promotion_get_stage_sha "$scope" acc | sed 's/^$/<none>/')" \
    "$(promotion_get_stage_time "$scope" acc | sed 's/^$/<none>/')"
  printf "%-8s | %-44s | %-64s | %-20s\n" \
    "DEV" \
    "$(promotion_get_stage_pkg "$scope" dev | sed 's/^$/<none>/')" \
    "$(promotion_get_stage_sha "$scope" dev | sed 's/^$/<none>/')" \
    "$(promotion_get_stage_time "$scope" dev | sed 's/^$/<none>/')"
}

workspace_user() {
  local owner
  owner="$(stat -c '%U' "$WORKSPACE_ROOT" 2>/dev/null || true)"
  if [ -n "$owner" ] && [ "$owner" != "root" ]; then
    echo "$owner"
    return 0
  fi
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    echo "$SUDO_USER"
    return 0
  fi
  echo "lppadmin"
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

workspace_node_env_prefix() {
  cat <<'EOF'
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi
if command -v nvm >/dev/null 2>&1; then
  nvm use 20 >/dev/null
fi
EOF
}

is_wsl_dev_workspace() {
  [ -x "$WORKSPACE_ROOT/scripts/dev-workspace/wsl-devadmin.sh" ] || return 1
  grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null || return 1
}

ensure_workspace_user_owns() {
  local path="$1"
  local u
  u="$(workspace_user)"
  [ -e "$path" ] || return 0
  if [ "$(id -u)" -eq 0 ] && id -u "$u" >/dev/null 2>&1; then
    chown "$u:$u" "$path" 2>/dev/null || true
  fi
}

remote_user_at_host() {
  local scope="$1"
  local env_name="$2"
  local user="$3"
  local host="$4"
  local alias=""
  # Always prefer approved per-scope alias for ACC/PRD when configured locally.
  # This enforces alias-managed auth/identity even if host values include user@host.
  alias="$(target_alias_for_scope_env "$scope" "$env_name" 2>/dev/null || true)"
  if [ -n "$alias" ] && target_alias_exists "$alias"; then
    printf "%s" "$alias"
    return 0
  fi
  if [ -z "$host" ]; then
    host="$alias"
    [ -n "$host" ] || { echo ""; return 0; }
  fi
  if [[ "$host" == *"@"* ]]; then
    printf "%s" "$host"
    return 0
  fi
  if [[ "$host" == *-devadmin ]]; then
    printf "%s" "$host"
    return 0
  fi
  if [ -z "$user" ]; then
    printf "%s" "$host"
    return 0
  fi
  printf "%s@%s" "$user" "$host"
}

remote_exec_bash() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local script="$5"
  local password remote cmd rc tmp_script tmp_pass_file
  remote="$(remote_user_at_host "$scope" "$env_name" "$user" "$host")"
  password="$(get_environment_password "$scope" "$env_name")"
  tmp_script="$(mktemp "/tmp/devadmin-remote-${scope}-${env_name}-XXXXXX.sh")"
  printf '%s\n' "$script" > "$tmp_script"
  ensure_workspace_user_owns "$tmp_script"
  # Prefer key-based alias auth first; never allow interactive password prompts.
  cmd="ssh -T -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o ConnectTimeout=10 '$remote' 'sudo -n bash -s' < $(printf '%q' "$tmp_script")"
  if run_as_workspace_user "$cmd"; then
    rm -f "$tmp_script" 2>/dev/null || true
    return 0
  fi
  rc=$?
  if [ -n "$password" ] && command -v sshpass >/dev/null 2>&1; then
    tmp_pass_file="$(mktemp "/tmp/devadmin-sshpass-${scope}-${env_name}-XXXXXX.pw")"
    printf '%s' "$password" > "$tmp_pass_file"
    chmod 600 "$tmp_pass_file" 2>/dev/null || true
    ensure_workspace_user_owns "$tmp_pass_file"
    cmd="sshpass -f $(printf '%q' "$tmp_pass_file") ssh -T -o NumberOfPasswordPrompts=1 -o ConnectTimeout=10 -o PreferredAuthentications=password -o PubkeyAuthentication=no -o KbdInteractiveAuthentication=no '$remote' 'sudo -n bash -s' < $(printf '%q' "$tmp_script")"
    run_as_workspace_user "$cmd"
    rc=$?
    rm -f "$tmp_pass_file" 2>/dev/null || true
    rm -f "$tmp_script" 2>/dev/null || true
    return $rc
  fi
  rm -f "$tmp_script" 2>/dev/null || true
  err "Non-interactive SSH failed for target '${remote}'. Configure alias/key auth in Environment Targets -> SSH bootstrap."
  return $rc
}

remote_copy_to_tmp() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  shift 4 || true
  local password remote cmd rc args="" tmp_pass_file=""
  remote="$(remote_user_at_host "$scope" "$env_name" "$user" "$host")"
  local arg
  for arg in "$@"; do
    args+=" $(printf '%q' "$arg")"
  done
  password="$(get_environment_password "$scope" "$env_name")"
  # Prefer key-based alias auth first; never allow interactive password prompts.
  cmd="scp -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no${args} '$remote:/tmp/'"
  if run_as_workspace_user "$cmd"; then
    return 0
  fi
  rc=$?
  if [ -n "$password" ] && command -v sshpass >/dev/null 2>&1; then
    tmp_pass_file="$(mktemp "/tmp/devadmin-sshpass-${scope}-${env_name}-XXXXXX.pw")"
    printf '%s' "$password" > "$tmp_pass_file"
    chmod 600 "$tmp_pass_file" 2>/dev/null || true
    ensure_workspace_user_owns "$tmp_pass_file"
    cmd="sshpass -f $(printf '%q' "$tmp_pass_file") scp -o NumberOfPasswordPrompts=1 -o PreferredAuthentications=password -o PubkeyAuthentication=no -o KbdInteractiveAuthentication=no${args} '$remote:/tmp/'"
    run_as_workspace_user "$cmd"
    rc=$?
    rm -f "$tmp_pass_file" 2>/dev/null || true
    return $rc
  fi
  err "Non-interactive SCP failed for target '${remote}'. Configure alias/key auth in Environment Targets -> SSH bootstrap."
  return $rc
}

extract_database_url_from_env_file() {
  local env_file="$1"
  if [ ! -f "$env_file" ]; then
    return 1
  fi
  grep -E '^DATABASE_URL=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

local_scope_database_url() {
  local scope="$1"
  local db_url=""
  if [ "$scope" = "cloud" ]; then
    db_url="$(extract_database_url_from_env_file "$WORKSPACE_ROOT/.env.cloud.local" || true)"
    [ -n "$db_url" ] || db_url="$(extract_database_url_from_env_file "/opt/learnplay/cloud/.env" || true)"
    [ -n "$db_url" ] || db_url="$(extract_database_url_from_env_file "/opt/learnplay/onprem/.env" || true)"
  else
    db_url="$(extract_database_url_from_env_file "$WORKSPACE_ROOT/.env.onprem.local" || true)"
    [ -n "$db_url" ] || db_url="$(extract_database_url_from_env_file "/opt/learnplay/onprem/.env" || true)"
    [ -n "$db_url" ] || db_url="$(extract_database_url_from_env_file "/opt/learnplay/cloud/.env" || true)"
  fi
  [ -n "$db_url" ] || db_url="${DATABASE_URL:-}"
  if [ -z "$db_url" ] && [ -f "$WORKSPACE_ROOT/.env" ]; then
    db_url="$(extract_database_url_from_env_file "$WORKSPACE_ROOT/.env" || true)"
  fi
  printf "%s" "$db_url"
}

remote_scope_database_url() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local mode_dir="$scope"
  [ "$mode_dir" = "onprem" ] || mode_dir="cloud"

  remote_exec_bash "$scope" "$env_name" "$host" "$user" "$(cat <<EOF
set -euo pipefail
mode_dir='${mode_dir}'
for candidate in \\
  \"/opt/learnplay/\${mode_dir}/.env\" \\
  \"/opt/learnplay/cloud/.env\" \\
  \"/opt/learnplay/onprem/.env\"; do
  [ -f \"\$candidate\" ] || continue
  db_url=\$(grep -E '^DATABASE_URL=' \"\$candidate\" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\"' | tr -d \"'\" || true)
  if [ -n \"\$db_url\" ]; then
    printf '%s\n' \"\$db_url\"
    exit 0
  fi
done
exit 1
EOF
)"
}

normalize_database_url() {
  local raw="${1:-}"
  raw="${raw//$'\r'/}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  printf '%s' "$raw"
}

resolve_scope_db_url() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local resolved_status="error"
  local resolved_db_url=""
  local resolved_detail=""
  local mode_dir="$scope"
  local remote_output=""
  local remote_rc=0
  [ "$mode_dir" = "onprem" ] || mode_dir="cloud"

  if [ "$env_name" = "dev" ]; then
    resolved_db_url="$(local_scope_database_url "$scope" || true)"
    resolved_db_url="$(normalize_database_url "$resolved_db_url")"
    if [ -n "$resolved_db_url" ]; then
      resolved_status="ok"
    else
      resolved_status="missing_database_url"
      resolved_detail="DATABASE_URL not found on local DEV runtime scope=${scope}"
    fi
    printf '%s|%s|%s\n' "$resolved_status" "$resolved_db_url" "$resolved_detail"
    return 0
  fi

  remote_output="$(remote_exec_bash "$scope" "$env_name" "$host" "$user" "$(cat <<EOF
set -euo pipefail
mode_dir='${mode_dir}'
runtime_root="/opt/learnplay/\${mode_dir}"
runtime_env="\${runtime_root}/.env"
if [ ! -d "\$runtime_root" ]; then
  printf '%s\n' "__LP_DB_STATUS=missing_runtime"
  printf '%s\n' "__LP_DB_DETAIL=\$runtime_root is missing"
  exit 0
fi
if [ ! -f "\$runtime_env" ]; then
  printf '%s\n' "__LP_DB_STATUS=missing_env"
  printf '%s\n' "__LP_DB_DETAIL=\$runtime_env is missing"
  exit 0
fi
db_url=\$(grep -E '^DATABASE_URL=' "\$runtime_env" 2>/dev/null | tail -1 | cut -d= -f2- || true)
db_url="\${db_url%\r}"
db_url="\${db_url%\"}"
db_url="\${db_url#\"}"
db_url="\${db_url%\'}"
db_url="\${db_url#\'}"
if [ -z "\$db_url" ]; then
  printf '%s\n' "__LP_DB_STATUS=missing_database_url"
  printf '%s\n' "__LP_DB_DETAIL=DATABASE_URL missing in \$runtime_env"
  exit 0
fi
printf '%s\n' "__LP_DB_STATUS=ok"
printf '%s\n' "__LP_DB_URL=\$db_url"
exit 0
EOF
)")" || remote_rc=$?

  if [ "$remote_rc" -ne 0 ]; then
    resolved_status="connection_failed"
    resolved_detail="Remote DB resolver failed for ${env_name} (${user}@${host})"
    printf '%s|%s|%s\n' "$resolved_status" "$resolved_db_url" "$resolved_detail"
    return 0
  fi

  resolved_status="$(printf '%s\n' "$remote_output" | sed -n 's/^__LP_DB_STATUS=//p' | tail -1)"
  resolved_db_url="$(printf '%s\n' "$remote_output" | sed -n 's/^__LP_DB_URL=//p' | tail -1)"
  resolved_detail="$(printf '%s\n' "$remote_output" | sed -n 's/^__LP_DB_DETAIL=//p' | tail -1)"
  resolved_status="${resolved_status:-error}"
  resolved_db_url="$(normalize_database_url "$resolved_db_url")"
  printf '%s|%s|%s\n' "$resolved_status" "$resolved_db_url" "$resolved_detail"
}

db_url_hostname() {
  local db_url="$1"
  [ -n "$db_url" ] || return 1
  python3 -c 'from urllib.parse import urlparse; import sys; print(urlparse(sys.argv[1]).hostname or "", end="")' "$db_url" 2>/dev/null || return 1
}

db_url_port() {
  local db_url="$1"
  [ -n "$db_url" ] || return 1
  python3 -c 'from urllib.parse import urlparse; import sys; u=urlparse(sys.argv[1]); print(u.port or (5432 if u.scheme in ("postgres", "postgresql") else ""), end="")' "$db_url" 2>/dev/null || return 1
}

db_url_with_local_tunnel() {
  local db_url="$1"
  local local_port="$2"
  [ -n "$db_url" ] || return 1
  [ -n "$local_port" ] || return 1
  python3 -c 'from urllib.parse import urlparse, urlunparse; import sys; u=urlparse(sys.argv[1]); auth=(u.netloc.rsplit("@",1)[0] + "@") if "@" in u.netloc else ""; netloc=auth + "127.0.0.1:" + sys.argv[2]; print(urlunparse((u.scheme, netloc, u.path, u.params, u.query, u.fragment)), end="")' "$db_url" "$local_port" 2>/dev/null || return 1
}

is_loopback_host() {
  case "${1:-}" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

find_free_local_port() {
  local port
  for port in $(seq 25432 25599); do
    if ! ss -lnt "( sport = :${port} )" 2>/dev/null | tail -n +2 | grep -q .; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

start_db_tunnel_for_remote_env() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local remote_port="${5:-5432}"
  local local_port socket_file remote password cmd rc tmp_pass_file=""

  local_port="$(find_free_local_port)" || {
    err "Could not allocate a free local TCP port for ${scope}/${env_name} DB tunnel."
    return 1
  }
  socket_file="$(mktemp -u "/tmp/devadmin-db-tunnel-${scope}-${env_name}-XXXXXX.sock")"
  remote="$(remote_user_at_host "$scope" "$env_name" "$user" "$host")"
  password="$(get_environment_password "$scope" "$env_name")"

  cmd="ssh -f -N -M -S $(printf '%q' "$socket_file") -o ExitOnForwardFailure=yes -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o ConnectTimeout=10 -L 127.0.0.1:${local_port}:127.0.0.1:${remote_port} '$remote'"
  if ! run_as_workspace_user "$cmd"; then
    rc=$?
    if [ -n "$password" ] && command -v sshpass >/dev/null 2>&1; then
      tmp_pass_file="$(mktemp "/tmp/devadmin-sshpass-${scope}-${env_name}-XXXXXX.pw")"
      printf '%s' "$password" > "$tmp_pass_file"
      chmod 600 "$tmp_pass_file" 2>/dev/null || true
      ensure_workspace_user_owns "$tmp_pass_file"
      cmd="sshpass -f $(printf '%q' "$tmp_pass_file") ssh -f -N -M -S $(printf '%q' "$socket_file") -o ExitOnForwardFailure=yes -o NumberOfPasswordPrompts=1 -o PreferredAuthentications=password -o PubkeyAuthentication=no -o KbdInteractiveAuthentication=no -o ConnectTimeout=10 -L 127.0.0.1:${local_port}:127.0.0.1:${remote_port} '$remote'"
      if ! run_as_workspace_user "$cmd"; then
        rm -f "$tmp_pass_file" 2>/dev/null || true
        err "Could not establish DB tunnel for ${scope}/${env_name} (${remote})."
        return 1
      fi
      rm -f "$tmp_pass_file" 2>/dev/null || true
    else
      err "Could not establish DB tunnel for ${scope}/${env_name} (${remote})."
      return $rc
    fi
  fi

  echo "${local_port}|${socket_file}|${remote}"
}

close_db_tunnel() {
  local socket_file="$1"
  local remote="$2"
  [ -n "$socket_file" ] || return 0
  [ -n "$remote" ] || return 0
  run_as_workspace_user "ssh -S $(printf '%q' "$socket_file") -O exit '$remote' >/dev/null 2>&1 || true"
  rm -f "$socket_file" 2>/dev/null || true
}

run_promotion_migration_gate() {
  local scope="$1"
  local source_env="$2"
  local target_env="$3"
  local target_host="$4"
  local target_user="$5"
  local source_host="${6:-}"
  local source_user="${7:-}"
  local source_db_url=""
  local target_db_url=""
  local source_status=""
  local target_status=""
  local source_detail=""
  local target_detail=""
  local source_result=""
  local target_result=""
  local gate_skipped_for_bootstrap=0
  local source_host_name=""
  local target_host_name=""
  local source_port=""
  local target_port=""
  local source_tunnel=""
  local target_tunnel=""
  local source_tunnel_port=""
  local target_tunnel_port=""
  local source_tunnel_socket=""
  local target_tunnel_socket=""
  local source_tunnel_remote=""
  local target_tunnel_remote=""
  local gate_cmd=""

  cleanup_gate_tunnels() {
    close_db_tunnel "${source_tunnel_socket:-}" "${source_tunnel_remote:-}" || true
    close_db_tunnel "${target_tunnel_socket:-}" "${target_tunnel_remote:-}" || true
  }
  trap cleanup_gate_tunnels RETURN

  source_result="$(resolve_scope_db_url "$scope" "$source_env" "$source_host" "$source_user")"
  source_status="$(printf '%s' "$source_result" | cut -d'|' -f1)"
  source_db_url="$(printf '%s' "$source_result" | cut -d'|' -f2)"
  source_detail="$(printf '%s' "$source_result" | cut -d'|' -f3-)"

  target_result="$(resolve_scope_db_url "$scope" "$target_env" "$target_host" "$target_user")"
  target_status="$(printf '%s' "$target_result" | cut -d'|' -f1)"
  target_db_url="$(printf '%s' "$target_result" | cut -d'|' -f2)"
  target_detail="$(printf '%s' "$target_result" | cut -d'|' -f3-)"

  if [ "$source_status" != "ok" ] || [ -z "$source_db_url" ]; then
    err "Migration promotion gate could not resolve source DB URL (scope=${scope}, source=${source_env}, status=${source_status})."
    [ -n "$source_detail" ] && err "Source resolver detail: ${source_detail}"
    return 1
  fi

  case "${target_status}" in
    ok)
      if [ -z "$target_db_url" ]; then
        err "Migration promotion gate could not resolve target DB URL (scope=${scope}, target=${target_env}, status=ok-with-empty-url)."
        return 1
      fi
      ;;
    missing_runtime|missing_env|missing_database_url)
      warn "Target ${scope}/${target_env} appears to be bootstrap state (${target_status}). Skipping promotion DB dry-run gate for this stage."
      [ -n "$target_detail" ] && warn "Target resolver detail: ${target_detail}"
      gate_skipped_for_bootstrap=1
      ;;
    *)
      err "Migration promotion gate could not resolve target DB URL (scope=${scope}, target=${target_env}, status=${target_status})."
      [ -n "$target_detail" ] && err "Target resolver detail: ${target_detail}"
      return 1
      ;;
  esac

  if [ "$gate_skipped_for_bootstrap" -eq 1 ]; then
    ok "Migration promotion gate skipped for ${scope} ${source_env}->${target_env} (bootstrap target)."
    return 0
  fi

  if [ "$source_env" != "dev" ]; then
    source_host_name="$(db_url_hostname "$source_db_url" || true)"
    source_port="$(db_url_port "$source_db_url" || true)"
    if is_loopback_host "$source_host_name"; then
      source_tunnel="$(start_db_tunnel_for_remote_env "$scope" "$source_env" "$source_host" "$source_user" "${source_port:-5432}")" || return 1
      source_tunnel_port="${source_tunnel%%|*}"
      source_tunnel_socket="$(echo "$source_tunnel" | cut -d'|' -f2)"
      source_tunnel_remote="$(echo "$source_tunnel" | cut -d'|' -f3-)"
      source_db_url="$(db_url_with_local_tunnel "$source_db_url" "$source_tunnel_port")"
    fi
  fi

  if [ "$target_env" != "dev" ]; then
    target_host_name="$(db_url_hostname "$target_db_url" || true)"
    target_port="$(db_url_port "$target_db_url" || true)"
    if is_loopback_host "$target_host_name"; then
      target_tunnel="$(start_db_tunnel_for_remote_env "$scope" "$target_env" "$target_host" "$target_user" "${target_port:-5432}")" || return 1
      target_tunnel_port="${target_tunnel%%|*}"
      target_tunnel_socket="$(echo "$target_tunnel" | cut -d'|' -f2)"
      target_tunnel_remote="$(echo "$target_tunnel" | cut -d'|' -f3-)"
      target_db_url="$(db_url_with_local_tunnel "$target_db_url" "$target_tunnel_port")"
    fi
  fi

  gate_cmd="$(workspace_node_env_prefix)
cd $(printf '%q' "$WORKSPACE_ROOT") && node scripts/migration-governance.mjs verify-promotion --deployment-mode $(printf '%q' "$scope") --source-db-url $(printf '%q' "$source_db_url") --target-db-url $(printf '%q' "$target_db_url") --dry-run"
  if ! run_as_workspace_user "$gate_cmd"; then
    err "Migration promotion gate blocked ${scope} ${source_env}->${target_env}. Resolve DB migration mismatch before deploy."
    return 1
  fi
  ok "Migration promotion gate passed for ${scope} ${source_env}->${target_env}."
  return 0
}

timestamp() {
  date '+%Y%m%d_%H%M%S'
}

read_dist_version() {
  local file="$1"
  local v=""
  if [ -f "$file" ]; then
    if command -v jq >/dev/null 2>&1; then
      v="$(jq -r '.version // empty' "$file" 2>/dev/null || true)"
    fi
    if [ -z "$v" ]; then
      v="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -1 || true)"
    fi
  fi
  echo "${v:-unknown}"
}

show_help() {
  cat <<EOF
LearnPlay devadmin ${DEVADMIN_VERSION}

Purpose:
  Development-only packaging tool. This tool is separate from lppadmin
  and only supports package build/verification workflows.

Usage:
  sudo devadmin [command]

Commands:
  system-status    Show dev-host service and port status summary (cloud + onprem)
  system-stack-start [cloud|onprem|both]
                  Start full stack (app + dependencies) for selected scope(s)
  system-stack-stop [cloud|onprem|both]
                  Stop full stack (app + dependencies) for selected scope(s)
  system-stack-restart [cloud|onprem|both]
                  Restart full stack (app + dependencies) for selected scope(s)
  system-service-start [cloud|onprem|both]
                  Start app service only for selected scope(s)
  system-service-stop [cloud|onprem|both]
                  Stop app service only for selected scope(s)
  system-service-restart [cloud|onprem|both]
                  Restart app service only for selected scope(s)
  system-logs [cloud|onprem] [--follow]
                  Show service logs (or follow journal logs live)
  env-show [cloud|onprem|all]
                  Show configured ACC/PRD targets
  env-set [cloud|onprem] [acc|prd] [host] [user] [password]
                  Persist target host/user (and optional password) for a scope + environment
  ssh-bootstrap [options]
                  Configure ACC/PRD SSH key auth + remote passwordless sudo
  compare-versions [cloud|onprem] [host] [user]
                  Compare DEV and ACC runtime versions for a scope
  compare-versions-prd [cloud|onprem] [host] [user]
                  Compare DEV and PRD runtime versions for a scope
  compare-versions-3way [cloud|onprem]
                  Compare DEV vs ACC vs PRD runtime versions for a scope
  compare-versions-all [cloud_host] [cloud_user] [onprem_host] [onprem_user]
                  Compare DEV and ACC runtime versions for cloud + onprem
  menu            Open interactive packaging menu (default)
  build-cloud     Build cloud installer package
  build-onprem    Build onprem installer package
  build-all       Build cloud + onprem installer packages
  list [cloud|onprem|all]
                  Show latest package artifacts (optionally scoped)
  verify [cloud|onprem|all]
                  Verify checksums for latest package artifacts (optionally scoped)
  update-dev [cloud|onprem]
                  Run DEV local runtime update pipeline (build + update)
  update-dev-fast [cloud|onprem]
                  [DISABLED] legacy no-build path removed
  update-dev-lppadmin [cloud|onprem]
                  [DISABLED] legacy lppadmin-only path removed
  update-dev-all
                  Run full DEV updates for cloud + onprem (build + update)
  update-dev-all-fast
                  [DISABLED] legacy no-build path removed
  update-acc [cloud|onprem] [host] [user]
                  Run DEV->ACC package update pipeline (build + transfer + update)
  update-acc-fast [cloud|onprem] [host] [user]
                  [DISABLED] legacy no-build path removed
  update-acc-lppadmin [cloud|onprem] [host] [user]
                  [DISABLED] legacy lppadmin-only path removed
  update-prd [cloud|onprem] [host] [user]
                  Run DEV->PRD package update pipeline (build + transfer + update)
  update-prd-fast [cloud|onprem] [host] [user]
                  [DISABLED] legacy no-build path removed
  update-prd-lppadmin [cloud|onprem] [host] [user]
                  [DISABLED] legacy lppadmin-only path removed
  deploy-all [cloud|onprem|all]
                  One-click rollout: DEV (build+update) -> ACC (no build) -> PRD (no build)
  promote-acc [cloud|onprem] [host] [user]
                  Internal flow: promote ACC stage (build + transfer + update)
  approve-acc [cloud|onprem]
                  Internal flow: approve ACC stage package after testing
  promote-dev [cloud|onprem]
                  Internal flow: promote DEV from approved ACC package
  approve-dev [cloud|onprem]
                  Internal flow: approve DEV stage package after testing
  promote-prd [cloud|onprem] [host] [user]
                  Internal flow: promote PRD from approved DEV package
  promotion-status [cloud|onprem]
                  Show internal promotion approvals/status
  promotion-reset [cloud|onprem]
                  Reset internal promotion approvals for scope
  patch-dev [cloud|onprem] [patch-check|patch-apply|patch-report]
                  Run local DEV lppadmin patch command for selected scope
  patch-acc [cloud|onprem] [host] [user] [patch-check|patch-apply|patch-report]
                  Run remote ACC lppadmin patch command for selected scope
  patch-prd [cloud|onprem] [host] [user] [patch-check|patch-apply|patch-report]
                  Run remote PRD lppadmin patch command for selected scope
  dr-create       Create single-file DR bundle for this host
  dr-verify       Verify DR bundle checksum/integrity
  dr-restore-local
                  Restore DR bundle on local host
  dr-restore-remote
                  Restore DR bundle on remote host over SSH
  dr-postcheck    Run DR readiness post-check on local host
  validate-scope-isolation
                  Validate cloud/onprem isolation guards in devadmin tooling
  github-menu     Open GitHub management menu
  github-status   Show GitHub repository status
  github-backup   Run backup now (commit + push)
  github-push     Push current branch to origin
  github-pull     Pull latest from origin with rebase
  github-pat-update
                  Update stored GitHub PAT credentials for HTTPS auth
  github-remote   Show or set origin remote URL
  github-creds    Show GitHub credential diagnostics
  github-audit    Run GitHub safety audit (secrets/large files/nested repos)
  github-sync-lppadmin [cloud|onprem]
                  Sync GitHub on DEV, then update lppadmin on scoped DEV/ACC/PRD only
  github-sync-full-dev [cloud|onprem]
                  Sync GitHub on DEV, then run scoped full update for DEV only (build + deploy)
  github-deploy-acc [cloud|onprem]
                  Deploy scoped ACC from latest DEV build package (no GitHub sync, no build)
  github-deploy-prd [cloud|onprem]
                  Deploy scoped PRD from latest DEV build package (no GitHub sync, no build)
  github-sync-full [cloud|onprem]
                  Sync GitHub on DEV, then run scoped full rollout DEV->ACC->PRD (build once on DEV)
  github-sync-devadmin
                  Sync GitHub on DEV, then refresh devadmin on this host only
  github-sync-tools [cloud|onprem]
                  Backward-compatible alias for github-sync-lppadmin
  help            Show this help
EOF
}

service_state() {
  local unit="$1"
  local state
  state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  echo "${state:-unknown}"
}

port_state() {
  local port="$1"
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"; then
    echo "LISTENING"
  else
    echo "CLOSED"
  fi
}

service_unit_for_scope() {
  case "${1:-}" in
    cloud) echo "learnplay-cloud" ;;
    onprem) echo "learnplay-onprem" ;;
    *) return 1 ;;
  esac
}

neutralize_scope_pm2_runtime() {
  local scope="$1"
  local unit app_user home pm2_cmd plist proc
  unit="$(service_unit_for_scope "$scope" 2>/dev/null || true)"
  if [ -z "$unit" ]; then
    return 0
  fi
  app_user="$(sed -n 's/^User=//p' "/etc/systemd/system/${unit}.service" 2>/dev/null | head -1 | tr -d '[:space:]' || true)"
  if [ -z "$app_user" ] || [ "$app_user" = "root" ]; then
    app_user="lppadmin"
  fi
  if ! id -u "$app_user" >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v pm2 >/dev/null 2>&1; then
    return 0
  fi
  home="$(getent passwd "$app_user" | cut -d: -f6 || true)"
  if [ -z "$home" ]; then
    home="/home/$app_user"
  fi
  pm2_cmd="sudo -u '$app_user' env HOME='$home' PM2_HOME='$home/.pm2' pm2"

  for proc in "$unit" "learnplay"; do
    /bin/bash -lc "$pm2_cmd stop '$proc' >/dev/null 2>&1 || true"
    /bin/bash -lc "$pm2_cmd delete '$proc' >/dev/null 2>&1 || true"
  done
  /bin/bash -lc "$pm2_cmd save --force >/dev/null 2>&1 || true"

  plist="$(/bin/bash -lc "$pm2_cmd jlist 2>/dev/null | tr -d '\n' || true")"
  if [ "${plist:-[]}" = "[]" ]; then
    systemctl stop "pm2-${app_user}" >/dev/null 2>&1 || true
  fi
}

runtime_root_for_scope() {
  case "${1:-}" in
    cloud) echo "/opt/learnplay/cloud" ;;
    onprem) echo "/opt/learnplay/onprem" ;;
    *) return 1 ;;
  esac
}

runtime_version_for_scope() {
  local scope="$1"
  local root version_file version
  root="$(runtime_root_for_scope "$scope")" || return 1
  version_file="${root}/version.json"
  if [ ! -f "$version_file" ]; then
    echo "unknown"
    return 0
  fi
  if command -v jq >/dev/null 2>&1; then
    version="$(jq -r '.version // empty' "$version_file" 2>/dev/null || true)"
  else
    version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$version_file" | head -1 || true)"
  fi
  echo "${version:-unknown}"
}

run_local_scope_postcheck() {
  local scope="$1"
  local unit root version app_port unit_state unit_enabled port_listening
  unit="$(service_unit_for_scope "$scope")"
  root="$(runtime_root_for_scope "$scope")"
  version="$(runtime_version_for_scope "$scope")"
  if [ "$scope" = "cloud" ]; then
    app_port=8000
  else
    app_port=9000
  fi

  unit_state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  unit_enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
  port_listening="$(port_state "$app_port")"

  printf "\n"
  bold "$(scope_label "$scope") local post-check"
  echo "Runtime root: $root"
  echo "Runtime version: ${version}"
  echo "Service: ${unit}"
  echo "  active: ${unit_state:-unknown}"
  echo "  enabled: ${unit_enabled:-unknown}"
  echo "App port ${app_port}: ${port_listening}"
  echo "nginx: $(service_state nginx)"
  echo "postgresql@16-main: $(service_state postgresql@16-main)"
}

run_remote_scope_postcheck() {
  local scope="$1"
  local host="$2"
  local user="$3"
  local env_name="${4:-acc}"
  local script
  script=$(cat <<EOF
set -euo pipefail
scope="${scope}"
if [ "\$scope" = "cloud" ]; then
  unit="learnplay-cloud"
  root="/opt/learnplay/cloud"
  app_port="8000"
else
  unit="learnplay-onprem"
  root="/opt/learnplay/onprem"
  app_port="9000"
fi
version_file="\$root/version.json"
version="unknown"
if [ -f "\$version_file" ]; then
  if command -v jq >/dev/null 2>&1; then
    version="\$(jq -r '.version // empty' "\$version_file" 2>/dev/null || true)"
  fi
  if [ -z "\$version" ]; then
    version="\$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "\$version_file" | head -1 || true)"
  fi
fi
unit_state="\$(systemctl is-active "\$unit" 2>/dev/null || true)"
unit_enabled="\$(systemctl is-enabled "\$unit" 2>/dev/null || true)"
if ss -ltnH 2>/dev/null | awk '{print \$4}' | grep -Eq "(^|:)\${app_port}\$"; then
  app_port_state="LISTENING"
else
  app_port_state="CLOSED"
fi
if ss -ltnH 2>/dev/null | awk '{print \$4}' | grep -Eq "(^|:)80\$"; then p80="LISTENING"; else p80="CLOSED"; fi
if ss -ltnH 2>/dev/null | awk '{print \$4}' | grep -Eq "(^|:)443\$"; then p443="LISTENING"; else p443="CLOSED"; fi
if ss -ltnH 2>/dev/null | awk '{print \$4}' | grep -Eq "(^|:)5432\$"; then p5432="LISTENING"; else p5432="CLOSED"; fi
printf '\n%s remote post-check\n' "\$scope"
printf 'Runtime root: %s\n' "\$root"
printf 'Runtime version: %s\n' "\${version:-unknown}"
printf 'Service: %s\n' "\$unit"
printf '  active: %s\n' "\${unit_state:-unknown}"
printf '  enabled: %s\n' "\${unit_enabled:-unknown}"
printf 'App port %s: %s\n' "\$app_port" "\$app_port_state"
printf 'nginx: %s\n' "\$(systemctl is-active nginx 2>/dev/null || true)"
printf 'postgresql@16-main: %s\n' "\$(systemctl is-active postgresql@16-main 2>/dev/null || true)"
printf 'Port 80: %s | Port 443: %s | Port 5432: %s\n' "\$p80" "\$p443" "\$p5432"
EOF
)
  remote_exec_bash "$scope" "$env_name" "$host" "$user" "$script"
}

run_local_scope_patch_subcommand() {
  local scope="$1"
  local subcmd="${2:-patch-apply}"
  local script="/antigravity/Cloud-On-Prem/${scope}/lppadmin.sh"
  if [ ! -x "$script" ]; then
    err "Scope lppadmin script not found: $script"
    return 1
  fi
  /bin/bash -lc "'$script' '$scope' '$subcmd'"
}

run_remote_scope_patch_subcommand() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local subcmd="${5:-patch-apply}"
  local script
  script="$(cat <<EOF
set -euo pipefail
if ! command -v lppadmin >/dev/null 2>&1; then
  echo "lppadmin is not installed on remote host" >&2
  exit 1
fi
sudo -n lppadmin '$scope' '$subcmd'
EOF
)"
  remote_exec_bash "$scope" "$env_name" "$host" "$user" "$script"
}

normalize_system_scope() {
  case "${1:-both}" in
    cloud|onprem|both) echo "$1" ;;
    "") echo "both" ;;
    *) return 1 ;;
  esac
}

resolve_scope_targets() {
  local scope="${1:-both}"
  case "$scope" in
    cloud) echo "cloud" ;;
    onprem) echo "onprem" ;;
    both) echo "cloud onprem" ;;
    *) return 1 ;;
  esac
}

system_status_summary() {
  local cloud_state onprem_state nginx_state pg_state
  local p80 p443 p5432 p8000 p9000
  cloud_state="$(service_state learnplay-cloud)"
  onprem_state="$(service_state learnplay-onprem)"
  nginx_state="$(service_state nginx)"
  pg_state="$(service_state postgresql@16-main)"
  p80="$(port_state 80)"
  p443="$(port_state 443)"
  p5432="$(port_state 5432)"
  p8000="$(port_state 8000)"
  p9000="$(port_state 9000)"

  printf "\n"
  bold "System Status Summary (DEV host)"
  printf "%-24s | %-10s\n" "SERVICE" "STATE"
  printf "%-24s-+-%-10s\n" "------------------------" "----------"
  printf "%-24s | %-10s\n" "learnplay-cloud" "$cloud_state"
  printf "%-24s | %-10s\n" "learnplay-onprem" "$onprem_state"
  printf "%-24s | %-10s\n" "nginx" "$nginx_state"
  printf "%-24s | %-10s\n" "postgresql@16-main" "$pg_state"
  printf "\n"
  printf "%-24s | %-10s\n" "PORT" "STATE"
  printf "%-24s-+-%-10s\n" "------------------------" "----------"
  printf "%-24s | %-10s\n" "80 (HTTP ingress)" "$p80"
  printf "%-24s | %-10s\n" "443 (HTTPS ingress)" "$p443"
  printf "%-24s | %-10s\n" "5432 (PostgreSQL)" "$p5432"
  printf "%-24s | %-10s\n" "8000 (cloud app)" "$p8000"
  printf "%-24s | %-10s\n" "9000 (onprem app)" "$p9000"
}

run_system_stack_action() {
  local action="$1"
  local scope="${2:-both}"
  local normalized targets target failures unit
  failures=0

  normalized="$(normalize_system_scope "$scope" || true)"
  if [ -z "$normalized" ]; then
    err "Invalid scope: ${scope}. Use cloud|onprem|both."
    return 1
  fi
  targets="$(resolve_scope_targets "$normalized")"

  for target in $targets; do
    unit="$(service_unit_for_scope "$target")"
    bold "Running stack-${action} for $(scope_label "$target")"
    case "$action" in
      start)
        neutralize_scope_pm2_runtime "$target"
        systemctl start postgresql@16-main || failures=$((failures + 1))
        systemctl start nginx || failures=$((failures + 1))
        systemctl start "$unit" || failures=$((failures + 1))
        ;;
      stop)
        neutralize_scope_pm2_runtime "$target"
        systemctl stop "$unit" || failures=$((failures + 1))
        systemctl stop nginx || failures=$((failures + 1))
        systemctl stop postgresql@16-main || failures=$((failures + 1))
        ;;
      restart)
        neutralize_scope_pm2_runtime "$target"
        systemctl restart postgresql@16-main || failures=$((failures + 1))
        systemctl restart nginx || failures=$((failures + 1))
        systemctl restart "$unit" || failures=$((failures + 1))
        ;;
      *)
        err "Invalid stack action: ${action}"
        return 1
        ;;
    esac
  done

  if [ "$failures" -gt 0 ]; then
    return 1
  fi
  ok "Stack ${action} completed for scope: ${normalized}"
}

run_system_service_action() {
  local action="$1"
  local scope="${2:-both}"
  local normalized targets target failures unit
  failures=0

  normalized="$(normalize_system_scope "$scope" || true)"
  if [ -z "$normalized" ]; then
    err "Invalid scope: ${scope}. Use cloud|onprem|both."
    return 1
  fi
  targets="$(resolve_scope_targets "$normalized")"

  for target in $targets; do
    unit="$(service_unit_for_scope "$target")"
    bold "Running ${action} for $(scope_label "$target") app service"
    case "$action" in
      start|stop|restart) neutralize_scope_pm2_runtime "$target" ;;
    esac
    if ! systemctl "$action" "$unit"; then
      err "${action} failed for $(scope_label "$target")"
      failures=$((failures + 1))
    fi
  done

  if [ "$failures" -gt 0 ]; then
    return 1
  fi
  ok "App service ${action} completed for scope: ${normalized}"
}

system_logs() {
  local scope="${1:-cloud}"
  local mode="${2:-recent}"
  local unit

  case "$scope" in
    cloud|onprem) ;;
    *)
      err "Invalid scope for logs: ${scope}. Use cloud|onprem."
      return 1
      ;;
  esac

  unit="$(service_unit_for_scope "$scope")"
  case "$mode" in
    recent)
      journalctl -u "$unit" -n 200 --no-pager
      ;;
    follow)
      echo "Following ${unit}. Press Ctrl+C to stop."
      journalctl -fu "$unit"
      ;;
    *)
      err "Invalid log mode: ${mode}. Use recent|follow."
      return 1
      ;;
  esac
}

latest_dr_bundle() {
  ls -1t /antigravity/archives/learnplay-dev-dr-bundle-*.tar.gz 2>/dev/null | head -1 || true
}

ensure_dr_scripts() {
  local missing=0
  for s in create-dev-bundle.sh restore-dev-bundle.sh postcheck-dev-restore.sh; do
    if [ ! -x "${DR_SCRIPTS_DIR}/${s}" ]; then
      err "Missing DR script: ${DR_SCRIPTS_DIR}/${s}"
      missing=1
    fi
  done
  [ "$missing" -eq 0 ]
}

ssh_bootstrap() {
  local script="/antigravity/scripts/devadmin/ssh-bootstrap.sh"
  if [ ! -x "$script" ]; then
    err "Missing helper script: $script"
    return 1
  fi
  "$script" "$@"
}

validate_scope_isolation() {
  local script="/antigravity/scripts/devadmin/validate-scope-isolation.sh"
  if [ ! -x "$script" ]; then
    err "Scope isolation validator is missing or not executable: $script"
    return 1
  fi
  "$script"
}

load_github_state() {
  GITHUB_REPO_ROOT="${DEFAULT_GITHUB_REPO_ROOT}"
  GITHUB_DEFAULT_USERNAME="${GITHUB_DEFAULT_USERNAME:-LearnPlayAI}"
  if [ -f "$GITHUB_STATE_FILE" ]; then
    # shellcheck disable=SC1090
    source "$GITHUB_STATE_FILE"
  fi
  GITHUB_REPO_ROOT="${GITHUB_REPO_ROOT:-$DEFAULT_GITHUB_REPO_ROOT}"
  GITHUB_DEFAULT_USERNAME="${GITHUB_DEFAULT_USERNAME:-LearnPlayAI}"
}

save_github_state() {
  mkdir -p "$TARGETS_CONF_DIR"
  cat > "$GITHUB_STATE_FILE" <<EOF
# LearnPlay devadmin GitHub settings
# Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
GITHUB_REPO_ROOT="${GITHUB_REPO_ROOT:-$DEFAULT_GITHUB_REPO_ROOT}"
GITHUB_DEFAULT_USERNAME="${GITHUB_DEFAULT_USERNAME:-LearnPlayAI}"
EOF
  chmod 600 "$GITHUB_STATE_FILE" 2>/dev/null || true
}

github_git_cmd() {
  local git_args="$1"
  local cmd
  cmd="cd $(printf '%q' "$GITHUB_REPO_ROOT") && git ${git_args}"
  run_as_workspace_user "$cmd"
}

github_require_repo() {
  if ! command -v git >/dev/null 2>&1; then
    err "git is not installed on this host."
    return 1
  fi
  if [ ! -d "$GITHUB_REPO_ROOT" ]; then
    err "GitHub repo root does not exist: $GITHUB_REPO_ROOT"
    return 1
  fi
  if ! github_git_cmd "rev-parse --is-inside-work-tree >/dev/null 2>&1"; then
    err "Path is not a git repository: $GITHUB_REPO_ROOT"
    err "Configure it in GitHub Management -> repository settings."
    return 1
  fi
}

github_repo_state_blockers() {
  local git_dir
  git_dir="$(github_git_cmd "rev-parse --git-dir" 2>/dev/null || true)"
  if [ -z "$git_dir" ]; then
    err "Could not resolve git dir for repository: $GITHUB_REPO_ROOT"
    return 1
  fi
  if [ -f "${GITHUB_REPO_ROOT}/${git_dir}/MERGE_HEAD" ] || \
     [ -d "${GITHUB_REPO_ROOT}/${git_dir}/rebase-merge" ] || \
     [ -d "${GITHUB_REPO_ROOT}/${git_dir}/rebase-apply" ] || \
     [ -f "${GITHUB_REPO_ROOT}/${git_dir}/CHERRY_PICK_HEAD" ]; then
    err "Git operation in progress (merge/rebase/cherry-pick). Resolve it first."
    return 1
  fi
}

github_auth_test() {
  github_require_repo || return 1
  if ! github_git_cmd "ls-remote --heads origin >/dev/null 2>&1"; then
    err "GitHub authentication/remote test failed for origin."
    err "Common causes: invalid PAT, wrong PAT scope, stale cached credential, or network issue."
    return 1
  fi
  ok "GitHub auth test passed for origin."
}

github_show_status() {
  github_require_repo || return 1
  local branch tracking ahead behind changes unpushed unpulled remote_url last_commit
  branch="$(github_git_cmd "rev-parse --abbrev-ref HEAD" 2>/dev/null || true)"
  tracking="$(github_git_cmd "rev-parse --abbrev-ref --symbolic-full-name '@{u}'" 2>/dev/null || true)"
  remote_url="$(github_git_cmd "remote get-url origin" 2>/dev/null || true)"
  last_commit="$(github_git_cmd "log --oneline -n 1" 2>/dev/null || true)"
  changes="$(github_git_cmd "status --porcelain | wc -l | tr -d ' '" 2>/dev/null || echo 0)"
  if [ -n "$tracking" ]; then
    behind="$(github_git_cmd "rev-list --count HEAD..@{u} 2>/dev/null | tr -d ' '" || echo 0)"
    ahead="$(github_git_cmd "rev-list --count @{u}..HEAD 2>/dev/null | tr -d ' '" || echo 0)"
    unpushed="$ahead"
    unpulled="$behind"
  else
    unpushed="n/a"
    unpulled="n/a"
  fi

  printf "\n"
  bold "GitHub Repository Status"
  echo "Repo root: ${GITHUB_REPO_ROOT}"
  echo "Branch: ${branch:-unknown}"
  echo "Tracking: ${tracking:-<none>}"
  echo "Origin: ${remote_url:-<unset>}"
  echo "Working tree changes: ${changes}"
  echo "Unpushed commits: ${unpushed}"
  echo "Unpulled commits: ${unpulled}"
  echo "Last commit: ${last_commit:-<none>}"
  echo ""
  echo "Recent commits:"
  github_git_cmd "log --oneline -n 5" || true
}

github_show_or_set_remote() {
  github_require_repo || return 1
  local current candidate
  current="$(github_git_cmd "remote get-url origin" 2>/dev/null || true)"
  echo "Current origin: ${current:-<unset>}"
  read -rp "Set new origin URL (leave blank to keep current): " candidate
  candidate="${candidate:-}"
  if [ -z "$candidate" ]; then
    return 0
  fi
  if github_git_cmd "remote get-url origin >/dev/null 2>&1"; then
    github_git_cmd "remote set-url origin $(printf '%q' "$candidate")"
  else
    github_git_cmd "remote add origin $(printf '%q' "$candidate")"
  fi
  ok "Updated origin URL."
  github_show_status
}

github_write_backup_report() {
  local action="$1"
  local commit_hash branch tracking changes timestamp report_file
  timestamp="$(date -u '+%Y%m%d_%H%M%S')"
  mkdir -p "$GITHUB_BACKUP_LOG_DIR"
  report_file="${GITHUB_BACKUP_LOG_DIR}/${timestamp}-${action}.log"
  commit_hash="$(github_git_cmd "rev-parse --short HEAD" 2>/dev/null || echo unknown)"
  branch="$(github_git_cmd "rev-parse --abbrev-ref HEAD" 2>/dev/null || echo unknown)"
  tracking="$(github_git_cmd "rev-parse --abbrev-ref --symbolic-full-name '@{u}'" 2>/dev/null || echo none)"
  changes="$(github_git_cmd "status --porcelain | wc -l | tr -d ' '" 2>/dev/null || echo 0)"
  cat > "$report_file" <<EOF
timestamp_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
action=${action}
repo_root=${GITHUB_REPO_ROOT}
branch=${branch}
tracking=${tracking}
commit=${commit_hash}
working_tree_changes=${changes}
operator=$(workspace_user)
EOF
  ok "GitHub backup report: ${report_file}"
}

github_push_current() {
  github_require_repo || return 1
  github_repo_state_blockers || return 1
  local branch
  branch="$(github_git_cmd "rev-parse --abbrev-ref HEAD" 2>/dev/null || true)"
  if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
    err "Detached HEAD detected. Checkout a branch before push."
    return 1
  fi
  if ! github_git_cmd "remote get-url origin >/dev/null 2>&1"; then
    err "origin is not configured."
    return 1
  fi
  bold "Pushing branch '${branch}' to origin..."
  if github_git_cmd "push -u origin $(printf '%q' "$branch")"; then
    github_write_backup_report "push"
    return 0
  fi
  err "Push failed."
  warn "If push was rejected due to remote updates, run Pull/Rebase then retry push."
  return 1
}

github_pull_rebase() {
  github_require_repo || return 1
  github_repo_state_blockers || return 1
  if ! github_git_cmd "remote get-url origin >/dev/null 2>&1"; then
    err "origin is not configured."
    return 1
  fi
  bold "Pulling latest changes with rebase..."
  github_git_cmd "pull --rebase origin main"
}

github_commit_all_prompt() {
  github_require_repo || return 1
  github_repo_state_blockers || return 1
  local changes msg
  changes="$(github_git_cmd "status --porcelain | wc -l | tr -d ' '" 2>/dev/null || echo 0)"
  if [ "${changes:-0}" -eq 0 ]; then
    ok "No local changes to commit."
    return 0
  fi
  echo "Pending changes: ${changes}"
  github_git_cmd "status --short" || true
  read -rp "Commit message: " msg
  if [ -z "${msg:-}" ]; then
    err "Commit message is required."
    return 1
  fi
  github_git_cmd "add -A"
  github_git_cmd "commit -m $(printf '%q' "$msg")"
}

github_backup_now() {
  github_commit_all_prompt || return 1
  github_push_current
}

github_auto_checkpoint_backup() {
  github_require_repo || return 1
  github_repo_state_blockers || return 1
  local branch changes msg ts
  branch="$(github_git_cmd "rev-parse --abbrev-ref HEAD" 2>/dev/null || true)"
  if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
    err "Detached HEAD detected. Checkout a branch before auto-backup."
    return 1
  fi

  changes="$(github_git_cmd "status --porcelain | wc -l | tr -d ' '" 2>/dev/null || echo 0)"
  if [ "${changes:-0}" -eq 0 ]; then
    ok "No local changes found for auto-backup."
    return 0
  fi

  ts="$(date -u '+%Y-%m-%d %H:%M:%SZ')"
  msg="chore(devadmin): auto backup before github-sync-tools (${ts})"

  bold "Creating automatic backup commit before tools sync..."
  github_git_cmd "add -A"
  github_git_cmd "commit -m $(printf '%q' "$msg")"
  github_push_current
}

github_credential_diagnostics() {
  local ws_user ws_home helpers helper_count
  ws_user="$(workspace_user)"
  ws_home="$(getent passwd "$ws_user" | cut -d: -f6)"
  helpers="$(run_as_workspace_user "git config --global --get-all credential.helper" 2>/dev/null || true)"
  helper_count="$(printf '%s\n' "$helpers" | sed '/^$/d' | wc -l | tr -d ' ')"
  printf "\n"
  bold "GitHub Credential Diagnostics"
  echo "Workspace user: ${ws_user}"
  echo "Home: ${ws_home:-<unknown>}"
  if [ "${helper_count:-0}" -eq 0 ]; then
    warn "No global credential.helper configured."
  else
    echo "credential.helper entries:"
    printf "%s\n" "$helpers" | sed '/^$/d' | sed 's/^/  - /'
    if [ "${helper_count:-0}" -gt 1 ]; then
      warn "Multiple credential helpers configured; this can cause stale-auth behavior."
    fi
  fi
  if [ -n "$ws_home" ] && [ -f "${ws_home}/.git-credentials" ]; then
    local perms
    perms="$(stat -c '%a' "${ws_home}/.git-credentials" 2>/dev/null || true)"
    echo "~/.git-credentials present (permissions: ${perms:-unknown})"
    if [ "${perms:-}" != "600" ]; then
      warn "Expected ~/.git-credentials permissions to be 600."
    fi
  else
    echo "~/.git-credentials not present."
  fi
}

github_update_pat_credentials() {
  local username pat1 pat2 ws_user ws_home tmp
  ws_user="$(workspace_user)"
  ws_home="$(getent passwd "$ws_user" | cut -d: -f6)"
  read -rp "GitHub username [${GITHUB_DEFAULT_USERNAME}]: " username
  username="${username:-$GITHUB_DEFAULT_USERNAME}"
  if [ -z "$username" ]; then
    err "GitHub username is required."
    return 1
  fi
  read -r -s -p "New GitHub PAT for ${username}: " pat1
  echo ""
  read -r -s -p "Confirm GitHub PAT: " pat2
  echo ""
  if [ -z "$pat1" ]; then
    err "PAT cannot be empty."
    return 1
  fi
  if [ "$pat1" != "$pat2" ]; then
    err "PAT confirmation mismatch."
    return 1
  fi

  # Ensure a stable helper for persistent manual sync auth.
  run_as_workspace_user "git config --global credential.helper store"

  # Remove stale GitHub credentials from store file if present.
  if [ -n "$ws_home" ] && [ -f "${ws_home}/.git-credentials" ]; then
    grep -v 'github.com' "${ws_home}/.git-credentials" > "${ws_home}/.git-credentials.tmp" || true
    mv "${ws_home}/.git-credentials.tmp" "${ws_home}/.git-credentials"
    chmod 600 "${ws_home}/.git-credentials" 2>/dev/null || true
    chown "$ws_user:$ws_user" "${ws_home}/.git-credentials" 2>/dev/null || true
  fi

  # Reset cached/approved credentials for github.com.
  run_as_workspace_user "printf 'protocol=https\nhost=github.com\n\n' | git credential reject >/dev/null 2>&1 || true"

  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
protocol=https
host=github.com
username=${username}
password=${pat1}

EOF
  chown "$ws_user:$ws_user" "$tmp" 2>/dev/null || true
  chmod 600 "$tmp" 2>/dev/null || true
  run_as_workspace_user "git credential approve < $(printf '%q' "$tmp")"
  rm -f "$tmp"
  unset pat1 pat2

  GITHUB_DEFAULT_USERNAME="$username"
  save_github_state
  ok "GitHub PAT credential updated for ${username}."
  github_auth_test
}

github_safety_audit() {
  github_require_repo || return 1
  local tracked_sensitive tracked_large nested_git
  printf "\n"
  bold "GitHub Safety Audit"

  if command -v rg >/dev/null 2>&1; then
    tracked_sensitive="$(github_git_cmd "ls-files" | rg -n '(^|/)(\\.env(\\.|$)|.*\\.(pem|key|p12|crt)$|devadmin-targets\\.secrets|TECHNICAL_SECRETS\\.local)' || true)"
  else
    tracked_sensitive="$(github_git_cmd "ls-files" | grep -nE '(^|/)(\\.env(\\.|$)|.*\\.(pem|key|p12|crt)$|devadmin-targets\\.secrets|TECHNICAL_SECRETS\\.local)' || true)"
  fi
  if [ -n "$tracked_sensitive" ]; then
    warn "Potential sensitive tracked files detected:"
    printf "%s\n" "$tracked_sensitive"
  else
    ok "No obvious sensitive tracked files detected."
  fi

  tracked_large="$(github_git_cmd "ls-files | while IFS= read -r f; do [ -f \"\$f\" ] || continue; sz=\$(stat -c %s \"\$f\" 2>/dev/null || echo 0); if [ \"\$sz\" -gt 94371840 ]; then echo \"\$sz \$f\"; fi; done | sort -nr" || true)"
  if [ -n "$tracked_large" ]; then
    warn "Tracked files larger than 90MB detected (GitHub push risk):"
    printf "%s\n" "$tracked_large"
  else
    ok "No tracked files above 90MB."
  fi

  nested_git="$(find "$GITHUB_REPO_ROOT" -mindepth 2 -type d -name .git 2>/dev/null || true)"
  if [ -n "$nested_git" ]; then
    warn "Nested .git directories detected (sub-repo risk):"
    printf "%s\n" "$nested_git"
  else
    ok "No nested .git directories detected."
  fi
}

github_sync_prepare_dev_source() {
  github_require_repo || return 1
  github_repo_state_blockers || return 1

  local branch changes tracking local_ahead

  branch="$(github_git_cmd "rev-parse --abbrev-ref HEAD" 2>/dev/null || true)"
  if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
    err "Detached HEAD detected. Checkout a branch before tool sync."
    return 1
  fi

  changes="$(github_git_cmd "status --porcelain | wc -l | tr -d ' '" 2>/dev/null || echo 0)"
  if [ "${changes:-0}" -gt 0 ]; then
    warn "GitHub is not yet synced to the latest DEV STACK source state."
    warn "Detected ${changes} uncommitted change(s) in ${GITHUB_REPO_ROOT}."
    github_git_cmd "status --short" || true
    echo ""
    if [ ! -t 0 ]; then
      err "Non-interactive run cannot auto-confirm backup. Commit/push first, then rerun github-sync-tools."
      return 1
    fi
    local proceed
    read -rp "Proceed with automatic backup commit+push now and continue sync? [y/N]: " proceed
    if [[ "$proceed" =~ ^[Yy]$ ]]; then
      github_auto_checkpoint_backup || return 1
      changes="$(github_git_cmd "status --porcelain | wc -l | tr -d ' '" 2>/dev/null || echo 0)"
      if [ "${changes:-0}" -gt 0 ]; then
        err "Working tree still has uncommitted changes after auto-backup (${changes}). Resolve and retry."
        return 1
      fi
    else
      warn "GitHub tools sync cancelled. Sync DEV changes to GitHub first, then rerun option 10."
      return 1
    fi
  fi

  if ! github_git_cmd "remote get-url origin >/dev/null 2>&1"; then
    err "origin is not configured. Configure GitHub remote first."
    return 1
  fi

  bold "[1/2] Syncing DEV source state with GitHub..."
  echo "  - push latest local committed state first"
  echo "  - then pull latest from GitHub (rebase)"
  github_git_cmd "fetch --prune origin"
  tracking="$(github_git_cmd "rev-parse --abbrev-ref --symbolic-full-name '@{u}'" 2>/dev/null || true)"
  if [ -n "$tracking" ]; then
    local_ahead="$(github_git_cmd "rev-list --count @{u}..HEAD 2>/dev/null | tr -d ' '" || echo 0)"
  else
    local_ahead=0
  fi

  if [ "${local_ahead:-0}" -gt 0 ]; then
    echo "Local branch is ahead of origin by ${local_ahead} commit(s); pushing backup..."
    github_push_current
  else
    ok "Local committed state already pushed for branch '${branch}'."
  fi

  github_git_cmd "fetch --prune origin"
  github_git_cmd "pull --rebase origin $(printf '%q' "$branch")"
  ok "DEV source sync complete."
}

github_sync_lppadmin_scope() {
  local scope="${1:-cloud}"
  local acc_host acc_user prd_host prd_user

  github_sync_prepare_dev_source || return 1

  acc_host="$(default_acc_host_for_scope "$scope")"
  acc_user="$(default_acc_user_for_scope "$scope")"
  prd_host="$(default_prd_host_for_scope "$scope")"
  prd_user="$(default_prd_user_for_scope "$scope")"

  ensure_target_is_configured "$scope" acc "$acc_host" "$acc_user" || return 1
  ensure_target_is_configured "$scope" prd "$prd_host" "$prd_user" || return 1

  printf "\n"
  bold "Scoped lppadmin Sync ($(scope_label "$scope"))"
  echo "Outcome target: update lppadmin on DEV, ACC, PRD for $(scope_label "$scope")."
  echo "Non-target scope is not modified."
  echo

  bold "[2/2] Updating lppadmin on DEV/ACC/PRD ($(scope_label "$scope"))..."
  if ! update_dev_lppadmin "$scope"; then
    err "Scoped lppadmin sync failed on DEV ($(scope_label "$scope"))."
    return 1
  fi
  if ! update_acc_lppadmin "$scope" "$acc_host" "$acc_user"; then
    err "Scoped lppadmin sync failed on ACC ($(scope_label "$scope"))."
    return 1
  fi
  if ! update_prd_lppadmin "$scope" "$prd_host" "$prd_user"; then
    err "Scoped lppadmin sync failed on PRD ($(scope_label "$scope"))."
    return 1
  fi

  printf "\n"
  ok "Scoped lppadmin sync completed for $(scope_label "$scope")."
  echo "Security rule enforced: GitHub operations were executed on DEV only."
}

github_sync_full_update_scope() {
  local scope="${1:-cloud}"
  local acc_host acc_user prd_host prd_user

  github_sync_prepare_dev_source || return 1

  acc_host="$(default_acc_host_for_scope "$scope")"
  acc_user="$(default_acc_user_for_scope "$scope")"
  prd_host="$(default_prd_host_for_scope "$scope")"
  prd_user="$(default_prd_user_for_scope "$scope")"

  ensure_target_is_configured "$scope" acc "$acc_host" "$acc_user" || return 1
  ensure_target_is_configured "$scope" prd "$prd_host" "$prd_user" || return 1

  printf "\n"
  bold "Scoped Full Rollout ($(scope_label "$scope"))"
  echo "Outcome target: build/deploy full runtime with version parity across DEV/ACC/PRD."
  echo "Flow: DEV build+update -> ACC no-build deploy -> PRD no-build deploy."
  echo

  bold "[2/2] Running scoped full rollout ($(scope_label "$scope"))..."
  if ! deploy_all_scope "$scope" "$acc_host" "$acc_user" "$prd_host" "$prd_user"; then
    err "Scoped full rollout failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "Scoped full rollout completed for $(scope_label "$scope")."
}

github_sync_full_update_dev_acc_scope() {
  local scope="${1:-cloud}"
  local acc_host acc_user

  github_sync_prepare_dev_source || return 1

  acc_host="$(default_acc_host_for_scope "$scope")"
  acc_user="$(default_acc_user_for_scope "$scope")"
  ensure_target_is_configured "$scope" acc "$acc_host" "$acc_user" || return 1

  printf "\n"
  bold "Scoped Full Rollout DEV->ACC ($(scope_label "$scope"))"
  echo "Outcome target: sync GitHub, build/deploy DEV, then deploy ACC from latest DEV build."
  echo "Flow: DEV build+update -> ACC no-build deploy."
  echo

  bold "[2/2] Running scoped full rollout DEV->ACC ($(scope_label "$scope"))..."
  if ! deploy_dev_acc_scope "$scope" "$acc_host" "$acc_user"; then
    err "Scoped full rollout DEV->ACC failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "Scoped full rollout DEV->ACC completed for $(scope_label "$scope")."
}

github_sync_full_update_dev_scope() {
  local scope="${1:-cloud}"
  github_sync_prepare_dev_source || return 1

  printf "\n"
  bold "Scoped Full Update DEV ($(scope_label "$scope"))"
  echo "Outcome target: full update on DEV only (build + deploy)."
  echo

  bold "[2/2] Running scoped full update for DEV ($(scope_label "$scope"))..."
  if ! update_dev_scope "$scope"; then
    err "Scoped full DEV update failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "Scoped full DEV update completed for $(scope_label "$scope")."
}

github_deploy_acc_from_latest_scope() {
  local scope="${1:-cloud}"
  local acc_host acc_user pkg

  acc_host="$(default_acc_host_for_scope "$scope")"
  acc_user="$(default_acc_user_for_scope "$scope")"
  ensure_target_is_configured "$scope" acc "$acc_host" "$acc_user" || return 1

  pkg="$(latest_package_basename_for_scope "$scope")"
  if [ -z "$pkg" ]; then
    err "No package found for ${scope}. Build/deploy DEV first."
    return 1
  fi

  printf "\n"
  bold "Scoped Full Update ACC ($(scope_label "$scope"))"
  echo "Outcome target: deploy latest DEV-built package to ACC (no build, no GitHub sync)."
  echo "Package: ${pkg}"
  echo

  if ! update_acc_scope "$scope" "$acc_host" "$acc_user" --skip-build --package "$pkg"; then
    err "Scoped ACC deploy failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "Scoped ACC deploy completed for $(scope_label "$scope")."
}

github_deploy_prd_from_latest_scope() {
  local scope="${1:-cloud}"
  local prd_host prd_user pkg

  prd_host="$(default_prd_host_for_scope "$scope")"
  prd_user="$(default_prd_user_for_scope "$scope")"
  ensure_target_is_configured "$scope" prd "$prd_host" "$prd_user" || return 1

  pkg="$(latest_package_basename_for_scope "$scope")"
  if [ -z "$pkg" ]; then
    err "No package found for ${scope}. Build/deploy DEV first."
    return 1
  fi

  printf "\n"
  bold "Scoped Full Update PRD ($(scope_label "$scope"))"
  echo "Outcome target: deploy latest DEV-built package to PRD (no build, no GitHub sync)."
  echo "Package: ${pkg}"
  echo

  if ! update_prd_scope "$scope" "$prd_host" "$prd_user" --skip-build --package "$pkg"; then
    err "Scoped PRD deploy failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "Scoped PRD deploy completed for $(scope_label "$scope")."
}

github_sync_devadmin_local_only() {
  github_sync_prepare_dev_source || return 1

  printf "\n"
  bold "DEV host devadmin update only"
  bold "[2/2] Refreshing devadmin command on DEV..."
  ensure_devadmin_command_symlink
  chmod 755 /antigravity/devadmin.sh 2>/dev/null || true
  run_as_workspace_user "cd /antigravity && touch devadmin.sh" 2>/dev/null || true
  ok "devadmin refreshed on DEV host only."

  printf "\n"
  ok "DEV-only devadmin update completed."
}

menu_github_management() {
  local opt repo_root
  while true; do
    printf "\n"
    bold "GitHub Management"
    echo "  Repository root: ${GITHUB_REPO_ROOT}"
    echo "  GitHub user: ${GITHUB_DEFAULT_USERNAME}"
    echo "  1) Repository status"
    echo "  2) Backup now (commit + push)"
    echo "  3) Push current branch"
    echo "  4) Pull latest (rebase)"
    echo "  5) Update GitHub PAT credentials"
    echo "  6) Show/Set origin remote URL"
    echo "  7) Credential diagnostics"
    echo "  8) Safety audit (secrets/large files/nested repos)"
    echo "  9) Set repository root path"
    echo "  10) Scoped devadmin sync and update (DEV host only)"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-10, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "GitHub repository status" github_show_status ;;
      2) run_action "GitHub backup now" github_backup_now ;;
      3) run_action "GitHub push" github_push_current ;;
      4) run_action "GitHub pull/rebase" github_pull_rebase ;;
      5) run_action "Update GitHub PAT credentials" github_update_pat_credentials ;;
      6) run_action "Show/Set origin URL" github_show_or_set_remote ;;
      7) run_action "Credential diagnostics" github_credential_diagnostics ;;
      8) run_action "GitHub safety audit" github_safety_audit ;;
      9)
        read -rp "Repository root path [${GITHUB_REPO_ROOT}]: " repo_root
        repo_root="${repo_root:-$GITHUB_REPO_ROOT}"
        if [ ! -d "$repo_root" ]; then
          err "Directory does not exist: $repo_root"
        else
          GITHUB_REPO_ROOT="$repo_root"
          save_github_state
          ok "GitHub repository root updated: ${GITHUB_REPO_ROOT}"
        fi
        ;;
      10)
        run_action "Scoped devadmin sync and update (DEV-only)" github_sync_devadmin_local_only
        ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

build_cloud() {
  local ts log raw_version version pkg sha latest pkg_dir marker_file state_file
  ts="$(timestamp)"
  log="${LOG_DIR}/build-cloud-${ts}.log"
  pkg_dir="$(package_dir_for_scope cloud)"
  marker_file="$(release_notes_marker_for_scope cloud)"
  state_file="$WORKSPACE_ROOT/dist-cloud/release-notes-state.env"
  version="$(next_release_version_for_scope cloud)"
  pkg="${version}.tar.gz"
  sha="${pkg}.sha256"
  latest="learnplay-cloud.tar.gz"

  if [ "${LEARNPLAY_REQUIRE_BUILD_GITHUB_SYNC:-false}" = "true" ]; then
    bold "Pre-build source sync (GitHub + changelog discipline)..."
    if ! github_sync_prepare_dev_source; then
      err "Pre-build GitHub sync failed. Resolve sync issues, then retry build."
      return 1
    fi
  else
    local repo_status ahead behind
    repo_status="$(run_as_workspace_user "cd '$GITHUB_REPO_ROOT' && git status --short 2>/dev/null || true")"
    ahead="$(run_as_workspace_user "cd '$GITHUB_REPO_ROOT' && git rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 0")"
    behind="$(run_as_workspace_user "cd '$GITHUB_REPO_ROOT' && git rev-list --count 'HEAD..@{upstream}' 2>/dev/null || echo 0")"
    warn "Build uses local repository state on this host as source of truth (GitHub sync not required)."
    if [ -n "$repo_status" ]; then
      warn "Local repository has uncommitted changes."
    fi
    if [ "${ahead:-0}" != "0" ] || [ "${behind:-0}" != "0" ]; then
      warn "GitHub divergence detected: ahead=${ahead:-0}, behind=${behind:-0}."
    fi
    warn "Set LEARNPLAY_REQUIRE_BUILD_GITHUB_SYNC=true to restore strict pre-build GitHub sync."
  fi

  bold "Building cloud installer package..."
  if ! run_as_workspace_user "$(workspace_node_env_prefix)
cd '$WORKSPACE_ROOT' && LEARNPLAY_BUILD_INVOKER_TOOL='devadmin' RELEASE_VERSION_OVERRIDE='$version' RELEASE_NOTES_SCOPE='cloud' RELEASE_NOTES_SCRIPT='/antigravity/scripts/devadmin/generate-release-notes.sh' RELEASE_NOTES_PACKAGE_DIR='$pkg_dir' RELEASE_CHANGELOG_FILE='/antigravity/docs/handoverdocs/CHANGELOG.md' RELEASE_NOTES_MARKER_FILE='$marker_file' RELEASE_NOTES_STATE_OUTPUT='$state_file' bash build-cloud-linux.sh" 2>&1 | tee "$log"; then
    err "Cloud build failed. Check log: $log"
    return 1
  fi
  raw_version="$(read_dist_version "$WORKSPACE_ROOT/dist-cloud/version.json")"
  version="${raw_version:-unknown}"
  pkg="${version}.tar.gz"
  sha="${pkg}.sha256"
  run_as_workspace_user "mkdir -p '$pkg_dir'"
  run_as_workspace_user "cd '$WORKSPACE_ROOT' && tar czf '$pkg_dir/$pkg' dist-cloud"
  run_as_workspace_user "cd '$pkg_dir' && sha256sum '$pkg' > '$sha'"
  run_as_workspace_user "cd '$pkg_dir' && ln -sfn '$pkg' '$latest'"
  apply_package_retention_for_scope cloud
  persist_release_notes_marker cloud "$state_file"
  ok "Cloud package built: $pkg_dir/$pkg"
  echo "Checksum: $pkg_dir/$sha"
  echo "Latest link: $pkg_dir/$latest"
  echo "Build log: $log"
}

build_onprem() {
  local ts log raw_version version pkg sha latest pkg_dir marker_file state_file
  ts="$(timestamp)"
  log="${LOG_DIR}/build-onprem-${ts}.log"
  pkg_dir="$(package_dir_for_scope onprem)"
  marker_file="$(release_notes_marker_for_scope onprem)"
  state_file="$WORKSPACE_ROOT/dist-onprem/release-notes-state.env"
  version="$(next_release_version_for_scope onprem)"
  pkg="${version}.tar.gz"
  sha="${pkg}.sha256"
  latest="learnplay-onprem.tar.gz"

  if [ "${LEARNPLAY_REQUIRE_BUILD_GITHUB_SYNC:-false}" = "true" ]; then
    bold "Pre-build source sync (GitHub + changelog discipline)..."
    if ! github_sync_prepare_dev_source; then
      err "Pre-build GitHub sync failed. Resolve sync issues, then retry build."
      return 1
    fi
  else
    local repo_status ahead behind
    repo_status="$(run_as_workspace_user "cd '$GITHUB_REPO_ROOT' && git status --short 2>/dev/null || true")"
    ahead="$(run_as_workspace_user "cd '$GITHUB_REPO_ROOT' && git rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 0")"
    behind="$(run_as_workspace_user "cd '$GITHUB_REPO_ROOT' && git rev-list --count 'HEAD..@{upstream}' 2>/dev/null || echo 0")"
    warn "Build uses local repository state on this host as source of truth (GitHub sync not required)."
    if [ -n "$repo_status" ]; then
      warn "Local repository has uncommitted changes."
    fi
    if [ "${ahead:-0}" != "0" ] || [ "${behind:-0}" != "0" ]; then
      warn "GitHub divergence detected: ahead=${ahead:-0}, behind=${behind:-0}."
    fi
    warn "Set LEARNPLAY_REQUIRE_BUILD_GITHUB_SYNC=true to restore strict pre-build GitHub sync."
  fi

  bold "Building onprem installer package..."
  if ! run_as_workspace_user "$(workspace_node_env_prefix)
cd '$WORKSPACE_ROOT' && LEARNPLAY_BUILD_INVOKER_TOOL='devadmin' RELEASE_VERSION_OVERRIDE='$version' RELEASE_NOTES_SCOPE='onprem' RELEASE_NOTES_SCRIPT='/antigravity/scripts/devadmin/generate-release-notes.sh' RELEASE_NOTES_PACKAGE_DIR='$pkg_dir' RELEASE_CHANGELOG_FILE='/antigravity/docs/handoverdocs/CHANGELOG.md' RELEASE_NOTES_MARKER_FILE='$marker_file' RELEASE_NOTES_STATE_OUTPUT='$state_file' bash onprem/build-onprem.sh" 2>&1 | tee "$log"; then
    err "OnPrem build failed. Check log: $log"
    return 1
  fi
  raw_version="$(read_dist_version "$WORKSPACE_ROOT/dist-onprem/version.json")"
  version="${raw_version:-unknown}"
  pkg="${version}.tar.gz"
  sha="${pkg}.sha256"
  run_as_workspace_user "mkdir -p '$pkg_dir'"
  run_as_workspace_user "cd '$WORKSPACE_ROOT' && tar czf '$pkg_dir/$pkg' dist-onprem"
  run_as_workspace_user "cd '$pkg_dir' && sha256sum '$pkg' > '$sha'"
  run_as_workspace_user "cd '$pkg_dir' && ln -sfn '$pkg' '$latest'"
  apply_package_retention_for_scope onprem
  persist_release_notes_marker onprem "$state_file"
  ok "OnPrem package built: $pkg_dir/$pkg"
  echo "Checksum: $pkg_dir/$sha"
  echo "Latest link: $pkg_dir/$latest"
  echo "Build log: $log"
}

list_artifacts() {
  local scope="${1:-all}"
  local pattern
  local pkg_dir_cloud pkg_dir_onprem
  pattern="$(artifact_pattern_for_scope "$scope")"
  bold "Latest package artifacts ($(scope_label "$scope"))"
  if [ "$scope" = "all" ]; then
    pkg_dir_cloud="$(package_dir_for_scope cloud)"
    pkg_dir_onprem="$(package_dir_for_scope onprem)"
    ls -1t "$pkg_dir_cloud"/LP-CL-V*.tar.gz "$pkg_dir_cloud"/LP-CL-V*.tar.gz.sha256 \
      "$pkg_dir_onprem"/LP-OP-V*.tar.gz "$pkg_dir_onprem"/LP-OP-V*.tar.gz.sha256 \
      2>/dev/null | head -20 || true
  else
    ls -1t "$(package_dir_for_scope "$scope")"/$pattern "$(package_dir_for_scope "$scope")"/$pattern.sha256 2>/dev/null | head -20 || true
  fi
}

prompt_update_package_for_scope() {
  local scope="$1"
  local default_pkg="${2:-}"
  local pattern choice max idx selected pkg_dir
  local -a pkgs=()
  local default_found=0
  pattern="$(artifact_pattern_for_scope "$scope")"
  pkg_dir="$(package_dir_for_scope "$scope")"
  mapfile -t pkgs < <(ls -1t "$pkg_dir"/$pattern 2>/dev/null | head -20 || true)
  max="${#pkgs[@]}"
  if [ "$max" -eq 0 ]; then
    warn "No DEV artifacts found for $(scope_label "$scope"); falling back to latest selection." >&2
    echo ""
    return 0
  fi

  if [ -n "$default_pkg" ] && [ -f "$pkg_dir/$default_pkg" ]; then
    default_found=1
  fi

  echo "Select DEV package for $(scope_label "$scope") update:" >&2
  if [ "$default_found" -eq 1 ]; then
    echo "  Enter = ${default_pkg} (default)" >&2
  else
    echo "  Enter = latest available" >&2
  fi
  idx=1
  for selected in "${pkgs[@]}"; do
    if [ "$default_found" -eq 1 ] && [ "$(basename "$selected")" = "$default_pkg" ]; then
      echo "  ${idx}) $(basename "$selected") [default]" >&2
    else
      echo "  ${idx}) $(basename "$selected")" >&2
    fi
    idx=$((idx + 1))
  done

  while true; do
    read -rp "Package [Enter or 1-${max}]: " choice || { echo ""; return 0; }
    if [ -z "${choice:-}" ]; then
      if [ "$default_found" -eq 1 ]; then
        echo "$default_pkg"
      else
        echo ""
      fi
      return 0
    fi
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$max" ]; then
      selected="${pkgs[$((choice - 1))]}"
      echo "$(basename "$selected")"
      return 0
    fi
    warn "Invalid selection: ${choice}" >&2
  done
}

verify_artifacts() {
  local scope="${1:-all}"
  local pattern pkg_dir
  local failures=0
  local checked=0
  local pkg sha
  local -a dirs=()
  pattern="$(artifact_pattern_for_scope "$scope")"
  if [ "$scope" = "all" ]; then
    dirs=("$(package_dir_for_scope cloud)" "$(package_dir_for_scope onprem)")
  else
    dirs=("$(package_dir_for_scope "$scope")")
  fi
  shopt -s nullglob
  for pkg_dir in "${dirs[@]}"; do
    for pkg in "$pkg_dir"/$pattern; do
      [ -f "$pkg" ] || continue
      # Skip floating "latest" symlinks; only verify versioned artifact files.
      if [ -L "$pkg" ]; then
        continue
      fi
      sha="${pkg}.sha256"
      if [ ! -f "$sha" ]; then
        warn "Missing checksum file for $(basename "$pkg")"
        failures=$((failures + 1))
        continue
      fi
      checked=$((checked + 1))
      if (cd "$pkg_dir" && sha256sum -c "$(basename "$sha")" >/dev/null 2>&1); then
        ok "Verified $(basename "$pkg")"
      else
        err "Checksum mismatch for $(basename "$pkg")"
        failures=$((failures + 1))
      fi
    done
  done
  shopt -u nullglob
  if [ "$checked" -eq 0 ]; then
    warn "No versioned artifacts found for $(scope_label "$scope")."
    return 1
  fi
  if [ "$failures" -gt 0 ]; then
    return 1
  fi
  ok "All available package checksums verified for $(scope_label "$scope")."
}

extract_installed_version() {
  local raw
  raw="$(sed -n 's/^InstalledVersionRaw:[[:space:]]*//p' | head -1 | tr -d '[:space:]')"
  if [ -n "$raw" ]; then
    echo "$raw"
    return 0
  fi
  raw="$(sed -n 's/^InstalledVersion:[[:space:]]*//p' | head -1 | tr -d '[:space:]')"
  echo "$raw"
}

format_component_version_for_display() {
  local component="${1:-}"
  local value="${2:-unknown}"
  if [ "$component" != "learnplay" ]; then
    echo "$value"
    return 0
  fi
  case "$value" in
    LP-CL-V*|LP-OP-V*) echo "$value" ;;
    unknown|missing|"") echo "${value:-unknown}" ;;
    *) echo "$value" ;;
  esac
}

version_relation() {
  local dev="$1"
  local acc="$2"
  local i max da aa

  if [ "$dev" = "$acc" ]; then
    echo "equal"
    return 0
  fi

  if [[ "$dev" =~ ^[0-9]+$ && "$acc" =~ ^[0-9]+$ ]]; then
    if [ "$dev" -gt "$acc" ]; then echo "DEV higher"; else echo "ACC higher"; fi
    return 0
  fi

  if [[ "$dev" =~ ^[0-9]+([.][0-9]+)+$ && "$acc" =~ ^[0-9]+([.][0-9]+)+$ ]]; then
    local IFS=.
    read -r -a dparts <<< "$dev"
    read -r -a aparts <<< "$acc"
    max="${#dparts[@]}"
    if [ "${#aparts[@]}" -gt "$max" ]; then
      max="${#aparts[@]}"
    fi
    for ((i=0; i<max; i++)); do
      da="${dparts[$i]:-0}"
      aa="${aparts[$i]:-0}"
      if ((10#$da > 10#$aa)); then
        echo "DEV higher"
        return 0
      fi
      if ((10#$da < 10#$aa)); then
        echo "ACC higher"
        return 0
      fi
    done
    echo "equal"
    return 0
  fi

  if [[ "$dev" > "$acc" ]]; then
    echo "DEV higher"
  else
    echo "ACC higher"
  fi
}

read_local_component_versions() {
  local scope="${1:-cloud}"
  local learnplay nginx pg devadmin
  if is_wsl_dev_workspace; then
    learnplay="$(latest_package_basename_for_scope "$scope" || true)"
    learnplay="${learnplay%.tar.gz}"
    learnplay="${learnplay:-source-local}"
    nginx="n/a (WSL local)"
  else
    learnplay="$(runtime_version_for_scope "$scope" || true)"
    nginx="$(dpkg-query -W -f='${Version}' nginx 2>/dev/null || true)"
    if [ -z "$nginx" ]; then
      nginx="$(nginx -v 2>&1 | sed -n 's#.*nginx/\([^ ]*\).*#\1#p' | head -1 || true)"
    fi
  fi
  pg="$(psql --version 2>/dev/null | awk '{print $3}' | head -1 || true)"
  if [ -x "/usr/local/bin/devadmin" ]; then
    devadmin="$(grep -E '^DEVADMIN_VERSION=' /usr/local/bin/devadmin 2>/dev/null | head -1 | cut -d'"' -f2 || true)"
  else
    devadmin="$DEVADMIN_VERSION"
  fi
  cat <<EOF
learnplay=${learnplay:-unknown}
nginx=${nginx:-unknown}
postgresql=${pg:-unknown}
devadmin=${devadmin:-unknown}
EOF
}

read_remote_component_versions() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local script
  script=$(cat <<EOF
set -euo pipefail

if [ "${scope}" = "cloud" ]; then
  version_file="/opt/learnplay/cloud/version.json"
else
  version_file="/opt/learnplay/onprem/version.json"
fi
learnplay="unknown"
if [ -f "\$version_file" ]; then
  if command -v jq >/dev/null 2>&1; then
    learnplay="\$(jq -r '.version // empty' "\$version_file" 2>/dev/null || true)"
  fi
  if [ -z "\$learnplay" ]; then
    learnplay="\$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "\$version_file" | head -1 || true)"
  fi
fi
nginx=\$(dpkg-query -W -f='\${Version}' nginx 2>/dev/null || true)
if [ -z "\$nginx" ]; then
  nginx=\$(nginx -v 2>&1 | sed -n 's#.*nginx/\\([^ ]*\\).*#\\1#p' | head -1 || true)
fi
pg=\$(psql --version 2>/dev/null | awk '{print \$3}' | head -1 || true)
devadmin=""
if [ -f /usr/local/bin/devadmin ]; then
  devadmin=\$(grep -E '^DEVADMIN_VERSION=' /usr/local/bin/devadmin 2>/dev/null | head -1 | cut -d'"' -f2 || true)
fi

printf 'learnplay=%s\n' "\${learnplay:-unknown}"
printf 'nginx=%s\n' "\${nginx:-unknown}"
printf 'postgresql=%s\n' "\${pg:-unknown}"
printf 'devadmin=%s\n' "\${devadmin:-unknown}"
EOF
)
  remote_exec_bash "$scope" "$env_name" "$host" "$user" "$script"
}

version_value_from_map() {
  local key="$1"
  sed -n "s/^${key}=//p" | head -1 | tr -d '\r'
}

schema_snapshot_script_for_scope() {
  local scope="$1"
  local env_file_override="${2:-}"
  local root env_file_line
  if [ -n "$env_file_override" ]; then
    env_file_line="env_file='${env_file_override}'"
  else
    root="$(runtime_root_for_scope "$scope")" || return 1
    env_file_line="root='${root}'
env_file=\"\${root}/.env\""
  fi
  cat <<EOF
set -euo pipefail
${env_file_line}
db_url=""

if [ -f "\$env_file" ]; then
  db_url="\$(awk -F= '/^DATABASE_URL=/{sub(/^DATABASE_URL=/,""); print; exit}' "\$env_file" | tr -d '\r' || true)"
fi

if [ -z "\$db_url" ]; then
  echo "ERROR=DATABASE_URL missing in \${env_file}"
  exit 2
fi

db_url="\${db_url%\"}"
db_url="\${db_url#\"}"
db_url="\${db_url%\'}"
db_url="\${db_url#\'}"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR=psql command not found"
  exit 3
fi

tables="\$(psql "\$db_url" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || true)"
columns="\$(psql "\$db_url" -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public';" 2>/dev/null || true)"
enums="\$(psql "\$db_url" -Atqc "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname='public' AND t.typtype='e';" 2>/dev/null || true)"
if [ -z "\$tables" ] || [ -z "\$columns" ] || [ -z "\$enums" ]; then
  echo "ERROR=Unable to query schema summary from DATABASE_URL"
  exit 4
fi

printf 'SCHEMA_TABLES=%s\n' "\$tables"
printf 'SCHEMA_COLUMNS=%s\n' "\$columns"
printf 'SCHEMA_ENUMS=%s\n' "\$enums"
psql "\$db_url" -Atqc "SELECT 'TC|' || table_name || '|' || count(*)::text FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name ORDER BY table_name;" 2>/dev/null || true
psql "\$db_url" -Atqc "SELECT 'COL|' || table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;" 2>/dev/null || true
psql "\$db_url" -Atqc "SELECT 'ENUM|' || t.typname || '|' || e.enumsortorder::text || '|' || e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname='public' ORDER BY t.typname, e.enumsortorder;" 2>/dev/null || true
EOF
}

read_local_schema_snapshot() {
  local scope="$1"
  local script env_file=""
  if is_wsl_dev_workspace; then
    env_file="$WORKSPACE_ROOT/.env.${scope}.local"
  fi
  script="$(schema_snapshot_script_for_scope "$scope" "$env_file")" || return 1
  bash -c "$script"
}

read_remote_schema_snapshot() {
  local scope="$1"
  local env_name="$2"
  local host="$3"
  local user="$4"
  local script
  script="$(schema_snapshot_script_for_scope "$scope")" || return 1
  remote_exec_bash "$scope" "$env_name" "$host" "$user" "$script"
}

schema_value_from_map() {
  local key="$1"
  sed -n "s/^${key}=//p" | head -1 | tr -d '\r'
}

build_schema_diff_files() {
  local dev_map="$1"
  local target_map="$2"
  local outdir="$3"

  printf '%s\n' "$dev_map" | awk -F'|' '$1=="TC"{print $2}' | sort -u > "${outdir}/dev_tables"
  printf '%s\n' "$target_map" | awk -F'|' '$1=="TC"{print $2}' | sort -u > "${outdir}/target_tables"
  printf '%s\n' "$dev_map" | awk -F'|' '$1=="COL"{print $2 "|" $3}' | sort -u > "${outdir}/dev_columns"
  printf '%s\n' "$target_map" | awk -F'|' '$1=="COL"{print $2 "|" $3}' | sort -u > "${outdir}/target_columns"
  printf '%s\n' "$dev_map" | awk -F'|' '$1=="ENUM"{print $2 "|" $3 "|" $4}' | sort -u > "${outdir}/dev_enums"
  printf '%s\n' "$target_map" | awk -F'|' '$1=="ENUM"{print $2 "|" $3 "|" $4}' | sort -u > "${outdir}/target_enums"
  printf '%s\n' "$dev_map" | awk -F'|' '$1=="TC"{print $2 "|" $3}' | sort -u > "${outdir}/dev_table_counts"
  printf '%s\n' "$target_map" | awk -F'|' '$1=="TC"{print $2 "|" $3}' | sort -u > "${outdir}/target_table_counts"

  comm -23 "${outdir}/dev_tables" "${outdir}/target_tables" > "${outdir}/missing_tables"
  comm -13 "${outdir}/dev_tables" "${outdir}/target_tables" > "${outdir}/extra_tables"
  comm -23 "${outdir}/dev_columns" "${outdir}/target_columns" > "${outdir}/missing_columns"
  comm -13 "${outdir}/dev_columns" "${outdir}/target_columns" > "${outdir}/extra_columns"
  comm -23 "${outdir}/dev_enums" "${outdir}/target_enums" > "${outdir}/missing_enums"
  comm -13 "${outdir}/dev_enums" "${outdir}/target_enums" > "${outdir}/extra_enums"

  awk -F'|' '
    NR==FNR { dev[$1]=$2; next }
    {
      t=$1; c=$2;
      if (t in dev && dev[t] != c) {
        printf "%s|%s|%s\n", t, dev[t], c;
      }
    }
  ' "${outdir}/dev_table_counts" "${outdir}/target_table_counts" > "${outdir}/column_count_diffs"
}

print_schema_mismatch_details() {
  local outdir="$1"
  local target_label="$2"
  local has_output=0

  if [ -s "${outdir}/missing_tables" ]; then
    has_output=1
    echo "Missing tables on ${target_label} (present on DEV):"
    sed 's/^/  - /' "${outdir}/missing_tables"
  fi
  if [ -s "${outdir}/missing_columns" ]; then
    has_output=1
    echo "Missing columns on ${target_label} (present on DEV):"
    sed 's/^/  - /' "${outdir}/missing_columns"
  fi
  if [ -s "${outdir}/column_count_diffs" ]; then
    has_output=1
    echo "Column count differences by table (DEV vs ${target_label}):"
    awk -F'|' '{printf "  - %s (DEV=%s, %s=%s)\n", $1, $2, "'"${target_label}"'", $3}' "${outdir}/column_count_diffs"
  fi
  if [ -s "${outdir}/extra_tables" ]; then
    has_output=1
    echo "Extra tables on ${target_label} (not in DEV baseline):"
    sed 's/^/  - /' "${outdir}/extra_tables"
  fi
  if [ -s "${outdir}/extra_columns" ]; then
    has_output=1
    echo "Extra columns on ${target_label} (not in DEV baseline):"
    sed 's/^/  - /' "${outdir}/extra_columns"
  fi
  if [ -s "${outdir}/missing_enums" ]; then
    has_output=1
    echo "Missing enum values on ${target_label} (present on DEV):"
    sed 's/^/  - /' "${outdir}/missing_enums"
  fi
  if [ -s "${outdir}/extra_enums" ]; then
    has_output=1
    echo "Extra enum values on ${target_label} (not in DEV baseline):"
    sed 's/^/  - /' "${outdir}/extra_enums"
  fi

  if [ "$has_output" -eq 0 ]; then
    echo "No table/column/enum-level schema differences detected."
  fi
}

compare_versions() {
  local scope="${1:-cloud}"
  local host="${2:-$(default_acc_host_for_scope "$scope")}"
  local user="${3:-$(default_acc_user_for_scope "$scope")}"
  local env_label="${4:-ACC}"
  local env_name="${5:-acc}"
  local dev_host dev_map remote_map component devv remotev relation status higher
  local dev_schema_map remote_schema_map
  local dev_tables dev_columns dev_enums remote_tables remote_columns remote_enums schema_status
  local schema_diff_dir schema_mismatch_count
  local mismatch_details="" mismatch_line
  local mismatches=0
  local green red nc

  green='\033[0;32m'
  red='\033[0;31m'
  nc='\033[0m'
  dev_host="$(hostname -f 2>/dev/null || hostname)"
  ensure_target_is_configured "$scope" "$env_name" "$host" "$user" || return 1

  dev_map="$(read_local_component_versions "$scope")"
  if [ -z "$dev_map" ]; then
    err "Could not read DEV component versions."
    return 1
  fi

  remote_map="$(read_remote_component_versions "$scope" "$env_name" "$host" "$user" 2>/dev/null || true)"
  if [ -z "$remote_map" ]; then
    err "Could not read ${env_label} component versions from ${user}@${host}."
    return 1
  fi
  dev_schema_map="$(read_local_schema_snapshot "$scope" 2>/dev/null || true)"
  if [ -z "$dev_schema_map" ] || printf '%s\n' "$dev_schema_map" | grep -q '^ERROR='; then
    err "Could not read DEV database schema snapshot for $(scope_label "$scope")."
    printf '%s\n' "$dev_schema_map" | sed -n 's/^ERROR=/  details: /p'
    return 1
  fi
  remote_schema_map="$(read_remote_schema_snapshot "$scope" "$env_name" "$host" "$user" 2>/dev/null || true)"
  if [ -z "$remote_schema_map" ] || printf '%s\n' "$remote_schema_map" | grep -q '^ERROR='; then
    err "Could not read ${env_label} database schema snapshot from ${user}@${host}."
    printf '%s\n' "$remote_schema_map" | sed -n 's/^ERROR=/  details: /p'
    return 1
  fi

  printf "\n"
  bold "Version Parity Check DEV vs ${env_label} ($(scope_label "$scope"))"
  echo "DEV host: ${dev_host}"
  echo "${env_label} host: ${host}"
  echo
  printf "%-12s | %-22s | %-22s | %-10s | %-12s\n" "COMPONENT" "DEV" "${env_label}" "STATUS" "DIFF"
  printf "%-12s-+-%-22s-+-%-22s-+-%-10s-+-%-12s\n" "------------" "----------------------" "----------------------" "----------" "------------"

  for component in learnplay nginx postgresql; do
    local devv_display remotev_display
    devv="$(printf '%s\n' "$dev_map" | version_value_from_map "$component")"
    remotev="$(printf '%s\n' "$remote_map" | version_value_from_map "$component")"
    devv="${devv:-unknown}"
    remotev="${remotev:-unknown}"
    devv_display="$(format_component_version_for_display "$component" "$devv")"
    remotev_display="$(format_component_version_for_display "$component" "$remotev")"
    if [[ "$devv" == n/a* || "$remotev" == n/a* ]]; then
      status="${green}INFO${nc}"
      higher="excluded"
      printf "%-12s | %-22s | %-22s | %-19b | %-12s\n" "$component" "$devv_display" "$remotev_display" "$status" "$higher"
      continue
    fi
    relation="$(version_relation "$devv" "$remotev")"
    if [ "$relation" = "equal" ]; then
      status="${green}OK${nc}"
      higher="-"
    elif [ "$relation" = "DEV higher" ]; then
      status="${red}MISMATCH${nc}"
      higher="DEV > ${env_label}"
      mismatches=$((mismatches + 1))
      mismatch_line="${component}: DEV=${devv_display}, ${env_label}=${remotev_display} (DEV higher)"
      mismatch_details+="${mismatch_line}"$'\n'
    else
      status="${red}MISMATCH${nc}"
      higher="${env_label} > DEV"
      mismatches=$((mismatches + 1))
      mismatch_line="${component}: DEV=${devv_display}, ${env_label}=${remotev_display} (${env_label} higher)"
      mismatch_details+="${mismatch_line}"$'\n'
    fi
    printf "%-12s | %-22s | %-22s | %-19b | %-12s\n" "$component" "$devv_display" "$remotev_display" "$status" "$higher"
  done

  # DEV-only tooling must never be expected on ACC/PRD/OnPrem targets.
  devv="$(printf '%s\n' "$dev_map" | version_value_from_map "devadmin")"
  devv="${devv:-unknown}"
  printf "%-12s | %-22s | %-22s | %-19b | %-12s\n" "devadmin" "$devv" "n/a (DEV only)" "${green}INFO${nc}" "excluded"

  echo
  if [ "$mismatches" -eq 0 ]; then
    printf "${green}OK${nc}: all component versions match between DEV and ${env_label}.\n"
  else
    printf "${red}MISMATCH${nc}: %s component(s) differ between DEV and ${env_label}.\n" "$mismatches"
    echo "Summary of mismatches:"
    printf "%s" "$mismatch_details"
  fi

  dev_tables="$(printf '%s\n' "$dev_schema_map" | schema_value_from_map "SCHEMA_TABLES")"
  dev_columns="$(printf '%s\n' "$dev_schema_map" | schema_value_from_map "SCHEMA_COLUMNS")"
  dev_enums="$(printf '%s\n' "$dev_schema_map" | schema_value_from_map "SCHEMA_ENUMS")"
  remote_tables="$(printf '%s\n' "$remote_schema_map" | schema_value_from_map "SCHEMA_TABLES")"
  remote_columns="$(printf '%s\n' "$remote_schema_map" | schema_value_from_map "SCHEMA_COLUMNS")"
  remote_enums="$(printf '%s\n' "$remote_schema_map" | schema_value_from_map "SCHEMA_ENUMS")"
  schema_diff_dir="$(mktemp -d)"
  build_schema_diff_files "$dev_schema_map" "$remote_schema_map" "$schema_diff_dir"
  schema_mismatch_count=$(( $(wc -l < "${schema_diff_dir}/missing_tables") + $(wc -l < "${schema_diff_dir}/missing_columns") + $(wc -l < "${schema_diff_dir}/missing_enums") + $(wc -l < "${schema_diff_dir}/column_count_diffs") + $(wc -l < "${schema_diff_dir}/extra_tables") + $(wc -l < "${schema_diff_dir}/extra_columns") + $(wc -l < "${schema_diff_dir}/extra_enums") ))

  if [ "$schema_mismatch_count" -eq 0 ] && [ "${dev_tables:-}" = "${remote_tables:-}" ] && [ "${dev_columns:-}" = "${remote_columns:-}" ] && [ "${dev_enums:-}" = "${remote_enums:-}" ]; then
    schema_status="${green}OK${nc}"
  else
    schema_status="${red}MISMATCH${nc}"
  fi

  printf "\n"
  bold "Database Schema Parity DEV vs ${env_label} (DEV baseline)"
  printf "%-14s | %-12s | %-12s | %-10s\n" "METRIC" "DEV" "${env_label}" "STATUS"
  printf "%-14s-+-%-12s-+-%-12s-+-%-10s\n" "--------------" "------------" "------------" "----------"
  if [ "${dev_tables:-unknown}" = "${remote_tables:-unknown}" ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-19b\n" "tables" "${dev_tables:-unknown}" "${remote_tables:-unknown}" "$status"
  if [ "${dev_columns:-unknown}" = "${remote_columns:-unknown}" ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-19b\n" "columns" "${dev_columns:-unknown}" "${remote_columns:-unknown}" "$status"
  if [ "${dev_enums:-unknown}" = "${remote_enums:-unknown}" ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-19b\n" "enums" "${dev_enums:-unknown}" "${remote_enums:-unknown}" "$status"
  printf "%-14s | %-12s | %-12s | %-19b\n" "schema diff" "-" "$(printf '%s' "$schema_mismatch_count") item(s)" "$schema_status"

  echo
  if [ "$schema_mismatch_count" -eq 0 ] && [ "${dev_tables:-}" = "${remote_tables:-}" ] && [ "${dev_columns:-}" = "${remote_columns:-}" ] && [ "${dev_enums:-}" = "${remote_enums:-}" ]; then
    printf "${green}OK${nc}: database schema matches DEV baseline for ${env_label}.\n"
  else
    printf "${red}MISMATCH${nc}: database schema differs from DEV baseline on ${env_label}.\n"
    print_schema_mismatch_details "$schema_diff_dir" "$env_label"
  fi
  rm -rf "$schema_diff_dir"
}

compare_versions_all() {
  local host_cloud="${1:-$(default_acc_host_for_scope cloud)}"
  local user_cloud="${2:-$(default_acc_user_for_scope cloud)}"
  local host_onprem="${3:-$(default_acc_host_for_scope onprem)}"
  local user_onprem="${4:-$(default_acc_user_for_scope onprem)}"
  compare_versions cloud "$host_cloud" "$user_cloud" "ACC" "acc"
  echo
  compare_versions onprem "$host_onprem" "$user_onprem" "ACC" "acc"
}

compare_versions_prd() {
  local scope="${1:-cloud}"
  local host="${2:-$(default_prd_host_for_scope "$scope")}"
  local user="${3:-$(default_prd_user_for_scope "$scope")}"
  compare_versions "$scope" "$host" "$user" "PRD" "prd"
}

compare_versions_3way() {
  local scope="${1:-cloud}"
  local acc_host="${2:-$(default_acc_host_for_scope "$scope")}"
  local acc_user="${3:-$(default_acc_user_for_scope "$scope")}"
  local prd_host="${4:-$(default_prd_host_for_scope "$scope")}"
  local prd_user="${5:-$(default_prd_user_for_scope "$scope")}"
  local dev_host dev_map acc_map prd_map component devv accv prdv status
  local dev_schema_map acc_schema_map prd_schema_map
  local dev_tables dev_columns dev_enums acc_tables acc_columns acc_enums prd_tables prd_columns prd_enums
  local acc_schema_diff_dir prd_schema_diff_dir
  local acc_schema_mismatch_count prd_schema_mismatch_count
  local acc_schema_ok prd_schema_ok
  local mismatch_details=""
  local mismatches=0
  local green red nc

  green='\033[0;32m'
  red='\033[0;31m'
  nc='\033[0m'
  dev_host="$(hostname -f 2>/dev/null || hostname)"
  ensure_target_is_configured "$scope" "acc" "$acc_host" "$acc_user" || return 1
  ensure_target_is_configured "$scope" "prd" "$prd_host" "$prd_user" || return 1

  dev_map="$(read_local_component_versions "$scope")"
  if [ -z "$dev_map" ]; then
    err "Could not read DEV component versions."
    return 1
  fi
  acc_map="$(read_remote_component_versions "$scope" "acc" "$acc_host" "$acc_user" 2>/dev/null || true)"
  if [ -z "$acc_map" ]; then
    err "Could not read ACC component versions from ${acc_user}@${acc_host}."
    return 1
  fi
  prd_map="$(read_remote_component_versions "$scope" "prd" "$prd_host" "$prd_user" 2>/dev/null || true)"
  if [ -z "$prd_map" ]; then
    err "Could not read PRD component versions from ${prd_user}@${prd_host}."
    return 1
  fi
  dev_schema_map="$(read_local_schema_snapshot "$scope" 2>/dev/null || true)"
  if [ -z "$dev_schema_map" ] || printf '%s\n' "$dev_schema_map" | grep -q '^ERROR='; then
    err "Could not read DEV database schema snapshot for $(scope_label "$scope")."
    printf '%s\n' "$dev_schema_map" | sed -n 's/^ERROR=/  details: /p'
    return 1
  fi
  acc_schema_map="$(read_remote_schema_snapshot "$scope" "acc" "$acc_host" "$acc_user" 2>/dev/null || true)"
  if [ -z "$acc_schema_map" ] || printf '%s\n' "$acc_schema_map" | grep -q '^ERROR='; then
    err "Could not read ACC database schema snapshot from ${acc_user}@${acc_host}."
    printf '%s\n' "$acc_schema_map" | sed -n 's/^ERROR=/  details: /p'
    return 1
  fi
  prd_schema_map="$(read_remote_schema_snapshot "$scope" "prd" "$prd_host" "$prd_user" 2>/dev/null || true)"
  if [ -z "$prd_schema_map" ] || printf '%s\n' "$prd_schema_map" | grep -q '^ERROR='; then
    err "Could not read PRD database schema snapshot from ${prd_user}@${prd_host}."
    printf '%s\n' "$prd_schema_map" | sed -n 's/^ERROR=/  details: /p'
    return 1
  fi

  printf "\n"
  bold "Version Parity Check DEV vs ACC vs PRD ($(scope_label "$scope"))"
  echo "DEV host: ${dev_host}"
  echo "ACC host: ${acc_host} (${acc_user})"
  echo "PRD host: ${prd_host} (${prd_user})"
  echo
  printf "%-12s | %-20s | %-20s | %-20s | %-10s\n" "COMPONENT" "DEV" "ACC" "PRD" "STATUS"
  printf "%-12s-+-%-20s-+-%-20s-+-%-20s-+-%-10s\n" "------------" "--------------------" "--------------------" "--------------------" "----------"

  for component in learnplay nginx postgresql; do
    local devv_display accv_display prdv_display
    devv="$(printf '%s\n' "$dev_map" | version_value_from_map "$component")"
    accv="$(printf '%s\n' "$acc_map" | version_value_from_map "$component")"
    prdv="$(printf '%s\n' "$prd_map" | version_value_from_map "$component")"
    devv="${devv:-unknown}"
    accv="${accv:-unknown}"
    prdv="${prdv:-unknown}"
    devv_display="$(format_component_version_for_display "$component" "$devv")"
    accv_display="$(format_component_version_for_display "$component" "$accv")"
    prdv_display="$(format_component_version_for_display "$component" "$prdv")"
    if [[ "$devv" == n/a* || "$accv" == n/a* || "$prdv" == n/a* ]]; then
      status="${green}INFO${nc}"
    elif [ "$devv" = "$accv" ] && [ "$accv" = "$prdv" ]; then
      status="${green}OK${nc}"
    else
      status="${red}MISMATCH${nc}"
      mismatches=$((mismatches + 1))
      mismatch_details+="${component}: DEV=${devv_display}, ACC=${accv_display}, PRD=${prdv_display}"$'\n'
    fi
    printf "%-12s | %-20s | %-20s | %-20s | %-19b\n" "$component" "$devv_display" "$accv_display" "$prdv_display" "$status"
  done

  # DEV-only tooling must never be expected on ACC/PRD/OnPrem targets.
  devv="$(printf '%s\n' "$dev_map" | version_value_from_map "devadmin")"
  devv="${devv:-unknown}"
  printf "%-12s | %-20s | %-20s | %-20s | %-19b\n" "devadmin" "$devv" "n/a (DEV only)" "n/a (DEV only)" "${green}INFO${nc}"

  echo
  if [ "$mismatches" -eq 0 ]; then
    printf "${green}OK${nc}: all component versions match across DEV/ACC/PRD.\n"
  else
    printf "${red}MISMATCH${nc}: %s component(s) differ across DEV/ACC/PRD.\n" "$mismatches"
    echo "Summary of mismatches:"
    printf "%s" "$mismatch_details"
  fi

  dev_tables="$(printf '%s\n' "$dev_schema_map" | schema_value_from_map "SCHEMA_TABLES")"
  dev_columns="$(printf '%s\n' "$dev_schema_map" | schema_value_from_map "SCHEMA_COLUMNS")"
  dev_enums="$(printf '%s\n' "$dev_schema_map" | schema_value_from_map "SCHEMA_ENUMS")"
  acc_tables="$(printf '%s\n' "$acc_schema_map" | schema_value_from_map "SCHEMA_TABLES")"
  acc_columns="$(printf '%s\n' "$acc_schema_map" | schema_value_from_map "SCHEMA_COLUMNS")"
  acc_enums="$(printf '%s\n' "$acc_schema_map" | schema_value_from_map "SCHEMA_ENUMS")"
  prd_tables="$(printf '%s\n' "$prd_schema_map" | schema_value_from_map "SCHEMA_TABLES")"
  prd_columns="$(printf '%s\n' "$prd_schema_map" | schema_value_from_map "SCHEMA_COLUMNS")"
  prd_enums="$(printf '%s\n' "$prd_schema_map" | schema_value_from_map "SCHEMA_ENUMS")"

  acc_schema_diff_dir="$(mktemp -d)"
  prd_schema_diff_dir="$(mktemp -d)"
  build_schema_diff_files "$dev_schema_map" "$acc_schema_map" "$acc_schema_diff_dir"
  build_schema_diff_files "$dev_schema_map" "$prd_schema_map" "$prd_schema_diff_dir"
  acc_schema_mismatch_count=$(( $(wc -l < "${acc_schema_diff_dir}/missing_tables") + $(wc -l < "${acc_schema_diff_dir}/missing_columns") + $(wc -l < "${acc_schema_diff_dir}/missing_enums") + $(wc -l < "${acc_schema_diff_dir}/column_count_diffs") + $(wc -l < "${acc_schema_diff_dir}/extra_tables") + $(wc -l < "${acc_schema_diff_dir}/extra_columns") + $(wc -l < "${acc_schema_diff_dir}/extra_enums") ))
  prd_schema_mismatch_count=$(( $(wc -l < "${prd_schema_diff_dir}/missing_tables") + $(wc -l < "${prd_schema_diff_dir}/missing_columns") + $(wc -l < "${prd_schema_diff_dir}/missing_enums") + $(wc -l < "${prd_schema_diff_dir}/column_count_diffs") + $(wc -l < "${prd_schema_diff_dir}/extra_tables") + $(wc -l < "${prd_schema_diff_dir}/extra_columns") + $(wc -l < "${prd_schema_diff_dir}/extra_enums") ))

  if [ "$acc_schema_mismatch_count" -eq 0 ] && [ "${dev_tables:-}" = "${acc_tables:-}" ] && [ "${dev_columns:-}" = "${acc_columns:-}" ] && [ "${dev_enums:-}" = "${acc_enums:-}" ]; then
    acc_schema_ok=true
  else
    acc_schema_ok=false
  fi
  if [ "$prd_schema_mismatch_count" -eq 0 ] && [ "${dev_tables:-}" = "${prd_tables:-}" ] && [ "${dev_columns:-}" = "${prd_columns:-}" ] && [ "${dev_enums:-}" = "${prd_enums:-}" ]; then
    prd_schema_ok=true
  else
    prd_schema_ok=false
  fi

  printf "\n"
  bold "Database Schema Parity DEV vs ACC vs PRD (DEV baseline)"
  printf "%-14s | %-12s | %-12s | %-12s | %-10s\n" "METRIC" "DEV" "ACC" "PRD" "STATUS"
  printf "%-14s-+-%-12s-+-%-12s-+-%-12s-+-%-10s\n" "--------------" "------------" "------------" "------------" "----------"
  if [ "${dev_tables:-unknown}" = "${acc_tables:-unknown}" ] && [ "${dev_tables:-unknown}" = "${prd_tables:-unknown}" ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-12s | %-19b\n" "tables" "${dev_tables:-unknown}" "${acc_tables:-unknown}" "${prd_tables:-unknown}" "$status"
  if [ "${dev_columns:-unknown}" = "${acc_columns:-unknown}" ] && [ "${dev_columns:-unknown}" = "${prd_columns:-unknown}" ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-12s | %-19b\n" "columns" "${dev_columns:-unknown}" "${acc_columns:-unknown}" "${prd_columns:-unknown}" "$status"
  if [ "${dev_enums:-unknown}" = "${acc_enums:-unknown}" ] && [ "${dev_enums:-unknown}" = "${prd_enums:-unknown}" ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-12s | %-19b\n" "enums" "${dev_enums:-unknown}" "${acc_enums:-unknown}" "${prd_enums:-unknown}" "$status"
  if [ "$acc_schema_ok" = true ] && [ "$prd_schema_ok" = true ]; then
    status="${green}OK${nc}"
  else
    status="${red}MISMATCH${nc}"
  fi
  printf "%-14s | %-12s | %-12s | %-12s | %-19b\n" "schema diff" "-" "${acc_schema_mismatch_count} item(s)" "${prd_schema_mismatch_count} item(s)" "$status"

  echo
  if [ "$acc_schema_ok" = true ] && [ "$prd_schema_ok" = true ]; then
    printf "${green}OK${nc}: database schema matches DEV baseline across ACC and PRD.\n"
  else
    printf "${red}MISMATCH${nc}: database schema differs from DEV baseline.\n"
    if [ "$acc_schema_ok" != true ]; then
      echo "ACC differences:"
      print_schema_mismatch_details "$acc_schema_diff_dir" "ACC"
      echo
    fi
    if [ "$prd_schema_ok" != true ]; then
      echo "PRD differences:"
      print_schema_mismatch_details "$prd_schema_diff_dir" "PRD"
    fi
  fi

  rm -rf "$acc_schema_diff_dir" "$prd_schema_diff_dir"
}

update_dev_scope() {
  local scope="${1:-cloud}"
  shift || true
  local script="/antigravity/update-dev.sh"
  local arg cmd skip_next=0
  if is_wsl_dev_workspace; then
    bold "Running WSL DEV source update ($(scope_label "$scope"))..."
    cmd="cd '$WORKSPACE_ROOT' && bash scripts/dev-workspace/wsl-devadmin.sh update-dev '$scope'"
    for arg in "$@"; do
      if [ "$skip_next" -eq 1 ]; then
        skip_next=0
        continue
      fi
      case "$arg" in
        --skip-build) ;;
        --pkg-dir|--package|--component) skip_next=1 ;;
        *)
          cmd+=" $(printf '%q' "$arg")"
          ;;
      esac
    done
    run_as_workspace_user "$cmd"
    return $?
  fi
  if [ ! -x "$script" ]; then
    err "DEV updater script not found or not executable: $script"
    return 1
  fi
  bold "Running DEV update pipeline ($(scope_label "$scope"))..."
  cmd="bash '$script' --scope '$scope'"
  for arg in "$@"; do
    cmd+=" $(printf '%q' "$arg")"
  done
  run_as_workspace_user "$cmd"
}

update_dev() {
  local scope="${1:-cloud}"
  shift || true
  update_dev_scope "$scope" "$@"
}

update_dev_fast() {
  legacy_parallel_path_blocked "update-dev-fast"
}

update_dev_lppadmin() {
  legacy_parallel_path_blocked "update-dev-lppadmin"
}

update_dev_all_common() {
  local -a extra_args=("$@")
  local scope result_cloud result_onprem failures
  failures=0
  result_cloud="NOT-RUN"
  result_onprem="NOT-RUN"

  for scope in cloud onprem; do
    if update_dev_scope "$scope" "${extra_args[@]}"; then
      if [ "$scope" = "cloud" ]; then
        result_cloud="OK"
      else
        result_onprem="OK"
      fi
    else
      if [ "$scope" = "cloud" ]; then
        result_cloud="FAILED"
      else
        result_onprem="FAILED"
      fi
      failures=$((failures + 1))
      err "DEV update failed for $(scope_label "$scope"). Continuing to collect full status."
    fi
  done

  echo
  bold "DEV all-runtimes update summary"
  printf "%-10s | %-8s\n" "SCOPE" "RESULT"
  printf "%-10s-+-%-8s\n" "----------" "--------"
  printf "%-10s | %-8s\n" "Cloud" "$result_cloud"
  printf "%-10s | %-8s\n" "OnPrem" "$result_onprem"

  if [ "$failures" -gt 0 ]; then
    err "One or more runtime updates failed."
    return 1
  fi
}

update_dev_all() {
  update_dev_all_common "$@"
}

update_dev_all_fast() {
  legacy_parallel_path_blocked "update-dev-all-fast"
}

update_acc_scope() {
  local scope="${1:-cloud}"
  local host="${2:-$(default_acc_host_for_scope "$scope")}"
  local user="${3:-$(default_acc_user_for_scope "$scope")}"
  shift 3 || true
  local script="/antigravity/update-acc.sh"
  local arg cmd password
  ensure_target_is_configured "$scope" "acc" "$host" "$user" || return 1
  if [ ! -x "$script" ]; then
    err "ACC updater script not found or not executable: $script"
    return 1
  fi
  bold "Running ACC update pipeline ($(scope_label "$scope"))..."
  cmd="bash '$script' --scope '$scope' --host '$host' --user '$user'"
  for arg in "$@"; do
    cmd+=" $(printf '%q' "$arg")"
  done
  password="$(get_environment_password "$scope" "acc")"
  if [ -n "$password" ] && command -v sshpass >/dev/null 2>&1; then
    cmd="ACC_PASSWORD=$(printf '%q' "$password") $cmd"
  fi
  run_as_workspace_user "$cmd"
}

update_acc() {
  local scope="${1:-cloud}"
  local host=""
  local user=""
  shift || true
  if [ "$#" -ge 2 ] && [[ "${1:-}" != -* ]] && [[ "${2:-}" != -* ]]; then
    host="$1"
    user="$2"
    shift 2 || true
  else
    host="$(default_acc_host_for_scope "$scope")"
    user="$(default_acc_user_for_scope "$scope")"
  fi
  update_acc_scope "$scope" "$host" "$user" "$@"
}

update_acc_fast() {
  legacy_parallel_path_blocked "update-acc-fast"
}

update_acc_lppadmin() {
  legacy_parallel_path_blocked "update-acc-lppadmin"
}

update_prd_scope() {
  local scope="${1:-cloud}"
  local host="${2:-$(default_prd_host_for_scope "$scope")}"
  local user="${3:-$(default_prd_user_for_scope "$scope")}"
  shift 3 || true
  local script="/antigravity/update-prd.sh"
  local arg cmd password
  ensure_target_is_configured "$scope" "prd" "$host" "$user" || return 1
  if [ ! -x "$script" ]; then
    err "PRD updater script not found or not executable: $script"
    return 1
  fi
  bold "Running PRD update pipeline ($(scope_label "$scope"))..."
  cmd="bash '$script' --scope '$scope' --host '$host' --user '$user'"
  for arg in "$@"; do
    cmd+=" $(printf '%q' "$arg")"
  done
  password="$(get_environment_password "$scope" "prd")"
  if [ -n "$password" ] && command -v sshpass >/dev/null 2>&1; then
    cmd="PRD_PASSWORD=$(printf '%q' "$password") $cmd"
  fi
  run_as_workspace_user "$cmd"
}

update_prd() {
  local scope="${1:-cloud}"
  local host=""
  local user=""
  shift || true
  if [ "$#" -ge 2 ] && [[ "${1:-}" != -* ]] && [[ "${2:-}" != -* ]]; then
    host="$1"
    user="$2"
    shift 2 || true
  else
    host="$(default_prd_host_for_scope "$scope")"
    user="$(default_prd_user_for_scope "$scope")"
  fi
  update_prd_scope "$scope" "$host" "$user" "$@"
}

update_prd_fast() {
  legacy_parallel_path_blocked "update-prd-fast"
}

update_prd_lppadmin() {
  legacy_parallel_path_blocked "update-prd-lppadmin"
}

deploy_all_scope() {
  local scope="${1:-cloud}"
  local acc_host="${2:-$(default_acc_host_for_scope "$scope")}"
  local acc_user="${3:-$(default_acc_user_for_scope "$scope")}"
  local prd_host="${4:-$(default_prd_host_for_scope "$scope")}"
  local prd_user="${5:-$(default_prd_user_for_scope "$scope")}"
  local pkg=""

  ensure_target_is_configured "$scope" "acc" "$acc_host" "$acc_user" || return 1
  ensure_target_is_configured "$scope" "prd" "$prd_host" "$prd_user" || return 1

  printf "\n"
  bold "One-Click Deploy ($(scope_label "$scope"))"
  echo "Flow: DEV (build+update) -> ACC (no build) -> PRD (no build)"
  echo "ACC target: ${acc_user}@${acc_host}"
  echo "PRD target: ${prd_user}@${prd_host}"

  echo
  echo "[1/3] Building package and updating WSL DEV ($(scope_label "$scope"))..."
  if is_wsl_dev_workspace; then
    case "$scope" in
      cloud) build_cloud ;;
      onprem) build_onprem ;;
      *) err "Invalid scope: $scope"; return 1 ;;
    esac
  fi
  if ! update_dev_scope "$scope"; then
    err "DEV update failed for $(scope_label "$scope"). Aborting rollout before ACC/PRD."
    return 1
  fi

  pkg="$(latest_package_basename_for_scope "$scope")"
  if [ -z "$pkg" ]; then
    err "Could not resolve latest package for ${scope} after DEV update."
    return 1
  fi
  set_tested_package_for_scope "$scope" "$pkg" || true
  save_environment_targets
  ok "Using package for all stages: ${pkg}"

  echo
  echo "[2/3] Updating ACC ($(scope_label "$scope")) with package ${pkg} (no build)..."
  echo "      Running migration promotion gate (DEV -> ACC)..."
  if ! run_promotion_migration_gate "$scope" "dev" "acc" "$acc_host" "$acc_user"; then
    err "ACC promotion gate failed for $(scope_label "$scope"). Aborting rollout before ACC/PRD."
    return 1
  fi
  if ! update_acc_scope "$scope" "$acc_host" "$acc_user" --skip-build --package "$pkg"; then
    err "ACC update failed for $(scope_label "$scope"). Aborting rollout before PRD."
    return 1
  fi

  echo
  echo "[3/3] Updating PRD ($(scope_label "$scope")) with package ${pkg} (no build)..."
  echo "      Running migration promotion gate (ACC -> PRD)..."
  if ! run_promotion_migration_gate "$scope" "acc" "prd" "$prd_host" "$prd_user" "$acc_host" "$acc_user"; then
    err "PRD promotion gate failed for $(scope_label "$scope")."
    return 1
  fi
  if ! update_prd_scope "$scope" "$prd_host" "$prd_user" --skip-build --package "$pkg"; then
    err "PRD update failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "One-click rollout completed for $(scope_label "$scope")."
  echo "Package deployed: ${pkg}"
}

deploy_all_scopes() {
  local failures=0
  local scope
  for scope in cloud onprem; do
    if ! deploy_all_scope "$scope"; then
      failures=$((failures + 1))
      err "Scoped full rollout failed for $(scope_label "$scope"). Continuing to collect full status."
    fi
  done

  if [ "$failures" -gt 0 ]; then
    err "One or more scoped rollouts failed."
    return 1
  fi
  ok "One-click rollout completed for Cloud + OnPrem."
}

deploy_dev_acc_scope() {
  local scope="${1:-cloud}"
  local acc_host="${2:-$(default_acc_host_for_scope "$scope")}"
  local acc_user="${3:-$(default_acc_user_for_scope "$scope")}"
  local pkg=""

  ensure_target_is_configured "$scope" "acc" "$acc_host" "$acc_user" || return 1

  printf "\n"
  bold "One-Click Deploy DEV->ACC ($(scope_label "$scope"))"
  echo "Flow: DEV (build+update) -> ACC (no build)"
  echo "ACC target: ${acc_user}@${acc_host}"

  echo
  echo "[1/2] Building package and updating WSL DEV ($(scope_label "$scope"))..."
  if is_wsl_dev_workspace; then
    case "$scope" in
      cloud) build_cloud ;;
      onprem) build_onprem ;;
      *) err "Invalid scope: $scope"; return 1 ;;
    esac
  fi
  if ! update_dev_scope "$scope"; then
    err "DEV update failed for $(scope_label "$scope"). Aborting rollout before ACC."
    return 1
  fi

  pkg="$(latest_package_basename_for_scope "$scope")"
  if [ -z "$pkg" ]; then
    err "Could not resolve latest package for ${scope} after DEV update."
    return 1
  fi
  set_tested_package_for_scope "$scope" "$pkg" || true
  save_environment_targets
  ok "Using package for DEV->ACC stages: ${pkg}"

  echo
  echo "[2/2] Updating ACC ($(scope_label "$scope")) with package ${pkg} (no build)..."
  echo "      Running migration promotion gate (DEV -> ACC)..."
  if ! run_promotion_migration_gate "$scope" "dev" "acc" "$acc_host" "$acc_user"; then
    err "ACC promotion gate failed for $(scope_label "$scope")."
    return 1
  fi
  if ! update_acc_scope "$scope" "$acc_host" "$acc_user" --skip-build --package "$pkg"; then
    err "ACC update failed for $(scope_label "$scope")."
    return 1
  fi

  printf "\n"
  ok "One-click DEV->ACC rollout completed for $(scope_label "$scope")."
  echo "Package deployed: ${pkg}"
}

approve_internal_stage() {
  local scope="$1"
  local stage="$2"   # acc|dev
  local pkg sha
  pkg="$(get_tested_package_for_scope "$scope")"
  if [ -z "$pkg" ]; then
    err "No tested package recorded for ${scope}. Run update + post-check first."
    return 1
  fi
  sha="$(package_checksum_for_scope "$scope" "$pkg")"
  if [ -z "$sha" ]; then
    err "Could not resolve checksum for package '${pkg}' in $(package_dir_for_scope "$scope")."
    return 1
  fi
  promotion_set_stage_approval "$scope" "$stage" "$pkg" "$sha"
  ok "Approved ${scope} ${stage^^} stage package: ${pkg}"
  ok "Checksum: ${sha}"
}

promote_dev_internal() {
  local scope="${1:-cloud}"
  local approved_pkg approved_sha current_sha
  approved_pkg="$(promotion_get_stage_pkg "$scope" acc)"
  approved_sha="$(promotion_get_stage_sha "$scope" acc)"
  if [ -z "$approved_pkg" ] || [ -z "$approved_sha" ]; then
    err "ACC stage is not approved for ${scope}. Approve ACC first."
    return 1
  fi
  current_sha="$(package_checksum_for_scope "$scope" "$approved_pkg")"
  if [ -z "$current_sha" ] || [ "$current_sha" != "$approved_sha" ]; then
    err "Approved ACC package checksum mismatch or missing."
    err "Expected: ${approved_sha}"
    err "Actual:   ${current_sha:-<missing>}"
    return 1
  fi
  local acc_host acc_user
  acc_host="$(default_acc_host_for_scope "$scope")"
  acc_user="$(default_acc_user_for_scope "$scope")"
  if ! run_promotion_migration_gate "$scope" "acc" "dev" "" "" "$acc_host" "$acc_user"; then
    err "DEV promotion gate failed for ${scope}."
    return 1
  fi
  update_dev_scope "$scope" --skip-build --package "$approved_pkg"
}

promote_prd_internal() {
  local scope="${1:-cloud}"
  local host="${2:-$(default_prd_host_for_scope "$scope")}"
  local user="${3:-$(default_prd_user_for_scope "$scope")}"
  local approved_pkg approved_sha current_sha
  approved_pkg="$(promotion_get_stage_pkg "$scope" dev)"
  approved_sha="$(promotion_get_stage_sha "$scope" dev)"
  if [ -z "$approved_pkg" ] || [ -z "$approved_sha" ]; then
    err "DEV stage is not approved for ${scope}. Approve DEV first."
    return 1
  fi
  current_sha="$(package_checksum_for_scope "$scope" "$approved_pkg")"
  if [ -z "$current_sha" ] || [ "$current_sha" != "$approved_sha" ]; then
    err "Approved DEV package checksum mismatch or missing."
    err "Expected: ${approved_sha}"
    err "Actual:   ${current_sha:-<missing>}"
    return 1
  fi
  if ! run_promotion_migration_gate "$scope" "dev" "prd" "$host" "$user"; then
    err "PRD promotion gate failed for ${scope}."
    return 1
  fi
  update_prd_scope "$scope" "$host" "$user" --skip-build --package "$approved_pkg"
}

internal_promotion_menu() {
  local scope="$1"
  local host user prd_host prd_user label
  label="$(scope_label "$scope")"
  while true; do
    host="$(default_acc_host_for_scope "$scope")"
    user="$(default_acc_user_for_scope "$scope")"
    prd_host="$(default_prd_host_for_scope "$scope")"
    prd_user="$(default_prd_user_for_scope "$scope")"
    printf "\n"
    bold "${label} Internal Promotion Pipeline"
    echo "  Policy: ACC -> DEV -> PRD"
    echo "  ACC target: ${user}@${host}"
    echo "  PRD target: ${prd_user}@${prd_host}"
    echo "  1) Promote ACC ${scope} (build + transfer + update)"
    echo "  2) Run ACC ${scope} post-checks"
    echo "  3) Approve ACC ${scope} stage"
    echo "  4) Promote DEV ${scope} from approved ACC package"
    echo "  5) Run DEV ${scope} post-checks"
    echo "  6) Approve DEV ${scope} stage"
    echo "  7) Promote PRD ${scope} from approved DEV package"
    echo "  8) Run PRD ${scope} post-checks"
    echo "  9) Show promotion status"
    echo "  10) Reset promotion approvals for ${scope}"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-10, b, x]: " opt || exit 0
    case "${opt,,}" in
      1)
        run_action "Promote ACC ${scope}" update_acc "$scope" "$host" "$user"
        if [ "$LAST_ACTION_STATUS" -eq 0 ]; then
          local used_pkg
          used_pkg="$(latest_package_basename_for_scope "$scope")"
          if [ -n "$used_pkg" ]; then
            set_tested_package_for_scope "$scope" "$used_pkg" || true
            save_environment_targets
            ok "Recorded tested package for ${scope}: ${used_pkg}"
          fi
        fi
        ;;
      2)
        run_action "ACC ${scope} post-checks" run_remote_scope_postcheck "$scope" "$host" "$user" "acc"
        ;;
      3)
        run_action "Approve ACC ${scope}" approve_internal_stage "$scope" "acc"
        ;;
      4)
        run_action "Promote DEV ${scope}" promote_dev_internal "$scope"
        ;;
      5)
        run_action "DEV ${scope} post-checks" run_local_scope_postcheck "$scope"
        ;;
      6)
        run_action "Approve DEV ${scope}" approve_internal_stage "$scope" "dev"
        ;;
      7)
        run_action "Promote PRD ${scope}" promote_prd_internal "$scope" "$prd_host" "$prd_user"
        ;;
      8)
        run_action "PRD ${scope} post-checks" run_remote_scope_postcheck "$scope" "$prd_host" "$prd_user" "prd"
        ;;
      9)
        show_promotion_status "$scope"
        ;;
      10)
        read -rp "Reset all promotion approvals for ${scope}? [y/N]: " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
          promotion_clear_scope "$scope"
          ok "Promotion approvals reset for ${scope}."
        else
          warn "Reset cancelled."
        fi
        ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

dr_create_bundle() {
  local script="${DR_SCRIPTS_DIR}/create-dev-bundle.sh"
  ensure_dr_scripts || return 1
  bold "Creating DEV disaster recovery bundle..."
  "$script" "$@"
  # Root-run devadmin must not leave bundles unreadable/unmovable for workspace user.
  local latest_payload latest_scripts
  latest_payload="$(latest_dr_bundle)"
  latest_scripts="$(ls -1t /antigravity/archives/learnplay-dev-dr-scripts-*.tar.gz 2>/dev/null | head -1 || true)"
  if [ -n "$latest_payload" ]; then
    ensure_workspace_user_owns "$latest_payload"
    ensure_workspace_user_owns "${latest_payload}.sha256"
  fi
  if [ -n "$latest_scripts" ]; then
    ensure_workspace_user_owns "$latest_scripts"
    ensure_workspace_user_owns "${latest_scripts}.sha256"
  fi
}

dr_verify_bundle() {
  local bundle="${1:-}"
  if [ -z "$bundle" ]; then
    bundle="$(latest_dr_bundle)"
  fi
  if [ -z "$bundle" ] || [ ! -f "$bundle" ]; then
    err "DR bundle not found. Provide path or create one first."
    return 1
  fi
  if [ ! -f "${bundle}.sha256" ]; then
    err "Checksum file missing: ${bundle}.sha256"
    return 1
  fi
  (cd "$(dirname "$bundle")" && sha256sum -c "$(basename "${bundle}.sha256")")
  local tmp
  tmp="$(mktemp -d /tmp/devadmin-dr-verify.XXXXXX)"
  tar xzf "$bundle" -C "$tmp"
  if [ ! -f "$tmp/manifest.json" ] || [ ! -f "$tmp/checksums.sha256" ]; then
    rm -rf "$tmp"
    err "Invalid DR bundle structure (manifest/checksums missing)."
    return 1
  fi
  (cd "$tmp" && sha256sum -c checksums.sha256)
  rm -rf "$tmp"
  ok "DR bundle verified: $bundle"
}

collect_dr_inputs() {
  local host_hint="${1:-}"
  local local_ip
  local_ip="$(ip -4 -o addr show dev eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || true)"
  if [ -z "$local_ip" ]; then
    local_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1;i<=NF;i++) if ($i==\"src\") {print $(i+1); exit}}' || true)"
  fi
  read -rp "Cloud FQDN (BASE_URL host) [cloud.learnplay.co.za]: " DR_CLOUD_FQDN
  DR_CLOUD_FQDN="${DR_CLOUD_FQDN:-cloud.learnplay.co.za}"
  read -rp "OnPrem FQDN (BASE_URL host) [onprem.learnplay.co.za]: " DR_ONPREM_FQDN
  DR_ONPREM_FQDN="${DR_ONPREM_FQDN:-onprem.learnplay.co.za}"
  read -rp "Cloud IP for /etc/hosts mapping [${local_ip:-192.168.89.50}]: " DR_CLOUD_IP
  DR_CLOUD_IP="${DR_CLOUD_IP:-${local_ip:-192.168.89.50}}"
  read -rp "OnPrem IP for /etc/hosts mapping [${local_ip:-192.168.89.51}]: " DR_ONPREM_IP
  DR_ONPREM_IP="${DR_ONPREM_IP:-${local_ip:-192.168.89.51}}"
  if [ -n "$host_hint" ]; then
    echo "Target host: $host_hint"
  fi
  echo "Input summary:"
  echo "  cloud_fqdn=${DR_CLOUD_FQDN}"
  echo "  onprem_fqdn=${DR_ONPREM_FQDN}"
  echo "  cloud_ip=${DR_CLOUD_IP}"
  echo "  onprem_ip=${DR_ONPREM_IP}"
}

dr_restore_local() {
  local bundle="${1:-}"
  local script="${DR_SCRIPTS_DIR}/restore-dev-bundle.sh"
  ensure_dr_scripts || return 1
  if [ -z "$bundle" ]; then
    bundle="$(latest_dr_bundle)"
  fi
  if [ -z "$bundle" ] || [ ! -f "$bundle" ]; then
    err "DR bundle not found."
    return 1
  fi
  dr_verify_bundle "$bundle" || return 1
  collect_dr_inputs "local"
  bold "Running local DR restore..."
  "$script" \
    --bundle "$bundle" \
    --cloud-fqdn "$DR_CLOUD_FQDN" \
    --onprem-fqdn "$DR_ONPREM_FQDN" \
    --cloud-ip "$DR_CLOUD_IP" \
    --onprem-ip "$DR_ONPREM_IP" \
    --non-interactive
}

dr_restore_remote() {
  local host="${1:-$DEFAULT_ACC_HOST}"
  local user="${2:-$DEFAULT_ACC_USER}"
  local bundle="${3:-}"
  local scope="${4:-cloud}"
  local env_name="${5:-acc}"
  if [ -z "$bundle" ]; then
    bundle="$(latest_dr_bundle)"
  fi
  if [ -z "$bundle" ] || [ ! -f "$bundle" ]; then
    err "DR bundle not found."
    return 1
  fi
  dr_verify_bundle "$bundle" || return 1
  collect_dr_inputs "${user}@${host}"

  local base
  base="$(basename "$bundle")"
  bold "Copying DR bundle to remote host..."
  remote_copy_to_tmp "$scope" "$env_name" "$host" "$user" "$bundle" "${bundle}.sha256"

  bold "Running DR restore on remote host..."
  remote_exec_bash "$scope" "$env_name" "$host" "$user" "$(cat <<REMOTE_EOF
set -euo pipefail
BUNDLE='/tmp/${base}'
if [ ! -f "\$BUNDLE" ]; then
  echo "Bundle not found on remote host: \$BUNDLE" >&2
  exit 1
fi
TMP='/tmp/learnplay-dr-remote'
rm -rf "\$TMP"
mkdir -p "\$TMP"
tar xzf "\$BUNDLE" -C "\$TMP"
chmod +x "\$TMP/restore-dev-bundle.sh" "\$TMP/postcheck-dev-restore.sh" || true
"\$TMP/restore-dev-bundle.sh" \\
  --bundle "\$BUNDLE" \\
  --cloud-fqdn '${DR_CLOUD_FQDN}' \\
  --onprem-fqdn '${DR_ONPREM_FQDN}' \\
  --cloud-ip '${DR_CLOUD_IP}' \\
  --onprem-ip '${DR_ONPREM_IP}' \\
  --non-interactive
REMOTE_EOF
)"
  ok "Remote DR restore completed on ${user}@${host}"
}

dr_postcheck_local() {
  local script="${DR_SCRIPTS_DIR}/postcheck-dev-restore.sh"
  ensure_dr_scripts || return 1
  "$script"
}

dr_postcheck_remote() {
  local host="${1:-$DEFAULT_ACC_HOST}"
  local user="${2:-$DEFAULT_ACC_USER}"
  local scope="${3:-cloud}"
  local env_name="${4:-acc}"
  remote_exec_bash "$scope" "$env_name" "$host" "$user" "set -euo pipefail; /antigravity/scripts/dr/postcheck-dev-restore.sh"
}

run_action() {
  local desc="$1"
  shift
  if "$@"; then
    LAST_ACTION_STATUS=0
    return 0
  fi
  LAST_ACTION_STATUS=$?
  err "${desc} failed."
  return "$LAST_ACTION_STATUS"
}

bootstrap_scope_ssh_sudo() {
  local scope="$1"
  local acc_host acc_user acc_pass prd_host prd_user prd_pass
  local acc_alias prd_alias

  acc_host="$(default_acc_host_for_scope "$scope")"
  acc_user="$(default_acc_user_for_scope "$scope")"
  prd_host="$(default_prd_host_for_scope "$scope")"
  prd_user="$(default_prd_user_for_scope "$scope")"

  ensure_target_is_configured "$scope" "acc" "$acc_host" "$acc_user" || return 1
  ensure_target_is_configured "$scope" "prd" "$prd_host" "$prd_user" || return 1

  acc_pass="$(get_environment_password "$scope" "acc")"
  prd_pass="$(get_environment_password "$scope" "prd")"

  if [ -z "$acc_pass" ]; then
    read -r -s -p "ACC password for ${acc_user}@${acc_host}: " acc_pass
    echo ""
    set_environment_password "$scope" "acc" "$acc_pass" || true
  fi
  if [ -z "$prd_pass" ]; then
    read -r -s -p "PRD password for ${prd_user}@${prd_host}: " prd_pass
    echo ""
    set_environment_password "$scope" "prd" "$prd_pass" || true
  fi
  save_environment_targets

  if [ -z "$acc_pass" ] || [ -z "$prd_pass" ]; then
    err "Both ACC and PRD passwords are required for SSH bootstrap."
    return 1
  fi

  acc_alias="acc-${scope}-devadmin"
  prd_alias="prd-${scope}-devadmin"

  ssh_bootstrap \
    --scope "$scope" \
    --acc-host "$acc_host" \
    --acc-user "$acc_user" \
    --acc-password "$acc_pass" \
    --prd-host "$prd_host" \
    --prd-user "$prd_user" \
    --prd-password "$prd_pass" \
    --acc-alias "$acc_alias" \
    --prd-alias "$prd_alias"
}

bootstrap_scope_target_ssh_sudo() {
  local scope="$1"
  local env_name="$2"
  local host user password alias

  case "$env_name" in
    acc)
      host="$(default_acc_host_for_scope "$scope")"
      user="$(default_acc_user_for_scope "$scope")"
      ensure_target_is_configured "$scope" "acc" "$host" "$user" || return 1
      password="$(get_environment_password "$scope" "acc")"
      if [ -z "$password" ]; then
        read -r -s -p "ACC password for ${user}@${host}: " password
        echo ""
        set_environment_password "$scope" "acc" "$password" || true
        save_environment_targets
      fi
      if [ -z "$password" ]; then
        err "ACC password is required for SSH bootstrap."
        return 1
      fi
      alias="acc-${scope}-devadmin"
      ssh_bootstrap \
        --scope "$scope" \
        --only acc \
        --acc-host "$host" \
        --acc-user "$user" \
        --acc-password "$password" \
        --acc-alias "$alias"
      ;;
    prd)
      host="$(default_prd_host_for_scope "$scope")"
      user="$(default_prd_user_for_scope "$scope")"
      ensure_target_is_configured "$scope" "prd" "$host" "$user" || return 1
      password="$(get_environment_password "$scope" "prd")"
      if [ -z "$password" ]; then
        read -r -s -p "PRD password for ${user}@${host}: " password
        echo ""
        set_environment_password "$scope" "prd" "$password" || true
        save_environment_targets
      fi
      if [ -z "$password" ]; then
        err "PRD password is required for SSH bootstrap."
        return 1
      fi
      alias="prd-${scope}-devadmin"
      ssh_bootstrap \
        --scope "$scope" \
        --only prd \
        --prd-host "$host" \
        --prd-user "$user" \
        --prd-password "$password" \
        --prd-alias "$alias"
      ;;
    *)
      err "Invalid bootstrap target: ${env_name}. Use acc|prd."
      return 1
      ;;
  esac
}

menu_build_artifacts() {
  local scope="$1"
  local label
  label="$(scope_label "$scope")"
  while true; do
    printf "\n"
    bold "${label} Build & Artifacts"
    echo "  1) Build ${scope} installer package"
    echo "  2) Build all installer packages"
    echo "  3) List ${scope} artifacts"
    echo "  4) Verify ${scope} artifact checksums"
    echo "  5) Scoped lppadmin sync (DEV/ACC/PRD, no full app deploy)"
    echo "  6) Scoped full update (sync GitHub + build/deploy DEV)"
    echo "  7) Scoped full update (deploy ACC from latest DEV build, no GitHub sync)"
    echo "  8) Scoped full update (sync GitHub + build/deploy DEV + deploy ACC, no PRD)"
    echo "  9) Scoped full update (deploy PRD from latest DEV build, no GitHub sync)"
    echo "  10) Scoped full update (sync GitHub + build once on DEV + deploy DEV->ACC->PRD)"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-10, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Build ${scope}" "build_${scope}" ;;
      2) run_action "Build all installers" build_cloud && run_action "Build all installers" build_onprem ;;
      3) run_action "List artifacts" list_artifacts "$scope" ;;
      4) run_action "Verify checksums" verify_artifacts "$scope" ;;
      5) run_action "Scoped lppadmin sync (${scope})" github_sync_lppadmin_scope "$scope" ;;
      6) run_action "Scoped full DEV update (${scope})" github_sync_full_update_dev_scope "$scope" ;;
      7) run_action "Scoped ACC deploy from latest DEV build (${scope})" github_deploy_acc_from_latest_scope "$scope" ;;
      8) run_action "Scoped full rollout DEV->ACC (${scope})" github_sync_full_update_dev_acc_scope "$scope" ;;
      9) run_action "Scoped PRD deploy from latest DEV build (${scope})" github_deploy_prd_from_latest_scope "$scope" ;;
      10) run_action "Scoped full update DEV->ACC->PRD (${scope})" github_sync_full_update_scope "$scope" ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_dev_updates() {
  local scope="$1"
  local label
  label="$(scope_label "$scope")"
  while true; do
    printf "\n"
    bold "${label} DEV (this host)"
    echo "  1) Build ${scope} installer package"
    echo "  2) Update DEV ${scope} (build + update)"
    echo "  3) Update DEV all runtimes (build + update)"
    echo "  4) Run ${scope} local post-checks"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-4, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Build ${scope}" "build_${scope}" ;;
      2) run_action "Update DEV ${scope}" update_dev "$scope" ;;
      3) run_action "Update DEV all runtimes" update_dev_all ;;
      4) run_action "${scope} post-checks" run_local_scope_postcheck "$scope" ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_environment_targets() {
  local scope="$1"
  local acc_host acc_user acc_pass prd_host prd_user prd_pass
  local opt _host _user _pass _acc_host _acc_user _acc_pass _prd_host _prd_user _prd_pass
  while true; do
    printf "\n"
    bold "$(scope_label "$scope") Environment Targets"
    echo "  1) Show current ACC/PRD targets"
    echo "  2) Set ACC target host/user/password"
    echo "  3) Set PRD target host/user/password"
    echo "  4) Set both ACC and PRD targets/passwords"
    echo "  5) Bootstrap passwordless SSH + sudo for ACC (${scope})"
    echo "  6) Bootstrap passwordless SSH + sudo for PRD (${scope})"
    echo "  7) Bootstrap passwordless SSH + sudo for ACC/PRD (${scope})"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-7, b, x]: " opt || exit 0
    case "${opt,,}" in
      1)
        run_action "Show environment targets" print_environment_targets "$scope"
        ;;
      2)
        acc_host="$(default_acc_host_for_scope "$scope")"
        acc_user="$(default_acc_user_for_scope "$scope")"
        acc_pass="$(get_environment_password "$scope" "acc")"
        read -rp "ACC host [${acc_host}]: " _host
        read -rp "ACC user [${acc_user}]: " _user
        read -r -s -p "ACC password [leave blank to keep existing]: " _pass
        echo ""
        acc_host="${_host:-$acc_host}"
        acc_user="${_user:-$acc_user}"
        if [ -n "${_pass:-}" ]; then
          acc_pass="$_pass"
        fi
        set_environment_target "$scope" "acc" "$acc_host" "$acc_user" && save_environment_targets
        set_environment_password "$scope" "acc" "$acc_pass" && save_environment_targets
        ok "Updated ACC target for ${scope}: ${acc_user}@${acc_host}"
        ;;
      3)
        prd_host="$(default_prd_host_for_scope "$scope")"
        prd_user="$(default_prd_user_for_scope "$scope")"
        prd_pass="$(get_environment_password "$scope" "prd")"
        read -rp "PRD host [${prd_host}]: " _host
        read -rp "PRD user [${prd_user}]: " _user
        read -r -s -p "PRD password [leave blank to keep existing]: " _pass
        echo ""
        prd_host="${_host:-$prd_host}"
        prd_user="${_user:-$prd_user}"
        if [ -n "${_pass:-}" ]; then
          prd_pass="$_pass"
        fi
        set_environment_target "$scope" "prd" "$prd_host" "$prd_user" && save_environment_targets
        set_environment_password "$scope" "prd" "$prd_pass" && save_environment_targets
        ok "Updated PRD target for ${scope}: ${prd_user}@${prd_host}"
        ;;
      4)
        acc_host="$(default_acc_host_for_scope "$scope")"
        acc_user="$(default_acc_user_for_scope "$scope")"
        prd_host="$(default_prd_host_for_scope "$scope")"
        prd_user="$(default_prd_user_for_scope "$scope")"
        acc_pass="$(get_environment_password "$scope" "acc")"
        prd_pass="$(get_environment_password "$scope" "prd")"
        read -rp "ACC host [${acc_host}]: " _acc_host
        read -rp "ACC user [${acc_user}]: " _acc_user
        read -r -s -p "ACC password [leave blank to keep existing]: " _acc_pass
        echo ""
        read -rp "PRD host [${prd_host}]: " _prd_host
        read -rp "PRD user [${prd_user}]: " _prd_user
        read -r -s -p "PRD password [leave blank to keep existing]: " _prd_pass
        echo ""
        acc_host="${_acc_host:-$acc_host}"
        acc_user="${_acc_user:-$acc_user}"
        prd_host="${_prd_host:-$prd_host}"
        prd_user="${_prd_user:-$prd_user}"
        if [ -n "${_acc_pass:-}" ]; then
          acc_pass="$_acc_pass"
        fi
        if [ -n "${_prd_pass:-}" ]; then
          prd_pass="$_prd_pass"
        fi
        set_environment_target "$scope" "acc" "$acc_host" "$acc_user" || true
        set_environment_target "$scope" "prd" "$prd_host" "$prd_user" || true
        set_environment_password "$scope" "acc" "$acc_pass" || true
        set_environment_password "$scope" "prd" "$prd_pass" || true
        save_environment_targets
        ok "Updated ACC/PRD targets for ${scope}"
        ;;
      5)
        run_action "Bootstrap ${scope} ACC passwordless SSH + sudo" bootstrap_scope_target_ssh_sudo "$scope" "acc"
        ;;
      6)
        run_action "Bootstrap ${scope} PRD passwordless SSH + sudo" bootstrap_scope_target_ssh_sudo "$scope" "prd"
        ;;
      7)
        run_action "Bootstrap ${scope} ACC/PRD passwordless SSH + sudo" bootstrap_scope_ssh_sudo "$scope"
        ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_acc_updates() {
  local scope="$1"
  local host user prd_host prd_user label selected_pkg tested_pkg used_pkg
  label="$(scope_label "$scope")"
  while true; do
    host="$(default_acc_host_for_scope "$scope")"
    user="$(default_acc_user_for_scope "$scope")"
    prd_host="$(default_prd_host_for_scope "$scope")"
    prd_user="$(default_prd_user_for_scope "$scope")"
    printf "\n"
    bold "${label} Remote Updates"
    echo "  ACC: ${user}@${host}"
    echo "  PRD: ${prd_user}@${prd_host}"
    echo "  1) Update ACC ${scope} (build + transfer + update)"
    echo "  2) Run ACC ${scope} post-checks"
    echo "  3) Update PRD ${scope} (build + transfer + update)"
    echo "  4) Run PRD ${scope} post-checks"
    echo "  5) Configure ACC/PRD target host/user/password"
    echo "  6) Bootstrap passwordless SSH + sudo for ACC (${scope})"
    echo "  7) Bootstrap passwordless SSH + sudo for PRD (${scope})"
    echo "  8) Bootstrap passwordless SSH + sudo for ACC/PRD (${scope})"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-8, b, x]: " opt || exit 0
    case "${opt,,}" in
      1)
        selected_pkg="$(prompt_update_package_for_scope "$scope")"
        if [ -n "$selected_pkg" ]; then
          run_action "Update ACC ${scope}" update_acc "$scope" "$host" "$user" --package "$selected_pkg"
        else
          run_action "Update ACC ${scope}" update_acc "$scope" "$host" "$user"
        fi
        if [ "$LAST_ACTION_STATUS" -eq 0 ]; then
          if [ -n "$selected_pkg" ]; then
            used_pkg="$selected_pkg"
          else
            used_pkg="$(latest_package_basename_for_scope "$scope")"
          fi
          if [ -n "$used_pkg" ]; then
            set_tested_package_for_scope "$scope" "$used_pkg" || true
            save_environment_targets
            ok "Default tested package for ${scope} set to: ${used_pkg}"
          fi
        fi
        ;;
      2) run_action "ACC post-checks" run_remote_scope_postcheck "$scope" "$host" "$user" "acc" ;;
      3)
        tested_pkg="$(get_tested_package_for_scope "$scope")"
        selected_pkg="$(prompt_update_package_for_scope "$scope" "$tested_pkg")"
        if [ -n "$selected_pkg" ]; then
          run_action "Update PRD ${scope}" update_prd "$scope" "$prd_host" "$prd_user" --package "$selected_pkg"
        else
          run_action "Update PRD ${scope}" update_prd "$scope" "$prd_host" "$prd_user"
        fi
        ;;
      4) run_action "PRD post-checks" run_remote_scope_postcheck "$scope" "$prd_host" "$prd_user" "prd" ;;
      5) menu_environment_targets "$scope" ;;
      6) run_action "Bootstrap ${scope} ACC passwordless SSH + sudo" bootstrap_scope_target_ssh_sudo "$scope" "acc" ;;
      7) run_action "Bootstrap ${scope} PRD passwordless SSH + sudo" bootstrap_scope_target_ssh_sudo "$scope" "prd" ;;
      8) run_action "Bootstrap ${scope} ACC/PRD passwordless SSH + sudo" bootstrap_scope_ssh_sudo "$scope" ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_patch_tuesday() {
  local scope="$1"
  local host user prd_host prd_user label
  label="$(scope_label "$scope")"
  while true; do
    host="$(default_acc_host_for_scope "$scope")"
    user="$(default_acc_user_for_scope "$scope")"
    prd_host="$(default_prd_host_for_scope "$scope")"
    prd_user="$(default_prd_user_for_scope "$scope")"
    printf "\n"
    bold "${label} LPPatch Tuesday Pipeline (LearnPlay internal order)"
    echo "  ACC: ${user}@${host}"
    echo "  PRD: ${prd_user}@${prd_host}"
    echo "  1) ACC patch check"
    echo "  2) ACC apply patches"
    echo "  3) ACC patch report"
    echo "  4) ACC post-check"
    echo "  5) DEV patch check"
    echo "  6) DEV apply patches"
    echo "  7) DEV patch report"
    echo "  8) DEV post-check"
    echo "  9) PRD patch check"
    echo "  10) PRD apply patches"
    echo "  11) PRD patch report"
    echo "  12) PRD post-check"
    echo "  13) Configure ACC/PRD target host/user/password"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-13, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "ACC ${scope} patch check" run_remote_scope_patch_subcommand "$scope" "acc" "$host" "$user" "patch-check" ;;
      2) run_action "ACC ${scope} patch apply" run_remote_scope_patch_subcommand "$scope" "acc" "$host" "$user" "patch-apply" ;;
      3) run_action "ACC ${scope} patch report" run_remote_scope_patch_subcommand "$scope" "acc" "$host" "$user" "patch-report" ;;
      4) run_action "ACC ${scope} post-checks" run_remote_scope_postcheck "$scope" "$host" "$user" "acc" ;;
      5) run_action "DEV ${scope} patch check" run_local_scope_patch_subcommand "$scope" "patch-check" ;;
      6) run_action "DEV ${scope} patch apply" run_local_scope_patch_subcommand "$scope" "patch-apply" ;;
      7) run_action "DEV ${scope} patch report" run_local_scope_patch_subcommand "$scope" "patch-report" ;;
      8) run_action "DEV ${scope} post-checks" run_local_scope_postcheck "$scope" ;;
      9) run_action "PRD ${scope} patch check" run_remote_scope_patch_subcommand "$scope" "prd" "$prd_host" "$prd_user" "patch-check" ;;
      10) run_action "PRD ${scope} patch apply" run_remote_scope_patch_subcommand "$scope" "prd" "$prd_host" "$prd_user" "patch-apply" ;;
      11) run_action "PRD ${scope} patch report" run_remote_scope_patch_subcommand "$scope" "prd" "$prd_host" "$prd_user" "patch-report" ;;
      12) run_action "PRD ${scope} post-checks" run_remote_scope_postcheck "$scope" "$prd_host" "$prd_user" "prd" ;;
      13) menu_environment_targets "$scope" ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_cross_env() {
  local scope="$1"
  local acc_host acc_user prd_host prd_user label
  label="$(scope_label "$scope")"
  while true; do
    acc_host="$(default_acc_host_for_scope "$scope")"
    acc_user="$(default_acc_user_for_scope "$scope")"
    prd_host="$(default_prd_host_for_scope "$scope")"
    prd_user="$(default_prd_user_for_scope "$scope")"
    printf "\n"
    bold "${label} Cross-Environment"
    echo "  1) Compare DEV vs ACC versions (${scope})"
    echo "  2) Compare DEV vs PRD versions (${scope})"
    echo "  3) Compare DEV vs ACC vs PRD versions (${scope})"
    echo "  4) Configure ACC/PRD target host/user/password"
    echo "  5) Compare DEV vs ACC versions (cloud + onprem)"
    echo "  6) One-click Deploy: DEV(build+update) -> ACC(no build) -> PRD(no build)"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-6, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Compare DEV vs ACC" compare_versions "$scope" "$acc_host" "$acc_user" "ACC" ;;
      2) run_action "Compare DEV vs PRD" compare_versions_prd "$scope" "$prd_host" "$prd_user" ;;
      3) run_action "Compare DEV vs ACC vs PRD" compare_versions_3way "$scope" "$acc_host" "$acc_user" "$prd_host" "$prd_user" ;;
      4) menu_environment_targets "$scope" ;;
      5) run_action "Compare DEV vs ACC (cloud + onprem)" compare_versions_all ;;
      6) run_action "One-click Deploy (${scope})" deploy_all_scope "$scope" "$acc_host" "$acc_user" "$prd_host" "$prd_user" ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_scope() {
  local scope="$1"
  local label
  label="$(scope_label "$scope")"
  while true; do
    printf "\n"
    bold "LearnPlay devadmin ${DEVADMIN_VERSION}"
    echo "${label} tooling"
    echo "  1) DEV (this host)"
    echo "  2) ACC PRD"
    echo "  3) Cross-Environment"
    echo "  4) Build & Artifacts"
    echo "  5) Environment Targets"
    echo "  6) Internal Promotion Pipeline (ACC -> DEV -> PRD)"
    echo "  7) LPPatch Tuesday Pipeline (ACC -> DEV -> PRD)"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-7, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) menu_dev_updates "$scope" ;;
      2) menu_acc_updates "$scope" ;;
      3) menu_cross_env "$scope" ;;
      4) menu_build_artifacts "$scope" ;;
      5) menu_environment_targets "$scope" ;;
      6) internal_promotion_menu "$scope" ;;
      7) menu_patch_tuesday "$scope" ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_dr_tools() {
  while true; do
    printf "\n"
    bold "DR Tools"
    echo "  1) Create DR bundle (this host)"
    echo "  2) Verify latest DR bundle"
    echo "  3) Restore DR bundle on local host"
    echo "  4) Restore DR bundle on remote host"
    echo "  5) Run DR post-check (local)"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-5, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "Create DR bundle" dr_create_bundle ;;
      2) run_action "Verify DR bundle" dr_verify_bundle ;;
      3) run_action "Restore DR bundle (local)" dr_restore_local ;;
      4) run_action "Restore DR bundle (remote)" dr_restore_remote ;;
      5) run_action "Run DR post-check" dr_postcheck_local ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu_system_management() {
  local scope mode
  while true; do
    printf "\n"
    bold "System Management (DEV host)"
    echo "  1) System status [show service and port status summary]"
    echo "  2) Start full stack [start app and dependent services]"
    echo "  3) Stop full stack [stop app and dependent services]"
    echo "  4) Restart full stack [restart app and dependent services]"
    echo "  5) Start app service [start app service only]"
    echo "  6) Stop app service [stop app service only]"
    echo "  7) Restart app service [restart app service only]"
    echo "  8) Service logs [show and follow service logs]"
    echo "  b) Back"
    echo "  x) Exit"
    read -rp "Select action [1-8, b, x]: " opt || exit 0
    case "${opt,,}" in
      1) run_action "System status summary" system_status_summary ;;
      2)
        read -rp "Scope [both/cloud/onprem] [both]: " scope
        scope="${scope:-both}"
        run_action "Start full stack (${scope})" run_system_stack_action start "$scope"
        ;;
      3)
        read -rp "Scope [both/cloud/onprem] [both]: " scope
        scope="${scope:-both}"
        run_action "Stop full stack (${scope})" run_system_stack_action stop "$scope"
        ;;
      4)
        read -rp "Scope [both/cloud/onprem] [both]: " scope
        scope="${scope:-both}"
        run_action "Restart full stack (${scope})" run_system_stack_action restart "$scope"
        ;;
      5)
        read -rp "Scope [both/cloud/onprem] [both]: " scope
        scope="${scope:-both}"
        run_action "Start app service (${scope})" run_system_service_action start "$scope"
        ;;
      6)
        read -rp "Scope [both/cloud/onprem] [both]: " scope
        scope="${scope:-both}"
        run_action "Stop app service (${scope})" run_system_service_action stop "$scope"
        ;;
      7)
        read -rp "Scope [both/cloud/onprem] [both]: " scope
        scope="${scope:-both}"
        run_action "Restart app service (${scope})" run_system_service_action restart "$scope"
        ;;
      8)
        read -rp "Scope [cloud/onprem] [cloud]: " scope
        scope="${scope:-cloud}"
        read -rp "Log mode [recent/follow] [recent]: " mode
        mode="${mode:-recent}"
        run_action "Service logs (${scope}, ${mode})" system_logs "$scope" "$mode"
        ;;
      b) return 0 ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

menu() {
  while true; do
    printf "\n"
    bold "LearnPlay devadmin ${DEVADMIN_VERSION}"
    echo "Select system variant"
    echo "  1) Cloud"
    echo "  2) OnPrem"
    echo "  3) System Management"
    echo "  4) DR Tools"
    echo "  5) GitHub Management"
    echo "  h) Help"
    echo "  x) Exit"
    read -rp "Select action [1-5, h, x]: " opt || exit 0
    case "${opt,,}" in
      1) menu_scope cloud ;;
      2) menu_scope onprem ;;
      3) menu_system_management ;;
      4) menu_dr_tools ;;
      5) menu_github_management ;;
      h) show_help ;;
      x) exit 0 ;;
      *) warn "Invalid option: $opt" ;;
    esac
  done
}

main() {
  if [ "$(id -u)" -ne 0 ]; then
    exec sudo "$0" "$@"
  fi

  cleanup_tmp_artifacts
  ensure_devadmin_command_symlink
  load_environment_targets
  load_github_state

  local cmd="${1:-menu}"
  local scope host user env_name password
  if [ "$#" -gt 0 ]; then
    shift
  fi
  case "$cmd" in
    env-show)
      print_environment_targets "${1:-all}"
      ;;
    env-set)
      scope="${1:-}"
      env_name="${2:-}"
      host="${3:-}"
      user="${4:-}"
      password="${5:-}"
      if { [ "$scope" != "cloud" ] && [ "$scope" != "onprem" ]; } || { [ "$env_name" != "acc" ] && [ "$env_name" != "prd" ]; } || [ -z "$host" ] || [ -z "$user" ]; then
        err "Usage: sudo devadmin env-set [cloud|onprem] [acc|prd] [host] [user] [password]"
        exit 1
      fi
      set_environment_target "$scope" "$env_name" "$host" "$user"
      if [ -n "$password" ]; then
        set_environment_password "$scope" "$env_name" "$password"
      fi
      save_environment_targets
      ok "Saved ${env_name^^} target for ${scope}: ${user}@${host}"
      ;;
    ssh-bootstrap)
      ssh_bootstrap "$@"
      ;;
    compare-versions)
      scope="cloud"
      if [ "${1:-}" = "cloud" ] || [ "${1:-}" = "onprem" ]; then
        scope="$1"
        shift
      fi
      host="${1:-$(default_acc_host_for_scope "$scope")}"
      user="${2:-$(default_acc_user_for_scope "$scope")}"
      compare_versions "$scope" "$host" "$user" "ACC"
      ;;
    compare-versions-prd)
      scope="cloud"
      if [ "${1:-}" = "cloud" ] || [ "${1:-}" = "onprem" ]; then
        scope="$1"
        shift
      fi
      host="${1:-$(default_prd_host_for_scope "$scope")}"
      user="${2:-$(default_prd_user_for_scope "$scope")}"
      compare_versions_prd "$scope" "$host" "$user"
      ;;
    compare-versions-3way)
      scope="cloud"
      if [ "${1:-}" = "cloud" ] || [ "${1:-}" = "onprem" ]; then
        scope="$1"
        shift
      fi
      compare_versions_3way "$scope" \
        "${1:-$(default_acc_host_for_scope "$scope")}" \
        "${2:-$(default_acc_user_for_scope "$scope")}" \
        "${3:-$(default_prd_host_for_scope "$scope")}" \
        "${4:-$(default_prd_user_for_scope "$scope")}"
      ;;
    compare-versions-all)
      compare_versions_all \
        "${1:-$(default_acc_host_for_scope cloud)}" \
        "${2:-$(default_acc_user_for_scope cloud)}" \
        "${3:-$(default_acc_host_for_scope onprem)}" \
        "${4:-$(default_acc_user_for_scope onprem)}"
      ;;
    system-status) system_status_summary ;;
    system-stack-start) run_system_stack_action start "${1:-both}" ;;
    system-stack-stop) run_system_stack_action stop "${1:-both}" ;;
    system-stack-restart) run_system_stack_action restart "${1:-both}" ;;
    system-service-start) run_system_service_action start "${1:-both}" ;;
    system-service-stop) run_system_service_action stop "${1:-both}" ;;
    system-service-restart) run_system_service_action restart "${1:-both}" ;;
    system-logs)
      scope="${1:-cloud}"
      if [ "$#" -gt 0 ]; then shift || true; fi
      if [ "${1:-}" = "--follow" ]; then
        system_logs "$scope" follow
      else
        system_logs "$scope" recent
      fi
      ;;
    menu) menu ;;
    build-cloud) build_cloud ;;
    build-onprem) build_onprem ;;
    build-all) build_cloud; build_onprem ;;
    list) list_artifacts "${1:-all}" ;;
    verify) verify_artifacts "${1:-all}" ;;
    update-dev)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      update_dev "$scope" "$@"
      ;;
    update-dev-fast)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      update_dev_fast "$scope" "$@"
      ;;
    update-dev-lppadmin)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      update_dev_lppadmin "$scope" "$@"
      ;;
    update-dev-all) update_dev_all "$@" ;;
    update-dev-all-fast) update_dev_all_fast "$@" ;;
    update-acc)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_acc_host_for_scope "$scope")}"
      user="${2:-$(default_acc_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_acc "$scope" "$host" "$user" "$@"
      ;;
    update-acc-fast)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_acc_host_for_scope "$scope")}"
      user="${2:-$(default_acc_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_acc_fast "$scope" "$host" "$user" "$@"
      ;;
    update-acc-lppadmin)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_acc_host_for_scope "$scope")}"
      user="${2:-$(default_acc_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_acc_lppadmin "$scope" "$host" "$user" "$@"
      ;;
    update-prd)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_prd_host_for_scope "$scope")}"
      user="${2:-$(default_prd_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_prd "$scope" "$host" "$user" "$@"
      ;;
    update-prd-fast)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_prd_host_for_scope "$scope")}"
      user="${2:-$(default_prd_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_prd_fast "$scope" "$host" "$user" "$@"
      ;;
    update-prd-lppadmin)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_prd_host_for_scope "$scope")}"
      user="${2:-$(default_prd_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_prd_lppadmin "$scope" "$host" "$user" "$@"
      ;;
    deploy-all)
      scope="${1:-cloud}"
      if [ "$scope" = "all" ]; then
        shift || true
        deploy_all_scopes
      else
        if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
        deploy_all_scope "$scope" \
          "${1:-$(default_acc_host_for_scope "$scope")}" \
          "${2:-$(default_acc_user_for_scope "$scope")}" \
          "${3:-$(default_prd_host_for_scope "$scope")}" \
          "${4:-$(default_prd_user_for_scope "$scope")}"
      fi
      ;;
    promote-acc)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_acc_host_for_scope "$scope")}"
      user="${2:-$(default_acc_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      update_acc "$scope" "$host" "$user" "$@"
      ;;
    approve-acc)
      scope="${1:-cloud}"
      approve_internal_stage "$scope" "acc"
      ;;
    promote-dev)
      scope="${1:-cloud}"
      promote_dev_internal "$scope"
      ;;
    approve-dev)
      scope="${1:-cloud}"
      approve_internal_stage "$scope" "dev"
      ;;
    promote-prd)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_prd_host_for_scope "$scope")}"
      user="${2:-$(default_prd_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      promote_prd_internal "$scope" "$host" "$user"
      ;;
    promotion-status)
      scope="${1:-cloud}"
      show_promotion_status "$scope"
      ;;
    promotion-reset)
      scope="${1:-cloud}"
      promotion_clear_scope "$scope"
      ok "Promotion approvals reset for ${scope}."
      ;;
    patch-dev)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      run_local_scope_patch_subcommand "$scope" "${1:-patch-apply}"
      ;;
    patch-acc)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_acc_host_for_scope "$scope")}"
      user="${2:-$(default_acc_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      run_remote_scope_patch_subcommand "$scope" "acc" "$host" "$user" "${1:-patch-apply}"
      ;;
    patch-prd)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      host="${1:-$(default_prd_host_for_scope "$scope")}"
      user="${2:-$(default_prd_user_for_scope "$scope")}"
      if [ "$#" -ge 2 ]; then shift 2; else shift "$#" || true; fi
      run_remote_scope_patch_subcommand "$scope" "prd" "$host" "$user" "${1:-patch-apply}"
      ;;
    update-dev-cloud) update_dev cloud "$@" ;;
    update-dev-onprem) update_dev onprem "$@" ;;
    update-acc-cloud) update_acc cloud "$@" ;;
    update-acc-onprem) update_acc onprem "$@" ;;
    update-prd-cloud) update_prd cloud "$@" ;;
    update-prd-onprem) update_prd onprem "$@" ;;
    dr-create) dr_create_bundle "$@" ;;
    dr-verify) dr_verify_bundle "$@" ;;
    dr-restore-local) dr_restore_local "$@" ;;
    dr-restore-remote) dr_restore_remote "$@" ;;
    dr-postcheck) dr_postcheck_local "$@" ;;
    dr-postcheck-remote) dr_postcheck_remote "$@" ;;
    validate-scope-isolation) validate_scope_isolation ;;
    github-menu) menu_github_management ;;
    github-status) github_show_status ;;
    github-backup) github_backup_now ;;
    github-push) github_push_current ;;
    github-pull) github_pull_rebase ;;
    github-pat-update) github_update_pat_credentials ;;
    github-remote) github_show_or_set_remote ;;
    github-creds) github_credential_diagnostics ;;
    github-audit) github_safety_audit ;;
    github-sync-lppadmin)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      github_sync_lppadmin_scope "$scope"
      ;;
    github-sync-full-dev)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      github_sync_full_update_dev_scope "$scope"
      ;;
    github-deploy-acc)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      github_deploy_acc_from_latest_scope "$scope"
      ;;
    github-deploy-prd)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      github_deploy_prd_from_latest_scope "$scope"
      ;;
    github-sync-full)
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      github_sync_full_update_scope "$scope"
      ;;
    github-sync-devadmin) github_sync_devadmin_local_only ;;
    github-sync-tools)
      # Backward-compatible alias: now maps to scoped lppadmin sync only.
      scope="${1:-cloud}"
      if [ "$scope" = "cloud" ] || [ "$scope" = "onprem" ]; then shift || true; else scope="cloud"; fi
      github_sync_lppadmin_scope "$scope"
      ;;
    help|-h|--help) show_help ;;
    *) err "Unknown command: $cmd"; show_help; exit 1 ;;
  esac
}

main "$@"
