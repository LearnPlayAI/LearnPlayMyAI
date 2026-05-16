import { describe, expect, it } from '@jest/globals';
import { deriveAdminRuntimeContext } from '../lib/adminRuntimeContext';

describe('deriveAdminRuntimeContext', () => {
  it('keeps cloud superadmin in platform scope when no effective org is active', () => {
    expect(
      deriveAdminRuntimeContext({
        isSuperAdmin: true,
        isImpersonating: false,
        effectiveOrganizationId: null,
      })
    ).toMatchObject({
      scopeMode: 'platform',
      scopeLabel: 'Platform scope',
      roleBadgeLabel: 'Platform Admin',
      landingPath: '/super-admin',
      showActiveOrg: false,
    });
  });

  it('routes platform superadmin impersonation into organization scope', () => {
    expect(
      deriveAdminRuntimeContext({
        isSuperAdmin: true,
        isImpersonating: true,
        effectiveOrganizationId: 'org-1',
        effectiveOrganizationName: 'LearnPlay Business',
      })
    ).toMatchObject({
      scopeMode: 'organization',
      scopeLabel: 'Organization scope',
      roleBadgeLabel: 'Org Admin',
      landingPath: '/org-management',
      showActiveOrg: true,
      activeOrgName: 'LearnPlay Business',
    });
  });

  it('keeps onprem custsuper in organization scope with org landing', () => {
    expect(
      deriveAdminRuntimeContext({
        isCustSuper: true,
        isImpersonating: true,
        effectiveOrganizationId: 'org-1',
        effectiveOrganizationName: 'LearnPlay',
      })
    ).toMatchObject({
      scopeMode: 'organization',
      scopeLabel: 'Organization scope',
      roleBadgeLabel: 'Org Admin',
      landingPath: '/org-management',
      showActiveOrg: true,
      activeOrgName: 'LearnPlay',
    });
  });
});
