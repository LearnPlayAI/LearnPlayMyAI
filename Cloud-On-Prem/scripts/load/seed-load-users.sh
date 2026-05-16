#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/load/seed-load-users.sh --variant <cloud|onprem> [--count 2600] [--password 'LearnPlay!234']

Notes:
  - DEV runtimes only. Reads DATABASE_URL from /opt/learnplay/<variant>/.env
  - Creates/updates deterministic users for load tests.
  - Exports credential CSV to tests/load/data/users-<variant>.csv
EOF
}

VARIANT=""
COUNT="2600"
PASSWORD="LearnPlay!234"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --variant) VARIANT="${2:-}"; shift 2 ;;
    --count) COUNT="${2:-}"; shift 2 ;;
    --password) PASSWORD="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$VARIANT" ] || { [ "$VARIANT" != "cloud" ] && [ "$VARIANT" != "onprem" ]; }; then
  echo "ERROR: --variant cloud|onprem is required" >&2
  exit 1
fi

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --count must be numeric" >&2
  exit 1
fi

ENV_FILE="/opt/learnplay/${VARIANT}/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Missing env file: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL missing in $ENV_FILE" >&2
  exit 1
fi

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$APP_ROOT/tests/load/data"
OUT_CSV="$APP_ROOT/tests/load/data/users-${VARIANT}.csv"

HASH="$(cd "$APP_ROOT" && node -e "const b=require('bcrypt'); process.stdout.write(b.hashSync(process.argv[1],10));" "$PASSWORD")"
HASH_ESCAPED="$(printf "%s" "$HASH" | sed "s/'/''/g")"

echo "Seeding ${COUNT} load users for ${VARIANT}..."

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  target_org_id text;
BEGIN
  SELECT id INTO target_org_id
  FROM organizations
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization exists in % runtime; create one before seeding load users.', '${VARIANT}';
  END IF;

  CREATE TEMP TABLE tmp_load_users AS
  SELECT
    gs AS seq,
    format('${VARIANT}.load.user%04s@test.com', gs)::text AS email,
    format('${VARIANT}_load_user_%04s', gs)::text AS gamer_name,
    CASE
      WHEN gs <= ((${COUNT}) * 0.1)::int THEN 'org_admin'
      WHEN gs <= ((${COUNT}) * 0.3)::int THEN 'teacher'
      ELSE 'student'
    END::text AS role
  FROM generate_series(1, ${COUNT}) gs;

  INSERT INTO users (
    id, "gamerName", email, password, "firstName", "lastName",
    "emailVerified", "isSuperAdmin", "isCustSuper", "isAdmin",
    "lpCreditBalance", "isLocked", "isDisabled", "failedLoginAttempts", "lockedUntil",
    "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    t.gamer_name,
    t.email,
    '${HASH_ESCAPED}',
    'Load',
    'User',
    true,
    false,
    false,
    false,
    5000,
    false,
    false,
    0,
    NULL,
    now(),
    now()
  FROM tmp_load_users t
  ON CONFLICT (email) DO UPDATE
  SET
    password = EXCLUDED.password,
    "emailVerified" = true,
    "isLocked" = false,
    "isDisabled" = false,
    "failedLoginAttempts" = 0,
    "lockedUntil" = NULL,
    "updatedAt" = now();

  INSERT INTO "userOrganizationRoles" (id, "userId", "organizationId", role, "createdAt")
  SELECT
    gen_random_uuid()::text,
    u.id,
    target_org_id,
    t.role,
    now()
  FROM tmp_load_users t
  JOIN users u ON lower(u.email) = lower(t.email)
  WHERE NOT EXISTS (
    SELECT 1
    FROM "userOrganizationRoles" uor
    WHERE uor."userId" = u.id
      AND uor."organizationId" = target_org_id
      AND uor.role = t.role
  );
END
\$\$;
SQL

psql "$DATABASE_URL" -Atc "
COPY (
  SELECT
    u.email,
    '${PASSWORD}'::text AS password,
    uor.role,
    '${VARIANT}'::text AS variant
  FROM users u
  JOIN \"userOrganizationRoles\" uor ON u.id = uor.\"userId\"
  WHERE u.email LIKE '${VARIANT}.load.user%@test.com'
  ORDER BY u.email
) TO STDOUT WITH CSV HEADER
" > "$OUT_CSV"

echo "Done: $OUT_CSV"
