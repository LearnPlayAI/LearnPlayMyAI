import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertCircle, CreditCard } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useIsMobile } from '@/hooks/use-mobile';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAdminCurrencyToggle } from '@/hooks/useCurrencyDisplay';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { AdminCurrencyToggle } from '@/components/AdminCurrencyToggle';
import { CurrencyIndicatorBadge } from '@/components/CurrencyIndicatorBadge';
import { createChartCurrencyFormatter, createChartAxisFormatter } from '@/lib/chartCurrencyFormatter';

interface DashboardData {
  mrr: {
    currentMRR: string;
    previousMRR: string;
    growth: number;
    breakdown: Array<{
      planName: string;
      planId: string;
      activeSubscriptions: number;
      monthlyValue: string;
    }>;
  };
  arr: {
    currentARR: string;
    projectedARR: string;
  };
  subscriptionHealth: {
    total: number;
    active: number;
    grace: number;
    pastDue: number;
    suspended: number;
    cancelled: number;
    churnRate: number;
    growthRate: number;
  };
  revenueBreakdown: {
    totalRevenue: string;
    byStatus: Array<{ status: string; amount: string; count: number }>;
    byCurrency: Array<{ currency: string; amount: string; count: number }>;
    byPlan: Array<{ planName: string; amount: string; count: number }>;
  };
  paymentMetrics: {
    totalProcessed: number;
    successRate: number;
    failureRate: number;
    totalAmount: string;
    byCurrency: Array<{ currency: string; amount: string; count: number }>;
  };
  monthlyTrends: Array<{
    month: string;
    mrr: string;
    newSubscriptions: number;
    cancelledSubscriptions: number;
    revenue: string;
  }>;
}

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export default function RevenueAnalyticsDashboard() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  
  const {
    showPlatformCurrency,
    setShowPlatformCurrency,
    activeCurrency,
    displayCurrency,
    formatPrice,
    getExchangeRate,
  } = useAdminCurrencyToggle(true);
  const { formatPrice: formatUserPrice } = useCurrencyPreference();

  const { data: userRoles } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ['/api/user/roles'],
  });

  // Redirect if not SuperAdmin
  useEffect(() => {
    if (userRoles && !userRoles.isSuperAdmin) {
      navigate('/');
    }
  }, [userRoles, navigate]);

  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['/api/superadmin/analytics/dashboard'],
    enabled: userRoles?.isSuperAdmin,
  });

  const exchangeRate = getExchangeRate('ZAR', activeCurrency) ?? 1;

  const chartCurrencyFormatter = useMemo(() => 
    createChartCurrencyFormatter({
      activeCurrency,
      fromCurrency: 'ZAR',
      exchangeRate,
      compact: false,
    }), [activeCurrency, exchangeRate]);

  const chartAxisFormatter = useMemo(() => 
    createChartAxisFormatter({
      activeCurrency,
      fromCurrency: 'ZAR',
      exchangeRate,
      compact: true,
    }), [activeCurrency, exchangeRate]);

  // Prepare chart data with currency conversion - use empty arrays when data is undefined
  const mrrTrendData = useMemo(() => (dashboardData?.monthlyTrends ?? []).map(trend => ({
    month: trend.month,
    MRR: parseFloat(trend.mrr) * exchangeRate,
    Revenue: parseFloat(trend.revenue) * exchangeRate,
  })), [dashboardData?.monthlyTrends, exchangeRate]);

  const subscriptionTrendData = useMemo(() => (dashboardData?.monthlyTrends ?? []).map(trend => ({
    month: trend.month,
    New: trend.newSubscriptions,
    Cancelled: trend.cancelledSubscriptions,
  })), [dashboardData?.monthlyTrends]);

  const planBreakdownData = useMemo(() => (dashboardData?.mrr?.breakdown ?? []).map(plan => ({
    name: plan.planName,
    value: parseFloat(plan.monthlyValue) * exchangeRate,
    subscriptions: plan.activeSubscriptions,
  })), [dashboardData?.mrr?.breakdown, exchangeRate]);

  const currencyBreakdownData = useMemo(() => (dashboardData?.revenueBreakdown?.byCurrency ?? []).map(curr => ({
    name: curr.currency,
    value: parseFloat(curr.amount),
    count: curr.count,
  })), [dashboardData?.revenueBreakdown?.byCurrency]);

  if (!userRoles?.isSuperAdmin && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <QuizAdminLayout
        title="Revenue Analytics"
        description="Platform revenue and subscription metrics"
        activeSection="revenue-analytics"
      >
        <div className="space-y-[var(--space-lg)]" data-testid="page-revenue-analytics-loading">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--card-gap)]">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--card-gap)]">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-96" />)}
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (error || !dashboardData) {
    return (
      <QuizAdminLayout
        title="Revenue Analytics"
        description="Platform revenue and subscription metrics"
        activeSection="revenue-analytics"
      >
        <div data-testid="page-revenue-analytics-error">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load analytics data. Please try again later.
            </AlertDescription>
          </Alert>
        </div>
      </QuizAdminLayout>
    );
  }

  const { mrr, arr, subscriptionHealth, revenueBreakdown, paymentMetrics, monthlyTrends } = dashboardData;

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <QuizAdminLayout
      title="Revenue Analytics"
      description="Platform revenue and subscription metrics"
      activeSection="revenue-analytics"
    >
      <div className="space-y-[var(--space-lg)]" data-testid="page-revenue-analytics">
        {/* Currency Toggle Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" data-testid="currency-controls">
          <div className="flex items-center gap-3">
            <CurrencyIndicatorBadge currency={activeCurrency} data-testid="badge-active-currency" />
          </div>
          <AdminCurrencyToggle
            showPlatformCurrency={showPlatformCurrency}
            onToggle={setShowPlatformCurrency}
            userCurrency={displayCurrency}
            compact={isMobile}
            data-testid="toggle-currency-display"
          />
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--card-gap)]">
        <Card data-testid="metric-mrr" className="p-[var(--card-padding)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-[length:var(--text-sm)] font-medium">Monthly Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-[length:var(--text-2xl)] font-bold" data-testid="value-mrr">{formatPrice(mrr.currentMRR, 'ZAR')}</div>
            <div className={`flex items-center text-[length:var(--text-xs)] ${mrr.growth >= 0 ? 'text-success' : 'text-destructive'}`}>
              {mrr.growth >= 0 ? <TrendingUp className="h-3 w-3 mr-1 flex-shrink-0" /> : <TrendingDown className="h-3 w-3 mr-1 flex-shrink-0" />}
              {formatPercentage(mrr.growth)} from last month
            </div>
          </CardContent>
        </Card>

        <Card data-testid="metric-arr" className="p-[var(--card-padding)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-[length:var(--text-sm)] font-medium">Annual Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-[length:var(--text-2xl)] font-bold" data-testid="value-arr">{formatPrice(arr.currentARR, 'ZAR')}</div>
            <p className="text-[length:var(--text-xs)] text-muted-foreground mt-1" data-testid="value-arr-projected">
              Projected: {formatPrice(arr.projectedARR, 'ZAR')}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="metric-active-subscriptions" className="p-[var(--card-padding)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-[length:var(--text-sm)] font-medium">Active Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-[length:var(--text-2xl)] font-bold">{subscriptionHealth.active}</div>
            <div className={`flex items-center text-[length:var(--text-xs)] ${subscriptionHealth.growthRate >= 0 ? 'text-success' : 'text-destructive'}`}>
              {subscriptionHealth.growthRate >= 0 ? <TrendingUp className="h-3 w-3 mr-1 flex-shrink-0" /> : <TrendingDown className="h-3 w-3 mr-1 flex-shrink-0" />}
              {formatPercentage(subscriptionHealth.growthRate)} growth rate
            </div>
          </CardContent>
        </Card>

        <Card data-testid="metric-churn-rate" className="p-[var(--card-padding)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
            <CardTitle className="text-[length:var(--text-sm)] font-medium">Churn Rate</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-[length:var(--text-2xl)] font-bold">{subscriptionHealth.churnRate.toFixed(2)}%</div>
            <p className="text-[length:var(--text-xs)] text-muted-foreground mt-1">
              {subscriptionHealth.cancelled} cancelled / {subscriptionHealth.total} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* MRR & Revenue Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--card-gap)]">
        <Card data-testid="chart-mrr-trend" className="p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-[length:var(--text-lg)]">MRR & Revenue Trends</CardTitle>
            <CardDescription className="text-[length:var(--text-sm)]">Last 12 months (all amounts in {activeCurrency})</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 300} className="min-h-[200px] sm:min-h-[300px]">
              <LineChart data={mrrTrendData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -10 : 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: isMobile ? 10 : 12 }} 
                  tickMargin={isMobile ? 5 : 10}
                  interval={isMobile ? 1 : 0}
                />
                <YAxis 
                  tick={{ fontSize: isMobile ? 10 : 12 }} 
                  width={isMobile ? 50 : 60}
                  tickFormatter={chartAxisFormatter}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-primary)', 
                    border: '1px solid var(--stroke-default)',
                    padding: isMobile ? '8px 12px' : '6px 10px',
                    borderRadius: '6px'
                  }}
                  formatter={(value: number) => chartCurrencyFormatter(value)}
                  wrapperStyle={{ touchAction: 'none' }}
                />
                <Legend 
                  wrapperStyle={{ 
                    fontSize: isMobile ? '10px' : '12px',
                    paddingTop: isMobile ? '5px' : '10px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="MRR" 
                  stroke={CHART_COLORS[0]} 
                  strokeWidth={2} 
                  name="MRR" 
                  activeDot={{ r: isMobile ? 6 : 4, strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Revenue" 
                  stroke={CHART_COLORS[1]} 
                  strokeWidth={2} 
                  name="Revenue"
                  activeDot={{ r: isMobile ? 6 : 4, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-testid="chart-subscription-trend" className="p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-[length:var(--text-lg)]">Subscription Activity</CardTitle>
            <CardDescription className="text-[length:var(--text-sm)]">New vs Cancelled Subscriptions</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 300} className="min-h-[200px] sm:min-h-[300px]">
              <BarChart data={subscriptionTrendData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -10 : 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickMargin={isMobile ? 5 : 10}
                  interval={isMobile ? 1 : 0}
                />
                <YAxis 
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  width={isMobile ? 35 : 45}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-primary)', 
                    border: '1px solid var(--stroke-default)',
                    padding: isMobile ? '8px 12px' : '6px 10px',
                    borderRadius: '6px'
                  }}
                  wrapperStyle={{ touchAction: 'none' }}
                  cursor={{ fill: 'var(--surface-muted)', fillOpacity: 0.3 }}
                />
                <Legend 
                  wrapperStyle={{ 
                    fontSize: isMobile ? '10px' : '12px',
                    paddingTop: isMobile ? '5px' : '10px'
                  }}
                />
                <Bar dataKey="New" fill={CHART_COLORS[2]} name="New Subscriptions" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Cancelled" fill={CHART_COLORS[3]} name="Cancelled" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Plan & Currency Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--card-gap)]">
        <Card data-testid="chart-plan-breakdown" className="p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-[length:var(--text-lg)]">Revenue by Plan</CardTitle>
            <CardDescription className="text-[length:var(--text-sm)]">Monthly recurring revenue distribution (in {activeCurrency})</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 300} className="min-h-[200px] sm:min-h-[300px]">
              <PieChart>
                <Pie
                  data={planBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={!isMobile}
                  label={isMobile ? false : (entry => `${entry.name}: ${chartCurrencyFormatter(entry.value)}`)}
                  outerRadius={isMobile ? 70 : 80}
                  innerRadius={isMobile ? 30 : 0}
                  fill="var(--chart-1)"
                  dataKey="value"
                  paddingAngle={isMobile ? 2 : 0}
                >
                  {planBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-primary)', 
                    border: '1px solid var(--stroke-default)',
                    padding: isMobile ? '8px 12px' : '6px 10px',
                    borderRadius: '6px'
                  }}
                  formatter={(value: number) => chartCurrencyFormatter(value)}
                  wrapperStyle={{ touchAction: 'none' }}
                />
                {isMobile && (
                  <Legend 
                    wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-testid="chart-currency-breakdown" className="p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-[length:var(--text-lg)]">Revenue by Currency</CardTitle>
            <CardDescription className="text-[length:var(--text-sm)]">Original currency distribution (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 300} className="min-h-[200px] sm:min-h-[300px]">
              <BarChart 
                data={currencyBreakdownData} 
                layout="vertical"
                margin={{ top: 5, right: isMobile ? 10 : 20, left: isMobile ? 5 : 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickFormatter={(value) => isMobile ? `${(value/1000).toFixed(0)}k` : value.toLocaleString()}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  width={isMobile ? 40 : 50}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-primary)', 
                    border: '1px solid var(--stroke-default)',
                    padding: isMobile ? '8px 12px' : '6px 10px',
                    borderRadius: '6px'
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'value') {
                      return [value.toLocaleString(), 'Amount'];
                    }
                    return [value, name];
                  }}
                  wrapperStyle={{ touchAction: 'none' }}
                  cursor={{ fill: 'var(--surface-muted)', fillOpacity: 0.3 }}
                />
                <Bar dataKey="value" fill={CHART_COLORS[4]} name="Revenue" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Payment Metrics */}
      <Card data-testid="card-payment-metrics" className="p-[var(--card-padding)]">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-[length:var(--text-lg)]">Payment Processing Metrics</CardTitle>
          <CardDescription className="text-[length:var(--text-sm)]">Last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--card-gap)]">
            <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
              <div className="flex items-center gap-2 text-[length:var(--text-sm)] text-muted-foreground mb-2">
                <CreditCard className="h-4 w-4 flex-shrink-0" />
                <span>Total Processed</span>
              </div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold">{paymentMetrics.totalProcessed}</div>
            </div>
            <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-2">Success Rate</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-success">
                {paymentMetrics.successRate.toFixed(2)}%
              </div>
            </div>
            <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-2">Failure Rate</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-destructive">
                {paymentMetrics.failureRate.toFixed(2)}%
              </div>
            </div>
            <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-2">Total Amount ({activeCurrency})</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold" data-testid="value-total-amount">{formatPrice(paymentMetrics.totalAmount, 'ZAR')}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Health Details */}
      <Card data-testid="card-subscription-health" className="p-[var(--card-padding)]">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-[length:var(--text-lg)]">Subscription Health Breakdown</CardTitle>
          <CardDescription className="text-[length:var(--text-sm)]">Current status distribution</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[var(--card-gap)]">
            <div className="text-center p-[var(--card-padding)] bg-success/10 rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-1">Active</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-success">{subscriptionHealth.active}</div>
            </div>
            <div className="text-center p-[var(--card-padding)] bg-warning/10 rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-1">Grace</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-warning">{subscriptionHealth.grace}</div>
            </div>
            <div className="text-center p-[var(--card-padding)] bg-warning/15 rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-1">Past Due</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-warning">{subscriptionHealth.pastDue}</div>
            </div>
            <div className="text-center p-[var(--card-padding)] bg-destructive/10 rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-1">Suspended</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-destructive">{subscriptionHealth.suspended}</div>
            </div>
            <div className="text-center p-[var(--card-padding)] bg-muted rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-1">Cancelled</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold">{subscriptionHealth.cancelled}</div>
            </div>
            <div className="text-center p-[var(--card-padding)] bg-[var(--chart-1)]/10 rounded-lg">
              <div className="text-[length:var(--text-sm)] text-muted-foreground mb-1">Total</div>
              <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-chart-1">{subscriptionHealth.total}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </QuizAdminLayout>
  );
}
