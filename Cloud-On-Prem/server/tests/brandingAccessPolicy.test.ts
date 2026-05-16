import { describe, expect, it } from '@jest/globals';
import { getRequestedOrgIdFromQuery, resolveBrandingTargetOrgId } from '../services/brandingAccessPolicy';

describe('branding access policy helpers', () => {
  it('extracts a valid orgId query value', () => {
    expect(getRequestedOrgIdFromQuery({ orgId: 'org-1' })).toBe('org-1');
    expect(getRequestedOrgIdFromQuery({ orgId: '  org-2  ' })).toBe('org-2');
  });

  it('rejects invalid or platform orgId query values', () => {
    expect(getRequestedOrgIdFromQuery({ orgId: '' })).toBeNull();
    expect(getRequestedOrgIdFromQuery({ orgId: '__platform__' })).toBeNull();
    expect(getRequestedOrgIdFromQuery({})).toBeNull();
  });

  it('allows superadmin request-scoped org targeting', () => {
    expect(
      resolveBrandingTargetOrgId({
        requestedOrgId: 'org-requested',
        effectiveOrgId: 'org-session',
        isSuperAdmin: true,
        isCustSuper: false,
      })
    ).toBe('org-requested');
  });

  it('uses effective org for non-superadmin users', () => {
    expect(
      resolveBrandingTargetOrgId({
        requestedOrgId: 'org-requested',
        effectiveOrgId: 'org-session',
        isSuperAdmin: false,
        isCustSuper: false,
      })
    ).toBe('org-session');
  });

  it('allows custsuper request-scoped org targeting', () => {
    expect(
      resolveBrandingTargetOrgId({
        requestedOrgId: 'org-requested',
        effectiveOrgId: 'org-session',
        isSuperAdmin: false,
        isCustSuper: true,
      })
    ).toBe('org-requested');
  });
});
