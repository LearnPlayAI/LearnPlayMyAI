# LearnPlay Cloud (Linux) -- Ubuntu 24.04 Developer Setup Guide

This guide takes you from a fresh Ubuntu 24.04 machine to a running local development
environment, and through building and deploying to a Linux production server.
All commands run natively in bash -- no WSL2 or Windows tooling required.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Node.js 20 LTS](#2-install-nodejs-20-lts)
3. [Install Git](#3-install-git)
4. [Open the Project](#4-open-the-project)
5. [Install Dependencies](#5-install-dependencies)
6. [Configure Environment Variables](#6-configure-environment-variables)
7. [Database Setup and Data Import](#7-database-setup-and-data-import)
8. [Run in Development Mode](#8-run-in-development-mode)
9. [Build the Distribution Package](#9-build-the-distribution-package)
10. [Transfer to Linux Server](#10-transfer-to-linux-server)
- [Migrating Files from the Replit Object Store](#migrating-files-from-the-replit-object-store)
- [Using Google Antigravity IDE](#using-google-antigravity-ide)
- [Ubuntu Quick Reference](#ubuntu-quick-reference)

---

## 1. Prerequisites

### Ubuntu 24.04 LTS

These instructions target Ubuntu Server 24.04 LTS (or Ubuntu Desktop 24.04).
All commands require a user account with `sudo` privileges.

### System packages

```bash
sudo apt update
sudo apt install -y curl git unzip
```

### System build tools (required before `npm install`)

The `sharp` (image processing) and `bcrypt` (password hashing) packages are native
C++ addons compiled from source during `npm install`. Without build tools, `npm install`
will fail with a node-gyp error.

```bash
sudo apt install -y build-essential python3 python3-dev
```

## 1. Install Node.js 20 LTS

Use nvm (Node Version Manager) to install and manage Node.js versions:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
```

Then install and activate Node.js 20:

```bash
nvm install 20
nvm use 20
node --version    # should show v20.x.x
npm --version     # confirm npm is available
```

To make Node.js 20 the default for all future terminals:

```bash
nvm alias default 20
```

---

## 2. Install Git

Git is typically pre-installed on Ubuntu Server. Verify or install:

```bash
git --version
# if not found:
sudo apt install -y git
```

Configure your identity (required for git commits):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

No CRLF configuration is needed on Linux.

---

## 3. Open the Project

### From a downloaded zip bundle

```bash
unzip learnplay-cloud-source-*.zip
cd Cloud-On-Prem
```

### From a git repository

```bash
git clone <repository-url>
cd Cloud-On-Prem
```


---

## 4. Install Dependencies

```bash
npm install
```

This installs all server and client dependencies including native C++ addons.
Expect 1--3 minutes on first run. If it fails with a node-gyp error, ensure
`build-essential python3 python3-dev` are installed (see Prerequisites).

---

## 5. Configure Environment Variables

Copy the example file and open it for editing:

```bash
cp .env.example .env
nano .env
```

### Required variables for local development

```env
NODE_ENV=development
PORT=8443
BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:8000
VITE_DOMAIN=http://localhost:8000

DATABASE_URL=postgresql://user:password@host:5432/database

# Local file storage -- no GCS account required for development
ONPREM_MODE=true
UPLOAD_DIR=./uploads

SESSION_SECRET=<generate with command below>
COOKIE_SECURE=false

GEMINI_API_KEY=your-gemini-api-key
```

**Generate a SESSION_SECRET:**

```bash
openssl rand -hex 32
```

Copy the output and paste it as the value of `SESSION_SECRET`.

### Variable reference

| Variable | Dev value | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Enables hot reload via tsx; set to `production` for `npm start` only |
| `PORT` | `8000` | Port the server listens on |
| `BASE_URL` | `http://localhost:8000` | Used in email links, certificate PDFs, webhook URLs |
| `FRONTEND_URL` | same as BASE_URL | Must match `BASE_URL` for local development |
| `VITE_DOMAIN` | same as BASE_URL | Must match `BASE_URL` for local development |
| `DATABASE_URL` | Neon or local psql | See Section 7 for setup options |
| `ONPREM_MODE` | `true` | Routes file I/O to local `./uploads/` instead of GCS |
| `UPLOAD_DIR` | `./uploads` | Local upload root; created automatically; relative path is fine |
| `SESSION_SECRET` | random 32-byte hex | Required -- sessions will silently fail without this |
| `COOKIE_SECURE` | `false` | Must be `false` for plain HTTP localhost; `true` only with HTTPS |
| `GEMINI_API_KEY` | your key | Required for AI lesson and quiz generation |

### Optional variables (leave blank to disable gracefully)

```env
MAILERSEND_API_KEY=
EMAIL_FROM=
YOCO_TEST_SECRET_KEY=
YOCO_TEST_PUBLIC_KEY=


```

### Checking for port conflicts before choosing a port

```bash
ss -tlnp | grep :3000
```

If the port is already in use, set `PORT=3001` (and update `BASE_URL`, `FRONTEND_URL`,
`VITE_DOMAIN` to match).

---

## 7. Database Setup and Data Import

### Option A -- Neon (recommended for development)

1. Go to https://neon.tech and sign up for a free account
2. Create a project named `learnplay-dev`
3. Copy your connection string -- it looks like:
   `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`
4. Set this as `DATABASE_URL` in your `.env`

### Option B -- Local PostgreSQL on Ubuntu

```bash
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
```

Create the database and user:

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE learnplay_dev;
CREATE USER learnplay WITH PASSWORD 'choose_a_password';
GRANT ALL PRIVILEGES ON DATABASE learnplay_dev TO learnplay;
\q
```

Local connection string (no `sslmode=require` for localhost):
```
postgresql://learnplay:choose_a_password@localhost:5432/learnplay_dev
```

### Push the database schema

```bash
npm run db:push
```

This creates all tables from the Drizzle schema. First run typically creates 50+ tables.
Run this again whenever you edit `shared/schema.ts`.

### Import platform configuration data

The import script loads 35 tables of platform configuration (subscription plans,
branding, gamma themes, system settings, etc.) from a data bundle.

```bash
# Start the dev server first (Step 8), register as SuperAdmin, then stop it and run:
export DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
bash cloud/import-platform-data.sh /path/to/data-bundle/data
```

Expected output:

```
Importing "supportedLanguages"... (29 rows) OK
Importing "systemSettings"...     (11 rows) OK
...
Importing "gammaThemes"...        (103 rows) OK
Platform data import complete!  Imported: 35 tables
```

### Copy platform images to local uploads

```bash
mkdir -p uploads/public
cp -r /path/to/data-bundle/files/public/. ./uploads/public/
```

---

## 8. Run in Development Mode

```bash
npm run dev
```

Open your browser at `http://localhost:3000`.

Navigate to `/auth` and register your account.
**The first user registered on a fresh database becomes SuperAdmin automatically.**
Save your email and password.

### Port conflict

```bash
ss -tlnp | grep :3000
kill <pid>
# or simply start on a different port:
PORT=3001 npm run dev
```

---

## 9. Build the Distribution Package

The build script compiles the TypeScript/React source into a deployable Node.js bundle.
It runs natively on Ubuntu bash -- no wrapper needed.

```bash
bash build-cloud-linux.sh
```

This produces:

```
dist-cloud/
  index.js          # compiled server (ESM)
  public/           # compiled Vite frontend
  package.json      # production dependencies only
  node_modules/     # production install
```

Archive it for transfer:

```bash
tar -czf learnplay-cloud.tar.gz dist-cloud/
```

---

## 10. Transfer to Linux Server

Use `scp` or `rsync` directly from your Ubuntu development machine:

```bash
scp learnplay-cloud.tar.gz user@server-ip:/tmp/
```

Or with rsync (faster for subsequent updates):

```bash
rsync -avz --progress learnplay-cloud.tar.gz user@server-ip:/tmp/
```

On the server, extract and run the install script:

```bash
ssh user@server-ip
sudo tar -xzf /tmp/learnplay-cloud.tar.gz -C /opt/learnplay/
sudo bash /opt/learnplay/dist-cloud/install.sh
```

---

## Migrating Files from the Replit Object Store

### Export from Replit (run in the Replit Shell)

```bash
bash cloud/export-all.sh
# Optional: include private user-uploaded content
bash cloud/export-all.sh --include-private
```

The export creates a `data-bundle/` folder visible in the Replit file browser.
Download it from Replit using the file browser right-click menu.

### Ubuntu Development -- Local Storage, No Migration Needed

When `ONPREM_MODE=true`, all file reads and writes go to `./uploads/` on your local
machine. Copy files from the downloaded data bundle:

```bash
mkdir -p uploads/public
cp -r data-bundle/files/public/. ./uploads/public/

# If you exported private files:
mkdir -p uploads/private
cp -r data-bundle/files/private/. ./uploads/private/
```

### GCS Migration -- Production Deployment

For a production server that reads from Google Cloud Storage, push the exported files
to your GCS bucket:

```bash
export GOOGLE_SERVICE_ACCOUNT_JSON='{ "type": "service_account", ... }'
export GCS_BUCKET_NAME=your-bucket-name

bash cloud/push-to-gcs.sh data-bundle/files/
```

Your GCS service account must have `storage.objects.create` and `storage.objects.delete`
permissions on the target bucket.

### Ongoing Sync

After Replit Object Store changes, re-run the export and push steps.
The push script overwrites changed files and does not delete files absent from the export.

---

## Using Google Antigravity IDE

Antigravity runs natively on Ubuntu -- no WSL2 or wrapper scripts are needed.

**Setup:**
- Open Antigravity and select File > Open Folder, choose `Cloud-On-Prem/`
- Set the run command to: `npm run dev`
- Set the working directory to: `Cloud-On-Prem/`

**Integrated terminal:**
Antigravity's integrated terminal is a standard bash shell. Every command in this guide
works as-is inside it. You do not need to prefix any command with `wsl` or `bash.exe`.

**Running scripts:**
```bash
bash build-cloud-linux.sh          # build distribution package
bash cloud/export-all.sh           # export Replit data
bash cloud/import-platform-data.sh # import platform configuration
```

---

## Ubuntu Quick Reference

### nvm commands

```bash
nvm list              # list installed Node.js versions
nvm use 20            # activate Node.js 20 in current shell
nvm install 22        # install a different version
nvm alias default 20  # set default version for new shells
```

### Port management

```bash
ss -tlnp | grep :3000    # check what is using port 3000
lsof -i :3000            # alternative -- list open files on port 3000
kill <pid>               # stop a process by PID
pkill node               # stop all node processes
PORT=3001 npm run dev    # start on an alternate port
```

### Secret generation

```bash
openssl rand -hex 32     # generate a 32-byte hex secret (SESSION_SECRET)
openssl rand -base64 32  # generate a base64 secret
```

### PostgreSQL service management

```bash
sudo systemctl start postgresql
sudo systemctl stop postgresql
sudo systemctl status postgresql
sudo systemctl restart postgresql
```

### File operations

```bash
cp .env.example .env                           # copy a file
cp -r source/. destination/                    # copy directory contents recursively
mkdir -p uploads/public                        # create directory (and parents)
tar -czf archive.tar.gz directory/             # create a gzip tar archive
tar -xzf archive.tar.gz                        # extract a gzip tar archive
unzip file.zip                                 # extract a zip file
scp file.tar.gz user@host:/tmp/               # copy file to remote server
rsync -avz file.tar.gz user@host:/tmp/        # sync file to remote server
```

### Environment variable tips

```bash
# Set temporarily for one command only (does not modify .env):
PORT=3001 npm run dev
DATABASE_URL="postgresql://..." npm run db:push

# Print current value:
echo $DATABASE_URL

# Source .env into current shell for testing (non-production use only):
set -a; source .env; set +a
```

### Path conventions

All paths in this project use Linux conventions (`/` separator).
- Project root: wherever you extracted / cloned `Cloud-On-Prem/`
- Uploads (dev): `./uploads/` relative to project root
- Uploads (production): `/opt/uploads/` set explicitly via `UPLOAD_DIR` in `.env`

---

## Troubleshooting

**`npm install` fails with node-gyp / binding.gyp errors**

```bash
sudo apt install -y build-essential python3 python3-dev
npm install
```

**`Cannot find module` on startup**

```bash
npm install
```

**App crashes immediately after `npm run dev`**
- Check `DATABASE_URL` in `.env` is correct and the database is reachable
- For Neon: the URL must end with `?sslmode=require`
- For local PostgreSQL: ensure the service is running (`sudo systemctl status postgresql`)

**Login always fails / sessions don't persist**
- `SESSION_SECRET` is missing or too short (must be 32+ random characters)
- Generate: `openssl rand -hex 32`

**Session lost on every page refresh**
- `COOKIE_SECURE=true` over plain HTTP causes the browser to drop the session cookie
- Set `COOKIE_SECURE=false` in `.env`

**Images not showing in the browser**
- Confirm `ONPREM_MODE=true` and `UPLOAD_DIR=./uploads` are set in `.env`
- Confirm `uploads/public/` exists and contains files from `data-bundle/files/public/`
- Create and populate: `mkdir -p uploads/public && cp -r data-bundle/files/public/. uploads/public/`

**Import script fails with `psql: command not found`**

```bash
sudo apt install -y postgresql-client
```

**Port already in use**
- Find the occupying process: `ss -tlnp | grep :3000` then `kill <pid>`
- Or start on a different port: `PORT=3001 npm run dev`
- Update `BASE_URL`, `FRONTEND_URL`, `VITE_DOMAIN` in `.env` to match the new port

**LibreOffice startup warning**
- Logged at startup if LibreOffice is absent -- does not prevent the server from starting
- Install if PPTX-to-HTML conversion is needed: `sudo apt install -y libreoffice-impress --no-install-recommends`

**Build script fails**

```bash
bash -x build-cloud-linux.sh 2>&1 | head -50
```

Check that `npm run build` succeeds standalone before running the full build script.
