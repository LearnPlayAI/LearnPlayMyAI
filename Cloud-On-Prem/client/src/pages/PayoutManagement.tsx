import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DollarSign, Check, Download, Filter, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useUser } from '@/hooks/use-user';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { DualCurrencyDisplay, CurrencyConversionTooltip } from '@/components/CurrencyConversionTooltip';
import { CurrencyIndicatorBadge } from '@/components/CurrencyIndicatorBadge';

type Payout = {
  id: string;
  organizationId: string;
  organizationName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossRevenue: string;
  platformCommission: string;
  netAmount: string;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt?: string;
  paymentReference?: string;
  courseCount: number;
};

export default function PayoutManagement() {
  const { user } = useUser();
  const { toast } = useToast();
  const { formatPrice, displayCurrency } = useCurrencyDisplay();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null);

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  const { data, isLoading } = useQuery<{ payouts: Payout[]; total: number }>({
    queryKey: ['/api/superadmin/payouts', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/superadmin/payouts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch payouts');
      }
      return response.json();
    },
    enabled: isAuthenticated && isSuperAdmin,
  });

  const payouts = data?.payouts || [];

  const markPaidMutation = useMutation({
    mutationFn: async ({ payoutId, paymentRef }: { payoutId: string; paymentRef: string }) => {
      return await apiRequest(`/api/superadmin/payouts/${payoutId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ paymentReference: paymentRef }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/payouts'], exact: false });
      toast({
        title: 'Success',
        description: 'Payout marked as paid',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedPayout(expandedPayout === id ? null : id);
  };

  if (!isSuperAdmin) {
    return null;
  }

  if (isLoading || adminLoading) {
    return (
      <QuizAdminLayout 
        title="Payout Management" 
        description="Manage marketplace payouts to organizations" 
        activeSection="payouts"
      >
        <div className="space-y-[var(--space-md)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 sm:h-32 w-full" />
          ))}
        </div>
      </QuizAdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <QuizAdminLayout 
      title="Payout Management" 
      description="Manage marketplace payouts to organizations" 
      activeSection="payouts"
    >
      <div className="mb-[var(--space-lg)] flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-md)]">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-64 bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <CurrencyIndicatorBadge className="bg-muted border-border text-muted-foreground" data-testid="badge-payout-currency" />
      </div>

      {payouts.length === 0 ? (
        <Card className="bg-card border-border" data-testid="empty-payouts">
          <CardContent className="py-[var(--space-3xl)] text-center">
            <DollarSign className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-[var(--space-md)] text-muted-foreground/30" />
            <p className="text-muted-foreground text-[length:var(--text-lg)]" data-testid="empty-payouts-message">No payouts found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-[var(--space-md)]">
          {payouts.map((payout) => {
            const isExpanded = expandedPayout === payout.id;
            const statusVariant: Record<Payout['status'], 'warning' | 'success' | 'destructive'> = {
              pending: 'warning',
              paid: 'success',
              cancelled: 'destructive',
            };

            return (
              <Card
                key={payout.id}
                className="bg-card border-border hover:bg-muted transition-all duration-200"
                data-testid={`payout-card-${payout.id}`}
              >
                <CardHeader className="pb-3 p-[var(--card-padding)]">
                  <Button type="button" variant="ghost" onClick={() => toggleExpand(payout.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`payout-panel-${payout.id}`}
                    className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-[var(--space-md)] w-full">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-[length:var(--text-lg)] text-foreground mb-2 break-words" data-testid={`payout-org-${payout.id}`}>
                        {payout.organizationName}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-[var(--space-sm)] text-[length:var(--text-sm)] text-muted-foreground">
                        <span className="flex items-center gap-1" data-testid={`payout-period-${payout.id}`}>
                          <Calendar className="h-4 w-4 flex-shrink-0" />
                          <span className="whitespace-nowrap">{formatDate(payout.periodStart)} - {formatDate(payout.periodEnd)}</span>
                        </span>
                        <Badge variant={statusVariant[payout.status]} data-testid={`payout-status-${payout.id}`}>
                          {payout.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-[var(--space-sm)] sm:flex-col sm:items-end w-full sm:w-auto">
                      <div className="flex-1 sm:text-right">
                        <CurrencyConversionTooltip amount={payout.netAmount} fromCurrency={payout.currency as CurrencyCode}>
                          <p className="text-foreground text-[length:var(--text-2xl)] font-bold" data-testid={`payout-amount-${payout.id}`}>
                            {formatPrice(payout.netAmount, payout.currency as CurrencyCode)}
                          </p>
                        </CurrencyConversionTooltip>
                        <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid={`payout-course-count-${payout.id}`}>{payout.courseCount} courses</p>
                      </div>
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                  </Button>
                </CardHeader>

                {isExpanded && (
                  <>
                    <Separator className="bg-border" />
                    <CardContent id={`payout-panel-${payout.id}`} className="pt-[var(--space-md)] p-[var(--card-padding)]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)] mb-[var(--space-md)]">
                        <div className="bg-muted p-[var(--card-padding)] rounded-lg border border-border">
                          <p className="text-muted-foreground text-[length:var(--text-sm)] mb-1">Gross Revenue</p>
                          <CurrencyConversionTooltip amount={payout.grossRevenue} fromCurrency={payout.currency as CurrencyCode}>
                            <p className="text-foreground text-[length:var(--text-xl)] font-semibold" data-testid={`payout-gross-revenue-${payout.id}`}>
                              {formatPrice(payout.grossRevenue, payout.currency as CurrencyCode)}
                            </p>
                          </CurrencyConversionTooltip>
                        </div>
                        <div className="bg-muted p-[var(--card-padding)] rounded-lg border border-border">
                          <p className="text-muted-foreground text-[length:var(--text-sm)] mb-1">Platform Commission</p>
                          <CurrencyConversionTooltip amount={payout.platformCommission} fromCurrency={payout.currency as CurrencyCode}>
                            <p className="text-foreground text-[length:var(--text-xl)] font-semibold" data-testid={`payout-commission-${payout.id}`}>
                              {formatPrice(payout.platformCommission, payout.currency as CurrencyCode)}
                            </p>
                          </CurrencyConversionTooltip>
                        </div>
                        <div className="bg-success/15 p-[var(--card-padding)] rounded-lg border border-[var(--success)]/30 sm:col-span-2 lg:col-span-1">
                          <p className="text-success text-[length:var(--text-sm)] mb-1">Net Payout</p>
                          <CurrencyConversionTooltip amount={payout.netAmount} fromCurrency={payout.currency as CurrencyCode}>
                            <p className="text-foreground text-[length:var(--text-xl)] font-semibold" data-testid={`payout-net-amount-${payout.id}`}>
                              {formatPrice(payout.netAmount, payout.currency as CurrencyCode)}
                            </p>
                          </CurrencyConversionTooltip>
                        </div>
                      </div>

                      {payout.status === 'paid' && payout.paidAt && (
                        <div className="bg-muted p-[var(--card-padding)] rounded-lg border border-border mb-[var(--space-md)]" data-testid={`payout-payment-details-${payout.id}`}>
                          <p className="text-muted-foreground text-[length:var(--text-sm)] mb-1">Payment Details</p>
                          <p className="text-foreground text-[length:var(--text-sm)]" data-testid={`payout-paid-date-${payout.id}`}>
                            Paid on {formatDate(payout.paidAt)}
                          </p>
                          {payout.paymentReference && (
                            <p className="text-muted-foreground text-xs font-mono mt-1 break-all" data-testid={`payout-payment-ref-${payout.id}`}>
                              Ref: {payout.paymentReference}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-[var(--space-sm)]">
                        {payout.status === 'pending' && (
                          <Button onClick={() => {
                              const ref = prompt('Enter payment reference:');
                              if (ref) {
                                markPaidMutation.mutate({ payoutId: payout.id, paymentRef: ref });
                              }
                            }}
                            disabled={markPaidMutation.isPending}
                            className="bg-success hover:bg-success/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
                            data-testid={`button-mark-paid-${payout.id}`}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Mark as Paid
                          </Button>
                        )}
                        <Button variant="outline" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-download-invoice-${payout.id}`} >
                          <Download className="h-4 w-4 mr-2" />
                          Download Invoice
                        </Button>
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </QuizAdminLayout>
  );
}
