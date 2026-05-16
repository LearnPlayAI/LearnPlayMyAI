import { db } from '../db';
import { eq, and, lte, gte, isNull, isNotNull, notInArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { packageEmailService } from '../services/packageEmailService';
import { getBaseUrl } from '../config/base-url';

export class TrialExpiryScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    console.log('[TrialExpiryScheduler] Starting scheduler...');
    await this.checkAndSendWarnings();
    this.intervalId = setInterval(async () => {
      await this.checkAndSendWarnings();
    }, 24 * 60 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkAndSendWarnings(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const orgsWithActiveSubscriptions = db.select({
        orgId: schema.organizationPackageAssignments.organizationId,
      })
        .from(schema.organizationPackageAssignments)
        .where(eq(schema.organizationPackageAssignments.status, 'active'));

      const expiringOrgs = await db.select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        trialEndDate: schema.organizations.trialEndDate,
      })
        .from(schema.organizations)
        .where(
          and(
            eq(schema.organizations.isActive, true),
            eq(schema.organizations.isDemo, false),
            isNotNull(schema.organizations.trialEndDate),
            gte(schema.organizations.trialEndDate, now),
            lte(schema.organizations.trialEndDate, sevenDaysFromNow),
            notInArray(schema.organizations.id, orgsWithActiveSubscriptions)
          )
        );

      for (const org of expiringOrgs) {
        if (!org.trialEndDate) continue;
        
        const daysRemaining = Math.ceil(
          (org.trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
        
        if (![7, 3, 1].includes(daysRemaining)) continue;
        
        const orgAdmins = await db.select({
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          gamerName: schema.users.gamerName,
        })
          .from(schema.userOrganizationRoles)
          .innerJoin(schema.users, eq(schema.users.id, schema.userOrganizationRoles.userId))
          .where(
            and(
              eq(schema.userOrganizationRoles.organizationId, org.id),
              eq(schema.userOrganizationRoles.role, 'org_admin'),
              eq(schema.users.emailVerified, true),
              isNotNull(schema.users.email)
            )
          );

        for (const admin of orgAdmins) {
          const adminName = admin.firstName && admin.lastName 
            ? `${admin.firstName} ${admin.lastName}` 
            : admin.gamerName || 'Administrator';
          
          const success = await packageEmailService.sendTrialExpiryWarning(
            admin.email!,
            adminName,
            org.name,
            daysRemaining,
            `${getBaseUrl()}/organizations/${org.id}/subscription`
          );
          if (success) sent++;
          else failed++;
        }
      }
    } catch (err) {
      console.error('[TrialExpiryScheduler] Error:', err);
    }

    console.log(`[TrialExpiryScheduler] Sent ${sent} warnings, ${failed} failed`);
    return { sent, failed };
  }
}

export const trialExpiryScheduler = new TrialExpiryScheduler();
