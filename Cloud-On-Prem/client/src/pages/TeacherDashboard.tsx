import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { BookOpen, Users, TrendingUp, Plus, Trash2, UserCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { CollapsibleSection } from '@/components/ui/collapsible-section';

export default function TeacherDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user: authUser, isAuthenticated, impersonatedOrganization } = useAuth();
  const userId = (authUser as any)?.id;

  const { terminology: terminologyContext, terminologyLower: terminologyLowerContext, isResolved } = useOrganizationTerminology();
  const terminology = (terminologyContext ?? {
    unit: 'Unit',
    unitPlural: 'Units',
    subUnit: 'SubUnit',
    subUnitPlural: 'SubUnits',
    team: 'Team',
    teamPlural: 'Teams',
    learner: 'Learner',
    learnerPlural: 'Learners',
  }) as any;
  const terminologyLower = (terminologyLowerContext ?? {
    unit: 'unit',
    unitPlural: 'units',
    subUnit: 'sub-unit',
    subUnitPlural: 'sub-units',
    team: 'team',
    teamPlural: 'teams',
    learner: 'learner',
    learnerPlural: 'learners',
  }) as any;
  const terminologyResolved = isResolved && !!terminologyContext && !!terminologyLowerContext;

  const { data: adminCheck, isLoading: adminLoading, isFetching: adminFetching, isError: adminError } = useQuery({
    queryKey: ["/api/admin/check", userId],
    retry: false,
    enabled: isAuthenticated && !!userId,
  });

  const adminData = adminCheck as any;
  const isTeacher = adminData?.isTeacher || false;

  useEffect(() => {
    if (isAuthenticated && userId && adminData && !adminLoading && !adminFetching && !adminError && isTeacher) {
      setLocation('/management-hub');
    }
  }, [isTeacher, adminLoading, adminFetching, adminError, isAuthenticated, userId, adminData, setLocation]);
  const [activeTab, setActiveTab] = useState('assignments');
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedSubUnit, setSelectedSubUnit] = useState('');
  const [selectedQuiz, setSelectedQuiz] = useState('');
  const [requiredPassPercentage, setRequiredPassPercentage] = useState(70);
  
  const [assignStudentDialog, setAssignStudentDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentUnit, setStudentUnit] = useState('');
  const [studentSubUnit, setStudentSubUnit] = useState('');

  const user = authUser as any;
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

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/quiz/assignments'],
  });

  const { data: students = [] } = useQuery<any[]>({
    queryKey: ['/api/teacher/students'],
  });

  const { data: progressReports = [] } = useQuery<any[]>({
    queryKey: ['/api/teacher/progress'],
  });

  const unitLabel = terminology.unit;
  const subUnitLabel = terminology.subUnit;

  const availableSubUnits = selectedUnit
    ? allSubUnits.filter((su: any) => su.unitId === selectedUnit)
    : [];

  const availableQuizzes = effectiveOrgId
    ? quizCollections.filter((q: any) => q.isPublic || q.organizationId === effectiveOrgId)
    : quizCollections.filter((q: any) => q.isPublic);

  const assignQuizMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/quiz/assign', {
        method: 'POST',
        body: JSON.stringify({
          collectionId: selectedQuiz,
          unitId: selectedUnit || null,
          subUnitId: selectedSubUnit || null,
          requiredPassPercentage: requiredPassPercentage,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assigned'] });
      toast({ title: 'Quiz assigned successfully' });
      setAssignDialog(false);
      setSelectedUnit('');
      setSelectedSubUnit('');
      setSelectedQuiz('');
      setRequiredPassPercentage(70);
    },
    onError: () => {
      toast({ title: 'Failed to assign quiz', variant: 'destructive' });
    }
  });

  const unassignQuizMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return await apiRequest(`/api/quiz/assign/${assignmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assigned'] });
      toast({ title: 'Assignment removed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to remove assignment', variant: 'destructive' });
    }
  });

  const assignStudentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/teacher/assign-student', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent,
          unitId: studentUnit,
          subUnitId: studentSubUnit || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/students'] });
      toast({ title: `${terminology.learner} assigned successfully` });
      setAssignStudentDialog(false);
      setSelectedStudent('');
      setStudentUnit('');
      setStudentSubUnit('');
    },
    onError: (error: any) => {
      toast({ title: error.message || `Failed to assign ${terminologyLower.learner}`, variant: 'destructive' });
    }
  });

  const removeStudentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return await apiRequest(`/api/teacher/remove-student/${assignmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/students'] });
      toast({ title: `${terminology.learner} removed from ${terminologyLower.unit}/${terminologyLower.subUnit}` });
    },
    onError: () => {
      toast({ title: `Failed to remove ${terminologyLower.learner}`, variant: 'destructive' });
    }
  });

  const handleAssignQuiz = () => {
    if (!selectedQuiz) {
      toast({ title: 'Please select a quiz collection', variant: 'destructive' });
      return;
    }
    if (!selectedUnit && !selectedSubUnit) {
      toast({ title: 'Please select at least a unit or sub-unit', variant: 'destructive' });
      return;
    }
    assignQuizMutation.mutate();
  };

  const getUnitName = (unitId: string) => {
    return units.find((u: any) => u.id === unitId)?.name || 'Unknown';
  };

  const getSubUnitName = (subUnitId: string) => {
    return allSubUnits.find((su: any) => su.id === subUnitId)?.name || 'Unknown';
  };

  const getQuizName = (collectionId: string) => {
    return quizCollections.find((q: any) => q.id === collectionId)?.name || 'Unknown';
  };

  const totalStudents = students.length;
  const activeAssignments = assignments.length;
  const completionRate = progressReports.length > 0
    ? Math.round(progressReports.reduce((acc: number, r: any) => acc + (r.completionRate || 0), 0) / progressReports.length)
    : 0;

  const statsData: StatItem[] = [
    {
      label: terminology.learnerPlural,
      value: totalStudents,
      icon: Users,
    },
    {
      label: 'Active Assignments',
      value: activeAssignments,
      icon: BookOpen,
    },
    {
      label: 'Avg. Completion',
      value: `${completionRate}%`,
      icon: TrendingUp,
    },
  ];

  if (!terminologyResolved) {
    return (
      <QuizAdminLayout title="Dashboard" description="Loading..." activeSection="dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout
      title="My Teaching"
      description={organization?.name || 'Not affiliated with an organization'}
      activeSection="dashboard"
    >
      <div className="max-w-7xl mx-auto" style={{ padding: 'var(--container-padding)' }}>
        <div className="mb-[var(--space-xl)]" data-testid="teacher-stats-section">
          <StatsGrid 
            stats={statsData} 
            columns={3}
            className="[&_[data-testid='stat-value-0']]:before:content-[''] [&_[data-testid='stat-value-1']]:before:content-[''] [&_[data-testid='stat-value-2']]:before:content-['']"
          />
          <div className="sr-only">
            <span data-testid="text-students-count">{totalStudents}</span>
            <span data-testid="text-assignments-count">{activeAssignments}</span>
            <span data-testid="text-completion-rate">{completionRate}%</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto mb-[var(--space-lg)]">
            <TabsList className="inline-flex sm:grid w-full sm:w-full min-w-max sm:min-w-0 sm:grid-cols-3 min-h-[44px]">
              <TabsTrigger 
                value="assignments" 
                className="flex items-center gap-2 min-h-[44px] px-4"
                data-testid="tab-assignments"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Assignments</span>
                <span className="sm:hidden">Assign</span>
              </TabsTrigger>
              <TabsTrigger 
                value="students" 
                className="flex items-center gap-2 min-h-[44px] px-4"
                data-testid="tab-students"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">{terminology.learnerPlural}</span>
                <span className="sm:hidden">{terminology.learner}</span>
              </TabsTrigger>
              <TabsTrigger 
                value="progress" 
                className="flex items-center gap-2 min-h-[44px] px-4"
                data-testid="tab-progress"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Progress Reports</span>
                <span className="sm:hidden">Progress</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="assignments">
            <div className="space-y-[var(--space-lg)]">
              <div className="flex justify-end">
                <Button onClick={() => setAssignDialog(true)}
                  variant="gradient"
                  className="min-h-[44px] min-w-[44px] px-4"
                  data-testid="button-assign-quiz"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Assign Quiz
                </Button>
              </div>

              {assignmentsLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading assignments...</div>
              ) : assignments.length > 0 ? (
                <div 
                  className="grid gap-[var(--card-gap)]"
                  style={{ 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' 
                  }}
                >
                  {assignments.map((assignment: any) => (
                    <Card 
                      key={assignment.id} 
                      className="bg-surface-raised shadow-card border-l-4 border-l-primary transition-shadow hover:shadow-elevated"
                    >
                      <CardHeader className="p-[var(--card-padding)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg truncate" data-testid={`text-assignment-${assignment.id}`}>
                              {getQuizName(assignment.collectionId)}
                            </CardTitle>
                            <CardDescription className="mt-2 flex flex-wrap gap-2">
                              {assignment.unitId && (
                                <Badge variant="outline" className="text-xs">
                                  {unitLabel}: {getUnitName(assignment.unitId)}
                                </Badge>
                              )}
                              {assignment.subUnitId && (
                                <Badge variant="outline" className="text-xs">
                                  {subUnitLabel}: {getSubUnitName(assignment.subUnitId)}
                                </Badge>
                              )}
                            </CardDescription>
                          </div>
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" onClick={() => {
                              if (confirm('Remove this assignment?')) {
                                unassignQuizMutation.mutate(assignment.id);
                              }
                            }}
                            data-testid={`button-remove-${assignment.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-[var(--card-padding)] pb-[var(--card-padding)] pt-0">
                        <div className="text-sm text-muted-foreground">
                          Assigned: {new Date(assignment.createdAt).toLocaleDateString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-surface-raised shadow-card">
                  <CardContent className="py-12 text-center">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No Assignments Yet
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Create your first quiz assignment for your {terminologyLower.learnerPlural}
                    </p>
                    <Button onClick={() => setAssignDialog(true)} 
                      className="min-h-[44px] min-w-[44px]"
                      data-testid="button-create-first-assignment"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Assign Quiz
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="students">
            <div className="mb-[var(--space-lg)]">
              <Button onClick={() => setAssignStudentDialog(true)}
                className="min-h-[44px] min-w-[44px] px-4"
                data-testid="button-assign-student"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Assign {terminology.learner} to {unitLabel}
              </Button>
            </div>
            {students.length > 0 ? (
              <div 
                className="grid gap-[var(--card-gap)]"
                style={{ 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' 
                }}
              >
                {students.map((student: any) => (
                  <Card key={student.id} className="bg-surface-raised shadow-card border-l-4 border-l-primary">
                    <CardHeader className="p-[var(--card-padding)]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 shrink-0 rounded-full bg-surface-raised flex items-center justify-center text-primary-foreground font-bold">
                            {student.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate" data-testid={`text-student-${student.id}`}>
                              {student.username}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {student.role}
                            </CardDescription>
                          </div>
                        </div>
                        {student.assignmentId && (
                          <Button size="icon" variant="ghost" onClick={() => removeStudentMutation.mutate(student.assignmentId)}
                            disabled={removeStudentMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px] shrink-0"
                            data-testid={`button-remove-${student.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-[var(--card-padding)] pb-[var(--card-padding)] pt-0">
                      {student.unitName ? (
                        <div className="text-sm text-muted-foreground">
                          {unitLabel}: {student.unitName}
                          {student.subUnitName && ` / ${student.subUnitName}`}
                        </div>
                      ) : (
                        <div className="text-sm text-warning">
                          Not assigned to {terminologyLower.unit}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-surface-raised shadow-card">
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No {terminology.learnerPlural} Found
                  </h3>
                  <p className="text-muted-foreground">
                    {terminology.learnerPlural} assigned to your {terminologyLower.subUnitPlural} will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="progress">
            {progressReports.length > 0 ? (
              <div className="space-y-[var(--card-gap)]">
                <div className="block md:hidden">
                  <CollapsibleSection
                    title="Progress Reports"
                    description={`${progressReports.length} report${progressReports.length !== 1 ? 's' : ''}`}
                    icon={TrendingUp}
                    defaultOpen={true}
                  >
                    <div className="space-y-[var(--card-gap)]">
                      {progressReports.map((report: any, index: number) => (
                        <ProgressReportCard 
                          key={index} 
                          report={report} 
                          index={index} 
                        />
                      ))}
                    </div>
                  </CollapsibleSection>
                </div>
                <div className="hidden md:block space-y-[var(--card-gap)]">
                  {progressReports.map((report: any, index: number) => (
                    <ProgressReportCard 
                      key={index} 
                      report={report} 
                      index={index} 
                    />
                  ))}
                </div>
              </div>
            ) : (
              <Card className="bg-surface-raised shadow-card">
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No Progress Data
                  </h3>
                  <p className="text-muted-foreground">
                    {terminology.learner} progress will appear here once they start taking quizzes
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
          <DialogContent className="max-w-lg max-h-[var(--dialog-max-height)] overflow-y-auto" style={{ padding: 'var(--dialog-padding)' }}>
            <DialogHeader>
              <DialogTitle>Assign Quiz to {terminology.learnerPlural}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="quiz-select">Quiz Collection</Label>
                <Select value={selectedQuiz} onValueChange={setSelectedQuiz}>
                  <SelectTrigger id="quiz-select" className="min-h-[44px]" data-testid="select-quiz">
                    <SelectValue placeholder="Select a quiz collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableQuizzes.map((quiz: any) => (
                      <SelectItem key={quiz.id} value={quiz.id} className="min-h-[44px]">
                        {quiz.name} ({quiz.totalCards || 0} questions)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit-select">{unitLabel}</Label>
                <Select value={selectedUnit} onValueChange={(val) => {
                  setSelectedUnit(val);
                  setSelectedSubUnit('');
                }}>
                  <SelectTrigger id="unit-select" className="min-h-[44px]" data-testid="select-unit">
                    <SelectValue placeholder={`Select a ${terminologyLower.unit}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id} className="min-h-[44px]">
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUnit && (
                <div className="space-y-2">
                  <Label htmlFor="subunit-select">{subUnitLabel} (Optional)</Label>
                  <Select value={selectedSubUnit} onValueChange={setSelectedSubUnit}>
                    <SelectTrigger id="subunit-select" className="min-h-[44px]" data-testid="select-subunit">
                      <SelectValue placeholder={`All ${subUnitLabel}es (click to select specific)`} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubUnits.map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id} className="min-h-[44px]">
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="pass-percentage">Required Pass Percentage</Label>
                <Input
                  id="pass-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={requiredPassPercentage}
                  onChange={(e) => setRequiredPassPercentage(Number(e.target.value))}
                  data-testid="input-pass-percentage"
                  className="w-full min-h-[44px]"
                />
                <p className="text-sm text-muted-foreground">
                  {terminology.learnerPlural} must score at least {requiredPassPercentage}% to pass this quiz
                </p>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setAssignDialog(false)} 
                className="min-h-[44px] w-full sm:w-auto"
                data-testid="button-cancel-assign"
              >
                Cancel
              </Button>
              <Button onClick={handleAssignQuiz} disabled={assignQuizMutation.isPending} className="min-h-[44px] w-full sm:w-auto" data-testid="button-confirm-assign" >
                {assignQuizMutation.isPending ? 'Assigning...' : 'Assign Quiz'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={assignStudentDialog} onOpenChange={setAssignStudentDialog}>
          <DialogContent className="max-w-lg max-h-[var(--dialog-max-height)] overflow-y-auto" style={{ padding: 'var(--dialog-padding)' }}>
            <DialogHeader>
              <DialogTitle>Assign {terminology.learner} to {unitLabel}/{subUnitLabel}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="student-select">Select {terminology.learner}</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger id="student-select" className="min-h-[44px]" data-testid="select-student">
                    <SelectValue placeholder={`Select a ${terminologyLower.learner}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.filter((s: any) => s.role === 'student').map((student: any) => (
                      <SelectItem key={student.id} value={student.id} className="min-h-[44px]">
                        {student.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-unit-select">{unitLabel}</Label>
                <Select value={studentUnit} onValueChange={(val) => {
                  setStudentUnit(val);
                  setStudentSubUnit('');
                }}>
                  <SelectTrigger id="student-unit-select" className="min-h-[44px]" data-testid="select-student-unit">
                    <SelectValue placeholder={`Select a ${terminologyLower.unit}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id} className="min-h-[44px]">
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {studentUnit && (
                <div className="space-y-2">
                  <Label htmlFor="student-subunit-select">{subUnitLabel} (Optional)</Label>
                  <Select value={studentSubUnit} onValueChange={(val) => setStudentSubUnit(val === 'none' ? '' : val)}>
                    <SelectTrigger id="student-subunit-select" className="min-h-[44px]" data-testid="select-student-subunit">
                      <SelectValue placeholder={`Select a ${terminologyLower.subUnit}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="min-h-[44px]">None</SelectItem>
                      {allSubUnits.filter((su: any) => su.unitId === studentUnit).map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id} className="min-h-[44px]">
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setAssignStudentDialog(false)} 
                className="min-h-[44px] w-full sm:w-auto"
                data-testid="button-cancel-student-assign"
              >
                Cancel
              </Button>
              <Button onClick={() => assignStudentMutation.mutate()}
                disabled={assignStudentMutation.isPending || !selectedStudent || !studentUnit}
                data-testid="button-confirm-student-assign"
                className="bg-primary hover:bg-primary/90 min-h-[44px] w-full sm:w-auto"
              >
                {assignStudentMutation.isPending ? 'Assigning...' : `Assign ${terminology.learner}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}

function ProgressReportCard({ report, index }: { report: any; index: number }) {
  return (
    <Card className="glass-effect" data-testid={`progress-report-${index}`}>
      <CardContent className="p-[var(--card-padding)]">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {report.studentName}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {report.collectionName}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                {report.questionsAnswered} / {report.totalQuestions} answered
              </Badge>
              <Badge variant="outline" className="text-xs">
                {report.attempts} attempt{report.attempts !== 1 ? 's' : ''}
              </Badge>
              {report.averageScore !== null && (
                <Badge className={`text-xs ${report.averageScore >= 70 ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                  {Math.round(report.averageScore)}% average
                </Badge>
              )}
              <Badge className="text-xs">{report.completionRate}% complete</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
