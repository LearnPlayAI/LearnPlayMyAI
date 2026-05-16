import { db } from "../db";
import {
  subscriptions,
  elearningSubscriptionPlans,
  subscriptionEvents,
  organizations,
  users,
} from "@shared/schema";
import { eq, and, or, lte, gte, desc, sql } from "drizzle-orm";
import { addMonths, addYears, addDays, startOfDay, endOfDay, format } from "date-fns";
import { MailerSendService } from "./mailerSendService";

export interface CreateSubscriptionParams {
  planId: string;
  targetType: 'organization' | 'user';
  targetId: string;
  startDate?: Date;
  autoRenew?: boolean;
}

export interface UpdateSubscriptionStatusParams {
  subscriptionId: string;
  newStatus: 'active' | 'grace' | 'past_due' | 'suspended' | 'cancelled';
  reason?: string;
  initiatedBy?: string;
}

export interface SubscriptionDetails {
  subscription: any;
  plan: any;
  target: any;
  upcomingInvoices: any[];
  pastInvoices: any[];
  events: any[];
}

export class SubscriptionService {
  /**
   * Create a new subscription
   * Sets up billing periods and creates initial subscription event
   */
  static async createSubscription(params: CreateSubscriptionParams): Promise<string> {
    const {
      planId,
      targetType,
      targetId,
      startDate = new Date(),
      autoRenew = true,
    } = params;

    try {
      // Fetch plan details
      const [plan] = await db
        .select()
        .from(elearningSubscriptionPlans)
        .where(eq(elearningSubscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
        throw new Error(`Subscription plan not found: ${planId}`);
      }

      if (!plan.isActive) {
        throw new Error(`Subscription plan is not active: ${planId}`);
      }

      // Calculate billing periods
      const currentPeriodStart = startOfDay(startDate);
      const currentPeriodEnd = plan.interval === 'annual'
        ? addYears(currentPeriodStart, 1)
        : addMonths(currentPeriodStart, 1);
      
      const nextBillingDate = currentPeriodEnd;

      // Create subscription
      const [subscription] = await db
        .insert(subscriptions)
        .values({
          planId,
          targetType,
          targetId,
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd: endOfDay(currentPeriodEnd),
          nextBillingDate,
          autoRenew,
        })
        .returning();

      console.log(`[SubscriptionService] Created subscription ${subscription.id} for ${targetType} ${targetId}`);

      // Create subscription event
      await this.logSubscriptionEvent(
        subscription.id,
        'created',
        null,
        'active',
        { planId, autoRenew },
        null
      );

      return subscription.id;

    } catch (error: any) {
      console.error('[SubscriptionService] Error creating subscription:', error);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  /**
   * Update subscription status with event logging
   */
  static async updateSubscriptionStatus(params: UpdateSubscriptionStatusParams): Promise<void> {
    const { subscriptionId, newStatus, reason, initiatedBy } = params;

    try {
      // Fetch current subscription
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      const previousStatus = subscription.status;

      if (previousStatus === newStatus) {
        console.log(`[SubscriptionService] Subscription ${subscriptionId} already in status ${newStatus}`);
        return;
      }

      // Update subscription
      const updateData: any = {
        status: newStatus,
        updatedAt: new Date(),
      };

      // Special handling for different statuses
      if (newStatus === 'cancelled') {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = reason || null;
        updateData.autoRenew = false;
      } else if (newStatus === 'grace') {
        // Set grace period deadline (7 days from now)
        updateData.graceUntil = addDays(new Date(), 7);
      } else if (newStatus === 'suspended') {
        updateData.autoRenew = false; // Disable auto-renew when suspended
      } else if (newStatus === 'active') {
        updateData.graceUntil = null; // Clear grace period
      }

      await db
        .update(subscriptions)
        .set(updateData)
        .where(eq(subscriptions.id, subscriptionId));

      console.log(`[SubscriptionService] Updated subscription ${subscriptionId} from ${previousStatus} to ${newStatus}`);

      // Log subscription event
      await this.logSubscriptionEvent(
        subscriptionId,
        this.getEventTypeFromStatusChange(previousStatus, newStatus),
        previousStatus,
        newStatus,
        { reason },
        initiatedBy || null
      );

    } catch (error: any) {
      console.error('[SubscriptionService] Error updating subscription status:', error);
      throw new Error(`Failed to update subscription status: ${error.message}`);
    }
  }

  /**
   * Renew subscription (advance billing period)
   */
  static async renewSubscription(subscriptionId: string): Promise<void> {
    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      const [plan] = await db
        .select()
        .from(elearningSubscriptionPlans)
        .where(eq(elearningSubscriptionPlans.id, subscription.planId))
        .limit(1);

      if (!plan) {
        throw new Error(`Subscription plan not found: ${subscription.planId}`);
      }

      // Calculate new billing period
      const newPeriodStart = subscription.currentPeriodEnd;
      const newPeriodEnd = plan.interval === 'annual'
        ? addYears(newPeriodStart, 1)
        : addMonths(newPeriodStart, 1);

      await db
        .update(subscriptions)
        .set({
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: endOfDay(newPeriodEnd),
          nextBillingDate: newPeriodEnd,
          status: 'active',
          graceUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscriptionId));

      console.log(`[SubscriptionService] Renewed subscription ${subscriptionId}`);

      // Log renewal event
      await this.logSubscriptionEvent(
        subscriptionId,
        'renewed',
        subscription.status,
        'active',
        {
          previousPeriodEnd: subscription.currentPeriodEnd,
          newPeriodEnd,
        },
        null
      );

    } catch (error: any) {
      console.error('[SubscriptionService] Error renewing subscription:', error);
      throw new Error(`Failed to renew subscription: ${error.message}`);
    }
  }

  /**
   * Cancel subscription (immediate or at period end)
   */
  static async cancelSubscription(
    subscriptionId: string,
    cancelImmediately: boolean,
    reason?: string,
    initiatedBy?: string,
    source: 'user' | 'admin' | 'system' | 'payment_failed' = 'system'
  ): Promise<void> {
    try {
      if (cancelImmediately) {
        // Get subscription details before updating for email
        const [subscription] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, subscriptionId))
          .limit(1);

        await this.updateSubscriptionStatus({
          subscriptionId,
          newStatus: 'cancelled',
          reason,
          initiatedBy,
        });
        
        await db
          .update(subscriptions)
          .set({
            cancellationSource: source,
            processedBy: initiatedBy || null,
            reactivationEligible: false,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscriptionId));

        // Send immediate cancellation email notification
        if (subscription) {
          try {
            const [plan] = await db
              .select()
              .from(elearningSubscriptionPlans)
              .where(eq(elearningSubscriptionPlans.id, subscription.planId))
              .limit(1);

            let userEmail: string | null = null;
            let userName: string | null = null;

            if (subscription.targetType === 'user') {
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, subscription.targetId))
                .limit(1);
              if (user) {
                userEmail = user.email;
                userName = user.gamerName || user.email;
              }
            } else if (subscription.targetType === 'organization') {
              const [org] = await db
                .select()
                .from(organizations)
                .where(eq(organizations.id, subscription.targetId))
                .limit(1);
              if (org && org.billingEmail) {
                userEmail = org.billingEmail;
                userName = org.name;
              }
            }

            if (userEmail && userName && plan) {
              await MailerSendService.sendSubscriptionCancellationEmail({
                to: userEmail,
                userName,
                planName: plan.name,
                effectiveDate: format(new Date(), 'MMMM d, yyyy'),
                type: 'immediate',
                ...(subscription.targetType === 'organization' ? { organizationId: subscription.targetId } : {}),
              });
            }
          } catch (emailError: any) {
            console.error('[SubscriptionService] Failed to send immediate cancellation email:', emailError);
          }
        }
      } else {
        await this.requestCancellationAtPeriodEnd(subscriptionId, reason, initiatedBy, source);
      }

    } catch (error: any) {
      console.error('[SubscriptionService] Error cancelling subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Request cancellation at period end (user-initiated)
   * Sets cancelAtPeriodEnd flag and schedules seat release
   */
  static async requestCancellationAtPeriodEnd(
    subscriptionId: string,
    reason?: string,
    initiatedBy?: string,
    source: 'user' | 'admin' | 'system' | 'payment_failed' = 'user'
  ): Promise<{ success: boolean; effectiveDate?: Date; error?: string }> {
    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return { success: false, error: 'Subscription not found' };
      }

      if (subscription.status === 'cancelled') {
        return { success: false, error: 'Subscription is already cancelled' };
      }

      if (subscription.cancelAtPeriodEnd) {
        return { success: false, error: 'Cancellation is already scheduled' };
      }

      const effectiveDate = subscription.currentPeriodEnd;
      const scheduledSeatReleaseAt = effectiveDate;

      await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: true,
          cancelRequestedAt: new Date(),
          cancelReason: reason || null,
          cancellationSource: source,
          processedBy: initiatedBy || null,
          scheduledSeatReleaseAt,
          autoRenew: false,
          reactivationEligible: true,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscriptionId));

      await this.logSubscriptionEvent(
        subscriptionId,
        'scheduled_cancellation',
        subscription.status,
        null,
        { 
          reason, 
          cancelAtPeriodEnd: true,
          effectiveDate: effectiveDate?.toISOString(),
          scheduledSeatReleaseAt: scheduledSeatReleaseAt?.toISOString(),
          source 
        },
        initiatedBy || null
      );

      console.log(`[SubscriptionService] Scheduled cancellation for subscription ${subscriptionId} at ${effectiveDate}`);
      
      // Send scheduled cancellation email notification
      try {
        const [plan] = await db
          .select()
          .from(elearningSubscriptionPlans)
          .where(eq(elearningSubscriptionPlans.id, subscription.planId))
          .limit(1);

        let userEmail: string | null = null;
        let userName: string | null = null;

        if (subscription.targetType === 'user') {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, subscription.targetId))
            .limit(1);
          if (user) {
            userEmail = user.email;
            userName = user.gamerName || user.email;
          }
        } else if (subscription.targetType === 'organization') {
          const [org] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, subscription.targetId))
            .limit(1);
          if (org && org.billingEmail) {
            userEmail = org.billingEmail;
            userName = org.name;
          }
        }

        if (userEmail && userName && plan) {
          await MailerSendService.sendSubscriptionCancellationEmail({
            to: userEmail,
            userName,
            planName: plan.name,
            effectiveDate: effectiveDate ? format(effectiveDate, 'MMMM d, yyyy') : 'End of billing period',
            type: 'scheduled',
            ...(subscription.targetType === 'organization' ? { organizationId: subscription.targetId } : {}),
          });
        }
      } catch (emailError: any) {
        console.error('[SubscriptionService] Failed to send scheduled cancellation email:', emailError);
      }
      
      return { success: true, effectiveDate: effectiveDate || undefined };

    } catch (error: any) {
      console.error('[SubscriptionService] Error scheduling cancellation:', error);
      return { success: false, error: error.message || 'Failed to schedule cancellation' };
    }
  }

  /**
   * Undo pending cancellation (reactivate before period end)
   */
  static async undoCancellation(
    subscriptionId: string,
    initiatedBy?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return { success: false, error: 'Subscription not found' };
      }

      if (!subscription.cancelAtPeriodEnd) {
        return { success: false, error: 'No pending cancellation to undo' };
      }

      if (subscription.status === 'cancelled') {
        return { success: false, error: 'Subscription is already cancelled and cannot be undone' };
      }

      if (!subscription.reactivationEligible) {
        return { success: false, error: 'This subscription is not eligible for reactivation' };
      }

      const now = new Date();
      if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
        return { success: false, error: 'Cancellation period has already passed' };
      }

      await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: false,
          cancelRequestedAt: null,
          cancelReason: null,
          cancellationSource: null,
          processedBy: null,
          scheduledSeatReleaseAt: null,
          autoRenew: true,
          reactivatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscriptionId));

      await this.logSubscriptionEvent(
        subscriptionId,
        'cancellation_undone',
        subscription.status,
        subscription.status,
        { 
          originalCancelRequestedAt: subscription.cancelRequestedAt?.toISOString(),
          reactivatedBy: initiatedBy
        },
        initiatedBy || null
      );

      console.log(`[SubscriptionService] Cancellation undone for subscription ${subscriptionId}`);
      
      // Send reactivation email notification
      try {
        const [plan] = await db
          .select()
          .from(elearningSubscriptionPlans)
          .where(eq(elearningSubscriptionPlans.id, subscription.planId))
          .limit(1);

        let userEmail: string | null = null;
        let userName: string | null = null;

        if (subscription.targetType === 'user') {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, subscription.targetId))
            .limit(1);
          if (user) {
            userEmail = user.email;
            userName = user.gamerName || user.email;
          }
        } else if (subscription.targetType === 'organization') {
          const [org] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, subscription.targetId))
            .limit(1);
          if (org && org.billingEmail) {
            userEmail = org.billingEmail;
            userName = org.name;
          }
        }

        if (userEmail && userName && plan) {
          await MailerSendService.sendSubscriptionCancellationEmail({
            to: userEmail,
            userName,
            planName: plan.name,
            effectiveDate: format(new Date(), 'MMMM d, yyyy'),
            type: 'reactivated',
            ...(subscription.targetType === 'organization' ? { organizationId: subscription.targetId } : {}),
          });
        }
      } catch (emailError: any) {
        console.error('[SubscriptionService] Failed to send reactivation email:', emailError);
      }
      
      return { success: true };

    } catch (error: any) {
      console.error('[SubscriptionService] Error undoing cancellation:', error);
      return { success: false, error: error.message || 'Failed to undo cancellation' };
    }
  }

  /**
   * Process scheduled cancellations (for billing scheduler job)
   * Cancels subscriptions where period has ended and cancelAtPeriodEnd is true
   */
  static async processScheduledCancellations(): Promise<{ processed: number; errors: number }> {
    try {
      const now = new Date();

      const subscriptionsToCancel = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.cancelAtPeriodEnd, true),
            lte(subscriptions.currentPeriodEnd!, now),
            or(
              eq(subscriptions.status, 'active'),
              eq(subscriptions.status, 'grace'),
              eq(subscriptions.status, 'past_due')
            )
          )
        );

      console.log(`[SubscriptionService] Processing ${subscriptionsToCancel.length} scheduled cancellations`);

      let processed = 0;
      let errors = 0;

      for (const subscription of subscriptionsToCancel) {
        try {
          await db
            .update(subscriptions)
            .set({
              status: 'cancelled',
              cancelledAt: new Date(),
              reactivationEligible: false,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, subscription.id));

          await this.logSubscriptionEvent(
            subscription.id,
            'cancelled',
            subscription.status,
            'cancelled',
            { 
              reason: subscription.cancelReason || 'Scheduled cancellation at period end',
              source: subscription.cancellationSource || 'system',
              periodEnd: subscription.currentPeriodEnd?.toISOString()
            },
            null
          );

          console.log(`[SubscriptionService] Processed scheduled cancellation for ${subscription.id}`);
          processed++;

        } catch (err: any) {
          console.error(`[SubscriptionService] Error cancelling subscription ${subscription.id}:`, err);
          errors++;
        }
      }

      return { processed, errors };

    } catch (error: any) {
      console.error('[SubscriptionService] Error processing scheduled cancellations:', error);
      return { processed: 0, errors: 0 };
    }
  }

  /**
   * Get subscriptions with pending cancellations
   */
  static async getSubscriptionsWithPendingCancellations(): Promise<any[]> {
    try {
      const pendingCancellations = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.cancelAtPeriodEnd, true),
            or(
              eq(subscriptions.status, 'active'),
              eq(subscriptions.status, 'grace')
            )
          )
        )
        .orderBy(subscriptions.currentPeriodEnd);

      return pendingCancellations;

    } catch (error: any) {
      console.error('[SubscriptionService] Error fetching pending cancellations:', error);
      return [];
    }
  }

  /**
   * Reactivate a cancelled or suspended subscription
   */
  static async reactivateSubscription(subscriptionId: string, initiatedBy?: string): Promise<void> {
    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      if (subscription.status !== 'cancelled' && subscription.status !== 'suspended') {
        throw new Error(`Can only reactivate cancelled or suspended subscriptions`);
      }

      await this.updateSubscriptionStatus({
        subscriptionId,
        newStatus: 'active',
        reason: 'Reactivated',
        initiatedBy,
      });

      // Re-enable auto-renew
      await db
        .update(subscriptions)
        .set({
          autoRenew: true,
          cancelledAt: null,
          cancelReason: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscriptionId));

      console.log(`[SubscriptionService] Reactivated subscription ${subscriptionId}`);

      await this.logSubscriptionEvent(
        subscriptionId,
        'reactivated',
        subscription.status,
        'active',
        {},
        initiatedBy || null
      );

    } catch (error: any) {
      console.error('[SubscriptionService] Error reactivating subscription:', error);
      throw new Error(`Failed to reactivate subscription: ${error.message}`);
    }
  }

  /**
   * Get subscriptions due for billing
   * Returns subscriptions where nextBillingDate is today or earlier
   */
  static async getSubscriptionsDueForBilling(): Promise<any[]> {
    try {
      const today = endOfDay(new Date());

      const dueSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            lte(subscriptions.nextBillingDate, today),
            or(
              eq(subscriptions.status, 'active'),
              eq(subscriptions.status, 'grace'),
              eq(subscriptions.status, 'past_due')
            ),
            eq(subscriptions.autoRenew, true)
          )
        );

      console.log(`[SubscriptionService] Found ${dueSubscriptions.length} subscriptions due for billing`);

      return dueSubscriptions;

    } catch (error: any) {
      console.error('[SubscriptionService] Error fetching subscriptions due for billing:', error);
      return [];
    }
  }

  /**
   * Get subscriptions in grace period nearing suspension
   */
  static async getSubscriptionsNearingSuspension(): Promise<any[]> {
    try {
      const today = new Date();
      const in24Hours = addDays(today, 1);

      const nearingSuspension = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, 'grace'),
            lte(subscriptions.graceUntil!, in24Hours),
            gte(subscriptions.graceUntil!, today)
          )
        );

      console.log(`[SubscriptionService] Found ${nearingSuspension.length} subscriptions nearing suspension`);

      return nearingSuspension;

    } catch (error: any) {
      console.error('[SubscriptionService] Error fetching subscriptions nearing suspension:', error);
      return [];
    }
  }

  /**
   * Get subscription details with related data
   */
  static async getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails | null> {
    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        return null;
      }

      // Fetch plan
      const [plan] = await db
        .select()
        .from(elearningSubscriptionPlans)
        .where(eq(elearningSubscriptionPlans.id, subscription.planId))
        .limit(1);

      // Fetch target (organization or user)
      let target = null;
      if (subscription.targetType === 'organization') {
        [target] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, subscription.targetId))
          .limit(1);
      } else {
        [target] = await db
          .select()
          .from(users)
          .where(eq(users.id, subscription.targetId))
          .limit(1);
      }

      // Fetch recent events
      const events = await db
        .select()
        .from(subscriptionEvents)
        .where(eq(subscriptionEvents.subscriptionId, subscriptionId))
        .orderBy(desc(subscriptionEvents.createdAt))
        .limit(10);

      return {
        subscription,
        plan: plan || null,
        target: target || null,
        upcomingInvoices: [], // Populated by InvoiceService
        pastInvoices: [], // Populated by InvoiceService
        events,
      };

    } catch (error: any) {
      console.error('[SubscriptionService] Error fetching subscription details:', error);
      return null;
    }
  }

  /**
   * Log subscription event for audit trail
   */
  private static async logSubscriptionEvent(
    subscriptionId: string,
    eventType: string,
    previousStatus: any,
    newStatus: any,
    metadata: Record<string, any>,
    initiatedBy: string | null
  ): Promise<void> {
    try {
      await db
        .insert(subscriptionEvents)
        .values({
          subscriptionId,
          eventType,
          previousStatus,
          newStatus,
          metadata,
          initiatedBy,
        });

    } catch (error: any) {
      console.error('[SubscriptionService] Error logging subscription event:', error);
      // Non-critical - don't throw
    }
  }

  /**
   * Determine event type from status change
   */
  private static getEventTypeFromStatusChange(
    previousStatus: string,
    newStatus: string
  ): string {
    if (newStatus === 'cancelled') return 'cancelled';
    if (newStatus === 'suspended') return 'suspended';
    if (newStatus === 'grace') return 'grace_period_started';
    if (previousStatus === 'cancelled' && newStatus === 'active') return 'reactivated';
    if (previousStatus === 'suspended' && newStatus === 'active') return 'reactivated';
    if (previousStatus === 'past_due' && newStatus === 'active') return 'payment_received';
    
    return 'status_changed';
  }

  /**
   * Get subscription statistics (for analytics dashboard)
   */
  static async getSubscriptionStats(): Promise<{
    total: number;
    active: number;
    grace: number;
    pastDue: number;
    suspended: number;
    cancelled: number;
  }> {
    try {
      const stats = await db
        .select({
          status: subscriptions.status,
          count: sql<number>`count(*)`,
        })
        .from(subscriptions)
        .groupBy(subscriptions.status);

      const result = {
        total: 0,
        active: 0,
        grace: 0,
        pastDue: 0,
        suspended: 0,
        cancelled: 0,
      };

      stats.forEach((stat) => {
        const count = Number(stat.count);
        result.total += count;
        
        switch (stat.status) {
          case 'active':
            result.active = count;
            break;
          case 'grace':
            result.grace = count;
            break;
          case 'past_due':
            result.pastDue = count;
            break;
          case 'suspended':
            result.suspended = count;
            break;
          case 'cancelled':
            result.cancelled = count;
            break;
        }
      });

      return result;

    } catch (error: any) {
      console.error('[SubscriptionService] Error fetching subscription stats:', error);
      return {
        total: 0,
        active: 0,
        grace: 0,
        pastDue: 0,
        suspended: 0,
        cancelled: 0,
      };
    }
  }
}
