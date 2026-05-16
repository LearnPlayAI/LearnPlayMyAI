// @ts-nocheck
/**
 * Admin Routes Module
 * 
 * Contains all /api/admin/* routes for administrative functions including:
 * - User management (CRUD, roles, password reset)
 * - Organization management (CRUD, trials, demo mode)
 * - Unit and Sub-unit management
 * - Subject management
 * - Card collections and cards (non-quiz)
 * - Feature flags management
 * - Dashboard stats
 * - Reports
 * - Cleanup operations
 * 
 * Note: This does NOT include:
 * - /api/admin/org-credits/* (in orgRoutes.ts)
 * - /api/admin/gamification/* (in gamificationRoutes.ts)
 * - /api/admin/quiz-collections/* and /api/admin/quiz-cards/* (in quizRoutes.ts)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getBaseUrl } from '../config/base-url';
import { z } from 'zod';
import { eq, and, or, sql, desc, inArray, lte, gte } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import {
  organizations,
  users,
  userOrganizationRoles,
  quizCollections,
  quizGameResults,
  gameResults,
  unitSubjects,
  joinRequests,
  insertCardCollectionSchema,
  insertCollectionStatTypeSchema,
  insertUniversalStatUnitSchema,
  insertOrganizationSchema,
  insertBusinessPackageSchema,
  insertBusinessPackagePriceSchema,
  interOrgCourseAssignmentRules,
  insertInterOrgCourseAssignmentRuleSchema,
} from '@shared/schema';
import { NotificationService } from '../services/notificationService';
import {
  storage,
  isAdmin,
  isSuperAdmin,
  isTeacherOrAdmin,
  withSessionAuthMiddleware,
  optionalAuth,
  getEffectiveOrganizationId,
  ADMIN_ROLES,
  INSTRUCTOR_ROLES,
  LEARNER_ROLES,
  ALL_STAFF_ROLES,
} from './sharedResources';
import {
  enforceOrgIsolationWithSuperAdminBypass,
} from '../middleware/orgIsolationMiddleware';
import {
  resolveEffectiveOrganization,
  type RequestWithEffectiveOrg,
} from '../middleware/sessionAuthMiddleware';
import { isFeatureEnabled, isAIThumbnailsEnabled, isOnPremMode, isOnPremOwnApiKeys } from '../featureFlags';
import { isCustSuper, isSuperAdminOrCustSuper } from '../adminAuth';
import { ObjectStorageService } from '../objectStorage';
import { quizPricingService } from '../services/quizPricingService';
import { thumbnailPricingService } from '../services/thumbnailPricingService';
import { healthReportPricingService } from '../services/healthReportPricingService';
import { topicAnalysisPricingService } from '../services/topicAnalysisPricingService';
import { frameworkPricingService } from '../services/frameworkPricingService';
import { LessonService } from '../services/lessonService';
import { SessionInvalidationService } from '../services/sessionInvalidationService';
import { generateOrgCode, generateGradeCode, generateClassCode, extractGradeNumber, getNextClassLetter } from '../utils/joinCodeGenerator';
import { PlatformCostService } from '../services/platformCostService';
import { LpcSpendService } from '../services/lpcSpendService';
import { LpcRevenueService } from '../services/lpcRevenueService';
import { CurrencyService } from '../services/currencyService';
import { CreditService } from '../services/creditService';
import { ReviewService } from '../services/reviewService';
import { GoogleGenAI } from '@google/genai';
import { IntegrationConfigService } from '../services/integrationConfigService';
import { GammaService } from '../services/gammaService';
import { GammaThemeSyncService } from '../services/gammaThemeSyncService';
import { courseThumbnailAIService, ThumbnailGenerationError } from '../services/courseThumbnailAIService';
import { CourseService } from '../services/courseService';
import { HybridCreditService } from '../services/hybridCreditService';
import { UnifiedCreditService } from '../services/unifiedCreditService';
import { OrganizationCreditService } from '../services/organizationCreditService';
import { PayoutService } from '../services/payoutService';
import { sendError, ErrorCode } from '../utils/errorResponses';
import multer from 'multer';
import { businessPackageService } from '../services/businessPackageService';
import { EmailVerificationService } from '../services/emailVerificationService';
import { MailerSendService } from '../services/mailerSendService';
import { SessionContextService } from '../services/sessionContextService';
import { TranslationAnalyticsService } from '../services/translationAnalyticsService';
import { TranslationIndexService } from '../services/translationIndexService';
import { OrganizationBankingBridgeService } from '../services/organizationBankingBridgeService';
import { canonicalizeTimezone, isValidIanaTimezone, resolveEffectiveTimezone } from '../utils/timezone';
import {
  enforceOrganizationCreatePolicy,
  enforcePlatformRolePolicy,
  OnpremLicensePolicyError,
} from '../services/onpremLicensePolicy';
import { ensurePlatformPricingSchemaCompatibilityOnce } from '../ensurePlatformPricing';

const router = Router();

// ========================================
// HELPER FUNCTIONS
// ========================================

async function denyIfTargetIsSuperAdminForNonSuperAdmin(requestingUserId: string, targetUserId: string): Promise<{ denied: boolean; status: number; error: string }> {
  const [requestingUser, targetUser] = await Promise.all([
    storage.getUser(requestingUserId),
    storage.getUser(targetUserId),
  ]);

  if (!targetUser) {
    return { denied: true, status: 404, error: "User not found" };
  }

  if (targetUser.isSuperAdmin && !requestingUser?.isSuperAdmin) {
    return {
      denied: true,
      status: 403,
      error: "Access denied: Only SuperAdmins can view or manage SuperAdmin users",
    };
  }

  return { denied: false, status: 200, error: "" };
}

async function requireOrgAccess(req: Request, res: Response, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  (req as RequestWithEffectiveOrg).effectiveOrganization = effectiveResult;
  
  const requestedOrgId = req.params.orgId || req.query.organizationId || req.body?.organizationId;
  
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
    const { effectiveRole } = req.session.context;
    const hasPlatformWideAccess =
      effectiveRole === 'SuperAdmin' ||
      (isOnPremMode() && effectiveRole === 'CustSuper');
    
    if (hasPlatformWideAccess && !effectiveResult.isImpersonation) {
      return next();
    }
    
    if (hasPlatformWideAccess && effectiveResult.isImpersonation) {
      if (!requestedOrgId) {
        return next();
      }
      if (requestedOrgId === effectiveResult.organizationId) {
        return next();
      }
      return res.status(403).json({ error: "Access denied: You are impersonating a different organization" });
    }
    
    if (!effectiveResult.organizationId) {
      return res.status(403).json({ error: "No organization context" });
    }
    
    if (requestedOrgId && requestedOrgId !== effectiveResult.organizationId) {
      return res.status(403).json({ error: "Access denied: Cross-organization access not permitted" });
    }
    
    return next();
  }
  
  const user = await storage.getUser(req.session.userId);
  if (user?.isSuperAdmin || user?.isCustSuper) {
    return next();
  }
  
  if (!effectiveResult.organizationId) {
    return res.status(403).json({ error: "No organization context" });
  }
  
  if (requestedOrgId && requestedOrgId !== effectiveResult.organizationId) {
    return res.status(403).json({ error: "Access denied: Cross-organization access not permitted" });
  }
  
  const userRoles = await storage.getUserRoles(req.session.userId, effectiveResult.organizationId);
  
  if (userRoles.length === 0) {
    return res.status(403).json({ error: "Access denied: You do not belong to this organization" });
  }
  
  next();
}

async function getUserOrganizationIds(userId: string, session?: any): Promise<string[]> {
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    const hasPlatformWideAccess =
      effectiveRole === 'SuperAdmin' ||
      (isOnPremMode() && effectiveRole === 'CustSuper');

    if (hasPlatformWideAccess && impersonatedOrganization?.orgId) {
      return [impersonatedOrganization.orgId];
    }

    return organizations.map((org: any) => org.orgId);
  }
  
  const orgRoles = await storage.getUserRoles(userId);
  const orgIds = orgRoles.map((r: any) => r.organizationId);
  return Array.from(new Set(orgIds));
}

async function canAccessOrganization(
  userId: string,
  organizationId: string,
  session?: any,
  resolvedEffectiveOrgId?: string | null
): Promise<boolean> {
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    const hasPlatformWideAccess =
      effectiveRole === 'SuperAdmin' ||
      (isOnPremMode() && effectiveRole === 'CustSuper');
    
    if (hasPlatformWideAccess && !impersonatedOrganization) {
      return true;
    }
    
    if (hasPlatformWideAccess && impersonatedOrganization) {
      return impersonatedOrganization.orgId === organizationId;
    }
    
    let effectiveOrgId = resolvedEffectiveOrgId;
    if (!effectiveOrgId) {
      const primaryOrg = session.context.primaryOrganization;
      effectiveOrgId = primaryOrg?.orgId || (organizations.length === 1 ? organizations[0].orgId : null);
    }
    
    if (!effectiveOrgId) {
      return false;
    }
    
    return organizationId === effectiveOrgId;
  }
  
  const user = await storage.getUser(userId);
  if (user?.isSuperAdmin || user?.isCustSuper) return true;
  
  const userRoles = await storage.getUserRoles(userId);
  if (userRoles.length === 0) return false;
  
  const effectiveOrgId = userRoles[0].organizationId;
  return organizationId === effectiveOrgId;
}

async function getActiveCustSuperCount(): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isCustSuper, true), eq(users.isDisabled, false)));
  return rows[0]?.value ?? 0;
}

async function ensureNotRemovingLastActiveCustSuper(targetUserId: string): Promise<void> {
  if (!isOnPremMode()) {
    return;
  }
  const targetUser = await storage.getUser(targetUserId);
  if (!targetUser?.isCustSuper || targetUser.isDisabled) {
    return;
  }
  const activeCustSupers = await getActiveCustSuperCount();
  if (activeCustSupers <= 1) {
    throw new OnpremLicensePolicyError(
      'Operation blocked: on-prem system must always retain at least one active Customer Super Admin (CustSuper).',
      400,
    );
  }
}

const MANAGEABLE_BY_ORG_ADMIN = new Set(['teacher', 'team_lead', 'student', 'employee', 'learner']);
const MANAGEABLE_BY_INSTRUCTOR = new Set(['student', 'employee', 'learner']);

function getActorManagementTier(role: string): 'org_admin' | 'instructor' | 'none' {
  if (role === 'org_admin') return 'org_admin';
  if (role === 'teacher' || role === 'team_lead') return 'instructor';
  return 'none';
}

function getBestActorTier(tiers: Array<'org_admin' | 'instructor' | 'none'>): 'org_admin' | 'instructor' | 'none' {
  if (tiers.includes('org_admin')) return 'org_admin';
  if (tiers.includes('instructor')) return 'instructor';
  return 'none';
}

async function authorizeUserManagementAction(requestingUserId: string, targetUserId: string): Promise<{ allowed: boolean; status: number; error?: string; }> {
  const onPremMode = isOnPremMode();
  const [requestingUser, targetUser] = await Promise.all([
    storage.getUser(requestingUserId),
    storage.getUser(targetUserId),
  ]);

  if (!requestingUser) {
    return { allowed: false, status: 401, error: "Authentication required" };
  }
  if (!targetUser) {
    return { allowed: false, status: 404, error: "User not found" };
  }

  const requesterIsTop = requestingUser.isSuperAdmin || (onPremMode && requestingUser.isCustSuper);
  if (requesterIsTop) {
    return { allowed: true, status: 200 };
  }

  // Non-top actors may never manage platform-top users.
  if (targetUser.isSuperAdmin || (onPremMode && targetUser.isCustSuper)) {
    return { allowed: false, status: 403, error: "Access denied: Cannot manage platform admin users" };
  }

  const [requestingRoles, targetRoles] = await Promise.all([
    storage.getUserRoles(requestingUserId),
    storage.getUserRoles(targetUserId),
  ]);

  const actorTierByOrg = new Map<string, 'org_admin' | 'instructor' | 'none'>();
  for (const roleRow of requestingRoles as any[]) {
    const current = actorTierByOrg.get(roleRow.organizationId) || 'none';
    const next = getActorManagementTier(roleRow.role);
    actorTierByOrg.set(roleRow.organizationId, getBestActorTier([current, next]));
  }

  const manageableOrgIds = new Set<string>(
    Array.from(actorTierByOrg.entries())
      .filter(([, tier]) => tier !== 'none')
      .map(([orgId]) => orgId)
  );

  if (manageableOrgIds.size === 0) {
    return { allowed: false, status: 403, error: "Access denied: Admin role required" };
  }

  // Non-top actors may not manage admin-role users.
  const targetHasAdminRole = (targetRoles as any[]).some((r) => r.role === 'org_admin');
  if (targetHasAdminRole) {
    return { allowed: false, status: 403, error: "Access denied: Non-top roles cannot manage admin users" };
  }

  let hasManageableSharedRole = false;
  for (const targetRole of targetRoles as any[]) {
    const actorTier = actorTierByOrg.get(targetRole.organizationId) || 'none';
    if (actorTier === 'none') continue;
    if (actorTier === 'org_admin' && MANAGEABLE_BY_ORG_ADMIN.has(targetRole.role)) {
      hasManageableSharedRole = true;
      break;
    }
    if (actorTier === 'instructor' && MANAGEABLE_BY_INSTRUCTOR.has(targetRole.role)) {
      hasManageableSharedRole = true;
      break;
    }
  }

  if (!hasManageableSharedRole) {
    return { allowed: false, status: 403, error: "Access denied: Cannot manage users outside your role authority" };
  }

  return { allowed: true, status: 200 };
}

async function getInterOrgAccessContext(req: Request): Promise<{
  allowed: boolean;
  status: number;
  error?: string;
  isTopRole: boolean;
  activeOrgId: string | null;
}> {
  if (!req.session.userId) {
    return { allowed: false, status: 401, error: "Authentication required", isTopRole: false, activeOrgId: null };
  }
  if (!isOnPremMode()) {
    return { allowed: false, status: 404, error: "Not available", isTopRole: false, activeOrgId: null };
  }

  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return { allowed: false, status: 401, error: "Authentication required", isTopRole: false, activeOrgId: null };
  }

  if (user.isSuperAdmin || user.isCustSuper) {
    return { allowed: true, status: 200, isTopRole: true, activeOrgId: getEffectiveOrganizationId(req.session) || null };
  }

  const activeOrgId = getEffectiveOrganizationId(req.session) || null;
  if (!activeOrgId) {
    return { allowed: false, status: 403, error: "Organization context required", isTopRole: false, activeOrgId: null };
  }

  const actorRoles = await storage.getUserRoles(req.session.userId, activeOrgId);
  const canManageInterOrg = (actorRoles as any[]).some((r) => ['org_admin', 'teacher', 'team_lead'].includes(r.role));
  if (!canManageInterOrg) {
    return { allowed: false, status: 403, error: "Access denied", isTopRole: false, activeOrgId };
  }

  return { allowed: true, status: 200, isTopRole: false, activeOrgId };
}

// ========================================
// ADMIN CHECK AND MAKE-ADMIN ROUTES
// ========================================

router.post("/make-admin", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (email !== "jan.coetz33@gmail.com") {
      return res.status(403).json({ error: "Not authorized to make this user admin" });
    }
    
    const user = await storage.makeUserAdmin(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ message: "User is now admin", user: { id: user.id, email: user.email, isAdmin: user.isAdmin }});
  } catch (error) {
    console.error("Make admin error:", error);
    res.status(500).json({ error: "Failed to make user admin" });
  }
});

router.get("/check", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    const isSuperAdminUser = user?.isSuperAdmin || false;
    const isCustSuperUser = user?.isCustSuper || false;
    const sessionScope = SessionContextService.getCanonicalSessionScope(req.session.context);
    const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);

    const impersonatedOrg = sessionScope.impersonatedOrganization;
    const isImpersonating = sessionScope.isImpersonating;

    const orgRoles = sessionScope.organizationRoles.length > 0
      ? sessionScope.organizationRoles
      : await storage.getUserRoles(req.session.userId!);
    const effectiveOrgRoles = effectiveResult.organizationId
      ? orgRoles.filter((role: any) => role.organizationId === effectiveResult.organizationId)
      : [];
    const hasOrgAdmin = effectiveOrgRoles.some((r: any) => ADMIN_ROLES.includes(r.role));
    const hasTeacher = effectiveOrgRoles.some((r: any) => INSTRUCTOR_ROLES.includes(r.role));

    const effectiveOrgAdmin = hasOrgAdmin || ((isSuperAdminUser || isCustSuperUser) && isImpersonating) || isCustSuperUser;
    const effectiveLocale = req.session.context?.userPreferences?.effectiveLocale ?? resolveEffectiveLocale({
      userTimezone: user?.timezone ?? null,
      organizationTimezone: effectiveResult.organization?.orgTimezone ?? null,
      userCurrency: user?.preferredCurrency ?? null,
      organizationCurrency: effectiveResult.organization?.orgCurrency ?? null,
    });

    res.json({ 
      isAdmin: user?.isAdmin || false,
      isSuperAdmin: isSuperAdminUser,
      isCustSuper: isCustSuperUser,
      isOrgAdmin: effectiveOrgAdmin,
      isTeacher: hasTeacher || ((isSuperAdminUser || isCustSuperUser) && isImpersonating),
      organizationRoles: orgRoles,
      effectiveOrganizationId: effectiveResult.organizationId,
      effectiveOrganizationType: effectiveResult.organization?.orgType ?? null,
      effectiveOrganizationSource: effectiveResult.source,
      effectiveLocale,
      isImpersonating,
      impersonatedOrganization: impersonatedOrg ? {
        id: impersonatedOrg.orgId,
        name: impersonatedOrg.orgName,
        type: impersonatedOrg.orgType,
      } : null,
    });
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(500).json({ error: "Failed to check admin status" });
  }
});

// ========================================
// FEATURE FLAGS ROUTES
// ========================================

router.get("/feature-flags/status", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { getFeatureFlags } = await import("../config/featureFlags");
    const flagConfig = getFeatureFlags();
    const flags = flagConfig.getFlags();
    const statusSummary = flagConfig.getStatusSummary();

    const dbOverrides = await storage.getLicenseFlagOverrides();
    const rolloutOrgs = await storage.getLicenseRolloutOrganizations();
    const betaUsers = await storage.getLicenseRolloutBetaUsers();

    res.json({
      success: true,
      flags: {
        licenseSystemEnabled: flags.licenseSystemEnabled,
        licenseMiddlewareEnabled: flags.licenseMiddlewareEnabled,
        licenseUIEnabled: flags.licenseUIEnabled,
        licensePaymentsEnabled: flags.licensePaymentsEnabled,
        excludedOrgCount: flags.excludedOrgIds.size,
        betaUserCount: flags.betaUserIds.size,
      },
      sources: flags._sources,
      summary: statusSummary,
      databaseOverrides: dbOverrides.map((o: any) => ({
        flagKey: o.flagKey,
        value: o.value,
        description: o.description,
        setBy: o.setBy,
        expiresAt: o.expiresAt,
        createdAt: o.createdAt,
      })),
      rolloutOrganizations: rolloutOrgs.map((o: any) => ({
        organizationId: o.organizationId,
        notes: o.notes,
        addedBy: o.addedBy,
        createdAt: o.createdAt,
      })),
      betaUsers: betaUsers.map((u: any) => ({
        userId: u.userId,
        notes: u.notes,
        addedBy: u.addedBy,
        createdAt: u.createdAt,
      })),
      environmentVariables: {
        ENABLE_LICENSE_SYSTEM: process.env.ENABLE_LICENSE_SYSTEM || 'not set',
        ENABLE_LICENSE_MIDDLEWARE: process.env.ENABLE_LICENSE_MIDDLEWARE || 'not set',
        ENABLE_LICENSE_UI: process.env.ENABLE_LICENSE_UI || 'not set',
        ENABLE_LICENSE_PAYMENTS: process.env.ENABLE_LICENSE_PAYMENTS || 'not set',
        LICENSE_EXCLUDED_ORG_IDS: process.env.LICENSE_EXCLUDED_ORG_IDS ? `${flags.excludedOrgIds.size} orgs excluded` : 'not set',
      },
    });
  } catch (error) {
    console.error("Feature flags status error:", error);
    res.status(500).json({ success: false, error: "Failed to get feature flag status" });
  }
});

router.post("/feature-flags/reload", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { getFeatureFlags } = await import("../config/featureFlags");
    const flagConfig = getFeatureFlags();
    await flagConfig.reload();
    
    res.json({
      success: true,
      message: "Feature flags reloaded from database and environment variables",
      summary: flagConfig.getStatusSummary(),
    });
  } catch (error) {
    console.error("Feature flags reload error:", error);
    res.status(500).json({ success: false, error: "Failed to reload feature flags" });
  }
});

router.post("/feature-flags/override", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { flagKey, value, description, expiresAt } = req.body;
    const userId = req.session.userId!;

    if (!flagKey || typeof value !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        error: "flagKey (string) and value (boolean) are required" 
      });
    }

    const validKeys = [
      'licenseSystemEnabled',
      'licenseMiddlewareEnabled',
      'licenseUIEnabled',
      'licensePaymentsEnabled',
    ];

    if (!validKeys.includes(flagKey)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid flagKey. Must be one of: ${validKeys.join(', ')}` 
      });
    }

    if (description && description.length > 500) {
      return res.status(400).json({ 
        success: false, 
        error: "Description must be 500 characters or less" 
      });
    }

    let parsedExpiresAt: Date | null = null;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (isNaN(parsedExpiresAt.getTime())) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid expiresAt date format" 
        });
      }
      if (parsedExpiresAt <= new Date()) {
        return res.status(400).json({ 
          success: false, 
          error: "expiresAt must be in the future" 
        });
      }
    }

    const override = await storage.setLicenseFlagOverride({
      flagKey,
      value,
      setBy: userId,
      description: description || null,
      expiresAt: parsedExpiresAt
    });

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `Feature flag ${flagKey} override set to ${value}`,
      override,
    });
  } catch (error) {
    console.error("Feature flags override error:", error);
    res.status(500).json({ success: false, error: "Failed to set feature flag override" });
  }
});

router.delete("/feature-flags/override/:flagKey", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { flagKey } = req.params;
    const userId = req.session.userId!;

    await storage.removeLicenseFlagOverride(flagKey, userId);

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `Feature flag ${flagKey} override cleared`,
    });
  } catch (error) {
    console.error("Clear feature flag override error:", error);
    res.status(500).json({ success: false, error: "Failed to clear feature flag override" });
  }
});

router.post("/feature-flags/emergency-disable", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { reason } = req.body;

    const flagsToDisable = [
      'licenseSystemEnabled',
      'licenseMiddlewareEnabled',
      'licenseUIEnabled',
      'licensePaymentsEnabled',
    ];

    const description = `EMERGENCY DISABLE: ${reason || 'No reason provided'}`;

    for (const flagKey of flagsToDisable) {
      await storage.setLicenseFlagOverride({ flagKey, value: false, setBy: userId, description, expiresAt: null });
    }

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    console.log(`[EMERGENCY] License system DISABLED by user ${userId}. Reason: ${reason || 'Not provided'}`);

    res.json({
      success: true,
      message: "License system emergency disabled. All license flags set to false.",
      disabledFlags: flagsToDisable,
    });
  } catch (error) {
    console.error("Emergency disable error:", error);
    res.status(500).json({ success: false, error: "Failed to emergency disable license system" });
  }
});

router.get("/feature-flags/audit", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const auditLog = await storage.getLicenseFlagAuditLog(limit);

    res.json({
      success: true,
      auditLog,
    });
  } catch (error) {
    console.error("Feature flags audit error:", error);
    res.status(500).json({ success: false, error: "Failed to get feature flag audit log" });
  }
});

router.post("/feature-flags/rollout/organizations", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { organizationId, notes } = req.body;
    const userId = req.session.userId!;

    if (!organizationId) {
      return res.status(400).json({ 
        success: false, 
        error: "organizationId is required" 
      });
    }

    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ 
        success: false, 
        error: "Organization not found" 
      });
    }

    const result = await storage.addOrganizationToLicenseRollout({
      organizationId,
      addedBy: userId,
      notes: notes || null
    });

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `Organization ${org.name} added to license rollout`,
      rollout: result,
    });
  } catch (error) {
    console.error("Add org to rollout error:", error);
    res.status(500).json({ success: false, error: "Failed to add organization to rollout" });
  }
});

router.delete("/feature-flags/rollout/organizations/:organizationId", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.session.userId!;

    await storage.removeOrganizationFromLicenseRollout(organizationId, userId);

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `Organization ${organizationId} removed from license rollout`,
    });
  } catch (error) {
    console.error("Remove org from rollout error:", error);
    res.status(500).json({ success: false, error: "Failed to remove organization from rollout" });
  }
});

router.post("/feature-flags/rollout/beta-users", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { targetUserId, notes } = req.body;
    const userId = req.session.userId!;

    if (!targetUserId) {
      return res.status(400).json({ 
        success: false, 
        error: "targetUserId is required" 
      });
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        error: "Target user not found" 
      });
    }

    const result = await storage.addUserToLicenseBeta({
      userId: targetUserId,
      addedBy: userId,
      notes: notes || null
    });

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `User ${targetUserId} added to license beta testing`,
      betaUser: result,
    });
  } catch (error) {
    console.error("Add user to beta error:", error);
    res.status(500).json({ success: false, error: "Failed to add user to beta testing" });
  }
});

router.delete("/feature-flags/rollout/beta-users/:targetUserId", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.session.userId!;

    await storage.removeUserFromLicenseBeta(targetUserId, userId);

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `User ${targetUserId} removed from license beta testing`,
    });
  } catch (error) {
    console.error("Remove user from beta error:", error);
    res.status(500).json({ success: false, error: "Failed to remove user from beta testing" });
  }
});

// ========================================
// SUPER ADMIN ANALYTICS
// ========================================

router.get("/super-admin-analytics", isAdmin, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isSuperAdminUser = user.isSuperAdmin || user.isCustSuper;
    
    let userOrgIds: string[] = [];
    if (!isSuperAdminUser) {
      const userRoles = await storage.getUserRoles(req.session.userId!);
      userOrgIds = userRoles
        .filter((r: any) => ALL_STAFF_ROLES.includes(r.role))
        .map((r: any) => r.organizationId);
      
      if (userOrgIds.length === 0) {
        return res.status(403).json({ error: "No organization access" });
      }
    }
    
    const [orgsData, allUsers, allUserRoles, allQuizCollections, allQuizResults, allGameResults] = await Promise.all([
      isSuperAdminUser 
        ? db.select().from(organizations).orderBy(desc(organizations.createdAt))
        : db.select().from(organizations)
            .where(sql`${organizations.id} = ANY(${userOrgIds}::uuid[])`)
            .orderBy(desc(organizations.createdAt)),
      
      db.select().from(users),
      
      isSuperAdminUser
        ? db.select().from(userOrganizationRoles)
        : db.select().from(userOrganizationRoles)
            .where(sql`${userOrganizationRoles.organizationId} = ANY(${userOrgIds}::uuid[])`),
      
      isSuperAdminUser
        ? db.select().from(quizCollections)
            .where(or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`))
        : db.select().from(quizCollections)
            .where(and(
              sql`${quizCollections.organizationId} = ANY(${userOrgIds}::uuid[]) OR ${quizCollections.organizationId} IS NULL`,
              or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
            )),
      
      db.select().from(quizGameResults),
      
      db.select().from(gameResults)
    ]);
    
    const orgUserIds = Array.from(new Set(allUserRoles.map((r: any) => r.userId)));
    
    // Build set of disabled userIds to exclude from counts
    const disabledUserIds = new Set(allUsers.filter(u => u.isDisabled).map(u => u.id));
    
    // Filter roles to only include non-disabled users
    const activeUserRoles = allUserRoles.filter((r: any) => !disabledUserIds.has(r.userId));
    
    const superAdminCount = isSuperAdminUser ? allUsers.filter(u => u.isSuperAdmin && !u.isDisabled).length : 0;
    const orgAdminCount = activeUserRoles.filter((r: any) => ADMIN_ROLES.includes(r.role)).length;
    const teacherCount = activeUserRoles.filter((r: any) => INSTRUCTOR_ROLES.includes(r.role)).length;
    const studentUserIds = new Set(activeUserRoles.filter((r: any) => LEARNER_ROLES.includes(r.role)).map((r: any) => r.userId));
    const studentCount = studentUserIds.size;
    
    const filteredQuizResults = allQuizResults.filter((qr: any) => 
      isSuperAdminUser || orgUserIds.includes(qr.userId)
    );
    const filteredGameResults = allGameResults.filter((gr: any) => 
      isSuperAdminUser || (gr.playerIds && gr.playerIds.some((pid: string) => orgUserIds.includes(pid)))
    );
    
    const orgBreakdown = await Promise.all(orgsData.map(async (org) => {
      const orgRoles = allUserRoles.filter((r: any) => r.organizationId === org.id);
      const thisOrgUserIds = Array.from(new Set(orgRoles.map((r: any) => r.userId)));
      
      // Filter to only active (non-disabled) users for this organization (for billing/Active column)
      const activeOrgRoles = orgRoles.filter((r: any) => !disabledUserIds.has(r.userId));
      const activeOrgUserIds = Array.from(new Set(activeOrgRoles.map((r: any) => r.userId)));
      
      // Count role-based users (ALL users regardless of disabled state)
      const orgAdmins = orgRoles.filter((r: any) => ADMIN_ROLES.includes(r.role)).length;
      const teachers = orgRoles.filter((r: any) => INSTRUCTOR_ROLES.includes(r.role)).length;
      const studentUserIds = new Set(orgRoles.filter((r: any) => LEARNER_ROLES.includes(r.role)).map((r: any) => r.userId));
      const students = studentUserIds.size;
      
      // totalUsers = all users regardless of disabled state
      const totalUsers = thisOrgUserIds.length;
      // activeUsers = only non-disabled users (for billing purposes)
      const activeUsers = activeOrgUserIds.length;
      
      const orgQuizzes = allQuizCollections.filter((q: any) => q.organizationId === org.id);
      
      const orgQuizResults = filteredQuizResults.filter((qr: any) => thisOrgUserIds.includes(qr.userId));
      const orgGameResults = filteredGameResults.filter((gr: any) => 
        gr.playerIds && gr.playerIds.some((pid: string) => thisOrgUserIds.includes(pid))
      );
      
      return {
        id: org.id,
        name: org.name,
        type: org.type,
        subscriptionStatus: org.subscriptionStatus,
        trialEndDate: org.trialEndDate,
        isDemo: org.isDemo,
        createdAt: org.createdAt,
        orgAdmins,
        teachers,
        students,
        totalUsers,
        activeUsers,
        userBreakdown: {
          orgAdmins,
          teachers,
          students,
          total: totalUsers,
          active: activeUsers,
        },
        quizActivity: {
          totalQuizzes: orgQuizzes.length,
          avgScore: orgQuizResults.length > 0 
            ? Math.round(orgQuizResults.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / orgQuizResults.length)
            : 0,
        },
        quizzes: orgQuizzes.length,
        quizGamesPlayed: orgQuizResults.length,
        cardGamesPlayed: orgGameResults.length,
      };
    }));
    
    const activeOrganizations = orgsData.filter(o => 
      o.subscriptionStatus === 'active' || o.subscriptionStatus === 'trialing'
    ).length;
    
    const totalUsers = isSuperAdminUser ? allUsers.length : orgUserIds.length;
    
    const mrr = orgsData.reduce((sum, org) => {
      if (org.subscriptionStatus === 'active') {
        return sum + 299;
      }
      return sum;
    }, 0);
    
    res.json({
      isSuperAdmin: isSuperAdminUser,
      overview: {
        totalUsers,
        totalOrganizations: orgsData.length,
        activeOrganizations,
        totalQuizCollections: allQuizCollections.length,
        mrr: mrr.toFixed(2),
        arr: (mrr * 12).toFixed(2),
      },
      userBreakdown: {
        superAdmins: superAdminCount,
        orgAdmins: orgAdminCount,
        teachers: teacherCount,
        students: studentCount,
      },
      summary: {
        totalOrganizations: orgsData.length,
        totalUsers,
        userBreakdown: {
          superAdmins: superAdminCount,
          orgAdmins: orgAdminCount,
          teachers: teacherCount,
          students: studentCount,
        },
        totalQuizzes: allQuizCollections.length,
        totalQuizGamesPlayed: filteredQuizResults.length,
        totalCardGamesPlayed: filteredGameResults.length,
      },
      organizations: orgBreakdown,
    });
  } catch (error) {
    console.error("Super admin analytics error:", error);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

router.get("/translation-analytics/summary", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    const orgFromSession = getEffectiveOrganizationId(req.session);
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : null;
    const organizationId = (user?.isSuperAdmin || user?.isCustSuper)
      ? (requestedOrgId || orgFromSession)
      : orgFromSession;

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required for this request." });
    }

    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
    const eventType = req.query.eventType ? String(req.query.eventType) as any : undefined;

    const [summary, failureSummary] = await Promise.all([
      TranslationAnalyticsService.getLanguageSummary({
        organizationId,
        startDate,
        endDate,
        eventType,
      }),
      TranslationIndexService.getFailureSummary(organizationId),
    ]);

    res.json({
      organizationId,
      summary,
      indexFailures: failureSummary,
    });
  } catch (error: any) {
    console.error("Translation analytics summary error:", error);
    res.status(500).json({ error: error?.message || "Failed to load translation analytics summary" });
  }
});

router.get("/translation-analytics/export.csv", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    const orgFromSession = getEffectiveOrganizationId(req.session);
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : null;
    const organizationId = (user?.isSuperAdmin || user?.isCustSuper)
      ? (requestedOrgId || orgFromSession)
      : orgFromSession;

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required for this request." });
    }

    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
    const eventType = req.query.eventType ? String(req.query.eventType) as any : undefined;
    const rows = await TranslationAnalyticsService.getLanguageSummary({
      organizationId,
      startDate,
      endDate,
      eventType,
    });

    const csvLines = [
      "languageCode,eventType,totalEvents,dedupedEvents,uniqueUsers",
      ...rows.map((row) =>
        `${row.languageCode},${row.eventType},${row.totalEvents},${row.dedupedEvents},${row.uniqueUsers}`
      ),
    ];

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="translation-analytics-${organizationId}-${stamp}.csv"`);
    res.send(csvLines.join("\n"));
  } catch (error: any) {
    console.error("Translation analytics export error:", error);
    res.status(500).json({ error: error?.message || "Failed to export translation analytics" });
  }
});

// ========================================
// ORGANIZATION MANAGEMENT ROUTES
// ========================================

router.post("/organizations/:organizationId/extend-trial", withSessionAuthMiddleware, enforceOrgIsolationWithSuperAdminBypass(), isAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { days } = req.body;
    
    const user = await storage.getUser(req.session.userId!);
    if (!user || (!user.isSuperAdmin && !user.isCustSuper)) {
      return res.status(403).json({ error: "Only super admins can extend trials" });
    }
    
    if (![7, 14, 30].includes(days)) {
      return res.status(400).json({ error: "Days must be 7, 14, or 30" });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    const currentTrialEnd = org.trialEndDate ? new Date(org.trialEndDate) : new Date();
    const now = new Date();
    
    const baseDate = currentTrialEnd < now ? now : currentTrialEnd;
    const newTrialEndDate = new Date(baseDate);
    newTrialEndDate.setDate(newTrialEndDate.getDate() + days);
    
    await db.update(organizations)
      .set({ 
        trialEndDate: newTrialEndDate,
        updatedAt: new Date()
      })
      .where(eq(organizations.id, organizationId));
    
    res.json({ 
      message: `Trial extended by ${days} days`,
      newTrialEndDate,
      organizationId
    });
  } catch (error) {
    console.error("Extend trial error:", error);
    res.status(500).json({ error: "Failed to extend trial" });
  }
});

router.post("/organizations/:organizationId/toggle-demo", withSessionAuthMiddleware, enforceOrgIsolationWithSuperAdminBypass(), isAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { isDemo } = req.body;
    
    const user = await storage.getUser(req.session.userId!);
    if (!user || (!user.isSuperAdmin && !user.isCustSuper)) {
      return res.status(403).json({ error: "Only super admins can toggle demo status" });
    }
    
    if (typeof isDemo !== 'boolean') {
      return res.status(400).json({ error: "isDemo must be a boolean" });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    const updateData: any = { 
      isDemo,
      updatedAt: new Date()
    };
    
    if (isDemo) {
      updateData.subscriptionStatus = 'active';
      
      console.log(`[Toggle Demo] Cancelling subscriptions for new demo org ${organizationId}`);
      const activeSubscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.targetType, 'organization'),
            eq(schema.subscriptions.targetId, organizationId),
            or(
              eq(schema.subscriptions.status, 'active'),
              eq(schema.subscriptions.status, 'grace'),
              eq(schema.subscriptions.status, 'past_due')
            )
          )
        );
      
      for (const subscription of activeSubscriptions) {
        await db.update(schema.subscriptions)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: 'Organization converted to demo mode',
            autoRenew: false,
            updatedAt: new Date()
          })
          .where(eq(schema.subscriptions.id, subscription.id));
        console.log(`[Toggle Demo] Cancelled subscription ${subscription.id} for demo org ${organizationId}`);
      }
    }
    
    await db.update(organizations)
      .set(updateData)
      .where(eq(organizations.id, organizationId));
    
    // Invalidate sessions for all users in this org to refresh their isDemo context
    // This forces users to get fresh org data on their next request
    await SessionInvalidationService.invalidateOrganizationSessions(
      organizationId,
      `Organization demo status changed to ${isDemo}`
    );
    
    res.json({ 
      message: `Organization ${isDemo ? 'marked as' : 'unmarked as'} demo`,
      isDemo,
      organizationId
    });
  } catch (error) {
    console.error("Toggle demo error:", error);
    res.status(500).json({ error: "Failed to toggle demo status" });
  }
});

router.delete("/organizations/:organizationId", withSessionAuthMiddleware, enforceOrgIsolationWithSuperAdminBypass(), isAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    
    const user = await storage.getUser(req.session.userId!);
    if (!user || (!user.isSuperAdmin && !user.isCustSuper)) {
      return res.status(403).json({ error: "Only super admins can delete organizations" });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    await storage.deleteOrganization(organizationId);
    
    res.json({ 
      message: `Organization "${org.name}" and all related data deleted successfully`,
      deletedOrganization: {
        id: org.id,
        name: org.name,
        type: org.type
      }
    });
  } catch (error) {
    console.error("Delete organization error:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
});

// ========================================
// CLEANUP AND SYNC ROUTES
// ========================================

router.post("/clear-all-data", isAdmin, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.isSuperAdmin && !user?.isCustSuper) {
      return res.status(403).json({ error: "Only SuperAdmins can clear all data" });
    }
    
    await storage.clearAllData();
    res.json({ message: "All data cleared successfully" });
  } catch (error) {
    console.error("Clear all data error:", error);
    res.status(500).json({ error: "Failed to clear all data" });
  }
});

router.post("/sync-leaderboard", isAdmin, async (req: Request, res: Response) => {
  try {
    const allPlayers = await storage.getAllUsersForAdmin();
    const playerStats = await Promise.all(
      allPlayers.map(async (player: any) => ({
        id: player.id,
        gamerName: player.gamerName,
        ...(await storage.getPlayerStats(player.id))
      }))
    );
    
    let syncedCount = 0;
    for (const stats of playerStats) {
      if (stats.gamerName && stats.totalGamesPlayed > 0) {
        const leaderboardData = {
          rank: 0,
          winPercentage: stats.winPercentage,
          totalGames: stats.totalGamesPlayed,
          bestWinStreak: stats.bestWinStreak,
          currentWinStreak: stats.currentWinStreak,
          averageGameDuration: stats.averageGameDuration,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        };
        
        await storage.upsertLeaderboardEntry(stats.gamerName, leaderboardData);
        syncedCount++;
      }
    }

    res.json({ 
      message: `Leaderboard synced successfully`,
      syncedPlayers: syncedCount,
      totalPlayerStats: playerStats.length
    });
  } catch (error) {
    console.error("Sync leaderboard error:", error);
    res.status(500).json({ error: "Failed to sync leaderboard" });
  }
});

router.post("/cleanup-game-rooms", optionalAuth, async (req: Request, res: Response) => {
  try {
    const abandonedCount = await storage.cleanupAbandonedGameRooms();
    const finishedCount = await storage.cleanupFinishedGameRooms();
    const orphanedSessionsCount = await storage.cleanupOrphanedPlayerSessions();
    const oldSessionsCount = await storage.cleanupOldPlayerSessions();
    
    res.json({ 
      message: "Cleanup completed", 
      abandonedRoomsDeleted: abandonedCount,
      finishedRoomsDeleted: finishedCount,
      orphanedSessionsDeleted: orphanedSessionsCount,
      oldSessionsDeleted: oldSessionsCount,
      totalDeleted: abandonedCount + finishedCount + orphanedSessionsCount + oldSessionsCount
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({ error: "Failed to cleanup game rooms and sessions" });
  }
});

// ========================================
// DASHBOARD STATS
// ========================================

router.get("/dashboard/stats", isAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

// ========================================
// USER MANAGEMENT ROUTES
// ========================================

router.get("/users", isAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    
    if (user?.isSuperAdmin) {
      const users = await storage.getAllUsersForAdmin();
      return res.json(users);
    }
    if (user?.isCustSuper) {
      const users = await storage.getAllUsersForAdmin();
      return res.json(users.filter((u: any) => !u.isSuperAdmin));
    }
    
    const userOrgIds = await getUserOrganizationIds(userId);
    const allUsers = await storage.getAllUsersForAdmin();
    
    const filteredUsers = allUsers.filter((u: any) => {
      if (u.isSuperAdmin) return false;
      if (isOnPremMode() && u.isCustSuper) return false;
      const sharesOrg = u.organizationRoles?.some((role: any) => userOrgIds.includes(role.organizationId));
      if (!sharesOrg) return false;
      // Non-top roles cannot access admin-user records.
      const hasOrgAdminRole = (u.organizationRoles || []).some((role: any) => role.role === 'org_admin');
      if (hasOrgAdminRole) return false;
      return true;
    });
    
    res.json(filteredUsers);
  } catch (error) {
    console.error("Get admin users error:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

router.patch("/users/:id/lock", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.session.userId!;
    const targetUserId = req.params.id;
    const authorization = await authorizeUserManagementAction(requestingUserId, targetUserId);
    if (!authorization.allowed) {
      return res.status(authorization.status).json({ error: authorization.error });
    }
    await ensureNotRemovingLastActiveCustSuper(targetUserId);
    
    const requestingUser = await storage.getUser(requestingUserId);
    if (requestingUser?.isSuperAdmin) {
      const user = await storage.lockUser(targetUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json(user);
    }
    
    const requestingUserRoles = await storage.getUserRoles(requestingUserId);
    const isOrgAdmin = requestingUserRoles.some((r: any) => ADMIN_ROLES.includes(r.role));
    
    if (!isOrgAdmin) {
      return res.status(403).json({ error: "Access denied: Admin role required" });
    }
    
    const targetUserRoles = await storage.getUserRoles(targetUserId);
    const adminOrgIds = requestingUserRoles
      .filter((r: any) => ADMIN_ROLES.includes(r.role))
      .map((r: any) => r.organizationId);
    const targetInSameOrg = targetUserRoles.some((r: any) => adminOrgIds.includes(r.organizationId));
    
    if (!targetInSameOrg) {
      return res.status(403).json({ error: "Access denied: Cannot lock users from other organizations" });
    }
    
    const user = await storage.lockUser(targetUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    if (error instanceof OnpremLicensePolicyError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("Lock user error:", error);
    res.status(500).json({ error: "Failed to lock user" });
  }
});

router.patch("/users/:id/unlock", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.session.userId!;
    const targetUserId = req.params.id;
    const authorization = await authorizeUserManagementAction(requestingUserId, targetUserId);
    if (!authorization.allowed) {
      return res.status(authorization.status).json({ error: authorization.error });
    }
    
    const requestingUser = await storage.getUser(requestingUserId);
    if (requestingUser?.isSuperAdmin) {
      const user = await storage.unlockUser(targetUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json(user);
    }
    
    const requestingUserRoles = await storage.getUserRoles(requestingUserId);
    const isOrgAdmin = requestingUserRoles.some((r: any) => ADMIN_ROLES.includes(r.role));
    
    if (!isOrgAdmin) {
      return res.status(403).json({ error: "Access denied: Admin role required" });
    }
    
    const targetUserRoles = await storage.getUserRoles(targetUserId);
    const adminOrgIds = requestingUserRoles
      .filter((r: any) => ADMIN_ROLES.includes(r.role))
      .map((r: any) => r.organizationId);
    const targetInSameOrg = targetUserRoles.some((r: any) => adminOrgIds.includes(r.organizationId));
    
    if (!targetInSameOrg) {
      return res.status(403).json({ error: "Access denied: Cannot unlock users from other organizations" });
    }
    
    const user = await storage.unlockUser(targetUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Unlock user error:", error);
    res.status(500).json({ error: "Failed to unlock user" });
  }
});

router.patch("/users/:id/disable", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.session.userId!;
    const targetUserId = req.params.id;
    const authorization = await authorizeUserManagementAction(requestingUserId, targetUserId);
    if (!authorization.allowed) {
      return res.status(authorization.status).json({ error: authorization.error });
    }
    await ensureNotRemovingLastActiveCustSuper(targetUserId);
    
    const requestingUser = await storage.getUser(requestingUserId);
    if (requestingUser?.isSuperAdmin) {
      const user = await storage.disableUser(targetUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json(user);
    }
    
    const requestingUserRoles = await storage.getUserRoles(requestingUserId);
    const isOrgAdmin = requestingUserRoles.some((r: any) => ADMIN_ROLES.includes(r.role));
    
    if (!isOrgAdmin) {
      return res.status(403).json({ error: "Access denied: Admin role required" });
    }
    
    const targetUserRoles = await storage.getUserRoles(targetUserId);
    const adminOrgIds = requestingUserRoles
      .filter((r: any) => ADMIN_ROLES.includes(r.role))
      .map((r: any) => r.organizationId);
    const targetInSameOrg = targetUserRoles.some((r: any) => adminOrgIds.includes(r.organizationId));
    
    if (!targetInSameOrg) {
      return res.status(403).json({ error: "Access denied: Cannot disable users from other organizations" });
    }
    
    const user = await storage.disableUser(targetUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    if (error instanceof OnpremLicensePolicyError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("Disable user error:", error);
    res.status(500).json({ error: "Failed to disable user" });
  }
});

router.patch("/users/:id/enable", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.session.userId!;
    const targetUserId = req.params.id;
    const authorization = await authorizeUserManagementAction(requestingUserId, targetUserId);
    if (!authorization.allowed) {
      return res.status(authorization.status).json({ error: authorization.error });
    }
    
    const requestingUser = await storage.getUser(requestingUserId);
    if (requestingUser?.isSuperAdmin) {
      const user = await storage.enableUser(targetUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json(user);
    }
    
    const requestingUserRoles = await storage.getUserRoles(requestingUserId);
    const isOrgAdmin = requestingUserRoles.some((r: any) => ADMIN_ROLES.includes(r.role));
    
    if (!isOrgAdmin) {
      return res.status(403).json({ error: "Access denied: Admin role required" });
    }
    
    const targetUserRoles = await storage.getUserRoles(targetUserId);
    const adminOrgIds = requestingUserRoles
      .filter((r: any) => ADMIN_ROLES.includes(r.role))
      .map((r: any) => r.organizationId);
    const targetInSameOrg = targetUserRoles.some((r: any) => adminOrgIds.includes(r.organizationId));
    
    if (!targetInSameOrg) {
      return res.status(403).json({ error: "Access denied: Cannot enable users from other organizations" });
    }
    
    const user = await storage.enableUser(targetUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Enable user error:", error);
    res.status(500).json({ error: "Failed to enable user" });
  }
});

// NOTE: DELETE /users/:id with comprehensive deletion logic is in routes.ts
// to handle all related table cleanup properly

router.patch("/users/:id/reset-password", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const currentUser = await storage.getUser(currentUserId);
    if (!currentUser) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const targetUserId = req.params.id;
    const authorization = await authorizeUserManagementAction(currentUserId, targetUserId);
    if (!authorization.allowed) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const user = await storage.resetUserPassword(targetUserId, newPassword);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.put("/users/:id/email", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const currentUser = await storage.getUser(currentUserId);
    if (!currentUser) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const targetUserId = req.params.id;
    const authorization = await authorizeUserManagementAction(currentUserId, targetUserId);
    if (!authorization.allowed) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    const { email: rawEmail } = req.body;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const existingUser = await storage.getUserByEmail(normalizedEmail);
    if (existingUser && existingUser.id !== targetUserId) {
      return res.status(400).json({ error: "Email is already in use by another user" });
    }

    const updatedUser = await storage.updateUser(targetUserId, { 
      email: normalizedEmail,
      emailVerified: false
    });
    
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      const sendDecision = await EmailVerificationService.shouldSendVerificationEmail(targetUserId, normalizedEmail);
      if (!sendDecision.shouldSend) {
        console.log(
          `[AdminEmailChange] Skipping duplicate verification email for ${normalizedEmail.substring(0, 3)}*** (reason=${sendDecision.reason})`,
        );
      } else {
        const verificationToken = await EmailVerificationService.createVerificationToken(targetUserId);
        if (verificationToken) {
        const baseUrl = getBaseUrl();
        const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
        
        await MailerSendService.sendEmailVerificationEmail({
          to: normalizedEmail,
          userName: updatedUser.firstName || updatedUser.gamerName || 'User',
          verificationUrl,
          expiresIn: '24 hours'
        });
        console.log(`[AdminEmailChange] Sent verification email to ${normalizedEmail.substring(0, 3)}***`);
        }
      }
    } catch (emailError) {
      console.error("[AdminEmailChange] Failed to send verification email:", emailError);
    }

    res.json({ message: "Email changed successfully", email: normalizedEmail });
  } catch (error) {
    console.error("Change email error:", error);
    res.status(500).json({ error: "Failed to change email" });
  }
});

router.patch("/users/:id/roles", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUser = await storage.getUser(req.session.userId!);
    if (!currentUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const targetUser = await storage.getUser(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    const targetAuthorization = await authorizeUserManagementAction(currentUser.id, req.params.id);
    if (!targetAuthorization.allowed) {
      return res.status(targetAuthorization.status).json({ error: targetAuthorization.error });
    }

    const onPremMode = isOnPremMode();
    const { isAdmin: isAdminRole, isSuperAdmin: isSuperAdminRole, isCustSuper: isCustSuperRole, organizationRoles, reassign } = req.body;

    if (!onPremMode && isCustSuperRole !== undefined) {
      return res.status(400).json({ error: "CustSuper role is only available in on-premises deployments" });
    }

    const canModifyGlobalRoles = currentUser.isSuperAdmin || (onPremMode && currentUser.isCustSuper);
    const canAssignCustSuper = onPremMode && currentUser.isCustSuper;
    if (!canModifyGlobalRoles && (isAdminRole !== undefined || isSuperAdminRole !== undefined || isCustSuperRole !== undefined)) {
      console.log(`[SECURITY] Non-SuperAdmin user ${req.session.userId} attempted to modify global roles (isAdmin/isSuperAdmin)`);
      return res.status(403).json({ 
        error: "Access denied: Only SuperAdmins can modify global roles (isAdmin/isSuperAdmin)" 
      });
    }

    // On on-prem, only an existing CustSuper may assign/revoke the CustSuper role.
    if (onPremMode && isCustSuperRole !== undefined && !canAssignCustSuper) {
      return res.status(403).json({
        error: "Access denied: Only existing CustSuper users can assign or revoke CustSuper role",
      });
    }

    if (canModifyGlobalRoles && (isAdminRole !== undefined || isSuperAdminRole !== undefined || isCustSuperRole !== undefined)) {
      if (isSuperAdminRole === true && isCustSuperRole === true) {
        return res.status(400).json({ error: "Cannot assign both SuperAdmin and CustSuper roles simultaneously. These roles are mutually exclusive." });
      }
      if ((isCustSuperRole === true || isSuperAdminRole === true) && onPremMode) {
        try {
          await enforcePlatformRolePolicy({
            assignSuperAdmin: isSuperAdminRole === true,
            assignCustSuper: isCustSuperRole === true,
            targetUserId: req.params.id,
          });
        } catch (policyError: any) {
          if (policyError instanceof OnpremLicensePolicyError) {
            return res.status(policyError.statusCode).json({ error: policyError.message });
          }
          throw policyError;
        }
      }
      const roleUpdate: { isAdmin?: boolean; isSuperAdmin?: boolean; isCustSuper?: boolean } = {};
      if (isAdminRole !== undefined) roleUpdate.isAdmin = isAdminRole;
      if (isCustSuperRole !== undefined && canAssignCustSuper) roleUpdate.isCustSuper = isCustSuperRole;
      if (isSuperAdminRole !== undefined && currentUser.isSuperAdmin) roleUpdate.isSuperAdmin = isSuperAdminRole;
      if (roleUpdate.isSuperAdmin === true) roleUpdate.isCustSuper = false;
      if (roleUpdate.isCustSuper === true) roleUpdate.isSuperAdmin = false;
      if (onPremMode && roleUpdate.isCustSuper === false) {
        await ensureNotRemovingLastActiveCustSuper(req.params.id);
      }
      const user = await storage.updateUserRoles(req.params.id, roleUpdate);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
    }
    
    if (organizationRoles && Array.isArray(organizationRoles)) {
      const targetUserId = req.params.id;
      const currentRoles = await storage.getUserRoles(targetUserId);

      if (!canModifyGlobalRoles && reassign) {
        return res.status(403).json({
          error: "Access denied: Only platform admins can reassign users between organizations",
        });
      }

      if (!canModifyGlobalRoles) {
        const actorRoles = await storage.getUserRoles(req.session.userId!);
        const actorTierByOrg = new Map<string, 'org_admin' | 'instructor' | 'none'>();
        for (const roleRow of actorRoles as any[]) {
          const currentTier = actorTierByOrg.get(roleRow.organizationId) || 'none';
          const nextTier = getActorManagementTier(roleRow.role);
          actorTierByOrg.set(roleRow.organizationId, getBestActorTier([currentTier, nextTier]));
        }

        for (const orgRole of organizationRoles) {
          const { organizationId, roles } = orgRole || {};
          if (!organizationId || !Array.isArray(roles)) continue;

          const actorTier = actorTierByOrg.get(organizationId) || 'none';
          if (actorTier === 'none') {
            return res.status(403).json({ error: "Access denied: You cannot modify users in organizations you do not manage" });
          }

          const roleSet = new Set<string>(roles);
          if (roleSet.has('org_admin')) {
            return res.status(403).json({ error: "Access denied: Non-top roles cannot assign org_admin" });
          }

          const allowedSet = actorTier === 'org_admin' ? MANAGEABLE_BY_ORG_ADMIN : MANAGEABLE_BY_INSTRUCTOR;
          for (const role of roleSet) {
            if (!allowedSet.has(role)) {
              return res.status(403).json({ error: "Access denied: Attempted role assignment exceeds your authority" });
            }
          }
        }
      }
      
      if (reassign) {
        const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID;
        
        for (const orgRole of organizationRoles) {
          const { organizationId: targetOrgId, roles } = orgRole;
          if (!targetOrgId || !roles) continue;
          
          const existingOrgIds = [...new Set(currentRoles.map((r: any) => r.organizationId))];
          const userCurrentOrgs = existingOrgIds.filter((oid: string) => oid !== targetOrgId);
          
          if (userCurrentOrgs.length > 0) {
            if (!currentUser.isSuperAdmin) {
              const currentUserRoles = await storage.getUserRoles(req.session.userId!);
              const isGeneralOrgAdmin = currentUserRoles.some(
                (r: any) => r.organizationId === DEFAULT_ORG_ID && r.role === 'org_admin'
              );
              
              if (!isGeneralOrgAdmin) {
                return res.status(403).json({ 
                  error: "Access denied: Only SuperAdmins and General Org admins can reassign users between organizations" 
                });
              }
              
              const userIsInGeneralOrg = userCurrentOrgs.includes(DEFAULT_ORG_ID);
              if (!userIsInGeneralOrg) {
                return res.status(403).json({ 
                  error: "Access denied: General Org admins can only reassign users who are currently in the General Org" 
                });
              }
            }
            
            for (const oldOrgId of userCurrentOrgs) {
              if (!currentUser.isSuperAdmin) {
                const orgAdminsInOldOrg = await storage.getUsersByRole(oldOrgId as string, 'org_admin');
                const targetUserIsAdmin = currentRoles.some(
                  (r: any) => r.organizationId === oldOrgId && r.role === 'org_admin'
                );
                if (targetUserIsAdmin && orgAdminsInOldOrg.length <= 1) {
                  return res.status(400).json({ 
                    error: "Cannot reassign: This user is the last admin of their current organization. A SuperAdmin must handle this reassignment." 
                  });
                }
              }
              
              await storage.removeAllUserRolesInOrg(targetUserId, oldOrgId as string);
              await storage.removeAllUserAssignmentsInOrg(targetUserId, oldOrgId as string);
              console.log(`[Reassign] Removed user ${targetUserId} from org ${oldOrgId}`);
            }
            
            await db.update(joinRequests)
              .set({ status: 'cancelled' })
              .where(
                and(
                  eq(joinRequests.userId, targetUserId),
                  eq(joinRequests.status, 'pending')
                )
              );
          }
          
          for (const role of roles) {
            await storage.assignUserRole(targetUserId, targetOrgId, role);
          }
          
          console.log(`[Reassign] User ${targetUserId} assigned to org ${targetOrgId} with roles: ${roles.join(', ')}`);
        }
      } else {
        for (const orgRole of organizationRoles) {
          const { organizationId, roles } = orgRole;
          
          if (!organizationId || !roles) continue;
          
          const existingRoles = currentRoles.filter((r: any) => r.organizationId === organizationId);
          
          for (const existingRole of existingRoles) {
            if (!roles.includes(existingRole.role)) {
              await storage.removeUserRole(existingRole.id);
            }
          }
          
          for (const role of roles) {
            const exists = existingRoles.some((r: any) => r.role === role);
            if (!exists) {
              await storage.assignUserRole(targetUserId, organizationId, role);
            }
          }
        }
      }
      
      await SessionInvalidationService.invalidateUserSessions(
        targetUserId,
        reassign ? 'User reassigned to new organization' : 'Roles updated via admin panel'
      );
    }
    
    const updatedUser = await storage.getUser(req.params.id);
    const updatedRoles = await storage.getUserRoles(req.params.id);
    
    res.json({ 
      user: updatedUser, 
      organizationRoles: updatedRoles 
    });
  } catch (error) {
    console.error("Update user roles error:", error);
    res.status(500).json({ error: "Failed to update user roles" });
  }
});

// ========================================
// CARD COLLECTION MANAGEMENT ROUTES (Non-Quiz)
// ========================================

router.get("/collections", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const collections = await storage.getAllCardCollections();
    res.json(collections);
  } catch (error) {
    console.error("Get all collections error:", error);
    res.status(500).json({ error: "Failed to get collections" });
  }
});

router.post("/collections", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { statTypes, ...collectionData } = req.body;
    const validatedData = insertCardCollectionSchema.parse(collectionData);
    
    const collectionDataWithDefaults = {
      ...validatedData,
      totalCards: 0,
    };
    
    const collection = await storage.createCardCollection(collectionDataWithDefaults);
    
    if (statTypes && Array.isArray(statTypes) && statTypes.length > 0) {
      for (const statType of statTypes) {
        if (statType.statName) {
          await storage.createCollectionStatType({
            collectionId: collection.id,
            statName: statType.statName,
            statUnit: statType.statUnit || null,
            universalUnitId: statType.universalUnitId || null,
            displayOrder: statType.displayOrder || 1,
            comparisonType: statType.comparisonType || "highest",
          });
        }
      }
    }
    
    res.status(201).json(collection);
  } catch (error) {
    if (error instanceof OnpremLicensePolicyError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Create collection error:", error);
    res.status(500).json({ error: "Failed to create collection" });
  }
});

router.put("/collections/:id", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { statTypes, ...collectionData } = req.body;
    const validatedData = insertCardCollectionSchema.partial().parse(collectionData);
    
    const collection = await storage.updateCardCollection(id, validatedData);
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }
    
    if (statTypes && Array.isArray(statTypes)) {
      const existingStatTypes = await storage.getCollectionStatTypes(id);
      
      for (const existingStatType of existingStatTypes) {
        const stillExists = statTypes.some(st => st.id === existingStatType.id);
        if (!stillExists) {
          await storage.deleteCollectionStatType(existingStatType.id);
        }
      }
      
      for (const statType of statTypes) {
        if (statType.statName) {
          if (statType.id) {
            await storage.updateCollectionStatType(statType.id, {
              statName: statType.statName,
              statUnit: statType.statUnit || null,
              displayOrder: statType.displayOrder || 1,
            });
          } else {
            await storage.createCollectionStatType({
              collectionId: id,
              statName: statType.statName,
              statUnit: statType.statUnit || null,
              displayOrder: statType.displayOrder || 1,
            });
          }
        }
      }
    }
    
    res.json(collection);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Update collection error:", error);
    res.status(500).json({ error: "Failed to update collection" });
  }
});

router.delete("/collections/:id", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    await storage.deleteCardCollection(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete collection error:", error);
    res.status(500).json({ error: "Failed to delete collection" });
  }
});

router.get("/collections/:collectionId/cards", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const cards = await storage.getCardsByCollection(req.params.collectionId);
    res.json(cards);
  } catch (error) {
    console.error("Get collection cards error:", error);
    res.status(500).json({ error: "Failed to get cards" });
  }
});

router.post("/collections/:collectionId/cards", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const card = await storage.createCard({ ...req.body, collectionId: req.params.collectionId });
    res.status(201).json(card);
  } catch (error) {
    console.error("Create card error:", error);
    res.status(500).json({ error: "Failed to create card" });
  }
});

router.put("/cards/:id", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const card = await storage.updateCard(req.params.id, req.body);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }
    res.json(card);
  } catch (error) {
    console.error("Update card error:", error);
    res.status(500).json({ error: "Failed to update card" });
  }
});

router.delete("/cards/:id", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    await storage.deleteCard(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete card error:", error);
    res.status(500).json({ error: "Failed to delete card" });
  }
});

router.get("/collections/:collectionId/stat-types", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const statTypes = await storage.getCollectionStatTypes(req.params.collectionId);
    res.json(statTypes);
  } catch (error) {
    console.error("Get stat types error:", error);
    res.status(500).json({ error: "Failed to get stat types" });
  }
});

router.post("/collections/:collectionId/stat-types", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    const validatedData = insertCollectionStatTypeSchema.parse({ ...req.body, collectionId });
    const statType = await storage.createCollectionStatType(validatedData);
    res.status(201).json(statType);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Create stat type error:", error);
    res.status(500).json({ error: "Failed to create stat type" });
  }
});

router.post("/universal-stat-units", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const validatedData = insertUniversalStatUnitSchema.parse({ 
      ...req.body, 
      isPredefined: true, 
      createdBy: null 
    });
    const unit = await storage.createUniversalStatUnit(validatedData);
    res.status(201).json(unit);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Create universal stat unit error:", error);
    res.status(500).json({ error: "Failed to create universal stat unit" });
  }
});

router.post("/cards/:cardId/image-upload-url", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { collectionName, cardName } = req.body;
    
    if (!collectionName || !cardName) {
      return res.status(400).json({ error: "Collection name and card name are required" });
    }
    
    const objectStorageService = new ObjectStorageService();
    const uploadUrl = await objectStorageService.getCardImageUploadURL(collectionName, cardName);
    
    res.json({ uploadUrl });
  } catch (error) {
    console.error("Get upload URL error:", error);
    res.status(500).json({ error: "Failed to get upload URL" });
  }
});

router.post("/cards/:cardId/image-uploaded", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { collectionName, cardName } = req.body;
    
    if (!collectionName || !cardName) {
      return res.status(400).json({ error: "Collection name and card name are required" });
    }
    
    const imageKey = `/collection/${collectionName}/${cardName}/image.jpg`;
    
    const updatedCard = await storage.updateCardImageKey(cardId, imageKey);
    
    if (!updatedCard) {
      return res.status(404).json({ error: "Card not found" });
    }
    
    res.json({ message: "Card image key updated successfully", imageKey, updatedCard });
  } catch (error) {
    console.error("Update card image key error:", error);
    res.status(500).json({ 
      error: "Failed to update card image key", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.delete("/cards/:cardId/image", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    
    const card = await storage.getCard(cardId);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }
    
    if (!card.imageKey) {
      return res.status(400).json({ error: "Card has no image to delete" });
    }
    
    const objectStorageService = new ObjectStorageService();
    try {
      const pathParts = card.imageKey.split('/');
      if (pathParts.length >= 4 && pathParts[1] === 'collection') {
        const collectionName = pathParts[2];
        const cardName = pathParts[3];
        await objectStorageService.deleteCardImage(collectionName, cardName);
      }
    } catch (storageError) {
      console.warn("Failed to delete card image from storage (may not exist):", storageError);
    }
    
    const updatedCard = await storage.updateCardImageKey(cardId, null);
    if (!updatedCard) {
      return res.status(404).json({ error: "Card not found" });
    }
    
    res.json({ message: "Card image deleted successfully", updatedCard });
  } catch (error) {
    console.error("Delete card image error:", error);
    res.status(500).json({ 
      error: "Failed to delete card image",
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

router.post("/collections/:collectionId/cover-image/upload-url", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    
    const collection = await storage.getCardCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }
    
    const objectStorageService = new ObjectStorageService();
    const uploadUrl = await objectStorageService.getCollectionCoverImageUploadURL(collection.name);
    
    res.json({ uploadUrl });
  } catch (error) {
    console.error("Get collection cover image upload URL error:", error);
    res.status(500).json({ error: "Failed to get upload URL" });
  }
});

router.post("/collections/:collectionId/cover-image-uploaded", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    
    const collection = await storage.getCardCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }
    
    const imageKey = `/collection/${collection.name}/cover.jpg`;
    
    const updatedCollection = await storage.updateCollectionImageKey(collectionId, imageKey);
    if (!updatedCollection) {
      return res.status(404).json({ error: "Collection not found" });
    }
    
    res.json({ message: "Collection cover image key updated successfully", imageKey, updatedCollection });
  } catch (error) {
    console.error("Update collection cover image key error:", error);
    res.status(500).json({ 
      error: "Failed to update collection cover image key", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

router.delete("/collections/:collectionId/cover-image", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    
    const collection = await storage.getCardCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    if (!collection.imageKey) {
      return res.status(400).json({ error: "Collection has no cover image to delete" });
    }

    const objectStorageService = new ObjectStorageService();
    try {
      await objectStorageService.deleteCollectionCoverImage(collection.name);
    } catch (storageError) {
      console.warn("Failed to delete cover image from storage (may not exist):", storageError);
    }

    const updatedCollection = await storage.updateCollectionImageKey(collectionId, null);
    if (!updatedCollection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    res.json({ message: "Collection cover image deleted successfully", updatedCollection });
  } catch (error) {
    console.error("Delete collection cover image error:", error);
    res.status(500).json({ 
      error: "Failed to delete collection cover image",
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// ========================================
// ORGANIZATION CRUD ROUTES
// ========================================

router.post("/organizations", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (process.env.ONPREM_MODE === 'true') {
      const allOrgs = await storage.getAllOrganizations();
      await enforceOrganizationCreatePolicy(allOrgs.length);
    }
    const validatedData = insertOrganizationSchema.parse(req.body);
    const validatedAny = validatedData as any;
    const orgData = {
      ...validatedData,
      ...(process.env.ONPREM_MODE === 'true'
        ? {
            isDemo: true,
            orgCreditWallet: validatedAny.orgCreditWallet ?? 20000,
            useOrgCreditWallet: validatedAny.useOrgCreditWallet ?? true,
            allowTeachersToSpendCredits: validatedAny.allowTeachersToSpendCredits ?? true,
            trialCreditsAwarded: validatedAny.trialCreditsAwarded ?? false,
          }
        : {}),
    };
    const organization = await storage.createOrganization(orgData);
    res.json(organization);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create organization error:', error);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

router.get("/organizations", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    
    if (user?.isSuperAdmin || user?.isCustSuper) {
      const orgs = await storage.getAllOrganizations();
      return res.json(orgs);
    }
    
    const orgRoles = await storage.getUserRoles(req.session.userId!);
    const orgIds = orgRoles.map((r: any) => r.organizationId);
    const userOrgIds = Array.from(new Set(orgIds));
    
    if (userOrgIds.length === 0) {
      return res.json([]);
    }
    
    const allOrgs = await storage.getAllOrganizations();
    const userOrgs = allOrgs.filter((org: any) => userOrgIds.includes(org.id));
    res.json(userOrgs);
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.get("/organizations/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    const organization = await storage.getOrganization(req.params.id);
    
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    if (!user?.isSuperAdmin && !user?.isCustSuper) {
      const orgRoles = await storage.getUserRoles(req.session.userId!);
      const hasAccess = orgRoles.some((r: any) => r.organizationId === req.params.id);
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this organization" });
      }
    }
    
    res.json(organization);
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

router.put("/organizations/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    const orgId = req.params.id;
    
    if (!user?.isSuperAdmin && !user?.isCustSuper) {
      const orgRoles = await storage.getUserRoles(req.session.userId!);
      const isOrgAdmin = orgRoles.some((r: any) => r.organizationId === orgId && ADMIN_ROLES.includes(r.role));
      
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Access denied: You can only edit organizations where you are an OrgAdmin" });
      }
    }
    
    const validatedData = insertOrganizationSchema.partial().parse(req.body);
    const organization = await storage.updateOrganization(orgId, validatedData);
    
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    res.json(organization);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update organization error:', error);
    res.status(500).json({ error: "Failed to update organization" });
  }
});

router.delete("/organizations/:id", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    await storage.deleteOrganization(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
});

// ========================================
// UNITS AND SUB-UNITS ROUTES
// ========================================

router.post("/organizations/:orgId/units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const unit = await storage.createOrganizationUnit({ ...req.body, organizationId: req.params.orgId });
    res.json(unit);
  } catch (error) {
    console.error('Create unit error:', error);
    res.status(500).json({ error: "Failed to create unit" });
  }
});

router.get("/organizations/:orgId/units", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const units = await storage.getOrganizationUnits(req.params.orgId);
    res.json(units);
  } catch (error) {
    console.error('Get organization units error:', error);
    res.status(500).json({ error: "Failed to fetch units" });
  }
});

router.put("/units/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const unit = await storage.getOrganizationUnit(req.params.id);
    
    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot modify units from other organizations" });
    }
    
    const updatedUnit = await storage.updateOrganizationUnit(req.params.id, req.body);
    res.json(updatedUnit);
  } catch (error) {
    console.error('Update unit error:', error);
    res.status(500).json({ error: "Failed to update unit" });
  }
});

router.delete("/units/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const unit = await storage.getOrganizationUnit(req.params.id);
    
    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot delete units from other organizations" });
    }
    
    await storage.deleteOrganizationUnit(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete unit error:', error);
    res.status(500).json({ error: "Failed to delete unit" });
  }
});

router.post("/units/:unitId/sub-units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const unitId = req.params.unitId;
    
    const unit = await storage.getOrganizationUnit(unitId);
    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot create sub-units in units from other organizations" });
    }
    
    let joinCode = req.body.joinCode;
    if (!joinCode) {
      const organization = await storage.getOrganization(unit.organizationId);
      if (organization?.inviteCode && unit.name) {
        const gradeNumber = extractGradeNumber(unit.name);
        if (gradeNumber !== null) {
          const existingSubUnits = await storage.getOrganizationSubUnits(unitId);
          const classLetter = getNextClassLetter(existingSubUnits);
          joinCode = generateClassCode(organization.inviteCode, gradeNumber, classLetter);
        }
      }
    }
    
    const subUnit = await storage.createOrganizationSubUnit({ 
      ...req.body, 
      unitId,
      joinCode 
    });
    res.json(subUnit);
  } catch (error) {
    console.error('Create sub-unit error:', error);
    res.status(500).json({ error: "Failed to create sub-unit" });
  }
});

router.get("/organizations/:organizationId/sub-units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const organizationId = req.params.organizationId;

    const canAccess = await canAccessOrganization(userId, organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot view sub-units from other organizations" });
    }

    const subUnits = await storage.getAllOrganizationSubUnits(organizationId);
    res.json(subUnits);
  } catch (error) {
    console.error('Get all organization sub-units error:', error);
    res.status(500).json({ error: "Failed to fetch sub-units" });
  }
});

router.get("/organizations/:organizationId/courses", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.session.userId!;
    
    const canAccess = await canAccessOrganization(userId, organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot view courses from other organizations" });
    }
    
    const courses = await db.select({
      id: schema.courses.id,
      title: schema.courses.title,
    })
    .from(schema.courses)
    .where(eq(schema.courses.organizationId, organizationId))
    .orderBy(schema.courses.title);
    
    res.json(courses);
  } catch (error) {
    console.error('Get organization courses error:', error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

router.get("/units/:unitId/sub-units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const subUnits = await storage.getOrganizationSubUnits(req.params.unitId);
    res.json(subUnits);
  } catch (error) {
    console.error('Get sub-units error:', error);
    res.status(500).json({ error: "Failed to fetch sub-units" });
  }
});

router.put("/sub-units/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const subUnit = await storage.getOrganizationSubUnit(req.params.id);
    
    if (!subUnit) {
      return res.status(404).json({ error: "Sub-unit not found" });
    }
    
    const unit = await storage.getOrganizationUnit(subUnit.unitId);
    if (!unit) {
      return res.status(404).json({ error: "Parent unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot modify sub-units from other organizations" });
    }
    
    const updatedSubUnit = await storage.updateOrganizationSubUnit(req.params.id, req.body);
    res.json(updatedSubUnit);
  } catch (error) {
    console.error('Update sub-unit error:', error);
    res.status(500).json({ error: "Failed to update sub-unit" });
  }
});

router.delete("/sub-units/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const subUnit = await storage.getOrganizationSubUnit(req.params.id);
    
    if (!subUnit) {
      return res.status(404).json({ error: "Sub-unit not found" });
    }
    
    const unit = await storage.getOrganizationUnit(subUnit.unitId);
    if (!unit) {
      return res.status(404).json({ error: "Parent unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot delete sub-units from other organizations" });
    }
    
    await storage.deleteOrganizationSubUnit(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete sub-unit error:', error);
    res.status(500).json({ error: "Failed to delete sub-unit" });
  }
});

// ========================================
// USER ROLE MANAGEMENT ROUTES
// ========================================

router.post("/organizations/:orgId/users/:userId/roles", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const organizationId = effectiveOrg.organizationId;
    
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    
    const hasPlatformWideAccess =
      req.session.context?.effectiveRole === 'SuperAdmin' ||
      (isOnPremMode() && req.session.context?.effectiveRole === 'CustSuper');
    if (req.params.orgId !== organizationId && !(hasPlatformWideAccess && !effectiveOrg.isImpersonation)) {
      return res.status(403).json({ error: "Access denied: You cannot assign roles in other organizations" });
    }
    
    const { role } = req.body;
    const userRole = await storage.assignUserRole(req.params.userId, req.params.orgId, role);
    
    await SessionInvalidationService.invalidateUserSessions(
      req.params.userId,
      `Role ${role} assigned to organization`
    );
    
    res.json(userRole);
  } catch (error) {
    if (error instanceof OnpremLicensePolicyError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Assign role error:', error);
    res.status(500).json({ error: "Failed to assign role" });
  }
});

router.get("/organizations/:orgId/users", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const users = await storage.getOrganizationUsers(req.params.orgId);
    res.json(users);
  } catch (error) {
    console.error('Get organization users error:', error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/organizations/:orgId/roles/:role/users", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const organizationId = effectiveOrg.organizationId;
    
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    
    const hasPlatformWideAccess =
      req.session.context?.effectiveRole === 'SuperAdmin' ||
      (isOnPremMode() && req.session.context?.effectiveRole === 'CustSuper');
    if (req.params.orgId !== organizationId && !(hasPlatformWideAccess && !effectiveOrg.isImpersonation)) {
      return res.status(403).json({ error: "Access denied: You cannot view users from other organizations" });
    }
    
    const users = await storage.getUsersByRole(req.params.orgId, req.params.role);
    res.json(users);
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.patch("/users/:userId/roles", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const targetUserId = req.params.userId;
    const { organizationRoles } = req.body;

    const currentUser = await storage.getUser(currentUserId);
    const isSuperAdminUser = currentUser?.isSuperAdmin || false;

    if (!organizationRoles || !Array.isArray(organizationRoles)) {
      return res.status(400).json({ error: "Invalid organization roles format" });
    }

    for (const orgRole of organizationRoles) {
      const { organizationId, roles } = orgRole;
      
      if (!organizationId || !Array.isArray(roles)) {
        continue;
      }

      if (!isSuperAdminUser) {
        const canAccess = await canAccessOrganization(currentUserId, organizationId);
        if (!canAccess) {
          return res.status(403).json({ error: `Access denied for organization ${organizationId}`});
        }
      }

      const currentRoles = await storage.getUserRoles(targetUserId);
      const currentOrgRoles = currentRoles.filter(r => r.organizationId === organizationId);
      const currentRoleNames = currentOrgRoles.map(r => r.role);

      const rolesToAdd = roles.filter(r => !currentRoleNames.includes(r));
      const rolesToRemove = currentOrgRoles.filter(r => !roles.includes(r.role));

      for (const roleToRemove of rolesToRemove) {
        await storage.removeUserRole(roleToRemove.id);
      }

      for (const roleToAdd of rolesToAdd) {
        await storage.assignUserRole(targetUserId, organizationId, roleToAdd);
      }
    }

    await SessionInvalidationService.invalidateUserSessions(
      targetUserId,
      'Roles updated via admin panel'
    );

    res.json({ success: true, message: "User roles updated successfully" });
  } catch (error) {
    if (error instanceof OnpremLicensePolicyError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Update user roles error:', error);
    res.status(500).json({ error: "Failed to update user roles" });
  }
});

router.delete("/roles/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const role = await storage.getUserRole(req.params.id);
    
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, role.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot remove roles from other organizations" });
    }
    
    const targetUserId = role.userId;
    
    await storage.removeUserRole(req.params.id);
    
    await SessionInvalidationService.invalidateUserSessions(
      targetUserId,
      'Role removed from organization'
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json({ error: "Failed to remove role" });
  }
});

// ========================================
// CROSS-ORG ASSIGNMENT ROUTES (SHOWCASE ORG ONLY)
// ========================================

const initiateJoinRequestSchema = z.object({
  targetOrganizationId: z.string().uuid("Target organization ID must be a valid UUID"),
  requestedRole: z.string().default('learner'),
  requestedUnitId: z.string().uuid().optional().nullable(),
});

router.post("/users/:userId/initiate-join-request", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isOnPremMode()) {
      return res.status(404).json({ error: "Not available" });
    }
    const adminUserId = req.session.userId!;
    const targetUserId = req.params.userId;
    
    const validatedData = initiateJoinRequestSchema.parse(req.body);
    const { targetOrganizationId, requestedRole, requestedUnitId } = validatedData;
    
    // Step 1: Get admin's organization context and verify they are from a showcase org
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const adminOrganizationId = effectiveOrg.organizationId;
    
    if (!adminOrganizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    // Get admin's organization to check isShowcaseOrg
    const adminOrg = await storage.getOrganization(adminOrganizationId);
    if (!adminOrg) {
      return res.status(404).json({ error: "Admin organization not found" });
    }
    
    if (!adminOrg.isShowcaseOrg) {
      return res.status(403).json({ 
        error: "Access denied: Cross-org assignment is only available for showcase organization admins" 
      });
    }
    
    // Step 2: Verify admin has org_admin role in their organization
    const adminRoles = await storage.getUserRoles(adminUserId, adminOrganizationId);
    const isOrgAdmin = adminRoles.some((r: any) => r.role === 'org_admin');
    
    const hasPlatformWideAccess =
      req.session.context?.effectiveRole?.includes('SuperAdmin') ||
      (isOnPremMode() && req.session.context?.effectiveRole?.includes('CustSuper'));
    if (!isOrgAdmin && !hasPlatformWideAccess) {
      return res.status(403).json({ 
        error: "Access denied: Only organization admins can initiate cross-org assignments" 
      });
    }
    
    // Step 3: Verify target user exists and is in admin's organization
    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found" });
    }
    
    const userRoles = await storage.getUserRoles(targetUserId, adminOrganizationId);
    if (userRoles.length === 0) {
      return res.status(400).json({ 
        error: "Target user is not a member of your organization" 
      });
    }
    
    // Step 4: Verify target org exists and is different from source org
    const targetOrg = await storage.getOrganization(targetOrganizationId);
    if (!targetOrg) {
      return res.status(404).json({ error: "Target organization not found" });
    }
    
    if (targetOrganizationId === adminOrganizationId) {
      return res.status(400).json({ 
        error: "Cannot assign user to the same organization" 
      });
    }
    
    // Step 5: Check user doesn't already have membership in target org
    const existingRoles = await storage.getUserRoles(targetUserId, targetOrganizationId);
    if (existingRoles.length > 0) {
      return res.status(400).json({ 
        error: "User is already a member of the target organization" 
      });
    }
    
    // Step 6: Check if there's already a pending join request for this user/org combination
    const existingRequests = await db
      .select()
      .from(joinRequests)
      .where(
        and(
          eq(joinRequests.userId, targetUserId),
          eq(joinRequests.organizationId, targetOrganizationId),
          eq(joinRequests.status, 'pending')
        )
      );
    
    if (existingRequests.length > 0) {
      return res.status(400).json({ 
        error: "A pending join request already exists for this user and organization" 
      });
    }
    
    // Step 7: Create join request with pending status
    const joinRequest = await storage.createJoinRequest({
      userId: targetUserId,
      organizationId: targetOrganizationId,
      requestedUnitId: requestedUnitId || undefined,
      requestedSubUnitId: undefined,
      requestedTeamId: undefined,
      requestedSubjectIds: [],
      status: 'pending',
    });
    
    // Step 8: Send notification to target org admins
    try {
      const targetOrgAdminRoles = await db
        .select({ userId: userOrganizationRoles.userId })
        .from(userOrganizationRoles)
        .where(
          and(
            eq(userOrganizationRoles.organizationId, targetOrganizationId),
            eq(userOrganizationRoles.role, 'org_admin')
          )
        );
      
      if (targetOrgAdminRoles.length > 0) {
        const adminUserIds = targetOrgAdminRoles.map(r => r.userId);
        
        await NotificationService.createBulkNotifications(
          adminUserIds,
          {
            type: 'system_announcement',
            title: 'New Join Request',
            message: `${targetUser.firstName || targetUser.gamerName} has been assigned to your organization by ${adminOrg.name}. Review and approve their request in the Join Requests dashboard.`,
            metadata: {
              joinRequestId: joinRequest.id,
              userId: targetUserId,
              userName: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.gamerName,
              sourceOrganization: adminOrg.name,
              requestedRole,
            },
          }
        );
        
        console.log(`[Cross-Org Assignment] Notified ${adminUserIds.length} admins of ${targetOrg.name} about join request for user ${targetUserId}`);
      }
    } catch (notifyError) {
      console.error('[Cross-Org Assignment] Failed to send notifications:', notifyError);
    }
    
    console.log(`[Cross-Org Assignment] Admin ${adminUserId} from ${adminOrg.name} initiated join request for user ${targetUserId} to ${targetOrg.name}`);
    
    res.status(201).json({
      success: true,
      joinRequestId: joinRequest.id,
      message: `Join request created successfully. The admins of ${targetOrg.name} will review the request.`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('[Cross-Org Assignment] Error:', error);
    res.status(500).json({ error: "Failed to initiate cross-org assignment" });
  }
});

// GET available organizations for cross-org assignment (showcase orgs only)
router.get("/cross-org-assignment/organizations", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isOnPremMode()) {
      return res.status(404).json({ error: "Not available" });
    }
    const adminUserId = req.session.userId!;
    
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const adminOrganizationId = effectiveOrg.organizationId;
    
    if (!adminOrganizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    // Get admin's organization to check isShowcaseOrg
    const adminOrg = await storage.getOrganization(adminOrganizationId);
    if (!adminOrg || !adminOrg.isShowcaseOrg) {
      return res.status(403).json({ 
        error: "Access denied: This feature is only available for showcase organization admins" 
      });
    }
    
    // Verify admin has org_admin role
    const adminRoles = await storage.getUserRoles(adminUserId, adminOrganizationId);
    const isOrgAdmin = adminRoles.some((r: any) => r.role === 'org_admin');
    
    const hasPlatformWideAccess =
      req.session.context?.effectiveRole?.includes('SuperAdmin') ||
      (isOnPremMode() && req.session.context?.effectiveRole?.includes('CustSuper'));
    if (!isOrgAdmin && !hasPlatformWideAccess) {
      return res.status(403).json({ error: "Access denied: Only organization admins can access this" });
    }
    
    // Get all organizations except the current one
    const allOrgs = await storage.getAllOrganizations();
    const availableOrgs = allOrgs
      .filter((org: any) => org.id !== adminOrganizationId)
      .map((org: any) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        isDemo: org.isDemo,
      }));
    
    res.json({ organizations: availableOrgs });
  } catch (error) {
    console.error('[Cross-Org Assignment] Error fetching organizations:', error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

// ========================================
// USER ASSIGNMENT ROUTES
// ========================================

router.post("/organizations/:orgId/users/:userId/assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const organizationId = effectiveOrg.organizationId;
    
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    
    const hasPlatformWideAccess =
      req.session.context?.effectiveRole === 'SuperAdmin' ||
      (isOnPremMode() && req.session.context?.effectiveRole === 'CustSuper');
    if (req.params.orgId !== organizationId && !(hasPlatformWideAccess && !effectiveOrg.isImpersonation)) {
      return res.status(403).json({ error: "Access denied: You cannot assign users in other organizations" });
    }
    
    const { unitId, subUnitId, subjectId } = req.body;
    const assignment = await storage.assignUserToUnit(req.params.userId, req.params.orgId, unitId, subUnitId, subjectId);
    res.json(assignment);
  } catch (error) {
    console.error('Assign user to unit error:', error);
    res.status(500).json({ error: "Failed to assign user" });
  }
});

router.get("/organizations/:orgId/assignments", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const assignments = await storage.getOrganizationAssignments(req.params.orgId);
    res.json(assignments);
  } catch (error) {
    console.error('Get organization assignments error:', error);
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
});

router.get("/organizations/:orgId/quiz-assignments", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const assignments = await storage.getOrganizationQuizAssignments(req.params.orgId);
    res.json(assignments);
  } catch (error) {
    console.error('Get organization quiz assignments error:', error);
    res.status(500).json({ error: "Failed to fetch quiz assignments" });
  }
});

router.get("/organizations/:orgId/subject-assignments", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const orgId = req.params.orgId;
    const assignmentsMap = await storage.getOrganizationSubjectAssignments(orgId);
    const result: Record<string, string[]> = {};
    assignmentsMap.forEach((subjectIds, userId) => {
      result[userId] = subjectIds;
    });
    res.json(result);
  } catch (error) {
    console.error('Get subject assignments error:', error);
    res.status(500).json({ error: "Failed to fetch subject assignments" });
  }
});

router.get("/users/:userId/subject-assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const { userId } = req.params;
    const userAssignments = await storage.getUserAssignments(userId);
    if (userAssignments.length > 0) {
      const canAccess = await canAccessOrganization(currentUserId, userAssignments[0].organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const subjectAssignments = userAssignments
      .filter((a: any) => a.subjectId)
      .map((a: any) => a.subjectId);
    res.json(subjectAssignments);
  } catch (error) {
    console.error('Get user subject assignments error:', error);
    res.status(500).json({ error: "Failed to fetch user subject assignments" });
  }
});

router.post("/users/:userId/subject-assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const { userId } = req.params;
    const { subjectIds, organizationId, unitId, subUnitId } = req.body;
    const canAccess = await canAccessOrganization(currentUserId, organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied" });
    }
    const assignments = await storage.assignSubjectsToUser(userId, organizationId, unitId, subUnitId || undefined, subjectIds);
    res.json(assignments);
  } catch (error) {
    console.error('Assign user to subject error:', error);
    res.status(500).json({ error: "Failed to assign user to subject" });
  }
});

router.get("/organizations/:orgId/quiz-collections", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const collections = await storage.getQuizCollectionsByOrganization(req.params.orgId);
    res.json(collections);
  } catch (error) {
    console.error('Get organization quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch organization quiz collections" });
  }
});

// ========================================
// SUBJECT ROUTES
// ========================================

router.post("/subjects", requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const subject = await storage.createSubject({ ...req.body, createdBy: req.session.userId });
    res.json(subject);
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: "Failed to create subject" });
  }
});

router.get("/subjects", requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { organizationId, unitId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }
    const subjects = await storage.getSubjects(organizationId as string, unitId as string | undefined);
    res.json(subjects);
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

router.get("/organizations/:orgId/subjects", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const subjects = await storage.getSubjects(req.params.orgId);
    res.json(subjects);
  } catch (error) {
    console.error('Get organization subjects error:', error);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

router.get("/subjects/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const subject = await storage.getSubject(req.params.id);
    
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, subject.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot view subjects from other organizations" });
    }
    
    res.json(subject);
  } catch (error) {
    console.error('Get subject error:', error);
    res.status(500).json({ error: "Failed to fetch subject" });
  }
});

router.put("/subjects/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const subject = await storage.getSubject(req.params.id);
    
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, subject.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot modify subjects from other organizations" });
    }
    
    const updatedSubject = await storage.updateSubject(req.params.id, req.body);
    res.json(updatedSubject);
  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({ error: "Failed to update subject" });
  }
});

router.delete("/subjects/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const subject = await storage.getSubject(req.params.id);
    
    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, subject.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot delete subjects from other organizations" });
    }
    
    await storage.deleteSubject(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ error: "Failed to delete subject" });
  }
});

// ========================================
// UNIT-SUBJECT ASSIGNMENT ROUTES
// ========================================

router.post("/units/:unitId/subjects/:subjectId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const unit = await storage.getOrganizationUnit(req.params.unitId);
    
    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot assign subjects to units from other organizations" });
    }
    
    const assignment = await storage.assignSubjectToUnit(req.params.unitId, req.params.subjectId);
    res.json(assignment);
  } catch (error) {
    console.error('Assign subject to unit error:', error);
    res.status(500).json({ error: "Failed to assign subject to grade" });
  }
});

router.delete("/units/:unitId/subjects/:subjectId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const unit = await storage.getOrganizationUnit(req.params.unitId);
    
    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }
    
    const canAccess = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied: You cannot unassign subjects from units in other organizations" });
    }
    
    await storage.unassignSubjectFromUnit(req.params.unitId, req.params.subjectId);
    res.json({ success: true });
  } catch (error) {
    console.error('Unassign subject from unit error:', error);
    res.status(500).json({ error: "Failed to unassign subject from grade" });
  }
});

router.get("/units/:unitId/subjects", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const unitSubjectsData = await storage.getUnitSubjects(req.params.unitId);
    res.json(unitSubjectsData);
  } catch (error) {
    console.error('Get unit subjects error:', error);
    res.status(500).json({ error: "Failed to fetch grade subjects" });
  }
});

router.get("/organizations/:orgId/unit-subjects", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const units = await storage.getOrganizationUnits(req.params.orgId);
    const allUnitSubjects = [];
    
    for (const unit of units) {
      const unitSubjectsData = await storage.getUnitSubjects(unit.id);
      allUnitSubjects.push(...unitSubjectsData.map((us: any) => ({ ...us, unitId: unit.id, unitName: unit.name })));
    }
    
    res.json(allUnitSubjects);
  } catch (error) {
    console.error('Get organization unit subjects error:', error);
    res.status(500).json({ error: "Failed to fetch organization unit subjects" });
  }
});

// ========================================
// LESSON ASSIGNMENTS ROUTE
// ========================================

router.get("/lesson-assignments", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;
    
    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const assignments = await LessonService.getOrganizationLessonAssignments(organizationId);
    
    res.json(assignments);
  } catch (error) {
    console.error("Get organization lesson assignments error:", error);
    res.status(500).json({ error: "Failed to fetch lesson assignments" });
  }
});

// ========================================
// REPORTING ROUTES
// ========================================

router.get("/reports/organizations/:orgId/student/:userId", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const performance = await storage.getStudentPerformanceByCollection(req.params.userId, req.params.orgId);
    res.json(performance);
  } catch (error) {
    console.error('Get student performance error:', error);
    res.status(500).json({ error: "Failed to fetch student performance" });
  }
});

router.get("/reports/organizations/:orgId/student/:userId/results", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const collectionId = req.query.collectionId as string | undefined;
    const results = await storage.getStudentDetailedResults(req.params.userId, req.params.orgId, collectionId);
    res.json(results);
  } catch (error) {
    console.error('Get student results error:', error);
    res.status(500).json({ error: "Failed to fetch student results" });
  }
});

router.get("/reports/organizations/:orgId/unit/:unitId/summary", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const summary = await storage.getUnitPerformanceSummary(req.params.unitId, req.params.orgId);
    res.json(summary);
  } catch (error) {
    console.error('Get unit summary error:', error);
    res.status(500).json({ error: "Failed to fetch unit summary" });
  }
});

router.get("/reports/organizations/:orgId/summary", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const summary = await storage.getOrganizationPerformanceSummary(req.params.orgId);
    res.json(summary);
  } catch (error) {
    console.error('Get organization summary error:', error);
    res.status(500).json({ error: "Failed to fetch organization summary" });
  }
});

router.get("/reports/organizations/:orgId/top-performers", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    if (req.query.studentId && req.query.studentId !== 'all') {
      filters.studentId = req.query.studentId as string;
    }
    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }
    if (req.query.limit) {
      filters.limit = parseInt(req.query.limit as string);
    }
    
    const topPerformers = await storage.getTopPerformers(req.params.orgId, filters);
    res.json(topPerformers);
  } catch (error) {
    console.error('Get top performers error:', error);
    res.status(500).json({ error: "Failed to fetch top performers" });
  }
});

router.get("/reports/organizations/:orgId/at-risk-students", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    if (req.query.search && (req.query.search as string).trim()) {
      filters.search = (req.query.search as string).trim();
    }
    
    const atRiskStudents = await storage.getAtRiskStudents(req.params.orgId, filters);
    res.json(atRiskStudents);
  } catch (error) {
    console.error('Get at-risk students error:', error);
    res.status(500).json({ error: "Failed to fetch at-risk students" });
  }
});

router.get("/reports/organizations/:orgId/performance-distribution", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    const distribution = await storage.getPerformanceDistribution(req.params.orgId, filters);
    res.json(distribution);
  } catch (error) {
    console.error('Get performance distribution error:', error);
    res.status(500).json({ error: "Failed to fetch performance distribution" });
  }
});

router.get("/reports/organizations/:orgId/students-by-range/:range", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    res.json({ students: [], message: 'Feature not yet implemented' });
  } catch (error) {
    console.error('Get students by range error:', error);
    res.status(500).json({ error: "Failed to fetch students by range" });
  }
});

router.get("/reports/organizations/:orgId/student-timeline/:studentId", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const timeline = await storage.getStudentTimeline(req.params.studentId, req.params.orgId);
    res.json(timeline);
  } catch (error) {
    console.error('Get student timeline error:', error);
    res.status(500).json({ error: "Failed to fetch student timeline" });
  }
});

router.get("/reports/student-analytics/:studentId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { studentId } = req.params;
    
    const currentUser = await storage.getUser(userId);
    
    if (!currentUser?.isSuperAdmin) {
      const userRoles = await storage.getUserRoles(userId);
      const studentRoles = await storage.getUserRoles(studentId);
      
      const userOrgIds = userRoles.map((r: any) => r.organizationId);
      const studentOrgIds = studentRoles.map((r: any) => r.organizationId);
      
      const sharedOrgs = userOrgIds.filter((orgId: string) => studentOrgIds.includes(orgId));
      
      if (sharedOrgs.length === 0) {
        return res.status(403).json({ error: "Access denied: Student is not in your organization" });
      }
    }
    
    const sharedOrgId = currentUser?.isSuperAdmin 
      ? (await storage.getUserRoles(studentId))[0]?.organizationId 
      : sharedOrgs[0];
    const analytics = await storage.getStudentAnalytics(studentId, sharedOrgId);
    res.json(analytics);
  } catch (error) {
    console.error('Get student analytics error:', error);
    res.status(500).json({ error: "Failed to fetch student analytics" });
  }
});

router.get("/reports/organizations/:orgId/performance-heatmap", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    if (req.query.search && (req.query.search as string).trim()) {
      filters.search = (req.query.search as string).trim();
    }
    
    const heatmap = await storage.getPerformanceHeatmap(req.params.orgId, filters);
    res.json(heatmap);
  } catch (error) {
    console.error('Get performance heatmap error:', error);
    res.status(500).json({ error: "Failed to fetch performance heatmap" });
  }
});

// ========================================
// PLATFORM MODE CONFIG ENDPOINT
// ========================================

router.get('/platform-mode', async (req: Request, res: Response) => {
  try {
    const { getFeatureFlags } = await import('../featureFlags');
    const flags = getFeatureFlags();
    res.json({
      onpremMode: flags.ONPREM_MODE,
      onpremOwnApiKeys: flags.ONPREM_OWN_API_KEYS,
      paymentGatewayEnabled: flags.PAYMENT_GATEWAY_ENABLED,
      baseUrl: getBaseUrl(),
    });
  } catch (error: any) {
    console.error("[Platform Mode] Error fetching platform mode:", error);
    res.status(500).json({ error: "Failed to fetch platform mode" });
  }
});

// ========================================
// PLATFORM PRICING ROUTES
// ========================================

const CUSTSUPER_MANAGED_PRICING_FIELDS = [
  'currency',
  'minCoursePrice',
  'maxCoursePrice',
  'creditsPerQuizGeneration',
  'creditsPerLessonGeneration',
  'creditsPerAiFix',
  'creditsPerLessonTranslation',
  'creditsPerQuizTranslation',
  'creditsPerCourseTranslation',
  'creditsPerTranslatedPptxGeneration',
  'creditsPerThumbnailGeneration',
  'creditsPerHealthReport',
  'creditsPerTopicAnalysis',
  'creditsPerFrameworkGeneration',
  'creditsPerExplanationGeneration',
  'creditsPerAnswerCheck',
  'creditsPerOverviewGeneration',
  'creditsPerKeyTakeawaysGeneration',
  'podcastEstimateLpcPerCharacter',
  'podcastConversationMultiplier',
  'podcastMinLpc',
  'podcastMaxLpc',
  'podcastElevenUsdPer1kChars',
  'podcastElevenSubscriptionUsdMonthly',
  'podcastElevenSubscriptionIncludedChars',
  'podcastElevenTopupUsdPer1kChars',
  'podcastElevenExpectedMonthlyChars',
  'podcastUsePackageFloorLpcValue',
  'podcastEnforceNoLossFloor',
  'podcastUsdToLocalFxRate',
  'podcastTargetMarginPercent',
  'podcastLocalCurrencyPerLpc',
  'podcastSettlementGuardrailPct',
] as const;

function denyOnPremPlatformPricing(res: Response): Response | null {
  if (!isOnPremMode()) return null;
  return res.status(403).json({
    error: 'On-prem pricing is managed via CustSuper at /custsuper/manage-pricing.',
  });
}

// Get platform pricing settings (authenticated users, used by BuyCredits page)
router.get('/platform-pricing', withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await ensurePlatformPricingSchemaCompatibilityOnce();

    const [pricing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
      .limit(1);

    const subscriptionPlans = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.isActive, true))
      .orderBy(schema.subscriptionPlans.displayOrder);

    const [lessonCreditPricing] = await db
      .select()
      .from(schema.lessonCreditPricingSettings)
      .limit(1);

    res.json({ 
      platformPricing: pricing || null, 
      subscriptionPlans,
      lessonCreditPricing: lessonCreditPricing || {
        creditsPerLessonTextOnlyMin: 40,
        creditsPerLessonTextOnlyMax: 90,
        creditsPerLessonWithImagesMin: 140,
        creditsPerLessonWithImagesMax: 290,
      }
    });
  } catch (error: any) {
    console.error("[Platform Pricing] Error fetching pricing:", error);
    res.status(500).json({ error: "Failed to fetch platform pricing" });
  }
});

// Update platform pricing settings (SuperAdmin only)
router.patch('/platform-pricing', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const userId = req.session.userId!;
    const actor = await storage.getUser(userId);
    const custSuperOverrideMode = isOnPremMode() && isOnPremOwnApiKeys();
    if (custSuperOverrideMode && !actor?.isCustSuper) {
      const blockedFields = CUSTSUPER_MANAGED_PRICING_FIELDS.filter((field) => req.body[field] !== undefined);
      if (blockedFields.length > 0) {
        return res.status(403).json({
          error: 'On-prem pricing is managed by CustSuper. Use a CustSuper account for these fields.',
          blockedFields,
        });
      }
    }

    const { 
      learnerMonthlyCost, 
      elearningLearnerMonthlyCost,
      elearningLearnerDiscountPercent,
      currency,
      defaultCourseCommissionRate, 
      minCoursePrice, 
      maxCoursePrice,
      creditsPerLessonGeneration,
      creditsPerAiFix,
      creditsPerQuizGeneration,
      creditsPerLessonTranslation,
      creditsPerQuizTranslation,
      creditsPerCourseTranslation,
      creditsPerTranslatedPptxGeneration,
      creditsPerOverviewGeneration,
      creditsPerKeyTakeawaysGeneration,
      podcastEstimateLpcPerCharacter,
      podcastConversationMultiplier,
      podcastMinLpc,
      podcastMaxLpc,
      podcastElevenUsdPer1kChars,
      podcastElevenSubscriptionUsdMonthly,
      podcastElevenSubscriptionIncludedChars,
      podcastElevenTopupUsdPer1kChars,
      podcastElevenExpectedMonthlyChars,
      podcastUsePackageFloorLpcValue,
      podcastEnforceNoLossFloor,
      podcastUsdToLocalFxRate,
      podcastTargetMarginPercent,
      podcastLocalCurrencyPerLpc,
      podcastSettlementGuardrailPct,
    } = req.body;

    // Validate learner monthly cost if provided
    if (learnerMonthlyCost !== undefined && learnerMonthlyCost < 0) {
      return res.status(400).json({ error: "Invalid learner monthly cost" });
    }

    // Validate e-learning learner monthly cost if provided
    if (elearningLearnerMonthlyCost !== undefined && elearningLearnerMonthlyCost < 0) {
      return res.status(400).json({ error: "Invalid e-learning learner monthly cost" });
    }

    // Validate e-learning discount percentage if provided (0-100 range)
    if (elearningLearnerDiscountPercent !== undefined) {
      if (elearningLearnerDiscountPercent < 0 || elearningLearnerDiscountPercent > 100) {
        return res.status(400).json({ error: "Discount percentage must be between 0 and 100" });
      }
    }

    // Validate commission rate if provided (0-1 range, e.g., 0.30 = 30%)
    if (defaultCourseCommissionRate !== undefined) {
      if (defaultCourseCommissionRate < 0 || defaultCourseCommissionRate > 1) {
        return res.status(400).json({ error: "Commission rate must be between 0 and 1" });
      }
    }

    // Validate min/max course prices if provided
    if (minCoursePrice !== undefined && minCoursePrice < 0) {
      return res.status(400).json({ error: "Invalid minimum course price" });
    }
    if (maxCoursePrice !== undefined && maxCoursePrice < 0) {
      return res.status(400).json({ error: "Invalid maximum course price" });
    }
    if (minCoursePrice !== undefined && maxCoursePrice !== undefined && minCoursePrice > maxCoursePrice) {
      return res.status(400).json({ error: "Minimum price cannot exceed maximum price" });
    }

    // Validate AI generation costs if provided
    if (creditsPerLessonGeneration !== undefined && (creditsPerLessonGeneration < 1 || creditsPerLessonGeneration > 500)) {
      return res.status(400).json({ error: "AI lesson generation cost must be between 1 and 500 LPC" });
    }
    if (creditsPerAiFix !== undefined && (creditsPerAiFix < 1 || creditsPerAiFix > 100)) {
      return res.status(400).json({ error: "AI fix cost must be between 1 and 100 LPC" });
    }
    if (creditsPerQuizGeneration !== undefined && (creditsPerQuizGeneration < 1 || creditsPerQuizGeneration > 100)) {
      return res.status(400).json({ error: "AI quiz generation cost must be between 1 and 100 LPC" });
    }
    if (creditsPerLessonTranslation !== undefined && (creditsPerLessonTranslation < 1 || creditsPerLessonTranslation > 500)) {
      return res.status(400).json({ error: "Lesson translation cost must be between 1 and 500 LPC" });
    }
    if (creditsPerQuizTranslation !== undefined && (creditsPerQuizTranslation < 1 || creditsPerQuizTranslation > 500)) {
      return res.status(400).json({ error: "Quiz translation cost must be between 1 and 500 LPC" });
    }
    if (creditsPerCourseTranslation !== undefined && (creditsPerCourseTranslation < 1 || creditsPerCourseTranslation > 500)) {
      return res.status(400).json({ error: "Course translation cost must be between 1 and 500 LPC" });
    }
    if (creditsPerTranslatedPptxGeneration !== undefined && (creditsPerTranslatedPptxGeneration < 1 || creditsPerTranslatedPptxGeneration > 500)) {
      return res.status(400).json({ error: "Translated PPTX generation cost must be between 1 and 500 LPC" });
    }
    if (creditsPerOverviewGeneration !== undefined && (creditsPerOverviewGeneration < 1 || creditsPerOverviewGeneration > 500)) {
      return res.status(400).json({ error: "Overview generation cost must be between 1 and 500 LPC" });
    }
    if (creditsPerKeyTakeawaysGeneration !== undefined && (creditsPerKeyTakeawaysGeneration < 1 || creditsPerKeyTakeawaysGeneration > 500)) {
      return res.status(400).json({ error: "Key takeaways generation cost must be between 1 and 500 LPC" });
    }
    if (podcastEstimateLpcPerCharacter !== undefined && (podcastEstimateLpcPerCharacter <= 0 || podcastEstimateLpcPerCharacter > 10)) {
      return res.status(400).json({ error: "Podcast estimate LPC per character must be between 0 and 10" });
    }
    if (podcastConversationMultiplier !== undefined && (podcastConversationMultiplier < 1 || podcastConversationMultiplier > 5)) {
      return res.status(400).json({ error: "Podcast conversation multiplier must be between 1 and 5" });
    }
    if (podcastMinLpc !== undefined && (podcastMinLpc < 0 || podcastMinLpc > 10000)) {
      return res.status(400).json({ error: "Podcast minimum LPC must be between 0 and 10000" });
    }
    if (podcastMaxLpc !== undefined && podcastMaxLpc < 0) {
      return res.status(400).json({ error: "Podcast maximum LPC must be 0 or greater" });
    }
    if (podcastElevenUsdPer1kChars !== undefined && (podcastElevenUsdPer1kChars <= 0 || podcastElevenUsdPer1kChars > 1000)) {
      return res.status(400).json({ error: "Podcast ElevenLabs USD per 1k chars must be between 0 and 1000" });
    }
    if (podcastElevenSubscriptionUsdMonthly !== undefined && (podcastElevenSubscriptionUsdMonthly < 0 || podcastElevenSubscriptionUsdMonthly > 1000000)) {
      return res.status(400).json({ error: "Podcast ElevenLabs monthly subscription USD must be between 0 and 1000000" });
    }
    if (podcastElevenSubscriptionIncludedChars !== undefined && (podcastElevenSubscriptionIncludedChars < 0 || podcastElevenSubscriptionIncludedChars > 1000000000)) {
      return res.status(400).json({ error: "Podcast ElevenLabs included chars must be between 0 and 1000000000" });
    }
    if (podcastElevenTopupUsdPer1kChars !== undefined && (podcastElevenTopupUsdPer1kChars <= 0 || podcastElevenTopupUsdPer1kChars > 1000)) {
      return res.status(400).json({ error: "Podcast ElevenLabs top-up USD per 1k chars must be between 0 and 1000" });
    }
    if (podcastElevenExpectedMonthlyChars !== undefined && (podcastElevenExpectedMonthlyChars < 0 || podcastElevenExpectedMonthlyChars > 1000000000)) {
      return res.status(400).json({ error: "Podcast ElevenLabs expected monthly chars must be between 0 and 1000000000" });
    }
    if (podcastUsdToLocalFxRate !== undefined && (podcastUsdToLocalFxRate <= 0 || podcastUsdToLocalFxRate > 10000)) {
      return res.status(400).json({ error: "Podcast USD to local FX rate must be between 0 and 10000" });
    }
    if (podcastTargetMarginPercent !== undefined && (podcastTargetMarginPercent < 0 || podcastTargetMarginPercent >= 100)) {
      return res.status(400).json({ error: "Podcast target margin percent must be between 0 and 99.99" });
    }
    if (podcastLocalCurrencyPerLpc !== undefined && (podcastLocalCurrencyPerLpc <= 0 || podcastLocalCurrencyPerLpc > 10000)) {
      return res.status(400).json({ error: "Podcast local currency per LPC must be between 0 and 10000" });
    }
    if (podcastSettlementGuardrailPct !== undefined && (podcastSettlementGuardrailPct < 0 || podcastSettlementGuardrailPct > 1000)) {
      return res.status(400).json({ error: "Podcast settlement guardrail percent must be between 0 and 1000" });
    }

    // Get existing pricing or create if doesn't exist
    const [existing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt))
      .limit(1);

    // Build update object with only provided fields
    const updateData: any = {
      updatedBy: userId,
      updatedAt: new Date()
    };

    if (learnerMonthlyCost !== undefined) {
      updateData.learnerMonthlyCost = learnerMonthlyCost.toString();
    }
    if (elearningLearnerMonthlyCost !== undefined) {
      updateData.elearningLearnerMonthlyCost = elearningLearnerMonthlyCost.toString();
    }
    if (elearningLearnerDiscountPercent !== undefined) {
      updateData.elearningLearnerDiscountPercent = elearningLearnerDiscountPercent.toString();
    }
    if (defaultCourseCommissionRate !== undefined) {
      updateData.defaultCourseCommissionRate = defaultCourseCommissionRate.toString();
    }
    if (currency !== undefined) {
      const normalizedCurrency = String(currency).toUpperCase();
      if (!['USD', 'EUR', 'ZAR'].includes(normalizedCurrency)) {
        return res.status(400).json({ error: "currency must be one of USD, EUR, or ZAR" });
      }
      updateData.currency = normalizedCurrency;
    }
    if (minCoursePrice !== undefined) {
      updateData.minCoursePrice = minCoursePrice.toString();
    }
    if (maxCoursePrice !== undefined) {
      updateData.maxCoursePrice = maxCoursePrice.toString();
    }
    if (creditsPerLessonGeneration !== undefined) {
      updateData.creditsPerLessonGeneration = creditsPerLessonGeneration;
    }
    if (creditsPerAiFix !== undefined) {
      updateData.creditsPerAiFix = creditsPerAiFix;
    }
    if (creditsPerQuizGeneration !== undefined) {
      updateData.creditsPerQuizGeneration = creditsPerQuizGeneration;
    }
    if (creditsPerLessonTranslation !== undefined) {
      updateData.creditsPerLessonTranslation = creditsPerLessonTranslation;
    }
    if (creditsPerQuizTranslation !== undefined) {
      updateData.creditsPerQuizTranslation = creditsPerQuizTranslation;
    }
    if (creditsPerCourseTranslation !== undefined) {
      updateData.creditsPerCourseTranslation = creditsPerCourseTranslation;
    }
    if (creditsPerTranslatedPptxGeneration !== undefined) {
      updateData.creditsPerTranslatedPptxGeneration = creditsPerTranslatedPptxGeneration;
    }
    if (creditsPerOverviewGeneration !== undefined) {
      updateData.creditsPerOverviewGeneration = creditsPerOverviewGeneration;
    }
    if (creditsPerKeyTakeawaysGeneration !== undefined) {
      updateData.creditsPerKeyTakeawaysGeneration = creditsPerKeyTakeawaysGeneration;
    }
    if (podcastEstimateLpcPerCharacter !== undefined) {
      updateData.podcastEstimateLpcPerCharacter = String(Number(podcastEstimateLpcPerCharacter));
    }
    if (podcastConversationMultiplier !== undefined) {
      updateData.podcastConversationMultiplier = String(Number(podcastConversationMultiplier));
    }
    if (podcastMinLpc !== undefined) {
      updateData.podcastMinLpc = Number(podcastMinLpc);
    }
    if (podcastMaxLpc !== undefined) {
      // Podcast LPC is intentionally uncapped across cloud + onprem.
      updateData.podcastMaxLpc = 0;
    }
    if (podcastElevenUsdPer1kChars !== undefined) {
      updateData.podcastElevenUsdPer1kChars = String(Number(podcastElevenUsdPer1kChars));
    }
    if (podcastElevenSubscriptionUsdMonthly !== undefined) {
      updateData.podcastElevenSubscriptionUsdMonthly = String(Number(podcastElevenSubscriptionUsdMonthly));
    }
    if (podcastElevenSubscriptionIncludedChars !== undefined) {
      updateData.podcastElevenSubscriptionIncludedChars = Number(podcastElevenSubscriptionIncludedChars);
    }
    if (podcastElevenTopupUsdPer1kChars !== undefined) {
      updateData.podcastElevenTopupUsdPer1kChars = String(Number(podcastElevenTopupUsdPer1kChars));
    }
    if (podcastElevenExpectedMonthlyChars !== undefined) {
      updateData.podcastElevenExpectedMonthlyChars = Number(podcastElevenExpectedMonthlyChars);
    }
    if (podcastUsePackageFloorLpcValue !== undefined) {
      const normalized = String(podcastUsePackageFloorLpcValue).trim().toLowerCase();
      updateData.podcastUsePackageFloorLpcValue = normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
    }
    if (podcastEnforceNoLossFloor !== undefined) {
      const normalized = String(podcastEnforceNoLossFloor).trim().toLowerCase();
      updateData.podcastEnforceNoLossFloor = normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
    }
    if (podcastUsdToLocalFxRate !== undefined) {
      updateData.podcastUsdToLocalFxRate = String(Number(podcastUsdToLocalFxRate));
    }
    if (podcastTargetMarginPercent !== undefined) {
      updateData.podcastTargetMarginPercent = String(Number(podcastTargetMarginPercent));
    }
    if (podcastLocalCurrencyPerLpc !== undefined) {
      updateData.podcastLocalCurrencyPerLpc = String(Number(podcastLocalCurrencyPerLpc));
    }
    if (podcastSettlementGuardrailPct !== undefined) {
      updateData.podcastSettlementGuardrailPct = String(Number(podcastSettlementGuardrailPct));
    }

    let updated;
    if (existing) {
      [updated] = await db
        .update(schema.platformPricing)
        .set(updateData)
        .where(eq(schema.platformPricing.id, existing.id))
        .returning();
    } else {
      [updated] = await db
        .insert(schema.platformPricing)
        .values({
          learnerMonthlyCost: learnerMonthlyCost?.toString() || '8.99',
          currency: currency ? String(currency).toUpperCase() : 'ZAR',
          defaultCourseCommissionRate: defaultCourseCommissionRate?.toString() || '0.3000',
          minCoursePrice: minCoursePrice?.toString() || '50.00',
          maxCoursePrice: maxCoursePrice?.toString() || '10000.00',
          updatedBy: userId
        })
        .returning();
    }

    res.json({ platformPricing: updated });
  } catch (error: any) {
    console.error("[Platform Pricing] Error updating pricing:", error);
    res.status(500).json({ error: "Failed to update platform pricing" });
  }
});

// ========================================
// CUSTSUPER PRICING ROUTES
// ========================================

router.get('/custsuper/pricing', isCustSuper, async (req: Request, res: Response) => {
  try {
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }
    await ensurePlatformPricingSchemaCompatibilityOnce();
    
    const [pricing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt))
      .limit(1);

    const [lessonCreditPricing] = await db
      .select()
      .from(schema.lessonCreditPricingSettings)
      .limit(1);

    const quizTiers = await quizPricingService.getPlatformDefaults();
    const quizTierPricing = quizTiers.reduce((acc, tier) => {
      acc[tier.tier] = tier.creditCost;
      return acc;
    }, {} as Record<'10' | '15' | '20', number>);

    res.json({ 
      platformPricing: pricing || null,
      quizTierPricing,
      lessonCreditPricing: lessonCreditPricing || {
        creditsPerLessonTextOnlyMin: 40,
        creditsPerLessonTextOnlyMax: 90,
        creditsPerLessonWithImagesMin: 140,
        creditsPerLessonWithImagesMax: 290,
      }
    });
  } catch (error: any) {
    console.error("[CustSuper Pricing] Error fetching pricing:", error);
    res.status(500).json({ error: "Failed to fetch pricing" });
  }
});

router.patch('/custsuper/pricing', isCustSuper, async (req: Request, res: Response) => {
  try {
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }
    await ensurePlatformPricingSchemaCompatibilityOnce();

    const userId = req.session.userId!;
    const allowedFields = [
      'currency',
      'minCoursePrice', 'maxCoursePrice',
      'creditsPerQuizGeneration', 'creditsPerLessonGeneration', 'creditsPerAiFix',
      'creditsPerLessonTranslation', 'creditsPerQuizTranslation',
      'creditsPerCourseTranslation', 'creditsPerTranslatedPptxGeneration',
      'creditsPerThumbnailGeneration', 'creditsPerHealthReport',
      'creditsPerTopicAnalysis', 'creditsPerFrameworkGeneration',
      'creditsPerExplanationGeneration', 'creditsPerAnswerCheck',
      'creditsPerOverviewGeneration', 'creditsPerKeyTakeawaysGeneration',
      'podcastEstimateLpcPerCharacter', 'podcastConversationMultiplier',
      'podcastMinLpc', 'podcastMaxLpc', 'podcastElevenUsdPer1kChars',
      'podcastElevenSubscriptionUsdMonthly', 'podcastElevenSubscriptionIncludedChars',
      'podcastElevenTopupUsdPer1kChars', 'podcastElevenExpectedMonthlyChars',
      'podcastUsePackageFloorLpcValue', 'podcastEnforceNoLossFloor',
      'podcastUsdToLocalFxRate', 'podcastTargetMarginPercent',
      'podcastLocalCurrencyPerLpc', 'podcastSettlementGuardrailPct'
    ];
    
    const updateData: any = { updatedBy: userId, updatedAt: new Date() };
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        if (typeof val === 'number' && val < 0) {
          return res.status(400).json({ error: `${field} cannot be negative` });
        }
        if (field === 'currency') {
          const normalizedCurrency = String(val || '').toUpperCase();
          if (!['USD', 'EUR', 'ZAR'].includes(normalizedCurrency)) {
            return res.status(400).json({ error: 'currency must be one of USD, EUR, ZAR' });
          }
          updateData[field] = normalizedCurrency;
        } else if (field === 'podcastElevenSubscriptionIncludedChars' || field === 'podcastElevenExpectedMonthlyChars') {
          const parsed = Number(val);
          if (!Number.isFinite(parsed) || parsed < 0) {
            return res.status(400).json({ error: `${field} must be a non-negative number` });
          }
          updateData[field] = Math.round(parsed);
        } else if (field === 'podcastUsePackageFloorLpcValue' || field === 'podcastEnforceNoLossFloor') {
          const normalized = String(val).trim().toLowerCase();
          updateData[field] = normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
        } else if ([
          'defaultCourseCommissionRate',
          'minCoursePrice',
          'maxCoursePrice',
          'podcastEstimateLpcPerCharacter',
          'podcastConversationMultiplier',
          'podcastElevenUsdPer1kChars',
          'podcastElevenSubscriptionUsdMonthly',
          'podcastElevenTopupUsdPer1kChars',
          'podcastUsdToLocalFxRate',
          'podcastTargetMarginPercent',
          'podcastLocalCurrencyPerLpc',
          'podcastSettlementGuardrailPct'
        ].includes(field)) {
          updateData[field] = val.toString();
        } else {
          updateData[field] = val;
        }
      }
    }

    const rawQuizTierPricing = req.body?.quizTierPricing;
    if (rawQuizTierPricing !== undefined) {
      if (typeof rawQuizTierPricing !== 'object' || rawQuizTierPricing === null) {
        return res.status(400).json({ error: 'quizTierPricing must be an object with tier keys 10, 15, 20' });
      }

      const tierUpdates: Array<{ tier: '10' | '15' | '20'; creditCost: number }> = [];
      for (const tier of ['10', '15', '20'] as const) {
        const maybeValue = (rawQuizTierPricing as Record<string, unknown>)[tier];
        if (maybeValue === undefined) continue;
        const parsed = Number(maybeValue);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return res.status(400).json({ error: `quizTierPricing.${tier} must be a non-negative number` });
        }
        tierUpdates.push({ tier, creditCost: Math.round(parsed) });
      }

      for (const tierUpdate of tierUpdates) {
        await quizPricingService.updatePlatformPricing(tierUpdate.tier, tierUpdate.creditCost, userId);
      }

      if (updateData.creditsPerQuizGeneration === undefined) {
        const tier10 = tierUpdates.find((x) => x.tier === '10');
        if (tier10) {
          updateData.creditsPerQuizGeneration = tier10.creditCost;
        }
      }
    }

    const [existing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt))
      .limit(1);
    
    let updated;
    if (existing) {
      [updated] = await db
        .update(schema.platformPricing)
        .set(updateData)
        .where(eq(schema.platformPricing.id, existing.id))
        .returning();
    } else {
      [updated] = await db
        .insert(schema.platformPricing)
        .values({
          currency: 'ZAR',
          defaultCourseCommissionRate: '0.3000',
          minCoursePrice: '50.00',
          maxCoursePrice: '10000.00',
          updatedBy: userId,
          ...updateData,
        })
        .returning();
    }

    const updatedQuizTiers = await quizPricingService.getPlatformDefaults();
    const quizTierPricing = updatedQuizTiers.reduce((acc, tier) => {
      acc[tier.tier] = tier.creditCost;
      return acc;
    }, {} as Record<'10' | '15' | '20', number>);

    res.json({ platformPricing: updated, quizTierPricing });
  } catch (error: any) {
    console.error("[CustSuper Pricing] Error updating pricing:", error);
    res.status(500).json({ error: "Failed to update pricing" });
  }
});

// ========================================
// CUSTSUPER ORG CREDIT MANAGEMENT ROUTES
// ========================================

router.get('/custsuper/org-credits', isCustSuper, async (req: Request, res: Response) => {
  try {
    const { isOnPremOwnApiKeys } = await import('../featureFlags');
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }

    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        creditBalance: schema.organizations.orgCreditWallet,
      })
      .from(schema.organizations);

    res.json({ organizations: orgs });
  } catch (error: any) {
    console.error("[CustSuper Credits] Error fetching org credits:", error);
    res.status(500).json({ error: "Failed to fetch organization credits" });
  }
});

router.post('/custsuper/org-credits/:orgId/adjust', isCustSuper, async (req: Request, res: Response) => {
  try {
    const { isOnPremOwnApiKeys } = await import('../featureFlags');
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }

    const { orgId } = req.params;
    const { amount, reason } = req.body;
    const adminUserId = req.session.userId!;

    if (!amount || !reason) {
      return res.status(400).json({ error: "amount and reason are required" });
    }

    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      return res.status(400).json({ error: "amount must be a non-zero number" });
    }

    const org = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
    if (!org.length) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const previousBalance = org[0].orgCreditWallet || 0;
    const newBalance = previousBalance + numAmount;
    if (newBalance < 0) {
      return res.status(400).json({ error: "Adjustment would result in negative balance" });
    }

    const correlationId = `custsuper_org_adjustment_${orgId}_${Date.now()}`;

    const result = await OrganizationCreditService.adminAdjustment({
      organizationId: orgId,
      amount: numAmount,
      correlationId,
      reason: `CustSuper adjustment: ${reason}`,
      adminUserId,
    });

    console.log(`[CustSuper Credits] Admin ${adminUserId} adjusted org ${orgId} credits by ${numAmount}, reason: ${reason}`);

    res.json({
      success: true,
      organizationId: orgId,
      previousBalance,
      adjustment: numAmount,
      newBalance: result.newBalance,
    });
  } catch (error: any) {
    console.error("[CustSuper Credits] Error adjusting org credits:", error);
    res.status(500).json({ error: error.message || "Failed to adjust organization credits" });
  }
});

router.get('/custsuper/org-credits/:orgId/history', isCustSuper, async (req: Request, res: Response) => {
  try {
    const { isOnPremOwnApiKeys } = await import('../featureFlags');
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }

    const { orgId } = req.params;
    const { limit: queryLimit = '50' } = req.query;

    const transactions = await db
      .select()
      .from(schema.orgCreditLedger)
      .where(eq(schema.orgCreditLedger.organizationId, orgId))
      .orderBy(desc(schema.orgCreditLedger.createdAt))
      .limit(parseInt(queryLimit as string));

    res.json({ transactions });
  } catch (error: any) {
    console.error("[CustSuper Credits] Error fetching org credit history:", error);
    res.status(500).json({ error: "Failed to fetch organization credit history" });
  }
});

// ========================================
// CUSTSUPER USER CREDIT MANAGEMENT ROUTES
// ========================================

router.get('/custsuper/user-credits', isCustSuper, async (req: Request, res: Response) => {
  try {
    const { isOnPremOwnApiKeys } = await import('../featureFlags');
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }

    const search = req.query.search as string | undefined;

    let query = db
      .selectDistinctOn([schema.users.id], {
        id: schema.users.id,
        gamerName: schema.users.gamerName,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        lpCreditBalance: schema.users.lpCreditBalance,
        organizationName: schema.organizations.name,
      })
      .from(schema.users)
      .leftJoin(
        schema.userOrganizationRoles,
        eq(schema.users.id, schema.userOrganizationRoles.userId)
      )
      .leftJoin(
        schema.organizations,
        eq(schema.userOrganizationRoles.organizationId, schema.organizations.id)
      )
      .orderBy(schema.users.id, schema.users.gamerName);

    let users_list = await query;

    if (search) {
      const searchLower = search.toLowerCase();
      users_list = users_list.filter(u =>
        u.gamerName?.toLowerCase().includes(searchLower) ||
        u.email?.toLowerCase().includes(searchLower) ||
        u.firstName?.toLowerCase().includes(searchLower) ||
        u.lastName?.toLowerCase().includes(searchLower) ||
        u.organizationName?.toLowerCase().includes(searchLower)
      );
    }

    res.json({ 
      users: users_list.map(u => ({
        id: u.id,
        allocationId: u.id,
        userId: u.id,
        gamerName: u.gamerName,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        creditBalance: u.lpCreditBalance,
        organizationName: u.organizationName || null,
        status: 'active',
      }))
    });
  } catch (error: any) {
    console.error("[CustSuper User Credits] Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch user credits" });
  }
});

router.post('/custsuper/user-credits/:userId/adjust', isCustSuper, async (req: Request, res: Response) => {
  try {
    const { isOnPremOwnApiKeys } = await import('../featureFlags');
    if (!isOnPremOwnApiKeys()) {
      return res.status(403).json({ error: "This feature is only available when using your own API keys" });
    }

    const { userId } = req.params;
    const { amountChange, reason } = req.body;
    const adminUserId = req.session.userId!;

    if (!amountChange || !reason) {
      return res.status(400).json({ error: "amountChange and reason are required" });
    }

    const amount = parseInt(amountChange);
    if (isNaN(amount) || amount === 0) {
      return res.status(400).json({ error: "amountChange must be a non-zero number" });
    }

    const correlationId = `custsuper_adjustment_${userId}_${Date.now()}`;

    let result;
    if (amount > 0) {
      result = await UnifiedCreditService.addCredits({
        userId,
        amount,
        type: 'adjustment',
        correlationId,
        description: `CustSuper adjustment: ${reason}`,
        metadata: { reason, adminUserId, adjustmentType: 'custsuper' },
      });
    } else {
      result = await UnifiedCreditService.deductCredits({
        userId,
        amount: Math.abs(amount),
        type: 'adjustment',
        correlationId,
        description: `CustSuper adjustment: ${reason}`,
        metadata: { reason, adminUserId, adjustmentType: 'custsuper' },
      });
    }

    console.log(`[CustSuper Credits] Admin ${adminUserId} adjusted user ${userId} credits by ${amount}, reason: ${reason}`);

    res.json({
      success: true,
      adjustment: { userId, amountChange: amount, reason, adminUserId },
      newBalance: result.newBalance,
      transactionId: result.transactionId,
    });
  } catch (error: any) {
    console.error("[CustSuper Credits] Error adjusting user credits:", error);
    res.status(500).json({ error: error.message || "Failed to adjust user credits" });
  }
});

// ========================================
// THUMBNAIL PRICING ROUTES
// ========================================

// Get thumbnail generation pricing
router.get('/thumbnail-pricing', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const organizationId = effectiveOrg.organizationId;

    const pricing = await thumbnailPricingService.getEffectivePricing(organizationId);
    const featureEnabled = isAIThumbnailsEnabled();

    res.json({
      ...pricing,
      featureEnabled
    });
  } catch (error: any) {
    console.error('[Thumbnail Pricing] Error getting pricing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get thumbnail pricing for SuperAdmin management
router.get('/platform-pricing/thumbnail-credits', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const pricing = await thumbnailPricingService.getPlatformDefault();
    res.json(pricing);
  } catch (error: any) {
    console.error('[Platform Pricing] Error getting thumbnail pricing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update thumbnail generation credit cost (SuperAdmin only)
router.put('/platform-pricing/thumbnail-credits', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const userId = req.session.userId!;
    const { creditCost } = req.body;

    if (typeof creditCost !== 'number' || creditCost < 1 || creditCost > 100) {
      return res.status(400).json({ error: 'Credit cost must be a number between 1 and 100' });
    }

    const result = await thumbnailPricingService.updatePlatformPricing(creditCost, userId);
    
    console.log(`[Platform Pricing] Updated thumbnail pricing to ${creditCost} credits by user ${userId}`);
    
    res.json(result);
  } catch (error: any) {
    console.error('[Platform Pricing] Error updating thumbnail pricing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get health report pricing for SuperAdmin management
router.get('/platform-pricing/health-report-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const pricing = await healthReportPricingService.getPlatformDefault();
    res.json({ creditCost: pricing.creditCost, updatedAt: pricing.updatedAt });
  } catch (error: any) {
    console.error('[HealthReportPricing] Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch health report pricing' });
  }
});

// Update health report credit cost (SuperAdmin only)
router.put('/platform-pricing/health-report-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const { creditCost } = req.body;
    if (typeof creditCost !== 'number' || creditCost < 1 || creditCost > 100) {
      return res.status(400).json({ error: 'Credit cost must be between 1 and 100' });
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await healthReportPricingService.updatePlatformPricing(creditCost, userId);
    res.json({ success: true, creditCost: result.creditCost, updatedAt: result.updatedAt });
  } catch (error: any) {
    console.error('[HealthReportPricing] Error updating pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to update health report pricing' });
  }
});

// Get topic analysis pricing for SuperAdmin management
router.get('/platform-pricing/topic-analysis-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const pricing = await topicAnalysisPricingService.getPlatformDefault();
    res.json({ creditCost: pricing.creditCost, updatedAt: pricing.updatedAt });
  } catch (error: any) {
    console.error('[TopicAnalysisPricing] Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch topic analysis pricing' });
  }
});

// Update topic analysis credit cost (SuperAdmin only)
router.put('/platform-pricing/topic-analysis-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const { creditCost } = req.body;
    if (typeof creditCost !== 'number' || creditCost < 1 || creditCost > 100) {
      return res.status(400).json({ error: 'Credit cost must be between 1 and 100' });
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await topicAnalysisPricingService.updatePlatformPricing(creditCost, userId);
    res.json({ success: true, creditCost: result.creditCost, updatedAt: result.updatedAt });
  } catch (error: any) {
    console.error('[TopicAnalysisPricing] Error updating pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to update topic analysis pricing' });
  }
});

// Get framework generation pricing for SuperAdmin management
router.get('/platform-pricing/framework-generation-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const pricing = await frameworkPricingService.getPlatformDefault();
    res.json({ creditCost: pricing.creditCost, updatedAt: pricing.updatedAt });
  } catch (error: any) {
    console.error('[FrameworkPricing] Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch framework generation pricing' });
  }
});

// Update framework generation credit cost (SuperAdmin only)
router.patch('/platform-pricing/framework-generation-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const { creditCost } = req.body;
    if (typeof creditCost !== 'number' || creditCost < 1 || creditCost > 100) {
      return res.status(400).json({ error: 'Credit cost must be between 1 and 100' });
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await frameworkPricingService.updatePlatformPricing(creditCost, userId);
    res.json({ success: true, creditCost: result.creditCost, updatedAt: result.updatedAt });
  } catch (error: any) {
    console.error('[FrameworkPricing] Error updating pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to update framework generation pricing' });
  }
});

// Get explanation generation pricing for SuperAdmin management
router.get('/platform-pricing/explanation-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const [pricing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt))
      .limit(1);
    const creditCost = pricing?.creditsPerExplanationGeneration ?? 25;
    res.json({ creditCost, updatedAt: pricing?.updatedAt });
  } catch (error: any) {
    console.error('[ExplanationPricing] Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch explanation generation pricing' });
  }
});

// Update explanation generation credit cost (SuperAdmin only)
router.put('/platform-pricing/explanation-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const { creditCost } = req.body;
    if (typeof creditCost !== 'number' || creditCost < 1 || creditCost > 100) {
      return res.status(400).json({ error: 'Credit cost must be between 1 and 100' });
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const [existing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
      .limit(1);
    if (existing) {
      await db.update(schema.platformPricing)
        .set({ creditsPerExplanationGeneration: creditCost, updatedBy: userId, updatedAt: new Date() })
        .where(eq(schema.platformPricing.id, existing.id));
    } else {
      await db.insert(schema.platformPricing).values({ creditsPerExplanationGeneration: creditCost, updatedBy: userId });
    }
    
    console.log(`[ExplanationPricing] Updated to ${creditCost} credits by user ${userId}`);
    res.json({ success: true, creditCost, updatedAt: new Date() });
  } catch (error: any) {
    console.error('[ExplanationPricing] Error updating pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to update explanation generation pricing' });
  }
});

// Get answer check pricing for SuperAdmin management
router.get('/platform-pricing/answer-check-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const [pricing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt))
      .limit(1);
    const creditCost = pricing?.creditsPerAnswerCheck ?? 20;
    res.json({ creditCost, updatedAt: pricing?.updatedAt });
  } catch (error: any) {
    console.error('[AnswerCheckPricing] Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch answer check pricing' });
  }
});

// Update answer check credit cost (SuperAdmin only)
router.put('/platform-pricing/answer-check-credits', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const denied = denyOnPremPlatformPricing(res);
    if (denied) return;

    await ensurePlatformPricingSchemaCompatibilityOnce();

    const { creditCost } = req.body;
    if (typeof creditCost !== 'number' || creditCost < 1 || creditCost > 100) {
      return res.status(400).json({ error: 'Credit cost must be between 1 and 100' });
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const [existing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
      .limit(1);
    if (existing) {
      await db.update(schema.platformPricing)
        .set({ creditsPerAnswerCheck: creditCost, updatedBy: userId, updatedAt: new Date() })
        .where(eq(schema.platformPricing.id, existing.id));
    } else {
      await db.insert(schema.platformPricing).values({ creditsPerAnswerCheck: creditCost, updatedBy: userId });
    }
    
    console.log(`[AnswerCheckPricing] Updated to ${creditCost} credits by user ${userId}`);
    res.json({ success: true, creditCost, updatedAt: new Date() });
  } catch (error: any) {
    console.error('[AnswerCheckPricing] Error updating pricing:', error);
    res.status(500).json({ error: error.message || 'Failed to update answer check pricing' });
  }
});

// ========================================
// PLATFORM COSTS ROUTES
// ========================================

// Get all category types
router.get('/platform-costs/category-types', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const types = await PlatformCostService.getCostCategoryTypes();
    console.log(`[Platform Costs] Listed ${types.length} category types`);
    res.json(types);
  } catch (error: any) {
    console.error('[Platform Costs] Error listing category types:', error);
    res.status(500).json({ error: 'Failed to list category types' });
  }
});

// Get active category types (for dropdowns)
router.get('/platform-costs/category-types/active', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const types = await PlatformCostService.getActiveCostCategoryTypes();
    res.json(types);
  } catch (error: any) {
    console.error('[Platform Costs] Error listing active category types:', error);
    res.status(500).json({ error: 'Failed to list active category types' });
  }
});

// Create category type
router.post('/platform-costs/category-types', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = schema.insertPlatformCostCategoryTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }

    const result = await PlatformCostService.createCostCategoryType({
      ...parsed.data,
      displayOrder: parsed.data.displayOrder ?? undefined,
      description: parsed.data.description ?? undefined,
      isActive: parsed.data.isActive ?? undefined,
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    console.log(`[Platform Costs] Created category type ${result.typeId}`);
    res.status(201).json({ id: result.typeId });
  } catch (error: any) {
    console.error('[Platform Costs] Error creating category type:', error);
    res.status(500).json({ error: 'Failed to create category type' });
  }
});

// Update category type
router.put('/platform-costs/category-types/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = schema.insertPlatformCostCategoryTypeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }

    const result = await PlatformCostService.updateCostCategoryType(id, {
      ...parsed.data,
      displayOrder: parsed.data.displayOrder ?? undefined,
      description: parsed.data.description ?? undefined,
      isActive: parsed.data.isActive ?? undefined,
    });
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`[Platform Costs] Updated category type ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Platform Costs] Error updating category type:', error);
    res.status(500).json({ error: 'Failed to update category type' });
  }
});

// Delete category type
router.delete('/platform-costs/category-types/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await PlatformCostService.deleteCostCategoryType(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    console.log(`[Platform Costs] Deleted category type ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Platform Costs] Error deleting category type:', error);
    res.status(500).json({ error: 'Failed to delete category type' });
  }
});

// ==================== CATEGORIES ROUTES ====================

// Get all cost categories
router.get('/platform-costs/categories', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const categories = await PlatformCostService.getCategories();
    console.log(`[Platform Costs] Listed ${categories.length} cost categories`);
    res.json(categories);
  } catch (error: any) {
    console.error('[Platform Costs] Error listing categories:', error);
    res.status(500).json({ error: 'Failed to list cost categories' });
  }
});

// Create cost category
router.post('/platform-costs/categories', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = schema.insertPlatformCostCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }

    const result = await PlatformCostService.createCostCategory({
      ...parsed.data,
      displayOrder: parsed.data.displayOrder ?? undefined,
      description: parsed.data.description ?? undefined,
      isActive: parsed.data.isActive ?? undefined,
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    console.log(`[Platform Costs] Created category ${result.categoryId}`);
    res.status(201).json({ id: result.categoryId });
  } catch (error: any) {
    console.error('[Platform Costs] Error creating category:', error);
    res.status(500).json({ error: 'Failed to create cost category' });
  }
});

// Update cost category
router.put('/platform-costs/categories/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = schema.insertPlatformCostCategorySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }

    const result = await PlatformCostService.updateCostCategory(id, {
      ...parsed.data,
      displayOrder: parsed.data.displayOrder ?? undefined,
      description: parsed.data.description ?? undefined,
      isActive: parsed.data.isActive ?? undefined,
    });
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`[Platform Costs] Updated category ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Platform Costs] Error updating category:', error);
    res.status(500).json({ error: 'Failed to update cost category' });
  }
});

// Delete cost category (soft delete)
router.delete('/platform-costs/categories/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await PlatformCostService.deleteCostCategory(id);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`[Platform Costs] Deleted category ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Platform Costs] Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete cost category' });
  }
});

// ==================== ENTRIES ROUTES ====================

// Get cost entries with filters
router.get('/platform-costs/entries', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { categoryId, startDate, endDate, recurrence, limit, offset } = req.query;
    
    const filters = {
      categoryId: categoryId as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      recurrence: recurrence as 'one_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    const result = await PlatformCostService.getCostEntries(filters);
    console.log(`[Platform Costs] Listed ${result.entries.length} of ${result.total} cost entries`);
    res.json(result);
  } catch (error: any) {
    console.error('[Platform Costs] Error listing entries:', error);
    res.status(500).json({ error: 'Failed to list cost entries' });
  }
});

// Create cost entry
router.post('/platform-costs/entries', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const parsed = schema.insertPlatformCostEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }

    const input = {
      categoryId: parsed.data.categoryId!,
      organizationId: parsed.data.organizationId || undefined,
      description: parsed.data.description,
      amount: parsed.data.amount,
      currency: parsed.data.currency as 'ZAR' | 'USD' | 'EUR',
      recurrence: (parsed.data.recurrence || 'one_time') as 'one_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual',
      effectiveDate: parsed.data.effectiveDate,
      endDate: parsed.data.endDate || undefined,
      metadata: parsed.data.metadata as Record<string, any> | undefined,
      createdBy: userId,
    };

    const result = await PlatformCostService.createCostEntry(input);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    console.log(`[Platform Costs] Created entry ${result.costEntryId}`);
    res.status(201).json({ id: result.costEntryId });
  } catch (error: any) {
    console.error('[Platform Costs] Error creating entry:', error);
    res.status(500).json({ error: 'Failed to create cost entry' });
  }
});

// Update cost entry
router.put('/platform-costs/entries/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId!;

    const { description, amount, currency, recurrence, effectiveDate, endDate, metadata } = req.body;

    const updateInput = {
      description,
      amount,
      currency,
      recurrence,
      effectiveDate,
      endDate,
      metadata,
      updatedBy: userId,
    };

    const result = await PlatformCostService.updateCostEntry(id, updateInput);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`[Platform Costs] Updated entry ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Platform Costs] Error updating entry:', error);
    res.status(500).json({ error: 'Failed to update cost entry' });
  }
});

// Delete cost entry
router.delete('/platform-costs/entries/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId!;

    const result = await PlatformCostService.deleteCostEntry(id, userId);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`[Platform Costs] Deleted entry ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Platform Costs] Error deleting entry:', error);
    res.status(500).json({ error: 'Failed to delete cost entry' });
  }
});

// Get cost statistics
router.get('/platform-costs/stats', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await PlatformCostService.getCostStats();
    console.log(`[Platform Costs] Retrieved cost stats: monthlyBurn=${stats.monthlyBurn}, ytdCosts=${stats.ytdCosts}, activeRecurring=${stats.activeRecurring}`);
    res.json(stats);
  } catch (error: any) {
    console.error('[Platform Costs] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get cost statistics' });
  }
});

// ========================================
// LPC SPEND ANALYTICS ROUTES
// ========================================

router.get('/lpc/spend/stats', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, featureCategory } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      featureCategory: featureCategory as string | undefined,
    };
    
    console.log('[LPC Spend] Fetching spend stats with filters:', JSON.stringify(filters));
    const stats = await LpcSpendService.getSpendStats(filters);
    res.json(stats);
  } catch (error: any) {
    console.error('[LPC Spend] Error getting spend stats:', error);
    res.status(500).json({ error: 'Failed to get LPC spend statistics' });
  }
});

router.get('/lpc/spend/by-feature', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
    };
    
    console.log('[LPC Spend] Fetching spend by feature with filters:', JSON.stringify(filters));
    const breakdown = await LpcSpendService.getSpendByFeature(filters);
    res.json(breakdown);
  } catch (error: any) {
    console.error('[LPC Spend] Error getting spend by feature:', error);
    res.status(500).json({ error: 'Failed to get LPC spend by feature' });
  }
});

router.get('/lpc/spend/by-org', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, featureCategory } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      featureCategory: featureCategory as string | undefined,
    };
    
    console.log('[LPC Spend] Fetching spend by organization with filters:', JSON.stringify(filters));
    const breakdown = await LpcSpendService.getSpendByOrganization(filters);
    res.json(breakdown);
  } catch (error: any) {
    console.error('[LPC Spend] Error getting spend by organization:', error);
    res.status(500).json({ error: 'Failed to get LPC spend by organization' });
  }
});

router.get('/lpc/spend/time-series', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, featureCategory } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      featureCategory: featureCategory as string | undefined,
    };
    
    console.log('[LPC Spend] Fetching spend time series with filters:', JSON.stringify(filters));
    const timeSeries = await LpcSpendService.getSpendTimeSeries(filters);
    res.json(timeSeries);
  } catch (error: any) {
    console.error('[LPC Spend] Error getting spend time series:', error);
    res.status(500).json({ error: 'Failed to get LPC spend time series' });
  }
});

router.get('/lpc/spend/transactions', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, featureCategory, page, limit } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      featureCategory: featureCategory as string | undefined,
    };
    
    const pagination = {
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50,
    };
    
    console.log('[LPC Spend] Fetching spend transactions with filters:', JSON.stringify(filters), 'pagination:', JSON.stringify(pagination));
    const result = await LpcSpendService.getSpendTransactions(filters, pagination);
    res.json(result);
  } catch (error: any) {
    console.error('[LPC Spend] Error getting spend transactions:', error);
    res.status(500).json({ error: 'Failed to get LPC spend transactions' });
  }
});

router.get('/lpc/spend/aggregations', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, featureCategory } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      featureCategory: featureCategory as string | undefined,
    };
    
    console.log('[LPC Spend] Fetching spend aggregations with filters:', JSON.stringify(filters));
    const aggregations = await LpcSpendService.getSpendAggregations(filters);
    res.json(aggregations);
  } catch (error: any) {
    console.error('[LPC Spend] Error getting spend aggregations:', error);
    res.status(500).json({ error: 'Failed to get LPC spend aggregations' });
  }
});

// ========================================
// LPC REVENUE ANALYTICS ROUTES
// ========================================

router.get('/lpc/revenue/stats', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, status, currency } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      status: status as 'completed' | 'pending' | 'refunded' | 'all' | undefined,
      currency: currency as 'ZAR' | 'USD' | 'EUR' | undefined,
    };
    
    console.log('[LPC Revenue] Fetching revenue stats with filters:', JSON.stringify(filters));
    const stats = await LpcRevenueService.getRevenueStats(filters);
    res.json(stats);
  } catch (error: any) {
    console.error('[LPC Revenue] Error getting revenue stats:', error);
    res.status(500).json({ error: 'Failed to get LPC revenue statistics' });
  }
});

router.get('/lpc/revenue/time-series', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, status } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      status: status as 'completed' | 'pending' | 'refunded' | 'all' | undefined,
    };
    
    console.log('[LPC Revenue] Fetching revenue time series with filters:', JSON.stringify(filters));
    const timeSeries = await LpcRevenueService.getRevenueTimeSeries(filters);
    res.json(timeSeries);
  } catch (error: any) {
    console.error('[LPC Revenue] Error getting revenue time series:', error);
    res.status(500).json({ error: 'Failed to get LPC revenue time series' });
  }
});

router.get('/lpc/revenue/by-org', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      status: status as 'completed' | 'pending' | 'refunded' | 'all' | undefined,
    };
    
    console.log('[LPC Revenue] Fetching revenue by organization with filters:', JSON.stringify(filters));
    const breakdown = await LpcRevenueService.getRevenueByOrganization(filters);
    res.json(breakdown);
  } catch (error: any) {
    console.error('[LPC Revenue] Error getting revenue by organization:', error);
    res.status(500).json({ error: 'Failed to get LPC revenue by organization' });
  }
});

router.get('/lpc/revenue/costs', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
    };
    
    console.log('[LPC Revenue] Fetching cost breakdown with filters:', JSON.stringify(filters));
    const breakdown = await LpcRevenueService.getCostBreakdown(filters);
    res.json(breakdown);
  } catch (error: any) {
    console.error('[LPC Revenue] Error getting cost breakdown:', error);
    res.status(500).json({ error: 'Failed to get LPC cost breakdown' });
  }
});

router.get('/lpc/revenue/orders', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId, status, page, limit } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
      status: status as 'completed' | 'pending' | 'refunded' | 'all' | undefined,
    };
    
    const pagination = {
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50,
    };
    
    console.log('[LPC Revenue] Fetching order transactions with filters:', JSON.stringify(filters), 'pagination:', JSON.stringify(pagination));
    const result = await LpcRevenueService.getOrderTransactions(filters, pagination);
    res.json(result);
  } catch (error: any) {
    console.error('[LPC Revenue] Error getting order transactions:', error);
    res.status(500).json({ error: 'Failed to get LPC order transactions' });
  }
});

// ========================================
// COURSE ADMIN ROUTES
// ========================================

/**
 * AI-assisted topic generation using Gemini API
 */
router.post('/courses/:id/topics', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const { courseTitle, courseDescription, targetCount } = req.body;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Verify org owns this course
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Use Gemini API for topic generation
    const prompt = `Generate ${targetCount || 8} learning topics for a course titled "${courseTitle}".

Course Description: ${courseDescription}

Provide a JSON array of topics, each with:
- title: Clear, concise topic name
- description: 1-2 sentence description
- estimatedLessons: Number of lessons needed (1-5)
- order: Sequential number (1, 2, 3...)

Return ONLY the JSON array, no explanation.`;

    const geminiApiKey = await IntegrationConfigService.getSecret('gemini', 'apiKey');
    if (!geminiApiKey) {
      return res.status(400).json({ error: 'Gemini API key is not configured in Integration Settings.' });
    }
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

    const result = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });
    const responseText = result.text || '';

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse topic suggestions from AI response');
    }

    const topics = JSON.parse(jsonMatch[0]);

    res.json({ topics, message: `Generated ${topics.length} topic suggestions`});
  } catch (error) {
    console.error('Error generating topics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get course preview (all details before publishing)
 */
router.get('/courses/:id/preview', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Get course with lessons and topics
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
      with: {
        courseLessons: {
          orderBy: (cl: any, { asc }: any) => [asc(cl.orderIndex)],
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Get linked quizzes for all lessons in the course
    const { QuizCourseLinkerService } = await import('../services/quizCourseLinkerService');
    const quizzesByLesson = await QuizCourseLinkerService.getCourseQuizzes(courseId);
    // Flatten the Record<lessonId, quizzes[]> into a single array
    const quizzes = Object.values(quizzesByLesson).flat();

    // Get course versions
    const versions = await db.query.courseVersions.findMany({
      where: eq(schema.courseVersions.courseId, courseId),
      orderBy: desc(schema.courseVersions.versionNumber),
    });

    res.json({
      ...course,
      quizzes,
      quizzesByLesson,
      versions,
      totalLessons: course.courseLessons?.length || 0,
      totalQuizzes: quizzes.length,
    });
  } catch (error) {
    console.error('Error getting course preview:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get available lessons for attachment to a course
 * Only returns lessons from the same organization that are NOT already linked to this course
 * Includes pagination and orders by createdAt DESC (newest first)
 */
router.get('/courses/:courseId/available-lessons', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Verify org owns this course
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Get IDs of lessons already linked to this course
    const existingLinks = await db
      .select({ lessonId: schema.courseLessons.lessonId })
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.courseId, courseId));

    const linkedLessonIds = existingLinks.map(link => link.lessonId);

    // Build query for available lessons
    let whereConditions = and(
      eq(schema.lessons.organizationId, organizationId),
      eq(schema.lessons.isArchived, false)
    );

    // Exclude already-linked lessons if any exist
    if (linkedLessonIds.length > 0) {
      whereConditions = and(
        whereConditions,
        sql`${schema.lessons.id} NOT IN (${sql.join(linkedLessonIds.map(id => sql`${id}`), sql`, `)})`
      );
    }

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)::int`})
      .from(schema.lessons)
      .where(whereConditions);

    const totalCount = countResult[0]?.count || 0;

    // Get paginated lessons with required metadata
    const availableLessons = await db
      .select({
        id: schema.lessons.id,
        title: schema.lessons.title,
        description: schema.lessons.description,
        status: schema.lessons.generationStatus,
        thumbnailUrl: schema.lessons.presentationUrl,
        createdAt: schema.lessons.createdAt,
        isPublished: schema.lessons.isPublished,
        gradeLevel: schema.lessons.gradeLevel,
        subject: schema.lessons.subject,
      })
      .from(schema.lessons)
      .where(whereConditions)
      .orderBy(desc(schema.lessons.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      lessons: availableLessons,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: offset + availableLessons.length < totalCount,
      },
    });
  } catch (error) {
    console.error('Error getting available lessons:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Link lesson to course topic
 * Auto-calculates topicOrder as max(existing topicOrder) + 1 if not provided
 * Validates lesson belongs to same organization as course
 * Returns 400 if lesson already linked (unique constraint)
 */
router.post('/courses/:courseId/lessons/:lessonId/link', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { courseId, lessonId } = req.params;
    const { topicName } = req.body;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Verify org owns the course
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Verify lesson exists and belongs to the SAME organization as the course
    const lesson = await db.query.lessons.findFirst({
      where: eq(schema.lessons.id, lessonId),
    });

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Security: Verify lesson belongs to the same organization as the course
    if (lesson.organizationId !== course.organizationId) {
      return res.status(400).json({ 
        error: 'Lesson must belong to the same organization as the course',
        code: 'ORGANIZATION_MISMATCH'
      });
    }

    // Auto-calculate topicOrder as max(existing topicOrder) + 1
    const maxOrderResult = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${schema.courseLessons.topicOrder}), 0)`})
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.courseId, courseId));

    const nextTopicOrder = (maxOrderResult[0]?.maxOrder || 0) + 1;

    // Create link with auto-calculated topicOrder
    const link = await db
      .insert(schema.courseLessons)
      .values({
        id: crypto.randomUUID(),
        courseId,
        lessonId,
        topicName: topicName || lesson.title || 'General',
        topicOrder: nextTopicOrder,
        createdAt: new Date(),
      })
      .returning();

    // Record zero-amount audit trail for lesson attachment (no credit deduction)
    await CreditService.recordLessonAttachment(
      user.id,
      organizationId,
      lessonId,
      courseId,
      `Attached lesson "${lesson.title}" to course "${course.title}"`
    );

    res.json(link[0]);
  } catch (error: any) {
    console.error('Error linking lesson to course:', error);
    
    // Handle unique constraint violation (lesson already linked)
    if (error.code === '23505' || error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
      return res.status(400).json({ 
        error: 'Lesson is already linked to this course',
        code: 'DUPLICATE_LINK'
      });
    }
    
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Reorder lessons within a course
 * Request body: { lessonOrdering: [{ lessonId: string, topicOrder: number }] }
 * Validates all lessonIds belong to this course
 */
router.patch('/courses/:courseId/lessons/reorder', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { lessonOrdering } = req.body;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Validate request body
    if (!Array.isArray(lessonOrdering) || lessonOrdering.length === 0) {
      return res.status(400).json({ 
        error: 'lessonOrdering must be a non-empty array',
        code: 'INVALID_REQUEST'
      });
    }

    // Validate each item in the array
    for (const item of lessonOrdering) {
      if (!item.lessonId || typeof item.topicOrder !== 'number') {
        return res.status(400).json({ 
          error: 'Each item must have lessonId (string) and topicOrder (number)',
          code: 'INVALID_REQUEST'
        });
      }
    }

    // Verify org owns this course
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Get all existing lesson links for this course
    const existingLinks = await db
      .select({ lessonId: schema.courseLessons.lessonId })
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.courseId, courseId));

    const validLessonIds = new Set(existingLinks.map(link => link.lessonId));

    // Validate all lessonIds belong to this course
    const invalidLessonIds = lessonOrdering.filter((item: any) => !validLessonIds.has(item.lessonId));
    if (invalidLessonIds.length > 0) {
      return res.status(400).json({ 
        error: 'Some lessons are not linked to this course',
        code: 'INVALID_LESSON_IDS',
        invalidLessonIds: invalidLessonIds.map((item: any) => item.lessonId)
      });
    }

    // Guard: prevent reordering overview or key_takeaways lessons
    const currentLinks = await db
      .select({ lessonId: schema.courseLessons.lessonId, topicOrder: schema.courseLessons.topicOrder, lessonType: schema.courseLessons.lessonType })
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.courseId, courseId));

    const lessonTypeMap = new Map(currentLinks.map(l => [l.lessonId, l.lessonType]));
    const topicOrders = currentLinks.map(l => l.topicOrder ?? 0);
    const minOrder = Math.min(...topicOrders);
    const maxOrder = Math.max(...topicOrders);

    for (const item of lessonOrdering) {
      const currentType = lessonTypeMap.get(item.lessonId);
      const currentLink = currentLinks.find(l => l.lessonId === item.lessonId);
      const isOverview = currentType === 'overview' || (currentLink?.topicOrder === minOrder && !currentType);
      const isKeyTakeaways = currentType === 'key_takeaways' || (currentLink?.topicOrder === maxOrder && currentLink?.topicOrder !== minOrder && !currentType);
      if (isOverview || isKeyTakeaways) {
        return res.status(400).json({
          error: 'Cannot reorder overview or key takeaways lessons',
          code: 'PROTECTED_LESSON'
        });
      }
    }

    // Prevent moving lessons into the overview (min) or key_takeaways (max) positions
    for (const item of lessonOrdering) {
      if (item.topicOrder === minOrder || item.topicOrder === maxOrder) {
        const currentLink = currentLinks.find(l => l.lessonId === item.lessonId);
        if (currentLink?.topicOrder !== item.topicOrder) {
          return res.status(400).json({
            error: 'Cannot move a lesson into the overview or key takeaways position',
            code: 'PROTECTED_POSITION'
          });
        }
      }
    }

    // Update topicOrder for each lesson
    const updatePromises = lessonOrdering.map((item: any) => 
      db
        .update(schema.courseLessons)
        .set({ topicOrder: item.topicOrder })
        .where(
          and(
            eq(schema.courseLessons.courseId, courseId),
            eq(schema.courseLessons.lessonId, item.lessonId)
          )
        )
    );

    await Promise.all(updatePromises);

    // Return updated lesson links
    const updatedLinks = await db
      .select()
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.courseId, courseId))
      .orderBy(schema.courseLessons.topicOrder);

    res.json({ 
      success: true, 
      message: 'Lessons reordered successfully',
      links: updatedLinks
    });
  } catch (error) {
    console.error('Error reordering lessons:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get all lessons for a course
 */
router.get('/courses/:id/lessons', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Verify org owns this course
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Get all lesson links with lesson details
    const links = await db
      .select({
        id: schema.courseLessons.id,
        courseId: schema.courseLessons.courseId,
        lessonId: schema.courseLessons.lessonId,
        topicOrder: schema.courseLessons.topicOrder,
        topicName: schema.courseLessons.topicName,
        primaryQuizId: schema.courseLessons.primaryQuizId,
        createdAt: schema.courseLessons.createdAt,
        lesson: {
          id: schema.lessons.id,
          title: schema.lessons.title,
          description: schema.lessons.description,
          generationStatus: schema.lessons.generationStatus,
          isPublished: schema.lessons.isPublished,
          presentationUrl: schema.lessons.presentationUrl,
          createdAt: schema.lessons.createdAt,
        },
      })
      .from(schema.courseLessons)
      .leftJoin(schema.lessons, eq(schema.courseLessons.lessonId, schema.lessons.id))
      .where(eq(schema.courseLessons.courseId, courseId))
      .orderBy(schema.courseLessons.topicOrder);

    res.json(links);
  } catch (error) {
    console.error('Error getting course lessons:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Unlink lesson from course
 */
router.delete('/courses/:courseId/lessons/:lessonId', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { courseId, lessonId } = req.params;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Verify org owns this course
    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or unauthorized' });
    }

    // Delete link
    await db
      .delete(schema.courseLessons)
      .where(
        and(
          eq(schema.courseLessons.courseId, courseId),
          eq(schema.courseLessons.lessonId, lessonId)
        )
      );

    res.json({ success: true, message: 'Lesson unlinked from course' });
  } catch (error) {
    console.error('Error unlinking lesson:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Generate quizzes for all course lessons
 */
router.post('/courses/:id/generate-quizzes', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const { QuizCourseLinkerService } = await import('../services/quizCourseLinkerService');

    const job = await QuizCourseLinkerService.generateBulkQuizzes(
      courseId, 
      organizationId,
      user.id, // createdBy
      user.id  // userId for credit verification
    );

    res.json(job);
  } catch (error: any) {
    console.error('Error generating quizzes:', error);
    
    // Handle InsufficientCreditsError
    if (error.name === 'InsufficientCreditsError' || error.message?.includes('Insufficient credits')) {
      return res.status(402).json({
        error: "Insufficient credits for bulk quiz generation",
        code: "INSUFFICIENT_CREDITS",
        required: error.requiredAmount || 0,
        available: error.currentBalance || 0,
      });
    }
    
    res.status(500).json({ error: error.message || 'Failed to generate quizzes' });
  }
});

/**
 * Get quiz generation job status
 */
router.get('/courses/:id/quiz-jobs/:jobId', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const { QuizCourseLinkerService } = await import('../services/quizCourseLinkerService');

    const job = await QuizCourseLinkerService.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get course feedback (reviews and ratings)
 */
router.get('/courses/:id/feedback', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id: courseId } = req.params;
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const course = await db.query.courses.findFirst({
      where: and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const reviews = await ReviewService.getCourseReviews(courseId, { includeHidden: false });
    
    const ratingDistribution = reviews.reduce((acc: Record<number, number>, r: any) => {
      const rating = Math.floor(r.rating);
      acc[rating] = (acc[rating] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    res.json({
      course,
      reviews,
      total: reviews.length,
      ratingDistribution,
      averageRating: course.averageRating,
      totalReviews: reviews.length,
    });
  } catch (error) {
    console.error('Error getting course feedback:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// REFUND MANAGEMENT ROUTES
// ========================================

/**
 * Get pending refund requests for OrgAdmin
 */
router.get('/courses/refunds/pending', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = getEffectiveOrganizationId(req.session);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { CourseRefundService } = await import('../services/courseRefundService');

    const result = await CourseRefundService.getPendingRefundsForOrg(organizationId);

    res.json(result);
  } catch (error) {
    console.error('Error getting pending refunds:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get all refund requests for OrgAdmin with filters
 */
router.get('/courses/refunds', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = getEffectiveOrganizationId(req.session);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { status, limit = '50', offset = '0' } = req.query;

    const { CourseRefundService } = await import('../services/courseRefundService');

    const result = await CourseRefundService.getAllRefundsForOrg({
      organizationId,
      status: status as 'pending' | 'approved' | 'declined' | 'paid' | undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json(result);
  } catch (error) {
    console.error('Error getting refunds:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Approve a refund request (OrgAdmin only)
 */
router.post('/courses/refunds/:refundId/approve', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const adminUserId = req.session.userId!;
    const { refundId } = req.params;
    const { adminNote, customRefundAmount } = req.body;

    const organizationId = getEffectiveOrganizationId(req.session);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const [refund] = await db
      .select()
      .from(schema.courseRefunds)
      .where(eq(schema.courseRefunds.id, refundId))
      .limit(1);

    if (!refund) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    const [purchase] = await db
      .select()
      .from(schema.coursePurchases)
      .where(eq(schema.coursePurchases.id, refund.purchaseId))
      .limit(1);

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const [course] = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, purchase.courseId))
      .limit(1);

    if (!course || course.organizationId !== organizationId) {
      return res.status(403).json({ error: 'You do not have permission to manage this refund' });
    }

    const { CourseRefundService } = await import('../services/courseRefundService');

    const result = await CourseRefundService.approveRefund({
      refundId,
      decidedBy: adminUserId,
      decisionReason: adminNote || 'Approved by organization admin',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Refund approved successfully' });
  } catch (error) {
    console.error('Error approving refund:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Decline a refund request (OrgAdmin only)
 */
router.post('/courses/refunds/:refundId/decline', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const adminUserId = req.session.userId!;
    const { refundId } = req.params;
    const { adminNote, declineReason } = req.body;

    if (!declineReason) {
      return res.status(400).json({ error: 'Decline reason is required' });
    }

    const organizationId = getEffectiveOrganizationId(req.session);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const [refund] = await db
      .select()
      .from(schema.courseRefunds)
      .where(eq(schema.courseRefunds.id, refundId))
      .limit(1);

    if (!refund) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    const [purchase] = await db
      .select()
      .from(schema.coursePurchases)
      .where(eq(schema.coursePurchases.id, refund.purchaseId))
      .limit(1);

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const [course] = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, purchase.courseId))
      .limit(1);

    if (!course || course.organizationId !== organizationId) {
      return res.status(403).json({ error: 'You do not have permission to manage this refund' });
    }

    const { CourseRefundService } = await import('../services/courseRefundService');

    const result = await CourseRefundService.declineRefund({
      refundId,
      decidedBy: adminUserId,
      decisionReason: declineReason,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Refund declined' });
  } catch (error) {
    console.error('Error declining refund:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// ORGANIZATION SETTINGS ROUTES
// ========================================

/**
 * Get organization settings
 */
router.get('/settings', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });

    res.json({
      timezone: resolveEffectiveTimezone(null, org?.timezone || null),
    });
  } catch (error) {
    console.error('Error getting org settings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Update organization timezone
 */
router.put('/settings/timezone', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }
    const { timezone } = req.body;
    const normalizedTimezone = canonicalizeTimezone(timezone);
    if (!normalizedTimezone || !isValidIanaTimezone(normalizedTimezone)) {
      return res.status(400).json({ error: 'Invalid timezone. Use an IANA timezone (e.g., UTC, Africa/Johannesburg).' });
    }

    await db
      .update(schema.organizations)
      .set({ timezone: normalizedTimezone, updatedAt: new Date() })
      .where(eq(schema.organizations.id, organizationId));

    if (req.session.userId) {
      const newContext = await SessionContextService.buildSessionContext(req.session.userId);
      req.session.context = newContext;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
    }

    res.json({ success: true, message: 'Timezone updated' });
  } catch (error) {
    console.error('Error updating timezone:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Update organization default currency
 */
router.put('/settings/currency', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }
    const { currency } = req.body;

    res.json({ success: true, message: 'Currency preference updated' });
  } catch (error) {
    console.error('Error updating currency:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// BANKING DETAILS ROUTES
// ========================================

/**
 * Get banking details
 */
router.get('/banking-details', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const banking = await OrganizationBankingBridgeService.getByOrganizationId(organizationId);
    if (!banking) {
      return res.json({ organizationId, isVerified: false });
    }
    res.json(banking);
  } catch (error) {
    console.error('Error getting banking details:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Update banking details with encryption
 */
router.put('/banking-details', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }
    const { bankName, accountNumber, branchCode, accountHolderName } = req.body;
    const banking = await OrganizationBankingBridgeService.upsertForOrganization({
      organizationId,
      bankName,
      accountNumber,
      branchCode: branchCode ?? null,
      accountHolderName,
      updatedByUserId: req.session.userId ?? null,
    });

    res.json(banking);
  } catch (error) {
    console.error('Error updating banking details:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Verify banking details (SuperAdmin only)
 */
router.post('/banking-details/verify', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;

    const banking = await OrganizationBankingBridgeService.verifyForOrganization(organizationId);
    if (!banking) {
      return res.status(404).json({ error: 'Banking details not found' });
    }
    res.json(banking);
  } catch (error) {
    console.error('Error verifying banking details:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// GAMMA MANAGEMENT ROUTES
// ========================================

// Configure multer for image style thumbnail uploads
const imageStyleUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  }
});

// Get all image styles (SuperAdmin/CustSuper)
router.get('/gamma/image-styles', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const styles = await db
      .select()
      .from(schema.gammaImageStyles)
      .orderBy(schema.gammaImageStyles.weight);
    res.json({ styles });
  } catch (error) {
    console.error("[Admin Image Styles] Error fetching styles:", error);
    res.status(500).json({ error: "Failed to fetch image styles" });
  }
});

// Upload thumbnail for image style (SuperAdmin/CustSuper)
router.post('/gamma/image-styles/:styleKey/upload',
  isSuperAdminOrCustSuper,
  imageStyleUpload.single('thumbnail'),
  async (req: Request, res: Response) => {
    try {
      const { styleKey } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Verify style exists
      const existingStyle = await db
        .select()
        .from(schema.gammaImageStyles)
        .where(eq(schema.gammaImageStyles.styleKey, styleKey))
        .limit(1);

      if (existingStyle.length === 0) {
        return res.status(404).json({ error: 'Image style not found' });
      }

      // Upload to object storage using helper method
      const objectStorageService = new ObjectStorageService();
      const publicUrl = await objectStorageService.uploadImageStyleThumbnail(
        styleKey,
        req.file.buffer,
        req.file.mimetype
      );

      // Update style record with thumbnail URL
      await db
        .update(schema.gammaImageStyles)
        .set({
          thumbnailUrl: publicUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.gammaImageStyles.styleKey, styleKey));

      res.json({
        success: true,
        thumbnailUrl: publicUrl,
        styleKey,
      });
    } catch (error: any) {
      console.error('[Admin Image Styles] Upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload thumbnail' });
    }
  }
);

// Get all Gamma themes (SuperAdmin/CustSuper)
router.get('/gamma/themes', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { themes } = await GammaThemeSyncService.getActiveThemes();
    res.json({ themes });
  } catch (error: any) {
    console.error('[Admin Themes] Error fetching themes:', error);
    res.status(500).json({ error: 'Failed to fetch themes' });
  }
});

// Upload or replace theme thumbnail (SuperAdmin/CustSuper)
router.patch(
  '/gamma-themes/:id/thumbnail',
  isSuperAdminOrCustSuper,
  imageStyleUpload.single('thumbnail'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are allowed' });
      }

      // Check if theme exists
      const existingTheme = await db
        .select()
        .from(schema.gammaThemes)
        .where(eq(schema.gammaThemes.id, id))
        .limit(1);

      if (existingTheme.length === 0) {
        return res.status(404).json({ error: 'Theme not found' });
      }

      const theme = existingTheme[0];

      // If there's an existing thumbnail, delete it first
      const objectStorageService = new ObjectStorageService();
      if (theme.thumbnailUrl) {
        try {
          await objectStorageService.deleteThemeThumbnail(theme.thumbnailUrl);
        } catch (error) {
          console.warn('[Admin Themes] Failed to delete old thumbnail:', error);
          // Continue with upload even if delete fails
        }
      }

      // Upload new thumbnail to object storage
      const publicUrl = await objectStorageService.uploadThemeThumbnail(
        id,
        req.file.buffer,
        req.file.mimetype
      );

      // Update theme record with new thumbnail URL
      await db
        .update(schema.gammaThemes)
        .set({
          thumbnailUrl: publicUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.gammaThemes.id, id));

      res.json({
        success: true,
        thumbnailUrl: publicUrl,
        themeId: id,
      });
    } catch (error: any) {
      console.error('[Admin Themes] Upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload thumbnail' });
    }
  }
);

// Remove theme thumbnail (SuperAdmin/CustSuper)
router.delete('/gamma-themes/:id/thumbnail', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if theme exists
    const existingTheme = await db
      .select()
      .from(schema.gammaThemes)
      .where(eq(schema.gammaThemes.id, id))
      .limit(1);

    if (existingTheme.length === 0) {
      return res.status(404).json({ error: 'Theme not found' });
    }

    const theme = existingTheme[0];

    if (!theme.thumbnailUrl) {
      return res.status(404).json({ error: 'Theme has no thumbnail to remove' });
    }

    // Delete from object storage
    const objectStorageService = new ObjectStorageService();
    await objectStorageService.deleteThemeThumbnail(theme.thumbnailUrl);

    // Update theme record (set thumbnailUrl to null)
    await db
      .update(schema.gammaThemes)
      .set({
        thumbnailUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.gammaThemes.id, id));

    res.json({
      success: true,
      message: 'Thumbnail removed successfully',
      themeId: id,
    });
  } catch (error: any) {
    console.error('[Admin Themes] Delete error:', error);
    res.status(500).json({ error: error.message || 'Failed to remove thumbnail' });
  }
});

// Gamma API status cache (5 minutes)
let gammaStatusCache: {
  data: any;
  timestamp: number;
} | null = null;
const GAMMA_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get Gamma API status and recent usage (SuperAdmin/CustSuper)
router.get('/gamma/status', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      search,
      limit = '50',
      offset = '0',
      skipCache
    } = req.query;

    // Check cache first (only for basic requests without filters)
    const now = Date.now();
    const isBasicRequest = !startDate && !endDate && !search && !skipCache;
    if (isBasicRequest && gammaStatusCache && (now - gammaStatusCache.timestamp) < GAMMA_STATUS_CACHE_TTL) {
      console.log("[Gamma Status] Returning cached status");
      return res.json(gammaStatusCache.data);
    }

    // Test connection (fetches themes, doesn't consume credits)
    let connectionStatus;
    try {
      const gammaService = await GammaService.getInstance();
      connectionStatus = await gammaService.testConnection();
    } catch (error: any) {
      connectionStatus = {
        connected: false,
        message: error.message || "Failed to initialize Gamma service"
      };
    }

    // Get system-wide Gamma balance and usage stats using CreditService
    const systemBalance = await CreditService.getSystemBalanceDetails();
    
    // Get user-level credit transactions (debits and credits) - PRIMARY SOURCE OF TRUTH
    const userTransactions = await CreditService.getUserCreditTransactions({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      search: search as string | undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    // Get Gamma ledger (system-wide API usage tracking)
    const gammaUsageStats = await CreditService.getCreditUsageStats({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      search: search as string | undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    const responseData = {
      connection: connectionStatus,
      systemBalance, // Our internal tracking of Gamma credits (currentBalance, totalDeducted, lastSnapshot)
      userTransactions, // All user-level credit transactions (debits and credits) from creditTransactions table
      gammaUsage: gammaUsageStats, // System-wide Gamma API usage from gammaCreditLedger table
      note: "Gamma API does not provide an account balance endpoint. Visit gamma.app/settings/billing to view your actual credit balance.",
      billingUrl: "https://gamma.app/settings/billing"
    };

    // Cache the result only for basic requests
    if (isBasicRequest) {
      gammaStatusCache = {
        data: responseData,
        timestamp: now
      };
    }

    res.json(responseData);
  } catch (error: any) {
    console.error("[Gamma Status] Error fetching status:", error);
    res.status(500).json({ error: "Failed to fetch Gamma API status" });
  }
});

// ========================================
// AI THUMBNAIL GENERATION
// ========================================

const thumbnailRateLimiter = new Map<string, { count: number; resetAt: number }>();
const THUMBNAIL_RATE_LIMIT = 5;
const THUMBNAIL_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-progress generation tracker to prevent concurrent requests
const inProgressGenerations = new Set<string>();

/**
 * Generate AI-powered course thumbnail
 * Rate limited to 5 per hour per organization
 * Charges LP Credits for each generation
 */
router.post('/courses/:courseId/generate-thumbnail', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { courseId } = req.params;
  const userId = req.session.userId!;

  try {
    // Check feature flag
    if (!isAIThumbnailsEnabled()) {
      return res.status(503).json({
        error: 'AI thumbnail generation is currently unavailable',
        errorCode: 'ai_unavailable'
      });
    }

    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const organizationId = effectiveOrg.organizationId;

    if (!organizationId) {
      return res.status(403).json({ error: 'No organization found for user' });
    }

    // Check for concurrent generation (idempotency guard)
    const generationKey = `${courseId}`;
    if (inProgressGenerations.has(generationKey)) {
      return res.status(409).json({
        error: 'Thumbnail generation already in progress for this course',
        errorCode: 'generation_in_progress'
      });
    }

    // Rate limiting check
    const now = Date.now();
    const orgRateLimit = thumbnailRateLimiter.get(organizationId);
    
    if (orgRateLimit && orgRateLimit.resetAt > now) {
      if (orgRateLimit.count >= THUMBNAIL_RATE_LIMIT) {
        const retryAfterSeconds = Math.ceil((orgRateLimit.resetAt - now) / 1000);
        return res.status(429).json({
          error: `Rate limit exceeded. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
          errorCode: 'rate_limited',
          retryAfter: retryAfterSeconds
        });
      }
    }

    // Verify course exists and belongs to organization
    const course = await CourseService.getCourseById(courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    // Get credit cost
    const creditCost = await thumbnailPricingService.getThumbnailCreditCost(organizationId);
    // Check credit availability using hybrid service (user wallet + org wallet fallback)
    const deductionPreview = await HybridCreditService.previewDeduction({
      userId,
      organizationId,
      amount: creditCost,
    });
    if (!deductionPreview.canDeduct) {
      return res.status(402).json({
        error: 'Insufficient credits for thumbnail generation',
        errorCode: 'insufficient_credits',
        required: creditCost,
        userBalance: deductionPreview.userBalance,
        orgBalance: deductionPreview.orgBalance,
        orgWalletEnabled: deductionPreview.orgWalletEnabled,
        reason: deductionPreview.reason
      });
    }

    // Mark as in-progress
    inProgressGenerations.add(generationKey);

    // Generate correlation ID for idempotency
    const timestamp = Date.now();
    const correlationId = `thumbnail-gen:${courseId}:${timestamp}`;

    // Deduct credits first
    // Deduct credits using hybrid service (user wallet + org wallet fallback)
    let creditDeducted = false;
    let deductionResult: Awaited<ReturnType<typeof HybridCreditService.deductWithFallback>> | null = null;
    try {
      deductionResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditCost,
        type: 'thumbnail_generation',
        correlationId,
        description: `AI thumbnail generation for course: ${course.title}`,
        metadata: {
          courseId,
          courseTitle: course.title,
          adminUserId: userId,
          organizationId,
          creditSource: 'pending'
        }
      });
      creditDeducted = true;

      console.log(`[AI Thumbnail] Deducted ${creditCost} credits for course ${courseId}. Source: ${deductionResult.creditSource}`);

      // Fetch organization branding for color context
      let brandingContext: {
        primaryColor?: string;
        secondaryColor?: string;
        accentColor?: string;
        orgName?: string;
        logoBase64?: string;
      } | undefined;

      try {
        const brandingTheme = await storage.getBrandingThemeByOrgId(organizationId);
        if (brandingTheme) {
          const tokens = brandingTheme.tokens || {};
          brandingContext = {
            primaryColor: tokens['--primary'] || tokens['--btn-primary-bg'],
            secondaryColor: tokens['--secondary'] || tokens['--btn-secondary-bg'],
            accentColor: tokens['--accent'] || tokens['--cta-bg'],
            orgName: brandingTheme.orgName,
          };
          console.log(`[AI Thumbnail] Using branding context for org: ${brandingTheme.orgName}`);
          
          // Fetch logo and convert to base64 for overlay
          if (brandingTheme.logoUrl) {
            try {
              const logoStorageService = new ObjectStorageService();
              const logoBuffer = await logoStorageService.downloadFileToBuffer(brandingTheme.logoUrl);
              if (logoBuffer) {
                brandingContext.logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                console.log(`[AI Thumbnail] Loaded logo for overlay (${logoBuffer.length} bytes)`);
              }
            } catch (logoError) {
              console.warn(`[AI Thumbnail] Could not fetch logo for overlay:`, logoError);
            }
          }
        }
      } catch (brandingError) {
        console.warn(`[AI Thumbnail] Could not fetch branding, using defaults:`, brandingError);
      }

      // Fetch course framework for topic context
      let courseTopics: string[] = [];
      try {
        const framework = await CourseService.getCourseFramework(courseId);
        if (framework && framework.topics) {
          courseTopics = framework.topics
            .slice(0, 10)  // Limit to first 10 topics
            .map((t: any) => t.name)
            .filter(Boolean);
        }
      } catch (frameworkError) {
        console.warn(`[AI Thumbnail] Could not fetch course framework:`, frameworkError);
      }

      // Generate thumbnail using AI
      const result = await courseThumbnailAIService.generateThumbnail(
        course.title,
        course.description,
        brandingContext,
        courseTopics  // Add this parameter
      );

      // Upload to Object Storage
      const objectStorageService = new ObjectStorageService();
      const { objectPath } = await objectStorageService.uploadCourseThumbnailFromBuffer(
        result.imageBuffer,
        organizationId,
        courseId
      );

      // Update course with new thumbnail
      const promptSummary = courseThumbnailAIService.getPromptSummary(course.title, course.description);
      await db.update(schema.courses)
        .set({
          thumbnailUrl: objectPath,
          thumbnailSource: 'ai',
          thumbnailGeneratedAt: new Date(),
          thumbnailPromptSummary: promptSummary,
          updatedAt: new Date(),
        })
        .where(eq(schema.courses.id, courseId));

      // Update rate limiter
      if (orgRateLimit && orgRateLimit.resetAt > now) {
        orgRateLimit.count++;
      } else {
        thumbnailRateLimiter.set(organizationId, {
          count: 1,
          resetAt: now + THUMBNAIL_RATE_WINDOW_MS
        });
      }

      // Get signed URL for response
      let thumbnailSignedUrl: string | undefined;
      try {
        thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(objectPath, 3600);
      } catch (err) {
        console.error('[AI Thumbnail] Error generating signed URL:', err);
      }

      const duration = Date.now() - startTime;
      console.log(`[AI Thumbnail] Successfully generated thumbnail for course ${courseId} in ${duration}ms`);

      res.json({
        thumbnailUrl: objectPath,
        thumbnailSignedUrl,
        creditsCharged: creditCost,
        generatedAt: new Date().toISOString(),
        source: 'ai'
      });

    } catch (error: any) {
      // Refund credits if generation or upload failed after deduction
      if (creditDeducted && deductionResult) {
        try {
          const refundMetadata = {
            courseId,
            originalCorrelationId: correlationId,
            reason: error.message || 'Generation failed',
            originalCreditSource: deductionResult.creditSource
          };

          // Handle refund based on credit source
          if (deductionResult.creditSource === 'user' || deductionResult.creditSource === 'split') {
            if (deductionResult.userAmountDeducted > 0) {
              await UnifiedCreditService.addCredits({
                userId,
                amount: deductionResult.userAmountDeducted,
                type: 'refund',
                correlationId: `${correlationId}:refund:user`,
                description: `Refund for failed thumbnail generation: ${course.title}`,
                organizationId,
                metadata: { ...refundMetadata, refundPortion: 'user' }
              });
              console.log(`[AI Thumbnail] Refunded ${deductionResult.userAmountDeducted} credits to user wallet`);
            }
          }

          if (deductionResult.creditSource === 'organization' || deductionResult.creditSource === 'split') {
            if (deductionResult.orgAmountDeducted > 0) {
              await OrganizationCreditService.refundCredits({
                organizationId,
                amount: deductionResult.orgAmountDeducted,
                correlationId: `${correlationId}:refund:org`,
                description: `Refund for failed thumbnail generation: ${course.title}`,
                metadata: { ...refundMetadata, refundPortion: 'org' }
              });
              console.log(`[AI Thumbnail] Refunded ${deductionResult.orgAmountDeducted} credits to org wallet`);
            }
          }

          console.log(`[AI Thumbnail] Refunded ${creditCost} total credits due to generation failure. Source: ${deductionResult.creditSource}`);
        } catch (refundError) {
          console.error('[AI Thumbnail] Failed to refund credits:', refundError);
        }
      }
      throw error;
    } finally {
      inProgressGenerations.delete(generationKey);
    }

  } catch (error: any) {
    console.error('[AI Thumbnail] Error generating thumbnail:', error);

    if (error instanceof ThumbnailGenerationError) {
      const response: any = {
        error: error.message,
        errorCode: error.errorCode,
        creditsRefunded: true
      };
      
      // Include original API error details for invalid_model errors to help admins debug
      if (error.errorCode === 'invalid_model' && error.originalError) {
        response.apiError = error.originalError;
      }
      
      return res.status(error.errorCode === 'ai_unavailable' ? 503 : 500).json(response);
    }

    res.status(500).json({
      error: error.message || 'Failed to generate thumbnail',
      errorCode: 'generation_failed',
      creditsRefunded: true
    });
  }
});

// ========================================
// REVENUE ANALYTICS ROUTES
// ========================================

router.get('/revenue', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const days = Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);
    const monthsBack = Math.max(1, Math.ceil(days / 30));

    const { RevenueTrackingService } = await import('../services/revenueTrackingService');

    const [summary, topCoursesRaw, monthlyTrendsRaw, byCurrencyRows, commissionRate] = await Promise.all([
      RevenueTrackingService.getOrganizationRevenue(organizationId, periodStart, periodEnd),
      RevenueTrackingService.getCourseRevenueBreakdown(organizationId, periodStart, periodEnd),
      RevenueTrackingService.getMonthlyTrends(organizationId, monthsBack),
      db
        .select({
          currency: schema.coursePurchases.purchaseCurrency,
          count: sql<number>`count(*)::int`,
          amount: sql<string>`coalesce(sum(${schema.coursePurchases.purchasePrice}::numeric), 0)::text`,
        })
        .from(schema.coursePurchases)
        .innerJoin(schema.courses, eq(schema.coursePurchases.courseId, schema.courses.id))
        .where(
          and(
            eq(schema.courses.organizationId, organizationId),
            eq(schema.coursePurchases.status, 'completed'),
            gte(schema.coursePurchases.purchasedAt, periodStart),
            lte(schema.coursePurchases.purchasedAt, periodEnd),
          )
        )
        .groupBy(schema.coursePurchases.purchaseCurrency),
      RevenueTrackingService.getOrganizationCommissionRate(organizationId),
    ]);

    res.json({
      summary: {
        totalSales: summary.salesCount || 0,
        grossRevenue: Number(summary.totalRevenue || 0).toFixed(2),
        platformCommission: Number(summary.platformCommission || 0).toFixed(2),
        netEarnings: Number(summary.netProfit || 0).toFixed(2),
        currency: summary.currency || 'ZAR',
        commissionRate: Number(commissionRate || 0).toString(),
      },
      topCourses: topCoursesRaw.slice(0, 10).map((course) => ({
        id: course.courseId,
        title: course.courseTitle,
        salesCount: course.totalSales,
        revenue: Number(course.totalRevenue || 0).toFixed(2),
        netEarnings: Number(course.netRevenue || 0).toFixed(2),
      })),
      monthlyTrends: monthlyTrendsRaw.map((trend) => ({
        month: trend.month,
        sales: trend.salesCount || 0,
        revenue: Number(trend.revenue || 0).toFixed(2),
        commission: Number(trend.commissionDeducted || 0).toFixed(2),
        net: Number(trend.netProfit || 0).toFixed(2),
      })),
      salesBreakdown: {
        byCurrency: byCurrencyRows.map((row) => ({
          currency: row.currency || summary.currency || 'ZAR',
          count: Number(row.count || 0),
          amount: Number(row.amount || 0).toFixed(2),
        })),
      },
    });
  } catch (error) {
    console.error('Error getting org revenue dashboard payload:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to fetch revenue dashboard' });
  }
});

router.get('/revenue/summary', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const { RevenueTrackingService } = await import('../services/revenueTrackingService');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const summary = await RevenueTrackingService.getOrganizationRevenue(organizationId, thirtyDaysAgo, now);

    res.json(summary);
  } catch (error) {
    console.error('Error getting revenue summary:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get top courses by sales and rating
 */
router.get('/revenue/top-courses', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }
    const { limit = '10' } = req.query;

    const { RevenueTrackingService } = await import('../services/revenueTrackingService');

    const topCourses = await RevenueTrackingService.getTopCourses(
      organizationId,
      parseInt(limit as string)
    );

    res.json(topCourses);
  } catch (error) {
    console.error('Error getting top courses:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get monthly revenue trends
 */
router.get('/revenue/monthly-trends', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }
    const { months = '12' } = req.query;

    const { RevenueTrackingService } = await import('../services/revenueTrackingService');

    const trends = await RevenueTrackingService.getMonthlyTrends(
      organizationId,
      parseInt(months as string)
    );

    res.json(trends);
  } catch (error) {
    console.error('Error getting monthly trends:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get revenue breakdown by course
 */
router.get('/revenue/breakdown', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const { RevenueTrackingService } = await import('../services/revenueTrackingService');

    const breakdown = await RevenueTrackingService.getCourseRevenueBreakdown(organizationId);

    res.json(breakdown);
  } catch (error) {
    console.error('Error getting revenue breakdown:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// STATEMENTS ROUTES
// ========================================

router.get('/statements', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    const statements = await PayoutService.getCoursePayouts(organizationId);

    res.json(statements);
  } catch (error) {
    console.error('Error getting statements:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/statements/download', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
  try {
    const { payoutId, format = 'pdf' } = req.query;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    if (!payoutId) {
      return res.status(400).json({ error: 'Payout ID required' });
    }

    const payout = await db.query.coursePayouts.findFirst({
      where: and(
        eq(schema.coursePayouts.id, payoutId as string),
        eq(schema.coursePayouts.organizationId, organizationId)
      ),
    });

    if (!payout) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    const lineItems = await db.query.coursePayoutLineItems.findMany({
      where: eq(schema.coursePayoutLineItems.payoutId, payoutId as string),
      with: {
        course: true,
      },
    });

    if (format === 'csv') {
      const csv = [
        'Course,Sales Count,Gross Revenue,Platform Commission,Net Amount',
        ...lineItems.map(item =>
          `"${item.course.title}",${item.salesCount},${item.grossRevenue},${item.platformCommission},${item.netAmount}`
        ),
        `Total,,${payout.grossRevenue},${payout.platformCommission},${payout.netAmount}`,
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="statement-${payoutId}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'PDF format not yet implemented - use CSV' });
    }
  } catch (error) {
    console.error('Error downloading statement:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// CREDIT PACKAGES ROUTES
// ========================================

const createCreditPackageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  creditsAmount: z.number().positive("Credits amount must be positive").or(z.string().transform(val => parseInt(val, 10))).pipe(z.number().positive("Credits amount must be positive")),
  priceAmount: z.number().positive("Price amount must be positive").or(z.string().transform(val => parseFloat(val))).pipe(z.number().positive("Price amount must be positive")),
  currency: z.enum(['ZAR', 'USD', 'EUR']).optional().default('ZAR'),
  displayOrder: z.number().int().or(z.string().transform(val => parseInt(val, 10))).pipe(z.number().int()),
  badge: z.string().nullable().optional(),
  features: z.array(z.string()).nullable().optional(),
  colorScheme: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const updateCreditPackageSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  creditsAmount: z.number().positive("Credits amount must be positive").or(z.string().transform(val => parseInt(val, 10))).pipe(z.number().positive("Credits amount must be positive")).optional(),
  priceAmount: z.number().positive("Price amount must be positive").or(z.string().transform(val => parseFloat(val))).pipe(z.number().positive("Price amount must be positive")).optional(),
  currency: z.enum(['ZAR', 'USD', 'EUR']).optional(),
  displayOrder: z.number().int().or(z.string().transform(val => parseInt(val, 10))).pipe(z.number().int()).optional(),
  badge: z.string().nullable().optional(),
  features: z.array(z.string()).nullable().optional(),
  colorScheme: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get('/credit-packages', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { activeOnly = 'true' } = req.query;
    
    let query = db
      .select()
      .from(schema.creditPurchasePackages)
      .orderBy(schema.creditPurchasePackages.displayOrder);

    if (activeOnly === 'true') {
      query = query.where(eq(schema.creditPurchasePackages.isActive, true)) as any;
    }

    const packages = await query;
    res.json({ packages });
  } catch (error: any) {
    console.error("[Credit Packages] Error fetching packages:", error);
    return sendError(res, 500, "Failed to fetch credit packages", ErrorCode.DATABASE_ERROR);
  }
});

router.post('/credit-packages', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const validation = createCreditPackageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validation.error.format() 
      });
    }
    
    const { name, creditsAmount, priceAmount, currency, badge, features, displayOrder, colorScheme, isActive } = validation.data;
    let canonicalUsdPrice = priceAmount;
    if (currency !== 'USD') {
      const conversion = await CurrencyService.convertAmount(priceAmount.toString(), currency, 'USD');
      canonicalUsdPrice = parseFloat(conversion.convertedAmount);
    }

    const [newPackage] = await db
      .insert(schema.creditPurchasePackages)
      .values({
        name,
        creditsAmount,
        priceAmount: canonicalUsdPrice.toString(),
        currency: 'USD',
        badge: badge || null,
        features: features || null,
        displayOrder,
        colorScheme: colorScheme || null,
        isActive,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    res.json({ package: newPackage });
  } catch (error: any) {
    console.error("[Credit Packages] Error creating package:", error);
    return sendError(res, 500, "Failed to create credit package", ErrorCode.DATABASE_ERROR);
  }
});

router.patch('/credit-packages/:packageId', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { packageId } = req.params;
    
    const validation = updateCreditPackageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validation.error.format() 
      });
    }
    
    const { name, creditsAmount, priceAmount, currency, badge, features, displayOrder, colorScheme, isActive } = validation.data;

    const [existingPkg] = await db
      .select()
      .from(schema.creditPurchasePackages)
      .where(eq(schema.creditPurchasePackages.id, packageId))
      .limit(1);
    if (!existingPkg) {
      return res.status(404).json({ error: "Credit package not found" });
    }

    const updateData: any = {
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (creditsAmount !== undefined) updateData.creditsAmount = creditsAmount;
    if (priceAmount !== undefined) {
      const sourceCurrency = (currency || existingPkg.currency || 'USD') as 'ZAR' | 'USD' | 'EUR';
      if (sourceCurrency === 'USD') {
        updateData.priceAmount = priceAmount.toString();
      } else {
        const conversion = await CurrencyService.convertAmount(priceAmount.toString(), sourceCurrency, 'USD');
        updateData.priceAmount = conversion.convertedAmount;
      }
      updateData.currency = 'USD';
    } else if (currency !== undefined && existingPkg.currency !== 'USD') {
      const conversion = await CurrencyService.convertAmount(existingPkg.priceAmount, existingPkg.currency as 'ZAR' | 'USD' | 'EUR', 'USD');
      updateData.priceAmount = conversion.convertedAmount;
      updateData.currency = 'USD';
    } else if (currency !== undefined) {
      updateData.currency = 'USD';
    }
    if (badge !== undefined) updateData.badge = badge;
    if (features !== undefined) updateData.features = features;
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
    if (colorScheme !== undefined) updateData.colorScheme = colorScheme;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(schema.creditPurchasePackages)
      .set(updateData)
      .where(eq(schema.creditPurchasePackages.id, packageId))
      .returning();

    res.json({ package: updated });
  } catch (error: any) {
    console.error("[Credit Packages] Error updating package:", error);
    return sendError(res, 500, "Failed to update credit package", ErrorCode.DATABASE_ERROR);
  }
});

router.delete('/credit-packages/:packageId', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;

    const [deleted] = await db
      .delete(schema.creditPurchasePackages)
      .where(eq(schema.creditPurchasePackages.id, packageId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Credit package not found" });
    }

    res.json({ success: true, package: deleted });
  } catch (error: any) {
    console.error("[Credit Packages] Error deleting package:", error);
    return sendError(res, 500, "Failed to delete credit package", ErrorCode.DATABASE_ERROR);
  }
});

// ========================================
// LESSON CREDITS ROUTES
// ========================================

router.get('/lesson-credits/users', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { search, organizationId, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = db
      .select({
        user: users,
        organization: organizations,
        orgRole: userOrganizationRoles,
      })
      .from(users)
      .leftJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
      .leftJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
      .$dynamic();

    const conditions = [];
    
    if (organizationId) {
      conditions.push(eq(userOrganizationRoles.organizationId, organizationId as string));
    }
    
    if (search) {
      conditions.push(
        or(
          sql`${users.gamerName} ILIKE ${`%${search}%`}`,
          sql`${users.email} ILIKE ${`%${search}%`}`,
          sql`${users.firstName} ILIKE ${`%${search}%`}`,
          sql`${users.lastName} ILIKE ${`%${search}%`}`
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query
      .orderBy(desc(users.updatedAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      users: results.map(r => ({
        allocationId: r.user.id,
        userId: r.user.id,
        userName: r.user.gamerName,
        email: r.user.email,
        organizationId: r.organization?.id || null,
        organizationName: r.organization?.name || null,
        currentBalance: r.user.lpCreditBalance ?? 0,
        monthlyAllocation: null,
        status: 'active',
        lastResetDate: null,
        updatedAt: r.user.updatedAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasMore: results.length === limitNum
      }
    });
  } catch (error: any) {
    console.error("[Lesson Credits] Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch user credit balances" });
  }
});

router.post('/lesson-credits/users/:allocationId/adjust', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { allocationId } = req.params;
    const { amountChange, reason } = req.body;
    const userId = allocationId;

    if (!amountChange || !reason) {
      return res.status(400).json({ error: "amountChange and reason are required" });
    }

    const amount = parseInt(amountChange);
    const correlationId = `admin_adjustment_${userId}_${Date.now()}`;
    const adminUserId = req.session.userId!;

    let result;
    if (amount > 0) {
      result = await UnifiedCreditService.addCredits({
        userId,
        amount,
        type: 'adjustment',
        correlationId,
        description: `Admin adjustment: ${reason}`,
        metadata: {
          reason,
          adminUserId,
        },
      });
    } else if (amount < 0) {
      result = await UnifiedCreditService.deductCredits({
        userId,
        amount: Math.abs(amount),
        type: 'adjustment',
        correlationId,
        description: `Admin adjustment: ${reason}`,
        metadata: {
          reason,
          adminUserId,
        },
      });
    } else {
      return res.status(400).json({ error: "amountChange cannot be zero" });
    }

    console.log(`[Lesson Credits] Admin ${adminUserId} adjusted credits for user ${userId}: ${amount > 0 ? '+' : ''}${amount}, reason: ${reason}`);

    res.json({
      success: true,
      adjustment: {
        userId,
        amountChange: amount,
        reason,
        adminUserId,
      },
      newBalance: result.newBalance,
      transactionId: result.transactionId,
    });
  } catch (error: any) {
    console.error("[Lesson Credits] Error adjusting credits:", error);
    res.status(500).json({ error: error.message || "Failed to adjust credits" });
  }
});

router.get('/lesson-credits/users/:allocationId/history', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { allocationId } = req.params;
    const userId = allocationId;
    const { limit = '50' } = req.query;

    const transactions = await db
      .select()
      .from(schema.lpCreditLedger)
      .where(eq(schema.lpCreditLedger.userId, userId))
      .orderBy(desc(schema.lpCreditLedger.createdAt))
      .limit(parseInt(limit as string));

    res.json({
      transactions: transactions.map(t => ({
        id: t.id,
        allocationId: t.userId,
        userId: t.userId,
        transactionType: t.transactionType,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        description: t.description,
        correlationId: t.correlationId,
        metadata: t.metadata,
        createdAt: t.createdAt,
      })),
    });
  } catch (error: any) {
    console.error("[Lesson Credits] Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch transaction history" });
  }
});

// ========================================
// REVIEWS/MODERATION ROUTES
// ========================================

/**
 * Get reviews for moderation with filtering
 */
router.get('/reviews', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }
    const { courseId, minRating, maxRating, isHidden, limit = '50', offset = '0' } = req.query;

    // Build filters
    const filters: any[] = [];

    // Filter by org's courses only
    const orgCourses = await db.query.courses.findMany({
      where: eq(schema.courses.organizationId, organizationId),
      columns: { id: true },
    });

    const courseIds = orgCourses.map((c) => c.id);

    if (courseId) {
      filters.push(eq(schema.courseReviews.courseId, courseId as string));
    } else if (courseIds.length > 0) {
      filters.push(inArray(schema.courseReviews.courseId, courseIds));
    }

    if (minRating) {
      filters.push(gte(schema.courseReviews.rating, parseFloat(minRating as string)));
    }

    if (maxRating) {
      filters.push(lte(schema.courseReviews.rating, parseFloat(maxRating as string)));
    }

    if (isHidden !== undefined) {
      filters.push(eq(schema.courseReviews.isHidden, isHidden === 'true'));
    }

    const reviews = await db.query.courseReviews.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      orderBy: desc(schema.courseReviews.createdAt),
      with: {
        course: true,
        user: {
          columns: {
            username: true,
            gamerName: true,
          },
        },
      },
    });

    const total = await db
      .select({ count: sql<number>`count(*)`})
      .from(schema.courseReviews)
      .where(filters.length > 0 ? and(...filters) : undefined);

    res.json({ reviews, total: Number(total[0]?.count || 0) });
  } catch (error) {
    console.error('Error getting reviews for moderation:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get moderation queue (flagged/low-rated reviews)
 */
router.get('/reviews/moderation-queue', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    const organizationId = getEffectiveOrganizationId(req.session);
    if (!organizationId) {
      return res.status(403).json({ error: 'No organization context available' });
    }

    // Get org's courses
    const orgCourses = await db.query.courses.findMany({
      where: eq(schema.courses.organizationId, organizationId),
      columns: { id: true },
    });

    const courseIds = orgCourses.map((c) => c.id);

    if (courseIds.length === 0) {
      return res.json({ reviews: [], total: 0 });
    }

    // Get reviews with rating < 3.0 or reported
    const reviews = await db.query.courseReviews.findMany({
      where: and(
        inArray(schema.courseReviews.courseId, courseIds),
        or(
          lte(schema.courseReviews.rating, 3.0),
          eq(schema.courseReviews.isReported, true)
        )
      ),
      orderBy: [
        desc(schema.courseReviews.isReported),
        desc(schema.courseReviews.createdAt),
      ],
      with: {
        course: true,
        user: {
          columns: {
            username: true,
            gamerName: true,
          },
        },
      },
    });

    res.json({ reviews, total: reviews.length });
  } catch (error) {
    console.error('Error getting moderation queue:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==================== BUSINESS PACKAGE MANAGEMENT ====================

// GET /api/admin/business-packages/course-estimate - Calculate course estimates for given credits
// NOTE: This route MUST come BEFORE the :id routes to avoid param conflicts
router.get('/business-packages/course-estimate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const credits = parseInt(req.query.credits as string) || 0;
    const estimate = await businessPackageService.calculateCourseEstimate(credits);
    res.json(estimate);
  } catch (error) {
    console.error('Error calculating course estimate:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/admin/business-packages - List all packages
router.get('/business-packages', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const packages = await businessPackageService.getAllPackages(includeInactive);
    // For each package, also fetch prices
    const packagesWithPrices = await Promise.all(packages.map(async (pkg) => {
      const prices = await businessPackageService.getPackagePrices(pkg.id);
      const courseEstimate = await businessPackageService.calculateCourseEstimate(pkg.monthlyCredits);
      return { ...pkg, prices, courseEstimate };
    }));
    res.json(packagesWithPrices);
  } catch (error) {
    console.error('Error listing business packages:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/admin/business-packages/:id - Get single package
router.get('/business-packages/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const pkg = await businessPackageService.getPackageById(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    const prices = await businessPackageService.getPackagePrices(pkg.id);
    const courseEstimate = await businessPackageService.calculateCourseEstimate(pkg.monthlyCredits);
    res.json({ ...pkg, prices, courseEstimate });
  } catch (error) {
    console.error('Error getting business package:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/admin/business-packages - Create new package
router.post('/business-packages', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    // Validate with Zod schema
    const validatedData = insertBusinessPackageSchema.parse(req.body);
    const pkg = await businessPackageService.createPackage(validatedData, req.session.userId!);
    res.status(201).json(pkg);
  } catch (error) {
    console.error('Error creating business package:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

// PATCH /api/admin/business-packages/:id - Update package
router.patch('/business-packages/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const pkg = await businessPackageService.updatePackage(req.params.id, req.body, req.session.userId!);
    res.json(pkg);
  } catch (error) {
    console.error('Error updating business package:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/admin/business-packages/:id - Delete package (soft delete)
router.delete('/business-packages/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    await businessPackageService.deletePackage(req.params.id, req.session.userId!);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting business package:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// === PRICING ENDPOINTS ===

// GET /api/admin/business-packages/:id/prices - Get all prices for a package
router.get('/business-packages/:id/prices', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const prices = await businessPackageService.getPackagePrices(req.params.id);
    res.json(prices);
  } catch (error) {
    console.error('Error getting package prices:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/admin/business-packages/:id/prices - Add or update price for currency
router.post('/business-packages/:id/prices', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const validatedData = insertBusinessPackagePriceSchema.parse({
      ...req.body,
      packageId: req.params.id
    });
    const price = await businessPackageService.upsertPackagePrice(validatedData, req.session.userId!);
    res.status(201).json(price);
  } catch (error) {
    console.error('Error upserting package price:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

// PATCH /api/admin/business-packages/:id/prices/:priceId - Update existing price
const updatePackagePriceSchema = z.object({
  pricePerLearner: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
  pricePerTeacher: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
  pricePerOrgAdmin: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
}).refine(data => {
  const values = [data.pricePerLearner, data.pricePerTeacher, data.pricePerOrgAdmin].filter(v => v !== undefined);
  return values.length > 0 && values.every(v => !isNaN(Number(v)) && Number(v) >= 0);
}, { message: 'At least one valid non-negative price field is required' });

router.patch('/business-packages/:id/prices/:priceId', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = updatePackagePriceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }
    
    const { pricePerLearner, pricePerTeacher, pricePerOrgAdmin } = parsed.data;
    
    const price = await businessPackageService.updatePackagePriceById(
      req.params.priceId,
      req.params.id,
      { pricePerLearner, pricePerTeacher, pricePerOrgAdmin },
      req.session.userId!
    );
    
    res.json(price);
  } catch (error) {
    console.error('Error updating package price:', error);
    const message = (error as Error).message;
    if (message === 'Price not found') {
      return res.status(404).json({ error: message });
    }
    if (message === 'Price does not belong to this package') {
      return res.status(403).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

// DELETE /api/admin/business-packages/:id/prices/:priceId - Delete price
router.delete('/business-packages/:id/prices/:priceId', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    await businessPackageService.deletePackagePrice(req.params.priceId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting package price:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// PACKAGE ANALYTICS ROUTES
// ========================================

import {
  organizationPackageAssignments,
  packageChangeEvents,
  businessPackagePrices,
} from '@shared/schema';

router.get('/package-analytics', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const currency = (req.query.currency as string) || 'ZAR';
    
    const assignments = await db
      .select()
      .from(schema.organizationPackageAssignments)
      .where(eq(schema.organizationPackageAssignments.status, 'active'));
    
    const packages = await businessPackageService.getAllPackages();
    
    const allPrices = await db.select().from(schema.businessPackagePrices);
    
    const priceMap = new Map<string, Map<string, number>>();
    for (const price of allPrices) {
      if (!priceMap.has(price.packageId)) {
        priceMap.set(price.packageId, new Map());
      }
      const learnerPrice = parseFloat(price.pricePerLearner) || 0;
      const teacherPrice = parseFloat(price.pricePerTeacher) || 0;
      const orgAdminPrice = parseFloat(price.pricePerOrgAdmin) || 0;
      priceMap.get(price.packageId)!.set(price.currency, learnerPrice + teacherPrice + orgAdminPrice);
    }
    
    const mrrByCurrency: Record<string, number> = {};
    const mrrByPackage: Array<{ packageId: string; packageName: string; tier: string; mrr: number; orgCount: number }> = [];
    const packageOrgCounts: Record<string, number> = {};
    
    for (const assignment of assignments) {
      const pkg = packages.find((p) => p.id === assignment.packageId);
      if (!pkg) continue;
      
      const assignmentCurrency = assignment.currency || 'ZAR';
      const pricesForPackage = priceMap.get(assignment.packageId);
      const basePrice = pricesForPackage?.get(assignmentCurrency) || 0;
      
      mrrByCurrency[assignmentCurrency] = (mrrByCurrency[assignmentCurrency] || 0) + basePrice;
      packageOrgCounts[assignment.packageId] = (packageOrgCounts[assignment.packageId] || 0) + 1;
    }
    
    for (const pkg of packages) {
      const orgCount = packageOrgCounts[pkg.id] || 0;
      const pricesForPackage = priceMap.get(pkg.id);
      const basePrice = pricesForPackage?.get(currency) || 0;
      mrrByPackage.push({
        packageId: pkg.id,
        packageName: pkg.name,
        tier: pkg.tier,
        mrr: basePrice * orgCount,
        orgCount,
      });
    }
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentEvents = await db
      .select()
      .from(schema.packageChangeEvents)
      .where(gte(schema.packageChangeEvents.createdAt, thirtyDaysAgo));
    
    let upgradesLast30Days = 0;
    let downgradesLast30Days = 0;
    let subscriptionsLast30Days = 0;
    let cancellationsLast30Days = 0;
    
    for (const event of recentEvents) {
      switch (event.changeType) {
        case 'org_subscribed':
          subscriptionsLast30Days++;
          break;
        case 'org_upgraded':
          upgradesLast30Days++;
          break;
        case 'org_downgraded':
          downgradesLast30Days++;
          break;
        case 'org_cancelled':
          cancellationsLast30Days++;
          break;
      }
    }
    
    const totalMRR = Object.entries(mrrByCurrency).reduce((sum, [curr, val]) => {
      if (curr === currency) return sum + val;
      return sum;
    }, 0);
    
    res.json({
      totalMRR,
      totalActiveOrgs: assignments.length,
      mrrByPackage,
      mrrByCurrency,
      upgradesLast30Days,
      downgradesLast30Days,
      subscriptionsLast30Days,
      cancellationsLast30Days,
    });
  } catch (error) {
    console.error('Error getting package analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/package-analytics/seat-utilization', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const assignments = await db
      .select()
      .from(schema.organizationPackageAssignments)
      .where(eq(schema.organizationPackageAssignments.status, 'active'));
    
    const packages = await businessPackageService.getAllPackages();
    
    const utilizationByTier: Record<string, {
      totalLearnerSeats: number;
      usedLearnerSeats: number;
      totalTeacherSeats: number;
      usedTeacherSeats: number;
      totalOrgAdminSeats: number;
      usedOrgAdminSeats: number;
      orgCount: number;
    }> = {};
    
    for (const assignment of assignments) {
      const pkg = packages.find((p) => p.id === assignment.packageId);
      if (!pkg) continue;
      
      const tier = pkg.tier;
      if (!utilizationByTier[tier]) {
        utilizationByTier[tier] = {
          totalLearnerSeats: 0,
          usedLearnerSeats: 0,
          totalTeacherSeats: 0,
          usedTeacherSeats: 0,
          totalOrgAdminSeats: 0,
          usedOrgAdminSeats: 0,
          orgCount: 0,
        };
      }
      
      const userCounts = await businessPackageService.getOrganizationUserCounts(assignment.organizationId);
      
      utilizationByTier[tier].totalLearnerSeats += pkg.maxLearners;
      utilizationByTier[tier].usedLearnerSeats += userCounts.learners;
      utilizationByTier[tier].totalTeacherSeats += pkg.maxTeachers;
      utilizationByTier[tier].usedTeacherSeats += userCounts.teachers;
      utilizationByTier[tier].totalOrgAdminSeats += pkg.maxOrgAdmins;
      utilizationByTier[tier].usedOrgAdminSeats += userCounts.orgAdmins;
      utilizationByTier[tier].orgCount++;
    }
    
    const result = Object.entries(utilizationByTier).map(([tier, data]) => ({
      tier,
      orgCount: data.orgCount,
      avgLearnerUtilization: data.totalLearnerSeats > 0 ? data.usedLearnerSeats / data.totalLearnerSeats : 0,
      avgTeacherUtilization: data.totalTeacherSeats > 0 ? data.usedTeacherSeats / data.totalTeacherSeats : 0,
      avgOrgAdminUtilization: data.totalOrgAdminSeats > 0 ? data.usedOrgAdminSeats / data.totalOrgAdminSeats : 0,
      totalLearnerSeats: data.totalLearnerSeats,
      usedLearnerSeats: data.usedLearnerSeats,
      totalTeacherSeats: data.totalTeacherSeats,
      usedTeacherSeats: data.usedTeacherSeats,
      totalOrgAdminSeats: data.totalOrgAdminSeats,
      usedOrgAdminSeats: data.usedOrgAdminSeats,
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Error getting seat utilization:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/package-analytics/funnel', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const events = await db
      .select({
        changeType: schema.packageChangeEvents.changeType,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.packageChangeEvents)
      .where(
        and(
          gte(schema.packageChangeEvents.createdAt, startDate),
          inArray(schema.packageChangeEvents.changeType, ['org_subscribed', 'org_upgraded', 'org_downgraded', 'org_cancelled'])
        )
      )
      .groupBy(schema.packageChangeEvents.changeType);
    
    const funnel = {
      periodDays: days,
      subscribed: 0,
      upgraded: 0,
      downgraded: 0,
      cancelled: 0,
    };
    
    for (const event of events) {
      switch (event.changeType) {
        case 'org_subscribed':
          funnel.subscribed = event.count;
          break;
        case 'org_upgraded':
          funnel.upgraded = event.count;
          break;
        case 'org_downgraded':
          funnel.downgraded = event.count;
          break;
        case 'org_cancelled':
          funnel.cancelled = event.count;
          break;
      }
    }
    
    res.json(funnel);
  } catch (error) {
    console.error('Error getting funnel analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// PACKAGE PROPOSAL ROUTES (formerly Package Calculator)
// ========================================

import { packageProposalService } from '../services/packageProposalService';

const generateProposalsSchema = z.object({
  organizationId: z.string().optional(),
  targetUserCount: z.object({
    learners: z.number().int().min(0),
    teachers: z.number().int().min(0),
    orgAdmins: z.number().int().min(0),
  }),
  preferredCurrency: z.enum(['ZAR', 'USD', 'EUR']),
  includeComparison: z.boolean().optional(),
});

router.post('/package-proposals/generate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = generateProposalsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }
    const proposals = await packageProposalService.generatePackageProposals(parsed.data);
    res.json(proposals);
  } catch (error) {
    console.error('Error generating package proposals:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

const bulkApplyProposalSchema = z.object({
  proposal: z.object({
    pricePerLearner: z.number().min(0),
    pricePerTeacher: z.number().min(0),
    pricePerOrgAdmin: z.number().min(0),
    creditsIncluded: z.number().int().min(0),
    packageName: z.string(),
    tier: z.string(),
  }),
  currency: z.enum(['ZAR', 'USD', 'EUR']),
  maxLearners: z.number().int().min(0),
  maxTeachers: z.number().int().min(0),
  maxOrgAdmins: z.number().int().min(0),
  organizationIds: z.union([z.array(z.string()), z.literal('all')]),
});

router.post('/package-proposals/bulk-apply', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = bulkApplyProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }
    
    const userId = req.session.userId!;
    const { proposal, currency, maxLearners, maxTeachers, maxOrgAdmins, organizationIds } = parsed.data;
    
    let targetOrgs: { id: string; name: string }[];
    
    if (organizationIds === 'all') {
      targetOrgs = await db.select({
        id: schema.organizations.id,
        name: schema.organizations.name,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.isActive, true));
    } else {
      targetOrgs = await db.select({
        id: schema.organizations.id,
        name: schema.organizations.name,
      })
      .from(schema.organizations)
      .where(and(
        eq(schema.organizations.isActive, true),
        inArray(schema.organizations.id, organizationIds)
      ));
    }
    
    const priceData: Record<string, string> = {};
    const currencyKey = currency.toUpperCase();
    priceData[`pricePerLearner${currencyKey}`] = proposal.pricePerLearner.toString();
    priceData[`pricePerTeacher${currencyKey}`] = proposal.pricePerTeacher.toString();
    priceData[`pricePerOrgAdmin${currencyKey}`] = proposal.pricePerOrgAdmin.toString();
    
    const results = { success: 0, skipped: 0, failed: 0, errors: [] as string[] };
    
    for (const org of targetOrgs) {
      try {
        const existingOverride = await db.query.organizationPackageOverrides.findFirst({
          where: eq(schema.organizationPackageOverrides.organizationId, org.id),
        });
        
        if (existingOverride) {
          await db.update(schema.organizationPackageOverrides)
            .set({
              maxLearners,
              maxTeachers,
              maxOrgAdmins,
              monthlyCredits: proposal.creditsIncluded,
              ...priceData,
              reason: `Bulk applied from Package Proposal: ${proposal.packageName} (${proposal.tier})`,
              isActive: true,
              updatedBy: userId,
              updatedAt: new Date(),
            })
            .where(eq(schema.organizationPackageOverrides.id, existingOverride.id));
        } else {
          await db.insert(schema.organizationPackageOverrides)
            .values({
              organizationId: org.id,
              maxLearners,
              maxTeachers,
              maxOrgAdmins,
              monthlyCredits: proposal.creditsIncluded,
              ...priceData,
              reason: `Bulk applied from Package Proposal: ${proposal.packageName} (${proposal.tier})`,
              isActive: true,
              createdBy: userId,
              validFrom: new Date(),
            });
        }
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Failed for ${org.name}: ${(err as Error).message}`);
      }
    }
    
    console.log(`[Package Proposals] Bulk applied to ${results.success} organizations by SuperAdmin ${userId}`);
    res.json({
      success: true,
      results,
      message: `Applied to ${results.success} organizations, ${results.failed} failed`,
    });
  } catch (error) {
    console.error('Error bulk applying package proposals:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/package-calculator/profitability', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const currency = (req.query.currency as string) || 'ZAR';
    const data = await packageProposalService.getAllPackageProfitability(currency);
    res.json(data);
  } catch (error) {
    console.error('Error getting package profitability:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/package-calculator/platform-costs', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const data = await packageProposalService.getPlatformCostData();
    res.json(data);
  } catch (error) {
    console.error('Error getting platform costs:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/package-calculator/tier-comparison', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const currency = (req.query.currency as string) || 'ZAR';
    const data = await packageProposalService.getTierComparison(currency);
    res.json(data);
  } catch (error) {
    console.error('Error getting tier comparison:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/package-calculator/suggest-pricing', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { packageId, targetMargin, currency } = req.body;
    if (!packageId || targetMargin === undefined) {
      return res.status(400).json({ error: 'packageId and targetMargin are required' });
    }
    const suggestions = await packageProposalService.suggestPricing(
      packageId,
      targetMargin / 100,
      currency || 'ZAR'
    );
    res.json(suggestions);
  } catch (error) {
    console.error('Error suggesting pricing:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

const applySuggestedPricingSchema = z.object({
  packageId: z.string().min(1),
  currency: z.enum(['ZAR', 'USD', 'EUR']),
  pricePerLearner: z.number().min(0),
  pricePerTeacher: z.number().min(0),
  pricePerOrgAdmin: z.number().min(0),
});

router.post('/package-calculator/apply-suggested-pricing', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = applySuggestedPricingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }

    const { packageId, currency, pricePerLearner, pricePerTeacher, pricePerOrgAdmin } = parsed.data;
    const userId = req.session.userId!;

    await businessPackageService.upsertPackagePrice(
      {
        packageId,
        currency: currency as any,
        pricePerLearner: pricePerLearner.toString(),
        pricePerTeacher: pricePerTeacher.toString(),
        pricePerOrgAdmin: pricePerOrgAdmin.toString(),
      },
      userId
    );

    res.json({ success: true, message: 'Package prices updated successfully' });
  } catch (error) {
    console.error('Error applying suggested pricing:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// ON-PREM ENROLLMENT MANAGEMENT
// ========================================

router.get('/onprem/enrollments', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    if (!isOnPremMode()) {
      return res.status(404).json({ error: "Not available" });
    }
    const {
      status,
      search,
      startDate,
      endDate,
      organizationId,
      userRole,
      valueType,
      minPrice,
      maxPrice,
      page = '1',
      limit = '25'
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 25));
    const offset = (pageNum - 1) * limitNum;
    const minPriceNum = minPrice !== undefined && minPrice !== '' ? Number(minPrice) : null;
    const maxPriceNum = maxPrice !== undefined && maxPrice !== '' ? Number(maxPrice) : null;

    const conditions: any[] = [];

    if (status && status !== 'all') {
      conditions.push(eq(schema.coursePurchases.status, status as string));
    }

    if (startDate) {
      conditions.push(gte(schema.coursePurchases.purchasedAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(schema.coursePurchases.purchasedAt, new Date(endDate as string)));
    }
    if (organizationId) {
      conditions.push(eq(schema.courses.organizationId, organizationId as string));
    }
    if (userRole && userRole !== 'all') {
      conditions.push(sql`exists (
        select 1
        from "userOrganizationRoles" uor
        where uor."userId" = ${schema.coursePurchases.userId}
          and uor."organizationId" = ${schema.courses.organizationId}
          and uor."role" = ${userRole as string}
      )`);
    }
    if (valueType === 'zero') {
      conditions.push(sql`coalesce(${schema.coursePurchases.basePrice}, ${schema.coursePurchases.purchasePrice}, '0')::numeric = 0`);
    } else if (valueType === 'nonzero') {
      conditions.push(sql`coalesce(${schema.coursePurchases.basePrice}, ${schema.coursePurchases.purchasePrice}, '0')::numeric > 0`);
    }
    if (minPriceNum !== null && Number.isFinite(minPriceNum)) {
      conditions.push(sql`coalesce(${schema.coursePurchases.basePrice}, ${schema.coursePurchases.purchasePrice}, '0')::numeric >= ${minPriceNum}`);
    }
    if (maxPriceNum !== null && Number.isFinite(maxPriceNum)) {
      conditions.push(sql`coalesce(${schema.coursePurchases.basePrice}, ${schema.coursePurchases.purchasePrice}, '0')::numeric <= ${maxPriceNum}`);
    }

    if (search) {
      const searchTerm = `%${(search as string).toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${schema.users.gamerName}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.users.email}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.users.firstName}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.users.lastName}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.courses.title}) LIKE ${searchTerm}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const enrollmentsQuery = db
      .select({
        id: schema.coursePurchases.id,
        userId: schema.coursePurchases.userId,
        courseId: schema.coursePurchases.courseId,
        status: schema.coursePurchases.status,
        purchasePrice: schema.coursePurchases.purchasePrice,
        purchaseCurrency: schema.coursePurchases.purchaseCurrency,
        basePrice: schema.coursePurchases.basePrice,
        baseCurrency: schema.coursePurchases.baseCurrency,
        checkoutId: schema.coursePurchases.checkoutId,
        purchasedAt: schema.coursePurchases.purchasedAt,
        userName: schema.users.gamerName,
        userEmail: schema.users.email,
        userFirstName: schema.users.firstName,
        userLastName: schema.users.lastName,
        courseTitle: schema.courses.title,
        courseOrganizationId: schema.courses.organizationId,
      })
      .from(schema.coursePurchases)
      .innerJoin(schema.users, eq(schema.coursePurchases.userId, schema.users.id))
      .innerJoin(schema.courses, eq(schema.coursePurchases.courseId, schema.courses.id))
      .where(whereClause)
      .orderBy(desc(schema.coursePurchases.purchasedAt))
      .limit(limitNum)
      .offset(offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.coursePurchases)
      .innerJoin(schema.users, eq(schema.coursePurchases.userId, schema.users.id))
      .innerJoin(schema.courses, eq(schema.coursePurchases.courseId, schema.courses.id))
      .where(whereClause);

    let [enrollments, countResult] = await Promise.all([enrollmentsQuery, countQuery]);
    let total = countResult[0]?.count || 0;

    // Demo/onprem fallback:
    // Demo generation seeds userCourseEnrollments even when there are no coursePurchases.
    // If no purchase-backed rows exist, surface enrollment-backed rows so the UI has real data.
    if (total === 0) {
      const enrollmentConditions: any[] = [];

      if (startDate) {
        enrollmentConditions.push(gte(schema.userCourseEnrollments.enrolledAt, new Date(startDate as string)));
      }
      if (endDate) {
        enrollmentConditions.push(lte(schema.userCourseEnrollments.enrolledAt, new Date(endDate as string)));
      }
      if (organizationId) {
        enrollmentConditions.push(eq(schema.courses.organizationId, organizationId as string));
      }
      if (userRole && userRole !== 'all') {
        enrollmentConditions.push(sql`exists (
          select 1
          from "userOrganizationRoles" uor
          where uor."userId" = ${schema.userCourseEnrollments.userId}
            and uor."organizationId" = ${schema.courses.organizationId}
            and uor."role" = ${userRole as string}
        )`);
      }
      if (valueType === 'zero') {
        enrollmentConditions.push(sql`coalesce(${schema.courses.price}, '0')::numeric = 0`);
      } else if (valueType === 'nonzero') {
        enrollmentConditions.push(sql`coalesce(${schema.courses.price}, '0')::numeric > 0`);
      }
      if (minPriceNum !== null && Number.isFinite(minPriceNum)) {
        enrollmentConditions.push(sql`coalesce(${schema.courses.price}, '0')::numeric >= ${minPriceNum}`);
      }
      if (maxPriceNum !== null && Number.isFinite(maxPriceNum)) {
        enrollmentConditions.push(sql`coalesce(${schema.courses.price}, '0')::numeric <= ${maxPriceNum}`);
      }

      if (search) {
        const searchTerm = `%${(search as string).toLowerCase()}%`;
        enrollmentConditions.push(
          or(
            sql`LOWER(${schema.users.gamerName}) LIKE ${searchTerm}`,
            sql`LOWER(${schema.users.email}) LIKE ${searchTerm}`,
            sql`LOWER(${schema.users.firstName}) LIKE ${searchTerm}`,
            sql`LOWER(${schema.users.lastName}) LIKE ${searchTerm}`,
            sql`LOWER(${schema.courses.title}) LIKE ${searchTerm}`
          )
        );
      }

      // Enrollment fallback rows are treated as completed (non-payment tracking rows).
      if (status && status !== 'all' && status !== 'completed') {
        enrollments = [];
        total = 0;
      } else {
        const enrollmentWhere = enrollmentConditions.length > 0 ? and(...enrollmentConditions) : undefined;

        const fallbackRowsQuery = db
          .select({
            id: schema.userCourseEnrollments.id,
            userId: schema.userCourseEnrollments.userId,
            courseId: schema.userCourseEnrollments.courseId,
            enrolledAt: schema.userCourseEnrollments.enrolledAt,
            userName: schema.users.gamerName,
            userEmail: schema.users.email,
            userFirstName: schema.users.firstName,
            userLastName: schema.users.lastName,
            courseTitle: schema.courses.title,
            courseOrganizationId: schema.courses.organizationId,
            coursePrice: schema.courses.price,
            courseCurrency: schema.courses.currency,
          })
          .from(schema.userCourseEnrollments)
          .innerJoin(schema.users, eq(schema.userCourseEnrollments.userId, schema.users.id))
          .innerJoin(schema.courses, eq(schema.userCourseEnrollments.courseId, schema.courses.id))
          .where(enrollmentWhere)
          .orderBy(desc(schema.userCourseEnrollments.enrolledAt))
          .limit(limitNum)
          .offset(offset);

        const fallbackCountQuery = db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.userCourseEnrollments)
          .innerJoin(schema.users, eq(schema.userCourseEnrollments.userId, schema.users.id))
          .innerJoin(schema.courses, eq(schema.userCourseEnrollments.courseId, schema.courses.id))
          .where(enrollmentWhere);

        const [fallbackRows, fallbackCountRows] = await Promise.all([fallbackRowsQuery, fallbackCountQuery]);
        total = fallbackCountRows[0]?.count || 0;

        enrollments = fallbackRows.map((r) => ({
          id: `enr-${r.id}`,
          userId: r.userId,
          courseId: r.courseId,
          status: 'completed',
          purchasePrice: r.coursePrice || '0',
          purchaseCurrency: r.courseCurrency || 'ZAR',
          basePrice: r.coursePrice || '0',
          baseCurrency: r.courseCurrency || 'ZAR',
          checkoutId: null,
          purchasedAt: r.enrolledAt,
          userName: r.userName,
          userEmail: r.userEmail,
          userFirstName: r.userFirstName,
          userLastName: r.userLastName,
          courseTitle: r.courseTitle,
          courseOrganizationId: r.courseOrganizationId,
        })) as any[];
      }
    }

    const userIds = [...new Set(enrollments.map(e => e.userId))];
    const orgIds = [...new Set(enrollments.map(e => e.courseOrganizationId))];

    let orgRolesMap: Record<string, any> = {};
    let orgsMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const userOrgRoles = await db
        .select({
          userId: schema.userOrganizationRoles.userId,
          organizationId: schema.userOrganizationRoles.organizationId,
          role: schema.userOrganizationRoles.role,
        })
        .from(schema.userOrganizationRoles)
        .where(inArray(schema.userOrganizationRoles.userId, userIds));

      for (const r of userOrgRoles) {
        if (!orgRolesMap[r.userId]) {
          orgRolesMap[r.userId] = r;
        }
      }
    }

    if (orgIds.length > 0) {
      const orgs = await db
        .select({ id: schema.organizations.id, name: schema.organizations.name })
        .from(schema.organizations)
        .where(inArray(schema.organizations.id, orgIds));
      for (const o of orgs) {
        orgsMap[o.id] = o.name;
      }
    }

    const enrichedEnrollments = enrollments.map(e => ({
      id: e.id,
      userId: e.userId,
      courseId: e.courseId,
      status: e.status,
      purchasePrice: e.basePrice || e.purchasePrice,
      purchaseCurrency: e.baseCurrency || e.purchaseCurrency,
      checkoutId: e.checkoutId,
      purchasedAt: e.purchasedAt,
      userName: [e.userFirstName, e.userLastName].filter(Boolean).join(' ') || e.userName,
      userEmail: e.userEmail,
      courseTitle: e.courseTitle,
      organizationName: orgsMap[e.courseOrganizationId] || 'Unknown',
      userRole: orgRolesMap[e.userId]?.role || null,
    }));

    res.json({
      enrollments: enrichedEnrollments,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('[OnPrem Enrollments] Error fetching enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

router.patch('/onprem/enrollments/:id/mark-paid', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    if (!isOnPremMode()) {
      return res.status(404).json({ error: "Not available" });
    }
    const { id } = req.params;

    const [purchase] = await db
      .select()
      .from(schema.coursePurchases)
      .where(eq(schema.coursePurchases.id, id))
      .limit(1);

    if (!purchase) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (purchase.status === 'completed') {
      return res.status(400).json({ error: 'Enrollment is already marked as completed' });
    }

    const [updated] = await db
      .update(schema.coursePurchases)
      .set({ status: 'completed' })
      .where(eq(schema.coursePurchases.id, id))
      .returning();

    console.log(`[OnPrem Enrollments] Enrollment ${id} marked as paid by user ${req.session.userId}`);

    res.json({ success: true, enrollment: updated });
  } catch (error) {
    console.error('[OnPrem Enrollments] Error marking enrollment as paid:', error);
    res.status(500).json({ error: 'Failed to mark enrollment as paid' });
  }
});

router.get('/onprem/enrollments/filter-options', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    if (!isOnPremMode()) {
      return res.status(404).json({ error: "Not available" });
    }

    const [orgRows, roleRows] = await Promise.all([
      db
        .select({
          id: schema.organizations.id,
          name: schema.organizations.name,
        })
        .from(schema.organizations)
        .orderBy(schema.organizations.name),
      db
        .selectDistinct({
          role: schema.userOrganizationRoles.role,
        })
        .from(schema.userOrganizationRoles)
        .where(
          inArray(schema.userOrganizationRoles.role, [
            'learner',
            'student',
            'trainer',
            'teamlead',
            'org_admin',
            'cust_super',
            'custsuper',
            'superadmin',
          ])
        ),
    ]);

    const roles = roleRows
      .map((r) => r.role)
      .filter((role): role is string => !!role)
      .sort((a, b) => a.localeCompare(b));

    res.json({
      organizations: orgRows,
      roles,
    });
  } catch (error) {
    console.error('[OnPrem Enrollments] Error loading filter options:', error);
    res.status(500).json({ error: 'Failed to load enrollment filter options' });
  }
});

// ========================================
// PPTX TO HTML BATCH CONVERSION
// ========================================

router.post('/convert-existing-pptx', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { isOnPremMode } = await import('../featureFlags');
    if (!isOnPremMode()) {
      return res.status(400).json({ error: 'This endpoint is only available on on-premises deployments' });
    }

    const { PptxHtmlConverterService } = await import('../services/pptxHtmlConverterService');
    
    const libreOfficeAvailable = await PptxHtmlConverterService.checkLibreOfficeAvailable();
    if (!libreOfficeAvailable) {
      return res.status(400).json({ error: 'LibreOffice is not installed. Please run install-deps.sh first.' });
    }

    // Get all lessons with PPTX files
    const lessonsWithPptx = await db
      .select({ id: schema.lessons.id, storageKey: schema.lessons.storageKey, title: schema.lessons.title })
      .from(schema.lessons)
      .where(sql`${schema.lessons.storageKey} IS NOT NULL AND ${schema.lessons.storageKey} != ''`);

    let totalFound = lessonsWithPptx.length;
    let alreadyConverted = 0;
    let queued = 0;
    let failed = 0;
    const errors: string[] = [];

    const needsConversion: Array<{ id: string; storageKey: string; title: string }> = [];
    for (const lesson of lessonsWithPptx) {
      if (!lesson.storageKey) continue;
      const slideCheck = await PptxHtmlConverterService.slideImagesExist(lesson.storageKey);
      if (slideCheck.exists) {
        alreadyConverted++;
      } else {
        needsConversion.push({ id: lesson.id, storageKey: lesson.storageKey!, title: lesson.title });
      }
    }

    // Return immediately with the plan, start conversions in background
    const toConvert = needsConversion.length;
    
    // Start batch conversion in background with throttled concurrency
    if (toConvert > 0) {
      (async () => {
        const concurrency = 2;
        for (let i = 0; i < needsConversion.length; i += concurrency) {
          const batch = needsConversion.slice(i, i + concurrency);
          const results = await Promise.allSettled(
            batch.map(async (lesson) => {
              console.log(`[BatchConvert] Converting: ${lesson.title} (${lesson.storageKey})`);
              return PptxHtmlConverterService.convertPptxToSlides(lesson.storageKey);
            })
          );
          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const lesson = batch[j];
            if (result.status === 'fulfilled' && result.value.success) {
              console.log(`[BatchConvert] ✅ Converted: ${lesson.title}`);
            } else {
              const error = result.status === 'rejected' ? result.reason?.message : result.value?.error;
              console.error(`[BatchConvert] ❌ Failed: ${lesson.title} - ${error}`);
            }
          }
        }
        console.log(`[BatchConvert] Batch conversion complete.`);
      })().catch(err => console.error('[BatchConvert] Batch conversion error:', err));
    }

    res.json({
      success: true,
      totalPptxFound: totalFound,
      alreadyConverted,
      queuedForConversion: toConvert,
      message: toConvert > 0 
        ? `Started background conversion of ${toConvert} presentations. Check server logs for progress.`
        : 'All presentations already have HTML versions.',
    });
  } catch (error: any) {
    console.error('[BatchConvert] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to start batch conversion' });
  }
});

router.get("/interorg-rules", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const access = await getInterOrgAccessContext(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const whereClauses: any[] = [];
    if (!access.isTopRole) {
      whereClauses.push(eq(interOrgCourseAssignmentRules.sourceOrganizationId, access.activeOrgId!));
    }

    const rulesQuery = db
      .select({
        id: interOrgCourseAssignmentRules.id,
        sourceOrganizationId: interOrgCourseAssignmentRules.sourceOrganizationId,
        targetOrganizationId: interOrgCourseAssignmentRules.targetOrganizationId,
        enabled: interOrgCourseAssignmentRules.enabled,
        createdBy: interOrgCourseAssignmentRules.createdBy,
        createdAt: interOrgCourseAssignmentRules.createdAt,
        sourceOrgName: sql<string>`source_org."name"`,
        targetOrgName: sql<string>`target_org."name"`,
      })
      .from(interOrgCourseAssignmentRules)
      .innerJoin(sql`"organizations" AS source_org`, sql`source_org."id" = ${interOrgCourseAssignmentRules.sourceOrganizationId}`)
      .innerJoin(sql`"organizations" AS target_org`, sql`target_org."id" = ${interOrgCourseAssignmentRules.targetOrganizationId}`);

    const rules = whereClauses.length > 0 ? await rulesQuery.where(and(...whereClauses)) : await rulesQuery;

    res.json(rules);
  } catch (error) {
    console.error("Error fetching inter-org rules:", error);
    res.status(500).json({ error: "Failed to fetch inter-org rules" });
  }
});

router.get("/interorg-shared-courses", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const access = await getInterOrgAccessContext(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const sourceOrganizationId = typeof req.query.sourceOrganizationId === "string" ? req.query.sourceOrganizationId : undefined;
    const targetOrganizationId = typeof req.query.targetOrganizationId === "string" ? req.query.targetOrganizationId : undefined;

    const whereClauses = [
      sql`${schema.courseAssignments.targetOrganizationId} IS NOT NULL`,
    ];

    if (sourceOrganizationId) {
      whereClauses.push(eq(schema.courseAssignments.organizationId, sourceOrganizationId));
    }

    if (targetOrganizationId) {
      whereClauses.push(eq(schema.courseAssignments.targetOrganizationId, targetOrganizationId));
    }

    if (!access.isTopRole) {
      whereClauses.push(eq(schema.courseAssignments.organizationId, access.activeOrgId!));
    }

    const assignments = await db
      .select({
        assignmentId: schema.courseAssignments.id,
        courseId: schema.courseAssignments.courseId,
        courseTitle: schema.courses.title,
        sourceOrganizationId: schema.courseAssignments.organizationId,
        targetOrganizationId: schema.courseAssignments.targetOrganizationId,
        sourceOrgName: sql<string>`source_org."name"`,
        targetOrgName: sql<string>`target_org."name"`,
        audience: schema.courseAssignments.audience,
        assignmentScope: schema.courseAssignments.assignmentScope,
        mandatory: schema.courseAssignments.mandatory,
        dueDate: schema.courseAssignments.dueDate,
        assignedAt: schema.courseAssignments.assignedAt,
      })
      .from(schema.courseAssignments)
      .innerJoin(schema.courses, eq(schema.courseAssignments.courseId, schema.courses.id))
      .innerJoin(sql`"organizations" AS source_org`, sql`source_org."id" = ${schema.courseAssignments.organizationId}`)
      .innerJoin(sql`"organizations" AS target_org`, sql`target_org."id" = ${schema.courseAssignments.targetOrganizationId}`)
      .where(and(...whereClauses))
      .orderBy(desc(schema.courseAssignments.assignedAt))
      .limit(1000);

    res.json(assignments);
  } catch (error) {
    console.error("Error fetching inter-org shared courses:", error);
    res.status(500).json({ error: "Failed to fetch inter-org shared courses" });
  }
});

router.post("/interorg-rules", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const access = await getInterOrgAccessContext(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const { sourceOrganizationId, targetOrganizationId } = req.body;

    if (!access.isTopRole && sourceOrganizationId !== access.activeOrgId) {
      return res.status(403).json({ error: "Access denied: You can only manage rules owned by your active organization" });
    }

    if (sourceOrganizationId === targetOrganizationId) {
      return res.status(400).json({ error: "Source and target organizations must be different" });
    }

    const [sourceOrg] = await db.select().from(organizations).where(eq(organizations.id, sourceOrganizationId));
    const [targetOrg] = await db.select().from(organizations).where(eq(organizations.id, targetOrganizationId));

    if (!sourceOrg || !targetOrg) {
      return res.status(404).json({ error: "One or both organizations not found" });
    }

    const parseResult = insertInterOrgCourseAssignmentRuleSchema.safeParse({
      sourceOrganizationId,
      targetOrganizationId,
      createdBy: req.session.userId,
    });

    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
    }

    const [rule] = await db.insert(interOrgCourseAssignmentRules).values(parseResult.data).returning();
    res.status(201).json(rule);
  } catch (error) {
    console.error("Error creating inter-org rule:", error);
    res.status(500).json({ error: "Failed to create inter-org rule" });
  }
});

router.patch("/interorg-rules/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const access = await getInterOrgAccessContext(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    if (!access.isTopRole) {
      const [existing] = await db
        .select({
          id: interOrgCourseAssignmentRules.id,
          sourceOrganizationId: interOrgCourseAssignmentRules.sourceOrganizationId,
        })
        .from(interOrgCourseAssignmentRules)
        .where(eq(interOrgCourseAssignmentRules.id, id))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Rule not found" });
      }
      if (existing.sourceOrganizationId !== access.activeOrgId) {
        return res.status(403).json({ error: "Access denied: You can only update rules owned by your active organization" });
      }
    }

    const [updated] = await db.update(interOrgCourseAssignmentRules)
      .set({ enabled })
      .where(eq(interOrgCourseAssignmentRules.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Rule not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating inter-org rule:", error);
    res.status(500).json({ error: "Failed to update inter-org rule" });
  }
});

router.delete("/interorg-rules/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const access = await getInterOrgAccessContext(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const { id } = req.params;

    if (!access.isTopRole) {
      const [existing] = await db
        .select({
          id: interOrgCourseAssignmentRules.id,
          sourceOrganizationId: interOrgCourseAssignmentRules.sourceOrganizationId,
        })
        .from(interOrgCourseAssignmentRules)
        .where(eq(interOrgCourseAssignmentRules.id, id))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Rule not found" });
      }
      if (existing.sourceOrganizationId !== access.activeOrgId) {
        return res.status(403).json({ error: "Access denied: You can only delete rules owned by your active organization" });
      }
    }

    const result = await db
      .delete(interOrgCourseAssignmentRules)
      .where(eq(interOrgCourseAssignmentRules.id, id))
      .returning({ id: interOrgCourseAssignmentRules.id });

    if (result.length === 0) {
      return res.status(404).json({ error: "Rule not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting inter-org rule:", error);
    res.status(500).json({ error: "Failed to delete inter-org rule" });
  }
});

// ========================================
// EXPORT REGISTER FUNCTION
// ========================================

export function registerAdminRoutes(app: any) {
  app.use('/api/admin', router);
}

export { router };
