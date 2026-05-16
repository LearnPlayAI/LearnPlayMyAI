import { describe, expect, it, jest } from '@jest/globals';
import { getContrastWarnings } from '../utils/contrast';
import {
  buildBaseTokensFromPalette,
  enforcePaletteCoreTokens,
  generatePaletteTokens,
  shouldProceedWithOrgSwitch,
} from '../lib/themePaletteBuilder';

describe('theme palette builder utilities', () => {
  it('preserves selected palette core colors on apply', () => {
    const tokens = generatePaletteTokens({
      primaryHex: '#f2e91a',
      secondaryHex: '#ebe8b0',
      accentHex: '#0a0a0a',
      tone: 'light',
      autoFix: false,
    });

    expect(tokens['--primary']).toBe('#f2e91a');
    expect(tokens['--secondary']).toBe('#ebe8b0');
    expect(tokens['--accent']).toBe('#0a0a0a');
    expect(tokens['--action-primary']).toBe(tokens['--primary']);
    expect(tokens['--action-secondary']).toBe(tokens['--secondary']);
  });

  it('auto-fix mode does not increase critical accessibility warnings', () => {
    const preserve = generatePaletteTokens({
      primaryHex: '#f2e91a',
      secondaryHex: '#ebe8b0',
      accentHex: '#0a0a0a',
      tone: 'light',
      autoFix: false,
    });
    const autoFix = generatePaletteTokens({
      primaryHex: '#f2e91a',
      secondaryHex: '#ebe8b0',
      accentHex: '#0a0a0a',
      tone: 'light',
      autoFix: true,
    });

    const preserveCritical = getContrastWarnings(preserve).filter((w) => w.level === 'error').length;
    const autoFixCritical = getContrastWarnings(autoFix).filter((w) => w.level === 'error').length;

    expect(autoFix['--primary']).toBe(preserve['--primary']);
    expect(autoFix['--secondary']).toBe(preserve['--secondary']);
    expect(autoFix['--accent']).toBe(preserve['--accent']);
    expect(autoFixCritical).toBeLessThanOrEqual(preserveCritical);
  });

  it('keeps remediated border tokens when palette defaults would be low contrast', () => {
    const base = buildBaseTokensFromPalette('#f2e91a', '#ebe8b0', '#0a0a0a', 'light');
    const enforced = enforcePaletteCoreTokens(
      {
        '--border': '#64748b',
        '--ring': '#475569',
      },
      base,
    );

    const borderWarnings = getContrastWarnings(enforced).filter((warning) =>
      warning.pair.includes('--border on --background') || warning.pair.includes('--border on --card'),
    );

    expect(enforced['--border']).toBe('#64748b');
    expect(enforced['--ring']).toBe('#475569');
    expect(borderWarnings).toHaveLength(0);
  });

  it('preserves accessible authored companion tokens while enforcing palette anchors', () => {
    const base = buildBaseTokensFromPalette('#2563eb', '#9333ea', '#f59e0b', 'dark');
    const authored = {
      '--primary-foreground': '#f8fafc',
      '--secondary-foreground': '#f8fafc',
      '--accent-foreground': '#111827',
      '--foreground': '#f8fafc',
      '--card-foreground': '#f8fafc',
      '--muted-foreground': '#e2e8f0',
      '--border': '#94a3b8',
      '--ring': '#f8fafc',
      '--action-primary-fg': '#f8fafc',
      '--action-secondary-fg': '#f8fafc',
      '--action-accent-fg': '#111827',
    };

    const enforced = enforcePaletteCoreTokens(authored, base);

    expect(enforced['--primary']).toBe(base.primary);
    expect(enforced['--secondary']).toBe(base.secondary);
    expect(enforced['--accent']).toBe(base.accent);
    expect(enforced['--primary-foreground']).toBe(authored['--primary-foreground']);
    expect(enforced['--secondary-foreground']).toBe(authored['--secondary-foreground']);
    expect(enforced['--accent-foreground']).toBe(authored['--accent-foreground']);
    expect(enforced['--foreground']).toBe(authored['--foreground']);
    expect(enforced['--card-foreground']).toBe(authored['--card-foreground']);
    expect(enforced['--muted-foreground']).toBe(authored['--muted-foreground']);
    expect(enforced['--border']).toBe(authored['--border']);
    expect(enforced['--ring']).toBe(authored['--ring']);
    expect(enforced['--action-primary-fg']).toBe(authored['--action-primary-fg']);
    expect(enforced['--action-secondary-fg']).toBe(authored['--action-secondary-fg']);
    expect(enforced['--action-accent-fg']).toBe(authored['--action-accent-fg']);
  });

  it('prompts on org switch when unsaved changes exist', () => {
    const confirmNo = jest.fn(() => false);
    const confirmYes = jest.fn(() => true);

    expect(shouldProceedWithOrgSwitch(false, confirmNo)).toBe(true);
    expect(confirmNo).not.toHaveBeenCalled();

    expect(shouldProceedWithOrgSwitch(true, confirmNo)).toBe(false);
    expect(confirmNo).toHaveBeenCalledTimes(1);

    expect(shouldProceedWithOrgSwitch(true, confirmYes)).toBe(true);
    expect(confirmYes).toHaveBeenCalledTimes(1);
  });
});
