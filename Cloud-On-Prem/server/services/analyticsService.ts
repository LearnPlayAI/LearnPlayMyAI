// @ts-nocheck
import { db } from '../db';
import { 
  subscriptions, 
  subscriptionInvoices, 
  elearningSubscriptionPlans,
  subscriptionEvents,
  paymentIntents,
  creditOrders,
  coursePurchases,
  currencyConversionRates,
  userLicenses,
  organizations,
  organizationLicenseSettings,
  licensePayments,
  users
} from '@shared/schema';
import * as schema from '@shared/schema';
import { sql, eq, and, gte, lt, desc, count, lte } from 'drizzle-orm';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

/**
 * Analytics Service
 * 
 * Provides comprehensive analytics and reporting for SuperAdmin dashboard:
 * - MRR/ARR calculations
 * - Subscription health metrics
 * - Revenue breakdown
 * - Churn analysis
 * - Payment trends
 */

export interface MRRData {
  currentMRR: string; // Current monthly recurring revenue
  previousMRR: string; // Previous month's MRR
  growth: number; // Percentage growth
  breakdown: Array<{
    planName: string;
    planId: string;
    activeSubscriptions: number;
    monthlyValue: string;
  }>;
}

export interface ARRData {
  currentARR: string; // Current annual recurring revenue
  projectedARR: string; // Projected based on current growth
}

export interface SubscriptionHealthMetrics {
  total: number;
  active: number;
  grace: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  churnRate: number; // Percentage of cancelled vs total
  growthRate: number; // New subscriptions vs total
}

export interface RevenueBreakdown {
  totalRevenue: string;
  byStatus: Array<{
    status: string;
    amount: string;
    count: number;
  }>;
  byCurrency: Array<{
    currency: string;
    amount: string;
    count: number;
  }>;
  byPlan: Array<{
    planName: string;
    amount: string;
    count: number;
  }>;
}

export interface PaymentMetrics {
  totalProcessed: number;
  successRate: number;
  failureRate: number;
  totalAmount: string;
  byCurrency: Array<{
    currency: string;
    amount: string;
    count: number;
  }>;
}

export interface MonthlyTrend {
  month: string; // YYYY-MM format
  mrr: string;
  newSubscriptions: number;
  cancelledSubscriptions: number;
  revenue: string;
}

export class AnalyticsService {
  /**
   * Helper: Normalize invoice amount to ZAR
   * Handles multi-currency invoices using stored exchange rates, fallback rates, or hardcoded defaults
   * 
   * @param invoice - Invoice with amount and currency fields
   * @param fallbackRates - Current FX rates from currencyConversionRates table
   * @returns Normalized amount in ZAR
   */
  private static normalizeInvoiceToZAR(
    invoice: {
      amountDue: string;
      currency: string;
      originalAmount?: string | null;
      originalCurrency?: string | null;
      exchangeRate?: string | null;
    },
    fallbackRates: { usdToZar: string; eurToZar: string }
  ): number {
    const currency = invoice.originalCurrency || invoice.currency;
    
    // If already in ZAR, use amountDue directly
    if (currency === 'ZAR') {
      return parseFloat(invoice.amountDue);
    }
    
    // If we have stored exchange rate and original amount, use them (preferred)
    if (invoice.originalAmount && invoice.exchangeRate) {
      return parseFloat(invoice.originalAmount) * parseFloat(invoice.exchangeRate);
    }
    
    // Fall back to current rates from currencyConversionRates table
    const amount = invoice.originalAmount ? parseFloat(invoice.originalAmount) : parseFloat(invoice.amountDue);
    if (currency === 'USD') {
      return amount * parseFloat(fallbackRates.usdToZar);
    } else if (currency === 'EUR') {
      return amount * parseFloat(fallbackRates.eurToZar);
    }
    
    // Final fallback: assume it's already in ZAR
    return parseFloat(invoice.amountDue);
  }

  /**
   * Calculate current MRR (Monthly Recurring Revenue)
   * Converts annual subscriptions to monthly equivalent
   * CRITICAL: Normalizes multi-currency amounts to ZAR using current exchange rates
   */
  static async calculateMRR(): Promise<MRRData> {
    try {
      // Get current exchange rates for normalization
      const rates = await db.select().from(currencyConversionRates);
      const usdToZar = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === 'ZAR')?.rate || '18.5';
      const eurToZar = rates.find(r => r.baseCurrency === 'EUR' && r.targetCurrency === 'ZAR')?.rate || '20.0';

      // Get all active subscriptions with their plans
      const activeSubscriptions = await db
        .select({
          subscriptionId: subscriptions.id,
          planId: subscriptions.planId,
          planName: elearningSubscriptionPlans.name,
          planInterval: elearningSubscriptionPlans.interval,
          priceAmount: elearningSubscriptionPlans.priceAmount,
          currency: elearningSubscriptionPlans.currency,
        })
        .from(subscriptions)
        .innerJoin(elearningSubscriptionPlans, eq(subscriptions.planId, elearningSubscriptionPlans.id))
        .where(eq(subscriptions.status, 'active'));

      // Calculate current MRR (normalized to ZAR)
      let currentMRR = 0;
      const planBreakdown: Record<string, {
        planName: string;
        planId: string;
        activeSubscriptions: number;
        monthlyValue: number;
      }> = {};

      activeSubscriptions.forEach(sub => {
        const price = parseFloat(sub.priceAmount);
        
        // Convert to ZAR if necessary
        let priceInZAR = price;
        if (sub.currency === 'USD') {
          priceInZAR = price * parseFloat(usdToZar);
        } else if (sub.currency === 'EUR') {
          priceInZAR = price * parseFloat(eurToZar);
        }

        const monthlyValue = sub.planInterval === 'annual' ? priceInZAR / 12 : priceInZAR;
        currentMRR += monthlyValue;

        if (!planBreakdown[sub.planId]) {
          planBreakdown[sub.planId] = {
            planName: sub.planName,
            planId: sub.planId,
            activeSubscriptions: 0,
            monthlyValue: 0,
          };
        }

        planBreakdown[sub.planId].activeSubscriptions += 1;
        planBreakdown[sub.planId].monthlyValue += monthlyValue;
      });

      // Calculate previous month's MRR from historical subscription state
      // A subscription was active last month if:
      // - It was created before or during last month (createdAt <= lastMonthEnd)
      // - AND it wasn't cancelled, OR it was cancelled after last month ended (cancelledAt > lastMonthEnd OR cancelledAt IS NULL)
      const lastMonth = subMonths(new Date(), 1);
      const lastMonthStart = startOfMonth(lastMonth);
      const lastMonthEnd = endOfMonth(lastMonth);
      
      const lastMonthSubs = await db
        .select({
          priceAmount: elearningSubscriptionPlans.priceAmount,
          interval: elearningSubscriptionPlans.interval,
          currency: elearningSubscriptionPlans.currency,
          cancelledAt: subscriptions.cancelledAt,
        })
        .from(subscriptions)
        .innerJoin(elearningSubscriptionPlans, eq(subscriptions.planId, elearningSubscriptionPlans.id))
        .where(
          lte(subscriptions.createdAt, lastMonthEnd)
        );

      // Filter for subscriptions that were actually active during last month
      const activeLastMonth = lastMonthSubs.filter(sub => 
        !sub.cancelledAt || new Date(sub.cancelledAt) > lastMonthEnd
      );

      let previousMRR = 0;
      activeLastMonth.forEach(sub => {
        const price = parseFloat(sub.priceAmount);
        let priceInZAR = price;
        if (sub.currency === 'USD') {
          priceInZAR = price * parseFloat(usdToZar);
        } else if (sub.currency === 'EUR') {
          priceInZAR = price * parseFloat(eurToZar);
        }
        const monthlyValue = sub.interval === 'annual' ? priceInZAR / 12 : priceInZAR;
        previousMRR += monthlyValue;
      });

      const growth = previousMRR > 0 ? ((currentMRR - previousMRR) / previousMRR) * 100 : 0;

      return {
        currentMRR: currentMRR.toFixed(2),
        previousMRR: previousMRR.toFixed(2),
        growth: parseFloat(growth.toFixed(2)),
        breakdown: Object.values(planBreakdown).map(plan => ({
          ...plan,
          monthlyValue: plan.monthlyValue.toFixed(2),
        })),
      };
    } catch (error: any) {
      console.error('[AnalyticsService] Error calculating MRR:', error);
      throw new Error(`Failed to calculate MRR: ${error.message}`);
    }
  }

  /**
   * Calculate ARR (Annual Recurring Revenue)
   */
  static async calculateARR(): Promise<ARRData> {
    try {
      const mrrData = await this.calculateMRR();
      const currentARR = parseFloat(mrrData.currentMRR) * 12;
      
      // Project ARR based on current growth rate
      const growthMultiplier = 1 + (mrrData.growth / 100);
      const projectedARR = currentARR * growthMultiplier;

      return {
        currentARR: currentARR.toFixed(2),
        projectedARR: projectedARR.toFixed(2),
      };
    } catch (error: any) {
      console.error('[AnalyticsService] Error calculating ARR:', error);
      throw new Error(`Failed to calculate ARR: ${error.message}`);
    }
  }

  /**
   * Get subscription health metrics
   */
  static async getSubscriptionHealth(): Promise<SubscriptionHealthMetrics> {
    try {
      // Get subscription counts by status
      const statusCounts = await db
        .select({
          status: subscriptions.status,
          count: sql<number>`count(*)::int`,
        })
        .from(subscriptions)
        .groupBy(subscriptions.status);

      const metrics: SubscriptionHealthMetrics = {
        total: 0,
        active: 0,
        grace: 0,
        pastDue: 0,
        suspended: 0,
        cancelled: 0,
        churnRate: 0,
        growthRate: 0,
      };

      statusCounts.forEach(row => {
        const count = Number(row.count);
        metrics.total += count;
        
        switch (row.status) {
          case 'active':
            metrics.active = count;
            break;
          case 'grace':
            metrics.grace = count;
            break;
          case 'past_due':
            metrics.pastDue = count;
            break;
          case 'suspended':
            metrics.suspended = count;
            break;
          case 'cancelled':
            metrics.cancelled = count;
            break;
        }
      });

      // Calculate churn rate (cancelled / total)
      metrics.churnRate = metrics.total > 0 
        ? parseFloat(((metrics.cancelled / metrics.total) * 100).toFixed(2))
        : 0;

      // Calculate growth rate (new active subscriptions in last 30 days / total)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const newSubscriptions = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, 'active'),
            gte(subscriptions.createdAt, thirtyDaysAgo)
          )
        );

      const newCount = Number(newSubscriptions[0]?.count || 0);
      metrics.growthRate = metrics.total > 0
        ? parseFloat(((newCount / metrics.total) * 100).toFixed(2))
        : 0;

      return metrics;
    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching subscription health:', error);
      throw new Error(`Failed to fetch subscription health: ${error.message}`);
    }
  }

  /**
   * Get revenue breakdown for a date range
   * CRITICAL: All amounts normalized to ZAR using stored exchangeRate snapshots
   */
  static async getRevenueBreakdown(
    startDate: Date,
    endDate: Date
  ): Promise<RevenueBreakdown> {
    try {
      // Get current exchange rates for any invoices without stored rates
      const rates = await db.select().from(currencyConversionRates);
      const usdToZar = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === 'ZAR')?.rate || '18.5';
      const eurToZar = rates.find(r => r.baseCurrency === 'EUR' && r.targetCurrency === 'ZAR')?.rate || '20.0';

      // Get all invoices within date range
      const invoices = await db
        .select({
          id: subscriptionInvoices.id,
          subscriptionId: subscriptionInvoices.subscriptionId,
          amountDue: subscriptionInvoices.amountDue,
          currency: subscriptionInvoices.currency,
          originalAmount: subscriptionInvoices.originalAmount,
          originalCurrency: subscriptionInvoices.originalCurrency,
          exchangeRate: subscriptionInvoices.exchangeRate,
          status: subscriptionInvoices.status,
          planId: subscriptions.planId,
          planName: elearningSubscriptionPlans.name,
        })
        .from(subscriptionInvoices)
        .innerJoin(subscriptions, eq(subscriptionInvoices.subscriptionId, subscriptions.id))
        .innerJoin(elearningSubscriptionPlans, eq(subscriptions.planId, elearningSubscriptionPlans.id))
        .where(
          and(
            gte(subscriptionInvoices.createdAt, startDate),
            lt(subscriptionInvoices.createdAt, endDate)
          )
        );

      let totalRevenue = 0;
      const byStatus: Record<string, { amount: number; count: number }> = {};
      const byCurrency: Record<string, { amount: number; count: number }> = {};
      const byPlan: Record<string, { planName: string; amount: number; count: number }> = {};

      invoices.forEach(invoice => {
        // Normalize to ZAR using helper (handles multi-currency properly)
        const amountInZAR = this.normalizeInvoiceToZAR(invoice, { usdToZar, eurToZar });
        totalRevenue += amountInZAR;

        // Group by status (normalized to ZAR)
        if (!byStatus[invoice.status]) {
          byStatus[invoice.status] = { amount: 0, count: 0 };
        }
        byStatus[invoice.status].amount += amountInZAR;
        byStatus[invoice.status].count += 1;

        // Group by original currency (before conversion)
        const originalCurrency = invoice.originalCurrency || invoice.currency;
        if (!byCurrency[originalCurrency]) {
          byCurrency[originalCurrency] = { amount: 0, count: 0 };
        }
        // Store in original currency for breakdown
        const originalAmount = invoice.originalAmount ? parseFloat(invoice.originalAmount) : parseFloat(invoice.amountDue);
        byCurrency[originalCurrency].amount += originalAmount;
        byCurrency[originalCurrency].count += 1;

        // Group by plan (normalized to ZAR)
        if (!byPlan[invoice.planId]) {
          byPlan[invoice.planId] = { planName: invoice.planName, amount: 0, count: 0 };
        }
        byPlan[invoice.planId].amount += amountInZAR;
        byPlan[invoice.planId].count += 1;
      });

      return {
        totalRevenue: totalRevenue.toFixed(2), // Total in ZAR
        byStatus: Object.entries(byStatus).map(([status, data]) => ({
          status,
          amount: data.amount.toFixed(2),
          count: data.count,
        })),
        byCurrency: Object.entries(byCurrency).map(([currency, data]) => ({
          currency,
          amount: data.amount.toFixed(2), // In original currency
          count: data.count,
        })),
        byPlan: Object.entries(byPlan).map(([planId, data]) => ({
          planName: data.planName,
          amount: data.amount.toFixed(2), // In ZAR
          count: data.count,
        })),
      };
    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching revenue breakdown:', error);
      throw new Error(`Failed to fetch revenue breakdown: ${error.message}`);
    }
  }

  /**
   * Get payment processing metrics
   * CRITICAL: Normalizes amounts to ZAR using current exchange rates
   */
  static async getPaymentMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<PaymentMetrics> {
    try {
      // Get current exchange rates
      const rates = await db.select().from(currencyConversionRates);
      const usdToZar = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === 'ZAR')?.rate || '18.5';
      const eurToZar = rates.find(r => r.baseCurrency === 'EUR' && r.targetCurrency === 'ZAR')?.rate || '20.0';

      const payments = await db
        .select({
          status: paymentIntents.status,
          amount: paymentIntents.amount,
          currency: paymentIntents.currency,
          originalAmount: paymentIntents.originalAmount,
          originalCurrency: paymentIntents.originalCurrency,
        })
        .from(paymentIntents)
        .where(
          and(
            gte(paymentIntents.createdAt, startDate),
            lt(paymentIntents.createdAt, endDate)
          )
        );

      let totalProcessed = 0;
      let successCount = 0;
      let failureCount = 0;
      let totalAmountZAR = 0;
      const byCurrency: Record<string, { amount: number; count: number }> = {};

      payments.forEach(payment => {
        totalProcessed += 1;
        
        if (payment.status === 'succeeded') {
          successCount += 1;
          const amount = parseFloat(payment.amount);
          
          // Normalize to ZAR
          let amountInZAR = amount;
          if (payment.currency === 'USD') {
            amountInZAR = amount * parseFloat(usdToZar);
          } else if (payment.currency === 'EUR') {
            amountInZAR = amount * parseFloat(eurToZar);
          }
          
          totalAmountZAR += amountInZAR;

          // Group by original currency
          const currency = payment.originalCurrency || payment.currency;
          if (!byCurrency[currency]) {
            byCurrency[currency] = { amount: 0, count: 0 };
          }
          byCurrency[currency].amount += amount; // Keep in original currency for breakdown
          byCurrency[currency].count += 1;
        } else if (payment.status === 'failed') {
          failureCount += 1;
        }
      });

      const successRate = totalProcessed > 0 ? (successCount / totalProcessed) * 100 : 0;
      const failureRate = totalProcessed > 0 ? (failureCount / totalProcessed) * 100 : 0;

      return {
        totalProcessed,
        successRate: parseFloat(successRate.toFixed(2)),
        failureRate: parseFloat(failureRate.toFixed(2)),
        totalAmount: totalAmountZAR.toFixed(2), // Total in ZAR
        byCurrency: Object.entries(byCurrency).map(([currency, data]) => ({
          currency,
          amount: data.amount.toFixed(2), // In original currency
          count: data.count,
        })),
      };
    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching payment metrics:', error);
      throw new Error(`Failed to fetch payment metrics: ${error.message}`);
    }
  }

  /**
   * Get monthly trends for the last N months
   */
  static async getMonthlyTrends(months: number = 12): Promise<MonthlyTrend[]> {
    try {
      const trends: MonthlyTrend[] = [];
      
      for (let i = months - 1; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(subMonths(new Date(), i));

        // Get new subscriptions in this month
        const newSubs = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(subscriptions)
          .where(
            and(
              gte(subscriptions.createdAt, monthStart),
              lt(subscriptions.createdAt, monthEnd)
            )
          );

        // Get cancelled subscriptions in this month (fix nullable cancelledAt)
        const cancelledSubs = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.status, 'cancelled'),
              sql`${subscriptions.cancelledAt} IS NOT NULL`,
              gte(subscriptions.cancelledAt, monthStart),
              lt(subscriptions.cancelledAt, monthEnd)
            )
          );

        // Get revenue for this month (with proper currency normalization)
        // Fetch individual invoices to normalize multi-currency amounts
        const paidInvoices = await db
          .select({
            amountDue: subscriptionInvoices.amountDue,
            currency: subscriptionInvoices.currency,
            originalAmount: subscriptionInvoices.originalAmount,
            originalCurrency: subscriptionInvoices.originalCurrency,
            exchangeRate: subscriptionInvoices.exchangeRate,
          })
          .from(subscriptionInvoices)
          .where(
            and(
              eq(subscriptionInvoices.status, 'paid'),
              sql`${subscriptionInvoices.paidAt} IS NOT NULL`,
              gte(subscriptionInvoices.paidAt, monthStart),
              lt(subscriptionInvoices.paidAt, monthEnd)
            )
          );

        // Get exchange rates for normalization (load once for the month)
        const rates = await db.select().from(currencyConversionRates);
        const usdToZar = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === 'ZAR')?.rate || '18.5';
        const eurToZar = rates.find(r => r.baseCurrency === 'EUR' && r.targetCurrency === 'ZAR')?.rate || '20.0';

        // Normalize all paid invoices to ZAR and sum
        let totalRevenue = 0;
        paidInvoices.forEach(invoice => {
          const amountInZAR = this.normalizeInvoiceToZAR(invoice, { usdToZar, eurToZar });
          totalRevenue += amountInZAR;
        });

        // Calculate MRR snapshot for this month
        // CRITICAL: Count ALL subscriptions active during this month (not just created in this month)
        // A subscription is active during a month if it was created before monthEnd AND
        // either not cancelled OR cancelled after monthStart
        const activeSubs = await db
          .select({
            priceAmount: elearningSubscriptionPlans.priceAmount,
            interval: elearningSubscriptionPlans.interval,
            currency: elearningSubscriptionPlans.currency,
            cancelledAt: subscriptions.cancelledAt,
          })
          .from(subscriptions)
          .innerJoin(elearningSubscriptionPlans, eq(subscriptions.planId, elearningSubscriptionPlans.id))
          .where(
            lte(subscriptions.createdAt, monthEnd) // Created before or during month
          );

        // Filter for subscriptions that were actually active during this month
        const activeThisMonth = activeSubs.filter(sub =>
          !sub.cancelledAt || new Date(sub.cancelledAt) > monthStart
        );

        let mrr = 0;
        activeThisMonth.forEach(sub => {
          const price = parseFloat(sub.priceAmount);
          
          // Normalize to ZAR
          let priceInZAR = price;
          if (sub.currency === 'USD') {
            priceInZAR = price * parseFloat(usdToZar);
          } else if (sub.currency === 'EUR') {
            priceInZAR = price * parseFloat(eurToZar);
          }
          
          mrr += sub.interval === 'annual' ? priceInZAR / 12 : priceInZAR;
        });

        trends.push({
          month: format(monthStart, 'yyyy-MM'),
          mrr: mrr.toFixed(2),
          newSubscriptions: Number(newSubs[0]?.count || 0),
          cancelledSubscriptions: Number(cancelledSubs[0]?.count || 0),
          revenue: totalRevenue.toFixed(2), // Use normalized revenue
        });
      }

      return trends;
    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching monthly trends:', error);
      throw new Error(`Failed to fetch monthly trends: ${error.message}`);
    }
  }

  /**
   * Get comprehensive dashboard data
   */
  static async getDashboardData() {
    try {
      const [
        mrr,
        arr,
        subscriptionHealth,
        revenueBreakdown,
        paymentMetrics,
        monthlyTrends,
      ] = await Promise.all([
        this.calculateMRR(),
        this.calculateARR(),
        this.getSubscriptionHealth(),
        this.getRevenueBreakdown(subMonths(new Date(), 1), new Date()),
        this.getPaymentMetrics(subMonths(new Date(), 1), new Date()),
        this.getMonthlyTrends(12),
      ]);

      return {
        mrr,
        arr,
        subscriptionHealth,
        revenueBreakdown,
        paymentMetrics,
        monthlyTrends,
      };
    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching dashboard data:', error);
      throw new Error(`Failed to fetch dashboard data: ${error.message}`);
    }
  }

  // ==================== LICENSE ANALYTICS ====================

  /**
   * Get comprehensive license analytics for SuperAdmin
   */
  static async getLicenseAnalytics(params?: {
    organizationId?: string;
    tierFilter?: 'blue' | 'red' | 'gold';
    statusFilter?: 'active' | 'expired' | 'inactive';
    dateFrom?: Date;
    dateTo?: Date;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    summary: {
      totalLicenses: number;
      activeLicenses: number;
      expiredLicenses: number;
      inactiveLicenses: number;
      byTier: { blue: number; red: number; gold: number };
      utilizationRate: number;
    };
    organizations: {
      id: string;
      name: string;
      activeLicenses: number;
      maxSeats: number | null;
      tier: string | null;
      utilizationRate: number;
    }[];
    recentActivity: {
      type: 'activation' | 'revocation' | 'expiration' | 'payment';
      timestamp: Date;
      organizationId: string;
      organizationName: string;
      userId?: string;
      details: string;
    }[];
    revenue: {
      totalLicenseRevenue: number;
      byTier: { blue: number; red: number; gold: number };
      monthlyTrend: { month: string; revenue: number; newLicenses: number }[];
    };
    pagination: {
      total: number;
      limit: number;
      offset: number;
    };
  }> {
    try {
      const { organizationId, tierFilter, statusFilter, dateFrom, dateTo, searchQuery, limit = 50, offset = 0 } = params || {};

      // Build conditions for license query
      const conditions: any[] = [];
      if (organizationId) {
        conditions.push(eq(userLicenses.organizationId, organizationId));
      }
      if (tierFilter) {
        conditions.push(eq(userLicenses.tier, tierFilter));
      }
      if (statusFilter) {
        conditions.push(eq(userLicenses.status, statusFilter));
      }

      // Get license summary counts
      const summaryQuery = await db
        .select({
          status: userLicenses.status,
          tier: userLicenses.tier,
          count: sql<number>`count(*)::int`,
        })
        .from(userLicenses)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(userLicenses.status, userLicenses.tier);

      // Calculate summary
      const summary = {
        totalLicenses: 0,
        activeLicenses: 0,
        expiredLicenses: 0,
        inactiveLicenses: 0,
        byTier: { blue: 0, red: 0, gold: 0 },
        utilizationRate: 0,
      };

      summaryQuery.forEach(row => {
        const count = row.count;
        summary.totalLicenses += count;

        if (row.status === 'active') {
          summary.activeLicenses += count;
        } else if (row.status === 'expired') {
          summary.expiredLicenses += count;
        } else if (row.status === 'inactive') {
          summary.inactiveLicenses += count;
        }

        if (row.tier === 'blue') summary.byTier.blue += count;
        if (row.tier === 'red') summary.byTier.red += count;
        if (row.tier === 'gold') summary.byTier.gold += count;
      });

      // Get organizations with license stats
      const orgStatsQuery = await db
        .select({
          orgId: organizations.id,
          orgName: organizations.name,
          maxSeats: organizationLicenseSettings.maxSeats,
          activeLicenses: sql<number>`count(case when ${userLicenses.status} = 'active' then 1 end)::int`,
        })
        .from(organizations)
        .leftJoin(organizationLicenseSettings, eq(organizations.id, organizationLicenseSettings.organizationId))
        .leftJoin(userLicenses, eq(organizations.id, userLicenses.organizationId))
        .where(eq(organizations.licenseEnabled, true))
        .groupBy(organizations.id, organizations.name, organizationLicenseSettings.maxSeats)
        .limit(limit)
        .offset(offset);

      const organizationsResult = orgStatsQuery.map(row => ({
        id: row.orgId,
        name: row.orgName,
        activeLicenses: row.activeLicenses || 0,
        maxSeats: row.maxSeats,
        tier: null as string | null, // Will be populated from user licenses if needed
        utilizationRate: row.maxSeats ? ((row.activeLicenses || 0) / row.maxSeats) * 100 : 0,
      }));

      // Calculate overall utilization
      const totalMaxSeats = organizationsResult.reduce((sum, org) => sum + (org.maxSeats || 0), 0);
      const totalActiveSeats = organizationsResult.reduce((sum, org) => sum + org.activeLicenses, 0);
      summary.utilizationRate = totalMaxSeats > 0 ? (totalActiveSeats / totalMaxSeats) * 100 : 0;

      // Get recent license activity
      const recentActivations = await db
        .select({
          userId: userLicenses.userId,
          organizationId: userLicenses.organizationId,
          orgName: organizations.name,
          status: userLicenses.status,
          activatedAt: userLicenses.activatedAt,
          deactivatedAt: userLicenses.deactivatedAt,
          tier: userLicenses.tier,
        })
        .from(userLicenses)
        .leftJoin(organizations, eq(userLicenses.organizationId, organizations.id))
        .orderBy(desc(userLicenses.updatedAt))
        .limit(20);

      const recentActivity = recentActivations.map(row => ({
        type: row.status === 'active' ? 'activation' as const : row.status === 'revoked' ? 'revocation' as const : 'expiration' as const,
        timestamp: row.activatedAt || new Date(),
        organizationId: row.organizationId,
        organizationName: row.orgName || 'Unknown',
        userId: row.userId,
        details: `${row.tier} license ${row.status === 'active' ? 'activated' : row.status === 'revoked' ? 'revoked' : 'expired'}`,
      }));

      // Get license payment revenue
      const licensePaymentStats = await db
        .select({
          tier: licensePayments.tier,
          total: sql<string>`COALESCE(SUM(${licensePayments.amount}::numeric), 0)`,
        })
        .from(licensePayments)
        .where(eq(licensePayments.status, 'succeeded'))
        .groupBy(licensePayments.tier);

      const revenue = {
        totalLicenseRevenue: 0,
        byTier: { blue: 0, red: 0, gold: 0 },
        monthlyTrend: [] as { month: string; revenue: number; newLicenses: number }[],
      };

      licensePaymentStats.forEach(row => {
        const amount = parseFloat(row.total);
        revenue.totalLicenseRevenue += amount;
        if (row.tier === 'blue') revenue.byTier.blue = amount;
        if (row.tier === 'red') revenue.byTier.red = amount;
        if (row.tier === 'gold') revenue.byTier.gold = amount;
      });

      // Get monthly trend (last 6 months)
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(subMonths(new Date(), i));

        const [monthStats] = await db
          .select({
            revenue: sql<string>`COALESCE(SUM(${licensePayments.amount}::numeric), 0)`,
            newLicenses: sql<number>`count(*)::int`,
          })
          .from(licensePayments)
          .where(
            and(
              eq(licensePayments.status, 'succeeded'),
              gte(licensePayments.createdAt, monthStart),
              lt(licensePayments.createdAt, monthEnd)
            )
          );

        revenue.monthlyTrend.push({
          month: format(monthStart, 'MMM yyyy'),
          revenue: parseFloat(monthStats?.revenue || '0'),
          newLicenses: monthStats?.newLicenses || 0,
        });
      }

      // Get total count for pagination
      const [countResult] = await db
        .select({ count: sql<number>`count(distinct ${organizations.id})::int` })
        .from(organizations)
        .where(eq(organizations.licenseEnabled, true));

      return {
        summary,
        organizations: organizationsResult,
        recentActivity,
        revenue,
        pagination: {
          total: countResult?.count || 0,
          limit,
          offset,
        },
      };

    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching license analytics:', error);
      throw new Error(`Failed to fetch license analytics: ${error.message}`);
    }
  }

  /**
   * Get license analytics for a specific organization
   */
  static async getOrganizationLicenseAnalytics(organizationId: string): Promise<{
    overview: {
      activeLicenses: number;
      maxSeats: number | null;
      utilizationRate: number;
      currentTier: string | null;
      byTier: { blue: number; red: number; gold: number };
    };
    users: {
      id: string;
      email: string;
      gamerName: string | null;
      tier: string;
      status: string;
      activatedAt: Date | null;
      expiresAt: Date | null;
    }[];
    history: {
      type: string;
      timestamp: Date;
      userId: string;
      userEmail: string;
      details: string;
    }[];
    payments: {
      id: string;
      amount: string;
      currency: string;
      tier: string;
      seatCount: number;
      status: string;
      createdAt: Date;
    }[];
  }> {
    try {
      // Get organization settings
      const [settings] = await db
        .select()
        .from(organizationLicenseSettings)
        .where(eq(organizationLicenseSettings.organizationId, organizationId))
        .limit(1);

      // Get license stats by tier
      const tierStats = await db
        .select({
          tier: userLicenses.tier,
          status: userLicenses.status,
          count: sql<number>`count(*)::int`,
        })
        .from(userLicenses)
        .where(eq(userLicenses.organizationId, organizationId))
        .groupBy(userLicenses.tier, userLicenses.status);

      const overview = {
        activeLicenses: 0,
        maxSeats: settings?.maxSeats || null,
        utilizationRate: 0,
        currentTier: settings?.currentTier || null,
        byTier: { blue: 0, red: 0, gold: 0 },
      };

      tierStats.forEach(row => {
        if (row.status === 'active') {
          overview.activeLicenses += row.count;
          if (row.tier === 'blue') overview.byTier.blue = row.count;
          if (row.tier === 'red') overview.byTier.red = row.count;
          if (row.tier === 'gold') overview.byTier.gold = row.count;
        }
      });

      if (overview.maxSeats) {
        overview.utilizationRate = (overview.activeLicenses / overview.maxSeats) * 100;
      }

      // Get users with licenses
      const usersWithLicenses = await db
        .select({
          userId: userLicenses.userId,
          email: users.email,
          gamerName: users.gamerName,
          tier: userLicenses.tier,
          status: userLicenses.status,
          activatedAt: userLicenses.activatedAt,
          expiresAt: userLicenses.expiresAt,
        })
        .from(userLicenses)
        .leftJoin(users, eq(userLicenses.userId, users.id))
        .where(eq(userLicenses.organizationId, organizationId))
        .orderBy(desc(userLicenses.activatedAt));

      const usersResult = usersWithLicenses.map(row => ({
        id: row.userId,
        email: row.email || '',
        gamerName: row.gamerName,
        tier: row.tier,
        status: row.status,
        activatedAt: row.activatedAt,
        expiresAt: row.expiresAt,
      }));

      // Get license history
      const licenseHistory = await db
        .select({
          userId: userLicenses.userId,
          email: users.email,
          status: userLicenses.status,
          tier: userLicenses.tier,
          activatedAt: userLicenses.activatedAt,
          deactivatedAt: userLicenses.deactivatedAt,
        })
        .from(userLicenses)
        .leftJoin(users, eq(userLicenses.userId, users.id))
        .where(eq(userLicenses.organizationId, organizationId))
        .orderBy(desc(userLicenses.updatedAt))
        .limit(50);

      const history = licenseHistory.map(row => ({
        type: row.status === 'active' ? 'Activation' : row.status === 'revoked' ? 'Revocation' : 'Expiration',
        timestamp: row.activatedAt || row.deactivatedAt || new Date(),
        userId: row.userId,
        userEmail: row.email || '',
        details: `${row.tier} license ${row.status}`,
      }));

      // Get license payments
      const payments = await db
        .select()
        .from(licensePayments)
        .where(eq(licensePayments.organizationId, organizationId))
        .orderBy(desc(licensePayments.createdAt))
        .limit(20);

      const paymentsResult = payments.map(row => ({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        tier: row.tier,
        seatCount: row.seatCount,
        status: row.status,
        createdAt: row.createdAt!,
      }));

      return {
        overview,
        users: usersResult,
        history,
        payments: paymentsResult,
      };

    } catch (error: any) {
      console.error('[AnalyticsService] Error fetching organization license analytics:', error);
      throw new Error(`Failed to fetch organization license analytics: ${error.message}`);
    }
  }
}
