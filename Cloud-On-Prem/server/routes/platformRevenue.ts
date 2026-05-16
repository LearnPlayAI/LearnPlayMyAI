import { Router, Request, Response } from 'express';
import { isSuperAdminOrCustSuper } from '../adminAuth';
import { PlatformRevenueIngestionService } from '../services/platformRevenueIngestionService';
import { PlatformFinancialSnapshotService, type PeriodType } from '../services/platformFinancialSnapshotService';
import { PlatformCostService, type CostRecurrence, type CreateCostInput, type UpdateCostInput } from '../services/platformCostService';
import { quizPricingService } from '../services/quizPricingService';
import { db } from '../db';
import { 
  platformRevenueSources, 
  platformFinancialSnapshots, 
  platformCostEntries,
  platformCostCategories,
  platformFinancialAuditLog,
  organizations,
  users,
} from '@shared/schema';
import { isOnPremMode, isOnPremOwnApiKeys } from '../featureFlags';
import { QUIZ_TIERS, type QuizTier } from '@shared/creditConstants';
import { eq, and, gte, lte, sql, desc, isNull, or, count } from 'drizzle-orm';
import { z } from 'zod';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

const router = Router();

const LRUCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = LRUCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  LRUCache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  if (LRUCache.size > 100) {
    const firstKey = LRUCache.keys().next().value;
    if (firstKey) LRUCache.delete(firstKey);
  }
  LRUCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

router.get('/overview', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { period = 'monthly', organizationId } = req.query;
    const cacheKey = `revenue-overview-${period}-${organizationId || 'all'}`;
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const now = new Date();
    const currentPeriodStart = startOfMonth(now);
    const currentPeriodEnd = endOfMonth(now);
    const lastPeriodStart = startOfMonth(subMonths(now, 1));
    const lastPeriodEnd = endOfMonth(subMonths(now, 1));

    const orgCondition = organizationId
      ? eq(platformRevenueSources.organizationId, organizationId as string)
      : sql`true`;

    const [currentRevenue] = await db
      .select({
        grossRevenue: sql<string>`COALESCE(SUM(${platformRevenueSources.normalizedAmountZAR}::numeric), 0)::text`,
        platformCommission: sql<string>`COALESCE(SUM(${platformRevenueSources.platformCommission}::numeric), 0)::text`,
        transactionCount: sql<number>`COUNT(*)::int`,
      })
      .from(platformRevenueSources)
      .where(
        and(
          gte(platformRevenueSources.recordedAt, currentPeriodStart),
          lte(platformRevenueSources.recordedAt, currentPeriodEnd),
          orgCondition
        )
      );

    const [lastRevenue] = await db
      .select({
        grossRevenue: sql<string>`COALESCE(SUM(${platformRevenueSources.normalizedAmountZAR}::numeric), 0)::text`,
        platformCommission: sql<string>`COALESCE(SUM(${platformRevenueSources.platformCommission}::numeric), 0)::text`,
        transactionCount: sql<number>`COUNT(*)::int`,
      })
      .from(platformRevenueSources)
      .where(
        and(
          gte(platformRevenueSources.recordedAt, lastPeriodStart),
          lte(platformRevenueSources.recordedAt, lastPeriodEnd),
          orgCondition
        )
      );

    const costOrgCondition = organizationId
      ? or(eq(platformCostEntries.organizationId, organizationId as string), isNull(platformCostEntries.organizationId))
      : sql`true`;

    const currentDateStr = format(currentPeriodStart, 'yyyy-MM-dd');
    const currentEndStr = format(currentPeriodEnd, 'yyyy-MM-dd');
    const lastDateStr = format(lastPeriodStart, 'yyyy-MM-dd');
    const lastEndStr = format(lastPeriodEnd, 'yyyy-MM-dd');

    const [currentCosts] = await db
      .select({
        totalCosts: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
      })
      .from(platformCostEntries)
      .where(
        and(
          gte(platformCostEntries.effectiveDate, currentDateStr),
          lte(platformCostEntries.effectiveDate, currentEndStr),
          costOrgCondition
        )
      );

    const [lastCosts] = await db
      .select({
        totalCosts: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
      })
      .from(platformCostEntries)
      .where(
        and(
          gte(platformCostEntries.effectiveDate, lastDateStr),
          lte(platformCostEntries.effectiveDate, lastEndStr),
          costOrgCondition
        )
      );

    const revenueByType = await db
      .select({
        sourceType: platformRevenueSources.sourceType,
        totalAmount: sql<string>`COALESCE(SUM(${platformRevenueSources.normalizedAmountZAR}::numeric), 0)::text`,
        transactionCount: sql<number>`COUNT(*)::int`,
      })
      .from(platformRevenueSources)
      .where(
        and(
          gte(platformRevenueSources.recordedAt, currentPeriodStart),
          lte(platformRevenueSources.recordedAt, currentPeriodEnd),
          orgCondition
        )
      )
      .groupBy(platformRevenueSources.sourceType);

    const grossRevenue = parseFloat(currentRevenue?.grossRevenue || '0');
    const totalCosts = parseFloat(currentCosts?.totalCosts || '0');
    const netProfit = grossRevenue - totalCosts;
    const profitMargin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(2) : '0.00';

    const lastGrossRevenue = parseFloat(lastRevenue?.grossRevenue || '0');
    const lastTotalCosts = parseFloat(lastCosts?.totalCosts || '0');
    const lastNetProfit = lastGrossRevenue - lastTotalCosts;

    const revenueChange = lastGrossRevenue > 0 
      ? (((grossRevenue - lastGrossRevenue) / lastGrossRevenue) * 100).toFixed(2)
      : '0.00';
    const costChange = lastTotalCosts > 0 
      ? (((totalCosts - lastTotalCosts) / lastTotalCosts) * 100).toFixed(2)
      : '0.00';
    const profitChange = lastNetProfit !== 0
      ? (((netProfit - lastNetProfit) / Math.abs(lastNetProfit)) * 100).toFixed(2)
      : '0.00';

    const result = {
      period: {
        start: currentPeriodStart.toISOString(),
        end: currentPeriodEnd.toISOString(),
        type: period,
      },
      kpis: {
        grossRevenue: grossRevenue.toFixed(2),
        totalCosts: totalCosts.toFixed(2),
        netProfit: netProfit.toFixed(2),
        profitMargin,
        platformCommission: currentRevenue?.platformCommission || '0',
        transactionCount: currentRevenue?.transactionCount || 0,
      },
      changes: {
        revenueChange,
        costChange,
        profitChange,
        transactionCountChange: lastRevenue?.transactionCount 
          ? (((currentRevenue?.transactionCount || 0) - lastRevenue.transactionCount) / lastRevenue.transactionCount * 100).toFixed(2)
          : '0.00',
      },
      breakdown: revenueByType.reduce((acc, item) => {
        acc[item.sourceType] = {
          amount: item.totalAmount,
          count: item.transactionCount,
        };
        return acc;
      }, {} as Record<string, { amount: string; count: number }>),
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('[PlatformRevenue] Overview error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue overview' });
  }
});

router.get('/streams', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { 
      sourceType, 
      organizationId, 
      startDate, 
      endDate, 
      page = '1', 
      limit = '50',
      sortBy = 'recordedAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    if (sourceType && sourceType !== 'all') {
      conditions.push(eq(platformRevenueSources.sourceType, sourceType as any));
    }
    if (organizationId) {
      conditions.push(eq(platformRevenueSources.organizationId, organizationId as string));
    }
    if (startDate) {
      conditions.push(gte(platformRevenueSources.recordedAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(platformRevenueSources.recordedAt, new Date(endDate as string)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

    const [countResult] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(platformRevenueSources)
      .where(whereClause);

    const streams = await db
      .select({
        id: platformRevenueSources.id,
        sourceType: platformRevenueSources.sourceType,
        sourceId: platformRevenueSources.sourceId,
        organizationId: platformRevenueSources.organizationId,
        userId: platformRevenueSources.userId,
        grossAmount: platformRevenueSources.grossAmount,
        netAmount: platformRevenueSources.netAmount,
        platformCommission: platformRevenueSources.platformCommission,
        processingFee: platformRevenueSources.processingFee,
        currency: platformRevenueSources.currency,
        normalizedAmountZAR: platformRevenueSources.normalizedAmountZAR,
        recordedAt: platformRevenueSources.recordedAt,
        metadata: platformRevenueSources.metadata,
      })
      .from(platformRevenueSources)
      .where(whereClause)
      .orderBy(sortOrder === 'asc' 
        ? sql`${platformRevenueSources.recordedAt} ASC` 
        : desc(platformRevenueSources.recordedAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      data: streams,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult?.total || 0,
        totalPages: Math.ceil((countResult?.total || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('[PlatformRevenue] Streams error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue streams' });
  }
});

router.get('/costs', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { categoryId, organizationId, startDate, endDate, recurrence, page = '1', limit = '50' } = req.query;

    const result = await PlatformCostService.getCostEntries({
      categoryId: categoryId as string | undefined,
      organizationId: organizationId as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      recurrence: recurrence as CostRecurrence | undefined,
      limit: Math.min(parseInt(limit as string), 100),
      offset: (parseInt(page as string) - 1) * parseInt(limit as string),
    });

    res.json({
      data: result.entries,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: result.total,
        totalPages: Math.ceil(result.total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('[PlatformRevenue] Costs error:', error);
    res.status(500).json({ error: 'Failed to fetch costs' });
  }
});

const createCostSchema = z.object({
  categoryId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.enum(['ZAR', 'USD', 'EUR']),
  recurrence: z.enum(['one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual']),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  metadata: z.record(z.any()).optional(),
});

router.post('/costs', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const validation = createCostSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const result = await PlatformCostService.createCostEntry({
      ...validation.data,
      createdBy: req.session.userId!,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ id: result.costEntryId });
  } catch (error) {
    console.error('[PlatformRevenue] Create cost error:', error);
    res.status(500).json({ error: 'Failed to create cost entry' });
  }
});

const updateCostSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  currency: z.enum(['ZAR', 'USD', 'EUR']).optional(),
  recurrence: z.enum(['one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metadata: z.record(z.any()).optional(),
});

router.patch('/costs/:costId', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { costId } = req.params;
    const validation = updateCostSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const result = await PlatformCostService.updateCostEntry(costId, {
      ...validation.data,
      updatedBy: req.session.userId!,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PlatformRevenue] Update cost error:', error);
    res.status(500).json({ error: 'Failed to update cost entry' });
  }
});

router.delete('/costs/:costId', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { costId } = req.params;

    const result = await PlatformCostService.deleteCostEntry(costId, req.session.userId!);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PlatformRevenue] Delete cost error:', error);
    res.status(500).json({ error: 'Failed to delete cost entry' });
  }
});

router.get('/costs/categories', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const categories = await PlatformCostService.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('[PlatformRevenue] Categories error:', error);
    res.status(500).json({ error: 'Failed to fetch cost categories' });
  }
});

router.get('/costs/summary', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, organizationId } = req.query;

    const start = startDate ? startDate as string : format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const end = endDate ? endDate as string : format(endOfMonth(new Date()), 'yyyy-MM-dd');

    const summary = await PlatformCostService.getCategorySummary(start, end, organizationId as string | undefined);
    res.json(summary);
  } catch (error) {
    console.error('[PlatformRevenue] Cost summary error:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

router.get('/org-analytics', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, sortBy = 'revenue', limit = '20' } = req.query;

    const start = startDate ? new Date(startDate as string) : startOfMonth(new Date());
    const end = endDate ? new Date(endDate as string) : endOfMonth(new Date());

    const orgRevenue = await db
      .select({
        organizationId: platformRevenueSources.organizationId,
        grossRevenue: sql<string>`COALESCE(SUM(${platformRevenueSources.normalizedAmountZAR}::numeric), 0)::text`,
        platformCommission: sql<string>`COALESCE(SUM(${platformRevenueSources.platformCommission}::numeric), 0)::text`,
        transactionCount: sql<number>`COUNT(*)::int`,
      })
      .from(platformRevenueSources)
      .where(
        and(
          gte(platformRevenueSources.recordedAt, start),
          lte(platformRevenueSources.recordedAt, end)
        )
      )
      .groupBy(platformRevenueSources.organizationId)
      .orderBy(desc(sql`SUM(${platformRevenueSources.normalizedAmountZAR}::numeric)`))
      .limit(parseInt(limit as string));

    const orgIds = orgRevenue
      .filter(r => r.organizationId)
      .map(r => r.organizationId!);

    let orgNames: Record<string, string> = {};
    if (orgIds.length > 0) {
      const orgs = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(sql`${organizations.id} = ANY(${orgIds}::uuid[])`);
      orgNames = orgs.reduce((acc, org) => {
        acc[org.id] = org.name;
        return acc;
      }, {} as Record<string, string>);
    }

    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const orgCostsData = await db
      .select({
        organizationId: platformCostEntries.organizationId,
        totalCosts: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
      })
      .from(platformCostEntries)
      .where(
        and(
          gte(platformCostEntries.effectiveDate, startStr),
          lte(platformCostEntries.effectiveDate, endStr)
        )
      )
      .groupBy(platformCostEntries.organizationId);

    const orgCosts = orgCostsData.reduce((acc, item) => {
      if (item.organizationId) {
        acc[item.organizationId] = item.totalCosts;
      }
      return acc;
    }, {} as Record<string, string>);

    const analytics = orgRevenue.map(org => {
      const revenue = parseFloat(org.grossRevenue);
      const costs = parseFloat(orgCosts[org.organizationId || ''] || '0');
      const profit = revenue - costs;
      const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : '0.00';

      return {
        organizationId: org.organizationId,
        organizationName: org.organizationId ? orgNames[org.organizationId] || 'Unknown' : 'Platform-wide',
        grossRevenue: org.grossRevenue,
        platformCommission: org.platformCommission,
        totalCosts: costs.toFixed(2),
        netProfit: profit.toFixed(2),
        profitMargin: margin,
        transactionCount: org.transactionCount,
      };
    });

    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      data: analytics,
    });
  } catch (error) {
    console.error('[PlatformRevenue] Org analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch organization analytics' });
  }
});

router.get('/snapshots', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { periodType = 'monthly', organizationId, limit = '12' } = req.query;

    const trendData = await PlatformFinancialSnapshotService.getTrendData(
      periodType as PeriodType,
      parseInt(limit as string),
      organizationId as string | undefined
    );

    res.json(trendData);
  } catch (error) {
    console.error('[PlatformRevenue] Snapshots error:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

router.post('/snapshots/generate', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { periodType, date, organizationId } = req.body;

    const targetDate = date ? new Date(date) : new Date();
    let result;

    switch (periodType) {
      case 'daily':
        result = await PlatformFinancialSnapshotService.generateDailySnapshot(targetDate, organizationId);
        break;
      case 'weekly':
        result = await PlatformFinancialSnapshotService.generateWeeklySnapshot(targetDate, organizationId);
        break;
      case 'monthly':
      default:
        result = await PlatformFinancialSnapshotService.generateMonthlySnapshot(targetDate, organizationId);
        break;
    }

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ snapshotId: result.snapshotId, summary: result.summary });
  } catch (error) {
    console.error('[PlatformRevenue] Generate snapshot error:', error);
    res.status(500).json({ error: 'Failed to generate snapshot' });
  }
});

router.get('/audit-log', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { tableName, recordId, action, page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (tableName) {
      conditions.push(eq(platformFinancialAuditLog.tableName, tableName as string));
    }
    if (recordId) {
      conditions.push(eq(platformFinancialAuditLog.recordId, recordId as string));
    }
    if (action) {
      conditions.push(eq(platformFinancialAuditLog.action, action as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

    const [countResult] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(platformFinancialAuditLog)
      .where(whereClause);

    const logs = await db
      .select()
      .from(platformFinancialAuditLog)
      .where(whereClause)
      .orderBy(desc(platformFinancialAuditLog.changedAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult?.total || 0,
        totalPages: Math.ceil((countResult?.total || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('[PlatformRevenue] Audit log error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

const pricingRouter = Router();

const updateQuizTierPricingSchema = z.object({
  tiers: z.array(z.object({
    tier: z.enum(['10', '15', '20']),
    creditCost: z.number().int().min(0),
  })).min(1).max(3),
});

function formatTierResponse(tiers: Array<{ tier: string; creditCost: number; isOrgOverride: boolean }>) {
  return tiers.map(t => ({
    tier: t.tier,
    creditCost: t.creditCost,
    questionCount: QUIZ_TIERS[t.tier as QuizTier].questionCount,
    label: QUIZ_TIERS[t.tier as QuizTier].label,
  }));
}

pricingRouter.get('/quiz-tiers', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const tiers = await quizPricingService.getPlatformDefaults();
    
    res.json({
      tiers: formatTierResponse(tiers),
      isOrganizationOverride: false,
    });
  } catch (error) {
    console.error('[PlatformPricing] Get quiz tiers error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz tier pricing' });
  }
});

pricingRouter.put('/quiz-tiers', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    if (isOnPremMode() && isOnPremOwnApiKeys()) {
      const userId = req.session.userId!;
      const [actor] = await db.select({ isCustSuper: users.isCustSuper }).from(users).where(eq(users.id, userId)).limit(1);
      if (!actor?.isCustSuper) {
        return res.status(403).json({
          error: 'On-prem quiz tier pricing is CustSuper-managed. Please use a CustSuper account.',
        });
      }
    }

    const validation = updateQuizTierPricingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const userId = req.session.userId!;
    
    for (const tierUpdate of validation.data.tiers) {
      await quizPricingService.updatePlatformPricing(
        tierUpdate.tier as '10' | '15' | '20',
        tierUpdate.creditCost,
        userId
      );
    }

    const updatedTiers = await quizPricingService.getPlatformDefaults();
    
    res.json({
      tiers: formatTierResponse(updatedTiers),
      isOrganizationOverride: false,
    });
  } catch (error) {
    console.error('[PlatformPricing] Update quiz tiers error:', error);
    res.status(500).json({ error: 'Failed to update quiz tier pricing' });
  }
});

pricingRouter.get('/quiz-tiers/:orgId', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const tiers = await quizPricingService.getOrganizationPricing(orgId);
    const hasOverride = tiers.some(t => t.isOrgOverride);
    
    res.json({
      tiers: formatTierResponse(tiers),
      isOrganizationOverride: hasOverride,
      organizationId: orgId,
    });
  } catch (error) {
    console.error('[PlatformPricing] Get org quiz tiers error:', error);
    res.status(500).json({ error: 'Failed to fetch organization quiz tier pricing' });
  }
});

pricingRouter.put('/quiz-tiers/:orgId', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const validation = updateQuizTierPricingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const userId = req.session.userId!;
    
    for (const tierUpdate of validation.data.tiers) {
      await quizPricingService.updateOrganizationPricing(
        orgId,
        tierUpdate.tier as '10' | '15' | '20',
        tierUpdate.creditCost,
        userId
      );
    }

    const updatedTiers = await quizPricingService.getOrganizationPricing(orgId);
    const hasOverride = updatedTiers.some(t => t.isOrgOverride);
    
    res.json({
      tiers: formatTierResponse(updatedTiers),
      isOrganizationOverride: hasOverride,
      organizationId: orgId,
    });
  } catch (error) {
    console.error('[PlatformPricing] Update org quiz tiers error:', error);
    res.status(500).json({ error: 'Failed to update organization quiz tier pricing' });
  }
});

export function registerPlatformRevenueRoutes(app: any) {
  app.use('/api/admin/platform-revenue', router);
  app.use('/api/admin/platform-pricing', pricingRouter);
  console.log('[Routes] Platform Revenue routes registered at /api/admin/platform-revenue');
  console.log('[Routes] Platform Pricing routes registered at /api/admin/platform-pricing');
}
