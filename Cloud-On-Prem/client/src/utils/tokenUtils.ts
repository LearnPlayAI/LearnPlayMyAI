import { REQUIRED_TOKEN_KEYS } from '@shared/brandingTokens';
import { buildFullTokens, BaseTokens } from '@shared/themeTokenBuilder';

export type BrandingTokens = Record<string, string>;

export const CRITICAL_TOKEN_FALLBACKS: BrandingTokens = {
  '--primary': 'hsl(217 91% 60%)',
  '--primary-foreground': 'hsl(0, 0%, 100%)',
  '--background': 'hsl(0, 0%, 100%)',
  '--foreground': 'hsl(222, 47%, 11%)',
  '--card': 'hsl(210, 40%, 98%)',
  '--card-foreground': 'hsl(222, 47%, 11%)',
  '--muted': 'hsl(210, 40%, 96%)',
  '--muted-foreground': 'hsl(215, 16%, 47%)',
  '--border': 'hsl(214, 32%, 91%)',
  '--input': 'hsl(214, 32%, 91%)',
  '--ring': 'hsl(217 91% 60%)',
  '--secondary': 'hsl(210, 40%, 96%)',
  '--secondary-foreground': 'hsl(222, 47%, 11%)',
  '--accent': 'hsl(210, 40%, 96%)',
  '--accent-foreground': 'hsl(222, 47%, 11%)',
  '--destructive': 'hsl(0, 84%, 60%)',
  '--destructive-foreground': 'hsl(0, 0%, 100%)',
};

export function extractBaseTokens(tokens: BrandingTokens, themeModeIntent: 'light' | 'dark' = 'light'): BaseTokens {
  const background = tokens['--background'] || 'hsl(0, 0%, 100%)';
  const foreground = tokens['--foreground'] || 'hsl(0, 0%, 10%)';
  const card = tokens['--card'] || 'hsl(220, 13%, 98%)';
  const cardForeground = tokens['--card-foreground'] || 'hsl(0, 0%, 10%)';
  const muted = tokens['--muted'] || 'hsl(220, 13%, 95%)';
  const mutedForeground = tokens['--muted-foreground'] || 'hsl(0, 0%, 45%)';
  const border = tokens['--border'] || 'hsl(0, 0%, 90%)';
  
  const isDark = themeModeIntent === 'dark';
  
  return {
    primary: tokens['--primary'] || 'hsl(217 91% 60%)',
    primaryForeground: tokens['--primary-foreground'] || 'hsl(0, 0%, 100%)',
    secondary: tokens['--secondary'] || 'hsl(220, 14%, 90%)',
    secondaryForeground: tokens['--secondary-foreground'] || 'hsl(0, 0%, 10%)',
    accent: tokens['--accent'] || 'hsl(213 94% 68%)',
    accentForeground: tokens['--accent-foreground'] || 'hsl(0, 0%, 100%)',
    background,
    foreground,
    card,
    cardForeground,
    muted,
    mutedForeground,
    border,
    ring: tokens['--ring'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gradientFrom: tokens['--gradient-from'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gradientTo: tokens['--gradient-to'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gamePrimary: tokens['--game-primary'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    gameGlow: tokens['--game-glow'] || tokens['--primary'] || 'hsl(217 91% 60%)',
    isDark,
  };
}

export function regenerateTokens(
  originalTokens: BrandingTokens,
  themeModeIntent?: 'light' | 'dark'
): BrandingTokens {
  const baseTokens = extractBaseTokens(originalTokens, themeModeIntent);
  return buildFullTokens(baseTokens);
}

function preserveAuthoredOverrides(
  generatedTokens: BrandingTokens,
  authoredTokens: BrandingTokens
): BrandingTokens {
  const next = { ...generatedTokens };
  for (const [tokenKey, authoredValue] of Object.entries(authoredTokens || {})) {
    const trimmed = String(authoredValue || '').trim();
    if (!trimmed) continue;
    next[tokenKey] = trimmed;
  }
  return next;
}

export function expandTokensForPreview(
  tokens: BrandingTokens,
  themeModeIntent?: 'light' | 'dark'
): BrandingTokens {
  if (!tokens || Object.keys(tokens).length === 0) {
    return {};
  }
  return regenerateTokens(tokens, themeModeIntent);
}

export function resolveThemeTokens(
  sourceTokens: BrandingTokens,
  themeModeIntent?: 'light' | 'dark'
): BrandingTokens {
  const raw = sourceTokens || {};
  let resolved: BrandingTokens;

  if (Object.keys(raw).length === 0) {
    resolved = { ...CRITICAL_TOKEN_FALLBACKS };
  } else {
    const presentRequired = REQUIRED_TOKEN_KEYS.filter((key) => !!raw[key]).length;
    resolved = presentRequired >= REQUIRED_TOKEN_KEYS.length
      ? { ...raw }
      : preserveAuthoredOverrides(regenerateTokens(raw, themeModeIntent), raw);
  }

  const withFallbacks = { ...resolved };
  for (const [key, fallback] of Object.entries(CRITICAL_TOKEN_FALLBACKS)) {
    if (!withFallbacks[key]) {
      withFallbacks[key] = fallback;
    }
  }

  return withFallbacks;
}
