import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Crown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface UserStatus {
  isAuthenticated?: boolean;
}

interface TrialStatus {
  isTrialActive?: boolean;
  organizationId?: string;
  daysRemaining?: number;
  trialEndDate?: string;
  isDemo?: boolean;
}

export function ExpiredTrialBanner() {
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isOrgAdmin, isImpersonating, isDemo, isAuthenticated } = useAuth();

  const { data: userStatus } = useQuery<UserStatus>({
    queryKey: ['/api/user-status'],
    retry: false,
  });

  const { data: trialStatus } = useQuery<TrialStatus>({
    queryKey: ['/api/trial-status'],
    enabled: !!userStatus?.isAuthenticated,
    refetchInterval: 60000,
  });

  const isEffectiveDemo = trialStatus?.isDemo || isDemo;

  const handleSubscribeClick = () => {
    if (isSuperAdmin) {
      if (isImpersonating) {
        setLocation('/billing');
      } else {
        setLocation('/admin/subscription-console');
      }
    } else if (isOrgAdmin) {
      setLocation('/billing');
    } else {
      setLocation('/sales-inquiries');
    }
  };

  if (!isAuthenticated) return null;
  if (isSuperAdmin && !isImpersonating) return null;
  if (isEffectiveDemo) return null;

  const daysRemaining = trialStatus?.daysRemaining ?? 0;
  // Check for expired trial: either isTrialActive is false with a past end date, or daysRemaining <= 0
  const hasTrialEndDate = !!trialStatus?.trialEndDate;
  const trialEndDatePassed = hasTrialEndDate && new Date(trialStatus.trialEndDate!) <= new Date();
  const isExpired = hasTrialEndDate && (daysRemaining <= 0 || (trialEndDatePassed && !trialStatus?.isTrialActive));

  if (!isExpired) return null;

  return (
    <Alert variant="destructive" className="mb-4" data-testid="banner-expired-trial" >
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="text-base font-semibold flex items-center gap-2">
        Trial Expired
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm mb-3">
          Your organization's trial period has ended. To continue using all features and maintain access for your team, please subscribe to a plan.
        </p>
        <Button onClick={handleSubscribeClick} variant="default" size="sm" data-testid="button-subscribe-from-expired-banner" >
          <Crown className="w-4 h-4 mr-2" />
          Subscribe Now
        </Button>
      </AlertDescription>
    </Alert>
  );
}
