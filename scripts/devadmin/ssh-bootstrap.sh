#!/usr/bin/env bash
set -euo pipefail

TARGETS_CONF_DIR="/etc/learnplay-admin"
TARGETS_CONF_FILE="${TARGETS_CONF_DIR}/devadmin-targets.env"
TARGETS_SECRETS_KEY_FILE="${TARGETS_CONF_DIR}/devadmin-targets.key"
TARGETS_SECRETS_FILE="${TARGETS_CONF_DIR}/devadmin-targets.secrets.enc"

ACC_HOST=""
ACC_USER="lppadmin"
ACC_PASSWORD=""
PRD_HOST=""
PRD_USER="lppadmin"
PRD_PASSWORD=""
ACC_ALIAS=""
PRD_ALIAS=""
ACC_ALIAS_SET=0
PRD_ALIAS_SET=0
ONLY_TARGET="both"
TARGET_SCOPE="cloud"
ALLOW_SCOPE_ALL=0
ORIG_ARGS=("$@")

load_stored_passwords() {
  ACC_CLOUD_PASSWORD=""
  ACC_ONPREM_PASSWORD=""
  PRD_CLOUD_PASSWORD=""
  PRD_ONPREM_PASSWORD=""
  if [ ! -f "$TARGETS_SECRETS_FILE" ] || [ ! -f "$TARGETS_SECRETS_KEY_FILE" ]; then
    return 0
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    return 0
  fi
  # shellcheck disable=SC1090
  source <(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass "file:${TARGETS_SECRETS_KEY_FILE}" -in "$TARGETS_SECRETS_FILE" 2>/dev/null || true)
}

save_stored_passwords() {
  mkdir -p "$TARGETS_CONF_DIR"
  if ! command -v openssl >/dev/null 2>&1; then
    return 0
  fi
  if [ ! -f "$TARGETS_SECRETS_KEY_FILE" ]; then
    umask 077
    openssl rand -base64 48 > "$TARGETS_SECRETS_KEY_FILE"
    chmod 600 "$TARGETS_SECRETS_KEY_FILE" 2>/dev/null || true
  fi
  load_stored_passwords
  local acc_cloud="${ACC_CLOUD_PASSWORD:-}"
  local acc_onprem="${ACC_ONPREM_PASSWORD:-}"
  local prd_cloud="${PRD_CLOUD_PASSWORD:-}"
  local prd_onprem="${PRD_ONPREM_PASSWORD:-}"

  if [ "$ONLY_TARGET" = "acc" ] || [ "$ONLY_TARGET" = "both" ]; then
    case "$TARGET_SCOPE" in
      cloud) acc_cloud="${ACC_PASSWORD:-$acc_cloud}" ;;
      onprem) acc_onprem="${ACC_PASSWORD:-$acc_onprem}" ;;
      all) : ;;
    esac
  fi
  if [ "$ONLY_TARGET" = "prd" ] || [ "$ONLY_TARGET" = "both" ]; then
    case "$TARGET_SCOPE" in
      cloud) prd_cloud="${PRD_PASSWORD:-$prd_cloud}" ;;
      onprem) prd_onprem="${PRD_PASSWORD:-$prd_onprem}" ;;
      all) : ;;
    esac
  fi

  local tmp
  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
ACC_CLOUD_PASSWORD=$(printf '%q' "${acc_cloud}")
ACC_ONPREM_PASSWORD=$(printf '%q' "${acc_onprem}")
PRD_CLOUD_PASSWORD=$(printf '%q' "${prd_cloud}")
PRD_ONPREM_PASSWORD=$(printf '%q' "${prd_onprem}")
EOF
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -pass "file:${TARGETS_SECRETS_KEY_FILE}" \
    -in "$tmp" -out "$TARGETS_SECRETS_FILE"
  rm -f "$tmp"
  chmod 600 "$TARGETS_SECRETS_FILE" 2>/dev/null || true
}

usage() {
  cat <<'EOF'
Usage:
  sudo /antigravity/scripts/devadmin/ssh-bootstrap.sh [options]

Options:
  --acc-host <hostname>         ACC hostname
  --acc-user <username>         ACC user (default: lppadmin)
  --acc-password <password>     ACC SSH/sudo password
  --prd-host <hostname>         PRD hostname
  --prd-user <username>         PRD user (default: lppadmin)
  --prd-password <password>     PRD SSH/sudo password
  --acc-alias <alias>           Local SSH alias for ACC (default: acc-devadmin)
  --prd-alias <alias>           Local SSH alias for PRD (default: prd-devadmin)
  --only <acc|prd|both>         Bootstrap only ACC, only PRD, or both (default: both)
  --scope <cloud|onprem|all>    Which devadmin target scope to update (default: cloud)
  --allow-scope-all             Allow --scope all (unsafe unless both scopes share exact same target)
  -h, --help                    Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --acc-host) ACC_HOST="${2:-}"; shift 2 ;;
    --acc-user) ACC_USER="${2:-}"; shift 2 ;;
    --acc-password) ACC_PASSWORD="${2:-}"; shift 2 ;;
    --prd-host) PRD_HOST="${2:-}"; shift 2 ;;
    --prd-user) PRD_USER="${2:-}"; shift 2 ;;
    --prd-password) PRD_PASSWORD="${2:-}"; shift 2 ;;
    --acc-alias) ACC_ALIAS="${2:-}"; ACC_ALIAS_SET=1; shift 2 ;;
    --prd-alias) PRD_ALIAS="${2:-}"; PRD_ALIAS_SET=1; shift 2 ;;
    --only) ONLY_TARGET="${2:-}"; shift 2 ;;
    --scope) TARGET_SCOPE="${2:-}"; shift 2 ;;
    --allow-scope-all) ALLOW_SCOPE_ALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

ONLY_TARGET="$(printf '%s' "$ONLY_TARGET" | tr '[:upper:]' '[:lower:]')"
if [ "$ONLY_TARGET" != "acc" ] && [ "$ONLY_TARGET" != "prd" ] && [ "$ONLY_TARGET" != "both" ]; then
  echo "Invalid value for --only: ${ONLY_TARGET}. Use acc|prd|both." >&2
  exit 1
fi

TARGET_SCOPE="$(printf '%s' "$TARGET_SCOPE" | tr '[:upper:]' '[:lower:]')"
if [ "$TARGET_SCOPE" != "cloud" ] && [ "$TARGET_SCOPE" != "onprem" ] && [ "$TARGET_SCOPE" != "all" ]; then
  echo "Invalid value for --scope: ${TARGET_SCOPE}. Use cloud|onprem|all." >&2
  exit 1
fi
if [ "$TARGET_SCOPE" = "all" ] && [ "$ALLOW_SCOPE_ALL" -ne 1 ]; then
  echo "Refusing --scope all without --allow-scope-all." >&2
  echo "Run one scope at a time to preserve cloud/onprem isolation." >&2
  exit 1
fi

if [ "$ACC_ALIAS_SET" -ne 1 ]; then
  if [ "$TARGET_SCOPE" = "all" ]; then
    ACC_ALIAS="acc-devadmin"
  else
    ACC_ALIAS="acc-${TARGET_SCOPE}-devadmin"
  fi
fi
if [ "$PRD_ALIAS_SET" -ne 1 ]; then
  if [ "$TARGET_SCOPE" = "all" ]; then
    PRD_ALIAS="prd-devadmin"
  else
    PRD_ALIAS="prd-${TARGET_SCOPE}-devadmin"
  fi
fi

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "${ORIG_ARGS[@]}"
fi

for cmd in ssh ssh-keygen ssh-copy-id sshpass awk sed install; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    if [ "$cmd" = "sshpass" ]; then
      echo "Install with: sudo apt-get update && sudo apt-get install -y sshpass" >&2
    fi
    exit 1
  fi
done

stored_password_for_scope_target() {
  local env_name="$1"
  load_stored_passwords
  case "${TARGET_SCOPE}:${env_name}" in
    cloud:acc) echo "${ACC_CLOUD_PASSWORD:-}" ;;
    onprem:acc) echo "${ACC_ONPREM_PASSWORD:-}" ;;
    cloud:prd) echo "${PRD_CLOUD_PASSWORD:-}" ;;
    onprem:prd) echo "${PRD_ONPREM_PASSWORD:-}" ;;
    *) echo "" ;;
  esac
}

if [ "$ONLY_TARGET" = "acc" ] || [ "$ONLY_TARGET" = "both" ]; then
  if [ -z "$ACC_HOST" ]; then
    read -r -p "ACC host (e.g. acccl.learnplay.co.za): " ACC_HOST
  fi
  if [ -z "$ACC_USER" ]; then
    read -r -p "ACC user [lppadmin]: " ACC_USER
    ACC_USER="${ACC_USER:-lppadmin}"
  fi
  if [ -z "$ACC_PASSWORD" ]; then
    ACC_PASSWORD="$(stored_password_for_scope_target acc)"
  fi
  if [ -z "$ACC_PASSWORD" ]; then
    read -r -s -p "${TARGET_SCOPE^^} ACC password for ${ACC_USER}@${ACC_HOST}: " ACC_PASSWORD
    echo ""
  fi
fi

if [ "$ONLY_TARGET" = "prd" ] || [ "$ONLY_TARGET" = "both" ]; then
  if [ -z "$PRD_HOST" ]; then
    read -r -p "PRD host (e.g. learnplay.co.za): " PRD_HOST
  fi
  if [ -z "$PRD_USER" ]; then
    read -r -p "PRD user [lppadmin]: " PRD_USER
    PRD_USER="${PRD_USER:-lppadmin}"
  fi
  if [ -z "$PRD_PASSWORD" ]; then
    PRD_PASSWORD="$(stored_password_for_scope_target prd)"
  fi
  if [ -z "$PRD_PASSWORD" ]; then
    read -r -s -p "${TARGET_SCOPE^^} PRD password for ${PRD_USER}@${PRD_HOST}: " PRD_PASSWORD
    echo ""
  fi
fi

if [ "$ONLY_TARGET" = "acc" ] && { [ -z "$ACC_HOST" ] || [ -z "$ACC_USER" ] || [ -z "$ACC_PASSWORD" ]; }; then
  echo "ACC host/user/password are required when --only acc is used." >&2
  exit 1
fi
if [ "$ONLY_TARGET" = "prd" ] && { [ -z "$PRD_HOST" ] || [ -z "$PRD_USER" ] || [ -z "$PRD_PASSWORD" ]; }; then
  echo "PRD host/user/password are required when --only prd is used." >&2
  exit 1
fi
if [ "$ONLY_TARGET" = "both" ] && { [ -z "$ACC_HOST" ] || [ -z "$ACC_USER" ] || [ -z "$ACC_PASSWORD" ] || [ -z "$PRD_HOST" ] || [ -z "$PRD_USER" ] || [ -z "$PRD_PASSWORD" ]; }; then
  echo "All ACC/PRD host/user/password fields are required." >&2
  exit 1
fi

workspace_user() {
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ] && id -u "${SUDO_USER}" >/dev/null 2>&1; then
    echo "${SUDO_USER}"
    return 0
  fi
  local owner
  owner="$(stat -c '%U' /antigravity 2>/dev/null || true)"
  if [ -n "$owner" ] && [ "$owner" != "root" ] && id -u "$owner" >/dev/null 2>&1; then
    echo "$owner"
    return 0
  fi
  echo "lppadmin"
}

WS_USER="$(workspace_user)"
WS_HOME="$(getent passwd "$WS_USER" | cut -d: -f6)"
if [ -z "$WS_HOME" ] || [ ! -d "$WS_HOME" ]; then
  echo "Unable to resolve workspace user home for user '$WS_USER'." >&2
  exit 1
fi

SSH_DIR="$WS_HOME/.ssh"
KEY_FILE="$SSH_DIR/id_ed25519_devops_automation"
KEY_PUB="$KEY_FILE.pub"
SSH_CONFIG="$SSH_DIR/config"
KNOWN_HOSTS="$SSH_DIR/known_hosts"

mkdir -p "$SSH_DIR"
touch "$SSH_CONFIG" "$KNOWN_HOSTS"
chmod 700 "$SSH_DIR"
chmod 600 "$SSH_CONFIG" "$KNOWN_HOSTS"
chown -R "$WS_USER:$WS_USER" "$SSH_DIR"

if [ ! -f "$KEY_FILE" ]; then
  sudo -u "$WS_USER" ssh-keygen -t ed25519 -N "" -f "$KEY_FILE" -C "dev-stack-automation@$(hostname -s)" >/dev/null
fi
chmod 600 "$KEY_FILE"
chmod 644 "$KEY_PUB"
chown "$WS_USER:$WS_USER" "$KEY_FILE" "$KEY_PUB"

remove_managed_block() {
  local file="$1" label="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v b="# BEGIN LEARNPLAY DEVADMIN ${label}" -v e="# END LEARNPLAY DEVADMIN ${label}" '
    $0 == b {skip=1; next}
    $0 == e {skip=0; next}
    !skip {print}
  ' "$file" > "$tmp"
  install -o "$WS_USER" -g "$WS_USER" -m 600 "$tmp" "$file"
  rm -f "$tmp"
}

append_managed_block() {
  local file="$1" label="$2" alias="$3" host="$4" user="$5"
  {
    echo "# BEGIN LEARNPLAY DEVADMIN ${label}"
    echo "Host ${alias}"
    echo "  HostName ${host}"
    echo "  User ${user}"
    echo "  IdentityFile ${KEY_FILE}"
    echo "  IdentitiesOnly yes"
    echo "  PreferredAuthentications publickey"
    echo "  PasswordAuthentication no"
    echo "  KbdInteractiveAuthentication no"
    echo "  BatchMode yes"
    echo "  ConnectTimeout 10"
    echo "# END LEARNPLAY DEVADMIN ${label}"
    echo ""
  } >> "$file"
}

configure_remote_host() {
  local label="$1" alias="$2" host="$3" user="$4" password="$5"
  local remote_tmp="/tmp/90-learnplay-devadmin-${user}"
  local remote_sudoers="/etc/sudoers.d/90-learnplay-devadmin-${user}"
  local remote_line="${user} ALL=(ALL) NOPASSWD:ALL"

  echo "Configuring ${label} (${user}@${host})..."

  sudo -u "$WS_USER" ssh-keygen -f "$KNOWN_HOSTS" -R "$host" >/dev/null 2>&1 || true
  sudo -u "$WS_USER" ssh-keygen -f "$KNOWN_HOSTS" -R "$alias" >/dev/null 2>&1 || true

  # If alias-based key auth is already healthy, do not force password bootstrap.
  # This avoids false failures when stored passwords are stale but keys/sudo are correct.
  if sudo -u "$WS_USER" ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$alias" "hostname >/dev/null" >/dev/null 2>&1 \
    && sudo -u "$WS_USER" ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$alias" "sudo -n true" >/dev/null 2>&1; then
    echo "${label} already has passwordless SSH + sudo configured via alias ${alias}; skipping password bootstrap."
    return 0
  fi

  sudo -u "$WS_USER" env SSHPASS="$password" sshpass -e ssh-copy-id \
    -i "$KEY_PUB" \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=12 \
    "${user}@${host}" >/dev/null

  printf '%s\n' "$remote_line" | sudo -u "$WS_USER" env SSHPASS="$password" sshpass -e ssh \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=12 \
    "${user}@${host}" \
    "cat > '$remote_tmp' && chmod 600 '$remote_tmp'"

  printf '%s\n' "$password" | sudo -u "$WS_USER" env SSHPASS="$password" sshpass -e ssh -tt \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=12 \
    "${user}@${host}" \
    "sudo -S -p '' install -m 0440 '$remote_tmp' '$remote_sudoers' && rm -f '$remote_tmp' && sudo -S -p '' visudo -cf '$remote_sudoers' >/dev/null" >/dev/null

  sudo -u "$WS_USER" ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$alias" "hostname >/dev/null"
  sudo -u "$WS_USER" ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$alias" "sudo -n true"
}

block_label_for_target() {
  local env_name="$1"
  if [ "$TARGET_SCOPE" = "all" ]; then
    printf '%s' "${env_name^^}"
    return 0
  fi
  printf '%s-%s' "${env_name^^}" "${TARGET_SCOPE^^}"
}

ACC_BLOCK_LABEL="$(block_label_for_target acc)"
PRD_BLOCK_LABEL="$(block_label_for_target prd)"

if [ "$ONLY_TARGET" = "acc" ] || [ "$ONLY_TARGET" = "both" ]; then
  # Clean up legacy non-scoped managed block labels from older script versions.
  remove_managed_block "$SSH_CONFIG" "ACC"
  remove_managed_block "$SSH_CONFIG" "$ACC_BLOCK_LABEL"
  append_managed_block "$SSH_CONFIG" "$ACC_BLOCK_LABEL" "$ACC_ALIAS" "$ACC_HOST" "$ACC_USER"
fi
if [ "$ONLY_TARGET" = "prd" ] || [ "$ONLY_TARGET" = "both" ]; then
  # Clean up legacy non-scoped managed block labels from older script versions.
  remove_managed_block "$SSH_CONFIG" "PRD"
  remove_managed_block "$SSH_CONFIG" "$PRD_BLOCK_LABEL"
  append_managed_block "$SSH_CONFIG" "$PRD_BLOCK_LABEL" "$PRD_ALIAS" "$PRD_HOST" "$PRD_USER"
fi
chown "$WS_USER:$WS_USER" "$SSH_CONFIG"
chmod 600 "$SSH_CONFIG"

if [ "$ONLY_TARGET" = "acc" ] || [ "$ONLY_TARGET" = "both" ]; then
  configure_remote_host "ACC" "$ACC_ALIAS" "$ACC_HOST" "$ACC_USER" "$ACC_PASSWORD"
fi
if [ "$ONLY_TARGET" = "prd" ] || [ "$ONLY_TARGET" = "both" ]; then
  configure_remote_host "PRD" "$PRD_ALIAS" "$PRD_HOST" "$PRD_USER" "$PRD_PASSWORD"
fi

mkdir -p "$TARGETS_CONF_DIR"
ACC_CLOUD_HOST_PREV=""
ACC_CLOUD_USER_PREV=""
ACC_ONPREM_HOST_PREV=""
ACC_ONPREM_USER_PREV=""
PRD_CLOUD_HOST_PREV=""
PRD_CLOUD_USER_PREV=""
PRD_ONPREM_HOST_PREV=""
PRD_ONPREM_USER_PREV=""
if [ -f "$TARGETS_CONF_FILE" ]; then
  # shellcheck disable=SC1090
  source "$TARGETS_CONF_FILE"
  ACC_CLOUD_HOST_PREV="${ACC_CLOUD_HOST:-}"
  ACC_CLOUD_USER_PREV="${ACC_CLOUD_USER:-}"
  ACC_ONPREM_HOST_PREV="${ACC_ONPREM_HOST:-}"
  ACC_ONPREM_USER_PREV="${ACC_ONPREM_USER:-}"
  PRD_CLOUD_HOST_PREV="${PRD_CLOUD_HOST:-}"
  PRD_CLOUD_USER_PREV="${PRD_CLOUD_USER:-}"
  PRD_ONPREM_HOST_PREV="${PRD_ONPREM_HOST:-}"
  PRD_ONPREM_USER_PREV="${PRD_ONPREM_USER:-}"
fi
if [ "$ONLY_TARGET" = "acc" ] || [ "$ONLY_TARGET" = "both" ]; then
  if [ "$TARGET_SCOPE" = "cloud" ] || [ "$TARGET_SCOPE" = "all" ]; then
    ACC_CLOUD_HOST_PREV="$ACC_ALIAS"
    ACC_CLOUD_USER_PREV="$ACC_USER"
  fi
  if [ "$TARGET_SCOPE" = "onprem" ] || [ "$TARGET_SCOPE" = "all" ]; then
    ACC_ONPREM_HOST_PREV="$ACC_ALIAS"
    ACC_ONPREM_USER_PREV="$ACC_USER"
  fi
fi
if [ "$ONLY_TARGET" = "prd" ] || [ "$ONLY_TARGET" = "both" ]; then
  if [ "$TARGET_SCOPE" = "cloud" ] || [ "$TARGET_SCOPE" = "all" ]; then
    PRD_CLOUD_HOST_PREV="$PRD_ALIAS"
    PRD_CLOUD_USER_PREV="$PRD_USER"
  fi
  if [ "$TARGET_SCOPE" = "onprem" ] || [ "$TARGET_SCOPE" = "all" ]; then
    PRD_ONPREM_HOST_PREV="$PRD_ALIAS"
    PRD_ONPREM_USER_PREV="$PRD_USER"
  fi
fi
cat > "$TARGETS_CONF_FILE" <<EOF
# LearnPlay devadmin environment targets
# Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
ACC_CLOUD_HOST="${ACC_CLOUD_HOST_PREV}"
ACC_CLOUD_USER="${ACC_CLOUD_USER_PREV}"
ACC_ONPREM_HOST="${ACC_ONPREM_HOST_PREV}"
ACC_ONPREM_USER="${ACC_ONPREM_USER_PREV}"
PRD_CLOUD_HOST="${PRD_CLOUD_HOST_PREV}"
PRD_CLOUD_USER="${PRD_CLOUD_USER_PREV}"
PRD_ONPREM_HOST="${PRD_ONPREM_HOST_PREV}"
PRD_ONPREM_USER="${PRD_ONPREM_USER_PREV}"
EOF
chmod 600 "$TARGETS_CONF_FILE"
save_stored_passwords

echo "SSH bootstrap complete."
if [ "$ONLY_TARGET" = "both" ]; then
  echo "Configured aliases: ${ACC_ALIAS} -> ${ACC_USER}@${ACC_HOST}, ${PRD_ALIAS} -> ${PRD_USER}@${PRD_HOST}"
elif [ "$ONLY_TARGET" = "acc" ]; then
  echo "Configured alias: ${ACC_ALIAS} -> ${ACC_USER}@${ACC_HOST}"
else
  echo "Configured alias: ${PRD_ALIAS} -> ${PRD_USER}@${PRD_HOST}"
fi
echo "Saved devadmin targets: $TARGETS_CONF_FILE"
if [ "$ONLY_TARGET" = "both" ]; then
  echo "Validated non-interactive SSH and sudo -n on both hosts."
elif [ "$ONLY_TARGET" = "acc" ]; then
  echo "Validated non-interactive SSH and sudo -n on ACC."
else
  echo "Validated non-interactive SSH and sudo -n on PRD."
fi

unset ACC_PASSWORD PRD_PASSWORD SSHPASS
