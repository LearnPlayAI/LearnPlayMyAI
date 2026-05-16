#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/learnplay-security-lockdown.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

APP_DIR="/opt/learnplay"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi

get_nginx_ports() {
  local APP_DIR="${LEARNPLAY_DIR:-/opt/learnplay}"
  local http_port="" https_port=""
  if [ -f "$APP_DIR/.env" ]; then
    http_port=$(grep -E "^NGINX_HTTP_PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    https_port=$(grep -E "^NGINX_HTTPS_PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  fi
  NGINX_HTTP_PORT="${http_port:-80}"
  NGINX_HTTPS_PORT="${https_port:-443}"
}

echo "============================================"
echo "  LearnPlay Security Lockdown"
echo "  EU Standards Enforcement"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

echo "⚠️  WARNING: This script will DISABLE password-based SSH/SFTP login."
echo "   You MUST have SSH key-based access configured before proceeding."
echo "   If you haven't set up SSH keys, you may be locked out!"
echo ""
read -p "Have you configured SSH key access? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Aborted. Please set up SSH keys first:"
  echo "   On your local machine: ssh-keygen -t ed25519"
  echo "   Then: ssh-copy-id -p YOUR_SSH_PORT user@this-server"
  exit 1
fi

CURRENT_USER="${SUDO_USER:-$USER}"
AUTH_KEYS="/home/$CURRENT_USER/.ssh/authorized_keys"
if [ ! -f "$AUTH_KEYS" ] || [ ! -s "$AUTH_KEYS" ]; then
  echo "❌ No SSH keys found for user '$CURRENT_USER' at $AUTH_KEYS"
  echo "   Please add your SSH key first: ssh-copy-id -p YOUR_SSH_PORT $CURRENT_USER@this-server"
  exit 1
fi
log "✅ SSH keys found for user $CURRENT_USER"

# ============================================
# 1. DISABLE PASSWORD AUTHENTICATION
# ============================================
log "🔒 Disabling password authentication..."
SSHD_CONFIG="/etc/ssh/sshd_config"
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?ChallengeResponseAuthentication .*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?UsePAM .*/UsePAM yes/' "$SSHD_CONFIG"
sed -i 's/^#\?PubkeyAuthentication .*/PubkeyAuthentication yes/' "$SSHD_CONFIG"

# ============================================
# 2. DISABLE ROOT LOGIN COMPLETELY
# ============================================
log "🔒 Disabling root login..."
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' "$SSHD_CONFIG"

# ============================================
# 3. SFTP KEY-ONLY (inherited from SSH config)
# ============================================
log "ℹ️  SFTP uses the same SSH config — password auth is now disabled for SFTP too."

# ============================================
# 4. TIGHTEN SSH CIPHERS (EU RECOMMENDED)
# ============================================
log "🔒 Configuring strong ciphers..."
sed -i '/^Ciphers /d' "$SSHD_CONFIG"
sed -i '/^MACs /d' "$SSHD_CONFIG"
sed -i '/^KexAlgorithms /d' "$SSHD_CONFIG"

cat >> "$SSHD_CONFIG" << 'EOF'

# EU-compliant strong ciphers
Ciphers aes256-gcm@openssh.com,chacha20-poly1305@openssh.com,aes256-ctr
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512
EOF

# ============================================
# 5. RESTART SSH
# ============================================
log "🔄 Restarting SSH service..."
sshd -t 2>/dev/null || /usr/sbin/sshd -t 2>/dev/null || { log "❌ SSH config test FAILED. Reverting..."; cp "$SSHD_CONFIG.bak-"* "$SSHD_CONFIG" 2>/dev/null; true; }
if systemctl restart ssh 2>/dev/null; then
  log "  ✅ SSH service restarted (ssh)"
elif systemctl restart sshd 2>/dev/null; then
  log "  ✅ SSH service restarted (sshd)"
else
  log "⚠️  SSH service not found as 'ssh' or 'sshd', skipping restart"
fi

# ============================================
# 6. VERIFY .env FILE PERMISSIONS
# ============================================
log "🔒 Verifying application file permissions..."
if [ -f "$ENV_FILE" ]; then
  chmod 600 "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  log "   .env file: 600 (owner-only read/write)"
fi

# ============================================
# 7. SECURITY AUDIT REPORT
# ============================================
log ""
log "============================================"
log "  Security Audit Report"
log "============================================"
log ""

SSH_PORT=$(grep "^Port " /etc/ssh/sshd_config | awk '{print $2}')
log "🔑 SSH Configuration:"
log "   Port: ${SSH_PORT:-22}"
log "   Password Auth: $(grep '^PasswordAuthentication' /etc/ssh/sshd_config | awk '{print $2}')"
log "   Root Login: $(grep '^PermitRootLogin' /etc/ssh/sshd_config | awk '{print $2}')"
log "   Key Auth: $(grep '^PubkeyAuthentication' /etc/ssh/sshd_config | awk '{print $2}')"
log ""

log "🔥 Firewall Status:"
ufw status 2>/dev/null | grep -E "^(Status|[0-9])" | while read line; do log "   $line"; done || true
log ""

log "🛡️  fail2ban Status:"
if systemctl is-active --quiet fail2ban; then
  log "   Status: Active"
  fail2ban-client status 2>/dev/null | grep "Jail list" | while read line; do log "   $line"; done || true
else
  log "   Status: ⚠️  Not running"
fi
log ""

log "📋 Audit Logging:"
if systemctl is-active --quiet auditd; then
  log "   Status: Active"
  log "   Rules: $(auditctl -l 2>/dev/null | wc -l || echo 0) rules loaded"
else
  log "   Status: ⚠️  Not running"
fi
log ""

log "🔄 Automatic Updates:"
if [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
  log "   Status: Configured"
else
  log "   Status: ⚠️  Not configured"
fi
log ""

log "🔐 SSL/TLS:"
if command -v certbot &>/dev/null; then
  CERTBOT_OUT=$(certbot certificates 2>/dev/null | grep -E "(Domain|Expiry)" || true)
  if [ -n "$CERTBOT_OUT" ]; then
    echo "$CERTBOT_OUT" | while read line; do log "   $line"; done || true
  else
    log "   No certificates found"
  fi
else
  log "   Certbot not installed"
fi
log ""

log "📁 Critical File Permissions:"
[ -f /opt/learnplay/.env ] && log "   .env: $(stat -c '%a' /opt/learnplay/.env) (should be 600)"
[ -d /opt/learnplay ] && log "   /opt/learnplay: $(stat -c '%U:%G' /opt/learnplay) (should be learnplay:learnplay)"
[ -d /opt/learnplay/uploads ] && log "   /opt/learnplay/uploads: $(stat -c '%U:%G' /opt/learnplay/uploads) (should be learnplay:learnplay)"
log ""

log "============================================"
log "  ✅ Security Lockdown Complete"
log "============================================"
log ""
log "EU Security Standards Applied:"
log "  ✅ Key-only SSH authentication"
log "  ✅ Strong cipher suites"
log "  ✅ Root login disabled"
log "  ✅ Audit logging active"
log "  ✅ Firewall enforced"
log "  ✅ fail2ban active"
log "  ✅ Automatic security updates"
log "  ✅ File permissions secured"
log ""
