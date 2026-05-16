import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Users, AlertCircle, Download, Calendar, Trash2, TrendingUp, Package } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { tzFormat } from '@/utils/timezoneRuntime';

interface OrganizationWithPackage {
  id: string;
  name: string;
  inviteCode: string;
  isDemo: boolean;
  trialEndDate: string | null;
  createdAt: string;
  contactPhone?: string;
  packageTier: string;
  packageName: string;
  packageStatus: string;
  studentCount: number;
  seatUtilization: {
    learners: { current: number; max: number };
    teachers: { current: number; max: number };
    admins: { current: number; max: number };
  } | null;
  mrrContribution: string;
  totalUsers?: number;
  activeUsers?: number;
  adminCount?: number;
  teacherCount?: number;
  learnerCount?: number;
  isActive?: boolean;
  isMainOrganization?: boolean;
  type?: string;
}

interface OrganizationMetrics {
  totalOrgs: number;
  activeTrials: number;
  expiredTrials: number;
  totalMRR: number;
  packageDistribution: Record<string, { name: string; count: number }>;
}

export default function OrganizationAnalytics() {
  const { isSuperAdmin, isCustSuper } = useAuth();
  const { onpremMode } = usePlatformMode();
  const [, setLocation] = useLocation();
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<any>(null);
  const { toast } = useToast();

  const { data: organizations = [], isLoading } = useQuery<OrganizationWithPackage[]>({
    queryKey: ['/api/superadmin/organizations'],
  });

  const { data: metrics } = useQuery<OrganizationMetrics>({
    queryKey: ['/api/superadmin/metrics'],
  });

  const toggleDemoMutation = useMutation({
    mutationFn: async ({ organizationId, isDemo }: { organizationId: string; isDemo: boolean }) => {
      return await apiRequest(`/api/admin/organizations/${organizationId}/toggle-demo`, {
        method: 'POST',
        body: JSON.stringify({ isDemo }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      toast({
        title: 'Success',
        description: 'Organization demo status updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update demo status',
        variant: 'destructive',
      });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      return await apiRequest(`/api/admin/organizations/${organizationId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      toast({
        title: 'Success',
        description: 'Organization and all related data deleted successfully',
      });
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete organization',
        variant: 'destructive',
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ organizationId, isActive }: { organizationId: string; isActive: boolean }) => {
      return await apiRequest(`/api/superadmin/organizations/${organizationId}/active`, {
        method: 'POST',
        body: JSON.stringify({ isActive }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      toast({
        title: 'Success',
        description: 'Organization status updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update organization status',
        variant: 'destructive',
      });
    },
  });

  const setMainOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      return await apiRequest(`/api/superadmin/organizations/main`, {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/metrics'] });
      toast({
        title: 'Success',
        description: 'Main organization updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to set main organization',
        variant: 'destructive',
      });
    },
  });

  const handleDeleteClick = (org: any) => {
    setOrgToDelete(org);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (orgToDelete) {
      deleteOrgMutation.mutate(orgToDelete.id);
    }
  };

  const filteredOrgs = organizations.filter((org: any) =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.inviteCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTrialStatusBadge = (org: any) => {
    if (org.isDemo) {
      return <Badge variant="default" data-testid={`badge-trial-demo-${org.id}`}>
        Demo - Always Active
      </Badge>;
    }
    
    if (!org.trialEndDate) return <Badge variant="outline">No Trial</Badge>;
    
    const daysRemaining = differenceInDays(new Date(org.trialEndDate), new Date());
    const isExpired = daysRemaining <= 0;
    const isUrgent = daysRemaining <= 7 && daysRemaining > 0;

    if (isExpired) {
      return <Badge variant="destructive" data-testid={`badge-trial-expired-${org.id}`}>Expired</Badge>;
    }
    if (isUrgent) {
      return <Badge variant="outline" data-testid={`badge-trial-urgent-${org.id}`}>
        {daysRemaining}d left
      </Badge>;
    }
    return <Badge variant="default" data-testid={`badge-trial-active-${org.id}`}>
      Active ({daysRemaining}d)
    </Badge>;
  };

  const getOrgStatusBadge = (org: any) => {
    if (onpremMode) {
      return org.isActive === false
        ? <Badge variant="destructive" >deactivated</Badge>
        : <Badge variant="default" >active</Badge>;
    }
    if (org.isActive === false) {
      return <Badge variant="destructive" >disabled</Badge>;
    }
    if (org.isDemo) {
      return <Badge variant="default" >demo</Badge>;
    }
    if (org.subscriptionStatus === 'trial') {
      return <Badge variant="outline" >trial</Badge>;
    }
    if (org.subscriptionStatus === 'active' || org.isActive !== false) {
      return <Badge variant="default" >active</Badge>;
    }
    return <Badge variant="outline">{org.subscriptionStatus || 'unknown'}</Badge>;
  };

  const exportToCSV = () => {
    const headers = [`Organization,Invite Code,Trial Status,Days Remaining,Trial End Date,${terminology!.learnerPlural} Count,Package Tier,Seat Utilization,MRR,Contact Phone,Created At`];
    const rows = filteredOrgs.map((org: any) => {
      if (org.isDemo) {
        const seatUtilization = org.seatUtilization ? 
          `${terminology!.learnerPlural}: ${org.seatUtilization.learners.current}/${org.seatUtilization.learners.max}, ${terminology!.educatorPlural}: ${org.seatUtilization.teachers.current}/${org.seatUtilization.teachers.max}` : 'N/A';
        return [
          org.name,
          org.inviteCode,
          'Demo - Always Active',
          'N/A',
          'N/A',
          org.studentCount || 0,
          org.packageTier || 'N/A',
          seatUtilization,
          org.mrrContribution || 'N/A',
          org.contactPhone || '',
          tzFormat(org.createdAt, 'yyyy-MM-dd')
        ].join(',');
      }
      
      const daysRemaining = org.trialEndDate ? differenceInDays(new Date(org.trialEndDate), new Date()) : 0;
      const seatUtilization = org.seatUtilization ? 
        `${terminology!.learnerPlural}: ${org.seatUtilization.learners.current}/${org.seatUtilization.learners.max}, ${terminology!.educatorPlural}: ${org.seatUtilization.teachers.current}/${org.seatUtilization.teachers.max}` : 'N/A';
      return [
        org.name,
        org.inviteCode,
        daysRemaining > 0 ? 'Active' : 'Expired',
        daysRemaining,
        org.trialEndDate ? tzFormat(org.trialEndDate, 'yyyy-MM-dd') : '',
        org.studentCount || 0,
        org.packageTier || 'N/A',
        seatUtilization,
        org.mrrContribution || 'N/A',
        org.contactPhone || '',
        tzFormat(org.createdAt, 'yyyy-MM-dd')
      ].join(',');
    });

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `organizations_${tzFormat(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  if (!isSuperAdmin && !isCustSuper) {
    setLocation('/');
    return null;
  }

  if (!isResolved || !terminology || !terminologyLower) {
    return null;
  }

  return (
    <QuizAdminLayout 
      title="Organization Analytics" 
      description={`Monitor trial status and ${terminologyLower.learner} enrollment`}
      activeSection="organization-analytics"
    >
      <div className="space-y-[var(--space-lg)] p-[var(--container-padding)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-[var(--space-md)]">
          <Button onClick={exportToCSV} variant="outline" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Metrics Overview */}
        {onpremMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--card-gap)]">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Total Organizations</CardTitle>
                <Building2 className="h-4 w-4 text-chart-1" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-total-orgs">
                  {organizations.length}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  {metrics?.activeTrials || 0} active trials
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Total Users</CardTitle>
                <Users className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-total-users">
                  {organizations.reduce((sum: number, org: any) => sum + (org.totalUsers || 0), 0)}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  Across all organizations
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border sm:col-span-2 md:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Expiring Soon</CardTitle>
                <AlertCircle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-expiring-soon">
                  {organizations.filter((org: any) => {
                    if (org.isDemo) return false;
                    if (!org.trialEndDate) return false;
                    const days = differenceInDays(new Date(org.trialEndDate), new Date());
                    return days > 0 && days <= 7;
                  }).length}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  Within 7 days
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--card-gap)]">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Total Organizations</CardTitle>
                <Building2 className="h-4 w-4 text-chart-1" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-total-orgs">
                  {organizations.length}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  {metrics?.activeTrials || 0} active trials
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Total {terminology.learnerPlural}</CardTitle>
                <Users className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-total-students">
                  {organizations.reduce((sum: number, org: any) => sum + (org.studentCount || 0), 0)}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  Approved across all organizations
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border sm:col-span-2 md:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Expiring Soon</CardTitle>
                <AlertCircle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-expiring-soon">
                  {organizations.filter((org: any) => {
                    if (org.isDemo) return false;
                    if (!org.trialEndDate) return false;
                    const days = differenceInDays(new Date(org.trialEndDate), new Date());
                    return days > 0 && days <= 7;
                  }).length}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  Within 7 days
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Total MRR</CardTitle>
                <TrendingUp className="h-4 w-4 text-chart-2" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="text-[length:var(--text-2xl)] font-bold text-foreground" data-testid="text-total-mrr">
                  ${metrics?.totalMRR || '0'}
                </div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  Monthly recurring revenue
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border sm:col-span-2 md:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-sm)] font-medium text-muted-foreground">Package Distribution</CardTitle>
                <Package className="h-4 w-4 text-chart-3" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="space-y-2">
                  {metrics?.packageDistribution && Object.entries(metrics.packageDistribution).map(([tier, data]: [string, any]) => (
                    <div key={tier} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{data.name}:</span>
                      <span className="font-semibold text-foreground">{data.count || 0}</span>
                    </div>
                  ))}
                  {!metrics?.packageDistribution || Object.keys(metrics.packageDistribution).length === 0 && (
                    <p className="text-[length:var(--text-xs)] text-muted-foreground">No packages assigned</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Organizations Table */}
        {onpremMode ? (
          <Card className="bg-card border-border">
            <CardHeader className="p-[var(--card-padding)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)]">
                <div>
                  <CardTitle className="text-foreground text-[length:var(--text-xl)]">Organization Performance</CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Detailed breakdown by organization
                  </CardDescription>
                </div>
                <Input
                  placeholder="Search organizations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:max-w-xs bg-muted border-border text-foreground min-h-[44px]"
                  data-testid="input-search-orgs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-[var(--card-padding)] pt-0">
              <div className="rounded-md border border-border overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-muted">
                      <TableHead className="text-muted-foreground">Main</TableHead>
                      <TableHead className="text-muted-foreground">Organization</TableHead>
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Users</TableHead>
                      <TableHead className="text-muted-foreground">Active</TableHead>
                      <TableHead className="text-muted-foreground">Admins</TableHead>
                      <TableHead className="text-muted-foreground">{terminology.educatorPlural}</TableHead>
                      <TableHead className="text-muted-foreground">{terminology.learnerPlural}</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          Loading organizations...
                        </TableCell>
                      </TableRow>
                    ) : filteredOrgs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No organizations found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrgs.map((org: any) => (
                        <TableRow key={org.id} className="border-border hover:bg-muted" data-testid={`row-org-${org.id}`}>
                          <TableCell>
                            <Switch
                              checked={!!org.isMainOrganization}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setMainOrgMutation.mutate(org.id);
                                }
                              }}
                              disabled={setMainOrgMutation.isPending || !!org.isMainOrganization}
                              data-testid={`switch-main-org-${org.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-foreground">{org.name}</TableCell>
                          <TableCell className="text-muted-foreground capitalize">{org.type || 'business'}</TableCell>
                          <TableCell className="text-muted-foreground">{org.totalUsers || 0}</TableCell>
                          <TableCell className="text-muted-foreground">{org.activeUsers || 0}</TableCell>
                          <TableCell className="text-muted-foreground">{org.adminCount || 0}</TableCell>
                          <TableCell className="text-muted-foreground">{org.teacherCount || 0}</TableCell>
                          <TableCell className="text-muted-foreground">{org.learnerCount || 0}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getOrgStatusBadge(org)}
                              <Switch
                                checked={org.isActive !== false}
                                onCheckedChange={(checked) => {
                                  toggleActiveMutation.mutate({ organizationId: org.id, isActive: checked });
                                }}
                                disabled={toggleActiveMutation.isPending}
                                data-testid={`switch-active-${org.id}`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border">
            <CardHeader className="p-[var(--card-padding)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)]">
                <div>
                  <CardTitle className="text-foreground text-[length:var(--text-xl)]">Organizations</CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Complete overview of all registered organizations
                  </CardDescription>
                </div>
                <Input
                  placeholder="Search organizations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:max-w-xs bg-muted border-border text-foreground min-h-[44px]"
                  data-testid="input-search-orgs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-[var(--card-padding)] pt-0">
              <div className="rounded-md border border-border overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-muted">
                      <TableHead className="text-muted-foreground">Organization</TableHead>
                      <TableHead className="text-muted-foreground">Join Code</TableHead>
                      <TableHead className="text-muted-foreground">Trial Status</TableHead>
                      <TableHead className="text-muted-foreground">End Date</TableHead>
                      <TableHead className="text-muted-foreground">{terminology.learnerPlural}</TableHead>
                      <TableHead className="text-muted-foreground">Package Tier</TableHead>
                      <TableHead className="text-muted-foreground">Seat Utilization</TableHead>
                      <TableHead className="text-muted-foreground">MRR</TableHead>
                      <TableHead className="text-muted-foreground">Special Plan</TableHead>
                      <TableHead className="text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground">
                          Loading organizations...
                        </TableCell>
                      </TableRow>
                    ) : filteredOrgs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground">
                          No organizations found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrgs.map((org: any) => (
                        <TableRow key={org.id} className="border-border hover:bg-muted" data-testid={`row-org-${org.id}`}>
                          <TableCell className="font-medium text-foreground">
                            {org.name}
                            {org.isDemo && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                DEMO
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">{org.inviteCode}</TableCell>
                          <TableCell>{getTrialStatusBadge(org)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {org.isDemo ? (
                              <span className="text-chart-1">N/A</span>
                            ) : org.trialEndDate ? (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {tzFormat(org.trialEndDate, 'MMM d, yyyy')}
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{org.studentCount || 0}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {org.packageTier && org.packageTier !== 'N/A' ? (
                              <Badge variant="outline" className="capitalize">
                                {org.packageTier}
                              </Badge>
                            ) : (
                              <span className="text-chart-1">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {org.seatUtilization ? (
                              <div className="space-y-1">
                                <div>{terminology.learnerPlural}: {org.seatUtilization.learners.current}/{org.seatUtilization.learners.max}</div>
                                <div className="text-xs text-muted-foreground">{terminology.educatorPlural}: {org.seatUtilization.teachers.current}/{org.seatUtilization.teachers.max}</div>
                              </div>
                            ) : (
                              <span className="text-chart-1">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {org.mrrContribution && org.mrrContribution !== 'N/A' ? (
                              <span className="font-medium">${org.mrrContribution}</span>
                            ) : (
                              <span className="text-chart-1">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={org.isDemo || false}
                              onCheckedChange={(checked) => {
                                toggleDemoMutation.mutate({ organizationId: org.id, isDemo: checked });
                              }}
                              disabled={toggleDemoMutation.isPending}
                              data-testid={`switch-demo-${org.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(org)}
                              disabled={deleteOrgMutation.isPending}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px] touch-manipulation"
                              data-testid={`button-delete-${org.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Organization</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete this organization? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {orgToDelete && (
            <div className="space-y-4">
              <div className="rounded-md bg-destructive/10 border border-[var(--destructive)]/20 p-4">
                <h4 className="font-semibold text-destructive mb-2">Organization to be deleted:</h4>
                <p className="text-foreground font-medium">{orgToDelete.name}</p>
                <p className="text-sm text-muted-foreground mt-1">Join Code: {orgToDelete.inviteCode}</p>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">The following data will be permanently deleted:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>All quiz collections and quiz cards</li>
                  <li>All quiz results and game progress</li>
                  <li>All join requests</li>
                  <li>All user assignments and roles</li>
                  <li>All organizational units, sub-units, and subjects</li>
                  <li>All usage limit tracking data</li>
                  <li>The organization itself</li>
                </ul>
                <p className="text-destructive font-medium mt-3">
                  ⚠️ This cannot be undone. All data will be lost permanently.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-[var(--space-sm)]">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteOrgMutation.isPending}
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteOrgMutation.isPending} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-confirm-delete" >
              {deleteOrgMutation.isPending ? 'Deleting...' : 'Delete Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
