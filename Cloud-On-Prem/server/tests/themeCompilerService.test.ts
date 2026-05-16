import { describe, expect, it } from '@jest/globals';

import { compileThemeTokens } from '../services/themeCompilerService';
import { auditThemeContrast } from '../../shared/themeContrastGuard';

describe('themeCompilerService', () => {
  it('produces a full token set with activation readiness for healthy anchors', () => {
    const result = compileThemeTokens(
      {
        '--primary': '#0a66c2',
        '--secondary': '#124076',
        '--accent': '#16a3a5',
      },
      { modeIntent: 'light' },
    );

    expect(Object.keys(result.tokens).length).toBeGreaterThanOrEqual(650);
    expect(result.missingRequiredTokens).toHaveLength(0);
    expect(result.missingContractTokens).toHaveLength(0);
    expect(result.criticalIssues.length).toBe(0);
    expect(result.canActivate).toBe(true);
  });

  it('applies contrast remediation and improves critical issue count', () => {
    const authored = {
      '--primary': '#ffffff',
      '--secondary': '#f5f5f5',
      '--accent': '#eeeeee',
      '--background': '#ffffff',
      '--foreground': '#ffffff',
      '--card': '#ffffff',
      '--card-foreground': '#ffffff',
    };

    const beforeIssues = auditThemeContrast(authored as Record<string, string>);
    const result = compileThemeTokens(authored, { modeIntent: 'light' });

    expect(result.adjustments.length).toBeGreaterThan(0);
    expect(result.criticalIssues.length).toBeLessThanOrEqual(
      beforeIssues.filter((issue) => issue.level === 'error').length,
    );
  });

  it('keeps opposite-mode tokens mode-correct instead of inheriting active-mode surfaces', () => {
    const darkAuthored = {
      '--primary': '#f2e91a',
      '--secondary': '#5b8f2a',
      '--accent': '#34c3d9',
      '--background': 'hsl(55, 20%, 8%)',
      '--foreground': 'hsl(0, 0%, 95%)',
      '--card': 'hsl(55, 18%, 11%)',
      '--card-foreground': 'hsl(0, 0%, 95%)',
    };

    const result = compileThemeTokens(darkAuthored, { modeIntent: 'dark' });

    expect(result.tokensDark['--background']).toBe('hsl(55, 20%, 8%)');
    expect(result.tokensLight['--background']).not.toBe('hsl(55, 20%, 8%)');
    expect(result.tokensLight['--card']).not.toBe('hsl(55, 18%, 11%)');
    expect(result.tokensLight['--foreground']).not.toBe('hsl(0, 0%, 95%)');
  });
});
