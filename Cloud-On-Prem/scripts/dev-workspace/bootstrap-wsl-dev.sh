#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

DB_USER="${LEARNPLAY_DEV_DB_USER:-learnplay}"
DB_PASS="${LEARNPLAY_DEV_DB_PASS:-learnplay_dev_password}"
CLOUD_DB="${LEARNPLAY_CLOUD_DB:-learnplay_cloud_dev}"
ONPREM_DB="${LEARNPLAY_ONPREM_DB:-learnplay_onprem_dev}"
DB_HOST="${LEARNPLAY_DEV_DB_HOST:-localhost}"
DB_PORT="${LEARNPLAY_DEV_DB_PORT:-}"
FALLBACK_DB_PORT="${LEARNPLAY_DEV_DB_FALLBACK_PORT:-55432}"
USER_PGDATA="${LEARNPLAY_DEV_PGDATA:-$HOME/.local/share/learnplay/postgres-16}"
USER_PGBIN="${LEARNPLAY_DEV_PGBIN:-/usr/lib/postgresql/16/bin}"
CLOUD_PORT="${LEARNPLAY_CLOUD_PORT:-8010}"
ONPREM_PORT="${LEARNPLAY_ONPREM_PORT:-8020}"
NVM_VERSION="${NVM_VERSION:-v0.40.1}"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh <command>

Commands:
  bootstrap           Install WSL packages, Node 20, npm deps, PostgreSQL DBs, env files, seed data.
  apt                 Install Ubuntu/WSL OS packages only.
  node                Install/use Node.js 20 via nvm only.
  npm                 Run npm install in Cloud-On-Prem only.
  db                  Start PostgreSQL and create local cloud/onprem databases only.
  env                 Create .env.cloud.local and .env.onprem.local only.
  init-db cloud       Apply migrations and seed the cloud local database.
  init-db onprem      Apply migrations and seed the onprem local database.
  use cloud           Copy .env.cloud.local to .env.
  use onprem          Copy .env.onprem.local to .env.
  start cloud         Start the cloud local dev server.
  start onprem        Start the onprem local dev server.
  check               Run the standard static quality gate.
  test-critical       Run the critical test suite.
  build cloud         Build the cloud Linux package from this WSL workspace.
  build onprem        Build the onprem Linux package from this WSL workspace.
  doctor              Print tool and path readiness.

Environment overrides:
  LEARNPLAY_DEV_DB_USER, LEARNPLAY_DEV_DB_PASS
  LEARNPLAY_DEV_DB_HOST, LEARNPLAY_DEV_DB_PORT, LEARNPLAY_DEV_DB_FALLBACK_PORT
  LEARNPLAY_CLOUD_DB, LEARNPLAY_ONPREM_DB
  LEARNPLAY_CLOUD_PORT, LEARNPLAY_ONPREM_PORT
EOF
}

ensure_wsl_path() {
  case "$APP_DIR" in
    /antigravity/Cloud-On-Prem) ;;
    *)
      warn "App path is $APP_DIR, not /antigravity/Cloud-On-Prem."
      warn "Most dev commands will still work, but existing package scripts are happiest at /antigravity/Cloud-On-Prem."
      ;;
  esac
}

install_apt() {
  log "Installing Ubuntu packages"
  sudo apt update
  sudo apt install -y \
    curl git unzip rsync ca-certificates gnupg lsb-release \
    build-essential python3 python3-dev pkg-config \
    openssl jq nano vim \
    postgresql postgresql-contrib postgresql-client \
    libreoffice-impress poppler-utils ffmpeg \
    gh
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
}

use_wsl_node_runtime() {
  case "${TMPDIR:-}" in
    /mnt/*) export TMPDIR=/tmp ;;
  esac
  export TSX_DISABLE_IPC=1
}

install_node() {
  log "Installing/activating Node.js 20 via nvm"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
  fi
  load_nvm
  use_wsl_node_runtime
  nvm install 20
  nvm use 20
  nvm alias default 20
  node --version
  npm --version
}

npm_install() {
  log "Installing npm dependencies"
  load_nvm || true
  use_wsl_node_runtime
  cd "$APP_DIR"
  npm install
}

db_port() {
  if [ -n "$DB_PORT" ]; then
    printf '%s' "$DB_PORT"
    return 0
  fi
  if PGPASSWORD="$DB_PASS" psql "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/postgres" -tAc "select 1" >/dev/null 2>&1; then
    printf '5432'
    return 0
  fi
  if pg_isready -h "$DB_HOST" -p 5432 >/dev/null 2>&1; then
    printf '%s' "$FALLBACK_DB_PORT"
    return 0
  fi
  printf '5432'
}

db_url() {
  local db_name="$1"
  printf 'postgresql://%s:%s@%s:%s/%s' "$DB_USER" "$DB_PASS" "$DB_HOST" "$(db_port)" "$db_name"
}

postgres_admin_url() {
  db_url postgres
}

direct_db_admin_available() {
  PGPASSWORD="$DB_PASS" psql "$(postgres_admin_url)" -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user" 2>/dev/null | grep -q t
}

start_user_postgres() {
  local port
  port="$(db_port)"
  local initdb_bin="$USER_PGBIN/initdb"
  local pg_ctl_bin="$USER_PGBIN/pg_ctl"
  [ -x "$initdb_bin" ] || die "Missing initdb at $initdb_bin"
  [ -x "$pg_ctl_bin" ] || die "Missing pg_ctl at $pg_ctl_bin"

  mkdir -p "$(dirname "$USER_PGDATA")"
  if [ ! -f "$USER_PGDATA/PG_VERSION" ]; then
    log "Initializing user-owned PostgreSQL cluster on port $port"
    local pwfile
    pwfile="$(mktemp)"
    chmod 0600 "$pwfile"
    printf '%s\n' "$DB_PASS" >"$pwfile"
    "$initdb_bin" -D "$USER_PGDATA" --username="$DB_USER" --pwfile="$pwfile" --auth-host=scram-sha-256 --auth-local=trust >/dev/null
    rm -f "$pwfile"
  fi

  if direct_db_admin_available; then
    return 0
  fi

  log "Starting user-owned PostgreSQL cluster on port $port"
  "$pg_ctl_bin" -D "$USER_PGDATA" -l "$USER_PGDATA/server.log" -o "-p $port -c listen_addresses='localhost'" start >/dev/null
}

start_postgres() {
  log "Starting PostgreSQL"
  if direct_db_admin_available; then
    return 0
  fi
  if ! sudo -n true >/dev/null 2>&1; then
    warn "sudo is not available without a password; using a user-owned PostgreSQL cluster."
    start_user_postgres
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
    sudo systemctl start postgresql || sudo service postgresql start
  else
    sudo service postgresql start
  fi
}

create_db() {
  local db_name="$1"
  if direct_db_admin_available; then
    PGPASSWORD="$DB_PASS" psql "$(postgres_admin_url)" -c "ALTER USER \"${DB_USER}\" CREATEDB;" >/dev/null
    PGPASSWORD="$DB_PASS" psql "$(postgres_admin_url)" -tAc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1 \
      || PGPASSWORD="$DB_PASS" createdb --host="$DB_HOST" --port="$(db_port)" --username="$DB_USER" --owner="$DB_USER" "$db_name"
    return 0
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER \"${DB_USER}\" WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1 \
    || sudo -u postgres createdb -O "$DB_USER" "$db_name"
  sudo -u postgres psql -c "ALTER USER \"${DB_USER}\" CREATEDB;" >/dev/null
}

setup_databases() {
  start_postgres
  log "Creating LearnPlay local databases"
  create_db "$CLOUD_DB"
  create_db "$ONPREM_DB"
  psql "$(db_url "$CLOUD_DB")" -c "select 1 as cloud_ready;"
  psql "$(db_url "$ONPREM_DB")" -c "select 1 as onprem_ready;"
}

random_hex() {
  openssl rand -hex 32
}

dev_transfer_private_key_path() {
  printf '%s/runtime-metadata/dev-course-transfer-private-key.pem' "$APP_DIR"
}

dev_transfer_public_key_path() {
  printf '%s/runtime-metadata/dev-course-transfer-public-key.pem' "$APP_DIR"
}

ensure_dev_course_transfer_keys() {
  local private_key public_key
  private_key="$(dev_transfer_private_key_path)"
  public_key="$(dev_transfer_public_key_path)"
  mkdir -p "$(dirname "$private_key")"

  if [ ! -f "$private_key" ] || [ ! -f "$public_key" ]; then
    log "Generating local DEV course transfer keypair"
    openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$private_key"
    openssl pkey -in "$private_key" -pubout -out "$public_key"
    chmod 0600 "$private_key"
    chmod 0644 "$public_key"
  fi
}

ensure_env_key_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$env_file"; then
    return 0
  fi
  printf '%s=%s\n' "$key" "$value" >> "$env_file"
}

ensure_dev_course_transfer_env() {
  local env_file="$1"
  ensure_dev_course_transfer_keys
  ensure_env_key_value "$env_file" COURSE_TRANSFER_PRIVATE_KEY_PATH "$(dev_transfer_private_key_path)"
  ensure_env_key_value "$env_file" COURSE_TRANSFER_PUBLIC_KEY_PATH "$(dev_transfer_public_key_path)"
}

write_env_file() {
  local variant="$1"
  local env_file="$2"
  local port="$3"
  local db_name="$4"
  local onprem_mode="$5"
  local cust_super="$6"
  local payment_enabled="$7"

  if [ -f "$env_file" ]; then
    warn "Keeping existing $env_file"
    ensure_dev_course_transfer_env "$env_file"
    return 0
  fi

  cat > "$env_file" <<EOF
NODE_ENV=development
PORT=${port}
PLATFORM_ENV=${variant}
DEPLOYMENT_MODE=${variant}
ONPREM_MODE=${onprem_mode}
ONPREM_OWN_API_KEYS=${onprem_mode}
ONPREM_LICENSE_ENFORCEMENT=false
BASE_URL=http://localhost:${port}
FRONTEND_URL=http://localhost:${port}
VITE_DOMAIN=http://localhost:${port}
PUBLIC_BASE_URL=http://localhost:${port}
DATABASE_URL=$(db_url "$db_name")
STORAGE_BACKEND=local
UPLOAD_DIR=./uploads/${variant}
SESSION_SECRET=$(random_hex)
COOKIE_SECURE=false
TRUST_PROXY=false
SESSION_AUTH_ENABLED=true
PAYMENT_GATEWAY_ENABLED=${payment_enabled}
EMAIL_FROM=contact@learnplay.local
INTEGRATION_EMAIL_ACTIVE_PROVIDER=smtp
SUPPORT_BOOTSTRAP_EMAIL=support@learnplay.co.za
SUPPORT_BOOTSTRAP_IS_CUST_SUPER=${cust_super}
LEARNPLAY_TIMEZONE=Africa/Johannesburg
EOF
  ensure_dev_course_transfer_env "$env_file"
  chmod 0600 "$env_file"
}

create_envs() {
  log "Creating local variant env files"
  mkdir -p "$APP_DIR/uploads/cloud/public" "$APP_DIR/uploads/cloud/private"
  mkdir -p "$APP_DIR/uploads/onprem/public" "$APP_DIR/uploads/onprem/private"
  write_env_file cloud "$APP_DIR/.env.cloud.local" "$CLOUD_PORT" "$CLOUD_DB" false false true
  write_env_file onprem "$APP_DIR/.env.onprem.local" "$ONPREM_PORT" "$ONPREM_DB" true true false
}

use_env() {
  local variant="${1:-}"
  case "$variant" in
    cloud|onprem) ;;
    *) die "use requires cloud or onprem" ;;
  esac
  local source_file="$APP_DIR/.env.${variant}.local"
  [ -f "$source_file" ] || die "Missing $source_file. Run: $0 env"
  cp "$source_file" "$APP_DIR/.env"
  chmod 0600 "$APP_DIR/.env"
  log "Activated $variant env at $APP_DIR/.env"
}

with_env() {
  local variant="$1"
  shift
  local env_file="$APP_DIR/.env.${variant}.local"
  [ -f "$env_file" ] || die "Missing $env_file. Run: $0 env"
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  use_wsl_node_runtime
  "$@"
}

seed_bootstrap_users() {
  local variant="$1"
  local is_superadmin="$2"
  local is_custsuper="$3"
  local default_hash='$2b$10$p9i86UUxH83d6tuhn0BG3OHHUtVOj6IrfcwRMdbc1Sg.4Y42OHJ/W'
  log "Ensuring support bootstrap user for $variant"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO users (
  id, "gamerName", email, password, "firstName", "lastName",
  "isSuperAdmin", "isCustSuper", "emailVerified", "isLocked",
  "isDisabled", "failedLoginAttempts", "sessionVersion"
)
VALUES (
  gen_random_uuid()::text, 'support', 'support@learnplay.co.za', '${default_hash}',
  'LearnPlay', 'Support', ${is_superadmin}, ${is_custsuper}, true, false, false, 0, 1
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  "isSuperAdmin" = EXCLUDED."isSuperAdmin",
  "isCustSuper" = EXCLUDED."isCustSuper",
  "emailVerified" = true,
  "isLocked" = false,
  "isDisabled" = false,
  "failedLoginAttempts" = 0,
  "updatedAt" = now();
SQL
}

copy_export_assets() {
  local variant="$1"
  local upload_dir="$APP_DIR/uploads/${variant}"
  local export_bundle=""
  export_bundle="$(find "$APP_DIR" "$APP_DIR/cloud" -maxdepth 1 -type d -name 'learnplay-export-*' 2>/dev/null | sort | tail -1 || true)"
  mkdir -p "$upload_dir/public" "$upload_dir/private"
  if [ -n "$export_bundle" ] && [ -d "$export_bundle/files/public" ]; then
    cp -rn "$export_bundle/files/public/." "$upload_dir/public/" || true
  fi
}

init_db() {
  local variant="${1:-}"
  case "$variant" in
    cloud)
      use_env cloud
      with_env cloud bash -lc 'cd "$0" && npm run -s migration:validate && npx tsx server/migrate.ts' "$APP_DIR"
      with_env cloud seed_bootstrap_users cloud true false
      with_env cloud bash "$APP_DIR/cloud/import-platform-data.sh" "$APP_DIR/cloud/data" --allow-nonempty || warn "Seed import completed with warnings for cloud."
      copy_export_assets cloud
      ;;
    onprem)
      use_env onprem
      with_env onprem bash -lc 'cd "$0" && npm run -s migration:validate && npx tsx server/migrate-onprem.ts' "$APP_DIR"
      with_env onprem seed_bootstrap_users onprem false true
      with_env onprem bash "$APP_DIR/cloud/import-platform-data.sh" "$APP_DIR/cloud/data" --allow-nonempty || warn "Seed import completed with warnings for onprem."
      copy_export_assets onprem
      ;;
    *) die "init-db requires cloud or onprem" ;;
  esac
}

start_dev() {
  local variant="${1:-}"
  case "$variant" in
    cloud|onprem) ;;
    *) die "start requires cloud or onprem" ;;
  esac
  start_postgres
  use_env "$variant"
  cd "$APP_DIR"
  use_wsl_node_runtime
  log "Starting $variant dev server"
  npm run dev
}

run_check() {
  cd "$APP_DIR"
  use_wsl_node_runtime
  npm run check
}

run_test_critical() {
  cd "$APP_DIR"
  use_wsl_node_runtime
  set -a
  [ -f "$APP_DIR/.env" ] && . "$APP_DIR/.env"
  set +a
  NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:critical
}

build_package() {
  local variant="${1:-}"
  cd "$APP_DIR"
  use_wsl_node_runtime
  case "$variant" in
    cloud)
      use_env cloud
      set -a; . "$APP_DIR/.env.cloud.local"; set +a
      export LEARNPLAY_BUILD_INVOKER_TOOL=devadmin
      export LEARNPLAY_ALLOW_NON_INTERNAL_BUILD=true
      bash "$APP_DIR/build-cloud-linux.sh"
      ;;
    onprem)
      use_env onprem
      set -a; . "$APP_DIR/.env.onprem.local"; set +a
      export LEARNPLAY_BUILD_INVOKER_TOOL=devadmin
      export LEARNPLAY_ALLOW_NON_INTERNAL_BUILD=true
      export CLOUD_DATA_DATABASE_URL="$(db_url "$CLOUD_DB")"
      if [ -d "$APP_DIR/uploads/cloud" ]; then
        export LEARNPLAY_UPLOAD_DIR="$APP_DIR/uploads/cloud"
      fi
      bash "$APP_DIR/onprem/build-onprem.sh"
      ;;
    *) die "build requires cloud or onprem" ;;
  esac
}

doctor() {
  log "Workspace"
  printf 'APP_DIR=%s\n' "$APP_DIR"
  printf 'USER=%s\n' "$USER"
  printf 'SHELL=%s\n' "$SHELL"
  log "Tools"
  for cmd in git node npm psql pg_isready libreoffice pdftoppm ffmpeg gh; do
    if command -v "$cmd" >/dev/null 2>&1; then
      printf '%-14s %s\n' "$cmd" "$("$cmd" --version 2>&1 | head -1 || true)"
    else
      printf '%-14s missing\n' "$cmd"
    fi
  done
  log "Git"
  git -C "$(cd "$APP_DIR/.." && pwd)" status --short || true
}

bootstrap() {
  ensure_wsl_path
  install_apt
  install_node
  setup_databases
  create_envs
  npm_install
  init_db cloud
  init_db onprem
  doctor
  cat <<EOF

Bootstrap complete.

Start cloud:
  bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh start cloud

Start onprem:
  bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh start onprem

Support login:
  support@learnplay.co.za
  Password hash seeded from the existing LearnPlay bootstrap default.
EOF
}

main() {
  local command="${1:-}"
  shift || true
  case "$command" in
    bootstrap) bootstrap ;;
    apt) install_apt ;;
    node) install_node ;;
    npm) npm_install ;;
    db) setup_databases ;;
    env) create_envs ;;
    init-db) init_db "${1:-}" ;;
    use) use_env "${1:-}" ;;
    start) start_dev "${1:-}" ;;
    check) run_check ;;
    test-critical) run_test_critical ;;
    build) build_package "${1:-}" ;;
    doctor) doctor ;;
    help|-h|--help|"") usage ;;
    *) usage; die "Unknown command: $command" ;;
  esac
}

main "$@"
