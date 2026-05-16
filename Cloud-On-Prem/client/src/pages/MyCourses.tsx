import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { BookOpen, Star, TrendingUp, Award, Play, AlertCircle, CheckCircle2, RotateCcw, Calendar, Clock, GraduationCap, ShoppingBag, AlertTriangle, Search, Filter, Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PaginatedList } from '@/components/PaginatedList';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { getCourseThumbnail, hasThumbnail } from '@/lib/thumbnailResolver';
import { buildCourseHref, buildMyCoursesUrl } from '@/lib/courseLanguageRouting';

type Purchase = {
  id: string;
  userId: string;
  courseId: string;
  versionId: string;
  pricePaid: string;
  currency: string;
  purchaseDate: Date;
  course: {
    id: string;
    title: string;
    description: string;
    category: string;
    difficultyLevel: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    thumbnailSignedUrl?: string;
    averageRating: string;
    totalReviews: number;
    visibility?: 'public' | 'org_only';
    organizationName?: string;
    organizationLogoUrl?: string;
  };
  version: {
    id: string;
    versionNumber: string;
  };
  progress?: {
    completedLessons: number;
    totalLessons: number;
    lastAccessedAt?: Date;
    percentComplete?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
  };
  hasNewerVersion?: boolean;
};

type AssignedCourse = {
  assignment: {
    id: string;
    courseId: string;
    organizationId: string;
    dueDate: string | null;
    assignedAt: string;
    mandatory: boolean;
  };
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    thumbnailSignedUrl?: string;
    price: string;
    currency: string;
    status: string;
    difficultyLevel: string | null;
    estimatedDuration: number | null;
    organizationName?: string;
    organizationLogoUrl?: string;
  };
  progress: {
    id: string;
    status: 'not_started' | 'in_progress' | 'completed';
    completedLessons: number;
    totalLessons: number;
    percentComplete: number;
  } | null;
};

type ProgressFilter = 'all' | 'not_started' | 'in_progress' | 'completed';

type CategoryItem = {
  id: string;
  name: string;
  type: string;
  group?: string;
};

const REFUND_WINDOW_DAYS = 14;

function isRefundEligible(purchase: Purchase): boolean {
  const purchaseDate = new Date(purchase.purchaseDate);
  const now = new Date();
  const daysSincePurchase = Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Within refund window
  if (daysSincePurchase > REFUND_WINDOW_DAYS) {
    return false;
  }
  
  // NEW: Course must be 100% complete
  const completionPercentage = purchase.progress
    ? (purchase.progress.completedLessons / purchase.progress.totalLessons) * 100
    : 0;
  
  if (completionPercentage < 100) {
    return false;
  }
  
  // NEW: Must have review with rating ≤2 and comment
  // Note: Full validation happens server-side; this is preliminary UI check
  // The refund dialog/modal should verify with server before submission
  return true;
}

function getProgressStatus(progress: AssignedCourse['progress']): 'not_started' | 'in_progress' | 'completed' {
  if (!progress) return 'not_started';
  return progress.status;
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'in_progress':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In Progress';
    default:
      return 'Not Started';
  }
}

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`;
  } else if (diffDays === 0) {
    return 'Due today';
  } else if (diffDays === 1) {
    return 'Due tomorrow';
  } else if (diffDays <= 7) {
    return `Due in ${diffDays} days`;
  } else {
    return `Due ${date.toLocaleDateString()}`;
  }
}

function isDueDateOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isDueSoon(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const date = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

function getUrgencyScore(course: AssignedCourse): number {
  const dueDate = course.assignment.dueDate;
  const status = getProgressStatus(course.progress);
  if (status === 'completed') return 1000;
  if (!dueDate) return 500;
  const now = new Date();
  const date = new Date(dueDate);
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return diffDays;
  return diffDays;
}

export default function MyCourses() {
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [assignedPage, setAssignedPage] = useState(1);
  const [publicCoursesPage, setPublicCoursesPage] = useState(1);
  const [activeTab, setActiveTab] = useState<string>('assigned');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');
  const [sortBy, setSortBy] = useState<'due_date' | 'assigned' | 'progress' | 'name'>('due_date');
  const pageSize = 20;
  const { toast } = useToast();
  
  const [publicSearchQuery, setPublicSearchQuery] = useState('');
  const [publicCategoryFilter, setPublicCategoryFilter] = useState('');
  const [publicDifficultyFilter, setPublicDifficultyFilter] = useState('');
  const [publicProgressFilter, setPublicProgressFilter] = useState<ProgressFilter>('all');
  
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [selectedVariantByCourseId, setSelectedVariantByCourseId] = useState<Record<string, string>>({});
  
  const toggleDescription = (courseId: string) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const { data, isLoading } = useQuery<{ purchases: Purchase[]; total: number }>({
    queryKey: ['/api/my-courses', { page: currentPage, limit: pageSize }],
    queryFn: async () => {
      const response = await fetch(buildMyCoursesUrl(currentPage, pageSize), {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch purchased courses');
      }
      return response.json();
    },
    staleTime: 0,
  });

  const { data: assignedData, isLoading: assignedLoading } = useQuery<AssignedCourse[]>({
    queryKey: ['/api/my-assigned-courses'],
    staleTime: 0,
  });

  const { data: publicCoursesData, isLoading: publicCoursesLoading } = useQuery<{ purchases: Purchase[]; total: number }>({
    queryKey: ['/api/my-public-courses', { search: publicSearchQuery, category: publicCategoryFilter, difficulty: publicDifficultyFilter, completionStatus: publicProgressFilter === 'all' ? '' : publicProgressFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (publicSearchQuery) params.append('search', publicSearchQuery);
      if (publicCategoryFilter) params.append('category', publicCategoryFilter);
      if (publicDifficultyFilter) params.append('difficulty', publicDifficultyFilter);
      if (publicProgressFilter !== 'all') params.append('completionStatus', publicProgressFilter);
      
      const response = await fetch(`/api/my-public-courses?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch public courses');
      }
      return response.json();
    },
    staleTime: 0,
  });

  const { data: categoriesData } = useQuery<{ categories: CategoryItem[] }>({
    queryKey: ['/api/courses/categories/public'],
  });
  const categories = categoriesData?.categories || [];

  const allCourseIds = useMemo(() => {
    const ids = new Set<string>();
    data?.purchases?.forEach((p: Purchase) => ids.add(p.courseId));
    assignedData?.forEach((a: AssignedCourse) => ids.add(a.course.id));
    publicCoursesData?.purchases?.forEach((p: Purchase) => ids.add(p.courseId));
    return Array.from(ids);
  }, [data, assignedData, publicCoursesData]);

  const { data: courseLanguages } = useQuery<Record<string, { languages: Array<{ code: string; courseId?: string; isDefault?: boolean }> }>>({
    queryKey: ['/api/courses/batch-languages', allCourseIds],
    queryFn: async () => {
      if (allCourseIds.length === 0) return {};
      const res = await fetch('/api/courses/batch-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: allCourseIds }),
        credentials: 'include',
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: allCourseIds.length > 0,
  });

  const getSelectedVariant = (courseId: string) => {
    const variants = courseLanguages?.[courseId]?.languages || [];
    const selectedVariantId = selectedVariantByCourseId[courseId] || courseId;
    const selectedVariant = variants.find((variant) => String(variant.courseId || courseId) === String(selectedVariantId));
    return {
      variants,
      selectedVariantId,
      selectedLanguageCode: String(selectedVariant?.code || 'en').toLowerCase(),
    };
  };

  useEffect(() => {
    if (!courseLanguages || allCourseIds.length === 0) return;
    setSelectedVariantByCourseId((prev) => {
      const next = { ...prev };
      for (const courseId of allCourseIds) {
        const variants = courseLanguages?.[courseId]?.languages || [];
        if (!next[courseId]) {
          next[courseId] = courseId;
        }
        if (variants.length > 0 && !variants.some((variant) => String(variant.courseId || courseId) === String(next[courseId]))) {
          next[courseId] = String(variants[0]?.courseId || courseId);
        }
      }
      return next;
    });
  }, [allCourseIds, courseLanguages]);

  const refundMutation = useMutation({
    mutationFn: async ({ courseId, reason }: { courseId: string; reason?: string }) => {
      return apiRequest(`/api/courses/${courseId}/refunds`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Refund Requested',
        description: data.message || 'Your refund request has been submitted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/my-courses'] });
      setRefundDialogOpen(false);
      setSelectedPurchase(null);
      setRefundReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Refund Request Failed',
        description: error.message || 'Failed to submit refund request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleRefundClick = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setRefundReason('');
    setRefundDialogOpen(true);
  };

  const handleConfirmRefund = () => {
    if (selectedPurchase) {
      refundMutation.mutate({
        courseId: selectedPurchase.courseId,
        reason: refundReason.trim() || undefined,
      });
    }
  };

  const purchases = data?.purchases || [];
  const total = data?.total || 0;

  const sortedAndFilteredCourses = (assignedData || [])
    .filter(course => {
      if (progressFilter === 'all') return true;
      const status = getProgressStatus(course.progress);
      return status === progressFilter;
    })
    .sort((a, b) => {
      const urgencyA = getUrgencyScore(a);
      const urgencyB = getUrgencyScore(b);
      if (urgencyA !== urgencyB) return urgencyA - urgencyB;
      
      switch (sortBy) {
        case 'due_date':
          if (!a.assignment.dueDate) return 1;
          if (!b.assignment.dueDate) return -1;
          return new Date(a.assignment.dueDate).getTime() - new Date(b.assignment.dueDate).getTime();
        case 'assigned':
          return new Date(b.assignment.assignedAt).getTime() - new Date(a.assignment.assignedAt).getTime();
        case 'progress':
          return (b.progress?.percentComplete || 0) - (a.progress?.percentComplete || 0);
        case 'name':
          return a.course.title.localeCompare(b.course.title);
        default:
          return 0;
      }
    });

  const paginatedAssignedCourses = sortedAndFilteredCourses.slice(
    (assignedPage - 1) * pageSize,
    assignedPage * pageSize
  );

  const overdueCount = (assignedData || []).filter(c => 
    getProgressStatus(c.progress) !== 'completed' && isDueDateOverdue(c.assignment.dueDate)
  ).length;
  const dueSoonCount = (assignedData || []).filter(c => 
    getProgressStatus(c.progress) !== 'completed' && !isDueDateOverdue(c.assignment.dueDate) && isDueSoon(c.assignment.dueDate)
  ).length;

  const renderCourseCard = (purchase: Purchase, index: number) => {
    const completionPercentage = purchase.progress
      ? (purchase.progress.completedLessons / purchase.progress.totalLessons) * 100
      : 0;
    const isCompleted = completionPercentage === 100;
    const canRequestRefund = isRefundEligible(purchase);
    const { variants, selectedVariantId, selectedLanguageCode } = getSelectedVariant(purchase.courseId);
    const selectedCourseHref = buildCourseHref(selectedVariantId, selectedLanguageCode);

    return (
      <Card
        key={purchase.id}
        className="flex flex-col bg-surface-raised shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 p-[var(--card-padding)]"
        data-testid={`my-course-card-${purchase.courseId}`}
      >
        {hasThumbnail(purchase.course) ? (
          <div className="h-36 sm:h-48 w-full overflow-hidden rounded-t-lg bg-muted relative">
            <img
              src={getCourseThumbnail(purchase.course)}
              alt={purchase.course.title}
              className="h-full w-full object-cover"
              data-testid={`my-course-image-${purchase.courseId}`}
            />
            {isCompleted && (
              <div className="absolute top-2 right-2 bg-primary text-btn-primary-foreground rounded-full p-1.5 sm:p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
          </div>
        ) : (
          <div className="h-36 sm:h-48 w-full bg-primary/20 rounded-t-lg flex items-center justify-center relative">
            <BookOpen className="h-12 w-12 sm:h-16 sm:w-16 text-primary/60" />
            {isCompleted && (
              <div className="absolute top-2 right-2 bg-primary text-btn-primary-foreground rounded-full p-1.5 sm:p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
          </div>
        )}

        <CardHeader className="flex-1 p-[var(--card-padding)]">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-[var(--space-sm)]">
            <CardTitle 
              className="text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)] text-foreground" 
              data-testid={`my-course-title-${purchase.courseId}`}
            >
              {purchase.course.title}
            </CardTitle>
            <Badge variant="outline" className="shrink-0" data-testid={`my-course-version-${purchase.courseId}`} >
              v{purchase.version.versionNumber}
            </Badge>
          </div>
          <div className="mt-1">
            <CardDescription className={`text-muted-foreground text-[length:var(--text-sm)] ${!expandedDescriptions.has(purchase.courseId) ? 'line-clamp-2' : ''}`}>
              {purchase.course.description}
            </CardDescription>
            {purchase.course.description && purchase.course.description.length > 100 && (
              <button
                onClick={() => toggleDescription(purchase.courseId)}
                className="text-primary text-[length:var(--text-xs)] hover:underline mt-1"
              >
                {expandedDescriptions.has(purchase.courseId) ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>

          {purchase.course.organizationName && (
            <div className="flex items-center gap-2 mt-[var(--space-sm)]" data-testid={`my-course-org-${purchase.courseId}`}>
              {purchase.course.organizationLogoUrl ? (
                <img 
                  src={purchase.course.organizationLogoUrl} 
                  alt={`${purchase.course.organizationName} logo`}
                  className="h-5 w-5 rounded-full object-contain flex-shrink-0 bg-background p-px"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <span className="text-[length:var(--text-xs)] text-muted-foreground truncate">
                {purchase.course.organizationName}
              </span>
            </div>
          )}

          {purchase.hasNewerVersion && (
            <Alert className="mt-[var(--space-sm)]">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-[length:var(--text-sm)]">New Version Available!</AlertTitle>
              <AlertDescription className="text-[length:var(--text-xs)]">
                Upgrade to access the latest content and improvements.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-[var(--space-sm)] mt-[var(--space-md)]">
            <div className="flex items-center justify-between text-[length:var(--text-sm)]">
              <span className="text-muted-foreground">Your Progress</span>
              <span className="font-medium text-foreground" data-testid={`my-course-progress-${purchase.courseId}`}>
                {Math.round(completionPercentage)}%
              </span>
            </div>
            <Progress value={completionPercentage} />
            <p className="text-[length:var(--text-xs)] text-muted-foreground">
              {purchase.progress?.completedLessons || 0} of {purchase.progress?.totalLessons || 0}{' '}
              lessons completed
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-[var(--space-sm)] text-[length:var(--text-sm)] text-muted-foreground pt-[var(--space-sm)]">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-warning text-warning" />
              <span className="text-muted-foreground">{parseFloat(purchase.course.averageRating).toFixed(1)}</span>
            </div>
            <Badge variant="secondary" >{purchase.course.category}</Badge>
            <Badge variant="outline" >{purchase.course.difficultyLevel}</Badge>
            {variants.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Globe className="h-3 w-3 text-muted-foreground" />
                {variants.map((lang) => {
                  const targetVariantId = String(lang.courseId || purchase.courseId);
                  const href = buildCourseHref(targetVariantId, lang.code);
                  return (
                    <Button key={`${purchase.courseId}-${targetVariantId}-${lang.code}`} variant="outline" size="sm" className="min-h-[44px] h-11 sm:h-9 px-2 uppercase touch-manipulation" onClick={() => {
                        setSelectedVariantByCourseId((prev) => ({ ...prev, [purchase.courseId]: targetVariantId }));
                        setLocation(href);
                      }}
                    >
                      {lang.code}
                    </Button>
                  );
                })}
                <Select
                  value={selectedVariantId}
                  onValueChange={(value) => setSelectedVariantByCourseId((prev) => ({ ...prev, [purchase.courseId]: value }))}
                >
                  <SelectTrigger className="min-h-[44px] h-11 sm:h-8 text-xs min-w-[150px] touch-manipulation">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((variant) => (
                      <SelectItem key={`purchase-variant-${purchase.courseId}-${variant.courseId || variant.code}`} value={String(variant.courseId || purchase.courseId)}>
                        {String(variant.code || 'en').toUpperCase()}
                        {variant.isDefault ? ' (Source)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>

        <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-[var(--space-md)] border-t gap-[var(--space-sm)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
            {isCompleted ? (
              <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(`/courses/${purchase.courseId}/rate`)}
                data-testid={`button-rate-course-${purchase.courseId}`}
              >
                <Star className="h-4 w-4 mr-1" />
                Rate Course
              </Button>
            ) : (
              <Button variant="default" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(selectedCourseHref)}
                data-testid={`button-continue-learning-${purchase.courseId}`}
              >
                <Play className="h-4 w-4 mr-1" />
                Continue
              </Button>
            )}
            {purchase.hasNewerVersion && (
              <Button variant="secondary" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(`/courses/${purchase.courseId}/upgrade`)}
                data-testid={`button-upgrade-${purchase.courseId}`}
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Upgrade
              </Button>
            )}
            {canRequestRefund && (
              <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => handleRefundClick(purchase)}
                data-testid={`button-request-refund-${purchase.courseId}`}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Request Refund
              </Button>
            )}
          </div>
          {isCompleted && (
            <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(`/certificates?course=${purchase.courseId}`)}
              data-testid={`button-certificate-${purchase.courseId}`}
            >
              <Award className="h-4 w-4 mr-1" />
              Certificate
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  };

  const renderPublicCourseCard = (purchase: Purchase, index: number) => {
    const completionPercentage = purchase.progress?.percentComplete ?? 
      (purchase.progress ? (purchase.progress.completedLessons / purchase.progress.totalLessons) * 100 : 0);
    const isCompleted = completionPercentage === 100 || purchase.progress?.status === 'completed';
    const status = purchase.progress?.status || 'not_started';
    const canRequestRefund = isRefundEligible(purchase);
    const { variants, selectedVariantId, selectedLanguageCode } = getSelectedVariant(purchase.courseId);
    const selectedCourseHref = buildCourseHref(selectedVariantId, selectedLanguageCode);

    return (
      <Card
        key={purchase.id}
        className="flex flex-col bg-surface-raised shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 p-[var(--card-padding)]"
        data-testid={`public-course-card-${purchase.courseId}`}
      >
        {hasThumbnail(purchase.course) ? (
          <div className="h-36 sm:h-48 w-full overflow-hidden rounded-t-lg bg-muted relative">
            <img
              src={getCourseThumbnail(purchase.course)}
              alt={purchase.course.title}
              className="h-full w-full object-cover"
              data-testid={`public-course-image-${purchase.courseId}`}
            />
            {isCompleted && (
              <div className="absolute top-2 right-2 bg-primary text-btn-primary-foreground rounded-full p-1.5 sm:p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
            <div className="absolute top-2 left-2">
              <Badge variant="secondary" className="text-xs">
                <Globe className="h-3 w-3 mr-1" />
                Public
              </Badge>
            </div>
          </div>
        ) : (
          <div className="h-36 sm:h-48 w-full bg-primary/20 rounded-t-lg flex items-center justify-center relative">
            <BookOpen className="h-12 w-12 sm:h-16 sm:w-16 text-primary/60" />
            {isCompleted && (
              <div className="absolute top-2 right-2 bg-primary text-btn-primary-foreground rounded-full p-1.5 sm:p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
            <div className="absolute top-2 left-2">
              <Badge variant="secondary" className="text-xs">
                <Globe className="h-3 w-3 mr-1" />
                Public
              </Badge>
            </div>
          </div>
        )}

        <CardHeader className="flex-1 p-[var(--card-padding)]">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-[var(--space-sm)]">
            <CardTitle 
              className="text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)] text-foreground" 
              data-testid={`public-course-title-${purchase.courseId}`}
            >
              {purchase.course.title}
            </CardTitle>
            <Badge variant={getStatusBadgeVariant(status)} className="shrink-0" data-testid={`public-course-status-${purchase.courseId}`} >
              {getStatusLabel(status)}
            </Badge>
          </div>
          <div className="mt-1">
            <CardDescription className={`text-muted-foreground text-[length:var(--text-sm)] ${!expandedDescriptions.has(purchase.courseId) ? 'line-clamp-2' : ''}`}>
              {purchase.course.description}
            </CardDescription>
            {purchase.course.description && purchase.course.description.length > 100 && (
              <button
                onClick={() => toggleDescription(purchase.courseId)}
                className="text-primary text-[length:var(--text-xs)] hover:underline mt-1"
              >
                {expandedDescriptions.has(purchase.courseId) ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>

          {purchase.course.organizationName && (
            <div className="flex items-center gap-2 mt-[var(--space-sm)]" data-testid={`public-course-org-${purchase.courseId}`}>
              {purchase.course.organizationLogoUrl ? (
                <img 
                  src={purchase.course.organizationLogoUrl} 
                  alt={`${purchase.course.organizationName} logo`}
                  className="h-5 w-5 rounded-full object-contain flex-shrink-0 bg-background p-px"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <span className="text-[length:var(--text-xs)] text-muted-foreground truncate">
                {purchase.course.organizationName}
              </span>
            </div>
          )}

          {purchase.hasNewerVersion && (
            <Alert className="mt-[var(--space-sm)]">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-[length:var(--text-sm)]">New Version Available!</AlertTitle>
              <AlertDescription className="text-[length:var(--text-xs)]">
                Upgrade to access the latest content and improvements.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-[var(--space-sm)] mt-[var(--space-md)]">
            <div className="flex items-center justify-between text-[length:var(--text-sm)]">
              <span className="text-muted-foreground">Your Progress</span>
              <span className="font-medium text-foreground" data-testid={`public-course-progress-${purchase.courseId}`}>
                {Math.round(completionPercentage)}%
              </span>
            </div>
            <Progress value={completionPercentage} className={isCompleted ? 'bg-muted [&>div]:bg-success' : ''} />
            <p className="text-[length:var(--text-xs)] text-muted-foreground">
              {purchase.progress?.completedLessons || 0} of {purchase.progress?.totalLessons || 0}{' '}
              lessons completed
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-[var(--space-sm)] text-[length:var(--text-sm)] text-muted-foreground pt-[var(--space-sm)]">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-warning text-warning" />
              <span className="text-muted-foreground">{parseFloat(purchase.course.averageRating).toFixed(1)}</span>
            </div>
            <Badge variant="secondary" >{purchase.course.category}</Badge>
            <Badge variant="outline" >{purchase.course.difficultyLevel}</Badge>
            {variants.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Globe className="h-3 w-3 text-muted-foreground" />
                {variants.map((lang) => {
                  const targetVariantId = String(lang.courseId || purchase.courseId);
                  const href = buildCourseHref(targetVariantId, lang.code);
                  return (
                    <Button key={`${purchase.courseId}-public-${targetVariantId}-${lang.code}`} variant="outline" size="sm" className="min-h-[44px] h-11 sm:h-9 px-2 uppercase touch-manipulation" onClick={() => {
                        setSelectedVariantByCourseId((prev) => ({ ...prev, [purchase.courseId]: targetVariantId }));
                        setLocation(href);
                      }}
                    >
                      {lang.code}
                    </Button>
                  );
                })}
                <Select
                  value={selectedVariantId}
                  onValueChange={(value) => setSelectedVariantByCourseId((prev) => ({ ...prev, [purchase.courseId]: value }))}
                >
                  <SelectTrigger className="min-h-[44px] h-11 sm:h-8 text-xs min-w-[150px] touch-manipulation">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((variant) => (
                      <SelectItem key={`public-variant-${purchase.courseId}-${variant.courseId || variant.code}`} value={String(variant.courseId || purchase.courseId)}>
                        {String(variant.code || 'en').toUpperCase()}
                        {variant.isDefault ? ' (Source)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>

        <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-[var(--space-md)] border-t gap-[var(--space-sm)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
            {isCompleted ? (
              <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(`/courses/${purchase.courseId}/rate`)}
                data-testid={`button-rate-public-course-${purchase.courseId}`}
              >
                <Star className="h-4 w-4 mr-1" />
                Rate Course
              </Button>
            ) : (
              <Button variant="default" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(selectedCourseHref)}
                data-testid={`button-continue-public-course-${purchase.courseId}`}
              >
                <Play className="h-4 w-4 mr-1" />
                {status === 'not_started' ? 'Start' : 'Continue'}
              </Button>
            )}
            {purchase.hasNewerVersion && (
              <Button variant="secondary" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(`/courses/${purchase.courseId}/upgrade`)}
                data-testid={`button-upgrade-public-${purchase.courseId}`}
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Upgrade
              </Button>
            )}
            {canRequestRefund && (
              <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => handleRefundClick(purchase)}
                data-testid={`button-refund-public-${purchase.courseId}`}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Request Refund
              </Button>
            )}
          </div>
          {isCompleted && (
            <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => setLocation(`/certificates?course=${purchase.courseId}`)}
              data-testid={`button-certificate-public-${purchase.courseId}`}
            >
              <Award className="h-4 w-4 mr-1" />
              Certificate
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  };

  function getUrgencyBorderClass(dueDate: string | null, status: string): string {
    if (status === 'completed') return '';
    if (!dueDate) return '';
    const date = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'border-2 border-destructive';
    if (diffDays <= 7) return 'border-2 border-warning';
    return '';
  }

  const renderAssignedCourseCard = (assignedCourse: AssignedCourse, index: number) => {
    const status = getProgressStatus(assignedCourse.progress);
    const completedLessons = assignedCourse.progress?.completedLessons || 0;
    const totalLessons = assignedCourse.progress?.totalLessons || 0;
    const percentComplete = assignedCourse.progress?.percentComplete || 0;
    const isCompleted = status === 'completed';
    const isNotStarted = status === 'not_started';
    const dueDate = assignedCourse.assignment.dueDate;
    const dueDateFormatted = formatDueDate(dueDate);
    const isOverdue = isDueDateOverdue(dueDate);
    const urgencyBorder = getUrgencyBorderClass(dueDate, status);
    const isMandatory = assignedCourse.assignment.mandatory ?? true;
    const { variants, selectedVariantId, selectedLanguageCode } = getSelectedVariant(assignedCourse.course.id);
    const selectedCourseHref = buildCourseHref(selectedVariantId, selectedLanguageCode);

    return (
      <Card
        key={assignedCourse.assignment.id}
        className={`flex flex-col bg-surface-raised shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 p-[var(--card-padding)] ${urgencyBorder}`}
        data-testid={`assigned-course-card-${assignedCourse.course.id}`}
      >
        {hasThumbnail(assignedCourse.course) ? (
          <div className="h-36 sm:h-48 w-full overflow-hidden rounded-t-lg bg-muted relative">
            <img
              src={getCourseThumbnail(assignedCourse.course)}
              alt={assignedCourse.course.title}
              className="h-full w-full object-cover"
              data-testid={`assigned-course-image-${assignedCourse.course.id}`}
            />
            {isCompleted && (
              <div className="absolute top-2 right-2 bg-primary text-btn-primary-foreground rounded-full p-1.5 sm:p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
          </div>
        ) : (
          <div className="h-36 sm:h-48 w-full bg-primary/20 rounded-t-lg flex items-center justify-center relative">
            <GraduationCap className="h-12 w-12 sm:h-16 sm:w-16 text-primary/60" />
            {isCompleted && (
              <div className="absolute top-2 right-2 bg-primary text-btn-primary-foreground rounded-full p-1.5 sm:p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
          </div>
        )}

        <CardHeader className="flex-1 p-[var(--card-padding)]">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-[var(--space-sm)]">
            <CardTitle 
              className="text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)] text-foreground" 
              data-testid={`assigned-course-title-${assignedCourse.course.id}`}
            >
              {assignedCourse.course.title}
            </CardTitle>
            <Badge variant={getStatusBadgeVariant(status)} className="shrink-0" data-testid={`assigned-course-status-${assignedCourse.course.id}`} >
              {getStatusLabel(status)}
            </Badge>
            <Badge variant={isMandatory ? 'destructive' : 'outline'} className={`shrink-0 ${isMandatory ? '' : 'border-muted-foreground/30 text-muted-foreground'}`} >
              {isMandatory ? 'Required' : 'Optional'}
            </Badge>
          </div>
          
          {assignedCourse.course.description && (
            <div className="mt-1">
              <CardDescription className={`text-muted-foreground text-[length:var(--text-sm)] ${!expandedDescriptions.has(assignedCourse.course.id) ? 'line-clamp-2' : ''}`}>
                {assignedCourse.course.description}
              </CardDescription>
              {assignedCourse.course.description.length > 100 && (
                <button
                  onClick={() => toggleDescription(assignedCourse.course.id)}
                  className="text-primary text-[length:var(--text-xs)] hover:underline mt-1"
                >
                  {expandedDescriptions.has(assignedCourse.course.id) ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {assignedCourse.course.organizationName && (
            <div className="flex items-center gap-2 mt-[var(--space-sm)]" data-testid={`assigned-course-org-${assignedCourse.course.id}`}>
              {assignedCourse.course.organizationLogoUrl ? (
                <img 
                  src={assignedCourse.course.organizationLogoUrl} 
                  alt={`${assignedCourse.course.organizationName} logo`}
                  className="h-5 w-5 rounded-full object-contain flex-shrink-0 bg-background p-px"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <span className="text-[length:var(--text-xs)] text-muted-foreground truncate">
                {assignedCourse.course.organizationName}
              </span>
            </div>
          )}

          <div className="space-y-[var(--space-sm)] mt-[var(--space-md)]">
            <div className="flex items-center justify-between text-[length:var(--text-sm)]">
              <span className="text-muted-foreground">Your Progress</span>
              <span className="font-medium text-foreground" data-testid={`assigned-course-progress-${assignedCourse.course.id}`}>
                {percentComplete}%
              </span>
            </div>
            <Progress value={percentComplete} className={isCompleted ? 'bg-muted [&>div]:bg-success' : ''} />
            <p className="text-[length:var(--text-xs)] text-muted-foreground">
              {completedLessons} of {totalLessons} lessons completed
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-[var(--space-sm)] text-[length:var(--text-sm)] text-muted-foreground pt-[var(--space-sm)]">
            {dueDateFormatted && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${
                isOverdue && !isCompleted 
                  ? 'bg-destructive/10 text-destructive font-medium' 
                  : isDueSoon(dueDate) && !isCompleted
                    ? 'bg-warning/10 text-warning font-medium'
                    : ''
              }`}>
                <Calendar className="h-4 w-4" />
                <span>{dueDateFormatted}</span>
              </div>
            )}
            {assignedCourse.course.estimatedDuration && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{assignedCourse.course.estimatedDuration} min</span>
              </div>
            )}
            {assignedCourse.course.difficultyLevel && (
              <Badge variant="outline" >
                {assignedCourse.course.difficultyLevel}
              </Badge>
            )}
            {variants.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Globe className="h-3 w-3 text-muted-foreground" />
                {variants.map((lang) => {
                  const targetVariantId = String(lang.courseId || assignedCourse.course.id);
                  const href = buildCourseHref(targetVariantId, lang.code);
                  return (
                    <Button key={`${assignedCourse.course.id}-assigned-${targetVariantId}-${lang.code}`} variant="outline" size="sm" className="min-h-[44px] h-11 sm:h-9 px-2 uppercase touch-manipulation" onClick={() => {
                        setSelectedVariantByCourseId((prev) => ({ ...prev, [assignedCourse.course.id]: targetVariantId }));
                        setLocation(href);
                      }}
                    >
                      {lang.code}
                    </Button>
                  );
                })}
                <Select
                  value={selectedVariantId}
                  onValueChange={(value) => setSelectedVariantByCourseId((prev) => ({ ...prev, [assignedCourse.course.id]: value }))}
                >
                  <SelectTrigger className="min-h-[44px] h-11 sm:h-8 text-xs min-w-[150px] touch-manipulation">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((variant) => (
                      <SelectItem key={`assigned-variant-${assignedCourse.course.id}-${variant.courseId || variant.code}`} value={String(variant.courseId || assignedCourse.course.id)}>
                        {String(variant.code || 'en').toUpperCase()}
                        {variant.isDefault ? ' (Source)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>

        <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-[var(--space-md)] border-t gap-[var(--space-sm)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
            {isCompleted ? (
              <Link href={selectedCourseHref}>
                <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-review-course-${assignedCourse.course.id}`} >
                  <BookOpen className="h-4 w-4 mr-1" />
                  Review Course
                </Button>
              </Link>
            ) : (
              <Link href={selectedCourseHref}>
                <Button variant="default" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-${isNotStarted ? 'start' : 'continue'}-course-${assignedCourse.course.id}`} >
                  <Play className="h-4 w-4 mr-1" />
                  {isNotStarted ? 'Start' : 'Continue'}
                </Button>
              </Link>
            )}
          </div>
          {isCompleted && (
            <Link href={`/certificates?course=${assignedCourse.course.id}`} className="w-full sm:w-auto">
              <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-certificate-${assignedCourse.course.id}`} >
                <Award className="h-4 w-4 mr-1" />
                Certificate
              </Button>
            </Link>
          )}
        </CardFooter>
      </Card>
    );
  };

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-md)]">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col bg-surface-raised shadow-card p-[var(--card-padding)]">
          <Skeleton className="h-36 sm:h-48 w-full rounded-t-lg bg-muted/50" />
          <CardHeader className="flex-1 p-[var(--card-padding)]">
            <Skeleton className="h-6 w-3/4 mb-2 bg-muted/50" />
            <Skeleton className="h-4 w-full mb-1 bg-muted/50" />
            <Skeleton className="h-4 w-2/3 mb-4 bg-muted/50" />
            <Skeleton className="h-2 w-full mb-2 bg-muted/50" />
            <Skeleton className="h-4 w-32 bg-muted/50" />
          </CardHeader>
          <CardFooter className="flex items-center justify-between pt-[var(--space-md)] border-t border-border">
            <Skeleton className="h-11 w-full sm:w-28 bg-muted/50" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );

  const renderEmptyState = (type: 'purchased' | 'assigned') => (
    <Card className="bg-surface-raised shadow-card text-center p-[var(--card-padding)]" data-testid={`empty-state-${type}`}>
      <CardContent className="p-[var(--space-xl)]">
        <div className="flex flex-col items-center gap-[var(--space-md)]">
          <div className="p-[var(--space-md)] bg-primary/20 rounded-full">
            {type === 'purchased' ? (
              <Globe className="h-12 w-12 sm:h-16 sm:w-16 text-primary" />
            ) : (
              <GraduationCap className="h-12 w-12 sm:h-16 sm:w-16 text-primary" />
            )}
          </div>
          <div>
            <h2 className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-foreground mb-[var(--space-sm)]">
              {type === 'purchased' ? 'No Public Courses' : 'No Assigned Courses'}
            </h2>
            <p className="text-muted-foreground mb-[var(--space-lg)] max-w-md text-[length:var(--text-sm)] sm:text-[length:var(--text-base)]">
              {type === 'purchased'
                ? 'Explore public courses from across the platform and enroll to start learning!'
                : 'No courses have been assigned to you yet. Check back later or contact your administrator.'}
            </p>
            {type === 'purchased' && (
              <Link href="/browse-courses">
                <Button size="lg" className="from-primary min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-browse-courses" >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Browse Public Courses
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const filterCounts = {
    all: assignedData?.length || 0,
    not_started: assignedData?.filter(c => getProgressStatus(c.progress) === 'not_started').length || 0,
    in_progress: assignedData?.filter(c => getProgressStatus(c.progress) === 'in_progress').length || 0,
    completed: assignedData?.filter(c => getProgressStatus(c.progress) === 'completed').length || 0,
  };

  return (
    <QuizAdminLayout
      title="My Courses"
      description="Continue your learning journey and track your progress"
    >
      <div className="w-full max-w-7xl mx-auto p-[var(--container-padding)]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="assigned" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Assigned Courses</span>
              <span className="sm:hidden">Assigned</span>
              {(assignedData?.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-1">{assignedData?.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="purchased" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Public Courses</span>
              <span className="sm:hidden">Public</span>
              {(publicCoursesData?.total || 0) > 0 && (
                <Badge variant="secondary" className="ml-1">{publicCoursesData?.total}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchased">
            <div className="mb-6 bg-surface-raised shadow-card rounded-lg p-4 space-y-4">
              <div className="flex flex-col sm:flex-row gap-[var(--space-md)]">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search courses by title or description..."
                    value={publicSearchQuery}
                    onChange={(e) => {
                      setPublicSearchQuery(e.target.value);
                      setPublicCoursesPage(1);
                    }}
                    className="pl-10 min-h-[44px]"
                    data-testid="input-public-search"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-sm)]">
                <Select
                  value={publicCategoryFilter || 'all'}
                  onValueChange={(value) => {
                    setPublicCategoryFilter(value === 'all' ? '' : value);
                    setPublicCoursesPage(1);
                  }}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-public-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={publicDifficultyFilter || 'all'}
                  onValueChange={(value) => {
                    setPublicDifficultyFilter(value === 'all' ? '' : value);
                    setPublicCoursesPage(1);
                  }}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-public-difficulty">
                    <SelectValue placeholder="All Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={publicProgressFilter}
                  onValueChange={(value) => {
                    setPublicProgressFilter(value as ProgressFilter);
                    setPublicCoursesPage(1);
                  }}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-public-progress">
                    <SelectValue placeholder="All Progress" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Progress</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => {
                    setPublicSearchQuery('');
                    setPublicCategoryFilter('');
                    setPublicDifficultyFilter('');
                    setPublicProgressFilter('all');
                    setPublicCoursesPage(1);
                  }}
                  data-testid="button-clear-public-filters"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>

            {!publicCoursesLoading && (publicCoursesData?.purchases?.length || 0) === 0 && renderEmptyState('purchased')}

            {(publicCoursesLoading || (publicCoursesData?.purchases?.length || 0) > 0) && (
              <PaginatedList
                items={publicCoursesData?.purchases || []}
                total={publicCoursesData?.total || 0}
                pageSize={pageSize}
                currentPage={publicCoursesPage}
                onPageChange={setPublicCoursesPage}
                renderItem={renderPublicCourseCard}
                emptyMessage="No public courses found."
                gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-md)]"
                isLoading={publicCoursesLoading}
                loadingComponent={renderSkeleton()}
              />
            )}
          </TabsContent>

          <TabsContent value="assigned">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Card className="bg-destructive/10 border-destructive/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-2xl font-bold text-destructive">{overdueCount}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-warning/10 border-[var(--warning)]/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-warning" />
                  <div>
                    <p className="text-2xl font-bold text-warning">{dueSoonCount}</p>
                    <p className="text-xs text-muted-foreground">Due Soon</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-primary/10 border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-primary">{filterCounts.in_progress}</p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-success/10 border-success/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-2xl font-bold text-success">{filterCounts.completed}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Select value={sortBy} onValueChange={(v) => { setSortBy(v as any); setAssignedPage(1); }}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_date">Due Date</SelectItem>
                    <SelectItem value="assigned">Recently Assigned</SelectItem>
                    <SelectItem value="progress">Progress</SelectItem>
                    <SelectItem value="name">Course Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {(['all', 'not_started', 'in_progress', 'completed'] as ProgressFilter[]).map((filter) => (
                <Button key={filter} variant={progressFilter === filter ? 'default' : 'outline'} size="sm" onClick={() => {
                    setProgressFilter(filter);
                    setAssignedPage(1);
                  }}
                  className="min-h-[36px]"
                  data-testid={`filter-${filter}`}
                >
                  {filter === 'all' && 'All'}
                  {filter === 'not_started' && 'Not Started'}
                  {filter === 'in_progress' && 'In Progress'}
                  {filter === 'completed' && 'Completed'}
                  <Badge variant="secondary" className="ml-2">
                    {filterCounts[filter]}
                  </Badge>
                </Button>
              ))}
            </div>

            {!assignedLoading && sortedAndFilteredCourses.length === 0 && (
              progressFilter !== 'all' ? (
                <Card className="bg-surface-raised shadow-card text-center p-[var(--card-padding)]">
                  <CardContent className="p-[var(--space-xl)]">
                    <div className="flex flex-col items-center gap-[var(--space-md)]">
                      <div className="p-[var(--space-md)] bg-muted rounded-full">
                        <BookOpen className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">
                        No courses with "{getStatusLabel(progressFilter)}" status.
                      </p>
                      <Button variant="outline" onClick={() => setProgressFilter('all')}
                      >
                        View All Courses
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                renderEmptyState('assigned')
              )
            )}

            {(assignedLoading || sortedAndFilteredCourses.length > 0) && (
              <PaginatedList
                items={paginatedAssignedCourses}
                total={sortedAndFilteredCourses.length}
                pageSize={pageSize}
                currentPage={assignedPage}
                onPageChange={setAssignedPage}
                renderItem={renderAssignedCourseCard}
                emptyMessage="No assigned courses found."
                gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-md)]"
                isLoading={assignedLoading}
                loadingComponent={renderSkeleton()}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <AlertDialogContent 
          className="bg-card border-border w-[calc(100%-2rem)] max-w-lg p-[var(--dialog-padding)]"
          data-testid="dialog-refund-request"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">Request Course Refund</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              Are you sure you want to request a refund for{' '}
              <span className="font-semibold text-primary">
                {selectedPurchase?.course.title}
              </span>
              ? Your access to this course will be revoked once the refund is processed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-[var(--space-md)]">
            <label className="text-[length:var(--text-sm)] font-medium text-muted-foreground mb-[var(--space-sm)] block">
              Reason for refund (optional)
            </label>
            <Textarea
              placeholder="Please share why you're requesting a refund..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary min-h-[88px]"
              rows={3}
              data-testid="textarea-refund-reason"
            />
          </div>
          
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:text-foreground min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={refundMutation.isPending}
              data-testid="button-cancel-refund"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmRefund();
              }}
              className="bg-primary hover:bg-primary/90 text-btn-primary-foreground min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={refundMutation.isPending}
              data-testid="button-confirm-refund"
            >
              {refundMutation.isPending ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-1 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Confirm Refund Request'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuizAdminLayout>
  );
}
