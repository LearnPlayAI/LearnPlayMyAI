import { db } from '../db';
import { eq, and, gte, desc, sql, count } from 'drizzle-orm';
import {
  creditOrders,
  organizations,
  organizationPackageAssignments,
  businessPackages,
  businessPackagePrices,
  packageRecommendationDismissals,
} from '@shared/schema';
import { businessPackageService } from './businessPackageService';

interface TopUpPattern {
  organizationId: string;
  last30DaysTopUps: number;
  last90DaysTopUps: number;
  averageTopUpAmount: number;
  totalSpentOnTopUps: number;
  frequency: 'none' | 'low' | 'medium' | 'high';
}

interface PackageRecommendation {
  organizationId: string;
  currentPackage: {
    id: string;
    name: string;
    monthlyCredits: number;
    monthlyPrice: number;
  };
  recommendedPackage: {
    id: string;
    name: string;
    tier: string;
    monthlyCredits: number;
    monthlyPrice: number;
  } | null;
  topUpPattern: TopUpPattern;
  savingsAnalysis: {
    currentMonthlyCost: number;
    projectedMonthlyCost: number;
    monthlySavings: number;
    annualSavings: number;
    breakEvenMonths: number;
  } | null;
  message: string;
  showRecommendation: boolean;
}

export class PackageRecommendationService {
  async analyzeTopUpPattern(organizationId: string): Promise<TopUpPattern> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const orders = await db
      .select({
        id: creditOrders.id,
        amount: creditOrders.amount,
        createdAt: creditOrders.createdAt,
      })
      .from(creditOrders)
      .where(
        and(
          eq(creditOrders.organizationId, organizationId),
          eq(creditOrders.status, 'succeeded'),
          gte(creditOrders.createdAt, ninetyDaysAgo)
        )
      );

    const last30DaysOrders = orders.filter(
      (o) => o.createdAt && o.createdAt >= thirtyDaysAgo
    );
    const last90DaysOrders = orders;

    const totalSpentOnTopUps = last90DaysOrders.reduce(
      (sum, o) => sum + parseFloat(o.amount?.toString() || '0'),
      0
    );

    const averageTopUpAmount =
      last90DaysOrders.length > 0
        ? totalSpentOnTopUps / last90DaysOrders.length
        : 0;

    let frequency: 'none' | 'low' | 'medium' | 'high';
    const topUpCount = last90DaysOrders.length;

    if (topUpCount === 0) {
      frequency = 'none';
    } else if (topUpCount <= 2) {
      frequency = 'low';
    } else if (topUpCount <= 5) {
      frequency = 'medium';
    } else {
      frequency = 'high';
    }

    return {
      organizationId,
      last30DaysTopUps: last30DaysOrders.length,
      last90DaysTopUps: last90DaysOrders.length,
      averageTopUpAmount: Math.round(averageTopUpAmount * 100) / 100,
      totalSpentOnTopUps: Math.round(totalSpentOnTopUps * 100) / 100,
      frequency,
    };
  }

  async getRecommendation(
    organizationId: string,
    currency: string
  ): Promise<PackageRecommendation> {
    const [assignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    if (!assignment) {
      const pattern = await this.analyzeTopUpPattern(organizationId);
      return {
        organizationId,
        currentPackage: {
          id: '',
          name: 'No Package',
          monthlyCredits: 0,
          monthlyPrice: 0,
        },
        recommendedPackage: null,
        topUpPattern: pattern,
        savingsAnalysis: null,
        message: 'Organization does not have an active package assignment.',
        showRecommendation: false,
      };
    }

    const currentPackage = await businessPackageService.getPackageById(
      assignment.packageId
    );
    const currentPrice = await businessPackageService.getPackagePrice(
      assignment.packageId,
      currency
    );

    if (!currentPackage) {
      const pattern = await this.analyzeTopUpPattern(organizationId);
      return {
        organizationId,
        currentPackage: {
          id: '',
          name: 'Unknown Package',
          monthlyCredits: 0,
          monthlyPrice: 0,
        },
        recommendedPackage: null,
        topUpPattern: pattern,
        savingsAnalysis: null,
        message: 'Current package not found.',
        showRecommendation: false,
      };
    }

    const topUpPattern = await this.analyzeTopUpPattern(organizationId);

    const userCounts = await businessPackageService.getOrganizationUserCounts(
      organizationId
    );
    const currentMonthlyPackagePrice = currentPrice
      ? parseFloat(currentPrice.pricePerLearner) * userCounts.learners +
        parseFloat(currentPrice.pricePerTeacher) * userCounts.teachers +
        parseFloat(currentPrice.pricePerOrgAdmin) * userCounts.orgAdmins
      : 0;

    const currentPackageInfo = {
      id: currentPackage.id,
      name: currentPackage.name,
      monthlyCredits: currentPackage.monthlyCredits,
      monthlyPrice: Math.round(currentMonthlyPackagePrice * 100) / 100,
    };

    if (topUpPattern.frequency === 'none' || topUpPattern.frequency === 'low') {
      return {
        organizationId,
        currentPackage: currentPackageInfo,
        recommendedPackage: null,
        topUpPattern,
        savingsAnalysis: null,
        message:
          topUpPattern.frequency === 'none'
            ? 'No credit top-ups detected in the last 90 days. Your current package appears to meet your needs.'
            : 'Low credit top-up frequency. Your current package is likely sufficient.',
        showRecommendation: false,
      };
    }

    const isDismissed = await this.isRecommendationDismissed(organizationId);
    if (isDismissed) {
      return {
        organizationId,
        currentPackage: currentPackageInfo,
        recommendedPackage: null,
        topUpPattern,
        savingsAnalysis: null,
        message: 'Recommendation was previously dismissed. Will show again after 30 days.',
        showRecommendation: false,
      };
    }

    const allPackages = await businessPackageService.getAllPackages(false);
    const higherPackages = allPackages.filter(
      (pkg) =>
        pkg.monthlyCredits > currentPackage.monthlyCredits &&
        pkg.displayOrder > currentPackage.displayOrder
    );

    if (higherPackages.length === 0) {
      return {
        organizationId,
        currentPackage: currentPackageInfo,
        recommendedPackage: null,
        topUpPattern,
        savingsAnalysis: null,
        message:
          'You are already on the highest tier package. Consider contacting support for custom enterprise solutions.',
        showRecommendation: false,
      };
    }

    const nextPackage = higherPackages.sort(
      (a, b) => a.displayOrder - b.displayOrder
    )[0];
    const nextPackagePrice = await businessPackageService.getPackagePrice(
      nextPackage.id,
      currency
    );

    if (!nextPackagePrice) {
      return {
        organizationId,
        currentPackage: currentPackageInfo,
        recommendedPackage: null,
        topUpPattern,
        savingsAnalysis: null,
        message: 'Pricing not available for recommended package in your currency.',
        showRecommendation: false,
      };
    }

    const nextMonthlyPackagePrice =
      parseFloat(nextPackagePrice.pricePerLearner) * userCounts.learners +
      parseFloat(nextPackagePrice.pricePerTeacher) * userCounts.teachers +
      parseFloat(nextPackagePrice.pricePerOrgAdmin) * userCounts.orgAdmins;

    const monthlyTopUpCost = topUpPattern.totalSpentOnTopUps / 3;
    const currentMonthlyCost = currentMonthlyPackagePrice + monthlyTopUpCost;
    const projectedMonthlyCost = nextMonthlyPackagePrice;
    const monthlySavings = currentMonthlyCost - projectedMonthlyCost;
    const annualSavings = monthlySavings * 12;

    const packagePriceDifference = nextMonthlyPackagePrice - currentMonthlyPackagePrice;
    const breakEvenMonths =
      monthlyTopUpCost > 0
        ? Math.ceil(packagePriceDifference / monthlyTopUpCost)
        : 0;

    const savingsPercentage = (monthlySavings / currentMonthlyCost) * 100;
    const showRecommendation = savingsPercentage > 10 && monthlySavings > 0;

    const recommendedPackage = {
      id: nextPackage.id,
      name: nextPackage.name,
      tier: nextPackage.tier,
      monthlyCredits: nextPackage.monthlyCredits,
      monthlyPrice: Math.round(nextMonthlyPackagePrice * 100) / 100,
    };

    const savingsAnalysis = {
      currentMonthlyCost: Math.round(currentMonthlyCost * 100) / 100,
      projectedMonthlyCost: Math.round(projectedMonthlyCost * 100) / 100,
      monthlySavings: Math.round(monthlySavings * 100) / 100,
      annualSavings: Math.round(annualSavings * 100) / 100,
      breakEvenMonths: breakEvenMonths > 0 ? breakEvenMonths : 1,
    };

    let message: string;
    if (showRecommendation) {
      message = `Based on your credit usage pattern (${topUpPattern.last90DaysTopUps} top-ups in 90 days), upgrading to ${nextPackage.name} could save you approximately ${currency} ${savingsAnalysis.monthlySavings.toFixed(2)}/month.`;
    } else if (monthlySavings <= 0) {
      message = `Upgrading to ${nextPackage.name} would increase your costs. Your current package with occasional top-ups is more economical.`;
    } else {
      message = `Upgrading to ${nextPackage.name} could save you ${currency} ${savingsAnalysis.monthlySavings.toFixed(2)}/month, but the savings may not be significant enough to warrant a change.`;
    }

    return {
      organizationId,
      currentPackage: currentPackageInfo,
      recommendedPackage: showRecommendation ? recommendedPackage : null,
      topUpPattern,
      savingsAnalysis,
      message,
      showRecommendation,
    };
  }

  async getOrganizationsNeedingRecommendations(): Promise<
    Array<{
      organizationId: string;
      organizationName: string;
      topUpFrequency: string;
      potentialSavings: number;
    }>
  > {
    const orgsWithAssignments = await db
      .select({
        organizationId: organizationPackageAssignments.organizationId,
        organizationName: organizations.name,
        currency: organizationPackageAssignments.currency,
      })
      .from(organizationPackageAssignments)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationPackageAssignments.organizationId)
      )
      .where(eq(organizationPackageAssignments.status, 'active'));

    const results: Array<{
      organizationId: string;
      organizationName: string;
      topUpFrequency: string;
      potentialSavings: number;
    }> = [];

    for (const org of orgsWithAssignments) {
      const pattern = await this.analyzeTopUpPattern(org.organizationId);

      if (pattern.frequency === 'medium' || pattern.frequency === 'high') {
        const recommendation = await this.getRecommendation(
          org.organizationId,
          org.currency || 'ZAR'
        );

        if (recommendation.showRecommendation && recommendation.savingsAnalysis) {
          results.push({
            organizationId: org.organizationId,
            organizationName: org.organizationName,
            topUpFrequency: pattern.frequency,
            potentialSavings: recommendation.savingsAnalysis.monthlySavings,
          });
        }
      }
    }

    return results.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  async shouldShowRecommendation(organizationId: string): Promise<boolean> {
    const pattern = await this.analyzeTopUpPattern(organizationId);

    if (pattern.frequency !== 'medium' && pattern.frequency !== 'high') {
      return false;
    }

    const isDismissed = await this.isRecommendationDismissed(organizationId);
    if (isDismissed) {
      return false;
    }

    const [assignment] = await db
      .select()
      .from(organizationPackageAssignments)
      .where(eq(organizationPackageAssignments.organizationId, organizationId))
      .limit(1);

    if (!assignment) {
      return false;
    }

    const recommendation = await this.getRecommendation(
      organizationId,
      assignment.currency || 'ZAR'
    );

    return recommendation.showRecommendation;
  }

  async dismissRecommendation(
    organizationId: string,
    dismissedBy: string
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(packageRecommendationDismissals).values({
      organizationId,
      dismissedBy,
      expiresAt,
    });

    console.log(
      `[PackageRecommendationService] Recommendation dismissed for org ${organizationId} by user ${dismissedBy}, expires at ${expiresAt.toISOString()}`
    );
  }

  private async isRecommendationDismissed(
    organizationId: string
  ): Promise<boolean> {
    const now = new Date();

    const [dismissal] = await db
      .select()
      .from(packageRecommendationDismissals)
      .where(
        and(
          eq(packageRecommendationDismissals.organizationId, organizationId),
          gte(packageRecommendationDismissals.expiresAt, now)
        )
      )
      .orderBy(desc(packageRecommendationDismissals.dismissedAt))
      .limit(1);

    return !!dismissal;
  }
}

export const packageRecommendationService = new PackageRecommendationService();
