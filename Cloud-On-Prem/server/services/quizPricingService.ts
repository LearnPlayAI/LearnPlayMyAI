import { db } from "../db";
import {
  quizCreditPricing,
  type QuizCreditPricing,
  type QuizQuestionTier,
} from "@shared/schema";
import {
  QUIZ_TIER_10_CREDITS,
  QUIZ_TIER_15_CREDITS,
  QUIZ_TIER_20_CREDITS,
} from "@shared/creditConstants";
import { eq, and, isNull, sql } from "drizzle-orm";

interface TierPricing {
  tier: QuizQuestionTier;
  creditCost: number;
  isOrgOverride: boolean;
}

interface PricingResult {
  tiers: TierPricing[];
  organizationId: string | null;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_TIER_COSTS: Record<QuizQuestionTier, number> = {
  "10": QUIZ_TIER_10_CREDITS,
  "15": QUIZ_TIER_15_CREDITS,
  "20": QUIZ_TIER_20_CREDITS,
};

class QuizPricingService {
  private platformCache: CacheEntry<TierPricing[]> | null = null;
  private orgCache: Map<string, CacheEntry<TierPricing[]>> = new Map();

  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    return entry !== null && entry !== undefined && Date.now() < entry.expiresAt;
  }

  private invalidatePlatformCache(): void {
    this.platformCache = null;
  }

  private invalidateOrgCache(orgId: string): void {
    this.orgCache.delete(orgId);
  }

  async getPlatformDefaults(): Promise<TierPricing[]> {
    if (this.isCacheValid(this.platformCache)) {
      return this.platformCache.data;
    }

    const platformPricing = await db
      .select()
      .from(quizCreditPricing)
      .where(and(isNull(quizCreditPricing.organizationId), eq(quizCreditPricing.isActive, true)));

    const tierMap = new Map<QuizQuestionTier, number>();
    for (const row of platformPricing) {
      tierMap.set(row.questionTier, row.creditCost);
    }

    const result: TierPricing[] = (["10", "15", "20"] as QuizQuestionTier[]).map((tier) => ({
      tier,
      creditCost: tierMap.get(tier) ?? DEFAULT_TIER_COSTS[tier],
      isOrgOverride: false,
    }));

    this.platformCache = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return result;
  }

  async getOrganizationPricing(orgId: string): Promise<TierPricing[]> {
    const cachedEntry = this.orgCache.get(orgId);
    if (this.isCacheValid(cachedEntry)) {
      return cachedEntry.data;
    }

    const orgPricing = await db
      .select()
      .from(quizCreditPricing)
      .where(and(eq(quizCreditPricing.organizationId, orgId), eq(quizCreditPricing.isActive, true)));

    const platformDefaults = await this.getPlatformDefaults();

    const orgTierMap = new Map<QuizQuestionTier, number>();
    for (const row of orgPricing) {
      orgTierMap.set(row.questionTier, row.creditCost);
    }

    const result: TierPricing[] = platformDefaults.map((defaultTier) => {
      const orgCost = orgTierMap.get(defaultTier.tier);
      if (orgCost !== undefined) {
        return {
          tier: defaultTier.tier,
          creditCost: orgCost,
          isOrgOverride: true,
        };
      }
      return { ...defaultTier, isOrgOverride: false };
    });

    this.orgCache.set(orgId, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  }

  async getEffectivePricing(orgId: string | null): Promise<PricingResult> {
    if (!orgId) {
      const tiers = await this.getPlatformDefaults();
      return { tiers, organizationId: null };
    }

    const tiers = await this.getOrganizationPricing(orgId);
    return { tiers, organizationId: orgId };
  }

  async updatePlatformPricing(
    tier: QuizQuestionTier,
    creditCost: number,
    userId: string
  ): Promise<QuizCreditPricing> {
    if (creditCost < 0) {
      throw new Error("Credit cost must be non-negative");
    }

    const existing = await db
      .select()
      .from(quizCreditPricing)
      .where(and(isNull(quizCreditPricing.organizationId), eq(quizCreditPricing.questionTier, tier)))
      .limit(1);

    let result: QuizCreditPricing;

    if (existing.length > 0) {
      const [updated] = await db
        .update(quizCreditPricing)
        .set({
          creditCost,
          updatedBy: userId,
          updatedAt: new Date(),
          isActive: true,
        })
        .where(eq(quizCreditPricing.id, existing[0].id))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db
        .insert(quizCreditPricing)
        .values({
          organizationId: null,
          questionTier: tier,
          creditCost,
          createdBy: userId,
          updatedBy: userId,
          isActive: true,
        })
        .returning();
      result = inserted;
    }

    this.invalidatePlatformCache();
    this.orgCache.clear();

    console.log(
      `[QuizPricingService] Updated platform pricing for tier ${tier}: ${creditCost} credits (by user ${userId})`
    );

    return result;
  }

  async updateOrganizationPricing(
    orgId: string,
    tier: QuizQuestionTier,
    creditCost: number,
    userId: string
  ): Promise<QuizCreditPricing> {
    if (creditCost < 0) {
      throw new Error("Credit cost must be non-negative");
    }

    const existing = await db
      .select()
      .from(quizCreditPricing)
      .where(
        and(eq(quizCreditPricing.organizationId, orgId), eq(quizCreditPricing.questionTier, tier))
      )
      .limit(1);

    let result: QuizCreditPricing;

    if (existing.length > 0) {
      const [updated] = await db
        .update(quizCreditPricing)
        .set({
          creditCost,
          updatedBy: userId,
          updatedAt: new Date(),
          isActive: true,
        })
        .where(eq(quizCreditPricing.id, existing[0].id))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db
        .insert(quizCreditPricing)
        .values({
          organizationId: orgId,
          questionTier: tier,
          creditCost,
          createdBy: userId,
          updatedBy: userId,
          isActive: true,
        })
        .returning();
      result = inserted;
    }

    this.invalidateOrgCache(orgId);

    console.log(
      `[QuizPricingService] Updated org ${orgId} pricing for tier ${tier}: ${creditCost} credits (by user ${userId})`
    );

    return result;
  }

  async seedPlatformDefaults(): Promise<void> {
    await db.transaction(async (tx) => {
      // Serialize startup seeding across clustered instances.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('seedQuizPricingPlatformDefaults_v1'))`);

      // Legacy self-heal: de-duplicate platform rows per tier.
      await tx.execute(sql`
        DELETE FROM "quizCreditPricing" a
        USING "quizCreditPricing" b
        WHERE a."organizationId" IS NULL
          AND b."organizationId" IS NULL
          AND a."questionTier" = b."questionTier"
          AND a.ctid < b.ctid
      `);

      const existing = await tx
        .select()
        .from(quizCreditPricing)
        .where(isNull(quizCreditPricing.organizationId));

      const existingTiers = new Set(existing.map((row) => row.questionTier));

      const tiers: QuizQuestionTier[] = ["10", "15", "20"];
      const toInsert: Array<{
        organizationId: null;
        questionTier: QuizQuestionTier;
        creditCost: number;
        isActive: boolean;
      }> = [];

      for (const tier of tiers) {
        if (!existingTiers.has(tier)) {
          toInsert.push({
            organizationId: null,
            questionTier: tier,
            creditCost: DEFAULT_TIER_COSTS[tier],
            isActive: true,
          });
        }
      }

      if (toInsert.length > 0) {
        await tx.insert(quizCreditPricing).values(toInsert);
        console.log(
          `[QuizPricingService] Seeded ${toInsert.length} platform default pricing entries: ${toInsert.map((t) => `${t.questionTier}=${t.creditCost}`).join(", ")}`
        );
      } else {
        console.log("[QuizPricingService] Platform defaults already exist, skipping seed");
      }
    });

    this.invalidatePlatformCache();
  }

  async getTierCreditCost(orgId: string | null, tier: QuizQuestionTier): Promise<number> {
    const { tiers } = await this.getEffectivePricing(orgId);
    const tierPricing = tiers.find((t) => t.tier === tier);
    return tierPricing?.creditCost ?? DEFAULT_TIER_COSTS[tier];
  }

  async deleteOrganizationPricing(orgId: string, tier: QuizQuestionTier): Promise<boolean> {
    const result = await db
      .delete(quizCreditPricing)
      .where(
        and(eq(quizCreditPricing.organizationId, orgId), eq(quizCreditPricing.questionTier, tier))
      )
      .returning();

    if (result.length > 0) {
      this.invalidateOrgCache(orgId);
      console.log(`[QuizPricingService] Deleted org ${orgId} pricing override for tier ${tier}`);
      return true;
    }

    return false;
  }

  async clearAllOrganizationPricing(orgId: string): Promise<number> {
    const result = await db
      .delete(quizCreditPricing)
      .where(eq(quizCreditPricing.organizationId, orgId))
      .returning();

    if (result.length > 0) {
      this.invalidateOrgCache(orgId);
      console.log(
        `[QuizPricingService] Cleared all ${result.length} pricing overrides for org ${orgId}`
      );
    }

    return result.length;
  }
}

export const quizPricingService = new QuizPricingService();
