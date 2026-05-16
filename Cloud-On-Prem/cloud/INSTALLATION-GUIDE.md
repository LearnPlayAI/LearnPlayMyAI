# LearnPlay Cloud (Linux) Installation Guide

> **Version:** 2.0
> **Last Updated:** February 2026
> **Audience:** System administrators deploying LearnPlay on self-hosted Linux infrastructure using Google Cloud Storage

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Filesystem Layout](#3-filesystem-layout)
4. [Building the Cloud Package](#4-building-the-cloud-package)
5. [Transferring Files to Server](#5-transferring-files-to-server)
6. [Installation Methods](#6-installation-methods)
7. [DNS & SSL Setup](#7-dns--ssl-setup)
8. [Verification](#8-verification)
9. [Security Lockdown](#9-security-lockdown)
10. [GCS Storage Management](#10-gcs-storage-management)
11. [EU Security & GDPR Compliance](#11-eu-security--gdpr-compliance)
12. [Performance Tuning Details](#12-performance-tuning-details)
13. [Edge Cases & Recovery](#13-edge-cases--recovery)
14. [Email DNS Configuration](#14-email-dns-configuration)
15. [Environment Variables Reference](#15-environment-variables-reference)
16. [Administration Operations](#16-administration-operations)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Overview

LearnPlay is a full-featured e-learning and gamification platform that supports courses, quizzes, real-time multiplayer games, AI-powered content generation, organizations, credits, and marketplace features.

This guide covers the complete process of deploying the **Cloud (Linux)** variant of LearnPlay on your own server. In this variant:

- **File uploads** (course images, documents, lesson PDFs, videos) are stored in **Google Cloud Storage** — not on the local server filesystem
- **Database** is either a **Neon serverless PostgreSQL** connection string or a **locally installed PostgreSQL 18**
- The application server (Express + Node.js) and web proxy (Nginx) run on your Ubuntu server

A sysadmin should be able to follow this document from start to finish without any other reference.

### Deployment Architecture

```
┌──────────────┐      ┌───────────────┐      ┌──────────────────┐
│   Browser    │─────▶│  Nginx (443)  │─────▶│  Express (3000)  │
│   Client     │      │  Reverse Proxy│      │  Node.js + PM2   │
└──────────────┘      │  + SSL/TLS    │      └────────┬─────────┘
                      │  + Rate Limit │               │
                      │  + Static     │      ┌────────▼─────────┐
                      │    Files      │      │  PostgreSQL 18   │
                      └───────────────┘      │  (Neon or local) │
                                             └──────────────────┘
                                                       │
                                             ┌─────────▼────────┐
                                             │  Google Cloud    │
                                             │  Storage Bucket  │
                                             │  (file uploads)  │
                                             └──────────────────┘
```

> **Note:** Ports shown above are defaults. All ports are configurable during installation via `master-install.sh` and stored in `.env` as `PORT`, `NGINX_HTTP_PORT`, and `NGINX_HTTPS_PORT`.

**Components:**

- **Express Server** — Node.js application serving the API and frontend (default port 3000)
- **PostgreSQL** — Relational database (Neon serverless or local PostgreSQL 18)
- **Google Cloud Storage** — Object storage for all file uploads (images, PDFs, videos, documents)
- **Nginx** — Reverse proxy handling SSL termination, static file serving, rate limiting, and WebSocket proxying
- **PM2** — Process manager for automatic restarts, memory management, and logging

### Automated Installation Scripts

The deployment package includes a complete suite of automated scripts:

| Script | Purpose |
|--------|---------|
| `master-install.sh` | **Recommended** — Orchestrator that collects all inputs once, then runs everything unattended |
| `os-prep.sh` | OS hardening, firewall, fail2ban, auditd, EU security standards |
| `install-deps.sh` | Install Node.js 20, PostgreSQL 18 (if local), Nginx, Certbot, PM2 |
| `db-setup.sh` | PostgreSQL user, database, SSL, automated backups, maintenance (local PG only) |
| `perf-tune.sh` | Auto-detect hardware and optimize OS, database, and application settings |
| `app-install.sh` | Deploy application, generate .env, migrations, Nginx, SSL, PM2 |
| `security-lockdown.sh` | Post-install: disable password SSH, enforce key-only auth, security audit |
| `lpadmin.sh` | **Admin CLI** — Interactive menu for all management operations |
| `service-control.sh` | Start, stop, restart, and monitor application and database services |
| `ssl-mode.sh` | Switch between Let's Encrypt, self-signed, and HTTP-only SSL modes |
| `secrets-manager.sh` | Manage API keys and secrets in `.env` with rotation support |
| `configure-env.sh` | Interactive configuration of all environment variables including GCS credentials |
| `db-backup.sh` | Full and incremental database backups |
| `db-restore.sh` | Point-in-time database recovery |
| `dr-backup.sh` | **Disaster Recovery** — Full system backup (DB + configs + .env); GCS files managed separately |
| `dr-restore.sh` | **Disaster Recovery** — Complete system restore on a clean host |
| `learnplay-motd.sh` | Welcome screen with system status shown on SSH login |
| `update.sh` | Apply updates with backup, migration, rollback, and health check |

All scripts are **idempotent** — safe to run multiple times without causing issues.

---

## 2. Prerequisites

### Hardware Requirements

| Resource | Minimum | Recommended | Enterprise |
|----------|---------|-------------|------------|
| CPU | 2 cores | 4+ cores | 8+ cores |
| RAM | 4 GB | 8+ GB | 16+ GB |
| Storage | 20 GB SSD | 40+ GB SSD | 100+ GB NVMe |
| Network | 100 Mbps | 1 Gbps | 1 Gbps |

> **Note:** Unlike the on-premises variant, the cloud variant stores all uploaded files in Google Cloud Storage. Local storage requirements are significantly lower because the server does not need a large uploads partition.

### Software Requirements

- **Operating System:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS (recommended)
- **Fresh installation preferred** — avoids conflicts with existing packages
- **Root or sudo access** required for installation
- **Internet access** required during installation for package downloads

> **Recommended:** During Ubuntu installation, create the non-root user as **`lppadmin`**. This keeps the admin username consistent with the platform tooling and makes commands throughout this guide easier to follow (e.g., `ssh lppadmin@your-server`).

### Network Requirements

- **Static IP address** or Dynamic DNS (DDNS) service
- **Domain name** with an A record pointing to the server's public IP
- **Open ports:**
  - **22** (or custom) — SSH (administration)
  - **80** — HTTP (Let's Encrypt ACME challenge + redirect to HTTPS)
  - **443** — HTTPS (application traffic)
- **Port forwarding** configured on the router if the server is behind NAT

### Google Cloud Requirements

- **Google Cloud project** with billing enabled
- **Google Cloud Storage bucket** (see Section 10 for setup)
- **Service account** with Storage Object Admin role on the bucket, or Application Default Credentials configured on the server

### External Service Requirements

| Service | Required | Notes |
|---------|----------|-------|
| Google Cloud Storage | **Yes** | All file uploads are stored here |
| Gemini API key | **Yes** | AI lesson/quiz generation ([aistudio.google.com](https://aistudio.google.com/app/apikeys)) |
| MailerSend API key | Yes* | Transactional email ([dashboard.mailersend.com](https://dashboard.mailersend.com/api-tokens)) |
| SMTP server | Yes* | Alternative to MailerSend |
| Gamma API key | No | Document-to-lesson AI generation |
| Yoco API keys | No | Payment gateway (if payments enabled) |
| Neon database | No | Alternative to local PostgreSQL |

*At least one email delivery method is required.

---

## 3. Filesystem Layout

### Recommended Partition Layout

| Mount Point | Size | Mount Options | Usage |
|-------------|------|---------------|-------|
| `/boot` | 1 GB | | Boot files |
| `/boot/efi` | 512 MB | | EFI partition |
| `/` | 20 GB | `defaults` | OS, packages, system files |
| `/opt` | 10 GB | `defaults,nosuid` | |
| `/home/lppadmin` | 10 GB | `defaults,nosuid` | LearnPlay Admin Home |
| `/opt/learnplay` | 10 GB | `defaults,nosuid` | Application code |
| `/opt/lpdb` | 50+ GB | `defaults,nosuid` | Database files (local PG only) |
| `/lppbackups` | 30+ GB | `defaults,nosuid` | Database backups, DR archives |
| `/var/log` | 10 GB | `defaults,nosuid,noexec` | Application and system logs |
| `/tmp` | 10 GB | `defaults,nosuid,noexec,nodev` | Temporary files |
| swap | Equal to RAM | — | Swap space |

> **Note:** There is no `/opt/uploads` partition in the cloud variant. File uploads go directly to Google Cloud Storage. If you are using local PostgreSQL, data files are stored at `/opt/lpdb/cloud/pg16/main` (or `/opt/lpdb/shared/pg16/main` on the DEV stack host).

### Backup Mount Point

LearnPlay requires a dedicated backup mount at `/lppbackups` (recommended minimum 30+ GB):

```bash
# Create mount point
sudo mkdir -p /lppbackups

# If using a dedicated disk/partition (recommended):
sudo mkfs.ext4 /dev/sdX1
echo '/dev/sdX1 /lppbackups ext4 defaults,nosuid 0 2' | sudo tee -a /etc/fstab
sudo mount /lppbackups

# If not using a dedicated disk (acceptable for cloud deployments with Neon):
sudo mkdir -p /lppbackups
```

The backup directory structure:
```
/lppbackups/
├── full/                   — Full database backups (pg_dump)
├── base/                   — Base backups (pg_basebackup for PITR) — local PG only
├── wal/                    — WAL archive files — local PG only
├── nginx/                  — Nginx configuration backups
└── disaster-recovery/      — Full system DR backup archives
```

> **File uploads are NOT in /lppbackups.** They are in Google Cloud Storage. Enable GCS object versioning for file-level backup (see Section 10).

### Directory Structure

After installation, the following directories are created:

```
/opt/learnplay/                 — Application root
├── server/                     — Backend (Express.js bundle)
├── client/                     — Frontend (Vite build output)
├── migrations/                 — Database migration SQL files
├── scripts/                    — Deployment and management scripts
├── ecosystem.config.cjs        — PM2 process configuration
├── package.json                — npm dependencies
├── version.json                — Build version metadata
└── .env                        — Environment configuration (600 perms)

/opt/learnplay/keys/            — Secure key storage
└── provision-bundle.json       — Provision bundle (if supplied)

/opt/lpdb/cloud/pg16/main       — PostgreSQL data files (cloud runtime)

/var/log/learnplay/             — Application logs
├── out.log                     — PM2 stdout log
├── error.log                   — PM2 stderr log
├── backup.log                  — Backup cron log
└── maintenance.log             — Database maintenance log
```

### Disk Space Monitoring

```bash
# Check current disk usage
df -h /opt/learnplay /opt/lpdb /var/log

# The perf-tune.sh script creates a monitoring cron (see Section 12)
```

---

## 4. Building the Cloud Package

These commands are run **on your development machine** (any Linux or macOS machine with Node 20+ and npm), not on the target server.

### 4.1 Install Dependencies

```bash
cd Cloud-On-Prem
npm install
```

### 4.2 Build the Cloud Package

```bash
bash build-cloud-linux.sh
```

The build script:
1. Cleans the `dist-cloud/` directory
2. Builds the frontend with Vite
3. Bundles the server with esbuild (uses cloud-native `server/db.ts`, `server/objectStorage.ts` — no file swaps)
4. Builds the migration runner
5. Copies SQL migrations
6. Copies all cloud administration scripts to `dist-cloud/scripts/`
7. Copies `ecosystem.config.cjs`, `nginx.conf.template`, and documentation to `dist-cloud/`
8. Generates `package.json` with cloud-specific dependencies (includes `@google-cloud/storage`)
9. Generates `version.json` with build metadata

### 4.3 Create Distributable Archive

```bash
tar czf learnplay-cloud.tar.gz dist-cloud/
```

### 4.4 Transfer the Archive

Transfer `learnplay-cloud.tar.gz` to the server using `scp` (see Section 5).

---

## 5. Transferring Files to Server

### From Your Local Machine

```bash
scp learnplay-cloud.tar.gz lppadmin@your-server:/tmp/
```

### On the Server

```bash
cd /tmp
tar xzf learnplay-cloud.tar.gz
```

This creates `/tmp/dist-cloud/` containing all files and scripts.

### First Step: Set Up the lpadmin Command

**This is the very first thing you should do after extracting the archive.** Run this before anything else:

```bash
sudo bash /tmp/dist-cloud/scripts/lpadmin.sh setup
```

This command automatically:
1. **Copies all scripts** from `/tmp/dist-cloud/scripts/` to their permanent location at `/opt/learnplay/scripts/` (so they survive `/tmp` cleanup and reboots)
2. **Creates the `lpadmin` symlink** at `/usr/local/bin/lpadmin` pointing to `/opt/learnplay/scripts/lpadmin.sh`
3. **Installs the welcome screen** (MOTD) that shows system status on every SSH login
4. **Creates the log directory** at `/var/log/learnplay`

From this point on, manage LearnPlay using:

```bash
sudo lpadmin           # Interactive menu
sudo lpadmin help      # List all commands
```

> **Safe to re-run anytime:** This command is fully idempotent. On re-runs it detects what's already installed, updates only what has changed, and skips what's already current. Use it after applying an update package or when reinstalling.

> **Why this step is critical:** The `/tmp` directory is routinely cleaned by the operating system. Running setup copies scripts to `/opt/learnplay/scripts/` (a permanent location) so the `lpadmin` command keeps working after `/tmp` cleanup or reboots.

---

## 6. Installation Methods

### Method 1: Master Installer (Recommended)

The master installer collects all inputs upfront, then runs the entire installation unattended:

```bash
sudo bash /tmp/dist-cloud/scripts/master-install.sh
```

**What it asks for (once, at the beginning):**

| Prompt | What to Enter | Required |
|--------|---------------|----------|
| SSH port | Custom SSH port (default: 22) | No |
| Timezone | Server timezone (default: UTC) | No |
| Domain name | Fully qualified domain (e.g., `learn.example.com`) | Yes |
| Admin email | Email for SSL certs and alerts | Yes |
| Database URL | Neon connection string or leave blank for local PG | No |
| Database password | Strong password for local PG (if not using Neon) | If local PG |
| Email setup | SMTP (own mail server) or MailerSend (API key) | No |
| SMTP Host/Port/TLS | Mail server details (if SMTP chosen) | If SMTP |
| SMTP Username/Password | Mail server credentials (if auth required) | No |
| Gemini API Key | For AI features | No |
| Gamma API Key | For presentation generation | No |
| GCS auth method | 1=JSON string, 2=key file path, 3=ADC | Yes |
| GCS service account JSON | Full JSON string (if method 1) | If method 1 |
| GCS key file path | Path to key file on server (if method 2) | If method 2 |
| Set up SSL? | Y/n for Let's Encrypt | No |

After collecting inputs, it runs these phases automatically:
1. **OS Preparation** — Firewall, fail2ban, auditd, kernel hardening, EU security
2. **Dependency Installation** — Node.js 20, PostgreSQL 18 (if local), Nginx, Certbot, PM2
3. **Database Setup** — User, database, SSL, backups, maintenance (local PG) or connection test (Neon)
4. **Performance Tuning** — Auto-detect hardware, optimize OS/DB/App
5. **Application Deployment** — .env generation, npm install, migrations, Nginx, SSL, PM2

Total time: approximately 10–20 minutes.

### Method 2: Individual Scripts

Run each script separately for more control:

```bash
# Step 1: OS hardening
sudo bash /tmp/dist-cloud/scripts/os-prep.sh

# Step 2: Install dependencies
sudo bash /tmp/dist-cloud/scripts/install-deps.sh

# Step 3: Database setup (local PG only — skip if using Neon)
sudo bash /tmp/dist-cloud/scripts/db-setup.sh

# Step 4: Performance tuning
sudo bash /tmp/dist-cloud/scripts/perf-tune.sh

# Step 5: Deploy application
sudo bash /tmp/dist-cloud/scripts/app-install.sh
```

Each script logs to `/var/log/learnplay-{script-name}.log`.

### Non-Interactive Mode

All scripts support environment variables for fully automated (non-interactive) deployment:

```bash
export LEARNPLAY_SSH_PORT=22
export LEARNPLAY_TIMEZONE=UTC
export LEARNPLAY_DOMAIN=learn.example.com
export LEARNPLAY_ADMIN_EMAIL=admin@example.com
# Option A: Neon database
export LEARNPLAY_DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require"
# Option B: Local PG — provide a password instead
export LEARNPLAY_DB_PASSWORD=your-strong-password
export LEARNPLAY_SMTP_HOST=mail.example.com
export LEARNPLAY_SMTP_PORT=587
export LEARNPLAY_SMTP_SECURE=true
export LEARNPLAY_SMTP_USER=noreply@example.com
export LEARNPLAY_SMTP_PASS=your-smtp-password
export LEARNPLAY_SMTP_FROM=noreply@example.com
# Or use MailerSend instead of SMTP:
# export LEARNPLAY_MAILERSEND_KEY=your-key
export LEARNPLAY_GEMINI_KEY=your-key
export LEARNPLAY_GAMMA_KEY=your-key
# GCS credentials (choose one):
export LEARNPLAY_GCS_SA_JSON='{"type":"service_account","project_id":"..."}'
# export LEARNPLAY_GCS_KEY_FILE=/etc/learnplay/gcs-key.json
export LEARNPLAY_SETUP_SSL=Y

sudo -E bash /tmp/dist-cloud/scripts/master-install.sh
```

---

## 7. DNS & SSL Setup

### DNS Configuration

Before installation (or before the SSL step), create a DNS A record:

```
learn.example.com → YOUR_SERVER_PUBLIC_IP
```

DNS propagation may take up to 48 hours. Check status:

```bash
dig +short learn.example.com
nslookup learn.example.com
```

### SSL Certificate

If you skipped SSL during installation, set it up later:

```bash
sudo certbot --nginx -d learn.example.com --agree-tos --email admin@example.com
```

### SSL Auto-Renewal

Certbot automatically sets up a renewal timer. Verify:

```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

### Manual SSL Renewal

```bash
sudo certbot renew
sudo systemctl reload nginx
```

---

## 8. Verification

After installation, run these checks:

```bash
# Application status
sudo -u learnplay pm2 status

# Health check (replace 3000 with your custom PORT if configured)
curl -s http://127.0.0.1:3000/api/health

# Version
cat /opt/learnplay/version.json

# Recent logs (check for errors)
sudo -u learnplay pm2 logs learnplay --lines 50

# Database connectivity (Neon or local PG)
sudo -u learnplay bash -c 'source /opt/learnplay/.env && node -e "
const {Pool} = require(\"pg\");
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query(\"SELECT count(*) FROM users\").then(r=>console.log(\"DB OK, users:\",r.rows[0].count)).catch(e=>console.error(e.message)).finally(()=>p.end())
"'

# GCS connectivity test
sudo -u learnplay bash -c 'source /opt/learnplay/.env && node -e "
const {Storage}=require(\"@google-cloud/storage\");
const s=new Storage();
s.getBuckets().then(([b])=>console.log(\"GCS OK:\",b.length,\"buckets accessible\")).catch(e=>console.error(\"GCS ERROR:\",e.message))
"'

# Nginx status
sudo nginx -t
sudo systemctl status nginx

# SSL certificate
sudo certbot certificates

# Firewall
sudo ufw status

# System services
systemctl is-active nginx pm2-learnplay
```

---

## 9. Security Lockdown

**After installation is complete and you've verified everything works**, run the security lockdown script to enforce EU security standards:

### Step 1: Set Up SSH Key Access

On your local machine:
```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "admin@example.com"

# Copy key to server
ssh-copy-id -p YOUR_SSH_PORT lppadmin@your-server

# Test key-based login (should NOT prompt for password)
ssh -p YOUR_SSH_PORT lppadmin@your-server
```

### Step 2: Run Security Lockdown

```bash
sudo bash /opt/learnplay/scripts/security-lockdown.sh
```

This script:
- Verifies SSH keys are configured
- Disables password-based SSH/SFTP login
- Enforces key-only authentication
- Configures EU-compliant strong ciphers (aes256-gcm, chacha20-poly1305)
- Tests SSH configuration before applying (rollback on failure)
- Verifies .env file permissions (600)
- Prints a comprehensive security audit report

> **WARNING:** If you run this before setting up SSH keys, you will be locked out of the server!

---

## 10. GCS Storage Management

In the cloud variant, Google Cloud Storage handles all file uploads. There is no local `/opt/uploads` directory.

### 10.1 Bucket Setup

```bash
# Install gcloud CLI (if not already installed)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Create a bucket (choose region closest to your server and users)
gsutil mb -l europe-west1 gs://your-learnplay-bucket

# Enable versioning (strongly recommended — enables file-level recovery)
gsutil versioning set on gs://your-learnplay-bucket
```

### 10.2 Service Account Setup

```bash
# Create service account
gcloud iam service-accounts create learnplay-app \
  --display-name="LearnPlay Application"

# Grant Storage Object Admin on your bucket
gsutil iam ch \
  serviceAccount:learnplay-app@PROJECT_ID.iam.gserviceaccount.com:objectAdmin \
  gs://your-learnplay-bucket

# Create and download a JSON key
gcloud iam service-accounts keys create /tmp/gcs-key.json \
  --iam-account=learnplay-app@PROJECT_ID.iam.gserviceaccount.com

# Store it securely on the server
sudo mkdir -p /etc/learnplay
sudo cp /tmp/gcs-key.json /etc/learnplay/gcs-key.json
sudo chmod 600 /etc/learnplay/gcs-key.json
sudo chown learnplay:learnplay /etc/learnplay/gcs-key.json
```

### 10.3 GCS Authentication Options

The master installer and `configure-env.sh` support three authentication methods:

| Method | Environment Variable | When to Use |
|--------|---------------------|-------------|
| JSON string | `GOOGLE_SERVICE_ACCOUNT_JSON` | Easiest; paste full JSON into `.env` |
| Key file | `GOOGLE_APPLICATION_CREDENTIALS` | Key stored as a file; reference by path |
| ADC | (none needed) | Server already has `gcloud auth application-default login` |

To update GCS credentials after installation:
```bash
sudo lpadmin configure storage
```

### 10.4 Bucket Structure

LearnPlay organizes objects in the bucket as follows:

```
gs://your-bucket/
├── public/              — Publicly accessible files (course images, thumbnails)
│   ├── avatars/
│   ├── course-images/
│   └── thumbnails/
└── private/             — Private files (certificates, assignment submissions)
    ├── certificates/
    └── submissions/
```

### 10.5 CORS Configuration

If users upload files directly from the browser, configure CORS on the bucket:

```bash
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["https://your-domain.com"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set /tmp/cors.json gs://your-learnplay-bucket
```

### 10.6 Lifecycle Policies

Configure lifecycle policies to manage costs and compliance:

```bash
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": 365,
        "isLive": false
      }
    }
  ]
}
EOF

# Delete non-current (overwritten/deleted) versions after 1 year
gsutil lifecycle set /tmp/lifecycle.json gs://your-learnplay-bucket
```

### 10.7 Useful GCS Management Commands

```bash
# List all objects in bucket
gsutil ls -r gs://your-learnplay-bucket/

# Check bucket size
gsutil du -sh gs://your-learnplay-bucket

# View bucket IAM policy
gsutil iam get gs://your-learnplay-bucket

# Check versioning status
gsutil versioning get gs://your-learnplay-bucket

# List object versions (for recovery)
gsutil ls -a gs://your-learnplay-bucket/public/course-images/

# Restore a deleted object
gsutil cp "gs://your-bucket/path/to/file#GENERATION_NUMBER" gs://your-bucket/path/to/file

# Check CORS configuration
gsutil cors get gs://your-learnplay-bucket
```

### 10.8 File Storage in DR Backups

> **Important:** The disaster recovery backup (`dr-backup.sh`) covers the **database and configuration only**. File uploads in GCS are **not included** in DR backup archives because GCS manages redundancy and versioning at the infrastructure level.
>
> For compliance, enable GCS object versioning (Section 10.1) and consider cross-region replication for critical production deployments.

---

## 11. EU Security & GDPR Compliance

The installation scripts implement the following EU security measures:

### Authentication & Access Control
- **SSH key-only authentication** (after security lockdown)
- **Password quality policy:** minimum 12 characters, 3 character classes
- **Session timeout:** 15-minute auto-logout for inactive sessions
- **fail2ban:** Auto-bans IPs after 3 failed SSH attempts (2-hour ban)
- **Root login disabled** via SSH

### Encryption
- **In transit:** TLS 1.2+ with strong cipher suites (aes256-gcm, chacha20-poly1305)
- **Database connections:** SSL enabled (enforced for Neon by default)
- **GCS traffic:** Always encrypted in transit via HTTPS
- **Cookies:** Secure flag enabled (HTTPS only)
- **At rest (GCS):** Google encrypts all GCS data at rest by default using AES-256. For customer-managed encryption keys (CMEK), configure in the Google Cloud Console.
- **At rest (local disk):** Consider full-disk encryption (LUKS) for the server. This is not configured automatically but recommended for maximum compliance.

### Audit Logging
- **auditd** monitors:
  - User/group changes (`/etc/passwd`, `/etc/shadow`, `/etc/group`)
  - sudo usage and sudoers changes
  - SSH configuration changes
  - Application directory changes (`/opt/learnplay/`)
  - .env file access (read and write)
  - Cron job changes
  - Network configuration changes
- **GCS access logs:** Enable via Google Cloud Audit Logs in the console for complete file-access audit trail
- **Login/logout events** tracked
- **NTP time synchronization** ensures consistent timestamps across all audit logs

### Firewall & Network
- **UFW firewall** — default deny incoming, allow only SSH, HTTP, HTTPS
- **Kernel hardening** — SYN flood protection, source routing disabled, ICMP redirects blocked, martian packet logging
- **Shared memory hardening** — noexec, nosuid on /run/shm

### Automatic Updates
- **unattended-upgrades** automatically applies security patches
- Security-only updates with minimal steps to reduce risk

### Legal Notices
- **Login banner** warns that access is monitored and logged per GDPR requirements

### Data Residency
- GCS bucket region determines where file data is stored. Choose a region that meets your data residency requirements (e.g., `europe-west1` for EU data residency).
- For Neon database, select an EU region (e.g., `eu-central-1`).
- For local PostgreSQL, data stays on the server — ensure the server is in the correct jurisdiction.

### Backup Security
- Database backups stored with restricted permissions in `/lppbackups/`
- DR backup archives are encrypted:
  ```bash
  # Create encrypted DR backup
  sudo lpadmin dr-backup --encrypt

  # Decrypt when needed
  gpg --decrypt learnplay-dr-TIMESTAMP.tar.gz.enc > learnplay-dr-TIMESTAMP.tar.gz
  ```

### Disaster Recovery

LearnPlay includes a full disaster recovery system for the database and configuration.

**Creating a DR backup:**
```bash
sudo lpadmin dr-backup              # Interactive
sudo lpadmin dr-backup --encrypt    # With encryption
```

**What's included in a DR backup:**
- Complete database dump
- Environment configuration (encrypted)
- OS settings (SSH port, timezone, firewall rules)
- Nginx, SSL, and PM2 configurations
- Crontab and PostgreSQL tuning (if local PG)

**What is NOT included (managed by GCS):**
- File uploads (images, videos, documents, PDFs)

**Restoring from a DR backup (on a clean host):**
```bash
sudo bash /opt/learnplay/scripts/dr-restore.sh /lppbackups/disaster-recovery/dr_20260214.tar.gz
```

---

## 12. Performance Tuning Details

The `perf-tune.sh` script automatically detects your hardware and optimizes three layers:

### Layer 1: OS (Kernel Parameters)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `vm.swappiness` | 10 | Minimize swap usage, keep data in RAM |
| `vm.dirty_ratio` | 15 | Optimize write-back behavior |
| `vm.dirty_background_ratio` | 5 | Start flushing dirty pages earlier |
| `fs.file-max` | RAM_MB × 256 | Increase maximum open files |
| `net.core.somaxconn` | 65535 | TCP listen backlog |
| `net.ipv4.tcp_tw_reuse` | 1 | Reuse TIME_WAIT sockets |
| `net.ipv4.tcp_fin_timeout` | 15 | Faster TCP connection cleanup |
| `net.ipv4.tcp_keepalive_time` | 300 | Detect dead connections |

### Layer 2: PostgreSQL

**If using local PostgreSQL 18:**

| Setting | Formula | Example (8 GB RAM, 4 CPUs) |
|---------|---------|--------------------------|
| `shared_buffers` | 25% of RAM (max 8 GB) | 2048 MB |
| `effective_cache_size` | 75% of RAM | 6144 MB |
| `work_mem` | RAM / max_connections / 4 | 20 MB |
| `maintenance_work_mem` | RAM / 16 (max 2 GB) | 512 MB |
| `max_connections` | 100 | 100 |
| `wal_buffers` | 64 MB (16 MB if <4 GB RAM) | 64 MB |
| `max_parallel_workers` | CPU count - 2 | 2 |
| `checkpoint_completion_target` | 0.9 | 0.9 |
| `random_page_cost` | 1.1 (SSD) | 1.1 |

**If using Neon:** No local PostgreSQL tuning is needed. Neon is a fully managed service that handles its own performance optimization. The perf-tune.sh script will detect Neon usage and skip the PostgreSQL layer.

### Layer 3: Application

| Setting | Formula | Purpose |
|---------|---------|---------|
| `NODE_MAX_OLD_SPACE` | 60% of remaining RAM (min 512 MB, max 8 GB) | Node.js V8 heap limit |
| `PM2_INSTANCES` | 1 | Single instance for WebSocket/socket.io compatibility |
| `DB_POOL_MAX` | max_connections - 20 (max 50) | Connection pool upper bound |
| `DB_POOL_MIN` | DB_POOL_MAX / 5 (min 2) | Connection pool lower bound |

> **Why PM2 instances = 1?** LearnPlay uses socket.io which requires sticky sessions. Running multiple PM2 instances in cluster mode without a sticky session load balancer will cause WebSocket connections to fail. If you need horizontal scaling, put multiple servers behind an Nginx load balancer with `ip_hash`.

> **GCS upload performance:** For large file uploads, the server streams data to GCS rather than buffering to disk. Ensure the server has sufficient outbound bandwidth for the expected upload volume.

---

## 13. Edge Cases & Recovery

### 13.1 Script Re-Run Safety (Idempotency)

All scripts are safe to run multiple times:
- **User creation:** Checks if user exists before creating
- **Package installation:** Checks version before installing
- **Database:** Checks if user/database exists before creating
- **Configuration files:** Overwrites safely or checks for existing content
- **Cron jobs:** Removes existing entries before adding new ones

### 13.2 SSL/DNS Timing

If DNS hasn't propagated when the SSL step runs:
- The installer asks if you want to skip SSL setup
- The application works over HTTP until SSL is configured
- Retry SSL later: `sudo certbot --nginx -d your-domain.com`

### 13.3 Failed Database Migration Recovery

If a migration partially applies and fails:

1. **Check the error:**
   ```bash
   cat /var/log/learnplay-app-install.log
   # or during updates:
   cat /lppbackups/update_TIMESTAMP.log
   ```

2. **The code auto-rolls back, but the database does NOT.** Migrations are not wrapped in a single transaction.

3. **To restore the database to pre-migration state:**
   ```bash
   # Find the latest backup
   ls -lt /lppbackups/db_daily_*.sql.gz | head -1

   # For local PG:
   gunzip -c /lppbackups/db_daily_TIMESTAMP.sql.gz | sudo -u postgres psql learnplay

   # For Neon (requires psql with connection string):
   source /opt/learnplay/.env
   gunzip -c /lppbackups/db_daily_TIMESTAMP.sql.gz | psql "$DATABASE_URL"
   ```

### 13.4 Port Conflict

If the application port (default 3000) is already in use:
```bash
# Find what's using the port
sudo lsof -i :3000

# Option 1: Kill the conflicting process
sudo kill $(sudo lsof -t -i :3000)

# Option 2: Configure a custom port during installation via master-install.sh,
# or change PORT in /opt/learnplay/.env and restart
```

### 13.5 PostgreSQL 18 Not Available

If the PostgreSQL apt repository is unavailable:
- The `install-deps.sh` script adds the official PostgreSQL apt repository
- If that fails, PostgreSQL 16 from Ubuntu's default repos will work (minor version differences are handled)
- Manually add the repo: https://www.postgresql.org/download/linux/ubuntu/

Alternatively, use **Neon** as a hosted database to avoid local PostgreSQL entirely.

### 13.6 GCS Authentication Failures

If the application cannot reach GCS:

```bash
# Check which auth method is configured
sudo grep -E "GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS" /opt/learnplay/.env

# Test with the application user
sudo -u learnplay bash -c 'source /opt/learnplay/.env && node -e "
const {Storage}=require(\"@google-cloud/storage\");
const s=new Storage();
s.getBuckets().then(([b])=>console.log(\"OK:\",b.length,\"buckets\")).catch(e=>console.error(\"FAIL:\",e.message))
"'

# If using GOOGLE_SERVICE_ACCOUNT_JSON — verify it's valid JSON
sudo -u learnplay bash -c 'source /opt/learnplay/.env && echo "$GOOGLE_SERVICE_ACCOUNT_JSON" | python3 -m json.tool > /dev/null && echo "JSON valid" || echo "JSON invalid"'

# If using key file — verify permissions
ls -la $(grep GOOGLE_APPLICATION_CREDENTIALS /opt/learnplay/.env | cut -d= -f2)

# Update GCS credentials interactively
sudo lpadmin configure storage
```

### 13.7 Neon Connection Issues

If the database cannot connect to Neon:

```bash
# Test Neon connection string
source /opt/learnplay/.env
psql "$DATABASE_URL" -c "SELECT 1;" 2>&1

# Common issues:
# - Wrong connection string format (must include ?sslmode=require for Neon)
# - Firewall blocking outbound TCP on port 5432
# - Neon project is paused (check Neon console)

# Check if port 5432 outbound is allowed
sudo ufw status
# Ensure there's no outbound block on 5432

# Update DATABASE_URL
sudo lpadmin configure url
# or edit directly:
sudo nano /opt/learnplay/.env
sudo -u learnplay pm2 restart learnplay
```

### 13.8 GCS Bucket Permissions Errors

If you see "Permission denied" errors when the app tries to write to GCS:

```bash
# Check service account has objectAdmin on the bucket
gsutil iam get gs://your-bucket | grep -A2 "learnplay"

# Grant permissions if missing
gsutil iam ch \
  serviceAccount:learnplay-app@PROJECT_ID.iam.gserviceaccount.com:objectAdmin \
  gs://your-bucket

# Verify which project the service account belongs to
cat /etc/learnplay/gcs-key.json | python3 -m json.tool | grep "project_id"
```

### 13.9 Offline / Air-Gapped Installation

For servers without internet access:
1. On an internet-connected machine with the same Ubuntu version, download all packages
2. Transfer packages to the server via USB/local network
3. Install with `dpkg -i *.deb`
4. Download npm dependencies: `npm pack` each dependency
5. Transfer and install with `npm install --offline`

> **Note:** GCS requires internet access from the application server for file uploads. Air-gapped deployments with GCS will need a network path to `storage.googleapis.com`. If full air-gapping is required, use the on-premises build from this same `Cloud-On-Prem/` source tree (`onprem/`) with local filesystem storage.

### 13.10 Database Connection Pool Exhaustion

If you see "too many connections" errors:
1. Check current connections: `sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='learnplay';"` (local PG)
2. For Neon: check the connections tab in the Neon Console
3. Ensure `DB_POOL_MAX` in `.env` is within limits
4. Re-run `perf-tune.sh` to auto-calculate optimal values

### 13.11 Backup Encryption

For EU compliance, encrypt backups using the built-in encryption support:

```bash
# Encrypted DR backup (full system)
sudo lpadmin dr-backup --encrypt

# Encrypted daily database backups
sudo bash /opt/learnplay/scripts/db-backup.sh --encrypt
```

Both commands prompt for an encryption key interactively, or use the `LEARNPLAY_BACKUP_KEY` environment variable for automated/cron usage:

```bash
echo 'LEARNPLAY_BACKUP_KEY=your-strong-passphrase' | sudo tee -a /opt/learnplay/.env
```

---

## 14. Email DNS Configuration

For emails sent via MailerSend to reach inboxes (not spam), configure these DNS records:

### SPF Record

Add a TXT record to your domain:
```
Type: TXT
Name: @
Value: v=spf1 include:mailersend.net ~all
```

### DKIM Record

MailerSend provides a DKIM key in their dashboard. Add it as a TXT record:
```
Type: TXT
Name: mlsend._domainkey
Value: (provided by MailerSend)
```

### DMARC Record

Add a TXT record:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com
```

### Verify

Use MailerSend's domain verification tool to confirm all records are correct.

---

## 15. Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PLATFORM_ENV` | Platform environment identifier | `cloud` |
| `NODE_ENV` | Node.js environment | `production` |
| `PORT` | Express server port | `3000` |
| `BASE_URL` | Public URL of the application | `https://yourdomain.com` |
| `FRONTEND_URL` | Frontend URL (same as BASE_URL) | `https://yourdomain.com` |
| `VITE_DOMAIN` | Vite frontend domain | `https://yourdomain.com` |
| `DATABASE_URL` | PostgreSQL connection string | Neon: `postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require`; Local: `postgresql://learnplay:pass@localhost:5432/learnplay` |
| `SESSION_SECRET` | Session cookie encryption key (min 32 chars) | Generated with `openssl rand -hex 32` |
| `COOKIE_SECURE` | Enable secure cookies (HTTPS) | `true` |
| `PLATFORM_DOMAINS` | Allowed domains (comma-separated) | `yourdomain.com,www.yourdomain.com` |

### Google Cloud Storage Variables

At least one of these must be set:

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account key JSON as a single-line string |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key JSON file on the server |

If neither is set, the Google Cloud client library falls back to Application Default Credentials (ADC). This works if `gcloud auth application-default login` has been run as the `learnplay` user.

### Email Variables

At least one email method must be configured:

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_FROM` | Sender email address | `noreply@yourdomain.com` |
| `MAILERSEND_API_KEY` | MailerSend API key for emails | (empty — use SMTP instead) |
| `SMTP_HOST` | SMTP server hostname | (empty — use MailerSend instead) |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Require TLS for SMTP | `false` |
| `SMTP_USER` | SMTP authentication username | (empty — no auth) |
| `SMTP_PASS` | SMTP authentication password | (empty — no auth) |

### AI & Integration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key for AI | (empty — AI disabled) |
| `GEMENI_API_KEY` | Duplicate spelling (both supported for compatibility) | Same value as GEMINI_API_KEY |
| `GAMMA_API_KEY` | Gamma API key for presentations | (empty — presentations disabled) |
| `PAYMENT_GATEWAY_ENABLED` | Enable Yoco payment gateway | `true` |
| `YOCO_LIVE_SECRET_KEY` | Yoco live secret key | (empty — payments disabled) |
| `YOCO_LIVE_PUBLIC_KEY` | Yoco live public key | (empty) |

### Performance Variables (set automatically by perf-tune.sh)

| Variable | Description |
|----------|-------------|
| `MAX_OLD_SPACE_SIZE` | Node.js V8 heap limit in MB |
| `ENABLE_OPTIMIZED_POOL` | Enable connection pool optimization |
| `DB_POOL_MAX` | Maximum database connections |
| `DB_POOL_MIN` | Minimum database connections |

---

## 16. Administration Operations

### LearnPlay Admin CLI (`lpadmin`)

The primary tool for managing your LearnPlay installation is `lpadmin`. It provides both an interactive menu and direct CLI commands:

```bash
# Launch interactive menu
sudo lpadmin

# Direct CLI commands (examples)
sudo lpadmin status              # Application and service status
sudo lpadmin restart             # Restart the application
sudo lpadmin logs                # View application logs
sudo lpadmin backup              # Create a database backup
sudo lpadmin restore             # Restore from a database backup
sudo lpadmin dr-backup           # Create full system DR backup
sudo lpadmin dr-restore <file>   # Restore system from DR backup
sudo lpadmin ssl-mode            # Switch SSL mode
sudo lpadmin secrets             # Manage API keys and secrets
sudo lpadmin health              # Run health check
sudo lpadmin update              # Apply an update package
sudo lpadmin configure storage   # Update GCS credentials
sudo lpadmin configure smtp      # Update email configuration
sudo lpadmin configure url       # Update BASE_URL / domain
sudo lpadmin configure api-keys  # Update AI keys
```

> **Note:** `lpadmin` is installed as the very first step after extracting the archive (see Section 5). It can be reinstalled or updated at any time by re-running `sudo bash /path/to/scripts/lpadmin.sh setup` — the command is fully idempotent.

### 16.1 Daily Operations

```bash
# Check application status
sudo -u learnplay pm2 status

# View live logs
sudo -u learnplay pm2 logs learnplay --lines 100

# Check disk usage
df -h /opt/learnplay /opt/lpdb /var/log

# Check database connections (local PG)
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='learnplay';"

# Check GCS bucket usage
gsutil du -sh gs://your-learnplay-bucket
```

### 16.2 Application Management (PM2)

```bash
# Start application
sudo -u learnplay pm2 start ecosystem.config.cjs

# Stop application
sudo -u learnplay pm2 stop learnplay

# Restart application (graceful)
sudo -u learnplay pm2 restart learnplay

# Reload application (zero-downtime, if cluster mode)
sudo -u learnplay pm2 reload learnplay

# View detailed status
sudo -u learnplay pm2 describe learnplay

# Real-time monitoring (CPU, memory)
sudo -u learnplay pm2 monit

# Save process list (persists across reboots)
sudo -u learnplay pm2 save
```

### 16.3 Nginx Management

```bash
# Test configuration
sudo nginx -t

# Reload (no downtime)
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx

# View access log (live)
sudo tail -f /var/log/nginx/access.log

# View error log (live)
sudo tail -f /var/log/nginx/error.log

# Check rate limiting hits
sudo grep "limiting" /var/log/nginx/error.log | tail -20
```

### 16.4 Database Management

#### Local PostgreSQL 18

```bash
# Connect to database
sudo -u postgres psql -d learnplay

# Check database size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('learnplay'));"

# Check table sizes (top 10)
sudo -u postgres psql -d learnplay -c "
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;"

# Check active connections
sudo -u postgres psql -c "SELECT usename, state, count(*) FROM pg_stat_activity WHERE datname='learnplay' GROUP BY usename, state;"

# Restart PostgreSQL
sudo systemctl restart postgresql

# Reload configuration (no restart needed for most changes)
sudo systemctl reload postgresql
```

#### Neon (Managed Service)

For Neon, use the Neon Console at [console.neon.tech](https://console.neon.tech) for:
- Database size and table statistics
- Connection monitoring
- Query performance insights
- Branching and point-in-time recovery
- Connection string management

For CLI access with psql:
```bash
# Connect using the DATABASE_URL from .env
source /opt/learnplay/.env
psql "$DATABASE_URL"
```

### 16.5 GCS File Management

```bash
# List files in bucket
gsutil ls gs://your-learnplay-bucket/

# Check bucket size
gsutil du -sh gs://your-learnplay-bucket/

# Copy a file out of GCS (e.g. for investigation)
gsutil cp gs://your-bucket/public/course-images/example.jpg /tmp/

# Delete a specific file
gsutil rm gs://your-bucket/public/course-images/old-image.jpg

# List all versions of a file (if versioning enabled)
gsutil ls -a gs://your-bucket/public/course-images/example.jpg

# Restore a deleted file (get generation number from ls -a output)
gsutil cp "gs://your-bucket/public/course-images/example.jpg#GENERATION" \
  gs://your-bucket/public/course-images/example.jpg
```

### 16.6 Backup & Restore

```bash
# List backups
ls -lah /lppbackups/

# Manual database backup
sudo bash /opt/learnplay/scripts/db-backup.sh

# Restore database from backup (local PG)
gunzip -c /lppbackups/db_daily_TIMESTAMP.sql.gz | sudo -u postgres psql learnplay

# Restore database from backup (Neon)
source /opt/learnplay/.env
gunzip -c /lppbackups/db_daily_TIMESTAMP.sql.gz | psql "$DATABASE_URL"

# Check backup cron schedule
sudo crontab -l | grep learnplay

# Check last backup success
tail -5 /var/log/learnplay/backup.log
```

### 16.7 SSL Certificate Management

```bash
# View all certificates
sudo certbot certificates

# Renew certificates (dry run)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
sudo systemctl reload nginx

# Add new domain to certificate
sudo certbot --nginx -d newdomain.com

# Check certificate expiry
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### 16.8 Log Management

```bash
# View PM2 logs
sudo -u learnplay pm2 logs learnplay --lines 200

# Flush PM2 logs (clear log files)
sudo -u learnplay pm2 flush

# View backup logs
tail -50 /var/log/learnplay/backup.log

# View system audit log
sudo ausearch -k app_changes --start today

# View failed login attempts
sudo ausearch -k auth_log --start today

# View fail2ban status
sudo fail2ban-client status
sudo fail2ban-client status sshd

# Unban an IP
sudo fail2ban-client set sshd unbanip 1.2.3.4
```

### 16.9 Secret/Key Rotation

```bash
# Rotate SESSION_SECRET (will log out all users)
NEW_SECRET=$(openssl rand -hex 32)
sudo sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$NEW_SECRET/" /opt/learnplay/.env
sudo -u learnplay pm2 restart learnplay

# Update GCS credentials interactively
sudo lpadmin configure storage

# Update API keys interactively
sudo lpadmin configure api-keys

# Update any .env value manually
sudo nano /opt/learnplay/.env
sudo -u learnplay pm2 restart learnplay
```

### 16.10 Scaling After Hardware Upgrade

After adding more RAM or CPUs:

```bash
# Re-run performance tuning to auto-detect new hardware
sudo bash /opt/learnplay/scripts/perf-tune.sh

# Restart PostgreSQL to apply new settings (local PG only)
sudo systemctl restart postgresql

# Restart application to apply new memory limits
sudo -u learnplay pm2 restart learnplay
```

### 16.11 Health Monitoring

```bash
# Quick health check (replace 3000 with your custom PORT if configured)
curl -s http://127.0.0.1:3000/api/health | python3 -m json.tool

# Check system resources
free -h                    # Memory usage
top -bn1 | head -20        # CPU usage
iostat -x 1 3              # Disk I/O
netstat -tlnp              # Listening ports

# Monitor PM2 in real-time
sudo -u learnplay pm2 monit
```

### 16.12 Maintenance Schedule Reference

| Task | Schedule | Script |
|------|----------|--------|
| Database backup | Daily at 2:00 AM | `db-backup.sh` |
| VACUUM ANALYZE | Weekly (Sunday) at 3:00 AM (local PG only) | `learnplay-db-maintenance.sh` |
| SSL renewal | Automatic (certbot timer) | `certbot renew` |
| Security updates | Daily (automatic) | `unattended-upgrades` |
| Log rotation | Daily | `logrotate` |
| Old backup cleanup | During daily backup | 30 days (DB) |
| DR backup | Monthly (recommended) | `sudo lpadmin dr-backup --encrypt` |
| GCS cost review | Monthly | Neon/GCS Console |

---

## 17. Troubleshooting

### Application won't start

```bash
# Check PM2 status and error
sudo -u learnplay pm2 status
sudo -u learnplay pm2 logs learnplay --err --lines 50

# Check if the application port is available
sudo lsof -i :3000

# Check .env file exists and has correct permissions
ls -la /opt/learnplay/.env

# Verify Node.js version
node --version  # Must be v20.x.x
```

### Database connection errors

```bash
# Verify DATABASE_URL in .env
sudo grep DATABASE_URL /opt/learnplay/.env

# Test connection (works for both Neon and local PG)
source /opt/learnplay/.env
psql "$DATABASE_URL" -c "SELECT 1;"

# For local PG — check PostgreSQL is running
sudo systemctl status postgresql

# Check pg_hba.conf allows the connection (local PG only)
sudo cat $(find /etc/postgresql -name pg_hba.conf) | grep learnplay
```

### GCS authentication errors

```bash
# Check which credential method is in use
sudo grep -E "GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS" /opt/learnplay/.env

# Test GCS access as application user
sudo -u learnplay bash -c 'source /opt/learnplay/.env && node -e "
const {Storage}=require(\"@google-cloud/storage\");
new Storage().getBuckets().then(([b])=>console.log(\"OK\",b.length)).catch(e=>console.error(e.message))
"'

# Verify service account JSON is valid
sudo -u learnplay bash -c 'source /opt/learnplay/.env && echo "$GOOGLE_SERVICE_ACCOUNT_JSON" | python3 -m json.tool > /dev/null && echo OK || echo INVALID'

# Update GCS credentials
sudo lpadmin configure storage
```

### GCS permission denied on upload

```bash
# Verify bucket name in app config / .env
# Check IAM permissions
gsutil iam get gs://your-bucket | grep learnplay

# Grant permission if missing
gsutil iam ch serviceAccount:learnplay-app@PROJECT.iam.gserviceaccount.com:objectAdmin gs://your-bucket
```

### Neon connection refused / timeout

```bash
# Check DATABASE_URL format (must end with ?sslmode=require)
source /opt/learnplay/.env
echo "$DATABASE_URL" | grep -o "sslmode=require" || echo "WARNING: sslmode=require missing"

# Check outbound port 5432
nc -zv your-neon-host.neon.tech 5432

# Check if Neon project is paused
# Log into console.neon.tech and check project status

# Verify connection string has not expired (Neon connection pooler endpoints)
psql "$DATABASE_URL" -c "SELECT NOW();" 2>&1
```

### Nginx 502 Bad Gateway

```bash
# Application not running — start it
sudo -u learnplay pm2 start ecosystem.config.cjs

# Check if app is listening
curl -s http://127.0.0.1:3000/api/health

# Check Nginx error log
sudo tail -20 /var/log/nginx/error.log
```

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# DNS must resolve to this server
dig +short yourdomain.com

# Firewall must allow port 80 for ACME challenge
sudo ufw status | grep 80

# Re-run certbot
sudo certbot --nginx -d yourdomain.com
```

### Out of disk space

```bash
# Check which partitions are full
df -h

# Find large files
sudo du -sh /lppbackups/*
sudo du -sh /var/log/learnplay/*

# Clean old backups manually
sudo find /lppbackups -name "db_daily_*.sql.gz" -mtime +7 -delete

# Clean PM2 logs
sudo -u learnplay pm2 flush
```

### High memory usage

```bash
# Check what's using memory
free -h
ps aux --sort=-%mem | head -10

# Reduce Node.js memory limit
sudo sed -i "s/^MAX_OLD_SPACE_SIZE=.*/MAX_OLD_SPACE_SIZE=1024/" /opt/learnplay/.env
sudo -u learnplay pm2 restart learnplay

# For local PG — check PostgreSQL memory
sudo -u postgres psql -c "SHOW shared_buffers; SHOW effective_cache_size; SHOW work_mem;"
```

---

## Appendix A: PM2 Configuration Reference

The PM2 configuration file (`ecosystem.config.cjs`) is located at `/opt/learnplay/ecosystem.config.cjs`.

### Key Settings

| Setting | Value | Description |
|---------|-------|-------------|
| `name` | `learnplay` | PM2 process name |
| `script` | `./server/index.js` | Application entry point |
| `cwd` | `/opt/learnplay` | Working directory |
| `instances` | `1` | Number of instances (override with `PM2_INSTANCES` env var) |
| `exec_mode` | `fork` | Fork mode (cluster mode requires sticky session config) |
| `max_restarts` | `10` | Maximum restart attempts |
| `min_uptime` | `10s` | Minimum uptime before restart count resets |
| `restart_delay` | `5000` | Delay between restarts (ms) |
| `kill_timeout` | `10000` | Graceful shutdown timeout (ms) |
| `max_memory_restart` | Auto-calculated | Restart if memory exceeds 60% of available RAM |
| `error_file` | `/var/log/learnplay/error.log` | Error log location |
| `out_file` | `/var/log/learnplay/out.log` | Output log location |

### Useful PM2 Commands

```bash
# View status
sudo -u learnplay pm2 status

# View logs
sudo -u learnplay pm2 logs learnplay

# Restart application
sudo -u learnplay pm2 restart learnplay

# Stop application
sudo -u learnplay pm2 stop learnplay

# Monitor (real-time CPU/memory)
sudo -u learnplay pm2 monit

# Save process list (survives reboot)
sudo -u learnplay pm2 save
```

---

## Appendix B: Nginx Configuration Reference

The Nginx configuration is located at `/etc/nginx/sites-available/learnplay`.

### Key Configuration Details

| Feature | Configuration |
|---------|---------------|
| HTTP (port 80) | Redirects all traffic to HTTPS; serves ACME challenge for SSL renewal |
| HTTPS (port 443) | SSL termination with Let's Encrypt certificates |
| Rate Limiting — API | 30 requests/second per IP, burst of 50 |
| Rate Limiting — Login | 5 requests/minute per IP, burst of 3 |
| WebSocket | Full support via `/socket.io/` with 24-hour timeout |
| Static Files | Frontend bundle served from `/opt/learnplay/client/` |
| Upload Endpoint | File upload requests proxied to Express; Express streams to GCS — **not served from local filesystem** |
| Upload Size | Maximum 100 MB (`client_max_body_size`) |
| Security Headers | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, HSTS, Referrer-Policy |

> **Important difference from on-premises:** In the cloud variant, the Nginx configuration does **not** serve an `/uploads/` directory from the local filesystem. All file retrieval goes through the Express application, which fetches from Google Cloud Storage. This means there is no need for a large local uploads partition, but all file access incurs GCS API and egress costs.

### Nginx Commands

```bash
# Test configuration
sudo nginx -t

# Reload configuration (no downtime)
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# View error log
sudo tail -f /var/log/nginx/error.log

# View access log
sudo tail -f /var/log/nginx/access.log
```
