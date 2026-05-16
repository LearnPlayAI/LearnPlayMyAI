#!/usr/bin/env bash
set -euo pipefail

# Reusable updater from DEV host -> ACC host.
# Target host/user are required (use devadmin environment targets or pass --host/--user).
# If ACC_PASSWORD is set, ssh/scp will use password auth via sshpass.

ACC_HOST="${ACC_HOST:-}"
ACC_USER="${ACC_USER:-}"
ACC_PASSWORD="${ACC_PASSWORD:-}"
PKG_DIR="${PKG_DIR:-}"
REMOTE_TMP="${REMOTE_TMP:-/tmp}"
COMPONENT="${COMPONENT:-all}"      # all | app-db | lppadmin
SCOPE="${SCOPE:-cloud}"            # cloud | onprem
DO_BUILD=1
SELECTED_PACKAGE="${SELECTED_PACKAGE:-}"
ACC_TARGET="${ACC_TARGET:-}"

resolve_acc_target() {
  local scope="$1"
  local host="$2"
  local user="$3"
  local alias=""
  if [[ -n "$host" ]]; then
    if [[ "$host" == *"@"* ]]; then
      echo "$host"
      return 0
    fi
    if [[ "$host" == *-devadmin ]]; then
      echo "$host"
      return 0
    fi
    echo "${user}@${host}"
    return 0
  fi
  case "$scope" in
    cloud|onprem) alias="acc-${scope}-devadmin" ;;
  esac
  if [[ -n "$alias" ]]; then
    echo "$alias"
    return 0
  fi
  echo ""
}

ssh_cmd() {
  # Prefer key-based auth for configured aliases; fallback to password if needed.
  if ssh -o BatchMode=yes "$@"; then return; fi
  if [ -n "$ACC_PASSWORD" ] && command -v sshpass >/dev/null 2>&1; then
    SSHPASS="$ACC_PASSWORD" sshpass -e ssh \
      -o PreferredAuthentications=password \
      -o PubkeyAuthentication=no \
      -o KbdInteractiveAuthentication=no \
      "$@"
    return
  fi
  return 1
}

scp_cmd() {
  # Prefer key-based auth for configured aliases; fallback to password if needed.
  if scp -o BatchMode=yes "$@"; then return; fi
  if [ -n "$ACC_PASSWORD" ] && command -v sshpass >/dev/null 2>&1; then
    SSHPASS="$ACC_PASSWORD" sshpass -e scp \
      -o PreferredAuthentications=password \
      -o PubkeyAuthentication=no \
      -o KbdInteractiveAuthentication=no \
      "$@"
    return
  fi
  return 1
}

usage() {
  cat <<EOF
Usage:
  $0 [options]

Options:
  --host <hostname>         ACC host (default: ${ACC_HOST})
  --user <username>         SSH user (default: ${ACC_USER})
  --pkg-dir <dir>           Package directory (default: ${PKG_DIR})
  --remote-tmp <dir>        Remote tmp directory (default: ${REMOTE_TMP})
  --scope <cloud|onprem>    Runtime scope to update (default: ${SCOPE})
  --component <mode>        Update component: all|app-db|lppadmin (default: ${COMPONENT})
  --package <file>          DEV artifact to deploy (basename or full path)
  --skip-build              Skip 'sudo devadmin build-<scope>'
  -h, --help                Show this help

Examples:
  $0
  $0 --scope onprem
  $0 --skip-build
  $0 --component app-db
  $0 --skip-build --package LP-CL-V1.00.001.tar.gz
  $0 --host acc.learnplay.co.za --user lppadmin
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) ACC_HOST="$2"; shift 2 ;;
    --user) ACC_USER="$2"; shift 2 ;;
    --pkg-dir) PKG_DIR="$2"; shift 2 ;;
    --remote-tmp) REMOTE_TMP="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --component) COMPONENT="$2"; shift 2 ;;
    --package) SELECTED_PACKAGE="$2"; shift 2 ;;
    --skip-build) DO_BUILD=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$ACC_HOST" || -z "$ACC_USER" ]]; then
  echo "ACC host/user are required (use --host/--user or set ACC_HOST/ACC_USER)." >&2
  exit 1
fi
ACC_TARGET="$(resolve_acc_target "$SCOPE" "$ACC_HOST" "$ACC_USER")"

case "$COMPONENT" in
  all|app-db|lppadmin) ;;
  *) echo "Invalid --component '$COMPONENT' (expected all|app-db|lppadmin)" >&2; exit 1 ;;
esac

case "$SCOPE" in
  cloud|onprem) ;;
  *) echo "Invalid --scope '$SCOPE' (expected cloud|onprem)" >&2; exit 1 ;;
esac

if [[ -z "$PKG_DIR" ]]; then
  PKG_DIR="/antigravity/packages/${SCOPE}"
fi

SCOPE_LABEL="${SCOPE^^}"
DIST_DIR_NAME="dist-${SCOPE}"
PKG_PREFIX="learnplay-${SCOPE}-v"
if [[ "$SCOPE" == "cloud" ]]; then
  PKG_PREFIX="LP-CL-V"
else
  PKG_PREFIX="LP-OP-V"
fi
TRANSFER_TOKEN="$(date +%Y%m%d%H%M%S)-$$"
REMOTE_STAGE="${REMOTE_TMP}/devadmin-update-${TRANSFER_TOKEN}"

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "[1/7] Building ${SCOPE} package on DEV..."
  sudo devadmin "build-${SCOPE}"
fi

if [[ -n "$SELECTED_PACKAGE" ]]; then
  if [[ "$SELECTED_PACKAGE" = /* ]]; then
    PKG="$SELECTED_PACKAGE"
  else
    PKG="${PKG_DIR}/${SELECTED_PACKAGE}"
  fi
else
  PKG="$(ls -1t "${PKG_DIR}/${PKG_PREFIX}"*.tar.gz 2>/dev/null | head -1 || true)"
  if [[ -z "${PKG}" ]]; then
    LEGACY_PKG_DIR="/antigravity/Cloud-On-Prem"
    PKG="$(ls -1t "${LEGACY_PKG_DIR}/${PKG_PREFIX}"*.tar.gz 2>/dev/null | head -1 || true)"
  fi
fi

if [[ -n "${PKG:-}" && ! -f "$PKG" && -f "${PKG_DIR}/$(basename "${PKG}")" ]]; then
  PKG="${PKG_DIR}/$(basename "${PKG}")"
fi

SHA="${PKG}.sha256"
PKG_BASENAME="$(basename "$PKG")"
SHA_BASENAME="$(basename "$SHA")"

[[ -f "$PKG" ]] || { echo "No package found in ${PKG_DIR}" >&2; exit 1; }
[[ "$PKG_BASENAME" == ${PKG_PREFIX}*.tar.gz ]] || {
  echo "Selected package does not match scope '${SCOPE}': ${PKG_BASENAME}" >&2
  exit 1
}
[[ -f "$SHA" ]] || { echo "Missing checksum file: ${SHA}" >&2; exit 1; }

echo "[2/7] Verifying selected package checksum on DEV..."
(cd "$(dirname "$PKG")" && sha256sum -c "${SHA_BASENAME}")

echo "[3/7] Checking ACC connectivity..."
ssh_cmd -o ConnectTimeout=8 "$ACC_TARGET" 'hostname && echo "reachable"'

echo "[4/8] Preparing ACC transfer staging..."
ssh_cmd -T "$ACC_TARGET" "rm -rf '${REMOTE_STAGE}' && mkdir -p '${REMOTE_STAGE}'"

echo "[5/8] Copying package to ACC..."
scp_cmd "$PKG" "$SHA" "${ACC_TARGET}:${REMOTE_STAGE}/"

echo "[6/8] Running deterministic update via lppadmin on ACC..."
ssh_cmd -T "$ACC_TARGET" \
  "PKG_BASENAME='${PKG_BASENAME}' SHA_BASENAME='${SHA_BASENAME}' REMOTE_TMP='${REMOTE_TMP}' REMOTE_STAGE='${REMOTE_STAGE}' COMPONENT='${COMPONENT}' DIST_DIR_NAME='${DIST_DIR_NAME}' SCOPE='${SCOPE}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${REMOTE_STAGE}"

if ! sudo -n true 2>/dev/null; then
  echo "[ACC] ERROR: passwordless sudo is not configured for this user." >&2
  echo "[ACC] Configure sudoers for ${USER} before running automated updates." >&2
  exit 1
fi

if [[ ! -f "${PKG_BASENAME}" ]]; then
  echo "Package not found in ${REMOTE_STAGE}: ${PKG_BASENAME}" >&2
  exit 1
fi
if [[ ! -f "${SHA_BASENAME}" ]]; then
  echo "Checksum file not found in ${REMOTE_STAGE}: ${SHA_BASENAME}" >&2
  exit 1
fi

echo "[ACC] Verifying checksum..."
sha256sum -c "${SHA_BASENAME}"

echo "[ACC] Removing stale extracted dists..."
rm -rf "/tmp/${DIST_DIR_NAME}" /tmp/"${DIST_DIR_NAME}"-*

echo "[ACC] Extracting package..."
tar xzf "${PKG_BASENAME}" -C /tmp

echo "[ACC] Package version:"
cat "/tmp/${DIST_DIR_NAME}/version.json"

echo "[ACC] Applying update component='${COMPONENT}' via lppadmin..."
LPPADMIN_CMD="/tmp/${DIST_DIR_NAME}/scripts/lppadmin.sh"
if [[ ! -x "${LPPADMIN_CMD}" ]]; then
  LPPADMIN_CMD="lppadmin"
fi
case "${COMPONENT}" in
  all)
    sudo -n LPPADMIN_ASSUME_YES=true LEARNPLAY_DIST_DIR="/tmp/${DIST_DIR_NAME}" "${LPPADMIN_CMD}" "${SCOPE}" update-app-db
    sudo -n LPPADMIN_ASSUME_YES=true LEARNPLAY_DIST_DIR="/tmp/${DIST_DIR_NAME}" "${LPPADMIN_CMD}" "${SCOPE}" update-lppadmin
    ;;
  app-db)
    sudo -n LPPADMIN_ASSUME_YES=true LEARNPLAY_DIST_DIR="/tmp/${DIST_DIR_NAME}" "${LPPADMIN_CMD}" "${SCOPE}" update-app-db
    ;;
  lppadmin)
    sudo -n LPPADMIN_ASSUME_YES=true LEARNPLAY_DIST_DIR="/tmp/${DIST_DIR_NAME}" "${LPPADMIN_CMD}" "${SCOPE}" update-lppadmin
    ;;
esac

# DEV tooling must never live on ACC/PRD runtimes.
if sudo -n test -e /usr/local/bin/devadmin; then
  echo "[ACC] Removing DEV-only tool: /usr/local/bin/devadmin"
  sudo -n rm -f /usr/local/bin/devadmin
fi

rm -rf "${REMOTE_STAGE}" || true
REMOTE

echo "[7/8] Running ACC post-checks..."
ssh_cmd -T "$ACC_TARGET" "sudo lppadmin ${SCOPE} runtime-version; sudo lppadmin ${SCOPE} health"

echo "[8/8] Completed."
echo "Updated ${SCOPE_LABEL} ACC target: ${ACC_TARGET}"
echo "Package used: ${PKG_BASENAME}"
