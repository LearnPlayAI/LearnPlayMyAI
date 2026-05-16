import { db } from "../db";
import { paymentIntents, paymentFulfillments } from "@shared/schema";
import { eq, and, or, lt, isNull, sql } from "drizzle-orm";
import { PaymentService } from "./paymentService";
import { PaymentRouter } from "./paymentRouter";
import { PaymentOrchestratorService } from "./paymentOrchestratorService";

/**
 * ReconciliationService - Queries YOCO API for abandoned webhooks
 * 
 * Reconciliation job that:
 * 1. Finds payment intents that may have missed webhooks
 * 2. Queries YOCO API to get current checkout status
 * 3. Replays fulfillment for succeeded checkouts that weren't fulfilled
 * 4. Updates payment intent status using atomic CAS operations
 * 
 * Runs hourly via scheduler to catch webhook failures, network issues, etc.
 */
export class ReconciliationService {
  // Look back 24 hours for potentially abandoned webhooks
  private static readonly LOOKBACK_HOURS = 24;
  
  // Only reconcile intents that haven't received a webhook in this time
  private static readonly STALE_WEBHOOK_MINUTES = 15;

  /**
   * Run reconciliation job - query YOCO for abandoned webhooks
   * Safe to run repeatedly due to idempotent fulfillment tracking
   */
  static async runReconciliation(): Promise<{
    scanned: number;
    reconciled: number;
    failed: number;
    errors: Array<{ checkoutId: string; error: string }>;
  }> {
    console.log('[ReconciliationService] Starting reconciliation job...');

    const results = {
      scanned: 0,
      reconciled: 0,
      failed: 0,
      errors: [] as Array<{ checkoutId: string; error: string }>,
    };

    try {
      // Find payment intents that need reconciliation
      const candidates = await this.findReconciliationCandidates();
      results.scanned = candidates.length;

      if (candidates.length === 0) {
        console.log('[ReconciliationService] No payment intents need reconciliation');
        return results;
      }

      console.log(`[ReconciliationService] Found ${candidates.length} payment intents to reconcile`);

      // Process each candidate
      for (const intent of candidates) {
        try {
          await this.reconcilePaymentIntent(intent);
          results.reconciled++;
        } catch (error: any) {
          console.error(`[ReconciliationService] Failed to reconcile ${intent.checkoutId}:`, error);
          results.failed++;
          results.errors.push({
            checkoutId: intent.checkoutId || 'unknown',
            error: error.message || 'Unknown error',
          });
        }
      }

      console.log('[ReconciliationService] Reconciliation complete:', results);
      return results;
    } catch (error: any) {
      console.error('[ReconciliationService] Reconciliation job failed:', error);
      throw error;
    }
  }

  /**
   * Find payment intents that may have missed webhooks
   * Criteria:
   * - Created in last 24 hours (recent enough to matter)
   * - Status is 'pending' or 'processing' (not terminal)
   * - Has a checkoutId (can be queried)
   * - Either never received webhook OR last webhook > 15 minutes ago
   */
  private static async findReconciliationCandidates() {
    const lookbackCutoff = new Date(Date.now() - this.LOOKBACK_HOURS * 60 * 60 * 1000);
    const staleWebhookCutoff = new Date(Date.now() - this.STALE_WEBHOOK_MINUTES * 60 * 1000);

    return await db
      .select()
      .from(paymentIntents)
      .where(
        and(
          // Recent intents only
          sql`${paymentIntents.createdAt} >= ${lookbackCutoff}`,
          // Non-terminal status
          or(
            eq(paymentIntents.status, 'pending'),
            eq(paymentIntents.status, 'processing')
          ),
          // Has checkout ID
          sql`${paymentIntents.checkoutId} IS NOT NULL`,
          // Stale webhook OR no webhook received
          or(
            isNull(paymentIntents.lastWebhookAt),
            lt(paymentIntents.lastWebhookAt, staleWebhookCutoff)
          )
        )
      )
      .orderBy(paymentIntents.createdAt);
  }

  /**
   * Reconcile a single payment intent by querying YOCO API
   * 
   * Flow:
   * 1. Query YOCO API for current checkout status
   * 2. If succeeded and not fulfilled, replay fulfillment
   * 3. Update payment intent status using CAS
   * 4. Mark as reconciled
   */
  private static async reconcilePaymentIntent(intent: typeof paymentIntents.$inferSelect) {
    if (!intent.checkoutId) {
      throw new Error('Payment intent missing checkoutId');
    }

    console.log(`[ReconciliationService] Reconciling ${intent.checkoutId} (intent ${intent.id})`);

    // Step 1: Query YOCO API for current status
    let yocoStatus: 'succeeded' | 'failed' | 'cancelled' | 'pending' | 'processing' | 'started';
    try {
      const verification = await PaymentService.verifyYocoPayment(intent.checkoutId);
      yocoStatus = verification.status as any;
      
      console.log(`[ReconciliationService] YOCO status for ${intent.checkoutId}: ${yocoStatus}`);
    } catch (error: any) {
      // If YOCO returns 404, the checkout doesn't exist or expired
      if (error.message?.includes('not found')) {
        console.warn(`[ReconciliationService] Checkout ${intent.checkoutId} not found in YOCO - marking as failed`);
        await PaymentOrchestratorService.updatePaymentIntentStatus(intent.id, 'failed');
        return;
      }
      throw error;
    }

    // Handle "started" status - checkout was initiated but user hasn't completed payment yet
    // This is a normal state, just update the intent status and skip fulfillment
    if (yocoStatus === 'started') {
      if (intent.status !== 'started') {
        await PaymentOrchestratorService.updatePaymentIntentStatus(intent.id, 'started', intent.status as any);
        console.log(`[ReconciliationService] Updated ${intent.checkoutId} to started status - awaiting user payment`);
      }
      // Mark as reconciled but don't process further
      await db
        .update(paymentIntents)
        .set({
          reconciledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, intent.id));
      return;
    }

    // Step 2: Check if already fulfilled
    const [fulfillment] = await db
      .select()
      .from(paymentFulfillments)
      .where(eq(paymentFulfillments.checkoutId, intent.checkoutId))
      .limit(1);

    // Step 3: Replay fulfillment if needed
    if (yocoStatus === 'succeeded' && !fulfillment) {
      console.log(`[ReconciliationService] Replaying fulfillment for ${intent.checkoutId}`);
      
      // Simulate webhook payload for PaymentRouter
      // Use unique ID to avoid deduplication with real webhooks
      const webhookPayload = {
        id: `reconciliation-${intent.checkoutId}-${Date.now()}`, // Unique webhook event ID
        type: 'payment.succeeded' as const,
        createdDate: new Date().toISOString(),
        payload: {
          id: intent.checkoutId,
          amount: parseFloat(intent.amount) * 100, // Convert to cents
          currency: intent.currency,
          status: 'succeeded',
          metadata: intent.metadata || {},
        },
      };

      await PaymentRouter.handleWebhook(webhookPayload);
      console.log(`[ReconciliationService] Fulfillment replayed for ${intent.checkoutId}`);
    }

    // Step 4: Update payment intent status using CAS
    if (yocoStatus !== intent.status) {
      const updateResult = await PaymentOrchestratorService.updatePaymentIntentStatus(
        intent.id,
        yocoStatus,
        intent.status as any // Expected prior status for CAS
      );

      if (updateResult.updated) {
        console.log(`[ReconciliationService] Updated ${intent.checkoutId} status: ${intent.status} → ${yocoStatus}`);
      } else {
        console.warn(`[ReconciliationService] CAS failed for ${intent.checkoutId} - status already changed`);
      }
    }

    // Step 5: Mark as reconciled
    await db
      .update(paymentIntents)
      .set({
        reconciledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent.id));

    console.log(`[ReconciliationService] Reconciled ${intent.checkoutId} successfully`);
  }
}
