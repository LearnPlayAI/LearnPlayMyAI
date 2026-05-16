import { db } from '../db';
import {
  platformRevenueSources,
  platformCostEntries,
  platformFinancialSnapshots,
  platformFinancialAuditLog,
  organizations,
  type InsertPlatformFinancialSnapshot,
} from '@shared/schema';
import { eq, and, gte, lte, sql, isNull, or } from 'drizzle-orm';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, startOfWeek, endOfWeek, subMonths, subDays } from 'date-fns';

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface SnapshotSummary {
  periodStart: Date;
  periodEnd: Date;
  periodType: PeriodType;
  organizationId: string | null;
  grossRevenueZAR: string;
  netRevenueZAR: string;
  totalCostsZAR: string;
  netProfitZAR: string;
  profitMarginPercent: string | null;
  courseRevenue: string;
  creditRevenue: string;
  licenseRevenue: string;
  subscriptionRevenue: string;
  chargebackAmount: string;
  refundAmount: string;
  transactionCount: number;
}

export interface SnapshotResult {
  success: boolean;
  snapshotId?: string;
  summary?: SnapshotSummary;
  error?: string;
}

export class PlatformFinancialSnapshotService {
  private static isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate.code === '23505' || candidate.cause?.code === '23505';
  }

  static async generateDailySnapshot(date: Date, organizationId?: string): Promise<SnapshotResult> {
    const periodStart = startOfDay(date);
    const periodEnd = endOfDay(date);
    return this.generateSnapshot('daily', periodStart, periodEnd, organizationId);
  }

  static async generateWeeklySnapshot(date: Date, organizationId?: string): Promise<SnapshotResult> {
    const periodStart = startOfWeek(date, { weekStartsOn: 1 });
    const periodEnd = endOfWeek(date, { weekStartsOn: 1 });
    return this.generateSnapshot('weekly', periodStart, periodEnd, organizationId);
  }

  static async generateMonthlySnapshot(date: Date, organizationId?: string): Promise<SnapshotResult> {
    const periodStart = startOfMonth(date);
    const periodEnd = endOfMonth(date);
    return this.generateSnapshot('monthly', periodStart, periodEnd, organizationId);
  }

  static async generateSnapshot(
    periodType: PeriodType,
    periodStart: Date,
    periodEnd: Date,
    organizationId?: string
  ): Promise<SnapshotResult> {
    try {
      const periodStartStr = format(periodStart, 'yyyy-MM-dd');
      const periodEndStr = format(periodEnd, 'yyyy-MM-dd');

      const orgCondition = organizationId
        ? eq(platformRevenueSources.organizationId, organizationId)
        : sql`true`;

      const revenueAggregation = await db
        .select({
          grossRevenueZAR: sql<string>`COALESCE(SUM(${platformRevenueSources.normalizedAmountZAR}), 0)::text`,
          courseRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${platformRevenueSources.sourceType} = 'course_purchase' THEN ${platformRevenueSources.normalizedAmountZAR}::numeric ELSE 0 END), 0)::text`,
          creditRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${platformRevenueSources.sourceType} = 'credit_purchase' THEN ${platformRevenueSources.normalizedAmountZAR}::numeric ELSE 0 END), 0)::text`,
          licenseRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${platformRevenueSources.sourceType} = 'license_purchase' THEN ${platformRevenueSources.normalizedAmountZAR}::numeric ELSE 0 END), 0)::text`,
          subscriptionRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${platformRevenueSources.sourceType} = 'subscription_payment' THEN ${platformRevenueSources.normalizedAmountZAR}::numeric ELSE 0 END), 0)::text`,
          chargebackAmount: sql<string>`COALESCE(SUM(CASE WHEN ${platformRevenueSources.sourceType} = 'chargeback' THEN ABS(${platformRevenueSources.normalizedAmountZAR}::numeric) ELSE 0 END), 0)::text`,
          transactionCount: sql<number>`COUNT(*)::int`,
        })
        .from(platformRevenueSources)
        .where(
          and(
            gte(platformRevenueSources.recordedAt, periodStart),
            lte(platformRevenueSources.recordedAt, periodEnd),
            orgCondition,
            sql`(${platformRevenueSources.metadata}->>'testPayment' IS NULL OR ${platformRevenueSources.metadata}->>'testPayment' != 'true')`
          )
        );

      const revenue = revenueAggregation[0] || {
        grossRevenueZAR: '0',
        courseRevenue: '0',
        creditRevenue: '0',
        licenseRevenue: '0',
        subscriptionRevenue: '0',
        chargebackAmount: '0',
        transactionCount: 0,
      };

      const costOrgCondition = organizationId
        ? or(eq(platformCostEntries.organizationId, organizationId), isNull(platformCostEntries.organizationId))
        : sql`true`;

      const costAggregation = await db
        .select({
          totalCostsZAR: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
          refundPayouts: sql<string>`COALESCE(SUM(CASE WHEN ${platformCostEntries.categoryId} IN (
            SELECT id FROM "platformCostCategories" WHERE type = 'refund_payout'
          ) THEN ${platformCostEntries.normalizedAmountZAR}::numeric ELSE 0 END), 0)::text`,
        })
        .from(platformCostEntries)
        .where(
          and(
            gte(platformCostEntries.effectiveDate, periodStartStr),
            lte(platformCostEntries.effectiveDate, periodEndStr),
            costOrgCondition
          )
        );

      const costs = costAggregation[0] || { totalCostsZAR: '0', refundPayouts: '0' };

      const grossRevenue = parseFloat(revenue.grossRevenueZAR);
      const totalCosts = parseFloat(costs.totalCostsZAR);
      const chargebacks = parseFloat(revenue.chargebackAmount);
      const netRevenue = grossRevenue - chargebacks;
      const netProfit = netRevenue - totalCosts;
      const profitMargin = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(2) : null;

      const existingSnapshot = await db
        .select()
        .from(platformFinancialSnapshots)
        .where(
          and(
            eq(platformFinancialSnapshots.periodStart, periodStartStr),
            eq(platformFinancialSnapshots.periodEnd, periodEndStr),
            eq(platformFinancialSnapshots.periodType, periodType),
            organizationId
              ? eq(platformFinancialSnapshots.organizationId, organizationId)
              : isNull(platformFinancialSnapshots.organizationId)
          )
        )
        .limit(1);

      const snapshotData: InsertPlatformFinancialSnapshot = {
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
        periodType,
        organizationId: organizationId || null,
        grossRevenueZAR: grossRevenue.toFixed(4),
        netRevenueZAR: netRevenue.toFixed(4),
        totalCostsZAR: totalCosts.toFixed(4),
        netProfitZAR: netProfit.toFixed(4),
        profitMarginPercent: profitMargin,
        courseRevenue: revenue.courseRevenue,
        creditRevenue: revenue.creditRevenue,
        licenseRevenue: revenue.licenseRevenue,
        subscriptionRevenue: revenue.subscriptionRevenue,
        chargebackAmount: revenue.chargebackAmount,
        refundAmount: costs.refundPayouts,
        transactionCount: revenue.transactionCount,
      };

      const keyWhere = and(
        eq(platformFinancialSnapshots.periodStart, periodStartStr),
        eq(platformFinancialSnapshots.periodEnd, periodEndStr),
        eq(platformFinancialSnapshots.periodType, periodType),
        organizationId
          ? eq(platformFinancialSnapshots.organizationId, organizationId)
          : isNull(platformFinancialSnapshots.organizationId)
      );

      const updateValues = { ...snapshotData, generatedAt: new Date() };

      let snapshot;
      if (existingSnapshot.length > 0) {
        [snapshot] = await db
          .update(platformFinancialSnapshots)
          .set(updateValues)
          .where(eq(platformFinancialSnapshots.id, existingSnapshot[0].id))
          .returning();
      } else {
        try {
          [snapshot] = await db
            .insert(platformFinancialSnapshots)
            .values(snapshotData)
            .returning();
        } catch (error) {
          if (!this.isUniqueViolation(error)) {
            throw error;
          }
          // Concurrent generation already inserted this key; update canonical row.
          [snapshot] = await db
            .update(platformFinancialSnapshots)
            .set(updateValues)
            .where(keyWhere)
            .returning();
        }
      }

      console.log(
        `[FinancialSnapshot] Generated ${periodType} snapshot for ${periodStartStr} to ${periodEndStr}` +
        (organizationId ? ` (org: ${organizationId})` : ' (platform-wide)') +
        `: Revenue ${netRevenue.toFixed(2)} ZAR, Costs ${totalCosts.toFixed(2)} ZAR, Profit ${netProfit.toFixed(2)} ZAR`
      );

      return {
        success: true,
        snapshotId: snapshot.id,
        summary: {
          periodStart,
          periodEnd,
          periodType,
          organizationId: organizationId || null,
          grossRevenueZAR: grossRevenue.toFixed(4),
          netRevenueZAR: netRevenue.toFixed(4),
          totalCostsZAR: totalCosts.toFixed(4),
          netProfitZAR: netProfit.toFixed(4),
          profitMarginPercent: profitMargin,
          courseRevenue: revenue.courseRevenue,
          creditRevenue: revenue.creditRevenue,
          licenseRevenue: revenue.licenseRevenue,
          subscriptionRevenue: revenue.subscriptionRevenue,
          chargebackAmount: revenue.chargebackAmount,
          refundAmount: costs.refundPayouts,
          transactionCount: revenue.transactionCount,
        },
      };
    } catch (error) {
      console.error('[FinancialSnapshot] Failed to generate snapshot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error generating snapshot',
      };
    }
  }

  static async generateAllOrgSnapshots(
    periodType: PeriodType,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ platform: SnapshotResult; orgs: Record<string, SnapshotResult> }> {
    const platformResult = await this.generateSnapshot(periodType, periodStart, periodEnd);

    const activeOrgs = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.isActive, true));

    const orgResults: Record<string, SnapshotResult> = {};

    for (const org of activeOrgs) {
      orgResults[org.id] = await this.generateSnapshot(periodType, periodStart, periodEnd, org.id);
    }

    return { platform: platformResult, orgs: orgResults };
  }

  static async runNightlyRollup(): Promise<void> {
    console.log('[FinancialSnapshot] Starting nightly rollup...');

    const yesterday = subDays(new Date(), 1);
    await this.generateDailySnapshot(yesterday);

    const orgs = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.isActive, true));
    for (const org of orgs) {
      await this.generateDailySnapshot(yesterday, org.id);
    }

    const now = new Date();
    if (now.getDay() === 1) {
      const lastWeek = subDays(now, 7);
      await this.generateWeeklySnapshot(lastWeek);
      for (const org of orgs) {
        await this.generateWeeklySnapshot(lastWeek, org.id);
      }
    }

    if (now.getDate() === 1) {
      const lastMonth = subMonths(now, 1);
      await this.generateMonthlySnapshot(lastMonth);
      for (const org of orgs) {
        await this.generateMonthlySnapshot(lastMonth, org.id);
      }
    }

    console.log('[FinancialSnapshot] Nightly rollup completed');
  }

  static async getLatestSnapshot(
    periodType: PeriodType,
    organizationId?: string
  ): Promise<typeof platformFinancialSnapshots.$inferSelect | null> {
    const orgCondition = organizationId
      ? eq(platformFinancialSnapshots.organizationId, organizationId)
      : isNull(platformFinancialSnapshots.organizationId);

    const [snapshot] = await db
      .select()
      .from(platformFinancialSnapshots)
      .where(
        and(
          eq(platformFinancialSnapshots.periodType, periodType),
          orgCondition
        )
      )
      .orderBy(sql`${platformFinancialSnapshots.periodEnd} DESC`)
      .limit(1);

    return snapshot || null;
  }

  static async getSnapshotsForRange(
    periodType: PeriodType,
    startDate: Date,
    endDate: Date,
    organizationId?: string
  ): Promise<Array<typeof platformFinancialSnapshots.$inferSelect>> {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    const orgCondition = organizationId
      ? eq(platformFinancialSnapshots.organizationId, organizationId)
      : isNull(platformFinancialSnapshots.organizationId);

    return db
      .select()
      .from(platformFinancialSnapshots)
      .where(
        and(
          eq(platformFinancialSnapshots.periodType, periodType),
          gte(platformFinancialSnapshots.periodStart, startStr),
          lte(platformFinancialSnapshots.periodEnd, endStr),
          orgCondition
        )
      )
      .orderBy(sql`${platformFinancialSnapshots.periodStart} ASC`);
  }

  static async getCurrentMonthOverview(organizationId?: string): Promise<SnapshotSummary | null> {
    const now = new Date();
    const periodStart = startOfMonth(now);
    const periodEnd = endOfMonth(now);

    const result = await this.generateSnapshot('monthly', periodStart, periodEnd, organizationId);
    return result.success ? result.summary || null : null;
  }

  static async getTrendData(
    periodType: PeriodType,
    numberOfPeriods: number,
    organizationId?: string
  ): Promise<Array<{
    periodStart: string;
    periodEnd: string;
    netRevenueZAR: string;
    totalCostsZAR: string;
    netProfitZAR: string;
  }>> {
    const orgCondition = organizationId
      ? eq(platformFinancialSnapshots.organizationId, organizationId)
      : isNull(platformFinancialSnapshots.organizationId);

    const snapshots = await db
      .select({
        periodStart: platformFinancialSnapshots.periodStart,
        periodEnd: platformFinancialSnapshots.periodEnd,
        netRevenueZAR: platformFinancialSnapshots.netRevenueZAR,
        totalCostsZAR: platformFinancialSnapshots.totalCostsZAR,
        netProfitZAR: platformFinancialSnapshots.netProfitZAR,
      })
      .from(platformFinancialSnapshots)
      .where(
        and(
          eq(platformFinancialSnapshots.periodType, periodType),
          orgCondition
        )
      )
      .orderBy(sql`${platformFinancialSnapshots.periodStart} DESC`)
      .limit(numberOfPeriods);

    return snapshots.map(s => ({
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      netRevenueZAR: s.netRevenueZAR || '0',
      totalCostsZAR: s.totalCostsZAR || '0',
      netProfitZAR: s.netProfitZAR || '0',
    })).reverse();
  }
}
