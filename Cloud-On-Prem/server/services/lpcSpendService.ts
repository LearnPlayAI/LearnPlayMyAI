import { db } from '../db';
import { 
  lpCreditLedger, 
  creditTransactions,
  organizations, 
  users 
} from '@shared/schema';
import { sql, eq, and, gte, lte, desc, count, sum, lt } from 'drizzle-orm';

export interface SpendFilters {
  startDate?: Date;
  endDate?: Date;
  organizationId?: string;
  featureCategory?: string;
  currency?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface SpendByFeature {
  feature: string;
  totalSpent: number;
  transactionCount: number;
  percentageOfTotal: number;
}

export interface SpendByOrganization {
  organizationId: string;
  organizationName: string;
  totalSpent: number;
  transactionCount: number;
  percentageOfTotal: number;
}

export interface SpendTimeSeries {
  date: string;
  totalSpent: number;
  transactionCount: number;
  byFeature: Record<string, number>;
}

export interface SpendTransaction {
  id: string;
  userId: string;
  userName: string;
  organizationId: string | null;
  organizationName: string | null;
  amount: number;
  feature: string;
  description: string | null;
  createdAt: Date;
}

export interface SpendStats {
  totalSpent: number;
  totalTransactions: number;
  averageSpendPerTransaction: number;
  topFeatures: Array<{
    feature: string;
    totalSpent: number;
    count: number;
  }>;
  byOrganization: Array<{
    organizationId: string;
    organizationName: string;
    totalSpent: number;
  }>;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface SpendAggregation {
  groupBy: string;
  groupValue: string;
  totalSpent: number;
  transactionCount: number;
}

const FEATURE_CATEGORIES = [
  'ai_lesson_generation',
  'ai_quiz_generation',
  'premium_content',
  'marketplace_purchase',
  'manual_adjustment',
  'thumbnail_generation',
  'other'
] as const;

export class LpcSpendService {
  
  private static mapTransactionTypeToFeature(transactionType: string, metadata?: any): string {
    if (transactionType === 'deduction') {
      if (metadata?.lessonId) return 'ai_lesson_generation';
      if (metadata?.quizId || metadata?.questionTier) return 'ai_quiz_generation';
      if (metadata?.courseId && metadata?.type === 'marketplace') return 'marketplace_purchase';
      if (metadata?.contentType === 'premium') return 'premium_content';
      return 'other';
    }
    if (transactionType === 'thumbnail_generation') return 'thumbnail_generation';
    if (transactionType === 'adjustment') return 'manual_adjustment';
    return 'other';
  }

  private static buildWhereConditions(filters: SpendFilters) {
    const conditions = [];
    
    conditions.push(lt(lpCreditLedger.amount, 0));
    
    if (filters.startDate) {
      conditions.push(gte(lpCreditLedger.createdAt, filters.startDate));
    }
    
    if (filters.endDate) {
      conditions.push(lte(lpCreditLedger.createdAt, filters.endDate));
    }
    
    if (filters.organizationId) {
      conditions.push(eq(lpCreditLedger.organizationId, filters.organizationId));
    }
    
    return conditions;
  }

  static async getSpendStats(filters: SpendFilters = {}): Promise<SpendStats> {
    console.log('[LpcSpendService] Getting spend stats with filters:', JSON.stringify(filters));
    
    const conditions = this.buildWhereConditions(filters);
    
    const transactions = await db
      .select({
        id: lpCreditLedger.id,
        amount: lpCreditLedger.amount,
        transactionType: lpCreditLedger.transactionType,
        organizationId: lpCreditLedger.organizationId,
        metadata: lpCreditLedger.metadata,
        createdAt: lpCreditLedger.createdAt,
      })
      .from(lpCreditLedger)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(lpCreditLedger.createdAt));

    let totalSpent = 0;
    const featureSpend: Record<string, { total: number; count: number }> = {};
    const orgSpend: Record<string, { total: number; name: string }> = {};

    for (const tx of transactions) {
      const spend = Math.abs(tx.amount);
      totalSpent += spend;
      
      const feature = this.mapTransactionTypeToFeature(tx.transactionType, tx.metadata);
      if (!featureSpend[feature]) {
        featureSpend[feature] = { total: 0, count: 0 };
      }
      featureSpend[feature].total += spend;
      featureSpend[feature].count += 1;
      
      if (tx.organizationId) {
        if (!orgSpend[tx.organizationId]) {
          orgSpend[tx.organizationId] = { total: 0, name: '' };
        }
        orgSpend[tx.organizationId].total += spend;
      }
    }

    const orgIds = Object.keys(orgSpend);
    if (orgIds.length > 0) {
      const orgs = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(sql`${organizations.id} IN ${orgIds}`);
      
      for (const org of orgs) {
        if (orgSpend[org.id]) {
          orgSpend[org.id].name = org.name;
        }
      }
    }

    const topFeatures = Object.entries(featureSpend)
      .map(([feature, data]) => ({
        feature,
        totalSpent: data.total,
        count: data.count,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    const byOrganization = Object.entries(orgSpend)
      .map(([orgId, data]) => ({
        organizationId: orgId,
        organizationName: data.name || 'Unknown',
        totalSpent: data.total,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    return {
      totalSpent,
      totalTransactions: transactions.length,
      averageSpendPerTransaction: transactions.length > 0 ? totalSpent / transactions.length : 0,
      topFeatures,
      byOrganization,
      periodStart: filters.startDate || null,
      periodEnd: filters.endDate || null,
    };
  }

  static async getSpendByFeature(filters: SpendFilters = {}): Promise<SpendByFeature[]> {
    console.log('[LpcSpendService] Getting spend by feature with filters:', JSON.stringify(filters));
    
    const conditions = this.buildWhereConditions(filters);
    
    const transactions = await db
      .select({
        amount: lpCreditLedger.amount,
        transactionType: lpCreditLedger.transactionType,
        metadata: lpCreditLedger.metadata,
      })
      .from(lpCreditLedger)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const featureSpend: Record<string, { total: number; count: number }> = {};
    let grandTotal = 0;

    for (const tx of transactions) {
      const spend = Math.abs(tx.amount);
      grandTotal += spend;
      
      const feature = this.mapTransactionTypeToFeature(tx.transactionType, tx.metadata);
      if (!featureSpend[feature]) {
        featureSpend[feature] = { total: 0, count: 0 };
      }
      featureSpend[feature].total += spend;
      featureSpend[feature].count += 1;
    }

    return Object.entries(featureSpend)
      .map(([feature, data]) => ({
        feature,
        totalSpent: data.total,
        transactionCount: data.count,
        percentageOfTotal: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }

  static async getSpendByOrganization(filters: SpendFilters = {}): Promise<SpendByOrganization[]> {
    console.log('[LpcSpendService] Getting spend by organization with filters:', JSON.stringify(filters));
    
    const conditions = this.buildWhereConditions(filters);
    
    const transactions = await db
      .select({
        amount: lpCreditLedger.amount,
        organizationId: lpCreditLedger.organizationId,
      })
      .from(lpCreditLedger)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const orgSpend: Record<string, { total: number; count: number }> = {};
    let grandTotal = 0;

    for (const tx of transactions) {
      const spend = Math.abs(tx.amount);
      grandTotal += spend;
      
      const orgId = tx.organizationId || 'no_organization';
      if (!orgSpend[orgId]) {
        orgSpend[orgId] = { total: 0, count: 0 };
      }
      orgSpend[orgId].total += spend;
      orgSpend[orgId].count += 1;
    }

    const orgIds = Object.keys(orgSpend).filter(id => id !== 'no_organization');
    const orgMap: Record<string, string> = {};
    
    if (orgIds.length > 0) {
      const orgs = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(sql`${organizations.id} IN ${orgIds}`);
      
      for (const org of orgs) {
        orgMap[org.id] = org.name;
      }
    }

    return Object.entries(orgSpend)
      .map(([orgId, data]) => ({
        organizationId: orgId,
        organizationName: orgId === 'no_organization' ? 'No Organization' : (orgMap[orgId] || 'Unknown'),
        totalSpent: data.total,
        transactionCount: data.count,
        percentageOfTotal: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }

  static async getSpendTimeSeries(filters: SpendFilters = {}): Promise<SpendTimeSeries[]> {
    console.log('[LpcSpendService] Getting spend time series with filters:', JSON.stringify(filters));
    
    const conditions = this.buildWhereConditions(filters);
    
    const transactions = await db
      .select({
        amount: lpCreditLedger.amount,
        transactionType: lpCreditLedger.transactionType,
        metadata: lpCreditLedger.metadata,
        createdAt: lpCreditLedger.createdAt,
      })
      .from(lpCreditLedger)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(lpCreditLedger.createdAt);

    const dailyData: Record<string, {
      totalSpent: number;
      transactionCount: number;
      byFeature: Record<string, number>;
    }> = {};

    for (const tx of transactions) {
      if (!tx.createdAt) continue;
      
      const date = tx.createdAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { totalSpent: 0, transactionCount: 0, byFeature: {} };
      }
      
      const spend = Math.abs(tx.amount);
      dailyData[date].totalSpent += spend;
      dailyData[date].transactionCount += 1;
      
      const feature = this.mapTransactionTypeToFeature(tx.transactionType, tx.metadata);
      if (!dailyData[date].byFeature[feature]) {
        dailyData[date].byFeature[feature] = 0;
      }
      dailyData[date].byFeature[feature] += spend;
    }

    return Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        totalSpent: data.totalSpent,
        transactionCount: data.transactionCount,
        byFeature: data.byFeature,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  static async getSpendTransactions(
    filters: SpendFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    transactions: SpendTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    console.log('[LpcSpendService] Getting spend transactions with filters:', JSON.stringify(filters));
    
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 50, 100);
    const offset = (page - 1) * limit;
    
    const conditions = this.buildWhereConditions(filters);

    if (filters.featureCategory && filters.featureCategory !== 'all') {
      if (filters.featureCategory === 'ai_lesson_generation') {
        conditions.push(eq(lpCreditLedger.transactionType, 'deduction'));
      } else if (filters.featureCategory === 'ai_quiz_generation') {
        conditions.push(eq(lpCreditLedger.transactionType, 'deduction'));
      } else if (filters.featureCategory === 'thumbnail_generation') {
        conditions.push(eq(lpCreditLedger.transactionType, 'thumbnail_generation'));
      } else if (filters.featureCategory === 'manual_adjustment') {
        conditions.push(eq(lpCreditLedger.transactionType, 'adjustment'));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(lpCreditLedger)
      .where(whereClause);

    const total = countResult?.count || 0;

    const transactions = await db
      .select({
        id: lpCreditLedger.id,
        userId: lpCreditLedger.userId,
        organizationId: lpCreditLedger.organizationId,
        amount: lpCreditLedger.amount,
        transactionType: lpCreditLedger.transactionType,
        description: lpCreditLedger.description,
        metadata: lpCreditLedger.metadata,
        createdAt: lpCreditLedger.createdAt,
      })
      .from(lpCreditLedger)
      .where(whereClause)
      .orderBy(desc(lpCreditLedger.createdAt))
      .limit(limit)
      .offset(offset);

    const userIds = Array.from(new Set(transactions.map(tx => tx.userId)));
    const orgIds = Array.from(new Set(transactions.map(tx => tx.organizationId).filter(Boolean))) as string[];

    const userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const usersData = await db
        .select({ id: users.id, gamerName: users.gamerName, email: users.email })
        .from(users)
        .where(sql`${users.id} IN ${userIds}`);
      
      for (const user of usersData) {
        userMap[user.id] = user.gamerName || user.email;
      }
    }

    const orgMap: Record<string, string> = {};
    if (orgIds.length > 0) {
      const orgsData = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(sql`${organizations.id} IN ${orgIds}`);
      
      for (const org of orgsData) {
        orgMap[org.id] = org.name;
      }
    }

    const result: SpendTransaction[] = transactions.map(tx => ({
      id: tx.id,
      userId: tx.userId,
      userName: userMap[tx.userId] || 'Unknown',
      organizationId: tx.organizationId,
      organizationName: tx.organizationId ? (orgMap[tx.organizationId] || 'Unknown') : null,
      amount: Math.abs(tx.amount),
      feature: this.mapTransactionTypeToFeature(tx.transactionType, tx.metadata),
      description: tx.description,
      createdAt: tx.createdAt!,
    }));

    return {
      transactions: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getSpendAggregations(filters: SpendFilters = {}): Promise<{
    byFeature: SpendByFeature[];
    byOrganization: SpendByOrganization[];
    stats: SpendStats;
  }> {
    console.log('[LpcSpendService] Getting spend aggregations with filters:', JSON.stringify(filters));
    
    const [byFeature, byOrganization, stats] = await Promise.all([
      this.getSpendByFeature(filters),
      this.getSpendByOrganization(filters),
      this.getSpendStats(filters),
    ]);

    return {
      byFeature,
      byOrganization,
      stats,
    };
  }
}
