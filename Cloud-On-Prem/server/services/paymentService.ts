import axios from 'axios';
import crypto from 'crypto';
import { db } from '../db';
import { platformPaymentSettings } from '@shared/schema';
import { getBaseUrl } from '../config/base-url';
import { desc } from 'drizzle-orm';
import { IntegrationConfigService } from './integrationConfigService';
import { IntegrationAuditService } from './integrationAuditService';

/**
 * Payment Service - YOCO Payment Gateway Integration
 * 
 * Provides abstraction layer for payment processing using YOCO Checkout API.
 * Supports ZAR, USD, and EUR currencies with automatic conversion.
 * 
 * Credentials are managed in Integration Settings (database-backed).
 * 
 * YOCO mode (test/live) is now controlled by SuperAdmin via platformPaymentSettings table.
 * This allows toggling between test and live modes without code changes.
 * 
 * Note: YOCO only supports ZAR natively. USD/EUR amounts are accepted but
 * should be pre-converted to ZAR using CurrencyService for accurate pricing.
 */

export type YocoMode = 'test' | 'live';

export interface YocoCheckoutRequest {
  courseId?: string; // Optional - for backward compatibility
  userId?: string; // Optional - for backward compatibility
  amount: string; // Decimal amount in ZAR (e.g., "99.99")
  currency: 'ZAR' | 'USD' | 'EUR'; // Accept all currencies
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  organizationId?: string;
  courseVersionId?: string;
  isUpgrade?: boolean;
  originalAmount?: string; // Original amount before conversion
  originalCurrency?: 'ZAR' | 'USD' | 'EUR'; // Original currency before conversion
  metadata?: Record<string, any>; // Payment metadata for orchestrator
  forceYocoMode?: YocoMode; // SuperAdmin override for payment mode (test/live)
}

export interface YocoCheckoutResponse {
  checkoutId: string;
  redirectUrl: string;
  status: 'pending' | 'created';
}

/**
 * Yoco Webhook Payload Structure
 * Per official Yoco API documentation:
 * 
 * Payment events:
 * - payment.succeeded: Payment completed successfully
 * - payment.failed: Payment failed
 * 
 * Refund events (for both full and partial refunds):
 * - refund.succeeded: Refund completed successfully
 * - refund.failed: Refund failed
 */
export interface YocoWebhookPayload {
  createdDate: string;  // ISO date when event was created
  id: string;           // Unique event ID (for replay protection)
  type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled' | 'refund.succeeded' | 'refund.failed';
  payload: {
    id: string;         // Checkout/payment ID
    amount: number;     // Amount in cents
    currency: string;
    status: string;
    metadata?: Record<string, any>;
    failureReason?: string;  // Only present for failed events
    refundId?: string;       // Only present for refund events
  };
}

export interface PaymentVerification {
  verified: boolean;
  amount?: string;
  currency?: string;
  status?: string;
  metadata?: Record<string, any>;
}

export class PaymentService {
  private static readonly YOCO_API_BASE = 'https://payments.yoco.com/api';
  private static normalizeValue(value: string | undefined | null): string {
    if (!value) return '';
    const trimmed = value.trim();
    return trimmed.replace(/^['"]+|['"]+$/g, '').trim();
  }

  private static async getYocoSecretByMode(mode: YocoMode): Promise<string> {
    if (mode === 'test') {
      const dbSecret = await IntegrationConfigService.getSecret('yoco', 'testSecretKey');
      return this.normalizeValue(dbSecret);
    }
    const dbSecret = await IntegrationConfigService.getSecret('yoco', 'liveSecretKey');
    return this.normalizeValue(dbSecret);
  }

  private static async getYocoPublicByMode(mode: YocoMode): Promise<string> {
    if (mode === 'test') {
      const dbKey = await IntegrationConfigService.getSecret('yoco', 'testPublicKey');
      return this.normalizeValue(String(dbKey || ''));
    }
    const dbKey = await IntegrationConfigService.getSecret('yoco', 'livePublicKey');
    return this.normalizeValue(String(dbKey || ''));
  }

  /**
   * Get current YOCO mode from database (test or live)
   * SuperAdmin controls this setting via platformPaymentSettings table
   * 
   * @param overrideMode - Optional override mode (for SuperAdmin test purchases)
   *                       When provided, skips database lookup and uses this mode directly
   */
  static async getYocoMode(overrideMode?: YocoMode): Promise<YocoMode> {
    // If override mode is provided (SuperAdmin), use it directly
    if (overrideMode && (overrideMode === 'test' || overrideMode === 'live')) {
      console.log(`[PaymentService] Using YOCO mode override: ${overrideMode} (SuperAdmin)`);
      return overrideMode;
    }
    
    try {
      const settings = await db
        .select()
        .from(platformPaymentSettings)
        .orderBy(
          desc(platformPaymentSettings.updatedAt),
          desc(platformPaymentSettings.createdAt),
        )
        .limit(1);
      
      if (settings.length === 0) {
        console.warn('[PaymentService] No payment settings found - defaulting to test mode');
        return 'test';
      }
      
      return settings[0].yocoMode;
    } catch (error) {
      console.error('[PaymentService] Failed to fetch YOCO mode from database:', error);
      // Fallback to test mode if database query fails
      return 'test';
    }
  }

  /**
   * Get YOCO secret key from environment
   * Automatically selects TEST or LIVE key based on database setting or override
   * 
   * @param overrideMode - Optional override mode (for SuperAdmin test purchases)
   */
  static async getSecretKey(overrideMode?: YocoMode): Promise<string> {
    const mode = await this.getYocoMode(overrideMode);
    const key = await this.getYocoSecretByMode(mode);
    
    if (!key) {
      const keyName = mode === 'test' ? 'YOCO_TEST_SECRET_KEY' : 'YOCO_LIVE_SECRET_KEY';
      throw new Error(`${keyName} not configured in Integration Settings.`);
    }
    
    console.log(`[PaymentService] Using YOCO ${mode} mode${overrideMode ? ' (SuperAdmin override)' : ''}`);
    return key;
  }

  /**
   * Get YOCO public key from environment (for frontend)
   * Automatically selects TEST or LIVE key based on database setting or override
   * 
   * @param overrideMode - Optional override mode (for SuperAdmin test purchases)
   */
  static async getPublicKey(overrideMode?: YocoMode): Promise<string> {
    const mode = await this.getYocoMode(overrideMode);
    const key = await this.getYocoPublicByMode(mode);
    
    if (!key) {
      const keyName = mode === 'test' ? 'YOCO_TEST_PUBLIC_KEY' : 'YOCO_LIVE_PUBLIC_KEY';
      throw new Error(`${keyName} not configured in Integration Settings.`);
    }
    return key;
  }

  /**
   * Verify YOCO webhook configuration
   * 
   * CRITICAL: Both TEST and LIVE modes should use the LIVE webhook endpoint
   * (configured via getBaseUrl()/api/webhooks/yoco) to ensure webhooks are always
   * received regardless of which mode is active.
   * 
   * This method logs warnings if configuration issues are detected:
   * 1. YOCO_WEBHOOK_SECRET not configured
   * 2. Mode is LIVE but no live credentials
   * 3. Missing webhook secret for current mode
   * 
   * @returns Configuration status object
   */
  static async verifyWebhookConfiguration(): Promise<{
    isValid: boolean;
    mode: 'test' | 'live';
    warnings: string[];
    expectedWebhookUrl: string;
  }> {
    const warnings: string[] = [];
    const expectedWebhookUrl = `${getBaseUrl()}/api/webhooks/yoco`;
    
    try {
      const mode = await this.getYocoMode();
      
      // Check webhook secret is configured
      const webhookSecret = await IntegrationConfigService.getSecret('yoco', 'webhookSecret');
      if (!webhookSecret) {
        warnings.push('CRITICAL: YOCO_WEBHOOK_SECRET is not configured. Webhook signature verification will fail in production.');
      } else if (!webhookSecret.startsWith('whsec_')) {
        warnings.push('WARNING: YOCO_WEBHOOK_SECRET does not have expected format (should start with whsec_)');
      }
      
      // Check credentials for current mode
      if (mode === 'live') {
        if (!(await this.getYocoSecretByMode('live'))) {
          warnings.push('CRITICAL: YOCO mode is LIVE but YOCO_LIVE_SECRET_KEY is not configured');
        }
        if (!(await this.getYocoPublicByMode('live'))) {
          warnings.push('CRITICAL: YOCO mode is LIVE but YOCO_LIVE_PUBLIC_KEY is not configured');
        }
      } else {
        if (!(await this.getYocoSecretByMode('test'))) {
          warnings.push('WARNING: YOCO mode is TEST but YOCO_TEST_SECRET_KEY is not configured');
        }
      }
      
      // Log verification results
      if (warnings.length > 0) {
        console.warn('[PaymentService] YOCO Webhook Configuration Issues:');
        warnings.forEach(w => console.warn(`  - ${w}`));
      } else {
        console.log(`[PaymentService] YOCO webhook configuration verified:`, {
          mode,
          webhookSecretConfigured: !!webhookSecret,
          expectedWebhookUrl,
        });
      }
      
      // Reminder about webhook URL
      console.log(`[PaymentService] IMPORTANT: All YOCO payments (test AND live) must use webhook URL: ${expectedWebhookUrl}`);
      console.log(`[PaymentService] Current YOCO mode: ${mode.toUpperCase()}`);
      
      return {
        isValid: warnings.filter(w => w.startsWith('CRITICAL')).length === 0,
        mode,
        warnings,
        expectedWebhookUrl,
      };
      
    } catch (error: any) {
      console.error('[PaymentService] Webhook configuration verification failed:', error);
      return {
        isValid: false,
        mode: 'test',
        warnings: [`Verification failed: ${error.message}`],
        expectedWebhookUrl,
      };
    }
  }

  /**
   * Convert decimal amount to cents for YOCO API
   */
  private static toCents(amount: string): number {
    return Math.round(parseFloat(amount) * 100);
  }

  /**
   * Convert cents to decimal amount
   */
  private static fromCents(amountInCents: number): string {
    return (amountInCents / 100).toFixed(2);
  }

  /**
   * Create a YOCO checkout session for payment
   * Returns redirect URL to YOCO-hosted payment page
   * 
   * IMPORTANT: YOCO only accepts ZAR. All amounts must be pre-converted to ZAR
   * before calling this method. Use PaymentOrchestratorService which handles
   * automatic ZAR conversion for all payment types.
   */
  static async createYocoCheckout(request: YocoCheckoutRequest): Promise<YocoCheckoutResponse> {
    const startedAt = Date.now();
    try {
      // Validate that currency is ZAR - YOCO only accepts ZAR
      // Callers should use PaymentOrchestratorService which handles conversion
      if (request.currency && request.currency !== 'ZAR') {
        console.error(`[PaymentService] CRITICAL: Non-ZAR currency (${request.currency}) passed to YOCO checkout. Amount should be pre-converted to ZAR.`);
        throw new Error(`YOCO only accepts ZAR currency. Received: ${request.currency}. Use PaymentOrchestratorService for automatic conversion.`);
      }

      // Use override mode if provided (SuperAdmin), otherwise use platform setting
      const secretKey = await this.getSecretKey(request.forceYocoMode);
      const effectiveMode = await this.getYocoMode(request.forceYocoMode);
      const amountInCents = this.toCents(request.amount);

      // Build metadata: Orchestrator metadata is authoritative and OVERWRITES legacy fields
      // CRITICAL: Orchestrator metadata (intentType, intentId, userId) is required for webhook lookups
      // Pattern: Legacy fields FIRST, then orchestrator spread LAST to ensure correct precedence
      const orchestratorMetadata = request.metadata ?? {};
      
      // Ensure isUpgrade is always a string (YOCO API requires strings for metadata values)
      // Orchestrator value takes precedence, then legacy value
      const isUpgradeValue = 'isUpgrade' in orchestratorMetadata 
        ? orchestratorMetadata.isUpgrade 
        : request.isUpgrade;
      const isUpgradeString = isUpgradeValue !== undefined && isUpgradeValue !== null 
        ? String(isUpgradeValue) 
        : undefined;
      
      // Determine if this is a SuperAdmin test payment (for revenue exclusion)
      const isSuperAdminTestPayment = request.forceYocoMode === 'test';
      
      const checkoutMetadata = {
        // Legacy fields FIRST - for backward compatibility with direct PaymentService calls
        userId: request.userId,
        courseId: request.courseId,
        organizationId: request.organizationId,
        courseVersionId: request.courseVersionId,
        originalCurrency: request.originalCurrency ?? request.currency,
        originalAmount: request.originalAmount ?? request.amount,
        // Orchestrator metadata LAST - overwrites all legacy fields with authoritative values
        // This ensures intentType, intentId, userId from orchestrator are preserved
        ...orchestratorMetadata,
        // isUpgrade needs special handling for string coercion after spread
        isUpgrade: isUpgradeString,
        // YOCO mode tracking for audit and revenue exclusion
        yocoModeUsed: effectiveMode,
        // SuperAdmin test payment flags - used to exclude from real revenue calculations
        ...(isSuperAdminTestPayment ? {
          testPayment: 'true',
          superAdminTest: 'true',
        } : {}),
      };

      // Log exchange rate info if present in metadata
      const exchangeRateInfo = orchestratorMetadata.exchangeRate 
        ? ` (converted from ${orchestratorMetadata.originalAmount} ${orchestratorMetadata.originalCurrency} at rate ${orchestratorMetadata.exchangeRate})`
        : '';
      
      const modeInfo = request.forceYocoMode 
        ? ` [SuperAdmin ${effectiveMode.toUpperCase()} mode]`
        : ` [${effectiveMode.toUpperCase()} mode]`;
      
      console.log(`[PaymentService] Creating YOCO checkout: ${request.amount} ZAR${exchangeRateInfo}${modeInfo}`, {
        courseId: request.courseId,
        userId: request.userId,
        amount: request.amount,
        amountInCents,
        intentType: orchestratorMetadata.intentType,
        originalAmount: orchestratorMetadata.originalAmount || request.originalAmount,
        originalCurrency: orchestratorMetadata.originalCurrency || request.originalCurrency,
        exchangeRate: orchestratorMetadata.exchangeRate,
        yocoMode: effectiveMode,
        isSuperAdminTestPayment,
      });

      // Generate unique idempotency key to prevent duplicate charges on retries
      const idempotencyKey = crypto.randomUUID();
      
      const response = await axios.post(
        `${this.YOCO_API_BASE}/checkouts`,
        {
          amount: amountInCents,
          currency: 'ZAR', // YOCO only supports ZAR
          cancelUrl: request.cancelUrl,
          successUrl: request.successUrl,
          failureUrl: request.failureUrl,
          metadata: checkoutMetadata,
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      const data = response.data;

      console.log(`[PaymentService] Checkout created successfully: ${data.id}`);

      const result = {
        checkoutId: data.id,
        redirectUrl: data.redirectUrl,
        status: data.status || 'created',
      };
      await IntegrationAuditService.logIntegrationEvent({
        provider: 'yoco',
        operation: 'create_checkout',
        status: 'success',
        message: `YOCO checkout created (${effectiveMode})`,
        durationMs: Date.now() - startedAt,
        requestSummary: { amount: request.amount, currency: request.currency, mode: effectiveMode },
        responseSummary: { checkoutId: data.id },
      });
      return result;
    } catch (error: any) {
      await IntegrationAuditService.logIntegrationEvent({
        provider: 'yoco',
        operation: 'create_checkout',
        status: 'failure',
        severity: 'error',
        message: error?.response?.data?.message || error?.message || 'YOCO checkout failed',
        durationMs: Date.now() - startedAt,
        requestSummary: { amount: request.amount, currency: request.currency },
        responseSummary: { status: error?.response?.status || null },
      });
      console.error('[PaymentService] Checkout creation failed:', error.response?.data || error.message);
      
      // Provide helpful error messages
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Unable to connect to YOCO payment service. Please try again later.');
      }
      
      if (error.response?.status === 401) {
        throw new Error('Payment gateway authentication failed. Please contact support.');
      }

      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.message || 'Invalid payment request';
        throw new Error(`Payment failed: ${errorMsg}`);
      }

      throw new Error(`Payment session creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Map YOCO API status to our internal paymentIntentStatus enum
   * YOCO returns "completed" for successful payments, we use "succeeded"
   */
  private static mapYocoStatus(yocoStatus: string): 'pending' | 'started' | 'processing' | 'succeeded' | 'failed' | 'cancelled' {
    const statusMap: Record<string, 'pending' | 'started' | 'processing' | 'succeeded' | 'failed' | 'cancelled'> = {
      'completed': 'succeeded',  // YOCO uses "completed" for successful payments
      'succeeded': 'succeeded',
      'successful': 'succeeded',
      'pending': 'pending',
      'started': 'started',
      'processing': 'processing',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',  // Handle US spelling
      'expired': 'failed',
    };
    
    const mappedStatus = statusMap[yocoStatus.toLowerCase()];
    if (!mappedStatus) {
      console.warn(`[PaymentService] Unknown YOCO status "${yocoStatus}", defaulting to "pending"`);
      return 'pending';
    }
    return mappedStatus;
  }

  /**
   * Verify YOCO payment after redirect
   * Fetches payment status from YOCO API and maps to internal status enum
   */
  static async verifyYocoPayment(checkoutId: string): Promise<PaymentVerification> {
    try {
      const secretKey = await this.getSecretKey();

      console.log('[PaymentService] Verifying payment:', checkoutId);

      const response = await axios.get(
        `${this.YOCO_API_BASE}/checkouts/${checkoutId}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
          timeout: 10000,
        }
      );

      const data = response.data;
      const mappedStatus = this.mapYocoStatus(data.status);

      console.log(`[PaymentService] Payment verified: ${checkoutId} - YOCO status: ${data.status} → mapped: ${mappedStatus}`);

      return {
        verified: mappedStatus === 'succeeded',
        amount: this.fromCents(data.amount),
        currency: data.currency,
        status: mappedStatus,
        metadata: data.metadata || {},
      };
    } catch (error: any) {
      console.error('[PaymentService] Payment verification failed:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        throw new Error('Payment not found');
      }

      if (error.response?.status === 401) {
        throw new Error('Payment verification authentication failed');
      }

      throw new Error(`Payment verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Handle YOCO webhook event
   * Processes payment status updates from YOCO
   * 
   * Note: Webhook signature verification should be added for production
   */
  static async handleYocoWebhook(payload: YocoWebhookPayload): Promise<{
    processed: boolean;
    message: string;
    checkoutId?: string;
    metadata?: Record<string, any>;
  }> {
    console.log('[PaymentService] Processing webhook:', payload.type, payload.payload.id);

    switch (payload.type) {
      case 'payment.succeeded':
        console.log('[PaymentService] Payment succeeded:', {
          checkoutId: payload.payload.id,
          amount: payload.payload.amount,
          metadata: payload.payload.metadata,
        });
        
        return {
          processed: true,
          message: 'Payment succeeded',
          checkoutId: payload.payload.id,
          metadata: payload.payload.metadata,
        };

      case 'payment.failed':
        console.log('[PaymentService] Payment failed:', payload.payload.id);
        return {
          processed: true,
          message: 'Payment failed',
          checkoutId: payload.payload.id,
          metadata: payload.payload.metadata,
        };

      case 'payment.cancelled':
        console.log('[PaymentService] Payment cancelled:', payload.payload.id);
        return {
          processed: true,
          message: 'Payment cancelled',
          checkoutId: payload.payload.id,
          metadata: payload.payload.metadata,
        };

      default:
        console.warn('[PaymentService] Unknown webhook type:', payload.type);
        return { processed: false, message: 'Unknown webhook type' };
    }
  }

  /**
   * Verify YOCO webhook signature using HMAC SHA256
   * 
   * Per YOCO documentation: https://developer.yoco.com/online/api-reference/webhooks/verifying-events/
   * YOCO sends three headers for webhook verification:
   * - webhook-id: Unique event identifier
   * - webhook-timestamp: Unix timestamp when webhook was signed  
   * - webhook-signature: Signature in format "v1,<base64_signature>"
   * 
   * The signed content is: webhook-id.webhook-timestamp.rawBody
   * Signature is HMAC-SHA256 encoded as base64 (NOT hex)
   * 
   * NOTE: This method is deprecated. Signature verification is now done inline in routes.ts
   * using the correct YOCO specification. This method is kept for reference only.
   * 
   * @param signedContent - The concatenated string: webhook-id.webhook-timestamp.rawBody
   * @param signatureBase64 - Base64 signature from webhook-signature header (after stripping v1, prefix)
   * @param webhookSecret - YOCO webhook secret (from environment variables)
   * @returns true if signature is valid, false otherwise
   */
  static verifyWebhookSignature(signedContent: string, signatureBase64: string, webhookSecret: string): boolean {
    try {
      if (!signatureBase64 || !webhookSecret) {
        console.warn('[PaymentService] Missing signature or webhook secret');
        return false;
      }

      // Generate expected signature using HMAC SHA256 with base64 encoding
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedContent)
        .digest('base64');

      // Use timing-safe comparison to prevent timing attacks
      try {
        const providedSigBuffer = Buffer.from(signatureBase64, 'base64');
        const expectedSigBuffer = Buffer.from(expectedSignature, 'base64');
        
        if (providedSigBuffer.length !== expectedSigBuffer.length) {
          console.warn('[PaymentService] Signature length mismatch');
          return false;
        }

        const isValid = crypto.timingSafeEqual(providedSigBuffer, expectedSigBuffer);

        if (!isValid) {
          console.warn('[PaymentService] Invalid webhook signature');
        } else {
          console.log('[PaymentService] Webhook signature verified successfully');
        }

        return isValid;
      } catch (e) {
        console.error('[PaymentService] Signature comparison error:', e);
        return false;
      }
    } catch (error) {
      console.error('[PaymentService] Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Get setup status and instructions
   * Uses database-driven YOCO mode setting
   */
  static async getSetupStatus(): Promise<{
    provider: string;
    configured: boolean;
    mode: 'test' | 'live';
    message: string;
  }> {
    const mode = await this.getYocoMode();
    const hasTestKeys = !!(await this.getYocoSecretByMode('test')) && !!(await this.getYocoPublicByMode('test'));
    const hasLiveKeys = !!(await this.getYocoSecretByMode('live')) && !!(await this.getYocoPublicByMode('live'));
    
    const configured = mode === 'test' ? hasTestKeys : hasLiveKeys;

    let message: string;
    if (mode === 'test' && hasTestKeys) {
      message = 'YOCO payment gateway configured (TEST mode - configured in database)';
    } else if (mode === 'live' && hasLiveKeys) {
      message = 'YOCO payment gateway configured (LIVE mode - configured in database)';
    } else {
      const requiredKeys = mode === 'test'
        ? 'YOCO test secret/public keys'
        : 'YOCO live secret/public keys';
      message = `YOCO not configured - add ${requiredKeys} in Integration Settings. Mode: ${mode.toUpperCase()} (set by SuperAdmin in platformPaymentSettings)`;
    }

    return {
      provider: 'YOCO',
      configured,
      mode,
      message,
    };
  }
}
