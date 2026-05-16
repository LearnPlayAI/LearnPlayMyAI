import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { enterpriseCustomers, enterpriseLicenseKeys, enterpriseLicenseRequests, enterpriseSystems } from '@shared/schema';
import { sendRawEmail } from './emailTransport';
import { getBaseUrl, getEmailFrom } from '../config/base-url';
import { shouldRunJob, markJobRun } from './schedulerRunGuard';

class EnterpriseLicenseSchedulerService {
  private static instance: EnterpriseLicenseSchedulerService;
  private intervalId: NodeJS.Timeout | null = null;

  static getInstance(): EnterpriseLicenseSchedulerService {
    if (!this.instance) this.instance = new EnterpriseLicenseSchedulerService();
    return this.instance;
  }

  start(): void {
    if (process.env.ONPREM_MODE === 'true') {
      return;
    }
    if (this.intervalId) {
      return;
    }

    this.run().catch((err) => {
      console.error('[EnterpriseLicenseScheduler] Initial run failed:', err);
    });

    this.intervalId = setInterval(() => {
      this.run().catch((err) => {
        console.error('[EnterpriseLicenseScheduler] Scheduled run failed:', err);
      });
    }, 6 * 60 * 60 * 1000);

    console.log('[EnterpriseLicenseScheduler] Started (runs every 6 hours)');
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private async run(): Promise<void> {
    const canRun = await shouldRunJob('enterprise_license_daily', 24 * 60 * 60 * 1000);
    if (!canRun) {
      return;
    }

    const requests = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.status, 'approved'));

    for (const request of requests) {
      const [latestKey] = await db
        .select()
        .from(enterpriseLicenseKeys)
        .where(and(
          eq(enterpriseLicenseKeys.licenseRequestId, request.id),
          eq(enterpriseLicenseKeys.isRevoked, false),
        ))
        .orderBy(desc(enterpriseLicenseKeys.createdAt))
        .limit(1);

      if (!latestKey?.expiresAt) {
        continue;
      }

      const now = new Date();
      const expiry = new Date(latestKey.expiresAt);
      const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const graceDays = request.graceDays && request.graceDays >= 0 ? request.graceDays : 15;

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, request.enterpriseCustomerId))
        .limit(1);

      const systems = await db
        .select({ alertEmails: enterpriseSystems.alertEmails })
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.activeLicenseRequestId, request.id));

      const recipients = this.collectRecipients(customer?.email || null, systems.map((s) => s.alertEmails));

      if (recipients.length > 0) {
        if (daysUntilExpiry <= 5 && daysUntilExpiry >= 0 && !request.reminder5SentAt) {
          await this.sendReminderEmail(recipients, customer?.contactPersonName || null, customer?.companyName || 'Enterprise Customer', expiry, 5);
          await db.update(enterpriseLicenseRequests).set({ reminder5SentAt: now, updatedAt: now }).where(eq(enterpriseLicenseRequests.id, request.id));
        }

        if (daysUntilExpiry <= 3 && daysUntilExpiry >= 0 && !request.reminder3SentAt) {
          await this.sendReminderEmail(recipients, customer?.contactPersonName || null, customer?.companyName || 'Enterprise Customer', expiry, 3);
          await db.update(enterpriseLicenseRequests).set({ reminder3SentAt: now, updatedAt: now }).where(eq(enterpriseLicenseRequests.id, request.id));
        }

        if (daysUntilExpiry <= 1 && daysUntilExpiry >= 0 && !request.reminder1SentAt) {
          await this.sendReminderEmail(recipients, customer?.contactPersonName || null, customer?.companyName || 'Enterprise Customer', expiry, 1);
          await db.update(enterpriseLicenseRequests).set({ reminder1SentAt: now, updatedAt: now }).where(eq(enterpriseLicenseRequests.id, request.id));
        }

        const overdueDays = daysUntilExpiry < 0 ? Math.abs(daysUntilExpiry) : 0;
        if (overdueDays > 0 && !request.overdueNoticeSentAt) {
          await this.sendOverdueEmail(recipients, customer?.contactPersonName || null, customer?.companyName || 'Enterprise Customer', overdueDays, graceDays);
          await db.update(enterpriseLicenseRequests).set({ overdueNoticeSentAt: now, updatedAt: now }).where(eq(enterpriseLicenseRequests.id, request.id));
        }
      }

      let status: 'active' | 'grace' | 'expired' = 'active';
      if (daysUntilExpiry < 0) {
        const overdueDays = Math.abs(daysUntilExpiry);
        status = overdueDays <= graceDays ? 'grace' : 'expired';
      }

      await db
        .update(enterpriseSystems)
        .set({
          licenseStatus: status,
          licenseExpiresAt: expiry,
          billingStatus: daysUntilExpiry < 0 ? 'overdue' : request.billingStatus,
          updatedAt: now,
        })
        .where(eq(enterpriseSystems.activeLicenseRequestId, request.id));
    }

    await markJobRun('enterprise_license_daily');
    console.log(`[EnterpriseLicenseScheduler] Processed ${requests.length} approved license requests`);
  }

  private async sendReminderEmail(
    toEmails: string[],
    contactName: string | null,
    companyName: string,
    expiry: Date,
    daysLeft: number,
  ): Promise<void> {
    const fromEmail = getEmailFrom();
    const portalUrl = `${getBaseUrl()}/enterprise/licenses`;

    await sendRawEmail({
      from: { email: fromEmail, name: 'LearnPlay Enterprise' },
      to: toEmails.map((email) => ({ email, name: contactName || companyName })),
      subject: `License renewal reminder: ${daysLeft} day(s) remaining`,
      html: `
        <h3>On-Prem License Renewal Reminder</h3>
        <p>Hello ${contactName || companyName},</p>
        <p>Your current on-prem license will expire on <strong>${expiry.toLocaleDateString()}</strong>.</p>
        <p>Time remaining: <strong>${daysLeft} day(s)</strong>.</p>
        <p>Please ensure your system checks in to cloud PRD to receive the monthly renewal key.</p>
        <p><a href="${portalUrl}">Open Enterprise Portal</a></p>
      `,
    });
  }

  private async sendOverdueEmail(
    toEmails: string[],
    contactName: string | null,
    companyName: string,
    overdueDays: number,
    graceDays: number,
  ): Promise<void> {
    const fromEmail = getEmailFrom();
    const portalUrl = `${getBaseUrl()}/enterprise/licenses`;
    const graceRemaining = Math.max(graceDays - overdueDays, 0);

    await sendRawEmail({
      from: { email: fromEmail, name: 'LearnPlay Enterprise' },
      to: toEmails.map((email) => ({ email, name: contactName || companyName })),
      subject: 'On-Prem license overdue',
      html: `
        <h3>On-Prem License Overdue Notice</h3>
        <p>Hello ${contactName || companyName},</p>
        <p>Your on-prem license is currently overdue by <strong>${overdueDays} day(s)</strong>.</p>
        <p>Grace period remaining: <strong>${graceRemaining} day(s)</strong>.</p>
        <p>After grace expires, platform features will revert to unlicensed policy restrictions.</p>
        <p><a href="${portalUrl}">Open Enterprise Portal</a></p>
      `,
    });
  }

  private collectRecipients(primaryEmail: string | null, alertEmailBlobs: Array<string | null>): string[] {
    const recipients = new Set<string>();
    if (primaryEmail && primaryEmail.includes('@')) {
      recipients.add(primaryEmail.trim().toLowerCase());
    }
    for (const blob of alertEmailBlobs) {
      if (!blob) continue;
      const list = blob.split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.includes('@'));
      for (const email of list) recipients.add(email);
    }
    return Array.from(recipients);
  }
}

export const EnterpriseLicenseScheduler = EnterpriseLicenseSchedulerService.getInstance();
