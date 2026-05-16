import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { TrendingUp, DollarSign, ShoppingCart, Users, BarChart3, AlertTriangle, RefreshCcw } from 'lucide-react';
import { Link } from 'wouter';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';

type SalesStats = {
  totalRevenue: string;
  totalSales: number;
  activeStudents: number;
  averageOrderValue: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  refunds: {
    totalRefunds: number;
    totalRefundAmount: string;
    pendingRefunds: number;
    netRevenue: string;
  };
};

type TopCourse = {
  courseId: string;
  courseTitle: string;
  totalSales: number;
  totalRevenue: string;
  currency: string;
};

type TopCourseWithRank = TopCourse & { rank: number };

export default function MarketplaceRevenue() {
  const [, setLocation] = useLocation();
  const { formatPrice } = useCurrencyPreference();

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
  });

  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  useEffect(() => {
    if (!adminLoading && isSuperAdmin) {
      setLocation('/payout-management');
    }
  }, [isSuperAdmin, adminLoading, setLocation]);

  const { data: salesData, isLoading: salesLoading } = useQuery<{
    stats: SalesStats;
    topCourses: TopCourse[];
  }>({
    queryKey: ['/api/sales-analytics'],
    enabled: isAdmin && !isSuperAdmin,
  });

  const stats = salesData?.stats;
  const topCourses = salesData?.topCourses || [];

  const topCoursesWithRank: TopCourseWithRank[] = topCourses.map((course, index) => ({
    ...course,
    rank: index + 1,
  }));

  const revenueStats: StatItem[] = [
    {
      label: 'Total Revenue',
      value: formatPrice(stats?.totalRevenue || '0', (stats?.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR'),
      icon: DollarSign,
    },
    {
      label: 'Total Sales',
      value: stats?.totalSales || 0,
      icon: ShoppingCart,
    },
    {
      label: 'Active Learners',
      value: stats?.activeStudents || 0,
      icon: Users,
    },
    {
      label: 'Avg. Order Value',
      value: formatPrice(stats?.averageOrderValue || '0', (stats?.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR'),
      icon: TrendingUp,
    },
  ];

  const courseColumns: Column<TopCourseWithRank>[] = [
    {
      key: 'rank',
      header: 'Rank',
      mobileLabel: '#',
      width: '80px',
      render: (course) => (
        <div 
          className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary/80 font-bold"
          data-testid={`course-rank-${course.courseId}`}
        >
          {course.rank}
        </div>
      ),
    },
    {
      key: 'courseTitle',
      header: 'Course',
      mobileLabel: 'Course',
      render: (course) => (
        <div data-testid={`top-course-${course.courseId}`}>
          <span 
            className="font-medium text-foreground"
            data-testid={`course-title-${course.courseId}`}
          >
            {course.courseTitle}
          </span>
        </div>
      ),
    },
    {
      key: 'totalSales',
      header: 'Sales',
      mobileLabel: 'Sales',
      width: '100px',
      render: (course) => (
        <span className="text-muted-foreground">
          {course.totalSales} {course.totalSales === 1 ? 'sale' : 'sales'}
        </span>
      ),
    },
    {
      key: 'totalRevenue',
      header: 'Revenue',
      mobileLabel: 'Revenue',
      width: '140px',
      render: (course) => (
        <span 
          className="font-bold text-foreground"
          data-testid={`course-revenue-${course.courseId}`}
        >
          {formatPrice(course.totalRevenue, course.currency as 'ZAR' | 'USD' | 'EUR')}
        </span>
      ),
    },
  ];

  if (adminLoading || salesLoading) {
    return (
      <QuizAdminLayout
        title="Marketplace Revenue"
        description="Sales analytics and revenue insights"
      >
        <div className="space-y-[var(--space-lg)]">
          <StatsGrid
            stats={[]}
            isLoading={true}
            columns={2}
            className="lg:grid-cols-4"
          />
          <div className="grid gap-[var(--card-gap)] grid-cols-1 sm:grid-cols-2">
            <Card className="bg-surface-raised border-border p-[var(--card-padding)]">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-primary/30 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-primary/30 rounded animate-pulse" />
              </CardContent>
            </Card>
            <Card className="bg-destructive/20 border-[var(--destructive)]/30 p-[var(--card-padding)]">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card border-border p-[var(--card-padding)]">
            <CardHeader>
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full bg-muted/50 rounded animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  if (isSuperAdmin) {
    return null;
  }

  return (
    <QuizAdminLayout
      title="Marketplace Revenue"
      description="Sales analytics and revenue insights"
    >
      <div className="space-y-[var(--space-lg)]">
        {stats?.refunds?.pendingRefunds && stats.refunds.pendingRefunds > 0 && (
          <Alert data-testid="pending-refunds-alert">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Pending Refund Requests</AlertTitle>
            <AlertDescription className="text-warning/80">
              You have {stats.refunds.pendingRefunds} pending refund request{stats.refunds.pendingRefunds > 1 ? 's' : ''} that require attention.{' '}
              <Link 
                href="/course-refunds" 
                className="underline text-warning hover:text-warning/80 inline-flex items-center min-h-[var(--touch-target-min)] py-1"
                data-testid="link-course-refunds"
              >
                Review refund requests
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div data-testid="revenue-stats-section">
          <StatsGrid
            stats={revenueStats}
            columns={2}
            className="lg:grid-cols-4"
          />
          <div 
            className="mt-[var(--space-md)] text-xs text-muted-foreground text-center sm:text-left"
            data-testid="stats-period"
          >
            Period: {stats?.periodStart} - {stats?.periodEnd}
          </div>
        </div>

        <div 
          className="grid gap-[var(--card-gap)] grid-cols-1 sm:grid-cols-2"
          data-testid="special-stats-section"
        >
          <Card className="bg-surface-raised border-border p-[var(--card-padding)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
              <CardTitle className="text-sm font-medium text-foreground">Net Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="text-2xl font-bold text-primary" data-testid="net-revenue">
                {formatPrice(stats?.refunds?.netRevenue || '0', (stats?.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR')}
              </div>
              <p className="text-xs text-primary/70 mt-1">After refunds</p>
            </CardContent>
          </Card>

          <Card className="bg-destructive/20 border-[var(--destructive)]/30 p-[var(--card-padding)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-0 pt-0">
              <CardTitle className="text-sm font-medium text-foreground">Refunds</CardTitle>
              <RefreshCcw className="h-4 w-4 text-destructive flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="text-2xl font-bold text-destructive" data-testid="total-refund-amount">
                {formatPrice(stats?.refunds?.totalRefundAmount || '0', (stats?.currency || 'ZAR') as 'ZAR' | 'USD' | 'EUR')}
              </div>
              <p className="text-xs text-destructive/70 mt-1" data-testid="total-refunds-count">
                {stats?.refunds?.totalRefunds || 0} refund{(stats?.refunds?.totalRefunds || 0) !== 1 ? 's' : ''} this period
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 flex-shrink-0" />
              <span>Top Performing Courses</span>
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Your best-selling courses this period
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveTable
              data={topCoursesWithRank}
              columns={courseColumns}
              keyExtractor={(course) => course.courseId}
              emptyMessage="No sales data available yet"
              className="[&_[data-testid^='card-']]:bg-muted/50"
            />
          </CardContent>
        </Card>

        <Card className="bg-card border-border border-dashed p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0 pb-0">
            <CardTitle className="text-foreground">More Analytics Coming Soon</CardTitle>
            <CardDescription className="text-muted-foreground">
              Advanced charts, trends analysis, and detailed reporting features are in development
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
