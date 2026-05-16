#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"
PACKAGES_ROOT="${LEARNPLAY_PACKAGES_ROOT:-/antigravity/packages}"
LOG_DIR="${LEARNPLAY_WSL_DEVADMIN_LOG_DIR:-/tmp/learnplay-wsl-devadmin}"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  bash Cloud-On-Prem/scripts/dev-workspace/wsl-devadmin.sh <command> [args]

WSL workstation-supported commands:
  update-dev [cloud|onprem|all]
      Activate current source changes in the WSL DEV runtime by restarting
      the source-local app process(es) on ports 8010/8020. This does not
      build or deploy a package to /opt/learnplay.

  update-dev-all
      Same as update-dev all.

  build-deploy-dev [cloud|onprem|all]
      Build package artifact(s), run scoped database migrations against the
      WSL DEV database(s), then restart the source-local DEV app process(es).

  system-status
      Show local WSL app process and health status.

  system-logs [cloud|onprem|all]
      Print local WSL app log file path(s).

  list [cloud|onprem|all]
      List local package artifacts under /antigravity/packages/{cloud,onprem}.

  verify [cloud|onprem|all]
      Verify local package artifact checksums.

  build cloud|onprem|all
      Build package artifacts from /antigravity/Cloud-On-Prem using local
      .env.cloud.local and .env.onprem.local.

  compare-remote cloud|onprem [acc|prd|all]
      Read ACC/PRD runtime versions over SSH aliases without requiring local
      /opt/learnplay runtime envs.

  unsupported
      Show commands intentionally unsupported on a WSL workstation.

Unsupported managed-host commands:
  update-acc, update-prd, deploy-all,
  system-stack-start, system-stack-stop, system-stack-restart,
  system-service-start, system-service-stop, system-service-restart,
  patch-dev, dr-restore-local.
EOF
}

scope_label() {
  case "${1:-all}" in
    cloud) printf 'Cloud' ;;
    onprem) printf 'OnPrem' ;;
    all) printf 'Cloud + OnPrem' ;;
    *) die "Invalid scope: $1" ;;
  esac
}

package_prefix_for_scope() {
  case "${1:-}" in
    cloud) printf 'LP-CL-V' ;;
    onprem) printf 'LP-OP-V' ;;
    *) die "Invalid scope: $1" ;;
  esac
}

package_latest_link_for_scope() {
  case "${1:-}" in
    cloud) printf 'learnplay-cloud.tar.gz' ;;
    onprem) printf 'learnplay-onprem.tar.gz' ;;
    *) die "Invalid scope: $1" ;;
  esac
}

package_dir_for_scope() {
  case "${1:-}" in
    cloud) printf '%s/cloud' "$PACKAGES_ROOT" ;;
    onprem) printf '%s/onprem' "$PACKAGES_ROOT" ;;
    *) die "Invalid scope: $1" ;;
  esac
}

artifact_pattern_for_scope() {
  local prefix
  prefix="$(package_prefix_for_scope "$1")"
  printf '%s*.tar.gz' "$prefix"
}

read_env_value() {
  local env_file="$1"
  local key="$2"
  [ -f "$env_file" ] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^["'\''"]|["'\''"]$/, "", value)
      print value
      exit
    }
  ' "$env_file"
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  if command -v nvm >/dev/null 2>&1; then
    nvm use 20 >/dev/null
  fi
}

use_wsl_node_runtime() {
  case "${TMPDIR:-}" in
    /mnt/*|"") export TMPDIR=/tmp ;;
  esac
  export TSX_DISABLE_IPC=1
}

require_scope() {
  case "${1:-}" in
    cloud|onprem) ;;
    *) die "Expected scope cloud or onprem, got: ${1:-<empty>}" ;;
  esac
}

require_scope_or_all() {
  case "${1:-all}" in
    cloud|onprem|all) ;;
    *) die "Expected scope cloud, onprem, or all, got: ${1:-<empty>}" ;;
  esac
}

next_release_version_for_scope() {
  local scope="$1"
  local prefix pkg_dir latest rest major minor patch
  prefix="$(package_prefix_for_scope "$scope")"
  pkg_dir="$(package_dir_for_scope "$scope")"
  latest="$(ls -1 "$pkg_dir"/${prefix}*.tar.gz 2>/dev/null | sed 's#.*/##; s#\\.tar\\.gz$##' | sort -V | tail -1 || true)"
  if [ -z "$latest" ]; then
    printf '%s1.00.001' "$prefix"
    return 0
  fi
  rest="${latest#$prefix}"
  IFS=. read -r major minor patch <<<"$rest"
  if ! [[ "${major:-}" =~ ^[0-9]+$ && "${minor:-}" =~ ^[0-9]+$ && "${patch:-}" =~ ^[0-9]+$ ]]; then
    printf '%s1.00.001' "$prefix"
    return 0
  fi
  patch=$((10#$patch + 1))
  printf '%s%d.%02d.%03d' "$prefix" "$major" "$((10#$minor))" "$patch"
}

list_artifacts_scope() {
  local scope="$1"
  local pkg_dir pattern pkg
  pkg_dir="$(package_dir_for_scope "$scope")"
  pattern="$(artifact_pattern_for_scope "$scope")"
  printf '\n%s artifacts (%s)\n' "$(scope_label "$scope")" "$pkg_dir"
  if [ ! -d "$pkg_dir" ]; then
    printf '  <package directory missing>\n'
    return 0
  fi
  local found=0
  shopt -s nullglob
  for pkg in "$pkg_dir"/$pattern; do
    [ -f "$pkg" ] || continue
    found=1
    printf '  %s\n' "$(basename "$pkg")"
    if [ -f "${pkg}.sha256" ]; then
      printf '    checksum: %s\n' "$(basename "${pkg}.sha256")"
    else
      printf '    checksum: <missing>\n'
    fi
  done
  shopt -u nullglob
  [ "$found" -eq 1 ] || printf '  <none>\n'
}

list_artifacts() {
  local scope="${1:-all}"
  require_scope_or_all "$scope"
  case "$scope" in
    all) list_artifacts_scope cloud; list_artifacts_scope onprem ;;
    *) list_artifacts_scope "$scope" ;;
  esac
}

verify_artifacts_scope() {
  local scope="$1"
  local pkg_dir pattern pkg sha checked=0 failures=0
  pkg_dir="$(package_dir_for_scope "$scope")"
  pattern="$(artifact_pattern_for_scope "$scope")"
  if [ ! -d "$pkg_dir" ]; then
    warn "$(scope_label "$scope") package directory missing: $pkg_dir"
    return 1
  fi
  shopt -s nullglob
  for pkg in "$pkg_dir"/$pattern; do
    [ -f "$pkg" ] || continue
    [ -L "$pkg" ] && continue
    sha="${pkg}.sha256"
    if [ ! -f "$sha" ]; then
      warn "Missing checksum for $(basename "$pkg")"
      failures=$((failures + 1))
      continue
    fi
    checked=$((checked + 1))
    if (cd "$pkg_dir" && sha256sum -c "$(basename "$sha")" >/dev/null); then
      printf 'OK: %s\n' "$(basename "$pkg")"
    else
      printf 'FAIL: %s\n' "$(basename "$pkg")"
      failures=$((failures + 1))
    fi
  done
  shopt -u nullglob
  if [ "$checked" -eq 0 ]; then
    warn "No versioned $(scope_label "$scope") artifacts found."
    return 1
  fi
  [ "$failures" -eq 0 ]
}

verify_artifacts() {
  local scope="${1:-all}"
  local failures=0
  require_scope_or_all "$scope"
  case "$scope" in
    all)
      verify_artifacts_scope cloud || failures=$((failures + 1))
      verify_artifacts_scope onprem || failures=$((failures + 1))
      ;;
    *) verify_artifacts_scope "$scope" || failures=$((failures + 1)) ;;
  esac
  [ "$failures" -eq 0 ]
}

package_dist() {
  local scope="$1"
  local dist_dir="$2"
  local version="$3"
  local pkg_dir pkg sha latest
  pkg_dir="$(package_dir_for_scope "$scope")"
  pkg="${version}.tar.gz"
  sha="${pkg}.sha256"
  latest="$(package_latest_link_for_scope "$scope")"
  mkdir -p "$pkg_dir"
  (cd "$APP_DIR" && tar czf "$pkg_dir/$pkg" "$dist_dir")
  (cd "$pkg_dir" && sha256sum "$pkg" > "$sha")
  ln -sfn "$pkg" "$pkg_dir/$latest"
  printf 'Package: %s\n' "$pkg_dir/$pkg"
  printf 'Checksum: %s\n' "$pkg_dir/$sha"
  printf 'Latest link: %s\n' "$pkg_dir/$latest"
}

build_cloud() {
  local env_file="$APP_DIR/.env.cloud.local"
  local version dist_version
  [ -f "$env_file" ] || die "Missing $env_file. Run bootstrap env/setup first."
  load_nvm
  use_wsl_node_runtime
  version="$(next_release_version_for_scope cloud)"
  mkdir -p "$LOG_DIR"
  log "Building Cloud workstation package $version"
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  export LEARNPLAY_BUILD_INVOKER_TOOL=devadmin
  export LEARNPLAY_ALLOW_NON_INTERNAL_BUILD=true
  export RELEASE_VERSION_OVERRIDE="$version"
  export RELEASE_NOTES_SCOPE=cloud
  export RELEASE_NOTES_SCRIPT=/antigravity/scripts/devadmin/generate-release-notes.sh
  export RELEASE_NOTES_PACKAGE_DIR="$(package_dir_for_scope cloud)"
  export RELEASE_CHANGELOG_FILE=/antigravity/docs/handoverdocs/CHANGELOG.md
  export RELEASE_NOTES_STATE_OUTPUT="$APP_DIR/dist-cloud/release-notes-state.env"
  (cd "$APP_DIR" && bash build-cloud-linux.sh) 2>&1 | tee "$LOG_DIR/build-cloud-${version}.log"
  dist_version="$(node -e "const fs=require('fs'); const p='$APP_DIR/dist-cloud/version.json'; console.log(JSON.parse(fs.readFileSync(p,'utf8')).version || '')")"
  [ "$dist_version" = "$version" ] || die "Built cloud version '$dist_version' did not match requested '$version'."
  package_dist cloud dist-cloud "$version"
}

build_onprem() {
  local env_file="$APP_DIR/.env.onprem.local"
  local cloud_env_file="$APP_DIR/.env.cloud.local"
  local cloud_db_url version dist_version
  [ -f "$env_file" ] || die "Missing $env_file. Run bootstrap env/setup first."
  [ -f "$cloud_env_file" ] || die "Missing $cloud_env_file. Onprem package export needs cloud data DB context."
  cloud_db_url="$(read_env_value "$cloud_env_file" DATABASE_URL || true)"
  [ -n "$cloud_db_url" ] || die "Could not read cloud DATABASE_URL from $cloud_env_file."
  load_nvm
  use_wsl_node_runtime
  version="$(next_release_version_for_scope onprem)"
  mkdir -p "$LOG_DIR"
  log "Building OnPrem workstation package $version"
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  export LEARNPLAY_BUILD_INVOKER_TOOL=devadmin
  export LEARNPLAY_ALLOW_NON_INTERNAL_BUILD=true
  export RELEASE_VERSION_OVERRIDE="$version"
  export RELEASE_NOTES_SCOPE=onprem
  export RELEASE_NOTES_SCRIPT=/antigravity/scripts/devadmin/generate-release-notes.sh
  export RELEASE_NOTES_PACKAGE_DIR="$(package_dir_for_scope onprem)"
  export RELEASE_CHANGELOG_FILE=/antigravity/docs/handoverdocs/CHANGELOG.md
  export RELEASE_NOTES_STATE_OUTPUT="$APP_DIR/dist-onprem/release-notes-state.env"
  export CLOUD_DATA_DATABASE_URL="$cloud_db_url"
  if [ -d "$APP_DIR/uploads/cloud" ]; then
    export LEARNPLAY_UPLOAD_DIR="$APP_DIR/uploads/cloud"
  fi
  (cd "$APP_DIR" && bash onprem/build-onprem.sh) 2>&1 | tee "$LOG_DIR/build-onprem-${version}.log"
  dist_version="$(node -e "const fs=require('fs'); const p='$APP_DIR/dist-onprem/version.json'; console.log(JSON.parse(fs.readFileSync(p,'utf8')).version || '')")"
  [ "$dist_version" = "$version" ] || die "Built onprem version '$dist_version' did not match requested '$version'."
  package_dist onprem dist-onprem "$version"
}

build_scope() {
  local scope="${1:-}"
  case "$scope" in
    cloud) build_cloud ;;
    onprem) build_onprem ;;
    all) build_cloud; build_onprem ;;
    *) die "Expected build scope cloud, onprem, or all." ;;
  esac
}

local_apps() {
  bash "$SCRIPT_DIR/local-apps.sh" "$@"
}

wsl_update_dev() {
  local scope="${1:-all}"
  require_scope_or_all "$scope"
  log "Activating current source in WSL DEV runtime ($(scope_label "$scope"))"
  local_apps restart "$scope"
  local_apps status "$scope"
}

run_dev_migrations_for_scope() {
  local scope="${1:-}"
  local env_file="$APP_DIR/.env.${scope}.local"
  case "$scope" in
    cloud|onprem) ;;
    *) die "Expected migration scope cloud or onprem; got: ${scope:-<empty>}" ;;
  esac
  [ -f "$env_file" ] || die "Missing $env_file. Run bootstrap env/setup first."
  load_nvm
  use_wsl_node_runtime
  log "Running $(scope_label "$scope") DEV database migrations"
  (
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
    export DEPLOYMENT_MODE="$scope"
    if [ "$scope" = "cloud" ]; then
      export ONPREM_MODE=false
      export ONPREM_OWN_API_KEYS=false
    fi
    cd "$APP_DIR"
    npx tsx server/migrate-onprem.ts
  )
}

run_dev_migrations() {
  local scope="${1:-all}"
  require_scope_or_all "$scope"
  case "$scope" in
    cloud) run_dev_migrations_for_scope cloud ;;
    onprem) run_dev_migrations_for_scope onprem ;;
    all)
      run_dev_migrations_for_scope cloud
      run_dev_migrations_for_scope onprem
      ;;
  esac
}

wsl_build_deploy_dev() {
  local scope="${1:-all}"
  require_scope_or_all "$scope"
  log "Building DEV package artifact(s) ($(scope_label "$scope"))"
  build_scope "$scope"
  run_dev_migrations "$scope"
  wsl_update_dev "$scope"
}

target_alias_for_scope_env() {
  local scope="$1"
  local env_name="$2"
  case "${scope}:${env_name}" in
    cloud:acc) printf 'acc-cloud-devadmin' ;;
    cloud:prd) printf 'prd-cloud-devadmin' ;;
    onprem:acc) printf 'acc-onprem-devadmin' ;;
    onprem:prd) printf 'prd-onprem-devadmin' ;;
    *) die "Invalid compare target: ${scope}:${env_name}" ;;
  esac
}

extract_remote_version() {
  sed -n \
    -e 's/^InstalledVersionRaw:[[:space:]]*//p' \
    -e 's/^InstalledVersion:[[:space:]]*//p' \
    -e 's/^Version:[[:space:]]*//p' | head -1 | tr -d '[:space:]'
}

extract_remote_build_date() {
  sed -n \
    -e 's/^BuildDate:[[:space:]]*//p' \
    -e 's/^BuildDateRaw:[[:space:]]*//p' | head -1
}

read_remote_runtime_version() {
  local scope="$1"
  local env_name="$2"
  local target
  target="$(target_alias_for_scope_env "$scope" "$env_name")"
  ssh -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o ConnectTimeout=10 "$target" \
    "sudo -n lppadmin '$scope' runtime-version"
}

compare_remote_scope() {
  local scope="$1"
  local env_name="${2:-all}"
  local envs=()
  local output version build_date target
  require_scope "$scope"
  case "$env_name" in
    acc|prd) envs=("$env_name") ;;
    all) envs=(acc prd) ;;
    *) die "Expected environment acc, prd, or all." ;;
  esac

  printf '%-8s | %-4s | %-24s | %-24s | %s\n' "SCOPE" "ENV" "TARGET" "VERSION" "BUILD DATE"
  printf '%-8s-+-%-4s-+-%-24s-+-%-24s-+-%s\n' "--------" "----" "------------------------" "------------------------" "------------------------------"
  for env in "${envs[@]}"; do
    target="$(target_alias_for_scope_env "$scope" "$env")"
    if output="$(read_remote_runtime_version "$scope" "$env" 2>/dev/null)"; then
      version="$(printf '%s\n' "$output" | extract_remote_version)"
      build_date="$(printf '%s\n' "$output" | extract_remote_build_date)"
      printf '%-8s | %-4s | %-24s | %-24s | %s\n' "$scope" "$env" "$target" "${version:-unknown}" "${build_date:-unknown}"
    else
      printf '%-8s | %-4s | %-24s | %-24s | %s\n' "$scope" "$env" "$target" "unreachable" "read failed"
      return 1
    fi
  done
}

show_unsupported() {
  cat <<EOF
Unsupported on this WSL workstation because they require a managed runtime
under /opt/learnplay and/or perform remote deployment or host mutation:

  update-acc [cloud|onprem]
  update-prd [cloud|onprem]
  deploy-all [cloud|onprem|all]
  system-stack-start|stop|restart [cloud|onprem|both]
  system-service-start|stop|restart [cloud|onprem|both]
  patch-dev [cloud|onprem] ...
  dr-restore-local

Use update-dev/system-status/system-logs here for WSL DEV. Use remote
deployment commands only from an environment configured for ACC/PRD targets.
EOF
}

main() {
  local command="${1:-help}"
  shift || true
  case "$command" in
    help|-h|--help) usage ;;
    list) list_artifacts "${1:-all}" ;;
    verify) verify_artifacts "${1:-all}" ;;
    build) build_scope "${1:-}" ;;
    build-deploy-dev) wsl_build_deploy_dev "${1:-all}" ;;
    update-dev) wsl_update_dev "${1:-all}" ;;
    update-dev-all) wsl_update_dev all ;;
    system-status) local_apps status "${1:-all}" ;;
    system-logs) local_apps logs "${1:-all}" ;;
    compare-remote) compare_remote_scope "${1:-}" "${2:-all}" ;;
    unsupported) show_unsupported ;;
    update-acc|update-prd|deploy-all|system-stack-start|system-stack-stop|system-stack-restart|system-service-start|system-service-stop|system-service-restart|patch-dev|dr-restore-local)
      show_unsupported
      exit 2
      ;;
    *) usage; die "Unknown WSL workstation command: $command" ;;
  esac
}

main "$@"
