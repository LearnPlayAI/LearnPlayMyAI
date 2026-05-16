import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Plus, Building2, Users, BookOpen, Edit, Trash2, ChevronDown, ChevronRight, Shield, UserPlus, Trophy, Target, Settings, FileText, X, Coins, DollarSign, Package } from 'lucide-react';
import { LPCAnalyticsDashboard } from '@/components/admin/LPCAnalyticsDashboard';
import { CostManagement } from '@/components/admin/CostManagement';
import { BusinessPackageManager } from '@/components/admin/BusinessPackageManager';
import { PackageCalculator } from '@/components/admin/PackageCalculator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { useAdminCurrencyToggle } from '@/hooks/useCurrencyDisplay';
import { AdminCurrencyToggle } from '@/components/AdminCurrencyToggle';

export default function SuperAdmin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { isSuperAdmin, isOrgAdmin, isTeacher, isLoading: authLoading } = useAuth();
  
  // Parse tab from URL query parameter
  const urlParams = new URLSearchParams(searchString);
  const tabFromUrl = urlParams.get('tab');
  const validTabs = ['analytics', 'lpc-revenue', 'costs', 'packages', 'organizations', 'users', 'quizzes'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : (isSuperAdmin ? 'analytics' : 'organizations');
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Sync tab with URL when it changes
  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const { 
    formatPrice, 
    showPlatformCurrency, 
    setShowPlatformCurrency, 
    displayCurrency 
  } = useAdminCurrencyToggle(true);
  
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('education');
  const [inviteCode, setInviteCode] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('South Africa');
  const [expandedOrgs, setExpandedOrgs] = useState<Record<string, boolean>>({});

  const [isCreatingQuiz, setIsCreatingQuiz] = useState(false);
  const [quizName, setQuizName] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizIsPublic, setQuizIsPublic] = useState(true);
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [selectedOrg, setSelectedOrg] = useState('');

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignOrgId, setAssignOrgId] = useState('');
  const [assignRole, setAssignRole] = useState('student');
  
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const [usersSortKey, setUsersSortKey] = useState<string>('gamerName');
  const [usersSortDirection, setUsersSortDirection] = useState<'asc' | 'desc'>('asc');
  const [recentUsersSortKey, setRecentUsersSortKey] = useState<string>('lastActiveAt');
  const [recentUsersSortDirection, setRecentUsersSortDirection] = useState<'asc' | 'desc'>('desc');
  const [orgPerformanceSortKey, setOrgPerformanceSortKey] = useState<string>('name');
  const [orgPerformanceSortDirection, setOrgPerformanceSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: quizCollections = [], isLoading: quizLoading } = useQuery<any[]>({
    queryKey: ['/api/quiz-collections'],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ['/api/admin/super-admin-analytics'],
    enabled: isSuperAdmin,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  
  const createOrgMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: orgName,
          type: orgType,
          inviteCode: inviteCode,
          curriculum: curriculum || undefined,
          streetAddress: streetAddress || undefined,
          city: city || undefined,
          province: province || undefined,
          postalCode: postalCode || undefined,
          country: country || undefined,
          isActive: true
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/super-admin-analytics'] });
      toast({ title: 'Organization created successfully' });
      setIsCreatingOrg(false);
      setOrgName('');
      setInviteCode('');
      setCurriculum('');
      setStreetAddress('');
      setCity('');
      setProvince('');
      setPostalCode('');
      setCountry('South Africa');
    },
    onError: () => {
      toast({ title: 'Failed to create organization', variant: 'destructive' });
    }
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      return await apiRequest(`/api/admin/organizations/${orgId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/super-admin-analytics'] });
      toast({ title: 'Organization deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete organization', variant: 'destructive' });
    }
  });

  const createQuizMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/quiz-collections', {
        method: 'POST',
        body: JSON.stringify({
          name: quizName,
          description: quizDescription,
          isPublic: quizIsPublic,
          difficulty: quizDifficulty,
          organizationId: quizIsPublic ? null : (selectedOrg || null),
          isActive: true,
          totalCards: 0
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections'] });
      toast({ title: 'Quiz collection created successfully' });
      setIsCreatingQuiz(false);
      setQuizName('');
      setQuizDescription('');
      setSelectedOrg('');
    },
    onError: () => {
      toast({ title: 'Failed to create quiz collection', variant: 'destructive' });
    }
  });

  const deleteQuizMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      return await apiRequest(`/api/admin/quiz-collections/${collectionId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections'] });
      toast({ title: 'Quiz collection deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete quiz collection', variant: 'destructive' });
    }
  });

  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/organizations/${assignOrgId}/users/${selectedUser?.id}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          role: assignRole
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/super-admin-analytics'] });
      toast({ title: 'Role assigned successfully' });
      setAssignDialogOpen(false);
      setSelectedUser(null);
      setAssignOrgId('');
      setAssignRole('student');
    },
    onError: () => {
      toast({ title: 'Failed to assign role', variant: 'destructive' });
    }
  });

  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      return await apiRequest(`/api/admin/roles/${roleId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/super-admin-analytics'] });
      toast({ title: 'Role removed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to remove role', variant: 'destructive' });
    }
  });
  
  const isAdmin = isSuperAdmin || isOrgAdmin || isTeacher;
  
  useEffect(() => {
    if (!authLoading && isTeacher && !isSuperAdmin && !isOrgAdmin) {
      setLocation('/management-hub');
    }
  }, [isTeacher, isSuperAdmin, isOrgAdmin, authLoading, setLocation]);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access admin features',
        variant: 'destructive'
      });
      setLocation('/quiz-lobby');
    }
  }, [isAdmin, authLoading, setLocation, toast]);
  
  if (authLoading) {
    return (
      <QuizAdminLayout title="Admin Dashboard" activeSection="dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }
  
  if (!isResolved || !terminology) {
    return (
      <QuizAdminLayout title="Super Admin" description="Loading..." activeSection="dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }
  
  if (!isAdmin) {
    return null;
  }
  
  const pageTitle = isSuperAdmin ? 'Super Admin' : isOrgAdmin ? 'Organization Admin' : 'Admin Dashboard';

  const generateInviteCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setInviteCode(code);
  };

  const handleCreateOrg = () => {
    if (!orgName || !inviteCode) {
      toast({ title: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    createOrgMutation.mutate();
  };

  const handleCreateQuiz = () => {
    if (!quizName) {
      toast({ title: 'Please enter a quiz name', variant: 'destructive' });
      return;
    }
    if (!quizIsPublic && !selectedOrg) {
      toast({ title: 'Please select an organization for private quiz', variant: 'destructive' });
      return;
    }
    createQuizMutation.mutate();
  };

  const handleAssignRole = () => {
    if (!assignOrgId || !assignRole) {
      toast({ title: 'Please select organization and role', variant: 'destructive' });
      return;
    }
    assignRoleMutation.mutate();
  };

  const toggleOrgExpand = (orgId: string) => {
    setExpandedOrgs(prev => ({
      ...prev,
      [orgId]: !prev[orgId]
    }));
  };

  const handleUsersSort = (key: string, direction: 'asc' | 'desc') => {
    setUsersSortKey(key);
    setUsersSortDirection(direction);
  };

  const handleRecentUsersSort = (key: string, direction: 'asc' | 'desc') => {
    setRecentUsersSortKey(key);
    setRecentUsersSortDirection(direction);
  };

  const handleOrgPerformanceSort = (key: string, direction: 'asc' | 'desc') => {
    setOrgPerformanceSortKey(key);
    setOrgPerformanceSortDirection(direction);
  };

  const sortData = <T extends Record<string, any>>(data: T[], sortKey: string, sortDirection: 'asc' | 'desc'): T[] => {
    return [...data].sort((a, b) => {
      const keys = sortKey.split('.');
      let aValue: any = a;
      let bValue: any = b;
      
      for (const key of keys) {
        aValue = aValue?.[key];
        bValue = bValue?.[key];
      }
      
      aValue = aValue ?? '';
      bValue = bValue ?? '';
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === 'asc' 
          ? aValue.getTime() - bValue.getTime() 
          : bValue.getTime() - aValue.getTime();
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string' && 
          !isNaN(Date.parse(aValue)) && !isNaN(Date.parse(bValue))) {
        const aDate = new Date(aValue).getTime();
        const bDate = new Date(bValue).getTime();
        return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
      }
      
      return 0;
    });
  };

  const pageDescription = isSuperAdmin 
    ? "Manage organizations, users, and quiz collections" 
    : "Manage your organization's users and quiz collections";

  const overviewStats: StatItem[] = [
    {
      label: 'Organizations',
      value: organizations.length,
      icon: Building2,
    },
    {
      label: 'Total Users',
      value: users.length,
      icon: Users,
    },
    {
      label: 'Quiz Collections',
      value: quizCollections.length,
      icon: BookOpen,
    }
  ];

  const analyticsStats: StatItem[] = analytics ? [
    {
      label: 'Monthly Revenue',
      value: formatPrice(analytics?.overview?.mrr || '0', 'ZAR'),
    },
    {
      label: 'Total Users',
      value: analytics?.overview?.totalUsers || 0,
    },
    {
      label: 'Organizations',
      value: analytics?.overview?.activeOrganizations || 0,
    },
    {
      label: 'Quiz Collections',
      value: analytics?.overview?.totalQuizCollections || 0,
    }
  ] : [];

  const recentUsersColumns: Column<any>[] = [
    {
      key: 'gamerName',
      header: 'Gamer Name',
      mobileLabel: 'Name',
      sortable: true,
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
    },
    {
      key: 'lastActiveAt',
      header: 'Last Active',
      sortable: true,
      render: (user) => new Date(user.lastActiveAt).toLocaleString(),
    }
  ];

  const orgPerformanceColumns: Column<any>[] = [
    {
      key: 'name',
      header: 'Organization',
      mobileLabel: 'Org',
      sortable: true,
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (org) => <span className="capitalize">{org.type}</span>,
    },
    {
      key: 'totalUsers',
      header: 'Users',
      sortable: true,
    },
    {
      key: 'activeUsers',
      header: 'Active',
      sortable: true,
      render: (org) => <span className="text-success">{org.activeUsers ?? 0}</span>,
    },
    {
      key: 'orgAdmins',
      header: 'Admins',
      sortable: true,
    },
    {
      key: 'teachers',
      header: terminology.educatorPlural,
      sortable: true,
    },
    {
      key: 'students',
      header: terminology.learnerPlural,
      sortable: true,
    },
    {
      key: 'subscriptionStatus',
      header: 'Status',
      sortable: true,
      render: (org) => (
        org.isDemo ? (
          <Badge variant="default" className="text-xs">
            Special Plan
          </Badge>
        ) : (
          <Badge variant={org.subscriptionStatus === 'active' ? 'default' : 'secondary'} className="text-xs">
            {org.subscriptionStatus}
          </Badge>
        )
      ),
    }
  ];

  const usersTableColumns: Column<any>[] = [
    {
      key: 'gamerName',
      header: 'Gamer Name',
      mobileLabel: 'Name',
      sortable: true,
      render: (user) => <span className="font-semibold">{user.gamerName}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) => (
        <div className="flex items-center gap-1 flex-wrap">
          {user.isSuperAdmin && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
              Super Admin
            </span>
          )}
          {user.organizationRoles?.map((org: any, idx: number) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary/20 text-secondary dark:bg-secondary/30 dark:text-secondary/90"
            >
              <span>{org.organizationName}</span>
              <span className="text-muted-foreground">({org.role})</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user) => (
        <Button onClick={() => {
            setSelectedUser(user);
            setAssignDialogOpen(true);
          }}
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px]"
          data-testid={`button-assign-${user.id}`}
        >
          <Settings className="h-4 w-4 mr-2" />
          Assign Role
        </Button>
      ),
    }
  ];

  const filteredUsers = users.filter((user: any) => {
    const query = userSearchQuery.toLowerCase();
    return (
      user.gamerName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  });

  const sortedFilteredUsers = sortData(filteredUsers, usersSortKey, usersSortDirection);
  
  return (
    <QuizAdminLayout title={pageTitle} description={pageDescription} activeSection="dashboard">
      <div className="space-y-[var(--space-lg)]" style={{ padding: 'var(--container-padding)' }}>
        <StatsGrid 
          stats={overviewStats} 
          isLoading={orgsLoading || usersLoading || quizLoading}
          columns={3}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 mb-[var(--space-lg)]">
            <TabsList className={`inline-flex sm:grid w-full sm:w-full min-w-max sm:min-w-0 h-auto ${isSuperAdmin ? 'sm:grid-cols-4 lg:grid-cols-7' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {isSuperAdmin && (
              <TabsTrigger value="analytics" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-analytics">
                <Target className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Analytics</span>
                <span className="sm:hidden">Stats</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="lpc-revenue" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-lpc-revenue">
                <Coins className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">LPC Revenue</span>
                <span className="sm:hidden">Revenue</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="costs" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-costs">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Costs</span>
                <span className="sm:hidden">Costs</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="packages" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-packages">
                <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Packages</span>
                <span className="sm:hidden">Pkgs</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="organizations" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-organizations">
              <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Organizations</span>
              <span className="sm:hidden">Orgs</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-users">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="quizzes" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 min-h-[44px]" data-testid="tab-quizzes">
              <BookOpen className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Quiz Collections</span>
              <span className="sm:hidden">Quizzes</span>
            </TabsTrigger>
          </TabsList>
          </div>

          {isSuperAdmin && (
            <TabsContent value="lpc-revenue">
              <LPCAnalyticsDashboard />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="costs">
              <CostManagement />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="packages">
              <Tabs defaultValue="manage" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="manage" className="min-h-[40px]">Manage Packages</TabsTrigger>
                  <TabsTrigger value="calculator" className="min-h-[40px]">Calculator</TabsTrigger>
                </TabsList>
                <TabsContent value="manage">
                  <BusinessPackageManager />
                </TabsContent>
                <TabsContent value="calculator">
                  <PackageCalculator />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="analytics">
              {analyticsLoading ? (
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="text-foreground">Loading analytics...</div>
                </div>
              ) : analytics ? (
                <div className="space-y-[var(--space-lg)]">
                  <Card className="bg-primary hover:bg-primary/90 border-secondary/20">
                    <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-[var(--card-padding)]">
                      <div>
                        <h3 className="font-semibold text-foreground">Organization Trial & Revenue Analytics</h3>
                        <p className="text-sm text-muted-foreground">View detailed trial status, usage metrics, and revenue tracking</p>
                      </div>
                      <Button onClick={() => setLocation('/organization-analytics')} 
                        variant="outline" 
                        className="min-h-[44px] w-full sm:w-auto"
                        data-testid="button-view-org-analytics"
                      >
                        View Dashboard
                      </Button>
                    </CardContent>
                  </Card>

                  <AdminCurrencyToggle
                    showPlatformCurrency={showPlatformCurrency}
                    onToggle={setShowPlatformCurrency}
                    userCurrency={displayCurrency}
                    className="mb-2"
                  />
                  
                  <StatsGrid stats={analyticsStats} columns={4} data-testid="stats-grid-analytics" />

                  <Card>
                    <CardHeader className="p-[var(--card-padding)]">
                      <CardTitle className="text-foreground">User Breakdown by Role</CardTitle>
                      <CardDescription>System-wide user distribution</CardDescription>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--card-gap)]">
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">Super Admins</div>
                          <div className="text-2xl font-bold text-foreground">{analytics?.userBreakdown?.superAdmins || 0}</div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">Org Admins</div>
                          <div className="text-2xl font-bold text-foreground">{analytics?.userBreakdown?.orgAdmins || 0}</div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">{terminology.educatorPlural}</div>
                          <div className="text-2xl font-bold text-foreground">{analytics?.userBreakdown?.teachers || 0}</div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">{terminology.learnerPlural}</div>
                          <div className="text-2xl font-bold text-foreground">{analytics?.userBreakdown?.students || 0}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--card-gap)]">
                    <Card>
                      <CardHeader className="p-[var(--card-padding)]">
                        <CardTitle className="text-foreground">Quiz Activity</CardTitle>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total Attempts</span>
                          <span className="text-lg font-bold text-foreground">{analytics?.engagement?.quiz?.totalQuizzesTaken || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Average Score</span>
                          <span className="text-lg font-bold text-success">{analytics?.engagement?.quiz?.avgScore || 0}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Completion Rate</span>
                          <span className="text-lg font-bold text-secondary">{analytics?.engagement?.quiz?.completionRate || 0}%</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="p-[var(--card-padding)]">
                        <CardTitle className="text-foreground">Card Game Activity</CardTitle>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total Games</span>
                          <span className="text-lg font-bold text-foreground">{analytics?.engagement?.game?.totalGamesPlayed || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Avg Duration</span>
                          <span className="text-lg font-bold text-primary">{analytics?.engagement?.game?.avgDuration || 0}s</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="p-[var(--card-padding)]">
                      <CardTitle className="text-foreground">Recently Active Users</CardTitle>
                      <CardDescription>Last 7 days</CardDescription>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <ResponsiveTable
                        data={sortData(analytics?.recentActivity?.recentlyActiveUsers || [], recentUsersSortKey, recentUsersSortDirection)}
                        columns={recentUsersColumns}
                        keyExtractor={(user) => user.id}
                        emptyMessage="No recent user activity"
                        onSort={handleRecentUsersSort}
                        sortKey={recentUsersSortKey}
                        sortDirection={recentUsersSortDirection}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="p-[var(--card-padding)]">
                      <CardTitle className="text-foreground">Organization Performance</CardTitle>
                      <CardDescription>Detailed breakdown by organization</CardDescription>
                    </CardHeader>
                    <CardContent className="p-[var(--card-padding)] pt-0">
                      <ResponsiveTable
                        data={sortData(analytics?.organizations || [], orgPerformanceSortKey, orgPerformanceSortDirection)}
                        columns={orgPerformanceColumns}
                        keyExtractor={(org) => org.id}
                        emptyMessage="No organization data available"
                        onSort={handleOrgPerformanceSort}
                        sortKey={orgPerformanceSortKey}
                        sortDirection={orgPerformanceSortDirection}
                      />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No analytics data available</div>
              )}
            </TabsContent>
          )}

          <TabsContent value="organizations">
            <div className="space-y-[var(--space-lg)]">
              {isSuperAdmin && (
                <div className="flex justify-end">
                  <Button onClick={() => setIsCreatingOrg(!isCreatingOrg)}
                    size="lg"
                    className="min-h-[44px]"
                    data-testid="button-create-org"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {isCreatingOrg ? 'Cancel' : 'Create Organization'}
                  </Button>
                </div>
              )}

              {isCreatingOrg && (
                <Card>
                  <CardHeader className="p-[var(--card-padding)]">
                    <CardTitle>Create New Organization</CardTitle>
                    <CardDescription>
                      Set up a new educational institution or business organization
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
                    <div className="grid grid-cols-1 gap-[var(--space-md)]">
                      <div className="space-y-2">
                        <Label htmlFor="org-name">Organization Name</Label>
                        <Input
                          id="org-name"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          placeholder="e.g., Springfield High School"
                          className="min-h-[44px]"
                          data-testid="input-org-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="org-type">Organization Type</Label>
                        <Select value={orgType} onValueChange={setOrgType}>
                          <SelectTrigger id="org-type" className="min-h-[44px]" data-testid="select-org-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="education">Educational Institution</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {orgType === 'education' && (
                        <div className="space-y-2">
                          <Label htmlFor="curriculum">Curriculum</Label>
                          <Select value={curriculum} onValueChange={setCurriculum}>
                            <SelectTrigger id="curriculum" className="min-h-[44px]" data-testid="select-curriculum">
                              <SelectValue placeholder="Select curriculum type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CAPS">CAPS</SelectItem>
                              <SelectItem value="IEB">IEB</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="street-address">Street Address</Label>
                        <Input
                          id="street-address"
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="e.g., 123 Main Street"
                          className="min-h-[44px]"
                          data-testid="input-street-address"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <div className="space-y-2">
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="e.g., Cape Town"
                            className="min-h-[44px]"
                            data-testid="input-city"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="province">Province</Label>
                          <Input
                            id="province"
                            value={province}
                            onChange={(e) => setProvince(e.target.value)}
                            placeholder="e.g., Western Cape"
                            className="min-h-[44px]"
                            data-testid="input-province"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <div className="space-y-2">
                          <Label htmlFor="postal-code">Postal Code</Label>
                          <Input
                            id="postal-code"
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            placeholder="e.g., 8001"
                            className="min-h-[44px]"
                            data-testid="input-postal-code"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="country">Country</Label>
                          <Input
                            id="country"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            placeholder="South Africa"
                            className="min-h-[44px]"
                            data-testid="input-country"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="invite-code">Invite Code</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            id="invite-code"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                            placeholder="e.g., ABC123"
                            maxLength={6}
                            className="min-h-[44px] flex-1"
                            data-testid="input-invite-code"
                          />
                          <Button type="button" variant="outline" onClick={generateInviteCode} className="min-h-[44px]" data-testid="button-generate-code" >
                            Generate
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Users will use this code during registration to join
                        </p>
                      </div>
                    </div>

                    <Button onClick={handleCreateOrg} disabled={createOrgMutation.isPending} className="w-full min-h-[44px]" data-testid="button-submit-org" >
                      {createOrgMutation.isPending ? 'Creating...' : 'Create Organization'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {orgsLoading ? (
                <div className="text-center py-12">Loading organizations...</div>
              ) : organizations.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[var(--card-gap)]">
                  {organizations.map((org: any) => (
                    <Card key={org.id} className="hover:shadow-elevated transition-shadow" data-testid={`row-org-${org.id}`}>
                      <CardHeader className="p-[var(--card-padding)]">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Building2 className="h-5 w-5 text-secondary flex-shrink-0" />
                            <CardTitle className="text-xl truncate" data-testid={`text-org-name-${org.id}`}>
                              {org.name}
                            </CardTitle>
                          </div>
                          {isSuperAdmin && (
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]" onClick={() => {
                                if (confirm('Are you sure you want to delete this organization?')) {
                                  deleteOrgMutation.mutate(org.id);
                                }
                              }}
                              data-testid={`button-delete-org-${org.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <CardDescription>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary/20 text-secondary dark:bg-secondary/30 dark:text-secondary/80">
                            {org.type === 'education' ? 'Education' : 'Business'}
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">Invite Code: <strong className="text-secondary dark:text-secondary/80 font-mono">{org.inviteCode}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <BookOpen className="h-4 w-4 flex-shrink-0" />
                          <span className={org.isActive ? 'text-success' : 'text-destructive'}>
                            {org.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-border/50">
                          <div className="text-center">
                            <div className="text-lg font-semibold text-foreground">{org.totalUsers ?? 0}</div>
                            <div className="text-xs text-muted-foreground">Total</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-success">{org.activeUsers ?? 0}</div>
                            <div className="text-xs text-muted-foreground">Active</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-destructive">{org.disabledUsers ?? 0}</div>
                            <div className="text-xs text-muted-foreground">Disabled</div>
                          </div>
                        </div>
                        <div className="pt-2 text-xs text-muted-foreground">
                          Created: {new Date(org.createdAt).toLocaleDateString()}
                        </div>
                        <Button onClick={() => setLocation('/org-structure')}
                          className="w-full mt-4 min-h-[44px] bg-primary hover:bg-primary/90"
                          data-testid={`button-manage-structure-${org.id}`}
                        >
                          <Building2 className="h-4 w-4 mr-2" />
                          Manage Structure
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No organizations yet
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Create your first organization to get started
                    </p>
                    <Button onClick={() => setIsCreatingOrg(true)} className="min-h-[44px]" data-testid="button-create-first-org">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Organization
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="users">
            {usersLoading ? (
              <div className="text-center py-12">Loading users...</div>
            ) : (
              <div className="space-y-[var(--space-md)]">
                <Card>
                  <CardHeader className="p-[var(--card-padding)]">
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>
                      Assign users to organizations and set their roles
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-[var(--card-padding)] pt-0">
                    <div className="mb-[var(--space-md)]">
                      <Input
                        placeholder="Search by name or email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="max-w-md min-h-[44px]"
                        data-testid="input-user-search"
                      />
                    </div>
                    
                    <ResponsiveTable
                      data={sortedFilteredUsers}
                      columns={usersTableColumns}
                      keyExtractor={(user) => user.id}
                      emptyMessage="No users found"
                      onSort={handleUsersSort}
                      sortKey={usersSortKey}
                      sortDirection={usersSortDirection}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="quizzes">
            <div className="space-y-[var(--space-lg)]">
              <div className="flex justify-end">
                <Button onClick={() => setIsCreatingQuiz(!isCreatingQuiz)}
                  size="lg"
                  className="min-h-[44px]"
                  data-testid="button-create-quiz"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isCreatingQuiz ? 'Cancel' : 'Create Quiz Collection'}
                </Button>
              </div>

              {isCreatingQuiz && (
                <Card>
                  <CardHeader className="p-[var(--card-padding)]">
                    <CardTitle>Create Quiz Collection</CardTitle>
                    <CardDescription>
                      Create a new quiz collection with questions and answers
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
                    <div className="grid grid-cols-1 gap-[var(--space-md)]">
                      <div className="space-y-2">
                        <Label htmlFor="quiz-name">Collection Name</Label>
                        <Input
                          id="quiz-name"
                          value={quizName}
                          onChange={(e) => setQuizName(e.target.value)}
                          placeholder="e.g., General Knowledge Quiz"
                          className="min-h-[44px]"
                          data-testid="input-quiz-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="quiz-description">Description</Label>
                        <Textarea
                          id="quiz-description"
                          value={quizDescription}
                          onChange={(e) => setQuizDescription(e.target.value)}
                          placeholder="Brief description of the quiz collection"
                          className="min-h-[88px]"
                          data-testid="input-quiz-description"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="quiz-visibility">Visibility</Label>
                        <Select value={quizIsPublic.toString()} onValueChange={(v) => setQuizIsPublic(v === 'true')}>
                          <SelectTrigger id="quiz-visibility" className="min-h-[44px]" data-testid="select-quiz-visibility">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Public (Available to all users)</SelectItem>
                            <SelectItem value="false">Organization-Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {!quizIsPublic && (
                        <div className="space-y-2">
                          <Label htmlFor="quiz-org">Organization</Label>
                          <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                            <SelectTrigger id="quiz-org" className="min-h-[44px]" data-testid="select-quiz-org">
                              <SelectValue placeholder="Select organization" />
                            </SelectTrigger>
                            <SelectContent>
                              {organizations.map((org: any) => (
                                <SelectItem key={org.id} value={org.id}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="quiz-difficulty">Difficulty</Label>
                        <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                          <SelectTrigger id="quiz-difficulty" className="min-h-[44px]" data-testid="select-quiz-difficulty">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button onClick={handleCreateQuiz} disabled={createQuizMutation.isPending} className="w-full min-h-[44px]" data-testid="button-submit-quiz" >
                      {createQuizMutation.isPending ? 'Creating...' : 'Create Collection'}
                    </Button>

                    <p className="text-sm text-muted-foreground">
                      After creating the collection, you can add quiz cards with questions and answers.
                    </p>
                  </CardContent>
                </Card>
              )}

              {quizLoading ? (
                <div className="text-center py-12">Loading quiz collections...</div>
              ) : quizCollections.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[var(--card-gap)]">
                  {quizCollections.map((quiz: any) => (
                    <Card key={quiz.id} className="hover:shadow-elevated transition-shadow" data-testid={`row-quiz-${quiz.id}`}>
                      <CardHeader className="p-[var(--card-padding)]">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-xl truncate" data-testid={`text-quiz-name-${quiz.id}`}>
                              {quiz.name}
                            </CardTitle>
                            <CardDescription className="mt-2 line-clamp-2">
                              {quiz.description || 'No description'}
                            </CardDescription>
                          </div>
                          <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]" onClick={() => {
                              if (confirm('Are you sure you want to delete this quiz collection?')) {
                                deleteQuizMutation.mutate(quiz.id);
                              }
                            }}
                            data-testid={`button-delete-quiz-${quiz.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {quiz.isPublic ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success/20 text-success">
                              Public
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-warning/20 text-warning">
                              Organization Only
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary/20 text-secondary dark:bg-secondary/30 dark:text-secondary/80">
                            {quiz.difficulty || 'medium'}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <FileText className="h-4 w-4 inline mr-1" />
                          {quiz.totalCards || 0} questions
                        </div>
                        <div className="pt-2 text-xs text-muted-foreground">
                          Created: {new Date(quiz.createdAt).toLocaleDateString()}
                        </div>
                        <Button onClick={() => setLocation('/course-builder')}
                          className="w-full mt-4 min-h-[44px] bg-primary hover:bg-primary/90"
                          data-testid={`button-manage-questions-${quiz.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Open Course Builder
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No quiz collections yet
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Create your first quiz collection to get started
                    </p>
                    <Button onClick={() => setIsCreatingQuiz(true)} className="min-h-[44px]" data-testid="button-create-first-quiz">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Quiz Collection
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign User to Organization</DialogTitle>
              <DialogDescription>
                Assign {selectedUser?.gamerName} to an organization with a specific role
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-[var(--space-md)] py-4">
              <div className="space-y-2">
                <Label htmlFor="assign-org">Organization</Label>
                <Select value={assignOrgId} onValueChange={setAssignOrgId}>
                  <SelectTrigger id="assign-org" className="min-h-[44px]" data-testid="select-assign-org">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org: any) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assign-role">Role</Label>
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger id="assign-role" className="min-h-[44px]" data-testid="select-assign-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_admin">Organization Admin</SelectItem>
                    <SelectItem value="teacher">{terminology.educator}</SelectItem>
                    <SelectItem value="student">{terminology.learner}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}
                className="min-h-[44px]"
                data-testid="button-cancel-assign"
              >
                Cancel
              </Button>
              <Button onClick={handleAssignRole} disabled={assignRoleMutation.isPending} className="min-h-[44px]" data-testid="button-submit-assign" >
                {assignRoleMutation.isPending ? 'Assigning...' : 'Assign Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
