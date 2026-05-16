import { db } from "../db";
import { lessonCreditPricingSettings } from "@shared/schema";
import {
  MIN_CREDITS_WITH_IMAGES,
  MIN_CREDITS_NO_IMAGES,
  MAX_CREDITS_WITH_IMAGES,
  MAX_CREDITS_NO_IMAGES,
} from "@shared/creditConstants";

interface PricingCosts {
  creditsPerLessonTextOnlyMin: number;
  creditsPerLessonTextOnlyMax: number;
  creditsPerLessonWithImagesMin: number;
  creditsPerLessonWithImagesMax: number;
}

interface CacheEntry {
  data: PricingCosts;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_COSTS: PricingCosts = {
  creditsPerLessonTextOnlyMin: MIN_CREDITS_NO_IMAGES,
  creditsPerLessonTextOnlyMax: MAX_CREDITS_NO_IMAGES,
  creditsPerLessonWithImagesMin: MIN_CREDITS_WITH_IMAGES,
  creditsPerLessonWithImagesMax: MAX_CREDITS_WITH_IMAGES,
};

class LessonGenerationPricingService {
  private cache: CacheEntry | null = null;

  private isCacheValid(): boolean {
    return this.cache !== null && Date.now() < this.cache.expiresAt;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async getPlatformPricing(): Promise<PricingCosts> {
    if (this.isCacheValid()) {
      return this.cache!.data;
    }

    try {
      const [settings] = await db
        .select({
          creditsPerLessonTextOnlyMin: lessonCreditPricingSettings.creditsPerLessonTextOnlyMin,
          creditsPerLessonTextOnlyMax: lessonCreditPricingSettings.creditsPerLessonTextOnlyMax,
          creditsPerLessonWithImagesMin: lessonCreditPricingSettings.creditsPerLessonWithImagesMin,
          creditsPerLessonWithImagesMax: lessonCreditPricingSettings.creditsPerLessonWithImagesMax,
        })
        .from(lessonCreditPricingSettings)
        .limit(1);

      const result: PricingCosts = {
        creditsPerLessonTextOnlyMin: settings?.creditsPerLessonTextOnlyMin ?? DEFAULT_COSTS.creditsPerLessonTextOnlyMin,
        creditsPerLessonTextOnlyMax: settings?.creditsPerLessonTextOnlyMax ?? DEFAULT_COSTS.creditsPerLessonTextOnlyMax,
        creditsPerLessonWithImagesMin: settings?.creditsPerLessonWithImagesMin ?? DEFAULT_COSTS.creditsPerLessonWithImagesMin,
        creditsPerLessonWithImagesMax: settings?.creditsPerLessonWithImagesMax ?? DEFAULT_COSTS.creditsPerLessonWithImagesMax,
      };

      this.cache = {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };

      return result;
    } catch (error) {
      console.error("[LessonGenerationPricingService] Error fetching platform pricing:", error);
      return DEFAULT_COSTS;
    }
  }

  async getRequiredCredits(includeImages: boolean): Promise<number> {
    const pricing = await this.getPlatformPricing();
    return includeImages 
      ? pricing.creditsPerLessonWithImagesMin 
      : pricing.creditsPerLessonTextOnlyMin;
  }

  async getMaxCredits(includeImages: boolean): Promise<number> {
    const pricing = await this.getPlatformPricing();
    return includeImages 
      ? pricing.creditsPerLessonWithImagesMax 
      : pricing.creditsPerLessonTextOnlyMax;
  }
}

export const lessonGenerationPricingService = new LessonGenerationPricingService();
