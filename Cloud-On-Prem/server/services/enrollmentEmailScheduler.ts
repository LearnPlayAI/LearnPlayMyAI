import { db } from '../db';
import { users } from '@shared/schema';
import { eq, or } from 'drizzle-orm';
import { shouldRunJob, markJobRun } from './schedulerRunGuard';
import { sendRawEmail } from './emailTransport';
import { RevenueTrackingService } from './revenueTrackingService';
import { getEmailFrom } from '../config/base-url';
import { IntegrationConfigService } from './integrationConfigService';

export class EnrollmentEmailScheduler {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;

  static start(): void {
    console.log('[EnrollmentEmailScheduler] Starting enrollment email scheduler...');

    setTimeout(() => {
      this.runDailyTasks();
    }, 30000);

    this.intervalId = setInterval(() => {
      this.runDailyTasks();
    }, 24 * 60 * 60 * 1000);

    console.log('[EnrollmentEmailScheduler] Scheduler started - will run daily');
  }

  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[EnrollmentEmailScheduler] Scheduler stopped');
    }
  }

  static async runDailyTasks(): Promise<void> {
    const canRun = await shouldRunJob('daily_enrollment_email', 24 * 60 * 60 * 1000);
    if (!canRun) {
      console.log('[EnrollmentEmailScheduler] Daily tasks already ran within 24h, skipping');
      return;
    }

    if (this.isRunning) {
      console.warn('[EnrollmentEmailScheduler] Daily tasks already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      console.log('[EnrollmentEmailScheduler] Running daily enrollment email task...');

      const mailerSendApiKey = await IntegrationConfigService.getSecret('mailersend', 'apiKey');
      const smtpHost = await IntegrationConfigService.getSetting<string>('smtp', 'host');
      if (!String(smtpHost || '').trim() && !mailerSendApiKey) {
        console.warn('[EnrollmentEmailScheduler] No email transport configured, skipping');
        await markJobRun('daily_enrollment_email');
        return;
      }

      const recipients = await db
        .select({ id: users.id, email: users.email, gamerName: users.gamerName })
        .from(users)
        .where(or(eq(users.isSuperAdmin, true), eq(users.isCustSuper, true)));

      const validRecipients = recipients.filter(r => r.email && r.email.trim() !== '');
      if (validRecipients.length === 0) {
        console.warn('[EnrollmentEmailScheduler] No SuperAdmin/CustSuper users with email found, skipping');
        await markJobRun('daily_enrollment_email');
        return;
      }

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const startDate = yesterday.toISOString();
      const endDate = now.toISOString();

      const result = await RevenueTrackingService.getEnrollmentDetails(null, {
        page: 1,
        limit: 500,
        startDate,
        endDate,
      });

      if (!result.enrollments || result.enrollments.length === 0) {
        console.log('[EnrollmentEmailScheduler] No enrollments in last 24h, skipping email');
        await markJobRun('daily_enrollment_email');
        return;
      }

      const enrollments = result.enrollments;
      const totalEnrollments = result.total || enrollments.length;
      const isTruncated = totalEnrollments > enrollments.length;
      const purchases = enrollments.filter(e => e.source === 'purchase').length;
      const assignments = enrollments.filter(e => e.source === 'assignment').length;
      const direct = enrollments.filter(e => e.source === 'progress_only').length;

      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const enrollmentRows = enrollments.map((e, i) => {
        const bgColor = i % 2 === 0 ? '#ffffff' : '#f9fafb';
        const enrollDate = e.enrollmentDate
          ? new Date(e.enrollmentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'N/A';
        const sourceLabel = e.source === 'purchase' ? 'Purchase' : e.source === 'assignment' ? 'Assignment' : 'Direct';
        const statusLabel = e.status === 'completed' ? 'Completed' : e.status === 'in_progress' ? 'In Progress' : 'Not Started';
        return `<tr style="background:${bgColor}">
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.userName)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.userEmail)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.courseTitle)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.organizationName)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${enrollDate}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${sourceLabel}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${statusLabel}</td>
        </tr>`;
      }).join('');

      const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px">
  <div style="background:#16a34a;padding:20px;color:#fff">
    <h1 style="margin:0;font-size:20px">Daily Enrollment Summary</h1>
    <p style="margin:4px 0 0;opacity:0.9;font-size:14px">${dateStr}</p>
  </div>
  <div style="padding:20px">
    <div style="display:flex;gap:20px;margin-bottom:20px">
      <div style="flex:1;text-align:center;padding:12px;background:#f0fdf4;border-radius:8px">
        <div style="font-size:24px;font-weight:bold;color:#16a34a">${totalEnrollments}</div>
        <div style="font-size:12px;color:#666">New Enrollments${isTruncated ? ' (total)' : ''}</div>
      </div>
      <div style="flex:1;text-align:center;padding:12px;background:#eff6ff;border-radius:8px">
        <div style="font-size:24px;font-weight:bold;color:#2563eb">${purchases}</div>
        <div style="font-size:12px;color:#666">Purchases</div>
      </div>
      <div style="flex:1;text-align:center;padding:12px;background:#fef3c7;border-radius:8px">
        <div style="font-size:24px;font-weight:bold;color:#d97706">${assignments}</div>
        <div style="font-size:12px;color:#666">Assignments</div>
      </div>
      <div style="flex:1;text-align:center;padding:12px;background:#f3e8ff;border-radius:8px">
        <div style="font-size:24px;font-weight:bold;color:#7c3aed">${direct}</div>
        <div style="font-size:12px;color:#666">Direct</div>
      </div>
    </div>
    ${isTruncated ? `<div style="padding:10px 12px;margin-bottom:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:13px;color:#92400e">Showing ${enrollments.length} of ${totalEnrollments} enrollments. Log in to the platform to view all.</div>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Student</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Email</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Course</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Organization</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Date</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Source</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Status</th>
        </tr>
      </thead>
      <tbody>
        ${enrollmentRows}
      </tbody>
    </table>
  </div>
  <div style="padding:16px 20px;background:#f9fafb;text-align:center;font-size:12px;color:#9ca3af">
    This is an automated email from LearnPlay Platform
  </div>
</div>
</body>
</html>`;

      const emailResult = await sendRawEmail({
        from: { email: getEmailFrom(), name: 'LearnPlay Platform' },
        to: validRecipients.map(r => ({ email: r.email, name: r.gamerName || 'Admin' })),
        subject: `Daily Enrollment Summary - ${now.toLocaleDateString()}`,
        html: htmlContent,
      });

      if (emailResult.success) {
        console.log(`[EnrollmentEmailScheduler] Daily enrollment summary sent to ${validRecipients.length} recipients (${totalEnrollments} enrollments)`);
      } else {
        console.error('[EnrollmentEmailScheduler] Failed to send enrollment summary:', emailResult.error);
      }

      await markJobRun('daily_enrollment_email');
      console.log('[EnrollmentEmailScheduler] Daily enrollment email task completed');

    } catch (error: any) {
      console.error('[EnrollmentEmailScheduler] Error running daily tasks:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
