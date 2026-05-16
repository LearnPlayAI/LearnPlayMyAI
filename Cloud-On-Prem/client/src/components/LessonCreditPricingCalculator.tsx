import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  Calculator, 
  DollarSign, 
  Percent, 
  TrendingDown,
  AlertTriangle,
  Check,
  BookOpen,
  ImageIcon,
  Sparkles,
  RefreshCw,
  Save,
  CreditCard
} from 'lucide-react';
import {
  calculatePricingProposal,
  validatePricingInputs,
  formatPriceForDisplay,
  type PlatformCostInput,
  type PackageInput,
  type PricingProposal,
  type CalculatedPackagePrice,
  type PricingCalculatorConfig,
} from '@/lib/lessonCreditPricingCalculator';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from "@shared/creditConstants";

type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

interface CreditPackage {
  id: string;
  name: string;
  creditsAmount: number;
  priceAmount: string;
  currency: string;
  badge: string | null;
  features: string[] | null;
  displayOrder: number;
  colorScheme: string | null;
  isActive: boolean;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  monthlyCredits: number;
  pricePerTeacher: string;
  currency: string;
  features: string[];
  displayOrder: number;
  badge?: string;
  colorScheme?: string;
}

interface ExchangeRateData {
  rates: Array<{
    baseCurrency: string;
    targetCurrency: string;
    rate: string;
    source: string;
  }>;
}

interface LessonCreditPricingSettingsData {
  settings: {
    id: string;
    minimumProfitPercentage: string;
    profitStepDecrease: string;
    platformCostTiers: Array<{ credits: number; cost: number; currency?: CurrencyCode }>;
    platformCostBaseCurrency?: CurrencyCode;
    creditsPerLessonTextOnlyMin: number | null;
    creditsPerLessonTextOnlyMax: number | null;
    creditsPerLessonWithImagesMin: number | null;
    creditsPerLessonWithImagesMax: number | null;
    updatedBy: string | null;
    updatedAt: string;
    createdAt: string;
  };
}

interface IntegrationProviderSettingsData {
  providers: Array<{
    provider: string;
    settings: Array<{ key: string; value: any }>;
  }>;
}

export default function LessonCreditPricingCalculator() {
  const { toast } = useToast();
  
  const [platformCosts, setPlatformCosts] = useState<PlatformCostInput[]>([
    { credits: 1500, costUSD: 6 },
    { credits: 3000, costUSD: 12 },
  ]);
  const [minimumProfitPercentage, setMinimumProfitPercentage] = useState(30);
  const [profitStepDecrease, setProfitStepDecrease] = useState(5);
  const [viewCurrency, setViewCurrency] = useState<CurrencyCode>('ZAR');
  const [proposal, setProposal] = useState<PricingProposal | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  const [creditsPerLessonTextOnlyMin, setCreditsPerLessonTextOnlyMin] = useState(40);
  const [creditsPerLessonTextOnlyMax, setCreditsPerLessonTextOnlyMax] = useState(90);
  const [creditsPerLessonWithImagesMin, setCreditsPerLessonWithImagesMin] = useState(140);
  const [creditsPerLessonWithImagesMax, setCreditsPerLessonWithImagesMax] = useState(290);
  
  const [editedCredits, setEditedCredits] = useState<Record<string, number>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: packagesData } = useQuery<{ packages: CreditPackage[] }>({
    queryKey: ['/api/admin/credit-packages'],
    queryFn: async () => {
      const response = await fetch('/api/admin/credit-packages', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch credit packages');
      return response.json();
    },
  });

  const { data: plansData } = useQuery<{ platformPricing: any; subscriptionPlans: SubscriptionPlan[] }>({
    queryKey: ['/api/admin/platform-pricing'],
  });

  const { data: exchangeRatesData, isLoading: ratesLoading, isError: ratesError } = useQuery<ExchangeRateData>({
    queryKey: ['/api/currency/rates'],
  });

  const { data: pricingSettingsData } = useQuery<LessonCreditPricingSettingsData>({
    queryKey: ['/api/admin/lesson-credit-pricing-settings'],
  });

  const { data: integrationSettingsData } = useQuery<IntegrationProviderSettingsData>({
    queryKey: ['/api/admin/integrations'],
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: {
      minimumProfitPercentage?: number;
      profitStepDecrease?: number;
      platformCostTiers?: Array<{ credits: number; cost: number; currency?: CurrencyCode }>;
      creditsPerLessonTextOnlyMin?: number;
      creditsPerLessonTextOnlyMax?: number;
      creditsPerLessonWithImagesMin?: number;
      creditsPerLessonWithImagesMax?: number;
    }) => {
      return apiRequest('/api/admin/lesson-credit-pricing-settings', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-credit-pricing-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/public/lesson-credit-costs'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving settings',
        description: error.message || 'Failed to save pricing settings',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (pricingSettingsData?.settings && !settingsLoaded) {
      const settings = pricingSettingsData.settings;
      setMinimumProfitPercentage(parseFloat(settings.minimumProfitPercentage) || 30);
      setProfitStepDecrease(parseFloat(settings.profitStepDecrease) || 5);
      
      if (settings.platformCostTiers && Array.isArray(settings.platformCostTiers) && settings.platformCostTiers.length > 0) {
        setPlatformCosts(settings.platformCostTiers.map((tier) => ({
          credits: tier.credits,
          costUSD: tier.cost,
        })));
      }
      
      setCreditsPerLessonTextOnlyMin(settings.creditsPerLessonTextOnlyMin ?? 40);
      setCreditsPerLessonTextOnlyMax(settings.creditsPerLessonTextOnlyMax ?? 90);
      setCreditsPerLessonWithImagesMin(settings.creditsPerLessonWithImagesMin ?? 140);
      setCreditsPerLessonWithImagesMax(settings.creditsPerLessonWithImagesMax ?? 290);
      
      setSettingsLoaded(true);
    }
  }, [pricingSettingsData, settingsLoaded]);

  const gammaProviderCostReference = useMemo(() => {
    const gammaProvider = integrationSettingsData?.providers?.find((p) => p.provider === 'gamma');
    if (!gammaProvider) return null;
    const monthlyCostUsd = Number(gammaProvider.settings.find((s) => s.key === 'providerMonthlyCostUsd')?.value);
    const monthlyCredits = Number(gammaProvider.settings.find((s) => s.key === 'providerMonthlyCredits')?.value);
    if (!Number.isFinite(monthlyCostUsd) || !Number.isFinite(monthlyCredits) || monthlyCredits <= 0) {
      return null;
    }
    return {
      monthlyCostUsd,
      monthlyCredits,
      usdPerCredit: monthlyCostUsd / monthlyCredits,
    };
  }, [integrationSettingsData]);

  useEffect(() => {
    if (!gammaProviderCostReference) return;
    setPlatformCosts([
      {
        credits: Math.max(1, Math.round(gammaProviderCostReference.monthlyCredits)),
        costUSD: gammaProviderCostReference.monthlyCostUsd,
      },
    ]);
  }, [gammaProviderCostReference]);

  const saveSettings = useCallback((data: {
    minimumProfitPercentage?: number;
    profitStepDecrease?: number;
    platformCostTiers?: Array<{ credits: number; cost: number; currency?: CurrencyCode }>;
    creditsPerLessonTextOnlyMin?: number;
    creditsPerLessonTextOnlyMax?: number;
    creditsPerLessonWithImagesMin?: number;
    creditsPerLessonWithImagesMax?: number;
  }) => {
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(() => {
      saveSettingsMutation.mutate(data);
    }, 1000);
  }, [saveSettingsMutation]);

  useEffect(() => {
    return () => {
      if (settingsSaveTimerRef.current) {
        clearTimeout(settingsSaveTimerRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const rawExchangeRates = useMemo((): { usdToZar: number | null; usdToEur: number | null } => {
    let usdToZar: number | null = null;
    let usdToEur: number | null = null;
    
    if (exchangeRatesData?.rates) {
      exchangeRatesData.rates.forEach(rate => {
        if (rate.baseCurrency === 'USD') {
          if (rate.targetCurrency === 'ZAR') {
            usdToZar = parseFloat(rate.rate);
          } else if (rate.targetCurrency === 'EUR') {
            usdToEur = parseFloat(rate.rate);
          }
        }
      });
    }
    
    return { usdToZar, usdToEur };
  }, [exchangeRatesData]);

  const hasValidRates = rawExchangeRates.usdToZar !== null && rawExchangeRates.usdToEur !== null;

  const exchangeRates = useMemo((): Record<CurrencyCode, number> | null => {
    const { usdToZar, usdToEur } = rawExchangeRates;
    
    if (usdToZar === null || usdToEur === null) {
      return null;
    }
    return {
      USD: 1,
      ZAR: usdToZar,
      EUR: usdToEur,
    };
  }, [rawExchangeRates]);

  useEffect(() => {
    const initialCredits: Record<string, number> = {};
    
    if (packagesData?.packages) {
      packagesData.packages.forEach(pkg => {
        if (editedCredits[pkg.id] === undefined) {
          initialCredits[pkg.id] = pkg.creditsAmount;
        }
      });
    }
    
    if (plansData?.subscriptionPlans) {
      plansData.subscriptionPlans.forEach(plan => {
        const key = `sub_${plan.id}`;
        if (editedCredits[key] === undefined) {
          initialCredits[key] = plan.monthlyCredits;
        }
      });
    }
    
    if (Object.keys(initialCredits).length > 0) {
      setEditedCredits(prev => ({ ...prev, ...initialCredits }));
    }
  }, [packagesData, plansData]);

  const packages = useMemo((): PackageInput[] => {
    const result: PackageInput[] = [];
    
    if (packagesData?.packages) {
      packagesData.packages.forEach(pkg => {
        const creditsAmount = editedCredits[pkg.id] ?? pkg.creditsAmount;
        result.push({
          id: pkg.id,
          name: pkg.name,
          creditsAmount: creditsAmount,
          currentPriceAmount: pkg.priceAmount,
          currentCurrency: pkg.currency,
          displayOrder: pkg.displayOrder,
          badge: pkg.badge || undefined,
          colorScheme: pkg.colorScheme || undefined,
          isActive: pkg.isActive,
          type: 'topup',
        });
      });
    }
    
    if (plansData?.subscriptionPlans) {
      plansData.subscriptionPlans.forEach(plan => {
        const key = `sub_${plan.id}`;
        const creditsAmount = editedCredits[key] ?? plan.monthlyCredits;
        if (creditsAmount > 0) {
          result.push({
            id: key,
            name: plan.name,
            creditsAmount: creditsAmount,
            currentPriceAmount: plan.pricePerTeacher,
            currentCurrency: plan.currency,
            displayOrder: plan.displayOrder,
            badge: plan.badge,
            colorScheme: plan.colorScheme,
            type: 'subscription',
          });
        }
      });
    }
    
    return result;
  }, [packagesData, plansData, editedCredits]);

  const handleCreditChange = (packageId: string, value: number) => {
    setEditedCredits(prev => ({
      ...prev,
      [packageId]: value
    }));
  };

  const currentLessonCreditCosts = useMemo(() => ({
    creditsPerLessonTextOnlyMin,
    creditsPerLessonTextOnlyMax,
    creditsPerLessonWithImagesMin,
    creditsPerLessonWithImagesMax,
  }), [creditsPerLessonTextOnlyMin, creditsPerLessonTextOnlyMax, creditsPerLessonWithImagesMin, creditsPerLessonWithImagesMax]);

  const handleCalculate = () => {
    if (!hasValidRates || !exchangeRates) {
      toast({
        variant: 'destructive',
        title: 'Exchange Rates Unavailable',
        description: 'Cannot calculate prices without valid exchange rates. Please try again later.',
      });
      return;
    }
    
    const config: Partial<PricingCalculatorConfig> = {
      platformCosts,
      packages,
      minimumProfitPercentage,
      profitStepDecrease,
      exchangeRates,
      lessonCreditCosts: currentLessonCreditCosts,
    };
    
    const errors = validatePricingInputs(config);
    setValidationErrors(errors);
    
    if (errors.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: errors[0],
      });
      return;
    }
    
    if (packages.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Packages',
        description: 'No credit packages or subscription plans found to calculate prices for.',
      });
      return;
    }
    
    try {
      const calculatedProposal = calculatePricingProposal(config as PricingCalculatorConfig);
      setProposal(calculatedProposal);
      
      toast({
        title: 'Prices Calculated',
        description: `Successfully calculated prices for ${calculatedProposal.calculatedPackages.length} packages.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Calculation Error',
        description: (error as Error).message,
      });
    }
  };

  const updatePackageMutation = useMutation({
    mutationFn: async ({ id, packageData }: { id: string; packageData: any }) => {
      return await apiRequest(`/api/admin/credit-packages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packageData),
      });
    },
  });

  const updateSubscriptionPlanMutation = useMutation({
    mutationFn: async ({ planId, planData }: { planId: string; planData: any }) => {
      return await apiRequest(`/api/admin/subscription-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planData),
      });
    },
  });

  const handleApplyProposal = async () => {
    if (!proposal) return;
    
    const targetCurrency: CurrencyCode = 'USD';
    let successCount = 0;
    let errorCount = 0;
    
    // Filter to only process LPC topup packages (not subscription packages)
    const topupPackages = proposal.calculatedPackages.filter(pkg => pkg.type === 'topup');
    
    if (topupPackages.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Topup Packages',
        description: 'No LP Credit topup packages found to update. This feature only updates once-off credit purchase packages.',
      });
      return;
    }
    
    for (const pkg of topupPackages) {
      try {
        const priceInTargetCurrency = pkg.customerPrices[targetCurrency];
        const featuresArray = pkg.featureDescriptions;
        
        await updatePackageMutation.mutateAsync({
          id: pkg.packageId,
          packageData: {
            creditsAmount: pkg.creditsAmount,
            priceAmount: priceInTargetCurrency.toFixed(2),
            currency: targetCurrency,
            features: featuresArray,
          },
        });
        
        successCount++;
      } catch (error) {
        console.error(`Failed to update LP Credit package ${pkg.name}:`, error);
        errorCount++;
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-packages'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'] });
    queryClient.invalidateQueries({ queryKey: ['/api/public/subscription-plans'] });
    
    if (errorCount === 0) {
      toast({
        title: 'LP Credit Prices Applied',
        description: `Updated ${successCount} LP Credit topup packages with canonical USD pricing.`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Partial Update',
        description: `Updated ${successCount} LP Credit packages, but ${errorCount} failed.`,
      });
    }
  };

  const platformCostsInUSD = useMemo((): PlatformCostInput[] => {
    return platformCosts.map(c => ({
      credits: c.credits,
      costUSD: c.costUSD,
    }));
  }, [platformCosts]);

  useEffect(() => {
    if (packages.length === 0) return;
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (!exchangeRates) {
        return;
      }
      
      const config: Partial<PricingCalculatorConfig> = {
        platformCosts: platformCostsInUSD,
        packages,
        minimumProfitPercentage,
        profitStepDecrease,
        exchangeRates,
        lessonCreditCosts: currentLessonCreditCosts,
      };
      
      const errors = validatePricingInputs(config);
      setValidationErrors(errors);
      
      if (errors.length > 0) return;
      
      try {
        const calculatedProposal = calculatePricingProposal(config as PricingCalculatorConfig);
        setProposal(calculatedProposal);
      } catch (error) {
        console.error('Auto-calculation error:', error);
      }
    }, 500);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [platformCostsInUSD, packages, minimumProfitPercentage, profitStepDecrease, exchangeRates, currentLessonCreditCosts]);

  const calculatedPackagesMap = useMemo(() => {
    const map = new Map<string, CalculatedPackagePrice>();
    if (proposal?.calculatedPackages) {
      proposal.calculatedPackages.forEach(pkg => {
        map.set(pkg.packageId, pkg);
      });
    }
    return map;
  }, [proposal]);

  const allTopupPackages = packagesData?.packages || [];

  const getBadgeColorClass = (colorScheme: string | null | undefined): string => {
    switch (colorScheme) {
      case 'green':
        return 'bg-primary hover:bg-primary/90 text-btn-primary-foreground border-0';
      case 'blue':
        return 'bg-primary hover:bg-primary/90 text-btn-primary-foreground border-0';
      case 'purple':
        return 'bg-primary hover:bg-primary/90 text-btn-primary-foreground border-0';
      case 'orange':
        return 'bg-warning text-warning-foreground border-0';
      default:
        return 'bg-primary hover:bg-primary/90 text-btn-primary-foreground border-0';
    }
  };

  const renderTopupPackageRow = (pkg: CreditPackage) => {
    const currentCredits = editedCredits[pkg.id] ?? pkg.creditsAmount;
    const calculatedPkg = calculatedPackagesMap.get(pkg.id);
    
    return (
      <TableRow key={pkg.id} className="border-border hover:bg-muted" data-testid={`row-package-${pkg.id}`}>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{pkg.name}</span>
            {pkg.badge && (
              <Badge className={`text-xs ${getBadgeColorClass(pkg.colorScheme)}`}>{pkg.badge}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min="0"
              value={currentCredits}
              onChange={(e) => handleCreditChange(pkg.id, parseInt(e.target.value) || 0)}
              className="w-28 h-7 text-sm bg-muted border-primary/50 text-foreground placeholder:text-primary/50 focus:border-primary focus:ring-primary/30"
              data-testid={`input-credits-${pkg.id}`}
            />
            <span className="text-xs text-primary/70">credits</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <span className="text-primary/80">
              {formatPriceForDisplay(calculatedPkg.platformCosts[viewCurrency], viewCurrency)}
            </span>
          ) : (
            <span className="text-primary/40">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <Badge variant="outline" >
              {calculatedPkg.profitPercentage.toFixed(1)}%
            </Badge>
          ) : (
            <span className="text-primary/40">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <span className="text-success">
              {formatPriceForDisplay(calculatedPkg.profitAmounts[viewCurrency], viewCurrency)}
            </span>
          ) : (
            <span className="text-primary/40">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <span className="font-semibold text-foreground">
              {formatPriceForDisplay(calculatedPkg.customerPrices[viewCurrency], viewCurrency)}
            </span>
          ) : (
            <span className="text-primary/40">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg?.savingsFromBasePercentage ? (
            <Badge variant="outline" >
              <TrendingDown className="w-3 h-3 mr-1" />
              {calculatedPkg.savingsFromBasePercentage.toFixed(0)}%
            </Badge>
          ) : (
            <span className="text-primary/40">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg?.lessonsWithoutImages ? (
            <span className="text-secondary/80">
              {calculatedPkg.lessonsWithoutImages.min}-{calculatedPkg.lessonsWithoutImages.max}
            </span>
          ) : (
            <span className="text-primary/40">-</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const allSubscriptionPlans = plansData?.subscriptionPlans || [];

  const renderSubscriptionPlanEditor = (plan: SubscriptionPlan) => {
    const key = `sub_${plan.id}`;
    const currentCredits = editedCredits[key] ?? plan.monthlyCredits;
    const calculatedPkg = calculatedPackagesMap.get(key);
    
    return (
      <TableRow key={plan.id} className="border-border hover:bg-muted" data-testid={`row-subscription-${plan.id}`}>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{plan.name}</span>
            {plan.badge && (
              <Badge className={`text-xs ${getBadgeColorClass(plan.colorScheme)}`}>{plan.badge}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min="0"
              value={currentCredits}
              onChange={(e) => handleCreditChange(key, parseInt(e.target.value) || 0)}
              className="w-28 h-7 text-sm bg-muted border-secondary/50 text-foreground placeholder:text-secondary/50 focus:border-secondary focus:ring-secondary/30"
              data-testid={`input-credits-${key}`}
            />
            <span className="text-xs text-secondary/70">{LP_CREDITS_SHORT}/month</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Current: {formatPriceForDisplay(parseFloat(plan.pricePerTeacher), plan.currency as CurrencyCode)}/teacher
          </p>
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <span className="text-secondary/80">
              {formatPriceForDisplay(calculatedPkg.platformCosts[viewCurrency], viewCurrency)}
            </span>
          ) : currentCredits === 0 ? (
            <span className="text-muted-foreground text-xs">No credits</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <Badge variant="outline" >
              {calculatedPkg.profitPercentage.toFixed(1)}%
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <span className="text-success">
              {formatPriceForDisplay(calculatedPkg.profitAmounts[viewCurrency], viewCurrency)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg ? (
            <span className="font-semibold text-foreground">
              {formatPriceForDisplay(calculatedPkg.customerPrices[viewCurrency], viewCurrency)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg?.savingsFromBasePercentage ? (
            <Badge variant="outline" >
              <TrendingDown className="w-3 h-3 mr-1" />
              {calculatedPkg.savingsFromBasePercentage.toFixed(0)}%
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {calculatedPkg?.lessonsWithoutImages ? (
            <span className="text-secondary/80">
              {calculatedPkg.lessonsWithoutImages.min}-{calculatedPkg.lessonsWithoutImages.max}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      {(ratesError || (!ratesLoading && !hasValidRates)) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Exchange Rates Unavailable</AlertTitle>
          <AlertDescription>
            Currency conversion rates are currently unavailable. Multi-currency calculations are disabled until rates are restored.
            Price calculations require USD base rates.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Calculator className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Pricing Calculator</h2>
              <p className="text-sm text-muted-foreground">Configure costs, margins, and auto-calculate optimal prices</p>
            </div>
          </div>
          {saveSettingsMutation.isPending && (
            <Badge variant="outline" >
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Saving...
            </Badge>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Platform Costs (AI Provider)</h3>
            <Badge variant="outline" className="ml-auto">
              Canonical: USD
            </Badge>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 text-sm">
            {gammaProviderCostReference ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Gamma plan reference</span>
                  <span className="font-medium">
                    ${gammaProviderCostReference.monthlyCostUsd.toFixed(2)} for {Math.round(gammaProviderCostReference.monthlyCredits).toLocaleString()} credits
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Approx platform cost per {LP_CREDITS_SHORT}</span>
                  <span className="font-medium">${gammaProviderCostReference.usdPerCredit.toFixed(4)}</span>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">
                Configure Gamma provider cost reference in Integration Settings.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Gamma provider cost values are managed in Integration Settings.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" />
              <Label className="text-foreground">Minimum Profit %</Label>
            </div>
            <Input
              type="number"
              min="0"
              max="100"
              value={minimumProfitPercentage}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                setMinimumProfitPercentage(value);
                saveSettings({ minimumProfitPercentage: value });
              }}
              className="bg-muted border-border text-foreground"
              data-testid="input-min-profit"
            />
            <p className="text-xs text-muted-foreground">
              Starting profit margin for smallest packages
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-primary" />
              <Label className="text-foreground">Profit Step Decrease %</Label>
            </div>
            <Input
              type="number"
              min="0"
              max="20"
              value={profitStepDecrease}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                setProfitStepDecrease(value);
                saveSettings({ profitStepDecrease: value });
              }}
              className="bg-muted border-border text-foreground"
              data-testid="input-profit-step"
            />
            <p className="text-xs text-muted-foreground">
              Profit margin decreases by this amount for each larger package
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-secondary" />
            <h3 className="font-semibold text-foreground">{LP_CREDITS_SHORT} per Lesson Costs</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Set the credit cost ranges for generating lessons. These values are used to estimate how many lessons users can create with each package.
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-secondary" />
                <span className="text-foreground font-medium">Text-Only Lessons</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-primary/80 text-sm">Minimum Credits</Label>
                  <Input
                    type="number"
                    min="1"
                    value={creditsPerLessonTextOnlyMin}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setCreditsPerLessonTextOnlyMin(value);
                      saveSettings({ creditsPerLessonTextOnlyMin: value });
                    }}
                    className="bg-muted border-secondary/50 text-foreground focus:border-secondary"
                    data-testid="input-credits-text-only-min"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-primary/80 text-sm">Maximum Credits</Label>
                  <Input
                    type="number"
                    min="1"
                    value={creditsPerLessonTextOnlyMax}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setCreditsPerLessonTextOnlyMax(value);
                      saveSettings({ creditsPerLessonTextOnlyMax: value });
                    }}
                    className="bg-muted border-secondary/50 text-foreground focus:border-secondary"
                    data-testid="input-credits-text-only-max"
                  />
                </div>
              </div>
              <p className="text-xs text-secondary/70">
                Range: {creditsPerLessonTextOnlyMin} - {creditsPerLessonTextOnlyMax} {LP_CREDITS_SHORT} per lesson
              </p>
            </div>
            
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <span className="text-foreground font-medium">Lessons with Images</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-primary/80 text-sm">Minimum Credits</Label>
                  <Input
                    type="number"
                    min="1"
                    value={creditsPerLessonWithImagesMin}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setCreditsPerLessonWithImagesMin(value);
                      saveSettings({ creditsPerLessonWithImagesMin: value });
                    }}
                    className="bg-muted border-primary/50 text-foreground focus:border-primary"
                    data-testid="input-credits-with-images-min"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-primary/80 text-sm">Maximum Credits</Label>
                  <Input
                    type="number"
                    min="1"
                    value={creditsPerLessonWithImagesMax}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setCreditsPerLessonWithImagesMax(value);
                      saveSettings({ creditsPerLessonWithImagesMax: value });
                    }}
                    className="bg-muted border-primary/50 text-foreground focus:border-primary"
                    data-testid="input-credits-with-images-max"
                  />
                </div>
              </div>
              <p className="text-xs text-primary/70">
                Range: {creditsPerLessonWithImagesMin} - {creditsPerLessonWithImagesMax} {LP_CREDITS_SHORT} per lesson
              </p>
            </div>
          </div>
          
          {(creditsPerLessonTextOnlyMin > creditsPerLessonTextOnlyMax || 
            creditsPerLessonWithImagesMin > creditsPerLessonWithImagesMax) && (
            <Alert variant="destructive" >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-destructive">Invalid Range</AlertTitle>
              <AlertDescription className="text-destructive">
                Minimum credits cannot be greater than maximum credits.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="border-t border-border pt-4" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {proposal && (
              <Badge >
                <Check className="w-3 h-3 mr-1" />
                Auto-calculated
              </Badge>
            )}
            <Button onClick={handleCalculate} variant="outline" size="sm" data-testid="button-calculate-prices" >
              <RefreshCw className="w-4 h-4 mr-2" />
              Recalculate
            </Button>
          </div>

          {proposal && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-primary/70">View in:</span>
              <Tabs value={viewCurrency} onValueChange={(v) => setViewCurrency(v as CurrencyCode)} className="w-auto">
                <TabsList className="bg-tab border border-stroke-default">
                  <TabsTrigger value="ZAR" className="text-tab-foreground" data-testid="tab-zar">R ZAR</TabsTrigger>
                  <TabsTrigger value="USD" className="text-tab-foreground" data-testid="tab-usd">$ USD</TabsTrigger>
                  <TabsTrigger value="EUR" className="text-tab-foreground" data-testid="tab-eur">€ EUR</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
        </div>

        {validationErrors.length > 0 && (
          <Alert variant="destructive" >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-destructive">Validation Errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside text-destructive">
                {validationErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {proposal && proposal.warnings.length > 0 && (
          <Alert >
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside text-warning">
                {proposal.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {proposal && (
          <>
            <div className="rounded-lg bg-muted/50 border border-border p-4 grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-primary/70">Cost per {LP_CREDITS_SHORT}</p>
                <p className="text-lg font-semibold text-foreground" data-testid="text-cost-per-credit">
                  ${proposal.costPerCreditUSD.toFixed(6)}
                </p>
              </div>
              <div>
                <p className="text-sm text-primary/70">Base Currency</p>
                <p className="text-lg font-semibold text-foreground">USD (canonical)</p>
              </div>
              <div>
                <p className="text-sm text-primary/70">USD Rate</p>
                <p className="text-lg font-semibold text-foreground">
                  {rawExchangeRates.usdToZar !== null 
                    ? `1 USD = R${rawExchangeRates.usdToZar.toFixed(2)}`
                    : <span className="text-destructive">Rate unavailable</span>
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-primary/70">EUR Rate</p>
                <p className="text-lg font-semibold text-foreground">
                  {rawExchangeRates.usdToZar !== null && rawExchangeRates.usdToEur !== null
                    ? `1 EUR = R${(rawExchangeRates.usdToZar / rawExchangeRates.usdToEur).toFixed(2)}`
                    : <span className="text-destructive">Rate unavailable</span>
                  }
                </p>
              </div>
            </div>

            {allTopupPackages.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Top-up {LP_CREDITS_SHORT} Packages
                </h3>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                        <TableHead className="text-primary/80 whitespace-nowrap">Package</TableHead>
                        <TableHead className="text-right text-primary/80 whitespace-nowrap">Platform Cost</TableHead>
                        <TableHead className="text-right text-primary/80 whitespace-nowrap">Profit %</TableHead>
                        <TableHead className="text-right text-primary/80 whitespace-nowrap">Profit Amt</TableHead>
                        <TableHead className="text-right text-primary/80 whitespace-nowrap">Customer Price</TableHead>
                        <TableHead className="text-right text-primary/80 whitespace-nowrap">Savings</TableHead>
                        <TableHead className="text-right text-primary/80 whitespace-nowrap">Est. Lessons</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allTopupPackages.map(renderTopupPackageRow)}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-secondary" />
                Monthly Subscription {LP_CREDITS_SHORT}
              </h3>
              <p className="text-sm text-primary/70">
                Set monthly {LP_CREDITS_SHORT} allocations for subscription plans. Plans with 0 {LP_CREDITS_SHORT} won't include credits.
              </p>
              <div className="rounded-lg border border-border overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-primary/80 whitespace-nowrap">Plan</TableHead>
                      <TableHead className="text-right text-primary/80 whitespace-nowrap">Platform Cost</TableHead>
                      <TableHead className="text-right text-primary/80 whitespace-nowrap">Profit %</TableHead>
                      <TableHead className="text-right text-primary/80 whitespace-nowrap">Profit Amt</TableHead>
                      <TableHead className="text-right text-primary/80 whitespace-nowrap">Calc. Price</TableHead>
                      <TableHead className="text-right text-primary/80 whitespace-nowrap">Savings</TableHead>
                      <TableHead className="text-right text-primary/80 whitespace-nowrap">Est. Lessons/mo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allSubscriptionPlans.map(renderSubscriptionPlanEditor)}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t border-border pt-4" />

            <div className="flex items-center justify-between">
              <div className="text-sm text-primary/80">
                <p className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  Applying will update all packages with prices in <strong className="text-foreground">{viewCurrency}</strong>
                </p>
                <p className="text-xs mt-1 text-primary/60">
                  Package credit amounts and descriptions will be updated with lesson estimates and savings info.
                </p>
              </div>
              
              <Button onClick={handleApplyProposal} disabled={updatePackageMutation.isPending || updateSubscriptionPlanMutation.isPending} className="border-0" data-testid="button-apply-proposal" >
                <Save className="w-4 h-4 mr-2" />
                {(updatePackageMutation.isPending || updateSubscriptionPlanMutation.isPending) 
                  ? 'Applying...' 
                  : 'Apply Price Proposal'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
