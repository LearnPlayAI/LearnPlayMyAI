#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/learnplay-admin/devadmin"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
REPORT="$LOG_DIR/dr-postcheck-${TS}.log"

exec > >(tee -a "$REPORT") 2>&1

echo "DR Post-check"
echo "Generated: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo

status_ok=0
status_warn=0
status_fail=0

check_ok() { printf "[OK]   %s\n" "$1"; status_ok=$((status_ok+1)); }
check_warn() { printf "[WARN] %s\n" "$1"; status_warn=$((status_warn+1)); }
check_fail() { printf "[FAIL] %s\n" "$1"; status_fail=$((status_fail+1)); }

wait_until_service_ready() {
  local svc="$1"
  local max_wait="${2:-120}"
  local waited=0
  while [ "$waited" -lt "$max_wait" ]; do
    local st
    st="$(systemctl is-active "$svc" 2>/dev/null || true)"
    case "$st" in
      active|failed|inactive|unknown) return 0 ;;
      activating|deactivating) sleep 2; waited=$((waited+2)) ;;
      *) return 0 ;;
    esac
  done
}

if [ -d /antigravity/Cloud-On-Prem ]; then
  check_ok "/antigravity/Cloud-On-Prem present"
else
  check_fail "workspace missing at /antigravity/Cloud-On-Prem"
fi

check_dr_alias_ips() {
  local begin="# BEGIN LEARNPLAY_DR_MAPPING"
  local end="# END LEARNPLAY_DR_MAPPING"
  local aliases
  aliases="$(awk -v b="$begin" -v e="$end" '
    $0==b {inb=1; next}
    $0==e {inb=0; next}
    inb && $1 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ && $1 != "127.0.1.1" {print $1}
  ' /etc/hosts 2>/dev/null | sort -u)"
  if [ -z "$aliases" ]; then
    check_warn "no DR alias IP mapping found in /etc/hosts block"
    return 0
  fi
  while IFS= read -r ip; do
    [ -n "$ip" ] || continue
    if ip -4 -o addr show | awk '{print $4}' | cut -d/ -f1 | grep -qx "$ip"; then
      check_ok "ip alias present: $ip"
    else
      check_warn "ip alias missing on interfaces: $ip"
    fi
  done <<< "$aliases"
}

check_dr_alias_ips

check_base_url_reachable() {
  local scope="$1"
  local env_file="$2"
  [ -f "$env_file" ] || return 0
  local base_url
  base_url="$(grep -E '^BASE_URL=' "$env_file" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  [ -n "$base_url" ] || return 0
  local code=""
  for _ in $(seq 1 20); do
    code="$(curl -k -sS -o /dev/null -w '%{http_code}' "$base_url" || true)"
    case "$code" in
      200|201|202|204|301|302|303|307|308)
        check_ok "${scope} BASE_URL reachable (${base_url}) [HTTP ${code}]"
        return 0
        ;;
    esac
    sleep 2
  done
  check_warn "${scope} BASE_URL not reachable (${base_url})"
}

for p in /opt/learnplay/cloud /opt/learnplay/onprem /opt/lpdb/cloud /opt/lpdb/onprem /opt/lpdb/shared; do
  if [ -e "$p" ]; then
    check_ok "$p present"
  else
    check_warn "$p missing"
  fi
done

for cmd in devadmin lppadmin nginx psql node; do
  if command -v "$cmd" >/dev/null 2>&1; then
    check_ok "command available: $cmd"
  else
    check_warn "command missing: $cmd"
  fi
done

for svc in nginx postgresql learnplay-cloud learnplay-onprem; do
  load_state="$(systemctl show "${svc}.service" -p LoadState --value 2>/dev/null || true)"
  if [ -n "$load_state" ] && [ "$load_state" != "not-found" ]; then
    if [ "$svc" = "learnplay-cloud" ] || [ "$svc" = "learnplay-onprem" ]; then
      wait_until_service_ready "$svc" 180
    fi
    st="$(systemctl is-active "$svc" 2>/dev/null || true)"
    if [ "$st" = "active" ]; then
      check_ok "service active: $svc"
    elif [ "$st" = "activating" ]; then
      case "$svc" in
        learnplay-cloud)
          if ss -ltn "( sport = :8000 )" 2>/dev/null | grep -q LISTEN; then
            check_ok "service active enough: $svc (activating, port 8000 listening)"
          else
            check_warn "service not active: $svc ($st)"
          fi
          ;;
        learnplay-onprem)
          if ss -ltn "( sport = :9000 )" 2>/dev/null | grep -q LISTEN; then
            check_ok "service active enough: $svc (activating, port 9000 listening)"
          else
            check_warn "service not active: $svc ($st)"
          fi
          ;;
        *)
          check_warn "service not active: $svc ($st)"
          ;;
      esac
    else
      check_warn "service not active: $svc ($st)"
    fi
  else
    check_warn "service not installed: $svc"
  fi
done

check_base_url_reachable "cloud" "/opt/learnplay/cloud/.env"
check_base_url_reachable "onprem" "/opt/learnplay/onprem/.env"

if command -v lppadmin >/dev/null 2>&1; then
  if lppadmin cloud runtime-version >/tmp/dr-postcheck-runtime-cloud.txt 2>/dev/null; then
    check_ok "lppadmin cloud runtime-version"
    sed -n '1,18p' /tmp/dr-postcheck-runtime-cloud.txt || true
  else
    check_warn "lppadmin cloud runtime-version failed"
  fi
  if lppadmin onprem runtime-version >/tmp/dr-postcheck-runtime-onprem.txt 2>/dev/null; then
    check_ok "lppadmin onprem runtime-version"
    sed -n '1,18p' /tmp/dr-postcheck-runtime-onprem.txt || true
  else
    check_warn "lppadmin onprem runtime-version failed"
  fi
fi

echo
echo "Summary: ok=${status_ok} warn=${status_warn} fail=${status_fail}"
if [ "$status_fail" -gt 0 ]; then
  echo "Result: FAILED"
  exit 1
fi
if [ "$status_warn" -gt 0 ]; then
  echo "Result: DEGRADED"
  exit 0
fi
echo "Result: PASS"
