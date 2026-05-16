#!/usr/bin/env bash
# =============================================================================
# export-all.sh — LearnPlay Cloud-On-Prem full platform export
#
# Exports all non-transactional platform configuration data from the database
# and all Replit Object Store files (public platform assets + optionally
# private user content) into a self-contained bundle.
#
# The output bundle is compatible with import-platform-data.sh (both variants)
# and can be used to seed an Ubuntu development environment, prepare data for
# a fresh Linux installation, or update platform data on an existing deployment.
#
# Usage:
#   bash export-all.sh [OUTPUT_DIR] [--include-private]
#
# Arguments:
#   OUTPUT_DIR        Where to write the bundle (default: ./learnplay-export-YYYYMMDD)
#   --include-private Also export private user content (.private/ bucket tree)
#
# Requirements:
#   - DATABASE_URL must be set (or will be read from .env in current directory)
#   - psql must be installed and on PATH
#   - For Object Store export: must be run from within the Replit Shell tab
#     (uses @replit/object-storage Node.js client — no gsutil needed)
#
# Examples:
#   bash export-all.sh
#   bash export-all.sh ./my-export
#   bash export-all.sh ./my-export --include-private
# =============================================================================
set -euo pipefail

SCRIPT_VERSION="1.0.0"
REPLIT_BUCKET="replit-objstore-715e7ee1-a469-4dc4-ab5c-071794a467d4"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DATE_LABEL="$(date +%Y%m%d)"

INCLUDE_PRIVATE=false
OUTPUT_DIR=""

for arg in "$@"; do
  case "$arg" in
    --include-private) INCLUDE_PRIVATE=true ;;
    --*) echo "Unknown flag: $arg"; exit 1 ;;
    *) OUTPUT_DIR="$arg" ;;
  esac
done

OUTPUT_DIR="${OUTPUT_DIR:-./learnplay-export-${DATE_LABEL}}"
DATA_DIR="$OUTPUT_DIR/data"
ASSETS_DIR="$DATA_DIR/assets"
FILES_DIR="$OUTPUT_DIR/files"

# =============================================================================
# Utility functions
# =============================================================================
info()  { echo "  $*"; }
ok()    { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
fail()  { echo ""; echo "❌ $*"; exit 1; }
header(){ echo ""; echo "── $* ──────────────────────────────────────────────────"; }

# =============================================================================
# Resolve DATABASE_URL
# =============================================================================
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f ".env" ]; then
    DATABASE_URL=$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)
    export DATABASE_URL
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is not set. Set it in your environment or in a .env file in the current directory."
fi

# =============================================================================
# Check prerequisites
# =============================================================================
if ! command -v psql &>/dev/null; then
  fail "psql not found. Install PostgreSQL client tools:\n  sudo apt install -y postgresql-client"
fi

# =============================================================================
# Detect Replit environment and locate workspace root
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

IN_REPLIT=false
if [ -n "${REPL_OWNER:-}" ] \
   || [ -n "${REPL_ID:-}" ] \
   || [ -n "${REPLIT_USER:-}" ] \
   || [ -n "${DEFAULT_OBJECT_STORAGE_BUCKET_ID:-}" ] \
   || curl -sf --max-time 1 http://127.0.0.1:1106/ >/dev/null 2>&1; then
  IN_REPLIT=true
fi

# =============================================================================
# Create output directory structure
# =============================================================================
mkdir -p "$DATA_DIR" "$ASSETS_DIR" "$FILES_DIR/public"
if $INCLUDE_PRIVATE; then
  mkdir -p "$FILES_DIR/private"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          LearnPlay Cloud-On-Prem — Full Platform Export          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Output directory : $OUTPUT_DIR"
echo "  Timestamp        : $TIMESTAMP"
echo "  Include private  : $INCLUDE_PRIVATE"
if $IN_REPLIT; then
  echo "  Object Store     : enabled (@replit/object-storage)"
else
  echo "  Object Store     : skipped — HTTP fallback only"
fi
echo "  Database         : ${DATABASE_URL%%@*}@..."

# =============================================================================
# PHASE 1: Database export
# =============================================================================
header "Phase 1: Database export (platform tables)"

EXPORT_TABLES=(
  "universalStatUnits"
  "supportedLanguages"
  "systemSettings"
  "platformConfiguration"
  "platformCostCategoryTypes"
  "platformCostCategories"
  "platformRevenueSources"
  "platformPaymentSettings"
  "platformPricing"
  "collectionStatTypes"
  "courseTags"
  "cardCollections"
  "cards"
  "challengeTemplates"
  "cosmeticCatalog"
  "powerUpCatalog"
  "achievementCatalog"
  "adminChallengeConfig"
  "brandingThemes"
  "businessPackages"
  "businessPackagePrices"
  "creditPurchasePackages"
  "currencyConversionRates"
  "elearningSubscriptionPlans"
  "gamificationEconomyRules"
  "gammaImageStyles"
  "gammaThemes"
  "lessonCreditPricingSettings"
  "quizCreditPricing"
  "seasonPassConfig"
  "seasonPassTiers"
  "shopItemPricing"
  "subscriptionPlans"
  "licenseFlagOverrides"
  "aiConfig"
)

DB_EXPORTED=0
DB_EMPTY=0
DB_FAILED=0

for TABLE in "${EXPORT_TABLES[@]}"; do
  printf "  Exporting %-40s" "\"$TABLE\"..."

  RESULT=$(psql "$DATABASE_URL" -t -A -c "SELECT json_agg(t) FROM \"$TABLE\" t;" 2>/dev/null || echo "ERROR")

  if [ "$RESULT" = "ERROR" ]; then
    echo "⚠️  failed"
    echo "[]" > "$DATA_DIR/${TABLE}.json"
    DB_FAILED=$((DB_FAILED + 1))
    continue
  fi

  TRIMMED=$(echo "$RESULT" | tr -d '[:space:]')
  if [ -z "$TRIMMED" ] || [ "$TRIMMED" = "null" ] || [ "$TRIMMED" = "[]" ]; then
    echo "— empty"
    echo "[]" > "$DATA_DIR/${TABLE}.json"
    DB_EMPTY=$((DB_EMPTY + 1))
  else
    echo "$RESULT" > "$DATA_DIR/${TABLE}.json"
    ROW_COUNT=$(echo "$TRIMMED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 1)" 2>/dev/null || echo "?")
    echo "✓ ($ROW_COUNT rows)"
    DB_EXPORTED=$((DB_EXPORTED + 1))
  fi
done

ok "Database export complete: $DB_EXPORTED tables with data, $DB_EMPTY empty, $DB_FAILED failed"

# =============================================================================
# PHASE 2: Object Store file export
# =============================================================================
header "Phase 2: Object Store file export"

FILES_PUBLIC_COUNT=0
FILES_PRIVATE_COUNT=0

if $IN_REPLIT; then
  info "Using @replit/object-storage Node.js client..."
  echo ""

  # Resolve output dir to absolute path before cd-ing to workspace root
  ABS_OUTPUT_DIR="$(mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" && pwd)"

  PRIVATE_FLAG=""
  if $INCLUDE_PRIVATE; then
    PRIVATE_FLAG="--include-private"
  fi

  # Run from workspace root so Node.js resolves node_modules correctly
  (cd "$WORKSPACE_ROOT" && node "$SCRIPT_DIR/export-object-store.js" "$ABS_OUTPUT_DIR" $PRIVATE_FLAG)

  FILES_PUBLIC_COUNT=$(find "$FILES_DIR/public" -type f 2>/dev/null | wc -l)
  FILES_PRIVATE_COUNT=$(find "$FILES_DIR/private" -type f 2>/dev/null | wc -l)
  ASSETS_STAGED=$(find "$ASSETS_DIR" -type f 2>/dev/null | wc -l)
  ok "Object Store: $FILES_PUBLIC_COUNT public files, $FILES_PRIVATE_COUNT private files, $ASSETS_STAGED staged to data/assets/"

else
  warn "Not running in Replit environment — Object Store file export skipped"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────────┐"
  echo "  │  To export all Object Store files, run from the Replit Shell:   │"
  echo "  │                                                                  │"
  echo "  │  1. Open the Shell tab in the Replit editor (bottom panel,      │"
  echo "  │     separate from the workflow terminal where the app runs)      │"
  echo "  │  2. cd Cloud-On-Prem                                            │"
  echo "  │  3. bash cloud/export-all.sh ./learnplay-export                 │"
  echo "  │                                                                  │"
  echo "  │  The script uses @replit/object-storage — no gsutil needed.     │"
  echo "  └─────────────────────────────────────────────────────────────────┘"
  echo ""

  # Fallback: try HTTP image download from running app (same as export-platform-data.sh)
  info "Checking for running app at http://localhost:5000 as fallback for image assets..."

  if curl -sf http://localhost:5000/api/health >/dev/null 2>&1 || \
     curl -sf http://localhost:3001/api/health >/dev/null 2>&1 || \
     curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then

    APP_PORT=5000
    curl -sf http://localhost:5000/api/health >/dev/null 2>&1 || \
    { APP_PORT=3001; curl -sf http://localhost:3001/api/health >/dev/null 2>&1; } || \
    { APP_PORT=3000; }

    info "App found at localhost:$APP_PORT — downloading platform image assets..."

    IMAGE_URLS=()

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "thumbnailUrl" FROM "gammaThemes" WHERE "thumbnailUrl" IS NOT NULL;' 2>/dev/null || true)

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "thumbnailUrl" FROM "gammaImageStyles" WHERE "thumbnailUrl" IS NOT NULL;' 2>/dev/null || true)

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "logoUrl" FROM "brandingThemes" WHERE "logoUrl" IS NOT NULL;' 2>/dev/null || true)

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "faviconUrl" FROM "brandingThemes" WHERE "faviconUrl" IS NOT NULL;' 2>/dev/null || true)

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "iconUrl" FROM "powerUpCatalog" WHERE "iconUrl" IS NOT NULL;' 2>/dev/null || true)

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "previewUrl" FROM "cosmeticCatalog" WHERE "previewUrl" IS NOT NULL;' 2>/dev/null || true)

    while IFS= read -r url; do
      [ -n "$url" ] && IMAGE_URLS+=("$url")
    done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "badgeUrl" FROM "achievementCatalog" WHERE "badgeUrl" IS NOT NULL;' 2>/dev/null || true)

    DL_OK=0; DL_FAIL=0

    for url in "${IMAGE_URLS[@]}"; do
      if [[ "$url" == /api/public-objects/* ]]; then
        rel_path="${url#/api/public-objects/}"
      elif [[ "$url" == /api/public/* ]]; then
        rel_path="${url#/api/public/}"
      else
        rel_path="${url#/}"
      fi

      dest="$ASSETS_DIR/$rel_path"
      mkdir -p "$(dirname "$dest")"

      if curl -sf "http://localhost:${APP_PORT}${url}" -o "$dest" 2>/dev/null; then
        DL_OK=$((DL_OK + 1))
      else
        DL_FAIL=$((DL_FAIL + 1))
      fi
    done

    ok "Image assets (HTTP fallback): $DL_OK downloaded, $DL_FAIL failed (${#IMAGE_URLS[@]} total URLs)"
  else
    warn "App is not running — image assets not exported"
    warn "For complete file export, run from the Replit Shell tab (see instructions above)"
  fi
fi

# =============================================================================
# PHASE 3: Write MANIFEST.json
# =============================================================================
header "Phase 3: Writing manifest"

MANIFEST_FILE="$OUTPUT_DIR/MANIFEST.json"
TOTAL_DB_TABLES=${#EXPORT_TABLES[@]}
ASSET_FILE_COUNT=$(find "$ASSETS_DIR" -type f 2>/dev/null | wc -l)
PUBLIC_FILE_COUNT=$(find "$FILES_DIR/public" -type f 2>/dev/null | wc -l)
PRIVATE_FILE_COUNT=$(find "$FILES_DIR/private" -type f 2>/dev/null | wc -l)

cat > "$MANIFEST_FILE" <<MANIFEST
{
  "exportVersion": "$SCRIPT_VERSION",
  "exportedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exportedFrom": "Replit",
  "variant": "cloud",
  "replitBucket": "$REPLIT_BUCKET",
  "objectStoreExported": $IN_REPLIT,
  "includePrivate": $INCLUDE_PRIVATE,
  "database": {
    "tablesExported": $DB_EXPORTED,
    "tablesEmpty": $DB_EMPTY,
    "tablesFailed": $DB_FAILED,
    "totalTables": $TOTAL_DB_TABLES
  },
  "files": {
    "publicFileCount": $PUBLIC_FILE_COUNT,
    "privateFileCount": $PRIVATE_FILE_COUNT,
    "assetFileCount": $ASSET_FILE_COUNT
  },
  "tables": [$(printf '"%s",' "${EXPORT_TABLES[@]}" | sed 's/,$//')]
}
MANIFEST

ok "Manifest written to MANIFEST.json"

# =============================================================================
# Summary and next steps
# =============================================================================
BUNDLE_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1 || echo "unknown")

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                       Export Complete                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Bundle:          $OUTPUT_DIR"
echo "  Bundle size:     $BUNDLE_SIZE"
echo "  DB tables:       $DB_EXPORTED with data, $DB_EMPTY empty, $DB_FAILED failed"
echo "  Asset files:     $ASSET_FILE_COUNT (data/assets/ — for import script)"
echo "  Public files:    $PUBLIC_FILE_COUNT (files/public/ — full Object Store)"
if $INCLUDE_PRIVATE; then
  echo "  Private files:   $PRIVATE_FILE_COUNT (files/private/ — user content)"
fi
echo ""
echo "────────────────────────────────────────────────────────────────────"
echo " NEXT STEPS — Cloud-On-Prem deployment"
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo " 1. Push Object Store files to your own GCS bucket (run from Replit shell):"
echo ""
echo "      gsutil -m rsync -r $OUTPUT_DIR/files/public/ gs://YOUR-BUCKET/public"
echo ""
echo "    Your Linux server's GOOGLE_SERVICE_ACCOUNT_JSON must have write access"
echo "    to YOUR-BUCKET. After pushing, the Linux server reads files from there."
echo ""
echo " 2. Copy the data/ bundle for use with import-platform-data.sh:"
echo ""
echo "    From your Ubuntu development machine:"
echo "      cp -r $OUTPUT_DIR/data /path/to/Cloud-On-Prem/data"
echo ""
echo "    Then run the import (after npm run db:push and SuperAdmin registration):"
echo "      export DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'"
echo "      bash cloud/import-platform-data.sh ./data"
echo ""
echo " 3. For a Linux server running the dist-cloud/ package:"
echo "    The update.sh script picks up data/ automatically if placed in the dist:"
echo "      cp -r $OUTPUT_DIR/data dist-cloud/data"
echo "    Then on the server: sudo bash dist-cloud/scripts/update.sh"
echo ""
echo " 4. To re-export Object Store files:"
echo "    Re-run this script from the Replit Shell tab. The @replit/object-storage"
echo "    client downloads all files fresh each time — existing files are overwritten."
echo ""
