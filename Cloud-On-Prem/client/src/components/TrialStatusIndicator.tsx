import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, AlertTriangle, Clock, Crown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { tzFormat } from '@/utils/timezoneRuntime';

type Severity = 'normal' | 'warning' | 'critical' | 'expired';
type Variant = 'pill' | 'inline' | 'compact';

interface TrialStatusIndicatorProps {
  variant?: Variant;
  showDismiss?: boolean;
  className?: string;
}

interface TrialStatus {
  isTrialActive: boolean;
  daysRemaining: number;
  trialEndDate: string | null;
  organizationId: string;
}

function getSeverity(daysRemaining: number): Severity {
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= 3) return 'critical';
  if (daysRemaining <= 7) return 'warning';
  return 'normal';
}

function getDismissKey(organizationId: string, severity: Severity): string {
  return `trialIndicator_${organizationId}_${severity}`;
}

function isDismissed(organizationId: string, severity: Severity): boolean {
  if (typeof window === 'undefined') return false;
  
  const dismissKey = getDismissKey(organizationId, severity);
  const dismissed = localStorage.getItem(dismissKey);
  
  if (!dismissed) return false;
  
  const dismissedTime = parseInt(dismissed);
  const now = Date.now();
  const ttl = severity === 'normal' ? 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  
  if (now - dismissedTime < ttl) {
    return true;
  }
  
  localStorage.removeItem(dismissKey);
  return false;
}

function setDismissed(organizationId: string, severity: Severity): void {
  if (typeof window === 'undefined') return;
  const dismissKey = getDismissKey(organizationId, severity);
  localStorage.setItem(dismissKey, Date.now().toString());
}

function clearLowerSeverityDismissals(organizationId: string, currentSeverity: Severity): void {
  if (typeof window === 'undefined') return;
  
  const severityOrder: Severity[] = ['normal', 'warning', 'critical', 'expired'];
  const currentIndex = severityOrder.indexOf(currentSeverity);
  
  for (let i = 0; i < currentIndex; i++) {
    const key = getDismissKey(organizationId, severityOrder[i]);
    localStorage.removeItem(key);
  }
}

export function TrialStatusIndicator({ 
  variant = 'pill', 
  showDismiss = true,
  className 
}: TrialStatusIndicatorProps) {
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isOrgAdmin, isImpersonating, impersonatedOrganization, isAuthenticated, isDemo } = useAuth();
  const [localDismissed, setLocalDismissed] = useState(false);

  const { data: userStatus } = useQuery<{ isAuthenticated?: boolean }>({
    queryKey: ['/api/user-status'],
    retry: false,
  });

  const { data: trialStatus } = useQuery<TrialStatus>({
    queryKey: ['/api/trial-status'],
    enabled: !!userStatus?.isAuthenticated,
    refetchInterval: 60000,
  });

  // Demo orgs check - computed after all data hooks
  const isEffectiveDemo = (trialStatus as any)?.isDemo || isDemo;

  const severity = useMemo(() => {
    if (!trialStatus?.isTrialActive) return null;
    return getSeverity(trialStatus.daysRemaining);
  }, [trialStatus?.isTrialActive, trialStatus?.daysRemaining]);

  useEffect(() => {
    if (!trialStatus?.organizationId || !severity) {
      setLocalDismissed(false);
      return;
    }

    clearLowerSeverityDismissals(trialStatus.organizationId, severity);
    setLocalDismissed(isDismissed(trialStatus.organizationId, severity));
  }, [trialStatus?.organizationId, severity]);

  // Demo orgs don't show trial status - they have full access
  // Early return placed after all hooks to comply with React's rules of hooks
  if (isEffectiveDemo && !isSuperAdmin) {
    return null;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (trialStatus?.organizationId && severity) {
      setDismissed(trialStatus.organizationId, severity);
      setLocalDismissed(true);
    }
  };

  const handleCTAClick = () => {
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
  if (!trialStatus?.isTrialActive) return null;
  if (localDismissed && severity !== 'expired' && severity !== 'critical') return null;

  const { daysRemaining, trialEndDate } = trialStatus;
  const formattedDate = trialEndDate ? tzFormat(trialEndDate, 'MMM d, yyyy') : '';

  const getSeverityStyles = () => {
    switch (severity) {
      case 'expired':
        return {
          pill: 'bg-destructive/20 text-destructive border-[var(--destructive)]/40 hover:bg-destructive/30',
          icon: 'text-destructive',
          text: 'Trial Ended'
        };
      case 'critical':
        return {
          pill: 'bg-destructive/20 text-destructive border-[var(--destructive)]/40 hover:bg-destructive/30 animate-pulse',
          icon: 'text-destructive',
          text: `${daysRemaining}d left`
        };
      case 'warning':
        return {
          pill: 'bg-warning/20 text-warning border-[var(--warning)]/40 hover:bg-warning/30',
          icon: 'text-warning',
          text: `${daysRemaining}d left`
        };
      default:
        return {
          pill: 'bg-secondary/20 text-secondary/80 border-secondary/40 hover:bg-secondary/30',
          icon: 'text-secondary',
          text: `Trial: ${daysRemaining}d`
        };
    }
  };

  const styles = getSeverityStyles();

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCTAClick}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
              styles.pill,
              className
            )}
            data-testid="trial-status-compact"
          >
            <Clock className={cn('w-3 h-3', styles.icon)} />
            <span>{styles.text}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">
            {severity === 'expired' ? 'Your trial has ended' : `Trial ends ${formattedDate}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {severity === 'expired' 
              ? 'Contact us to continue using all features'
              : 'Click to view upgrade options'}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCTAClick}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                styles.pill
              )}
              data-testid="trial-status-pill"
            >
              {severity === 'expired' || severity === 'critical' ? (
                <AlertTriangle className={cn('w-3.5 h-3.5', styles.icon)} />
              ) : (
                <Clock className={cn('w-3.5 h-3.5', styles.icon)} />
              )}
              <span>{styles.text}</span>
              {(severity === 'warning' || severity === 'critical' || severity === 'expired') && (
                <ExternalLink className="w-3 h-3 opacity-60" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium">
              {severity === 'expired' 
                ? 'Your trial has ended' 
                : `Trial ends ${formattedDate}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {severity === 'expired' 
                ? 'Contact us to continue using all features'
                : severity === 'critical'
                  ? 'Upgrade now to avoid service interruption'
                  : 'Click to view upgrade options'}
            </p>
          </TooltipContent>
        </Tooltip>
        {showDismiss && severity !== 'expired' && (
          <button
            onClick={handleDismiss}
            className="p-1 rounded-full hover:bg-muted/50 transition-colors"
            aria-label="Dismiss trial notification"
            data-testid="trial-status-dismiss"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    if (severity === 'normal') {
      return (
        <Badge variant="outline" className={cn( 'cursor-pointer gap-1.5', styles.pill, className )} onClick={handleCTAClick} data-testid="trial-status-inline" >
          <Clock className={cn('w-3 h-3', styles.icon)} />
          Trial: {daysRemaining} days remaining
        </Badge>
      );
    }

    return (
      <div 
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg border',
          severity === 'expired' || severity === 'critical'
            ? 'bg-destructive/10 border-[var(--destructive)]/30'
            : 'bg-warning/10 border-[var(--warning)]/30',
          className
        )}
        data-testid="trial-status-inline-urgent"
      >
        <AlertTriangle className={cn(
          'w-4 h-4 flex-shrink-0',
          severity === 'expired' || severity === 'critical' ? 'text-destructive' : 'text-warning'
        )} />
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-medium',
            severity === 'expired' || severity === 'critical' ? 'text-destructive' : 'text-warning'
          )}>
            {severity === 'expired' 
              ? 'Trial Ended' 
              : `Trial ends in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {severity === 'expired' 
              ? 'Contact us to continue'
              : formattedDate}
          </p>
        </div>
        <Button size="sm" variant={severity === 'expired' || severity === 'critical' ? 'destructive' : 'outline'} onClick={handleCTAClick} className="flex-shrink-0 text-xs" data-testid="trial-status-upgrade-btn" >
          {severity === 'expired' ? 'Contact Us' : 'Upgrade'}
        </Button>
        {showDismiss && severity !== 'expired' && (
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label="Dismiss"
            data-testid="trial-status-dismiss-inline"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    );
  }

  return null;
}

export function TrialStatusMobileItem() {
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isOrgAdmin, isImpersonating, isAuthenticated, isDemo } = useAuth();

  const { data: userStatus } = useQuery<{ isAuthenticated?: boolean }>({
    queryKey: ['/api/user-status'],
    retry: false,
  });

  const { data: trialStatus } = useQuery<TrialStatus>({
    queryKey: ['/api/trial-status'],
    enabled: !!userStatus?.isAuthenticated,
  });

  const handleClick = () => {
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

  // Demo orgs don't show trial status - they have full access
  const isEffectiveDemo = (trialStatus as any)?.isDemo || isDemo;
  if (isEffectiveDemo) {
    return null;
  }

  if (!isAuthenticated) return null;
  if (isSuperAdmin && !isImpersonating) return null;
  if (!trialStatus?.isTrialActive) return null;

  const { daysRemaining } = trialStatus;
  const severity = getSeverity(daysRemaining);

  const getIcon = () => {
    if (severity === 'expired' || severity === 'critical') {
      return <AlertTriangle className="w-4 h-4" />;
    }
    return <Clock className="w-4 h-4" />;
  };

  const getText = () => {
    if (severity === 'expired') return 'Trial Ended - Contact Us';
    if (severity === 'critical') return `Trial ends in ${daysRemaining}d - Upgrade Now`;
    if (severity === 'warning') return `Trial: ${daysRemaining} days left`;
    return `Free Trial: ${daysRemaining} days`;
  };

  const getStyles = () => {
    if (severity === 'expired' || severity === 'critical') {
      return 'text-destructive hover:bg-destructive/10';
    }
    if (severity === 'warning') {
      return 'text-warning hover:bg-warning/10';
    }
    return 'text-secondary hover:bg-secondary/10';
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full px-4 py-3 min-h-[44px] text-left rounded-lg transition-colors flex items-center gap-3 touch-manipulation',
        getStyles()
      )}
      data-testid="trial-status-mobile-item"
    >
      {getIcon()}
      <span className="font-medium">{getText()}</span>
      {(severity === 'critical' || severity === 'expired') && (
        <Crown className="w-4 h-4 ml-auto" />
      )}
    </button>
  );
}
