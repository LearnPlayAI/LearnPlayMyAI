import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { users, organizations, userOrganizationRoles } from '@shared/schema';
import { sendRawEmail } from './emailTransport';
import { getBaseUrl } from '../config/base-url';

interface OrgAdminInfo {
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
}

interface PriceInfo {
  currency: string;
  pricePerLearner: string;
  pricePerTeacher: string;
}

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

const DEFAULT_BRANDING = {
  primaryColor: '#6b46c1',
  secondaryColor: '#4c1d95',
  accentColor: '#10b981',
  fontFamily: 'Inter, Arial, sans-serif',
};

export class PackageEmailService {
  private salesEmail = 'sales@learnplay.co.za';
  private noReplyEmail = 'noreply@learnplay.co.za';
  private senderName = 'LearnPlay';

  private generateEmailWrapper(headerIcon: string, headerText: string, bodyContent: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: ${DEFAULT_BRANDING.fontFamily}; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, ${DEFAULT_BRANDING.primaryColor} 0%, ${DEFAULT_BRANDING.secondaryColor} 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: ${DEFAULT_BRANDING.primaryColor}; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
            .info { background: #dbeafe; border-left: 4px solid ${DEFAULT_BRANDING.primaryColor}; padding: 12px; margin: 20px 0; }
            .success { background: #d1fae5; border-left: 4px solid ${DEFAULT_BRANDING.accentColor}; padding: 12px; margin: 20px 0; }
            .alert { background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; }
            .price-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .price-table th, .price-table td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
            .price-table th { background: #f3f4f6; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">${headerIcon} ${headerText}</h1>
            </div>
            <div class="content">
              ${bodyContent}
            </div>
            <div class="footer">
              <p><a href="${getBaseUrl()}" style="color: ${DEFAULT_BRANDING.primaryColor}; text-decoration: none;">Visit LearnPlay</a> | <a href="mailto:support@learnplay.co.za" style="color: ${DEFAULT_BRANDING.primaryColor}; text-decoration: none;">support@learnplay.co.za</a></p>
              <p>© ${new Date().getFullYear()} LearnPlay. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async sendEmailInternal(
    fromEmail: string,
    recipientEmail: string,
    recipientName: string,
    subject: string,
    htmlContent: string
  ): Promise<boolean> {
    try {
      const result = await sendRawEmail({
        from: { email: fromEmail, name: this.senderName },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        html: htmlContent,
      });

      if (result.success) {
        console.log(`[PackageEmailService] Email sent successfully to ${maskEmail(recipientEmail)}`);
        return true;
      } else {
        console.error(`[PackageEmailService] Error sending email to ${maskEmail(recipientEmail)}: ${result.error}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[PackageEmailService] Error sending email to ${maskEmail(recipientEmail)}:`, error.message);
      return false;
    }
  }

  async getAllVerifiedOrgAdminEmails(): Promise<OrgAdminInfo[]> {
    try {
      const results = await db
        .select({
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          gamerName: users.gamerName,
          organizationId: organizations.id,
          organizationName: organizations.name,
        })
        .from(userOrganizationRoles)
        .innerJoin(users, eq(userOrganizationRoles.userId, users.id))
        .innerJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
        .where(
          and(
            eq(userOrganizationRoles.role, 'org_admin'),
            eq(users.emailVerified, true)
          )
        );

      return results.map(r => ({
        email: r.email,
        name: r.firstName && r.lastName 
          ? `${r.firstName} ${r.lastName}` 
          : r.gamerName || 'Organization Admin',
        organizationId: r.organizationId,
        organizationName: r.organizationName,
      }));
    } catch (error: any) {
      console.error('[PackageEmailService] Error fetching org admin emails:', error);
      return [];
    }
  }

  async sendPriceChangeNotification(
    packageName: string,
    oldPrices: PriceInfo[],
    newPrices: PriceInfo[],
    effectiveDate: Date
  ): Promise<{ sent: number; failed: number }> {
    const admins = await this.getAllVerifiedOrgAdminEmails();
    let sent = 0;
    let failed = 0;

    const formatDate = (date: Date) => date.toLocaleDateString('en-ZA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const buildPriceTable = (prices: PriceInfo[], label: string) => {
      return `
        <table class="price-table">
          <thead>
            <tr>
              <th colspan="3">${label}</th>
            </tr>
            <tr>
              <th>Currency</th>
              <th>Per Learner</th>
              <th>Per Teacher</th>
            </tr>
          </thead>
          <tbody>
            ${prices.map(p => `
              <tr>
                <td>${p.currency}</td>
                <td>${p.pricePerLearner}</td>
                <td>${p.pricePerTeacher}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    const subject = 'Important: LearnPlay Package Pricing Update';
    
    for (const admin of admins) {
      const bodyContent = `
        <p>Dear ${admin.name},</p>
        
        <p>We're writing to inform you about an upcoming update to the pricing for the <strong>${packageName}</strong> package.</p>
        
        <div class="info">
          <strong>Effective Date:</strong> ${formatDate(effectiveDate)}
        </div>
        
        ${buildPriceTable(oldPrices, 'Current Pricing')}
        ${buildPriceTable(newPrices, 'New Pricing (from ' + formatDate(effectiveDate) + ')')}
        
        <p>This change will apply to your organization <strong>${admin.organizationName}</strong> starting from the effective date.</p>
        
        <p>If you have any questions about this pricing update, please don't hesitate to reach out to our sales team.</p>
        
        <center>
          <a href="${getBaseUrl()}/billing" class="button">View Your Subscription</a>
        </center>
        
        <p>Best regards,<br/>The LearnPlay Team</p>
      `;

      const htmlContent = this.generateEmailWrapper('💰', 'Package Pricing Update', bodyContent);
      const success = await this.sendEmailInternal(this.salesEmail, admin.email, admin.name, subject, htmlContent);
      
      if (success) {
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[PackageEmailService] Price change notification: sent=${sent}, failed=${failed}`);
    return { sent, failed };
  }

  async sendAnnualPlanPromotion(
    organizationId: string,
    orgAdminEmail: string,
    orgAdminName: string,
    currentPackageName: string,
    monthlyPrice: number,
    annualPrice: number,
    annualDiscount: number,
    currency: string,
    valueProposition: string
  ): Promise<boolean> {
    const yearlySavings = (monthlyPrice * 12) - annualPrice;
    const discountPercent = Math.round(annualDiscount);
    
    const subject = `Save ${discountPercent}% with an Annual Plan`;
    
    const bodyContent = `
      <p>Dear ${orgAdminName},</p>
      
      <p>We noticed you're on the <strong>${currentPackageName}</strong> monthly plan. Did you know you could save significantly by switching to annual billing?</p>
      
      <div class="success">
        <strong>🎉 Annual Plan Savings</strong>
        <p style="margin: 10px 0;">Save <strong>${currency} ${yearlySavings.toFixed(2)}</strong> per year!</p>
        <p style="margin: 0;">That's <strong>${discountPercent}% off</strong> compared to monthly billing.</p>
      </div>
      
      <table class="price-table">
        <tr>
          <th>Billing Option</th>
          <th>Price</th>
          <th>Annual Cost</th>
        </tr>
        <tr>
          <td>Monthly</td>
          <td>${currency} ${monthlyPrice.toFixed(2)}/month</td>
          <td>${currency} ${(monthlyPrice * 12).toFixed(2)}/year</td>
        </tr>
        <tr style="background: #d1fae5;">
          <td><strong>Annual</strong></td>
          <td><strong>${currency} ${(annualPrice / 12).toFixed(2)}/month</strong></td>
          <td><strong>${currency} ${annualPrice.toFixed(2)}/year</strong></td>
        </tr>
      </table>
      
      <p><strong>Why choose annual billing?</strong></p>
      <p>${valueProposition}</p>
      
      <center>
        <a href="${getBaseUrl()}/billing/upgrade?plan=annual" class="button">Switch to Annual & Save</a>
      </center>
      
      <p>If you have any questions, our sales team is happy to help.</p>
      
      <p>Best regards,<br/>The LearnPlay Team</p>
    `;

    const htmlContent = this.generateEmailWrapper('💎', 'Exclusive Annual Plan Offer', bodyContent);
    return this.sendEmailInternal(this.salesEmail, orgAdminEmail, orgAdminName, subject, htmlContent);
  }

  async sendUserDisabledNotification(
    userEmail: string,
    userName: string,
    organizationName: string,
    orgAdminEmail: string
  ): Promise<boolean> {
    const subject = 'Your LearnPlay Account Status Update';
    
    const bodyContent = `
      <p>Dear ${userName},</p>
      
      <div class="alert">
        <strong>Account Status Update</strong>
        <p style="margin: 5px 0 0 0;">Your LearnPlay account has been temporarily disabled.</p>
      </div>
      
      <p>Due to a change in your organization's subscription at <strong>${organizationName}</strong>, your account access has been temporarily disabled.</p>
      
      <p><strong>What does this mean?</strong></p>
      <ul>
        <li>You will not be able to access LearnPlay features until your account is re-enabled</li>
        <li>Your data and progress are safely stored and will be available when access is restored</li>
      </ul>
      
      <p><strong>What should you do?</strong></p>
      <p>Please contact your organization administrator to request access restoration:</p>
      <p style="background: #f3f4f6; padding: 10px; border-radius: 4px;">
        <a href="mailto:${orgAdminEmail}" style="color: ${DEFAULT_BRANDING.primaryColor};">${orgAdminEmail}</a>
      </p>
      
      <p>We apologize for any inconvenience. If you believe this was done in error, please reach out to your organization administrator.</p>
      
      <p>Best regards,<br/>The LearnPlay Team</p>
    `;

    const htmlContent = this.generateEmailWrapper('🔒', 'Account Status Update', bodyContent);
    return this.sendEmailInternal(this.noReplyEmail, userEmail, userName, subject, htmlContent);
  }

  async sendUserReenabledNotification(
    userEmail: string,
    userName: string,
    organizationName: string
  ): Promise<boolean> {
    const subject = 'Welcome Back to LearnPlay!';
    
    const bodyContent = `
      <p>Dear ${userName},</p>
      
      <div class="success">
        <strong>🎉 Account Re-enabled!</strong>
        <p style="margin: 5px 0 0 0;">Your LearnPlay account has been restored.</p>
      </div>
      
      <p>Great news! Your organization <strong>${organizationName}</strong> has upgraded their subscription, and your account access has been fully restored.</p>
      
      <p><strong>What happens now?</strong></p>
      <ul>
        <li>✅ Full access to all LearnPlay features</li>
        <li>✅ Your previous data and progress have been preserved</li>
        <li>✅ Continue right where you left off</li>
      </ul>
      
      <center>
        <a href="${getBaseUrl()}/login" class="button">Log In Now</a>
      </center>
      
      <p>We're excited to have you back! If you have any questions, please don't hesitate to reach out to our support team.</p>
      
      <p>Best regards,<br/>The LearnPlay Team</p>
    `;

    const htmlContent = this.generateEmailWrapper('🎉', 'Welcome Back!', bodyContent);
    return this.sendEmailInternal(this.noReplyEmail, userEmail, userName, subject, htmlContent);
  }

  async sendTrialExpiryWarning(
    orgAdminEmail: string,
    orgAdminName: string,
    organizationName: string,
    daysRemaining: number,
    subscriptionUrl: string
  ): Promise<boolean> {
    const subject = `Your LearnPlay Trial Expires in ${daysRemaining} Days`;
    
    const urgencyClass = daysRemaining <= 3 ? 'alert' : 'warning';
    const urgencyIcon = daysRemaining <= 3 ? '⚠️' : '⏰';
    
    const bodyContent = `
      <p>Dear ${orgAdminName},</p>
      
      <div class="${urgencyClass}">
        <strong>${urgencyIcon} Trial Expiration Notice</strong>
        <p style="margin: 5px 0 0 0;">Your trial for <strong>${organizationName}</strong> expires in <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong>.</p>
      </div>
      
      <p>Don't lose access to these great features:</p>
      <ul>
        <li>✅ Unlimited course creation and management</li>
        <li>✅ AI-powered lesson generation</li>
        <li>✅ Interactive quizzes and assessments</li>
        <li>✅ Comprehensive learner analytics</li>
        <li>✅ Certificate generation</li>
        <li>✅ Team collaboration tools</li>
      </ul>
      
      <p>Subscribe now to ensure uninterrupted access for your organization.</p>
      
      <center>
        <a href="${subscriptionUrl}" class="button">Subscribe Now</a>
      </center>
      
      <p>Have questions? Our sales team is here to help you find the perfect plan for your needs.</p>
      
      <p>Best regards,<br/>The LearnPlay Team</p>
    `;

    const htmlContent = this.generateEmailWrapper('⏰', 'Trial Expiring Soon', bodyContent);
    return this.sendEmailInternal(this.salesEmail, orgAdminEmail, orgAdminName, subject, htmlContent);
  }
}

export const packageEmailService = new PackageEmailService();
