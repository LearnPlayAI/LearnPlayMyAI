import { MailerSendService, SendEmailParams } from './mailerSendService';
import { InvoiceService } from './invoiceService';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Email Template Helpers
 * 
 * High-level functions for sending specific types of emails with proper
 * template variables and PDF attachments.
 */

export interface SendInvoiceReminderParams {
  invoiceId: string;
  recipientEmail: string;
  recipientName: string;
}

export interface SendPaymentSuccessParams {
  invoiceId?: string;
  receiptId?: string; // For credit purchases
  recipientEmail: string;
  recipientName: string;
  amount: string;
  currency: string;
  paymentType: 'subscription' | 'credit';
}

export interface SendSubscriptionStatusChangeParams {
  subscriptionId: string;
  recipientEmail: string;
  recipientName: string;
  newStatus: string;
  reason?: string;
}

export interface SendCreditConfirmationParams {
  receiptId: string;
  recipientEmail: string;
  recipientName: string;
  creditsAmount: number;
  totalPaid: string;
  currency: string;
}

export class EmailTemplates {
  /**
   * Send invoice renewal reminder
   * Attaches invoice PDF if available
   */
  static async sendInvoiceReminder(params: SendInvoiceReminderParams): Promise<void> {
    const { invoiceId, recipientEmail, recipientName } = params;

    // Get invoice details
    const [invoice] = await db
      .select()
      .from(schema.subscriptionInvoices)
      .where(eq(schema.subscriptionInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    // Prepare template variables
    const templateVariables: Record<string, string> = {
      invoice_id: invoice.id,
      amount_due: invoice.amountDue,
      currency: invoice.currency,
      due_date: invoice.dueAt.toLocaleDateString(),
      billing_period_start: invoice.billingPeriodStart?.toLocaleDateString() || 'N/A',
      billing_period_end: invoice.billingPeriodEnd?.toLocaleDateString() || 'N/A',
    };

    // Prepare PDF attachment if available
    const attachments = [];
    if (invoice.pdfStoragePath) {
      try {
        const pdfBuffer = await InvoiceService.getInvoicePDF(invoice.id);
        if (pdfBuffer) {
          attachments.push({
            filename: `invoice-${invoice.id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }
      } catch (error) {
        console.error(`[EmailTemplates] Failed to retrieve invoice PDF from object storage`, error);
      }
    }

    // Send email
    const result = await MailerSendService.sendEmail({
      recipientEmail,
      recipientName,
      subject: `Invoice ${invoice.id} - Payment Reminder`,
      templateType: 'renewal_reminder',
      templateVariables,
      attachments,
      subscriptionId: invoice.subscriptionId || undefined,
      invoiceId: invoice.id,
    });

    if (!result.success) {
      throw new Error(`Failed to send invoice reminder: ${result.error || 'Unknown error'}`);
    }

    console.log(`[EmailTemplates] Sent invoice reminder for invoice ${invoice.id} to ${recipientEmail}`);
  }

  /**
   * Send payment success confirmation
   * Attaches invoice or receipt PDF
   */
  static async sendPaymentSuccess(params: SendPaymentSuccessParams): Promise<void> {
    const { invoiceId, receiptId, recipientEmail, recipientName, amount, currency, paymentType } = params;

    const templateVariables: Record<string, string> = {
      amount,
      currency,
      payment_type: paymentType,
      payment_date: new Date().toLocaleDateString(),
    };

    // Prepare PDF attachment
    const attachments = [];
    let pdfPath: string | null = null;

    if (paymentType === 'subscription' && invoiceId) {
      // Get invoice PDF
      const [invoice] = await db
        .select()
        .from(schema.subscriptionInvoices)
        .where(eq(schema.subscriptionInvoices.id, invoiceId))
        .limit(1);

      if (invoice?.pdfStoragePath) {
        pdfPath = invoice.pdfStoragePath;
        templateVariables.invoice_id = invoice.id;
      }
    } else if (paymentType === 'credit' && receiptId) {
      // Get receipt PDF from credit order
      const [order] = await db
        .select()
        .from(schema.creditOrders)
        .where(eq(schema.creditOrders.id, receiptId))
        .limit(1);

      if (order?.receiptPdfPath) {
        pdfPath = order.receiptPdfPath;
        templateVariables.credits_amount = order.creditsAmount.toString();
      }
    }

    // Load PDF if available
    if (pdfPath) {
      try {
        let pdfBuffer: Buffer | null = null;
        
        if (paymentType === 'subscription' && invoiceId) {
          pdfBuffer = await InvoiceService.getInvoicePDF(invoiceId);
        } else if (paymentType === 'credit' && receiptId) {
          pdfBuffer = await InvoiceService.getReceiptPDF(receiptId);
        }
        
        if (pdfBuffer) {
          const filename = paymentType === 'subscription' 
            ? `invoice-${templateVariables.invoice_id}.pdf`
            : `receipt-${receiptId}.pdf`;
          
          attachments.push({
            filename,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }
      } catch (error) {
        console.error(`[EmailTemplates] Failed to retrieve PDF from object storage`, error);
      }
    }

    // Send email
    await MailerSendService.sendEmail({
      recipientEmail,
      recipientName,
      subject: 'Payment Successful - Thank You!',
      templateType: 'payment_success',
      templateVariables,
      attachments,
      invoiceId: invoiceId || undefined,
    });

    console.log(`[EmailTemplates] Sent payment success email to ${recipientEmail}`);
  }

  /**
   * Send subscription status change notification
   */
  static async sendSubscriptionStatusChange(params: SendSubscriptionStatusChangeParams): Promise<void> {
    const { subscriptionId, recipientEmail, recipientName, newStatus, reason } = params;

    // Get subscription details
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // Get plan details
    const [plan] = await db
      .select()
      .from(schema.elearningSubscriptionPlans)
      .where(eq(schema.elearningSubscriptionPlans.id, subscription.planId))
      .limit(1);

    const templateVariables = {
      subscription_status: newStatus,
      plan_name: plan?.name || 'N/A',
      reason: reason || 'No reason provided',
      next_billing_date: subscription.nextBillingDate?.toLocaleDateString() || 'N/A',
    };

    // Determine template type based on new status
    let templateType: SendEmailParams['templateType'] = 'payment_failed';
    let subject = 'Subscription Status Update';

    if (newStatus === 'cancelled') {
      templateType = 'suspension';
      subject = 'Subscription Cancelled';
    } else if (newStatus === 'suspended') {
      templateType = 'suspension';
      subject = 'Subscription Suspended';
    } else if (newStatus === 'past_due') {
      templateType = 'grace_period';
      subject = 'Payment Overdue - Grace Period Active';
    }

    await MailerSendService.sendEmail({
      recipientEmail,
      recipientName,
      subject,
      templateType,
      templateVariables,
      subscriptionId: subscription.id,
    });

    console.log(`[EmailTemplates] Sent subscription status change email (${newStatus}) to ${recipientEmail}`);
  }

  /**
   * Send credit purchase confirmation
   * Attaches receipt PDF
   */
  static async sendCreditConfirmation(params: SendCreditConfirmationParams): Promise<void> {
    const { receiptId, recipientEmail, recipientName, creditsAmount, totalPaid, currency } = params;

    // Get credit order details
    const [order] = await db
      .select()
      .from(schema.creditOrders)
      .where(eq(schema.creditOrders.id, receiptId))
      .limit(1);

    if (!order) {
      throw new Error(`Credit order ${receiptId} not found`);
    }

    const templateVariables = {
      credits_amount: creditsAmount.toString(),
      total_paid: totalPaid,
      currency,
      purchase_date: new Date().toLocaleDateString(),
    };

    // Prepare receipt PDF attachment
    const attachments = [];
    if (order.receiptPdfPath) {
      try {
        const pdfBuffer = await InvoiceService.getReceiptPDF(receiptId);
        if (pdfBuffer) {
          attachments.push({
            filename: `receipt-${receiptId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }
      } catch (error) {
        console.error(`[EmailTemplates] Failed to retrieve receipt PDF from object storage`, error);
      }
    }

    await MailerSendService.sendEmail({
      recipientEmail,
      recipientName,
      subject: 'Credit Purchase Confirmed - Receipt Attached',
      templateType: 'credit_confirmation',
      templateVariables,
      attachments,
    });

    console.log(`[EmailTemplates] Sent credit confirmation email to ${recipientEmail}`);
  }
}
