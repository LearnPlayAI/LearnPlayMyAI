#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo ""

# --- Tool preflight ---
for tool in npm psql; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "❌  Required tool not found: $tool"
    echo "    Install prerequisites first, then re-run this script."
    exit 1
  fi
done
echo "=============================================="
echo "  LearnPlay Cloud-On-Prem — Dev Setup"
echo "=============================================="
echo ""

# --- Check DATABASE_URL ---
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$APP_DIR/.env" ]; then
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)
    export DATABASE_URL
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌  DATABASE_URL is not set."
  echo ""
  echo "    Set it in $APP_DIR/.env:"
  echo "      DATABASE_URL=postgresql://user:password@localhost:5432/learnplay"
  echo ""
  echo "    Or export it before running this script:"
  echo "      export DATABASE_URL=postgresql://..."
  echo ""
  exit 1
fi

echo "✅  DATABASE_URL detected"

# --- Check node_modules ---
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo ""
  echo "⚠️   node_modules not found at $APP_DIR/node_modules"
  echo ""
  echo "    Install dependencies first:"
  echo "      cd $APP_DIR"
  echo "      npm install"
  echo ""
  echo "    IMPORTANT: Ubuntu 24.04 requires these OS packages before npm install:"
  echo "      sudo apt install -y build-essential python3 python3-dev"
  echo ""
  read -rp "    Continue anyway? (y/N): " CONT
  [[ "$CONT" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

echo ""
echo "📦  Step 1/3: Pushing database schema (creates all tables)..."
echo ""
(cd "$APP_DIR" && npm run db:push)

echo ""
echo "🌱  Step 2/3: Importing platform seed data..."
echo "    Source: $SCRIPT_DIR/data/ (35 JSON files)"
echo ""
bash "$SCRIPT_DIR/import-platform-data.sh" "$SCRIPT_DIR/data"

echo ""
echo "👤  Step 2b/3: Seeding platform SuperAdmin account..."
echo "    Email: admin@learnplay.co.za"
echo ""

SUPERADMIN_HASH=$(echo -n 'SuperAdminPassword@2018#!' | (cd "$APP_DIR" && node -e "
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  import('bcrypt')
    .then(b => b.default.hash(data, 10))
    .then(h => { process.stdout.write(h); process.exit(0); })
    .catch(() => process.exit(1));
});
") 2>/dev/null || echo '')

if [ -z "$SUPERADMIN_HASH" ] || [[ "$SUPERADMIN_HASH" != \$2* ]]; then
  echo "❌  Failed to generate SuperAdmin password hash."
  echo "    Ensure dependencies are installed: cd $APP_DIR && npm install"
  exit 1
fi

SQL_SUPERADMIN_HASH="$SUPERADMIN_HASH"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<EOSQL_SUPERADMIN >/dev/null
INSERT INTO users (
  id,
  "gamerName",
  email,
  password,
  "firstName",
  "lastName",
  "isSuperAdmin",
  "isCustSuper",
  "emailVerified",
  "isLocked",
  "isDisabled",
  "failedLoginAttempts",
  "sessionVersion"
)
VALUES (
  gen_random_uuid()::text,
  'superadmin',
  'admin@learnplay.co.za',
  '${SQL_SUPERADMIN_HASH}',
  'LearnPlay',
  'SuperAdmin',
  true,
  false,
  true,
  false,
  false,
  0,
  1
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  "isSuperAdmin" = true,
  "isCustSuper" = false,
  "emailVerified" = true,
  "isLocked" = false,
  "isDisabled" = false,
  "failedLoginAttempts" = 0,
  "updatedAt" = now();
EOSQL_SUPERADMIN

echo "    ✅ SuperAdmin ensured: admin@learnplay.co.za"

SUPPORT_HASH_DEFAULT='$2b$10$p9i86UUxH83d6tuhn0BG3OHHUtVOj6IrfcwRMdbc1Sg.4Y42OHJ/W'
SUPPORT_HASH="$(grep -E '^SUPPORT_BOOTSTRAP_PASSWORD_HASH=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
SUPPORT_HASH="${SUPPORT_HASH%\"}"
SUPPORT_HASH="${SUPPORT_HASH#\"}"
SUPPORT_HASH="$(echo "$SUPPORT_HASH" | tr -d '[:space:]')"

if [ -z "$SUPPORT_HASH" ] || [[ "$SUPPORT_HASH" != \$2* ]]; then
  SUPPORT_HASH="$SUPPORT_HASH_DEFAULT"
fi

SQL_SUPPORT_HASH="$SUPPORT_HASH"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<EOSQL_SUPPORT >/dev/null
INSERT INTO users (
  id,
  "gamerName",
  email,
  password,
  "firstName",
  "lastName",
  "isSuperAdmin",
  "isCustSuper",
  "emailVerified",
  "isLocked",
  "isDisabled",
  "failedLoginAttempts",
  "sessionVersion"
)
VALUES (
  gen_random_uuid()::text,
  'support',
  'support@learnplay.co.za',
  '${SQL_SUPPORT_HASH}',
  'LearnPlay',
  'Support',
  true,
  false,
  true,
  false,
  false,
  0,
  1
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  "isSuperAdmin" = true,
  "isCustSuper" = false,
  "emailVerified" = true,
  "isLocked" = false,
  "isDisabled" = false,
  "failedLoginAttempts" = 0,
  "updatedAt" = now();
EOSQL_SUPPORT

echo "    ✅ Support bootstrap user ensured: support@learnplay.co.za (superadmin)"

# ==========================================================
# Step 3: Copy Object Store asset files from export bundle
# Detects learnplay-export-*/ in APP_DIR and copies
# files/public/ → UPLOAD_DIR/public/ using no-clobber copy.
# Idempotent — never overwrites existing files.
# ==========================================================
echo ""
echo "🖼️  Step 3/3: Installing platform asset files..."
echo ""

UPLOAD_DIR_RESOLVED="${UPLOAD_DIR:-}"
if [ -z "$UPLOAD_DIR_RESOLVED" ] && [ -f "$APP_DIR/.env" ]; then
  UPLOAD_DIR_RESOLVED=$(grep -E '^UPLOAD_DIR=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)
fi
UPLOAD_DIR_RESOLVED="${UPLOAD_DIR_RESOLVED:-$APP_DIR/uploads}"
if [[ "$UPLOAD_DIR_RESOLVED" != /* ]]; then
  UPLOAD_DIR_RESOLVED="$APP_DIR/${UPLOAD_DIR_RESOLVED#./}"
fi

# Dev safety: never allow setup-dev to write outside this workspace.
case "$UPLOAD_DIR_RESOLVED" in
  "$APP_DIR"/*) ;;
  *)
    echo "❌  Invalid UPLOAD_DIR for dev setup: $UPLOAD_DIR_RESOLVED"
    echo "    Dev workspace setup may only write inside: $APP_DIR"
    echo "    Set UPLOAD_DIR=./uploads in $APP_DIR/.env and rerun."
    exit 1
    ;;
esac

EXPORT_BUNDLE="$(
  {
    ls -d "$APP_DIR"/learnplay-export-* 2>/dev/null || true
    ls -d "$SCRIPT_DIR"/learnplay-export-* 2>/dev/null || true
    ls -d "$APP_DIR"/cloud/learnplay-export-* 2>/dev/null || true
  } | sort | tail -1
)"

if [ -n "$EXPORT_BUNDLE" ] && [ -d "$EXPORT_BUNDLE/files/public" ]; then
  mkdir -p "$UPLOAD_DIR_RESOLVED/public" "$UPLOAD_DIR_RESOLVED/private"
  chown -R "$(id -un):$(id -gn)" "$UPLOAD_DIR_RESOLVED" 2>/dev/null || true
  chmod -R u+rwX,g+rwX "$UPLOAD_DIR_RESOLVED" 2>/dev/null || true
  cp -rn "$EXPORT_BUNDLE/files/public/." "$UPLOAD_DIR_RESOLVED/public/"
  ASSET_COUNT=$(find "$UPLOAD_DIR_RESOLVED/public" -type f | wc -l)
  echo "    ✅ $ASSET_COUNT asset files in $UPLOAD_DIR_RESOLVED/public/"
  echo "       Source: $EXPORT_BUNDLE/files/public/"
  echo "       Includes: 5 Gamma image-style thumbnails, 104 Gamma theme thumbnails,"
  echo "                 platform branding files, org branding files"
  echo "       Note: cp -rn used — existing files are never overwritten"
else
  mkdir -p "$UPLOAD_DIR_RESOLVED/public" "$UPLOAD_DIR_RESOLVED/private"
  chown -R "$(id -un):$(id -gn)" "$UPLOAD_DIR_RESOLVED" 2>/dev/null || true
  chmod -R u+rwX,g+rwX "$UPLOAD_DIR_RESOLVED" 2>/dev/null || true
  echo "    ℹ️  No learnplay-export-* bundle found in $APP_DIR"
  echo ""
  echo "    Gamma thumbnails and platform branding images are not installed."
  echo "    The platform is fully functional without them — SuperAdmin can"
  echo "    upload branding via the admin UI; Gamma themes load thumbnails"
  echo "    on first use when GAMMA_API_KEY is configured."
  echo ""
  echo "    To install asset files now:"
  echo "      1. Open the Shell tab in the Replit editor"
  echo "      2. cd Cloud-On-Prem"
  echo "      3. bash cloud/export-all.sh"
  echo "      4. Re-run: bash cloud/setup-dev.sh"
fi

echo ""
echo "=============================================="
echo "  ✅  Dev environment ready!"
echo "=============================================="
echo ""
echo "  Next steps:"
echo "    cd $APP_DIR"
echo "    npm run dev"
echo ""
echo "  Then open: http://localhost:8000"
echo "  SuperAdmin login:"
echo "    Email: admin@learnplay.co.za"
echo "    Password: SuperAdminPassword@2018#!"
echo ""
echo "  Seeded data:"
echo "    • Dinosaurs card collection (30 cards, 180 stat values)"
echo "    • 4 power-ups, 10 cosmetics, 5 Gamma image styles"
echo "    • 29 supported languages"
echo "    • 3 business packages with ZAR + EUR pricing"
echo "    • 4 credit purchase packages"
echo "    • 3 subscription tiers + 4 e-learning plans"
echo "    • Quiz + lesson credit pricing defaults"
echo "    • Gamification economy rules (XP/coin rewards)"
echo "    • 8 challenge templates (daily + weekly)"
echo "    • 10 achievement catalog entries"
echo "    • Gamma thumbnails + platform branding (from learnplay-export bundle)"
echo ""
echo "  Card images (optional for dev):"
echo "    Add card art to: uploads/public/collection/Dinosaurs/{DinosaurName}/image.jpg"
echo "    The card game is fully playable without images."
echo ""
echo "  This script is idempotent — safe to re-run."
echo "=============================================="
echo ""
