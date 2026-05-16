import { describe, expect, it } from '@jest/globals';
import { resolveBrandingRuntimeOrgId } from '../lib/brandingRuntimeScope';

describe('branding runtime org scope resolver', () => {
  it('returns null for non-impersonating superadmin sessions', () => {
    expect(
      resolveBrandingRuntimeOrgId({
        userInfo: {
          isSuperAdmin: true,
          isImpersonating: false,
          organizationId: 'org-1',
        },
        userRoles: {
          defaultOrganizationId: 'org-2',
        },
      })
    ).toBeNull();
  });

  it('returns impersonated org for superadmin impersonation sessions', () => {
    expect(
      resolveBrandingRuntimeOrgId({
        userInfo: {
          isSuperAdmin: true,
          isImpersonating: true,
          impersonatedOrganization: { id: 'org-imp' },
        },
        userRoles: {
          defaultOrganizationId: 'org-default',
        },
      })
    ).toBe('org-imp');
  });

  it('falls back to role default org for regular users', () => {
    expect(
      resolveBrandingRuntimeOrgId({
        userInfo: { isSuperAdmin: false, organizationId: 'org-session' },
        userRoles: { defaultOrganizationId: 'org-default' },
      })
    ).toBe('org-default');
  });

  it('keeps custsuper org scope when not impersonating', () => {
    expect(
      resolveBrandingRuntimeOrgId({
        userInfo: {
          isCustSuper: true,
          isImpersonating: false,
          organizationId: 'org-cust',
        },
        userRoles: { defaultOrganizationId: 'org-default' },
      })
    ).toBe('org-cust');
  });
});
