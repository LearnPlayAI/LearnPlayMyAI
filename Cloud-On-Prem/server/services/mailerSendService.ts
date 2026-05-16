import { db } from "../db";
import { emailLogs, brandingThemes, type BrandingTheme } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import { sendRawEmail, getActiveTransportName } from './emailTransport';
import { getBaseUrl } from '../config/base-url';
import { IntegrationConfigService } from './integrationConfigService';

/**
 * Organization branding settings for emails
 * Includes full theming support with colors, fonts, and branding tokens
 */
export interface OrganizationEmailBranding {
  senderName: string;
  logoUrl: string | null;
  orgName: string;
  supportEmail: string | null;
  supportUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  allowEmailBranding: boolean;
}

/**
 * Default platform branding colors and settings
 */
const DEFAULT_BRANDING_COLORS = {
  primary: '#6b46c1',
  secondary: '#4c1d95',
  accent: '#10b981',
  fontHeading: 'Inter, Arial, sans-serif',
  fontBody: 'Inter, Arial, sans-serif',
};

/**
 * Extract a specific color from branding tokens
 * Token keys follow the pattern: --color-{name} or --{name}
 */
function extractColorFromTokens(tokens: Record<string, string> | null | undefined, colorKey: string, fallback: string): string {
  if (!tokens || typeof tokens !== 'object') return fallback;
  
  const possibleKeys = [
    `--color-${colorKey}`,
    `--${colorKey}`,
    `--${colorKey}-color`,
    colorKey,
  ];
  
  for (const key of possibleKeys) {
    if (tokens[key] && typeof tokens[key] === 'string') {
      return tokens[key];
    }
  }
  
  return fallback;
}

/**
 * Mask email address for safe logging (PII protection)
 * Transforms "user@example.com" to "u***@e***.com"
 */
function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '[INVALID_EMAIL]';
  const parts = email.split('@');
  if (parts.length !== 2) return '[INVALID_EMAIL]';
  const [local, domain] = parts;
  const domainParts = domain.split('.');
  const maskedLocal = local.length > 1 ? local[0] + '***' : '***';
  const maskedDomain = domainParts[0].length > 1 
    ? domainParts[0][0] + '***' + '.' + domainParts.slice(1).join('.')
    : '***.' + domainParts.slice(1).join('.');
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * MailerSend Email Service
 * 
 * Handles all email delivery for subscription billing, invoices, and notifications.
 * Uses MailerSend's dynamic templates and tracks delivery status in emailLogs table.
 * 
 * Integration Settings required:
 * - mailersend.apiKey (required)
 * - mailersend.fromEmail (optional; defaults to noreply@learnplay.co.za)
 * - mailersend.fromName (optional; defaults to LearnPlay)
 *
 * Optional template IDs (configured in MailerSend dashboard, stored in Integration Settings):
 * - mailersend.templateRenewalReminder
 * - mailersend.templatePaymentSuccess
 * - mailersend.templatePaymentFailed
 * - mailersend.templateGracePeriod
 * - mailersend.templateSuspension
 * - mailersend.templateCreditConfirmation
 * - mailersend.templateLicenseConfirmation
 */

export interface SendEmailParams {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  templateType: 'renewal_reminder' | 'payment_success' | 'payment_failed' | 'grace_period' | 'suspension' | 'credit_confirmation' | 'sales_inquiry_notification';
  templateVariables?: Record<string, string>;
  attachments?: EmailAttachment[];
  subscriptionId?: string;
  invoiceId?: string;
  organizationId?: string; // Optional organization ID for branded emails
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Base64 string or Buffer
  contentType?: string;
}

export interface EmailSendResult {
  success: boolean;
  emailLogId: string;
  mailersendId?: string;
  error?: string;
}

export class MailerSendService {
  private static async getFromEmail(): Promise<string> {
    return (await IntegrationConfigService.getSetting<string>('mailersend', 'fromEmail')) || 'noreply@learnplay.co.za';
  }

  private static async getFromName(): Promise<string> {
    return (await IntegrationConfigService.getSetting<string>('mailersend', 'fromName')) || 'LearnPlay';
  }

  /**
   * Get template ID for a given template type
   */
  private static async getTemplateId(templateType: string): Promise<string | null> {
    const templateMap: Record<string, string | undefined> = {
      'renewal_reminder': await IntegrationConfigService.getSetting<string>('mailersend', 'templateRenewalReminder') || undefined,
      'payment_success': await IntegrationConfigService.getSetting<string>('mailersend', 'templatePaymentSuccess') || undefined,
      'payment_failed': await IntegrationConfigService.getSetting<string>('mailersend', 'templatePaymentFailed') || undefined,
      'grace_period': await IntegrationConfigService.getSetting<string>('mailersend', 'templateGracePeriod') || undefined,
      'suspension': await IntegrationConfigService.getSetting<string>('mailersend', 'templateSuspension') || undefined,
      'credit_confirmation': await IntegrationConfigService.getSetting<string>('mailersend', 'templateCreditConfirmation') || undefined,
    };
    
    return templateMap[templateType] || null;
  }

  /**
   * Get organization branding settings for emails
   * Looks up the branding theme for an organization and returns branding settings if enabled
   * Includes full color tokens for email theming
   * 
   * @param organizationId - The organization ID to look up branding for
   * @returns Branding settings if enabled, or default LearnPlay branding if not
   */
  static async getOrganizationBranding(organizationId: string | undefined | null): Promise<OrganizationEmailBranding> {
    const fromName = await this.getFromName();
    const defaultBranding: OrganizationEmailBranding = {
      senderName: fromName,
      logoUrl: null,
      orgName: 'LearnPlay',
      supportEmail: 'support@learnplay.co.za',
      supportUrl: getBaseUrl(),
      primaryColor: DEFAULT_BRANDING_COLORS.primary,
      secondaryColor: DEFAULT_BRANDING_COLORS.secondary,
      accentColor: DEFAULT_BRANDING_COLORS.accent,
      fontHeading: DEFAULT_BRANDING_COLORS.fontHeading,
      fontBody: DEFAULT_BRANDING_COLORS.fontBody,
      allowEmailBranding: false,
    };

    if (!organizationId) {
      return defaultBranding;
    }

    try {
      const [theme] = await db.select().from(brandingThemes).where(
        and(
          eq(brandingThemes.organizationId, organizationId),
          eq(brandingThemes.status, 'active')
        )
      );

      if (!theme || !theme.allowEmailBranding) {
        console.log(`[MailerSend] Organization ${organizationId} has email branding disabled or no theme`);
        return defaultBranding;
      }

      console.log(`[MailerSend] Using organization branding for ${organizationId}: ${theme.orgName}`);
      
      const tokens = theme.tokens as Record<string, string> | null;
      
      return {
        senderName: theme.orgName || defaultBranding.senderName,
        logoUrl: theme.logoUrl || null,
        orgName: theme.orgName || defaultBranding.orgName,
        supportEmail: theme.supportEmail || defaultBranding.supportEmail,
        supportUrl: theme.supportUrl || defaultBranding.supportUrl,
        primaryColor: extractColorFromTokens(tokens, 'primary', DEFAULT_BRANDING_COLORS.primary),
        secondaryColor: extractColorFromTokens(tokens, 'secondary', DEFAULT_BRANDING_COLORS.secondary),
        accentColor: extractColorFromTokens(tokens, 'accent', DEFAULT_BRANDING_COLORS.accent),
        fontHeading: theme.fontHeading || DEFAULT_BRANDING_COLORS.fontHeading,
        fontBody: theme.fontBody || DEFAULT_BRANDING_COLORS.fontBody,
        allowEmailBranding: theme.allowEmailBranding || false,
      };
    } catch (error: any) {
      console.error(`[MailerSend] Error fetching branding for organization ${organizationId}:`, error);
      return defaultBranding;
    }
  }

  /**
   * Generate CSS gradient from branding colors
   */
  static generateBrandedGradient(branding: OrganizationEmailBranding): string {
    return `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`;
  }

  /**
   * Generate email header HTML with optional organization logo and branded colors
   * 
   * @param branding - Organization branding settings
   * @param headerIcon - Emoji icon to display
   * @param headerText - Header text/title
   * @returns HTML string for the email header
   */
  static generateBrandedHeader(
    branding: OrganizationEmailBranding,
    headerIcon: string,
    headerText: string
  ): string {
    const logoHtml = branding.logoUrl 
      ? `<img src="${branding.logoUrl}" alt="${branding.orgName}" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;" /><br/>`
      : '';
    
    const gradient = this.generateBrandedGradient(branding);
    
    return `
      <div class="header" style="background: ${gradient}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; font-family: ${branding.fontHeading};">
        ${logoHtml}
        <h1 style="margin: 0; font-family: ${branding.fontHeading};">${headerIcon} ${headerText}</h1>
      </div>
    `;
  }

  /**
   * Generate email footer HTML with organization branding
   * 
   * @param branding - Organization branding settings
   * @returns HTML string for the email footer
   */
  static generateBrandedFooter(branding: OrganizationEmailBranding): string {
    const supportLink = branding.supportUrl 
      ? `<a href="${branding.supportUrl}" style="color: ${branding.primaryColor}; text-decoration: none;">Visit our website</a> | `
      : '';
    const emailLink = branding.supportEmail
      ? `<a href="mailto:${branding.supportEmail}" style="color: ${branding.primaryColor}; text-decoration: none;">${branding.supportEmail}</a>`
      : '';
    
    return `
      <div class="footer" style="text-align: center; margin-top: 20px; font-size: 12px; color: #666; font-family: ${branding.fontBody};">
        ${(supportLink || emailLink) ? `<p>${supportLink}${emailLink}</p>` : ''}
        <p>© ${new Date().getFullYear()} ${branding.orgName}. All rights reserved.</p>
      </div>
    `;
  }

  /**
   * Generate branded button HTML
   * 
   * @param branding - Organization branding settings  
   * @param text - Button text
   * @param url - Button link URL
   * @returns HTML string for the button
   */
  static generateBrandedButton(branding: OrganizationEmailBranding, text: string, url: string): string {
    return `<a href="${url}" class="button" style="display: inline-block; background: ${branding.primaryColor}; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; font-family: ${branding.fontBody};">${text}</a>`;
  }

  /**
   * Generate complete branded email HTML template
   * 
   * @param branding - Organization branding settings
   * @param headerIcon - Emoji icon for header
   * @param headerText - Header title
   * @param bodyContent - Main email body HTML
   * @returns Complete HTML email string
   */
  static generateBrandedEmail(
    branding: OrganizationEmailBranding,
    headerIcon: string,
    headerText: string,
    bodyContent: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: ${branding.fontBody}; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; font-family: ${branding.fontBody}; }
            .button { display: inline-block; background: ${branding.primaryColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
            .info { background: #dbeafe; border-left: 4px solid ${branding.primaryColor}; padding: 12px; margin: 20px 0; }
            .success { background: #d1fae5; border-left: 4px solid ${branding.accentColor}; padding: 12px; margin: 20px 0; }
            .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
            h1, h2, h3 { font-family: ${branding.fontHeading}; }
            a { color: ${branding.primaryColor}; }
          </style>
        </head>
        <body>
          <div class="container">
            ${this.generateBrandedHeader(branding, headerIcon, headerText)}
            <div class="content">
              ${bodyContent}
            </div>
            ${this.generateBrandedFooter(branding)}
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate fallback HTML email content based on template type
   * Used when MailerSend template is not configured
   * 
   * @param templateType - Type of email template
   * @param recipientName - Recipient's name
   * @param variables - Template variables
   * @param branding - Organization branding settings
   * @param baseUrl - Base URL for links
   * @returns HTML string for the email
   */
  private static generateFallbackEmailHtml(
    templateType: string,
    recipientName: string,
    variables: Record<string, string>,
    branding: OrganizationEmailBranding,
    baseUrl: string
  ): string {
    const templateConfigs: Record<string, { icon: string; header: string; getBody: () => string }> = {
      'renewal_reminder': {
        icon: '📅',
        header: 'Subscription Renewal Reminder',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <p>This is a friendly reminder that your subscription will renew soon.</p>
          <div class="info">
            <strong>Renewal Details:</strong>
            <p>Amount: ${variables.amount || 'See your account'}</p>
            <p>Date: ${variables.renewalDate || 'Soon'}</p>
          </div>
          <center>${this.generateBrandedButton(branding, 'Manage Subscription', `${baseUrl}/account/subscription`)}</center>
          <p>Best regards,<br/>The ${branding.orgName} Team</p>
        `
      },
      'payment_success': {
        icon: '✅',
        header: 'Payment Successful',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <div class="success">
            <strong>Payment Confirmed!</strong>
            <p>Your payment has been successfully processed.</p>
          </div>
          <p>Amount: ${variables.amount || 'See invoice'}</p>
          <p>Thank you for your continued support!</p>
          <center>${this.generateBrandedButton(branding, 'View Receipt', `${baseUrl}/invoices`)}</center>
          <p>Best regards,<br/>The ${branding.orgName} Team</p>
        `
      },
      'payment_failed': {
        icon: '⚠️',
        header: 'Payment Failed',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <div class="warning">
            <strong>Payment Issue</strong>
            <p>We were unable to process your payment. Please update your payment method to avoid service interruption.</p>
          </div>
          <center>${this.generateBrandedButton(branding, 'Update Payment Method', `${baseUrl}/account/billing`)}</center>
          <p>If you need assistance, please contact our support team.</p>
          <p>Best regards,<br/>The ${branding.orgName} Team</p>
        `
      },
      'grace_period': {
        icon: '⏰',
        header: 'Grace Period Notice',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <div class="warning">
            <strong>Action Required</strong>
            <p>Your subscription is currently in a grace period. Please update your payment method to continue accessing all features.</p>
          </div>
          <p>Grace period ends: ${variables.gracePeriodEnd || 'Soon'}</p>
          <center>${this.generateBrandedButton(branding, 'Update Payment', `${baseUrl}/account/billing`)}</center>
          <p>Best regards,<br/>The ${branding.orgName} Team</p>
        `
      },
      'suspension': {
        icon: '🔒',
        header: 'Subscription Suspended',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <div class="alert">
            <strong>Subscription Suspended</strong>
            <p>Your subscription has been suspended due to payment issues. Please update your payment method to restore access.</p>
          </div>
          <center>${this.generateBrandedButton(branding, 'Reactivate Account', `${baseUrl}/account/billing`)}</center>
          <p>If you need assistance, please contact our support team at ${branding.supportEmail}.</p>
          <p>Best regards,<br/>The ${branding.orgName} Team</p>
        `
      },
      'credit_confirmation': {
        icon: '💎',
        header: 'Credit Purchase Confirmed',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <div class="success">
            <strong>Credits Added!</strong>
            <p>Your credit purchase has been confirmed and credits have been added to your account.</p>
          </div>
          <p>Credits added: ${variables.creditsAmount || 'See account'}</p>
          <p>Amount paid: ${variables.amount || 'See invoice'}</p>
          <center>${this.generateBrandedButton(branding, 'View Balance', `${baseUrl}/credits`)}</center>
          <p>Best regards,<br/>The ${branding.orgName} Team</p>
        `
      },
      'sales_inquiry_notification': {
        icon: '📩',
        header: 'New Help / Enhancement Request',
        getBody: () => `
          <p>Dear ${recipientName},</p>
          <div class="info">
            <strong>A new request has been submitted on ${branding.orgName}.</strong>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:40%;">Name</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryName || ''} ${variables.inquirySurname || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryEmail || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Phone</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryPhone || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Organization</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryOrganization || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Position</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryPosition || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Students</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryStudentCount || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Source</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquirySource || ''}</td></tr>
            ${variables.inquiryMessage ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Message</td><td style="padding:8px;border-bottom:1px solid #eee;">${variables.inquiryMessage}</td></tr>` : ''}
          </table>
          <center>${this.generateBrandedButton(branding, 'View All Inquiries', `${baseUrl}/sales-inquiries`)}</center>
          <p>Best regards,<br/>The ${branding.orgName} Platform</p>
        `
      }
    };

    const config = templateConfigs[templateType] || {
      icon: '📧',
      header: 'Notification',
      getBody: () => `
        <p>Dear ${recipientName},</p>
        <p>You have a new notification from ${branding.orgName}.</p>
        <center>${this.generateBrandedButton(branding, 'Visit Dashboard', baseUrl)}</center>
        <p>Best regards,<br/>The ${branding.orgName} Team</p>
      `
    };

    return this.generateBrandedEmail(branding, config.icon, config.header, config.getBody());
  }

  /**
   * Send an email using MailerSend
   * Creates an email log entry and attempts delivery
   * Updates log status based on send result
   */
  static async sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
    const {
      recipientEmail,
      recipientName,
      subject,
      templateType,
      templateVariables = {},
      attachments = [],
      subscriptionId,
      invoiceId,
      organizationId,
    } = params;

    // Declare emailLog outside try block so it's available in catch
    let emailLog: any = null;

    try {
      // Create email log entry (queued status)
      const [createdLog] = await db
        .insert(emailLogs)
        .values({
          recipientEmail,
          recipientName,
          subject,
          templateType,
          status: 'queued',
          subscriptionId: subscriptionId || null,
          invoiceId: invoiceId || null,
          attachmentPaths: attachments.length > 0 
            ? attachments.map(a => a.filename) 
            : null,
        })
        .returning();

      emailLog = createdLog;
      console.log(`[MailerSend] Created email log ${emailLog.id} for ${maskEmail(recipientEmail)}`);

      // Get organization branding if available
      const branding = await this.getOrganizationBranding(organizationId);
      
      const baseUrl = getBaseUrl();

      // Always generate branded HTML email based on template type
      const htmlContent = this.generateFallbackEmailHtml(templateType, recipientName, templateVariables, branding, baseUrl);

      // Enhanced structured logging before sending
      console.log(`[MailerSend] Preparing email: ${JSON.stringify({
        recipient: maskEmail(recipientEmail),
        subject: subject,
        templateType: templateType,
        baseUrl: baseUrl,
        orgId: organizationId || 'none',
        transport: getActiveTransportName()
      })}`);

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        html: htmlContent,
        replyTo: { email: 'support@learnplay.co.za', name: branding.senderName },
        attachments: attachments.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      if (!transportResult.success) {
        await this.updateEmailLogStatus(emailLog.id, 'failed', transportResult.error || 'Transport send failed');
        return {
          success: false,
          emailLogId: emailLog.id,
          error: transportResult.error,
        };
      }

      const mailersendId = transportResult.messageId;

      // Update email log with sent status
      await this.updateEmailLogStatus(emailLog.id, 'sent', null, mailersendId);

      console.log(`[MailerSend] Email sent successfully: ${emailLog.id} (Message ID: ${mailersendId})`);

      return {
        success: true,
        emailLogId: emailLog.id,
        mailersendId: mailersendId || undefined,
      };

    } catch (error: any) {
      console.error('[MailerSend] Error sending email:', error);

      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';

      // Update the existing email log to failed status if it was created
      if (emailLog) {
        try {
          await this.updateEmailLogStatus(emailLog.id, 'failed', errorMessage);
        } catch (updateError) {
          console.error('[MailerSend] Failed to update email log status:', updateError);
        }

        return {
          success: false,
          emailLogId: emailLog.id,
          error: errorMessage,
        };
      }

      // If log wasn't created, return error without log id
      return {
        success: false,
        emailLogId: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Send deadline reminder email to a learner
   * Used for overdue and upcoming deadline notifications
   */
  static async sendDeadlineReminderEmail(params: {
    recipientEmail: string;
    recipientName: string;
    courseName: string;
    dueDate: Date;
    type: 'overdue' | 'upcoming';
    daysOverdue?: number;
    daysRemaining?: number;
    organizationId: string;
    senderName?: string;
  }): Promise<EmailSendResult> {
    const {
      recipientEmail,
      recipientName,
      courseName,
      dueDate,
      type,
      daysOverdue,
      daysRemaining,
      organizationId,
      senderName,
    } = params;

    try {
      const apiKeyPresent = !!(await IntegrationConfigService.getSecret('mailersend', 'apiKey'));
      const maskedRecipient = recipientEmail.replace(/(.{2}).*(@.*)/, '$1***$2');
      console.log(`[MailerSend] sendDeadlineReminderEmail: Starting - type=${type}, course="${courseName}", recipient=${maskedRecipient}, apiKeyPresent=${apiKeyPresent}`);
      
      const branding = await this.getOrganizationBranding(organizationId);
      
      const baseUrl = getBaseUrl();

      const subject = `Course Deadline Reminder: ${courseName}`;
      
      const isOverdue = type === 'overdue';
      const headerIcon = isOverdue ? '⚠️' : '⏰';
      const headerText = isOverdue ? 'Assignment Overdue' : 'Upcoming Deadline';
      
      const bodyContent = isOverdue ? `
        <p>Dear ${recipientName},</p>
        <p>This is a reminder that you have an <strong>overdue assignment</strong> for the following course:</p>
        <div class="alert" style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0;">
          <strong>Course:</strong> ${courseName}<br/>
          <strong>Due Date:</strong> ${dueDate.toLocaleDateString()}<br/>
          <strong>Days Overdue:</strong> <span style="color: #dc2626; font-weight: bold;">${daysOverdue || 0} days</span>
        </div>
        <p>Please complete your assignment as soon as possible to avoid further delays in your learning progress.</p>
        <center>${this.generateBrandedButton(branding, 'View Course', `${baseUrl}/my-courses`)}</center>
        <p>If you have any questions or need assistance, please reach out to your instructor.</p>
        <p>Best regards,<br/>${senderName ? `${senderName}, ` : ''}The ${branding.orgName} Team</p>
      ` : `
        <p>Dear ${recipientName},</p>
        <p>This is a friendly reminder that you have an <strong>upcoming deadline</strong> for the following course:</p>
        <div class="info" style="background: #dbeafe; border-left: 4px solid ${branding.primaryColor}; padding: 12px; margin: 20px 0;">
          <strong>Course:</strong> ${courseName}<br/>
          <strong>Due Date:</strong> ${dueDate.toLocaleDateString()}<br/>
          <strong>Days Remaining:</strong> <span style="color: #059669; font-weight: bold;">${daysRemaining || 0} days</span>
        </div>
        <p>Make sure to complete your assignments before the deadline to stay on track with your learning goals.</p>
        <center>${this.generateBrandedButton(branding, 'Continue Learning', `${baseUrl}/my-courses`)}</center>
        <p>If you have any questions, please don't hesitate to reach out to your instructor.</p>
        <p>Best regards,<br/>${senderName ? `${senderName}, ` : ''}The ${branding.orgName} Team</p>
      `;

      const htmlContent = this.generateBrandedEmail(branding, headerIcon, headerText, bodyContent);

      // Create email log entry
      const [emailLog] = await db
        .insert(emailLogs)
        .values({
          recipientEmail,
          recipientName,
          subject,
          templateType: 'renewal_reminder', // Re-use existing type for logging
          status: 'queued',
        })
        .returning();

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: senderName || branding.senderName },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        html: htmlContent,
      });

      if (!transportResult.success) {
        await this.updateEmailLogStatus(emailLog.id, 'failed', transportResult.error || 'Transport send failed');
        return {
          success: false,
          emailLogId: emailLog.id,
          error: transportResult.error,
        };
      }

      const mailersendId = transportResult.messageId;
      await this.updateEmailLogStatus(emailLog.id, 'sent', null, mailersendId);

      console.log(`[MailerSend] sendDeadlineReminderEmail: SUCCESS - type=${type}, course="${courseName}", recipient=${maskedRecipient}, messageId=${mailersendId || 'N/A'}, emailLogId=${emailLog.id}`);

      return {
        success: true,
        emailLogId: emailLog.id,
        mailersendId: mailersendId || undefined,
      };

    } catch (error: any) {
      const maskedRecipient = recipientEmail.replace(/(.{2}).*(@.*)/, '$1***$2');
      console.error(`[MailerSend] sendDeadlineReminderEmail: FAILED - type=${type}, course="${courseName}", recipient=${maskedRecipient}, error=${error.message || 'Unknown error'}`);
      return {
        success: false,
        emailLogId: '',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Update email log status
   */
  private static async updateEmailLogStatus(
    emailLogId: string,
    status: 'sent' | 'delivered' | 'failed' | 'bounced',
    errorMessage?: string | null,
    mailersendId?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      errorMessage: errorMessage || null,
    };

    if (status === 'sent') {
      updateData.sentAt = new Date();
    }
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    }
    if (mailersendId) {
      updateData.mailersendId = mailersendId;
    }

    await db
      .update(emailLogs)
      .set(updateData)
      .where(eq(emailLogs.id, emailLogId));
  }

  /**
   * Handle MailerSend webhook event
   * Updates email log status based on delivery events
   */
  static async handleWebhookEvent(event: any): Promise<boolean> {
    try {
      const { type, email } = event;
      const mailersendId = email?.message?.id;

      if (!mailersendId) {
        console.warn('[MailerSend] Webhook event missing message ID');
        return false;
      }

      // Find email log by MailerSend ID
      const [emailLog] = await db
        .select()
        .from(emailLogs)
        .where(eq(emailLogs.mailersendId, mailersendId))
        .limit(1);

      if (!emailLog) {
        console.warn(`[MailerSend] No email log found for MailerSend ID: ${mailersendId}`);
        return false;
      }

      // Map webhook event type to email status
      let newStatus: 'delivered' | 'failed' | 'bounced' | null = null;
      let errorMessage: string | null = null;

      switch (type) {
        case 'activity.delivered':
          newStatus = 'delivered';
          break;
        case 'activity.soft_bounced':
        case 'activity.hard_bounced':
          newStatus = 'bounced';
          errorMessage = email?.reason || 'Email bounced';
          break;
        case 'activity.spam':
        case 'activity.failed':
          newStatus = 'failed';
          errorMessage = email?.reason || 'Email delivery failed';
          break;
        default:
          console.log(`[MailerSend] Unhandled webhook event type: ${type}`);
          return true; // Not an error, just not handled
      }

      if (newStatus) {
        await this.updateEmailLogStatus(emailLog.id, newStatus, errorMessage);
        console.log(`[MailerSend] Updated email log ${emailLog.id} to status: ${newStatus}`);
      }

      return true;
    } catch (error: any) {
      console.error('[MailerSend] Error handling webhook event:', error);
      return false;
    }
  }

  /**
   * Verify MailerSend webhook signature
   * Ensures webhook requests are authentic
   */
  static verifyWebhookSignature(signature: string, payload: string, webhookSecret: string): boolean {
    try {
      const providedSignature = String(signature || "").trim();
      const secret = String(webhookSecret || "").trim();
      if (!providedSignature || !secret) return false;

      const expectedSignature = createHmac("sha256", secret)
        .update(String(payload || ""))
        .digest("hex");

      const providedBuffer = Buffer.from(providedSignature, "utf8");
      const expectedBuffer = Buffer.from(expectedSignature, "utf8");
      return (
        providedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(providedBuffer, expectedBuffer)
      );
    } catch {
      return false;
    }
  }

  /**
   * Get email delivery statistics
   */
  static async getDeliveryStats(subscriptionId?: string): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    bounced: number;
  }> {
    // TODO: Implement delivery statistics query
    // This would aggregate emailLogs by status
    return {
      total: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
    };
  }

  /**
   * Send certificate email with PDF attachment
   * Sends a congratulations email when a user earns a certificate
   * Uses organization branding colors and logo when allowEmailBranding is enabled
   * 
   * @param params - Email parameters
   * @param params.recipientEmail - Recipient's email address
   * @param params.recipientName - Recipient's name
   * @param params.certificateId - Certificate ID for reference
   * @param params.certificateType - Type of certificate ('course')
   * @param params.title - Course title
   * @param params.pdfBuffer - PDF certificate buffer
   * @param params.organizationId - Organization ID for branded emails
   */
  static async sendCertificateEmail(params: {
    recipientEmail: string;
    recipientName: string;
    certificateId: string;
    certificateType: 'course';
    title: string;
    pdfBuffer: Buffer;
    organizationId: string;
  }): Promise<EmailSendResult> {
    const { recipientEmail, recipientName, certificateId, title, pdfBuffer, organizationId } = params;

    let emailLog: any = null;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const isCourse = true;
      const certificateTypeLabel = 'Course Completion';
      const subject = `🎓 Your ${certificateTypeLabel} Certificate - ${branding.orgName}`;

      const [createdLog] = await db
        .insert(emailLogs)
        .values({
          recipientEmail,
          recipientName,
          subject,
          templateType: 'certificate',
          status: 'queued',
          attachmentPaths: [`${certificateId}.pdf`],
        })
        .returning();

      emailLog = createdLog;
      console.log(`[MailerSend] Created certificate email log ${emailLog.id} for ${maskEmail(recipientEmail)}`);

      const achievementLabel = 'completing the course';
      const bodyContent = `
        <p>Dear ${recipientName},</p>
        <div class="success">
          <strong>🎉 Congratulations!</strong>
          <p style="margin: 10px 0 0 0;">You have successfully earned your certificate for ${achievementLabel}:</p>
        </div>
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 16px 0; text-align: center;">
          <h2 style="color: ${branding.primaryColor}; margin: 0 0 10px 0;">${title}</h2>
          <p style="color: #666; margin: 0;">Certificate ID: ${certificateId}</p>
        </div>
        <p>Your certificate is attached to this email as a PDF. You can download it and share your achievement!</p>
        <div class="info">
          <strong>📜 Your Certificate</strong>
          <ul style="margin: 10px 0 0 0;">
            <li>Download and save your certificate for your records</li>
            <li>Share your achievement on social media</li>
            <li>Add it to your professional portfolio</li>
          </ul>
        </div>
        <p>Keep up the great work and continue your learning journey with ${branding.orgName}!</p>
        <p>Best regards,<br/>The ${branding.orgName} Team</p>
      `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        html: this.generateBrandedEmail(branding, '🎓', `${certificateTypeLabel} Certificate`, bodyContent),
        attachments: [{
          filename: `${certificateId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });

      if (!transportResult.success) {
        await this.updateEmailLogStatus(emailLog.id, 'failed', transportResult.error || 'Transport send failed');
        return {
          success: false,
          emailLogId: emailLog.id,
          error: transportResult.error,
        };
      }

      const mailersendId = transportResult.messageId;

      await this.updateEmailLogStatus(emailLog.id, 'sent', null, mailersendId);

      console.log(`[MailerSend] Certificate email sent successfully: ${emailLog.id} (MailerSend ID: ${mailersendId})`);

      return {
        success: true,
        emailLogId: emailLog.id,
        mailersendId: mailersendId || undefined,
      };

    } catch (error: any) {
      console.error('[MailerSend] Failed to send certificate email:', error);

      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';

      if (emailLog) {
        try {
          await this.updateEmailLogStatus(emailLog.id, 'failed', errorMessage);
        } catch (updateError) {
          console.error('[MailerSend] Failed to update email log status:', updateError);
        }

        return {
          success: false,
          emailLogId: emailLog.id,
          error: errorMessage,
        };
      }

      return {
        success: false,
        emailLogId: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Send password reset email
   * Uses organization branding colors and logo when allowEmailBranding is enabled
   * 
   * @param params - Email parameters
   * @param params.to - Recipient email address
   * @param params.userName - Recipient's name
   * @param params.resetUrl - Password reset URL with token
   * @param params.expiresIn - Token expiration time (e.g., "1 hour")
   * @param params.organizationId - Optional organization ID for branded emails
   */
  static async sendPasswordResetEmail(params: {
    to: string;
    userName: string;
    resetUrl: string;
    expiresIn: string;
    organizationId?: string;
  }): Promise<void> {
    const { to, userName, resetUrl, expiresIn, organizationId } = params;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const subject = `Reset Your Password - ${branding.orgName}`;

      const bodyContent = `
        <p>Hi ${userName},</p>
        <p>We received a request to reset your password for your ${branding.orgName} account. Click the button below to create a new password:</p>
        <center>
          ${this.generateBrandedButton(branding, 'Reset Password', resetUrl)}
        </center>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px;">${resetUrl}</p>
        <div class="warning">
          <strong>⚠️ Security Notice:</strong>
          <ul style="margin: 10px 0 0 0;">
            <li>This link will expire in ${expiresIn}</li>
            <li>If you didn't request this, please ignore this email</li>
            <li>Your password won't change until you create a new one</li>
          </ul>
        </div>
        <p>Need help? Contact our support team at ${branding.supportEmail}</p>
      `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: to, name: userName }],
        subject,
        html: this.generateBrandedEmail(branding, '🔐', 'Password Reset Request', bodyContent),
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Transport send failed');
      }

      console.log(`[MailerSend] Password reset email sent to ${maskEmail(to)}`);

      await db.insert(emailLogs).values({
        recipientEmail: to,
        recipientName: userName,
        subject,
        templateType: 'password_reset',
        status: 'sent',
      });

    } catch (error: any) {
      console.error('[MailerSend] Failed to send password reset email:', error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  /**
   * Send password reset confirmation email
   * Notifies user that their password was successfully changed
   * Uses organization branding colors when allowEmailBranding is enabled
   * 
   * @param params - Email parameters
   * @param params.to - Recipient email address
   * @param params.userName - Recipient's name
   * @param params.organizationId - Optional organization ID for branded emails
   */
  static async sendPasswordResetConfirmation(params: {
    to: string;
    userName: string;
    organizationId?: string;
  }): Promise<void> {
    const { to, userName, organizationId } = params;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const subject = `Password Changed Successfully - ${branding.orgName}`;

      const bodyContent = `
        <p>Hi ${userName},</p>
        <p>This is a confirmation that your ${branding.orgName} password was successfully changed.</p>
        <div class="alert">
          <strong>🔒 Security Alert:</strong>
          <p style="margin: 10px 0 0 0;">If you did not make this change, please contact our support team immediately at ${branding.supportEmail}</p>
        </div>
        <p>Your account security is important to us. Here are some tips to keep your account safe:</p>
        <ul>
          <li>Use a strong, unique password</li>
          <li>Never share your password with anyone</li>
          <li>Be cautious of phishing emails</li>
        </ul>
        <p>Thank you for using ${branding.orgName}!</p>
      `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: to, name: userName }],
        subject,
        html: this.generateBrandedEmail(branding, '✅', 'Password Changed', bodyContent),
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Transport send failed');
      }

      console.log(`[MailerSend] Password reset confirmation sent to ${maskEmail(to)}`);

      await db.insert(emailLogs).values({
        recipientEmail: to,
        recipientName: userName,
        subject,
        templateType: 'password_reset_confirmation',
        status: 'sent',
      });

    } catch (error: any) {
      console.error('[MailerSend] Failed to send password reset confirmation:', error);
      throw new Error(`Failed to send password reset confirmation: ${error.message}`);
    }
  }

  /**
   * Send email verification email
   * Sends a verification link to confirm the user's email address
   * Uses organization branding colors when allowEmailBranding is enabled
   * 
   * @param params - Email parameters
   * @param params.to - Recipient email address
   * @param params.userName - Recipient's name
   * @param params.verificationUrl - Email verification URL with token
   * @param params.expiresIn - Token expiration time (e.g., "24 hours")
   * @param params.organizationId - Optional organization ID for branded emails
   */
  static async sendEmailVerificationEmail(params: {
    to: string;
    userName: string;
    verificationUrl: string;
    expiresIn: string;
    organizationId?: string;
  }): Promise<void> {
    const { to, userName, verificationUrl, expiresIn, organizationId } = params;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const subject = `Verify Your Email - ${branding.orgName}`;

      const bodyContent = `
        <p>Hi ${userName},</p>
        <p>Welcome to ${branding.orgName}! Please verify your email address to activate your account and unlock all features.</p>
        <center>
          ${this.generateBrandedButton(branding, 'Verify Email Address', verificationUrl)}
        </center>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px;">${verificationUrl}</p>
        <div class="info">
          <strong>ℹ️ Why verify?</strong>
          <ul style="margin: 10px 0 0 0;">
            <li>Access your free lesson creation credits</li>
            <li>Receive important account notifications</li>
            <li>Secure your account recovery options</li>
          </ul>
        </div>
        <p style="color: #666; font-size: 14px;">This link will expire in ${expiresIn}. If you didn't create a ${branding.orgName} account, you can safely ignore this email.</p>
      `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: to, name: userName }],
        subject,
        html: this.generateBrandedEmail(branding, '📧', 'Verify Your Email', bodyContent),
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Transport send failed');
      }

      console.log(`[MailerSend] Email verification sent to ${maskEmail(to)}`);

      await db.insert(emailLogs).values({
        recipientEmail: to,
        recipientName: userName,
        subject,
        templateType: 'email_verification',
        status: 'sent',
      });

    } catch (error: any) {
      console.error('[MailerSend] Failed to send email verification:', error);
      
      try {
        await db.insert(emailLogs).values({
          recipientEmail: to,
          recipientName: userName,
          subject: `Verify Your Email`,
          templateType: 'email_verification',
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
        });
      } catch (logError) {
        console.error('[MailerSend] Failed to log email failure:', logError);
      }
      
      throw new Error(`Failed to send email verification: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Send refund requested email to organization admin
   * Notifies org admins when a user requests a refund
   * Uses organization branding colors when allowEmailBranding is enabled
   * 
   * @param params - Email parameters
   * @param params.to - Recipient email address (org admin)
   * @param params.orgAdminName - Organization admin's name
   * @param params.userName - User who requested refund
   * @param params.courseTitle - Title of the course
   * @param params.purchaseAmount - Original purchase amount
   * @param params.currency - Currency code
   * @param params.requestReason - User's reason for requesting refund
   * @param params.refundUrl - URL to review the refund request
   * @param params.organizationId - Optional organization ID for branded emails
   */
  static async sendRefundRequestedEmail(params: {
    to: string;
    orgAdminName: string;
    userName: string;
    courseTitle: string;
    purchaseAmount: string;
    currency: string;
    requestReason?: string;
    refundUrl: string;
    organizationId?: string;
  }): Promise<void> {
    const { to, orgAdminName, userName, courseTitle, purchaseAmount, currency, requestReason, refundUrl, organizationId } = params;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const subject = `Refund Request: ${courseTitle} - ${branding.orgName}`;

      const bodyContent = `
        <p>Hi ${orgAdminName},</p>
        <p>A customer has requested a refund for one of your courses. Please review the details below:</p>
        
        <div class="details" style="background: white; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <div class="detail-row" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
            <span class="detail-label" style="color: #666;">Customer:</span>
            <span class="detail-value" style="font-weight: 600;">${userName}</span>
          </div>
          <div class="detail-row" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
            <span class="detail-label" style="color: #666;">Course:</span>
            <span class="detail-value" style="font-weight: 600;">${courseTitle}</span>
          </div>
          <div class="detail-row" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
            <span class="detail-label" style="color: #666;">Purchase Amount:</span>
            <span class="detail-value" style="font-weight: 600;">${currency} ${purchaseAmount}</span>
          </div>
          ${requestReason ? `
          <div class="detail-row" style="display: flex; justify-content: space-between; padding: 8px 0;">
            <span class="detail-label" style="color: #666;">Reason:</span>
            <span class="detail-value" style="font-weight: 600;">${requestReason}</span>
          </div>
          ` : ''}
        </div>
        
        <center>
          ${this.generateBrandedButton(branding, 'Review Refund Request', refundUrl)}
        </center>
        
        <div class="warning">
          <strong>⏰ Action Required:</strong>
          <p style="margin: 10px 0 0 0;">Please review and respond to this refund request within 48 hours to maintain good customer relations.</p>
        </div>
      `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: to, name: orgAdminName }],
        subject,
        html: this.generateBrandedEmail(branding, '📋', 'Refund Request Received', bodyContent),
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Transport send failed');
      }

      console.log(`[MailerSend] Refund requested email sent to ${maskEmail(to)}`);

      await db.insert(emailLogs).values({
        recipientEmail: to,
        recipientName: orgAdminName,
        subject,
        templateType: 'refund_requested',
        status: 'sent',
      });

    } catch (error: any) {
      console.error('[MailerSend] Failed to send refund requested email:', error);
      throw new Error(`Failed to send refund requested email: ${error.message}`);
    }
  }

  /**
   * Send refund decision email to user
   * Notifies user when their refund is approved or declined
   * 
   * @param params - Email parameters
   * @param params.to - Recipient email address
   * @param params.userName - User's name
   * @param params.courseTitle - Title of the course
   * @param params.refundAmount - Refund amount (for approved refunds)
   * @param params.currency - Currency code
   * @param params.decision - Whether refund was approved or declined
   * @param params.decisionReason - Reason for the decision (especially for declines)
   * @param params.organizationId - Optional organization ID for branded emails
   */
  static async sendRefundDecisionEmail(params: {
    to: string;
    userName: string;
    courseTitle: string;
    refundAmount: string;
    currency: string;
    decision: 'approved' | 'declined';
    decisionReason?: string;
    organizationId?: string;
  }): Promise<void> {
    const { to, userName, courseTitle, refundAmount, currency, decision, decisionReason, organizationId } = params;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const logoHtml = branding.logoUrl 
        ? `<img src="${branding.logoUrl}" alt="${branding.orgName}" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;" /><br/>`
        : '';

      const isApproved = decision === 'approved';
      const headerGradient = isApproved 
        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
        : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      const headerIcon = isApproved ? '✅' : '❌';
      const headerText = isApproved ? 'Refund Approved' : 'Refund Request Declined';
      const subject = isApproved 
        ? `Your Refund Has Been Approved - ${courseTitle}` 
        : `Refund Request Update - ${courseTitle}`;

      const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: ${headerGradient}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                .info-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 12px; margin: 20px 0; }
                .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
                .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; }
                .details { background: white; border-radius: 8px; padding: 16px; margin: 16px 0; }
                .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .detail-row:last-child { border-bottom: none; }
                .detail-label { color: #666; }
                .detail-value { font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  ${logoHtml}
                  <h1>${headerIcon} ${headerText}</h1>
                </div>
                <div class="content">
                  <p>Hi ${userName},</p>
                  
                  ${isApproved ? `
                  <p>Great news! Your refund request for <strong>${courseTitle}</strong> has been approved.</p>
                  
                  <div class="success-box">
                    <strong>💰 Refund Details:</strong>
                    <p style="margin: 10px 0 0 0;">A refund of <strong>${currency} ${refundAmount}</strong> will be processed to your original payment method within 5-10 business days.</p>
                  </div>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">Course:</span>
                      <span class="detail-value">${courseTitle}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Refund Amount:</span>
                      <span class="detail-value">${currency} ${refundAmount}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status:</span>
                      <span class="detail-value" style="color: #10b981;">Approved</span>
                    </div>
                  </div>
                  
                  <div class="info-box">
                    <strong>ℹ️ What happens next?</strong>
                    <ul style="margin: 10px 0 0 0;">
                      <li>Your access to the course has been revoked</li>
                      <li>The refund will appear on your statement within 5-10 business days</li>
                      <li>You can repurchase the course at any time if you change your mind</li>
                    </ul>
                  </div>
                  ` : `
                  <p>We've reviewed your refund request for <strong>${courseTitle}</strong>, and unfortunately, we are unable to approve it at this time.</p>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">Course:</span>
                      <span class="detail-value">${courseTitle}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status:</span>
                      <span class="detail-value" style="color: #ef4444;">Declined</span>
                    </div>
                    ${decisionReason ? `
                    <div class="detail-row">
                      <span class="detail-label">Reason:</span>
                      <span class="detail-value">${decisionReason}</span>
                    </div>
                    ` : ''}
                  </div>
                  
                  <div class="warning-box">
                    <strong>💡 Need Help?</strong>
                    <p style="margin: 10px 0 0 0;">If you believe this decision was made in error or have additional information to provide, please contact our support team at ${branding.supportEmail}</p>
                  </div>
                  `}
                  
                  <p>Thank you for using ${branding.orgName}!</p>
                </div>
                <div class="footer">
                  <p>© ${new Date().getFullYear()} ${branding.orgName}. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: to, name: userName }],
        subject,
        html: htmlContent,
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Transport send failed');
      }

      console.log(`[MailerSend] Refund decision (${decision}) email sent to ${maskEmail(to)}`);

      await db.insert(emailLogs).values({
        recipientEmail: to,
        recipientName: userName,
        subject,
        templateType: `refund_${decision}`,
        status: 'sent',
      });

    } catch (error: any) {
      console.error('[MailerSend] Failed to send refund decision email:', error);
      throw new Error(`Failed to send refund decision email: ${error.message}`);
    }
  }

  /**
   * Send subscription cancellation email
   * Notifies user about subscription cancellation status
   * 
   * @param params - Email parameters
   * @param params.to - Recipient email address
   * @param params.userName - User's name
   * @param params.planName - Name of the subscription plan
   * @param params.effectiveDate - When cancellation takes effect
   * @param params.type - Type of cancellation action
   * @param params.organizationId - Optional organization ID for branded emails
   */
  static async sendSubscriptionCancellationEmail(params: {
    to: string;
    userName: string;
    planName: string;
    effectiveDate: string;
    type: 'scheduled' | 'immediate' | 'reactivated';
    organizationId?: string;
  }): Promise<void> {
    const { to, userName, planName, effectiveDate, type, organizationId } = params;

    try {
      const branding = await this.getOrganizationBranding(organizationId);
      const logoHtml = branding.logoUrl 
        ? `<img src="${branding.logoUrl}" alt="${branding.orgName}" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;" /><br/>`
        : '';

      let headerGradient: string;
      let headerIcon: string;
      let headerText: string;
      let subject: string;

      switch (type) {
        case 'scheduled':
          headerGradient = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
          headerIcon = '📅';
          headerText = 'Cancellation Scheduled';
          subject = `Your Subscription Cancellation is Scheduled - ${branding.orgName}`;
          break;
        case 'immediate':
          headerGradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
          headerIcon = '🚫';
          headerText = 'Subscription Cancelled';
          subject = `Your Subscription Has Been Cancelled - ${branding.orgName}`;
          break;
        case 'reactivated':
          headerGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          headerIcon = '🎉';
          headerText = 'Subscription Reactivated';
          subject = `Great News! Your Subscription is Reactivated - ${branding.orgName}`;
          break;
      }

      const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: ${headerGradient}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background: #6b46c1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                .info-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 12px; margin: 20px 0; }
                .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
                .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; }
                .details { background: white; border-radius: 8px; padding: 16px; margin: 16px 0; }
                .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .detail-row:last-child { border-bottom: none; }
                .detail-label { color: #666; }
                .detail-value { font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  ${logoHtml}
                  <h1>${headerIcon} ${headerText}</h1>
                </div>
                <div class="content">
                  <p>Hi ${userName},</p>
                  
                  ${type === 'scheduled' ? `
                  <p>We've received your request to cancel your <strong>${planName}</strong> subscription. Your cancellation has been scheduled.</p>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">Plan:</span>
                      <span class="detail-value">${planName}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Access Until:</span>
                      <span class="detail-value">${effectiveDate}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status:</span>
                      <span class="detail-value" style="color: #f59e0b;">Cancellation Pending</span>
                    </div>
                  </div>
                  
                  <div class="warning-box">
                    <strong>⏰ What happens next?</strong>
                    <ul style="margin: 10px 0 0 0;">
                      <li>You'll continue to have full access until <strong>${effectiveDate}</strong></li>
                      <li>After this date, your subscription will be cancelled</li>
                      <li>You can undo this cancellation at any time before the effective date</li>
                    </ul>
                  </div>
                  
                  <div class="info-box">
                    <strong>💡 Changed your mind?</strong>
                    <p style="margin: 10px 0 0 0;">You can reactivate your subscription anytime before ${effectiveDate} by visiting your subscription settings.</p>
                  </div>
                  ` : type === 'immediate' ? `
                  <p>Your <strong>${planName}</strong> subscription has been cancelled effective immediately.</p>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">Plan:</span>
                      <span class="detail-value">${planName}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Cancelled On:</span>
                      <span class="detail-value">${effectiveDate}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status:</span>
                      <span class="detail-value" style="color: #ef4444;">Cancelled</span>
                    </div>
                  </div>
                  
                  <div class="info-box">
                    <strong>ℹ️ What this means:</strong>
                    <ul style="margin: 10px 0 0 0;">
                      <li>Your access to premium features has ended</li>
                      <li>Your account data will be retained for 30 days</li>
                      <li>You can resubscribe at any time to regain access</li>
                    </ul>
                  </div>
                  
                  <div class="warning-box">
                    <strong>💡 We'd love to have you back!</strong>
                    <p style="margin: 10px 0 0 0;">If you cancelled due to any issues with our service, please let us know at ${branding.supportEmail} - we're always working to improve!</p>
                  </div>
                  ` : `
                  <p>Great news! Your <strong>${planName}</strong> subscription has been successfully reactivated.</p>
                  
                  <div class="success-box">
                    <strong>🎉 Welcome Back!</strong>
                    <p style="margin: 10px 0 0 0;">Your subscription is now active and you have full access to all premium features.</p>
                  </div>
                  
                  <div class="details">
                    <div class="detail-row">
                      <span class="detail-label">Plan:</span>
                      <span class="detail-value">${planName}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Reactivated On:</span>
                      <span class="detail-value">${effectiveDate}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status:</span>
                      <span class="detail-value" style="color: #10b981;">Active</span>
                    </div>
                  </div>
                  
                  <div class="info-box">
                    <strong>ℹ️ What's Next?</strong>
                    <ul style="margin: 10px 0 0 0;">
                      <li>Your scheduled cancellation has been removed</li>
                      <li>Auto-renewal is now enabled</li>
                      <li>You'll be billed on your regular billing date</li>
                    </ul>
                  </div>
                  `}
                  
                  <p>Thank you for using ${branding.orgName}!</p>
                </div>
                <div class="footer">
                  <p>© ${new Date().getFullYear()} ${branding.orgName}. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `;

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: to, name: userName }],
        subject,
        html: htmlContent,
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Transport send failed');
      }

      console.log(`[MailerSend] Subscription ${type} email sent to ${maskEmail(to)}`);

      await db.insert(emailLogs).values({
        recipientEmail: to,
        recipientName: userName,
        subject,
        templateType: `subscription_${type}`,
        status: 'sent',
      });

    } catch (error: any) {
      console.error('[MailerSend] Failed to send subscription cancellation email:', error);
      throw new Error(`Failed to send subscription cancellation email: ${error.message}`);
    }
  }

  /**
   * Send join request notification email to org admins
   * Includes learner info, org/unit details, and one-click approval button
   */
  static async sendJoinRequestNotification(params: {
    recipientEmail: string;
    recipientName: string;
    learnerName: string;
    learnerEmail: string;
    organizationName: string;
    unitName?: string;
    subUnitName?: string;
    approvalToken: string;
    organizationId: string;
  }): Promise<EmailSendResult> {
    const { recipientEmail, recipientName, learnerName, learnerEmail, organizationName, unitName, subUnitName, approvalToken, organizationId } = params;

    // Get organization branding
    const branding = await this.getOrganizationBranding(organizationId);
    
    // Build review URL - directs admin to the Join Requests page in the platform UI
    const baseUrl = getBaseUrl();
    const reviewUrl = `${baseUrl}/join-requests`;
    
    // Build unit/department info
    let locationInfo = '';
    if (unitName) {
      locationInfo = `<p><strong>Department/Grade:</strong> ${unitName}</p>`;
      if (subUnitName) {
        locationInfo += `<p><strong>Class/Team:</strong> ${subUnitName}</p>`;
      }
    }
    
    // Generate email body
    const bodyContent = `
      <p>Hello ${recipientName},</p>
      <p>A new learner has requested to join your organization:</p>
      <div class="info" style="background: #dbeafe; border-left: 4px solid ${branding.primaryColor}; padding: 16px; margin: 20px 0;">
        <p><strong>Name:</strong> ${learnerName}</p>
        <p><strong>Email:</strong> ${learnerEmail}</p>
        <p><strong>Organization:</strong> ${organizationName}</p>
        ${locationInfo}
      </div>
      <p>Please review this request on the platform:</p>
      ${this.generateBrandedButton(branding, 'Review Join Request', reviewUrl)}
      <p style="font-size: 12px; color: #666; margin-top: 20px;">
        Log in to the platform to review, approve, or deny this request and assign the learner to the correct department, unit, or team.
      </p>
    `;

    // Generate full branded email
    const htmlContent = this.generateBrandedEmail(
      branding,
      '👋',
      'New Join Request',
      bodyContent
    );

    // Create email log
    let emailLog: any = null;
    try {
      const [createdLog] = await db
        .insert(emailLogs)
        .values({
          recipientEmail,
          recipientName,
          subject: `New Join Request - ${learnerName} wants to join ${organizationName}`,
          templateType: 'join_request_notification',
          status: 'queued',
        })
        .returning();
      emailLog = createdLog;

      console.log(`[MailerSend] Preparing join request notification: ${JSON.stringify({
        recipient: maskEmail(recipientEmail),
        subject: `New Join Request - ${learnerName}`,
        orgId: organizationId,
        learner: maskEmail(learnerEmail)
      })}`);

      const transportResult = await sendRawEmail({
        from: { email: await this.getFromEmail(), name: branding.senderName },
        to: [{ email: recipientEmail, name: recipientName }],
        subject: `New Join Request - ${learnerName} wants to join ${organizationName}`,
        html: htmlContent,
        replyTo: { email: 'support@learnplay.co.za', name: branding.senderName },
      });

      if (!transportResult.success) {
        await this.updateEmailLogStatus(emailLog.id, 'failed', transportResult.error || 'Transport send failed');
        return { success: false, emailLogId: emailLog.id, error: transportResult.error };
      }

      await this.updateEmailLogStatus(emailLog.id, 'sent', null, transportResult.messageId);
      console.log(`[MailerSend] Join request notification sent: ${emailLog.id}`);

      return { success: true, emailLogId: emailLog.id, mailersendId: transportResult.messageId };
    } catch (error: any) {
      console.error('[MailerSend] Error sending join request notification:', error);
      if (emailLog) {
        await this.updateEmailLogStatus(emailLog.id, 'failed', error.message);
        return { success: false, emailLogId: emailLog.id, error: error.message };
      }
      return { success: false, emailLogId: '', error: error.message };
    }
  }
}
