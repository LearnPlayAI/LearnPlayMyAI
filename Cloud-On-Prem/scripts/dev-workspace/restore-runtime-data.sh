#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUNDLE_PATH="${1:-}"

DB_USER="${LEARNPLAY_DEV_DB_USER:-learnplay}"
DB_PASS="${LEARNPLAY_DEV_DB_PASS:-learnplay_dev_password}"
CLOUD_DB="${LEARNPLAY_CLOUD_DB:-learnplay_cloud_dev}"
ONPREM_DB="${LEARNPLAY_ONPREM_DB:-learnplay_onprem_dev}"
DB_HOST="${LEARNPLAY_DEV_DB_HOST:-localhost}"
DB_PORT="${LEARNPLAY_DEV_DB_PORT:-}"
FALLBACK_DB_PORT="${LEARNPLAY_DEV_DB_FALLBACK_PORT:-55432}"
USER_PGDATA="${LEARNPLAY_DEV_PGDATA:-$HOME/.local/share/learnplay/postgres-16}"
USER_PGBIN="${LEARNPLAY_DEV_PGBIN:-/usr/lib/postgresql/16/bin}"

usage() {
  cat <<EOF
Usage:
  bash Cloud-On-Prem/scripts/dev-workspace/restore-runtime-data.sh /path/to/learnplay-runtime-data-*.tar.gz

Restores the current DEV runtime data into the WSL workstation:
  - cloud PostgreSQL dump -> ${CLOUD_DB}
  - onprem PostgreSQL dump -> ${ONPREM_DB}
  - cloud runtime uploads -> Cloud-On-Prem/uploads/cloud
  - onprem runtime uploads -> Cloud-On-Prem/uploads/onprem

This is destructive for those two local development databases.
EOF
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

if [ -z "$BUNDLE_PATH" ] || [ "$BUNDLE_PATH" = "-h" ] || [ "$BUNDLE_PATH" = "--help" ]; then
  usage
  exit 0
fi
[ -f "$BUNDLE_PATH" ] || die "Bundle not found: $BUNDLE_PATH"

for cmd in tar psql pg_restore createdb dropdb; do
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
done

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
  if direct_db_admin_available; then
    return 0
  fi
  if ! sudo -n true >/dev/null 2>&1; then
    warn "sudo is not available without a password; using a user-owned PostgreSQL cluster."
    start_user_postgres
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start postgresql 2>/dev/null || sudo service postgresql start || true
  else
    sudo service postgresql start || true
  fi
}

start_postgres

TMP_DIR="$(mktemp -d /tmp/learnplay-runtime-restore.XXXXXX)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

log "Extracting runtime data bundle"
tar -xzf "$BUNDLE_PATH" -C "$TMP_DIR"

if [ -f "$TMP_DIR/checksums.sha256" ]; then
  (cd "$TMP_DIR" && sha256sum -c checksums.sha256)
fi

restore_db() {
  local variant="$1"
  local db_name="$2"
  local dump_file="$TMP_DIR/payload/${variant}.dump"
  [ -f "$dump_file" ] || die "Missing dump file: $dump_file"

  log "Restoring ${variant} database into ${db_name}"
  if direct_db_admin_available; then
    PGPASSWORD="$DB_PASS" psql "$(postgres_admin_url)" -c "ALTER USER \"${DB_USER}\" CREATEDB;" >/dev/null
    PGPASSWORD="$DB_PASS" dropdb --host="$DB_HOST" --port="$(db_port)" --username="$DB_USER" --if-exists "$db_name"
    PGPASSWORD="$DB_PASS" createdb --host="$DB_HOST" --port="$(db_port)" --username="$DB_USER" --owner="$DB_USER" "$db_name"
  else
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
      || sudo -u postgres psql -c "CREATE USER \"${DB_USER}\" WITH PASSWORD '${DB_PASS}';"
    sudo -u postgres psql -c "ALTER USER \"${DB_USER}\" CREATEDB;" >/dev/null
    sudo -u postgres dropdb --if-exists "$db_name"
    sudo -u postgres createdb -O "$DB_USER" "$db_name"
  fi
  pg_restore \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --dbname "$(db_url "$db_name")" \
    "$dump_file"
}

restore_uploads() {
  local variant="$1"
  local tar_file="$TMP_DIR/payload/${variant}-uploads.tar.gz"
  local target_dir="$APP_DIR/uploads/${variant}"
  [ -f "$tar_file" ] || die "Missing uploads archive: $tar_file"

  log "Restoring ${variant} uploads into ${target_dir}"
  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  tar -xzf "$tar_file" -C "$target_dir"
}

restore_runtime_metadata() {
  local meta_tar="$TMP_DIR/payload/runtime-metadata.tar.gz"
  if [ -f "$meta_tar" ]; then
    log "Restoring runtime metadata notes"
    mkdir -p "$APP_DIR/runtime-metadata"
    tar -xzf "$meta_tar" -C "$APP_DIR/runtime-metadata"
  fi
}

restore_db cloud "$CLOUD_DB"
restore_db onprem "$ONPREM_DB"
restore_uploads cloud
restore_uploads onprem
restore_runtime_metadata

log "Runtime data restore complete"
cat <<EOF

Next commands:
  cd $APP_DIR
  bash scripts/dev-workspace/bootstrap-wsl-dev.sh env
  bash scripts/dev-workspace/bootstrap-wsl-dev.sh use cloud
  npm run -s migration:validate
  bash scripts/dev-workspace/bootstrap-wsl-dev.sh use onprem
  npm run -s migration:validate

EOF
