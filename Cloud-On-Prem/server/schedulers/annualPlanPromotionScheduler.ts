import { db } from '../db';
import { eq, and, isNotNull } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { packageEmailService } from '../services/packageEmailService';
import { businessPackageService } from '../services/businessPackageService';

export class AnnualPlanPromotionScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    console.log('[AnnualPlanPromotionScheduler] Starting scheduler...');
    
    // Check if we should run now (1st of month)
    await this.checkAndRun();
    
    // Schedule to check daily at midnight
    this.intervalId = setInterval(async () => {
      await this.checkAndRun();
    }, 24 * 60 * 60 * 1000); // Check daily
    
    console.log('[AnnualPlanPromotionScheduler] Scheduler started - checking daily at midnight');
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[AnnualPlanPromotionScheduler] Scheduler stopped');
  }

  private async checkAndRun(): Promise<void> {
    const today = new Date();
    // Only run on the 1st of the month
    if (today.getDate() !== 1) {
      return;
    }
    
    console.log('[AnnualPlanPromotionScheduler] Running monthly promotion job...');
    await this.sendPromotions();
  }

  async sendPromotions(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    try {
      // 1. Get all organizations with monthly package assignments
      const monthlyAssignments = await db.select()
        .from(schema.organizationPackageAssignments)
        .where(and(
          eq(schema.organizationPackageAssignments.interval, 'monthly'),
          eq(schema.organizationPackageAssignments.status, 'active')
        ));

      for (const assignment of monthlyAssignments) {
        try {
          // 2. Get package details
          const pkg = await businessPackageService.getPackageById(assignment.packageId);
          if (!pkg || !pkg.annualDiscountPercent || parseFloat(pkg.annualDiscountPercent) <= 0) {
            continue; // Skip if no annual discount
          }

          // 3. Get org admin for this organization
          const orgAdmins = await db.select({
            userId: schema.userOrganizationRoles.userId,
            email: schema.users.email,
            name: schema.users.gamerName,
            orgName: schema.organizations.name
          })
            .from(schema.userOrganizationRoles)
            .innerJoin(schema.users, eq(schema.users.id, schema.userOrganizationRoles.userId))
            .innerJoin(schema.organizations, eq(schema.organizations.id, schema.userOrganizationRoles.organizationId))
            .where(and(
              eq(schema.userOrganizationRoles.organizationId, assignment.organizationId),
              eq(schema.userOrganizationRoles.role, 'org_admin'),
              eq(schema.users.emailVerified, true),
              isNotNull(schema.users.email)
            ));

          // 4. Get current pricing
          const price = await businessPackageService.getPackagePrice(
            assignment.packageId,
            assignment.currency
          );
          if (!price) continue;

          // 5. Calculate monthly and annual prices
          const monthlyTotal = (
            parseFloat(price.pricePerLearner) * pkg.maxLearners +
            parseFloat(price.pricePerTeacher) * pkg.maxTeachers +
            parseFloat(price.pricePerOrgAdmin) * pkg.maxOrgAdmins
          );
          const annualDiscount = parseFloat(pkg.annualDiscountPercent) / 100;
          const annualTotal = monthlyTotal * 12 * (1 - annualDiscount);

          // 6. Send email to each org admin
          for (const admin of orgAdmins) {
            const success = await packageEmailService.sendAnnualPlanPromotion(
              assignment.organizationId,
              admin.email!,
              admin.name || 'Administrator',
              pkg.name,
              monthlyTotal,
              annualTotal,
              parseFloat(pkg.annualDiscountPercent),
              assignment.currency,
              pkg.valueProposition || `Save ${pkg.annualDiscountPercent}% by switching to annual billing!`
            );
            
            if (success) sent++;
            else failed++;
          }
        } catch (err) {
          console.error('[AnnualPlanPromotionScheduler] Error processing assignment:', err);
          failed++;
        }
      }
    } catch (err) {
      console.error('[AnnualPlanPromotionScheduler] Error in sendPromotions:', err);
    }

    console.log(`[AnnualPlanPromotionScheduler] Completed: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }
}

export const annualPlanPromotionScheduler = new AnnualPlanPromotionScheduler();
