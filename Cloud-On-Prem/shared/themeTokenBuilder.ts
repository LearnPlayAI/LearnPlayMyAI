import { REQUIRED_TOKEN_KEYS, TokenKey } from './brandingTokens';

export interface BaseTokens {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  ring: string;
  gradientFrom: string;
  gradientTo: string;
  gamePrimary: string;
  gameGlow: string;
  isDark?: boolean;
}

function parseHexToRGB(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16),
    };
  }
  return null;
}

function rgbToHSL(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToHSLString(hex: string): string {
  const rgb = parseHexToRGB(hex);
  if (!rgb) return hex;
  const hsl = rgbToHSL(rgb.r, rgb.g, rgb.b);
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

function normalizeToHSL(color: string): string {
  const modernHslMatch = color.match(
    /^hsla?\(\s*([0-9.]+)(deg|rad|grad|turn)?\s+([0-9.]+)%\s+([0-9.]+)%(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i
  );
  if (modernHslMatch) {
    const [, h, unit = "", s, l, alpha] = modernHslMatch;
    if (alpha !== undefined) {
      return `hsla(${h}${unit}, ${s}%, ${l}%, ${alpha})`;
    }
    return `hsl(${h}${unit}, ${s}%, ${l}%)`;
  }

  if (color.startsWith('#')) {
    return hexToHSLString(color);
  }
  return color;
}

function withAlpha(hslColor: string, alpha: number): string {
  const normalized = normalizeToHSL(hslColor);
  if (normalized.startsWith('hsla')) return normalized;
  return normalized.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
}

function adjustLightness(hslColor: string, delta: number): string {
  const normalized = normalizeToHSL(hslColor);
  const match = normalized.match(/hsl[a]?\((\d+),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%/);
  if (!match) return hslColor;
  const h = match[1];
  const s = match[2];
  const l = Math.max(0, Math.min(100, parseFloat(match[3]) + delta));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

interface HslComponents {
  h: number;
  s: number;
  l: number;
  a: number;
}

function parseHslComponents(color: string): HslComponents | null {
  const normalized = normalizeToHSL(color).trim();
  const match = normalized.match(
    /^hsla?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%(?:\s*,\s*([0-9.]+%?)\s*)?\)$/i
  );
  if (!match) return null;

  const hRaw = parseFloat(match[1]);
  const s = Math.max(0, Math.min(100, parseFloat(match[2])));
  const l = Math.max(0, Math.min(100, parseFloat(match[3])));
  const alphaRaw = match[4];
  let a = 1;
  if (alphaRaw !== undefined) {
    if (alphaRaw.endsWith('%')) {
      a = Math.max(0, Math.min(1, parseFloat(alphaRaw) / 100));
    } else {
      a = Math.max(0, Math.min(1, parseFloat(alphaRaw)));
    }
  }

  const h = ((hRaw % 360) + 360) % 360;
  return { h, s, l, a };
}

function hslToRgb(components: HslComponents): { r: number; g: number; b: number; a: number } {
  const h = components.h / 360;
  const s = components.s / 100;
  const l = components.l / 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray, a: components.a };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return { r, g, b, a: components.a };
}

function compositeRgb(
  fg: { r: number; g: number; b: number; a: number },
  bg: { r: number; g: number; b: number; a: number }
): { r: number; g: number; b: number; a: number } {
  if (fg.a >= 1) return { ...fg, a: 1 };
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const r = Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a);
  const g = Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a);
  const b = Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a);
  return { r, g, b, a };
}

function colorToRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  if (color.startsWith('#')) {
    const rgb = parseHexToRGB(color);
    return rgb ? { ...rgb, a: 1 } : null;
  }
  const hsl = parseHslComponents(color);
  if (!hsl) return null;
  return hslToRgb(hsl);
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const sRGB = value / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const r = channel(color.r);
  const g = channel(color.g);
  const b = channel(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = colorToRgb(foreground);
  const bg = colorToRgb(background);
  if (!fg || !bg) return 1;
  const fgOpaque = fg.a < 1 ? compositeRgb(fg, bg) : fg;
  const bgOpaque = bg.a < 1 ? compositeRgb(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const l1 = relativeLuminance(fgOpaque);
  const l2 = relativeLuminance(bgOpaque);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureForegroundContrast(
  background: string,
  preferred: string,
  fallbackLight: string,
  fallbackDark: string,
  targetRatio = 4.5
): string {
  const candidates = [
    preferred,
    fallbackLight,
    fallbackDark,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 0%)',
    'hsl(0, 0%, 10%)',
  ];
  let best = preferred;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
    if (ratio >= targetRatio && candidate === preferred) {
      return candidate;
    }
  }
  return best;
}

function ensureForegroundAcross(
  backgrounds: string[],
  preferred: string,
  fallbackLight: string,
  fallbackDark: string,
  targetRatio = 4.5
): string {
  const candidates = [
    preferred,
    fallbackLight,
    fallbackDark,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 10%)',
    'hsl(0, 0%, 0%)',
  ];

  let best = preferred;
  let bestMinRatio = 0;

  for (const candidate of candidates) {
    const minRatio = backgrounds.reduce((acc, bg) => Math.min(acc, contrastRatio(candidate, bg)), Number.POSITIVE_INFINITY);
    if (minRatio > bestMinRatio) {
      bestMinRatio = minRatio;
      best = candidate;
    }
    if (candidate === preferred && minRatio >= targetRatio) {
      return candidate;
    }
  }

  for (let lightness = 0; lightness <= 100; lightness += 2) {
    const candidate = `hsl(0, 0%, ${lightness}%)`;
    const minRatio = backgrounds.reduce((acc, bg) => Math.min(acc, contrastRatio(candidate, bg)), Number.POSITIVE_INFINITY);
    if (minRatio > bestMinRatio) {
      bestMinRatio = minRatio;
      best = candidate;
    }
    if (minRatio >= targetRatio) {
      return candidate;
    }
  }

  return best;
}

function improveContrastWithForeground(
  background: string,
  foreground: string,
  targetRatio = 4.5
): string {
  const initialRatio = contrastRatio(foreground, background);
  if (initialRatio >= targetRatio) return background;

  const parsed = parseHslComponents(background);
  if (!parsed) return background;

  let best = background;
  let bestRatio = initialRatio;

  for (let step = 1; step <= 36; step += 1) {
    for (const direction of [-1, 1]) {
      const lightness = clampNumber(parsed.l + direction * step * 2, 4, 96);
      const candidate = `hsl(${Math.round(parsed.h)}, ${Math.round(parsed.s)}%, ${Math.round(lightness)}%)`;
      const ratio = contrastRatio(foreground, candidate);
      if (ratio > bestRatio) {
        best = candidate;
        bestRatio = ratio;
      }
      if (ratio >= targetRatio) {
        return candidate;
      }
    }
  }

  return best;
}

function ensureSurfaceBorderContrast(
  borderColor: string,
  surfaceColor: string,
  targetRatio = 3
): string {
  const existingRatio = contrastRatio(borderColor, surfaceColor);
  if (existingRatio >= targetRatio) return borderColor;

  const border = parseHslComponents(borderColor);
  const surface = parseHslComponents(surfaceColor);
  if (!border || !surface) {
    return getLightness(surfaceColor) > 50 ? 'hsl(0, 0%, 45%)' : 'hsl(0, 0%, 60%)';
  }

  const direction = surface.l > 50 ? -1 : 1;
  for (let step = 2; step <= 40; step += 2) {
    const adjustedLightness = Math.max(5, Math.min(95, border.l + direction * step));
    const adjusted = `hsl(${Math.round(border.h)}, ${Math.round(border.s)}%, ${Math.round(adjustedLightness)}%)`;
    if (contrastRatio(adjusted, surfaceColor) >= targetRatio) {
      return adjusted;
    }
  }

  return surface.l > 50 ? 'hsl(0, 0%, 45%)' : 'hsl(0, 0%, 60%)';
}

export function getLightness(hslColor: string): number {
  const normalized = normalizeToHSL(hslColor);
  const match = normalized.match(/hsl[a]?\((\d+),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%/);
  if (!match) return 50;
  return parseFloat(match[3]);
}

function getContrastingForeground(bgColor: string, lightFg: string, darkFg: string): string {
  return ensureForegroundContrast(bgColor, darkFg, lightFg, darkFg, 4.5);
}

/**
 * Get a dark "ink" version of a color suitable for text on translucent/light backgrounds.
 * Ensures WCAG AA contrast (≥4.5:1) against white/near-white backgrounds.
 * For light mode, returns color with ~18% lightness for proper contrast.
 * This ensures ≥7:1 contrast on pure white, ≥5:1 on near-white tints.
 */
function getDarkInkColor(hslColor: string): string {
  const normalized = normalizeToHSL(hslColor);
  const match = normalized.match(/hsl[a]?\((\d+),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%/);
  if (!match) return 'hsl(0, 0%, 18%)'; // fallback dark gray
  const h = match[1];
  const s = parseFloat(match[2]);
  // Reduce saturation and set lightness to ~18% for AA+ contrast on white/near-white
  const adjustedS = Math.min(s, 65);
  return `hsl(${h}, ${adjustedS}%, 18%)`;
}

function hoverDelta(isDark: boolean): number {
  return isDark ? 8 : -8;
}

function focusDelta(isDark: boolean): number {
  return isDark ? 12 : -12;
}

function activeDelta(isDark: boolean): number {
  return isDark ? 15 : -15;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function mixHue(a: number, b: number, t: number): number {
  const aa = normalizeHue(a);
  const bb = normalizeHue(b);
  const delta = ((bb - aa + 540) % 360) - 180;
  return normalizeHue(aa + delta * clampNumber(t, 0, 1));
}

function harmonizeHueLimited(targetHue: number, brandHue: number, weight = 0.18, maxShift = 18): number {
  const mixed = mixHue(targetHue, brandHue, weight);
  const delta = ((mixed - targetHue + 540) % 360) - 180;
  if (Math.abs(delta) <= maxShift) {
    return normalizeHue(mixed);
  }
  return normalizeHue(targetHue + Math.sign(delta) * maxShift);
}

export function buildFullTokens(base: BaseTokens): Record<TokenKey, string> {
  const isDark = base.isDark ?? false;

  // Preserve brand anchors exactly as authored; only derive companion tokens around them.
  const primaryColor = normalizeToHSL(base.primary);
  const secondaryColor = normalizeToHSL(base.secondary);
  const accentColor = normalizeToHSL(base.accent);

  const primaryComponents = parseHslComponents(primaryColor) ?? { h: 220, s: 75, l: isDark ? 62 : 48, a: 1 };
  const secondaryComponents = parseHslComponents(secondaryColor) ?? { h: 255, s: 68, l: isDark ? 58 : 44, a: 1 };
  const accentComponents = parseHslComponents(accentColor) ?? { h: 280, s: 72, l: isDark ? 62 : 50, a: 1 };
  const brandPrimary = primaryColor;
  const brandSecondary = secondaryColor;
  const brandAccent = accentColor;

  const brandHue = mixHue(
    primaryComponents.h,
    mixHue(secondaryComponents.h, accentComponents.h, 0.5),
    0.4
  );
  const brandSaturation = clampNumber(
    primaryComponents.s * 0.5 + secondaryComponents.s * 0.25 + accentComponents.s * 0.25,
    35,
    90
  );
  const neutralHue = mixHue(brandHue, isDark ? 220 : 215, 0.35);
  const neutralSaturation = clampNumber(8 + brandSaturation * 0.12, 9, 24);
  const neutralTone = (lightness: number, saturationDelta = 0) =>
    `hsl(${Math.round(neutralHue)}, ${Math.round(clampNumber(neutralSaturation + saturationDelta, 6, 32))}%, ${Math.round(clampNumber(lightness, 2, 98))}%)`;
  const statusHue = (targetHue: number) => harmonizeHueLimited(targetHue, brandHue, 0.18, 18);
  const statusTone = (targetHue: number, lightness: number, saturation = 78) =>
    `hsl(${Math.round(statusHue(targetHue))}, ${Math.round(clampNumber(saturation, 62, 92))}%, ${Math.round(clampNumber(lightness, 20, 82))}%)`;

  const fgStrong = isDark ? neutralTone(97, 2) : neutralTone(11, 4);
  const fgDefault = isDark ? neutralTone(92, 1) : neutralTone(16, 3);
  const fgMuted = isDark ? neutralTone(72, -1) : neutralTone(38, 0);
  const fgSubtle = isDark ? neutralTone(60, -2) : neutralTone(52, -1);
  
  const fgOnCard = ensureForegroundContrast(base.card, base.cardForeground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 12%)', 4.5);
  const fgOnMuted = ensureForegroundContrast(base.muted, base.mutedForeground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 15%)', 4.5);
  const fgOnPrimary = ensureForegroundContrast(primaryColor, base.primaryForeground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const fgOnSecondary = ensureForegroundContrast(secondaryColor, base.secondaryForeground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const fgOnAccent = ensureForegroundContrast(accentColor, base.accentForeground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const fgOnBackground = ensureForegroundContrast(base.background, base.foreground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 7);
  const mutedFg = ensureForegroundContrast(base.muted, base.mutedForeground, isDark ? 'hsl(0, 0%, 78%)' : 'hsl(0, 0%, 35%)', isDark ? 'hsl(0, 0%, 65%)' : 'hsl(0, 0%, 25%)', 4.5);
  const helperFg = ensureForegroundContrast(base.background, mutedFg, isDark ? 'hsl(0, 0%, 72%)' : 'hsl(0, 0%, 38%)', isDark ? 'hsl(0, 0%, 60%)' : 'hsl(0, 0%, 30%)', 4.5);
  
  // Surface tiers for visual hierarchy
  const surfaceBase = base.background;
  const surfaceRaised = isDark ? adjustLightness(base.card, 5) : adjustLightness(base.card, -2);
  const surfaceOverlay = isDark ? adjustLightness(base.card, 10) : base.card;

  const borderOnBackground = ensureSurfaceBorderContrast(base.border, base.background, 3);
  const borderOnCard = ensureSurfaceBorderContrast(base.border, base.card, 3);
  const borderOnMuted = ensureSurfaceBorderContrast(base.border, base.muted, 3);
  const borderUniversal = ensureSurfaceBorderContrast(borderOnBackground, base.card, 3);
  const strokeSubtle = withAlpha(borderUniversal, isDark ? 0.55 : 0.65);
  const inputBorder = ensureSurfaceBorderContrast(base.border, base.card, 3);
  const inputHoverBorder = ensureSurfaceBorderContrast(adjustLightness(base.border, hoverDelta(isDark)), base.card, 3);
  const selectBorder = ensureSurfaceBorderContrast(base.border, base.card, 3);
  const selectHoverBorder = ensureSurfaceBorderContrast(adjustLightness(base.border, hoverDelta(isDark)), base.card, 3);

  const destructiveBg = statusTone(6, isDark ? 56 : 46, 80);
  const successSeed = statusTone(142, isDark ? 48 : 32, 74);
  const warningSeed = statusTone(40, isDark ? 58 : 34, 80);
  // Ensure semantic success/warning tokens remain readable as foreground text on app surfaces.
  const successBg = improveContrastWithForeground(successSeed, base.background, 4.5);
  const warningBg = improveContrastWithForeground(warningSeed, base.background, 4.5);
  let infoBg = statusTone(205, isDark ? 56 : 48, 78);
  const destructiveFg = ensureForegroundContrast(destructiveBg, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const successFg = ensureForegroundContrast(successBg, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const warningFg = ensureForegroundContrast(warningBg, 'hsl(0, 0%, 10%)', 'hsl(0, 0%, 10%)', 'hsl(0, 0%, 100%)', 4.5);
  let infoFg = ensureForegroundContrast(infoBg, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  infoBg = improveContrastWithForeground(infoBg, infoFg, 4.5);
  infoFg = ensureForegroundContrast(infoBg, infoFg, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const timerCriticalFg = ensureForegroundContrast(destructiveBg, destructiveFg, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5);
  const ringColor = ensureForegroundContrast(base.background, base.ring, fgOnPrimary, getDarkInkColor(base.primary), 3);
  const emptyStateBodyFg = ensureForegroundContrast(base.muted, base.mutedForeground, helperFg, fgDefault, 4.5);
  const chart1 = brandPrimary;
  const chart2 = brandSecondary;
  const chart3 = brandAccent;
  const chart4 = statusTone((primaryComponents.h + 55) % 360, isDark ? 58 : 52, clampNumber(brandSaturation * 0.85, 60, 86));
  const chart5 = statusTone((accentComponents.h + 115) % 360, isDark ? 55 : 49, clampNumber(brandSaturation * 0.8, 58, 84));
  const leaderboardGold = statusTone((brandHue + 36) % 360, isDark ? 58 : 51, 82);
  const leaderboardSilver = neutralTone(isDark ? 74 : 62, -2);
  const leaderboardBronze = statusTone((brandHue + 18) % 360, isDark ? 46 : 40, 68);
  const gameSurfaceHue = Math.round(harmonizeHueLimited(brandHue, brandHue, 0.16, 10));
  const gameSurfaceBase = `hsl(${gameSurfaceHue}, ${isDark ? 18 : 16}%, ${isDark ? 12 : 97}%)`;
  const gameSurfaceMuted = `hsl(${gameSurfaceHue}, ${isDark ? 16 : 14}%, ${isDark ? 18 : 94}%)`;
  
  // Accent tiers for visual emphasis - ensure WCAG contrast
  const accentPrimaryStrong = isDark ? adjustLightness(primaryColor, 10) : adjustLightness(primaryColor, -10);
  const accentSecondaryStrong = isDark ? adjustLightness(secondaryColor, 10) : adjustLightness(secondaryColor, -10);
  const primaryDisabledBg = adjustLightness(primaryColor, isDark ? -18 : 18);
  const secondaryDisabledBg = adjustLightness(secondaryColor, isDark ? -18 : 18);
  
  // Ensure button text has good contrast - use dark ink for light backgrounds
  const btnGhostFg = isDark ? 'hsl(0, 0%, 95%)' : 'hsl(0, 0%, 20%)';
  const btnOutlineFg = isDark ? primaryColor : getDarkInkColor(primaryColor);
  const btnSecondaryFg = ensureForegroundContrast(secondaryColor, base.secondaryForeground, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 12%)', 4.5);
  const sidebarAccentBg = isDark ? adjustLightness(base.card, hoverDelta(isDark)) : base.muted;
  const sidebarAccentFg = ensureForegroundContrast(
    sidebarAccentBg,
    fgOnBackground,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 12%)',
    4.5,
  );
  const primaryHoverBg = improveContrastWithForeground(adjustLightness(primaryColor, hoverDelta(isDark)), fgOnPrimary, 4.5);
  const primaryActiveBg = improveContrastWithForeground(adjustLightness(primaryColor, activeDelta(isDark)), fgOnPrimary, 4.5);
  const secondaryHoverBg = improveContrastWithForeground(adjustLightness(secondaryColor, hoverDelta(isDark)), btnSecondaryFg, 4.5);
  const secondaryActiveBg = improveContrastWithForeground(adjustLightness(secondaryColor, activeDelta(isDark)), btnSecondaryFg, 4.5);
  const accentHoverBg = improveContrastWithForeground(adjustLightness(accentColor, hoverDelta(isDark)), fgOnAccent, 4.5);
  const accentActiveBg = improveContrastWithForeground(adjustLightness(accentColor, activeDelta(isDark)), fgOnAccent, 4.5);
  const rawDangerHoverBg = adjustLightness(destructiveBg, hoverDelta(isDark));
  const rawDangerActiveBg = adjustLightness(destructiveBg, activeDelta(isDark));
  const rawSuccessHoverBg = adjustLightness(successBg, hoverDelta(isDark));
  const rawSuccessActiveBg = adjustLightness(successBg, activeDelta(isDark));
  const rawWarningHoverBg = adjustLightness(warningBg, hoverDelta(isDark));
  const rawWarningActiveBg = adjustLightness(warningBg, activeDelta(isDark));
  let btnDangerFg = ensureForegroundAcross(
    [destructiveBg, rawDangerHoverBg, rawDangerActiveBg],
    destructiveFg,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 10%)',
    4.5
  );
  let btnSuccessFg = ensureForegroundAcross(
    [successBg, rawSuccessHoverBg, rawSuccessActiveBg],
    successFg,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 10%)',
    4.5
  );
  let btnWarningFg = ensureForegroundAcross(
    [warningBg, rawWarningHoverBg, rawWarningActiveBg],
    warningFg,
    'hsl(0, 0%, 10%)',
    'hsl(0, 0%, 100%)',
    4.5
  );
  btnDangerFg = 'hsl(0, 0%, 100%)';
  btnSuccessFg = 'hsl(0, 0%, 100%)';
  const dangerHoverBg = improveContrastWithForeground(rawDangerHoverBg, btnDangerFg, 4.5);
  const dangerActiveBg = improveContrastWithForeground(rawDangerActiveBg, btnDangerFg, 4.5);
  const successHoverBg = improveContrastWithForeground(rawSuccessHoverBg, btnSuccessFg, 4.5);
  const successActiveBg = improveContrastWithForeground(rawSuccessActiveBg, btnSuccessFg, 4.5);
  const warningHoverBg = improveContrastWithForeground(rawWarningHoverBg, btnWarningFg, 4.5);
  const warningActiveBg = improveContrastWithForeground(rawWarningActiveBg, btnWarningFg, 4.5);
  const dangerButtonBg = improveContrastWithForeground(destructiveBg, btnDangerFg, 4.5);
  const successButtonBg = improveContrastWithForeground(successBg, btnSuccessFg, 4.5);
  const warningButtonBg = improveContrastWithForeground(warningBg, btnWarningFg, 4.5);
  const btnWarningDisabledFg = ensureForegroundContrast(
    warningButtonBg,
    mutedFg,
    isDark ? 'hsl(0, 0%, 74%)' : 'hsl(0, 0%, 26%)',
    isDark ? 'hsl(0, 0%, 62%)' : 'hsl(0, 0%, 18%)',
    3.0
  );
  const btnPrimaryDisabledFg = ensureForegroundContrast(primaryDisabledBg, fgOnPrimary, 'hsl(0, 0%, 92%)', 'hsl(0, 0%, 20%)', 2.5);
  const btnSecondaryDisabledFg = ensureForegroundContrast(secondaryDisabledBg, fgOnSecondary, 'hsl(0, 0%, 92%)', 'hsl(0, 0%, 20%)', 2.5);
  const linkFg = ensureForegroundContrast(base.background, primaryColor, fgOnPrimary, getDarkInkColor(primaryColor), 4.5);
  const linkHoverFg = ensureForegroundContrast(base.background, adjustLightness(primaryColor, hoverDelta(isDark)), fgOnPrimary, getDarkInkColor(primaryColor), 4.5);
  const linkVisitedFg = ensureForegroundContrast(
    base.card,
    adjustLightness(brandPrimary, isDark ? -15 : 15),
    linkFg,
    getDarkInkColor(brandPrimary),
    4.5
  );
  const adminSidebarBg = isDark ? base.card : base.muted;
  const sidebarBg = isDark ? base.card : base.background;
  const sidebarPrimaryText = ensureForegroundContrast(adminSidebarBg, brandPrimary, fgOnBackground, fgDefault, 4.5);
  const fgOnSidebarPrimary = ensureForegroundContrast(
    sidebarPrimaryText,
    fgOnPrimary,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 10%)',
    4.5,
  );
  const tabActiveBg = isDark ? withAlpha(primaryColor, 0.15) : withAlpha(primaryColor, 0.1);
  const tabActiveHoverBg = isDark ? withAlpha(primaryColor, 0.2) : withAlpha(primaryColor, 0.15);
  const badgeHoverBg = improveContrastWithForeground(adjustLightness(primaryColor, hoverDelta(isDark)), fgOnPrimary, 4.5);
  const alertInfoBg = isDark ? withAlpha(infoBg, 0.17) : withAlpha(infoBg, 0.12);
  const alertInfoFg = ensureForegroundContrast(
    alertInfoBg,
    isDark ? adjustLightness(infoBg, 12) : adjustLightness(infoBg, -16),
    infoFg,
    getDarkInkColor(infoBg),
    4.5
  );
  const alertSuccessBg = isDark ? withAlpha(successBg, 0.17) : withAlpha(successBg, 0.12);
  const alertSuccessFg = ensureForegroundContrast(
    alertSuccessBg,
    isDark ? adjustLightness(successBg, 12) : adjustLightness(successBg, -16),
    successFg,
    getDarkInkColor(successBg),
    4.5
  );
  const alertWarningBg = isDark ? withAlpha(warningBg, 0.17) : withAlpha(warningBg, 0.12);
  const alertWarningFg = ensureForegroundContrast(
    alertWarningBg,
    isDark ? adjustLightness(warningBg, 10) : adjustLightness(warningBg, -16),
    warningFg,
    getDarkInkColor(warningBg),
    4.5
  );
  const alertErrorBg = isDark ? withAlpha(destructiveBg, 0.17) : withAlpha(destructiveBg, 0.12);
  const alertErrorFg = ensureForegroundContrast(
    alertErrorBg,
    isDark ? adjustLightness(destructiveBg, 12) : adjustLightness(destructiveBg, -16),
    destructiveFg,
    getDarkInkColor(destructiveBg),
    4.5
  );
  const tabActiveFg = ensureForegroundContrast(
    tabActiveBg,
    fgOnBackground,
    fgOnBackground,
    getDarkInkColor(primaryColor),
    4.5
  );
  const heroDemoCardAccentBg = isDark ? withAlpha(brandPrimary, 0.2) : withAlpha(brandPrimary, 0.1);
  const heroDemoCardAccentFg = ensureForegroundContrast(
    heroDemoCardAccentBg,
    isDark ? brandPrimary : adjustLightness(brandPrimary, -15),
    isDark ? neutralTone(96, 2) : getDarkInkColor(brandPrimary),
    isDark ? getDarkInkColor(brandPrimary) : neutralTone(12, 3),
    4.5
  );
  const heroCtaOutlineFg = ensureForegroundContrast(
    base.background,
    primaryColor,
    linkFg,
    getDarkInkColor(primaryColor),
    4.5
  );
  const footerSocialBg = isDark ? withAlpha(base.card, 0.45) : withAlpha(base.background, 0.72);
  const footerSocialFg = ensureForegroundContrast(
    footerSocialBg,
    isDark ? neutralTone(78) : neutralTone(40),
    isDark ? neutralTone(96, 2) : neutralTone(14, 3),
    isDark ? neutralTone(86, 1) : neutralTone(10, 2),
    4.5
  );
  const footerSocialHoverBg = isDark ? withAlpha(brandPrimary, 0.28) : withAlpha(brandPrimary, 0.22);
  const footerSocialHoverFg = ensureForegroundContrast(
    footerSocialHoverBg,
    brandPrimary,
    fgOnPrimary,
    getDarkInkColor(brandPrimary),
    4.5
  );
  const breadcrumbHoverFg = ensureForegroundContrast(
    base.card,
    brandPrimary,
    linkFg,
    getDarkInkColor(brandPrimary),
    4.5
  );
  const stepperCircleCompleteFg = ensureForegroundContrast(
    successBg,
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 100%)',
    'hsl(0, 0%, 10%)',
    4.5
  );
  
  const tokens: Record<string, string> = {
    '--fg-strong': fgStrong,
    '--fg-default': fgDefault,
    '--fg-muted': fgMuted,
    '--fg-subtle': fgSubtle,
    '--fg-on-card': fgOnCard,
    '--fg-on-card-muted': isDark ? neutralTone(70) : neutralTone(44),
    '--fg-on-muted': fgOnMuted,
    '--fg-on-primary': fgOnPrimary,
    '--fg-on-secondary': fgOnSecondary,
    '--fg-on-accent': fgOnAccent,
    '--body-strong': fgDefault,
    '--body-default': isDark ? neutralTone(84, 1) : neutralTone(29, 1),
    '--body-muted': fgMuted,
    '--body-on-card': isDark ? neutralTone(78) : neutralTone(34),
    '--body-on-card-muted': isDark ? neutralTone(64) : neutralTone(49),

    '--primary': primaryColor,
    '--primary-foreground': fgOnPrimary,
    '--secondary': secondaryColor,
    '--secondary-foreground': fgOnSecondary,
    '--accent': accentColor,
    '--accent-foreground': fgOnAccent,
    '--background': base.background,
    '--foreground': fgOnBackground,
    '--card': base.card,
    '--card-foreground': fgOnCard,
    '--muted': base.muted,
    '--muted-foreground': mutedFg,
    '--border': borderUniversal,
    '--ring': ringColor,
    '--popover': base.card,
    '--popover-foreground': fgOnCard,
    '--input': inputBorder,
    '--destructive': destructiveBg,
    '--destructive-foreground': destructiveFg,
    '--success': successBg,
    '--success-foreground': successFg,
    '--warning': warningBg,
    '--warning-foreground': warningFg,

    // Semantic role layer (canonical UI roles)
    '--surface-primary': base.background,
    '--surface-primary-fg': fgOnBackground,
    '--surface-muted': base.muted,
    '--text-primary': fgOnBackground,
    '--text-on-surface': fgOnCard,
    '--text-muted': mutedFg,
    '--stroke-default': borderUniversal,
    '--stroke-subtle': strokeSubtle,
    '--focus-ring': ringColor,
    '--action-primary': primaryColor,
    '--action-primary-fg': fgOnPrimary,
    '--action-secondary': secondaryColor,
    '--action-secondary-fg': fgOnSecondary,
    '--action-accent': accentColor,
    '--action-accent-fg': fgOnAccent,
    '--action-danger': destructiveBg,
    '--action-danger-fg': destructiveFg,

    '--nav-bg': isDark ? withAlpha(base.card, 0.95) : withAlpha('hsl(0, 0%, 100%)', 0.95),
    '--nav-fg': fgOnBackground,
    '--nav-hover': adjustLightness(isDark ? base.card : base.background, hoverDelta(isDark)),
    '--nav-active': primaryColor,
    '--nav-active-fg': fgOnPrimary,
    '--nav-item-active-bg': primaryColor,
    '--nav-item-active-fg': fgOnPrimary,
    '--nav-item-hover-bg': accentColor,
    '--nav-item-hover-fg': fgOnAccent,
    '--nav-item-fg': fgOnBackground,
    '--nav-item-disabled-fg': helperFg,
    '--nav-border': ensureSurfaceBorderContrast(isDark ? base.border : adjustLightness(base.border, -10), isDark ? base.card : base.background, 3),
    '--nav-link': fgOnBackground,
    '--nav-link-hover': linkFg,
    '--nav-link-active': ensureForegroundContrast(base.background, adjustLightness(primaryColor, activeDelta(isDark)), fgOnPrimary, getDarkInkColor(primaryColor), 4.5),
    '--nav-link-focus': primaryColor,
    '--nav-pill-bg': 'transparent',
    '--nav-pill-fg': fgOnBackground,
    '--nav-pill-border': borderOnBackground,
    '--nav-pill-hover-bg': accentColor,
    '--nav-pill-hover-fg': fgOnAccent,
    '--nav-pill-active-bg': primaryColor,
    '--nav-pill-active-fg': fgOnPrimary,
    '--nav-disabled': helperFg,
    '--shell-bg': base.background,
    '--shell-surface': base.card,
    '--shell-glass': withAlpha(base.card, 0.8),
    '--shell-divider': base.border,

    '--btn-primary-bg': primaryColor,
    '--btn-primary-fg': fgOnPrimary,
    '--btn-primary-hover': primaryHoverBg,
    '--btn-primary-active': primaryActiveBg,
    '--btn-primary-focus-ring': withAlpha(primaryColor, 0.5),
    '--btn-focus-ring': withAlpha(primaryColor, 0.5),
    '--btn-primary-disabled-bg': primaryDisabledBg,
    '--btn-primary-disabled-fg': btnPrimaryDisabledFg,
    '--btn-secondary-bg': secondaryColor,
    '--btn-secondary-fg': btnSecondaryFg,
    '--btn-secondary-hover': secondaryHoverBg,
    '--btn-secondary-hover-fg': ensureForegroundContrast(
      secondaryHoverBg,
      btnSecondaryFg,
      fgOnSecondary,
      getDarkInkColor(secondaryHoverBg),
      4.5
    ),
    '--btn-secondary-active': secondaryActiveBg,
    '--btn-secondary-active-fg': ensureForegroundContrast(
      secondaryActiveBg,
      btnSecondaryFg,
      fgOnSecondary,
      getDarkInkColor(secondaryActiveBg),
      4.5
    ),
    '--btn-secondary-focus-ring': withAlpha(secondaryColor, 0.5),
    '--btn-secondary-disabled-bg': secondaryDisabledBg,
    '--btn-secondary-disabled-fg': btnSecondaryDisabledFg,
    '--btn-ghost-bg': 'transparent',
    '--btn-ghost-fg': btnGhostFg,
    '--btn-ghost-hover': isDark ? withAlpha('hsl(0, 0%, 100%)', 0.1) : withAlpha('hsl(0, 0%, 0%)', 0.08),
    '--btn-ghost-active': isDark ? withAlpha('hsl(0, 0%, 100%)', 0.15) : withAlpha('hsl(0, 0%, 0%)', 0.12),
    '--btn-ghost-border': borderOnBackground,
    '--btn-ghost-border-hover': ensureSurfaceBorderContrast(adjustLightness(base.border, hoverDelta(isDark)), base.background, 3),
    '--btn-ghost-disabled-fg': base.mutedForeground,
    '--btn-outline-bg': 'transparent',
    '--btn-outline-fg': btnOutlineFg,
    '--btn-outline-border': isDark ? brandPrimary : accentPrimaryStrong,
    '--btn-outline-hover-bg': withAlpha(brandPrimary, 0.15),
    '--btn-outline-hover-border': adjustLightness(brandPrimary, hoverDelta(isDark)),
    '--btn-outline-active-bg': withAlpha(brandPrimary, 0.25),
    '--btn-danger-bg': dangerButtonBg,
    '--btn-danger-fg': btnDangerFg,
    '--btn-danger-hover': dangerHoverBg,
    '--btn-danger-active': dangerActiveBg,
    '--btn-danger-focus-ring': withAlpha(destructiveBg, 0.5),
    '--btn-danger-disabled-bg': withAlpha(destructiveBg, 0.5),
    '--btn-success-bg': successButtonBg,
    '--btn-success-fg': btnSuccessFg,
    '--btn-success-hover': successHoverBg,
    '--btn-success-active': successActiveBg,
    '--btn-success-focus-ring': withAlpha(successBg, 0.5),
    '--btn-success-disabled-bg': withAlpha(successBg, 0.5),
    '--btn-success-disabled-fg': ensureForegroundContrast(
      withAlpha(successBg, 0.5),
      btnSuccessFg,
      successFg,
      getDarkInkColor(successBg),
      3.0
    ),
    '--btn-warning-bg': warningButtonBg,
    '--btn-warning-fg': btnWarningFg,
    '--btn-warning-disabled-fg': btnWarningDisabledFg,
    '--btn-warning-hover': warningHoverBg,
    '--btn-warning-active': warningActiveBg,
    '--btn-gradient-from': primaryColor,
    '--btn-gradient-to': primaryColor,
    '--btn-gradient-bg': primaryColor,
    '--btn-gradient-fg': ensureForegroundContrast(primaryColor, fgOnPrimary, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 10%)', 4.5),

    '--input-bg': base.card,
    '--input-fg': fgOnCard,
    '--input-placeholder': ensureForegroundContrast(base.card, mutedFg, isDark ? 'hsl(0, 0%, 70%)' : 'hsl(0, 0%, 40%)', isDark ? 'hsl(0, 0%, 55%)' : 'hsl(0, 0%, 30%)', 4.5),
    '--input-border': inputBorder,
    '--input-hover-border': inputHoverBorder,
    '--input-focus': primaryColor,
    '--input-focus-border': ensureSurfaceBorderContrast(primaryColor, base.card, 3),
    '--input-focus-ring': withAlpha(primaryColor, 0.3),
    '--input-disabled-bg': base.muted,
    '--input-disabled-fg': ensureForegroundContrast(base.muted, mutedFg, isDark ? 'hsl(0, 0%, 65%)' : 'hsl(0, 0%, 35%)', isDark ? 'hsl(0, 0%, 50%)' : 'hsl(0, 0%, 25%)', 2.5),
    '--input-disabled-border': borderOnMuted,
    '--input-invalid-border': destructiveBg,
    '--input-invalid-bg': withAlpha(destructiveBg, 0.1),
    '--input-invalid-focus-ring': withAlpha(destructiveBg, 0.3),
    '--input-success-border': successBg,
    '--input-success-bg': withAlpha(successBg, 0.1),
    '--label-fg': fgOnBackground,
    '--helper-fg': helperFg,
    '--checkbox-bg': base.card,
    '--checkbox-border': base.border,
    '--checkbox-hover-border': primaryColor,
    '--checkbox-checked-bg': primaryColor,
    '--checkbox-checked-fg': fgOnPrimary,
    '--checkbox-disabled-bg': base.muted,
    '--radio-bg': base.card,
    '--radio-border': base.border,
    '--radio-hover-border': primaryColor,
    '--radio-checked-bg': primaryColor,
    '--radio-checked-fg': fgOnPrimary,
    '--switch-bg': base.muted,
    '--switch-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--switch-checked-bg': primaryColor,
    '--switch-checked-hover-bg': adjustLightness(primaryColor, hoverDelta(isDark)),
    '--switch-thumb': 'hsl(0, 0%, 100%)',
    '--select-bg': base.card,
    '--select-fg': fgOnCard,
    '--select-border': selectBorder,
    '--select-hover-border': selectHoverBorder,
    '--select-focus-border': primaryColor,
    '--select-option-hover': base.muted,
    '--select-option-selected': withAlpha(primaryColor, 0.15),

    '--card-bg': base.card,
    '--card-fg': fgOnCard,
    '--card-border': borderOnCard,
    '--card-shadow': withAlpha(isDark ? 'hsl(0, 0%, 0%)' : 'hsl(0, 0%, 50%)', 0.1),
    '--card-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--card-hover-border': ensureSurfaceBorderContrast(adjustLightness(base.border, hoverDelta(isDark)), adjustLightness(base.card, hoverDelta(isDark)), 3),
    '--card-hover-shadow': withAlpha(isDark ? 'hsl(0, 0%, 0%)' : 'hsl(0, 0%, 50%)', 0.2),
    '--card-active-bg': adjustLightness(base.card, activeDelta(isDark)),
    '--card-active-border': brandPrimary,
    '--card-selected-bg': withAlpha(brandPrimary, 0.1),
    '--card-selected-border': brandPrimary,
    '--card-disabled-bg': base.muted,
    '--card-disabled-fg': base.mutedForeground,
    '--panel-bg': base.card,
    '--panel-fg': fgOnCard,
    '--panel-border': borderOnCard,
    '--panel-header-bg': base.muted,
    '--panel-header-fg': fgOnBackground,
    '--panel-footer-bg': base.muted,
    '--panel-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),

    '--pill-bg': withAlpha(brandPrimary, 0.15),
    '--pill-fg': isDark ? brandPrimary : getDarkInkColor(brandPrimary),
    '--pill-border': withAlpha(brandPrimary, 0.3),
    '--pill-hover-bg': withAlpha(brandPrimary, 0.25),
    '--pill-hover-border': withAlpha(brandPrimary, 0.5),
    '--pill-active-bg': primaryColor,
    '--pill-active-fg': fgOnPrimary,
    '--pill-active-hover-bg': adjustLightness(brandPrimary, hoverDelta(isDark)),
    '--pill-disabled-bg': base.muted,
    '--pill-disabled-fg': base.mutedForeground,
    '--tag-bg': base.muted,
    '--tag-fg': fgOnBackground,
    '--tag-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--tag-border': borderOnMuted,
    '--badge-bg': primaryColor,
    '--badge-fg': fgOnPrimary,
    '--badge-hover-bg': badgeHoverBg,
    '--badge-hover-fg': ensureForegroundContrast(
      badgeHoverBg,
      fgOnPrimary,
      fgOnBackground,
      getDarkInkColor(badgeHoverBg),
      4.5
    ),
    '--badge-secondary-bg': secondaryColor,
    '--badge-secondary-fg': fgOnSecondary,
    '--badge-outline-bg': 'transparent',
    '--badge-outline-fg': isDark ? primaryColor : getDarkInkColor(primaryColor),
    '--badge-outline-border': primaryColor,
    '--badge-success-bg': successBg,
    '--badge-success-fg': successFg,
    '--badge-warning-bg': warningBg,
    '--badge-warning-fg': warningFg,
    '--badge-danger-bg': destructiveBg,
    '--badge-danger-fg': destructiveFg,
    '--badge-info-bg': infoBg,
    '--badge-info-fg': infoFg,
    '--lesson-artifact-source-db-bg': infoBg,
    '--lesson-artifact-source-db-fg': infoFg,
    '--lesson-artifact-source-db-border': infoBg,
    '--lesson-artifact-objectives-bg': successBg,
    '--lesson-artifact-objectives-fg': successFg,
    '--lesson-artifact-objectives-border': successBg,
    '--lesson-artifact-digest-bg': warningBg,
    '--lesson-artifact-digest-fg': warningFg,
    '--lesson-artifact-digest-border': warningBg,

    '--tab-bg': 'transparent',
    '--tab-fg': fgOnBackground,
    '--tab-hover-bg': withAlpha(base.muted, 0.5),
    '--tab-hover-fg': base.foreground,
    '--tab-active-bg': tabActiveBg,
    '--tab-active-fg': tabActiveFg,
    '--tab-active-hover-bg': tabActiveHoverBg,
    '--tab-focus-ring': withAlpha(primaryColor, 0.5),
    '--tab-disabled-fg': fgMuted,
    '--tab-border': borderOnCard,
    '--tab-indicator': primaryColor,

    '--table-header-bg': base.muted,
    '--table-header-fg': fgOnBackground,
    '--table-header-border': ensureSurfaceBorderContrast(base.border, base.muted, 3),
    '--table-header-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--table-row-bg': base.card,
    '--table-row-fg': fgOnCard,
    '--table-row-alt-bg': base.muted,
    '--table-row-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--table-row-hover-border': adjustLightness(base.border, hoverDelta(isDark)),
    '--table-row-selected-bg': withAlpha(primaryColor, 0.15),
    '--table-row-selected-fg': isDark ? fgOnBackground : getDarkInkColor(primaryColor),
    '--table-row-active-bg': withAlpha(primaryColor, 0.2),
    '--table-cell-border': ensureSurfaceBorderContrast(base.border, base.card, 3),
    '--table-sort-icon': helperFg,
    '--table-sort-icon-active': primaryColor,

    '--metric-number': fgOnBackground,
    '--metric-label': helperFg,
    '--chart-1': chart1,
    '--chart-2': chart2,
    '--chart-3': chart3,
    '--chart-4': chart4,
    '--chart-5': chart5,
    '--chart-grid': ensureSurfaceBorderContrast(base.border, base.background, 3),
    '--chart-axis': helperFg,

    '--modal-overlay': withAlpha('hsl(0, 0%, 0%)', 0.6),
    '--modal-bg': base.card,
    '--modal-fg': fgOnCard,
    '--modal-border': ensureSurfaceBorderContrast(base.border, base.card, 3),
    '--toast-bg': base.card,
    '--toast-fg': fgOnCard,
    '--toast-border': ensureSurfaceBorderContrast(base.border, base.card, 3),

    '--hero-bg': base.background,
    '--hero-bg-gradient-from': base.background,
    '--hero-bg-gradient-via': base.background,
    '--hero-bg-gradient-to': base.background,
    '--hero-headline-from': primaryColor,
    '--hero-headline-via': primaryColor,
    '--hero-headline-to': primaryColor,
    '--hero-badge-bg': isDark ? withAlpha(brandPrimary, 0.2) : withAlpha(brandPrimary, 0.15),
    '--hero-badge-fg': isDark ? 'hsl(0, 0%, 100%)' : getDarkInkColor(brandPrimary),
    '--hero-badge-border': withAlpha(brandPrimary, 0.4),
    '--hero-badge-hover-bg': withAlpha(brandPrimary, 0.3),
    '--hero-audience-pill-bg': isDark ? withAlpha(primaryColor, 0.3) : primaryColor,
    '--hero-audience-pill-fg': fgOnPrimary,
    '--hero-audience-pill-border': isDark ? withAlpha(primaryColor, 0.5) : primaryColor,
    '--hero-demo-card-bg': isDark ? withAlpha(base.card, 0.9) : 'hsl(0, 0%, 100%)',
    '--hero-demo-card-fg': isDark ? 'hsl(0, 0%, 100%)' : 'hsl(0, 0%, 15%)',
    '--hero-demo-card-border': isDark ? withAlpha(brandPrimary, 0.3) : base.border,
    '--hero-demo-card-muted': isDark ? neutralTone(70) : neutralTone(45),
    '--hero-demo-card-accent-bg': heroDemoCardAccentBg,
    '--hero-demo-card-accent-fg': heroDemoCardAccentFg,
    '--hero-demo-card-accent-border': isDark ? brandPrimary : adjustLightness(brandPrimary, -5),
    '--hero-cta-primary-bg': primaryColor,
    '--hero-cta-primary-fg': fgOnPrimary,
    '--hero-cta-primary-hover': primaryHoverBg,
    '--hero-cta-primary-active': primaryActiveBg,
    '--hero-cta-primary-focus-ring': withAlpha(primaryColor, 0.5),
    '--hero-cta-secondary-bg': accentColor,
    '--hero-cta-secondary-fg': fgOnAccent,
    '--hero-cta-secondary-hover': accentHoverBg,
    '--hero-cta-secondary-active': accentActiveBg,
    '--hero-cta-secondary-focus-ring': withAlpha(accentColor, 0.5),
    '--hero-cta-outline-bg': 'transparent',
    '--hero-cta-outline-fg': heroCtaOutlineFg,
    '--hero-cta-outline-border': primaryColor,
    '--hero-cta-outline-hover-bg': withAlpha(primaryColor, 0.1),
    '--hero-cta-outline-hover-border': adjustLightness(primaryColor, hoverDelta(isDark)),
    '--hero-indicator-active-bg': primaryColor,
    '--hero-indicator-rest-bg': withAlpha('hsl(0, 0%, 100%)', 0.3),
    '--hero-indicator-hover-bg': withAlpha('hsl(0, 0%, 100%)', 0.5),
    '--hero-glow': base.gameGlow,
    '--hero-glow-secondary': withAlpha(brandPrimary, 0.3),

    '--section-bg': base.background,
    '--section-alt-bg': base.muted,
    '--section-heading': fgOnBackground,
    '--section-subheading': isDark ? neutralTone(70) : neutralTone(40),
    '--section-body': isDark ? neutralTone(80) : neutralTone(35),
    '--section-muted': isDark ? neutralTone(65) : neutralTone(45),
    '--section-strong': fgOnBackground,
    '--feature-card-bg': isDark ? base.card : 'hsl(0, 0%, 100%)',
    '--feature-card-fg': isDark ? neutralTone(97, 2) : neutralTone(14, 3),
    '--feature-card-title': isDark ? neutralTone(97, 2) : neutralTone(14, 3),
    '--feature-card-body': isDark ? neutralTone(75) : neutralTone(35),
    '--feature-card-muted': isDark ? neutralTone(60) : neutralTone(50),
    '--feature-card-border': isDark ? base.border : 'hsl(0, 0%, 88%)',
    '--feature-card-hover-bg': isDark ? adjustLightness(base.card, hoverDelta(isDark)) : 'hsl(0, 0%, 98%)',
    '--feature-card-hover-border': isDark ? adjustLightness(base.border, hoverDelta(isDark)) : 'hsl(0, 0%, 80%)',
    '--feature-card-icon-bg': primaryColor,
    '--feature-card-icon-fg': fgOnPrimary,
    '--feature-card-icon-hover-bg': adjustLightness(primaryColor, hoverDelta(isDark)),
    '--glass-card-bg': isDark ? withAlpha(base.card, 0.15) : withAlpha('hsl(0, 0%, 100%)', 0.9),
    '--glass-card-fg': isDark ? neutralTone(97, 2) : neutralTone(14, 3),
    '--glass-card-title': isDark ? neutralTone(97, 2) : neutralTone(14, 3),
    '--glass-card-body': isDark ? neutralTone(75) : neutralTone(35),
    '--glass-card-muted': isDark ? neutralTone(60) : neutralTone(50),
    '--glass-card-border': isDark ? withAlpha('hsl(0, 0%, 100%)', 0.2) : 'hsl(0, 0%, 88%)',
    '--glass-card-hover-border': isDark ? withAlpha('hsl(0, 0%, 100%)', 0.4) : 'hsl(0, 0%, 75%)',
    '--step-card-bg': isDark ? withAlpha(base.card, 0.15) : withAlpha('hsl(0, 0%, 100%)', 0.9),
    '--step-card-fg': isDark ? neutralTone(97, 2) : neutralTone(14, 3),
    '--step-card-title': isDark ? neutralTone(97, 2) : neutralTone(14, 3),
    '--step-card-body': isDark ? neutralTone(75) : neutralTone(35),
    '--step-card-border': isDark ? withAlpha('hsl(0, 0%, 100%)', 0.2) : 'hsl(0, 0%, 88%)',
    '--cta-bg': primaryColor,
    '--cta-fg': fgOnPrimary,
    '--cta-hover': primaryHoverBg,
    '--cta-active': primaryActiveBg,
    '--cta-focus-ring': withAlpha(primaryColor, 0.5),
    '--cta-gradient-from': primaryColor,
    '--cta-gradient-to': primaryColor,
    '--cta-gradient-from-hover': primaryHoverBg,
    '--cta-gradient-to-hover': primaryHoverBg,
    '--testimonial-bg': base.card,
    '--testimonial-fg': base.cardForeground,
    '--testimonial-quote': brandPrimary,
    '--testimonial-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--pricing-card-bg': base.card,
    '--pricing-card-fg': base.cardForeground,
    '--pricing-card-border': base.border,
    '--pricing-card-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--pricing-card-hover-border': adjustLightness(base.border, hoverDelta(isDark)),
    '--pricing-card-featured-bg': withAlpha(brandPrimary, 0.1),
    '--pricing-card-featured-border': brandPrimary,
    '--pricing-card-featured-hover-bg': withAlpha(brandPrimary, 0.15),

    '--auth-bg': base.background,
    '--auth-fg': fgOnBackground,
    '--auth-form-bg': base.card,
    '--auth-form-border': base.border,
    '--auth-form-shadow': withAlpha(isDark ? 'hsl(0, 0%, 0%)' : 'hsl(0, 0%, 50%)', 0.15),
    '--auth-cta-bg': primaryColor,
    '--auth-cta-fg': fgOnPrimary,
    '--auth-cta-hover': primaryHoverBg,

    '--stat-card-bg': base.card,
    '--stat-card-fg': fgOnCard,
    '--stat-card-border': base.border,
    '--stat-card-accent': primaryColor,
    '--activity-item-bg': base.card,
    '--activity-item-fg': fgOnCard,
    '--quick-action-bg': base.muted,
    '--quick-action-fg': fgOnBackground,
    '--quick-action-hover': adjustLightness(base.muted, isDark ? 10 : -5),

    '--course-card-bg': base.card,
    '--course-card-fg': fgOnCard,
    '--course-card-border': base.border,
    '--course-card-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--course-card-hover-border': adjustLightness(base.border, hoverDelta(isDark)),
    '--course-card-hover-shadow': withAlpha(isDark ? 'hsl(0, 0%, 0%)' : 'hsl(0, 0%, 50%)', 0.2),
    '--course-card-badge-bg': primaryColor,
    '--course-card-badge-fg': fgOnPrimary,
    '--course-card-badge-hover-bg': badgeHoverBg,
    '--filter-pill-bg': base.muted,
    '--filter-pill-fg': fgOnBackground,
    '--filter-pill-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--filter-pill-active-bg': primaryColor,
    '--filter-pill-active-fg': fgOnPrimary,
    '--filter-pill-active-hover-bg': adjustLightness(primaryColor, hoverDelta(isDark)),
    '--filter-pill-disabled-bg': base.muted,
    '--search-bg': base.card,
    '--search-fg': fgOnCard,
    '--search-border': borderOnCard,
    '--search-hover-border': ensureSurfaceBorderContrast(adjustLightness(base.border, hoverDelta(isDark)), base.card, 3),
    '--search-focus-border': primaryColor,
    '--search-focus-ring': withAlpha(primaryColor, 0.3),
    '--pagination-bg': base.muted,
    '--pagination-fg': fgOnBackground,
    '--pagination-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--pagination-active-bg': primaryColor,
    '--pagination-active-fg': fgOnPrimary,
    '--pagination-active-hover-bg': adjustLightness(brandPrimary, hoverDelta(isDark)),
    '--pagination-disabled-bg': base.muted,
    '--pagination-disabled-fg': base.mutedForeground,

    '--lesson-surface': base.card,
    '--lesson-nav-bg': base.muted,
    '--lesson-nav-fg': base.foreground,
    '--lesson-nav-active': brandPrimary,
    '--progress-bar-bg': base.muted,
    '--progress-bar-fill': brandPrimary,
    '--code-block-bg': isDark ? adjustLightness(base.card, -5) : adjustLightness(base.muted, -5),
    '--code-block-fg': base.foreground,

    '--quiz-lobby-bg': base.background,
    '--quiz-lobby-fg': base.foreground,
    '--question-card-bg': base.card,
    '--question-card-fg': base.cardForeground,
    '--question-card-border': borderOnCard,
    '--answer-option-bg': base.card,
    '--answer-option-fg': base.foreground,
    '--answer-option-border': borderOnCard,
    '--answer-option-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--answer-option-hover-border': ensureSurfaceBorderContrast(adjustLightness(base.border, hoverDelta(isDark)), adjustLightness(base.card, hoverDelta(isDark)), 3),
    '--answer-option-selected-bg': withAlpha(brandPrimary, 0.2),
    '--answer-option-selected-fg': isDark ? brandPrimary : getDarkInkColor(brandPrimary),
    '--answer-option-selected-border': brandPrimary,
    '--answer-option-correct-bg': withAlpha(successBg, 0.2),
    '--answer-option-correct-fg': ensureForegroundContrast(withAlpha(successBg, 0.2), successBg, successFg, fgDefault, 4.5),
    '--answer-option-correct-border': successBg,
    '--answer-option-incorrect-bg': withAlpha(destructiveBg, 0.2),
    '--answer-option-incorrect-fg': ensureForegroundContrast(withAlpha(destructiveBg, 0.2), destructiveBg, destructiveFg, fgDefault, 4.5),
    '--answer-option-incorrect-border': destructiveBg,
    '--answer-option-disabled-bg': base.muted,
    '--answer-option-disabled-fg': base.mutedForeground,
    '--timer-bg': base.muted,
    '--timer-fg': base.foreground,
    '--timer-warning': warningBg,
    '--timer-critical': destructiveBg,
    '--timer-critical-foreground': timerCriticalFg,
    '--leaderboard-row-bg': base.card,
    '--leaderboard-row-alt-bg': base.muted,
    '--leaderboard-row-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--leaderboard-row-highlight-bg': withAlpha(brandPrimary, 0.15),
    '--leaderboard-gold': leaderboardGold,
    '--leaderboard-silver': leaderboardSilver,
    '--leaderboard-bronze': leaderboardBronze,

    '--arena-bg': isDark ? 'hsl(0, 0%, 5%)' : base.background,
    '--arena-surface': base.card,
    '--game-card-face-bg': base.card,
    '--game-card-face-fg': base.cardForeground,
    '--game-card-face-border': base.border,
    '--energy-bar-bg': base.muted,
    '--energy-bar-fill': brandPrimary,
    '--score-badge-bg': brandAccent,
    '--score-badge-fg': fgOnAccent,
    '--effect-glow': base.gameGlow,

    '--admin-sidebar-bg': adminSidebarBg,
    '--admin-sidebar-fg': base.foreground,
    '--admin-sidebar-item-hover-bg': adjustLightness(adminSidebarBg, hoverDelta(isDark)),
    '--admin-sidebar-active-bg': primaryColor,
    '--admin-sidebar-active-fg': fgOnPrimary,
    '--admin-sidebar-active-hover-bg': adjustLightness(brandPrimary, hoverDelta(isDark)),
    '--admin-header-bg': base.card,
    '--admin-header-fg': base.foreground,
    '--admin-table-header-bg': base.muted,
    '--admin-table-header-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--admin-table-row-bg': base.card,
    '--admin-table-row-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--admin-table-row-selected-bg': withAlpha(brandPrimary, 0.15),
    '--breadcrumb-fg': helperFg,
    '--breadcrumb-active-fg': base.foreground,
    '--breadcrumb-hover-fg': breadcrumbHoverFg,
    '--breadcrumb-separator-fg': helperFg,

    '--profile-card-bg': base.card,
    '--profile-card-fg': base.cardForeground,
    '--profile-card-border': base.border,
    '--pref-toggle-on': brandPrimary,
    '--pref-toggle-off': base.muted,

    '--cert-bg': 'hsl(0, 0%, 100%)',
    '--cert-border': brandPrimary,
    '--cert-title': brandPrimary,
    '--cert-body': 'hsl(0, 0%, 20%)',
    '--cert-accent': brandAccent,

    '--footer-bg': isDark ? neutralTone(6, -2) : neutralTone(12, 2),
    '--footer-fg': isDark ? neutralTone(88) : neutralTone(91),
    '--footer-heading': isDark ? neutralTone(95, 2) : neutralTone(96, 2),
    '--footer-link': isDark ? neutralTone(68) : neutralTone(72),
    '--footer-link-hover': brandPrimary,
    '--footer-link-active': adjustLightness(brandPrimary, activeDelta(isDark)),
    '--footer-border': isDark ? base.border : neutralTone(22, 1),
    '--footer-social-bg': footerSocialBg,
    '--footer-social-fg': footerSocialFg,
    '--footer-social-hover-bg': footerSocialHoverBg,
    '--footer-social-hover-fg': footerSocialHoverFg,
    '--email-header-bg': base.card,

    '--gradient-primary-from': primaryColor,
    '--gradient-primary-to': primaryColor,
    '--gradient-accent-from': brandAccent,
    '--gradient-accent-to': brandAccent,

    '--game-primary': base.gamePrimary,
    '--game-gold': brandAccent,
    '--game-gold-light': adjustLightness(brandAccent, 15),
    '--game-glow': base.gameGlow,
    '--game-success': successBg,
    '--game-xp': brandPrimary,
    '--game-particle': brandAccent,

    '--sidebar-background': sidebarBg,
    '--sidebar-bg': sidebarBg,
    '--sidebar-foreground': base.foreground,
    '--sidebar-fg': base.foreground,
    '--sidebar-primary': sidebarPrimaryText,
    '--sidebar-primary-foreground': fgOnSidebarPrimary,
    '--sidebar-accent': sidebarAccentBg,
    '--sidebar-accent-foreground': sidebarAccentFg,
    '--sidebar-border': base.border,
    '--sidebar-ring': base.ring,
    '--sidebar-item-hover-bg': adjustLightness(sidebarBg, hoverDelta(isDark)),
    '--sidebar-item-hover-fg': fgOnBackground,
    '--sidebar-item-active-bg': primaryColor,
    '--sidebar-item-active-fg': fgOnPrimary,
    '--sidebar-item-fg': fgOnBackground,
    '--sidebar-item-disabled-fg': helperFg,

    '--link-fg': linkFg,
    '--info': infoBg,
    '--info-foreground': infoFg,
    '--link-hover-fg': linkHoverFg,
    '--link-active-fg': ensureForegroundContrast(base.background, adjustLightness(brandPrimary, activeDelta(isDark)), fgOnPrimary, getDarkInkColor(brandPrimary), 4.5),
    '--link-visited-fg': linkVisitedFg,
    '--link-muted-fg': ensureForegroundContrast(base.background, helperFg, fgMuted, fgDefault, 4.5),
    '--link-focus-ring': withAlpha(primaryColor, 0.45),
    '--link-underline': withAlpha(brandPrimary, 0.5),
    '--link-hover-underline': brandPrimary,
    '--text-selection-bg': withAlpha(brandPrimary, 0.3),
    '--text-selection-fg': base.foreground,
    '--text-highlight-bg': withAlpha(brandAccent, 0.3),
    '--text-highlight-fg': base.foreground,

    '--tooltip-bg': isDark ? neutralTone(93, 1) : neutralTone(14, 2),
    '--tooltip-fg': isDark ? neutralTone(12, 2) : neutralTone(94, 1),
    '--tooltip-border': isDark ? neutralTone(82) : neutralTone(26),
    '--popover-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--dropdown-bg': base.card,
    '--dropdown-fg': base.cardForeground,
    '--dropdown-border': borderOnCard,
    '--dropdown-item-hover-bg': base.muted,
    '--dropdown-item-hover-fg': base.foreground,
    '--dropdown-item-active-bg': withAlpha(brandPrimary, 0.15),
    '--dropdown-item-active-fg': isDark ? brandPrimary : getDarkInkColor(brandPrimary),
    '--dropdown-separator': borderOnCard,

    '--skeleton-bg': base.muted,
    '--skeleton-highlight': adjustLightness(base.muted, isDark ? 10 : -10),
    '--spinner-track': base.muted,
    '--spinner-fill': brandPrimary,
    '--loading-overlay': withAlpha(base.background, 0.8),

    '--on-primary': fgOnPrimary,
    '--on-secondary': fgOnSecondary,
    '--on-accent': fgOnAccent,
    '--on-muted': getContrastingForeground(base.muted, 'hsl(0, 0%, 95%)', 'hsl(0, 0%, 15%)'),
    '--on-card': getContrastingForeground(base.card, 'hsl(0, 0%, 95%)', 'hsl(0, 0%, 15%)'),
    '--on-background': fgOnBackground,
    '--on-success': successFg,
    '--on-warning': warningFg,
    '--on-danger': destructiveFg,

    // Surface tier tokens for visual hierarchy
    '--surface-base': surfaceBase,
    '--surface-raised': surfaceRaised,
    '--surface-overlay': surfaceOverlay,
    '--surface-inverse': isDark ? 'hsl(0, 0%, 95%)' : 'hsl(0, 0%, 10%)',
    
    // Accent tier tokens
    '--accent-primary-strong': accentPrimaryStrong,
    '--accent-secondary-strong': accentSecondaryStrong,
    '--accent-tertiary': brandAccent,
    '--accent-tertiary-strong': isDark ? adjustLightness(brandAccent, 10) : adjustLightness(brandAccent, -10),
    
    // State halo tokens for selection and interactive feedback
    '--state-halo-info': withAlpha(infoBg, 0.3),
    '--state-halo-success': withAlpha(successBg, 0.3),
    '--state-halo-warning': withAlpha(warningBg, 0.3),
    '--state-halo-danger': withAlpha(destructiveBg, 0.3),
    '--state-halo-active': withAlpha(brandPrimary, 0.4),
    '--state-halo-paired': withAlpha(successBg, 0.5),
    '--celebration-from': chart3,
    '--celebration-to': chart3,
    '--celebration-glow': withAlpha(warningBg, 0.6),
    
    // Game surface tokens
    '--game-surface-base': gameSurfaceBase,
    '--game-surface-highlight': isDark ? withAlpha(brandPrimary, 0.2) : withAlpha(brandPrimary, 0.1),
    '--game-surface-muted': gameSurfaceMuted,
    '--game-surface-success': isDark ? withAlpha(successBg, 0.2) : withAlpha(successBg, 0.15),
    '--game-surface-error': isDark ? withAlpha(destructiveBg, 0.2) : withAlpha(destructiveBg, 0.15),
    
    // Stats tokens for celebration/result displays
    '--stats-surface-base': base.card,
    '--stats-surface-emphasis': isDark ? withAlpha(brandPrimary, 0.15) : withAlpha(brandPrimary, 0.1),
    '--stats-text-muted': helperFg,
    '--stats-icon-accent': brandPrimary,
    '--stats-number': base.foreground,
    '--stats-label': helperFg,

    '--scrollbar-track': base.muted,
    '--scrollbar-thumb': base.mutedForeground,
    '--scrollbar-thumb-hover': adjustLightness(base.mutedForeground, hoverDelta(isDark)),

    '--accordion-bg': base.card,
    '--accordion-fg': base.cardForeground,
    '--accordion-border': base.border,
    '--accordion-trigger-hover-bg': adjustLightness(base.card, hoverDelta(isDark)),
    '--accordion-content-bg': base.card,
    '--accordion-icon': base.mutedForeground,
    '--accordion-icon-hover': base.foreground,

    '--slider-track': base.muted,
    '--slider-range': brandPrimary,
    '--slider-thumb': brandPrimary,
    '--slider-thumb-border': base.primaryForeground,
    '--slider-thumb-hover': adjustLightness(brandPrimary, hoverDelta(isDark)),
    '--slider-focus-ring': withAlpha(brandPrimary, 0.5),

    '--alert-info-bg': alertInfoBg,
    '--alert-info-fg': alertInfoFg,
    '--alert-info-border': isDark ? adjustLightness(infoBg, -10) : adjustLightness(infoBg, 8),
    '--alert-info-icon': infoBg,
    '--alert-success-bg': alertSuccessBg,
    '--alert-success-fg': alertSuccessFg,
    '--alert-success-border': isDark ? adjustLightness(successBg, -10) : adjustLightness(successBg, 8),
    '--alert-success-icon': successBg,
    '--alert-warning-bg': alertWarningBg,
    '--alert-warning-fg': alertWarningFg,
    '--alert-warning-border': isDark ? adjustLightness(warningBg, -10) : adjustLightness(warningBg, 8),
    '--alert-warning-icon': warningBg,
    '--alert-error-bg': alertErrorBg,
    '--alert-error-fg': alertErrorFg,
    '--alert-error-border': isDark ? adjustLightness(destructiveBg, -10) : adjustLightness(destructiveBg, 8),
    '--alert-error-icon': destructiveBg,

    '--toast-default-bg': base.card,
    '--toast-default-fg': base.cardForeground,
    '--toast-default-border': base.border,
    '--toast-success-bg': isDark ? withAlpha(successBg, 0.2) : withAlpha(successBg, 0.12),
    '--toast-success-fg': isDark ? adjustLightness(successBg, 10) : adjustLightness(successBg, -16),
    '--toast-success-border': isDark ? adjustLightness(successBg, -10) : adjustLightness(successBg, 6),
    '--toast-error-bg': isDark ? withAlpha(destructiveBg, 0.2) : withAlpha(destructiveBg, 0.12),
    '--toast-error-fg': isDark ? adjustLightness(destructiveBg, 10) : adjustLightness(destructiveBg, -16),
    '--toast-error-border': isDark ? adjustLightness(destructiveBg, -10) : adjustLightness(destructiveBg, 6),

    '--progress-bg': base.muted,
    '--progress-fill': brandPrimary,
    '--progress-fill-fg': fgOnPrimary,
    '--progress-success-fill': successBg,
    '--progress-warning-fill': warningBg,
    '--progress-error-fill': destructiveBg,
    '--progress-label': fgOnMuted,

    '--chip-bg': base.muted,
    '--chip-fg': base.foreground,
    '--chip-border': base.border,
    '--chip-hover-bg': adjustLightness(base.muted, hoverDelta(isDark)),
    '--chip-remove-hover': destructiveBg,
    '--chip-primary-bg': withAlpha(brandPrimary, 0.15),
    '--chip-primary-fg': isDark ? brandPrimary : getDarkInkColor(brandPrimary),
    '--chip-primary-border': withAlpha(brandPrimary, 0.3),

    '--stepper-line': base.border,
    '--stepper-line-active': brandPrimary,
    '--stepper-circle-bg': base.muted,
    '--stepper-circle-fg': helperFg,
    '--stepper-circle-active-bg': brandPrimary,
    '--stepper-circle-active-fg': fgOnPrimary,
    '--stepper-circle-complete-bg': successBg,
    '--stepper-circle-complete-fg': stepperCircleCompleteFg,
    '--stepper-label': helperFg,
    '--stepper-label-active': fgOnBackground,

    '--empty-state-bg': base.muted,
    '--empty-state-fg': helperFg,
    '--empty-state-icon': helperFg,
    '--empty-state-heading': base.foreground,
    '--empty-state-body': emptyStateBodyFg,

    '--avatar-bg': base.muted,
    '--avatar-fg': base.foreground,
    '--avatar-border': base.border,
    '--avatar-ring': brandPrimary,
    '--avatar-status-online': successBg,
    '--avatar-status-offline': helperFg,
    '--avatar-status-busy': destructiveBg,
    '--avatar-status-away': warningBg,
  };

  return tokens as Record<TokenKey, string>;
}
