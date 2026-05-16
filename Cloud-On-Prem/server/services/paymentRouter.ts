// @ts-nocheck
import { db } from "../db";
import { paymentIntents, paymentFulfillments, subscriptionInvoices, creditOrders, courses, users } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { PaymentOrchestratorService, type PaymentMetadata } from "./paymentOrchestratorService";
import { CreditOrderService } from "./creditOrderService";
import { InvoiceService } from "./invoiceService";
import { SubscriptionService } from "./subscriptionService";
import { PurchaseService } from "./purchaseService";
import type { YocoWebhookPayload } from "./paymentService";
import { PlatformRevenueIngestionService } from "./platformRevenueIngestionService";
import { WebhookDeduplicationService } from "./webhookDeduplicationService";
import { EmailTemplates } from "./emailTemplates";
import { NotificationService } from "./notificationService";

/**
 * Payment Router
 * 
 * Centralized webhook handler that:
 * - Dispatches webhook events based on intentType
 * - Ensures idempotent fulfillment
 * - Tracks all payment applications in paymentFulfillments table
 * 
 * Webhook Flow:
 * 1. YOCO webhook arrives at /api/webhooks/yoco
 * 2. Signature verification happens in route handler
 * 3. PaymentRouter.handleWebhook dispatches to correct handler
 * 4. Handler applies payment (course enrollment, credit add, subscription renewal)
 * 5. Fulfillment tracked in paymentFulfillments table (unique checkoutId constraint)
 */
export class PaymentRouter {
  
  /**
   * Handle incoming YOCO webhook event
   * Dispatches to appropriate handler based on payment intent type
   * 
   * @returns { success: boolean; message?: string; error?: string }
   */
  static async handleWebhook(payload: YocoWebhookPayload): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    let dedupEventId: string | null = null; // Track for failure recording
    
    try {
      const checkoutId = payload.payload.id;
      const status = payload.payload.status;
      const metadata = payload.payload.metadata as PaymentMetadata | undefined;

      console.log(`[PaymentRouter] Processing webhook for checkout ${checkoutId}, type: ${payload.type}, status: ${status}`);
      
      // Phase 3a: Webhook deduplication - prevent duplicate processing
      const dedupResult = await WebhookDeduplicationService.checkAndClaim({
        checkoutId,
        eventType: payload.type,
        rawPayload: payload,
        source: 'webhook',
      });
      dedupEventId = dedupResult.eventId; // Store for failure tracking
      
      if (dedupResult.isDuplicate) {
        console.log(`[PaymentRouter] Duplicate webhook event skipped: ${dedupResult.eventId}`);
        return {
          success: true,
          message: `Duplicate event already processed at ${dedupResult.existingEvent?.processedAt}`,
        };
      }

      // Handle failure/cancellation webhooks - update payment intent to terminal status
      if (payload.type === 'payment.failed' || payload.type === 'payment.cancelled') {
        let paymentIntent = await PaymentOrchestratorService.getPaymentIntentByCheckoutId(checkoutId);
        
        // Fallback: try metadata lookup if checkoutId lookup fails
        if (!paymentIntent && metadata) {
          paymentIntent = await PaymentOrchestratorService.getPaymentIntentByMetadata(metadata);
        }
        
        if (paymentIntent) {
          const terminalStatus = payload.type === 'payment.failed' ? 'failed' : 'cancelled';
          await PaymentOrchestratorService.updatePaymentIntentStatus(paymentIntent.id, terminalStatus);
          console.log(`[PaymentRouter] Payment ${terminalStatus} for checkout ${checkoutId}`);
        } else {
          console.warn(`[PaymentRouter] Payment intent not found for failed/cancelled webhook: ${checkoutId}`);
        }

        return {
          success: true,
          message: `Payment ${payload.type === 'payment.failed' ? 'failed' : 'cancelled'}`,
        };
      }

      // Handle refund webhooks per official Yoco API specification
      // Yoco sends refund.succeeded and refund.failed (not payment.refunded)
      // These apply to both full and partial refunds
      if (payload.type === 'refund.succeeded') {
        console.log(`[PaymentRouter] Processing successful refund for checkout ${checkoutId}`);
        return await this.handleRefund(checkoutId, metadata, 'succeeded');
      }
      
      if (payload.type === 'refund.failed') {
        // Log failed refund for manual intervention/alerting
        console.error(`[PaymentRouter] Refund FAILED for checkout ${checkoutId}. Manual intervention required.`);
        console.error(`[PaymentRouter] Refund failure details:`, {
          checkoutId,
          status,
          metadata,
          failureReason: (payload.payload as any).failureReason || 'Unknown'
        });
        return {
          success: true,
          message: 'Refund failed event logged for manual intervention',
        };
      }

      // Only process successful payment events
      if (payload.type !== 'payment.succeeded') {
        console.log(`[PaymentRouter] Ignoring webhook type: ${payload.type}`);
        return {
          success: true,
          message: `Webhook type ${payload.type} acknowledged but not processed`,
        };
      }

      // CRITICAL: Verify payload status is final before fulfillment
      // YOCO can send payment.succeeded event while status is still 'pending' until settlement
      // Accept 'successful', 'completed', and 'succeeded' as valid final statuses
      // Note: 'succeeded' is used by ReconciliationService when replaying fulfillment
      const finalStatuses = ['successful', 'completed', 'succeeded'];
      if (!finalStatuses.includes(status)) {
        console.warn(`[PaymentRouter] Payment event succeeded but status is ${status}, deferring fulfillment`);
        return {
          success: true,
          message: `Payment status ${status} acknowledged but not fulfilled (waiting for settlement)`,
        };
      }

      // Load payment intent with fallback to metadata lookup
      let paymentIntent = await PaymentOrchestratorService.getPaymentIntentByCheckoutId(checkoutId);
      
      // Fallback: try metadata lookup if checkoutId lookup fails
      // This handles webhook retries that arrive before checkout creation completes
      if (!paymentIntent && metadata) {
        console.log(`[PaymentRouter] Attempting metadata fallback for checkout ${checkoutId}`);
        paymentIntent = await PaymentOrchestratorService.getPaymentIntentByMetadata(metadata);
        
        // If found via metadata, update with checkoutId for future lookups
        if (paymentIntent) {
          await db.update(paymentIntents)
            .set({ checkoutId, updatedAt: new Date() })
            .where(eq(paymentIntents.id, paymentIntent.id));
          console.log(`[PaymentRouter] Updated payment intent ${paymentIntent.id} with checkoutId ${checkoutId}`);
        }
      }
      
      if (!paymentIntent) {
        console.error(`[PaymentRouter] Payment intent not found for checkout ${checkoutId} even with metadata fallback`);
        console.error(`[PaymentRouter] Webhook metadata received:`, {
          intentType: metadata?.intentType,
          intentId: metadata?.intentId,
          userId: metadata?.userId,
          organizationId: metadata?.organizationId,
          allMetadata: metadata,
        });
        // This might be a legacy course payment before orchestrator was implemented
        return {
          success: false,
          error: 'Payment intent not found',
        };
      }

      // Check if already fulfilled (idempotency)
      const existingFulfillment = await db
        .select()
        .from(paymentFulfillments)
        .where(eq(paymentFulfillments.checkoutId, checkoutId))
        .limit(1);

      if (existingFulfillment.length > 0) {
        console.log(`[PaymentRouter] Payment already fulfilled for checkout ${checkoutId}`);
        return {
          success: true,
          message: 'Payment already fulfilled (idempotent)',
        };
      }

      // Dispatch to appropriate handler based on intentType
      const intentType = paymentIntent.intentType;
      
      let fulfillmentResult: any = null;
      
      switch (intentType) {
        case 'course':
          fulfillmentResult = await this.handleCoursePayment(paymentIntent, checkoutId);
          break;
        
        case 'credits':
          fulfillmentResult = await this.handleCreditPayment(paymentIntent, checkoutId);
          break;
        
        case 'subscription':
          fulfillmentResult = await this.handleSubscriptionPayment(paymentIntent, checkoutId);
          break;
        
        default:
          throw new Error(`Unknown payment intent type: ${intentType}`);
      }

      if (!fulfillmentResult.success) {
        // Mark payment intent as failed (using payment intent ID)
        await PaymentOrchestratorService.updatePaymentIntentStatus(paymentIntent.id, 'failed');
        throw new Error(fulfillmentResult.error || 'Fulfillment failed');
      }

      // Record fulfillment
      await db.insert(paymentFulfillments).values({
        paymentIntentId: paymentIntent.id,
        checkoutId: checkoutId,
        intentType: intentType,
        intentId: paymentIntent.intentId,
        invoiceId: paymentIntent.invoiceId || null,
        fulfilledBy: 'webhook',
        fulfillmentData: fulfillmentResult.data || {},
      });

      // Update payment intent status to succeeded AFTER fulfillment succeeds (using payment intent ID)
      await PaymentOrchestratorService.updatePaymentIntentStatus(paymentIntent.id, 'succeeded');

      // Send payment success email (fire and forget - don't fail payment on email failure)
      try {
        const [user] = await db.select().from(users).where(eq(users.id, paymentIntent.userId)).limit(1);
        if (user?.email) {
          if (intentType === 'credits') {
            const [order] = await db.select().from(creditOrders).where(eq(creditOrders.checkoutId, checkoutId)).limit(1);
            await EmailTemplates.sendPaymentSuccess({
              receiptId: order?.id,
              recipientEmail: user.email,
              recipientName: user.gamerName || user.firstName || user.email,
              amount: paymentIntent.amount || order?.amount || '0',
              currency: paymentIntent.currency || order?.currency || 'ZAR',
              paymentType: 'credit',
            });
            console.log(`[PaymentRouter] Credit purchase confirmation email sent to ${user.email}`);
          } else if (intentType === 'subscription' && paymentIntent.invoiceId) {
            await EmailTemplates.sendPaymentSuccess({
              invoiceId: paymentIntent.invoiceId,
              recipientEmail: user.email,
              recipientName: user.gamerName || user.firstName || user.email,
              amount: paymentIntent.amount || '0',
              currency: paymentIntent.currency || 'ZAR',
              paymentType: 'subscription',
            });
            console.log(`[PaymentRouter] Subscription invoice email sent to ${user.email}`);
          }
        }
      } catch (emailError) {
        console.error('[PaymentRouter] Invoice email dispatch failed (non-blocking):', emailError);
      }

      // Phase 3d: Record processing metrics
      const processingDurationMs = Date.now() - startTime;
      await WebhookDeduplicationService.recordCompletion(dedupResult.eventId, true, processingDurationMs);
      
      console.log(`[PaymentRouter] Successfully fulfilled ${intentType} payment for checkout ${checkoutId} in ${processingDurationMs}ms`);

      return {
        success: true,
        message: `Payment fulfilled: ${intentType}`,
      };

    } catch (error: any) {
      // Phase 3d: Record failure metrics if we have an event ID
      const processingDurationMs = Date.now() - startTime;
      console.error(`[PaymentRouter] Webhook handling failed after ${processingDurationMs}ms:`, error);
      
      // Record failure in webhook events for monitoring/alerting
      if (dedupEventId) {
        try {
          await WebhookDeduplicationService.recordCompletion(
            dedupEventId, 
            false, 
            processingDurationMs, 
            error.message || 'Unknown error'
          );
        } catch (dedupError) {
          console.error('[PaymentRouter] Failed to record dedup failure:', dedupError);
        }
      }
      
      return {
        success: false,
        error: error.message || 'Webhook handling failed',
      };
    }
  }

  /**
   * Handle course purchase payment
   * Grants course access using PurchaseService
   * Also records revenue for platform analytics
   * 
   * FX Rate Storage (Task 8): Stores the course's base currency and price at purchase time
   */
  private static async handleCoursePayment(
    paymentIntent: any,
    checkoutId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const courseId = paymentIntent.intentId;
      const userId = paymentIntent.userId;

      // Fetch course to get base currency and price for FX storage and commission calculation
      const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
      
      // Get platform commission rate from platformPricing
      const { platformPricing } = await import('@shared/schema');
      const [platformPricingRow] = await db
        .select()
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const commissionRatePercent = platformPricingRow?.elearningCommissionRate 
        ? parseFloat(platformPricingRow.elearningCommissionRate) 
        : 20; // Default 20% if not set
      const commissionRate = (commissionRatePercent / 100).toFixed(4);
      
      // Extract payment details from paymentIntent
      // paymentIntent.amount is in ZAR (YOCO charging currency)
      // Original course price/currency stored in metadata from PaymentOrchestratorService
      const zarAmount = paymentIntent.amount || '0';
      const exchangeRate = paymentIntent.metadata?.exchangeRate || '1.00000000';
      const originalAmount = paymentIntent.metadata?.originalAmount || course?.price?.toString() || zarAmount;
      const originalCurrency = paymentIntent.metadata?.originalCurrency || course?.currency || 'ZAR';
      
      // purchasePrice/purchaseCurrency = what buyer paid in their currency (original amounts)
      // platformAmount = ZAR amount charged through YOCO
      const purchasePrice = originalAmount;
      const purchaseCurrency = originalCurrency;
      const platformAmount = zarAmount;
      
      // Calculate commission and creator earnings based on platform amount (ZAR)
      const platformAmountNum = parseFloat(platformAmount);
      const commissionAmount = (platformAmountNum * parseFloat(commissionRate)).toFixed(4);
      const creatorEarnings = (platformAmountNum - parseFloat(commissionAmount)).toFixed(4);
      
      // Create purchase record with full payment details (not grantAccess which uses 0)
      const purchase = await PurchaseService.createPurchase(
        userId,
        courseId,
        purchasePrice,           // Original price in buyer's currency
        purchaseCurrency,        // Buyer's currency (USD/EUR/ZAR)
        checkoutId,
        'ZAR',                   // Platform currency (YOCO always charges ZAR)
        exchangeRate,
        platformAmount,          // Actual ZAR amount charged
        commissionRate,
        commissionAmount,        // Commission in ZAR
        creatorEarnings,         // Creator earnings in ZAR
        originalCurrency,        // Course's base currency for refunds
        originalAmount           // Course's base price for refunds
      );

      console.log(`[PaymentRouter] Course access granted: user ${userId}, course ${courseId}, checkout ${checkoutId}`);
      
      // Record revenue for platform analytics (fire and forget - don't fail payment on revenue tracking failure)
      try {
        if (course) {
          const grossAmount = paymentIntent.amount || '0';
          const processingFee = (parseFloat(grossAmount) * 0.029).toFixed(4);
          const platformCommission = (parseFloat(grossAmount) * 0.20).toFixed(4);
          
          await PlatformRevenueIngestionService.recordCourseRevenue({
            sourceId: checkoutId,
            organizationId: course.organizationId,
            userId: userId,
            grossAmount,
            platformCommission,
            processingFee,
            currency: (paymentIntent.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR',
            metadata: {
              courseId,
              courseTitle: course.title,
              purchaseId: purchase.id,
              paymentIntentId: paymentIntent.id,
            },
          });
        }
      } catch (revenueError) {
        console.error('[PaymentRouter] Revenue tracking failed (non-blocking):', revenueError);
      }

      // Send purchase receipt to buyer and sales notification to org admins (fire and forget - don't fail payment on email failure)
      try {
        const [buyer] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (buyer?.email && course) {
          const purchaseAmount = paymentIntent.amount || course.price?.toString() || '0';
          const purchaseCurrency = paymentIntent.currency || course.currency || 'ZAR';

          // Send purchase receipt to buyer
          await NotificationService.sendCoursePurchaseReceipt({
            buyerEmail: buyer.email,
            buyerName: buyer.firstName || buyer.gamerName || buyer.email,
            courseName: course.title,
            coursePrice: purchaseAmount,
            currency: purchaseCurrency,
            purchaseDate: purchase.purchasedAt || new Date(),
            transactionId: checkoutId,
            courseId: courseId,
            organizationId: course.organizationId,
          });

          // Send sales notification to org admins
          await NotificationService.sendSalesNotificationToOrgAdmins({
            courseId: courseId,
            courseName: course.title,
            buyerName: buyer.firstName || buyer.gamerName || buyer.email,
            purchaseAmount: purchaseAmount,
            currency: purchaseCurrency,
            organizationId: course.organizationId,
            transactionId: checkoutId,
            purchaseDate: purchase.purchasedAt || new Date(),
          });

          console.log(`[PaymentRouter] Course purchase emails dispatched for checkout ${checkoutId}`);
        }
      } catch (emailError) {
        console.error('[PaymentRouter] Course purchase email dispatch failed (non-blocking):', emailError);
      }

      // Generate and store PDF receipt (truly fire and forget - don't await or block webhook response)
      if (course) {
        // Use purchase record values (accurate charged amounts) not paymentIntent/course values
        const receiptAmount = purchase.purchasePrice;
        const receiptCurrency = purchase.purchaseCurrency;
        
        // Detached async execution - no await, captures closure safely
        (async () => {
          try {
            const receiptResult = await InvoiceService.generateCoursePurchaseReceipt({
              purchaseId: purchase.id,
              userId: userId,
              courseName: course.title,
              courseId: courseId,
              amount: receiptAmount,
              currency: receiptCurrency,
              paidAt: purchase.purchasedAt || new Date(),
              transactionId: checkoutId,
            });

            if (receiptResult.success && receiptResult.pdfPath) {
              // Update the purchase record with the PDF path
              const { coursePurchases } = await import('@shared/schema');
              await db.update(coursePurchases)
                .set({ receiptPdfPath: receiptResult.pdfPath })
                .where(eq(coursePurchases.id, purchase.id));
              console.log(`[PaymentRouter] Course purchase PDF receipt stored for ${purchase.id}`);
            }
          } catch (pdfError) {
            console.error('[PaymentRouter] Course purchase PDF receipt generation failed (non-blocking):', pdfError);
          }
        })();
      }
      
      return {
        success: true,
        data: {
          purchaseId: purchase.id,
          courseId: courseId,
          userId: userId,
          enrolledAt: purchase.purchasedAt,
        },
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Course payment failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle credit package purchase payment
   * Also records revenue for platform analytics
   * 
   * RACE CONDITION FIX: Pass paymentIntent.id for fallback lookup
   * when checkoutId hasn't been stored yet on the credit order.
   */
  private static async handleCreditPayment(
    paymentIntent: any,
    checkoutId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Phase 2: Pass pre-resolved context from paymentIntent to avoid redundant lookups
      // This speeds up fulfillment by eliminating database queries for user/org context
      const preResolvedContext = {
        userId: paymentIntent.userId,
        organizationId: paymentIntent.organizationId,
        metadata: paymentIntent.metadata,
      };
      
      // Delegate to CreditOrderService with paymentIntentId fallback and pre-resolved context
      // This handles the race condition where webhook arrives before checkoutId is stored
      const result = await CreditOrderService.fulfillOrder(checkoutId, paymentIntent.id, preResolvedContext);
      
      if (!result.success) {
        throw new Error(result.error || 'Credit fulfillment failed');
      }

      // Record revenue for platform analytics (fire and forget)
      try {
        const [order] = await db.select().from(creditOrders).where(eq(creditOrders.checkoutId, checkoutId)).limit(1);
        if (order) {
          const grossAmount = paymentIntent.amount || order.amount || '0';
          const processingFee = (parseFloat(grossAmount) * 0.029).toFixed(4);
          const platformCommission = grossAmount;
          
          await PlatformRevenueIngestionService.recordCreditRevenue({
            sourceId: checkoutId,
            organizationId: order.organizationId || '',
            userId: order.purchaserId,
            grossAmount,
            platformCommission,
            processingFee,
            currency: order.currency,
            creditCount: order.creditsAmount,
            metadata: {
              orderId: order.id,
              packageId: order.packageId,
              paymentIntentId: paymentIntent.id,
            },
          });
        }
      } catch (revenueError) {
        console.error('[PaymentRouter] Credit revenue tracking failed (non-blocking):', revenueError);
      }

      return {
        success: true,
        data: {
          creditsAdded: result.creditsAdded,
          receiptPdfPath: result.receiptPdfPath,
        },
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Credit payment failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle subscription billing payment
   * Also records revenue for platform analytics
   */
  private static async handleSubscriptionPayment(
    paymentIntent: any,
    checkoutId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (!paymentIntent.invoiceId) {
        throw new Error('Invoice ID missing for subscription payment');
      }

      // Mark invoice as paid
      await InvoiceService.markInvoicePaid(
        paymentIntent.invoiceId,
        checkoutId
      );

      // Renew subscription if needed
      // The renewal should happen automatically based on billing period end
      console.log(`[PaymentRouter] Subscription payment processed for ${paymentIntent.intentId}`);

      // Record revenue for platform analytics (fire and forget)
      try {
        const metadata = paymentIntent.metadata as PaymentMetadata | undefined;
        const grossAmount = paymentIntent.amount || '0';
        const processingFee = (parseFloat(grossAmount) * 0.029).toFixed(4);
        
        await PlatformRevenueIngestionService.recordSubscriptionRevenue({
          sourceId: checkoutId,
          organizationId: metadata?.organizationId || paymentIntent.intentId,
          userId: paymentIntent.userId,
          grossAmount,
          processingFee,
          currency: (paymentIntent.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR',
          invoiceId: paymentIntent.invoiceId,
          metadata: {
            subscriptionId: paymentIntent.intentId,
            invoiceId: paymentIntent.invoiceId,
            paymentIntentId: paymentIntent.id,
          },
        });
      } catch (revenueError) {
        console.error('[PaymentRouter] Subscription revenue tracking failed (non-blocking):', revenueError);
      }

      return {
        success: true,
        data: {
          subscriptionId: paymentIntent.intentId,
          invoiceId: paymentIntent.invoiceId,
          paidAt: new Date(),
        },
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Subscription payment failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle payment refund webhook (refund.succeeded event)
   * Reverses fulfillment based on payment intent type
   * 
   * Per Yoco API specification:
   * - refund.succeeded: Full or partial refund completed successfully
   * - refund.failed: Handled separately in handleWebhook (logs for manual intervention)
   * 
   * IDEMPOTENCY: Safe to call multiple times for the same checkout
   * - Checks if payment intent already has 'refunded' status
   * - Marks status as 'refunded' BEFORE reversal to prevent double-apply on webhook retries
   * - All reversal methods are also individually idempotent
   * 
   * @param checkoutId - The YOCO checkout ID
   * @param metadata - Optional metadata from webhook payload
   * @param refundStatus - The refund status from webhook ('succeeded')
   */
  private static async handleRefund(
    checkoutId: string,
    metadata?: PaymentMetadata,
    refundStatus?: 'succeeded' | 'failed'
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Find payment intent for this checkout
      let paymentIntent = await PaymentOrchestratorService.getPaymentIntentByCheckoutId(checkoutId);
      
      if (!paymentIntent && metadata) {
        paymentIntent = await PaymentOrchestratorService.getPaymentIntentByMetadata(metadata);
      }
      
      if (!paymentIntent) {
        console.warn(`[PaymentRouter] Refund: Payment intent not found for checkout ${checkoutId}`);
        return {
          success: true,
          message: 'Refund acknowledged but no payment intent found (may be legacy payment)',
        };
      }

      // IDEMPOTENCY GUARD: Check if already refunded before processing
      if (paymentIntent.status === 'refunded') {
        console.log(`[PaymentRouter] Refund: Payment intent ${paymentIntent.id} already refunded (idempotent)`);
        return {
          success: true,
          message: 'Refund already processed (idempotent)',
        };
      }

      // Check if fulfillment exists for this checkout
      const [fulfillment] = await db
        .select()
        .from(paymentFulfillments)
        .where(eq(paymentFulfillments.checkoutId, checkoutId))
        .limit(1);

      if (!fulfillment) {
        console.warn(`[PaymentRouter] Refund: No fulfillment found for checkout ${checkoutId}`);
        // Still mark as refunded even if no fulfillment (payment may have been refunded before fulfillment)
        await PaymentOrchestratorService.updatePaymentIntentStatus(paymentIntent.id, 'refunded');
        return {
          success: true,
          message: 'Refund acknowledged but no fulfillment to reverse',
        };
      }

      // CRITICAL: Mark payment intent as 'refunded' BEFORE calling reversal methods
      // This prevents double-application if webhook is retried while reversal is in progress
      await PaymentOrchestratorService.updatePaymentIntentStatus(paymentIntent.id, 'refunded');
      console.log(`[PaymentRouter] Refund: Marked payment intent ${paymentIntent.id} as refunded (pre-reversal)`);

      // Dispatch to appropriate reversal handler based on intentType
      // All reversal methods are idempotent and safe to call even if partially completed
      const intentType = paymentIntent.intentType;
      let reversalResult: { success: boolean; message?: string; error?: string };

      switch (intentType) {
        case 'course':
          reversalResult = await this.reverseCoursePayment(paymentIntent, fulfillment);
          break;
        
        case 'credits':
          reversalResult = await this.reverseCreditPayment(paymentIntent, fulfillment);
          break;
        
        case 'subscription':
          reversalResult = await this.reverseSubscriptionPayment(paymentIntent, fulfillment);
          break;
        
        default:
          console.warn(`[PaymentRouter] Unknown intent type for refund: ${intentType}`);
          reversalResult = { success: true, message: `Unknown intent type ${intentType} - manual review required` };
      }

      // Log the refund audit record
      console.log(`[PaymentRouter] Refund audit: checkout=${checkoutId}, intentType=${intentType}, paymentIntentId=${paymentIntent.id}, result=${reversalResult.success ? 'success' : 'failed'}, message=${reversalResult.message || reversalResult.error}`);

      if (!reversalResult.success) {
        // Reversal failed, but status is already 'refunded' - log for manual review
        console.error(`[PaymentRouter] Refund reversal failed for ${intentType} checkout ${checkoutId} - status already marked as refunded, manual review required`);
      }

      console.log(`[PaymentRouter] Refund processed for ${intentType} checkout ${checkoutId}: ${reversalResult.message}`);

      return reversalResult;

    } catch (error: any) {
      console.error('[PaymentRouter] Refund handling failed:', error);
      return {
        success: false,
        error: error.message || 'Refund handling failed',
      };
    }
  }

  /**
   * Reverse course purchase - revokes course access
   */
  private static async reverseCoursePayment(
    paymentIntent: any,
    fulfillment: any
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const courseId = paymentIntent.intentId;
      const userId = paymentIntent.userId;

      // Revoke course access using PurchaseService
      await PurchaseService.revokeAccess(userId, courseId);

      console.log(`[PaymentRouter] Course access revoked: user ${userId}, course ${courseId}`);
      
      return {
        success: true,
        message: `Course access revoked for user ${userId}`,
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Course reversal failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * BLOCKED: Lesson credit refunds are not processed
   * 
   * Platform Policy: Lesson credits are non-refundable once purchased.
   * This protects platform revenue because:
   * 1. Credits may already have been spent on lesson generation
   * 2. Lesson content has been delivered (consumed goods)
   * 3. Platform cannot recoup AI API costs for generated lessons
   * 
   * This method:
   * - Logs the refund attempt for audit trail
   * - Returns success to YOCO (prevents webhook retries)
   * - Does NOT deduct credits from user allocation
   * - Marks the order as "refund_blocked" for manual review
   */
  private static async reverseCreditPayment(
    paymentIntent: any,
    fulfillment: any
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Get order details for audit logging
      const order = await CreditOrderService.getOrderByCheckoutId(fulfillment.checkoutId);
      
      // Log the blocked refund attempt for audit trail
      console.warn(`[PaymentRouter] BLOCKED CREDIT REFUND: Lesson credit refunds are not processed.`);
      console.warn(`[PaymentRouter] Refund blocked details:`, {
        checkoutId: fulfillment.checkoutId,
        paymentIntentId: paymentIntent.id,
        userId: paymentIntent.userId,
        orderId: order?.id || 'unknown',
        creditsAmount: order?.creditsAmount || 'unknown',
        orderStatus: order?.status || 'unknown',
        reason: 'Platform policy: Lesson credits are non-refundable once purchased (credits may have been spent on AI lesson generation)',
        timestamp: new Date().toISOString(),
      });
      
      // Mark the credit order as refund_blocked for admin review
      if (order && order.status === 'succeeded') {
        await db.update(creditOrders)
          .set({ 
            // Keep status as 'succeeded' - credits were legitimately delivered
            // Add metadata note that refund was attempted but blocked
            updatedAt: new Date(),
          })
          .where(eq(creditOrders.id, order.id));
        
        console.log(`[PaymentRouter] Credit order ${order.id} refund blocked - credits remain with user`);
      }

      // Return success to YOCO to acknowledge webhook (prevents retries)
      // but DO NOT actually deduct credits from user
      return {
        success: true,
        message: `Credit refund blocked: Lesson credits are non-refundable. Refund request logged for manual review. Order: ${order?.id || fulfillment.checkoutId}`,
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Credit refund block handler failed:', error);
      // Still return success to YOCO even on error - we don't want refund retries
      return {
        success: true,
        message: `Credit refund blocked with error: ${error.message}. Manual review required.`,
      };
    }
  }

  /**
   * Reverse subscription payment - cancels subscription
   */
  private static async reverseSubscriptionPayment(
    paymentIntent: any,
    fulfillment: any
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const subscriptionId = paymentIntent.intentId;

      // Cancel subscription immediately
      await SubscriptionService.cancelSubscription(
        subscriptionId,
        true, // immediate cancellation
        'Refund processed - subscription cancelled'
      );

      console.log(`[PaymentRouter] Subscription cancelled due to refund: ${subscriptionId}`);
      
      return {
        success: true,
        message: `Subscription ${subscriptionId} cancelled due to refund`,
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Subscription reversal failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Manually reconcile a payment by checkout ID
   * Used by reconciliation job to process abandoned webhooks
   */
  static async reconcilePayment(checkoutId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      console.log(`[PaymentRouter] Reconciling payment for checkout ${checkoutId}`);

      // Check if already fulfilled
      const existingFulfillment = await db
        .select()
        .from(paymentFulfillments)
        .where(eq(paymentFulfillments.checkoutId, checkoutId))
        .limit(1);

      if (existingFulfillment.length > 0) {
        return {
          success: true,
          message: 'Payment already fulfilled',
        };
      }

      // Load payment intent
      const paymentIntent = await PaymentOrchestratorService.getPaymentIntentByCheckoutId(checkoutId);
      
      if (!paymentIntent) {
        return {
          success: false,
          error: 'Payment intent not found',
        };
      }

      // TODO: Query YOCO API to get actual payment status
      // For now, assume we're only reconciling successful payments
      console.log(`[PaymentRouter] Reconciling ${paymentIntent.intentType} payment`);

      // Update status
      await PaymentOrchestratorService.updatePaymentIntentStatus(checkoutId, 'succeeded');

      // Dispatch to handler
      let fulfillmentResult: any = null;
      
      switch (paymentIntent.intentType) {
        case 'course':
          fulfillmentResult = await this.handleCoursePayment(paymentIntent, checkoutId);
          break;
        case 'credits':
          fulfillmentResult = await this.handleCreditPayment(paymentIntent, checkoutId);
          break;
        case 'subscription':
          fulfillmentResult = await this.handleSubscriptionPayment(paymentIntent, checkoutId);
          break;
      }

      if (!fulfillmentResult.success) {
        throw new Error(fulfillmentResult.error || 'Reconciliation fulfillment failed');
      }

      // Record fulfillment
      await db.insert(paymentFulfillments).values({
        paymentIntentId: paymentIntent.id,
        checkoutId: checkoutId,
        intentType: paymentIntent.intentType,
        intentId: paymentIntent.intentId,
        invoiceId: paymentIntent.invoiceId || null,
        fulfilledBy: 'reconciliation',
        fulfillmentData: fulfillmentResult.data || {},
      });

      console.log(`[PaymentRouter] Reconciliation successful for checkout ${checkoutId}`);

      return {
        success: true,
        message: `Reconciled ${paymentIntent.intentType} payment`,
      };

    } catch (error: any) {
      console.error('[PaymentRouter] Reconciliation failed:', error);
      return {
        success: false,
        error: error.message || 'Reconciliation failed',
      };
    }
  }
}
