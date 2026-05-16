import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAdminCurrencyToggle, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { AdminCurrencyToggle } from '@/components/AdminCurrencyToggle';
import { CurrencyIndicatorBadge } from '@/components/CurrencyIndicatorBadge';
import { tzFormat } from '@/utils/timezoneRuntime';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
  BarChart3,
  Building2,
  FileText,
  Plus,
  Download,
  RefreshCw,
  Search,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  ShoppingCart,
  Key,
  Receipt,
  Minus,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';


interface OverviewData {
  period: { start: string; end: string; type: string };
  kpis: {
    grossRevenue: string;
    totalCosts: string;
    netProfit: string;
    profitMargin: string;
    platformCommission: string;
    transactionCount: number;
  };
  changes: {
    revenueChange: string;
    costChange: string;
    profitChange: string;
    transactionCountChange: string;
  };
  breakdown: Record<string, { amount: string; count: number }>;
}

interface RevenueStream {
  id: string;
  sourceType: string;
  sourceId: string;
  organizationId: string | null;
  userId: string | null;
  grossAmount: string;
  netAmount: string;
  platformCommission: string;
  processingFee: string;
  currency: string;
  normalizedAmountZAR: string;
  recordedAt: string;
  metadata: Record<string, any> | null;
}

interface CostEntry {
  id: string;
  categoryId: string;
  organizationId: string | null;
  description: string;
  amount: string;
  currency: string;
  normalizedAmountZAR: string;
  recurrence: string;
  effectiveDate: string;
  endDate: string | null;
  isAutomated: boolean;
  createdBy: string;
  createdAt: string;
}

interface CostCategory {
  id: string;
  name: string;
  type: string;
  displayOrder: number;
}

interface OrgAnalytics {
  organizationId: string | null;
  organizationName: string;
  grossRevenue: string;
  platformCommission: string;
  totalCosts: string;
  netProfit: string;
  profitMargin: string;
  transactionCount: number;
}

const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: typeof DollarSign; color: string }> = {
  course_purchase: { label: 'Course Purchase', icon: ShoppingCart, color: 'text-chart-1' },
  credit_purchase: { label: 'Credit Purchase', icon: CreditCard, color: 'text-chart-2' },
  license_purchase: { label: 'License Purchase', icon: Key, color: 'text-chart-3' },
  subscription_payment: { label: 'Subscription', icon: Receipt, color: 'text-warning' },
  yoco_settlement: { label: 'YOCO Settlement', icon: DollarSign, color: 'text-chart-4' },
  chargeback: { label: 'Chargeback', icon: TrendingDown, color: 'text-destructive' },
  sponsorship: { label: 'Sponsorship', icon: Building2, color: 'text-chart-5' },
  manual_entry: { label: 'Manual Entry', icon: FileText, color: 'text-muted-foreground' },
};

function formatPercentChange(change: string): { text: string; isPositive: boolean } {
  const num = parseFloat(change);
  const isPositive = num >= 0;
  return { text: `${isPositive ? '+' : ''}${num.toFixed(1)}%`, isPositive };
}

export default function PlatformRevenueReports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  
  const {
    showPlatformCurrency,
    setShowPlatformCurrency,
    activeCurrency,
    displayCurrency,
    formatPrice,
  } = useAdminCurrencyToggle(true);
  const { formatPrice: formatUserPrice } = useCurrencyPreference();

  const [revenueFilters, setRevenueFilters] = useState({
    sourceType: 'all',
    page: 1,
    limit: 20,
  });
  const [costFilters, setCostFilters] = useState({
    categoryId: 'all',
    page: 1,
    limit: 20,
  });
  const [orgLimit, setOrgLimit] = useState(10);

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ['/api/admin/platform-revenue/overview'],
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<{
    data: RevenueStream[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ['/api/admin/platform-revenue/streams', revenueFilters],
    enabled: activeTab === 'revenue',
  });

  const { data: costsData, isLoading: costsLoading } = useQuery<{
    data: CostEntry[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ['/api/admin/platform-revenue/costs', costFilters],
    enabled: activeTab === 'costs',
  });

  const { data: categories } = useQuery<CostCategory[]>({
    queryKey: ['/api/admin/platform-revenue/costs/categories'],
    enabled: activeTab === 'costs',
  });

  const { data: costSummary } = useQuery<Array<{
    categoryId: string;
    categoryName: string;
    categoryType: string;
    totalAmount: string;
    entryCount: number;
  }>>({
    queryKey: ['/api/admin/platform-revenue/costs/summary'],
    enabled: activeTab === 'costs',
  });

  const { data: orgAnalytics, isLoading: orgLoading } = useQuery<{
    period: { start: string; end: string };
    data: OrgAnalytics[];
  }>({
    queryKey: ['/api/admin/platform-revenue/org-analytics', { limit: orgLimit }],
    enabled: activeTab === 'organizations',
  });

  const generateSnapshotMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/platform-revenue/snapshots/generate', {
        method: 'POST',
        body: JSON.stringify({ periodType: 'monthly' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-revenue'] });
      toast({ title: 'Snapshot generated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to generate snapshot', variant: 'destructive' });
    },
  });

  return (
    <QuizAdminLayout 
      title="Platform Revenue Reports" 
      description="Financial intelligence and revenue analytics"
      activeSection="platform-revenue"
    >
      <div className="space-y-[var(--space-lg)] p-[var(--container-padding)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
          <div className="flex items-center gap-[var(--space-md)]">
            <div className="p-2 rounded-lg bg-surface-raised border border-primary/30">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-[length:var(--text-2xl)] font-bold text-foreground">Revenue Reports</h1>
              <p className="text-sm text-muted-foreground">Track platform income across all sources</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-sm)]">
            <AdminCurrencyToggle
              showPlatformCurrency={showPlatformCurrency}
              onToggle={setShowPlatformCurrency}
              userCurrency={displayCurrency}
              compact={true}
              className="order-2 sm:order-1"
            />
            <Button variant="outline" onClick={() => generateSnapshotMutation.mutate()}
              disabled={generateSnapshotMutation.isPending}
              className="bg-transparent border-border text-muted-foreground hover:bg-muted/50 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="button-generate-snapshot"
            >
              {generateSnapshotMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Generate Snapshot
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[var(--space-md)]">
          <TabsList className="bg-card border border-border flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview" data-testid="tab-overview" className="min-h-[44px] touch-manipulation px-2 sm:px-4">
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="revenue" data-testid="tab-revenue" className="min-h-[44px] touch-manipulation px-2 sm:px-4">
              <DollarSign className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Revenue Streams</span>
            </TabsTrigger>
            <TabsTrigger value="costs" data-testid="tab-costs" className="min-h-[44px] touch-manipulation px-2 sm:px-4">
              <Wallet className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Costs</span>
            </TabsTrigger>
            <TabsTrigger value="organizations" data-testid="tab-organizations" className="min-h-[44px] touch-manipulation px-2 sm:px-4">
              <Building2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Organization Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-[var(--space-lg)]">
            <div className="flex justify-end">
              <CurrencyIndicatorBadge currency={activeCurrency} data-testid="badge-currency-overview" />
            </div>
            {overviewLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--space-md)]">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-32 bg-muted/50" />
                ))}
              </div>
            ) : overview && (parseFloat(overview.kpis.grossRevenue) > 0 || parseFloat(overview.kpis.totalCosts) > 0) ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--space-md)]">
                  <Card className="bg-card border-border" data-testid="card-gross-revenue">
                    <CardHeader className="p-[var(--card-padding)] pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-[var(--space-sm)]">
                        <DollarSign className="w-4 h-4 text-chart-1" />
                        Gross Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <div className="text-[length:var(--text-2xl)] sm:text-3xl font-bold text-foreground" data-testid="text-gross-revenue">
                        {formatPrice(overview.kpis.grossRevenue, 'ZAR')}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {(() => {
                          const change = formatPercentChange(overview.changes.revenueChange);
                          return (
                            <>
                              {change.isPositive ? (
                                <ArrowUpRight className="w-3 h-3 text-success" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 text-destructive" />
                              )}
                              <span className={`text-xs ${change.isPositive ? 'text-success' : 'text-destructive'}`}>
                                {change.text} vs last month
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border" data-testid="card-total-costs">
                    <CardHeader className="p-[var(--card-padding)] pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-[var(--space-sm)]">
                        <Wallet className="w-4 h-4 text-destructive" />
                        Total Costs
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <div className="text-[length:var(--text-2xl)] sm:text-3xl font-bold text-foreground" data-testid="text-total-costs">
                        {formatPrice(overview.kpis.totalCosts, 'ZAR')}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {(() => {
                          const change = formatPercentChange(overview.changes.costChange);
                          const isGood = !change.isPositive;
                          return (
                            <>
                              {isGood ? (
                                <ArrowDownRight className="w-3 h-3 text-success" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3 text-destructive" />
                              )}
                              <span className={`text-xs ${isGood ? 'text-success' : 'text-destructive'}`}>
                                {change.text} vs last month
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border" data-testid="card-net-profit">
                    <CardHeader className="p-[var(--card-padding)] pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-[var(--space-sm)]">
                        <TrendingUp className="w-4 h-4 text-chart-2" />
                        Net Profit
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <div className={`text-[length:var(--text-2xl)] sm:text-3xl font-bold ${parseFloat(overview.kpis.netProfit) >= 0 ? 'text-foreground' : 'text-destructive'}`} data-testid="text-net-profit">
                        {formatPrice(overview.kpis.netProfit, 'ZAR')}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {(() => {
                          const change = formatPercentChange(overview.changes.profitChange);
                          return (
                            <>
                              {change.isPositive ? (
                                <ArrowUpRight className="w-3 h-3 text-success" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 text-destructive" />
                              )}
                              <span className={`text-xs ${change.isPositive ? 'text-success' : 'text-destructive'}`}>
                                {change.text} vs last month
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border" data-testid="card-profit-margin">
                    <CardHeader className="p-[var(--card-padding)] pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-[var(--space-sm)]">
                        <PieChart className="w-4 h-4 text-chart-3" />
                        Profit Margin
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <div className="text-[length:var(--text-2xl)] sm:text-3xl font-bold text-foreground" data-testid="text-profit-margin">
                        {overview.kpis.profitMargin}%
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {overview.kpis.transactionCount} transactions
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-card border-border">
                  <CardHeader className="p-[var(--card-padding)]">
                    <CardTitle className="text-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-lg)]">
                      <PieChart className="w-5 h-5 text-chart-1" />
                      Revenue Breakdown by Type
                    </CardTitle>
                    <CardDescription>Distribution of revenue across different sources</CardDescription>
                  </CardHeader>
                  <CardContent className="p-[var(--card-padding)] pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--space-md)]">
                      {Object.entries(overview.breakdown).map(([type, data]) => {
                        const config = SOURCE_TYPE_LABELS[type] || { label: type, icon: DollarSign, color: 'text-muted-foreground' };
                        const Icon = config.icon;
                        return (
                          <div
                            key={type}
                            className="p-[var(--card-padding)] rounded-lg bg-muted/50 border border-border hover:border-border transition-colors"
                            data-testid={`breakdown-${type}`}
                          >
                            <div className="flex items-center gap-[var(--space-sm)] mb-2">
                              <Icon className={`w-4 h-4 ${config.color}`} />
                              <span className="text-sm text-muted-foreground">{config.label}</span>
                            </div>
                            <div className="text-[length:var(--text-xl)] font-bold text-foreground">
                              {formatPrice(data.amount, 'ZAR')}
                            </div>
                            <p className="text-xs text-muted-foreground">{data.count} transactions</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-12 px-[var(--card-padding)]">
                  <div className="text-center space-y-4">
                    <div>
                      <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-foreground font-semibold text-lg mb-2">No Revenue Data Yet</p>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Revenue data will appear here once transactions are recorded. This includes course purchases, credit purchases, license purchases, and other revenue sources.
                      </p>
                    </div>
                    <div className="pt-4">
                      <p className="text-sm text-muted-foreground mb-3">
                        To get started, you can:
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-2 max-w-md mx-auto text-left">
                        <li className="flex items-start gap-2">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span>Configure your payment settings and enable payment processing</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span>Create and publish courses for organizations to purchase</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span>Set up credit purchasing options for users</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span>Configure license packages for organizational subscriptions</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="revenue" className="space-y-[var(--space-md)]">
            <Card className="bg-card border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
                  <div>
                    <CardTitle className="text-foreground text-[length:var(--text-lg)]">Revenue Streams</CardTitle>
                    <CardDescription>All revenue transactions across the platform</CardDescription>
                  </div>
                  <div className="flex gap-[var(--space-sm)]">
                    <Select
                      value={revenueFilters.sourceType}
                      onValueChange={(v) => setRevenueFilters({ ...revenueFilters, sourceType: v, page: 1 })}
                    >
                      <SelectTrigger className="w-full sm:w-48 bg-muted border-border min-h-[44px] touch-manipulation" data-testid="select-source-type">
                        <SelectValue placeholder="All Sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {Object.entries(SOURCE_TYPE_LABELS).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                {revenueLoading ? (
                  <div className="space-y-[var(--space-sm)]">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 bg-muted/50" />
                    ))}
                  </div>
                ) : revenueData?.data.length ? (
                  <>
                    <div className="space-y-[var(--space-sm)]">
                      {revenueData.data.map((stream) => {
                        const config = SOURCE_TYPE_LABELS[stream.sourceType] || { label: stream.sourceType, icon: DollarSign, color: 'text-muted-foreground' };
                        const Icon = config.icon;
                        return (
                          <div
                            key={stream.id}
                            className="p-[var(--card-padding)] rounded-lg bg-muted/50 border border-border hover:border-border transition-colors"
                            data-testid={`revenue-stream-${stream.id}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
                              <div className="flex items-center gap-[var(--space-md)]">
                                <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-[var(--space-sm)] flex-wrap">
                                    <span className="text-foreground font-medium">{config.label}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {stream.currency}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {tzFormat(stream.recordedAt, 'MMM d, yyyy HH:mm')}
                                    {stream.sourceId && ` • ${stream.sourceId.slice(0, 8)}...`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-left sm:text-right">
                                <div className="text-lg font-bold text-chart-1">
                                  {formatPrice(stream.normalizedAmountZAR, 'ZAR')}
                                </div>
                                {stream.platformCommission && parseFloat(stream.platformCommission) > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Commission: {formatPrice(stream.platformCommission, 'ZAR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {revenueData.pagination.totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)] mt-[var(--space-md)] pt-[var(--space-md)] border-t border-border">
                        <p className="text-sm text-muted-foreground text-center sm:text-left">
                          Showing {((revenueFilters.page - 1) * revenueFilters.limit) + 1} - {Math.min(revenueFilters.page * revenueFilters.limit, revenueData.pagination.total)} of {revenueData.pagination.total}
                        </p>
                        <div className="flex gap-[var(--space-sm)] justify-center sm:justify-end">
                          <Button variant="outline" disabled={revenueFilters.page === 1} onClick={() => setRevenueFilters({ ...revenueFilters, page: revenueFilters.page - 1 })}
                            className="bg-transparent border-border min-h-[44px] touch-manipulation"
                            data-testid="button-prev-revenue"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" disabled={revenueFilters.page >= revenueData.pagination.totalPages}
                            onClick={() => setRevenueFilters({ ...revenueFilters, page: revenueFilters.page + 1 })}
                            className="bg-transparent border-border min-h-[44px] touch-manipulation"
                            data-testid="button-next-revenue"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <div>
                      <p className="text-foreground font-semibold mb-2">No Revenue Streams</p>
                      <p className="text-muted-foreground max-w-md mx-auto text-sm">
                        {revenueFilters.sourceType !== 'all' 
                          ? `No transactions found for the selected source type. Try selecting "All Sources" to see all revenue types.`
                          : 'Revenue streams will appear here once transactions are processed through the platform.'}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs" className="space-y-[var(--space-md)]">
            {costSummary && costSummary.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[var(--space-md)]">
                {costSummary.map((cat) => (
                  <Card
                    key={cat.categoryId}
                    className="bg-card border-border hover:border-[var(--destructive)]/30 transition-colors cursor-pointer min-h-[44px] touch-manipulation"
                    onClick={() => setCostFilters({ ...costFilters, categoryId: cat.categoryId, page: 1 })}
                    data-testid={`cost-category-${cat.categoryId}`}
                  >
                    <CardContent className="p-[var(--card-padding)]">
                      <p className="text-sm text-muted-foreground">{cat.categoryName}</p>
                      <p className="text-[length:var(--text-xl)] font-bold text-destructive">{formatPrice(cat.totalAmount, 'ZAR')}</p>
                      <p className="text-xs text-muted-foreground">{cat.entryCount} entries</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card className="bg-card border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
                  <div>
                    <CardTitle className="text-foreground text-[length:var(--text-lg)]">Cost Entries</CardTitle>
                    <CardDescription>Platform costs and expenses</CardDescription>
                  </div>
                  <div className="flex gap-[var(--space-sm)]">
                    <Select
                      value={costFilters.categoryId}
                      onValueChange={(v) => setCostFilters({ ...costFilters, categoryId: v, page: 1 })}
                    >
                      <SelectTrigger className="w-full sm:w-48 bg-muted border-border min-h-[44px] touch-manipulation" data-testid="select-cost-category">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                {costsLoading ? (
                  <div className="space-y-[var(--space-sm)]">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 bg-muted/50" />
                    ))}
                  </div>
                ) : costsData?.data.length ? (
                  <>
                    <div className="space-y-[var(--space-sm)]">
                      {costsData.data.map((cost) => (
                        <div
                          key={cost.id}
                          className="p-[var(--card-padding)] rounded-lg bg-muted/50 border border-border hover:border-border transition-colors"
                          data-testid={`cost-entry-${cost.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
                            <div className="flex items-center gap-[var(--space-md)]">
                              <div className="p-2 rounded-lg bg-destructive/20">
                                <Minus className="w-4 h-4 text-destructive" />
                              </div>
                              <div>
                                <span className="text-foreground font-medium">{cost.description}</span>
                                <p className="text-xs text-muted-foreground flex flex-wrap gap-1 items-center mt-1">
                                  {cost.effectiveDate}
                                  {cost.recurrence !== 'one_time' && (
                                    <Badge variant="outline" className="text-xs">
                                      {cost.recurrence}
                                    </Badge>
                                  )}
                                  {cost.isAutomated && (
                                    <Badge variant="secondary" className="text-xs">Auto</Badge>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="text-left sm:text-right">
                              <div className="text-lg font-bold text-destructive">
                                -{formatPrice(cost.normalizedAmountZAR, 'ZAR')}
                              </div>
                              {cost.currency !== 'ZAR' && (
                                <p className="text-xs text-muted-foreground">
                                  {formatPrice(cost.amount, cost.currency as CurrencyCode)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {costsData.pagination.totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)] mt-[var(--space-md)] pt-[var(--space-md)] border-t border-border">
                        <p className="text-sm text-muted-foreground text-center sm:text-left">
                          Showing {((costFilters.page - 1) * costFilters.limit) + 1} - {Math.min(costFilters.page * costFilters.limit, costsData.pagination.total)} of {costsData.pagination.total}
                        </p>
                        <div className="flex gap-[var(--space-sm)] justify-center sm:justify-end">
                          <Button variant="outline" disabled={costFilters.page === 1} onClick={() => setCostFilters({ ...costFilters, page: costFilters.page - 1 })}
                            className="bg-transparent border-border min-h-[44px] touch-manipulation"
                            data-testid="button-prev-costs"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" disabled={costFilters.page >= costsData.pagination.totalPages}
                            onClick={() => setCostFilters({ ...costFilters, page: costFilters.page + 1 })}
                            className="bg-transparent border-border min-h-[44px] touch-manipulation"
                            data-testid="button-next-costs"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <div>
                      <p className="text-foreground font-semibold mb-2">No Cost Entries</p>
                      <p className="text-muted-foreground max-w-md mx-auto text-sm mb-4">
                        {costFilters.categoryId !== 'all' 
                          ? `No cost entries found for the selected category. Try selecting "All Categories" to see all costs.`
                          : 'Cost entries will appear here once they are added. Track platform expenses like infrastructure, payment processing, and other operational costs.'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        💡 Tip: Add costs through the SuperAdmin dashboard under "Platform Costs Management"
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="organizations" className="space-y-[var(--space-md)]">
            <Card className="bg-card border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
                  <div>
                    <CardTitle className="text-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-lg)]">
                      <Building2 className="w-5 h-5 text-chart-1" />
                      Organization Performance
                    </CardTitle>
                    <CardDescription>Revenue and profitability by organization</CardDescription>
                  </div>
                  <Select
                    value={orgLimit.toString()}
                    onValueChange={(v) => setOrgLimit(parseInt(v))}
                  >
                    <SelectTrigger className="w-full sm:w-32 bg-muted border-border min-h-[44px] touch-manipulation" data-testid="select-org-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">Top 10</SelectItem>
                      <SelectItem value="20">Top 20</SelectItem>
                      <SelectItem value="50">Top 50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                {orgLoading ? (
                  <div className="space-y-[var(--space-sm)]">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-20 bg-muted/50" />
                    ))}
                  </div>
                ) : orgAnalytics?.data.length ? (
                  <div className="space-y-[var(--space-md)]">
                    {orgAnalytics.data.map((org, index) => {
                      const profit = parseFloat(org.netProfit);
                      const isProfitable = profit >= 0;
                      return (
                        <div
                          key={org.organizationId || 'platform'}
                          className="p-[var(--card-padding)] rounded-lg bg-muted/50 border border-border hover:border-border transition-colors"
                          data-testid={`org-analytics-${org.organizationId || 'platform'}`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-[var(--space-md)]">
                            <div className="flex items-center gap-[var(--space-md)]">
                              <div className="w-8 h-8 rounded-full bg-[var(--chart-1)]/20 flex items-center justify-center text-chart-1 font-bold flex-shrink-0">
                                {index + 1}
                              </div>
                              <div>
                                <span className="text-foreground font-medium">{org.organizationName}</span>
                                <p className="text-xs text-muted-foreground">
                                  {org.transactionCount} transactions
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-md)] mt-[var(--space-sm)] lg:mt-0">
                              <div className="text-left sm:text-right">
                                <p className="text-xs text-muted-foreground">Revenue</p>
                                <p className="text-base sm:text-lg font-bold text-chart-1">
                                  {formatPrice(org.grossRevenue, 'ZAR')}
                                </p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-xs text-muted-foreground">Costs</p>
                                <p className="text-base sm:text-lg font-bold text-destructive">
                                  {formatPrice(org.totalCosts, 'ZAR')}
                                </p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-xs text-muted-foreground">Net Profit</p>
                                <p className={`text-base sm:text-lg font-bold ${isProfitable ? 'text-success' : 'text-destructive'}`}>
                                  {formatPrice(org.netProfit, 'ZAR')}
                                </p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-xs text-muted-foreground">Margin</p>
                                <Badge variant={isProfitable ? 'default' : 'destructive'} className={isProfitable ? 'bg-success/20 text-success' : ''} >
                                  {org.profitMargin}%
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No organization data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </QuizAdminLayout>
  );
}
