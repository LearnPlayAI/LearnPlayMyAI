#!/usr/bin/env bash
set -euo pipefail

# Roll out theme catalog migration across cloud + onprem DEV/ACC/PRD hosts.
# Defaults to dry-run safety checks. Pass --live to execute live DB updates.

LIVE_MODE=0
ALLOW_PRUNE=0
for arg in "$@"; do
  case "$arg" in
    --live) LIVE_MODE=1 ;;
    --allow-prune) ALLOW_PRUNE=1 ;;
  esac
done

HOSTS=(
  "dev-cloud-devadmin"
  "acc-cloud-devadmin"
  "prd-cloud-devadmin"
  "dev-onprem-devadmin"
  "acc-onprem-devadmin"
  "prd-onprem-devadmin"
)

resolve_remote_app_dir() {
  local host="$1"
  if [[ "$host" == *"cloud"* ]]; then
    echo "${REMOTE_APP_DIR_CLOUD:-/opt/learnplay/cloud}"
    return
  fi
  echo "${REMOTE_APP_DIR_ONPREM:-/opt/learnplay/onprem}"
}

run_remote() {
  local host="$1"
  local cmd="$2"
  echo ""
  echo "===== ${host} ====="
  ssh "$host" "bash -s" <<EOF
${cmd}
EOF
}

DRY_RUN_FAILED=()
LIVE_RUN_FAILED=()

for host in "${HOSTS[@]}"; do
  remote_app_dir="$(resolve_remote_app_dir "$host")"
  prune_cmd=""
  if [[ "$ALLOW_PRUNE" -eq 1 ]]; then
    prune_cmd="npx --yes tsx server/scripts/pruneInvalidThemes.ts"
  fi
  base_cmd="
    set -euo pipefail
    if [ ! -d '${remote_app_dir}' ]; then
      echo 'App dir not found: ${remote_app_dir}'
      exit 1
    fi
    cd '${remote_app_dir}'
    npx --yes tsx server/scripts/migrateThemePresetIdsToCatalog.ts
    npx --yes tsx server/scripts/remediateThemeContrast.ts
    ${prune_cmd}
  "
  if ! run_remote "$host" "$base_cmd"; then
    DRY_RUN_FAILED+=("$host")
  fi
done

if [[ "$LIVE_MODE" -eq 1 ]]; then
  for host in "${HOSTS[@]}"; do
    remote_app_dir="$(resolve_remote_app_dir "$host")"
    prune_live_cmd=""
    if [[ "$ALLOW_PRUNE" -eq 1 ]]; then
      prune_live_cmd="npx --yes tsx server/scripts/pruneInvalidThemes.ts --live"
    fi
    live_cmd="
      set -euo pipefail
      cd '${remote_app_dir}'
      npx --yes tsx server/scripts/migrateThemePresetIdsToCatalog.ts --live
      npx --yes tsx server/scripts/remediateThemeContrast.ts --live
      ${prune_live_cmd}
    "
    if ! run_remote "$host" "$live_cmd"; then
      LIVE_RUN_FAILED+=("$host")
    fi
  done
fi

echo ""
if [[ "${#DRY_RUN_FAILED[@]}" -gt 0 ]]; then
  echo "Dry-run failures: ${DRY_RUN_FAILED[*]}"
fi
if [[ "${#LIVE_RUN_FAILED[@]}" -gt 0 ]]; then
  echo "Live-run failures: ${LIVE_RUN_FAILED[*]}"
fi

if [[ "${#DRY_RUN_FAILED[@]}" -eq 0 && "${#LIVE_RUN_FAILED[@]}" -eq 0 ]]; then
  if [[ "$LIVE_MODE" -eq 1 ]]; then
    echo "Theme rollout script completed (dry-run + live phases)."
  else
    echo "Theme rollout script completed (dry-run only)."
  fi
else
  echo "Theme rollout script completed with failures."
  exit 1
fi
