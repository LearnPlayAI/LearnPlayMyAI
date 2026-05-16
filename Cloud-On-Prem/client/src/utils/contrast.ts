import { THEME_COMPONENT_CONTRACTS } from '@shared/themeComponentContracts';
import {
  applyThemeContrastGuard,
  auditThemeContrast,
} from '@shared/themeContrastGuard';

export interface ContrastResult {
  ratio: number;
  aa: boolean;
  aaLarge: boolean;
  aaa: boolean;
  aaaLarge: boolean;
}

export interface ContrastWarning {
  pair: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  level: 'error' | 'warning';
}

type ContrastPairLike = {
  fg: string;
  bg: string;
  required?: number;
};

function dedupeContrastPairs<T extends ContrastPairLike>(pairs: T[]): T[] {
  const merged = new Map<string, T>();
  for (const pair of pairs) {
    const key = `${pair.fg}|${pair.bg}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, pair);
      continue;
    }
    const existingRequired = existing.required ?? 0;
    const nextRequired = pair.required ?? 0;
    if (nextRequired > existingRequired) {
      merged.set(key, pair);
    }
  }
  return Array.from(merged.values());
}

function parseHSL(hslString: string): { h: number; s: number; l: number } | null {
  const normalized = hslString.trim();

  // Supports:
  // - hsl(210, 50%, 40%)
  // - hsla(210, 50%, 40%, 0.5)
  // - hsl(210 50% 40%)
  // - hsl(210 50% 40% / 0.5)
  // - hue units: deg|rad|grad|turn
  const hslMatch = normalized.match(
    /^hsla?\(\s*([0-9.]+)(deg|rad|grad|turn)?\s*(?:,\s*|\s+)([0-9.]+)%\s*(?:,\s*|\s+)([0-9.]+)%(?:\s*(?:\/|,)\s*([0-9.]+%?))?\s*\)$/i
  );
  if (hslMatch) {
    const rawHue = parseFloat(hslMatch[1]);
    const unit = (hslMatch[2] || "deg").toLowerCase();
    let hue = rawHue;
    if (unit === "rad") hue = (rawHue * 180) / Math.PI;
    if (unit === "grad") hue = rawHue * 0.9;
    if (unit === "turn") hue = rawHue * 360;
    hue = ((hue % 360) + 360) % 360;
    return {
      h: hue,
      s: parseFloat(hslMatch[3]),
      l: parseFloat(hslMatch[4]),
    };
  }
  
  const rawMatch = normalized.match(/([0-9.]+)\s*,?\s*([0-9.]+)%?\s*,?\s*([0-9.]+)%?/);
  if (rawMatch) {
    return {
      h: parseFloat(rawMatch[1]),
      s: parseFloat(rawMatch[2]),
      l: parseFloat(rawMatch[3]),
    };
  }
  
  return null;
}

function hslToRGB(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
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

function parseRGBString(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(
    /^rgba?\(\s*([0-9.]+%?)\s*(?:,\s*|\s+)([0-9.]+%?)\s*(?:,\s*|\s+)([0-9.]+%?)(?:\s*(?:\/|,)\s*([0-9.]+%?))?\s*\)$/i
  );
  if (match) {
    const toChannel = (value: string) => {
      if (value.endsWith("%")) {
        const pct = Math.max(0, Math.min(100, parseFloat(value)));
        return Math.round((pct / 100) * 255);
      }
      return Math.max(0, Math.min(255, Math.round(parseFloat(value))));
    };
    return {
      r: toChannel(match[1]),
      g: toChannel(match[2]),
      b: toChannel(match[3]),
    };
  }
  return null;
}

const NAMED_COLORS: Record<string, { r: number; g: number; b: number }> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 165, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
  pink: { r: 255, g: 192, b: 203 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
  transparent: { r: 255, g: 255, b: 255 }, // best-effort fallback for contrast estimation
};

function parseNamedColor(color: string): { r: number; g: number; b: number } | null {
  const key = color.trim().toLowerCase();
  return NAMED_COLORS[key] || null;
}

function parseColorViaBrowser(color: string): { r: number; g: number; b: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = color;
    if (!probe.style.color) return null;
    return parseRGBString(probe.style.color);
  } catch {
    return null;
  }
}

export function colorToRGB(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  
  if (trimmed.startsWith('#')) {
    return parseHexToRGB(trimmed);
  }
  
  if (trimmed.startsWith('hsl')) {
    const hsl = parseHSL(trimmed);
    if (hsl) {
      return hslToRGB(hsl.h, hsl.s, hsl.l);
    }
  }
  
  if (trimmed.startsWith('rgb')) {
    return parseRGBString(trimmed);
  }

  const named = parseNamedColor(trimmed);
  if (named) {
    return named;
  }
  
  const hsl = parseHSL(trimmed);
  if (hsl) {
    return hslToRGB(hsl.h, hsl.s, hsl.l);
  }
  
  return parseColorViaBrowser(trimmed);
}

function resolveTokenReference(value: string, tokens: Record<string, string>, depth = 0): string {
  if (!value || depth > 10) return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('var(')) return trimmed;

  const match = trimmed.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (!match) return trimmed;

  const refKey = match[1];
  const fallback = match[2]?.trim();
  const resolved = tokens[refKey];
  if (resolved) {
    return resolveTokenReference(resolved, tokens, depth + 1);
  }
  return fallback ? resolveTokenReference(fallback, tokens, depth + 1) : trimmed;
}

function isResolvableColor(value: string): boolean {
  return !!colorToRGB(value);
}

function getResolvedPair(
  fgRaw: string,
  bgRaw: string,
  tokens: Record<string, string>
): { fg: string; bg: string; canCompare: boolean } {
  const fg = resolveTokenReference(fgRaw, tokens);
  const bg = resolveTokenReference(bgRaw, tokens);
  const canCompare = isResolvableColor(fg) && isResolvableColor(bg);
  return { fg, bg, canCompare };
}

export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = colorToRGB(color1);
  const rgb2 = colorToRGB(color2);
  
  if (!rgb1 || !rgb2) {
    return 1;
  }
  
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWCAG(ratio: number, level: 'AA' | 'AAA', isLargeText: boolean = false): boolean {
  if (level === 'AA') {
    return isLargeText ? ratio >= 3 : ratio >= 4.5;
  }
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

export function checkContrast(foreground: string, background: string): ContrastResult {
  const ratio = getContrastRatio(foreground, background);
  
  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

export function getContrastWarnings(tokens: Record<string, string>): ContrastWarning[] {
  return auditThemeContrast(tokens).map((issue) => {
    const fgRaw = tokens[issue.fgToken] || '';
    const bgRaw = tokens[issue.bgToken] || '';
    const foreground = resolveTokenReference(fgRaw, tokens);
    const background = resolveTokenReference(bgRaw, tokens);
    return {
      pair: issue.pair,
      foreground,
      background,
      ratio: issue.ratio,
      required: issue.required,
      level: issue.level,
    };
  });
}

export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

export function getContrastGrade(ratio: number): 'fail' | 'aa-large' | 'aa' | 'aaa' {
  if (ratio >= 7) return 'aaa';
  if (ratio >= 4.5) return 'aa';
  if (ratio >= 3) return 'aa-large';
  return 'fail';
}

export function getContrastColor(grade: ReturnType<typeof getContrastGrade>): string {
  switch (grade) {
    case 'aaa': return 'hsl(142, 76%, 36%)';
    case 'aa': return 'hsl(142, 76%, 36%)';
    case 'aa-large': return 'hsl(45, 93%, 47%)';
    case 'fail': return 'hsl(0, 84%, 60%)';
  }
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function rgbToHSL(r: number, g: number, b: number): HSL {
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
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hexToRGB(hex: string): RGB | null {
  const result = parseHexToRGB(hex);
  return result;
}

export function hexToHSL(hex: string): HSL | null {
  const rgb = hexToRGB(hex);
  if (!rgb) return null;
  return rgbToHSL(rgb.r, rgb.g, rgb.b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRGB(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function clampHSL(hsl: HSL): HSL {
  return {
    h: ((hsl.h % 360) + 360) % 360,
    s: Math.max(0, Math.min(100, hsl.s)),
    l: Math.max(0, Math.min(100, hsl.l)),
  };
}

export function hslToString(hsl: HSL): string {
  const clamped = clampHSL(hsl);
  return `hsl(${clamped.h}, ${clamped.s}%, ${clamped.l}%)`;
}

export function parseHSLString(str: string): HSL | null {
  return parseHSL(str);
}

export function getComplementary(hex: string): string[] {
  const hsl = hexToHSL(hex);
  if (!hsl) return [hex];
  
  const comp = clampHSL({ h: hsl.h + 180, s: hsl.s, l: hsl.l });
  return [hslToHex(comp.h, comp.s, comp.l)];
}

export function getAnalogous(hex: string): string[] {
  const hsl = hexToHSL(hex);
  if (!hsl) return [hex];
  
  const left = clampHSL({ h: hsl.h - 30, s: hsl.s, l: hsl.l });
  const right = clampHSL({ h: hsl.h + 30, s: hsl.s, l: hsl.l });
  
  return [
    hslToHex(left.h, left.s, left.l),
    hslToHex(right.h, right.s, right.l),
  ];
}

export function getTriadic(hex: string): string[] {
  const hsl = hexToHSL(hex);
  if (!hsl) return [hex];
  
  const t1 = clampHSL({ h: hsl.h + 120, s: hsl.s, l: hsl.l });
  const t2 = clampHSL({ h: hsl.h + 240, s: hsl.s, l: hsl.l });
  
  return [
    hslToHex(t1.h, t1.s, t1.l),
    hslToHex(t2.h, t2.s, t2.l),
  ];
}

export function getTetradic(hex: string): string[] {
  const hsl = hexToHSL(hex);
  if (!hsl) return [hex];
  
  const t1 = clampHSL({ h: hsl.h + 90, s: hsl.s, l: hsl.l });
  const t2 = clampHSL({ h: hsl.h + 180, s: hsl.s, l: hsl.l });
  const t3 = clampHSL({ h: hsl.h + 270, s: hsl.s, l: hsl.l });
  
  return [
    hslToHex(t1.h, t1.s, t1.l),
    hslToHex(t2.h, t2.s, t2.l),
    hslToHex(t3.h, t3.s, t3.l),
  ];
}

export function getSuggestedHarmonies(hex: string): { complementary: string[]; analogous: string[]; triadic: string[] } {
  return {
    complementary: getComplementary(hex),
    analogous: getAnalogous(hex),
    triadic: getTriadic(hex),
  };
}

export const COLOR_PALETTES = {
  neutrals: [
    '#1a1a1a', '#2d2d2d', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#f5f5f5',
  ],
  warmTones: [
    '#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5',
  ],
  coolTones: [
    '#0c4a6e', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe',
  ],
  nature: [
    '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0',
  ],
  vivid: [
    '#7c3aed', '#8b5cf6', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#f87171',
  ],
  pastel: [
    '#fecdd3', '#fce7f3', '#f5d0fe', '#ddd6fe', '#c7d2fe', '#a5f3fc', '#bbf7d0', '#fef08a',
  ],
} as const;

export function getAllPalettes(): { name: string; colors: string[] }[] {
  return [
    { name: 'Neutrals', colors: [...COLOR_PALETTES.neutrals] },
    { name: 'Warm Tones', colors: [...COLOR_PALETTES.warmTones] },
    { name: 'Cool Tones', colors: [...COLOR_PALETTES.coolTones] },
    { name: 'Nature', colors: [...COLOR_PALETTES.nature] },
    { name: 'Vivid', colors: [...COLOR_PALETTES.vivid] },
    { name: 'Pastel', colors: [...COLOR_PALETTES.pastel] },
  ];
}

export function getLighterShade(hex: string, amount: number = 10): string {
  const hsl = hexToHSL(hex);
  if (!hsl) return hex;
  
  const lighter = clampHSL({ h: hsl.h, s: hsl.s, l: hsl.l + amount });
  return hslToHex(lighter.h, lighter.s, lighter.l);
}

export function getDarkerShade(hex: string, amount: number = 10): string {
  const hsl = hexToHSL(hex);
  if (!hsl) return hex;
  
  const darker = clampHSL({ h: hsl.h, s: hsl.s, l: hsl.l - amount });
  return hslToHex(darker.h, darker.s, darker.l);
}

export interface ThemeAwareOptions {
  isDark: boolean;
  lightForeground?: string;
  darkForeground?: string;
  midTones?: string[];
}

const DEFAULT_LIGHT_FOREGROUND = '#0f172a';
const DEFAULT_DARK_FOREGROUND = '#f8fafc';
const DEFAULT_LIGHT_INVERSE = '#ffffff';
const DEFAULT_DARK_INVERSE = '#0f172a';

const LIGHT_MODE_CANDIDATES = [
  DEFAULT_LIGHT_FOREGROUND,
  '#1e293b',
  '#334155',
  '#475569',
  '#000000',
  '#ffffff',
];

const DARK_MODE_CANDIDATES = [
  DEFAULT_DARK_FOREGROUND,
  '#e2e8f0',
  '#cbd5e1',
  '#94a3b8',
  '#ffffff',
  '#000000',
];

export function suggestAccessibleForeground(background: string, options?: ThemeAwareOptions): string {
  const rgb = colorToRGB(background);
  if (!rgb) return options?.isDark ? DEFAULT_DARK_FOREGROUND : DEFAULT_LIGHT_FOREGROUND;
  
  const bgLuminance = getLuminance(rgb.r, rgb.g, rgb.b);
  
  if (!options) {
    return bgLuminance > 0.5 ? '#000000' : '#ffffff';
  }
  
  const candidates = [...(options.isDark ? DARK_MODE_CANDIDATES : LIGHT_MODE_CANDIDATES)];
  
  if (options.midTones?.length) {
    candidates.push(...options.midTones);
  }
  
  let bestCandidate = candidates[0];
  let bestRatio = 0;
  
  for (const candidate of candidates) {
    const ratio = getContrastRatio(candidate, background);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestCandidate = candidate;
    }
  }
  
  if (bestRatio >= 4.5) {
    return bestCandidate;
  }
  
  return bgLuminance > 0.5 ? '#000000' : '#ffffff';
}

export function suggestAccessibleForegroundSimple(background: string): string {
  const rgb = colorToRGB(background);
  if (!rgb) return '#000000';
  
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export interface ContrastCorrectionResult {
  correctedTokens: Record<string, string>;
  corrections: Array<{
    tokenKey: string;
    originalValue: string;
    correctedValue: string;
    backgroundKey: string;
    originalRatio: number;
    newRatio: number;
  }>;
  skippedKeys: string[];
}

export interface ContrastCorrectionOptions {
  isDark: boolean;
  minRatio?: number;
  skipKeys?: string[];
  customCandidates?: string[];
}

interface ContrastPairDefinition {
  name: string;
  fg: string;
  bg: string;
  required: number;
}

function buildContractContrastPairs(): ContrastPairDefinition[] {
  const map = new Map<string, ContrastPairDefinition>();
  for (const contract of THEME_COMPONENT_CONTRACTS) {
    for (const state of contract.states) {
      for (const pair of state.requiredPairs || []) {
        const key = `${pair.fg}|${pair.bg}`;
        const candidate: ContrastPairDefinition = {
          name: `${contract.component}.${state.state}`,
          fg: pair.fg,
          bg: pair.bg,
          required: pair.minRatio,
        };
        const existing = map.get(key);
        if (!existing || candidate.required > existing.required) {
          map.set(key, candidate);
        }
      }
    }
  }
  return Array.from(map.values());
}

const CONTRACT_CONTRAST_PAIRS = buildContractContrastPairs();
const UI_REMEDIATION_PAIRS: ContrastPairDefinition[] = [
  { name: 'Border on Background', fg: '--border', bg: '--background', required: 3.0 },
  { name: 'Border on Card', fg: '--border', bg: '--card', required: 3.0 },
  { name: 'Input Border on Input', fg: '--input-border', bg: '--input-bg', required: 3.0 },
  { name: 'Input Hover Border on Input', fg: '--input-hover-border', bg: '--input-bg', required: 3.0 },
  { name: 'Input Focus Border on Input', fg: '--input-focus-border', bg: '--input-bg', required: 3.0 },
  { name: 'Select Border on Select', fg: '--select-border', bg: '--select-bg', required: 3.0 },
  { name: 'Ring on Background', fg: '--ring', bg: '--background', required: 3.0 },
  { name: 'Ring on Card', fg: '--ring', bg: '--card', required: 3.0 },
  { name: 'Table Header Border on Header', fg: '--table-header-border', bg: '--table-header-bg', required: 3.0 },
  { name: 'Table Cell Border on Row', fg: '--table-cell-border', bg: '--table-row-bg', required: 3.0 },
  { name: 'Table Sort Icon on Header', fg: '--table-sort-icon', bg: '--table-header-bg', required: 3.0 },
  { name: 'Chart Axis on Background', fg: '--chart-axis', bg: '--background', required: 3.0 },
  { name: 'Chart Grid on Background', fg: '--chart-grid', bg: '--background', required: 3.0 },
  { name: 'Modal Border on Modal', fg: '--modal-border', bg: '--modal-bg', required: 3.0 },
  { name: 'Toast Border on Toast', fg: '--toast-border', bg: '--toast-bg', required: 3.0 },
  { name: 'Primary Disabled Text on Primary Disabled', fg: '--btn-primary-disabled-fg', bg: '--btn-primary-disabled-bg', required: 2.5 },
  { name: 'Secondary Disabled Text on Secondary Disabled', fg: '--btn-secondary-disabled-fg', bg: '--btn-secondary-disabled-bg', required: 2.5 },
  { name: 'Danger Disabled Text on Danger Disabled', fg: '--btn-danger-fg', bg: '--btn-danger-disabled-bg', required: 2.5 },
  { name: 'Ghost Disabled Text on Background', fg: '--btn-ghost-disabled-fg', bg: '--background', required: 2.5 },
  { name: 'Input Disabled Text on Input Disabled', fg: '--input-disabled-fg', bg: '--input-disabled-bg', required: 2.5 },
];

function addLightnessVariants(candidates: Set<string>, source: string, steps = [8, 16, 24, -8, -16, -24]) {
  const parsed = parseHSLString(source);
  if (!parsed) return;
  for (const delta of steps) {
    candidates.add(hslToString({ h: parsed.h, s: parsed.s, l: Math.max(0, Math.min(100, parsed.l + delta)) }));
  }
}

const FOREGROUND_BACKGROUND_PAIRS = [
  // Core semantic pairs
  { fg: '--primary-foreground', bg: '--primary' },
  { fg: '--secondary-foreground', bg: '--secondary' },
  { fg: '--accent-foreground', bg: '--accent' },
  { fg: '--foreground', bg: '--background' },
  { fg: '--card-foreground', bg: '--card' },
  { fg: '--muted-foreground', bg: '--muted' },
  { fg: '--destructive-foreground', bg: '--destructive' },
  { fg: '--popover-foreground', bg: '--popover' },

  // Buttons
  { fg: '--btn-primary-fg', bg: '--btn-primary-bg' },
  { fg: '--btn-secondary-fg', bg: '--btn-secondary-bg' },
  { fg: '--btn-secondary-hover-fg', bg: '--btn-secondary-hover' },
  { fg: '--btn-secondary-active-fg', bg: '--btn-secondary-active' },
  { fg: '--btn-gradient-fg', bg: '--btn-gradient-from' },
  { fg: '--btn-gradient-fg', bg: '--btn-gradient-to' },
  { fg: '--btn-danger-fg', bg: '--btn-danger-bg' },
  { fg: '--btn-success-fg', bg: '--btn-success-bg' },
  { fg: '--btn-success-disabled-fg', bg: '--btn-success-disabled-bg' },
  { fg: '--btn-warning-fg', bg: '--btn-warning-bg' },
  { fg: '--btn-warning-disabled-fg', bg: '--btn-warning-bg' },

  // Cards
  { fg: '--card-fg', bg: '--card-bg' },
  { fg: '--fg-on-card', bg: '--card-bg' },
  { fg: '--fg-on-card', bg: '--card' },
  { fg: '--body-on-card', bg: '--card-bg' },
  { fg: '--body-on-card', bg: '--card' },

  // Inputs/Forms
  { fg: '--input-fg', bg: '--input-bg' },
  { fg: '--label-fg', bg: '--background' },
  { fg: '--helper-fg', bg: '--background' },
  { fg: '--select-fg', bg: '--select-bg' },

  // Navigation
  { fg: '--nav-fg', bg: '--nav-bg' },
  { fg: '--nav-link', bg: '--nav-bg' },
  { fg: '--nav-active-fg', bg: '--nav-active' },
  { fg: '--sidebar-fg', bg: '--sidebar-bg' },
  { fg: '--sidebar-item-fg', bg: '--sidebar-item-hover-bg' },

  // Admin
  { fg: '--admin-header-fg', bg: '--admin-header-bg' },
  { fg: '--admin-sidebar-fg', bg: '--admin-sidebar-bg' },
  { fg: '--admin-sidebar-active-fg', bg: '--admin-sidebar-active-bg' },

  // Tables
  { fg: '--table-header-fg', bg: '--table-header-bg' },
  { fg: '--table-row-fg', bg: '--table-row-bg' },
  { fg: '--table-row-fg', bg: '--table-row-alt-bg' },
  { fg: '--table-row-selected-fg', bg: '--table-row-selected-bg' },

  // Tabs
  { fg: '--tab-fg', bg: '--tab-bg' },
  { fg: '--tab-active-fg', bg: '--tab-active-bg' },
  { fg: '--tab-hover-fg', bg: '--tab-hover-bg' },

  // Modals/Overlays
  { fg: '--modal-fg', bg: '--modal-bg' },
  { fg: '--toast-fg', bg: '--toast-bg' },
  { fg: '--tooltip-fg', bg: '--tooltip-bg' },
  { fg: '--dropdown-fg', bg: '--dropdown-bg' },
  { fg: '--popover-fg', bg: '--popover-bg' },

  // Alerts
  { fg: '--alert-info-fg', bg: '--alert-info-bg' },
  { fg: '--alert-success-fg', bg: '--alert-success-bg' },
  { fg: '--alert-warning-fg', bg: '--alert-warning-bg' },
  { fg: '--alert-error-fg', bg: '--alert-error-bg' },

  // Toast variants
  { fg: '--toast-success-fg', bg: '--toast-success-bg' },
  { fg: '--toast-error-fg', bg: '--toast-error-bg' },

  // Badges
  { fg: '--badge-fg', bg: '--badge-bg' },
  { fg: '--badge-hover-fg', bg: '--badge-hover-bg' },
  { fg: '--badge-secondary-fg', bg: '--badge-secondary-bg' },
  { fg: '--badge-outline-fg', bg: '--badge-outline-bg' },

  // Pills/Tags
  { fg: '--pill-fg', bg: '--pill-bg' },
  { fg: '--pill-active-fg', bg: '--pill-active-bg' },
  { fg: '--tag-fg', bg: '--tag-bg' },

  // Hero/Landing
  { fg: '--hero-fg', bg: '--hero-bg' },
  { fg: '--hero-subtitle-fg', bg: '--hero-bg' },
  { fg: '--features-card-fg', bg: '--features-card-bg' },
  { fg: '--pricing-card-fg', bg: '--pricing-card-bg' },
  { fg: '--footer-fg', bg: '--footer-bg' },

  // Quiz/Game elements
  { fg: '--answer-option-fg', bg: '--answer-option-bg' },
  { fg: '--answer-option-correct-fg', bg: '--answer-option-correct-bg' },
  { fg: '--answer-option-incorrect-fg', bg: '--answer-option-incorrect-bg' },
  { fg: '--answer-option-selected-fg', bg: '--answer-option-selected-bg' },
  { fg: '--timer-fg', bg: '--timer-bg' },
  { fg: '--leaderboard-row-fg', bg: '--leaderboard-row-bg' },

  // Auth forms
  { fg: '--auth-fg', bg: '--auth-bg' },
  { fg: '--auth-form-fg', bg: '--auth-form-bg' },
  { fg: '--auth-cta-fg', bg: '--auth-cta-bg' },

  // Accordion
  { fg: '--accordion-fg', bg: '--accordion-bg' },
  { fg: '--surface-primary-fg', bg: '--surface-primary' },
  // Contract-defined pairs
  ...CONTRACT_CONTRAST_PAIRS.map((pair) => ({ fg: pair.fg, bg: pair.bg, required: pair.required })),
  ...UI_REMEDIATION_PAIRS.map((pair) => ({ fg: pair.fg, bg: pair.bg, required: pair.required })),
] as const;

export function getContrastCorrectedTokens(
  tokens: Record<string, string>,
  options?: ContrastCorrectionOptions
): ContrastCorrectionResult {
  const skipKeys = new Set(options?.skipKeys ?? []);
  const initialIssues = auditThemeContrast(tokens);
  const issueByFgToken = new Map<string, (typeof initialIssues)[number]>();
  for (const issue of initialIssues) {
    const existing = issueByFgToken.get(issue.fgToken);
    if (!existing || issue.ratio < existing.ratio) {
      issueByFgToken.set(issue.fgToken, issue);
    }
  }

  let correctedTokens = { ...tokens };
  const aggregateAdjustments: Array<{
    token: string;
    before: string;
    after: string;
    ratioBefore: number;
    ratioAfter: number;
  }> = [];

  for (let pass = 0; pass < 8; pass += 1) {
    const result = applyThemeContrastGuard(correctedTokens);
    if (result.adjustments.length === 0) break;
    correctedTokens = result.tokens;
    aggregateAdjustments.push(...result.adjustments);
  }

  const corrections: ContrastCorrectionResult['corrections'] = [];
  const skippedKeys: string[] = [];
  for (const adjustment of aggregateAdjustments) {
    const tokenKey = adjustment.token;
    if (skipKeys.has(tokenKey)) {
      correctedTokens[tokenKey] = tokens[tokenKey];
      if (!skippedKeys.includes(tokenKey)) {
        skippedKeys.push(tokenKey);
      }
      continue;
    }
    const sourceIssue = issueByFgToken.get(tokenKey);
    corrections.push({
      tokenKey,
      originalValue: adjustment.before,
      correctedValue: adjustment.after,
      backgroundKey: sourceIssue?.bgToken || '--background',
      originalRatio: adjustment.ratioBefore,
      newRatio: adjustment.ratioAfter,
    });
  }

  const dedupedCorrections = new Map<string, (typeof corrections)[number]>();
  for (const correction of corrections) {
    dedupedCorrections.set(correction.tokenKey, correction);
  }

  return { correctedTokens, corrections: Array.from(dedupedCorrections.values()), skippedKeys };
}

export function applyRuntimeContrastCorrections(
  tokens: Record<string, string>,
  options?: ContrastCorrectionOptions
): Record<string, string> {
  const { correctedTokens, corrections, skippedKeys } = getContrastCorrectedTokens(tokens, options);
  
  if (corrections.length > 0) {
    console.log(
      `[ContrastGuard] Applied ${corrections.length} contrast corrections (${options?.isDark ? 'dark' : 'light'} mode):`,
      corrections.map(c => `${c.tokenKey}: ${c.originalRatio}:1 → ${c.newRatio}:1`)
    );
  }
  
  if (skippedKeys.length > 0) {
    console.log('[ContrastGuard] Skipped keys:', skippedKeys);
  }
  
  return correctedTokens;
}

export function getContrastDiagnostics(
  tokens: Record<string, string>,
  isDark: boolean
): Array<{
  pair: string;
  fg: string;
  bg: string;
  fgValue: string;
  bgValue: string;
  ratio: number;
  grade: ReturnType<typeof getContrastGrade>;
  meetsAA: boolean;
  meetsAAA: boolean;
}> {
  const diagnostics = [];
  
  for (const pair of FOREGROUND_BACKGROUND_PAIRS) {
    const fgValue = tokens[pair.fg];
    const bgValue = tokens[pair.bg];
    
    if (!fgValue || !bgValue) continue;
    const resolvedPair = getResolvedPair(fgValue, bgValue, tokens);
    if (!resolvedPair.canCompare) continue;
    
    const ratio = getContrastRatio(resolvedPair.fg, resolvedPair.bg);
    const grade = getContrastGrade(ratio);
    
    diagnostics.push({
      pair: `${pair.fg} on ${pair.bg}`,
      fg: pair.fg,
      bg: pair.bg,
      fgValue: resolvedPair.fg,
      bgValue: resolvedPair.bg,
      ratio: Math.round(ratio * 100) / 100,
      grade,
      meetsAA: ratio >= 4.5,
      meetsAAA: ratio >= 7,
    });
  }
  
  return diagnostics.sort((a, b) => a.ratio - b.ratio);
}
