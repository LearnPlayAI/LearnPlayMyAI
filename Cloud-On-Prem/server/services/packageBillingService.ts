import { db } from '../db';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import {
  organizationPackageAssignments,
  businessPackages,
  businessPackagePrices,
  packageChangeEvents,
  userOrganizationRoles,
  users,
  OrganizationPackageAssignment,
  BusinessPackage,
  BusinessPackagePrice,
} from '@shared/schema';
import { businessPackageService } from './businessPackageService';
import { userSeatManagementService } from './userSeatManagementService';

interface ProrationResult {
  creditAmount: number;
  chargeAmount: number;
  netAmount: number;
  daysRemaining: number;
  calculation: string;
}

interface ScheduledDowngrade {
  organizationId: string;
  currentPackageId: string;
  newPackageId: string;
  effectiveDate: Date;
  selectedUserIds: {
    keepLearnerIds: string[];
    keepTeacherIds: string[];
    keepOrgAdminIds: string[];
  };
  disableUserIds: string[];
}

export class PackageBillingService {
  private getDaysInPeriod(interval: 'monthly' | 'annual'): number {
    return interval === 'annual' ? 365 : 30;
  }

  private calculatePackagePrice(
    price: BusinessPackagePrice,
    pkg: BusinessPackage,
    interval: 'monthly' | 'annual'
  ): number {
    const learnerCost = parseFloat(price.pricePerLearner) * pkg.maxLearners;
    const teacherCost = parseFloat(price.pricePerTeacher) * pkg.maxTeachers;
    const orgAdminCost = parseFloat(price.pricePerOrgAdmin) * pkg.maxOrgAdmins;
    const monthlyTotal = learnerCost + teacherCost + orgAdminCost;

    if (interval === 'annual') {
      const discountPercent = parseFloat(pkg.annualDiscountPercent || '10');
      const annualTotal = monthlyTotal * 12;
      return annualTotal * (1 - discountPercent / 100);
    }
    return monthlyTotal;
  }

  private getDailyRate(totalPrice: number, interval: 'monthly' | 'annual'): number {
    const days = this.getDaysInPeriod(interval);
    return totalPrice / days;
  }

  async calculateUpgradeProration(
    organizationId: string,
    newPackageId: string
  ): Promise<ProrationResult> {
    const [assignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    if (!assignment) {
      throw new Error('No active subscription found for organization');
    }

    const [currentPkg, newPkg] = await Promise.all([
      businessPackageService.getPackageById(assignment.packageId),
      businessPackageService.getPackageById(newPackageId),
    ]);

    if (!currentPkg || !newPkg) {
      throw new Error('Package not found');
    }

    const [currentPrice, newPrice] = await Promise.all([
      businessPackageService.getPackagePrice(assignment.packageId, assignment.currency),
      businessPackageService.getPackagePrice(newPackageId, assignment.currency),
    ]);

    if (!currentPrice || !newPrice) {
      throw new Error('Package pricing not found for currency: ' + assignment.currency);
    }

    const now = new Date();
    const periodEnd = new Date(assignment.currentPeriodEnd);
    const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const currentTotal = this.calculatePackagePrice(currentPrice, currentPkg, assignment.interval);
    const newTotal = this.calculatePackagePrice(newPrice, newPkg, assignment.interval);

    const currentDailyRate = this.getDailyRate(currentTotal, assignment.interval);
    const newDailyRate = this.getDailyRate(newTotal, assignment.interval);

    const creditAmount = Math.round(currentDailyRate * daysRemaining * 100) / 100;
    const chargeAmount = Math.round(newDailyRate * daysRemaining * 100) / 100;
    const netAmount = Math.round((chargeAmount - creditAmount) * 100) / 100;

    const calculation = [
      `Current package: ${currentPkg.name} @ ${assignment.currency} ${currentTotal.toFixed(2)}/${assignment.interval}`,
      `New package: ${newPkg.name} @ ${assignment.currency} ${newTotal.toFixed(2)}/${assignment.interval}`,
      `Days remaining in period: ${daysRemaining}`,
      `Credit for unused time: ${assignment.currency} ${creditAmount.toFixed(2)}`,
      `Charge for new package: ${assignment.currency} ${chargeAmount.toFixed(2)}`,
      `Net amount: ${assignment.currency} ${netAmount.toFixed(2)} ${netAmount >= 0 ? '(to pay)' : '(credit)'}`,
    ].join('\n');

    return {
      creditAmount,
      chargeAmount,
      netAmount,
      daysRemaining,
      calculation,
    };
  }

  async executeUpgrade(
    organizationId: string,
    newPackageId: string,
    paymentId?: string
  ): Promise<{
    success: boolean;
    assignment: OrganizationPackageAssignment;
    proration: ProrationResult;
    reenableOpportunity?: {
      canReenableUsers: boolean;
      disabledUsers: Array<{ id: string; email: string; name: string; role: string }>;
      newLimits: { maxLearners: number; maxTeachers: number; maxOrgAdmins: number };
    };
  }> {
    const eligibility = await businessPackageService.checkPackageEligibility(
      organizationId,
      newPackageId
    );

    if (!eligibility.eligible) {
      throw new Error('Organization not eligible for package: ' + eligibility.issues.join(', '));
    }

    const proration = await this.calculateUpgradeProration(organizationId, newPackageId);

    const [currentAssignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    const previousValues = currentAssignment ? { ...currentAssignment } : null;

    const [updatedAssignment] = await db
      .update(organizationPackageAssignments)
      .set({
        packageId: newPackageId,
        lastPaymentId: paymentId || currentAssignment?.lastPaymentId,
        lastPaymentDate: paymentId ? new Date() : currentAssignment?.lastPaymentDate,
        updatedAt: new Date(),
      })
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .returning();

    await db.insert(packageChangeEvents).values({
      packageId: newPackageId,
      organizationId,
      changeType: 'org_upgraded',
      previousValues,
      newValues: {
        packageId: newPackageId,
        proration,
      },
      changedBy: null,
    });

    let reenableOpportunity;
    try {
      reenableOpportunity = await userSeatManagementService.checkUpgradeReenableOpportunity(
        organizationId,
        newPackageId
      );
    } catch (error: any) {
      console.warn('[PackageBillingService] Error checking reenable opportunity:', error.message);
    }

    return {
      success: true,
      assignment: updatedAssignment,
      proration,
      reenableOpportunity,
    };
  }

  async scheduleDowngrade(
    organizationId: string,
    newPackageId: string,
    userSelections: ScheduledDowngrade['selectedUserIds']
  ): Promise<{
    success: boolean;
    effectiveDate: Date;
    assignment: OrganizationPackageAssignment;
  }> {
    const newPkg = await businessPackageService.getPackageById(newPackageId);
    if (!newPkg) {
      throw new Error('Package not found');
    }

    const selectedLearnerCount = userSelections.keepLearnerIds.length;
    const selectedTeacherCount = userSelections.keepTeacherIds.length;
    const selectedOrgAdminCount = userSelections.keepOrgAdminIds.length;

    if (selectedLearnerCount > newPkg.maxLearners) {
      throw new Error(`Selected ${selectedLearnerCount} learners but package only allows ${newPkg.maxLearners}`);
    }
    if (selectedTeacherCount > newPkg.maxTeachers) {
      throw new Error(`Selected ${selectedTeacherCount} teachers but package only allows ${newPkg.maxTeachers}`);
    }
    if (selectedOrgAdminCount > newPkg.maxOrgAdmins) {
      throw new Error(`Selected ${selectedOrgAdminCount} org admins but package only allows ${newPkg.maxOrgAdmins}`);
    }

    const effectiveDate = this.getNextMonthFirstDay();

    const [currentAssignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    if (!currentAssignment) {
      throw new Error('No active subscription found for organization');
    }

    const previousValues = { ...currentAssignment };

    const [updatedAssignment] = await db
      .update(organizationPackageAssignments)
      .set({
        status: 'scheduled_downgrade',
        scheduledPackageId: newPackageId,
        scheduledEffectiveDate: effectiveDate,
        scheduledUserSelections: userSelections as any,
        updatedAt: new Date(),
      })
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .returning();

    await db.insert(packageChangeEvents).values({
      packageId: newPackageId,
      organizationId,
      changeType: 'org_downgraded',
      previousValues,
      newValues: {
        status: 'scheduled_downgrade',
        scheduledPackageId: newPackageId,
        scheduledEffectiveDate: effectiveDate,
        userSelections,
      },
      changedBy: null,
    });

    return {
      success: true,
      effectiveDate,
      assignment: updatedAssignment,
    };
  }

  getNextMonthFirstDay(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  async cancelScheduledDowngrade(organizationId: string): Promise<boolean> {
    const [currentAssignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    if (!currentAssignment) {
      return false;
    }

    if (currentAssignment.status !== 'scheduled_downgrade') {
      return false;
    }

    const previousValues = { ...currentAssignment };

    await db
      .update(organizationPackageAssignments)
      .set({
        status: 'active',
        scheduledPackageId: null,
        scheduledEffectiveDate: null,
        scheduledUserSelections: null,
        updatedAt: new Date(),
      })
      .where(eq(organizationPackageAssignments.organizationId, organizationId));

    await db.insert(packageChangeEvents).values({
      packageId: currentAssignment.packageId,
      organizationId,
      changeType: 'org_cancelled',
      previousValues,
      newValues: {
        status: 'active',
        scheduledPackageId: null,
        scheduledEffectiveDate: null,
        note: 'Scheduled downgrade cancelled',
      },
      changedBy: null,
    });

    return true;
  }

  async processScheduledDowngrades(): Promise<{
    processed: number;
    failed: number;
    details: Array<{ orgId: string; success: boolean; error?: string }>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const scheduledAssignments = await db
      .select()
      .from(organizationPackageAssignments)
      .where(
        and(
          eq(organizationPackageAssignments.status, 'scheduled_downgrade'),
          isNotNull(organizationPackageAssignments.scheduledEffectiveDate),
          lte(organizationPackageAssignments.scheduledEffectiveDate, today)
        )
      );

    const details: Array<{ orgId: string; success: boolean; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    for (const assignment of scheduledAssignments) {
      try {
        const newPackageId = assignment.scheduledPackageId;
        if (!newPackageId) {
          throw new Error('No scheduled package ID found');
        }

        const userSelections = assignment.scheduledUserSelections as ScheduledDowngrade['selectedUserIds'] | null;
        
        if (userSelections) {
          const allKeepUserIds = [
            ...userSelections.keepLearnerIds,
            ...userSelections.keepTeacherIds,
            ...userSelections.keepOrgAdminIds,
          ];

          const allOrgUsers = await db
            .select({ userId: userOrganizationRoles.userId })
            .from(userOrganizationRoles)
            .where(eq(userOrganizationRoles.organizationId, assignment.organizationId));

          const usersToDisable = allOrgUsers
            .filter(u => !allKeepUserIds.includes(u.userId))
            .map(u => u.userId);

          for (const userId of usersToDisable) {
            await db
              .update(users)
              .set({ isLocked: true })
              .where(eq(users.id, userId));
          }
        }

        const now = new Date();
        const nextPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

        await db
          .update(organizationPackageAssignments)
          .set({
            packageId: newPackageId,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: nextPeriodEnd,
            scheduledPackageId: null,
            scheduledEffectiveDate: null,
            scheduledUserSelections: null,
            updatedAt: now,
          })
          .where(eq(organizationPackageAssignments.id, assignment.id));

        await db.insert(packageChangeEvents).values({
          packageId: newPackageId,
          organizationId: assignment.organizationId,
          changeType: 'org_downgraded',
          previousValues: { ...assignment },
          newValues: {
            packageId: newPackageId,
            status: 'active',
            processedAt: now.toISOString(),
          },
          changedBy: null,
        });

        processed++;
        details.push({ orgId: assignment.organizationId, success: true });
      } catch (error: any) {
        failed++;
        details.push({
          orgId: assignment.organizationId,
          success: false,
          error: error.message || 'Unknown error',
        });
        console.error(`[PackageBillingService] Failed to process downgrade for org ${assignment.organizationId}:`, error);
      }
    }

    console.log(`[PackageBillingService] Processed ${processed} downgrades, ${failed} failed`);
    return { processed, failed, details };
  }

  async createSubscription(
    organizationId: string,
    packageId: string,
    interval: 'monthly' | 'annual',
    currency: string,
    paymentId?: string
  ): Promise<OrganizationPackageAssignment> {
    const pkg = await businessPackageService.getPackageById(packageId);
    if (!pkg) {
      throw new Error('Package not found');
    }

    const price = await businessPackageService.getPackagePrice(packageId, currency);
    if (!price) {
      throw new Error('Package pricing not found for currency: ' + currency);
    }

    const now = new Date();
    let periodEnd: Date;
    
    if (interval === 'annual') {
      periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    } else {
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    const [assignment] = await db
      .insert(organizationPackageAssignments)
      .values({
        organizationId,
        packageId,
        interval,
        currency: currency as any,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        lastPaymentId: paymentId,
        lastPaymentDate: paymentId ? now : null,
      })
      .returning();

    await db.insert(packageChangeEvents).values({
      packageId,
      organizationId,
      changeType: 'org_subscribed',
      previousValues: null,
      newValues: {
        packageId,
        interval,
        currency,
        periodStart: now.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
      changedBy: null,
    });

    return assignment;
  }

  async getSubscription(organizationId: string): Promise<{
    assignment: OrganizationPackageAssignment | null;
    package: BusinessPackage | null;
    price: BusinessPackagePrice | null;
  }> {
    const [assignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    if (!assignment) {
      return { assignment: null, package: null, price: null };
    }

    const [pkg, price] = await Promise.all([
      businessPackageService.getPackageById(assignment.packageId),
      businessPackageService.getPackagePrice(assignment.packageId, assignment.currency),
    ]);

    return {
      assignment,
      package: pkg,
      price,
    };
  }
}

export const packageBillingService = new PackageBillingService();
