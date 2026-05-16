import { db } from '../db';
import { 
  creditOrders, 
  platformCostEntries,
  platformCostCategories,
  organizations, 
  users,
  creditPurchasePackages
} from '@shared/schema';
import { sql, eq, and, gte, lte, desc, count, sum, inArray } from 'drizzle-orm';
import { ExchangeRateService } from './exchangeRateService';

export interface RevenueFilters {
  startDate?: Date;
  endDate?: Date;
  organizationId?: string;
  status?: 'completed' | 'pending' | 'refunded' | 'all';
  currency?: 'ZAR' | 'USD' | 'EUR';
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface RevenueStats {
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  costs: number;
  netProfit: number;
  marginPercent: number;
  orderCount: number;
  refundCount: number;
  averageOrderValue: number;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface RevenueTimeSeries {
  date: string;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  costs: number;
  netProfit: number;
  orderCount: number;
}

export interface RevenueByOrganization {
  organizationId: string | null;
  organizationName: string;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  orderCount: number;
  percentageOfTotal: number;
}

export interface CostByCategory {
  categoryId: string | null;
  categoryName: string;
  categoryType: string | null;
  totalCost: number;
  entryCount: number;
  percentageOfTotal: number;
}

export interface OrderTransaction {
  id: string;
  purchaserId: string;
  purchaserName: string;
  purchaserEmail: string;
  organizationId: string | null;
  organizationName: string | null;
  amount: number;
  amountZAR: number;
  currency: string;
  creditsAmount: number;
  status: string;
  packageName: string | null;
  createdAt: Date;
}

const COMPLETED_STATUSES = ['succeeded', 'pending_receipt', 'pending_retry'] as const;
const REFUNDED_STATUSES = ['refunded'] as const;
const PENDING_STATUSES = ['pending', 'processing'] as const;

export class LpcRevenueService {

  private static async convertToZAR(amount: number, currency: string): Promise<number> {
    if (currency === 'ZAR') return amount;
    try {
      return await ExchangeRateService.convert(amount, currency as 'USD' | 'EUR', 'ZAR');
    } catch (error) {
      console.warn(`[LpcRevenueService] Failed to convert ${currency} to ZAR, using 1:1 rate:`, error);
      return amount;
    }
  }

  private static async convertFromZAR(amountZAR: number, targetCurrency: string): Promise<number> {
    if (targetCurrency === 'ZAR') return amountZAR;
    try {
      return await ExchangeRateService.convert(amountZAR, 'ZAR', targetCurrency as 'USD' | 'EUR');
    } catch (error) {
      console.warn(`[LpcRevenueService] Failed to convert ZAR to ${targetCurrency}, using 1:1 rate:`, error);
      return amountZAR;
    }
  }

  private static buildOrderWhereConditions(filters: RevenueFilters, statusFilter?: 'completed' | 'refunded') {
    const conditions = [];
    
    if (filters.startDate) {
      conditions.push(gte(creditOrders.createdAt, filters.startDate));
    }
    
    if (filters.endDate) {
      conditions.push(lte(creditOrders.createdAt, filters.endDate));
    }
    
    if (filters.organizationId) {
      conditions.push(eq(creditOrders.organizationId, filters.organizationId));
    }
    
    if (statusFilter === 'completed') {
      conditions.push(inArray(creditOrders.status, [...COMPLETED_STATUSES]));
    } else if (statusFilter === 'refunded') {
      conditions.push(inArray(creditOrders.status, [...REFUNDED_STATUSES]));
    } else if (filters.status && filters.status !== 'all') {
      if (filters.status === 'completed') {
        conditions.push(inArray(creditOrders.status, [...COMPLETED_STATUSES]));
      } else if (filters.status === 'refunded') {
        conditions.push(inArray(creditOrders.status, [...REFUNDED_STATUSES]));
      } else if (filters.status === 'pending') {
        conditions.push(inArray(creditOrders.status, [...PENDING_STATUSES]));
      }
    }
    
    return conditions;
  }

  private static buildCostWhereConditions(filters: RevenueFilters) {
    const conditions = [];
    
    if (filters.startDate) {
      conditions.push(gte(platformCostEntries.effectiveDate, filters.startDate.toISOString().split('T')[0]));
    }
    
    if (filters.endDate) {
      conditions.push(lte(platformCostEntries.effectiveDate, filters.endDate.toISOString().split('T')[0]));
    }
    
    if (filters.organizationId) {
      conditions.push(eq(platformCostEntries.organizationId, filters.organizationId));
    }
    
    return conditions;
  }

  static async getRevenueStats(filters: RevenueFilters = {}): Promise<RevenueStats> {
    console.log('[LpcRevenueService] Getting revenue stats with filters:', JSON.stringify(filters));
    
    const displayCurrency = filters.currency || 'ZAR';
    
    const completedConditions = this.buildOrderWhereConditions(filters, 'completed');
    const completedOrders = await db
      .select({
        amount: creditOrders.amount,
        currency: creditOrders.currency,
      })
      .from(creditOrders)
      .where(completedConditions.length > 0 ? and(...completedConditions) : undefined);

    let grossRevenueZAR = 0;
    for (const order of completedOrders) {
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      grossRevenueZAR += amountZAR;
    }

    const refundConditions = this.buildOrderWhereConditions(filters, 'refunded');
    const refundedOrders = await db
      .select({
        amount: creditOrders.amount,
        currency: creditOrders.currency,
      })
      .from(creditOrders)
      .where(refundConditions.length > 0 ? and(...refundConditions) : undefined);

    let refundsZAR = 0;
    for (const order of refundedOrders) {
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      refundsZAR += amountZAR;
    }

    const costConditions = this.buildCostWhereConditions(filters);
    const costs = await db
      .select({
        normalizedAmountZAR: platformCostEntries.normalizedAmountZAR,
      })
      .from(platformCostEntries)
      .where(costConditions.length > 0 ? and(...costConditions) : undefined);

    let totalCostsZAR = 0;
    for (const cost of costs) {
      totalCostsZAR += parseFloat(cost.normalizedAmountZAR);
    }

    const netRevenueZAR = grossRevenueZAR - refundsZAR;
    const netProfitZAR = netRevenueZAR - totalCostsZAR;
    const marginPercent = netRevenueZAR > 0 ? (netProfitZAR / netRevenueZAR) * 100 : 0;
    const averageOrderValue = completedOrders.length > 0 ? grossRevenueZAR / completedOrders.length : 0;

    const grossRevenue = await this.convertFromZAR(grossRevenueZAR, displayCurrency);
    const refunds = await this.convertFromZAR(refundsZAR, displayCurrency);
    const netRevenue = await this.convertFromZAR(netRevenueZAR, displayCurrency);
    const costsFinal = await this.convertFromZAR(totalCostsZAR, displayCurrency);
    const netProfit = await this.convertFromZAR(netProfitZAR, displayCurrency);
    const avgOrderVal = await this.convertFromZAR(averageOrderValue, displayCurrency);

    return {
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      costs: Math.round(costsFinal * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      marginPercent: Math.round(marginPercent * 100) / 100,
      orderCount: completedOrders.length,
      refundCount: refundedOrders.length,
      averageOrderValue: Math.round(avgOrderVal * 100) / 100,
      currency: displayCurrency,
      periodStart: filters.startDate || null,
      periodEnd: filters.endDate || null,
    };
  }

  static async getRevenueTimeSeries(filters: RevenueFilters = {}): Promise<RevenueTimeSeries[]> {
    console.log('[LpcRevenueService] Getting revenue time series with filters:', JSON.stringify(filters));
    
    const completedConditions = this.buildOrderWhereConditions(filters, 'completed');
    const completedOrders = await db
      .select({
        amount: creditOrders.amount,
        currency: creditOrders.currency,
        createdAt: creditOrders.createdAt,
      })
      .from(creditOrders)
      .where(completedConditions.length > 0 ? and(...completedConditions) : undefined)
      .orderBy(creditOrders.createdAt);

    const refundConditions = this.buildOrderWhereConditions(filters, 'refunded');
    const refundedOrders = await db
      .select({
        amount: creditOrders.amount,
        currency: creditOrders.currency,
        createdAt: creditOrders.createdAt,
      })
      .from(creditOrders)
      .where(refundConditions.length > 0 ? and(...refundConditions) : undefined)
      .orderBy(creditOrders.createdAt);

    const costConditions = this.buildCostWhereConditions(filters);
    const costs = await db
      .select({
        normalizedAmountZAR: platformCostEntries.normalizedAmountZAR,
        effectiveDate: platformCostEntries.effectiveDate,
      })
      .from(platformCostEntries)
      .where(costConditions.length > 0 ? and(...costConditions) : undefined);

    const dailyData: Record<string, {
      grossRevenue: number;
      refunds: number;
      costs: number;
      orderCount: number;
    }> = {};

    for (const order of completedOrders) {
      if (!order.createdAt) continue;
      const date = order.createdAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { grossRevenue: 0, refunds: 0, costs: 0, orderCount: 0 };
      }
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      dailyData[date].grossRevenue += amountZAR;
      dailyData[date].orderCount += 1;
    }

    for (const order of refundedOrders) {
      if (!order.createdAt) continue;
      const date = order.createdAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { grossRevenue: 0, refunds: 0, costs: 0, orderCount: 0 };
      }
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      dailyData[date].refunds += amountZAR;
    }

    for (const cost of costs) {
      if (!cost.effectiveDate) continue;
      const date = cost.effectiveDate;
      if (!dailyData[date]) {
        dailyData[date] = { grossRevenue: 0, refunds: 0, costs: 0, orderCount: 0 };
      }
      dailyData[date].costs += parseFloat(cost.normalizedAmountZAR);
    }

    return Object.entries(dailyData)
      .map(([date, data]) => {
        const netRevenue = data.grossRevenue - data.refunds;
        const netProfit = netRevenue - data.costs;
        return {
          date,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          refunds: Math.round(data.refunds * 100) / 100,
          netRevenue: Math.round(netRevenue * 100) / 100,
          costs: Math.round(data.costs * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          orderCount: data.orderCount,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  static async getRevenueByOrganization(filters: RevenueFilters = {}): Promise<RevenueByOrganization[]> {
    console.log('[LpcRevenueService] Getting revenue by organization with filters:', JSON.stringify(filters));
    
    const completedConditions = this.buildOrderWhereConditions(filters, 'completed');
    const completedOrders = await db
      .select({
        organizationId: creditOrders.organizationId,
        amount: creditOrders.amount,
        currency: creditOrders.currency,
      })
      .from(creditOrders)
      .where(completedConditions.length > 0 ? and(...completedConditions) : undefined);

    const refundConditions = this.buildOrderWhereConditions(filters, 'refunded');
    const refundedOrders = await db
      .select({
        organizationId: creditOrders.organizationId,
        amount: creditOrders.amount,
        currency: creditOrders.currency,
      })
      .from(creditOrders)
      .where(refundConditions.length > 0 ? and(...refundConditions) : undefined);

    const orgData: Record<string, {
      grossRevenue: number;
      refunds: number;
      orderCount: number;
    }> = {};

    let grandTotalRevenue = 0;

    for (const order of completedOrders) {
      const orgId = order.organizationId || 'individual';
      if (!orgData[orgId]) {
        orgData[orgId] = { grossRevenue: 0, refunds: 0, orderCount: 0 };
      }
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      orgData[orgId].grossRevenue += amountZAR;
      orgData[orgId].orderCount += 1;
      grandTotalRevenue += amountZAR;
    }

    for (const order of refundedOrders) {
      const orgId = order.organizationId || 'individual';
      if (!orgData[orgId]) {
        orgData[orgId] = { grossRevenue: 0, refunds: 0, orderCount: 0 };
      }
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      orgData[orgId].refunds += amountZAR;
    }

    const orgIds = Object.keys(orgData).filter(id => id !== 'individual');
    const orgMap: Record<string, string> = {};
    
    if (orgIds.length > 0) {
      const orgs = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, orgIds));
      
      for (const org of orgs) {
        orgMap[org.id] = org.name;
      }
    }

    return Object.entries(orgData)
      .map(([orgId, data]) => {
        const netRevenue = data.grossRevenue - data.refunds;
        return {
          organizationId: orgId === 'individual' ? null : orgId,
          organizationName: orgId === 'individual' ? 'Individual Purchases' : (orgMap[orgId] || 'Unknown'),
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          refunds: Math.round(data.refunds * 100) / 100,
          netRevenue: Math.round(netRevenue * 100) / 100,
          orderCount: data.orderCount,
          percentageOfTotal: grandTotalRevenue > 0 ? Math.round((data.grossRevenue / grandTotalRevenue) * 10000) / 100 : 0,
        };
      })
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  static async getCostBreakdown(filters: RevenueFilters = {}): Promise<CostByCategory[]> {
    console.log('[LpcRevenueService] Getting cost breakdown with filters:', JSON.stringify(filters));
    
    const costConditions = this.buildCostWhereConditions(filters);
    
    const costs = await db
      .select({
        categoryId: platformCostEntries.categoryId,
        normalizedAmountZAR: platformCostEntries.normalizedAmountZAR,
      })
      .from(platformCostEntries)
      .where(costConditions.length > 0 ? and(...costConditions) : undefined);

    const categoryData: Record<string, { totalCost: number; entryCount: number }> = {};
    let grandTotal = 0;

    for (const cost of costs) {
      const catId = cost.categoryId || 'uncategorized';
      if (!categoryData[catId]) {
        categoryData[catId] = { totalCost: 0, entryCount: 0 };
      }
      const amount = parseFloat(cost.normalizedAmountZAR);
      categoryData[catId].totalCost += amount;
      categoryData[catId].entryCount += 1;
      grandTotal += amount;
    }

    const catIds = Object.keys(categoryData).filter(id => id !== 'uncategorized');
    const categoryMap: Record<string, { name: string; type: string | null }> = {};
    
    if (catIds.length > 0) {
      const categories = await db
        .select({ 
          id: platformCostCategories.id, 
          name: platformCostCategories.name,
          type: platformCostCategories.type
        })
        .from(platformCostCategories)
        .where(inArray(platformCostCategories.id, catIds));
      
      for (const cat of categories) {
        categoryMap[cat.id] = { name: cat.name, type: cat.type };
      }
    }

    return Object.entries(categoryData)
      .map(([catId, data]) => ({
        categoryId: catId === 'uncategorized' ? null : catId,
        categoryName: catId === 'uncategorized' ? 'Uncategorized' : (categoryMap[catId]?.name || 'Unknown'),
        categoryType: catId === 'uncategorized' ? null : (categoryMap[catId]?.type || null),
        totalCost: Math.round(data.totalCost * 100) / 100,
        entryCount: data.entryCount,
        percentageOfTotal: grandTotal > 0 ? Math.round((data.totalCost / grandTotal) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  static async getOrderTransactions(
    filters: RevenueFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    orders: OrderTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    console.log('[LpcRevenueService] Getting order transactions with filters:', JSON.stringify(filters));
    
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 50, 100);
    const offset = (page - 1) * limit;
    
    const conditions = this.buildOrderWhereConditions(filters);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(creditOrders)
      .where(whereClause);

    const total = countResult?.count || 0;

    const orders = await db
      .select({
        id: creditOrders.id,
        purchaserId: creditOrders.purchaserId,
        organizationId: creditOrders.organizationId,
        packageId: creditOrders.packageId,
        amount: creditOrders.amount,
        currency: creditOrders.currency,
        creditsAmount: creditOrders.creditsAmount,
        status: creditOrders.status,
        createdAt: creditOrders.createdAt,
      })
      .from(creditOrders)
      .where(whereClause)
      .orderBy(desc(creditOrders.createdAt))
      .limit(limit)
      .offset(offset);

    const userIds = Array.from(new Set(orders.map(o => o.purchaserId)));
    const orgIds = Array.from(new Set(orders.map(o => o.organizationId).filter(Boolean))) as string[];
    const packageIds = Array.from(new Set(orders.map(o => o.packageId)));

    const userMap: Record<string, { name: string; email: string }> = {};
    if (userIds.length > 0) {
      const usersData = await db
        .select({ id: users.id, gamerName: users.gamerName, email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, userIds));
      
      for (const user of usersData) {
        const displayName = user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.gamerName || user.email;
        userMap[user.id] = { name: displayName, email: user.email };
      }
    }

    const orgMap: Record<string, string> = {};
    if (orgIds.length > 0) {
      const orgsData = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, orgIds));
      
      for (const org of orgsData) {
        orgMap[org.id] = org.name;
      }
    }

    const packageMap: Record<string, string> = {};
    if (packageIds.length > 0) {
      const packagesData = await db
        .select({ id: creditPurchasePackages.id, name: creditPurchasePackages.name })
        .from(creditPurchasePackages)
        .where(inArray(creditPurchasePackages.id, packageIds));
      
      for (const pkg of packagesData) {
        packageMap[pkg.id] = pkg.name;
      }
    }

    const result: OrderTransaction[] = [];
    for (const order of orders) {
      const amountZAR = await this.convertToZAR(parseFloat(order.amount), order.currency);
      result.push({
        id: order.id,
        purchaserId: order.purchaserId,
        purchaserName: userMap[order.purchaserId]?.name || 'Unknown',
        purchaserEmail: userMap[order.purchaserId]?.email || '',
        organizationId: order.organizationId,
        organizationName: order.organizationId ? (orgMap[order.organizationId] || 'Unknown') : null,
        amount: parseFloat(order.amount),
        amountZAR: Math.round(amountZAR * 100) / 100,
        currency: order.currency,
        creditsAmount: order.creditsAmount,
        status: order.status,
        packageName: packageMap[order.packageId] || null,
        createdAt: order.createdAt!,
      });
    }

    return {
      orders: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
