# LearnPlay On-Premises Update Guide

## 1. Overview

This guide covers how to update an existing LearnPlay on-premises deployment. The process involves three stages:

1. **Build** a new on-prem package from the Replit development environment
2. **Transfer** the package to your production server
3. **Run the update script** which handles backup, file replacement, migrations, and health verification

The update script (`update.sh`) is designed to be safe and reversible — it creates a full backup before making changes and automatically rolls back if the health check fails after the update.

---

## 2. Pre-Update Checklist

Before starting an update, verify the following on your production server:

- [ ] **Current deployment is healthy**
  ```bash
  sudo -u learnplay pm2 status
  curl -s http://127.0.0.1:3000/api/health
  ```
  > Replace `3000` with your custom `PORT` if configured.

- [ ] **Sufficient disk space** — need at least 2x current deployment size for the backup
  ```bash
  df -h /opt/learnplay /opt/uploads /opt/lpdb
  ```

- [ ] **Backup strategy is in place** — confirm you have a way to restore if needed

- [ ] **Database is accessible**
  ```bash
  sudo -u learnplay psql $DATABASE_URL -c "SELECT 1;"
  ```

- [ ] **Note current version** — record what version is currently deployed
  ```bash
  cat /opt/learnplay/version.json
  ```

- [ ] **Schedule a maintenance window** — updates typically take 2–5 minutes, during which the application will be briefly unavailable

- [ ] **Create a DR backup** (recommended before major updates)
  ```bash
  sudo lppadmin dr-backup --encrypt
  ```
  This creates a full system snapshot you can use to restore everything if the update goes badly.

---

## 3. Building the Update Package

Run these commands on your **Replit development environment**:

```bash
cd /home/runner/workspace

# Step 1: Export latest platform data (catalog/configuration tables)
bash onprem/export-platform-data.sh

# Step 2: Build the on-prem package
bash onprem/build-onprem.sh

# Step 3: Create a distributable archive
tar czf learnplay-onprem-update-$(date +%Y%m%d).tar.gz dist-onprem/
```

### What the Build Script Does

The `build-onprem.sh` script performs the following steps:

1. **Cleans the build directory** — removes any previous `dist-onprem/` output
2. **Swaps cloud-specific files with on-prem variants** — temporarily replaces `server/db.ts`, `server/migrate.ts`, and `server/objectStorage.ts` with their on-prem counterparts (`db-onprem.ts`, `migrate-onprem.ts`, `objectStorage-onprem.ts`)
3. **Builds the frontend** — runs Vite to produce optimized static assets in `dist-onprem/client/`
4. **Bundles the server** — uses esbuild to create a single `dist-onprem/server/index.js` bundle with external packages
5. **Restores cloud files** — uses a trap-based cleanup mechanism to guarantee original cloud files are restored even if the build fails or is interrupted
6. **Builds the migration runner** — separately bundles `migrate-onprem.ts` into `dist-onprem/scripts/migrate.js`
7. **Copies SQL migrations** — copies all `.sql` files and the `meta/` journal from `migrations/`
8. **Generates `package.json`** — creates a minimal package.json with only production dependencies needed for on-prem
9. **Generates `version.json`** — records the build timestamp, git commit hash, git branch, and platform identifier
10. **Copies deployment templates** — includes `.env.example`, `ecosystem.config.cjs`, `nginx.conf.template`, and all scripts (`install.sh`, `update.sh`, `server-prep.sh`, etc.)

### What the Export Script Does

The `export-platform-data.sh` script exports 38 platform configuration/catalog tables from the development database as JSON files into `dist-onprem/data/`. These are read-only catalog tables (achievements, themes, pricing, etc.) — not user or transactional data.

---

## 4. Transferring to Server

### Download from Replit

Use the Replit file browser to download the archive, or use SCP if you have SSH access configured.

### Upload to Server

```bash
scp learnplay-onprem-update-YYYYMMDD.tar.gz user@your-server:/tmp/
```

### Extract on Server

```bash
cd /tmp
tar xzf learnplay-onprem-update-YYYYMMDD.tar.gz
```

This creates `/tmp/dist-onprem/` containing all the updated files and scripts.

---

## 5. Running the Update

Execute the update script with root privileges:

```bash
sudo bash /tmp/dist-onprem/scripts/update.sh
```

Or via the admin CLI:

```bash
sudo lppadmin update
```

> **Note:** The script must be run as root (`sudo`) because it needs to manage file ownership and the PM2 process under the `learnplay` user.

### What Happens During the Update

| Step | Action | Details |
|------|--------|---------|
| 1 | **Pre-update health check** | Verifies the app is currently running via PM2 |
| 2 | **Backup creation** | Copies `server/`, `client/`, `package.json`, `version.json`, `.env`, and `ecosystem.config.cjs` to `/lppbackups/backup_TIMESTAMP/` |
| 3 | **Database backup** | Runs `pg_dump` to save a full database snapshot to the backup directory |
| 4 | **PM2 stop** | Gracefully stops the application (with a 3-second wait) |
| 5 | **File update** | Copies new `server/`, `client/`, `migrations/`, `scripts/`, `package.json`, and `version.json` to `/opt/learnplay/`. **Preserves** `.env` and `ecosystem.config.cjs` |
| 6 | **Dependencies** | Runs `npm install --omit=dev` to install any new or updated packages |
| 7 | **Database migrations** | Runs pending Drizzle migrations via `scripts/migrate.js` |
| 8 | **Platform data sync** | If `dist-onprem/data/` contains JSON files, copies them and runs `import-platform-data.js` to UPSERT platform table data |
| 9 | **File asset sync** | If `dist-onprem/uploads/` exists, uses `rsync --ignore-existing` to add new upload files without overwriting existing ones |
| 10 | **Frontend domain replacement** | If `BASE_URL` is set in `.env`, replaces any `https://learnplay.replit.app` references in frontend `.js` and `.html` files |
| 11 | **PM2 restart** | Starts the application using `ecosystem.config.cjs` |
| 12 | **Health check** | Waits 8 seconds, then checks `http://127.0.0.1:$PORT/api/health` (default port 3000) up to 5 times with 3-second intervals |
| 13 | **Auto-rollback** | If all health checks fail, automatically restores the previous version (see Section 8) |
| 14 | **Cleanup** | Keeps the last 5 backups, deletes older ones |

### Expected Output

```
[2025-01-15 14:30:00] 🚀 LearnPlay Update Starting
[2025-01-15 14:30:00] ======================================
[2025-01-15 14:30:00] 🔍 Pre-update health check...
[2025-01-15 14:30:01] 💾 Creating backup...
[2025-01-15 14:30:05] 💾 Backing up database...
[2025-01-15 14:30:10] ✅ Backup saved to: /lppbackups/backup_20250115_143000
[2025-01-15 14:30:10] ⏸️  Stopping application...
[2025-01-15 14:30:13] 📦 Updating application files...
[2025-01-15 14:30:14] 📦 Updating dependencies...
[2025-01-15 14:30:25] 🔄 Running database migrations...
[2025-01-15 14:30:27] 📦 Syncing platform data...
[2025-01-15 14:30:30] 🚀 Starting application...
[2025-01-15 14:30:38] ✅ Update successful! Application is healthy.
[2025-01-15 14:30:38] 🧹 Cleaning old backups...
[2025-01-15 14:30:38] 📋 Update log saved to: /lppbackups/update_20250115_143000.log
```

---

## 6. Database Migration Details

### How Drizzle Migrations Work

- Migrations are SQL files stored in the `migrations/` directory (e.g., `0000_rainy_morbius.sql`, `0001_convert_answer_columns_to_jsonb.sql`)
- Drizzle tracks which migrations have been applied in a `__drizzle_migrations` meta table
- Only new (unapplied) migrations run during an update
- Migrations are executed in order based on their filename prefix (`0000_`, `0001_`, `0002_`, etc.)

### Verifying Migrations

```bash
# Check which migrations have been applied (most recent first)
sudo -u learnplay node --env-file=/opt/learnplay/.env -e "
const pg = require('pg');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
pool.query('SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5')
  .then(r => { console.table(r.rows); pool.end(); });
"

# List all migration files on disk
ls -la /opt/learnplay/migrations/*.sql
```

### If a Migration Fails

1. Check the error output in the update log at `/lppbackups/update_TIMESTAMP.log`
2. The application code will be automatically rolled back to the previous version
3. The database changes from the failed migration may be partially applied (migrations are not wrapped in a single transaction by default)
4. To fully restore the database to its pre-update state:
   ```bash
   sudo -u postgres psql learnplay < /lppbackups/backup_TIMESTAMP/database_TIMESTAMP.sql
   ```

### 6.5 Failed Migration Recovery Procedure

If a database migration fails partway through, the update script will automatically roll back the **code** but **NOT** the database. This is intentional — automatic database rollback could cause data loss.

**Step-by-step recovery:**

1. **Identify what failed:**
   ```bash
   # Check the update log
   cat /lppbackups/update_TIMESTAMP.log | grep -A5 "migration"
   
   # Check which migrations were applied
   sudo -u postgres psql -d learnplay -c "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;"
   ```

2. **Check database state:**
   ```bash
   # Look for partially created tables or columns
   sudo -u postgres psql -d learnplay -c "\dt"
   sudo -u postgres psql -d learnplay -c "\d table_name"  -- check specific table
   ```

3. **Option A — Restore from backup (recommended if recent):**
   ```bash
   # Find the pre-update backup
   ls -lt /lppbackups/backup_*/database_*.sql
   
   # Restore (WARNING: this overwrites ALL data since the backup)
   sudo -u learnplay pm2 stop learnplay
   sudo -u postgres psql -c "DROP DATABASE learnplay;"
   sudo -u postgres psql -c "CREATE DATABASE learnplay OWNER learnplay;"
   sudo -u postgres psql learnplay < /lppbackups/backup_TIMESTAMP/database_TIMESTAMP.sql
   sudo -u learnplay pm2 start ecosystem.config.cjs
   ```

4. **Option B — Fix the migration manually:**
   ```bash
   # Read the failed migration SQL
   cat /opt/learnplay/migrations/XXXX_migration_name.sql
   
   # Manually apply or reverse the remaining statements
   sudo -u postgres psql -d learnplay
   # Then run the SQL statements manually
   ```

5. **After recovery, verify:**
   ```bash
   # Replace 3000 with your custom PORT if configured
   curl -s http://127.0.0.1:3000/api/health
   sudo -u learnplay pm2 logs learnplay --lines 20
   ```

---

## 7. Platform Data Sync

### Which Tables Get Updated

38 platform tables containing configuration and catalog data are synced during an update:

| Category | Tables |
|----------|--------|
| **Core Platform** | `platformConfiguration`, `platformPricing`, `platformPaymentSettings`, `platformCostCategories`, `platformCostCategoryTypes`, `platformRevenueSources`, `systemSettings` |
| **Gamification** | `achievementCatalog`, `cosmeticCatalog`, `powerUpCatalog`, `gamificationEconomyRules`, `challengeTemplates`, `adminChallengeConfig`, `seasonPassConfig`, `seasonPassTiers` |
| **Commerce** | `businessPackages`, `businessPackagePrices`, `creditPurchasePackages`, `subscriptionPlans`, `elearningSubscriptionPlans`, `shopItemPricing`, `quizCreditPricing`, `lessonCreditPricingSettings`, `currencyConversionRates` |
| **Content** | `courseCategories`, `courseTags`, `subjects`, `supportedLanguages`, `explanationTerms`, `termDefinitions`, `universalStatUnits`, `collectionStatTypes` |
| **Cards & Collections** | `cardCollections`, `cards` |
| **Themes & AI** | `brandingThemes`, `gammaImageStyles`, `gammaThemes`, `aiConfig` |

### Import Order

Tables are imported in a specific order defined in `import-platform-data.sh` to respect foreign key dependencies. Foundation tables (e.g., `universalStatUnits`, `supportedLanguages`, `subjects`) are imported first, followed by tables that reference them.

### How UPSERT Works

For each row in a JSON data file:

- **If a row with that `id` already exists:** UPDATE all columns with the new values
- **If no row with that `id` exists:** INSERT the new row
- **Existing rows NOT in the data file:** Left untouched (never deleted)

After all imports, database sequences are automatically reset to the correct maximum values.

### What Data is Preserved vs Overwritten

| Data Category | Behavior |
|---------------|----------|
| **User data** (users, profiles, progress, etc.) | Never touched |
| **Transactional data** (orders, payments, invoices) | Never touched |
| **Platform configuration matching by ID** | Updated with new values |
| **New platform items** (new achievements, themes, pricing tiers) | Inserted |
| **Existing rows not in the update** | Never deleted |
| **On-prem customizations with unique IDs** | Preserved (no deletions) |

---

## 8. Rollback Procedure

### Automatic Rollback

If the health check fails after an update (all 5 attempts fail), the script automatically:

1. Stops the new version via PM2
2. Restores `server/`, `client/`, `package.json`, and `version.json` from the backup
3. Fixes file ownership (`chown -R learnplay:learnplay`)
4. Reinstalls dependencies (`npm install --omit=dev`)
5. Restarts PM2 with the old version

> **Important:** The automatic rollback does **NOT** restore the database. This is intentional — automatically reverting the database could cause data loss if any user activity occurred between the migration and the rollback. A warning message is logged with the manual database restore command.

### Manual Rollback

If you need to manually roll back to a previous version:

```bash
# 1. Find available backups
ls -la /lppbackups/

# 2. Stop the application
sudo -u learnplay pm2 stop learnplay

# 3. Restore code files
BACKUP="/lppbackups/backup_TIMESTAMP"
sudo cp -r "$BACKUP/server" /opt/learnplay/
sudo cp -r "$BACKUP/client" /opt/learnplay/
sudo cp "$BACKUP/package.json" /opt/learnplay/
sudo cp "$BACKUP/version.json" /opt/learnplay/
sudo chown -R learnplay:learnplay /opt/learnplay

# 4. Reinstall dependencies for the old version
cd /opt/learnplay && sudo npm install --omit=dev

# 5. (Optional) Restore database — CAUTION: overwrites ALL current data
sudo -u postgres psql learnplay < "$BACKUP/database_TIMESTAMP.sql"

# 6. Restart the application
sudo -u learnplay pm2 start ecosystem.config.cjs
```

> **Warning:** Restoring the database dump will overwrite all data that was written since the backup was taken. Only do this if you are certain no important data was created after the update began.

---

## 9. Post-Update Verification

After a successful update, run these checks to confirm everything is working:

```bash
# Check the application is running
sudo -u learnplay pm2 status

# Verify the new version
cat /opt/learnplay/version.json

# Health check endpoint (replace 3000 with your custom PORT if configured)
curl -s http://127.0.0.1:3000/api/health

# Check recent logs for errors
sudo -u learnplay pm2 logs learnplay --lines 50

# Verify database connectivity
sudo -u learnplay node --env-file=/opt/learnplay/.env -e "
const pg = require('pg');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
pool.query('SELECT count(*) FROM users').then(r => { console.log('Users:', r.rows[0].count); pool.end(); });
"

# Check file permissions
ls -la /opt/learnplay/
ls -la /opt/uploads/
```

If any check fails, review the update log:

```bash
# Find the most recent update log
ls -lt /lppbackups/update_*.log | head -1

# Read it
cat /lppbackups/update_TIMESTAMP.log
```

---

## 10. Version Tracking

### version.json Format

Each build generates a `version.json` file with the following structure:

```json
{
  "version": "20250115143000",
  "buildDate": "2025-01-15T14:30:00Z",
  "gitCommit": "abc1234",
  "gitBranch": "main",
  "platform": "onprem"
}
```

| Field | Description |
|-------|-------------|
| `version` | Build timestamp in `YYYYMMDDHHmmSS` format — higher value = newer build |
| `buildDate` | ISO 8601 UTC timestamp of when the package was built |
| `gitCommit` | Short git commit hash identifying the exact code revision |
| `gitBranch` | Git branch the build was created from |
| `platform` | Always `"onprem"` for on-premises builds |

### Checking Current Version

```bash
cat /opt/learnplay/version.json
```

### Comparing Versions

- The `version` field is a sortable timestamp — a higher number means a newer build
- The `gitCommit` tells you exactly which code revision is deployed
- Compare with the Replit source using `git log --oneline` to see what changes are included

### Update History

Every update creates a timestamped log file:

```bash
# List all update logs
ls -la /lppbackups/update_*.log

# Read the most recent update log
cat /lppbackups/update_$(ls -t /lppbackups/update_*.log | head -1 | xargs basename | sed 's/update_//;s/.log//')*.log
```

Backup directories also serve as a version history — each `backup_TIMESTAMP/` contains the complete previous version's code and database snapshot.

---

## 11. Edge Cases

### 11.1 Running Update While Users Are Active

The update script stops the application briefly. During this time:
- Active users will see connection errors
- WebSocket connections will drop and auto-reconnect after restart
- Scheduled a maintenance window during off-peak hours

### 11.2 Update Script Re-Run Safety

The update script is **safe to run again** if it fails partway:
- Backup is created at the start (won't overwrite existing backup from same run)
- File copy operations overwrite cleanly
- npm install is idempotent
- Migration runner skips already-applied migrations
- Platform data import uses UPSERT (insert or update)

### 11.3 Large Database Backups

If the database is very large (>5GB), the backup step may take several minutes:
- Ensure sufficient disk space: need the database size + current backup size
- Consider running a manual backup before the update if time is critical
- Monitor progress: `watch -n1 "ls -lh /lppbackups/backup_*/database_*"`

### 11.4 Disk Space During Update

The update requires temporary disk space for:
- Backup of current version (~100-500MB for code)
- Database dump (~varies, check with `pg_database_size`)
- New code extraction (~100-500MB)
- npm install (~200-500MB)

Check available space before updating:
```bash
df -h /opt/learnplay /opt/uploads /opt/lpdb /tmp
```

### 11.5 Configuration Preservation

The update script **preserves** these files (never overwrites):
- `/opt/learnplay/.env` — Your configuration
- `/opt/learnplay/ecosystem.config.cjs` — PM2 configuration
- `/opt/uploads/` — All uploaded files

### 11.6 Rollback Does Not Restore Database

**Critical:** The automatic rollback restores code files only. The database is NOT automatically restored because:
- Users may have created data between the migration and the rollback
- Automatic DB restore could cause irreversible data loss

If you need to fully restore, manually restore the database from the backup (see Section 6.5).

---

## 12. Quick Admin Commands Reference

### Application

| Action | Command |
|--------|---------|
| Status | `sudo -u learnplay pm2 status` |
| Logs | `sudo -u learnplay pm2 logs learnplay --lines 100` |
| Restart | `sudo -u learnplay pm2 restart learnplay` |
| Stop | `sudo -u learnplay pm2 stop learnplay` |
| Monitor | `sudo -u learnplay pm2 monit` |
| Health check | `curl -s http://127.0.0.1:3000/api/health` (replace `3000` with your custom `PORT` if configured) |

### Database

| Action | Command |
|--------|---------|
| Connect | `sudo -u postgres psql -d learnplay` |
| Size | `sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('learnplay'));"` |
| Connections | `sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='learnplay';"` |
| Manual backup | `sudo -u postgres pg_dump learnplay \| gzip > /lppbackups/db_manual_$(date +%Y%m%d).sql.gz` |
| Manual VACUUM | `sudo -u postgres psql -d learnplay -c "VACUUM ANALYZE;"` |

### Nginx

| Action | Command |
|--------|---------|
| Test config | `sudo nginx -t` |
| Reload | `sudo systemctl reload nginx` |
| Error log | `sudo tail -f /var/log/nginx/error.log` |
| Access log | `sudo tail -f /var/log/nginx/access.log` |

### SSL

| Action | Command |
|--------|---------|
| View certs | `sudo certbot certificates` |
| Test renewal | `sudo certbot renew --dry-run` |
| Force renew | `sudo certbot renew --force-renewal && sudo systemctl reload nginx` |

### Disaster Recovery

| Action | Command |
|--------|---------|
| Create DR backup | `sudo lppadmin dr-backup` |
| Create encrypted DR backup | `sudo lppadmin dr-backup --encrypt` |
| Restore from DR backup | `sudo lppadmin dr-restore /lppbackups/disaster-recovery/dr_TIMESTAMP.tar.gz` |
| List DR backups | `ls -lh /lppbackups/disaster-recovery/` |

### Admin CLI

| Action | Command |
|--------|---------|
| Interactive menu | `sudo lppadmin` |
| Quick status | `sudo lppadmin status` |
| Health check | `sudo lppadmin health` |
| View logs | `sudo lppadmin logs` |
| Manage secrets | `sudo lppadmin secrets` |
| Switch SSL mode | `sudo lppadmin ssl-mode` |

### System

| Action | Command |
|--------|---------|
| Disk usage | `df -h /opt/learnplay /opt/uploads /opt/lpdb` |
| Memory | `free -h` |
| Version | `cat /opt/learnplay/version.json` |
| Firewall | `sudo ufw status` |
| fail2ban | `sudo fail2ban-client status sshd` |
| Backup log | `tail -10 /var/log/learnplay/backup.log` |

---

## 13. Troubleshooting

### Update script fails with "Must be run as root"

Run the script with `sudo`:
```bash
sudo bash /tmp/dist-onprem/scripts/update.sh
```

### Database backup is skipped

The script attempts `pg_dump` as the `postgres` user. If this fails:
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Verify the `learnplay` database exists: `sudo -u postgres psql -l | grep learnplay`
- You can manually back up before updating: `sudo -u postgres pg_dump learnplay > /tmp/learnplay-backup.sql`

### Application won't start after update

1. Check PM2 logs: `sudo -u learnplay pm2 logs learnplay --lines 100`
2. Check if `.env` is intact: `cat /opt/learnplay/.env`
3. Check if `ecosystem.config.cjs` is intact: `cat /opt/learnplay/ecosystem.config.cjs`
4. Verify Node.js version: `node --version` (requires Node.js 20+)
5. If needed, perform a manual rollback (see Section 8)

### Platform data import fails

This is non-fatal — the update will continue. Common causes:
- Table schema mismatch (a migration may need to run first)
- JSON data file is corrupted or empty

Check the update log for specific error messages and re-run the import manually if needed:
```bash
sudo -u learnplay node --env-file=/opt/learnplay/.env /opt/learnplay/scripts/import-platform-data.js
```

### Frontend shows old domain references

If `BASE_URL` was not set in `.env` during the update, cloud domain references may remain. Fix manually:
```bash
export BASE_URL="https://your-domain.com"
find /opt/learnplay/client -name "*.js" -exec sed -i "s|https://learnplay.replit.app|$BASE_URL|g" {} +
find /opt/learnplay/client -name "*.html" -exec sed -i "s|https://learnplay.replit.app|$BASE_URL|g" {} +
```

---

## 14. Disaster Recovery After Failed Update

If an update causes catastrophic failure and neither automatic nor manual rollback can fix the problem, use the Disaster Recovery system to restore the entire platform from a previous backup.

### Prerequisites

- A DR backup archive (created before the update via `sudo lppadmin dr-backup`)
- A clean or partially working host (same or new server)

### Full System Recovery

```bash
# 1. If you have a DR backup from before the update:
sudo lppadmin dr-restore /lppbackups/disaster-recovery/dr_TIMESTAMP.tar.gz --full

# 2. If restoring to a completely new host:
#    First, transfer the DR archive and the on-prem package to the new host
scp /lppbackups/disaster-recovery/dr_TIMESTAMP.tar.gz user@new-server:/tmp/
scp learnplay-onprem.tar.gz user@new-server:/tmp/

#    Then on the new host:
cd /tmp && tar xzf learnplay-onprem.tar.gz
sudo bash /tmp/dist-onprem/scripts/dr-restore.sh /tmp/dr_TIMESTAMP.tar.gz --full
```

### What Gets Restored

| Component | Details |
|-----------|---------|
| Database | Complete PostgreSQL dump with all user data |
| Uploads | All uploaded files (documents, presentations, images) |
| Configuration | `.env` file (decrypted from backup) |
| Nginx | Site config, rate limits, SSL certificates |
| PM2 | Process manager configuration |
| OS settings | SSH port, timezone, firewall rules |
| Cron jobs | Backup schedules, maintenance tasks |

### Domain Change During Recovery

If restoring to a server with a different domain:

```bash
sudo lppadmin dr-restore /path/to/dr_backup.tar.gz --new-domain new.example.com
```

This automatically updates `BASE_URL` in `.env` and rewrites Nginx configuration.

### Regular DR Backup Schedule

Set up regular DR backups to ensure you always have a recent restore point:

```bash
# Monthly encrypted DR backup (add to root crontab)
echo '0 3 1 * * LEARNPLAY_BACKUP_KEY=your-passphrase /opt/learnplay/scripts/dr-backup.sh --encrypt --yes >> /var/log/learnplay/dr-backup.log 2>&1' | sudo tee -a /var/spool/cron/crontabs/root
```

> **Tip:** DR backups are stored in `/lppbackups/disaster-recovery/` and the system automatically keeps the last 3 archives (configurable via `LEARNPLAY_DR_RETENTION` environment variable).
