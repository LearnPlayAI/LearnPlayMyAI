#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[ui-contrast] scanning for risky class combinations..."

SCAN_SCOPE=(client/src/pages client/src/components)
EXCLUDE_GLOBS=(-g '!**/*.backup' -g '!**/*.backup.*')

# 1) Exact white-on-white in a single className string.
WHITE_ON_WHITE_PATTERN='className\s*=\s*"[^"]*(text-white|text-\[white\])[^"]*(bg-white(?!\/)|bg-\[white\])[^"]*"|className\s*=\s*"[^"]*(bg-white(?!\/)|bg-\[white\])[^"]*(text-white|text-\[white\])[^"]*"'

# 2) Foreground token likely intended for colored CTAs on pure white backgrounds.
TOKEN_ON_WHITE_PATTERN='className\s*=\s*"[^"]*text-\[hsl\(var\(--(primary|secondary|destructive)-foreground\)\)\][^"]*(bg-white(?!\/)|bg-\[hsl\(var\(--background\)\)\])[^"]*"'

# 3) Transparent text outside known gradient helper utility.
TRANSPARENT_TEXT_PATTERN='className\s*=\s*"[^"]*text-transparent[^"]*"'

# 4) Placeholder text likely invisible on white-like inputs.
PLACEHOLDER_ON_WHITE_PATTERN='className\s*=\s*"[^"]*placeholder:(text-white|text-\[white\])[^"]*(bg-white(?!\/)|bg-\[white\]|bg-\[hsl\(var\(--background\)\)\])[^"]*"|className\s*=\s*"[^"]*(bg-white(?!\/)|bg-\[white\]|bg-\[hsl\(var\(--background\)\)\])[^"]*placeholder:(text-white|text-\[white\])[^"]*"'

# 5) Link classes explicitly white on white-like surfaces.
LINK_WHITE_ON_WHITE_PATTERN='<a[^>]*className\s*=\s*"[^"]*(text-white|text-\[white\])[^"]*(bg-white(?!\/)|bg-\[white\])[^"]*"|<a[^>]*className\s*=\s*"[^"]*(bg-white(?!\/)|bg-\[white\])[^"]*(text-white|text-\[white\])[^"]*"'

# 6) Tabs must not override active backgrounds at page level; shared component tokens own state colors.
TAB_ACTIVE_OVERRIDE_PATTERN='<TabsTrigger[^>]*className\s*=\s*"[^"]*data-\[state=active\]:bg-'

# 7) Strong foreground tokens on low-alpha/translucent (non-hover) backgrounds are high-risk.
LOW_ALPHA_BG_TOKEN='(?<!hover:)(?<!focus:)(?<!active:)(?<!data-\[state=active\]:)(?:bg|from|to)-[^"\s]+/(?:[0-7]?[0-9]|80)'
FG_ON_ALPHA_PATTERN="className\\s*=\\s*\"[^\"]*(text-(primary|secondary|accent|destructive|warning)-foreground)[^\"]*(${LOW_ALPHA_BG_TOKEN})[^\"]*\"|className\\s*=\\s*\"[^\"]*(${LOW_ALPHA_BG_TOKEN})[^\"]*(text-(primary|secondary|accent|destructive|warning)-foreground)[^\"]*\""

# 8) Shared primitive state color overrides (page/component-level) can break white-label parity.
PRIMITIVE_STATE_COLOR_OVERRIDE_PATTERN='<(Button|Badge|Alert)\b[^>]*className\s*=\s*"[^"]*((hover|active|disabled|focus|data-\[state=active\]|data-\[state=inactive\]|aria-\[selected=true\]):(bg|text|border)-)[^"]*"'

# 9) Raw/base token paths should not grow in pages/components; use semantic component tokens instead.
RAW_BASE_TOKEN_PATH_PATTERN='\[(?:hsl\()?var\(--(?:primary|secondary|accent|destructive|warning|success|muted|background|foreground|card|popover|border|ring)|var\(--(?:primary|secondary|accent|destructive|warning|success|muted|background|foreground|card|popover|border|ring)'

# 10) Light foregrounds on white-like surfaces are likely unreadable.
WHITE_OR_MUTED_ON_WHITE_BG_PATTERN='className\s*=\s*"[^"]*(text-white/(?:[0-7]?[0-9]|80)|text-muted-foreground)[^"]*(bg-white(?!\/)|bg-\[white\]|bg-\[hsl\(var\(--background\)\)\])[^"]*"|className\s*=\s*"[^"]*(bg-white(?!\/)|bg-\[white\]|bg-\[hsl\(var\(--background\)\)\])[^"]*(text-white/(?:[0-7]?[0-9]|80)|text-muted-foreground)[^"]*"'

# 11) Semantic color foreground/background collisions (e.g. bg-primary + text-primary) are never valid.
SAME_TOKEN_SURFACE_AND_TEXT_PATTERN='className\s*=\s*"[^"]*(bg-(primary|secondary|accent|success|warning|destructive))(?!\/)[^"]*(text-\2)(?!-foreground)[^"]*"|className\s*=\s*"[^"]*(text-(primary|secondary|accent|success|warning|destructive))(?!-foreground)[^"]*(bg-\4)(?!\/)[^"]*"'

hits=0

if rg -n -P "$WHITE_ON_WHITE_PATTERN" client/src >/tmp/ui-contrast-white-on-white.txt; then
  echo "[ui-contrast] FAIL: white-on-white class combinations found:"
  cat /tmp/ui-contrast-white-on-white.txt
  hits=1
fi

if rg -n -P "$TOKEN_ON_WHITE_PATTERN" client/src >/tmp/ui-contrast-token-on-white.txt; then
  echo "[ui-contrast] FAIL: foreground token on white-like background found:"
  cat /tmp/ui-contrast-token-on-white.txt
  hits=1
fi

# Allow text-transparent only when used with explicit gradient utility classes.
if rg -n -P "$TRANSPARENT_TEXT_PATTERN" client/src \
  | rg -v "gradient-text|bg-clip-text" >/tmp/ui-contrast-transparent.txt; then
  echo "[ui-contrast] FAIL: potentially invisible text-transparent usages found:"
  cat /tmp/ui-contrast-transparent.txt
  hits=1
fi

if rg -n -P "$PLACEHOLDER_ON_WHITE_PATTERN" client/src >/tmp/ui-contrast-placeholder.txt; then
  echo "[ui-contrast] FAIL: potentially invisible placeholder text on white-like inputs found:"
  cat /tmp/ui-contrast-placeholder.txt
  hits=1
fi

if rg -n -P "$LINK_WHITE_ON_WHITE_PATTERN" client/src >/tmp/ui-contrast-link-white.txt; then
  echo "[ui-contrast] FAIL: white-on-white anchor combinations found:"
  cat /tmp/ui-contrast-link-white.txt
  hits=1
fi

if rg -n -P "$TAB_ACTIVE_OVERRIDE_PATTERN" client/src >/tmp/ui-contrast-tab-active-override.txt; then
  echo "[ui-contrast] FAIL: TabsTrigger active background overrides found (use semantic tab tokens via shared component):"
  cat /tmp/ui-contrast-tab-active-override.txt
  hits=1
fi

if rg -n -P "$FG_ON_ALPHA_PATTERN" client/src -g '!**/*.backup' -g '!**/*.backup.*' >/tmp/ui-contrast-fg-on-alpha.txt; then
  echo "[ui-contrast] FAIL: strong foreground tokens on alpha/translucent backgrounds found:"
  cat /tmp/ui-contrast-fg-on-alpha.txt
  hits=1
fi

# 12) Guardrail: prevent growth of hardcoded palette debt in app pages/components.
HARD_CODED_PATTERN='\b(?:text|bg|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:[0-9]{2,3})(?:/[0-9]{1,3})?\b'
CURRENT_HARDCODED_COUNT=$(
  (rg -n -P "$HARD_CODED_PATTERN" "${SCAN_SCOPE[@]}" \
    "${EXCLUDE_GLOBS[@]}" || true) | wc -l | tr -d ' '
)

CURRENT_PRIMITIVE_STATE_OVERRIDE_COUNT=$(
  (rg -n -P "$PRIMITIVE_STATE_COLOR_OVERRIDE_PATTERN" "${SCAN_SCOPE[@]}" \
    -g '!client/src/components/ui/**' "${EXCLUDE_GLOBS[@]}" || true) | wc -l | tr -d ' '
)

CURRENT_RAW_BASE_TOKEN_PATH_COUNT=$(
  (rg -n -P "$RAW_BASE_TOKEN_PATH_PATTERN" "${SCAN_SCOPE[@]}" \
    "${EXCLUDE_GLOBS[@]}" || true) | wc -l | tr -d ' '
)

if rg -n -P "$WHITE_OR_MUTED_ON_WHITE_BG_PATTERN" "${SCAN_SCOPE[@]}" \
  "${EXCLUDE_GLOBS[@]}" >/tmp/ui-contrast-white-muted-on-white.txt; then
  echo "[ui-contrast] FAIL: likely unreadable light/muted foreground on white-like background found:"
  cat /tmp/ui-contrast-white-muted-on-white.txt
  hits=1
fi

if rg -n -P "$SAME_TOKEN_SURFACE_AND_TEXT_PATTERN" "${SCAN_SCOPE[@]}" \
  "${EXCLUDE_GLOBS[@]}" >/tmp/ui-contrast-same-token-collision.txt; then
  echo "[ui-contrast] FAIL: semantic same-token background/text collisions found (use *-foreground or tinted backgrounds):"
  cat /tmp/ui-contrast-same-token-collision.txt
  hits=1
fi

BASELINE_FILE="scripts/ui-theme-baseline.env"
if [[ -f "$BASELINE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BASELINE_FILE"
  BASELINE_HARDCODED_COUNT="${BASELINE_HARDCODED_COUNT:-0}"
  BASELINE_PRIMITIVE_STATE_OVERRIDE_COUNT="${BASELINE_PRIMITIVE_STATE_OVERRIDE_COUNT:-0}"
  BASELINE_RAW_BASE_TOKEN_PATH_COUNT="${BASELINE_RAW_BASE_TOKEN_PATH_COUNT:-0}"
  if [[ "$CURRENT_HARDCODED_COUNT" -gt "$BASELINE_HARDCODED_COUNT" ]]; then
    echo "[ui-contrast] FAIL: hardcoded palette debt increased ($CURRENT_HARDCODED_COUNT > $BASELINE_HARDCODED_COUNT)"
    echo "[ui-contrast] Run npm run audit:ui-white-label and migrate new fixed-color classes to semantic tokens."
    hits=1
  fi
  if [[ "$CURRENT_PRIMITIVE_STATE_OVERRIDE_COUNT" -gt "$BASELINE_PRIMITIVE_STATE_OVERRIDE_COUNT" ]]; then
    echo "[ui-contrast] FAIL: shared primitive state color overrides increased ($CURRENT_PRIMITIVE_STATE_OVERRIDE_COUNT > $BASELINE_PRIMITIVE_STATE_OVERRIDE_COUNT)"
    echo "[ui-contrast] Keep Button/Badge/Alert state colors in shared primitive variants; avoid page-level state color overrides."
    hits=1
  fi
  if [[ "$CURRENT_RAW_BASE_TOKEN_PATH_COUNT" -gt "$BASELINE_RAW_BASE_TOKEN_PATH_COUNT" ]]; then
    echo "[ui-contrast] FAIL: raw base token usage increased ($CURRENT_RAW_BASE_TOKEN_PATH_COUNT > $BASELINE_RAW_BASE_TOKEN_PATH_COUNT)"
    echo "[ui-contrast] Use semantic component token surfaces (button/badge/input/nav/etc.) in pages/components."
    hits=1
  fi
fi

if [[ "$hits" -eq 1 ]]; then
  echo "[ui-contrast] failed"
  exit 1
fi

echo "[ui-contrast] passed"
