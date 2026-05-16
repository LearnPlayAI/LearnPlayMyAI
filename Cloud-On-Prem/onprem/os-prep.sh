#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/var/log/learnplay-os-prep.log"

# Quick admin setup mode — delegates to lpadmin.sh do_setup() which handles
# copying scripts to /opt/learnplay/scripts/, creating the symlink, and
# installing the MOTD. Safe to run multiple times (idempotent).
if [ "${1:-}" = "--setup-admin" ]; then
  if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (sudo)"
    exit 1
  fi

  LPADMIN_SCRIPT="$SCRIPT_DIR/lpadmin.sh"
  if [ ! -f "$LPADMIN_SCRIPT" ]; then
    echo "❌ lpadmin.sh not found at $LPADMIN_SCRIPT"
    exit 1
  fi

  bash "$LPADMIN_SCRIPT" setup
  exit $?
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

normalize_timezone_input() {
  local raw="$1"
  local upper
  upper="$(echo "$raw" | tr '[:lower:]' '[:upper:]')"
  case "$upper" in
    SAST) echo "Africa/Johannesburg" ;;
    UTC|GMT|Z) echo "UTC" ;;
    EST) echo "America/New_York" ;;
    CST) echo "America/Chicago" ;;
    MST) echo "America/Denver" ;;
    PST) echo "America/Los_Angeles" ;;
    BST) echo "Europe/London" ;;
    CET) echo "Europe/Paris" ;;
    EET) echo "Europe/Athens" ;;
    IST) echo "Asia/Kolkata" ;;
    JST) echo "Asia/Tokyo" ;;
    AEST) echo "Australia/Sydney" ;;
    NZST) echo "Pacific/Auckland" ;;
    *) echo "$raw" ;;
  esac
}

is_valid_iana_timezone() {
  local tz="$1"
  timedatectl list-timezones 2>/dev/null | grep -Fxq "$tz"
}

detect_current_system_timezone() {
  local tz=""
  tz="$(timedatectl show -p Timezone --value 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -z "$tz" ] && [ -f /etc/timezone ]; then
    tz="$(head -n 1 /etc/timezone 2>/dev/null | tr -d '[:space:]' || true)"
  fi
  tz="$(normalize_timezone_input "${tz:-}")"
  if is_valid_iana_timezone "$tz"; then
    echo "$tz"
    return 0
  fi
  echo "Africa/Johannesburg"
}

echo "============================================"
echo "  LearnPlay OS Preparation Script"
echo "  EU Security Standards Compliance"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ============================================
# INTERACTIVE PROMPTS
# ============================================
# Support non-interactive mode via LEARNPLAY_* env vars (from master-install.sh)
if [ -n "${LEARNPLAY_SSH_PORT:-}" ]; then
  SSH_PORT="$LEARNPLAY_SSH_PORT"
else
  read -p "SSH port [22]: " SSH_PORT
  SSH_PORT="${SSH_PORT:-22}"
fi

if [ -n "${LEARNPLAY_ADMIN_EMAIL:-}" ]; then
  ADMIN_EMAIL="$LEARNPLAY_ADMIN_EMAIL"
else
  read -p "Admin email (for alerts): " ADMIN_EMAIL
  while [ -z "$ADMIN_EMAIL" ]; do
    read -p "Admin email is required: " ADMIN_EMAIL
  done
fi

if [ -n "${LEARNPLAY_TIMEZONE:-}" ]; then
  TIMEZONE_RAW="$LEARNPLAY_TIMEZONE"
else
  confirm_utc=""
  TIMEZONE_DEFAULT="$(detect_current_system_timezone)"
  while true; do
    read -p "Timezone [${TIMEZONE_DEFAULT}] (IANA, e.g., Africa/Johannesburg): " TIMEZONE_RAW
    TIMEZONE_RAW="$(printf '%s' "${TIMEZONE_RAW:-}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [ -n "$TIMEZONE_RAW" ]; then
      break
    fi
    if [ "$TIMEZONE_DEFAULT" = "Etc/UTC" ] && [ "${LEARNPLAY_ALLOW_UTC_DEFAULT:-false}" != "true" ]; then
      read -p "  Keep timezone as Etc/UTC? (y/N): " confirm_utc
      confirm_utc="$(printf '%s' "${confirm_utc:-}" | tr '[:upper:]' '[:lower:]')"
      if [ "$confirm_utc" = "y" ] || [ "$confirm_utc" = "yes" ]; then
        TIMEZONE_RAW="$TIMEZONE_DEFAULT"
        break
      fi
      echo "  ↳ Please enter your preferred IANA timezone (e.g., Africa/Johannesburg)."
      continue
    fi
    TIMEZONE_RAW="$TIMEZONE_DEFAULT"
    break
  done
fi
TIMEZONE="$(normalize_timezone_input "$TIMEZONE_RAW")"
if ! is_valid_iana_timezone "$TIMEZONE"; then
  log "❌ Invalid timezone '$TIMEZONE_RAW'. Use an IANA timezone like UTC or Africa/Johannesburg."
  exit 1
fi
if [ "$TIMEZONE" != "$TIMEZONE_RAW" ]; then
  log "ℹ️  Normalized timezone '$TIMEZONE_RAW' to '$TIMEZONE'"
fi

log ""
log "============================================"
log "  Starting OS Preparation"
log "============================================"
log "SSH Port:     $SSH_PORT"
log "Admin Email:  $ADMIN_EMAIL"
log "Timezone:     $TIMEZONE"
log ""

# ============================================
# 1. SYSTEM UPDATES
# ============================================
log "📦 Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get dist-upgrade -y -qq
apt-get autoremove -y -qq

# ============================================
# 2. SET TIMEZONE
# ============================================
log "🕐 Setting timezone to $TIMEZONE..."
timedatectl set-timezone "$TIMEZONE"

# ============================================
# 3. NTP TIME SYNCHRONIZATION
# ============================================
log "🕐 Configuring NTP time synchronization..."
apt-get install -y -qq systemd-timesyncd
timedatectl set-ntp true
# Verify
timedatectl status | grep -i "synchronized" || log "⚠️  NTP sync may take a moment"

# ============================================
# 4. INSTALL SECURITY PACKAGES
# ============================================
log "🔒 Installing security packages..."

# Preseed Postfix to suppress interactive dialog during apt install.
# LearnPlay handles email via its own SMTP/MailerSend config, not system Postfix.
echo "postfix postfix/main_mailer_type select No configuration" | debconf-set-selections
echo "postfix postfix/mailname string localhost" | debconf-set-selections
export DEBIAN_FRONTEND=noninteractive

apt-get install -y -qq \
  ufw \
  fail2ban \
  auditd \
  audispd-plugins \
  unattended-upgrades \
  apt-listchanges \
  logrotate \
  acl \
  libpam-pwquality \
  rkhunter

# Disable Postfix — it gets pulled as a dependency but LearnPlay sends email
# directly via nodemailer (SMTP) or MailerSend API, not through the system MTA.
# Leaving Postfix running would bind port 25 unnecessarily and confuse admins.
if systemctl is-active --quiet postfix 2>/dev/null; then
  systemctl stop postfix 2>/dev/null || true
fi
systemctl disable postfix 2>/dev/null || true
systemctl mask postfix 2>/dev/null || true
log "   Postfix disabled (LearnPlay uses its own email transport)"

# ============================================
# 5. FIREWALL (UFW)
# ============================================
log "🔥 Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
if [ "$SSH_PORT" != "22" ]; then
  ufw allow "$SSH_PORT"/tcp comment 'SSH custom port'
  ufw delete allow OpenSSH 2>/dev/null || true
else
  ufw allow OpenSSH
fi
NGINX_HTTP="${LEARNPLAY_NGINX_HTTP_PORT:-80}"
NGINX_HTTPS="${LEARNPLAY_NGINX_HTTPS_PORT:-443}"
if [ "$NGINX_HTTP" = "80" ] && [ "$NGINX_HTTPS" = "443" ]; then
  ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
else
  ufw allow "$NGINX_HTTP"/tcp comment 'LearnPlay HTTP'
  ufw allow "$NGINX_HTTPS"/tcp comment 'LearnPlay HTTPS'
  if [ "$NGINX_HTTP" != "80" ]; then
    ufw delete allow 80/tcp 2>/dev/null || true
  fi
  if [ "$NGINX_HTTPS" != "443" ]; then
    ufw delete allow 443/tcp 2>/dev/null || true
  fi
fi
ufw --force enable

# ============================================
# 6. SSH HARDENING (PASSWORD LOGIN KEPT OPEN)
# ============================================
log "🔑 Configuring SSH (password login KEPT OPEN for setup)..."
SSHD_CONFIG="/etc/ssh/sshd_config"
cp "$SSHD_CONFIG" "$SSHD_CONFIG.bak-$(date +%Y%m%d)" 2>/dev/null || true

# Change SSH port
sed -i "s/^#\?Port .*/Port $SSH_PORT/" "$SSHD_CONFIG"

# Disable root login
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' "$SSHD_CONFIG"

# KEEP password authentication ENABLED (will be locked down later)
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication yes/' "$SSHD_CONFIG"

# Security settings
sed -i 's/^#\?X11Forwarding .*/X11Forwarding no/' "$SSHD_CONFIG"
sed -i 's/^#\?MaxAuthTries .*/MaxAuthTries 5/' "$SSHD_CONFIG"
sed -i 's/^#\?ClientAliveInterval .*/ClientAliveInterval 300/' "$SSHD_CONFIG"
sed -i 's/^#\?ClientAliveCountMax .*/ClientAliveCountMax 3/' "$SSHD_CONFIG"
sed -i 's/^#\?LoginGraceTime .*/LoginGraceTime 60/' "$SSHD_CONFIG"
sed -i 's/^#\?AllowAgentForwarding .*/AllowAgentForwarding no/' "$SSHD_CONFIG"

# Add protocol 2 only if not present
grep -q "^Protocol 2" "$SSHD_CONFIG" || echo "Protocol 2" >> "$SSHD_CONFIG"

if systemctl restart ssh 2>/dev/null; then
  log "  ✅ SSH service restarted (ssh)"
elif systemctl restart sshd 2>/dev/null; then
  log "  ✅ SSH service restarted (sshd)"
else
  log "⚠️  SSH service not found as 'ssh' or 'sshd', skipping restart"
fi

# ============================================
# 7. FAIL2BAN CONFIGURATION
# ============================================
log "🛡️  Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = $ADMIN_EMAIL
sendername = LearnPlay-Fail2Ban
action = %(action_mwl)s

[sshd]
enabled = true
port = $SSH_PORT
maxretry = 3
bantime = 7200

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ============================================
# 8. AUDIT LOGGING (EU/GDPR COMPLIANCE)
# ============================================
log "📋 Configuring audit logging..."
# Key audit rules for EU compliance
cat > /etc/audit/rules.d/learnplay.rules << 'AUDIT_EOF'
# Monitor user/group changes
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/gshadow -p wa -k identity

# Monitor sudo usage
-w /var/log/sudo.log -p wa -k sudo_log
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d/ -p wa -k sudoers

# Monitor SSH config changes
-w /etc/ssh/sshd_config -p wa -k sshd_config

# Monitor login/logout events
-w /var/log/auth.log -p wa -k auth_log
-w /var/log/faillog -p wa -k login_failures
-w /var/log/lastlog -p wa -k login_records

# Monitor application directory
-w /opt/learnplay/ -p wa -k app_changes
-w /opt/learnplay/.env -p ra -k env_access

# Monitor cron changes
-w /etc/crontab -p wa -k cron
-w /etc/cron.d/ -p wa -k cron

# Monitor network config
-w /etc/hosts -p wa -k hosts
-w /etc/network/ -p wa -k network
AUDIT_EOF

systemctl enable auditd
systemctl restart auditd

# ============================================
# 9. KERNEL HARDENING (SYSCTL)
# ============================================
log "🔒 Applying kernel security hardening..."
cat > /etc/sysctl.d/99-learnplay-security.conf << 'SYSCTL_EOF'
# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP broadcast requests
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Block SYN attacks
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2

# Log Martians
net.ipv4.conf.all.log_martians = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Ignore Directed pings
net.ipv4.icmp_echo_ignore_all = 0

# Disable IPv6 if not needed (can be enabled if required)
# net.ipv6.conf.all.disable_ipv6 = 1

# Restrict dmesg access
kernel.dmesg_restrict = 1

# Restrict kernel pointer exposure
kernel.kptr_restrict = 2

# Address space layout randomization
kernel.randomize_va_space = 2
SYSCTL_EOF

sysctl -p /etc/sysctl.d/99-learnplay-security.conf

# ============================================
# 10. AUTOMATIC SECURITY UPDATES
# ============================================
log "🔄 Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'UNATTENDED_EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Automatically "true";
Unattended-Upgrade::Automatic-Reboot "false";
UNATTENDED_EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTO_UPGRADES_EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTO_UPGRADES_EOF

# ============================================
# 11. LOGIN BANNER
# ============================================
log "📢 Setting login banner..."
cat > /etc/issue.net << 'BANNER_EOF'
***************************************************************************
                         AUTHORIZED ACCESS ONLY
  
  This system is for authorized users only. All activities are monitored 
  and logged. Unauthorized access is prohibited and may be subject to 
  criminal prosecution under applicable law.
  
  By accessing this system, you consent to monitoring and recording of 
  all activities in accordance with GDPR and applicable data protection 
  regulations.
***************************************************************************
BANNER_EOF

# Enable banner in SSH
sed -i 's|^#\?Banner .*|Banner /etc/issue.net|' /etc/ssh/sshd_config
if systemctl restart ssh 2>/dev/null; then
  log "  ✅ SSH service restarted (ssh)"
elif systemctl restart sshd 2>/dev/null; then
  log "  ✅ SSH service restarted (sshd)"
else
  log "⚠️  SSH service not found, skipping restart"
fi

# ============================================
# 12. PASSWORD QUALITY POLICY
# ============================================
log "🔑 Configuring password quality policy..."
cat > /etc/security/pwquality.conf << 'PWQUALITY_EOF'
minlen = 12
dcredit = -1
ucredit = -1
ocredit = -1
lcredit = -1
minclass = 3
maxrepeat = 3
maxclassrepeat = 4
PWQUALITY_EOF

# ============================================
# 13. SESSION TIMEOUT
# ============================================
log "⏱️  Configuring session timeout..."
cat > /etc/profile.d/learnplay-timeout.sh << 'TIMEOUT_EOF'
# Auto-logout inactive sessions after 15 minutes
TMOUT=900
readonly TMOUT
export TMOUT
TIMEOUT_EOF

# ============================================
# 14. SHARED MEMORY HARDENING
# ============================================
log "🔒 Hardening shared memory..."
if ! grep -q "/run/shm" /etc/fstab; then
  echo "tmpfs /run/shm tmpfs defaults,noexec,nosuid 0 0" >> /etc/fstab
fi

# ============================================
# 15. INSTALL ADMIN TOOLS (delegates to lpadmin.sh setup)
# ============================================
log "🛠️  Installing admin tools..."

LPADMIN_SCRIPT="$SCRIPT_DIR/lpadmin.sh"
if [ -f "$LPADMIN_SCRIPT" ]; then
  if ! bash "$LPADMIN_SCRIPT" setup 2>&1 | tee -a "$LOG_FILE"; then
    log "  ⚠️  Admin tools setup encountered an error — continuing installation"
    log "  ℹ️  You can re-run later with: sudo lppadmin setup"
    mkdir -p /var/log/learnplay
  fi
else
  log "  ⚠️  lpadmin.sh not found — lppadmin command not installed"
  mkdir -p /var/log/learnplay
fi

# ============================================
# 16. FINAL SUMMARY
# ============================================
log ""
log "============================================"
log "  ✅ OS Preparation Complete"
log "============================================"
log ""
log "Security Configuration:"
log "  SSH Port:          $SSH_PORT"
log "  Timezone:          $TIMEZONE"
log "  Firewall:          ✅ Enabled (SSH, HTTP, HTTPS)"
log "  fail2ban:          ✅ Enabled"
log "  Audit Logging:     ✅ Enabled (EU/GDPR)"
log "  Kernel Hardening:  ✅ Applied"
log "  Auto Updates:      ✅ Enabled (security)"
log "  NTP Sync:          ✅ Enabled"
log "  Password Policy:   ✅ Enforced (min 12 chars, 3 classes)"
log "  Session Timeout:   ✅ 15 minutes"
log "  Admin Tool:        ✅ sudo lppadmin"
log "  Welcome Screen:    ✅ Shows on SSH login"
log ""
log "⚠️  IMPORTANT: Password SSH login is STILL ENABLED"
log "   Run security-lockdown.sh after installation is complete"
log "   to enforce key-only authentication."
log ""
log "Next step: Run install-deps.sh"
log ""
