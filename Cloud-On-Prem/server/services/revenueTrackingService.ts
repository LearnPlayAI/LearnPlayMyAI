import { db } from '../db';
import {
  coursePurchases,
  courses,
  organizations,
  coursePriceHistory,
  coursePayoutLineItems,
  coursePayouts,
  platformConfiguration,
  paymentIntents,
  courseProgress,
  courseAssignments,
  users,
  type CoursePurchase,
  type Course,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, between, isNull, or, ilike, count, countDistinct } from 'drizzle-orm';
import { ExchangeRateService } from './exchangeRateService';

export interface RevenueSummary {
  organizationId: string;
  organizationName: string;
  totalRevenue: number;
  platformCommission: number;
  netProfit: number;
  currency: 'ZAR' | 'USD' | 'EUR';
  salesCount: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface CourseRevenueSummary {
  courseId: string;
  courseTitle: string;
  totalSales: number;
  totalRevenue: number;
  platformCommission: number;
  netRevenue: number;
  currency: 'ZAR' | 'USD' | 'EUR';
  averageRating: number | null;
  purchaseCount: number;
}

export interface MonthlyRevenueTrend {
  month: string; // YYYY-MM format
  revenue: number;
  salesCount: number;
  commissionDeducted: number;
  netProfit: number;
}

export class RevenueTrackingService {
  /**
   * Get global commission rate from platform configuration
   */
  static async getGlobalCommissionRate(): Promise<number> {
    const config = await db
      .select()
      .from(platformConfiguration)
      .where(eq(platformConfiguration.key, 'GLOBAL_COMMISSION_RATE'))
      .limit(1);

    return config.length > 0 ? parseFloat(config[0].value) : 0.30; // Default 30%
  }

  /**
   * Get commission rate for organization (org override or global default)
   */
  static async getOrganizationCommissionRate(organizationId: string): Promise<number> {
    // Check for org-specific override first
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org.length > 0 && org[0].commissionRate !== null) {
      return parseFloat(org[0].commissionRate.toString());
    }

    // Fall back to global rate
    return this.getGlobalCommissionRate();
  }

  /**
   * Calculate commission for a purchase (uses org-specific rate if available)
   */
  static async calculateCommission(
    purchaseAmount: number,
    organizationId: string
  ): Promise<number> {
    const commissionRate = await this.getOrganizationCommissionRate(organizationId);
    return purchaseAmount * commissionRate;
  }

  /**
   * Record course price in history (for audit trail)
   */
  static async recordPriceHistory(
    courseId: string,
    price: number,
    currency: 'ZAR' | 'USD' | 'EUR',
    changedBy: string
  ): Promise<void> {
    await db.insert(coursePriceHistory).values({
      courseId,
      newPrice: price.toString(),
      currency,
      changedAt: new Date(),
      changedBy,
    });

    console.log(`Price history recorded for course ${courseId}: ${currency} ${price}`);
  }

  /**
   * Get revenue summary for an organization
   */
  static async getOrganizationRevenue(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    targetCurrency?: 'ZAR' | 'USD' | 'EUR'
  ): Promise<RevenueSummary> {
    // Get organization details
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org.length) {
      throw new Error('Organization not found');
    }

    // Get all course purchases for this organization's courses in the period
    // Excludes test payments from SuperAdmin testing
    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(
        and(
          eq(courses.organizationId, organizationId),
          eq(coursePurchases.status, 'completed'),
          gte(coursePurchases.purchasedAt, periodStart),
          lte(coursePurchases.purchasedAt, periodEnd),
          sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
        )
      );

    let totalRevenue = 0;
    let platformCommission = 0;

    const commissionRate = await this.getOrganizationCommissionRate(organizationId);
    const baseCurrency = targetCurrency || org[0].currency || 'ZAR';

    // Calculate revenue, converting to base currency if needed
    for (const { purchase, course } of purchases) {
      let purchaseAmount = parseFloat(purchase.purchasePrice.toString());

      // Convert to base currency if different
      if (purchase.purchaseCurrency !== baseCurrency) {
        purchaseAmount = await ExchangeRateService.convert(
          purchaseAmount,
          purchase.purchaseCurrency,
          baseCurrency
        );
      }

      totalRevenue += purchaseAmount;
      platformCommission += purchaseAmount * commissionRate;
    }

    const netProfit = totalRevenue - platformCommission;

    return {
      organizationId,
      organizationName: org[0].name,
      totalRevenue,
      platformCommission,
      netProfit,
      currency: baseCurrency,
      salesCount: purchases.length,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Get revenue breakdown by course for an organization
   */
  static async getCourseRevenueBreakdown(
    organizationId: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<CourseRevenueSummary[]> {
    // Get all courses for this organization
    const orgCourses = await db
      .select()
      .from(courses)
      .where(eq(courses.organizationId, organizationId));

    const commissionRate = await this.getOrganizationCommissionRate(organizationId);

    const summaries: CourseRevenueSummary[] = [];

    for (const course of orgCourses) {
      // Get purchases for this course, excluding test payments from SuperAdmin testing
      const baseConditions = [
        eq(coursePurchases.courseId, course.id),
        eq(coursePurchases.status, 'completed'),
        sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
      ];

      // Apply date filters if provided
      if (periodStart && periodEnd) {
        baseConditions.push(
          gte(coursePurchases.purchasedAt, periodStart),
          lte(coursePurchases.purchasedAt, periodEnd)
        );
      }

      const purchases = await db
        .select({ purchase: coursePurchases })
        .from(coursePurchases)
        .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
        .where(and(...baseConditions));

      if (purchases.length === 0) continue;

      let totalRevenue = 0;

      for (const { purchase } of purchases) {
        let amount = parseFloat(purchase.purchasePrice.toString());

        // Convert to course currency if different
        if (purchase.purchaseCurrency !== course.currency) {
          amount = await ExchangeRateService.convert(
            amount,
            purchase.purchaseCurrency,
            course.currency
          );
        }

        totalRevenue += amount;
      }

      const platformCommission = totalRevenue * commissionRate;
      const netRevenue = totalRevenue - platformCommission;

      summaries.push({
        courseId: course.id,
        courseTitle: course.title,
        totalSales: purchases.length,
        totalRevenue,
        platformCommission,
        netRevenue,
        currency: course.currency,
        averageRating: course.averageRating ? parseFloat(course.averageRating.toString()) : null,
        purchaseCount: purchases.length,
      });
    }

    // Sort by revenue descending
    summaries.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return summaries;
  }

  /**
   * Get monthly revenue trends for an organization
   */
  static async getMonthlyTrends(
    organizationId: string,
    monthsBack: number = 12
  ): Promise<MonthlyRevenueTrend[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    // Get all purchases for this org's courses in the period
    // Excludes test payments from SuperAdmin testing
    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(
        and(
          eq(courses.organizationId, organizationId),
          eq(coursePurchases.status, 'completed'),
          gte(coursePurchases.purchasedAt, startDate),
          sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
        )
      );

    // Group by month
    const monthlyData: Record<string, MonthlyRevenueTrend> = {};

    const commissionRate = await this.getOrganizationCommissionRate(organizationId);

    for (const { purchase } of purchases) {
      const purchaseDate = purchase.purchasedAt || new Date();
      const monthKey = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          revenue: 0,
          salesCount: 0,
          commissionDeducted: 0,
          netProfit: 0,
        };
      }

      const amount = parseFloat(purchase.purchasePrice.toString());

      monthlyData[monthKey].revenue += amount;
      monthlyData[monthKey].salesCount += 1;
      monthlyData[monthKey].commissionDeducted += amount * commissionRate;
      monthlyData[monthKey].netProfit += amount * (1 - commissionRate);
    }

    // Convert to array and sort by month
    const trends = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

    return trends;
  }

  /**
   * Get top performing courses across platform (for SuperAdmin)
   */
  static async getTopCourses(
    limit: number = 10,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<CourseRevenueSummary[]> {
    // Build conditions, excluding test payments from SuperAdmin testing
    const baseConditions = [
      eq(coursePurchases.status, 'completed'),
      sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
    ];

    if (periodStart && periodEnd) {
      baseConditions.push(
        gte(coursePurchases.purchasedAt, periodStart),
        lte(coursePurchases.purchasedAt, periodEnd)
      );
    }

    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(and(...baseConditions));

    // Group by course
    const courseData: Record<string, {
      course: Course;
      revenue: number;
      salesCount: number;
    }> = {};

    for (const { purchase, course } of purchases) {
      if (!courseData[course.id]) {
        courseData[course.id] = {
          course,
          revenue: 0,
          salesCount: 0,
        };
      }

      courseData[course.id].revenue += parseFloat(purchase.purchasePrice.toString());
      courseData[course.id].salesCount += 1;
    }

    const commissionRate = await this.getGlobalCommissionRate();

    // Convert to summaries
    const summaries: CourseRevenueSummary[] = Object.values(courseData).map((data) => ({
      courseId: data.course.id,
      courseTitle: data.course.title,
      totalSales: data.salesCount,
      totalRevenue: data.revenue,
      platformCommission: data.revenue * commissionRate,
      netRevenue: data.revenue * (1 - commissionRate),
      currency: data.course.currency,
      averageRating: data.course.averageRating ? parseFloat(data.course.averageRating.toString()) : null,
      purchaseCount: data.salesCount,
    }));

    // Sort by revenue and take top N
    summaries.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return summaries.slice(0, limit);
  }

  static async getAllOrganizationsRevenue(
    periodStart: Date,
    periodEnd: Date,
    targetCurrency: 'ZAR' | 'USD' | 'EUR' = 'ZAR'
  ): Promise<RevenueSummary> {
    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(
        and(
          eq(coursePurchases.status, 'completed'),
          gte(coursePurchases.purchasedAt, periodStart),
          lte(coursePurchases.purchasedAt, periodEnd),
          sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
        )
      );

    let totalRevenue = 0;
    const commissionRate = await this.getGlobalCommissionRate();

    for (const { purchase } of purchases) {
      let purchaseAmount = parseFloat(purchase.purchasePrice.toString());
      if (purchase.purchaseCurrency !== targetCurrency) {
        purchaseAmount = await ExchangeRateService.convert(
          purchaseAmount,
          purchase.purchaseCurrency,
          targetCurrency
        );
      }
      totalRevenue += purchaseAmount;
    }

    const platformCommission = totalRevenue * commissionRate;
    const netProfit = totalRevenue - platformCommission;

    return {
      organizationId: 'all',
      organizationName: 'All Organizations',
      totalRevenue,
      platformCommission,
      netProfit,
      currency: targetCurrency,
      salesCount: purchases.length,
      periodStart,
      periodEnd,
    };
  }

  static async getAllCourseRevenueBreakdown(
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<(CourseRevenueSummary & { organizationName: string })[]> {
    const allCourses = await db
      .select({
        course: courses,
        org: organizations,
      })
      .from(courses)
      .innerJoin(organizations, eq(courses.organizationId, organizations.id));

    const commissionRate = await this.getGlobalCommissionRate();
    const summaries: (CourseRevenueSummary & { organizationName: string })[] = [];

    for (const { course, org } of allCourses) {
      const baseConditions: any[] = [
        eq(coursePurchases.courseId, course.id),
        eq(coursePurchases.status, 'completed'),
        sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
      ];

      if (periodStart && periodEnd) {
        baseConditions.push(
          gte(coursePurchases.purchasedAt, periodStart),
          lte(coursePurchases.purchasedAt, periodEnd)
        );
      }

      const purchases = await db
        .select({ purchase: coursePurchases })
        .from(coursePurchases)
        .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
        .where(and(...baseConditions));

      if (purchases.length === 0) continue;

      let totalRevenue = 0;
      for (const { purchase } of purchases) {
        let amount = parseFloat(purchase.purchasePrice.toString());
        if (purchase.purchaseCurrency !== course.currency) {
          amount = await ExchangeRateService.convert(
            amount,
            purchase.purchaseCurrency,
            course.currency
          );
        }
        totalRevenue += amount;
      }

      const platformCommission = totalRevenue * commissionRate;
      const netRevenue = totalRevenue - platformCommission;

      summaries.push({
        courseId: course.id,
        courseTitle: course.title,
        totalSales: purchases.length,
        totalRevenue,
        platformCommission,
        netRevenue,
        currency: course.currency,
        averageRating: course.averageRating ? parseFloat(course.averageRating.toString()) : null,
        purchaseCount: purchases.length,
        organizationName: org.name,
      });
    }

    summaries.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return summaries;
  }

  static async getAllMonthlyTrends(
    monthsBack: number = 12
  ): Promise<MonthlyRevenueTrend[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    const purchases = await db
      .select({
        purchase: coursePurchases,
        course: courses,
      })
      .from(coursePurchases)
      .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
      .leftJoin(paymentIntents, eq(coursePurchases.checkoutId, paymentIntents.checkoutId))
      .where(
        and(
          eq(coursePurchases.status, 'completed'),
          gte(coursePurchases.purchasedAt, startDate),
          sql`(${paymentIntents.metadata}->>'testPayment' IS NULL OR ${paymentIntents.metadata}->>'testPayment' != 'true')`
        )
      );

    const monthlyData: Record<string, MonthlyRevenueTrend> = {};
    const commissionRate = await this.getGlobalCommissionRate();

    for (const { purchase } of purchases) {
      const purchaseDate = purchase.purchasedAt || new Date();
      const monthKey = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          revenue: 0,
          salesCount: 0,
          commissionDeducted: 0,
          netProfit: 0,
        };
      }

      const amount = parseFloat(purchase.purchasePrice.toString());
      monthlyData[monthKey].revenue += amount;
      monthlyData[monthKey].salesCount += 1;
      monthlyData[monthKey].commissionDeducted += amount * commissionRate;
      monthlyData[monthKey].netProfit += amount * (1 - commissionRate);
    }

    return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Get pending payout amount for an organization
   */
  static async getPendingPayouts(
    organizationId: string,
    currency?: 'ZAR' | 'USD' | 'EUR'
  ): Promise<number> {
    const pendingPayouts = await db
      .select()
      .from(coursePayouts)
      .where(
        and(
          eq(coursePayouts.organizationId, organizationId),
          eq(coursePayouts.status, 'pending')
        )
      );

    let total = 0;

    for (const payout of pendingPayouts) {
      let amount = parseFloat(payout.netAmount.toString());

      if (currency && payout.currency !== currency) {
        amount = await ExchangeRateService.convert(amount, payout.currency, currency);
      }

      total += amount;
    }

    return total;
  }

  static async getEnrollmentDetails(
    organizationId: string | null,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    } = {}
  ) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(500, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const orgFilter = organizationId
      ? sql`${courses.organizationId} = ${organizationId}`
      : sql`1=1`;

    const searchFilter = options.search
      ? sql`(
          ${ilike(users.gamerName, `%${options.search}%`)} OR
          ${ilike(users.email, `%${options.search}%`)} OR
          ${ilike(courses.title, `%${options.search}%`)}
        )`
      : sql`1=1`;

    const enrollmentQuery = sql`
      WITH purchase_enrollments AS (
        SELECT 
          cp.id,
          cp."userId",
          cp."courseId",
          cp."purchasedAt" as enrollment_date,
          COALESCE(CAST(cp."purchasePrice" AS numeric), 0) as price,
          cp."purchaseCurrency" as currency,
          COALESCE(cpr.status, 'not_started') as progress_status,
          COALESCE(cpr."percentComplete", 0) as percent_complete,
          COALESCE(cpr."completedLessons", 0) as completed_lessons,
          COALESCE(cpr."totalLessons", 0) as total_lessons,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM "courseAssignments" ca 
              WHERE ca."courseId" = cp."courseId" AND ca."userId" = cp."userId"
            ) THEN 'assignment'
            ELSE 'purchase'
          END as source
        FROM "coursePurchases" cp
        INNER JOIN "courses" c ON cp."courseId" = c.id
        LEFT JOIN "courseProgress" cpr ON cpr."courseId" = cp."courseId" AND cpr."userId" = cp."userId"
        WHERE ${orgFilter} AND cp.status = 'completed'
      ),
      progress_only_enrollments AS (
        SELECT
          cpr.id,
          cpr."userId",
          cpr."courseId",
          COALESCE(cpr."startedAt", cpr."createdAt") as enrollment_date,
          0 as price,
          c.currency as currency,
          cpr.status as progress_status,
          COALESCE(cpr."percentComplete", 0) as percent_complete,
          COALESCE(cpr."completedLessons", 0) as completed_lessons,
          COALESCE(cpr."totalLessons", 0) as total_lessons,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM "courseAssignments" ca 
              WHERE ca."courseId" = cpr."courseId" AND ca."userId" = cpr."userId"
            ) THEN 'assignment'
            ELSE 'progress_only'
          END as source
        FROM "courseProgress" cpr
        INNER JOIN "courses" c ON cpr."courseId" = c.id
        WHERE ${orgFilter}
          AND NOT EXISTS (
            SELECT 1 FROM "coursePurchases" cp2 
            WHERE cp2."courseId" = cpr."courseId" AND cp2."userId" = cpr."userId" AND cp2.status = 'completed'
          )
      ),
      all_enrollments AS (
        SELECT * FROM purchase_enrollments
        UNION ALL
        SELECT * FROM progress_only_enrollments
      )
      SELECT 
        ae.id,
        ae."userId",
        u."gamerName" AS "userName",
        u.email AS "userEmail",
        ae."courseId",
        c.title AS "courseTitle",
        c."organizationId" AS "organizationId",
        o.name AS "organizationName",
        ae.enrollment_date AS "enrollmentDate",
        ae.price,
        ae.currency,
        ae.progress_status AS "progressStatus",
        ae.percent_complete AS "percentComplete",
        ae.completed_lessons AS "completedLessons",
        ae.total_lessons AS "totalLessons",
        ae.source,
        COUNT(*) OVER() AS "totalCount"
      FROM all_enrollments ae
      INNER JOIN "users" u ON ae."userId" = u.id
      INNER JOIN "courses" c ON ae."courseId" = c.id
      LEFT JOIN "organizations" o ON c."organizationId" = o.id
      WHERE (
        u."gamerName" ILIKE ${'%' + (options.search || '') + '%'} OR
        u.email ILIKE ${'%' + (options.search || '') + '%'} OR
        c.title ILIKE ${'%' + (options.search || '') + '%'} OR
        ${!options.search ? sql`1=1` : sql`1=0`}
      )
      ORDER BY ae.enrollment_date DESC NULLS LAST
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const results = await db.execute(enrollmentQuery);
    const rows = results.rows || results;

    const total = rows.length > 0 ? parseInt(String((rows[0] as any).totalCount || '0')) : 0;

    const enrollments = (rows as any[]).map((row: any) => ({
      id: row.id,
      userId: row.userId,
      userName: row.userName || '',
      courseId: row.courseId,
      userEmail: row.userEmail || '',
      courseTitle: row.courseTitle || '',
      enrollmentDate: row.enrollmentDate ? new Date(row.enrollmentDate).toISOString() : null,
      price: parseFloat(String(row.price || '0')),
      currency: row.currency || 'ZAR',
      status: row.progressStatus || 'not_started',
      percentComplete: parseInt(String(row.percentComplete || '0')),
      completedLessons: parseInt(String(row.completedLessons || '0')),
      totalLessons: parseInt(String(row.totalLessons || '0')),
      source: row.source || 'progress_only',
      organizationId: row.organizationId || '',
      organizationName: row.organizationName || '',
    }));

    return {
      enrollments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getRoiMetrics(organizationId: string | null) {
    const orgFilter = organizationId
      ? sql`c."organizationId" = ${organizationId}`
      : sql`1=1`;

    const learnersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as total FROM (
        SELECT cp."userId" as user_id
        FROM "coursePurchases" cp
        INNER JOIN "courses" c ON cp."courseId" = c.id
        WHERE ${orgFilter} AND cp.status = 'completed'
        UNION
        SELECT cpr."userId" as user_id
        FROM "courseProgress" cpr
        INNER JOIN "courses" c ON cpr."courseId" = c.id
        WHERE ${orgFilter}
      ) combined
    `);
    const totalEnrolledLearners = parseInt(String((learnersResult.rows?.[0] as any)?.total || '0'));

    const coursesResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM "courses" c
      WHERE ${orgFilter} AND c.status = 'active'
    `);
    const totalCoursesPublished = parseInt(String((coursesResult.rows?.[0] as any)?.total || '0'));

    const completionResult = await db.execute(sql`
      SELECT 
        COALESCE(AVG(cpr."percentComplete"), 0) as avg_completion,
        COUNT(CASE WHEN cpr.status = 'completed' THEN 1 END) as total_completions
      FROM "courseProgress" cpr
      INNER JOIN "courses" c ON cpr."courseId" = c.id
      WHERE ${orgFilter}
    `);
    const avgRow = completionResult.rows?.[0] as any;
    const averageCompletionRate = parseFloat(String(avgRow?.avg_completion || '0'));
    const totalCompletions = parseInt(String(avgRow?.total_completions || '0'));

    const purchasesCount = await db.execute(sql`
      SELECT COUNT(DISTINCT cp."userId" || '-' || cp."courseId") as total
      FROM "coursePurchases" cp
      INNER JOIN "courses" c ON cp."courseId" = c.id
      WHERE ${orgFilter} AND cp.status = 'completed'
    `);
    const purchaseEnrollments = parseInt(String((purchasesCount.rows?.[0] as any)?.total || '0'));

    const assignmentsCount = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM "courseAssignments" ca
      INNER JOIN "courses" c ON ca."courseId" = c.id
      WHERE ${orgFilter}
    `);
    const assignmentEnrollments = parseInt(String((assignmentsCount.rows?.[0] as any)?.total || '0'));

    const progressOnlyCount = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM "courseProgress" cpr
      INNER JOIN "courses" c ON cpr."courseId" = c.id
      WHERE ${orgFilter}
        AND NOT EXISTS (
          SELECT 1 FROM "coursePurchases" cp2 
          WHERE cp2."courseId" = cpr."courseId" AND cp2."userId" = cpr."userId" AND cp2.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "courseAssignments" ca2
          WHERE ca2."courseId" = cpr."courseId" AND ca2."userId" = cpr."userId"
        )
    `);
    const otherEnrollments = parseInt(String((progressOnlyCount.rows?.[0] as any)?.total || '0'));

    return {
      totalEnrolledLearners,
      totalCoursesPublished,
      averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
      totalCompletions,
      enrollmentsBySource: {
        purchases: purchaseEnrollments,
        assignments: assignmentEnrollments,
        other: otherEnrollments,
      },
    };
  }
}
