import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  DollarSign,
  TrendingUp,
  Package,
  Calendar,
  ShoppingCart,
  ExternalLink,
  ArrowUpDown,
  Star,
  Users,
  BookOpen,
  Target,
  Award,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

type RevenueSummary = {
  totalRevenue: number;
  platformCommission: number;
  netProfit: number;
  salesCount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  organizationName: string;
};

type CourseBreakdown = {
  courses: Array<{
    courseId: string;
    courseTitle: string;
    salesCount: number;
    revenue: number;
    commission: number;
    netEarnings: number;
    currency: string;
    averageRating: number | null;
    organizationName?: string;
  }>;
};

type MonthlyTrend = {
  month: string;
  revenue: number;
  salesCount: number;
  commission: number;
  netProfit: number;
};

type MonthlyTrendsResponse = {
  trends: MonthlyTrend[];
};

type RoiMetrics = {
  totalEnrolledLearners: number;
  totalCoursesPublished: number;
  averageCompletionRate: number;
  totalCompletions: number;
  enrollmentsBySource: {
    purchases: number;
    assignments: number;
    other: number;
  };
};

type EnrollmentRecord = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
  enrollmentDate: string | null;
  price: number;
  currency: string;
  status: string;
  percentComplete: number;
  completedLessons: number;
  totalLessons: number;
  source: 'purchase' | 'assignment' | 'progress_only';
  organizationId: string;
  organizationName: string;
};

type EnrollmentDetailsResponse = {
  enrollments: EnrollmentRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
];

type SortField = 'revenue' | 'salesCount' | 'netEarnings';
type SortDirection = 'asc' | 'desc';

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'completed':
      return 'default' as const;
    case 'in_progress':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-success/20 text-success dark:bg-success/30 dark:text-success hover:bg-success/20';
    case 'in_progress':
      return 'bg-warning/20 text-warning dark:bg-warning/30 dark:text-warning hover:bg-warning/20';
    default:
      return 'bg-muted/40 text-muted-foreground dark:bg-muted dark:text-muted-foreground hover:bg-muted/40';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In Progress';
    default:
      return 'Not Started';
  }
};

export default function OrgSalesDashboard() {
  const { isOrgAdmin, isSuperAdmin, isCustSuper, effectiveOrgAdmin, effectiveOrganizationId, isImpersonating, impersonatedOrganization } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
  };
  const { formatPrice } = useCurrencyDisplay();
  const isMobile = useIsMobile();
  const [dateRange, setDateRange] = useState('30');
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [enrollmentSearch, setEnrollmentSearch] = useState('');
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrollmentRecord | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(enrollmentSearch);
      setEnrollmentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [enrollmentSearch]);

  const hasAccess = isSuperAdmin || isCustSuper || effectiveOrgAdmin;
  const isPlatformAdmin = isSuperAdmin || isCustSuper;
  const apiPrefix = isPlatformAdmin ? '/api/org-sales/all' : '/api/org-sales';

  useEffect(() => {
    if (isPlatformAdmin && isImpersonating && impersonatedOrganization?.id) {
      setSelectedOrgId(impersonatedOrganization.id);
    } else if (isPlatformAdmin && !isImpersonating) {
      setSelectedOrgId(null);
    }
  }, [isPlatformAdmin, isImpersonating, impersonatedOrganization?.id]);

  const { data: allOrganizations } = useQuery<Array<{id: string; name: string; type: string}>>({
    queryKey: ['/api/admin/organizations'],
    enabled: isPlatformAdmin,
  });

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(dateRange, 10));
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [dateRange]);

  const {
    data: summaryData,
    isLoading: summaryLoading,
  } = useQuery<RevenueSummary>({
    queryKey: [`${apiPrefix}/revenue-summary`, startDate, endDate, selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedOrgId) params.set('orgId', selectedOrgId);
      const res = await fetch(`${apiPrefix}/revenue-summary?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch revenue summary');
      return res.json();
    },
    enabled: hasAccess,
  });

  const {
    data: courseData,
    isLoading: courseLoading,
  } = useQuery<CourseBreakdown>({
    queryKey: [`${apiPrefix}/course-breakdown`, startDate, endDate, selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedOrgId) params.set('orgId', selectedOrgId);
      const res = await fetch(`${apiPrefix}/course-breakdown?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch course breakdown');
      return res.json();
    },
    enabled: hasAccess,
  });

  const monthsBack = dateRange === '365' ? 12 : dateRange === '90' ? 3 : dateRange === '30' ? 1 : 1;
  const {
    data: trendsData,
    isLoading: trendsLoading,
  } = useQuery<MonthlyTrendsResponse>({
    queryKey: [`${apiPrefix}/monthly-trends`, monthsBack, selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams({ months: String(Math.max(monthsBack, 6)) });
      if (selectedOrgId) params.set('orgId', selectedOrgId);
      const res = await fetch(`${apiPrefix}/monthly-trends?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch monthly trends');
      return res.json();
    },
    enabled: hasAccess,
  });

  const {
    data: roiData,
    isLoading: roiLoading,
  } = useQuery<RoiMetrics>({
    queryKey: [`${apiPrefix}/roi-metrics`, selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedOrgId) params.set('orgId', selectedOrgId);
      const queryString = params.toString();
      const res = await fetch(`${apiPrefix}/roi-metrics${queryString ? `?${queryString}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch ROI metrics');
      return res.json();
    },
    enabled: hasAccess,
  });

  const {
    data: enrollmentData,
    isLoading: enrollmentLoading,
  } = useQuery<EnrollmentDetailsResponse>({
    queryKey: [`${apiPrefix}/enrollment-details`, enrollmentPage, debouncedSearch, selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(enrollmentPage),
        limit: '20',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (selectedOrgId) params.set('orgId', selectedOrgId);
      const res = await fetch(`${apiPrefix}/enrollment-details?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch enrollment details');
      return res.json();
    },
    enabled: hasAccess,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedCourses = courseData?.courses
    ? [...courseData.courses].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        const multiplier = sortDirection === 'asc' ? 1 : -1;
        return (aVal - bVal) * multiplier;
      })
    : [];

  const currency = (summaryData?.currency || 'ZAR') as CurrencyCode;

  if (!hasAccess) {
    return (
      <QuizAdminLayout
        title="Sales Dashboard"
        description="View your course revenue and sales data"
      >
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              You don't have permission to view this page.
            </p>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  const isLoading = hasAccess && (summaryLoading || courseLoading || trendsLoading);

  return (
    <QuizAdminLayout
      title="Sales Dashboard"
      description={isPlatformAdmin ? (selectedOrgId && allOrganizations ? `Sales data for ${allOrganizations.find(o => o.id === selectedOrgId)?.name || 'selected organization'}` : "All course enrollments and sales across all organizations") : "View your course revenue and sales data"}
      activeSection="sales"
    >
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          {summaryData?.organizationName && (
            <p className="text-sm text-muted-foreground">
              {summaryData.organizationName}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {isPlatformAdmin && allOrganizations && (
            <Select
              value={selectedOrgId || 'all'}
              onValueChange={(value) => {
                setSelectedOrgId(value === 'all' ? null : value);
                setEnrollmentPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-64 min-h-[44px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {allOrganizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPrice(summaryData?.totalRevenue || 0, currency)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {DATE_RANGES.find(r => r.value === dateRange)?.label}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Commission</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  -{formatPrice(summaryData?.platformCommission || 0, currency)}
                </div>
                <p className="text-xs text-muted-foreground">Deducted from sales</p>
              </CardContent>
            </Card>

            <Card className="bg-success/10 dark:bg-success/20 border-success/20 dark:border-success">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Earnings</CardTitle>
                <DollarSign className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  {formatPrice(summaryData?.netProfit || 0, currency)}
                </div>
                <p className="text-xs text-muted-foreground">Your earnings</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  {summaryData?.salesCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">Course purchases</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total {terminology.learnerPlural}</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {roiLoading ? <Skeleton className="h-8 w-16" /> : (roiData?.totalEnrolledLearners || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Enrolled students</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Courses Published</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {roiLoading ? <Skeleton className="h-8 w-16" /> : (roiData?.totalCoursesPublished || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Active courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Completion Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {roiLoading ? <Skeleton className="h-8 w-16" /> : `${(roiData?.averageCompletionRate || 0).toFixed(1)}%`}
                </div>
                <p className="text-xs text-muted-foreground">Average progress</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Completions</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {roiLoading ? <Skeleton className="h-8 w-16" /> : (roiData?.totalCompletions || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Courses completed</p>
              </CardContent>
            </Card>
          </div>

          {trendsData && trendsData.trends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                  <BarChart
                    data={trendsData.trends}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-default)" />
                    <XAxis
                      dataKey="month"
                      stroke="var(--text-muted)"
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-raised)',
                        border: '1px solid var(--stroke-default)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'salesCount') return [value, 'Sales'];
                        return [formatPrice(value, currency), name === 'revenue' ? 'Revenue' : 'Net Profit'];
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="revenue"
                      fill="var(--chart-1)"
                      name="Revenue"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="netProfit"
                      fill="var(--chart-4)"
                      name="Net Profit"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Course Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedCourses.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">No course sales in this period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Course Title</TableHead>
                        {isPlatformAdmin && <TableHead>Organization</TableHead>}
                        <TableHead className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('salesCount')}
                            className="h-auto p-0 font-medium hover:bg-transparent"
                          >
                            Sales
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('revenue')}
                            className="h-auto p-0 font-medium hover:bg-transparent"
                          >
                            Revenue
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('netEarnings')}
                            className="h-auto p-0 font-medium hover:bg-transparent"
                          >
                            Net Earnings
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">Rating</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCourses.map((course) => (
                        <TableRow key={course.courseId}>
                          <TableCell className="font-medium">
                            {course.courseTitle}
                          </TableCell>
                          {isPlatformAdmin && (
                            <TableCell className="text-muted-foreground text-sm">
                              {course.organizationName || '-'}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            {course.salesCount}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(course.revenue, course.currency as CurrencyCode)}
                          </TableCell>
                          <TableCell className="text-right text-warning">
                            -{formatPrice(course.commission, course.currency as CurrencyCode)}
                          </TableCell>
                          <TableCell className="text-right text-success font-medium">
                            {formatPrice(course.netEarnings, course.currency as CurrencyCode)}
                          </TableCell>
                          <TableCell className="text-right">
                            {course.averageRating ? (
                              <span className="flex items-center justify-end gap-1">
                                <Star className="h-3 w-3 fill-warning text-warning" />
                                {course.averageRating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link href={`/courses/${course.courseId}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Enrollment Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by student name, email, or course..."
                    value={enrollmentSearch}
                    onChange={(e) => setEnrollmentSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {enrollmentLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !enrollmentData?.enrollments?.length ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">
                    {debouncedSearch ? 'No enrollments match your search' : 'No enrollment records found'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[140px]">{terminology.learner} Name</TableHead>
                          <TableHead className="min-w-[180px]">Email</TableHead>
                          {isPlatformAdmin && <TableHead className="min-w-[140px]">Organization</TableHead>}
                          <TableHead className="min-w-[180px]">Course</TableHead>
                          <TableHead className="min-w-[120px]">Enrollment Date</TableHead>
                          <TableHead className="text-right min-w-[80px]">Price</TableHead>
                          <TableHead className="min-w-[80px]">Source</TableHead>
                          <TableHead className="min-w-[140px]">Progress</TableHead>
                          <TableHead className="min-w-[100px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollmentData.enrollments.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell className="font-medium">
                              <button
                                onClick={() => setSelectedEnrollment(enrollment)}
                                className="text-primary hover:underline cursor-pointer text-left"
                              >
                                {enrollment.userName}
                              </button>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {enrollment.userEmail}
                            </TableCell>
                            {isPlatformAdmin && (
                              <TableCell className="text-muted-foreground text-sm">
                                {enrollment.organizationName || '-'}
                              </TableCell>
                            )}
                            <TableCell>{enrollment.courseTitle}</TableCell>
                            <TableCell className="text-sm">
                              {enrollment.enrollmentDate
                                ? new Date(enrollment.enrollmentDate).toLocaleDateString()
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {enrollment.price > 0
                                ? formatPrice(enrollment.price, enrollment.currency as CurrencyCode)
                                : <span className="text-muted-foreground">Free</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={ enrollment.source === 'purchase' ? 'bg-primary text-primary-foreground' : enrollment.source === 'assignment' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground dark:bg-muted dark:text-muted-foreground' }>
                                {enrollment.source === 'purchase' ? 'Purchase' : enrollment.source === 'assignment' ? 'Assignment' : 'Direct'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={enrollment.percentComplete} className="h-2 w-20" />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {enrollment.percentComplete}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(enrollment.status)} className={statusBadgeClass(enrollment.status)} >
                                {statusLabel(enrollment.status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {enrollmentData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Page {enrollmentData.page} of {enrollmentData.totalPages} ({enrollmentData.total} total)
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEnrollmentPage(p => Math.max(1, p - 1))}
                          disabled={enrollmentPage <= 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEnrollmentPage(p => Math.min(enrollmentData.totalPages, p + 1))}
                          disabled={enrollmentPage >= enrollmentData.totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <Dialog open={!!selectedEnrollment} onOpenChange={(open) => !open && setSelectedEnrollment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enrollment Details</DialogTitle>
          </DialogHeader>
          {selectedEnrollment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">{terminology.learner}</div>
                <div className="font-medium">{selectedEnrollment.userName}</div>
                <div className="text-muted-foreground">Email</div>
                <div>{selectedEnrollment.userEmail}</div>
                {isPlatformAdmin && selectedEnrollment.organizationName && (
                  <>
                    <div className="text-muted-foreground">Organization</div>
                    <div>{selectedEnrollment.organizationName}</div>
                  </>
                )}
                <div className="text-muted-foreground">Course</div>
                <div>{selectedEnrollment.courseTitle}</div>
                <div className="text-muted-foreground">Enrolled</div>
                <div>{selectedEnrollment.enrollmentDate ? new Date(selectedEnrollment.enrollmentDate).toLocaleDateString() : '-'}</div>
                <div className="text-muted-foreground">Price</div>
                <div>{selectedEnrollment.price > 0 ? formatPrice(selectedEnrollment.price, selectedEnrollment.currency as CurrencyCode) : 'Free'}</div>
                <div className="text-muted-foreground">Source</div>
                <div>{selectedEnrollment.source === 'purchase' ? 'Purchase' : selectedEnrollment.source === 'assignment' ? 'Assignment' : 'Direct'}</div>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Course Progress</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={statusBadgeVariant(selectedEnrollment.status)} className={statusBadgeClass(selectedEnrollment.status)}>
                      {statusLabel(selectedEnrollment.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span>{selectedEnrollment.percentComplete}%</span>
                  </div>
                  <Progress value={selectedEnrollment.percentComplete} className="h-2" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{selectedEnrollment.completedLessons} of {selectedEnrollment.totalLessons} lessons</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </QuizAdminLayout>
  );
}
