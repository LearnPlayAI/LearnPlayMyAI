import { db } from '../db';
import {
  organizations,
  courses,
  coursePurchases,
  payoutBatches,
  platformRevenueReports,
  paymentIntents,
  type Organization,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, inArray, or, isNull } from 'drizzle-orm';
import { ExchangeRateService } from './exchangeRateService';
import { RevenueTrackingService } from './revenueTrackingService';

export interface PlatformRevenueSummary {
  totalRevenue: number;
  totalCommission: number;
  totalPayouts: number;
  currency: 'ZAR' | 'USD' | 'EUR';
  periodStart: Date;
  periodEnd: Date;
  byOrgType: {
    education: number;
    business: number;
    elearning: number;
  };
}

export interface TopPerformer {
  organizationId: string;
  organizationName: string;
  organizationType: 'education' | 'business' | 'elearning';
  totalRevenue: number;
  totalSales: number;
  topCourse: string | null;
  currency: 'ZAR' | 'USD' | 'EUR';
}

export interface OrgTypeBreakdown {
  organizationType: 'education' | 'business' | 'elearning';
  organizationCount: number;
  totalRevenue: number;
  totalSales: number;
  averageRevenuePerOrg: number;
  currency: 'ZAR' | 'USD' | 'EUR';
}

export class PlatformAnalyticsService {
  private static isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate.code === '23505' || candidate.cause?.code === '23505';
  }

  /**
   * Get platform-wide revenue summary
   */
  static async getPlatformRevenue(
    periodStart: Date,
    periodEnd: Date,
    displayCurrency: 'ZAR' | 'USD' | 'EUR' = 'ZAR'
  ): Promise<PlatformRevenueSummary> {
    // Get all purchases in period (excluding SuperAdmin test payments)
    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
        organization: organizations,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .innerJoin(organizations, eq(courses.organizationId, organizations.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(
        and(
          eq(coursePurchases.status, 'completed'),
          gte(coursePurchases.purchasedAt, periodStart),
          lte(coursePurchases.purchasedAt, periodEnd),
          or(
            isNull(paymentIntents.id),
            sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
          )
        )
      );

    let totalRevenue = 0;
    const byOrgType = {
      education: 0,
      business: 0,
      elearning: 0,
    };

    const commissionRate = await RevenueTrackingService.getGlobalCommissionRate();

    // Calculate revenue by org type, converting to display currency
    for (const { purchase, organization } of purchases) {
      let amount = parseFloat(purchase.purchasePrice.toString());

      // Convert to display currency
      if (purchase.purchaseCurrency !== displayCurrency) {
        amount = await ExchangeRateService.convert(
          amount,
          purchase.purchaseCurrency,
          displayCurrency
        );
      }

      totalRevenue += amount;

      // Add to org type breakdown
      if (organization.type === 'education') {
        byOrgType.education += amount;
      } else if (organization.type === 'business') {
        byOrgType.business += amount;
      } else if (organization.type === 'elearning') {
        byOrgType.elearning += amount;
      }
    }

    const totalCommission = totalRevenue * commissionRate;
    const totalPayouts = totalRevenue - totalCommission;

    return {
      totalRevenue,
      totalCommission,
      totalPayouts,
      currency: displayCurrency,
      periodStart,
      periodEnd,
      byOrgType,
    };
  }

  /**
   * Get top performing organizations
   */
  static async getTopPerformers(
    limit: number = 10,
    periodStart?: Date,
    periodEnd?: Date,
    displayCurrency: 'ZAR' | 'USD' | 'EUR' = 'ZAR'
  ): Promise<TopPerformer[]> {
    // Get all organizations with purchases (excluding SuperAdmin test payments)
    const baseConditions = [
      eq(coursePurchases.status, 'completed'),
      or(
        isNull(paymentIntents.id),
        sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
      )
    ];

    if (periodStart && periodEnd) {
      baseConditions.push(gte(coursePurchases.purchasedAt, periodStart));
      baseConditions.push(lte(coursePurchases.purchasedAt, periodEnd));
    }

    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
        organization: organizations,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .innerJoin(organizations, eq(courses.organizationId, organizations.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(and(...baseConditions));

    // Group by organization
    const orgData: Record<string, {
      org: Organization;
      revenue: number;
      salesCount: number;
      courses: Record<string, { title: string; sales: number }>;
    }> = {};

    for (const { purchase, course, organization } of purchases) {
      if (!orgData[organization.id]) {
        orgData[organization.id] = {
          org: organization,
          revenue: 0,
          salesCount: 0,
          courses: {},
        };
      }

      let amount = parseFloat(purchase.purchasePrice.toString());

      // Convert to display currency
      if (purchase.purchaseCurrency !== displayCurrency) {
        amount = await ExchangeRateService.convert(
          amount,
          purchase.purchaseCurrency,
          displayCurrency
        );
      }

      orgData[organization.id].revenue += amount;
      orgData[organization.id].salesCount += 1;

      if (!orgData[organization.id].courses[course.id]) {
        orgData[organization.id].courses[course.id] = {
          title: course.title,
          sales: 0,
        };
      }

      orgData[organization.id].courses[course.id].sales += 1;
    }

    // Convert to top performers array
    const performers: TopPerformer[] = Object.values(orgData).map((data) => {
      // Find top course
      const topCourse = Object.values(data.courses).sort((a, b) => b.sales - a.sales)[0];

      return {
        organizationId: data.org.id,
        organizationName: data.org.name,
        organizationType: data.org.type,
        totalRevenue: data.revenue,
        totalSales: data.salesCount,
        topCourse: topCourse?.title || null,
        currency: displayCurrency,
      };
    });

    // Sort by revenue and take top N
    performers.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return performers.slice(0, limit);
  }

  /**
   * Get breakdown by organization type
   */
  static async getOrgTypeBreakdown(
    periodStart?: Date,
    periodEnd?: Date,
    displayCurrency: 'ZAR' | 'USD' | 'EUR' = 'ZAR'
  ): Promise<OrgTypeBreakdown[]> {
    const orgTypes: Array<'education' | 'business' | 'elearning'> = ['education', 'business', 'elearning'];
    const breakdown: OrgTypeBreakdown[] = [];

    for (const orgType of orgTypes) {
      // Get all organizations of this type
      const orgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.type, orgType));

      if (orgs.length === 0) {
        breakdown.push({
          organizationType: orgType,
          organizationCount: 0,
          totalRevenue: 0,
          totalSales: 0,
          averageRevenuePerOrg: 0,
          currency: displayCurrency,
        });
        continue;
      }

      const orgIds = orgs.map((o) => o.id);

      // Get purchases for these organizations (excluding SuperAdmin test payments)
      const conditions = [
        eq(coursePurchases.status, 'completed'),
        sql`${courses.organizationId} = ANY(${orgIds})`,
        or(
          isNull(paymentIntents.id),
          sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
        )
      ];

      if (periodStart && periodEnd) {
        conditions.push(gte(coursePurchases.purchasedAt, periodStart));
        conditions.push(lte(coursePurchases.purchasedAt, periodEnd));
      }

      const purchases = await db
        .select({
          purchase: coursePurchases,
          course: courses,
        })
        .from(coursePurchases)
        .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
        .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
        .where(and(...conditions));

      let totalRevenue = 0;

      for (const { purchase } of purchases) {
        let amount = parseFloat(purchase.purchasePrice.toString());

        if (purchase.purchaseCurrency !== displayCurrency) {
          amount = await ExchangeRateService.convert(
            amount,
            purchase.purchaseCurrency,
            displayCurrency
          );
        }

        totalRevenue += amount;
      }

      breakdown.push({
        organizationType: orgType,
        organizationCount: orgs.length,
        totalRevenue,
        totalSales: purchases.length,
        averageRevenuePerOrg: orgs.length > 0 ? totalRevenue / orgs.length : 0,
        currency: displayCurrency,
      });
    }

    return breakdown;
  }

  /**
   * Cache platform revenue report (auto-called by getPlatformRevenue)
   */
  static async cacheRevenueReport(
    reportDate: Date,
    organizationType: 'education' | 'business' | 'elearning' | null,
    data: PlatformRevenueSummary
  ): Promise<void> {
    const reportValues = {
      reportDate,
      organizationType,
      totalRevenue: data.totalRevenue.toString(),
      totalCommission: data.totalCommission.toString(),
      totalPayouts: data.totalPayouts.toString(),
      currency: data.currency,
      reportData: {
        byOrgType: data.byOrgType,
        periodStart: data.periodStart.toISOString(),
        periodEnd: data.periodEnd.toISOString(),
      },
    };

    try {
      await db.insert(platformRevenueReports).values(reportValues);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      // Concurrent writer already created this cache key; convert to update.
      await db
        .update(platformRevenueReports)
        .set({
          totalRevenue: reportValues.totalRevenue,
          totalCommission: reportValues.totalCommission,
          totalPayouts: reportValues.totalPayouts,
          currency: reportValues.currency,
          reportData: reportValues.reportData,
        })
        .where(
          organizationType
            ? and(
                eq(platformRevenueReports.reportDate, reportDate),
                eq(platformRevenueReports.organizationType, organizationType)
              )
            : and(
                eq(platformRevenueReports.reportDate, reportDate),
                sql`${platformRevenueReports.organizationType} IS NULL`
              )
        );
    }

    console.log(`Revenue report cached for ${reportDate.toISOString()}`);
  }

  /**
   * Get platform revenue with automatic caching
   */
  static async getPlatformRevenueWithCache(
    periodStart: Date,
    periodEnd: Date,
    displayCurrency: 'ZAR' | 'USD' | 'EUR' = 'ZAR',
    forceRefresh: boolean = false
  ): Promise<PlatformRevenueSummary> {
    const reportDate = new Date(periodEnd);
    reportDate.setHours(0, 0, 0, 0);

    // Check cache first
    if (!forceRefresh) {
      const cached = await this.getCachedReport(reportDate);
      if (cached && cached.currency === displayCurrency) {
        return {
          totalRevenue: parseFloat(cached.totalRevenue.toString()),
          totalCommission: parseFloat(cached.totalCommission.toString()),
          totalPayouts: parseFloat(cached.totalPayouts.toString()),
          currency: cached.currency,
          periodStart: new Date((cached.reportData as any).periodStart),
          periodEnd: new Date((cached.reportData as any).periodEnd),
          byOrgType: (cached.reportData as any).byOrgType,
        };
      }
    }

    // Calculate fresh data
    const summary = await this.getPlatformRevenue(periodStart, periodEnd, displayCurrency);

    // Cache it
    await this.cacheRevenueReport(reportDate, null, summary);

    return summary;
  }

  /**
   * Get cached revenue report
   */
  static async getCachedReport(
    reportDate: Date,
    organizationType?: 'education' | 'business' | 'elearning'
  ): Promise<typeof platformRevenueReports.$inferSelect | null> {
    const query = await db
      .select()
      .from(platformRevenueReports)
      .where(
        organizationType
          ? and(
              eq(platformRevenueReports.reportDate, reportDate),
              eq(platformRevenueReports.organizationType, organizationType)
            )
          : and(
              eq(platformRevenueReports.reportDate, reportDate),
              sql`${platformRevenueReports.organizationType} IS NULL`
            )
      )
      .limit(1);

    return query[0] || null;
  }

  /**
   * Generate downloadable revenue report (CSV format)
   */
  static async generateCSVReport(
    periodStart: Date,
    periodEnd: Date,
    displayCurrency: 'ZAR' | 'USD' | 'EUR'
  ): Promise<string> {
    const summary = await this.getPlatformRevenue(periodStart, periodEnd, displayCurrency);
    const topPerformers = await this.getTopPerformers(20, periodStart, periodEnd, displayCurrency);
    const breakdown = await this.getOrgTypeBreakdown(periodStart, periodEnd, displayCurrency);

    let csv = 'LearnPlay Platform Revenue Report\n';
    csv += `Period: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}\n`;
    csv += `Currency: ${displayCurrency}\n\n`;

    // Summary
    csv += 'SUMMARY\n';
    csv += 'Total Revenue,Total Commission,Total Payouts\n';
    csv += `${summary.totalRevenue.toFixed(2)},${summary.totalCommission.toFixed(2)},${summary.totalPayouts.toFixed(2)}\n\n`;

    // By org type
    csv += 'REVENUE BY ORGANIZATION TYPE\n';
    csv += 'Education,Business,E-Learning\n';
    csv += `${summary.byOrgType.education.toFixed(2)},${summary.byOrgType.business.toFixed(2)},${summary.byOrgType.elearning.toFixed(2)}\n\n`;

    // Top performers
    csv += 'TOP PERFORMING ORGANIZATIONS\n';
    csv += 'Rank,Organization,Type,Revenue,Sales,Top Course\n';
    topPerformers.forEach((performer, index) => {
      csv += `${index + 1},${performer.organizationName},${performer.organizationType},${performer.totalRevenue.toFixed(2)},${performer.totalSales},"${performer.topCourse || 'N/A'}"\n`;
    });

    csv += '\n';

    // Org type breakdown
    csv += 'ORGANIZATION TYPE BREAKDOWN\n';
    csv += 'Type,Organization Count,Total Revenue,Total Sales,Average Revenue Per Org\n';
    breakdown.forEach((b) => {
      csv += `${b.organizationType},${b.organizationCount},${b.totalRevenue.toFixed(2)},${b.totalSales},${b.averageRevenuePerOrg.toFixed(2)}\n`;
    });

    return csv;
  }

  /**
   * Get platform-wide statistics (excluding SuperAdmin test payments)
   */
  static async getPlatformStats(): Promise<{
    totalOrganizations: number;
    totalCourses: number;
    totalPurchases: number;
    totalRevenue: number;
    currency: 'ZAR' | 'USD' | 'EUR';
  }> {
    const orgCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizations);

    const courseCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(courses);

    // Exclude test payments from purchase count and revenue
    const purchaseResults = await db
      .select({ purchase: coursePurchases })
      .from(coursePurchases)
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(
        and(
          eq(coursePurchases.status, 'completed'),
          or(
            isNull(paymentIntents.id),
            sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
          )
        )
      );

    let totalRevenue = 0;

    for (const { purchase } of purchaseResults) {
      let amount = parseFloat(purchase.purchasePrice.toString());

      // Convert to ZAR
      if (purchase.purchaseCurrency !== 'ZAR') {
        amount = await ExchangeRateService.convert(amount, purchase.purchaseCurrency, 'ZAR');
      }

      totalRevenue += amount;
    }

    return {
      totalOrganizations: orgCount[0]?.count || 0,
      totalCourses: courseCount[0]?.count || 0,
      totalPurchases: purchaseResults.length,
      totalRevenue,
      currency: 'ZAR',
    };
  }
}
