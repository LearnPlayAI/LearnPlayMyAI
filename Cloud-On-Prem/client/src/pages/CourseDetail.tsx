import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useRoute, Link, useLocation } from 'wouter';
import {
  BookOpen,
  Star,
  Users,
  Clock,
  Award,
  ShoppingCart,
  CheckCircle,
  Lock,
  Play,
  MessageSquare,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Sparkles,
  Download,
  Loader2,
} from 'lucide-react';
import { PurchaseConfirmationModal } from '@/components/PurchaseConfirmationModal';
import { invalidatePurchaseCaches } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useUser } from '@/hooks/use-user';
import { PremiumHeader } from '@/pages/landing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCourseThumbnail } from '@/lib/thumbnailResolver';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { PodcastPlayer } from '@/components/PodcastPlayer';
import {
  buildCourseHref,
  buildCourseLanguageQuery,
  buildCourseLessonsHref,
  getRequestedLanguageCodeFromSearch,
} from '@/lib/courseLanguageRouting';
import { hasOpenPublicCourseAccess } from '@/lib/publicCourseAccess';

type CourseDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficultyLevel: string;
  currency: string;
  price: string;
  isPaid: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnailSignedUrl?: string;
  averageRating: string;
  totalReviews: number;
  totalEnrollments: number;
  organizationId: string;
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
  organizationType?: 'education' | 'business' | 'elearning' | null;
  visibility?: 'public' | 'org_only';
  status: string;
  publishedAt?: Date;
  latestVersion: {
    id: string;
    versionNumber: string;
    releaseNotes?: string;
  };
  lessons: Array<{
    id: string;
    lessonId: string;
    topicName: string;
    topicOrder: number;
    completed: boolean;
    lesson: {
      id: string;
      title: string;
      description?: string;
      isDemoLesson?: boolean;
      learningObjectives?: Array<{id: string; objective: string; bloomLevel: string}>;
      bloomLevels?: string[];
    };
  }>;
  contentGroupId?: string | null;
  languageCode?: string | null;
  preferredCourseId?: string | null;
  hasAccess: boolean;
  hasPurchased?: boolean;
  isAssigned?: boolean;
  isShowcaseCourse?: boolean;
  userProgress?: {
    completedLessons: number;
    totalLessons: number;
  };
};

const bloomLevelColors: Record<string, string> = {
  remember: 'bg-primary/20 text-primary border-border',
  understand: 'bg-success/20 text-success border-success/30',
  apply: 'bg-warning/20 text-warning border-[var(--warning)]/30',
  analyze: 'bg-warning/20 text-warning border-[var(--warning)]/30',
  evaluate: 'bg-primary/20 text-primary border-border',
  create: 'bg-destructive/20 text-destructive border-destructive/30',
};

type Review = {
  id: string;
  userId: string;
  rating: string;
  comment: string;
  displayName: string;
  reviewerDisplayName?: string;
  reviewedAt?: Date;
  createdAt?: Date;
  isVisible: boolean;
};

type CoursePodcastManifestItem = {
  lessonId: string;
  topicOrder: number;
  topicName: string;
  title: string;
  isOverview: boolean;
  hasPodcast: boolean;
  available: boolean;
  lockedReason: string | null;
  url: string | null;
  activeVersionId?: string | null;
  languageCode?: string | null;
  availableLanguages?: string[];
  versions?: Array<{
    id: string;
    title?: string | null;
    languageCode?: string | null;
    createdAt?: string;
    url?: string | null;
  }>;
};

export default function CourseDetail() {
  const [, params] = useRoute('/courses/:id');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { formatPrice } = useCurrencyPreference();
  const { user } = useUser();
  const { paymentGatewayEnabled } = usePlatformMode();
  const courseId = params?.id;
  const selectedLanguageCode = getRequestedLanguageCodeFromSearch(window.location.search);
  const selectedLanguageQuery = buildCourseLanguageQuery(selectedLanguageCode);
  
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [podcastLanguageByLessonId, setPodcastLanguageByLessonId] = useState<Record<string, string>>({});
  const [podcastVersionByLessonId, setPodcastVersionByLessonId] = useState<Record<string, string>>({});
  const [lessonLanguageByLessonId, setLessonLanguageByLessonId] = useState<Record<string, string>>({});

  const toggleLessonExpand = (lessonId: string) => {
    setExpandedLessons(prev => {
      const next = new Set(prev);
      if (next.has(lessonId)) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
      }
      return next;
    });
  };

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const urlIntentId = urlParams.get('intentId');
    const urlCheckoutId = urlParams.get('checkoutId');

    if (paymentStatus === 'success' && (urlIntentId || urlCheckoutId)) {
      setIntentId(urlIntentId);
      setCheckoutId(urlCheckoutId);
      setShowConfirmationModal(true);
      window.history.replaceState({}, '', `/courses/${courseId}${selectedLanguageQuery}`);
    } else if (paymentStatus === 'failed') {
      if (urlIntentId || urlCheckoutId) {
        setIntentId(urlIntentId);
        setCheckoutId(urlCheckoutId);
        setShowConfirmationModal(true);
      } else {
        toast({
          title: "Payment failed",
          description: "Please try again or contact support.",
          variant: "destructive",
        });
      }
      window.history.replaceState({}, '', `/courses/${courseId}${selectedLanguageQuery}`);
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled.",
      });
      window.history.replaceState({}, '', `/courses/${courseId}${selectedLanguageQuery}`);
    }
  }, [courseId, selectedLanguageQuery, toast]);

  const handleConfirmationClose = () => {
    setShowConfirmationModal(false);
    setIntentId(null);
    setCheckoutId(null);
    invalidatePurchaseCaches();
  };

  const handleContinueLearning = () => {
    if (!course) return;

    const lessons = (course.lessons || []).sort((a, b) => a.topicOrder - b.topicOrder);
    if (lessons.length === 0) return;

    // Determine if course is fully complete
    const isFullyComplete =
      course.userProgress &&
      course.userProgress.completedLessons === course.userProgress.totalLessons;

    // Navigate to first lesson, or last lesson if all are complete
    const targetLesson = isFullyComplete
      ? lessons[lessons.length - 1]
      : lessons[0];

    if (targetLesson && typeof targetLesson.lessonId === 'string') {
      const selectedCourseLanguageCode =
        selectedLanguageCode || String(course.languageCode || '').trim().toLowerCase() || null;
      setLocation(
        buildCourseLessonsHref({
          lessonId: targetLesson.lessonId,
          courseId: course.id,
          languageCode: selectedCourseLanguageCode,
        })
      );
    }
  };

  const { data: course, isLoading: courseLoading } = useQuery<CourseDetail>({
    queryKey: [`/api/courses/${courseId}`, { languageCode: selectedLanguageCode || undefined }],
    queryFn: () =>
      apiRequest(`/api/courses/${courseId}${selectedLanguageQuery}`),
    enabled: !!courseId,
  });

  useEffect(() => {
    if (course?.preferredCourseId && course.preferredCourseId !== courseId) {
      setLocation(buildCourseHref(course.preferredCourseId, selectedLanguageCode), { replace: true });
    }
  }, [course?.preferredCourseId, courseId, selectedLanguageCode, setLocation]);

  // Showcase and free public courses are fully accessible without enrollment.
  const isShowcaseCourse = course?.isShowcaseCourse ?? false;
  const hasAnonymousOpenAccess = course
    ? hasOpenPublicCourseAccess({
        isShowcaseCourse,
        visibility: course.visibility,
        status: course.status,
        isPaid: course.isPaid,
        price: course.price,
      })
    : false;
  
  const hasAccess = course
    ? (hasAnonymousOpenAccess
        ? true
        : (course.visibility === 'public' 
            ? (course.hasAccess ?? course.hasPurchased ?? false)
            : (course.isAssigned ?? course.hasAccess)))
    : false;
  const effectiveCourseLanguageCode =
    selectedLanguageCode || String(course?.languageCode || '').trim().toLowerCase() || null;

  const handleCourseLanguageChange = (nextLanguageCode: string) => {
    const normalized = String(nextLanguageCode || '').trim().toLowerCase();
    if (!normalized || !course) return;
    const targetVariant = (courseLanguages || []).find(
      (lang) => String(lang.code || '').trim().toLowerCase() === normalized
    );
    setLocation(buildCourseHref(targetVariant?.courseId || course.id, normalized));
  };

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery<{
    reviews: Review[];
    total: number;
  }>({
    queryKey: [`/api/courses/${courseId}/reviews`],
    enabled: !!courseId,
  });

  // Check if current user has already reviewed this course
  const hasUserReviewed = isAuthenticated && reviewsData?.reviews?.some(
    review => review.userId === user?.id
  );

  const { data: demoLessonData } = useQuery<{
    hasPurchased: boolean;
    lesson?: {
      id: string;
      title: string;
    };
    message?: string;
  }>({
    queryKey: [`/api/courses/${courseId}/demo-lesson`],
    enabled: !!courseId && !hasAccess,
    retry: false,
  });

  const { data: podcastManifest } = useQuery<{
    courseId: string;
    hasCourseAccess: boolean;
    items: CoursePodcastManifestItem[];
  }>({
    queryKey: [`/api/courses/${courseId}/podcast-manifest`, { languageCode: effectiveCourseLanguageCode || undefined }],
    queryFn: () => apiRequest(`/api/courses/${courseId}/podcast-manifest${effectiveCourseLanguageCode ? `?languageCode=${encodeURIComponent(effectiveCourseLanguageCode)}` : ''}`),
    enabled: !!courseId,
    retry: false,
  });

  const podcastItemByLessonId = new Map(
    (podcastManifest?.items || []).map((item) => [item.lessonId, item])
  );

  const { data: courseLanguages } = useQuery<Array<{ code: string; name: string; nativeName: string; courseId: string }>>({
    queryKey: ['/api/courses', courseId, 'languages'],
    enabled: !!courseId,
  });

  const sourceCourseLanguageCode = String(course?.languageCode || selectedLanguageCode || 'en').trim().toLowerCase() || 'en';
  const courseLanguageOptions = useMemo(() => {
    const map = new Map<string, { code: string; name: string; nativeName: string; courseId?: string }>();
    for (const lang of courseLanguages || []) {
      const code = String(lang.code || '').trim().toLowerCase();
      if (!code) continue;
      map.set(code, { code, name: lang.name || code.toUpperCase(), nativeName: lang.nativeName || lang.name || code.toUpperCase(), courseId: lang.courseId });
    }
    if (!map.has(sourceCourseLanguageCode)) {
      map.set(sourceCourseLanguageCode, {
        code: sourceCourseLanguageCode,
        name: sourceCourseLanguageCode.toUpperCase(),
        nativeName: sourceCourseLanguageCode.toUpperCase(),
        courseId: course?.id,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [courseLanguages, sourceCourseLanguageCode, course?.id]);

  // Certificate status query - only for authenticated users with course access
  const isCourseComplete = course?.userProgress?.completedLessons === course?.userProgress?.totalLessons && 
                           (course?.userProgress?.totalLessons ?? 0) >= 0;  // Allow 0 lessons (overview-only courses)
  const { data: certificateStatus, refetch: refetchCertificateStatus } = useQuery<{
    isEligible: boolean;
    reason: string;
    existingCertificateId?: string;
  }>({
    queryKey: [`/api/courses/${courseId}/certificate-status`],
    enabled: !!courseId && hasAccess && isCourseComplete && isAuthenticated,
    retry: false,
  });

  // Certificate generation mutation
  const generateCertificateMutation = useMutation({
    mutationFn: async () => {
      // apiRequest already parses and returns JSON data
      return await apiRequest(`/api/courses/${courseId}/certificate`, { method: 'POST' });
    },
    onSuccess: () => {
      refetchCertificateStatus();
      queryClient.invalidateQueries({ queryKey: ['/api/certificates'] });
      toast({
        title: "Certificate Generated!",
        description: "Your course completion certificate is ready for download.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Certificate Error",
        description: error.message || "Failed to generate certificate",
        variant: "destructive",
      });
    },
  });

  // Certificate download handler
  const handleDownloadCertificate = async () => {
    if (certificateStatus?.existingCertificateId) {
      // Download existing certificate
      window.open(`/api/certificates/${certificateStatus.existingCertificateId}/download`, '_blank');
    } else if (certificateStatus?.isEligible) {
      // Generate and then download
      generateCertificateMutation.mutate();
    }
  };

  const reviews = reviewsData?.reviews || [];

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Star key={i} className="h-4 w-4 fill-warning text-warning" />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <div key={i} className="relative h-4 w-4">
            <Star className="absolute h-4 w-4 text-warning" />
            <Star
              className="absolute h-4 w-4 fill-warning text-warning"
              style={{ clipPath: 'inset(0 50% 0 0)' }}
            />
          </div>
        );
      } else {
        stars.push(<Star key={i} className="h-4 w-4 text-muted-foreground/50" />);
      }
    }
    return stars;
  };

  if (courseLoading) {
    return (
      <div className="min-h-screen bg-surface-base text-foreground">
        <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
        <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 max-w-6xl">
          <Skeleton className="h-48 sm:h-64 w-full mb-6 sm:mb-8 rounded-lg bg-muted/50" />
          <Skeleton className="h-10 sm:h-12 w-3/4 mb-4 bg-muted/50" />
          <Skeleton className="h-5 sm:h-6 w-full mb-2 bg-muted/50" />
          <Skeleton className="h-5 sm:h-6 w-full mb-2 bg-muted/50" />
          <Skeleton className="h-5 sm:h-6 w-2/3 mb-6 sm:mb-8 bg-muted/50" />
          <div className="flex flex-col lg:flex-row gap-[var(--space-xl)]">
            <Skeleton className="h-80 sm:h-96 flex-1 lg:flex-[2] bg-muted/50" />
            <Skeleton className="h-80 sm:h-96 w-full lg:w-80 bg-muted/50" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-surface-base text-foreground flex items-center justify-center p-[var(--container-padding)]">
        <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
        <div className="text-center">
          <h1 
            className="font-bold mb-4 text-foreground" 
            style={{ fontSize: 'var(--text-2xl)' }}
            data-testid="text-course-not-found"
          >
            Course Not Found
          </h1>
          <Link href="/browse-courses">
            <Button className="min-h-[44px] touch-manipulation" data-testid="button-browse-courses" >
              Browse Courses
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Handle divide-by-zero for courses with only overview lessons (totalLessons = 0)
  const completionPercentage = course.userProgress
    ? (course.userProgress.totalLessons > 0 
        ? (course.userProgress.completedLessons / course.userProgress.totalLessons) * 100 
        : 100)  // Course with only overview = 100% complete
    : 0;

  return (
    <div className="min-h-screen bg-surface-base text-foreground">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <div
        className="relative h-48 sm:h-64 bg-surface-base mt-16 sm:mt-20"
        data-testid="course-hero"
      >
        {getCourseThumbnail(course) !== '/placeholder-course.svg' && (
          <img
            src={getCourseThumbnail(course)}
            alt={course.title}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="container mx-auto p-[var(--container-padding)] max-w-6xl relative h-full flex items-end">
          <div className="bg-card/80 backdrop-blur-sm rounded-lg p-[var(--card-padding)] w-full border border-border max-h-[calc(100%-1rem)] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className="border-0" data-testid="course-category">
                {course.category}
              </Badge>
              <Badge variant="outline" data-testid="course-difficulty">
                {course.difficultyLevel}
              </Badge>
              <Badge variant="outline" data-testid="course-version">
                v{course.latestVersion.versionNumber}
              </Badge>
              {isShowcaseCourse && (
                <Badge variant="warning" className="border-0" data-testid="showcase-badge">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Showcase Course
                </Badge>
              )}
              {courseLanguageOptions.length > 1 && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-2 sm:w-auto">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Language</span>
                  <Select
                    value={effectiveCourseLanguageCode || sourceCourseLanguageCode}
                    onValueChange={handleCourseLanguageChange}
                  >
                    <SelectTrigger className="h-10 min-h-[44px] w-full min-w-[9rem] text-xs sm:h-8 sm:min-h-[40px] sm:w-[120px]">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseLanguageOptions.map((lang) => (
                        <SelectItem key={`course-lang-${lang.code}`} value={lang.code} className="text-xs">
                          {lang.code.toUpperCase()} - {lang.nativeName || lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <h1 
              className="font-bold mb-2 text-foreground" 
              style={{ fontSize: 'var(--text-3xl)' }}
              data-testid="course-title"
            >
              {course.title}
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="flex">{renderStars(parseFloat(course.averageRating))}</div>
                <span data-testid="course-rating">
                  {parseFloat(course.averageRating).toFixed(1)} ({course.totalReviews} reviews)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span data-testid="course-students">{course.totalEnrollments} students</span>
              </div>
              {course.organizationName && (
                <div className="flex items-center gap-2" data-testid="course-org-branding">
                  {course.organizationLogoUrl ? (
                    <img 
                      src={course.organizationLogoUrl} 
                      alt={`${course.organizationName} logo`}
                      className="h-8 w-8 rounded-full object-contain flex-shrink-0 border border-[var(--stroke-default)]/20 bg-background p-0.5"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-[var(--surface-raised)]/10 flex items-center justify-center flex-shrink-0 border border-[var(--stroke-default)]/20">
                      <Globe className="h-4 w-4 text-[var(--fg-muted)]" />
                    </div>
                  )}
                  <span className="text-sm text-[var(--fg-muted)]">
                    by <span className="font-medium text-[var(--fg-strong)]">{course.organizationName}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-[var(--container-padding)] max-w-6xl relative z-10">
        <div className="flex flex-col lg:flex-row gap-[var(--space-xl)]">
          <div className="flex-1 lg:flex-[2] space-y-6 sm:space-y-8 order-2 lg:order-1">
            <Card className="bg-card/70 border border-border backdrop-blur-sm">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-foreground flex items-center gap-2" style={{ fontSize: 'var(--text-xl)' }}>
                  <BookOpen className="h-5 w-5 text-primary" />
                  About This Course
                </CardTitle>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <p className="text-muted-foreground whitespace-pre-wrap text-sm sm:text-base" data-testid="course-description">
                  {course.description}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/70 border border-border backdrop-blur-sm">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground" style={{ fontSize: 'var(--text-xl)' }}>
                    <BookOpen className="h-5 w-5 text-primary" />
                    Course Content ({course.lessons.length} lessons)
                  </CardTitle>
                  {courseLanguageOptions.length > 1 && (
                    <div className="w-full sm:w-[220px]">
                      <Select
                        value={effectiveCourseLanguageCode || sourceCourseLanguageCode}
                        onValueChange={handleCourseLanguageChange}
                      >
                        <SelectTrigger className="min-h-[44px] text-xs sm:h-9 sm:min-h-9">
                          <SelectValue placeholder="Course language" />
                        </SelectTrigger>
                        <SelectContent>
                          {courseLanguageOptions.map((lang) => (
                            <SelectItem key={`course-content-lang-${lang.code}`} value={lang.code} className="text-xs">
                              {lang.code.toUpperCase()} - {lang.nativeName || lang.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
                {course.lessons.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No lessons available yet.
                  </p>
                ) : (
                  course.lessons
                    .sort((a, b) => a.topicOrder - b.topicOrder)
                    .map((courseLesson, index) => {
                      const canAccess = hasAccess || courseLesson.lesson.isDemoLesson;
                      const podcastItem = podcastItemByLessonId.get(courseLesson.lessonId);
                      const lessonLanguageOptions = (() => {
                        const codes = new Set<string>();
                        const selected = String(effectiveCourseLanguageCode || sourceCourseLanguageCode).trim().toLowerCase();
                        if (selected) codes.add(selected);
                        for (const code of podcastItem?.availableLanguages || []) {
                          const normalized = String(code || '').trim().toLowerCase();
                          if (normalized) codes.add(normalized);
                        }
                        for (const option of courseLanguageOptions) {
                          if (option.code) codes.add(option.code);
                        }
                        if (codes.size === 0) codes.add(sourceCourseLanguageCode);
                        return Array.from(codes).sort((a, b) => a.localeCompare(b));
                      })();
                      const lessonSelectedLanguageCode =
                        lessonLanguageByLessonId[courseLesson.lessonId] ||
                        String(effectiveCourseLanguageCode || sourceCourseLanguageCode).trim().toLowerCase();
                      return (
                        <div
                          key={courseLesson.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-[var(--space-md)] rounded-lg border border-border gap-[var(--space-md)] min-h-[44px] ${
                            canAccess
                              ? 'hover:bg-primary/15 cursor-pointer bg-muted/50'
                              : 'bg-muted/30 cursor-not-allowed'
                          }`}
                          data-testid={`lesson-item-${courseLesson.lessonId}`}
                        >
                          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                              courseLesson.completed 
                                ? 'bg-success/30 text-success' 
                                : 'bg-primary/30 text-primary'
                            }`}>
                              {courseLesson.completed ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm sm:text-base truncate text-foreground" data-testid={`lesson-title-${courseLesson.lessonId}`}>
                                {courseLesson.lesson.title}
                              </h4>
                              {courseLesson.lesson.description && (
                                <div className="mt-1">
                                  <p className={`text-xs sm:text-sm text-muted-foreground ${
                                    expandedLessons.has(courseLesson.lessonId) ? '' : 'line-clamp-1'
                                  }`}>
                                    {courseLesson.lesson.description}
                                  </p>
                                  {(courseLesson.lesson.description.length > 80 || 
                                    (courseLesson.lesson.learningObjectives && courseLesson.lesson.learningObjectives.length > 0)) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLessonExpand(courseLesson.lessonId);
                                      }}
                                      className="text-xs text-primary hover:text-primary/80 mt-1 flex items-center gap-1"
                                    >
                                      {expandedLessons.has(courseLesson.lessonId) ? (
                                        <>
                                          <ChevronUp className="h-3 w-3" />
                                          Show less
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="h-3 w-3" />
                                          Show more
                                        </>
                                      )}
                                    </button>
                                  )}
                                  {expandedLessons.has(courseLesson.lessonId) && (
                                    <>
                                      {courseLesson.lesson.learningObjectives && courseLesson.lesson.learningObjectives.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                          <p className="text-xs font-medium text-foreground">Learning Objectives</p>
                                          <ul className="space-y-1">
                                            {courseLesson.lesson.learningObjectives.map((obj) => (
                                              <li key={obj.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                                                <CheckCircle className="h-3 w-3 mt-0.5 text-success flex-shrink-0" />
                                                <span>{obj.objective}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {courseLesson.lesson.bloomLevels && courseLesson.lesson.bloomLevels.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                          <p className="text-xs font-medium text-foreground">Bloom's Taxonomy Levels</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {courseLesson.lesson.bloomLevels.map((level) => (
                                              <Badge key={level} variant="outline" className={`text-[10px] px-1.5 py-0.5 capitalize ${bloomLevelColors[level] || 'bg-muted/20 text-muted-foreground border-border/30'}`} >
                                                {level}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                              {!courseLesson.lesson.description && 
                                courseLesson.lesson.learningObjectives && 
                                courseLesson.lesson.learningObjectives.length > 0 && (
                                <div className="mt-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLessonExpand(courseLesson.lessonId);
                                    }}
                                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                                  >
                                    {expandedLessons.has(courseLesson.lessonId) ? (
                                      <>
                                        <ChevronUp className="h-3 w-3" />
                                        Show less
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-3 w-3" />
                                        Show more
                                      </>
                                    )}
                                  </button>
                                  {expandedLessons.has(courseLesson.lessonId) && (
                                    <>
                                      {courseLesson.lesson.learningObjectives.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                          <p className="text-xs font-medium text-foreground">Learning Objectives</p>
                                          <ul className="space-y-1">
                                            {courseLesson.lesson.learningObjectives.map((obj) => (
                                              <li key={obj.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                                                <CheckCircle className="h-3 w-3 mt-0.5 text-success flex-shrink-0" />
                                                <span>{obj.objective}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {courseLesson.lesson.bloomLevels && courseLesson.lesson.bloomLevels.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                          <p className="text-xs font-medium text-foreground">Bloom's Taxonomy Levels</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {courseLesson.lesson.bloomLevels.map((level) => (
                                              <Badge key={level} variant="outline" className={`text-[10px] px-1.5 py-0.5 capitalize ${bloomLevelColors[level] || 'bg-muted/20 text-muted-foreground border-border/30'}`} >
                                                {level}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                              {courseLesson.lesson.isDemoLesson && (
                                <Badge className="mt-1">
                                  Demo
                                </Badge>
                              )}
                              {lessonLanguageOptions.length > 1 && (
                                <div className="mt-2 w-full max-w-[220px]">
                                  <Select
                                    value={lessonSelectedLanguageCode}
                                    onValueChange={(value) =>
                                      setLessonLanguageByLessonId((prev) => ({
                                        ...prev,
                                        [courseLesson.lessonId]: String(value || '').trim().toLowerCase(),
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="min-h-[44px] text-xs sm:h-8 sm:min-h-8">
                                      <SelectValue placeholder="Lesson language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {lessonLanguageOptions.map((code) => (
                                        <SelectItem key={`${courseLesson.lessonId}-lesson-lang-${code}`} value={code} className="text-xs">
                                          {code.toUpperCase()}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              {podcastItem?.hasPodcast && (
                                <div className="mt-3 rounded-md border border-border bg-card/60 p-2">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-xs font-medium text-foreground">
                                      Lesson Podcast
                                      {podcastItem.isOverview && (
                                        <span className="ml-2 text-[10px] text-muted-foreground">(Free preview)</span>
                                      )}
                                    </p>
                                    {!podcastItem.available && (
                                      <Badge variant="outline" >Locked</Badge>
                                    )}
                                  </div>
                                  {podcastItem.available && (podcastItem.availableLanguages?.length || 0) > 1 && (
                                    <div className="grid gap-2 md:grid-cols-2 mb-2">
                                      <Select
                                        value={podcastLanguageByLessonId[courseLesson.lessonId] || podcastItem.availableLanguages?.[0] || "en"}
                                        onValueChange={(value) => {
                                          setPodcastLanguageByLessonId((prev) => ({ ...prev, [courseLesson.lessonId]: value }));
                                          const firstVersionForLang = (podcastItem.versions || []).find((v) => (v.languageCode || "en") === value);
                                          setPodcastVersionByLessonId((prev) => ({
                                            ...prev,
                                            [courseLesson.lessonId]: firstVersionForLang?.id || "",
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="min-h-[44px] h-11 sm:h-8 text-xs touch-manipulation">
                                          <SelectValue placeholder="Language" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(podcastItem.availableLanguages || []).map((lang) => (
                                            <SelectItem key={lang} value={lang}>{lang.toUpperCase()}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Select
                                        value={
                                          podcastVersionByLessonId[courseLesson.lessonId] ||
                                          (podcastItem.versions || []).find((v) => (v.languageCode || "en") === (podcastLanguageByLessonId[courseLesson.lessonId] || podcastItem.availableLanguages?.[0] || "en"))?.id ||
                                          ""
                                        }
                                        onValueChange={(value) => setPodcastVersionByLessonId((prev) => ({ ...prev, [courseLesson.lessonId]: value }))}
                                      >
                                        <SelectTrigger className="min-h-[44px] h-11 sm:h-8 text-xs touch-manipulation">
                                          <SelectValue placeholder="Version" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(podcastItem.versions || [])
                                            .filter((v) => (v.languageCode || "en") === (podcastLanguageByLessonId[courseLesson.lessonId] || podcastItem.availableLanguages?.[0] || "en"))
                                            .map((v) => (
                                              <SelectItem key={v.id} value={v.id}>
                                                {(v.title || "Version")} ({new Date(v.createdAt || "").toLocaleDateString()})
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {podcastItem.available ? (
                                    <PodcastPlayer
                                      lessonId={courseLesson.lessonId}
                                      versionId={(() => {
                                        const selectedLanguage = podcastLanguageByLessonId[courseLesson.lessonId] || podcastItem.availableLanguages?.[0] || "en";
                                        const selectedVersionId = podcastVersionByLessonId[courseLesson.lessonId];
                                        const selectedVersion = selectedVersionId
                                          ? (podcastItem.versions || []).find((v) => v.id === selectedVersionId)
                                          : (podcastItem.versions || []).find((v) => (v.languageCode || "en") === selectedLanguage);
                                        return selectedVersion?.id || podcastItem.activeVersionId || null;
                                      })()}
                                      languageCode={podcastLanguageByLessonId[courseLesson.lessonId] || podcastItem.availableLanguages?.[0] || "en"}
                                      className="w-full"
                                      data-testid={`audio-course-lesson-podcast-${courseLesson.lessonId}`}
                                      debugContext="course_detail_lesson_card"
                                    />
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                      {podcastItem.lockedReason || "Podcast is currently unavailable for this lesson."}
                                    </p>
                                  )}
                                  {podcastItem.available && (
                                    <div className="mt-2">
                                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild >
                                        <a
                                          href={`/api/lessons/${courseLesson.lessonId}/podcast/download${(() => {
                                            const selectedLanguage = podcastLanguageByLessonId[courseLesson.lessonId] || podcastItem.availableLanguages?.[0] || "en";
                                            const selectedVersionId = podcastVersionByLessonId[courseLesson.lessonId] ||
                                              (podcastItem.versions || []).find((v) => (v.languageCode || "en") === selectedLanguage)?.id;
                                            const params = new URLSearchParams();
                                            if (selectedLanguage) params.set("languageCode", selectedLanguage);
                                            if (selectedVersionId) params.set("versionId", selectedVersionId);
                                            const query = params.toString();
                                            return query ? `?${query}` : "";
                                          })()}`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Download Podcast
                                        </a>
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex w-full justify-stretch sm:w-auto sm:justify-start">
                            {canAccess && typeof courseLesson.lessonId === 'string' ? (
                              <Link 
                                        href={
                                  hasAccess 
                                    ? buildCourseLessonsHref({
                                        lessonId: courseLesson.lessonId,
                                        courseId: course.id,
                                        languageCode: lessonSelectedLanguageCode,
                                      })
                                    : buildCourseLessonsHref({
                                        lessonId: courseLesson.lessonId,
                                        courseId: course.id,
                                        languageCode: lessonSelectedLanguageCode,
                                        demo: true,
                                      })
                                }
                              >
                                <Button variant="ghost" size="sm" className={`w-full min-h-[44px] touch-manipulation sm:w-auto ${ courseLesson.completed ? 'text-success' : 'text-primary' }`} data-testid={`button-start-lesson-${courseLesson.lessonId}`} >
                                  {courseLesson.completed ? (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Review
                                    </>
                                  ) : courseLesson.lesson.isDemoLesson && !hasAccess ? (
                                    <>
                                      <Play className="h-4 w-4 mr-1" />
                                      Try Demo
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-4 w-4 mr-1" />
                                      Start
                                    </>
                                  )}
                                </Button>
                              </Link>
                            ) : !canAccess ? (
                              <Lock className="h-5 w-5 text-muted-foreground" />
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/70 border border-border backdrop-blur-sm">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="flex items-center gap-2 text-foreground" style={{ fontSize: 'var(--text-xl)' }}>
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Student Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-6">
                {reviewsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full bg-muted/50" />
                    ))}
                  </div>
                ) : reviews.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No reviews yet.</p>
                ) : (
                  reviews.slice(0, 5).map((review) => (
                    <div key={review.id} className="space-y-2" data-testid={`review-${review.id}`}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border border-border">
                          <AvatarFallback className="bg-primary/30 text-primary">
                            {(review.reviewerDisplayName || review.displayName || 'A')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <p className="font-medium text-sm sm:text-base truncate text-foreground" data-testid={`review-author-${review.id}`}>
                              {review.reviewerDisplayName || review.displayName || 'Anonymous'}
                            </p>
                            <div className="flex">{renderStars(parseFloat(review.rating))}</div>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {new Date(review.createdAt || review.reviewedAt || Date.now()).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-muted-foreground text-sm sm:text-base pl-11 sm:pl-12" data-testid={`review-comment-${review.id}`}>
                          {review.comment}
                        </p>
                      )}
                      <Separator className="mt-4 bg-primary/20" />
                    </div>
                  ))
                )}
                {reviews.length > 5 && (
                  <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" data-testid="button-show-all-reviews" >
                    Show All {reviewsData?.total} Reviews
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="w-full lg:w-80 xl:w-96 space-y-6 order-1 lg:order-2">
            <Card className="lg:sticky lg:top-24 bg-card/70 border border-border backdrop-blur-sm">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-foreground">
                  <span style={{ fontSize: 'var(--text-xl)' }}>
                    {hasAnonymousOpenAccess ? 'Start Learning' : (hasAccess ? 'Your Progress' : 'Enroll Now')}
                  </span>
                  {isShowcaseCourse ? (
                    <Badge className="text-base sm:text-lg px-3 py-1 w-fit border-0" data-testid="course-free-badge">
                      FREE ACCESS
                    </Badge>
                  ) : course.isPaid ? (
                    paymentGatewayEnabled ? (
                      <span className="text-xl sm:text-2xl font-bold text-primary" data-testid="course-price">
                        {formatPrice(course.price, course.currency as 'ZAR' | 'USD' | 'EUR')}
                      </span>
                    ) : (
                      <Badge className="text-base sm:text-lg px-3 py-1 w-fit border-0" data-testid="course-included-badge">
                        Included
                      </Badge>
                    )
                  ) : (
                    <Badge className="text-base sm:text-lg px-3 py-1 w-fit border-0" data-testid="course-free-badge">
                      FREE
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
                {hasAccess ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Your Progress</span>
                        <span className="font-medium text-foreground">
                          {Math.round(completionPercentage)}%
                        </span>
                      </div>
                      <Progress value={completionPercentage} className="bg-muted" data-testid="progress-bar" />
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {course.userProgress?.completedLessons} of{' '}
                        {course.userProgress?.totalLessons} lessons completed
                      </p>
                    </div>
                    <Separator className="bg-primary/20" />
                    <Button className="w-full min-h-[44px] touch-manipulation" size="lg" onClick={handleContinueLearning} data-testid="button-continue-learning" >
                      <Play className="h-4 w-4 mr-2" />
                      {hasAnonymousOpenAccess && !course.userProgress?.completedLessons ? 'Start Learning' : 'Continue Learning'}
                    </Button>
                    {isCourseComplete && isAuthenticated && (
                      <>
                        {/* Certificate Download Button */}
                        {(certificateStatus?.existingCertificateId || certificateStatus?.isEligible) && (
                          <Button onClick={handleDownloadCertificate} disabled={generateCertificateMutation.isPending} className="w-full min-h-[44px] touch-manipulation font-semibold" data-testid="button-download-certificate" >
                            {generateCertificateMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Award className="h-4 w-4 mr-2" />
                                {certificateStatus?.existingCertificateId ? 'Download Certificate' : 'Get Certificate'}
                              </>
                            )}
                          </Button>
                        )}
                        {!hasUserReviewed && (
                          <Link href={`/courses/${course.id}/rate`}>
                            <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" data-testid="button-rate-course" >
                              <Star className="h-4 w-4 mr-2" />
                              Rate This Course
                            </Button>
                          </Link>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                        <span>Lifetime access</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                        <span>{course.lessons.length} lessons</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                        <span>Certificate of completion</span>
                      </div>
                    </div>
                    <Separator className="bg-primary/20" />
                    {demoLessonData?.lesson && !hasAccess && (
                      <>
                        <Link href={`/demo-lesson/${course.id}/${demoLessonData.lesson.id}`}>
                          <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" data-testid="button-view-demo" >
                            <Play className="h-4 w-4 mr-2" />
                            Try Demo Lesson
                          </Button>
                        </Link>
                        <p className="text-xs text-center text-muted-foreground">
                          Preview the first lesson for free
                        </p>
                      </>
                    )}
                    <Link href={!isAuthenticated ? `/register?redirect=${encodeURIComponent(`/courses/${course.id}/purchase`)}` : `/courses/${course.id}/purchase`}>
                      <Button className="w-full min-h-[44px] touch-manipulation" size="lg" data-testid="button-enroll-now" >
                        {course.isPaid ? (
                          <>
                            {paymentGatewayEnabled && <ShoppingCart className="h-4 w-4 mr-2" />}
                            {!isAuthenticated ? 'Register to Purchase' : paymentGatewayEnabled ? 'Purchase Course' : 'Enroll to Course'}
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Enroll for Free
                          </>
                        )}
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {showConfirmationModal && (
        <PurchaseConfirmationModal
          intentId={intentId}
          checkoutId={checkoutId}
          onClose={handleConfirmationClose}
          onSuccess={() => invalidatePurchaseCaches()}
        />
      )}
    </div>
  );
}
