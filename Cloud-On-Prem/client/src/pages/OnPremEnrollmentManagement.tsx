import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Users, Check, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useUser } from '@/hooks/use-user';
import { usePlatformMode } from '@/hooks/usePlatformMode';

type Enrollment = {
  id: string;
  userId: string;
  courseId: string;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  purchasePrice: string;
  purchaseCurrency: string;
  checkoutId: string | null;
  purchasedAt: string;
  userName: string;
  userEmail: string;
  courseTitle: string;
  organizationName: string;
  userRole: string | null;
};

type EnrollmentResponse = {
  enrollments: Enrollment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type EnrollmentFilterOptions = {
  organizations: Array<{ id: string; name: string }>;
  roles: string[];
};

export default function OnPremEnrollmentManagement() {
  const { user } = useUser();
  const { onpremMode } = usePlatformMode();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [valueTypeFilter, setValueTypeFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [minPriceFilter, setMinPriceFilter] = useState<string>('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean; isCustSuper?: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthorized = adminCheck?.isSuperAdmin || adminCheck?.isCustSuper || false;

  if (!onpremMode) {
    return (
      <QuizAdminLayout title="On-Prem Enrollment Management" description="Manage on-prem enrollment records and payment reconciliation" activeSection="onprem-enrollments">
        <div className="max-w-4xl">
          <Card className="bg-card/50 border-border">
            <CardContent className="p-[var(--card-padding)]">
              <p className="text-muted-foreground">This feature is only available in on-premises mode.</p>
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  const { data, isLoading } = useQuery<EnrollmentResponse>({
    queryKey: [
      '/api/admin/onprem/enrollments',
      statusFilter,
      debouncedSearch,
      organizationFilter,
      roleFilter,
      valueTypeFilter,
      startDateFilter,
      endDateFilter,
      minPriceFilter,
      maxPriceFilter,
      currentPage,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (organizationFilter !== 'all') params.append('organizationId', organizationFilter);
      if (roleFilter !== 'all') params.append('userRole', roleFilter);
      if (valueTypeFilter !== 'all') params.append('valueType', valueTypeFilter);
      if (startDateFilter) params.append('startDate', startDateFilter);
      if (endDateFilter) params.append('endDate', endDateFilter);
      if (minPriceFilter) params.append('minPrice', minPriceFilter);
      if (maxPriceFilter) params.append('maxPrice', maxPriceFilter);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());

      const response = await fetch(`/api/admin/onprem/enrollments?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch enrollments');
      }
      return response.json();
    },
    enabled: !!user && isAuthorized,
  });

  const { data: filterOptions } = useQuery<EnrollmentFilterOptions>({
    queryKey: ['/api/admin/onprem/enrollments/filter-options'],
    queryFn: async () => {
      const response = await fetch('/api/admin/onprem/enrollments/filter-options');
      if (!response.ok) {
        throw new Error('Failed to load filter options');
      }
      return response.json();
    },
    enabled: !!user && isAuthorized,
    staleTime: 5 * 60 * 1000,
  });

  const enrollments = data?.enrollments || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  const markPaidMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      return await apiRequest(`/api/admin/onprem/enrollments/${enrollmentId}/mark-paid`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onprem/enrollments'] });
      toast({
        title: 'Success',
        description: 'Enrollment marked as completed',
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

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning border-[var(--warning)]/30',
    completed: 'bg-success/20 text-success border-[var(--success)]/30',
    refunded: 'bg-destructive/20 text-destructive border-[var(--destructive)]/30',
    failed: 'bg-destructive/20 text-destructive border-[var(--destructive)]/30',
  };

  if (!isAuthorized && !adminLoading) {
    return null;
  }

  if (isLoading || adminLoading) {
    return (
      <QuizAdminLayout
        title="Enrollment Management"
        description="Manage on-premises course enrollments"
        activeSection="enrollment-management"
      >
        <div className="space-y-[var(--space-md)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout
      title="Enrollment Management"
      description="Manage on-premises course enrollments"
      activeSection="enrollment-management"
    >
      <div className="mb-[var(--space-md)] flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-md)]">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or course..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 bg-muted border-border text-foreground min-h-[44px]"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-48 bg-muted border-border text-foreground min-h-[44px]">
            <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mb-[var(--space-lg)] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[var(--space-sm)]">
        <Select value={organizationFilter} onValueChange={(v) => { setOrganizationFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="All Organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {(filterOptions?.organizations || []).map((org) => (
              <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {(filterOptions?.roles || []).map((role) => (
              <SelectItem key={role} value={role}>{role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={valueTypeFilter} onValueChange={(v) => { setValueTypeFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground min-h-[44px]">
            <SelectValue placeholder="All Values" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Values</SelectItem>
            <SelectItem value="nonzero">Paid Value (&gt; 0)</SelectItem>
            <SelectItem value="zero">Zero Value (0)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-[var(--space-sm)]">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Min Value"
            value={minPriceFilter}
            onChange={(e) => { setMinPriceFilter(e.target.value); setCurrentPage(1); }}
            className="bg-muted border-border text-foreground min-h-[44px]"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Max Value"
            value={maxPriceFilter}
            onChange={(e) => { setMaxPriceFilter(e.target.value); setCurrentPage(1); }}
            className="bg-muted border-border text-foreground min-h-[44px]"
          />
        </div>
        <Input
          type="date"
          value={startDateFilter}
          onChange={(e) => { setStartDateFilter(e.target.value); setCurrentPage(1); }}
          className="bg-muted border-border text-foreground min-h-[44px]"
        />
        <Input
          type="date"
          value={endDateFilter}
          onChange={(e) => { setEndDateFilter(e.target.value); setCurrentPage(1); }}
          className="bg-muted border-border text-foreground min-h-[44px]"
        />
        <Button variant="outline" onClick={() => {
            setStatusFilter('all');
            setSearchQuery('');
            setDebouncedSearch('');
            setOrganizationFilter('all');
            setRoleFilter('all');
            setValueTypeFilter('all');
            setStartDateFilter('');
            setEndDateFilter('');
            setMinPriceFilter('');
            setMaxPriceFilter('');
            setCurrentPage(1);
          }}
          className="min-h-[44px]"
        >
          Clear Filters
        </Button>
      </div>
      <div className="mb-[var(--space-md)] text-sm text-muted-foreground whitespace-nowrap">
        {total} enrollment{total !== 1 ? 's' : ''} found
      </div>

      {enrollments.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-[var(--space-3xl)] text-center">
            <Users className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-[var(--space-md)] text-muted-foreground/30" />
            <p className="text-muted-foreground text-[length:var(--text-lg)]">No enrollments found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden lg:block">
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">User</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Course</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Organization</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Price</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enrollment) => (
                      <tr key={enrollment.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="text-sm font-medium text-foreground">{enrollment.userName || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{enrollment.userEmail}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm text-foreground max-w-[200px] truncate">{enrollment.courseTitle}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm text-foreground">{enrollment.organizationName}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm font-medium text-foreground">
                            {enrollment.purchaseCurrency} {parseFloat(enrollment.purchasePrice).toFixed(2)}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(enrollment.purchasedAt)}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={statusColors[enrollment.status] || ''}>
                            {enrollment.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {enrollment.status === 'pending' && (
                            <Button size="sm" onClick={() => markPaidMutation.mutate(enrollment.id)}
                              disabled={markPaidMutation.isPending}
                              className="bg-success hover:bg-success/90 text-success-foreground min-h-[36px]"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Mark Paid
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="lg:hidden space-y-[var(--space-sm)]">
            {enrollments.map((enrollment) => (
              <Card key={enrollment.id} className="bg-card border-border">
                <CardContent className="p-[var(--card-padding)]">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{enrollment.userName || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate">{enrollment.userEmail}</p>
                    </div>
                    <Badge variant="outline" className={`flex-shrink-0 ${statusColors[enrollment.status] || ''}`}>
                      {enrollment.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground mb-1 truncate">{enrollment.courseTitle}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>{enrollment.organizationName}</span>
                    <span>{formatDate(enrollment.purchasedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {enrollment.purchaseCurrency} {parseFloat(enrollment.purchasePrice).toFixed(2)}
                    </span>
                    {enrollment.status === 'pending' && (
                      <Button size="sm" onClick={() => markPaidMutation.mutate(enrollment.id)}
                        disabled={markPaidMutation.isPending}
                        className="bg-success hover:bg-success/90 text-success-foreground min-h-[36px]"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-[var(--space-lg)]">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-[var(--space-sm)]">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="min-h-[36px]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="min-h-[36px]"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </QuizAdminLayout>
  );
}
