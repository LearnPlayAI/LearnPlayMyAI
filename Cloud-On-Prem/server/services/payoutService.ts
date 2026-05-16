import { db } from '../db';
import {
  coursePayouts,
  coursePayoutLineItems,
  coursePurchases,
  courses,
  organizations,
  paymentIntents,
  type InsertCoursePayout,
  type CoursePayout,
  type InsertCoursePayoutLineItem,
  type CoursePayoutLineItem,
} from '@shared/schema';
import { eq, and, gte, lt, desc, sql, isNull, or } from 'drizzle-orm';
import { CurrencyService } from './currencyService';
import { CourseVisibilityService } from './courseVisibilityService';

export class PayoutService {
  /**
   * Calculate monthly payouts for all e-learning organizations
   * Runs on last day of month
   */
  static async calculateMonthlyPayouts(year: number, month: number): Promise<{
    payoutsCreated: number;
    totalAmount: Record<string, string>;
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    console.log(`[PayoutService] Calculating payouts for ${year}-${month}`);

    const eLearningOrgs = await db.query.organizations.findMany({
      where: eq(organizations.type, 'elearning'),
    });

    const exchangeRateSnapshot = await CurrencyService.snapshotRatesForPayout();

    let payoutsCreated = 0;
    const totalAmount: Record<string, string> = { ZAR: '0', USD: '0', EUR: '0' };

    for (const org of eLearningOrgs) {
      // Query purchases for PUBLIC courses belonging to this organization
      // Only public courses are eligible for payouts (org_only courses are internal)
      // Filter out SuperAdmin test payments by joining with paymentIntents
      const orgCoursePurchases = await db
        .select({
          coursePurchases: coursePurchases,
        })
        .from(coursePurchases)
        .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
        .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
        .where(
          and(
            eq(courses.organizationId, org.id),
            eq(courses.visibility, 'public'),
            gte(coursePurchases.purchasedAt, startDate),
            lt(coursePurchases.purchasedAt, endDate),
            or(
              isNull(paymentIntents.id),
              sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
            )
          )
        )
        .then(results => results.map(r => r.coursePurchases));

      if (orgCoursePurchases.length === 0) {
        console.log(`[PayoutService] No purchases for ${org.name} in ${year}-${month}`);
        continue;
      }

      const lineItems = await this.calculateLineItems(orgCoursePurchases, org.commissionRate || '0.30');

      const totalRevenue = lineItems.reduce((sum, item) => sum + parseFloat(item.grossRevenue), 0);
      const totalCommission = lineItems.reduce((sum, item) => sum + parseFloat(item.platformCommission), 0);
      const netPayout = lineItems.reduce((sum, item) => sum + parseFloat(item.netAmount), 0);

      const payout = await this.createPayoutRecord({
        organizationId: org.id,
        periodStart: startDate,
        periodEnd: endDate,
        currency: org.currency || 'ZAR',
        grossRevenue: totalRevenue.toFixed(4),
        platformCommission: totalCommission.toFixed(4),
        netAmount: netPayout.toFixed(4),
        exchangeRateSnapshot: JSON.stringify(exchangeRateSnapshot),
        status: 'pending',
      }, lineItems);

      totalAmount[org.currency || 'ZAR'] = (
        parseFloat(totalAmount[org.currency || 'ZAR']) + netPayout
      ).toFixed(4);

      payoutsCreated++;
      console.log(`[PayoutService] Payout created for ${org.name}: ${netPayout.toFixed(2)} ${org.currency}`);
    }

    return { payoutsCreated, totalAmount };
  }

  /**
   * Calculate line items for payout
   */
  private static async calculateLineItems(
    purchases: any[],
    commissionRate: string
  ): Promise<Omit<InsertCoursePayoutLineItem, 'payoutId'>[]> {
    const courseGroups: Record<string, any[]> = {};

    for (const purchase of purchases) {
      const courseId = purchase.courseId;
      if (!courseGroups[courseId]) {
        courseGroups[courseId] = [];
      }
      courseGroups[courseId].push(purchase);
    }

    const lineItems: Omit<InsertCoursePayoutLineItem, 'payoutId'>[] = [];

    for (const [courseId, coursePurchases] of Object.entries(courseGroups)) {
      const grossAmount = coursePurchases.reduce((sum, p) => sum + parseFloat(p.pricePaid), 0);
      const commission = grossAmount * parseFloat(commissionRate);
      const netPayout = grossAmount - commission;

      lineItems.push({
        courseId,
        salesCount: coursePurchases.length,
        grossRevenue: grossAmount.toFixed(4),
        platformCommission: commission.toFixed(4),
        netAmount: netPayout.toFixed(4),
      });
    }

    return lineItems;
  }

  /**
   * Create payout record with immutable exchange rate snapshot
   */
  static async createPayoutRecord(
    payoutData: InsertCoursePayout,
    lineItems: Omit<InsertCoursePayoutLineItem, 'payoutId'>[]
  ): Promise<CoursePayout> {
    const payout = await db.insert(coursePayouts).values(payoutData).returning();

    for (const item of lineItems) {
      await db.insert(coursePayoutLineItems).values({
        ...item,
        payoutId: payout[0].id,
      });
    }

    return payout[0];
  }

  /**
   * Mark payout as paid (idempotent)
   */
  static async markAsPaid(
    payoutId: string,
    paidDate: Date,
    paymentReference: string
  ): Promise<CoursePayout> {
    const existing = await db.query.coursePayouts.findFirst({
      where: eq(coursePayouts.id, payoutId),
    });

    if (!existing) {
      throw new Error('Payout not found');
    }

    if (existing.status === 'paid') {
      console.log(`[PayoutService] Payout ${payoutId} already marked as paid`);
      return existing;
    }

    const updated = await db.update(coursePayouts)
      .set({
        status: 'paid',
        paidAt: paidDate,
        paymentReference,
      })
      .where(eq(coursePayouts.id, payoutId))
      .returning();

    console.log(`[PayoutService] Payout ${payoutId} marked as paid: ${paymentReference}`);
    return updated[0];
  }

  /**
   * Get pending payouts
   */
  static async getPendingPayouts(): Promise<CoursePayout[]> {
    return await db.query.coursePayouts.findMany({
      where: eq(coursePayouts.status, 'pending'),
      with: {
        organization: true,
      },
      orderBy: [desc(coursePayouts.createdAt)],
    });
  }

  /**
   * Get payouts for an organization
   */
  static async getCoursePayouts(organizationId: string): Promise<CoursePayout[]> {
    return await db.query.coursePayouts.findMany({
      where: eq(coursePayouts.organizationId, organizationId),
      orderBy: [desc(coursePayouts.createdAt)],
    });
  }

  /**
   * Get payout with line items
   */
  static async getPayoutWithLineItems(payoutId: string): Promise<CoursePayout & {
    lineItems: CoursePayoutLineItem[];
  } | null> {
    const payout = await db.query.coursePayouts.findFirst({
      where: eq(coursePayouts.id, payoutId),
      with: {
        organization: true,
      },
    });

    if (!payout) {
      return null;
    }

    const lineItems = await db.query.coursePayoutLineItems.findMany({
      where: eq(coursePayoutLineItems.payoutId, payoutId),
      with: {
        course: true,
      },
    });

    return {
      ...payout,
      lineItems: lineItems as any,
    };
  }
}
