import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserCheck, UserX, Clock, CheckCircle, XCircle, ArrowLeft, Search } from 'lucide-react';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, invalidateCourseScopeCaches } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAuth } from '@/hooks/useAuth';

import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { tzFormat } from '@/utils/timezoneRuntime';

interface JoinRequest {
  id: string;
  userId: string;
  organizationId: string;
  status: 'pending' | 'approved' | 'denied';
  requestedUnitId: string | null;
  requestedSubUnitId: string | null;
  requestedTeamId: string | null;
  requestedSubjectIds: string[] | null;
  denialReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  reviewedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    gamerName: string;
  } | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    gamerName: string;
  };
  organization?: {
    id: string;
    name: string;
    inviteCode: string;
  };
  requestedUnit?: any;
  requestedSubUnit?: any;
  requestedTeam?: any;
}

export default function JoinRequests() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('pending');
  const { toast } = useToast();
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'deny' | null>(null);
  
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null);
  const [approveUnitId, setApproveUnitId] = useState('');
  const [approveSubUnitId, setApproveSubUnitId] = useState('');
  const [approveTeamId, setApproveTeamId] = useState('');
  const [approveSubjectIds, setApproveSubjectIds] = useState<string[]>([]);
  
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();

  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <QuizAdminLayout title="Join Requests" description="Loading..." activeSection="users">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  const { isSuperAdmin, isImpersonating, effectiveOrganizationId } = useAuth();
  const isPlatformWideAdminView = !!isSuperAdmin && !isImpersonating;

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', effectiveOrganizationId, 'units'],
    enabled: !!effectiveOrganizationId && !isPlatformWideAdminView,
  });

  const { data: allSubUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', effectiveOrganizationId, 'sub-units'],
    enabled: !!effectiveOrganizationId && !isPlatformWideAdminView,
  });

  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', effectiveOrganizationId, 'unit-subjects'],
    enabled: !!effectiveOrganizationId && !isPlatformWideAdminView,
  });

  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/superadmin/organizations'],
    enabled: isPlatformWideAdminView,
  });

  const { data: joinRequests = [], isLoading } = useQuery<JoinRequest[]>({
    queryKey: isPlatformWideAdminView ? ['/api/superadmin/join-requests'] : ['/api/org', effectiveOrganizationId, 'join-requests'],
    enabled: isPlatformWideAdminView || !!effectiveOrganizationId,
  });

  const { data: teamsForSubUnit = [] } = useQuery<any[]>({
    queryKey: [`/api/organization/teams/${approveSubUnitId}`],
    enabled: !!approveSubUnitId,
  });

  const selectedUnitSubUnits = allSubUnits.filter((su: any) => su.unitId === approveUnitId);
  const selectedUnitSubjects = subjects.filter((s: any) => s.unitId === approveUnitId);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) return;
      
      const payload = {
        unitId: approveUnitId || selectedRequest.requestedUnitId,
        subUnitId: approveSubUnitId || selectedRequest.requestedSubUnitId,
        teamId: approveTeamId || selectedRequest.requestedTeamId || null,
        subjectIds: approveSubjectIds.length > 0 ? approveSubjectIds : selectedRequest.requestedSubjectIds || [],
      };
      console.log('=== SUBMITTING APPROVAL ===');
      console.log('Payload being sent to backend:', payload);
      console.log('approveSubjectIds state:', approveSubjectIds);
      
      await apiRequest(`/api/org/join-requests/${selectedRequest.id}/approve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Join request approved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org', effectiveOrganizationId, 'join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', effectiveOrganizationId, 'hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', effectiveOrganizationId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', effectiveOrganizationId, 'users'] });
      invalidateCourseScopeCaches({ organizationId: effectiveOrganizationId || undefined });
      setApproveDialogOpen(false);
      setSelectedRequest(null);
      setApproveUnitId('');
      setApproveSubUnitId('');
      setApproveTeamId('');
      setApproveSubjectIds([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) return;
      
      await apiRequest(`/api/org/join-requests/${selectedRequest.id}/deny`, {
        method: 'POST',
        body: JSON.stringify({
          reason: denyReason,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Join request denied',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org', effectiveOrganizationId, 'join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', effectiveOrganizationId, 'hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', effectiveOrganizationId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', effectiveOrganizationId, 'users'] });
      setDenyDialogOpen(false);
      setSelectedRequest(null);
      setDenyReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to deny request',
        variant: 'destructive',
      });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async () => {
      const requestIds = Array.from(selectedRequests);
      await apiRequest(`/api/org/join-requests/bulk-approve`, {
        method: 'POST',
        body: JSON.stringify({ requestIds }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: `${selectedRequests.size} request(s) approved successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org', effectiveOrganizationId, 'join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/students'] });
      invalidateCourseScopeCaches({ organizationId: effectiveOrganizationId || undefined });
      setSelectedRequests(new Set());
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve requests',
        variant: 'destructive',
      });
    },
  });

  const bulkDenyMutation = useMutation({
    mutationFn: async () => {
      const requestIds = Array.from(selectedRequests);
      await apiRequest(`/api/org/join-requests/bulk-deny`, {
        method: 'POST',
        body: JSON.stringify({ 
          requestIds,
          reason: denyReason || 'Bulk denial'
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: `${selectedRequests.size} request(s) denied`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org', effectiveOrganizationId, 'join-requests'] });
      setSelectedRequests(new Set());
      setDenyDialogOpen(false);
      setDenyReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to deny requests',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (approveDialogOpen && selectedRequest && subjects.length > 0) {
      console.log('=== INITIALIZING APPROVE DIALOG ===');
      console.log('Selected request:', selectedRequest);
      console.log('requestedSubjectIds:', selectedRequest.requestedSubjectIds);
      
      const unitId = selectedRequest.requestedUnitId || '';
      setApproveUnitId(unitId);
      setApproveSubUnitId(selectedRequest.requestedSubUnitId || '');
      setApproveTeamId(selectedRequest.requestedTeamId || '');
      
      const unitSubjects = subjects.filter((s: any) => s.unitId === unitId);
      const unitSubjectIds = unitSubjects.map((s: any) => s.subjectId);
      console.log('Available unit subject IDs:', unitSubjectIds);
      
      const requestedIds = selectedRequest.requestedSubjectIds || [];
      const validSubjectIds = requestedIds.filter((id: string) => 
        unitSubjectIds.includes(id)
      );
      console.log('Valid subject IDs to pre-select:', validSubjectIds);
      
      if (requestedIds.length > 0 && validSubjectIds.length < requestedIds.length) {
        const invalidCount = requestedIds.length - validSubjectIds.length;
        console.warn(`${invalidCount} requested subject(s) not found in selected grade. They may have been deleted.`);
      }
      
      setApproveSubjectIds(validSubjectIds);
      console.log('=== approveSubjectIds initialized to:', validSubjectIds);
    }
  }, [approveDialogOpen, selectedRequest, subjects]);

  const handleApprove = (request: JoinRequest) => {
    console.log('=== APPROVE BUTTON CLICKED ===');
    console.log('Request object:', request);
    setSelectedRequest(request);
    setApproveDialogOpen(true);
  };

  const handleUnitChange = (newUnitId: string) => {
    setApproveUnitId(newUnitId);
    
    const unitSubjects = subjects.filter((s: any) => s.unitId === newUnitId);
    const unitSubjectIds = unitSubjects.map((s: any) => s.subjectId);
    const validSubjectIds = approveSubjectIds.filter((id: string) => 
      unitSubjectIds.includes(id)
    );
    
    setApproveSubjectIds(validSubjectIds);
    
    const newUnitSubUnits = allSubUnits.filter((su: any) => su.unitId === newUnitId);
    const subUnitExists = newUnitSubUnits.some((su: any) => su.id === approveSubUnitId);
    if (!subUnitExists) {
      setApproveSubUnitId('');
      setApproveTeamId('');
    }
  };

  const handleSubUnitChange = (newSubUnitId: string) => {
    setApproveSubUnitId(newSubUnitId);
    setApproveTeamId('');
  };

  const handleDeny = (request: JoinRequest) => {
    setSelectedRequest(request);
    setDenyDialogOpen(true);
  };

  const handleApproveSubmit = async () => {
    if (!selectedRequest) {
      toast({
        title: 'Error',
        description: 'No request selected',
        variant: 'destructive',
      });
      return;
    }
    
    if (!approveUnitId && !selectedRequest.requestedUnitId) {
      toast({
        title: 'Error',
        description: `Please select a ${terminologyLower.unit}`,
        variant: 'destructive',
      });
      return;
    }
    
    approveMutation.mutate();
  };

  const handleDenySubmit = async () => {
    if (!denyReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for denial',
        variant: 'destructive',
      });
      return;
    }
    
    if (selectedRequest) {
      denyMutation.mutate();
    } else if (selectedRequests.size > 0) {
      bulkDenyMutation.mutate();
    } else {
      toast({
        title: 'Error',
        description: 'No request(s) selected',
        variant: 'destructive',
      });
    }
  };

  const handleBulkApprove = () => {
    if (selectedRequests.size === 0) return;
    bulkApproveMutation.mutate();
  };

  const handleBulkDeny = () => {
    if (selectedRequests.size === 0) return;
    setDenyDialogOpen(true);
    setSelectedRequest(null);
  };

  const filteredJoinRequests = isPlatformWideAdminView
    ? joinRequests.filter(request => {
        if (selectedOrgId !== 'all' && request.organizationId !== selectedOrgId) {
          return false;
        }
        
        if (searchTerm && request.organization) {
          const searchLower = searchTerm.toLowerCase();
          return request.organization.name.toLowerCase().includes(searchLower);
        }
        
        return true;
      })
    : joinRequests;

  const pendingRequests = filteredJoinRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredJoinRequests.filter(r => r.status === 'approved');
  const deniedRequests = filteredJoinRequests.filter(r => r.status === 'denied');

  const toggleSelectRequest = (requestId: string) => {
    const newSelected = new Set(selectedRequests);
    if (newSelected.has(requestId)) {
      newSelected.delete(requestId);
    } else {
      newSelected.add(requestId);
    }
    setSelectedRequests(newSelected);
  };

  const toggleSelectAll = (requests: JoinRequest[]) => {
    if (selectedRequests.size === requests.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(requests.map(r => r.id)));
    }
  };

  const stats: StatItem[] = [
    {
      label: 'Pending',
      value: pendingRequests.length,
      icon: Clock,
    },
    {
      label: 'Approved',
      value: approvedRequests.length,
      icon: CheckCircle,
    },
    {
      label: 'Denied',
      value: deniedRequests.length,
      icon: XCircle,
    },
  ];

  const getTableColumns = (requests: JoinRequest[]): Column<JoinRequest>[] => {
    const allSelected = requests.length > 0 && selectedRequests.size === requests.length;
    const someSelected = selectedRequests.size > 0 && selectedRequests.size < requests.length;
    
    const baseColumns: Column<JoinRequest>[] = [];
    
    if (activeTab === 'pending') {
      baseColumns.push({
        key: 'select',
        header: '',
        mobileLabel: 'Select',
        render: (request) => (
          <div className="flex items-center min-h-[44px] min-w-[44px] justify-center">
            <Checkbox
              checked={selectedRequests.has(request.id)}
              onCheckedChange={() => toggleSelectRequest(request.id)}
              data-testid={`checkbox-select-${request.id}`}
              className="h-5 w-5"
            />
          </div>
        ),
        width: '60px',
      });
    }
    
    if (isPlatformWideAdminView) {
      baseColumns.push({
        key: 'organization',
        header: 'Organization',
        mobileLabel: 'Org',
        render: (request) => (
          <span data-testid={`text-org-name-${request.id}`} className="font-medium">
            {request.organization?.name || 'Unknown Org'}
          </span>
        ),
      });
    }
    
    baseColumns.push(
      {
        key: 'firstName',
        header: 'First Name',
        mobileLabel: 'First Name',
        render: (request) => (
          <span data-testid={`text-student-firstname-${request.id}`}>
            {request.user?.firstName || request.user?.gamerName || '-'}
          </span>
        ),
      },
      {
        key: 'lastName',
        header: 'Surname',
        mobileLabel: 'Surname',
        render: (request) => (
          <span data-testid={`text-student-surname-${request.id}`}>
            {request.user?.lastName || ''}
          </span>
        ),
      },
      {
        key: 'email',
        header: 'Email',
        mobileLabel: 'Email',
        render: (request) => (
          <span data-testid={`text-email-${request.id}`}>
            {request.user?.email || 'N/A'}
          </span>
        ),
      },
      {
        key: 'unit',
        header: `Requested ${terminology.unit}`,
        mobileLabel: terminologyLower.unit,
        render: (request) => (
          <span data-testid={`text-unit-${request.id}`}>
            {request.requestedUnit?.name || '-'}
          </span>
        ),
      },
      {
        key: 'subUnit',
        header: `Requested ${terminology.subUnit}`,
        mobileLabel: terminologyLower.subUnit,
        render: (request) => (
          <span data-testid={`text-subunit-${request.id}`}>
            {request.requestedSubUnit?.name || '-'}
          </span>
        ),
      },
      {
        key: 'team',
        header: `Requested ${terminology.team}`,
        mobileLabel: terminologyLower.team,
        render: (request) => (
          <span data-testid={`text-team-${request.id}`}>
            {request.requestedTeam?.name || '-'}
          </span>
        ),
      },
      {
        key: 'subjects',
        header: `Requested ${terminology.subjectPlural}`,
        mobileLabel: terminology.subjectPlural,
        render: (request) => (
          <span data-testid={`text-subjects-${request.id}`}>
            {(request as any).requestedSubjects && (request as any).requestedSubjects.length > 0
              ? (request as any).requestedSubjects.map((s: any) => s.name).join(', ')
              : `No ${terminologyLower.subjectPlural}`}
          </span>
        ),
      },
      {
        key: 'createdAt',
        header: 'Requested Date',
        mobileLabel: 'Requested',
        sortable: true,
        render: (request) => (
          <span data-testid={`text-created-${request.id}`}>
            {tzFormat(request.createdAt, 'MMM dd, yyyy')}
          </span>
        ),
      }
    );
    
    if (activeTab !== 'pending') {
      baseColumns.push({
        key: 'reviewedBy',
        header: 'Reviewed By',
        mobileLabel: 'Reviewer',
        render: (request) => (
          <span data-testid={`text-reviewer-${request.id}`}>
            {request.reviewedByUser 
              ? `${request.reviewedByUser.firstName} ${request.reviewedByUser.lastName}`
              : 'N/A'}
          </span>
        ),
      });
      baseColumns.push({
        key: 'reviewedAt',
        header: 'Reviewed Date',
        mobileLabel: 'Reviewed',
        sortable: true,
        render: (request) => (
          <span data-testid={`text-reviewed-${request.id}`}>
            {request.reviewedAt ? tzFormat(request.reviewedAt, 'MMM dd, yyyy') : 'N/A'}
          </span>
        ),
      });
    }
    
    if (activeTab === 'denied') {
      baseColumns.push({
        key: 'denialReason',
        header: 'Reason',
        mobileLabel: 'Reason',
        render: (request) => (
          <span data-testid={`text-reason-${request.id}`}>
            {request.denialReason || 'No reason provided'}
          </span>
        ),
      });
    }
    
    if (activeTab === 'pending') {
      baseColumns.push({
        key: 'actions',
        header: 'Actions',
        mobileLabel: 'Actions',
        render: (request) => (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => handleApprove(request)}
              className="bg-success hover:bg-success/90 text-success-foreground min-h-[44px] min-w-[44px] text-sm"
              data-testid={`button-approve-${request.id}`}
            >
              <UserCheck className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Approve</span>
            </Button>
            <Button variant="destructive" onClick={() => handleDeny(request)}
              className="min-h-[44px] min-w-[44px] text-sm"
              data-testid={`button-deny-${request.id}`}
            >
              <UserX className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Deny</span>
            </Button>
          </div>
        ),
        width: '180px',
      });
    }
    
    return baseColumns;
  };

  const renderRequestsContent = (requests: JoinRequest[]) => {
    if (requests.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-requests">
          No {activeTab} requests found
        </div>
      );
    }

    const allSelected = requests.length > 0 && selectedRequests.size === requests.length;
    const someSelected = selectedRequests.size > 0 && selectedRequests.size < requests.length;

    return (
      <div className="space-y-4">
        {activeTab === 'pending' && (
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg md:hidden">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => toggleSelectAll(requests)}
              data-testid="checkbox-select-all"
              className="h-5 w-5"
            />
            <span className="text-sm text-muted-foreground">
              {allSelected ? 'Deselect all' : 'Select all'} ({requests.length})
            </span>
          </div>
        )}
        
        <div className="hidden md:block">
          {activeTab === 'pending' && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => toggleSelectAll(requests)}
                data-testid="checkbox-select-all"
                className="h-5 w-5"
              />
              <span className="text-sm text-muted-foreground">
                {allSelected ? 'Deselect all' : 'Select all'} ({requests.length})
              </span>
            </div>
          )}
        </div>
        
        <ResponsiveTable
          data={requests}
          columns={getTableColumns(requests)}
          keyExtractor={(request) => request.id}
          isLoading={isLoading}
          emptyMessage={`No ${activeTab} requests found`}
        />
      </div>
    );
  };

  return (
    <QuizAdminLayout title="Join Requests">
      <div className="container mx-auto px-[var(--container-padding)] py-[var(--space-lg)] space-y-[var(--space-lg)]">
        <div className="space-y-[var(--space-md)]">
          <div className="flex items-center gap-[var(--space-md)] mb-2">
            <Button variant="ghost" onClick={() => setLocation('/org-admin')}
              className="min-h-[44px] min-w-[44px]"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <div>
            <h1 className="text-[length:var(--text-3xl)] font-bold" data-testid="text-page-title">Join Request Management</h1>
            <p className="text-muted-foreground mt-2 text-[length:var(--text-base)]" data-testid="text-page-description">
              {isPlatformWideAdminView 
                ? `Review and manage all ${terminologyLower.learner} join requests across all organizations`
                : `Review and manage ${terminologyLower.learner} join requests for your organization`
              }
            </p>
          </div>

          {isPlatformWideAdminView && (
            <div className="flex flex-col sm:flex-row gap-[var(--space-md)]">
              <div className="w-full sm:flex-1 sm:max-w-sm">
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger className="min-h-[44px]" data-testid="select-organization">
                    <SelectValue placeholder="Filter by organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {organizations.map((org: any) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:flex-1 sm:max-w-sm relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search organizations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 min-h-[44px]"
                  data-testid="input-search-organizations"
                />
              </div>
            </div>
          )}
        </div>

        <StatsGrid 
          stats={stats} 
          isLoading={isLoading} 
          columns={3}
          className="max-w-2xl ml-auto"
        />

        <Card>
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
              <div>
                <CardTitle data-testid="text-requests-title">Join Requests</CardTitle>
                  <CardDescription data-testid="text-requests-description">
                  {isPlatformWideAdminView 
                    ? "View and manage all join requests across all organizations"
                    : "View and manage all join requests for your organization"
                  }
                </CardDescription>
              </div>
              
              {activeTab === 'pending' && selectedRequests.size > 0 && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={handleBulkApprove} disabled={bulkApproveMutation.isPending} className="min-h-[44px]" data-testid="button-bulk-approve" >
                    <UserCheck className="h-4 w-4 mr-2" />
                    Approve Selected ({selectedRequests.size})
                  </Button>
                  <Button onClick={handleBulkDeny} disabled={bulkDenyMutation.isPending} variant="destructive" className="min-h-[44px]" data-testid="button-bulk-deny" >
                    <UserX className="h-4 w-4 mr-2" />
                    Deny Selected ({selectedRequests.size})
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3" data-testid="tabs-requests">
                <TabsTrigger value="pending" className="min-h-[44px]" data-testid="tab-pending">
                  <span className="hidden sm:inline">Pending</span>
                  <span className="sm:hidden">Pend</span>
                  <span className="ml-1">({pendingRequests.length})</span>
                </TabsTrigger>
                <TabsTrigger value="approved" className="min-h-[44px]" data-testid="tab-approved">
                  <span className="hidden sm:inline">Approved</span>
                  <span className="sm:hidden">Appr</span>
                  <span className="ml-1">({approvedRequests.length})</span>
                </TabsTrigger>
                <TabsTrigger value="denied" className="min-h-[44px]" data-testid="tab-denied">
                  <span className="hidden sm:inline">Denied</span>
                  <span className="sm:hidden">Den</span>
                  <span className="ml-1">({deniedRequests.length})</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-[var(--space-md)]" data-testid="content-pending">
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="text-loading">
                    Loading requests...
                  </div>
                ) : (
                  renderRequestsContent(pendingRequests)
                )}
              </TabsContent>

              <TabsContent value="approved" className="mt-[var(--space-md)]" data-testid="content-approved">
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="text-loading">
                    Loading requests...
                  </div>
                ) : (
                  renderRequestsContent(approvedRequests)
                )}
              </TabsContent>

              <TabsContent value="denied" className="mt-[var(--space-md)]" data-testid="content-denied">
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="text-loading">
                    Loading requests...
                  </div>
                ) : (
                  renderRequestsContent(deniedRequests)
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent className="max-h-[var(--dialog-max-height)] overflow-y-auto p-[var(--dialog-padding)]" data-testid="dialog-approve">
            <DialogHeader>
              <DialogTitle data-testid="text-approve-title">Approve Join Request</DialogTitle>
              <DialogDescription data-testid="text-approve-description">
                Review and optionally reassign the {terminologyLower.learner} to different {terminologyLower.unit}/{terminologyLower.subUnit}/{terminologyLower.subjectPlural}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-[var(--space-md)]">
              {selectedRequest?.user && (
                <div className="p-[var(--space-md)] bg-muted rounded-lg">
                  <div className="font-medium" data-testid="text-approve-student-name">
                    {selectedRequest.user.firstName && selectedRequest.user.lastName
                      ? `${selectedRequest.user.firstName} ${selectedRequest.user.lastName}`
                      : selectedRequest.user.gamerName}
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid="text-approve-student-email">
                    {selectedRequest.user.email}
                  </div>
                  {(selectedRequest as any).requestedSubjects && (selectedRequest as any).requestedSubjects.length > 0 && (
                    <div className="mt-3 p-3 bg-secondary/10 border border-secondary/30 rounded-lg">
                      <div className="text-sm font-semibold text-secondary dark:text-secondary/80 mb-2">
                        {terminology.learner} Requested {terminology.subjectPlural}:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(selectedRequest as any).requestedSubjects.map((s: any) => (
                          <span 
                            key={s.id} 
                            className="px-2 py-1 text-xs rounded-md bg-secondary/20 text-secondary dark:text-secondary/80 border border-secondary/30"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        These {terminologyLower.subjectPlural} are pre-selected below. You can modify the selection.
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="approve-unit" data-testid="label-unit">
                  {terminology.unit} (Optional - defaults to requested)
                </Label>
                <Select value={approveUnitId} onValueChange={handleUnitChange}>
                  <SelectTrigger id="approve-unit" className="min-h-[44px]" data-testid="select-unit">
                    <SelectValue placeholder={`Select ${terminologyLower.unit}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id} data-testid={`option-unit-${unit.id}`}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {approveUnitId && selectedUnitSubUnits.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="approve-subunit" data-testid="label-subunit">
                    {terminology.subUnit} (Optional)
                  </Label>
                  <Select value={approveSubUnitId} onValueChange={handleSubUnitChange}>
                    <SelectTrigger id="approve-subunit" className="min-h-[44px]" data-testid="select-subunit">
                      <SelectValue placeholder={`Select ${terminologyLower.subUnit}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedUnitSubUnits.map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id} data-testid={`option-subunit-${subUnit.id}`}>
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {approveSubUnitId && teamsForSubUnit.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="approve-team" data-testid="label-team">
                    {terminology.team} (Optional)
                  </Label>
                  <Select value={approveTeamId} onValueChange={setApproveTeamId}>
                    <SelectTrigger id="approve-team" className="min-h-[44px]" data-testid="select-team">
                      <SelectValue placeholder={`Select ${terminologyLower.team}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {teamsForSubUnit.map((team: any) => (
                        <SelectItem key={team.id} value={team.id} data-testid={`option-team-${team.id}`}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {approveUnitId && selectedUnitSubjects.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <Label data-testid="label-subjects" className="text-base font-semibold">
                      {terminology.subjectPlural} - Select which {terminologyLower.subjectPlural} to assign
                    </Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setApproveSubjectIds(selectedUnitSubjects.map((s: any) => s.subjectId))}
                        className="min-h-[44px]"
                        data-testid="button-select-all-subjects"
                      >
                        Select All
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setApproveSubjectIds([])}
                        className="min-h-[44px]"
                        data-testid="button-clear-all-subjects"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto p-2 border rounded-md bg-muted/30">
                    {selectedUnitSubjects.map((subject: any) => {
                      const isRequested = selectedRequest?.requestedSubjectIds?.includes(subject.subjectId);
                      return (
                        <label 
                          key={subject.subjectId} 
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-background/80 min-h-[44px] ${
                            approveSubjectIds.includes(subject.subjectId) 
                              ? 'bg-primary/10 border-2 border-border' 
                              : 'bg-background/50 border-2 border-transparent'
                          }`}
                        >
                          <Checkbox
                            checked={approveSubjectIds.includes(subject.subjectId)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setApproveSubjectIds([...approveSubjectIds, subject.subjectId]);
                              } else {
                                setApproveSubjectIds(approveSubjectIds.filter(id => id !== subject.subjectId));
                              }
                            }}
                            className="h-5 w-5"
                            data-testid={`checkbox-subject-${subject.subjectId}`}
                          />
                          <span className="text-sm font-medium flex-1">{subject.subjectName}</span>
                          {isRequested && (
                            <span className="text-xs px-2 py-1 rounded-full bg-secondary/20 text-secondary dark:text-secondary/80">
                              Requested
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {approveSubjectIds.length === 0 
                      ? `No ${terminologyLower.subjectPlural} selected - ${terminologyLower.learner} will not be assigned to any ${terminologyLower.subjectPlural}`
                      : `${approveSubjectIds.length} ${approveSubjectIds.length === 1 ? terminologyLower.subject : terminologyLower.subjectPlural} selected`}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setApproveDialogOpen(false)}
                className="min-h-[44px] w-full sm:w-auto"
                data-testid="button-cancel-approve"
              >
                Cancel
              </Button>
              <Button onClick={handleApproveSubmit} disabled={approveMutation.isPending} className="min-h-[44px] w-full sm:w-auto" data-testid="button-confirm-approve" >
                {approveMutation.isPending ? 'Approving...' : 'Approve Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
          <DialogContent className="p-[var(--dialog-padding)]" data-testid="dialog-deny">
            <DialogHeader>
              <DialogTitle data-testid="text-deny-title">
                {selectedRequest ? 'Deny Join Request' : `Deny ${selectedRequests.size} Requests`}
              </DialogTitle>
              <DialogDescription data-testid="text-deny-description">
                Please provide a reason for denying {selectedRequest ? 'this request' : 'these requests'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-[var(--space-md)]">
              {selectedRequest?.user ? (
                <div className="p-[var(--space-md)] bg-muted rounded-lg">
                  <div className="font-medium" data-testid="text-deny-student-name">
                    {selectedRequest.user.firstName && selectedRequest.user.lastName
                      ? `${selectedRequest.user.firstName} ${selectedRequest.user.lastName}`
                      : selectedRequest.user.gamerName}
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid="text-deny-student-email">
                    {selectedRequest.user.email}
                  </div>
                </div>
              ) : (
                <div className="p-[var(--space-md)] bg-muted rounded-lg">
                  <div className="font-medium">
                    {selectedRequests.size} selected request(s) will be denied
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="deny-reason" data-testid="label-reason">Denial Reason</Label>
                <Textarea
                  id="deny-reason"
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Enter the reason for denial..."
                  rows={4}
                  className="min-h-[88px]"
                  data-testid="textarea-reason"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDenyDialogOpen(false)}
                className="min-h-[44px] w-full sm:w-auto"
                data-testid="button-cancel-deny"
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDenySubmit} disabled={(selectedRequest ? denyMutation.isPending : bulkDenyMutation.isPending)} className="min-h-[44px] w-full sm:w-auto" data-testid="button-confirm-deny" >
                {(selectedRequest ? denyMutation.isPending : bulkDenyMutation.isPending) 
                  ? 'Denying...' 
                  : selectedRequest ? 'Deny Request' : `Deny ${selectedRequests.size} Requests`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
