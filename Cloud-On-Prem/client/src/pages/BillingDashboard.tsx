import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Users, Calendar, TrendingUp, ArrowLeft, Download, FileText, Filter, Building2, CheckCircle2, Package, TrendingDown, TrendingUpIcon, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { subMonths } from 'date-fns';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useAuth } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Skeleton } from '@/components/ui/skeleton';
import { tzFormat } from '@/utils/timezoneRuntime';

interface StudentBillingInfo {
  userId: string;
  approvedAt: string | null;
  firstName: string;
  lastName: string;
  email: string;
  proratedCost: number;
  daysRemaining: number;
  joinDate: string;
}

interface MonthlyBillingReport {
  month: string;
  year: number;
  students: StudentBillingInfo[];
  totalStudents: number;
  totalCost: number;
  monthlyRate: number;
  daysInMonth: number;
}

interface SeatUtilization {
  totalSeats: number;
  usedSeats: number;
  availableSeats: number;
  utilizationPercentage: number;
  learnerSeats?: { total: number; used: number; available: number };
  teacherSeats?: { total: number; used: number; available: number };
  adminSeats?: { total: number; used: number; available: number };
}

interface Subscription {
  id: string;
  organizationId: string;
  packageId: string;
  packageName?: string;
  packageTier?: string;
  status: string;
  startDate: string;
  renewalDate: string;
  interval: string;
  createdAt: string;
  updatedAt: string;
}

interface BusinessPackage {
  id: string;
  name: string;
  tier: string;
  maxLearners: number;
  maxTeachers: number;
  maxOrgAdmins: number;
  monthlyCredits: number;
  features: string[];
  isActive: boolean;
}

export default function BillingDashboard() {
  const [, setLocation] = useLocation();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: user } = useQuery<any>({ queryKey: ['/api/auth/user'] });
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const { formatPrice, userCurrency } = useCurrencyPreference();
  const { impersonatedOrganization, isDemo, isSuperAdmin, effectiveOrganizationId } = useAuth();
  const { onpremMode } = usePlatformMode();

  useEffect(() => {
    if (onpremMode) {
      setLocation('/not-authorized');
    }
  }, [onpremMode, setLocation]);

  if (onpremMode) {
    return null;
  }

  const effectiveOrgId = impersonatedOrganization?.id || effectiveOrganizationId || user?.organizationId;

  const billingUrl = effectiveOrgId 
    ? `/api/org/${effectiveOrgId}/billing?month=${selectedMonth}&year=${selectedYear}`
    : null;

  const { data: billingReport, isLoading } = useQuery<MonthlyBillingReport>({
    queryKey: [billingUrl],
    enabled: !!billingUrl,
  });

  // Fetch seat utilization for user metrics
  const { data: seatUtilization, isLoading: isLoadingSeatUtilization } = useQuery<SeatUtilization>({
    queryKey: [effectiveOrgId, '/api/organizations/:id/seat-utilization'],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${effectiveOrgId}/seat-utilization`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch seat utilization');
      return response.json();
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch current subscription info
  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery<{ subscription: Subscription | null }>({
    queryKey: [effectiveOrgId, '/api/organizations/:id/subscription'],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${effectiveOrgId}/subscription`, { credentials: 'include' });
      if (!response.ok) return { subscription: null };
      return response.json();
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch eligible packages for this organization
  const { data: packagesData, isLoading: isLoadingPackages } = useQuery<{ packages: BusinessPackage[] }>({
    queryKey: [effectiveOrgId, '/api/organizations/:id/eligible-packages'],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${effectiveOrgId}/eligible-packages`, { credentials: 'include' });
      if (!response.ok) return { packages: [] };
      return response.json();
    },
    enabled: !!effectiveOrgId,
  });

  const studentLabel = terminology?.learnerPlural || 'Learners';
  const studentLabelLower = terminologyLower?.learnerPlural || 'students';

  const exportCSV = () => {
    if (!billingReport || !billingReport.students.length) return;
    
    const headers = ['Name', 'Email', 'Join Date', 'Days in Month', `Prorated Cost (${userCurrency})`];
    const rows = billingReport.students.map(s => [
      `${s.firstName} ${s.lastName}`,
      s.email,
      tzFormat(s.joinDate, 'yyyy-MM-dd'),
      s.daysRemaining.toString(),
      formatPrice(s.proratedCost, 'ZAR'),
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      '',
      `Total ${studentLabel},${billingReport.totalStudents}`,
      `Total Cost (${userCurrency}),${formatPrice(billingReport.totalCost, 'ZAR')}`,
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-${billingReport.month}-${billingReport.year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const billingStats: StatItem[] = [
    {
      label: 'Total Cost',
      value: formatPrice(billingReport?.totalCost || 0, 'ZAR'),
      icon: DollarSign,
    },
    {
      label: `Active ${studentLabel}`,
      value: billingReport?.totalStudents || 0,
      icon: Users,
    },
    {
      label: 'Days in Month',
      value: billingReport?.daysInMonth || 0,
      icon: Calendar,
    },
    {
      label: 'Monthly Rate',
      value: formatPrice(billingReport?.monthlyRate || 8.99, 'ZAR'),
      icon: TrendingUp,
    },
  ];

  // User metrics stats
  const userMetricsStats: StatItem[] = [
    {
      label: 'Total Users',
      value: seatUtilization?.totalSeats || 0,
      icon: Users,
    },
    {
      label: 'Active Users',
      value: seatUtilization?.usedSeats || 0,
      icon: CheckCircle2,
    },
    {
      label: 'Available Seats',
      value: seatUtilization?.availableSeats || 0,
      icon: Users,
    },
    {
      label: 'Utilization',
      value: `${(seatUtilization?.utilizationPercentage || 0).toFixed(1)}%`,
      icon: TrendingUp,
    },
  ];

  const tableColumns: Column<StudentBillingInfo>[] = [
    {
      key: 'name',
      header: 'Name',
      mobileLabel: 'Name',
      render: (student) => (
        <span data-testid={`text-name-${student.userId}`}>
          {student.firstName} {student.lastName}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      mobileLabel: 'Email',
      render: (student) => (
        <span data-testid={`text-email-${student.userId}`}>
          {student.email}
        </span>
      ),
    },
    {
      key: 'joinDate',
      header: 'Join Date',
      mobileLabel: 'Joined',
      render: (student) => (
        <span data-testid={`text-join-date-${student.userId}`}>
          {tzFormat(student.joinDate, 'MMM dd, yyyy')}
        </span>
      ),
    },
    {
      key: 'daysRemaining',
      header: 'Days in Month',
      mobileLabel: 'Days',
      render: (student) => (
        <span data-testid={`text-days-${student.userId}`}>
          {student.daysRemaining} days
        </span>
      ),
    },
    {
      key: 'proratedCost',
      header: `Prorated Cost (${userCurrency})`,
      mobileLabel: 'Cost',
      render: (student) => (
        <span className="font-semibold" data-testid={`text-cost-${student.userId}`}>
          {formatPrice(student.proratedCost, 'ZAR')}
        </span>
      ),
    },
  ];

  // Check for demo organization status from billing API or useAuth
  const isEffectiveDemo = (billingReport as any)?.isDemo || isDemo;

  // Demo organizations see a simplified view
  if (isEffectiveDemo && !isSuperAdmin) {
    return (
      <QuizAdminLayout title="Billing Dashboard">
        <div className="container mx-auto p-[var(--container-padding)] space-y-[var(--space-lg)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 sm:gap-4">
                <Button variant="ghost" size="sm" onClick={() => setLocation('/org-admin')}
                  className="min-h-[44px] min-w-[44px] px-3"
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              </div>
              <h1 className="text-[length:var(--text-3xl)] font-bold" data-testid="text-page-title">
                Billing Dashboard
              </h1>
            </div>
          </div>

          <Card className="bg-surface-raised shadow-card border-l-4 border-l-primary" data-testid="card-demo-organization">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Demo Organization
                    <Badge variant="secondary" >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Full Access
                    </Badge>
                  </CardTitle>
                  <CardDescription>Billing management is not required</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-muted-foreground text-[length:var(--text-sm)]">
                This is a demo organization with full platform access. No billing or subscription management is required.
                All features and courses are available without payment.
              </p>
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Billing Dashboard">
      <div className="container mx-auto p-[var(--container-padding)] space-y-[var(--space-lg)]">
        {/* Header Section - Responsive layout */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation('/org-admin')}
                className="min-h-[44px] min-w-[44px] px-3"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </div>
            <h1 className="text-[length:var(--text-3xl)] font-bold" data-testid="text-page-title">
              Billing Dashboard
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid="text-page-description">
              View prorated billing costs for your {studentLabelLower}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setLocation('/billing/audit-log')}
              className="min-h-[44px] w-full sm:w-auto"
              data-testid="button-audit-log"
            >
              <FileText className="h-4 w-4 mr-2" />
              View Audit Log
            </Button>
            <Button variant="default" onClick={exportCSV} disabled={!billingReport || billingReport.students.length === 0} className="min-h-[44px] w-full sm:w-auto" data-testid="button-export" >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Billing Period Selector - Collapsible on mobile */}
        <div className="block md:hidden">
          <CollapsibleSection
            title="Billing Period"
            description="Select month and year to view billing details"
            icon={Filter}
            defaultOpen={true}
          >
            <div className="flex flex-col gap-4">
              <div className="w-full">
                <label className="text-sm font-medium mb-2 block">Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  disabled={isLoading}
                  className="w-full min-h-[44px] p-3 rounded-md bg-inputField text-inputField-foreground border border-inputField-border focus:border-inputField-focus text-[length:var(--text-base)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="select-month"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {new Date(2024, i, 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full">
                <label className="text-sm font-medium mb-2 block">Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  disabled={isLoading}
                  className="w-full min-h-[44px] p-3 rounded-md bg-inputField text-inputField-foreground border border-inputField-border focus:border-inputField-focus text-[length:var(--text-base)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="select-year"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Billing Period Selector - Card on desktop */}
        <div className="hidden md:block">
          <Card className="bg-surface-raised shadow-card">
            <CardHeader>
              <CardTitle data-testid="text-period-title">Billing Period</CardTitle>
              <CardDescription data-testid="text-period-description">
                Select month and year to view billing details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    disabled={isLoading}
                    className="w-full min-h-[44px] p-2 rounded-md bg-inputField text-inputField-foreground border border-inputField-border focus:border-inputField-focus disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="select-month-desktop"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {new Date(2024, i, 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    disabled={isLoading}
                    className="w-full min-h-[44px] p-2 rounded-md bg-inputField text-inputField-foreground border border-inputField-border focus:border-inputField-focus disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="select-year-desktop"
                  >
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - 2 + i;
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid - Responsive billing summary */}
        <StatsGrid
          stats={billingStats}
          isLoading={isLoading}
          columns={4}
          className="w-full"
        />

        {/* User Metrics Section */}
        <Card className="bg-surface-raised shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Metrics
            </CardTitle>
            <CardDescription>Organization seat utilization and user overview</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsGrid
              stats={userMetricsStats}
              isLoading={isLoadingSeatUtilization}
              columns={4}
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Billing Table - Responsive with mobile cards */}
        <Card className="bg-surface-raised shadow-card p-[var(--card-padding)]">
          <CardHeader className="px-0 pt-0">
            <CardTitle data-testid="text-breakdown-title">{studentLabel} Billing Breakdown</CardTitle>
            <CardDescription data-testid="text-breakdown-description">
              Prorated costs for {billingReport?.month} {billingReport?.year}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveTable
              data={billingReport?.students || []}
              columns={tableColumns}
              keyExtractor={(student) => student.userId}
              isLoading={isLoading}
              emptyMessage={`No active ${studentLabelLower} for this period`}
            />
            
            {/* Total Summary Row - shown below table when there's data or loading */}
            {isLoading ? (
              <div 
                className="mt-4 p-4 rounded-lg bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                data-testid="billing-total-summary-loading"
              >
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-7 w-24" />
              </div>
            ) : billingReport && billingReport.students.length > 0 ? (
              <div 
                className="mt-4 p-4 rounded-lg bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                data-testid="billing-total-summary"
              >
                <span className="font-medium text-muted-foreground" data-testid="text-total-label">
                  Total for {billingReport.month} {billingReport.year}:
                </span>
                <span className="text-lg sm:text-xl font-bold" data-testid="text-total-amount">
                  {formatPrice(billingReport.totalCost, 'ZAR')}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Package Subscription Section */}
        <Card className="bg-surface-raised shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                <div>
                  <CardTitle>Business Package</CardTitle>
                  <CardDescription>Current subscription and available packages</CardDescription>
                </div>
              </div>
              {subscriptionData?.subscription && (
                <Badge variant="default" >
                  {subscriptionData.subscription.status === 'active' ? 'Active' : subscriptionData.subscription.status}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingSubscription || isLoadingPackages ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : subscriptionData?.subscription ? (
              <div className="space-y-4 border-b border-border pb-4">
                <div>
                  <h4 className="font-semibold text-[length:var(--text-base)] mb-2">Current Package</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Package Name:</span>
                      <span className="font-medium">{subscriptionData.subscription.packageName || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={subscriptionData.subscription.status === 'active' ? 'default' : 'secondary'}>
                        {subscriptionData.subscription.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Renewal Date:</span>
                      <span className="font-medium">
                        {tzFormat(subscriptionData.subscription.renewalDate, 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <p className="text-muted-foreground text-[length:var(--text-sm)]">
                  No active subscription. Select a package to get started.
                </p>
              </div>
            )}

            {/* Available Packages Grid */}
            {packagesData && packagesData.packages.length > 0 && (
              <div>
                <h4 className="font-semibold text-[length:var(--text-base)] mb-4">Available Packages</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {packagesData.packages.map((pkg) => (
                    <div key={pkg.id} className="p-4 rounded-lg border border-border bg-muted/30 hover:border-border transition-colors">
                      <div className="space-y-3">
                        <div>
                          <h5 className="font-semibold">{pkg.name}</h5>
                          <p className="text-xs text-muted-foreground capitalize">{pkg.tier}</p>
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{terminology?.learnerPlural || 'Learners'}:</span>
                            <span>{pkg.maxLearners}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{terminology?.educatorPlural || 'Instructors'}:</span>
                            <span>{pkg.maxTeachers}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Admins:</span>
                            <span>{pkg.maxOrgAdmins}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Monthly Credits:</span>
                            <span className="font-semibold">{pkg.monthlyCredits}</span>
                          </div>
                        </div>
                        {pkg.features && pkg.features.length > 0 && (
                          <div className="text-xs space-y-1">
                            {pkg.features.slice(0, 2).map((feature, idx) => (
                              <div key={idx} className="flex gap-2">
                                <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{feature}</span>
                              </div>
                            ))}
                            {pkg.features.length > 2 && (
                              <p className="text-muted-foreground text-xs">+{pkg.features.length - 2} more features</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full min-h-[44px]" onClick={() => setLocation('/subscription-admin')}
              data-testid="button-manage-packages"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Packages & Subscription
            </Button>
          </CardContent>
        </Card>

        {/* Billing Information - Collapsible on mobile */}
        <div className="block md:hidden">
          <CollapsibleSection
            title="Billing Information"
            description="How billing works"
            defaultOpen={false}
          >
            <div className="space-y-[var(--space-md)]">
              <div>
                <h4 className="font-medium mb-2 text-[length:var(--text-base)]">How Billing Works</h4>
                <p className="text-[length:var(--text-sm)] text-muted-foreground">
                  {studentLabel} are billed at {formatPrice(billingReport?.monthlyRate || 8.99, 'ZAR')} per month. Costs are prorated based on the join date, so you only pay for the days the {studentLabelLower} was active in your organization.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-[length:var(--text-base)]">Prorated Calculation</h4>
                <p className="text-[length:var(--text-sm)] text-muted-foreground">
                  Daily Rate = {formatPrice(billingReport?.monthlyRate || 8.99, 'ZAR')} ÷ Days in Month
                  <br />
                  Prorated Cost = Daily Rate × Days Remaining in Month (from join date)
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-[length:var(--text-base)]">Payment</h4>
                <p className="text-[length:var(--text-sm)] text-muted-foreground">
                  To arrange payment or for billing inquiries, please contact: <strong>sales@learnplay.co.za</strong>
                </p>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Billing Information - Card on desktop */}
        <div className="hidden md:block">
          <Card className="bg-surface-raised shadow-card">
            <CardHeader>
              <CardTitle data-testid="text-info-title">Billing Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">How Billing Works</h4>
                  <p className="text-sm text-muted-foreground">
                    {studentLabel} are billed at {formatPrice(billingReport?.monthlyRate || 8.99, 'ZAR')} per month. Costs are prorated based on the join date, so you only pay for the days the {studentLabelLower} was active in your organization.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Prorated Calculation</h4>
                  <p className="text-sm text-muted-foreground">
                    Daily Rate = {formatPrice(billingReport?.monthlyRate || 8.99, 'ZAR')} ÷ Days in Month
                    <br />
                    Prorated Cost = Daily Rate × Days Remaining in Month (from join date)
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Payment</h4>
                  <p className="text-sm text-muted-foreground">
                    To arrange payment or for billing inquiries, please contact: <strong>sales@learnplay.co.za</strong>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </QuizAdminLayout>
  );
}
