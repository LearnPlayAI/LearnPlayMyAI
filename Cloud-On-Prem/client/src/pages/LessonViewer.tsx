import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  ArrowLeft,
  Download,
  Link as LinkIcon,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Trophy,
  Upload,
  Play,
  FileQuestion,
  Sparkles,
  BookOpen,
  Home,
  AlertCircle,
  Video,
  Presentation,
  Globe,
  RefreshCw,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getThemeConfettiColors } from "@/lib/themePalettes";
import { useUser } from "@/hooks/use-user";
import { useAuth } from "@/hooks/useAuth";
import { useShowcaseMode } from "@/hooks/useShowcaseMode";
import { ShowcaseBanner } from "@/components/ShowcaseBanner";
import { saveLessonProgress, getLessonProgress } from "@/lib/anonymousProgress";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState, useEffect, useRef, useMemo } from "react";
import { useLessonProgress, useUpdateLessonProgress } from "@/hooks/useLessonProgress";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import { usePresentationVersions, useDownloadPresentationVersion } from "@/hooks/useLessonVersions";
import { VideoPlayer } from "@/components/VideoPlayer";
import { PodcastPlayer } from "@/components/PodcastPlayer";

import { SlideImageViewer } from "@/components/SlideImageViewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import confetti from "canvas-confetti";
import { isValidDownloadUrl, safeDownload, generatePptxFilename } from "@/lib/downloadHelper";
import {
  buildLessonVariantSearchParams,
  getPreferredPodcastVersionId,
  resolveLessonViewerBackTarget,
  resolvePodcastSelection,
} from "@/lib/lessonNavigationState";
import {
  buildLessonLanguageOptions,
  hasRenderableLessonContent as resolveHasRenderableLessonContent,
} from "@/lib/lessonViewerState";
import type { SourceLessonContent } from "@shared/sourceLessonContent";
import type {
  SourceLessonMaterialV2,
  SourceLessonMaterialV2Block,
  SourceLessonMaterialV2Section,
  SourceLessonMaterialV2Visual,
} from "@shared/sourceLessonMaterialV2";

const normalizeLanguageCode = (value: unknown): string =>
  String(value || "").trim().toLowerCase();

type ViewerConversionStatus = "ready" | "pending" | "failed" | "unsupported";

type LessonDigestSection = {
  id: "overview" | "key_concepts" | "how_it_works" | "real_world" | "key_takeaways" | "key_terms";
  title: string;
  summary?: string;
  paragraphs: string[];
  bullets: string[];
  sourceChunkIds: string[];
};

type LessonDigestPayload = {
  schemaVersion: "v1";
  languageCode: string;
  versionRef: string;
  generatedAt: string;
  sections: LessonDigestSection[];
  sourceChunks: Array<{
    id: string;
    title: string;
    text: string;
  }>;
};

type StepByStepGuideStep = {
  id: string;
  title: string;
  content: string;
  commands: string[];
  imageUrls: string[];
};

type StepByStepGuidePayload = {
  schemaVersion: "v1";
  languageCode: string;
  versionRef: string;
  generatedAt: string;
  sourceType: "upload" | "translated" | "manual";
  sourceFilename?: string;
  summary?: string;
  steps: StepByStepGuideStep[];
};

type LessonSourceAsset = {
  assetId?: string;
  id?: string;
  signedUrl?: string;
  caption?: string | null;
  altText?: string | null;
  pageOrSlide?: number | null;
  containsEmbeddedText?: boolean | null;
  recommendedUse?: "lesson_visual" | "quiz_stimulus" | "reference";
};

type ViewerSourceLessonMaterial = SourceLessonContent | SourceLessonMaterialV2;

const isSourceLessonMaterialV2 = (
  content: ViewerSourceLessonMaterial | null | undefined
): content is SourceLessonMaterialV2 => content?.version === 2;

const getSourceLessonVisualCount = (content: ViewerSourceLessonMaterial | null | undefined): number => {
  if (!content) return 0;
  if (isSourceLessonMaterialV2(content)) return content.visualRegistry.length;
  return content.summary?.totalVisuals ?? 0;
};

const getSourceLessonGeneratedAt = (content: ViewerSourceLessonMaterial | null | undefined): string => {
  if (!content) return "";
  if (isSourceLessonMaterialV2(content)) return content.generation.generatedAt;
  return content.generatedAt;
};

const getAssetKey = (asset: LessonSourceAsset): string => String(asset.assetId || asset.id || "").trim();

const getVisualRangeLabel = (
  section: SourceLessonContent["sections"][number] | SourceLessonMaterialV2Section
): string | null => {
  if (isSourceLessonMaterialV2Section(section)) {
    const start = section.sourcePageStart ?? section.sourceSlideStart;
    const end = section.sourcePageEnd ?? section.sourceSlideEnd;
    const label = section.sourceSlideStart || section.sourceSlideEnd ? "Slide" : "Page";
    if (!start && !end) return null;
    return start === end ? `${label} ${start}` : `${label} ${start || end}-${end || start}`;
  }
  if (!section.sourcePageStart && !section.sourcePageEnd) return null;
  return section.sourcePageStart === section.sourcePageEnd
    ? `Page ${section.sourcePageStart}`
    : `Page ${section.sourcePageStart || section.sourcePageEnd}-${section.sourcePageEnd || section.sourcePageStart}`;
};

const isSourceLessonMaterialV2Section = (
  section: SourceLessonContent["sections"][number] | SourceLessonMaterialV2Section
): section is SourceLessonMaterialV2Section => "blocks" in section;

type LessonViewerResponse = {
  viewerUrl?: string;
  pptxUrl?: string;
  isLocalPptx?: boolean;
  conversionPending?: boolean;
  conversionStatus?: ViewerConversionStatus | null;
  conversionError?: string | null;
  slideImages?: { slideCount: number; urls: string[] };
  videoUrl?: string;
  hasVideo: boolean;
  hasPPTX: boolean;
  hasGammaSlides: boolean;
  podcast?: {
    currentJob?: { status?: "idle" | "processing" | "completed" | "failed"; errorMessage?: string };
    activeUrl?: string | null;
    activeVersion?: {
      id: string;
      title?: string;
      sourceType?: string;
      voiceName?: string;
      createdAt?: string;
      languageCode?: string;
    } | null;
    versions?: Array<{
      id: string;
      status: "completed" | "failed";
      title?: string;
      errorMessage?: string;
      createdAt: string;
      languageCode?: string;
    }>;
  } | null;
  lessonDigest?: LessonDigestPayload | null;
  stepByStepGuide?: StepByStepGuidePayload | null;
  sourceLessonContent?: ViewerSourceLessonMaterial | null;
  lesson?: {
    id: string;
    title?: string;
    description?: string;
    languageCode?: string;
    contentGroupId?: string;
    sourceAssets?: LessonSourceAsset[];
  } | null;
  languageResolution?: {
    requestedLanguageCode?: string | null;
    resolvedLanguageCode?: string | null;
    strategy?: string | null;
    variantId?: string | null;
  } | null;
  artifactResolution?: {
    selectedLanguageCode?: string | null;
    sourceLanguageCode?: string | null;
    pptx?: {
      requestedLessonId?: string | null;
      resolvedLessonId?: string | null;
      isFallback?: boolean | null;
    } | null;
    video?: {
      requestedLessonId?: string | null;
      resolvedLessonId?: string | null;
      isFallback?: boolean | null;
    } | null;
    podcast?: {
      requestedLessonId?: string | null;
      resolvedLessonId?: string | null;
      isFallback?: boolean | null;
    } | null;
    digest?: {
      isUnavailableForRequestedLanguage?: boolean;
      requestedLessonId?: string | null;
      resolvedLessonId?: string | null;
      isFallback?: boolean | null;
      languageCode?: string | null;
    } | null;
    stepGuide?: {
      isUnavailableForRequestedLanguage?: boolean;
      requestedLessonId?: string | null;
      resolvedLessonId?: string | null;
      isFallback?: boolean | null;
      languageCode?: string | null;
    } | null;
  } | null;
};

const isSlideConversionPending = (data?: {
  conversionPending?: boolean;
  conversionStatus?: ViewerConversionStatus | null;
}) => data?.conversionStatus === "pending" || !!data?.conversionPending;

const getSlideConversionMessage = (data?: {
  conversionStatus?: ViewerConversionStatus | null;
  conversionError?: string | null;
}) => {
  if (data?.conversionStatus === "unsupported") {
    return data.conversionError || "Slide conversion is unavailable on this host.";
  }
  if (data?.conversionStatus === "failed") {
    return data.conversionError || "Slide conversion failed.";
  }
  return "Slides are being prepared. Please refresh in a moment.";
};

export default function LessonViewer() {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const { isTeacher, isOrgAdmin, isSuperAdmin, isAdmin, effectiveOrganizationId } = useAuth();
  const { isShowcaseMode } = useShowcaseMode();
  
  // Normalize lessonId - ensure it's always a string to prevent [object Object] URLs
  const rawLessonId = params.lessonId;
  const lessonId: string | undefined = typeof rawLessonId === 'string' 
    ? rawLessonId 
    : (rawLessonId && typeof rawLessonId === 'object' && 'id' in rawLessonId) 
      ? String((rawLessonId as any).id)
      : undefined;
  
  // Track if we've shown the invalid lessonId error
  const [hasShownInvalidError, setHasShownInvalidError] = useState(false);
  
  // Extract courseId and demo mode from query params
  const rawSearch = typeof window !== 'undefined' && window.location?.search
    ? window.location.search
    : (location.includes('?') ? `?${location.split('?')[1] || ''}` : '');
  const searchParams = new URLSearchParams(rawSearch);
  const urlCourseId = searchParams.get('courseId');
  const requestedFocus = String(searchParams.get('focus') || '').trim().toLowerCase();
  const wantsPptxFocus = requestedFocus === "pptx" || requestedFocus === "slides" || requestedFocus === "presentation";
  const requestedLanguageCode = String(searchParams.get('languageCode') || searchParams.get('lang') || '').trim().toLowerCase();
  const requestedPodcastVersionId = String(searchParams.get('podcastVersionId') || '').trim();
  const requestedDigestVersionId = String(searchParams.get('versionId') || '').trim();
  const requestedStepGuideVersionId = String(searchParams.get('stepGuideVersionId') || '').trim();
  const isDemoMode = searchParams.get('demo') === 'true';
  const hasAppliedRequestedPodcastRef = useRef(false);
  
  // Fetch courseId from lesson's course association when not in URL params
  const { data: lessonCourseData } = useQuery<{ courseId: string } | null>({
    queryKey: ['/api/lessons', lessonId, 'course-context'],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}/course-context`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !urlCourseId && !isDemoMode && !!lessonId && !!user,
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Effective courseId: prefer URL param, fallback to lesson's course association
  const courseId = urlCourseId || lessonCourseData?.courseId || null;
  const viewerBackUrl = useMemo(() => resolveLessonViewerBackTarget({
    returnTo: searchParams.get('returnTo'),
    courseId,
    courseUrl: courseId ? `/courses/${courseId}` : null,
    defaultUrl: "/browse-courses",
  }), [courseId, rawSearch]);
  
  // Check if user has teacher/admin permissions
  const canManageLesson = isTeacher || isOrgAdmin || isSuperAdmin || isAdmin;
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [videoUploadDialogOpen, setVideoUploadDialogOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isMediaFullscreen, setIsMediaFullscreen] = useState(false);
  const [isProgressRailCollapsed, setIsProgressRailCollapsed] = useState(false);
  const [isMobileSidePanelOpen, setIsMobileSidePanelOpen] = useState(false);
  const hasShownLandscapeToastRef = useRef(false);
  
  // Track if we had a previously loaded lesson (for session continuity)
  const [previouslyLoadedLesson, setPreviouslyLoadedLesson] = useState<any>(null);
  const hasShownUnavailableToastRef = useRef(false);
  
  // Content display mode: "video" or "slides" - used when both video and slides exist
  const [activeContentTab, setActiveContentTab] = useState<"video" | "slides">("video");
  
  // Track which version is being downloaded (for loading state)
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const isDownloadInProgress = downloadingVersionId !== null;
  const [activeDigestSectionId, setActiveDigestSectionId] = useState<string>("overview");
  const [activeGuidedContentMode, setActiveGuidedContentMode] = useState<"digest" | "step_by_step">("digest");
  const [activeSourceSectionId, setActiveSourceSectionId] = useState<string>("");
  const [isLessonMaterialExpanded, setIsLessonMaterialExpanded] = useState(false);
  
  // Track local progress for anonymous showcase mode
  const [localProgress, setLocalProgress] = useState<{ viewedSlides: number[]; lastViewedSlide: number } | null>(null);

  const hasAutoRedirectedLanguageRef = useRef(false);
  const hasShownRequestedLanguageFallbackRef = useRef(false);

  // Showcase mode: Fetch lesson data from public endpoint for anonymous users
  const { data: showcaseData, isLoading: showcaseLoading, isError: isShowcaseError } = useQuery<{
    lesson: {
      id: string;
      title: string;
      description?: string;
      slideCount?: number;
    };
  } & LessonViewerResponse>({
    queryKey: ["/api/public/lessons", lessonId, "viewer"],
    queryFn: () =>
      fetch(`/api/public/lessons/${lessonId}/viewer`).then((r) => {
        if (!r.ok) throw new Error('Showcase lesson not available');
        return r.json();
      }),
    enabled: isShowcaseMode && !!lessonId && !isDemoMode,
    retry: false,
  });

  // Showcase mode: Fetch linked quiz for anonymous users
  const { data: showcaseQuizData } = useQuery<{
    quiz: {
      id: string;
      name: string;
      description?: string;
    } | null;
  }>({
    queryKey: ["/api/public/lessons", lessonId, "quiz"],
    queryFn: () =>
      fetch(`/api/public/lessons/${lessonId}/quiz`).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch quiz');
        return r.json();
      }),
    enabled: isShowcaseMode && !!lessonId && !isDemoMode,
    retry: false,
  });

  // Load local progress for showcase mode on mount
  useEffect(() => {
    if (isShowcaseMode && lessonId) {
      const savedProgress = getLessonProgress(lessonId);
      if (savedProgress) {
        setLocalProgress({
          viewedSlides: savedProgress.viewedSlides,
          lastViewedSlide: savedProgress.lastViewedSlide,
        });
      }
    }
  }, [isShowcaseMode, lessonId]);

  // Fetch course data for breadcrumb (when courseId is available)
  const { data: courseData } = useQuery<{
    id: string;
    title: string;
    description?: string;
  }>({
    queryKey: ['/api/courses', courseId, requestedLanguageCode || null],
    queryFn: () =>
      fetch(`/api/courses/${courseId}${requestedLanguageCode ? `?languageCode=${encodeURIComponent(requestedLanguageCode)}` : ''}`).then((r) => {
        if (!r.ok) throw new Error('Course not found');
        return r.json();
      }),
    enabled: !!courseId && !isDemoMode,
    retry: false,
  });

  const { data: courseLanguages } = useQuery<Array<{
    code: string;
    name: string;
    nativeName: string;
    courseId: string;
  }>>({
    queryKey: ['/api/courses', courseId, 'languages'],
    queryFn: () =>
      fetch(`/api/courses/${courseId}/languages`).then(r => r.json()),
    enabled: !!courseId && !isDemoMode && !isShowcaseMode,
    staleTime: 60000,
  });

  const effectiveCourseId = useMemo(() => {
    if (!courseId || !courseLanguages) return courseId;
    const normalizedRequested = String(requestedLanguageCode || '').trim().toLowerCase();
    if (normalizedRequested) {
      const requestedCourse = courseLanguages.find((courseLang) => String(courseLang.code || '').trim().toLowerCase() === normalizedRequested);
      if (requestedCourse?.courseId) return requestedCourse.courseId;
    }
    return courseId;
  }, [courseId, courseLanguages, requestedLanguageCode]);

  // Fetch course lessons (from published courseLessons table) for navigation sidebar
  const { data: courseFramework, isLoading: isLoadingCourseFramework } = useQuery<{
    lessons: Array<{
      id: string;
      lessonId: string;
      topicName: string;
      topicOrder: number;
      primaryQuizId?: string;
      lesson?: {
        id: string;
        title: string;
        generationStatus: string;
      } | null;
    }>;
  }>({
    queryKey: ['/api/courses', effectiveCourseId, 'lessons'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${effectiveCourseId}/lessons`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Course lessons not found');
      return response.json();
    },
    enabled: !!effectiveCourseId && !isDemoMode && !!user,
    retry: false,
  });

  // Derive current lesson's topicOrder from courseFramework for navigation to upload page
  const currentLessonEntry = courseFramework?.lessons?.find(l => l.lessonId === lessonId);
  const currentTopicOrder = currentLessonEntry?.topicOrder;
  const isReplacePptxReady = courseId && currentTopicOrder !== undefined;

  // Fetch quiz progress for course sidebar completion badges
  const { data: quizProgress } = useQuery<{
    courseId: string;
    lessons: Array<{
      lessonId: string;
      lessonTitle: string;
      hasQuiz: boolean;
      quizId?: string;
      quizPassed: boolean;
      bestScore?: number;
    }>;
  }>({
    queryKey: ['/api/courses', effectiveCourseId, 'quiz-progress'],
    queryFn: () =>
      fetch(`/api/courses/${effectiveCourseId}/quiz-progress`, {
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return { courseId: effectiveCourseId, lessons: [] };
        return r.json();
      }),
    enabled: !!effectiveCourseId && !isDemoMode && !!user,
    retry: false,
  });

  // Demo lesson data for anonymous viewing
  const { data: demoData, isLoading: demoLoading } = useQuery<{
    lesson: {
      id: string;
      title: string;
      description: string;
      generationStatus: string;
      videoUrl?: string;
      isDemo: boolean;
    };
    courseId: string;
    courseName: string;
  } & LessonViewerResponse>({
    queryKey: ["/api/courses", courseId, "lessons", lessonId, "demo"],
    queryFn: () =>
      fetch(`/api/courses/${courseId}/lessons/${lessonId}/demo`).then((r) => {
        if (!r.ok) throw new Error('Demo lesson not available');
        return r.json();
      }),
    enabled: isDemoMode && !!courseId && !!lessonId,
    retry: false,
  });

  // Fetch lesson data (authenticated mode) with error handling for unavailable lessons
  const { data: lesson, isLoading, error: lessonError, isError: isLessonError, refetch: refetchLesson } = useQuery({
    queryKey: ["/api/lessons", lessonId, effectiveOrganizationId],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}?organizationId=${effectiveOrganizationId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || 'Lesson not found') as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    enabled: !!lessonId && !!effectiveOrganizationId && !isDemoMode && !isShowcaseMode,
    retry: false,
    refetchInterval: (query) => {
      const status = String((query.state.data as any)?.generationStatus || "").toLowerCase();
      return status === "pending" || status === "processing" || status === "polling" ? 3000 : false;
    },
    refetchIntervalInBackground: true,
  });
  
  // Track if lesson becomes unavailable after being previously loaded
  useEffect(() => {
    if (lesson && !isLessonError) {
      setPreviouslyLoadedLesson(lesson);
    }
  }, [lesson, isLessonError]);
  
  // Show toast when lesson becomes unavailable on refresh
  useEffect(() => {
    if (isLessonError && !hasShownUnavailableToastRef.current) {
      hasShownUnavailableToastRef.current = true;
      toast({
        variant: "default",
        title: "Lesson no longer available",
        description: "This lesson has been updated by your instructor. Please select a different lesson.",
      });
    }
  }, [isLessonError, toast]);
  
  // Use cached lesson only on hard error to preserve continuity.
  // Do not use it during normal variant/language switches to avoid stale-language rendering.
  const effectiveLessonData = lesson || (isLessonError ? previouslyLoadedLesson : null);
  const isLessonUnavailable = isLessonError && !previouslyLoadedLesson;
  const isUsingCachedContent = isLessonError && !!previouslyLoadedLesson;

  const currentLessonContentGroupId = effectiveLessonData?.contentGroupId || lessonId;

  // Fetch viewer URL (authenticated mode)
  const { data: viewerData, refetch: refetchViewerData } = useQuery<LessonViewerResponse>({
    queryKey: ["/api/lessons", lessonId, "viewer", effectiveOrganizationId, requestedLanguageCode || null, requestedDigestVersionId || null, requestedStepGuideVersionId || null, requestedPodcastVersionId || null],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}/viewer?${(() => {
        const params = new URLSearchParams();
        params.set('organizationId', String(effectiveOrganizationId));
        if (requestedLanguageCode) params.set('languageCode', requestedLanguageCode);
        if (requestedDigestVersionId) params.set('versionId', requestedDigestVersionId);
        if (requestedStepGuideVersionId) params.set('stepGuideVersionId', requestedStepGuideVersionId);
        if (requestedPodcastVersionId) params.set('podcastVersionId', requestedPodcastVersionId);
        return params.toString();
      })()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(String(errorData?.error || errorData?.message || `Failed to load lesson viewer (${response.status})`));
      }
      return response.json();
    },
    enabled: !!lessonId && !!effectiveOrganizationId && !isDemoMode && !isShowcaseMode,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (isSlideConversionPending(data)) return 3000;
      if (data?.podcast?.currentJob?.status === "processing") return 3000;
      if (
        wantsPptxFocus &&
        data?.isLocalPptx &&
        data?.hasPPTX &&
        !(data?.slideImages?.urls?.length) &&
        data?.conversionStatus !== "failed" &&
        data?.conversionStatus !== "unsupported"
      ) {
        return 3000;
      }
      return false;
    },
  });
  
  const { data: availableLanguages } = useQuery<Array<{
    code: string;
    name: string;
    nativeName: string;
    lessonId: string;
    isDefault: boolean;
  }>>({
    queryKey: ['/api/lessons', lessonId, 'languages'],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}/languages`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!lessonId && !isDemoMode && !isShowcaseMode,
    staleTime: 60000,
  });

  const { data: orgSettings } = useQuery<{ defaultLanguage?: string }>({
    queryKey: ['/api/organization/settings'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const activeLanguageCodeFromViewer = normalizeLanguageCode(
    viewerData?.languageResolution?.resolvedLanguageCode ||
      viewerData?.lesson?.languageCode ||
      requestedLanguageCode ||
      availableLanguages?.find((lang) => lang.lessonId === lessonId)?.code ||
      "en"
  ) || "en";

  const lessonLanguageOptions = useMemo(
    () => buildLessonLanguageOptions({
      availableLanguages,
      artifactResolution: viewerData?.artifactResolution,
    }),
    [availableLanguages, viewerData?.artifactResolution]
  );
  const activeLanguageMeta =
    lessonLanguageOptions.find((lang) => normalizeLanguageCode(lang.code) === activeLanguageCodeFromViewer) ||
    lessonLanguageOptions.find((lang) => lang.lessonId === lessonId) ||
    null;

  useEffect(() => {
    if (!availableLanguages || !lessonId || isDemoMode || isShowcaseMode || hasAutoRedirectedLanguageRef.current) {
      return;
    }
    if (courseId && !courseLanguages) {
      return;
    }

    hasAutoRedirectedLanguageRef.current = true;

    const params = new URLSearchParams(location.split('?')[1] || '');
    if (params.get('lang')) {
      params.delete('lang');
      const cleanQs = params.toString();
      window.history.replaceState(null, '', `/lessons/${lessonId}${cleanQs ? `?${cleanQs}` : ''}`);
      return;
    }

    const currentLessonLangEntry = availableLanguages.find(l => l.lessonId === lessonId);
    const currentLessonLanguage = currentLessonLangEntry?.code;
    if (requestedLanguageCode) {
      return;
    }
    if (courseId && currentLessonLangEntry && !currentLessonLangEntry.isDefault && courseLanguages) {
      const courseForCurrentLang = courseLanguages.find(c => c.code === currentLessonLanguage);
      if (courseForCurrentLang && courseForCurrentLang.courseId === courseId) {
        return;
      }
    }

    const languagePriority = [
      user?.preferredLanguage,
      orgSettings?.defaultLanguage,
      'en',
    ].filter((lang): lang is string => !!lang && lang !== currentLessonLanguage);

    for (const lang of languagePriority) {
      const variant = availableLanguages.find(l => l.code === lang);
      if (variant && variant.lessonId !== lessonId) {
        const newParams = new URLSearchParams();
        if (courseId) newParams.set('courseId', courseId);
        const returnTo = params.get('returnTo');
        if (returnTo) newParams.set('returnTo', returnTo);
        const qs = newParams.toString();
        setLocation(`/lessons/${variant.lessonId}${qs ? `?${qs}` : ''}`);
        return;
      }
    }
  }, [availableLanguages, lessonId, isDemoMode, isShowcaseMode, user?.preferredLanguage, orgSettings?.defaultLanguage, courseId, courseLanguages, location, setLocation, requestedLanguageCode]);

  useEffect(() => {
    hasAutoRedirectedLanguageRef.current = false;
    hasShownRequestedLanguageFallbackRef.current = false;
  }, [lessonId, requestedLanguageCode, availableLanguages?.length]);

  useEffect(() => {
    if (!requestedLanguageCode || !availableLanguages || !lessonId || isDemoMode || isShowcaseMode || hasShownRequestedLanguageFallbackRef.current) {
      return;
    }
    const codes = new Set(availableLanguages.map((lang) => String(lang.code || '').toLowerCase()).filter(Boolean));
    if (codes.has(requestedLanguageCode)) return;

    hasShownRequestedLanguageFallbackRef.current = true;
    const fallback = availableLanguages.find((lang) => lang.lessonId === lessonId) || availableLanguages[0];
    const fallbackCode = String(fallback?.code || 'en').toLowerCase();
    const fallbackLessonId = String(fallback?.lessonId || lessonId);

    toast({
      title: "Requested language unavailable",
      description: `Showing ${fallbackCode.toUpperCase()} because ${requestedLanguageCode.toUpperCase()} is not available for this lesson.`,
    });

    const params = new URLSearchParams(location.split('?')[1] || '');
    if (fallbackCode) params.set('languageCode', fallbackCode);
    if (courseId) params.set('courseId', courseId);
    const query = params.toString();
    if (fallbackLessonId !== lessonId) {
      setLocation(`/lessons/${fallbackLessonId}${query ? `?${query}` : ''}`);
      return;
    }
    window.history.replaceState(null, '', `/lessons/${lessonId}${query ? `?${query}` : ''}`);
  }, [requestedLanguageCode, availableLanguages, lessonId, isDemoMode, isShowcaseMode, courseId, location, setLocation, toast]);

  // Merge demo, showcase, and regular lesson data
  // Use effectiveLessonData to allow session continuity when lesson becomes unavailable
  const effectiveLesson = isShowcaseMode 
    ? showcaseData?.lesson 
    : isDemoMode 
      ? demoData?.lesson 
      : (viewerData?.lesson || effectiveLessonData);
  const effectiveViewerUrl = isShowcaseMode 
    ? showcaseData?.viewerUrl 
    : isDemoMode 
      ? demoData?.viewerUrl 
      : viewerData?.viewerUrl;
  const effectivePptxUrl = isShowcaseMode
    ? showcaseData?.pptxUrl
    : isDemoMode
      ? demoData?.pptxUrl
      : viewerData?.pptxUrl;
  const effectiveIsLocalPptx = isShowcaseMode
    ? showcaseData?.isLocalPptx
    : isDemoMode
      ? demoData?.isLocalPptx
      : viewerData?.isLocalPptx;
  const effectiveSlideImages = isShowcaseMode
    ? showcaseData?.slideImages
    : isDemoMode
      ? demoData?.slideImages
      : viewerData?.slideImages;
  const effectiveVideoUrl = isShowcaseMode 
    ? showcaseData?.videoUrl 
    : viewerData?.videoUrl;
  const effectivePodcast = isShowcaseMode
    ? showcaseData?.podcast
    : isDemoMode
      ? demoData?.podcast
      : viewerData?.podcast;
  const effectiveSourceAssets = (
    ((effectiveLesson as any)?.sourceAssets as LessonSourceAsset[] | undefined) ||
    ((effectiveLessonData as any)?.sourceAssets as LessonSourceAsset[] | undefined) ||
    []
  ).filter((asset) => asset?.signedUrl);
  const effectiveSourceAssetById = useMemo(() => {
    const byId = new Map<string, LessonSourceAsset>();
    effectiveSourceAssets.forEach((asset) => {
      const key = getAssetKey(asset);
      if (key) byId.set(key, asset);
    });
    return byId;
  }, [effectiveSourceAssets]);
  const effectiveSourceLessonContent = isShowcaseMode
    ? showcaseData?.sourceLessonContent
    : isDemoMode
      ? demoData?.sourceLessonContent
      : viewerData?.sourceLessonContent;
  const effectiveSourceVisualById = useMemo(() => {
    const byId = new Map<string, SourceLessonMaterialV2Visual>();
    if (isSourceLessonMaterialV2(effectiveSourceLessonContent)) {
      effectiveSourceLessonContent.visualRegistry.forEach((visual) => {
        visual.assetIds.forEach((assetId) => {
          if (assetId) byId.set(assetId, visual);
        });
      });
    }
    return byId;
  }, [effectiveSourceLessonContent]);
  const effectiveSourceVisualGalleryAssets = useMemo(() => {
    if (!isSourceLessonMaterialV2(effectiveSourceLessonContent)) return effectiveSourceAssets;
    const registryAssetIds = new Set(
      effectiveSourceLessonContent.visualRegistry.flatMap((visual) => visual.assetIds),
    );
    if (registryAssetIds.size === 0) return [];
    return effectiveSourceAssets.filter((asset) => registryAssetIds.has(getAssetKey(asset)));
  }, [effectiveSourceAssets, effectiveSourceLessonContent]);

  useEffect(() => {
    if (wantsPptxFocus) {
      setActiveContentTab("slides");
    }
  }, [wantsPptxFocus, lessonId]);

  const fallbackLessonDigest = useMemo<LessonDigestPayload | null>(() => {
    if (isShowcaseMode || isDemoMode) return null;
    const byKey = (effectiveLessonData?.metadata as any)?.lessonDigestV1?.byKey;
    if (!byKey || typeof byKey !== "object") return null;
    const entries = Object.values(byKey).filter((entry): entry is LessonDigestPayload => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as LessonDigestPayload;
      return (
        Array.isArray(candidate.sections) &&
        candidate.sections.length > 0 &&
        Array.isArray(candidate.sourceChunks) &&
        typeof candidate.languageCode === "string"
      );
    });
    if (entries.length === 0) return null;

    const normalizedRequestedLanguage = normalizeLanguageCode(
      requestedLanguageCode || activeLanguageCodeFromViewer || effectiveLessonData?.languageCode || "en"
    );
    const requestedVersion = String(requestedDigestVersionId || "").trim();
    if (requestedVersion) {
      const byVersion = entries.find(
        (entry) =>
          String(entry?.versionRef || "").trim() === requestedVersion
      );
      if (byVersion) return byVersion;
    }

    if (normalizedRequestedLanguage) {
      const byLanguage = entries.find(
        (entry) => normalizeLanguageCode(String(entry?.languageCode || "")) === normalizedRequestedLanguage
      );
      if (byLanguage) return byLanguage;
      if (requestedLanguageCode) {
        const sourceLanguage = normalizeLanguageCode(
          viewerData?.artifactResolution?.sourceLanguageCode ||
            effectiveLessonData?.languageCode ||
            "en"
        );
        if (sourceLanguage) {
          const sourceEntry = entries.find(
            (entry) => normalizeLanguageCode(String(entry?.languageCode || "")) === sourceLanguage
          );
          if (sourceEntry) return sourceEntry;
        }
        return null;
      }
    }

    return entries[0];
  }, [
    activeLanguageCodeFromViewer,
    effectiveLessonData?.languageCode,
    effectiveLessonData?.metadata,
    isDemoMode,
    isShowcaseMode,
    requestedDigestVersionId,
    requestedLanguageCode,
    viewerData?.artifactResolution?.sourceLanguageCode,
  ]);
  const effectiveLessonDigest = isShowcaseMode
    ? showcaseData?.lessonDigest
    : isDemoMode
      ? demoData?.lessonDigest
      : viewerData?.lessonDigest || fallbackLessonDigest;
  const fallbackStepByStepGuide = useMemo<StepByStepGuidePayload | null>(() => {
    if (isShowcaseMode || isDemoMode) return null;
    if (requestedStepGuideVersionId) return null;
    const byLanguage = (effectiveLessonData?.metadata as any)?.lessonStepGuideV1?.byLanguage;
    if (!byLanguage || typeof byLanguage !== "object") return null;
    const requestedLanguage = normalizeLanguageCode(requestedLanguageCode || activeLanguageCodeFromViewer || effectiveLessonData?.languageCode || "en");
    const sourceLanguage = normalizeLanguageCode(
      viewerData?.artifactResolution?.sourceLanguageCode ||
        effectiveLessonData?.languageCode ||
        "en"
    );
    const bucket = (byLanguage as Record<string, any>)[requestedLanguage]
      || (sourceLanguage ? (byLanguage as Record<string, any>)[sourceLanguage] : null)
      || (!requestedLanguageCode ? (byLanguage as Record<string, any>).en : null)
      || (!requestedLanguageCode ? Object.values(byLanguage)[0] : null);
    if (!bucket) return null;
    const versions = Array.isArray((bucket as any)?.versions) ? (bucket as any).versions : [];
    if (!versions.length) return null;
    let selected = requestedStepGuideVersionId
      ? versions.find((version: any) => String(version?.id || "").trim() === requestedStepGuideVersionId)
      : null;
    if (!selected) {
      const activeId = String((bucket as any)?.activeVersionId || "").trim();
      selected = versions.find((version: any) => String(version?.id || "").trim() === activeId) || versions[0];
    }
    if (!selected || !Array.isArray(selected?.steps) || selected.steps.length === 0) return null;
    return {
      schemaVersion: "v1",
      languageCode: String(selected.languageCode || requestedLanguage || "en"),
      versionRef: String(selected.versionRef || ""),
      generatedAt: String(selected.generatedAt || ""),
      sourceType: (selected.sourceType || "upload") as "upload" | "translated" | "manual",
      sourceFilename: selected.sourceFilename ? String(selected.sourceFilename) : undefined,
      summary: selected.summary ? String(selected.summary) : undefined,
      steps: selected.steps
        .map((step: any, index: number) => ({
          id: String(step?.id || `step-${index + 1}`),
          title: String(step?.title || `Step ${index + 1}`),
          content: String(step?.content || ""),
          commands: Array.isArray(step?.commands) ? step.commands.map((cmd: any) => String(cmd || "")).filter(Boolean) : [],
          imageUrls: Array.isArray(step?.imageUrls) ? step.imageUrls.map((url: any) => String(url || "")).filter(Boolean) : [],
        }))
        .filter((step: StepByStepGuideStep) => !!step.content || !!step.title),
    };
  }, [
    activeLanguageCodeFromViewer,
    effectiveLessonData?.languageCode,
    effectiveLessonData?.metadata,
    isDemoMode,
    isShowcaseMode,
    requestedLanguageCode,
    requestedStepGuideVersionId,
    viewerData?.artifactResolution?.sourceLanguageCode,
  ]);
  const effectiveStepByStepGuide = isShowcaseMode
    ? showcaseData?.stepByStepGuide
    : isDemoMode
      ? demoData?.stepByStepGuide
      : viewerData?.stepByStepGuide || fallbackStepByStepGuide;
  const [selectedPodcastLanguage, setSelectedPodcastLanguage] = useState<string>("en");
  const [selectedPodcastVersionId, setSelectedPodcastVersionId] = useState<string>("");
  const podcastVersions = useMemo(
    () => (effectivePodcast?.versions || []).filter((v) => v.status === "completed"),
    [effectivePodcast]
  );
  const isPodcastProcessing = effectivePodcast?.currentJob?.status === "processing";
  const podcastJobFailedMessage = effectivePodcast?.currentJob?.status === "failed"
    ? effectivePodcast.currentJob.errorMessage || "Podcast generation failed."
    : "";
  const podcastLanguages = useMemo(
    () => Array.from(new Set(podcastVersions.map((v) => v.languageCode || "en"))),
    [podcastVersions]
  );
  const selectedPodcastVersion = useMemo(() => {
    if (!podcastVersions.length) return null;
    const exactSelection = podcastVersions.find((version) => version.id === selectedPodcastVersionId);
    if (exactSelection) {
      return exactSelection;
    }

    const fallbackVersionId = getPreferredPodcastVersionId({
      podcastVersions,
      languageCode: selectedPodcastLanguage,
      activePodcastVersionId: effectivePodcast?.activeVersion?.id || null,
    });
    return fallbackVersionId
      ? podcastVersions.find((version) => version.id === fallbackVersionId) || null
      : null;
  }, [
    effectivePodcast?.activeVersion?.id,
    podcastVersions,
    selectedPodcastLanguage,
    selectedPodcastVersionId,
  ]);
  useEffect(() => {
    hasAppliedRequestedPodcastRef.current = false;
    hasAutoRedirectedLanguageRef.current = false;
    hasShownRequestedLanguageFallbackRef.current = false;
    setSelectedQuizId("");
    setDownloadingVersionId(null);
    setActiveDigestSectionId("overview");
    setActiveGuidedContentMode("digest");
    setSelectedPodcastLanguage("en");
    setSelectedPodcastVersionId("");
  }, [lessonId, requestedLanguageCode, requestedPodcastVersionId, requestedStepGuideVersionId]);

  useEffect(() => {
    const { selectedPodcastLanguage: nextLanguage, selectedPodcastVersionId: nextVersionId } = resolvePodcastSelection({
      podcastVersions,
      requestedLanguageCode,
      requestedPodcastVersionId: hasAppliedRequestedPodcastRef.current ? null : requestedPodcastVersionId,
      activePodcastLanguageCode: effectivePodcast?.activeVersion?.languageCode || "en",
      activePodcastVersionId: effectivePodcast?.activeVersion?.id || null,
    });

    setSelectedPodcastLanguage(nextLanguage);
    setSelectedPodcastVersionId(nextVersionId);

    if (nextVersionId && requestedPodcastVersionId && !hasAppliedRequestedPodcastRef.current) {
      hasAppliedRequestedPodcastRef.current = true;
    }
  }, [
    effectivePodcast?.activeVersion?.languageCode,
    podcastVersions,
    requestedLanguageCode,
    requestedPodcastVersionId,
  ]);

  useEffect(() => {
    if (!podcastVersions.length || !selectedPodcastLanguage) return;
    const currentVersion = podcastVersions.find((version) => version.id === selectedPodcastVersionId);
    if (currentVersion && String(currentVersion.languageCode || "en").toLowerCase() === selectedPodcastLanguage) {
      return;
    }
    const versionForLanguageId = getPreferredPodcastVersionId({
      podcastVersions,
      languageCode: selectedPodcastLanguage,
      activePodcastVersionId: effectivePodcast?.activeVersion?.id || null,
    });
    if (!versionForLanguageId && selectedPodcastVersionId === "") return;
    setSelectedPodcastVersionId(versionForLanguageId || "");
  }, [
    effectivePodcast?.activeVersion?.id,
    podcastVersions,
    selectedPodcastLanguage,
    selectedPodcastVersionId,
  ]);

  const effectiveLoading = isShowcaseMode ? showcaseLoading : isDemoMode ? demoLoading : isLoading;
  useEffect(() => {
    const firstSectionId = effectiveLessonDigest?.sections?.[0]?.id;
    const hasStepByStepGuide = !!(effectiveStepByStepGuide && Array.isArray(effectiveStepByStepGuide.steps) && effectiveStepByStepGuide.steps.length > 0);
    const prefersStepByStep = hasStepByStepGuide && (
      requestedFocus === "step-by-step" ||
      requestedFocus === "step_by_step" ||
      requestedFocus === "guide" ||
      !!requestedStepGuideVersionId
    );
    if (prefersStepByStep) {
      setActiveGuidedContentMode("step_by_step");
    } else {
      setActiveGuidedContentMode("digest");
    }
    if (firstSectionId) {
      setActiveDigestSectionId(firstSectionId);
      return;
    }
    setActiveDigestSectionId("overview");
  }, [
    lessonId,
    effectiveLessonDigest?.versionRef,
    effectiveLessonDigest?.languageCode,
    effectiveLessonDigest?.sections?.length,
    effectiveLessonDigest?.sections?.[0]?.id,
    effectiveStepByStepGuide?.versionRef,
    effectiveStepByStepGuide?.steps?.length,
    requestedFocus,
    requestedStepGuideVersionId,
  ]);
  useEffect(() => {
    const firstSourceSectionId = effectiveSourceLessonContent?.sections?.[0]?.id || "";
    setActiveSourceSectionId(firstSourceSectionId);
  }, [
    lessonId,
    getSourceLessonGeneratedAt(effectiveSourceLessonContent),
    effectiveSourceLessonContent?.sections?.length,
    effectiveSourceLessonContent?.sections?.[0]?.id,
  ]);
  const hasRenderableLessonContent = resolveHasRenderableLessonContent({
    slideImageCount: effectiveSlideImages?.urls?.length ?? 0,
    viewerUrl: effectiveViewerUrl,
    videoUrl: effectiveVideoUrl,
    hasPPTX: viewerData?.hasPPTX,
    isLocalPptx: effectiveIsLocalPptx,
    conversionStatus: viewerData?.conversionStatus,
    digestSectionCount: effectiveLessonDigest?.sections?.length ?? 0,
    stepGuideStepCount: effectiveStepByStepGuide?.steps?.length ?? 0,
    sourceLessonSectionCount: effectiveSourceLessonContent?.sections?.length ?? 0,
    sourceLessonVisualCount: getSourceLessonVisualCount(effectiveSourceLessonContent),
    podcastVersionCount: effectivePodcast?.versions?.length ?? 0,
    hasActivePodcastVersion: !!effectivePodcast?.activeVersion,
  });
  const hasPodcastPanel = !!(
    effectivePodcast &&
    (podcastVersions.length > 0 || isPodcastProcessing || !!podcastJobFailedMessage)
  );
  const hasPlayablePodcast = podcastVersions.length > 0;
  const fullscreenPodcastLessonId = String((effectiveLesson as any)?.id || lessonId || "").trim();
  const renderCompactPodcastPlayer = (dataTestId: string, debugContext: string) => {
    if (!hasPlayablePodcast || !fullscreenPodcastLessonId) return null;
    return (
      <div className="min-w-0 flex-1" data-testid={`${dataTestId}-container`}>
        <div className="mx-auto flex max-w-[min(48rem,58vw)] items-center gap-2 rounded-md border border-border bg-background/80 px-2 py-1 shadow-sm backdrop-blur-sm max-md:max-w-full">
          <Play className="hidden h-4 w-4 flex-shrink-0 text-primary sm:block" />
          <span className="hidden max-w-32 flex-shrink-0 truncate text-[length:var(--text-xs)] font-medium text-foreground lg:block">
            Podcast
          </span>
          <PodcastPlayer
            lessonId={fullscreenPodcastLessonId}
            versionId={selectedPodcastVersion?.id || selectedPodcastVersionId || effectivePodcast?.activeVersion?.id}
            languageCode={selectedPodcastVersion?.languageCode || selectedPodcastLanguage || effectivePodcast?.activeVersion?.languageCode}
            className="h-9 min-w-0 flex-1"
            dataTestId={dataTestId}
            debugContext={debugContext}
          />
        </div>
      </div>
    );
  };

  const renderSourceMaterialV2Block = (
    section: SourceLessonMaterialV2Section,
    block: SourceLessonMaterialV2Block,
    index: number
  ) => {
    const key = block.id || `${section.id}-block-${index}`;

    if (block.type === "heading") {
      if (String(block.text || "").trim().toLowerCase() === section.title.trim().toLowerCase()) return null;
      return (
        <h5 key={key} className="text-[length:var(--text-base)] font-semibold text-foreground">
          {block.text}
        </h5>
      );
    }

    if (block.type === "bullet_list") {
      return (
        <ul key={key} className="list-disc pl-5 space-y-1 text-[length:var(--text-sm)] text-muted-foreground">
          {(block.items || []).map((item, itemIndex) => (
            <li key={`${key}-item-${itemIndex}`}>{item}</li>
          ))}
        </ul>
      );
    }

    if (block.type === "figure") {
      const visuals = (block.assetIds || [])
        .map((assetId) => ({
          asset: effectiveSourceAssetById.get(assetId),
          visual: effectiveSourceVisualById.get(assetId),
          assetId,
        }))
        .filter((entry) => entry.asset?.signedUrl);
      if (visuals.length === 0) return null;
      return (
        <div key={key} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visuals.map(({ asset, visual, assetId }, visualIndex) => (
            <figure key={assetId || `${key}-visual-${visualIndex}`} className="rounded border border-border bg-muted/30 overflow-hidden">
              <img
                src={asset?.signedUrl || ""}
                alt={asset?.altText || visual?.caption || String(block.text || "") || `${section.title} visual ${visualIndex + 1}`}
                className="w-full h-52 object-contain bg-background"
                loading="lazy"
              />
              {(block.text || visual?.caption || asset?.caption || visual?.page || visual?.slide || asset?.pageOrSlide) && (
                <figcaption className="p-2 space-y-1">
                  {(block.text || visual?.caption || asset?.caption) && (
                    <p className="text-[length:var(--text-xs)] text-foreground line-clamp-2">
                      {block.text || visual?.caption || asset?.caption}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(visual?.page || visual?.slide || asset?.pageOrSlide) && (
                      <Badge variant="outline">
                        {visual?.slide ? "Slide" : "Page"} {visual?.slide || visual?.page || asset?.pageOrSlide}
                      </Badge>
                    )}
                    <Badge variant="secondary">Linked to text</Badge>
                  </div>
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      );
    }

    if (block.type === "activity") {
      return (
        <div key={key} className="rounded border border-border bg-muted/30 p-3">
          <p className="text-[length:var(--text-xs)] font-semibold text-foreground uppercase tracking-wide mb-1">Try this</p>
          <p className="text-[length:var(--text-sm)] text-foreground leading-relaxed">{block.text}</p>
        </div>
      );
    }

    if (block.type === "figure_ref") {
      return (
        <p key={key} className="text-[length:var(--text-xs)] text-muted-foreground">
          {block.text}
        </p>
      );
    }

    if (block.type === "callout" || block.type === "sidebar") {
      return (
        <div key={key} className="rounded border border-border bg-muted/30 p-3">
          <p className="text-[length:var(--text-sm)] text-foreground leading-relaxed">{block.text}</p>
        </div>
      );
    }

    return (
      <p key={key} className="text-[length:var(--text-sm)] text-muted-foreground leading-relaxed">
        {block.text}
      </p>
    );
  };

  const handleManualRefresh = async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "viewer"] }),
        refetchLesson(),
        refetchViewerData(),
      ]);
      toast({ title: "Refreshed", description: "Checked latest lesson generation status." });
    } catch {
      toast({
        title: "Refresh failed",
        description: "Could not refresh lesson status right now.",
        variant: "destructive",
      });
    }
  };

  // Determine if lesson has any existing presentation (Gamma-generated, manually uploaded, or versioned)
  const hasExistingPresentation = !!lesson?.presentationVersionId || 
    !!lesson?.slideContentHash || 
    !!lesson?.gammaCardId || 
    !!lesson?.storageKey ||
    lesson?.generationStatus === "completed";

  // Fetch download URL for PPTX - works for AI-generated, manually uploaded, and versioned presentations
  const { data: downloadData, error: downloadError } = useQuery({
    queryKey: ["/api/lessons", lessonId, "download", effectiveOrganizationId],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}/download?organizationId=${effectiveOrganizationId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Download request failed: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!lessonId && !!effectiveOrganizationId && hasExistingPresentation,
  });
  
  // Log download data issues for debugging
  if (downloadError) {
    console.error('[LessonViewer] Download data error:', downloadError);
  }

  // Fetch presentation versions for version selector dropdown
  const { data: presentationVersions, isLoading: isLoadingVersions, refetch: refetchVersions } = usePresentationVersions(
    lessonId,
    effectiveOrganizationId
  );
  
  // Mutation to fetch fresh download URL for a specific version
  const downloadVersionMutation = useDownloadPresentationVersion(lessonId || "", effectiveOrganizationId || "");

  // Fetch available quizzes
  const { data: quizzes } = useQuery({
    queryKey: ["/api/admin/quiz-collections", effectiveOrganizationId],
    enabled: !!effectiveOrganizationId,
  });

  // Fetch linked quizzes
  const { data: linkedQuizzes = [], isLoading: isLoadingLinkedQuizzes } = useQuery<any[]>({
    queryKey: ["/api/lessons", lessonId, "linked-quizzes"],
    queryFn: () =>
      fetch(`/api/lessons/${lessonId}/linked-quizzes?organizationId=${effectiveOrganizationId}`, {
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch linked quizzes');
        return r.json();
      }),
    enabled: !!lessonId && !!effectiveOrganizationId,
  });

  useEffect(() => {
    if (!Array.isArray(linkedQuizzes) || linkedQuizzes.length === 0) {
      setSelectedQuizId("");
      return;
    }
    if (selectedQuizId && linkedQuizzes.some((quiz: any) => String(quiz?.quizId || quiz?.id || "") === selectedQuizId)) {
      return;
    }
    const primaryQuiz = linkedQuizzes.find((quiz: any) => quiz?.isPrimary) || linkedQuizzes[0];
    setSelectedQuizId(String(primaryQuiz?.quizId || primaryQuiz?.id || ""));
  }, [linkedQuizzes, lessonId, selectedQuizId]);

  // Fetch organization for dynamic labeling
  const { data: organization } = useQuery({
    queryKey: ["/api/organizations", effectiveOrganizationId],
    enabled: !!effectiveOrganizationId,
  });

  const { terminology, isResolved } = useOrganizationTerminology();
  const gradeLevelLabel = terminology?.unit || "Grade Level";
  const subjectLabel = terminology?.subject || "Subject";

  // Progress tracking
  const { data: progress, isLoading: progressLoading } = useLessonProgress(lessonId);
  const updateProgress = useUpdateLessonProgress(lessonId || "");

  // Time tracking (only when lesson is viewable, not completed, and not in showcase mode)
  const canTrackProgress = !isShowcaseMode && lesson?.generationStatus === "completed" && progress?.status !== "completed";
  const { getCurrentSeconds } = useTimeTracker(!!canTrackProgress, progress?.secondsSpent || 0);

  // Save local progress for showcase mode (track slide views in localStorage)
  const saveLocalShowcaseProgress = (slideIndex: number) => {
    if (!isShowcaseMode || !lessonId) return;
    const existingProgress = getLessonProgress(lessonId);
    const viewedSlides = existingProgress?.viewedSlides || [];
    if (!viewedSlides.includes(slideIndex)) {
      viewedSlides.push(slideIndex);
    }
    saveLessonProgress({
      lessonId,
      viewedSlides,
      lastViewedSlide: slideIndex,
      courseId: courseId || undefined,
    });
    setLocalProgress({ viewedSlides, lastViewedSlide: slideIndex });
  };

  // Ref for stable access in intervals and cleanup
  const canTrackProgressRef = useRef(canTrackProgress);
  
  // Ref to prevent infinite loop when auto-marking as in progress
  const hasInitiatedProgressRef = useRef(false);

  useEffect(() => {
    canTrackProgressRef.current = canTrackProgress;
  }, [canTrackProgress]);

  // Reset the initiated flag when status is no longer "not_started"
  useEffect(() => {
    if (progress?.status !== "not_started") {
      hasInitiatedProgressRef.current = false;
    }
  }, [progress?.status]);

  // Auto-mark as in progress on first view
  useEffect(() => {
    if (
      lesson &&
      progress &&
      progress.status === "not_started" &&
      canTrackProgress &&
      !hasInitiatedProgressRef.current &&
      !updateProgress.isPending
    ) {
      hasInitiatedProgressRef.current = true;
      updateProgress.mutate({ status: "in_progress" });
    }
  }, [lesson?.id, progress?.status, canTrackProgress]);

  // Periodically save progress
  useEffect(() => {
    if (!canTrackProgress) return;

    const saveInterval = setInterval(() => {
      if (canTrackProgressRef.current) {
        const currentSeconds = getCurrentSeconds();
        if (currentSeconds > 0) {
          updateProgress.mutate({ secondsSpent: currentSeconds });
        }
      }
    }, 60000); // Save every 60 seconds

    return () => clearInterval(saveInterval);
  }, [canTrackProgress]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (canTrackProgressRef.current) {
        const currentSeconds = getCurrentSeconds();
        if (currentSeconds > 0) {
          updateProgress.mutate({ secondsSpent: currentSeconds });
        }
      }
    };
  }, []);

  // Landscape fullscreen support for mobile
  useEffect(() => {
    const enterFullscreen = () => {
      if (contentContainerRef.current && !document.fullscreenElement) {
        contentContainerRef.current.requestFullscreen?.().catch(() => {
          toast({
            variant: "destructive",
            title: "Fullscreen unavailable",
            description: "Your browser doesn't support fullscreen mode.",
          });
        });
      }
    };

    const checkOrientation = () => {
      const isLandscapeMode = window.matchMedia("(orientation: landscape)").matches;
      const isMobile = window.innerWidth < 1280; // xl breakpoint
      setIsLandscape(isLandscapeMode && isMobile);

      // Show toast prompt for fullscreen on landscape (requires user gesture)
      if (isLandscapeMode && isMobile && !document.fullscreenElement && !hasShownLandscapeToastRef.current) {
        hasShownLandscapeToastRef.current = true;
        toast({
          title: "Fullscreen available",
          description: "Tap here to view in fullscreen mode",
          action: (
            <ToastAction altText="Fullscreen" onClick={enterFullscreen}>
              Fullscreen
            </ToastAction>
          ),
        });
      } else if (!isLandscapeMode && document.fullscreenElement) {
        // Exit fullscreen when returning to portrait
        document.exitFullscreen?.().catch(() => {
          // Exit failed - silently ignore
        });
        hasShownLandscapeToastRef.current = false; // Reset so toast can show again next time
      }
    };

    // Check on mount
    checkOrientation();

    // Listen for orientation changes
    const mediaQuery = window.matchMedia("(orientation: landscape)");
    const handleChange = () => checkOrientation();
    
    mediaQuery.addEventListener("change", handleChange);
    window.addEventListener("resize", checkOrientation);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      window.removeEventListener("resize", checkOrientation);
    };
  }, [lesson?.generationStatus, toast]);

  useEffect(() => {
    const hasShowcaseMedia = !!(showcaseData?.videoUrl || showcaseData?.viewerUrl);
    if (!isShowcaseMode || !hasShowcaseMedia) return;
    setIsMediaFullscreen(isLandscape);
  }, [isLandscape, isShowcaseMode, showcaseData?.videoUrl, showcaseData?.viewerUrl]);

  // Download mutation - uses blob download for proper file saving
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/lessons/${lessonId}/download?organizationId=${effectiveOrganizationId}`
      );
      const data = await response.json();
      
      if (!data?.downloadUrl) {
        throw new Error("No download URL available");
      }
      
      // Fetch the file as a blob for proper download
      try {
        const fileResponse = await fetch(data.downloadUrl);
        const blob = await fileResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `${lesson?.title?.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-') || 'lesson'}.pptx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch {
        // Fallback: open in new tab if blob download fails
        window.open(data.downloadUrl, '_blank');
      }
    },
    onSuccess: () => {
      toast({
        title: "Download started",
        description: "Your lesson file is being downloaded.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error.message || "Failed to download lesson",
      });
    },
  });

  // Link quiz mutation
  const linkQuizMutation = useMutation({
    mutationFn: async (quizId: string) => {
      return await apiRequest(`/api/lessons/${lessonId}/link-quiz`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: effectiveOrganizationId,
          quizId,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Quiz linked",
        description: "The quiz has been linked to this lesson.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "linked-quizzes"] });
      setLinkDialogOpen(false);
      setSelectedQuizId("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to link quiz",
        description: error.message || "An error occurred",
      });
    },
  });

  // Unlink quiz mutation
  const unlinkQuizMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/lessons/${lessonId}/unlink-quiz`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: effectiveOrganizationId,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Quiz unlinked",
        description: "The quiz has been unlinked from this lesson.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "linked-quizzes"] });
    },
  });

  // Upload video mutation
  const uploadVideoMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) {
        throw new Error("No video file selected");
      }

      const formData = new FormData();
      formData.append("videoFile", videoFile);

      const xhr = new XMLHttpRequest();
      
      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setVideoUploadProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.response));
          } else {
            reject(new Error(JSON.parse(xhr.response).error || "Upload failed"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));

        xhr.open("POST", `/api/lessons/${lessonId}/upload-video?organizationId=${effectiveOrganizationId}`);
        xhr.send(formData);
      });
    },
    onSuccess: () => {
      toast({
        title: "Video uploaded",
        description: "Your lesson video has been uploaded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "viewer"] });
      setVideoFile(null);
      setVideoUploadProgress(0);
      setVideoUploadDialogOpen(false);
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload video file",
      });
      setVideoUploadProgress(0);
    },
  });

  const regenerateDigestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/lessons/${lessonId}/digest/regenerate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson text refreshed",
        description: "Guided lesson text was regenerated from the latest lesson content.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "viewer"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Refresh failed",
        description: error?.message || "Unable to regenerate guided lesson text.",
      });
    },
  });

  // Confetti celebration effect (respects prefers-reduced-motion)
  const triggerConfetti = () => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      colors: getThemeConfettiColors(),
    };

    function fire(particleRatio: number, opts: any) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    // Multi-burst confetti for celebration
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });
    fire(0.2, {
      spread: 60,
    });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  };

  // Format seconds to readable duration
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // Handle invalid lessonId - show error and redirect
  useEffect(() => {
    if (!lessonId && !hasShownInvalidError) {
      setHasShownInvalidError(true);
      toast({
        variant: "destructive",
        title: "Invalid lesson",
        description: "The lesson could not be found. Please try again.",
      });
    }
  }, [lessonId, hasShownInvalidError, toast]);

  // Early return for invalid lessonId
  if (!lessonId) {
    return (
      <div className="container mx-auto py-[var(--space-lg)] px-[var(--container-padding)]">
        <Card surface="raised" className="p-[var(--card-padding)]">
          <CardContent className="flex flex-col items-center justify-center py-[var(--space-2xl)] px-[var(--space-md)]">
            <AlertCircle className="h-16 w-16 text-destructive mb-[var(--space-md)]" />
            <h3 className="text-[length:var(--text-lg)] font-semibold mb-[var(--space-sm)]">Invalid Lesson</h3>
            <p className="text-muted-foreground mb-[var(--space-md)] text-[length:var(--text-sm)] text-center">
              This lesson could not be loaded. The lesson ID is invalid.
            </p>
            <Button onClick={() => setLocation("/")}
              className="min-h-[44px] touch-manipulation"
            >
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Demo mode: Simplified viewer for anonymous course preview
  if (isDemoMode) {
    if (demoLoading) {
      return (
        <div className="container mx-auto py-[var(--space-lg)] px-[var(--container-padding)]">
          <Skeleton className="h-10 w-1/3 mb-[var(--space-md)]" />
          <Skeleton className="h-[min(600px,70vh)] w-full" />
        </div>
      );
    }

    if (!demoData?.lesson) {
      return (
        <div className="container mx-auto py-[var(--space-lg)] px-[var(--container-padding)]">
          <Card surface="raised" className="p-[var(--card-padding)]">
            <CardContent className="flex flex-col items-center justify-center py-[var(--space-2xl)] px-[var(--space-md)]">
              <XCircle className="h-16 w-16 text-destructive mb-[var(--space-md)]" />
              <h3 className="text-[length:var(--text-lg)] font-semibold mb-[var(--space-sm)]">Demo not available</h3>
              <p className="text-muted-foreground mb-[var(--space-md)] text-[length:var(--text-sm)] text-center">This lesson is not available for preview.</p>
              <Button onClick={() => setLocation(viewerBackUrl)}
                className="min-h-[44px] touch-manipulation"
              >
                Back to Course
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Render simplified demo viewer
    return (
      <div className="fixed inset-0 bg-background overflow-hidden">
        {/* Demo Top Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border safe-area-top">
          <div className="container mx-auto px-[var(--container-padding)] py-[var(--space-md)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
                <Button variant="ghost" onClick={() => setLocation(viewerBackUrl)}
                  className="hover:bg-primary/10 hover:text-primary transition-all duration-250 min-h-[44px] touch-manipulation"
                  data-testid="button-back-to-course"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Back to Course</span>
                  <span className="sm:hidden">Back</span>
                </Button>
                
                <div className="hidden md:block">
                  <h1 className="text-[length:var(--text-lg)] font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent" data-testid="text-demo-lesson-title">
                    {demoData.lesson.title}
                  </h1>
                  <div className="flex gap-[var(--space-xs)] items-center text-[length:var(--text-xs)] text-muted-foreground mt-1">
                    <Badge variant="secondary" >
                      Demo Preview
                    </Badge>
                    <span>From: {demoData.courseName}</span>
                  </div>
                </div>
              </div>

              <Button onClick={() => setLocation(courseId ? `/courses/${courseId}/purchase` : "/browse-courses")}
                className="bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
                data-testid="button-purchase-full-course"
              >
                Get Full Course
              </Button>
            </div>
          </div>
        </div>

        {/* Demo Content Area - Responsive video/iframe container */}
        <div className="absolute inset-0 pt-28 sm:pt-32 pb-20 overflow-hidden">
          <div className="w-full h-full flex flex-col items-center justify-center">
            {demoData.lesson.generationStatus === "completed" && (demoData.lesson.videoUrl || demoData.viewerUrl) ? (
              <div className="w-full h-full max-w-7xl mx-auto px-[var(--container-padding)]">
                {demoData.lesson.videoUrl ? (
                  <div className="w-full h-full max-h-[min(80vh,56.25vw)]">
                    <VideoPlayer videoUrl={demoData.lesson.videoUrl} title={demoData.lesson.title} canDownload={false} />
                  </div>
                ) : demoData.viewerUrl ? (
                  <div className="relative w-full h-full rounded-xl overflow-hidden border border-primary/30 shadow-dialog shadow-elevated" style={{ aspectRatio: '16/9', maxHeight: 'min(80vh, 56.25vw)' }}>
                    {demoData.slideImages?.urls?.length ? (
                      <SlideImageViewer
                        slideUrls={demoData.slideImages.urls}
                        title={demoData.lesson.title}
                        className="absolute inset-0 w-full h-full"
                      />
                    ) : demoData.isLocalPptx ? (
                      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted/50">
                        <div className="text-center p-6">
                          {isSlideConversionPending(demoData) ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
                          ) : (
                            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                          )}
                          <p className="text-sm text-muted-foreground">{getSlideConversionMessage(demoData)}</p>
                        </div>
                      </div>
                    ) : (
                      <iframe
                        src={demoData.viewerUrl}
                        className="absolute inset-0 w-full h-full bg-muted"
                        title={demoData.lesson.title}
                      />
                    )}
                  </div>
                ) : null}
                {!!demoData?.podcast && !!demoData?.lesson?.id && (
                  <div className="mt-4 p-[var(--card-padding)] bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-[var(--space-sm)] mb-[var(--space-sm)]">
                      <Play className="h-5 w-5 text-primary" />
                      <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Lesson Podcast</h3>
                    </div>
                    <PodcastPlayer
                      lessonId={demoData.lesson.id}
                      versionId={demoData.podcast?.activeVersion?.id}
                      languageCode={demoData.podcast?.activeVersion?.languageCode}
                      className="w-full"
                      dataTestId="audio-demo-lesson-podcast"
                      debugContext="lesson_viewer_demo"
                    />
                  </div>
                )}
              </div>
            ) : demoData.lesson.generationStatus === "processing" || demoData.lesson.generationStatus === "polling" ? (
              <div className="text-center p-[var(--space-lg)]">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-[var(--space-md)]" />
                <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground">Lesson content is being generated...</h3>
                <p className="text-muted-foreground mt-[var(--space-sm)] text-[length:var(--text-sm)]">Please check back later.</p>
              </div>
            ) : (
              <div className="text-center p-[var(--space-lg)]">
                <FileText className="h-12 w-12 text-primary mx-auto mb-[var(--space-md)]" />
                <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground">{demoData.lesson.title}</h3>
                {demoData.lesson.description && (
                  <p className="text-muted-foreground mt-[var(--space-sm)] max-w-2xl text-[length:var(--text-sm)]">{demoData.lesson.description}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Demo Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-sm border-t border-border">
          <div className="container mx-auto px-[var(--container-padding)] py-[var(--space-md)]">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-[var(--space-sm)] text-[length:var(--text-sm)] text-muted-foreground">
              <span>Enjoying this lesson?</span>
              <Button variant="outline" onClick={() => setLocation(courseId ? `/courses/${courseId}/purchase` : "/browse-courses")}
                className="border-primary/50 hover:bg-primary/10 min-h-[44px] touch-manipulation w-full sm:w-auto"
                data-testid="button-unlock-full-course"
              >
                Unlock Full Course
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Showcase mode: Simplified viewer for anonymous users accessing showcase lessons
  if (isShowcaseMode) {
    if (showcaseLoading) {
      return (
        <div className="container mx-auto py-[var(--space-lg)] px-[var(--container-padding)]">
          <Skeleton className="h-10 w-1/3 mb-[var(--space-md)]" />
          <Skeleton className="h-[min(600px,70vh)] w-full" />
        </div>
      );
    }

    // Show login prompt if showcase API returns 403 (non-showcase content) or no lesson data
    if (isShowcaseError || !showcaseData?.lesson) {
      return (
        <div className="container mx-auto py-[var(--space-lg)] px-[var(--container-padding)]">
          <Card surface="raised" className="p-[var(--card-padding)]">
            <CardContent className="flex flex-col items-center justify-center py-[var(--space-2xl)] px-[var(--space-md)]">
              <XCircle className="h-16 w-16 text-destructive mb-[var(--space-md)]" />
              <h3 className="text-[length:var(--text-lg)] font-semibold mb-[var(--space-sm)]">Lesson not available</h3>
              <p className="text-muted-foreground mb-[var(--space-md)] text-[length:var(--text-sm)] text-center">This lesson is not available for preview. Please register or login to access more content.</p>
              <div className="flex gap-[var(--space-sm)]">
                <Button onClick={() => setLocation(`/register?returnTo=${encodeURIComponent(window.location.pathname)}`)}
                  className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90"
                >
                  Register
                </Button>
                <Button variant="outline" onClick={() => setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`)}
                  className="min-h-[44px] touch-manipulation"
                >
                  Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    const renderShowcaseMedia = (fullscreen = false) => {
      if (showcaseData.videoUrl) {
        return (
          <div className={`${fullscreen ? 'h-full w-full' : 'w-full aspect-video max-h-[min(70vh,56.25vw)]'} relative overflow-hidden ${fullscreen ? '' : 'rounded-xl border border-primary/30 shadow-dialog shadow-elevated'}`}>
            <VideoPlayer videoUrl={showcaseData.videoUrl} title={showcaseData.lesson.title} canDownload={false} />
          </div>
        );
      }

      if (!showcaseData.viewerUrl) return null;

      return (
        <div
          className={`${fullscreen ? 'relative h-full w-full' : 'relative w-full aspect-video rounded-xl overflow-hidden border border-primary/30 shadow-dialog shadow-elevated'}`}
          style={fullscreen ? undefined : { maxHeight: 'min(70vh, 56.25vw)' }}
        >
          {showcaseData.slideImages?.urls?.length ? (
            <SlideImageViewer
              slideUrls={showcaseData.slideImages.urls}
              title={showcaseData.lesson.title}
              className="absolute inset-0 w-full h-full"
              fillMode={fullscreen}
            />
          ) : showcaseData.isLocalPptx ? (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted/50">
              <div className="text-center p-6">
                {isSlideConversionPending(showcaseData) ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                )}
                <p className="text-sm text-muted-foreground">{getSlideConversionMessage(showcaseData)}</p>
              </div>
            </div>
          ) : (
            <iframe
              src={showcaseData.viewerUrl}
              className="absolute inset-0 w-full h-full bg-muted"
              title={showcaseData.lesson.title}
              data-testid="iframe-showcase-viewer"
              onLoad={() => {
                saveLocalShowcaseProgress(0);
              }}
            />
          )}
        </div>
      );
    };

    const renderShowcasePodcast = (fullscreen = false) => (
      !!showcaseData?.podcast && !!showcaseData?.lesson?.id && (
        <div className={`${fullscreen ? 'border-t border-border bg-card/95 p-3' : 'mt-4 p-[var(--card-padding)] bg-card rounded-lg border border-border'}`}>
          <div className="flex items-center gap-[var(--space-sm)] mb-[var(--space-sm)]">
            <Play className="h-5 w-5 text-primary" />
            <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Lesson Podcast</h3>
          </div>
          <PodcastPlayer
            lessonId={showcaseData.lesson.id}
            versionId={showcaseData.podcast?.activeVersion?.id}
            languageCode={showcaseData.podcast?.activeVersion?.languageCode}
            className="w-full"
            dataTestId="audio-showcase-lesson-podcast"
            debugContext="lesson_viewer_showcase"
          />
        </div>
      )
    );

    // Render showcase viewer for anonymous users
    return (
      <div className="fixed inset-0 bg-background overflow-hidden">
        {/* Showcase Top Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border safe-area-top">
          <div className="container mx-auto px-[var(--container-padding)] py-[var(--space-md)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
                <Button variant="ghost" onClick={() => setLocation("/browse-courses")}
                  className="hover:bg-primary/10 hover:text-primary transition-all duration-250 min-h-[44px] touch-manipulation"
                  data-testid="button-browse-courses"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Browse Courses</span>
                  <span className="sm:hidden">Back</span>
                </Button>
                
                <div className="hidden md:block">
                  <h1 className="text-[length:var(--text-lg)] font-bold text-foreground" data-testid="text-showcase-lesson-title">
                    {showcaseData.lesson.title}
                  </h1>
                  <div className="flex gap-[var(--space-xs)] items-center text-[length:var(--text-xs)] text-muted-foreground mt-1">
                    <Badge variant="secondary" >
                      Preview
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex w-full gap-[var(--space-sm)] sm:w-auto">
                <Button onClick={() => setLocation(`/register?returnTo=${encodeURIComponent(window.location.pathname)}`)}
                  className="w-full bg-primary hover:opacity-90 text-btn-primary-foreground font-bold min-h-[44px] touch-manipulation shadow-md sm:w-auto"
                  data-testid="button-register-showcase"
                >
                  <span className="hidden min-[380px]:inline">Register to Save Progress</span>
                  <span className="min-[380px]:hidden">Register</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ShowcaseBanner */}
        <div className="absolute top-40 min-[380px]:top-36 sm:top-24 left-0 right-0 z-10 container mx-auto px-[var(--container-padding)]">
          <ShowcaseBanner currentPath={window.location.pathname} />
        </div>

        {/* Showcase Content Area */}
        <div className="absolute inset-0 pt-72 min-[380px]:pt-64 sm:pt-48 pb-4 overflow-y-auto">
          <div className="w-full min-h-full flex flex-col items-center justify-start sm:justify-center">
            {(showcaseData.videoUrl || showcaseData.viewerUrl) ? (
              <div className="w-full max-w-7xl mx-auto px-[var(--container-padding)]">
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsMediaFullscreen(true)}
                      className="h-11 w-11 touch-manipulation rounded-full bg-card/95 shadow-elevated"
                      aria-label="View media fullscreen"
                      title="View fullscreen"
                      data-testid="button-showcase-media-fullscreen-floating"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {renderShowcaseMedia(false)}
                </div>

                {/* Lesson Podcast */}
                {renderShowcasePodcast(false)}

                {/* Lesson Digest */}
                {((effectiveLessonDigest && effectiveLessonDigest.sections.length > 0) || (effectiveStepByStepGuide && effectiveStepByStepGuide.steps.length > 0)) && (
                  <div className="mt-4 p-[var(--card-padding)] bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-[var(--space-sm)] mb-[var(--space-sm)]">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Guided Lesson Text</h3>
                      <Badge variant="secondary" className="ml-auto">
                        {(activeGuidedContentMode === "step_by_step" ? "Guide" : "Grounded")} ({((activeGuidedContentMode === "step_by_step" ? effectiveStepByStepGuide?.languageCode : effectiveLessonDigest?.languageCode) || "en").toUpperCase()})
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {effectiveStepByStepGuide && effectiveStepByStepGuide.steps.length > 0 && (
                        <Button
                          key="step-by-step"
                          size="sm"
                          variant={activeGuidedContentMode === "step_by_step" ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setActiveGuidedContentMode("step_by_step")}
                        >
                          Step-by-Step
                        </Button>
                      )}
                      {(effectiveLessonDigest?.sections || []).map((section) => (
                        <Button key={section.id} size="sm" variant={activeGuidedContentMode === "digest" && activeDigestSectionId === section.id ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => { setActiveGuidedContentMode("digest"); setActiveDigestSectionId(section.id); }}
                        >
                          {section.title}
                        </Button>
                      ))}
                    </div>
                    {activeGuidedContentMode === "step_by_step" && effectiveStepByStepGuide && effectiveStepByStepGuide.steps.length > 0 ? (
                      <div className="space-y-3">
                        {effectiveStepByStepGuide.summary && (
                          <p className="text-[length:var(--text-sm)] text-foreground font-medium">{effectiveStepByStepGuide.summary}</p>
                        )}
                        {effectiveStepByStepGuide.steps.map((step, index) => (
                          <div key={step.id} className="rounded border border-border p-3 space-y-2">
                            <p className="text-[length:var(--text-sm)] font-semibold text-foreground">
                              {step.title || `Step ${index + 1}`}
                            </p>
                            {step.content && (
                              <p className="text-[length:var(--text-sm)] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {step.content}
                              </p>
                            )}
                            {Array.isArray(step.commands) && step.commands.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[length:var(--text-xs)] font-medium text-foreground">Commands</p>
                                {step.commands.map((command, commandIndex) => (
                                  <pre key={`${step.id}-cmd-${commandIndex}`} className="rounded bg-muted/50 p-2 text-[length:var(--text-xs)] overflow-x-auto whitespace-pre-wrap">
                                    <code>{command}</code>
                                  </pre>
                                ))}
                              </div>
                            )}
                            {Array.isArray(step.imageUrls) && step.imageUrls.length > 0 && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {step.imageUrls.map((imageUrl, imageIndex) => (
                                  <img
                                    key={`${step.id}-img-${imageIndex}`}
                                    src={imageUrl}
                                    alt={`${step.title || `Step ${index + 1}`} illustration ${imageIndex + 1}`}
                                    className="rounded border border-border max-h-56 object-contain bg-background"
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      (effectiveLessonDigest?.sections || [])
                        .filter((section) => section.id === activeDigestSectionId)
                        .map((section) => (
                          <div key={section.id} className="space-y-3">
                            {section.summary && (
                              <p className="text-[length:var(--text-sm)] text-foreground font-medium">{section.summary}</p>
                            )}
                            {section.paragraphs.map((paragraph, index) => (
                              <p key={`${section.id}-p-${index}`} className="text-[length:var(--text-sm)] text-muted-foreground leading-relaxed">
                                {paragraph}
                              </p>
                            ))}
                            {section.bullets.length > 0 && (
                              <ul className="list-disc pl-5 space-y-1 text-[length:var(--text-sm)] text-muted-foreground">
                                {section.bullets.map((bullet, index) => (
                                  <li key={`${section.id}-b-${index}`}>{bullet}</li>
                                ))}
                              </ul>
                            )}
                            <details className="rounded border border-border p-2">
                              <summary className="cursor-pointer text-[length:var(--text-xs)] text-muted-foreground">
                                View source chunks ({section.sourceChunkIds.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {(effectiveLessonDigest?.sourceChunks || [])
                                  .filter((chunk) => section.sourceChunkIds.includes(chunk.id))
                                  .map((chunk) => (
                                    <div key={chunk.id} className="rounded bg-muted/40 p-2">
                                      <p className="text-[length:var(--text-xs)] font-medium text-foreground">{chunk.title}</p>
                                      <p className="text-[length:var(--text-xs)] text-muted-foreground whitespace-pre-wrap">{chunk.text}</p>
                                    </div>
                                  ))}
                              </div>
                            </details>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {/* Local Progress Indicator */}
                {localProgress && localProgress.viewedSlides.length > 0 && (
                  <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/30">
                    <p className="text-[length:var(--text-sm)] text-center text-muted-foreground">
                      <span className="font-medium text-foreground">You've viewed {localProgress.viewedSlides.length} slide{localProgress.viewedSlides.length > 1 ? 's' : ''}</span>
                      <span className="mx-2">•</span>
                      <button 
                        onClick={() => setLocation(`/register?returnTo=${encodeURIComponent(window.location.pathname)}`)}
                        className="text-primary hover:underline"
                      >
                        Register to save your progress
                      </button>
                    </p>
                  </div>
                )}

                {/* Showcase Quiz CTA */}
                {showcaseQuizData?.quiz && (
                  <div className="mt-4 p-[var(--card-padding)] bg-card rounded-lg border border-border">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)]">
                      <div className="flex items-center gap-[var(--space-sm)]">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileQuestion className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Ready to Test Your Knowledge?</h3>
                          <p className="text-[length:var(--text-sm)] text-muted-foreground">
                            Take the quiz to reinforce what you've learned
                          </p>
                        </div>
                      </div>
                      <Button onClick={() => {
                          const params = new URLSearchParams();
                          if (courseId) params.set('courseId', courseId);
                          if (lessonId) params.set('lessonId', lessonId);
                          const queryString = params.toString();
                          setLocation(`/quiz-single/${showcaseQuizData.quiz!.id}${queryString ? `?${queryString}` : ''}`);
                        }}
                        className="bg-primary hover:opacity-90 text-btn-primary-foreground font-medium min-h-[44px] touch-manipulation"
                        data-testid="button-play-quiz-showcase"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Play Quiz
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-[var(--space-lg)]">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-[var(--space-md)]" />
                <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground">Content not available</h3>
                <p className="text-muted-foreground mt-[var(--space-sm)]">This lesson's content is not yet available for preview.</p>
              </div>
            )}
          </div>
        </div>
        {isMediaFullscreen && (
          <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background supports-[height:100dvh]:h-[100dvh] supports-[width:100dvw]:w-[100dvw]" data-testid="showcase-media-fullscreen">
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 py-2 safe-area-top landscape:absolute landscape:left-0 landscape:right-0 landscape:top-0 landscape:z-20 landscape:bg-card/80">
              <h2 className="min-w-0 truncate text-[length:var(--text-sm)] font-semibold text-foreground">
                {showcaseData.lesson.title}
              </h2>
              {renderCompactPodcastPlayer("audio-showcase-lesson-podcast-fullscreen", "lesson_viewer_showcase_fullscreen")}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMediaFullscreen(false)}
                className="min-h-[44px] touch-manipulation"
                data-testid="button-exit-showcase-media-fullscreen"
              >
                <Minimize2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Exit</span>
              </Button>
            </div>
            <div
              className="min-h-0 flex-1 bg-background landscape:flex landscape:flex-row landscape:items-center landscape:justify-center landscape:px-[max(env(safe-area-inset-left),0.5rem)] landscape:pb-[max(env(safe-area-inset-bottom),0.5rem)] landscape:pt-[calc(max(env(safe-area-inset-top),0.5rem)+3.5rem)]"
              data-testid="showcase-media-fullscreen-shell"
            >
              <div className="h-full w-full landscape:aspect-video landscape:w-auto landscape:max-w-full">
                {renderShowcaseMedia(true)}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Wait for core lesson fetch to resolve; terminology can continue loading in parallel.
  if (isLoading || (!isResolved && !effectiveLessonData && !viewerData)) {
    return (
      <div className="container mx-auto py-[var(--space-lg)] px-[var(--container-padding)]">
        <Skeleton className="h-10 w-1/3 mb-[var(--space-md)]" />
        <Skeleton className="h-[min(600px,70vh)] w-full" />
      </div>
    );
  }

  // Graceful handling when lesson is unavailable (unlinked or removed)
  if (isLessonUnavailable || (!effectiveLesson && !effectiveLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-[var(--container-padding)]">
        <Card surface="raised" className="max-w-md w-full backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-[var(--space-2xl)] px-[var(--space-lg)]">
            <div className="relative mb-[var(--space-lg)]">
              <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertCircle className="h-10 w-10 text-warning" />
              </div>
            </div>
            
            <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground mb-[var(--space-sm)] text-center">
              Lesson No Longer Available
            </h3>
            
            <p className="text-muted-foreground text-center mb-[var(--space-lg)] text-[length:var(--text-sm)] max-w-sm">
              {courseId 
                ? "This lesson is no longer available in this course. Your instructor may have updated the course content."
                : "This lesson has been removed or is no longer accessible. Please contact your instructor if you believe this is an error."
              }
            </p>
            
            <div className="flex flex-col sm:flex-row gap-[var(--space-sm)] w-full">
              {courseId && (
                <Button onClick={() => setLocation(viewerBackUrl)}
                  className="flex-1 min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90"
                  data-testid="button-back-to-course"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Course
                </Button>
              )}
              
              <Button variant={courseId ? "outline" : "default"} onClick={() => setLocation(`/quiz-lobby${courseId ? `?courseId=${courseId}&lessonId=${lessonId}` : ""}`)}
                className={`flex-1 min-h-[44px] touch-manipulation ${!courseId ? 'bg-primary hover:bg-primary/90' : 'border-border hover:bg-muted'}`}
                data-testid="button-go-to-lobby"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Learning Hub
              </Button>
              
              {!courseId && (
                <Button variant="outline" onClick={() => setLocation("/")}
                  className="flex-1 min-h-[44px] touch-manipulation border-border hover:bg-muted"
                  data-testid="button-go-home"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case "processing":
      case "polling":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Immersive full-screen layout
  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Inline warning banner when viewing cached content */}
      {isUsingCachedContent && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-warning/90 backdrop-blur-sm py-2 px-4 flex items-center justify-center gap-2 text-sm text-foreground" data-testid="banner-cached-content">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>This lesson is no longer available in this course. You can finish viewing, but it won't be accessible after you leave.</span>
          <Button size="sm" variant="ghost" onClick={() => setLocation("/my-courses")}
            className="ml-2 text-foreground hover:bg-warning/50 h-7"
            data-testid="button-dismiss-cached-warning"
          >
            Go Back
          </Button>
        </div>
      )}
      {/* Top Bar with Gradient */}
      <div className={`absolute ${isUsingCachedContent ? 'top-10' : 'top-0'} left-0 right-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border`}>
        <div className="container mx-auto px-[var(--container-padding)] py-[var(--space-sm)]">
          <div className="flex items-center justify-between gap-[var(--space-sm)]">
            <div className="flex min-w-0 flex-[0_1_18rem] items-center gap-[var(--space-sm)]">
              <Button variant="ghost" onClick={() => setLocation(viewerBackUrl)}
                className="min-h-[44px] min-w-0 max-w-full flex-shrink touch-manipulation px-2 transition-all duration-250 hover:bg-primary/10 hover:text-primary"
                data-testid="button-back-to-lessons"
              >
                <ArrowLeft className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="hidden truncate sm:inline">Back to Course</span>
                <span className="sm:hidden">Back</span>
              </Button>
              
              <div className="hidden min-w-0 flex-1 2xl:block">
                {/* Course Name and Lesson Name - Always visible */}
                {courseId && courseData ? (
                  <div className="flex items-center gap-2 text-[length:var(--text-xs)] mb-1" data-testid="lesson-breadcrumb">
                    <button
                      onClick={() => setLocation(viewerBackUrl)}
                      className="text-muted-foreground hover:text-primary transition-colors cursor-pointer truncate max-w-[150px] sm:max-w-[200px]"
                    >
                      {courseData.title}
                    </button>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-none">{effectiveLesson?.title || 'Lesson'}</span>
                  </div>
                ) : courseId ? (
                  <div className="flex items-center gap-2 text-[length:var(--text-xs)] mb-1">
                    <Skeleton className="h-4 w-24" />
                    <span className="text-muted-foreground">/</span>
                    <span className="text-foreground font-medium truncate">{effectiveLesson?.title || 'Lesson'}</span>
                  </div>
                ) : null}
                <h1 className="text-[length:var(--text-base)] sm:text-[length:var(--text-lg)] font-bold text-foreground truncate" data-testid="text-lesson-title">
                  {effectiveLesson?.title || lesson?.title || 'Lesson'}
                </h1>
                <div className="hidden sm:flex gap-[var(--space-sm)] items-center text-[length:var(--text-xs)] text-muted-foreground mt-1">
                  {(lesson?.gradeLevelName || lesson?.departmentName) && (
                    <span>{lesson.gradeLevelName || lesson.departmentName}</span>
                  )}
                  {(lesson?.subjectName || lesson?.unitName) && (
                    <span>•</span>
                  )}
                  {(lesson?.subjectName || lesson?.unitName) && (
                    <span>{lesson.subjectName || lesson.unitName}</span>
                  )}
                </div>
              </div>
            </div>

            {hasPlayablePodcast && (
              <div className="hidden min-w-0 flex-[0_1_48rem] xl:block">
                {renderCompactPodcastPlayer("audio-authenticated-lesson-podcast-topbar", "lesson_viewer_authenticated_topbar")}
              </div>
            )}

            {/* Action Buttons - Compact with touch targets */}
            <div className="flex gap-[var(--space-xs)] flex-shrink-0">
              {lessonLanguageOptions.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="min-h-[48px] sm:min-h-[44px] touch-manipulation gap-1">
                      <Globe className="w-4 h-4" />
                      <span className="hidden sm:inline">{activeLanguageMeta?.nativeName || 'Language'}</span>
                      <span className="sm:hidden">{(activeLanguageMeta?.code || activeLanguageCodeFromViewer || 'en').toUpperCase()}</span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Available Languages</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {lessonLanguageOptions.map(lang => (
                      <DropdownMenuItem
                        key={`${lang.code}-${lang.lessonId}`}
                        onClick={() => {
                          const normalizedTargetCode = normalizeLanguageCode(lang.code);
                          const targetLessonId = String(lang.lessonId || lessonId || '');
                          const mappedCourseId = (courseLanguages || []).find(
                            (courseLang) => normalizeLanguageCode(courseLang.code) === normalizedTargetCode
                          )?.courseId;
                          const targetCourseId = mappedCourseId || courseId;
                          const qs = buildLessonVariantSearchParams({
                            courseId: targetCourseId,
                            returnTo: searchParams.get('returnTo'),
                            languageCode: lang.code,
                          });
                          if (
                            targetLessonId &&
                            String(targetLessonId) === String(lessonId || '') &&
                            normalizedTargetCode === activeLanguageCodeFromViewer &&
                            String(targetCourseId || '') === String(courseId || '')
                          ) {
                            return;
                          }
                          if (!targetLessonId) {
                            return;
                          }
                          setLocation(`/lessons/${targetLessonId}${qs ? `?${qs}` : ''}`);
                        }}
                        className={normalizeLanguageCode(lang.code) === activeLanguageCodeFromViewer ? 'bg-primary/10 font-medium' : ''}
                      >
                        <span className="flex-1">{lang.nativeName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{lang.code.toUpperCase()}</span>
                        {lang.isDefault && <Badge variant="outline" className="ml-2 py-0 px-1">Source</Badge>}
                        {normalizeLanguageCode(lang.code) === activeLanguageCodeFromViewer && <CheckCircle2 className="w-3 h-3 ml-1 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {lesson.generationStatus === "completed" && (
                <>
                  {hasRenderableLessonContent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMediaFullscreen(true)}
                      className="hidden min-h-[44px] min-w-[44px] touch-manipulation xl:flex"
                      aria-label="View lesson media fullscreen"
                      title="View fullscreen"
                      data-testid="button-authenticated-media-fullscreen-desktop"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid - Responsive layout */}
      <div className={`absolute inset-0 ${isUsingCachedContent ? 'pt-28' : 'pt-20'} pb-[11rem] md:pb-[8rem] xl:pb-0`}>
        {hasRenderableLessonContent ? (
          <div className={`h-full grid grid-cols-1 ${isProgressRailCollapsed ? 'xl:grid-cols-[minmax(0,1fr)_3.5rem]' : 'xl:grid-cols-[minmax(0,1fr)_min(380px,30vw)]'} gap-0`}>
            {/* Lesson Stage - Full immersion with responsive aspect ratio */}
            <div ref={contentContainerRef} className="relative flex flex-col h-full bg-surface-raised backdrop-blur-sm overflow-y-auto">
              <div className="flex-shrink-0 bg-background">
              {/* Content tabs when both video and slides exist */}
              {effectiveVideoUrl && effectiveViewerUrl ? (
                <Tabs value={activeContentTab} onValueChange={(v) => setActiveContentTab(v as "video" | "slides")} className="flex flex-col">
                  <div className="flex justify-center py-2 bg-card/80 z-10">
                    <TabsList className="bg-surface-raised/80 backdrop-blur-sm border border-border">
                      <TabsTrigger value="video" className="flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Video
                      </TabsTrigger>
                      <TabsTrigger value="slides" className="flex items-center gap-2">
                        <Presentation className="h-4 w-4" />
                        Slides
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="video" className="m-0 data-[state=inactive]:hidden">
                    <div className="mx-auto aspect-video w-full max-w-[min(100%,calc((100vh-12rem)*1.777))] max-h-[calc(100vh-12rem)]">
                      <VideoPlayer videoUrl={effectiveVideoUrl} title={effectiveLesson?.title || lesson?.title || "Lesson"} canDownload={canManageLesson} />
                    </div>
                  </TabsContent>
                  <TabsContent value="slides" className="m-0 data-[state=inactive]:hidden">
                    {(effectiveSlideImages?.urls?.length ?? 0) > 0 ? (
                      <div className="relative mx-auto aspect-video w-full max-w-[min(100%,calc((100vh-12rem)*1.777))] max-h-[calc(100vh-12rem)]">
                        <SlideImageViewer
                          slideUrls={effectiveSlideImages!.urls}
                          title={effectiveLesson?.title || lesson?.title || "Lesson"}
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                    ) : effectiveIsLocalPptx ? (
                      <div className="relative mx-auto flex aspect-video w-full max-w-[min(100%,calc((100vh-12rem)*1.777))] max-h-[calc(100vh-12rem)] items-center justify-center bg-muted/50">
                        <div className="text-center p-6">
                          {isSlideConversionPending(viewerData) ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
                          ) : (
                            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                          )}
                          <p className="text-sm text-muted-foreground">{getSlideConversionMessage(viewerData)}</p>
                        </div>
                      </div>
                    ) : effectiveViewerUrl ? (
                      <>
                        <div className="xl:hidden absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-primary/90 backdrop-blur-sm text-foreground text-[length:var(--text-xs)] px-[var(--space-md)] py-[var(--space-sm)] rounded-full shadow-elevated border border-primary/30">
                          Tap left/right sides to navigate slides
                        </div>
                        <div className="relative mx-auto aspect-video w-full max-w-[min(100%,calc((100vh-12rem)*1.777))] max-h-[calc(100vh-12rem)]">
                          <iframe
                            src={effectiveViewerUrl}
                            className="absolute inset-0 w-full h-full border-0"
                            title={effectiveLesson?.title || lesson?.title || "Lesson"}
                            data-testid="iframe-lesson-viewer"
                          />
                        </div>
                      </>
                    ) : null}
                  </TabsContent>
                </Tabs>
              ) : effectiveVideoUrl ? (
                /* Video only */
                <div className="mx-auto aspect-video w-full max-w-[min(100%,calc((100vh-10rem)*1.777))] max-h-[calc(100vh-10rem)]">
                  <VideoPlayer videoUrl={effectiveVideoUrl} title={effectiveLesson?.title || lesson?.title || "Lesson"} canDownload={canManageLesson} />
                </div>
              ) : effectiveViewerUrl || effectiveIsLocalPptx ? (
                (effectiveSlideImages?.urls?.length ?? 0) > 0 ? (
                  <div className="relative mx-auto aspect-video w-full max-w-[min(100%,calc((100vh-10rem)*1.777))] max-h-[calc(100vh-10rem)]">
                    <SlideImageViewer
                      slideUrls={effectiveSlideImages!.urls}
                      title={effectiveLesson?.title || lesson?.title || "Lesson"}
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                ) : effectiveIsLocalPptx ? (
                  <div className="relative mx-auto flex aspect-video w-full max-w-[min(100%,calc((100vh-10rem)*1.777))] max-h-[calc(100vh-10rem)] items-center justify-center bg-muted/50">
                    <div className="text-center p-6">
                      {isSlideConversionPending(viewerData) ? (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
                      ) : (
                        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                      )}
                      <p className="text-sm text-muted-foreground">{getSlideConversionMessage(viewerData)}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="xl:hidden absolute top-[var(--space-md)] left-1/2 -translate-x-1/2 z-10 bg-primary/90 backdrop-blur-sm text-foreground text-[length:var(--text-xs)] px-[var(--space-md)] py-[var(--space-sm)] rounded-full shadow-elevated border border-primary/30">
                      Tap left/right sides to navigate slides
                    </div>
                    <div className="relative mx-auto aspect-video w-full max-w-[min(100%,calc((100vh-10rem)*1.777))] max-h-[calc(100vh-10rem)]">
                      <iframe
                        src={effectiveViewerUrl}
                        className="absolute inset-0 w-full h-full border-0"
                        title={effectiveLesson?.title || lesson?.title || "Lesson"}
                        data-testid="iframe-lesson-viewer"
                      />
                    </div>
                  </>
                )
              ) : null}
              </div>

              {hasPodcastPanel && (
                <div className={`${hasPlayablePodcast ? "xl:hidden" : ""} flex-shrink-0 border-t border-border bg-card/95 px-[var(--space-md)] py-[var(--space-sm)]`}>
                  <div className="mb-2 flex items-center gap-[var(--space-sm)]">
                    {isPodcastProcessing && podcastVersions.length === 0 ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 text-primary" />
                    )}
                    <h3 className="text-[length:var(--text-sm)] font-semibold text-foreground">Lesson Podcast</h3>
                    {podcastVersions.length > 0 && (
                      <span className="min-w-0 truncate text-[length:var(--text-xs)] text-muted-foreground">
                        {selectedPodcastVersion?.title || effectivePodcast?.activeVersion?.title || "Current"}
                      </span>
                    )}
                  </div>
                  {isPodcastProcessing && podcastVersions.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/30 p-[var(--space-md)]" aria-live="polite">
                      <p className="text-[length:var(--text-sm)] font-medium text-foreground">Generating podcast</p>
                      <p className="text-[length:var(--text-xs)] text-muted-foreground mt-1">
                        The podcast and script are being prepared. This lesson will update when generation completes.
                      </p>
                    </div>
                  ) : null}
                  {podcastJobFailedMessage && podcastVersions.length === 0 ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-[var(--space-md)]" aria-live="polite">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                        <p className="text-[length:var(--text-sm)] text-destructive">{podcastJobFailedMessage}</p>
                      </div>
                    </div>
                  ) : null}
                  {podcastVersions.length > 0 && (podcastLanguages.length > 1 || podcastVersions.length > 1) && (
                    <div className={`grid gap-2 mb-3 ${podcastLanguages.length > 1 && podcastVersions.length > 1 ? "md:grid-cols-2" : ""}`}>
                      {podcastLanguages.length > 1 && (
                        <Select
                          value={selectedPodcastLanguage}
                          onValueChange={(value) => {
                            setSelectedPodcastLanguage(value);
                            const preferredVersionId = getPreferredPodcastVersionId({
                              podcastVersions,
                              languageCode: value,
                              activePodcastVersionId: effectivePodcast?.activeVersion?.id || null,
                            });
                            setSelectedPodcastVersionId(preferredVersionId);
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Podcast language" />
                          </SelectTrigger>
                          <SelectContent>
                            {podcastLanguages.map((lang) => (
                              <SelectItem key={lang} value={lang}>{lang.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {podcastVersions.length > 1 && (
                        <Select
                          value={selectedPodcastVersionId || selectedPodcastVersion?.id || ""}
                          onValueChange={(value) => setSelectedPodcastVersionId(value)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Podcast version" />
                          </SelectTrigger>
                          <SelectContent>
                            {podcastVersions
                              .filter((v) => (v.languageCode || "en").toLowerCase() === selectedPodcastLanguage)
                              .map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {(v.title || "Version")} ({new Date(v.createdAt).toLocaleDateString()})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  {podcastVersions.length > 0 && (
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                      <PodcastPlayer
                        lessonId={lessonId || ""}
                        versionId={selectedPodcastVersion?.id || selectedPodcastVersionId || effectivePodcast?.activeVersion?.id}
                        languageCode={selectedPodcastVersion?.languageCode || selectedPodcastLanguage || effectivePodcast?.activeVersion?.languageCode}
                        className="min-w-0 flex-1"
                        dataTestId="audio-lesson-podcast"
                        debugContext="lesson_viewer_main"
                      />
                      <div className="flex-shrink-0">
                        <Button variant="outline" size="sm" className="h-9 w-full sm:w-auto" asChild>
                          <a
                            href={`/api/lessons/${lessonId}/podcast/download${(() => {
                              const params = new URLSearchParams();
                              if (selectedPodcastVersion?.languageCode || selectedPodcastLanguage) params.set("languageCode", selectedPodcastVersion?.languageCode || selectedPodcastLanguage);
                              if (selectedPodcastVersion?.id || selectedPodcastVersionId) params.set("versionId", selectedPodcastVersion?.id || selectedPodcastVersionId);
                              const query = params.toString();
                              return query ? `?${query}` : "";
                            })()}`}
                          >
                            Download Podcast
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {effectiveSourceLessonContent && effectiveSourceLessonContent.sections.length > 0 && (
                <div className="p-[var(--card-padding)] border-t border-border">
                  <div className="flex items-center gap-[var(--space-sm)] mb-[var(--space-md)]">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Lesson Material</h3>
                    <Badge variant="secondary" className="ml-auto">Source-grounded</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setIsLessonMaterialExpanded((value) => !value)}
                      data-testid="button-toggle-lesson-material"
                      aria-expanded={isLessonMaterialExpanded}
                    >
                      {isLessonMaterialExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Expand
                        </>
                      )}
                    </Button>
                  </div>

                  {isLessonMaterialExpanded && (
                    <>
                      {effectiveSourceLessonContent.objectives.length > 0 && (
                        <div className="rounded border border-border bg-muted/30 p-3 mb-3">
                          <p className="text-[length:var(--text-xs)] font-semibold text-foreground uppercase tracking-wide mb-2">What you will learn</p>
                          <ul className="list-disc pl-5 space-y-1 text-[length:var(--text-sm)] text-muted-foreground">
                            {effectiveSourceLessonContent.objectives.map((objective, index) => (
                              <li key={`source-objective-${index}`}>{objective}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mb-3">
                        {effectiveSourceLessonContent.sections.map((section) => (
                          <Button
                            key={section.id}
                            size="sm"
                            variant={activeSourceSectionId === section.id ? "default" : "outline"}
                            className="h-7 px-2 text-xs"
                            onClick={() => setActiveSourceSectionId(section.id)}
                          >
                            {section.title}
                          </Button>
                        ))}
                      </div>

                      {effectiveSourceLessonContent.sections
                        .filter((section) => section.id === activeSourceSectionId)
                        .map((section) => (
                      <article key={section.id} className="space-y-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="text-[length:var(--text-lg)] font-semibold text-foreground">{section.title}</h4>
                            {getVisualRangeLabel(section) && <Badge variant="outline">{getVisualRangeLabel(section)}</Badge>}
                          </div>
                          {isSourceLessonMaterialV2Section(section) ? (
                            <div className="space-y-3">
                              {section.blocks.map((block, index) => renderSourceMaterialV2Block(section, block, index))}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {section.paragraphs.map((paragraph, index) => (
                                <p key={`${section.id}-paragraph-${index}`} className="text-[length:var(--text-sm)] text-muted-foreground leading-relaxed">
                                  {paragraph}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        {!isSourceLessonMaterialV2Section(section) && section.visuals.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {section.visuals.filter((visual) => visual.signedUrl).slice(0, 4).map((visual, index) => (
                              <figure key={visual.assetId || `${section.id}-visual-${index}`} className="rounded border border-border bg-muted/30 overflow-hidden">
                                <img
                                  src={visual.signedUrl || ""}
                                  alt={visual.altText || visual.caption || `${section.title} visual ${index + 1}`}
                                  className="w-full h-52 object-contain bg-background"
                                  loading="lazy"
                                />
                                {(visual.caption || visual.pageOrSlide) && (
                                  <figcaption className="p-2 space-y-1">
                                    {visual.caption && (
                                      <p className="text-[length:var(--text-xs)] text-foreground line-clamp-2">{visual.caption}</p>
                                    )}
                                    {visual.pageOrSlide && <Badge variant="outline">Page {visual.pageOrSlide}</Badge>}
                                  </figcaption>
                                )}
                              </figure>
                            ))}
                          </div>
                        )}

                        {!isSourceLessonMaterialV2Section(section) && section.activities.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[length:var(--text-xs)] font-semibold text-foreground uppercase tracking-wide">Try this</p>
                            {section.activities.map((activity) => (
                              <div key={activity.id} className="rounded border border-border bg-muted/30 p-3">
                                <p className="text-[length:var(--text-sm)] text-foreground leading-relaxed">{activity.prompt}</p>
                                {activity.sourcePage && (
                                  <Badge variant="outline" className="mt-2">Page {activity.sourcePage}</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                        ))}
                    </>
                  )}
                </div>
              )}

              {effectiveSourceVisualGalleryAssets.length > 0 && (
                <div className="p-[var(--card-padding)] border-t border-border">
                  <div className="flex items-center gap-[var(--space-sm)] mb-[var(--space-md)]">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Source Visuals</h3>
                    <Badge variant="secondary" className="ml-auto">{effectiveSourceVisualGalleryAssets.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {effectiveSourceVisualGalleryAssets.slice(0, 6).map((asset, index) => (
                      <figure key={asset.assetId || asset.id || index} className="rounded border border-border bg-muted/30 overflow-hidden">
                        <img
                          src={asset.signedUrl}
                          alt={asset.altText || asset.caption || `Source visual ${index + 1}`}
                          className="w-full h-40 object-contain bg-background"
                          loading="lazy"
                        />
                        {(asset.caption || asset.pageOrSlide || asset.containsEmbeddedText) && (
                          <figcaption className="p-2 space-y-1">
                            {asset.caption && (
                              <p className="text-[length:var(--text-xs)] text-foreground line-clamp-2">{asset.caption}</p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {asset.pageOrSlide && <Badge variant="outline">Page {asset.pageOrSlide}</Badge>}
                              {asset.containsEmbeddedText && <Badge variant="secondary">Contains text</Badge>}
                            </div>
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {/* Guided Lesson Text - Below player */}
              {((effectiveLessonDigest && effectiveLessonDigest.sections.length > 0) || (effectiveStepByStepGuide && effectiveStepByStepGuide.steps.length > 0)) && (
                <div className="mx-[var(--space-md)] my-[var(--space-md)] max-w-6xl rounded-lg border border-border bg-card p-[var(--card-padding)] shadow-sm xl:mx-auto">
                  <div className="flex items-center gap-[var(--space-sm)] mb-[var(--space-md)]">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <h3 className="text-[length:var(--text-base)] font-semibold text-foreground">Guided Lesson Text</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {(activeGuidedContentMode === "step_by_step" ? "Guide" : "Grounded")} ({((activeGuidedContentMode === "step_by_step" ? effectiveStepByStepGuide?.languageCode : effectiveLessonDigest?.languageCode) || "en").toUpperCase()})
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {effectiveStepByStepGuide && effectiveStepByStepGuide.steps.length > 0 && (
                      <Button
                        key="step-by-step"
                        size="sm"
                        variant={activeGuidedContentMode === "step_by_step" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setActiveGuidedContentMode("step_by_step")}
                      >
                        Step-by-Step
                      </Button>
                    )}
                    {(effectiveLessonDigest?.sections || []).map((section) => (
                      <Button key={section.id} size="sm" variant={activeGuidedContentMode === "digest" && activeDigestSectionId === section.id ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => { setActiveGuidedContentMode("digest"); setActiveDigestSectionId(section.id); }}
                      >
                        {section.title}
                      </Button>
                    ))}
                  </div>
                  {activeGuidedContentMode === "step_by_step" && effectiveStepByStepGuide && effectiveStepByStepGuide.steps.length > 0 ? (
                    <div className="space-y-3">
                      {effectiveStepByStepGuide.summary && (
                        <p className="text-[length:var(--text-sm)] text-foreground font-medium">{effectiveStepByStepGuide.summary}</p>
                      )}
                      {effectiveStepByStepGuide.steps.map((step, index) => (
                        <div key={step.id} className="rounded border border-border p-3 space-y-2">
                          <p className="text-[length:var(--text-sm)] font-semibold text-foreground">
                            {step.title || `Step ${index + 1}`}
                          </p>
                          {step.content && (
                            <p className="text-[length:var(--text-sm)] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {step.content}
                            </p>
                          )}
                          {Array.isArray(step.commands) && step.commands.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[length:var(--text-xs)] font-medium text-foreground">Commands</p>
                              {step.commands.map((command, commandIndex) => (
                                <pre key={`${step.id}-cmd-${commandIndex}`} className="rounded bg-muted/50 p-2 text-[length:var(--text-xs)] overflow-x-auto whitespace-pre-wrap">
                                  <code>{command}</code>
                                </pre>
                              ))}
                            </div>
                          )}
                          {Array.isArray(step.imageUrls) && step.imageUrls.length > 0 && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {step.imageUrls.map((imageUrl, imageIndex) => (
                                <img
                                  key={`${step.id}-img-${imageIndex}`}
                                  src={imageUrl}
                                  alt={`${step.title || `Step ${index + 1}`} illustration ${imageIndex + 1}`}
                                  className="rounded border border-border max-h-56 object-contain bg-background"
                                  loading="lazy"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    (effectiveLessonDigest?.sections || [])
                      .filter((section) => section.id === activeDigestSectionId)
                      .map((section) => (
                        <div key={section.id} className="space-y-3">
                          {section.summary && (
                            <p className="text-[length:var(--text-sm)] text-foreground font-medium">{section.summary}</p>
                          )}
                          {section.paragraphs.map((paragraph, index) => (
                            <p key={`${section.id}-p-${index}`} className="text-[length:var(--text-sm)] text-muted-foreground leading-relaxed">
                              {paragraph}
                            </p>
                          ))}
                          {section.bullets.length > 0 && (
                            <ul className="list-disc pl-5 space-y-1 text-[length:var(--text-sm)] text-muted-foreground">
                              {section.bullets.map((bullet, index) => (
                                <li key={`${section.id}-b-${index}`}>{bullet}</li>
                              ))}
                            </ul>
                          )}
                          <details className="rounded border border-border p-2">
                            <summary className="cursor-pointer text-[length:var(--text-xs)] text-muted-foreground">
                              View source chunks ({section.sourceChunkIds.length})
                            </summary>
                            <div className="mt-2 space-y-2">
                              {(effectiveLessonDigest?.sourceChunks || [])
                                .filter((chunk) => section.sourceChunkIds.includes(chunk.id))
                                .map((chunk) => (
                                  <div key={chunk.id} className="rounded bg-muted/40 p-2">
                                    <p className="text-[length:var(--text-xs)] font-medium text-foreground">{chunk.title}</p>
                                    <p className="text-[length:var(--text-xs)] text-muted-foreground whitespace-pre-wrap">{chunk.text}</p>
                                  </div>
                                ))}
                            </div>
                          </details>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>

            {/* Progress Rail - Desktop only, mobile uses bottom sheet */}
            <div className={`hidden xl:flex h-full bg-surface-raised backdrop-blur-xl border-l border-primary/20 shadow-card ${isProgressRailCollapsed ? 'overflow-hidden items-center' : 'flex-col overflow-y-auto'}`}>
              {isProgressRailCollapsed ? (
                <div className="flex h-full w-full items-start justify-center pt-[var(--space-md)]">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setIsProgressRailCollapsed(false)}
                    aria-label="Expand lesson side panel"
                    title="Expand lesson side panel"
                    data-testid="button-expand-lesson-side-panel"
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>
              ) : (
              <div className="p-[var(--card-padding)] space-y-[var(--space-lg)]">
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsProgressRailCollapsed(true)}
                    aria-label="Collapse lesson side panel"
                    title="Collapse lesson side panel"
                    data-testid="button-collapse-lesson-side-panel"
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                    <span className="sr-only">Collapse side panel</span>
                  </Button>
                </div>
                {/* Progress Section */}
                {progress && (
                  <div className="space-y-[var(--space-md)]">
                    <div className="flex items-center justify-between gap-[var(--space-sm)]">
                      <h3 className="text-[length:var(--text-sm)] font-semibold text-primary uppercase tracking-wide">Your Progress</h3>
                      {progress.status === "completed" ? (
                        <Badge className="from-[var(--chart-2)] border-0">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Completed
                        </Badge>
                      ) : progress.status === "in_progress" ? (
                        <Badge className="border-0">
                          <Clock className="mr-1 h-3 w-3" />
                          In Progress
                        </Badge>
                      ) : (
                        <Badge variant="outline" >Not Started</Badge>
                      )}
                    </div>

                    {/* Gradient Progress Bar */}
                    {progress.status !== "completed" && (progress.percentComplete > 0 || ('slidesViewedCount' in progress && (progress as any).slidesViewedCount > 0)) && (
                      <div className="space-y-[var(--space-sm)]">
                        <div className="flex justify-between text-[length:var(--text-xs)] text-muted-foreground">
                          <span>Progress</span>
                          <span className="font-bold text-primary">
                            {('slidesViewedCount' in progress ? (progress as any).slidesViewedCount : 0)} / {('totalSlides' in progress ? (progress as any).totalSlides : 0)} slides
                          </span>
                        </div>
                        <Progress 
                          value={progress.percentComplete} 
                          className="h-2" 
                        />
                      </div>
                    )}

                    {/* Time Spent */}
                    <div className="flex items-center justify-between p-[var(--space-sm)] bg-surface-base rounded-lg border border-border">
                      <span className="text-[length:var(--text-sm)] text-muted-foreground">Time Spent</span>
                      <span className="text-[length:var(--text-sm)] font-semibold text-primary">{formatDuration(getCurrentSeconds())}</span>
                    </div>

                    {/* View Certificate or Auto-Completion Message */}
                    <>
                      {progress.status === "completed" ? (
                        <div className="p-[var(--space-sm)] bg-[var(--chart-2)]/10 rounded-lg border border-[var(--chart-2)]/30 text-center">
                          <div className="flex items-center justify-center gap-[var(--space-sm)] text-[length:var(--text-sm)] font-medium text-chart-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Lesson Completed
                          </div>
                        </div>
                      ) : linkedQuizzes.length > 0 ? (
                        <div className="p-[var(--space-sm)] bg-primary/10 rounded-lg border border-primary/30">
                          <p className="text-[length:var(--text-xs)] text-center text-muted-foreground">
                            <span className="font-medium text-foreground">Complete the linked quiz</span> to mark this lesson as complete
                          </p>
                        </div>
                      ) : (
                        <div className="p-[var(--space-sm)] bg-muted rounded-lg border border-border text-center">
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">
                            No assessment linked to this lesson
                          </p>
                        </div>
                      )}
                    </>
                  </div>
                )}

                {/* Linked Quizzes - Show only if lesson completed but quiz not passed */}
                {progress?.status === "completed" && linkedQuizzes.length > 0 && !linkedQuizzes.some((link: any) => {
                  const lessonQuizStatus = quizProgress?.lessons?.find(l => l.lessonId === lessonId);
                  return lessonQuizStatus?.quizPassed === true;
                }) && (
                  <div className="space-y-[var(--space-md)]">
                    <div className="flex items-center gap-[var(--space-sm)]">
                      <Trophy className="h-4 w-4 text-primary" />
                      <h3 className="text-[length:var(--text-sm)] font-semibold text-primary uppercase tracking-wide">Ready for Assessment!</h3>
                    </div>
                    <p className="text-[length:var(--text-xs)] text-muted-foreground">
                      Test your knowledge with {linkedQuizzes.length === 1 ? 'this quiz' : 'these quizzes'}
                    </p>
                    <div className="space-y-[var(--space-sm)]">
                      {linkedQuizzes.map((link: any) => {
                        const quizList = Array.isArray(quizzes) ? quizzes : (quizzes as any)?.collections || [];
                        const quiz = quizList.find((q: any) => q.id === link.quizId);
                        if (!quiz) return null;
                        
                        return (
                          <div
                            key={link.id}
                            className="p-[var(--space-sm)] bg-game-surface-base rounded-lg border border-primary/30 hover:border-primary/50 hover:shadow-card-hover transition-all duration-250"
                            data-testid={`linked-quiz-${link.quizId}`}
                          >
                            <div className="flex items-center justify-between mb-[var(--space-sm)]">
                              <span className="text-[length:var(--text-sm)] font-medium text-foreground">{quiz.name}</span>
                              {link.isPrimary && (
                                <Badge className="text-[length:var(--text-xs)]">Primary</Badge>
                              )}
                            </div>
                            <Button size="sm" onClick={() => setLocation(`/quiz-single/${link.quizId}${courseId ? `?courseId=${courseId}&lessonId=${lessonId}` : ""}`)}
                              className="w-full min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90 text-btn-primary-foreground border-0 shadow-elevated shadow-elevated"
                              data-testid={`button-play-quiz-${link.quizId}`}
                            >
                              <Play className="mr-2 h-3 w-3" />
                              Play Quiz
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions Menu */}
                {lesson.generationStatus === "completed" && (
                  <div className="pt-[var(--space-md)] space-y-[var(--space-sm)] border-t border-border">
                    <h3 className="text-[length:var(--text-xs)] font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>
                    
                    {/* Teacher/Admin Actions */}
                    {canManageLesson && (
                      <>
                        {linkedQuizzes.length === 0 ? (
                          <Button variant="outline" size="sm" onClick={() => {
                              const params = new URLSearchParams({
                                lessonId: lessonId!,
                                org: effectiveOrganizationId || '',
                                primaryTopic: lesson.title || '',
                                description: lesson.description || '',
                              });
                              if (lesson.gradeId) params.append('gradeId', lesson.gradeId);
                              if (lesson.subjectId) params.append('subjectId', lesson.subjectId);
                              setLocation(`/quiz-wizard?${params.toString()}`);
                            }}
                            className="w-full min-h-[44px] touch-manipulation border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                            data-testid="button-generate-quiz"
                          >
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generate Quiz
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => {
                              const params = new URLSearchParams({
                                lessonId: lessonId!,
                                org: effectiveOrganizationId || '',
                                primaryTopic: lesson.title || '',
                                description: lesson.description || '',
                              });
                              if (lesson.gradeId) params.append('gradeId', lesson.gradeId);
                              if (lesson.subjectId) params.append('subjectId', lesson.subjectId);
                              setLocation(`/quiz-wizard?${params.toString()}`);
                            }}
                            className="w-full min-h-[44px] touch-manipulation text-muted-foreground hover:text-foreground hover:bg-muted"
                            data-testid="button-regenerate-quiz"
                          >
                            <Sparkles className="mr-2 h-4 w-4" />
                            Regenerate Quiz
                          </Button>
                        )}

                        <Button variant="outline" size="sm" onClick={() => regenerateDigestMutation.mutate()}
                          disabled={regenerateDigestMutation.isPending}
                          className="w-full min-h-[44px] touch-manipulation border-border hover:bg-muted"
                          data-testid="button-regenerate-lesson-digest"
                        >
                          {regenerateDigestMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Regenerate Lesson Text
                        </Button>

                        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full min-h-[44px] touch-manipulation" data-testid="button-link-quiz" >
                          <LinkIcon className="mr-2 h-4 w-4" />
                          {lesson.relatedQuizId ? "Change Quiz" : "Link Quiz"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border w-[min(95vw,28rem)] max-h-[var(--dialog-max-height)] overflow-y-auto p-[var(--dialog-padding)]">
                        <DialogHeader>
                          <DialogTitle className="text-[length:var(--text-lg)]">Link to Quiz</DialogTitle>
                          <DialogDescription className="text-[length:var(--text-sm)]">
                            Connect this lesson to a quiz for assessment
                          </DialogDescription>
                        </DialogHeader>
                        <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
                          <SelectTrigger className="min-h-[44px]" data-testid="select-quiz-to-link">
                            <SelectValue placeholder="Select a quiz" />
                          </SelectTrigger>
                          <SelectContent>
                            {(Array.isArray(quizzes) ? quizzes : (quizzes as any)?.collections || []).map((quiz: any) => (
                              <SelectItem key={quiz.id} value={quiz.id}>
                                {quiz.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <DialogFooter className="flex-col-reverse sm:flex-row gap-[var(--space-sm)]">
                          {lesson.relatedQuizId && (
                            <Button variant="outline" onClick={() => unlinkQuizMutation.mutate()}
                              disabled={unlinkQuizMutation.isPending}
                              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                              data-testid="button-unlink-quiz"
                            >
                              Unlink Current Quiz
                            </Button>
                          )}
                          <Button onClick={() => linkQuizMutation.mutate(selectedQuizId)}
                            disabled={!selectedQuizId || linkQuizMutation.isPending}
                            className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                            data-testid="button-confirm-link-quiz"
                          >
                            {linkQuizMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <LinkIcon className="mr-2 h-4 w-4" />
                            )}
                            Link Quiz
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                        {/* Replace PPTX - Navigate to full-page upload experience for better progress feedback */}
                        {downloadData?.downloadUrl && courseId && (
                          <Button variant="outline" size="sm" className="w-full min-h-[44px] touch-manipulation" data-testid="button-replace-pptx" disabled={!isReplacePptxReady || isLoadingCourseFramework} onClick={() => {
                              if (!isReplacePptxReady) return;
                              const currentPath = window.location.pathname + window.location.search;
                              const returnTo = encodeURIComponent(currentPath);
                              setLocation(`/course-builder/${courseId}/upload/${currentTopicOrder}?lessonId=${lessonId}&returnTo=${returnTo}&courseId=${courseId}`);
                            }}
                          >
                            {isLoadingCourseFramework ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="mr-2 h-4 w-4" />
                            )}
                            Replace PPTX
                          </Button>
                        )}

                        {/* Upload/Replace Video Button */}
                        <Dialog open={videoUploadDialogOpen} onOpenChange={(open) => {
                          setVideoUploadDialogOpen(open);
                          if (!open) {
                            setVideoFile(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full min-h-[44px] touch-manipulation" data-testid="button-upload-video-sidebar" >
                              <Upload className="mr-2 h-4 w-4" />
                              {viewerData?.hasVideo ? "Replace Video" : "Upload Video"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-card border-border w-[min(95vw,28rem)] max-h-[var(--dialog-max-height)] overflow-y-auto p-[var(--dialog-padding)]">
                            <DialogHeader>
                              <DialogTitle className="text-[length:var(--text-lg)]">{viewerData?.hasVideo ? "Replace" : "Upload"} Video Walkthrough</DialogTitle>
                              <DialogDescription className="text-[length:var(--text-sm)]">
                                Upload an MP4 video walkthrough of this lesson (maximum 1GB)
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
                              <div className="space-y-[var(--space-sm)]">
                                <label htmlFor="video-file-sidebar" className="text-[length:var(--text-sm)] font-medium">
                                  MP4 Video File
                                </label>
                                <Input
                                  id="video-file-sidebar"
                                  type="file"
                                  accept=".mp4,video/mp4"
                                  className="min-h-[44px]"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setVideoFile(file);
                                    }
                                  }}
                                  data-testid="input-lesson-video"
                                />
                                {videoFile && (
                                  <p className="text-[length:var(--text-sm)] text-chart-2">
                                    Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
                                  </p>
                                )}
                                {uploadVideoMutation.isPending && videoUploadProgress > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[length:var(--text-xs)] text-muted-foreground">
                                      <span>Uploading...</span>
                                      <span>{Math.round(videoUploadProgress)}%</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary hover:bg-primary/90 transition-all"
                                        style={{ width: `${videoUploadProgress}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <DialogFooter className="flex-col-reverse sm:flex-row gap-[var(--space-sm)]">
                              <Button variant="outline" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => {
                                  setVideoUploadDialogOpen(false);
                                  setVideoFile(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button onClick={() => uploadVideoMutation.mutate()}
                                disabled={!videoFile || uploadVideoMutation.isPending}
                                className="min-h-[44px] touch-manipulation w-full sm:w-auto text-btn-primary-foreground"
                                data-testid="button-upload-video"
                              >
                                {uploadVideoMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {viewerData?.hasVideo ? "Replacing..." : "Uploading..."}
                                  </>
                                ) : (
                                  <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {viewerData?.hasVideo ? "Replace" : "Upload"}
                                  </>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}

                    {/* Download PPTX - Available to admin users only */}
                    {canManageLesson && downloadData?.downloadUrl && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" disabled={isDownloadInProgress} className="w-full min-h-[44px] touch-manipulation" data-testid="button-download-pptx" >
                            {isDownloadInProgress ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            {isDownloadInProgress ? "Downloading..." : "Download PPTX"}
                            {presentationVersions?.versions && presentationVersions.versions.length > 1 && (
                              <ChevronDown className="ml-2 h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            {presentationVersions?.versions && presentationVersions.versions.length > 0 
                              ? `${presentationVersions.versions.length} version${presentationVersions.versions.length > 1 ? 's' : ''} available`
                              : 'Download current version'}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {presentationVersions?.versions && presentationVersions.versions.length > 0 ? (
                            presentationVersions.versions.map((version) => {
                              const isCurrent = version.version === presentationVersions.currentVersion;
                              const createdDate = new Date(version.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              });
                              return (
                                <DropdownMenuItem
                                  key={version.id}
                                  disabled={downloadingVersionId === version.id}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    setDownloadingVersionId(version.id);
                                    try {
                                      const data = await downloadVersionMutation.mutateAsync(version.id);
                                      if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                        const filename = data.filename || generatePptxFilename(lesson?.title || 'lesson', version.version);
                                        const success = await safeDownload(data.downloadUrl, filename, (error) => {
                                          toast({
                                            variant: "destructive",
                                            title: "Download failed",
                                            description: error,
                                          });
                                        });
                                        if (success) {
                                          toast({
                                            title: "Download started",
                                            description: `Downloading version ${version.version}`,
                                          });
                                        }
                                      } else {
                                        toast({
                                          variant: "destructive",
                                          title: "Download failed",
                                          description: "Invalid download URL received from server",
                                        });
                                      }
                                    } catch (error: any) {
                                      const errorMessage = error.message || "Failed to download version";
                                      const isVersionNotFound = errorMessage.toLowerCase().includes('version not found') || 
                                                               errorMessage.toLowerCase().includes('not found');
                                      toast({
                                        variant: "destructive",
                                        title: "Download failed",
                                        description: isVersionNotFound 
                                          ? "This version is no longer available. Refreshing version list..." 
                                          : errorMessage,
                                      });
                                      // Defensive: refetch versions if version not found (stale cache)
                                      if (isVersionNotFound) {
                                        refetchVersions();
                                      }
                                    } finally {
                                      setDownloadingVersionId(null);
                                    }
                                  }}
                                  className={`flex flex-col items-start gap-0.5 py-2 ${isCurrent ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                                  data-testid={`download-version-${version.version}`}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    {downloadingVersionId === version.id ? (
                                      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                                    ) : (
                                      <Download className="h-4 w-4 flex-shrink-0" />
                                    )}
                                    <span className="font-medium">
                                      Version {version.version}
                                      {isCurrent && (
                                        <Badge variant="secondary" className="ml-2 px-1 py-0">
                                          Current
                                        </Badge>
                                      )}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground ml-6">
                                    {createdDate}
                                  </span>
                                </DropdownMenuItem>
                              );
                            })
                          ) : (
                            <DropdownMenuItem
                              disabled={isDownloadInProgress}
                              onClick={async () => {
                                setDownloadingVersionId("current");
                                try {
                                  if (downloadData?.downloadUrl && isValidDownloadUrl(downloadData.downloadUrl)) {
                                    const filename = downloadData.filename || generatePptxFilename(lesson?.title || 'lesson');
                                    const success = await safeDownload(downloadData.downloadUrl, filename, (error) => {
                                      toast({
                                        variant: "destructive",
                                        title: "Download failed",
                                        description: error,
                                      });
                                    });
                                    if (success) {
                                      toast({
                                        title: "Download started",
                                        description: "Your lesson file is being downloaded.",
                                      });
                                    }
                                  } else {
                                    toast({
                                      variant: "destructive",
                                      title: "Download failed",
                                      description: "Download URL is not available. Please try again.",
                                    });
                                  }
                                } catch (error: any) {
                                  toast({
                                    variant: "destructive",
                                    title: "Download failed",
                                    description: error?.message || "Failed to download current version.",
                                  });
                                } finally {
                                  setDownloadingVersionId(null);
                                }
                              }}
                              data-testid="download-current-version"
                            >
                              {isDownloadInProgress ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              {isDownloadInProgress ? "Downloading Current Version..." : "Download Current Version"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {/* Download PPTX - Learner access (current version only, no version history) */}
                    {!canManageLesson && downloadData?.downloadUrl && isValidDownloadUrl(downloadData.downloadUrl) && (
                      <Button variant="outline" size="sm" disabled={isDownloadInProgress} onClick={async () => {
                          setDownloadingVersionId("current");
                          try {
                            const filename = downloadData.filename || generatePptxFilename(lesson?.title || 'lesson');
                            const success = await safeDownload(downloadData.downloadUrl, filename, (error) => {
                              toast({
                                variant: "destructive",
                                title: "Download failed",
                                description: error,
                              });
                            });
                            if (success) {
                              toast({
                                title: "Download started",
                                description: "Your lesson file is being downloaded.",
                              });
                            }
                          } catch (error: any) {
                            toast({
                              variant: "destructive",
                              title: "Download failed",
                              description: error?.message || "Failed to download lesson.",
                            });
                          } finally {
                            setDownloadingVersionId(null);
                          }
                        }}
                        className="w-full min-h-[44px] touch-manipulation border-secondary/30 hover:bg-secondary/10 hover:border-secondary/50"
                        data-testid="button-download-pptx-learner"
                      >
                        {isDownloadInProgress ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        {isDownloadInProgress ? "Downloading..." : "Download PPTX"}
                      </Button>
                    )}

                    {/* Play Quiz - Available when linked quizzes exist */}
                    {linkedQuizzes.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => {
                          const firstQuiz = linkedQuizzes[0];
                          setLocation(`/quiz-single/${firstQuiz.quizId}${effectiveCourseId ? `?courseId=${effectiveCourseId}&lessonId=${lessonId}` : ""}`);
                        }}
                        className="w-full min-h-[44px] touch-manipulation border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                        data-testid="button-play-quiz"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Play Quiz
                      </Button>
                    )}
                  </div>
                )}

                {/* Course Lessons Navigation - Below Actions */}
                {courseId && (
                  <div className="space-y-[var(--space-md)] pt-[var(--space-md)] border-t border-border">
                    <div className="flex items-center gap-[var(--space-sm)]">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h3 className="text-[length:var(--text-sm)] font-semibold text-primary uppercase tracking-wide">Course Lessons</h3>
                    </div>
                    {isDemoMode ? (
                      <div className="p-[var(--space-sm)] bg-primary/5 rounded-lg border border-primary/20 text-center">
                        <p className="text-[length:var(--text-xs)] text-muted-foreground">
                          Purchase the course to unlock all lessons
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => setLocation(`/courses/${courseId}/purchase`)}
                          className="mt-2 text-primary hover:bg-primary/10"
                        >
                          View Full Course
                        </Button>
                      </div>
                    ) : courseFramework?.lessons && courseFramework.lessons.length > 0 ? (
                      <div className="space-y-[var(--space-xs)] max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                        {courseFramework.lessons.map((courseLessonItem, index) => {
                          const isCurrentLesson = courseLessonItem.lessonId === lessonId || courseLessonItem.lessonId === currentLessonContentGroupId;
                          const lessonTitle = courseLessonItem.lesson?.title || courseLessonItem.topicName;
                          const lessonProgressItem = quizProgress?.lessons?.find(
                            (l) => l.lessonId === courseLessonItem.lessonId
                          );
                          const isCompleted = lessonProgressItem?.quizPassed === true;
                          // Check quiz from progress data first, fallback to framework's primaryQuizId, or current lesson's linked quizzes
                          const hasQuiz = lessonProgressItem?.hasQuiz === true || 
                            !!courseLessonItem.primaryQuizId ||
                            (isCurrentLesson && linkedQuizzes.length > 0);
                          
                          return (
                            <div
                              key={courseLessonItem.id}
                              className={`flex items-center gap-[var(--space-sm)] p-[var(--space-sm)] rounded-lg cursor-pointer transition-all duration-200 hover:bg-muted group ${
                                isCurrentLesson 
                                  ? 'bg-primary/15 border-l-2 border-l-primary border border-primary/30' 
                                  : 'border border-transparent hover:border-border'
                              }`}
                              style={{
                                backgroundColor: isCurrentLesson ? "var(--lesson-nav-active)" : "var(--lesson-nav-bg)",
                                color: isCurrentLesson ? "var(--action-primary-fg)" : "var(--lesson-nav-fg)",
                              }}
                              onClick={() => {
                                if (!isCurrentLesson && courseLessonItem.lessonId) {
                                  // Guard against object being passed instead of string
                                  const lessonIdStr = typeof courseLessonItem.lessonId === 'string' 
                                    ? courseLessonItem.lessonId 
                                    : (courseLessonItem.lessonId as any)?.id;
                                  if (!lessonIdStr || typeof lessonIdStr !== 'string') {
                                    console.error('[LessonViewer] Invalid lessonId:', courseLessonItem.lessonId);
                                    return;
                                  }
                                  const navParams = new URLSearchParams(searchParams);
                                  navParams.set('courseId', effectiveCourseId || courseId);
                                  setLocation(`/lessons/${lessonIdStr}?${navParams.toString()}`);
                                }
                              }}
                              data-testid={`lesson-nav-item-${courseLessonItem.lessonId}`}
                            >
                              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                {isCompleted ? (
                                  <CheckCircle2 className="h-4 w-4 text-chart-2" />
                                ) : isCurrentLesson ? (
                                  <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--lesson-nav-fg)" }} />
                                ) : (
                                  <span className="text-[length:var(--text-xs)] text-muted-foreground font-medium">{index + 1}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-[length:var(--text-sm)] block truncate ${
                                  isCurrentLesson 
                                    ? 'font-medium text-foreground' 
                                    : 'text-muted-foreground group-hover:text-foreground'
                                }`}>
                                  {lessonTitle}
                                </span>
                                {isCurrentLesson && (
                                  <span className="text-[length:var(--text-xs)]" style={{ color: "var(--lesson-nav-fg)" }}>Now viewing</span>
                                )}
                              </div>
                              {isCompleted ? null : hasQuiz ? (
                                <FileQuestion className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-label="Has quiz" />
                              ) : (
                                <span className="text-[length:var(--text-xs)] text-muted-foreground/60 italic">No quiz</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : courseFramework === undefined ? (
                      <div className="space-y-[var(--space-xs)]">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex items-center gap-[var(--space-sm)] p-[var(--space-sm)]">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <Skeleton className="h-4 flex-1" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-[var(--space-sm)] bg-muted/50 rounded-lg border border-border text-center">
                        <p className="text-[length:var(--text-xs)] text-muted-foreground">
                          No other lessons in this course
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Mobile Bottom Sheet - Shows on mobile/tablet */}
            <div className={`${isMediaFullscreen ? 'hidden' : 'xl:hidden'} fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-xl border-t border-primary/20 p-[var(--space-md)] safe-area-bottom`}>
              <div className="space-y-[var(--space-sm)]">
                  {/* Lesson Title - Mobile Only */}
                  <div className="md:hidden">
                    <h2 className="text-[length:var(--text-sm)] font-semibold text-foreground truncate">
                      {lesson.title}
                    </h2>
                    {(lesson.gradeLevelName || lesson.departmentName || lesson.subjectName || lesson.unitName) && (
                      <p className="text-[length:var(--text-xs)] text-muted-foreground truncate">
                        {lesson.gradeLevelName || lesson.departmentName}
                        {(lesson.subjectName || lesson.unitName) && ` • ${lesson.subjectName || lesson.unitName}`}
                      </p>
                    )}
                  </div>

                  {/* Compact Progress Bar */}
                  {progress && progress.status !== "completed" && (progress.percentComplete > 0 || ('slidesViewedCount' in progress && (progress as any).slidesViewedCount > 0)) && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[length:var(--text-xs)] text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-semibold text-primary">
                          {('slidesViewedCount' in progress ? (progress as any).slidesViewedCount : 0)} / {('totalSlides' in progress ? (progress as any).totalSlides : 0)} slides
                        </span>
                      </div>
                      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-primary hover:bg-primary/90 rounded-full transition-all duration-500 ease-out shadow-elevated shadow-elevated"
                          style={{ width: `${progress.percentComplete}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-[var(--space-sm)] min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                    {progress && (
                      <div className="flex items-center gap-[var(--space-sm)] text-[length:var(--text-xs)]">
                        {progress.status === "completed" ? (
                          <Badge className="from-[var(--chart-2)] border-0 text-[length:var(--text-xs)]">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Done
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            <Clock className="inline h-3 w-3 mr-1" />
                            {formatDuration(getCurrentSeconds())}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-[var(--space-sm)]">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsMediaFullscreen(true)}
                        className="min-h-[44px] touch-manipulation"
                        aria-label="View lesson media fullscreen"
                        data-testid="button-authenticated-media-fullscreen-mobile"
                      >
                        <Maximize2 className="mr-2 h-3 w-3" />
                        Fullscreen
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsMobileSidePanelOpen(true)}
                        className="min-h-[44px] touch-manipulation"
                        aria-label="Open lesson side panel"
                        data-testid="button-open-lesson-side-panel"
                      >
                        <BookOpen className="mr-2 h-3 w-3" />
                        Panel
                      </Button>

                      {linkedQuizzes.length > 0 && (
                        <Button size="sm" onClick={() => {
                            const firstQuiz = linkedQuizzes[0];
                            setLocation(`/quiz-single/${firstQuiz.quizId}${courseId ? `?courseId=${courseId}&lessonId=${lessonId}` : ""}`);
                          }}
                          className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90 text-btn-primary-foreground border-0 shadow-elevated shadow-elevated"
                          data-testid="button-play-quiz-mobile"
                        >
                          <Play className="mr-2 h-3 w-3" />
                          Quiz
                        </Button>
                      )}
                      
                      {progress && (
                        <>
                          {progress.status !== "completed" && linkedQuizzes.length > 0 ? (
                            <span className="text-xs text-body-muted text-right">
                              Complete the quiz to finish this lesson
                            </span>
                          ) : progress.status !== "completed" ? (
                            <span className="text-xs text-body-muted text-right">
                              No quiz linked
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
            </div>
            <Dialog open={isMobileSidePanelOpen} onOpenChange={setIsMobileSidePanelOpen}>
              <DialogContent
                className="w-[min(94vw,28rem)] max-w-[94vw] max-h-[var(--dialog-max-height)] overflow-y-auto overflow-x-hidden p-[var(--dialog-padding)]"
                data-testid="lesson-side-panel-mobile"
              >
                <DialogHeader>
                  <DialogTitle className="text-[length:var(--text-lg)]">Lesson Panel</DialogTitle>
                  <DialogDescription className="text-[length:var(--text-sm)]">
                    Progress, actions, and course lessons for the current lesson.
                  </DialogDescription>
                </DialogHeader>

                <div className="min-w-0 space-y-[var(--space-lg)]">
                  {progress && (
                    <div className="space-y-[var(--space-md)]">
                      <div className="flex items-center justify-between gap-[var(--space-sm)]">
                        <h3 className="text-[length:var(--text-sm)] font-semibold text-primary uppercase tracking-wide">Your Progress</h3>
                        {progress.status === "completed" ? (
                          <Badge className="from-[var(--chart-2)] border-0">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Completed
                          </Badge>
                        ) : progress.status === "in_progress" ? (
                          <Badge className="border-0">
                            <Clock className="mr-1 h-3 w-3" />
                            In Progress
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not Started</Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between p-[var(--space-sm)] bg-surface-base rounded-lg border border-border">
                        <span className="text-[length:var(--text-sm)] text-muted-foreground">Time Spent</span>
                        <span className="text-[length:var(--text-sm)] font-semibold text-primary">{formatDuration(getCurrentSeconds())}</span>
                      </div>
                    </div>
                  )}

                  {linkedQuizzes.length > 0 && (
                    <div className="space-y-[var(--space-sm)] pt-[var(--space-md)] border-t border-border">
                      <h3 className="text-[length:var(--text-xs)] font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const firstQuiz = linkedQuizzes[0];
                          setIsMobileSidePanelOpen(false);
                          setLocation(`/quiz-single/${firstQuiz.quizId}${effectiveCourseId ? `?courseId=${effectiveCourseId}&lessonId=${lessonId}` : ""}`);
                        }}
                        className="w-full min-h-[44px] touch-manipulation border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                        data-testid="button-play-quiz-side-panel-mobile"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Play Quiz
                      </Button>
                    </div>
                  )}

                  {courseId && (
                    <div className="space-y-[var(--space-md)] pt-[var(--space-md)] border-t border-border">
                      <div className="flex items-center gap-[var(--space-sm)]">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <h3 className="text-[length:var(--text-sm)] font-semibold text-primary uppercase tracking-wide">Course Lessons</h3>
                      </div>
                      {courseFramework?.lessons && courseFramework.lessons.length > 0 ? (
                        <div className="min-w-0 space-y-[var(--space-xs)] max-h-[50vh] overflow-y-auto overflow-x-hidden pr-1">
                          {courseFramework.lessons.map((courseLessonItem, index) => {
                            const isCurrentLesson = courseLessonItem.lessonId === lessonId || courseLessonItem.lessonId === currentLessonContentGroupId;
                            const lessonTitle = courseLessonItem.lesson?.title || courseLessonItem.topicName;
                            return (
                              <button
                                key={courseLessonItem.id}
                                type="button"
                                className={`flex w-full min-w-0 items-center gap-[var(--space-sm)] p-[var(--space-sm)] rounded-lg text-left transition-all duration-200 ${
                                  isCurrentLesson
                                    ? 'bg-primary/15 border-l-2 border-l-primary border border-primary/30'
                                    : 'border border-transparent hover:border-border hover:bg-muted'
                                }`}
                                onClick={() => {
                                  if (isCurrentLesson || !courseLessonItem.lessonId) return;
                                  const navParams = new URLSearchParams(searchParams);
                                  navParams.set('courseId', effectiveCourseId || courseId);
                                  setIsMobileSidePanelOpen(false);
                                  setLocation(`/lessons/${courseLessonItem.lessonId}?${navParams.toString()}`);
                                }}
                                data-testid={`lesson-nav-item-mobile-${courseLessonItem.lessonId}`}
                              >
                                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[length:var(--text-xs)] font-medium text-muted-foreground">
                                  {index + 1}
                                </span>
                                <span className="min-w-0 flex-1 overflow-hidden">
                                  <span className="block whitespace-normal break-words text-[length:var(--text-sm)] text-foreground">{lessonTitle}</span>
                                  {isCurrentLesson && (
                                    <span className="text-[length:var(--text-xs)] text-primary">Now viewing</span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-[var(--space-sm)] bg-muted/50 rounded-lg border border-border text-center">
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">
                            No other lessons in this course
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </DialogContent>
              </Dialog>
              {isMediaFullscreen && (
                <div
                  className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background supports-[height:100dvh]:h-[100dvh] supports-[width:100dvw]:w-[100dvw]"
                  data-testid="authenticated-media-fullscreen"
                >
                  <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 py-2 safe-area-top landscape:absolute landscape:left-0 landscape:right-0 landscape:top-0 landscape:z-20 landscape:bg-card/80">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[length:var(--text-sm)] font-semibold text-foreground">
                        {effectiveLesson?.title || lesson?.title || "Lesson"}
                      </h2>
                    </div>
                    {effectiveVideoUrl && (effectiveViewerUrl || effectiveIsLocalPptx) && (
                      <div className="flex rounded-md border border-border bg-surface-raised/80 p-1">
                        <Button
                          type="button"
                          variant={activeContentTab === "video" ? "default" : "ghost"}
                          size="icon"
                          onClick={() => setActiveContentTab("video")}
                          className="h-8 w-8"
                          aria-label="Show video"
                        >
                          <Video className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant={activeContentTab === "slides" ? "default" : "ghost"}
                          size="icon"
                          onClick={() => setActiveContentTab("slides")}
                          className="h-8 w-8"
                          aria-label="Show slides"
                        >
                          <Presentation className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {renderCompactPodcastPlayer("audio-authenticated-lesson-podcast-fullscreen", "lesson_viewer_authenticated_fullscreen")}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMediaFullscreen(false)}
                      className="min-h-[44px] touch-manipulation"
                      data-testid="button-exit-authenticated-media-fullscreen"
                    >
                      <Minimize2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Exit</span>
                    </Button>
                  </div>
                  <div
                    className="min-h-0 flex-1 bg-background landscape:flex landscape:flex-row landscape:items-center landscape:justify-center landscape:px-[max(env(safe-area-inset-left),0.5rem)] landscape:pb-[max(env(safe-area-inset-bottom),0.5rem)] landscape:pt-[calc(max(env(safe-area-inset-top),0.5rem)+3.5rem)]"
                    data-testid="authenticated-media-fullscreen-shell"
                  >
                    <div className="h-full w-full landscape:aspect-video landscape:w-auto landscape:max-w-full">
                      {effectiveVideoUrl && (!(effectiveViewerUrl || effectiveIsLocalPptx) || activeContentTab === "video") ? (
                        <div className="h-full w-full overflow-hidden bg-background">
                          <VideoPlayer videoUrl={effectiveVideoUrl} title={effectiveLesson?.title || lesson?.title || "Lesson"} canDownload={canManageLesson} />
                        </div>
                      ) : (effectiveSlideImages?.urls?.length ?? 0) > 0 ? (
                        <div className="relative h-full w-full">
                          <SlideImageViewer
                            slideUrls={effectiveSlideImages!.urls}
                            title={effectiveLesson?.title || lesson?.title || "Lesson"}
                            className="absolute inset-0 h-full w-full"
                            fillMode
                          />
                        </div>
                      ) : effectiveIsLocalPptx ? (
                        <div className="flex h-full w-full items-center justify-center bg-muted/50">
                          <div className="p-6 text-center">
                            {isSlideConversionPending(viewerData) ? (
                              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
                            ) : (
                              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
                            )}
                            <p className="text-sm text-muted-foreground">{getSlideConversionMessage(viewerData)}</p>
                          </div>
                        </div>
                      ) : effectiveViewerUrl ? (
                        <iframe
                          src={effectiveViewerUrl}
                          className="h-full w-full border-0 bg-muted"
                          title={effectiveLesson?.title || lesson?.title || "Lesson"}
                          data-testid="iframe-lesson-viewer-fullscreen"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : lesson.generationStatus === "processing" || lesson.generationStatus === "polling" || lesson.generationStatus === "pending" ? (
          <div className="flex flex-col items-center justify-center h-full px-[var(--container-padding)]">
            <div className="text-center space-y-[var(--space-md)] p-[var(--card-padding)] bg-card/70 backdrop-blur-xl rounded-2xl border border-primary/20 max-w-[min(95vw,28rem)]">
              <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto" />
              <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground">Generating your lesson...</h3>
              <p className="text-muted-foreground text-[length:var(--text-sm)]">
                This page auto-refreshes every few seconds while generation is in progress.
              </p>
              <div className="pt-1">
                <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation" onClick={handleManualRefresh} >
                  Refresh now
                </Button>
              </div>
            </div>
          </div>
        ) : lesson.generationStatus === "failed" ? (
          <div className="flex flex-col items-center justify-center h-full px-[var(--container-padding)]">
            <div className="text-center space-y-[var(--space-md)] p-[var(--card-padding)] bg-card/70 backdrop-blur-xl rounded-2xl border border-destructive/20 max-w-[min(95vw,28rem)]">
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground">Generation Failed</h3>
              <p className="text-muted-foreground text-[length:var(--text-sm)]">
                There was an error generating this lesson.
              </p>
              <Button onClick={() => setLocation(courseId ? `/course-builder/${courseId}/lessons` : "/lessons")} className="mt-[var(--space-md)] min-h-[44px] touch-manipulation">
                Back to Lessons
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full px-[var(--container-padding)]">
            <div className="text-center space-y-[var(--space-md)] p-[var(--card-padding)] bg-card/70 backdrop-blur-xl rounded-2xl border border-border max-w-[min(95vw,28rem)]">
              <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto" />
              <h3 className="text-[length:var(--text-xl)] font-semibold text-foreground">Preparing lesson content...</h3>
              <p className="text-muted-foreground text-[length:var(--text-sm)]">
                Your selected language version is loading. This can take a few seconds.
              </p>
              <div className="pt-1">
                <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation" onClick={handleManualRefresh} >
                  Refresh now
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
