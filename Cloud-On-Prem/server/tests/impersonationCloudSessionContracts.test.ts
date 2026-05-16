import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@127.0.0.1:5432/learnplay_test';

let isOrgAdmin: typeof import('../adminAuth').isOrgAdmin;
let isSuperAdmin: typeof import('../adminAuth').isSuperAdmin;
let resolveEffectiveOrganization: typeof import('../middleware/sessionAuthMiddleware').resolveEffectiveOrganization;
let featureFlags: typeof import('../featureFlags');
let authQueryTracker: typeof import('../monitoring/authQueryTracker');
let storage: typeof import('../storage').storage;

function buildSessionOrg(orgId: string, roles: string[] = ['org_admin']) {
  return {
    orgId,
    orgName: `Org ${orgId}`,
    orgType: 'education' as const,
    roles,
  };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    session: {
      userId: 'super-1',
      organizationId: null,
    },
    ...overrides,
  } as any;
}

function createResponse() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('cloud superadmin impersonation session contracts', () => {
  beforeAll(async () => {
    ({ isOrgAdmin, isSuperAdmin } = await import('../adminAuth'));
    ({ resolveEffectiveOrganization } = await import('../middleware/sessionAuthMiddleware'));
    featureFlags = await import('../featureFlags');
    authQueryTracker = await import('../monitoring/authQueryTracker');
    ({ storage } = await import('../storage'));
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(featureFlags, 'isFeatureEnabled').mockImplementation((flag) => {
      if (flag === 'SESSION_AUTH_ENABLED') return true;
      if (flag === 'ONPREM_MODE') return false;
      if (flag === 'ENABLE_MULTI_ORG_SWITCHING') return true;
      return false;
    });
    jest.spyOn(authQueryTracker, 'trackAuthQuery').mockImplementation(() => {});
  });

  it('resolves the impersonated organization before header or primary org fallbacks', async () => {
    const req = createRequest({
      headers: { 'x-organization-context': 'org-header' },
      session: {
        userId: 'super-1',
        organizationId: null,
        context: {
          effectiveRole: 'SuperAdmin',
          primaryOrganization: buildSessionOrg('org-primary'),
          organizations: [buildSessionOrg('org-primary'), buildSessionOrg('org-header')],
          subscription: null,
          sessionVersion: 1,
          userPreferences: {
            preferredCurrency: 'ZAR',
            needsCurrencyOnboarding: false,
            timezone: null,
            preferredLanguage: 'en',
          },
          impersonatedOrganization: buildSessionOrg('org-impersonated'),
        },
      } as any,
    });

    const result = await resolveEffectiveOrganization(req);

    expect(result).toEqual(
      expect.objectContaining({
        organizationId: 'org-impersonated',
        isImpersonation: true,
        source: 'impersonation',
      }),
    );
    expect(req.session.organizationId).toBe('org-impersonated');
  });

  it('keeps superadmin-only routes accessible while impersonation changes effective role semantics', async () => {
    const req = createRequest({
      session: {
        userId: 'super-1',
        organizationId: 'org-impersonated',
        context: {
          effectiveRole: 'OrgAdmin',
          primaryOrganization: buildSessionOrg('org-primary'),
          organizations: [buildSessionOrg('org-primary')],
          subscription: null,
          sessionVersion: 1,
          userPreferences: {
            preferredCurrency: 'ZAR',
            needsCurrencyOnboarding: false,
            timezone: null,
            preferredLanguage: 'en',
          },
          impersonatedOrganization: buildSessionOrg('org-impersonated'),
        },
      } as any,
    });
    const res = createResponse();
    const next = jest.fn();
    jest.spyOn(storage, 'getUser').mockResolvedValue({
      id: 'super-1',
      isSuperAdmin: true,
    } as any);

    await isSuperAdmin(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as any).user).toEqual(expect.objectContaining({ isSuperAdmin: true }));
  });

  it('pins org-admin middleware to the impersonated organization for cloud superadmins', async () => {
    const req = createRequest({
      session: {
        userId: 'super-1',
        organizationId: 'org-primary',
        context: {
          effectiveRole: 'SuperAdmin',
          primaryOrganization: buildSessionOrg('org-primary'),
          organizations: [buildSessionOrg('org-primary'), buildSessionOrg('org-impersonated')],
          subscription: null,
          sessionVersion: 1,
          userPreferences: {
            preferredCurrency: 'ZAR',
            needsCurrencyOnboarding: false,
            timezone: null,
            preferredLanguage: 'en',
          },
          impersonatedOrganization: buildSessionOrg('org-impersonated'),
        },
      } as any,
    });
    const res = createResponse();
    const next = jest.fn();
    jest.spyOn(storage, 'getUser').mockResolvedValue({
      id: 'super-1',
      isSuperAdmin: true,
    } as any);

    await isOrgAdmin(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as any).resolvedOrganizationId).toBe('org-impersonated');
  });

  it('does not fall back to stale legacy organizationId when context has no effective organization', async () => {
    const req = createRequest({
      session: {
        userId: 'super-1',
        organizationId: 'org-stale',
        context: {
          effectiveRole: 'SuperAdmin',
          primaryOrganization: null,
          organizations: [],
          subscription: null,
          sessionVersion: 1,
          userPreferences: {
            preferredCurrency: 'ZAR',
            needsCurrencyOnboarding: false,
            timezone: null,
            preferredLanguage: 'en',
          },
          impersonatedOrganization: null,
        },
      } as any,
    });

    const result = await resolveEffectiveOrganization(req);

    expect(result).toEqual(
      expect.objectContaining({
        organizationId: null,
        isImpersonation: false,
        source: 'none',
      }),
    );
  });
});
