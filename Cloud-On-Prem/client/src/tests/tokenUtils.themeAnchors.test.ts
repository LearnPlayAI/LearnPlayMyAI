import { describe, expect, it } from '@jest/globals';
import { regenerateTokens, resolveThemeTokens } from '../utils/tokenUtils';

describe('token utils anchor preservation', () => {
  it('keeps primary, secondary, and accent unchanged when regenerating token sets', () => {
    const input = {
      '--primary': 'hsl(0, 0%, 100%)',
      '--secondary': 'hsl(0, 0%, 98%)',
      '--accent': 'hsl(0, 0%, 96%)',
      '--background': 'hsl(0, 0%, 100%)',
      '--foreground': 'hsl(220, 15%, 10%)',
      '--card': 'hsl(0, 0%, 100%)',
      '--card-foreground': 'hsl(220, 15%, 10%)',
      '--muted': 'hsl(0, 0%, 94%)',
      '--muted-foreground': 'hsl(0, 0%, 40%)',
      '--border': 'hsl(0, 0%, 85%)',
    };

    const regenerated = regenerateTokens(input);

    expect(regenerated['--primary']).toBe(input['--primary']);
    expect(regenerated['--secondary']).toBe(input['--secondary']);
    expect(regenerated['--accent']).toBe(input['--accent']);
  });

  it('preserves authored primitive overrides when resolving partial token sets', () => {
    const partial = {
      '--primary': '#2563eb',
      '--secondary': '#1d4ed8',
      '--accent': '#0ea5e9',
      '--btn-warning-hover': '#4f46e5',
      '--badge-hover-bg': '#0891b2',
    };

    const resolved = resolveThemeTokens(partial, 'light');

    expect(resolved['--btn-warning-hover']).toBe('#4f46e5');
    expect(resolved['--badge-hover-bg']).toBe('#0891b2');
  });
});
