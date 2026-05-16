import { describe, expect, test } from '@jest/globals';

import { projectLegacyOrganizationContext } from '../middleware/legacyOrgContext';

describe('projectLegacyOrganizationContext', () => {
  test('projects impersonated org into legacy session fields', () => {
    const session: any = {
      organizationId: 'org-old',
      user: { id: 'u1', organizationId: 'org-old' },
      context: {
        impersonatedOrganization: {
          orgId: 'org-imp',
          orgName: 'Impersonated Org',
          orgType: 'business',
          roles: ['OrgAdmin'],
        },
      },
    };

    const projected = projectLegacyOrganizationContext(session);

    expect(projected).toBe('org-imp');
    expect(session.organizationId).toBe('org-imp');
    expect(session.user.organizationId).toBe('org-imp');
  });

  test('projects primary organization when not impersonating', () => {
    const session: any = {
      organizationId: 'org-stale',
      user: { id: 'u1', organizationId: 'org-stale' },
      context: {
        primaryOrganization: {
          orgId: 'org-primary',
          orgName: 'Primary Org',
          orgType: 'business',
          roles: ['OrgAdmin'],
        },
      },
    };

    const projected = projectLegacyOrganizationContext(session);

    expect(projected).toBe('org-primary');
    expect(session.organizationId).toBe('org-primary');
    expect(session.user.organizationId).toBe('org-primary');
  });

  test('clears stale legacy org fields when no effective organization exists in context', () => {
    const session: any = {
      organizationId: 'org-stale',
      user: { id: 'u1', organizationId: 'org-stale' },
      context: {
        primaryOrganization: null,
        organizations: [],
        impersonatedOrganization: null,
      },
    };

    const projected = projectLegacyOrganizationContext(session);

    expect(projected).toBeNull();
    expect(session.organizationId).toBeUndefined();
    expect(session.user.organizationId).toBeUndefined();
  });
});
