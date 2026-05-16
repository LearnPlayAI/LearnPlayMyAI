import { Express, NextFunction, Request, Response } from 'express';
import { resolveTxt } from 'dns/promises';
import crypto from 'crypto';
import multer from 'multer';
import { storage } from './storage';
import { isOrgAdmin, isSuperAdminOrCustSuper } from './adminAuth';
import { insertBrandingThemeSchema, insertOrganizationDomainSchema } from '@shared/schema';
import { z } from 'zod';
import { ObjectStorageService } from './objectStorage';
import { buildCanonicalStorageKey, canonicalKeyToAbsolutePath } from './utils/storageKeyManager';
import sharp from 'sharp';
import { buildFullTokens } from '../shared/themeTokenBuilder';
import { REQUIRED_TOKEN_KEYS } from '../shared/brandingTokens';
import { auditThemeContrast } from '../shared/themeContrastGuard';
import { getContractRequiredTokens } from '../shared/themeComponentContracts';
import { resolveEffectiveOrganization, type RequestWithEffectiveOrg, type RequestWithOrgContext } from './middleware/sessionAuthMiddleware';
import { getPlatformDomains } from './config/base-url';
import {
  normalizeOrganizationDomainInput,
  resolveBrandingObjectPathFromUrl,
  resolveSafeBrandingAssetPath,
} from './services/brandingSecurityService';
import { getRequestedOrgIdFromQuery, resolveBrandingTargetOrgId } from './services/brandingAccessPolicy';
import { shouldResolveOrgThemeForAuthenticatedRequest } from './services/brandingRuntimeResolutionPolicy';
import { resolveThemeSaveStatus } from './services/brandingThemeStatus';
import { resolveThemeModeIntent } from './services/themeModeService';
import { buildAiAssistedPaletteTokens, recommendPaletteCandidates } from './services/themePaletteRecommendationService';
import { compileThemeTokens } from './services/themeCompilerService';

const objectStorageService = new ObjectStorageService();
const PLATFORM_DEFAULT_LOGO_URL = '/api/public/branding/platform/logo-1765016512056.png';
const PLATFORM_DEFAULT_FAVICON_URL = '/api/public/branding/platform/favicon-1765016548696.png';

const IMAGE_MAGIC_BYTES: { [key: string]: number[][] } = {
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], 
  'image/svg+xml': [[0x3C, 0x3F, 0x78, 0x6D, 0x6C], [0x3C, 0x73, 0x76, 0x67]],
};

function detectMimeTypeFromBuffer(buffer: Buffer): string | null {
  for (const [mimeType, signatures] of Object.entries(IMAGE_MAGIC_BYTES)) {
    for (const signature of signatures) {
      if (buffer.length >= signature.length) {
        let matches = true;
        for (let i = 0; i < signature.length; i++) {
          if (buffer[i] !== signature[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          return mimeType;
        }
      }
    }
  }
  return null;
}

const MAX_LOGO_WIDTH = 400;
const MAX_LOGO_HEIGHT = 200;
const MAX_FAVICON_SIZE = 64;

const brandingUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const PLATFORM_DEFAULTS = {
  orgName: 'LearnPlay',
  themeModeIntent: 'light' as 'light' | 'dark',
  logoUrl: PLATFORM_DEFAULT_LOGO_URL,
  faviconUrl: PLATFORM_DEFAULT_FAVICON_URL,
  tokens: {
    '--primary': 'hsl(217 91% 60%)',
    '--primary-foreground': 'hsl(0 0% 100%)',
    '--secondary': 'hsl(215 28% 17%)',
    '--secondary-foreground': 'hsl(0 0% 100%)',
    '--accent': 'hsl(213 94% 68%)',
    '--accent-foreground': 'hsl(215 28% 17%)',
    '--background': 'hsl(210 40% 98%)',
    '--foreground': 'hsl(215 28% 17%)'
  },
  fontHeading: 'Inter',
  fontBody: 'Inter',
  supportUrl: null,
  supportEmail: null,
  termsUrl: null,
  privacyUrl: null,
  allowEmailBranding: false,
  enableContrastCorrections: true,
  customCopy: {},
};

// ==================== TOKEN VALIDATION SCHEMA ====================

const CSS_COLOR_KEYWORDS = [
  'transparent', 'inherit', 'currentColor', 'initial', 'unset',
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
  'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet',
  'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral',
  'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey',
  'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
  'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid',
  'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
  'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose',
  'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue',
  'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue',
  'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue',
  'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen'
];

const tokenValueSchema = z.string().refine((val) => {
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 200) {
    return false;
  }
  
  const dangerousPatterns = [
    /javascript:/i,
    /expression\s*\(/i,
    /url\s*\(/i,
    /<script/i,
    /on\w+\s*=/i,
    /behavior\s*:/i,
    /-moz-binding/i,
    /import\s+/i,
    /@import/i,
    /;\s*\w/,
    /\/\*/,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  
  const hexColorPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
  const hslPattern = /^hsla?\(\s*\d{1,3}(\.\d+)?(deg|rad|grad|turn)?\s*,\s*\d{1,3}(\.\d+)?%?\s*,\s*\d{1,3}(\.\d+)?%?(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;
  const hslModernPattern = /^hsla?\(\s*\d{1,3}(\.\d+)?(deg|rad|grad|turn)?\s+\d{1,3}(\.\d+)?%?\s+\d{1,3}(\.\d+)?%?(\s*\/\s*(0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i;
  const rgbPattern = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;
  const rgbModernPattern = /^rgba?\(\s*\d{1,3}\s+\d{1,3}\s+\d{1,3}(\s*\/\s*(0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i;
  const varPattern = /^var\(--[\w-]+(\s*,\s*[^)]+)?\)$/;
  
  if (hexColorPattern.test(trimmed)) return true;
  if (hslPattern.test(trimmed)) return true;
  if (hslModernPattern.test(trimmed)) return true;
  if (rgbPattern.test(trimmed)) return true;
  if (rgbModernPattern.test(trimmed)) return true;
  if (varPattern.test(trimmed)) return true;
  if (CSS_COLOR_KEYWORDS.includes(trimmed.toLowerCase())) return true;
  
  return false;
}, 'Invalid CSS color value');

const tokenKeySchema = z.string().refine((key) => {
  return key.startsWith('--') && /^--[\w-]+$/.test(key) && key.length <= 100;
}, 'Token key must start with "--" and contain only alphanumeric characters, underscores, or hyphens');

const tokensSchema = z.record(tokenKeySchema, tokenValueSchema).optional();
const paletteRecommendationSchema = z.object({
  mode: z.enum(['secondary', 'accent']),
  primaryHex: z.string().min(3).max(32),
  secondaryHex: z.string().min(3).max(32).optional(),
  tone: z.enum(['light', 'dark']).optional(),
  count: z.number().int().min(3).max(8).optional(),
  aiModelProfile: z.enum(['fast', 'thinking']).optional(),
});
const paletteBuildSchema = z.object({
  primaryHex: z.string().min(3).max(32),
  secondaryHex: z.string().min(3).max(32),
  accentHex: z.string().min(3).max(32),
  tone: z.enum(['light', 'dark']),
  aiPreferred: z.boolean().optional(),
  strictAiOnly: z.boolean().optional(),
  autoFixContrast: z.boolean().optional(),
  aiModelProfile: z.enum(['fast', 'thinking']).optional(),
  allowAnchorAdjustments: z.boolean().optional(),
});

function sanitizeTokens(tokens: Record<string, string> | undefined): Record<string, string> {
  if (!tokens || typeof tokens !== 'object') {
    return {};
  }
  
  const sanitized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      continue;
    }
    
    const keyResult = tokenKeySchema.safeParse(key);
    const valueResult = tokenValueSchema.safeParse(value);
    
    if (keyResult.success && valueResult.success) {
      sanitized[key] = value.trim();
    }
  }
  
  return sanitized;
}

function validateTokenPayload(tokens: unknown): { valid: boolean; sanitized: Record<string, string>; errors: string[] } {
  const errors: string[] = [];
  
  if (tokens === undefined || tokens === null) {
    return { valid: true, sanitized: {}, errors: [] };
  }
  
  if (typeof tokens !== 'object' || Array.isArray(tokens)) {
    return { valid: false, sanitized: {}, errors: ['Tokens must be an object'] };
  }
  
  const tokenObj = tokens as Record<string, unknown>;
  const sanitized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(tokenObj)) {
    if (typeof value !== 'string') {
      errors.push(`Token "${key}" value must be a string`);
      continue;
    }
    
    const keyResult = tokenKeySchema.safeParse(key);
    if (!keyResult.success) {
      errors.push(`Token key "${key}" must start with "--" and contain only valid CSS variable characters`);
      continue;
    }
    
    const valueResult = tokenValueSchema.safeParse(value);
    if (!valueResult.success) {
      errors.push(`Token "${key}" has invalid CSS color value`);
      continue;
    }
    
    sanitized[key] = value.trim();
  }
  
  return { valid: errors.length === 0, sanitized, errors };
}

function computeThemeRevisionHash(tokens: Record<string, string>): string {
  const stableEntries = Object.entries(tokens || {}).sort(([a], [b]) => a.localeCompare(b));
  const stablePayload = JSON.stringify(stableEntries);
  return crypto.createHash('sha256').update(stablePayload).digest('hex');
}

function withThemeSystemMeta(
  customCopy: unknown,
  meta: {
    revisionHash: string;
    canActivate: boolean;
    criticalIssueCount: number;
    warningIssueCount: number;
    generatedAt: string;
  },
): Record<string, unknown> {
  const base =
    customCopy && typeof customCopy === 'object' && !Array.isArray(customCopy)
      ? { ...(customCopy as Record<string, unknown>) }
      : {};
  base.__themeSystem = meta;
  return base;
}

// ==================== TOKEN EXPANSION HELPERS ====================

function getLightness(hslColor: string): number {
  const normalized = String(hslColor || '').trim();
  const match = normalized.match(
    /hsl[a]?\(\s*(\d+(?:\.\d+)?)(?:deg|rad|grad|turn)?(?:,|\s)\s*(\d+(?:\.\d+)?)%\s*(?:,|\s)\s*(\d+(?:\.\d+)?)%/i
  );
  if (!match) return 50;
  return parseFloat(match[3]);
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
    /hsl[a]?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?(?:,|\s)\s*([0-9.]+)%\s*(?:,|\s)\s*([0-9.]+)%/i
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

function enforceAuthoredOverrides(
  tokens: Record<string, string>,
  authored: Record<string, string>
): Record<string, string> {
  const next = { ...tokens };
  for (const [key, value] of Object.entries(authored)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    next[key] = trimmed;
  }
  return next;
}

function buildModeBaseFromAnchors(
  authored: Record<string, string>,
  modeIntent: 'light' | 'dark'
) {
  const isDark = modeIntent === 'dark';
  const primary = resolveAnchorValue(authored['--primary'], 'hsl(217 91% 60%)');
  const secondary = resolveAnchorValue(authored['--secondary'], 'hsl(220, 14%, 20%)');
  const accent = resolveAnchorValue(authored['--accent'], 'hsl(213 94% 68%)');
  const primaryHue = getHueFromColor(primary, 220);
  return {
    primary,
    primaryForeground: resolveAnchorValue(authored['--primary-foreground'], isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)'),
    secondary,
    secondaryForeground: resolveAnchorValue(authored['--secondary-foreground'], 'hsl(0, 0%, 100%)'),
    accent,
    accentForeground: resolveAnchorValue(authored['--accent-foreground'], isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)'),
    background: resolveAnchorValue(authored['--background'], isDark ? `hsl(${primaryHue}, 20%, 8%)` : `hsl(${primaryHue}, 28%, 97%)`),
    foreground: resolveAnchorValue(authored['--foreground'], isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)'),
    card: resolveAnchorValue(authored['--card'], isDark ? `hsl(${primaryHue}, 18%, 11%)` : 'hsl(0, 0%, 100%)'),
    cardForeground: resolveAnchorValue(authored['--card-foreground'], isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)'),
    muted: resolveAnchorValue(authored['--muted'], isDark ? `hsl(${primaryHue}, 14%, 16%)` : `hsl(${primaryHue}, 18%, 92%)`),
    mutedForeground: resolveAnchorValue(authored['--muted-foreground'], isDark ? 'hsl(0, 0%, 65%)' : 'hsl(220, 12%, 42%)'),
    border: resolveAnchorValue(authored['--border'], isDark ? `hsl(${primaryHue}, 16%, 24%)` : `hsl(${primaryHue}, 18%, 84%)`),
    ring: resolveAnchorValue(authored['--ring'], primary),
    gradientFrom: resolveAnchorValue(authored['--gradient-from'], primary),
    gradientTo: resolveAnchorValue(authored['--gradient-to'], primary),
    gamePrimary: resolveAnchorValue(authored['--game-primary'], accent),
    gameGlow: resolveAnchorValue(authored['--game-glow'], accent),
    isDark,
  };
}

function expandTokensIfNeeded(tokens: Record<string, string>, modeIntent: 'light' | 'dark' = 'light'): Record<string, string> {
  const presentRequired = REQUIRED_TOKEN_KEYS.filter((key) => !!tokens[key]).length;
  const isDark = modeIntent === 'dark';
  return presentRequired >= REQUIRED_TOKEN_KEYS.length
    ? tokens
    : buildFullTokens({
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

function prepareThemeTokensForPersistence(
  tokens: Record<string, string>,
  themeModeIntent: 'light' | 'dark' = 'light'
) {
  const compiled = compileThemeTokens(tokens, { modeIntent: themeModeIntent });
  return {
    tokens: compiled.tokens,
    tokensLight: compiled.tokensLight,
    tokensDark: compiled.tokensDark,
    adjustments: compiled.adjustments,
    remainingIssues: compiled.issues,
    criticalIssues: compiled.criticalIssues,
    missingContractTokens: compiled.missingContractTokens,
    missingRequiredTokens: compiled.missingRequiredTokens,
    canActivate: compiled.canActivate,
  };
}

function mergeThemeTokensForUpdate(
  existingTokens: Record<string, string> | null | undefined,
  incomingTokens: Record<string, string>
): Record<string, string> {
  return {
    ...(existingTokens || {}),
    ...incomingTokens,
  };
}

// ==================== RATE LIMITING ====================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000);

function checkRateLimit(userId: string, orgId: string | null): { allowed: boolean; retryAfter?: number } {
  const key = orgId ? `org:${orgId}` : `user:${userId}`;
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  entry.count++;
  return { allowed: true };
}

// ==================== ORG OWNERSHIP VALIDATION ====================

async function validateOrgOwnership(req: Request, organizationId: string): Promise<{ valid: boolean; error?: string }> {
  if (!req.session?.userId) {
    return { valid: false, error: 'Authentication required' };
  }

  if ((req as any).resolvedOrganizationId === organizationId) {
    return { valid: true };
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return { valid: false, error: 'User not found' };
  }
  
  if (user.isSuperAdmin || user.isCustSuper) {
    return { valid: true };
  }
  
  if (req.session.context) {
    const { impersonatedOrganization, primaryOrganization } = req.session.context;
    
    if (impersonatedOrganization?.orgId === organizationId) {
      return { valid: true };
    }
    
    if (primaryOrganization?.orgId === organizationId) {
      const hasAdminRole = primaryOrganization.roles?.includes('org_admin') || false;
      if (hasAdminRole) {
        return { valid: true };
      }
      return { valid: false, error: 'Organization admin access required' };
    }
    
    return { valid: false, error: 'Access denied: You do not have access to this organization' };
  }
  
  if (req.session.organizationId === organizationId) {
    return { valid: true };
  }
  
  return { valid: false, error: 'Access denied: You do not have access to this organization' };
}

async function getEffectiveOrgId(req: Request): Promise<string | null> {
  const reqWithResolvedOrg = req as Request & { resolvedOrganizationId?: string | null };
  const resolvedOrgId = reqWithResolvedOrg.resolvedOrganizationId || null;
  const requestedOrgId = getRequestedOrgIdFromQuery(req.query as Record<string, unknown>);

  if (resolvedOrgId && !requestedOrgId) {
    return resolvedOrgId;
  }

  let effectiveOrgId: string | null = resolvedOrgId;
  const reqWithOrg = req as RequestWithOrgContext;
  if (!effectiveOrgId && reqWithOrg.orgContext?.organizationId) {
    effectiveOrgId = reqWithOrg.orgContext.organizationId;
  }
  if (!effectiveOrgId) {
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    effectiveOrgId = effectiveOrg.organizationId;
  }

  const userId = req.session?.userId;
  if (!userId) {
    return effectiveOrgId;
  }
  const user = await storage.getUser(userId);

  return resolveBrandingTargetOrgId({
    requestedOrgId,
    effectiveOrgId,
    isSuperAdmin: !!user?.isSuperAdmin,
    isCustSuper: !!user?.isCustSuper,
  });
}

export function registerBrandingRoutes(app: Express) {
  const onpremBrandingGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { getOnpremRolePolicy } = await import('./services/onpremLicensePolicy');
      const policy = await getOnpremRolePolicy();
      if (policy.onpremMode && !policy.hasValidLicense) {
        return res.status(403).json({
          message: 'Branding and white-label administration is disabled on unlicensed on-prem systems.',
          code: 'ONPREM_LICENSE_REQUIRED_FOR_BRANDING',
        });
      }
      return next();
    } catch (error) {
      console.error('[Branding] Failed to evaluate on-prem branding policy:', error);
      return res.status(500).json({ message: 'Failed to evaluate branding access policy' });
    }
  };

  const platformDomains = getPlatformDomains();

  const authenticatedRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

  const handlePaletteRecommendation = async (req: Request, res: Response) => {
    try {
      const payload = paletteRecommendationSchema.parse(req.body || {});
      const result = await recommendPaletteCandidates(payload);
      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid palette recommendation payload', details: error.errors });
      }
      console.error('[Branding] Failed to generate palette recommendations:', error);
      return res.status(500).json({ error: 'Failed to generate palette recommendations' });
    }
  };
  const handlePaletteBuild = async (req: Request, res: Response) => {
    try {
      const payload = paletteBuildSchema.parse(req.body || {});
      const result = await buildAiAssistedPaletteTokens(payload);
      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid palette build payload', details: error.errors });
      }
      const statusCode = Number((error as any)?.statusCode || 500);
      if (statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({
          error: (error as Error)?.message || 'AI palette synthesis failed',
          recommendations: Array.isArray((error as any)?.recommendations) ? (error as any).recommendations : [],
        });
      }
      console.error('[Branding] Failed to build AI-assisted palette:', error);
      return res.status(500).json({ error: 'Failed to build AI-assisted palette' });
    }
  };

  app.post('/api/branding/palette/recommend', isOrgAdmin, onpremBrandingGate, handlePaletteRecommendation);
  app.post('/api/superadmin/branding/palette/recommend', isSuperAdminOrCustSuper, onpremBrandingGate, handlePaletteRecommendation);
  app.post('/api/branding/palette/build', isOrgAdmin, onpremBrandingGate, handlePaletteBuild);
  app.post('/api/superadmin/branding/palette/build', isSuperAdminOrCustSuper, onpremBrandingGate, handlePaletteBuild);

  // ==================== SERVE BRANDING IMAGES FROM OBJECT STORAGE ====================
  // Route to serve logo and favicon images from /api/public/branding/...
  app.get('/api/public/branding/:folder/:filename', async (req: Request, res: Response) => {
    try {
      const { folder, filename } = req.params;
      const objectPath = resolveSafeBrandingAssetPath(folder, filename);
      if (!objectPath) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      const file = await objectStorageService.searchPublicObject(objectPath);
      if (!file) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || 'image/png';
      
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      
      const stream = file.createReadStream();
      stream.pipe(res);
    } catch (error) {
      console.error('[Branding] Error serving branding image:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });
  
  app.use(async (req: Request, res: Response, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    
    if (req.path.startsWith('/api/') || req.path.startsWith('/assets/') || req.path.startsWith('/_') || req.path.startsWith('/static') || req.path.startsWith('/icons/')) {
      return next();
    }
    
    if (authenticatedRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    const isPlatformDomain = platformDomains.some(d => host === d || host.endsWith(`.${d}`));

    if (isPlatformDomain) {
      return next();
    }

    if (!req.session?.userId) {
      try {
        const orgDomain = await storage.getOrganizationDomainByDomain(host);
        if (orgDomain && orgDomain.verified) {
          return res.redirect('/login');
        }
      } catch (error) {
        console.error('[Branding] Domain redirect error:', error);
      }
    }

    next();
  });

  const applyNoStoreThemeHeaders = (res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Vary', 'Host, Cookie, X-Organization-Context');
  };

  app.get('/api/theme/resolved', async (req: Request, res: Response) => {
    try {
      applyNoStoreThemeHeaders(res);
      const host = (req.headers.host || '').split(':')[0].toLowerCase();
      const isPlatformDomain = platformDomains.some(d => host === d || host.endsWith(`.${d}`));
      const hasExplicitOrgContext = typeof req.headers['x-organization-context'] === 'string'
        && req.headers['x-organization-context'].trim().length > 0;
      const effectiveRole = req.session?.context?.effectiveRole;
      const isPlatformAdmin = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';
      const isImpersonating = !!req.session?.context?.impersonatedOrganization;
      
      const formatThemeResponse = (theme: any, isOrgDomain: boolean, isPlatformTheme: boolean) => ({
        isOrgDomain,
        isPlatformTheme,
        orgName: theme.orgName || PLATFORM_DEFAULTS.orgName,
        themeModeIntent: resolveThemeModeIntent({
          explicit: theme.themeModeIntent,
          tokens: (theme.tokens as Record<string, string>) || {},
          tokensLight: (theme.tokensLight as Record<string, string> | null) || null,
          tokensDark: (theme.tokensDark as Record<string, string> | null) || null,
        }),
        logoUrl: theme.logoUrl || (isPlatformTheme ? PLATFORM_DEFAULTS.logoUrl : null),
        faviconUrl: theme.faviconUrl || (isPlatformTheme ? PLATFORM_DEFAULTS.faviconUrl : null),
        tokens: (() => {
          const modeIntent = resolveThemeModeIntent({
            explicit: theme.themeModeIntent,
            tokens: (theme.tokens as Record<string, string>) || {},
            tokensLight: (theme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (theme.tokensDark as Record<string, string> | null) || null,
          });
          const selectedTokens =
            modeIntent === 'dark'
              ? ((theme.tokensDark as Record<string, string> | null) || (theme.tokens as Record<string, string>) || {})
              : ((theme.tokensLight as Record<string, string> | null) || (theme.tokens as Record<string, string>) || {});
          return selectedTokens;
        })(),
        fontHeading: theme.fontHeading || 'Inter',
        fontBody: theme.fontBody || 'Inter',
        supportUrl: theme.supportUrl,
        supportEmail: theme.supportEmail,
        termsUrl: theme.termsUrl,
        privacyUrl: theme.privacyUrl,
        allowEmailBranding: theme.allowEmailBranding || false,
        enableContrastCorrections: theme.enableContrastCorrections !== false,
        customCopy: theme.customCopy || {},
      });
      
      const getPlatformFallback = async () => {
        const platformTheme = await storage.getActivePlatformDefaultTheme();
        if (platformTheme) {
          return formatThemeResponse(platformTheme, false, true);
        }
        return { isOrgDomain: false, isPlatformTheme: false, ...PLATFORM_DEFAULTS };
      };
      
      // Priority 1: Check if user is authenticated and get their org's theme
      // This applies to ALL users in an org (learners, teachers, admins) - not just admins
      const shouldResolveOrgTheme = shouldResolveOrgThemeForAuthenticatedRequest({
        isAuthenticated: !!req.session?.userId,
        isPlatformDomain,
        isPlatformAdmin,
        isImpersonating,
        hasExplicitOrgContext,
      });

      if (shouldResolveOrgTheme && req.session?.userId) {
        const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
        const targetOrgId = effectiveOrg.organizationId;
        
        // If we found an org for this user, try to get their org's active theme
        if (targetOrgId) {
          const orgTheme = await storage.getActiveBrandingThemeByOrgId(targetOrgId);
          
          if (orgTheme) {
            return res.json(formatThemeResponse(orgTheme, true, false));
          }
          // Org exists but no active theme - fall through to platform defaults
        }
      }
      
      // Priority 2: For unauthenticated users, check custom domain branding
      if (!isPlatformDomain) {
        const orgDomain = await storage.getOrganizationDomainByDomain(host);
        
        if (orgDomain?.verified && orgDomain?.isActive) {
          const domainTheme = await storage.getActiveBrandingThemeByOrgId(orgDomain.organizationId);
          
          if (domainTheme) {
            return res.json(formatThemeResponse(domainTheme, true, false));
          }
        }
      }
      
      // Priority 3: Fall back to platform theme or defaults
      return res.json(await getPlatformFallback());
      
    } catch (error) {
      console.error('[Branding] Error resolving theme:', error);
      res.json({
        isOrgDomain: false,
        isPlatformTheme: false,
        ...PLATFORM_DEFAULTS,
      });
    }
  });

  // ==================== DYNAMIC PWA MANIFEST ENDPOINT ====================
  // Returns a dynamically generated manifest.json based on organization branding
  // This enables white-label PWA installs with custom name, colors, icons, and description
  app.get('/api/branding/manifest', async (req: Request, res: Response) => {
    try {
      const host = (req.headers.host || '').split(':')[0].toLowerCase();
      const isPlatformDomain = platformDomains.some(d => host === d || host.endsWith(`.${d}`));
      const hasExplicitOrgContext = typeof req.headers['x-organization-context'] === 'string'
        && req.headers['x-organization-context'].trim().length > 0;
      const effectiveRole = req.session?.context?.effectiveRole;
      const isPlatformAdmin = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';
      const isImpersonating = !!req.session?.context?.impersonatedOrganization;
      
      let orgName = 'LearnPlay';
      let description = 'Gamified quizzes for test preparation - Learn, compete, and track your progress';
      let themeColor = '#2563eb';
      let backgroundColor = '#1a1a1a';
      let shortName = 'LearnPlay';
      let logoUrl: string | null = null;
      let faviconUrl: string | null = null;
      
      // Helper to extract color from tokens
      const extractColor = (tokens: Record<string, string> | null | undefined, key: string, fallback: string): string => {
        if (!tokens) return fallback;
        const value = tokens[`--${key}`];
        return value || fallback;
      };
      
      const applyTheme = (theme: any) => {
        const tokens = theme.tokens as Record<string, string> | null;
        orgName = theme.orgName || orgName;
        shortName = theme.orgName?.substring(0, 12) || shortName;
        description = `${theme.orgName} - Your complete learning platform`;
        themeColor = extractColor(tokens, 'primary', themeColor);
        backgroundColor = extractColor(tokens, 'background', backgroundColor);
        logoUrl = theme.logoUrl || null;
        faviconUrl = theme.faviconUrl || null;
      };

      let themeResolved = false;

      const shouldResolveOrgTheme = shouldResolveOrgThemeForAuthenticatedRequest({
        isAuthenticated: !!req.session?.userId,
        isPlatformDomain,
        isPlatformAdmin,
        isImpersonating,
        hasExplicitOrgContext,
      });

      if (shouldResolveOrgTheme && req.session?.userId) {
        const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
        const targetOrgId = effectiveOrg.organizationId;
        if (targetOrgId) {
          const orgTheme = await storage.getActiveBrandingThemeByOrgId(targetOrgId);
          if (orgTheme) {
            applyTheme(orgTheme);
            themeResolved = true;
          }
        }
      }

      if (!themeResolved && !isPlatformDomain) {
        const orgDomain = await storage.getOrganizationDomainByDomain(host);
        if (orgDomain?.verified && orgDomain?.isActive) {
          const theme = await storage.getActiveBrandingThemeByOrgId(orgDomain.organizationId);
          if (theme) {
            applyTheme(theme);
            themeResolved = true;
          }
        }
      }

      if (!themeResolved) {
        const platformTheme = await storage.getActivePlatformDefaultTheme();
        if (platformTheme) {
          applyTheme(platformTheme);
        }
      }
      
      // Build icons array - always include valid platform icons for PWA installability
      // When org has custom branding, add their icon as a higher-priority option
      const customIcon = faviconUrl || logoUrl;
      
      const platformFavicon = PLATFORM_DEFAULT_FAVICON_URL;
      
      const defaultIcons: Array<{ src: string; sizes: string; type: string; purpose?: string }> = [
        { src: platformFavicon, sizes: 'any', type: 'image/png', purpose: 'any' },
        { src: platformFavicon, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: platformFavicon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ];
      
      const icons = customIcon ? [
        { src: customIcon, sizes: 'any', type: 'image/png', purpose: 'any' },
        { src: customIcon, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: customIcon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ] : defaultIcons;
      
      // Generate dynamic manifest
      const manifest = {
        name: orgName,
        short_name: shortName,
        description,
        start_url: '/',
        display: 'standalone',
        background_color: backgroundColor,
        theme_color: themeColor,
        orientation: 'portrait',
        scope: '/',
        categories: ['education', 'entertainment'],
        icons,
      };
      
      res.setHeader('Content-Type', 'application/manifest+json');
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.json(manifest);
    } catch (error) {
      console.error('[Branding] Error generating manifest:', error);
      // Return default manifest on error
      res.setHeader('Content-Type', 'application/manifest+json');
      res.json({
        name: 'LearnPlay - Gamified Quiz Learning Platform',
        short_name: 'LearnPlay',
        description: 'Gamified quizzes for test preparation - Learn, compete, and track your progress',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a1a1a',
        theme_color: '#9333ea',
        orientation: 'portrait',
        scope: '/',
        categories: ['education', 'entertainment'],
        icons: [
          { src: PLATFORM_DEFAULT_FAVICON_URL, sizes: 'any', type: 'image/png', purpose: 'any' },
          { src: PLATFORM_DEFAULT_FAVICON_URL, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: PLATFORM_DEFAULT_FAVICON_URL, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      });
    }
  });

  // ==================== EMBED STYLES CSS ENDPOINT ====================
  // Returns compiled CSS stylesheet with organization's theme tokens for external embedding
  // Usage: <link rel="stylesheet" href="https://[domain]/api/theme/embed-styles?orgId=[id]">
  app.get('/api/theme/embed-styles', async (req: Request, res: Response) => {
    try {
      const orgId = req.query.orgId as string | undefined;
      
      // Set CORS headers for cross-origin embedding
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Set caching headers (cache for 5 minutes, stale-while-revalidate for 1 hour)
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      
      let tokens: Record<string, string> = {};
      let fontHeading = 'Inter';
      let fontBody = 'Inter';
      let themeModeIntent: 'light' | 'dark' = 'light';
      
      if (orgId) {
        // Get theme for specific organization
        const theme = await storage.getActiveBrandingThemeByOrgId(orgId);
        if (theme) {
          themeModeIntent = resolveThemeModeIntent({
            explicit: theme.themeModeIntent,
            tokens: (theme.tokens as Record<string, string>) || {},
            tokensLight: (theme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (theme.tokensDark as Record<string, string> | null) || null,
          });
          tokens =
            themeModeIntent === 'dark'
              ? ((theme.tokensDark as Record<string, string> | null) || (theme.tokens as Record<string, string>) || {})
              : ((theme.tokensLight as Record<string, string> | null) || (theme.tokens as Record<string, string>) || {});
          fontHeading = theme.fontHeading || 'Inter';
          fontBody = theme.fontBody || 'Inter';
        } else {
          // Fall back to platform default theme
          const platformTheme = await storage.getActivePlatformDefaultTheme();
          if (platformTheme) {
            themeModeIntent = resolveThemeModeIntent({
              explicit: platformTheme.themeModeIntent,
              tokens: (platformTheme.tokens as Record<string, string>) || {},
              tokensLight: (platformTheme.tokensLight as Record<string, string> | null) || null,
              tokensDark: (platformTheme.tokensDark as Record<string, string> | null) || null,
            });
            tokens =
              themeModeIntent === 'dark'
                ? ((platformTheme.tokensDark as Record<string, string> | null) || (platformTheme.tokens as Record<string, string>) || {})
                : ((platformTheme.tokensLight as Record<string, string> | null) || (platformTheme.tokens as Record<string, string>) || {});
            fontHeading = platformTheme.fontHeading || 'Inter';
            fontBody = platformTheme.fontBody || 'Inter';
          }
        }
      } else {
        // No orgId provided, use platform default
        const platformTheme = await storage.getActivePlatformDefaultTheme();
        if (platformTheme) {
          themeModeIntent = resolveThemeModeIntent({
            explicit: platformTheme.themeModeIntent,
            tokens: (platformTheme.tokens as Record<string, string>) || {},
            tokensLight: (platformTheme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (platformTheme.tokensDark as Record<string, string> | null) || null,
          });
          tokens =
            themeModeIntent === 'dark'
              ? ((platformTheme.tokensDark as Record<string, string> | null) || (platformTheme.tokens as Record<string, string>) || {})
              : ((platformTheme.tokensLight as Record<string, string> | null) || (platformTheme.tokens as Record<string, string>) || {});
          fontHeading = platformTheme.fontHeading || 'Inter';
          fontBody = platformTheme.fontBody || 'Inter';
        }
      }

      tokens = { ...tokens };
      
      // Build CSS with all theme tokens
      let css = `/* LearnPlay Embed Theme Styles */\n`;
      css += `/* Organization ID: ${orgId || 'platform-default'} */\n`;
      css += `/* Generated: ${new Date().toISOString()} */\n\n`;
      css += `:root {\n`;
      
      // Add font variables
      css += `  --font-heading: ${fontHeading};\n`;
      css += `  --font-body: ${fontBody};\n`;
      
      // Add all theme tokens
      const tokenEntries = Object.entries(tokens);
      if (tokenEntries.length > 0) {
        for (const [key, value] of tokenEntries) {
          if (key.startsWith('--') && value) {
            // Ensure the value is safe CSS
            const safeValue = value.replace(/[<>]/g, '');
            css += `  ${key}: ${safeValue};\n`;
          }
        }
      } else {
        // If no tokens, add comment indicating default theme
        css += `  /* No custom tokens defined - using browser defaults */\n`;
      }
      
      css += `}\n`;
      
      // Add embed-specific helper styles
      css += `\n/* Embed Helper Styles */\n`;
      css += `.embed-themed {\n`;
      css += `  font-family: var(--font-body), system-ui, sans-serif;\n`;
      css += `  color: var(--foreground, inherit);\n`;
      css += `  background-color: var(--background, inherit);\n`;
      css += `}\n`;
      
      css += `.embed-themed-heading {\n`;
      css += `  font-family: var(--font-heading), system-ui, sans-serif;\n`;
      css += `}\n`;
      
      res.send(css);
    } catch (error) {
      console.error('[Branding] Error generating embed styles:', error);
      // Return minimal valid CSS on error
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`/* Error loading theme styles */\n:root {}\n`);
    }
  });

  app.get('/api/theme', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      applyNoStoreThemeHeaders(res);
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const theme = await storage.getBrandingThemeByOrgId(organizationId);
      res.json({ theme: theme || null });
    } catch (error) {
      console.error('[Branding] Error fetching theme:', error);
      res.status(500).json({ error: 'Failed to fetch theme' });
    }
  });

  app.post('/api/theme', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const rateLimit = checkRateLimit(userId, organizationId);
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter));
        return res.status(429).json({ 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimit.retryAfter
        });
      }
      
      const tokenValidation = validateTokenPayload(req.body.tokens);
      if (!tokenValidation.valid) {
        return res.status(400).json({ 
          error: 'Invalid token payload',
          details: tokenValidation.errors
        });
      }
      
      const existingTheme = await storage.getBrandingThemeByOrgId(organizationId);
      const nextStatus = resolveThemeSaveStatus(existingTheme?.status);
      const mergedTokens = mergeThemeTokensForUpdate(
        (existingTheme?.tokens as Record<string, string> | null | undefined) || {},
        tokenValidation.sanitized
      );
      const themeModeIntent = resolveThemeModeIntent({
        explicit: req.body.themeModeIntent ?? existingTheme?.themeModeIntent,
        tokens: mergedTokens,
        tokensLight: (existingTheme?.tokensLight as Record<string, string> | null | undefined) || null,
        tokensDark: (existingTheme?.tokensDark as Record<string, string> | null | undefined) || null,
      });
      const preparedTokens = prepareThemeTokensForPersistence(mergedTokens, themeModeIntent);
      const revisionHash = computeThemeRevisionHash(preparedTokens.tokens);

      const validatedData = insertBrandingThemeSchema.parse({
        ...req.body,
        themeModeIntent,
        tokens: preparedTokens.tokens,
        tokensLight: preparedTokens.tokensLight,
        tokensDark: preparedTokens.tokensDark,
        organizationId,
        status: nextStatus,
        gradientEnabled: false,
        gradientFrom: null,
        gradientTo: null,
        gradientAngle: null,
        customCopy: withThemeSystemMeta(req.body.customCopy, {
          revisionHash,
          canActivate: preparedTokens.canActivate,
          criticalIssueCount: preparedTokens.criticalIssues.length,
          warningIssueCount: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          generatedAt: new Date().toISOString(),
        }),
      });
      
      const theme = await storage.upsertBrandingTheme(validatedData);
      res.json({
        theme,
        contrastAdjustments: preparedTokens.adjustments.length,
        contrastWarnings: preparedTokens.remainingIssues.length,
        activationReady: preparedTokens.canActivate,
        validation: {
          criticalIssues: preparedTokens.criticalIssues.length,
          warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          missingRequiredTokens: preparedTokens.missingRequiredTokens,
          missingContractTokens: preparedTokens.missingContractTokens,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Branding] Error saving theme:', error);
      res.status(500).json({ error: 'Failed to save theme' });
    }
  });

  app.post('/api/theme/activate', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const existingTheme = await storage.getBrandingThemeByOrgId(organizationId);
      if (!existingTheme) {
        const org = await storage.getOrganization(organizationId);
        const platformTheme = await storage.getPlatformDefaultTheme();
        const fallbackModeIntent = resolveThemeModeIntent({
          explicit: platformTheme?.themeModeIntent,
          tokens: ((platformTheme?.tokens as Record<string, string> | null | undefined) || PLATFORM_DEFAULTS.tokens) as Record<string, string>,
          tokensLight: (platformTheme?.tokensLight as Record<string, string> | null | undefined) || null,
          tokensDark: (platformTheme?.tokensDark as Record<string, string> | null | undefined) || null,
        });
        const fallbackPreparedTokens = prepareThemeTokensForPersistence(
          ((platformTheme?.tokens as Record<string, string> | null | undefined) || PLATFORM_DEFAULTS.tokens) as Record<string, string>,
          fallbackModeIntent,
        );
        if (!fallbackPreparedTokens.canActivate) {
          return res.status(422).json({
            error: 'Theme activation blocked: no saved organization theme and fallback platform theme is not activation-ready.',
            validation: {
              criticalIssues: fallbackPreparedTokens.criticalIssues,
              warningIssues: fallbackPreparedTokens.remainingIssues.filter((issue) => issue.level === 'warning'),
              missingRequiredTokens: fallbackPreparedTokens.missingRequiredTokens,
              missingContractTokens: fallbackPreparedTokens.missingContractTokens,
            },
          });
        }
        await storage.upsertBrandingTheme(insertBrandingThemeSchema.parse({
          orgName: org?.name || PLATFORM_DEFAULTS.orgName,
          organizationId,
          status: 'draft',
          themeModeIntent: fallbackModeIntent,
          tokens: fallbackPreparedTokens.tokens,
          tokensLight: fallbackPreparedTokens.tokensLight,
          tokensDark: fallbackPreparedTokens.tokensDark,
          logoUrl: platformTheme?.logoUrl || PLATFORM_DEFAULTS.logoUrl,
          faviconUrl: platformTheme?.faviconUrl || PLATFORM_DEFAULTS.faviconUrl,
          fontHeading: platformTheme?.fontHeading || PLATFORM_DEFAULTS.fontHeading,
          fontBody: platformTheme?.fontBody || PLATFORM_DEFAULTS.fontBody,
          supportUrl: platformTheme?.supportUrl || PLATFORM_DEFAULTS.supportUrl,
          supportEmail: platformTheme?.supportEmail || PLATFORM_DEFAULTS.supportEmail,
          termsUrl: platformTheme?.termsUrl || PLATFORM_DEFAULTS.termsUrl,
          privacyUrl: platformTheme?.privacyUrl || PLATFORM_DEFAULTS.privacyUrl,
          allowEmailBranding: platformTheme?.allowEmailBranding ?? PLATFORM_DEFAULTS.allowEmailBranding,
          enableContrastCorrections: platformTheme?.enableContrastCorrections ?? PLATFORM_DEFAULTS.enableContrastCorrections,
          presetId: platformTheme?.presetId || null,
          gradientEnabled: false,
          gradientFrom: null,
          gradientTo: null,
          gradientAngle: null,
          customCopy: withThemeSystemMeta(platformTheme?.customCopy || PLATFORM_DEFAULTS.customCopy, {
            revisionHash: computeThemeRevisionHash(fallbackPreparedTokens.tokens),
            canActivate: true,
            criticalIssueCount: 0,
            warningIssueCount: fallbackPreparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
            generatedAt: new Date().toISOString(),
          }),
        }));
      }

      const themeToActivate = await storage.getBrandingThemeByOrgId(organizationId);
      if (!themeToActivate) {
        return res.status(404).json({ error: 'No theme found to activate' });
      }

      const activeModeIntent = resolveThemeModeIntent({
        explicit: themeToActivate.themeModeIntent,
        tokens: (themeToActivate.tokens as Record<string, string>) || {},
        tokensLight: (themeToActivate.tokensLight as Record<string, string> | null) || null,
        tokensDark: (themeToActivate.tokensDark as Record<string, string> | null) || null,
      });
      const preparedTokens = prepareThemeTokensForPersistence(
        (themeToActivate.tokens as Record<string, string>) || {},
        activeModeIntent
      );
      const allowCriticalAdvisories = req.body?.allowCriticalAdvisories === true;
      const effectiveRole = req.session?.context?.effectiveRole;
      const canUseCriticalOverride = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';
      const canActivateWithAcknowledgedCritical =
        canUseCriticalOverride
        && allowCriticalAdvisories
        && preparedTokens.criticalIssues.length > 0
        && preparedTokens.missingRequiredTokens.length === 0
        && preparedTokens.missingContractTokens.length === 0;
      if (allowCriticalAdvisories && !canUseCriticalOverride) {
        return res.status(403).json({
          error: 'Critical advisory activation override requires SuperAdmin or CustSuper privileges.',
        });
      }
      if (!preparedTokens.canActivate) {
        if (canActivateWithAcknowledgedCritical) {
          console.warn('[Branding] Activating org theme with acknowledged critical accessibility advisories.', {
            organizationId,
            criticalIssues: preparedTokens.criticalIssues.length,
            warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          });
        } else {
        return res.status(422).json({
          error: 'Theme activation blocked: unresolved accessibility or token contract issues remain.',
          validation: {
            criticalIssues: preparedTokens.criticalIssues,
            warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning'),
            missingRequiredTokens: preparedTokens.missingRequiredTokens,
            missingContractTokens: preparedTokens.missingContractTokens,
          },
        });
        }
      }

      const validatedDraftData = insertBrandingThemeSchema.parse({
        orgName: themeToActivate.orgName,
        organizationId,
        status: 'draft',
        themeModeIntent: activeModeIntent,
        tokens: preparedTokens.tokens,
        tokensLight: preparedTokens.tokensLight,
        tokensDark: preparedTokens.tokensDark,
        logoUrl: themeToActivate.logoUrl || null,
        faviconUrl: themeToActivate.faviconUrl || null,
        fontHeading: themeToActivate.fontHeading || 'Inter',
        fontBody: themeToActivate.fontBody || 'Inter',
        supportUrl: themeToActivate.supportUrl || null,
        supportEmail: themeToActivate.supportEmail || null,
        termsUrl: themeToActivate.termsUrl || null,
        privacyUrl: themeToActivate.privacyUrl || null,
        allowEmailBranding: themeToActivate.allowEmailBranding || false,
        enableContrastCorrections: themeToActivate.enableContrastCorrections !== false,
        presetId: themeToActivate.presetId || null,
        gradientEnabled: false,
        gradientFrom: null,
        gradientTo: null,
        gradientAngle: null,
        customCopy: withThemeSystemMeta(themeToActivate.customCopy, {
          revisionHash: computeThemeRevisionHash(preparedTokens.tokens),
          canActivate: true,
          criticalIssueCount: 0,
          warningIssueCount: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          generatedAt: new Date().toISOString(),
        }),
      });
      await storage.upsertBrandingTheme(validatedDraftData);
      
      const theme = await storage.activateBrandingTheme(organizationId);
      
      res.json({
        theme,
        contrastAdjustments: preparedTokens.adjustments.length,
        validation: {
          criticalIssues: 0,
          warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
        },
      });
    } catch (error) {
      console.error('[Branding] Error activating theme:', error);
      res.status(500).json({ error: 'Failed to activate theme' });
    }
  });

  app.post('/api/theme/reset', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const { presetTokens, presetId } = req.body;
      
      if (presetTokens && presetId) {
        const tokenValidation = validateTokenPayload(presetTokens);
        if (!tokenValidation.valid) {
          return res.status(400).json({
            error: 'Invalid token payload',
            details: tokenValidation.errors
          });
        }

        const preparedTokens = prepareThemeTokensForPersistence(tokenValidation.sanitized, 'light');

        const theme = await storage.resetBrandingTheme(
          organizationId,
          {
            presetTokens: preparedTokens.tokens,
            presetId,
            themeModeIntent: 'light',
            tokensLight: preparedTokens.tokensLight,
            tokensDark: preparedTokens.tokensDark,
          }
        );
        res.json({
          success: true,
          theme,
          contrastAdjustments: preparedTokens.adjustments.length,
          contrastWarnings: preparedTokens.remainingIssues.length,
        });
      } else {
        await storage.resetBrandingTheme(organizationId);
        const org = await storage.getOrganization(organizationId);
        const platformTheme = await storage.getPlatformDefaultTheme();
        const fallbackMode = resolveThemeModeIntent({
          explicit: platformTheme?.themeModeIntent,
          tokens: (platformTheme?.tokens as Record<string, string>) || PLATFORM_DEFAULTS.tokens,
          tokensLight: (platformTheme?.tokensLight as Record<string, string> | null | undefined) || null,
          tokensDark: (platformTheme?.tokensDark as Record<string, string> | null | undefined) || null,
        });
        const fallbackTokens = expandTokensIfNeeded(
          ((platformTheme?.tokens as Record<string, string>) || PLATFORM_DEFAULTS.tokens) as Record<string, string>,
          fallbackMode
        );
        const fallbackTheme = {
          orgName: org?.name || PLATFORM_DEFAULTS.orgName,
          status: 'draft' as const,
          themeModeIntent: fallbackMode,
          tokens: fallbackTokens,
          tokensLight: (platformTheme?.tokensLight as Record<string, string> | null | undefined) || null,
          tokensDark: (platformTheme?.tokensDark as Record<string, string> | null | undefined) || null,
          logoUrl: platformTheme?.logoUrl || PLATFORM_DEFAULTS.logoUrl,
          faviconUrl: platformTheme?.faviconUrl || PLATFORM_DEFAULTS.faviconUrl,
          fontHeading: platformTheme?.fontHeading || PLATFORM_DEFAULTS.fontHeading,
          fontBody: platformTheme?.fontBody || PLATFORM_DEFAULTS.fontBody,
          supportUrl: platformTheme?.supportUrl || PLATFORM_DEFAULTS.supportUrl,
          supportEmail: platformTheme?.supportEmail || PLATFORM_DEFAULTS.supportEmail,
          termsUrl: platformTheme?.termsUrl || PLATFORM_DEFAULTS.termsUrl,
          privacyUrl: platformTheme?.privacyUrl || PLATFORM_DEFAULTS.privacyUrl,
          allowEmailBranding: platformTheme?.allowEmailBranding ?? PLATFORM_DEFAULTS.allowEmailBranding,
          enableContrastCorrections: platformTheme?.enableContrastCorrections ?? PLATFORM_DEFAULTS.enableContrastCorrections,
          customCopy: platformTheme?.customCopy || PLATFORM_DEFAULTS.customCopy,
        };
        res.json({ success: true, theme: fallbackTheme });
      }
    } catch (error) {
      console.error('[Branding] Error resetting theme:', error);
      res.status(500).json({ error: 'Failed to reset theme' });
    }
  });

  app.get('/api/domains', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const domains = await storage.getOrganizationDomains(organizationId);
      res.json({ domains });
    } catch (error) {
      console.error('[Branding] Error fetching domains:', error);
      res.status(500).json({ error: 'Failed to fetch domains' });
    }
  });

  app.post('/api/domains', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const { domain } = req.body;
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Domain is required' });
      }

      const normalizedDomain = normalizeOrganizationDomainInput(domain);
      if (!normalizedDomain.normalized) {
        return res.status(400).json({ error: normalizedDomain.error || 'Invalid domain format' });
      }
      const cleanDomain = normalizedDomain.normalized;
      
      const existing = await storage.getOrganizationDomainByDomain(cleanDomain);
      if (existing) {
        return res.status(400).json({ error: 'Domain already registered' });
      }
      
      const verificationToken = `learnplay-verify=${crypto.randomBytes(16).toString('hex')}`;
      
      const result = await storage.addOrganizationDomain({
        organizationId,
        domain: cleanDomain,
        verificationToken,
      });
      
      res.json({ domain: result });
    } catch (error) {
      console.error('[Branding] Error adding domain:', error);
      res.status(500).json({ error: 'Failed to add domain' });
    }
  });

  app.delete('/api/domains/:id', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const { id } = req.params;
      await storage.removeOrganizationDomain(id, organizationId);
      res.json({ success: true });
    } catch (error) {
      console.error('[Branding] Error removing domain:', error);
      res.status(500).json({ error: 'Failed to remove domain' });
    }
  });

  app.post('/api/domains/:id/verify', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const { id } = req.params;
      
      const domains = await storage.getOrganizationDomains(organizationId);
      const domain = domains.find(d => d.id === id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }
      
      if (domain.verified) {
        return res.json({ verified: true, message: 'Domain already verified' });
      }
      
      let verified = false;
      try {
        const records = await resolveTxt(domain.domain);
        const flatRecords = records.flat();
        verified = flatRecords.some(record => record === domain.verificationToken);
      } catch (dnsError: any) {
        if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
          return res.json({ verified: false, message: 'DNS TXT record not found. Please add the TXT record and wait for DNS propagation (up to 48 hours).' });
        }
        console.error('[Branding] DNS lookup error:', dnsError);
        return res.json({ verified: false, message: 'Unable to verify DNS. Please try again later.' });
      }
      
      if (verified) {
        const result = await storage.verifyOrganizationDomain(id, organizationId);
        return res.json({ verified: true, domain: result });
      }
      
      res.json({ verified: false, message: 'Verification token not found in DNS TXT records. Please ensure you added the correct TXT record.' });
    } catch (error) {
      console.error('[Branding] Error verifying domain:', error);
      res.status(500).json({ error: 'Failed to verify domain' });
    }
  });

  app.post('/api/domains/:id/toggle-active', isOrgAdmin, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const organizationId = await getEffectiveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      
      const ownershipCheck = await validateOrgOwnership(req, organizationId);
      if (!ownershipCheck.valid) {
        return res.status(403).json({ error: ownershipCheck.error });
      }
      
      const { id } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' });
      }
      
      const domains = await storage.getOrganizationDomains(organizationId);
      const domain = domains.find(d => d.id === id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }
      
      if (!domain.verified) {
        return res.status(400).json({ error: 'Only verified domains can be activated/deactivated' });
      }
      
      const result = await storage.toggleDomainActive(id, organizationId, isActive);
      res.json({ domain: result });
    } catch (error) {
      console.error('[Branding] Error toggling domain active status:', error);
      res.status(500).json({ error: 'Failed to toggle domain active status' });
    }
  });

  app.get('/api/superadmin/branding/themes', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      res.json({ message: 'SuperAdmin branding management endpoint' });
    } catch (error) {
      console.error('[Branding] SuperAdmin error:', error);
      res.status(500).json({ error: 'Failed to fetch branding themes' });
    }
  });

  app.get('/api/superadmin/branding/org/:orgId/theme', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      applyNoStoreThemeHeaders(res);
      const { orgId } = req.params;
      const theme = await storage.getBrandingThemeByOrgId(orgId);
      res.json({ theme: theme || null });
    } catch (error) {
      console.error('[Branding] SuperAdmin error:', error);
      res.status(500).json({ error: 'Failed to fetch organization theme' });
    }
  });

  app.post('/api/superadmin/branding/org/:orgId/theme', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const rateLimit = checkRateLimit(userId, orgId);
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter));
        return res.status(429).json({
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimit.retryAfter
        });
      }
      
      const tokenValidation = validateTokenPayload(req.body.tokens);
      if (!tokenValidation.valid) {
        return res.status(400).json({ 
          error: 'Invalid token payload',
          details: tokenValidation.errors
        });
      }
      
      const existingTheme = await storage.getBrandingThemeByOrgId(orgId);
      const nextStatus = resolveThemeSaveStatus(existingTheme?.status);
      const mergedTokens = mergeThemeTokensForUpdate(
        (existingTheme?.tokens as Record<string, string> | null | undefined) || {},
        tokenValidation.sanitized
      );
      const themeModeIntent = resolveThemeModeIntent({
        explicit: req.body.themeModeIntent ?? existingTheme?.themeModeIntent,
        tokens: mergedTokens,
        tokensLight: (existingTheme?.tokensLight as Record<string, string> | null | undefined) || null,
        tokensDark: (existingTheme?.tokensDark as Record<string, string> | null | undefined) || null,
      });
      const preparedTokens = prepareThemeTokensForPersistence(mergedTokens, themeModeIntent);
      const revisionHash = computeThemeRevisionHash(preparedTokens.tokens);

      const validatedData = insertBrandingThemeSchema.parse({
        ...req.body,
        themeModeIntent,
        tokens: preparedTokens.tokens,
        tokensLight: preparedTokens.tokensLight,
        tokensDark: preparedTokens.tokensDark,
        organizationId: orgId,
        status: nextStatus,
        gradientEnabled: false,
        gradientFrom: null,
        gradientTo: null,
        gradientAngle: null,
        customCopy: withThemeSystemMeta(req.body.customCopy, {
          revisionHash,
          canActivate: preparedTokens.canActivate,
          criticalIssueCount: preparedTokens.criticalIssues.length,
          warningIssueCount: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          generatedAt: new Date().toISOString(),
        }),
      });
      
      const theme = await storage.upsertBrandingTheme(validatedData);
      res.json({
        theme,
        contrastAdjustments: preparedTokens.adjustments.length,
        contrastWarnings: preparedTokens.remainingIssues.length,
        activationReady: preparedTokens.canActivate,
        validation: {
          criticalIssues: preparedTokens.criticalIssues.length,
          warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          missingRequiredTokens: preparedTokens.missingRequiredTokens,
          missingContractTokens: preparedTokens.missingContractTokens,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Branding] SuperAdmin error:', error);
      res.status(500).json({ error: 'Failed to save organization theme' });
    }
  });

  // ==================== PLATFORM DEFAULT THEME ENDPOINTS (SuperAdmin only) ====================
  
  app.get('/api/superadmin/branding/platform', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      applyNoStoreThemeHeaders(res);
      const theme = await storage.getPlatformDefaultTheme();
      res.json({ theme: theme || null });
    } catch (error) {
      console.error('[Branding] Error fetching platform theme:', error);
      res.status(500).json({ error: 'Failed to fetch platform theme' });
    }
  });

  app.post('/api/superadmin/branding/platform', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const rateLimit = checkRateLimit(userId, 'platform');
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter));
        return res.status(429).json({ 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimit.retryAfter
        });
      }
      
      const tokenValidation = validateTokenPayload(req.body.tokens);
      if (!tokenValidation.valid) {
        return res.status(400).json({ 
          error: 'Invalid token payload',
          details: tokenValidation.errors
        });
      }
      
      const { organizationId, ...themeData } = req.body;
      
      const existingPlatformTheme = await storage.getPlatformDefaultTheme();
      const nextStatus = resolveThemeSaveStatus(existingPlatformTheme?.status);
      const mergedTokens = mergeThemeTokensForUpdate(
        (existingPlatformTheme?.tokens as Record<string, string> | null | undefined) || {},
        tokenValidation.sanitized
      );
      const themeModeIntent = resolveThemeModeIntent({
        explicit: req.body.themeModeIntent ?? existingPlatformTheme?.themeModeIntent,
        tokens: mergedTokens,
        tokensLight: (existingPlatformTheme?.tokensLight as Record<string, string> | null | undefined) || null,
        tokensDark: (existingPlatformTheme?.tokensDark as Record<string, string> | null | undefined) || null,
      });
      const preparedTokens = prepareThemeTokensForPersistence(mergedTokens, themeModeIntent);
      const revisionHash = computeThemeRevisionHash(preparedTokens.tokens);

      const theme = await storage.upsertPlatformDefaultTheme({
        ...themeData,
        themeModeIntent,
        tokens: preparedTokens.tokens,
        tokensLight: preparedTokens.tokensLight,
        tokensDark: preparedTokens.tokensDark,
        status: nextStatus,
        gradientEnabled: false,
        gradientFrom: null,
        gradientTo: null,
        gradientAngle: null,
        customCopy: withThemeSystemMeta(themeData.customCopy, {
          revisionHash,
          canActivate: preparedTokens.canActivate,
          criticalIssueCount: preparedTokens.criticalIssues.length,
          warningIssueCount: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          generatedAt: new Date().toISOString(),
        }),
      });
      res.json({
        theme,
        contrastAdjustments: preparedTokens.adjustments.length,
        contrastWarnings: preparedTokens.remainingIssues.length,
        activationReady: preparedTokens.canActivate,
        validation: {
          criticalIssues: preparedTokens.criticalIssues.length,
          warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          missingRequiredTokens: preparedTokens.missingRequiredTokens,
          missingContractTokens: preparedTokens.missingContractTokens,
        },
      });
    } catch (error) {
      console.error('[Branding] Error saving platform theme:', error);
      res.status(500).json({ error: 'Failed to save platform theme' });
    }
  });

  app.post('/api/superadmin/branding/platform/activate', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      let existingPlatformTheme = await storage.getPlatformDefaultTheme();
      if (!existingPlatformTheme) {
        const seeded = prepareThemeTokensForPersistence(
          expandTokensIfNeeded(PLATFORM_DEFAULTS.tokens, PLATFORM_DEFAULTS.themeModeIntent),
          PLATFORM_DEFAULTS.themeModeIntent
        );
        existingPlatformTheme = await storage.upsertPlatformDefaultTheme({
          orgName: PLATFORM_DEFAULTS.orgName,
          status: 'draft',
          themeModeIntent: PLATFORM_DEFAULTS.themeModeIntent,
          tokens: seeded.tokens,
          tokensLight: seeded.tokensLight,
          tokensDark: seeded.tokensDark,
          logoUrl: PLATFORM_DEFAULTS.logoUrl,
          faviconUrl: PLATFORM_DEFAULTS.faviconUrl,
          fontHeading: PLATFORM_DEFAULTS.fontHeading,
          fontBody: PLATFORM_DEFAULTS.fontBody,
          supportUrl: PLATFORM_DEFAULTS.supportUrl,
          supportEmail: PLATFORM_DEFAULTS.supportEmail,
          termsUrl: PLATFORM_DEFAULTS.termsUrl,
          privacyUrl: PLATFORM_DEFAULTS.privacyUrl,
          allowEmailBranding: PLATFORM_DEFAULTS.allowEmailBranding,
          enableContrastCorrections: PLATFORM_DEFAULTS.enableContrastCorrections,
          customCopy: PLATFORM_DEFAULTS.customCopy,
        });
      }

      const activeModeIntent = resolveThemeModeIntent({
        explicit: existingPlatformTheme.themeModeIntent,
        tokens: (existingPlatformTheme.tokens as Record<string, string>) || {},
        tokensLight: (existingPlatformTheme.tokensLight as Record<string, string> | null) || null,
        tokensDark: (existingPlatformTheme.tokensDark as Record<string, string> | null) || null,
      });
      const preparedTokens = prepareThemeTokensForPersistence(
        (existingPlatformTheme.tokens as Record<string, string>) || {},
        activeModeIntent
      );
      const allowCriticalAdvisories = req.body?.allowCriticalAdvisories === true;
      const effectiveRole = req.session?.context?.effectiveRole;
      const canUseCriticalOverride = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';
      const canActivateWithAcknowledgedCritical =
        canUseCriticalOverride
        && allowCriticalAdvisories
        && preparedTokens.criticalIssues.length > 0
        && preparedTokens.missingRequiredTokens.length === 0
        && preparedTokens.missingContractTokens.length === 0;
      if (allowCriticalAdvisories && !canUseCriticalOverride) {
        return res.status(403).json({
          error: 'Critical advisory activation override requires SuperAdmin or CustSuper privileges.',
        });
      }
      if (!preparedTokens.canActivate) {
        if (canActivateWithAcknowledgedCritical) {
          console.warn('[Branding] Activating platform theme with acknowledged critical accessibility advisories.', {
            criticalIssues: preparedTokens.criticalIssues.length,
            warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          });
        } else {
        return res.status(422).json({
          error: 'Platform theme activation blocked: unresolved accessibility or token contract issues remain.',
          validation: {
            criticalIssues: preparedTokens.criticalIssues,
            warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning'),
            missingRequiredTokens: preparedTokens.missingRequiredTokens,
            missingContractTokens: preparedTokens.missingContractTokens,
          },
        });
        }
      }

      await storage.upsertPlatformDefaultTheme({
        orgName: existingPlatformTheme.orgName,
        status: 'draft',
        themeModeIntent: activeModeIntent,
        tokens: preparedTokens.tokens,
        tokensLight: preparedTokens.tokensLight,
        tokensDark: preparedTokens.tokensDark,
        logoUrl: existingPlatformTheme.logoUrl || null,
        faviconUrl: existingPlatformTheme.faviconUrl || null,
        fontHeading: existingPlatformTheme.fontHeading || 'Inter',
        fontBody: existingPlatformTheme.fontBody || 'Inter',
        supportUrl: existingPlatformTheme.supportUrl || null,
        supportEmail: existingPlatformTheme.supportEmail || null,
        termsUrl: existingPlatformTheme.termsUrl || null,
        privacyUrl: existingPlatformTheme.privacyUrl || null,
        allowEmailBranding: existingPlatformTheme.allowEmailBranding || false,
        enableContrastCorrections: existingPlatformTheme.enableContrastCorrections !== false,
        presetId: existingPlatformTheme.presetId || null,
        gradientEnabled: false,
        gradientFrom: null,
        gradientTo: null,
        gradientAngle: null,
        customCopy: withThemeSystemMeta(existingPlatformTheme.customCopy, {
          revisionHash: computeThemeRevisionHash(preparedTokens.tokens),
          canActivate: true,
          criticalIssueCount: 0,
          warningIssueCount: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
          generatedAt: new Date().toISOString(),
        }),
      });

      const theme = await storage.activatePlatformDefaultTheme();
      res.json({
        theme,
        contrastAdjustments: preparedTokens.adjustments.length,
        validation: {
          criticalIssues: 0,
          warningIssues: preparedTokens.remainingIssues.filter((issue) => issue.level === 'warning').length,
        },
      });
    } catch (error) {
      console.error('[Branding] Error activating platform theme:', error);
      res.status(500).json({ error: 'Failed to activate platform theme' });
    }
  });

  app.post('/api/superadmin/branding/platform/reset', isSuperAdminOrCustSuper, onpremBrandingGate, async (req: Request, res: Response) => {
    try {
      const previous = await storage.getPlatformDefaultTheme();
      await storage.resetPlatformDefaultTheme();
      const prepared = prepareThemeTokensForPersistence(
        expandTokensIfNeeded(PLATFORM_DEFAULTS.tokens, PLATFORM_DEFAULTS.themeModeIntent),
        PLATFORM_DEFAULTS.themeModeIntent
      );
      const theme = await storage.upsertPlatformDefaultTheme({
        orgName: PLATFORM_DEFAULTS.orgName,
        status: 'draft',
        themeModeIntent: PLATFORM_DEFAULTS.themeModeIntent,
        tokens: prepared.tokens,
        tokensLight: prepared.tokensLight,
        tokensDark: prepared.tokensDark,
        logoUrl: previous?.logoUrl || PLATFORM_DEFAULTS.logoUrl,
        faviconUrl: previous?.faviconUrl || PLATFORM_DEFAULTS.faviconUrl,
        fontHeading: PLATFORM_DEFAULTS.fontHeading,
        fontBody: PLATFORM_DEFAULTS.fontBody,
        supportUrl: PLATFORM_DEFAULTS.supportUrl,
        supportEmail: PLATFORM_DEFAULTS.supportEmail,
        termsUrl: PLATFORM_DEFAULTS.termsUrl,
        privacyUrl: PLATFORM_DEFAULTS.privacyUrl,
        allowEmailBranding: PLATFORM_DEFAULTS.allowEmailBranding,
        enableContrastCorrections: PLATFORM_DEFAULTS.enableContrastCorrections,
        customCopy: PLATFORM_DEFAULTS.customCopy,
      });
      res.json({ success: true, theme });
    } catch (error) {
      console.error('[Branding] Error resetting platform theme:', error);
      res.status(500).json({ error: 'Failed to reset platform theme' });
    }
  });

  // ==================== BRANDING FILE UPLOAD ENDPOINT ====================
  
  app.post(
    '/api/branding/upload',
    isOrgAdmin,
    onpremBrandingGate,
    (req: Request, res: Response, next: NextFunction) => {
      brandingUpload.single('file')(req, res, (err: any) => {
        if (!err) return next();
        if (err?.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum upload size is 5MB.' });
        }
        return res.status(400).json({ error: err?.message || 'Invalid upload payload' });
      });
    },
    async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const type = req.body.type as 'logo' | 'favicon';
      if (!type || !['logo', 'favicon'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Must be "logo" or "favicon"' });
      }

      const detectedMimeType = detectMimeTypeFromBuffer(file.buffer);
      if (!detectedMimeType) {
        return res.status(400).json({ 
          error: 'Invalid file type. Only PNG, JPEG, GIF, and WebP images are allowed.',
          details: 'File signature validation failed'
        });
      }
      
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(detectedMimeType)) {
        return res.status(400).json({ 
          error: `File type ${detectedMimeType} is not allowed. Please upload PNG, JPEG, GIF, or WebP.` 
        });
      }

      const organizationId = await getEffectiveOrgId(req);
      const isPlatform = req.body.isPlatform === 'true';
      
      if (isPlatform) {
        if (!req.session?.userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const user = await storage.getUser(req.session.userId);
        if (!user?.isSuperAdmin && !user?.isCustSuper) {
          return res.status(403).json({ error: 'Platform admin access required for platform branding' });
        }
      } else if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      } else {
        const ownershipCheck = await validateOrgOwnership(req, organizationId);
        if (!ownershipCheck.valid) {
          return res.status(403).json({ error: ownershipCheck.error });
        }
      }

      const metadata = await sharp(file.buffer).metadata();
      const sourceWidth = metadata.width || 0;
      const sourceHeight = metadata.height || 0;
      
      if (type === 'logo') {
        if (sourceWidth > MAX_LOGO_WIDTH * 10 || sourceHeight > MAX_LOGO_HEIGHT * 10) {
          return res.status(400).json({ 
            error: `Logo dimensions too large. Maximum source size is ${MAX_LOGO_WIDTH * 10}x${MAX_LOGO_HEIGHT * 10} pixels. Your image is ${sourceWidth}x${sourceHeight}.` 
          });
        }
      } else {
        if (sourceWidth > MAX_FAVICON_SIZE * 10 || sourceHeight > MAX_FAVICON_SIZE * 10) {
          return res.status(400).json({ 
            error: `Favicon dimensions too large. Maximum source size is ${MAX_FAVICON_SIZE * 10}x${MAX_FAVICON_SIZE * 10} pixels. Your image is ${sourceWidth}x${sourceHeight}.` 
          });
        }
      }

      let processedBuffer: Buffer;
      if (type === 'logo') {
        processedBuffer = await sharp(file.buffer)
          .resize(MAX_LOGO_WIDTH, MAX_LOGO_HEIGHT, { fit: 'inside', withoutEnlargement: true })
          .png({ quality: 90 })
          .toBuffer();
      } else {
        processedBuffer = await sharp(file.buffer)
          .resize(MAX_FAVICON_SIZE, MAX_FAVICON_SIZE, { fit: 'cover' })
          .png({ quality: 90 })
          .toBuffer();
      }

      let existingUrl: string | null = null;
      if (isPlatform) {
        const platformTheme = await storage.getPlatformDefaultTheme();
        existingUrl = type === 'logo' ? platformTheme?.logoUrl || null : platformTheme?.faviconUrl || null;
      } else if (organizationId) {
        const orgTheme = await storage.getBrandingThemeByOrgId(organizationId);
        existingUrl = type === 'logo' ? orgTheme?.logoUrl || null : orgTheme?.faviconUrl || null;
      }

      const key = buildCanonicalStorageKey({
        scope: 'public',
        domain: type === 'logo' ? 'brand-logo' : 'brand-fav',
        extension: '.png',
        seed: `branding:${isPlatform ? 'platform' : organizationId}:${type}:${Date.now()}`,
      });
      const destPath = canonicalKeyToAbsolutePath(key);
      const fs = await import('fs');
      const path = await import('path');
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, processedBuffer);

      const publicUrl = `/api/public-objects/${key.replace(/^\/public\//, '')}`;

      // Persist uploaded asset URL immediately to avoid dangling references and improve atomicity.
      if (isPlatform) {
        const existingPlatformTheme = await storage.getPlatformDefaultTheme();
        if (existingPlatformTheme) {
          const existingPlatformThemeMode = resolveThemeModeIntent({
            explicit: existingPlatformTheme.themeModeIntent,
            tokens: (existingPlatformTheme.tokens as Record<string, string>) || null,
            tokensLight: (existingPlatformTheme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (existingPlatformTheme.tokensDark as Record<string, string> | null) || null,
          });
          await storage.upsertPlatformDefaultTheme({
            orgName: existingPlatformTheme.orgName,
            status: existingPlatformTheme.status,
            themeModeIntent: existingPlatformThemeMode,
            presetId: existingPlatformTheme.presetId,
            tokens: (existingPlatformTheme.tokens as Record<string, string>) || expandTokensIfNeeded(PLATFORM_DEFAULTS.tokens),
            tokensLight: (existingPlatformTheme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (existingPlatformTheme.tokensDark as Record<string, string> | null) || null,
            logoUrl: type === 'logo' ? publicUrl : existingPlatformTheme.logoUrl,
            faviconUrl: type === 'favicon' ? publicUrl : existingPlatformTheme.faviconUrl,
            fontHeading: existingPlatformTheme.fontHeading,
            fontBody: existingPlatformTheme.fontBody,
            supportUrl: existingPlatformTheme.supportUrl,
            supportEmail: existingPlatformTheme.supportEmail,
            termsUrl: existingPlatformTheme.termsUrl,
            privacyUrl: existingPlatformTheme.privacyUrl,
            allowEmailBranding: existingPlatformTheme.allowEmailBranding,
            enableContrastCorrections: existingPlatformTheme.enableContrastCorrections !== false,
            gradientEnabled: false,
            gradientFrom: null,
            gradientTo: null,
            gradientAngle: null,
            customCopy: existingPlatformTheme.customCopy,
          });
        } else {
          const preparedDefaultTokens = prepareThemeTokensForPersistence(
            expandTokensIfNeeded(PLATFORM_DEFAULTS.tokens, PLATFORM_DEFAULTS.themeModeIntent),
            PLATFORM_DEFAULTS.themeModeIntent
          );
          await storage.upsertPlatformDefaultTheme({
            orgName: PLATFORM_DEFAULTS.orgName,
            status: 'draft',
            themeModeIntent: PLATFORM_DEFAULTS.themeModeIntent,
            tokens: preparedDefaultTokens.tokens,
            tokensLight: preparedDefaultTokens.tokensLight,
            tokensDark: preparedDefaultTokens.tokensDark,
            logoUrl: type === 'logo' ? publicUrl : PLATFORM_DEFAULTS.logoUrl,
            faviconUrl: type === 'favicon' ? publicUrl : PLATFORM_DEFAULTS.faviconUrl,
            fontHeading: PLATFORM_DEFAULTS.fontHeading,
            fontBody: PLATFORM_DEFAULTS.fontBody,
            supportUrl: PLATFORM_DEFAULTS.supportUrl,
            supportEmail: PLATFORM_DEFAULTS.supportEmail,
            termsUrl: PLATFORM_DEFAULTS.termsUrl,
            privacyUrl: PLATFORM_DEFAULTS.privacyUrl,
            allowEmailBranding: PLATFORM_DEFAULTS.allowEmailBranding,
            enableContrastCorrections: PLATFORM_DEFAULTS.enableContrastCorrections,
            customCopy: PLATFORM_DEFAULTS.customCopy,
          });
        }
      } else if (organizationId) {
        const existingOrgTheme = await storage.getBrandingThemeByOrgId(organizationId);
        if (existingOrgTheme) {
          const existingOrgThemeMode = resolveThemeModeIntent({
            explicit: existingOrgTheme.themeModeIntent,
            tokens: (existingOrgTheme.tokens as Record<string, string>) || null,
            tokensLight: (existingOrgTheme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (existingOrgTheme.tokensDark as Record<string, string> | null) || null,
          });
          await storage.upsertBrandingTheme({
            organizationId,
            orgName: existingOrgTheme.orgName,
            status: existingOrgTheme.status,
            themeModeIntent: existingOrgThemeMode,
            presetId: existingOrgTheme.presetId,
            tokens: (existingOrgTheme.tokens as Record<string, string>) || expandTokensIfNeeded(PLATFORM_DEFAULTS.tokens),
            tokensLight: (existingOrgTheme.tokensLight as Record<string, string> | null) || null,
            tokensDark: (existingOrgTheme.tokensDark as Record<string, string> | null) || null,
            logoUrl: type === 'logo' ? publicUrl : existingOrgTheme.logoUrl,
            faviconUrl: type === 'favicon' ? publicUrl : existingOrgTheme.faviconUrl,
            fontHeading: existingOrgTheme.fontHeading,
            fontBody: existingOrgTheme.fontBody,
            supportUrl: existingOrgTheme.supportUrl,
            supportEmail: existingOrgTheme.supportEmail,
            termsUrl: existingOrgTheme.termsUrl,
            privacyUrl: existingOrgTheme.privacyUrl,
            allowEmailBranding: existingOrgTheme.allowEmailBranding,
            enableContrastCorrections: existingOrgTheme.enableContrastCorrections !== false,
            gradientEnabled: false,
            gradientFrom: null,
            gradientTo: null,
            gradientAngle: null,
            customCopy: existingOrgTheme.customCopy,
          });
        } else {
          const org = await storage.getOrganization(organizationId);
          const preparedDefaultTokens = prepareThemeTokensForPersistence(
            expandTokensIfNeeded(PLATFORM_DEFAULTS.tokens, PLATFORM_DEFAULTS.themeModeIntent),
            PLATFORM_DEFAULTS.themeModeIntent
          );
          await storage.upsertBrandingTheme({
            organizationId,
            orgName: org?.name || PLATFORM_DEFAULTS.orgName,
            status: 'draft',
            themeModeIntent: PLATFORM_DEFAULTS.themeModeIntent,
            tokens: preparedDefaultTokens.tokens,
            tokensLight: preparedDefaultTokens.tokensLight,
            tokensDark: preparedDefaultTokens.tokensDark,
            logoUrl: type === 'logo' ? publicUrl : null,
            faviconUrl: type === 'favicon' ? publicUrl : null,
            fontHeading: PLATFORM_DEFAULTS.fontHeading,
            fontBody: PLATFORM_DEFAULTS.fontBody,
            supportUrl: PLATFORM_DEFAULTS.supportUrl,
            supportEmail: PLATFORM_DEFAULTS.supportEmail,
            termsUrl: PLATFORM_DEFAULTS.termsUrl,
            privacyUrl: PLATFORM_DEFAULTS.privacyUrl,
            allowEmailBranding: PLATFORM_DEFAULTS.allowEmailBranding,
            enableContrastCorrections: PLATFORM_DEFAULTS.enableContrastCorrections,
            customCopy: PLATFORM_DEFAULTS.customCopy,
          });
        }
      }

      // Delete old logo/favicon if it exists in our storage (best effort; after successful persist).
      try {
        const oldObjectPath = resolveBrandingObjectPathFromUrl(existingUrl);
        if (oldObjectPath) {
          try {
            const oldFile = await objectStorageService.searchPublicObject(oldObjectPath);
            if (oldFile) {
              await oldFile.delete();
              console.log(`[Branding] Deleted old ${type}: ${existingUrl}`);
            }
          } catch (deleteError) {
            console.warn(`[Branding] Failed to delete old ${type}: ${existingUrl}`, deleteError);
          }
        }
      } catch (lookupError) {
        console.warn(`[Branding] Failed to lookup existing ${type} for deletion:`, lookupError);
      }
      
      console.log(`[Branding] Uploaded ${type} for ${isPlatform ? 'platform' : `org ${organizationId}`}: ${publicUrl}`);
      
      res.json({ url: publicUrl, path: key });
    } catch (error: any) {
      console.error('[Branding] Upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload file' });
    }
  });

  console.log('[Branding] Branding routes registered');
}
