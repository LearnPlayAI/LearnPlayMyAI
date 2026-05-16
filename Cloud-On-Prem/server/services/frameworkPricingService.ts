import { db } from "../db";
import { platformPricing } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { COURSE_FRAMEWORK_CREDITS } from "@shared/creditConstants";

interface FrameworkPricingResult {
  creditCost: number;
  isOrgOverride: boolean;
  updatedAt: Date | null;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

class FrameworkPricingService {
  private platformCache: CacheEntry<FrameworkPricingResult> | null = null;

  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    return entry !== null && entry !== undefined && Date.now() < entry.expiresAt;
  }

  invalidatePlatformCache(): void {
    this.platformCache = null;
  }

  invalidateAllCaches(): void {
    this.platformCache = null;
  }

  async getPlatformDefault(): Promise<FrameworkPricingResult> {
    if (this.isCacheValid(this.platformCache)) {
      return this.platformCache.data;
    }

    const [pricing] = await db
      .select({
        creditsPerFrameworkGeneration: platformPricing.creditsPerFrameworkGeneration,
        updatedAt: platformPricing.updatedAt,
      })
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);

    const result: FrameworkPricingResult = {
      creditCost: pricing?.creditsPerFrameworkGeneration ?? COURSE_FRAMEWORK_CREDITS,
      isOrgOverride: false,
      updatedAt: pricing?.updatedAt ?? null,
    };

    this.platformCache = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return result;
  }

  async getEffectivePricing(orgId: string | null): Promise<FrameworkPricingResult> {
    const platformDefault = await this.getPlatformDefault();
    return { ...platformDefault, isOrgOverride: false };
  }

  async getFrameworkCreditCost(orgId: string | null): Promise<number> {
    const { creditCost } = await this.getEffectivePricing(orgId);
    return creditCost;
  }

  async updatePlatformPricing(creditCost: number, userId: string): Promise<FrameworkPricingResult> {
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
          creditsPerFrameworkGeneration: creditCost,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(platformPricing.id, existing.id));
    } else {
      await db.insert(platformPricing).values({
        creditsPerFrameworkGeneration: creditCost,
        updatedBy: userId,
      });
    }

    this.invalidateAllCaches();

    console.log(
      `[FrameworkPricingService] Updated platform framework generation pricing to ${creditCost} credits (by user ${userId})`
    );

    return {
      creditCost,
      isOrgOverride: false,
      updatedAt: new Date(),
    };
  }

  async seedPlatformDefault(): Promise<void> {
    const [existing] = await db
      .select()
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);

    if (!existing) {
      await db.insert(platformPricing).values({
        creditsPerFrameworkGeneration: COURSE_FRAMEWORK_CREDITS,
      });
      console.log(
        `[FrameworkPricingService] Seeded platform default framework generation pricing: ${COURSE_FRAMEWORK_CREDITS} credits`
      );
    }

    this.invalidatePlatformCache();
  }
}

export const frameworkPricingService = new FrameworkPricingService();
