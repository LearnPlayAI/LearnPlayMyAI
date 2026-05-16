import { db } from "../db";
import { platformPricing } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { TOPIC_ANALYSIS_CREDITS } from "@shared/creditConstants";

interface TopicAnalysisPricingResult {
  creditCost: number;
  isOrgOverride: boolean;
  updatedAt: Date | null;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

class TopicAnalysisPricingService {
  private platformCache: CacheEntry<TopicAnalysisPricingResult> | null = null;

  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    return entry !== null && entry !== undefined && Date.now() < entry.expiresAt;
  }

  invalidatePlatformCache(): void {
    this.platformCache = null;
  }

  invalidateAllCaches(): void {
    this.platformCache = null;
  }

  async getPlatformDefault(): Promise<TopicAnalysisPricingResult> {
    if (this.isCacheValid(this.platformCache)) {
      return this.platformCache.data;
    }

    const [pricing] = await db
      .select({
        creditsPerTopicAnalysis: platformPricing.creditsPerTopicAnalysis,
        updatedAt: platformPricing.updatedAt,
      })
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);

    const result: TopicAnalysisPricingResult = {
      creditCost: pricing?.creditsPerTopicAnalysis ?? TOPIC_ANALYSIS_CREDITS,
      isOrgOverride: false,
      updatedAt: pricing?.updatedAt ?? null,
    };

    this.platformCache = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return result;
  }

  async getEffectivePricing(orgId: string | null): Promise<TopicAnalysisPricingResult> {
    const platformDefault = await this.getPlatformDefault();
    return { ...platformDefault, isOrgOverride: false };
  }

  async getTopicAnalysisCreditCost(orgId: string | null): Promise<number> {
    const { creditCost } = await this.getEffectivePricing(orgId);
    return creditCost;
  }

  async updatePlatformPricing(creditCost: number, userId: string): Promise<TopicAnalysisPricingResult> {
    if (creditCost < 1 || creditCost > 100) {
      throw new Error("Credit cost must be between 1 and 100");
    }

    const [existing] = await db
      .select()
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);

    if (existing) {
      await db
        .update(platformPricing)
        .set({
          creditsPerTopicAnalysis: creditCost,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(platformPricing.id, existing.id));
    } else {
      await db.insert(platformPricing).values({
        creditsPerTopicAnalysis: creditCost,
        updatedBy: userId,
      });
    }

    this.invalidateAllCaches();

    console.log(
      `[TopicAnalysisPricingService] Updated platform topic analysis pricing to ${creditCost} credits (by user ${userId})`
    );

    return {
      creditCost,
      isOrgOverride: false,
      updatedAt: new Date(),
    };
  }
}

export const topicAnalysisPricingService = new TopicAnalysisPricingService();
