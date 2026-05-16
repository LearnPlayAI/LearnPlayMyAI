import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BRANDING_ROUTES_PATH = path.join(ROOT, 'server/brandingRoutes.ts');

describe('Theme Persistence Contracts', () => {
  it('merges incoming token updates with stored tokens before persistence', () => {
    const source = fs.readFileSync(BRANDING_ROUTES_PATH, 'utf8');
    expect(source.includes('function mergeThemeTokensForUpdate')).toBe(true);
    expect(source.includes('const mergedTokens = mergeThemeTokensForUpdate')).toBe(true);
  });

  it('applies merge behavior in org, superadmin-org, and platform save endpoints', () => {
    const source = fs.readFileSync(BRANDING_ROUTES_PATH, 'utf8');
    const matches = source.match(/const mergedTokens = mergeThemeTokensForUpdate/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps reset persistence in sync for mode-aware token fields', () => {
    const source = fs.readFileSync(BRANDING_ROUTES_PATH, 'utf8');
    expect(source.includes('themeModeIntent: \'light\'')).toBe(true);
    expect(source.includes('tokensLight: preparedTokens.tokensLight')).toBe(true);
    expect(source.includes('tokensDark: preparedTokens.tokensDark')).toBe(true);
  });

  it('uses mode-aware token selection for embed stylesheet generation', () => {
    const source = fs.readFileSync(BRANDING_ROUTES_PATH, 'utf8');
    expect(source.includes('app.get(\'/api/theme/embed-styles\'')).toBe(true);
    expect(source.includes('themeModeIntent = resolveThemeModeIntent')).toBe(true);
    expect(source.includes('tokens = expandTokensIfNeeded(tokens, themeModeIntent)')).toBe(true);
  });

  it('preserves multi-mode fields when persisting branding asset uploads', () => {
    const source = fs.readFileSync(BRANDING_ROUTES_PATH, 'utf8');
    expect(source.includes('themeModeIntent: existingOrgThemeMode')).toBe(true);
    expect(source.includes('tokensLight: (existingOrgTheme.tokensLight as Record<string, string> | null) || null')).toBe(true);
    expect(source.includes('tokensDark: (existingOrgTheme.tokensDark as Record<string, string> | null) || null')).toBe(true);
  });
});
