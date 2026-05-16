// @ts-nocheck
import { db } from '../db';
import {
  userNotifications,
  notificationPreferences,
  emailLogs,
  userOrganizationRoles,
  brandingThemes,
  users,
  organizations,
  type UserNotification,
  type NotificationPreferences,
} from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { sendRawEmail } from './emailTransport';
import { getBaseUrl, getEmailFrom } from '../config/base-url';
import { IntegrationConfigService } from './integrationConfigService';

/**
 * Organization branding settings for notifications
 */
export interface OrganizationNotificationBranding {
  orgName: string;
  logoUrl: string | null;
  supportEmail: string | null;
}

const DEFAULT_BRANDING: OrganizationNotificationBranding = {
  orgName: 'LearnPlay',
  logoUrl: null,
  supportEmail: 'support@learnplay.co.za',
};

/**
 * Mask email address for safe logging (PII protection)
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

export interface CreateNotificationInput {
  userId: string;
  type: 'course_purchase' | 'course_version_update' | 'payout_processed' | 'review_posted' | 'system_announcement';
  title: string;
  message: string;
  metadata?: Record<string, any> | null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  templateId?: string;
  variables?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: string; // Base64 encoded
    type: string;
  }>;
  organizationId?: string | null;
  branding?: OrganizationNotificationBranding;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  byType: Record<string, number>;
}

export class NotificationService {
  /**
   * Get the primary organization ID for a user
   * Returns the first organization the user belongs to, or null if none
   * 
   * @param userId - The user ID to look up
   * @returns The organization ID or null
   */
  static async getUserPrimaryOrganizationId(userId: string): Promise<string | null> {
    try {
      const [role] = await db
        .select({ organizationId: userOrganizationRoles.organizationId })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId))
        .limit(1);

      return role?.organizationId || null;
    } catch (error: any) {
      console.error(`[NotificationService] Error fetching organization for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get organization branding settings for notifications
   * Looks up the branding theme for an organization and returns branding settings if enabled
   * 
   * @param organizationId - The organization ID to look up branding for (optional)
   * @returns Branding settings if enabled, or default LearnPlay branding if not
   */
  static async getOrganizationBranding(organizationId: string | null | undefined): Promise<OrganizationNotificationBranding> {
    if (!organizationId) {
      return DEFAULT_BRANDING;
    }

    try {
      const [theme] = await db
        .select()
        .from(brandingThemes)
        .where(
          and(
            eq(brandingThemes.organizationId, organizationId),
            eq(brandingThemes.status, 'active')
          )
        );

      if (!theme || !theme.allowEmailBranding) {
        console.log(`[NotificationService] Organization ${organizationId} has email branding disabled or no theme`);
        return DEFAULT_BRANDING;
      }

      console.log(`[NotificationService] Using organization branding for ${organizationId}: ${theme.orgName}`);
      
      return {
        orgName: theme.orgName || DEFAULT_BRANDING.orgName,
        logoUrl: theme.logoUrl || null,
        supportEmail: theme.supportEmail || DEFAULT_BRANDING.supportEmail,
      };
    } catch (error: any) {
      console.error(`[NotificationService] Error fetching branding for organization ${organizationId}:`, error);
      return DEFAULT_BRANDING;
    }
  }

  /**
   * Get organization branding for a user by looking up their primary organization
   * Convenience method that combines getUserPrimaryOrganizationId and getOrganizationBranding
   * 
   * @param userId - The user ID to look up branding for
   * @returns Branding settings based on user's organization, or default branding
   */
  static async getBrandingForUser(userId: string): Promise<OrganizationNotificationBranding> {
    const organizationId = await this.getUserPrimaryOrganizationId(userId);
    return this.getOrganizationBranding(organizationId);
  }

  /**
   * Create in-app notification
   */
  static async createNotification(input: CreateNotificationInput): Promise<UserNotification> {
    const notification = await db
      .insert(userNotifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        isRead: false,
        metadata: input.metadata || null,
      })
      .returning();

    console.log(`Notification created for user ${input.userId}: ${input.title}`);

    return notification[0];
  }

  /**
   * Create bulk notifications for multiple users
   */
  static async createBulkNotifications(
    userIds: string[],
    notification: Omit<CreateNotificationInput, 'userId'>
  ): Promise<number> {
    const notifications = userIds.map((userId) => ({
      userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      isRead: false,
      metadata: notification.metadata || null,
    }));

    await db.insert(userNotifications).values(notifications);

    console.log(`Created ${notifications.length} bulk notifications`);

    return notifications.length;
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<void> {
    await db
      .update(userNotifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(userNotifications.id, notificationId),
          eq(userNotifications.userId, userId)
        )
      );
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<number> {
    const result = await db
      .update(userNotifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(userNotifications.userId, userId),
          eq(userNotifications.isRead, false)
        )
      )
      .returning();

    return result.length;
  }

  /**
   * Get user notifications with pagination
   */
  static async getUserNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<UserNotification[]> {
    return await db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get unread count for user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, userId),
          eq(userNotifications.isRead, false)
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Get notification summary for user
   */
  static async getNotificationSummary(userId: string): Promise<NotificationSummary> {
    const allNotifications = await db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId));

    const unread = allNotifications.filter((n) => !n.isRead).length;

    const byType: Record<string, number> = {};
    allNotifications.forEach((n) => {
      byType[n.type] = (byType[n.type] || 0) + 1;
    });

    return {
      total: allNotifications.length,
      unread,
      byType,
    };
  }

  /**
   * Get user notification preferences
   */
  static async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    return prefs[0] || null;
  }

  /**
   * Update user notification preferences
   */
  static async updatePreferences(
    userId: string,
    preferences: Partial<Omit<typeof notificationPreferences.$inferInsert, 'id' | 'userId'>>
  ): Promise<NotificationPreferences> {
    const existing = await this.getUserPreferences(userId);

    if (existing) {
      const updated = await db
        .update(notificationPreferences)
        .set({
          ...preferences,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.userId, userId))
        .returning();

      return updated[0];
    } else {
      const created = await db
        .insert(notificationPreferences)
        .values({
          userId,
          emailNotifications: preferences.emailNotifications ?? true,
          inAppNotifications: preferences.inAppNotifications ?? true,
          coursePurchaseNotifications: preferences.coursePurchaseNotifications ?? true,
          courseVersionNotifications: preferences.courseVersionNotifications ?? true,
          payoutNotifications: preferences.payoutNotifications ?? true,
          reviewNotifications: preferences.reviewNotifications ?? true,
        })
        .returning();

      return created[0];
    }
  }

  /**
   * Send email via MailerSend API
   * Supports organization branding for the sender name
   */
  static async sendEmail(input: SendEmailInput): Promise<typeof emailLogs.$inferSelect> {
    try {
      const branding = input.branding 
        || (input.organizationId ? await this.getOrganizationBranding(input.organizationId) : DEFAULT_BRANDING);

      const htmlContent = input.htmlContent || '';
      const textContent = input.textContent || htmlContent.replace(/<[^>]*>/g, '');

      const transportResult = await sendRawEmail({
        from: {
          email: (await IntegrationConfigService.getSetting<string>('mailersend', 'fromEmail')) || getEmailFrom(),
          name: branding.orgName,
        },
        to: [{ email: input.to }],
        subject: input.subject,
        html: htmlContent,
        text: textContent,
        attachments: input.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || 'application/octet-stream',
        })),
      });

      if (!transportResult.success) {
        throw new Error(transportResult.error || 'Email send failed');
      }

      const emailLog = await db
        .insert(emailLogs)
        .values({
          recipientEmail: input.to,
          subject: input.subject,
          templateType: input.templateId || null,
          status: 'sent',
        })
        .returning();

      console.log(`Email sent to ${maskEmail(input.to)}: ${input.subject}`);

      return emailLog[0];
    } catch (error: any) {
      console.error('Failed to send email:', error.message);

      const emailLog = await db
        .insert(emailLogs)
        .values({
          recipientEmail: input.to,
          subject: input.subject,
          templateType: input.templateId || null,
          status: 'failed',
          errorMessage: error.message,
        })
        .returning();

      throw error;
    }
  }

  /**
   * Send course purchase confirmation email
   * Supports organization branding - pass userId to look up user's organization branding
   */
  static async sendCoursePurchaseEmail(
    userEmail: string,
    userName: string,
    courseTitle: string,
    amount: number,
    currency: string,
    receiptUrl?: string,
    userId?: string
  ): Promise<void> {
    const branding = userId 
      ? await this.getBrandingForUser(userId)
      : DEFAULT_BRANDING;

    const subject = `Course Purchase Confirmation - ${courseTitle}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Thank You for Your Purchase!</h2>
        <p>Hi ${userName},</p>
        <p>Your purchase of <strong>${courseTitle}</strong> has been confirmed.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Order Summary</h3>
          <p><strong>Course:</strong> ${courseTitle}</p>
          <p><strong>Amount Paid:</strong> ${currency} ${amount.toFixed(2)}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        ${receiptUrl ? `<p><a href="${receiptUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Download Receipt</a></p>` : ''}
        <p>You can now access your course from your dashboard.</p>
        <p>Happy learning!</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 40px;">
          ${branding.orgName} - Gamified Education Platform
        </p>
      </div>
    `;

    await this.sendEmail({
      to: userEmail,
      subject,
      htmlContent,
      branding,
    });
  }

  /**
   * Send course version update notification email
   * Supports organization branding - pass userId to look up user's organization branding
   */
  static async sendVersionUpdateEmail(
    userEmail: string,
    userName: string,
    courseTitle: string,
    versionNumber: string,
    upgradePrice: number,
    currency: string,
    upgradeUrl: string,
    userId?: string
  ): Promise<void> {
    const branding = userId 
      ? await this.getBrandingForUser(userId)
      : DEFAULT_BRANDING;

    const subject = `New Version Available - ${courseTitle}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">New Course Version Available!</h2>
        <p>Hi ${userName},</p>
        <p>Great news! A new version (<strong>${versionNumber}</strong>) of <strong>${courseTitle}</strong> is now available.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Upgrade at a Special Price</h3>
          <p><strong>Course:</strong> ${courseTitle}</p>
          <p><strong>Version:</strong> ${versionNumber}</p>
          <p><strong>Upgrade Price:</strong> ${currency} ${upgradePrice.toFixed(2)}</p>
        </div>
        <p><a href="${upgradeUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now</a></p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 40px;">
          ${branding.orgName} - Gamified Education Platform
        </p>
      </div>
    `;

    await this.sendEmail({
      to: userEmail,
      subject,
      htmlContent,
      branding,
    });
  }

  /**
   * Send payout notification email to organization admin
   * Supports organization branding - pass organizationId to look up organization branding
   */
  static async sendPayoutNotificationEmail(
    adminEmail: string,
    adminName: string,
    organizationName: string,
    amount: number,
    currency: string,
    payoutDate: Date,
    invoiceUrl?: string,
    organizationId?: string
  ): Promise<void> {
    const branding = organizationId 
      ? await this.getOrganizationBranding(organizationId)
      : DEFAULT_BRANDING;

    const subject = `Payout Processed - ${organizationName}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Payout Processed</h2>
        <p>Hi ${adminName},</p>
        <p>Your payout for <strong>${organizationName}</strong> has been processed.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Payout Details</h3>
          <p><strong>Organization:</strong> ${organizationName}</p>
          <p><strong>Amount:</strong> ${currency} ${amount.toFixed(2)}</p>
          <p><strong>Date:</strong> ${payoutDate.toLocaleDateString()}</p>
        </div>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Download Invoice</a></p>` : ''}
        <p>The funds should reflect in your registered bank account within 2-5 business days.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 40px;">
          ${branding.orgName} - Gamified Education Platform
        </p>
      </div>
    `;

    await this.sendEmail({
      to: adminEmail,
      subject,
      htmlContent,
      branding,
    });
  }

  /**
   * Send course purchase receipt email to buyer
   * Sends a detailed receipt with transaction information
   */
  static async sendCoursePurchaseReceipt(purchaseData: {
    buyerEmail: string;
    buyerName: string;
    courseName: string;
    coursePrice: string;
    currency: string;
    purchaseDate: Date;
    transactionId: string;
    courseId: string;
    organizationId?: string;
  }): Promise<void> {
    try {
      // Always use platform branding for course purchase emails (not org branding)
      const branding = DEFAULT_BRANDING;

      const baseUrl = getBaseUrl();
      
      const courseAccessUrl = `${baseUrl}/my-courses`;
      const invoicesUrl = `${baseUrl}/invoices`;
      const formattedDate = purchaseData.purchaseDate.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const subject = `Receipt: ${purchaseData.courseName} - Purchase Confirmed`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #7c3aed; margin-bottom: 24px;">Purchase Receipt</h2>
          
          <p style="font-size: 16px;">Hi ${purchaseData.buyerName},</p>
          
          <p style="font-size: 16px;">Thank you for your purchase! Your transaction has been completed successfully.</p>
          
          <div style="background-color: #f3f4f6; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #374151;">Order Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Course:</td>
                <td style="padding: 8px 0; font-weight: bold;">${purchaseData.courseName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount Paid:</td>
                <td style="padding: 8px 0; font-weight: bold;">${purchaseData.currency} ${purchaseData.coursePrice}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Transaction ID:</td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${purchaseData.transactionId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                <td style="padding: 8px 0;">${formattedDate}</td>
              </tr>
            </table>
          </div>
          
          <p style="font-size: 16px;">You now have full access to your course. Start learning today!</p>
          
          <a href="${courseAccessUrl}" 
             style="display: inline-block; background-color: #7c3aed; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 16px 0;">
            Access Your Courses
          </a>
          
          <p style="font-size: 14px; margin-top: 24px; color: #374151;">
            You can download your invoice anytime from your account:
          </p>
          
          <a href="${invoicesUrl}" 
             style="display: inline-block; background-color: #f3f4f6; color: #374151; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 8px 0; border: 1px solid #e5e7eb;">
            View Your Invoices
          </a>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
            If you have any questions about your purchase, please contact ${branding.supportEmail || 'support@learnplay.co.za'}.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            ${branding.orgName} - Gamified Education Platform
          </p>
        </div>
      `;

      await this.sendEmail({
        to: purchaseData.buyerEmail,
        subject,
        htmlContent,
        branding,
      });

      console.log(`[NotificationService] Course purchase receipt sent to ${maskEmail(purchaseData.buyerEmail)}`);
    } catch (error: any) {
      console.error(`[NotificationService] Failed to send purchase receipt:`, error.message);
    }
  }

  /**
   * Send sales notification to organization admins when a course is purchased
   * Notifies all org_admin users of the course's organization
   */
  static async sendSalesNotificationToOrgAdmins(purchaseData: {
    courseId: string;
    courseName: string;
    buyerName: string;
    purchaseAmount: string;
    currency: string;
    organizationId: string;
    transactionId: string;
    purchaseDate: Date;
  }): Promise<void> {
    try {
      const orgAdminRoles = await db
        .select({
          userId: userOrganizationRoles.userId,
        })
        .from(userOrganizationRoles)
        .where(
          and(
            eq(userOrganizationRoles.organizationId, purchaseData.organizationId),
            eq(userOrganizationRoles.role, 'org_admin')
          )
        );

      if (orgAdminRoles.length === 0) {
        console.log(`[NotificationService] No org admins found for organization ${purchaseData.organizationId}`);
        return;
      }

      const adminUserIds = orgAdminRoles.map(r => r.userId);
      const adminUsers = await db
        .select({
          id: users.id,
          email: users.email,
          gamerName: users.gamerName,
          firstName: users.firstName,
        })
        .from(users)
        .where(inArray(users.id, adminUserIds));

      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, purchaseData.organizationId))
        .limit(1);

      const orgName = org?.name || 'Your Organization';

      // Always use platform branding for sales notifications (not org branding)
      const branding = DEFAULT_BRANDING;
      
      const formattedDate = purchaseData.purchaseDate.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const baseUrl = getBaseUrl();
      
      const salesDashboardUrl = `${baseUrl}/admin/sales-dashboard`;

      for (const admin of adminUsers) {
        const adminName = admin.firstName || admin.gamerName || 'Admin';
        const subject = `New Sale: ${purchaseData.courseName}`;

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #10b981; margin-bottom: 24px;">🎉 New Course Sale!</h2>
            
            <p style="font-size: 16px;">Hi ${adminName},</p>
            
            <p style="font-size: 16px;">Great news! A new sale has been made for <strong>${orgName}</strong>.</p>
            
            <div style="background-color: #ecfdf5; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10b981;">
              <h3 style="margin-top: 0; color: #065f46;">Sale Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Course:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${purchaseData.courseName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Buyer:</td>
                  <td style="padding: 8px 0;">${purchaseData.buyerName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Amount:</td>
                  <td style="padding: 8px 0; font-weight: bold; color: #10b981;">${purchaseData.currency} ${purchaseData.purchaseAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Transaction ID:</td>
                  <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${purchaseData.transactionId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                  <td style="padding: 8px 0;">${formattedDate}</td>
                </tr>
              </table>
            </div>
            
            <a href="${salesDashboardUrl}" 
               style="display: inline-block; background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 16px 0;">
              View Sales Dashboard
            </a>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              ${branding.orgName} - Gamified Education Platform
            </p>
          </div>
        `;

        try {
          await this.sendEmail({
            to: admin.email,
            subject,
            htmlContent,
            branding,
          });
          console.log(`[NotificationService] Sales notification sent to org admin ${maskEmail(admin.email)}`);
        } catch (emailError: any) {
          console.error(`[NotificationService] Failed to send sales notification to ${maskEmail(admin.email)}:`, emailError.message);
        }
      }

      console.log(`[NotificationService] Sales notifications sent to ${adminUsers.length} org admin(s)`);
    } catch (error: any) {
      console.error(`[NotificationService] Failed to send sales notifications to org admins:`, error.message);
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  static async deleteOldNotifications(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await db
      .delete(userNotifications)
      .where(sql`${userNotifications.createdAt} < ${cutoffDate}`)
      .returning();

    console.log(`Deleted ${result.length} old notifications`);

    return result.length;
  }
}
