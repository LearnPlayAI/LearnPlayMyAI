import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { sortEnterpriseLicenseRecords } from '@shared/enterpriseLicenseOrdering';

function formatDate(date?: string) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString();
}

function statusBadge(status?: string) {
  if (status === 'active') return <Badge >Active</Badge>;
  if (status === 'suspended') return <Badge >Suspended</Badge>;
  if (status === 'inactive') return <Badge variant="secondary">Inactive</Badge>;
  return <Badge variant="outline">{status || 'unknown'}</Badge>;
}

function parseMoneyInput(input: string): number | null {
  const raw = String(input || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function formatMoneyForInput(input: unknown): string {
  const numeric = Number(input ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return '0.00';
  return numeric.toFixed(2);
}

function displayValue(...candidates: unknown[]): string {
  for (const value of candidates) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text.length > 0) return text;
  }
  return 'N/A';
}

function displaySystemName(system: any): string {
  const systemType = String(system?.systemType || 'System').trim();
  const host = displayValue(system?.internalHostname, system?.baseUrl, system?.name);
  return host === 'N/A' ? displayValue(system?.name, systemType) : `${systemType} ${host}`;
}

export default function EnterpriseCustomerDetails() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/superadmin/enterprise/customer/:id');
  const customerId = params?.id;
  const [systemPolicyDrafts, setSystemPolicyDrafts] = useState<Record<string, any>>({});
  const [detailsTab, setDetailsTab] = useState<'systems-policy' | 'registered-org-metrics'>('systems-policy');
  const [metricsSearch, setMetricsSearch] = useState('');
  const [metricsCurrencyFilter, setMetricsCurrencyFilter] = useState('all');
  const [metricsSort, setMetricsSort] = useState('organization-asc');
  const [metricsPage, setMetricsPage] = useState(1);
  const [deleteLicenseTargetId, setDeleteLicenseTargetId] = useState<string | null>(null);
  const [deleteLicenseReason, setDeleteLicenseReason] = useState('System license deleted by SuperAdmin');
  const metricsPageSize = 10;

  const { data: customer, isLoading, isError, error } = useQuery<any>({
    queryKey: ['/api/admin/enterprise/customers', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enterprise/customers/${customerId}`, { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load customer details');
      }
      return res.json();
    },
    enabled: !!customerId,
  });

  useEffect(() => {
    if (!customer?.systems) return;
    const nextDrafts: Record<string, any> = {};
    for (const system of customer.systems) {
      nextDrafts[system.id] = {
        monthlyFee: formatMoneyForInput(system.monthlyFee),
        feeCurrency: String(system.feeCurrency || 'USD').toUpperCase(),
        autoApproveRenewals: system.autoApproveRenewals === true,
        graceDays: Number(system.graceDays ?? 15),
        billingStatus: String(system.billingStatus || 'due'),
        royaltyPercentage: Number(system.royaltyPercentage ?? customer?.royaltyPercentage ?? 0),
      };
    }
    setSystemPolicyDrafts(nextDrafts);
  }, [customer?.systems]);

  const updateSystemPolicyMutation = useMutation({
    mutationFn: async ({ systemId, payload }: { systemId: string; payload: any }) => {
      if (!customerId) throw new Error('Missing customer id');
      return apiRequest(`/api/admin/enterprise/customers/${customerId}/systems/${systemId}/license-policy`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      }
      toast({ title: 'System license policy saved' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save system policy',
        description: error?.message || 'Unexpected error while saving policy',
        variant: 'destructive',
      });
    },
  });

  const deactivateSystemMutation = useMutation({
    mutationFn: async ({ systemId, reason }: { systemId: string; reason: string }) => {
      if (!customerId) throw new Error('Missing customer id');
      return apiRequest(`/api/admin/enterprise/customers/${customerId}/systems/${systemId}/license-deactivate`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      if (customerId) queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      toast({ title: 'System license deactivated' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to deactivate system license', description: error?.message || 'Unexpected error', variant: 'destructive' });
    },
  });

  const activateSystemMutation = useMutation({
    mutationFn: async ({ systemId }: { systemId: string }) => {
      if (!customerId) throw new Error('Missing customer id');
      return apiRequest(`/api/admin/enterprise/customers/${customerId}/systems/${systemId}/license-activate`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      if (customerId) queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      toast({ title: 'System license activated' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to activate system license', description: error?.message || 'Unexpected error', variant: 'destructive' });
    },
  });

  const deleteSystemLicenseMutation = useMutation({
    mutationFn: async ({ systemId, reason }: { systemId: string; reason: string }) => {
      if (!customerId) throw new Error('Missing customer id');
      return apiRequest(`/api/admin/enterprise/customers/${customerId}/systems/${systemId}/license`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      if (customerId) queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      setDeleteLicenseTargetId(null);
      setDeleteLicenseReason('System license deleted by SuperAdmin');
      toast({ title: 'System license deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete system license', description: error?.message || 'Unexpected error', variant: 'destructive' });
    },
  });

  const approveLicenseRequestMutation = useMutation({
    mutationFn: async ({ requestId }: { requestId: string }) => {
      return apiRequest(`/api/admin/enterprise/license-requests/${requestId}/approve`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/license-requests'] });
      toast({ title: 'License request approved' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to approve license request',
        description: error?.message || 'Unexpected error while approving request',
        variant: 'destructive',
      });
    },
  });

  const denyLicenseRequestMutation = useMutation({
    mutationFn: async ({ requestId, denialReason }: { requestId: string; denialReason: string }) => {
      return apiRequest(`/api/admin/enterprise/license-requests/${requestId}/deny`, {
        method: 'PUT',
        body: JSON.stringify({ denialReason }),
      });
    },
    onSuccess: () => {
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/license-requests'] });
      toast({ title: 'License request denied' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to deny license request',
        description: error?.message || 'Unexpected error while denying request',
        variant: 'destructive',
      });
    },
  });

  const sortedSystems = sortEnterpriseLicenseRecords(customer?.systems || []);
  const sortedLicenseRequests = sortEnterpriseLicenseRecords(customer?.licenseRequests || []);
  const activeLicenseSystems = sortedSystems.filter((system: any) =>
    String(system.status || '').toLowerCase() !== 'archived'
  );
  const pendingLicenseRequests = sortedLicenseRequests.filter((req: any) => String(req.status || '').toLowerCase() === 'pending');
  const deniedLicenseRequests = sortedLicenseRequests.filter((req: any) => String(req.status || '').toLowerCase() === 'denied');
  const metricsRows = Array.isArray(customer?.registeredOrganizationMetrics) ? customer.registeredOrganizationMetrics : [];

  const metricsCurrencies = useMemo(() => {
    const values = new Set<string>();
    for (const row of metricsRows) {
      if (row?.metricCurrency) values.add(String(row.metricCurrency).toUpperCase());
    }
    return Array.from(values).sort();
  }, [metricsRows]);

  const filteredMetricsRows = useMemo(() => {
    const needle = metricsSearch.trim().toLowerCase();
    const filtered = metricsRows.filter((row: any) => {
      if (metricsCurrencyFilter !== 'all' && String(row?.metricCurrency || '').toUpperCase() !== metricsCurrencyFilter) {
        return false;
      }
      if (!needle) return true;
      return String(row?.organizationName || '').toLowerCase().includes(needle);
    });

    filtered.sort((a: any, b: any) => {
      switch (metricsSort) {
        case 'organization-desc':
          return String(b?.organizationName || '').localeCompare(String(a?.organizationName || ''));
        case 'users-desc':
          return Number(b?.totalUsers || 0) - Number(a?.totalUsers || 0);
        case 'paid-value-desc':
          return Number(b?.totalPaidEnrollmentValue || 0) - Number(a?.totalPaidEnrollmentValue || 0);
        case 'last-report-desc':
          return new Date(String(b?.reportedAt || 0)).getTime() - new Date(String(a?.reportedAt || 0)).getTime();
        case 'organization-asc':
        default:
          return String(a?.organizationName || '').localeCompare(String(b?.organizationName || ''));
      }
    });

    return filtered;
  }, [metricsRows, metricsCurrencyFilter, metricsSearch, metricsSort]);

  const metricsTotalPages = Math.max(1, Math.ceil(filteredMetricsRows.length / metricsPageSize));
  const metricsSafePage = Math.min(metricsPage, metricsTotalPages);
  const metricsStartIndex = (metricsSafePage - 1) * metricsPageSize;
  const pagedMetricsRows = filteredMetricsRows.slice(metricsStartIndex, metricsStartIndex + metricsPageSize);

  useEffect(() => {
    setMetricsPage(1);
  }, [metricsSearch, metricsCurrencyFilter, metricsSort]);

  return (
    <QuizAdminLayout
      title={`Customer Details${customer?.companyName ? `: ${customer.companyName}` : ''}`}
      description="Enterprise customer detail view"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation('/superadmin/enterprise')}>Back</Button>
          {customerId && (
            <Button onClick={() => setLocation(`/superadmin/enterprise/customer/${customerId}/edit`)}>Edit</Button>
          )}
        </div>

        <Card className="text-foreground">
          <CardHeader>
            <CardTitle>Enterprise Customer</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Loading customer details...</div>
            ) : isError ? (
              <div className="text-destructive">{(error as Error)?.message || 'Failed to load customer details.'}</div>
            ) : !customer ? (
              <div className="text-muted-foreground">Customer not found.</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Company Name</Label>
                    <p className="font-medium">{displayValue(customer.companyName, customer.businessProfile?.businessName)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Contact Email</Label>
                    <p className="font-medium">{displayValue(customer.contactEmail, customer.businessProfile?.billingContactEmail)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Status</Label>
                    <div>{statusBadge(customer.status)}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Created</Label>
                    <p className="font-medium">{formatDate(customer.createdAt)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Royalty Percentage</Label>
                    <p className="font-medium">{Number(customer.royaltyPercentage || 0).toFixed(2)}%</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Contact Name</Label>
                    <p className="font-medium">{displayValue(customer.contactPersonName, customer.contactName, customer.businessProfile?.billingContactName)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Contact Phone</Label>
                    <p className="font-medium">{displayValue(customer.contactMobile, customer.contactPhone, customer.businessProfile?.billingContactPhone)}</p>
                  </div>
                  {customer.billingNotes && (
                    <div className="md:col-span-2">
                      <Label className="text-muted-foreground text-xs">Additional Notes</Label>
                      <p className="font-medium whitespace-pre-wrap">{customer.billingNotes}</p>
                    </div>
                  )}
                </div>

                <Tabs value={detailsTab} onValueChange={(value) => setDetailsTab(value as typeof detailsTab)} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="systems-policy">Systems License Policy</TabsTrigger>
                    <TabsTrigger value="registered-org-metrics">Registered Org Metrics</TabsTrigger>
                  </TabsList>

                  <TabsContent value="systems-policy" className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-2">Pending License Requests</h4>
                      {pendingLicenseRequests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No pending license requests.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>System Type</TableHead>
                              <TableHead>Request Type</TableHead>
                              <TableHead>Hostname</TableHead>
                              <TableHead>FQDN</TableHead>
                              <TableHead>Hardware Key</TableHead>
                              <TableHead>Requested At</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pendingLicenseRequests.map((req: any) => (
                              <TableRow key={req.id}>
                                <TableCell>{req.systemType || 'N/A'}</TableCell>
                                <TableCell>{req.requestType || 'initial'}</TableCell>
                                <TableCell>{req.hostname || 'N/A'}</TableCell>
                                <TableCell>{req.serverBaseUrl || 'N/A'}</TableCell>
                                <TableCell className="font-mono text-xs">{req.hardwareKey || 'N/A'}</TableCell>
                                <TableCell>{formatDate(req.createdAt)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setLocation(`/superadmin/enterprise/license-requests/${req.id}/review`)}
                                    >
                                      Review
                                    </Button>
                                    <Button size="sm" onClick={() => approveLicenseRequestMutation.mutate({ requestId: req.id })}
                                      disabled={approveLicenseRequestMutation.isPending}
                                    >
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => {
                                        const denialReason = window.prompt('Reason for denial:');
                                        if (!denialReason || !denialReason.trim()) return;
                                        denyLicenseRequestMutation.mutate({
                                          requestId: req.id,
                                          denialReason: denialReason.trim(),
                                        });
                                      }}
                                      disabled={denyLicenseRequestMutation.isPending}
                                    >
                                      Deny
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Approved Licenses</h4>
                      {activeLicenseSystems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No active system licenses yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>System Type</TableHead>
                              <TableHead>Hostname</TableHead>
                              <TableHead>FQDN</TableHead>
                              <TableHead>Hardware Key</TableHead>
                              <TableHead>Monthly Fee</TableHead>
                              <TableHead>Updated At</TableHead>
                              <TableHead>Next Renewal</TableHead>
                              <TableHead>License Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {activeLicenseSystems.map((system: any) => (
                              <TableRow key={system.id}>
                                <TableCell>{system.systemType || 'N/A'}</TableCell>
                                <TableCell>{system.internalHostname || 'N/A'}</TableCell>
                                <TableCell>{system.baseUrl || 'N/A'}</TableCell>
                                <TableCell className="font-mono text-xs">{system.hardwareKey || 'N/A'}</TableCell>
                                <TableCell>{system.monthlyFee ? `${system.feeCurrency || 'USD'} ${Number(system.monthlyFee).toFixed(2)}` : 'N/A'}</TableCell>
                                <TableCell>{formatDate(system.updatedAt || system.lastCheckInAt)}</TableCell>
                                <TableCell>{formatDate(system.nextCheckInDueAt || system.licenseExpiresAt)}</TableCell>
                                <TableCell>{system.licenseStatus || 'N/A'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Denied Requests</h4>
                      {deniedLicenseRequests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No denied requests.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>System Type</TableHead>
                              <TableHead>Request Type</TableHead>
                              <TableHead>Hostname</TableHead>
                              <TableHead>Denied At</TableHead>
                              <TableHead>Reason</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {deniedLicenseRequests.map((req: any) => (
                              <TableRow key={req.id}>
                                <TableCell>{req.systemType || 'N/A'}</TableCell>
                                <TableCell>{req.requestType || 'initial'}</TableCell>
                                <TableCell>{req.hostname || 'N/A'}</TableCell>
                                <TableCell>{formatDate(req.reviewedAt || req.updatedAt)}</TableCell>
                                <TableCell>{req.denialReason || 'N/A'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Systems License Policy</h4>
                      {sortedSystems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No systems synced yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {sortedSystems.map((system: any) => {
                        const draft = systemPolicyDrafts[system.id] || {
                          monthlyFee: formatMoneyForInput(system.monthlyFee),
                          feeCurrency: String(system.feeCurrency || 'USD').toUpperCase(),
                          autoApproveRenewals: system.autoApproveRenewals === true,
                          graceDays: Number(system.graceDays ?? 15),
                          billingStatus: String(system.billingStatus || 'due'),
                          royaltyPercentage: Number(system.royaltyPercentage ?? customer?.royaltyPercentage ?? 0),
                        };
                            return (
                              <div key={system.id} className="rounded-md border p-3 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              <div>
                                <Label className="text-xs text-muted-foreground">System</Label>
                                <p className="font-medium">{displaySystemName(system)}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Type</Label>
                                <p className="font-medium">{system.systemType || 'N/A'}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">License Status</Label>
                                <p className="font-medium">{system.licenseStatus || 'N/A'}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">License Expires</Label>
                                <p className="font-medium">{formatDate(system.licenseExpiresAt)}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                              <div>
                                <Label>Monthly Fee</Label>
                                <Input
                                  type="text"
                                  value={draft.monthlyFee}
                                  onChange={(e) => setSystemPolicyDrafts((prev) => ({
                                    ...prev,
                                    [system.id]: { ...draft, monthlyFee: e.target.value },
                                  }))}
                                />
                              </div>
                              <div>
                                <Label>Currency</Label>
                                <select
                                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                                  value={draft.feeCurrency}
                                  onChange={(e) => setSystemPolicyDrafts((prev) => ({
                                    ...prev,
                                    [system.id]: { ...draft, feeCurrency: e.target.value.toUpperCase() },
                                  }))}
                                >
                                  <option value="USD">USD</option>
                                  <option value="EUR">EUR</option>
                                  <option value="ZAR">ZAR</option>
                                </select>
                              </div>
                              <div>
                                <Label>Grace Days</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="30"
                                  value={draft.graceDays}
                                  onChange={(e) => setSystemPolicyDrafts((prev) => ({
                                    ...prev,
                                    [system.id]: { ...draft, graceDays: Number(e.target.value) },
                                  }))}
                                />
                              </div>
                              <div>
                                <Label>Billing Status</Label>
                                <select
                                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                                  value={draft.billingStatus}
                                  onChange={(e) => setSystemPolicyDrafts((prev) => ({
                                    ...prev,
                                    [system.id]: { ...draft, billingStatus: e.target.value },
                                  }))}
                                >
                                  <option value="due">due</option>
                                  <option value="paid">paid</option>
                                  <option value="overdue">overdue</option>
                                  <option value="waived">waived</option>
                                </select>
                              </div>
                              <div className="flex items-end">
                                <label className="inline-flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={draft.autoApproveRenewals === true}
                                    onChange={(e) => setSystemPolicyDrafts((prev) => ({
                                      ...prev,
                                      [system.id]: { ...draft, autoApproveRenewals: e.target.checked },
                                    }))}
                                  />
                                  Auto-Approve Renewals
                                </label>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                              <div>
                                <Label>Royalty Percentage (%)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={draft.royaltyPercentage ?? system.royaltyPercentage ?? 0}
                                  onChange={(e) => setSystemPolicyDrafts((prev) => ({
                                    ...prev,
                                    [system.id]: { ...draft, royaltyPercentage: Number(e.target.value) },
                                  }))}
                                />
                              </div>
                            </div>

                            {deleteLicenseTargetId === system.id && (
                              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-3">
                                <div>
                                  <p className="font-medium text-foreground">Confirm license deletion</p>
                                  <p className="text-sm text-muted-foreground">
                                    This revokes the current license and resets this system so a new license can be issued.
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`delete-license-reason-${system.id}`}>Reason</Label>
                                  <Input
                                    id={`delete-license-reason-${system.id}`}
                                    value={deleteLicenseReason}
                                    onChange={(event) => setDeleteLicenseReason(event.target.value)}
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setDeleteLicenseTargetId(null);
                                      setDeleteLicenseReason('System license deleted by SuperAdmin');
                                    }}
                                    disabled={deleteSystemLicenseMutation.isPending}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => {
                                      deleteSystemLicenseMutation.mutate({
                                        systemId: system.id,
                                        reason: deleteLicenseReason.trim() || 'System license deleted by SuperAdmin',
                                      });
                                    }}
                                    disabled={deleteSystemLicenseMutation.isPending}
                                  >
                                    Confirm Delete
                                  </Button>
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => activateSystemMutation.mutate({ systemId: system.id })}
                                disabled={activateSystemMutation.isPending}
                              >
                                Activate License
                              </Button>
                              <Button variant="destructive" onClick={() => {
                                  const reason = window.prompt('Reason for deactivation:');
                                  if (!reason || !reason.trim()) return;
                                  deactivateSystemMutation.mutate({ systemId: system.id, reason: reason.trim() });
                                }}
                                disabled={deactivateSystemMutation.isPending}
                              >
                                Deactivate License
                              </Button>
                              <Button variant="destructive" onClick={() => {
                                  setDeleteLicenseTargetId(system.id);
                                  setDeleteLicenseReason('System license deleted by SuperAdmin');
                                }}
                                disabled={deleteSystemLicenseMutation.isPending}
                              >
                                Delete License
                              </Button>
                              <Button onClick={() => {
                                  const monthlyFeeNum = parseMoneyInput(String(draft.monthlyFee || '0'));
                                  if (monthlyFeeNum === null) {
                                    toast({ title: 'Monthly fee is invalid. Use a comma or period as decimal delimiter.', variant: 'destructive' });
                                    return;
                                  }
                                  updateSystemPolicyMutation.mutate({
                                    systemId: system.id,
                                    payload: {
                                      monthlyFee: Number(monthlyFeeNum.toFixed(2)),
                                      feeCurrency: String(draft.feeCurrency || 'USD').toUpperCase(),
                                      autoApproveRenewals: draft.autoApproveRenewals === true,
                                      graceDays: Math.max(0, Math.min(30, Number(draft.graceDays || 0))),
                                      billingStatus: String(draft.billingStatus || 'due'),
                                      royaltyPercentage: Math.max(0, Math.min(100, Number(draft.royaltyPercentage ?? system.royaltyPercentage ?? 0))),
                                    },
                                  });
                                }}
                                disabled={updateSystemPolicyMutation.isPending}
                              >
                                Save Policy
                              </Button>
                            </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="registered-org-metrics" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Search</Label>
                        <Input
                          placeholder="Search organization name..."
                          value={metricsSearch}
                          onChange={(e) => setMetricsSearch(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Currency</Label>
                        <select
                          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                          value={metricsCurrencyFilter}
                          onChange={(e) => setMetricsCurrencyFilter(e.target.value)}
                        >
                          <option value="all">All currencies</option>
                          {metricsCurrencies.map((currency) => (
                            <option key={currency} value={currency}>{currency}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Sort</Label>
                        <select
                          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                          value={metricsSort}
                          onChange={(e) => setMetricsSort(e.target.value)}
                        >
                          <option value="organization-asc">Organization A-Z</option>
                          <option value="organization-desc">Organization Z-A</option>
                          <option value="users-desc">Most users</option>
                          <option value="paid-value-desc">Highest paid value</option>
                          <option value="last-report-desc">Latest report</option>
                        </select>
                      </div>
                    </div>

                    {filteredMetricsRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No registered organization metrics match current filters.</p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Organization</TableHead>
                              <TableHead>Users</TableHead>
                              <TableHead>Learner Seats</TableHead>
                              <TableHead>Instructor Seats</TableHead>
                              <TableHead>Courses</TableHead>
                              <TableHead>Enrollments</TableHead>
                              <TableHead>Paid Enrollments</TableHead>
                              <TableHead>Paid Value</TableHead>
                              <TableHead>Royalty Revenue</TableHead>
                              <TableHead>Currency</TableHead>
                              <TableHead>Last Report</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedMetricsRows.map((metric: any, idx: number) => (
                              <TableRow key={`${metric.organizationId || metric.organizationName || 'metric'}-${idx}`}>
                                <TableCell>{metric.organizationName || 'Unknown'}</TableCell>
                                <TableCell>{metric.totalUsers ?? 0}</TableCell>
                                <TableCell>{metric.totalLearners ?? 0}</TableCell>
                                <TableCell>{metric.totalTrainers ?? 0}</TableCell>
                                <TableCell>{metric.totalCourses ?? 0}</TableCell>
                                <TableCell>{metric.totalEnrollments ?? 0}</TableCell>
                                <TableCell>{metric.totalPaidCourseEnrollments ?? 0}</TableCell>
                                <TableCell>{Number(metric.totalPaidEnrollmentValue || 0).toFixed(2)}</TableCell>
                                <TableCell>{Number(metric.royaltyRevenueTotal || 0).toFixed(2)}</TableCell>
                                <TableCell>{metric.metricCurrency || 'USD'}</TableCell>
                                <TableCell>{formatDate(metric.reportedAt)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            Page {metricsSafePage} of {metricsTotalPages} ({filteredMetricsRows.length} results)
                          </p>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setMetricsPage((p) => Math.max(1, p - 1))} disabled={metricsSafePage <= 1}>
                              Previous
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setMetricsPage((p) => Math.min(metricsTotalPages, p + 1))} disabled={metricsSafePage >= metricsTotalPages}>
                              Next
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
