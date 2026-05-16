import { db } from '../db';
import {
  platformCostEntries,
  platformCostCategories,
  platformCostCategoryTypes,
  platformCostAllocations,
  platformFinancialAuditLog,
  organizations,
  type InsertPlatformCostEntry,
  type InsertPlatformCostAllocation,
  type InsertPlatformFinancialAuditLog,
  type PlatformCostEntry,
  type PlatformCostCategory,
  type PlatformCostCategoryType,
  type InsertPlatformCostCategoryType,
  type PlatformCostAllocation,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, or } from 'drizzle-orm';
import { ExchangeRateService } from './exchangeRateService';
import { format, addDays, addWeeks, addMonths, addQuarters, addYears } from 'date-fns';

export type CostRecurrence = 'one_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export interface CreateCostInput {
  categoryId: string;
  organizationId?: string;
  description: string;
  amount: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  recurrence: CostRecurrence;
  effectiveDate: string;
  endDate?: string;
  metadata?: Record<string, any>;
  createdBy: string;
}

export interface UpdateCostInput {
  description?: string;
  amount?: string;
  currency?: 'ZAR' | 'USD' | 'EUR';
  recurrence?: CostRecurrence;
  effectiveDate?: string;
  endDate?: string | null;
  metadata?: Record<string, any>;
  updatedBy: string;
}

export interface AllocationInput {
  costEntryId: string;
  organizationId: string;
  allocationPercentage: string;
}

export interface CostResult {
  success: boolean;
  costEntryId?: string;
  error?: string;
}

export class PlatformCostService {
  private static readonly BASE_CURRENCY = 'ZAR' as const;
  private static isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate.code === '23505' || candidate.cause?.code === '23505';
  }

  static async createCostEntry(input: CreateCostInput): Promise<CostResult> {
    try {
      let normalizedAmountZAR = input.amount;
      let exchangeRateUsed: string | null = null;

      if (input.currency !== this.BASE_CURRENCY) {
        const rate = await ExchangeRateService.getRate(input.currency, this.BASE_CURRENCY);
        if (rate <= 0) {
          return { success: false, error: `Unable to get exchange rate for ${input.currency} to ZAR` };
        }
        normalizedAmountZAR = (parseFloat(input.amount) * rate).toFixed(4);
        exchangeRateUsed = rate.toFixed(8);
      }

      const normalizedDescription = input.description.trim();
      const duplicateWindowStart = new Date(Date.now() - 5 * 60 * 1000);

      // Idempotency guard for manual double-submits/retries from the same actor.
      const [recentDuplicate] = await db
        .select({ id: platformCostEntries.id })
        .from(platformCostEntries)
        .where(and(
          eq(platformCostEntries.categoryId, input.categoryId),
          input.organizationId
            ? eq(platformCostEntries.organizationId, input.organizationId)
            : isNull(platformCostEntries.organizationId),
          eq(platformCostEntries.description, normalizedDescription),
          eq(platformCostEntries.amount, input.amount),
          eq(platformCostEntries.currency, input.currency),
          eq(platformCostEntries.recurrence, input.recurrence),
          eq(platformCostEntries.effectiveDate, input.effectiveDate),
          input.endDate
            ? eq(platformCostEntries.endDate, input.endDate)
            : isNull(platformCostEntries.endDate),
          eq(platformCostEntries.isAutomated, false),
          eq(platformCostEntries.createdBy, input.createdBy),
          gte(platformCostEntries.createdAt, duplicateWindowStart)
        ))
        .limit(1);

      if (recentDuplicate?.id) {
        return { success: true, costEntryId: recentDuplicate.id };
      }

      const [costEntry] = await db
        .insert(platformCostEntries)
        .values({
          categoryId: input.categoryId,
          organizationId: input.organizationId || null,
          description: normalizedDescription,
          amount: input.amount,
          currency: input.currency,
          exchangeRateUsed,
          normalizedAmountZAR,
          recurrence: input.recurrence,
          effectiveDate: input.effectiveDate,
          endDate: input.endDate || null,
          isAutomated: false,
          metadata: input.metadata ?? undefined,
          createdBy: input.createdBy,
        })
        .returning();

      await this.createAuditEntry({
        tableName: 'platformCostEntries',
        recordId: costEntry.id,
        action: 'create',
        afterData: costEntry,
        changedBy: input.createdBy,
      });

      console.log(`[CostService] Created cost entry: ${input.description} - ${input.amount} ${input.currency}`);

      return { success: true, costEntryId: costEntry.id };
    } catch (error) {
      console.error('[CostService] Failed to create cost entry:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create cost entry' };
    }
  }

  static async updateCostEntry(costEntryId: string, input: UpdateCostInput): Promise<CostResult> {
    try {
      const [existingEntry] = await db
        .select()
        .from(platformCostEntries)
        .where(eq(platformCostEntries.id, costEntryId))
        .limit(1);

      if (!existingEntry) {
        return { success: false, error: 'Cost entry not found' };
      }

      const updateData: Record<string, any> = {
        updatedBy: input.updatedBy,
      };

      if (input.description) updateData.description = input.description;
      if (input.recurrence) updateData.recurrence = input.recurrence;
      if (input.effectiveDate) updateData.effectiveDate = input.effectiveDate;
      if (input.endDate !== undefined) updateData.endDate = input.endDate;
      if (input.metadata) updateData.metadata = input.metadata;

      if (input.amount || input.currency) {
        const amount = input.amount || existingEntry.amount;
        const currency = input.currency || existingEntry.currency;

        let normalizedAmountZAR = amount;
        let exchangeRateUsed: string | null = null;

        if (currency !== this.BASE_CURRENCY) {
          const rate = await ExchangeRateService.getRate(currency, this.BASE_CURRENCY);
          if (rate <= 0) {
            return { success: false, error: `Unable to get exchange rate for ${currency} to ZAR` };
          }
          normalizedAmountZAR = (parseFloat(amount) * rate).toFixed(4);
          exchangeRateUsed = rate.toFixed(8);
        }

        updateData.amount = amount;
        updateData.currency = currency;
        updateData.normalizedAmountZAR = normalizedAmountZAR;
        updateData.exchangeRateUsed = exchangeRateUsed;
      }

      const [updatedEntry] = await db
        .update(platformCostEntries)
        .set(updateData)
        .where(eq(platformCostEntries.id, costEntryId))
        .returning();

      await this.createAuditEntry({
        tableName: 'platformCostEntries',
        recordId: costEntryId,
        action: 'update',
        beforeData: existingEntry,
        afterData: updatedEntry,
        changedBy: input.updatedBy,
      });

      console.log(`[CostService] Updated cost entry: ${costEntryId}`);

      return { success: true, costEntryId };
    } catch (error) {
      console.error('[CostService] Failed to update cost entry:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update cost entry' };
    }
  }

  static async deleteCostEntry(costEntryId: string, deletedBy: string): Promise<CostResult> {
    try {
      const [existingEntry] = await db
        .select()
        .from(platformCostEntries)
        .where(eq(platformCostEntries.id, costEntryId))
        .limit(1);

      if (!existingEntry) {
        return { success: false, error: 'Cost entry not found' };
      }

      await db.delete(platformCostAllocations).where(eq(platformCostAllocations.costEntryId, costEntryId));

      await db.delete(platformCostEntries).where(eq(platformCostEntries.id, costEntryId));

      await this.createAuditEntry({
        tableName: 'platformCostEntries',
        recordId: costEntryId,
        action: 'delete',
        beforeData: existingEntry,
        changedBy: deletedBy,
      });

      console.log(`[CostService] Deleted cost entry: ${costEntryId}`);

      return { success: true, costEntryId };
    } catch (error) {
      console.error('[CostService] Failed to delete cost entry:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete cost entry' };
    }
  }

  static async getCostEntry(costEntryId: string): Promise<PlatformCostEntry | null> {
    const [entry] = await db
      .select()
      .from(platformCostEntries)
      .where(eq(platformCostEntries.id, costEntryId))
      .limit(1);

    return entry || null;
  }

  static async getCostEntries(filters: {
    categoryId?: string;
    organizationId?: string;
    startDate?: string;
    endDate?: string;
    recurrence?: CostRecurrence;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: PlatformCostEntry[]; total: number }> {
    const conditions = [];

    if (filters.categoryId && filters.categoryId !== 'all') {
      conditions.push(eq(platformCostEntries.categoryId, filters.categoryId));
    }
    if (filters.organizationId) {
      conditions.push(
        or(
          eq(platformCostEntries.organizationId, filters.organizationId),
          isNull(platformCostEntries.organizationId)
        )
      );
    }
    if (filters.startDate) {
      conditions.push(gte(platformCostEntries.effectiveDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(platformCostEntries.effectiveDate, filters.endDate));
    }
    if (filters.recurrence) {
      conditions.push(eq(platformCostEntries.recurrence, filters.recurrence));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(platformCostEntries)
      .where(whereClause);

    const entries = await db
      .select()
      .from(platformCostEntries)
      .where(whereClause)
      .orderBy(desc(platformCostEntries.effectiveDate))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    return { entries, total: countResult?.count || 0 };
  }

  static async getCategories(): Promise<PlatformCostCategory[]> {
    return db
      .select()
      .from(platformCostCategories)
      .where(eq(platformCostCategories.isActive, true))
      .orderBy(platformCostCategories.displayOrder);
  }

  static async getCostCategory(id: string): Promise<PlatformCostCategory | null> {
    const [category] = await db
      .select()
      .from(platformCostCategories)
      .where(eq(platformCostCategories.id, id))
      .limit(1);
    return category || null;
  }

  static async createCostCategory(data: {
    name: string;
    type: string;
    description?: string;
    displayOrder?: number;
  }): Promise<{ success: boolean; categoryId?: string; error?: string }> {
    const normalizedName = data.name.trim();
    const normalizedType = data.type.trim();
    const normalizedDescription = data.description?.trim() || null;

    try {
      const [existing] = await db
        .select({ id: platformCostCategories.id })
        .from(platformCostCategories)
        .where(
          and(
            sql`LOWER(TRIM(${platformCostCategories.name})) = LOWER(TRIM(${normalizedName}))`,
            sql`LOWER(TRIM(${platformCostCategories.type})) = LOWER(TRIM(${normalizedType}))`
          )
        )
        .limit(1);

      if (existing?.id) {
        return { success: true, categoryId: existing.id };
      }

      const [category] = await db
        .insert(platformCostCategories)
        .values({
          name: normalizedName,
          type: normalizedType,
          description: normalizedDescription,
          displayOrder: data.displayOrder ?? 0,
          isActive: true,
        })
        .returning();

      console.log(`[CostService] Created cost category: ${data.name} (${data.type})`);

      return { success: true, categoryId: category.id };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const [existing] = await db
          .select({ id: platformCostCategories.id })
          .from(platformCostCategories)
          .where(
            and(
              sql`LOWER(TRIM(${platformCostCategories.name})) = LOWER(TRIM(${normalizedName}))`,
              sql`LOWER(TRIM(${platformCostCategories.type})) = LOWER(TRIM(${normalizedType}))`
            )
          )
          .limit(1);

        if (existing?.id) {
          return { success: true, categoryId: existing.id };
        }
      }
      console.error('[CostService] Failed to create cost category:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create cost category' };
    }
  }

  static async updateCostCategory(id: string, data: {
    name?: string;
    type?: string;
    description?: string;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const [existing] = await db
        .select()
        .from(platformCostCategories)
        .where(eq(platformCostCategories.id, id))
        .limit(1);

      if (!existing) {
        return { success: false, error: 'Cost category not found' };
      }

      const updateData: Partial<{
        name: string;
        type: string;
        description: string | null;
        displayOrder: number;
        isActive: boolean;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      if (data.type !== undefined) updateData.type = data.type.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || null;
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      await db
        .update(platformCostCategories)
        .set(updateData)
        .where(eq(platformCostCategories.id, id));

      console.log(`[CostService] Updated cost category: ${id}`);

      return { success: true };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { success: false, error: 'A category with this name and type already exists' };
      }
      console.error('[CostService] Failed to update cost category:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update cost category' };
    }
  }

  static async deleteCostCategory(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [existing] = await db
        .select()
        .from(platformCostCategories)
        .where(eq(platformCostCategories.id, id))
        .limit(1);

      if (!existing) {
        return { success: false, error: 'Cost category not found' };
      }

      // Soft delete by setting isActive to false
      await db
        .update(platformCostCategories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(platformCostCategories.id, id));

      console.log(`[CostService] Soft-deleted cost category: ${id}`);

      return { success: true };
    } catch (error) {
      console.error('[CostService] Failed to delete cost category:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete cost category' };
    }
  }

  static async getCostCategoryTypes(): Promise<PlatformCostCategoryType[]> {
    return await db.select().from(platformCostCategoryTypes).orderBy(platformCostCategoryTypes.displayOrder);
  }

  static async getActiveCostCategoryTypes(): Promise<PlatformCostCategoryType[]> {
    return await db.select().from(platformCostCategoryTypes).where(eq(platformCostCategoryTypes.isActive, true)).orderBy(platformCostCategoryTypes.displayOrder);
  }

  static async createCostCategoryType(data: {
    name: string;
    label: string;
    description?: string | null;
    displayOrder?: number;
  }): Promise<{ success: boolean; typeId?: string; error?: string }> {
    const normalizedName = data.name.trim();
    const normalizedLabel = data.label.trim();
    const normalizedDescription = data.description?.trim() || null;

    try {
      const [existing] = await db
        .select({ id: platformCostCategoryTypes.id })
        .from(platformCostCategoryTypes)
        .where(sql`LOWER(TRIM(${platformCostCategoryTypes.name})) = LOWER(TRIM(${normalizedName}))`)
        .limit(1);

      if (existing?.id) {
        return { success: true, typeId: existing.id };
      }

      const [type] = await db
        .insert(platformCostCategoryTypes)
        .values({
          name: normalizedName,
          label: normalizedLabel,
          description: normalizedDescription,
          displayOrder: data.displayOrder ?? 0,
          isActive: true,
        })
        .returning();
      return { success: true, typeId: type.id };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const [existing] = await db
          .select({ id: platformCostCategoryTypes.id })
          .from(platformCostCategoryTypes)
          .where(sql`LOWER(TRIM(${platformCostCategoryTypes.name})) = LOWER(TRIM(${normalizedName}))`)
          .limit(1);

        if (existing?.id) {
          return { success: true, typeId: existing.id };
        }
      }
      console.error('[CostService] Failed to create category type:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create category type' };
    }
  }

  static async updateCostCategoryType(id: string, data: {
    name?: string;
    label?: string;
    description?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.label !== undefined) updateData.label = data.label.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || null;
      if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      
      await db.update(platformCostCategoryTypes).set(updateData).where(eq(platformCostCategoryTypes.id, id));
      return { success: true };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { success: false, error: 'A category type with this name already exists' };
      }
      console.error('[CostService] Failed to update category type:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update category type' };
    }
  }

  static async deleteCostCategoryType(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [typeRecord] = await db.select().from(platformCostCategoryTypes).where(eq(platformCostCategoryTypes.id, id)).limit(1);
      if (!typeRecord) {
        return { success: false, error: 'Category type not found' };
      }
      
      const categoriesUsingType = await db
        .select({ id: platformCostCategories.id })
        .from(platformCostCategories)
        .where(sql`LOWER(TRIM(${platformCostCategories.type})) = LOWER(TRIM(${typeRecord.name}))`)
        .limit(1);
      if (categoriesUsingType.length > 0) {
        return { success: false, error: 'Cannot delete type: categories are using this type. Delete or reassign those categories first.' };
      }
      
      await db.delete(platformCostCategoryTypes).where(eq(platformCostCategoryTypes.id, id));
      return { success: true };
    } catch (error) {
      console.error('[CostService] Failed to delete category type:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete category type' };
    }
  }

  static async getCostStats(): Promise<{
    monthlyBurn: string;
    ytdCosts: string;
    activeRecurring: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthStart = format(startOfMonth, 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth, 'yyyy-MM-dd');
    const yearStart = format(startOfYear, 'yyyy-MM-dd');
    const today = format(now, 'yyyy-MM-dd');

    // Monthly burn: sum of all costs for current month
    const [monthlyResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
      })
      .from(platformCostEntries)
      .where(
        and(
          gte(platformCostEntries.effectiveDate, monthStart),
          lte(platformCostEntries.effectiveDate, monthEnd)
        )
      );

    // YTD costs: sum of all costs from start of year to today
    const [ytdResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
      })
      .from(platformCostEntries)
      .where(
        and(
          gte(platformCostEntries.effectiveDate, yearStart),
          lte(platformCostEntries.effectiveDate, today)
        )
      );

    // Active recurring: count of recurring entries that are still active (no end date or end date in future)
    const [recurringResult] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(platformCostEntries)
      .where(
        and(
          sql`${platformCostEntries.recurrence} != 'one_time'`,
          or(
            isNull(platformCostEntries.endDate),
            gte(platformCostEntries.endDate, today)
          )
        )
      );

    return {
      monthlyBurn: monthlyResult?.total || '0',
      ytdCosts: ytdResult?.total || '0',
      activeRecurring: recurringResult?.count || 0,
    };
  }

  static async getCategorySummary(startDate: string, endDate: string, organizationId?: string): Promise<Array<{
    categoryId: string;
    categoryName: string;
    categoryType: string;
    totalAmount: string;
    entryCount: number;
  }>> {
    const orgCondition = organizationId
      ? or(eq(platformCostEntries.organizationId, organizationId), isNull(platformCostEntries.organizationId))
      : sql`true`;

    return db
      .select({
        categoryId: platformCostCategories.id,
        categoryName: platformCostCategories.name,
        categoryType: platformCostCategories.type,
        totalAmount: sql<string>`COALESCE(SUM(${platformCostEntries.normalizedAmountZAR}::numeric), 0)::text`,
        entryCount: sql<number>`COUNT(${platformCostEntries.id})::int`,
      })
      .from(platformCostCategories)
      .leftJoin(
        platformCostEntries,
        and(
          eq(platformCostEntries.categoryId, platformCostCategories.id),
          gte(platformCostEntries.effectiveDate, startDate),
          lte(platformCostEntries.effectiveDate, endDate),
          orgCondition
        )
      )
      .where(eq(platformCostCategories.isActive, true))
      .groupBy(platformCostCategories.id, platformCostCategories.name, platformCostCategories.type)
      .orderBy(platformCostCategories.displayOrder);
  }

  static async setAllocations(
    costEntryId: string,
    allocations: AllocationInput[],
    changedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [costEntry] = await db
        .select()
        .from(platformCostEntries)
        .where(eq(platformCostEntries.id, costEntryId))
        .limit(1);

      if (!costEntry) {
        return { success: false, error: 'Cost entry not found' };
      }

      const totalPercentage = allocations.reduce((sum, a) => sum + parseFloat(a.allocationPercentage), 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        return { success: false, error: `Allocations must sum to 100% (got ${totalPercentage}%)` };
      }

      await db.delete(platformCostAllocations).where(eq(platformCostAllocations.costEntryId, costEntryId));

      const totalAmount = parseFloat(costEntry.normalizedAmountZAR);

      for (const allocation of allocations) {
        const allocatedAmount = (totalAmount * parseFloat(allocation.allocationPercentage) / 100).toFixed(4);

        await db.insert(platformCostAllocations).values({
          costEntryId,
          organizationId: allocation.organizationId,
          allocationPercentage: allocation.allocationPercentage,
          allocatedAmountZAR: allocatedAmount,
        });
      }

      await this.createAuditEntry({
        tableName: 'platformCostAllocations',
        recordId: costEntryId,
        action: 'update',
        afterData: { allocations },
        changedBy,
      });

      console.log(`[CostService] Set ${allocations.length} allocations for cost entry ${costEntryId}`);

      return { success: true };
    } catch (error) {
      console.error('[CostService] Failed to set allocations:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to set allocations' };
    }
  }

  static async getAllocations(costEntryId: string): Promise<PlatformCostAllocation[]> {
    return db
      .select()
      .from(platformCostAllocations)
      .where(eq(platformCostAllocations.costEntryId, costEntryId));
  }

  static async recordAutomatedCost(params: {
    categoryId: string;
    organizationId?: string;
    description: string;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    sourceReference: string;
    metadata?: Record<string, any>;
  }): Promise<CostResult> {
    try {
      let normalizedAmountZAR = params.amount;
      let exchangeRateUsed: string | null = null;

      if (params.currency !== this.BASE_CURRENCY) {
        const rate = await ExchangeRateService.getRate(params.currency, this.BASE_CURRENCY);
        if (rate <= 0) {
          return { success: false, error: `Unable to get exchange rate for ${params.currency} to ZAR` };
        }
        normalizedAmountZAR = (parseFloat(params.amount) * rate).toFixed(4);
        exchangeRateUsed = rate.toFixed(8);
      }

      const today = format(new Date(), 'yyyy-MM-dd');

      const [costEntry] = await db
        .insert(platformCostEntries)
        .values({
          categoryId: params.categoryId,
          organizationId: params.organizationId || null,
          description: params.description,
          amount: params.amount,
          currency: params.currency,
          exchangeRateUsed,
          normalizedAmountZAR,
          recurrence: 'one_time',
          effectiveDate: today,
          isAutomated: true,
          sourceReference: params.sourceReference,
          metadata: params.metadata ?? undefined,
          createdBy: 'system',
        })
        .onConflictDoNothing({
          target: [
            platformCostEntries.categoryId,
            platformCostEntries.organizationId,
            platformCostEntries.sourceReference,
            platformCostEntries.effectiveDate,
          ],
        })
        .returning();

      if (!costEntry) {
        const [existing] = await db
          .select({ id: platformCostEntries.id })
          .from(platformCostEntries)
          .where(and(
            eq(platformCostEntries.categoryId, params.categoryId),
            params.organizationId
              ? eq(platformCostEntries.organizationId, params.organizationId)
              : isNull(platformCostEntries.organizationId),
            eq(platformCostEntries.sourceReference, params.sourceReference),
            eq(platformCostEntries.effectiveDate, today),
            eq(platformCostEntries.isAutomated, true)
          ))
          .limit(1);

        if (existing?.id) {
          return { success: true, costEntryId: existing.id };
        }
      }

      console.log(`[CostService] Recorded automated cost: ${params.description} - ${params.amount} ${params.currency}`);

      return { success: true, costEntryId: costEntry.id };
    } catch (error) {
      console.error('[CostService] Failed to record automated cost:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to record automated cost' };
    }
  }

  private static async createAuditEntry(params: {
    tableName: string;
    recordId: string;
    action: 'create' | 'update' | 'delete';
    beforeData?: Record<string, any>;
    afterData?: Record<string, any>;
    changedBy?: string;
  }): Promise<void> {
    try {
      await db.insert(platformFinancialAuditLog).values({
        tableName: params.tableName,
        recordId: params.recordId,
        action: params.action,
        beforeData: params.beforeData ?? undefined,
        afterData: params.afterData ?? undefined,
        changedBy: params.changedBy || null,
      });
    } catch (error) {
      console.error('[CostService] Failed to create audit entry:', error);
    }
  }

  static getNextRecurrenceDate(currentDate: Date, recurrence: CostRecurrence): Date | null {
    switch (recurrence) {
      case 'one_time':
        return null;
      case 'daily':
        return addDays(currentDate, 1);
      case 'weekly':
        return addWeeks(currentDate, 1);
      case 'monthly':
        return addMonths(currentDate, 1);
      case 'quarterly':
        return addQuarters(currentDate, 1);
      case 'annual':
        return addYears(currentDate, 1);
      default:
        return null;
    }
  }
}
