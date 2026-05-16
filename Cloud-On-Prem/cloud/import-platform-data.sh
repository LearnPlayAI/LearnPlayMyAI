#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
DATA_DIR="$SCRIPT_DIR/data"
ALLOW_NONEMPTY=false
DRY_RUN=false
ALLOW_SYSTEM_SETTINGS_IMPORT_ON_NONEMPTY="${LEARNPLAY_ALLOW_SYSTEM_SETTINGS_IMPORT_ON_NONEMPTY:-false}"

while [ $# -gt 0 ]; do
  case "$1" in
    --allow-nonempty)
      ALLOW_NONEMPTY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage: bash cloud/import-platform-data.sh [data_dir] [--dry-run] [--allow-nonempty]

Safety defaults:
  - Refuses to run on non-empty databases.
  - Use --allow-nonempty only for explicit operator-approved maintenance.
  - Use --dry-run to inspect what would be imported without writing.
EOF
      exit 0
      ;;
    *)
      DATA_DIR="$1"
      shift
      ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$APP_DIR/.env" ]; then
    DATABASE_URL=$(sudo -u "$APP_USER" grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)
    export DATABASE_URL
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "❌ Data directory not found: $DATA_DIR"
  exit 1
fi

echo "🔍 Running seed import safety preflight..."
NON_EMPTY_TABLES=()
while IFS= read -r table; do
  [ -n "$table" ] || continue
  HAS_ROWS="$(psql "$DATABASE_URL" -t -A -c "SELECT EXISTS (SELECT 1 FROM \"$table\" LIMIT 1);" 2>/dev/null | tr -d '[:space:]' || echo 'f')"
  if [ "$HAS_ROWS" = "t" ]; then
    NON_EMPTY_TABLES+=("$table")
  fi
done < <(psql "$DATABASE_URL" -t -A -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT LIKE '__drizzle_%' ORDER BY table_name;" 2>/dev/null || true)

if [ "${#NON_EMPTY_TABLES[@]}" -gt 0 ] && [ "$ALLOW_NONEMPTY" != "true" ]; then
  echo "❌ Refusing seed import: database is not empty (${#NON_EMPTY_TABLES[@]} populated table(s))."
  echo "   This command is bootstrap-only to prevent overwriting existing data."
  echo "   Non-empty examples: ${NON_EMPTY_TABLES[*]:0:8}"
  echo "   If this is an explicitly approved maintenance run, re-run with --allow-nonempty."
  exit 1
fi

if [ "$DRY_RUN" = "true" ]; then
  echo "🧪 Dry run only — no writes executed."
  echo "   Data directory: $DATA_DIR"
  echo "   Populated tables: ${#NON_EMPTY_TABLES[@]}"
  if [ "${#NON_EMPTY_TABLES[@]}" -gt 0 ]; then
    echo "   Populated table sample: ${NON_EMPTY_TABLES[*]:0:12}"
  fi
  echo "✅ Preflight complete"
  exit 0
fi

echo "📦 Importing platform data..."

SUPERADMIN_ID=$(psql "$DATABASE_URL" -t -A -c "SELECT id FROM users WHERE \"isSuperAdmin\" = true LIMIT 1;" 2>/dev/null || echo '')
if [ -n "$SUPERADMIN_ID" ]; then
  echo "   Using SuperAdmin user ID for FK references: ${SUPERADMIN_ID:0:8}..."
else
  echo "   ⚠️  No SuperAdmin user found — NOT NULL FK columns referencing users may fail"
fi

IMPORT_ORDER=(
  "universalStatUnits"
  "supportedLanguages"
  "systemSettings"
  "platformConfiguration"
  "platformCostCategoryTypes"
  "platformCostCategories"
  "platformRevenueSources"
  "platformPaymentSettings"
  "platformPricing"
  "cardCollections"
  "collectionStatTypes"
  "cards"
  "courseTags"
  "cardStats"
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
)

IMPORTED=0
SKIPPED=0
FAILED=0

for TABLE in "${IMPORT_ORDER[@]}"; do
  FILE="$DATA_DIR/${TABLE}.json"

  if [ ! -f "$FILE" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  CONTENT=$(cat "$FILE" | tr -d '[:space:]')
  if [ "$CONTENT" = "[]" ] || [ "$CONTENT" = "null" ] || [ -z "$CONTENT" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ "$TABLE" = "brandingThemes" ]; then
    EXISTING_ROWS=$(psql "$DATABASE_URL" -t -A -c 'SELECT COUNT(*) FROM "brandingThemes";' 2>/dev/null || echo "ERROR")
    if [ "$EXISTING_ROWS" = "ERROR" ]; then
      echo "  ⚠️  Could not check brandingThemes — skipping to protect existing branding"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
    if [ "$EXISTING_ROWS" -gt 0 ] 2>/dev/null; then
      echo "  ⏭️  Skipping \"brandingThemes\" — $EXISTING_ROWS existing row(s) preserved (customer branding protected)"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
  fi

  if [ "$TABLE" = "systemSettings" ] && [ "${#NON_EMPTY_TABLES[@]}" -gt 0 ] && [ "$ALLOW_SYSTEM_SETTINGS_IMPORT_ON_NONEMPTY" != "true" ]; then
    echo "  ⏭️  Skipping \"systemSettings\" on non-empty DB — preserving runtime/user-managed settings"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  Importing \"$TABLE\"..."

  ESCAPED_JSON=$(cat "$FILE" | sed "s/'/''/g")

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<EOSQL 2>/dev/null || { echo "  ⚠️  Failed to import $TABLE"; FAILED=$((FAILED + 1)); continue; }
DO \$\$
DECLARE
  data_json jsonb;
  row_data jsonb;
  cols text[];
  col text;
  pk_cols text[];
  fk_user_cols text[];
  fk_org_cols text[];
  notnull_cols text[];
  has_all_pk_cols boolean := true;
  pk_col text;
  natural_key_cols text[] := ARRAY[]::text[];
  natural_col text;
  has_natural_keys boolean := false;
  natural_keys_in_seed boolean := true;
  natural_match_clause text;
  natural_set_clause text;
  col_literals text[] := ARRAY[]::text[];
  col_idx int;
  natural_idx int;
  natural_literal text;
  upsert_sql text;
  values_clause text;
  conflict_clause text;
  col_list text;
  col_val text;
  superadmin_id text := '${SUPERADMIN_ID}';
BEGIN
  data_json := '${ESCAPED_JSON}'::jsonb;

  IF data_json IS NULL OR jsonb_array_length(data_json) = 0 THEN
    RAISE NOTICE 'No data to import for $TABLE';
    RETURN;
  END IF;

  -- Get actual primary key columns for this table
  SELECT array_agg(a.attname ORDER BY a.attnum) INTO pk_cols
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = '"$TABLE"'::regclass AND i.indisprimary;

  IF pk_cols IS NULL OR array_length(pk_cols, 1) = 0 THEN
    RAISE NOTICE 'No primary key found for $TABLE, using plain INSERT';
    pk_cols := ARRAY[]::text[];
  END IF;

  -- Get FK columns that reference users
  SELECT array_agg(DISTINCT kcu.column_name) INTO fk_user_cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  WHERE tc.table_name = '$TABLE'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'users';

  IF fk_user_cols IS NULL THEN
    fk_user_cols := ARRAY[]::text[];
  END IF;

  -- Get FK columns that reference organizations/organizationUnits
  SELECT array_agg(DISTINCT kcu.column_name) INTO fk_org_cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  WHERE tc.table_name = '$TABLE'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name IN ('organizations', 'organizationUnits');

  IF fk_org_cols IS NULL THEN
    fk_org_cols := ARRAY[]::text[];
  END IF;

  -- Get NOT NULL columns for this table
  SELECT array_agg(a.attname) INTO notnull_cols
  FROM pg_attribute a
  WHERE a.attrelid = '"$TABLE"'::regclass
    AND a.attnotnull = true
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF notnull_cols IS NULL THEN
    notnull_cols := ARRAY[]::text[];
  END IF;

  -- Get columns from first row
  SELECT array_agg(key) INTO cols FROM jsonb_object_keys(data_json->0) AS key;

  -- If seed data does not include all PK columns, we cannot safely do ON CONFLICT(pk).
  IF array_length(pk_cols, 1) > 0 THEN
    FOREACH pk_col IN ARRAY pk_cols
    LOOP
      IF NOT (pk_col = ANY(cols)) THEN
        has_all_pk_cols := false;
      END IF;
    END LOOP;
  ELSE
    has_all_pk_cols := false;
  END IF;

  -- Natural keys for idempotent imports where seed rows intentionally omit id.
  IF '$TABLE' = 'subscriptionPlans' THEN
    natural_key_cols := ARRAY['tier'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'elearningSubscriptionPlans' THEN
    natural_key_cols := ARRAY['planType', 'interval', 'currency', 'name'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'businessPackages' THEN
    natural_key_cols := ARRAY['tier'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'businessPackagePrices' THEN
    natural_key_cols := ARRAY['packageId', 'currency'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'gammaImageStyles' THEN
    natural_key_cols := ARRAY['styleKey'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'gammaThemes' THEN
    natural_key_cols := ARRAY['id'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'supportedLanguages' THEN
    natural_key_cols := ARRAY['code'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'systemSettings' THEN
    natural_key_cols := ARRAY['settingKey'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'creditPurchasePackages' THEN
    natural_key_cols := ARRAY['name', 'currency'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'quizCreditPricing' THEN
    natural_key_cols := ARRAY['organizationId', 'questionTier'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'platformCostCategoryTypes' THEN
    natural_key_cols := ARRAY['name'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'platformCostCategories' THEN
    natural_key_cols := ARRAY['name', 'type'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'currencyConversionRates' THEN
    natural_key_cols := ARRAY['baseCurrency', 'targetCurrency', 'source'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'universalStatUnits' THEN
    natural_key_cols := ARRAY['unitName'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'challengeTemplates' THEN
    natural_key_cols := ARRAY['type', 'requirement', 'targetValue'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'achievementCatalog' THEN
    natural_key_cols := ARRAY['requirement'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'platformPricing' THEN
    natural_key_cols := ARRAY['currency'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'platformPaymentSettings' THEN
    natural_key_cols := ARRAY['yocoMode'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'lessonCreditPricingSettings' THEN
    natural_key_cols := ARRAY['minimumProfitPercentage', 'profitStepDecrease'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'seasonPassConfig' THEN
    natural_key_cols := ARRAY['scope', 'organizationId', 'seasonNumber'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'seasonPassTiers' THEN
    natural_key_cols := ARRAY['seasonPassConfigId', 'tier'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'cardCollections' THEN
    natural_key_cols := ARRAY['id'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'collectionStatTypes' THEN
    natural_key_cols := ARRAY['id'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'cardStats' THEN
    natural_key_cols := ARRAY['id'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'adminChallengeConfig' THEN
    natural_key_cols := ARRAY['id'];
    has_natural_keys := true;
  ELSIF '$TABLE' = 'gamificationEconomyRules' THEN
    natural_key_cols := ARRAY['id'];
    has_natural_keys := true;
  END IF;

  IF has_natural_keys THEN
    FOREACH natural_col IN ARRAY natural_key_cols
    LOOP
      IF NOT (natural_col = ANY(cols)) THEN
        natural_keys_in_seed := false;
      END IF;
    END LOOP;
  END IF;

  FOR row_data IN SELECT jsonb_array_elements(data_json)
  LOOP
    -- Preserve runtime-managed integration configuration/secrets.
    -- These keys are maintained in-app and must never be overwritten by packaged seed data during updates.
    IF '$TABLE' = 'systemSettings'
      AND COALESCE(row_data->>'settingKey', '') LIKE 'INTEGRATION_%'
    THEN
      CONTINUE;
    END IF;

    values_clause := '';
    col_literals := ARRAY[]::text[];

    FOREACH col IN ARRAY cols
    LOOP
      -- Handle FK columns referencing users:
      --   NOT NULL columns -> replace with SuperAdmin ID
      --   Nullable columns -> set to NULL
      IF col = ANY(fk_user_cols) THEN
        IF col = ANY(notnull_cols) AND superadmin_id != '' THEN
          col_val := quote_literal(superadmin_id);
        ELSE
          col_val := 'NULL';
        END IF;
      -- Handle FK columns referencing organizations/organizationUnits -> always NULL
      ELSIF col = ANY(fk_org_cols) THEN
        col_val := 'NULL';
      ELSIF (row_data->>col) IS NULL THEN
        col_val := 'NULL';
      ELSIF jsonb_typeof(row_data->col) IN ('object', 'array') THEN
        col_val := quote_literal(row_data->col::text) || '::jsonb';
      ELSE
        col_val := quote_literal(row_data->>col);
      END IF;

      col_literals := array_append(col_literals, col_val);
      IF values_clause != '' THEN
        values_clause := values_clause || ', ';
      END IF;
      values_clause := values_clause || col_val;

    END LOOP;

    -- Build column list
    col_list := (SELECT string_agg(quote_ident(c), ', ') FROM unnest(cols) AS c);

    IF has_natural_keys AND natural_keys_in_seed THEN
      natural_match_clause := '';
      FOREACH natural_col IN ARRAY natural_key_cols
      LOOP
        natural_idx := array_position(cols, natural_col);
        IF natural_idx IS NULL THEN
          CONTINUE;
        END IF;
        natural_literal := col_literals[natural_idx];
        IF natural_match_clause != '' THEN
          natural_match_clause := natural_match_clause || ' AND ';
        END IF;
        natural_match_clause := natural_match_clause || format('%I IS NOT DISTINCT FROM %s', natural_col, natural_literal);
      END LOOP;

      upsert_sql := format(
        'INSERT INTO %I (%s) SELECT %s WHERE NOT EXISTS (SELECT 1 FROM %I WHERE %s)',
        '$TABLE',
        col_list,
        values_clause,
        '$TABLE',
        natural_match_clause
      );
    ELSIF has_all_pk_cols THEN
      -- Build conflict clause from actual PK columns
      conflict_clause := (SELECT string_agg(quote_ident(c), ', ') FROM unnest(pk_cols) AS c);

      upsert_sql := format(
        'INSERT INTO %I (%s) VALUES (%s) ON CONFLICT (%s) DO NOTHING',
        '$TABLE',
        col_list,
        values_clause,
        conflict_clause
      );
    ELSE
      -- No PK or no update columns — just INSERT, ignore conflicts
      upsert_sql := format(
        'INSERT INTO %I (%s) VALUES (%s) ON CONFLICT DO NOTHING',
        '$TABLE',
        col_list,
        values_clause
      );
    END IF;

    EXECUTE upsert_sql;
  END LOOP;

  RAISE NOTICE 'Imported % rows into $TABLE', jsonb_array_length(data_json);
END
\$\$;
EOSQL

  IMPORTED=$((IMPORTED + 1))
done

echo ""
echo "🧹 Deduplicating LPC tier/subscription seed tables..."
DEDUPE_LOG="$(mktemp /tmp/lpp-seed-dedupe-XXXXXX.log)"
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$DEDUPE_LOG" 2>&1 <<'EOSQL_DEDUPE'; then
DO $$
DECLARE
  t text;
  fk_rec RECORD;
BEGIN
  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY tier ORDER BY ctid) AS keep_id
      FROM "businessPackages"
    ),
    dupes AS (
      SELECT ctid, id, keep_id FROM ranked WHERE rn > 1
    )
    UPDATE "businessPackagePrices" bpp
    SET "packageId" = d.keep_id
    FROM dupes d
    WHERE bpp."packageId" = d.id
      AND d.id IS DISTINCT FROM d.keep_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY tier ORDER BY ctid) AS keep_id
      FROM "businessPackages"
    ),
    dupes AS (
      SELECT ctid, id, keep_id FROM ranked WHERE rn > 1
    )
    UPDATE "organizationPackageAssignments" opa
    SET "packageId" = d.keep_id
    FROM dupes d
    WHERE opa."packageId" = d.id
      AND d.id IS DISTINCT FROM d.keep_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY tier ORDER BY ctid) AS keep_id
      FROM "businessPackages"
    ),
    dupes AS (
      SELECT ctid, id, keep_id FROM ranked WHERE rn > 1
    )
    UPDATE "organizationPackageAssignments" opa
    SET "scheduledPackageId" = d.keep_id
    FROM dupes d
    WHERE opa."scheduledPackageId" = d.id
      AND d.id IS DISTINCT FROM d.keep_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY tier ORDER BY ctid) AS keep_id
      FROM "businessPackages"
    ),
    dupes AS (
      SELECT ctid, id, keep_id FROM ranked WHERE rn > 1
    )
    UPDATE "packageRecommendationDismissals" prd
    SET "recommendedPackageId" = d.keep_id
    FROM dupes d
    WHERE prd."recommendedPackageId" = d.id
      AND d.id IS DISTINCT FROM d.keep_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY tier ORDER BY ctid) AS keep_id
      FROM "businessPackages"
    ),
    dupes AS (
      SELECT ctid, id, keep_id FROM ranked WHERE rn > 1
    )
    UPDATE "packageChangeEvents" pce
    SET "packageId" = d.keep_id
    FROM dupes d
    WHERE pce."packageId" = d.id
      AND d.id IS DISTINCT FROM d.keep_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn
      FROM "businessPackages"
    ),
    dupes AS (
      SELECT ctid FROM ranked WHERE rn > 1
    )
    DELETE FROM "businessPackages" bp
    USING dupes d
    WHERE bp.ctid = d.ctid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        "packageId",
        currency,
        ROW_NUMBER() OVER (PARTITION BY "packageId", currency ORDER BY ctid) AS rn
      FROM "businessPackagePrices"
    )
    DELETE FROM "businessPackagePrices" bpp
    USING ranked r
    WHERE bpp.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        "planType",
        "interval",
        currency,
        name,
        ROW_NUMBER() OVER (
          PARTITION BY "planType", "interval", currency, name
          ORDER BY ctid
        ) AS rn,
        FIRST_VALUE(id) OVER (
          PARTITION BY "planType", "interval", currency, name
          ORDER BY ctid
        ) AS keep_id
      FROM "elearningSubscriptionPlans"
    ),
    dupes AS (
      SELECT ctid, id, keep_id FROM ranked WHERE rn > 1
    )
    UPDATE subscriptions s
    SET "planId" = d.keep_id
    FROM dupes d
    WHERE s."planId" = d.id
      AND d.id IS DISTINCT FROM d.keep_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        "planType",
        "interval",
        currency,
        name,
        ROW_NUMBER() OVER (
          PARTITION BY "planType", "interval", currency, name
          ORDER BY ctid
        ) AS rn
      FROM "elearningSubscriptionPlans"
    ),
    dupes AS (
      SELECT ctid FROM ranked WHERE rn > 1
    )
    DELETE FROM "elearningSubscriptionPlans" esp
    USING dupes d
    WHERE esp.ctid = d.ctid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        tier,
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY ctid) AS rn
      FROM "subscriptionPlans"
    )
    DELETE FROM "subscriptionPlans" sp
    USING ranked r
    WHERE sp.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        "styleKey",
        ROW_NUMBER() OVER (PARTITION BY "styleKey" ORDER BY ctid) AS rn
      FROM "gammaImageStyles"
    )
    DELETE FROM "gammaImageStyles" gis
    USING ranked r
    WHERE gis.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        id,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY ctid) AS rn
      FROM "gammaThemes"
    )
    DELETE FROM "gammaThemes" gt
    USING ranked r
    WHERE gt.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- Generic dedupe by id for seed tables that should have one row per id.
  BEGIN
    FOR t IN SELECT unnest(ARRAY[
      'achievementCatalog',
      'adminChallengeConfig',
      'cardCollections',
      'cardStats',
      'challengeTemplates',
      'collectionStatTypes',
      'currencyConversionRates',
      'gamificationEconomyRules',
      'gammaImageStyles',
      'gammaThemes',
      'platformCostCategories',
      'platformCostCategoryTypes',
      'platformPaymentSettings',
      'platformPricing',
      'quizCreditPricing',
      'seasonPassConfig',
      'seasonPassTiers',
      'systemSettings',
      'universalStatUnits'
    ]) LOOP
      BEGIN
        EXECUTE format(
          'WITH ranked AS (
             SELECT ctid, id, ROW_NUMBER() OVER (PARTITION BY id ORDER BY ctid) AS rn
             FROM %I
             WHERE id IS NOT NULL
           )
           DELETE FROM %I d
           USING ranked r
           WHERE d.ctid = r.ctid
             AND r.rn > 1',
          t, t
        );
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        NULL;
      END;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- De-duplicate supported languages by code.
  BEGIN
    WITH ranked AS (
      SELECT ctid, code, ROW_NUMBER() OVER (PARTITION BY code ORDER BY ctid) AS rn
      FROM "supportedLanguages"
      WHERE code IS NOT NULL
    )
    DELETE FROM "supportedLanguages" sl
    USING ranked r
    WHERE sl.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- De-duplicate system settings by key.
  BEGIN
    WITH ranked AS (
      SELECT ctid, "settingKey", ROW_NUMBER() OVER (PARTITION BY "settingKey" ORDER BY ctid) AS rn
      FROM "systemSettings"
      WHERE "settingKey" IS NOT NULL
    )
    DELETE FROM "systemSettings" ss
    USING ranked r
    WHERE ss.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- De-duplicate credit packages by (name,currency) and remap FK refs to canonical id.
  BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _tmp_credit_pkg_dupes (
      id text,
      keep_id text
    ) ON COMMIT DROP;
    TRUNCATE _tmp_credit_pkg_dupes;

    INSERT INTO _tmp_credit_pkg_dupes (id, keep_id)
    SELECT id, keep_id
    FROM (
      SELECT
        id,
        FIRST_VALUE(id) OVER (PARTITION BY name, currency ORDER BY ctid) AS keep_id,
        ROW_NUMBER() OVER (PARTITION BY name, currency ORDER BY ctid) AS rn
      FROM "creditPurchasePackages"
      WHERE name IS NOT NULL
    ) d
    WHERE rn > 1
      AND id IS DISTINCT FROM keep_id;

    FOR fk_rec IN
      SELECT
        quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS fq_table,
        quote_ident(a.attname) AS fk_col
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN unnest(con.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
      WHERE con.contype = 'f'
        AND con.confrelid = '"creditPurchasePackages"'::regclass
    LOOP
      EXECUTE format(
        'UPDATE %s x
         SET %s = d.keep_id
         FROM _tmp_credit_pkg_dupes d
         WHERE x.%s = d.id
           AND d.id IS DISTINCT FROM d.keep_id',
        fk_rec.fq_table,
        fk_rec.fk_col,
        fk_rec.fk_col
      );
    END LOOP;

    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (PARTITION BY name, currency ORDER BY ctid) AS rn
      FROM "creditPurchasePackages"
      WHERE name IS NOT NULL
    )
    DELETE FROM "creditPurchasePackages" cpp
    USING ranked r
    WHERE cpp.ctid = r.ctid
      AND r.rn > 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;
END
$$;
EOSQL_DEDUPE
  echo "   ✅ LPC tier/subscription dedupe complete"
else
  echo "  ⚠️  LPC dedupe step skipped (see $DEDUPE_LOG)"
  tail -n 20 "$DEDUPE_LOG" | sed 's/^/     /'
fi

echo ""
echo "🌍 Ensuring required supported languages..."
LANGUAGE_LOG="$(mktemp /tmp/lpp-supported-languages-XXXXXX.log)"
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$LANGUAGE_LOG" 2>&1 <<'EOSQL_LANGUAGES'; then
DO $$
BEGIN
  WITH ranked AS (
    SELECT ctid, code, ROW_NUMBER() OVER (PARTITION BY code ORDER BY ctid) AS rn
    FROM "supportedLanguages"
    WHERE code IS NOT NULL
  )
  DELETE FROM "supportedLanguages" sl
  USING ranked r
  WHERE sl.ctid = r.ctid
    AND r.rn > 1;

  ALTER TABLE ONLY "supportedLanguages"
    ADD CONSTRAINT "supportedLanguages_pkey" PRIMARY KEY (code);
EXCEPTION
  WHEN duplicate_object OR invalid_table_definition THEN
    NULL;
END
$$;

INSERT INTO "supportedLanguages" (code, name, "nativeName", region, "isActive", "sortOrder", "createdAt")
VALUES
  ('en', 'English', 'English', 'Global', true, 0, NOW()),
  ('af', 'Afrikaans', 'Afrikaans', 'Africa', true, 1, NOW()),
  ('zu', 'isiZulu', 'isiZulu', 'Africa', true, 2, NOW()),
  ('xh', 'isiXhosa', 'isiXhosa', 'Africa', true, 3, NOW()),
  ('sw', 'Kiswahili', 'Kiswahili', 'Africa', true, 4, NOW()),
  ('ar', 'Arabic', 'Arabic', 'Middle East', true, 5, NOW()),
  ('fr', 'French', 'Francais', 'Europe', true, 6, NOW()),
  ('de', 'German', 'Deutsch', 'Europe', true, 7, NOW()),
  ('es', 'Spanish', 'Espanol', 'Europe', true, 8, NOW()),
  ('it', 'Italian', 'Italiano', 'Europe', true, 9, NOW()),
  ('pt', 'Portuguese', 'Portugues', 'Europe', true, 10, NOW()),
  ('nl', 'Dutch', 'Nederlands', 'Europe', true, 11, NOW()),
  ('pl', 'Polish', 'Polski', 'Europe', true, 12, NOW()),
  ('ro', 'Romanian', 'Romana', 'Europe', true, 13, NOW()),
  ('el', 'Greek', 'Greek', 'Europe', true, 14, NOW()),
  ('cs', 'Czech', 'Cestina', 'Europe', true, 15, NOW()),
  ('hu', 'Hungarian', 'Magyar', 'Europe', true, 16, NOW()),
  ('sv', 'Swedish', 'Svenska', 'Europe', true, 17, NOW()),
  ('da', 'Danish', 'Dansk', 'Europe', true, 18, NOW()),
  ('fi', 'Finnish', 'Suomi', 'Europe', true, 19, NOW()),
  ('sk', 'Slovak', 'Slovencina', 'Europe', true, 20, NOW()),
  ('bg', 'Bulgarian', 'Bulgarian', 'Europe', true, 21, NOW()),
  ('hr', 'Croatian', 'Hrvatski', 'Europe', true, 22, NOW()),
  ('lt', 'Lithuanian', 'Lietuviu', 'Europe', true, 23, NOW()),
  ('sl', 'Slovenian', 'Slovenscina', 'Europe', true, 24, NOW()),
  ('lv', 'Latvian', 'Latviesu', 'Europe', true, 25, NOW()),
  ('et', 'Estonian', 'Eesti', 'Europe', true, 26, NOW()),
  ('ga', 'Irish', 'Gaeilge', 'Europe', true, 27, NOW()),
  ('mt', 'Maltese', 'Malti', 'Europe', true, 28, NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    "nativeName" = EXCLUDED."nativeName",
    region = EXCLUDED.region,
    "isActive" = true,
    "sortOrder" = EXCLUDED."sortOrder";
EOSQL_LANGUAGES
  echo "   ✅ Supported languages are ready"
else
  echo "  ⚠️  Supported language required-data step failed (see $LANGUAGE_LOG)"
  tail -n 20 "$LANGUAGE_LOG" | sed 's/^/     /'
  exit 1
fi

echo ""
echo "🔄 Resetting sequences..."
SEQ_RESET_LOG="$(mktemp /tmp/lpp-seq-reset-XXXXXX.log)"
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$SEQ_RESET_LOG" 2>&1 <<'EOSQL'; then
DO $$
DECLARE
  seq_record RECORD;
BEGIN
  FOR seq_record IN
    SELECT
      s.oid AS seq_oid,
      s.relname AS seq_name,
      t.relname AS table_name,
      a.attname AS column_name
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid
    JOIN pg_class t ON d.refobjid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S'
  LOOP
    EXECUTE format(
      'SELECT setval(%s::regclass, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
      seq_record.seq_oid,
      seq_record.column_name,
      seq_record.table_name
    );
  END LOOP;
END
$$;
EOSQL
  echo "   ✅ Sequence reset completed"
else
  echo "  ⚠️  Sequence reset skipped (see $SEQ_RESET_LOG)"
  tail -n 20 "$SEQ_RESET_LOG" | sed 's/^/     /'
fi

# ============================================
# Copy bundled image assets to upload directory
# ============================================
ASSETS_DIR="$DATA_DIR/assets"
UPLOAD_DIR="${UPLOAD_DIR:-}"
if [ -z "$UPLOAD_DIR" ] && [ -f "$APP_DIR/.env" ]; then
  UPLOAD_DIR=$(grep -E '^UPLOAD_DIR=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)
fi
UPLOAD_DIR="${UPLOAD_DIR:-$APP_DIR/uploads}"

if [ -d "$ASSETS_DIR" ] && [ "$(ls -A "$ASSETS_DIR" 2>/dev/null)" ]; then
  echo ""
  echo "📷 Copying bundled image assets..."

  find "$ASSETS_DIR" -type f | while read -r asset_file; do
    rel_path="${asset_file#$ASSETS_DIR/}"
    dest="$UPLOAD_DIR/public/$rel_path"
    mkdir -p "$(dirname "$dest")"
    cp "$asset_file" "$dest"
  done

  if [ "$EUID" -eq 0 ] 2>/dev/null; then
    chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR/public/" 2>/dev/null || true
  fi

  echo "   ✅ Image assets copied to $UPLOAD_DIR/public/"
else
  echo "   ℹ️  No extra bundled image assets in $ASSETS_DIR"
  echo "   ℹ️  Runtime assets should already exist under $UPLOAD_DIR/public from installer package"
fi

# ============================================
# Hydrate DB seed rows with local asset URLs
# ============================================
echo ""
echo "🧩 Hydrating Gamma seed rows with local asset URLs..."

# Ensure image-style thumbnail URLs point at local seeded files.
if [ -d "$UPLOAD_DIR/public/gamma/image-styles" ]; then
  while IFS= read -r style_file; do
    [ -f "$style_file" ] || continue
    base_name="$(basename "$style_file")"
    style_key="${base_name%.*}"
    public_url="/api/public-objects/gamma/image-styles/${base_name}"
    safe_key="${style_key//\'/\'\'}"
    safe_url="${public_url//\'/\'\'}"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<EOSQL_STYLE >/dev/null 2>&1 || true
UPDATE "gammaImageStyles"
SET "thumbnailUrl" = COALESCE(NULLIF("thumbnailUrl", ''), '${safe_url}'),
    "updatedAt" = NOW()
WHERE "styleKey" = '${safe_key}';
EOSQL_STYLE
  done < <(find "$UPLOAD_DIR/public/gamma/image-styles" -maxdepth 1 -type f \( -name "*.jpeg" -o -name "*.jpg" -o -name "*.png" -o -name "*.webp" \) 2>/dev/null)
fi

# Ensure Gamma themes table has rows and thumbnail URLs that match local seeded files.
if [ -d "$UPLOAD_DIR/public/gamma/themes" ]; then
  while IFS= read -r theme_dir; do
    [ -d "$theme_dir" ] || continue
    theme_id="$(basename "$theme_dir")"
    latest_file="$(find "$theme_dir" -maxdepth 1 -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.webp" -o -name "*.gif" \) -printf "%T@ %f\n" 2>/dev/null | sort -nr | head -1 | awk '{print $2}')"
    [ -n "$latest_file" ] || continue
    human_name="$(echo "$theme_id" | tr -- '-_' ' ' | sed -E 's/(^| )([a-z])/\1\U\2/g')"
    public_url="/api/public-objects/gamma/themes/${theme_id}/${latest_file}"
    safe_id="${theme_id//\'/\'\'}"
    safe_name="${human_name//\'/\'\'}"
    safe_url="${public_url//\'/\'\'}"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<EOSQL_THEME >/dev/null 2>&1 || true
INSERT INTO "gammaThemes" (id, name, "thumbnailUrl", categories, "isActive", "lastSyncedAt", "createdAt", "updatedAt")
VALUES ('${safe_id}', '${safe_name}', '${safe_url}', '[]'::jsonb, true, NOW(), NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET "thumbnailUrl" = COALESCE(NULLIF("gammaThemes"."thumbnailUrl", ''), EXCLUDED."thumbnailUrl"),
    "isActive" = true,
    "updatedAt" = NOW();
EOSQL_THEME
  done < <(find "$UPLOAD_DIR/public/gamma/themes" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
fi

echo "   ✅ Gamma seed hydration complete"

echo ""
echo "🧱 Ensuring required organization defaults..."
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'EOSQL_ORG_DEFAULTS' >/dev/null 2>&1; then
DO $$
DECLARE
  org_record RECORD;
  v_general_unit_id TEXT;
  v_general_subunit_id TEXT;
  v_general_team_id TEXT;
  v_next_unit_order INT;
  v_next_subunit_order INT;
  v_next_team_order INT;
  v_base_code TEXT;
  v_unit_code TEXT;
  v_subunit_code TEXT;
  v_team_code TEXT;
BEGIN
  FOR org_record IN
    SELECT id, "inviteCode"
    FROM organizations
  LOOP
    v_base_code := COALESCE(
      NULLIF(regexp_replace(COALESCE(org_record."inviteCode", ''), '[^A-Za-z0-9_]', '', 'g'), ''),
      upper(substr(replace(org_record.id, '-', ''), 1, 8))
    );

    -- Level 1: General department/unit
    SELECT id INTO v_general_unit_id
    FROM "organizationUnits"
    WHERE "organizationId" = org_record.id
      AND lower(name) = 'general'
    ORDER BY "displayOrder" ASC
    LIMIT 1;

    IF v_general_unit_id IS NULL THEN
      v_next_unit_order := COALESCE((
        SELECT MAX("displayOrder") + 1
        FROM "organizationUnits"
        WHERE "organizationId" = org_record.id
      ), 1);

      v_unit_code := left(v_base_code || '_GEN', 50);
      IF EXISTS (SELECT 1 FROM "organizationUnits" WHERE "joinCode" = v_unit_code) THEN
        v_unit_code := left(v_base_code || '_' || left(replace(org_record.id, '-', ''), 8) || '_GEN', 50);
      END IF;

      INSERT INTO "organizationUnits" (id, "organizationId", name, "displayOrder", "joinCode", "isActive", "isShowcaseDepartment", "createdAt")
      VALUES (gen_random_uuid()::text, org_record.id, 'General', v_next_unit_order, v_unit_code, true, false, NOW())
      RETURNING id INTO v_general_unit_id;
    ELSE
      UPDATE "organizationUnits"
      SET "isActive" = true
      WHERE id = v_general_unit_id
        AND COALESCE("isActive", false) = false;
    END IF;

    -- Level 2: General sub-unit
    SELECT id INTO v_general_subunit_id
    FROM "organizationSubUnits"
    WHERE "unitId" = v_general_unit_id
      AND lower(name) = 'general'
    ORDER BY "displayOrder" ASC
    LIMIT 1;

    IF v_general_subunit_id IS NULL THEN
      v_next_subunit_order := COALESCE((
        SELECT MAX("displayOrder") + 1
        FROM "organizationSubUnits"
        WHERE "unitId" = v_general_unit_id
      ), 1);

      v_subunit_code := left(v_base_code || '_GEN_GEN', 50);
      IF EXISTS (SELECT 1 FROM "organizationSubUnits" WHERE "joinCode" = v_subunit_code) THEN
        v_subunit_code := left(v_base_code || '_' || left(replace(org_record.id, '-', ''), 8) || '_GEN_GEN', 50);
      END IF;

      INSERT INTO "organizationSubUnits" (id, "unitId", name, "displayOrder", "joinCode", "isActive", "createdAt")
      VALUES (gen_random_uuid()::text, v_general_unit_id, 'General', v_next_subunit_order, v_subunit_code, true, NOW())
      RETURNING id INTO v_general_subunit_id;
    ELSE
      UPDATE "organizationSubUnits"
      SET "isActive" = true
      WHERE id = v_general_subunit_id
        AND COALESCE("isActive", false) = false;
    END IF;

    -- Level 3: All Learners team (fallback to existing General team if present)
    SELECT id INTO v_general_team_id
    FROM "organizationTeams"
    WHERE "subUnitId" = v_general_subunit_id
      AND lower(name) IN ('all learners', 'general')
    ORDER BY CASE WHEN lower(name) = 'all learners' THEN 0 ELSE 1 END, "displayOrder" ASC
    LIMIT 1;

    IF v_general_team_id IS NULL THEN
      v_next_team_order := COALESCE((
        SELECT MAX("displayOrder") + 1
        FROM "organizationTeams"
        WHERE "subUnitId" = v_general_subunit_id
      ), 1);

      v_team_code := left(v_base_code || '_GEN_ALL', 50);
      IF EXISTS (SELECT 1 FROM "organizationTeams" WHERE "joinCode" = v_team_code) THEN
        v_team_code := left(v_base_code || '_' || left(replace(org_record.id, '-', ''), 8) || '_GEN_ALL', 50);
      END IF;

      INSERT INTO "organizationTeams" (id, "subUnitId", name, "displayOrder", "joinCode", "isActive", "createdAt")
      VALUES (gen_random_uuid()::text, v_general_subunit_id, 'All Learners', v_next_team_order, v_team_code, true, NOW());
    ELSE
      UPDATE "organizationTeams"
      SET "isActive" = true
      WHERE id = v_general_team_id
        AND COALESCE("isActive", false) = false;
    END IF;
  END LOOP;
END
$$;
EOSQL_ORG_DEFAULTS
  ORG_COUNT="$(psql "$DATABASE_URL" -t -A -c 'SELECT COUNT(*) FROM organizations;' 2>/dev/null || echo 0)"
  MISSING_GENERAL_COUNT="$(psql "$DATABASE_URL" -t -A -c 'SELECT COUNT(*) FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM "organizationUnits" u WHERE u."organizationId" = o.id AND lower(u.name) = '\''general'\'');' 2>/dev/null || echo 0)"
  echo "   ✅ Organization defaults synchronized (orgs=${ORG_COUNT:-0}, missing-general=${MISSING_GENERAL_COUNT:-0})"
else
  echo "   ❌ Failed to synchronize organization defaults"
  exit 1
fi

echo ""
echo "✅ Platform data import complete!"
echo "   Imported: $IMPORTED tables"
echo "   Failed: $FAILED tables"
echo "   Info: $SKIPPED tables have no seed data (normal for fresh install)"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "❌ Import completed with failures ($FAILED table(s))."
  exit 1
fi
