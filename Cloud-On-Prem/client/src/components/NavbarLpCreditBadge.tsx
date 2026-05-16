import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useRef, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWalletBalance } from '@/hooks/useWallet';
import { useAuth, canViewCredits } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from '@shared/creditConstants';
import { cn } from '@/lib/utils';
import { LPCreditIcon } from './LPCreditIcon';
import { Building2 } from 'lucide-react';

const LOW_BALANCE_THRESHOLD = 420;

interface OrgWalletBalanceResponse {
  organizationId: string;
  organizationName: string;
  balance: number;
  isEnabled: boolean;
  allowTeachersToSpendCredits: boolean;
}

export function NavbarLpCreditBadge() {
  const { balance, isLoading, user } = useWalletBalance();
  const { isOrgAdmin, isTeacher, isSuperAdmin, isImpersonating, effectiveOrganizationId, organizationRoles } = useAuth();
  const [, setLocation] = useLocation();
  const isLowBalance = balance < LOW_BALANCE_THRESHOLD;
  
  const shouldShowCredits = canViewCredits({ isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles });
  const { paymentGatewayEnabled } = usePlatformMode();
  
  const prevBalanceRef = useRef<number | null>(null);
  const prevOrgBalanceRef = useRef<number | null>(null);
  const [isBalanceIncreased, setIsBalanceIncreased] = useState(false);
  const [isOrgBalanceIncreased, setIsOrgBalanceIncreased] = useState(false);

  useEffect(() => {
    if (prevBalanceRef.current !== null && balance > prevBalanceRef.current) {
      setIsBalanceIncreased(true);
      const timer = setTimeout(() => setIsBalanceIncreased(false), 600);
      return () => clearTimeout(timer);
    }
    prevBalanceRef.current = balance;
  }, [balance]);

  // Use effectiveOrganizationId from useAuth which handles:
  // - SuperAdmin: only when impersonating
  // - Org Admin/Teacher: from session organizationId or organizationRoles[0]
  const organizationId = effectiveOrganizationId;

  const { data: orgWalletData, isLoading: orgWalletLoading } = useQuery<OrgWalletBalanceResponse>({
    queryKey: ['/api/org-wallet', organizationId, 'balance'],
    queryFn: async () => {
      const response = await fetch(`/api/org-wallet/${organizationId}/balance`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch org wallet balance');
      }
      return response.json();
    },
    enabled: !!organizationId,
    staleTime: 5000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const showOrgBadge = orgWalletData?.isEnabled;
  // Can spend org credits: org admin, teacher with permission, or superadmin when impersonating
  const canSpendOrgCredits = isOrgAdmin || (isTeacher && orgWalletData?.allowTeachersToSpendCredits) || (isSuperAdmin && isImpersonating);
  const orgBalance = orgWalletData?.balance ?? 0;
  const isOrgLowBalance = orgBalance < LOW_BALANCE_THRESHOLD;

  useEffect(() => {
    if (prevOrgBalanceRef.current !== null && orgBalance > prevOrgBalanceRef.current) {
      setIsOrgBalanceIncreased(true);
      const timer = setTimeout(() => setIsOrgBalanceIncreased(false), 600);
      return () => clearTimeout(timer);
    }
    prevOrgBalanceRef.current = orgBalance;
  }, [orgBalance]);

  const handleClick = () => {
    if (paymentGatewayEnabled) {
      setLocation('/buy-credits');
    }
  };

  if (!user || !shouldShowCredits) {
    return null;
  }

  if (isLoading || (organizationId && orgWalletLoading)) {
    return (
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
    );
  }

  if (showOrgBadge) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1.5" data-testid="navbar-lp-credit-badge">
          {paymentGatewayEnabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleClick}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 md:px-3.5 md:py-1.5 rounded-full",
                  isLowBalance
                    ? "bg-warning text-warning-foreground animate-pulse"
                    : "bg-surface-raised text-foreground hover:scale-105 hover:shadow-elevated hover:shadow-[var(--game-glow)]",
                  isLowBalance ? "border border-warning/50" : "border border-border hover:border-[var(--action-accent)/0.6]",
                  "font-semibold text-sm md:text-base",
                  "transition-all duration-200 ease-in-out",
                  "cursor-pointer group",
                  isBalanceIncreased && "animate-credit-pulse-green",
                  !isLowBalance && !isBalanceIncreased && "animate-credit-glow"
                )}
              >
                <LPCreditIcon size="sm" className="md:w-5 md:h-5" />
                <span className={cn(
                  "hidden md:inline font-bold tracking-tight",
                  isLowBalance ? "text-warning-foreground" : "text-primary drop-shadow-sm group-hover:text-primary/90"
                )}>
                  {balance.toLocaleString()}
                </span>
                <span className={cn(
                  "inline md:hidden text-xs font-bold",
                  isLowBalance ? "text-warning-foreground" : "text-primary drop-shadow-sm"
                )}>
                  {balance.toLocaleString()}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              className={cn(
                isLowBalance
                  ? "bg-warning/10 border-warning/50 text-warning"
                  : "bg-card border-border text-foreground"
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className={cn(
                  "font-semibold flex items-center gap-1.5",
                  isLowBalance ? "text-warning" : "text-primary"
                )}>
                  <LPCreditIcon size="xs" />
                  {isLowBalance ? "Low Balance!" : "Personal Credits"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {balance.toLocaleString()} {LP_CREDITS_SHORT}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {balance === 0 && canSpendOrgCredits && orgBalance > 0
                    ? "No personal credits - organization credits will be used"
                    : "Personal credits are used first, then organization credits"
                  }
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              {canSpendOrgCredits ? (
                <button
                  onClick={handleClick}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 md:px-3.5 md:py-1.5 rounded-full",
                    isOrgLowBalance
                      ? "bg-warning text-warning-foreground animate-pulse"
                      : "bg-surface-raised text-foreground hover:scale-105 hover:shadow-elevated hover:shadow-[var(--game-glow)]",
                    isOrgLowBalance ? "border border-warning/50" : "border border-secondary/40 hover:border-[var(--action-primary)/0.6]",
                    "font-semibold text-sm md:text-base",
                    "transition-all duration-200 ease-in-out",
                    "cursor-pointer group",
                    isOrgBalanceIncreased && "animate-credit-pulse-green"
                  )}
                >
                  <Building2 className={cn(
                    "h-4 w-4 md:h-5 md:w-5",
                    isOrgLowBalance ? "text-warning-foreground" : "text-secondary"
                  )} />
                  <span className={cn(
                    "hidden md:inline font-bold tracking-tight",
                    isOrgLowBalance ? "text-warning-foreground" : "text-secondary drop-shadow-sm group-hover:text-secondary/90"
                  )}>
                    {orgBalance.toLocaleString()}
                  </span>
                  <span className={cn(
                    "inline md:hidden text-xs font-bold",
                    isOrgLowBalance ? "text-warning-foreground" : "text-secondary drop-shadow-sm"
                  )}>
                    {orgBalance.toLocaleString()}
                  </span>
                </button>
              ) : (
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 md:px-3.5 md:py-1.5 rounded-full",
                    "bg-muted/50 text-muted-foreground",
                    "border border-muted",
                    "font-semibold text-sm md:text-base",
                    "cursor-default"
                  )}
                >
                  <Building2 className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  <span className="hidden md:inline font-bold text-muted-foreground">
                    {orgBalance.toLocaleString()}
                  </span>
                  <span className="inline md:hidden text-xs font-bold text-muted-foreground">
                    {orgBalance.toLocaleString()}
                  </span>
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              className={cn(
                isOrgLowBalance && canSpendOrgCredits
                  ? "bg-warning/10 border-warning/50 text-warning"
                  : "bg-card border-secondary/30 text-foreground"
              )}
            >
              <div className="flex flex-col gap-1">
                <span className={cn(
                  "font-semibold flex items-center gap-1.5",
                  isOrgLowBalance && canSpendOrgCredits ? "text-warning" : "text-secondary"
                )}>
                  <Building2 className="h-3.5 w-3.5" />
                  {isOrgLowBalance && canSpendOrgCredits ? "Low Org Balance!" : "Organization Credits"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {orgWalletData?.organizationName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {orgBalance.toLocaleString()} {LP_CREDITS_SHORT}
                </span>
                {canSpendOrgCredits ? (
                  <span className="text-xs text-muted-foreground mt-1">
                    {!paymentGatewayEnabled
                      ? "Contact your administrator to manage credits"
                      : isOrgLowBalance
                        ? "Organization credits are running low. Click to purchase more."
                        : "Click to purchase more credits"
                    }
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground mt-1 italic">
                    View only - contact your administrator to purchase credits
                  </span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            data-testid="navbar-lp-credit-badge"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 md:px-4 md:py-2 rounded-full",
              isLowBalance
                ? "bg-warning text-warning-foreground animate-pulse"
                : "bg-surface-raised text-foreground hover:scale-105 hover:shadow-elevated hover:shadow-[var(--game-glow)]",
              isLowBalance ? "border border-warning/50" : "border border-border hover:border-[var(--action-accent)/0.6]",
              "font-semibold text-sm md:text-base",
              "transition-all duration-200 ease-in-out",
              "cursor-pointer group",
              isBalanceIncreased && "animate-credit-pulse-green",
              !isLowBalance && !isBalanceIncreased && "animate-credit-glow"
            )}
          >
            <LPCreditIcon size="sm" className="md:w-5 md:h-5" />
            <span className={cn(
              "hidden md:inline font-bold tracking-tight",
              isLowBalance ? "text-warning-foreground" : "text-primary drop-shadow-sm group-hover:text-primary/90"
            )}>
              {balance.toLocaleString()} {LP_CREDITS_SHORT}
            </span>
            <span className={cn(
              "inline md:hidden text-xs font-bold",
              isLowBalance ? "text-warning-foreground" : "text-primary drop-shadow-sm"
            )}>
              {balance.toLocaleString()}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className={cn(
            isLowBalance
              ? "bg-warning/10 border-warning/50 text-warning"
              : "bg-card border-border text-foreground"
          )}
        >
          <div className="flex flex-col gap-0.5">
            <span className={cn(
              "font-semibold",
              isLowBalance ? "text-warning" : "text-primary"
            )}>
              {isLowBalance ? "Low Balance!" : LP_CREDITS_NAME}
            </span>
            <span className="text-xs text-muted-foreground">
              {!paymentGatewayEnabled
                ? "Contact your administrator to manage credits"
                : isLowBalance
                  ? "Your credits are running low. Click to purchase more."
                  : "Click to purchase more credits"
              }
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default NavbarLpCreditBadge;
