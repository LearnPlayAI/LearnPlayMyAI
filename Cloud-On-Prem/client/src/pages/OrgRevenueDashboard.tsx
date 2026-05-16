import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, Package, Calendar, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useUser } from '@/hooks/use-user';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { CurrencyIndicatorBadge } from '@/components/CurrencyIndicatorBadge';
import { DualCurrencyDisplay } from '@/components/CurrencyConversionTooltip';

type RevenueData = {
  summary: {
    totalSales: number;
    grossRevenue: string;
    platformCommission: string;
    netEarnings: string;
    currency: string;
    commissionRate: string;
  };
  topCourses: Array<{
    id: string;
    title: string;
    salesCount: number;
    revenue: string;
    netEarnings: string;
  }>;
  monthlyTrends: Array<{
    month: string;
    sales: number;
    revenue: string;
    commission: string;
    net: string;
  }>;
  salesBreakdown: {
    byCurrency: Array<{
      currency: string;
      count: number;
      amount: string;
    }>;
  };
};

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export default function OrgRevenueDashboard() {
  const { user } = useUser();
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = useState<string>('30');
  const [expandedSection, setExpandedSection] = useState<string | null>('summary');
  const { formatPrice, displayCurrency } = useCurrencyDisplay();

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;

  const { data, isLoading } = useQuery<RevenueData>({
    queryKey: ['/api/admin/revenue', timeRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('days', timeRange);

      const response = await fetch(`/api/admin/revenue?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch revenue data');
      }
      return response.json();
    },
    enabled: isAuthenticated && isAdmin,
  });

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (!isAdmin) {
    return null;
  }

  if (isLoading || adminLoading) {
    return (
      <QuizAdminLayout title="E-Learning Revenue" description="View revenue analytics and financial metrics" activeSection="revenue">
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="E-Learning Revenue" description="View revenue analytics and financial metrics" activeSection="revenue">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <CurrencyIndicatorBadge className="bg-muted border-border text-muted-foreground" />
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-48 bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-time-range">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!data ? (
          <Card className="bg-card border-border" data-testid="empty-revenue">
            <CardContent className="py-12 text-center p-[var(--card-padding)]">
              <Package className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground text-[length:var(--text-lg)]" data-testid="empty-revenue-message">No revenue data available</p>
              <p className="text-muted-foreground/70 text-[length:var(--text-sm)] mt-2" data-testid="empty-revenue-hint">
                Start selling courses to see your revenue analytics
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-[var(--space-lg)]">
            {/* Revenue Summary - Expandable Card */}
            <Card className="bg-card border-border">
              <CardHeader>
                <Button type="button" variant="ghost" onClick={() => toggleSection('summary')}
                  aria-expanded={expandedSection === 'summary'}
                  aria-controls="org-revenue-summary-panel"
                  className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Revenue Summary
                  </CardTitle>
                  {expandedSection === 'summary' ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </CardHeader>
              {expandedSection === 'summary' && (
                <CardContent id="org-revenue-summary-panel" className="p-[var(--card-padding)] pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--card-gap)]">
                    <div className="bg-muted p-[var(--card-padding)] rounded-lg border border-border">
                      <p className="text-muted-foreground text-[length:var(--text-sm)] mb-1">Total Sales</p>
                      <p className="text-foreground text-[length:var(--text-2xl)] sm:text-[length:var(--text-3xl)] font-bold" data-testid="total-sales">
                        {data.summary.totalSales}
                      </p>
                    </div>
                    <div className="bg-muted p-[var(--card-padding)] rounded-lg border border-border">
                      <p className="text-muted-foreground text-[length:var(--text-sm)] mb-1">Gross Revenue</p>
                      <div className="text-foreground text-[length:var(--text-2xl)] sm:text-[length:var(--text-3xl)] font-bold" data-testid="gross-revenue">
                        <DualCurrencyDisplay 
                          amount={data.summary.grossRevenue} 
                          fromCurrency={data.summary.currency as CurrencyCode}
                          primarySize="lg"
                          showSettlement={true}
                        />
                      </div>
                    </div>
                    <div className="bg-muted p-[var(--card-padding)] rounded-lg border border-border">
                      <p className="text-muted-foreground text-[length:var(--text-sm)] mb-1">Platform Commission ({parseFloat(data.summary.commissionRate) * 100}%)</p>
                      <div className="text-foreground text-[length:var(--text-2xl)] sm:text-[length:var(--text-3xl)] font-bold" data-testid="platform-commission">
                        <DualCurrencyDisplay 
                          amount={data.summary.platformCommission} 
                          fromCurrency={data.summary.currency as CurrencyCode}
                          primarySize="lg"
                          showSettlement={true}
                        />
                      </div>
                    </div>
                    <div className="bg-success/10 p-[var(--card-padding)] rounded-lg border border-success/30">
                      <p className="text-success-foreground text-[length:var(--text-sm)] mb-1">Net Earnings</p>
                      <div className="text-foreground text-[length:var(--text-2xl)] sm:text-[length:var(--text-3xl)] font-bold" data-testid="net-earnings">
                        <DualCurrencyDisplay 
                          amount={data.summary.netEarnings} 
                          fromCurrency={data.summary.currency as CurrencyCode}
                          primarySize="lg"
                          showSettlement={true}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Top Courses - Expandable Card */}
            <Card className="bg-card border-border">
              <CardHeader>
                <Button type="button" variant="ghost" onClick={() => toggleSection('topCourses')}
                  aria-expanded={expandedSection === 'topCourses'}
                  aria-controls="org-revenue-top-courses-panel"
                  className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Top Performing Courses
                  </CardTitle>
                  {expandedSection === 'topCourses' ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </CardHeader>
              {expandedSection === 'topCourses' && (
                <CardContent id="org-revenue-top-courses-panel" className="p-[var(--card-padding)] pt-0">
                  {data.topCourses.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8 text-[length:var(--text-base)]" data-testid="empty-top-courses">No course sales yet</p>
                  ) : (
                    <div className="space-y-[var(--space-md)]">
                      {data.topCourses.map((course, index) => (
                        <div
                          key={course.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-[var(--card-padding)] bg-muted rounded-lg border border-border gap-[var(--space-md)]"
                          data-testid={`top-course-${course.id}`}
                        >
                          <div className="flex items-center gap-[var(--space-md)] flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary/80 font-semibold flex-shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-foreground font-semibold text-[length:var(--text-base)] truncate" data-testid={`course-title-${course.id}`}>
                                {course.title}
                              </h4>
                              <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid={`course-sales-count-${course.id}`}>
                                {course.salesCount} sale{course.salesCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-left sm:text-right w-full sm:w-auto">
                            <p className="text-foreground font-semibold text-[length:var(--text-base)]" data-testid={`course-revenue-${course.id}`}>
                              {formatPrice(course.revenue, data.summary.currency as CurrencyCode)}
                            </p>
                            <p className="text-success text-[length:var(--text-sm)]" data-testid={`course-net-${course.id}`}>
                              {formatPrice(course.netEarnings, data.summary.currency as CurrencyCode)} net
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Monthly Trends - Expandable Card */}
            {data.monthlyTrends.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <Button type="button" variant="ghost" onClick={() => toggleSection('trends')}
                    aria-expanded={expandedSection === 'trends'}
                    aria-controls="org-revenue-trends-panel"
                    className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Revenue Trends
                    </CardTitle>
                    {expandedSection === 'trends' ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </CardHeader>
                {expandedSection === 'trends' && (
                  <CardContent id="org-revenue-trends-panel" className="p-[var(--card-padding)] pt-0">
                    <ResponsiveContainer width="100%" height={isMobile ? 250 : 300} className="min-h-[200px] sm:min-h-[300px]">
                      <LineChart 
                        data={data.monthlyTrends}
                        margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -10 : 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-default)" />
                        <XAxis 
                          dataKey="month" 
                          stroke="var(--text-muted)" 
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                          tickMargin={isMobile ? 5 : 10}
                          interval={isMobile ? 'preserveStartEnd' : 0}
                        />
                        <YAxis 
                          stroke="var(--text-muted)" 
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                          width={isMobile ? 50 : 60}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--surface-raised)',
                            border: '1px solid var(--stroke-default)',
                            borderRadius: '8px',
                            padding: isMobile ? '8px 12px' : '6px 10px',
                            color: 'var(--text-primary)',
                          }}
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
                          dataKey="revenue"
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                          name="Gross Revenue"
                          activeDot={{ r: isMobile ? 6 : 4, strokeWidth: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="net"
                          stroke="var(--chart-4)"
                          strokeWidth={2}
                          name="Net Earnings"
                          activeDot={{ r: isMobile ? 6 : 4, strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Currency Breakdown - Expandable Card */}
            {data.salesBreakdown.byCurrency.length > 1 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <Button type="button" variant="ghost" onClick={() => toggleSection('currency')}
                    aria-expanded={expandedSection === 'currency'}
                    aria-controls="org-revenue-currency-panel"
                    className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardTitle className="text-foreground">Sales by Currency</CardTitle>
                    {expandedSection === 'currency' ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </CardHeader>
                {expandedSection === 'currency' && (
                  <CardContent id="org-revenue-currency-panel" className="p-[var(--card-padding)] pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--card-gap)]">
                      {data.salesBreakdown.byCurrency.map((curr) => (
                        <div
                          key={curr.currency}
                          className="bg-muted p-[var(--card-padding)] rounded-lg border border-border"
                          data-testid={`currency-breakdown-${curr.currency}`}
                        >
                          <Badge variant="outline" className="mb-2" data-testid={`currency-badge-${curr.currency}`}>
                            {curr.currency}
                          </Badge>
                          <p className="text-foreground text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold" data-testid={`currency-amount-${curr.currency}`}>
                            {formatPrice(curr.amount, curr.currency as CurrencyCode)}
                          </p>
                          <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid={`currency-sales-count-${curr.currency}`}>{curr.count} sales</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}
    </QuizAdminLayout>
  );
}
