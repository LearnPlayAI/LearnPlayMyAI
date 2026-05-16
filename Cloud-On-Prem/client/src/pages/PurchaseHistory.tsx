import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

import { usePlatformMode } from '@/hooks/usePlatformMode';
import { 
  Receipt, 
  History as HistoryIcon, 
  Calendar, 
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  Coins,
  Search,
  X,
  FileDown,
  GraduationCap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { PremiumHeader } from '@/pages/landing';
import { useUser } from '@/hooks/use-user';
import { useAuth, canViewCredits } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  useWalletTransactions,
  useWalletBalance,
  formatTransactionType,
  getTransactionTypeColor,
  type LpCreditTransaction,
} from '@/hooks/useWallet';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from '@shared/creditConstants';
import { cn } from '@/lib/utils';
import { tzFormat } from '@/utils/timezoneRuntime';

const ITEMS_PER_PAGE = 20;

const formatCoursePrice = (price: string, currency: string) => {
  const amount = parseFloat(price);
  if (amount === 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export default function PurchaseHistory() {
  const { user } = useUser();
  const { toast } = useToast();
  const { isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles } = useAuth();
  const { paymentGatewayEnabled, onpremMode } = usePlatformMode();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;

  const { data: coursePurchases, isLoading: purchasesLoading } = useQuery<any[]>({
    queryKey: ['/api/my-purchase-history'],
    enabled: isAuthenticated,
  });
  const isAdmin = adminCheck?.isAdmin || false;

  const showCreditsSection = canViewCredits({ isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles });

  // Memoize offset to ensure consistent query key updates when page changes
  const offset = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage]);

  const { transactions, pagination, isLoading: txLoading, refetch } = useWalletTransactions({
    limit: ITEMS_PER_PAGE,
    offset,
    type: typeFilter !== 'all' ? typeFilter as LpCreditTransaction['type'] : undefined,
    startDate,
    endDate,
    enabled: isAuthenticated && showCreditsSection,
  });

  const { balance, isLoading: balanceLoading } = useWalletBalance({
    enabled: isAuthenticated && showCreditsSection,
  });

  const totalPages = useMemo(() => {
    return Math.ceil(pagination.total / ITEMS_PER_PAGE);
  }, [pagination.total]);

  const hasFilters = typeFilter !== 'all' || startDate || endDate;

  const clearFilters = () => {
    setTypeFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadReceipt = async (correlationId: string) => {
    try {
      toast({
        title: 'Downloading receipt...',
        description: 'Your receipt will be downloaded shortly.',
      });

      const response = await fetch(`/api/wallet/transactions/${correlationId}/receipt`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download receipt');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${correlationId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Receipt downloaded',
        description: 'Your receipt has been saved.',
      });
    } catch (error: any) {
      console.error('Receipt download error:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Could not download the receipt. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const isLoading = txLoading || adminLoading;

  if (isLoading && transactions.length === 0) {
    return (
      <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
        <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
        
        <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 max-w-4xl relative z-10">
          <Skeleton className="h-10 sm:h-12 w-48 sm:w-64 mb-[var(--space-md)]" />
          <Skeleton className="h-5 sm:h-6 w-full max-w-sm sm:max-w-md mb-[var(--space-xl)]" />
          <div className="space-y-[var(--space-md)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 sm:h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 max-w-4xl relative z-10">
        <div className="mb-[var(--space-xl)]">
          <h1 
            className="text-[length:var(--text-3xl)] sm:text-[length:var(--text-4xl)] font-bold mb-[var(--space-sm)] text-foreground drop-shadow-elevated flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-sm)] sm:gap-3" 
            data-testid="page-title"
          >
            <HistoryIcon className="h-8 w-8 sm:h-10 sm:w-10 shrink-0" />
            <span>Transaction History</span>
          </h1>
          <p className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]" data-testid="page-description">
            {showCreditsSection
              ? (onpremMode 
                  ? `View your course enrollments and ${LP_CREDITS_NAME} history including usage and adjustments`
                  : `View your course enrollments and ${LP_CREDITS_NAME} history including purchases, usage, and adjustments`)
              : 'View your course enrollment history'
            }
          </p>
        </div>

        {showCreditsSection && (
          <Card className="bg-surface-raised border-border mb-[var(--space-lg)]">
            <CardContent className="p-[var(--space-md)] sm:p-[var(--space-lg)]">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-[var(--space-md)]">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent/20">
                    <Coins className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Balance</p>
                    {balanceLoading ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground" data-testid="current-balance">
                        {balance.toLocaleString()} {LP_CREDITS_SHORT}
                      </p>
                    )}
                  </div>
                </div>
                {paymentGatewayEnabled && (
                  <Link href="/buy-credits">
                    <Button className="font-semibold min-h-[44px] w-full sm:w-auto" data-testid="button-buy-credits" >
                      Buy More Credits
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {(purchasesLoading || (coursePurchases && coursePurchases.length > 0)) && (
          <div className="mb-[var(--space-lg)]">
            <h2 className="text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)] font-semibold text-foreground mb-[var(--space-sm)] flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Course Enrollments
            </h2>
            {purchasesLoading ? (
              <div className="space-y-[var(--space-sm)]">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-[var(--space-sm)]">
                {coursePurchases!.map((purchase: any) => {
                  const isOnPrem = purchase.checkoutId?.startsWith('onprem') || purchase.checkoutId?.startsWith('free_grant');
                  return (
                    <Card
                      key={purchase.id}
                      className="bg-card border-border hover:bg-muted transition-all duration-200"
                    >
                      <CardContent className="p-[var(--space-md)]">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 bg-primary/20">
                            <GraduationCap className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={cn( "text-xs border-transparent", isOnPrem ? "text-warning" : "text-primary" )} >
                                {isOnPrem ? 'On-Prem Enrollment' : 'Course Enrollment'}
                              </Badge>
                            </div>
                            <p className="text-sm text-foreground truncate">
                              {purchase.courseTitle}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {tzFormat(purchase.purchasedAt, 'MMMM d, yyyy \'at\' h:mm a')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-lg font-bold text-primary">
                              {formatCoursePrice(purchase.purchasePrice, purchase.purchaseCurrency)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(!coursePurchases || coursePurchases.length === 0) && !purchasesLoading && (!showCreditsSection || transactions.length === 0) && (
          <Card className="bg-card border-border" data-testid="empty-transactions">
            <CardContent className="py-[var(--space-2xl)] text-center p-[var(--card-padding)]">
              <Receipt className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-[var(--space-md)] text-muted-foreground/30" />
              <p className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]" data-testid="empty-transactions-message">
                {showCreditsSection && hasFilters ? 'No transactions match your filters' : 'No transactions yet'}
              </p>
              <p className="text-muted-foreground/70 text-[length:var(--text-sm)] mt-[var(--space-sm)]" data-testid="empty-transactions-hint">
                {showCreditsSection && hasFilters
                  ? 'Try adjusting your filters to see more results'
                  : 'Your transaction history will appear here once you enroll in courses'}
              </p>
              {showCreditsSection && hasFilters && (
                <Button variant="outline" className="mt-[var(--space-md)]" onClick={clearFilters} data-testid="button-clear-filters-empty" >
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {showCreditsSection && (
          <>
            <Card className="bg-card border-border mb-[var(--space-md)]">
              <CardContent className="p-[var(--space-md)]">
                <div className="flex flex-col sm:flex-row gap-[var(--space-sm)] sm:gap-[var(--space-md)] items-start sm:items-center">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <span className="text-sm font-medium">{LP_CREDITS_NAME} Filters:</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-[var(--space-sm)] flex-1">
                    <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[140px] bg-muted border-border" data-testid="filter-type">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {!onpremMode && <SelectItem value="purchase">Purchases</SelectItem>}
                        <SelectItem value="deduction">Used</SelectItem>
                        <SelectItem value="refund">Refunds</SelectItem>
                        <SelectItem value="bonus">Bonuses</SelectItem>
                        <SelectItem value="adjustment">Adjustments</SelectItem>
                        {!onpremMode && <SelectItem value="subscription_topup">Subscription Top-ups</SelectItem>}
                        <SelectItem value="trial_grant">Trial Grants</SelectItem>
                      </SelectContent>
                    </Select>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal" data-testid="filter-start-date" >
                          <Calendar className="mr-2 h-4 w-4" />
                          {startDate ? tzFormat(startDate, 'MMM d, yyyy') : 'Start date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => { setStartDate(date); setCurrentPage(1); }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal" data-testid="filter-end-date" >
                          <Calendar className="mr-2 h-4 w-4" />
                          {endDate ? tzFormat(endDate, 'MMM d, yyyy') : 'End date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => { setEndDate(date); setCurrentPage(1); }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters" >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {transactions.length > 0 && (
              <div className="space-y-[var(--space-sm)]">
                {transactions.map((tx) => (
                  <TransactionRow key={tx.id} transaction={tx} onDownloadReceipt={handleDownloadReceipt} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-[var(--space-lg)] p-[var(--space-md)] bg-card rounded-lg border border-border">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({pagination.total} transactions)
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="border-border"
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" onClick={() => handlePageChange(page)}
                          className={cn(
                            "w-8 h-8 p-0",
                            currentPage === page 
                              ? "bg-primary hover:bg-primary/90" 
                              : "border-border hover:bg-muted"
                          )}
                          data-testid={`button-page-${page}`}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="border-border"
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {transactions.length > 0 && totalPages === 1 && (
              <div className="mt-[var(--space-lg)] text-center">
                <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid="total-transactions-count">
                  Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface TransactionRowProps {
  transaction: LpCreditTransaction;
  onDownloadReceipt: (transactionId: string) => void;
}

function TransactionRow({ transaction, onDownloadReceipt }: TransactionRowProps) {
  const isPositive = transaction.amount > 0;
  const Icon = isPositive ? ArrowDownLeft : ArrowUpRight;
  const isPurchase = transaction.type === 'purchase';

  return (
    <Card 
      className="bg-card border-border hover:bg-muted transition-all duration-200"
      data-testid={`transaction-row-${transaction.id}`}
    >
      <CardContent className="p-[var(--space-md)]">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full shrink-0",
            isPositive ? "bg-success/20" : "bg-destructive/20"
          )}>
            <Icon className={cn(
              "h-5 w-5",
              isPositive ? "text-success" : "text-destructive"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn( "text-xs border-transparent", getTransactionTypeColor(transaction.type) )} >
                {formatTransactionType(transaction.type)}
              </Badge>
            </div>
            <p className="text-sm text-foreground truncate" data-testid={`transaction-description-${transaction.id}`}>
              {transaction.description}
            </p>
            <p className="text-xs text-muted-foreground mt-1" data-testid={`transaction-date-${transaction.id}`}>
              {tzFormat(transaction.createdAt, 'MMMM d, yyyy \'at\' h:mm a')}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {isPurchase && transaction.correlationId && (
              <Button variant="outline" size="sm" onClick={() => onDownloadReceipt(transaction.correlationId)}
                className="border-border hover:bg-muted"
                data-testid={`button-download-receipt-${transaction.id}`}
              >
                <FileDown className="h-4 w-4 mr-1" />
                Receipt
              </Button>
            )}
            
            <div className="text-right shrink-0">
              <div 
                className={cn(
                  "text-lg font-bold tabular-nums",
                  isPositive ? "text-success" : "text-destructive"
                )}
                data-testid={`transaction-amount-${transaction.id}`}
              >
                {isPositive ? '+' : ''}{transaction.amount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                Balance: {transaction.balanceAfter.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
