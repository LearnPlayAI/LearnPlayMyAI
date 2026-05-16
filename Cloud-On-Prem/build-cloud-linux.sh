#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/dist-cloud"
SEED_DATA_DIR="$SCRIPT_DIR/cloud/data"
UPLOADS_DIR="$SCRIPT_DIR/uploads/public"

# ============================================
# LearnPlay Cloud (Linux) Build Script
# ============================================
# Produces a production build of the cloud version in dist-cloud/
# Run on Ubuntu 24 with Node 20+, npm, and esbuild installed.
#
# Usage:
#   bash build-cloud-linux.sh
#
# The cloud version uses:
#   - Local filesystem storage rooted under runtime uploads directory
#   - Standard PostgreSQL for the database
#   - server/db.ts, server/objectStorage.ts (cloud variants — no file swaps needed)
#
# Before running:
#   1. Copy .env.example to .env and fill in all required values
#   2. Ensure npm install has been run

echo ""
echo "============================================"
echo " LearnPlay Cloud (Linux) — Production Build"
echo "============================================"
echo ""

fail() {
  echo "❌ $*" >&2
  exit 1
}

enforce_devadmin_build_context() {
  if [ "${LEARNPLAY_BUILD_INVOKER_TOOL:-}" != "devadmin" ]; then
    fail "Package builds must be started by devadmin (set by devadmin build pipeline)."
  fi
  if [ "${LEARNPLAY_ALLOW_NON_INTERNAL_BUILD:-false}" != "true" ] && [ ! -d "/antigravity/Cloud-On-Prem" ]; then
    fail "Package build environment must be the internal LearnPlay DEV host (/antigravity/Cloud-On-Prem)."
  fi
}

detect_dev_runtime_database_url() {
  if [ -n "${CLOUD_SCHEMA_DATABASE_URL:-}" ]; then
    printf '%s' "$CLOUD_SCHEMA_DATABASE_URL"
    return 0
  fi
  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "$DATABASE_URL"
    return 0
  fi
  if [ -f "/opt/learnplay/cloud/.env" ]; then
    local runtime_db
    runtime_db="$(grep -E '^DATABASE_URL=' /opt/learnplay/cloud/.env | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
    if [ -n "$runtime_db" ]; then
      printf '%s' "$runtime_db"
      return 0
    fi
  fi
  local env_file workspace_db
  for env_file in "$SCRIPT_DIR/.env.cloud.local" "$SCRIPT_DIR/.env"; do
    if [ ! -f "$env_file" ]; then
      continue
    fi
    workspace_db="$(grep -E '^DATABASE_URL=' "$env_file" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
    if [ -n "$workspace_db" ]; then
      printf '%s' "$workspace_db"
      return 0
    fi
  done
  return 1
}

prepare_packaged_migrations() {
  local source_dir="$SCRIPT_DIR/migrations"
  local package_mode="${LEARNPLAY_PACKAGE_MIGRATION_MODE:-baseline-only}"
  mkdir -p "$BUILD_DIR/migrations/meta"
  rm -f "$BUILD_DIR"/migrations/*.sql
  rm -f "$BUILD_DIR"/migrations/meta/*.json

  if [ "$package_mode" = "baseline-only" ]; then
    local latest_baseline_file=""
    local ts_ms
    local idx=0
    local migration_tags=()
    ts_ms="$(($(date +%s) * 1000))"
    shopt -s nullglob
    local scoped_files=("$source_dir"/*_dev_runtime_cloud_*.sql)
    local all_files=("$source_dir"/*.sql)
    shopt -u nullglob

    if [ ${#all_files[@]} -eq 0 ]; then
      echo "⚠️  No migration SQL files found; emitting empty baseline migration journal."
      cat > "$BUILD_DIR/migrations/meta/_journal.json" <<EOF
{
  "version": "7",
  "dialect": "postgresql",
  "entries": []
}
EOF
      return 0
    fi

    if [ ${#scoped_files[@]} -gt 0 ]; then
      latest_baseline_file="$(printf '%s\n' "${scoped_files[@]}" | sort | tail -n1)"
    fi

    local sorted_all_files
    sorted_all_files="$(printf '%s\n' "${all_files[@]}" | sort)"

    if [ -n "$latest_baseline_file" ] && [ -f "$latest_baseline_file" ]; then
      while IFS= read -r migration_file; do
        [ -z "$migration_file" ] && continue
        if [[ "$(basename "$migration_file")" < "$(basename "$latest_baseline_file")" ]]; then
          continue
        fi
        cp "$migration_file" "$BUILD_DIR/migrations/"
        migration_tags+=("$(basename "$migration_file" .sql)")
      done <<< "$sorted_all_files"
    else
      # Fallback: no scoped baseline present, keep latest migration only.
      local latest_file
      latest_file="$(printf '%s\n' "${all_files[@]}" | sort | tail -n1)"
      cp "$latest_file" "$BUILD_DIR/migrations/"
      migration_tags+=("$(basename "$latest_file" .sql)")
    fi

    if [ ${#migration_tags[@]} -eq 0 ]; then
      echo "❌ Failed to select packaged migrations in baseline-only mode"
      exit 1
    fi

    local journal_entries=""
    for tag in "${migration_tags[@]}"; do
      if [ -n "$journal_entries" ]; then
        journal_entries+=","
      fi
      journal_entries+=$'\n'"    {"$'\n'"      \"idx\": $idx,"$'\n'"      \"version\": \"7\","$'\n'"      \"when\": $((ts_ms + idx)),"$'\n'"      \"tag\": \"$tag\","$'\n'"      \"breakpoints\": true"$'\n'"    }"
      idx=$((idx + 1))
    done

    cat > "$BUILD_DIR/migrations/meta/_journal.json" <<EOF
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [${journal_entries}
  ]
}
EOF
    if [ -n "$latest_baseline_file" ]; then
      echo "📦 Migration package mode: baseline-only (kept baseline $(basename "$latest_baseline_file") + ${#migration_tags[@]} migration file(s) from baseline onward)"
    else
      echo "📦 Migration package mode: baseline-only (no scoped baseline found; kept latest migration ${migration_tags[0]}.sql)"
    fi
    return 0
  fi

  cp -r "$source_dir"/*.sql "$BUILD_DIR/migrations/" 2>/dev/null || true
  cp -r "$source_dir"/meta/* "$BUILD_DIR/migrations/meta/" 2>/dev/null || true
  echo "📦 Migration package mode: full-history"
}

generate_dev_baseline_migration_if_needed() {
  local db_url="$1"
  local state_dir="${LEARNPLAY_DEV_BUILD_STATE_DIR:-/antigravity/packages/.build-state}"
  node "$SCRIPT_DIR/scripts/dev-db-baseline-migrations.mjs" \
    --scope cloud \
    --db-url "$db_url" \
    --migrations-dir "$SCRIPT_DIR/migrations" \
    --state-dir "$state_dir" \
    --write-state true
  node "$SCRIPT_DIR/scripts/migration-governance.mjs" validate --deployment-mode cloud --auto-remediate-journal
}

enforce_devadmin_build_context

# ============================================
# 0. VALIDATE MIGRATION COMPATIBILITY CONTRACT
# ============================================
BUILD_DB_URL="$(detect_dev_runtime_database_url)" || fail "Cloud DEV schema DATABASE_URL is required. Set CLOUD_SCHEMA_DATABASE_URL/DATABASE_URL or configure /opt/learnplay/cloud/.env or .env.cloud.local."
echo "🔁 Detecting DEV runtime schema changes since last successful build..."
generate_dev_baseline_migration_if_needed "$BUILD_DB_URL"

echo "🔎 Validating migration compatibility..."
if [ -x "$SCRIPT_DIR/scripts/validate-migrations.sh" ]; then
  "$SCRIPT_DIR/scripts/validate-migrations.sh" "$SCRIPT_DIR/migrations" "cloud" || fail "Migration validation failed"
else
  fail "Missing migration validator: $SCRIPT_DIR/scripts/validate-migrations.sh"
fi

# ============================================
# 1. CLEAN BUILD DIRECTORY
# ============================================
echo "🧹 Cleaning build directory: $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{server,client,scripts,config}

# ============================================
# 2. FRONTEND BUILD
# ============================================
echo "🏗️  Building frontend..."
cd "$SCRIPT_DIR"
npx vite build --outDir "$BUILD_DIR/client"

# ============================================
# 3. SERVER BUILD (cloud variants — no file swaps)
# ============================================
echo "🏗️  Building server..."
npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir="$BUILD_DIR/server"

# ============================================
# 4. BUILD MIGRATION RUNNER
# ============================================
echo "🏗️  Building migration runner..."
npx esbuild server/migrate-onprem.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outfile="$BUILD_DIR/scripts/migrate.js"

# ============================================
# 4b. BUILD PODCAST HLS BACKFILL RUNNER
# ============================================
echo "🏗️  Building podcast HLS backfill runner..."
npx esbuild server/scripts/backfillPodcastHls.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outfile="$BUILD_DIR/scripts/backfillPodcastHls.js"

# ============================================
# 4c. COPY MIGRATION GOVERNANCE TOOLING
# ============================================
echo "📋 Copying migration governance tooling..."
mkdir -p "$BUILD_DIR/scripts/lib"
cp "$SCRIPT_DIR/scripts/migration-governance.mjs" "$BUILD_DIR/scripts/migration-governance.mjs"
cp "$SCRIPT_DIR/scripts/remediate-snake-case-tables.mjs" "$BUILD_DIR/scripts/remediate-snake-case-tables.mjs"
cp "$SCRIPT_DIR/scripts/data-parity-gate.mjs" "$BUILD_DIR/scripts/data-parity-gate.mjs"
cp "$SCRIPT_DIR/scripts/lib/migration-governance-lib.js" "$BUILD_DIR/scripts/lib/migration-governance-lib.js"
chmod +x "$BUILD_DIR/scripts/migration-governance.mjs"
chmod +x "$BUILD_DIR/scripts/remediate-snake-case-tables.mjs"
chmod +x "$BUILD_DIR/scripts/data-parity-gate.mjs"

# ============================================
# 5. COPY MIGRATIONS
# ============================================
echo "📋 Copying migrations..."
mkdir -p "$BUILD_DIR/migrations/meta"
prepare_packaged_migrations

# ============================================
# 6. COPY LICENSE KEY (if present)
# ============================================
if [ -f "$SCRIPT_DIR/server/config/cloud-license-public-key.pem" ]; then
  mkdir -p "$BUILD_DIR/server/config"
  cp "$SCRIPT_DIR/server/config/cloud-license-public-key.pem" "$BUILD_DIR/server/config/"
  echo "🔑 License public key copied"
fi

# ============================================
# 6b. COPY DATABASE BOOTSTRAP SQL (ENUMS + FULL SCHEMA)
# ============================================
if [ -f "$SCRIPT_DIR/onprem/create-enums.sql" ]; then
  cp "$SCRIPT_DIR/onprem/create-enums.sql" "$BUILD_DIR/create-enums.sql"
fi
echo "📋 Generating schema-full.sql from current database state..."
command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is required to generate schema-full.sql"

pg_dump --schema-only --no-owner --no-privileges --no-comments --no-tablespaces --no-security-labels --schema=public "$BUILD_DB_URL" 2>/dev/null | \
  sed '/^\\restrict/d' | \
  sed '/^\\unrestrict/d' | \
  sed '/^CREATE SCHEMA public;/d' | \
  sed 's/public\.//g' | \
  sed '/^SET /d' | \
  sed '/^SELECT pg_catalog/d' > "$BUILD_DIR/schema-full.raw.sql"

if [ ! -s "$BUILD_DIR/schema-full.raw.sql" ]; then
  fail "Generated schema-full.sql is empty"
fi

echo "🔧 Making schema-full.sql idempotent..."
awk '
BEGIN { alter_table_line = "" }

/^CREATE TYPE [^ ]+ AS ENUM/ {
  enum_block = $0
  if ($0 !~ /;[[:space:]]*$/) {
    while ((getline line) > 0) {
      enum_block = enum_block "\n" line
      if (line ~ /;[[:space:]]*$/) break
    }
  }
  print "DO $$ BEGIN"
  print enum_block
  print "EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;"
  print "END $$;"
  next
}

/^CREATE TABLE / && !/IF NOT EXISTS/ {
  sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
}

/^CREATE INDEX / && !/IF NOT EXISTS/ {
  sub(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
}

/^CREATE UNIQUE INDEX / && !/IF NOT EXISTS/ {
  sub(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
}

/^CREATE SEQUENCE / && !/IF NOT EXISTS/ {
  sub(/^CREATE SEQUENCE /, "CREATE SEQUENCE IF NOT EXISTS ")
}

/^CREATE SCHEMA / && !/IF NOT EXISTS/ {
  sub(/^CREATE SCHEMA /, "CREATE SCHEMA IF NOT EXISTS ")
}

/^ALTER TABLE ONLY .* ALTER COLUMN .* SET DEFAULT / {
  print "DO $$ BEGIN"
  print $0
  print "EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;"
  print "END $$;"
  next
}

/^ALTER TABLE ONLY / {
  alter_table_line = $0
  next
}

/^[[:space:]]+ADD CONSTRAINT / && alter_table_line != "" {
  constraint_block = alter_table_line "\n" $0
  if ($0 !~ /;[[:space:]]*$/) {
    while ((getline line) > 0) {
      constraint_block = constraint_block "\n" line
      if (line ~ /;[[:space:]]*$/) break
    }
  }
  print "DO $$ BEGIN"
  print constraint_block
  print "EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;"
  print "END $$;"
  alter_table_line = ""
  next
}

alter_table_line != "" && /ALTER COLUMN.*SET DEFAULT/ {
  print "DO $$ BEGIN"
  print alter_table_line
  print $0
  print "EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;"
  print "END $$;"
  alter_table_line = ""
  next
}

alter_table_line != "" {
  print alter_table_line
  alter_table_line = ""
}

{ print }

END {
  if (alter_table_line != "") print alter_table_line
}
' "$BUILD_DIR/schema-full.raw.sql" > "$BUILD_DIR/schema-full.sql"
rm -f "$BUILD_DIR/schema-full.raw.sql"

echo "   ✅ schema-full.sql generated ($(grep -c 'CREATE TABLE' "$BUILD_DIR/schema-full.sql") tables; $(grep -c 'IF NOT EXISTS' "$BUILD_DIR/schema-full.sql") guards)"

echo "🔍 Validating critical enterprise schema columns in schema-full.sql..."
SCHEMA_VALIDATION_FAILED=false
REQUIRED_COLUMNS=(
  "syncAuthMode"
  "syncAuthVersion"
  "syncAuthSecretHash"
  "syncAuthRevokedAt"
)
for col in "${REQUIRED_COLUMNS[@]}"; do
  if ! grep -q "\"$col\"" "$BUILD_DIR/schema-full.sql"; then
    echo "   ❌ MISSING COLUMN: \"$col\" not found in schema-full.sql"
    SCHEMA_VALIDATION_FAILED=true
  fi
done
if [ "$SCHEMA_VALIDATION_FAILED" = true ]; then
  echo "❌ schema-full.sql is missing required enterprise sync-auth columns."
  echo "   Root cause likely: DEV database has unapplied migrations/schema drift."
  echo "   Apply pending migrations on DEV before building packages."
  exit 1
fi
echo "   ✅ Critical enterprise schema columns present"

echo "📋 Capturing schema parity fingerprint..."
psql "$BUILD_DB_URL" -At > "$BUILD_DIR/schema-fingerprint.env" <<'SQL'
SELECT 'EXPECTED_TABLES=' || count(*) FROM information_schema.tables WHERE table_schema='public';
SELECT 'EXPECTED_COLUMNS=' || count(*) FROM information_schema.columns WHERE table_schema='public';
SELECT 'EXPECTED_CONSTRAINTS=' || count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace;
SELECT 'EXPECTED_INDEXES=' || count(*) FROM pg_indexes WHERE schemaname='public';
SELECT 'EXPECTED_ENUMS=' || count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e';
SELECT 'EXPECTED_CORE_TABLES=' || coalesce(string_agg(table_name, ',' ORDER BY table_name), '')
FROM information_schema.tables
WHERE table_schema='public';
SELECT 'EXPECTED_CORE_TABLE_COUNT=' || count(*)
FROM information_schema.tables
WHERE table_schema='public';
SELECT 'EXPECTED_CORE_COLUMN_COUNT=' || count(*)
FROM information_schema.columns
WHERE table_schema='public';
SELECT 'EXPECTED_CORE_ENUM_COUNT=' || count(*)
FROM pg_type t
JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typtype='e';
SELECT 'EXPECTED_SCHEMA_SIG=' || md5(string_agg(s, E'\n' ORDER BY s))
FROM (
  SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public'
  UNION ALL
  SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'')
  FROM information_schema.columns WHERE table_schema='public'
  UNION ALL
  SELECT 'K|'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid)
  FROM pg_constraint WHERE connamespace='public'::regnamespace
  UNION ALL
  SELECT 'I|'||schemaname||'|'||tablename||'|'||indexname||'|'||indexdef
  FROM pg_indexes WHERE schemaname='public'
  UNION ALL
  SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public'
) x;
SELECT 'EXPECTED_CORE_SCHEMA_SIG=' || md5(string_agg(s, E'\n' ORDER BY s))
FROM (
  SELECT 'T|'||table_name AS s FROM information_schema.tables WHERE table_schema='public'
  UNION ALL
  SELECT 'C|'||table_name||'|'||column_name||'|'||udt_name||'|'||coalesce(character_maximum_length::text,'')||'|'||coalesce(numeric_precision::text,'')||'|'||coalesce(numeric_scale::text,'')||'|'||is_nullable||'|'||coalesce(column_default,'')
  FROM information_schema.columns WHERE table_schema='public'
  UNION ALL
  SELECT 'E|'||t.typname||'|'||e.enumsortorder||'|'||e.enumlabel
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public'
) x;
SQL
echo "   ✅ schema-fingerprint.env captured"
{
  echo "CONTRACT_PRODUCT=shared"
  echo "CONTRACT_VERSION=1"
  echo "CONTRACT_GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat "$BUILD_DIR/schema-fingerprint.env"
} > "$BUILD_DIR/schema-contract.env"
echo "   ✅ schema-contract.env captured (product=shared)"

# ============================================
# 7. COPY CLOUD ADMINISTRATION SCRIPTS
# ============================================
echo "📋 Copying cloud administration scripts..."
CLOUD_SCRIPTS_SRC="$SCRIPT_DIR/cloud"

# Copy all .sh scripts → dist-cloud/scripts/ (excludes build-cloud-linux.sh which lives at root)
for sh in "$CLOUD_SCRIPTS_SRC"/*.sh; do
  [ -f "$sh" ] || continue
  cp "$sh" "$BUILD_DIR/scripts/"
  chmod +x "$BUILD_DIR/scripts/$(basename "$sh")"
done

# Copy supporting config files
cp "$CLOUD_SCRIPTS_SRC/ecosystem.config.cjs" "$BUILD_DIR/"
cp "$CLOUD_SCRIPTS_SRC/nginx.conf.template"  "$BUILD_DIR/"

# Copy documentation to dist root
for md in "$CLOUD_SCRIPTS_SRC"/*.md; do
  [ -f "$md" ] || continue
  cp "$md" "$BUILD_DIR/"
done

echo "   ✅ $(ls "$BUILD_DIR/scripts/"*.sh 2>/dev/null | wc -l) shell scripts copied to dist-cloud/scripts/"

# Guardrail: devadmin tooling must NEVER ship in installer/update packages.
if [ -f "$BUILD_DIR/scripts/devadmin.sh" ]; then
  fail "Packaging policy violation: dist-cloud/scripts/devadmin.sh must not be bundled"
fi

# Guardrail: WSL/Codex workstation tooling is local-development only and must
# never ship in installer/update packages.
WORKSTATION_TOOLING_FILES="$(find "$BUILD_DIR" \( \
  -path '*/scripts/dev-workspace/*' \
  -o -name 'local-apps.sh' \
  -o -name 'install-local-apps-autostart.sh' \
  -o -name 'bootstrap-wsl-dev.sh' \
  -o -name 'restore-runtime-data.sh' \
  -o -name 'wsl-devadmin.sh' \
  -o -name 'CODEX_DESKTOP_MASTER_PROMPT.md' \
\) -print)"
if [ -n "$WORKSTATION_TOOLING_FILES" ]; then
  echo "   Blocked workstation-only files:"
  printf '%s\n' "$WORKSTATION_TOOLING_FILES" | sed 's#^#   - #'
  fail "Packaging policy violation: WSL/Codex workstation tooling must not be bundled"
fi

# ============================================
# 8. COPY CLOUD SEED DATA + REQUIRED RUNTIME ASSETS
# ============================================
echo "📦 Copying seed data and required runtime assets..."

if [ ! -d "$SEED_DATA_DIR" ]; then
  fail "Seed data directory not found: $SEED_DATA_DIR"
fi

mkdir -p "$BUILD_DIR/data"
cp "$SEED_DATA_DIR"/*.json "$BUILD_DIR/data/"

if [ ! -d "$UPLOADS_DIR/gamma" ]; then
  fail "Missing required gamma uploads directory: $UPLOADS_DIR/gamma"
fi
if [ ! -d "$UPLOADS_DIR/branding/platform" ]; then
  fail "Missing required platform branding directory: $UPLOADS_DIR/branding/platform"
fi

mkdir -p "$BUILD_DIR/uploads/public"
cp -R "$UPLOADS_DIR/gamma" "$BUILD_DIR/uploads/public/"
mkdir -p "$BUILD_DIR/uploads/public/branding"
cp -R "$UPLOADS_DIR/branding/platform" "$BUILD_DIR/uploads/public/branding/"

# Required runtime assets manifest stored inside dist-cloud for traceability.
RUNTIME_MANIFEST="$BUILD_DIR/runtime-assets-manifest.txt"
{
  echo "# LearnPlay Cloud required runtime assets"
  echo "# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "data/*.json"
  echo "uploads/public/gamma/image-styles/*.jpeg"
  echo "uploads/public/gamma/themes/**"
  echo "uploads/public/branding/platform/*"
} > "$RUNTIME_MANIFEST"

SEED_COUNT=$(find "$BUILD_DIR/data" -type f -name '*.json' | wc -l | tr -d ' ')
STYLE_COUNT=$(find "$BUILD_DIR/uploads/public/gamma/image-styles" -type f 2>/dev/null | wc -l | tr -d ' ')
THEME_COUNT=$(find "$BUILD_DIR/uploads/public/gamma/themes" -type f 2>/dev/null | wc -l | tr -d ' ')
BRANDING_COUNT=$(find "$BUILD_DIR/uploads/public/branding/platform" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$SEED_COUNT" -lt 30 ]; then
  fail "Seed data check failed: expected >= 30 JSON files, found $SEED_COUNT"
fi
echo "   ✅ Seed JSON files: $SEED_COUNT"
if [ "$STYLE_COUNT" -lt 1 ]; then
  echo "   ⚠️  Gamma image styles: $STYLE_COUNT (no style assets packaged)"
else
  echo "   ✅ Gamma image styles: $STYLE_COUNT"
fi
if [ "$THEME_COUNT" -lt 1 ]; then
  echo "   ⚠️  Gamma theme thumbnails: $THEME_COUNT (no theme assets packaged)"
else
  echo "   ✅ Gamma theme thumbnails: $THEME_COUNT"
fi
if [ "$BRANDING_COUNT" -lt 1 ]; then
  fail "Platform branding asset check failed: expected >= 1 file, found $BRANDING_COUNT"
else
  echo "   ✅ Platform branding files: $BRANDING_COUNT"
fi

# ============================================
# 9. COPY RUNTIME DEPENDENCY MANIFESTS
# ============================================
echo "📦 Copying package manifests..."
cp "$SCRIPT_DIR/package.json" "$BUILD_DIR/package.json"
if [ -f "$SCRIPT_DIR/package-lock.json" ]; then
  cp "$SCRIPT_DIR/package-lock.json" "$BUILD_DIR/package-lock.json"
fi

# ============================================
# 10. GENERATE version.json
# ============================================
VERSION="${RELEASE_VERSION_OVERRIDE:-$(date +"%Y%m%d%H%M%S")}"
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
MIN_SUPPORTED_VERSION="${RELEASE_MIN_SUPPORTED_VERSION:-0}"

cat > "$BUILD_DIR/version.json" << VERJSON
{
  "version": "$VERSION",
  "buildDate": "$BUILD_DATE",
  "gitCommit": "$GIT_COMMIT",
  "gitBranch": "$GIT_BRANCH",
  "platform": "cloud-linux",
  "storage": "local-filesystem"
}
VERJSON

# ============================================
# 10a. GENERATE RELEASE NOTES
# ============================================
if [ -n "${RELEASE_NOTES_SCRIPT:-}" ] && [ -x "${RELEASE_NOTES_SCRIPT}" ]; then
  "${RELEASE_NOTES_SCRIPT}" \
    --scope "${RELEASE_NOTES_SCOPE:-cloud}" \
    --version "${VERSION}" \
    --changelog-file "${RELEASE_CHANGELOG_FILE:-/antigravity/docs/handoverdocs/CHANGELOG.md}" \
    --marker-file "${RELEASE_NOTES_MARKER_FILE:-${RELEASE_NOTES_PACKAGE_DIR:-/antigravity/packages/cloud}/.release-notes-marker-cloud.env}" \
    --state-output "${RELEASE_NOTES_STATE_OUTPUT:-$BUILD_DIR/release-notes-state.env}" \
    --changelog-output "$BUILD_DIR/CHANGELOG_PACKAGE.md" \
    --output "$BUILD_DIR/RELEASE_NOTES.txt"
  echo "   ✅ RELEASE_NOTES.txt generated"
else
  cat > "$BUILD_DIR/RELEASE_NOTES.txt" << EOF
LearnPlay Release Notes
Package Scope: cloud
Package Version: ${VERSION}
Build Date (System TZ): $(date +"%Y-%m-%d %H:%M:%S %Z %:z")

Issue: Release notes generator was not configured for this build.
Fix: Added a fallback release notes file so package metadata remains complete.
EOF
  cat > "$BUILD_DIR/CHANGELOG_PACKAGE.md" << EOF
LearnPlay Packaged Changelog
Package Scope: cloud
Package Version: ${VERSION}
Build Date (System TZ): $(date +"%Y-%m-%d %H:%M:%S %Z %:z")

No changelog entries were packaged because the changelog generator was not configured.
EOF
  echo "   ⚠️  RELEASE_NOTES.txt fallback generated (no release notes generator configured)"
fi

# ============================================
# 10b. GENERATE RELEASE MANIFEST (update/install contract)
# ============================================
cat > "$BUILD_DIR/release-manifest.json" << MANIFEST
{
  "product": "cloud",
  "channel": "learnplay-internal",
  "version": "$VERSION",
  "buildDate": "$BUILD_DATE",
  "minSupportedVersion": "$MIN_SUPPORTED_VERSION",
  "requiresMigrationRunner": "scripts/migrate.js",
  "requiredPaths": [
    "server",
    "client",
    "scripts",
    "migrations",
    "data",
    "uploads",
    "version.json",
    "RELEASE_NOTES.txt",
    "CHANGELOG_PACKAGE.md",
    "package.json",
    "package-lock.json",
    "nginx.conf.template",
    "runtime-assets-manifest.txt",
    "package-inventory.txt"
  ]
}
MANIFEST

# ============================================
# 11. COPY .env.example
# ============================================
cp "$SCRIPT_DIR/.env.example" "$BUILD_DIR/.env.example"

# ============================================
# 11b. OPTIONAL MANIFEST SIGNING
# ============================================
if [ -n "${RELEASE_SIGNING_KEY_PATH:-}" ] && [ -f "${RELEASE_SIGNING_KEY_PATH}" ] && command -v openssl >/dev/null 2>&1; then
  echo "🔏 Signing release manifest..."
  openssl dgst -sha256 -sign "${RELEASE_SIGNING_KEY_PATH}" -out "$BUILD_DIR/release-manifest.sig" "$BUILD_DIR/release-manifest.json"
  echo "   ✅ release-manifest.sig created"
else
  echo "ℹ️  Manifest signing skipped (set RELEASE_SIGNING_KEY_PATH to enable)"
fi
if [ -n "${RELEASE_PUBLIC_KEY_PATH:-}" ] && [ -f "${RELEASE_PUBLIC_KEY_PATH}" ]; then
  mkdir -p "$BUILD_DIR/server/config"
  cp "${RELEASE_PUBLIC_KEY_PATH}" "$BUILD_DIR/server/config/release-signing-public.pem"
  echo "   ✅ release-signing-public.pem bundled"
fi

# ============================================
# 12. SOURCE EXCLUSION GATE + PACKAGE INVENTORY
# ============================================
echo "🔒 Running source exclusion gate..."

# Variant contamination guardrails (cloud package must not default to onprem runtime mode).
if [ -f "$BUILD_DIR/.env.example" ] && grep -Eq '^ONPREM_MODE=true' "$BUILD_DIR/.env.example"; then
  fail "Contamination guard failed: dist-cloud/.env.example sets ONPREM_MODE=true"
fi
if [ -f "$BUILD_DIR/.env.example" ] && ! grep -Eq '^ONPREM_MODE=false' "$BUILD_DIR/.env.example"; then
  fail "Contamination guard failed: dist-cloud/.env.example missing ONPREM_MODE=false"
fi

if find "$BUILD_DIR" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.map' \) | grep -q .; then
  echo "   Blocked files:"
  find "$BUILD_DIR" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.map' \) | sed 's#^#   - #'
  fail "Source exclusion gate failed (TypeScript/source maps found in dist-cloud)"
fi

if find "$BUILD_DIR" -type d \( -name 'src' -o -name '.git' -o -name 'tests' \) | grep -q .; then
  echo "   Blocked directories:"
  find "$BUILD_DIR" -type d \( -name 'src' -o -name '.git' -o -name 'tests' \) | sed 's#^#   - #'
  fail "Source exclusion gate failed (dev/source directories found in dist-cloud)"
fi

echo "   ✅ Source exclusion gate passed"

INVENTORY_FILE="$BUILD_DIR/package-inventory.txt"
TOTAL_FILES=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$BUILD_DIR" | awk '{print $1}')
{
  echo "LearnPlay Cloud dist-cloud package inventory"
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Total files: $TOTAL_FILES"
  echo "Total size: $TOTAL_SIZE"
  echo ""
  echo "Top-level contents:"
  find "$BUILD_DIR" -mindepth 1 -maxdepth 1 | sort
} > "$INVENTORY_FILE"
echo "   ✅ Package inventory written: $INVENTORY_FILE"

CHECKSUM_FILE="$BUILD_DIR/package-checksums.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$BUILD_DIR"
    # Hash package contents for release traceability.
    find . -type f ! -name "$(basename "$CHECKSUM_FILE")" -print0 \
      | sort -z \
      | xargs -0 sha256sum > "$(basename "$CHECKSUM_FILE")"
  )
  echo "   ✅ Package checksums written: $CHECKSUM_FILE"
else
  echo "   ⚠️  sha256sum not available — skipping checksum manifest"
fi

# ============================================
# DONE
# ============================================
echo ""
echo "✅ Cloud (Linux) build complete: $BUILD_DIR"
echo ""
echo "Next steps:"
echo "  1. cd dist-cloud"
echo "  2. npm install --production"
echo "  3. cp .env.example .env && nano .env"
echo "  4. node scripts/migrate.js    # run database migrations"
echo "  5. node server/index.js       # or use PM2: pm2 start ecosystem.config.cjs"
echo ""
