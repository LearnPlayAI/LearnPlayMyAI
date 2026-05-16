#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/antigravity"
DEVADMIN_SH="${ROOT_DIR}/devadmin.sh"
BOOTSTRAP_SH="${ROOT_DIR}/scripts/devadmin/ssh-bootstrap.sh"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

check_file() {
  local path="$1"
  [ -f "$path" ] || fail "Missing required file: $path"
}

assert_no_pattern() {
  local pattern="$1"
  local path="$2"
  if command -v rg >/dev/null 2>&1; then
    if rg -n --fixed-strings "$pattern" "$path" >/dev/null 2>&1; then
      fail "Unexpected pattern found in $path: $pattern"
    fi
    return 0
  fi
  if grep -nF "$pattern" "$path" >/dev/null 2>&1; then
    fail "Unexpected pattern found in $path: $pattern"
  fi
}

assert_has_pattern() {
  local pattern="$1"
  local path="$2"
  if command -v rg >/dev/null 2>&1; then
    if rg -n --fixed-strings "$pattern" "$path" >/dev/null 2>&1; then
      return 0
    fi
    fail "Required pattern not found in $path: $pattern"
  fi
  if ! grep -nF "$pattern" "$path" >/dev/null 2>&1; then
    fail "Required pattern not found in $path: $pattern"
  fi
}

check_file "$DEVADMIN_SH"
check_file "$BOOTSTRAP_SH"

# Guard against cross-scope password writes in bootstrap helper.
assert_no_pattern 'ACC_ONPREM_PASSWORD=$(printf '\''%q'\'' "${ACC_PASSWORD}")' "$BOOTSTRAP_SH"
assert_no_pattern 'ACC_CLOUD_PASSWORD=$(printf '\''%q'\'' "${ACC_PASSWORD}")' "$BOOTSTRAP_SH"
assert_no_pattern 'PRD_ONPREM_PASSWORD=$(printf '\''%q'\'' "${PRD_PASSWORD}")' "$BOOTSTRAP_SH"
assert_no_pattern 'PRD_CLOUD_PASSWORD=$(printf '\''%q'\'' "${PRD_PASSWORD}")' "$BOOTSTRAP_SH"

# Guard against cloud/onprem fallback password reads in bootstrap helper.
assert_no_pattern 'ACC_PASSWORD="${ACC_CLOUD_PASSWORD:-${ACC_ONPREM_PASSWORD:-}}"' "$BOOTSTRAP_SH"
assert_no_pattern 'PRD_PASSWORD="${PRD_CLOUD_PASSWORD:-${PRD_ONPREM_PASSWORD:-}}"' "$BOOTSTRAP_SH"

# Guard against hardcoded cloud/acc scope in DR remote calls.
assert_no_pattern 'remote_copy_to_tmp "cloud" "acc"' "$DEVADMIN_SH"
assert_no_pattern 'remote_exec_bash "cloud" "acc"' "$DEVADMIN_SH"

# Ensure defensive scope/alias checks are present in devadmin.
assert_has_pattern 'Invalid ${scope}/${env_name} target host' "$DEVADMIN_SH"

echo "OK: scope-isolation checks passed"
