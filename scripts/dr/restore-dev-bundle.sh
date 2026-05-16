#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/learnplay-admin/devadmin"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/restore-dr-bundle-${TS}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

BUNDLE_PATH=""
CLOUD_FQDN=""
ONPREM_FQDN=""
CLOUD_IP=""
ONPREM_IP=""
NON_INTERACTIVE="false"

usage() {
  cat <<USAGE
Usage:
  sudo bash restore-dev-bundle.sh [--bundle /path/to/learnplay-dev-dr-bundle-*.tar.gz] [options]

Options:
  --cloud-fqdn <fqdn>
  --onprem-fqdn <fqdn>
  --cloud-ip <ip>
  --onprem-ip <ip>
  --non-interactive
Notes:
  If --bundle is omitted, the script auto-detects the latest DR payload bundle.
USAGE
}

find_latest_bundle() {
  local candidates=()
  local found=""

  # Search current directory first, then common transfer/staging locations.
  while IFS= read -r line; do candidates+=("$line"); done < <(ls -1t ./learnplay-dev-dr-bundle-*.tar.gz 2>/dev/null || true)
  while IFS= read -r line; do candidates+=("$line"); done < <(ls -1t /tmp/dr-restorefiles/learnplay-dev-dr-bundle-*.tar.gz 2>/dev/null || true)
  while IFS= read -r line; do candidates+=("$line"); done < <(ls -1t /tmp/learnplay-dev-dr-bundle-*.tar.gz 2>/dev/null || true)
  while IFS= read -r line; do candidates+=("$line"); done < <(ls -1t /antigravity/archives/learnplay-dev-dr-bundle-*.tar.gz 2>/dev/null || true)

  if [ "${#candidates[@]}" -gt 0 ]; then
    found="${candidates[0]}"
  fi
  printf '%s' "$found"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE_PATH="$2"; shift 2 ;;
    --cloud-fqdn) CLOUD_FQDN="$2"; shift 2 ;;
    --onprem-fqdn) ONPREM_FQDN="$2"; shift 2 ;;
    --cloud-ip) CLOUD_IP="$2"; shift 2 ;;
    --onprem-ip) ONPREM_IP="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

if [ -z "$BUNDLE_PATH" ]; then
  BUNDLE_PATH="$(find_latest_bundle)"
  if [ -n "$BUNDLE_PATH" ]; then
    echo "Auto-detected bundle: $BUNDLE_PATH"
  fi
fi

if [ -z "$BUNDLE_PATH" ] || [ ! -f "$BUNDLE_PATH" ]; then
  echo "Bundle file not found. Provide --bundle <file> or place a bundle in current dir or /tmp." >&2
  exit 1
fi

OS_HOSTNAME="$(hostname -s 2>/dev/null || hostname)"
OS_HOSTNAME_FQDN="$(hostname -f 2>/dev/null || hostname)"
ETH0_IP="$(ip -4 -o addr show dev eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || true)"
if [ -z "$ETH0_IP" ]; then
  ETH0_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' || true)"
fi

echo "Restore target host: $OS_HOSTNAME_FQDN"
echo "Detected eth0/default IPv4: ${ETH0_IP:-unknown}"

prompt_if_empty() {
  local var_name="$1"
  local prompt="$2"
  local default_val="${3:-}"
  local current_val
  current_val="${!var_name:-}"
  if [ -n "$current_val" ]; then
    return 0
  fi
  if [ "$NON_INTERACTIVE" = "true" ]; then
    echo "Missing required argument in non-interactive mode: $var_name" >&2
    exit 1
  fi
  local input
  read -rp "$prompt${default_val:+ [$default_val]}: " input
  input="${input:-$default_val}"
  if [ -z "$input" ]; then
    echo "Value required: $var_name" >&2
    exit 1
  fi
  printf -v "$var_name" '%s' "$input"
}

TMP_DIR="$(mktemp -d /tmp/learnplay-dr-restore.XXXXXX)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar xzf "$BUNDLE_PATH" -C "$TMP_DIR"

if [ ! -f "$TMP_DIR/manifest.json" ] || [ ! -f "$TMP_DIR/checksums.sha256" ]; then
  echo "Invalid bundle: missing manifest/checksums" >&2
  exit 1
fi

(
  cd "$TMP_DIR"
  sha256sum -c checksums.sha256
)

DEFAULT_CLOUD_FQDN="$(sed -n 's/.*"defaultCloudBaseUrl"[[:space:]]*:[[:space:]]*"https:\/\/\([^"]*\)".*/\1/p' "$TMP_DIR/manifest.json" | head -1 || true)"
DEFAULT_ONPREM_FQDN="$(sed -n 's/.*"defaultOnPremBaseUrl"[[:space:]]*:[[:space:]]*"https:\/\/\([^"]*\)".*/\1/p' "$TMP_DIR/manifest.json" | head -1 || true)"

prompt_if_empty CLOUD_FQDN "Cloud FQDN (also cloud BASE_URL host)" "$DEFAULT_CLOUD_FQDN"
prompt_if_empty ONPREM_FQDN "OnPrem FQDN (also onprem BASE_URL host)" "$DEFAULT_ONPREM_FQDN"
prompt_if_empty CLOUD_IP "Cloud IP to map in /etc/hosts" "${ETH0_IP:-}"
prompt_if_empty ONPREM_IP "OnPrem IP to map in /etc/hosts" "${ETH0_IP:-}"

echo "Using restore inputs:"
echo "  cloud_fqdn=$CLOUD_FQDN"
echo "  onprem_fqdn=$ONPREM_FQDN"
echo "  cloud_ip=$CLOUD_IP"
echo "  onprem_ip=$ONPREM_IP"

essential_packages_file="$TMP_DIR/payload/required-packages.txt"
if [ -f "$essential_packages_file" ]; then
  echo "Installing essential packages..."
  apt-get update -y
  xargs -r apt-get install -y --no-install-recommends < "$essential_packages_file" || true
fi

restore_tar_if_exists() {
  local tarfile="$1"
  local desc="$2"
  if [ -f "$tarfile" ]; then
    echo "Restoring ${desc} from $(basename "$tarfile")"
    tar xzf "$tarfile" -C /
  fi
}

restore_tar_if_exists "$TMP_DIR/payload/antigravity.tar.gz" "workspace"
restore_tar_if_exists "$TMP_DIR/payload/opt-learnplay.tar.gz" "runtime app tree"
restore_tar_if_exists "$TMP_DIR/payload/opt-lpdb.tar.gz" "lpdb tree"
restore_tar_if_exists "$TMP_DIR/payload/lppbackups.tar.gz" "backup repository"
restore_tar_if_exists "$TMP_DIR/payload/etc-selected.tar.gz" "selected /etc configs"
restore_tar_if_exists "$TMP_DIR/payload/home-lppadmin-ssh.tar.gz" "lppadmin SSH keys"
restore_tar_if_exists "$TMP_DIR/payload/root-ssh.tar.gz" "root SSH keys"

overlay_runtime_from_workspace_dist() {
  local variant="$1"
  local dist_root="/antigravity/Cloud-On-Prem/dist-${variant}"
  local runtime_root="/opt/learnplay/${variant}"
  if [ ! -d "$dist_root" ] || [ ! -d "$runtime_root" ]; then
    return 0
  fi

  echo "Overlaying ${variant} runtime from workspace dist (${dist_root})"
  if [ -d "${dist_root}/server" ]; then
    rsync -a --delete "${dist_root}/server/" "${runtime_root}/server/"
  fi
  if [ -d "${dist_root}/client" ]; then
    rsync -a --delete "${dist_root}/client/" "${runtime_root}/client/"
  fi
  if [ -d "${dist_root}/scripts" ]; then
    rsync -a "${dist_root}/scripts/" "${runtime_root}/scripts/"
  fi
  if [ -d "${dist_root}/migrations" ]; then
    rsync -a "${dist_root}/migrations/" "${runtime_root}/migrations/"
  fi
  for f in package.json package-lock.json version.json release-manifest.json package-checksums.sha256 package-inventory.txt ecosystem.config.cjs; do
    if [ -f "${dist_root}/${f}" ]; then
      cp -f "${dist_root}/${f}" "${runtime_root}/${f}"
    fi
  done
}

overlay_runtime_from_workspace_dist "cloud"
overlay_runtime_from_workspace_dist "onprem"

if [ -d /home/lppadmin/.ssh ]; then
  chown -R lppadmin:lppadmin /home/lppadmin/.ssh || true
  chmod 700 /home/lppadmin/.ssh || true
  find /home/lppadmin/.ssh -type f -exec chmod 600 {} \; || true
fi
if [ -d /root/.ssh ]; then
  chmod 700 /root/.ssh || true
  find /root/.ssh -type f -exec chmod 600 {} \; || true
fi

# Ensure lpdb layout exists even when raw DB files are not bundled.
mkdir -p /opt/lpdb/cloud /opt/lpdb/onprem /opt/lpdb/shared || true

if [ -f "$TMP_DIR/payload/postgres.sql.gz" ] && [ -s "$TMP_DIR/payload/postgres.sql.gz" ]; then
  echo "Restoring PostgreSQL logical backup..."
  systemctl enable --now postgresql || true
  gunzip -c "$TMP_DIR/payload/postgres.sql.gz" \
    | awk '
        # Never alter/drop/create postgres role on target host.
        /^[[:space:]]*(DROP|CREATE|ALTER)[[:space:]]+ROLE[[:space:]].*("?postgres"?)([[:space:];]|$)/ { next }
        { print }
      ' \
    | sudo -u postgres psql postgres || true
fi

set_env_key() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  [ -f "$env_file" ] || return 0
  # Normalize pre-quoted values from secrets files before storing.
  value="$(printf "%s" "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  local stored_value
  # Keep simple values unquoted so downstream tools that read KEY=... lines
  # without shell evaluation still work (for example DATABASE_URL checks).
  if [[ "$value" =~ ^[A-Za-z0-9_./:@%+=,\-]+$ ]]; then
    stored_value="$value"
  else
    local escaped
    escaped="$(printf "%s" "$value" | sed "s/'/'\\\\''/g")"
    stored_value="'$escaped'"
  fi
  local tmpf
  tmpf="$(mktemp)"
  awk -v k="$key" '$0 !~ ("^" k "=") { print }' "$env_file" > "$tmpf"
  printf "%s=%s\n" "$key" "$stored_value" >> "$tmpf"
  cat "$tmpf" > "$env_file"
  rm -f "$tmpf"
}

sanitize_env_file() {
  local env_file="$1"
  [ -f "$env_file" ] || return 0
  local tmpf
  tmpf="$(mktemp)"
  awk '
    /^[[:space:]]*$/ { print; next }
    /^[[:space:]]*#/ { print; next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ { print; next }
    { next }
  ' "$env_file" > "$tmpf"
  cat "$tmpf" > "$env_file"
  rm -f "$tmpf"
}

apply_required_secrets() {
  local target_env="$1"
  local secrets_file="$2"
  [ -f "$target_env" ] || return 0
  [ -f "$secrets_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    local key value
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      set_env_key "$target_env" "$key" "$value"
    fi
  done < "$secrets_file"
}

CLOUD_ENV="/opt/learnplay/cloud/.env"
ONPREM_ENV="/opt/learnplay/onprem/.env"

if [ -f "$CLOUD_ENV" ]; then
  set_env_key "$CLOUD_ENV" "BASE_URL" "https://${CLOUD_FQDN}"
  set_env_key "$CLOUD_ENV" "FRONTEND_URL" "https://${CLOUD_FQDN}"
  set_env_key "$CLOUD_ENV" "VITE_DOMAIN" "https://${CLOUD_FQDN}"
  set_env_key "$CLOUD_ENV" "SESSION_COOKIE_DOMAIN" "$CLOUD_FQDN"
fi
if [ -f "$ONPREM_ENV" ]; then
  set_env_key "$ONPREM_ENV" "BASE_URL" "https://${ONPREM_FQDN}"
  set_env_key "$ONPREM_ENV" "FRONTEND_URL" "https://${ONPREM_FQDN}"
  set_env_key "$ONPREM_ENV" "VITE_DOMAIN" "https://${ONPREM_FQDN}"
  set_env_key "$ONPREM_ENV" "SESSION_COOKIE_DOMAIN" "$ONPREM_FQDN"
fi

apply_required_secrets "$CLOUD_ENV" "$TMP_DIR/payload/cloud-required-secrets.env"
apply_required_secrets "$ONPREM_ENV" "$TMP_DIR/payload/onprem-required-secrets.env"
sanitize_env_file "$CLOUD_ENV"
sanitize_env_file "$ONPREM_ENV"

service_user_for_unit() {
  local unit="$1"
  local u
  u="$(awk -F= '$1=="User"{print $2; exit}' "$unit" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -n "$u" ] && id "$u" >/dev/null 2>&1; then
    echo "$u"
    return 0
  fi
  echo "lppadmin"
}

fix_env_permissions() {
  local env_file="$1"
  local owner="$2"
  [ -f "$env_file" ] || return 0
  chown "$owner:$owner" "$env_file" 2>/dev/null || true
  chmod 0640 "$env_file" 2>/dev/null || true
}

fix_runtime_permissions() {
  local runtime_root="$1"
  local owner="$2"
  [ -d "$runtime_root" ] || return 0
  # Runtime metadata must be readable by the service user.
  for f in .runtime-identity.json .release-provenance.json version.json release-manifest.json package-checksums.sha256 package-inventory.txt; do
    if [ -f "${runtime_root}/${f}" ]; then
      chown "$owner:$owner" "${runtime_root}/${f}" 2>/dev/null || true
      chmod 0644 "${runtime_root}/${f}" 2>/dev/null || true
    fi
  done
  if [ -d "${runtime_root}/uploads" ]; then
    chown -R "$owner:$owner" "${runtime_root}/uploads" 2>/dev/null || true
    chmod -R u+rwX,go+rX "${runtime_root}/uploads" 2>/dev/null || true
  fi
}

CLOUD_APP_USER="$(service_user_for_unit /etc/systemd/system/learnplay-cloud.service)"
ONPREM_APP_USER="$(service_user_for_unit /etc/systemd/system/learnplay-onprem.service)"
fix_env_permissions "$CLOUD_ENV" "$CLOUD_APP_USER"
fix_env_permissions "$ONPREM_ENV" "$ONPREM_APP_USER"
fix_runtime_permissions "/opt/learnplay/cloud" "$CLOUD_APP_USER"
fix_runtime_permissions "/opt/learnplay/onprem" "$ONPREM_APP_USER"

update_nginx_server_name() {
  local conf="$1"
  local fqdn="$2"
  [ -f "$conf" ] || return 0
  sed -i -E "s@^[[:space:]]*server_name[[:space:]]+[^;]*;@    server_name ${fqdn};@" "$conf" || true
}

update_nginx_server_name /etc/nginx/sites-available/learnplay-cloud.conf "$CLOUD_FQDN"
update_nginx_server_name /etc/nginx/sites-available/learnplay-onprem.conf "$ONPREM_FQDN"

update_nginx_listen_ip() {
  local conf="$1"
  local ip="$2"
  [ -f "$conf" ] || return 0
  [ -n "$ip" ] || return 0
  # Enforce DR-provided bind IPs for both HTTP and HTTPS listeners.
  sed -i -E "s@^[[:space:]]*listen[[:space:]]+[0-9.]+:80;@    listen ${ip}:80;@" "$conf" || true
  sed -i -E "s@^[[:space:]]*listen[[:space:]]+80;@    listen ${ip}:80;@" "$conf" || true
  sed -i -E "s@^[[:space:]]*listen[[:space:]]+[0-9.]+:443[[:space:]]+ssl[[:space:]]+http2;@    listen ${ip}:443 ssl http2;@" "$conf" || true
  sed -i -E "s@^[[:space:]]*listen[[:space:]]+443[[:space:]]+ssl[[:space:]]+http2;@    listen ${ip}:443 ssl http2;@" "$conf" || true
}

update_nginx_listen_ip /etc/nginx/sites-available/learnplay-cloud.conf "$CLOUD_IP"
update_nginx_listen_ip /etc/nginx/sites-available/learnplay-onprem.conf "$ONPREM_IP"

configure_nginx_tls_self_signed() {
  local conf="$1"
  local cert_name="$2"
  [ -f "$conf" ] || return 0
  if ! command -v openssl >/dev/null 2>&1; then
    echo "WARN: openssl not found; skipping self-signed cert generation for: $conf"
    return 0
  fi
  mkdir -p /etc/ssl/learnplay
  local cert="/etc/ssl/learnplay/${cert_name}.crt"
  local key="/etc/ssl/learnplay/${cert_name}.key"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout "$key" -out "$cert" -subj "/CN=${cert_name}" >/dev/null 2>&1 || true
  chmod 600 "$key" 2>/dev/null || true
  chmod 644 "$cert" 2>/dev/null || true
  sed -i -E "s@^[[:space:]]*ssl_certificate[[:space:]]+[^;]+;@    ssl_certificate ${cert};@" "$conf" || true
  sed -i -E "s@^[[:space:]]*ssl_certificate_key[[:space:]]+[^;]+;@    ssl_certificate_key ${key};@" "$conf" || true
  echo "Configured self-signed TLS cert for ${conf} -> ${cert_name}"
}

# Avoid duplicate default_server conflicts from stock Ubuntu nginx site.
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
# Recreate expected site links deterministically.
for conf in 00-default-deny.conf learnplay-cloud.conf learnplay-onprem.conf; do
  if [ -f "/etc/nginx/sites-available/${conf}" ]; then
    ln -sfn "/etc/nginx/sites-available/${conf}" "/etc/nginx/sites-enabled/${conf}"
  fi
done

configure_nginx_tls_self_signed /etc/nginx/sites-available/00-default-deny.conf learnplay-default
configure_nginx_tls_self_signed /etc/nginx/sites-available/learnplay-cloud.conf "$CLOUD_FQDN"
configure_nginx_tls_self_signed /etc/nginx/sites-available/learnplay-onprem.conf "$ONPREM_FQDN"

patch_unit_execstart_for_node() {
  local unit_file="$1"
  local env_file="$2"
  [ -f "$unit_file" ] || return 0
  # Make services work on clean OS images with or without NVM.
  local cmd="ExecStart=/bin/bash -lc 'set -a; source ${env_file}; set +a; if [ -s ~/.nvm/nvm.sh ]; then source ~/.nvm/nvm.sh && nvm use 20 >/dev/null; fi; exec node server/index.js'"
  local tmpf
  tmpf="$(mktemp)"
  awk -v c="$cmd" '{ if ($0 ~ /^ExecStart=/) print c; else print }' "$unit_file" > "$tmpf"
  cat "$tmpf" > "$unit_file"
  rm -f "$tmpf"
}

patch_unit_execstart_for_node /etc/systemd/system/learnplay-cloud.service /opt/learnplay/cloud/.env
patch_unit_execstart_for_node /etc/systemd/system/learnplay-onprem.service /opt/learnplay/onprem/.env

HOSTS_FILE="/etc/hosts"
BEGIN_MARK="# BEGIN LEARNPLAY_DR_MAPPING"
END_MARK="# END LEARNPLAY_DR_MAPPING"

if grep -q "$BEGIN_MARK" "$HOSTS_FILE"; then
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    $0==b {skip=1; next}
    $0==e {skip=0; next}
    skip==0 {print}
  ' "$HOSTS_FILE" > "${HOSTS_FILE}.tmp"
  mv "${HOSTS_FILE}.tmp" "$HOSTS_FILE"
fi

{
  echo "$BEGIN_MARK"
  echo "127.0.1.1 ${OS_HOSTNAME} ${OS_HOSTNAME_FQDN}"
  if [ -n "$ETH0_IP" ]; then
    echo "${ETH0_IP} ${OS_HOSTNAME} ${OS_HOSTNAME_FQDN}"
  fi
  echo "${CLOUD_IP} ${CLOUD_FQDN}"
  echo "${ONPREM_IP} ${ONPREM_FQDN}"
  echo "$END_MARK"
} >> "$HOSTS_FILE"

configure_ip_aliases() {
  local cloud_ip="$1"
  local onprem_ip="$2"
  local iface prefix
  iface="$(ip route show default 2>/dev/null | awk '{print $5; exit}')"
  [ -n "$iface" ] || iface="eth0"
  prefix="$(ip -4 -o addr show dev "$iface" scope global 2>/dev/null | awk 'NR==1{split($4,a,"/"); print a[2]}')"
  [ -n "$prefix" ] || prefix="24"

  mkdir -p /usr/local/bin
  cat > /usr/local/bin/learnplay-dr-ip-aliases.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
IFACE="${iface}"
PREFIX="${prefix}"
for ip in "${cloud_ip}" "${onprem_ip}"; do
  [ -n "\$ip" ] || continue
  if ! ip -4 -o addr show dev "\$IFACE" | awk '{print \$4}' | cut -d/ -f1 | grep -qx "\$ip"; then
    ip addr add "\${ip}/\${PREFIX}" dev "\$IFACE" 2>/dev/null || true
  fi
done
EOF
  chmod 0755 /usr/local/bin/learnplay-dr-ip-aliases.sh

  cat > /etc/systemd/system/learnplay-dr-ip-aliases.service <<'EOF'
[Unit]
Description=LearnPlay DR IP Alias Configuration
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/learnplay-dr-ip-aliases.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload || true
  systemctl enable learnplay-dr-ip-aliases.service || true
  /usr/local/bin/learnplay-dr-ip-aliases.sh || true
}

configure_ip_aliases "$CLOUD_IP" "$ONPREM_IP"

if [ -f /antigravity/devadmin.sh ]; then
  chmod 0755 /antigravity/devadmin.sh || true
  ln -sfn /antigravity/devadmin.sh /usr/local/bin/devadmin
fi
if [ -f /opt/learnplay/cloud/scripts/lppadmin.sh ]; then
  chmod 0755 /opt/learnplay/cloud/scripts/lppadmin.sh || true
  ln -sfn /opt/learnplay/cloud/scripts/lppadmin.sh /usr/local/bin/lppadmin
elif [ -f /opt/learnplay/onprem/scripts/lppadmin.sh ]; then
  chmod 0755 /opt/learnplay/onprem/scripts/lppadmin.sh || true
  ln -sfn /opt/learnplay/onprem/scripts/lppadmin.sh /usr/local/bin/lppadmin
fi

systemctl daemon-reload || true
if systemctl show nginx.service -p LoadState --value 2>/dev/null | grep -qv '^not-found$'; then
  systemctl enable nginx || true
fi
if systemctl show postgresql.service -p LoadState --value 2>/dev/null | grep -qv '^not-found$'; then
  systemctl enable postgresql || true
fi
# Keep firewalling disabled on restored DEV stack hosts.
if systemctl show ufw.service -p LoadState --value 2>/dev/null | grep -qv '^not-found$'; then
  systemctl disable --now ufw || true
  systemctl mask ufw || true
fi
if command -v nft >/dev/null 2>&1; then
  nft flush ruleset || true
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -P INPUT ACCEPT || true
  iptables -P FORWARD ACCEPT || true
  iptables -P OUTPUT ACCEPT || true
  iptables -F || true
fi
systemctl restart postgresql || true
if nginx -t >/tmp/learnplay-dr-nginx-test.log 2>&1; then
  systemctl restart nginx || true
else
  echo "WARN: nginx config test failed; see /tmp/learnplay-dr-nginx-test.log"
fi

start_service_with_diag() {
  local svc="$1"
  if systemctl show "${svc}.service" -p LoadState --value 2>/dev/null | grep -qv '^not-found$'; then
    systemctl enable "$svc" || true
    if ! systemctl restart "$svc"; then
      echo "WARN: failed to start ${svc}; dumping diagnostics"
      systemctl --no-pager --full status "$svc" || true
      journalctl -u "$svc" -n 80 --no-pager || true
    fi
    for _ in $(seq 1 90); do
      local st
      st="$(systemctl is-active "$svc" 2>/dev/null || true)"
      if [ "$st" = "active" ]; then
        break
      fi
      if [ "$st" = "failed" ]; then
        echo "WARN: ${svc} entered failed state after restart"
        systemctl --no-pager --full status "$svc" || true
        journalctl -u "$svc" -n 80 --no-pager || true
        break
      fi
      sleep 2
    done
  fi
}

start_service_with_diag learnplay-cloud
start_service_with_diag learnplay-onprem

wait_for_port_listen() {
  local name="$1"
  local port="$2"
  local svc="$3"
  local tries="${4:-40}"
  local delay="${5:-2}"
  local st
  for _ in $(seq 1 "$tries"); do
    if ss -ltn "( sport = :${port} )" 2>/dev/null | grep -q LISTEN; then
      echo "OK: ${name} port ${port} is listening"
      return 0
    fi
    st="$(systemctl is-active "$svc" 2>/dev/null || true)"
    if [ "$st" = "failed" ]; then
      break
    fi
    sleep "$delay"
  done
  echo "WARN: ${name} port ${port} is not listening"
  systemctl --no-pager --full status "$svc" || true
  journalctl -u "$svc" -n 120 --no-pager || true
  return 1
}

wait_for_port_listen "Cloud app" 8000 learnplay-cloud 40 2 || true
wait_for_port_listen "OnPrem app" 9000 learnplay-onprem 40 2 || true

check_url_availability() {
  local name="$1"
  local url="$2"
  local attempts="${3:-30}"
  local delay="${4:-2}"
  local code
  for _ in $(seq 1 "$attempts"); do
    code="$(curl -k -sS -o /dev/null -w '%{http_code}' "$url" || true)"
    case "$code" in
      200|201|202|204|301|302|303|307|308)
        echo "OK: ${name} reachable (${url}) [HTTP ${code}]"
        return 0
        ;;
    esac
    sleep "$delay"
  done
  echo "WARN: ${name} not reachable after retries (${url})"
  return 1
}

check_url_availability "Cloud URL" "https://${CLOUD_FQDN}" 30 2 || true
check_url_availability "OnPrem URL" "https://${ONPREM_FQDN}" 30 2 || true

# Ensure runtime lppadmin command points to installed-runtime path.
if [ -L /usr/local/bin/lppadmin ] || [ -f /usr/local/bin/lppadmin ]; then
  readlink -f /usr/local/bin/lppadmin || true
fi

if [ -x /antigravity/scripts/dr/postcheck-dev-restore.sh ]; then
  /antigravity/scripts/dr/postcheck-dev-restore.sh || true
fi

echo ""
echo "DR restore completed."
echo "Hostname unchanged: ${OS_HOSTNAME_FQDN}"
echo "Updated hosts mapping for cloud/onprem FQDNs."
echo "Log: $LOG_FILE"
