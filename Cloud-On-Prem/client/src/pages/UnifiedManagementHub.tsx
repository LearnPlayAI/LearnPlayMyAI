import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { 
  Building2, 
  GraduationCap, 
  Users, 
  FileQuestion, 
  Plus,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Layers,
  Edit,
  Trash2,
  RefreshCw,
  Lock,
  Unlock,
  KeyRound,
  Shield,
  Clock,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getDisplayName } from '@/lib/utils';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { AssignmentWizard } from '@/components/AssignmentWizard';
import { LessonAssignmentWizard } from '@/components/LessonAssignmentWizard';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { getLowercaseTerminology, getTerminology } from '@/utils/terminology';

export default function UnifiedManagementHub() {
  const { toast } = useToast();
  const { isSuperAdmin, user, effectiveOrganizationId } = useAuth();
  const [, setLocation] = useLocation();
  
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const terminologyResolved = terminology ?? getTerminology('business');
  const terminologyLowerResolved = terminologyLower ?? getLowercaseTerminology('business');
  const hasInitializedTerminology = useRef(false);
  
  // Compute dynamic default values based on terminology with safe fallbacks
  const allUnitsKey = useMemo(() => 
    terminologyLower?.unitPlural ? `all-${terminologyLowerResolved.unitPlural}` : 'all-units', 
    [terminologyLower?.unitPlural]
  );
  const allSubUnitsKey = useMemo(() => 
    terminologyLower?.subUnitPlural ? `all-${terminologyLowerResolved.subUnitPlural}` : 'all-subunits', 
    [terminologyLower?.subUnitPlural]
  );
  const allSubjectsKey = useMemo(() => 
    terminologyLower?.subjectPlural ? `all-${terminologyLowerResolved.subjectPlural}` : 'all-subjects', 
    [terminologyLower?.subjectPlural]
  );
  
  // Fetch organizations first to compute initial selectedOrg synchronously
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
  });
  
  // Compute initial organization ID synchronously to prevent queries from firing without org context
  const initialOrgId = useMemo(() => {
    // Prefer effective organization from context (handles multi-org users correctly)
    if (effectiveOrganizationId) {
      return effectiveOrganizationId;
    }
    if (!isSuperAdmin && user && (user as any).organizationId) {
      return (user as any).organizationId;
    }
    if (organizations.length > 0) {
      return organizations[0].id;
    }
    return '';
  }, [effectiveOrganizationId, isSuperAdmin, user, organizations]);
  
  // Context state - initialize with computed org ID to prevent race condition
  const [selectedOrg, setSelectedOrg] = useState(initialOrgId);
  const [selectedUnit, setSelectedUnit] = useState(allUnitsKey);
  const [selectedSubUnit, setSelectedSubUnit] = useState(allSubUnitsKey);
  const [selectedSubject, setSelectedSubject] = useState(allSubjectsKey);
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('students');

  // Sync state with dynamic keys only on initial terminology resolution
  useEffect(() => {
    if (isResolved && terminology && terminologyLower && !hasInitializedTerminology.current) {
      // Update state to use resolved terminology keys (only once)
      setSelectedUnit(allUnitsKey);
      setSelectedSubUnit(allSubUnitsKey);
      setSelectedSubject(allSubjectsKey);
      hasInitializedTerminology.current = true;
    }
  }, [isResolved, terminology, terminologyLower, allUnitsKey, allSubUnitsKey, allSubjectsKey]);
  
  // Pagination state for quizzes
  const [quizPage, setQuizPage] = useState(1);
  const quizPageSize = 10;
  
  // Pagination state for students
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 20;
  
  // Dialog states
  const [assignStudentDialog, setAssignStudentDialog] = useState(false);
  const [assignQuizDialog, setAssignQuizDialog] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Subject management states
  const [createSubjectDialog, setCreateSubjectDialog] = useState(false);
  const [editSubjectDialog, setEditSubjectDialog] = useState(false);
  const [assignSubjectDialog, setAssignSubjectDialog] = useState(false);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectDescription, setSubjectDescription] = useState('');
  const [subjectToAssign, setSubjectToAssign] = useState('');
  const [assignToUnit, setAssignToUnit] = useState('');
  const [subjectAssignUnit, setSubjectAssignUnit] = useState('');
  
  // Grade assignment states
  const [assignToGradeDialog, setAssignToGradeDialog] = useState(false);
  const [selectedStudentForGrade, setSelectedStudentForGrade] = useState('');
  const [assignGradeUnit, setAssignGradeUnit] = useState('');
  const [assignGradeSubUnit, setAssignGradeSubUnit] = useState('');
  
  // Bulk assignment states
  const [bulkGradeSelection, setBulkGradeSelection] = useState('');
  const [bulkClassSelection, setBulkClassSelection] = useState('');
  const [bulkSubjectAction, setBulkSubjectAction] = useState(''); // 'assign' or 'remove'
  const [bulkSubjectSelections, setBulkSubjectSelections] = useState<string[]>([]);
  
  // Quiz collection states
  const [createQuizDialog, setCreateQuizDialog] = useState(false);
  const [editQuizDialog, setEditQuizDialog] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<any>(null);
  const [quizName, setQuizName] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizSubject, setQuizSubject] = useState('');
  const [quizUnit, setQuizUnit] = useState('');
  const [quizIsPublic, setQuizIsPublic] = useState(false);
  const [quizIsActive, setQuizIsActive] = useState(true);
  const [quizPassPercentage, setQuizPassPercentage] = useState(70);
  
  // User management states
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [rolesDialog, setRolesDialog] = useState(false);
  const [selectedUserForActions, setSelectedUserForActions] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [organizationRoles, setOrganizationRoles] = useState<{[key: string]: string[]}>({});

  // Assignment availability states
  const [availabilityDialog, setAvailabilityDialog] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [availableFromDate, setAvailableFromDate] = useState('');
  const [availableFromTime, setAvailableFromTime] = useState('');
  const [availableToDate, setAvailableToDate] = useState('');
  const [availableToTime, setAvailableToTime] = useState('');

  // Assignment wizard state
  const [assignmentWizardOpen, setAssignmentWizardOpen] = useState(false);
  
  // Lesson assignment state
  const [assignmentContentType, setAssignmentContentType] = useState<'quizzes' | 'lessons'>('quizzes');
  const [lessonAssignDialog, setLessonAssignDialog] = useState(false);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);

  // Student subject management states
  const [manageSubjectsDialog, setManageSubjectsDialog] = useState(false);
  const [selectedStudentForSubjects, setSelectedStudentForSubjects] = useState<any>(null);
  const [studentSubjectAssignments, setStudentSubjectAssignments] = useState<string[]>([]);

  // Sync selectedOrg with initialOrgId when it changes
  useEffect(() => {
    if (initialOrgId && initialOrgId !== selectedOrg) {
      setSelectedOrg(initialOrgId);
    }
  }, [initialOrgId]);
  
  // Reset quiz page when organization changes
  useEffect(() => {
    setQuizPage(1);
    setStudentPage(1);
  }, [selectedOrg]);

  // Fetch units for selected org
  const { data: units = [], refetch: refetchUnits } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'units'],
    enabled: !!selectedOrg,
  });

  // Fetch sub-units for selected org
  const { data: subUnits = [], refetch: refetchSubUnits } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'],
    enabled: !!selectedOrg,
  });

  // Fetch subjects for selected org
  const { data: subjectsRaw = [], refetch: refetchSubjects } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'subjects'],
    enabled: !!selectedOrg,
  });

  // Deduplicate subjects by ID to prevent duplicate React keys
  const subjects = useMemo(() => {
    // Check for duplicates in raw data
    const idCounts = new Map<string, number>();
    subjectsRaw.forEach((subject: any) => {
      idCounts.set(subject.id, (idCounts.get(subject.id) || 0) + 1);
    });
    const duplicates = Array.from(idCounts.entries()).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.warn('[UnifiedManagementHub] Duplicate subject IDs in API response:', duplicates.map(([id, count]) => `${id} (${count}x)`));
    }
    
    const subjectMap = new Map();
    subjectsRaw.forEach((subject: any) => {
      if (!subjectMap.has(subject.id)) {
        subjectMap.set(subject.id, subject);
      }
    });
    return Array.from(subjectMap.values());
  }, [subjectsRaw]);

  // Fetch all learners in organization (students for education orgs, employees for business orgs)
  const { data: students = [], refetch: refetchStudents } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'],
    queryFn: async () => {
      if (!selectedOrg) return [];
      // Fetch all users and filter to learner roles (student or employee)
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/users`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch learners');
      const allUsers = await response.json();
      // Filter to learner roles (learner is the actual role name, student/employee are legacy)
      return allUsers.filter((user: any) => 
        user.organizationRoles && 
        user.organizationRoles.some((role: any) => 
          role.role === 'learner' || role.role === 'student' || role.role === 'employee'
        )
      );
    },
    enabled: !!selectedOrg,
  });

  // Fetch all admin users in organization (org_admin, teacher, team_lead)
  const { data: adminUsers = [], refetch: refetchAdminUsers } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'admin-users'],
    queryFn: async () => {
      if (!selectedOrg) return [];
      // Fetch all users with roles in this organization
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/users`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch admin users');
      const allUsers = await response.json();
      // Filter to only admin roles (not students)
      return allUsers.filter((user: any) => 
        user.organizationRoles && 
        user.organizationRoles.some((role: any) => 
          role.role === 'org_admin' || role.role === 'teacher' || role.role === 'team_lead'
        )
      );
    },
    enabled: !!selectedOrg,
  });

  // Fetch all quizzes in organization with pagination (for Quizzes tab)
  const { data: quizData, refetch: refetchQuizzes } = useQuery<{ quizzes: any[], totalCount: number, page: number, pageSize: number }>({
    queryKey: ['/api/admin/quiz-collections', selectedOrg, quizPage, quizPageSize],
    queryFn: async () => {
      if (!selectedOrg) return { quizzes: [], totalCount: 0, page: quizPage, pageSize: quizPageSize };
      const response = await fetch(`/api/admin/quiz-collections?organizationId=${selectedOrg}&page=${quizPage}&pageSize=${quizPageSize}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch quizzes');
      return response.json();
    },
    enabled: !!selectedOrg,
  });
  
  const quizzes = quizData?.quizzes || [];
  const totalQuizPages = quizData ? Math.ceil(quizData.totalCount / quizPageSize) : 0;

  // Fetch ALL quizzes (without pagination) for assignment display
  const { data: allQuizzes = [], isLoading: isLoadingAllQuizzes } = useQuery<any[]>({
    queryKey: ['/api/admin/quiz-collections-all', selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return [];
      // Use a very large pageSize to get all quizzes in one request
      const response = await fetch(`/api/admin/quiz-collections?organizationId=${selectedOrg}&page=1&pageSize=10000`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch all quizzes');
      const data = await response.json();
      // If response has pagination structure, extract quizzes array, otherwise use response directly
      return data.quizzes || data;
    },
    enabled: !!selectedOrg,
  });
  
  // Clamp quiz page when total pages decreases (e.g., after deletion)
  useEffect(() => {
    if (totalQuizPages > 0 && quizPage > totalQuizPages) {
      setQuizPage(totalQuizPages);
    } else if (totalQuizPages === 0 && quizPage !== 1) {
      setQuizPage(1);
    }
  }, [totalQuizPages, quizPage]);

  // Fetch quiz assignments
  const { data: quizAssignments = [], refetch: refetchQuizAssignments } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/quiz-assignments`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch assignments');
      return response.json();
    },
    enabled: !!selectedOrg,
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: 'always',
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  // Fetch student grade assignments
  const { data: studentAssignments = [], refetch: refetchStudentAssignments } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/assignments`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch student assignments');
      return response.json();
    },
    enabled: !!selectedOrg,
  });

  // Fetch lessons for assignment (exclude archived)
  const { data: lessons = [] } = useQuery<any[]>({
    queryKey: ['/api/lessons', selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const response = await fetch(`/api/lessons?organizationId=${selectedOrg}&isArchived=false`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch lessons');
      const data = await response.json();
      // API returns { lessons: [...], total: ... }, extract just the lessons array
      return data.lessons || [];
    },
    enabled: !!selectedOrg,
  });

  // Fetch lesson assignments (teacher/admin view - all assignments in organization)
  const { data: lessonAssignments = [], refetch: refetchLessonAssignments } = useQuery<any[]>({
    queryKey: ['/api/admin/lesson-assignments', selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const response = await fetch(`/api/admin/lesson-assignments?organizationId=${selectedOrg}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch lesson assignments');
      return response.json();
    },
    enabled: !!selectedOrg,
  });

  // Fetch unit-subject assignments
  const { data: unitSubjectAssignments = [], refetch: refetchUnitSubjects } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'unit-subjects'],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/unit-subjects`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch unit-subject assignments');
      return response.json();
    },
    enabled: !!selectedOrg,
  });

  // Fetch all student subject assignments (BATCHED - single query for all students)
  const { data: allStudentSubjectAssignments = {}, refetch: refetchAllStudentSubjectAssignments } = useQuery<Record<string, string[]>>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'subject-assignments'],
    queryFn: async () => {
      if (!selectedOrg) return {};
      
      // Fetch ALL subject assignments for the organization in ONE query
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/subject-assignments`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.error('Failed to fetch organization subject assignments');
        return {};
      }
      
      return response.json();
    },
    enabled: !!selectedOrg,
    staleTime: 30000, // Cache for 30 seconds to reduce redundant queries
  });

  // Helper function to get consistent color for subjects
  const getSubjectColor = (index: number) => {
    const colors = [
      'text-chart-1 border-[var(--chart-1)]',
      'text-chart-2 border-[var(--chart-2)]',
      'text-chart-3 border-[var(--chart-3)]',
      'text-chart-4 border-[var(--chart-4)]',
      'text-secondary border-secondary',
      'text-primary border-primary',
      'text-chart-5 border-[var(--chart-5)]',
      'text-accent border-accent',
    ];
    return colors[index % colors.length];
  };

  // Master refresh function
  const refreshAllData = () => {
    // Prevent refreshing before organization is selected to avoid 403 errors
    if (!selectedOrg) {
      toast({ title: 'Please select an organization first', variant: 'destructive' });
      return;
    }
    
    refetchUnits();
    refetchSubUnits();
    refetchSubjects();
    refetchStudents();
    refetchQuizzes();
    refetchQuizAssignments();
    refetchStudentAssignments();
    refetchUnitSubjects();
    refetchAllStudentSubjectAssignments();
    toast({ title: 'Data refreshed successfully!' });
  };

  // Bulk assign students mutation
  const assignStudentsMutation = useMutation({
    mutationFn: async () => {
      // Convert sentinel values to null
      const unitId = selectedUnit === allUnitsKey ? null : selectedUnit;
      const subUnitId = selectedSubUnit === allSubUnitsKey ? null : selectedSubUnit;
      const subjectId = selectedSubject === allSubjectsKey ? null : selectedSubject;
      
      const promises = selectedStudents.map(studentId =>
        apiRequest(`/api/admin/organizations/${selectedOrg}/users/${studentId}/assignments`, {
          method: 'POST',
          body: JSON.stringify({
            organizationId: selectedOrg,
            unitId,
            subUnitId,
            subjectId,
          }),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] });
      setAssignStudentDialog(false);
      setSelectedStudents([]);
      toast({ title: `${terminologyResolved.learnerPlural} assigned successfully` });
    },
    onError: () => {
      toast({ title: `Failed to assign ${terminologyLowerResolved.learnerPlural}`, variant: 'destructive' });
    },
  });

  // Assign quiz to subject mutation
  const assignQuizMutation = useMutation({
    mutationFn: async () => {
      // Convert sentinel values to null
      const subjectId = selectedSubject === allSubjectsKey ? null : selectedSubject;
      
      if (!selectedQuiz) {
        throw new Error('No quiz selected');
      }
      
      if (!subjectId) {
        throw new Error(`Please select a ${terminologyLowerResolved.subject} to assign the quiz to`);
      }
      
      return apiRequest(`/api/admin/quiz-collections/${selectedQuiz}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          subjectId,
          requiredPassPercentage: 70,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      setAssignQuizDialog(false);
      setSelectedQuiz('');
      toast({ title: `Quiz assigned to ${terminologyLowerResolved.subject} successfully!` });
    },
    onError: (error: any) => {
      toast({ title: error.message || `Failed to assign quiz to ${terminologyLowerResolved.subject}`, variant: 'destructive' });
    },
  });

  // Update assignment availability mutation
  const updateAssignmentAvailabilityMutation = useMutation({
    mutationFn: async ({ assignmentId, availableFrom, availableTo }: { assignmentId: string; availableFrom: string | null; availableTo: string | null }) => {
      return apiRequest(`/api/admin/quiz-assignments/${assignmentId}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ availableFrom, availableTo }),
      });
    },
    onSuccess: async () => {
      // Force immediate refetch of all related queries
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['/api/quiz/assignments'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-collections'], type: 'all' }),
        queryClient.refetchQueries({ queryKey: ['/api/quiz/collections/organization'], type: 'all' }),
      ]);
      
      toast({ title: 'Availability updated successfully!' });
      setAvailabilityDialog(false);
      setSelectedAssignment(null);
      setAvailableFromDate('');
      setAvailableFromTime('');
      setAvailableToDate('');
      setAvailableToTime('');
    },
    onError: () => {
      toast({ title: 'Failed to update availability', variant: 'destructive' });
    },
  });

  // Create subject mutation
  const createSubjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/admin/subjects', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      refreshAllData();
      toast({ title: `${terminologyResolved.subject} created successfully!` });
      setCreateSubjectDialog(false);
      setSubjectName('');
      setSubjectDescription('');
    },
    onError: () => {
      toast({ title: `Failed to create ${terminologyLowerResolved.subject}`, variant: 'destructive' });
    },
  });

  // Update subject mutation
  const updateSubjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/admin/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      refreshAllData();
      toast({ title: `${terminologyResolved.subject} updated successfully!` });
      setEditSubjectDialog(false);
      setEditingSubject(null);
      setSubjectName('');
      setSubjectDescription('');
    },
    onError: () => {
      toast({ title: `Failed to update ${terminologyLowerResolved.subject}`, variant: 'destructive' });
    },
  });

  // Delete subject mutation
  const deleteSubjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/subjects/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refreshAllData();
      toast({ title: `${terminologyResolved.subject} deleted successfully!` });
    },
    onError: () => {
      toast({ title: `Failed to delete ${terminologyLowerResolved.subject}`, variant: 'destructive' });
    },
  });

  // Assign subject to unit mutation
  const assignSubjectToUnitMutation = useMutation({
    mutationFn: async ({ unitId, subjectId }: { unitId: string; subjectId: string }) => {
      return apiRequest(`/api/admin/units/${unitId}/subjects/${subjectId}`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'unit-subjects'] });
      refetchUnitSubjects();
      toast({ title: `${terminologyResolved.subject} assigned to ${terminologyLowerResolved.unit} successfully!` });
      setAssignSubjectDialog(false);
      setSubjectToAssign('');
      setAssignToUnit('');
    },
    onError: () => {
      toast({ title: `Failed to assign ${terminologyLowerResolved.subject} to ${terminologyLowerResolved.unit}`, variant: 'destructive' });
    },
  });

  // Assign student to grade mutation
  const assignStudentToGradeMutation = useMutation({
    mutationFn: async ({ userId, unitId, subUnitId }: { userId: string; unitId: string; subUnitId?: string }) => {
      return apiRequest(`/api/admin/organizations/${selectedOrg}/users/${userId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ 
          unitId, 
          subUnitId: subUnitId || null,
          subjectId: null
        }),
      });
    },
    onSuccess: async () => {
      // Invalidate queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] })
      ]);
      
      // Force refetch to ensure UI updates immediately
      await Promise.all([
        refetchStudents(),
        refetchStudentAssignments(),
        refetchSubUnits()
      ]);
      
      toast({ title: `${terminologyResolved.learner} assigned successfully!` });
      setAssignToGradeDialog(false);
      setSelectedStudentForGrade('');
      setAssignGradeUnit('');
      setAssignGradeSubUnit('');
    },
    onError: () => {
      toast({ title: `Failed to assign ${terminologyLowerResolved.learner} to ${terminologyLowerResolved.unit}`, variant: 'destructive' });
    },
  });

  // Bulk assign students to grade mutation
  const bulkAssignStudentsMutation = useMutation({
    mutationFn: async () => {
      const subUnitId = bulkClassSelection === 'no-class-selected' ? null : bulkClassSelection;
      
      const promises = selectedStudents.map(userId =>
        apiRequest(`/api/admin/organizations/${selectedOrg}/users/${userId}/assignments`, {
          method: 'POST',
          body: JSON.stringify({
            unitId: bulkGradeSelection,
            subUnitId,
            subjectId: null
          }),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] });
      toast({ title: `${selectedStudents.length} ${selectedStudents.length === 1 ? terminologyLowerResolved.learner : terminologyLowerResolved.learnerPlural} assigned successfully!` });
      setSelectedStudents([]);
      setBulkGradeSelection('');
      setBulkClassSelection('');
    },
    onError: () => {
      toast({ title: `Failed to assign ${terminologyLowerResolved.learnerPlural}`, variant: 'destructive' });
    },
  });

  // Remove student assignment mutation
  const removeStudentAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest(`/api/admin/assignments/${assignmentId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] });
      toast({ title: `${terminologyResolved.learner} assignment removed successfully!` });
    },
    onError: () => {
      toast({ title: `Failed to remove ${terminologyLowerResolved.learner} assignment`, variant: 'destructive' });
    },
  });

  // Remove quiz assignment mutation
  const removeQuizAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest(`/api/admin/quiz-assignments/${assignmentId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      toast({ title: 'Quiz assignment removed successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to remove quiz assignment', variant: 'destructive' });
    },
  });

  // Remove lesson assignment mutation
  const removeLessonAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest(`/api/lessons/assignments/${assignmentId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-assignments', selectedOrg] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/assigned'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', selectedOrg] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      toast({ title: 'Lesson assignment removed successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to remove lesson assignment', variant: 'destructive' });
    },
  });

  // Assign lessons mutation
  const assignLessonsMutation = useMutation({
    mutationFn: async () => {
      // Validate selections before making API call
      if (selectedLessons.length === 0) {
        throw new Error('Please select at least one lesson to assign');
      }
      
      // Check if selected unit or subject is "General" by name
      const selectedUnitObj = units.find(u => u.id === selectedUnit);
      const selectedSubjectObj = subjects.find(s => s.id === selectedSubject);
      const isGeneralUnit = selectedUnitObj?.name === 'General';
      const isGeneralSubject = selectedSubjectObj?.name === `All ${terminologyResolved.learnerPlural}`;
      const isGeneralSelected = isGeneralUnit || isGeneralSubject;
      
      // For General assignment, set both unitId and subjectId to 'general'
      // For specific departments, validate and use selected values
      let assignUnitId = selectedUnit;
      let assignSubjectId = selectedSubject;
      
      if (isGeneralSelected) {
        // Organization-wide assignment - set both to 'general'
        assignUnitId = 'general';
        assignSubjectId = 'general';
      } else {
        // Specific unit+subject assignment - require both to be selected
        if (selectedUnit === allUnitsKey) {
          throw new Error(`Please select a specific ${terminologyLowerResolved.unit} or choose General department`);
        }
        if (selectedSubject === allSubjectsKey) {
          throw new Error(`Please select a specific ${terminologyLowerResolved.subject} or choose General department`);
        }
      }
      
      return apiRequest('/api/lessons/assign', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedOrg,
          unitId: assignUnitId,
          subjectId: assignSubjectId,
          lessonIds: selectedLessons,
        }),
      });
    },
    onSuccess: (response: any) => {
      // Invalidate all relevant queries for fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/assigned', selectedOrg] }); // Array format to match useQuery
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/assigned'] }); // Also invalidate generic key
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', selectedOrg] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-assignments', selectedOrg] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assignments'] });
      
      const autoAssignedCount = response?.triggeredQuizAssignments?.length || 0;
      toast({
        title: 'Lessons assigned successfully!',
        description: autoAssignedCount > 0
          ? `${autoAssignedCount} linked ${autoAssignedCount === 1 ? 'quiz was' : 'quizzes were'} automatically assigned`
          : undefined,
      });
      setLessonAssignDialog(false);
      setSelectedLessons([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to assign lessons',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  // Create quiz collection mutation
  const createQuizMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/admin/quiz-collections', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      refreshAllData();
      toast({ title: 'Quiz collection created successfully!' });
      setCreateQuizDialog(false);
      setQuizName('');
      setQuizDescription('');
      setQuizDifficulty('medium');
      setQuizSubject('');
      setQuizUnit('');
    },
    onError: () => {
      toast({ title: 'Failed to create quiz collection', variant: 'destructive' });
    },
  });

  // Update quiz collection mutation
  const updateQuizMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/admin/quiz-collections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      refreshAllData();
      toast({ title: 'Quiz collection updated successfully!' });
      setEditQuizDialog(false);
      setEditingQuiz(null);
      setQuizName('');
      setQuizDescription('');
    },
    onError: () => {
      toast({ title: 'Failed to update quiz collection', variant: 'destructive' });
    },
  });

  // Delete quiz collection mutation
  const deleteQuizMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/quiz-collections/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refreshAllData();
      toast({ title: 'Quiz collection deleted successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to delete quiz collection', variant: 'destructive' });
    },
  });

  // Assign quiz to subject mutation
  const assignQuizToSubjectMutation = useMutation({
    mutationFn: async ({ collectionId, subjectId }: { collectionId: string; subjectId: string }) => {
      return apiRequest(`/api/admin/quiz-collections/${collectionId}`, {
        method: 'PUT',
        body: JSON.stringify({
          subjectId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections', selectedOrg] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'] });
      toast({ title: `Quiz assigned to ${terminologyLowerResolved.subject} successfully!` });
    },
    onError: () => {
      toast({ title: `Failed to assign quiz to ${terminologyLowerResolved.subject}`, variant: 'destructive' });
    },
  });

  // Lock user mutation
  const lockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}/lock`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'admin-users'] });
      refetchStudents();
      refetchAdminUsers();
      toast({ title: 'User locked successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to lock user', variant: 'destructive' });
    }
  });

  // Unlock user mutation
  const unlockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}/unlock`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'admin-users'] });
      refetchStudents();
      refetchAdminUsers();
      toast({ title: 'User unlocked successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to unlock user', variant: 'destructive' });
    }
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      return await apiRequest(`/api/admin/users/${userId}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Password reset successfully' });
      setResetPasswordDialog(false);
      setNewPassword('');
      setSelectedUserForActions(null);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Failed to reset password';
      toast({ title: errorMessage, variant: 'destructive' });
    }
  });

  // Update roles mutation (org-scoped for non-SuperAdmin users)
  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      return await apiRequest(`/api/admin/users/${userId}/roles`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          organizationRoles: [{ organizationId: selectedOrg, roles: roleIds }] 
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'all-students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'admin-users'] });
      refetchStudents();
      refetchAdminUsers();
      toast({ title: 'User roles updated successfully' });
      setRolesDialog(false);
      setSelectedUserForActions(null);
      setOrganizationRoles({});
    },
    onError: () => {
      toast({ title: 'Failed to update user roles', variant: 'destructive' });
    }
  });

  // Update student subject assignments mutation
  const updateStudentSubjectsMutation = useMutation({
    mutationFn: async ({ userId, subjectIds, organizationId, unitId, subUnitId }: { 
      userId: string; 
      subjectIds: string[]; 
      organizationId: string; 
      unitId: string; 
      subUnitId: string | undefined;
    }) => {
      return await apiRequest(`/api/admin/users/${userId}/subject-assignments`, {
        method: 'POST',
        body: JSON.stringify({ subjectIds, organizationId, unitId, subUnitId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'subject-assignments'] });
      refetchStudentAssignments();
      refetchAllStudentSubjectAssignments();
      toast({ title: `${terminologyResolved.subject} assignments updated successfully!` });
      setManageSubjectsDialog(false);
      setSelectedStudentForSubjects(null);
      setStudentSubjectAssignments([]);
    },
    onError: () => {
      toast({ title: `Failed to update ${terminologyLowerResolved.subject} assignments`, variant: 'destructive' });
    }
  });

  // Bulk subject assignment mutation
  const bulkAssignSubjectsMutation = useMutation({
    mutationFn: async () => {
      const promises = selectedStudents.map(async (studentId) => {
        const assignment = studentAssignments.find((a: any) => a.userId === studentId);
        if (!assignment) {
          throw new Error(`${terminologyResolved.learner} ${studentId} is not assigned to a ${terminologyLowerResolved.unit}`);
        }
        
        // Get current subject assignments
        const response = await fetch(`/api/admin/users/${studentId}/subject-assignments`, {
          credentials: 'include'
        });
        const currentSubjects = response.ok ? await response.json() : [];
        
        // Merge with new subjects or set to new subjects based on action
        let newSubjects = [];
        if (bulkSubjectAction === 'assign') {
          // Add new subjects to existing ones (union)
          const combined = [...currentSubjects, ...bulkSubjectSelections];
          newSubjects = Array.from(new Set(combined));
        } else if (bulkSubjectAction === 'remove') {
          // Remove specified subjects
          newSubjects = currentSubjects.filter((id: string) => !bulkSubjectSelections.includes(id));
        }
        
        return apiRequest(`/api/admin/users/${studentId}/subject-assignments`, {
          method: 'POST',
          body: JSON.stringify({
            subjectIds: newSubjects,
            organizationId: selectedOrg,
            unitId: assignment.unitId,
            subUnitId: assignment.subUnitId
          }),
        });
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'subject-assignments'] });
      refetchStudentAssignments();
      refetchAllStudentSubjectAssignments();
      toast({ title: `${terminologyResolved.subjectPlural} ${bulkSubjectAction === 'assign' ? 'assigned to' : 'removed from'} ${selectedStudents.length} ${terminologyResolved.learnerPlural.toLowerCase()}!` });
      setSelectedStudents([]);
      setBulkSubjectAction('');
      setBulkSubjectSelections([]);
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to ${bulkSubjectAction} ${terminologyLowerResolved.subjectPlural}`, 
        description: error.message || `Some ${terminologyLowerResolved.learnerPlural} may not be assigned to a ${terminologyLowerResolved.unit}`,
        variant: 'destructive' 
      });
    }
  });

  // Fetch student subject assignments when dialog opens
  useEffect(() => {
    const fetchStudentSubjects = async () => {
      if (manageSubjectsDialog && selectedStudentForSubjects) {
        try {
          const response = await fetch(`/api/admin/users/${selectedStudentForSubjects.id}/subject-assignments`, {
            credentials: 'include'
          });
          if (response.ok) {
            const subjectIds = await response.json();
            setStudentSubjectAssignments(subjectIds);
          }
        } catch (error) {
          console.error('Error fetching student subject assignments:', error);
        }
      }
    };
    
    fetchStudentSubjects();
  }, [manageSubjectsDialog, selectedStudentForSubjects]);

  // User action handlers
  const handleResetPassword = (user: any) => {
    setSelectedUserForActions(user);
    setNewPassword('');
    setResetPasswordDialog(true);
  };

  const handleEditRoles = (user: any) => {
    setSelectedUserForActions(user);
    
    // Build organization roles map from user's existing roles
    const orgRolesMap: {[key: string]: string[]} = {};
    if (user.organizationRoles && Array.isArray(user.organizationRoles)) {
      user.organizationRoles.forEach((role: any) => {
        if (!orgRolesMap[role.organizationId]) {
          orgRolesMap[role.organizationId] = [];
        }
        orgRolesMap[role.organizationId].push(role.role);
      });
    }
    setOrganizationRoles(orgRolesMap);
    
    setRolesDialog(true);
  };

  const handleOrgRoleToggle = (orgId: string, role: string, checked: boolean) => {
    setOrganizationRoles(prev => {
      const newRoles = { ...prev };
      if (!newRoles[orgId]) {
        newRoles[orgId] = [];
      }
      
      if (checked) {
        if (!newRoles[orgId].includes(role)) {
          newRoles[orgId] = [...newRoles[orgId], role];
        }
      } else {
        newRoles[orgId] = newRoles[orgId].filter(r => r !== role);
      }
      
      return newRoles;
    });
  };

  const handleSaveRoles = () => {
    if (!selectedUserForActions || !selectedOrg) return;
    
    // Get the selected role IDs for the current organization
    // organizationRoles[selectedOrg] contains role type strings
    const roleIds = organizationRoles[selectedOrg] || [];
    
    updateRolesMutation.mutate({
      userId: selectedUserForActions.id,
      roleIds
    });
  };

  // Subject handlers
  const handleCreateSubject = async () => {
    if (!subjectName || !selectedOrg) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    
    try {
      const subject: any = await createSubjectMutation.mutateAsync({
        name: subjectName,
        description: subjectDescription,
        organizationId: selectedOrg,
      });
      
      // If grade/unit is selected, assign the subject to it
      if (subjectAssignUnit && subject?.id) {
        await assignSubjectToUnitMutation.mutateAsync({
          unitId: subjectAssignUnit,
          subjectId: subject.id,
        });
      }
      
      setSubjectAssignUnit('');
    } catch (error) {
      console.error('Error creating subject:', error);
    }
  };

  const handleEditSubject = (subject: any) => {
    setEditingSubject(subject);
    setSubjectName(subject.name);
    setSubjectDescription(subject.description || '');
    setEditSubjectDialog(true);
  };

  const handleUpdateSubject = () => {
    if (!subjectName || !editingSubject) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    updateSubjectMutation.mutate({
      id: editingSubject.id,
      data: {
        name: subjectName,
        description: subjectDescription,
      },
    });
  };

  const handleSetAvailability = (assignment: any) => {
    setSelectedAssignment(assignment);
    
    // Parse existing availability if present
    if (assignment.availableFrom) {
      const fromDate = new Date(assignment.availableFrom);
      setAvailableFromDate(fromDate.toISOString().split('T')[0]);
      setAvailableFromTime(fromDate.toTimeString().slice(0, 5));
    } else {
      setAvailableFromDate('');
      setAvailableFromTime('');
    }
    
    if (assignment.availableTo) {
      const toDate = new Date(assignment.availableTo);
      setAvailableToDate(toDate.toISOString().split('T')[0]);
      setAvailableToTime(toDate.toTimeString().slice(0, 5));
    } else {
      setAvailableToDate('');
      setAvailableToTime('');
    }
    
    setAvailabilityDialog(true);
  };

  const handleSetAlwaysAvailable = () => {
    // Clear all date/time fields to make quiz always available
    setAvailableFromDate('');
    setAvailableFromTime('');
    setAvailableToDate('');
    setAvailableToTime('');
  };

  const handleSaveAvailability = () => {
    if (!selectedAssignment) return;
    
    // Combine date and time into ISO strings
    let availableFrom: string | null = null;
    let availableTo: string | null = null;
    
    if (availableFromDate && availableFromTime) {
      availableFrom = new Date(`${availableFromDate}T${availableFromTime}`).toISOString();
    }
    
    if (availableToDate && availableToTime) {
      availableTo = new Date(`${availableToDate}T${availableToTime}`).toISOString();
    }
    
    // Validate: if both are set, from must be before to
    if (availableFrom && availableTo && new Date(availableFrom) >= new Date(availableTo)) {
      toast({ title: 'From date/time must be before To date/time', variant: 'destructive' });
      return;
    }
    
    updateAssignmentAvailabilityMutation.mutate({
      assignmentId: selectedAssignment.id,
      availableFrom,
      availableTo,
    });
  };

  const handleAssignSubject = () => {
    if (!subjectToAssign || !assignToUnit) {
      toast({ title: `Please select both subject and ${terminologyLowerResolved.unit}`, variant: 'destructive' });
      return;
    }
    assignSubjectToUnitMutation.mutate({
      unitId: assignToUnit,
      subjectId: subjectToAssign,
    });
  };

  const handleAssignStudentToGrade = () => {
    if (!selectedStudentForGrade || !assignGradeUnit) {
      toast({ title: `Please select both ${terminologyLowerResolved.learner} and ${terminologyLowerResolved.unit}`, variant: 'destructive' });
      return;
    }
    assignStudentToGradeMutation.mutate({
      userId: selectedStudentForGrade,
      unitId: assignGradeUnit,
      subUnitId: assignGradeSubUnit || undefined,
    });
  };

  const handleCreateQuiz = () => {
    if (!quizName || !selectedOrg) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    createQuizMutation.mutate({
      name: quizName,
      description: quizDescription,
      organizationId: selectedOrg,
      subjectId: quizSubject || null,
      unitId: quizUnit || null,
      difficulty: quizDifficulty,
      isPublic: false,
      passPercentage: quizPassPercentage,
    });
  };

  const handleEditQuiz = (quiz: any) => {
    setEditingQuiz(quiz);
    setQuizName(quiz.name);
    setQuizDescription(quiz.description || '');
    setQuizDifficulty(quiz.difficulty || 'medium');
    setQuizIsPublic(quiz.isPublic || false);
    setQuizIsActive(quiz.isActive !== undefined ? quiz.isActive : true);
    setQuizPassPercentage(quiz.passPercentage || 70);
    setEditQuizDialog(true);
  };

  const handleUpdateQuiz = () => {
    if (!quizName || !editingQuiz) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    updateQuizMutation.mutate({
      id: editingQuiz.id,
      data: {
        name: quizName,
        description: quizDescription,
        difficulty: quizDifficulty,
        isPublic: quizIsPublic,
        isActive: quizIsActive,
        passPercentage: quizPassPercentage,
      },
    });
  };

  // Filter students by context and search term (before pagination)
  const allFilteredStudents = students.filter((s: any) => {
    // Filter by search term - search across multiple fields including subjects
    let matchesSearch = !searchTerm || 
      s.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.gamerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getDisplayName(s).toLowerCase().includes(searchTerm.toLowerCase());
    
    // Also search by subject names
    if (!matchesSearch && searchTerm) {
      const studentSubjects = allStudentSubjectAssignments[s.id] || [];
      const matchingSubject = studentSubjects.some((subjectId: string) => {
        const subject = subjects.find((subj: any) => subj.id === subjectId);
        return subject?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      });
      matchesSearch = matchingSubject;
    }
    
    if (!matchesSearch) return false;

    // Get student's assignment
    const assignment = studentAssignments.find((a: any) => a.userId === s.id);

    // If "Unassigned" is selected, show only students without assignments
    if (selectedUnit === 'unassigned') {
      return !assignment;
    }

    // If filters are set to "all", show all students
    if (selectedUnit === allUnitsKey && selectedSubUnit === allSubUnitsKey && selectedSubject === allSubjectsKey) {
      return true;
    }

    if (!assignment) return selectedUnit === allUnitsKey; // Show unassigned if "all" is selected

    // Filter by unit/grade
    if (selectedUnit !== allUnitsKey && assignment.unitId !== selectedUnit) {
      return false;
    }

    // Filter by subunit/class
    if (selectedSubUnit !== allSubUnitsKey && assignment.subUnitId !== selectedSubUnit) {
      return false;
    }

    // Filter by subject
    if (selectedSubject !== allSubjectsKey && assignment.subjectId !== selectedSubject) {
      return false;
    }

    return true;
  });
  
  // Calculate student pagination
  const totalStudentPages = Math.ceil(allFilteredStudents.length / studentPageSize);
  const startStudentIndex = (studentPage - 1) * studentPageSize;
  const endStudentIndex = startStudentIndex + studentPageSize;
  const filteredStudents = allFilteredStudents.slice(startStudentIndex, endStudentIndex);
  
  // Clamp student page when total pages decreases
  useEffect(() => {
    if (totalStudentPages > 0 && studentPage > totalStudentPages) {
      setStudentPage(totalStudentPages);
    } else if (totalStudentPages === 0 && studentPage !== 1) {
      setStudentPage(1);
    }
  }, [totalStudentPages, studentPage]);
  
  // Reset student page when filters or search changes
  useEffect(() => {
    setStudentPage(1);
  }, [selectedUnit, selectedSubUnit, selectedSubject, searchTerm]);

  // Filter subjects by context and deduplicate
  const filteredSubjects = Array.from(
    new Map(
      subjects
        .filter((subj: any) => {
          // Filter by selected subject
          if (selectedSubject !== allSubjectsKey && subj.id !== selectedSubject) {
            return false;
          }
          
          // Filter by selected grade/unit
          if (selectedUnit === allUnitsKey) {
            return true; // Show all subjects when no grade filter is applied
          }
          
          // Check if subject is assigned to the selected grade via unitSubjectAssignments
          const isAssignedToGrade = unitSubjectAssignments.some(
            (usa: any) => usa.subjectId === subj.id && usa.unitId === selectedUnit
          );
          
          return isAssignedToGrade;
        })
        .map((subj: any) => [subj.id, subj])
    ).values()
  );

  // Filter quizzes by context
  const filteredQuizzes = quizzes.filter((quiz: any) => {
    // Filter by selected subject
    if (selectedSubject !== allSubjectsKey) {
      if (!quiz.subjectId || quiz.subjectId !== selectedSubject) {
        return false;
      }
    }
    
    // Filter by selected grade/unit
    if (selectedUnit !== allUnitsKey) {
      // Derive allowed grades from the quiz's subject via unitSubjectAssignments
      if (!quiz.subjectId) {
        return false; // Quiz without subject can't be filtered by grade
      }
      
      const isAssignedToGrade = unitSubjectAssignments.some(
        (usa: any) => usa.subjectId === quiz.subjectId && usa.unitId === selectedUnit
      );
      
      if (!isAssignedToGrade) {
        return false;
      }
    }
    
    // Filter by assignment status
    if (assignmentStatusFilter !== 'all') {
      const hasAssignments = quizAssignments.some((assignment: any) => assignment.collectionId === quiz.id);
      
      if (assignmentStatusFilter === 'assigned' && !hasAssignments) {
        return false;
      }
      
      if (assignmentStatusFilter === 'unassigned' && hasAssignments) {
        return false;
      }
    }
    
    return true;
  });

  // Use real quiz assignments from the database
  // Filter assignments by context
  const filteredAssignments = quizAssignments.filter((assignment: any) => {
    // Filter by selected grade/unit
    if (selectedUnit !== allUnitsKey && assignment.unitId !== selectedUnit) {
      return false;
    }
    
    // Filter by selected subject
    if (selectedSubject !== allSubjectsKey && assignment.subjectId !== selectedSubject) {
      return false;
    }
    
    return true;
  });

  // Get context breadcrumb
  const getBreadcrumb = () => {
    const parts = [];
    if (selectedOrg) {
      const org = organizations.find((o: any) => o.id === selectedOrg);
      parts.push(org?.name || 'Organization');
    }
    if (selectedUnit) {
      const unit = units.find((u: any) => u.id === selectedUnit);
      parts.push(unit?.name || terminologyResolved.unit);
    }
    if (selectedSubUnit) {
      const subUnit = subUnits.find((su: any) => su.id === selectedSubUnit);
      parts.push(subUnit?.name || terminologyResolved.subUnit);
    }
    if (selectedSubject) {
      const subject = subjects.find((s: any) => s.id === selectedSubject);
      parts.push(subject?.name || terminologyResolved.subject);
    }
    return parts;
  };

  // Get unique color for grade badge
  const getGradeColor = (unitId: string): string => {
    const colors = [
      'bg-secondary',
      'bg-primary',
      'bg-[var(--chart-1)]',
      'bg-[var(--chart-2)]',
      'bg-accent',
      'bg-primary',
      'bg-secondary',
      'bg-[var(--chart-3)]',
      'bg-[var(--chart-4)]',
      'bg-[var(--chart-5)]',
    ];
    
    // Use unit ID to consistently assign the same color to the same grade
    const unitIndex = units.findIndex((u: any) => u.id === unitId);
    return colors[unitIndex % colors.length] || 'bg-muted';
  };

  // Show loading state until terminology is resolved (AFTER all hooks are called)
  if (!isResolved || !terminology) {
    return (
      <QuizAdminLayout title="Management Hub" description="Loading..." activeSection="management-hub">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading organization settings...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Management Hub" description="Unified interface for managing your organization" activeSection="management-hub">
      <div className="space-y-6">
        {/* Context Selector */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Select Context
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Choose your organizational context to manage
                </CardDescription>
              </div>
              <Button onClick={refreshAllData} variant="outline" size="sm" className="w-full sm:w-auto" data-testid="button-refresh-data" >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Breadcrumb */}
            {getBreadcrumb().length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <Building2 className="h-4 w-4" />
                {getBreadcrumb().map((part, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {idx > 0 && <ChevronRight className="h-4 w-4" />}
                    <span className="text-primary font-medium">{part}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Organization Selector */}
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label className="text-foreground">Organization</Label>
                  <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                    <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-organization">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org: any) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Unit/Grade Selector */}
              <div className="space-y-2">
                <Label className="text-foreground">{terminologyResolved.unit}</Label>
                <Select value={selectedUnit} onValueChange={(val) => { setSelectedUnit(val); setSelectedSubUnit(allSubUnitsKey); }}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-unit">
                    <SelectValue placeholder={`All ${terminologyLowerResolved.unitPlural}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allUnitsKey}>All {terminologyLowerResolved.unitPlural}</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-unit/Class Selector */}
              {selectedUnit && selectedUnit !== allUnitsKey && (
                <div className="space-y-2">
                  <Label className="text-foreground">{terminologyResolved.subUnit}</Label>
                  <Select value={selectedSubUnit} onValueChange={setSelectedSubUnit}>
                    <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-subunit">
                      <SelectValue placeholder={`All ${terminologyLowerResolved.subUnitPlural}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={allSubUnitsKey}>All {terminologyLowerResolved.subUnitPlural}</SelectItem>
                      {subUnits.filter((su: any) => su.unitId === selectedUnit).map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id}>{subUnit.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Subject Selector */}
              <div className="space-y-2">
                <Label className="text-foreground">{terminologyResolved.subject}</Label>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-subject">
                    <SelectValue placeholder={`All ${terminologyLowerResolved.subjectPlural}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allSubjectsKey}>All {terminologyLowerResolved.subjectPlural}</SelectItem>
                    {filteredSubjects.map((subject: any) => (
                      <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assignment Status Filter - Context-aware labels */}
              <div className="space-y-2">
                <Label className="text-foreground">Assignment Status</Label>
                <Select value={assignmentStatusFilter} onValueChange={setAssignmentStatusFilter}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-assignment-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Tabs */}
        {selectedOrg && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-card border border-border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 w-full gap-2 h-auto p-2">
              <TabsTrigger value="students" data-testid="tab-students">
                <Users className="h-4 w-4 mr-2" />
                {terminologyResolved.learnerPlural}
              </TabsTrigger>
              <TabsTrigger value="grades" data-testid="tab-grades">
                <GraduationCap className="h-4 w-4 mr-2" />
                {terminologyResolved.unitPlural}
              </TabsTrigger>
              <TabsTrigger value="subjects" data-testid="tab-subjects">
                <BookOpen className="h-4 w-4 mr-2" />
                {terminologyResolved.subjectPlural}
              </TabsTrigger>
            </TabsList>

            {/* Students Tab */}
            <TabsContent value="students" className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="text-foreground">{terminologyResolved.learnerPlural} in Context</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {allFilteredStudents.length} {allFilteredStudents.length === 1 ? terminologyLowerResolved.learner : terminologyLowerResolved.learnerPlural}
                        {totalStudentPages > 1 && ` (page ${studentPage} of ${totalStudentPages})`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button variant="outline" size="sm" onClick={() => setSelectedStudents(allFilteredStudents.map((s: any) => s.id))}
                        className="text-foreground border-border flex-1 sm:flex-none"
                        data-testid="button-select-all-students-tab"
                      >
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedStudents([])}
                        className="text-foreground border-border flex-1 sm:flex-none"
                        data-testid="button-deselect-all-students-tab"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Input
                    placeholder={`Search ${terminologyLowerResolved.learnerPlural}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-muted border-border text-foreground mb-4"
                    data-testid="input-search-students"
                  />
                  {selectedStudents.length > 0 && (
                    <div className="mb-4 p-4 bg-primary/20 border border-primary rounded-lg">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="text-foreground">
                          <span className="font-medium">{selectedStudents.length} {selectedStudents.length === 1 ? terminologyLowerResolved.learner : terminologyLowerResolved.learnerPlural} selected</span>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                          <Select 
                            value={bulkGradeSelection}
                            onValueChange={setBulkGradeSelection}
                          >
                            <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid="select-bulk-grade-students">
                              <SelectValue placeholder={`Select ${terminologyLowerResolved.unit}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit: any) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {bulkGradeSelection && (
                            <Select 
                              value={bulkClassSelection}
                              onValueChange={setBulkClassSelection}
                            >
                              <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid="select-bulk-class-students">
                                <SelectValue placeholder={`Select ${terminologyLowerResolved.subUnit} (optional)`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no-class-selected">No {terminologyLowerResolved.subUnit}</SelectItem>
                                {subUnits.filter((su: any) => su.unitId === bulkGradeSelection).map((subUnit: any) => (
                                  <SelectItem key={subUnit.id} value={subUnit.id}>
                                    {subUnit.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Button onClick={() => {
                              if (!bulkGradeSelection) {
                                toast({ title: `Please select a ${terminologyLowerResolved.unit}`, variant: 'destructive' });
                                return;
                              }
                              bulkAssignStudentsMutation.mutate();
                            }}
                            className="bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                            disabled={!bulkGradeSelection}
                            data-testid="button-bulk-assign-students"
                          >
                            Assign to {terminologyResolved.unit}
                          </Button>
                        </div>
                      </div>
                      {/* Bulk Subject Management Section */}
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="text-foreground mb-3">
                          <span className="font-medium">Bulk {terminologyResolved.subject} Management</span>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                          <Select 
                            value={bulkSubjectAction}
                            onValueChange={setBulkSubjectAction}
                          >
                            <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid="select-bulk-subject-action">
                              <SelectValue placeholder="Select action" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="assign">Assign {terminologyResolved.subjectPlural}</SelectItem>
                              <SelectItem value="remove">Remove {terminologyResolved.subjectPlural}</SelectItem>
                            </SelectContent>
                          </Select>
                          {bulkSubjectAction && (() => {
                            // Get unique grade IDs from selected students
                            const selectedStudentGrades = new Set(
                              selectedStudents
                                .map(studentId => {
                                  const assignment = studentAssignments.find((a: any) => a.userId === studentId);
                                  return assignment?.unitId;
                                })
                                .filter(Boolean)
                            );
                            
                            // Get subject IDs that are assigned to the selected grades
                            const subjectIdsForGrades = new Set(
                              unitSubjectAssignments
                                .filter((usa: any) => selectedStudentGrades.has(usa.unitId))
                                .map((usa: any) => usa.subjectId)
                            );
                            
                            // Filter and deduplicate subjects to only show those belonging to selected students' grades
                            const filteredSubjects = Array.from(
                              new Map(
                                subjects
                                  .filter((subject: any) => subjectIdsForGrades.has(subject.id))
                                  .map((subject: any) => [subject.id, subject])
                              ).values()
                            );
                            
                            return (
                              <div className="flex-1">
                                <div className="text-sm text-muted-foreground mb-2">
                                  Select {terminologyLowerResolved.subjectPlural} {selectedStudentGrades.size > 0 ? `(filtered by ${terminologyLowerResolved.unit})` : ''}:
                                </div>
                                <div className="space-y-1 max-h-[150px] overflow-y-auto bg-muted rounded-lg p-2">
                                  {filteredSubjects.length > 0 ? (
                                    filteredSubjects.map((subject: any) => (
                                      <label
                                        key={subject.id}
                                        className="flex items-center space-x-2 p-1 rounded hover:bg-accent/50 cursor-pointer transition-colors"
                                        data-testid={`label-bulk-subject-${subject.id}`}
                                      >
                                        <Checkbox
                                          checked={bulkSubjectSelections.includes(subject.id)}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              setBulkSubjectSelections([...bulkSubjectSelections, subject.id]);
                                            } else {
                                              setBulkSubjectSelections(bulkSubjectSelections.filter(id => id !== subject.id));
                                            }
                                          }}
                                          data-testid={`checkbox-bulk-subject-${subject.id}`}
                                        />
                                        <span className="text-foreground text-sm">{subject.name}</span>
                                      </label>
                                    ))
                                  ) : (
                                    <div className="text-sm text-muted-foreground p-2">
                                      {selectedStudentGrades.size === 0 
                                        ? `Selected ${terminologyLowerResolved.learnerPlural} have no ${terminologyLowerResolved.unit} assignments` 
                                        : `No ${terminologyLowerResolved.subjectPlural} available for the selected ${terminologyLowerResolved.unit}(s)`}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          <Button onClick={() => {
                              if (!bulkSubjectAction) {
                                toast({ title: 'Please select an action', variant: 'destructive' });
                                return;
                              }
                              if (bulkSubjectSelections.length === 0) {
                                toast({ title: `Please select at least one ${terminologyLowerResolved.subject}`, variant: 'destructive' });
                                return;
                              }
                              bulkAssignSubjectsMutation.mutate();
                            }}
                            className="bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                            disabled={!bulkSubjectAction || bulkSubjectSelections.length === 0 || bulkAssignSubjectsMutation.isPending}
                            data-testid="button-bulk-subject-action"
                          >
                            {bulkAssignSubjectsMutation.isPending ? 'Processing...' : `${bulkSubjectAction === 'assign' ? 'Assign' : 'Remove'} ${terminologyResolved.subjectPlural}`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredStudents.map((student: any) => {
                      const assignment = studentAssignments.find((a: any) => a.userId === student.id);
                      const assignedUnit = assignment ? units.find((u: any) => u.id === assignment.unitId) : null;
                      const assignedSubUnit = assignment?.subUnitId ? subUnits.find((su: any) => su.id === assignment.subUnitId) : null;
                      const org = organizations.find((o: any) => o.id === selectedOrg);
                      const isSelected = selectedStudents.includes(student.id);
                      
                      return (
                        <div key={student.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg" data-testid={`student-${student.id}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedStudents([...selectedStudents, student.id]);
                              } else {
                                setSelectedStudents(selectedStudents.filter((id: string) => id !== student.id));
                              }
                            }}
                            data-testid={`checkbox-student-tab-${student.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-foreground font-medium">{getDisplayName(student)}</div>
                            <div className="text-sm text-muted-foreground truncate">{student.email}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {org?.name || 'No org'}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {assignedUnit?.name || `No ${terminologyLowerResolved.unit}`}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {assignedSubUnit?.name || `No ${terminologyLowerResolved.subUnit}`}
                              </Badge>
                              {/* ${terminologyResolved.subject} badges */}
                              {(allStudentSubjectAssignments[student.id] || []).map((subjectId: string, index: number) => {
                                const subject = subjects.find((s: any) => s.id === subjectId);
                                if (!subject) return null;
                                return (
                                  <Badge key={subjectId} variant="outline" className={`text-xs ${getSubjectColor(index)}`} data-testid={`badge-subject-${subjectId}`} >
                                    {subject.name}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => {
                                if (student.isLocked) {
                                  unlockUserMutation.mutate(student.id);
                                } else {
                                  lockUserMutation.mutate(student.id);
                                }
                              }}
                              className={student.isLocked ? "text-destructive" : "text-muted-foreground"}
                              title={student.isLocked ? "Unlock user" : "Lock user"}
                              data-testid={`button-lock-student-${student.id}`}
                            >
                              {student.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleResetPassword(student)}
                              className="text-warning"
                              title="Reset password"
                              data-testid={`button-reset-password-student-${student.id}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleEditRoles(student)}
                              className="text-secondary"
                              title="Edit roles"
                              data-testid={`button-edit-roles-student-${student.id}`}
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => {
                                setSelectedStudentForSubjects(student);
                                setManageSubjectsDialog(true);
                              }}
                              className="text-primary"
                              title={`Manage ${terminologyLowerResolved.subjectPlural}`}
                              data-testid={`button-manage-subjects-${student.id}`}
                            >
                              <BookOpen className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => {
                                setSelectedStudentForGrade(student.id);
                                setAssignGradeUnit(assignedUnit?.id || '');
                                setAssignGradeSubUnit(assignedSubUnit?.id || '');
                                setAssignToGradeDialog(true);
                              }}
                              className="text-primary"
                              title={`Edit ${terminologyLowerResolved.unit} assignment`}
                              data-testid={`button-edit-student-${student.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {assignment && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                  if (confirm('Remove this student assignment?')) {
                                    removeStudentAssignmentMutation.mutate(assignment.id);
                                  }
                                }}
                                className="text-destructive"
                                title="Remove assignment"
                                data-testid={`button-remove-student-${student.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No {terminologyLowerResolved.learnerPlural} found in this context
                      </div>
                    )}
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalStudentPages > 1 && (
                    <div className="flex justify-center mt-4">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                              className={studentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                          
                          {Array.from({ length: totalStudentPages }, (_, i) => i + 1).map((page) => {
                            // Show first page, last page, current page, and pages around current
                            if (
                              page === 1 ||
                              page === totalStudentPages ||
                              (page >= studentPage - 1 && page <= studentPage + 1)
                            ) {
                              return (
                                <PaginationItem key={page}>
                                  <PaginationLink
                                    onClick={() => setStudentPage(page)}
                                    isActive={page === studentPage}
                                    className="cursor-pointer"
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            } else if (
                              page === studentPage - 2 ||
                              page === studentPage + 2
                            ) {
                              return <PaginationItem key={page}><span className="px-2 text-muted-foreground">...</span></PaginationItem>;
                            }
                            return null;
                          })}
                          
                          <PaginationItem>
                            <PaginationNext 
                              onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))}
                              className={studentPage === totalStudentPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Grades Tab */}
            <TabsContent value="grades" className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="text-foreground">{terminologyResolved.learner} {terminologyResolved.unit} Assignments</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {filteredStudents.length} {filteredStudents.length === 1 ? terminologyLowerResolved.learner : terminologyLowerResolved.learnerPlural} in this context
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button variant="outline" size="sm" onClick={() => setSelectedStudents(filteredStudents.map((s: any) => s.id))}
                        className="text-foreground border-border flex-1 sm:flex-none"
                        data-testid="button-select-all-students-grades"
                      >
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedStudents([])}
                        className="text-foreground border-border flex-1 sm:flex-none"
                        data-testid="button-deselect-all-students-grades"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Input
                    placeholder={`Search ${terminologyLowerResolved.learnerPlural}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-muted border-border text-foreground mb-4"
                    data-testid="input-search-grades"
                  />
                  {selectedStudents.length > 0 && (
                    <div className="mb-4 p-4 bg-primary/20 border border-primary rounded-lg">
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-foreground">
                          <span className="font-medium">{selectedStudents.length} {selectedStudents.length === 1 ? terminologyLowerResolved.learner : terminologyLowerResolved.learnerPlural} selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select 
                            value={bulkGradeSelection}
                            onValueChange={setBulkGradeSelection}
                          >
                            <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid="select-bulk-grade">
                              <SelectValue placeholder={`Select ${terminologyLowerResolved.unit}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit: any) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {bulkGradeSelection && (
                            <Select 
                              value={bulkClassSelection}
                              onValueChange={setBulkClassSelection}
                            >
                              <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid="select-bulk-class">
                                <SelectValue placeholder={`Select ${terminologyLowerResolved.subUnit} (optional)`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no-class-selected">No {terminologyLowerResolved.subUnit}</SelectItem>
                                {subUnits.filter((su: any) => su.unitId === bulkGradeSelection).map((subUnit: any) => (
                                  <SelectItem key={subUnit.id} value={subUnit.id}>
                                    {subUnit.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Button onClick={() => {
                              if (!bulkGradeSelection) {
                                toast({ title: `Please select a ${terminologyLowerResolved.unit}`, variant: 'destructive' });
                                return;
                              }
                              bulkAssignStudentsMutation.mutate();
                            }}
                            className="bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                            disabled={!bulkGradeSelection}
                            data-testid="button-bulk-assign"
                          >
                            Assign to {terminologyResolved.unit}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredStudents.map((student: any) => {
                      const assignment = studentAssignments.find((a: any) => a.userId === student.id);
                      const assignedUnit = assignment ? units.find((u: any) => u.id === assignment.unitId) : null;
                      const assignedSubUnit = assignment?.subUnitId ? subUnits.find((su: any) => su.id === assignment.subUnitId) : null;
                      const isSelected = selectedStudents.includes(student.id);
                      
                      return (
                        <div key={student.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg" data-testid={`student-assignment-${student.id}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedStudents([...selectedStudents, student.id]);
                              } else {
                                setSelectedStudents(selectedStudents.filter((id: string) => id !== student.id));
                              }
                            }}
                            data-testid={`checkbox-student-${student.id}`}
                          />
                          <div className="flex-1">
                            <div className="text-foreground font-medium">{getDisplayName(student)}</div>
                            <div className="text-sm text-muted-foreground">{student.email}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => {
                                  if (student.isLocked) {
                                    unlockUserMutation.mutate(student.id);
                                  } else {
                                    lockUserMutation.mutate(student.id);
                                  }
                                }}
                                className={student.isLocked ? "text-destructive" : "text-muted-foreground"}
                                title={student.isLocked ? "Unlock user" : "Lock user"}
                                data-testid={`button-lock-grades-${student.id}`}
                              >
                                {student.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleResetPassword(student)}
                                className="text-warning"
                                title="Reset password"
                                data-testid={`button-reset-password-grades-${student.id}`}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleEditRoles(student)}
                                className="text-secondary"
                                title="Edit roles"
                                data-testid={`button-edit-roles-grades-${student.id}`}
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                            </div>
                            <Select 
                              value={assignedUnit?.id || 'no-grade'} 
                              onValueChange={(unitId) => {
                                if (unitId === 'no-grade') {
                                  if (assignment) {
                                    removeStudentAssignmentMutation.mutate(assignment.id);
                                  }
                                } else {
                                  assignStudentToGradeMutation.mutate({
                                    userId: student.id,
                                    unitId,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid={`select-grade-${student.id}`}>
                                <SelectValue placeholder={`Select ${terminologyLowerResolved.unit}`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no-grade">No {terminologyLowerResolved.unit}</SelectItem>
                                {units.map((unit: any) => (
                                  <SelectItem key={unit.id} value={unit.id}>
                                    {unit.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {assignedUnit && (
                              <Select 
                                value={assignedSubUnit?.id || 'no-class'} 
                                onValueChange={(subUnitId) => {
                                  assignStudentToGradeMutation.mutate({
                                    userId: student.id,
                                    unitId: assignedUnit.id,
                                    subUnitId: subUnitId === 'no-class' ? undefined : subUnitId,
                                  });
                                }}
                              >
                                <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid={`select-class-${student.id}`}>
                                  <SelectValue placeholder={`Select ${terminologyLowerResolved.subUnit}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="no-class">No {terminologyLowerResolved.subUnit}</SelectItem>
                                  {subUnits.filter((su: any) => su.unitId === assignedUnit.id).map((subUnit: any) => (
                                    <SelectItem key={subUnit.id} value={subUnit.id}>
                                      {subUnit.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No {terminologyLowerResolved.learnerPlural} found in this context
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ${terminologyResolved.subjectPlural} Tab */}
            <TabsContent value="subjects" className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="text-foreground">{terminologyResolved.subjectPlural}</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {filteredSubjects.length} {filteredSubjects.length === 1 ? terminologyLowerResolved.subject : terminologyLowerResolved.subjectPlural} in this context
                      </CardDescription>
                    </div>
                    <Button onClick={() => setCreateSubjectDialog(true)}
                      className="bg-primary hover:bg-primary/90 text-btn-primary-foreground w-full sm:w-auto"
                      data-testid="button-create-subject"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create {terminologyResolved.subject}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(() => {
                      // Debug: Check for duplicate keys before rendering
                      const ids = filteredSubjects.map((s: any) => s.id);
                      const uniqueIds = new Set(ids);
                      if (ids.length !== uniqueIds.size) {
                        console.error('[UnifiedManagementHub] DUPLICATE KEYS IN filteredSubjects:', 
                          ids.filter((id, index) => ids.indexOf(id) !== index),
                          'Full array:', filteredSubjects.map((s: any) => ({ id: s.id, name: s.name }))
                        );
                      }
                      return filteredSubjects;
                    })().map((subject: any) => {
                      // Get all grades this subject is assigned to
                      const assignedGrades = unitSubjectAssignments.filter((usa: any) => usa.subjectId === subject.id);
                      
                      return (
                      <div key={subject.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-muted rounded-lg" data-testid={`subject-row-${subject.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-foreground font-medium">{subject.name}</div>
                          <div className="text-sm text-muted-foreground">{subject.description || 'No description'}</div>
                          {assignedGrades.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {assignedGrades.map((assignment: any) => (
                                <Badge key={assignment.id} className="border" >
                                  {assignment.unitName || units.find((u: any) => u.id === assignment.unitId)?.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Select 
                            value={subjectToAssign === subject.id ? assignToUnit : ''}
                            onValueChange={(unitId) => {
                              if (unitId) {
                                setSubjectToAssign(subject.id);
                                setAssignToUnit(unitId);
                                assignSubjectToUnitMutation.mutate({ unitId, subjectId: subject.id });
                              }
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-[180px] bg-muted border-border text-foreground" data-testid={`select-assign-grade-${subject.id}`}>
                              <SelectValue placeholder={`Assign to ${terminologyLowerResolved.unit}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit: any) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="sm" onClick={() => handleEditSubject(subject)}
                            data-testid={`button-edit-subject-${subject.id}`}
                          >
                            <Edit className="h-4 w-4 text-secondary" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                              if (confirm(`Are you sure you want to delete this ${terminologyLowerResolved.subject}?`)) {
                                deleteSubjectMutation.mutate(subject.id);
                              }
                            }}
                            data-testid={`button-delete-subject-${subject.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      )
                    })}
                    {filteredSubjects.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No {terminologyLowerResolved.subjectPlural} found in this context. {subjects.length === 0 ? 'Create one to get started.' : 'Try changing your filters.'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        )}

        {/* Assign learners dialog */}
        <Dialog open={assignStudentDialog} onOpenChange={setAssignStudentDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md lg:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign {terminologyResolved.learnerPlural} to Context</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Select {terminologyLowerResolved.learnerPlural} to assign to {getBreadcrumb().join(' > ')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {students.map((student: any) => (
                <div key={student.id} className="flex items-center space-x-3 p-2 hover:bg-muted rounded" data-testid={`assign-student-${student.id}`}>
                  <Checkbox
                    checked={selectedStudents.includes(student.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedStudents([...selectedStudents, student.id]);
                      } else {
                        setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-foreground">{getDisplayName(student)}</div>
                    <div className="text-sm text-muted-foreground">{student.email}</div>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignStudentDialog(false)} data-testid="button-cancel-assign-students">
                Cancel
              </Button>
              <Button onClick={() => assignStudentsMutation.mutate()}
                disabled={selectedStudents.length === 0 || assignStudentsMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                data-testid="button-confirm-assign-students"
              >
                Assign {selectedStudents.length} {selectedStudents.length !== 1 ? terminologyResolved.learnerPlural : terminologyResolved.learner}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Quiz Dialog */}
        <Dialog open={assignQuizDialog} onOpenChange={setAssignQuizDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Quiz</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Assign a quiz to {getBreadcrumb().join(' > ')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Quiz</Label>
                <Select value={selectedQuiz} onValueChange={setSelectedQuiz}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-quiz-to-assign">
                    <SelectValue placeholder="Choose a quiz" />
                  </SelectTrigger>
                  <SelectContent>
                    {quizzes.map((quiz: any) => (
                      <SelectItem key={quiz.id} value={quiz.id}>
                        {quiz.name} ({quiz.totalCards} questions)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignQuizDialog(false)} data-testid="button-cancel-assign-quiz">
                Cancel
              </Button>
              <Button onClick={() => assignQuizMutation.mutate()}
                disabled={!selectedQuiz || assignQuizMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                data-testid="button-confirm-assign-quiz"
              >
                Assign Quiz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create ${terminologyResolved.subject} Dialog */}
        <Dialog open={createSubjectDialog} onOpenChange={setCreateSubjectDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New {terminologyResolved.subject}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Add a new {terminologyLowerResolved.subject} like Math, Science, History, etc.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject-name">{terminologyResolved.subject} Name *</Label>
                <Input
                  id="subject-name"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="e.g., Mathematics, Science, History"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-subject-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject-description">Description</Label>
                <Input
                  id="subject-description"
                  value={subjectDescription}
                  onChange={(e) => setSubjectDescription(e.target.value)}
                  placeholder={`Optional description for this ${terminologyLowerResolved.subject}`}
                  className="bg-muted border-border text-foreground"
                  data-testid="input-subject-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject-assign-unit">Assign to {terminologyResolved.unit} (Optional)</Label>
                <Select value={subjectAssignUnit || 'no-assign'} onValueChange={(val) => setSubjectAssignUnit(val === 'no-assign' ? '' : val)}>
                  <SelectTrigger id="subject-assign-unit" className="bg-muted border-border text-foreground" data-testid="select-subject-assign-unit">
                    <SelectValue placeholder={`Assign to ${terminologyLowerResolved.unit} (optional)`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-assign">No {terminologyLowerResolved.unit}</SelectItem>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateSubjectDialog(false)} data-testid="button-cancel-subject">
                Cancel
              </Button>
              <Button onClick={handleCreateSubject} disabled={createSubjectMutation.isPending} data-testid="button-save-subject" >
                {createSubjectMutation.isPending ? 'Creating...' : `Create ${terminologyResolved.subject}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit ${terminologyResolved.subject} Dialog */}
        <Dialog open={editSubjectDialog} onOpenChange={(open) => {
          setEditSubjectDialog(open);
          if (!open) {
            setEditingSubject(null);
            setSubjectName('');
            setSubjectDescription('');
          }
        }}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {terminologyResolved.subject}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Update the {terminologyLowerResolved.subject} details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-subject-name">{terminologyResolved.subject} Name *</Label>
                <Input
                  id="edit-subject-name"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="e.g., Mathematics, Science, History"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-subject-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-subject-description">Description</Label>
                <Input
                  id="edit-subject-description"
                  value={subjectDescription}
                  onChange={(e) => setSubjectDescription(e.target.value)}
                  placeholder={`Optional description for this ${terminologyLowerResolved.subject}`}
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-subject-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditSubjectDialog(false)} data-testid="button-cancel-edit-subject">
                Cancel
              </Button>
              <Button onClick={handleUpdateSubject} disabled={updateSubjectMutation.isPending} data-testid="button-update-subject" >
                {updateSubjectMutation.isPending ? 'Updating...' : `Update ${terminologyResolved.subject}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign ${terminologyResolved.subject} to ${terminologyResolved.unit} Dialog */}
        <Dialog open={assignSubjectDialog} onOpenChange={setAssignSubjectDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign {terminologyResolved.subject} to {terminologyResolved.unit}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Assign a {terminologyLowerResolved.subject} to a specific {terminologyLowerResolved.unit}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assign-subject">{terminologyResolved.subject} *</Label>
                <Select value={subjectToAssign} onValueChange={setSubjectToAssign}>
                  <SelectTrigger id="assign-subject" className="bg-muted border-border text-foreground" data-testid="select-assign-subject">
                    <SelectValue placeholder={`Select ${terminologyLowerResolved.subject}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject: any) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-to-unit">{terminologyResolved.unit} *</Label>
                <Select value={assignToUnit} onValueChange={setAssignToUnit}>
                  <SelectTrigger id="assign-to-unit" className="bg-muted border-border text-foreground" data-testid="select-assign-to-unit">
                    <SelectValue placeholder={`Select ${terminologyLowerResolved.unit}`} />
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignSubjectDialog(false)} data-testid="button-cancel-assign-subject">
                Cancel
              </Button>
              <Button onClick={handleAssignSubject} disabled={!subjectToAssign || !assignToUnit || assignSubjectToUnitMutation.isPending} data-testid="button-save-assign-subject" >
                {assignSubjectToUnitMutation.isPending ? 'Assigning...' : `Assign ${terminologyResolved.subject}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign learner to unit dialog */}
        <Dialog open={assignToGradeDialog} onOpenChange={setAssignToGradeDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign {terminologyResolved.learner} to {terminologyResolved.unit}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Assign a {terminologyLowerResolved.learner} to a specific {terminologyLowerResolved.unit} and optionally a {terminologyLowerResolved.subUnit}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student-to-assign">{terminologyResolved.learner} *</Label>
                <Select value={selectedStudentForGrade} onValueChange={setSelectedStudentForGrade}>
                  <SelectTrigger id="student-to-assign" className="bg-muted border-border text-foreground" data-testid="select-student-for-grade">
                    <SelectValue placeholder={`Select ${terminologyLowerResolved.learner}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student: any) => (
                      <SelectItem key={student.id} value={student.id}>
                        {getDisplayName(student)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade-unit">{terminologyResolved.unit} *</Label>
                <Select value={assignGradeUnit} onValueChange={(val) => {
                  setAssignGradeUnit(val);
                  setAssignGradeSubUnit('');
                }}>
                  <SelectTrigger id="grade-unit" className="bg-muted border-border text-foreground" data-testid="select-grade-unit">
                    <SelectValue placeholder={`Select ${terminologyLowerResolved.unit}`} />
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
              {assignGradeUnit && (
                <div className="space-y-2">
                  <Label htmlFor="grade-subunit">{terminologyResolved.subUnit} (Optional)</Label>
                  <Select value={assignGradeSubUnit || 'no-subunit'} onValueChange={(val) => setAssignGradeSubUnit(val === 'no-subunit' ? '' : val)}>
                    <SelectTrigger id="grade-subunit" className="bg-muted border-border text-foreground" data-testid="select-grade-subunit">
                      <SelectValue placeholder={`Select ${terminologyLowerResolved.subUnit} (optional)`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-subunit">None</SelectItem>
                      {subUnits.filter((su: any) => su.unitId === assignGradeUnit).map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id}>
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignToGradeDialog(false)} data-testid="button-cancel-assign-to-grade">
                Cancel
              </Button>
              <Button onClick={handleAssignStudentToGrade} disabled={!selectedStudentForGrade || !assignGradeUnit || assignStudentToGradeMutation.isPending} data-testid="button-save-assign-to-grade" >
                {assignStudentToGradeMutation.isPending ? 'Assigning...' : `Assign to ${terminologyResolved.unit}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage ${terminologyResolved.learner} ${terminologyResolved.subjectPlural} Dialog */}
        <Dialog open={manageSubjectsDialog} onOpenChange={(open) => {
          setManageSubjectsDialog(open);
          if (!open) {
            setSelectedStudentForSubjects(null);
            setStudentSubjectAssignments([]);
          }
        }}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Manage {terminologyResolved.learner} {terminologyResolved.subjectPlural}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {selectedStudentForSubjects && `Managing ${terminologyLowerResolved.subjectPlural} for ${getDisplayName(selectedStudentForSubjects)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Available {terminologyResolved.subjectPlural} {selectedStudentForSubjects && (() => {
                  const assignment = studentAssignments.find((a: any) => a.userId === selectedStudentForSubjects.id);
                  const assignedUnit = assignment ? units.find((u: any) => u.id === assignment.unitId) : null;
                  return assignedUnit ? `(${assignedUnit.name})` : '';
                })()}</Label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {(() => {
                    // Filter subjects to only show those for the student's grade
                    const assignment = selectedStudentForSubjects 
                      ? studentAssignments.find((a: any) => a.userId === selectedStudentForSubjects.id)
                      : null;
                    
                    // Get subject IDs that are assigned to the student's grade
                    const subjectIdsForGrade = assignment
                      ? new Set(
                          unitSubjectAssignments
                            .filter((usa: any) => usa.unitId === assignment.unitId)
                            .map((usa: any) => usa.subjectId)
                        )
                      : new Set();
                    
                    const filteredSubjects = assignment
                      ? Array.from(
                          new Map(
                            subjects
                              .filter((subject: any) => subjectIdsForGrade.has(subject.id))
                              .map((subject: any) => [subject.id, subject])
                          ).values()
                        )
                      : [];
                    
                    if (filteredSubjects.length === 0 && assignment) {
                      return (
                        <p className="text-sm text-muted-foreground">No {terminologyLowerResolved.subjectPlural} available for this {terminologyLowerResolved.learner}'s {terminologyLowerResolved.unit}. Create {terminologyLowerResolved.subjectPlural} in the {terminologyResolved.subjectPlural} tab first.</p>
                      );
                    }
                    
                    if (!assignment) {
                      return (
                        <p className="text-sm text-muted-foreground">{terminologyResolved.learner} must be assigned to a {terminologyLowerResolved.unit} first.</p>
                      );
                    }
                    
                    return filteredSubjects.map((subject: any) => (
                      <label
                        key={subject.id}
                        className="flex items-center space-x-3 p-2 rounded-lg border border-border bg-muted hover:bg-accent cursor-pointer transition-colors"
                        data-testid={`label-manage-subject-${subject.id}`}
                      >
                        <Checkbox
                          checked={studentSubjectAssignments.includes(subject.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setStudentSubjectAssignments([...studentSubjectAssignments, subject.id]);
                            } else {
                              setStudentSubjectAssignments(studentSubjectAssignments.filter(id => id !== subject.id));
                            }
                          }}
                          data-testid={`checkbox-manage-subject-${subject.id}`}
                        />
                        <span className="text-foreground">{subject.name}</span>
                      </label>
                    ));
                  })()}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManageSubjectsDialog(false)} data-testid="button-cancel-manage-subjects">
                Cancel
              </Button>
              <Button onClick={() => {
                  if (!selectedStudentForSubjects) return;
                  
                  // Get student's assignment info
                  const assignment = studentAssignments.find((a: any) => a.userId === selectedStudentForSubjects.id);
                  if (!assignment) {
                    toast({ title: `Cannot update ${terminologyLowerResolved.subjectPlural}: ${terminologyResolved.learner} must be assigned to a ${terminologyLowerResolved.unit} first`, variant: 'destructive' });
                    return;
                  }
                  
                  updateStudentSubjectsMutation.mutate({
                    userId: selectedStudentForSubjects.id,
                    subjectIds: studentSubjectAssignments,
                    organizationId: selectedOrg,
                    unitId: assignment.unitId,
                    subUnitId: assignment.subUnitId
                  });
                }}
                disabled={updateStudentSubjectsMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                data-testid="button-save-manage-subjects"
              >
                {updateStudentSubjectsMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Quiz Collection Dialog */}
        <Dialog open={createQuizDialog} onOpenChange={setCreateQuizDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Quiz Collection</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Create a new quiz collection for your organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quiz-name">Name *</Label>
                <Input
                  id="quiz-name"
                  value={quizName}
                  onChange={(e) => setQuizName(e.target.value)}
                  placeholder="Enter quiz collection name"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-quiz-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-description">Description</Label>
                <Input
                  id="quiz-description"
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                  placeholder="Enter quiz description (optional)"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-quiz-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-difficulty">Difficulty</Label>
                <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                  <SelectTrigger id="quiz-difficulty" className="bg-muted border-border text-foreground" data-testid="select-quiz-difficulty">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-subject">{terminologyResolved.subject} (Optional)</Label>
                <Select value={quizSubject || 'no-subject'} onValueChange={(val) => setQuizSubject(val === 'no-subject' ? '' : val)}>
                  <SelectTrigger id="quiz-subject" className="bg-muted border-border text-foreground" data-testid="select-quiz-subject">
                    <SelectValue placeholder={`Select ${terminologyLowerResolved.subject} (optional)`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-subject">None</SelectItem>
                    {subjects.map((subject: any) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-unit">{terminologyResolved.unit} (Optional)</Label>
                <Select value={quizUnit || 'no-unit'} onValueChange={(val) => setQuizUnit(val === 'no-unit' ? '' : val)}>
                  <SelectTrigger id="quiz-unit" className="bg-muted border-border text-foreground" data-testid="select-quiz-unit">
                    <SelectValue placeholder={`Select ${terminologyLowerResolved.unit} (optional)`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-unit">None</SelectItem>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-pass-percentage">Required Pass Percentage</Label>
                <Input
                  id="quiz-pass-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={quizPassPercentage}
                  onChange={(e) => setQuizPassPercentage(Number(e.target.value))}
                  placeholder="70"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-quiz-pass-percentage"
                />
                <p className="text-sm text-muted-foreground">
                  Minimum percentage required to pass this quiz (0-100)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateQuizDialog(false)} data-testid="button-cancel-create-quiz">
                Cancel
              </Button>
              <Button onClick={handleCreateQuiz} disabled={!quizName || createQuizMutation.isPending} data-testid="button-save-create-quiz" >
                {createQuizMutation.isPending ? 'Creating...' : 'Create Quiz'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Quiz Collection Dialog */}
        <Dialog open={editQuizDialog} onOpenChange={setEditQuizDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Quiz Collection</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Update quiz collection details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-quiz-name">Name *</Label>
                <Input
                  id="edit-quiz-name"
                  value={quizName}
                  onChange={(e) => setQuizName(e.target.value)}
                  placeholder="Enter quiz collection name"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-quiz-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-quiz-description">Description</Label>
                <Input
                  id="edit-quiz-description"
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                  placeholder="Enter quiz description (optional)"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-quiz-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-quiz-difficulty">Difficulty</Label>
                <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                  <SelectTrigger id="edit-quiz-difficulty" className="bg-muted border-border text-foreground" data-testid="select-edit-quiz-difficulty">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-quiz-pass-percentage">Required Pass Percentage</Label>
                <Input
                  id="edit-quiz-pass-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={quizPassPercentage}
                  onChange={(e) => setQuizPassPercentage(Number(e.target.value))}
                  placeholder="70"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-quiz-pass-percentage"
                />
                <p className="text-sm text-muted-foreground">
                  Minimum percentage required to pass this quiz (0-100)
                </p>
              </div>
              <div className="flex items-center justify-between space-x-2 p-3 bg-muted rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-quiz-public" className="text-foreground">Public Quiz</Label>
                  <p className="text-sm text-muted-foreground">
                    Make this quiz available to all users, not just your organization
                  </p>
                </div>
                <Switch
                  id="edit-quiz-public"
                  checked={quizIsPublic}
                  onCheckedChange={setQuizIsPublic}
                  data-testid="switch-edit-quiz-public"
                />
              </div>
              <div className="flex items-center justify-between space-x-2 p-3 bg-muted rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-quiz-active" className="text-foreground">Active Quiz</Label>
                  <p className="text-sm text-muted-foreground">
                    Make this quiz visible and accessible to {terminologyLowerResolved.learnerPlural}
                  </p>
                </div>
                <Switch
                  id="edit-quiz-active"
                  checked={quizIsActive}
                  onCheckedChange={setQuizIsActive}
                  data-testid="switch-edit-quiz-active"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditQuizDialog(false)} data-testid="button-cancel-edit-quiz">
                Cancel
              </Button>
              <Button onClick={handleUpdateQuiz} disabled={!quizName || updateQuizMutation.isPending} data-testid="button-save-edit-quiz" >
                {updateQuizMutation.isPending ? 'Updating...' : 'Update Quiz'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Reset the password for {selectedUserForActions ? getDisplayName(selectedUserForActions) : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password *</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-new-password"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetPasswordDialog(false)} data-testid="button-cancel-reset-password">
                Cancel
              </Button>
              <Button onClick={() => {
                  if (selectedUserForActions && newPassword) {
                    resetPasswordMutation.mutate({ userId: selectedUserForActions.id, newPassword });
                  }
                }}
                disabled={!newPassword || resetPasswordMutation.isPending}
                className="bg-warning hover:bg-warning/90 text-warning-foreground"
                data-testid="button-save-reset-password"
              >
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Roles Dialog */}
        <Dialog open={rolesDialog} onOpenChange={setRolesDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit User Roles</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Manage organization roles for {selectedUserForActions ? getDisplayName(selectedUserForActions) : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Organization Roles */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Organization Roles</h3>
                {selectedOrg && organizations.filter((org: any) => org.id === selectedOrg).map((org: any) => (
                  <div key={org.id} className="p-4 bg-muted rounded-lg space-y-3">
                    <h4 className="font-medium text-primary">{org.name}</h4>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`org-admin-${org.id}`}
                          checked={organizationRoles[org.id]?.includes('org_admin') || false}
                          onCheckedChange={(checked) => handleOrgRoleToggle(org.id, 'org_admin', checked as boolean)}
                          data-testid={`checkbox-org-admin-${org.id}`}
                        />
                        <Label htmlFor={`org-admin-${org.id}`} className="text-foreground cursor-pointer">
                          Organization Admin
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`teacher-${org.id}`}
                          checked={organizationRoles[org.id]?.includes('teacher') || false}
                          onCheckedChange={(checked) => handleOrgRoleToggle(org.id, 'teacher', checked as boolean)}
                          data-testid={`checkbox-teacher-${org.id}`}
                        />
                        <Label htmlFor={`teacher-${org.id}`} className="text-foreground cursor-pointer">
                          {terminologyResolved.educator}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`student-${org.id}`}
                          checked={organizationRoles[org.id]?.includes('student') || false}
                          onCheckedChange={(checked) => handleOrgRoleToggle(org.id, 'student', checked as boolean)}
                          data-testid={`checkbox-student-${org.id}`}
                        />
                        <Label htmlFor={`student-${org.id}`} className="text-foreground cursor-pointer">
                          {terminologyResolved.learner} / Employee
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRolesDialog(false)} data-testid="button-cancel-edit-roles">
                Cancel
              </Button>
              <Button onClick={handleSaveRoles} disabled={updateRolesMutation.isPending} data-testid="button-save-roles" >
                {updateRolesMutation.isPending ? 'Saving...' : 'Save Roles'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Set Availability Dialog */}
        <Dialog open={availabilityDialog} onOpenChange={setAvailabilityDialog}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Set Quiz Availability</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Define the time window when {terminologyLowerResolved.learnerPlural} can access this quiz
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Available From</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={availableFromDate}
                    onChange={(e) => setAvailableFromDate(e.target.value)}
                    className="bg-muted border-border text-foreground"
                    data-testid="input-available-from-date"
                  />
                  <Input
                    type="time"
                    value={availableFromTime}
                    onChange={(e) => setAvailableFromTime(e.target.value)}
                    className="bg-muted border-border text-foreground"
                    data-testid="input-available-from-time"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Available To</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={availableToDate}
                    onChange={(e) => setAvailableToDate(e.target.value)}
                    className="bg-muted border-border text-foreground"
                    data-testid="input-available-to-date"
                  />
                  <Input
                    type="time"
                    value={availableToTime}
                    onChange={(e) => setAvailableToTime(e.target.value)}
                    className="bg-muted border-border text-foreground"
                    data-testid="input-available-to-time"
                  />
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Leave fields empty to make the quiz available at any time. Set both dates to create a specific window.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleSetAlwaysAvailable} className="mr-auto" data-testid="button-set-always-available" >
                Set Always Available
              </Button>
              <Button variant="outline" onClick={() => setAvailabilityDialog(false)} data-testid="button-cancel-availability">
                Cancel
              </Button>
              <Button onClick={handleSaveAvailability} disabled={updateAssignmentAvailabilityMutation.isPending} data-testid="button-save-availability" >
                {updateAssignmentAvailabilityMutation.isPending ? 'Saving...' : 'Save Availability'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assignment Wizard */}
        <AssignmentWizard
          open={assignmentWizardOpen}
          onOpenChange={setAssignmentWizardOpen}
          organizationId={selectedOrg}
          initialUnitId={selectedUnit}
          initialSubjectId={selectedSubject}
        />

        {/* Lesson Assignment Wizard */}
        <LessonAssignmentWizard
          open={lessonAssignDialog}
          onOpenChange={setLessonAssignDialog}
          organizationId={selectedOrg}
          initialUnitId={selectedUnit}
          initialSubjectId={selectedSubject}
        />
      </div>
    </QuizAdminLayout>
  );
}
