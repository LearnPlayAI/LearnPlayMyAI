/**
 * Integration tests for session-based authentication system
 *
 * This suite mounts the auth router into an isolated Express app and
 * validates session context behavior against current route contracts.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import express, { type Express, type Request, type Response } from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
  users,
  organizations,
  userOrganizationRoles,
  organizationLicenses,
  userOrganizationAssignments,
} from '@shared/schema';
import { configureSession } from '../routes/shared';
import { createAuthRouter } from '../routes/authRoutes';
import { registerAdminRoutes } from '../routes/adminRoutes';
import { registerSuperAdminRoutes } from '../routes/superAdminRoutes';
import { storage, LEARNER_ROLES, ADMIN_ROLES, INSTRUCTOR_ROLES } from '../storage';
import { SessionContextService } from '../services/sessionContextService';
import { withSessionAuthMiddleware, resolveEffectiveOrganization, type RequestWithEffectiveOrg } from '../middleware/sessionAuthMiddleware';
import { SessionInvalidationService } from '../services/sessionInvalidationService';
import { resolveEffectiveLocale } from '../utils/effectiveLocale';

interface FixtureState {
  userIds: string[];
  organizationIds: string[];
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

describe('Session-Based Authentication', () => {
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;
  let app: Express;
  let agent: ReturnType<typeof request.agent>;
  let testUser: typeof users.$inferSelect;
  let testOrg1: typeof organizations.$inferSelect;
  let testOrg2: typeof organizations.$inferSelect;
  let fixtureState: FixtureState;

  const originalSessionAuth = process.env.SESSION_AUTH_ENABLED;
  const originalMultiOrg = process.env.ENABLE_MULTI_ORG_SWITCHING;
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalCookieSecure = process.env.COOKIE_SECURE;
  const originalSessionCookieDomain = process.env.SESSION_COOKIE_DOMAIN;
  const originalOnPremMode = process.env.ONPREM_MODE;
  const originalDeploymentMode = process.env.DEPLOYMENT_MODE;

  async function cleanupFixtures() {
    if (fixtureState.userIds.length > 0) {
      await db
        .delete(userOrganizationRoles)
        .where(inArray(userOrganizationRoles.userId, fixtureState.userIds));
    }

    if (fixtureState.organizationIds.length > 0) {
      await db
        .delete(organizationLicenses)
        .where(inArray(organizationLicenses.organizationId, fixtureState.organizationIds));
      await db
        .delete(organizations)
        .where(inArray(organizations.id, fixtureState.organizationIds));
    }

    if (fixtureState.userIds.length > 0) {
      await db
        .delete(users)
        .where(inArray(users.id, fixtureState.userIds));
    }
  }

  async function seedPrimaryFixtures() {
    const suffix = uniqueSuffix();
    const hashedPassword = await bcrypt.hash('testpass123', 10);

    [testUser] = await db
      .insert(users)
      .values({
        gamerName: `session_user_${suffix}`,
        email: `session_${suffix}@example.com`,
        password: hashedPassword,
        firstName: 'Session',
        lastName: 'Tester',
        sessionVersion: 1,
      })
      .returning();

    fixtureState.userIds.push(testUser.id);

    [testOrg1] = await db
      .insert(organizations)
      .values({
        name: `Session Org 1 ${suffix}`,
        inviteCode: `SORG1_${suffix}`.slice(0, 24),
        type: 'education',
        trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    [testOrg2] = await db
      .insert(organizations)
      .values({
        name: `Session Org 2 ${suffix}`,
        inviteCode: `SORG2_${suffix}`.slice(0, 24),
        type: 'elearning',
        trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    fixtureState.organizationIds.push(testOrg1.id, testOrg2.id);

    await db.insert(userOrganizationRoles).values([
      {
        userId: testUser.id,
        organizationId: testOrg1.id,
        role: 'org_admin',
      },
      {
        userId: testUser.id,
        organizationId: testOrg2.id,
        role: 'teacher',
      },
    ]);

    const currentTermStart = new Date();
    const currentTermEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(organizationLicenses).values([
      {
        organizationId: testOrg1.id,
        tier: 'gold',
        status: 'active',
        totalSeats: 100,
        seatsConsumed: 0,
        billingPeriodMonths: 1,
        currentTermStart,
        currentTermEnd,
      },
      {
        organizationId: testOrg2.id,
        tier: 'gold',
        status: 'active',
        totalSeats: 100,
        seatsConsumed: 0,
        billingPeriodMonths: 1,
        currentTermStart,
        currentTermEnd,
      },
    ]);
  }

  async function loginPrimaryUser() {
    const res = await agent.post('/api/auth/login').send({
      email: testUser.email,
      password: 'testpass123',
    });
    expect(res.status).toBe(200);
  }

  beforeAll(() => {
    // Suppress verbose session/runtime logs in tests to avoid memory pressure in runInBand mode.
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'jest-session-secret';
    process.env.COOKIE_SECURE = 'false';
    delete process.env.SESSION_COOKIE_DOMAIN;
    process.env.ONPREM_MODE = 'false';
    process.env.DEPLOYMENT_MODE = 'cloud';

    app = express();
    app.use(express.json());
    configureSession(app);
    app.use(createAuthRouter());
    registerAdminRoutes(app);
    registerSuperAdminRoutes(app);
    app.get('/api/user/roles', withSessionAuthMiddleware, async (req: Request, res: Response) => {
      if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const userId = req.session.userId;
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        const sessionScope = SessionContextService.getCanonicalSessionScope(req.session.context);
        const userRoles = sessionScope.organizationRoles.length > 0
          ? sessionScope.organizationRoles
          : await storage.getUserRoles(userId);

        const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
        const effectiveOrgId = effectiveResult.organizationId || null;
        const isImpersonating = effectiveResult.isImpersonation;
        const isTopAdmin = user.isSuperAdmin || user.isCustSuper;
        const effectiveLocale = req.session.context?.userPreferences?.effectiveLocale ?? resolveEffectiveLocale({
          userTimezone: user.timezone ?? null,
          organizationTimezone: effectiveResult.organization?.orgTimezone ?? null,
          userCurrency: user.preferredCurrency ?? null,
          organizationCurrency: effectiveResult.organization?.orgCurrency ?? null,
        });

        if (isTopAdmin) {
          const allOrganizations = await storage.getAllOrganizations();
          const fallbackDefaultOrgId = allOrganizations.length > 0 ? allOrganizations[0].id : null;
          const defaultOrganizationId = effectiveOrgId || fallbackDefaultOrgId;
          const filteredOrganizations = isImpersonating && effectiveOrgId
            ? allOrganizations.filter((org: any) => org.id === effectiveOrgId)
            : allOrganizations;

          return res.json({
            isSuperAdmin: user.isSuperAdmin || false,
            isCustSuper: user.isCustSuper || false,
            roles: [],
            organizations: filteredOrganizations.map((org: any) => ({ id: org.id, name: org.name, type: org.type })),
            defaultOrganizationId,
            effectiveOrganizationId: defaultOrganizationId,
            isImpersonating,
            effectiveLocale,
            unitId: null,
            subUnitId: null,
          });
        }

        const uniqueOrgs = Array.from(new Set(userRoles.map((r: any) => r.organizationId)));
        const organizations = [];
        for (const orgId of uniqueOrgs) {
          const org = await storage.getOrganization(orgId);
          if (org) organizations.push({ id: org.id, name: org.name, type: org.type });
        }

        let defaultOrganizationId = sessionScope.effectiveOrganizationId;
        if (!defaultOrganizationId && userRoles.length > 0) {
          const primaryRole = userRoles.find((r: any) => [...ADMIN_ROLES, ...INSTRUCTOR_ROLES].includes(r.role)) || userRoles[0];
          defaultOrganizationId = primaryRole.organizationId;
        }

        const effectiveOrganizationId = effectiveOrgId || defaultOrganizationId;

        let unitId: string | null = null;
        let subUnitId: string | null = null;
        if (effectiveOrganizationId) {
          const effectiveOrgRoles = userRoles.filter((role: any) => role.organizationId === effectiveOrganizationId);
          const hasLearnerRoleInEffectiveOrg = effectiveOrgRoles.some((role: any) => LEARNER_ROLES.includes(role.role));
          if (hasLearnerRoleInEffectiveOrg) {
            const userAssignments = await db
              .select({ unitId: userOrganizationAssignments.unitId, subUnitId: userOrganizationAssignments.subUnitId })
              .from(userOrganizationAssignments)
              .where(and(eq(userOrganizationAssignments.userId, userId), eq(userOrganizationAssignments.organizationId, effectiveOrganizationId)))
              .limit(1);
            unitId = userAssignments[0]?.unitId ?? null;
            subUnitId = userAssignments[0]?.subUnitId ?? null;
          }
        }

        return res.json({
          isSuperAdmin: user.isSuperAdmin || false,
          isCustSuper: user.isCustSuper || false,
          roles: userRoles,
          organizations,
          defaultOrganizationId,
          effectiveOrganizationId,
          isImpersonating,
          effectiveLocale,
          unitId,
          subUnitId,
        });
      } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch user roles' });
      }
    });
  });

  beforeEach(async () => {
    fixtureState = { userIds: [], organizationIds: [] };
    process.env.SESSION_AUTH_ENABLED = 'true';
    process.env.ENABLE_MULTI_ORG_SWITCHING = 'true';
    await seedPrimaryFixtures();
    agent = request.agent(app);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    process.env.SESSION_AUTH_ENABLED = originalSessionAuth;
    process.env.ENABLE_MULTI_ORG_SWITCHING = originalMultiOrg;
    process.env.SESSION_SECRET = originalSessionSecret;
    process.env.COOKIE_SECURE = originalCookieSecure;
    process.env.SESSION_COOKIE_DOMAIN = originalSessionCookieDomain;
    process.env.ONPREM_MODE = originalOnPremMode;
    process.env.DEPLOYMENT_MODE = originalDeploymentMode;
  });

  describe('Session context and org resolution', () => {
    it('builds session context on login and exposes session metrics for admin users', async () => {
      await loginPrimaryUser();

      const metricsResponse = await agent.get('/api/internal/session-metrics');
      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.authenticated).toBe(true);
      expect(metricsResponse.body.sessionAuth).toBe(true);
      expect(metricsResponse.body.organizations).toBe(2);
      expect(metricsResponse.body.effectiveRole).toMatch(/OrgAdmin|Teacher|SuperAdmin/);
      expect(metricsResponse.body.sessionVersion).toBe(1);
      expect(metricsResponse.body.hasSubscription).toBe(true);
    });

    it('uses primary org by default and supports X-Organization-Context switching', async () => {
      await loginPrimaryUser();

      const primary = await agent.get('/api/auth/user');
      expect(primary.status).toBe(200);
      expect([testOrg1.id, testOrg2.id]).toContain(primary.body.organizationId);
      expect(['education', 'elearning']).toContain(primary.body.organizationType);

      const switched = await agent
        .get('/api/auth/user')
        .set('X-Organization-Context', testOrg2.id);
      expect(switched.status).toBe(200);
      expect(switched.body.organizationId).toBe(testOrg2.id);
      expect(switched.body.organizationType).toBe('elearning');
    });

    it('falls back to primary org when header org is invalid', async () => {
      await loginPrimaryUser();
      const baseline = await agent.get('/api/auth/user');
      expect(baseline.status).toBe(200);

      const response = await agent
        .get('/api/auth/user')
        .set('X-Organization-Context', 'not-an-accessible-org');

      expect(response.status).toBe(200);
      expect(response.body.organizationId).toBe(baseline.body.organizationId);
      expect(response.body.organizationType).toBe(baseline.body.organizationType);
    });

    it('keeps /api/auth/user, /api/user/roles, and /api/admin/check aligned for baseline, header switching, and invalid-header fallback', async () => {
      await loginPrimaryUser();

      const baselineUser = await agent.get('/api/auth/user');
      const baselineRoles = await agent.get('/api/user/roles');
      const baselineAdmin = await agent.get('/api/admin/check');

      expect(baselineUser.status).toBe(200);
      expect(baselineRoles.status).toBe(200);
      expect(baselineAdmin.status).toBe(200);
      const baselineOrganizationId = baselineUser.body.organizationId;
      expect(baselineRoles.body.effectiveOrganizationId).toBe(baselineOrganizationId);
      expect(baselineAdmin.body.effectiveOrganizationId).toBe(baselineOrganizationId);
      expect(baselineUser.body.userPreferences.effectiveLocale).toBeDefined();
      expect(baselineRoles.body.effectiveLocale).toEqual(baselineUser.body.userPreferences.effectiveLocale);
      expect(baselineAdmin.body.effectiveLocale).toEqual(baselineUser.body.userPreferences.effectiveLocale);
      expect([testOrg1.id, testOrg2.id]).toContain(baselineOrganizationId);
      expect(baselineAdmin.body.isOrgAdmin).toBe(baselineOrganizationId === testOrg1.id);
      expect(baselineAdmin.body.isTeacher).toBe(baselineOrganizationId === testOrg2.id);

      const switchedUser = await agent.get('/api/auth/user').set('X-Organization-Context', testOrg2.id);
      const switchedRoles = await agent.get('/api/user/roles').set('X-Organization-Context', testOrg2.id);
      const switchedAdmin = await agent.get('/api/admin/check').set('X-Organization-Context', testOrg2.id);

      expect(switchedUser.status).toBe(200);
      expect(switchedRoles.status).toBe(200);
      expect(switchedAdmin.status).toBe(200);
      expect(switchedUser.body.organizationId).toBe(testOrg2.id);
      expect(switchedRoles.body.effectiveOrganizationId).toBe(testOrg2.id);
      expect(switchedAdmin.body.effectiveOrganizationId).toBe(testOrg2.id);
      expect(switchedRoles.body.effectiveLocale).toEqual(switchedUser.body.userPreferences.effectiveLocale);
      expect(switchedAdmin.body.effectiveLocale).toEqual(switchedUser.body.userPreferences.effectiveLocale);
      expect(switchedAdmin.body.effectiveOrganizationSource).toBe('header');
      expect(switchedAdmin.body.isOrgAdmin).toBe(false);
      expect(switchedAdmin.body.isTeacher).toBe(true);

      const invalidUser = await agent.get('/api/auth/user').set('X-Organization-Context', 'not-an-accessible-org');
      const invalidRoles = await agent.get('/api/user/roles').set('X-Organization-Context', 'not-an-accessible-org');
      const invalidAdmin = await agent.get('/api/admin/check').set('X-Organization-Context', 'not-an-accessible-org');

      expect(invalidUser.status).toBe(200);
      expect(invalidRoles.status).toBe(200);
      expect(invalidAdmin.status).toBe(200);
      expect(invalidUser.body.organizationId).toBe(baselineOrganizationId);
      expect(invalidRoles.body.effectiveOrganizationId).toBe(baselineOrganizationId);
      expect(invalidAdmin.body.effectiveOrganizationId).toBe(baselineOrganizationId);
      expect(invalidRoles.body.effectiveLocale).toEqual(invalidUser.body.userPreferences.effectiveLocale);
      expect(invalidAdmin.body.effectiveLocale).toEqual(invalidUser.body.userPreferences.effectiveLocale);
      expect(invalidAdmin.body.effectiveOrganizationSource).toBe('primary');
      expect(invalidAdmin.body.isOrgAdmin).toBe(baselineOrganizationId === testOrg1.id);
      expect(invalidAdmin.body.isTeacher).toBe(baselineOrganizationId === testOrg2.id);
    });

    it('keeps /api/admin/check aligned with impersonated org context for superadmins', async () => {
      const suffix = uniqueSuffix();
      const hashedPassword = await bcrypt.hash('superpass123', 10);
      const [superUser] = await db
        .insert(users)
        .values({
          gamerName: `super_${suffix}`,
          email: `super_${suffix}@example.com`,
          password: hashedPassword,
          firstName: 'Super',
          lastName: 'Admin',
          isSuperAdmin: true,
          sessionVersion: 1,
        })
        .returning();
      fixtureState.userIds.push(superUser.id);

      const superAgent = request.agent(app);
      const login = await superAgent.post('/api/auth/login').send({
        email: superUser.email,
        password: 'superpass123',
      });
      expect(login.status).toBe(200);

      const impersonation = await superAgent.post('/api/superadmin/impersonation').send({
        organizationId: testOrg2.id,
      });
      expect(impersonation.status).toBe(200);

      const userResponse = await superAgent.get('/api/auth/user');
      const rolesResponse = await superAgent.get('/api/user/roles');
      const adminResponse = await superAgent.get('/api/admin/check');

      expect(userResponse.status).toBe(200);
      expect(rolesResponse.status).toBe(200);
      expect(adminResponse.status).toBe(200);
      expect(userResponse.body.organizationId).toBe(testOrg2.id);
      expect(userResponse.body.impersonatedOrganization?.id).toBe(testOrg2.id);
      expect(rolesResponse.body.effectiveOrganizationId).toBe(testOrg2.id);
      expect(rolesResponse.body.isImpersonating).toBe(true);
      expect(adminResponse.body.effectiveOrganizationId).toBe(testOrg2.id);
      expect(adminResponse.body.effectiveOrganizationSource).toBe('impersonation');
      expect(adminResponse.body.isImpersonating).toBe(true);
      expect(adminResponse.body.impersonatedOrganization?.id).toBe(testOrg2.id);
      expect(adminResponse.body.isOrgAdmin).toBe(true);
      expect(adminResponse.body.isTeacher).toBe(true);
    });
  });

  describe('Session invalidation and refresh', () => {
    it('rejects stale sessions after sessionVersion increments', async () => {
      await loginPrimaryUser();

      const baseline = await agent.get('/api/auth/user');
      expect(baseline.status).toBe(200);

      await SessionInvalidationService.invalidateUserSessions(testUser.id, 'Test invalidation');

      const stale = await agent.get('/api/auth/user');
      expect(stale.status).toBe(401);
      expect(stale.body.code).toBe('STALE_SESSION');
    });

    it('rejects stale sessions consistently across /api/auth/user, /api/user/roles, and /api/admin/check', async () => {
      const endpoints = ['/api/auth/user', '/api/user/roles', '/api/admin/check'];

      for (const endpoint of endpoints) {
        const endpointAgent = request.agent(app);
        const loginResponse = await endpointAgent.post('/api/auth/login').send({
          email: testUser.email,
          password: 'testpass123',
        });
        expect(loginResponse.status).toBe(200);

        const baselineResponse = await endpointAgent.get(endpoint);
        expect(baselineResponse.status).toBe(200);

        await SessionInvalidationService.invalidateUserSessions(testUser.id, `Parity stale-session invalidation for ${endpoint}`);

        const staleResponse = await endpointAgent.get(endpoint);
        expect(staleResponse.status).toBe(401);
        expect(staleResponse.body.code).toBe('STALE_SESSION');
      }
    });

    it('refreshes session context when session is valid and rejects stale refresh', async () => {
      await loginPrimaryUser();

      const refreshed = await agent.post('/api/auth/refresh');
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.context.sessionVersion).toBe(1);

      await SessionInvalidationService.invalidateUserSessions(testUser.id, 'Force stale refresh');

      const staleRefresh = await agent.post('/api/auth/refresh');
      expect(staleRefresh.status).toBe(401);
      expect(staleRefresh.body.code).toBe('STALE_SESSION');
    });
  });

  describe('Feature-flag fallback behavior', () => {
    it('returns 501 for refresh when SESSION_AUTH_ENABLED=false', async () => {
      process.env.SESSION_AUTH_ENABLED = 'false';
      await loginPrimaryUser();

      const response = await agent.post('/api/auth/refresh');
      expect(response.status).toBe(501);
      expect(response.body.error).toContain('Session refresh not available');
    });

    it('reports no subscription after license removal for a newly authenticated user', async () => {
      await db
        .delete(organizationLicenses)
        .where(eq(organizationLicenses.organizationId, testOrg1.id));

      const suffix = uniqueSuffix();
      const hashedPassword = await bcrypt.hash('nosub123', 10);
      const [noSubUser] = await db
        .insert(users)
        .values({
          gamerName: `nosub_${suffix}`,
          email: `nosub_${suffix}@example.com`,
          password: hashedPassword,
          firstName: 'No',
          lastName: 'Sub',
          sessionVersion: 1,
        })
        .returning();
      fixtureState.userIds.push(noSubUser.id);

      await db.insert(userOrganizationRoles).values({
        userId: noSubUser.id,
        organizationId: testOrg1.id,
        role: 'org_admin',
      });

      const noSubAgent = request.agent(app);
      const login = await noSubAgent.post('/api/auth/login').send({
        email: noSubUser.email,
        password: 'nosub123',
      });
      expect(login.status).toBe(200);

      const metrics = await noSubAgent.get('/api/internal/session-metrics');
      expect(metrics.status).toBe(200);
      expect(metrics.body.hasSubscription).toBe(false);
    });
  });

  describe('Bulk session invalidation', () => {
    it('increments sessionVersion for all selected users', async () => {
      const suffix = uniqueSuffix();
      const hashedPassword = await bcrypt.hash('bulkpass123', 10);

      const createdUsers = await db
        .insert(users)
        .values([
          {
            gamerName: `bulk_user_2_${suffix}`,
            email: `bulk_user_2_${suffix}@example.com`,
            password: hashedPassword,
            firstName: 'Bulk',
            lastName: 'User2',
            sessionVersion: 1,
          },
          {
            gamerName: `bulk_user_3_${suffix}`,
            email: `bulk_user_3_${suffix}@example.com`,
            password: hashedPassword,
            firstName: 'Bulk',
            lastName: 'User3',
            sessionVersion: 1,
          },
        ])
        .returning();

      fixtureState.userIds.push(...createdUsers.map((u) => u.id));

      const targetUserIds = [testUser.id, ...createdUsers.map((u) => u.id)];

      await SessionInvalidationService.invalidateMultipleUserSessions(
        targetUserIds,
        'Organization-wide policy update'
      );

      const updatedUsers = await db
        .select({ id: users.id, sessionVersion: users.sessionVersion })
        .from(users)
        .where(inArray(users.id, targetUserIds));

      expect(updatedUsers).toHaveLength(3);
      updatedUsers.forEach((user) => {
        expect(user.sessionVersion).toBe(2);
      });

      const untouched = await db
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(and(eq(users.id, testUser.id), eq(users.sessionVersion, 2)));
      expect(untouched).toHaveLength(1);
    });
  });
});
