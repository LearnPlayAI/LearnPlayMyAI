import { describe, expect, it } from '@jest/globals';
import { hasUnsavedThemeChanges, shouldHydrateFetchedTheme } from '../lib/themeEditorStateSync';
import type { BrandEditorState } from '../components/brand-editor';

function mockState(name: string): BrandEditorState {
  return {
    tokens: { '--primary': 'hsl(220, 70%, 50%)' },
    themeName: name,
    brandName: 'Org',
    description: '',
    logoUrl: '',
    faviconUrl: '',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    supportEmail: '',
    supportUrl: '',
    termsUrl: '',
    privacyUrl: '',
    allowEmailBranding: false,
    enableContrastCorrections: true,
    presetId: null,
    gradientEnabled: false,
    gradientFrom: '',
    gradientTo: '',
    gradientAngle: '135deg',
    customCopy: {},
  };
}

describe('theme editor state sync guards', () => {
  it('detects unsaved changes only when both states exist and differ', () => {
    expect(hasUnsavedThemeChanges(null, null)).toBe(false);
    const a = mockState('A');
    const b = mockState('B');
    expect(hasUnsavedThemeChanges(a, a)).toBe(false);
    expect(hasUnsavedThemeChanges(a, b)).toBe(true);
  });

  it('blocks hydration during loading', () => {
    expect(
      shouldHydrateFetchedTheme({
        themeLoading: true,
        hasUnsavedChanges: false,
        lastHydratedEndpoint: '/api/theme',
        nextEndpoint: '/api/theme',
      })
    ).toBe(false);
  });

  it('blocks hydration for same endpoint when unsaved changes exist', () => {
    expect(
      shouldHydrateFetchedTheme({
        themeLoading: false,
        hasUnsavedChanges: true,
        lastHydratedEndpoint: '/api/theme',
        nextEndpoint: '/api/theme',
      })
    ).toBe(false);
  });

  it('allows hydration when endpoint context changes', () => {
    expect(
      shouldHydrateFetchedTheme({
        themeLoading: false,
        hasUnsavedChanges: true,
        lastHydratedEndpoint: '/api/theme',
        nextEndpoint: '/api/superadmin/branding/platform',
      })
    ).toBe(true);
  });
});
