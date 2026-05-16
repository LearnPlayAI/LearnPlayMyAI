import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DollarSign, RefreshCw, Edit, History, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useUser } from '@/hooks/use-user';
import { useIsMobile } from '@/hooks/use-mobile';

type CurrencyRate = {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  source: 'auto' | 'manual';
  lastUpdated: string;
  updatedBy?: string | null;
  isActive: boolean;
};

type RateHistory = {
  timestamp: string;
  rate: string;
  source: 'api' | 'manual';
};

export default function CurrencyManagement() {
  const { user } = useUser();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [expandedCurrency, setExpandedCurrency] = useState<string | null>(null);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyRate | null>(null);
  const [manualRate, setManualRate] = useState<string>('');

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  const { data: rates, isLoading } = useQuery<CurrencyRate[]>({
    queryKey: ['/api/superadmin/currency/rates'],
    enabled: isAuthenticated && isSuperAdmin,
  });

  const getCurrencyKey = (currency: CurrencyRate) => 
    `${currency.baseCurrency}-${currency.targetCurrency}`;

  const getExpandedCurrencyPair = () => {
    if (!expandedCurrency || !rates) return null;
    return rates.find(r => getCurrencyKey(r) === expandedCurrency);
  };

  const { data: history } = useQuery<RateHistory[]>({
    queryKey: ['/api/superadmin/currency/history', expandedCurrency],
    queryFn: async () => {
      const currencyPair = getExpandedCurrencyPair();
      if (!currencyPair) return [];

      const response = await fetch(`/api/superadmin/currency/history?baseCurrency=${currencyPair.baseCurrency}&targetCurrency=${currencyPair.targetCurrency}`);
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    },
    enabled: !!expandedCurrency && !!rates,
  });

  const updateRateMutation = useMutation({
    mutationFn: async ({ targetCurrency, baseCurrency, rate }: { targetCurrency: string; baseCurrency: string; rate: string }) => {
      return await apiRequest(`/api/superadmin/currency/rates/${targetCurrency}/override`, {
        method: 'PUT',
        body: JSON.stringify({ baseCurrency, rate, reason: 'Manual override via admin UI' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/currency/rates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/currency/history'] });
      setEditingCurrency(null);
      setManualRate('');
      toast({
        title: 'Success',
        description: 'Currency rate updated',
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

  const refreshRatesMutation = useMutation({
    mutationFn: async (): Promise<{ summary?: string; refreshResult?: { updated: number; changed: number; unchanged: number } }> => {
      return await apiRequest('/api/superadmin/currency-rates/refresh', {
        method: 'POST',
      });
    },
    onSuccess: (result) => {
      // Invalidate all currency-related queries to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/currency/rates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/currency/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/currency/rates'] });
      toast({
        title: 'Success',
        description: result?.summary || 'Exchange rates refreshed from API',
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

  const toggleExpand = (code: string) => {
    setExpandedCurrency(expandedCurrency === code ? null : code);
  };

  const currencyNames: Record<string, string> = {
    ZAR: 'South African Rand',
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'British Pound',
  };

  const startEdit = (currency: CurrencyRate) => {
    setEditingCurrency(currency);
    setManualRate(currency.rate);
  };

  const saveEdit = () => {
    if (!editingCurrency) return;
    if (!manualRate || parseFloat(manualRate) <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid rate',
        variant: 'destructive',
      });
      return;
    }
    updateRateMutation.mutate({ 
      targetCurrency: editingCurrency.targetCurrency, 
      baseCurrency: editingCurrency.baseCurrency, 
      rate: manualRate 
    });
  };

  if (!isSuperAdmin) {
    return null;
  }

  if (isLoading || adminLoading) {
    return (
      <QuizAdminLayout title="Currency Management" description="Manage exchange rates and currency settings" activeSection="currency">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <QuizAdminLayout title="Currency Management" description="Manage exchange rates and currency settings" activeSection="currency">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2 text-foreground drop-shadow-elevated flex items-center gap-3" data-testid="page-title">
            <DollarSign className="h-10 w-10" />
            Currency Management
          </h1>
          <p className="text-muted-foreground text-lg" data-testid="page-description">
            Manage exchange rates and currency conversion settings
          </p>
        </div>
        <Button onClick={() => refreshRatesMutation.mutate()}
          disabled={refreshRatesMutation.isPending}
          className="bg-primary hover:bg-primary/90"
          data-testid="button-refresh-rates"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshRatesMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh Rates
        </Button>
      </div>

      <div className="space-y-4">
          {rates?.map((currency) => {
            const currencyKey = getCurrencyKey(currency);
            const isExpanded = expandedCurrency === currencyKey;
            const isEditing = editingCurrency?.id === currency.id;
            const isManualOverride = currency.source === 'manual';
            const displayName = `${currency.baseCurrency}/${currency.targetCurrency}`;

            return (
              <Card
                key={currencyKey}
                className="bg-card border-border hover:bg-muted transition-all duration-200"
                data-testid={`currency-card-${currencyKey}`}
              >
                <CardHeader className="pb-3">
                  <Button type="button" variant="ghost" onClick={() => !isEditing && toggleExpand(currencyKey)}
                    aria-expanded={isExpanded}
                    aria-controls={`currency-panel-${currencyKey}`}
                    className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={isEditing}
                  >
                  <div className="flex items-start justify-between gap-4 w-full">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg text-foreground" data-testid={`currency-name-${currencyKey}`}>
                          {displayName} - {currencyNames[currency.targetCurrency] || currency.targetCurrency}
                        </CardTitle>
                        {isManualOverride && (
                          <Badge variant="warning" data-testid={`currency-manual-badge-${currencyKey}`}>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Manual Override
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-muted-foreground" data-testid={`currency-last-updated-${currencyKey}`}>
                        Last updated: {new Date(currency.lastUpdated).toLocaleString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-foreground text-2xl font-bold" data-testid={`currency-rate-${currencyKey}`}>
                          {parseFloat(currency.rate).toFixed(4)}
                        </p>
                        <p className="text-muted-foreground text-xs">per {currency.baseCurrency}</p>
                      </div>
                      {!isEditing && (isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ))}
                    </div>
                  </div>
                  </Button>
                </CardHeader>

                {isExpanded && (
                  <>
                    <Separator className="bg-border" />
                    <CardContent id={`currency-panel-${currencyKey}`} className="pt-4">
                      {isEditing ? (
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor={`rate-${currencyKey}`} className="text-foreground">
                              Exchange Rate (per {currency.baseCurrency})
                            </Label>
                            <Input
                              id={`rate-${currencyKey}`}
                              type="number"
                              step="0.0001"
                              value={manualRate}
                              onChange={(e) => setManualRate(e.target.value)}
                              className="bg-muted border-border text-foreground mt-2"
                              data-testid={`input-rate-${currencyKey}`}
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button onClick={() => saveEdit()}
                              disabled={updateRateMutation.isPending}
                              className="bg-success hover:bg-success/90"
                              data-testid={`button-save-${currencyKey}`}
                            >
                              Save
                            </Button>
                            <Button variant="outline" onClick={() => {
                                setEditingCurrency(null);
                                setManualRate('');
                              }}
                              className="bg-muted border-border text-foreground hover:bg-muted/80"
                              data-testid={`button-cancel-${currencyKey}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mb-4">
                            <Button variant="outline" onClick={() => startEdit(currency)}
                              className="bg-muted border-border text-foreground hover:bg-muted/80"
                              data-testid={`button-edit-${currencyKey}`}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Set Manual Rate
                            </Button>
                          </div>

                          {history && history.length > 0 && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 text-foreground">
                                <History className="h-4 w-4" />
                                <h4 className="font-semibold">Rate History</h4>
                              </div>
                              <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
                                <LineChart 
                                  data={history}
                                  margin={{ top: 5, right: isMobile ? 5 : 15, left: isMobile ? -5 : 0, bottom: 5 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                  <XAxis
                                    dataKey="timestamp"
                                    stroke="var(--chart-axis)"
                                    tick={{ fontSize: isMobile ? 9 : 12 }}
                                    tickMargin={isMobile ? 5 : 8}
                                    interval={isMobile ? 'preserveStartEnd' : 0}
                                  />
                                  <YAxis
                                    stroke="var(--chart-axis)"
                                    domain={['dataMin - 0.1', 'dataMax + 0.1']}
                                    tick={{ fontSize: isMobile ? 9 : 12 }}
                                    width={isMobile ? 45 : 55}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: 'var(--surface-overlay)',
                                      border: '1px solid var(--stroke-default)',
                                      borderRadius: '8px',
                                      color: 'var(--text-primary)',
                                      padding: isMobile ? '8px 12px' : '6px 10px',
                                    }}
                                    wrapperStyle={{ touchAction: 'none' }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="rate"
                                    stroke="var(--chart-1)"
                                    strokeWidth={2}
                                    activeDot={{ r: isMobile ? 6 : 4, strokeWidth: 2 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
      </div>
    </QuizAdminLayout>
  );
}
