import { describe, expect, it } from '@jest/globals';
import { resolveThemeSaveStatus } from '../services/brandingThemeStatus';

describe('branding theme save status resolver', () => {
  it('always returns draft to require explicit activation after save', () => {
    expect(resolveThemeSaveStatus('active')).toBe('draft');
  });

  it('keeps draft status for non-active themes', () => {
    expect(resolveThemeSaveStatus('draft')).toBe('draft');
    expect(resolveThemeSaveStatus(undefined)).toBe('draft');
    expect(resolveThemeSaveStatus(null)).toBe('draft');
  });
});
