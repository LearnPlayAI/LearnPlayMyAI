import { describe, expect, it } from '@jest/globals';
import { shouldResolveOrgThemeForAuthenticatedRequest } from '../services/brandingRuntimeResolutionPolicy';

describe('branding runtime resolution policy', () => {
  it('skips org theme resolution for non-impersonating platform admins on platform domains', () => {
    expect(
      shouldResolveOrgThemeForAuthenticatedRequest({
        isAuthenticated: true,
        isPlatformDomain: true,
        isPlatformAdmin: true,
        isImpersonating: false,
        hasExplicitOrgContext: false,
      })
    ).toBe(false);
  });

  it('keeps org theme resolution for platform admins when impersonating', () => {
    expect(
      shouldResolveOrgThemeForAuthenticatedRequest({
        isAuthenticated: true,
        isPlatformDomain: true,
        isPlatformAdmin: true,
        isImpersonating: true,
        hasExplicitOrgContext: false,
      })
    ).toBe(true);
  });

  it('keeps org theme resolution when explicit org context is provided', () => {
    expect(
      shouldResolveOrgThemeForAuthenticatedRequest({
        isAuthenticated: true,
        isPlatformDomain: true,
        isPlatformAdmin: true,
        isImpersonating: false,
        hasExplicitOrgContext: true,
      })
    ).toBe(true);
  });

  it('keeps org theme resolution for regular org users on platform domains', () => {
    expect(
      shouldResolveOrgThemeForAuthenticatedRequest({
        isAuthenticated: true,
        isPlatformDomain: true,
        isPlatformAdmin: false,
        isImpersonating: false,
        hasExplicitOrgContext: false,
      })
    ).toBe(true);
  });
});

