import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, BookOpen, TrendingUp, Settings, FolderTree, FileText, UserPlus, BarChart3, Edit } from 'lucide-react';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { RecommendationBanner } from '@/components/admin/RecommendationBanner';

export default function OrgAdminDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const terminologyLowerSafe = terminologyLower ?? {
    unit: 'unit',
    subUnit: 'sub-unit',
    team: 'team',
    learner: 'learner',
    learnerPlural: 'learners',
    educator: 'trainer',
    educatorPlural: 'trainers',
  };
  
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedAssignUser, setSelectedAssignUser] = useState<any>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState('');
  const [assignUnitId, setAssignUnitId] = useState('');
  const [assignSubUnitId, setAssignSubUnitId] = useState('');

  const [studentsSortKey, setStudentsSortKey] = useState<string>('userName');
  const [studentsSortDirection, setStudentsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [reportsSortKey, setReportsSortKey] = useState<string>('collectionName');
  const [reportsSortDirection, setReportsSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: user } = useQuery<any>({ queryKey: ['/api/auth/user'] });
  const { impersonatedOrganization } = useAuth();
  const effectiveOrgId = impersonatedOrganization?.id || user?.organizationId;
  const { data: organization } = useQuery<any>({
    queryKey: ['/api/my-organization'],
    enabled: !!effectiveOrgId,
  });

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', effectiveOrgId, 'units'],
    enabled: !!effectiveOrgId,
  });

  const { data: allSubUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', effectiveOrgId, 'sub-units'],
    enabled: !!effectiveOrgId,
  });

  const { data: quizCollections = [] } = useQuery<any[]>({
    queryKey: ['/api/quiz/collections'],
  });

  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ['/api/quiz/assignments'],
  });

  const { data: students = [] } = useQuery<any[]>({
    queryKey: ['/api/teacher/students'],
  });

  const { data: progressReports = [] } = useQuery<any[]>({
    queryKey: ['/api/teacher/progress'],
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
  });

  const availableUsers = allUsers.filter((u: any) => 
    !students.some((s: any) => s.userId === u.id)
  );

  const selectedUnitSubUnits = allSubUnits.filter((su: any) => su.unitId === assignUnitId);

  const assignUserMutation = useMutation({
    mutationFn: async () => {
      const userId = selectedAssignUser?.id || assignUserId;
      
      await apiRequest(`/api/admin/organizations/${effectiveOrgId}/users/${userId}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          role: assignRole,
        }),
      });
      
      if (assignUnitId) {
        await apiRequest(`/api/admin/organizations/${effectiveOrgId}/users/${userId}/assignments`, {
          method: 'POST',
          body: JSON.stringify({
            unitId: assignUnitId,
            subUnitId: assignSubUnitId || undefined,
          }),
        });
      }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'User assigned successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/students'] });
      setAssignDialogOpen(false);
      setSelectedAssignUser(null);
      setAssignUserId('');
      setAssignRole('');
      setAssignUnitId('');
      setAssignSubUnitId('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign user',
        variant: 'destructive',
      });
    },
  });

  const totalStudents = students.length;
  const totalAssignments = assignments.length;
  const averageProgress = progressReports.length > 0
    ? Math.round(progressReports.reduce((acc: number, p: any) => acc + (p.completionRate || 0), 0) / progressReports.length)
    : 0;

  const handleOpenAssignDialog = () => {
    setAssignDialogOpen(true);
    setSelectedAssignUser(null);
    setAssignUserId('');
    setAssignRole('student');
    setAssignUnitId('');
    setAssignSubUnitId('');
  };

  const handleEditUserAssignment = (student: any) => {
    setSelectedAssignUser(student);
    setAssignRole(student.role);
    setAssignUnitId(student.unitId || '');
    setAssignSubUnitId(student.subUnitId || '');
    setAssignDialogOpen(true);
  };

  const handleAssignUser = async () => {
    if (!selectedAssignUser && !assignUserId) {
      toast({
        title: 'Error',
        description: 'Please select a user to assign',
        variant: 'destructive',
      });
      return;
    }
    
    if (!assignRole) {
      toast({
        title: 'Error',
        description: 'Please select a role',
        variant: 'destructive',
      });
      return;
    }
    
    if (!assignUnitId) {
      toast({
        title: 'Error',
        description: `Please select a ${terminologyLowerSafe.unit}`,
        variant: 'destructive',
      });
      return;
    }
    
    assignUserMutation.mutate();
  };

  const handleStudentsSort = (key: string, direction: 'asc' | 'desc') => {
    setStudentsSortKey(key);
    setStudentsSortDirection(direction);
  };

  const handleReportsSort = (key: string, direction: 'asc' | 'desc') => {
    setReportsSortKey(key);
    setReportsSortDirection(direction);
  };

  const sortData = <T extends Record<string, any>>(data: T[], sortKey: string, sortDirection: 'asc' | 'desc'): T[] => {
    return [...data].sort((a, b) => {
      const aValue = a[sortKey] ?? '';
      const bValue = b[sortKey] ?? '';
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
  };

  const sortedStudents = sortData(students, studentsSortKey, studentsSortDirection);
  const sortedReports = sortData(progressReports, reportsSortKey, reportsSortDirection);

  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <QuizAdminLayout title="Admin Dashboard" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  const statsData: StatItem[] = [
    {
      label: 'Organization Units',
      value: units.length,
      icon: Building2,
    },
    {
      label: 'Sub-Units',
      value: allSubUnits.length,
      icon: FolderTree,
    },
    {
      label: terminology.learnerPlural,
      value: totalStudents,
      icon: Users,
    },
    {
      label: 'Quiz Assignments',
      value: totalAssignments,
      icon: BookOpen,
    },
  ];

  const studentsColumns: Column<any>[] = [
    {
      key: 'userName',
      header: 'Name',
      mobileLabel: 'Name',
      sortable: true,
    },
    {
      key: 'unitName',
      header: terminology.unit,
      mobileLabel: terminology.unit,
      sortable: true,
      render: (student) => (
        <span>{student.unitName} {student.subUnitName ? `- ${student.subUnitName}` : ''}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      mobileLabel: 'Role',
      sortable: true,
      render: (student) => (
        <Badge variant="outline">{student.role}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      mobileLabel: 'Actions',
      render: (student) => (
        <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation" onClick={() => handleEditUserAssignment(student)}
          data-testid={`button-edit-user-${student.userId}`}
        >
          <Edit className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  const reportsColumns: Column<any>[] = [
    {
      key: 'collectionName',
      header: 'Quiz Collection',
      mobileLabel: 'Quiz',
      sortable: true,
    },
    {
      key: 'averageScore',
      header: 'Avg Score',
      mobileLabel: 'Avg Score',
      sortable: true,
      render: (report) => `${report.averageScore || 0}%`,
    },
    {
      key: 'questionsAnswered',
      header: 'Questions',
      mobileLabel: 'Questions',
      sortable: true,
      render: (report) => report.questionsAnswered || 0,
    },
    {
      key: 'completionRate',
      header: 'Completion',
      mobileLabel: 'Completion',
      sortable: true,
      render: (report) => (
        <Badge variant={report.completionRate === 100 ? "default" : "secondary"}>
          {report.completionRate}%
        </Badge>
      ),
    },
  ];

  return (
    <QuizAdminLayout
      title="Organization Dashboard"
      description={organization?.name || 'Loading...'}
    >
      <div className="space-y-[var(--space-lg)] p-[var(--space-md)]">
        {effectiveOrgId && (
          <RecommendationBanner organizationId={effectiveOrgId} />
        )}

        <StatsGrid 
          stats={statsData} 
          columns={4} 
          className="mb-6"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <TabsList className="inline-flex sm:grid w-full sm:w-full min-w-max sm:min-w-0 sm:grid-cols-4">
              <TabsTrigger value="overview" className="min-h-[44px] touch-manipulation" data-testid="tab-overview">
                <BarChart3 className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="structure" className="min-h-[44px] touch-manipulation" data-testid="tab-structure">
                <FolderTree className="w-4 h-4 mr-2" />
                Structure
              </TabsTrigger>
              <TabsTrigger value="users" className="min-h-[44px] touch-manipulation" data-testid="tab-users">
                <Users className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="reports" className="min-h-[44px] touch-manipulation" data-testid="tab-reports">
                <TrendingUp className="w-4 h-4 mr-2" />
                Reports
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-[var(--space-lg)]">
            <Card className="glass-effect">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-xl)]">Organization Information</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">Overview of your organization</CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                  <div>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">Organization Name</p>
                    <p className="text-[length:var(--text-lg)] font-semibold">{organization?.name}</p>
                  </div>
                  <div>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">Organization Type</p>
                    <Badge variant="secondary" className="text-[length:var(--text-sm)]">
                      {organization?.type === 'education' ? 'Educational Institution' : organization?.type === 'elearning' ? 'E-Learning Organization' : 'Business Organization'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">Invite Code</p>
                    <p className="text-[length:var(--text-lg)] font-mono font-bold text-primary">{organization?.inviteCode}</p>
                  </div>
                  <div>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">Average Progress</p>
                    <p className="text-[length:var(--text-lg)] font-semibold">{averageProgress}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--space-lg)]">
              <CollapsibleSection
                title="Quick Actions"
                description="Manage your organization"
                icon={Settings}
                defaultOpen={true}
              >
                <div className="space-y-[var(--space-sm)]">
                  <Button onClick={() => setLocation('/org-structure')}
                    className="w-full justify-start min-h-[44px] touch-manipulation"
                    variant="outline"
                    data-testid="button-manage-structure"
                  >
                    <FolderTree className="w-4 h-4 mr-2" />
                    Manage Organization Structure
                  </Button>
                  <Button onClick={() => setLocation('/super-admin')}
                    className="w-full justify-start min-h-[44px] touch-manipulation"
                    variant="outline"
                    data-testid="button-assign-users"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign Users & Roles
                  </Button>
                  <Button onClick={() => setLocation('/course-builder')}
                    className="w-full justify-start min-h-[44px] touch-manipulation"
                    variant="outline"
                    data-testid="button-manage-quizzes"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Manage Lessons & Quizzes
                  </Button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Recent Activity"
                description="Latest quiz completions"
                icon={TrendingUp}
                defaultOpen={true}
              >
                {progressReports.slice(0, 5).map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between py-[var(--space-sm)] border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[length:var(--text-sm)] font-medium truncate">{report.collectionName}</p>
                      <p className="text-[length:var(--text-xs)] text-muted-foreground">Progress: {report.completionRate}%</p>
                    </div>
                    <Badge variant={report.completionRate === 100 ? "default" : "secondary"}>
                      {report.completionRate === 100 ? 'Complete' : 'In Progress'}
                    </Badge>
                  </div>
                ))}
                {progressReports.length === 0 && (
                  <p className="text-[length:var(--text-sm)] text-muted-foreground italic py-[var(--space-md)]">No activity yet</p>
                )}
              </CollapsibleSection>
            </div>
          </TabsContent>

          <TabsContent value="structure" className="space-y-[var(--space-lg)]">
            <CollapsibleSection
              title="Organization Structure"
              description={`Manage ${terminologyLower.unitPlural} and ${terminologyLower.subUnitPlural}`}
              icon={FolderTree}
              defaultOpen={true}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
                {units.map((unit: any) => {
                  const unitSubUnits = allSubUnits.filter((su: any) => su.unitId === unit.id);
                  return (
                    <Card key={unit.id} className="border-2 glass-effect">
                      <CardHeader className="pb-[var(--space-sm)] p-[var(--card-padding)]">
                        <CardTitle className="text-[length:var(--text-base)]">{unit.name}</CardTitle>
                        <CardDescription className="text-[length:var(--text-sm)]">{unitSubUnits.length} {terminologyLower.subUnitPlural}</CardDescription>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0">
                        <div className="space-y-1">
                          {unitSubUnits.map((subUnit: any) => (
                            <div key={subUnit.id} className="text-[length:var(--text-sm)] text-muted-foreground flex items-center gap-[var(--space-xs)]">
                              <div className="w-2 h-2 rounded-full bg-primary"></div>
                              {subUnit.name}
                            </div>
                          ))}
                          {unitSubUnits.length === 0 && (
                            <p className="text-[length:var(--text-sm)] text-muted-foreground italic">
                              No {terminologyLower.subUnitPlural} yet
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {units.length === 0 && (
                  <div className="col-span-2 text-center py-[var(--space-lg)]">
                    <p className="text-muted-foreground mb-[var(--space-md)]">No organization structure defined yet</p>
                    <Button onClick={() => setLocation('/org-structure')} className="min-h-[44px] touch-manipulation" data-testid="button-create-structure">
                      <FolderTree className="w-4 h-4 mr-2" />
                      Create Structure
                    </Button>
                  </div>
                )}
              </div>
              {units.length > 0 && (
                <Button onClick={() => setLocation('/org-structure')}
                  className="w-full mt-[var(--space-md)] min-h-[44px] touch-manipulation"
                  data-testid="button-edit-structure"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Edit Organization Structure
                </Button>
              )}
            </CollapsibleSection>
          </TabsContent>

          <TabsContent value="users" className="space-y-[var(--space-lg)]">
            <Card className="glass-effect">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-md)]">
                  <div>
                    <CardTitle className="text-[length:var(--text-xl)]">Users in Organization</CardTitle>
                    <CardDescription className="text-[length:var(--text-sm)]">All users across all {terminologyLower.unitPlural}</CardDescription>
                  </div>
                  <Button onClick={handleOpenAssignDialog} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-assign-user">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign User
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <ResponsiveTable
                  data={sortedStudents}
                  columns={studentsColumns}
                  keyExtractor={(student) => student.userId}
                  emptyMessage="No users assigned yet"
                  onSort={handleStudentsSort}
                  sortKey={studentsSortKey}
                  sortDirection={studentsSortDirection}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-[var(--space-lg)]">
            <Card className="glass-effect">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-xl)]">Progress Reports</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">Performance across all quizzes</CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <ResponsiveTable
                  data={sortedReports}
                  columns={reportsColumns}
                  keyExtractor={(report) => report.id}
                  emptyMessage="No progress data available yet"
                  onSort={handleReportsSort}
                  sortKey={reportsSortKey}
                  sortDirection={reportsSortDirection}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md p-[var(--dialog-padding)]">
            <DialogHeader>
              <DialogTitle className="text-[length:var(--text-xl)]">
                {selectedAssignUser ? 'Edit User Assignment' : 'Assign User to Organization'}
              </DialogTitle>
              <DialogDescription className="text-[length:var(--text-sm)]">
                {selectedAssignUser 
                  ? `Update ${selectedAssignUser.userName}'s role and assignment` 
                  : 'Assign a user to your organization with a specific role and unit'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              {!selectedAssignUser && (
                <div className="space-y-[var(--space-xs)]">
                  <Label htmlFor="assign-user">Select User</Label>
                  <Select value={assignUserId} onValueChange={setAssignUserId}>
                    <SelectTrigger id="assign-user" className="min-h-[44px] touch-manipulation" data-testid="select-assign-user">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.gamerName} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableUsers.length === 0 && (
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      All registered users are already assigned to this organization
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-[var(--space-xs)]">
                <Label htmlFor="assign-role">Role</Label>
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger id="assign-role" className="min-h-[44px] touch-manipulation" data-testid="select-assign-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">
                      {terminology.educator}
                    </SelectItem>
                    <SelectItem value="team_lead">
                      {terminology.unit} Lead
                    </SelectItem>
                    <SelectItem value="student">
                      {terminology.learner}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-[var(--space-xs)]">
                <Label htmlFor="assign-unit">{terminology.unit}</Label>
                <Select value={assignUnitId} onValueChange={(value) => {
                  setAssignUnitId(value);
                  setAssignSubUnitId('');
                }}>
                  <SelectTrigger id="assign-unit" className="min-h-[44px] touch-manipulation" data-testid="select-assign-unit">
                    <SelectValue placeholder={`Select ${terminologyLower.unit}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {assignUnitId && selectedUnitSubUnits.length > 0 && (
                <div className="space-y-[var(--space-xs)]">
                  <Label htmlFor="assign-subunit">{terminology.subUnit} (Optional)</Label>
                  <Select value={assignSubUnitId} onValueChange={(val) => setAssignSubUnitId(val === 'none' ? '' : val)}>
                    <SelectTrigger id="assign-subunit" className="min-h-[44px] touch-manipulation" data-testid="select-assign-subunit">
                      <SelectValue placeholder={`Select ${terminologyLower.subUnit}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {selectedUnitSubUnits.map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id}>
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-[var(--space-sm)]">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                data-testid="button-cancel-assign"
              >
                Cancel
              </Button>
              <Button onClick={handleAssignUser} disabled={assignUserMutation.isPending || (!selectedAssignUser && !assignUserId)} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-submit-assign" >
                {assignUserMutation.isPending ? 'Assigning...' : (selectedAssignUser ? 'Update Assignment' : 'Assign User')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
