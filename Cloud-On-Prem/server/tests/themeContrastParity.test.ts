import { describe, expect, it } from '@jest/globals';

import { buildFullTokens } from '../../shared/themeTokenBuilder';
import { compileThemeTokens } from '../services/themeCompilerService';
import { auditThemeContrast } from '../../shared/themeContrastGuard';
import { getContrastWarnings } from '../../client/src/utils/contrast';

describe('theme contrast parity', () => {
  it('uses the same warning set in Theme Editor and server compiler', () => {
    const compiled = compileThemeTokens(
      buildFullTokens({
        primary: '#0a66ff',
        primaryForeground: '#ffffff',
        secondary: '#343fa8',
        secondaryForeground: '#ffffff',
        accent: '#34c6cf',
        accentForeground: '#ffffff',
        background: 'hsl(220, 28%, 97%)',
        foreground: 'hsl(220, 18%, 12%)',
        card: '#ffffff',
        cardForeground: 'hsl(220, 18%, 12%)',
        muted: 'hsl(220, 18%, 92%)',
        mutedForeground: 'hsl(220, 12%, 42%)',
        border: 'hsl(220, 18%, 84%)',
        ring: '#0a66ff',
        gradientFrom: '#0a66ff',
        gradientTo: '#343fa8',
        gamePrimary: '#34c6cf',
        gameGlow: '#34c6cf',
        isDark: false,
      }),
      { modeIntent: 'light' },
    );

    const serverIssues = auditThemeContrast(compiled.tokens);
    const editorWarnings = getContrastWarnings(compiled.tokens);

    expect(editorWarnings).toHaveLength(serverIssues.length);
    expect(
      new Set(editorWarnings.map((warning) => `${warning.pair}|${warning.level}|${warning.required}`)),
    ).toEqual(new Set(serverIssues.map((issue) => `${issue.pair}|${issue.level}|${issue.required}`)));
  });
});
