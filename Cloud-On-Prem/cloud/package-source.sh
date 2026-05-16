#!/usr/bin/env bash
# =============================================================================
# package-source.sh — LearnPlay Cloud-On-Prem source packaging script
#
# Creates a self-contained bundle of the Cloud-On-Prem source code + exported
# platform data + Object Store files for offline/local desktop development.
#
# Run this from the Replit Shell tab (NOT the workflow terminal) so that the
# Object Store export can authenticate via @replit/object-storage.
#
# Usage:
#   cd Cloud-On-Prem
#   bash cloud/package-source.sh
#   bash cloud/package-source.sh /path/to/my-bundle-dir
#   bash cloud/package-source.sh /path/to/my-bundle-dir --include-private
#   bash cloud/package-source.sh /path/to/my-bundle-dir --skip-export
#
# Flags:
#   --include-private   Also export private user content (.private/ bucket tree)
#   --skip-export       Skip the data/Object Store export step (use existing data-bundle/)
#
# Output (default: one level ABOVE Cloud-On-Prem, visible in Replit file browser):
#   <WORKSPACE_ROOT>/learnplay-cloud-bundle-YYYYMMDD/
#     learnplay-cloud-source-YYYYMMDD.zip   Full source code (extract with: unzip learnplay-cloud-source-*.zip)
#     data-bundle/                          DB tables + Object Store files
#       data/                               JSON files + assets/ staging dir
#       files/public/                       Full Object Store public tree
#       files/private/                      User content (--include-private only)
#       MANIFEST.json
#     SETUP.md                              Local development setup guide
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DATE_LABEL="$(date +%Y%m%d)"

INCLUDE_PRIVATE=false
SKIP_EXPORT=false
OUTPUT_DIR=""

for arg in "$@"; do
  case "$arg" in
    --include-private) INCLUDE_PRIVATE=true ;;
    --skip-export)     SKIP_EXPORT=true ;;
    --*) echo "Unknown flag: $arg"; exit 1 ;;
    *)   OUTPUT_DIR="$arg" ;;
  esac
done

# Default output is at WORKSPACE ROOT (one level above Cloud-On-Prem/) so the
# bundle is visible at the top of the Replit file browser and easy to download.
OUTPUT_DIR="${OUTPUT_DIR:-$WORKSPACE_ROOT/learnplay-cloud-bundle-${DATE_LABEL}}"
DATA_BUNDLE_DIR="$OUTPUT_DIR/data-bundle"
ARCHIVE_NAME="learnplay-cloud-source-${DATE_LABEL}.zip"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
TEMP_ZIP="/tmp/${ARCHIVE_NAME}"

info()   { echo "  $*"; }
ok()     { echo "  ✅ $*"; }
warn()   { echo "  ⚠️  $*"; }
header() { echo ""; echo "── $* ──────────────────────────────────────────────────"; }

mkdir -p "$OUTPUT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        LearnPlay Cloud-On-Prem — Source Package Builder         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Output directory : $OUTPUT_DIR"
echo "  Timestamp        : $TIMESTAMP"
echo "  Include private  : $INCLUDE_PRIVATE"
echo "  Skip export      : $SKIP_EXPORT"
echo ""

# =============================================================================
# STEP 1: Export platform data + Object Store files
# =============================================================================
header "Step 1: Export platform data and Object Store files"

if $SKIP_EXPORT; then
  if [ -d "$DATA_BUNDLE_DIR/data" ]; then
    info "Skipping export — using existing data-bundle/ directory"
    JSON_COUNT=$(find "$DATA_BUNDLE_DIR/data" -name "*.json" -not -name "MANIFEST.json" 2>/dev/null | wc -l)
    ok "Existing bundle: $JSON_COUNT JSON files found"
  else
    warn "No existing data-bundle/ found at $DATA_BUNDLE_DIR"
    warn "Remove --skip-export to run the export step, or create the data-bundle/ manually"
    exit 1
  fi
else
  PRIVATE_FLAG=""
  if $INCLUDE_PRIVATE; then
    PRIVATE_FLAG="--include-private"
  fi

  info "Running export-all.sh → $DATA_BUNDLE_DIR ..."
  echo ""
  bash "$SCRIPT_DIR/export-all.sh" "$DATA_BUNDLE_DIR" $PRIVATE_FLAG
  echo ""
  ok "Export complete"
fi

# =============================================================================
# STEP 2: Archive source code
# =============================================================================
header "Step 2: Archive Cloud-On-Prem source code"

info "Creating $ARCHIVE_NAME ..."
info "Excluding: node_modules/, dist-cloud/, dist/, .git/, .env, *.log, learnplay-*"
info "Writing to /tmp first to avoid circular inclusion, then moving to output ..."

# Use Python's built-in zipfile module — no external zip binary needed.
# The archive is written to /tmp/ first (completely outside Cloud-On-Prem/),
# which avoids circular self-inclusion. It is moved to OUTPUT_DIR afterwards.
python3 - "$PROJECT_ROOT" "$TEMP_ZIP" << 'PYEOF'
import sys, zipfile, os, fnmatch

src_dir  = sys.argv[1]   # absolute path to Cloud-On-Prem/
dest_zip = sys.argv[2]   # /tmp/learnplay-cloud-source-YYYYMMDD.zip

EXCLUDE_DIRS = {
    'node_modules', 'dist-cloud', 'dist', '.git', '__pycache__',
}
EXCLUDE_PATTERNS = [
    'learnplay-cloud-bundle*', 'learnplay-export*',
    '.env', '*.log', '*.zip', '*.tar.gz', '.DS_Store',
]

def should_exclude_name(name):
    return any(fnmatch.fnmatch(name, p) for p in EXCLUDE_PATTERNS)

parent_dir = os.path.dirname(src_dir)
base_name  = os.path.basename(src_dir)   # "Cloud-On-Prem"

try:
    file_count = 0
    with zipfile.ZipFile(dest_zip, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for root, dirs, files in os.walk(src_dir):
            # Prune dirs in-place so os.walk never descends into excluded directories
            dirs[:] = [
                d for d in dirs
                if d not in EXCLUDE_DIRS and not should_exclude_name(d)
            ]
            for fname in files:
                if should_exclude_name(fname):
                    continue
                abs_path = os.path.join(root, fname)
                arc_name = os.path.join(base_name, os.path.relpath(abs_path, src_dir))
                zf.write(abs_path, arc_name)
                file_count += 1
    print(f"  Archived {file_count} files -> {dest_zip}")
except Exception as e:
    print(f"ERROR: Python archiver failed: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF

if [ ! -f "$TEMP_ZIP" ]; then
  echo ""
  echo "❌ Archive creation failed — zip was not created in /tmp."
  echo "   Data export is already done. To retry only the archive step:"
  echo "     bash cloud/package-source.sh $OUTPUT_DIR --skip-export"
  exit 1
fi

mv "$TEMP_ZIP" "$ARCHIVE_PATH"
ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" 2>/dev/null | cut -f1 || echo "unknown")
ok "Source archive: $ARCHIVE_NAME ($ARCHIVE_SIZE)"

# =============================================================================
# STEP 3: Write SETUP.md
# =============================================================================
header "Step 3: Writing local development setup guide"

SETUP_FILE="$OUTPUT_DIR/SETUP.md"

cat > "$SETUP_FILE" << 'SETUP_EOF'
# LearnPlay Cloud-On-Prem -- Local Development Setup

This guide takes you from a fresh Ubuntu 24.04 machine to a fully working local
development environment running `npm run dev` with all platform data loaded.
All files are stored on your local machine -- no Google Cloud Storage account needed.

---

## What's in this bundle

| Item | Description |
|---|---|
| `learnplay-cloud-source-*.zip` | Full source code -- TypeScript/React |
| `data-bundle/data/*.json` | 35 platform configuration tables |
| `data-bundle/data/assets/` | Staged asset files |
| `data-bundle/files/public/` | Platform images and public files |
| `SETUP.md` | This file |

---

## Step 1 -- Prerequisites (install once per machine)

### System build tools

Required for compiling native Node.js modules (sharp, bcrypt):

```bash
sudo apt update
sudo apt install -y build-essential python3 python3-dev
```

### Node.js 20 via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version   # should show v20.x.x
```

### PostgreSQL database

Choose one option:

**Option A -- Neon (free cloud database, recommended):**
1. Go to https://neon.tech and sign up for a free account
2. Create a new project named `learnplay-dev`
3. Copy the connection string -- it looks like:
   `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`
4. You will paste this into your `.env` in Step 4

**Option B -- Local PostgreSQL:**

```bash
sudo apt install -y postgresql
```

Connect as the postgres superuser and create the database:

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE learnplay_dev;
CREATE USER learnplay WITH PASSWORD 'choose_a_password';
GRANT ALL PRIVILEGES ON DATABASE learnplay_dev TO learnplay;
\q
```

Connection string for local PostgreSQL (no `sslmode=require` needed for localhost):
`postgresql://learnplay:choose_a_password@localhost:5432/learnplay_dev`

### Git (if not already installed)

```bash
sudo apt install -y git
```

### LibreOffice (optional -- only for PPTX-to-HTML conversion)

```bash
sudo apt install -y libreoffice-impress --no-install-recommends
```

The app starts without LibreOffice. Install it only if you need to test PPTX-to-HTML
course conversion. A startup warning is printed if it is absent -- this is harmless.

---

## Step 2 -- Extract source code

Navigate to the folder containing this bundle, then:

```bash
unzip learnplay-cloud-source-*.zip
cd Cloud-On-Prem
```

All remaining commands in this guide run from inside the `Cloud-On-Prem/` folder.

---

## Step 3 -- Install Node.js dependencies

```bash
npm install
```

This installs all server and client dependencies. Expect 1--3 minutes on first run.
The build tools installed in Step 1 are required for the `sharp` and `bcrypt` packages.

---

## Step 4 -- Configure your .env file

```bash
cp .env.example .env
nano .env
```

Set the following values:

### Required for local development

```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
VITE_DOMAIN=http://localhost:3000

DATABASE_URL=postgresql://user:password@host:5432/database

# Local file storage -- no GCS required
ONPREM_MODE=true
UPLOAD_DIR=./uploads

SESSION_SECRET=<see generation command below>
COOKIE_SECURE=false
EMAIL_FROM=noreply@localhost
INTEGRATION_EMAIL_ACTIVE_PROVIDER=mailersend
```

**Generate SESSION_SECRET** (run this and paste the output):

```bash
openssl rand -hex 32
```

### What each variable does

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `development` | Enables hot reload; `production` breaks tsx dev mode |
| `BASE_URL` | `http://localhost:3000` | Used in email links, certificate URLs, webhooks |
| `FRONTEND_URL` | same as BASE_URL | Must match BASE_URL for local dev |
| `VITE_DOMAIN` | same as BASE_URL | Must match BASE_URL for local dev |
| `DATABASE_URL` | your connection string | From Neon or local PostgreSQL |
| `ONPREM_MODE` | `true` | Switches file storage from GCS to local `./uploads/` folder |
| `UPLOAD_DIR` | `./uploads` | Where files are stored; auto-created; relative path works on Ubuntu |
| `SESSION_SECRET` | random 32-byte hex | Sessions fail silently without this -- don't skip it |
| `COOKIE_SECURE` | `false` | Browser rejects HTTPS-only cookies over plain HTTP localhost |
| `EMAIL_FROM` | `noreply@localhost` | Default sender address; actual provider keys are configured in admin UI |
| `INTEGRATION_EMAIL_ACTIVE_PROVIDER` | `mailersend` | Default transport selector before provider setup in admin UI |

### Integration Secrets

Configure Gemini/Gamma/MailerSend/SMTP/YOCO/ElevenLabs keys in:
- `/admin/integration-settings`

---

## Step 5 -- Push database schema

```bash
npm run db:push
```

This creates all database tables. First run typically creates 50+ tables.
You should see a list of table names with no errors.

---

## Step 6 -- Start the app and register SuperAdmin

```bash
npm run dev
```

Open your browser at `http://localhost:3000`

Navigate to `/auth` and register your account.
**The first user registered on a fresh database becomes SuperAdmin automatically.**
Save your email and password -- you will need them.

Leave the dev server running and continue with Step 7 in a new terminal.

---

## Step 7 -- Import platform configuration data

In a new terminal, from the `Cloud-On-Prem/` folder:

```bash
# Set DATABASE_URL to the same value as in your .env
export DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# Run the import -- point it at data-bundle/data from this bundle
bash cloud/import-platform-data.sh /path/to/data-bundle/data
```

Expected output (35 tables imported):

```
Importing "supportedLanguages"... (29 rows) OK
Importing "systemSettings"...     (11 rows) OK
...
Importing "gammaThemes"...        (103 rows) OK
Platform data import complete!  Imported: 35 tables
```

---

## Step 8 -- Copy platform images to local uploads folder

No GCS needed. Copy files directly from the bundle:

```bash
mkdir -p uploads/public
cp -r /path/to/data-bundle/files/public/. ./uploads/public/
```

The app reads images directly from `./uploads/public/` when `ONPREM_MODE=true`.

---

## Step 9 -- Verify everything works

Restart the app (Ctrl+C in the dev terminal, then `npm run dev` again).
Log in as SuperAdmin.

Check:
- Dashboard loads with platform data visible (subscription plans, branding)
- Gamma themes page shows image thumbnails (confirms local file storage is working)
- Admin panel -- Platform Settings -- configuration is populated

---

## Step 10 -- Running in production mode (optional)

To test the compiled production build locally:

```bash
npm run build   # compiles client to dist/public/ and server to dist/index.js
npm start       # runs the compiled build (no hot reload)
```

Switch `NODE_ENV=production` in `.env` when running `npm start`.
Switch back to `NODE_ENV=development` for `npm run dev`.

---

## Development workflow cheatsheet

```bash
npm run dev      # start dev server (hot reload, TypeScript direct -- use this daily)
npm run build    # compile for production
npm start        # run production build
npm run db:push  # apply schema changes (after editing shared/schema.ts)
npm run check    # TypeScript type check
```

Port conflict:
```bash
PORT=3001 npm run dev
# or find what is using the port:
ss -tlnp | grep :3000
kill <pid>
```

---

## Troubleshooting

**`npm install` fails with node-gyp / binding.gyp errors**
- Install system build tools: `sudo apt install -y build-essential python3 python3-dev`
- Then retry: `npm install`

**`Cannot find module` on startup**
- Run `npm install` again

**App crashes immediately after `npm run dev`**
- Check `DATABASE_URL` in `.env` is correct and the database is reachable
- For Neon: the URL must end with `?sslmode=require`

**Login always fails / sessions don't persist**
- `SESSION_SECRET` is missing or too short (must be 32+ random characters)
- Generate a new one: `openssl rand -hex 32`

**Session lost on every page refresh**
- `COOKIE_SECURE=true` over plain HTTP causes browser to drop the session cookie
- Set `COOKIE_SECURE=false` in `.env`

**Images not showing**
- Check that `ONPREM_MODE=true` and `UPLOAD_DIR=./uploads` are set in `.env`
- Check that `uploads/public/` folder exists and contains files from `data-bundle/files/public/`
- Create it if needed: `mkdir -p uploads/public`

**Import script fails with `psql: command not found`**
- Install: `sudo apt install -y postgresql-client`

**Port already in use**
- Change `PORT=3001` in `.env` and update `BASE_URL`, `FRONTEND_URL`, `VITE_DOMAIN` to match
- Or find the process: `ss -tlnp | grep :3000` then `kill <pid>`

**LibreOffice startup warning**
- The app logs a warning if LibreOffice is not installed -- this is harmless
- Install only if you need PPTX-to-HTML conversion: `sudo apt install -y libreoffice-impress --no-install-recommends`

SETUP_EOF

ok "SETUP.md written"

# =============================================================================
# Summary
# =============================================================================
BUNDLE_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1 || echo "unknown")
JSON_COUNT=$(find "$DATA_BUNDLE_DIR/data" -name "*.json" -not -name "MANIFEST.json" 2>/dev/null | wc -l)
ASSET_COUNT=$(find "$DATA_BUNDLE_DIR/data/assets" -type f 2>/dev/null | wc -l)
PUBLIC_COUNT=$(find "$DATA_BUNDLE_DIR/files/public" -type f 2>/dev/null | wc -l)

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                      Package Complete                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Bundle directory : $OUTPUT_DIR"
echo "  Bundle size      : $BUNDLE_SIZE"
echo "  Source archive   : $ARCHIVE_NAME ($ARCHIVE_SIZE)"
echo "  Platform tables  : $JSON_COUNT JSON files"
echo "  Image assets     : $ASSET_COUNT (staged for import)"
echo "  Public files     : $PUBLIC_COUNT (full Object Store tree)"
echo ""
echo "────────────────────────────────────────────────────────────────────"
echo " NEXT STEPS"
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo " 1. Download the bundle from Replit:"
echo "    In the Replit file browser, look for:"
echo "      learnplay-cloud-bundle-${DATE_LABEL}/"
echo "    Right-click it and choose Download (or download the .zip directly)."
echo ""
echo " 2. Extract and set up on your Ubuntu development machine:"
echo "      unzip $ARCHIVE_NAME"
echo "      cd Cloud-On-Prem"
echo "      sudo apt install -y build-essential python3 python3-dev"
echo "      npm install"
echo ""
echo " 3. Follow SETUP.md for the complete local setup steps."
echo "    Key steps: configure .env → npm run db:push → start app"
echo "    → register SuperAdmin → run import script."
echo ""
echo " 4. Platform images:"
echo "    Copy from data-bundle: cp -r data-bundle/files/public/. uploads/public/"
echo "    Local image copies are also in: $DATA_BUNDLE_DIR/data/assets/"
echo ""
