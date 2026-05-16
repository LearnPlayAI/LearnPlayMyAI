# LearnPlay Clean Ubuntu Install Runbook

This runbook is for installing LearnPlay on a **clean Ubuntu Server** host using the installer package you just built.

Package built in dev workspace:
- Archive: `/antigravity/Cloud-On-Prem/learnplay-onprem-20260305_154247.tar.gz`
- Checksum: `/antigravity/Cloud-On-Prem/learnplay-onprem-20260305_154247.tar.gz.sha256`
- Latest symlink: `/antigravity/Cloud-On-Prem/learnplay-onprem.tar.gz`

## 1. Target Host Requirements

- Ubuntu `22.04` or `24.04` (clean install recommended)
- User with `sudo` privileges (recommended username: `lppadmin`)
- Inbound ports open: `22`, `80`, `443`
- Public DNS `A` record for your domain pointing to target host
- Internet access from target host

## 2. Decide Values Before You Start

Prepare these values now:
- `DOMAIN` (example: `learnplay.example.com`)
- `ADMIN_EMAIL` (for SSL and alerts)
- `ORG_NAME`
- `ADMIN_PASSWORD`
- `GEMINI_API_KEY`
- `GAMMA_API_KEY`
- Email transport:
  - MailerSend API key, or
  - SMTP host/port/user/password/from

## 3. Copy Installer to Target Host

Run on your **dev workspace host**:

```bash
scp /antigravity/Cloud-On-Prem/learnplay-onprem.tar.gz lppadmin@<TARGET_IP>:/tmp/
scp /antigravity/Cloud-On-Prem/learnplay-onprem-20260305_154247.tar.gz.sha256 lppadmin@<TARGET_IP>:/tmp/
```

If you copied a timestamped archive instead of symlink, adjust filenames below.

## 4. Verify Package Integrity on Target Host

SSH to target host:

```bash
ssh lppadmin@<TARGET_IP>
cd /tmp
sha256sum -c learnplay-onprem-20260305_154247.tar.gz.sha256
```

Expected:
- `learnplay-onprem-20260305_154247.tar.gz: OK`

## 5. Extract Installer Package

On target host:

```bash
cd /tmp
rm -rf dist-onprem
mkdir -p dist-onprem
# If file is named learnplay-onprem.tar.gz:
tar xzf learnplay-onprem.tar.gz
# Confirm extraction:
ls -la /tmp/dist-onprem/scripts/master-install.sh
```

Expected: `/tmp/dist-onprem/scripts/master-install.sh` exists.

## 6. Run Installation (Recommended: Master Installer)

On target host:

```bash
sudo bash /tmp/dist-onprem/scripts/master-install.sh
```

The installer will guide you through:
- OS prep and security baseline
- Dependency install (Node.js, PostgreSQL, Nginx, PM2, certbot, etc.)
- DB setup
- App install and migrations
- Nginx and SSL setup

## 7. Optional: Fully Non-Interactive Install

If you want unattended install, export variables then run with `-E`:

```bash
export LEARNPLAY_DOMAIN="learnplay.example.com"
export LEARNPLAY_ADMIN_EMAIL="admin@example.com"
export LEARNPLAY_ORG_NAME="Example Org"
export LEARNPLAY_ADMIN_PASSWORD="<strong-password>"
export LEARNPLAY_GEMINI_KEY="<gemini-key>"
export LEARNPLAY_GAMMA_KEY="<gamma-key>"
export LEARNPLAY_SETUP_SSL="Y"

# Choose one email method
export LEARNPLAY_MAILERSEND_KEY="<mailersend-key>"
# OR SMTP settings
# export LEARNPLAY_SMTP_HOST="smtp.example.com"
# export LEARNPLAY_SMTP_PORT="587"
# export LEARNPLAY_SMTP_SECURE="false"
# export LEARNPLAY_SMTP_USER="smtp-user"
# export LEARNPLAY_SMTP_PASS="smtp-pass"
# export LEARNPLAY_SMTP_FROM="noreply@example.com"

sudo -E bash /tmp/dist-onprem/scripts/master-install.sh
```

## 8. Post-Install Verification

Run these on target host:

```bash
# Service health
sudo systemctl status nginx --no-pager
sudo systemctl status postgresql --no-pager
sudo -u lppadmin pm2 status

# Installer logs
sudo tail -n 120 /var/log/learnplay-master-install.log
sudo tail -n 120 /var/log/learnplay/install-summary.log

# HTTP/HTTPS checks (adjust domain)
curl -I http://<DOMAIN>
curl -I https://<DOMAIN>

# Local app check
curl -I http://127.0.0.1:3000
```

Expected:
- Nginx active
- PostgreSQL active
- PM2 process online
- HTTPS returns response headers

## 9. First Admin Access

- Open `https://<DOMAIN>`
- Log in using the admin credentials you set in installer
- Confirm key flows:
  - Login success
  - Dashboard loads
  - API-driven pages load

## 10. Common Issues and Fixes

### DNS/SSL fails

```bash
getent hosts <DOMAIN>
sudo certbot certificates
sudo tail -n 120 /var/log/letsencrypt/letsencrypt.log
```

Fix DNS A record, wait for propagation, then rerun SSL setup:

```bash
sudo bash /opt/learnplay/scripts/ssl-mode.sh setup-cert
```

### App process down

```bash
sudo -u lppadmin pm2 logs --lines 200
sudo -u lppadmin pm2 restart all
```

### DB connection issues

```bash
sudo systemctl restart postgresql
sudo -u postgres psql -c "\l"
```

## 11. Useful Admin Commands After Install

```bash
# Main admin menu
sudo lppadmin

# PM2 status/logs
sudo -u lppadmin pm2 status
sudo -u lppadmin pm2 logs --lines 100

# Nginx config test/reload
sudo nginx -t
sudo systemctl reload nginx
```

## 12. Recommended Immediate Hardening

After successful validation:

```bash
sudo bash /opt/learnplay/scripts/security-lockdown.sh
```

Then verify SSH key access before ending your current session.

---

If you want, I can also generate a **copy/paste checklist version** (single linear command blocks for source host and target host) tailored to your exact domain and email values.
