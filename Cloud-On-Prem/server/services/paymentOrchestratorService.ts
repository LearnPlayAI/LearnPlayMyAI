// @ts-nocheck
import { db } from "../db";
import { paymentIntents, creditOrders, licensePayments, type InsertPaymentIntent, type InsertCreditOrder } from "@shared/schema";
import { PaymentService, type YocoMode } from "./paymentService";
import { CurrencyService } from "./currencyService";
import { eq, and, sql, desc } from "drizzle-orm";
import { addMonths } from "date-fns";
import { getFeatureFlags } from "../config/featureFlags";
import { SessionInvalidationService } from "./sessionInvalidationService";

/**
 * Payment Metadata Interface
 * Standardized metadata attached to all YOCO checkout sessions
 */
export interface PaymentMetadata {
  intentType: 'course' | 'credits' | 'subscription' | 'license';
  intentId: string;           // courseId, packageId, subscriptionId, or organizationId (for licenses)
  invoiceId?: string;         // For subscription billing
  organizationId?: string;    // For credit purchases (org wallet) or license purchases
  userId: string;             // Purchaser ID
  originalAmount: string;     // Pre-conversion amount (before ZAR conversion)
  originalCurrency: 'ZAR' | 'USD' | 'EUR';
  exchangeRate?: string;      // Exchange rate used for ZAR conversion (e.g., "18.5" for USD/ZAR)
  rateSource?: 'locked' | 'fresh'; // Whether a locked rate or fresh rate was used for conversion
  // License-specific metadata
  tier?: 'blue' | 'red' | 'gold';
  seatCount?: number;
  billingPeriodMonths?: number;
  // SuperAdmin test payment tracking (for revenue exclusion)
  yocoModeUsed?: YocoMode;
  testPayment?: boolean;
  superAdminTest?: boolean;
}

/**
 * Checkout Creation Result
 */
export interface CheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  paymentIntentId?: string;
  checkoutId?: string;
  error?: string;
}

/**
 * Payment Orchestrator Service
 * 
 * Centralized payment handling that:
 * - Creates typed payment intents
 * - Stamps YOCO checkouts with metadata
 * - Provides unified interface for all payment types (courses, credits, subscriptions)
 * - Enables idempotent fulfillment tracking
 * 
 * URL Placeholder Support:
 * - URLs can contain {intentId} placeholder which gets replaced with the actual paymentIntent.id
 * - This allows frontend to poll payment status by intentId after redirect
 * - IMPORTANT: YOCO does NOT support {id} or any other placeholders natively
 */
export class PaymentOrchestratorService {
  
  /**
   * Replace URL placeholders with actual values
   * Supports {intentId} placeholder for payment intent tracking
   */
  private static replaceUrlPlaceholders(url: string, intentId: string): string {
    return url.replace(/\{intentId\}/g, intentId);
  }

  /**
   * Convert amount to ZAR for YOCO payment processing
   * YOCO only accepts ZAR, so all non-ZAR currencies must be converted
   * Returns the converted amount, original values, exchange rate used, and rate source
   * 
   * Supports optional lockedRate for using a previously locked exchange rate:
   * - If lockedRate is valid and < 30 minutes old, uses it for conversion
   * - If lockedRate is missing/invalid/expired, fetches fresh rate from CurrencyService
   */
  private static async convertToZAR(
    amount: string,
    currency: 'ZAR' | 'USD' | 'EUR',
    lockedRate?: { exchangeRate: string; rateLockedAt: string; originalCurrency: string }
  ): Promise<{
    zarAmount: string;
    originalAmount: string;
    originalCurrency: 'ZAR' | 'USD' | 'EUR';
    exchangeRate: string;
    rateSource: 'locked' | 'fresh';
  }> {
    if (currency === 'ZAR') {
      return {
        zarAmount: amount,
        originalAmount: amount,
        originalCurrency: 'ZAR',
        exchangeRate: '1.00000000',
        rateSource: 'fresh',
      };
    }

    // Check if lockedRate is valid (< 30 minutes old)
    const RATE_MAX_AGE_MINUTES = 30;
    if (lockedRate?.exchangeRate && lockedRate?.rateLockedAt && lockedRate?.originalCurrency === currency) {
      const lockedAt = new Date(lockedRate.rateLockedAt);
      const ageMinutes = (Date.now() - lockedAt.getTime()) / (1000 * 60);
      
      if (ageMinutes <= RATE_MAX_AGE_MINUTES) {
        const lockedRateNum = parseFloat(lockedRate.exchangeRate);
        if (lockedRateNum > 0 && !isNaN(lockedRateNum)) {
          const zarAmount = (parseFloat(amount) * lockedRateNum).toFixed(4);
          console.log(`[PaymentOrchestrator] Using locked rate: ${amount} ${currency} -> ${zarAmount} ZAR (rate: ${lockedRate.exchangeRate}, locked ${ageMinutes.toFixed(1)} min ago)`);
          return {
            zarAmount,
            originalAmount: amount,
            originalCurrency: currency,
            exchangeRate: lockedRate.exchangeRate,
            rateSource: 'locked',
          };
        }
      } else {
        console.log(`[PaymentOrchestrator] Locked rate expired (${ageMinutes.toFixed(1)} min old). Using fresh rate.`);
      }
    }

    // Fall back to fresh rate
    console.log(`[PaymentOrchestrator] Converting ${amount} ${currency} to ZAR (fresh rate)`);
    const conversion = await CurrencyService.convertAmount(amount, currency, 'ZAR');
    
    if (!conversion || !conversion.convertedAmount) {
      throw new Error(`Failed to convert ${currency} to ZAR - exchange rate not available`);
    }

    console.log(`[PaymentOrchestrator] Converted: ${amount} ${currency} -> ${conversion.convertedAmount} ZAR (rate: ${conversion.rate})`);

    return {
      zarAmount: conversion.convertedAmount,
      originalAmount: amount,
      originalCurrency: currency,
      exchangeRate: conversion.rate,
      rateSource: 'fresh',
    };
  }
  
  /**
   * Create a payment intent and YOCO checkout for course purchase
   * Automatically converts non-ZAR currencies to ZAR for YOCO processing
   * Supports optional lockedRate for using a previously locked exchange rate
   */
  static async createCourseCheckout(params: {
    userId: string;
    courseId: string;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    successUrl: string;
    cancelUrl: string;
    failureUrl: string;
    lockedRate?: { exchangeRate: string; rateLockedAt: string; originalCurrency: string };
    forceYocoMode?: YocoMode; // SuperAdmin override for payment mode
  }): Promise<CheckoutResult> {
    try {
      // Convert to ZAR if needed - YOCO only accepts ZAR
      // Pass lockedRate if provided for rate locking support
      const conversion = await this.convertToZAR(params.amount, params.currency, params.lockedRate);
      
      // Determine if this is a SuperAdmin test payment
      const isSuperAdminTestPayment = params.forceYocoMode === 'test';
      
      const metadata: PaymentMetadata = {
        intentType: 'course',
        intentId: params.courseId,
        userId: params.userId,
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        exchangeRate: conversion.exchangeRate,
        rateSource: conversion.rateSource,
        // SuperAdmin test payment tracking
        ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
        ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
      };

      // Create payment intent record with ZAR amount
      const [paymentIntent] = await db.insert(paymentIntents).values({
        intentType: 'course',
        intentId: params.courseId,
        userId: params.userId,
        amount: conversion.zarAmount,  // Always ZAR for YOCO
        currency: 'ZAR',               // Always ZAR for YOCO
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        status: 'pending',
        metadata: metadata as any,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        failureUrl: params.failureUrl,
        checkoutId: null, // Will be updated after YOCO checkout creation
      }).returning();

      // Replace URL placeholders with actual intentId
      // IMPORTANT: YOCO does NOT support placeholder substitution - we must do it ourselves
      const resolvedSuccessUrl = this.replaceUrlPlaceholders(params.successUrl, paymentIntent.id);
      const resolvedCancelUrl = this.replaceUrlPlaceholders(params.cancelUrl, paymentIntent.id);
      const resolvedFailureUrl = this.replaceUrlPlaceholders(params.failureUrl, paymentIntent.id);

      // Create YOCO checkout with ZAR amount
      const checkout = await PaymentService.createYocoCheckout({
        amount: conversion.zarAmount,
        currency: 'ZAR',
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
        failureUrl: resolvedFailureUrl,
        metadata: metadata as any,
        forceYocoMode: params.forceYocoMode, // Pass SuperAdmin mode override
      });

      if (!checkout.checkoutId || !checkout.redirectUrl) {
        throw new Error('Failed to create YOCO checkout');
      }

      // Update payment intent with checkout ID
      await db.update(paymentIntents)
        .set({
          checkoutId: checkout.checkoutId,
          checkoutUrl: checkout.redirectUrl,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, paymentIntent.id));

      return {
        success: true,
        checkoutUrl: checkout.redirectUrl,
        paymentIntentId: paymentIntent.id,
        checkoutId: checkout.checkoutId,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] Course checkout creation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to create course checkout',
      };
    }
  }

  /**
   * Create a payment intent and YOCO checkout for credit package purchase
   * Automatically converts non-ZAR currencies to ZAR for YOCO processing
   * Supports optional lockedRate for using a previously locked exchange rate
   */
  static async createCreditCheckout(params: {
    userId: string;
    organizationId?: string;  // Optional - for org wallet credits
    packageId: string;
    creditsAmount: number;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    successUrl: string;
    cancelUrl: string;
    failureUrl: string;
    lockedRate?: { exchangeRate: string; rateLockedAt: string; originalCurrency: string };
    forceYocoMode?: YocoMode; // SuperAdmin override for payment mode
    purchaseTarget?: 'personal' | 'organization'; // Where credits should be added after payment
  }): Promise<CheckoutResult> {
    try {
      // Convert to ZAR if needed - YOCO only accepts ZAR
      // Pass lockedRate if provided for rate locking support
      const conversion = await this.convertToZAR(params.amount, params.currency, params.lockedRate);
      
      // Determine if this is a SuperAdmin test payment
      const isSuperAdminTestPayment = params.forceYocoMode === 'test';
      
      const metadata: PaymentMetadata = {
        intentType: 'credits',
        intentId: params.packageId,
        organizationId: params.organizationId,
        userId: params.userId,
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        exchangeRate: conversion.exchangeRate,
        rateSource: conversion.rateSource,
        // SuperAdmin test payment tracking
        ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
        ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
      };

      // Create payment intent record with ZAR amount
      const [paymentIntent] = await db.insert(paymentIntents).values({
        intentType: 'credits',
        intentId: params.packageId,
        organizationId: params.organizationId,
        userId: params.userId,
        amount: conversion.zarAmount,  // Always ZAR for YOCO
        currency: 'ZAR',               // Always ZAR for YOCO
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        status: 'pending',
        metadata: metadata as any,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        failureUrl: params.failureUrl,
        checkoutId: null, // Will be updated after YOCO checkout creation
      }).returning();

      // Create credit order record (pending) with ZAR amount
      const [creditOrder] = await db.insert(creditOrders).values({
        packageId: params.packageId,
        purchaserId: params.userId,
        organizationId: params.organizationId,
        paymentIntentId: paymentIntent.id,
        creditsAmount: params.creditsAmount,
        amount: conversion.zarAmount,  // Store ZAR for consistency
        currency: 'ZAR',               // Store ZAR for consistency
        status: 'pending',
        purchaseTarget: params.purchaseTarget === 'organization' ? 'organization' : 'user', // Default to personal if not specified
        metadata: {
          packageId: params.packageId,
          creditsAmount: params.creditsAmount,
          purchasedAt: new Date().toISOString(),
          originalAmount: conversion.originalAmount,
          originalCurrency: conversion.originalCurrency,
          exchangeRate: conversion.exchangeRate,
          purchaseTarget: params.purchaseTarget === 'organization' ? 'organization' : 'user',
          // SuperAdmin test payment tracking
          ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
          ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
        } as any,
        checkoutId: null, // Will be updated
      }).returning();

      // Replace URL placeholders with actual intentId
      // IMPORTANT: YOCO does NOT support placeholder substitution - we must do it ourselves
      const resolvedSuccessUrl = this.replaceUrlPlaceholders(params.successUrl, paymentIntent.id);
      const resolvedCancelUrl = this.replaceUrlPlaceholders(params.cancelUrl, paymentIntent.id);
      const resolvedFailureUrl = this.replaceUrlPlaceholders(params.failureUrl, paymentIntent.id);

      // Create YOCO checkout with ZAR amount
      const checkout = await PaymentService.createYocoCheckout({
        amount: conversion.zarAmount,
        currency: 'ZAR',
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
        failureUrl: resolvedFailureUrl,
        metadata: metadata as any,
        forceYocoMode: params.forceYocoMode, // Pass SuperAdmin mode override
      });

      if (!checkout.checkoutId || !checkout.redirectUrl) {
        throw new Error('Failed to create YOCO checkout');
      }

      // Update payment intent and credit order with checkout ID
      await Promise.all([
        db.update(paymentIntents)
          .set({
            checkoutId: checkout.checkoutId,
            checkoutUrl: checkout.redirectUrl,
            updatedAt: new Date(),
          })
          .where(eq(paymentIntents.id, paymentIntent.id)),
        
        db.update(creditOrders)
          .set({
            checkoutId: checkout.checkoutId,
            updatedAt: new Date(),
          })
          .where(eq(creditOrders.id, creditOrder.id)),
      ]);

      return {
        success: true,
        checkoutUrl: checkout.redirectUrl,
        paymentIntentId: paymentIntent.id,
        checkoutId: checkout.checkoutId,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] Credit checkout creation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to create credit checkout',
      };
    }
  }

  /**
   * Create a payment intent and YOCO checkout for subscription billing
   * Automatically converts non-ZAR currencies to ZAR for YOCO processing
   * Supports optional lockedRate for using a previously locked exchange rate
   */
  static async createSubscriptionCheckout(params: {
    userId: string;
    subscriptionId: string | null;
    invoiceId: string;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    successUrl: string;
    cancelUrl: string;
    failureUrl: string;
    lockedRate?: { exchangeRate: string; rateLockedAt: string; originalCurrency: string };
    forceYocoMode?: YocoMode; // SuperAdmin override for payment mode
  }): Promise<CheckoutResult> {
    try {
      // Convert to ZAR if needed - YOCO only accepts ZAR
      // Pass lockedRate if provided for rate locking support
      const conversion = await this.convertToZAR(params.amount, params.currency, params.lockedRate);
      
      // For learner subscriptions, use invoiceId as intentId since subscriptionId is null until webhook
      const intentId = params.subscriptionId || params.invoiceId;
      
      // Determine if this is a SuperAdmin test payment
      const isSuperAdminTestPayment = params.forceYocoMode === 'test';
      
      const metadata: PaymentMetadata = {
        intentType: 'subscription',
        intentId: intentId,
        invoiceId: params.invoiceId,
        userId: params.userId,
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        exchangeRate: conversion.exchangeRate,
        rateSource: conversion.rateSource,
        // SuperAdmin test payment tracking
        ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
        ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
      };

      // Create payment intent record with ZAR amount
      const [paymentIntent] = await db.insert(paymentIntents).values({
        intentType: 'subscription',
        intentId: intentId,
        invoiceId: params.invoiceId,
        userId: params.userId,
        amount: conversion.zarAmount,  // Always ZAR for YOCO
        currency: 'ZAR',               // Always ZAR for YOCO
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        status: 'pending',
        metadata: metadata as any,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        failureUrl: params.failureUrl,
        checkoutId: null, // Will be updated after YOCO checkout creation
      }).returning();

      // Replace URL placeholders with actual intentId
      // IMPORTANT: YOCO does NOT support placeholder substitution - we must do it ourselves
      const resolvedSuccessUrl = this.replaceUrlPlaceholders(params.successUrl, paymentIntent.id);
      const resolvedCancelUrl = this.replaceUrlPlaceholders(params.cancelUrl, paymentIntent.id);
      const resolvedFailureUrl = this.replaceUrlPlaceholders(params.failureUrl, paymentIntent.id);

      // Create YOCO checkout with ZAR amount
      const checkout = await PaymentService.createYocoCheckout({
        amount: conversion.zarAmount,
        currency: 'ZAR',
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
        failureUrl: resolvedFailureUrl,
        metadata: metadata as any,
        forceYocoMode: params.forceYocoMode, // Pass SuperAdmin mode override
      });

      if (!checkout.checkoutId || !checkout.redirectUrl) {
        throw new Error('Failed to create YOCO checkout');
      }

      // Update payment intent with checkout ID
      await db.update(paymentIntents)
        .set({
          checkoutId: checkout.checkoutId,
          checkoutUrl: checkout.redirectUrl,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, paymentIntent.id));

      return {
        success: true,
        checkoutUrl: checkout.redirectUrl,
        paymentIntentId: paymentIntent.id,
        checkoutId: checkout.checkoutId,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] Subscription checkout creation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to create subscription checkout',
      };
    }
  }

  /**
   * Create a payment intent and YOCO checkout for license purchase
   * Automatically converts non-ZAR currencies to ZAR for YOCO processing
   * Supports optional lockedRate for using a previously locked exchange rate
   */
  static async createLicenseCheckout(params: {
    userId: string;
    organizationId: string;
    tier: 'blue' | 'red' | 'gold';
    seatCount: number;
    billingPeriodMonths: number;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    successUrl: string;
    cancelUrl: string;
    failureUrl: string;
    lockedRate?: { exchangeRate: string; rateLockedAt: string; originalCurrency: string };
    forceYocoMode?: YocoMode; // SuperAdmin override for payment mode
  }): Promise<CheckoutResult> {
    try {
      // Feature flag: Check if license payments are enabled
      if (!getFeatureFlags().arePaymentsEnabled()) {
        console.warn('[PaymentOrchestrator] License payment creation blocked - feature disabled');
        return {
          success: false,
          error: 'License purchases are currently unavailable',
        };
      }

      // Feature flag: Check if enabled for this organization
      if (!getFeatureFlags().isEnabledForOrg(params.organizationId)) {
        console.warn(`[PaymentOrchestrator] License payment blocked for org ${params.organizationId} - not in rollout list`);
        return {
          success: false,
          error: 'License purchases are not yet available for your organization',
        };
      }

      // Convert to ZAR if needed - YOCO only accepts ZAR
      // Pass lockedRate if provided for rate locking support
      const conversion = await this.convertToZAR(params.amount, params.currency, params.lockedRate);
      
      // Determine if this is a SuperAdmin test payment
      const isSuperAdminTestPayment = params.forceYocoMode === 'test';

      const metadata: PaymentMetadata = {
        intentType: 'license',
        intentId: params.organizationId, // Organization ID for license purchases
        organizationId: params.organizationId,
        userId: params.userId,
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        exchangeRate: conversion.exchangeRate,
        rateSource: conversion.rateSource,
        tier: params.tier,
        seatCount: params.seatCount,
        billingPeriodMonths: params.billingPeriodMonths,
        // SuperAdmin test payment tracking
        ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
        ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
      };

      // Create payment intent record with ZAR amount
      const [paymentIntent] = await db.insert(paymentIntents).values({
        intentType: 'license',
        intentId: params.organizationId,
        organizationId: params.organizationId,
        userId: params.userId,
        amount: conversion.zarAmount,  // Always ZAR for YOCO
        currency: 'ZAR',               // Always ZAR for YOCO
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        status: 'pending',
        metadata: metadata as any,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        failureUrl: params.failureUrl,
        checkoutId: null, // Will be updated after YOCO checkout creation
      }).returning();

      // Create license payment record for webhook fulfillment with ZAR amount
      // This enables idempotent linkage between payment intents and license allocations
      const billingPeriodStart = new Date();
      const billingPeriodEnd = addMonths(billingPeriodStart, params.billingPeriodMonths);
      
      await db.insert(licensePayments).values({
        paymentIntentId: paymentIntent.id,
        organizationId: params.organizationId,
        billingPeriodStart,
        billingPeriodEnd,
        seatsCount: params.seatCount,
        amount: conversion.zarAmount,  // Store ZAR for consistency
        currency: 'ZAR',               // Store ZAR for consistency
        status: 'pending', // Will be updated by webhook fulfillment
        metadata: {
          tier: params.tier,
          billingPeriodMonths: params.billingPeriodMonths,
          autoRenew: true,
          pricingSnapshot: metadata,
          originalAmount: conversion.originalAmount,
          originalCurrency: conversion.originalCurrency,
          exchangeRate: conversion.exchangeRate,
          // SuperAdmin test payment tracking
          ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
          ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
        } as any,
      });

      console.log('[PaymentOrchestrator] Created license payment record:', {
        paymentIntentId: paymentIntent.id,
        organizationId: params.organizationId,
        tier: params.tier,
        seatCount: params.seatCount,
        billingPeriodEnd: billingPeriodEnd.toISOString(),
        zarAmount: conversion.zarAmount,
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
      });

      // Replace URL placeholders with actual intentId
      // IMPORTANT: YOCO does NOT support placeholder substitution - we must do it ourselves
      const resolvedSuccessUrl = this.replaceUrlPlaceholders(params.successUrl, paymentIntent.id);
      const resolvedCancelUrl = this.replaceUrlPlaceholders(params.cancelUrl, paymentIntent.id);
      const resolvedFailureUrl = this.replaceUrlPlaceholders(params.failureUrl, paymentIntent.id);

      // Create YOCO checkout with ZAR amount
      const checkout = await PaymentService.createYocoCheckout({
        amount: conversion.zarAmount,
        currency: 'ZAR',
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
        failureUrl: resolvedFailureUrl,
        metadata: metadata as any,
        forceYocoMode: params.forceYocoMode, // Pass SuperAdmin mode override
      });

      if (!checkout.checkoutId || !checkout.redirectUrl) {
        throw new Error('Failed to create YOCO checkout');
      }

      // Update payment intent with checkout ID
      await db.update(paymentIntents)
        .set({
          checkoutId: checkout.checkoutId,
          checkoutUrl: checkout.redirectUrl,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, paymentIntent.id));

      return {
        success: true,
        checkoutUrl: checkout.redirectUrl,
        paymentIntentId: paymentIntent.id,
        checkoutId: checkout.checkoutId,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] License checkout creation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to create license checkout',
      };
    }
  }

  /**
   * Get payment intent by checkout ID
   * Uses case-insensitive lookup to handle potential casing differences
   */
  static async getPaymentIntentByCheckoutId(checkoutId: string) {
    try {
      console.log(`[PaymentOrchestrator] Looking up payment intent for checkoutId: ${checkoutId}`);
      
      // First try exact match
      let [intent] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.checkoutId, checkoutId))
        .limit(1);
      
      // If not found, try case-insensitive match
      if (!intent) {
        console.log(`[PaymentOrchestrator] Exact match failed, trying case-insensitive lookup for: ${checkoutId}`);
        [intent] = await db
          .select()
          .from(paymentIntents)
          .where(sql`LOWER(${paymentIntents.checkoutId}) = LOWER(${checkoutId})`)
          .limit(1);
      }
      
      if (intent) {
        console.log(`[PaymentOrchestrator] Found payment intent: ${intent.id} (type: ${intent.intentType}, status: ${intent.status})`);
      } else {
        console.log(`[PaymentOrchestrator] No payment intent found for checkoutId: ${checkoutId}`);
      }
      
      return intent || null;
    } catch (error: any) {
      console.error('[PaymentOrchestrator] Failed to fetch payment intent:', error);
      return null;
    }
  }

  /**
   * Get payment intent by metadata (fallback when checkoutId is null)
   * Used for webhook retries that arrive before checkout creation completes
   */
  static async getPaymentIntentByMetadata(metadata: PaymentMetadata) {
    try {
      console.log('[PaymentOrchestrator] Metadata fallback lookup:', {
        intentType: metadata.intentType,
        intentId: metadata.intentId,
        userId: metadata.userId,
        organizationId: metadata.organizationId,
        invoiceId: metadata.invoiceId,
      });

      // Validate required fields exist
      if (!metadata.intentType || !metadata.intentId || !metadata.userId) {
        console.error('[PaymentOrchestrator] Metadata fallback failed: missing required fields', {
          hasIntentType: !!metadata.intentType,
          hasIntentId: !!metadata.intentId,
          hasUserId: !!metadata.userId,
        });
        return null;
      }

      // Build query conditions based on available metadata
      const conditions = [
        eq(paymentIntents.intentType, metadata.intentType),
        eq(paymentIntents.intentId, metadata.intentId),
        eq(paymentIntents.userId, metadata.userId),
      ];

      // Add optional invoice ID for subscriptions
      if (metadata.invoiceId) {
        conditions.push(eq(paymentIntents.invoiceId, metadata.invoiceId));
      }

      // Add optional organization ID for credits
      if (metadata.organizationId) {
        conditions.push(eq(paymentIntents.organizationId, metadata.organizationId));
      }

      const [intent] = await db
        .select()
        .from(paymentIntents)
        .where(and(...conditions))
        .orderBy(sql`${paymentIntents.createdAt} DESC`)
        .limit(1);
      
      if (intent) {
        console.log(`[PaymentOrchestrator] Resolved payment intent ${intent.id} via metadata fallback (type: ${intent.intentType}, status: ${intent.status})`);
      } else {
        console.log('[PaymentOrchestrator] No payment intent found via metadata fallback');
      }
      
      return intent || null;
    } catch (error: any) {
      console.error('[PaymentOrchestrator] Failed to fetch payment intent by metadata:', error);
      return null;
    }
  }

  /**
   * Update payment intent status by payment intent ID (not checkoutId)
   * Uses compare-and-swap (CAS) semantics with expected prior status
   * Prevents status downgrades and concurrent update races
   */
  static async updatePaymentIntentStatus(
    paymentIntentId: string,
    newStatus: 'pending' | 'started' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded',
    expectedPriorStatus?: 'pending' | 'started' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
  ) {
    try {
      // Fetch current intent to verify existence and check current status
      const [currentIntent] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, paymentIntentId))
        .limit(1);

      if (!currentIntent) {
        throw new Error(`Payment intent ${paymentIntentId} not found`);
      }

      // If expected prior status provided, verify it matches (CAS semantics)
      if (expectedPriorStatus && currentIntent.status !== expectedPriorStatus) {
        console.warn(
          `[PaymentOrchestrator] CAS failed: expected ${expectedPriorStatus} but found ${currentIntent.status} for intent ${paymentIntentId}`
        );
        return { updated: false, currentStatus: currentIntent.status };
      }

      // Prevent status downgrades: if already succeeded, block transitions to non-terminal states
      if (currentIntent.status === 'succeeded' && (newStatus === 'pending' || newStatus === 'processing')) {
        console.warn(
          `[PaymentOrchestrator] Prevented status downgrade: intent ${paymentIntentId} is already succeeded, cannot transition to ${newStatus}`
        );
        return { updated: false, currentStatus: currentIntent.status };
      }

      // Build atomic WHERE clause conditions
      const whereConditions = [eq(paymentIntents.id, paymentIntentId)];
      
      // Add expected prior status check for true CAS behavior
      if (expectedPriorStatus) {
        whereConditions.push(eq(paymentIntents.status, expectedPriorStatus));
      }
      
      // Prevent downgrades from succeeded (unless explicitly CAS'd with expected status)
      if (!expectedPriorStatus && newStatus !== 'succeeded') {
        whereConditions.push(sql`status != 'succeeded'`);
      }

      // Atomic update with CAS conditions
      const result = await db
        .update(paymentIntents)
        .set({
          status: newStatus,
          lastWebhookAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(...whereConditions))
        .returning({ id: paymentIntents.id, status: paymentIntents.status });

      if (result.length === 0) {
        console.warn(
          `[PaymentOrchestrator] CAS update failed - conditions not met for intent ${paymentIntentId}`
        );
        return { updated: false, currentStatus: currentIntent.status };
      }

      console.log(
        `[PaymentOrchestrator] Updated payment intent ${paymentIntentId} status to ${newStatus}` +
        (expectedPriorStatus ? ` (CAS from ${expectedPriorStatus})` : '')
      );
      
      return { updated: true, currentStatus: newStatus };
    } catch (error: any) {
      console.error('[PaymentOrchestrator] Failed to update payment intent status:', error);
      throw error;
    }
  }

  /**
   * Fulfill course purchase after successful payment
   * Creates course purchase record and enrollment
   */
  static async fulfillCoursePurchase(params: {
    paymentIntentId: string;
    checkoutId: string;
    userId: string;
    courseId: string;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
  }): Promise<{ success: boolean; purchaseId?: string; error?: string }> {
    try {
      // Import at function level to avoid circular dependencies
      const { coursePurchases, userCourseEnrollments, courses, courseVersions } = await import('@shared/schema');

      // Check if purchase already exists (idempotency)
      const existingPurchase = await db
        .select()
        .from(coursePurchases)
        .where(
          and(
            eq(coursePurchases.userId, params.userId),
            eq(coursePurchases.courseId, params.courseId),
            eq(coursePurchases.checkoutId, params.checkoutId)
          )
        )
        .limit(1);

      if (existingPurchase.length > 0) {
        console.log(`[PaymentOrchestrator] Course purchase already fulfilled: ${existingPurchase[0].id}`);
        return {
          success: true,
          purchaseId: existingPurchase[0].id,
        };
      }

      // Get course and latest version details for required fields
      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, params.courseId))
        .limit(1);

      if (!course) {
        throw new Error(`Course not found: ${params.courseId}`);
      }

      // Get latest published version
      const [latestVersion] = await db
        .select()
        .from(courseVersions)
        .where(and(
          eq(courseVersions.courseId, params.courseId),
          eq(courseVersions.isPublished, true)
        ))
        .orderBy(desc(courseVersions.publishedAt))
        .limit(1);

      if (!latestVersion) {
        throw new Error(`No published version found for course: ${params.courseId}`);
      }

      // Use default values for financial fields (to be refined with actual exchange rates later)
      const purchasePrice = params.amount;
      const purchaseCurrency = params.currency;
      const platformCurrency = 'ZAR' as const; // Platform base currency
      const exchangeRateUsed = '1.00000000'; // Default rate (1:1 for same currency)
      const platformAmount = params.amount; // Same as purchase when rate is 1:1
      const commissionRate = '0.3000'; // 30% commission (platform standard)
      const purchaseValue = parseFloat(params.amount);
      const commissionAmount = (purchaseValue * 0.30).toFixed(4);
      const creatorEarnings = (purchaseValue * 0.70).toFixed(4);

      // Create course purchase record
      const [purchase] = await db.insert(coursePurchases).values({
        userId: params.userId,
        courseId: params.courseId,
        courseVersionId: latestVersion.id,
        checkoutId: params.checkoutId,
        status: 'completed',
        purchasePrice,
        purchaseCurrency,
        platformCurrency,
        exchangeRateUsed,
        platformAmount,
        commissionRate,
        commissionAmount,
        creatorEarnings,
        purchasedAt: new Date(),
      }).returning();

      // Create or update user enrollment
      const existingEnrollment = await db
        .select()
        .from(userCourseEnrollments)
        .where(
          and(
            eq(userCourseEnrollments.userId, params.userId),
            eq(userCourseEnrollments.courseId, params.courseId)
          )
        )
        .limit(1);

      if (existingEnrollment.length === 0) {
        await db.insert(userCourseEnrollments).values({
          userId: params.userId,
          courseId: params.courseId,
          courseVersionId: latestVersion.id,
          enrolledAt: new Date(),
        });
      }

      // Create payout line item for revenue tracking
      const { RevenueTrackingService } = await import('./revenueTrackingService');
      await RevenueTrackingService.createPayoutLineItem(
        params.courseId,
        purchase.id,
        parseFloat(params.amount),
        params.currency
      );

      console.log(`[PaymentOrchestrator] Course purchase fulfilled: ${purchase.id}`);

      // Invalidate user's session since their enrollments changed
      await SessionInvalidationService.invalidateUserSessions(
        params.userId,
        `Course purchase fulfilled: ${params.courseId}`
      );

      // Send purchase confirmation email
      // TODO: Integrate with NotificationService once email templates are ready

      return {
        success: true,
        purchaseId: purchase.id,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] Course purchase fulfillment failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to fulfill course purchase',
      };
    }
  }

  /**
   * Handle course purchase refund
   * Marks purchase as refunded and removes enrollment if within refund window
   */
  static async handleCourseRefund(params: {
    purchaseId: string;
    reason: string;
    refundedBy: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Import at function level to avoid circular dependencies
      const { coursePurchases, userCourseEnrollments, financialAuditLog } = await import('@shared/schema');

      // Get purchase details
      const [purchase] = await db
        .select()
        .from(coursePurchases)
        .where(eq(coursePurchases.id, params.purchaseId))
        .limit(1);

      if (!purchase) {
        return {
          success: false,
          error: 'Purchase not found',
        };
      }

      if (purchase.status === 'refunded') {
        return {
          success: true, // Already refunded, idempotent
        };
      }

      // Update purchase status
      await db
        .update(coursePurchases)
        .set({
          status: 'refunded',
          refundedAt: new Date(),
        })
        .where(eq(coursePurchases.id, params.purchaseId));

      // Remove enrollment (optional - could keep with status flag instead)
      await db
        .delete(userCourseEnrollments)
        .where(
          and(
            eq(userCourseEnrollments.userId, purchase.userId),
            eq(userCourseEnrollments.courseId, purchase.courseId)
          )
        );

      // Create audit log (using correct schema field names)
      await db.insert(financialAuditLog).values({
        eventType: 'course_refund',
        entityType: 'course_purchase',
        entityId: params.purchaseId,
        userId: params.refundedBy,
        beforeState: {
          purchaseId: params.purchaseId,
          courseId: purchase.courseId,
          userId: purchase.userId,
          purchasePrice: purchase.purchasePrice,
          purchaseCurrency: purchase.purchaseCurrency,
          status: 'completed',
        },
        afterState: {
          status: 'refunded',
          reason: params.reason,
          refundedAt: new Date().toISOString(),
        },
        ipAddress: null,
      });

      console.log(`[PaymentOrchestrator] Course refund processed: ${params.purchaseId}`);

      return {
        success: true,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] Course refund failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to process course refund',
      };
    }
  }

  /**
   * Create a payment intent and YOCO checkout for course version upgrade
   * Automatically converts non-ZAR currencies to ZAR for YOCO processing
   */
  static async createUpgradeCheckout(params: {
    userId: string;
    courseId: string;
    versionId: string;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    successUrl: string;
    cancelUrl: string;
    failureUrl: string;
    forceYocoMode?: YocoMode; // SuperAdmin override for payment mode
  }): Promise<CheckoutResult> {
    try {
      // Convert to ZAR if needed - YOCO only accepts ZAR
      const conversion = await this.convertToZAR(params.amount, params.currency);
      
      // Determine if this is a SuperAdmin test payment
      const isSuperAdminTestPayment = params.forceYocoMode === 'test';
      
      const metadata: PaymentMetadata = {
        intentType: 'course',
        intentId: params.courseId,
        userId: params.userId,
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        exchangeRate: conversion.exchangeRate,
        // SuperAdmin test payment tracking
        ...(params.forceYocoMode ? { yocoModeUsed: params.forceYocoMode } : {}),
        ...(isSuperAdminTestPayment ? { testPayment: true, superAdminTest: true } : {}),
      };

      // Add version info to metadata
      const upgradeMetadata = {
        ...metadata,
        versionId: params.versionId,
        isUpgrade: true,
      };

      // Create payment intent record for upgrade with ZAR amount
      const [paymentIntent] = await db.insert(paymentIntents).values({
        intentType: 'course',
        intentId: params.courseId,
        userId: params.userId,
        amount: conversion.zarAmount,  // Always ZAR for YOCO
        currency: 'ZAR',               // Always ZAR for YOCO
        originalAmount: conversion.originalAmount,
        originalCurrency: conversion.originalCurrency,
        status: 'pending',
        metadata: upgradeMetadata as any,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        failureUrl: params.failureUrl,
        checkoutId: null,
      }).returning();

      // Create YOCO checkout with ZAR amount
      const checkout = await PaymentService.createYocoCheckout({
        amount: conversion.zarAmount,
        currency: 'ZAR',
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        failureUrl: params.failureUrl,
        metadata: upgradeMetadata as any,
        forceYocoMode: params.forceYocoMode, // Pass SuperAdmin mode override
      });

      if (!checkout.checkoutId || !checkout.redirectUrl) {
        throw new Error('Failed to create YOCO checkout for upgrade');
      }

      // Update payment intent with checkout ID
      await db.update(paymentIntents)
        .set({
          checkoutId: checkout.checkoutId,
          checkoutUrl: checkout.redirectUrl,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, paymentIntent.id));

      console.log(`[PaymentOrchestrator] Upgrade checkout created for course ${params.courseId}, version ${params.versionId}`);

      return {
        success: true,
        checkoutUrl: checkout.redirectUrl,
        paymentIntentId: paymentIntent.id,
        checkoutId: checkout.checkoutId,
      };

    } catch (error: any) {
      console.error('[PaymentOrchestrator] Upgrade checkout creation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to create upgrade checkout',
      };
    }
  }
}
