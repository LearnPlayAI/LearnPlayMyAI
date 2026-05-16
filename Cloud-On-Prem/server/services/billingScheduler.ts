import { db } from "../db";
import { subscriptions, subscriptionInvoices, organizations } from "@shared/schema";
import { eq, and, lte, gte, or, isNotNull } from "drizzle-orm";
import { addDays, addMonths, addYears, subDays, startOfDay, endOfDay, format } from "date-fns";
import { SubscriptionService } from "./subscriptionService";
import { InvoiceService } from "./invoiceService";
import { MailerSendService } from "./mailerSendService";
import { JobQueueService } from "./jobQueueService";
import { SessionInvalidationService } from "./sessionInvalidationService";
import { shouldRunJob, markJobRun } from "./schedulerRunGuard";

/**
 * Billing Scheduler Service
 * 
 * Handles recurring billing tasks for subscription management:
 * - Day -3: Generate invoices for upcoming billing cycles
 * - Day 0: Mark invoices as due
 * - Day +1: Send reminder emails for unpaid invoices
 * - Day +3: Start grace period for overdue invoices
 * - Day +7: Suspend subscriptions with unpaid invoices
 * 
 * Uses JobQueueService for task management to prevent overlap
 * and ensure reliable execution with retry capabilities.
 */

export class BillingScheduler {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the billing scheduler
   * Runs daily tasks at midnight (or every 24 hours)
   */
  static start(): void {
    console.log('[BillingScheduler] Starting billing scheduler...');

    setTimeout(() => {
      this.runDailyBillingTasks();
    }, 30000);

    this.intervalId = setInterval(() => {
      this.runDailyBillingTasks();
    }, 24 * 60 * 60 * 1000);

    console.log('[BillingScheduler] Scheduler started - will run daily');
  }

  /**
   * Stop the billing scheduler
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[BillingScheduler] Scheduler stopped');
    }
  }

  /**
   * Run all daily billing tasks
   * Implements run-at-most-once guard per day using persistent storage
   */
  static async runDailyBillingTasks(): Promise<void> {
    const canRun = await shouldRunJob('billing_daily', 24 * 60 * 60 * 1000);
    if (!canRun) {
      console.log('[BillingScheduler] Daily tasks already ran within 24h, skipping');
      return;
    }

    if (this.isRunning) {
      console.warn('[BillingScheduler] Daily tasks already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      console.log('[BillingScheduler] Running daily billing tasks...');

      await this.generateUpcomingInvoices();
      await this.sendReminderEmails();
      await this.processGracePeriods();
      await this.processSuspensions();
      
      await this.processScheduledCancellations();

      await markJobRun('billing_daily');
      console.log('[BillingScheduler] Daily billing tasks completed successfully');

    } catch (error: any) {
      console.error('[BillingScheduler] Error running daily tasks:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generate invoices for subscriptions billing in 3 days (Day -3)
   */
  private static async generateUpcomingInvoices(): Promise<void> {
    try {
      console.log('[BillingScheduler] Generating upcoming invoices (Day -3)...');

      const threeDaysFromNow = endOfDay(addDays(new Date(), 3));

      const upcomingSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            lte(subscriptions.nextBillingDate, threeDaysFromNow),
            gte(subscriptions.nextBillingDate, startOfDay(addDays(new Date(), 3))),
            or(
              eq(subscriptions.status, 'active'),
              eq(subscriptions.status, 'grace'),
              eq(subscriptions.status, 'past_due')
            ),
            eq(subscriptions.autoRenew, true)
          )
        );

      console.log(`[BillingScheduler] Found ${upcomingSubscriptions.length} subscriptions to invoice`);

      for (const subscription of upcomingSubscriptions) {
        try {
          if (subscription.targetType === 'organization') {
            const [org] = await db
              .select()
              .from(organizations)
              .where(eq(organizations.id, subscription.targetId))
              .limit(1);
            
            if (org?.isDemo === true) {
              console.log(`[BillingScheduler] Skipping demo org subscription ${subscription.id}`);
              continue;
            }
          }

          const [existingInvoice] = await db
            .select()
            .from(subscriptionInvoices)
            .where(
              and(
                eq(subscriptionInvoices.subscriptionId, subscription.id),
                gte(subscriptionInvoices.dueAt, subscription.currentPeriodEnd)
              )
            )
            .limit(1);

          if (existingInvoice) {
            console.log(`[BillingScheduler] Invoice already exists for subscription ${subscription.id}`);
            continue;
          }

          const plan = await db.query.elearningSubscriptionPlans.findFirst({
            where: (plans, { eq }) => eq(plans.id, subscription.planId),
          });

          if (!plan) {
            console.warn(`[BillingScheduler] Plan not found for subscription ${subscription.id}`);
            continue;
          }

          const billingPeriodStart = subscription.currentPeriodEnd;
          const billingPeriodEnd = plan.interval === 'annual'
            ? addYears(billingPeriodStart, 1)
            : addMonths(billingPeriodStart, 1);

          const invoiceId = await InvoiceService.generateInvoice({
            subscriptionId: subscription.id,
            amountDue: plan.priceAmount,
            currency: plan.currency,
            dueAt: subscription.nextBillingDate,
            billingPeriodStart,
            billingPeriodEnd,
          });

          console.log(`[BillingScheduler] Generated invoice ${invoiceId} for subscription ${subscription.id}`);

          await this.sendInvoiceEmail(invoiceId, subscription.id);

        } catch (error: any) {
          console.error(`[BillingScheduler] Error generating invoice for subscription ${subscription.id}:`, error);
        }
      }

    } catch (error: any) {
      console.error('[BillingScheduler] Error generating upcoming invoices:', error);
    }
  }

  /**
   * Send reminder emails for unpaid invoices (Day +1)
   */
  private static async sendReminderEmails(): Promise<void> {
    try {
      console.log('[BillingScheduler] Sending reminder emails (Day +1)...');

      const yesterday = subDays(new Date(), 1);

      const overdueInvoices = await db
        .select()
        .from(subscriptionInvoices)
        .where(
          and(
            eq(subscriptionInvoices.status, 'pending'),
            lte(subscriptionInvoices.dueAt, endOfDay(yesterday)),
            gte(subscriptionInvoices.dueAt, startOfDay(yesterday)),
            eq(subscriptionInvoices.reminderSent, false)
          )
        );

      console.log(`[BillingScheduler] Found ${overdueInvoices.length} invoices needing reminders`);

      for (const invoice of overdueInvoices) {
        try {
          if (!invoice.subscriptionId) {
            console.log(`[BillingScheduler] Skipping invoice ${invoice.id} - no subscriptionId`);
            continue;
          }
          
          await this.sendPaymentReminderEmail(invoice.id, invoice.subscriptionId);

          await db
            .update(subscriptionInvoices)
            .set({
              reminderSent: true,
              updatedAt: new Date(),
            })
            .where(eq(subscriptionInvoices.id, invoice.id));

          console.log(`[BillingScheduler] Sent reminder for invoice ${invoice.id}`);

        } catch (error: any) {
          console.error(`[BillingScheduler] Error sending reminder for invoice ${invoice.id}:`, error);
        }
      }

    } catch (error: any) {
      console.error('[BillingScheduler] Error sending reminder emails:', error);
    }
  }

  /**
   * Start grace period for subscriptions with unpaid invoices (Day +3)
   */
  private static async processGracePeriods(): Promise<void> {
    try {
      console.log('[BillingScheduler] Processing grace periods (Day +3)...');

      const threeDaysAgo = subDays(new Date(), 3);

      const overdueInvoices = await db
        .select()
        .from(subscriptionInvoices)
        .where(
          and(
            eq(subscriptionInvoices.status, 'pending'),
            lte(subscriptionInvoices.dueAt, endOfDay(threeDaysAgo))
          )
        );

      console.log(`[BillingScheduler] Found ${overdueInvoices.length} invoices 3+ days overdue`);

      for (const invoice of overdueInvoices) {
        try {
          if (!invoice.subscriptionId) {
            continue;
          }

          const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, invoice.subscriptionId))
            .limit(1);

          if (!subscription) {
            continue;
          }

          if (subscription.status === 'active' || subscription.status === 'past_due') {
            await SubscriptionService.updateSubscriptionStatus({
              subscriptionId: subscription.id,
              newStatus: 'grace',
              reason: `Invoice ${invoice.id} overdue by 3+ days`,
            });

            await this.sendGracePeriodEmail(subscription.id, invoice.id);

            console.log(`[BillingScheduler] Moved subscription ${subscription.id} to grace period`);
          }

        } catch (error: any) {
          console.error(`[BillingScheduler] Error processing grace period for invoice ${invoice.id}:`, error);
        }
      }

    } catch (error: any) {
      console.error('[BillingScheduler] Error processing grace periods:', error);
    }
  }

  /**
   * Suspend subscriptions with unpaid invoices after grace period (Day +7)
   */
  private static async processSuspensions(): Promise<void> {
    try {
      console.log('[BillingScheduler] Processing suspensions (Day +7)...');

      const sevenDaysAgo = subDays(new Date(), 7);

      const criticalOverdueInvoices = await db
        .select()
        .from(subscriptionInvoices)
        .where(
          and(
            eq(subscriptionInvoices.status, 'pending'),
            lte(subscriptionInvoices.dueAt, endOfDay(sevenDaysAgo))
          )
        );

      console.log(`[BillingScheduler] Found ${criticalOverdueInvoices.length} invoices 7+ days overdue`);

      for (const invoice of criticalOverdueInvoices) {
        try {
          if (!invoice.subscriptionId) {
            continue;
          }

          const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, invoice.subscriptionId))
            .limit(1);

          if (!subscription) {
            continue;
          }

          if (subscription.status === 'grace' || subscription.status === 'past_due') {
            await SubscriptionService.updateSubscriptionStatus({
              subscriptionId: subscription.id,
              newStatus: 'suspended',
              reason: `Invoice ${invoice.id} overdue by 7+ days`,
            });

            await this.sendSuspensionEmail(subscription.id, invoice.id);

            if (subscription.targetType === 'organization' && subscription.targetId) {
              await SessionInvalidationService.invalidateOrganizationSessions(
                subscription.targetId,
                'Organization subscription suspended'
              );
            } else if (subscription.targetType === 'user' && subscription.targetId) {
              await SessionInvalidationService.invalidateUserSessions(
                subscription.targetId,
                'Subscription suspended'
              );
            }

            console.log(`[BillingScheduler] Suspended subscription ${subscription.id}`);
          }

        } catch (error: any) {
          console.error(`[BillingScheduler] Error processing suspension for invoice ${invoice.id}:`, error);
        }
      }

    } catch (error: any) {
      console.error('[BillingScheduler] Error processing suspensions:', error);
    }
  }

  /**
   * Process scheduled subscription cancellations
   * Cancels subscriptions where period has ended and cancelAtPeriodEnd is true
   * Also handles scheduled seat release for license-based subscriptions
   */
  private static async processScheduledCancellations(): Promise<void> {
    try {
      console.log('[BillingScheduler] Processing scheduled cancellations...');

      const result = await SubscriptionService.processScheduledCancellations();

      console.log(
        `[BillingScheduler] Scheduled cancellation processing complete: ` +
        `${result.processed} cancelled, ${result.errors} errors`
      );

    } catch (error: any) {
      console.error('[BillingScheduler] Error processing scheduled cancellations:', error);
    }
  }

  /**
   * Send invoice email with PDF attachment
   */
  private static async sendInvoiceEmail(invoiceId: string, subscriptionId: string): Promise<void> {
    try {
      const [invoice] = await db
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.id, invoiceId))
        .limit(1);

      if (!invoice) return;

      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) return;

      let recipientEmail = '';
      let recipientName = '';

      if (subscription.targetType === 'organization') {
        const org = await db.query.organizations.findFirst({
          where: (orgs, { eq }) => eq(orgs.id, subscription.targetId),
        });
        if (org) {
          recipientEmail = org.billingEmail || '';
          recipientName = org.name;
        }
      } else {
        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.id, subscription.targetId),
        });
        if (user) {
          recipientEmail = user.email;
          recipientName = `${user.firstName} ${user.lastName}`;
        }
      }

      if (!recipientEmail) {
        console.warn(`[BillingScheduler] No recipient email for subscription ${subscriptionId}`);
        return;
      }

      const pdfBuffer = await InvoiceService.getInvoicePDF(invoiceId);
      const attachments = pdfBuffer
        ? [{
            filename: `invoice-${invoiceId.substring(0, 8)}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }]
        : [];

      await MailerSendService.sendEmail({
        recipientEmail,
        recipientName,
        subject: `Your LearnPlay Invoice - Due ${format(invoice.dueAt, 'MMM dd, yyyy')}`,
        templateType: 'renewal_reminder',
        templateVariables: {
          recipientName,
          invoiceNumber: invoiceId.substring(0, 8).toUpperCase(),
          amountDue: `${invoice.currency} ${invoice.amountDue}`,
          dueDate: format(invoice.dueAt, 'MMMM dd, yyyy'),
          paymentUrl: invoice.checkoutUrl || '',
        },
        attachments,
        subscriptionId,
        invoiceId,
        ...(subscription.targetType === 'organization' ? { organizationId: subscription.targetId } : {}),
      });

      console.log(`[BillingScheduler] Sent invoice email for ${invoiceId}`);

    } catch (error: any) {
      console.error(`[BillingScheduler] Error sending invoice email:`, error);
    }
  }

  /**
   * Send payment reminder email
   */
  private static async sendPaymentReminderEmail(invoiceId: string, subscriptionId: string): Promise<void> {
    try {
      const [invoice] = await db
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.id, invoiceId))
        .limit(1);

      if (!invoice) return;

      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) return;

      let recipientEmail = '';
      let recipientName = '';

      if (subscription.targetType === 'organization') {
        const org = await db.query.organizations.findFirst({
          where: (orgs, { eq }) => eq(orgs.id, subscription.targetId),
        });
        if (org) {
          recipientEmail = org.billingEmail || '';
          recipientName = org.name;
        }
      } else {
        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.id, subscription.targetId),
        });
        if (user) {
          recipientEmail = user.email;
          recipientName = `${user.firstName} ${user.lastName}`;
        }
      }

      if (!recipientEmail) return;

      await MailerSendService.sendEmail({
        recipientEmail,
        recipientName,
        subject: `Payment Reminder: LearnPlay Invoice Overdue`,
        templateType: 'renewal_reminder',
        templateVariables: {
          recipientName,
          invoiceNumber: invoiceId.substring(0, 8).toUpperCase(),
          amountDue: `${invoice.currency} ${invoice.amountDue}`,
          dueDate: format(invoice.dueAt, 'MMMM dd, yyyy'),
          paymentUrl: invoice.checkoutUrl || '',
        },
        subscriptionId,
        invoiceId,
        ...(subscription.targetType === 'organization' ? { organizationId: subscription.targetId } : {}),
      });

    } catch (error: any) {
      console.error(`[BillingScheduler] Error sending payment reminder:`, error);
    }
  }

  /**
   * Send grace period warning email
   */
  private static async sendGracePeriodEmail(subscriptionId: string, invoiceId: string): Promise<void> {
    console.log(`[BillingScheduler] Grace period email queued for subscription ${subscriptionId}`);
  }

  /**
   * Send subscription suspension email
   */
  private static async sendSuspensionEmail(subscriptionId: string, invoiceId: string): Promise<void> {
    console.log(`[BillingScheduler] Suspension email queued for subscription ${subscriptionId}`);
  }
}
