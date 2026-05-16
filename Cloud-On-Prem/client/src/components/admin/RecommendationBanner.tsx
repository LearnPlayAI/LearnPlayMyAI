import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { TrendingUp } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatCurrency } from '@/lib/currency';

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
  topUpPattern: {
    last30DaysTopUps: number;
    last90DaysTopUps: number;
    averageTopUpAmount: number;
    totalSpentOnTopUps: number;
    frequency: string;
  };
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

interface RecommendationBannerProps {
  organizationId: string;
  currency?: 'ZAR' | 'USD' | 'EUR';
}

export function RecommendationBanner({ organizationId, currency = 'ZAR' }: RecommendationBannerProps) {
  const [, setLocation] = useLocation();

  const { data: recommendation, isLoading } = useQuery<PackageRecommendation>({
    queryKey: ['/api/organizations', organizationId, 'package-recommendation', currency],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}/package-recommendation?currency=${currency}`);
      if (!response.ok) throw new Error('Failed to fetch recommendation');
      return response.json();
    },
    staleTime: 60 * 60 * 1000,
    enabled: !!organizationId,
  });

  const dismissMutation = useMutation({
    mutationFn: () => apiRequest(`/api/organizations/${organizationId}/dismiss-recommendation`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'package-recommendation'] });
    },
  });

  if (isLoading || !recommendation?.showRecommendation) {
    return null;
  }

  const formatPrice = (amount: number) => {
    return formatCurrency({ currency, amount });
  };

  return (
    <Alert className="mb-6">
      <TrendingUp className="h-4 w-4" />
      <AlertTitle className="text-base font-semibold">Save money with a higher plan</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground">
          You've topped up <span className="font-medium text-foreground">{recommendation.topUpPattern.last90DaysTopUps} times</span> in the last 90 days.
        </p>
        {recommendation.recommendedPackage && recommendation.savingsAnalysis && (
          <p className="font-semibold text-chart-2 mt-1">
            Upgrade to {recommendation.recommendedPackage.name} and save {formatPrice(recommendation.savingsAnalysis.annualSavings)} per year!
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={() => setLocation(`/subscription`)}
            className="min-h-[36px]"
          >
            View Plans
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            className="min-h-[36px]"
          >
            {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
