import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  BookOpen,
  Users,
  Building2,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  Loader2,
  Pencil,
  Search,
  XCircle,
} from 'lucide-react';
import { apiRequest, queryClient, invalidateCourseScopeCaches } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import QuizAdminLayout from '@/components/QuizAdminLayout';

import { getDisplayName } from '@/lib/utils';
import { tzFormat } from '@/utils/timezoneRuntime';

type WizardStep = 'course' | 'type' | 'target' | 'due_date' | 'review';
type AssignmentType = 'user' | 'unit' | 'organization';

interface Course {
  id: string;
  title: string;
  description: string | null;
  status: string;
  thumbnailUrl: string | null;
  organizationId: string;
  organizationName?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
}

interface CourseAssignment {
  id: string;
  courseId: string;
  organizationId: string;
  assignedBy: string;
  userId: string | null;
  unitId: string | null;
  subUnitId: string | null;
  teamId: string | null;
  assignmentScope: string | null;
  audience: string;
  dueDate: string | null;
  mandatory: boolean;
  assignedAt: string;
  courseTitle: string | null;
  unitName: string | null;
  subUnitName: string | null;
  teamName: string | null;
  assignedByName: string | null;
}

export default function CourseAssignments() {
  const { toast } = useToast();
  const { isSuperAdmin, isOrgAdmin, isTeacher, effectiveOrganizationId } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const [location, setLocation] = useLocation();
  
  // Parse URL params reactively from wouter's location
  const urlParams = new URLSearchParams(location.includes('?') ? location.split('?')[1] : '');
  const preselectedCourseId = urlParams.get('courseId');
  const sourceContext = urlParams.get('source');
  const requestedView = urlParams.get('view');
  
  // Track if step 1 is locked (course preselected from builder)
  const [isCourseLocked, setIsCourseLocked] = useState(false);

  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
    unit: 'Department',
    unitPlural: 'Departments',
    subUnit: 'Unit',
    subUnitPlural: 'Units',
    team: 'Team',
    teamPlural: 'Teams',
  };

  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'publications' | 'assignments'>(
    requestedView === 'publications' ? 'publications' : 'assignments'
  );
  const [focusedCourseId, setFocusedCourseId] = useState<string | null>(preselectedCourseId);
  const [publicationSearch, setPublicationSearch] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [currentStep, setCurrentStep] = useState<WizardStep>('course');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('user');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedSubUnit, setSelectedSubUnit] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<CourseAssignment | null>(null);
  const [fromBuilder, setFromBuilder] = useState(false);
  const [builderCourseId, setBuilderCourseId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignmentToEdit, setAssignmentToEdit] = useState<CourseAssignment | null>(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editIsMandatory, setEditIsMandatory] = useState(true);
  const [editAssignmentType, setEditAssignmentType] = useState<AssignmentType>('user');
  const [editSelectedUsers, setEditSelectedUsers] = useState<string[]>([]);
  const [editSelectedUnit, setEditSelectedUnit] = useState<string>('');
  const [editSelectedSubUnit, setEditSelectedSubUnit] = useState<string>('');
  const [editSelectedTeam, setEditSelectedTeam] = useState<string>('');
  const [publicationDeleteDialogOpen, setPublicationDeleteDialogOpen] = useState(false);
  const [publicationToDelete, setPublicationToDelete] = useState<Course | null>(null);

  useEffect(() => {
    if (preselectedCourseId && !wizardOpen) {
      setFocusedCourseId(preselectedCourseId);
      if (requestedView === 'publications') {
        setActiveTab('publications');
        window.history.replaceState({}, '', '/course-assignments');
        return;
      }
      setSelectedCourse(preselectedCourseId);
      setCurrentStep('type');
      setWizardOpen(true);
      setIsCourseLocked(true);
      if (sourceContext === 'builder') {
        setFromBuilder(true);
        setBuilderCourseId(preselectedCourseId);
      }
      // Clear URL params after reading
      window.history.replaceState({}, '', '/course-assignments');
    }
  }, [preselectedCourseId, sourceContext, requestedView, wizardOpen]);

  const steps: WizardStep[] = ['course', 'type', 'target', 'due_date', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const isAdmin = isSuperAdmin || isOrgAdmin || isTeacher;

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery<CourseAssignment[]>({
    queryKey: ['/api/course-assignments'],
    enabled: isAdmin,
  });

  const { data: coursesData, isLoading: coursesLoading } = useQuery<{ courses: Course[] }>({
    queryKey: ['/api/courses', 'published-course-management', effectiveOrganizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('status', 'active');
      params.set('limit', '500');
      params.set('offset', '0');
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const response = await fetch(`/api/courses?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load courses');
      return response.json();
    },
    enabled: isAdmin,
  });

  const { data: usersData = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    enabled: (wizardOpen && assignmentType === 'user') || (editDialogOpen && editAssignmentType === 'user'),
  });

  const { data: unitsData = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/units', effectiveOrganizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const url = `/api/organization/units${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: wizardOpen || editDialogOpen,
  });

  const activeUnitId = editDialogOpen ? editSelectedUnit : selectedUnit;
  const { data: subUnitsData = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/sub-units', activeUnitId, effectiveOrganizationId],
    enabled: (wizardOpen && assignmentType === 'unit' && !!selectedUnit) || (editDialogOpen && !!editSelectedUnit),
    queryFn: async () => {
      if (!activeUnitId) return [];
      const params = new URLSearchParams();
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const response = await fetch(`/api/organization/sub-units/${activeUnitId}${params.toString() ? `?${params.toString()}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const activeSubUnitId = editDialogOpen ? editSelectedSubUnit : selectedSubUnit;
  const { data: teamsData = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/teams', activeSubUnitId],
    enabled: (wizardOpen && assignmentType === 'unit' && !!selectedSubUnit) || (editDialogOpen && !!editSelectedSubUnit),
    queryFn: async () => {
      if (!activeSubUnitId) return [];
      const response = await fetch(`/api/organization/teams/${activeSubUnitId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const { data: assignedByUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    enabled: !assignmentsLoading && !!assignmentsData?.length,
  });

  const courses = coursesData?.courses || [];
  const assignments = assignmentsData || [];
  const assignmentCountByCourse = assignments.reduce<Record<string, number>>((acc, assignment) => {
    acc[assignment.courseId] = (acc[assignment.courseId] || 0) + 1;
    return acc;
  }, {});
  const normalizedPublicationSearch = publicationSearch.trim().toLowerCase();
  const normalizedAssignmentSearch = assignmentSearch.trim().toLowerCase();
  const publishedCourses = courses
    .filter((course) => course.status === 'active')
    .filter((course) => !focusedCourseId || course.id === focusedCourseId)
    .filter((course) => {
      if (!normalizedPublicationSearch) return true;
      return [
        course.title,
        course.description || '',
        course.organizationName || '',
      ].some((value) => value.toLowerCase().includes(normalizedPublicationSearch));
    })
    .sort((a, b) => {
      const orgCompare = (a.organizationName || 'Current Organization').localeCompare(b.organizationName || 'Current Organization');
      if (orgCompare !== 0) return orgCompare;
      return a.title.localeCompare(b.title);
    });
  const publicationGroups = publishedCourses.reduce<Array<{ organizationId: string; organizationName: string; courses: Course[] }>>((groups, course) => {
    const organizationName = course.organizationName || 'Current Organization';
    const existing = groups.find((group) => group.organizationId === course.organizationId);
    if (existing) {
      existing.courses.push(course);
    } else {
      groups.push({ organizationId: course.organizationId, organizationName, courses: [course] });
    }
    return groups;
  }, []);
  const filteredAssignments = assignments.filter((assignment) => {
    if (focusedCourseId && assignment.courseId !== focusedCourseId) return false;
    if (!normalizedAssignmentSearch) return true;
    return [
      assignment.courseTitle || 'Deleted Course',
      assignment.unitName || '',
      assignment.subUnitName || '',
      assignment.teamName || '',
      assignment.assignedByName || '',
    ].some((value) => value.toLowerCase().includes(normalizedAssignmentSearch));
  });

  // subUnitsData is already filtered by unitId from the API
  const filteredSubUnits = subUnitsData;
  const filteredTeams = teamsData;
  const selectedDepartmentIds = selectedUnits.length > 0 ? selectedUnits : (selectedUnit ? [selectedUnit] : []);
  const canSelectNestedScope = selectedDepartmentIds.length === 1;

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      // Get the selected course to include its organizationId
      const courseData = courses.find((c) => c.id === selectedCourse);
      if (!courseData?.organizationId) {
        throw new Error('Course organization not found');
      }

      let dueDateISO: string | null = null;
      if (dueDate) {
        dueDateISO = dueTime
          ? new Date(`${dueDate}T${dueTime}`).toISOString()
          : new Date(`${dueDate}T23:59:59`).toISOString();
      }

      const payload: any = {
        courseId: selectedCourse,
        organizationId: courseData.organizationId,
        dueDate: dueDateISO,
        mandatory: isMandatory,
      };

      if (assignmentType === 'user' && selectedUsers.length > 0) {
        payload.assignmentScope = 'user';
        const results = await Promise.all(
          selectedUsers.map((userId) =>
            apiRequest('/api/course-assignments', {
              method: 'POST',
              body: JSON.stringify({ ...payload, userId }),
            })
          )
        );
        return results;
      } else if (assignmentType === 'unit') {
        if (selectedDepartmentIds.length > 1 && !selectedSubUnit && !selectedTeam) {
          payload.targets = selectedDepartmentIds.map((unitId) => ({
            unitId,
            assignmentScope: 'department',
          }));
          return apiRequest('/api/course-assignments', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }

        payload.unitId = selectedDepartmentIds[0];
        if (selectedSubUnit) {
          payload.subUnitId = selectedSubUnit;
          if (selectedTeam) {
            payload.teamId = selectedTeam;
            payload.assignmentScope = 'team';
          } else {
            payload.assignmentScope = 'unit';
          }
        } else {
          payload.assignmentScope = 'department';
        }
      } else {
        payload.assignmentScope = 'organization';
      }

      return apiRequest('/api/course-assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      const courseData = courses.find((c) => c.id === selectedCourse);
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      invalidateCourseScopeCaches({ 
        courseId: selectedCourse, 
        organizationId: courseData?.organizationId 
      });
      if (fromBuilder) {
        toast({ 
          title: 'Course published and assigned!',
          description: 'Your course is now available to the assigned learners.',
        });
      } else {
        toast({ title: 'Course assigned successfully!' });
      }
      handleCloseWizard();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to assign course',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/course-assignments/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      invalidateCourseScopeCaches({ 
        courseId: assignmentToDelete?.courseId,
        organizationId: assignmentToDelete?.organizationId
      });
      toast({ title: 'Assignment deleted successfully' });
      setDeleteDialogOpen(false);
      setAssignmentToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete assignment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const editAssignmentMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      dueDate: string | null; 
      mandatory: boolean;
      assignmentScope?: string;
      userId?: string | null;
      unitId?: string | null;
      subUnitId?: string | null;
      teamId?: string | null;
    }) => {
      return apiRequest(`/api/course-assignments/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dueDate: data.dueDate,
          mandatory: data.mandatory,
          assignmentScope: data.assignmentScope,
          userId: data.userId,
          unitId: data.unitId,
          subUnitId: data.subUnitId,
          teamId: data.teamId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      invalidateCourseScopeCaches({ 
        courseId: assignmentToEdit?.courseId,
        organizationId: assignmentToEdit?.organizationId
      });
      setEditDialogOpen(false);
      setAssignmentToEdit(null);
      toast({ title: 'Assignment updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update assignment', description: error.message, variant: 'destructive' });
    },
  });

  const unpublishCourseMutation = useMutation({
    mutationFn: async (course: Course) => {
      return apiRequest(`/api/courses/${course.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive', organizationId: course.organizationId }),
      });
    },
    onSuccess: (_, course) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      invalidateCourseScopeCaches({
        courseId: course.id,
        organizationId: course.organizationId,
      });
      setPublicationDeleteDialogOpen(false);
      setPublicationToDelete(null);
      toast({
        title: 'Publication unpublished',
        description: 'The course is no longer active. Existing assignment rows remain available for granular cleanup.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to unpublish course',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const handleCloseWizard = () => {
    const shouldNavigateBack = fromBuilder && builderCourseId;
    const courseIdToNavigate = builderCourseId;
    setWizardOpen(false);
    setCurrentStep('course');
    setSelectedCourse('');
    setAssignmentType('user');
    setSelectedUsers([]);
    setSelectedUnits([]);
    setSelectedUnit('');
    setSelectedSubUnit('');
    setSelectedTeam('');
    setDueDate('');
    setDueTime('');
    setIsMandatory(true);
    setIsCourseLocked(false);
    if (shouldNavigateBack) {
      setFromBuilder(false);
      setBuilderCourseId(null);
      setLocation(`/course-builder/${courseIdToNavigate}/lessons`);
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    // Always allow going back to step 1, even when locked (shows locked state)
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'course':
        return !!selectedCourse;
      case 'type':
        return !!assignmentType;
      case 'target':
        if (assignmentType === 'user') return selectedUsers.length > 0;
        if (assignmentType === 'unit') return selectedDepartmentIds.length > 0;
        return true;
      case 'due_date':
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleUnitSelection = (unitId: string) => {
    const next = selectedUnits.includes(unitId)
      ? selectedUnits.filter((id) => id !== unitId)
      : [...selectedUnits, unitId];
    setSelectedUnits(next);
    setSelectedUnit(next.length === 1 ? next[0] : '');
    setSelectedSubUnit('');
    setSelectedTeam('');
  };

  useEffect(() => {
    setSelectedUsers([]);
    setSelectedUnits([]);
    setSelectedUnit('');
    setSelectedSubUnit('');
    setSelectedTeam('');
  }, [assignmentType]);

  const getAssigneeDisplay = (assignment: CourseAssignment) => {
    if (assignment.userId) {
      const user = assignedByUsers.find((u: any) => u.id === assignment.userId);
      return user ? getDisplayName(user) : 'Unknown User';
    }
    if (assignment.unitId) {
      const unitName = assignment.unitName || terminology.unit;
      if (assignment.subUnitId) {
        const subUnitName = assignment.subUnitName || terminology.subUnit;
        if (assignment.teamId && assignment.teamName) {
          return `${unitName} → ${subUnitName} → ${assignment.teamName}`;
        }
        return `${unitName} → ${subUnitName}`;
      }
      return unitName;
    }
    return 'Entire Organization';
  };

  const getAssignedByName = (assignment: CourseAssignment) => {
    return assignment.assignedByName || 'Unknown';
  };

  const getCourseTitle = (assignment: CourseAssignment) => {
    return assignment.courseTitle || 'Deleted Course';
  };

  const selectedCourseData = courses.find((c) => c.id === selectedCourse);

  if (!isAdmin) {
    return (
      <QuizAdminLayout title="Course Assignments" description="Manage course assignments">
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-muted-foreground">
            You don't have permission to access this page.
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  const openEditAssignment = (assignment: CourseAssignment) => {
    setAssignmentToEdit(assignment);
    setEditDueDate(assignment.dueDate ? tzFormat(assignment.dueDate, 'yyyy-MM-dd') : '');
    setEditDueTime(assignment.dueDate ? tzFormat(assignment.dueDate, 'HH:mm') : '');
    setEditIsMandatory(assignment.mandatory);
    if (assignment.userId) {
      setEditAssignmentType('user');
      setEditSelectedUsers([assignment.userId]);
      setEditSelectedUnit('');
      setEditSelectedSubUnit('');
      setEditSelectedTeam('');
    } else if (assignment.unitId) {
      setEditAssignmentType('unit');
      setEditSelectedUsers([]);
      setEditSelectedUnit(assignment.unitId);
      setEditSelectedSubUnit(assignment.subUnitId || '');
      setEditSelectedTeam(assignment.teamId || '');
    } else {
      setEditAssignmentType('organization');
      setEditSelectedUsers([]);
      setEditSelectedUnit('');
      setEditSelectedSubUnit('');
      setEditSelectedTeam('');
    }
    setEditDialogOpen(true);
  };

  const openAssignmentWizardForCourse = (courseId?: string) => {
    if (courseId) {
      setSelectedCourse(courseId);
      setIsCourseLocked(true);
      setCurrentStep('type');
    } else {
      setSelectedCourse('');
      setIsCourseLocked(false);
      setCurrentStep('course');
    }
    setFromBuilder(false);
    setBuilderCourseId(null);
    setWizardOpen(true);
  };

  return (
    <QuizAdminLayout title="Publications & Assignments" description="Manage published courses and their publication scopes" activeSection="courses">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Publications & Assignments</h1>
            <p className="text-muted-foreground">Publish, unpublish, filter, and edit course access scopes.</p>
          </div>
          <Button onClick={() => openAssignmentWizardForCourse(focusedCourseId || undefined)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Publication Scope
          </Button>
        </div>

        {focusedCourseId && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">Filtered to one course</span>
            <Button variant="ghost" size="sm" onClick={() => setFocusedCourseId(null)}>
              <XCircle className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'publications' | 'assignments')} className="space-y-4">
          <TabsList>
            <TabsTrigger value="publications" data-testid="tab-publications">Published Courses</TabsTrigger>
            <TabsTrigger value="assignments" data-testid="tab-assignments">Current Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="publications" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={publicationSearch}
                onChange={(event) => setPublicationSearch(event.target.value)}
                placeholder="Filter published courses..."
                className="pl-9 min-h-[44px]"
              />
            </div>

            {coursesLoading ? (
              <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
            ) : publicationGroups.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No published courses found.</p>
                </CardContent>
              </Card>
            ) : (
              publicationGroups.map((group) => (
                <div key={group.organizationId} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">{group.organizationName}</h2>
                    <Badge variant="outline">{group.courses.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {group.courses.map((course) => (
                      <Card key={course.id} className="bg-card border-border">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">{course.title}</CardTitle>
                              <CardDescription className="line-clamp-2">
                                {course.description || 'No description'}
                              </CardDescription>
                            </div>
                            <Badge variant="success">Published</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-sm text-muted-foreground">
                            {assignmentCountByCourse[course.id] || 0} publication scope{assignmentCountByCourse[course.id] === 1 ? '' : 's'}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => {
                              setFocusedCourseId(course.id);
                              setActiveTab('assignments');
                            }}>
                              Manage Scopes
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openAssignmentWizardForCourse(course.id)}>
                              <Plus className="h-4 w-4 mr-1" />
                              Publish Scope
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => {
                              setPublicationToDelete(course);
                              setPublicationDeleteDialogOpen(true);
                            }}>
                              <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                              Delete Publication
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={assignmentSearch}
                onChange={(event) => setAssignmentSearch(event.target.value)}
                placeholder="Filter assignments by course, assignee, or publisher..."
                className="pl-9 min-h-[44px]"
              />
            </div>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Current Assignments</CardTitle>
                <CardDescription>Each row is one granular publication scope.</CardDescription>
              </CardHeader>
              <CardContent>
                {assignmentsLoading ? (
                  <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : filteredAssignments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No course assignments found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Course</TableHead>
                          <TableHead>Published To</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Published By</TableHead>
                          <TableHead>Published At</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAssignments.map((assignment) => (
                          <TableRow key={assignment.id}>
                            <TableCell className="font-medium">{getCourseTitle(assignment)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {assignment.userId ? <User className="h-4 w-4 text-muted-foreground" /> : assignment.unitId ? <Users className="h-4 w-4 text-muted-foreground" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
                                {getAssigneeDisplay(assignment)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={assignment.mandatory ? "default" : "secondary"}>
                                {assignment.mandatory ? 'Mandatory' : 'Optional'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {assignment.dueDate ? (
                                <Badge variant="outline" className="gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {tzFormat(assignment.dueDate, 'MMM d, yyyy')}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">No due date</span>
                              )}
                            </TableCell>
                            <TableCell>{getAssignedByName(assignment)}</TableCell>
                            <TableCell className="text-muted-foreground">{tzFormat(assignment.assignedAt, 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditAssignment(assignment)}>
                                  <Pencil className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => {
                                  setAssignmentToDelete(assignment);
                                  setDeleteDialogOpen(true);
                                }}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {wizardOpen && (
        <Card className="bg-card border-border text-foreground w-[min(95vw,48rem)] max-h-[85vh] flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BookOpen className="h-5 w-5 text-primary" />
              Assign Course
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Step {currentStepIndex + 1} of {steps.length}:{' '}
              {currentStep === 'course'
                ? 'Select Course'
                : currentStep === 'type'
                ? 'Choose Assignment Type'
                : currentStep === 'target'
                ? 'Select Target'
                : currentStep === 'due_date'
                ? 'Set Due Date'
                : 'Review & Confirm'}
            </CardDescription>
          </CardHeader>

          <Progress value={progress} className="h-2" />

          <div className="py-4 sm:py-6 min-h-[250px] sm:min-h-[300px] flex-1 overflow-auto">
            {currentStep === 'course' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Select Course</h3>
                    <p className="text-sm text-muted-foreground">
                      {isCourseLocked 
                        ? 'This course was selected from the course builder and cannot be changed.'
                        : 'Choose a course to assign'}
                    </p>
                  </div>
                </div>

                {coursesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : courses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active courses available to assign.
                  </div>
                ) : isCourseLocked && selectedCourseData ? (
                  // Show only the locked/selected course when locked
                  <Card className="bg-primary/20 border-primary">
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <CardTitle className="text-foreground text-base">{selectedCourseData.title}</CardTitle>
                          <CardDescription className="text-muted-foreground text-sm line-clamp-2">
                            {selectedCourseData.description || 'No description'}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-xs">Locked</Badge>
                          <Check className="h-5 w-5 text-primary" />
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3 pr-4">
                      {courses.map((course) => (
                        <Card
                          key={course.id}
                          className={`cursor-pointer transition-all ${
                            selectedCourse === course.id
                              ? 'bg-primary/20 border-primary'
                              : 'bg-muted/50 border-border hover:border-muted-foreground'
                          }`}
                          onClick={() => setSelectedCourse(course.id)}
                        >
                          <CardHeader className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <CardTitle className="text-foreground text-base">{course.title}</CardTitle>
                                <CardDescription className="text-muted-foreground text-sm line-clamp-2">
                                  {course.description || 'No description'}
                                </CardDescription>
                              </div>
                              {selectedCourse === course.id && (
                                <Check className="h-5 w-5 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {currentStep === 'type' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Assignment Type</h3>
                    <p className="text-sm text-muted-foreground">Who should this course be assigned to?</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <Card
                    className={`cursor-pointer transition-all ${
                      assignmentType === 'user'
                        ? 'bg-primary/20 border-primary'
                        : 'bg-muted/50 border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => setAssignmentType('user')}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <CardTitle className="text-base">Specific Users</CardTitle>
                          <CardDescription>Assign to individual users</CardDescription>
                        </div>
                        {assignmentType === 'user' && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    </CardHeader>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all ${
                      assignmentType === 'unit'
                        ? 'bg-primary/20 border-primary'
                        : 'bg-muted/50 border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => setAssignmentType('unit')}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <CardTitle className="text-base">{terminology.unit} / {terminology.subUnit}</CardTitle>
                          <CardDescription>
                            Assign to all members of a {terminology.unit.toLowerCase()} or {terminology.subUnit.toLowerCase()}
                          </CardDescription>
                        </div>
                        {assignmentType === 'unit' && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    </CardHeader>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all ${
                      assignmentType === 'organization'
                        ? 'bg-primary/20 border-primary'
                        : 'bg-muted/50 border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => setAssignmentType('organization')}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <CardTitle className="text-base">Entire Organization</CardTitle>
                          <CardDescription>Assign to everyone in the organization</CardDescription>
                        </div>
                        {assignmentType === 'organization' && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            )}

            {currentStep === 'target' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    {assignmentType === 'user' ? (
                      <User className="h-4 w-4 text-primary-foreground" />
                    ) : (
                      <Users className="h-4 w-4 text-primary-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {assignmentType === 'user'
                        ? 'Select Users'
                        : assignmentType === 'unit'
                        ? `Select ${terminology.unit}`
                        : 'Confirm Organization'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {assignmentType === 'user'
                        ? 'Choose which users should receive this course'
                        : assignmentType === 'unit'
                        ? `Select the ${terminology.unit.toLowerCase()} to assign this course to`
                        : 'The course will be assigned to all organization members'}
                    </p>
                  </div>
                </div>

                {assignmentType === 'user' && (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2 pr-4">
                      {usersData.map((user: any) => (
                        <div
                          key={user.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                            selectedUsers.includes(user.id)
                              ? 'bg-primary/20 border border-primary'
                              : 'bg-muted/50 border border-border hover:border-muted-foreground'
                          }`}
                          onClick={() => toggleUserSelection(user.id)}
                        >
                          <Checkbox
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-foreground">{getDisplayName(user)}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                          {selectedUsers.includes(user.id) && <Check className="h-5 w-5 text-primary" />}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {assignmentType === 'unit' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{terminology.unitPlural || terminology.unit}</Label>
                      <ScrollArea className="max-h-[220px] rounded-lg border border-border bg-muted/30">
                        <div className="space-y-2 p-3">
                          {unitsData.map((unit: any) => (
                            <button
                              key={unit.id}
                              type="button"
                              className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                                selectedDepartmentIds.includes(unit.id)
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border bg-card hover:bg-muted/60'
                              }`}
                              onClick={() => toggleUnitSelection(unit.id)}
                            >
                              <Checkbox
                                checked={selectedDepartmentIds.includes(unit.id)}
                                onCheckedChange={() => toggleUnitSelection(unit.id)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <span className="flex-1 text-sm font-medium text-foreground">{unit.name}</span>
                              {selectedDepartmentIds.includes(unit.id) && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                      {selectedDepartmentIds.length > 0 && (
                        <p className="text-sm text-primary">
                          {selectedDepartmentIds.length} {terminology.unit?.toLowerCase() || 'department'}{selectedDepartmentIds.length > 1 ? 's' : ''} selected
                        </p>
                      )}
                    </div>

                    {canSelectNestedScope && selectedUnit && filteredSubUnits.length > 0 && (
                      <div className="space-y-2">
                        <Label>{terminology.subUnit} (Optional)</Label>
                        <Select 
                          value={selectedSubUnit || 'all'} 
                          onValueChange={(v) => {
                            setSelectedSubUnit(v === 'all' ? '' : v);
                            setSelectedTeam('');
                          }}
                        >
                          <SelectTrigger className="bg-muted border-border">
                            <SelectValue placeholder={`All ${terminology.subUnitPlural.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All {terminology.subUnitPlural.toLowerCase()}</SelectItem>
                            {filteredSubUnits.map((subUnit: any) => (
                              <SelectItem key={subUnit.id} value={subUnit.id}>
                                {subUnit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {canSelectNestedScope && selectedSubUnit && filteredTeams.length > 0 && (
                      <div className="space-y-2">
                        <Label>{terminology.team} (Optional)</Label>
                        <Select value={selectedTeam || 'all'} onValueChange={(v) => setSelectedTeam(v === 'all' ? '' : v)}>
                          <SelectTrigger className="bg-muted border-border">
                            <SelectValue placeholder={`All ${terminology.teamPlural.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All {terminology.teamPlural.toLowerCase()}</SelectItem>
                            {filteredTeams.map((team: any) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {!canSelectNestedScope && selectedDepartmentIds.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Optional {terminology.subUnit?.toLowerCase() || 'unit'} and {terminology.team?.toLowerCase() || 'team'} targeting is available when one {terminology.unit?.toLowerCase() || 'department'} is selected.
                      </p>
                    )}
                  </div>
                )}

                {assignmentType === 'organization' && (
                  <div className="bg-muted/50 border border-border rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Organization-Wide Assignment</p>
                        <p className="text-sm text-muted-foreground">
                          All current and future members of the organization will have access to this course.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {assignmentType === 'user' && selectedUsers.length > 0 && (
                  <div className="pt-2 text-sm text-primary">
                    {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}

            {currentStep === 'due_date' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Due Date (Optional)</h3>
                    <p className="text-sm text-muted-foreground">Set a deadline for course completion</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time (Optional)</Label>
                    <Input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="bg-muted border-border"
                    />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mt-4">
                  Leave empty if there's no specific deadline for this course.
                </p>

                <div className="border-t border-border pt-4 mt-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="mandatory"
                      checked={isMandatory}
                      onCheckedChange={(checked) => setIsMandatory(checked === true)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="mandatory"
                        className="text-sm font-medium text-foreground cursor-pointer"
                      >
                        This is a mandatory course
                      </label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {terminology.learnerPlural} must complete this course
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'review' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Review & Confirm</h3>
                    <p className="text-sm text-muted-foreground">Review assignment details before confirming</p>
                  </div>
                </div>

                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Course:</span>
                    <span className="font-medium text-foreground text-right">{selectedCourseData?.title}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Assignment Type:</span>
                    <span className="font-medium text-foreground">
                      {assignmentType === 'user'
                        ? 'Specific Users'
                        : assignmentType === 'unit'
                        ? `${terminology.unit}/${terminology.subUnit}`
                        : 'Entire Organization'}
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Assigned To:</span>
                    <span className="font-medium text-foreground text-right">
                      {assignmentType === 'user'
                        ? `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''}`
                        : assignmentType === 'unit'
                        ? (() => {
                            if (selectedDepartmentIds.length > 1) {
                              return `${selectedDepartmentIds.length} ${terminology.unitPlural?.toLowerCase() || 'departments'}`;
                            }
                            let display = unitsData.find((u: any) => u.id === selectedDepartmentIds[0])?.name || '';
                            if (selectedSubUnit) {
                              display += ` → ${filteredSubUnits.find((s: any) => s.id === selectedSubUnit)?.name || ''}`;
                              if (selectedTeam) {
                                display += ` → ${filteredTeams.find((t: any) => t.id === selectedTeam)?.name || ''}`;
                              }
                            }
                            return display;
                          })()
                        : 'All organization members'}
                    </span>
                  </div>
                  {dueDate && (
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground">Due Date:</span>
                      <span className="font-medium text-foreground">
                        {tzFormat(`${dueDate}T${dueTime || '23:59'}`, 'PPP p')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Course Status:</span>
                    <span className="font-medium text-foreground">
                      <Badge variant={isMandatory ? "default" : "secondary"}>
                        {isMandatory ? 'Mandatory' : 'Optional'}
                      </Badge>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-row justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={currentStepIndex === 0 ? handleCloseWizard : handleBack} disabled={createAssignmentMutation.isPending} >
              {currentStepIndex === 0 ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {currentStep === 'review' ? (
              <Button onClick={() => createAssignmentMutation.mutate()}
                disabled={createAssignmentMutation.isPending}
              >
                {createAssignmentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Confirm Assignment
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </Card>
      )}

      {deleteDialogOpen && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle>Delete Assignment</CardTitle>
            <CardDescription>
              Are you sure you want to delete this course assignment? This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => assignmentToDelete && deleteAssignmentMutation.mutate(assignmentToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </CardContent>
        </Card>
      )}

      {publicationDeleteDialogOpen && publicationToDelete && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle>Delete Publication</CardTitle>
            <CardDescription>
              This will unpublish "{publicationToDelete.title}" by moving it to inactive. Individual assignment scopes will remain listed so you can delete only the ones you no longer want.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPublicationDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => unpublishCourseMutation.mutate(publicationToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={unpublishCourseMutation.isPending}
            >
              {unpublishCourseMutation.isPending ? 'Unpublishing...' : 'Unpublish Course'}
            </Button>
          </CardContent>
        </Card>
      )}

      {editDialogOpen && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Edit Assignment</CardTitle>
            <CardDescription>
              Modify the due date and mandatory status for this assignment.
            </CardDescription>
          </CardHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Course</Label>
              <div className="text-sm text-muted-foreground">{assignmentToEdit?.courseTitle || 'Unknown Course'}</div>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="time"
                  value={editDueTime}
                  onChange={(e) => setEditDueTime(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-mandatory"
                checked={editIsMandatory}
                onCheckedChange={(checked) => setEditIsMandatory(!!checked)}
              />
              <Label htmlFor="edit-mandatory">Mandatory assignment</Label>
            </div>
            <div className="space-y-2">
              <Label>Assignment Target</Label>
              <Select value={editAssignmentType} onValueChange={(v: AssignmentType) => {
                setEditAssignmentType(v);
                setEditSelectedUsers([]);
                setEditSelectedUnit('');
                setEditSelectedSubUnit('');
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Specific User</SelectItem>
                  <SelectItem value="unit">{terminology.unit}</SelectItem>
                  <SelectItem value="organization">Entire Organization</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editAssignmentType === 'user' && (
              <div className="space-y-2">
                <Label>Select User</Label>
                <Select 
                  value={editSelectedUsers[0] || ''} 
                  onValueChange={(v) => setEditSelectedUsers(v ? [v] : [])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersData.map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {getDisplayName(user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editAssignmentType === 'unit' && (
              <>
                <div className="space-y-2">
                  <Label>Select {terminology.unit}</Label>
                  <Select 
                    value={editSelectedUnit} 
                    onValueChange={(v) => {
                      setEditSelectedUnit(v);
                      setEditSelectedSubUnit('');
                      setEditSelectedTeam('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${terminology.unit}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {unitsData.map((unit: any) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editSelectedUnit && (
                  <div className="space-y-2">
                    <Label>Select {terminology.subUnit} (optional)</Label>
                    <Select 
                      value={editSelectedSubUnit || 'all'} 
                      onValueChange={(v) => {
                        setEditSelectedSubUnit(v === 'all' ? '' : v);
                        setEditSelectedTeam('');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`All ${terminology.subUnitPlural}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {terminology.subUnitPlural}</SelectItem>
                        {subUnitsData?.map((subUnit: any) => (
                          <SelectItem key={subUnit.id} value={subUnit.id}>
                            {subUnit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {editSelectedSubUnit && teamsData.length > 0 && (
                  <div className="space-y-2">
                    <Label>Select {terminology.team} (optional)</Label>
                    <Select 
                      value={editSelectedTeam || 'all'} 
                      onValueChange={(v) => setEditSelectedTeam(v === 'all' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`All ${terminology.teamPlural}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {terminology.teamPlural}</SelectItem>
                        {teamsData.map((team: any) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
          <CardContent className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
                if (!assignmentToEdit) return;
                let dueDateISO: string | null = null;
                if (editDueDate) {
                  dueDateISO = editDueTime
                    ? new Date(`${editDueDate}T${editDueTime}`).toISOString()
                    : new Date(`${editDueDate}T23:59:59`).toISOString();
                }
                
                let userId: string | null = null;
                let unitId: string | null = null;
                let subUnitId: string | null = null;
                let teamId: string | null = null;
                let assignmentScope = 'organization';
                
                if (editAssignmentType === 'user' && editSelectedUsers.length > 0) {
                  userId = editSelectedUsers[0];
                  assignmentScope = 'user';
                } else if (editAssignmentType === 'unit' && editSelectedUnit) {
                  unitId = editSelectedUnit;
                  subUnitId = editSelectedSubUnit || null;
                  teamId = editSelectedTeam || null;
                  assignmentScope = teamId ? 'team' : subUnitId ? 'unit' : 'department';
                }
                
                editAssignmentMutation.mutate({
                  id: assignmentToEdit.id,
                  dueDate: dueDateISO,
                  mandatory: editIsMandatory,
                  assignmentScope,
                  userId,
                  unitId,
                  subUnitId,
                  teamId,
                });
              }}
              disabled={editAssignmentMutation.isPending}
            >
              {editAssignmentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      )}
    </QuizAdminLayout>
  );
}
