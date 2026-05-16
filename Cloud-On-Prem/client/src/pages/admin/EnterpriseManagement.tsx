import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { sortEnterpriseLicenseRecords } from '@shared/enterpriseLicenseOrdering';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useLocation } from 'wouter';
import {
  Building2, Upload, FileText, Key, DollarSign, Shield,
  Eye, CheckCircle, XCircle, Trash2, ToggleLeft, ToggleRight,
  Plus, Download, Loader2
} from 'lucide-react';

type PagedResult<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export default function EnterpriseManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { onpremMode } = usePlatformMode();
  const [activeTab, setActiveTab] = useState('customers');

  if (onpremMode) {
    return (
      <QuizAdminLayout title="Enterprise Management" description="Manage enterprise customers, builds, licenses, agreements, and revenue">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center">Not Available</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              Enterprise management is only available in cloud mode.
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  const [revenueCustomerFilter, setRevenueCustomerFilter] = useState<string>('all');
  const [revenueTrackFilter, setRevenueTrackFilter] = useState<string>('production');
  const [revenueStartDate, setRevenueStartDate] = useState<string>('');
  const [revenueEndDate, setRevenueEndDate] = useState<string>('');
  const [revenueReportingCurrency, setRevenueReportingCurrency] = useState<string>('USD');
  const [revenueSearch, setRevenueSearch] = useState<string>('');

  const [selectedKeysCustomerId, setSelectedKeysCustomerId] = useState<string | null>(null);
  const [customersSearch, setCustomersSearch] = useState('');
  const [customersPage, setCustomersPage] = useState(1);
  const [customersTrackFilter, setCustomersTrackFilter] = useState('all');
  const [customersTrackStateFilter, setCustomersTrackStateFilter] = useState('all');
  const [buildsSearch, setBuildsSearch] = useState('');
  const [buildsPage, setBuildsPage] = useState(1);
  const [licenseSearch, setLicenseSearch] = useState('');
  const [licensePage, setLicensePage] = useState(1);
  const [licenseStatusFilter, setLicenseStatusFilter] = useState('all');
  const [licenseRequestTypeFilter, setLicenseRequestTypeFilter] = useState('all');
  const [agreementsSearch, setAgreementsSearch] = useState('');
  const [agreementsPage, setAgreementsPage] = useState(1);
  const [agreementsActiveFilter, setAgreementsActiveFilter] = useState('all');
  const [agreementsTypeFilter, setAgreementsTypeFilter] = useState('all');
  const [keysCustomerSearch, setKeysCustomerSearch] = useState('');
  const [keysCustomerPage, setKeysCustomerPage] = useState(1);
  const [keysSearch, setKeysSearch] = useState('');
  const [keysPage, setKeysPage] = useState(1);

  const {
    data: customersData,
    isLoading: customersLoading,
    isError: customersIsError,
    error: customersError,
  } = useQuery<PagedResult<any>>({
    queryKey: ['/api/admin/enterprise/customers', customersSearch, customersPage, customersTrackFilter, customersTrackStateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(customersPage),
        pageSize: '20',
      });
      if (customersSearch.trim()) params.set('search', customersSearch.trim());
      if (customersTrackFilter !== 'all') params.set('track', customersTrackFilter);
      if (customersTrackStateFilter !== 'all') params.set('trackState', customersTrackStateFilter);
      const res = await fetch(`/api/admin/enterprise/customers?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load customers');
      }
      return res.json();
    },
  });
  const customers = customersData?.items || [];

  const { data: keysCustomersData, isLoading: keysCustomersLoading } = useQuery<PagedResult<any>>({
    queryKey: ['/api/admin/enterprise/customers', 'keys-tab', keysCustomerSearch, keysCustomerPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(keysCustomerPage),
        pageSize: '20',
      });
      if (keysCustomerSearch.trim()) params.set('search', keysCustomerSearch.trim());
      const res = await fetch(`/api/admin/enterprise/customers?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load key customers');
      return res.json();
    },
  });
  const keysCustomers = keysCustomersData?.items || [];

  const { data: buildsData, isLoading: buildsLoading } = useQuery<PagedResult<any>>({
    queryKey: ['/api/admin/enterprise/builds', buildsSearch, buildsPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(buildsPage),
        pageSize: '20',
      });
      if (buildsSearch.trim()) params.set('search', buildsSearch.trim());
      const res = await fetch(`/api/admin/enterprise/builds?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load builds');
      return res.json();
    },
  });
  const builds = buildsData?.items || [];

  const { data: licenseRequestsData, isLoading: licensesLoading } = useQuery<PagedResult<any>>({
    queryKey: ['/api/admin/enterprise/license-requests', licenseSearch, licensePage, licenseStatusFilter, licenseRequestTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(licensePage),
        pageSize: '20',
      });
      if (licenseSearch.trim()) params.set('search', licenseSearch.trim());
      if (licenseStatusFilter !== 'all') params.set('status', licenseStatusFilter);
      if (licenseRequestTypeFilter !== 'all') params.set('requestType', licenseRequestTypeFilter);
      const res = await fetch(`/api/admin/enterprise/license-requests?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load license requests');
      return res.json();
    },
  });
  const licenseRequests = sortEnterpriseLicenseRecords(licenseRequestsData?.items || []);

  const { data: agreementsData, isLoading: agreementsLoading } = useQuery<PagedResult<any>>({
    queryKey: ['/api/admin/enterprise/agreements', agreementsSearch, agreementsPage, agreementsActiveFilter, agreementsTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(agreementsPage),
        pageSize: '20',
      });
      if (agreementsSearch.trim()) params.set('search', agreementsSearch.trim());
      if (agreementsActiveFilter !== 'all') params.set('isActive', agreementsActiveFilter);
      if (agreementsTypeFilter !== 'all') params.set('templateType', agreementsTypeFilter);
      const res = await fetch(`/api/admin/enterprise/agreements?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load agreements');
      return res.json();
    },
  });
  const agreements = agreementsData?.items || [];

  const { data: revenue, isLoading: revenueLoading } = useQuery<any>({
    queryKey: [
      '/api/admin/enterprise/revenue',
      revenueCustomerFilter,
      revenueTrackFilter,
      revenueStartDate,
      revenueEndDate,
      revenueReportingCurrency,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (revenueCustomerFilter !== 'all') params.set('enterpriseCustomerId', revenueCustomerFilter);
      params.set('systemType', revenueTrackFilter);
      if (revenueStartDate) params.set('startDate', revenueStartDate);
      if (revenueEndDate) params.set('endDate', revenueEndDate);
      if (revenueReportingCurrency) params.set('reportingCurrency', revenueReportingCurrency);
      const res = await fetch(`/api/admin/enterprise/revenue?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load revenue report');
      return res.json();
    },
  });

  const { data: customerKeysData, isLoading: customerKeysLoading } = useQuery<PagedResult<any>>({
    queryKey: ['/api/admin/enterprise/customers', selectedKeysCustomerId, 'keys', keysSearch, keysPage],
    queryFn: async () => {
      if (!selectedKeysCustomerId) {
        return {
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        };
      }
      const params = new URLSearchParams({
        page: String(keysPage),
        pageSize: '20',
      });
      if (keysSearch.trim()) params.set('search', keysSearch.trim());
      const res = await fetch(`/api/admin/enterprise/customers/${selectedKeysCustomerId}/keys?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        return {
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        };
      }
      return res.json();
    },
    enabled: !!selectedKeysCustomerId,
  });
  const customerKeys = customerKeysData?.items || [];

  const provisionKeysMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return await apiRequest(`/api/admin/enterprise/customers/${customerId}/keys/provision`, { method: 'POST' });
    },
    onSuccess: (data: any, customerId: string) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId, 'keys'] });
      if (selectedKeysCustomerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', selectedKeysCustomerId, 'keys'] });
      }
      const created = Number(data?.provisioning?.created || 0);
      const alreadyProvisioned = Number(data?.provisioning?.alreadyProvisioned || 0);
      toast({
        title: created > 0 ? 'Keys provisioned successfully' : 'No new keys required',
        description: created > 0
          ? `${created} new key(s) created${alreadyProvisioned > 0 ? `, ${alreadyProvisioned} already active` : ''}.`
          : `${alreadyProvisioned} key(s) were already provisioned and active.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to provision keys',
        description: error?.message || 'Unexpected error while provisioning keys',
        variant: 'destructive',
      });
    },
  });

  const reportingCurrency = (revenue?.reportingCurrency || 'USD') as string;
  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: reportingCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const activateCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/enterprise/customers/${id}/activate`, { method: 'PUT' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers'] });
      toast({ title: 'Customer activated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to activate customer', variant: 'destructive' });
    },
  });

  const suspendCustomerMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest(`/api/admin/enterprise/customers/${id}/suspend`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers'] });
      toast({ title: 'Customer suspended successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to suspend customer', variant: 'destructive' });
    },
  });

  const manualPropagationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/enterprise/propagation/license-context/manual', { method: 'POST' });
    },
    onSuccess: (data: any) => {
      const attempted = Number(data?.attemptedSystems || 0);
      const mirrored = Number(data?.mirroredSystems || 0);
      const failed = Array.isArray(data?.failures) ? data.failures.length : 0;
      toast({
        title: failed === 0 ? 'Manual propagation completed' : 'Manual propagation completed with warnings',
        description: `Attempted ${attempted} systems, mirrored ${mirrored}, failed ${failed}.`,
        variant: failed === 0 ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/telemetry'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Manual propagation failed',
        description: error?.message || 'Failed to trigger manual propagation',
        variant: 'destructive',
      });
    },
  });

  const toggleBuildMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/enterprise/builds/${id}`, { method: 'PUT' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/builds'] });
      toast({ title: 'Build status toggled' });
    },
    onError: () => {
      toast({ title: 'Failed to toggle build status', variant: 'destructive' });
    },
  });

  const deleteBuildMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/enterprise/builds/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/builds'] });
      toast({ title: 'Build deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete build', variant: 'destructive' });
    },
  });

  const toggleAgreementMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/enterprise/agreements/${id}`, { method: 'PUT' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/agreements'] });
      toast({ title: 'Agreement status toggled' });
    },
    onError: () => {
      toast({ title: 'Failed to toggle agreement status', variant: 'destructive' });
    },
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/enterprise/agreements/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/agreements'] });
      toast({ title: 'Agreement deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete agreement', variant: 'destructive' });
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge >Active</Badge>;
      case 'pending':
        return <Badge >Pending</Badge>;
      case 'suspended':
        return <Badge >Suspended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const trackBadge = (status?: string, reason?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') {
      return <Badge title={reason || undefined}>Active</Badge>;
    }
    if (normalized === 'stale') {
      return <Badge title={reason || undefined}>Stale</Badge>;
    }
    if (normalized === 'action_required') {
      return <Badge title={reason || undefined}>Action Required</Badge>;
    }
    if (normalized === 'expired') {
      return <Badge title={reason || undefined}>Expired</Badge>;
    }
    if (normalized === 'revoked') {
      return <Badge title={reason || undefined}>Revoked</Badge>;
    }
    return <Badge title={reason || undefined}>Inactive</Badge>;
  };

  const formatDate = (date: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const truncate = (str: string, len: number = 40) => {
    if (!str) return '—';
    return str.length > len ? str.substring(0, len) + '...' : str;
  };
  const containsText = (value: unknown, needle: string) => String(value || '').toLowerCase().includes(needle);

  const filteredRevenueRows = Array.isArray(revenue?.syncData)
    ? revenue.syncData.filter((row: any) => {
      if (!revenueSearch.trim()) return true;
      const needle = revenueSearch.trim().toLowerCase();
      return (
        containsText(row.companyName, needle) ||
        containsText(row.contactEmail, needle) ||
        containsText(row.billingContactEmail, needle) ||
        containsText(row.systemType, needle)
      );
    })
    : [];

  const renderPagination = (pagination?: { page: number; totalPages: number; total: number; hasNext: boolean; hasPrev: boolean }, onPrev?: () => void, onNext?: () => void) => {
    if (!pagination) return null;
    return (
      <div className="flex items-center justify-between gap-2 mt-4">
        <p className="text-xs text-muted-foreground">
          Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrev} disabled={!pagination.hasPrev}>Previous</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!pagination.hasNext}>Next</Button>
        </div>
      </div>
    );
  };

  return (
    <QuizAdminLayout title="Enterprise Management" description="Manage enterprise customers, builds, licenses, agreements, and revenue">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Enterprise Management</h1>
        <p className="text-muted-foreground">Manage enterprise customers, builds, licenses, agreements, and revenue</p>
        <div className="mt-3">
          <Button variant="outline" onClick={() => manualPropagationMutation.mutate()}
            disabled={manualPropagationMutation.isPending}
          >
            {manualPropagationMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Propagate PRD Context to ACC/DEV
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 mb-6">
          <TabsList className="inline-flex sm:grid w-full sm:w-full min-w-max sm:min-w-0 h-auto sm:grid-cols-6">
            <TabsTrigger value="customers" className="flex items-center gap-2 text-xs sm:text-sm py-2 min-h-[44px]">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Enterprise Customers</span>
              <span className="sm:hidden">Customers</span>
            </TabsTrigger>
            <TabsTrigger value="builds" className="flex items-center gap-2 text-xs sm:text-sm py-2 min-h-[44px]">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Build Versions</span>
              <span className="sm:hidden">Builds</span>
            </TabsTrigger>
            <TabsTrigger value="licenses" className="flex items-center gap-2 text-xs sm:text-sm py-2 min-h-[44px]">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">License Requests</span>
              <span className="sm:hidden">Licenses</span>
            </TabsTrigger>
            <TabsTrigger value="agreements" className="flex items-center gap-2 text-xs sm:text-sm py-2 min-h-[44px]">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Agreement Templates</span>
              <span className="sm:hidden">Agreements</span>
            </TabsTrigger>
            <TabsTrigger value="keys" className="flex items-center gap-2 text-xs sm:text-sm py-2 min-h-[44px]">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Encryption Keys</span>
              <span className="sm:hidden">Keys</span>
            </TabsTrigger>
            <TabsTrigger value="revenue" className="flex items-center gap-2 text-xs sm:text-sm py-2 min-h-[44px]">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Revenue Overview</span>
              <span className="sm:hidden">Revenue</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Enterprise Customers */}
        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Enterprise Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <Input
                  placeholder="Search customers..."
                  value={customersSearch}
                  onChange={(e) => {
                    setCustomersSearch(e.target.value);
                    setCustomersPage(1);
                  }}
                />
                <Select value={customersTrackFilter} onValueChange={(v) => { setCustomersTrackFilter(v); setCustomersPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Track" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tracks</SelectItem>
                    <SelectItem value="development">DEV</SelectItem>
                    <SelectItem value="qa">ACC</SelectItem>
                    <SelectItem value="production">PRD</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={customersTrackStateFilter} onValueChange={(v) => { setCustomersTrackStateFilter(v); setCustomersPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Track State" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="action_required">Action Required</SelectItem>
                      <SelectItem value="stale">Stale</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="revoked">Revoked</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              {customersLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading customers...</div>
              ) : customersIsError ? (
                <div className="text-center py-8 text-destructive">
                  {(customersError as Error)?.message || 'Failed to load enterprise customers'}
                </div>
              ) : customers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No enterprise customers found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Contact Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>DEV</TableHead>
                        <TableHead>ACC</TableHead>
                        <TableHead>PRD</TableHead>
                        <TableHead>Sub-Companies</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer: any) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.companyName}</TableCell>
                          <TableCell>{customer.contactEmail}</TableCell>
                          <TableCell>{statusBadge(customer.status)}</TableCell>
                          <TableCell>{trackBadge(customer.devTrackStatus, customer.devTrackReason || null)}</TableCell>
                          <TableCell>{trackBadge(customer.accTrackStatus, customer.accTrackReason || null)}</TableCell>
                          <TableCell>{trackBadge(customer.prdTrackStatus, customer.prdTrackReason || null)}</TableCell>
                          <TableCell>{customer.subCompanyCount ?? 0}</TableCell>
                          <TableCell>{formatDate(customer.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => setLocation(`/superadmin/enterprise/customer/${customer.id}`)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Details
                              </Button>
                              {customer.status !== 'active' && (
                                <Button variant="outline" size="sm" onClick={() => activateCustomerMutation.mutate(customer.id)}
                                  disabled={activateCustomerMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Activate
                                </Button>
                              )}
                              {customer.status !== 'suspended' && (
                                <Button variant="outline" size="sm" onClick={() => {
                                    const reason = window.prompt('Reason for suspension:');
                                    if (!reason || !reason.trim()) return;
                                    suspendCustomerMutation.mutate({ id: customer.id, reason: reason.trim() });
                                  }}
                                  disabled={suspendCustomerMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Suspend
                                </Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => setLocation(`/superadmin/enterprise/customer/${customer.id}/edit`)}
                              >
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setLocation(`/superadmin/enterprise/customer/${customer.id}/delete`)}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {renderPagination(
                customersData?.pagination,
                () => setCustomersPage((p) => Math.max(1, p - 1)),
                () => setCustomersPage((p) => p + 1),
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Build Versions */}
        <TabsContent value="builds">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Build Versions</CardTitle>
              <Button onClick={() => setLocation('/superadmin/enterprise/builds/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Build
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Search builds..."
                  value={buildsSearch}
                  onChange={(e) => {
                    setBuildsSearch(e.target.value);
                    setBuildsPage(1);
                  }}
                />
              </div>
              {buildsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading builds...</div>
              ) : builds.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No builds found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Release Notes</TableHead>
                        <TableHead>File Size</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {builds.map((build: any) => (
                        <TableRow key={build.id}>
                          <TableCell className="font-medium">{build.versionNumber}</TableCell>
                          <TableCell>{truncate(build.releaseNotes, 50)}</TableCell>
                          <TableCell>{formatFileSize(build.fileSize)}</TableCell>
                          <TableCell>{formatDate(build.createdAt)}</TableCell>
                          <TableCell>
                            {build.isActive ? (
                              <Badge >Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => toggleBuildMutation.mutate(build.id)}
                                disabled={toggleBuildMutation.isPending}
                              >
                                {build.isActive ? (
                                  <ToggleRight className="h-4 w-4 mr-1" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 mr-1" />
                                )}
                                {build.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                              {build.downloadUrl && (
                                <Button variant="outline" size="sm" onClick={() => window.open(build.downloadUrl, '_blank')}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Download
                                </Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => deleteBuildMutation.mutate(build.id)}
                                disabled={deleteBuildMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {renderPagination(
                buildsData?.pagination,
                () => setBuildsPage((p) => Math.max(1, p - 1)),
                () => setBuildsPage((p) => p + 1),
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: License Requests */}
        <TabsContent value="licenses">
          <Card>
            <CardHeader>
              <CardTitle>License Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <Input
                  placeholder="Search license requests..."
                  value={licenseSearch}
                  onChange={(e) => {
                    setLicenseSearch(e.target.value);
                    setLicensePage(1);
                  }}
                />
                <Select value={licenseStatusFilter} onValueChange={(v) => { setLicenseStatusFilter(v); setLicensePage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={licenseRequestTypeFilter} onValueChange={(v) => { setLicenseRequestTypeFilter(v); setLicensePage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Request Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Request Types</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="replacement">Replacement</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {licensesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading license requests...</div>
              ) : licenseRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No license requests found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Request Type</TableHead>
                        <TableHead>System Type</TableHead>
                        <TableHead>Hardware Key</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Monthly Fee</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {licenseRequests.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.customerCompanyName || req.companyName || '—'}</TableCell>
                          <TableCell className="capitalize">{req.requestType || 'new'}</TableCell>
                          <TableCell>{req.systemType}</TableCell>
                          <TableCell className="font-mono text-xs">{truncate(req.hardwareKey, 20)}</TableCell>
                          <TableCell>{req.hostname}</TableCell>
                          <TableCell>{statusBadge(req.status)}</TableCell>
                          <TableCell>
                            {req.monthlyFee ? `${req.feeCurrency || 'USD'} ${Number(req.monthlyFee).toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell>{formatDate(req.createdAt)}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => setLocation(`/superadmin/enterprise/license-requests/${req.id}/review`)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {renderPagination(
                licenseRequestsData?.pagination,
                () => setLicensePage((p) => Math.max(1, p - 1)),
                () => setLicensePage((p) => p + 1),
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Agreement Templates */}
        <TabsContent value="agreements">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Agreement Templates</CardTitle>
              <Button onClick={() => setLocation('/superadmin/enterprise/agreements/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Template
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <Input
                  placeholder="Search agreements..."
                  value={agreementsSearch}
                  onChange={(e) => {
                    setAgreementsSearch(e.target.value);
                    setAgreementsPage(1);
                  }}
                />
                <Select value={agreementsTypeFilter} onValueChange={(v) => { setAgreementsTypeFilter(v); setAgreementsPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Template Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="license_agreement">License Agreement</SelectItem>
                    <SelectItem value="sla">SLA</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={agreementsActiveFilter} onValueChange={(v) => { setAgreementsActiveFilter(v); setAgreementsPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {agreementsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading agreements...</div>
              ) : agreements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No agreement templates found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agreements.map((agreement: any) => (
                        <TableRow key={agreement.id}>
                          <TableCell className="font-medium">{agreement.templateName}</TableCell>
                          <TableCell>
                            {agreement.templateType === 'sla' ? 'SLA' : 'License Agreement'}
                          </TableCell>
                          <TableCell>{agreement.version}</TableCell>
                          <TableCell>
                            {agreement.isActive ? (
                              <Badge >Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(agreement.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => toggleAgreementMutation.mutate(agreement.id)}
                                disabled={toggleAgreementMutation.isPending}
                              >
                                {agreement.isActive ? (
                                  <ToggleRight className="h-4 w-4 mr-1" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 mr-1" />
                                )}
                                {agreement.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                              {agreement.downloadUrl && (
                                <Button variant="outline" size="sm" onClick={() => window.open(agreement.downloadUrl, '_blank')}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Download
                                </Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => deleteAgreementMutation.mutate(agreement.id)}
                                disabled={deleteAgreementMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {renderPagination(
                agreementsData?.pagination,
                () => setAgreementsPage((p) => Math.max(1, p - 1)),
                () => setAgreementsPage((p) => p + 1),
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys">
          <Card>
            <CardHeader>
              <CardTitle>Encryption Keys Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Search customers for keys..."
                  value={keysCustomerSearch}
                  onChange={(e) => {
                    setKeysCustomerSearch(e.target.value);
                    setKeysCustomerPage(1);
                  }}
                />
              </div>
              {keysCustomersLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading customers...</div>
              ) : keysCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No enterprise customers found</div>
              ) : (
                <div className="space-y-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {keysCustomers.map((customer: any) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.companyName}</TableCell>
                            <TableCell>{statusBadge(customer.status)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => {
                                    setSelectedKeysCustomerId(selectedKeysCustomerId === customer.id ? null : customer.id);
                                    setKeysPage(1);
                                    setKeysSearch('');
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  {selectedKeysCustomerId === customer.id ? 'Hide Keys' : 'View Keys'}
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                    setSelectedKeysCustomerId(customer.id);
                                    provisionKeysMutation.mutate(customer.id);
                                  }}
                                  disabled={provisionKeysMutation.isPending}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Provision Keys
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => window.open(`/api/admin/enterprise/customers/${customer.id}/keys/bundle`, '_blank')}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Bundle
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {renderPagination(
                    keysCustomersData?.pagination,
                    () => setKeysCustomerPage((p) => Math.max(1, p - 1)),
                    () => setKeysCustomerPage((p) => p + 1),
                  )}

                  {selectedKeysCustomerId && (
                    <Card className="border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          Keys for {(keysCustomers.find((c: any) => c.id === selectedKeysCustomerId) || customers.find((c: any) => c.id === selectedKeysCustomerId))?.companyName || selectedKeysCustomerId}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="p-4 pb-0">
                          <Input
                            placeholder="Search key ID or purpose..."
                            value={keysSearch}
                            onChange={(e) => {
                              setKeysSearch(e.target.value);
                              setKeysPage(1);
                            }}
                          />
                        </div>
                        {customerKeysLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : customerKeys.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p>No keys provisioned for this customer</p>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Purpose</TableHead>
                                <TableHead>Key ID</TableHead>
                                <TableHead>Version</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {customerKeys.map((key: any) => (
                                <TableRow key={key.id}>
                                  <TableCell className="font-medium capitalize">{key.purpose}</TableCell>
                                  <TableCell className="font-mono text-xs">{truncate(key.keyId, 20)}</TableCell>
                                  <TableCell>{key.keyVersion || 1}</TableCell>
                                  <TableCell>
                                    {key.isActive ? (
                                      <Badge >Active</Badge>
                                    ) : (
                                      <Badge variant="secondary">Retired</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                        <div className="px-4 pb-4">
                          {renderPagination(
                            customerKeysData?.pagination,
                            () => setKeysPage((p) => Math.max(1, p - 1)),
                            () => setKeysPage((p) => p + 1),
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Report Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Search</Label>
                    <Input
                      placeholder="Search revenue rows..."
                      value={revenueSearch}
                      onChange={(e) => setRevenueSearch(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Customer</Label>
                    <Select value={revenueCustomerFilter} onValueChange={setRevenueCustomerFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {customers.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Track</Label>
                    <Select value={revenueTrackFilter} onValueChange={setRevenueTrackFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="production">PRD</SelectItem>
                        <SelectItem value="qa">ACC</SelectItem>
                        <SelectItem value="development">DEV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" value={revenueStartDate} onChange={(e) => setRevenueStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" value={revenueEndDate} onChange={(e) => setRevenueEndDate(e.target.value)} />
                  </div>
                  <div className="hidden md:block" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Reporting Currency</Label>
                    <Select value={revenueReportingCurrency} onValueChange={setRevenueReportingCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="ZAR">ZAR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {revenueLoading ? '...' : currencyFormatter.format(Number(revenue?.totalRevenue || 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Royalty Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {revenueLoading ? '...' : currencyFormatter.format(Number(revenue?.totalRoyaltyRevenue || 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">License Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {revenueLoading ? '...' : currencyFormatter.format(Number(revenue?.totalLicenseRevenue || 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Active Licenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {revenueLoading ? '...' : (revenue?.activeLicensesCount ?? 0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Enterprise Revenue & Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                {!revenueLoading && Array.isArray(revenue?.conversionWarnings) && revenue.conversionWarnings.length > 0 && (
                  <div className="mb-3 rounded-md border border-[var(--warning)]/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {revenue.conversionWarnings.join(' ')}
                  </div>
                )}
                {revenueLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading revenue data...</div>
                ) : filteredRevenueRows.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No revenue sync data available</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead>License Count</TableHead>
                          <TableHead>Royalty %</TableHead>
                          <TableHead>Monthly Revenue</TableHead>
                          <TableHead>Royalty Revenue</TableHead>
                          <TableHead>Paid Enrollments</TableHead>
                          <TableHead>Free Enrollments</TableHead>
                          <TableHead>Paid Enroll Value</TableHead>
                          <TableHead>Free Enroll Value</TableHead>
                          <TableHead>Paid Completions</TableHead>
                          <TableHead>Free Completions</TableHead>
                          <TableHead>Paid Completion Value</TableHead>
                          <TableHead>Free Completion Value</TableHead>
                          <TableHead>Last Synced</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRevenueRows.map((row: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.companyName}</TableCell>
                            <TableCell>{row.licenseCount}</TableCell>
                            <TableCell>{Number(row.royaltyPercentage || 0).toFixed(2)}%</TableCell>
                            <TableCell>{currencyFormatter.format(Number(row.monthlyRevenue || 0))}</TableCell>
                            <TableCell>{currencyFormatter.format(Number(row.royaltyRevenue || 0))}</TableCell>
                            <TableCell>{row.totalPaidCourseEnrollments || 0}</TableCell>
                            <TableCell>{row.totalFreeCourseEnrollments || 0}</TableCell>
                            <TableCell>{currencyFormatter.format(Number(row.totalPaidEnrollmentValue || 0))}</TableCell>
                            <TableCell>{currencyFormatter.format(Number(row.totalFreeEnrollmentValue || 0))}</TableCell>
                            <TableCell>{row.totalPaidCourseCompletions || 0}</TableCell>
                            <TableCell>{row.totalFreeCourseCompletions || 0}</TableCell>
                            <TableCell>{currencyFormatter.format(Number(row.totalPaidCompletionValue || 0))}</TableCell>
                            <TableCell>{currencyFormatter.format(Number(row.totalFreeCourseCompletionsValue || 0))}</TableCell>
                            <TableCell>{formatDate(row.lastSyncedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </QuizAdminLayout>
  );
}
