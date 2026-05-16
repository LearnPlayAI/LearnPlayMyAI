import { describe, expect, it } from '@jest/globals';
import { checkRouteAccess, type UserRole } from '../lib/protectedRouteAccess';
import { deriveAdminRuntimeContext } from '../lib/adminRuntimeContext';

function canAccess(allowedRoles: UserRole[], input: {
  isSuperAdmin?: boolean;
  isCustSuper?: boolean;
  isOrgAdmin?: boolean;
  isTeacher?: boolean;
  isAuthenticated?: boolean;
  isImpersonating?: boolean;
  effectiveOrganizationId?: string | null;
  effectiveOrganizationName?: string | null;
}) {
  return checkRouteAccess(allowedRoles, {
    runtimeContext: deriveAdminRuntimeContext(input),
    isSuperAdmin: Boolean(input.isSuperAdmin),
    isCustSuper: Boolean(input.isCustSuper),
    isOrgAdmin: Boolean(input.isOrgAdmin),
    isTeacher: Boolean(input.isTeacher),
    isAuthenticated: input.isAuthenticated ?? true,
  });
}

describe('ProtectedRoute access decisions', () => {
  it('keeps cloud platform superadmin out of org-scoped theme editor when no active org context exists', () => {
    expect(
      canAccess(['orgadmin'], {
        isSuperAdmin: true,
        isAuthenticated: true,
      })
    ).toBe(false);
  });

  it('allows impersonating platform superadmin onto the org-scoped theme editor', () => {
    expect(
      canAccess(['orgadmin'], {
        isSuperAdmin: true,
        isImpersonating: true,
        effectiveOrganizationId: 'org-1',
        effectiveOrganizationName: 'Org One',
        isAuthenticated: true,
      })
    ).toBe(true);
  });

  it('allows onprem custsuper onto the org-scoped theme editor through canonical org capability', () => {
    expect(
      canAccess(['orgadmin'], {
        isCustSuper: true,
        isImpersonating: true,
        effectiveOrganizationId: 'org-2',
        effectiveOrganizationName: 'District Org',
        isAuthenticated: true,
      })
    ).toBe(true);
  });

  it('keeps platform-only superadmin routes restricted from custsuper org scope', () => {
    expect(
      canAccess(['superadmin'], {
        isCustSuper: true,
        isImpersonating: true,
        effectiveOrganizationId: 'org-2',
        effectiveOrganizationName: 'District Org',
        isAuthenticated: true,
      })
    ).toBe(false);
  });
});
