import { describe, expect, it } from '@jest/globals';
import {
  colorToRGB,
  getContrastRatio,
  getContrastWarnings,
  getContrastCorrectedTokens,
} from '../utils/contrast';

describe('contrast utils hardening', () => {
  it('parses modern hsl/hsla syntax', () => {
    const rgbA = colorToRGB('hsl(220 50% 40% / 0.8)');
    const rgbB = colorToRGB('hsla(220, 50%, 40%, 0.8)');

    expect(rgbA).not.toBeNull();
    expect(rgbB).not.toBeNull();
    expect(rgbA?.r).toBe(rgbB?.r);
    expect(rgbA?.g).toBe(rgbB?.g);
    expect(rgbA?.b).toBe(rgbB?.b);
  });

  it('parses common named colors for contrast checks', () => {
    const ratio = getContrastRatio('white', 'black');
    expect(ratio).toBeGreaterThan(20);
  });

  it('resolves var() token references when computing warnings', () => {
    const tokens = {
      '--background': '#ffffff',
      '--low-contrast-border': '#fbfbfb',
      '--border': 'var(--low-contrast-border)',
    };

    const warnings = getContrastWarnings(tokens);
    expect(warnings.some((w: { pair: string }) => w.pair.includes('--border on --background'))).toBe(true);
  });

  it('corrects low-contrast button fg even when bg is token-referenced', () => {
    const tokens = {
      '--background': '#ffffff',
      '--surface-primary': '#ffffff',
      '--btn-primary-bg': 'var(--surface-primary)',
      '--btn-primary-fg': '#ffffff',
    };

    const { correctedTokens, corrections } = getContrastCorrectedTokens(tokens, { isDark: false });
    expect(corrections.length).toBeGreaterThan(0);
    expect(correctedTokens['--btn-primary-fg']).not.toBe('#ffffff');
  });

  it('emits a single remediation record per foreground token', () => {
    const tokens = {
      '--btn-gradient-from': '#dbeafe',
      '--btn-gradient-to': '#bfdbfe',
      '--btn-gradient-fg': '#dbeafe',
    };

    const { corrections } = getContrastCorrectedTokens(tokens, { isDark: false });
    const gradientFixes = corrections.filter((fix) => fix.tokenKey === '--btn-gradient-fg');
    expect(gradientFixes.length).toBeLessThanOrEqual(1);
  });

  it('respects skipKeys so user-authored tokens survive remediation passes', () => {
    const tokens = {
      '--background': '#ffffff',
      '--foreground': '#ffffff',
      '--btn-primary-bg': '#ffffff',
      '--btn-primary-fg': '#ffffff',
    };

    const { correctedTokens, skippedKeys } = getContrastCorrectedTokens(tokens, {
      isDark: false,
      skipKeys: ['--btn-primary-fg'],
    });

    expect(correctedTokens['--btn-primary-fg']).toBe('#ffffff');
    expect(skippedKeys).toContain('--btn-primary-fg');
    expect(correctedTokens['--foreground']).not.toBe('#ffffff');
  });

  it('reports non-text UI contrast issues such as borders and focus rings', () => {
    const tokens = {
      '--background': '#ffffff',
      '--card': '#ffffff',
      '--border': '#f9f9f9',
      '--ring': '#f2f2f2',
    };

    const warnings = getContrastWarnings(tokens);
    expect(warnings.some((w: { pair: string }) => w.pair.includes('--border on --background'))).toBe(true);
    expect(warnings.some((w: { pair: string }) => w.pair.includes('--ring on --background'))).toBe(true);
  });
});
