/**
 * Payments Routes Module
 * 
 * Handles all payment-related endpoints including:
 * - YOCO payment gateway integration
 * - Webhook endpoints (CRITICAL: exact paths preserved for signature verification)
 * - Credit packages and orders
 * - Subscriptions management
 * - Invoices and receipts
 * 
 * CRITICAL WEBHOOK WARNING:
 * The webhook routes at /api/webhooks/* and /api/payments/webhook MUST keep their
 * EXACT paths because server/index.ts captures raw body for signature verification.
 */

import type { Express, Request, Response } from "express";
import { getBaseUrl } from "../config/base-url";
import { z } from "zod";
import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import { userOrganizationRoles } from "@shared/schema";

// Services
import { PaymentService } from "../services/paymentService";
import { PaymentRouter } from "../services/paymentRouter";
import { PaymentOrchestratorService } from "../services/paymentOrchestratorService";
import { PurchaseService } from "../services/purchaseService";
import { CurrencyService } from "../services/currencyService";
import { InvoiceService } from "../services/invoiceService";
import { MailerSendService } from "../services/mailerSendService";
import { IntegrationConfigService } from "../services/integrationConfigService";
import { WebhookReplayProtection } from "../services/webhookReplayProtection";
import { verifyYocoWebhook } from "../services/yocoWebhookVerifier";

// Shared resources and middleware
import {
  storage,
  isAdmin,
  isTeacherOrAdmin,
  isSuperAdmin,
  withSessionAuthMiddleware,
  resolveEffectiveOrganization,
  enforceOrgIsolation,
  type RequestWithOrgContext,
  type RequestWithEffectiveOrg,
} from "./sharedResources";

import { sendError, ErrorCode } from "../utils/errorResponses";
import { isFeatureEnabled, isPaymentGatewayEnabled } from "../featureFlags";

// Zod schemas for validation
const createSubscriptionSchema = z.object({
  planId: z.string().uuid("Invalid plan ID"),
  targetType: z.enum(['organization', 'user']),
  targetId: z.string().uuid("Invalid target ID"),
  autoRenew: z.boolean().optional().default(true),
});

const updateSubscriptionSchema = z.object({
  autoRenew: z.boolean().optional(),
});

// ===== HELPER FUNCTIONS =====

/**
 * Check if user can access a specific organization
 */
async function canAccessOrganization(
  userId: string,
  organizationId: string,
  session?: any,
  resolvedEffectiveOrgId?: string | null
): Promise<boolean> {
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    
    if (effectiveRole === 'SuperAdmin' && !impersonatedOrganization) {
      return true;
    }
    
    if (effectiveRole === 'SuperAdmin' && impersonatedOrganization) {
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
  if (user?.isSuperAdmin) return true;
  
  const userRoles = await storage.getUserRoles(userId);
  if (userRoles.length === 0) return false;
  
  const effectiveOrgId = userRoles[0].organizationId;
  return organizationId === effectiveOrgId;
}

/**
 * Check if user can access an invoice PDF
 */
async function canAccessInvoicePDF(userId: string, invoiceId: string, session?: any): Promise<boolean> {
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

  if (!invoice.subscriptionId) return false;

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

/**
 * Check if user can access a course purchase receipt PDF
 */
async function canAccessCoursePurchaseReceiptPDF(userId: string, purchaseId: string, session?: any): Promise<boolean> {
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, impersonatedOrganization } = session.context;
    if ((effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && !impersonatedOrganization) {
      return true;
    }
  } else {
    const user = await storage.getUser(userId);
    if (user?.isSuperAdmin || user?.isCustSuper) return true;
  }

  const [purchase] = await db
    .select()
    .from(schema.coursePurchases)
    .where(eq(schema.coursePurchases.id, purchaseId))
    .limit(1);

  if (!purchase) return false;

  // Course purchase receipts are accessible only to the buyer (userId-scoped)
  return purchase.userId === userId;
}

/**
 * Check if user can access a receipt PDF
 */
async function canAccessReceiptPDF(userId: string, receiptId: string, session?: any): Promise<boolean> {
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

/**
 * Register all payment-related routes
 * 
 * IMPORTANT: Routes are registered directly to the app (not via Router)
 * to preserve exact webhook paths for signature verification.
 */
export function registerPaymentsRoutes(app: Express): void {
  
  // ==================== PUBLIC CURRENCY RATES ====================
  // Public endpoint for currency conversion - NO AUTH required for purchase flow
  // This endpoint is critical for displaying correct prices to users
  
  app.get('/api/currency/rates', async (req: Request, res: Response) => {
    try {
      const [rates, stalenessInfo] = await Promise.all([
        CurrencyService.getAllCurrentRates(),
        CurrencyService.checkRateStaleness(),
      ]);
      
      // Return empty rates with clear error if no rates available
      if (!rates || rates.length === 0) {
        console.warn('[Currency Rates] No active rates found in database');
        return res.status(503).json({ 
          error: 'Currency rates unavailable',
          rates: [],
          isRateStale: true,
          rateLastUpdated: null,
        });
      }
      
      res.json({ 
        rates,
        isRateStale: stalenessInfo.isStale,
        rateLastUpdated: stalenessInfo.lastUpdated ? stalenessInfo.lastUpdated.toISOString() : null,
      });
    } catch (error) {
      console.error('[Currency Rates] Error fetching rates:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch currency rates',
        rates: [],
        isRateStale: true,
        rateLastUpdated: null,
      });
    }
  });
  
  // ==================== CREDIT PACKAGES ====================
  
  app.get('/api/credit-packages', isTeacherOrAdmin, async (req: Request, res: Response) => {
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

  app.post('/api/credit-packages/:packageId/purchase', isTeacherOrAdmin, async (req: Request, res: Response) => {
    if (!isPaymentGatewayEnabled()) {
      return res.status(503).json({ 
        error: "Payment gateway disabled",
        message: "Credit purchases are not available on this platform. Credits are managed by your administrator."
      });
    }
    try {
      const userId = req.session.userId!;
      const { packageId } = req.params;

      // RBAC: Block learners from purchasing credits
      if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
        const { effectiveRole, organizations } = req.session.context;
        // Check if user is only a learner (not teacher/org_admin/super_admin)
        if (effectiveRole === 'learner' || 
            (organizations && organizations.length > 0 && 
             organizations.every((org: any) => org.role === 'learner'))) {
          console.warn(`[Credit Packages] Learner ${userId} attempted to purchase credits - blocked`);
          return res.status(403).json({ error: "Learners are not authorized to purchase credits" });
        }
      } else {
        // Fallback: Check user roles from database
        const userRoles = await storage.getUserRoles(userId);
        const hasNonLearnerRole = userRoles.some(r => 
          r.role === 'teacher' || r.role === 'instructor' || r.role === 'org_admin' || r.role === 'super_admin'
        );
        if (userRoles.length > 0 && !hasNonLearnerRole) {
          console.warn(`[Credit Packages] Learner ${userId} attempted to purchase credits - blocked`);
          return res.status(403).json({ error: "Learners are not authorized to purchase credits" });
        }
      }

      let organizationId: string | null = null;
      
      if (isFeatureEnabled('SESSION_AUTH_ENABLED') && (req.session.context?.impersonatedOrganization || req.session.context?.primaryOrganization)) {
        organizationId = req.session.context.impersonatedOrganization?.orgId || req.session.context.primaryOrganization!.orgId;
      } else {
        const userRoles = await db
          .select({
            organizationId: userOrganizationRoles.organizationId,
          })
          .from(userOrganizationRoles)
          .where(eq(userOrganizationRoles.userId, userId))
          .orderBy(desc(userOrganizationRoles.createdAt))
          .limit(1);
        
        organizationId = userRoles.length > 0 ? userRoles[0].organizationId : null;
      }
      
      if (!organizationId) {
        console.error(`[Credit Packages] User ${userId} attempted purchase without organization membership`);
        return res.status(400).json({ error: "User must belong to an organization to purchase credits" });
      }

      // YOCO TEST MODE RESTRICTION: Only @learnplay.co.za verified emails can purchase credits in test mode
      const currentYocoMode = await PaymentService.getYocoMode();
      if (currentYocoMode === 'test') {
        const [user] = await db
          .select({ email: schema.users.email, emailVerified: schema.users.emailVerified })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const isLearnplayDomain = user.email.toLowerCase().endsWith('@learnplay.co.za');
        
        if (!user.emailVerified || !isLearnplayDomain) {
          console.log(`[Credit Packages] YOCO test mode - blocked credit purchase for user ${userId} (verified: ${user.emailVerified}, domain: ${user.email.split('@')[1]})`);
          return res.status(403).json({ 
            error: "Credit purchases are restricted in test mode. Only verified @learnplay.co.za email addresses can purchase LP Credits during testing.",
            code: "YOCO_TEST_MODE_RESTRICTED"
          });
        }
        
        console.log(`[Credit Packages] YOCO test mode - allowing credit purchase for verified @learnplay.co.za user ${userId}`);
      }

      const [pkg] = await db
        .select()
        .from(schema.creditPurchasePackages)
        .where(eq(schema.creditPurchasePackages.id, packageId))
        .limit(1);

      if (!pkg) {
        return res.status(404).json({ error: "Credit package not found" });
      }

      if (!pkg.isActive) {
        return res.status(400).json({ error: "This credit package is no longer available" });
      }

      const baseUrl = getBaseUrl();
      
      const currency = (pkg.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR';
      const { lockedRate, forceYocoMode, purchaseTarget, organizationId: reqOrgId } = req.body;

      const effectiveOrgId = purchaseTarget === 'organization' && reqOrgId ? reqOrgId : organizationId;

      let validatedYocoMode: 'test' | 'live' | undefined;
      if (forceYocoMode) {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!user?.isSuperAdmin) {
          return res.status(403).json({ error: "Only SuperAdmins can override payment mode" });
        }
        if (forceYocoMode !== 'test' && forceYocoMode !== 'live') {
          return res.status(400).json({ error: "Invalid forceYocoMode value. Must be 'test' or 'live'" });
        }
        validatedYocoMode = forceYocoMode;
      }
      
      const checkout = await PaymentOrchestratorService.createCreditCheckout({
        userId: userId,
        organizationId: organizationId,
        packageId: pkg.id,
        creditsAmount: pkg.creditsAmount,
        amount: pkg.priceAmount,
        currency: currency,
        successUrl: `${baseUrl}/credits?payment=success&intentId={intentId}`,
        cancelUrl: `${baseUrl}/credits?payment=cancelled&intentId={intentId}`,
        failureUrl: `${baseUrl}/credits?payment=failed&intentId={intentId}`,
        lockedRate,
        forceYocoMode: validatedYocoMode,
        purchaseTarget: purchaseTarget as 'personal' | 'organization' | undefined,
      });

      if (!checkout.success || !checkout.checkoutUrl) {
        return sendError(res, 500, checkout.error || "Failed to create payment checkout", ErrorCode.EXTERNAL_SERVICE_ERROR);
      }

      console.log(`[Credit Packages] Created purchase checkout for package ${packageId}`);

      res.json({
        package: pkg,
        checkoutUrl: checkout.checkoutUrl,
        message: "Redirect user to checkout URL to complete payment"
      });
    } catch (error: any) {
      console.error('[Credit Packages] Purchase error:', error);
      return sendError(res, 500, "Failed to initiate credit purchase", ErrorCode.EXTERNAL_SERVICE_ERROR);
    }
  });

  // ==================== ON-PREM ENROLLMENT BYPASS ====================

  app.post('/api/courses/:courseId/onprem-enroll', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (isPaymentGatewayEnabled()) {
        return res.status(400).json({ error: 'Use the standard purchase flow when payment gateway is enabled' });
      }

      const userId = req.session.userId!;
      const { courseId } = req.params;

      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, courseId),
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (course.status !== 'active') {
        return res.status(400).json({ error: 'Course is not available for enrollment' });
      }

      const existingPurchase = await db.query.coursePurchases.findFirst({
        where: and(
          eq(schema.coursePurchases.userId, userId),
          eq(schema.coursePurchases.courseId, courseId),
          eq(schema.coursePurchases.status, 'completed')
        ),
      });

      if (existingPurchase) {
        return res.status(400).json({ error: 'You already have access to this course' });
      }

      const latestVersion = await db.query.courseVersions.findFirst({
        where: and(
          eq(schema.courseVersions.courseId, courseId),
          eq(schema.courseVersions.isPublished, true)
        ),
        orderBy: desc(schema.courseVersions.versionNumber),
      });

      const basePrice = latestVersion ? latestVersion.basePrice.toString() : course.price?.toString() || '0';
      const baseCurrency = (latestVersion?.baseCurrency || course.currency || 'ZAR') as string;

      const versionId = latestVersion?.id || course.currentVersionId;
      if (!versionId) {
        const anyVersion = await db.query.courseVersions.findFirst({
          where: eq(schema.courseVersions.courseId, courseId),
          orderBy: desc(schema.courseVersions.createdAt),
        });
        if (!anyVersion) {
          console.error(`[OnPrem Enroll] Course ${courseId} has no version - cannot create purchase`);
          return res.status(400).json({ error: 'This course is not yet ready for enrollment. Please contact your administrator.' });
        }
      }

      const purchase = await PurchaseService.createPurchase(
        userId,
        courseId,
        basePrice,
        baseCurrency,
        'onprem_manual_enroll',
        baseCurrency,
        '1.00000000',
        basePrice,
        '0.0000',
        '0.0000',
        basePrice,
        baseCurrency,
        basePrice,
      );

      console.log(`[OnPrem Enroll] User ${userId} enrolled in course ${courseId} (price: ${basePrice} ${baseCurrency})`);
      
      res.json({ success: true, message: 'Enrollment successful' });
    } catch (error: any) {
      console.error('[OnPrem Enroll] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to enroll in course' });
    }
  });

  // ==================== USER PURCHASE HISTORY ====================

  app.get('/api/my-purchase-history', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const purchases = await PurchaseService.getUserPurchases(userId);
      const completed = purchases
        .filter((p: any) => p.status === 'completed')
        .map((p: any) => ({
          id: p.id,
          courseTitle: p.course?.title || 'Unknown Course',
          purchasePrice: p.purchasePrice,
          purchaseCurrency: p.purchaseCurrency,
          purchasedAt: p.purchasedAt,
          checkoutId: p.checkoutId,
          status: p.status,
        }));
      res.json(completed);
    } catch (error: any) {
      console.error('[Purchase History] Error:', error);
      res.status(500).json({ error: 'Failed to fetch purchase history' });
    }
  });

  // ==================== COURSE PURCHASE CHECKOUT ====================
  
  /**
   * Course purchase checkout endpoint
   * Creates a YOCO checkout for purchasing a course
   * Mirrors the credit package purchase pattern for consistency
   */
  app.post('/api/courses/:courseId/checkout', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    if (!isPaymentGatewayEnabled()) {
      return res.status(503).json({ 
        error: "Payment gateway disabled",
        message: "Credit purchases are not available on this platform. Credits are managed by your administrator."
      });
    }
    try {
      const userId = req.session.user.id;
      const { courseId } = req.params;
      const { currency, lockedRate, forceYocoMode } = req.body;

      // Fetch course details
      const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
      
      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (course.status !== 'active') {
        return res.status(400).json({ error: 'Course is not available for purchase' });
      }

      // Only public courses can be purchased through the marketplace
      if (course.visibility !== 'public') {
        return res.status(403).json({ 
          error: 'This course is only available to organization members and cannot be purchased publicly' 
        });
      }

      // Check if user already owns this course
      const existingPurchase = await db.query.coursePurchases.findFirst({
        where: and(
          eq(schema.coursePurchases.userId, userId),
          eq(schema.coursePurchases.courseId, courseId),
          eq(schema.coursePurchases.status, 'completed')
        ),
      });

      if (existingPurchase) {
        return res.status(400).json({ error: 'You already own this course' });
      }

      // Block demo organizations from creating payments
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const paymentOrgId = effectiveOrg.organizationId || req.session.user.organizationId;
      if (paymentOrgId) {
        const paymentOrg = await storage.getOrganization(paymentOrgId);
        if (paymentOrg?.isDemo === true) {
          console.log(`[Course Purchase] Blocking checkout for demo org ${paymentOrgId}`);
          return res.status(400).json({ error: "Demo organizations cannot purchase courses" });
        }
      }

      // Get course price from course or latest published version
      const latestVersion = await db.query.courseVersions.findFirst({
        where: and(
          eq(schema.courseVersions.courseId, courseId),
          eq(schema.courseVersions.isPublished, true)
        ),
        orderBy: desc(schema.courseVersions.versionNumber),
      });

      const baseAmount = latestVersion ? latestVersion.basePrice.toString() : course.price?.toString() || '0';
      const baseCurrency = (latestVersion?.baseCurrency || course.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR';
      const displayCurrency = (currency as 'ZAR' | 'USD' | 'EUR') || baseCurrency;

      // Add 5% platform fee to base amount (consistent with existing /api/payments/create-checkout)
      const baseAmountNum = parseFloat(baseAmount);
      const platformFee = baseAmountNum * 0.05;
      const totalAmount = (baseAmountNum + platformFee).toFixed(4);
      
      console.log(`[Course Purchase] Price breakdown: ${baseAmountNum.toFixed(2)} ${displayCurrency} + ${platformFee.toFixed(2)} fee = ${totalAmount} total`);

      // Validate forceYocoMode - only SuperAdmins can use it
      let validatedYocoMode: 'test' | 'live' | undefined;
      if (forceYocoMode) {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!user?.isSuperAdmin) {
          return res.status(403).json({ error: "Only SuperAdmins can override payment mode" });
        }
        if (forceYocoMode !== 'test' && forceYocoMode !== 'live') {
          return res.status(400).json({ error: "Invalid forceYocoMode value. Must be 'test' or 'live'" });
        }
        validatedYocoMode = forceYocoMode;
      }

      const baseUrl = getBaseUrl();

      // Create checkout using PaymentOrchestratorService (consistent with credit purchases)
      const checkout = await PaymentOrchestratorService.createCourseCheckout({
        userId,
        courseId,
        amount: totalAmount,
        currency: displayCurrency,
        successUrl: `${baseUrl}/courses/${courseId}/purchase-success?intentId={intentId}`,
        cancelUrl: `${baseUrl}/courses/${courseId}?payment=cancelled&intentId={intentId}`,
        failureUrl: `${baseUrl}/courses/${courseId}?payment=failed&intentId={intentId}`,
        lockedRate,
        forceYocoMode: validatedYocoMode,
      });

      if (!checkout.success || !checkout.checkoutUrl) {
        return sendError(res, 500, checkout.error || "Failed to create payment checkout", ErrorCode.EXTERNAL_SERVICE_ERROR);
      }

      console.log(`[Course Purchase] Checkout created for user ${userId}, course ${courseId}`);

      res.json({
        course: {
          id: course.id,
          title: course.title,
          basePrice: baseAmount,
          platformFee: platformFee.toFixed(2),
          totalPrice: totalAmount,
          currency: displayCurrency,
        },
        checkoutUrl: checkout.checkoutUrl,
        paymentIntentId: checkout.paymentIntentId,
        message: "Redirect user to checkout URL to complete payment"
      });
    } catch (error: any) {
      console.error('[Course Purchase] Checkout error:', error);
      return sendError(res, 500, "Failed to initiate course purchase", ErrorCode.EXTERNAL_SERVICE_ERROR);
    }
  });

  // ==================== PAYMENT GATEWAY ROUTES ====================
  
  app.post('/api/payments/create-checkout', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    if (!isPaymentGatewayEnabled()) {
      return res.status(503).json({ 
        error: "Payment gateway disabled",
        message: "Credit purchases are not available on this platform. Credits are managed by your administrator."
      });
    }
    try {
      const userId = req.session.user.id;
      const { courseId, amount, currency, versionId, isUpgrade, lockedRate, forceYocoMode } = req.body;

      if (!courseId || !amount || !currency) {
        return res.status(400).json({ error: 'Missing required fields: courseId, amount, currency' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const paymentOrgId = effectiveOrg.organizationId || req.session.user.organizationId;
      if (paymentOrgId) {
        const paymentOrg = await storage.getOrganization(paymentOrgId);
        if (paymentOrg?.isDemo === true) {
          console.log(`[Payment] Blocking payment checkout for demo org ${paymentOrgId}`);
          return res.status(400).json({ error: "Demo organizations cannot create subscriptions" });
        }
      }

      const originalAmount = parseFloat(amount.toString());
      const originalCurrency = currency as 'ZAR' | 'USD' | 'EUR';
      let amountInZAR = originalAmount;
      let appliedRate: string = '1.00000000';
      let rateSource: 'locked' | 'fresh' = 'fresh';

      if (originalCurrency !== 'ZAR') {
        const RATE_MAX_AGE_MINUTES = 30;
        let useLockedRate = false;

        if (lockedRate?.exchangeRate && lockedRate?.rateLockedAt && lockedRate?.originalCurrency === originalCurrency) {
          const lockedAt = new Date(lockedRate.rateLockedAt);
          const ageMinutes = (Date.now() - lockedAt.getTime()) / (1000 * 60);
          
          if (ageMinutes <= RATE_MAX_AGE_MINUTES) {
            const lockedRateNum = parseFloat(lockedRate.exchangeRate);
            if (lockedRateNum > 0 && !isNaN(lockedRateNum)) {
              amountInZAR = originalAmount * lockedRateNum;
              appliedRate = lockedRate.exchangeRate;
              rateSource = 'locked';
              useLockedRate = true;
              console.log(`[API] Using locked rate: ${originalAmount} ${originalCurrency} → ${amountInZAR.toFixed(2)} ZAR (rate: ${appliedRate}, locked ${ageMinutes.toFixed(1)} min ago)`);
            }
          } else {
            console.log(`[API] Locked rate expired (${ageMinutes.toFixed(1)} min old, max ${RATE_MAX_AGE_MINUTES} min). Using fresh rate.`);
          }
        }

        if (!useLockedRate) {
          const conversionResult = await CurrencyService.convertAmount(
            amount.toString(),
            originalCurrency,
            'ZAR'
          );
          amountInZAR = parseFloat(conversionResult.convertedAmount);
          appliedRate = conversionResult.rate;
          rateSource = 'fresh';
          console.log(`[API] Currency conversion (fresh): ${originalAmount} ${originalCurrency} → ${amountInZAR.toFixed(2)} ZAR (rate: ${appliedRate})`);
        }
      }

      const platformFeeZAR = amountInZAR * 0.05;
      const totalAmountZAR = amountInZAR + platformFeeZAR;

      let validatedYocoMode: 'test' | 'live' | undefined;
      if (forceYocoMode) {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!user?.isSuperAdmin) {
          return res.status(403).json({ error: "Only SuperAdmins can override payment mode" });
        }
        if (forceYocoMode !== 'test' && forceYocoMode !== 'live') {
          return res.status(400).json({ error: "Invalid forceYocoMode value. Must be 'test' or 'live'" });
        }
        validatedYocoMode = forceYocoMode;
      }

      const baseUrl = getBaseUrl();
      const successUrl = `${baseUrl}/courses/${courseId}/purchase-success?checkoutId={id}`;
      const cancelUrl = `${baseUrl}/courses/${courseId}?cancelled=true`;
      const failureUrl = `${baseUrl}/courses/${courseId}?failed=true`;

      const checkout = await PaymentService.createYocoCheckout({
        courseId,
        userId,
        amount: totalAmountZAR.toFixed(2),
        currency: 'ZAR',
        successUrl,
        cancelUrl,
        failureUrl,
        organizationId: paymentOrgId || req.session.user.organizationId,
        courseVersionId: versionId,
        isUpgrade: isUpgrade || false,
        originalAmount: originalAmount.toString(),
        originalCurrency: originalCurrency,
        forceYocoMode: validatedYocoMode,
      });

      console.log(`[API] YOCO checkout created for user ${userId}, course ${courseId} (${amountInZAR.toFixed(2)} ZAR + ${platformFeeZAR.toFixed(2)} ZAR platform fee = ${totalAmountZAR.toFixed(2)} ZAR total, rate: ${appliedRate}, source: ${rateSource})`);
      res.json({
        ...checkout,
        appliedRate,
        rateSource,
        amountInZAR: amountInZAR.toFixed(2),
        platformFeeZAR: platformFeeZAR.toFixed(2),
        totalAmountZAR: totalAmountZAR.toFixed(2),
      });
    } catch (error) {
      console.error('Error creating YOCO checkout:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/payments/verify/:checkoutId', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { checkoutId } = req.params;

      if (!checkoutId) {
        return res.status(400).json({ error: 'Missing checkoutId' });
      }

      const verification = await PaymentService.verifyYocoPayment(checkoutId);

      console.log(`[API] Payment verification for ${checkoutId}: ${verification.verified ? 'SUCCESS' : 'FAILED'}`);
      res.json(verification);
    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== WEBHOOK ROUTES (CRITICAL - EXACT PATHS) ====================
  
  /**
   * Unified YOCO webhook handler
   * CRITICAL: This path MUST match the rawBody capture in server/index.ts
   */
  app.post('/api/webhooks/yoco', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const webhookSignature = req.headers['webhook-signature'] as string;

      const verificationResult = await verifyYocoWebhook(req);
      
      if (!verificationResult.valid) {
        return res.status(verificationResult.statusCode).json({ error: verificationResult.error });
      }

      const eventId = verificationResult.webhookId || WebhookReplayProtection.extractEventId('yoco', payload);
      if (eventId) {
        const isNewEvent = await WebhookReplayProtection.checkAndRecordEvent('yoco', eventId, webhookSignature || 'no-signature');
        if (!isNewEvent) {
          console.warn('[YOCO Webhook] Replay attack detected - event already processed');
          return res.status(200).json({ received: true, eventType: payload.type, message: 'Event already processed (replay detected)' });
        }
      } else {
        console.warn('[YOCO Webhook] No event ID found in payload - replay protection skipped');
      }

      const result = await PaymentRouter.handleWebhook(payload);

      if (!result.success) {
        console.error('[Webhook] Payment router failed:', result.error);
        return res.status(500).json({ error: result.error });
      }

      console.log('[Webhook] Payment processed successfully:', result.message);
      res.json({ received: true, eventType: payload.type, message: result.message });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Legacy YOCO webhook endpoint
   * CRITICAL: This path MUST match the rawBody capture in server/index.ts
   * Kept for backward compatibility with existing webhook registrations
   */
  app.post('/api/payments/webhook', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const webhookSignature = req.headers['webhook-signature'] as string;

      console.log('[YOCO Legacy Webhook] Received webhook, using unified verification');

      const verificationResult = await verifyYocoWebhook(req);
      
      if (!verificationResult.valid) {
        return res.status(verificationResult.statusCode).json({ error: verificationResult.error });
      }

      const eventId = verificationResult.webhookId || WebhookReplayProtection.extractEventId('yoco', payload);
      if (eventId) {
        const isNewEvent = await WebhookReplayProtection.checkAndRecordEvent('yoco', eventId, webhookSignature || 'no-signature');
        if (!isNewEvent) {
          console.warn('[YOCO Legacy Webhook] Replay attack detected - event already processed');
          return res.status(200).json({ received: true, eventType: payload.type, message: 'Event already processed (replay detected)' });
        }
      } else {
        console.warn('[YOCO Legacy Webhook] No event ID found in payload - replay protection skipped');
      }

      const result = await PaymentRouter.handleWebhook(payload);

      if (!result.success) {
        console.error('[Legacy Webhook] Payment router failed:', result.error);
        return res.status(500).json({ error: result.error });
      }

      console.log('[Legacy Webhook] Payment processed successfully:', result.message);
      res.json({ received: true, eventType: payload.type, message: result.message });
    } catch (error) {
      console.error('Error handling legacy webhook:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * MailerSend webhook endpoint for email delivery tracking
   */
  app.post('/api/webhooks/mailersend', async (req: Request, res: Response) => {
    try {
      const event = req.body;
      const signature = (req.headers['signature'] || req.headers['Signature']) as string;
      
      const webhookSecret = await IntegrationConfigService.getSecret('mailersend', 'webhookSecret');
      if (webhookSecret) {
        if (!signature) {
          console.error('[MailerSend Webhook] Missing signature header - rejecting webhook');
          return res.status(401).json({ error: 'Missing webhook signature' });
        }

        const rawBody = (req as any).rawBody;
        if (!rawBody) {
          console.error('[MailerSend Webhook] Raw body not available for signature verification');
          return res.status(500).json({ error: 'Internal configuration error' });
        }

        const isSignatureValid = MailerSendService.verifyWebhookSignature(
          signature,
          rawBody,
          webhookSecret,
        );

        if (!isSignatureValid) {
          console.error('[MailerSend Webhook] Invalid signature - rejecting webhook');
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }

        console.log('[MailerSend Webhook] Signature verified successfully');
      } else {
        if (process.env.NODE_ENV === 'production') {
          console.error('[MailerSend Webhook] Webhook secret missing in production - rejecting webhook');
          return res.status(503).json({ error: 'Webhook verification is not configured' });
        }
        console.warn('[MailerSend Webhook] Webhook secret not configured - skipping signature verification (INSECURE for production)');
      }
      
      if (!event || !event.type) {
        console.warn('[MailerSend Webhook] Invalid webhook payload - missing type');
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      const eventId = WebhookReplayProtection.extractEventId('mailersend', event);
      if (eventId) {
        const isNewEvent = await WebhookReplayProtection.checkAndRecordEvent('mailersend', eventId, signature || 'no-signature');
        if (!isNewEvent) {
          console.warn('[MailerSend Webhook] Replay attack detected - event already processed');
          return res.status(200).json({ received: true, message: 'Event already processed (replay detected)' });
        }
      } else {
        console.warn('[MailerSend Webhook] No event ID found in payload - replay protection skipped');
      }

      console.log(`[MailerSend Webhook] Received event: ${event.type}`);

      const result = await MailerSendService.handleWebhookEvent(event);

      if (!result) {
        console.warn('[MailerSend Webhook] Event not processed (might be unhandled event type)');
        return res.json({ received: true, processed: false });
      }

      console.log('[MailerSend Webhook] Event processed successfully');
      res.json({ received: true, processed: true });
    } catch (error) {
      console.error('[MailerSend Webhook] Error handling webhook:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/payments/status', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const status = await PaymentService.getSetupStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting payment status:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== YOCO MODE ENDPOINT ====================
  
  /**
   * Get current YOCO payment mode and user eligibility for test mode purchases
   * Used by frontend to show appropriate messaging for LP Credits purchases
   */
  app.get('/api/payments/yoco-mode', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const mode = await PaymentService.getYocoMode();
      
      // Get user's email verification status and domain for test mode eligibility
      let canPurchaseCreditsInTestMode = true;
      let testModeRestrictionReason: string | null = null;
      
      if (mode === 'test') {
        const [user] = await db
          .select({ email: schema.users.email, emailVerified: schema.users.emailVerified })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);
        
        if (user) {
          const isLearnplayDomain = user.email.toLowerCase().endsWith('@learnplay.co.za');
          
          if (!user.emailVerified) {
            canPurchaseCreditsInTestMode = false;
            testModeRestrictionReason = 'Your email address is not verified. Please verify your email to purchase credits in test mode.';
          } else if (!isLearnplayDomain) {
            canPurchaseCreditsInTestMode = false;
            testModeRestrictionReason = 'LP Credit purchases are restricted to @learnplay.co.za team members during test mode. Course purchases remain available for everyone.';
          }
        }
      }
      
      res.json({
        mode,
        isTestMode: mode === 'test',
        canPurchaseCreditsInTestMode,
        testModeRestrictionReason,
        // Courses can always be purchased regardless of test mode
        canPurchaseCourses: true
      });
    } catch (error) {
      console.error('Error getting YOCO mode:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== PURCHASE CONFIRMATION ====================
  
  app.get('/api/purchases/:checkoutId/confirmation', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { checkoutId } = req.params;
      const userId = req.session.userId!;

      if (!checkoutId) {
        return res.status(400).json({ error: 'Checkout ID is required' });
      }

      const [paymentIntent] = await db.select()
        .from(schema.paymentIntents)
        .where(eq(schema.paymentIntents.checkoutId, checkoutId))
        .limit(1);

      if (!paymentIntent) {
        const allIntents = await db.select()
          .from(schema.paymentIntents)
          .where(sql`LOWER(${schema.paymentIntents.checkoutId}) = LOWER(${checkoutId})`)
          .limit(1);
        
        if (!allIntents.length) {
          return res.status(404).json({ 
            error: 'Payment not found',
            status: 'not_found'
          });
        }
      }

      const intent = paymentIntent || (await db.select()
        .from(schema.paymentIntents)
        .where(sql`LOWER(${schema.paymentIntents.checkoutId}) = LOWER(${checkoutId})`)
        .limit(1))[0];

      if (intent.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const confirmationData: any = {
        checkoutId: intent.checkoutId,
        intentType: intent.intentType,
        status: intent.status,
        amount: intent.originalAmount || intent.amount,
        currency: intent.originalCurrency || intent.currency,
        createdAt: intent.createdAt,
      };

      if (intent.intentType === 'credits') {
        const [creditOrder] = await db.select()
          .from(schema.creditOrders)
          .where(eq(schema.creditOrders.paymentIntentId, intent.id))
          .limit(1);

        if (creditOrder) {
          confirmationData.creditsReceived = creditOrder.creditsAmount;
          confirmationData.orderStatus = creditOrder.status;
          
          const [pkg] = await db.select()
            .from(schema.creditPurchasePackages)
            .where(eq(schema.creditPurchasePackages.id, creditOrder.packageId))
            .limit(1);
          
          if (pkg) {
            confirmationData.packageName = pkg.name;
          }
        }

        const [userBalance] = await db.select({ lpCreditBalance: schema.users.lpCreditBalance })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);
        
        if (userBalance) {
          confirmationData.newBalance = userBalance.lpCreditBalance ?? 0;
        }
      } else if (intent.intentType === 'course') {
        const [course] = await db.select({
          id: schema.courses.id,
          title: schema.courses.title,
        })
          .from(schema.courses)
          .where(eq(schema.courses.id, intent.intentId))
          .limit(1);

        if (course) {
          confirmationData.courseName = course.title;
          confirmationData.courseId = course.id;
        }
      }

      res.json(confirmationData);
    } catch (error) {
      console.error('Error getting purchase confirmation:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== PAYMENT INTENT CONFIRMATION (BY INTENT ID) ====================
  
  app.get('/api/payment-intents/:intentId/confirmation', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { intentId } = req.params;
      const userId = req.session.userId!;

      if (!intentId) {
        return res.status(400).json({ error: 'Intent ID is required' });
      }

      const [intent] = await db.select()
        .from(schema.paymentIntents)
        .where(eq(schema.paymentIntents.id, intentId))
        .limit(1);

      if (!intent) {
        return res.status(404).json({ 
          error: 'Payment not found',
          status: 'not_found'
        });
      }

      if (intent.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const confirmationData: any = {
        intentId: intent.id,
        checkoutId: intent.checkoutId,
        intentType: intent.intentType,
        status: intent.status,
        amount: intent.originalAmount || intent.amount,
        currency: intent.originalCurrency || intent.currency,
        createdAt: intent.createdAt,
      };

      if (intent.intentType === 'credits') {
        const [creditOrder] = await db.select()
          .from(schema.creditOrders)
          .where(eq(schema.creditOrders.paymentIntentId, intent.id))
          .limit(1);

        if (creditOrder) {
          confirmationData.creditsReceived = creditOrder.creditsAmount;
          confirmationData.orderStatus = creditOrder.status;
          
          const [pkg] = await db.select()
            .from(schema.creditPurchasePackages)
            .where(eq(schema.creditPurchasePackages.id, creditOrder.packageId))
            .limit(1);
          
          if (pkg) {
            confirmationData.packageName = pkg.name;
          }
        }

        const [userBalance] = await db.select({ lpCreditBalance: schema.users.lpCreditBalance })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);
        
        if (userBalance) {
          confirmationData.newBalance = userBalance.lpCreditBalance ?? 0;
        }
      } else if (intent.intentType === 'course') {
        const [course] = await db.select({
          id: schema.courses.id,
          title: schema.courses.title,
        })
          .from(schema.courses)
          .where(eq(schema.courses.id, intent.intentId))
          .limit(1);

        if (course) {
          confirmationData.courseName = course.title;
          confirmationData.courseId = course.id;
        }

        const [purchase] = await db.select()
          .from(schema.coursePurchases)
          .where(and(
            eq(schema.coursePurchases.userId, userId),
            eq(schema.coursePurchases.courseId, intent.intentId)
          ))
          .limit(1);

        confirmationData.enrolled = !!purchase && purchase.status === 'completed';
      } else if (intent.intentType === 'subscription') {
        const [subscription] = await db.select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.targetId, userId))
          .orderBy(desc(schema.subscriptions.createdAt))
          .limit(1);

        if (subscription) {
          confirmationData.subscriptionStatus = subscription.status;
          confirmationData.planName = 'Learner Subscription';
        }
      } else if (intent.intentType === 'license') {
        const [license] = await db.select()
          .from(schema.userLicenses)
          .where(eq(schema.userLicenses.userId, userId))
          .orderBy(desc(schema.userLicenses.createdAt))
          .limit(1);

        if (license) {
          confirmationData.licenseTier = license.tier;
          confirmationData.licenseStatus = license.status;
        }
      }

      confirmationData.fulfilled = (intent.status as string) === 'succeeded' || (intent.status as string) === 'fulfilled';
      if (intent.intentType === 'credits' && confirmationData.orderStatus) {
        confirmationData.fulfilled = confirmationData.orderStatus === 'succeeded' || confirmationData.orderStatus === 'fulfilled';
      }

      console.log(`[PurchaseConfirmation] Returning confirmation for intentId ${intentId}:`, {
        intentType: intent.intentType,
        status: intent.status,
        fulfilled: confirmationData.fulfilled
      });

      res.json(confirmationData);
    } catch (error) {
      console.error('[PurchaseConfirmation] Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== SUBSCRIPTION CANCELLATION ====================
  
  app.post('/api/subscriptions/:subscriptionId/cancel', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { subscriptionId } = req.params;
      const { reason, cancelImmediately = false } = req.body;

      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const requestWithOrg = req as RequestWithOrgContext;
      const isOrgAdmin = requestWithOrg.orgContext?.organizationId && subscription.targetId === requestWithOrg.orgContext.organizationId;
      const isSubscriptionOwner = subscription.targetType === 'user' && subscription.targetId === userId;

      if (!isSubscriptionOwner && !isOrgAdmin) {
        return res.status(403).json({ error: 'You do not have permission to cancel this subscription' });
      }

      const { SubscriptionService } = await import('../services/subscriptionService');

      if (cancelImmediately) {
        await SubscriptionService.cancelSubscription(subscriptionId, true, reason, userId, 'user');
        res.json({ success: true, message: 'Subscription cancelled immediately' });
      } else {
        const result = await SubscriptionService.requestCancellationAtPeriodEnd(
          subscriptionId,
          reason,
          userId,
          'user'
        );

        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }

        res.json({ 
          success: true, 
          message: 'Subscription will be cancelled at period end',
          effectiveDate: result.effectiveDate 
        });
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/subscriptions/:subscriptionId/undo-cancel', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { subscriptionId } = req.params;

      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const requestWithOrg = req as RequestWithOrgContext;
      const isOrgAdmin = requestWithOrg.orgContext?.organizationId && subscription.targetId === requestWithOrg.orgContext.organizationId;
      const isSubscriptionOwner = subscription.targetType === 'user' && subscription.targetId === userId;

      if (!isSubscriptionOwner && !isOrgAdmin) {
        return res.status(403).json({ error: 'You do not have permission to modify this subscription' });
      }

      const { SubscriptionService } = await import('../services/subscriptionService');

      const result = await SubscriptionService.undoCancellation(subscriptionId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: 'Subscription reactivated successfully' });
    } catch (error) {
      console.error('Error undoing cancellation:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/subscriptions/:subscriptionId/cancellation-status', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { subscriptionId } = req.params;

      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const requestWithOrg = req as RequestWithOrgContext;
      const isOrgAdmin = requestWithOrg.orgContext?.organizationId && subscription.targetId === requestWithOrg.orgContext.organizationId;
      const isSubscriptionOwner = subscription.targetType === 'user' && subscription.targetId === userId;

      if (!isSubscriptionOwner && !isOrgAdmin) {
        return res.status(403).json({ error: 'You do not have permission to view this subscription' });
      }

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelRequestedAt: subscription.cancelRequestedAt,
        cancelReason: subscription.cancelReason,
        currentPeriodEnd: subscription.currentPeriodEnd,
        reactivationEligible: subscription.reactivationEligible,
      });
    } catch (error) {
      console.error('Error getting cancellation status:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== SUBSCRIPTION MANAGEMENT ====================
  
  app.post('/api/subscriptions', isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const validatedData = createSubscriptionSchema.parse(req.body);

      if (validatedData.targetType === 'organization') {
        const canAccess = await canAccessOrganization(userId, validatedData.targetId);
        if (!canAccess) {
          return res.status(403).json({ error: "Access denied: You cannot create subscriptions for this organization" });
        }
      } else if (validatedData.targetType === 'user') {
        const user = await storage.getUser(userId);
        const isSuperAdminUser = user?.isSuperAdmin === true;
        if (validatedData.targetId !== userId && !isSuperAdminUser) {
          return res.status(403).json({ error: "Access denied: You can only create subscriptions for yourself" });
        }
      }

      const [plan] = await db
        .select()
        .from(schema.elearningSubscriptionPlans)
        .where(eq(schema.elearningSubscriptionPlans.id, validatedData.planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "Subscription plan not found" });
      }

      if (!plan.isActive) {
        return res.status(400).json({ error: "This subscription plan is no longer available" });
      }

      const existingSubscription = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.targetType, validatedData.targetType),
            eq(schema.subscriptions.targetId, validatedData.targetId),
            or(
              eq(schema.subscriptions.status, 'active'),
              eq(schema.subscriptions.status, 'past_due')
            )
          )
        )
        .limit(1);

      if (existingSubscription.length > 0) {
        return res.status(409).json({ error: "An active subscription already exists for this target" });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.interval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      const [subscription] = await db
        .insert(schema.subscriptions)
        .values({
          planId: validatedData.planId,
          targetType: validatedData.targetType,
          targetId: validatedData.targetId,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingDate: periodEnd,
          autoRenew: validatedData.autoRenew,
        })
        .returning();

      await db.insert(schema.subscriptionEvents).values({
        subscriptionId: subscription.id,
        eventType: 'created',
        previousStatus: null,
        newStatus: 'active',
        initiatedBy: userId,
        metadata: { planId: plan.id, planName: plan.name },
      });

      console.log(`[Subscriptions] Created subscription ${subscription.id} for ${validatedData.targetType} ${validatedData.targetId}`);

      res.status(201).json({ subscription });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('[Subscriptions] Create error:', error);
      return sendError(res, 500, "Failed to create subscription", ErrorCode.DATABASE_ERROR);
    }
  });

  app.get('/api/subscriptions/:id', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const subscriptionId = req.params.id;

      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      if (subscription.targetType === 'organization') {
        const canAccess = await canAccessOrganization(userId, subscription.targetId);
        if (!canAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (subscription.targetType === 'user') {
        const user = await storage.getUser(userId);
        const isSuperAdminUser = user?.isSuperAdmin === true;
        if (subscription.targetId !== userId && !isSuperAdminUser) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const [plan] = await db
        .select()
        .from(schema.elearningSubscriptionPlans)
        .where(eq(schema.elearningSubscriptionPlans.id, subscription.planId))
        .limit(1);

      res.json({ subscription, plan });
    } catch (error: any) {
      console.error('[Subscriptions] Get error:', error);
      return sendError(res, 500, "Failed to fetch subscription", ErrorCode.DATABASE_ERROR);
    }
  });

  app.get('/api/subscriptions', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { targetType } = req.query;

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      let targetId: string;

      if (targetType === 'organization') {
        if (!effectiveOrg.organizationId) {
          return res.status(403).json({ error: 'Organization context required' });
        }
        targetId = effectiveOrg.organizationId;
      } else if (targetType === 'user') {
        targetId = userId;
      } else {
        return res.status(400).json({ error: "targetType must be 'organization' or 'user'" });
      }

      const subscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.targetType, targetType as any),
            eq(schema.subscriptions.targetId, targetId as string)
          )
        )
        .orderBy(desc(schema.subscriptions.createdAt));

      res.json({ subscriptions });
    } catch (error: any) {
      console.error('[Subscriptions] List error:', error);
      return sendError(res, 500, "Failed to fetch subscriptions", ErrorCode.DATABASE_ERROR);
    }
  });

  app.patch('/api/subscriptions/:id', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const subscriptionId = req.params.id;
      const validatedData = updateSubscriptionSchema.parse(req.body);

      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      
      if (subscription.targetType === 'organization') {
        if (!effectiveOrg.organizationId || effectiveOrg.organizationId !== subscription.targetId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (subscription.targetType === 'user') {
        const isSuperAdminUser = req.session.context?.effectiveRole === 'SuperAdmin';
        if (subscription.targetId !== userId && !isSuperAdminUser) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const [updated] = await db
        .update(schema.subscriptions)
        .set({
          autoRenew: validatedData.autoRenew ?? subscription.autoRenew,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, subscriptionId))
        .returning();

      console.log(`[Subscriptions] Updated subscription ${subscriptionId}`);

      res.json({ subscription: updated });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('[Subscriptions] Update error:', error);
      return sendError(res, 500, "Failed to update subscription", ErrorCode.DATABASE_ERROR);
    }
  });

  app.post('/api/subscription-plans/:planId/purchase', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    if (!isPaymentGatewayEnabled()) {
      return res.status(503).json({ 
        error: "Payment gateway disabled",
        message: "Credit purchases are not available on this platform. Credits are managed by your administrator."
      });
    }
    const userId = req.session.userId!;
    const { planId } = req.params;
    const { targetType, targetId, lockedRate, forceYocoMode, purchaseTarget } = req.body;
    
    const logContext = `[Subscription Purchase] userId=${userId} planId=${planId} targetType=${targetType} targetId=${targetId}`;
    
    try {
      console.log(`${logContext} - Starting subscription purchase flow`);

      if (!targetType || !targetId) {
        console.warn(`${logContext} - Missing required fields: targetType=${!!targetType}, targetId=${!!targetId}`);
        return res.status(400).json({ error: "Please provide both target type and target ID to proceed with purchase" });
      }

      if (targetType !== 'organization' && targetType !== 'user') {
        console.warn(`${logContext} - Invalid targetType: ${targetType}`);
        return res.status(400).json({ error: "Invalid target type. Must be 'organization' or 'user'" });
      }

      if (targetType === 'organization') {
        const canAccess = await canAccessOrganization(userId, targetId);
        if (!canAccess) {
          console.warn(`${logContext} - Access denied: user cannot access organization`);
          return res.status(403).json({ error: "Access denied: You don't have permission to purchase subscriptions for this organization" });
        }
      } else if (targetType === 'user' && targetId !== userId) {
        console.warn(`${logContext} - Access denied: user attempted to purchase for another user`);
        return res.status(403).json({ error: "Access denied: You can only purchase subscriptions for yourself" });
      }

      if (targetType === 'organization') {
        const effectiveOrgId = req.session.context?.impersonatedOrganization?.orgId || targetId;
        const org = await storage.getOrganization(effectiveOrgId);
        if (org?.isDemo === true) {
          console.log(`${logContext} - Blocked: demo organization cannot create subscriptions`);
          return res.status(400).json({ error: "Demo organizations cannot purchase subscriptions. Please create a regular organization to subscribe." });
        }
      }

      let plan: any;
      
      if (planId === 'learner-monthly-plan' || planId === 'elearning-learner-monthly-plan') {
        if (targetType !== 'user') {
          console.warn(`${logContext} - Learner plan requested for non-user target`);
          return res.status(400).json({ error: "Learner plans can only be purchased for individual users, not organizations" });
        }
        
        const [pricing] = await db
          .select()
          .from(schema.platformPricing)
          .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
          .limit(1);
        
        if (!pricing) {
          console.error(`${logContext} - Platform pricing not configured in database`);
          return res.status(500).json({ error: "Subscription pricing is not configured. Please contact support." });
        }
        
        const isElearning = planId === 'elearning-learner-monthly-plan';
        const price = isElearning ? pricing.elearningLearnerMonthlyCost : pricing.learnerMonthlyCost;
        
        if (!price) {
          console.error(`${logContext} - Learner price not set: isElearning=${isElearning}`);
          return res.status(500).json({ error: `${isElearning ? 'E-Learning learner' : 'Learner'} subscription pricing is not configured. Please contact support.` });
        }
        
        plan = {
          id: planId,
          name: isElearning ? 'E-Learning Learner Monthly' : 'Learner Monthly',
          pricePerTeacher: price,
          currency: pricing.currency || 'ZAR',
          interval: 'monthly',
          isActive: true,
        };
        console.log(`${logContext} - Using learner plan: ${plan.name} at ${price} ${plan.currency}`);
      } else {
        // First try subscriptionPlans table
        const [dbPlan] = await db
          .select()
          .from(schema.subscriptionPlans)
          .where(eq(schema.subscriptionPlans.id, planId))
          .limit(1);

        if (dbPlan) {
          if (!dbPlan.isActive) {
            console.warn(`${logContext} - Plan is inactive: ${dbPlan.name}`);
            return res.status(400).json({ error: `The "${dbPlan.name}" plan is no longer available. Please select a different plan.` });
          }
          plan = dbPlan;
          console.log(`${logContext} - Using subscription plan: ${plan.name}`);
        } else {
          // Fallback: check businessPackages table (for LP Credits packages)
          const [businessPkg] = await db
            .select()
            .from(schema.businessPackages)
            .where(eq(schema.businessPackages.id, planId))
            .limit(1);

          if (!businessPkg) {
            console.warn(`${logContext} - Plan not found in subscriptionPlans or businessPackages`);
            return res.status(404).json({ error: "The selected subscription plan was not found. It may have been removed." });
          }

          if (!businessPkg.isActive) {
            console.warn(`${logContext} - Business package is inactive: ${businessPkg.name}`);
            return res.status(400).json({ error: `The "${businessPkg.name}" package is no longer available. Please select a different package.` });
          }

          // Get the package price for the user's currency or default to ZAR
          const [packagePrice] = await db
            .select()
            .from(schema.businessPackagePrices)
            .where(eq(schema.businessPackagePrices.packageId, businessPkg.id))
            .limit(1);

          const price = packagePrice?.pricePerTeacher || "0";
          const currency = packagePrice?.currency || 'ZAR';

          // Convert businessPackage to subscription plan format
          plan = {
            id: businessPkg.id,
            name: businessPkg.name,
            tier: businessPkg.tier,
            pricePerTeacher: price,
            currency: currency,
            interval: 'monthly',
            isActive: businessPkg.isActive,
            monthlyCredits: businessPkg.monthlyCredits,
          };
          console.log(`${logContext} - Using business package: ${plan.name} at ${price} ${currency}`);
        }
      }

      const existingSubscription = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.targetType, targetType),
            eq(schema.subscriptions.targetId, targetId),
            or(
              eq(schema.subscriptions.status, 'active'),
              eq(schema.subscriptions.status, 'past_due')
            )
          )
        )
        .limit(1);

      if (existingSubscription.length > 0) {
        console.warn(`${logContext} - Existing active subscription found: ${existingSubscription[0].id} status=${existingSubscription[0].status}`);
        return res.status(409).json({ error: "You already have an active subscription. Please cancel your current subscription before purchasing a new one." });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.interval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      console.log(`${logContext} - Generating invoice for ${plan.pricePerTeacher} ${plan.currency}`);
      const invoice = await InvoiceService.generateLearnerPlanInvoice({
        userId: userId,
        planId: planId,
        planName: plan.name,
        planPrice: plan.pricePerTeacher,
        amountDue: plan.pricePerTeacher,
        currency: plan.currency,
        dueAt: now,
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
      });
      console.log(`${logContext} - Invoice generated: ${invoice.id}`);

      let validatedYocoMode: 'test' | 'live' | undefined;
      if (forceYocoMode) {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!user?.isSuperAdmin) {
          console.warn(`${logContext} - Non-SuperAdmin attempted to override payment mode`);
          return res.status(403).json({ error: "Only SuperAdmins can override payment mode" });
        }
        if (forceYocoMode !== 'test' && forceYocoMode !== 'live') {
          console.warn(`${logContext} - Invalid forceYocoMode value: ${forceYocoMode}`);
          return res.status(400).json({ error: "Invalid payment mode. Must be 'test' or 'live'" });
        }
        validatedYocoMode = forceYocoMode;
        console.log(`${logContext} - SuperAdmin forcing payment mode: ${validatedYocoMode}`);
      }

      const baseUrl = getBaseUrl();
      console.log(`${logContext} - Creating payment checkout via PaymentOrchestratorService`);
      const checkout = await PaymentOrchestratorService.createSubscriptionCheckout({
        userId: userId,
        subscriptionId: null,
        invoiceId: invoice.id,
        amount: invoice.amountDue,
        currency: invoice.currency,
        successUrl: `${baseUrl}/subscriptions?payment=success&intentId={intentId}`,
        cancelUrl: `${baseUrl}/subscriptions?payment=cancelled&intentId={intentId}`,
        failureUrl: `${baseUrl}/subscriptions?payment=failed&intentId={intentId}`,
        lockedRate,
        forceYocoMode: validatedYocoMode,
      });

      if (!checkout.success || !checkout.checkoutUrl) {
        console.error(`${logContext} - Payment checkout creation failed: ${checkout.error || 'No checkout URL returned'}`);
        await db.delete(schema.subscriptionInvoices).where(eq(schema.subscriptionInvoices.id, invoice.id));
        const errorMessage = checkout.error || "Failed to create payment checkout. Please try again or contact support.";
        return res.status(500).json({ error: errorMessage });
      }

      console.log(`${logContext} - SUCCESS: Checkout created for plan ${plan.id}, invoice ${invoice.id}`);

      res.json({
        invoice,
        checkoutUrl: checkout.checkoutUrl,
        message: "Redirect user to checkout URL to complete payment"
      });
    } catch (error: any) {
      console.error(`${logContext} - Unexpected error:`, error.message || error);
      console.error(`${logContext} - Stack trace:`, error.stack);
      
      // Provide a more specific error message based on error type
      let userMessage = "Failed to initiate subscription purchase. Please try again.";
      if (error.message?.includes('network') || error.message?.includes('timeout')) {
        userMessage = "Connection issue while processing your purchase. Please check your internet and try again.";
      } else if (error.message?.includes('database') || error.message?.includes('connection')) {
        userMessage = "A temporary database issue occurred. Please try again in a few moments.";
      }
      
      return res.status(500).json({ error: userMessage });
    }
  });

  app.delete('/api/subscriptions/:id/cancel', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const subscriptionId = req.params.id;
      const { reason } = req.body;

      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      
      if (subscription.targetType === 'organization') {
        if (!effectiveOrg.organizationId || effectiveOrg.organizationId !== subscription.targetId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (subscription.targetType === 'user') {
        const isSuperAdminUser = req.session.context?.effectiveRole === 'SuperAdmin';
        if (subscription.targetId !== userId && !isSuperAdminUser) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (subscription.status === 'cancelled') {
        return res.status(400).json({ error: "Subscription is already cancelled" });
      }

      const previousStatus = subscription.status;
      const [updated] = await db
        .update(schema.subscriptions)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, subscriptionId))
        .returning();

      await db.insert(schema.subscriptionEvents).values({
        subscriptionId: subscription.id,
        eventType: 'cancelled',
        previousStatus,
        newStatus: 'cancelled',
        initiatedBy: userId,
        metadata: reason ? { reason } : undefined,
      });

      console.log(`[Subscriptions] Cancelled subscription ${subscriptionId}`);

      res.json({ subscription: updated });
    } catch (error: any) {
      console.error('[Subscriptions] Cancel error:', error);
      return sendError(res, 500, "Failed to cancel subscription", ErrorCode.DATABASE_ERROR);
    }
  });

  // ==================== INVOICES ====================
  
  app.get('/api/invoices', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { subscriptionId, status, limit = '50', offset = '0' } = req.query;
      
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const isSuperAdminUser = req.session.context?.effectiveRole === 'SuperAdmin' && !effectiveOrg.isImpersonation;

      const conditions = [];

      if (subscriptionId) {
        const [subscription] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.id, subscriptionId as string))
          .limit(1);

        if (!subscription) {
          return res.status(404).json({ error: "Subscription not found" });
        }

        if (subscription.targetType === 'organization') {
          if (!isSuperAdminUser && (!effectiveOrg.organizationId || effectiveOrg.organizationId !== subscription.targetId)) {
            return res.status(403).json({ error: "Access denied" });
          }
        } else if (subscription.targetType === 'user') {
          if (subscription.targetId !== userId && !isSuperAdminUser) {
            return res.status(403).json({ error: "Access denied" });
          }
        }

        conditions.push(eq(schema.subscriptionInvoices.subscriptionId, subscriptionId as string));
      } else {
        if (!isSuperAdminUser) {
          if (!effectiveOrg.organizationId) {
            return res.status(403).json({ error: 'Organization context required' });
          }
          
          // Check user role for access control
          const userRoles = await storage.getUserRoles(userId, effectiveOrg.organizationId);
          const isOrgAdmin = userRoles.some(r => r.role === 'org_admin');
          const isTeacher = userRoles.some(r => r.role === 'teacher' || r.role === 'instructor');

          // Build subscription query conditions based on user role
          let subscriptionConditions;
          
          if (isTeacher && !isOrgAdmin) {
            // Teachers/Instructors: Only show their own user-targeted subscriptions
            subscriptionConditions = and(
              eq(schema.subscriptions.targetType, 'user'),
              eq(schema.subscriptions.targetId, userId)
            );
          } else if (isOrgAdmin) {
            // OrgAdmins: Show org-targeted subscriptions for their organization
            subscriptionConditions = and(
              eq(schema.subscriptions.targetType, 'organization'),
              eq(schema.subscriptions.targetId, effectiveOrg.organizationId)
            );
          } else {
            // Learners and other users: No access to subscription/credit invoices
            // but we'll still check for course purchases below
            // Set flag to skip subscription invoice queries
            conditions.push(eq(schema.subscriptionInvoices.id, 'learner-no-subscription-access'));
          }
          
          const userSubscriptions = await db
            .select({ id: schema.subscriptions.id })
            .from(schema.subscriptions)
            .where(subscriptionConditions);

          const subscriptionIds = userSubscriptions.map(s => s.id);
          // Note: Don't return early if no subscriptions - still need to check credit orders below
          if (subscriptionIds.length > 0) {
            conditions.push(inArray(schema.subscriptionInvoices.subscriptionId, subscriptionIds));
          } else {
            // No subscriptions found - skip subscription invoice query by adding impossible condition
            conditions.push(eq(schema.subscriptionInvoices.id, 'no-match-placeholder'));
          }
        }
      }

      if (status) {
        conditions.push(eq(schema.subscriptionInvoices.status, status as any));
      }

      const queryCondition = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Only query subscription invoices if we have valid conditions (non-superadmin must have subscription filter)
      let invoices: any[] = [];
      let subscriptionInvoiceTotal = 0;
      
      if (queryCondition || isSuperAdminUser) {
        invoices = await db
          .select()
          .from(schema.subscriptionInvoices)
          .where(queryCondition)
          .orderBy(desc(schema.subscriptionInvoices.createdAt))
          .limit(parseInt(limit as string))
          .offset(parseInt(offset as string));

        const countResult = await db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(schema.subscriptionInvoices)
          .where(queryCondition);

        subscriptionInvoiceTotal = countResult[0]?.count || 0;
      }

      // Define unified invoice type for subscription, credit, and course purchase receipts
      interface UnifiedInvoice {
        id: string;
        type: 'subscription' | 'credit_purchase' | 'course_purchase';
        invoiceNumber: string;
        amountDue: string;
        currency: 'ZAR' | 'USD' | 'EUR';
        originalAmount: string | null;
        originalCurrency: 'ZAR' | 'USD' | 'EUR' | null;
        exchangeRate: string | null;
        status: string;
        createdAt: Date | null;
        dueAt: Date | null;
        billingPeriodStart: Date | null;
        billingPeriodEnd: Date | null;
        pdfPath: string | null;
        subscriptionId: string | null;
        description: string | null;
        courseName?: string | null;
      }

      // Transform subscription invoices to unified format
      const formattedSubscriptionInvoices: UnifiedInvoice[] = invoices.map(inv => ({
        id: inv.id,
        type: 'subscription' as const,
        invoiceNumber: `INV-${inv.id.substring(0, 8).toUpperCase()}`,
        amountDue: inv.amountDue,
        currency: inv.currency,
        originalAmount: inv.originalAmount,
        originalCurrency: inv.originalCurrency,
        exchangeRate: inv.exchangeRate,
        status: inv.status,
        createdAt: inv.createdAt,
        dueAt: inv.dueAt,
        billingPeriodStart: inv.billingPeriodStart,
        billingPeriodEnd: inv.billingPeriodEnd,
        pdfPath: inv.pdfStoragePath,
        subscriptionId: inv.subscriptionId,
        description: null,
      }));

      // CREDIT ORDER RECEIPTS: Fetch credit purchase receipts if not filtering by subscriptionId
      let formattedCreditReceipts: UnifiedInvoice[] = [];
      let creditReceiptTotal = 0;
      
      // Skip credit orders if filtering by subscriptionId or if status filter excludes credit orders
      const skipCreditOrders = subscriptionId || status === 'overdue';
      
      if (!skipCreditOrders) {
        // Build credit order query based on role - RBAC enforcement
        const creditOrderConditions: any[] = [];
        let hasValidAccess = false;
        
        if (isSuperAdminUser) {
          // SuperAdmins can see all credit orders
          hasValidAccess = true;
        } else if (effectiveOrg.organizationId) {
          // Check user role for access control
          const userRoles = await storage.getUserRoles(userId, effectiveOrg.organizationId);
          const isOrgAdmin = userRoles.some(r => r.role === 'org_admin');
          const isTeacher = userRoles.some(r => r.role === 'teacher' || r.role === 'instructor');
          
          if (isTeacher && !isOrgAdmin) {
            // Teachers: Only show their own credit purchases
            creditOrderConditions.push(eq(schema.creditOrders.purchaserId, userId));
            hasValidAccess = true;
          } else if (isOrgAdmin) {
            // OrgAdmins: Show all org credit purchases
            creditOrderConditions.push(eq(schema.creditOrders.organizationId, effectiveOrg.organizationId));
            hasValidAccess = true;
          }
        }
        // If no valid access context, skip credit orders (RBAC safeguard)
        
        if (hasValidAccess) {
          // Determine status filter for credit orders
          // 'paid' maps to 'succeeded', 'pending' maps to 'pending', default shows 'succeeded' only
          const creditOrderStatus = status === 'pending' ? 'pending' : 'succeeded';
          creditOrderConditions.push(eq(schema.creditOrders.status, creditOrderStatus as any));
          
          const creditOrderQueryCondition = and(...creditOrderConditions);
        
          const creditOrders = await db
            .select()
            .from(schema.creditOrders)
            .where(creditOrderQueryCondition)
            .orderBy(desc(schema.creditOrders.createdAt))
            .limit(parseInt(limit as string))
            .offset(parseInt(offset as string));
          
          const creditCountResult = await db
            .select({ count: sql<number>`count(*)`.as('count') })
            .from(schema.creditOrders)
            .where(creditOrderQueryCondition);
          
          creditReceiptTotal = creditCountResult[0]?.count || 0;
          
          // Transform credit orders to unified invoice format
          formattedCreditReceipts = creditOrders.map((order): UnifiedInvoice => ({
            id: order.id,
            type: 'credit_purchase',
            invoiceNumber: `CR-${order.id.substring(0, 8).toUpperCase()}`,
            amountDue: order.amount,
            currency: order.currency,
            originalAmount: null,
            originalCurrency: null,
            exchangeRate: null,
            status: order.status === 'succeeded' ? 'paid' : order.status,
            createdAt: order.createdAt,
            dueAt: order.createdAt, // Credit purchases don't have due dates
            billingPeriodStart: order.createdAt,
            billingPeriodEnd: order.createdAt,
            pdfPath: order.receiptPdfPath,
            subscriptionId: null,
            description: `${order.creditsAmount} LP Credits`,
          }));
        }
      }

      // COURSE PURCHASES: Fetch course purchase receipts for all users (scoped to their own purchases)
      let formattedCoursePurchases: UnifiedInvoice[] = [];
      let coursePurchaseTotal = 0;
      
      // Skip course purchases if filtering by subscriptionId
      const skipCoursePurchases = !!subscriptionId;
      
      if (!skipCoursePurchases) {
        // All authenticated users can see their own course purchases
        const coursePurchaseConditions: any[] = [
          eq(schema.coursePurchases.userId, userId),
          eq(schema.coursePurchases.status, 'completed')
        ];
        
        const coursePurchaseQueryCondition = and(...coursePurchaseConditions);
        
        const coursePurchases = await db
          .select({
            purchase: schema.coursePurchases,
            course: schema.courses,
          })
          .from(schema.coursePurchases)
          .leftJoin(schema.courses, eq(schema.coursePurchases.courseId, schema.courses.id))
          .where(coursePurchaseQueryCondition)
          .orderBy(desc(schema.coursePurchases.purchasedAt))
          .limit(parseInt(limit as string))
          .offset(parseInt(offset as string));
        
        const coursePurchaseCountResult = await db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(schema.coursePurchases)
          .where(coursePurchaseQueryCondition);
        
        coursePurchaseTotal = coursePurchaseCountResult[0]?.count || 0;
        
        // Transform course purchases to unified invoice format
        formattedCoursePurchases = coursePurchases.map((row): UnifiedInvoice => ({
          id: row.purchase.id,
          type: 'course_purchase',
          invoiceNumber: `CP-${row.purchase.id.substring(0, 8).toUpperCase()}`,
          amountDue: row.purchase.purchasePrice,
          currency: row.purchase.purchaseCurrency as 'ZAR' | 'USD' | 'EUR',
          originalAmount: row.purchase.basePrice || null,
          originalCurrency: row.purchase.baseCurrency as 'ZAR' | 'USD' | 'EUR' | null,
          exchangeRate: row.purchase.exchangeRateUsed,
          status: 'paid', // Completed purchases are always paid
          createdAt: row.purchase.purchasedAt,
          dueAt: row.purchase.purchasedAt,
          billingPeriodStart: row.purchase.purchasedAt,
          billingPeriodEnd: row.purchase.purchasedAt,
          pdfPath: row.purchase.receiptPdfPath || null, // PDF receipt path from Object Storage
          subscriptionId: null,
          description: row.course?.title || 'Course Purchase',
          courseName: row.course?.title || null,
        }));
      }

      // Combine and sort by creation date (newest first)
      const allInvoices = [...formattedSubscriptionInvoices, ...formattedCreditReceipts, ...formattedCoursePurchases]
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

      const total = subscriptionInvoiceTotal + creditReceiptTotal + coursePurchaseTotal;

      // Return unified response with all invoice types and separate counts for pagination accuracy
      res.json({ 
        invoices: allInvoices, 
        total,
        // Additional metadata for more accurate pagination
        subscriptionInvoiceCount: subscriptionInvoiceTotal,
        creditReceiptCount: creditReceiptTotal,
        coursePurchaseCount: coursePurchaseTotal,
      });
    } catch (error: any) {
      console.error('[Invoices] List error:', error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.get('/api/credit-orders', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { limit = '50', offset = '0' } = req.query;

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;
      
      if (!organizationId) {
        return res.status(403).json({ error: 'Organization context required' });
      }

      const orgIds = [organizationId];

      const orders = await db
        .select()
        .from(schema.creditOrders)
        .where(inArray(schema.creditOrders.organizationId, orgIds))
        .orderBy(desc(schema.creditOrders.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      const countResult = await db
        .select({ count: sql<number>`count(*)`})
        .from(schema.creditOrders)
        .where(inArray(schema.creditOrders.organizationId, orgIds));

      const total = countResult[0]?.count || 0;

      res.json({ orders, total });
    } catch (error: any) {
      console.error('[CreditOrders] List error:', error);
      res.status(500).json({ error: "Failed to fetch credit orders" });
    }
  });

  // ==================== WEBHOOK EVENTS (ADMIN) ====================
  
  app.get('/api/webhooks/events', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { status, limit = '100', offset = '0' } = req.query;

      const conditions = [];

      if (status) {
        conditions.push(eq(schema.paymentIntents.status, status as any));
      }

      const events = await db
        .select()
        .from(schema.paymentIntents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.paymentIntents.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      const countResult = await db
        .select({ count: sql<number>`count(*)`})
        .from(schema.paymentIntents)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count || 0;

      res.json({ events, total });
    } catch (error: any) {
      console.error('[Webhooks] Events list error:', error);
      res.status(500).json({ error: "Failed to fetch webhook events" });
    }
  });

  // ==================== PDF DOWNLOADS ====================
  
  app.get('/api/invoices/:id/download', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const invoiceId = req.params.id;

      const hasAccess = await canAccessInvoicePDF(userId, invoiceId, req.session);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const pdfBuffer = await InvoiceService.getInvoicePDF(invoiceId);
      if (!pdfBuffer) {
        return res.status(404).json({ error: "Invoice PDF not found" });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId.substring(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[Invoices] Download error:', error);
      res.status(500).json({ error: "Failed to download invoice PDF" });
    }
  });

  app.get('/api/receipts/:id/download', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const receiptId = req.params.id;

      const hasAccess = await canAccessReceiptPDF(userId, receiptId, req.session);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const pdfBuffer = await InvoiceService.getReceiptPDF(receiptId);
      if (!pdfBuffer) {
        return res.status(404).json({ error: "Receipt PDF not found" });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${receiptId.substring(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[Receipts] Download error:', error);
      res.status(500).json({ error: "Failed to download receipt PDF" });
    }
  });

  // Course purchase receipt download endpoint
  app.get('/api/course-receipts/:id/download', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const purchaseId = req.params.id;

      const hasAccess = await canAccessCoursePurchaseReceiptPDF(userId, purchaseId, req.session);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const pdfBuffer = await InvoiceService.getCoursePurchaseReceiptPDF(purchaseId);
      if (!pdfBuffer) {
        return res.status(404).json({ error: "Course purchase receipt PDF not found" });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="course-receipt-${purchaseId.substring(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[CourseReceipts] Download error:', error);
      res.status(500).json({ error: "Failed to download course purchase receipt PDF" });
    }
  });

  console.log('[PaymentsRoutes] Registered all payment-related routes');
}
