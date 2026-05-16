import { db } from "../db";
import { platformPricing } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { THUMBNAIL_GENERATION_CREDITS } from "@shared/creditConstants";

interface ThumbnailPricingResult {
  creditCost: number;
  isOrgOverride: boolean;
  updatedAt: Date | null;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

class ThumbnailPricingService {
  private platformCache: CacheEntry<ThumbnailPricingResult> | null = null;
  private orgCache: Map<string, CacheEntry<ThumbnailPricingResult>> = new Map();

  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    return entry !== null && entry !== undefined && Date.now() < entry.expiresAt;
  }

  invalidatePlatformCache(): void {
    this.platformCache = null;
  }

  invalidateOrgCache(orgId: string): void {
    this.orgCache.delete(orgId);
  }

  invalidateAllCaches(): void {
    this.platformCache = null;
    this.orgCache.clear();
  }

  async getPlatformDefault(): Promise<ThumbnailPricingResult> {
    if (this.isCacheValid(this.platformCache)) {
      return this.platformCache.data;
    }

    const [pricing] = await db
      .select({
        creditsPerThumbnailGeneration: platformPricing.creditsPerThumbnailGeneration,
        updatedAt: platformPricing.updatedAt,
      })
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);

    const result: ThumbnailPricingResult = {
      creditCost: pricing?.creditsPerThumbnailGeneration ?? THUMBNAIL_GENERATION_CREDITS,
      isOrgOverride: false,
      updatedAt: pricing?.updatedAt ?? null,
    };

    this.platformCache = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return result;
  }

  async getEffectivePricing(orgId: string | null): Promise<ThumbnailPricingResult> {
    const platformDefault = await this.getPlatformDefault();
    return { ...platformDefault, isOrgOverride: false };
  }

  async getThumbnailCreditCost(orgId: string | null): Promise<number> {
    const { creditCost } = await this.getEffectivePricing(orgId);
    return creditCost;
  }

  async updatePlatformPricing(creditCost: number, userId: string): Promise<ThumbnailPricingResult> {
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
          creditsPerThumbnailGeneration: creditCost,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(platformPricing.id, existing.id));
    } else {
      await db.insert(platformPricing).values({
        creditsPerThumbnailGeneration: creditCost,
        updatedBy: userId,
      });
    }

    this.invalidateAllCaches();

    console.log(
      `[ThumbnailPricingService] Updated platform thumbnail pricing to ${creditCost} credits (by user ${userId})`
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
        creditsPerThumbnailGeneration: THUMBNAIL_GENERATION_CREDITS,
      });
      console.log(
        `[ThumbnailPricingService] Seeded platform default thumbnail pricing: ${THUMBNAIL_GENERATION_CREDITS} credits`
      );
    } else {
      console.log("[ThumbnailPricingService] Platform default already exists, skipping seed");
    }

    this.invalidatePlatformCache();
  }
}

export const thumbnailPricingService = new ThumbnailPricingService();
