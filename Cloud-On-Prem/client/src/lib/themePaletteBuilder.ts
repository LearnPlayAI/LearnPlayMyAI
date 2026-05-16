import { buildFullTokens, type BaseTokens } from '../config/themePresets';
import { getContrastRatio, suggestAccessibleForeground } from '../utils/contrast';
import { applyThemeContrastGuard } from '../../../shared/themeContrastGuard';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAnchorColor(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = hex.split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return `#${hex.toLowerCase()}`;
  }
  return trimmed;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map((v) => v + v).join('') : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHslString(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round((h * 60 + 360) % 360);
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getHueFromHex(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHslString(r, g, b);
  const match = hsl.match(/hsl\((\d+)/i);
  return match ? Number(match[1]) : 210;
}

export function buildBaseTokensFromPalette(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  tone: 'light' | 'dark'
): BaseTokens {
  const primaryHue = getHueFromHex(primaryHex);
  const primary = normalizeAnchorColor(primaryHex);
  const secondary = normalizeAnchorColor(secondaryHex);
  const accent = normalizeAnchorColor(accentHex);
  const isDark = tone === 'dark';
  return {
    primary,
    primaryForeground: isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)',
    secondary,
    secondaryForeground: 'hsl(0, 0%, 100%)',
    accent,
    accentForeground: isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)',
    background: isDark ? `hsl(${primaryHue}, 20%, 8%)` : `hsl(${primaryHue}, 28%, 97%)`,
    foreground: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)',
    card: isDark ? `hsl(${primaryHue}, 18%, 11%)` : 'hsl(0, 0%, 100%)',
    cardForeground: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)',
    muted: isDark ? `hsl(${primaryHue}, 14%, 16%)` : `hsl(${primaryHue}, 18%, 92%)`,
    mutedForeground: isDark ? 'hsl(0, 0%, 65%)' : 'hsl(220, 12%, 42%)',
    border: isDark ? `hsl(${primaryHue}, 16%, 24%)` : `hsl(${primaryHue}, 18%, 84%)`,
    ring: primary,
    gradientFrom: primary,
    gradientTo: primary,
    gamePrimary: accent,
    gameGlow: accent,
    isDark,
  };
}

export function enforcePaletteCoreTokens(tokens: Record<string, string>, base: BaseTokens): Record<string, string> {
  const isDark = base.isDark === true;
  const primaryFgFallback = suggestAccessibleForeground(base.primary, { isDark });
  const secondaryFgFallback = suggestAccessibleForeground(base.secondary, { isDark });
  const accentFgFallback = suggestAccessibleForeground(base.accent, { isDark });

  const preserveAccessibleValue = (
    candidate: string | undefined,
    pairs: Array<{ background: string; required: number }>,
    fallback: string
  ): string => {
    if (!candidate) return fallback;
    const meetsAllPairs = pairs.every(({ background, required }) => getContrastRatio(candidate, background) >= required);
    return meetsAllPairs ? candidate : fallback;
  };

  const primaryFg = preserveAccessibleValue(
    tokens['--primary-foreground'],
    [{ background: base.primary, required: 4.5 }],
    primaryFgFallback,
  );
  const secondaryFg = preserveAccessibleValue(
    tokens['--secondary-foreground'],
    [{ background: base.secondary, required: 4.5 }],
    secondaryFgFallback,
  );
  const accentFg = preserveAccessibleValue(
    tokens['--accent-foreground'],
    [{ background: base.accent, required: 4.5 }],
    accentFgFallback,
  );
  const foreground = preserveAccessibleValue(
    tokens['--foreground'],
    [{ background: base.background, required: 7 }],
    base.foreground,
  );
  const cardForeground = preserveAccessibleValue(
    tokens['--card-foreground'],
    [{ background: base.card, required: 4.5 }],
    base.cardForeground,
  );
  const mutedForeground = preserveAccessibleValue(
    tokens['--muted-foreground'],
    [{ background: base.muted, required: 4.5 }],
    base.mutedForeground,
  );
  const border = preserveAccessibleValue(
    tokens['--border'],
    [
      { background: base.background, required: 3 },
      { background: base.card, required: 3 },
    ],
    base.border,
  );
  const ring = preserveAccessibleValue(
    tokens['--ring'],
    [
      { background: base.background, required: 3 },
      { background: base.card, required: 3 },
    ],
    tokens['--ring'] || base.primary,
  );
  const popover = tokens['--popover'] || base.card;
  const popoverForeground = preserveAccessibleValue(
    tokens['--popover-foreground'],
    [{ background: popover, required: 4.5 }],
    tokens['--popover-foreground'] || cardForeground,
  );
  const actionPrimaryFg = preserveAccessibleValue(
    tokens['--action-primary-fg'],
    [{ background: base.primary, required: 4.5 }],
    primaryFg,
  );
  const actionSecondaryFg = preserveAccessibleValue(
    tokens['--action-secondary-fg'],
    [{ background: base.secondary, required: 4.5 }],
    secondaryFg,
  );
  const actionAccentFg = preserveAccessibleValue(
    tokens['--action-accent-fg'],
    [{ background: base.accent, required: 4.5 }],
    accentFg,
  );

  return {
    ...tokens,
    // Core brand anchors
    '--primary': base.primary,
    '--primary-foreground': primaryFg,
    '--secondary': base.secondary,
    '--secondary-foreground': secondaryFg,
    '--accent': base.accent,
    '--accent-foreground': accentFg,

    // Structural primitives
    '--background': base.background,
    '--foreground': foreground,
    '--card': base.card,
    '--card-foreground': cardForeground,
    '--muted': base.muted,
    '--muted-foreground': mutedForeground,
    '--border': border,
    '--ring': ring,
    '--popover': popover,
    '--popover-foreground': popoverForeground,

    // Brand gradients and game anchors
    '--gradient-from': base.primary,
    '--gradient-to': base.primary,
    '--gradient-primary-from': base.primary,
    '--gradient-primary-to': base.primary,
    '--cta-gradient-from': base.primary,
    '--cta-gradient-to': base.primary,
    '--game-primary': base.accent,
    '--game-glow': base.accent,

    // Keep canonical action anchors aligned with selected palette anchors.
    '--action-primary': base.primary,
    '--action-primary-fg': actionPrimaryFg,
    '--action-secondary': base.secondary,
    '--action-secondary-fg': actionSecondaryFg,
    '--action-accent': base.accent,
    '--action-accent-fg': actionAccentFg,
  };
}

export function generatePaletteTokens({
  primaryHex,
  secondaryHex,
  accentHex,
  tone,
  autoFix = false,
}: {
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  tone: 'light' | 'dark';
  autoFix?: boolean;
}): Record<string, string> {
  const base = buildBaseTokensFromPalette(primaryHex, secondaryHex, accentHex, tone);
  const generated = buildFullTokens(base);
  const anchored = enforcePaletteCoreTokens(generated, base);
  if (autoFix) {
    const guarded = applyThemeContrastGuard(anchored).tokens;
    return enforcePaletteCoreTokens(guarded, base);
  }
  return anchored;
}

export function shouldProceedWithOrgSwitch(
  hasUnsavedChanges: boolean,
  confirmFn: (message: string) => boolean
): boolean {
  if (!hasUnsavedChanges) return true;
  return confirmFn('You have unsaved theme changes. Switch organization and discard these edits?');
}

export function normalizeLightnessFromColorValue(color: string | undefined, fallback = 50): number {
  if (!color) return fallback;
  const trimmed = color.trim();
  const hslMatch = trimmed.match(
    /^hsla?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?\s*(?:,\s*|\s+)([0-9.]+)%\s*(?:,\s*|\s+)([0-9.]+)%/i
  );
  if (hslMatch) return clamp(Number(hslMatch[3]), 0, 100);
  return fallback;
}
