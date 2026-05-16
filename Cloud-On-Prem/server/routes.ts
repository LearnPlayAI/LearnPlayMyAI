// @ts-nocheck
import type { Express, Request, Response } from "express";
import express from "express";
import { getBaseUrl } from './config/base-url';
import { createServer, type Server } from "http";
import { randomUUID, createHmac, timingSafeEqual, createHash } from "crypto";
import { Server as SocketIOServer } from "socket.io";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import { createPublicRouter, registerPublicStandaloneRoutes } from "./routes/public";
import { registerPlatformRevenueRoutes } from "./routes/platformRevenue";
import { registerBrandingRoutes } from "./brandingRoutes";
import { registerCourseFrameworkRoutes } from "./routes/courseFrameworkRoutes";
import { configureSession, optionalAuth, getEffectiveOrganizationId } from "./routes/shared";
// === NEW DOMAIN ROUTERS (Routes Refactoring) ===
import { createMiscRouter } from "./routes/miscRoutes";
import { createAuthRouter } from "./routes/authRoutes";
import { createAIRouter } from "./routes/aiRoutes";
import { registerGamificationRoutes } from "./routes/gamificationRoutes";
import { registerReportRoutes } from "./routes/reportRoutes";
import { registerOrgRoutes } from "./routes/orgRoutes";
import { registerPaymentsRoutes } from "./routes/paymentsRoutes";
import { registerQuizRoutes } from "./routes/quizRoutes";
import { registerCourseRoutes } from "./routes/courseRoutes";
import { registerSuperAdminRoutes } from "./routes/superAdminRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";
import { createGameRouter } from "./routes/gameRoutes";
import { registerOrgSalesRoutes } from "./routes/orgSalesRoutes";
import { registerLanguageRoutes } from "./routes/languageRoutes";
import { createEnterpriseAuthRouter } from "./routes/enterpriseAuthRoutes";
import { registerEnterprisePortalRoutes } from "./routes/enterprisePortalRoutes";
import { registerEnterpriseSuperAdminRoutes } from "./routes/enterpriseSuperAdminRoutes";
import { registerOnpremLicenseRoutes } from "./routes/onpremLicenseRoutes";
import { registerEnterpriseRevenueRoutes } from "./routes/enterpriseRevenueRoutes";
import { registerDemoDataRoutes } from "./routes/demoDataRoutes";
import { registerSourceIntelligenceRoutes } from "./routes/sourceIntelligenceRoutes";
// === END NEW DOMAIN ROUTERS ===
import axios from "axios";
import { 
  parseGammaSlidesRaw, 
  parseGammaSlides, 
  validateGammaContent,
  createLearningAssetContract,
  type ParsedSlide,
} from "@shared/contentParsers";
import { storage, LEARNER_ROLES, INSTRUCTOR_ROLES, ADMIN_ROLES, ALL_STAFF_ROLES } from "./storage";
import { ObjectStorageService, parseObjectPath, objectStorageClient, registerUploadRoutes } from "./objectStorage";
import { buildCanonicalStorageKey } from "./utils/storageKeyManager";
import { isAdmin, isSuperAdmin, isSuperAdminOrCustSuper } from "./adminAuth";
import { isTeacherOrAdmin, validateJoinRequestAccess } from "./tenantMiddleware";
import { AIService } from "./ai/aiService";
import { GoogleGenAI } from "@google/genai";
import { LessonService } from "./services/lessonService";
import { JobQueueService } from "./services/jobQueueService";
import { CreditService } from "./services/creditService";
import { CertificateService } from "./services/certificateService";
import { CourseCompletionService } from "./services/courseCompletionService";
import { LessonProgressService } from "./services/lessonProgressService";
import { LessonVersioningService } from "./services/lessonVersioningService";
import { GammaService, type GammaTheme } from "./services/gammaService";
import { GammaThemeSyncService } from "./services/gammaThemeSyncService";
import { GammaImageStyleService } from "./services/gammaImageStyleService";
import { DocumentExtractorService } from "./services/documentExtractor";
import { CurrencyService } from "./services/currencyService";
import { CourseService } from "./services/courseService";
import { CourseLessonService } from "./services/courseLessonService";
import { CourseVisibilityService } from "./services/courseVisibilityService";
import { CourseAssignmentService } from "./services/courseAssignmentService";
import { VersionService } from "./services/versionService";
import { PurchaseService } from "./services/purchaseService";
import { PaymentService } from "./services/paymentService";
import { PaymentRouter } from "./services/paymentRouter";
import { PayoutService } from "./services/payoutService";
import { ReviewService } from "./services/reviewService";
import { AnalyticsService } from "./services/analyticsService";
import { MailerSendService } from "./services/mailerSendService";
import { WebhookReplayProtection } from "./services/webhookReplayProtection";
import { verifyYocoWebhook } from "./services/yocoWebhookVerifier";
import { PasswordResetService, PasswordResetRateLimiter } from "./services/passwordResetService";
import { quizPricingService } from "./services/quizPricingService";
import { thumbnailPricingService } from "./services/thumbnailPricingService";
import { healthReportPricingService } from "./services/healthReportPricingService";
import { ContentCoachService } from "./services/contentCoachService";
import { courseThumbnailAIService, ThumbnailGenerationError } from "./services/courseThumbnailAIService";
import { PlatformCostService } from "./services/platformCostService";
import { LpcSpendService } from "./services/lpcSpendService";
import { LpcRevenueService } from "./services/lpcRevenueService";
import { QUIZ_TIERS } from "@shared/creditConstants";
import { EmailVerificationService } from "./services/emailVerificationService";
import { PaymentOrchestratorService } from "./services/paymentOrchestratorService";
import { UnifiedCreditService } from "./services/unifiedCreditService";
import { OrganizationCreditService, InsufficientOrgCreditsError, UnauthorizedOrgCreditSpendError } from "./services/organizationCreditService";
import { InvoiceService } from "./services/invoiceService";
import { HybridCreditService, InsufficientHybridCreditsError } from "./services/hybridCreditService";
import { SessionContextService } from "./services/sessionContextService";
import { SessionInvalidationService } from "./services/sessionInvalidationService";
import { JoinRequestApprovalService } from "./services/joinRequestApprovalService";
import { lessonOrchestrationService } from "./services/lessonOrchestrationService";
import { CourseContextService } from "./services/courseContextService";
import { sendError, ErrorCode } from "./utils/errorResponses";
import { isFeatureEnabled, logFeatureFlags, isQuizCreditChargingEnabled, isAIThumbnailsEnabled } from "./featureFlags";
import { InsufficientCreditsError } from "./services/creditService";
import { getAuthQueryMetrics, getAuthContextBreakdown, resetAuthMetrics } from "./monitoring/authQueryTracker";
import { getSessionHealthMetrics, resetSessionHealthMetrics, getSessionHealthSummary } from "./monitoring/sessionHealthMonitor";
import { canonicalizeTimezone, getSystemTimezone, isValidIanaTimezone, resolveEffectiveTimezone } from "./utils/timezone";
import { resolveEffectiveLocale } from "./utils/effectiveLocale";
import { 
  withOrgContext, 
  requireRole, 
  requireSubscription,
  withSessionAuthMiddleware,
  resolveEffectiveOrganization,
  type RequestWithOrgContext,
  type RequestWithEffectiveOrg
} from "./middleware/sessionAuthMiddleware";
import { enforceOrgIsolation, enforceOrgIsolationWithSuperAdminBypass } from "./middleware/orgIsolationMiddleware";
import { 
  insertAiConfigSchema, 
  insertQuizDraftSchema, 
  insertSalesInquirySchema, 
  updateSalesInquiryStatusSchema, 
  activeQuizGames, 
  insertOrganizationSchema,
  purchasePowerUpSchema,
  activatePowerUpSchema,
  purchaseCosmeticSchema,
  equipCosmeticSchema,
  unequipCosmeticSchema,
  claimChallengeRewardSchema,
  purchaseSeasonPassSchema,
  insertGamificationEconomyRuleSchema,
  insertShopItemPricingSchema,
  insertAdminChallengeConfigSchema,
  insertSeasonPassConfigSchema,
  insertCoinAdjustmentSchema,
  unlinkLessonParamsSchema,
  relinkLessonParamsSchema,
  relinkLessonBodySchema,
  relinkableLessonsParamsSchema,
  insertCourseAssignmentSchema
} from "@shared/schema";
import * as schema from "@shared/schema";
import { 
  registerUserSchema, 
  loginUserSchema, 
  updateProfileSchema,
  updateAvatarSchema,
  insertCardCollectionSchema,
  insertCardSchema,
  insertCollectionStatTypeSchema,
  insertUniversalStatUnitSchema,
  insertGameRoomSchema,
  insertPlayerSessionSchema,
  users,
  leaderBoard,
  userOrganizationRoles,
  userOrganizationAssignments,
  organizationUnits,
  organizationSubUnits,
  organizations,
  quizCollections,
  quizCollectionAssignments,
  quizGameProgress,
  userQuizProgress,
  quizGameResults,
  gameResults,
  unitSubjects,
  subjects,
  seasonPassConfig,
  adminChallengeConfig,
  lessonQuizLinks,
  lessons,
  lessonScopeAssignments,
  lpCreditLedger,
  type RegisterUser, 
  type LoginUser,
  type UpdateProfile,
  type UpdateAvatar,
  type PlayerXPChanges
} from "@shared/schema";
import { z } from "zod";
import { GameEngine } from "./gameEngine";
import { eq, or, and, sql, inArray, desc, isNull, lte, gte } from "drizzle-orm";
import { db, pool, sessionPool } from "./db";
import bcrypt from "bcrypt";
import { generateOrgCode, generateGradeCode, generateClassCode, extractGradeNumber, getNextClassLetter } from "./utils/joinCodeGenerator";
import { OrganizationBankingBridgeService } from "./services/organizationBankingBridgeService";
import { checkQuizCreationLimit, checkAIExplanationLimit, checkConcurrentUserLimit, trackUserLogin, trackUserLogout, resetDailyLimitsForAllOrgs } from "./usageLimitMiddleware";
import { gamificationService } from "./gamificationService";
import { BUSINESS_DEPARTMENTS } from "@shared/businessConstants";

// Game engine instance
const gameEngine = new GameEngine();
const contentCoachService = new ContentCoachService();

// ===== SECURITY HELPERS =====
/**
 * Mask email address for safe logging (PII protection)
 * Transforms "user@example.com" to "u***@e***.com"
 */
function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '[INVALID_EMAIL]';
  const parts = email.split('@');
  if (parts.length !== 2) return '[INVALID_EMAIL]';
  const [local, domain] = parts;
  const domainParts = domain.split('.');
  const maskedLocal = local.length > 1 ? local[0] + '***' : '***';
  const maskedDomain = domainParts[0].length > 1 
    ? domainParts[0][0] + '***' + '.' + domainParts.slice(1).join('.')
    : '***.' + domainParts.slice(1).join('.');
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Sanitize request body for safe logging (remove sensitive fields)
 */
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key', 'creditCard', 'ssn', 'accessToken', 'refreshToken'];
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (key.toLowerCase().includes('email') && typeof value === 'string') {
      sanitized[key] = maskEmail(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Lesson credit costs cache for public endpoint
let lessonCreditCostsCache: {
  creditsPerLessonTextOnlyMin: number;
  creditsPerLessonTextOnlyMax: number;
  creditsPerLessonWithImagesMin: number;
  creditsPerLessonWithImagesMax: number;
} | null = null;
let lessonCreditCostsCacheTime = 0;

// Extend session types (kept for module augmentation)
declare module "express-session" {
  interface SessionData {
    userId?: string;
    user?: any;
    anonymousUserId?: string;
  }
}

// ===== SHARED MIDDLEWARE =====
// configureSession, optionalAuth imported from server/routes/shared.ts
// All routes migrated to withSessionAuthMiddleware from server/middleware/sessionAuthMiddleware.ts
// This enables cached session context for ~70-80% reduction in auth-related DB queries

// Organization access middleware - ensures user belongs to the organization
// Uses resolveEffectiveOrganization to properly handle SuperAdmin impersonation
async function requireOrgAccess(req: Request, res: Response, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Resolve the effective organization (handles impersonation)
  const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  
  // Cache on request for downstream use
  (req as RequestWithEffectiveOrg).effectiveOrganization = effectiveResult;
  
  // Get organizationId from params, query, or body
  const requestedOrgId = req.params.orgId || req.query.organizationId || req.body?.organizationId;
  
  // Fast path: Use session context if available
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
    const { effectiveRole, organizations } = req.session.context;
    
    // SuperAdmin WITHOUT impersonation can access ANY organization
    if (effectiveRole === 'SuperAdmin' && !effectiveResult.isImpersonation) {
      return next();
    }
    
    // SuperAdmin WITH impersonation: treated as if they belong to the impersonated org
    if (effectiveRole === 'SuperAdmin' && effectiveResult.isImpersonation) {
      // If no orgId in request, allow access (impersonated org is the context)
      if (!requestedOrgId) {
        return next();
      }
      // If requested org matches impersonated org, allow access
      if (requestedOrgId === effectiveResult.organizationId) {
        return next();
      }
      // Cross-org access denied for impersonating SuperAdmin
      return res.status(403).json({ error: "Access denied: You are impersonating a different organization" });
    }
    
    // Regular users: only allow access to their EFFECTIVE org (not any org they belong to)
    if (!effectiveResult.organizationId) {
      return res.status(403).json({ error: "No organization context" });
    }
    
    // If route specifies an org, it must match the effective org
    if (requestedOrgId && requestedOrgId !== effectiveResult.organizationId) {
      console.log(`[OrgAccess] Blocked: User ${req.session.userId} tried to access org ${requestedOrgId} but effective org is ${effectiveResult.organizationId}`);
      return res.status(403).json({ error: "Access denied: Cross-organization access not permitted" });
    }
    
    return next();
  }
  
  // Fallback: Database lookup (for when session context is not available)
  const user = await storage.getUser(req.session.userId);
  const isImpersonating = !!req.session.context?.impersonatedOrganization;
  if (user?.isSuperAdmin && !isImpersonating) {
    return next();
  }
  
  // For regular users in fallback path: use resolved effective org
  if (!effectiveResult.organizationId) {
    return res.status(403).json({ error: "No organization context" });
  }
  
  // If route specifies an org, it must match the effective org
  if (requestedOrgId && requestedOrgId !== effectiveResult.organizationId) {
    console.log(`[OrgAccess] Blocked (fallback): User ${req.session.userId} tried to access org ${requestedOrgId} but effective org is ${effectiveResult.organizationId}`);
    return res.status(403).json({ error: "Access denied: Cross-organization access not permitted" });
  }
  
  // Verify user actually has roles in the effective organization
  const userRoles = await storage.getUserRoles(req.session.userId, effectiveResult.organizationId);
  
  if (userRoles.length === 0) {
    return res.status(403).json({ error: "Access denied: You do not belong to this organization" });
  }
  
  next();
}

// Helper functions for organization ownership validation
// Note: These helpers can use session context when available for performance
async function getUserOrganizationIds(userId: string, session?: any): Promise<string[]> {
  // Fast path: Use session context if available
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    const hasPlatformWideAccess = effectiveRole === 'SuperAdmin';

    if (hasPlatformWideAccess && impersonatedOrganization?.orgId) {
      return [impersonatedOrganization.orgId];
    }

    return organizations.map((org: any) => org.orgId);
  }
  
  // Fallback: Database lookup
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
  // Fast path: Use session context if available
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    
    // SuperAdmin WITHOUT impersonation can access ANY organization
    if (effectiveRole === 'SuperAdmin' && !impersonatedOrganization) {
      return true;
    }
    
    // SuperAdmin WITH impersonation: only access the impersonated org
    if (effectiveRole === 'SuperAdmin' && impersonatedOrganization) {
      return impersonatedOrganization.orgId === organizationId;
    }
    
    // Regular users: use provided resolvedEffectiveOrgId if available (honors X-Organization-Context header)
    let effectiveOrgId = resolvedEffectiveOrgId;
    if (!effectiveOrgId) {
      const primaryOrg = session.context.primaryOrganization;
      effectiveOrgId = primaryOrg?.orgId || (organizations.length === 1 ? organizations[0].orgId : null);
    }
    
    if (!effectiveOrgId) {
      return false; // No effective org context
    }
    
    return organizationId === effectiveOrgId;
  }
  
  // Fallback: Database lookup - for regular users, only allow access to primary org
  const user = await storage.getUser(userId);
  if (user?.isSuperAdmin) return true;
  
  const userRoles = await storage.getUserRoles(userId);
  if (userRoles.length === 0) return false;
  
  // Use first role's org as effective org (primary org)
  const effectiveOrgId = userRoles[0].organizationId;
  return organizationId === effectiveOrgId;
}

async function canAccessInvoicePDF(userId: string, invoiceId: string, session?: any): Promise<boolean> {
  // Fast path for SuperAdmin via session context
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, impersonatedOrganization } = session.context;
    if ((effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && !impersonatedOrganization) {
      return true;
    }
  } else {
    const user = await storage.getUser(userId);
    if (user?.isSuperAdmin || user?.isCustSuper) return true;
  }

  const [invoice] = await db
    .select()
    .from(schema.subscriptionInvoices)
    .where(eq(schema.subscriptionInvoices.id, invoiceId))
    .limit(1);

  if (!invoice) return false;

  const [subscription] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, invoice.subscriptionId))
    .limit(1);

  if (!subscription) return false;

  if (subscription.targetType === 'organization') {
    return await canAccessOrganization(userId, subscription.targetId, session);
  } else {
    return subscription.targetId === userId;
  }
}

async function canAccessReceiptPDF(userId: string, receiptId: string, session?: any): Promise<boolean> {
  // Fast path for SuperAdmin via session context
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, impersonatedOrganization } = session.context;
    if ((effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && !impersonatedOrganization) {
      return true;
    }
  } else {
    const user = await storage.getUser(userId);
    if (user?.isSuperAdmin || user?.isCustSuper) return true;
  }

  const [receipt] = await db
    .select()
    .from(schema.creditOrders)
    .where(eq(schema.creditOrders.id, receiptId))
    .limit(1);

  if (!receipt) return false;

  if (receipt.purchaserId === userId) return true;

  if (receipt.organizationId) {
    return await canAccessOrganization(userId, receipt.organizationId, session);
  }

  return false;
}

async function validateOrgOwnership(userId: string, organizationId: string | null | undefined, session?: any): Promise<{ allowed: boolean; isSuperAdmin: boolean }> {
  // Fast path: Use session context if available
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    const isTopAdmin = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';
    
    if (isTopAdmin && !impersonatedOrganization) {
      return { allowed: true, isSuperAdmin: true };
    }

    if (isTopAdmin && impersonatedOrganization) {
      const allowed = !!organizationId && impersonatedOrganization.orgId === organizationId;
      return { allowed, isSuperAdmin: true };
    }
    
    if (!organizationId) {
      return { allowed: false, isSuperAdmin: false };
    }
    
    const hasAccess = organizations.some((org: any) => org.orgId === organizationId);
    return { allowed: hasAccess, isSuperAdmin: false };
  }
  
  // Fallback: Database lookup
  const user = await storage.getUser(userId);
  const isSuperAdmin = user?.isSuperAdmin || user?.isCustSuper || false;
  
  if (isSuperAdmin) {
    return { allowed: true, isSuperAdmin: true };
  }
  
  if (!organizationId) {
    return { allowed: false, isSuperAdmin: false };
  }
  
  const userOrgIds = await getUserOrganizationIds(userId);
  return { allowed: userOrgIds.includes(organizationId), isSuperAdmin: false };
}

// CRITICAL FIX #4: Quiz organization access control helper
async function loadQuizForRequest(req: Request, res: Response, quizId: string): Promise<any | null> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  // Determine SuperAdmin status via session context or database
  let isSuperAdminBypass = false;
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
    const { effectiveRole, impersonatedOrganization } = req.session.context;
    isSuperAdminBypass = (effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && !impersonatedOrganization;
  } else {
    const user = await storage.getUser(req.session.userId);
    isSuperAdminBypass = user?.isSuperAdmin || user?.isCustSuper || false;
  }

  // Fetch quiz
  const quiz = await storage.getQuizCollection(quizId);
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return null;
  }

  // Validate user has access to quiz's organization
  if (!isSuperAdminBypass && quiz.organizationId) {
    // Get resolved effective org ID (honors X-Organization-Context header for multi-org users)
    const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
    const hasAccess = await canAccessOrganization(req.session.userId, quiz.organizationId, req.session, resolvedEffectiveOrgId);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied: You do not have access to this quiz's organization" });
      return null;
    }
  }

  return quiz;
}

// Middleware: Require quiz organization access (for routes with :quizId param)
async function requireQuizOrgAccess(req: Request, res: Response, next: any) {
  const quizId = req.params.quizId;
  if (!quizId) {
    return res.status(400).json({ error: "Quiz ID required" });
  }

  const quiz = await loadQuizForRequest(req, res, quizId);
  if (!quiz) {
    // Response already sent by loadQuizForRequest
    return;
  }

  // Store quiz in request for downstream handlers
  (req as any).quiz = quiz;
  next();
}

// Helper function: Check if user can use Gamma API based on organization status and user role
async function canUseGammaAPI(userId: string, organizationId: string, session?: any): Promise<{ allowed: boolean; message?: string }> {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return { allowed: false, message: "Organization not found" };
  }

  // Allowed roles: org_admin, teacher, team_lead
  const allowedRoles = ['org_admin', 'teacher', 'team_lead'];
  let hasAllowedRole = false;
  let userRoles: any[] = [];

  // Fast path: Use session context if available
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const orgContext = session.context.organizations.find((o: any) => o.orgId === organizationId);
    
    if (!orgContext) {
      return { allowed: false, message: "You are not a member of this organization" };
    }
    
    hasAllowedRole = orgContext.roles.some((role: string) => allowedRoles.includes(role));
    // For trial org checks below, we need userRoles from DB for trialGammaUserId comparison
    if (org.subscriptionStatus === 'trial') {
      userRoles = await db
        .select()
        .from(schema.userOrganizationRoles)
        .where(
          and(
            eq(schema.userOrganizationRoles.userId, userId),
            eq(schema.userOrganizationRoles.organizationId, organizationId)
          )
        );
    }
  } else {
    // Fallback: Check user's role in the organization via database
    userRoles = await db
      .select()
      .from(schema.userOrganizationRoles)
      .where(
        and(
          eq(schema.userOrganizationRoles.userId, userId),
          eq(schema.userOrganizationRoles.organizationId, organizationId)
        )
      );

    if (userRoles.length === 0) {
      return { allowed: false, message: "You are not a member of this organization" };
    }
    
    hasAllowedRole = userRoles.some(r => allowedRoles.includes(r.role));
  }

  if (!hasAllowedRole) {
    return {
      allowed: false,
      message: "Only administrators, teachers, and team leads can create lessons using the Gamma API"
    };
  }

  // For NON-trial orgs: admins, teachers, and team leads can use Gamma API (credits will be charged)
  if (org.subscriptionStatus !== 'trial') {
    return { allowed: true };
  }

  // For TRIAL orgs: Check if user is the designated trialGammaUserId
  if (org.trialGammaUserId === userId) {
    return { allowed: true };
  }

  // For TRIAL orgs: If there's only 1 orgAdmin in the organization, allow them to use Gamma API
  const orgAdmins = userRoles.filter(r => r.role === 'org_admin');
  
  if (orgAdmins.length === 1 && orgAdmins[0].userId === userId) {
    return { allowed: true };
  }

  // Trial orgs: deny access for other users
  return {
    allowed: false,
    message: "In trial organizations, only the organization creator can generate lessons using the Gamma API. Other admins can still upload PPTX files manually for free."
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session middleware
  const sessionMiddleware = configureSession(app);

  // Register on-prem upload routes (no-op in cloud mode)
  registerUploadRoutes(app);

  // ===== MODULAR PUBLIC ROUTES =====
  // Register public routes (catalog, pricing, user status)
  // These routes are extracted into server/routes/public.ts for better organization
  app.use('/api/public', createPublicRouter());
  registerPublicStandaloneRoutes(app);
  registerPlatformRevenueRoutes(app);
  registerBrandingRoutes(app);
  registerCourseFrameworkRoutes(app);

  // ===== NEW DOMAIN ROUTERS (Routes Refactoring) =====
  // Note: These routers contain extracted routes with full /api/... paths.
  // Mount at root since routes define their own /api prefix.
  app.use('/', createMiscRouter());
  app.use('/', createAuthRouter());
  app.use('/', createAIRouter());
  registerGamificationRoutes(app);
  registerReportRoutes(app);
  registerOrgRoutes(app);
  registerPaymentsRoutes(app);
  registerQuizRoutes(app);
  registerCourseRoutes(app);
  registerSuperAdminRoutes(app);
  registerAdminRoutes(app);
  registerOrgSalesRoutes(app);
  registerLanguageRoutes(app);
  app.use('/', createEnterpriseAuthRouter());
  registerEnterprisePortalRoutes(app);
  registerEnterpriseSuperAdminRoutes(app);
  registerOnpremLicenseRoutes(app);
  registerEnterpriseRevenueRoutes(app);
  registerDemoDataRoutes(app);
  registerSourceIntelligenceRoutes(app);
  console.log('[Routes] Domain routers registered');
  // ===== END NEW DOMAIN ROUTERS =====

  // Note: Legacy public endpoint definitions remain below as safety net (will be removed after validation)

  // ===== GLOBAL ORG ISOLATION ENFORCEMENT =====
  // These middleware apply to ALL org-scoped routes, ensuring no route can be 
  // accessed with a tampered organizationId. Individual route-level checks
  // remain as defense-in-depth.

  // Pattern 1: Routes with :organizationId in path
  app.use('/api/organizations/:organizationId', 
    withSessionAuthMiddleware, 
    enforceOrgIsolationWithSuperAdminBypass()
  );

  // Pattern 2: Routes with :orgId in path  
  app.use('/api/org/:organizationId',
    withSessionAuthMiddleware,
    enforceOrgIsolationWithSuperAdminBypass()
  );

  // Pattern 3: Admin org routes (SuperAdmin bypass allows managing any org)
  app.use('/api/admin/organizations/:orgId',
    withSessionAuthMiddleware,
    enforceOrgIsolationWithSuperAdminBypass()
  );
  app.use('/api/admin/organizations/:organizationId',
    withSessionAuthMiddleware,
    enforceOrgIsolationWithSuperAdminBypass()
  );

  // Test PPTX Viewer endpoint (temporary for testing pptx-in-html-out)
  app.use('/test-pptx-viewer', express.static('server/tests/output'));

  // Server time endpoint for client synchronization
  app.get('/api/server-time', (req, res) => {
    const serverTime = Date.now();
    res.json({ 
      serverTime,
      timestamp: new Date(serverTime).toISOString(),
      timezone: getSystemTimezone()
    });
  });

  // Performance Monitoring Endpoints (SuperAdmin only)
  const { performanceMonitor } = await import('./monitoring/performanceMonitor');
  
  app.get('/api/monitoring/metrics', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const metrics = performanceMonitor.getMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  app.get('/api/monitoring/slow-endpoints', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const slowest = performanceMonitor.getSlowestEndpoints(limit);
      res.json(slowest);
    } catch (error) {
      console.error('Error fetching slow endpoints:', error);
      res.status(500).json({ error: 'Failed to fetch slow endpoints' });
    }
  });

  app.get('/api/monitoring/slow-queries', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const slowQueries = performanceMonitor.getSlowQueries(limit);
      res.json(slowQueries);
    } catch (error) {
      console.error('Error fetching slow queries:', error);
      res.status(500).json({ error: 'Failed to fetch slow queries' });
    }
  });

  app.post('/api/monitoring/reset', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      performanceMonitor.reset();
      res.json({ message: 'Metrics reset successfully' });
    } catch (error) {
      console.error('Error resetting metrics:', error);
      res.status(500).json({ error: 'Failed to reset metrics' });
    }
  });

  // Get available Gamma themes from database
  app.get('/api/gamma/themes', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
      
      const result = await GammaThemeSyncService.getActiveThemes(search, category, limit, offset);
      res.json(result);
    } catch (error) {
      console.error("[Gamma Themes] Error fetching themes:", error);
      res.status(500).json({ error: "Failed to fetch Gamma themes" });
    }
  });

  // Get available Gamma image styles from database
  app.get('/api/gamma/image-styles', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const styles = await GammaImageStyleService.getActiveStyles(search);
      res.json({ styles });
    } catch (error) {
      console.error("[Gamma Image Styles] Error fetching styles:", error);
      res.status(500).json({ error: "Failed to fetch image styles" });
    }
  });

  // Get all image styles for admin management (SuperAdmin/CustSuper)
  app.get('/api/admin/gamma/image-styles', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Upload thumbnail for image style (SuperAdmin/CustSuper)
  app.post('/api/admin/gamma/image-styles/:styleKey/upload',
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
  app.get('/api/admin/gamma/themes', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { themes } = await GammaThemeSyncService.getActiveThemes();
      res.json({ themes });
    } catch (error: any) {
      console.error('[Admin Themes] Error fetching themes:', error);
      res.status(500).json({ error: 'Failed to fetch themes' });
    }
  });

  // Upload or replace theme thumbnail (SuperAdmin/CustSuper)
  app.patch(
    '/api/admin/gamma-themes/:id/thumbnail',
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
  app.delete('/api/admin/gamma-themes/:id/thumbnail', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.get('/api/admin/gamma/status', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get course visibility system status (SuperAdmin only) - READ ONLY
  // This endpoint should NOT flush caches - use the POST endpoint for that
  app.get('/api/admin/course-visibility/status', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const systemStatus = CourseVisibilityService.getSystemStatus();
      
      res.json({
        enabled: systemStatus.visibilityEnabled,
        flagSource: systemStatus.flagSource,
        cacheHints: systemStatus.cacheHints,
        rollbackInstructions: systemStatus.rollbackInstructions,
        systemStatus: {
          isEnabled: CourseVisibilityService.isEnabled(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error("[Course Visibility Status] Error:", error);
      res.status(500).json({ error: "Failed to fetch course visibility status" });
    }
  });

  // Flush course visibility caches (SuperAdmin only)
  app.post('/api/admin/course-visibility/flush-caches', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const result = CourseVisibilityService.flushAllCaches();
      
      console.log("[Course Visibility] Cache flush requested by SuperAdmin");
      
      res.json({
        success: result.success,
        message: result.message,
        queryKeysToInvalidate: result.queryKeysToInvalidate,
        timestamp: result.timestamp.toISOString(),
        featureFlagEnabled: CourseVisibilityService.isEnabled(),
      });
    } catch (error: any) {
      console.error("[Course Visibility Flush] Error:", error);
      res.status(500).json({ error: "Failed to flush course visibility caches" });
    }
  });

  // Get all user credit balances with search/filter (SuperAdmin only)
  // Updated to use unified credit system (users.lpCreditBalance) instead of deprecated userCreditAllocations
  app.get('/api/admin/lesson-credits/users', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { search, organizationId, page = '1', limit = '50' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;

      // Query users with their credit balances and organization info
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
          allocationId: r.user.id, // Use userId as allocationId for backward compatibility
          userId: r.user.id,
          userName: r.user.gamerName,
          email: r.user.email,
          organizationId: r.organization?.id || null,
          organizationName: r.organization?.name || null,
          currentBalance: r.user.lpCreditBalance ?? 0,
          monthlyAllocation: null, // Deprecated - no longer used in unified system
          status: 'active', // Unified system doesn't have allocation status
          lastResetDate: null, // Deprecated - no longer used in unified system
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

  // Adjust user credits manually (SuperAdmin only)
  // Updated to use unified credit system (UnifiedCreditService) instead of deprecated CreditService
  // Note: allocationId is now treated as userId for backward compatibility
  app.post('/api/admin/lesson-credits/users/:allocationId/adjust', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { allocationId } = req.params; // This is now the userId
      const { amountChange, reason } = req.body;
      const userId = allocationId; // Treat allocationId as userId in unified system

      if (!amountChange || !reason) {
        return res.status(400).json({ error: "amountChange and reason are required" });
      }

      const amount = parseInt(amountChange);
      const correlationId = `admin_adjustment_${userId}_${Date.now()}`;
      const adminUserId = req.session.userId!;

      let result;
      if (amount > 0) {
        // Add credits
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
        // Deduct credits
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

  // Get user credit transaction history (SuperAdmin only)
  // Updated to use unified credit system (lpCreditLedger) instead of deprecated creditTransactions
  // Note: allocationId is now treated as userId for backward compatibility
  app.get('/api/admin/lesson-credits/users/:allocationId/history', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { allocationId } = req.params; // This is now the userId
      const userId = allocationId; // Treat allocationId as userId in unified system
      const { limit = '50' } = req.query;

      const transactions = await db
        .select()
        .from(lpCreditLedger)
        .where(eq(lpCreditLedger.userId, userId))
        .orderBy(desc(lpCreditLedger.createdAt))
        .limit(parseInt(limit as string));

      // Map to maintain backward-compatible response format
      res.json({
        transactions: transactions.map(t => ({
          id: t.id,
          allocationId: t.userId, // Map userId to allocationId for backward compatibility
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

  // ===== LEGACY PUBLIC ENDPOINTS (DISABLED) =====
  // These endpoints are now handled by server/routes/public.ts
  // Commented out to avoid conflicts - will be removed after full validation

  // LEGACY: Get public platform pricing (replaced by PUBLIC router)
  // app.get('/api/public/platform-pricing', async (req: Request, res: Response) => {
  //   try {
  //     const [pricing] = await db
  //       .select()
  //       .from(schema.platformPricing)
  //       .limit(1);
  //     res.json({ 
  //       learnerMonthlyCost: pricing?.learnerMonthlyCost || '8.99',
  //       currency: 'ZAR'
  //     });
  //   } catch (error: any) {
  //     console.error("[Public Pricing] Error fetching pricing:", error);
  //     res.status(500).json({ error: "Failed to fetch platform pricing" });
  //   }
  // });

  // Get subscription plans (educator monthly lesson credit tiers from subscriptionPlans table)
  app.get('/api/public/subscription-plans', async (req: Request, res: Response) => {
    try {
      const { planType } = req.query;
      
      // For educator plans: fetch from subscriptionPlans table (monthly lesson credit tiers)
      if (!planType || planType === 'educator') {
        const subscriptionPlans = await db
          .select()
          .from(schema.subscriptionPlans)
          .where(eq(schema.subscriptionPlans.isActive, true))
          .orderBy(schema.subscriptionPlans.displayOrder);

        res.json({ subscriptionPlans });
      } else if (planType === 'learner') {
        // For learner plans: return empty for now (learner cost is in platformPricing.learnerMonthlyCost)
        // This will be a single plan based on the learner monthly cost setting
        res.json({ subscriptionPlans: [] });
      } else {
        res.json({ subscriptionPlans: [] });
      }
    } catch (error: any) {
      console.error("[Public Plans] Error fetching subscription plans:", error);
      res.status(500).json({ error: "Failed to fetch subscription plans" });
    }
  });


  // Get public lesson credit costs (used by all package display components)
  // This endpoint is cached to reduce database calls
  app.get('/api/public/lesson-credit-costs', async (req: Request, res: Response) => {
    try {
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
      
      // Check cache first
      if (lessonCreditCostsCache && (Date.now() - lessonCreditCostsCacheTime) < CACHE_TTL) {
        return res.json(lessonCreditCostsCache);
      }

      // Fetch from database
      let [settings] = await db
        .select({
          creditsPerLessonTextOnlyMin: schema.lessonCreditPricingSettings.creditsPerLessonTextOnlyMin,
          creditsPerLessonTextOnlyMax: schema.lessonCreditPricingSettings.creditsPerLessonTextOnlyMax,
          creditsPerLessonWithImagesMin: schema.lessonCreditPricingSettings.creditsPerLessonWithImagesMin,
          creditsPerLessonWithImagesMax: schema.lessonCreditPricingSettings.creditsPerLessonWithImagesMax,
        })
        .from(schema.lessonCreditPricingSettings)
        .limit(1);

      // Use defaults if no settings exist
      const response = {
        creditsPerLessonTextOnlyMin: settings?.creditsPerLessonTextOnlyMin ?? 40,
        creditsPerLessonTextOnlyMax: settings?.creditsPerLessonTextOnlyMax ?? 90,
        creditsPerLessonWithImagesMin: settings?.creditsPerLessonWithImagesMin ?? 140,
        creditsPerLessonWithImagesMax: settings?.creditsPerLessonWithImagesMax ?? 290,
      };

      // Update cache
      lessonCreditCostsCache = response;
      lessonCreditCostsCacheTime = Date.now();

      res.json(response);
    } catch (error: any) {
      console.error("[Public Lesson Credit Costs] Error fetching costs:", error);
      // Return defaults on error
      res.json({
        creditsPerLessonTextOnlyMin: 40,
        creditsPerLessonTextOnlyMax: 90,
        creditsPerLessonWithImagesMin: 140,
        creditsPerLessonWithImagesMax: 290,
      });
    }
  });

  // ==================== PLATFORM COST MANAGEMENT API (SuperAdmin only) ====================

  // ==================== CATEGORY TYPES ROUTES ====================
  
  // Get all category types
  app.get('/api/admin/platform-costs/category-types', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.get('/api/admin/platform-costs/category-types/active', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const types = await PlatformCostService.getActiveCostCategoryTypes();
      res.json(types);
    } catch (error: any) {
      console.error('[Platform Costs] Error listing active category types:', error);
      res.status(500).json({ error: 'Failed to list active category types' });
    }
  });

  // Create category type
  app.post('/api/admin/platform-costs/category-types', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const parsed = schema.insertPlatformCostCategoryTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
      }

      const result = await PlatformCostService.createCostCategoryType(parsed.data);
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
  app.put('/api/admin/platform-costs/category-types/:id', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = schema.insertPlatformCostCategoryTypeSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
      }

      const result = await PlatformCostService.updateCostCategoryType(id, parsed.data);
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
  app.delete('/api/admin/platform-costs/category-types/:id', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.get('/api/admin/platform-costs/categories', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.post('/api/admin/platform-costs/categories', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const parsed = schema.insertPlatformCostCategorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
      }

      const result = await PlatformCostService.createCostCategory(parsed.data);
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
  app.put('/api/admin/platform-costs/categories/:id', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = schema.insertPlatformCostCategorySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
      }

      const result = await PlatformCostService.updateCostCategory(id, parsed.data);
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
  app.delete('/api/admin/platform-costs/categories/:id', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get cost entries with filters
  app.get('/api/admin/platform-costs/entries', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.post('/api/admin/platform-costs/entries', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.put('/api/admin/platform-costs/entries/:id', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.delete('/api/admin/platform-costs/entries/:id', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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
  app.get('/api/admin/platform-costs/stats', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const stats = await PlatformCostService.getCostStats();
      console.log(`[Platform Costs] Retrieved cost stats: monthlyBurn=${stats.monthlyBurn}, ytdCosts=${stats.ytdCosts}, activeRecurring=${stats.activeRecurring}`);
      res.json(stats);
    } catch (error: any) {
      console.error('[Platform Costs] Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get cost statistics' });
    }
  });

  // ==================== LPC SPEND TRACKING API (SuperAdmin) ====================
  
  // Get LPC spend summary stats
  app.get('/api/admin/lpc/spend/stats', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC spend breakdown by feature category
  app.get('/api/admin/lpc/spend/by-feature', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC spend breakdown by organization
  app.get('/api/admin/lpc/spend/by-org', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC spend time series for charting
  app.get('/api/admin/lpc/spend/time-series', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get paginated LPC spend transactions
  app.get('/api/admin/lpc/spend/transactions', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC spend aggregations (combined stats, by-feature, by-org)
  app.get('/api/admin/lpc/spend/aggregations', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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


  // ===== LPC REVENUE ANALYTICS ROUTES =====

  // Get LPC revenue summary stats
  app.get('/api/admin/lpc/revenue/stats', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC revenue time series for charting
  app.get('/api/admin/lpc/revenue/time-series', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC revenue breakdown by organization
  app.get('/api/admin/lpc/revenue/by-org', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get LPC cost breakdown by category
  app.get('/api/admin/lpc/revenue/costs', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get paginated LPC credit order transactions
  app.get('/api/admin/lpc/revenue/orders', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
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

  // Get lesson credit pricing calculator settings (SuperAdmin only)
  app.get('/api/admin/lesson-credit-pricing-settings', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const normalizePlatformCostTiersToUsd = async (
        tiers: Array<{ credits: number; cost: number; currency?: 'ZAR' | 'USD' | 'EUR' }>
      ) => {
        const normalized = await Promise.all(
          tiers.map(async (tier) => {
            const sourceCurrency = (tier.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR';
            if (sourceCurrency === 'USD') {
              return { credits: tier.credits, cost: tier.cost, currency: 'USD' as const };
            }
            let conversion;
            try {
              conversion = await CurrencyService.convertAmount(String(tier.cost), sourceCurrency, 'USD');
            } catch (error) {
              console.warn(`[Lesson Credit Pricing] Failed to convert ${sourceCurrency} tier to USD; preserving raw value`, error);
              return { credits: tier.credits, cost: tier.cost, currency: 'USD' as const };
            }
            return {
              credits: tier.credits,
              cost: parseFloat(conversion.convertedAmount),
              currency: 'USD' as const,
            };
          })
        );
        return normalized;
      };

      let [settings] = await db
        .select()
        .from(schema.lessonCreditPricingSettings)
        .limit(1);

      if (!settings) {
        // Create default settings if not exists
        [settings] = await db
          .insert(schema.lessonCreditPricingSettings)
          .values({
            minimumProfitPercentage: "30.00",
            profitStepDecrease: "5.00",
            platformCostTiers: [
              { credits: 1, cost: 0.20, currency: 'USD' },
              { credits: 10, cost: 1.00, currency: 'USD' },
              { credits: 50, cost: 3.00, currency: 'USD' },
              { credits: 100, cost: 4.50, currency: 'USD' }
            ]
          })
          .returning();
      }

      const existingTiers = (settings.platformCostTiers || []) as Array<{ credits: number; cost: number; currency?: 'ZAR' | 'USD' | 'EUR' }>;
      const requiresNormalization = existingTiers.some((tier) => (tier.currency || 'ZAR') !== 'USD');
      if (requiresNormalization) {
        const normalizedTiers = await normalizePlatformCostTiersToUsd(existingTiers);
        [settings] = await db
          .update(schema.lessonCreditPricingSettings)
          .set({
            platformCostTiers: normalizedTiers,
            updatedAt: new Date(),
          })
          .where(eq(schema.lessonCreditPricingSettings.id, settings.id))
          .returning();
      }

      res.json({
        settings: {
          ...settings,
          platformCostBaseCurrency: 'USD',
        },
      });
    } catch (error: any) {
      console.error("[Lesson Credit Pricing] Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch lesson credit pricing settings" });
    }
  });

  // Update lesson credit pricing calculator settings (SuperAdmin only)
  app.patch('/api/admin/lesson-credit-pricing-settings', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { 
        minimumProfitPercentage, 
        profitStepDecrease, 
        platformCostTiers,
        creditsPerLessonTextOnlyMin,
        creditsPerLessonTextOnlyMax,
        creditsPerLessonWithImagesMin,
        creditsPerLessonWithImagesMax
      } = req.body;

      const normalizePlatformCostTiersToUsd = async (
        tiers: Array<{ credits: number; cost: number; currency?: 'ZAR' | 'USD' | 'EUR' }>
      ) => {
        const normalized = await Promise.all(
          tiers.map(async (tier) => {
            const sourceCurrency = (tier.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR';
            if (sourceCurrency === 'USD') {
              return { credits: tier.credits, cost: tier.cost, currency: 'USD' as const };
            }
            let conversion;
            try {
              conversion = await CurrencyService.convertAmount(String(tier.cost), sourceCurrency, 'USD');
            } catch (error) {
              console.warn(`[Lesson Credit Pricing] Failed to convert ${sourceCurrency} tier to USD; preserving raw value`, error);
              return { credits: tier.credits, cost: tier.cost, currency: 'USD' as const };
            }
            return {
              credits: tier.credits,
              cost: parseFloat(conversion.convertedAmount),
              currency: 'USD' as const,
            };
          })
        );
        return normalized;
      };

      // Validate inputs
      if (minimumProfitPercentage !== undefined) {
        const minProfit = parseFloat(minimumProfitPercentage);
        if (isNaN(minProfit) || minProfit < 0 || minProfit > 100) {
          return res.status(400).json({ error: "Minimum profit percentage must be between 0 and 100" });
        }
      }

      if (profitStepDecrease !== undefined) {
        const stepDecrease = parseFloat(profitStepDecrease);
        if (isNaN(stepDecrease) || stepDecrease < 0 || stepDecrease > 50) {
          return res.status(400).json({ error: "Profit step decrease must be between 0 and 50" });
        }
      }

      if (platformCostTiers !== undefined) {
        if (!Array.isArray(platformCostTiers)) {
          return res.status(400).json({ error: "Platform cost tiers must be an array" });
        }
        for (const tier of platformCostTiers) {
          if (typeof tier.credits !== 'number' || typeof tier.cost !== 'number') {
            return res.status(400).json({ error: "Each tier must have credits and cost as numbers" });
          }
          if (tier.currency !== undefined && !['ZAR', 'USD', 'EUR'].includes(tier.currency)) {
            return res.status(400).json({ error: "Tier currency must be ZAR, USD, or EUR" });
          }
          if (tier.credits <= 0 || tier.cost < 0) {
            return res.status(400).json({ error: "Credits must be positive and cost must be non-negative" });
          }
        }
      }

      // Validate lesson credit cost fields
      if (creditsPerLessonTextOnlyMin !== undefined) {
        const val = parseInt(creditsPerLessonTextOnlyMin);
        if (isNaN(val) || val <= 0) {
          return res.status(400).json({ error: "Credits per text-only lesson (min) must be a positive number" });
        }
      }
      if (creditsPerLessonTextOnlyMax !== undefined) {
        const val = parseInt(creditsPerLessonTextOnlyMax);
        if (isNaN(val) || val <= 0) {
          return res.status(400).json({ error: "Credits per text-only lesson (max) must be a positive number" });
        }
      }
      if (creditsPerLessonWithImagesMin !== undefined) {
        const val = parseInt(creditsPerLessonWithImagesMin);
        if (isNaN(val) || val <= 0) {
          return res.status(400).json({ error: "Credits per lesson with images (min) must be a positive number" });
        }
      }
      if (creditsPerLessonWithImagesMax !== undefined) {
        const val = parseInt(creditsPerLessonWithImagesMax);
        if (isNaN(val) || val <= 0) {
          return res.status(400).json({ error: "Credits per lesson with images (max) must be a positive number" });
        }
      }
      
      // Validate min < max relationships
      const textOnlyMin = creditsPerLessonTextOnlyMin !== undefined ? parseInt(creditsPerLessonTextOnlyMin) : null;
      const textOnlyMax = creditsPerLessonTextOnlyMax !== undefined ? parseInt(creditsPerLessonTextOnlyMax) : null;
      const withImagesMin = creditsPerLessonWithImagesMin !== undefined ? parseInt(creditsPerLessonWithImagesMin) : null;
      const withImagesMax = creditsPerLessonWithImagesMax !== undefined ? parseInt(creditsPerLessonWithImagesMax) : null;
      
      if (textOnlyMin !== null && textOnlyMax !== null && textOnlyMin > textOnlyMax) {
        return res.status(400).json({ error: "Text-only lesson min credits cannot be greater than max" });
      }
      if (withImagesMin !== null && withImagesMax !== null && withImagesMin > withImagesMax) {
        return res.status(400).json({ error: "Lesson with images min credits cannot be greater than max" });
      }

      // Get existing or create new
      let [existing] = await db
        .select()
        .from(schema.lessonCreditPricingSettings)
        .limit(1);

      const updateData: Record<string, any> = {
        updatedBy: userId,
        updatedAt: new Date()
      };

      if (minimumProfitPercentage !== undefined) {
        updateData.minimumProfitPercentage = String(parseFloat(minimumProfitPercentage));
      }
      if (profitStepDecrease !== undefined) {
        updateData.profitStepDecrease = String(parseFloat(profitStepDecrease));
      }
      if (platformCostTiers !== undefined) {
        updateData.platformCostTiers = await normalizePlatformCostTiersToUsd(platformCostTiers);
      }
      if (creditsPerLessonTextOnlyMin !== undefined) {
        updateData.creditsPerLessonTextOnlyMin = parseInt(creditsPerLessonTextOnlyMin);
      }
      if (creditsPerLessonTextOnlyMax !== undefined) {
        updateData.creditsPerLessonTextOnlyMax = parseInt(creditsPerLessonTextOnlyMax);
      }
      if (creditsPerLessonWithImagesMin !== undefined) {
        updateData.creditsPerLessonWithImagesMin = parseInt(creditsPerLessonWithImagesMin);
      }
      if (creditsPerLessonWithImagesMax !== undefined) {
        updateData.creditsPerLessonWithImagesMax = parseInt(creditsPerLessonWithImagesMax);
      }

      let updated;
      if (existing) {
        [updated] = await db
          .update(schema.lessonCreditPricingSettings)
          .set(updateData)
          .where(eq(schema.lessonCreditPricingSettings.id, existing.id))
          .returning();
      } else {
        [updated] = await db
          .insert(schema.lessonCreditPricingSettings)
          .values({
            minimumProfitPercentage: (minimumProfitPercentage || 30).toString(),
            profitStepDecrease: (profitStepDecrease || 5).toString(),
            platformCostTiers: platformCostTiers ? await normalizePlatformCostTiersToUsd(platformCostTiers) : [],
            creditsPerLessonTextOnlyMin: creditsPerLessonTextOnlyMin || 40,
            creditsPerLessonTextOnlyMax: creditsPerLessonTextOnlyMax || 90,
            creditsPerLessonWithImagesMin: creditsPerLessonWithImagesMin || 140,
            creditsPerLessonWithImagesMax: creditsPerLessonWithImagesMax || 290,
            updatedBy: userId
          })
          .returning();
      }

      // Clear cache for public endpoint
      lessonCreditCostsCache = null;
      lessonCreditCostsCacheTime = 0;

      console.log(`[Lesson Credit Pricing] Settings updated by SuperAdmin ${userId}`);
      res.json({ settings: updated });
    } catch (error: any) {
      console.error("[Lesson Credit Pricing] Error updating settings:", error);
      res.status(500).json({ error: "Failed to update lesson credit pricing settings" });
    }
  });

  // NOTE: SuperAdmin payment settings, webhook, credit package, and subscription routes moved to server/routes/superAdminRoutes.ts
  // NOTE: GET /api/credit-packages moved to server/routes/paymentsRoutes.ts
  // NOTE: POST /api/credit-packages/:packageId/purchase moved to server/routes/paymentsRoutes.ts
  // NOTE: Subscription plan and credit package management routes moved to server/routes/superAdminRoutes.ts

  // Get organization units (for department/grade dropdown)
  app.get('/api/organizations/:organizationId/units', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const units = await storage.getOrganizationUnits(organizationId);
      res.json({ units });
    } catch (error) {
      console.error("[Org Units] Error fetching units:", error);
      res.status(500).json({ error: "Failed to fetch organization units" });
    }
  });

  // Get organization subunits for a specific unit (for cascading unit dropdown)
  app.get('/api/organizations/:organizationId/units/:unitId/subunits', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { unitId } = req.params;
      const subunits = await storage.getOrganizationSubUnits(unitId);
      res.json({ subunits });
    } catch (error) {
      console.error("[Org Subunits] Error fetching subunits:", error);
      res.status(500).json({ error: "Failed to fetch organization subunits" });
    }
  });
  // Get current user status (works for both authenticated and anonymous users)
  app.get("/api/user-status", optionalAuth, async (req: Request, res: Response) => {
    try {
      if (req.session.userId) {
        // Authenticated user
        const user = await storage.getUser(req.session.userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        
        // Get user's organization roles and organization info
        const userRoles = await storage.getUserRoles(req.session.userId);
        const organizationId = userRoles.length > 0 ? userRoles[0].organizationId : null;
        let organizationName = null;
        
        if (organizationId) {
          const organization = await storage.getOrganization(organizationId);
          organizationName = organization?.name || null;
        }
        
        res.json({ 
          id: user.id, 
          gamerName: user.gamerName, 
          email: user.email,
          isAuthenticated: true,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarImageUrl: user.avatarImageUrl,
          country: user.country,
          bio: user.bio,
          playerTitle: user.playerTitle,
          preferredGameModes: user.preferredGameModes,
          isStatsPublic: user.isStatsPublic,
          totalGamesPlayed: user.totalGamesPlayed,
          totalWins: user.totalWins,
          winPercentage: user.winPercentage,
          bestWinStreak: user.bestWinStreak,
          currentWinStreak: user.currentWinStreak,
          averageGameDuration: user.averageGameDuration,
          lastActiveAt: user.lastActiveAt,
          createdAt: user.createdAt,
          organizationId: organizationId,
          organizationName: organizationName,
          organizationRoles: userRoles
        });
      } else {
        // Anonymous/guest user - get or create guest session
        const guestId = req.session.anonymousUserId;
        if (!guestId) {
          return res.status(401).json({ error: "Authentication required" });
        }
        const guestSession = await storage.getOrCreateGuestSession(guestId);
        
        res.json({ 
          id: guestId,
          gamerName: guestSession.guestName,
          email: null,
          isAuthenticated: false
        });
      }
    } catch (error) {
      console.error("Error fetching user status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get trial status for current user's organization
  app.get("/api/trial-status", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Get user's organization
      const userRoles = await storage.getUserRoles(userId);
      if (userRoles.length === 0) {
        return res.json({ isTrialActive: false, daysRemaining: 0, trialEndDate: null });
      }

      const organizationId = userRoles[0].organizationId;
      const trialStatus = await storage.checkTrialStatus(organizationId);
      
      // Get organization to check isDemo status
      const org = await storage.getOrganization(organizationId);
      const isDemo = org?.isDemo || false;
      
      res.json({ ...trialStatus, organizationId, isDemo });
    } catch (error) {
      console.error("Error fetching trial status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Profile management routes
  app.put("/api/profile", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const validatedData = updateProfileSchema.parse(req.body);
      
      // Check for gamer name uniqueness if it's being updated
      if (validatedData.gamerName) {
        const currentUser = await storage.getUser(req.session.userId!);
        if (!currentUser) {
          return res.status(404).json({ error: "User not found" });
        }
        
        // Only check uniqueness if the gamer name is actually changing
        if (currentUser.gamerName !== validatedData.gamerName) {
          const existingUser = await storage.getUserByGamerName(validatedData.gamerName);
          if (existingUser) {
            return res.status(400).json({ error: "This player name is already taken. Please choose another." });
          }
        }
      }
      
      const user = await storage.updateUserProfile(req.session.userId!, validatedData);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Update profile error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid profile data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Avatar upload URL endpoint
  app.post("/api/profile/avatar/upload-url", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const objectStorageService = new ObjectStorageService();
      
      // Generate upload URL for avatar in public/avatars/<gamerName>/ directory
      const avatarPath = buildCanonicalStorageKey({
        scope: "public",
        domain: "avatar",
        extension: ".jpg",
        seed: `avatar:${user.id}:${user.gamerName || ""}`,
      }).replace(/^\/public\//, "");
      const uploadURL = await objectStorageService.getPublicObjectUploadURL(avatarPath);
      
      res.json({ uploadURL, avatarPath });
    } catch (error) {
      console.error("Generate avatar upload URL error:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Update avatar after upload
  app.put("/api/profile/avatar", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const validatedData = updateAvatarSchema.parse(req.body);
      const user = await storage.updateUserAvatar(req.session.userId!, validatedData);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Update avatar error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid avatar data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });


  // Get student progress stats for motivational widget
  app.get("/api/student/progress-stats", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get player stats for XP and level
      const playerStats = await storage.getPlayerStats(userId);
      const currentXP = playerStats?.currentXP || 0;
      const currentLevel = playerStats?.currentLevel || 1;
      const currentWinStreak = playerStats?.currentWinStreak || 0;

      // Calculate level progress using shared utility
      const { getLevelProgress } = await import("../shared/levelUtils");
      const levelProgress = getLevelProgress(currentXP, currentLevel);

      // Get user's grade (unit) from roles
      const userRoles = await storage.getUserRoles(userId);
      let gradeRank = null;
      let gradeRankTotal = null;
      let xpToNextRank = null;
      let gradeName = null;

      if (userRoles && userRoles.length > 0) {
        const primaryRole = userRoles[0];
        const unitId = primaryRole.unitId;
        
        if (unitId) {
          // Get the unit name for display
          const unit = await storage.getOrganizationUnit(unitId);
          gradeName = unit?.name || null;

          // Get quiz leaderboard filtered by this grade
          const leaderboard = await storage.getQuizLeaderboard({
            organizationId: primaryRole.organizationId,
            unitId: unitId,
            limit: 1000 // Get enough to find rank
          });

          // Find user's position in grade leaderboard
          const userIndex = leaderboard.findIndex(entry => entry.userId === userId);
          if (userIndex >= 0) {
            gradeRank = userIndex + 1;
            gradeRankTotal = leaderboard.length;
            
            // Calculate XP to next rank
            if (userIndex > 0) {
              const nextRankEntry = leaderboard[userIndex - 1];
              xpToNextRank = Math.max(0, (nextRankEntry.totalXP || 0) - currentXP);
            }
          }
        }
      }

      // Calculate quiz pass rate from userQuizProgress
      const quizProgressRecords = await storage.getUserAllQuizProgress(userId);
      let quizPassRate = 0;
      let totalCompletedQuizzes = 0;
      
      if (quizProgressRecords && quizProgressRecords.length > 0) {
        // Only count quizzes that have been completed (passed or failed)
        const completedQuizzes = quizProgressRecords.filter((record: any) => 
          record.completionStatus === 'completed_passed' || record.completionStatus === 'completed_failed'
        );
        totalCompletedQuizzes = completedQuizzes.length;
        
        if (totalCompletedQuizzes > 0) {
          const passedQuizzes = completedQuizzes.filter((record: any) => 
            record.isPassed === true || record.completionStatus === 'completed_passed'
          ).length;
          quizPassRate = Math.round((passedQuizzes / totalCompletedQuizzes) * 100);
        }
      }

      res.json({
        currentLevel,
        currentXP,
        xpInCurrentLevel: levelProgress.xpInCurrentLevel,
        xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,
        levelProgress: Math.round(levelProgress.progress),
        nextLevel: levelProgress.nextLevel,
        gradeRank,
        gradeRankTotal,
        gradeName,
        xpToNextRank,
        currentWinStreak,
        quizPassRate,
        totalQuizzes: totalCompletedQuizzes
      });
    } catch (error) {
      console.error("Get student progress stats error:", error);
      res.status(500).json({ error: "Failed to get progress stats" });
    }
  });
  // Get user's game history
  app.get("/api/user/game-history", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const limit = parseInt(req.query.limit as string) || 20;
      const timeframe = (req.query.timeframe as 'today' | 'week' | 'month' | 'all') || 'all';
      
      // Validate timeframe parameter
      const validTimeframes = ['today', 'week', 'month', 'all'];
      if (!validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: "Invalid timeframe. Must be one of: today, week, month, all" });
      }
      
      const gameHistory = await storage.getPlayerGameHistory(userId, limit, timeframe);
      res.json(gameHistory);
    } catch (error) {
      console.error("Get user game history error:", error);
      res.status(500).json({ error: "Failed to get game history" });
    }
  });

  // Game abandonment penalty endpoint
  app.post("/api/game/abandon", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { gameMode, gameId } = req.body;

      if (!gameMode || !['single', '1v1', '4player'].includes(gameMode)) {
        return res.status(400).json({ error: "Invalid game mode" });
      }

      // Apply abandonment penalty: -30 XP, +1 loss
      const { xpService } = await import("./xpService");
      const gameOutcome = {
        playerId: userId,
        won: false, // Abandoning counts as a loss
        gameMode: gameMode as "single" | "1v1" | "4player",
        gameDuration: 0, // No actual game duration for abandonment
        totalRounds: 1, // Minimum rounds for calculation
        isAbandonment: true, // Special flag for abandonment penalty
      };

      const { updatedStats, xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);

      console.log(`🚨 Player ${userId} abandoned ${gameMode} game - Applied penalty: -30 XP`);

      // If this was a multiplayer game, notify remaining player and clean up the game session
      if (gameMode === '1v1' && gameId) {
        try {
          // Find the game and notify remaining player before cleanup
          const game = await storage.getActiveOneVOneGame(gameId);
          if (game) {
            // Determine remaining player and send victory event
            const leavingPlayerId = userId;
            const remainingSocketId = game.player1Id === leavingPlayerId ? game.player2SocketId : game.player1SocketId;
            const remainingPlayerId = game.player1Id === leavingPlayerId ? game.player2Id : game.player1Id;
            const remainingPlayerName = game.player1Id === leavingPlayerId ? game.player2Name : game.player1Name;
            const leavingPlayerName = game.player1Id === leavingPlayerId ? game.player1Name : game.player2Name;

            // Send victory to remaining player if they're still connected
            if (remainingSocketId) {
              // Check if remaining player is authenticated (not a guest)
              const remainingPlayerIsAuth = remainingPlayerId && !remainingPlayerId.startsWith('guest_');
              
              try {
                let xpData = null;
                
                // Only calculate XP if remaining player is authenticated
                if (remainingPlayerIsAuth) {
                  const gameResult = game.player1Id === leavingPlayerId ? 'player2_wins' : 'player1_wins';
                  const { player1XPData, player2XPData } = await saveOneVOneGameResult(game, gameResult);
                  xpData = game.player1Id === leavingPlayerId ? player2XPData : player1XPData;
                  console.log(`🏆 ${remainingPlayerName} (authenticated) wins by opponent abandon with XP rewards`);
                } else {
                  console.log(`🏆 ${remainingPlayerName} (guest) wins by opponent abandon - no XP recorded`);
                }

                // Send victory event to remaining player
                io.to(remainingSocketId).emit('game-ended-1v1', {
                  gameResult: 'win',
                  isPlayer1: game.player1Id !== leavingPlayerId,
                  reason: 'opponent_disconnect',
                  xpData: xpData,
                  message: `${leavingPlayerName} left the game. You win!`
                });
                
                console.log(`✅ Notified ${remainingPlayerName} of victory due to opponent abandonment`);
              } catch (victoryError) {
                console.error('❌ Error awarding victory on abandon:', victoryError);
                // Send basic victory without XP as fallback
                io.to(remainingSocketId).emit('game-ended-1v1', {
                  gameResult: 'win',
                  isPlayer1: game.player1Id !== leavingPlayerId,
                  reason: 'opponent_disconnect',
                  xpData: null,
                  message: `${leavingPlayerName} left the game. You win!`
                });
              }
            }
          }

          // Clean up the game
          await storage.deleteActiveOneVOneGame(gameId);
          console.log(`🧹 Cleaned up abandoned 1v1 game: ${gameId}`);
        } catch (cleanupError) {
          console.warn('Failed to cleanup abandoned game:', cleanupError);
          // Don't fail the penalty application if cleanup fails
        }
      }

      res.json({
        playerStats: updatedStats,
        xpResult: {
          ...xpResult,
          totalXPChange: -30, // Override with fixed -30 XP penalty
          reason: 'Game Abandonment Penalty'
        },
        penaltyApplied: true,
      });
    } catch (error) {
      console.error("Game abandonment penalty error:", error);
      res.status(500).json({ error: "Failed to apply abandonment penalty" });
    }
  });

  // Single player game completion endpoint
  app.post("/api/game/single-player/complete", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { collectionId, totalRounds, gameDuration, finalCardCount, opponentFinalCardCount } = req.body;

      // Validate required fields and ensure card counts are numbers
      if (!collectionId || !totalRounds || !gameDuration || 
          typeof finalCardCount !== 'number' || typeof opponentFinalCardCount !== 'number' ||
          isNaN(finalCardCount) || isNaN(opponentFinalCardCount) ||
          finalCardCount < 0 || opponentFinalCardCount < 0) {
        return res.status(400).json({ 
          error: "Missing or invalid required fields. Card counts must be valid non-negative numbers." 
        });
      }

      // Fetch quiz metadata to determine if this is a quiz and calculate quiz-specific fields
      const quizData = await storage.getQuizCollection(collectionId);
      const isQuiz = !!quizData;
      let quizPassed = false;
      let quizPercentage = 0;
      let totalQuestions = totalRounds;
      
      if (isQuiz) {
        // Get total questions from quiz metadata or use totalRounds as fallback
        totalQuestions = quizData.totalQuestions || totalRounds;
        
        // Calculate quiz percentage: finalCardCount = correct answers
        quizPercentage = totalQuestions > 0 ? Math.round((finalCardCount / totalQuestions) * 100) : 0;
        
        // Determine if quiz was passed based on pass threshold
        const passThreshold = quizData.passPercentage || 60; // Default 60% pass threshold
        quizPassed = quizPercentage >= passThreshold;
        
        console.log(`📝 Quiz completion: ${finalCardCount}/${totalQuestions} correct (${quizPercentage}%), Pass threshold: ${passThreshold}%, Passed: ${quizPassed}`);
      }

      // Calculate and update XP FIRST - determine winner based on card counts (server-authoritative)
      const { xpService } = await import("./xpService");
      const isTie = finalCardCount === opponentFinalCardCount;
      const playerWon = !isTie && finalCardCount > opponentFinalCardCount; // Player wins if they have more cards
      
      console.log(`🎯 Single player game result: Player=${finalCardCount} cards, Opponent=${opponentFinalCardCount} cards`);
      console.log(`🎯 Result: ${isTie ? 'TIE' : playerWon ? 'PLAYER WIN' : 'PLAYER LOSS'}`);
      
      const gameOutcome = {
        playerId: userId,
        won: playerWon, // Server-calculated result based on card counts
        tied: isTie, // Set tied flag for tie games
        gameMode: "single" as const,
        gameDuration,
        totalRounds,
        // Quiz-specific fields for challenge tracking
        isQuiz,
        quizPassed,
        quizPercentage,
        correctAnswers: finalCardCount, // finalCardCount = number of correct answers
        totalQuestions,
      };

      const { updatedStats, xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);

      // Create playerXPChanges with the calculated XP data for both player and NPC opponent
      const playerXPChanges: PlayerXPChanges = {
        [userId]: {
          xpChange: xpResult.totalXPChange,
          newXP: xpResult.newXP,
          newRank: updatedStats.currentRank || "Rookie",
          wasPromotion: xpResult.wasPromotion,
          finalCardCount: finalCardCount || 0 // Use actual final card count from game
        },
        "npc_opponent": {
          xpChange: 0, // NPCs don't get XP
          newXP: 0,
          newRank: "NPC",
          wasPromotion: false,
          finalCardCount: opponentFinalCardCount || 0 // NPC opponent card count
        }
      };

      // Save game result WITH XP changes
      const gameResult = await storage.createGameResult({
        gameRoomId: null, // No game room for single player
        collectionId,
        winnerId: playerWon ? userId : null, // Only set winnerId if player actually won (server-calculated)
        gameMode: "single",
        playerIds: [userId, "npc_opponent"], // Include both player and NPC
        playerXPChanges, // Include the calculated XP changes
        totalRounds,
        gameDuration,
        isMultiplayer: false,
        gameStartedAt: new Date(Date.now() - gameDuration * 1000),
        gameEndedAt: new Date(),
      });

      res.json({
        gameResult,
        playerStats: updatedStats,
        xpResult,
      });
    } catch (error) {
      console.error("Single player game completion error:", error);
      res.status(500).json({ error: "Failed to save game result" });
    }
  });

  // Card collections route
  app.get("/api/collections", async (req: Request, res: Response) => {
    try {
      const collections = await storage.getCardCollections();
      res.json(collections);
    } catch (error) {
      console.error("Get collections error:", error);
      res.status(500).json({ error: "Failed to get collections" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  // NOTE: Admin routes (make-admin, check, feature-flags/*, super-admin-analytics) have been moved to server/routes/adminRoutes.ts
  // Organization admin routes (extend-trial, toggle-demo, delete organization, clear-all-data, sync-leaderboard) also moved.

  // Sales Inquiry Routes
  app.post("/api/sales-inquiries", async (req: Request, res: Response) => {
    try {
      const data = insertSalesInquirySchema.parse(req.body);
      const inquiry = await storage.createSalesInquiry(data);
      res.status(201).json(inquiry);

      (async () => {
        try {
          const superAdmins = await storage.getSuperAdmins();
          if (superAdmins.length === 0) {
            console.log('[SalesInquiry] No superadmins found to notify');
            return;
          }
          const positionDisplay = data.position === 'Other' && data.positionOther ? data.positionOther : data.position;
          const sourceDisplay = data.hearAboutUs === 'Other' && data.hearAboutUsOther ? data.hearAboutUsOther : data.hearAboutUs;
          for (const admin of superAdmins) {
            try {
              await MailerSendService.sendEmail({
                recipientEmail: admin.email,
                recipientName: admin.firstName ? `${admin.firstName} ${admin.lastName || ''}`.trim() : admin.gamerName,
                subject: `New Request: ${data.name} ${data.surname} from ${data.organizationName}`,
                templateType: 'sales_inquiry_notification',
                templateVariables: {
                  inquiryName: data.name,
                  inquirySurname: data.surname,
                  inquiryEmail: data.email,
                  inquiryPhone: data.phone,
                  inquiryOrganization: data.organizationName,
                  inquiryPosition: positionDisplay,
                  inquiryStudentCount: data.studentCount,
                  inquirySource: sourceDisplay,
                  inquiryMessage: data.customMessage || '',
                },
              });
              console.log(`[SalesInquiry] Notification sent to superadmin ${admin.id}`);
            } catch (emailErr) {
              console.error(`[SalesInquiry] Failed to notify superadmin ${admin.id}:`, emailErr);
            }
          }
        } catch (notifyErr) {
          console.error('[SalesInquiry] Error during superadmin notification:', notifyErr);
        }
      })();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Create sales inquiry error:", error);
      res.status(500).json({ error: "Failed to create sales inquiry" });
    }
  });

  app.get("/api/sales-inquiries", isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const filters = {
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const inquiries = await storage.getAllSalesInquiries(filters);
      res.json(inquiries);
    } catch (error) {
      console.error("Get sales inquiries error:", error);
      res.status(500).json({ error: "Failed to get sales inquiries" });
    }
  });

  app.get("/api/sales-inquiries/:id", isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const inquiry = await storage.getSalesInquiry(req.params.id);
      if (!inquiry) {
        return res.status(404).json({ error: "Sales inquiry not found" });
      }
      res.json(inquiry);
    } catch (error) {
      console.error("Get sales inquiry error:", error);
      res.status(500).json({ error: "Failed to get sales inquiry" });
    }
  });

  app.patch("/api/sales-inquiries/:id/status", isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = updateSalesInquiryStatusSchema.parse(req.body);
      const userId = req.session.userId;
      const inquiry = await storage.updateSalesInquiryStatus(req.params.id, status, userId);
      if (!inquiry) {
        return res.status(404).json({ error: "Sales inquiry not found" });
      }
      res.json(inquiry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Update sales inquiry status error:", error);
      res.status(500).json({ error: "Failed to update sales inquiry status" });
    }
  });

  // NOTE: Dashboard stats, user management routes (GET /users, PATCH /users/:id/lock, PATCH /users/:id/unlock)
  // have been moved to server/routes/adminRoutes.ts
  // DELETE /users/:id is kept here due to comprehensive deletion logic across 30+ related tables
  app.delete("/api/admin/users/:id", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const onPremMode = process.env.ONPREM_MODE === 'true';
      const requestingUser = await storage.getUser(req.session.userId!);
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.isSuperAdmin && !requestingUser?.isSuperAdmin) {
        return res.status(403).json({ error: "Access denied: Only SuperAdmins can delete SuperAdmin users" });
      }
      if (onPremMode && user.isCustSuper && !user.isDisabled) {
        const activeCustSuperCountRows = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(and(eq(schema.users.isCustSuper, true), eq(schema.users.isDisabled, false)));
        const activeCustSuperCount = activeCustSuperCountRows[0]?.value ?? 0;
        if (activeCustSuperCount <= 1) {
          return res.status(400).json({
            error: "Operation blocked: on-prem system must always retain at least one active Customer Super Admin (CustSuper).",
          });
        }
      }

      // Use transaction to ensure all deletions succeed or none do
      await db.transaction(async (tx) => {
        // Delete user-related data in order (respecting foreign keys)


        // ============================================
        // PHASE 0: REMAINING CREDIT/ADMIN TABLES
        // ============================================

        // Delete bulk quiz generation jobs created by user
        await tx.delete(schema.bulkQuizGenerationJobs).where(eq(schema.bulkQuizGenerationJobs.createdBy, userId));

        // Nullify credit purchase packages attribution
        await tx.update(schema.creditPurchasePackages)
          .set({ createdBy: null })
          .where(eq(schema.creditPurchasePackages.createdBy, userId));

        await tx.update(schema.creditPurchasePackages)
          .set({ updatedBy: null })
          .where(eq(schema.creditPurchasePackages.updatedBy, userId));

        // Nullify quiz credit pricing attribution
        await tx.update(schema.quizCreditPricing)
          .set({ createdBy: null })
          .where(eq(schema.quizCreditPricing.createdBy, userId));

        await tx.update(schema.quizCreditPricing)
          .set({ updatedBy: null })
          .where(eq(schema.quizCreditPricing.updatedBy, userId));

        // Nullify shop item pricing attribution
        await tx.update(schema.shopItemPricing)
          .set({ createdBy: null })
          .where(eq(schema.shopItemPricing.createdBy, userId));

        // Nullify gamification economy rules attribution
        await tx.update(schema.gamificationEconomyRules)
          .set({ createdBy: null })
          .where(eq(schema.gamificationEconomyRules.createdBy, userId));

        // ============================================
        // PHASE 0B: USER NOTIFICATIONS & PREFERENCES
        // ============================================

        // Delete user notifications
        await tx.delete(schema.userNotifications).where(eq(schema.userNotifications.userId, userId));

        // Delete notification preferences
        await tx.delete(schema.notificationPreferences).where(eq(schema.notificationPreferences.userId, userId));

        // Delete login streaks
        await tx.delete(schema.loginStreaks).where(eq(schema.loginStreaks.userId, userId));

        // ============================================
        // PHASE 0C: COSMETICS & SEASON REWARDS
        // ============================================

        // Delete equipped cosmetics
        await tx.delete(schema.equippedCosmetics).where(eq(schema.equippedCosmetics.userId, userId));

        // Delete player season rewards
        await tx.delete(schema.playerSeasonRewards).where(eq(schema.playerSeasonRewards.userId, userId));

        // Delete user cosmetic loadouts
        await tx.delete(schema.userCosmeticLoadouts).where(eq(schema.userCosmeticLoadouts.userId, userId));

        // ============================================
        // PHASE 0D: COURSE VERSION & DRAFT TABLES
        // ============================================

        // Delete course version notifications
        await tx.delete(schema.courseVersionNotifications).where(eq(schema.courseVersionNotifications.userId, userId));

        // Delete course draft frameworks created by user
        await tx.delete(schema.courseDraftFrameworks).where(eq(schema.courseDraftFrameworks.createdBy, userId));

        // ============================================
        // PHASE 0E: MODERATION & REVIEWS
        // ============================================

        // Delete review moderation actions by user
        await tx.delete(schema.reviewModerationActions).where(eq(schema.reviewModerationActions.moderatorId, userId));

        // ============================================
        // PHASE 0F: USER LICENSES
        // ============================================

        // Nullify activatedBy/deactivatedBy in user licenses
        await tx.update(schema.userLicenses)
          .set({ activatedBy: null })
          .where(eq(schema.userLicenses.activatedBy, userId));

        await tx.update(schema.userLicenses)
          .set({ deactivatedBy: null })
          .where(eq(schema.userLicenses.deactivatedBy, userId));

        // Delete user licenses
        await tx.delete(schema.userLicenses).where(eq(schema.userLicenses.userId, userId));

        // ============================================
        // PHASE 1: CREDIT & PAYMENT TABLES
        // ============================================

        // Delete LP credit ledger entries
        await tx.delete(schema.lpCreditLedger).where(eq(schema.lpCreditLedger.userId, userId));

        // Delete org credit ledger entries where user was the actor
        await tx.delete(schema.orgCreditLedger).where(eq(schema.orgCreditLedger.actorUserId, userId));

        // Delete gamma credit ledger entries
        await tx.delete(schema.gammaCreditLedger).where(eq(schema.gammaCreditLedger.userId, userId));

        // Delete gamma credit snapshots
        await tx.delete(schema.gammaCreditSnapshots).where(eq(schema.gammaCreditSnapshots.userId, userId));

        // Delete user credit allocations
        await tx.delete(schema.userCreditAllocations).where(eq(schema.userCreditAllocations.userId, userId));

        // Delete user credit adjustments
        await tx.delete(schema.userCreditAdjustments).where(eq(schema.userCreditAdjustments.userId, userId));

        // Delete credit orders (uses purchaserId)
        await tx.delete(schema.creditOrders).where(eq(schema.creditOrders.purchaserId, userId));

        // Delete payment intents
        await tx.delete(schema.paymentIntents).where(eq(schema.paymentIntents.userId, userId));

        // ============================================
        // PHASE 1B: ADDITIONAL CREDIT/PAYMENT TABLES
        // ============================================

        // Delete credit transactions
        await tx.delete(schema.creditTransactions).where(eq(schema.creditTransactions.userId, userId));

        // Nullify adminUserId in credit transactions if exists
        await tx.update(schema.creditTransactions)
          .set({ adminUserId: null })
          .where(eq(schema.creditTransactions.adminUserId, userId));

        // Delete payment transactions
        await tx.delete(schema.paymentTransactions).where(eq(schema.paymentTransactions.userId, userId));

        // Nullify financial audit log userId (nullable)
        await tx.update(schema.financialAuditLog)
          .set({ userId: null })
          .where(eq(schema.financialAuditLog.userId, userId));

        // ============================================
        // PHASE 1C: COURSE REFUNDS & ENROLLMENTS
        // ============================================

        // Nullify decidedBy in course refunds
        await tx.update(schema.courseRefunds)
          .set({ decidedBy: null })
          .where(eq(schema.courseRefunds.decidedBy, userId));

        // Delete course refunds by user
        await tx.delete(schema.courseRefunds).where(eq(schema.courseRefunds.userId, userId));

        // Delete course version upgrades
        await tx.delete(schema.courseVersionUpgrades).where(eq(schema.courseVersionUpgrades.userId, userId));

        // Delete user course enrollments
        await tx.delete(schema.userCourseEnrollments).where(eq(schema.userCourseEnrollments.userId, userId));

        // Delete user course lesson progress
        await tx.delete(schema.userCourseLessonProgress).where(eq(schema.userCourseLessonProgress.userId, userId));

        // ============================================
        // PHASE 1D: ORGANIZATION LICENSES
        // ============================================

        // Nullify activatedBy/deactivatedBy in organization licenses
        await tx.update(schema.organizationLicenses)
          .set({ activatedBy: null })
          .where(eq(schema.organizationLicenses.activatedBy, userId));

        await tx.update(schema.organizationLicenses)
          .set({ deactivatedBy: null })
          .where(eq(schema.organizationLicenses.deactivatedBy, userId));

        // Delete organization licenses assigned to user
        await tx.delete(schema.organizationLicenses).where(eq(schema.organizationLicenses.userId, userId));

        // ============================================
        // PHASE 2: LEARNING PROGRESS TABLES
        // ============================================

        // Delete lesson progress slides first (child of lessonProgress)
        await tx.delete(schema.lessonProgressSlides).where(
          inArray(
            schema.lessonProgressSlides.lessonProgressId,
            tx.select({ id: schema.lessonProgress.id })
              .from(schema.lessonProgress)
              .where(eq(schema.lessonProgress.userId, userId))
          )
        );

        // Delete lesson progress
        await tx.delete(schema.lessonProgress).where(eq(schema.lessonProgress.userId, userId));

        // Delete daily streaks
        await tx.delete(schema.dailyStreaks).where(eq(schema.dailyStreaks.userId, userId));

        // Delete certificates
        await tx.delete(schema.certificates).where(eq(schema.certificates.userId, userId));

        // Delete lesson assignments where user is the student
        await tx.delete(schema.lessonAssignments).where(eq(schema.lessonAssignments.studentId, userId));

        // Delete lesson assignments where user was the assigner (assignedBy is notNull)
        await tx.delete(schema.lessonAssignments).where(eq(schema.lessonAssignments.assignedBy, userId));

        // Delete lesson scope assignments where user was the assigner (assignedBy is notNull)
        await tx.delete(schema.lessonScopeAssignments).where(eq(schema.lessonScopeAssignments.assignedBy, userId));

        // ============================================
        // PHASE 3: COURSE TABLES
        // ============================================

        // Delete course progress
        await tx.delete(schema.courseProgress).where(eq(schema.courseProgress.userId, userId));

        // Delete course purchases
        await tx.delete(schema.coursePurchases).where(eq(schema.coursePurchases.userId, userId));

        // Nullify moderatedBy in course reviews (preserve reviews but anonymize moderator)
        await tx.update(schema.courseReviews)
          .set({ moderatedBy: null })
          .where(eq(schema.courseReviews.moderatedBy, userId));

        // Delete course reviews by user
        await tx.delete(schema.courseReviews).where(eq(schema.courseReviews.userId, userId));

        // Delete course assignments where user is assigned
        await tx.delete(schema.courseAssignments).where(eq(schema.courseAssignments.userId, userId));

        // Delete course assignments where user was the assigner (assignedBy is notNull)
        await tx.delete(schema.courseAssignments).where(eq(schema.courseAssignments.assignedBy, userId));

        // ============================================
        // PHASE 4: GAME TABLES
        // ============================================

        // Delete game rooms hosted by user
        await tx.delete(schema.gameRooms).where(eq(schema.gameRooms.hostPlayerId, userId));

        // Set winnerId to null in game results (preserve game history)
        await tx.update(schema.gameResults)
          .set({ winnerId: null })
          .where(eq(schema.gameResults.winnerId, userId));

        // Delete quiz game results
        await tx.delete(schema.quizGameResults).where(eq(schema.quizGameResults.userId, userId));

        // ============================================
        // PHASE 4B: LESSON ACCESS & AUDIT LOGS
        // ============================================

        // Delete lesson access logs
        await tx.delete(schema.lessonAccessLogs).where(eq(schema.lessonAccessLogs.userId, userId));

        // ============================================
        // PHASE 5: BILLING/SUBSCRIPTION TABLES
        // ============================================

        // Get subscription IDs for user (subscriptions uses targetType/targetId)
        const userSubscriptions = await tx
          .select({ id: schema.subscriptions.id })
          .from(schema.subscriptions)
          .where(and(
            eq(schema.subscriptions.targetType, 'user'),
            eq(schema.subscriptions.targetId, userId)
          ));

        if (userSubscriptions.length > 0) {
          const subIds = userSubscriptions.map(s => s.id);

          // Delete subscription events
          await tx.delete(schema.subscriptionEvents).where(inArray(schema.subscriptionEvents.subscriptionId, subIds));

          // Delete subscription invoices
          await tx.delete(schema.subscriptionInvoices).where(inArray(schema.subscriptionInvoices.subscriptionId, subIds));

          // Delete subscriptions
          await tx.delete(schema.subscriptions).where(and(
            eq(schema.subscriptions.targetType, 'user'),
            eq(schema.subscriptions.targetId, userId)
          ));
        }

        // ============================================
        // PHASE 5B: SUBSCRIPTION AUDIT FIELDS
        // ============================================

        // Nullify processedBy in subscriptions
        await tx.update(schema.subscriptions)
          .set({ processedBy: null })
          .where(eq(schema.subscriptions.processedBy, userId));

        // Nullify initiatedBy in subscription events
        await tx.update(schema.subscriptionEvents)
          .set({ initiatedBy: null })
          .where(eq(schema.subscriptionEvents.initiatedBy, userId));

        // ============================================
        // PHASE 6: TOKENS, NOTIFICATIONS, LOGS
        // ============================================

        // Delete join request approval tokens where user is the admin
        await tx.delete(schema.joinRequestApprovalTokens).where(eq(schema.joinRequestApprovalTokens.adminUserId, userId));

        // Nullify userId in email logs (preserve logs but anonymize)
        await tx.update(schema.emailLogs)
          .set({ userId: null })
          .where(eq(schema.emailLogs.userId, userId));

        // ============================================
        // PHASE 7: CONTENT DELETION (createdBy is notNull)
        // ============================================

        // Delete lessons created by user (createdBy is notNull, can't nullify)
        await tx.delete(schema.lessons).where(eq(schema.lessons.createdBy, userId));

        // Delete courses created by user (createdBy is notNull, can't nullify)
        await tx.delete(schema.courses).where(eq(schema.courses.createdBy, userId));

        // ============================================
        // PHASE 7B: PRICING & REVENUE AUDIT FIELDS
        // ============================================

        // Nullify statusUpdatedBy in sales inquiries
        await tx.update(schema.salesInquiries)
          .set({ statusUpdatedBy: null })
          .where(eq(schema.salesInquiries.statusUpdatedBy, userId));

        // Nullify updatedBy in organization banking details
        await tx.update(schema.organizationBankingDetails)
          .set({ updatedBy: null })
          .where(eq(schema.organizationBankingDetails.updatedBy, userId));

        // Nullify updatedBy in currency conversion rates
        await tx.update(schema.currencyConversionRates)
          .set({ updatedBy: null })
          .where(eq(schema.currencyConversionRates.updatedBy, userId));

        // Nullify createdBy in payout batches
        await tx.update(schema.payoutBatches)
          .set({ createdBy: null })
          .where(eq(schema.payoutBatches.createdBy, userId));

        // Delete course price history where user is changedBy (notNull)
        await tx.delete(schema.coursePriceHistory).where(eq(schema.coursePriceHistory.changedBy, userId));

        // Delete license flag overrides where user set them (setBy is notNull)
        await tx.delete(schema.licenseFlagOverrides).where(eq(schema.licenseFlagOverrides.setBy, userId));


        // Nullify lesson versions editedBy
        await tx.update(schema.lessonVersions)
          .set({ editedBy: null })
          .where(eq(schema.lessonVersions.editedBy, userId));

        // Nullify gamma credit ledger initiatedByUserId
        await tx.update(schema.gammaCreditLedger)
          .set({ initiatedByUserId: null })
          .where(eq(schema.gammaCreditLedger.initiatedByUserId, userId));

        // Nullify user credit adjustments approvedBy
        await tx.update(schema.userCreditAdjustments)
          .set({ approvedBy: null })
          .where(eq(schema.userCreditAdjustments.approvedBy, userId));

        // Nullify platform configuration lastModifiedBy
        await tx.update(schema.platformConfiguration)
          .set({ lastModifiedBy: null })
          .where(eq(schema.platformConfiguration.lastModifiedBy, userId));

        // Nullify platform cost entries attribution
        await tx.update(schema.platformCostEntries)
          .set({ createdBy: null })
          .where(eq(schema.platformCostEntries.createdBy, userId));

        await tx.update(schema.platformCostEntries)
          .set({ updatedBy: null })
          .where(eq(schema.platformCostEntries.updatedBy, userId));

        // Nullify platform financial audit log changedBy
        await tx.update(schema.platformFinancialAuditLog)
          .set({ changedBy: null })
          .where(eq(schema.platformFinancialAuditLog.changedBy, userId));

        // Nullify platform report jobs requestedBy
        await tx.update(schema.platformReportJobs)
          .set({ requestedBy: null })
          .where(eq(schema.platformReportJobs.requestedBy, userId));

        // Nullify platform report schedules createdBy
        await tx.update(schema.platformReportSchedules)
          .set({ createdBy: null })
          .where(eq(schema.platformReportSchedules.createdBy, userId));

        // Nullify platform revenue sources userId
        await tx.update(schema.platformRevenueSources)
          .set({ userId: null })
          .where(eq(schema.platformRevenueSources.userId, userId));

        // ============================================
        // PHASE 8: ADMIN/AUDIT TABLES (SET NULL)
        // ============================================

        // Delete webhook registrations (registeredBy is notNull, can't nullify)
        await tx.delete(schema.webhookRegistrations).where(eq(schema.webhookRegistrations.registeredBy, userId));

        // Delete license rollout beta users entry
        await tx.delete(schema.licenseRolloutBetaUsers).where(eq(schema.licenseRolloutBetaUsers.userId, userId));

        // Nullify addedBy in license rollout beta users
        await tx.update(schema.licenseRolloutBetaUsers)
          .set({ addedBy: null })
          .where(eq(schema.licenseRolloutBetaUsers.addedBy, userId));

        // Nullify addedBy in license rollout organizations
        await tx.update(schema.licenseRolloutOrganizations)
          .set({ addedBy: null })
          .where(eq(schema.licenseRolloutOrganizations.addedBy, userId));

        // Nullify license flag audit changedBy
        await tx.update(schema.licenseFlagAudit)
          .set({ changedBy: null })
          .where(eq(schema.licenseFlagAudit.changedBy, userId));

        // Nullify system settings updatedBy
        await tx.update(schema.systemSettings)
          .set({ updatedBy: null })
          .where(eq(schema.systemSettings.updatedBy, userId));

        // Nullify platform pricing updatedBy
        await tx.update(schema.platformPricing)
          .set({ updatedBy: null })
          .where(eq(schema.platformPricing.updatedBy, userId));

        // Nullify platform payment settings updatedBy
        await tx.update(schema.platformPaymentSettings)
          .set({ updatedBy: null })
          .where(eq(schema.platformPaymentSettings.updatedBy, userId));

        // Nullify lesson credit pricing settings updatedBy
        await tx.update(schema.lessonCreditPricingSettings)
          .set({ updatedBy: null })
          .where(eq(schema.lessonCreditPricingSettings.updatedBy, userId));

        // Nullify trialGammaUserId in organizations
        await tx.update(schema.organizations)
          .set({ trialGammaUserId: null })
          .where(eq(schema.organizations.trialGammaUserId, userId));

        // ============================================
        // EXISTING DELETIONS (preserved from original)
        // ============================================

        // 1. Delete challenge progress
        await tx.delete(schema.challengeProgress).where(eq(schema.challengeProgress.userId, userId));
        
        // 2. Delete user quiz progress
        await tx.delete(schema.userQuizProgress).where(eq(schema.userQuizProgress.userId, userId));
        
        // 3. Delete quiz game progress
        await tx.delete(schema.quizGameProgress).where(eq(schema.quizGameProgress.userId, userId));
        
        // 4. Delete active quiz games where user is a player
        await tx.delete(schema.activeQuizGames).where(
          or(
            eq(schema.activeQuizGames.player1Id, userId),
            eq(schema.activeQuizGames.player2Id, userId)
          )
        );
        
        // 5. Delete player sessions
        await tx.delete(schema.playerSessions).where(eq(schema.playerSessions.playerId, userId));
        
        // 6. Delete active power-ups
        await tx.delete(schema.activePowerUps).where(eq(schema.activePowerUps.userId, userId));
        
        // 7. Delete power-up inventory
        await tx.delete(schema.powerUpInventory).where(eq(schema.powerUpInventory.userId, userId));
        
        // 8. Delete cosmetic ownership
        await tx.delete(schema.cosmeticOwnership).where(eq(schema.cosmeticOwnership.userId, userId));
        
        // 9. Delete achievement unlocks
        await tx.delete(schema.achievementUnlocks).where(eq(schema.achievementUnlocks.userId, userId));
        
        // 10. Delete season pass progress
        await tx.delete(schema.seasonPassProgress).where(eq(schema.seasonPassProgress.userId, userId));
        
        // 11. Delete season pass purchases
        await tx.delete(schema.seasonPassPurchases).where(eq(schema.seasonPassPurchases.userId, userId));
        
        // 12. Delete coin transactions
        await tx.delete(schema.coinTransactions).where(eq(schema.coinTransactions.userId, userId));
        
        // 13. Delete coin adjustments (as user)
        await tx.delete(schema.coinAdjustments).where(eq(schema.coinAdjustments.userId, userId));
        
        // 14. Delete user organization assignments
        await tx.delete(schema.userOrganizationAssignments).where(eq(schema.userOrganizationAssignments.userId, userId));
        
        // 15. Delete user organization roles
        await tx.delete(schema.userOrganizationRoles).where(eq(schema.userOrganizationRoles.userId, userId));
        
        // 16. Delete join requests (as requester)
        await tx.delete(schema.joinRequests).where(eq(schema.joinRequests.userId, userId));
        
        // 17. Delete player stats
        await tx.delete(schema.playerStats).where(eq(schema.playerStats.playerId, userId));
        
        // 18. Set reviewedBy to null in join requests they reviewed
        await tx.update(schema.joinRequests)
          .set({ reviewedBy: null })
          .where(eq(schema.joinRequests.reviewedBy, userId));
        
        // 19. Delete content with notNull createdBy fields
        // Delete AI configs created by user
        await tx.delete(schema.aiConfig)
          .where(eq(schema.aiConfig.createdBy, userId));
        
        // Delete quiz drafts created by user (drafts can be deleted safely)
        await tx.delete(schema.quizDrafts)
          .where(eq(schema.quizDrafts.createdBy, userId));
        
        // Handle subjects created by user - must delete dependencies first
        // Get subject IDs created by this user
        const userSubjects = await tx
          .select({ id: schema.subjects.id })
          .from(schema.subjects)
          .where(eq(schema.subjects.createdBy, userId));
        
        if (userSubjects.length > 0) {
          const subjectIds = userSubjects.map(s => s.id);
          
          // Delete unit-subject assignments
          await tx.delete(schema.unitSubjects)
            .where(inArray(schema.unitSubjects.subjectId, subjectIds));
          
          // Set subjectId to null in ALL tables with nullable subjectId (including for other users)
          await tx.update(schema.userOrganizationAssignments)
            .set({ subjectId: null })
            .where(inArray(schema.userOrganizationAssignments.subjectId, subjectIds));
          
          await tx.update(schema.quizCollections)
            .set({ subjectId: null })
            .where(inArray(schema.quizCollections.subjectId, subjectIds));
          
          await tx.update(schema.termDefinitions)
            .set({ subjectId: null })
            .where(inArray(schema.termDefinitions.subjectId, subjectIds));
          
          await tx.update(schema.quizCollectionAssignments)
            .set({ subjectId: null })
            .where(inArray(schema.quizCollectionAssignments.subjectId, subjectIds));
          
          // Note: quizDrafts already handled above
          
          // Now delete the subjects
          await tx.delete(schema.subjects)
            .where(eq(schema.subjects.createdBy, userId));
        }
        
        // 20. Set createdBy to null for items with nullable createdBy (keep items but remove attribution)
        await tx.update(schema.quizCollections)
          .set({ createdBy: null })
          .where(eq(schema.quizCollections.createdBy, userId));
        
        await tx.update(schema.adminChallengeConfig)
          .set({ createdBy: null })
          .where(eq(schema.adminChallengeConfig.createdBy, userId));
        
        await tx.update(schema.seasonPassConfig)
          .set({ createdBy: null })
          .where(eq(schema.seasonPassConfig.createdBy, userId));
        
        await tx.update(schema.universalStatUnits)
          .set({ createdBy: null })
          .where(eq(schema.universalStatUnits.createdBy, userId));
        
        // 21. Finally, delete the user account itself
        await tx.delete(schema.users).where(eq(schema.users.id, userId));
      });

      res.json({ 
        success: true, 
        message: `User ${user.gamerName || user.email} and all related data deleted successfully` 
      });
    } catch (error: any) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Failed to delete user", details: error.message });
    }
  });

  // Public endpoint for game cards (non-admin access for gameplay)
  app.get("/api/collections/:collectionId/cards", async (req: Request, res: Response) => {
    try {
      const { collectionId } = req.params;
      const cards = await storage.getCardsWithStats(collectionId);
      res.json(cards);
    } catch (error) {
      console.error("Get game cards error:", error);
      res.status(500).json({ error: "Failed to get game cards" });
    }
  });

  // Public endpoint for collection stat types (needed for gameplay)
  app.get("/api/collections/:collectionId/stat-types", async (req: Request, res: Response) => {
    try {
      const { collectionId } = req.params;
      const statTypes = await storage.getCollectionStatTypes(collectionId);
      res.json(statTypes);
    } catch (error) {
      console.error("Get game stat types error:", error);
      res.status(500).json({ error: "Failed to get stat types" });
    }
  });

  // Universal stat units routes
  app.get("/api/universal-stat-units", async (req: Request, res: Response) => {
    try {
      const units = await storage.getUniversalStatUnits();
      res.json(units);
    } catch (error) {
      console.error("Get universal stat units error:", error);
      res.status(500).json({ error: "Failed to get universal stat units" });
    }
  });

  // User route for creating custom stat units
  app.post("/api/custom-stat-units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const session = req.session;
      const userId = session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const validatedData = insertUniversalStatUnitSchema.parse({ 
        ...req.body, 
        isPredefined: false, 
        createdBy: userId 
      });
      const unit = await storage.createUniversalStatUnit(validatedData);
      res.status(201).json(unit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Create custom stat unit error:", error);
      res.status(500).json({ error: "Failed to create custom stat unit" });
    }
  });

  // Get custom stat units by user
  app.get("/api/custom-stat-units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const session = req.session;
      const userId = session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const customUnits = await storage.getCustomStatUnitsByUser(userId);
      res.json(customUnits);
    } catch (error) {
      console.error("Get custom stat units error:", error);
      res.status(500).json({ error: "Failed to get custom stat units" });
    }
  });

  // Serve card images by collection and card name
  app.get("/api/cards/image/:collectionName/:cardName", async (req: Request, res: Response) => {
    try {
      const { collectionName, cardName } = req.params;
      const objectStorageService = new ObjectStorageService();
      await objectStorageService.downloadCardImage(collectionName, cardName, res);
    } catch (error) {
      console.error("Download card image error:", error);
      if (!res.headersSent) {
        res.status(404).json({ error: "Image not found" });
      }
    }
  });

  // Serve card images by card ID (for gameplay)
  app.get("/api/cards/:id/image", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const card = await storage.getCard(id);
      if (!card || !card.imageKey) {
        return res.status(404).json({ error: "Card image not found" });
      }

      if (
        card.imageKey.includes('/source-asset/') ||
        card.imageKey.includes('/source-assets/') ||
        card.imageKey.startsWith('/private/')
      ) {
        const objectStorageService = new ObjectStorageService();
        const signedUrl = await objectStorageService.getCourseSourceAssetSignedURL(card.imageKey, 900);
        return res.redirect(signedUrl);
      }
      
      const collection = await storage.getCardCollection(card.collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      const objectStorageService = new ObjectStorageService();
      await objectStorageService.downloadCardImage(collection.name, card.name, res);
    } catch (error) {
      console.error("Download card image by ID error:", error);
      if (!res.headersSent) {
        res.status(404).json({ error: "Image not found" });
      }
    }
  });

  // Serve collection cover images
  app.get("/api/collections/:collectionId/cover-image", async (req: Request, res: Response) => {
    try {
      const collection = await storage.getCardCollection(req.params.collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      const objectStorageService = new ObjectStorageService();
      await objectStorageService.downloadCollectionCoverImage(collection.name, res);
    } catch (error) {
      console.error("Error downloading collection cover image:", error);
      if (!res.headersSent) {
        res.status(404).json({ error: "Image not found" });
      }
    }
  });

  // Game API Routes
  
  // Create a game lobby
  app.post("/api/game/create-lobby", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { collectionId, gameMode, roundTimeSeconds = 5, gameTimeSeconds = 120 } = req.body;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;
      
      if (!["single", "1v1", "4player"].includes(gameMode)) {
        return res.status(400).json({ error: "Invalid game mode" });
      }

      // Validate collection exists
      const collection = await storage.getCardCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      // Check if user already has an active lobby (prevent duplicates)
      const existingRooms = await storage.getActiveGameRooms();
      const userExistingRoom = existingRooms.find(room => room.hostPlayerId === userId);
      if (userExistingRoom) {
        console.log(`User ${userId} already has active lobby ${userExistingRoom.id}, returning existing room`);
        return res.json({ gameRoom: userExistingRoom, joinCode: userExistingRoom.joinCode });
      }

      const maxPlayers = gameMode === "single" ? 1 : gameMode === "1v1" ? 2 : 4;
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const gameRoom = await storage.createGameRoom({
        hostPlayerId: userId,
        collectionId,
        gameMode,
        maxPlayers,
        joinCode,
        gameState: "waiting",
        currentPlayers: 1,
        gameData: { roundTimeSeconds, gameTimeSeconds },
      });

      // Create player session for host
      await storage.createPlayerSession({
        gameRoomId: gameRoom.id,
        playerId: userId,
        playerName: "Host", // TODO: get actual player name
        playerPosition: 0,
        cardStack: [],
        cardCount: 0,
        isActive: true,
        isNPC: false,
      });

      res.json({ gameRoom, joinCode: gameRoom.joinCode });
    } catch (error) {
      console.error("Create lobby error:", error);
      console.error("Create lobby details:", {
        collectionId: req.body.collectionId,
        gameMode: req.body.gameMode,
        userId: req.session.userId,
        error: (error as Error).message
      });
      res.status(500).json({ error: "Failed to create lobby" });
    }
  });

  // Join a game lobby
  app.post("/api/game/join-lobby", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { joinCode } = req.body;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      // Find game room with matching join code
      const allGameRooms = await storage.getActiveGameRooms();
      const gameRoom = allGameRooms.find(room => room.joinCode === joinCode);
      if (!gameRoom) {
        return res.status(404).json({ error: "Game lobby not found" });
      }

      // Get player name for session
      let playerName = 'Player';
      if (req.session.userId) {
        const user = await storage.getUser(userId);
        playerName = user?.gamerName || 'Player';
      } else if (req.session.anonymousUserId) {
        const guestSession = await storage.getOrCreateGuestSession(userId);
        playerName = guestSession.guestName;
      }

      // Use atomic join operation to prevent race conditions
      const joinResult = await storage.atomicJoinGameRoom(gameRoom.id, userId, playerName);
      
      if (!joinResult.success) {
        return res.status(400).json({ error: joinResult.error });
      }

      const { playerSession, newPlayerCount, gameRoom: updatedRoom } = joinResult;

      // Auto-start game if lobby is now full (only if not already started)
      if (newPlayerCount === gameRoom.maxPlayers && gameRoom.gameState !== 'playing') {
        console.log(`🚀 Lobby full, auto-starting game ${gameRoom.id} with ${newPlayerCount} players`);
        
        try {
          // Double-check game hasn't been started by another request
          const currentGameRoom = await storage.getGameRoom(gameRoom.id);
          if (currentGameRoom?.gameState === 'playing') {
            console.log(`⚠️ Game ${gameRoom.id} already started by another request, skipping auto-start`);
            return res.json({ gameRoom: updatedRoom, playerSession });
          }
          
          // Update game state to playing
          await storage.updateGameRoom(gameRoom.id, { 
            gameState: "playing",
            gameStartedAt: new Date()
          });
          
          // Initialize the game with cards
          console.log(`🎮 Initializing game engine for room ${gameRoom.id}`);
          const gameState = await gameEngine.initializeGame(gameRoom.id);
          console.log(`✅ Game initialized with ${gameState.players.length} players, current player: ${gameState.currentPlayerPosition}`);
          
          // Emit game-started event only to the specific room (not globally)
          console.log(`📡 Emitting game-started event to room ${gameRoom.id}`);
          io.to(gameRoom.id).emit('game-started', { 
            gameRoomId: gameRoom.id,
            currentPlayerPosition: gameState.currentPlayerPosition,
            roundNumber: gameState.roundNumber,
            gameTimeSeconds: gameState.gameTimer,
            roundTimeSeconds: gameState.playerTimer,
            serverTime: Date.now(), // Add server timestamp for sync
            gameStartTimestamp: Date.now() // When game actually started
          });
          
          console.log(`🎯 Emitting player-turn event to room ${gameRoom.id}`);
          io.to(gameRoom.id).emit('player-turn', {
            gameRoomId: gameRoom.id,
            currentPlayerPosition: gameState.currentPlayerPosition,
            roundNumber: gameState.roundNumber
          });
          
        } catch (autoStartError) {
          console.error(`❌ Auto-start failed for game ${gameRoom.id}:`, autoStartError);
        }
      }

      res.json({ gameRoom: updatedRoom, playerSession });
    } catch (error) {
      console.error("Join lobby error:", error);
      console.error("Join lobby details:", {
        joinCode: req.body.joinCode,
        userId: req.session.userId || `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      res.status(500).json({ error: "Failed to join lobby" });
    }
  });

  // Get active game lobbies
  app.get("/api/game/lobbies", optionalAuth, async (req: Request, res: Response) => {
    try {
      const lobbies = await storage.getActiveGameRooms();
      res.json({ lobbies });
    } catch (error) {
      console.error("Get lobbies error:", error);
      res.status(500).json({ error: "Failed to get lobbies" });
    }
  });

  // Forfeit game
  app.post("/api/game/:gameRoomId/forfeit", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { gameRoomId } = req.params;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Verify player is in this game
      const playerSessions = await storage.getPlayerSessions(gameRoomId);
      const playerSession = playerSessions.find(session => session.playerId === userId);
      if (!playerSession) {
        return res.status(403).json({ error: "Not authorized - not in this game" });
      }

      // Process forfeit
      const forfeitResult = await gameEngine.forfeitGame(gameRoomId, userId);
      
      // Notify other players via socket
      const io = req.app.get('socketio');
      if (io) {
        io.to(gameRoomId).emit('player-forfeited', {
          forfeitedPlayer: forfeitResult.forfeitedPlayer,
          remainingPlayers: forfeitResult.remainingPlayers,
          gameEnded: forfeitResult.gameEnded,
          winner: forfeitResult.winner
        });
      }

      res.json({
        message: "Game forfeited successfully",
        gameEnded: forfeitResult.gameEnded,
        winner: forfeitResult.winner
      });
    } catch (error) {
      console.error("Forfeit game error:", error);
      console.error("Forfeit details:", {
        gameRoomId: req.params.gameRoomId,
        userId: req.session.userId || req.user?.id,
        error: (error as Error).message
      });
      res.status(500).json({ error: "Failed to forfeit game" });
    }
  });

  // Get game state
  app.get("/api/game/:gameRoomId", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { gameRoomId } = req.params;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      const gameRoom = await storage.getGameRoom(gameRoomId);
      if (!gameRoom) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Verify player is in this game
      const playerSessions = await storage.getPlayerSessions(gameRoomId);
      const playerSession = playerSessions.find(session => session.playerId === userId);
      if (!playerSession) {
        return res.status(403).json({ error: "Not authorized to view this game" });
      }

      res.json({ 
        gameRoom,
        playerSessions,
        isHost: gameRoom.hostPlayerId === userId,
        playerPosition: playerSession.playerPosition
      });
    } catch (error) {
      console.error("Get game state error:", error);
      res.status(500).json({ error: "Failed to get game state" });
    }
  });

  // Get current player cards for a game
  app.get("/api/game/:gameRoomId/current-cards", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { gameRoomId } = req.params;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      const gameRoom = await storage.getGameRoom(gameRoomId);
      if (!gameRoom) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Verify player is in this game
      const playerSessions = await storage.getPlayerSessions(gameRoomId);
      const playerSession = playerSessions.find(session => session.playerId === userId);
      if (!playerSession) {
        return res.status(403).json({ error: "Not authorized to view this game" });
      }

      // Get current top card for each player
      const currentCards = await Promise.all(
        playerSessions.map(async (session) => {
          if (!session.cardStack || session.cardStack.length === 0) {
            return { playerPosition: session.playerPosition, card: null, stats: [] };
          }
          
          // Get the top card (first in the stack)
          const topCardId = session.cardStack[0];
          const card = await storage.getCard(topCardId);
          const stats = card ? await storage.getCardStats(topCardId) : [];
          
          return {
            playerPosition: session.playerPosition,
            card,
            stats
          };
        })
      );

      res.json({ currentCards });
    } catch (error) {
      console.error("Get current cards error:", error);
      res.status(500).json({ error: "Failed to get current cards" });
    }
  });

  // Serve public objects (avatars, etc.) from object storage with caching
  app.get("/api/public-objects/:filePath(*)", async (req: Request, res: Response) => {
    try {
      const filePath = req.params.filePath;
      const objectStorageService = new ObjectStorageService();
      
      // Search for the file in public paths (uses cache + parallel search)
      // This will populate the cache with metadata if not already cached
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check cache AFTER search - searchPublicObject populates cache on miss
      const cachedMeta = objectStorageService.getCachedMetadata(filePath);
      
      if (cachedMeta) {
        // Fast path: use cached metadata, skip getMetadata() call
        res.set({
          "Content-Type": cachedMeta.contentType,
          "Content-Length": cachedMeta.size,
          "Cache-Control": "public, max-age=86400", // 24 hours for static assets
        });
        const stream = file.createReadStream();
        stream.on("error", (err) => {
          console.error("Stream error serving public object:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      } else {
        // Fallback: use downloadObject with longer TTL for static assets
        await objectStorageService.downloadObject(file, res, 86400);
      }
    } catch (error) {
      console.error("Error serving public object:", error);
      if (!res.headersSent) {
        res.status(404).json({ error: "File not found" });
      }
    }
  });

  // Function to save 1v1 game results and update user stats
  async function saveOneVOneGameResult(game: any, gameResult: string) {
    try {
      // Get player user IDs (filter out guest players and NPCs)
      const player1IsAuth = game.player1Id && !game.player1Id.startsWith('guest_');
      const player2IsAuth = game.player2Id && !game.player2Id.startsWith('guest_') && !game.player2Id.startsWith('npc_');
      
      // Determine winner ID for database
      let winnerId = null;
      if (gameResult === 'player1_wins' && player1IsAuth) {
        winnerId = game.player1Id;
      } else if (gameResult === 'player2_wins' && player2IsAuth) {
        winnerId = game.player2Id;
      }
      // For ties or guest wins, winnerId remains null but we need to handle it in database
      
      // Only save results if at least one authenticated player
      if (player1IsAuth || player2IsAuth) {
        console.log(`💾 Saving 1v1 game result: ${gameResult} (P1: ${game.player1Name}, P2: ${game.player2Name})`);
        
        // Calculate XP for authenticated players using XP service FIRST
        const { xpService } = await import("./xpService");
        let player1XPData = null;
        let player2XPData = null;
        const playerXPChanges: any = {};
        
        if (player1IsAuth) {
          const isTie = gameResult === 'tie';
          const gameOutcome = {
            playerId: game.player1Id,
            won: !isTie && gameResult === 'player1_wins',
            tied: isTie,
            gameMode: "1v1" as const,
            gameDuration: 120,
            totalRounds: game.roundNumber || 1,
            roundsWon: game.player1RoundsWon || 0,
          };
          const { updatedStats, xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);
          player1XPData = {
            xpResult,
            playerStats: updatedStats,
            gameWon: gameResult === 'player1_wins'
          };
          // Calculate final card count (actual remaining cards each player had when game ended)
          const player1FinalCards = JSON.parse(game.player1Deck || '[]').length;
          
          playerXPChanges[game.player1Id] = {
            xpChange: xpResult.totalXPChange,
            newXP: xpResult.newXP,
            newRank: updatedStats.currentRank || "Rookie",
            wasPromotion: xpResult.wasPromotion,
            finalCardCount: player1FinalCards
          };
          console.log(`🌟 Player 1 XP result:`, xpResult);
        }
        
        if (player2IsAuth) {
          const isTie = gameResult === 'tie';
          const gameOutcome = {
            playerId: game.player2Id,
            won: !isTie && gameResult === 'player2_wins',
            tied: isTie,
            gameMode: "1v1" as const,
            gameDuration: 120,
            totalRounds: game.roundNumber || 1,
            roundsWon: game.player2RoundsWon || 0,
          };
          const { updatedStats, xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);
          player2XPData = {
            xpResult,
            playerStats: updatedStats,
            gameWon: gameResult === 'player2_wins'
          };
          // Calculate final card count (actual remaining cards each player had when game ended)
          const player2FinalCards = JSON.parse(game.player2Deck || '[]').length;
          
          playerXPChanges[game.player2Id] = {
            xpChange: xpResult.totalXPChange,
            newXP: xpResult.newXP,
            newRank: updatedStats.currentRank || "Rookie",
            wasPromotion: xpResult.wasPromotion,
            finalCardCount: player2FinalCards
          };
          console.log(`🌟 Player 2 XP result:`, xpResult);
        }
        
        // Save to game results table with XP changes
        const gameResultData = {
          gameRoomId: null, // Single player games don't have game rooms
          collectionId: game.collectionId,
          winnerId: winnerId, // null if guest wins or tie
          gameMode: game.player2Id?.startsWith('npc_') ? 'single' as const : '1v1' as const,
          playerIds: [player1IsAuth ? game.player1Id : null, player2IsAuth ? game.player2Id : null].filter(Boolean),
          playerXPChanges: Object.keys(playerXPChanges).length > 0 ? playerXPChanges : null,
          totalRounds: game.roundNumber || 1,
          gameDuration: 120, // Default 2 minutes - could track actual duration later
          isMultiplayer: !game.player2Id?.startsWith('npc_'), // false for single player games
          gameStartedAt: new Date(Date.now() - 120000), // Approximate start time
          gameEndedAt: new Date(),
        };
        
        await storage.createGameResult(gameResultData);
        
        console.log(`✅ 1v1 game result saved successfully`);
        return { player1XPData, player2XPData };
      } else {
        console.log(`🎭 Skipping game result save - both players are guests`);
        return { player1XPData: null, player2XPData: null };
      }
    } catch (error) {
      console.error('❌ Error saving 1v1 game result:', error);
      // Continue game cleanup even if result saving fails
      return { player1XPData: null, player2XPData: null };
    }
  }


  // ========================================
  // SUBSCRIPTION CANCELLATION
  // ========================================

  // NOTE: Subscription cancellation routes moved to server/routes/paymentsRoutes.ts:
  // - POST /api/subscriptions/:subscriptionId/cancel
  // - POST /api/subscriptions/:subscriptionId/undo-cancel
  // - GET /api/subscriptions/:subscriptionId/cancellation-status

  /**
   * Admin: Get pending cancellations for organization
   */
  app.get('/api/admin/subscriptions/pending-cancellations', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const requestWithOrg = req as RequestWithOrgContext;
      const organizationId = requestWithOrg.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const pendingCancellations = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.targetId, organizationId),
            eq(schema.subscriptions.cancelAtPeriodEnd, true),
            or(
              eq(schema.subscriptions.status, 'active'),
              eq(schema.subscriptions.status, 'grace')
            )
          )
        )
        .orderBy(schema.subscriptions.currentPeriodEnd);

      res.json({ subscriptions: pendingCancellations });
    } catch (error) {
      console.error('Error getting pending cancellations:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========================================
  // USER NOTIFICATIONS
  // ========================================

  /**
   * Get user notification center
   */
  app.get('/api/notifications', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { limit = '50', offset = '0' } = req.query;

      const { NotificationService } = await import('./services/notificationService');

      const result = await NotificationService.getUserNotifications(
        userId,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json(result);
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Mark notification as read
   */
  app.post('/api/notifications/:id/read', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id: notificationId } = req.params;
      const userId = req.session.user.id;

      const { NotificationService } = await import('./services/notificationService');

      await NotificationService.markAsRead(notificationId, userId);

      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Get unread notification count
   */
  app.get('/api/notifications/unread-count', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;

      const { NotificationService } = await import('./services/notificationService');

      const count = await NotificationService.getUnreadCount(userId);

      res.json({ count });
    } catch (error) {
      console.error('Error getting unread count:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========================================
  // USER PREFERENCES & TIMEZONE
  // ========================================

  /**
   * Get user preferences (timezone and currency)
   */
  app.get('/api/user/preferences', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;

      const { TimezonePreferenceService } = await import('./services/timezonePreferenceService');

      const preferences = await TimezonePreferenceService.getUserPreferences(userId);

      res.json(preferences);
    } catch (error) {
      console.error('Error getting user preferences:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Update user timezone preference
   */
  app.put('/api/user/preferences/timezone', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { timezone } = req.body;

      if (!timezone) {
        return res.status(400).json({ error: 'Timezone is required' });
      }

      const normalizedTimezone = canonicalizeTimezone(timezone);
      if (!normalizedTimezone || !isValidIanaTimezone(normalizedTimezone)) {
        return res.status(400).json({ error: 'Invalid timezone. Use an IANA timezone (e.g., UTC, Africa/Johannesburg).' });
      }

      const { TimezonePreferenceService } = await import('./services/timezonePreferenceService');

      await TimezonePreferenceService.setTimezone(userId, normalizedTimezone);

      const newContext = await SessionContextService.buildSessionContext(userId);
      req.session.context = newContext;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json({ success: true, message: 'Timezone updated successfully' });
    } catch (error) {
      console.error('Error updating timezone:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Update user currency preference
   * Also clears needsCurrencyOnboarding flag and rebuilds session context
   */
  app.put('/api/user/preferences/currency', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { currency } = req.body;

      if (!currency) {
        return res.status(400).json({ error: 'Currency is required' });
      }

      const { TimezonePreferenceService } = await import('./services/timezonePreferenceService');
      const { SessionContextService } = await import('./services/sessionContextService');

      // Update currency and clear onboarding flag in one operation
      await db
        .update(users)
        .set({ 
          preferredCurrency: currency as 'ZAR' | 'USD' | 'EUR',
          needsCurrencyOnboarding: false,
        })
        .where(eq(users.id, userId));

      console.log(`User ${userId} currency updated to ${currency}, onboarding flag cleared`);

      // Rebuild session context to reflect the new preferences
      const newContext = await SessionContextService.buildSessionContext(userId);
      req.session.context = newContext;
      
      // Save the session to ensure changes persist
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({ 
        success: true, 
        message: 'Currency updated successfully',
        userPreferences: newContext.userPreferences,
      });
    } catch (error) {
      console.error('Error updating currency:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Get purchase history with timezone-adjusted timestamps
   */
  app.get('/api/user/purchase-history', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { limit = '50', offset = '0' } = req.query;

      const { TimezonePreferenceService } = await import('./services/timezonePreferenceService');

      const history = await TimezonePreferenceService.getPurchaseHistoryWithTimezone(
        userId,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json(history);
    } catch (error) {
      console.error('Error getting purchase history:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========================================
  // COURSE VERSION MANAGEMENT
  // ========================================

  /**
   * Create new course version (E-Learning Org Admin only)
   */
  app.post('/api/courses/:id/versions', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const { basePrice, baseCurrency, upgradePrice, description } = req.body;
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }

      const { CourseVersionService } = await import('./services/courseVersionService');

      const version = await CourseVersionService.createVersion({
        courseId,
        organizationId,
        basePrice: parseFloat(basePrice),
        baseCurrency: baseCurrency as 'ZAR' | 'USD' | 'EUR',
        upgradePrice: upgradePrice ? parseFloat(upgradePrice) : null,
        description,
      });

      res.json(version);
    } catch (error) {
      console.error('Error creating course version:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * List all versions for a course (public, shows published only)
   */
  app.get('/api/courses/:id/versions', async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const { includeUnpublished } = req.query;

      const { CourseVersionService } = await import('./services/courseVersionService');

      // Admin users can see unpublished versions
      const showAll = includeUnpublished === 'true' && req.session?.user?.role === 'admin';

      const versions = await CourseVersionService.listVersions(courseId, showAll);

      res.json(versions);
    } catch (error) {
      console.error('Error listing course versions:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Publish course version (E-Learning Org Admin only)
   */
  app.post('/api/courses/:courseId/versions/:versionId/publish', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId, versionId } = req.params;
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }

      const { CourseVersionService } = await import('./services/courseVersionService');

      const version = await CourseVersionService.publishVersion(versionId, courseId, organizationId);

      res.json(version);
    } catch (error) {
      console.error('Error publishing version:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Create YOCO checkout for version upgrade
   */
  app.post('/api/courses/:courseId/versions/:versionId/checkout', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId, versionId } = req.params;
      const { currency } = req.body;
      const userId = req.session.user.id;

      // Verify user owns the base course
      const existingPurchase = await db.query.coursePurchases.findFirst({
        where: and(
          eq(schema.coursePurchases.userId, userId),
          eq(schema.coursePurchases.courseId, courseId),
          eq(schema.coursePurchases.status, 'completed')
        ),
      });

      if (!existingPurchase) {
        return res.status(400).json({ error: 'You must own the base course to purchase upgrades' });
      }

      // Get version details
      const version = await db.query.courseVersions.findFirst({
        where: eq(schema.courseVersions.id, versionId),
      });

      if (!version || !version.isPublished) {
        return res.status(404).json({ error: 'Version not found or not published' });
      }

      // Check if user already owns this version
      const ownedVersion = await db.query.courseUpgradeOrders.findFirst({
        where: and(
          eq(schema.courseUpgradeOrders.userId, userId),
          eq(schema.courseUpgradeOrders.versionId, versionId),
          eq(schema.courseUpgradeOrders.status, 'completed')
        ),
      });

      if (ownedVersion) {
        return res.status(400).json({ error: 'You already own this version' });
      }

      const upgradePrice = version.upgradePrice || 0;
      const baseCurrency = version.baseCurrency as 'ZAR' | 'USD' | 'EUR';
      const displayCurrency = (currency as 'ZAR' | 'USD' | 'EUR') || baseCurrency;

      // Convert currency if needed
      let finalAmount = upgradePrice.toString();
      let finalCurrency = baseCurrency;

      if (displayCurrency !== baseCurrency) {
        const { ExchangeRateService } = await import('./services/exchangeRateService');
        const rate = await ExchangeRateService.getRate(baseCurrency, displayCurrency);
        if (rate) {
          finalAmount = (parseFloat(upgradePrice.toString()) * rate.rate).toFixed(2);
          finalCurrency = displayCurrency;
        }
      }

      // Create upgrade checkout
      const baseUrl = getBaseUrl();
      const checkout = await PaymentOrchestratorService.createUpgradeCheckout({
        userId,
        courseId,
        versionId,
        amount: finalAmount,
        currency: finalCurrency,
        originalAmount: upgradePrice.toString(),
        originalCurrency: baseCurrency,
        successUrl: `${baseUrl}/my-courses?upgrade=success`,
        cancelUrl: `${baseUrl}/my-courses?upgrade=cancelled`,
        failureUrl: `${baseUrl}/my-courses?upgrade=failed`,
      });

      if (!checkout.success || !checkout.checkoutUrl) {
        return res.status(500).json({ error: checkout.error || 'Failed to create upgrade checkout' });
      }

      console.log(`[Course Upgrade] Created checkout for version ${versionId}, user ${userId}`);

      res.json({
        checkoutUrl: checkout.checkoutUrl,
        paymentIntentId: checkout.paymentIntentId,
        amount: finalAmount,
        currency: finalCurrency,
      });
    } catch (error) {
      console.error('Error creating upgrade checkout:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========================================
  // LESSON-COURSE LINKAGE (E-LEARNING ORG ADMIN)
  // ========================================

  /**
   * Get available lessons for attachment to a course
   * Only returns lessons from the same organization that are NOT already linked to this course
   * Includes pagination and orders by createdAt DESC (newest first)
   */
  app.get('/api/admin/courses/:courseId/available-lessons', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
  app.post('/api/admin/courses/:courseId/lessons/:lessonId/link', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
  app.patch('/api/admin/courses/:courseId/lessons/reorder', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
      const invalidLessonIds = lessonOrdering.filter(item => !validLessonIds.has(item.lessonId));
      if (invalidLessonIds.length > 0) {
        return res.status(400).json({ 
          error: 'Some lessons are not linked to this course',
          code: 'INVALID_LESSON_IDS',
          invalidLessonIds: invalidLessonIds.map(item => item.lessonId)
        });
      }

      // Update topicOrder for each lesson
      const updatePromises = lessonOrdering.map(item => 
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
  app.get('/api/admin/courses/:id/lessons', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
  app.delete('/api/admin/courses/:courseId/lessons/:lessonId', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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

  // ========================================
  // BULK QUIZ GENERATION
  // ========================================

  /**
   * Generate quizzes for all course lessons
   */
  app.post('/api/admin/courses/:id/generate-quizzes', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }

      const { QuizCourseLinkerService } = await import('./services/quizCourseLinkerService');

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
  app.get('/api/admin/courses/:id/quiz-jobs/:jobId', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const { QuizCourseLinkerService } = await import('./services/quizCourseLinkerService');

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

  // ========================================
  // ORG REVENUE DASHBOARD (E-LEARNING ORG ADMIN)
  // ========================================

  /**
   * Get revenue summary for organization
   */
  app.get('/api/admin/revenue/summary', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }

      const { RevenueTrackingService } = await import('./services/revenueTrackingService');

      const summary = await RevenueTrackingService.getOrganizationRevenue(organizationId);

      res.json(summary);
    } catch (error) {
      console.error('Error getting revenue summary:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Get top courses by sales and rating
   */
  app.get('/api/admin/revenue/top-courses', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }
      const { limit = '10' } = req.query;

      const { RevenueTrackingService } = await import('./services/revenueTrackingService');

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
  app.get('/api/admin/revenue/monthly-trends', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }
      const { months = '12' } = req.query;

      const { RevenueTrackingService } = await import('./services/revenueTrackingService');

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
  app.get('/api/admin/revenue/breakdown', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }

      const { RevenueTrackingService } = await import('./services/revenueTrackingService');

      const breakdown = await RevenueTrackingService.getCourseRevenueBreakdown(organizationId);

      res.json(breakdown);
    } catch (error) {
      console.error('Error getting revenue breakdown:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========================================
  // REVIEW MODERATION (E-LEARNING ORG ADMIN)
  // ========================================

  /**
   * Get reviews for moderation with filtering
   */
  app.get('/api/admin/reviews', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
        filters.push(eq(schema.courseRatings.courseId, courseId as string));
      } else if (courseIds.length > 0) {
        filters.push(inArray(schema.courseRatings.courseId, courseIds));
      }

      if (minRating) {
        filters.push(gte(schema.courseRatings.rating, parseFloat(minRating as string)));
      }

      if (maxRating) {
        filters.push(lte(schema.courseRatings.rating, parseFloat(maxRating as string)));
      }

      if (isHidden !== undefined) {
        filters.push(eq(schema.courseRatings.isHidden, isHidden === 'true'));
      }

      const reviews = await db.query.courseRatings.findMany({
        where: filters.length > 0 ? and(...filters) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        orderBy: desc(schema.courseRatings.createdAt),
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
        .from(schema.courseRatings)
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
  app.get('/api/admin/reviews/moderation-queue', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
      const reviews = await db.query.courseRatings.findMany({
        where: and(
          inArray(schema.courseRatings.courseId, courseIds),
          or(
            lte(schema.courseRatings.rating, 3.0),
            eq(schema.courseRatings.isReported, true)
          )
        ),
        orderBy: [
          desc(schema.courseRatings.isReported),
          desc(schema.courseRatings.createdAt),
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

  app.patch('/api/reviews/:id/moderate', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const { id: reviewId } = req.params;
      const { isVisible } = req.body;
      const user = req.session.user;

      const review = await ReviewService.moderateReview(
        reviewId,
        isVisible,
        user.organizationId
      );

      res.json(review);
    } catch (error) {
      console.error('Error moderating review:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========================================
  // BANKING DETAILS (E-LEARNING ORG ADMIN)
  // ========================================

  /**
   * Get organization banking details
   */
  app.get('/api/admin/banking-details', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
  app.put('/api/admin/banking-details', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
  app.post('/api/admin/banking-details/verify', isSuperAdmin, async (req: Request, res: Response) => {
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
  // ORG SETTINGS (E-LEARNING ORG ADMIN)
  // ========================================

  /**
   * Get organization settings
   */
  app.get('/api/admin/settings', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
        defaultCurrency: org?.defaultCurrency || 'ZAR',
        creditBalance: org?.creditBalance || 0,
      });
    } catch (error) {
      console.error('Error getting org settings:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Update organization timezone
   */
  app.put('/api/admin/settings/timezone', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
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
  app.put('/api/admin/settings/currency', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }
      const { currency } = req.body;

      await db
        .update(schema.organizations)
        .set({ defaultCurrency: currency, updatedAt: new Date() })
        .where(eq(schema.organizations.id, organizationId));

      res.json({ success: true, message: 'Default currency updated' });
    } catch (error) {
      console.error('Error updating currency:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Download monthly statement (PDF/CSV)
   */
  app.get('/api/admin/statements/download', withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization context available' });
      }
      const { month, year, format = 'pdf' } = req.query;

      const { PayoutProcessorService } = await import('./services/payoutProcessorService');

      const statement = await PayoutProcessorService.generateMonthlyStatement(
        organizationId,
        parseInt(year as string),
        parseInt(month as string),
        format as 'pdf' | 'csv'
      );

      res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=statement-${year}-${month}.${format}`);
      res.send(statement);
    } catch (error) {
      console.error('Error downloading statement:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get credit balance for user (legacy endpoint - uses old allocation tables)
  app.get("/api/credits/balance", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = req.query;
      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const creditInfo = await CreditService.getCreditBalance(userId, organizationId);

      res.json(creditInfo);
    } catch (error) {
      console.error("Get credit balance error:", error);
      res.status(500).json({ error: "Failed to fetch credit balance" });
    }
  });

  // ==================== UNIFIED WALLET API ENDPOINTS ====================

  /**
   * Get user's LP Credit balance (new unified system)
   * Returns balance directly from users.lpCreditBalance column
   * Uses 30s cache headers for frontend optimization
   */
  app.get("/api/wallet/balance", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const balance = await UnifiedCreditService.getBalance(userId);

      // Wallet balance must always reflect latest purchase/deduction immediately.
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      
      res.json({ 
        balance,
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[Wallet] Get balance error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch wallet balance" });
    }
  });

  /**
   * Get user's LP Credit transaction history
   * Supports pagination, date filtering, and type filtering
   */
  app.get("/api/wallet/transactions", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
      const offset = parseInt(req.query.offset as string) || 0;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const type = req.query.type as string | undefined;

      // Validate type if provided
      const validTypes = ['purchase', 'deduction', 'refund', 'bonus', 'adjustment', 'subscription_topup', 'trial_grant'];
      if (type && !validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}`});
      }

      const result = await UnifiedCreditService.getTransactionHistory({
        userId,
        limit,
        offset,
        startDate,
        endDate,
        type: type as any,
      });

      res.json({
        transactions: result.transactions,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
        },
      });
    } catch (error: any) {
      console.error("[Wallet] Get transactions error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch transaction history" });
    }
  });

  // GET /api/wallet/hybrid-preview - Get hybrid credit availability for lesson generation
  app.get('/api/wallet/hybrid-preview', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const amount = parseInt(req.query.amount as string) || 0;
      
      // Resolve effective organization (handles impersonation)
      const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveResult?.organizationId;
      
      if (!organizationId) {
        return res.status(400).json({ error: 'No organization context available' });
      }
      
      // Use HybridCreditService.previewDeduction
      const preview = await HybridCreditService.previewDeduction({
        userId,
        organizationId,
        amount
      });
      
      res.json({
        canAfford: preview.canDeduct,
        creditSource: preview.creditSource,
        userBalance: preview.userBalance,
        orgBalance: preview.orgBalance,
        orgWalletEnabled: preview.orgWalletEnabled,
        canSpendOrgCredits: preview.userAuthorized,
        reason: preview.reason,
        userDeduction: preview.userAmountToDeduct,
        orgDeduction: preview.orgAmountToDeduct,
        totalAvailable: preview.userBalance + (preview.orgWalletEnabled && preview.userAuthorized ? preview.orgBalance : 0)
      });
    } catch (error) {
      console.error('[Wallet] Hybrid preview error:', error);
      res.status(500).json({ error: 'Failed to get hybrid credit preview' });
    }
  });

  // GET /api/wallet/transactions/:correlationId/receipt - Download receipt PDF for a purchase transaction
  app.get('/api/wallet/transactions/:correlationId/receipt', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { correlationId } = req.params;
      if (!correlationId) {
        return res.status(400).json({ error: 'Missing correlationId' });
      }

      // Look up the credit order by ID (correlationId is the order ID for purchase transactions)
      const [order] = await db
        .select()
        .from(schema.creditOrders)
        .where(eq(schema.creditOrders.id, correlationId))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify access: user must be the purchaser OR admin of the organization
      let hasAccess = order.purchaserId === userId;

      if (!hasAccess && order.organizationId) {
        // Check if user is admin of the organization
        const userRoles = await storage.getUserRoles(userId);
        const isOrgAdmin = userRoles.some(
          (role: any) => role.organizationId === order.organizationId && ADMIN_ROLES.includes(role.role)
        );
        if (isOrgAdmin) {
          hasAccess = true;
        }
      }

      // SuperAdmin always has access
      if (!hasAccess) {
        const user = await storage.getUser(userId);
        if (user?.isSuperAdmin) {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if receipt PDF exists
      if (!order.receiptPdfPath) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

      // Fetch the PDF using InvoiceService
      const pdfBuffer = await InvoiceService.getReceiptPDF(order.id);
      if (!pdfBuffer) {
        return res.status(404).json({ error: 'Receipt PDF not found' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${order.id.substring(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[Wallet] Receipt download error:', error);
      res.status(500).json({ error: 'Failed to download receipt' });
    }
  });


  // Get user's units (grades) for filtering
  app.get("/api/user/units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }
      
      const user = await storage.getUser(req.session.userId);
      
      // SuperAdmin returns empty (they must select an organization first)
      if (user?.isSuperAdmin) {
        return res.json([]);
      }
      
      // Check if user is admin/teacher - if so, return all organization units
      const userRoles = await storage.getUserRoles(req.session.userId);
      const teacherAdminRole = userRoles.find((role: any) => 
        [...ADMIN_ROLES, ...INSTRUCTOR_ROLES].includes(role.role)
      );
      
      if (teacherAdminRole) {
        // Return all units from the organization where user has teacher/admin privileges
        const units = await storage.getOrganizationUnits(teacherAdminRole.organizationId);
        res.json(units.map((u: any) => ({ id: u.id, name: u.name })));
      } else {
        // Student - return only their assigned units
        const userAssignments = await storage.getUserOrganizationAssignments(req.session.userId);
        const uniqueUnits = new Map();
        
        for (const assignment of userAssignments) {
          if (assignment.unitId && !uniqueUnits.has(assignment.unitId)) {
            const unit = await storage.getOrganizationUnit(assignment.unitId);
            if (unit) {
              uniqueUnits.set(assignment.unitId, { id: unit.id, name: unit.name });
            }
          }
        }
        
        res.json(Array.from(uniqueUnits.values()));
      }
    } catch (error) {
      console.error('Get user units error:', error);
      res.status(500).json({ error: "Failed to fetch user units" });
    }
  });

  // Get user's subjects for filtering
  app.get("/api/user/subjects", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }
      
      const user = await storage.getUser(req.session.userId);
      
      // SuperAdmin returns empty (they must select an organization first)
      if (user?.isSuperAdmin) {
        return res.json([]);
      }
      
      // Check if user is admin/teacher - if so, return all organization subjects
      const userRoles = await storage.getUserRoles(req.session.userId);
      const teacherAdminRole = userRoles.find((role: any) => 
        [...ADMIN_ROLES, ...INSTRUCTOR_ROLES].includes(role.role)
      );
      
      if (teacherAdminRole) {
        // Return all subjects from the organization where user has teacher/admin privileges
        const subjects = await storage.getSubjects(teacherAdminRole.organizationId);
        res.json(subjects.map((s: any) => ({ id: s.id, name: s.name })));
      } else {
        // Student - return only subjects from their assigned units
        const userAssignments = await storage.getUserOrganizationAssignments(req.session.userId);
        const uniqueSubjects = new Map();
        
        for (const assignment of userAssignments) {
          // Only fetch subjects for the user's assigned units (grades)
          if (assignment.unitId) {
            const unitSubjects = await storage.getUnitSubjects(assignment.unitId);
            for (const subject of unitSubjects) {
              if (!uniqueSubjects.has(subject.subjectId)) {
                uniqueSubjects.set(subject.subjectId, { 
                  id: subject.subjectId, 
                  name: subject.subjectName 
                });
              }
            }
          }
        }
        
        res.json(Array.from(uniqueSubjects.values()));
      }
    } catch (error) {
      console.error('Get user subjects error:', error);
      res.status(500).json({ error: "Failed to fetch user subjects" });
    }
  });

  // Get user's assigned subject IDs (only subjects they are actually assigned to)
  app.get("/api/user/subject-assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }
      
      // Get user's assignments
      const userAssignments = await storage.getUserOrganizationAssignments(req.session.userId);
      
      // Filter to get only subject assignments (subjectId is not null)
      const subjectIds = userAssignments
        .filter((a: any) => a.subjectId)
        .map((a: any) => a.subjectId);
      
      // Return unique subject IDs
      const uniqueSubjectIds = Array.from(new Set(subjectIds));
      res.json(uniqueSubjectIds);
    } catch (error) {
      console.error('Get user subject assignments error:', error);
      res.status(500).json({ error: "Failed to fetch subject assignments" });
    }
  });

  // Get user's organization roles and context
  app.get("/api/user/roles", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      // Prevent caching to ensure fresh organization data (including type field) is always fetched
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const sessionScope = SessionContextService.getCanonicalSessionScope(req.session.context);
      // Get user's organization roles
      const userRoles = sessionScope.organizationRoles.length > 0
        ? sessionScope.organizationRoles
        : await storage.getUserRoles(userId);
      
      const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const effectiveOrgId = effectiveResult.organizationId || null;
      const isImpersonating = effectiveResult.isImpersonation;
      const isTopAdmin = user.isSuperAdmin || user.isCustSuper;

      // For top admins, preserve impersonation context when present.
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
          organizations: filteredOrganizations.map((org: any) => ({
            id: org.id,
            name: org.name,
            type: org.type
          })),
          defaultOrganizationId,
          effectiveOrganizationId: defaultOrganizationId,
          isImpersonating,
          unitId: null,
          subUnitId: null,
        });
      }

      // For regular users, return their roles and organizations
      const uniqueOrgs = Array.from(new Set(userRoles.map((r: any) => r.organizationId)));
      const organizations = [];
      
      for (const orgId of uniqueOrgs) {
        const org = await storage.getOrganization(orgId);
        if (org) {
          organizations.push({ id: org.id, name: org.name, type: org.type });
        }
      }

      // Set default organization: prefer teacher/admin role org, otherwise first org
      let defaultOrganizationId = sessionScope.effectiveOrganizationId;
      if (!defaultOrganizationId && userRoles.length > 0) {
        const primaryRole = userRoles.find((r: any) => 
          [...ADMIN_ROLES, ...INSTRUCTOR_ROLES].includes(r.role)
        ) || userRoles[0];
        defaultOrganizationId = primaryRole.organizationId;
      }

      const effectiveOrganizationId = effectiveOrgId || defaultOrganizationId;
      const effectiveLocale = req.session.context?.userPreferences?.effectiveLocale ?? resolveEffectiveLocale({
        userTimezone: user.timezone ?? null,
        organizationTimezone: effectiveResult.organization?.orgTimezone ?? null,
        userCurrency: user.preferredCurrency ?? null,
        organizationCurrency: effectiveResult.organization?.orgCurrency ?? null,
      });

      // Only return assignment context for learner roles in the effective organization.
      // This avoids leaking/sticking cross-org unit filters during impersonation.
      let unitId: string | null = null;
      let subUnitId: string | null = null;
      if (effectiveOrganizationId) {
        const effectiveOrgRoles = userRoles.filter((role: any) => role.organizationId === effectiveOrganizationId);
        const hasLearnerRoleInEffectiveOrg = effectiveOrgRoles.some((role: any) => LEARNER_ROLES.includes(role.role));

        if (hasLearnerRoleInEffectiveOrg) {
          const userAssignments = await db
            .select({
              unitId: userOrganizationAssignments.unitId,
              subUnitId: userOrganizationAssignments.subUnitId,
            })
            .from(userOrganizationAssignments)
            .where(
              and(
                eq(userOrganizationAssignments.userId, userId),
                eq(userOrganizationAssignments.organizationId, effectiveOrganizationId)
              )
            )
            .orderBy(desc(userOrganizationAssignments.createdAt))
            .limit(1);

          unitId = userAssignments.length > 0 ? userAssignments[0].unitId : null;
          subUnitId = userAssignments.length > 0 ? userAssignments[0].subUnitId : null;
        }
      }

      res.json({
        isSuperAdmin: false,
        roles: userRoles,
        organizations,
        defaultOrganizationId,
        effectiveOrganizationId,
        isImpersonating: effectiveResult.isImpersonation,
        effectiveLocale,
        unitId,
        subUnitId
      });
    } catch (error) {
      console.error('Get user roles error:', error);
      res.status(500).json({ error: "Failed to fetch user roles" });
    }
  });

  // Get user preferences
  app.get("/api/user/preferences", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [primaryOrgRole] = await db
        .select({ timezone: organizations.timezone })
        .from(userOrganizationRoles)
        .innerJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
        .where(eq(userOrganizationRoles.userId, userId))
        .orderBy(desc(userOrganizationRoles.createdAt))
        .limit(1);

      // Return user preferences
      res.json({
        timezone: resolveEffectiveTimezone(user.timezone || null, primaryOrgRole?.timezone || null),
        preferredCurrency: user.preferredCurrency || null,
        emailNotifications: true, // Default for now
        pushNotifications: true, // Default for now
      });
    } catch (error) {
      console.error('Get user preferences error:', error);
      res.status(500).json({ error: "Failed to fetch user preferences" });
    }
  });

  // Update user preferences
  app.put("/api/user/preferences", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Validate input with Zod schema - timezone list matches client/src/utils/timezones.ts
      const VALID_TIMEZONES = [
        'UTC',
        'Etc/GMT',
        'Africa/Casablanca',
        'Africa/Cairo',
        'Africa/Johannesburg',
        'Africa/Lagos',
        'Africa/Nairobi',
        'America/Bogota',
        'America/Buenos_Aires',
        'America/Chicago',
        'America/Denver',
        'America/Lima',
        'America/Los_Angeles',
        'America/Mexico_City',
        'America/New_York',
        'America/Sao_Paulo',
        'America/Toronto',
        'America/Vancouver',
        'Asia/Bangkok',
        'Asia/Dubai',
        'Asia/Hong_Kong',
        'Asia/Jakarta',
        'Asia/Karachi',
        'Asia/Kolkata',
        'Asia/Manila',
        'Asia/Seoul',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Tehran',
        'Asia/Tokyo',
        'Australia/Adelaide',
        'Australia/Brisbane',
        'Australia/Melbourne',
        'Australia/Perth',
        'Australia/Sydney',
        'Europe/Amsterdam',
        'Europe/Athens',
        'Europe/Berlin',
        'Europe/Brussels',
        'Europe/Istanbul',
        'Europe/London',
        'Europe/Madrid',
        'Europe/Moscow',
        'Europe/Paris',
        'Europe/Rome',
        'Europe/Stockholm',
        'Europe/Vienna',
        'Europe/Warsaw',
        'Pacific/Auckland',
        'Pacific/Fiji',
        'Pacific/Honolulu',
      ] as const;

      const updatePreferencesSchema = z.object({
        timezone: z.enum(VALID_TIMEZONES as any).nullable().optional(),
        preferredCurrency: z.enum(['ZAR', 'USD', 'EUR']).nullable().optional(),
        emailNotifications: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
      });

      const validation = updatePreferencesSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid preferences data",
          details: validation.error.errors 
        });
      }

      const { timezone, preferredCurrency, emailNotifications, pushNotifications } = validation.data;

      // Update user in database
      const [updatedUser] = await db
        .update(users)
        .set({
          timezone: timezone !== undefined ? timezone : undefined,
          preferredCurrency: preferredCurrency !== undefined ? preferredCurrency : undefined,
          needsCurrencyOnboarding: preferredCurrency !== undefined ? false : undefined,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Rebuild session context to reflect the new preferences immediately
      const newContext = await SessionContextService.buildSessionContext(userId);
      req.session.context = newContext;
      
      // Save the session to ensure changes persist
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`User ${userId} preferences updated: timezone=${timezone}, currency=${preferredCurrency}`);

      res.json({
        timezone: updatedUser.timezone,
        preferredCurrency: updatedUser.preferredCurrency,
        emailNotifications: emailNotifications ?? true,
        pushNotifications: pushNotifications ?? true,
      });
    } catch (error) {
      console.error('Update user preferences error:', error);
      res.status(500).json({ error: "Failed to update user preferences" });
    }
  });

  // Get sales analytics for organization admins
  app.get("/api/sales-analytics", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // SuperAdmins should use PayoutManagement instead
      if (user.isSuperAdmin) {
        return res.status(403).json({ 
          error: "SuperAdmins should use Payout Management for analytics" 
        });
      }

      // Get user's organization - prefer admin role, otherwise first role
      const userRoles = await storage.getUserRoles(userId);
      if (userRoles.length === 0) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Find primary admin role, otherwise use first role
      const primaryRole = userRoles.find((r: any) => 
        ADMIN_ROLES.includes(r.role)
      ) || userRoles[0];

      const organizationId = primaryRole.organizationId;
      const org = await storage.getOrganization(organizationId);

      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // Get sales statistics
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get total sales, revenue, and active students
      const salesQuery = await db
        .select({
          totalSales: sql<number>`COUNT(*)::int`,
          totalRevenue: sql<string>`SUM(${courseEnrollments.price})::text`,
          activeStudents: sql<number>`COUNT(DISTINCT ${courseEnrollments.userId})::int`,
        })
        .from(courseEnrollments)
        .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
        .where(
          and(
            eq(courses.organizationId, organizationId),
            gte(courseEnrollments.enrolledAt, thirtyDaysAgo)
          )
        );

      const stats = salesQuery[0] || {
        totalSales: 0,
        totalRevenue: '0',
        activeStudents: 0,
      };

      // Get refund statistics
      // Note: creatorRefundAmount is what's actually refunded to user (originalAmount - platformCommission)
      // This is what should be subtracted from org revenue, not the full originalAmount
      // Include both 'approved' and 'paid' statuses for accurate revenue calculations
      // Cast TEXT column to numeric for proper arithmetic
      const refundQuery = await db
        .select({
          totalRefunds: sql<number>`COUNT(*) FILTER (WHERE ${schema.courseRefunds.status} IN ('approved', 'paid'))::int`,
          totalRefundAmount: sql<string>`COALESCE(SUM(CASE WHEN ${schema.courseRefunds.status} IN ('approved', 'paid') THEN ${schema.courseRefunds.creatorRefundAmount}::numeric ELSE 0 END), 0)::text`,
          pendingRefunds: sql<number>`COUNT(*) FILTER (WHERE ${schema.courseRefunds.status} = 'pending')::int`,
        })
        .from(schema.courseRefunds)
        .innerJoin(schema.coursePurchases, eq(schema.courseRefunds.purchaseId, schema.coursePurchases.id))
        .innerJoin(schema.courses, eq(schema.coursePurchases.courseId, schema.courses.id))
        .where(
          and(
            eq(schema.courses.organizationId, organizationId),
            gte(schema.courseRefunds.requestedAt, thirtyDaysAgo)
          )
        );

      const refundStats = refundQuery[0] || {
        totalRefunds: 0,
        totalRefundAmount: '0',
        pendingRefunds: 0,
      };

      // Calculate average order value
      const avgOrderValue = stats.totalSales > 0
        ? (parseFloat(stats.totalRevenue) / stats.totalSales).toFixed(2)
        : '0.00';

      // Get top performing courses
      const topCoursesQuery = await db
        .select({
          courseId: courses.id,
          courseTitle: courses.title,
          totalSales: sql<number>`COUNT(*)::int`,
          totalRevenue: sql<string>`SUM(${courseEnrollments.price})::text`,
          currency: courses.currency,
        })
        .from(courseEnrollments)
        .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
        .where(
          and(
            eq(courses.organizationId, organizationId),
            gte(courseEnrollments.enrolledAt, thirtyDaysAgo)
          )
        )
        .groupBy(courses.id, courses.title, courses.currency)
        .orderBy(sql`SUM(${courseEnrollments.price}) DESC`)
        .limit(5);

      res.json({
        stats: {
          totalRevenue: stats.totalRevenue || '0',
          totalSales: stats.totalSales || 0,
          activeStudents: stats.activeStudents || 0,
          averageOrderValue: avgOrderValue,
          currency: org.currency || 'ZAR',
          periodStart: thirtyDaysAgo.toISOString().split('T')[0],
          periodEnd: new Date().toISOString().split('T')[0],
          refunds: {
            totalRefunds: refundStats.totalRefunds || 0,
            totalRefundAmount: refundStats.totalRefundAmount || '0',
            pendingRefunds: refundStats.pendingRefunds || 0,
            netRevenue: (parseFloat(stats.totalRevenue || '0') - parseFloat(refundStats.totalRefundAmount || '0')).toFixed(2),
          },
        },
        topCourses: topCoursesQuery.map(course => ({
          courseId: course.courseId,
          courseTitle: course.courseTitle,
          totalSales: course.totalSales,
          totalRevenue: course.totalRevenue,
          currency: course.currency,
        })),
      });
    } catch (error) {
      console.error('Get sales analytics error:', error);
      res.status(500).json({ error: "Failed to fetch sales analytics" });
    }
  });



  // Get definition for a term by ID
  app.get("/api/terms/:termId", async (req: Request, res: Response) => {
    try {
      const term = await storage.getTermDefinitionById(req.params.termId);
      if (!term) {
        return res.status(404).json({ error: "Term not found" });
      }
      res.json(term);
    } catch (error) {
      console.error('Get term error:', error);
      res.status(500).json({ error: "Failed to get term definition" });
    }
  });

  // Define a new term on demand
  app.post("/api/terms/define", async (req: Request, res: Response) => {
    try {
      const { term, subjectId, grade } = req.body;
      
      if (!term) {
        return res.status(400).json({ error: "Term is required" });
      }
      
      // Check if term already exists
      let termDef = await storage.getTermDefinition(term, subjectId);
      
      if (!termDef) {
        // Get AI service
        const aiService = await AIService.getActiveConfig();
        if (!aiService) {
          return res.status(503).json({ error: "AI service not configured" });
        }
        
        // Generate definition with AI
        const definition = await aiService.defineTerm(term, { subject: subjectId, grade });
        
        // Save term
        termDef = await storage.createTermDefinition({
          term,
          definition,
          subjectId
        });
      }
      
      res.json(termDef);
    } catch (error) {
      console.error('Define term error:', error);
      res.status(500).json({ error: "Failed to define term" });
    }
  });


  app.get("/api/my-organization", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const userRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId));
      
      if (userRoles.length === 0) {
        return res.status(404).json({ error: "Not affiliated with an organization" });
      }

      const organization = await storage.getOrganization(userRoles[0].organizationId);
      res.json(organization);
    } catch (error) {
      console.error('Get my organization error:', error);
      res.status(500).json({ error: "Failed to fetch organization" });
    }
  });

  // Teacher Dashboard Routes
  app.get("/api/teacher/students", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.json([]);
      }
      
      const userRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId));
      
      if (userRoles.length === 0) {
        return res.json([]);
      }

      const orgId = userRoles[0].organizationId;
      
      // Get students in the same organization
      const students = await db
        .select({
          id: users.id,
          username: users.gamerName,
          role: userOrganizationRoles.role,
          unitName: organizationUnits.name,
          subUnitName: organizationSubUnits.name,
          unitId: userOrganizationAssignments.unitId,
          subUnitId: userOrganizationAssignments.subUnitId,
          assignmentId: userOrganizationAssignments.id,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(userOrganizationRoles.userId, users.id))
        .leftJoin(userOrganizationAssignments, eq(userOrganizationAssignments.userId, users.id))
        .leftJoin(organizationUnits, eq(organizationUnits.id, userOrganizationAssignments.unitId))
        .leftJoin(organizationSubUnits, eq(organizationSubUnits.id, userOrganizationAssignments.subUnitId))
        .where(eq(userOrganizationRoles.organizationId, orgId));
      
      res.json(students);
    } catch (error) {
      console.error('Get teacher students error:', error);
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  app.get("/api/teacher/progress", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.json([]);
      }
      
      const userRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId));
      
      if (userRoles.length === 0) {
        return res.json([]);
      }

      const organizationId = userRoles[0].organizationId;
      
      // Get all students in teacher's organization (across all units)
      const students = await db
        .select({
          userId: users.id,
          gamerName: users.gamerName,
          email: users.email,
          unitId: userOrganizationAssignments.unitId,
          subUnitId: userOrganizationAssignments.subUnitId,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(userOrganizationRoles.userId, users.id))
        .leftJoin(userOrganizationAssignments, eq(userOrganizationAssignments.userId, users.id))
        .where(and(
          eq(userOrganizationRoles.organizationId, organizationId),
          inArray(userOrganizationRoles.role, LEARNER_ROLES)
        ));
      
      // Get quiz progress and results for all students
      const progressData = [];
      
      for (const student of students) {
        // Get all quiz progress for this student
        const studentProgress = await db
          .select({
            collectionId: quizGameProgress.collectionId,
            collectionName: quizCollections.name,
            totalGamesPlayed: quizGameProgress.totalGamesPlayed,
            totalGamesWon: quizGameProgress.totalGamesWon,
            totalCorrectAnswers: quizGameProgress.totalCorrectAnswers,
            totalAnswers: quizGameProgress.totalAnswers,
            averageScore: quizGameProgress.averageScore,
            bestScore: quizGameProgress.bestScore,
            lastPlayedAt: quizGameProgress.lastPlayedAt,
          })
          .from(quizGameProgress)
          .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id))
          .where(and(
            eq(quizGameProgress.userId, student.userId),
            or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
          ));
        
        // Get user quiz progress for pass/fail status
        const userProgress = await db
          .select()
          .from(userQuizProgress)
          .where(eq(userQuizProgress.userId, student.userId));
        
        // For each collection the student has played
        for (const progress of studentProgress) {
          const quizProgress = userProgress.find((p: any) => p.collectionId === progress.collectionId);
          
          progressData.push({
            studentId: student.userId,
            studentName: student.gamerName,
            studentEmail: student.email,
            collectionId: progress.collectionId,
            collectionName: progress.collectionName,
            gamesPlayed: progress.totalGamesPlayed || 0,
            gamesWon: progress.totalGamesWon || 0,
            correctAnswers: progress.totalCorrectAnswers || 0,
            totalAnswers: progress.totalAnswers || 0,
            averageScore: Math.round(Number(progress.averageScore) || 0),
            bestScore: progress.bestScore || 0,
            lastPlayedAt: progress.lastPlayedAt,
            attempts: quizProgress?.attemptsCount || 0,
            completionStatus: quizProgress?.completionStatus || 'not_started',
            isPassed: quizProgress?.completionStatus === 'completed_passed',
            isFailed: quizProgress?.completionStatus === 'completed_failed',
            completionRate: (progress.totalAnswers && progress.totalAnswers > 0) 
              ? Math.round(((progress.totalCorrectAnswers || 0) / progress.totalAnswers) * 100) 
              : 0,
          });
        }
      }
      
      res.json(progressData);
    } catch (error) {
      console.error('Get teacher progress error:', error);
      res.status(500).json({ error: "Failed to fetch progress reports" });
    }
  });

  // Assign student to grade/class (teacher route)
  app.post("/api/teacher/assign-student", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { studentId, unitId, subUnitId } = req.body;

      if (!studentId || !unitId) {
        return res.status(400).json({ error: "Student ID and Unit ID are required" });
      }

      // Verify teacher has access to this organization
      const teacherRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId));

      if (teacherRoles.length === 0) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const organizationId = teacherRoles[0].organizationId;

      // Verify the unit belongs to the teacher's organization
      const unit = await db
        .select()
        .from(organizationUnits)
        .where(and(
          eq(organizationUnits.id, unitId),
          eq(organizationUnits.organizationId, organizationId)
        ));

      if (unit.length === 0) {
        return res.status(403).json({ error: "Unit not found or access denied" });
      }

      // Check if assignment already exists
      const existingAssignment = await db
        .select()
        .from(userOrganizationAssignments)
        .where(and(
          eq(userOrganizationAssignments.userId, studentId),
          eq(userOrganizationAssignments.unitId, unitId),
          subUnitId ? eq(userOrganizationAssignments.subUnitId, subUnitId) : sql`${userOrganizationAssignments.subUnitId} IS NULL`
        ));

      if (existingAssignment.length > 0) {
        return res.status(400).json({ error: "Student already assigned to this grade/class" });
      }

      // Create the assignment
      const assignment = await storage.assignUserToUnit(studentId, organizationId, unitId, subUnitId || undefined);
      res.json(assignment);
    } catch (error) {
      console.error('Assign student error:', error);
      res.status(500).json({ error: "Failed to assign student" });
    }
  });

  // Remove student assignment (teacher route)
  app.delete("/api/teacher/remove-student/:assignmentId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { assignmentId } = req.params;

      // Verify teacher has access to this organization
      const teacherRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId));

      if (teacherRoles.length === 0) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const organizationId = teacherRoles[0].organizationId;

      // Verify the assignment belongs to the teacher's organization
      const assignment = await db
        .select()
        .from(userOrganizationAssignments)
        .where(eq(userOrganizationAssignments.id, assignmentId));

      if (assignment.length === 0) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      if (assignment[0].organizationId !== organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.removeUserAssignment(assignmentId);
      res.json({ success: true });
    } catch (error) {
      console.error('Remove student assignment error:', error);
      res.status(500).json({ error: "Failed to remove assignment" });
    }
  });

  // ===========================
  // Subscription CRUD API
  // ===========================
  // NOTE: Subscription CRUD routes moved to server/routes/paymentsRoutes.ts:
  // - POST /api/subscriptions (SuperAdmin)
  // - GET /api/subscriptions/:id
  // - GET /api/subscriptions
  // - PATCH /api/subscriptions/:id
  // - POST /api/subscription-plans/:planId/purchase
  // - DELETE /api/subscriptions/:id/cancel
  // - GET /api/invoices
  // - GET /api/credit-orders
  // - GET /api/license/tiers
  // - GET /api/license/settings
  // - POST /api/license/checkout
  // - GET /api/license/users
  // - POST /api/license/users/:userId/activate
  // - POST /api/license/users/:userId/deactivate
  // - GET /api/webhooks/events
  // - GET /api/invoices/:id/download
  // - GET /api/receipts/:id/download

  // Subscription creation validation schema - kept for admin routes that may need it
  const createSubscriptionSchema = z.object({
    planId: z.string().uuid(),
    targetType: z.enum(['organization', 'user']),
    targetId: z.string().uuid(),
    autoRenew: z.boolean().optional().default(true),
  });

  // Subscription update validation schema - kept for admin routes that may need it
  const updateSubscriptionSchema = z.object({
    autoRenew: z.boolean().optional(),
  });

  // NOTE: Subscription routes removed - see paymentsRoutes.ts

  const httpServer = createServer(app);
  
  // Initialize Socket.IO for real-time game communication
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*", // In production, specify your domain
      methods: ["GET", "POST"]
    }
  });

  // Share session middleware with Socket.IO
  io.use((socket, next) => {
    sessionMiddleware(socket.request as any, {} as any, (err?: any) => {
      if (err) return next(err);
      next();
    });
  });

  // 1v1 Instant Matchmaking Queue
  const matchmakingQueue = new Map(); // collectionId -> array of waiting players
  
  // Quiz 1v1 Matchmaking Queue (separate from battle cards)
  const quizMatchmakingQueue = new Map(); // collectionId -> array of waiting quiz players
  
  // Note: 1v1 games now use database storage via storage.activeOneVOneGames table

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1v1 Instant Matchmaking
    socket.on('join-1v1-queue', async (data) => {
      const { collectionId, gameId, roundTime, gameTime, preferredMatchingMode } = data;
      const session = (socket.request as any).session;
      
      // Ensure we have a consistent user ID (don't create new ones if session already has one)
      let finalUserId = session?.userId || session?.anonymousUserId;
      
      // Only create anonymous user if no ID exists at all
      if (!finalUserId) {
        const utcTimestamp = Date.now();
        const anonymousId = `guest_${utcTimestamp}_${Math.random().toString(36).substr(2, 9)}`;
        session.anonymousUserId = anonymousId;
        finalUserId = anonymousId;
        console.log(`🎭 Socket created session-only guest user: ${anonymousId}`);
        // Don't create in database - keep it session-only for guests
      }
      console.log(`🎯 Player ${finalUserId} joining 1v1 queue for collection ${collectionId}`);
      console.log(`🎯 Queue settings: roundTime=${roundTime}s, gameTime=${gameTime}s, mode=${preferredMatchingMode || 'flexible'}`);
      
      // Get player info (name for display)
      let playerName = 'Guest';
      if (session?.userId) {
        const user = await storage.getUser(finalUserId);
        playerName = user?.gamerName || 'Player';
      } else {
        // Get guest session for consistent name
        const guestSession = await storage.getOrCreateGuestSession(finalUserId);
        playerName = guestSession.guestName;
      }
      
      // Enhanced matchmaking with host/quickJoin preferences
      const waitingPlayers = matchmakingQueue.get(collectionId) || [];
      console.log(`🎯 Current queue for collection ${collectionId}:`, waitingPlayers.length, 'waiting players');
      waitingPlayers.forEach((p: any, index: number) => {
        console.log(`  Player ${index + 1}: ${p.name} (${p.roundTime}s/${p.gameTime}s, ${p.matchingMode || 'flexible'})`);
      });
      
      let opponent = null;
      
      if (preferredMatchingMode === 'collection-only') {
        // Collection-only matching: Find any player for same collection, ignore timers
        opponent = waitingPlayers
          .sort((a: any, b: any) => a.joinedAt - b.joinedAt) // Longest waiting first
          .shift();
        console.log(`🎯 Collection-only matching:`, !!opponent, opponent ? `${opponent.name} found (will use their settings: ${opponent.roundTime}s/${opponent.gameTime}s)` : 'no players available');
      } else if (preferredMatchingMode === 'quickJoin') {
        // Quick Join: Find hosted games (players with host mode) - use their exact timer settings
        opponent = waitingPlayers
          .filter((p: any) => p.matchingMode === 'host')
          .sort((a: any, b: any) => a.joinedAt - b.joinedAt) // Longest waiting host first
          .shift();
        console.log(`🎯 QuickJoin looking for hosts:`, !!opponent, opponent ? `${opponent.name} hosting (${opponent.roundTime}s/${opponent.gameTime}s)` : 'no hosts available');
      } else if (preferredMatchingMode === 'host') {
        // Host Game: Find quick joiners or flexible players - they will use host's timer settings
        opponent = waitingPlayers
          .filter((p: any) => p.matchingMode === 'quickJoin' || p.matchingMode === 'flexible' || !p.matchingMode)
          .sort((a: any, b: any) => a.joinedAt - b.joinedAt) // Longest waiting joiner first
          .shift();
        console.log(`🎯 Host looking for joiners:`, !!opponent, opponent ? `${opponent.name} joining (will use host settings)` : 'no joiners available');
      } else {
        // Flexible matching: Standard compatible timer matching (±2 seconds) 
        const isTimerCompatible = (p1Time: number, p2Time: number) => Math.abs(p1Time - p2Time) <= 2;
        opponent = waitingPlayers
          .filter((p: any) => 
            (p.matchingMode === 'flexible' || !p.matchingMode) &&
            isTimerCompatible(p.roundTime, roundTime) && 
            isTimerCompatible(p.gameTime, gameTime)
          )
          .sort((a: any, b: any) => a.joinedAt - b.joinedAt) // Longest waiting first
          .shift();
        console.log(`🎯 Flexible matching:`, !!opponent, opponent ? `${opponent.name} (${opponent.roundTime}s/${opponent.gameTime}s)` : 'no compatible players');
      }
      
      if (opponent) {
        // Found a match! Remove opponent from queue
        const remainingPlayers = waitingPlayers.filter((p: any) => p.socketId !== opponent.socketId);
        matchmakingQueue.set(collectionId, remainingPlayers);
        
        // Create unique game session
        const matchGameId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const seed = Date.now(); // For synchronized card dealing
        
        // Determine timer settings and player roles based on matchmaking mode
        let finalRoundTime, finalGameTime, player1Data, player2Data, whoGoesFirst;
        
        if (preferredMatchingMode === 'collection-only') {
          // Collection-only: Use first player's (opponent's) settings, they go first (act as host)
          finalRoundTime = opponent.roundTime;
          finalGameTime = opponent.gameTime;
          player1Data = { id: opponent.userId, name: opponent.name, socketId: opponent.socketId };
          player2Data = { id: finalUserId, name: playerName, socketId: socket.id };
          whoGoesFirst = 'player1'; // First player (waiting player) goes first
          console.log(`🎯 Collection-only match - using first player's settings: ${finalRoundTime}s/${finalGameTime}s`);
        } else if (preferredMatchingMode === 'quickJoin' && opponent.matchingMode === 'host') {
          // Quick joiner found a host - use host's timer settings, host goes first
          finalRoundTime = opponent.roundTime;
          finalGameTime = opponent.gameTime;
          player1Data = { id: opponent.userId, name: opponent.name, socketId: opponent.socketId };
          player2Data = { id: finalUserId, name: playerName, socketId: socket.id };
          whoGoesFirst = 'player1'; // Host goes first
          console.log(`🎯 QuickJoin matched with Host - using host's settings: ${finalRoundTime}s/${finalGameTime}s`);
        } else if (preferredMatchingMode === 'host') {
          // Host found a joiner - use host's (current player's) timer settings, host goes first
          finalRoundTime = roundTime;
          finalGameTime = gameTime;
          player1Data = { id: finalUserId, name: playerName, socketId: socket.id };
          player2Data = { id: opponent.userId, name: opponent.name, socketId: opponent.socketId };
          whoGoesFirst = 'player1'; // Host goes first
          console.log(`🎯 Host matched with Joiner - using host's settings: ${finalRoundTime}s/${finalGameTime}s`);
        } else {
          // Flexible matching - use first player's (opponent's) settings, they go first
          finalRoundTime = opponent.roundTime;
          finalGameTime = opponent.gameTime;
          player1Data = { id: opponent.userId, name: opponent.name, socketId: opponent.socketId };
          player2Data = { id: finalUserId, name: playerName, socketId: socket.id };
          whoGoesFirst = 'player1'; // Waiting player goes first
          console.log(`🎯 Flexible match - using first player's settings: ${finalRoundTime}s/${finalGameTime}s`);
        }

        // Store active game in database
        const game = await storage.createActiveOneVOneGame({
          gameId: matchGameId,
          collectionId,
          player1Id: player1Data.id,
          player1Name: player1Data.name,
          player1SocketId: player1Data.socketId,
          player1Ready: false,
          player2Id: player2Data.id,
          player2Name: player2Data.name,
          player2SocketId: player2Data.socketId,
          player2Ready: false,
          currentTurn: whoGoesFirst,
          gamePhase: 'loading', // Changed from 'waiting' to 'loading'
          bothPlayersReady: false,
          roundTimeSeconds: finalRoundTime,
          gameTimeSeconds: finalGameTime,
        });
        
        console.log(`✅ Match found! ${playerName} vs ${opponent.name} for collection ${collectionId}`);
        console.log(`🎯 Game roles: P1(${player1Data.name}, ${player1Data.socketId}) vs P2(${player2Data.name}, ${player2Data.socketId})`);
        console.log(`⏱️ Using timer settings: ${finalRoundTime}s rounds, ${finalGameTime}s game`);
        
        // Notify current player with match found event
        socket.emit('match-found', {
          gameId: matchGameId,
          opponentName: opponent.name,
          collectionId,
          roundTimeSeconds: finalRoundTime,
          gameTimeSeconds: finalGameTime,
          seed,
          isPlayer1: player1Data.socketId === socket.id
        });
        
        // Notify opponent with match found event
        io.to(opponent.socketId).emit('match-found', {
          gameId: matchGameId,
          opponentName: playerName,
          collectionId,
          roundTimeSeconds: finalRoundTime,
          gameTimeSeconds: finalGameTime,
          seed,
          isPlayer1: player1Data.socketId === opponent.socketId
        });
        
        // Join both players to game room
        socket.join(matchGameId);
        io.sockets.sockets.get(opponent.socketId)?.join(matchGameId);
        
        // Broadcast queue update since a player was removed
        io.emit('queue-updated');
        
      } else {
        // No match found, add to queue
        const playerData = {
          userId: finalUserId,
          socketId: socket.id,
          name: playerName,
          collectionId,
          roundTime,
          gameTime,
          matchingMode: preferredMatchingMode || 'flexible',
          joinedAt: Date.now()
        };
        
        waitingPlayers.push(playerData);
        matchmakingQueue.set(collectionId, waitingPlayers);
        console.log(`⏳ Added ${playerName} to queue for collection ${collectionId}. Queue size: ${waitingPlayers.length}`);
        console.log(`⏳ Total active queues:`, matchmakingQueue.size);
        
        // Log all active queues for debugging
        console.log(`⏳ All queue status:`);
        Array.from(matchmakingQueue.entries()).forEach(([queueCollectionId, queuePlayers]) => {
          console.log(`  Collection ${queueCollectionId}: ${queuePlayers.length} players waiting`);
        });
        
        // Notify client they're in queue - no hard timeout, persistent queue
        socket.emit('matchmaking-queued', { 
          message: 'Searching for opponent...', 
          queuePosition: waitingPlayers.length,
          estimatedWait: Math.min(waitingPlayers.length * 3, 30) // Rough estimate in seconds
        });
        
        // Broadcast queue update to all waiting players
        io.emit('queue-updated');
        
        // Optional soft notification after extended wait (2 minutes) but keep them in queue
        setTimeout(() => {
          const stillWaiting = matchmakingQueue.get(collectionId) || [];
          const playerStillInQueue = stillWaiting.find((p: any) => p.socketId === socket.id);
          if (playerStillInQueue) {
            console.log(`🔄 Player ${playerName} still waiting after 2 minutes - keeping in queue`);
            socket.emit('matchmaking-update', { 
              message: 'Still searching... hang tight!',
              waitTime: Math.floor((Date.now() - playerStillInQueue.joinedAt) / 1000)
            });
          }
        }, 120000); // 2 minutes
      }
    });

    // Single Player vs NPC - Create immediate game with NPC opponent
    socket.on('join-single-player', async (data) => {
      const { collectionId, roundTime, gameTime } = data;
      const session = (socket.request as any).session;
      const userId = session?.userId || session?.anonymousUserId;
      
      // Create anonymous user if needed
      if (!userId) {
        const utcTimestamp = Date.now();
        const anonymousId = `guest_${utcTimestamp}_${Math.random().toString(36).substr(2, 9)}`;
        session.anonymousUserId = anonymousId;
      }
      
      const finalUserId = session?.userId || session?.anonymousUserId;
      console.log(`🤖 Player ${finalUserId} starting single player game for collection ${collectionId}`);
      console.log(`🤖 Single player settings: roundTime=${roundTime}s, gameTime=${gameTime}s`);
      
      // Get player info (name for display)
      let playerName = 'Guest';
      if (session?.userId) {
        const user = await storage.getUser(finalUserId);
        playerName = user?.gamerName || 'Player';
      } else {
        const guestSession = await storage.getOrCreateGuestSession(finalUserId);
        playerName = guestSession.guestName;
      }
      
      // Generate NPC opponent
      const npcName = getRandomNPCName();
      const npcId = `npc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create unique game session
      const singleGameId = `single_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const seed = Date.now(); // For synchronized card dealing
      
      // Store active single player game - player becomes player1, NPC becomes player2
      const game = await storage.createActiveOneVOneGame({
        gameId: singleGameId,
        collectionId,
        player1Id: finalUserId,
        player1Name: playerName,
        player1SocketId: socket.id,
        player1Ready: false,
        player2Id: npcId, // NPC player
        player2Name: npcName,
        player2SocketId: 'npc', // Special identifier for NPCs
        player2Ready: true, // NPCs are always ready
        currentTurn: 'player1', // Player goes first in single player
        gamePhase: 'waiting',
        bothPlayersReady: false, // Will be true once player is ready
        roundTimeSeconds: roundTime,
        gameTimeSeconds: gameTime
      });
      
      console.log(`🤖 Single player game created: ${playerName} vs ${npcName}`);
      
      // Immediately send opponent found event to player
      socket.emit('opponent-found', {
        gameId: singleGameId,
        opponentName: npcName,
        collectionId,
        roundTime,
        gameTime,
        seed,
        isPlayer1: true, // Player is always player1 in single player
        isNPCGame: true
      });
      
      // Join player to game room
      socket.join(singleGameId);
    });

    // Direct player-to-player matching
    socket.on('join-specific-player', async (data) => {
      const { targetPlayerId, targetCollectionId } = data;
      const session = (socket.request as any).session;
      const joinerUserId = session?.userId || session?.anonymousUserId;
      
      if (!joinerUserId) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      // Get joiner's info
      let joinerName = 'Guest';
      if (session?.userId) {
        const user = await storage.getUser(joinerUserId);
        joinerName = user?.gamerName || 'Player';
      } else {
        const guestSession = await storage.getOrCreateGuestSession(joinerUserId);
        joinerName = guestSession.guestName;
      }
      
      console.log(`🎯 Direct match request: ${joinerName} wants to join ${targetPlayerId} in collection ${targetCollectionId}`);
      
      // Find the target player in the queue
      const waitingPlayers = matchmakingQueue.get(targetCollectionId) || [];
      const targetPlayerIndex = waitingPlayers.findIndex((p: any) => p.userId === targetPlayerId);
      
      if (targetPlayerIndex === -1) {
        socket.emit('error', { message: 'Target player is no longer waiting' });
        return;
      }
      
      const targetPlayer = waitingPlayers[targetPlayerIndex];
      
      // Remove target player from queue
      waitingPlayers.splice(targetPlayerIndex, 1);
      matchmakingQueue.set(targetCollectionId, waitingPlayers);
      
      // Create match using target player's settings
      const matchGameId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const seed = Date.now();
      
      console.log(`✅ Direct match created! ${joinerName} joined ${targetPlayer.name} for collection ${targetCollectionId}`);
      console.log(`⏱️ Using target player's settings: ${targetPlayer.roundTime}s rounds, ${targetPlayer.gameTime}s game`);
      
      // Store active game in database (target player becomes player1, joiner becomes player2)
      const game = await storage.createActiveOneVOneGame({
        gameId: matchGameId,
        collectionId: targetCollectionId,
        player1Id: targetPlayer.userId,
        player1Name: targetPlayer.name,
        player1SocketId: targetPlayer.socketId,
        player1Ready: false,
        player2Id: joinerUserId,
        player2Name: joinerName,
        player2SocketId: socket.id,
        player2Ready: false,
        currentTurn: 'player1', // Target player (host) goes first
        gamePhase: 'loading',
        bothPlayersReady: false,
        roundTimeSeconds: targetPlayer.roundTime,
        gameTimeSeconds: targetPlayer.gameTime,
      });
      
      // Notify target player (becomes player1)
      io.to(targetPlayer.socketId).emit('match-found', {
        gameId: matchGameId,
        opponentName: joinerName,
        collectionId: targetCollectionId,
        roundTimeSeconds: targetPlayer.roundTime,
        gameTimeSeconds: targetPlayer.gameTime,
        seed,
        isPlayer1: true
      });
      
      // Notify joiner (becomes player2)
      socket.emit('match-found', {
        gameId: matchGameId,
        opponentName: targetPlayer.name,
        collectionId: targetCollectionId,
        roundTimeSeconds: targetPlayer.roundTime,
        gameTimeSeconds: targetPlayer.gameTime,
        seed,
        isPlayer1: false
      });
      
      // Join both players to game room
      socket.join(matchGameId);
      io.sockets.sockets.get(targetPlayer.socketId)?.join(matchGameId);
      
      // Broadcast queue update since a player was removed
      io.emit('queue-updated');
    });

    // Enhanced matchmaking: Player accepts match and navigates to game
    socket.on('join-match', async (data) => {
      const { gameId } = data;
      const game = await storage.getActiveOneVOneGame(gameId);
      
      if (!game) {
        console.log(`❌ Match not found for gameId: ${gameId}`);
        socket.emit('error', { message: 'Match not found' });
        return;
      }
      
      // Validate player is part of this match
      const isPlayer1 = game.player1SocketId === socket.id;
      const isPlayer2 = game.player2SocketId === socket.id;
      
      if (!isPlayer1 && !isPlayer2) {
        console.log(`❌ Socket ${socket.id} is not part of match ${gameId}`);
        socket.emit('error', { message: 'Not part of this match' });
        return;
      }
      
      const playerName = isPlayer1 ? game.player1Name : game.player2Name;
      console.log(`🎮 ${playerName} joined match ${gameId} and is loading game`);
      
      // Send match lobby update to both players showing who has joined
      const lobbyData = {
        gameId,
        phase: 'loading',
        player1: { name: game.player1Name, hasJoined: isPlayer1 || game.player1Ready },
        player2: { name: game.player2Name, hasJoined: isPlayer2 || game.player2Ready },
        collectionId: game.collectionId,
        roundTimeSeconds: game.roundTimeSeconds,
        gameTimeSeconds: game.gameTimeSeconds
      };
      
      // Update the specific player's join status
      if (isPlayer1) {
        lobbyData.player1.hasJoined = true;
      } else {
        lobbyData.player2.hasJoined = true;
      }
      
      // Broadcast lobby update to both players
      if (game.player1SocketId && game.player1SocketId !== 'npc') {
        io.to(game.player1SocketId).emit('match-lobby-update', lobbyData);
      }
      if (game.player2SocketId && game.player2SocketId !== 'npc') {
        io.to(game.player2SocketId).emit('match-lobby-update', lobbyData);
      }
    });

    // SERVER-AUTHORITATIVE 1v1 stat selection and game logic
    socket.on('select-stat', async (data) => {
      const { statTypeId, gameId } = data;
      const game = await storage.getActiveOneVOneGame(gameId);
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      // Validate it's the player's turn
      const isPlayer1 = game.player1SocketId === socket.id;
      const isPlayer2 = game.player2SocketId === socket.id;
      const isPlayerTurn = (isPlayer1 && game.currentTurn === 'player1') || 
                          (isPlayer2 && game.currentTurn === 'player2');
      
      if (!isPlayerTurn) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      console.log(`🂯 Server processing stat selection: ${statTypeId} by ${game.currentTurn} in game ${gameId}`);
      
      // Check if this stat was already tied in special tie mode
      const tiedStats = JSON.parse(game.tiedStats || '[]');
      const isSpecialTieMode = game.isSpecialTieMode === true;
      
      if (isSpecialTieMode && tiedStats.includes(statTypeId)) {
        socket.emit('error', { message: 'Stat already tied - select a different stat' });
        return;
      }
      
      try {
        // Parse current cards from server state
        const player1Card = JSON.parse(game.player1CurrentCard || '{}');
        const player2Card = JSON.parse(game.player2CurrentCard || '{}');
        
        if (!player1Card.stats || !player2Card.stats) {
          socket.emit('error', { message: 'Card data not found' });
          return;
        }
        
        // Server calculates winner based on selected stat
        const player1Stat = player1Card.stats.find((s: any) => s.statTypeId === statTypeId);
        const player2Stat = player2Card.stats.find((s: any) => s.statTypeId === statTypeId);
        
        if (!player1Stat || !player2Stat) {
          socket.emit('error', { message: 'Stat not found on cards' });
          return;
        }
        
        const player1Value = parseFloat(player1Stat.value || '0');
        const player2Value = parseFloat(player2Stat.value || '0');
        
        // Get stat type for comparison type
        const statType = await storage.getCollectionStatType(statTypeId);
        const comparisonType = statType?.comparisonType || "highest";
        
        // Use enhanced comparison logic
        const { compareStatValues } = await import("@shared/gameUtils");
        const comparison = compareStatValues(player1Value, player2Value, comparisonType as any);
        
        let roundWinner;
        if (comparison > 0) {
          roundWinner = 'player1';
        } else if (comparison < 0) {
          roundWinner = 'player2';
        } else {
          roundWinner = 'tie';
        }
        
        // SPECIAL TIE DETECTION: Check if someone has 1 card and this is a tie
        const player1DeckSize = JSON.parse(game.player1Deck || '[]').length;
        const player2DeckSize = JSON.parse(game.player2Deck || '[]').length;
        const hasPlayerWithOneCard = player1DeckSize === 1 || player2DeckSize === 1;
        
        if (roundWinner === 'tie' && hasPlayerWithOneCard && !isSpecialTieMode) {
          // FIRST SPECIAL TIE: Enter special tie mode
          // Identify which player has multiple cards (they become the active player)
          const player1HasMultipleCards = player1DeckSize > 1;
          const player2HasMultipleCards = player2DeckSize > 1;
          const activePlayerInTie = player1HasMultipleCards ? 'player1' : 'player2';
          
          console.log(`🎯 Special tie detected - Player with 1 card: ${player1DeckSize === 1 ? game.player1Name : game.player2Name}, stat: ${player1Stat.statName}`);
          console.log(`🎯 Active player in special tie: ${activePlayerInTie === 'player1' ? game.player1Name : game.player2Name} (has multiple cards)`);
          
          const updatedTiedStats = [statTypeId];
          await storage.updateActiveOneVOneGame(gameId, {
            isSpecialTieMode: true,
            tiedStats: JSON.stringify(updatedTiedStats),
            specialTieStatName: player1Stat.statName,
            currentTurn: activePlayerInTie, // Active player is the one with multiple cards
            roundPhase: 'selecting' // Reset to selecting phase for retry
          });
          
          // Send special tie response to both players
          const specialTieData = {
            gameId,
            statTypeId,
            player1Value,
            player2Value,
            tiedStatName: player1Stat.statName,
            tiedStats: updatedTiedStats,
            activePlayerInTie: activePlayerInTie,
            message: `${player1Stat.statName} tied! ${activePlayerInTie === 'player1' ? game.player1Name : game.player2Name} must choose a different stat.`
          };
          
          if (game.player1SocketId) {
            io.to(game.player1SocketId).emit('special-tie-retry', { ...specialTieData, isPlayer1: true, canSelectInTie: activePlayerInTie === 'player1' });
          }
          if (game.player2SocketId) {
            io.to(game.player2SocketId).emit('special-tie-retry', { ...specialTieData, isPlayer1: false, canSelectInTie: activePlayerInTie === 'player2' });
          }
          
          console.log(`🎯 Special tie retry initiated - tied stats: [${updatedTiedStats.join(', ')}], active player: ${activePlayerInTie}`);
          return;
          
        } else if (roundWinner === 'tie' && isSpecialTieMode) {
          // ADDITIONAL SPECIAL TIE: Add to existing tied stats
          const updatedTiedStats = [...tiedStats, statTypeId];
          console.log(`🎯 Another tie in special mode - stat: ${player1Stat.statName}`);
          
          // Maintain current active player (who has multiple cards)
          const activePlayerInTie = game.currentTurn;
          
          await storage.updateActiveOneVOneGame(gameId, {
            tiedStats: JSON.stringify(updatedTiedStats),
            roundPhase: 'selecting' // Reset to selecting phase for retry
          });
          
          // Send special tie response to both players
          const specialTieData = {
            gameId,
            statTypeId,
            player1Value,
            player2Value,
            tiedStatName: player1Stat.statName,
            tiedStats: updatedTiedStats,
            activePlayerInTie: activePlayerInTie,
            message: `${player1Stat.statName} also tied! ${activePlayerInTie === 'player1' ? game.player1Name : game.player2Name} must choose a different stat.`
          };
          
          if (game.player1SocketId) {
            io.to(game.player1SocketId).emit('special-tie-retry', { ...specialTieData, isPlayer1: true, canSelectInTie: activePlayerInTie === 'player1' });
          }
          if (game.player2SocketId) {
            io.to(game.player2SocketId).emit('special-tie-retry', { ...specialTieData, isPlayer1: false, canSelectInTie: activePlayerInTie === 'player2' });
          }
          
          console.log(`🎯 Special tie retry updated - tied stats: [${updatedTiedStats.join(', ')}], active player: ${activePlayerInTie}`);
          return;
        }
        
        // Debug: Show detailed stat comparison
        console.log(`🎯 Stat Comparison for ${player1Stat.statName}:`);
        console.log(`   Player 1 (${game.player1Name}): ${player1Card.name} = ${player1Value}`);
        console.log(`   Player 2 (${game.player2Name}): ${player2Card.name} = ${player2Value}`);
        console.log(`🏆 Server calculated winner: ${roundWinner} (P1: ${player1Value} vs P2: ${player2Value})`);
        
        // SINGLE WINNER: Clear special tie mode if it was active
        const updateData: any = {
          selectedStatTypeId: statTypeId,
          roundWinner: roundWinner,
          roundPhase: 'revealing'
        };
        
        if (isSpecialTieMode && roundWinner !== 'tie') {
          // Clear special tie mode since we have a winner
          updateData.isSpecialTieMode = false;
          updateData.tiedStats = null;
          updateData.specialTieStatName = null;
          console.log(`🎯 Special tie mode cleared - winner: ${roundWinner}`);
        }
        
        // Update game state with selection and result
        await storage.updateActiveOneVOneGame(gameId, updateData);
        
        console.log(`📝 Game state updated with roundWinner: ${roundWinner}`);
        
        // Calculate cards that will be won for animation display
        const tiedCards = JSON.parse(game.tiedCards || '[]');
        const cardsFromTie = tiedCards.length;
        const cardsWonThisRound = roundWinner === 'tie' ? 0 : 2 + cardsFromTie; // Own card + opponent's card + tied cards
        
        // STEP 1: Send synchronized stat reveal to both players
        const revealData = {
          gameId,
          statTypeId,
          player1Value,
          player2Value,
          roundWinner,
          player1Card,
          player2Card,
          cardsWonThisRound, // Total cards won (including tied cards from previous rounds)
          cardsFromTie // Show how many are from previous ties
        };
        
        if (game.player1SocketId) {
          io.to(game.player1SocketId).emit('stat-reveal-1v1', {
            ...revealData,
            isPlayer1: true,
            myValue: player1Value,
            opponentValue: player2Value
          });
        }
        
        if (game.player2SocketId) {
          io.to(game.player2SocketId).emit('stat-reveal-1v1', {
            ...revealData,
            isPlayer1: false,
            myValue: player2Value,
            opponentValue: player1Value
          });
        }
        
        // Pause timers for animation when revealing stats
        if (game.player1SocketId && game.player1SocketId !== 'npc') {
          io.to(game.player1SocketId).emit('pause-timers');
        }
        if (game.player2SocketId && game.player2SocketId !== 'npc') {
          io.to(game.player2SocketId).emit('pause-timers');
        }
        console.log('⏸️ Server paused timers for animations');
        
        // STEP 2: Don't auto-process after 3 seconds - wait for animation-complete signal
        // The processRoundResult will be called when client sends 'animation-complete'
        
      } catch (error) {
        console.error('❌ Error processing stat selection:', error);
        socket.emit('error', { message: 'Failed to process stat selection' });
      }
    });
    
    // Function to update user stats after a game
    async function updateUserStatsAfterGame(userId: string, didWin: boolean) {
      try {
        const user = await storage.getUser(userId);
        if (!user) return;
        
        const newTotalGames = (user.totalGamesPlayed || 0) + 1;
        const newTotalWins = didWin ? (user.totalWins || 0) + 1 : (user.totalWins || 0);
        const newWinPercentage = Math.round((newTotalWins / newTotalGames) * 100);
        
        // Update win streak
        let newWinStreak = user.currentWinStreak || 0;
        let newBestWinStreak = user.bestWinStreak || 0;
        
        if (didWin) {
          newWinStreak += 1;
          newBestWinStreak = Math.max(newBestWinStreak, newWinStreak);
        } else {
          newWinStreak = 0;
        }
        
        // Update user stats directly using the database
        await db.update(users)
          .set({
            totalGamesPlayed: newTotalGames,
            totalWins: newTotalWins,
            winPercentage: newWinPercentage.toString(),
            currentWinStreak: newWinStreak,
            bestWinStreak: newBestWinStreak,
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));
        
        // Also update leaderBoard table for profile page display
        await updateLeaderBoardEntry(user, newTotalGames, newTotalWins, newWinPercentage, newWinStreak, newBestWinStreak);
        
        console.log(`📊 Updated stats for ${user.gamerName}: ${newTotalWins}/${newTotalGames} wins (${newWinPercentage}%), streak: ${newWinStreak}`);
      } catch (error) {
        console.error('❌ Error updating user stats:', error);
      }
    }
    
    // Military rank system based on wins and win percentage
    function calculatePlayerRank(totalWins: number, winPercentage: number, totalGames: number): string {
      // Minimum games required for rank progression
      if (totalGames < 3) return 'Recruit';
      
      // Military rank progression based on wins and win percentage
      if (totalWins >= 100 && winPercentage >= 85) return 'General';
      if (totalWins >= 75 && winPercentage >= 80) return 'Colonel';
      if (totalWins >= 50 && winPercentage >= 75) return 'Major';
      if (totalWins >= 30 && winPercentage >= 70) return 'Captain';
      if (totalWins >= 20 && winPercentage >= 65) return 'Lieutenant';
      if (totalWins >= 15 && winPercentage >= 60) return 'Sergeant';
      if (totalWins >= 10 && winPercentage >= 55) return 'Corporal';
      if (totalWins >= 5 && winPercentage >= 50) return 'Specialist';
      if (totalWins >= 3 && winPercentage >= 40) return 'Private';
      
      // Default rank for new players
      return 'Recruit';
    }
    
    // Function to update leaderBoard table entry
    async function updateLeaderBoardEntry(user: any, totalGames: number, totalWins: number, winPercentage: number, currentStreak: number, bestStreak: number) {
      try {
        // Check if user exists in leaderboard
        const existingEntry = await db
          .select()
          .from(leaderBoard)
          .where(eq(leaderBoard.gamerName, user.gamerName))
          .limit(1);
        
        // Calculate new rank based on performance
        const newRank = calculatePlayerRank(totalWins, winPercentage, totalGames);
        
        const leaderboardData = {
          gamerName: user.gamerName,
          avatarImageUrl: user.avatarImageUrl,
          country: user.country,
          playerTitle: newRank,
          totalWins: totalWins,
          totalGames: totalGames,
          winPercentage: winPercentage.toString(),
          bestWinStreak: bestStreak,
          currentWinStreak: currentStreak,
          averageGameDuration: user.averageGameDuration || 0,
          lastActiveAt: new Date(),
          updatedAt: new Date()
        };
        
        // Also update user's playerTitle in users table
        await db.update(users)
          .set({ playerTitle: newRank, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        
        if (existingEntry.length > 0) {
          // Update existing leaderboard entry
          await db.update(leaderBoard)
            .set(leaderboardData)
            .where(eq(leaderBoard.gamerName, user.gamerName));
          console.log(`📊 Updated leaderboard entry for ${user.gamerName}`);
        } else {
          // Create new leaderboard entry
          await db.insert(leaderBoard)
            .values({
              ...leaderboardData,
              createdAt: new Date()
            });
          console.log(`📊 Created new leaderboard entry for ${user.gamerName}`);
        }
      } catch (error) {
        console.error('❌ Error updating leaderboard entry:', error);
      }
    }
    
    // Track active NPC processing to prevent duplicates and store timeouts
    const npcProcessingGames = new Set<string>();
    const gameTimeouts = new Map<string, Set<NodeJS.Timeout>>();

    // Server function to process round results and advance game
    async function processRoundResult(gameId: string, roundWinner: string) {
      try {
        const game = await storage.getActiveOneVOneGame(gameId);
        if (!game) return;
        
        console.log(`🔄 Server processing round result for game ${gameId}: ${roundWinner}`);
        
        // Calculate current game timer value for sync
        const gameTimeElapsed = (Date.now() - new Date(game.gameStartedAt || new Date()).getTime()) / 1000;
        const gameTimeRemaining = Math.max(0, Math.floor((game.gameTimeSeconds || 120) - gameTimeElapsed));
        
        // Parse current game state
        const player1Deck = JSON.parse(game.player1Deck || '[]');
        const player2Deck = JSON.parse(game.player2Deck || '[]');
        const player1WonCards = JSON.parse(game.player1WonCards || '[]');
        const player2WonCards = JSON.parse(game.player2WonCards || '[]');
        const tiedCards = JSON.parse(game.tiedCards || '[]');
        const player1Card = JSON.parse(game.player1CurrentCard || '{}');
        const player2Card = JSON.parse(game.player2CurrentCard || '{}');
        
        // Remove current cards from decks
        const newPlayer1Deck = player1Deck.slice(1);
        const newPlayer2Deck = player2Deck.slice(1);
        let newPlayer1WonCards = [...player1WonCards];
        let newPlayer2WonCards = [...player2WonCards];
        let newTiedCards = [...tiedCards];
        
        // Distribute cards based on winner (proper card game rules)
        if (roundWinner === 'player1') {
          // Player 1 wins: add opponent's card + tied cards to BACK of Player 1's deck
          // Winner keeps their own winning card (it was already removed from deck)
          newPlayer1Deck.push(player1Card, player2Card, ...tiedCards);
          newTiedCards = [];
          console.log(`🏆 Player 1 wins round - added ${2 + tiedCards.length} cards to back of deck (own card + opponent's card + ${tiedCards.length} from ties)`);
        } else if (roundWinner === 'player2') {
          // Player 2 wins: add opponent's card + tied cards to BACK of Player 2's deck
          // Winner keeps their own winning card (it was already removed from deck)
          newPlayer2Deck.push(player2Card, player1Card, ...tiedCards);
          newTiedCards = [];
          console.log(`🏆 Player 2 wins round - added ${2 + tiedCards.length} cards to back of deck (own card + opponent's card + ${tiedCards.length} from ties)`);
        } else {
          // Tie: both cards go to middle pile for next winner
          newTiedCards.push(player1Card, player2Card);
          console.log(`🤝 Round tied - ${newTiedCards.length} total cards in middle pile`);
        }
        
        // Track rounds won for XP calculation and display
        const player1RoundsWon = (game.player1RoundsWon || 0) + (roundWinner === 'player1' ? 1 : 0);
        const player2RoundsWon = (game.player2RoundsWon || 0) + (roundWinner === 'player2' ? 1 : 0);
        console.log(`📊 Rounds won: P1=${player1RoundsWon}, P2=${player2RoundsWon}`);
        
        // Get next cards (top of each player's deck)
        const nextPlayer1Card = newPlayer1Deck.length > 0 ? newPlayer1Deck[0] : null;
        const nextPlayer2Card = newPlayer2Deck.length > 0 ? newPlayer2Deck[0] : null;
        
        // Check for game end
        if (!nextPlayer1Card || !nextPlayer2Card) {
          const gameResult = !nextPlayer1Card ? 'player2_wins' : 'player1_wins';
          console.log(`🏁 Game ${gameId} ended - Result: ${gameResult}`);
          
          // Save game result to database for authenticated players
          const { player1XPData, player2XPData } = await saveOneVOneGameResult(game, gameResult);
          
          // Send game end to both players with XP data
          if (game.player1SocketId) {
            const player1Event = {
              gameResult: gameResult === 'player1_wins' ? 'win' : 'lose',
              isPlayer1: true,
              xpData: player1XPData
            };
            console.log(`📤 Sending game-ended-1v1 to Player 1 (${game.player1Name}):`, {
              gameResult: player1Event.gameResult,
              hasXpData: !!player1XPData,
              xpData: player1XPData
            });
            io.to(game.player1SocketId).emit('game-ended-1v1', player1Event);
          }
          if (game.player2SocketId) {
            const player2Event = {
              gameResult: gameResult === 'player2_wins' ? 'win' : 'lose', 
              isPlayer1: false,
              xpData: player2XPData
            };
            console.log(`📤 Sending game-ended-1v1 to Player 2 (${game.player2Name}):`, {
              gameResult: player2Event.gameResult,
              hasXpData: !!player2XPData,
              xpData: player2XPData
            });
            io.to(game.player2SocketId).emit('game-ended-1v1', player2Event);
          }
          
          // Clean up game
          await storage.deleteActiveOneVOneGame(gameId);
          return;
        }
        
        // Determine next turn (winner goes first, or same turn if tie)
        let nextTurn;
        if (roundWinner === 'player1') {
          nextTurn = 'player1';
        } else if (roundWinner === 'player2') {
          nextTurn = 'player2';
        } else {
          nextTurn = game.currentTurn; // Keep same turn for ties
        }
        
        // Update server game state with new round (won cards are now integrated into decks)
        await storage.updateActiveOneVOneGame(gameId, {
          roundNumber: (game.roundNumber || 1) + 1,
          player1Deck: JSON.stringify(newPlayer1Deck),
          player2Deck: JSON.stringify(newPlayer2Deck),
          player1WonCards: JSON.stringify([]), // Empty since won cards are added to deck
          player2WonCards: JSON.stringify([]), // Empty since won cards are added to deck
          player1RoundsWon: player1RoundsWon,
          player2RoundsWon: player2RoundsWon,
          tiedCards: JSON.stringify(newTiedCards),
          player1CurrentCard: JSON.stringify(nextPlayer1Card),
          player2CurrentCard: JSON.stringify(nextPlayer2Card),
          currentTurn: nextTurn,
          roundPhase: 'selecting',
          selectedStatTypeId: null,
          roundWinner: null
        } as any);
        
        console.log(`🎯 Updated deck sizes - P1: ${newPlayer1Deck.length}, P2: ${newPlayer2Deck.length}`);
        console.log(`🎯 Next cards - P1: ${nextPlayer1Card?.name}, P2: ${nextPlayer2Card?.name}`);
        
        console.log(`🎯 Server advancing to round ${(game.roundNumber || 1) + 1} - Next turn: ${nextTurn}`);
        
        // Send synchronized next round to both players
        const roundData = {
          gameId,
          roundNumber: (game.roundNumber || 1) + 1,
          currentTurn: nextTurn
        };
        
        console.log(`📡 Sending round-start-1v1 to both players for round ${roundData.roundNumber}`);
        
        // Don't resume timers here - wait for client animation-complete signal
        
        if (game.player1SocketId) {
          console.log(`📤 Sending round-start-1v1 to Player 1: ${game.player1Name}`);
          io.to(game.player1SocketId).emit('round-start-1v1', {
            ...roundData,
            isPlayer1: true,
            isMyTurn: nextTurn === 'player1',
            playerCard: nextPlayer1Card,
            opponentCard: nextPlayer2Card,
            playerDeckSize: newPlayer1Deck.length,
            opponentDeckSize: newPlayer2Deck.length,
            roundTimeSeconds: game.roundTimeSeconds
          });
        }
        
        if (game.player2SocketId) {
          console.log(`📤 Sending round-start-1v1 to Player 2: ${game.player2Name}`);
          io.to(game.player2SocketId).emit('round-start-1v1', {
            ...roundData,
            isPlayer1: false,
            isMyTurn: nextTurn === 'player2',
            playerCard: nextPlayer2Card,
            opponentCard: nextPlayer1Card,
            playerDeckSize: newPlayer2Deck.length,
            opponentDeckSize: newPlayer1Deck.length,
            roundTimeSeconds: game.roundTimeSeconds
          });
        }
        
        // NPC Auto-Play Logic: If next turn belongs to NPC, automatically make a move  
        if (nextTurn === 'player2' && game.player2SocketId === 'npc') {
          console.log(`🤖 NPC ${game.player2Name} turn detected, auto-selecting stat in 1-2 seconds`);
          
          // Delay NPC move for realism (1-2 seconds)
          const npcDelay = 1000 + Math.random() * 1000;
          const npcMoveTimeout = setTimeout(async () => {
            try {
              // Prevent duplicate NPC processing
              if (npcProcessingGames.has(gameId)) {
                console.log(`🚫 NPC already processing for game ${gameId}`);
                return;
              }
              npcProcessingGames.add(gameId);
              
              const currentGame = await storage.getActiveOneVOneGame(gameId);
              if (!currentGame || currentGame.currentTurn !== 'player2') {
                npcProcessingGames.delete(gameId);
                return;
              }
              
              // NPC selects random stat from their current card
              const npcCard = JSON.parse(currentGame.player2CurrentCard || '{}');
              if (npcCard.stats && npcCard.stats.length > 0) {
                const randomStatIndex = Math.floor(Math.random() * npcCard.stats.length);
                const selectedStat = npcCard.stats[randomStatIndex];
                
                console.log(`🤖 NPC ${game.player2Name} auto-selecting stat: ${selectedStat.statName} (${selectedStat.value})`);
                
                // Trigger the same select-stat logic as human players
                const npcStatData = {
                  statTypeId: selectedStat.statTypeId,
                  gameId: gameId
                };
                
                // Process NPC stat selection using the same logic
                const npcGame = await storage.getActiveOneVOneGame(gameId);
                if (!npcGame) return;
                
                // Calculate winner
                const player1Card = JSON.parse(npcGame.player1CurrentCard || '{}');
                const player2Card = JSON.parse(npcGame.player2CurrentCard || '{}');
                
                const player1Stat = player1Card.stats?.find((s: any) => s.statTypeId === selectedStat.statTypeId);
                const player2Stat = player2Card.stats?.find((s: any) => s.statTypeId === selectedStat.statTypeId);
                
                if (player1Stat && player2Stat) {
                  const player1Value = parseFloat(player1Stat.value || '0');
                  const player2Value = parseFloat(player2Stat.value || '0');
                  
                  let roundWinner;
                  if (player1Value > player2Value) {
                    roundWinner = 'player1';
                  } else if (player2Value > player1Value) {
                    roundWinner = 'player2';
                  } else {
                    roundWinner = 'tie';
                  }
                  
                  console.log(`🤖 NPC stat comparison: ${player1Value} vs ${player2Value} = ${roundWinner}`);
                  
                  // Update game state - this puts game in 'revealing' phase
                  await storage.updateActiveOneVOneGame(gameId, {
                    selectedStatTypeId: selectedStat.statTypeId,
                    roundWinner: roundWinner,
                    roundPhase: 'revealing'
                  });
                  
                  // Calculate cards that will be won for animation display
                  const tiedCards = JSON.parse(npcGame.tiedCards || '[]');
                  const cardsFromTie = tiedCards.length;
                  const cardsWonThisRound = roundWinner === 'tie' ? 0 : 2 + cardsFromTie;
                  
                  // Send reveal to human player (NPC doesn't need UI updates)
                  const revealData = {
                    gameId,
                    statTypeId: selectedStat.statTypeId,
                    player1Value,
                    player2Value,
                    roundWinner,
                    player1Card,
                    player2Card,
                    cardsWonThisRound,
                    cardsFromTie
                  };
                  
                  if (npcGame.player1SocketId) {
                    io.to(npcGame.player1SocketId).emit('stat-reveal-1v1', {
                      ...revealData,
                      isPlayer1: true,
                      myValue: player1Value,
                      opponentValue: player2Value
                    });
                    
                    // Pause timers for animation when revealing stats (NPC case)
                    io.to(npcGame.player1SocketId).emit('pause-timers');
                    console.log('⏸️ Server paused timers for NPC animations');
                  }
                  
                  // Don't auto-process - wait for client animation-complete signal like human players
                  // The processRoundResult will be called when client sends 'animation-complete'
                }
              }
            } catch (npcError) {
              console.error('❌ Error in NPC auto-play:', npcError);
            } finally {
              // Always clean up processing flag
              npcProcessingGames.delete(gameId);
            }
          }, npcDelay);
          
          // Store timeout ID so we can clear it if needed
          if (!gameTimeouts.has(gameId)) {
            gameTimeouts.set(gameId, new Set());
          }
          gameTimeouts.get(gameId)?.add(npcMoveTimeout);
        }
        
      } catch (error) {
        console.error('❌ Error processing round result:', error);
      }
    }
    
    // REMOVED: getNextCard helper - no longer needed since won cards go to back of deck
    
    // REMOVED: next-round-1v1 handler - server automatically progresses rounds via processRoundResult
    // Client no longer sends next-round-1v1 signals since server is fully authoritative

    // Handle game timeout - client signals when game time expires
    socket.on('game-timeout', async (data) => {
      const { gameId } = data;
      console.log(`⏰ Game timeout received for ${gameId}`);
      
      const game = await storage.getActiveOneVOneGame(gameId);
      if (!game) return;
      
      // Determine winner based on current deck sizes (more cards = winner)
      const player1Deck = JSON.parse(game.player1Deck || '[]');
      const player2Deck = JSON.parse(game.player2Deck || '[]');
      const gameResult = player1Deck.length > player2Deck.length ? 'player1_wins' : 
                        player2Deck.length > player1Deck.length ? 'player2_wins' : 'tie';
      
      console.log(`🏁 Game ${gameId} ended by timeout - Result: ${gameResult} (P1: ${player1Deck.length} cards, P2: ${player2Deck.length} cards)`);
      
      // Save game result to database for authenticated players
      const { player1XPData, player2XPData } = await saveOneVOneGameResult(game, gameResult);
      
      // Send game end to both players with XP data
      if (game.player1SocketId) {
        io.to(game.player1SocketId).emit('game-ended-1v1', {
          gameResult: gameResult === 'player1_wins' ? 'win' : gameResult === 'tie' ? 'tie' : 'lose',
          isPlayer1: true,
          reason: 'timeout',
          xpData: player1XPData
        });
      }
      if (game.player2SocketId) {
        io.to(game.player2SocketId).emit('game-ended-1v1', {
          gameResult: gameResult === 'player2_wins' ? 'win' : gameResult === 'tie' ? 'tie' : 'lose',
          isPlayer1: false,
          reason: 'timeout',
          xpData: player2XPData
        });
      }
      
      // Clean up game
      await storage.deleteActiveOneVOneGame(gameId);
    });

    // Handle turn timeout - client signals when player's turn time expires
    socket.on('turn-timeout', async (data) => {
      const { gameId } = data;
      console.log(`⏰ Turn timeout received for ${gameId}`);
      
      const game = await storage.getActiveOneVOneGame(gameId);
      if (!game || game.roundPhase !== 'selecting') return;
      
      // Auto-select a random stat for the player whose time expired
      const statTypes = await storage.getCollectionStatTypes(game.collectionId);
      if (statTypes.length === 0) return;
      
      const randomStatType = statTypes[Math.floor(Math.random() * statTypes.length)];
      console.log(`🎲 Auto-selecting random stat ${randomStatType.statName} for timeout`);
      
      // Process the auto-selection internally (don't emit back to same socket)
      const statTypeId = randomStatType.id;
      
      try {
        // Parse current cards from server state
        const player1Card = JSON.parse(game.player1CurrentCard || '{}');
        const player2Card = JSON.parse(game.player2CurrentCard || '{}');
        
        // Find the auto-selected stat values
        const player1Stat = player1Card.stats?.find((s: any) => s.statTypeId === statTypeId);
        const player2Stat = player2Card.stats?.find((s: any) => s.statTypeId === statTypeId);
        
        if (!player1Stat || !player2Stat) return;
        
        const player1Value = parseFloat(player1Stat.value || '0');
        const player2Value = parseFloat(player2Stat.value || '0');
        
        let roundWinner;
        if (player1Value > player2Value) {
          roundWinner = 'player1';
        } else if (player2Value > player1Value) {
          roundWinner = 'player2';
        } else {
          roundWinner = 'tie';
        }
        
        console.log(`🎯 Auto-stat result: ${roundWinner} (P1: ${player1Value} vs P2: ${player2Value})`);
        
        // Update game state and continue with reveal/processing
        await storage.updateActiveOneVOneGame(gameId, {
          selectedStatTypeId: statTypeId,
          roundWinner: roundWinner,
          roundPhase: 'revealing'
        });
        
        // Calculate cards that will be won for animation display
        const tiedCards = JSON.parse(game.tiedCards || '[]');
        const cardsFromTie = tiedCards.length;
        const cardsWonThisRound = roundWinner === 'tie' ? 0 : 2 + cardsFromTie;
        
        // Send stat reveal to both players
        const revealData = {
          gameId,
          statTypeId,
          player1Value,
          player2Value,
          roundWinner,
          player1Card,
          player2Card,
          cardsWonThisRound,
          cardsFromTie,
          autoSelected: true
        };
        
        if (game.player1SocketId) {
          io.to(game.player1SocketId).emit('stat-reveal-1v1', {
            ...revealData,
            isPlayer1: true,
            myValue: player1Value,
            opponentValue: player2Value
          });
        }
        
        if (game.player2SocketId) {
          io.to(game.player2SocketId).emit('stat-reveal-1v1', {
            ...revealData,
            isPlayer1: false,
            myValue: player2Value,
            opponentValue: player1Value
          });
        }
        
        // Pause timers for animation when revealing stats (timeout case)
        if (game.player1SocketId && game.player1SocketId !== 'npc') {
          io.to(game.player1SocketId).emit('pause-timers');
        }
        if (game.player2SocketId && game.player2SocketId !== 'npc') {
          io.to(game.player2SocketId).emit('pause-timers');
        }
        console.log('⏸️ Server paused timers for timeout animations');
        
        // Don't auto-process - wait for client animation-complete signal
        
      } catch (error) {
        console.error('❌ Error processing turn timeout:', error);
      }
    });

    // Handle animation complete - client signals when win/loss/tie animations finish
    socket.on('animation-complete', async (data) => {
      const { gameId } = data;
      console.log(`🎬 Animation complete received for ${gameId} from socket ${socket.id}`);
      
      const game = await storage.getActiveOneVOneGame(gameId);
      if (!game) {
        console.log(`❌ Game not found for animation-complete: ${gameId}`);
        return;
      }
      
      console.log(`🎬 Game state for ${gameId}:`, {
        roundWinner: game.roundWinner,
        roundPhase: game.roundPhase,
        roundNumber: game.roundNumber,
        player1SocketId: game.player1SocketId,
        player2SocketId: game.player2SocketId,
        currentSocketId: socket.id
      });
      
      // Only process if we have a round winner AND are in revealing phase
      if (game.roundWinner && game.roundPhase === 'revealing') {
        console.log(`🎬 Processing delayed round result after animation completion: ${game.roundWinner}`);
        
        // Note: 1v1 games don't use gameEngine for round XP
        // Round XP is only for single-player games stored in gameEngine's memory
        // 1v1 games calculate all XP at game end via saveOneVOneGameResult
        
        // Process the round result (which may end and delete the game)
        await processRoundResult(gameId, game.roundWinner);
        
        // Sync timers after round completion to prevent drift
        const updatedGame = await storage.getActiveOneVOneGame(gameId);
        if (updatedGame) {
          const timerSyncData = {
            gameTimer: Math.max(0, Math.floor((updatedGame.gameTimeSeconds || 120) - 
              ((Date.now() - new Date(updatedGame.gameStartedAt || new Date()).getTime()) / 1000))),
            playerTimerRemaining: updatedGame.roundTimeSeconds || 5, // Reset for next round
            roundNumber: updatedGame.roundNumber || 1,
            gameRoomId: gameId
          };
          
          console.log(`⏰ Syncing timers after round: game=${timerSyncData.gameTimer}s, round=${timerSyncData.playerTimerRemaining}s`);
          
          if (game.player1SocketId && game.player1SocketId !== 'npc') {
            io.to(game.player1SocketId).emit('timer-sync', timerSyncData);
            io.to(game.player1SocketId).emit('resume-timers');
          }
          if (game.player2SocketId && game.player2SocketId !== 'npc') {
            io.to(game.player2SocketId).emit('timer-sync', timerSyncData);
            io.to(game.player2SocketId).emit('resume-timers');
          }
        }
        console.log('▶️ Server synced timers and resumed after animations');
      } else if (!game.roundWinner) {
        console.log(`❌ No roundWinner found in game state - ignoring animation-complete signal`);
      } else if (game.roundPhase !== 'revealing') {
        console.log(`❌ Game not in revealing phase (${game.roundPhase}) - ignoring animation-complete signal`);
      }
    });

    // Handle player ready to start 1v1 game
    socket.on('player-ready-1v1', async (data) => {
      console.log(`🎯 Received player-ready-1v1:`, data);
      const { gameId } = data;
      const game = await storage.getActiveOneVOneGame(gameId);
      
      if (!game) {
        console.log(`❌ Game not found for gameId: ${gameId}`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      console.log(`🎮 Current game state:`, {
        gameId,
        player1: { name: game.player1Name, ready: game.player1Ready, socketId: game.player1SocketId },
        player2: { name: game.player2Name, ready: game.player2Ready, socketId: game.player2SocketId },
        currentSocketId: socket.id
      });
      
      // Mark player as ready and update in database
      let updates: any = {};
      if (game.player1SocketId === socket.id) {
        updates.player1Ready = true;
        console.log(`✅ Player 1 (${game.player1Name}) marked as ready`);
      } else if (game.player2SocketId === socket.id) {
        updates.player2Ready = true;
        console.log(`✅ Player 2 (${game.player2Name}) marked as ready`);
      } else {
        console.log(`❌ Socket ${socket.id} doesn't match any player in game ${gameId}`);
        return;
      }
      
      // Update the database
      const updatedGame = await storage.updateActiveOneVOneGame(gameId, updates);
      if (!updatedGame) {
        socket.emit('error', { message: 'Failed to update game' });
        return;
      }
      
      console.log(`🎯 Player ready status - P1: ${updatedGame.player1Ready}, P2: ${updatedGame.player2Ready}`);
      
      // Send match lobby update to show current readiness status
      const lobbyData = {
        gameId,
        phase: 'loading',
        player1: { name: updatedGame.player1Name, hasJoined: true, isReady: updatedGame.player1Ready },
        player2: { name: updatedGame.player2Name, hasJoined: true, isReady: updatedGame.player2Ready },
        collectionId: updatedGame.collectionId,
        roundTimeSeconds: updatedGame.roundTimeSeconds,
        gameTimeSeconds: updatedGame.gameTimeSeconds
      };
      
      // Broadcast lobby update to both players
      if (updatedGame.player1SocketId && updatedGame.player1SocketId !== 'npc') {
        io.to(updatedGame.player1SocketId).emit('match-lobby-update', lobbyData);
      }
      if (updatedGame.player2SocketId && updatedGame.player2SocketId !== 'npc') {
        io.to(updatedGame.player2SocketId).emit('match-lobby-update', lobbyData);
      }
      
      // Check if both players are ready to start the actual game
      if (updatedGame.player1Ready && updatedGame.player2Ready) {
        console.log(`🚀 Both players ready, starting game for ${gameId}`);
        
        try {
          // Get cards for this collection
          const cards = await storage.getCardsWithStats(updatedGame.collectionId);
          if (!cards || cards.length === 0) {
            socket.emit('error', { message: 'No cards found for collection' });
            return;
          }
          
          // Initialize server-side game state with deterministic shuffling
          const gameSeed = Date.now();
          const gameStartAt = Date.now() + 2000; // Start in 2 seconds to sync both clients
          console.log(`🎲 Initializing server game with seed: ${gameSeed}, starting at: ${gameStartAt}`);
          
          // Seeded random function for deterministic shuffling
          let seedValue = gameSeed;
          const seededRandom = () => {
            seedValue = (seedValue * 9301 + 49297) % 233280;
            return seedValue / 233280;
          };
          
          // Create shuffled deck
          const shuffledCards = [...cards].sort(() => seededRandom() - 0.5);
          
          // Deal cards to players
          const player1Deck: any[] = [];
          const player2Deck: any[] = [];
          
          shuffledCards.forEach((card, index) => {
            const formattedCard = {
              id: card.id,
              name: card.name,
              imageKey: card.imageKey,
              stats: card.stats?.map((stat: any) => ({
                statTypeId: stat.statTypeId,
                statName: stat.statName,
                value: stat.value
              })) || []
            };
            
            if (index % 2 === 0) {
              player1Deck.push(formattedCard);
            } else {
              player2Deck.push(formattedCard);
            }
          });
          
          console.log(`🃏 Server dealt cards - P1: ${player1Deck.length}, P2: ${player2Deck.length}`);
          
          // Get initial current cards
          const player1CurrentCard = player1Deck[0];
          const player2CurrentCard = player2Deck[0];
          
          // Initialize complete server game state
          await storage.updateActiveOneVOneGame(gameId, {
            gamePhase: 'active',
            bothPlayersReady: true,
            gameStartedAt: new Date(),
            gameSeed: gameSeed.toString(),
            roundNumber: 1,
            player1Deck: JSON.stringify(player1Deck),
            player2Deck: JSON.stringify(player2Deck),
            player1WonCards: JSON.stringify([]), // Not used - cards go to back of deck
            player2WonCards: JSON.stringify([]), // Not used - cards go to back of deck  
            tiedCards: JSON.stringify([]),
            player1CurrentCard: JSON.stringify(player1CurrentCard),
            player2CurrentCard: JSON.stringify(player2CurrentCard),
            roundPhase: 'selecting'
          });
          
          console.log(`🎯 Initial deck sizes - P1: ${player1Deck.length}, P2: ${player2Deck.length}`);
          console.log(`🃏 Initial cards - P1: ${player1CurrentCard?.name}, P2: ${player2CurrentCard?.name}`);
          
          console.log(`🎮 Server game state initialized for ${gameId}`);
          
          // Get collection data for the game
          const gameCollection = await storage.getCardCollection(updatedGame.collectionId);
          
          // Send synchronized game start event to both players
          const gameStartData = {
            gameId,
            currentTurn: updatedGame.currentTurn,
            gamePhase: 'active',
            startAt: gameStartAt,
            playerCard: null, // Will be set per player
            opponentCard: null, // Will be set per player
            playerDeckSize: 0, // Will be set per player
            opponentDeckSize: 0, // Will be set per player
            roundNumber: 1,
            roundTimeSeconds: updatedGame.roundTimeSeconds,
            gameTimeSeconds: updatedGame.gameTimeSeconds,
            collection: gameCollection // Add actual game collection data
          };
          
          console.log(`⏱️ Sending timer settings in start-game: roundTime=${updatedGame.roundTimeSeconds}s, gameTime=${updatedGame.gameTimeSeconds}s`);
          
          if (updatedGame.player1SocketId && updatedGame.player1SocketId !== 'npc') {
            io.to(updatedGame.player1SocketId).emit('start-game', {
              ...gameStartData,
              isPlayer1: true,
              isMyTurn: updatedGame.currentTurn === 'player1',
              playerCard: player1CurrentCard,
              opponentCard: player2CurrentCard,
              playerDeckSize: player1Deck.length,
              opponentDeckSize: player2Deck.length
            });
          }
          
          if (updatedGame.player2SocketId && updatedGame.player2SocketId !== 'npc') {
            io.to(updatedGame.player2SocketId).emit('start-game', {
              ...gameStartData,
              isPlayer1: false,
              isMyTurn: updatedGame.currentTurn === 'player2',
              playerCard: player2CurrentCard,
              opponentCard: player1CurrentCard,
              playerDeckSize: player2Deck.length,
              opponentDeckSize: player1Deck.length
            });
          }
          
          console.log(`📡 Sent synchronized start-game event to both players (startAt: ${gameStartAt})`);
          
          // NPC Auto-Play Logic: If initial turn belongs to NPC, automatically make a move
          if (updatedGame.currentTurn === 'player2' && updatedGame.player2SocketId === 'npc') {
            console.log(`🤖 Initial NPC turn detected for ${updatedGame.player2Name}, auto-selecting stat in 3-4 seconds`);
            
            // Delay NPC's first move for realism
            const npcInitialDelay = 3000 + Math.random() * 1000;
            setTimeout(async () => {
              try {
                const currentGame = await storage.getActiveOneVOneGame(gameId);
                if (!currentGame || currentGame.currentTurn !== 'player2') return;
                
                // NPC selects random stat from their current card
                const npcCard = JSON.parse(currentGame.player2CurrentCard || '{}');
                if (npcCard.stats && npcCard.stats.length > 0) {
                  const randomStatIndex = Math.floor(Math.random() * npcCard.stats.length);
                  const selectedStat = npcCard.stats[randomStatIndex];
                  
                  console.log(`🤖 Initial NPC ${updatedGame.player2Name} auto-selecting stat: ${selectedStat.statName} (${selectedStat.value})`);
                  
                  // Calculate winner
                  const player1Card = JSON.parse(currentGame.player1CurrentCard || '{}');
                  const player2Card = JSON.parse(currentGame.player2CurrentCard || '{}');
                  
                  const player1Stat = player1Card.stats?.find((s: any) => s.statTypeId === selectedStat.statTypeId);
                  const player2Stat = player2Card.stats?.find((s: any) => s.statTypeId === selectedStat.statTypeId);
                  
                  if (player1Stat && player2Stat) {
                    const player1Value = parseFloat(player1Stat.value || '0');
                    const player2Value = parseFloat(player2Stat.value || '0');
                    
                    let roundWinner;
                    if (player1Value > player2Value) {
                      roundWinner = 'player1';
                    } else if (player2Value > player1Value) {
                      roundWinner = 'player2';
                    } else {
                      roundWinner = 'tie';
                    }
                    
                    console.log(`🤖 Initial NPC stat comparison: ${player1Value} vs ${player2Value} = ${roundWinner}`);
                    
                    // Update game state
                    await storage.updateActiveOneVOneGame(gameId, {
                      selectedStatTypeId: selectedStat.statTypeId,
                      roundWinner: roundWinner,
                      roundPhase: 'revealing'
                    });
                    
                    // Calculate cards that will be won for animation display
                    const tiedCards = JSON.parse(currentGame.tiedCards || '[]');
                    const cardsFromTie = tiedCards.length;
                    const cardsWonThisRound = roundWinner === 'tie' ? 0 : 2 + cardsFromTie;
                    
                    // Send reveal to human player (NPC doesn't need UI updates)
                    const revealData = {
                      gameId,
                      statTypeId: selectedStat.statTypeId,
                      player1Value,
                      player2Value,
                      roundWinner,
                      player1Card,
                      player2Card,
                      cardsWonThisRound,
                      cardsFromTie
                    };
                    
                    if (currentGame.player1SocketId) {
                      io.to(currentGame.player1SocketId).emit('stat-reveal-1v1', {
                        ...revealData,
                        isPlayer1: true,
                        myValue: player1Value,
                        opponentValue: player2Value
                      });
                      
                      // Client controls all timers - no server pause needed
                    }
                    
                    // Don't auto-process - wait for client animation-complete signal
                  }
                }
              } catch (npcError) {
                console.error('❌ Error in initial NPC auto-play:', npcError);
              }
            }, npcInitialDelay);
          }
          
        } catch (error) {
          console.error('❌ Error initializing server game state:', error);
          socket.emit('error', { message: 'Failed to initialize game' });
        }
      } else {
        console.log(`⏳ Waiting for other player to be ready in game ${gameId}`);
      }
    });

    // Handle game leaving
    socket.on('leave-game', async (data) => {
      const { gameId } = data;
      const game = await storage.getActiveOneVOneGame(gameId);
      
      if (game) {
        console.log(`🚪 Player intentionally left 1v1 game ${gameId}`);
        
        // Determine who left and who wins
        const leavingPlayerId = game.player1SocketId === socket.id ? game.player1Id : game.player2Id;
        const winningPlayerId = game.player1SocketId === socket.id ? game.player2Id : game.player1Id;
        const winningPlayerName = game.player1SocketId === socket.id ? game.player2Name : game.player1Name;
        const winningSocketId = game.player1SocketId === socket.id ? game.player2SocketId : game.player1SocketId;
        
        console.log(`🏆 ${winningPlayerName} wins by opponent forfeit`);
        
        // Save game result with XP calculation  
        const { player1XPData, player2XPData } = await saveOneVOneGameResult(game, 
          game.player1Id === winningPlayerId ? 'player1_wins' : 'player2_wins');
        
        // Send victory to winning player
        if (winningSocketId) {
          const losingPlayerName = game.player1Id === winningPlayerId ? 
            (game.player2Name || 'Opponent') : 
            (game.player1Name || 'Opponent');
          
          io.to(winningSocketId).emit('game-ended-1v1', {
            gameResult: 'win',
            isPlayer1: game.player1Id === winningPlayerId,
            reason: 'opponent_forfeit',
            xpData: game.player1Id === winningPlayerId ? player1XPData : player2XPData,
            message: `${losingPlayerName} left the game. You win!`
          });
        }
        
        // Clean up game
        await storage.deleteActiveOneVOneGame(gameId);
      }
    });

    // Quiz Game Socket Handlers
    // Join Quiz 1v1 Queue
    socket.on('join-quiz-1v1-queue', async (data) => {
      const { collectionId, roundTime, gameTime } = data;
      const session = (socket.request as any).session;
      const userId = session?.userId || session?.anonymousUserId;
      
      if (!userId) {
        socket.emit('quiz-error', { message: 'Authentication required' });
        return;
      }
      
      console.log(`🎯 Player ${userId} joining Quiz 1v1 queue for collection ${collectionId}`);
      
      // Get player name
      let playerName = 'Guest';
      if (session?.userId) {
        const user = await storage.getUser(userId);
        playerName = user?.gamerName || 'Player';
      } else {
        const guestSession = await storage.getOrCreateGuestSession(userId);
        playerName = guestSession.guestName;
      }
      
      // Check for waiting players in quiz queue
      const quizQueue = matchmakingQueue.get(`quiz_${collectionId}`) || [];
      const opponent = quizQueue.shift();
      
      if (opponent) {
        // Match found! Start game
        const gameId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`🎮 Quiz match found! Creating game ${gameId}`);
        
        // Load quiz cards
        const quizCards = await storage.getQuizCards(collectionId);
        if (quizCards.length === 0) {
          socket.emit('quiz-error', { message: 'No cards in collection' });
          io.to(opponent.socketId).emit('quiz-error', { message: 'No cards in collection' });
          return;
        }
        
        // Shuffle cards using Fisher-Yates algorithm for true randomization
        const shuffledCards = [...quizCards];
        for (let i = shuffledCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
        }
        
        // Store shuffled card IDs to maintain order throughout game
        const shuffledCardIds = shuffledCards.map(card => card.id);
        
        // Create active quiz game
        const quizGame = await storage.createActiveQuizGame({
          gameId,
          collectionId,
          gameMode: '1v1',
          player1Id: opponent.userId,
          player1Name: opponent.name,
          player1SocketId: opponent.socketId,
          player2Id: userId,
          player2Name: playerName,
          player2SocketId: socket.id,
          roundTimeSeconds: opponent.roundTime,
          gameTimeSeconds: opponent.gameTime,
          gamePhase: 'ready',
          currentCard: shuffledCards[0],
          currentCardIndex: 0,
          shuffledCardIds
        });
        
        // Notify both players
        io.to(opponent.socketId).emit('quiz-match-found', {
          gameId,
          opponentName: playerName,
          isPlayer1: true,
          roundTime: opponent.roundTime,
          gameTime: opponent.gameTime,
          totalCards: shuffledCards.length
        });
        
        socket.emit('quiz-match-found', {
          gameId,
          opponentName: opponent.name,
          isPlayer1: false,
          roundTime: opponent.roundTime,
          gameTime: opponent.gameTime,
          totalCards: shuffledCards.length
        });
        
        // Update queue
        matchmakingQueue.set(`quiz_${collectionId}`, quizQueue);
      } else {
        // No opponent, add to queue
        quizQueue.push({
          userId,
          name: playerName,
          socketId: socket.id,
          roundTime,
          gameTime,
          joinedAt: Date.now()
        });
        matchmakingQueue.set(`quiz_${collectionId}`, quizQueue);
        console.log(`⏳ Player ${playerName} waiting in quiz queue`);
        socket.emit('quiz-waiting-for-opponent');
      }
    });

    // Helper function to infer question type for backwards compatibility with old quizzes
    function inferQuestionType(card: any): string {
      // If questionType exists, use it
      if (card.questionType) {
        return card.questionType;
      }
      
      // Infer from card structure for backwards compatibility
      if (card.matchPairs && Array.isArray(card.matchPairs) && card.matchPairs.length > 0) {
        return 'match';
      }
      
      if (card.correctAnswer || (card.question && card.question.includes('___'))) {
        return 'fill-blank';
      }
      
      // Count how many answers exist
      const answerCount = [card.answer1, card.answer2, card.answer3, card.answer4, card.answer5, card.answer6]
        .filter(a => a && a.trim()).length;
      
      if (answerCount === 2) {
        return 'true-false';
      }
      
      return 'multiple-choice';
    }
    
    // Utility function to shuffle answers while tracking correct answer position
    function shuffleAnswers(card: any): { answers?: string[], correctAnswerIndex?: number, matchPairs?: any[], correctAnswer?: string } {
      const questionType = inferQuestionType(card);
      
      if (questionType === 'match') {
        // For match questions, send the CORRECT pairs as-is
        // The frontend handles shuffling the right-side options for dropdown display
        return { matchPairs: card.matchPairs };
      } else if (questionType === 'fill-blank') {
        // For fill-blank, no shuffling needed
        return { correctAnswer: card.correctAnswer };
      } else {
        // Multiple-choice or true-false - shuffle answers
        const answerPairs: Array<{ answer: string, originalIndex: number }> = [];
        
        if (card.answer1) answerPairs.push({ answer: card.answer1, originalIndex: 0 });
        if (card.answer2) answerPairs.push({ answer: card.answer2, originalIndex: 1 });
        if (card.answer3) answerPairs.push({ answer: card.answer3, originalIndex: 2 });
        if (card.answer4) answerPairs.push({ answer: card.answer4, originalIndex: 3 });
        if (card.answer5) answerPairs.push({ answer: card.answer5, originalIndex: 4 });
        if (card.answer6) answerPairs.push({ answer: card.answer6, originalIndex: 5 });
        
        // Shuffle using Fisher-Yates algorithm
        for (let i = answerPairs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [answerPairs[i], answerPairs[j]] = [answerPairs[j], answerPairs[i]];
        }
        
        // Extract shuffled answers
        const shuffledAnswers = answerPairs.map(pair => pair.answer);
        
        // Find new position of correct answer
        // card.correctAnswerIndex is 1-based, so we need to convert to 0-based for comparison
        const originalCorrectIndex = card.correctAnswerIndex - 1;
        const newCorrectIndex = answerPairs.findIndex(pair => pair.originalIndex === originalCorrectIndex);
        
        console.log(`🔀 Shuffle: Original correct index: ${card.correctAnswerIndex} (1-based) -> ${originalCorrectIndex} (0-based), New correct index: ${newCorrectIndex}, Question: ${card.question.substring(0, 50)}...`);
        
        return {
          answers: shuffledAnswers,
          correctAnswerIndex: newCorrectIndex
        };
      }
    }

    // SECURITY: Create client-safe card data (strips answer information)
    function sanitizeCardForClient(fullCardData: any, questionType: string): any {
      const baseCard = {
        id: fullCardData.id,
        question: fullCardData.question,
        questionType,
        imageKey: fullCardData.imageKey
      };
      
      if (questionType === 'match') {
        // For matching, send matchPairs with only left property (hide correct pairings)
        // Also send shuffled rightItems with originalIndex for answer validation
        const matchPairs = fullCardData.matchPairs?.map((pair: any) => ({ left: pair.left })) || [];
        const rightItemsWithIndex = fullCardData.matchPairs?.map((pair: any, index: number) => ({ 
          text: pair.right, 
          originalIndex: index 
        })) || [];
        
        // Shuffle right items
        const shuffledRight = [...rightItemsWithIndex];
        for (let i = shuffledRight.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledRight[i], shuffledRight[j]] = [shuffledRight[j], shuffledRight[i]];
        }
        
        return {
          ...baseCard,
          matchPairs,
          rightItems: shuffledRight
        };
      } else if (questionType === 'fill-blank') {
        // Don't send correctAnswer
        return baseCard;
      } else {
        // MCQ/TF: send answers but NOT correctAnswerIndex
        return {
          ...baseCard,
          answers: fullCardData.answers
        };
      }
    }

    // Start Quiz Single Player
    socket.on('start-quiz-single-game', async (data) => {
      const { collectionId, roundTime, gameTime } = data;
      const session = (socket.request as any).session;
      const userId = session?.userId || session?.anonymousUserId;
      
      if (!userId) {
        socket.emit('quiz-error', { message: 'Authentication required' });
        return;
      }
      
      console.log(`🎯 Starting Quiz single player for ${userId}`);
      
      // Get player name
      let playerName = 'Guest';
      if (session?.userId) {
        const user = await storage.getUser(userId);
        playerName = user?.gamerName || 'Player';
      } else {
        const guestSession = await storage.getOrCreateGuestSession(userId);
        playerName = guestSession.guestName;
      }
      
      // Load quiz cards
      const quizCards = await storage.getQuizCards(collectionId);
      if (quizCards.length === 0) {
        socket.emit('quiz-error', { message: 'No cards in collection' });
        return;
      }
      
      // Shuffle cards using Fisher-Yates algorithm for true randomization
      const shuffledCards = [...quizCards];
      for (let i = shuffledCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
      }
      
      // Store shuffled card IDs to maintain order throughout game
      const shuffledCardIds = shuffledCards.map(card => card.id);
      
      // Create single player game (no AI opponent)
      const gameId = `quiz_single_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const quizGame = await storage.createActiveQuizGame({
        gameId,
        collectionId,
        gameMode: 'single',
        player1Id: userId,
        player1Name: playerName,
        player1SocketId: socket.id,
        player2Id: null, // No opponent in single player
        player2Name: null,
        roundTimeSeconds: roundTime,
        gameTimeSeconds: gameTime,
        gamePhase: 'playing',
        currentCard: shuffledCards[0],
        currentCardIndex: 0,
        shuffledCardIds
      });
      
      // Shuffle answers for the first card
      const shuffledData = shuffleAnswers(shuffledCards[0]);
      
      console.log(`🎮 Single Player Game Start - Card type: ${inferQuestionType(shuffledCards[0])}`);
      if (shuffledCards[0].matchPairs) {
        console.log(`   Original matchPairs:`, JSON.stringify(shuffledCards[0].matchPairs));
        console.log(`   Shuffled matchPairs:`, JSON.stringify(shuffledData.matchPairs));
      }
      
      // Update the stored card with shuffled data - CRITICAL for duplicate request handling
      const shuffledFirstCard = {
        ...shuffledCards[0],
        ...shuffledData
      };
      
      await storage.updateActiveQuizGame(gameId, {
        currentCard: shuffledFirstCard
      });
      
      // SECURITY: Create client-safe card (strips answer data)
      const clientCard = sanitizeCardForClient(shuffledFirstCard, inferQuestionType(shuffledCards[0]));
      
      socket.emit('quiz-game-started', {
        gameId,
        isPlayer1: true,
        player1Name: playerName,
        player2Name: null,
        opponentName: null,
        roundTime,
        gameTime,
        totalQuestions: shuffledCards.length,
        totalCards: shuffledCards.length,
        currentCard: clientCard
      });
    });

    // Player ready for Quiz game
    socket.on('quiz-player-ready', async (data) => {
      const { gameId } = data;
      const game = await storage.getActiveQuizGame(gameId);
      
      if (!game) {
        socket.emit('quiz-error', { message: 'Game not found' });
        return;
      }
      
      // Update player ready status
      const isPlayer1 = game.player1SocketId === socket.id;
      const updates: any = isPlayer1 ? { player1Ready: true } : { player2Ready: true };
      
      // Check if both players ready
      const bothReady = isPlayer1 ? game.player2Ready : game.player1Ready;
      if (bothReady) {
        updates.bothPlayersReady = true;
        updates.gamePhase = 'playing';
        updates.gameStartedAt = new Date();
      }
      
      const updatedGame = await storage.updateActiveQuizGame(gameId, updates);
      
      if (updatedGame?.bothPlayersReady) {
        // Get first card and shuffle using Fisher-Yates algorithm
        const quizCards = await storage.getQuizCards(game.collectionId);
        const shuffledCards = [...quizCards];
        for (let i = shuffledCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
        }
        
        // Shuffle answers for the first card (same for both players)
        const shuffledData = shuffleAnswers(shuffledCards[0]);
        
        // Update the stored card with BOTH shuffled answers and correct index - CRITICAL for duplicate request handling
        const shuffledFirstCard = {
          ...shuffledCards[0],
          questionType: inferQuestionType(shuffledCards[0]),
          ...shuffledData
        };
        
        await storage.updateActiveQuizGame(gameId, {
          currentCard: shuffledFirstCard
        });
        
        // SECURITY: Create client-safe card (strips answer data)
        const clientCard = sanitizeCardForClient(shuffledFirstCard, shuffledFirstCard.questionType);
        
        // Start game for both players
        io.to(game.player1SocketId!).emit('quiz-game-started', {
          gameId,
          isPlayer1: true,
          player1Name: game.player1Name,
          player2Name: game.player2Name,
          opponentName: game.player2Name,
          roundTime: game.roundTimeSeconds,
          gameTime: game.gameTimeSeconds,
          totalQuestions: shuffledCards.length,
          totalCards: shuffledCards.length,
          currentCard: clientCard
        });
        
        io.to(game.player2SocketId!).emit('quiz-game-started', {
          gameId,
          isPlayer1: false,
          player1Name: game.player2Name,
          player2Name: game.player1Name,
          opponentName: game.player1Name,
          roundTime: game.roundTimeSeconds,
          gameTime: game.gameTimeSeconds,
          totalQuestions: shuffledCards.length,
          totalCards: shuffledCards.length,
          currentCard: clientCard
        });
      }
    });

    // Quiz 1v1 Matchmaking
    socket.on('join-quiz-1v1-queue', async (data) => {
      const { collectionId, roundTime, gameTime, targetPlayerId } = data;
      const session = (socket.request as any).session;
      
      // Get or create user ID
      let finalUserId = session?.userId || session?.anonymousUserId;
      if (!finalUserId) {
        const utcTimestamp = Date.now();
        const anonymousId = `guest_${utcTimestamp}_${Math.random().toString(36).substr(2, 9)}`;
        session.anonymousUserId = anonymousId;
        finalUserId = anonymousId;
        console.log(`📚 Quiz: Created session-only guest user: ${anonymousId}`);
      }
      
      console.log(`📚 Player ${finalUserId} joining quiz 1v1 queue for collection ${collectionId}${targetPlayerId ? ` (targeting player ${targetPlayerId})` : ''}`);
      
      // Get player info
      let playerName = 'Guest';
      if (session?.userId) {
        const user = await storage.getUser(finalUserId);
        playerName = user?.gamerName || 'Player';
      } else {
        const guestSession = await storage.getOrCreateGuestSession(finalUserId);
        playerName = guestSession.guestName;
      }
      
      // Check for waiting opponents
      const waitingPlayers = quizMatchmakingQueue.get(collectionId) || [];
      console.log(`📚 Current quiz queue for collection ${collectionId}:`, waitingPlayers.length, 'waiting players');
      
      let opponent = null;
      
      // If targeting a specific player (Quick Join), find that exact player
      if (targetPlayerId) {
        const targetIndex = waitingPlayers.findIndex((p: any) => p.userId === targetPlayerId);
        if (targetIndex !== -1) {
          opponent = waitingPlayers[targetIndex];
          waitingPlayers.splice(targetIndex, 1);
          console.log(`🎯 Quick Join: Found target player ${targetPlayerId}`);
        } else {
          console.log(`⚠️ Quick Join: Target player ${targetPlayerId} not found in queue`);
        }
      } else {
        // Normal matchmaking - find any waiting player for the same collection
        opponent = waitingPlayers.shift(); // Get first waiting player
      }
      
      if (opponent) {
        // Match found! Remove opponent from queue
        quizMatchmakingQueue.set(collectionId, waitingPlayers);
        
        // Create unique game session
        const matchGameId = `quiz_match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Determine player assignments
        const player1Data = { id: opponent.userId, name: opponent.name, socketId: opponent.socketId };
        const player2Data = { id: finalUserId, name: playerName, socketId: socket.id };
        
        console.log(`✅ Quiz match found! ${playerName} vs ${opponent.name} for quiz collection ${collectionId}`);
        
        // Get quiz cards
        const cards = await storage.getQuizCards(collectionId);
        if (!cards || cards.length === 0) {
          socket.emit('quiz-error', { message: 'No questions found for this quiz' });
          io.to(opponent.socketId).emit('quiz-error', { message: 'No questions found for this quiz' });
          return;
        }
        
        // Shuffle cards for randomization
        const shuffledCards = [...cards].sort(() => Math.random() - 0.5);
        
        // Create active quiz game
        const game = await storage.createActiveQuizGame({
          gameId: matchGameId,
          collectionId,
          player1Id: player1Data.id,
          player1Name: player1Data.name,
          player1SocketId: player1Data.socketId,
          player2Id: player2Data.id,
          player2Name: player2Data.name,
          player2SocketId: player2Data.socketId,
          gameMode: '1v1',
          roundTimeSeconds: roundTime || 30,
          gameTimeSeconds: gameTime || 300,
          player1CardCount: 0,
          player2CardCount: 0,
          currentCardIndex: 0,
          currentCard: shuffledCards[0],
          shuffledCardIds: shuffledCards.map(c => c.id)
        });
        
        // Shuffle answers for the first card
        const { answers: shuffledAnswers, correctAnswerIndex: shuffledCorrectIndex } = shuffleAnswers(shuffledCards[0]);
        
        // Update the stored card with BOTH shuffled answers and correct index - CRITICAL for duplicate request handling
        const shuffledFirstCard = {
          ...shuffledCards[0],
          answers: shuffledAnswers,
          correctAnswerIndex: shuffledCorrectIndex
        };
        
        await storage.updateActiveQuizGame(matchGameId, {
          currentCard: shuffledFirstCard
        });
        
        // SECURITY: Create client-safe card (strips answer data - no correctAnswerIndex)
        const clientCard = sanitizeCardForClient(shuffledFirstCard, inferQuestionType(shuffledCards[0]));
        
        // Notify both players that game started
        io.to(player1Data.socketId).emit('quiz-game-started', {
          gameId: matchGameId,
          isPlayer1: true,
          player1Name: player1Data.name,
          player2Name: player2Data.name,
          opponentName: player2Data.name,
          roundTime: roundTime || 30,
          gameTime: gameTime || 300,
          totalQuestions: shuffledCards.length,
          totalCards: shuffledCards.length,
          currentCard: clientCard
        });
        
        io.to(player2Data.socketId).emit('quiz-game-started', {
          gameId: matchGameId,
          isPlayer1: false,
          player1Name: player2Data.name,
          player2Name: player1Data.name,
          opponentName: player1Data.name,
          roundTime: roundTime || 30,
          gameTime: gameTime || 300,
          totalQuestions: shuffledCards.length,
          totalCards: shuffledCards.length,
          currentCard: clientCard
        });
        
        // Broadcast queue update
        io.emit('quiz-queue-updated');
        
      } else {
        // No match found, add to queue
        const playerData = {
          userId: finalUserId,
          socketId: socket.id,
          name: playerName,
          collectionId,
          roundTime: roundTime || 30,
          gameTime: gameTime || 300,
          joinedAt: Date.now()
        };
        
        waitingPlayers.push(playerData);
        quizMatchmakingQueue.set(collectionId, waitingPlayers);
        
        console.log(`📚 No quiz match found. Added ${playerName} to queue (${waitingPlayers.length} total waiting)`);
        
        socket.emit('quiz-matchmaking', {
          status: 'waiting',
          message: 'Searching for opponent...'
        });
        
        // Broadcast queue update
        io.emit('quiz-queue-updated');
      }
    });

    // Quiz answer submitted
    socket.on('quiz-answer-submitted', async (data) => {
      const { gameId, answerIndex, matchAnswers, fillBlankAnswer, answerTime } = data;
      const game = await storage.getActiveQuizGame(gameId);
      
      if (!game || !game.currentCard) {
        // Game not found - check if it legitimately ended
        const [completedGame] = await db.select()
          .from(quizGameResults)
          .where(eq(quizGameResults.gameId, gameId))
          .limit(1);
        
        if (completedGame) {
          // Game legitimately completed - return silently as player will receive quiz-game-over
          console.log(`⚠️ Quiz game ${gameId} already completed in quiz-answer-submitted`);
          return;
        }
        
        // Game not found and no completion record - this is an error
        socket.emit('quiz-error', { message: 'Game not found' });
        console.error(`❌ Quiz game ${gameId} not found in quiz-answer-submitted and no completion record`);
        return;
      }
      
      const isPlayer1 = game.player1SocketId === socket.id;
      const currentCard = game.currentCard as any;
      const questionType = currentCard.questionType || 'multiple-choice';
      
      // Validate answer based on question type
      let isCorrect = false;
      let correctIndex = currentCard.correctAnswerIndex;
      
      if (questionType === 'multiple-choice' || questionType === 'true-false') {
        // Multiple choice or true/false - check answerIndex
        if (currentCard.correctAnswerIndex === undefined) {
          console.error(`❌ Quiz game ${gameId}: No correctAnswerIndex for MC/TF question`);
          socket.emit('quiz-error', { message: 'Invalid game state' });
          return;
        }
        correctIndex = currentCard.correctAnswerIndex;
        isCorrect = answerIndex === correctIndex;
      } else if (questionType === 'match') {
        // Match pairs - check if all pairs are correctly matched
        if (!currentCard.matchPairs || !matchAnswers) {
          console.error(`❌ Quiz game ${gameId}: Invalid match question data`);
          socket.emit('quiz-error', { message: 'Invalid game state' });
          return;
        }
        // For match questions, correct means all pairs matched correctly (index matches position)
        isCorrect = matchAnswers.every((answer: number, index: number) => answer === index);
        correctIndex = -1; // Not applicable for match
      } else if (questionType === 'fill-blank') {
        // Fill in the blank - check if answer matches (case-insensitive, trimmed)
        if (!currentCard.correctAnswer || !fillBlankAnswer) {
          console.error(`❌ Quiz game ${gameId}: Invalid fill-blank question data`);
          socket.emit('quiz-error', { message: 'Invalid game state' });
          return;
        }
        const correctAnswer = currentCard.correctAnswer.trim().toLowerCase();
        const userAnswer = fillBlankAnswer.trim().toLowerCase();
        isCorrect = correctAnswer === userAnswer;
        correctIndex = -1; // Not applicable for fill-blank
      }
      
      console.log(`🎯 Quiz answer: Player ${isPlayer1 ? 1 : 2}, Answer ${answerIndex}, Correct: ${correctIndex}, Time: ${answerTime}ms, Round: ${game.roundNumber}`);
      console.log(`   📋 CurrentCard data:`, JSON.stringify({
        question: currentCard.question?.substring(0, 50),
        answersCount: currentCard.answers?.length,
        correctAnswerIndex: currentCard.correctAnswerIndex,
        correctAnswer: currentCard.answers?.[currentCard.correctAnswerIndex]
      }));
      
      // Handle single player mode (no opponent, just track accuracy)
      if (game.gameMode === 'single') {
        // Track correct answers for accuracy calculation
        const correctAnswersCount = isCorrect ? (game.player1CardCount || 0) + 1 : (game.player1CardCount || 0);
        
        // For matching questions, XP is multiplied by the number of match pairs
        // Score still counts as 1 point, but XP/coins are multiplied
        const xpMultiplier = (questionType === 'match' && currentCard.matchPairs) 
          ? currentCard.matchPairs.length 
          : 1;
        
        if (isCorrect && xpMultiplier > 1) {
          console.log(`🎯 Match question XP multiplier: ${xpMultiplier}x (${currentCard.matchPairs?.length} pairs)`);
        }
        
        // Update game state
        const updates: any = {
          player1CardCount: correctAnswersCount, // Total correct answers (still counts as 1)
          player1Answer: answerIndex,
          player1AnswerTime: answerTime,
          player1RoundsWon: isCorrect ? (game.player1RoundsWon || 0) + xpMultiplier : (game.player1RoundsWon || 0)
        };
        
        await storage.updateActiveQuizGame(gameId, updates);
        
        // Send round result (simplified for single player)
        // For match questions, include the correct pairs so the result modal can display them
        const correctMatchPairs = questionType === 'match' && currentCard.matchPairs 
          ? currentCard.matchPairs 
          : undefined;
        
        // For fill-in-blank questions, include the correct answer text
        const correctAnswerText = questionType === 'fill-blank' && currentCard.correctAnswer
          ? currentCard.correctAnswer
          : undefined;
        
        socket.emit('quiz-round-result', {
          correctIndex,
          player1Answer: answerIndex,
          player1Correct: isCorrect,
          player1CardCount: correctAnswersCount,
          player1Score: correctAnswersCount,
          roundNumber: game.roundNumber || 1,
          roundResult: isCorrect ? 'correct' : 'incorrect',
          correctMatchPairs,
          correctAnswer: correctAnswerText
        });
      } else {
        // 1v1 mode - wait for both players
        // Store both the answer and whether it was correct
        const updates: any = {};
        if (isPlayer1) {
          updates.player1Answer = answerIndex;
          updates.player1AnswerTime = answerTime;
          updates.player1Correct = isCorrect;
        } else {
          updates.player2Answer = answerIndex;
          updates.player2AnswerTime = answerTime;
          updates.player2Correct = isCorrect;
        }
        
        const updatedGame = await storage.updateActiveQuizGame(gameId, updates);
        
        // Check if both players answered
        if (updatedGame && updatedGame.player1Answer !== null && updatedGame.player2Answer !== null) {
          console.log(`🔍 Validating both answers: P1=${updatedGame.player1Answer}, P2=${updatedGame.player2Answer}, CorrectIndex=${correctIndex}`);
          
          // Use stored correctness values (works for all question types)
          const p1Correct = updatedGame.player1Correct || false;
          const p2Correct = updatedGame.player2Correct || false;
          const p1Time = updatedGame.player1AnswerTime || 0;
          const p2Time = updatedGame.player2AnswerTime || 0;
          
          // SCORING: +1 for correct answer, -1 for wrong answer
          let player1Score = p1Correct ? 1 : -1;
          let player2Score = p2Correct ? 1 : -1;
          let roundResult: 'player1' | 'player2' | 'both' | 'none' = 'none';
          
          if (p1Correct && p2Correct) {
            // Both correct - both get +1 card
            roundResult = 'both';
          } else if (p1Correct && !p2Correct) {
            // Player 1 correct (+1), Player 2 wrong (-1)
            roundResult = 'player1';
          } else if (!p1Correct && p2Correct) {
            // Player 1 wrong (-1), Player 2 correct (+1)
            roundResult = 'player2';
          } else {
            // Both wrong - both lose a card (-1 each)
            roundResult = 'none';
          }
          
          const finalUpdates: any = {
            player1CardCount: (updatedGame.player1CardCount || 0) + player1Score,
            player2CardCount: (updatedGame.player2CardCount || 0) + player2Score,
            player1Answer: null, // Reset for next round
            player2Answer: null,
            player1AnswerTime: null,
            player2AnswerTime: null,
            player1Correct: null,
            player2Correct: null
          };
          
          // For matching questions, XP is multiplied by the number of match pairs
          const xpMultiplier = (questionType === 'match' && currentCard.matchPairs) 
            ? currentCard.matchPairs.length 
            : 1;
          
          if (xpMultiplier > 1) {
            console.log(`🎯 1v1 Match question XP multiplier: ${xpMultiplier}x (${currentCard.matchPairs?.length} pairs)`);
          }
          
          if (roundResult === 'player1') {
            finalUpdates.player1RoundsWon = (updatedGame.player1RoundsWon || 0) + xpMultiplier;
          } else if (roundResult === 'player2') {
            finalUpdates.player2RoundsWon = (updatedGame.player2RoundsWon || 0) + xpMultiplier;
          }
          
          await storage.updateActiveQuizGame(gameId, finalUpdates);
          
          // Send round result to both players
          io.to(updatedGame.player1SocketId!).emit('quiz-round-result', {
            correctIndex,
            player1Answer: updatedGame.player1Answer,
            player2Answer: updatedGame.player2Answer,
            player1Correct: p1Correct,
            player2Correct: p2Correct,
            player1CardCount: finalUpdates.player1CardCount,
            player2CardCount: finalUpdates.player2CardCount,
            player1Score: finalUpdates.player1CardCount,
            player2Score: finalUpdates.player2CardCount,
            player1Time: p1Time,
            player2Time: p2Time,
            roundNumber: updatedGame.roundNumber || 1,
            roundResult
          });
          
          io.to(updatedGame.player2SocketId!).emit('quiz-round-result', {
            correctIndex,
            player1Answer: updatedGame.player1Answer,
            player2Answer: updatedGame.player2Answer,
            player1Correct: p1Correct,
            player2Correct: p2Correct,
            player1CardCount: finalUpdates.player1CardCount,
            player2CardCount: finalUpdates.player2CardCount,
            player1Score: finalUpdates.player1CardCount,
            player2Score: finalUpdates.player2CardCount,
            player1Time: p1Time,
            player2Time: p2Time,
            roundNumber: updatedGame.roundNumber || 1,
            roundResult
          });
        }
      }
    });

    // Next quiz card
    socket.on('quiz-next-card', async (data) => {
      const { gameId } = data;
      const game = await storage.getActiveQuizGame(gameId);
      
      if (!game) {
        // Game not found - check if it legitimately ended
        const [completedGame] = await db.select()
          .from(quizGameResults)
          .where(eq(quizGameResults.gameId, gameId))
          .limit(1);
        
        if (completedGame) {
          // Game legitimately completed - return silently as player will receive quiz-game-over
          console.log(`⚠️ Quiz game ${gameId} already completed in quiz-next-card`);
          return;
        }
        
        // Game not found and no completion record - this is an error
        socket.emit('quiz-error', { message: 'Game not found' });
        console.error(`❌ Quiz game ${gameId} not found in quiz-next-card and no completion record`);
        return;
      }
      
      // Prepare card advancement
      const currentCardIndex = game.currentCardIndex || 0;
      const nextIndex = currentCardIndex + 1;
      const currentRoundNumber = game.roundNumber || 1;
      const currentTurnVersion = game.turnVersion || 0;
      
      const shuffledCardIds = game.shuffledCardIds;
      
      // Get all cards for the collection
      const allCards = await storage.getQuizCards(game.collectionId);
      
      // Check if game is over
      if (!shuffledCardIds || shuffledCardIds.length === 0) {
        // Backwards compatibility: If no shuffled IDs, use total cards length
        if (nextIndex >= allCards.length) {
          socket.emit('quiz-game-should-end', { gameId });
          return;
        }
      } else {
        // New behavior: Use shuffled array length
        if (nextIndex >= shuffledCardIds.length) {
          socket.emit('quiz-game-should-end', { gameId });
          return;
        }
      }
      
      // Get the next card - use shuffled order if available, otherwise fall back to database order
      let nextCard;
      if (shuffledCardIds && shuffledCardIds.length > 0) {
        const nextCardId = shuffledCardIds[nextIndex];
        nextCard = allCards.find(card => card.id === nextCardId);
        
        if (!nextCard) {
          socket.emit('quiz-error', { message: 'Card not found' });
          return;
        }
      } else {
        // Backwards compatibility fallback (old behavior)
        nextCard = allCards[nextIndex];
      }
      
      // Shuffle answers for the next card
      const shuffledData = shuffleAnswers(nextCard);
      
      // Update the card with shuffled data - CRITICAL for duplicate request handling
      const shuffledNextCard = {
        ...nextCard,
        ...shuffledData
      };
      
      // Atomic update with turnVersion to prevent duplicate advances
      // Only one request can successfully update when turnVersion matches
      const updateResult = await db.update(activeQuizGames)
        .set({
          currentCard: shuffledNextCard,
          currentCardIndex: nextIndex,
          player1Answer: null,
          player2Answer: null,
          player1Correct: null,
          player2Correct: null,
          roundNumber: (game.roundNumber || 1) + 1,
          turnVersion: currentTurnVersion + 1 // Increment version atomically
        })
        .where(and(
          eq(activeQuizGames.gameId, gameId),
          eq(activeQuizGames.turnVersion, currentTurnVersion) // Compare-and-swap
        ));
      
      // Check if update succeeded (this request won the race)
      if (updateResult.rowCount === 0) {
        // Another request already advanced - fetch current state and re-send
        console.log(`🔒 Quiz game ${gameId}: Duplicate quiz-next-card request detected via turnVersion, sending current card`);
        const updatedGame = await storage.getActiveQuizGame(gameId);
        if (updatedGame && updatedGame.currentCard) {
          const existingCard = updatedGame.currentCard as any;
          // SECURITY: Sanitize card data for client (strip answer info)
          const cardData = sanitizeCardForClient(existingCard, inferQuestionType(existingCard));
          socket.emit('quiz-next-card', { 
            gameId, 
            currentCard: cardData, 
            roundNumber: updatedGame.roundNumber || currentRoundNumber 
          });
        }
        return;
      }
      
      // Update succeeded - send next card to player(s)
      // SECURITY: Sanitize card data for client (strip answer info)
      const clientCard = sanitizeCardForClient(shuffledNextCard, inferQuestionType(nextCard));
      
      if (game.gameMode === 'single') {
        socket.emit('quiz-next-card', { gameId, currentCard: clientCard, roundNumber: nextIndex + 1 });
      } else {
        io.to(game.player1SocketId!).emit('quiz-next-card', { gameId, currentCard: clientCard, roundNumber: nextIndex + 1 });
        io.to(game.player2SocketId!).emit('quiz-next-card', { gameId, currentCard: clientCard, roundNumber: nextIndex + 1 });
      }
    });

    // Quiz game ended
    socket.on('quiz-game-ended', async (data) => {
      const { gameId } = data;
      const game = await storage.getActiveQuizGame(gameId);
      
      if (!game) {
        return;
      }
      
      console.log(`🏁 Quiz game ${gameId} ended`);
      
      // Calculate total questions and correct answers
      const totalCards = await storage.getQuizCards(game.collectionId);
      const p1CardCount = game.player1CardCount || 0;
      const p2CardCount = game.player2CardCount || 0;
      const player1Correct = p1CardCount;
      const player2Correct = p2CardCount;
      const currentIndex = game.currentCardIndex || 0;
      const totalQuestions = totalCards.length;
      
      // For single player: no winner determination (focus on accuracy)
      // For multiplayer: determine winner by comparing scores
      let winnerId = null;
      let gameResult: 'win' | 'loss' | 'tie' = 'tie';
      
      if (game.gameMode !== 'single') {
        if (p1CardCount > p2CardCount) {
          winnerId = game.player1Id;
          gameResult = 'win';
        } else if (p2CardCount > p1CardCount) {
          winnerId = game.player2Id;
          gameResult = 'loss';
        }
      }
      
      // Save game result - use totalQuestions for consistency with modal display
      await storage.createQuizGameResult({
        gameId: game.gameId,
        collectionId: game.collectionId,
        gameMode: game.gameMode,
        player1Id: game.player1Id,
        player1Name: game.player1Name,
        player1Score: p1CardCount,
        player1CorrectAnswers: player1Correct,
        player1TotalAnswers: totalQuestions,
        player2Id: game.player2Id,
        player2Name: game.player2Name,
        player2Score: p2CardCount,
        player2CorrectAnswers: player2Correct,
        player2TotalAnswers: totalQuestions,
        winnerId,
        gameDuration: Math.floor((Date.now() - (game.gameStartedAt?.getTime() || Date.now())) / 1000),
        gameStartedAt: game.gameStartedAt || new Date(),
        gameEndedAt: new Date()
      });
      
      // Calculate XP for authenticated players
      const { xpService } = await import("./xpService");
      let player1XPResult = null;
      let player2XPResult = null;
      
      const player1IsAuth = !game.player1Id.startsWith('guest_') && game.player1Id !== 'AI';
      const player2IsAuth = game.player2Id && !game.player2Id.startsWith('guest_') && game.player2Id !== 'AI' && game.player2Id !== 'Bot';
      
      // Update player 1 progress and calculate XP
      if (player1IsAuth) {
        // Get player's organizational context for progress tracking
        const [orgAssignment] = await db.select()
          .from(userOrganizationAssignments)
          .where(eq(userOrganizationAssignments.userId, game.player1Id))
          .limit(1);
        
        const orgMeta = orgAssignment ? {
          organizationId: orgAssignment.organizationId,
          unitId: orgAssignment.unitId || undefined,
          subUnitId: orgAssignment.subUnitId || undefined
        } : undefined;
        
        // Track completion status with pass/fail FIRST to use in totalGamesWon calculation
        const currentScore = p1CardCount;
        const totalQuestions = totalCards.length;
        const currentPercentage = (currentScore / totalQuestions) * 100;
        
        // Get required pass percentage from assignments (default 70%)
        const assignments = await storage.getQuizCollectionAssignments(game.collectionId);
        const requiredPassPercentage = assignments.length > 0 ? (assignments[0].requiredPassPercentage || 70) : 70;
        
        // Get existing user progress to track best score/percentage
        const userProgress = await storage.getUserQuizProgress(game.player1Id, game.collectionId);
        const previousAttempts = userProgress?.attempts || 0;
        const previousBestScore = userProgress?.bestScore || 0;
        const previousBestPercentage = userProgress?.bestPercentage || 0;
        
        // Calculate best percentage across all attempts
        const bestPercentage = Math.max(previousBestPercentage, currentPercentage);
        
        // Determine if CURRENT attempt passed (for totalGamesWon increment)
        const currentAttemptPassed = currentPercentage >= requiredPassPercentage;
        
        // Determine completion status based on BEST percentage (not current attempt)
        const passed = bestPercentage >= requiredPassPercentage;
        const completionStatus = passed ? 'completed_passed' : (previousAttempts > 0 || currentPercentage > 0 ? 'completed_failed' : 'outstanding');
        
        // Now update quiz game progress with new wins definition (quizzes passed)
        // Increment totalGamesWon only when CURRENT attempt passes
        const progress = await storage.getQuizGameProgress(game.player1Id, game.collectionId);
        const totalGames = (progress?.totalGamesPlayed || 0) + 1;
        const totalWins = (progress?.totalGamesWon || 0) + (currentAttemptPassed ? 1 : 0);
        const totalCorrect = (progress?.totalCorrectAnswers || 0) + player1Correct;
        const totalAnswers = (progress?.totalAnswers || 0) + totalQuestions;
        
        await storage.upsertQuizGameProgress(game.player1Id, game.collectionId, {
          totalGamesPlayed: totalGames,
          totalGamesWon: totalWins,
          totalCorrectAnswers: totalCorrect,
          totalAnswers: totalAnswers,
          averageScore: ((totalCorrect / totalAnswers) * 100).toFixed(2) as any,
          bestScore: Math.max(progress?.bestScore || 0, p1CardCount),
          lastPlayedAt: new Date()
        }, orgMeta);
        
        // Update user quiz progress with completion tracking
        await storage.upsertUserQuizProgress(game.player1Id, game.collectionId, {
          attempts: previousAttempts + 1,
          lastScore: currentScore,
          bestScore: Math.max(previousBestScore, currentScore),
          lastPercentage: currentPercentage,
          bestPercentage: bestPercentage,
          completionStatus: completionStatus
        }, orgMeta);
        
        console.log(`📊 Player 1 quiz progress: ${currentScore}/${totalQuestions} (${currentPercentage.toFixed(1)}%) - ${passed ? 'PASSED' : 'FAILED'} (required: ${requiredPassPercentage}%)`);
        
        // Calculate XP with quiz bonuses FIRST (needed for certificate)
        const gameOutcome = {
          playerId: game.player1Id,
          // For single player: won based on pass/fail, not opponent score
          won: game.gameMode === 'single' ? passed : (winnerId === game.player1Id && winnerId !== null),
          tied: game.gameMode === 'single' ? false : (winnerId === null),
          gameMode: game.gameMode === 'single' ? "single" as const : "1v1" as const,
          gameDuration: Math.floor((Date.now() - (game.gameStartedAt?.getTime() || Date.now())) / 1000),
          totalRounds: currentIndex + 1,
          roundsWon: p1CardCount,
          // Quiz-specific fields for bonus XP
          isQuiz: true,
          quizPassed: passed,
          quizPercentage: currentPercentage,
          quizScore: currentScore,
          totalQuestions: totalQuestions
        };
        
        const { xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);
        
        // Complete linked lessons if quiz passed
        if (passed && currentAttemptPassed) {
          try {
            // Check if this quiz is linked to any lessons
            const linkedLessons = await db.select()
              .from(lessonQuizLinks)
              .where(eq(lessonQuizLinks.quizId, game.collectionId));
            
            if (linkedLessons.length > 0) {
              let effectiveOrgId = orgMeta?.organizationId;
              let isPublicCourse = false;
              
              // For public courses, use the lesson's organizationId (course creator's org)
              // This ensures finalizeCompletion can find the lesson correctly
              if (!effectiveOrgId) {
                try {
                  // Get the first linked lesson to find its course and organization
                  const firstLessonId = linkedLessons[0].lessonId;
                  
                  // Get the lesson's organizationId directly
                  const [lesson] = await db.select({ organizationId: schema.lessons.organizationId })
                    .from(schema.lessons)
                    .where(eq(schema.lessons.id, firstLessonId))
                    .limit(1);
                  
                  if (lesson?.organizationId) {
                    // Check if this lesson is part of a public course
                    const [courseLesson] = await db.select({ courseId: schema.courseLessons.courseId })
                      .from(schema.courseLessons)
                      .where(eq(schema.courseLessons.lessonId, firstLessonId))
                      .limit(1);
                    
                    if (courseLesson?.courseId) {
                      const [course] = await db.select({ visibility: schema.courses.visibility })
                        .from(schema.courses)
                        .where(eq(schema.courses.id, courseLesson.courseId))
                        .limit(1);
                      
                      if (course?.visibility === 'public') {
                        isPublicCourse = true;
                        // Use the lesson's organizationId (course creator's org) for completion
                        effectiveOrgId = lesson.organizationId;
                        console.log(`[QuizCompletion] Using lesson's org ${effectiveOrgId} for public course completion (user ${game.player1Id})`);
                      }
                    }
                  }
                } catch (lessonOrgLookupError) {
                  console.warn(`[QuizCompletion] Error looking up lesson org for public course:`, lessonOrgLookupError);
                }
              }
              
              // Verify user has organization assignment before completing lessons
              if (!effectiveOrgId) {
                console.warn(`[QuizCompletion] Cannot complete linked lessons for user ${game.player1Id} - no organization assignment found`);
              } else {
                // Import services
                const { LessonProgressService } = await import("./services/lessonProgressService");

                // Complete each linked lesson
                for (const link of linkedLessons) {
                  try {
                    await LessonProgressService.finalizeCompletion({
                      lessonId: link.lessonId,
                      userId: game.player1Id,
                      organizationId: effectiveOrgId,
                      secondsSpent: 0, // Time tracking is optional for quiz-completed lessons
                    });
                    console.log(`📚 Lesson ${link.lessonId} marked as completed after passing quiz ${game.collectionId}`);
                  } catch (completionError: any) {
                    if (!completionError.message?.includes("duplicate") && !completionError.code?.includes("23505") && !completionError.message?.includes("already")) {
                      console.error(`[QuizCompletion] Lesson completion failed for lesson ${link.lessonId}:`, completionError);
                    }
                  }
                }
              }
            }
            
            // Check if this quiz completion triggers any course completion certificates
            try {
              const { CourseCompletionService } = await import("./services/courseCompletionService");
              const eligibleCourses = await CourseCompletionService.checkQuizCompletionTrigger(
                game.player1Id,
                game.collectionId
              );
              
              if (eligibleCourses.length > 0) {
                const { CertificateService } = await import("./services/certificateService");
                
                for (const course of eligibleCourses) {
                  try {
                    const courseCert = await CertificateService.issueCourseCompletionCertificate({
                      courseId: course.courseId,
                      userId: game.player1Id,
                      organizationId: orgMeta?.organizationId || '',
                      xpEarned: 0, // XP already awarded by xpService during quiz completion
                    });
                    console.log(`🏆 Course completion certificate issued for "${course.courseName}" after passing quiz ${game.collectionId}`);
                  } catch (courseCertError: any) {
                    // Ignore duplicate errors
                    if (!courseCertError.message?.includes("duplicate") && !courseCertError.message?.includes("already")) {
                      console.error(`[QuizCompletion] Course certificate failed for ${course.courseName}:`, courseCertError);
                    }
                  }
                }
              }
            } catch (error) {
              console.error("[QuizCompletion] Error checking course completion:", error);
              // Don't block quiz completion
            }
          } catch (error) {
            console.error("[QuizCompletion] Error processing linked lessons:", error);
            // Don't block quiz completion if lesson/certificate processing fails
          }
        }
        
        // Level-up milestone rewards (coins + potential power-up)
        if (xpResult.levelChanged && xpResult.newLevel > xpResult.previousLevel) {
          const level = xpResult.newLevel;
          
          // Milestone rewards every 5 levels
          if (level % 5 === 0) {
            const levelUpCoins = level * 10; // Scale with level (level 5 = 50 coins, level 10 = 100 coins, etc.)
            await gamificationService.awardCoins(
              game.player1Id,
              levelUpCoins,
              "level_up",
              `Reached level ${level}!`,
              { level }
            );
          }
        }
        
        // Enhance XP result with pass/fail info for client
        // Coin data (coinsEarned, coinMultiplier, etc.) already included from xpService
        player1XPResult = {
          ...xpResult,
          quizPassed: passed,
          quizPercentage: currentPercentage,
          requiredPassPercentage: requiredPassPercentage,
        };
        console.log(`🌟 Quiz Player 1 XP result:`, player1XPResult);
      }
      
      // Update player 2 progress and calculate XP (for multiplayer)
      if (player2IsAuth && game.gameMode !== 'single') {
        // Get player's organizational context for progress tracking
        const [orgAssignment2] = await db.select()
          .from(userOrganizationAssignments)
          .where(eq(userOrganizationAssignments.userId, game.player2Id!))
          .limit(1);
        
        const orgMeta2 = orgAssignment2 ? {
          organizationId: orgAssignment2.organizationId,
          unitId: orgAssignment2.unitId || undefined,
          subUnitId: orgAssignment2.subUnitId || undefined
        } : undefined;
        
        // Track completion status with pass/fail FIRST to use in totalGamesWon calculation
        const currentScore = p2CardCount;
        const totalQuestions = totalCards.length;
        const currentPercentage = (currentScore / totalQuestions) * 100;
        
        // Get required pass percentage from assignments (default 70%)
        const assignments = await storage.getQuizCollectionAssignments(game.collectionId);
        const requiredPassPercentage = assignments.length > 0 ? (assignments[0].requiredPassPercentage || 70) : 70;
        
        // Get existing user progress to track best score/percentage
        const userProgress = await storage.getUserQuizProgress(game.player2Id!, game.collectionId);
        const previousAttempts = userProgress?.attempts || 0;
        const previousBestScore = userProgress?.bestScore || 0;
        const previousBestPercentage = userProgress?.bestPercentage || 0;
        
        // Calculate best percentage across all attempts
        const bestPercentage = Math.max(previousBestPercentage, currentPercentage);
        
        // Determine if CURRENT attempt passed (for totalGamesWon increment)
        const currentAttemptPassed = currentPercentage >= requiredPassPercentage;
        
        // Determine completion status based on BEST percentage (not current attempt)
        const passed = bestPercentage >= requiredPassPercentage;
        const completionStatus = passed ? 'completed_passed' : (previousAttempts > 0 || currentPercentage > 0 ? 'completed_failed' : 'outstanding');
        
        // Now update quiz game progress with new wins definition (quizzes passed)
        // Increment totalGamesWon only when CURRENT attempt passes
        const progress = await storage.getQuizGameProgress(game.player2Id!, game.collectionId);
        const totalGames = (progress?.totalGamesPlayed || 0) + 1;
        const totalWins = (progress?.totalGamesWon || 0) + (currentAttemptPassed ? 1 : 0);
        const totalCorrect = (progress?.totalCorrectAnswers || 0) + player2Correct;
        const totalAnswers = (progress?.totalAnswers || 0) + totalQuestions;
        
        await storage.upsertQuizGameProgress(game.player2Id!, game.collectionId, {
          totalGamesPlayed: totalGames,
          totalGamesWon: totalWins,
          totalCorrectAnswers: totalCorrect,
          totalAnswers: totalAnswers,
          averageScore: ((totalCorrect / totalAnswers) * 100).toFixed(2) as any,
          bestScore: Math.max(progress?.bestScore || 0, p2CardCount),
          lastPlayedAt: new Date()
        }, orgMeta2);
        
        // Update user quiz progress with completion tracking
        await storage.upsertUserQuizProgress(game.player2Id!, game.collectionId, {
          attempts: previousAttempts + 1,
          lastScore: currentScore,
          bestScore: Math.max(previousBestScore, currentScore),
          lastPercentage: currentPercentage,
          bestPercentage: bestPercentage,
          completionStatus: completionStatus
        }, orgMeta2);
        
        console.log(`📊 Player 2 quiz progress: ${currentScore}/${totalQuestions} (${currentPercentage.toFixed(1)}%) - ${passed ? 'PASSED' : 'FAILED'} (required: ${requiredPassPercentage}%)`);
        
        // Calculate XP with quiz bonuses
        const gameOutcome = {
          playerId: game.player2Id!,
          won: winnerId === game.player2Id && winnerId !== null,
          tied: winnerId === null,
          gameMode: "1v1" as const,
          gameDuration: Math.floor((Date.now() - (game.gameStartedAt?.getTime() || Date.now())) / 1000),
          totalRounds: currentIndex + 1,
          roundsWon: p2CardCount,
          // Quiz-specific fields for bonus XP
          isQuiz: true,
          quizPassed: passed,
          quizPercentage: currentPercentage,
          quizScore: currentScore,
          totalQuestions: totalQuestions
        };
        
        const { xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);
        
        // Level-up milestone rewards (coins + potential power-up)
        if (xpResult.levelChanged && xpResult.newLevel > xpResult.previousLevel) {
          const level = xpResult.newLevel;
          
          // Milestone rewards every 5 levels
          if (level % 5 === 0) {
            const levelUpCoins = level * 10; // Scale with level
            await gamificationService.awardCoins(
              game.player2Id!,
              levelUpCoins,
              "level_up",
              `Reached level ${level}!`,
              { level }
            );
          }
        }
        
        // Enhance XP result with pass/fail info for client
        // Coin data (coinsEarned, coinMultiplier, etc.) already included from xpService
        player2XPResult = {
          ...xpResult,
          quizPassed: passed,
          quizPercentage: currentPercentage,
          requiredPassPercentage: requiredPassPercentage,
        };
        console.log(`🌟 Quiz Player 2 XP result:`, player2XPResult);
      }
      
      // Send game over event with XP results
      if (game.gameMode === 'single') {
        socket.emit('quiz-game-over', {
          gameId,
          winnerId: null, // No winner in single player
          gameResult: player1XPResult?.quizPassed ? 'passed' : 'failed',
          player1Score: p1CardCount,
          player2Score: null, // No opponent in single player
          totalQuestions: totalCards.length,
          xpResult: player1XPResult // Include XP result for authenticated players
        });
      } else {
        io.to(game.player1SocketId!).emit('quiz-game-over', {
          gameId,
          winnerId,
          gameResult: winnerId === game.player1Id ? 'win' : winnerId === game.player2Id ? 'loss' : 'tie',
          player1Score: p1CardCount,
          player2Score: p2CardCount,
          totalQuestions: totalCards.length,
          xpResult: player1XPResult // Include XP result for player 1
        });
        
        io.to(game.player2SocketId!).emit('quiz-game-over', {
          gameId,
          winnerId,
          gameResult: winnerId === game.player2Id ? 'win' : winnerId === game.player1Id ? 'loss' : 'tie',
          player1Score: p1CardCount,
          player2Score: p2CardCount,
          totalQuestions: totalCards.length,
          xpResult: player2XPResult // Include XP result for player 2
        });
      }
      
      // Clean up game
      await storage.deleteActiveQuizGame(gameId);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      
      // Remove from battle cards matchmaking queues
      for (const [collectionId, players] of Array.from(matchmakingQueue.entries())) {
        const filteredPlayers = players.filter((p: any) => p.socketId !== socket.id);
        if (filteredPlayers.length !== players.length) {
          matchmakingQueue.set(collectionId, filteredPlayers);
          console.log(`🚪 Removed disconnected player from battle cards ${collectionId} queue`);
        }
      }
      
      // Remove from quiz matchmaking queues
      for (const [collectionId, players] of Array.from(quizMatchmakingQueue.entries())) {
        const filteredPlayers = players.filter((p: any) => p.socketId !== socket.id);
        if (filteredPlayers.length !== players.length) {
          quizMatchmakingQueue.set(collectionId, filteredPlayers);
          console.log(`🚪 Removed disconnected player from quiz ${collectionId} queue`);
        }
      }
      
      // Handle active 1v1 games - check if disconnected player was in an active game
      try {
        const activeGames = await storage.getAllActiveOneVOneGames();
        for (const game of activeGames) {
          if (game.player1SocketId === socket.id || game.player2SocketId === socket.id) {
            console.log(`🔌 Connection lost in 1v1 game ${game.gameId} - awarding victory to remaining player`);
            
            // Determine who stayed connected and who disconnected
            const remainingSocketId = game.player1SocketId === socket.id ? game.player2SocketId : game.player1SocketId;
            const remainingPlayerId = game.player1SocketId === socket.id ? game.player2Id : game.player1Id;
            const remainingPlayerName = game.player1SocketId === socket.id ? game.player2Name : game.player1Name;
            const disconnectedPlayerName = game.player1SocketId === socket.id ? game.player1Name : game.player2Name;
            
            // Award victory to the remaining player
            if (remainingSocketId) {
              const gameResult = game.player1SocketId === socket.id ? 'player2_wins' : 'player1_wins';
              
              // Check if remaining player is authenticated (not a guest)
              const remainingPlayerIsAuth = remainingPlayerId && !remainingPlayerId.startsWith('guest_');
              
              try {
                let xpData = null;
                
                // Only calculate XP if remaining player is authenticated
                if (remainingPlayerIsAuth) {
                  const { player1XPData, player2XPData } = await saveOneVOneGameResult(game, gameResult);
                  xpData = game.player1SocketId === socket.id ? player2XPData : player1XPData;
                  console.log(`🏆 ${remainingPlayerName} (authenticated) wins by opponent disconnect with XP rewards`);
                } else {
                  console.log(`🏆 ${remainingPlayerName} (guest) wins by opponent disconnect - no XP recorded`);
                }
                
                // Send victory to remaining player (with or without XP)
                io.to(remainingSocketId).emit('game-ended-1v1', {
                  gameResult: 'win',
                  isPlayer1: game.player1SocketId !== socket.id,
                  reason: 'opponent_disconnect',
                  xpData: xpData,
                  message: `${disconnectedPlayerName} disconnected. You win!`
                });
                
              } catch (error) {
                console.error('❌ Error awarding victory for disconnect:', error);
                // Fallback: still send victory but without XP
                io.to(remainingSocketId).emit('game-ended-1v1', {
                  gameResult: 'win',
                  isPlayer1: game.player1SocketId !== socket.id,
                  reason: 'opponent_disconnect',
                  xpData: null,
                  message: `${disconnectedPlayerName} disconnected. You win!`
                });
              }
            }
            
            // Clean up the game
            await storage.deleteActiveOneVOneGame(game.gameId);
            console.log(`🧹 Cleaned up disconnect game: ${game.gameId} - victory awarded`);
            break; // Player can only be in one 1v1 game at a time
          }
        }
      } catch (error) {
        console.error('❌ Error handling 1v1 game disconnect:', error);
      }
      
      // Handle other active games cleanup
      try {
        // Run abandoned game cleanup for other game types
        storage.cleanupAbandonedGames().then((cleaned) => {
          if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} other abandoned games after player disconnect`);
          }
        }).catch((error) => {
          console.error('❌ Error during general disconnect cleanup:', error);
        });
        
        console.log(`🚪 Player with socket ${socket.id} disconnected, cleanup complete`);
      } catch (error) {
        console.error('Error cleaning up games on disconnect:', error);
      }
    });

    // Join game room
    socket.on('join-game', async (data) => {
      const { gameRoomId, userId } = data;
      try {
        // Verify player is in this game
        const playerSessions = await storage.getPlayerSessions(gameRoomId);
        const playerSession = playerSessions.find(session => session.playerId === userId);
        
        if (playerSession) {
          socket.join(gameRoomId);
          
          // Get current game state if game is already running
          const existingGameState = gameEngine.getGameState(gameRoomId);
          const gameRoom = await storage.getGameRoom(gameRoomId);
          
          socket.emit('joined-game', { 
            gameRoomId, 
            playerPosition: playerSession.playerPosition,
            currentPlayerPosition: existingGameState?.currentPlayerPosition || 0,
            gamePhase: existingGameState?.gamePhase || 'waiting',
            gameTimeSeconds: gameRoom?.gameTimeSeconds || 120,
            roundTimeSeconds: gameRoom?.roundTimeSeconds || 5
          });
          
          // If game is already started, send current game state
          if (existingGameState && existingGameState.gamePhase === 'playing') {
            socket.emit('player-turn', {
              currentPlayerPosition: existingGameState.currentPlayerPosition,
              roundNumber: existingGameState.roundNumber
            });
          }
          
          // Notify others in the room
          socket.to(gameRoomId).emit('player-joined', { 
            playerId: userId,
            playerPosition: playerSession.playerPosition,
            totalPlayers: playerSessions.length
          });
        }
      } catch (error) {
        console.error('Join game error:', error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Player ready to start
    socket.on('player-ready', async (data) => {
      const { gameRoomId } = data;
      try {
        const gameRoom = await storage.getGameRoom(gameRoomId);
        const playerSessions = await storage.getPlayerSessions(gameRoomId);
        
        console.log(`🎯 Player ready check: Room=${gameRoomId}, Players=${playerSessions.length}, MaxPlayers=${gameRoom?.maxPlayers}, State=${gameRoom?.gameState}`);
        
        // Check if all player slots are filled and game hasn't started
        if (gameRoom && playerSessions.length === gameRoom.maxPlayers && gameRoom.gameState !== 'playing') {
          console.log(`✅ All players ready, starting game for room ${gameRoomId}`);
          
          // Start the game only if not already started
          await storage.updateGameRoom(gameRoomId, { 
            gameState: "playing",
            gameStartedAt: new Date()
          });
          
          // Initialize the game with cards
          console.log(`🎮 Initializing game for room ${gameRoomId}`);
          const gameState = await gameEngine.initializeGame(gameRoomId);
          console.log(`✅ Game initialized with ${gameState.players.length} players`);
          
          // Add delay before starting to ensure all clients are ready
          setTimeout(() => {
            console.log(`📡 Emitting game-started to room ${gameRoomId}`);
            // Emit game state to all players with initial turn information
            io.to(gameRoomId).emit('game-started', { 
              gameRoomId,
              currentPlayerPosition: gameState.currentPlayerPosition,
              roundNumber: gameState.roundNumber,
              gameTimeSeconds: gameState.gameTimer,
              roundTimeSeconds: gameState.playerTimer,
              serverTime: Date.now(), // Add server timestamp for sync
              gameStartTimestamp: Date.now() // When game actually started
            });
            
            // Emit initial player turn after another short delay
            setTimeout(async () => {
              console.log(`🎯 Emitting player-turn to room ${gameRoomId}`);
              
              // Now start the player timer for the current player
              gameState.gamePhase = "playing";
              await gameEngine.startPlayerTimerForRoom(gameRoomId);
              
              io.to(gameRoomId).emit('player-turn', {
                currentPlayerPosition: gameState.currentPlayerPosition,
                roundNumber: gameState.roundNumber,
                gameRoomId // Add gameRoomId for verification
              });
            }, 500);
          }, 1000);
        } else {
          console.log(`⏳ Waiting for more players: ${playerSessions.length}/${gameRoom?.maxPlayers || 2} ready`);
        }
      } catch (error) {
        console.error('Player ready error:', error);
      }
    });

    // Player selects a stat (regular multiplayer games only)
    socket.on('select-stat', async (data) => {
      const { gameRoomId, statTypeId, playerPosition, gameId } = data;
      
      // Skip if this is a 1v1 game (handled by different handler above)
      if (gameId) {
        const oneVOneGame = await storage.getActiveOneVOneGame(gameId);
        if (oneVOneGame) {
          return;
        }
      }
      
      try {
        // Get user ID from the game session
        const playerSessions = await storage.getPlayerSessions(gameRoomId);
        const playerSession = playerSessions.find(session => session.playerPosition === playerPosition);
        const userId = playerSession?.playerId;
        
        if (!userId) {
          socket.emit('error', { message: 'User not authenticated' });
          return;
        }

        // Use GameEngine for stat selection
        const gameState = await gameEngine.selectStat(gameRoomId, userId, statTypeId);
        
        // Broadcast stat selection to all players
        io.to(gameRoomId).emit('stat-selected', { 
          statTypeId, 
          playerPosition,
          gamePhase: gameState.gamePhase 
        });
        
        // Process round result after a brief delay to show the selection
        setTimeout(async () => {
          try {
            const updatedGameState = await gameEngine.processRoundResult(gameRoomId);
            
            // Emit round result
            io.to(gameRoomId).emit('round-result', {
              winner: updatedGameState.lastWinner,
              roundCards: updatedGameState.roundCards,
              gamePhase: updatedGameState.gamePhase
            });
            
            // If game continues, emit next player turn
            if (updatedGameState.gamePhase === 'playing') {
              io.to(gameRoomId).emit('player-turn', {
                currentPlayerPosition: updatedGameState.currentPlayerPosition,
                roundNumber: updatedGameState.roundNumber
              });
            }
          } catch (error) {
            console.error('Process round error:', error);
          }
        }, 2000);
        
      } catch (error) {
        console.error('Select stat error:', error);
        socket.emit('error', { message: (error as Error).message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // TODO: Handle game state cleanup if needed
      // For now, games continue without disconnected players
      // They can rejoin if they reconnect
    });
  });

  return httpServer;
}
