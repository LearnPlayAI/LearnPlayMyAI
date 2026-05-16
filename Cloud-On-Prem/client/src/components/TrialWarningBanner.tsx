import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { tzFormat } from '@/utils/timezoneRuntime';

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

export function TrialWarningBanner() {
  const [, setLocation] = useLocation();
  const [isDismissed, setIsDismissed] = useState(false);
  const { isDemo } = useAuth();

  // First check if user is authenticated by querying user-status
  const { data: userStatus } = useQuery<UserStatus>({
    queryKey: ['/api/user-status'],
    retry: false,
  });

  const { data: trialStatus } = useQuery<TrialStatus>({
    queryKey: ['/api/trial-status'],
    enabled: !!userStatus?.isAuthenticated, // Only fetch when authenticated
    refetchInterval: 60000,
  });

  // Check for demo organization
  const isEffectiveDemo = trialStatus?.isDemo || isDemo;

  useEffect(() => {
    if (!trialStatus?.isTrialActive) {
      setIsDismissed(false);
      return;
    }

    const dismissKey = `trialBanner_${trialStatus.organizationId}_${trialStatus.daysRemaining}`;
    const dismissed = localStorage.getItem(dismissKey);
    
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const now = Date.now();
      if (now - dismissedTime < 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
      } else {
        localStorage.removeItem(dismissKey);
        setIsDismissed(false);
      }
    } else {
      setIsDismissed(false);
    }
  }, [trialStatus?.isTrialActive, trialStatus?.organizationId, trialStatus?.daysRemaining]);

  const handleDismiss = () => {
    if (trialStatus?.organizationId && trialStatus?.daysRemaining !== undefined) {
      const dismissKey = `trialBanner_${trialStatus.organizationId}_${trialStatus.daysRemaining}`;
      setIsDismissed(true);
      localStorage.setItem(dismissKey, Date.now().toString());
    }
  };

  const handleUpgradeClick = () => {
    setLocation('/sales-inquiries');
  };

  // Demo orgs don't show trial warning - they have full access
  if (isEffectiveDemo) {
    return null;
  }

  if (!trialStatus?.isTrialActive || isDismissed) {
    return null;
  }

  const { daysRemaining, trialEndDate } = trialStatus;
  const isUrgent = (daysRemaining ?? 0) <= 7;
  const formattedDate = trialEndDate ? tzFormat(trialEndDate, 'MMMM d, yyyy') : '';

  return (
    <Alert className={` border-t-4 relative ${isUrgent ? 'bg-destructive/10 border-[var(--destructive)]/50 text-destructive' : 'bg-secondary/10 border-secondary/50 text-secondary/90' } `} data-testid="banner-trial-warning" >
      <div className="flex items-start gap-3">
        <AlertCircle className={`w-5 h-5 mt-0.5 ${isUrgent ? 'text-destructive' : 'text-secondary'}`} />
        <div className="flex-1">
          <AlertDescription className="text-sm">
            <span className="font-semibold">
              {isUrgent ? '⚠️ Trial Expiring Soon' : 'Free Trial Active'}
            </span>
            <span className="mx-2">•</span>
            <span>
              Your trial ends in{' '}
              <span className="font-bold">
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
              </span>
              {' '}({formattedDate})
            </span>
            {isUrgent && (
              <>
                <span className="mx-2">•</span>
                <Button variant="link" className="h-auto p-0 underline" onClick={handleUpgradeClick} data-testid="button-upgrade-from-banner" >
                  Upgrade Now
                </Button>
              </>
            )}
          </AlertDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-6 w-6 p-0" data-testid="button-dismiss-trial-banner" >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Alert>
  );
}
