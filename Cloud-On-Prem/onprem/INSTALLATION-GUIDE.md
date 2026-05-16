# LearnPlay On-Premises Installation Guide

> **Version:** 2.0  
> **Last Updated:** February 2026  
> **Audience:** System administrators deploying LearnPlay on self-hosted infrastructure

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Filesystem Layout](#3-filesystem-layout)
4. [Building the On-Prem Package](#4-building-the-on-prem-package)
5. [Transferring Files to Server](#5-transferring-files-to-server)
6. [Installation Methods](#6-installation-methods)
7. [DNS & SSL Setup](#7-dns--ssl-setup)
8. [Verification](#8-verification)
9. [Security Lockdown](#9-security-lockdown)
10. [Database Table Classification](#10-database-table-classification)
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

This guide covers the complete process of deploying LearnPlay on your own server infrastructure. A sysadmin should be able to follow this document from start to finish without any other reference.

### Deployment Architecture

```
┌──────────────┐      ┌───────────────┐      ┌──────────────────┐
│   Browser    │─────▶│  Nginx (443)  │─────▶│  Express (3000)  │
│   Client     │      │  Reverse Proxy│      │  Node.js + PM2   │
└──────────────┘      │  + SSL/TLS    │      └────────┬─────────┘
                      │  + Rate Limit │               │
                      │  + Static     │      ┌────────▼─────────┐
                      │    Files      │      │  PostgreSQL 16   │
                      └───────────────┘      │  (localhost:5432) │
                                             └──────────────────┘
```

> **Note:** Ports shown above are defaults. All ports are configurable during installation via `master-install.sh` and stored in `.env` as `PORT`, `DB_PORT`, `NGINX_HTTP_PORT`, and `NGINX_HTTPS_PORT`.

**Components:**

- **Express Server** — Node.js application serving the API and frontend (default port 3000, configurable via `PORT`)
- **PostgreSQL 16** — Relational database for all application data
- **Nginx** — Reverse proxy handling SSL termination, static file serving, rate limiting, and WebSocket proxying
- **PM2** — Process manager for automatic restarts, memory management, and logging

### Automated Installation Scripts

The deployment package includes a complete suite of automated scripts:

| Script | Purpose |
|--------|---------|
| `master-install.sh` | **Recommended** — Orchestrator that collects all inputs once, then runs everything unattended |
| `os-prep.sh` | OS hardening, firewall, fail2ban, auditd, EU security standards |
| `install-deps.sh` | Install Node.js 20, PostgreSQL 16, Nginx, Certbot, PM2 |
| `db-setup.sh` | PostgreSQL user, database, SSL, automated backups, maintenance |
| `perf-tune.sh` | Auto-detect hardware and optimize OS, database, and application settings |
| `app-install.sh` | Deploy application, generate .env, migrations, Nginx, SSL, PM2 |
| `security-lockdown.sh` | Post-install: disable password SSH, enforce key-only auth, security audit |
| `lpadmin.sh` | **Admin CLI** — 17-option interactive menu for all management operations |
| `service-control.sh` | Start, stop, restart, and monitor application and database services |
| `ssl-mode.sh` | Switch between Let's Encrypt, self-signed, and HTTP-only SSL modes |
| `secrets-manager.sh` | Manage API keys and secrets in `.env` with rotation support |
| `db-backup.sh` | Full and incremental database backups with WAL archiving |
| `db-restore.sh` | Point-in-time database recovery from full or WAL backups |
| `dr-backup.sh` | **Disaster Recovery** — Full system backup (DB, uploads, configs, .env) |
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
| Storage | 40 GB SSD | 100+ GB SSD | 250+ GB NVMe |
| Network | 100 Mbps | 1 Gbps | 1 Gbps |

> **Note:** Storage requirements scale with file uploads (course documents, presentations, images). Plan for additional storage if you expect heavy course content creation.

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

---

## 3. Filesystem Layout

### Recommended Partition Layout

| Mount Point | Size | Mount Options | Usage |
|-------------|------|---------------|-------|
| `/boot` | 1GB | | Boot files |
| `/boot/efi` | 512MB | | EFI partition |
| `/` | 20 GB | `defaults` | OS, packages, system files |
| `/opt` | 10 GB | `defaults,nosuid` | |
| `/home/lppadmin` | 10GB | `defaults,nosuid` | LearnPlay Admin Home |
| `/opt/learnplay` | 10 GB | `defaults,nosuid` | Application code |
| `/opt/lpdb` | 50+ GB | `defaults,nosuid` | Database files |
| `/opt/uploads` | 80 GB | `defaults,nosuid` | LearnPlay Uploads |
| `/lppbackups` | 50+ GB | `defaults,nosuid` | Database backups, DR archives |
| `/var/log` | 10 GB | `defaults,nosuid,noexec` | Application and system logs |
| `/tmp` | 10 GB | `defaults,nosuid,noexec,nodev` | Temporary files |
| swap | Equal to RAM | — | Swap space |

### Backup Mount Point

LearnPlay requires a dedicated backup mount at `/lppbackups` (recommended minimum 50+ GB):

```bash
# Create mount point
sudo mkdir -p /lppbackups

# If using a dedicated disk/partition (recommended):
sudo mkfs.ext4 /dev/sdX1
echo '/dev/sdX1 /lppbackups ext4 defaults,nosuid 0 2' | sudo tee -a /etc/fstab
sudo mount /lppbackups

# If not using a dedicated disk (not recommended for production):
sudo mkdir -p /lppbackups
```

The backup directory structure:
```
/lppbackups/
├── full/                   — Full database backups (pg_dump)
├── base/                   — Base backups (pg_basebackup for PITR)
├── wal/                    — WAL archive files
├── nginx/                  — Nginx configuration backups
└── disaster-recovery/      — Full system DR backup archives
```

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

/opt/uploads/                    — LearnPlay Uploads
├── public/                     — Publicly accessible uploads
└── private/                    — Private/protected uploads

/opt/lpdb/onprem/pg16/main      — PostgreSQL data files (on-prem runtime)

/var/log/learnplay/             — Application logs
├── out.log                     — PM2 stdout log
├── error.log                   — PM2 stderr log
├── backup.log                  — Backup cron log
└── maintenance.log             — Database maintenance log
```

### Disk Space Monitoring

Set up alerts for disk space. The application may crash if any partition reaches 95%:

```bash
# Check current disk usage
df -h /opt/learnplay /opt/uploads /opt/lpdb /var/log

# The perf-tune.sh script creates a monitoring cron (see Section 12)
```

---

## 4. Building the On-Prem Package

These commands are run **on the Replit workspace** (not on the target server).

### 4.1 Export Platform Data from Cloud Database

```bash
cd /home/runner/workspace
bash onprem/export-platform-data.sh
```

This exports 38 platform configuration/catalog tables as JSON files into `dist-onprem/data/`.

### 4.2 Build the On-Prem Package

```bash
bash onprem/build-onprem.sh
```

The build script:
1. Cleans the `dist-onprem/` directory
2. Swaps cloud-specific files with on-prem variants (db, migrate, objectStorage)
3. Builds the frontend with Vite
4. Bundles the server with esbuild
5. Restores cloud files (trap-based safety)
6. Builds the migration runner
7. Copies SQL migrations, deployment templates, and scripts
8. Generates `package.json` with on-prem dependencies only
9. Generates `version.json` with build metadata

### 4.3 Create Distributable Archive

```bash
cd /home/runner/workspace
tar czf learnplay-onprem.tar.gz dist-onprem/
```

### 4.4 Download the Archive

Download `learnplay-onprem.tar.gz` from Replit to your local machine for transfer to the server.

---

## 5. Transferring Files to Server

### From Your Local Machine

```bash
scp learnplay-onprem.tar.gz lppadmin@your-server:/tmp/
```

### On the Server

```bash
cd /tmp
tar xzf learnplay-onprem.tar.gz
```

This creates `/tmp/dist-onprem/` containing all files and scripts.

### First Step: Set Up the lppadmin Command

**This is the very first thing you should do after extracting the archive.** Run this before anything else:

```bash
sudo bash /tmp/dist-onprem/scripts/lpadmin.sh setup
```

This command automatically:
1. **Copies all scripts** from `/tmp/dist-onprem/scripts/` to their permanent location at `/opt/learnplay/scripts/` (so they survive `/tmp` cleanup and reboots)
2. **Creates the `lppadmin` symlink** at `/usr/local/bin/lppadmin` pointing to `/opt/learnplay/scripts/lpadmin.sh`
3. **Installs the welcome screen** (MOTD) that shows system status on every SSH login
4. **Creates the log directory** at `/var/log/learnplay`

From this point on, manage LearnPlay using:

```bash
sudo lppadmin            # Interactive menu
sudo lppadmin help       # List all commands
```

> **Safe to re-run anytime:** This command is fully idempotent. On re-runs it detects what's already installed, updates only what has changed, and skips what's already current. Use it after applying an update package or when reinstalling.

> **Why this step is critical:** The `/tmp` directory is routinely cleaned by the operating system. Running setup copies scripts to `/opt/learnplay/scripts/` (a permanent location) so the `lppadmin` command keeps working after `/tmp` cleanup or reboots.

---

## 6. Installation Methods

### Method 1: Master Installer (Recommended)

The master installer collects all inputs upfront, then runs the entire installation unattended:

```bash
sudo bash /tmp/dist-onprem/scripts/master-install.sh
```

**What it asks for (once, at the beginning):**

| Prompt | What to Enter | Required |
|--------|---------------|----------|
| SSH port | Custom SSH port (default: 22) | No |
| Timezone | Server timezone (default: UTC) | No |
| Domain name | Fully qualified domain (e.g., `learn.example.com`) | Yes |
| Admin email | Email for SSL certs and alerts | Yes |
| Database password | Strong password, or Enter to auto-generate | No |
| Email setup | SMTP (own mail server) or MailerSend (API key) | No |
| SMTP Host/Port/TLS | Mail server details (if SMTP chosen) | If SMTP |
| SMTP Username/Password | Mail server credentials (if auth required) | No |
| Gemini API Key | For AI features | No |
| Gamma API Key | For presentation generation | No |
| Set up SSL? | Y/n for Let's Encrypt | No |

After collecting inputs, it runs these phases automatically:
1. **OS Preparation** — Firewall, fail2ban, auditd, kernel hardening, EU security
2. **Dependency Installation** — Node.js 20, PostgreSQL 16, Nginx, Certbot, PM2
3. **Database Setup** — User, database, SSL, backups, maintenance schedules
4. **Performance Tuning** — Auto-detect hardware, optimize OS/DB/App
5. **Application Deployment** — .env generation, npm install, migrations, Nginx, SSL, PM2

Total time: approximately 10-20 minutes.

### Method 2: Individual Scripts

Run each script separately for more control:

```bash
# Step 1: OS hardening
sudo bash /tmp/dist-onprem/scripts/os-prep.sh

# Step 2: Install dependencies
sudo bash /tmp/dist-onprem/scripts/install-deps.sh

# Step 3: Database setup
sudo bash /tmp/dist-onprem/scripts/db-setup.sh

# Step 4: Performance tuning
sudo bash /tmp/dist-onprem/scripts/perf-tune.sh

# Step 5: Deploy application
sudo bash /tmp/dist-onprem/scripts/app-install.sh
```

Each script logs to `/var/log/learnplay-{script-name}.log`.

### Non-Interactive Mode

All scripts support environment variables for fully automated (non-interactive) deployment:

```bash
export LEARNPLAY_SSH_PORT=22
export LEARNPLAY_TIMEZONE=UTC
export LEARNPLAY_DOMAIN=learn.example.com
export LEARNPLAY_ADMIN_EMAIL=admin@example.com
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
export LEARNPLAY_SETUP_SSL=Y

sudo -E bash /tmp/dist-onprem/scripts/master-install.sh
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

# Database connectivity
sudo -u postgres psql -d learnplay -c "SELECT count(*) FROM users;"

# Nginx status
sudo nginx -t
sudo systemctl status nginx

# SSL certificate
sudo certbot certificates

# Firewall
sudo ufw status

# System services
systemctl is-active postgresql nginx pm2-learnplay
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

## 10. Database Table Classification

LearnPlay uses **167 tables** classified into two categories:

### Platform Tables (38 tables — exported from cloud, imported to on-prem)

These tables contain platform-wide configuration, catalog data, and definitions. They are exported from the cloud instance and imported during installation.

| Table | Description |
|-------|-------------|
| `achievementCatalog` | Achievement definitions and unlock criteria |
| `adminChallengeConfig` | Challenge system configuration settings |
| `aiConfig` | AI service configuration and model settings |
| `brandingThemes` | Branding and theme definitions |
| `businessPackagePrices` | Pricing tiers for business packages |
| `businessPackages` | Business package definitions and features |
| `cardCollections` | Trading card collection definitions |
| `cards` | Trading card definitions and metadata |
| `challengeTemplates` | Challenge template definitions |
| `collectionStatTypes` | Stat type definitions for card collections |
| `cosmeticCatalog` | Cosmetic item catalog (avatars, effects) |
| `courseCategories` | Course category taxonomy |
| `courseTags` | Course tagging definitions |
| `creditPurchasePackages` | Credit purchase package options |
| `currencyConversionRates` | Currency exchange rate definitions |
| `elearningSubscriptionPlans` | E-learning subscription plan definitions |
| `explanationTerms` | Terms linked to quiz explanations |
| `gamificationEconomyRules` | Gamification economy balance rules |
| `gammaImageStyles` | AI image generation style presets |
| `gammaThemes` | Gamma theme definitions for presentations |
| `lessonCreditPricingSettings` | Lesson credit pricing configuration |
| `platformConfiguration` | Global platform configuration values |
| `platformCostCategories` | Platform cost tracking categories |
| `platformCostCategoryTypes` | Cost category type definitions |
| `platformPaymentSettings` | Payment gateway configuration |
| `platformPricing` | Platform pricing rules and margins |
| `platformRevenueSources` | Revenue source definitions |
| `powerUpCatalog` | Power-up item catalog for games |
| `quizCreditPricing` | Quiz credit pricing tiers |
| `seasonPassConfig` | Season pass configuration |
| `seasonPassTiers` | Season pass tier definitions and rewards |
| `shopItemPricing` | In-app shop item pricing |
| `subjects` | Subject/topic definitions |
| `subscriptionPlans` | Subscription plan definitions |
| `supportedLanguages` | Supported language list |
| `systemSettings` | System-wide settings and defaults |
| `termDefinitions` | Glossary term definitions |
| `universalStatUnits` | Universal stat unit definitions for cards |

### Transactional Tables (132 tables — start empty on fresh install)

These tables store user-generated data, transactions, and runtime state. They begin empty and are populated as users interact with the platform.

| Table | Description |
|-------|-------------|
| `achievementUnlocks` | User achievement unlock records |
| `activeOneVOneGames` | Active 1v1 game sessions |
| `activePowerUps` | Currently active power-ups in games |
| `activeQuizGames` | Active quiz game sessions |
| `bulkQuizGenerationJobs` | Bulk quiz generation job queue |
| `cardStats` | Individual card statistics |
| `certificates` | User course completion certificates |
| `challengeProgress` | User challenge progress tracking |
| `coinAdjustments` | Coin balance adjustment records |
| `coinTransactions` | Coin transaction history |
| `contentTranslationJobs` | Content translation job queue |
| `cosmeticOwnership` | User cosmetic item ownership |
| `courseAssignments` | Course-to-user/group assignments |
| `courseDraftDocuments` | Documents attached to course drafts |
| `courseDraftFrameworks` | AI-generated course draft frameworks |
| `courseDrafts` | Course draft records |
| `courseFrameworks` | Published course frameworks |
| `courseLessons` | Lesson-to-course associations |
| `coursePayoutLineItems` | Individual payout line items |
| `coursePayouts` | Course creator payout records |
| `coursePriceHistory` | Course price change history |
| `courseProgress` | User course progress tracking |
| `coursePurchases` | Course purchase transaction records |
| `courseRatings` | Course rating/review moderation records |
| `courseRefunds` | Course refund records |
| `courseReviews` | User course reviews and ratings |
| `courses` | Course definitions and metadata |
| `courseVersionNotifications` | Course version update notifications |
| `courseVersions` | Course version history |
| `courseUpgradeOrders` | Course version upgrade purchase orders |
| `courseVersionUpgrades` | Course version upgrade tracking |
| `creditOrders` | Credit purchase orders |
| `creditTransactions` | Credit transaction ledger |
| `creditUsageLogs` | Credit usage audit logs |
| `dailyStreaks` | User daily activity streaks |
| `emailLogs` | Outbound email log |
| `equippedCosmetics` | Currently equipped cosmetic items |
| `exchangeRateHistory` | Exchange rate history records |
| `financialAuditLog` | Financial transaction audit trail |
| `gameResults` | Completed game result records |
| `gameRooms` | Multiplayer game room state |
| `gammaCreditLedger` | Gamma (AI) credit usage ledger |
| `gammaCreditSnapshots` | Gamma credit balance snapshots |
| `guestSessions` | Guest/anonymous session tracking |
| `joinRequestApprovalTokens` | Organization join request approval tokens |
| `joinRequests` | Organization join requests |
| `leaderBoard` | Leaderboard entries |
| `lessonAccessLogs` | Lesson access audit log |
| `lessonAssignments` | Lesson-to-user/group assignments |
| `lessonContentVersions` | Lesson content version history |
| `lessonPresentationVersions` | Lesson presentation version history |
| `lessonProgress` | User lesson progress tracking |
| `lessonProgressSlides` | Per-slide progress tracking |
| `lessonQuizLinks` | Lesson-to-quiz linkages |
| `lessons` | Lesson definitions and content |
| `lessonScopeAssignments` | Lesson scope-based assignments |
| `lessonSlides` | Lesson slide content |
| `lessonTranslationJobs` | Lesson translation job queue |
| `lessonVersions` | Lesson version history |
| `licenseFlagAudit` | License flag change audit trail |
| `licenseFlagOverrides` | License flag override records |
| `licensePayments` | License payment records |
| `licenseRolloutBetaUsers` | License beta user list |
| `licenseRolloutOrganizations` | License rollout org list |
| `loginStreaks` | User login streak tracking |
| `lpCreditLedger` | LP credit ledger entries |
| `notificationPreferences` | User notification preferences |
| `organizationBankDetails` | Organization banking/payout details |
| `organizationDomains` | Organization domain associations |
| `organizationLicenses` | Organization license records |
| `organizationLicenseSettings` | Organization license configuration |
| `organizationPackageAssignments` | Package-to-organization assignments |
| `organizationPackageOverrides` | Package override settings per org |
| `organizations` | Organization accounts and profiles |
| `organizationSubUnits` | Organization sub-unit hierarchy |
| `organizationTeams` | Organization team groupings |
| `organizationUnits` | Organization unit hierarchy |
| `organizationUsageLimits` | Organization usage limit settings |
| `orgCreditLedger` | Organization credit ledger |
| `packageChangeEvents` | Package change event log |
| `packageRecommendationDismissals` | Dismissed package recommendations |
| `paymentFulfillments` | Payment fulfillment records |
| `paymentIntents` | Payment intent records |
| `paymentTransactions` | Payment transaction records |
| `paymentWebhookEvents` | Payment webhook event log |
| `payoutBatches` | Payout batch processing records |
| `payoutDisbursements` | Individual payout disbursements |
| `pendingGammaJobs` | Pending AI generation jobs |
| `platformCostAllocations` | Platform cost allocation records |
| `platformCostEntries` | Platform cost entry records |
| `platformFinancialAuditLog` | Platform financial audit trail |
| `platformFinancialSnapshots` | Platform financial snapshots |
| `platformReportJobs` | Platform report generation jobs |
| `platformReportSchedules` | Scheduled platform report definitions |
| `platformRevenueReports` | Generated platform revenue reports |
| `playerSeasonRewards` | Player season pass reward claims |
| `playerSessions` | Active player game sessions |
| `playerStats` | Player statistics and XP |
| `postFulfillmentJobs` | Post-payment fulfillment job queue |
| `powerUpInventory` | User power-up inventory |
| `quizCardExplanations` | Quiz card explanation content |
| `quizCards` | Quiz card definitions |
| `quizCardVersions` | Quiz card version history |
| `quizCollectionAssignments` | Quiz-to-collection assignments |
| `quizCollections` | Quiz collection groupings |
| `quizCollectionVersions` | Quiz collection version history |
| `quizDrafts` | Quiz draft records |
| `quizGameProgress` | Per-question quiz game progress |
| `quizGameResults` | Quiz game result records |
| `reviewModerationActions` | Review moderation action log |
| `salesInquiries` | Sales inquiry submissions |
| `seasonPassProgress` | User season pass progress |
| `seasonPassPurchases` | Season pass purchase records |
| `sessions` | Active user sessions (connect-pg-simple) |
| `subscriptionEvents` | Subscription lifecycle events |
| `subscriptionInvoices` | Subscription invoice records |
| `subscriptions` | Active subscription records |
| `unitSubjects` | Unit-to-subject associations |
| `userCosmeticLoadouts` | User cosmetic loadout configurations |
| `userCourseEnrollments` | User course enrollment records |
| `userCourseLessonProgress` | User per-lesson progress within courses |
| `userCreditAdjustments` | User credit adjustment records |
| `userCreditAllocations` | User credit allocation records |
| `userLicenses` | User license records |
| `userNotifications` | User notification records |
| `userOrganizationAssignments` | User-to-organization assignments |
| `userOrganizationRoles` | User roles within organizations |
| `userQuizProgress` | User quiz progress records |
| `users` | User accounts and profiles |
| `webhookEvents` | Webhook event log |
| `webhookRegistrations` | Webhook endpoint registrations |

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
- **Database connections:** SSL enabled for PostgreSQL
- **Cookies:** Secure flag enabled (HTTPS only)
- **At rest:** Consider full-disk encryption (LUKS) for the `/var/lib` partition. This is not configured automatically but recommended for maximum compliance.

### Audit Logging
- **auditd** monitors:
  - User/group changes (`/etc/passwd`, `/etc/shadow`, `/etc/group`)
  - sudo usage and sudoers changes
  - SSH configuration changes
  - Application directory changes (`/opt/learnplay/`)
  - .env file access (read and write)
  - Cron job changes
  - Network configuration changes
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

### Backup Security
- Database backups stored with restricted permissions in `/lppbackups/`
- **Recommended:** For full EU compliance, encrypt backups at rest:
  ```bash
  # Encrypt a backup
  gpg --symmetric --cipher-algo AES256 /lppbackups/db_daily_TIMESTAMP.sql.gz
  
  # Decrypt when needed
  gpg --decrypt db_daily_TIMESTAMP.sql.gz.gpg > db_daily_TIMESTAMP.sql.gz
  ```

### Disaster Recovery

LearnPlay includes a full disaster recovery system that can backup and restore the entire platform.

**Creating a DR backup:**
```bash
sudo lppadmin dr-backup              # Interactive
sudo lppadmin dr-backup --encrypt    # With encryption
```

**What's included in a DR backup:**
- Complete database dump
- All uploaded files (documents, images, videos)
- Environment configuration (encrypted)
- OS settings (SSH port, timezone, firewall rules)
- Nginx, SSL, and PM2 configurations
- Crontab and PostgreSQL tuning

**Restoring from a DR backup (on a clean host):**
```bash
sudo lppadmin dr-restore /lppbackups/disaster-recovery/dr_20260214.tar.gz
sudo lppadmin dr-restore /path/to/dr_backup.tar.gz --full  # With OS prep + deps
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

| Setting | Formula | Example (8GB RAM, 4 CPUs) |
|---------|---------|---------------------------|
| `shared_buffers` | 25% of RAM (max 8GB) | 2048MB |
| `effective_cache_size` | 75% of RAM | 6144MB |
| `work_mem` | RAM / max_connections / 4 | 20MB |
| `maintenance_work_mem` | RAM / 16 (max 2GB) | 512MB |
| `max_connections` | 100 | 100 |
| `wal_buffers` | 64MB (16MB if <4GB RAM) | 64MB |
| `max_parallel_workers` | CPU count - 2 | 2 |
| `checkpoint_completion_target` | 0.9 | 0.9 |
| `random_page_cost` | 1.1 (SSD) | 1.1 |

### Layer 3: Application

| Setting | Formula | Purpose |
|---------|---------|---------|
| `NODE_MAX_OLD_SPACE` | 60% of remaining RAM (min 512MB, max 8GB) | Node.js V8 heap limit |
| `PM2_INSTANCES` | 1 | Single instance for WebSocket/socket.io compatibility |
| `DB_POOL_MAX` | max_connections - 20 (max 50) | Connection pool upper bound |
| `DB_POOL_MIN` | DB_POOL_MAX / 5 (min 2) | Connection pool lower bound |

> **Why PM2 instances = 1?** LearnPlay uses socket.io which requires sticky sessions. Running multiple PM2 instances in cluster mode without a sticky session load balancer will cause WebSocket connections to fail. If you need horizontal scaling, put multiple servers behind an Nginx load balancer with `ip_hash`.

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
   
   # Restore
   gunzip -c /lppbackups/db_daily_TIMESTAMP.sql.gz | sudo -u postgres psql learnplay
   ```

4. **If no backup exists,** you may need to manually fix the partial migration by examining the SQL file and reversing applied statements.

### 13.4 Port Conflict

If the application port (default 3000) is already in use:
```bash
# Find what's using the port (replace 3000 with your configured PORT if customized)
sudo lsof -i :3000

# Option 1: Kill the conflicting process
sudo kill $(sudo lsof -t -i :3000)

# Option 2: Configure a custom port during installation via master-install.sh,
# or change PORT in /opt/learnplay/.env and restart the application
```

### 13.5 PostgreSQL 16 Not Available

If the PostgreSQL apt repository is unavailable:
- The `install-deps.sh` script adds the official PostgreSQL apt repository
- If that fails, PostgreSQL 15 from Ubuntu's default repos will work (minor version differences are handled)
- Manually add the repo: https://www.postgresql.org/download/linux/ubuntu/

### 13.6 Offline / Air-Gapped Installation

For servers without internet access:
1. On an internet-connected machine with the same Ubuntu version, download all packages:
   ```bash
   apt-get download nodejs postgresql-16 nginx certbot pm2 # etc.
   ```
2. Transfer packages to the server via USB/local network
3. Install with `dpkg -i *.deb`
4. Download npm dependencies on the connected machine: `npm pack` each dependency
5. Transfer and install with `npm install --offline`

> **Note:** This is an advanced scenario. Contact your system administrator for guidance.

### 13.7 Database Connection Pool Exhaustion

If you see "too many connections" errors:
1. Check current connections: `sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='learnplay';"`
2. Ensure `DB_POOL_MAX` in `.env` is less than PostgreSQL's `max_connections`
3. Re-run `perf-tune.sh` to auto-calculate optimal values

### 13.8 Backup Encryption

For EU compliance, encrypt backups using the built-in encryption support:

```bash
# Encrypted DR backup (full system)
sudo lppadmin dr-backup --encrypt

# Encrypted daily database backups
sudo bash /opt/learnplay/scripts/db-backup.sh --encrypt
```

Both commands prompt for an encryption key interactively, or use the `LEARNPLAY_BACKUP_KEY` environment variable for automated/cron usage:

```bash
# Set encryption key for automated backups
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
| `PLATFORM_ENV` | Platform environment identifier | `onprem` |
| `NODE_ENV` | Node.js environment | `production` |
| `PORT` | Express server port (configurable during installation) | `3000` |
| `BASE_URL` | Public URL of the application | `https://yourdomain.com` |
| `FRONTEND_URL` | Frontend URL (same as BASE_URL) | `https://yourdomain.com` |
| `VITE_DOMAIN` | Vite frontend domain | `https://yourdomain.com` |
| `DATABASE_URL` | PostgreSQL connection string (port configurable via `DB_PORT`, default 5432) | `postgresql://learnplay:pass@localhost:5432/learnplay` |
| `SESSION_SECRET` | Session cookie encryption key (min 32 chars) | Generated with `openssl rand -hex 32` |
| `COOKIE_SECURE` | Enable secure cookies (HTTPS) | `true` |
| `UPLOAD_DIR` | File upload storage path | `/opt/uploads` |
| `PLATFORM_DOMAINS` | Allowed domains (comma-separated) | `yourdomain.com,www.yourdomain.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_FROM` | Sender email address | `noreply@yourdomain.com` |
| `MAILERSEND_API_KEY` | MailerSend API key for emails | (empty — use SMTP instead) |
| `SMTP_HOST` | SMTP server hostname | (empty — use MailerSend instead) |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Require TLS for SMTP | `false` |
| `SMTP_USER` | SMTP authentication username | (empty — no auth) |
| `SMTP_PASS` | SMTP authentication password | (empty — no auth) |
| `GEMENI_API_KEY` | Google Gemini API key for AI | (empty — AI disabled) |
| | **Note:** Both `GEMENI_API_KEY` and `GEMINI_API_KEY` spellings are supported for backward compatibility. | |
| `GAMMA_API_KEY` | Gamma API key for presentations | (empty — presentations disabled) |
| `ENABLE_OPTIMIZED_POOL` | Enable optimized DB connection pool | `true` |
| `DB_POOL_MAX` | Max DB connections | Auto-calculated |
| `DB_POOL_MIN` | Min DB connections | Auto-calculated |
| `MAX_OLD_SPACE_SIZE` | Node.js memory limit (MB) | Auto-calculated |

### Performance Variables (set by perf-tune.sh)

| Variable | Description |
|----------|-------------|
| `MAX_OLD_SPACE_SIZE` | Node.js V8 heap limit in MB |
| `ENABLE_OPTIMIZED_POOL` | Enable connection pool optimization |
| `DB_POOL_MAX` | Maximum database connections |
| `DB_POOL_MIN` | Minimum database connections |

---

## 16. Administration Operations

### LearnPlay Admin CLI (`lppadmin`)

The primary tool for managing your LearnPlay installation is `lppadmin`. It provides both an interactive menu and direct CLI commands:

```bash
# Launch interactive menu (17 options)
sudo lppadmin

# Direct CLI commands (examples)
sudo lppadmin status              # Application and service status
sudo lppadmin restart             # Restart the application
sudo lppadmin logs                # View application logs
sudo lppadmin backup              # Create a database backup
sudo lppadmin restore             # Restore from a database backup
sudo lppadmin dr-backup           # Create full system DR backup
sudo lppadmin dr-restore <file>   # Restore system from DR backup
sudo lppadmin ssl-mode            # Switch SSL mode
sudo lppadmin secrets             # Manage API keys and secrets
sudo lppadmin health              # Run health check
sudo lppadmin update              # Apply an update package
```

> **Note:** `lppadmin` is installed as the very first step after extracting the archive (see Section 5). It can be reinstalled or updated at any time by re-running `sudo bash /path/to/scripts/lpadmin.sh setup` — the command is fully idempotent. Option 16 in the menu also re-runs setup if needed.

### 16.1 Daily Operations

```bash
# Check application status
sudo -u learnplay pm2 status

# View live logs
sudo -u learnplay pm2 logs learnplay --lines 100

# Check disk usage
df -h /opt/learnplay /opt/uploads /opt/lpdb /var/log

# Check database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='learnplay';"
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

# View startup script configuration
pm2 startup systemd -u learnplay --hp /opt/learnplay
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

### 16.4 PostgreSQL Management

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

# Check slow queries (logged queries over 1 second)
sudo -u postgres psql -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '1 second'
AND state = 'active'
ORDER BY duration DESC;"

# Manual VACUUM ANALYZE
sudo -u postgres psql -d learnplay -c "VACUUM ANALYZE;"

# Check if autovacuum is running
sudo -u postgres psql -c "SELECT relname, last_vacuum, last_autovacuum, last_analyze FROM pg_stat_user_tables ORDER BY last_autovacuum DESC NULLS LAST LIMIT 10;"

# Restart PostgreSQL
sudo systemctl restart postgresql

# Reload configuration (no restart needed for most changes)
sudo systemctl reload postgresql
```

### 16.5 Backup & Restore

```bash
# List backups
ls -lah /lppbackups/

# Manual database backup
sudo -u postgres pg_dump learnplay | gzip > /lppbackups/db_manual_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore database from backup
gunzip -c /lppbackups/db_daily_TIMESTAMP.sql.gz | sudo -u postgres psql learnplay

# Backup uploads
tar czf /lppbackups/uploads_manual_$(date +%Y%m%d).tar.gz /opt/uploads/

# Restore uploads
tar xzf /lppbackups/uploads_manual_TIMESTAMP.tar.gz -C /

# Check backup cron schedule
sudo crontab -l | grep learnplay

# Check last backup success
tail -5 /var/log/learnplay/backup.log
```

### 16.6 SSL Certificate Management

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
# Note: Replace 443 with your custom NGINX_HTTPS_PORT if configured
```

### 16.7 Log Management

```bash
# View PM2 logs
sudo -u learnplay pm2 logs learnplay --lines 200

# Flush PM2 logs (clear log files)
sudo -u learnplay pm2 flush

# View backup logs
tail -50 /var/log/learnplay/backup.log

# View maintenance logs
tail -50 /var/log/learnplay/maintenance.log

# View system audit log
sudo ausearch -k app_changes --start today

# View failed login attempts
sudo ausearch -k auth_log --start today

# View fail2ban status
sudo fail2ban-client status
sudo fail2ban-client status sshd

# Unban an IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# Check log rotation status
sudo logrotate --debug /etc/logrotate.d/learnplay
```

### 16.8 Secret/Key Rotation

```bash
# Rotate SESSION_SECRET (will log out all users)
NEW_SECRET=$(openssl rand -hex 32)
sudo sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$NEW_SECRET/" /opt/learnplay/.env
sudo -u learnplay pm2 restart learnplay

# Update API keys
sudo nano /opt/learnplay/.env
# Edit the relevant key, save, then:
sudo -u learnplay pm2 restart learnplay
```

### 16.9 Scaling After Hardware Upgrade

After adding more RAM or CPUs:

```bash
# Re-run performance tuning to auto-detect new hardware
sudo bash /opt/learnplay/scripts/perf-tune.sh

# Restart PostgreSQL to apply new settings
sudo systemctl restart postgresql

# Restart application to apply new memory limits
sudo -u learnplay pm2 restart learnplay
```

### 16.10 Health Monitoring

```bash
# Quick health check (replace 3000 with your custom PORT if configured)
curl -s http://127.0.0.1:3000/api/health | python3 -m json.tool

# Check system resources
free -h                    # Memory usage
top -bn1 | head -20        # CPU usage
iostat -x 1 3              # Disk I/O
netstat -tlnp              # Listening ports

# Check PostgreSQL performance
sudo -u postgres psql -c "SELECT * FROM pg_stat_database WHERE datname='learnplay';"

# Monitor PM2 in real-time
sudo -u learnplay pm2 monit
```

### 16.11 Maintenance Schedule Reference

| Task | Schedule | Script |
|------|----------|--------|
| Database backup | Daily at 2:00 AM | `/usr/local/bin/learnplay-backup.sh` |
| Upload backup | Weekly (Sunday) at 2:00 AM | `/usr/local/bin/learnplay-backup.sh` |
| VACUUM ANALYZE | Weekly (Sunday) at 3:00 AM | `/usr/local/bin/learnplay-db-maintenance.sh` |
| SSL renewal | Automatic (certbot timer) | `certbot renew` |
| Security updates | Daily (automatic) | `unattended-upgrades` |
| Log rotation | Daily | `logrotate` |
| Old backup cleanup | During daily backup | 30 days (DB), 90 days (uploads) |
| DR backup | Monthly (recommended) | `sudo lppadmin dr-backup --encrypt` |

---

## 17. Troubleshooting

### Application won't start

```bash
# Check PM2 status and error
sudo -u learnplay pm2 status
sudo -u learnplay pm2 logs learnplay --err --lines 50

# Check if the application port is available (replace 3000 with your custom PORT if configured)
sudo lsof -i :3000

# Check .env file exists and has correct permissions
ls -la /opt/learnplay/.env

# Verify Node.js version
node --version  # Must be v20.x.x
```

### Database connection errors

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
sudo -u postgres psql -d learnplay -c "SELECT 1;"

# Check pg_hba.conf allows the connection
sudo cat $(find /etc/postgresql -name pg_hba.conf) | grep learnplay

# Check DATABASE_URL in .env
sudo grep DATABASE_URL /opt/learnplay/.env
```

### Nginx 502 Bad Gateway

```bash
# Application not running — start it
sudo -u learnplay pm2 start ecosystem.config.cjs

# Check if app is listening (replace 3000 with your custom PORT if configured)
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

# Check PostgreSQL memory
sudo -u postgres psql -c "SHOW shared_buffers; SHOW effective_cache_size; SHOW work_mem;"

# Reduce Node.js memory limit
sudo sed -i "s/^MAX_OLD_SPACE_SIZE=.*/MAX_OLD_SPACE_SIZE=1024/" /opt/learnplay/.env
sudo -u learnplay pm2 restart learnplay
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
| Static Files | `/uploads/` served directly from filesystem with 30-day cache |
| Upload Size | Maximum 100 MB (`client_max_body_size`) |
| Security Headers | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, HSTS, Referrer-Policy |

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
