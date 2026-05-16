import { getContractPairs } from './themeComponentContracts';
import { REQUIRED_TOKEN_KEYS } from './brandingTokens';

export interface ThemeContrastIssue {
  pair: string;
  fgToken: string;
  bgToken: string;
  ratio: number;
  required: number;
  level: 'error' | 'warning';
}

export interface ThemeContrastGuardResult {
  tokens: Record<string, string>;
  adjustments: Array<{ token: string; before: string; after: string; ratioBefore: number; ratioAfter: number }>;
  issues: ThemeContrastIssue[];
}

type ContractPair = {
  fg: string;
  bg: string;
  required: number;
  level: 'error' | 'warning';
  label?: string;
};

const BASE_CONTRACT_PAIRS: ContractPair[] = [
  { fg: '--surface-primary-fg', bg: '--surface-primary', required: 7, level: 'error' },
  { fg: '--text-on-surface', bg: '--surface-raised', required: 4.5, level: 'error' },
  { fg: '--text-muted', bg: '--surface-muted', required: 4.5, level: 'error' },
  { fg: '--action-primary-fg', bg: '--action-primary', required: 4.5, level: 'error' },
  { fg: '--action-secondary-fg', bg: '--action-secondary', required: 4.5, level: 'error' },
  { fg: '--action-accent-fg', bg: '--action-accent', required: 4.5, level: 'error' },
  { fg: '--action-danger-fg', bg: '--action-danger', required: 4.5, level: 'error' },
  { fg: '--foreground', bg: '--background', required: 7, level: 'error' },
  { fg: '--card-foreground', bg: '--card', required: 4.5, level: 'error' },
  { fg: '--muted-foreground', bg: '--muted', required: 4.5, level: 'error' },
  { fg: '--primary-foreground', bg: '--primary', required: 4.5, level: 'error' },
  { fg: '--secondary-foreground', bg: '--secondary', required: 4.5, level: 'error' },
  { fg: '--accent-foreground', bg: '--accent', required: 4.5, level: 'error' },
  { fg: '--border', bg: '--background', required: 3, level: 'warning' },
  { fg: '--border', bg: '--card', required: 3, level: 'warning' },
  { fg: '--ring', bg: '--background', required: 3, level: 'warning' },
  { fg: '--ring', bg: '--card', required: 3, level: 'warning' },
  { fg: '--input-border', bg: '--input-bg', required: 3, level: 'warning' },
  { fg: '--input-hover-border', bg: '--input-bg', required: 3, level: 'warning' },
  { fg: '--input-focus-border', bg: '--input-bg', required: 3, level: 'warning' },
  { fg: '--select-border', bg: '--select-bg', required: 3, level: 'warning' },
  { fg: '--table-header-border', bg: '--table-header-bg', required: 3, level: 'warning' },
  { fg: '--table-cell-border', bg: '--table-row-bg', required: 3, level: 'warning' },
  { fg: '--table-sort-icon', bg: '--table-header-bg', required: 3, level: 'warning' },
  { fg: '--chart-axis', bg: '--background', required: 3, level: 'warning' },
  { fg: '--chart-grid', bg: '--background', required: 3, level: 'warning' },
  { fg: '--modal-border', bg: '--modal-bg', required: 3, level: 'warning' },
  { fg: '--toast-border', bg: '--toast-bg', required: 3, level: 'warning' },
  { fg: '--btn-ghost-fg', bg: '--btn-ghost-hover', required: 3, level: 'warning' },
  { fg: '--badge-outline-fg', bg: '--badge-outline-bg', required: 3, level: 'warning' },
  { fg: '--dropdown-fg', bg: '--dropdown-bg', required: 4.5, level: 'error' },
  { fg: '--table-header-fg', bg: '--table-header-bg', required: 4.5, level: 'error' },
  { fg: '--table-row-fg', bg: '--table-row-bg', required: 4.5, level: 'error' },
  { fg: '--course-card-fg', bg: '--course-card-bg', required: 4.5, level: 'error' },
  { fg: '--filter-pill-active-fg', bg: '--filter-pill-active-bg', required: 4.5, level: 'error' },
  { fg: '--admin-sidebar-active-fg', bg: '--admin-sidebar-active-bg', required: 4.5, level: 'error' },
  { fg: '--admin-header-fg', bg: '--admin-header-bg', required: 4.5, level: 'error' },
  { fg: '--auth-fg', bg: '--auth-bg', required: 4.5, level: 'error' },
  { fg: '--auth-cta-fg', bg: '--auth-cta-bg', required: 4.5, level: 'error' },
  { fg: '--hero-cta-primary-fg', bg: '--hero-cta-primary-bg', required: 4.5, level: 'error' },
  { fg: '--hero-cta-secondary-fg', bg: '--hero-cta-secondary-bg', required: 4.5, level: 'error' },
];

const STATIC_CONTRACT_PAIRS: ContractPair[] = [
  ...BASE_CONTRACT_PAIRS,
  ...getContractPairs().map((pair) => ({
    fg: pair.fg,
    bg: pair.bg,
    required: pair.minRatio,
    level: pair.level ?? 'error',
    label: `${pair.component}.${pair.state}`,
  })),
];

function isAdjustableForegroundToken(token: string): boolean {
  return (
    token.endsWith('-fg') ||
    token.endsWith('-foreground') ||
    token.endsWith('-icon') ||
    token.endsWith('-label') ||
    token.endsWith('-text') ||
    token.endsWith('-title') ||
    token.endsWith('-body') ||
    token.endsWith('-heading') ||
    token.endsWith('-link') ||
    token.endsWith('-border') ||
    token.endsWith('-ring') ||
    token.includes('focus-ring')
  );
}

function pickFirstExisting(candidates: string[], tokenSet: Set<string>, fg: string): string | null {
  for (const token of candidates) {
    if (token !== fg && tokenSet.has(token)) return token;
  }
  return null;
}

function buildDerivedPairs(tokens: Record<string, string>): ContractPair[] {
  const keys = Object.keys(tokens).filter((key) => key.startsWith('--'));
  const tokenSet = new Set(keys);
  const seen = new Set<string>();
  const pairs: ContractPair[] = [];

  const addPair = (pair: ContractPair) => {
    const key = `${pair.fg}|${pair.bg}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(pair);
  };

  for (const key of keys) {
    if (key.endsWith('-fg')) {
      const base = key.slice(0, -3);
      const bg = pickFirstExisting([`${base}-bg`, base, `${base}-surface`, '--card', '--background'], tokenSet, key);
      if (!bg) continue;
      const warningLike = /disabled|muted|subtle|ghost|progress/i.test(key);
      addPair({
        fg: key,
        bg,
        required: warningLike ? 3 : 4.5,
        level: warningLike ? 'warning' : 'error',
        label: 'derived.fg',
      });
      continue;
    }

    if (key.endsWith('-foreground')) {
      const base = key.replace(/-foreground$/, '');
      const bg = pickFirstExisting([base, `${base}-bg`, '--card', '--background'], tokenSet, key);
      if (!bg) continue;
      addPair({ fg: key, bg, required: 4.5, level: 'error', label: 'derived.foreground' });
      continue;
    }

    if (key.endsWith('-border')) {
      const base = key.replace(/-border$/, '');
      const bg = pickFirstExisting([`${base}-bg`, base, '--card', '--background'], tokenSet, key);
      if (!bg) continue;
      addPair({ fg: key, bg, required: 3, level: 'warning', label: 'derived.border' });
      continue;
    }

    if (key.endsWith('-icon')) {
      const base = key.replace(/-icon$/, '');
      const bg = pickFirstExisting([`${base}-bg`, base, '--card', '--background'], tokenSet, key);
      if (!bg) continue;
      addPair({ fg: key, bg, required: 3, level: 'warning', label: 'derived.icon' });
      continue;
    }

    if (key.endsWith('-ring') || key.includes('focus-ring')) {
      const bg = pickFirstExisting(['--background', '--card'], tokenSet, key);
      if (!bg) continue;
      addPair({ fg: key, bg, required: 3, level: 'warning', label: 'derived.ring' });
    }
  }

  return pairs;
}

function getEffectiveContractPairs(tokens: Record<string, string>): ContractPair[] {
  const merged = new Map<string, ContractPair>();
  const allPairs = [...STATIC_CONTRACT_PAIRS, ...buildDerivedPairs(tokens)];
  for (const pair of allPairs) {
    const key = `${pair.fg}|${pair.bg}`;
    const existing = merged.get(key);
    if (!existing || pair.required > existing.required) {
      merged.set(key, pair);
    }
  }
  return Array.from(merged.values());
}

export function getThemeContrastCoverageSummary(tokens: Record<string, string>): {
  requiredTokenCount: number;
  requiredTokensPresent: number;
  pairedTokensPresent: number;
  unpairedRequiredTokensPresent: string[];
} {
  const presentRequiredTokens = REQUIRED_TOKEN_KEYS.filter((token) => !!tokens[token]);
  const pairs = getEffectiveContractPairs(tokens);
  const paired = new Set<string>();
  for (const pair of pairs) {
    paired.add(pair.fg);
    paired.add(pair.bg);
  }
  const unpairedRequiredTokensPresent = presentRequiredTokens.filter((token) => !paired.has(token));
  return {
    requiredTokenCount: REQUIRED_TOKEN_KEYS.length,
    requiredTokensPresent: presentRequiredTokens.length,
    pairedTokensPresent: presentRequiredTokens.length - unpairedRequiredTokensPresent.length,
    unpairedRequiredTokensPresent,
  };
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseHexToRgba(hex: string): RGBA | null {
  const normalized = hex.trim().replace('#', '');
  if (normalized.length === 3 || normalized.length === 4) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    const a = normalized.length === 4 ? parseInt(normalized[3] + normalized[3], 16) / 255 : 1;
    return { r, g, b, a };
  }
  if (normalized.length === 6 || normalized.length === 8) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const a = normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

function parseHsl(color: string): { h: number; s: number; l: number; a: number } | null {
  const match = color.trim().match(
    /^hsla?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?\s*(?:,\s*|\s+)([0-9.]+)%\s*(?:,\s*|\s+)([0-9.]+)%(?:\s*(?:\/|,)\s*([0-9.]+%?))?\s*\)$/i
  );
  if (!match) return null;
  const h = ((parseFloat(match[1]) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, parseFloat(match[2])));
  const l = Math.max(0, Math.min(100, parseFloat(match[3])));
  const alphaRaw = match[4];
  let a = 1;
  if (alphaRaw !== undefined) {
    a = alphaRaw.endsWith('%') ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
  }
  return { h, s, l, a: Math.max(0, Math.min(1, a)) };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sat = s / 100;
  const light = l / 100;
  if (sat === 0) {
    const gray = Math.round(light * 255);
    return { r: gray, g: gray, b: gray };
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
  const hNorm = h / 360;
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  };
}

function parseRgbString(color: string): RGBA | null {
  const match = color.trim().match(
    /^rgba?\(\s*([0-9.]+%?)\s*(?:,\s*|\s+)([0-9.]+%?)\s*(?:,\s*|\s+)([0-9.]+%?)(?:\s*(?:\/|,)\s*([0-9.]+%?))?\s*\)$/i
  );
  if (!match) return null;
  const toChannel = (value: string) => {
    if (value.endsWith('%')) return Math.round((Math.max(0, Math.min(100, parseFloat(value))) / 100) * 255);
    return Math.round(Math.max(0, Math.min(255, parseFloat(value))));
  };
  let alpha = 1;
  if (match[4] !== undefined) {
    alpha = match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  }
  return { r: toChannel(match[1]), g: toChannel(match[2]), b: toChannel(match[3]), a: Math.max(0, Math.min(1, alpha)) };
}

function colorToRgba(color: string): RGBA | null {
  const trimmed = color.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return parseHexToRgba(trimmed);
  if (trimmed.startsWith('hsl')) {
    const hsl = parseHsl(trimmed);
    if (!hsl) return null;
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return { ...rgb, a: hsl.a };
  }
  if (trimmed.startsWith('rgb')) return parseRgbString(trimmed);
  if (trimmed.toLowerCase() === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (trimmed.toLowerCase() === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (trimmed.toLowerCase() === 'transparent') return { r: 255, g: 255, b: 255, a: 0 };
  return null;
}

function composite(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 255, g: 255, b: 255, a: 0 };
  const r = Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a);
  const g = Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a);
  const b = Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a);
  return { r, g, b, a };
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
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
  if (resolved) return resolveTokenReference(resolved, tokens, depth + 1);
  return fallback ? resolveTokenReference(fallback, tokens, depth + 1) : trimmed;
}

function ratio(fg: string, bg: string, tokens?: Record<string, string>): number {
  const resolvedFg = tokens ? resolveTokenReference(fg, tokens) : fg;
  const resolvedBg = tokens ? resolveTokenReference(bg, tokens) : bg;
  const fgRgba = colorToRgba(resolvedFg);
  const bgRgba = colorToRgba(resolvedBg);
  if (!fgRgba || !bgRgba) return 1;

  const opaqueBase = composite(bgRgba, { r: 255, g: 255, b: 255, a: 1 });
  const finalFg = composite(fgRgba, opaqueBase);
  const l1 = luminance(finalFg);
  const l2 = luminance(opaqueBase);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function ensureReadableForeground(background: string, preferred: string, required: number, tokens: Record<string, string>): string {
  const candidates = [preferred, 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 8%)', 'hsl(0, 0%, 12%)', 'hsl(0, 0%, 18%)'];
  const preferredHsl = parseHsl(resolveTokenReference(preferred, tokens));
  if (preferredHsl) {
    for (let l = 4; l <= 96; l += 4) {
      candidates.push(`hsl(${Math.round(preferredHsl.h)}, ${Math.round(Math.min(preferredHsl.s, 70))}%, ${l}%)`);
    }
  }
  for (let l = 0; l <= 100; l += 5) {
    candidates.push(`hsl(0, 0%, ${l}%)`);
  }

  let best = preferred;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const r = ratio(candidate, background, tokens);
    if (r > bestRatio) {
      best = candidate;
      bestRatio = r;
    }
    if (r >= required && candidate === preferred) return candidate;
  }
  return best;
}

export function auditThemeContrast(tokens: Record<string, string>): ThemeContrastIssue[] {
  const issues: ThemeContrastIssue[] = [];
  const contractPairs = getEffectiveContractPairs(tokens);
  const EPSILON = 0.01;
  for (const pair of contractPairs) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) continue;
    const contrast = ratio(fg, bg, tokens);
    if (contrast + EPSILON < pair.required) {
      issues.push({
        pair: pair.label ? `${pair.label}: ${pair.fg} on ${pair.bg}` : `${pair.fg} on ${pair.bg}`,
        fgToken: pair.fg,
        bgToken: pair.bg,
        ratio: Number(contrast.toFixed(2)),
        required: pair.required,
        level: pair.level,
      });
    }
  }
  return issues;
}

export function applyThemeContrastGuard(inputTokens: Record<string, string>): ThemeContrastGuardResult {
  const tokens = { ...inputTokens };
  const adjustments: ThemeContrastGuardResult['adjustments'] = [];
  const contractPairs = getEffectiveContractPairs(tokens);

  for (const pair of contractPairs) {
    if (!isAdjustableForegroundToken(pair.fg)) continue;
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) continue;
    const before = ratio(fg, bg, tokens);
    if (before >= pair.required) continue;
    const corrected = ensureReadableForeground(bg, fg, pair.required, tokens);
    const after = ratio(corrected, bg, tokens);
    if (corrected !== fg) {
      tokens[pair.fg] = corrected;
      adjustments.push({
        token: pair.fg,
        before: fg,
        after: corrected,
        ratioBefore: Number(before.toFixed(2)),
        ratioAfter: Number(after.toFixed(2)),
      });
    }
  }

  const issues = auditThemeContrast(tokens);
  return { tokens, adjustments, issues };
}
