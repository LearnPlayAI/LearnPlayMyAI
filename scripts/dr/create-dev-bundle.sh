#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="/antigravity/Cloud-On-Prem"
OUTPUT_DIR_DEFAULT="/antigravity/archives"
LOG_DIR="/var/log/learnplay-admin/devadmin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POSTCHECK_SCRIPT="$SCRIPT_DIR/postcheck-dev-restore.sh"
RESTORE_SCRIPT="$SCRIPT_DIR/restore-dev-bundle.sh"

if ! mkdir -p "$LOG_DIR" 2>/dev/null || [ ! -w "$LOG_DIR" ]; then
  LOG_DIR="/tmp/learnplay-admin/devadmin"
  mkdir -p "$LOG_DIR"
fi
TS="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/create-dr-bundle-${TS}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

OUTPUT_DIR="$OUTPUT_DIR_DEFAULT"
BUNDLE_PATH=""
SCRIPTS_BUNDLE_PATH=""
INCLUDE_RAW_DB_FILES="false"
INCLUDE_LPPBACKUPS="false"
DR_BUNDLE_KEEP_COUNT="${DR_BUNDLE_KEEP_COUNT:-3}"
DR_SCRIPTS_KEEP_COUNT="${DR_SCRIPTS_KEEP_COUNT:-6}"

run_tar() {
  if [ "$(id -u)" -eq 0 ]; then
    tar "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo tar "$@"
    return
  fi
  tar "$@"
}

cleanup_stale_tmp_staging() {
  # Remove stale DR staging dirs left by interrupted runs.
  # Keep only very recent ones (younger than 6 hours).
  find /tmp -maxdepth 1 -mindepth 1 -type d \
    \( -name 'learnplay-dev-dr-bundle.*' -o -name 'learnplay-dev-dr-scripts.*' \) \
    -mmin +360 -exec rm -rf {} + 2>/dev/null || true
}

prune_archive_retention() {
  local keep_payload="${DR_BUNDLE_KEEP_COUNT}"
  local keep_scripts="${DR_SCRIPTS_KEEP_COUNT}"
  local old_files=""

  if [[ ! "$keep_payload" =~ ^[0-9]+$ ]] || [ "$keep_payload" -lt 1 ]; then
    keep_payload=3
  fi
  if [[ ! "$keep_scripts" =~ ^[0-9]+$ ]] || [ "$keep_scripts" -lt 1 ]; then
    keep_scripts=6
  fi

  old_files="$(ls -1t "$OUTPUT_DIR"/learnplay-dev-dr-bundle-*.tar.gz 2>/dev/null | tail -n +$((keep_payload + 1)) || true)"
  if [ -n "$old_files" ]; then
    echo "$old_files" | xargs -r rm -f
    echo "$old_files" | sed 's/$/.sha256/' | xargs -r rm -f
  fi

  old_files="$(ls -1t "$OUTPUT_DIR"/learnplay-dev-dr-scripts-*.tar.gz 2>/dev/null | tail -n +$((keep_scripts + 1)) || true)"
  if [ -n "$old_files" ]; then
    echo "$old_files" | xargs -r rm -f
    echo "$old_files" | sed 's/$/.sha256/' | xargs -r rm -f
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"; shift 2 ;;
    --bundle)
      BUNDLE_PATH="$2"; shift 2 ;;
    --scripts-bundle)
      SCRIPTS_BUNDLE_PATH="$2"; shift 2 ;;
    --include-raw-db-files)
      INCLUDE_RAW_DB_FILES="true"; shift ;;
    --include-lppbackups)
      INCLUDE_LPPBACKUPS="true"; shift ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1 ;;
  esac
done

if [ ! -f "$RESTORE_SCRIPT" ]; then
  echo "restore script missing: $RESTORE_SCRIPT" >&2
  exit 1
fi
if [ ! -f "$POSTCHECK_SCRIPT" ]; then
  echo "postcheck script missing: $POSTCHECK_SCRIPT" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
if [ -z "$BUNDLE_PATH" ]; then
  BUNDLE_PATH="$OUTPUT_DIR/learnplay-dev-dr-bundle-${TS}.tar.gz"
fi
if [ -z "$SCRIPTS_BUNDLE_PATH" ]; then
  SCRIPTS_BUNDLE_PATH="$OUTPUT_DIR/learnplay-dev-dr-scripts-${TS}.tar.gz"
fi

cleanup_stale_tmp_staging

STAGE_DIR="$(mktemp -d /tmp/learnplay-dev-dr-bundle.XXXXXX)"
PAYLOAD_DIR="$STAGE_DIR/payload"
mkdir -p "$PAYLOAD_DIR"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "Creating DR bundle staging at: $STAGE_DIR"

HOSTNAME_FQDN="$(hostname -f 2>/dev/null || hostname)"
ETH0_IP="$(ip -4 -o addr show dev eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || true)"
if [ -z "$ETH0_IP" ]; then
  ETH0_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
fi

CLOUD_BASE_URL="$(grep -E '^BASE_URL=' /opt/learnplay/cloud/.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
ONPREM_BASE_URL="$(grep -E '^BASE_URL=' /opt/learnplay/onprem/.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"

if command -v dpkg-query >/dev/null 2>&1; then
  dpkg-query -W -f='${Package}\t${Status}\n' | awk '$4=="installed" {print $1}' | sort -u > "$PAYLOAD_DIR/installed-packages.txt"
else
  : > "$PAYLOAD_DIR/installed-packages.txt"
fi

cat > "$PAYLOAD_DIR/required-packages.txt" <<'PKGS'
ca-certificates
build-essential
certbot
curl
dialog
gnupg2
git
jq
libreoffice-impress
lsb-release
nginx
nodejs
npm
openssl
poppler-utils
postgresql
postgresql-contrib
postgresql-client
python3-certbot-nginx
rsync
software-properties-common
tar
unzip
wget
whiptail
zip
PKGS

{
  echo "hostname=${HOSTNAME_FQDN}"
  echo "eth0_ip=${ETH0_IP:-unknown}"
  echo "node=$(node -v 2>/dev/null || echo unknown)"
  echo "npm=$(npm -v 2>/dev/null || echo unknown)"
  echo "nginx=$(nginx -v 2>&1 | sed -n 's#.*nginx/\([^ ]*\).*#\1#p' | head -1 || echo unknown)"
  echo "postgresql=$(psql --version 2>/dev/null | awk '{print $3}' | head -1 || echo unknown)"
  echo "lppadmin=$(grep -E '^LPPADMIN_VERSION=' /opt/learnplay/cloud/scripts/lppadmin.sh 2>/dev/null | head -1 | cut -d'"' -f2 || echo unknown)"
  echo "devadmin=$(grep -E '^DEVADMIN_VERSION=' /antigravity/devadmin.sh 2>/dev/null | head -1 | cut -d'"' -f2 || echo unknown)"
} > "$PAYLOAD_DIR/runtime-versions.txt"

if command -v psql >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  echo "Creating PostgreSQL logical backup..."
  if sudo -u postgres pg_dumpall --clean --if-exists | gzip -c > "$PAYLOAD_DIR/postgres.sql.gz"; then
    echo "PostgreSQL backup created."
  else
    echo "WARN: PostgreSQL dump failed; creating empty placeholder."
    : > "$PAYLOAD_DIR/postgres.sql.gz"
  fi
else
  echo "WARN: PostgreSQL tools/user unavailable; creating empty placeholder."
  : > "$PAYLOAD_DIR/postgres.sql.gz"
fi

if [ -d /antigravity ]; then
  run_tar czf "$PAYLOAD_DIR/antigravity.tar.gz" \
    -C / \
    --exclude='antigravity/archives' \
    --exclude='antigravity/cutover-logs' \
    --exclude='antigravity/.cache' \
    --exclude='antigravity/Cloud-On-Prem/learnplay-*.tar.gz' \
    --exclude='antigravity/Cloud-On-Prem/learnplay-*.tar.gz.sha256' \
    --exclude='antigravity/Cloud-On-Prem/learnplay-cloud.tar.gz' \
    --exclude='antigravity/Cloud-On-Prem/learnplay-onprem.tar.gz' \
    antigravity
fi

collect_required_secrets() {
  local env_file="$1"
  local out_file="$2"
  local secret_rx='(SECRET|TOKEN|API_KEY|PRIVATE_KEY|PASSWORD|PASS|WEBHOOK|DATABASE_URL|SMTP_|MAILERSEND|STRIPE_|YOCO_|OPENAI|GEMINI|ANTHROPIC|AWS_|GCP_|S3_|JWT|OAUTH|CLIENT_SECRET|CERT|ENCRYPTION_KEY|VAPID)'
  : > "$out_file"
  if [ ! -f "$env_file" ]; then
    return 0
  fi
  local line k v pending
  local -A found

  pending=""
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*# ]] || [ -z "$line" ]; then
      continue
    fi
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      k="${BASH_REMATCH[1]}"
      v="${BASH_REMATCH[2]}"
      if [[ "$k" =~ $secret_rx ]]; then
        if [ -n "$v" ]; then
          found["$k"]="$v"
          pending=""
        else
          pending="$k"
        fi
      else
        pending=""
      fi
      continue
    fi
    if [ -n "$pending" ] && [ -z "${found[$pending]:-}" ]; then
      # Handle malformed split values like:
      # KEY=
      # actual_value
      found["$pending"]="$line"
      pending=""
    fi
  done < "$env_file"

  for k in "${!found[@]}"; do
    if [ -n "${found[$k]:-}" ]; then
      printf '%s=%s\n' "$k" "${found[$k]}"
    fi
  done | sort > "$out_file"
}

collect_required_secrets /opt/learnplay/cloud/.env "$PAYLOAD_DIR/cloud-required-secrets.env"
collect_required_secrets /opt/learnplay/onprem/.env "$PAYLOAD_DIR/onprem-required-secrets.env"

if [ -d /opt/learnplay ]; then
  run_tar czf "$PAYLOAD_DIR/opt-learnplay.tar.gz" \
    -C / \
    --exclude='opt/learnplay/lost+found' \
    opt/learnplay
fi
if [ "$INCLUDE_RAW_DB_FILES" = "true" ] && [ -d /opt/lpdb ]; then
  run_tar czf "$PAYLOAD_DIR/opt-lpdb.tar.gz" \
    -C / \
    --exclude='opt/lpdb/lost+found' \
    opt/lpdb
fi
if [ "$INCLUDE_LPPBACKUPS" = "true" ] && [ -d /lppbackups ]; then
  run_tar czf "$PAYLOAD_DIR/lppbackups.tar.gz" -C / lppbackups
fi

ETC_LIST=(
  /etc/nginx
  /etc/ssl/learnplay
  /etc/systemd/system/learnplay-cloud.service
  /etc/systemd/system/learnplay-onprem.service
  /etc/systemd/system/multi-user.target.wants/learnplay-cloud.service
  /etc/systemd/system/multi-user.target.wants/learnplay-onprem.service
  /etc/sudoers.d
  /etc/ssh
)
ETC_FOUND=()
for p in "${ETC_LIST[@]}"; do
  if [ -e "$p" ]; then
    ETC_FOUND+=("${p#/}")
  fi
done
if [ "${#ETC_FOUND[@]}" -gt 0 ]; then
  run_tar czf "$PAYLOAD_DIR/etc-selected.tar.gz" -C / "${ETC_FOUND[@]}"
fi

if [ -d /home/lppadmin/.ssh ]; then
  run_tar czf "$PAYLOAD_DIR/home-lppadmin-ssh.tar.gz" -C /home/lppadmin .ssh
fi
if [ -d /root/.ssh ]; then
  run_tar czf "$PAYLOAD_DIR/root-ssh.tar.gz" -C /root .ssh
fi

cp "$RESTORE_SCRIPT" "$STAGE_DIR/restore-dev-bundle.sh"
cp "$POSTCHECK_SCRIPT" "$STAGE_DIR/postcheck-dev-restore.sh"
chmod +x "$STAGE_DIR/restore-dev-bundle.sh" "$STAGE_DIR/postcheck-dev-restore.sh"

(
  cd "$STAGE_DIR"
  find payload -type f -print0 | sort -z | xargs -0 sha256sum > checksums.sha256
)

cat > "$STAGE_DIR/manifest.json" <<JSON
{
  "bundleType": "learnplay-dev-disaster-recovery",
  "bundleVersion": "1",
  "createdAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sourceHost": "${HOSTNAME_FQDN}",
  "sourceEth0Ip": "${ETH0_IP:-}",
  "workspaceRoot": "${WORKSPACE_ROOT}",
  "defaultCloudBaseUrl": "${CLOUD_BASE_URL}",
  "defaultOnPremBaseUrl": "${ONPREM_BASE_URL}",
  "includeRawDbFiles": "${INCLUDE_RAW_DB_FILES}",
  "includeLppBackups": "${INCLUDE_LPPBACKUPS}",
  "notes": "Hostname is NOT rewritten during restore. /etc/hosts and env/nginx are remapped for DR inputs."
}
JSON

(
  cd "$STAGE_DIR"
  tar czf "$BUNDLE_PATH" .
)
(
  cd "$(dirname "$BUNDLE_PATH")"
  sha256sum "$(basename "$BUNDLE_PATH")" > "${BUNDLE_PATH}.sha256"
)

# Separate scripts-only bundle for fast extraction/execution on target hosts.
SCRIPTS_STAGE_DIR="$(mktemp -d /tmp/learnplay-dev-dr-scripts.XXXXXX)"
trap 'rm -rf "$STAGE_DIR" "$SCRIPTS_STAGE_DIR"' EXIT
cp "$RESTORE_SCRIPT" "$SCRIPTS_STAGE_DIR/restore-dev-bundle.sh"
cp "$POSTCHECK_SCRIPT" "$SCRIPTS_STAGE_DIR/postcheck-dev-restore.sh"
chmod +x "$SCRIPTS_STAGE_DIR/restore-dev-bundle.sh" "$SCRIPTS_STAGE_DIR/postcheck-dev-restore.sh"
cat > "$SCRIPTS_STAGE_DIR/README.txt" <<'TXT'
LearnPlay DR Scripts Bundle

1) Extract this bundle on DR host.
2) Ensure DR payload bundle exists on host (usually /tmp or current dir).
3) Run:
   sudo bash restore-dev-bundle.sh

The restore script auto-detects the latest learnplay-dev-dr-bundle-*.tar.gz
in current dir, /tmp/dr-restorefiles, /tmp, and /antigravity/archives.
TXT
(
  cd "$SCRIPTS_STAGE_DIR"
  tar czf "$SCRIPTS_BUNDLE_PATH" .
)
(
  cd "$(dirname "$SCRIPTS_BUNDLE_PATH")"
  sha256sum "$(basename "$SCRIPTS_BUNDLE_PATH")" > "${SCRIPTS_BUNDLE_PATH}.sha256"
)

echo
echo "DR bundle created successfully"
echo "Bundle:   $BUNDLE_PATH"
echo "Checksum: ${BUNDLE_PATH}.sha256"
echo "Scripts bundle:   $SCRIPTS_BUNDLE_PATH"
echo "Scripts checksum: ${SCRIPTS_BUNDLE_PATH}.sha256"
echo "Log:      $LOG_FILE"

prune_archive_retention
