import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { AdminCurrencyToggle } from '@/components/AdminCurrencyToggle';
import { useAdminCurrencyToggle, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  CreditCard,
  Coins,
  Flame,
  Calendar,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Zap,
  Star,
} from 'lucide-react';
import { subDays, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { tzFormat } from '@/utils/timezoneRuntime';

interface RevenueStats {
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  costs: number;
  netProfit: number;
  marginPercent: number;
  orderCount: number;
  refundCount: number;
  averageOrderValue: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
}

interface CostStats {
  monthlyBurn: string;
  ytdCosts: string;
  activeRecurring: number;
}

interface SpendStats {
  totalSpent: number;
  totalTransactions: number;
  averageSpendPerTransaction: number;
  topFeatures: Array<{
    feature: string;
    totalSpent: number;
    count: number;
  }>;
  byOrganization: Array<{
    organizationId: string;
    organizationName: string;
    totalSpent: number;
  }>;
  periodStart: string | null;
  periodEnd: string | null;
}

interface RevenueTimeSeries {
  date: string;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  costs: number;
  netProfit: number;
  orderCount: number;
}

interface OrderTransaction {
  id: string;
  purchaserId: string;
  purchaserName: string;
  purchaserEmail: string;
  organizationId: string | null;
  organizationName: string | null;
  amount: number;
  amountZAR: number;
  currency: string;
  creditsAmount: number;
  status: string;
  packageName: string | null;
  createdAt: string;
}

interface OrdersResponse {
  orders: OrderTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

export function LPCAnalyticsDashboard() {
  const [startDate, setStartDate] = useState(() => tzFormat(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => tzFormat(new Date(), 'yyyy-MM-dd'));
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersLimit = 20;

  const {
    formatPrice,
    showPlatformCurrency,
    setShowPlatformCurrency,
    displayCurrency,
  } = useAdminCurrencyToggle(true);

  const buildQueryParams = (extraParams: Record<string, string | number> = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (selectedOrgId && selectedOrgId !== 'all') params.set('organizationId', selectedOrgId);
    if (showPlatformCurrency) {
      params.set('currency', 'ZAR');
    } else {
      params.set('currency', displayCurrency);
    }
    Object.entries(extraParams).forEach(([key, value]) => {
      params.set(key, String(value));
    });
    return params.toString();
  };

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
  });

  const { data: revenueStats, isLoading: revenueLoading, error: revenueError } = useQuery<RevenueStats>({
    queryKey: ['/api/admin/lpc/revenue/stats', startDate, endDate, selectedOrgId, showPlatformCurrency, displayCurrency],
    queryFn: async () => {
      const res = await fetch(`/api/admin/lpc/revenue/stats?${buildQueryParams()}`);
      if (!res.ok) throw new Error('Failed to fetch revenue stats');
      return res.json();
    },
  });

  const { data: costStats, isLoading: costsLoading, error: costsError } = useQuery<CostStats>({
    queryKey: ['/api/admin/platform-costs/stats'],
  });

  const { data: spendStats, isLoading: spendLoading, error: spendError } = useQuery<SpendStats>({
    queryKey: ['/api/admin/lpc/spend/stats', startDate, endDate, selectedOrgId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/lpc/spend/stats?${buildQueryParams()}`);
      if (!res.ok) throw new Error('Failed to fetch spend stats');
      return res.json();
    },
  });

  const { data: timeSeries, isLoading: timeSeriesLoading } = useQuery<RevenueTimeSeries[]>({
    queryKey: ['/api/admin/lpc/revenue/time-series', startDate, endDate, selectedOrgId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/lpc/revenue/time-series?${buildQueryParams()}`);
      if (!res.ok) throw new Error('Failed to fetch time series');
      return res.json();
    },
  });

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery<OrdersResponse>({
    queryKey: ['/api/admin/lpc/revenue/orders', ordersPage, ordersLimit, startDate, endDate, selectedOrgId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/lpc/revenue/orders?${buildQueryParams({ page: ordersPage, limit: ordersLimit })}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const revenueStatItems: StatItem[] = useMemo(() => {
    if (!revenueStats) return [];
    return [
      {
        label: 'Gross Revenue',
        value: formatPrice(revenueStats.grossRevenue, revenueStats.currency as CurrencyCode),
        icon: DollarSign,
      },
      {
        label: 'Net Revenue',
        value: formatPrice(revenueStats.netRevenue, revenueStats.currency as CurrencyCode),
        icon: TrendingUp,
      },
      {
        label: 'Net Profit',
        value: formatPrice(revenueStats.netProfit, revenueStats.currency as CurrencyCode),
        icon: revenueStats.netProfit >= 0 ? TrendingUp : TrendingDown,
      },
      {
        label: 'Margin %',
        value: `${revenueStats.marginPercent.toFixed(1)}%`,
        icon: Percent,
      },
      {
        label: 'Credits Sold',
        value: revenueStats.orderCount.toLocaleString(),
        icon: Coins,
      },
      {
        label: 'Avg Order Value',
        value: formatPrice(revenueStats.averageOrderValue, revenueStats.currency as CurrencyCode),
        icon: CreditCard,
      },
    ];
  }, [revenueStats, formatPrice]);

  const costStatItems: StatItem[] = useMemo(() => {
    if (!costStats) return [];
    return [
      {
        label: 'Monthly Burn',
        value: formatPrice(parseFloat(costStats.monthlyBurn), 'ZAR'),
        icon: Flame,
      },
      {
        label: 'YTD Costs',
        value: formatPrice(parseFloat(costStats.ytdCosts), 'ZAR'),
        icon: Calendar,
      },
      {
        label: 'Active Recurring',
        value: costStats.activeRecurring.toLocaleString(),
        icon: RefreshCw,
      },
    ];
  }, [costStats, formatPrice]);

  const spendStatItems: StatItem[] = useMemo(() => {
    if (!spendStats) return [];
    const topFeature = spendStats.topFeatures?.[0];
    return [
      {
        label: 'Total Credits Spent',
        value: spendStats.totalSpent.toLocaleString(),
        icon: Zap,
      },
      {
        label: 'Top Feature',
        value: topFeature ? `${formatFeatureName(topFeature.feature)} (${topFeature.totalSpent})` : 'N/A',
        icon: Star,
      },
    ];
  }, [spendStats]);

  const chartData = useMemo(() => {
    if (!timeSeries) return [];
    return timeSeries.map((item) => ({
      ...item,
      date: tzFormat(item.date, 'MMM dd'),
    }));
  }, [timeSeries]);

  const orderColumns: Column<OrderTransaction>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (order) => tzFormat(order.createdAt, 'MMM dd, yyyy HH:mm'),
    },
    {
      key: 'purchaserName',
      header: 'Purchaser',
      mobileLabel: 'User',
      sortable: true,
    },
    {
      key: 'organizationName',
      header: 'Organization',
      sortable: true,
      render: (order) => order.organizationName || 'Individual',
    },
    {
      key: 'packageName',
      header: 'Package',
      sortable: true,
      render: (order) => order.packageName || 'Custom',
    },
    {
      key: 'creditsAmount',
      header: 'Credits',
      sortable: true,
      render: (order) => order.creditsAmount.toLocaleString(),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      render: (order) => formatPrice(order.amount, order.currency as CurrencyCode),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (order) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            order.status === 'succeeded' || order.status === 'pending_receipt'
              ? 'bg-success/15 text-success dark:bg-success/20 dark:text-success/90'
              : order.status === 'refunded'
              ? 'bg-destructive/15 text-destructive dark:bg-destructive/20 dark:text-[var(--destructive)]/90'
              : 'bg-warning/15 text-warning dark:bg-warning/20 dark:text-warning/90'
          }`}
        >
          {order.status}
        </span>
      ),
    },
  ];

  const handleExportCSV = () => {
    if (!ordersData?.orders?.length) return;

    const headers = ['Date', 'Purchaser', 'Email', 'Organization', 'Package', 'Credits', 'Amount', 'Currency', 'Status'];
    const rows = ordersData.orders.map((order) => [
      tzFormat(order.createdAt, 'yyyy-MM-dd HH:mm:ss'),
      order.purchaserName,
      order.purchaserEmail,
      order.organizationName || 'Individual',
      order.packageName || 'Custom',
      order.creditsAmount,
      order.amount,
      order.currency,
      order.status,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lpc-transactions-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handlePrevPage = () => {
    if (ordersPage > 1) setOrdersPage(ordersPage - 1);
  };

  const handleNextPage = () => {
    if (ordersData && ordersPage < ordersData.totalPages) setOrdersPage(ordersPage + 1);
  };

  const setDatePreset = (preset: 'today' | 'week' | 'month' | 'year') => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setStartDate(tzFormat(now, 'yyyy-MM-dd'));
        setEndDate(tzFormat(now, 'yyyy-MM-dd'));
        break;
      case 'week':
        setStartDate(tzFormat(subDays(now, 7), 'yyyy-MM-dd'));
        setEndDate(tzFormat(now, 'yyyy-MM-dd'));
        break;
      case 'month':
        setStartDate(tzFormat(startOfMonth(now), 'yyyy-MM-dd'));
        setEndDate(tzFormat(endOfMonth(now), 'yyyy-MM-dd'));
        break;
      case 'year':
        setStartDate(tzFormat(startOfYear(now), 'yyyy-MM-dd'));
        setEndDate(tzFormat(now, 'yyyy-MM-dd'));
        break;
    }
    setOrdersPage(1);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setOrdersPage(1);
                }}
                className="w-40"
                data-testid="input-start-date"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setOrdersPage(1);
                }}
                className="w-40"
                data-testid="input-end-date"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Quick Select</Label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setDatePreset('today')}
                  data-testid="button-preset-today"
                >
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDatePreset('week')}
                  data-testid="button-preset-week"
                >
                  7 Days
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDatePreset('month')}
                  data-testid="button-preset-month"
                >
                  Month
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDatePreset('year')}
                  data-testid="button-preset-year"
                >
                  YTD
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-select">Organization</Label>
              <Select
                value={selectedOrgId}
                onValueChange={(value) => {
                  setSelectedOrgId(value);
                  setOrdersPage(1);
                }}
              >
                <SelectTrigger className="w-48" data-testid="select-organization">
                  <SelectValue placeholder="All Organizations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Currency</Label>
              <AdminCurrencyToggle
                showPlatformCurrency={showPlatformCurrency}
                onToggle={setShowPlatformCurrency}
                userCurrency={displayCurrency}
                compact
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Revenue Stats</h3>
        {revenueError ? (
          <Card className="p-4">
            <p className="text-destructive">Failed to load revenue stats. Please try again.</p>
          </Card>
        ) : (
          <StatsGrid stats={revenueStatItems} isLoading={revenueLoading} columns={3} />
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Platform Costs</h3>
        {costsError ? (
          <Card className="p-4">
            <p className="text-destructive">Failed to load cost stats. Please try again.</p>
          </Card>
        ) : (
          <StatsGrid stats={costStatItems} isLoading={costsLoading} columns={3} />
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Credit Spend</h3>
        {spendError ? (
          <Card className="p-4">
            <p className="text-destructive">Failed to load spend stats. Please try again.</p>
          </Card>
        ) : (
          <StatsGrid stats={spendStatItems} isLoading={spendLoading} columns={2} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {timeSeriesLoading ? (
            <div className="h-80 flex items-center justify-center">
              <Skeleton className="w-full h-full" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              No data available for the selected period.
            </div>
          ) : (
            <div className="h-80" data-testid="chart-revenue-trend">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--action-primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--action-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: 'var(--text-muted)' }} />
                  <YAxis className="text-xs" tick={{ fill: 'var(--text-muted)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-raised)',
                      border: '1px solid var(--stroke-default)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="netRevenue"
                    stroke="var(--action-primary)"
                    fill="url(#colorRevenue)"
                    name="Net Revenue"
                  />
                  <Area
                    type="monotone"
                    dataKey="netProfit"
                    stroke="var(--chart-2)"
                    fill="url(#colorProfit)"
                    name="Net Profit"
                  />
                  <Line
                    type="monotone"
                    dataKey="costs"
                    stroke="var(--destructive)"
                    strokeDasharray="5 5"
                    name="Costs"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Transactions</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!ordersData?.orders?.length} data-testid="button-export-csv" >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            data={ordersData?.orders || []}
            columns={orderColumns}
            keyExtractor={(order) => order.id}
            isLoading={ordersLoading}
            emptyMessage="No transactions found for the selected filters."
          />
          {ordersData && ordersData.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {ordersData.page} of {ordersData.totalPages} ({ordersData.total} total)
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={ordersPage <= 1} data-testid="button-prev-page" >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={ordersPage >= ordersData.totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {spendStats?.topFeatures && spendStats.topFeatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Features by Credit Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {spendStats.topFeatures.map((feature, index) => (
                <div
                  key={feature.feature}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  data-testid={`feature-row-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                    <div>
                      <p className="font-medium">{formatFeatureName(feature.feature)}</p>
                      <p className="text-sm text-muted-foreground">{feature.count} transactions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{feature.totalSpent.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">credits</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatFeatureName(feature: string): string {
  const nameMap: Record<string, string> = {
    ai_lesson_generation: 'AI Lesson Generation',
    ai_quiz_generation: 'AI Quiz Generation',
    premium_content: 'Premium Content',
    marketplace_purchase: 'Marketplace Purchase',
    manual_adjustment: 'Manual Adjustment',
    thumbnail_generation: 'Thumbnail Generation',
    other: 'Other',
  };
  return nameMap[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export default LPCAnalyticsDashboard;
