// @ts-nocheck
import { db } from '../db';
import { emailLogs, subscriptionInvoices, subscriptions, users, organizations } from '@shared/schema';
import { eq, and, lt, or, isNull } from 'drizzle-orm';
import { MailerSendService } from './mailerSendService';
import { EmailTemplates } from './emailTemplates';
import { InvoiceService } from './invoiceService';

/**
 * Email Scheduler Service
 * 
 * Handles scheduled email tasks:
 * - Retry failed emails
 * - Send invoice reminders
 */

export class EmailSchedulerService {
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_BACKOFF_MINUTES = 30;

  /**
   * Retry failed emails
   * Retries emails with status "failed" that have been attempted less than MAX_RETRY_ATTEMPTS
   */
  static async retryFailedEmails(): Promise<{
    retried: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }> {
    console.log('[EmailScheduler] Starting failed email retry job...');

    try {
      const backoffTime = new Date(Date.now() - this.RETRY_BACKOFF_MINUTES * 60 * 1000);

      const failedEmails = await db
        .select()
        .from(emailLogs)
        .where(
          and(
            eq(emailLogs.status, 'failed'),
            or(
              isNull(emailLogs.sentAt),
              lt(emailLogs.sentAt, backoffTime)
            )
          )
        )
        .limit(50);

      if (failedEmails.length === 0) {
        console.log('[EmailScheduler] No failed emails to retry');
        return { retried: 0, succeeded: 0, failed: 0, skipped: 0 };
      }

      console.log(`[EmailScheduler] Found ${failedEmails.length} failed emails to evaluate for retry`);

      let succeeded = 0;
      let failed = 0;
      let skipped = 0;

      for (const email of failedEmails) {
        try {
          const attemptCount = email.retryCount ?? 0;
          
          if (attemptCount >= this.MAX_RETRY_ATTEMPTS) {
            console.log(`[EmailScheduler] Skipping email ${email.id} - max retry attempts (${this.MAX_RETRY_ATTEMPTS}) reached`);
            skipped++;
            continue;
          }

          await db
            .update(emailLogs)
            .set({
              status: 'queued',
              errorMessage: null,
            })
            .where(eq(emailLogs.id, email.id));

          const attachments = [];
          if (email.invoiceId) {
            try {
              const pdfBuffer = await InvoiceService.getInvoicePDF(email.invoiceId);
              if (pdfBuffer) {
                attachments.push({
                  filename: `invoice-${email.invoiceId}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                });
              }
            } catch (error) {
              console.error(`[EmailScheduler] Failed to retrieve invoice PDF from object storage:`, error);
            }
          }

          const result = await MailerSendService.sendEmail({
            recipientEmail: email.recipientEmail,
            recipientName: email.recipientName || email.recipientEmail,
            subject: email.subject,
            templateType: email.templateType as any,
            attachments,
            subscriptionId: email.subscriptionId || undefined,
            invoiceId: email.invoiceId || undefined,
          });

          if (result.success) {
            succeeded++;
            console.log(`[EmailScheduler] Successfully retried email ${email.id} (attempt ${attemptCount + 1})`);
          } else {
            failed++;
            await db
              .update(emailLogs)
              .set({
                status: 'failed',
                errorMessage: `Attempt ${attemptCount + 1}/${this.MAX_RETRY_ATTEMPTS}: ${result.error}`,
                retryCount: attemptCount + 1,
              })
              .where(eq(emailLogs.id, email.id));
            console.error(`[EmailScheduler] Failed to retry email ${email.id} (attempt ${attemptCount + 1}): ${result.error}`);
          }
        } catch (error: any) {
          failed++;
          console.error(`[EmailScheduler] Error retrying email ${email.id}:`, error);
        }
      }

      console.log(`[EmailScheduler] Retry job complete: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped (max attempts)`);

      return {
        retried: failedEmails.length - skipped,
        succeeded,
        failed,
        skipped,
      };
    } catch (error: any) {
      console.error('[EmailScheduler] Error in retry failed emails job:', error);
      return { retried: 0, succeeded: 0, failed: 0, skipped: 0 };
    }
  }

  /**
   * Send invoice reminders
   * Sends reminders for invoices that are due soon (within 3 days)
   * and haven't had a reminder sent yet
   */
  static async sendInvoiceReminders(): Promise<{
    sent: number;
    failed: number;
  }> {
    console.log('[EmailScheduler] Starting invoice reminder job...');

    try {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const upcomingInvoices = await db
        .select()
        .from(subscriptionInvoices)
        .where(
          and(
            eq(subscriptionInvoices.status, 'pending'),
            lt(subscriptionInvoices.dueAt, threeDaysFromNow),
            eq(subscriptionInvoices.reminderSent, false)
          )
        )
        .limit(100);

      if (upcomingInvoices.length === 0) {
        console.log('[EmailScheduler] No invoices requiring reminders');
        return { sent: 0, failed: 0 };
      }

      console.log(`[EmailScheduler] Found ${upcomingInvoices.length} invoices requiring reminders`);

      let sent = 0;
      let failed = 0;

      for (const invoice of upcomingInvoices) {
        try {
          const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, invoice.subscriptionId))
            .limit(1);

          if (!subscription) {
            console.error(`[EmailScheduler] Subscription not found for invoice ${invoice.id}`);
            failed++;
            continue;
          }

          let recipientEmail: string | null = null;
          let recipientName: string | null = null;

          if (subscription.targetType === 'user') {
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, subscription.targetId))
              .limit(1);

            if (user) {
              recipientEmail = user.email;
              recipientName = user.gamerName;
            }
          } else if (subscription.targetType === 'organization') {
            const [org] = await db
              .select()
              .from(organizations)
              .where(eq(organizations.id, subscription.targetId))
              .limit(1);

            if (org) {
              recipientEmail = org.billingEmail || null;
              recipientName = org.name;

              if (!recipientEmail) {
                const [admin] = await db
                  .select({ email: users.email, gamerName: users.gamerName })
                  .from(users)
                  .where(
                    and(
                      eq(users.organizationId, org.id),
                      eq(users.isOrgAdmin, true)
                    )
                  )
                  .limit(1);

                if (admin) {
                  recipientEmail = admin.email;
                  recipientName = admin.gamerName;
                }
              }
            }
          }

          if (!recipientEmail) {
            console.error(`[EmailScheduler] No recipient email found for invoice ${invoice.id}`);
            failed++;
            continue;
          }

          await EmailTemplates.sendInvoiceReminder({
            invoiceId: invoice.id,
            recipientEmail,
            recipientName: recipientName || recipientEmail
          });

          await db
            .update(subscriptionInvoices)
            .set({ reminderSent: true })
            .where(eq(subscriptionInvoices.id, invoice.id));

          sent++;
          console.log(`[EmailScheduler] Sent reminder for invoice ${invoice.id} to ${recipientEmail}`);
        } catch (error: any) {
          failed++;
          console.error(`[EmailScheduler] Error sending reminder for invoice ${invoice.id}:`, error);
        }
      }

      console.log(`[EmailScheduler] Invoice reminder job complete: ${sent} sent, ${failed} failed`);

      return {
        sent,
        failed,
      };
    } catch (error: any) {
      console.error('[EmailScheduler] Error in invoice reminders job:', error);
      return { sent: 0, failed: 0 };
    }
  }
}
