import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { BookOpen, Plus, FileText, Eye, Archive, Clock, Star, MoreVertical, Trash2, Power, PowerOff, Globe, Lock, FileEdit, CheckCircle, PauseCircle, Send, XCircle, Pencil, History, Search, FileArchive, FileUp, UserCheck } from 'lucide-react';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaginatedList } from '@/components/PaginatedList';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { CourseTransferDialog } from '@/components/course/CourseTransferDialog';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

type Course = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  difficultyLevel: string | null;
  currency: string;
  price: string;
  thumbnailUrl: string | null;
  thumbnailSignedUrl?: string;
  status: 'active' | 'inactive' | 'archived' | 'draft';
  visibility: 'public' | 'org_only';
  averageRating: string | null;
  totalRatings: number | null;
  createdAt: Date;
  hasPurchases: boolean;
  purchaseCount: number;
};

type CourseCounts = {
  active: number;
  inactive: number;
  archived: number;
  draft: number;
};

type CourseDraft = {
  id: string;
  generatedTitle?: string | null;
  suggestedTitle?: string | null;
  currentStep: string;
  createdAt: string;
  documents?: { id: string; fileName: string }[];
};

type VersioningDraft = {
  id: string;
  originalCourseId: string;
  title: string;
  description?: string | null;
  createdAt: string;
  originalCourseTitle: string;
  originalCourseStatus: string;
};

export default function CourseBuilder() {
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'archived' | 'draft'>('draft');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'org_only'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const { toast } = useToast();
  const { courseVisibilityEnabled, effectiveOrganizationId: orgId } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    unitPlural: 'Departments',
    subUnitPlural: 'Units',
    teamPlural: 'Teams',
  };
  const { formatPrice } = useCurrencyPreference();
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState(20);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [courseToExport, setCourseToExport] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: hierarchyData } = useQuery<{ hierarchy: any[] }>({
    queryKey: ['/api/organization/hierarchy', orgId],
    queryFn: async () => {
      const res = await fetch(`/api/organization/hierarchy/${orgId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch hierarchy');
      return res.json();
    },
    enabled: !!orgId,
  });

  const departments = hierarchyData?.hierarchy || [];
  const selectedDepartment = departments.find((d: any) => d.id === departmentFilter);
  const units = selectedDepartment?.children || [];
  const selectedUnit = units.find((u: any) => u.id === unitFilter);
  const teams = selectedUnit?.children || [];

  useEffect(() => { setUnitFilter('all'); setTeamFilter('all'); }, [departmentFilter]);
  useEffect(() => { setTeamFilter('all'); }, [unitFilter]);

  // Fetch course counts for tab badges
  const { data: counts } = useQuery<CourseCounts>({
    queryKey: ['/api/courses/counts', orgId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orgId) {
        params.set('organizationId', orgId);
      }
      const response = await fetch(`/api/courses/counts?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load course counts');
      }
      return response.json();
    },
    enabled: !!orgId,
  });

  // Fetch draft status for all courses
  const { data: courseDrafts } = useQuery<Record<string, { hasDraft: boolean; draft: any }>>({
    queryKey: ['/api/courses/drafts-status', orgId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orgId) {
        params.set('organizationId', orgId);
      }
      const response = await fetch(`/api/courses/drafts-status?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load draft status');
      }
      return response.json();
    },
    enabled: !!orgId,
  });

  // Fetch course creation drafts (from wizard)
  const { data: wizardDrafts } = useQuery<{ items: CourseDraft[] }>({
    queryKey: ['/api/courses/drafts'],
  });

  const { data, isLoading } = useQuery<{ courses: Course[]; total: number }>({
    queryKey: ['/api/courses', currentPage, statusFilter, visibilityFilter, debouncedSearch, departmentFilter, unitFilter, teamFilter, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', pageSize.toString());
      params.set('offset', ((currentPage - 1) * pageSize).toString());
      params.set('status', statusFilter);
      if (visibilityFilter !== 'all') {
        params.set('visibility', visibilityFilter);
      }
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      if (departmentFilter && departmentFilter !== 'all') params.set('departmentId', departmentFilter);
      if (unitFilter && unitFilter !== 'all') params.set('unitId', unitFilter);
      if (teamFilter && teamFilter !== 'all') params.set('teamId', teamFilter);
      
      const response = await fetch(`/api/courses?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load courses');
      return response.json();
    },
  });

  // Status change mutation with validation for 'active' status
  const changeStatusMutation = useMutation({
    mutationFn: async ({ courseId, status }: { courseId: string; status: string }) => {
      // For 'active' status, validate first
      if (status === 'active') {
        const validation = await apiRequest(`/api/courses/${courseId}/validate-publish`);
        if (!validation.isValid) {
          throw new Error(validation.errors?.join(', ') || 'Course does not meet requirements for activation');
        }
      }
      return apiRequest(`/api/courses/${courseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, organizationId: orgId }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Course status updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts', orgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/courses'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (courseId: string) => {
      return apiRequest(`/api/courses/${courseId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts', orgId] });
      setDeleteDialogOpen(false);
      setCourseToDelete(null);
      toast({
        title: 'Course deleted',
        description: 'The course has been moved to archive. You can restore it from the Archived tab if needed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete course.',
        variant: 'destructive',
      });
    },
  });

  // Publish draft mutation
  const publishDraftMutation = useMutation({
    mutationFn: async (courseId: string) => {
      return apiRequest(`/api/courses/${courseId}/publish-draft`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: 'Draft published successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts', orgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts-status', orgId] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to publish draft', description: error.message, variant: 'destructive' });
    },
  });

  // Discard draft mutation
  const discardDraftMutation = useMutation({
    mutationFn: async (courseId: string) => {
      return apiRequest(`/api/courses/${courseId}/draft`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Draft discarded' });
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts', orgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts-status', orgId] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to discard draft', description: error.message, variant: 'destructive' });
    },
  });

  // Create draft mutation (for active courses that need editing)
  const createDraftMutation = useMutation({
    mutationFn: async (courseId: string) => {
      return apiRequest(`/api/courses/${courseId}/create-draft`, { method: 'POST' });
    },
    onSuccess: (_, courseId) => {
      toast({ title: 'Draft created', description: 'You can now safely edit the course without affecting the live version.' });
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts-status', orgId] });
      setLocation(`/course-builder/${courseId}/edit?draft=true`);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create draft', description: error.message, variant: 'destructive' });
    },
  });

  const handleStatusChange = (courseId: string, newStatus: string) => {
    changeStatusMutation.mutate({ courseId, status: newStatus });
  };

  const handleCreateDraft = (courseId: string) => {
    createDraftMutation.mutate(courseId);
  };

  const handlePublishDraft = (courseId: string) => {
    publishDraftMutation.mutate(courseId);
  };

  const handleDiscardDraft = (courseId: string) => {
    discardDraftMutation.mutate(courseId);
  };

  const handleDeleteClick = (course: Course) => {
    setCourseToDelete(course);
    setDeleteDialogOpen(true);
  };

  const handleOpenExportDialog = (course: Course) => {
    setCourseToExport({ id: course.id, title: course.title });
    setExportDialogOpen(true);
  };

  const confirmDelete = () => {
    if (courseToDelete) {
      deleteMutation.mutate(courseToDelete.id);
    }
  };

  const courseIds = data?.courses?.map(c => c.id) || [];
  const { data: courseLanguagesMap } = useQuery<Record<string, { languages: Array<{ code: string; name: string; courseId: string }> }>>({
    queryKey: ['/api/courses/batch-languages', courseIds.join(',')],
    queryFn: async () => {
      if (courseIds.length === 0) return {};
      const response = await fetch('/api/courses/batch-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds }),
        credentials: 'include',
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: courseIds.length > 0,
    staleTime: 60000,
  });

  const courses = data?.courses || [];
  const total = data?.total || 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'inactive':
        return <Badge variant="outline">Inactive</Badge>;
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>;
      case 'draft':
        return <Badge variant="warning">Draft</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const renderCourseCard = (course: Course, index: number) => {
    const isPaid = parseFloat(course.price || '0') > 0;
    const rating = parseFloat(course.averageRating || '0');
    const hasDraft = courseDrafts?.[course.id]?.hasDraft || false;
    
    return (
      <Card
        key={course.id}
        className={`flex flex-col bg-card border-border hover:border-border hover:shadow-elevated transition-all duration-200 dark:hover:shadow-primary/20 ${hasDraft ? 'border-l-4 border-l-amber-500' : ''}`}
        data-testid={`course-builder-card-${course.id}`}
      >
        {(course.thumbnailSignedUrl || course.thumbnailUrl) ? (
          <div className="relative w-full aspect-video overflow-hidden rounded-t-lg bg-card/50">
            <img
              src={course.thumbnailSignedUrl || course.thumbnailUrl || ''}
              alt={course.title}
              className="absolute inset-0 h-full w-full object-cover"
              data-testid={`course-builder-image-${course.id}`}
            />
          </div>
        ) : (
          <div className="relative w-full aspect-video bg-surface-raised rounded-t-lg flex items-center justify-center">
            <BookOpen className="h-16 w-16 text-primary/40" />
          </div>
        )}

        <CardHeader className="flex-1 p-[var(--card-padding)]">
          <div className="flex items-start justify-between gap-[var(--space-sm)] mb-[var(--space-sm)]">
            <CardTitle 
              className="line-clamp-2" 
              style={{ fontSize: 'var(--text-lg)' }}
              data-testid={`course-builder-title-${course.id}`}
            >
              {course.title}
            </CardTitle>
            <div className="flex flex-col gap-1 items-end">
              {getStatusBadge(course.status)}
              {hasDraft && (
                <Badge variant="warning" data-testid={`badge-draft-in-progress-${course.id}`} >
                  <Pencil className="h-3 w-3 mr-1" />
                  Draft in progress
                </Badge>
              )}
            </div>
          </div>
          <CardDescription className="line-clamp-2 text-[length:var(--text-sm)]">
            {course.description || 'No description'}
          </CardDescription>

          <div className="flex items-center gap-[var(--space-md)] text-[length:var(--text-sm)] text-muted-foreground pt-[var(--space-sm)]">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-warning text-warning" />
              <span data-testid={`course-builder-rating-${course.id}`}>
                {rating.toFixed(1)} ({course.totalRatings || 0})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-[var(--space-sm)] pt-[var(--space-sm)] flex-wrap">
            {course.difficultyLevel && (
              <Badge variant="outline">{course.difficultyLevel}</Badge>
            )}
            <Badge variant="outline">
              {isPaid ? formatPrice(course.price || '0', course.currency as 'ZAR' | 'USD' | 'EUR') : 'FREE'}
            </Badge>
            {courseVisibilityEnabled && (
              <Badge variant={course.visibility === 'public' ? 'success' : 'secondary'} data-testid={`badge-visibility-${course.id}`} >
                {course.visibility === 'public' ? (
                  <><Globe className="h-3 w-3 mr-1" /> Public</>
                ) : (
                  <><Lock className="h-3 w-3 mr-1" /> Org Only</>
                )}
              </Badge>
            )}
          </div>
          {courseLanguagesMap?.[course.id]?.languages && courseLanguagesMap[course.id].languages.length > 1 && (
            <div className="flex items-center gap-1 mt-1">
              {courseLanguagesMap[course.id].languages.map(lang => (
                <Badge key={lang.code} variant="outline" className="py-0 px-1.5">
                  {lang.code.toUpperCase()}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>

      <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-[var(--space-md)] border-t border-border gap-[var(--space-sm)] p-[var(--card-padding)]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
          {course.status === 'draft' ? (
            <Link href={`/course-builder/${course.id}/edit`} className="w-full sm:w-auto">
              <Button size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-edit-course-${course.id}`} >
                <FileText className="h-4 w-4 mr-1" />
                Continue Editing
              </Button>
            </Link>
          ) : hasDraft ? (
            <>
              <Link href={`/course-builder/${course.id}/edit?draft=true`} className="w-full sm:w-auto">
                <Button size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-edit-draft-${course.id}`} >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Draft
                </Button>
              </Link>
              <Link href={`/courses/${course.id}`} className="w-full sm:w-auto">
                <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-preview-course-${course.id}`} >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview Live
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href={`/courses/${course.id}`} className="w-full sm:w-auto">
                <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-preview-course-${course.id}`} >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
              </Link>
              {courseLanguagesMap?.[course.id]?.languages && courseLanguagesMap[course.id].languages.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-manage-course-${course.id}`} >
                      <Globe className="h-4 w-4 mr-1" />
                      Manage
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {courseLanguagesMap[course.id].languages.map(lang => (
                      <DropdownMenuItem
                        key={lang.courseId}
                        onClick={() => setLocation(`/course-builder/${lang.courseId}/lessons`)}
                      >
                        <span className="font-medium mr-2">{lang.code.toUpperCase()}</span>
                        {lang.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href={`/course-builder/${course.id}/edit`} className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-manage-course-${course.id}`} >
                    <FileText className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                </Link>
              )}
            </>
          )}
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] touch-manipulation self-end sm:self-auto" data-testid={`button-actions-${course.id}`} >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasDraft && (
              <>
                <DropdownMenuItem 
                  onClick={() => handlePublishDraft(course.id)}
                  disabled={publishDraftMutation.isPending}
                  data-testid={`action-publish-draft-${course.id}`}
                  className="text-success focus:text-success"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {publishDraftMutation.isPending ? 'Publishing...' : 'Publish Draft'}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleDiscardDraft(course.id)}
                  disabled={discardDraftMutation.isPending}
                  data-testid={`action-discard-draft-${course.id}`}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {discardDraftMutation.isPending ? 'Discarding...' : 'Discard Draft'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {!hasDraft && course.status === 'active' && (
              <DropdownMenuItem 
                onClick={() => handleCreateDraft(course.id)}
                disabled={createDraftMutation.isPending}
                data-testid={`action-create-draft-${course.id}`}
              >
                <Pencil className="h-4 w-4 mr-2 text-warning" />
                {createDraftMutation.isPending ? 'Creating Draft...' : 'Create Draft to Edit'}
              </DropdownMenuItem>
            )}
            {course.status !== 'draft' && !hasDraft && (
              <DropdownMenuItem 
                onClick={() => handleStatusChange(course.id, 'draft')}
                data-testid={`action-set-draft-${course.id}`}
              >
                <FileEdit className="h-4 w-4 mr-2" />
                Set to Draft
              </DropdownMenuItem>
            )}
            {course.status === 'active' && (
              <DropdownMenuItem
                onClick={() => setLocation(`/course-assignments?courseId=${course.id}&source=builder&view=publications`)}
                data-testid={`action-manage-publications-${course.id}`}
              >
                <UserCheck className="h-4 w-4 mr-2 text-primary" />
                Manage Publications
              </DropdownMenuItem>
            )}
            {course.status !== 'active' && (
              <DropdownMenuItem 
                onClick={() => handleStatusChange(course.id, 'active')}
                data-testid={`action-set-active-${course.id}`}
              >
                <CheckCircle className="h-4 w-4 mr-2 text-success" />
                Set to Active
              </DropdownMenuItem>
            )}
            {course.status !== 'inactive' && (
              <DropdownMenuItem 
                onClick={() => handleStatusChange(course.id, 'inactive')}
                data-testid={`action-set-inactive-${course.id}`}
              >
                <PauseCircle className="h-4 w-4 mr-2 text-warning" />
                Set to Inactive
              </DropdownMenuItem>
            )}
            {course.status !== 'archived' && (
              <DropdownMenuItem 
                onClick={() => handleStatusChange(course.id, 'archived')}
                data-testid={`action-set-archived-${course.id}`}
              >
                <Archive className="h-4 w-4 mr-2" />
                Set to Archived
              </DropdownMenuItem>
            )}
            {course.status !== 'archived' && !course.hasPurchases && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleOpenExportDialog(course)}
                  data-testid={`action-export-${course.id}`}
                >
                  <FileArchive className="h-4 w-4 mr-2" />
                  Export Course
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleDeleteClick(course)}
                  className="text-destructive focus:text-destructive"
                  data-testid={`action-delete-${course.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
            {course.status !== 'archived' && course.hasPurchases && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleOpenExportDialog(course)}
                  data-testid={`action-export-${course.id}`}
                >
                  <FileArchive className="h-4 w-4 mr-2" />
                  Export Course
                </DropdownMenuItem>
                <DropdownMenuItem 
                  disabled
                  className="text-muted-foreground opacity-50 cursor-not-allowed"
                  data-testid={`action-delete-disabled-${course.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({course.purchaseCount} purchases)
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
    );
  };

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col bg-card border-border">
          <Skeleton className="h-40 sm:h-48 w-full rounded-t-lg" />
          <CardHeader className="flex-1 p-[var(--card-padding)]">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-2/3 mb-4" />
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-4 border-t border-border gap-[var(--space-sm)] p-[var(--card-padding)]">
            <Skeleton className="h-11 w-full sm:w-28" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );

  return (
    <QuizAdminLayout
      title="Course Builder"
      description="Create and manage your e-learning courses"
    >
      <div className="max-w-7xl mx-auto p-[var(--container-padding)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] mb-[var(--space-xl)]">
          <Link href="/course-builder/from-documents">
            <Button size="lg" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-create-course" >
              <Plus className="h-5 w-5 mr-2" />
              Create New Course
            </Button>
          </Link>
          <Button variant="outline" size="lg" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setImportDialogOpen(true)}
            data-testid="button-import-course"
          >
            <FileUp className="h-5 w-5 mr-2" />
            Import Course
          </Button>
          {wizardDrafts?.items && wizardDrafts.items.length > 0 && (
            <Link href="/course-builder/from-documents">
              <Button variant="outline" size="lg" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-continue-draft" >
                <History className="h-5 w-5 mr-2" />
                Continue Draft ({wizardDrafts.items.length})
              </Button>
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-center mb-[var(--space-md)]">
          <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder={`All ${terminology.unitPlural}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {terminology.unitPlural}</SelectItem>
              {(departments || []).map((dept: any) => (
                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setCurrentPage(1); }} disabled={departmentFilter === 'all'}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder={`All ${terminology.subUnitPlural}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {terminology.subUnitPlural}</SelectItem>
              {(units || []).map((unit: any) => (
                <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setCurrentPage(1); }} disabled={unitFilter === 'all'}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder={`All ${terminology.teamPlural}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {terminology.teamPlural}</SelectItem>
              {(teams || []).map((team: any) => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-md)] mb-[var(--space-lg)]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 min-h-[44px]"
            />
          </div>
          <div className="w-full sm:w-auto">
            <label className="text-sm font-medium text-foreground block mb-2">Visibility</label>
            <Select value={visibilityFilter} onValueChange={(v: any) => { setVisibilityFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[200px] min-h-[44px] touch-manipulation">
                <SelectValue placeholder="Filter by visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visibility</SelectItem>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Public
                  </div>
                </SelectItem>
                <SelectItem value="org_only">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Org Only
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setCurrentPage(1); }} className="mb-[var(--space-lg)] w-full overflow-hidden">
          <TabsList className="flex flex-nowrap overflow-x-auto gap-1 h-auto p-1 w-full justify-start md:flex-wrap pb-2">
            <TabsTrigger 
              value="draft" 
              data-testid="tab-draft" 
              className="relative min-h-[44px] touch-manipulation px-3 sm:px-4 shrink-0"
            >
              <FileText className="h-4 w-4 mr-1 sm:mr-2" />
              <span>Drafts</span>
              {counts && counts.draft > 0 && (
                <Badge variant="warning" className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 sm:px-1.5 text-xs">
                  {counts.draft}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="active" 
              data-testid="tab-active" 
              className="relative min-h-[44px] touch-manipulation px-3 sm:px-4 shrink-0"
            >
              <BookOpen className="h-4 w-4 mr-1 sm:mr-2" />
              <span>Active</span>
              {counts && counts.active > 0 && (
                <Badge variant="success" className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 sm:px-1.5 text-xs">
                  {counts.active}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="inactive" 
              data-testid="tab-inactive" 
              className="relative min-h-[44px] touch-manipulation px-3 sm:px-4 shrink-0"
            >
              <Clock className="h-4 w-4 mr-1 sm:mr-2" />
              <span>Inactive</span>
              {counts && counts.inactive > 0 && (
                <Badge variant="secondary" className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 sm:px-1.5 text-xs">
                  {counts.inactive}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="archived" 
              data-testid="tab-archived" 
              className="relative min-h-[44px] touch-manipulation px-3 sm:px-4 shrink-0"
            >
              <Archive className="h-4 w-4 mr-1 sm:mr-2" />
              <span>Archived</span>
              {counts && counts.archived > 0 && (
                <Badge variant="default" className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 sm:px-1.5 text-xs">
                  {counts.archived}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Versioning Drafts Section - Show in Drafts tab */}
        {statusFilter === 'draft' && courseDrafts && Object.keys(courseDrafts).length > 0 && (
          <div className="mb-[var(--space-xl)]">
            <h3 className="text-lg font-semibold mb-[var(--space-md)] flex items-center gap-2">
              <Pencil className="h-5 w-5 text-warning" />
              Course Version Drafts
              <Badge variant="warning" className="ml-2">
                {Object.keys(courseDrafts).length}
              </Badge>
            </h3>
            <p className="text-muted-foreground text-sm mb-[var(--space-md)]">
              These are draft versions of active courses being edited without affecting the live version.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
              {Object.entries(courseDrafts).map(([courseId, { draft }]) => {
                const versioningDraft = draft as VersioningDraft;
                return (
                  <Card
                    key={versioningDraft.id}
                    className="flex flex-col bg-card border-2 border-[var(--warning)]/50 hover:border-[var(--warning)] hover:shadow-elevated transition-all duration-200"
                    data-testid={`versioning-draft-card-${versioningDraft.id}`}
                  >
                    <div className="relative w-full aspect-video bg-warning dark:from-warning/30 dark:to-warning/20 rounded-t-lg flex items-center justify-center">
                      <div className="flex flex-col items-center">
                        <Pencil className="h-12 w-12 text-warning/60 mb-2" />
                        <Badge variant="warning" >
                          Editing Active Course
                        </Badge>
                      </div>
                    </div>

                    <CardHeader className="flex-1 p-[var(--card-padding)]">
                      <div className="flex items-start justify-between gap-[var(--space-sm)] mb-[var(--space-sm)]">
                        <CardTitle 
                          className="line-clamp-2" 
                          style={{ fontSize: 'var(--text-lg)' }}
                        >
                          {versioningDraft.title}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-[length:var(--text-sm)] text-warning dark:text-warning">
                        <span className="font-medium">Editing:</span> {versioningDraft.originalCourseTitle}
                      </CardDescription>
                      <div className="flex items-center gap-[var(--space-sm)] pt-[var(--space-sm)] text-muted-foreground text-sm">
                        <Clock className="h-4 w-4" />
                        <span>Created {new Date(versioningDraft.createdAt).toLocaleDateString()}</span>
                      </div>
                    </CardHeader>

                    <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-[var(--space-md)] border-t border-[var(--warning)]/20 dark:border-[var(--warning)]/50 gap-[var(--space-sm)] p-[var(--card-padding)]">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
                        <Link href={`/course-builder/${versioningDraft.originalCourseId}/edit?draft=true`} className="w-full sm:w-auto">
                          <Button size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                            <Pencil className="h-4 w-4 mr-1" />
                            Continue Editing
                          </Button>
                        </Link>
                        <Link href={`/courses/${versioningDraft.originalCourseId}`} className="w-full sm:w-auto">
                          <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                            <Eye className="h-4 w-4 mr-1" />
                            Preview Live
                          </Button>
                        </Link>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] touch-manipulation self-end sm:self-auto" >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handlePublishDraft(versioningDraft.originalCourseId)}
                            disabled={publishDraftMutation.isPending}
                            className="text-success focus:text-success"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {publishDraftMutation.isPending ? 'Publishing...' : 'Publish Draft'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDiscardDraft(versioningDraft.originalCourseId)}
                            disabled={discardDraftMutation.isPending}
                            className="text-destructive focus:text-destructive"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            {discardDraftMutation.isPending ? 'Discarding...' : 'Discard Draft'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
            
            {courses.length > 0 && (
              <div className="mt-[var(--space-xl)] pt-[var(--space-lg)] border-t border-border">
                <h3 className="text-lg font-semibold mb-[var(--space-md)] flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  New Course Drafts
                  <Badge variant="warning" className="ml-2">
                    {courses.length}
                  </Badge>
                </h3>
                <p className="text-muted-foreground text-sm mb-[var(--space-md)]">
                  These are new courses that haven't been published yet.
                </p>
              </div>
            )}
          </div>
        )}

        {!isLoading && courses.length === 0 && !(statusFilter === 'draft' && courseDrafts && Object.keys(courseDrafts).length > 0) && (
          <Card className="text-center p-[var(--card-padding)] bg-card border-border">
            <CardContent className="py-[var(--space-xl)]">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-[var(--space-md)] bg-surface-raised flex items-center justify-center">
                <BookOpen className="h-8 w-8 sm:h-10 sm:w-10 text-primary/60" />
              </div>
              <h2 
                className="font-bold mb-[var(--space-sm)]"
                style={{ fontSize: 'var(--text-2xl)' }}
                data-testid="text-no-courses-heading"
              >
                No Courses Yet
              </h2>
              <p className="text-muted-foreground mb-[var(--space-lg)] text-[length:var(--text-base)]">
                Get started by creating your first course!
              </p>
              <Link href="/course-builder/from-documents">
                <Button size="lg" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-create-first-course" >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Course
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {(isLoading || courses.length > 0) && (
          <>
            <PaginatedList
              items={courses}
              total={total}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              renderItem={renderCourseCard}
              emptyMessage="No courses found in this category."
              gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]"
              isLoading={isLoading}
              loadingComponent={renderSkeleton()}
            />
            <div className="flex items-center gap-2 mt-[var(--space-md)]">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[80px] min-h-[36px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
          </>
        )}

        {/* Delete Confirmation (Inline) */}
        {deleteDialogOpen && (
          <Card className="max-w-[min(425px,90vw)] p-[var(--dialog-padding)] border-destructive/30 bg-destructive/5">
            <CardHeader className="p-0">
              <CardTitle style={{ fontSize: 'var(--text-lg)' }}>Delete Course</CardTitle>
              <CardDescription className="text-[length:var(--text-sm)]">
                Are you sure you want to delete "{courseToDelete?.title}"? The course will be moved to the Archived tab where you can restore it if needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-[var(--space-md)] flex flex-col sm:flex-row justify-end gap-[var(--space-sm)]">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                data-testid="dialog-cancel-delete"
              >
                Cancel
              </Button>
              <Button onClick={confirmDelete} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="dialog-confirm-delete" >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </CardContent>
          </Card>
        )}

        <CourseTransferDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          mode="import"
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
            queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
            queryClient.invalidateQueries({ queryKey: ['/api/courses/counts', orgId] });
          }}
        />

        <CourseTransferDialog
          open={exportDialogOpen}
          onOpenChange={(open) => {
            setExportDialogOpen(open);
            if (!open) {
              setCourseToExport(null);
            }
          }}
          mode="export"
          course={courseToExport}
        />
      </div>
    </QuizAdminLayout>
  );
}
