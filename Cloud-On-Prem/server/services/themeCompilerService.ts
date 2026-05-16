import { buildFullTokens } from '../../shared/themeTokenBuilder';
import { REQUIRED_TOKEN_KEYS } from '../../shared/brandingTokens';
import {
  applyThemeContrastGuard,
  auditThemeContrast,
  type ThemeContrastGuardResult,
  type ThemeContrastIssue,
} from '../../shared/themeContrastGuard';
import { getContractRequiredTokens } from '../../shared/themeComponentContracts';

export interface ThemeCompilationOptions {
  modeIntent?: 'light' | 'dark';
  maxContrastPasses?: number;
}

export interface ThemeCompilationResult {
  modeIntent: 'light' | 'dark';
  tokens: Record<string, string>;
  tokensLight: Record<string, string>;
  tokensDark: Record<string, string>;
  adjustments: ThemeContrastGuardResult['adjustments'];
  issues: ThemeContrastIssue[];
  criticalIssues: ThemeContrastIssue[];
  warningIssues: ThemeContrastIssue[];
  missingRequiredTokens: string[];
  missingContractTokens: string[];
  canActivate: boolean;
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '');
  if (normalized.length === 3) {
    const [r, g, b] = normalized.split('');
    return {
      r: parseInt(`${r}${r}`, 16),
      g: parseInt(`${g}${g}`, 16),
      b: parseInt(`${b}${b}`, 16),
    };
  }

  if (normalized.length === 6) {
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }

  return null;
}

function hueFromRgb(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  if (delta === 0) return 220;

  let h = 0;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  return Math.round((h * 60 + 360) % 360);
}

function getHueFromColor(color: string | undefined, fallback = 220): number {
  const normalized = String(color || '').trim();
  const hslMatch = normalized.match(
    /hsl[a]?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?(?:,|\s)\s*([0-9.]+)%\s*(?:,|\s)\s*([0-9.]+)%/i,
  );
  if (hslMatch) {
    const hue = Number(hslMatch[1]);
    if (Number.isFinite(hue)) return ((Math.round(hue) % 360) + 360) % 360;
  }

  if (normalized.startsWith('#')) {
    const rgb = parseHexToRgb(normalized);
    if (rgb) return hueFromRgb(rgb.r, rgb.g, rgb.b);
  }

  return fallback;
}

function resolveAnchorValue(value: string | undefined, fallback: string): string {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function enforceAuthoredOverrides(tokens: Record<string, string>, authored: Record<string, string>): Record<string, string> {
  const next = { ...tokens };
  for (const [key, value] of Object.entries(authored)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    next[key] = trimmed;
  }
  return next;
}

const CROSS_MODE_CARRY_KEYS = new Set<string>([
  '--primary',
  '--secondary',
  '--accent',
  '--gradient-from',
  '--gradient-to',
  '--game-primary',
  '--game-glow',
  '--action-primary',
  '--action-secondary',
  '--action-accent',
]);

function applyCrossModeAnchorOverrides(
  generatedTokens: Record<string, string>,
  authored: Record<string, string>,
): Record<string, string> {
  const next = { ...generatedTokens };
  for (const key of CROSS_MODE_CARRY_KEYS) {
    const value = authored[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    next[key] = trimmed;
  }
  return next;
}

function buildModeBaseFromAnchors(
  authored: Record<string, string>,
  modeIntent: 'light' | 'dark',
  options?: { preserveModeSensitiveOverrides?: boolean },
) {
  const preserveModeSensitiveOverrides = options?.preserveModeSensitiveOverrides !== false;
  const isDark = modeIntent === 'dark';
  const pick = (key: string, fallback: string, modeSensitive = false) => {
    if (modeSensitive && !preserveModeSensitiveOverrides) return fallback;
    return resolveAnchorValue(authored[key], fallback);
  };
  const primary = resolveAnchorValue(authored['--primary'], 'hsl(217 91% 60%)');
  const secondary = resolveAnchorValue(authored['--secondary'], 'hsl(220, 14%, 20%)');
  const accent = resolveAnchorValue(authored['--accent'], 'hsl(213 94% 68%)');
  const primaryHue = getHueFromColor(primary, 220);

  return {
    primary,
    primaryForeground: pick('--primary-foreground', isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)', true),
    secondary,
    secondaryForeground: pick('--secondary-foreground', 'hsl(0, 0%, 100%)', true),
    accent,
    accentForeground: pick('--accent-foreground', isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)', true),
    background: pick('--background', isDark ? `hsl(${primaryHue}, 20%, 8%)` : `hsl(${primaryHue}, 28%, 97%)`, true),
    foreground: pick('--foreground', isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)', true),
    card: pick('--card', isDark ? `hsl(${primaryHue}, 18%, 11%)` : 'hsl(0, 0%, 100%)', true),
    cardForeground: pick('--card-foreground', isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)', true),
    muted: pick('--muted', isDark ? `hsl(${primaryHue}, 14%, 16%)` : `hsl(${primaryHue}, 18%, 92%)`, true),
    mutedForeground: pick('--muted-foreground', isDark ? 'hsl(0, 0%, 65%)' : 'hsl(220, 12%, 42%)', true),
    border: pick('--border', isDark ? `hsl(${primaryHue}, 16%, 24%)` : `hsl(${primaryHue}, 18%, 84%)`, true),
    ring: pick('--ring', primary, true),
    gradientFrom: resolveAnchorValue(authored['--gradient-from'], primary),
    gradientTo: resolveAnchorValue(authored['--gradient-to'], primary),
    gamePrimary: resolveAnchorValue(authored['--game-primary'], accent),
    gameGlow: resolveAnchorValue(authored['--game-glow'], accent),
    isDark,
  };
}

function expandTokensIfNeeded(tokens: Record<string, string>, modeIntent: 'light' | 'dark'): Record<string, string> {
  const presentRequired = REQUIRED_TOKEN_KEYS.filter((key) => !!tokens[key]).length;
  const isDark = modeIntent === 'dark';
  if (presentRequired >= REQUIRED_TOKEN_KEYS.length) return tokens;

  return buildFullTokens({
    primary: tokens['--primary'] || 'hsl(217 91% 60%)',
    primaryForeground: tokens['--primary-foreground'] || 'hsl(0, 0%, 100%)',
    secondary: tokens['--secondary'] || 'hsl(220, 14%, 20%)',
    secondaryForeground: tokens['--secondary-foreground'] || 'hsl(0, 0%, 100%)',
    accent: tokens['--accent'] || 'hsl(213 94% 68%)',
    accentForeground: tokens['--accent-foreground'] || 'hsl(0, 0%, 100%)',
    background: tokens['--background'] || (isDark ? 'hsl(0, 0%, 7%)' : 'hsl(210, 40%, 98%)'),
    foreground: tokens['--foreground'] || (isDark ? 'hsl(0, 0%, 95%)' : 'hsl(215, 28%, 17%)'),
    card: tokens['--card'] || (isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)'),
    cardForeground: tokens['--card-foreground'] || (isDark ? 'hsl(0, 0%, 95%)' : 'hsl(215, 28%, 17%)'),
    muted: tokens['--muted'] || (isDark ? 'hsl(0, 0%, 15%)' : 'hsl(210, 40%, 96%)'),
    mutedForeground: tokens['--muted-foreground'] || (isDark ? 'hsl(0, 0%, 60%)' : 'hsl(215, 16%, 47%)'),
    border: tokens['--border'] || (isDark ? 'hsl(0, 0%, 20%)' : 'hsl(214, 32%, 91%)'),
    ring: tokens['--ring'] || 'hsl(217 91% 60%)',
    gradientFrom: tokens['--gradient-from'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gradientTo: tokens['--gradient-to'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gamePrimary: tokens['--game-primary'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gameGlow: tokens['--game-glow'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    isDark,
  });
}

function applyContrastPasses(
  sourceTokens: Record<string, string>,
  maxPasses: number,
): { tokens: Record<string, string>; adjustments: ThemeContrastGuardResult['adjustments'] } {
  let tokens = { ...sourceTokens };
  const adjustments: ThemeContrastGuardResult['adjustments'] = [];

  for (let pass = 0; pass < Math.max(1, maxPasses); pass += 1) {
    const result = applyThemeContrastGuard(tokens);
    if (result.adjustments.length === 0) break;

    tokens = result.tokens;
    adjustments.push(...result.adjustments);
  }

  return { tokens, adjustments };
}

export function compileThemeTokens(
  authoredTokens: Record<string, string>,
  options?: ThemeCompilationOptions,
): ThemeCompilationResult {
  const modeIntent = options?.modeIntent === 'dark' ? 'dark' : 'light';
  const maxPasses = options?.maxContrastPasses ?? 4;
  const authored = { ...(authoredTokens || {}) };

  const expanded = enforceAuthoredOverrides(expandTokensIfNeeded(authored, modeIntent), authored);
  const activeGuarded = applyContrastPasses(expanded, maxPasses);

  const generatedLightRaw =
    modeIntent === 'light'
      ? enforceAuthoredOverrides(
          buildFullTokens(buildModeBaseFromAnchors(authored, 'light', { preserveModeSensitiveOverrides: true })),
          authored,
        )
      : applyCrossModeAnchorOverrides(
          buildFullTokens(buildModeBaseFromAnchors(authored, 'light', { preserveModeSensitiveOverrides: false })),
          authored,
        );
  const generatedDarkRaw =
    modeIntent === 'dark'
      ? enforceAuthoredOverrides(
          buildFullTokens(buildModeBaseFromAnchors(authored, 'dark', { preserveModeSensitiveOverrides: true })),
          authored,
        )
      : applyCrossModeAnchorOverrides(
          buildFullTokens(buildModeBaseFromAnchors(authored, 'dark', { preserveModeSensitiveOverrides: false })),
          authored,
        );

  const guardedLight = applyContrastPasses(generatedLightRaw, maxPasses).tokens;
  const guardedDark = applyContrastPasses(generatedDarkRaw, maxPasses).tokens;

  const tokens = modeIntent === 'dark' ? guardedDark : guardedLight;
  const issues = auditThemeContrast(tokens);
  const criticalIssues = issues.filter((issue) => issue.level === 'error');
  const warningIssues = issues.filter((issue) => issue.level === 'warning');

  const missingRequiredTokens = REQUIRED_TOKEN_KEYS.filter((token) => !tokens[token]);
  const missingContractTokens = getContractRequiredTokens().filter((token) => !tokens[token]);

  const canActivate =
    criticalIssues.length === 0
    && missingRequiredTokens.length === 0
    && missingContractTokens.length === 0;

  return {
    modeIntent,
    tokens,
    tokensLight: guardedLight,
    tokensDark: guardedDark,
    adjustments: activeGuarded.adjustments,
    issues,
    criticalIssues,
    warningIssues,
    missingRequiredTokens,
    missingContractTokens,
    canActivate,
  };
}
