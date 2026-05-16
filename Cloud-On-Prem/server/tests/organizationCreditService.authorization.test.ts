import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@127.0.0.1:5432/learnplay_test';

let db: typeof import('../db').db;
let OrganizationCreditService: typeof import('../services/organizationCreditService').OrganizationCreditService;

function mockSelectWithLimitResult<T>(rows: T[]) {
  return {
    from: () => ({
      where: () => ({
        limit: async () => rows,
      }),
    }),
  } as any;
}

function mockSelectWhereResult<T>(rows: T[]) {
  return {
    from: () => ({
      where: async () => rows,
    }),
  } as any;
}

describe('OrganizationCreditService.canSpendOrgCredits', () => {
  beforeAll(async () => {
    ({ db } = await import('../db'));
    ({ OrganizationCreditService } = await import('../services/organizationCreditService'));
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('authorizes superadmin impersonation spend even when user is not a direct org member', async () => {
    const selectSpy = jest.spyOn(db as any, 'select');
    selectSpy
      .mockImplementationOnce(() =>
        mockSelectWithLimitResult([
          { id: 'org-1', useOrgCreditWallet: true, allowTeachersToSpendCredits: false },
        ]),
      )
      .mockImplementationOnce(() =>
        mockSelectWithLimitResult([
          { isSuperAdmin: true },
        ]),
      )
      .mockImplementationOnce(() => mockSelectWhereResult([]));

    const result = await OrganizationCreditService.canSpendOrgCredits('super-1', 'org-1');

    expect(result.authorized).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects non-superadmin users who are not org members', async () => {
    const selectSpy = jest.spyOn(db as any, 'select');
    selectSpy
      .mockImplementationOnce(() =>
        mockSelectWithLimitResult([
          { id: 'org-1', useOrgCreditWallet: true, allowTeachersToSpendCredits: false },
        ]),
      )
      .mockImplementationOnce(() =>
        mockSelectWithLimitResult([
          { isSuperAdmin: false },
        ]),
      )
      .mockImplementationOnce(() => mockSelectWhereResult([]));

    const result = await OrganizationCreditService.canSpendOrgCredits('user-1', 'org-1');

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('User is not a member of this organization');
  });

  it('allows superadmin billing views for impersonated orgs without direct membership', async () => {
    const selectSpy = jest.spyOn(db as any, 'select');
    selectSpy.mockImplementationOnce(() =>
      mockSelectWithLimitResult([
        { isSuperAdmin: true },
      ]),
    );

    const result = await OrganizationCreditService.canViewOrgCredits('super-1', 'org-1');

    expect(result).toBe(true);
  });
});
