import { db } from '../db';
import { eq, desc, and, isNull, or, gte, lte, sql } from 'drizzle-orm';
import {
  businessPackages,
  businessPackagePrices,
  lessonCreditPricingSettings,
  platformCostEntries,
  platformCostCategories,
  BusinessPackage,
  BusinessPackagePrice,
} from '@shared/schema';
import { businessPackageService } from './businessPackageService';
import { ExchangeRateService } from './exchangeRateService';

interface PackageProposal {
  packageId: string;
  packageName: string;
  tier: string;
  
  pricePerLearner: number;
  pricePerTeacher: number;
  pricePerOrgAdmin: number;
  totalMonthlyCost: number;
  
  costPerCredit: number;
  creditsIncluded: number;
  
  seatsFit: boolean;
  creditsFit: boolean;
  overallFit: 'perfect' | 'adequate' | 'too_small' | 'too_large';
  
  highlights: string[];
  limitations: string[];
}

interface ComparisonRow {
  packageId: string;
  packageName: string;
  tier: string;
  pricePerSeat: number;
  creditsPerSeat: number;
  totalMonthlyCost: number;
  valueScore: number;
  fit: 'perfect' | 'adequate' | 'too_small' | 'too_large';
}

interface ProposalGenerationOptions {
  organizationId?: string;
  targetUserCount: { learners: number; teachers: number; orgAdmins: number };
  preferredCurrency: 'ZAR' | 'USD' | 'EUR';
  includeComparison?: boolean;
}

interface ProposalResult {
  proposals: PackageProposal[];
  recommendation: string;
  comparisonTable?: ComparisonRow[];
}

interface PackageCostBreakdown {
  packageId: string;
  packageName: string;
  tier: string;
  monthlyCredits: number;
  
  revenuePerLearner: number;
  revenuePerTeacher: number;
  revenuePerOrgAdmin: number;
  totalMonthlyRevenue: number;
  
  creditCostPerMonth: number;
  infraCostPerSeat: number;
  totalMonthlyCost: number;
  
  grossProfit: number;
  profitMargin: number;
  breakEvenSeats: number;
}

interface TierComparison {
  tiers: Array<{
    tier: string;
    packageId: string;
    pricePerSeat: number;
    valueRatio: number;
  }>;
  multiPackageDiscount: number;
}

interface PlatformCostData {
  costPerCredit: number;
  infraCostPerUser: number;
  overheadCost: number;
  lastUpdated: Date | null;
}

interface SuggestedPricing {
  currentMargin: number;
  suggestedPricePerLearner: number;
  suggestedPricePerTeacher: number;
  suggestedPricePerOrgAdmin: number;
  marginAtSuggested: number;
}

const DEFAULT_COST_PER_CREDIT = 0.10;
const DEFAULT_INFRA_COST_PER_USER = 2.00;
const DEFAULT_OVERHEAD_COST = 50.00;
const ESTIMATED_CREDITS_PER_USER_PER_MONTH = 50;

export class PackageProposalService {
  private cachedPlatformCosts: PlatformCostData | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  async generatePackageProposals(options: ProposalGenerationOptions): Promise<ProposalResult> {
    try {
      const { targetUserCount, preferredCurrency, includeComparison = false, organizationId } = options;
      
      const totalTargetSeats = targetUserCount.learners + targetUserCount.teachers + targetUserCount.orgAdmins;
      const estimatedCreditsNeeded = totalTargetSeats * ESTIMATED_CREDITS_PER_USER_PER_MONTH;

      const packages = await businessPackageService.getAllPackages(false);
      const proposals: PackageProposal[] = [];

      for (const pkg of packages) {
        const price = await businessPackageService.getPackagePrice(pkg.id, preferredCurrency);
        if (!price) continue;

        const proposal = this.buildProposal(pkg, price, targetUserCount, estimatedCreditsNeeded);
        proposals.push(proposal);
      }

      proposals.sort((a, b) => {
        const fitOrder = { 'perfect': 0, 'adequate': 1, 'too_large': 2, 'too_small': 3 };
        const fitDiff = fitOrder[a.overallFit] - fitOrder[b.overallFit];
        if (fitDiff !== 0) return fitDiff;
        return a.totalMonthlyCost - b.totalMonthlyCost;
      });

      const recommendation = this.generateRecommendation(proposals, targetUserCount, estimatedCreditsNeeded);

      let comparisonTable: ComparisonRow[] | undefined;
      if (includeComparison) {
        comparisonTable = this.buildComparisonTable(proposals, targetUserCount);
      }

      return {
        proposals,
        recommendation,
        comparisonTable,
      };
    } catch (error) {
      console.error('[PackageProposalService] Error generating package proposals:', error);
      throw error;
    }
  }

  private buildProposal(
    pkg: BusinessPackage,
    price: BusinessPackagePrice,
    targetUserCount: { learners: number; teachers: number; orgAdmins: number },
    estimatedCreditsNeeded: number
  ): PackageProposal {
    const pricePerLearner = parseFloat(price.pricePerLearner);
    const pricePerTeacher = parseFloat(price.pricePerTeacher);
    const pricePerOrgAdmin = parseFloat(price.pricePerOrgAdmin);

    const totalMonthlyCost = 
      pricePerLearner * targetUserCount.learners +
      pricePerTeacher * targetUserCount.teachers +
      pricePerOrgAdmin * targetUserCount.orgAdmins;

    const costPerCredit = pkg.monthlyCredits > 0 
      ? totalMonthlyCost / pkg.monthlyCredits 
      : 0;

    const seatsFit = 
      targetUserCount.learners <= pkg.maxLearners &&
      targetUserCount.teachers <= pkg.maxTeachers &&
      targetUserCount.orgAdmins <= pkg.maxOrgAdmins;

    const creditsFit = estimatedCreditsNeeded <= pkg.monthlyCredits;

    const overallFit = this.calculateOverallFit(pkg, targetUserCount, estimatedCreditsNeeded);

    const highlights = this.generateHighlights(pkg, targetUserCount, estimatedCreditsNeeded, totalMonthlyCost);
    const limitations = this.generateLimitations(pkg, targetUserCount, estimatedCreditsNeeded);

    return {
      packageId: pkg.id,
      packageName: pkg.name,
      tier: pkg.tier,
      pricePerLearner: Math.round(pricePerLearner * 100) / 100,
      pricePerTeacher: Math.round(pricePerTeacher * 100) / 100,
      pricePerOrgAdmin: Math.round(pricePerOrgAdmin * 100) / 100,
      totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
      costPerCredit: Math.round(costPerCredit * 1000) / 1000,
      creditsIncluded: pkg.monthlyCredits,
      seatsFit,
      creditsFit,
      overallFit,
      highlights,
      limitations,
    };
  }

  private calculateOverallFit(
    pkg: BusinessPackage,
    targetUserCount: { learners: number; teachers: number; orgAdmins: number },
    estimatedCreditsNeeded: number
  ): 'perfect' | 'adequate' | 'too_small' | 'too_large' {
    const seatsFit = 
      targetUserCount.learners <= pkg.maxLearners &&
      targetUserCount.teachers <= pkg.maxTeachers &&
      targetUserCount.orgAdmins <= pkg.maxOrgAdmins;

    const creditsFit = estimatedCreditsNeeded <= pkg.monthlyCredits;

    if (!seatsFit) {
      return 'too_small';
    }

    if (!creditsFit) {
      return 'too_small';
    }

    const seatUtilization = this.calculateSeatUtilization(pkg, targetUserCount);
    const creditUtilization = estimatedCreditsNeeded / pkg.monthlyCredits;

    if (seatUtilization >= 0.5 && creditUtilization >= 0.5) {
      return 'perfect';
    }

    if (seatUtilization < 0.25 && creditUtilization < 0.25) {
      return 'too_large';
    }

    return 'adequate';
  }

  private calculateSeatUtilization(
    pkg: BusinessPackage,
    targetUserCount: { learners: number; teachers: number; orgAdmins: number }
  ): number {
    const totalTargetSeats = targetUserCount.learners + targetUserCount.teachers + targetUserCount.orgAdmins;
    const totalPackageSeats = pkg.maxLearners + pkg.maxTeachers + pkg.maxOrgAdmins;
    return totalPackageSeats > 0 ? totalTargetSeats / totalPackageSeats : 0;
  }

  private generateHighlights(
    pkg: BusinessPackage,
    targetUserCount: { learners: number; teachers: number; orgAdmins: number },
    estimatedCreditsNeeded: number,
    totalMonthlyCost: number
  ): string[] {
    const highlights: string[] = [];

    const seatUtilization = this.calculateSeatUtilization(pkg, targetUserCount);
    if (seatUtilization >= 0.7 && seatUtilization <= 1.0) {
      highlights.push('Optimal seat utilization for your team size');
    }

    const creditUtilization = estimatedCreditsNeeded / pkg.monthlyCredits;
    if (creditUtilization >= 0.6 && creditUtilization <= 1.0) {
      highlights.push('Credit allocation matches expected usage');
    }

    if (pkg.monthlyCredits > estimatedCreditsNeeded * 1.5) {
      highlights.push('Extra credits for growth and experimentation');
    }

    const totalSeats = targetUserCount.learners + targetUserCount.teachers + targetUserCount.orgAdmins;
    if (totalSeats > 0 && totalMonthlyCost / totalSeats < 50) {
      highlights.push('Cost-effective per-user pricing');
    }

    const learnerBuffer = pkg.maxLearners - targetUserCount.learners;
    if (learnerBuffer > 0 && learnerBuffer <= pkg.maxLearners * 0.3) {
      highlights.push(`Room for ${learnerBuffer} more learners`);
    }

    return highlights;
  }

  private generateLimitations(
    pkg: BusinessPackage,
    targetUserCount: { learners: number; teachers: number; orgAdmins: number },
    estimatedCreditsNeeded: number
  ): string[] {
    const limitations: string[] = [];

    if (targetUserCount.learners > pkg.maxLearners) {
      limitations.push(`Exceeds learner limit by ${targetUserCount.learners - pkg.maxLearners}`);
    }

    if (targetUserCount.teachers > pkg.maxTeachers) {
      limitations.push(`Exceeds teacher limit by ${targetUserCount.teachers - pkg.maxTeachers}`);
    }

    if (targetUserCount.orgAdmins > pkg.maxOrgAdmins) {
      limitations.push(`Exceeds org admin limit by ${targetUserCount.orgAdmins - pkg.maxOrgAdmins}`);
    }

    if (estimatedCreditsNeeded > pkg.monthlyCredits) {
      const creditShortfall = estimatedCreditsNeeded - pkg.monthlyCredits;
      limitations.push(`May need ${creditShortfall} additional credits per month`);
    }

    const seatUtilization = this.calculateSeatUtilization(pkg, targetUserCount);
    if (seatUtilization < 0.3) {
      limitations.push('Package may be larger than needed');
    }

    return limitations;
  }

  private generateRecommendation(
    proposals: PackageProposal[],
    targetUserCount: { learners: number; teachers: number; orgAdmins: number },
    estimatedCreditsNeeded: number
  ): string {
    const perfectFits = proposals.filter(p => p.overallFit === 'perfect');
    const adequateFits = proposals.filter(p => p.overallFit === 'adequate');
    const totalTargetSeats = targetUserCount.learners + targetUserCount.teachers + targetUserCount.orgAdmins;

    if (perfectFits.length > 0) {
      const best = perfectFits[0];
      return `The ${best.packageName} (${best.tier}) package is an excellent fit for your organization with ${totalTargetSeats} users. It provides ${best.creditsIncluded} credits per month at a cost of ${best.totalMonthlyCost.toFixed(2)} per month.`;
    }

    if (adequateFits.length > 0) {
      const best = adequateFits[0];
      return `The ${best.packageName} (${best.tier}) package would work for your ${totalTargetSeats} users. Consider this option at ${best.totalMonthlyCost.toFixed(2)} per month with ${best.creditsIncluded} credits.`;
    }

    const smallPackages = proposals.filter(p => p.overallFit === 'too_small');
    if (smallPackages.length === proposals.length && proposals.length > 0) {
      return `Your organization with ${totalTargetSeats} users requires a larger package than currently available. Please contact sales for an enterprise solution.`;
    }

    const largePackages = proposals.filter(p => p.overallFit === 'too_large');
    if (largePackages.length > 0) {
      const smallest = largePackages.reduce((a, b) => a.totalMonthlyCost < b.totalMonthlyCost ? a : b);
      return `The ${smallest.packageName} (${smallest.tier}) package is the smallest available option that fits your needs, though it provides more capacity than you currently require.`;
    }

    return 'Please review the available packages to find the best fit for your organization.';
  }

  private buildComparisonTable(
    proposals: PackageProposal[],
    targetUserCount: { learners: number; teachers: number; orgAdmins: number }
  ): ComparisonRow[] {
    const totalSeats = targetUserCount.learners + targetUserCount.teachers + targetUserCount.orgAdmins;

    return proposals.map(p => ({
      packageId: p.packageId,
      packageName: p.packageName,
      tier: p.tier,
      pricePerSeat: totalSeats > 0 ? Math.round((p.totalMonthlyCost / totalSeats) * 100) / 100 : 0,
      creditsPerSeat: totalSeats > 0 ? Math.round((p.creditsIncluded / totalSeats) * 100) / 100 : 0,
      totalMonthlyCost: p.totalMonthlyCost,
      valueScore: p.costPerCredit > 0 ? Math.round((1 / p.costPerCredit) * 100) / 100 : 0,
      fit: p.overallFit,
    }));
  }

  /**
   * @deprecated Use generatePackageProposals() instead. This method will be removed in a future version.
   */
  async getPackageProfitability(
    packageId: string,
    currency: string
  ): Promise<PackageCostBreakdown | null> {
    console.warn('[PackageProposalService] getPackageProfitability is deprecated. Use generatePackageProposals() instead.');
    try {
      const pkg = await businessPackageService.getPackageById(packageId);
      if (!pkg) {
        console.log(`[PackageProposalService] Package not found: ${packageId}`);
        return null;
      }

      const price = await businessPackageService.getPackagePrice(packageId, currency);
      if (!price) {
        console.log(`[PackageProposalService] Price not found for package ${packageId} in currency ${currency}`);
        return null;
      }

      const platformCosts = await this.getPlatformCostData();

      return this.calculateProfitability(pkg, price, platformCosts);
    } catch (error) {
      console.error('[PackageProposalService] Error getting package profitability:', error);
      throw error;
    }
  }

  /**
   * @deprecated Use generatePackageProposals() instead. This method will be removed in a future version.
   */
  async getAllPackageProfitability(currency: string): Promise<PackageCostBreakdown[]> {
    console.warn('[PackageProposalService] getAllPackageProfitability is deprecated. Use generatePackageProposals() instead.');
    try {
      const packages = await businessPackageService.getAllPackages(false);
      const platformCosts = await this.getPlatformCostData();
      const results: PackageCostBreakdown[] = [];

      for (const pkg of packages) {
        const price = await businessPackageService.getPackagePrice(pkg.id, currency);
        if (price) {
          const breakdown = this.calculateProfitability(pkg, price, platformCosts);
          results.push(breakdown);
        }
      }

      return results.sort((a, b) => a.tier.localeCompare(b.tier));
    } catch (error) {
      console.error('[PackageProposalService] Error getting all package profitability:', error);
      throw error;
    }
  }

  /**
   * @deprecated Use generatePackageProposals() with includeComparison: true instead. This method will be removed in a future version.
   */
  async getTierComparison(currency: string): Promise<TierComparison> {
    console.warn('[PackageProposalService] getTierComparison is deprecated. Use generatePackageProposals() with includeComparison: true instead.');
    try {
      const packages = await businessPackageService.getAllPackages(false);
      const tiers: TierComparison['tiers'] = [];

      for (const pkg of packages) {
        const price = await businessPackageService.getPackagePrice(pkg.id, currency);
        if (!price) continue;

        const totalSeats = pkg.maxLearners + pkg.maxTeachers + pkg.maxOrgAdmins;
        const totalPrice =
          parseFloat(price.pricePerLearner) * pkg.maxLearners +
          parseFloat(price.pricePerTeacher) * pkg.maxTeachers +
          parseFloat(price.pricePerOrgAdmin) * pkg.maxOrgAdmins;

        const avgPricePerSeat = totalSeats > 0 ? totalPrice / totalSeats : 0;
        const valueRatio = avgPricePerSeat > 0 ? pkg.monthlyCredits / avgPricePerSeat : 0;

        tiers.push({
          tier: pkg.tier,
          packageId: pkg.id,
          pricePerSeat: avgPricePerSeat,
          valueRatio,
        });
      }

      tiers.sort((a, b) => a.pricePerSeat - b.pricePerSeat);

      let multiPackageDiscount = 0;
      if (tiers.length >= 2) {
        const lowestPrice = tiers[0].pricePerSeat;
        const highestPrice = tiers[tiers.length - 1].pricePerSeat;
        if (highestPrice > 0) {
          multiPackageDiscount = ((highestPrice - lowestPrice) / highestPrice) * 100;
        }
      }

      return { tiers, multiPackageDiscount };
    } catch (error) {
      console.error('[PackageProposalService] Error getting tier comparison:', error);
      throw error;
    }
  }

  /**
   * @deprecated This method is not part of the proposal generation workflow. This method will be removed in a future version.
   */
  async suggestPricing(
    packageId: string,
    targetMargin: number,
    currency: string
  ): Promise<SuggestedPricing> {
    console.warn('[PackageProposalService] suggestPricing is deprecated. This method will be removed in a future version.');
    try {
      const pkg = await businessPackageService.getPackageById(packageId);
      if (!pkg) {
        throw new Error(`Package not found: ${packageId}`);
      }

      const currentPrice = await businessPackageService.getPackagePrice(packageId, currency);
      const platformCosts = await this.getPlatformCostData();

      const totalSeats = pkg.maxLearners + pkg.maxTeachers + pkg.maxOrgAdmins;
      const creditCost = pkg.monthlyCredits * platformCosts.costPerCredit;
      const infraCost = totalSeats * platformCosts.infraCostPerUser;
      const totalCost = creditCost + infraCost + platformCosts.overheadCost;

      let currentMargin = 0;
      if (currentPrice) {
        const currentRevenue =
          parseFloat(currentPrice.pricePerLearner) * pkg.maxLearners +
          parseFloat(currentPrice.pricePerTeacher) * pkg.maxTeachers +
          parseFloat(currentPrice.pricePerOrgAdmin) * pkg.maxOrgAdmins;
        if (currentRevenue > 0) {
          currentMargin = ((currentRevenue - totalCost) / currentRevenue) * 100;
        }
      }

      const requiredRevenue = totalCost / (1 - targetMargin);
      
      const basePricePerSeat = totalSeats > 0 ? requiredRevenue / totalSeats : 0;
      
      const suggestedPricePerLearner = basePricePerSeat * 0.8;
      const suggestedPricePerTeacher = basePricePerSeat * 1.5;
      const suggestedPricePerOrgAdmin = basePricePerSeat * 2.0;

      const suggestedRevenue =
        suggestedPricePerLearner * pkg.maxLearners +
        suggestedPricePerTeacher * pkg.maxTeachers +
        suggestedPricePerOrgAdmin * pkg.maxOrgAdmins;

      const marginAtSuggested = suggestedRevenue > 0
        ? ((suggestedRevenue - totalCost) / suggestedRevenue) * 100
        : 0;

      return {
        currentMargin: Math.round(currentMargin * 100) / 100,
        suggestedPricePerLearner: Math.round(suggestedPricePerLearner * 100) / 100,
        suggestedPricePerTeacher: Math.round(suggestedPricePerTeacher * 100) / 100,
        suggestedPricePerOrgAdmin: Math.round(suggestedPricePerOrgAdmin * 100) / 100,
        marginAtSuggested: Math.round(marginAtSuggested * 100) / 100,
      };
    } catch (error) {
      console.error('[PackageProposalService] Error suggesting pricing:', error);
      throw error;
    }
  }

  async getPlatformCostData(): Promise<PlatformCostData> {
    const now = Date.now();
    if (this.cachedPlatformCosts && (now - this.cacheTimestamp) < this.CACHE_TTL_MS) {
      return this.cachedPlatformCosts;
    }

    try {
      let costPerCredit = DEFAULT_COST_PER_CREDIT;
      let infraCostPerUser = DEFAULT_INFRA_COST_PER_USER;
      let overheadCost = DEFAULT_OVERHEAD_COST;
      let lastUpdated: Date | null = null;

      const [creditPricingSettings] = await db
        .select()
        .from(lessonCreditPricingSettings)
        .limit(1);

      if (creditPricingSettings) {
        lastUpdated = creditPricingSettings.updatedAt;
        
        const costTiers = creditPricingSettings.platformCostTiers as Array<{ credits: number; cost: number; currency?: 'ZAR' | 'USD' | 'EUR' }> | null;
        if (costTiers && Array.isArray(costTiers) && costTiers.length > 0) {
          const sortedTiers = [...costTiers].sort((a, b) => b.credits - a.credits);
          const largeTier = sortedTiers[0];
          if (largeTier && largeTier.credits > 0) {
            const tierCurrency = (largeTier.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR';
            let costInZar = largeTier.cost;
            if (tierCurrency !== 'ZAR') {
              const usdToZar = await ExchangeRateService.getRate('USD', 'ZAR');
              if (tierCurrency === 'USD') {
                costInZar = largeTier.cost * usdToZar;
              } else {
                const eurToUsd = await ExchangeRateService.getRate('EUR', 'USD');
                costInZar = largeTier.cost * eurToUsd * usdToZar;
              }
            }
            costPerCredit = costInZar / largeTier.credits;
          }
        }
      }

      const infraCategory = await db
        .select()
        .from(platformCostCategories)
        .where(eq(platformCostCategories.type, 'infrastructure'))
        .limit(1);

      if (infraCategory.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const infraCosts = await db
          .select()
          .from(platformCostEntries)
          .where(
            and(
              eq(platformCostEntries.categoryId, infraCategory[0].id),
              lte(platformCostEntries.effectiveDate, today),
              or(
                isNull(platformCostEntries.endDate),
                gte(platformCostEntries.endDate, today)
              )
            )
          )
          .orderBy(desc(platformCostEntries.effectiveDate))
          .limit(10);

        if (infraCosts.length > 0) {
          const totalInfraCost = infraCosts.reduce(
            (sum, cost) => sum + parseFloat(cost.normalizedAmountZAR),
            0
          );
          const avgInfraCost = totalInfraCost / infraCosts.length;
          infraCostPerUser = avgInfraCost / 100;
          
          if (infraCosts[0].updatedAt && (!lastUpdated || infraCosts[0].updatedAt > lastUpdated)) {
            lastUpdated = infraCosts[0].updatedAt;
          }
        }
      }

      const overheadCategory = await db
        .select()
        .from(platformCostCategories)
        .where(eq(platformCostCategories.type, 'other'))
        .limit(1);

      if (overheadCategory.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const overheadCosts = await db
          .select({
            total: sql<string>`SUM(${platformCostEntries.normalizedAmountZAR})`
          })
          .from(platformCostEntries)
          .where(
            and(
              eq(platformCostEntries.categoryId, overheadCategory[0].id),
              lte(platformCostEntries.effectiveDate, today),
              or(
                isNull(platformCostEntries.endDate),
                gte(platformCostEntries.endDate, today)
              )
            )
          );

        if (overheadCosts[0]?.total) {
          overheadCost = parseFloat(overheadCosts[0].total);
        }
      }

      this.cachedPlatformCosts = {
        costPerCredit,
        infraCostPerUser,
        overheadCost,
        lastUpdated,
      };
      this.cacheTimestamp = now;

      console.log(`[PackageProposalService] Platform costs loaded: costPerCredit=${costPerCredit}, infraCostPerUser=${infraCostPerUser}, overheadCost=${overheadCost}`);

      return this.cachedPlatformCosts;
    } catch (error) {
      console.warn('[PackageProposalService] Error loading platform cost data, using defaults:', error);
      
      return {
        costPerCredit: DEFAULT_COST_PER_CREDIT,
        infraCostPerUser: DEFAULT_INFRA_COST_PER_USER,
        overheadCost: DEFAULT_OVERHEAD_COST,
        lastUpdated: null,
      };
    }
  }

  private calculateProfitability(
    pkg: BusinessPackage,
    price: BusinessPackagePrice,
    platformCosts: PlatformCostData
  ): PackageCostBreakdown {
    const revenuePerLearner = parseFloat(price.pricePerLearner);
    const revenuePerTeacher = parseFloat(price.pricePerTeacher);
    const revenuePerOrgAdmin = parseFloat(price.pricePerOrgAdmin);

    const totalMonthlyRevenue =
      revenuePerLearner * pkg.maxLearners +
      revenuePerTeacher * pkg.maxTeachers +
      revenuePerOrgAdmin * pkg.maxOrgAdmins;

    const creditCostPerMonth = pkg.monthlyCredits * platformCosts.costPerCredit;
    const infraCostPerSeat = platformCosts.infraCostPerUser;
    const totalSeats = pkg.maxLearners + pkg.maxTeachers + pkg.maxOrgAdmins;
    const totalInfraCost = totalSeats * infraCostPerSeat;
    const totalMonthlyCost = creditCostPerMonth + totalInfraCost + platformCosts.overheadCost;

    const grossProfit = totalMonthlyRevenue - totalMonthlyCost;
    const profitMargin = totalMonthlyRevenue > 0
      ? (grossProfit / totalMonthlyRevenue) * 100
      : 0;

    const avgRevenuePerSeat = totalSeats > 0 ? totalMonthlyRevenue / totalSeats : 0;
    const fixedCosts = creditCostPerMonth + platformCosts.overheadCost;
    const breakEvenSeats = avgRevenuePerSeat > infraCostPerSeat
      ? Math.ceil(fixedCosts / (avgRevenuePerSeat - infraCostPerSeat))
      : totalSeats;

    return {
      packageId: pkg.id,
      packageName: pkg.name,
      tier: pkg.tier,
      monthlyCredits: pkg.monthlyCredits,
      revenuePerLearner,
      revenuePerTeacher,
      revenuePerOrgAdmin,
      totalMonthlyRevenue: Math.round(totalMonthlyRevenue * 100) / 100,
      creditCostPerMonth: Math.round(creditCostPerMonth * 100) / 100,
      infraCostPerSeat: Math.round(infraCostPerSeat * 100) / 100,
      totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      breakEvenSeats,
    };
  }

  clearCache(): void {
    this.cachedPlatformCosts = null;
    this.cacheTimestamp = 0;
    console.log('[PackageProposalService] Cache cleared');
  }
}

export const packageProposalService = new PackageProposalService();

export { PackageProposal, ComparisonRow, ProposalGenerationOptions, ProposalResult };
