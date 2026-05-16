#!/usr/bin/env bash
set -euo pipefail

ROOT="client/src"

EXCLUDES=(
  "-g" "!**/*.backup"
  "-g" "!**/*.backup.*"
  "-g" "!client/src/components/brand-editor/previews/**"
)

fail=0

echo "[uikit-parity] checking for page-level action gradients..."
ACTION_GRADIENT_PATTERN='bg-gradient-to-[a-z]+[^\n]*from-\[var\(--action-[^)]+\)(/[0-9.]+)?\][^\n]*to-\[var\(--action-[^)]+\)(/[0-9.]+)?\]'
if rg -n -P "$ACTION_GRADIENT_PATTERN" "$ROOT/pages" "$ROOT/components" "${EXCLUDES[@]}" >/tmp/uikit-parity-action-gradient.txt; then
  echo "[uikit-parity] FAIL: action-gradient utility usage found outside UI Kit primitives:"
  cat /tmp/uikit-parity-action-gradient.txt
  fail=1
fi

echo "[uikit-parity] checking for any remaining gradient utilities in app UI..."
if rg -n -P 'bg-gradient-to-[a-z]+' "$ROOT/pages" "$ROOT/components" "${EXCLUDES[@]}" >/tmp/uikit-parity-any-gradients.txt; then
  echo "[uikit-parity] FAIL: residual gradient utility classes detected:"
  cat /tmp/uikit-parity-any-gradients.txt
  fail=1
fi

echo "[uikit-parity] checking for orphan gradient stop utilities..."
if rg -n -P '(?:^|\\s)(?:hover:|active:|group-hover:)?(?:from|via|to)-(?!(?:left|right|top|bottom|start|end)-)[^\\s"'"'"'`]+' "$ROOT/pages" "$ROOT/components" "${EXCLUDES[@]}" >/tmp/uikit-parity-orphan-stops.txt; then
  echo "[uikit-parity] FAIL: orphan from/via/to utility classes detected:"
  cat /tmp/uikit-parity-orphan-stops.txt
  fail=1
fi

echo "[uikit-parity] checking for page-level primitive state overrides..."
BUTTON_OVERRIDE_PATTERN='<Button[^>]*className=\"[^\"]*(bg-\[var\(--action-[^)]+\)|text-(white|black)|bg-(white|black)|border-(white|black))[^\"]*\"'
if rg -n -P "$BUTTON_OVERRIDE_PATTERN" "$ROOT/pages" "$ROOT/components" "${EXCLUDES[@]}" >/tmp/uikit-parity-button-overrides.txt; then
  echo "[uikit-parity] FAIL: shared Button has page-level color state overrides:"
  cat /tmp/uikit-parity-button-overrides.txt
  fail=1
fi

echo "[uikit-parity] checking for atmospheric shell blur/overlay debt..."
if rg -n -P 'bg-sidebar/[0-9]+|backdrop-blur' "$ROOT/components/QuizAdminLayout.tsx" >/tmp/uikit-parity-shell-effects.txt; then
  echo "[uikit-parity] FAIL: shell atmospheric effects detected in admin layout:"
  cat /tmp/uikit-parity-shell-effects.txt
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[uikit-parity] failed"
  exit 1
fi

echo "[uikit-parity] passed"
