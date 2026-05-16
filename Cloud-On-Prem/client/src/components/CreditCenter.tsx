import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, ChevronDown, Plus, History, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useWalletBalance,
  useWalletTransactions,
  formatTransactionType,
  getTransactionTypeColor,
  type LpCreditTransaction,
} from '@/hooks/useWallet';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from '@shared/creditConstants';
import { cn } from '@/lib/utils';
import { LPCreditIcon } from './LPCreditIcon';
import { LpCreditAmount } from './LpCreditAmount';
import { Building2 } from 'lucide-react';
import { useAuth, canViewCredits } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { useQuery } from '@tanstack/react-query';
import { tzFormat } from '@/utils/timezoneRuntime';

interface OrgWalletBalanceResponse {
  organizationId: string;
  organizationName: string;
  balance: number;
  isEnabled: boolean;
  allowTeachersToSpendCredits: boolean;
}

interface CreditStatusBarProps {
  className?: string;
  compact?: boolean;
  onDrawerOpen?: () => void;
}

export function CreditStatusBar({ className, compact = false, onDrawerOpen }: CreditStatusBarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { balance, isLowBalance, isLoading, isError, refreshBalance, user } = useWalletBalance();
  const [, setLocation] = useLocation();
  const { effectiveOrganizationId, isOrgAdmin, isTeacher, isSuperAdmin, isImpersonating, organizationRoles } = useAuth();
  const { paymentGatewayEnabled, onpremMode } = usePlatformMode();
  const [activeView, setActiveView] = useState<'personal' | 'org'>(paymentGatewayEnabled ? 'personal' : 'org');
  
  const shouldShowCredits = canViewCredits({ isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles });
  
  // Org wallet query - only for org members with org wallet enabled
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
    enabled: !!user && !!organizationId,
    staleTime: 30000,
    retry: 1,
  });
  
  // Determine if org badge should be shown
  const showOrgBadge = !!orgWalletData?.isEnabled;
  const orgBalance = orgWalletData?.balance ?? 0;
  // Org admin can always spend, teachers can spend if allowTeachersToSpendCredits is enabled
  const canSpendOrgCredits = isOrgAdmin || (isTeacher && orgWalletData?.allowTeachersToSpendCredits) || (isSuperAdmin && isImpersonating);

  const handleOpenPersonalDrawer = useCallback(() => {
    setActiveView('personal');
    setIsDrawerOpen(true);
    if (onDrawerOpen) {
      setTimeout(onDrawerOpen, 50);
    }
  }, [onDrawerOpen]);

  const handleOpenOrgDrawer = useCallback(() => {
    setActiveView('org');
    setIsDrawerOpen(true);
    if (onDrawerOpen) {
      setTimeout(onDrawerOpen, 50);
    }
  }, [onDrawerOpen]);

  const handleBuyCredits = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation('/buy-credits');
    setIsDrawerOpen(false);
  }, [setLocation]);

  if (!user || !shouldShowCredits) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => refreshBalance()}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg",
                  "bg-destructive/10 border border-destructive/30",
                  "text-destructive hover:bg-destructive/20 transition-colors",
                  "cursor-pointer",
                  className
                )}
              data-testid="credit-status-bar-error"
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Retry</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Failed to load credits. Click to retry.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        {/* Personal Credits Badge */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleOpenPersonalDrawer}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg",
                  "bg-surface-raised",
                  "border transition-all duration-200",
                  isLowBalance
                    ? "border-[var(--warning)]/50 hover:border-warning"
                    : "border-border hover:border-border",
                  "hover:scale-[1.02] hover:shadow-elevated hover:shadow-primary/10",
                  "cursor-pointer group"
                )}
                data-testid="credit-status-bar"
                aria-label={`${balance} ${LP_CREDITS_NAME}. Click to open credit center.`}
              >
                <LPCreditIcon size="sm" />
                
                {!compact && (
                  <span className={cn(
                    "font-semibold tabular-nums",
                    isLowBalance ? "text-warning" : "text-foreground"
                  )}>
                    {balance.toLocaleString()}
                  </span>
                )}
                
                <span className={cn(
                  "text-sm",
                  isLowBalance ? "text-warning" : "text-muted-foreground",
                  compact && "hidden sm:inline"
                )}>
                  {compact ? balance.toLocaleString() : LP_CREDITS_SHORT}
                </span>

                {isLowBalance && (
                  <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0 hidden sm:flex" >
                    Low
                  </Badge>
                )}

                <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-border">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-warning">Personal {LP_CREDITS_NAME}</span>
                <span className="text-xs text-muted-foreground">
                  Click to view details & history
                </span>
                {isLowBalance && (
                  <span className="text-xs text-warning">
                    {paymentGatewayEnabled
                      ? "Low balance - consider purchasing more"
                      : "Low balance - contact your administrator to add credits"}
                  </span>
                )}
                {balance === 0 && showOrgBadge && canSpendOrgCredits && (
                  <span className="text-xs text-primary">
                    No personal credits - organization credits will be used
                  </span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {/* Organization Credits Badge - shown when org wallet is enabled */}
        {showOrgBadge && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleOpenOrgDrawer}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg",
                    "bg-surface-raised",
                    "border transition-all duration-200",
                    "border-secondary/30 hover:border-secondary/50",
                    "hover:scale-[1.02] hover:shadow-elevated hover:shadow-secondary/10",
                    "cursor-pointer group"
                  )}
                  data-testid="org-credit-status-bar"
                  aria-label={`${orgBalance} organization ${LP_CREDITS_NAME}.`}
                >
                  <Building2 className="h-4 w-4 text-secondary" />
                  
                  {!compact && (
                    <span className="font-semibold tabular-nums text-foreground">
                      {orgBalance.toLocaleString()}
                    </span>
                  )}
                  
                  <span className={cn(
                    "text-sm text-muted-foreground",
                    compact && "hidden sm:inline"
                  )}>
                    {compact ? orgBalance.toLocaleString() : "Org"}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card border-secondary/30">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-secondary">Organization {LP_CREDITS_NAME}</span>
                  <span className="text-xs text-muted-foreground">
                    Shared credits for your organization
                  </span>
                  {!canSpendOrgCredits && (
                    <span className="text-xs text-muted-foreground">
                      View only - contact your administrator
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <CreditCenterDrawer 
        open={isDrawerOpen} 
        onOpenChange={setIsDrawerOpen}
        onBuyCredits={handleBuyCredits}
        activeView={activeView}
        setActiveView={setActiveView}
        organizationId={organizationId}
        orgWalletData={orgWalletData}
      />
    </>
  );
}

interface OrgCreditTransaction {
  id: string;
  organizationId: string;
  actorUserId: string;
  actorDisplayName?: string;
  transactionType: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  activityType: string;
  description: string;
  referenceId?: string;
  referenceType?: string;
  createdAt: string;
}

interface CreditCenterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBuyCredits: (e: React.MouseEvent) => void;
  activeView: 'personal' | 'org';
  setActiveView: (view: 'personal' | 'org') => void;
  organizationId?: string | null;
  orgWalletData?: OrgWalletBalanceResponse | null;
}

function CreditCenterDrawer({ 
  open, 
  onOpenChange, 
  onBuyCredits, 
  activeView, 
  setActiveView,
  organizationId,
  orgWalletData
}: CreditCenterDrawerProps) {
  const [, setLocation] = useLocation();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [transactionLimit, setTransactionLimit] = useState(20);
  const { user } = useAuth();
  const { paymentGatewayEnabled, onpremMode } = usePlatformMode();
  
  const { balance, isLowBalance, lowBalanceThreshold, refreshBalance, isLoading: balanceLoading } = useWalletBalance({
    pollingInterval: open ? 30000 : false,
  });
  
  const { transactions, pagination, isLoading: txLoading, refetch: refetchTransactions } = useWalletTransactions({
    limit: transactionLimit,
    type: typeFilter !== 'all' ? typeFilter as LpCreditTransaction['type'] : undefined,
    enabled: open && activeView === 'personal',
  });

  // Org transactions query - only fetches current user's org transactions
  const { data: orgTransactionsData, isLoading: orgTxLoading, refetch: refetchOrgTransactions } = useQuery<{
    transactions: OrgCreditTransaction[];
    total: number;
    hasMore: boolean;
  }>({
    queryKey: ['/api/org-wallet', organizationId, 'transactions', user?.id, transactionLimit],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: transactionLimit.toString(),
        offset: '0',
        actorUserId: user?.id || '',
      });
      const response = await fetch(`/api/org-wallet/${organizationId}/transactions?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch org transactions');
      }
      return response.json();
    },
    enabled: open && activeView === 'org' && !!organizationId && !!user?.id,
    staleTime: 30000,
  });

  const orgTransactions = orgTransactionsData?.transactions || [];
  const orgPagination = {
    total: orgTransactionsData?.total || 0,
    hasMore: orgTransactionsData?.hasMore || false,
  };

  const handleRefresh = useCallback(() => {
    if (activeView === 'personal') {
      refreshBalance();
      refetchTransactions();
    } else {
      refetchOrgTransactions();
    }
  }, [activeView, refreshBalance, refetchTransactions, refetchOrgTransactions]);

  const handleLoadMore = useCallback(() => {
    setTransactionLimit(prev => prev + 20);
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-md bg-background border-border"
        aria-describedby="credit-center-description"
      >
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-xl">
              {activeView === 'personal' ? (
                <LPCreditIcon size="lg" />
              ) : (
                <Building2 className="h-6 w-6 text-secondary" />
              )}
              {activeView === 'personal' ? `${LP_CREDITS_NAME} Center` : 'Organization LP Credits'}
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={handleRefresh} className="h-8 w-8" data-testid="credit-center-refresh" >
              <RefreshCw className={cn("h-4 w-4", (balanceLoading || txLoading || orgTxLoading) && "animate-spin")} />
            </Button>
          </div>
          <SheetDescription id="credit-center-description">
            {activeView === 'personal' 
              ? `View your ${LP_CREDITS_NAME} balance and transaction history`
              : 'View your organization credit usage'}
          </SheetDescription>
          
          {/* View Toggle Tabs - only show if org wallet is enabled */}
          {orgWalletData?.isEnabled && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setActiveView('personal')}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                  activeView === 'personal'
                    ? "bg-primary/20 text-primary border border-border"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
                data-testid="view-toggle-personal"
              >
                <LPCreditIcon size="sm" className="inline-block mr-1" />
                Personal
              </button>
              <button
                onClick={() => setActiveView('org')}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                  activeView === 'org'
                    ? "bg-secondary/20 text-secondary border border-secondary/30"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
                data-testid="view-toggle-org"
              >
                <Building2 className="inline-block h-4 w-4 mr-1" />
                Organization
              </button>
            </div>
          )}
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-180px)]">
          {/* Balance Display */}
          {activeView === 'personal' ? (
            <div className={cn(
              "py-6 px-4 my-4 rounded-xl text-center",
              "bg-surface-raised",
              "border",
              isLowBalance ? "border-[var(--warning)]/40" : "border-border"
            )}>
              {balanceLoading ? (
                <Skeleton className="h-12 w-32 mx-auto" />
              ) : (
                <>
                  <div 
                    className="text-4xl font-bold text-foreground tabular-nums"
                    aria-live="polite"
                    data-testid="credit-center-balance"
                  >
                    {balance.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {LP_CREDITS_NAME}
                  </div>
                  {isLowBalance && (
                    <div className="flex items-center justify-center gap-1.5 mt-3 text-warning text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Balance below {lowBalanceThreshold} {LP_CREDITS_SHORT}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className={cn(
              "py-6 px-4 my-4 rounded-xl text-center",
              "bg-surface-raised",
              "border border-secondary/30"
            )}>
              <div 
                className="text-4xl font-bold text-foreground tabular-nums"
                aria-live="polite"
                data-testid="org-credit-center-balance"
              >
                {(orgWalletData?.balance ?? 0).toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Organization {LP_CREDITS_NAME}
              </div>
              {orgWalletData?.organizationName && (
                <div className="text-xs text-muted-foreground mt-1">
                  {orgWalletData.organizationName}
                </div>
              )}
            </div>
          )}

          {/* Buy Credits Button - only show in personal view when payment gateway is enabled */}
          {activeView === 'personal' && paymentGatewayEnabled && (
            <Button onClick={onBuyCredits} className="w-full min-h-[48px] sm:min-h-[44px] font-semibold mb-4 touch-manipulation text-sm sm:text-base" data-testid="credit-center-buy-credits" >
              <Plus className="h-4 w-4 mr-2" />
              Buy More Credits
            </Button>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">
                {activeView === 'personal' ? 'Transaction History' : 'Your Org Usage'}
              </span>
            </div>
            {activeView === 'personal' && (
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="transaction-type-filter">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {!onpremMode && <SelectItem value="purchase">Purchases</SelectItem>}
                  <SelectItem value="deduction">Used</SelectItem>
                  <SelectItem value="refund">Refunds</SelectItem>
                  <SelectItem value="bonus">Bonuses</SelectItem>
                  <SelectItem value="adjustment">Adjustments</SelectItem>
                  <SelectItem value="trial_grant">Trial Grants</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <ScrollArea className="flex-1 -mx-2 px-2">
            {activeView === 'personal' ? (
              <>
                {txLoading && transactions.length === 0 ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <TransactionItem key={tx.id} transaction={tx} />
                    ))}
                    
                    {pagination.hasMore && (
                      <Button variant="ghost" size="sm" onClick={handleLoadMore} className="w-full mt-2 min-h-[48px] sm:min-h-[44px] touch-manipulation" disabled={txLoading} data-testid="load-more-transactions" >
                        {txLoading ? 'Loading...' : 'Load More'}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {orgTxLoading && orgTransactions.length === 0 ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : orgTransactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No organization credit usage yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orgTransactions.map((tx) => (
                      <OrgTransactionItem key={tx.id} transaction={tx} />
                    ))}
                    
                    {orgPagination.hasMore && (
                      <Button variant="ghost" size="sm" onClick={handleLoadMore} className="w-full mt-2 min-h-[48px] sm:min-h-[44px] touch-manipulation" disabled={orgTxLoading} data-testid="load-more-org-transactions" >
                        {orgTxLoading ? 'Loading...' : 'Load More'}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </ScrollArea>

          <div className="pt-3 mt-3 border-t border-border pb-[env(safe-area-inset-bottom)]">
            <div className="text-center text-xs text-muted-foreground mb-3">
              {activeView === 'personal' 
                ? `Showing ${transactions.length} of ${pagination.total} transactions`
                : `Showing ${orgTransactions.length} of ${orgPagination.total} transactions`
              }
            </div>
            {activeView === 'personal' && pagination.total > 0 && (
              <Button variant="outline" size="sm" className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation text-sm" onClick={() => {
                  onOpenChange(false);
                  setLocation('/purchase-history');
                }}
                data-testid="view-all-history-button"
              >
                <History className="h-4 w-4 mr-2" />
                View Full Transaction History
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface TransactionItemProps {
  transaction: LpCreditTransaction;
}

function TransactionItem({ transaction }: TransactionItemProps) {
  const isPositive = transaction.amount > 0;
  const Icon = isPositive ? ArrowDownLeft : ArrowUpRight;

  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover:border-border transition-colors"
      data-testid={`transaction-item-${transaction.id}`}
    >
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-full",
        isPositive ? "bg-success/20" : "bg-destructive/20"
      )}>
        <Icon className={cn(
          "h-4 w-4",
          isPositive ? "text-success" : "text-destructive"
        )} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium", getTransactionTypeColor(transaction.type))}>
            {formatTransactionType(transaction.type)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {transaction.description}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {tzFormat(transaction.createdAt, 'MMM d, yyyy HH:mm')}
        </p>
      </div>
      
      <div className="text-right">
        <div className={cn(
          "font-semibold tabular-nums",
          isPositive ? "text-success" : "text-destructive"
        )}>
          {isPositive ? '+' : ''}{transaction.amount.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">
          Bal: {transaction.balanceAfter.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

interface OrgTransactionItemProps {
  transaction: OrgCreditTransaction;
}

function OrgTransactionItem({ transaction }: OrgTransactionItemProps) {
  const isPositive = transaction.transactionType === 'credit';
  const Icon = isPositive ? ArrowDownLeft : ArrowUpRight;

  const formatActivityType = (type: string) => {
    const typeMap: Record<string, string> = {
      'lesson_generation': 'Lesson Generation',
      'quiz_generation': 'Quiz Generation',
      'ai_explanation': 'AI Explanation',
      'image_generation': 'Image Generation',
      'thumbnail_generation': 'Thumbnail Generation',
      'purchase': 'Credit Purchase',
      'admin_adjustment': 'Admin Adjustment',
      'refund': 'Refund',
      'content_translation': 'Content Translation',
      'topic_analysis': 'Topic Analysis',
      'course_framework': 'Course Framework',
      'lesson_feedback': 'Lesson Feedback',
      'ai_content_improvement': 'AI Content Improvement',
    };
    return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover:border-secondary/30 transition-colors"
      data-testid={`org-transaction-item-${transaction.id}`}
    >
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-full",
        isPositive ? "bg-success/20" : "bg-destructive/20"
      )}>
        <Icon className={cn(
          "h-4 w-4",
          isPositive ? "text-success" : "text-destructive"
        )} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-medium",
            isPositive ? "text-success" : "text-secondary"
          )}>
            {formatActivityType(transaction.activityType)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {transaction.description}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {tzFormat(transaction.createdAt, 'MMM d, yyyy HH:mm')}
        </p>
      </div>
      
      <div className="text-right">
        <div className={cn(
          "font-semibold tabular-nums",
          isPositive ? "text-success" : "text-destructive"
        )}>
          {isPositive ? '+' : '-'}{Math.abs(transaction.amount).toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">
          Bal: {transaction.balanceAfter.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default CreditStatusBar;
