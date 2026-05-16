#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[ui-audit] white-label ui audit"
hits=0

echo
echo "[ui-audit] Raw <button> with explicit text/bg classes (review and migrate to shared Button):"
if rg -n -P '<button[^>]*className\s*=\s*"[^"]*(text-|bg-)[^"]*"' client/src -S \
  -g '!**/*.backup' -g '!**/*.backup.*' >/tmp/ui-audit-raw-buttons.txt; then
  cat /tmp/ui-audit-raw-buttons.txt
  hits=1
fi

echo
echo "[ui-audit] Hardcoded hex/rgb/hsl in inline style (review tokenization):"
if rg -n -P 'style\s*=\s*\{\{[^}]*(:\s*["'\'']?(#|rgb|hsl)[^,}]*["'\'']?)' client/src -S \
  -g '!**/*.backup' -g '!**/*.backup.*' >/tmp/ui-audit-inline-colors.txt; then
  cat /tmp/ui-audit-inline-colors.txt
  hits=1
fi

echo
echo "[ui-audit] Potential text-transparent usages without explicit gradient helper:"
if rg -n -P 'className\s*=\s*"[^"]*text-transparent[^"]*"' client/src -S \
  -g '!**/*.backup' -g '!**/*.backup.*' \
  | rg -v 'gradient-text|bg-clip-text' >/tmp/ui-audit-transparent.txt; then
  cat /tmp/ui-audit-transparent.txt
  hits=1
fi

echo
echo "[ui-audit] Hardcoded palette utility count (pages/components):"
(rg -n -P '\b(?:text|bg|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:[0-9]{2,3})(?:/[0-9]{1,3})?\b' \
  client/src/pages client/src/components -S -g '!**/*.backup' -g '!**/*.backup.*' || true) \
  | wc -l

echo
echo "[ui-audit] Preview-only token family adoption in live pages/components:"
for token_family in course-card filter-pill empty-state question-card lesson-nav admin-sidebar admin-table step-card stepper feature-card; do
  count=$( (rg -n -e "--${token_family}-" client/src/pages client/src/components -S \
    -g '!**/*.backup' -g '!**/*.backup.*' -g '!client/src/components/brand-editor/**' || true) | wc -l | tr -d ' ')
  echo "  --${token_family}- : ${count}"
done

echo
if [[ "$hits" -eq 1 ]]; then
  echo "[ui-audit] failed"
  exit 1
fi

echo "[ui-audit] passed"
