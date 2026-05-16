#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${1:-$SCRIPT_DIR/../dist-onprem/data}"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

mkdir -p "$OUTPUT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

echo "📦 Exporting platform data..."

read_env_value() {
  local env_file="$1"
  local key="$2"
  if [ ! -f "$env_file" ]; then
    return 1
  fi
  grep -E "^${key}=" "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

normalize_upload_root() {
  local root="$1"
  root="${root%/}"
  if [[ "$root" == */public ]]; then
    root="${root%/public}"
  fi
  printf '%s' "$root"
}

PLATFORM_TABLES=(
  "achievementCatalog"
  "adminChallengeConfig"
  "aiConfig"
  "brandingThemes"
  "businessPackagePrices"
  "businessPackages"
  "cardCollections"
  "cards"
  "challengeTemplates"
  "collectionStatTypes"
  "cosmeticCatalog"
  "courseTags"
  "creditPurchasePackages"
  "currencyConversionRates"
  "elearningSubscriptionPlans"
  "gamificationEconomyRules"
  "gammaImageStyles"
  "gammaThemes"
  "lessonCreditPricingSettings"
  "licenseFlagOverrides"
  "platformConfiguration"
  "platformCostCategories"
  "platformCostCategoryTypes"
  "platformPaymentSettings"
  "platformPricing"
  "platformRevenueSources"
  "powerUpCatalog"
  "quizCreditPricing"
  "seasonPassConfig"
  "seasonPassTiers"
  "shopItemPricing"
  "subscriptionPlans"
  "supportedLanguages"
  "systemSettings"
  "universalStatUnits"
)

for TABLE in "${PLATFORM_TABLES[@]}"; do
  echo "  Exporting \"$TABLE\"..."
  psql "$DATABASE_URL" -t -A -c "SELECT json_agg(t) FROM \"$TABLE\" t;" > "$OUTPUT_DIR/${TABLE}.json" 2>/dev/null || echo "  ⚠️  Table \"$TABLE\" not found or empty"

  if [ ! -s "$OUTPUT_DIR/${TABLE}.json" ] || [ "$(cat "$OUTPUT_DIR/${TABLE}.json" | tr -d '[:space:]')" = "" ] || [ "$(cat "$OUTPUT_DIR/${TABLE}.json" | tr -d '[:space:]')" = "null" ]; then
    echo "[]" > "$OUTPUT_DIR/${TABLE}.json"
  fi
done

# ============================================
# Export image assets from upload storage (filesystem)
# ============================================
echo ""
echo "📷 Exporting image assets..."

mkdir -p "$OUTPUT_DIR/assets/gamma/themes/" "$OUTPUT_DIR/assets/gamma/image-styles/" "$OUTPUT_DIR/assets/branding/platform/"

declare -a IMAGE_URLS=()
declare -A SEEN_URLS=()
declare -A SEEN_UPLOAD_ROOTS=()
declare -a UPLOAD_ROOTS=()
declare -a PLATFORM_SUBDIRS=(gamma branding power-ups cosmetics achievements cards)
declare -a MISSING_TRACE=()

add_upload_root_if_exists() {
  local raw="$1"
  local normalized=""
  if [ -z "$raw" ]; then
    return 0
  fi
  normalized="$(normalize_upload_root "$raw")"
  if [ -z "$normalized" ] || [ ! -d "$normalized" ]; then
    return 0
  fi
  if [ -n "${SEEN_UPLOAD_ROOTS[$normalized]:-}" ]; then
    return 0
  fi
  SEEN_UPLOAD_ROOTS["$normalized"]=1
  UPLOAD_ROOTS+=("$normalized")
}

# Canonical root discovery order (scoped runtime first; legacy/repo fallback last).
add_upload_root_if_exists "${LEARNPLAY_UPLOAD_DIR:-}"
add_upload_root_if_exists "$(read_env_value "/opt/learnplay/cloud/.env" "LEARNPLAY_UPLOAD_DIR" || true)"
add_upload_root_if_exists "$(read_env_value "/opt/learnplay/onprem/.env" "LEARNPLAY_UPLOAD_DIR" || true)"
add_upload_root_if_exists "/opt/learnplay/cloud/uploads"
add_upload_root_if_exists "/opt/learnplay/onprem/uploads"
add_upload_root_if_exists "/opt/learnplay/uploads"
add_upload_root_if_exists "$PROJECT_ROOT/uploads/cloud"
add_upload_root_if_exists "$PROJECT_ROOT/uploads/onprem"
add_upload_root_if_exists "$PROJECT_ROOT/uploads"

if [ "${#UPLOAD_ROOTS[@]}" -eq 0 ]; then
  echo "❌ No upload roots found."
  echo "   Checked (in order): LEARNPLAY_UPLOAD_DIR, /opt/learnplay/cloud/.env:LEARNPLAY_UPLOAD_DIR, /opt/learnplay/onprem/.env:LEARNPLAY_UPLOAD_DIR, /opt/learnplay/cloud/uploads, /opt/learnplay/onprem/uploads, /opt/learnplay/uploads, $PROJECT_ROOT/uploads/cloud, $PROJECT_ROOT/uploads/onprem, $PROJECT_ROOT/uploads"
  exit 1
fi
echo "   ℹ️  Upload roots (priority order): ${UPLOAD_ROOTS[*]}"

# Stage all known platform asset folders first so package contains complete runtime assets.
SOURCE_PLATFORM_FILES=0
for root in "${UPLOAD_ROOTS[@]}"; do
  for subdir in "${PLATFORM_SUBDIRS[@]}"; do
    for src_base in "$root/public" "$root"; do
      if [ -d "$src_base/$subdir" ]; then
        mkdir -p "$OUTPUT_DIR/assets/$subdir"
        cp -a "$src_base/$subdir/." "$OUTPUT_DIR/assets/$subdir/" 2>/dev/null || true
      fi
    done
  done
done

for root in "${UPLOAD_ROOTS[@]}"; do
  for subdir in "${PLATFORM_SUBDIRS[@]}"; do
    for src_base in "$root/public" "$root"; do
      if [ -d "$src_base/$subdir" ]; then
        c=$(find "$src_base/$subdir" -type f 2>/dev/null | wc -l | tr -d ' ')
        SOURCE_PLATFORM_FILES=$((SOURCE_PLATFORM_FILES + ${c:-0}))
      fi
    done
  done
done

while IFS= read -r url; do
  [ -n "$url" ] && IMAGE_URLS+=("$url")
done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "thumbnailUrl" FROM "gammaThemes" WHERE "thumbnailUrl" IS NOT NULL;' 2>/dev/null)

while IFS= read -r url; do
  [ -n "$url" ] && IMAGE_URLS+=("$url")
done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "thumbnailUrl" FROM "gammaImageStyles" WHERE "thumbnailUrl" IS NOT NULL;' 2>/dev/null)

while IFS= read -r url; do
  [ -n "$url" ] && IMAGE_URLS+=("$url")
done < <(psql "$DATABASE_URL" -t -A -c "SELECT \"logoUrl\" FROM \"brandingThemes\" WHERE \"organizationId\" IS NULL OR \"organizationId\" = '';" 2>/dev/null)

while IFS= read -r url; do
  [ -n "$url" ] && IMAGE_URLS+=("$url")
done < <(psql "$DATABASE_URL" -t -A -c "SELECT \"faviconUrl\" FROM \"brandingThemes\" WHERE \"organizationId\" IS NULL OR \"organizationId\" = '';" 2>/dev/null)

while IFS= read -r url; do
  [ -n "$url" ] && IMAGE_URLS+=("$url")
done < <(psql "$DATABASE_URL" -t -A -c 'SELECT "iconUrl" FROM "powerUpCatalog" WHERE "iconUrl" IS NOT NULL;' 2>/dev/null)

normalize_rel_path() {
  local raw="$1"
  raw="${raw%%\?*}"
  raw="${raw%%#*}"
  raw="${raw#http://}"
  raw="${raw#https://}"
  raw="${raw#*/}"
  raw="/${raw#/}"
  if [[ "$raw" == /api/public-objects/* ]]; then
    echo "${raw#/api/public-objects/}"
  elif [[ "$raw" == /api/public/* ]]; then
    echo "${raw#/api/public/}"
  else
    echo "${raw#/}"
  fi
}

copy_asset_by_rel_path() {
  local rel_path="$1"
  local src=""
  local root=""
  for root in "${UPLOAD_ROOTS[@]}"; do
    if [ -f "$root/public/$rel_path" ]; then
      src="$root/public/$rel_path"
      break
    fi
    if [ -f "$root/$rel_path" ]; then
      src="$root/$rel_path"
      break
    fi
  done
  if [ -z "$src" ]; then
    MISSING_TRACE+=("$rel_path | searched: ${UPLOAD_ROOTS[*]}")
    return 1
  fi
  mkdir -p "$OUTPUT_DIR/assets/$(dirname "$rel_path")"
  cp -f "$src" "$OUTPUT_DIR/assets/$rel_path"
  return 0
}

COPY_OK=0
COPY_FAIL=0

for url in "${IMAGE_URLS[@]}"; do
  rel_path="$(normalize_rel_path "$url")"
  [ -n "$rel_path" ] || continue
  if [ -n "${SEEN_URLS[$rel_path]:-}" ]; then
    continue
  fi
  SEEN_URLS["$rel_path"]=1
  if copy_asset_by_rel_path "$rel_path"; then
    COPY_OK=$((COPY_OK + 1))
  else
    COPY_FAIL=$((COPY_FAIL + 1))
    echo "   ⚠️  Missing asset for URL: $url (normalized: $rel_path)"
  fi
done

if [ "${#MISSING_TRACE[@]}" -gt 0 ]; then
  echo "   ℹ️  Missing asset trace:"
  for entry in "${MISSING_TRACE[@]}"; do
    echo "      - $entry"
  done
fi

REF_TOTAL="${#SEEN_URLS[@]}"
STAGED_TOTAL="$(find "$OUTPUT_DIR/assets" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "   ✅ Image assets copied: $COPY_OK, missing: $COPY_FAIL, unique refs: $REF_TOTAL"
echo "   ✅ Staged platform asset files: $STAGED_TOTAL"

cat > "$OUTPUT_DIR/asset-export-summary.json" <<EOF
{
  "uniqueReferences": $REF_TOTAL,
  "copied": $COPY_OK,
  "missing": $COPY_FAIL,
  "stagedTotal": ${STAGED_TOTAL:-0},
  "sourcePlatformFiles": ${SOURCE_PLATFORM_FILES:-0}
}
EOF

if [ "$COPY_FAIL" -gt 0 ]; then
  echo "❌ Asset export failed integrity checks: $COPY_FAIL referenced asset(s) are missing"
  echo "   See warnings above and summary: $OUTPUT_DIR/asset-export-summary.json"
  exit 1
fi
if [ "${REF_TOTAL:-0}" -gt 0 ] && [ "${STAGED_TOTAL:-0}" -lt 1 ]; then
  echo "❌ Asset export failed integrity checks: no staged platform assets were exported"
  echo "   See summary: $OUTPUT_DIR/asset-export-summary.json"
  exit 1
fi
if [ "${REF_TOTAL:-0}" -eq 0 ] && [ "${STAGED_TOTAL:-0}" -eq 0 ]; then
  echo "   ⚠️  No platform asset references were found; continuing with empty staged assets."
fi

echo ""
echo "✅ Platform data exported to: $OUTPUT_DIR"
echo "   Files: $(ls "$OUTPUT_DIR"/*.json 2>/dev/null | wc -l) tables"
