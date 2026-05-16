import { LP_CREDITS_SHORT } from "@shared/creditConstants";

type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

export interface PlatformCostInput {
  credits: number;
  costUSD: number;
}

export interface PackageInput {
  id: string;
  name: string;
  creditsAmount: number;
  currentPriceAmount?: string;
  currentCurrency?: string;
  displayOrder: number;
  badge?: string;
  colorScheme?: string;
  isActive?: boolean;
  type: 'topup' | 'subscription';
}

export interface CalculatedPackagePrice {
  packageId: string;
  name: string;
  creditsAmount: number;
  type: 'topup' | 'subscription';
  displayOrder: number;
  badge?: string;
  colorScheme?: string;
  isActive?: boolean;
  
  costPerCreditUSD: number;
  platformCostUSD: number;
  platformCosts: Record<CurrencyCode, number>;
  
  profitPercentage: number;
  profitAmountUSD: number;
  profitAmounts: Record<CurrencyCode, number>;
  
  customerPriceUSD: number;
  customerPrices: Record<CurrencyCode, number>;
  
  savingsFromBasePercentage: number;
  
  lessonsWithoutImages: { min: number; max: number };
  lessonsWithImages: { min: number; max: number };
  
  featureDescriptions: string[];
}

export interface LessonCreditCostsConfig {
  creditsPerLessonTextOnlyMin: number;
  creditsPerLessonTextOnlyMax: number;
  creditsPerLessonWithImagesMin: number;
  creditsPerLessonWithImagesMax: number;
}

export interface PricingCalculatorConfig {
  platformCosts: PlatformCostInput[];
  packages: PackageInput[];
  minimumProfitPercentage: number;
  profitStepDecrease: number;
  exchangeRates: Record<CurrencyCode, number>;
  lessonCreditCosts?: LessonCreditCostsConfig;
}

export interface PricingProposal {
  calculatedPackages: CalculatedPackagePrice[];
  baseCurrency: 'USD';
  exchangeRates: Record<CurrencyCode, number>;
  minimumProfitPercentage: number;
  costPerCreditUSD: number;
  warnings: string[];
}

export const DEFAULT_LESSON_CREDIT_COSTS: LessonCreditCostsConfig = {
  creditsPerLessonTextOnlyMin: 40,
  creditsPerLessonTextOnlyMax: 90,
  creditsPerLessonWithImagesMin: 140,
  creditsPerLessonWithImagesMax: 290,
};

const CREDITS_PER_LESSON_WITHOUT_IMAGES = { min: 40, max: 90 };
const CREDITS_PER_LESSON_WITH_IMAGES = { min: 140, max: 290 };

export function calculateCostPerCredit(platformCosts: PlatformCostInput[]): number {
  if (platformCosts.length === 0) {
    throw new Error('At least one platform cost input is required');
  }
  
  let totalCredits = 0;
  let totalCostUSD = 0;
  
  for (const cost of platformCosts) {
    totalCredits += cost.credits;
    totalCostUSD += cost.costUSD;
  }
  
  if (totalCredits === 0) {
    throw new Error('Total credits cannot be zero');
  }
  
  return totalCostUSD / totalCredits;
}

export function calculateGraduatedProfitMargins(
  packages: PackageInput[],
  minimumProfitPercentage: number,
  profitStepDecrease: number
): Map<string, number> {
  const sortedPackages = [...packages].sort((a, b) => a.creditsAmount - b.creditsAmount);
  
  const profitMargins = new Map<string, number>();
  
  sortedPackages.forEach((pkg, index) => {
    const baseProfitMargin = minimumProfitPercentage + (profitStepDecrease * (sortedPackages.length - 1 - index));
    profitMargins.set(pkg.id, Math.max(baseProfitMargin, minimumProfitPercentage));
  });
  
  return profitMargins;
}

export function calculateLessonEstimates(
  creditsAmount: number,
  lessonCreditCosts?: LessonCreditCostsConfig
): {
  withoutImages: { min: number; max: number };
  withImages: { min: number; max: number };
} {
  const costs = lessonCreditCosts ?? DEFAULT_LESSON_CREDIT_COSTS;
  
  if (creditsAmount <= 0) {
    return {
      withoutImages: { min: 0, max: 0 },
      withImages: { min: 0, max: 0 },
    };
  }
  
  return {
    withoutImages: {
      min: Math.floor(creditsAmount / costs.creditsPerLessonTextOnlyMax),
      max: Math.floor(creditsAmount / costs.creditsPerLessonTextOnlyMin),
    },
    withImages: {
      min: Math.floor(creditsAmount / costs.creditsPerLessonWithImagesMax),
      max: Math.floor(creditsAmount / costs.creditsPerLessonWithImagesMin),
    },
  };
}

export function generateFeatureDescriptions(
  creditsAmount: number,
  savingsPercentage: number,
  lessonEstimates: ReturnType<typeof calculateLessonEstimates>
): string[] {
  const features: string[] = [];
  
  features.push(`${creditsAmount.toLocaleString()} ${LP_CREDITS_SHORT}`);
  
  if (lessonEstimates.withoutImages.min === lessonEstimates.withoutImages.max) {
    features.push(`~${lessonEstimates.withoutImages.min} lessons (text only)`);
  } else {
    features.push(`${lessonEstimates.withoutImages.min}-${lessonEstimates.withoutImages.max} lessons (text only)`);
  }
  
  if (lessonEstimates.withImages.min === lessonEstimates.withImages.max) {
    features.push(`~${lessonEstimates.withImages.min} lessons (with images)`);
  } else {
    features.push(`${lessonEstimates.withImages.min}-${lessonEstimates.withImages.max} lessons (with images)`);
  }
  
  if (savingsPercentage > 0) {
    features.push(`Save ${savingsPercentage.toFixed(0)}% vs base price`);
  }
  
  return features;
}

export function convertCurrency(
  amountUSD: number,
  targetCurrency: CurrencyCode,
  exchangeRates: Record<CurrencyCode, number>
): number {
  if (targetCurrency === 'USD') {
    return amountUSD;
  }
  
  const rate = exchangeRates[targetCurrency];
  if (!rate) {
    throw new Error(`Exchange rate not found for ${targetCurrency}`);
  }
  
  return amountUSD * rate;
}

export function calculatePricingProposal(config: PricingCalculatorConfig): PricingProposal {
  const { platformCosts, packages, minimumProfitPercentage, profitStepDecrease, exchangeRates, lessonCreditCosts } = config;
  const warnings: string[] = [];
  
  const costPerCreditUSD = calculateCostPerCredit(platformCosts);
  
  const profitMargins = calculateGraduatedProfitMargins(
    packages,
    minimumProfitPercentage,
    profitStepDecrease
  );
  
  const sortedPackages = [...packages].sort((a, b) => a.creditsAmount - b.creditsAmount);
  
  let basePricePerCreditUSD: number | null = null;
  
  const calculatedPackages: CalculatedPackagePrice[] = sortedPackages.map((pkg, index) => {
    const profitPercentage = profitMargins.get(pkg.id) || minimumProfitPercentage;
    const platformCostUSD = pkg.creditsAmount * costPerCreditUSD;
    const profitAmountUSD = platformCostUSD * (profitPercentage / 100);
    const customerPriceUSD = platformCostUSD + profitAmountUSD;
    
    const pricePerCreditUSD = customerPriceUSD / pkg.creditsAmount;
    
    if (index === 0) {
      basePricePerCreditUSD = pricePerCreditUSD;
    }
    
    const savingsFromBasePercentage = basePricePerCreditUSD 
      ? ((basePricePerCreditUSD - pricePerCreditUSD) / basePricePerCreditUSD) * 100
      : 0;
    
    const lessonEstimates = calculateLessonEstimates(pkg.creditsAmount, lessonCreditCosts);
    const featureDescriptions = generateFeatureDescriptions(
      pkg.creditsAmount,
      savingsFromBasePercentage,
      lessonEstimates
    );
    
    const customerPrices: Record<CurrencyCode, number> = {
      USD: Math.round(customerPriceUSD * 100) / 100,
      ZAR: Math.round(convertCurrency(customerPriceUSD, 'ZAR', exchangeRates) * 100) / 100,
      EUR: Math.round(convertCurrency(customerPriceUSD, 'EUR', exchangeRates) * 100) / 100,
    };
    
    const platformCosts: Record<CurrencyCode, number> = {
      USD: Math.round(platformCostUSD * 100) / 100,
      ZAR: Math.round(convertCurrency(platformCostUSD, 'ZAR', exchangeRates) * 100) / 100,
      EUR: Math.round(convertCurrency(platformCostUSD, 'EUR', exchangeRates) * 100) / 100,
    };
    
    const profitAmounts: Record<CurrencyCode, number> = {
      USD: Math.round(profitAmountUSD * 100) / 100,
      ZAR: Math.round(convertCurrency(profitAmountUSD, 'ZAR', exchangeRates) * 100) / 100,
      EUR: Math.round(convertCurrency(profitAmountUSD, 'EUR', exchangeRates) * 100) / 100,
    };
    
    if (profitPercentage < minimumProfitPercentage) {
      warnings.push(`Package "${pkg.name}" has profit margin ${profitPercentage.toFixed(1)}% below minimum ${minimumProfitPercentage}%`);
    }
    
    return {
      packageId: pkg.id,
      name: pkg.name,
      creditsAmount: pkg.creditsAmount,
      type: pkg.type,
      displayOrder: pkg.displayOrder,
      badge: pkg.badge,
      colorScheme: pkg.colorScheme,
      isActive: pkg.isActive ?? true,
      
      costPerCreditUSD,
      platformCostUSD,
      platformCosts,
      
      profitPercentage,
      profitAmountUSD,
      profitAmounts,
      
      customerPriceUSD,
      customerPrices,
      
      savingsFromBasePercentage: Math.max(0, savingsFromBasePercentage),
      
      lessonsWithoutImages: lessonEstimates.withoutImages,
      lessonsWithImages: lessonEstimates.withImages,
      
      featureDescriptions,
    };
  });
  
  return {
    calculatedPackages,
    baseCurrency: 'USD',
    exchangeRates,
    minimumProfitPercentage,
    costPerCreditUSD,
    warnings,
  };
}

export function formatPriceForDisplay(amount: number, currency: CurrencyCode): string {
  const symbols: Record<CurrencyCode, string> = {
    USD: '$',
    ZAR: 'R',
    EUR: '€',
  };
  
  return `${symbols[currency]}${amount.toFixed(2)}`;
}

export function validatePricingInputs(config: Partial<PricingCalculatorConfig>): string[] {
  const errors: string[] = [];
  
  if (!config.platformCosts || config.platformCosts.length === 0) {
    errors.push('At least one platform cost input is required');
  } else {
    config.platformCosts.forEach((cost, index) => {
      if (cost.credits <= 0) {
        errors.push(`Platform cost ${index + 1}: Credits must be greater than 0`);
      }
      if (cost.costUSD <= 0) {
        errors.push(`Platform cost ${index + 1}: Cost must be greater than 0`);
      }
    });
  }
  
  if (config.minimumProfitPercentage !== undefined) {
    if (config.minimumProfitPercentage < 0) {
      errors.push('Minimum profit percentage cannot be negative');
    }
    if (config.minimumProfitPercentage > 500) {
      errors.push('Minimum profit percentage seems unreasonably high (>500%)');
    }
  }
  
  if (config.profitStepDecrease !== undefined && config.profitStepDecrease < 0) {
    errors.push('Profit step decrease cannot be negative');
  }
  
  return errors;
}
