import { db } from "../db";
import { creditOrders, organizations, creditPurchasePackages, users, userOrganizationRoles } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { InvoiceService } from "./invoiceService";
import { MailerSendService } from "./mailerSendService";
import { EmailTemplates } from "./emailTemplates";
import { PostFulfillmentJobService } from "./postFulfillmentJobService";
import { isAsyncReceiptEmailEnabled } from "../config/paymentFeatureFlags";
import { UnifiedCreditService, DuplicateTransactionError } from "./unifiedCreditService";
import { OrganizationCreditService, DuplicateOrgTransactionError } from "./organizationCreditService";

/**
 * Credit Order Service
 * 
 * Handles fulfillment of credit package purchases:
 * - Add credits to user's allocation (credits belong to USERS, not organizations)
 * - Generate PDF receipt
 * - Send confirmation email
 * - Mark order as fulfilled
 * - Log credit transactions for audit trail
 */
export class CreditOrderService {
  
  /**
   * Fulfill a credit order after successful payment
   * Idempotent - safe to call multiple times for same order
   * 
   * RACE CONDITION FIX: Accepts optional paymentIntentId for fallback lookup
   * when checkoutId lookup fails (webhook can arrive before checkoutId is stored).
   * Self-heals by updating checkoutId when found via fallback.
   * 
   * PHASE 2 OPTIMIZATION: Accepts optional preResolvedContext to avoid redundant
   * database lookups during fulfillment. The context is already available in the
   * paymentIntent record, so passing it eliminates extra queries.
   * 
   * @param checkoutId - YOCO checkout ID (primary lookup)
   * @param paymentIntentId - Optional payment intent ID for fallback lookup
   * @param preResolvedContext - Optional pre-resolved user/org context from paymentIntent
   */
  static async fulfillOrder(
    checkoutId: string, 
    paymentIntentId?: string,
    preResolvedContext?: {
      userId?: string;
      organizationId?: string | null;
      metadata?: any;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    creditsAdded?: number;
    receiptPdfPath?: string;
  }> {
    try {
      // Primary lookup: Find credit order by checkoutId
      let [order] = await db
        .select()
        .from(creditOrders)
        .where(eq(creditOrders.checkoutId, checkoutId))
        .limit(1);

      // Fallback lookup: If not found and paymentIntentId provided, lookup by paymentIntentId
      // This handles the race condition where webhook arrives before checkoutId is stored
      let foundViaFallback = false;
      if (!order && paymentIntentId) {
        console.log(`[CreditOrderService] Primary lookup failed for checkoutId ${checkoutId}, attempting fallback via paymentIntentId ${paymentIntentId}`);
        
        // Use ORDER BY createdAt DESC to get most recent order if multiple exist
        // Also validate that the order is in pending status to avoid fulfilling wrong order
        const fallbackOrders = await db
          .select()
          .from(creditOrders)
          .where(and(
            eq(creditOrders.paymentIntentId, paymentIntentId),
            eq(creditOrders.status, 'pending')
          ))
          .orderBy(desc(creditOrders.createdAt))
          .limit(1);
        
        if (fallbackOrders.length > 0) {
          order = fallbackOrders[0];
          foundViaFallback = true;
          console.log(`[CreditOrderService] Found order ${order.id} via paymentIntentId fallback`);
          
          // Self-heal: Update the order with the checkoutId for future lookups
          await db.update(creditOrders)
            .set({ 
              checkoutId: checkoutId,
              updatedAt: new Date() 
            })
            .where(eq(creditOrders.id, order.id));
          
          console.log(`[CreditOrderService] Self-healed: Updated order ${order.id} with checkoutId ${checkoutId}`);
        }
      }

      if (!order) {
        console.error(`[CreditOrderService] Credit order not found - checkoutId: ${checkoutId}, paymentIntentId: ${paymentIntentId || 'not provided'}`);
        return {
          success: false,
          error: 'Credit order not found',
        };
      }

      // Get package details (needed for both new fulfillment and receipt retry)
      const [pkg] = await db
        .select()
        .from(creditPurchasePackages)
        .where(eq(creditPurchasePackages.id, order.packageId))
        .limit(1);

      if (!pkg) {
        throw new Error('Credit package not found');
      }

      // Check if already fulfilled (idempotency for credits)
      if (order.status === 'succeeded' && order.fulfillmentAt) {
        console.log(`[CreditOrderService] Order ${order.id} already fulfilled - checking if receipt needs retry`);
        
        // Even if fulfilled, try to generate receipt if missing (non-blocking retry)
        if (!order.receiptPdfPath) {
          const organizationId = order.organizationId;
          if (organizationId) {
            await this.attemptReceiptGeneration(order, pkg, organizationId);
          }
        }
        
        // Re-fetch order to get updated receipt path
        const [updatedOrder] = await db
          .select()
          .from(creditOrders)
          .where(eq(creditOrders.id, order.id))
          .limit(1);
        
        return {
          success: true,
          creditsAdded: order.creditsAmount,
          receiptPdfPath: updatedOrder?.receiptPdfPath || undefined,
        };
      }

      // Credits ALWAYS belong to users, NEVER to organizations
      // Phase 2: Use pre-resolved context if available, otherwise derive from order or user's org membership
      let organizationId = order.organizationId;
      
      // Try to use pre-resolved context first (fastest path)
      if (!organizationId && preResolvedContext?.organizationId) {
        organizationId = preResolvedContext.organizationId;
        console.log(`[CreditOrderService] Using pre-resolved organizationId: ${organizationId}`);
        
        // Update order with the resolved organizationId for future idempotency
        await db.update(creditOrders)
          .set({ organizationId, updatedAt: new Date() })
          .where(eq(creditOrders.id, order.id));
      }
      
      // Fallback: Derive organizationId from user's org membership if not stored (legacy orders)
      if (!organizationId) {
        console.warn(`[CreditOrderService] Order ${order.id} missing organizationId - deriving from user's org membership`);
        
        const [userRole] = await db
          .select({ organizationId: userOrganizationRoles.organizationId })
          .from(userOrganizationRoles)
          .where(eq(userOrganizationRoles.userId, order.purchaserId))
          .limit(1);
        
        if (!userRole?.organizationId) {
          throw new Error('User must belong to an organization to purchase lesson credits');
        }
        
        organizationId = userRole.organizationId;
        
        // Update the order with the derived organizationId for future idempotency
        await db.update(creditOrders)
          .set({ organizationId, updatedAt: new Date() })
          .where(eq(creditOrders.id, order.id));
        
        console.log(`[CreditOrderService] Updated order ${order.id} with organizationId: ${organizationId}`);
      }

      // CRITICAL: Add credits FIRST
      // Uses atomic transactions with SELECT...FOR UPDATE for concurrency safety
      // Idempotent via correlationId = orderId
      // ORGANIZATION WALLET SUPPORT: Check purchaseTarget to determine where credits go
      let newBalance: number;
      const isOrgPurchase = order.purchaseTarget === 'organization' && organizationId;
      
      try {
        if (isOrgPurchase) {
          // Add credits to organization wallet
          const creditResult = await OrganizationCreditService.addCredits({
            organizationId: organizationId!,
            actorUserId: order.purchaserId,
            amount: order.creditsAmount,
            transactionType: 'purchase',
            activityType: 'purchase',
            correlationId: order.id, // Use orderId for idempotency
            description: `Purchased ${pkg.name} (${order.creditsAmount} credits)`,
            activityId: order.id,
            metadata: {
              orderId: order.id,
              packageId: order.packageId,
              packageName: pkg.name,
              checkoutId: order.checkoutId || undefined,
              purchasedBy: order.purchaserId,
            },
          });
          
          newBalance = creditResult.newBalance;
          console.log(`[CreditOrderService] Added ${order.creditsAmount} credits to org ${organizationId} wallet via OrganizationCreditService (new balance: ${newBalance})`);
        } else {
          // Add credits to user's personal wallet (default behavior)
          const creditResult = await UnifiedCreditService.addCredits({
            userId: order.purchaserId,
            amount: order.creditsAmount,
            type: 'purchase',
            correlationId: order.id, // Use orderId for idempotency
            description: `Purchased ${pkg.name} (${order.creditsAmount} credits)`,
            organizationId: organizationId || undefined,
            metadata: {
              orderId: order.id,
              packageId: order.packageId,
              packageName: pkg.name,
              checkoutId: order.checkoutId || undefined,
            },
          });
          
          newBalance = creditResult.newBalance;
          console.log(`[CreditOrderService] Added ${order.creditsAmount} credits to user ${order.purchaserId} via UnifiedCreditService (new balance: ${newBalance})`);
        }
      } catch (error) {
        if (error instanceof DuplicateTransactionError || error instanceof DuplicateOrgTransactionError) {
          // Credits already added - this is fine for idempotency
          console.log(`[CreditOrderService] Credits already added for order ${order.id} (idempotent)`);
          if (isOrgPurchase) {
            newBalance = await OrganizationCreditService.getBalance(organizationId!);
          } else {
            newBalance = await UnifiedCreditService.getBalance(order.purchaserId);
          }
        } else {
          throw error;
        }
      }

      // Mark order as fulfilled FIRST - credits are already added at this point
      await db
        .update(creditOrders)
        .set({
          status: 'succeeded',
          fulfillmentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(creditOrders.id, order.id));

      console.log(`[CreditOrderService] Order ${order.id} marked as fulfilled with ${order.creditsAmount} credits`);

      // AFTER fulfillment: Handle receipt/email generation
      // Receipt generation failure should NEVER prevent credits from being added
      let receiptPdfPath: string | undefined;
      
      // Check if async processing is enabled (Phase 1a optimization)
      if (isAsyncReceiptEmailEnabled()) {
        // ASYNC PATH: Enqueue background job for receipt and email
        // This returns immediately, allowing faster webhook response
        try {
          // Fetch purchaser and org info for job metadata (fast parallel lookups)
          const [purchaser, org] = await Promise.all([
            db.select().from(users).where(eq(users.id, order.purchaserId)).limit(1).then(r => r[0]),
            organizationId ? db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) }) : null
          ]);

          const purchaserName = purchaser?.firstName && purchaser?.lastName 
            ? `${purchaser.firstName} ${purchaser.lastName}` 
            : purchaser?.gamerName || 'Customer';

          await PostFulfillmentJobService.enqueueReceiptAndEmailJob({
            orderId: order.id,
            purchaserId: order.purchaserId,
            organizationId: organizationId,
            packageId: order.packageId,
            packageName: pkg.name,
            creditsAmount: order.creditsAmount,
            amount: order.amount,
            currency: order.currency,
            purchaserName,
            purchaserEmail: purchaser?.email || undefined,
            organizationName: org?.name || undefined,
          });

          console.log(`[CreditOrderService] ⚡ Async: Enqueued receipt/email job for order ${order.id}`);
        } catch (jobError: any) {
          // Job creation failure is non-blocking - credits are already added
          console.error(`[CreditOrderService] Failed to enqueue receipt job (non-blocking): ${jobError.message}`);
        }
      } else {
        // SYNC PATH: Generate receipt and send email synchronously (rollback mode)
        try {
          const receiptResult = await InvoiceService.generateStandaloneReceipt({
            orderId: order.id,
            purchaserId: order.purchaserId,
            organizationId: organizationId,
            packageName: pkg.name,
            creditsAmount: order.creditsAmount,
            amount: order.amount,
            currency: order.currency,
            paidAt: new Date(),
          });

          if (receiptResult.success && receiptResult.pdfPath) {
            receiptPdfPath = receiptResult.pdfPath;
            await db
              .update(creditOrders)
              .set({ receiptPdfPath, updatedAt: new Date() })
              .where(eq(creditOrders.id, order.id));
            console.log(`[CreditOrderService] Receipt PDF generated: ${receiptPdfPath}`);
          } else {
            console.warn(`[CreditOrderService] Receipt generation failed (non-blocking): ${receiptResult.error}`);
          }
        } catch (receiptError: any) {
          console.error(`[CreditOrderService] Receipt generation error (non-blocking): ${receiptError.message}`);
        }

        // Send confirmation email (also non-blocking in sync mode)
        try {
          const [purchaser] = await db.select().from(users).where(eq(users.id, order.purchaserId)).limit(1);

          if (purchaser?.email) {
            const purchaserName = purchaser.firstName && purchaser.lastName 
              ? `${purchaser.firstName} ${purchaser.lastName}` 
              : purchaser.gamerName || 'Customer';

            // Format amount with currency (amount is in cents)
            const formattedAmount = (Number(order.amount) / 100).toFixed(2);

            await EmailTemplates.sendCreditConfirmation({
              receiptId: order.id,
              recipientEmail: purchaser.email,
              recipientName: purchaserName,
              creditsAmount: order.creditsAmount,
              totalPaid: formattedAmount,
              currency: order.currency,
            });
            console.log(`[CreditOrderService] Credit purchase confirmation email sent to ${purchaser.email}`);
          } else {
            console.log(`[CreditOrderService] Credit purchase email skipped - no email address for user ${order.purchaserId}`);
          }
        } catch (emailError: any) {
          console.error(`[CreditOrderService] Email sending error (non-blocking): ${emailError.message}`);
        }
      }

      return {
        success: true,
        creditsAdded: order.creditsAmount,
        receiptPdfPath,
      };

    } catch (error: any) {
      console.error('[CreditOrderService] Order fulfillment failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to fulfill credit order',
      };
    }
  }

  /**
   * Attempt to generate receipt PDF (non-blocking helper)
   * Used for both initial fulfillment and retry on idempotent calls
   */
  private static async attemptReceiptGeneration(
    order: any,
    pkg: any,
    organizationId: string
  ): Promise<string | undefined> {
    try {
      console.log(`[CreditOrderService] Attempting receipt generation for order ${order.id}`);
      
      const receiptResult = await InvoiceService.generateStandaloneReceipt({
        orderId: order.id,
        purchaserId: order.purchaserId,
        organizationId: organizationId,
        packageName: pkg.name,
        creditsAmount: order.creditsAmount,
        amount: order.amount,
        currency: order.currency,
        paidAt: order.fulfillmentAt || new Date(),
      });

      if (receiptResult.success && receiptResult.pdfPath) {
        // Update order with receipt path
        await db
          .update(creditOrders)
          .set({ receiptPdfPath: receiptResult.pdfPath, updatedAt: new Date() })
          .where(eq(creditOrders.id, order.id));
        console.log(`[CreditOrderService] Receipt PDF generated: ${receiptResult.pdfPath}`);
        return receiptResult.pdfPath;
      } else {
        console.warn(`[CreditOrderService] Receipt generation failed (non-blocking): ${receiptResult.error}`);
        return undefined;
      }
    } catch (receiptError: any) {
      // Log but don't throw - this is non-blocking
      console.error(`[CreditOrderService] Receipt generation error (non-blocking): ${receiptError.message}`);
      return undefined;
    }
  }

  /**
   * Generate HTML email body for credit purchase receipt
   */
  private static generateReceiptEmailHtml(params: {
    recipientName: string;
    packageName: string;
    creditsAmount: number;
    amount: string;
    currency: string;
    organizationName: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .summary { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .summary-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .summary-item:last-child { border-bottom: none; }
          .label { font-weight: 600; color: #6b7280; }
          .value { font-weight: 700; color: #111827; }
          .highlight { font-size: 24px; color: #667eea; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">🎉 Credit Purchase Successful!</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${params.recipientName}</strong>,</p>
            <p>Your credit purchase has been processed successfully! Your ${params.organizationName} account has been credited.</p>
            
            <div class="summary">
              <h2 style="margin-top: 0; color: #111827;">Purchase Summary</h2>
              <div class="summary-item">
                <span class="label">Package:</span>
                <span class="value">${params.packageName}</span>
              </div>
              <div class="summary-item">
                <span class="label">Credits Added:</span>
                <span class="value highlight">${params.creditsAmount.toLocaleString()} credits</span>
              </div>
              <div class="summary-item">
                <span class="label">Amount Paid:</span>
                <span class="value">${params.currency} ${parseFloat(params.amount).toFixed(2)}</span>
              </div>
              <div class="summary-item">
                <span class="label">Organization:</span>
                <span class="value">${params.organizationName}</span>
              </div>
            </div>

            <p>Your credits are now available and ready to use for generating AI-powered lessons and quizzes.</p>
            <p>A detailed receipt is attached to this email for your records.</p>
            
            <div class="footer">
              <p>Thank you for choosing LearnPlay!</p>
              <p style="margin-top: 10px; font-size: 12px;">
                Questions? Contact us at <a href="mailto:support@learnplay.co.za">support@learnplay.co.za</a>
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get credit order by checkout ID
   */
  static async getOrderByCheckoutId(checkoutId: string) {
    try {
      const [order] = await db
        .select()
        .from(creditOrders)
        .where(eq(creditOrders.checkoutId, checkoutId))
        .limit(1);
      
      return order || null;
    } catch (error: any) {
      console.error('[CreditOrderService] Failed to fetch order:', error);
      return null;
    }
  }

  /**
   * Get credit order by ID
   */
  static async getOrderById(orderId: string) {
    try {
      const [order] = await db
        .select()
        .from(creditOrders)
        .where(eq(creditOrders.id, orderId))
        .limit(1);
      
      return order || null;
    } catch (error: any) {
      console.error('[CreditOrderService] Failed to fetch order:', error);
      return null;
    }
  }

  /**
   * Reverse a credit order (for refund handling)
   * Deducts credits from user allocation and marks order as refunded
   * Idempotent - safe to call multiple times
   * 
   * RACE CONDITION FIX: Accepts optional paymentIntentId for fallback lookup
   * when checkoutId lookup fails. Self-heals by updating checkoutId when found via fallback.
   * 
   * @param checkoutId - YOCO checkout ID (primary lookup)
   * @param paymentIntentId - Optional payment intent ID for fallback lookup
   */
  static async reverseOrder(checkoutId: string, paymentIntentId?: string): Promise<{
    success: boolean;
    error?: string;
    creditsDeducted?: number;
  }> {
    try {
      // Primary lookup: Find credit order by checkoutId
      let [order] = await db
        .select()
        .from(creditOrders)
        .where(eq(creditOrders.checkoutId, checkoutId))
        .limit(1);

      // Fallback lookup: If not found and paymentIntentId provided, lookup by paymentIntentId
      if (!order && paymentIntentId) {
        console.log(`[CreditOrderService] Refund: Primary lookup failed for checkoutId ${checkoutId}, attempting fallback via paymentIntentId ${paymentIntentId}`);
        
        // For refunds, we look for ANY order that hasn't been refunded yet
        // This includes 'pending' (pre-fulfillment refund) and 'succeeded' (post-fulfillment refund)
        // Exclude 'refunded' and 'cancelled' to maintain idempotency
        const fallbackOrders = await db
          .select()
          .from(creditOrders)
          .where(and(
            eq(creditOrders.paymentIntentId, paymentIntentId),
            sql`${creditOrders.status} NOT IN ('refunded', 'cancelled')`
          ))
          .orderBy(desc(creditOrders.createdAt))
          .limit(1);
        
        if (fallbackOrders.length > 0) {
          order = fallbackOrders[0];
          console.log(`[CreditOrderService] Found order ${order.id} via paymentIntentId fallback for refund`);
          
          // Self-heal: Update the order with the checkoutId for future lookups
          if (!order.checkoutId) {
            await db.update(creditOrders)
              .set({ 
                checkoutId: checkoutId,
                updatedAt: new Date() 
              })
              .where(eq(creditOrders.id, order.id));
            
            console.log(`[CreditOrderService] Self-healed: Updated order ${order.id} with checkoutId ${checkoutId}`);
          }
        }
      }

      if (!order) {
        console.error(`[CreditOrderService] Credit order not found for refund - checkoutId: ${checkoutId}, paymentIntentId: ${paymentIntentId || 'not provided'}`);
        return {
          success: false,
          error: 'Credit order not found',
        };
      }

      // Check if already refunded (idempotency)
      if (order.status === 'refunded') {
        console.log(`[CreditOrderService] Order ${order.id} already refunded`);
        return {
          success: true,
          creditsDeducted: order.creditsAmount,
        };
      }

      // Only reverse fulfilled orders
      if (order.status !== 'succeeded') {
        console.warn(`[CreditOrderService] Cannot reverse order with status: ${order.status}`);
        return {
          success: true,
          creditsDeducted: 0,
        };
      }

      // Use UnifiedCreditService to handle refund
      // The service handles negative balance protection and transaction logging
      try {
        const currentBalance = await UnifiedCreditService.getBalance(order.purchaserId);
        const willHitFloor = currentBalance < order.creditsAmount;
        
        if (willHitFloor) {
          console.warn(
            `[CreditOrderService] Balance floor will be applied: user ${order.purchaserId} has ${currentBalance} credits but refunding ${order.creditsAmount}. ` +
            `Will deduct only ${currentBalance} credits (${order.creditsAmount - currentBalance} credits could not be reclaimed - may have been spent)`
          );
        }

        // Deduct only up to the available balance (floor at 0)
        const amountToDeduct = Math.min(order.creditsAmount, currentBalance);
        
        if (amountToDeduct > 0) {
          await UnifiedCreditService.deductCredits({
            userId: order.purchaserId,
            amount: amountToDeduct,
            type: 'refund',
            correlationId: `refund_${order.id}`, // Unique correlationId for refunds
            description: `Refund for order ${order.id} (${amountToDeduct} credits)`,
            organizationId: order.organizationId || undefined,
            metadata: {
              orderId: order.id,
              packageId: order.packageId,
              checkoutId: order.checkoutId || undefined,
              originalAmount: order.creditsAmount,
              floorApplied: willHitFloor,
            },
          });
          
          console.log(`[CreditOrderService] Deducted ${amountToDeduct} credits from user ${order.purchaserId} via UnifiedCreditService (floor applied: ${willHitFloor})`);
        } else {
          console.log(`[CreditOrderService] No credits to deduct - user ${order.purchaserId} has 0 balance`);
        }
      } catch (error) {
        if (error instanceof DuplicateTransactionError) {
          console.log(`[CreditOrderService] Refund already processed for order ${order.id} (idempotent)`);
        } else {
          console.error(`[CreditOrderService] Failed to deduct credits for refund: ${error}`);
          // Continue to mark order as refunded even if credit deduction fails
        }
      }

      // Mark order as refunded
      await db
        .update(creditOrders)
        .set({
          status: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(creditOrders.id, order.id));

      console.log(`[CreditOrderService] Credit order ${order.id} reversed: ${order.creditsAmount} credits deducted`);

      return {
        success: true,
        creditsDeducted: order.creditsAmount,
      };

    } catch (error: any) {
      console.error('[CreditOrderService] Order reversal failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to reverse credit order',
      };
    }
  }
}
