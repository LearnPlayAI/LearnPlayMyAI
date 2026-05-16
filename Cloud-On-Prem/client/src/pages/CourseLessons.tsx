import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { ArrowLeft, BookOpen, CheckCircle, Loader2, AlertCircle, Sparkles, FileText, Wand2, RefreshCw, RefreshCcw, Upload, Link2, RotateCcw, Archive, Clock, MapPin, AlertTriangle, X, Plus, Library, Coins, FileQuestion, Video, Pencil, Trash2, ChevronUp, ChevronDown, GraduationCap, BarChart3, History, Building2, Globe, Mic, Lightbulb } from 'lucide-react';
import { ContentCoachPanel } from '@/components/ContentCoachPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery, useMutation } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { LessonPickerModal } from '@/components/LessonPickerModal';
import { LessonActionsMenu } from '@/components/LessonActionsMenu';
import { LessonEditDialog } from '@/components/LessonEditDialog';
import { CourseAssignmentModal } from '@/components/CourseAssignmentModal';
import { queryClient, apiRequest, invalidateLessonCaches, invalidateWalletCaches } from '@/lib/queryClient';
import { generatePptxFilename, isValidDownloadUrl, safeDownload } from '@/lib/downloadHelper';
import { getContentLessonReadiness, hasNativeSourceLessonMaterial } from '@/lib/courseLessonReadiness';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { LP_CREDITS_SHORT } from "@shared/creditConstants";
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface Topic {
  id?: string;
  order: number;
  name: string;
  description?: string;
  isOverview?: boolean;
  lessonType?: string;
  lessonId: string | null;
  objectives?: string[];
  learningObjectives?: Array<{
    id?: string;
    objective?: string;
    bloomLevel?: string;
  }>;
  previousLessonId?: string;
  unlinkedAt?: string;
}

type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

interface LessonObjectiveDraft {
  id: string;
  objective: string;
  bloomLevel: BloomLevel;
}

type LessonSourceType = 'manual_topic' | 'sourcedb' | 'pptx' | 'word' | 'podcast';

interface LessonSourceSelection {
  sourceType: LessonSourceType;
  versionRef: string;
  languageCode?: string;
}

interface LessonSourceOption {
  id: string;
  sourceType: LessonSourceType;
  versionRef: string;
  label: string;
  createdAt: string | null;
  languageCode: string;
  isActive: boolean;
  wordCount: number;
  description: string;
}

interface LessonSourceContract {
  sourceType: LessonSourceType;
  versionRef: string;
  label: string;
  languageCode: string;
  createdAt: string | null;
  contentLength: number;
  contentHash: string;
  resolverVersion: string;
  selectedAt?: string;
  selectedBy?: string | null;
  warning?: string;
}

interface CourseFramework {
  id: string;
  courseId: string;
  topics: Topic[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
  organizationId: string;
  status?: string;
  publishedAt?: string;
  department?: string;
  unit?: string;
  sourceDocumentId?: string;
  languageCode?: string;
  thumbnailUrl?: string;
  price?: string;
  visibility?: string;
}

interface CourseAssignmentSummary {
  id: string;
  assignmentScope?: string | null;
  unitId?: string | null;
  subUnitId?: string | null;
  teamId?: string | null;
  userId?: string | null;
}

interface LessonData {
  id: string;
  title: string;
  description?: string;
  generationStatus: string;
  isArchived?: boolean;
  isPublished?: boolean;
  storageKey?: string;
  videoStorageKey?: string;
  inputText?: string;
  themeId?: string;
  department?: string;
  unit?: string;
  creditsUsed?: number;
  linkedQuizId?: string | null;
  linkedQuizName?: string | null;
  linkedQuizCount?: number;
  contentScore10?: number;
  previousScore10?: number;
  lastFeedbackAt?: string;
  feedbackReport?: any;
  gammaCardId?: string;
  sourceDocumentPath?: string;
  hasContentVersions?: boolean;
  languageCode?: string;
  learningObjectives?: Array<{
    id?: string;
    objective?: string;
    bloomLevel?: string;
  }>;
  translationStatus?: string;
  isDefaultLanguage?: boolean;
  contentGroupId?: string;
  feedbackStatus?: string;
  aiImproveStatus?: string;
  updatedAt?: string;
  metadata?: { error?: string; [key: string]: any };
}

interface LessonActionItem {
  id: string;
  label: string;
  kind: 'required' | 'recommended' | 'optional';
  status: 'todo' | 'done' | 'blocked';
  detail?: string;
}

interface ArtifactSelectorPresentationVersion {
  id: string;
  version: number;
  createdAt: string;
}

interface ArtifactSelectorLinkedQuiz {
  id: string;
  quizId: string;
  isPrimary: boolean;
  createdAt?: string;
}

interface ArtifactSelectorPodcastVersion {
  id: string;
  title?: string;
  createdAt?: string;
  languageCode?: string;
  status?: string;
  scriptId?: string;
}

interface ArtifactSelectorLessonVersion {
  id: string | null;
  versionNumber: number;
  title?: string;
  createdAt?: string;
  isCurrentState?: boolean;
}

interface ArtifactSelectorStepGuideVersion {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  stepCount?: number;
  sourceFilename?: string;
  sourceType?: string;
}

interface ArtifactSelectorContentVersion {
  id: string;
  versionNumber: number;
  title?: string;
  changeDescription?: string;
  source?: string;
  createdAt?: string;
  isCurrentState?: boolean;
  isSyntheticInitial?: boolean;
}

interface ArtifactSelectorData {
  hasVideo: boolean;
  resolvedPptxLessonId?: string;
  resolvedQuizLessonId?: string;
  resolvedPodcastLessonId?: string;
  resolvedPodcastLanguageCode?: string;
  resolvedStepGuideLessonId?: string;
  currentPresentationVersion: number | null;
  presentationVersions: ArtifactSelectorPresentationVersion[];
  linkedQuizzes: ArtifactSelectorLinkedQuiz[];
  activePodcastVersionId: string | null;
  podcastVersions: ArtifactSelectorPodcastVersion[];
  lessonVersions: ArtifactSelectorLessonVersion[];
  sourceContentVersions: ArtifactSelectorContentVersion[];
  activeStepGuideVersionId: string | null;
  stepGuideVersions: ArtifactSelectorStepGuideVersion[];
}

type QuickArtifactType =
  | 'source_db'
  | 'word_source'
  | 'pptx'
  | 'video'
  | 'quiz'
  | 'podcast_audio'
  | 'podcast_script'
  | 'learning_objectives'
  | 'lesson_digest';

interface RelinkableLesson {
  id: string;
  title: string;
  description: string | null;
  previousOrder: number;
  previousTopicName: string;
  unlinkedAt: Date;
  generationStatus: string;
}

export default function CourseLessons() {
  const [, params] = useRoute('/course-builder/:id/lessons');
  const courseId = params?.id;
  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [slotSelectorOpen, setSlotSelectorOpen] = useState(false);
  const [relinkDialogOpen, setRelinkDialogOpen] = useState(false);
  const [selectedUnlinkedTopic, setSelectedUnlinkedTopic] = useState<Topic | null>(null);
  const [archivedLessonsOpen, setArchivedLessonsOpen] = useState(false);
  const [selectedArchivedLesson, setSelectedArchivedLesson] = useState<RelinkableLesson | null>(null);
  const [staleConfirmOpen, setStaleConfirmOpen] = useState(false);
  const [orderOverrideDialogOpen, setOrderOverrideDialogOpen] = useState(false);
  const [selectedOrderOverride, setSelectedOrderOverride] = useState<string>('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<LessonData | null>(null);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [lessonToUnlink, setLessonToUnlink] = useState<{ lessonId: string; title: string } | null>(null);
  const [createLessonDialogOpen, setCreateLessonDialogOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonDescription, setNewLessonDescription] = useState('');
  const [coachPanelLesson, setCoachPanelLesson] = useState<{ id: string; title: string } | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [pendingAssignmentModalOpen, setPendingAssignmentModalOpen] = useState(false);
  const [feedbackLesson, setFeedbackLesson] = useState<{ id: string; title: string } | null>(null);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [confirmFeedbackOpen, setConfirmFeedbackOpen] = useState(false);
  const [confirmFixOpen, setConfirmFixOpen] = useState(false);
  const [pendingFixAction, setPendingFixAction] = useState<'ai_fix' | 'expand_abbreviations' | null>(null);
  const [pendingLessonActions, setPendingLessonActions] = useState<Record<string, boolean>>({});
  const [objectivesEditorLessonId, setObjectivesEditorLessonId] = useState<string | null>(null);
  const [objectivesEditorTopicId, setObjectivesEditorTopicId] = useState<string | undefined>(undefined);
  const [objectiveDraftRows, setObjectiveDraftRows] = useState<LessonObjectiveDraft[]>([]);
  const [objectiveDraftError, setObjectiveDraftError] = useState<string | null>(null);
  const [objectiveGenerationLevel, setObjectiveGenerationLevel] = useState<BloomLevel>('apply');
  const [objectiveSourceSelection, setObjectiveSourceSelection] = useState<LessonSourceSelection | null>(null);
  const [objectiveLastGeneratedSourceContract, setObjectiveLastGeneratedSourceContract] = useState<LessonSourceContract | null>(null);
  const [aiFixSummaryDialogOpen, setAiFixSummaryDialogOpen] = useState(false);
  const [aiFixSummary, setAiFixSummary] = useState<{
    summary: string;
    improvements: string[];
    creditsCharged: number;
    originalWordCount: number;
    improvedWordCount: number;
  } | null>(null);
  const [frameworkTranslationLang, setFrameworkTranslationLang] = useState<string | null>(null);
  const [pptxActionContext, setPptxActionContext] = useState<{
    lessonId: string;
    lessonTitle: string;
    topicOrder: number;
    topicId?: string;
    topicName?: string;
  } | null>(null);
  const [optionalStepsContext, setOptionalStepsContext] = useState<{
    lessonId: string;
    lessonTitle: string;
    topic: Topic;
    items: LessonActionItem[];
  } | null>(null);
  const [artifactSelectorCache, setArtifactSelectorCache] = useState<Record<string, ArtifactSelectorData>>({});
  const [artifactSelectorLoadingKeys, setArtifactSelectorLoadingKeys] = useState<Record<string, true>>({});
  const [quickArtifactDrawerOpen, setQuickArtifactDrawerOpen] = useState(false);
  const [quickArtifactContext, setQuickArtifactContext] = useState<{ lessonId: string; lessonTitle: string; artifact: QuickArtifactType } | null>(null);
  const [quickArtifactSelection, setQuickArtifactSelection] = useState<Record<string, string>>({});
  const stepGuideFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingStepGuideUploadContext, setPendingStepGuideUploadContext] = useState<{
    sourceLessonId: string;
    targetLessonId: string;
    languageCode: string;
  } | null>(null);
  const [lessonCardExpanded, setLessonCardExpanded] = useState<Record<string, boolean>>({});
  const [selectedPublishLanguage, setSelectedPublishLanguage] = useState<string>('en');
  const [selectedReadinessLanguage, setSelectedReadinessLanguage] = useState<string>('');
  const [readinessOverviewOpen, setReadinessOverviewOpen] = useState(false);
  const [readinessOverviewLanguage, setReadinessOverviewLanguage] = useState<string>('');
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learnerPlural: 'Learners',
    unit: 'Department',
    unitPlural: 'Departments',
  };
  const learnerPluralLower = terminology.learnerPlural.toLowerCase();
  const unitLower = terminology.unit.toLowerCase();
  const { onpremMode } = usePlatformMode();

  const getLessonActionPendingKey = (lessonId: string, actionId: string) => `${lessonId}:${actionId}`;
  const isLessonActionPending = (lessonId: string, actionId: string) =>
    !!pendingLessonActions[getLessonActionPendingKey(lessonId, actionId)];

  const openAssignmentModalFromPublish = () => {
    setPublishModalOpen(false);
    setPendingAssignmentModalOpen(true);
  };

  useEffect(() => {
    if (publishModalOpen || !pendingAssignmentModalOpen) return;
    setPendingAssignmentModalOpen(false);
    setAssignmentModalOpen(true);
  }, [publishModalOpen, pendingAssignmentModalOpen]);

  const BLOOM_LEVEL_OPTIONS: Array<{ value: BloomLevel; label: string }> = [
    { value: 'remember', label: 'Remember' },
    { value: 'understand', label: 'Understand' },
    { value: 'apply', label: 'Apply' },
    { value: 'analyze', label: 'Analyze' },
    { value: 'evaluate', label: 'Evaluate' },
    { value: 'create', label: 'Create' },
  ];

  const { data: framework, isLoading, error, refetch } = useQuery<CourseFramework>({
    queryKey: ['/api/courses', courseId, 'framework'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 404) {
          return { id: '', courseId: courseId || '', topics: [] };
        }
        throw new Error('Failed to load course framework');
      }
      return response.json();
    },
    enabled: !!courseId,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
    // Refetch when window regains focus to catch any background changes
    refetchOnWindowFocus: true,
    // Poll framework every 15 seconds when there are linked lessons (to detect status changes)
    // The lessonsData query handles the faster 5s polling for active generation
    refetchInterval: (query) => {
      const topics = query.state.data?.topics || [];
      const hasLinkedLessons = topics.some((topic: any) => topic.lessonId);
      if (hasLinkedLessons) return 15000;
      // Baseline slow polling to detect newly linked lessons from background jobs
      const hasUnlinkedTopics = topics.some((topic: any) => !topic.lessonId);
      if (hasUnlinkedTopics) return 30000;
      return false;
    },
  });

  const { data: course } = useQuery<Course>({
    queryKey: ['/api/courses', courseId, 'details'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load course');
      return response.json();
    },
    enabled: !!courseId,
  });

  const courseOrgId = (course as Course | undefined)?.organizationId;

  const { data: objectiveSourceData } = useQuery<{
    lessonId: string;
    languageCode: string;
    defaultSelection: LessonSourceSelection;
    options: LessonSourceOption[];
  }>({
    queryKey: ['/api/lessons', objectivesEditorLessonId, 'quiz-sources', courseOrgId || (user as any)?.organizationId || ''],
    enabled: !!objectivesEditorLessonId && !!(courseOrgId || (user as any)?.organizationId),
    queryFn: async () => {
      const orgId = courseOrgId || (user as any)?.organizationId;
      const response = await fetch(
        `/api/lessons/${objectivesEditorLessonId}/quiz-sources?organizationId=${encodeURIComponent(orgId)}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to load objective source options');
      return response.json();
    },
  });

  useEffect(() => {
    if (!objectivesEditorLessonId) return;
    const options = (objectiveSourceData?.options || []).filter((opt) => opt.sourceType !== 'manual_topic');
    if (options.length === 0) {
      setObjectiveSourceSelection(null);
      return;
    }

    if (objectiveSourceSelection) {
      const exists = options.some(
        (opt) =>
          opt.sourceType === objectiveSourceSelection.sourceType &&
          opt.versionRef === objectiveSourceSelection.versionRef
      );
      if (exists) return;
    }

    const fallback = objectiveSourceData?.defaultSelection &&
      objectiveSourceData.defaultSelection.sourceType !== 'manual_topic'
      ? objectiveSourceData.defaultSelection
      : options[0];

    setObjectiveSourceSelection({
      sourceType: fallback.sourceType,
      versionRef: fallback.versionRef,
      languageCode: fallback.languageCode,
    });
  }, [objectivesEditorLessonId, objectiveSourceData, objectiveSourceSelection]);

  useEffect(() => {
    if (!objectiveSourceSelection || !objectiveLastGeneratedSourceContract) return;
    const isSameSelection =
      objectiveSourceSelection.sourceType === objectiveLastGeneratedSourceContract.sourceType &&
      objectiveSourceSelection.versionRef === objectiveLastGeneratedSourceContract.versionRef;
    if (!isSameSelection) {
      setObjectiveLastGeneratedSourceContract(null);
    }
  }, [objectiveSourceSelection, objectiveLastGeneratedSourceContract]);
  
  const { data: lessonsData, isLoading: lessonsLoading } = useQuery<Record<string, LessonData>>({
    queryKey: ['/api/courses', courseId, 'lesson-details'],
    queryFn: async () => {
      const topics = framework?.topics || [];
      const lessonIds = topics.filter(t => t.lessonId).map(t => t.lessonId as string);
      const orgId = courseOrgId || (user as any)?.organizationId;
      
      if (lessonIds.length === 0 || !orgId) return {};
      
      const lessonPromises = lessonIds.map(async (id) => {
        try {
          const courseQuery = courseId ? `&courseId=${encodeURIComponent(courseId)}` : '';
          const response = await fetch(`/api/lessons/${id}?organizationId=${orgId}${courseQuery}`, {
            credentials: 'include',
          });
          if (!response.ok) return null;
          const lesson = await response.json();
          return [id, lesson] as [string, LessonData];
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(lessonPromises);
      return Object.fromEntries(results.filter((r): r is [string, LessonData] => r !== null));
    },
    enabled: !!courseId && !!framework?.topics?.some(t => t.lessonId) && !!(courseOrgId || (user as any)?.organizationId),
    placeholderData: (previousData: Record<string, LessonData> | undefined) => previousData,
    // No staleTime - always refetch on mount/navigation to catch fresh generation status
    staleTime: 0,
    // Refetch on window focus to catch status changes from other tabs/wizard navigation
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const lessons = Object.values(query.state.data || {});
      const hasActiveLessons = lessons.some(
        (lesson: LessonData) => lesson.generationStatus === 'pending' || lesson.generationStatus === 'processing' || lesson.generationStatus === 'polling'
      );
      const hasFeedbackProcessing = lessons.some(
        (lesson: LessonData) => lesson.feedbackStatus === 'processing'
      );
      // Fast 5s polling while actively generating
      if (hasActiveLessons) return 5000;
      // 3s polling while feedback is being generated
      if (hasFeedbackProcessing) return 3000;
      // Slow 30s polling for any linked lessons (to catch background status changes)
      if (lessons.length > 0) return 30000;
      return false;
    },
  });

  const { data: platformPricing } = useQuery<{ platformPricing: { creditsPerLessonGeneration?: number; creditsPerAiFix?: number; creditsPerQuizGeneration?: number; creditsPerCourseTranslation?: number; creditsPerOverviewGeneration?: number; creditsPerKeyTakeawaysGeneration?: number } }>({
    queryKey: ['/api/admin/platform-pricing'],
    staleTime: 60000,
  });

  const lessonGenerationCost = platformPricing?.platformPricing?.creditsPerLessonGeneration ?? 50;
  const courseTranslationCost = platformPricing?.platformPricing?.creditsPerCourseTranslation ?? 100;
  const aiFixCost = platformPricing?.platformPricing?.creditsPerAiFix ?? 10;

  const { data: generationReadiness } = useQuery<{
    takeaways?: {
      ready?: boolean;
      lessonId?: string | null;
      totalContent?: number;
      readyCount?: number;
      sourceGenerated?: boolean;
      keyTakeawaysComplete?: boolean;
      lessons?: Array<{
        lessonId: string;
        title: string;
        hasLessonContent: boolean;
        hasObjectives: boolean;
        hasDigest: boolean;
        hasPptx: boolean;
        hasVideo: boolean;
        hasPresentationAsset: boolean;
        hasQuiz: boolean;
        requiresQuiz: boolean;
        sourceGenerated: boolean;
        isRequiredWorkflowComplete: boolean;
        lessonType: string;
      }>;
    };
    overview?: {
      ready?: boolean;
      lessonId?: string | null;
      totalRequired?: number;
      readyCount?: number;
      keyTakeawaysComplete?: boolean;
      lessons?: Array<{
        lessonId: string;
        title: string;
        hasLessonContent: boolean;
        hasObjectives: boolean;
        hasDigest: boolean;
        hasPptx: boolean;
        hasVideo: boolean;
        hasPresentationAsset: boolean;
        hasQuiz: boolean;
        requiresQuiz: boolean;
        sourceGenerated: boolean;
        isRequiredWorkflowComplete: boolean;
        lessonType: string;
      }>;
    };
  }>({
    queryKey: ['/api/courses', courseId, 'generation-readiness'],
    enabled: !!courseId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const generateOverviewMutation = useMutation({
    mutationFn: async () => {
      const orgId = courseOrgId || (user as any)?.organizationId;
      return await apiRequest(`/api/courses/${courseId}/generate-overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Overview Generated',
        description: `Overview content generated with ${data.generatedWordCount} words.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      if (data.lessonId) {
        queryClient.invalidateQueries({ queryKey: ['/api/lessons', data.lessonId] });
        queryClient.invalidateQueries({ queryKey: ['/api/lessons', data.lessonId, 'source-document'] });
        queryClient.invalidateQueries({ queryKey: ['/api/lessons', data.lessonId, 'content-versions'] });
      }
      invalidateWalletCaches();
    },
    onError: (error: any) => {
      if (error.status === 402) {
        toast({
          title: 'Insufficient Credits',
          description: error.message || 'Not enough credits to generate overview.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Generation Failed',
          description: error.message || 'Failed to generate overview content.',
          variant: 'destructive',
        });
      }
    },
  });

  const generateTakeawaysMutation = useMutation({
    mutationFn: async () => {
      const orgId = courseOrgId || (user as any)?.organizationId;
      return await apiRequest(`/api/courses/${courseId}/generate-takeaways`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Key Takeaways Generated',
        description: `Key takeaways content generated with ${data.generatedWordCount} words.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      if (data.lessonId) {
        queryClient.invalidateQueries({ queryKey: ['/api/lessons', data.lessonId] });
        queryClient.invalidateQueries({ queryKey: ['/api/lessons', data.lessonId, 'source-document'] });
        queryClient.invalidateQueries({ queryKey: ['/api/lessons', data.lessonId, 'content-versions'] });
      }
      invalidateWalletCaches();
    },
    onError: (error: any) => {
      if (error.status === 402) {
        toast({
          title: 'Insufficient Credits',
          description: error.message || 'Not enough credits to generate key takeaways.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Generation Failed',
          description: error.message || 'Failed to generate key takeaways.',
          variant: 'destructive',
        });
      }
    },
  });

  const prevLessonDataRef = useRef<Record<string, LessonData>>({});
  useEffect(() => {
    if (!lessonsData) return;
    const prev = prevLessonDataRef.current;
    Object.entries(lessonsData).forEach(([id, lesson]) => {
      if (prev[id]?.feedbackStatus === 'processing' && lesson.feedbackStatus === 'completed') {
        toast({
          title: 'Feedback Ready',
          description: `Expert feedback for "${lesson.title}" is ready! Score: ${lesson.contentScore10}/10`,
        });
      }
    });
    prevLessonDataRef.current = lessonsData;
  }, [lessonsData]);

  const { data: relinkableLessons } = useQuery<{ lessons: RelinkableLesson[] }>({
    queryKey: ['/api/courses', courseId, 'relinkable-lessons'],
    enabled: !!courseId,
  });

  const { data: feedbackPricingData } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/public/lesson-feedback-pricing'],
  });

  const lessonIdsForLanguages = Object.values(lessonsData || {}).map(l => l.id).filter(Boolean);

  const { data: lessonLanguages } = useQuery<Record<string, { 
    languages: Array<{
      lessonId?: string;
      code: string;
      status: string;
      isStale?: boolean;
      hasPptx?: boolean;
      hasVideo?: boolean;
      hasQuiz?: boolean;
      hasWordDoc?: boolean;
      hasContent?: boolean;
      hasObjectives?: boolean;
      quizIds?: string[];
      hasPodcast?: boolean;
      hasPodcastScript?: boolean;
      activePodcastVersionId?: string | null;
      hasDigest?: boolean;
      hasStepGuide?: boolean;
      activeStepGuideVersionId?: string | null;
      generationStatus?: string | null;
      feedbackStatus?: string | null;
    }>;
    defaultLanguage?: {
      lessonId?: string;
      code: string;
      hasPptx: boolean;
      hasVideo: boolean;
      hasQuiz: boolean;
      hasWordDoc: boolean;
      hasContent?: boolean;
      hasObjectives?: boolean;
      quizIds?: string[];
      hasPodcast?: boolean;
      hasPodcastScript?: boolean;
      activePodcastVersionId?: string | null;
      hasDigest?: boolean;
      hasStepGuide?: boolean;
      activeStepGuideVersionId?: string | null;
    };
  }>>({
    queryKey: ['/api/lessons/batch-languages', lessonIdsForLanguages.join(',')],
    queryFn: async () => {
      if (lessonIdsForLanguages.length === 0) return {};
      const response = await fetch('/api/lessons/batch-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lessonIds: lessonIdsForLanguages }),
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: lessonIdsForLanguages.length > 0,
    staleTime: 30000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasActiveGeneration = Object.values(data).some(
        (d) => d.languages?.some(l => l.generationStatus === 'processing' || l.generationStatus === 'polling' || l.feedbackStatus === 'processing')
      );
      if (hasActiveGeneration) return 5000;
      return false;
    },
  });

  const courseLangCoverage = useMemo(() => {
    if (!lessonLanguages || !lessonsData) return [];
    
    const lessonsArray = Object.values(lessonsData);
    if (lessonsArray.length === 0) return [];
    
    const totalLessons = lessonsArray.length;
    const langCountMap = new Map<string, { count: number; staleCount: number }>();
    
    for (const lesson of lessonsArray) {
      const langs = lessonLanguages[lesson.id]?.languages || [];
      for (const lang of langs) {
        const existing = langCountMap.get(lang.code) || { count: 0, staleCount: 0 };
        existing.count++;
        if (lang.isStale) existing.staleCount++;
        langCountMap.set(lang.code, existing);
      }
    }
    
    return Array.from(langCountMap.entries())
      .map(([code, data]) => ({ code, count: data.count, total: totalLessons, staleCount: data.staleCount }))
      .sort((a, b) => b.count - a.count);
  }, [lessonLanguages, lessonsData]);

  const sourceCourseLanguageCode = String(course?.languageCode || 'en').trim().toLowerCase() || 'en';
  const readinessLanguageOptions = useMemo(() => {
    const codes = new Set<string>();
    codes.add(sourceCourseLanguageCode);
    for (const entry of courseLangCoverage) {
      const code = String(entry.code || '').trim().toLowerCase();
      if (code) codes.add(code);
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b));
  }, [courseLangCoverage, sourceCourseLanguageCode]);

  useEffect(() => {
    if (readinessLanguageOptions.length === 0) {
      if (selectedReadinessLanguage) setSelectedReadinessLanguage('');
      return;
    }
    const current = String(selectedReadinessLanguage || '').trim().toLowerCase();
    if (current && readinessLanguageOptions.includes(current)) return;
    setSelectedReadinessLanguage(
      readinessLanguageOptions.includes(sourceCourseLanguageCode)
        ? sourceCourseLanguageCode
        : readinessLanguageOptions[0]
    );
  }, [readinessLanguageOptions, selectedReadinessLanguage, sourceCourseLanguageCode]);

  const { data: translationStatuses } = useQuery<Record<string, Array<{ status: string; currentStep: string; targetLanguageCode: string }>>>({
    queryKey: ['/api/courses', courseId, 'translation-statuses'],
    queryFn: async () => {
      const orgId = courseOrgId || (user as any)?.organizationId;
      if (!orgId) return {};
      const topics = framework?.topics || [];
      const lessonIds = topics.filter(t => t.lessonId).map(t => t.lessonId as string);
      if (lessonIds.length === 0) return {};
      
      const statusPromises = lessonIds.map(async (id) => {
        try {
          const response = await fetch(`/api/lessons/${id}/translation-wizard-state?organizationId=${orgId}`, {
            credentials: 'include',
          });
          if (!response.ok) return null;
          const data = await response.json();
          if (data.jobs && data.jobs.length > 0) {
            const jobsByLang = new Map<string, any>();
            for (const job of data.jobs) {
              const lang = job.targetLanguageCode;
              if (!lang) continue;
              if (!jobsByLang.has(lang)) {
                jobsByLang.set(lang, { status: job.status, currentStep: job.currentStep, targetLanguageCode: lang });
              }
            }
            if (jobsByLang.size === 0) return null;
            return [id, Array.from(jobsByLang.values())] as [string, any];
          }
          return null;
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(statusPromises);
      return Object.fromEntries(results.filter((r): r is [string, any] => r !== null));
    },
    enabled: !!courseId && !!framework?.topics?.some(t => t.lessonId) && !!(courseOrgId || (user as any)?.organizationId),
    staleTime: 10000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const allJobs = Object.values(query.state.data || {});
      return allJobs.some((jobs: any) => Array.isArray(jobs) && jobs.some((j: any) => j.status === 'translating')) ? 10000 : 60000;
    },
  });

  const { data: existingCourseTranslations } = useQuery<Array<{ code: string; name: string; nativeName: string; courseId: string }>>({
    queryKey: ['/api/courses', courseId, 'languages'],
    enabled: !!courseId,
    staleTime: 30000,
  });

  const existingCourseTranslationCodes = useMemo(() => {
    if (!existingCourseTranslations) return new Set<string>();
    // Filter out the course's source language code
    const sourceLanguageCode = course?.languageCode || 'en';
    return new Set(
      existingCourseTranslations
        .filter(t => t.code !== sourceLanguageCode)
        .map(t => t.code)
    );
  }, [existingCourseTranslations, course?.languageCode]);

  const translateCourseMutation = useMutation({
    mutationFn: async (targetLanguageCode: string) => {
      return await apiRequest(`/api/courses/${courseId}/translate-metadata`, {
        method: 'POST',
        body: JSON.stringify({ targetLanguageCode }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Course Translated',
        description: 'Course title and description have been translated successfully. The translated course is saved as a draft.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'translation-status'] });
      setFrameworkTranslationLang(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Translation Failed',
        description: error.message || 'Failed to translate course metadata.',
        variant: 'destructive',
      });
      setFrameworkTranslationLang(null);
    },
  });

  // GAP 6 FIX: Content health indicator - check if lessons have sufficient source content
  interface LessonHealthStatus {
    lessonId: string;
    title: string;
    status: 'ready' | 'warning' | 'error';
    message: string;
    wordCount: number;
    hasBloomObjectives: boolean;
    hasKeyTerms: boolean;
  }
  interface ContentHealth {
    courseId: string;
    lessonsTotal: number;
    lessonsReady: number;
    lessonsWithIssues: number;
    overallHealth: 'healthy' | 'warning' | 'critical' | 'empty';
    lessons: LessonHealthStatus[];
  }
  
  const { data: contentHealth } = useQuery<ContentHealth>({
    queryKey: ['/api/courses', courseId, 'health'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/health`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!courseId,
    staleTime: 30000, // Cache for 30 seconds
  });
  
  // Helper to check if a lesson has sufficient content for generation
  const getLessonHealth = (lessonId: string | null): LessonHealthStatus | null => {
    if (!lessonId || !contentHealth?.lessons) return null;
    return contentHealth.lessons.find(l => l.lessonId === lessonId) || null;
  };

  // Helper to determine content source
  const getContentSource = (lesson: LessonData | undefined | null): { type: 'ai' | 'uploaded' | 'source_uploaded' | 'none'; icon: React.ReactNode; label: string; variant: 'success' | 'outline' | 'warning' | 'destructive' } | null => {
    if (!lesson) return null;
    
    if (lesson.gammaCardId && lesson.storageKey) {
      return {
        type: 'ai',
        icon: <Sparkles className="h-3 w-3 mr-1" />,
        label: 'Gen PPTX',
        variant: 'success'
      };
    }
    
    if (lesson.storageKey || lesson.gammaCardId) {
      return {
        type: 'uploaded',
        icon: <Upload className="h-3 w-3 mr-1" />,
        label: 'Uploaded PPTX',
        variant: 'outline'
      };
    }
    
    // Source document uploaded but no presentation yet
    // Only show if lesson has its OWN sourceDocumentPath (not inherited inputText from course)
    if (lesson.sourceDocumentPath) {
      return {
        type: 'source_uploaded',
        icon: <FileText className="h-3 w-3 mr-1" />,
        label: 'Source Uploaded',
        variant: 'warning'
      };
    }
    
    return {
      type: 'none',
      icon: <AlertTriangle className="h-3 w-3 mr-1" />,
      label: 'No Content',
      variant: 'destructive'
    };
  };

  const getPodcastLanguageInfo = (lesson: LessonData | undefined | null): { activeLang: string; allLangs: string[] } | null => {
    if (!lesson?.metadata || typeof lesson.metadata !== 'object') return null;
    const podcastMeta = (lesson.metadata as any)?.podcast;
    if (!podcastMeta || typeof podcastMeta !== 'object') return null;
    const versions = Array.isArray(podcastMeta.versions) ? podcastMeta.versions : [];
    const completed = versions.filter((v: any) => v?.status === 'completed');
    if (!completed.length) return null;
    const activeVersionId = String(podcastMeta.activeVersionId || '').trim();
    const active = completed.find((v: any) => String(v?.id || '') === activeVersionId) || completed[0];
    const activeLang = String(active?.languageCode || lesson.languageCode || 'en').toUpperCase();
    const allLangs = Array.from(
      new Set(
        completed
          .map((v: any) => String(v?.languageCode || '').trim().toUpperCase())
          .filter(Boolean)
      )
    ) as string[];
    return { activeLang, allLangs };
  };

  const hasLessonSourceContent = (lesson: LessonData | undefined | null): boolean => {
    if (!lesson) return false;
    return !!String(lesson.inputText || '').trim() || !!lesson.sourceDocumentPath;
  };

  const isTranslationReadyForLesson = (
    lesson: LessonData | undefined | null,
    lessonType: 'overview' | 'content' | 'key_takeaways'
  ): boolean => {
    if (!lesson) return false;
    const lessonLangs = lessonLanguages?.[lesson.id]?.languages || [];
    const sourceLang = String(lesson.languageCode || 'en').toLowerCase();
    const translated = lessonLangs.filter((lang) => String(lang.code || '').toLowerCase() !== sourceLang);
    if (translated.length === 0) return false;
    return translated.some((lang) => {
      const hasPresentation = !!lang.hasPptx || !!lang.hasVideo;
      const hasRequiredArtifacts = hasPresentation && (lessonType !== 'content' || !!lang.hasQuiz);
      return hasRequiredArtifacts && !lang.isStale;
    });
  };

  const isLessonMinimumReady = (
    lesson: LessonData | undefined | null,
    lessonType: 'overview' | 'content' | 'key_takeaways'
  ): boolean => {
    if (!lesson) return false;
    const hasContent = hasLessonSourceContent(lesson);
    const hasPresentation = !!lesson.storageKey || !!lesson.gammaCardId || !!lesson.videoStorageKey;
    const hasQuiz = !!lesson.linkedQuizId || (lesson.linkedQuizCount !== undefined && lesson.linkedQuizCount > 0);
    return hasContent && hasPresentation && (lessonType !== 'content' || hasQuiz);
  };

  const getMissingArtifactsForLanguage = (
    lesson: LessonData | undefined | null,
    lessonType: 'overview' | 'content' | 'key_takeaways',
    languageCode: string
  ): string[] => {
    if (!lesson) return ['Lesson data unavailable'];
    const targetCode = String(languageCode || '').trim().toLowerCase();
    if (!targetCode) return ['Language not selected'];

    const languageStates = getLanguageArtifactStates(lesson);
    const target = languageStates.find((lang) => String(lang.code || '').toLowerCase() === targetCode);
    if (!target) return ['Language variant not created'];

    const missing: string[] = [];
    if (!target.hasPptx && !target.hasVideo) missing.push('PPTX or Video');
    if (lessonType === 'content' && !target.hasQuiz) missing.push('Quiz');
    if (!target.hasDigest) missing.push('Lesson digest');
    if (!target.hasObjectives) missing.push('Learning objectives');
    if (target.isStale) missing.push('Refresh stale translation');
    return missing;
  };

  // Helper to determine content readiness status
  const getContentStatus = (lesson: LessonData | undefined | null, topicOrder: number): { type: 'complete' | 'needs_quiz' | 'needs_presentation' | 'no_content'; label: string; variant: 'success' | 'warning' | 'destructive'; icon: React.ReactNode } | null => {
    if (!lesson) return null;
    
    const hasPPTX = !!lesson.storageKey || !!lesson.gammaCardId;
    const hasVideo = !!lesson.videoStorageKey;
    const hasPresentation = hasPPTX || hasVideo;
    const hasInputText = !!String(lesson.inputText || '').trim();
    const hasSourceDocument = !!lesson.sourceDocumentPath;
    const topic = framework?.topics?.find(t => t.order === topicOrder);
    const lessonType = topic ? getLessonType(topic) : (topicOrder === 0 ? 'overview' : 'content');
    const hasLessonContent = hasSourceDocument || hasInputText;
    const hasQuiz = !!lesson.linkedQuizId || (lesson.linkedQuizCount !== undefined && lesson.linkedQuizCount > 0);
    
    if (!hasPresentation) {
      if (hasLessonContent) {
        return {
          type: 'needs_presentation',
          icon: <FileText className="h-3 w-3 mr-1" />,
          label: 'Needs Presentation',
          variant: 'warning'
        };
      }
      return {
        type: 'no_content',
        icon: <AlertTriangle className="h-3 w-3 mr-1" />,
        label: 'Needs Content',
        variant: 'destructive'
      };
    }
    
    if (lessonType !== 'content') {
      return {
        type: 'complete',
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
        label: 'Content Exists',
        variant: 'success'
      };
    }
    
    if (hasQuiz) {
      return {
        type: 'complete',
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
        label: 'Content Exists',
        variant: 'success'
      };
    }
    
    return {
      type: 'needs_quiz',
      icon: <FileQuestion className="h-3 w-3 mr-1" />,
      label: 'Needs Quiz',
      variant: 'warning'
    };
  };

  const getReadinessStatus = (lesson: LessonData | undefined | null, topicOrder: number): { 
    color: 'green' | 'yellow' | 'red'; 
    requiredMissing: string[];
    optionalMissing: string[];
  } | null => {
    if (!lesson) return null;
    
    const hasPPTX = !!lesson.storageKey || !!lesson.gammaCardId;
    const hasLessonContent = hasLessonSourceContent(lesson);
    const hasQuiz = !!lesson.linkedQuizId || (lesson.linkedQuizCount !== undefined && lesson.linkedQuizCount > 0);
    const hasVideo = !!lesson.videoStorageKey;
    const podcastVersions = Array.isArray((lesson.metadata as any)?.podcast?.versions)
      ? ((lesson.metadata as any).podcast.versions as any[])
      : [];
    const hasPodcast = podcastVersions.some((v: any) => v?.status === 'completed');
    const topic = framework?.topics?.find(t => t.order === topicOrder);
    const lessonType = topic ? getLessonType(topic) : (topicOrder === 0 ? 'overview' : 'content');
    
    const requiredMissing: string[] = [];
    const optionalMissing: string[] = [];
    
    if (!hasPPTX) requiredMissing.push('PPTX presentation');
    if (!hasLessonContent) requiredMissing.push('Lesson content');
    if (lessonType === 'content' && !hasQuiz) requiredMissing.push('Quiz');
    
    if (!hasVideo) optionalMissing.push('Video');
    if (!hasPodcast) optionalMissing.push('Podcast');
    
    if (lessonLanguages) {
      const langData = lessonLanguages[lesson.id];
      const langs = langData?.languages || [];
      const sourceLang = String(lesson.languageCode || 'en').toLowerCase();
      const translatedLangs = langs.filter((l) => String(l.code || '').toLowerCase() !== sourceLang);
      if (translatedLangs.length === 0) {
        optionalMissing.push('Additional language');
      } else {
        const incompleteLangs = translatedLangs.filter(l => {
          if (!l.hasPptx) return true;
          if (lessonType === 'content' && !l.hasQuiz) return true;
          return false;
        });
        if (incompleteLangs.length > 0) {
          optionalMissing.push(`${incompleteLangs.length} incomplete translation(s)`);
        }
        const staleLangs = translatedLangs.filter(l => l.isStale);
        if (staleLangs.length > 0) {
          optionalMissing.push(`${staleLangs.length} stale translation(s)`);
        }
      }
    }
    
    if (requiredMissing.length > 0) return { color: 'red', requiredMissing, optionalMissing };
    if (optionalMissing.length > 0) return { color: 'yellow', requiredMissing, optionalMissing };
    return { color: 'green', requiredMissing, optionalMissing };
  };

  const getLessonType = (topic: Topic): 'overview' | 'content' | 'key_takeaways' => {
    if (topic.lessonType === 'overview' || topic.isOverview) return 'overview';
    if (topic.lessonType === 'key_takeaways') return 'key_takeaways';
    if (topic.lessonType === 'content') return 'content';
    return 'content';
  };

  const getLessonTypeLabel = (lessonType: 'overview' | 'content' | 'key_takeaways'): string => {
    if (lessonType === 'overview') return 'Overview';
    if (lessonType === 'key_takeaways') return 'Key Takeaways';
    return 'Content';
  };

  const getCombinedCourseObjectivesForOverview = (): LessonObjectiveDraft[] => {
    const allowedLevels: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    const topics = [...(framework?.topics || [])].sort((a, b) => a.order - b.order);
    const rows: LessonObjectiveDraft[] = [];
    const seen = new Set<string>();

    for (const t of topics) {
      if (getLessonType(t) === 'overview') continue;
      const lesson = t.lessonId ? lessonsData?.[t.lessonId] : undefined;
      const structured = Array.isArray(t.learningObjectives)
        ? t.learningObjectives
        : Array.isArray(lesson?.learningObjectives)
        ? lesson.learningObjectives
        : [];

      const structuredRows = structured
        .map((item, index) => {
          const objective = String(item?.objective || '').trim();
          if (!objective) return null;
          const normalizedLevel = String(item?.bloomLevel || 'understand').toLowerCase();
          const bloomLevel = allowedLevels.includes(normalizedLevel as BloomLevel)
            ? (normalizedLevel as BloomLevel)
            : 'understand';
          return {
            id: String(item?.id || `obj-${t.order}-${index + 1}`),
            objective,
            bloomLevel,
          } as LessonObjectiveDraft;
        })
        .filter((item): item is LessonObjectiveDraft => !!item);

      const fallbackRows = (Array.isArray(t.objectives) ? t.objectives : [])
        .map((objective, index) => String(objective || '').trim())
        .filter(Boolean)
        .map((objective, index) => ({
          id: `obj-${t.order}-fallback-${index + 1}`,
          objective,
          bloomLevel: 'understand' as BloomLevel,
        }));

      for (const row of [...structuredRows, ...fallbackRows]) {
        const key = row.objective.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    }

    return rows;
  };

  const areObjectiveSetsEquivalent = (
    left: LessonObjectiveDraft[],
    right: LessonObjectiveDraft[]
  ): boolean => {
    const normalize = (rows: LessonObjectiveDraft[]) =>
      rows
        .map((row) => ({
          objective: String(row.objective || '').trim().toLowerCase(),
          bloomLevel: String(row.bloomLevel || 'understand').toLowerCase(),
        }))
        .filter((row) => row.objective.length > 0)
        .sort((a, b) => {
          const objectiveCompare = a.objective.localeCompare(b.objective);
          if (objectiveCompare !== 0) return objectiveCompare;
          return a.bloomLevel.localeCompare(b.bloomLevel);
        });

    const a = normalize(left);
    const b = normalize(right);
    if (a.length !== b.length) return false;
    return a.every((item, index) => item.objective === b[index].objective && item.bloomLevel === b[index].bloomLevel);
  };

  const normalizeLessonObjectives = (topic: Topic, lessonData?: LessonData | null): LessonObjectiveDraft[] => {
    const allowedLevels: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    const lessonType = getLessonType(topic);
    const structured = Array.isArray(topic.learningObjectives)
      ? topic.learningObjectives
      : Array.isArray(lessonData?.learningObjectives)
      ? lessonData.learningObjectives
      : [];
    if (structured.length > 0) {
      return structured
        .map((item, index) => {
          const objective = String(item?.objective || '').trim();
          if (!objective) return null;
          const normalizedLevel = String(item?.bloomLevel || 'understand').toLowerCase();
          const bloomLevel = allowedLevels.includes(normalizedLevel as BloomLevel)
            ? (normalizedLevel as BloomLevel)
            : 'understand';
          return {
            id: String(item?.id || `obj-${index + 1}`),
            objective,
            bloomLevel,
          };
        })
        .filter((item): item is LessonObjectiveDraft => !!item);
    }

    if (lessonType === 'overview') {
      const combined = getCombinedCourseObjectivesForOverview();
      if (combined.length > 0) return combined;
    }

    const fallback = Array.isArray(topic.objectives) ? topic.objectives : [];
    return fallback
      .map((objective, index) => String(objective || '').trim())
      .filter(Boolean)
      .map((objective, index) => ({
        id: `obj-${index + 1}`,
        objective,
        bloomLevel: 'understand' as BloomLevel,
      }));
  };

  const openObjectivesEditor = (topic: Topic, lessonId: string, lessonData?: LessonData | null) => {
    const initialRows = normalizeLessonObjectives(topic, lessonData);
    setObjectivesEditorLessonId(lessonId);
    setObjectivesEditorTopicId(topic.id);
    setObjectiveGenerationLevel(initialRows[0]?.bloomLevel || 'apply');
    setObjectiveDraftRows(
      initialRows.length > 0
        ? initialRows
        : [{ id: `obj-${Date.now()}`, objective: '', bloomLevel: 'understand' }]
    );
    setObjectiveDraftError(null);
    setObjectiveLastGeneratedSourceContract(
      lessonData?.metadata?.learningObjectivesLastGeneratedSource || null
    );
  };

  const closeObjectivesEditor = () => {
    setObjectivesEditorLessonId(null);
    setObjectivesEditorTopicId(undefined);
    setObjectiveDraftRows([]);
    setObjectiveDraftError(null);
    setObjectiveSourceSelection(null);
    setObjectiveLastGeneratedSourceContract(null);
  };

  const isCanonicalStructuralTopic = (topic: Topic): boolean => {
    const lessonType = getLessonType(topic);
    if (lessonType !== 'overview' && lessonType !== 'key_takeaways') return false;
    const visibleCourseTopics = (framework?.topics || []).filter((entry: Topic) => !isTopicHidden(entry));
    if (visibleCourseTopics.length === 0) return false;
    const orders = visibleCourseTopics.map((entry: Topic) => Number(entry.order)).filter(Number.isFinite);
    const minOrder = Math.min(...orders);
    const maxOrder = Math.max(...orders);
    return (lessonType === 'overview' && topic.order === minOrder)
      || (lessonType === 'key_takeaways' && topic.order === maxOrder);
  };

  const getProgressiveMenuProps = (lessonData: LessonData | undefined, topic: Topic) => {
    const lessonType = getLessonType(topic);
    const hasInputText = !!lessonData?.inputText;
    const hasSourceDoc = !!lessonData?.sourceDocumentPath;
    const hasLessonContent = hasInputText || hasSourceDoc;
    const hasFeedback = !!lessonData?.lastFeedbackAt;
    const hasPPTX = !!lessonData?.storageKey || !!lessonData?.gammaCardId;
    const hasContentVersions = !!lessonData?.hasContentVersions;

    return {
      hideMenu: false,
      showView: hasPPTX,
      showEdit: true,
      showUploadPPTX: true,
      showUploadVideo: true,
      showUploadContent: true,
      showViewContent: true,
      showGetFeedback: true,
      showViewLastReport: true,
      showViewChanges: true,
      showGenerateQuiz: lessonType === 'content' || lessonType === 'key_takeaways',
      showEditQuiz: lessonType === 'content' || lessonType === 'key_takeaways',
      showDownloadPPTX: true,
      showReplacePPTX: true,
      showRegenerate: true,
      showGenerate: !hasPPTX,
      showDelete: !hasPPTX && !!lessonData?.id,
      showArchive: false,
      showRemoveFromCourse: !!lessonData?.id,
    };
  };

interface NextStepInfo {
    stepNumber: number;
    totalSteps: number;
    label: string;
    description: string;
    type: 'action' | 'blocked' | 'complete' | 'optional';
    category: 'required' | 'recommended' | 'optional';
  }

  interface GenerationReadinessLesson {
    lessonId: string;
    title: string;
    hasLessonContent: boolean;
    hasObjectives: boolean;
    hasDigest: boolean;
    hasPptx: boolean;
    hasVideo: boolean;
    hasPresentationAsset: boolean;
    hasQuiz: boolean;
    requiresQuiz: boolean;
    sourceGenerated: boolean;
    isRequiredWorkflowComplete: boolean;
    lessonType: string;
  }

  interface GenerationReadinessData {
    takeaways?: {
      ready?: boolean;
      lessonId?: string | null;
      totalContent?: number;
      readyCount?: number;
      sourceGenerated?: boolean;
      keyTakeawaysComplete?: boolean;
      lessons?: GenerationReadinessLesson[];
    };
    overview?: {
      ready?: boolean;
      lessonId?: string | null;
      totalRequired?: number;
      readyCount?: number;
      keyTakeawaysComplete?: boolean;
      lessons?: GenerationReadinessLesson[];
    };
  }

  const buildLessonDependencyGap = (lesson: GenerationReadinessLesson): string => {
    const missing: string[] = [];
    if (!lesson.hasLessonContent) missing.push('source content');
    if (!lesson.hasObjectives) missing.push('objectives');
    if (!lesson.hasDigest) missing.push('digest');
    if (!lesson.hasPresentationAsset) missing.push('PPTX/video');
    if (lesson.requiresQuiz && !lesson.hasQuiz) missing.push('quiz');
    if (lesson.lessonType === 'key_takeaways' && !lesson.sourceGenerated) missing.push('generated takeaways source');
    return missing.length > 0 ? `${lesson.title}: missing ${missing.join(' + ')}` : `${lesson.title}: complete`;
  };

  const getBlockedDependencySummary = (
    readiness: GenerationReadinessData | undefined,
    scope: 'takeaways' | 'overview'
  ) => {
    if (!readiness) {
      return {
        remainingCount: 0,
        totalCount: 0,
        missingLessons: [] as string[],
        keyTakeawaysMissing: false,
      };
    }

    if (scope === 'takeaways') {
      const lessons = Array.isArray(readiness.takeaways?.lessons) ? readiness.takeaways!.lessons! : [];
      const missingLessons = lessons
        .filter((lesson) => !lesson.isRequiredWorkflowComplete)
        .map(buildLessonDependencyGap);
      const totalCount = Number(readiness.takeaways?.totalContent || lessons.length || 0);
      const readyCount = Number(readiness.takeaways?.readyCount || totalCount - missingLessons.length || 0);
      const remainingCount = Math.max(0, totalCount - readyCount);
      return { remainingCount, totalCount, missingLessons, keyTakeawaysMissing: false };
    }

    const lessons = Array.isArray(readiness.overview?.lessons) ? readiness.overview!.lessons! : [];
    const contentLessons = lessons.filter((lesson) => lesson.lessonType === 'content');
    const missingLessons = contentLessons
      .filter((lesson) => !lesson.isRequiredWorkflowComplete)
      .map(buildLessonDependencyGap);
    const keyTakeawaysLesson = lessons.find((lesson) => lesson.lessonType === 'key_takeaways');
    const keyTakeawaysMissing = !!keyTakeawaysLesson && !keyTakeawaysLesson.isRequiredWorkflowComplete;
    const totalCount = Number(readiness.overview?.totalRequired || lessons.length || 0);
    const readyCount = Number(readiness.overview?.readyCount || totalCount - missingLessons.length - (keyTakeawaysMissing ? 1 : 0) || 0);
    const remainingCount = Math.max(0, totalCount - readyCount);
    return { remainingCount, totalCount, missingLessons, keyTakeawaysMissing };
  };

  const hasCompletedPodcast = (lessonData: LessonData | null | undefined): boolean => {
    const versions = Array.isArray((lessonData?.metadata as any)?.podcast?.versions)
      ? (((lessonData?.metadata as any)?.podcast?.versions) as any[])
      : [];
    return versions.some((version) => version?.status === 'completed');
  };

  const hasCompletedPodcastScript = (lessonData: LessonData | null | undefined): boolean => {
    const podcast = (lessonData?.metadata as any)?.podcast;
    const versions = Array.isArray(podcast?.versions) ? podcast.versions : [];
    const scripts = Array.isArray(podcast?.scripts) ? podcast.scripts : [];
    if (!versions.length) return false;

    const scriptTextById = new Map(
      scripts
        .map((script: any) => [String(script?.id || '').trim(), String(script?.text || '').trim()] as const)
        .filter((entry: readonly [string, string]) => !!entry[0] && !!entry[1])
    );

    return versions.some((version: any) => {
      if (version?.status !== 'completed') return false;
      const directText = String(version?.text || version?.scriptText || '').trim();
      if (directText) return true;
      const scriptId = String(version?.scriptId || '').trim();
      return !!scriptId && !!scriptTextById.get(scriptId);
    });
  };

  const hasDigestSectionsForLanguage = (lessonData: LessonData, languageCode?: string | null): boolean => {
    const byKey = (lessonData?.metadata as any)?.lessonDigestV1?.byKey;
    if (!byKey || typeof byKey !== 'object') return false;
    const entries = Object.values(byKey) as any[];
    const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();
    if (!normalizedLanguageCode) {
      return entries.some((entry) => Array.isArray(entry?.sections) && entry.sections.length > 0);
    }
    return entries.some((entry) =>
      String(entry?.languageCode || '').trim().toLowerCase() === normalizedLanguageCode &&
      Array.isArray(entry?.sections) &&
      entry.sections.length > 0
    );
  };

  const hasLessonDigest = (lessonData: LessonData | null | undefined): boolean => {
    if (!lessonData) return false;
    return hasDigestSectionsForLanguage(lessonData);
  };

  const hasTakeawaysGenerationManifest = (lessonData: LessonData | null | undefined): boolean => {
    const manifest = (lessonData?.metadata as any)?.lastTakeawaysGenerationManifest;
    if (!manifest || typeof manifest !== 'object') return false;
    const mode = String((manifest as any)?.mode || '').trim().toLowerCase();
    return mode === 'takeaways' || mode.length === 0;
  };

  const hasStepGuideForLanguage = (lessonData: LessonData, languageCode?: string | null): boolean => {
    const byLanguage = (lessonData?.metadata as any)?.lessonStepGuideV1?.byLanguage;
    if (!byLanguage || typeof byLanguage !== 'object') return false;
    const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();
    if (!normalizedLanguageCode) {
      return Object.values(byLanguage).some((bucket: any) => Array.isArray(bucket?.versions) && bucket.versions.length > 0);
    }
    const bucket = (byLanguage as Record<string, any>)[normalizedLanguageCode];
    return Array.isArray(bucket?.versions) && bucket.versions.length > 0;
  };

  const getLearningObjectivesFreshness = (lessonData: LessonData | null | undefined) => {
    const metadata = (lessonData?.metadata && typeof lessonData.metadata === 'object') ? lessonData.metadata : {};
    const lastSavedAtRaw = String((metadata as any)?.learningObjectivesLastSavedAt || '').trim();
    const lastSavedAt = lastSavedAtRaw ? new Date(lastSavedAtRaw) : null;
    const lessonUpdatedAtRaw = String(lessonData?.updatedAt || '').trim();
    const lessonUpdatedAt = lessonUpdatedAtRaw ? new Date(lessonUpdatedAtRaw) : null;
    const source = (metadata as any)?.learningObjectivesLastSavedSource || null;
    const sourceLabel = source?.label ? String(source.label) : null;
    const isConfigured = !!lastSavedAt && !!source;
    const isStale =
      !!isConfigured &&
      !!lessonUpdatedAt &&
      lessonUpdatedAt.getTime() > (lastSavedAt?.getTime() || 0) + 60_000;
    return {
      isConfigured,
      isStale,
      sourceLabel,
      savedAt: lastSavedAt,
    };
  };

  const getLessonActionItems = (
    lessonData: LessonData | undefined | null,
    topic: Topic,
    readinessData: GenerationReadinessData | undefined
  ): LessonActionItem[] => {
    if (!lessonData) return [];

    const lessonType = getLessonType(topic);
    const contentReadiness = getContentLessonReadiness(lessonData);
    const hasSourceDb = contentReadiness.hasNativeMaterial;
    const hasWord = contentReadiness.hasWord;
    const hasLessonContent = contentReadiness.hasLessonContent;
    const hasQuiz = !!lessonData.linkedQuizId || (lessonData.linkedQuizCount !== undefined && lessonData.linkedQuizCount > 0);
    const hasVideo = !!lessonData.videoStorageKey;
    const hasPresentationAsset = contentReadiness.hasPresentationAsset;
    const hasFeedback = !!lessonData.lastFeedbackAt && lessonData.contentScore10 !== undefined && lessonData.contentScore10 !== null;
    const hasImprovements = lessonData.aiImproveStatus === 'completed' || (
      lessonData.previousScore10 !== undefined &&
      lessonData.previousScore10 !== null &&
      lessonData.contentScore10 !== undefined &&
      lessonData.contentScore10 !== null &&
      Number(lessonData.contentScore10) > Number(lessonData.previousScore10)
    );
    const hasPodcast = hasCompletedPodcast(lessonData);
    const hasDigest = hasLessonDigest(lessonData);
    const hasTranslation = isTranslationReadyForLesson(lessonData, lessonType);
    const objectives = Array.isArray(lessonData.learningObjectives) ? lessonData.learningObjectives : [];
    const objectivesFreshness = getLearningObjectivesFreshness(lessonData);
    const hasObjectives = objectives.length > 0;
    const overviewCombinedObjectives = lessonType === 'overview' ? getCombinedCourseObjectivesForOverview() : [];
    const hasOverviewCombinedObjectives = overviewCombinedObjectives.length > 0;
    const overviewObjectivesSynced = hasObjectives && areObjectiveSetsEquivalent(objectives as LessonObjectiveDraft[], overviewCombinedObjectives);

    const items: LessonActionItem[] = [];
    const push = (item: LessonActionItem) => items.push(item);

    if (lessonType === 'content') {
      push({
        id: 'content-source',
        label: 'Add or verify source content',
        kind: 'required',
        status: hasLessonContent ? 'done' : 'todo',
        detail: hasLessonContent
          ? `Available sources: ${[hasSourceDb ? 'Source DB' : null, hasWord ? 'Word' : null].filter(Boolean).join(' + ')}`
          : 'Add Source DB text or upload a Word document.',
      });
      push({
        id: 'content-objectives',
        label: 'Generate learning objectives',
        kind: 'recommended',
        status: hasObjectives
          ? (objectivesFreshness.isStale ? 'todo' : 'done')
          : (hasLessonContent ? 'todo' : 'blocked'),
        detail: !hasObjectives
          ? 'Set objectives from a selected source.'
          : objectivesFreshness.isStale
            ? `Objectives may be stale. Last saved from ${objectivesFreshness.sourceLabel || 'a selected source'}.`
            : `Objectives grounded on ${objectivesFreshness.sourceLabel || 'selected source'}.`,
      });
      push({
        id: 'content-digest',
        label: 'Generate lesson digest',
        kind: contentReadiness.digestKind,
        status: hasDigest ? 'done' : hasLessonContent ? 'todo' : 'blocked',
        detail: hasDigest
          ? 'Digest is ready for learner-friendly reading.'
          : hasSourceDb
            ? 'Optional learner guide. Native lesson material is already viewable.'
            : 'Required once lesson source content exists.',
      });
      push({
        id: 'content-pptx',
        label: 'Generate/upload PPTX',
        kind: contentReadiness.presentationKind,
        status: hasPresentationAsset ? 'done' : hasLessonContent ? 'todo' : 'blocked',
        detail: hasSourceDb
          ? 'Optional presentation or video enhancement. Native lesson material is already viewable.'
          : hasLessonContent && hasDigest
            ? 'Complete this step with either PPTX or video before quiz generation.'
            : 'Complete source content and digest first.',
      });
      push({
        id: 'content-quiz',
        label: 'Generate quiz from selected source',
        kind: 'required',
        status: contentReadiness.quizStatus,
        detail: hasLessonContent ? 'Generate from the selected lesson source material.' : 'Complete source content first.',
      });
      push({
        id: 'content-podcast',
        label: 'Generate lesson podcast',
        kind: 'recommended',
        status: hasPodcast ? 'done' : hasLessonContent ? 'todo' : 'blocked',
        detail: 'Optional audio reinforcement for learners.',
      });
      push({
        id: 'content-video',
        label: 'Upload lesson video',
        kind: 'recommended',
        status: hasVideo ? 'done' : (hasLessonContent && hasDigest) ? 'todo' : 'blocked',
        detail: 'Recommended learner-facing asset.',
      });
      push({
        id: 'content-feedback',
        label: 'Get feedback report',
        kind: 'recommended',
        status: hasFeedback ? 'done' : hasLessonContent ? 'todo' : 'blocked',
        detail: 'Recommended before PPTX/quiz to improve quality.',
      });
      push({
        id: 'content-improve',
        label: 'Apply AI improvements',
        kind: 'recommended',
        status: hasImprovements ? 'done' : hasFeedback ? 'todo' : 'blocked',
        detail: hasFeedback ? 'Apply suggested fixes to improve alignment and score.' : 'Get feedback first.',
      });
      push({
        id: 'content-translate',
        label: 'Translate lesson',
        kind: 'optional',
        status: hasTranslation ? 'done' : 'todo',
        detail: 'Optional after core assets are ready.',
      });
    }

    if (lessonType === 'key_takeaways') {
      const blocked = getBlockedDependencySummary(readinessData, 'takeaways');
      const canGenerate = !!readinessData?.takeaways?.ready;
      const localSourceGenerated = hasTakeawaysGenerationManifest(lessonData);
      const readinessSourceGenerated = readinessData?.takeaways?.sourceGenerated;
      const sourceGenerated = typeof readinessSourceGenerated === 'boolean'
        ? (readinessSourceGenerated && localSourceGenerated)
        : localSourceGenerated;
      push({
        id: 'takeaways-content',
        label: 'Generate key takeaways content',
        kind: 'required',
        status: hasLessonContent || sourceGenerated ? 'done' : canGenerate ? 'todo' : 'blocked',
        detail: hasLessonContent
          ? 'Key takeaways source content exists.'
          : sourceGenerated
          ? 'Takeaways source was generated from completed content lessons.'
          : canGenerate
            ? 'Generate from completed content lessons.'
            : `${blocked.remainingCount}/${blocked.totalCount} content lesson dependencies still incomplete.`,
      });
      push({
        id: 'takeaways-objectives',
        label: 'Generate learning objectives',
        kind: 'required',
        status: hasObjectives ? 'done' : sourceGenerated ? 'todo' : 'blocked',
        detail: hasObjectives
          ? 'Bloom objectives are set for key takeaways.'
          : sourceGenerated
            ? 'Generate or save Bloom objectives from selected source content.'
            : 'Generate key takeaways content first.',
      });
      push({
        id: 'takeaways-digest',
        label: 'Generate lesson digest',
        kind: 'required',
        status: hasDigest ? 'done' : (sourceGenerated && hasObjectives) ? 'todo' : 'blocked',
        detail: hasDigest
          ? 'Digest is ready for learner-friendly reading.'
          : sourceGenerated && hasObjectives
            ? 'Generate digest after key takeaways source and objectives are ready.'
            : 'Complete key takeaways source and objectives first.',
      });
      push({
        id: 'takeaways-pptx',
        label: 'Generate/upload PPTX',
        kind: 'required',
        status: hasPresentationAsset ? 'done' : (sourceGenerated && hasObjectives && hasDigest) ? 'todo' : 'blocked',
        detail: sourceGenerated && hasObjectives && hasDigest
          ? 'Complete this step with either PPTX or video for lesson completion.'
          : 'Generate takeaways source, objectives, and digest first.',
      });
      push({
        id: 'takeaways-quiz',
        label: 'Generate quiz from selected source',
        kind: 'required',
        status: hasQuiz ? 'done' : hasPresentationAsset ? 'todo' : 'blocked',
        detail: hasPresentationAsset ? 'Use quiz source/version selection before generation.' : 'Complete PPTX or upload video first.',
      });
      push({
        id: 'takeaways-podcast',
        label: 'Generate lesson podcast',
        kind: 'recommended',
        status: hasPodcast ? 'done' : sourceGenerated ? 'todo' : 'blocked',
        detail: 'Optional audio summary for learners.',
      });
      push({
        id: 'takeaways-video',
        label: 'Upload lesson video',
        kind: 'recommended',
        status: hasVideo ? 'done' : (sourceGenerated && hasObjectives && hasDigest) ? 'todo' : 'blocked',
        detail: 'Recommended learner-facing asset.',
      });
      push({
        id: 'takeaways-translate',
        label: 'Translate lesson',
        kind: 'optional',
        status: hasTranslation ? 'done' : 'todo',
        detail: 'Optional after core assets are ready.',
      });
    }

    if (lessonType === 'overview') {
      const blocked = getBlockedDependencySummary(readinessData, 'overview');
      const canGenerate = !!readinessData?.overview?.ready;
      push({
        id: 'overview-content',
        label: 'Generate course overview content',
        kind: 'required',
        status: hasLessonContent ? 'done' : canGenerate ? 'todo' : 'blocked',
        detail: hasLessonContent
          ? 'Overview content exists.'
          : canGenerate
            ? 'Generate from content + key takeaways.'
            : `Complete all non-overview lesson requirements first, then return to the overview lesson steps (${blocked.remainingCount}/${blocked.totalCount} prerequisite dependencies still incomplete).`,
      });
      push({
        id: 'overview-objectives',
        label: 'Generate learning objectives',
        kind: 'recommended',
        status: hasObjectives
          ? (overviewObjectivesSynced ? 'done' : 'todo')
          : (hasOverviewCombinedObjectives ? 'todo' : 'blocked'),
        detail: !hasOverviewCombinedObjectives
          ? 'Objectives will populate from content + key takeaways lessons.'
          : overviewObjectivesSynced
            ? 'Overview objectives are synced with the rest of the course.'
            : 'Sync overview objectives with all non-overview lesson objectives.',
      });
      push({
        id: 'overview-digest',
        label: 'Generate lesson digest',
        kind: 'required',
        status: hasDigest ? 'done' : hasLessonContent ? 'todo' : 'blocked',
        detail: hasDigest ? 'Digest is ready for learner-friendly reading.' : 'Required once overview source content exists.',
      });
      push({
        id: 'overview-pptx',
        label: 'Generate/upload PPTX',
        kind: 'required',
        status: hasPresentationAsset ? 'done' : (hasLessonContent && hasDigest) ? 'todo' : 'blocked',
        detail: hasLessonContent && hasDigest ? 'Complete this step with either PPTX or video for lesson completion.' : 'Generate overview content and digest first.',
      });
      push({
        id: 'overview-podcast',
        label: 'Generate lesson podcast',
        kind: 'recommended',
        status: hasPodcast ? 'done' : hasLessonContent ? 'todo' : 'blocked',
        detail: 'Optional audio orientation for learners.',
      });
      push({
        id: 'overview-video',
        label: 'Upload lesson video',
        kind: 'recommended',
        status: hasVideo ? 'done' : (hasLessonContent && hasDigest) ? 'todo' : 'blocked',
        detail: 'Recommended learner-facing asset.',
      });
      push({
        id: 'overview-translate',
        label: 'Translate lesson',
        kind: 'optional',
        status: hasTranslation ? 'done' : 'todo',
        detail: 'Optional after core assets are ready.',
      });
    }

    return items;
  };

  const getNextStep = (
    lessonData: LessonData | undefined | null,
    topic: Topic,
    readinessData: GenerationReadinessData | undefined
  ): NextStepInfo | null => {
    if (!lessonData) return null;
    const actionItems = getLessonActionItems(lessonData, topic, readinessData);
    if (actionItems.length === 0) return null;
    const totalSteps = actionItems.length;

    if (lessonData.feedbackStatus === 'processing') {
      const feedbackIndex = actionItems.findIndex((item) => item.id === 'content-feedback');
      return {
        stepNumber: feedbackIndex >= 0 ? feedbackIndex + 1 : 1,
        totalSteps,
        label: 'Feedback processing...',
        description: 'Expert feedback is being generated',
        type: 'action',
        category: 'recommended',
      };
    }
    if (lessonData.aiImproveStatus === 'processing') {
      const improveIndex = actionItems.findIndex((item) => item.id === 'content-improve');
      return {
        stepNumber: improveIndex >= 0 ? improveIndex + 1 : 1,
        totalSteps,
        label: 'Improvements being applied...',
        description: 'AI is applying improvements to content',
        type: 'action',
        category: 'recommended',
      };
    }
    const blockedRequired = actionItems.find((item) => item.kind === 'required' && item.status === 'blocked');
    if (blockedRequired) {
      return {
        stepNumber: 0,
        totalSteps,
        label: `Waiting: ${blockedRequired.label.toLowerCase()}`,
        description: blockedRequired.detail || 'Complete prerequisite steps first.',
        type: 'blocked',
        category: 'required',
      };
    }

    const firstRequiredTodo = actionItems.find((item) => item.kind === 'required' && item.status === 'todo');
    const firstRecommendedTodo = actionItems.find((item) => item.kind === 'recommended' && item.status === 'todo');
    const firstOptionalTodo = actionItems.find((item) => item.kind === 'optional' && item.status === 'todo');
    const nextItem = firstRequiredTodo || firstRecommendedTodo || firstOptionalTodo;

    if (!nextItem) {
      return {
        stepNumber: totalSteps,
        totalSteps,
        label: 'All steps complete',
        description: 'All required and optional lesson steps are complete.',
        type: 'complete',
        category: 'required',
      };
    }

    const stepNumber = Math.max(1, actionItems.findIndex((item) => item.id === nextItem.id) + 1);
    return {
      stepNumber,
      totalSteps,
      label: nextItem.label,
      description: nextItem.detail || '',
      type: nextItem.kind === 'optional' ? 'optional' : 'action',
      category: nextItem.kind,
    };
  };

  const relinkMutation = useMutation({
    mutationFn: async ({ lessonId, orderOverride }: { lessonId: string; orderOverride?: number }) => {
      return await apiRequest(`/api/courses/${courseId}/lessons/${lessonId}/relink`, {
        method: 'POST',
        body: JSON.stringify({ orderOverride }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Lesson relinked',
        description: 'The lesson has been restored to the course. Quiz links and scope assignments have been recovered.',
      });
      refetch();
      invalidateLessonCaches({ courseId: courseId || undefined });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      setRelinkDialogOpen(false);
      setSelectedUnlinkedTopic(null);
      setArchivedLessonsOpen(false);
      setSelectedArchivedLesson(null);
      setStaleConfirmOpen(false);
      setOrderOverrideDialogOpen(false);
      setSelectedOrderOverride('');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Relink failed',
        description: error.message || 'Failed to relink lesson',
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ lessonId }: { lessonId: string }) => {
      if (!courseId) {
        throw new Error("Course ID is required");
      }
      return await apiRequest(`/api/courses/${courseId}/lessons/${lessonId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson removed from course",
        description: "The lesson has been unlinked from this course.",
      });
      refetch();
      invalidateLessonCaches({ courseId: courseId || undefined });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      setUnlinkDialogOpen(false);
      setLessonToUnlink(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: "Unlink failed",
        description: error.message || "Failed to remove lesson from course",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ topicId, newOrder }: { topicId: string; newOrder: number }) => {
      if (!courseId) {
        throw new Error("Course ID is required");
      }
      return await apiRequest(`/api/courses/${courseId}/framework/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ topicId, newOrder }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson reordered",
        description: "The lesson order has been updated.",
      });
      refetch();
      invalidateLessonCaches({ courseId: courseId || undefined });
      queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: "Reorder failed",
        description: error.message || "Failed to reorder lesson",
      });
    },
  });

  const setLessonTypeMutation = useMutation({
    mutationFn: async ({ lessonId, lessonType }: { lessonId: string; lessonType: 'overview' | 'content' | 'key_takeaways' }) => {
      if (!courseId) {
        throw new Error("Course ID is required");
      }
      return await apiRequest(`/api/courses/${courseId}/lessons/${lessonId}/type`, {
        method: "PATCH",
        body: JSON.stringify({ lessonType }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Lesson type updated",
        description: `This lesson is now marked as ${getLessonTypeLabel(variables.lessonType)}.`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: "Type update failed",
        description: error.message || "Failed to update lesson type",
      });
    },
  });

  const saveLessonObjectivesMutation = useMutation({
    mutationFn: async (payload: {
      lessonId: string;
      topicId?: string;
      objectives: LessonObjectiveDraft[];
      sourceContract?: LessonSourceContract | null;
    }) => {
      const normalizedObjectives = payload.objectives
        .map((row, index) => ({
          id: String(row.id || `obj-${index + 1}`),
          objective: String(row.objective || '').trim(),
          bloomLevel: row.bloomLevel,
        }))
        .filter((row) => row.objective.length > 0);

      if (normalizedObjectives.length === 0) {
        throw new Error('At least one learning objective is required.');
      }

      return await apiRequest(`/api/lessons/${payload.lessonId}?organizationId=${organizationId}`, {
        method: 'PUT',
        body: JSON.stringify({
          organizationId,
          courseId,
          topicId: payload.topicId,
          learningObjectives: normalizedObjectives,
          learningObjectivesSourceContract: payload.sourceContract || null,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Learning objectives saved',
        description: 'Bloom taxonomy objectives were updated for this lesson.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      invalidateLessonCaches({ courseId: courseId || undefined, lessonId: objectivesEditorLessonId || undefined });
      closeObjectivesEditor();
    },
    onError: (error: any) => {
      setObjectiveDraftError(error.message || 'Failed to save learning objectives.');
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error.message || 'Could not save learning objectives.',
      });
    },
  });

  const generateLessonObjectivesMutation = useMutation({
    mutationFn: async (payload: { lessonId: string; targetLevel: BloomLevel; sourceSelection: LessonSourceSelection }) => {
      if (!organizationId) {
        throw new Error('Organization ID is required.');
      }
      return await apiRequest(`/api/lessons/${payload.lessonId}/objectives/generate?organizationId=${organizationId}`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          targetLevel: payload.targetLevel,
          sourceSelection: payload.sourceSelection,
        }),
      });
    },
    onSuccess: (response: any) => {
      const generated = Array.isArray(response?.objectives) ? response.objectives : [];
      if (generated.length === 0) {
        setObjectiveDraftError('No objectives were generated. Please try a different Bloom level.');
        return;
      }

      setObjectiveDraftRows((current) => {
        const seen = new Set(current.map((row) => row.objective.trim().toLowerCase()));
        const additions: LessonObjectiveDraft[] = generated
          .map((item: any, index: number) => {
            const objective = String(item?.objective || '').trim();
            const bloomCandidate = String(item?.bloomLevel || objectiveGenerationLevel).toLowerCase();
            const bloomLevel = (['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'].includes(bloomCandidate)
              ? bloomCandidate
              : objectiveGenerationLevel) as BloomLevel;
            if (!objective || seen.has(objective.toLowerCase())) return null;
            seen.add(objective.toLowerCase());
            return {
              id: String(item?.id || `ai-${Date.now()}-${index + 1}`),
              objective,
              bloomLevel,
            };
          })
          .filter((item: LessonObjectiveDraft | null): item is LessonObjectiveDraft => !!item);

        return [...current, ...additions];
      });

      setObjectiveDraftError(null);
      if (response?.usedSourceContract) {
        setObjectiveLastGeneratedSourceContract(response.usedSourceContract as LessonSourceContract);
      }
      toast({
        title: 'Objectives generated',
        description: `Added AI-generated objectives for Bloom level: ${objectiveGenerationLevel}.`,
      });
    },
    onError: (error: any) => {
      setObjectiveDraftError(error.message || 'Failed to generate objectives.');
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: error.message || 'Could not generate learning objectives from source content.',
      });
    },
  });

  const createTopicMutation = useMutation({
    mutationFn: async ({ name, description, createEmptyLesson }: { name: string; description: string; createEmptyLesson?: boolean }) => {
      if (!courseId) {
        throw new Error("Course ID is required");
      }
      return await apiRequest(`/api/courses/${courseId}/framework/topics`, {
        method: "POST",
        body: JSON.stringify({ name, description, createEmptyLesson }),
      });
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'relinkable-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: "Failed to create lesson",
        description: error.message || "Could not create the new lesson topic",
      });
    },
  });

  // Validation query for publish modal
  const { data: publishValidation, isLoading: isValidating, isError: isValidationError, error: validationError, refetch: refetchValidation } = useQuery<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    lessonDetails: Array<{
      lessonId: string;
      lessonTitle: string;
      topicOrder: number;
      lessonType: string;
      generationStatus: string;
      hasQuiz: boolean;
      requiresQuiz: boolean;
      missingLanguageArtifacts?: string[];
    }>;
  }>({
    queryKey: ['/api/courses', courseId, 'validate-publish', selectedPublishLanguage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedPublishLanguage) params.set('languageCode', selectedPublishLanguage);
      const response = await fetch(`/api/courses/${courseId}/validate-publish${params.toString() ? `?${params.toString()}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to validate course');
      return response.json();
    },
    enabled: publishModalOpen, // Only fetch when modal is open
    staleTime: 0, // Always refetch when modal opens
  });

  const { data: publishReadiness } = useQuery<{
    contentGroupId: string;
    sourceLanguage: string;
    languages: Array<{
      courseId: string;
      languageCode: string;
      languageName: string;
      status: string;
      isSource: boolean;
      ready: boolean;
      totalLessons: number;
      issues: Array<{ lessonId: string; lessonTitle: string; missingAssets: string[] }>;
    }>;
  }>({
    queryKey: ['/api/courses', courseId, 'publish-readiness'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/publish-readiness`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load language publish readiness');
      return response.json();
    },
    enabled: publishModalOpen && !!courseId,
    staleTime: 0,
  });

  const { data: courseAssignments = [] } = useQuery<CourseAssignmentSummary[]>({
    queryKey: ['/api/course-assignments/course', courseId],
    queryFn: async () => {
      const response = await fetch(`/api/course-assignments/course/${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!courseId,
  });

  const publishScopeAssignments = courseAssignments.filter((assignment) => (
    ['department', 'unit', 'team', 'organization'].includes(String(assignment.assignmentScope || '')) ||
    !!assignment.unitId
  ));
  const hasPublishScopeAssignment = publishScopeAssignments.length > 0;
  const assignedUnitCount = new Set(
    publishScopeAssignments
      .map((assignment) => assignment.unitId)
      .filter((unitId): unitId is string => !!unitId)
  ).size;

  const publishCourseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/courses/${courseId}/publish`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      setPublishModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments/course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      toast({
        title: 'Course Published',
        description: 'Your course is now active and ready for assignment.',
      });
      openAssignmentModalFromPublish();
    },
    onError: (error: any) => {
      const errorMessage = error.validation?.errors?.join('; ') || error.message || 'Please try again';
      const isDepartmentError = errorMessage.toLowerCase().includes('department') && errorMessage.toLowerCase().includes('assign');
      
      toast({
        title: isDepartmentError ? `${terminology.unit} Assignment Required` : 'Failed to publish course',
        description: errorMessage,
        variant: 'destructive',
      });
      
      if (isDepartmentError) {
        openAssignmentModalFromPublish();
      }
    },
  });

  const refreshStatusMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      return await apiRequest(`/api/lessons/${lessonId}/refresh-status`, {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      toast({
        title: 'Status Refreshed',
        description: data.message || `Lesson status: ${data.status}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to refresh status',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const response = await apiRequest(`/api/lessons/${lessonId}/feedback`, {
        method: 'POST',
      });
      return response;
    },
    onSuccess: (data) => {
      setConfirmFeedbackOpen(false);
      
      if (data.async) {
        toast({
          title: 'Feedback Processing',
          description: 'Expert feedback is being generated. Results will appear shortly.',
        });
        invalidateWalletCaches();
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      } else if (data.cached) {
        setFeedbackData(data);
        setFeedbackDialogOpen(true);
      } else {
        setFeedbackData(data);
        setFeedbackDialogOpen(true);
        invalidateWalletCaches();
        toast({
          title: 'Feedback Generated',
          description: `Content score: ${data.score10}/10. ${data.creditsCharged} credits used.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      }
    },
    onError: (error: any) => {
      setConfirmFeedbackOpen(false);
      if (error.status === 402) {
        toast({
          title: 'Insufficient Credits',
          description: `You need ${error.required} credits but only have ${error.balance}.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to get feedback',
          variant: 'destructive',
        });
      }
    },
  });

  const lastFeedbackMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const response = await apiRequest(`/api/lessons/${lessonId}/last-feedback`, {
        method: 'GET',
      });
      return response;
    },
    onSuccess: (data) => {
      setFeedbackData(data);
      setFeedbackDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load last feedback report',
        variant: 'destructive',
      });
    },
  });

  const aiImproveMutation = useMutation({
    mutationFn: async ({ lessonId, feedbackReport }: { lessonId: string; feedbackReport: any }) => {
      const response = await apiRequest(`/api/lessons/${lessonId}/ai-improve`, {
        method: 'POST',
        body: JSON.stringify({ feedbackReport }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setFeedbackDialogOpen(false);
      setConfirmFixOpen(false);
      setPendingFixAction(null);
      invalidateLessonCaches({ courseId: courseId || undefined });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      setAiFixSummary({
        summary: data.changesSummary?.summary || 'Content has been improved based on feedback',
        improvements: data.changesSummary?.improvements || [],
        creditsCharged: data.creditsCharged || 0,
        originalWordCount: data.originalWordCount || 0,
        improvedWordCount: data.improvedWordCount || 0,
      });
      setAiFixSummaryDialogOpen(true);
    },
    onError: (error: any) => {
      if (error.status === 402) {
        toast({
          title: 'Insufficient Credits',
          description: `You need ${error.required} credits but only have ${error.balance}.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'AI Fix Failed',
          description: error.message || 'Failed to apply AI improvements',
          variant: 'destructive',
        });
      }
    },
  });

  const abbreviationFixMutation = useMutation({
    mutationFn: async ({ lessonId, abbreviations }: { lessonId: string; abbreviations: Array<{ abbreviation: string; expandedForm: string; originalIdx: number }> }) => {
      const response = await apiRequest(`/api/lessons/${lessonId}/fix-abbreviations`, {
        method: 'POST',
        body: JSON.stringify({ abbreviations }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setFeedbackDialogOpen(false);
      setConfirmFixOpen(false);
      setPendingFixAction(null);
      invalidateLessonCaches({ courseId: courseId || undefined });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
      setAiFixSummary({
        summary: `Expanded abbreviations at first occurrence and preserved later shorthand references.`,
        improvements: [`Expanded ${data.abbreviationsFixed || 0} abbreviation(s) in lesson content.`],
        creditsCharged: data.creditsCost || 0,
        originalWordCount: feedbackData?.report?.wordCount || 0,
        improvedWordCount: data?.lesson?.inputText ? String(data.lesson.inputText).split(/\s+/).filter(Boolean).length : (feedbackData?.report?.wordCount || 0),
      });
      setAiFixSummaryDialogOpen(true);
    },
    onError: (error: any) => {
      if (error.status === 402) {
        toast({
          title: 'Insufficient Credits',
          description: error.message || 'Not enough credits to expand abbreviations.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Abbreviation Expansion Failed',
          description: error.message || 'Failed to expand abbreviations',
          variant: 'destructive',
        });
      }
    },
  });

  const getTopicIdentifier = (topic: Topic): string => {
    return topic.id || topic.lessonId || `order:${topic.order}`;
  };

  const handleMoveUp = (topic: Topic) => {
    const visibleTopicsList = [...(framework?.topics?.filter((t: Topic) => !isTopicHidden(t)) || [])]
      .sort((a: Topic, b: Topic) => Number(a.order || 0) - Number(b.order || 0));
    const currentIndex = visibleTopicsList.findIndex((entry: Topic) => getTopicIdentifier(entry) === getTopicIdentifier(topic));
    if (currentIndex <= 0) return;
    const targetTopic = visibleTopicsList[currentIndex - 1];
    reorderMutation.mutate({ topicId: getTopicIdentifier(topic), newOrder: targetTopic.order });
  };

  const handleMoveDown = (topic: Topic, maxOrder: number) => {
    const visibleTopicsList = [...(framework?.topics?.filter((t: Topic) => !isTopicHidden(t)) || [])]
      .sort((a: Topic, b: Topic) => Number(a.order || 0) - Number(b.order || 0));
    const currentIndex = visibleTopicsList.findIndex((entry: Topic) => getTopicIdentifier(entry) === getTopicIdentifier(topic));
    if (currentIndex < 0 || currentIndex >= visibleTopicsList.length - 1) return;
    const targetTopic = visibleTopicsList[currentIndex + 1];
    reorderMutation.mutate({ topicId: getTopicIdentifier(topic), newOrder: targetTopic.order });
  };

  const isLessonStale = (unlinkedAt: Date): boolean => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return new Date(unlinkedAt) < thirtyDaysAgo;
  };

  const formatUnlinkedDate = (date: Date): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getDaysSinceUnlinked = (date: Date): number => {
    const now = new Date();
    const unlinkedDate = new Date(date);
    const diffTime = Math.abs(now.getTime() - unlinkedDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getAvailableTopicSlots = (): Topic[] => {
    return topics.filter(t => !t.lessonId);
  };

  const expandableAbbreviations = useMemo(() => {
    const raw = feedbackData?.report?.abbreviations;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((a: any) => a && a.abbreviation && a.expandedForm && !a.alreadyDefined)
      .map((a: any) => ({
        abbreviation: a.abbreviation,
        expandedForm: a.expandedForm,
        originalIdx: typeof a.originalIdx === 'number' ? a.originalIdx : -1,
      }));
  }, [feedbackData]);

  const pendingImprovementTitles = useMemo(() => {
    const list = feedbackData?.report?.topImprovements;
    if (!Array.isArray(list)) return [];
    return list
      .map((imp: any) => imp?.title || imp?.description || null)
      .filter((v: string | null): v is string => !!v)
      .slice(0, 5);
  }, [feedbackData]);

  const handleRestoreArchivedLesson = (lesson: RelinkableLesson) => {
    setSelectedArchivedLesson(lesson);
    
    const isStale = isLessonStale(lesson.unlinkedAt);
    const originalSlot = topics.find(t => t.order === lesson.previousOrder);
    const isSlotTaken = originalSlot?.lessonId !== null && originalSlot?.lessonId !== undefined;
    
    if (isSlotTaken) {
      setOrderOverrideDialogOpen(true);
    } else if (isStale) {
      setStaleConfirmOpen(true);
    } else {
      relinkMutation.mutate({ 
        lessonId: lesson.id, 
        orderOverride: lesson.previousOrder 
      });
    }
  };

  const handleConfirmStaleRelink = () => {
    if (selectedArchivedLesson) {
      const originalSlot = topics.find(t => t.order === selectedArchivedLesson.previousOrder);
      const isSlotTaken = originalSlot?.lessonId !== null && originalSlot?.lessonId !== undefined;
      
      if (isSlotTaken) {
        setStaleConfirmOpen(false);
        setOrderOverrideDialogOpen(true);
      } else {
        relinkMutation.mutate({ 
          lessonId: selectedArchivedLesson.id, 
          orderOverride: selectedArchivedLesson.previousOrder 
        });
      }
    }
  };

  const handleConfirmOrderOverride = () => {
    if (selectedArchivedLesson && selectedOrderOverride) {
      relinkMutation.mutate({ 
        lessonId: selectedArchivedLesson.id, 
        orderOverride: parseInt(selectedOrderOverride, 10) 
      });
    }
  };

  const topics = framework?.topics?.sort((a, b) => a.order - b.order) || [];
  
  // Helper function to determine if a topic is hidden (deleted/unlinked)
  // Supports both new isHidden flag and legacy previousLessonId-based detection
  const isTopicHidden = (topic: any): boolean => {
    return topic.isHidden === true || (topic.previousLessonId && !topic.lessonId);
  };
  
  // Visible topics exclude hidden/deleted lessons from the main course view
  const visibleTopics = topics.filter(t => !isTopicHidden(t));
  const visibleTopicKeys = useMemo(
    () => visibleTopics.map((topic) => String(topic.id || `order:${topic.order}`)),
    [visibleTopics]
  );

  const getLessonCardKey = (topic: Topic): string => String(topic.id || `order:${topic.order}`);
  const isLessonCardDetailExpanded = (topic: Topic): boolean => !!lessonCardExpanded[getLessonCardKey(topic)];
  const toggleLessonCardExpanded = (topic: Topic) => {
    const key = getLessonCardKey(topic);
    setLessonCardExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (visibleTopicKeys.length === 0) return;
    setLessonCardExpanded((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const key of visibleTopicKeys) {
        if (typeof next[key] === 'undefined') next[key] = false;
      }
      return next;
    });
  }, [visibleTopicKeys.join('|')]);

  useEffect(() => {
    if (!course?.languageCode) return;
    setSelectedPublishLanguage(String(course.languageCode).toLowerCase());
  }, [course?.languageCode, courseId]);
  
  // Filter to only topics with active lessons (exclude deleted/unlinked topics)
  const activeTopics = topics.filter(t => t.lessonId) as (typeof topics[number] & { lessonId: string })[];
  // Count lessons that have content - either AI-generated OR manually uploaded PPTX/video
  const generatedCount = activeTopics.filter(t => {
    const lessonData = lessonsData?.[t.lessonId];
    if (!lessonData) return false;
    // Lesson has content if: AI generation completed, OR has uploaded PPTX, OR has video
    const hasGeneratedContent = lessonData.generationStatus === 'completed';
    const hasUploadedContent = !!lessonData.storageKey || !!lessonData.videoStorageKey || !!lessonData.gammaCardId;
    return hasGeneratedContent || hasUploadedContent;
  }).length;
  // Total count excludes deleted/unlinked lessons (topics without lessonId)
  const totalCount = activeTopics.length;
  
  // Check if any lesson is currently actively generating (to block concurrent generation)
  // Only check 'processing' and 'polling' - 'pending' means queued but not yet started
  const isAnyLessonGenerating = useMemo(() => {
    if (!lessonsData) return false;
    return Object.values(lessonsData).some(
      (lesson: LessonData) => 
        lesson.generationStatus === 'processing' || 
        lesson.generationStatus === 'polling'
    );
  }, [lessonsData]);

  const handleOpenPicker = (topic: Topic) => {
    setSelectedTopic(topic);
    setPickerModalOpen(true);
  };

  const handleLessonAttached = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
  };

  const handleActionComplete = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'relinkable-lessons'] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'health'] });
  };

  const buildContentStudioUrl = (lessonId: string, opts?: { autoFeedback?: boolean; langLessonId?: string; docVersionId?: string; focus?: 'source' | 'word' | 'objectives' }) => {
    const returnToParam = courseId ? `returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}` : "";
    const courseParam = courseId ? `courseId=${encodeURIComponent(String(courseId))}` : "";
    const orgParam = organizationId ? `organizationId=${encodeURIComponent(String(organizationId))}` : "";
    const feedbackParam = opts?.autoFeedback ? "autofeedback=1" : "";
    const langParam = opts?.langLessonId ? `langLessonId=${encodeURIComponent(String(opts.langLessonId))}` : "";
    const docVersionParam = opts?.docVersionId ? `docVersionId=${encodeURIComponent(String(opts.docVersionId))}` : "";
    const focusParam = opts?.focus ? `focus=${encodeURIComponent(opts.focus)}` : "";
    const query = [returnToParam, courseParam, orgParam, feedbackParam, langParam, docVersionParam, focusParam].filter(Boolean).join("&");
    return `/lessons/${lessonId}/content-studio${query ? `?${query}` : ""}`;
  };

  const buildLessonWizardUrl = (lessonId: string, topic: Topic, lessonTitle: string) => {
    const topicIdParam = topic.id ? `&topicId=${topic.id}` : '';
    const topicNameParam = topic.name ? `&topicName=${encodeURIComponent(topic.name)}` : '';
    const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
    return `/lessons/new?courseId=${courseId}${topicIdParam}${topicNameParam}&topicOrder=${topic.order}&prefillTitle=${encodeURIComponent(lessonTitle)}&returnToCourse=true&lessonId=${lessonId}${returnParams}`;
  };

  const buildPptxUploadUrl = (lessonId: string, topicOrder: number) =>
    `/course-builder/${courseId}/upload/${topicOrder}?lessonId=${lessonId}&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}`;

  const buildQuizWizardUrl = (lessonId: string) => {
    const params = new URLSearchParams();
    params.set('lessonId', lessonId);
    params.set('organizationId', organizationId);
    if (courseId) {
      params.set('courseId', courseId);
      params.set('returnTo', `/course-builder/${courseId}/lessons`);
    }
    return `/quiz-wizard?${params.toString()}`;
  };

  const buildPodcastWizardUrl = (lessonId: string, lessonData: LessonData, options?: { scriptId?: string; openStatus?: boolean }) => {
    const params = new URLSearchParams();
    params.set('organizationId', organizationId);
    params.set('courseId', String(courseId || ''));
    params.set('courseName', String((lessonData as any)?.courseName || '').trim());
    params.set('lessonTitle', lessonData.title || '');
    params.set('returnTo', `/course-builder/${courseId}/lessons`);
    const hasSourceDb = !!lessonData.inputText;
    const hasWord = !!lessonData.sourceDocumentPath;
    const hasPptx = !!lessonData.storageKey || !!lessonData.gammaCardId;
    if (hasSourceDb) params.set('hasSourceDb', '1');
    if (hasWord) params.set('hasWord', '1');
    if (hasPptx) params.set('hasPptx', '1');
    if (options?.scriptId) params.set('scriptId', options.scriptId);
    if (options?.openStatus) params.set('openStatus', '1');
    return `/lessons/${lessonId}/podcast-wizard?${params.toString()}`;
  };

  type LessonLanguageArtifactState = {
    lessonId: string;
    code: string;
    isDefault: boolean;
    isStale: boolean;
    hasSourceDb: boolean;
    hasWordDoc: boolean;
    hasObjectives: boolean;
    hasPptx: boolean;
    hasVideo: boolean;
    hasQuiz: boolean;
    hasPodcast: boolean;
    hasPodcastScript: boolean;
    hasDigest: boolean;
    hasStepGuide: boolean;
    quizIds: string[];
    activePodcastVersionId?: string | null;
    activeStepGuideVersionId?: string | null;
  };

  const getLanguageArtifactStates = (lessonData: LessonData): LessonLanguageArtifactState[] => {
    const hasDigestForLanguage = (code: string) => hasDigestSectionsForLanguage(lessonData, code);
    const hasStepGuideForCode = (code: string) => hasStepGuideForLanguage(lessonData, code);
    const langBundle = lessonLanguages?.[lessonData.id];
    const currentCode = String(lessonData.languageCode || langBundle?.defaultLanguage?.code || 'en').toLowerCase();
    const defaultCode = String(langBundle?.defaultLanguage?.code || 'en').toLowerCase();
    const currentLangEntry = (langBundle?.languages || []).find(
      (entry) => String(entry?.code || '').trim().toLowerCase() === currentCode
    );
    const fallbackHasSourceDb = !!String(lessonData.inputText || '').trim();
    const fallbackHasWordDoc = !!lessonData.sourceDocumentPath;
    const fallbackHasPptx = !!lessonData.storageKey || !!lessonData.gammaCardId;
    const fallbackHasVideo = !!lessonData.videoStorageKey;
    const fallbackHasQuiz = !!lessonData.linkedQuizId || (Number(lessonData.linkedQuizCount || 0) > 0);
    const fallbackHasObjectives = Array.isArray(lessonData.learningObjectives) && lessonData.learningObjectives.length > 0;
    const sourceState: LessonLanguageArtifactState = {
      lessonId: String(currentLangEntry?.lessonId || lessonData.id),
      code: currentCode,
      isDefault: currentCode === defaultCode,
      isStale: !!currentLangEntry?.isStale,
      hasSourceDb: currentLangEntry?.hasContent ?? fallbackHasSourceDb,
      hasWordDoc: currentLangEntry?.hasWordDoc ?? fallbackHasWordDoc,
      hasObjectives: currentLangEntry?.hasObjectives ?? fallbackHasObjectives,
      hasPptx: currentLangEntry?.hasPptx ?? fallbackHasPptx,
      hasVideo: currentLangEntry?.hasVideo ?? fallbackHasVideo,
      hasQuiz: currentLangEntry?.hasQuiz ?? fallbackHasQuiz,
      hasPodcast: !!(currentLangEntry?.hasPodcast ?? hasCompletedPodcast(lessonData)),
      hasPodcastScript: !!(currentLangEntry?.hasPodcastScript ?? hasCompletedPodcastScript(lessonData)),
      hasDigest: !!(currentLangEntry?.hasDigest ?? hasDigestForLanguage(currentCode)),
      hasStepGuide: !!(currentLangEntry?.hasStepGuide ?? hasStepGuideForCode(currentCode)),
      quizIds: Array.isArray(currentLangEntry?.quizIds) ? currentLangEntry!.quizIds!.map((id) => String(id)) : [],
      activePodcastVersionId: currentLangEntry?.activePodcastVersionId || null,
      activeStepGuideVersionId: currentLangEntry?.activeStepGuideVersionId || null,
    };

    const translated: LessonLanguageArtifactState[] = (langBundle?.languages || [])
      .map((l) => ({
        lessonId: String(l.lessonId || '').trim(),
        code: String(l.code || '').trim().toLowerCase(),
        isDefault: false,
        isStale: !!l.isStale,
        hasSourceDb: !!l.hasContent,
        hasWordDoc: !!l.hasWordDoc,
        hasObjectives: !!(l.hasObjectives ?? fallbackHasObjectives),
        hasPptx: !!l.hasPptx,
        hasVideo: !!l.hasVideo,
        hasQuiz: !!l.hasQuiz,
        hasPodcast: !!l.hasPodcast,
        hasPodcastScript: !!(l.hasPodcastScript ?? hasCompletedPodcastScript(lessonData)),
        hasDigest: !!(l.hasDigest ?? hasDigestForLanguage(l.code)),
        hasStepGuide: !!(l.hasStepGuide ?? hasStepGuideForCode(l.code)),
        quizIds: Array.isArray(l.quizIds) ? l.quizIds.map((id) => String(id)) : [],
        activePodcastVersionId: l.activePodcastVersionId || null,
        activeStepGuideVersionId: l.activeStepGuideVersionId || null,
      }))
      .filter((l) => !!l.lessonId && !!l.code && l.code !== currentCode);

    const defaultLanguageState = (langBundle?.defaultLanguage && defaultCode !== currentCode)
      ? {
          lessonId: String(langBundle.defaultLanguage.lessonId || '').trim(),
          code: defaultCode,
          isDefault: true,
          isStale: false,
          hasSourceDb: !!langBundle.defaultLanguage.hasContent,
          hasWordDoc: !!langBundle.defaultLanguage.hasWordDoc,
          hasObjectives: !!(langBundle.defaultLanguage.hasObjectives ?? fallbackHasObjectives),
          hasPptx: !!langBundle.defaultLanguage.hasPptx,
          hasVideo: !!langBundle.defaultLanguage.hasVideo,
          hasQuiz: !!langBundle.defaultLanguage.hasQuiz,
          hasPodcast: !!langBundle.defaultLanguage.hasPodcast,
          hasPodcastScript: !!langBundle.defaultLanguage.hasPodcastScript,
          hasDigest: !!(langBundle.defaultLanguage.hasDigest ?? hasDigestForLanguage(defaultCode)),
          hasStepGuide: !!(langBundle.defaultLanguage.hasStepGuide ?? hasStepGuideForCode(defaultCode)),
          quizIds: Array.isArray(langBundle.defaultLanguage.quizIds) ? langBundle.defaultLanguage.quizIds.map((id) => String(id)) : [],
          activePodcastVersionId: langBundle.defaultLanguage.activePodcastVersionId || null,
          activeStepGuideVersionId: langBundle.defaultLanguage.activeStepGuideVersionId || null,
        }
      : null;

    return [sourceState, ...(defaultLanguageState ? [defaultLanguageState] : []), ...translated]
      .filter((state) => !!state.lessonId && !!state.code)
      .filter((state, index, arr) => arr.findIndex((candidate) => candidate.code === state.code) === index);
  };

  const buildLessonViewerUrlForArtifact = (
    lessonId: string,
    artifact: 'pptx' | 'video' | 'podcast' | 'digest',
    opts?: {
      languageCode?: string;
      langLessonId?: string;
      podcastVersionId?: string | null;
      digestVersionId?: string | null;
      stepGuideVersionId?: string | null;
    }
  ): string => {
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', String(courseId));
    params.set('returnTo', `/course-builder/${courseId}/lessons`);
    params.set('focus', artifact);
    if (opts?.languageCode) params.set('languageCode', opts.languageCode);
    if (opts?.langLessonId) params.set('langLessonId', opts.langLessonId);
    if (artifact === 'podcast' && opts?.podcastVersionId) {
      params.set('podcastVersionId', String(opts.podcastVersionId));
    }
    if (artifact === 'digest' && opts?.digestVersionId) {
      params.set('versionId', String(opts.digestVersionId));
    }
    if (artifact === 'digest' && opts?.stepGuideVersionId) {
      params.set('stepGuideVersionId', String(opts.stepGuideVersionId));
    }
    const query = params.toString();
    return `/lessons/${lessonId}${query ? `?${query}` : ''}`;
  };

  const buildNativeLessonMaterialUrl = (lessonId: string): string => {
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', String(courseId));
    params.set('returnTo', `/course-builder/${courseId}/lessons`);
    params.set('focus', 'source');
    const query = params.toString();
    return `/lessons/${lessonId}${query ? `?${query}` : ''}`;
  };

  const openLessonArtifact = (
    lessonData: LessonData,
    lang: LessonLanguageArtifactState,
    artifact: 'pptx' | 'video' | 'podcast' | 'digest',
    opts?: { podcastVersionId?: string | null; digestVersionId?: string | null; stepGuideVersionId?: string | null; targetLessonId?: string | null }
  ) => {
    const targetLangLessonId = String(opts?.targetLessonId || lang.lessonId || lessonData.id);
    setLocation(
      buildLessonViewerUrlForArtifact(targetLangLessonId, artifact, {
        languageCode: lang.code,
        langLessonId: targetLangLessonId,
        podcastVersionId: opts?.podcastVersionId ?? lang.activePodcastVersionId ?? null,
        digestVersionId: opts?.digestVersionId ?? null,
        stepGuideVersionId: opts?.stepGuideVersionId ?? lang.activeStepGuideVersionId ?? null,
      })
    );
  };

  const openLessonQuizById = (lessonData: LessonData, lang: LessonLanguageArtifactState, quizId: string, targetLessonIdOverride?: string | null) => {
    const targetLessonId = String(targetLessonIdOverride || lang.lessonId || lessonData.id);
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', String(courseId));
    params.set('lessonId', targetLessonId);
    params.set('returnTo', `/course-builder/${courseId}/lessons`);
    setLocation(`/quiz-single/${quizId}?${params.toString()}`);
  };

  const getArtifactSelectorKey = (lessonData: LessonData, lang: LessonLanguageArtifactState) =>
    `${lessonData.id}:${lang.lessonId || lessonData.id}:${lang.code}`;

  const loadArtifactSelector = async (
    lessonData: LessonData,
    lang: LessonLanguageArtifactState,
    options?: { forceRefresh?: boolean }
  ) => {
    const targetLessonId = lang.lessonId || lessonData.id;
    const cacheKey = getArtifactSelectorKey(lessonData, lang);
    const forceRefresh = options?.forceRefresh === true;
    if (!targetLessonId || (!forceRefresh && artifactSelectorCache[cacheKey]) || artifactSelectorLoadingKeys[cacheKey]) return;

    setArtifactSelectorLoadingKeys((prev) => ({ ...prev, [cacheKey]: true }));
    try {
      const presentationParams = new URLSearchParams();
      if (organizationId) presentationParams.set('organizationId', String(organizationId));
      if (lang.code) presentationParams.set('languageCode', String(lang.code));
      presentationParams.set('prefetchSlides', '1');
      const presentationQuery = presentationParams.toString();

      const quizParams = new URLSearchParams();
      if (organizationId) quizParams.set('organizationId', String(organizationId));
      if (lang.code) quizParams.set('languageCode', String(lang.code));
      quizParams.set('includeResolution', '1');
      const quizQuery = quizParams.toString();

      const courseParam = new URLSearchParams();
      if (organizationId) courseParam.set('organizationId', String(organizationId));
      if (courseId) courseParam.set('courseId', String(courseId));
      if (lang.code) courseParam.set('languageCode', String(lang.code));
      const podcastQuery = courseParam.toString();

      const stepGuideParams = new URLSearchParams();
      if (organizationId) stepGuideParams.set('organizationId', String(organizationId));
      if (lang.code) stepGuideParams.set('languageCode', String(lang.code));
      const stepGuideQuery = stepGuideParams.toString();

      const contentVersionsParams = new URLSearchParams();
      if (organizationId) contentVersionsParams.set('organizationId', String(organizationId));
      const contentVersionsQuery = contentVersionsParams.toString();

      const [pptxRes, quizRes, podcastRes, allVersionsRes, contentVersionsRes, stepGuideStateRes] = await Promise.allSettled([
        fetch(`/api/lessons/${targetLessonId}/presentation-versions${presentationQuery ? `?${presentationQuery}` : ''}`, { credentials: 'include' }),
        fetch(`/api/lessons/${targetLessonId}/linked-quizzes${quizQuery ? `?${quizQuery}` : ''}`, { credentials: 'include' }),
        fetch(`/api/lessons/${targetLessonId}/podcast/state${podcastQuery ? `?${podcastQuery}` : ''}`, { credentials: 'include' }),
        fetch(`/api/lessons/${targetLessonId}/all-versions`, { credentials: 'include' }),
        fetch(`/api/lessons/${targetLessonId}/content-versions${contentVersionsQuery ? `?${contentVersionsQuery}` : ''}`, { credentials: 'include' }),
        fetch(`/api/lessons/${targetLessonId}/step-guide/state${stepGuideQuery ? `?${stepGuideQuery}` : ''}`, { credentials: 'include' }),
      ]);

      let presentationVersions: ArtifactSelectorPresentationVersion[] = [];
      let currentPresentationVersion: number | null = null;
      let resolvedPptxLessonId: string = targetLessonId;
      if (pptxRes.status === 'fulfilled' && pptxRes.value.ok) {
        const data = await pptxRes.value.json();
        presentationVersions = Array.isArray(data?.versions)
          ? data.versions
              .map((v: any) => ({
                id: String(v?.id || ''),
                version: Number(v?.version || 0),
                createdAt: String(v?.createdAt || ''),
              }))
              .filter((v: ArtifactSelectorPresentationVersion) => !!v.id && Number.isFinite(v.version))
          : [];
        currentPresentationVersion = data?.currentVersion ?? null;
        const resolvedLessonId = String((data as any)?.artifactResolution?.resolvedLessonId || '').trim();
        if (resolvedLessonId) resolvedPptxLessonId = resolvedLessonId;
      }

      let linkedQuizzes: ArtifactSelectorLinkedQuiz[] = [];
      let resolvedQuizLessonId: string = targetLessonId;
      if (quizRes.status === 'fulfilled' && quizRes.value.ok) {
        const data = await quizRes.value.json();
        const quizzesRaw = Array.isArray(data) ? data : (Array.isArray((data as any)?.quizzes) ? (data as any).quizzes : []);
        linkedQuizzes = quizzesRaw
          .map((q: any) => ({
              id: String(q?.id || ''),
              quizId: String(q?.quizId || ''),
              isPrimary: !!q?.isPrimary,
              createdAt: q?.createdAt ? String(q.createdAt) : undefined,
            })).filter((q: ArtifactSelectorLinkedQuiz) => !!q.quizId)
        ;
        const resolvedLessonId = String((data as any)?.artifactResolution?.resolvedLessonId || '').trim();
        if (resolvedLessonId) resolvedQuizLessonId = resolvedLessonId;
      }

      let podcastVersions: ArtifactSelectorPodcastVersion[] = [];
      let activePodcastVersionId: string | null = lang.activePodcastVersionId || null;
      let resolvedPodcastLessonId: string = targetLessonId;
      let resolvedPodcastLanguageCode: string = String(lang.code || '').trim().toLowerCase() || 'en';
      if (podcastRes.status === 'fulfilled' && podcastRes.value.ok) {
        const data = await podcastRes.value.json();
        podcastVersions = Array.isArray(data?.versions)
          ? data.versions
              .map((v: any) => ({
                id: String(v?.id || ''),
                title: v?.title ? String(v.title) : undefined,
                createdAt: v?.createdAt ? String(v.createdAt) : undefined,
                languageCode: v?.languageCode ? String(v.languageCode) : undefined,
                status: v?.status ? String(v.status) : undefined,
                scriptId: v?.scriptId ? String(v.scriptId) : undefined,
              }))
              .filter((v: ArtifactSelectorPodcastVersion) => !!v.id)
          : [];
        activePodcastVersionId = String(
          data?.activeVersionIdsByLanguage?.[resolvedPodcastLanguageCode] ||
          data?.activeVersionId ||
          ''
        ).trim() || activePodcastVersionId;
        const resolvedLessonId = String((data as any)?.artifactResolution?.resolvedLessonId || '').trim();
        if (resolvedLessonId) resolvedPodcastLessonId = resolvedLessonId;
        const resolvedLanguageCode = String((data as any)?.artifactResolution?.resolvedLanguageCode || '').trim().toLowerCase();
        if (resolvedLanguageCode) resolvedPodcastLanguageCode = resolvedLanguageCode;
      }

      let lessonVersions: ArtifactSelectorLessonVersion[] = [];
      if (allVersionsRes.status === 'fulfilled' && allVersionsRes.value.ok) {
        const data = await allVersionsRes.value.json();
        const variant = Array.isArray(data?.variants)
          ? data.variants.find((v: any) => String(v?.lessonId || '') === targetLessonId)
          : null;
        lessonVersions = Array.isArray(variant?.versions)
          ? variant.versions.map((v: any) => ({
              id: v?.id ? String(v.id) : null,
              versionNumber: Number(v?.versionNumber || 0),
              title: v?.title ? String(v.title) : undefined,
              createdAt: v?.createdAt ? String(v.createdAt) : undefined,
              isCurrentState: !!v?.isCurrentState,
            })).filter((v: ArtifactSelectorLessonVersion) => Number.isFinite(v.versionNumber))
          : [];
      }

      let sourceContentVersions: ArtifactSelectorContentVersion[] = [];
      if (contentVersionsRes.status === 'fulfilled' && contentVersionsRes.value.ok) {
        const data = await contentVersionsRes.value.json();
        sourceContentVersions = Array.isArray(data)
          ? data
              .map((v: any) => ({
                id: String(v?.id || ''),
                versionNumber: Number(v?.versionNumber || 0),
                title: v?.title ? String(v.title) : undefined,
                changeDescription: v?.changeDescription ? String(v.changeDescription) : undefined,
                source: v?.source ? String(v.source) : undefined,
                createdAt: v?.createdAt ? String(v.createdAt) : undefined,
                isCurrentState: v?.id === 'current' || !!v?.metadata?.isSyntheticCurrent,
                isSyntheticInitial: v?.id === 'initial' || !!v?.metadata?.isSyntheticInitial,
              }))
              .filter((v: ArtifactSelectorContentVersion) => !!v.id && Number.isFinite(v.versionNumber))
          : [];
      }

      let activeStepGuideVersionId: string | null = lang.activeStepGuideVersionId || null;
      let stepGuideVersions: ArtifactSelectorStepGuideVersion[] = [];
      let resolvedStepGuideLessonId: string = targetLessonId;
      if (stepGuideStateRes.status === 'fulfilled' && stepGuideStateRes.value.ok) {
        const data = await stepGuideStateRes.value.json();
        activeStepGuideVersionId = String(data?.activeVersionId || '').trim() || activeStepGuideVersionId;
        stepGuideVersions = Array.isArray(data?.versions)
          ? data.versions
              .map((version: any) => ({
                id: String(version?.id || ''),
                title: version?.title ? String(version.title) : undefined,
                createdAt: version?.createdAt ? String(version.createdAt) : undefined,
                updatedAt: version?.updatedAt ? String(version.updatedAt) : undefined,
                stepCount: Number.isFinite(Number(version?.stepCount)) ? Number(version.stepCount) : undefined,
                sourceFilename: version?.sourceFilename ? String(version.sourceFilename) : undefined,
                sourceType: version?.sourceType ? String(version.sourceType) : undefined,
              }))
              .filter((version: ArtifactSelectorStepGuideVersion) => !!version.id)
          : [];
        const resolvedLessonId = String((data as any)?.artifactResolution?.resolvedLessonId || '').trim();
        if (resolvedLessonId) resolvedStepGuideLessonId = resolvedLessonId;
      }

      setArtifactSelectorCache((prev) => ({
        ...prev,
        [cacheKey]: {
          hasVideo: lang.hasVideo,
          resolvedPptxLessonId,
          resolvedQuizLessonId,
          resolvedPodcastLessonId,
          resolvedPodcastLanguageCode,
          resolvedStepGuideLessonId,
          currentPresentationVersion,
          presentationVersions,
          linkedQuizzes,
          activePodcastVersionId,
          podcastVersions,
          lessonVersions,
          sourceContentVersions,
          activeStepGuideVersionId,
          stepGuideVersions,
        },
      }));
    } catch {
      // Keep cache writable for retries; transient org/session/network failures should not permanently hide artifacts.
    } finally {
      setArtifactSelectorLoadingKeys((prev) => {
        if (!prev[cacheKey]) return prev;
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
    }
  };

  const requestStepGuideUpload = (sourceLessonId: string, targetLessonId: string, languageCode: string) => {
    setPendingStepGuideUploadContext({
      sourceLessonId,
      targetLessonId,
      languageCode: String(languageCode || '').trim().toLowerCase() || 'en',
    });
    if (stepGuideFileInputRef.current) {
      stepGuideFileInputRef.current.value = '';
      stepGuideFileInputRef.current.click();
    }
  };

  const handleStepGuideFileSelected = async (event: any) => {
    const file = event.target.files?.[0] || null;
    const uploadContext = pendingStepGuideUploadContext;
    event.target.value = '';
    if (!file || !uploadContext) return;

    const allowed = ['.docx', '.doc', '.md', '.markdown', '.txt'];
    const lowerName = String(file.name || '').toLowerCase();
    if (!allowed.some((ext) => lowerName.endsWith(ext))) {
      toast({
        title: 'Unsupported guide file',
        description: 'Upload a .docx, .doc, .md, .markdown, or .txt guide file.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('guideFile', file);
      formData.append('languageCode', uploadContext.languageCode);
      if (organizationId) formData.append('organizationId', String(organizationId));

      const response = await fetch(`/api/lessons/${uploadContext.targetLessonId}/step-guide/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        let message = 'Failed to upload step-by-step guide.';
        try {
          const payload = await response.json();
          message = String(payload?.error || message);
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      const payload = await response.json();
      toast({
        title: 'Step-by-step guide uploaded',
        description: `Guide saved for ${String(payload?.languageCode || uploadContext.languageCode).toUpperCase()} with ${Number(payload?.stepCount || 0)} steps.`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', uploadContext.targetLessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', uploadContext.targetLessonId, 'viewer'] });

      const sourceLesson = lessonsData?.[uploadContext.sourceLessonId];
      if (sourceLesson) {
        const languages = getLanguageArtifactStates(sourceLesson);
        const langState = languages.find((lang) =>
          String(lang.code || '').toLowerCase() === String(uploadContext.languageCode || '').toLowerCase() &&
          String(lang.lessonId || sourceLesson.id) === String(uploadContext.targetLessonId)
        );
        if (langState) {
          const cacheKey = getArtifactSelectorKey(sourceLesson, langState);
          setArtifactSelectorCache((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          await loadArtifactSelector(sourceLesson, langState, { forceRefresh: true });
        }
      }
    } catch (error: any) {
      toast({
        title: 'Guide upload failed',
        description: error?.message || 'Failed to upload step-by-step guide.',
        variant: 'destructive',
      });
    } finally {
      setPendingStepGuideUploadContext(null);
    }
  };

  const downloadPresentationVersionFromSelector = async (lessonId: string, versionId: string, versionNumber: number) => {
    if (!organizationId) {
      toast({
        title: 'Organization required',
        description: 'Unable to resolve organization context for this download.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const response = await apiRequest(
        `/api/lessons/${lessonId}/presentation-versions/${versionId}/download?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'GET' }
      );
      const downloadUrl = String((response as any)?.downloadUrl || '').trim();
      if (!downloadUrl) throw new Error('No download URL returned');
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      toast({ title: 'Download started', description: `PPTX version ${versionNumber} is downloading.` });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.message || 'Unable to download selected PPTX version.',
        variant: 'destructive',
      });
    }
  };

  const downloadPodcastScriptFromSelector = (lessonId: string, languageCode: string, versionId?: string | null) => {
    const params = new URLSearchParams();
    if (organizationId) params.set('organizationId', String(organizationId));
    if (languageCode) params.set('languageCode', languageCode);
    if (versionId) params.set('versionId', String(versionId));
    const query = params.toString();
    window.open(`/api/lessons/${lessonId}/podcast/script/download${query ? `?${query}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const ensureArtifactDataForLesson = async (lessonData: LessonData) => {
    const languages = getLanguageArtifactStates(lessonData);
    await Promise.all(languages.map((lang) => loadArtifactSelector(lessonData, lang, { forceRefresh: true })));
  };

  const lessonReorderButtonStyle: CSSProperties = {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
    borderColor: 'var(--accent)',
  };

  const lessonTranslateButtonStyle: CSSProperties = {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    borderColor: 'var(--primary)',
  };

  const lessonActionsButtonStyle: CSSProperties = {
    backgroundColor: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
    borderColor: 'var(--secondary)',
  };

  const lessonExpandButtonStyle: CSSProperties = {
    backgroundColor: '#0e7490',
    color: '#ffffff',
    borderColor: '#155e75',
  };

  const lessonTypeSelectStyle: CSSProperties = {
    backgroundColor: '#7c2d12',
    color: '#ffffff',
    borderColor: '#9a3412',
  };

  const openQuickArtifactDrawer = async (lessonData: LessonData, artifact: QuickArtifactType) => {
    setQuickArtifactContext({ lessonId: lessonData.id, lessonTitle: lessonData.title || "Lesson", artifact });
    setQuickArtifactDrawerOpen(true);
    await ensureArtifactDataForLesson(lessonData);
  };

  const getAvailableArtifactBadges = (lessonData: LessonData): Array<{ key: QuickArtifactType; label: string; icon?: React.ReactNode }> => {
    const languageStates = getLanguageArtifactStates(lessonData);
    const hasAny = (predicate: (lang: LessonLanguageArtifactState) => boolean) => languageStates.some(predicate);
    const hasPodcastScript = hasAny((l) => l.hasPodcastScript);
    const hasObjectives = hasAny((l) => l.hasObjectives) || (Array.isArray(lessonData.learningObjectives) && lessonData.learningObjectives.length > 0);
    return [
      ...(hasAny((l) => l.hasSourceDb) ? [{ key: 'source_db' as const, label: 'Source DB', icon: <FileText className="h-3 w-3 mr-1" /> }] : []),
      ...(hasAny((l) => l.hasWordDoc) ? [{ key: 'word_source' as const, label: 'Word Source', icon: <FileText className="h-3 w-3 mr-1" /> }] : []),
      ...(hasAny((l) => l.hasPptx) ? [{ key: 'pptx' as const, label: 'PPTX' }] : []),
      ...(hasAny((l) => l.hasVideo) ? [{ key: 'video' as const, label: 'Video', icon: <Video className="h-3 w-3 mr-1" /> }] : []),
      ...(hasAny((l) => l.hasQuiz) ? [{ key: 'quiz' as const, label: 'Quiz', icon: <FileQuestion className="h-3 w-3 mr-1" /> }] : []),
      ...(hasAny((l) => l.hasPodcast) ? [{ key: 'podcast_audio' as const, label: 'Podcast Audio', icon: <Mic className="h-3 w-3 mr-1" /> }] : []),
      ...(hasPodcastScript ? [{ key: 'podcast_script' as const, label: 'Podcast Script', icon: <Mic className="h-3 w-3 mr-1" /> }] : []),
      ...(hasObjectives ? [{ key: 'learning_objectives' as const, label: 'Learning Objectives', icon: <GraduationCap className="h-3 w-3 mr-1" /> }] : []),
      ...(hasAny((l) => l.hasDigest || l.hasStepGuide)
        ? [{ key: 'lesson_digest' as const, label: 'Lesson Digest', icon: <BookOpen className="h-3 w-3 mr-1" /> }]
        : []),
    ];
  };

  const getArtifactBadgeToneClasses = (artifact: QuickArtifactType): string => {
    return '';
  };

  const getArtifactBadgeToneStyle = (artifact: QuickArtifactType): CSSProperties | undefined => {
    switch (artifact) {
      case 'source_db':
        return {
          backgroundColor: '#0f6fb8',
          color: '#ffffff',
          borderColor: '#0b5d9c',
        };
      case 'word_source':
        return {
          backgroundColor: '#475569',
          color: '#ffffff',
          borderColor: '#334155',
        };
      case 'pptx':
        return {
          backgroundColor: '#5b21b6',
          color: '#ffffff',
          borderColor: '#4c1d95',
        };
      case 'video':
        return {
          backgroundColor: '#0f766e',
          color: '#ffffff',
          borderColor: '#115e59',
        };
      case 'quiz':
        return {
          backgroundColor: '#be123c',
          color: '#ffffff',
          borderColor: '#9f1239',
        };
      case 'podcast_audio':
        return {
          backgroundColor: '#0369a1',
          color: '#ffffff',
          borderColor: '#075985',
        };
      case 'podcast_script':
        return {
          backgroundColor: '#92400e',
          color: '#ffffff',
          borderColor: '#78350f',
        };
      case 'learning_objectives':
        return {
          backgroundColor: '#15803d',
          color: '#ffffff',
          borderColor: '#166534',
        };
      case 'lesson_digest':
        return {
          backgroundColor: '#6d7f08',
          color: '#ffffff',
          borderColor: '#566606',
        };
      default:
        return undefined;
    }
  };

  const isArtifactAvailableForLanguage = (lang: LessonLanguageArtifactState, artifact: QuickArtifactType): boolean => {
    switch (artifact) {
      case 'source_db':
        return lang.hasSourceDb;
      case 'word_source':
        return lang.hasWordDoc;
      case 'pptx':
        return lang.hasPptx;
      case 'video':
        return lang.hasVideo;
      case 'quiz':
        return lang.hasQuiz;
      case 'podcast_audio':
        return lang.hasPodcast;
      case 'podcast_script':
        return lang.hasPodcastScript;
      case 'learning_objectives':
        return lang.hasObjectives;
      case 'lesson_digest':
        return lang.hasDigest || lang.hasStepGuide;
      default:
        return false;
    }
  };

  const getArtifactVersionCountForLanguage = (
    lessonData: LessonData,
    artifact: QuickArtifactType,
    lang: LessonLanguageArtifactState
  ): number | null => {
    const selectorData = artifactSelectorCache[getArtifactSelectorKey(lessonData, lang)];
    if (!selectorData) return null;

    switch (artifact) {
      case 'source_db':
      case 'word_source':
      case 'learning_objectives':
        return Math.max(1, selectorData.sourceContentVersions?.length || 0, (selectorData.lessonVersions?.length || 0) + 1);
      case 'pptx':
        return Math.max(1, (selectorData.presentationVersions?.length || 0) + 1);
      case 'quiz':
        return Math.max(1, selectorData.linkedQuizzes?.length || 0);
      case 'podcast_audio':
      case 'podcast_script':
        return Math.max(
          1,
          (selectorData.podcastVersions || []).filter(
            (v) => String(v.status || '').toLowerCase() === 'completed' || !v.status
          ).length
        );
      case 'lesson_digest':
        return Math.max(
          1,
          selectorData?.stepGuideVersions?.length || 0,
          selectorData?.sourceContentVersions?.length || 0,
          (selectorData?.lessonVersions?.length || 0) + 1
        );
      case 'video':
        return 1;
      default:
        return null;
    }
  };

  const getArtifactCoverageSummary = (lessonData: LessonData, artifact: QuickArtifactType): string => {
    const languageStates = getLanguageArtifactStates(lessonData).filter((lang) =>
      isArtifactAvailableForLanguage(lang, artifact)
    );
    if (languageStates.length === 0) return '';
    const summary = languageStates.slice(0, 3).map((lang) => {
      const versionCount = getArtifactVersionCountForLanguage(lessonData, artifact, lang);
      const staleFlag = lang.isStale ? '*' : '';
      return `${lang.code.toUpperCase()}${versionCount && versionCount > 1 ? ` v${versionCount}` : ''}${staleFlag}`;
    });
    if (languageStates.length > 3) summary.push(`+${languageStates.length - 3}`);
    return summary.join(', ');
  };

  const getQuickSelectionKey = (lessonId: string, artifact: QuickArtifactType, languageCode: string) =>
    `${lessonId}:${artifact}:${languageCode}`;

  const formatArtifactTimestamp = (raw?: string | null): string => {
    const value = String(raw || '').trim();
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  type QuickArtifactOption = {
    id: string;
    label: string;
    active?: boolean;
    action: 'open' | 'download';
    createdAt?: string | null;
    payload?: any;
  };

  type QuickArtifactContextAction = {
    id: 'open' | 'play' | 'download' | 'set_active' | 'replace' | 'edit';
    label: string;
    enabled: boolean;
    reason?: string;
    primary?: boolean;
    onClick: () => void;
  };

  const getArtifactOptionsForLanguage = (
    artifact: QuickArtifactType,
    lessonData: LessonData,
    lang: LessonLanguageArtifactState,
    selectorData: ArtifactSelectorData | undefined
  ): QuickArtifactOption[] => {
    const targetLessonId = lang.lessonId || lessonData.id;
    const resolvedPptxLessonId = String(selectorData?.resolvedPptxLessonId || targetLessonId);
    const resolvedQuizLessonId = String(selectorData?.resolvedQuizLessonId || targetLessonId);
    const resolvedPodcastLessonId = String(selectorData?.resolvedPodcastLessonId || targetLessonId);
    const resolvedStepGuideLessonId = String(selectorData?.resolvedStepGuideLessonId || targetLessonId);
    switch (artifact) {
      case 'source_db': {
        if (!lang.hasSourceDb) return [];
        const versions = selectorData?.sourceContentVersions || [];
        const sourceVersions = versions.length > 0
          ? versions
          : [{ id: 'current', versionNumber: 1, changeDescription: 'Current source content', isCurrentState: true } as ArtifactSelectorContentVersion];
        const options: QuickArtifactOption[] = [];
        sourceVersions.slice(0, 16).forEach((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          const isCurrent = v.isCurrentState || v.id === 'current';
          const isInitial = v.isSyntheticInitial || v.id === 'initial';
          const labelBase = isCurrent
            ? 'Current source content'
            : isInitial
              ? 'Initial source content'
              : (v.changeDescription || `Version ${v.versionNumber}`);
          options.push({
            id: String(v.id),
            label: `${labelBase}${isCurrent ? ' (Active)' : ''}${createdAt ? ` • ${createdAt}` : ''}`,
            active: isCurrent,
            action: 'open',
            createdAt: v.createdAt || null,
            payload: { lessonId: targetLessonId, docVersionId: String(v.id), createdAt: v.createdAt || null },
          });
        });
        return options;
      }
      case 'word_source': {
        if (!lang.hasWordDoc) return [];
        const versions = selectorData?.sourceContentVersions || [];
        if (versions.length === 0) {
          return [{ id: 'current', label: 'Current Word source (Active)', active: true, action: 'open', payload: { lessonId: targetLessonId, docVersionId: 'current' } }];
        }
        return versions.slice(0, 16).map((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          const isCurrent = v.isCurrentState || v.id === 'current';
          const isInitial = v.isSyntheticInitial || v.id === 'initial';
          const labelBase = isCurrent
            ? 'Current Word source'
            : isInitial
              ? 'Initial Word source'
              : (v.changeDescription || `Version ${v.versionNumber}`);
          return {
            id: String(v.id),
            label: `${labelBase}${isCurrent ? ' (Active)' : ''}${createdAt ? ` • ${createdAt}` : ''}`,
            active: isCurrent,
            action: 'open' as const,
            createdAt: v.createdAt || null,
            payload: { lessonId: targetLessonId, docVersionId: String(v.id), createdAt: v.createdAt || null },
          };
        });
      }
      case 'pptx': {
        if (!lang.hasPptx && (selectorData?.presentationVersions || []).length === 0) return [];
        const currentVersion = selectorData?.currentPresentationVersion;
        const versions = selectorData?.presentationVersions || [];
        const options: QuickArtifactOption[] = [{ id: 'active', label: 'Active presentation', active: true, action: 'open', payload: { lessonId: resolvedPptxLessonId } }];
        versions.filter((v) => v.version !== currentVersion).slice(0, 12).forEach((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          options.push({
            id: v.id,
            label: `Version ${v.version}${createdAt ? ` • ${createdAt}` : ''}`,
            action: 'download',
            createdAt: v.createdAt || null,
            payload: { lessonId: resolvedPptxLessonId, versionId: v.id, versionNumber: v.version, createdAt: v.createdAt || null },
          });
        });
        return options;
      }
      case 'video':
        return lang.hasVideo ? [{ id: 'active', label: 'Active video', active: true, action: 'open', payload: { lessonId: targetLessonId } }] : [];
      case 'quiz': {
        if (!lang.hasQuiz && (selectorData?.linkedQuizzes || []).length === 0 && (!Array.isArray(lang.quizIds) || lang.quizIds.length === 0)) return [];
        const selectorQuizzes = selectorData?.linkedQuizzes || [];
        const fallbackQuizIds = Array.isArray(lang.quizIds)
          ? Array.from(new Set(lang.quizIds.map((quizId) => String(quizId || '').trim()).filter(Boolean)))
          : [];
        const quizzes = selectorQuizzes.length > 0
          ? selectorQuizzes
          : fallbackQuizIds.map((quizId, idx) => ({
              id: `${quizId}-${idx}`,
              quizId,
              isPrimary: idx === 0,
              createdAt: undefined as string | undefined,
            }));
        const primary = quizzes.find((q) => q.isPrimary) || quizzes[0];
        const options: QuickArtifactOption[] = primary
          ? [{
              id: primary.quizId,
              label: `Active quiz${formatArtifactTimestamp(primary.createdAt) ? ` • ${formatArtifactTimestamp(primary.createdAt)}` : ''}`,
              active: true,
              action: 'open',
              createdAt: primary.createdAt || null,
              payload: { lessonId: resolvedQuizLessonId, quizId: primary.quizId, createdAt: primary.createdAt || null },
            }]
          : [];
        quizzes.filter((q) => q.quizId !== primary?.quizId).slice(0, 12).forEach((q, idx) => {
          const createdAt = formatArtifactTimestamp(q.createdAt);
          options.push({
            id: `${q.quizId}-${idx}`,
            label: `Quiz ${String(q.quizId).slice(0, 8)}${createdAt ? ` • ${createdAt}` : ''}`,
            action: 'open',
            createdAt: q.createdAt || null,
            payload: { lessonId: resolvedQuizLessonId, quizId: q.quizId, createdAt: q.createdAt || null },
          });
        });
        return options;
      }
      case 'podcast_audio': {
        if (!lang.hasPodcast && (selectorData?.podcastVersions || []).length === 0) return [];
        const resolvedPodcastLanguageCode = String(selectorData?.resolvedPodcastLanguageCode || lang.code || '').trim().toLowerCase();
        const selectorVersions = (selectorData?.podcastVersions || [])
          .filter((v) => String(v.status || '').toLowerCase() === 'completed' || !v.status)
          .filter((v) => String(v.languageCode || '').trim().toLowerCase() === resolvedPodcastLanguageCode);
        const metadataVersions = Array.isArray((lessonData as any)?.metadata?.podcast?.versions)
          ? ((lessonData as any).metadata.podcast.versions as any[])
              .filter((v) => String(v?.status || '').toLowerCase() === 'completed')
              .filter((v) => String(v?.languageCode || '').trim().toLowerCase() === resolvedPodcastLanguageCode)
              .map((v) => ({
                id: String(v?.id || ''),
                title: v?.title ? String(v.title) : undefined,
                createdAt: v?.createdAt ? String(v.createdAt) : undefined,
                languageCode: v?.languageCode ? String(v.languageCode) : undefined,
                status: v?.status ? String(v.status) : undefined,
                scriptId: v?.scriptId ? String(v.scriptId) : undefined,
              }))
              .filter((v) => !!v.id)
          : [];
        const versions = selectorVersions.length > 0 ? selectorVersions : metadataVersions;
        const activeId = selectorData?.activePodcastVersionId || lang.activePodcastVersionId || versions[0]?.id || null;
        const active = versions.find((v) => v.id === activeId) || versions[0];
        const options: QuickArtifactOption[] = active
          ? [{
              id: active.id,
              label: `Active audio${formatArtifactTimestamp(active.createdAt) ? ` • ${formatArtifactTimestamp(active.createdAt)}` : ''}`,
              active: true,
              action: 'open',
              createdAt: active.createdAt || null,
              payload: { lessonId: resolvedPodcastLessonId, podcastVersionId: active.id, scriptId: active.scriptId, createdAt: active.createdAt || null },
            }]
          : [];
        versions.filter((v) => v.id !== active?.id).slice(0, 12).forEach((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          options.push({
            id: v.id,
            label: `${v.title || `Version ${v.id.slice(0, 8)}`}${createdAt ? ` • ${createdAt}` : ''}`,
            action: 'open',
            createdAt: v.createdAt || null,
            payload: { lessonId: resolvedPodcastLessonId, podcastVersionId: v.id, scriptId: v.scriptId, createdAt: v.createdAt || null },
          });
        });
        return options;
      }
      case 'podcast_script': {
        if (!lang.hasPodcastScript && (selectorData?.podcastVersions || []).length === 0) return [];
        const resolvedPodcastLanguageCode = String(selectorData?.resolvedPodcastLanguageCode || lang.code || '').trim().toLowerCase();
        const selectorVersions = (selectorData?.podcastVersions || [])
          .filter((v) => String(v.status || '').toLowerCase() === 'completed' || !v.status)
          .filter((v) => String(v.languageCode || '').trim().toLowerCase() === resolvedPodcastLanguageCode)
          .filter((v) => !!String(v.scriptId || '').trim());
        const metadataVersions = Array.isArray((lessonData as any)?.metadata?.podcast?.versions)
          ? ((lessonData as any).metadata.podcast.versions as any[])
              .filter((v) => String(v?.status || '').toLowerCase() === 'completed')
              .filter((v) => String(v?.languageCode || '').trim().toLowerCase() === resolvedPodcastLanguageCode)
              .filter((v) => !!String(v?.scriptId || '').trim())
              .map((v) => ({
                id: String(v?.id || ''),
                title: v?.title ? String(v.title) : undefined,
                createdAt: v?.createdAt ? String(v.createdAt) : undefined,
                languageCode: v?.languageCode ? String(v.languageCode) : undefined,
                status: v?.status ? String(v.status) : undefined,
                scriptId: v?.scriptId ? String(v.scriptId) : undefined,
              }))
              .filter((v) => !!v.id)
          : [];
        const versions = selectorVersions.length > 0 ? selectorVersions : metadataVersions;
        const activeId = selectorData?.activePodcastVersionId || lang.activePodcastVersionId || versions[0]?.id || null;
        const active = versions.find((v) => v.id === activeId) || versions.find((v) => !!String(v.scriptId || '').trim()) || versions[0];
        const options: QuickArtifactOption[] = active
          ? [{
              id: active.id,
              label: `Active script${formatArtifactTimestamp(active.createdAt) ? ` • ${formatArtifactTimestamp(active.createdAt)}` : ''}`,
              active: true,
              action: 'open',
              createdAt: active.createdAt || null,
              payload: { lessonId: resolvedPodcastLessonId, podcastVersionId: active.id, scriptId: active.scriptId, createdAt: active.createdAt || null },
            }]
          : [];
        versions.filter((v) => v.id !== active?.id).slice(0, 12).forEach((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          options.push({
            id: v.id,
            label: `${(v.title || `Version ${v.id.slice(0, 8)}`) + " script"}${createdAt ? ` • ${createdAt}` : ''}`,
            action: 'open',
            createdAt: v.createdAt || null,
            payload: { lessonId: resolvedPodcastLessonId, podcastVersionId: v.id, scriptId: v.scriptId, createdAt: v.createdAt || null },
          });
        });
        return options;
      }
      case 'learning_objectives': {
        const fallbackHasObjectivesForSelectedLesson =
          String(targetLessonId) === String(lessonData.id) &&
          Array.isArray(lessonData.learningObjectives) &&
          lessonData.learningObjectives.length > 0;
        if (!(lang.hasObjectives || fallbackHasObjectivesForSelectedLesson)) return [];
        const versions = selectorData?.lessonVersions || [];
        const options: QuickArtifactOption[] = [
          { id: 'current', label: 'Current objectives', active: true, action: 'open', payload: { lessonId: targetLessonId, docVersionId: 'current' } }
        ];
        versions.filter((v) => !v.isCurrentState && !!v.id).slice(0, 12).forEach((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          options.push({
            id: String(v.id),
            label: `Version ${v.versionNumber}${createdAt ? ` • ${createdAt}` : ''}`,
            action: 'open',
            createdAt: v.createdAt || null,
            payload: { lessonId: targetLessonId, docVersionId: String(v.id), createdAt: v.createdAt || null },
          });
        });
        return options;
      }
      case 'lesson_digest': {
        if (!(lang.hasDigest || lang.hasStepGuide) && (selectorData?.stepGuideVersions || []).length === 0 && (selectorData?.lessonVersions || []).length === 0) return [];
        const versions = selectorData?.lessonVersions || [];
        const options: QuickArtifactOption[] = [
          {
            id: 'current',
            label: 'Active digest',
            active: true,
            action: 'open',
            payload: {
              lessonId: resolvedStepGuideLessonId,
              digestVersionId: null,
              stepGuideVersionId: selectorData?.activeStepGuideVersionId || lang.activeStepGuideVersionId || null,
            },
          }
        ];
        const guideVersions = selectorData?.stepGuideVersions || [];
        guideVersions
          .filter((version) => !!version.id)
          .slice(0, 12)
          .forEach((version) => {
            const createdAt = formatArtifactTimestamp(version.createdAt);
            const isActiveGuide = String(version.id) === String(selectorData?.activeStepGuideVersionId || lang.activeStepGuideVersionId || '');
            options.push({
              id: `guide-${version.id}`,
              label: `${isActiveGuide ? 'Guide (Active)' : 'Guide'}${version.stepCount ? ` • ${version.stepCount} steps` : ''}${createdAt ? ` • ${createdAt}` : ''}`,
              action: 'open',
              active: isActiveGuide,
              createdAt: version.createdAt || null,
              payload: {
                lessonId: resolvedStepGuideLessonId,
                digestVersionId: null,
                stepGuideVersionId: version.id,
              },
            });
          });
        versions.filter((v) => !v.isCurrentState && !!v.id).slice(0, 12).forEach((v) => {
          const createdAt = formatArtifactTimestamp(v.createdAt);
          options.push({
            id: String(v.id),
            label: `Digest from version ${v.versionNumber}${createdAt ? ` • ${createdAt}` : ''}`,
            action: 'open',
            createdAt: v.createdAt || null,
            payload: { lessonId: resolvedStepGuideLessonId, digestVersionId: String(v.id), createdAt: v.createdAt || null },
          });
        });
        return options;
      }
      default:
        return [];
    }
  };

  const executeQuickArtifactSelection = (
    artifact: QuickArtifactType,
    lessonData: LessonData,
    lang: LessonLanguageArtifactState,
    option: QuickArtifactOption
  ) => {
    const payload = option.payload || {};
    const targetLangLessonId = payload.lessonId || lang.lessonId || lessonData.id;
    if (artifact === 'pptx' && option.action === 'download' && payload.versionId) {
      void downloadPresentationVersionFromSelector(payload.lessonId || lessonData.id, payload.versionId, payload.versionNumber || 0);
      return;
    }
    if (artifact === 'quiz' && payload.quizId) {
      openLessonQuizById(lessonData, lang, payload.quizId, targetLangLessonId);
      return;
    }
    if (artifact === 'podcast_script') {
      const selectedScriptId = String(payload.scriptId || '').trim();
      if (selectedScriptId) {
        setLocation(buildPodcastWizardUrl(
          payload.lessonId || lessonData.id,
          getLessonByIdOrFallback(payload.lessonId || lessonData.id, lessonData),
          { scriptId: selectedScriptId }
        ));
        setQuickArtifactDrawerOpen(false);
        return;
      }
      downloadPodcastScriptFromSelector(payload.lessonId || lessonData.id, lang.code, payload.podcastVersionId || null);
      return;
    }
    if (artifact === 'podcast_audio') {
      openLessonArtifact(lessonData, lang, 'podcast', { podcastVersionId: payload.podcastVersionId || null, targetLessonId: targetLangLessonId });
      return;
    }
    if (artifact === 'pptx') {
      openLessonArtifact(lessonData, lang, 'pptx', { targetLessonId: targetLangLessonId });
      return;
    }
    if (artifact === 'video') {
      openLessonArtifact(lessonData, lang, 'video', { targetLessonId: targetLangLessonId });
      return;
    }
    if (artifact === 'learning_objectives') {
      const targetTopic = getTopicForLesson(targetLangLessonId) || getTopicForLesson(lessonData.id);
      if (targetTopic) {
        openObjectivesEditor(targetTopic, targetLangLessonId, getLessonByIdOrFallback(targetLangLessonId, lessonData));
        setQuickArtifactDrawerOpen(false);
        return;
      }
      if (payload.docVersionId && payload.docVersionId !== 'current') {
        setLocation(buildContentStudioUrl(targetLangLessonId, {
          langLessonId: targetLangLessonId,
          docVersionId: payload.docVersionId,
          focus: 'objectives',
        }));
      } else {
        setLocation(buildContentStudioUrl(targetLangLessonId, {
          langLessonId: targetLangLessonId,
          focus: 'objectives',
        }));
      }
      return;
    }
    if (artifact === 'lesson_digest') {
      const selectorData = artifactSelectorCache[getArtifactSelectorKey(lessonData, lang)];
      openLessonArtifact(lessonData, lang, 'digest', {
        digestVersionId: payload.digestVersionId || null,
        stepGuideVersionId: payload.stepGuideVersionId || selectorData?.activeStepGuideVersionId || lang.activeStepGuideVersionId || null,
        targetLessonId: targetLangLessonId,
      });
      return;
    }
    if (artifact === 'source_db' || artifact === 'word_source') {
      setLocation(buildContentStudioUrl(targetLangLessonId, {
        langLessonId: targetLangLessonId,
        docVersionId: payload.docVersionId || 'current',
        focus: artifact === 'word_source' ? 'word' : 'source',
      }));
      return;
    }
  };

  const getLessonByIdOrFallback = (lessonId: string, fallback: LessonData): LessonData =>
    lessonsData?.[lessonId] || fallback;

  const getTopicOrderForLesson = (lessonId: string, fallbackOrder: number): number => {
    const topic = (framework?.topics || []).find((entry) => entry.lessonId === lessonId);
    return Number.isFinite(Number(topic?.order)) ? Number(topic?.order) : fallbackOrder;
  };

  const getTopicForLesson = (lessonId: string): Topic | null =>
    (framework?.topics || []).find((entry) => String(entry.lessonId || '') === String(lessonId)) || null;

  const downloadActiveLessonPptx = async (lessonId: string) => {
    if (!organizationId) {
      toast({
        title: 'Organization required',
        description: 'Unable to resolve organization context for this download.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const data = await apiRequest(
        `/api/lessons/${lessonId}/download?organizationId=${encodeURIComponent(String(organizationId))}`,
        { method: 'GET' }
      );
      const downloadUrl = String((data as any)?.downloadUrl || '').trim();
      if (!downloadUrl) throw new Error('No download URL returned');
      if (!isValidDownloadUrl(downloadUrl)) {
        throw new Error('Invalid download URL returned');
      }
      const lessonTitle = lessonsData?.[lessonId]?.title || 'lesson';
      const filename = String((data as any)?.filename || '').trim() || generatePptxFilename(lessonTitle);
      const success = await safeDownload(downloadUrl, filename, (message) => {
        throw new Error(message);
      });
      if (!success) {
        throw new Error('Unable to download selected PPTX artifact.');
      }
      toast({ title: 'Download started', description: 'PPTX download started.' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.message || 'Unable to download selected PPTX artifact.',
        variant: 'destructive',
      });
    }
  };

  const downloadLessonVideoFromSelector = async (lessonId: string) => {
    if (!organizationId) {
      toast({
        title: 'Organization required',
        description: 'Unable to resolve organization context for this download.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const data = await apiRequest(
        `/api/lessons/${lessonId}/download-video?organizationId=${encodeURIComponent(String(organizationId))}`,
        { method: 'GET' }
      );
      const downloadUrl = String((data as any)?.downloadUrl || '').trim();
      if (!downloadUrl) throw new Error('No download URL returned');
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      toast({ title: 'Download started', description: 'Video download started.' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.message || 'Unable to download selected video artifact.',
        variant: 'destructive',
      });
    }
  };

  const downloadLessonSourceDocumentFromSelector = async (lessonId: string) => {
    if (!organizationId) {
      toast({
        title: 'Organization required',
        description: 'Unable to resolve organization context for this download.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const data = await apiRequest(
        `/api/lessons/${lessonId}/download-source-document?organizationId=${encodeURIComponent(String(organizationId))}`,
        { method: 'GET' }
      );
      const downloadUrl = String((data as any)?.downloadUrl || '').trim();
      if (!downloadUrl) throw new Error('No download URL returned');
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      toast({ title: 'Download started', description: 'Source document download started.' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.message || 'Unable to download source document.',
        variant: 'destructive',
      });
    }
  };

  const downloadLessonPodcastFromSelector = (lessonId: string, langCode: string, versionId?: string | null) => {
    const params = new URLSearchParams();
    if (organizationId) params.set('organizationId', String(organizationId));
    if (langCode) params.set('languageCode', langCode);
    if (versionId) params.set('versionId', String(versionId));
    const query = params.toString();
    window.open(`/api/lessons/${lessonId}/podcast/download${query ? `?${query}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  const setPodcastActiveVersionFromSelector = async (lessonId: string, versionId: string) => {
    try {
      await apiRequest(`/api/lessons/${lessonId}/podcast/active-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      toast({
        title: 'Active version updated',
        description: 'Selected podcast version is now active.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
      setArtifactSelectorCache({});
      if (quickArtifactContext) {
        const sourceLesson = lessonsData?.[quickArtifactContext.lessonId];
        if (sourceLesson) {
          await ensureArtifactDataForLesson(sourceLesson);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Set active failed',
        description: error?.message || 'Unable to set active podcast version.',
        variant: 'destructive',
      });
    }
  };

  const setQuizPrimaryFromSelector = async (lessonId: string, quizId: string) => {
    try {
      await apiRequest(`/api/lessons/${lessonId}/linked-quizzes/${quizId}/set-primary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      toast({
        title: 'Active quiz updated',
        description: 'Selected quiz is now the primary quiz for this lesson.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'linked-quizzes'] });
      setArtifactSelectorCache({});
      if (quickArtifactContext) {
        const sourceLesson = lessonsData?.[quickArtifactContext.lessonId];
        if (sourceLesson) {
          await ensureArtifactDataForLesson(sourceLesson);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Set active failed',
        description: error?.message || 'Unable to set selected quiz as active.',
        variant: 'destructive',
      });
    }
  };

  const setLessonVersionActiveFromSelector = async (lessonId: string, versionId: string) => {
    try {
      await apiRequest(`/api/lessons/${lessonId}/versions/${versionId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      toast({
        title: 'Version restored',
        description: 'Selected lesson version is now active.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
      setArtifactSelectorCache({});
      if (quickArtifactContext) {
        const sourceLesson = lessonsData?.[quickArtifactContext.lessonId];
        if (sourceLesson) {
          await ensureArtifactDataForLesson(sourceLesson);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Set active failed',
        description: error?.message || 'Unable to activate selected version.',
        variant: 'destructive',
      });
    }
  };

  const setSourceContentCurrentVersionFromSelector = async (lessonId: string, versionId: string) => {
    if (!organizationId) {
      toast({
        title: 'Organization required',
        description: 'Unable to resolve organization context for this version change.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await apiRequest(`/api/lessons/${lessonId}/source-document/set-current-version?organizationId=${encodeURIComponent(String(organizationId))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      toast({
        title: 'Current source updated',
        description: 'Selected source version is now active.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'content-versions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
      setArtifactSelectorCache({});
      if (quickArtifactContext) {
        const sourceLesson = lessonsData?.[quickArtifactContext.lessonId];
        if (sourceLesson) {
          await ensureArtifactDataForLesson(sourceLesson);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Set active failed',
        description: error?.message || 'Unable to activate selected source version.',
        variant: 'destructive',
      });
    }
  };

  const setPresentationActiveVersionFromSelector = async (lessonId: string, versionId: string) => {
    try {
      await apiRequest(`/api/lessons/${lessonId}/presentation-versions/${versionId}/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      toast({
        title: 'Presentation version activated',
        description: 'Selected presentation version is now active.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/lessons/${lessonId}/presentation-versions`);
        }
      });
      setArtifactSelectorCache({});
      if (quickArtifactContext) {
        const sourceLesson = lessonsData?.[quickArtifactContext.lessonId];
        if (sourceLesson) {
          await ensureArtifactDataForLesson(sourceLesson);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Set active failed',
        description: error?.message || 'Unable to activate selected presentation version.',
        variant: 'destructive',
      });
    }
  };

  const setStepGuideActiveVersionFromSelector = async (lessonId: string, languageCode: string, versionId: string) => {
    try {
      await apiRequest(`/api/lessons/${lessonId}/step-guide/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, languageCode }),
      });
      toast({
        title: 'Guide version activated',
        description: 'Selected step-by-step guide is now active for this language.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'viewer'] });
      setArtifactSelectorCache({});
      if (quickArtifactContext) {
        const sourceLesson = lessonsData?.[quickArtifactContext.lessonId];
        if (sourceLesson) {
          await ensureArtifactDataForLesson(sourceLesson);
        }
      }
    } catch (error: any) {
      toast({
        title: 'Set active failed',
        description: error?.message || 'Unable to activate selected step-by-step guide.',
        variant: 'destructive',
      });
    }
  };

  const getQuickArtifactActionsForSelection = (
    artifact: QuickArtifactType,
    lessonData: LessonData,
    lang: LessonLanguageArtifactState,
    option: QuickArtifactOption
  ): QuickArtifactContextAction[] => {
    const payload = option.payload || {};
    const targetLessonId = String(payload.lessonId || lang.lessonId || lessonData.id);
    const artifactSourceLessonId = String(payload.lessonId || targetLessonId);
    const selectedLesson = getLessonByIdOrFallback(targetLessonId, lessonData);
    const selectedTopicOrder = getTopicOrderForLesson(lessonData.id, (framework?.topics || []).find((t) => t.lessonId === lessonData.id)?.order || 1);
    const selectedQuizId = String(payload.quizId || '').trim();
    const selectedPodcastVersionId = String(payload.podcastVersionId || '').trim();
    const selectedPodcastScriptId = String(payload.scriptId || '').trim();
    const selectedDocVersionId = String(payload.docVersionId || '').trim();
    const selectedDigestVersionId = String(payload.digestVersionId || '').trim();
    const selectedStepGuideVersionIdFromOption = String(payload.stepGuideVersionId || '').trim();
    const selectedPresentationVersionId = String(payload.versionId || '').trim();
    const selectorData = artifactSelectorCache[getArtifactSelectorKey(lessonData, lang)];
    const selectedStepGuideVersionId = String(
      payload.stepGuideVersionId ||
      selectorData?.activeStepGuideVersionId ||
      lang.activeStepGuideVersionId ||
      ''
    ).trim();

    const primaryLabel = (artifact === 'podcast_audio' || artifact === 'video' || artifact === 'quiz') ? 'Play' : 'Open';
    const actions: QuickArtifactContextAction[] = [
      {
        id: artifact === 'podcast_audio' || artifact === 'video' || artifact === 'quiz' ? 'play' : 'open',
        label: primaryLabel,
        enabled: true,
        primary: true,
        onClick: () => executeQuickArtifactSelection(artifact, lessonData, lang, option),
      }
    ];

    const downloadAction: QuickArtifactContextAction = {
      id: 'download',
      label: 'Download',
      enabled: true,
      onClick: () => {
        if (option.action === 'download') {
          executeQuickArtifactSelection(artifact, lessonData, lang, option);
          return;
        }
        if (artifact === 'pptx') {
          void downloadActiveLessonPptx(artifactSourceLessonId);
          return;
        }
        if (artifact === 'video') {
          void downloadLessonVideoFromSelector(artifactSourceLessonId);
          return;
        }
        if (artifact === 'podcast_audio') {
          downloadLessonPodcastFromSelector(artifactSourceLessonId, lang.code, selectedPodcastVersionId || null);
          return;
        }
        if (artifact === 'podcast_script') {
          downloadPodcastScriptFromSelector(artifactSourceLessonId, lang.code, selectedPodcastVersionId || null);
          return;
        }
        if (artifact === 'word_source') {
          void downloadLessonSourceDocumentFromSelector(targetLessonId);
          return;
        }
      },
    };

    if (artifact === 'learning_objectives' || artifact === 'lesson_digest' || artifact === 'quiz' || artifact === 'source_db') {
      downloadAction.enabled = false;
      downloadAction.reason = artifact === 'source_db'
        ? 'Download is only available for uploaded Word source documents.'
        : 'Download is not available for this artifact type.';
      downloadAction.onClick = () => {};
    }
    actions.push(downloadAction);

    const setActiveAction: QuickArtifactContextAction = {
      id: 'set_active',
      label: 'Set Active',
      enabled: false,
      reason: 'Set active is not supported for this artifact.',
      onClick: () => {},
    };

    if (artifact === 'podcast_audio' || artifact === 'podcast_script') {
      if (selectedPodcastVersionId) {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => { void setPodcastActiveVersionFromSelector(targetLessonId, selectedPodcastVersionId); };
      } else {
        setActiveAction.reason = 'Select a podcast version first.';
      }
    } else if (artifact === 'quiz') {
      if (selectedQuizId) {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => { void setQuizPrimaryFromSelector(targetLessonId, selectedQuizId); };
      } else {
        setActiveAction.reason = 'Select a quiz version first.';
      }
    } else if (artifact === 'lesson_digest') {
      if (selectedStepGuideVersionIdFromOption) {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => {
          void setStepGuideActiveVersionFromSelector(targetLessonId, lang.code, selectedStepGuideVersionIdFromOption);
        };
      } else if (selectedDigestVersionId) {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => { void setLessonVersionActiveFromSelector(targetLessonId, selectedDigestVersionId); };
      } else {
        setActiveAction.reason = 'Choose a guide or digest version to activate.';
      }
    } else if (artifact === 'source_db' || artifact === 'learning_objectives') {
      if (selectedDocVersionId && selectedDocVersionId !== 'current') {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => { void setSourceContentCurrentVersionFromSelector(targetLessonId, selectedDocVersionId); };
      } else {
        setActiveAction.reason = 'Choose a non-current version to activate.';
      }
    } else if (artifact === 'word_source') {
      if (selectedDocVersionId && selectedDocVersionId !== 'current') {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => { void setSourceContentCurrentVersionFromSelector(targetLessonId, selectedDocVersionId); };
      } else {
        setActiveAction.reason = 'Choose a non-current Word/source version to activate.';
      }
    } else if (artifact === 'pptx') {
      if (selectedPresentationVersionId) {
        setActiveAction.enabled = true;
        setActiveAction.reason = undefined;
        setActiveAction.onClick = () => { void setPresentationActiveVersionFromSelector(targetLessonId, selectedPresentationVersionId); };
      } else {
        setActiveAction.reason = 'The active presentation is already selected.';
      }
    }
    actions.push(setActiveAction);

    const replaceAction: QuickArtifactContextAction = {
      id: 'replace',
      label: artifact === 'lesson_digest' ? 'Upload Guide' : 'New Version',
      enabled: true,
      onClick: () => {
        if (artifact === 'pptx') {
          setLocation(buildPptxUploadUrl(targetLessonId, selectedTopicOrder));
          return;
        }
        if (artifact === 'video') {
          openLessonArtifact(lessonData, lang, 'video', { targetLessonId });
          return;
        }
        if (artifact === 'podcast_audio' || artifact === 'podcast_script') {
          setLocation(buildPodcastWizardUrl(
            targetLessonId,
            selectedLesson,
            artifact === 'podcast_script' && selectedPodcastScriptId
              ? { scriptId: selectedPodcastScriptId }
              : undefined
          ));
          return;
        }
        if (artifact === 'quiz') {
          setLocation(buildQuizWizardUrl(targetLessonId));
          return;
        }
        if (artifact === 'learning_objectives') {
          const targetTopic = getTopicForLesson(targetLessonId) || getTopicForLesson(lessonData.id);
          if (targetTopic) {
            openObjectivesEditor(targetTopic, targetLessonId, selectedLesson);
            setQuickArtifactDrawerOpen(false);
            return;
          }
          setLocation(buildContentStudioUrl(targetLessonId, {
            langLessonId: targetLessonId,
            focus: 'objectives',
          }));
          return;
        }
        if (artifact === 'lesson_digest') {
          requestStepGuideUpload(lessonData.id, targetLessonId, lang.code);
          return;
        }
        setLocation(buildContentStudioUrl(targetLessonId, {
          langLessonId: targetLessonId,
          docVersionId: selectedDocVersionId || 'current',
          focus: artifact === 'word_source' ? 'word' : 'source',
        }));
      },
    };
    actions.push(replaceAction);

    const editAction: QuickArtifactContextAction = {
      id: 'edit',
      label: 'Edit',
      enabled: true,
      onClick: () => {
        if (artifact === 'quiz') {
          if (selectedQuizId) {
            const returnParams = courseId
              ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${encodeURIComponent(String(courseId))}`
              : '';
            setLocation(`/quiz-card-manager?quizId=${encodeURIComponent(selectedQuizId)}&mode=edit${returnParams}`);
            return;
          }
          setLocation(buildQuizWizardUrl(targetLessonId));
          return;
        }
        if (artifact === 'podcast_audio' || artifact === 'podcast_script') {
          setLocation(buildPodcastWizardUrl(
            targetLessonId,
            selectedLesson,
            artifact === 'podcast_script' && selectedPodcastScriptId
              ? { scriptId: selectedPodcastScriptId }
              : undefined
          ));
          return;
        }
        if (artifact === 'pptx') {
          openLessonArtifact(lessonData, lang, 'pptx', { targetLessonId });
          return;
        }
        if (artifact === 'video') {
          openLessonArtifact(lessonData, lang, 'video', { targetLessonId });
          return;
        }
        if (artifact === 'lesson_digest') {
          openLessonArtifact(lessonData, lang, 'digest', {
            digestVersionId: payload.digestVersionId || null,
            stepGuideVersionId: selectedStepGuideVersionId || null,
            targetLessonId,
          });
          return;
        }
        if (artifact === 'learning_objectives') {
          const targetTopic = getTopicForLesson(targetLessonId) || getTopicForLesson(lessonData.id);
          if (targetTopic) {
            openObjectivesEditor(targetTopic, targetLessonId, selectedLesson);
            setQuickArtifactDrawerOpen(false);
            return;
          }
          setLocation(buildContentStudioUrl(targetLessonId, {
            langLessonId: targetLessonId,
            docVersionId: selectedDocVersionId || 'current',
            focus: 'objectives',
          }));
          return;
        }
        setLocation(buildContentStudioUrl(targetLessonId, {
          langLessonId: targetLessonId,
          docVersionId: selectedDocVersionId || 'current',
          focus: artifact === 'word_source' ? 'word' : 'source',
        }));
      },
    };
    actions.push(editAction);

    return actions;
  };

  const renderLessonArtifactBadges = (lessonData: LessonData | undefined | null) => {
    if (!lessonData) return null;
    const badges = getAvailableArtifactBadges(lessonData);
    if (!badges.length) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {badges.map((badge) => {
          const summary = getArtifactCoverageSummary(lessonData, badge.key);
          return (
            <Button key={`${lessonData.id}-${badge.key}`} variant="outline" size="sm" className={`h-6 px-2 text-[10px] ${getArtifactBadgeToneClasses(badge.key)}`} style={getArtifactBadgeToneStyle(badge.key)} onClick={() => { void openQuickArtifactDrawer(lessonData, badge.key); }}
              title={summary ? `${badge.label}: ${summary}` : badge.label}
            >
              {badge.icon}
              {badge.label}
              {summary && (
                <span className="ml-1 text-[9px] opacity-80 truncate max-w-[140px]">
                  {summary}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    );
  };

  const executeLessonActionItem = (item: LessonActionItem, topic: Topic, lessonData: LessonData) => {
    switch (item.id) {
      case 'content-digest':
      case 'takeaways-digest':
      case 'overview-digest':
        void (async () => {
          const pendingKey = getLessonActionPendingKey(lessonData.id, item.id);
          setPendingLessonActions((prev) => ({ ...prev, [pendingKey]: true }));
          try {
            await apiRequest(`/api/lessons/${lessonData.id}/digest/regenerate`, { method: 'POST' });
            toast({ title: 'Lesson digest generated', description: 'Guided lesson text is ready.' });
            queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
            queryClient.invalidateQueries({ queryKey: ['/api/lessons/batch-languages'] });
            queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonData.id] });
            queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonData.id, 'viewer'] });
          } catch (error: any) {
            queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
            toast({
              title: 'Digest generation failed',
              description: error?.message || 'Unable to generate lesson digest right now.',
              variant: 'destructive',
            });
          } finally {
            setPendingLessonActions((prev) => {
              if (!prev[pendingKey]) return prev;
              const next = { ...prev };
              delete next[pendingKey];
              return next;
            });
          }
        })();
        return;
      case 'content-source':
      case 'content-improve':
        setLocation(buildContentStudioUrl(lessonData.id));
        return;
      case 'content-feedback':
        setLocation(buildContentStudioUrl(lessonData.id, { autoFeedback: true }));
        return;
      case 'content-pptx':
      case 'overview-pptx':
      case 'takeaways-pptx':
        setPptxActionContext({
          lessonId: lessonData.id,
          lessonTitle: lessonData.title || topic.name,
          topicOrder: topic.order,
          topicId: topic.id,
          topicName: topic.name,
        });
        return;
      case 'content-quiz':
      case 'takeaways-quiz':
        setLocation(buildQuizWizardUrl(lessonData.id));
        return;
      case 'content-objectives':
      case 'overview-objectives':
      case 'takeaways-objectives':
        openObjectivesEditor(topic, lessonData.id, lessonData);
        return;
      case 'content-podcast':
      case 'overview-podcast':
      case 'takeaways-podcast':
        setLocation(buildPodcastWizardUrl(lessonData.id, lessonData));
        return;
      case 'content-translate':
      case 'overview-translate':
      case 'takeaways-translate':
        setLocation(`/course-builder/${courseId}/lessons/${lessonData.id}/translate`);
        return;
      case 'overview-content':
        if (generationReadiness?.overview?.ready) {
          generateOverviewMutation.mutate();
        } else {
          toast({ title: 'Prerequisites pending', description: 'Complete prerequisites before generating overview.' });
        }
        return;
      case 'takeaways-content':
        if (generationReadiness?.takeaways?.ready) {
          generateTakeawaysMutation.mutate();
        } else {
          toast({ title: 'Prerequisites pending', description: 'Complete prerequisites before generating key takeaways.' });
        }
        return;
      case 'content-video':
      case 'overview-video':
      case 'takeaways-video':
        setLocation(`/lessons/${lessonData.id}${courseId ? `?returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : ''}`);
        return;
      default:
        setLocation(buildLessonWizardUrl(lessonData.id, topic, lessonData.title || topic.name));
    }
  };

  const getLessonActionButtonLabel = (item: LessonActionItem): string => {
    switch (item.id) {
      case 'content-digest':
      case 'takeaways-digest':
      case 'overview-digest':
        return 'Generate Digest';
      case 'content-feedback':
        return 'Get Feedback';
      case 'content-pptx':
      case 'overview-pptx':
      case 'takeaways-pptx':
        return 'Generate/Upload PPTX';
      case 'content-quiz':
      case 'takeaways-quiz':
        return 'Generate Quiz';
      case 'content-improve':
        return 'Apply Improvements';
      case 'content-objectives':
      case 'overview-objectives':
      case 'takeaways-objectives':
        return 'Review Objectives';
      case 'content-video':
      case 'overview-video':
      case 'takeaways-video':
        return 'Upload Video';
      case 'content-podcast':
      case 'overview-podcast':
      case 'takeaways-podcast':
        return 'Generate Podcast';
      case 'overview-content':
        return 'Generate Overview';
      case 'takeaways-content':
        return 'Generate Takeaways';
      case 'content-translate':
      case 'overview-translate':
      case 'takeaways-translate':
        return 'Translate Lesson';
      default:
        return 'Open Step Action';
    }
  };

  const getLessonActionPendingLabel = (item: LessonActionItem): string => {
    switch (item.id) {
      case 'content-digest':
      case 'takeaways-digest':
      case 'overview-digest':
        return 'Generating...';
      default:
        return 'Working...';
    }
  };

  const handleRelinkClick = (topic: Topic) => {
    setSelectedUnlinkedTopic(topic);
    setRelinkDialogOpen(true);
  };

  const handleCreateLessonAction = async (action: 'generate' | 'upload' | 'manual') => {
    if (!newLessonTitle.trim()) {
      toast({
        variant: 'destructive',
        title: 'Title required',
        description: 'Please enter a lesson title.',
      });
      return;
    }

    try {
      const result = await createTopicMutation.mutateAsync({
        name: newLessonTitle.trim(),
        description: newLessonDescription.trim(),
        createEmptyLesson: action === 'manual',
      });
      
      const newTopic = result.topic;
      setCreateLessonDialogOpen(false);
      setNewLessonTitle('');
      setNewLessonDescription('');

      if (action === 'generate') {
        setLocation(`/lessons/new?courseId=${courseId}&topicId=${newTopic.id}&topicName=${encodeURIComponent(newTopic.name)}&topicDescription=${encodeURIComponent(newTopic.description || '')}&topicOrder=${newTopic.order}&prefillTitle=${encodeURIComponent(newTopic.name)}&returnToCourse=true`);
      } else if (action === 'upload') {
        setLocation(`/course-builder/${courseId}/upload/${newTopic.order}?mode=add`);
      } else {
        toast({
          title: 'Topic created',
          description: `"${newTopic.name}" has been added to your course framework.`,
        });
      }
    } catch (error) {
      // Error is handled by mutation onError
    }
  };

  const handleSlotSelected = (topic: Topic) => {
    setSelectedTopic(topic);
    setSlotSelectorOpen(false);
    setPickerModalOpen(true);
  };

  // Handle "Attach Existing Lesson" from dropdown - shows slot selector if multiple slots available
  const handleAttachExistingLesson = () => {
    const availableSlots = getAvailableTopicSlots();
    if (availableSlots.length === 0) {
      toast({
        title: 'No available slots',
        description: 'All topic slots already have lessons attached.',
        variant: 'destructive',
      });
      return;
    }
    if (availableSlots.length === 1) {
      // Only one slot, go directly to picker
      setSelectedTopic(availableSlots[0]);
      setPickerModalOpen(true);
    } else {
      // Multiple slots, show slot selector first
      setSlotSelectorOpen(true);
    }
  };

  const organizationId = courseOrgId || (user as any)?.organizationId || '';

  const canPublishCourse = useMemo(() => {
    if (!framework?.topics || framework.topics.length === 0) {
      return { canPublish: false, errors: ['No lessons found'] };
    }
    
    // Only active/visible topics should gate publish readiness.
    const publishTopics = framework.topics.filter((t: any) => !isTopicHidden(t));
    if (publishTopics.length === 0) {
      return { canPublish: false, errors: ['No active lessons found'] };
    }

    const errors: string[] = [];
    
    for (const topic of publishTopics) {
      if (!topic.lessonId) {
        errors.push(`${topic.name}: No lesson attached`);
        continue;
      }
      
      const lesson = lessonsData?.[topic.lessonId];
      if (!lesson) {
        errors.push(`${topic.name}: Lesson data not found`);
        continue;
      }
      
      const hasPPTX = !!lesson.storageKey || !!lesson.gammaCardId;
      if (!hasPPTX) {
        errors.push(`${topic.name}: Missing PowerPoint presentation`);
      }
      
      const lessonType = getLessonType(topic);
      const hasLessonContent = hasLessonSourceContent(lesson);
      if (!hasLessonContent) {
        errors.push(`${topic.name}: Missing lesson content`);
      }
      const hasQuiz = !!lesson.linkedQuizId || (lesson.linkedQuizCount !== undefined && lesson.linkedQuizCount > 0);
      if (lessonType === 'content' && !hasQuiz) {
        errors.push(`${topic.name}: Missing quiz`);
      }
    }
    
    return { canPublish: errors.length === 0, errors };
  }, [framework?.topics, lessonsData]);

  const courseProgress = useMemo(() => {
    if (!framework?.topics || !lessonsData) return null;
    const sortedTopics = [...(framework.topics)].sort((a, b) => a.order - b.order);
    
    let withDoc = 0;
    let withFeedback = 0;
    let withImprovements = 0;
    let withPPTX = 0;
    let withQuiz = 0;
    let withVideo = 0;
    let withPodcast = 0;
    let withDigest = 0;
    let withTranslations = 0;
    let contentCount = 0;
    let totalLessons = 0;
    let completedLessons = 0;
    
    for (const topic of sortedTopics) {
      if (!topic.lessonId) continue;
      const ld = lessonsData[topic.lessonId];
      if (!ld) continue;
      totalLessons++;
      
      const type = getLessonType(topic);
      if (type === 'content') contentCount++;
      
      const hasDoc = !!ld.sourceDocumentPath;
      const hasFeedback = !!ld.lastFeedbackAt && ld.contentScore10 !== undefined && ld.contentScore10 !== null;
      const hasImproved = ld.aiImproveStatus === 'completed' || (ld.previousScore10 !== undefined && ld.previousScore10 !== null && ld.contentScore10 !== undefined && ld.contentScore10 !== null && Number(ld.contentScore10) > Number(ld.previousScore10));
      const hasPPTX = !!ld.storageKey || !!ld.gammaCardId;
      const hasQuiz = !!ld.linkedQuizId || (ld.linkedQuizCount !== undefined && ld.linkedQuizCount > 0);
      const hasVideo = !!ld.videoStorageKey;
      const hasPodcast = hasCompletedPodcast(ld);
      const hasDigest = hasLessonDigest(ld);
      const hasTranslatedLanguage = isTranslationReadyForLesson(ld, type);
      const hasContent = hasLessonSourceContent(ld);
      
      if (hasDoc || hasContent) withDoc++;
      if (type === 'content' && hasFeedback) withFeedback++;
      if (type === 'content' && hasImproved) withImprovements++;
      if (hasPPTX) withPPTX++;
      if (hasQuiz || type !== 'content') withQuiz++;
      if (hasVideo) withVideo++;
      if (hasPodcast) withPodcast++;
      if (hasDigest) withDigest++;
      if (hasTranslatedLanguage) withTranslations++;
      
      const isComplete = isLessonMinimumReady(ld, type);
      if (isComplete) completedLessons++;
    }
    
    return {
      totalLessons,
      completedLessons,
      contentCount,
      withDoc,
      withFeedback,
      withImprovements,
      withPPTX,
      withQuiz,
      withVideo,
      withPodcast,
      withDigest,
      withTranslations,
      allReady: completedLessons === totalLessons && totalLessons > 0,
    };
  }, [framework?.topics, lessonsData, lessonLanguages]);

  const selectedCourseLanguageReadiness = useMemo(() => {
    const langCode = String(selectedReadinessLanguage || sourceCourseLanguageCode).toLowerCase();
    const missingLessons: Array<{ topicOrder: number; lessonTitle: string; missing: string[]; lessonId: string }> = [];
    for (const topic of visibleTopics) {
      if (!topic.lessonId) continue;
      const lessonData = lessonsData?.[topic.lessonId];
      if (!lessonData) continue;
      const missing = getMissingArtifactsForLanguage(lessonData, getLessonType(topic), langCode);
      if (missing.length > 0) {
        missingLessons.push({
          topicOrder: topic.order,
          lessonTitle: lessonData.title || topic.name,
          missing,
          lessonId: lessonData.id,
        });
      }
    }
    return {
      languageCode: langCode,
      totalLessons: visibleTopics.filter((topic) => !!topic.lessonId).length,
      readyLessons: Math.max(0, visibleTopics.filter((topic) => !!topic.lessonId).length - missingLessons.length),
      missingLessons,
    };
  }, [selectedReadinessLanguage, sourceCourseLanguageCode, visibleTopics, lessonsData, lessonLanguages]);

  const openReadinessOverview = (languageCode?: string) => {
    const normalized = String(languageCode || selectedCourseLanguageReadiness.languageCode || sourceCourseLanguageCode)
      .trim()
      .toLowerCase() || sourceCourseLanguageCode;
    setReadinessOverviewLanguage(normalized);
    setReadinessOverviewOpen(true);
  };

  const mapMissingArtifactLabelToKey = (label: string): string | null => {
    const normalized = String(label || "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "pptx") return "pptx";
    if (normalized === "pptx or video") return "pptx";
    if (normalized === "quiz") return "quiz";
    if (normalized === "lesson digest") return "digest";
    if (normalized === "learning objectives") return "objectives";
    if (normalized === "refresh stale translation") return "stale";
    if (normalized === "language variant not created") return "language_variant";
    if (normalized === "source db") return "sourceDb";
    if (normalized === "word source") return "wordDocs";
    return null;
  };

  const buildTranslateRemediationUrl = (
    lessonId: string,
    languageCode: string,
    missing: string[],
  ): string => {
    const artifacts = Array.from(new Set(
      missing
        .map(mapMissingArtifactLabelToKey)
        .filter((value): value is string => !!value)
    ));
    const params = new URLSearchParams();
    params.set("mode", "remediate");
    params.set("targetLanguage", String(languageCode || "").toLowerCase());
    if (artifacts.length > 0) {
      params.set("artifacts", artifacts.join(","));
    }
    return `/course-builder/${courseId}/lessons/${lessonId}/translate?${params.toString()}`;
  };

  const readinessOverviewData = useMemo(() => {
    const languageCode = String(readinessOverviewLanguage || selectedCourseLanguageReadiness.languageCode || sourceCourseLanguageCode)
      .trim()
      .toLowerCase() || sourceCourseLanguageCode;

    const rows = [...visibleTopics]
      .sort((a, b) => a.order - b.order)
      .filter((topic) => !!topic.lessonId)
      .map((topic) => {
        const lesson = lessonsData?.[String(topic.lessonId)];
        const lessonType = getLessonType(topic);
        const lessonTitle = lesson?.title || topic.name || `Topic ${topic.order + 1}`;
        const missing = getMissingArtifactsForLanguage(lesson, lessonType, languageCode);
        const langState = lesson ? getLanguageArtifactStates(lesson).find((l) => String(l.code || '').toLowerCase() === languageCode) : null;
        const hasPptx = !!langState?.hasPptx;
        const hasQuiz = lessonType !== 'content' || !!langState?.hasQuiz;
        const hasDigest = !!langState?.hasDigest;
        const hasObjectives = !!langState?.hasObjectives;
        const isStale = !!langState?.isStale;

        const remediationSteps = (() => {
          if (!lesson) return ['Reload this page. If the lesson remains unavailable, open the lesson and regenerate content.'];
          const steps: string[] = [];
          for (const item of missing) {
            if (item === 'Language variant not created') {
              steps.push(`Open Translate for this lesson and generate ${languageCode.toUpperCase()} artifacts.`);
            } else if (item === 'PPTX' || item === 'PPTX or Video') {
              steps.push('Generate/upload PPTX or upload video for this language variant.');
            } else if (item === 'Quiz') {
              steps.push('Generate or link a quiz for this language variant.');
            } else if (item === 'Lesson digest') {
              steps.push('Generate lesson digest for this language variant.');
            } else if (item === 'Learning objectives') {
              steps.push('Add/save learning objectives in Content Studio for this language variant.');
            } else if (item === 'Refresh stale translation') {
              steps.push('Refresh translation from the latest source to clear stale status.');
            } else if (item === 'Lesson data unavailable') {
              steps.push('Reload this page and retry. If this persists, open the lesson and republish artifacts.');
            } else {
              steps.push(`Resolve: ${item}.`);
            }
          }
          return Array.from(new Set(steps));
        })();

        return {
          topicOrder: topic.order,
          lessonId: lesson?.id || String(topic.lessonId),
          lessonTitle,
          lessonType,
          hasPptx,
          hasQuiz,
          hasDigest,
          hasObjectives,
          isStale,
          missing,
          missingArtifactKeys: Array.from(new Set(
            missing
              .map(mapMissingArtifactLabelToKey)
              .filter((value): value is string => !!value)
          )),
          remediationSteps,
          isReady: missing.length === 0,
        };
      });

    const total = rows.length;
    const ready = rows.filter((row) => row.isReady).length;
    const blocked = rows.filter((row) => !row.isReady).length;

    return {
      languageCode,
      total,
      ready,
      blocked,
      rows,
    };
  }, [
    readinessOverviewLanguage,
    selectedCourseLanguageReadiness.languageCode,
    sourceCourseLanguageCode,
    visibleTopics,
    lessonsData,
    lessonLanguages,
  ]);

  return (
    <QuizAdminLayout 
      title="Generate Course Lessons" 
      description={course?.title ? `Creating lessons for: ${course.title}` : 'Create AI-powered lessons for your course topics'}
      activeSection="lessons"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Link href="/course-builder">
            <Button variant="outline" data-testid="button-back" >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Course Builder
            </Button>
          </Link>
          
          <div className="flex items-center gap-3 flex-wrap">
            {totalCount > 0 && (
              <Badge variant="info" className="px-3 py-1" >
                <Sparkles className="h-3 w-3 mr-1" />
                {generatedCount} / {totalCount} Lessons Exist
              </Badge>
            )}
            
            <div className="flex gap-2">
              {relinkableLessons && relinkableLessons.lessons && relinkableLessons.lessons.length > 0 && (
                <Button onClick={() => setArchivedLessonsOpen(true)}
                  variant="outline"
                  className="border-accent/50 text-accent hover:bg-accent/20"
                  data-testid="button-restore-archived"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore ({relinkableLessons.lessons.length})
                </Button>
              )}
              {topics.length > 0 && getAvailableTopicSlots().length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="button-add-lesson" >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Lesson
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => {
                      setNewLessonTitle('');
                      setNewLessonDescription('');
                      setCreateLessonDialogOpen(true);
                    }}>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Create New Lesson
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAttachExistingLesson}>
                      <Link2 className="h-4 w-4 mr-2" />
                      Attach Existing Lesson
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {selectedCourseLanguageReadiness.totalLessons > 0 && (
          <Card className="bg-card/50 border-border">
            <CardContent className="py-3 px-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" >
                      Language readiness
                    </Badge>
                    {readinessLanguageOptions.length > 1 ? (
                      <Select
                        value={selectedCourseLanguageReadiness.languageCode}
                        onValueChange={(value) => setSelectedReadinessLanguage(String(value || '').toLowerCase())}
                      >
                        <SelectTrigger className="h-7 min-w-[96px] text-[11px]">
                          <SelectValue placeholder="Language" />
                        </SelectTrigger>
                        <SelectContent>
                          {readinessLanguageOptions.map((code) => (
                            <SelectItem key={`readiness-lang-${code}`} value={code} className="text-xs">
                              {code.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" >
                        {selectedCourseLanguageReadiness.languageCode.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-auto p-0" onClick={() => openReadinessOverview(selectedCourseLanguageReadiness.languageCode)}
                    data-testid="button-open-language-readiness-overview"
                  >
                    <Badge variant="outline" className={`text-[11px] cursor-pointer ${selectedCourseLanguageReadiness.missingLessons.length === 0 ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`} >
                      {selectedCourseLanguageReadiness.readyLessons}/{selectedCourseLanguageReadiness.totalLessons} lessons ready
                    </Badge>
                  </Button>
                  {selectedCourseLanguageReadiness.missingLessons.length === 0 ? (
                    <span className="text-xs text-success">All lessons in this language have the minimum translated artifacts to publish.</span>
                  ) : (
                    <span className="text-xs text-warning">
                      {selectedCourseLanguageReadiness.missingLessons.length} lesson(s) still need translated artifacts before publish in this language.
                    </span>
                  )}
                </div>
                {selectedCourseLanguageReadiness.missingLessons.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {selectedCourseLanguageReadiness.missingLessons.slice(0, 4).map((entry) => (
                      <Button key={`translation-missing-${entry.lessonId}`} variant="outline" size="sm" className="h-6" onClick={() => setLocation(buildTranslateRemediationUrl(
                          entry.lessonId,
                          selectedCourseLanguageReadiness.languageCode,
                          entry.missing
                        ))}
                      >
                        Topic {entry.topicOrder + 1}: {entry.missing.join(', ')}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <Card className="bg-card/50 border-border">
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-lg text-muted-foreground">Loading course topics...</span>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="bg-destructive/10 border-[var(--destructive)]/30">
            <CardContent className="py-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h3 className="font-semibold text-destructive">Error loading topics</h3>
                  <p className="text-destructive/70 text-sm mt-1">
                    {(error as Error).message || 'Failed to load course framework. Please try again.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && topics.length === 0 && (
          <Card className="bg-warning/10 border-[var(--warning)]/30">
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-4 rounded-full bg-warning/20">
                  <FileText className="h-8 w-8 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold text-warning text-lg">No topics found</h3>
                  <p className="text-[var(--warning)]/70 text-sm mt-1 max-w-md">
                    This course doesn't have a framework yet. Please go back to the course builder and add topics to your course outline.
                  </p>
                </div>
                <Link href="/course-builder">
                  <Button variant="outline" className="mt-2" data-testid="button-create-topics" >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go to Course Builder
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && topics.length > 0 && (
          <>
            {existingCourseTranslations && existingCourseTranslations.length > 1 && (
              <Card className="bg-card/50 border-border mb-2">
                <CardContent className="py-3 px-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Viewing Language Version:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {existingCourseTranslations.map(lang => {
                        const isCurrent = lang.courseId === courseId;
                        return (
                          <Button key={lang.courseId} variant={isCurrent ? "default" : "outline"} size="sm" className="h-8 px-3 text-xs" onClick={() => {
                              if (!isCurrent) {
                                setLocation(`/course-builder/${lang.courseId}/lessons`);
                              }
                            }}
                          >
                            <span className="font-semibold mr-1">{lang.code.toUpperCase()}</span>
                            <span className="hidden sm:inline">{lang.name}</span>
                          </Button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                      Switch to view lessons in a different language
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="bg-card/50 border-border">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-foreground text-lg">Course Lessons</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Manage and organize lessons for your course topics
                    </CardDescription>
                    {courseLangCoverage.length > 0 && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">Translations:</span>
                        {courseLangCoverage.map(lc => (
                          <div key={lc.code} className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-auto p-0" onClick={() => openReadinessOverview(lc.code)}
                              data-testid={`button-open-translation-readiness-${lc.code}`}
                            >
                              <Badge variant={lc.count === lc.total ? 'default' : 'secondary'} className="py-0 cursor-pointer" >
                                {lc.code.toUpperCase()}: {lc.count}/{lc.total}
                                {lc.staleCount > 0 && <span className="ml-1 text-warning">⚠{lc.staleCount}</span>}
                              </Badge>
                            </Button>
                            {lc.count === lc.total && (
                              <>
                                {frameworkTranslationLang === lc.code && translateCourseMutation.isPending ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Translating...
                                  </span>
                                ) : existingCourseTranslationCodes.has(lc.code) ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <CheckCircle className="h-3.5 w-3.5 text-success" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Course translated to {lc.code.toUpperCase()}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => {
                                      setFrameworkTranslationLang(lc.code);
                                      translateCourseMutation.mutate(lc.code);
                                    }}
                                  >
                                    <Globe className="h-3 w-3 mr-0.5" />
                                    Translate Course ({courseTranslationCost} LPC)
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="default" className="w-full sm:w-auto" data-testid="button-add-lesson-header" >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Lesson
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => {
                        setNewLessonTitle('');
                        setNewLessonDescription('');
                        setCreateLessonDialogOpen(true);
                      }}>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Create New Lesson
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleAttachExistingLesson}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Attach Existing Lesson
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-4">
              {visibleTopics.length === 0 && topics.length > 0 && (
                <Card className="bg-card/50 border-border">
                  <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                      <Archive className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No active lessons</p>
                      <p className="text-sm mt-1">
                        All lessons have been archived. Check the Archived Lessons section below to restore them.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {visibleTopics.map((topic, index) => {
                const lessonData = topic.lessonId && lessonsData ? lessonsData[topic.lessonId] : null;
                const lessonType = getLessonType(topic);
                const hasEffectiveContent = !!(lessonData && hasLessonSourceContent(lessonData));
                const overviewDependencyBlock = lessonType === 'overview'
                  ? getBlockedDependencySummary(generationReadiness, 'overview')
                  : null;
                const takeawaysDependencyBlock = lessonType === 'key_takeaways'
                  ? getBlockedDependencySummary(generationReadiness, 'takeaways')
                  : null;
                const canGenerateOverviewSourceDb = lessonType === 'overview' && !!generationReadiness?.overview?.ready;
                const canGenerateTakeawaysSourceDb = lessonType === 'key_takeaways' && !!generationReadiness?.takeaways?.ready;
                const canGenerateStructuralSourceDb = canGenerateOverviewSourceDb || canGenerateTakeawaysSourceDb;
                const sourceDbBlockedReason = lessonType === 'overview'
                  ? (overviewDependencyBlock
                      ? `Complete all non-overview lesson requirements first (${overviewDependencyBlock.remainingCount}/${overviewDependencyBlock.totalCount} dependencies incomplete).`
                      : 'Complete prerequisites before generating overview source DB content.')
                  : (lessonType === 'key_takeaways'
                      ? (takeawaysDependencyBlock
                          ? `Complete all content lesson requirements first (${takeawaysDependencyBlock.remainingCount}/${takeawaysDependencyBlock.totalCount} dependencies incomplete).`
                          : 'Complete prerequisites before generating key takeaways source DB content.')
                      : 'Complete prerequisites before generating source DB content.');
                const isOverviewOrTakeaways = !!(topic.lessonId && lessonData && (lessonType === 'overview' || lessonType === 'key_takeaways'));
                const isLessonContentReady = !!(lessonData && (lessonData.generationStatus === 'completed' || hasEffectiveContent));
                const detailsExpanded = isLessonCardDetailExpanded(topic);
                const selectedLanguageCode = String(selectedCourseLanguageReadiness.languageCode || sourceCourseLanguageCode).toLowerCase();
                const missingSelectedLanguageArtifacts = topic.lessonId && lessonData
                  ? getMissingArtifactsForLanguage(lessonData, lessonType, selectedLanguageCode)
                  : [];
                
                return (
                  <Card 
                    key={getTopicIdentifier(topic)} 
                    className={`bg-card/50 border-border hover:border-border transition-colors ${
                      topic.lessonId ? 'border-l-4 border-l-[var(--success)]' : ''
                    }`}
                  >
                    <CardHeader className="pb-4">
                      <div className={`flex flex-col ${isOverviewOrTakeaways ? '' : 'sm:flex-row sm:items-start'} justify-between gap-4`}>
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${
                            topic.lessonId 
                              ? 'bg-success/20 text-success border border-[var(--success)]/30' 
                              : 'bg-primary/20 text-primary border border-primary/30'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <CardTitle className="text-foreground flex items-center gap-2 flex-wrap">
                              {topic.lessonId && lessonData && (() => {
                                const readiness = getReadinessStatus(lessonData, topic.order);
                                if (!readiness) return null;
                                const dotColor = readiness.color === 'green' 
                                  ? 'bg-success' 
                                  : readiness.color === 'yellow' 
                                  ? 'bg-warning' 
                                  : 'bg-destructive';
                                return (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button 
                                        className={`w-3 h-3 rounded-full ${dotColor} shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-offset-background hover:ring-${readiness.color === 'green' ? 'green' : readiness.color === 'yellow' ? 'yellow' : 'red'}-400 transition-all`}
                                        title={readiness.color === 'green' ? 'Ready to publish' : readiness.color === 'yellow' ? 'Missing optional items' : 'Missing required items'}
                                      />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3 text-left" side="bottom" align="start">
                                      <div className="space-y-2">
                                        <h4 className="font-semibold text-sm">Publishing Readiness</h4>
                                        {readiness.requiredMissing.length > 0 && (
                                          <div>
                                            <p className="text-xs font-medium text-destructive mb-1">Required (missing):</p>
                                            <ul className="text-xs space-y-0.5">
                                              {readiness.requiredMissing.map((item, i) => (
                                                <li key={i} className="flex items-center gap-1.5 text-destructive">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                                                  {item}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {readiness.requiredMissing.length === 0 && (
                                          <div>
                                            <p className="text-xs font-medium text-success mb-1">Required:</p>
                                            <p className="text-xs text-success">All required items present</p>
                                            <p className="text-[11px] text-muted-foreground mt-1">
                                              This lesson meets minimum requirements. You can publish once all lessons also meet minimum requirements, or continue with optional enhancements.
                                            </p>
                                          </div>
                                        )}
                                        {readiness.optionalMissing.length > 0 && (
                                          <div>
                                            <p className="text-xs font-medium text-warning mb-1">Recommended (missing):</p>
                                            <ul className="text-xs space-y-0.5">
                                              {readiness.optionalMissing.map((item, i) => (
                                                <li key={i} className="flex items-center gap-1.5 text-warning">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                                                  {item}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {readiness.optionalMissing.length === 0 && readiness.requiredMissing.length === 0 && (
                                          <p className="text-xs text-success">All items complete - ready to publish!</p>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                );
                              })()}
                              {lessonData?.title || topic.name}
                              {topic.lessonId && lessonData && (
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-2" style={lessonExpandButtonStyle} onClick={() => toggleLessonCardExpanded(topic)}
                                >
                                  {detailsExpanded ? (
                                    <>
                                      <ChevronUp className="h-3 w-3 mr-1" />
                                      Collapse
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-3 w-3 mr-1" />
                                      Expand
                                    </>
                                  )}
                                </Button>
                              )}
                              {topic.lessonId && lessonData && !isOverviewOrTakeaways && (
                                <>
                                  {(lessonData.generationStatus === 'processing' || lessonData.generationStatus === 'polling') && (
                                    <>
                                      <Badge variant="info">
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        Generating...
                                      </Badge>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => {
                                                e.stopPropagation();
                                                refreshStatusMutation.mutate(lessonData.id);
                                              }}
                                              disabled={refreshStatusMutation.isPending}
                                            >
                                              {refreshStatusMutation.isPending ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                <RefreshCw className="h-3 w-3" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Check generation status</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </>
                                  )}
                                  {lessonData.generationStatus === 'pending' && !hasEffectiveContent &&
                                   !lessonData.storageKey && !lessonData.videoStorageKey && !lessonData.gammaCardId && (
                                    <Badge variant="warning">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Pending
                                    </Badge>
                                  )}
                                  {lessonData.generationStatus === 'failed' && (
                                    <Badge variant="danger">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      Failed
                                    </Badge>
                                  )}
                                </>
                              )}
                              {topic.lessonId && !lessonData && (
                                <Badge variant="secondary">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Loading...
                                </Badge>
                              )}
                              {topic.lessonId && lessonData && (
                                <Badge variant="outline" className={`text-[10px] ${missingSelectedLanguageArtifacts.length === 0 ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`} title={ missingSelectedLanguageArtifacts.length === 0 ? `${selectedLanguageCode.toUpperCase()} artifacts ready` : `${selectedLanguageCode.toUpperCase()} missing: ${missingSelectedLanguageArtifacts.join(', ')}` } >
                                  {selectedLanguageCode.toUpperCase()}: {missingSelectedLanguageArtifacts.length === 0 ? 'Ready' : `${missingSelectedLanguageArtifacts.length} missing`}
                                </Badge>
                              )}
                              {topic.lessonId && lessonData && (
                                <Select
                                  value={lessonType}
                                  onValueChange={(value) => setLessonTypeMutation.mutate({
                                    lessonId: lessonData.id,
                                    lessonType: value as 'overview' | 'content' | 'key_takeaways',
                                  })}
                                  disabled={setLessonTypeMutation.isPending}
                                >
                                  <SelectTrigger
                                    className="h-7 w-auto min-w-[148px] text-xs font-normal"
                                    style={setLessonTypeMutation.isPending ? undefined : lessonTypeSelectStyle}
                                    data-testid={`select-lesson-type-${lessonData.id}`}
                                    aria-label="Lesson type"
                                  >
                                    <GraduationCap className="h-3.5 w-3.5 mr-1" />
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="content">Type: Content</SelectItem>
                                    <SelectItem value="overview">Type: Overview</SelectItem>
                                    <SelectItem value="key_takeaways">Type: Key Takeaways</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </CardTitle>
                            {topic.lessonId && lessonData && isOverviewOrTakeaways && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {(lessonData.generationStatus === 'processing' || lessonData.generationStatus === 'polling') && (
                                  <Badge variant="info">
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Generating...
                                  </Badge>
                                )}
                                {lessonData.generationStatus === 'pending' && !hasEffectiveContent &&
                                  !lessonData.storageKey && !lessonData.videoStorageKey && !lessonData.gammaCardId && (
                                    <Badge variant="warning">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Pending
                                    </Badge>
                                  )}
                                {lessonData.generationStatus === 'failed' && (
                                  <Badge variant="danger">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Failed
                                  </Badge>
                                )}
                                {renderLessonArtifactBadges(lessonData)}
                              </div>
                            )}
                            {topic.lessonId && lessonData && isLessonContentReady && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <div className="hidden sm:flex items-center gap-1">
                                  <Button variant="outline" size="sm" onClick={() => handleMoveUp(topic)}
                                    disabled={index === 0 || reorderMutation.isPending}
                                    className="h-8 px-2"
                                    style={index === 0 || reorderMutation.isPending ? undefined : lessonReorderButtonStyle}
                                    data-testid={`button-move-up-${index}`}
                                    title="Move lesson up"
                                  >
                                    <ChevronUp className="h-4 w-4 mr-1" />
                                    Move Up
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleMoveDown(topic, visibleTopics.length - 1)}
                                    disabled={index === visibleTopics.length - 1 || reorderMutation.isPending}
                                    className="h-8 px-2"
                                    style={index === visibleTopics.length - 1 || reorderMutation.isPending ? undefined : lessonReorderButtonStyle}
                                    data-testid={`button-move-down-${index}`}
                                    title="Move lesson down"
                                  >
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                    Move Down
                                  </Button>
                                </div>
                                <div className="sm:hidden">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-8 px-2" style={lessonReorderButtonStyle} data-testid={`button-reorder-${index}`} title="Reorder lesson" >
                                        Reorder
                                        <ChevronDown className="h-4 w-4 ml-1" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => handleMoveUp(topic)}
                                        disabled={index === 0 || reorderMutation.isPending}
                                      >
                                        <ChevronUp className="h-4 w-4 mr-2" />
                                        Move Up
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleMoveDown(topic, visibleTopics.length - 1)}
                                        disabled={index === visibleTopics.length - 1 || reorderMutation.isPending}
                                      >
                                        <ChevronDown className="h-4 w-4 mr-2" />
                                        Move Down
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                {courseId && (() => {
                                  const hasNativeMaterial = hasNativeSourceLessonMaterial(lessonData);
                                  if (!hasNativeMaterial) return null;
                                  return (
                                    <Button variant="outline" size="sm" onClick={() => setLocation(buildNativeLessonMaterialUrl(lessonData.id))}
                                      title="Open the learner lesson material generated from the selected source content"
                                      className="h-8 text-primary hover:text-primary gap-1"
                                      data-testid={`button-view-native-lesson-${lessonData.id}`}
                                    >
                                      <BookOpen className="h-4 w-4" />
                                      View Lesson Material
                                    </Button>
                                  );
                                })()}
                                {courseId && (() => {
                                  const hasTranslatableArtifacts = !!(
                                    String(lessonData.inputText || '').trim() ||
                                    lessonData.sourceDocumentPath ||
                                    lessonData.storageKey ||
                                    lessonData.gammaCardId ||
                                    lessonData.linkedQuizId ||
                                    (lessonData.linkedQuizCount !== undefined && lessonData.linkedQuizCount > 0)
                                  );
                                  const translateBlockedReason = hasTranslatableArtifacts
                                    ? null
                                    : 'No translatable artifacts found yet';
                                  return (
                                    <Button variant="outline" size="sm" onClick={() => setLocation(`/course-builder/${courseId}/lessons/${lessonData.id}/translate`)}
                                      title={translateBlockedReason || 'Translate this lesson'}
                                      className="h-8 text-primary hover:text-primary gap-1"
                                      style={translateBlockedReason ? undefined : lessonTranslateButtonStyle}
                                      disabled={!!translateBlockedReason}
                                    >
                                      <Globe className="h-4 w-4" />
                                      Translate
                                    </Button>
                                  );
                                })()}
                                {organizationId && courseId && (() => {
                                  const menuProps = getProgressiveMenuProps(lessonData, topic);
                                  if (menuProps.hideMenu) return null;
                                  return (
                                    <LessonActionsMenu
                                      lesson={lessonData}
                                      context="course-builder"
                                      organizationId={organizationId}
                                      isAnyLessonGenerating={isAnyLessonGenerating}
                                      courseId={courseId}
                                      topicId={topic.id}
                                      topicName={topic.name}
                                      topicOrder={topic.order}
                                      courseLessonType={lessonType}
                                      isOverviewLesson={getLessonType(topic) === 'overview'}
                                      hideMenu={menuProps.hideMenu}
                                      showView={menuProps.showView ?? true}
                                      showEdit={menuProps.showEdit ?? true}
                                      showGenerateQuiz={menuProps.showGenerateQuiz ?? false}
                                      showEditQuiz={menuProps.showEditQuiz ?? false}
                                      showDownloadPPTX={menuProps.showDownloadPPTX ?? true}
                                      showReplacePPTX={menuProps.showReplacePPTX ?? true}
                                      showUploadPPTX={menuProps.showUploadPPTX ?? true}
                                      showUploadVideo={menuProps.showUploadVideo ?? true}
                                      showRegenerate={menuProps.showRegenerate ?? false}
                                      showArchive={true}
                                      showRemoveFromCourse={menuProps.showRemoveFromCourse ?? true}
                                      showSetCourseLessonType={true}
                                      showUploadContent={menuProps.showUploadContent ?? true}
                                      showViewContent={menuProps.showViewContent ?? false}
                                      showViewChanges={menuProps.showViewChanges ?? false}
                                      showViewLastReport={menuProps.showViewLastReport ?? false}
                                        showSetLearningObjectives={
                                        getLessonType(topic) === 'content' ||
                                          getLessonType(topic) === 'overview' ||
                                          (getLessonType(topic) === 'key_takeaways' && !!generationReadiness?.takeaways?.ready)
                                        }
                                        showGenerateSourceDbContent={lessonType === 'overview' || lessonType === 'key_takeaways'}
                                        generateSourceDbContentLabel={lessonType === 'overview'
                                          ? (hasEffectiveContent ? 'Regenerate Overview Source DB Content' : 'Generate Overview Source DB Content')
                                          : (hasEffectiveContent ? 'Regenerate Key Takeaways Source DB Content' : 'Generate Key Takeaways Source DB Content')}
                                        canGenerateSourceDbContent={canGenerateStructuralSourceDb}
                                        isGeneratingSourceDbContent={lessonType === 'overview' ? generateOverviewMutation.isPending : (lessonType === 'key_takeaways' ? generateTakeawaysMutation.isPending : false)}
                                        sourceDbContentBlockedReason={sourceDbBlockedReason}
                                        onGenerateSourceDbContent={() => {
                                          if (lessonType === 'overview') {
                                            if (generationReadiness?.overview?.ready) {
                                              generateOverviewMutation.mutate();
                                            } else {
                                              toast({ title: 'Prerequisites pending', description: 'Complete prerequisites before generating overview.' });
                                            }
                                            return;
                                          }
                                          if (lessonType === 'key_takeaways') {
                                            if (generationReadiness?.takeaways?.ready) {
                                              generateTakeawaysMutation.mutate();
                                            } else {
                                              toast({ title: 'Prerequisites pending', description: 'Complete prerequisites before generating key takeaways.' });
                                            }
                                          }
                                        }}
                                        onViewLastReport={(selectedLessonId) => {
                                          const targetId = selectedLessonId || topic.lessonId!;
                                          setFeedbackLesson({ id: targetId, title: lessonData?.title || topic.name });
                                        lastFeedbackMutation.mutate(targetId);
                                      }}
                                      showGetFeedback={menuProps.showGetFeedback ?? false}
                                      onGetFeedback={(selectedLessonId) => {
                                        const targetId = selectedLessonId || topic.lessonId!;
                                        setFeedbackLesson({ id: targetId, title: lessonData?.title || topic.name });
                                        setConfirmFeedbackOpen(true);
                                      }}
                                      triggerClassName="h-8 sm:h-9 px-2 whitespace-nowrap text-xs sm:text-sm"
                                      triggerStyle={lessonActionsButtonStyle}
                                      onSetLearningObjectives={(selectedLessonId) => {
                                        const targetId = selectedLessonId || topic.lessonId!;
                                        if (!targetId) return;
                                        openObjectivesEditor(topic, targetId);
                                      }}
                                      onActionComplete={handleActionComplete}
                                      onUploadContentSuccess={(result) => {
                                        toast({
                                          title: "Content uploaded",
                                          description: `Extracted ${result.extractedWordCount} words. Consider running Expert Feedback to review the content.`,
                                        });
                                        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                            )}
                            {topic.lessonId && lessonData && !isOverviewOrTakeaways && renderLessonArtifactBadges(lessonData)}
                            <CardDescription className="text-muted-foreground mt-1">
                              {topic.lessonId 
                                ? (hasNativeSourceLessonMaterial(lessonData)
                                    ? 'Native lesson material is ready for learners'
                                    : hasEffectiveContent || lessonData?.generationStatus === 'completed'
                                    ? 'Lesson content has been created for this topic'
                                    : lessonData?.generationStatus === 'processing'
                                    ? 'Lesson is being generated...'
                                    : lessonData?.generationStatus === 'pending'
                                    ? 'Lesson content is pending generation'
                                    : lessonData?.generationStatus === 'failed'
                                    ? (lessonData?.metadata?.error 
                                        ? `Generation failed: ${lessonData.metadata.error}`
                                        : 'Lesson generation failed. Try again.')
                                    : 'Lesson content has been created for this topic')
                                : 'Use AI to generate comprehensive lesson content'}
                            </CardDescription>
                            {detailsExpanded && topic.lessonId && lessonData && (() => {
                              const nextStep = getNextStep(lessonData, topic, generationReadiness);
                              if (!nextStep) return null;
                              const actionItems = getLessonActionItems(lessonData, topic, generationReadiness);
                              const pendingRequired = actionItems.filter((item) => item.kind === 'required' && item.status === 'todo');
                              const pendingRecommended = actionItems.filter((item) => item.kind === 'recommended' && item.status === 'todo');
                              const pendingOptional = actionItems.filter((item) => item.kind === 'optional' && item.status === 'todo');
                              const primaryItem =
                                pendingRequired[0] ||
                                pendingRecommended[0] ||
                                pendingOptional[0] ||
                                null;
                              const podcastCompleted = actionItems.some((item) => item.id.endsWith('-podcast') && item.status === 'done');
                              const translationCompleted = actionItems.some((item) => item.id.endsWith('-translate') && item.status === 'done');
                              const shouldShowCompleteOptionalPrimary =
                                pendingRequired.length === 0 &&
                                (pendingRecommended.length > 0 || pendingOptional.length > 0) &&
                                podcastCompleted &&
                                translationCompleted;
                              
                              return (
                                <>
                                <div className={`mt-2 flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-md ${
                                  nextStep.type === 'blocked' 
                                    ? 'bg-muted/50 text-muted-foreground' 
                                    : nextStep.type === 'complete'
                                    ? 'bg-success/10 text-success border border-success/20'
                                    : nextStep.type === 'optional'
                                    ? 'bg-primary/10 text-primary border border-border'
                                    : 'bg-warning/10 text-warning border border-[var(--warning)]/20'
                                }`}>
                                  <div className="min-w-0 flex items-center gap-2">
                                    {nextStep.type === 'blocked' ? (
                                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    ) : nextStep.type === 'complete' ? (
                                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <div className="min-w-0 text-left">
                                      <span className="block text-left">
                                        {nextStep.type === 'complete' 
                                          ? nextStep.label
                                          : nextStep.type === 'blocked'
                                          ? nextStep.label
                                          : `Step ${nextStep.stepNumber}/${nextStep.totalSteps}: ${nextStep.label}`
                                        }
                                      </span>
                                      {nextStep.description && (
                                        <span className="block text-[11px] opacity-80 mt-0.5 text-left">
                                          {nextStep.description}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {nextStep.category === 'recommended' && (
                                      <Badge variant="outline" className="px-1 py-0 ml-1">Recommended</Badge>
                                    )}
                                    {nextStep.category === 'optional' && (
                                      <Badge variant="outline" className="px-1 py-0 ml-1">Optional</Badge>
                                    )}
                                    {nextStep.type === 'complete' && pendingRequired.length === 0 && (pendingRecommended.length > 0 || pendingOptional.length > 0) && (
                                      <Badge variant="outline" className="px-1 py-0 ml-1">Minimum complete</Badge>
                                    )}
                                    {shouldShowCompleteOptionalPrimary && nextStep.type !== 'blocked' && (
                                      <Button size="sm" variant="outline" className="h-7 ml-1" onClick={() => {
                                          setOptionalStepsContext({
                                            lessonId: lessonData.id,
                                            lessonTitle: lessonData.title || topic.name,
                                            topic,
                                            items: actionItems.filter((item) => item.status === 'todo' && (item.kind === 'recommended' || item.kind === 'optional')),
                                          });
                                        }}
                                      >
                                        Complete Optional Steps
                                      </Button>
                                    )}
                                    {!shouldShowCompleteOptionalPrimary && primaryItem && nextStep.type !== 'blocked' && (
                                      <Button size="sm" variant="outline" className="h-7 ml-1" onClick={() => executeLessonActionItem(primaryItem, topic, lessonData)}
                                        disabled={isLessonActionPending(lessonData.id, primaryItem.id)}
                                      >
                                        {isLessonActionPending(lessonData.id, primaryItem.id) ? (
                                          <>
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            {getLessonActionPendingLabel(primaryItem)}
                                          </>
                                        ) : (
                                          getLessonActionButtonLabel(primaryItem)
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                </>
                              );
                            })()}
                            {detailsExpanded && topic.lessonId && lessonData && (() => {
                              const actionItems = getLessonActionItems(lessonData, topic, generationReadiness);
                              if (actionItems.length === 0) return null;

                              const lessonType = getLessonType(topic);
                              const required = actionItems.filter((item) => item.kind === 'required');
                              const recommended = actionItems.filter((item) => item.kind === 'recommended');
                              const optional = actionItems.filter((item) => item.kind === 'optional');
                              const toDisplay = [
                                ...required.filter((item) => item.status !== 'done'),
                                ...recommended.filter((item) => item.status !== 'done'),
                                ...optional.filter((item) => item.status !== 'done'),
                              ].slice(0, 3);
                              const fallbackDisplay = toDisplay.length > 0 ? toDisplay : actionItems.slice(0, 3);
                              const requiredLeft = required.filter((item) => item.status !== 'done').length;
                              const recommendedLeft = recommended.filter((item) => item.status !== 'done').length;
                              const optionalLeft = optional.filter((item) => item.status !== 'done').length;
                              const primaryActionItem =
                                required.find((item) => item.status === 'todo') ||
                                recommended.find((item) => item.status === 'todo') ||
                                optional.find((item) => item.status === 'todo') ||
                                null;
                              const blockedRequiredItem =
                                required.find((item) => item.status === 'blocked') || null;
                              const canDoOptionalFlow = requiredLeft === 0 && (recommendedLeft > 0 || optionalLeft > 0);
                              const podcastCompleted = actionItems.some((item) => item.id.endsWith('-podcast') && item.status === 'done');
                              const translationCompleted = actionItems.some((item) => item.id.endsWith('-translate') && item.status === 'done');
                              const shouldShowCompleteOptionalPrimary = canDoOptionalFlow && podcastCompleted && translationCompleted;
                              const sourceParts = [
                                lessonData.inputText ? 'Source DB' : null,
                                lessonData.sourceDocumentPath ? 'Word' : null,
                                (lessonData.storageKey || lessonData.gammaCardId) ? 'PPTX' : null,
                                lessonData.videoStorageKey ? 'Video' : null,
                                hasCompletedPodcast(lessonData) ? 'Podcast' : null,
                              ].filter(Boolean) as string[];
                              const objectivesFreshness = getLearningObjectivesFreshness(lessonData);

                              return (
                                <div className="mt-2 rounded-md border border-border/70 bg-muted/20 p-2 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" >What to do next</Badge>
                                    <Badge variant="outline" >
                                      Required left: {requiredLeft}
                                    </Badge>
                                    <Badge variant="outline" >
                                      Recommended left: {recommendedLeft}
                                    </Badge>
                                    {requiredLeft === 0 && (
                                      <Badge variant="outline" >
                                        Minimum requirements met
                                      </Badge>
                                    )}
                                    {sourceParts.length > 0 && (
                                      <Badge variant="outline" >
                                        Sources/assets: {sourceParts.join(' + ')}
                                      </Badge>
                                    )}
                                    {objectivesFreshness.isConfigured && (
                                      <Badge variant="outline" className={`text-[10px] ${objectivesFreshness.isStale ? 'text-warning border-[var(--warning)]/40 bg-warning/10' : 'text-success border-success/40 bg-success/10'}`} >
                                        {objectivesFreshness.isStale ? 'Bloom objectives need refresh' : 'Bloom objectives source-aligned'}
                                      </Badge>
                                    )}
                                    <div className="ml-auto">
                                      {shouldShowCompleteOptionalPrimary ? (
                                        <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => {
                                            setOptionalStepsContext({
                                              lessonId: lessonData.id,
                                              lessonTitle: lessonData.title || topic.name,
                                              topic,
                                              items: actionItems.filter((item) => item.status === 'todo' && (item.kind === 'recommended' || item.kind === 'optional')),
                                            });
                                          }}
                                        >
                                          Complete Optional Steps
                                        </Button>
                                      ) : primaryActionItem ? (
                                        <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => executeLessonActionItem(primaryActionItem, topic, lessonData)}
                                          disabled={isLessonActionPending(lessonData.id, primaryActionItem.id)}
                                        >
                                          {isLessonActionPending(lessonData.id, primaryActionItem.id) ? (
                                            <>
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              {getLessonActionPendingLabel(primaryActionItem)}
                                            </>
                                          ) : (
                                            getLessonActionButtonLabel(primaryActionItem)
                                          )}
                                        </Button>
                                      ) : blockedRequiredItem ? (
                                        <Button size="sm" variant="outline" className="h-6 px-2" disabled title={blockedRequiredItem.detail || 'Complete prerequisite steps first.'} >
                                          Complete prerequisites first
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>
                                  {lessonType === 'overview' && requiredLeft > 0 && (
                                    <div className="rounded border border-[var(--warning)]/30 bg-warning/10 p-2 text-xs text-warning">
                                      Complete all required steps on the other lessons first, then come back to complete the overview lesson steps.
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    {fallbackDisplay.map((item, idx) => (
                                      <div key={`next-action-${topic.lessonId}-${item.id}-${idx}`} className="flex items-start gap-2 text-xs">
                                        {item.status === 'done' ? (
                                          <CheckCircle className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                                        ) : item.status === 'blocked' ? (
                                          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                        ) : (
                                          <MapPin className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-foreground">
                                            <span className={`mr-1 ${item.kind === 'required' ? 'text-destructive' : item.kind === 'recommended' ? 'text-warning' : 'text-primary'}`}>
                                              [{item.kind}]
                                            </span>
                                            {item.label}
                                          </p>
                                          {item.detail && (
                                            <p className="text-muted-foreground">{item.detail}</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            {detailsExpanded && topic.lessonId && lessonData && (() => {
                              if (!selectedLanguageCode) return null;
                              const missing = getMissingArtifactsForLanguage(lessonData, lessonType, selectedLanguageCode);
                              const isSourceLanguage = selectedLanguageCode === String(lessonData.languageCode || 'en').toLowerCase();
                              if (isSourceLanguage) return null;
                              return (
                                <div className={`mt-2 rounded-md border p-2 text-xs ${missing.length === 0 ? 'border-success/30 bg-success/10 text-success' : 'border-[var(--warning)]/30 bg-warning/10 text-warning'}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium">
                                        {selectedLanguageCode.toUpperCase()} translation checklist
                                      </p>
                                      <p className="opacity-90">
                                        {missing.length === 0
                                          ? 'This lesson has the required translated artifacts for publish readiness.'
                                          : `Still needed: ${missing.join(', ')}.`}
                                      </p>
                                    </div>
                                    <Button size="sm" variant="outline" className="h-7" onClick={() => setLocation(`/course-builder/${courseId}/lessons/${lessonData.id}/translate`)}
                                    >
                                      {missing.length === 0 ? 'Review Translation' : 'Complete Translation'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()}
                            {detailsExpanded && topic.lessonId && lessonData && (getLessonType(topic) === 'content' || getLessonType(topic) === 'key_takeaways' || getLessonType(topic) === 'overview') && (() => {
                              const lessonTypeForObjectives = getLessonType(topic);
                              const isKeyTakeawaysObjectives = lessonTypeForObjectives === 'key_takeaways';
                              const isOverviewObjectives = lessonTypeForObjectives === 'overview';
                              const canEditTakeawaysObjectives = !!generationReadiness?.takeaways?.sourceGenerated;
                              const objectivesEditingEnabled = !isKeyTakeawaysObjectives || canEditTakeawaysObjectives;
                              const normalizedObjectives = normalizeLessonObjectives(topic, lessonData);
                              const isEditingObjectives = objectivesEditorLessonId === topic.lessonId && objectivesEditingEnabled;
                              const uniqueBloomLevels = Array.from(
                                new Set(normalizedObjectives.map((row) => row.bloomLevel))
                              );
                              const combinedOverviewObjectives = isOverviewObjectives ? getCombinedCourseObjectivesForOverview() : [];
                              const hasCombinedOverviewObjectives = combinedOverviewObjectives.length > 0;

                              return (
                                <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Learning Objectives (Bloom Taxonomy)
                                      </p>
                                      {!isEditingObjectives && normalizedObjectives.length === 0 && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {isKeyTakeawaysObjectives && !objectivesEditingEnabled
                                            ? 'Objectives will unlock once key takeaways prerequisites are complete.'
                                            : isOverviewObjectives
                                              ? 'Overview objectives combine learning objectives from all non-overview lessons.'
                                            : 'No objectives set yet for this lesson.'}
                                        </p>
                                      )}
                                      {!isEditingObjectives && normalizedObjectives.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {uniqueBloomLevels.map((level) => (
                                            <Badge key={`${topic.lessonId}-${level}`} variant="outline" className="uppercase">
                                              {level}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    {!isEditingObjectives && (
                                      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => openObjectivesEditor(topic, topic.lessonId!, lessonData)}
                                        disabled={!objectivesEditingEnabled}
                                        title={
                                          !objectivesEditingEnabled
                                            ? 'Complete key takeaways prerequisites before editing objectives.'
                                            : undefined
                                        }
                                        data-testid={`button-edit-objectives-${topic.lessonId}`}
                                      >
                                        <Pencil className="h-3.5 w-3.5 mr-1" />
                                        Edit Objectives
                                      </Button>
                                    )}
                                  </div>

                                  {!isEditingObjectives && normalizedObjectives.length > 0 && (
                                    <div className="space-y-1.5">
                                      {normalizedObjectives.map((objective) => (
                                        <div key={objective.id} className="flex gap-2 text-xs">
                                          <Badge variant="outline" className="h-fit uppercase">{objective.bloomLevel}</Badge>
                                          <p className="text-foreground leading-relaxed">{objective.objective}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {isEditingObjectives && (
                                    <div className="space-y-3">
                                      {objectiveDraftRows.map((row, rowIndex) => (
                                        <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start">
                                          <Select
                                            value={row.bloomLevel}
                                            onValueChange={(value) => {
                                              const next = [...objectiveDraftRows];
                                              next[rowIndex] = { ...next[rowIndex], bloomLevel: value as BloomLevel };
                                              setObjectiveDraftRows(next);
                                            }}
                                          >
                                            <SelectTrigger className="h-9">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {BLOOM_LEVEL_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                  {option.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <Textarea
                                            value={row.objective}
                                            rows={2}
                                            placeholder="Write a measurable learning objective..."
                                            onChange={(event) => {
                                              const next = [...objectiveDraftRows];
                                              next[rowIndex] = { ...next[rowIndex], objective: event.target.value };
                                              setObjectiveDraftRows(next);
                                            }}
                                          />
                                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => {
                                              setObjectiveDraftRows(objectiveDraftRows.filter((_, idx) => idx !== rowIndex));
                                            }}
                                            data-testid={`button-remove-objective-${topic.lessonId}-${rowIndex}`}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      ))}

                                      {objectiveDraftError && (
                                        <p className="text-xs text-destructive">{objectiveDraftError}</p>
                                      )}

                                      {isOverviewObjectives ? (
                                        <div className="rounded-md border border-border/70 bg-background/80 p-2 space-y-2">
                                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                            Overview Objectives Source
                                          </p>
                                          <p className="text-[11px] text-muted-foreground">
                                            Keep these objectives aligned with all content and key takeaways lessons.
                                          </p>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Button type="button" variant="outline" size="sm" disabled={!hasCombinedOverviewObjectives} onClick={() => {
                                                if (!hasCombinedOverviewObjectives) {
                                                  setObjectiveDraftError('No course objectives available yet. Add objectives to content/key takeaways lessons first.');
                                                  return;
                                                }
                                                setObjectiveDraftRows(combinedOverviewObjectives);
                                                setObjectiveDraftError(null);
                                              }}
                                              data-testid={`button-sync-overview-objectives-${topic.lessonId}`}
                                            >
                                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                              Sync from Course Objectives
                                            </Button>
                                            <p className="text-[11px] text-muted-foreground">
                                              {hasCombinedOverviewObjectives
                                                ? `${combinedOverviewObjectives.length} objective(s) available from non-overview lessons.`
                                                : 'Waiting for objectives in content/key takeaways lessons.'}
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                      <div className="rounded-md border border-border/70 bg-background/80 p-2 space-y-2">
                                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                          Objective Generation Source
                                        </p>
                                        <Select
                                          value={objectiveSourceSelection ? `${objectiveSourceSelection.sourceType}:${objectiveSourceSelection.versionRef}` : undefined}
                                          onValueChange={(value) => {
                                            const options = (objectiveSourceData?.options || []).filter((opt) => opt.sourceType !== 'manual_topic');
                                            const next = options.find((opt) => `${opt.sourceType}:${opt.versionRef}` === value);
                                            if (!next) return;
                                            setObjectiveSourceSelection({
                                              sourceType: next.sourceType,
                                              versionRef: next.versionRef,
                                              languageCode: next.languageCode,
                                            });
                                          }}
                                        >
                                          <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select content source/version" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(objectiveSourceData?.options || [])
                                              .filter((opt) => opt.sourceType !== 'manual_topic')
                                              .map((opt) => (
                                                <SelectItem key={`objective-source-${opt.id}`} value={`${opt.sourceType}:${opt.versionRef}`}>
                                                  {opt.label}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                        {objectiveSourceSelection && (
                                          <div className="text-[11px] text-muted-foreground space-y-1">
                                            {(() => {
                                              const selectedOption = (objectiveSourceData?.options || []).find(
                                                (opt) =>
                                                  opt.sourceType === objectiveSourceSelection.sourceType &&
                                                  opt.versionRef === objectiveSourceSelection.versionRef
                                              );
                                              if (!selectedOption) return <p>Selected source metadata unavailable.</p>;
                                              return (
                                                <>
                                                  <p className="text-foreground">{selectedOption.description}</p>
                                                  <p>
                                                    {selectedOption.languageCode.toUpperCase()}
                                                    {selectedOption.wordCount > 0 ? ` • ${selectedOption.wordCount} words` : ''}
                                                    {selectedOption.createdAt ? ` • ${new Date(selectedOption.createdAt).toLocaleString()}` : ''}
                                                  </p>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        )}
                                        {objectiveLastGeneratedSourceContract && (
                                          <p className="text-[11px] text-muted-foreground">
                                            Last generated from: {objectiveLastGeneratedSourceContract.label}
                                            {objectiveLastGeneratedSourceContract.selectedAt
                                              ? ` • ${new Date(objectiveLastGeneratedSourceContract.selectedAt).toLocaleString()}`
                                              : ''}
                                          </p>
                                        )}
                                      </div>
                                      )}

                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                          {!isOverviewObjectives && (
                                            <>
                                              <Select
                                                value={objectiveGenerationLevel}
                                                onValueChange={(value) => setObjectiveGenerationLevel(value as BloomLevel)}
                                              >
                                                <SelectTrigger className="h-9 w-full sm:w-[170px]">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {BLOOM_LEVEL_OPTIONS.map((option) => (
                                                    <SelectItem key={`generate-${option.value}`} value={option.value}>
                                                      {option.label}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              <Button type="button" variant="outline" size="sm" disabled={generateLessonObjectivesMutation.isPending || !objectiveSourceSelection} onClick={() => {
                                                  setObjectiveDraftError(null);
                                                  if (!objectiveSourceSelection) {
                                                    setObjectiveDraftError('Select a source/version before generating objectives.');
                                                    return;
                                                  }
                                                  generateLessonObjectivesMutation.mutate({
                                                    lessonId: topic.lessonId!,
                                                    targetLevel: objectiveGenerationLevel,
                                                    sourceSelection: objectiveSourceSelection,
                                                  });
                                                }}
                                                data-testid={`button-generate-objectives-${topic.lessonId}`}
                                              >
                                                {generateLessonObjectivesMutation.isPending ? (
                                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                                ) : (
                                                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                                                )}
                                                Generate Objectives
                                              </Button>
                                            </>
                                          )}
                                          <Button type="button" variant="secondary" size="sm" onClick={() => {
                                              setObjectiveDraftRows([
                                                ...objectiveDraftRows,
                                                { id: `obj-${Date.now()}`, objective: '', bloomLevel: isOverviewObjectives ? 'understand' : objectiveGenerationLevel },
                                              ]);
                                            }}
                                            data-testid={`button-add-objective-${topic.lessonId}`}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" />
                                            Add Objective
                                          </Button>
                                        </div>
                                        <div className="flex gap-2">
                                          <Button type="button" variant="outline" size="sm" onClick={closeObjectivesEditor} >
                                            Cancel
                                          </Button>
                                          <Button type="button" size="sm" disabled={saveLessonObjectivesMutation.isPending} onClick={() => {
                                              setObjectiveDraftError(null);
                                              const normalizedObjectives = objectiveDraftRows
                                                .map((row) => String(row.objective || '').trim())
                                                .filter((row) => row.length > 0);
                                              if (normalizedObjectives.length === 0) {
                                                setObjectiveDraftError('Add at least one learning objective before saving.');
                                                return;
                                              }
                                              saveLessonObjectivesMutation.mutate({
                                                lessonId: topic.lessonId!,
                                                topicId: objectivesEditorTopicId || topic.id,
                                                objectives: objectiveDraftRows,
                                                sourceContract: objectiveLastGeneratedSourceContract,
                                              });
                                            }}
                                            data-testid={`button-save-objectives-${topic.lessonId}`}
                                          >
                                            {saveLessonObjectivesMutation.isPending ? (
                                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                            ) : (
                                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                            )}
                                            Save Objectives
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        
	                        {!(topic.lessonId && lessonData && isLessonContentReady) && (
	                        <div className={`flex w-full ${isOverviewOrTakeaways ? '' : 'sm:w-auto sm:ml-auto'} gap-2 flex-wrap items-center ${isOverviewOrTakeaways ? 'justify-start' : 'justify-end'} self-start shrink-0`}>
                          {getLessonType(topic) !== 'overview' &&
                            getLessonType(topic) !== 'key_takeaways' &&
                            !(topic.lessonId && lessonData && lessonData.generationStatus === 'completed') &&
                            !(topic.lessonId && lessonData && isLessonContentReady) && (
                            <div className="flex items-center gap-1 mr-1">
                              <div className="hidden sm:flex items-center gap-1">
                                <Button variant="outline" size="sm" onClick={() => handleMoveUp(topic)}
                                  disabled={index === 0 || reorderMutation.isPending}
                                  className="h-8 px-2"
                                  style={index === 0 || reorderMutation.isPending ? undefined : lessonReorderButtonStyle}
                                  data-testid={`button-move-up-${index}`}
                                  title="Move lesson up"
                                >
                                  <ChevronUp className="h-4 w-4 mr-1" />
                                  Move Up
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleMoveDown(topic, visibleTopics.length - 1)}
                                  disabled={index === visibleTopics.length - 1 || reorderMutation.isPending}
                                  className="h-8 px-2"
                                  style={index === visibleTopics.length - 1 || reorderMutation.isPending ? undefined : lessonReorderButtonStyle}
                                  data-testid={`button-move-down-${index}`}
                                  title="Move lesson down"
                                >
                                  <ChevronDown className="h-4 w-4 mr-1" />
                                  Move Down
                                </Button>
                              </div>
                              <div className="sm:hidden">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 px-2" style={lessonReorderButtonStyle} data-testid={`button-reorder-${index}`} title="Reorder lesson" >
                                      Reorder
                                      <ChevronDown className="h-4 w-4 ml-1" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => handleMoveUp(topic)}
                                      disabled={index === 0 || reorderMutation.isPending}
                                    >
                                      <ChevronUp className="h-4 w-4 mr-2" />
                                      Move Up
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleMoveDown(topic, visibleTopics.length - 1)}
                                      disabled={index === visibleTopics.length - 1 || reorderMutation.isPending}
                                    >
                                      <ChevronDown className="h-4 w-4 mr-2" />
                                      Move Down
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          )}
                          {!topic.lessonId ? (
                            <>
                              <Button variant="secondary" onClick={() => handleOpenPicker(topic)}
                                data-testid={`button-attach-lesson-${index}`}
                              >
                                <Link2 className="h-4 w-4 mr-2" />
                                Attach
                              </Button>
                              <Link href={`/course-builder/${courseId}/upload/${topic.order}`}>
                                <Button variant="secondary" data-testid={`button-upload-lesson-${index}`} >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload
                                </Button>
                              </Link>
                              <Link href={`/lessons/new?courseId=${courseId}&topicId=${topic.id}&topicName=${encodeURIComponent(topic.name)}&topicDescription=${encodeURIComponent(topic.description || '')}&topicOrder=${topic.order}&isOverview=${topic.order === 0 || topic.isOverview === true}&prefillTitle=${encodeURIComponent(topic.name)}&returnToCourse=true`}>
                                <Button variant="default" data-testid={`button-generate-lesson-${index}`} >
                                  <Wand2 className="h-4 w-4 mr-2" />
                                  Generate
                                </Button>
                              </Link>
                            </>
                          ) : (
                            <>
                              {/* Lesson generation actions for structural lessons (overview/key takeaways) and pending/failed lessons */}
                              {lessonData && (
                                ((getLessonType(topic) === 'overview' || getLessonType(topic) === 'key_takeaways')
                                  || (!hasEffectiveContent && (lessonData.generationStatus === 'pending' || lessonData.generationStatus === 'failed')))
                              ) && (
                                <>
                                  {/* Content status badge - shows content readiness */}
                                  {(() => {
                                    const contentStatus = getContentStatus(lessonData, topic.order);
                                    const lessonType = getLessonType(topic);

                                    if (contentStatus) {
                                      if (lessonType === 'overview' && contentStatus.type !== 'complete') {
                                        if (generationReadiness?.overview?.ready) {
                                          return (
                                            <Button variant="outline" size="sm" className="mr-2" onClick={() => generateOverviewMutation.mutate()}
                                              disabled={generateOverviewMutation.isPending}
                                            >
                                              {generateOverviewMutation.isPending ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                  Generating...
                                                </>
                                              ) : (
                                                <>
                                                  <Sparkles className="h-3 w-3 mr-1 text-primary" />
                                                  Generate Overview ({platformPricing?.platformPricing?.creditsPerOverviewGeneration ?? 25} {LP_CREDITS_SHORT})
                                                </>
                                              )}
                                            </Button>
                                          );
                                        } else {
                                          const isChecking = !generationReadiness?.overview;
                                          const readyCount = generationReadiness?.overview?.readyCount ?? 0;
                                          const totalRequired = generationReadiness?.overview?.totalRequired ?? 0;
                                          const blocked = getBlockedDependencySummary(generationReadiness, 'overview');
                                          const missingPreview = blocked.missingLessons.slice(0, 2);
                                          return (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span>
                                                    <Button variant="outline" size="sm" className="mr-2 opacity-50 cursor-not-allowed" disabled >
                                                      <Sparkles className="h-3 w-3 mr-1" />
                                                      Generate Overview
                                                      {!isChecking && totalRequired > 0 && (
                                                        <Badge variant="outline" className="ml-1 text-xs py-0 px-1">
                                                          {readyCount}/{totalRequired}
                                                        </Badge>
                                                      )}
                                                    </Button>
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {isChecking ? (
                                                    <p>Checking overview prerequisites...</p>
                                                  ) : (
                                                    <div className="space-y-1">
                                                      <p>
                                                        {Math.max(0, totalRequired - readyCount)} dependency item(s) are still incomplete.
                                                      </p>
                                                      {blocked.keyTakeawaysMissing && (
                                                        <p>Key takeaways required steps (source + objectives + digest + PPTX/video + quiz) must be complete first.</p>
                                                      )}
                                                      {missingPreview.map((entry, idx) => (
                                                        <p key={`overview-dependency-${idx}`}>{entry}</p>
                                                      ))}
                                                    </div>
                                                  )}
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          );
                                        }
                                      }

                                      if (lessonType === 'key_takeaways') {
                                        const localSourceGenerated = hasTakeawaysGenerationManifest(lessonData);
                                        const sourceGenerated = !!generationReadiness?.takeaways?.sourceGenerated && localSourceGenerated;
                                        if (generationReadiness?.takeaways?.ready) {
                                          return (
                                            <Button variant="outline" size="sm" className="mr-2" onClick={() => generateTakeawaysMutation.mutate()}
                                              disabled={generateTakeawaysMutation.isPending}
                                            >
                                              {generateTakeawaysMutation.isPending ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                  Generating...
                                                </>
                                              ) : (
                                                <>
                                                  <Sparkles className="h-3 w-3 mr-1 text-primary" />
                                                  {sourceGenerated ? 'Regenerate Takeaways' : 'Generate Takeaways'} ({platformPricing?.platformPricing?.creditsPerKeyTakeawaysGeneration ?? 25} {LP_CREDITS_SHORT})
                                                </>
                                              )}
                                            </Button>
                                          );
                                        } else {
                                          const isChecking = !generationReadiness?.takeaways;
                                          const readyCount = generationReadiness?.takeaways?.readyCount ?? 0;
                                          const totalContent = generationReadiness?.takeaways?.totalContent ?? 0;
                                          const blocked = getBlockedDependencySummary(generationReadiness, 'takeaways');
                                          const missingPreview = blocked.missingLessons.slice(0, 2);
                                          return (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span>
                                                    <Button variant="outline" size="sm" className="mr-2 opacity-50 cursor-not-allowed" disabled >
                                                      <Sparkles className="h-3 w-3 mr-1" />
                                                      Generate Takeaways
                                                      {!isChecking && totalContent > 0 && (
                                                        <Badge variant="outline" className="ml-1 text-xs py-0 px-1">
                                                          {readyCount}/{totalContent}
                                                        </Badge>
                                                      )}
                                                    </Button>
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {isChecking ? (
                                                    <p>Checking key takeaways prerequisites...</p>
                                                  ) : (
                                                    <div className="space-y-1">
                                                      {generationReadiness?.takeaways?.sourceGenerated ? (
                                                        <p>Key takeaways source is already generated. Complete remaining required steps below.</p>
                                                      ) : (
                                                        <p>
                                                          {Math.max(0, totalContent - readyCount)} content lesson(s) still need content + objectives + digest + PPTX/video + quiz.
                                                        </p>
                                                      )}
                                                      {missingPreview.map((entry, idx) => (
                                                        <p key={`takeaways-dependency-${idx}`}>{entry}</p>
                                                      ))}
                                                    </div>
                                                  )}
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          );
                                        }
                                      }

                                      return (
                                        null
                                      );
                                    }
                                    return null;
                                  })()}
                                  {/* Feedback processing indicator */}
                                  {topic.lessonId && lessonData?.feedbackStatus === 'processing' && (
                                    <Badge variant="outline" className="animate-pulse mr-2">
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Analyzing...
                                    </Badge>
                                  )}
                                  {/* 3-dot menu with Upload, Edit, Delete, Generate */}
                                  {organizationId && courseId && (() => {
                                    const menuProps = getProgressiveMenuProps(lessonData, topic);
                                    if (menuProps.hideMenu) return null;
                                    return (
                                      <LessonActionsMenu
                                        lesson={lessonData}
                                        context="course-builder"
                                        organizationId={organizationId}
                                        isAnyLessonGenerating={isAnyLessonGenerating}
                                        courseId={courseId}
                                        topicId={topic.id}
                                        topicName={topic.name}
                                        topicOrder={topic.order}
                                        courseLessonType={lessonType}
                                        isOverviewLesson={getLessonType(topic) === 'overview'}
                                        hideMenu={menuProps.hideMenu}
                                        showView={menuProps.showView ?? false}
                                        showEdit={menuProps.showEdit ?? true}
                                        showGenerateQuiz={menuProps.showGenerateQuiz ?? false}
                                        showEditQuiz={menuProps.showEditQuiz ?? false}
                                        showDownloadPPTX={menuProps.showDownloadPPTX ?? false}
                                        showReplacePPTX={menuProps.showReplacePPTX ?? false}
                                        showUploadPPTX={menuProps.showUploadPPTX ?? true}
                                        showUploadVideo={menuProps.showUploadVideo ?? false}
                                        showRegenerate={menuProps.showRegenerate ?? false}
                                        showGenerate={menuProps.showGenerate ?? false}
                                        showDelete={menuProps.showDelete ?? false}
                                        showArchive={false}
                                        showRemoveFromCourse={menuProps.showRemoveFromCourse ?? false}
                                        showSetCourseLessonType={true}
                                        showUploadContent={menuProps.showUploadContent ?? true}
                                        showViewContent={menuProps.showViewContent ?? false}
                                        showViewChanges={menuProps.showViewChanges ?? false}
                                        showViewLastReport={menuProps.showViewLastReport ?? false}
                                      showSetLearningObjectives={
                                        getLessonType(topic) === 'content' ||
                                          getLessonType(topic) === 'overview' ||
                                          (getLessonType(topic) === 'key_takeaways' && !!generationReadiness?.takeaways?.ready)
                                        }
                                        showGenerateSourceDbContent={lessonType === 'overview' || lessonType === 'key_takeaways'}
                                        generateSourceDbContentLabel={lessonType === 'overview'
                                          ? (hasEffectiveContent ? 'Regenerate Overview Source DB Content' : 'Generate Overview Source DB Content')
                                          : (hasEffectiveContent ? 'Regenerate Key Takeaways Source DB Content' : 'Generate Key Takeaways Source DB Content')}
                                        canGenerateSourceDbContent={canGenerateStructuralSourceDb}
                                        isGeneratingSourceDbContent={lessonType === 'overview' ? generateOverviewMutation.isPending : (lessonType === 'key_takeaways' ? generateTakeawaysMutation.isPending : false)}
                                        sourceDbContentBlockedReason={sourceDbBlockedReason}
                                        onGenerateSourceDbContent={() => {
                                          if (lessonType === 'overview') {
                                            if (generationReadiness?.overview?.ready) {
                                              generateOverviewMutation.mutate();
                                            } else {
                                              toast({ title: 'Prerequisites pending', description: 'Complete prerequisites before generating overview.' });
                                            }
                                            return;
                                          }
                                          if (lessonType === 'key_takeaways') {
                                            if (generationReadiness?.takeaways?.ready) {
                                              generateTakeawaysMutation.mutate();
                                            } else {
                                              toast({ title: 'Prerequisites pending', description: 'Complete prerequisites before generating key takeaways.' });
                                            }
                                          }
                                        }}
                                        onViewLastReport={(selectedLessonId) => {
                                          const targetId = selectedLessonId || topic.lessonId!;
                                          setFeedbackLesson({ id: targetId, title: lessonData?.title || topic.name });
                                          lastFeedbackMutation.mutate(targetId);
                                        }}
                                        showGetFeedback={menuProps.showGetFeedback ?? false}
                                        onGetFeedback={(selectedLessonId) => {
                                          const targetId = selectedLessonId || topic.lessonId!;
                                          setFeedbackLesson({ id: targetId, title: lessonData?.title || topic.name });
                                          setConfirmFeedbackOpen(true);
                                        }}
                                        onSetLearningObjectives={(selectedLessonId) => {
                                          const targetId = selectedLessonId || topic.lessonId!;
                                          if (!targetId) return;
                                          openObjectivesEditor(topic, targetId);
                                        }}
                                        onActionComplete={handleActionComplete}
                                        onUploadContentSuccess={(result) => {
                                          toast({
                                            title: "Content uploaded",
                                            description: `Extracted ${result.extractedWordCount} words. Consider running Expert Feedback to review the content.`,
                                          });
                                          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
                                        }}
                                        triggerClassName="h-8 sm:h-9 px-2 whitespace-nowrap text-xs sm:text-sm"
                                        triggerStyle={lessonActionsButtonStyle}
                                      />
                                    );
                                  })()}
                                </>
                              )}
                              {/* Show processing indicator for lessons being generated */}
                              {lessonData?.generationStatus === 'processing' && (
                                <Badge variant="outline" className="animate-pulse">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Generating...
                                </Badge>
                              )}
                              {/* Feedback processing indicator for completed lessons */}
                              {lessonData && lessonData.generationStatus === 'completed' && topic.lessonId && lessonData.feedbackStatus === 'processing' && (
                                <Badge variant="outline" className="animate-pulse mr-2">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Analyzing...
                                </Badge>
                              )}
                              {/* Translate button - always visible with deterministic blockers */}
                              {lessonData && courseId && lessonData.generationStatus !== 'completed' && (() => {
                                const hasTranslatableArtifacts = !!(
                                  String(lessonData.inputText || '').trim() ||
                                  lessonData.sourceDocumentPath ||
                                  lessonData.storageKey ||
                                  lessonData.gammaCardId ||
                                  lessonData.linkedQuizId ||
                                  (lessonData.linkedQuizCount !== undefined && lessonData.linkedQuizCount > 0)
                                );
                                const translateBlockedReason = hasTranslatableArtifacts
                                  ? null
                                  : 'No translatable artifacts found yet';
                                return (
                                  <Button variant="outline" size="sm" onClick={() => setLocation(`/course-builder/${courseId}/lessons/${lessonData.id}/translate`)}
                                    title={translateBlockedReason || 'Translate this lesson'}
                                    className="h-8 text-primary hover:text-primary gap-1"
                                    style={translateBlockedReason ? undefined : lessonTranslateButtonStyle}
                                    disabled={!!translateBlockedReason}
                                  >
                                    <Globe className="h-4 w-4" />
                                    Translate
                                    {(translationStatuses?.[lessonData.id] || []).map((job: any) => {
                                      const langCode = job.targetLanguageCode?.toUpperCase();
                                      if (!langCode) return null;
                                      if (job.status === 'translating') {
                                        return (
                                          <Badge key={langCode} variant="info" className="ml-0.5 px-1 py-0">
                                            <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                                            {langCode}
                                          </Badge>
                                        );
                                      }
                                      if (job.currentStep === 'published') {
                                        return (
                                          <Badge key={langCode} variant="success" className="ml-0.5 px-1 py-0">
                                            {langCode} ✓
                                          </Badge>
                                        );
                                      }
                                      return (
                                        <Badge key={langCode} variant="warning" className="ml-0.5 px-1 py-0">
                                          {langCode}
                                        </Badge>
                                      );
                                    })}
                                    {(() => {
                                      const langData = lessonLanguages?.[lessonData.id];
                                      const langs = langData?.languages || [];
                                      const processingFeedbackLangs = langs.filter(l => l.feedbackStatus === 'processing');
                                      if (processingFeedbackLangs.length === 0) return null;
                                      return processingFeedbackLangs.map((l) => (
                                        <Badge key={`feedback-${l.code}`} variant="info" className="ml-0.5 px-1 py-0">
                                          <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                                          {l.code.toUpperCase()} analyzing
                                        </Badge>
                                      ));
                                    })()}
                                  </Button>
                                );
                              })()}
                            </>
                          )}
	                        </div>
	                        )}
	                      </div>
	                    </CardHeader>
	                  </Card>
                );
              })}
            </div>

            {relinkableLessons && relinkableLessons.lessons && relinkableLessons.lessons.length > 0 && (
              <Card className="bg-accent/10 border-accent/30">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-full bg-accent/20">
                        <Archive className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-accent text-lg">Archived Lessons</CardTitle>
                        <CardDescription className="text-accent/70">
                          {relinkableLessons.lessons.length} previously unlinked lesson{relinkableLessons.lessons.length > 1 ? 's' : ''} available for restoration
                        </CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => setArchivedLessonsOpen(true)}
                      className="border-accent/50 text-accent hover:bg-accent/20"
                      data-testid="button-view-archived-lessons"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      View & Restore
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )}

            <Card className="bg-card/50 border-border">
              <CardContent className="py-6">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-foreground font-semibold flex items-center gap-2">
                        Course Progress
                        {courseProgress && (
                          <Badge variant={courseProgress.allReady ? 'success' : 'outline'} className="ml-1">
                            {courseProgress.completedLessons}/{courseProgress.totalLessons} lessons ready
                          </Badge>
                        )}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">
                        {courseProgress?.allReady 
                          ? 'All lessons meet the requirements. Review the checklist below before publishing.'
                          : 'Complete the steps below for each lesson to prepare your course for publishing.'}
                      </p>
                    </div>
                    
                    <div className="flex gap-3">
                      <Link href={`/course-builder/${courseId}/preview`}>
                        <Button variant="outline" data-testid="button-preview" >
                          <BookOpen className="h-4 w-4 mr-2" />
                          Preview Course
                        </Button>
                      </Link>
                      {(() => {
                        const isAlreadyPublished = course?.status === 'active' || !!course?.publishedAt;
                        const isDisabled = !isAlreadyPublished && (!canPublishCourse.canPublish || generatedCount < totalCount || publishCourseMutation.isPending);
                        
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button className={`${ !isDisabled ? 'bg-success text-foreground' : 'bg-muted cursor-not-allowed text-muted-foreground' }`} disabled={isDisabled} onClick={() => {
                                      if (isAlreadyPublished) {
                                        setAssignmentModalOpen(true);
                                      } else {
                                        setPublishModalOpen(true);
                                      }
                                    }}
                                    data-testid="button-publish"
                                  >
                                    {publishCourseMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                    )}
                                    {publishCourseMutation.isPending 
                                      ? 'Publishing...' 
                                      : isAlreadyPublished 
                                        ? 'Assign Course' 
                                        : 'Publish Course'}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {!isAlreadyPublished && !canPublishCourse.canPublish && (
                                <TooltipContent side="bottom" className="max-w-sm">
                                  <div className="space-y-1">
                                    <p className="font-semibold">Cannot publish:</p>
                                    {canPublishCourse.errors.slice(0, 5).map((error, i) => (
                                      <p key={i} className="text-sm">• {error}</p>
                                    ))}
                                    {canPublishCourse.errors.length > 5 && (
                                      <p className="text-sm text-muted-foreground">
                                        ...and {canPublishCourse.errors.length - 5} more issues
                                      </p>
                                    )}
                                  </div>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>
                  </div>
                  
                  {courseProgress && courseProgress.totalLessons > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-9 gap-2">
                      {[
                        { label: 'Content', count: courseProgress.withDoc, total: courseProgress.totalLessons, icon: '📄' },
                        { label: 'Feedback', count: courseProgress.withFeedback, total: courseProgress.contentCount, icon: '💬' },
                        { label: 'PPTX', count: courseProgress.withPPTX, total: courseProgress.totalLessons, icon: '📊' },
                        { label: 'Quiz', count: courseProgress.withQuiz, total: courseProgress.totalLessons, icon: '❓' },
                        { label: 'Video', count: courseProgress.withVideo, total: courseProgress.totalLessons, icon: onpremMode ? '🎬' : '🎥' },
                        { label: 'Podcast', count: courseProgress.withPodcast, total: courseProgress.totalLessons, icon: '🎙️' },
                        { label: 'Lesson Digest', count: courseProgress.withDigest, total: courseProgress.totalLessons, icon: '📘' },
                        { label: 'Translations', count: courseProgress.withTranslations, total: courseProgress.totalLessons, icon: '🌐' },
                        { label: 'Complete', count: courseProgress.completedLessons, total: courseProgress.totalLessons, icon: '✅' },
                      ].map((item) => (
                        <div key={item.label} className="p-2 rounded-lg bg-muted/30 border border-border/50 text-center">
                          <div className="text-lg">{item.icon}</div>
                          <div className={`text-sm font-semibold ${item.count === item.total && item.total > 0 ? 'text-success' : 'text-foreground'}`}>
                            {item.count}/{item.total}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{item.label}{item.label === 'Video' ? ' (Rec)' : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {courseProgress?.allReady && !(course?.status === 'active' || !!course?.publishedAt) && (
                    <div className="p-4 rounded-lg bg-success/5 border border-success/20 space-y-3">
                      <h4 className="font-semibold text-success flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        Ready to Publish — Review Checklist
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${course?.thumbnailUrl ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                            {course?.thumbnailUrl ? '✓' : '!'}
                          </div>
                          <span className="text-muted-foreground">Course thumbnail</span>
                          <Link href={`/course-builder/${courseId}`}>
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                              Review
                            </Button>
                          </Link>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${course?.price ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                            {course?.price ? '✓' : '!'}
                          </div>
                          <span className="text-muted-foreground">Pricing & visibility</span>
                          <Link href={`/course-builder/${courseId}`}>
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                              Review
                            </Button>
                          </Link>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${courseProgress.withVideo === courseProgress.totalLessons ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                            {courseProgress.withVideo === courseProgress.totalLessons ? '✓' : '!'}
                          </div>
                          <span className="text-muted-foreground">
                            Videos {courseProgress.withVideo}/{courseProgress.totalLessons}
                            {courseProgress.withVideo < courseProgress.totalLessons && ' (Recommended)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${hasPublishScopeAssignment ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                            {hasPublishScopeAssignment ? '✓' : '!'}
                          </div>
                          <span className="text-muted-foreground">
                            {terminology.unit} assignment{assignedUnitCount > 1 ? `s (${assignedUnitCount})` : ''}
                          </span>
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setAssignmentModalOpen(true)}>
                            {hasPublishScopeAssignment ? 'Manage' : 'Assign'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {courseId && (
        <LessonPickerModal
          isOpen={pickerModalOpen}
          onClose={() => {
            setPickerModalOpen(false);
            setSelectedTopic(null);
          }}
          courseId={courseId}
          topicId={selectedTopic?.id}
          topicName={selectedTopic?.name}
          topicOrder={selectedTopic?.order}
          onLessonAttached={handleLessonAttached}
        />
      )}

      <Dialog open={slotSelectorOpen} onOpenChange={setSlotSelectorOpen}>
        <DialogContent className="max-w-[min(500px,95vw)] max-h-[85vh] flex flex-col bg-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Library className="h-5 w-5" />
              Select Topic Slot
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Choose which topic slot to add a lesson to. You can attach an existing lesson from your library or create a new one.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 py-2">
              {getAvailableTopicSlots().map((topic) => (
                <Card 
                  key={getTopicIdentifier(topic)}
                  className="bg-card/50 border-border hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => handleSlotSelected(topic)}
                  data-testid={`slot-option-${topic.order}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/30 text-sm font-bold shrink-0">
                          {topic.order + 1}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-foreground truncate">
                            {topic.name}
                          </h4>
                          {topic.description && (
                            <p className="text-muted-foreground text-sm truncate">
                              {topic.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={(e) => {
                            e.stopPropagation();
                            handleSlotSelected(topic);
                          }}
                          className="border-secondary/50 text-secondary hover:bg-secondary/20"
                          data-testid={`button-select-slot-${topic.order}`}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Attach
                        </Button>
                        <Link 
                          href={`/lessons/new?courseId=${courseId}&topicId=${topic.id}&topicName=${encodeURIComponent(topic.name)}&topicDescription=${encodeURIComponent(topic.description || '')}&topicOrder=${topic.order}&isOverview=${topic.order === 0 || topic.isOverview === true}&prefillTitle=${encodeURIComponent(topic.name)}&returnToCourse=true`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" data-testid={`button-create-lesson-slot-${topic.order}`} >
                            <Wand2 className="h-4 w-4 mr-1" />
                            Create
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {getAvailableTopicSlots().length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No available topic slots</p>
                  <p className="text-sm mt-1">All topics already have lessons assigned</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="flex-shrink-0 mt-4 flex justify-between items-center pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {getAvailableTopicSlots().length} available slot{getAvailableTopicSlots().length !== 1 ? 's' : ''}
            </p>
            <Button variant="outline" onClick={() => setSlotSelectorOpen(false)}
              className="border-border text-muted-foreground hover:bg-accent"
              data-testid="button-cancel-slot-selector"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={relinkDialogOpen} onOpenChange={setRelinkDialogOpen}>
        <AlertDialogContent className="max-w-[min(425px,90vw)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Previously Linked Lesson</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUnlinkedTopic && (
                <>
                  Would you like to restore the lesson that was previously linked to "{selectedUnlinkedTopic.name}"? 
                  This will reconnect the original lesson to this topic.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel 
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-cancel-relink"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUnlinkedTopic?.previousLessonId) {
                  relinkMutation.mutate({ 
                    lessonId: selectedUnlinkedTopic.previousLessonId,
                    orderOverride: selectedUnlinkedTopic.order
                  });
                }
              }}
              className="bg-accent hover:bg-accent/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-confirm-relink"
            >
              {relinkMutation.isPending ? 'Restoring...' : 'Restore Lesson'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={archivedLessonsOpen} onOpenChange={setArchivedLessonsOpen}>
        <DialogContent className="max-w-[min(600px,95vw)] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-accent" />
              Archived Lessons
            </DialogTitle>
            <DialogDescription>
              These lessons were previously removed from the course. You can restore them to recover all associated quiz links and scope assignments.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 py-2">
              {relinkableLessons?.lessons?.map((lesson) => {
                const isStale = isLessonStale(lesson.unlinkedAt);
                const daysSince = getDaysSinceUnlinked(lesson.unlinkedAt);
                const originalSlot = topics.find(t => t.order === lesson.previousOrder);
                const isSlotTaken = originalSlot?.lessonId !== null && originalSlot?.lessonId !== undefined;
                
                return (
                  <Card 
                    key={lesson.id} 
                    className={`bg-card/50 border-border ${isStale ? 'border-l-4 border-l-warning' : 'border-l-4 border-l-accent'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-foreground text-sm truncate">
                              {lesson.title}
                            </h4>
                            {lesson.description && (
                              <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                                {lesson.description}
                              </p>
                            )}
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleRestoreArchivedLesson(lesson)}
                            disabled={relinkMutation.isPending}
                            className="border-accent/50 text-accent hover:bg-accent/20 shrink-0"
                            data-testid={`button-restore-archived-${lesson.id}`}
                          >
                            {relinkMutation.isPending && selectedArchivedLesson?.id === lesson.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restore
                              </>
                            )}
                          </Button>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="secondary">
                            <MapPin className="h-3 w-3 mr-1" />
                            Topic {lesson.previousOrder + 1}: {lesson.previousTopicName}
                          </Badge>
                          <Badge variant={isStale ? 'warning' : 'secondary'} >
                            <Clock className="h-3 w-3 mr-1" />
                            Removed {formatUnlinkedDate(lesson.unlinkedAt)} ({daysSince} days ago)
                          </Badge>
                          {isSlotTaken && (
                            <Badge variant="info">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Position reassigned
                            </Badge>
                          )}
                          {isStale && (
                            <Badge variant="warning">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Stale (30+ days)
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{lesson.generationStatus?.replace('_', ' ') || 'Unknown'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              
              {(!relinkableLessons?.lessons || relinkableLessons.lessons.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No archived lessons available</p>
                  <p className="text-sm mt-1">Lessons will appear here after being removed from the course</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={staleConfirmOpen} onOpenChange={setStaleConfirmOpen}>
        <AlertDialogContent className="max-w-[min(500px,90vw)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Stale Lesson Warning
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {selectedArchivedLesson && (
                <>
                  <p>
                    This lesson was removed <strong>{getDaysSinceUnlinked(selectedArchivedLesson.unlinkedAt)} days ago</strong>. 
                    Restoring it will recover:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Quiz links that were attached to this lesson</li>
                    <li>Scope assignments (learner/instructor visibility)</li>
                  </ul>
                  <p className="text-warning">
                    Note: Some linked quizzes or scope targets may no longer exist.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel 
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-cancel-stale-relink"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStaleRelink}
              className="bg-warning hover:bg-warning/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={relinkMutation.isPending}
              data-testid="dialog-confirm-stale-relink"
            >
              {relinkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Restore Anyway'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={orderOverrideDialogOpen} onOpenChange={(open: boolean) => {
        setOrderOverrideDialogOpen(open);
        if (!open) {
          setSelectedOrderOverride('');
        }
      }}>
        <AlertDialogContent className="max-w-[min(500px,90vw)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Choose Topic Position
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {selectedArchivedLesson && (
                <>
                  <p>
                    The original position (Topic {selectedArchivedLesson.previousOrder + 1}: {selectedArchivedLesson.previousTopicName}) 
                    already has a lesson assigned. Please select a different topic position:
                  </p>
                  <div className="mt-4">
                    <Select 
                      value={selectedOrderOverride} 
                      onValueChange={setSelectedOrderOverride}
                    >
                      <SelectTrigger 
                        className="w-full bg-input border-border text-foreground"
                        data-testid="select-order-override"
                      >
                        <SelectValue placeholder="Select a topic position..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {getAvailableTopicSlots().map((topic) => (
                          <SelectItem 
                            key={topic.order} 
                            value={topic.order.toString()}
                            className="text-foreground hover:bg-accent"
                          >
                            Topic {topic.order + 1}: {topic.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {getAvailableTopicSlots().length === 0 && (
                      <p className="text-destructive text-sm mt-2">
                        No available topic positions. Please remove a lesson from another topic first.
                      </p>
                    )}
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel 
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-cancel-order-override"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOrderOverride}
              className="bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={!selectedOrderOverride || relinkMutation.isPending || getAvailableTopicSlots().length === 0}
              data-testid="dialog-confirm-order-override"
            >
              {relinkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Restore to Selected Position'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LessonEditDialog
        lesson={editLesson}
        open={editDialogOpen}
        onOpenChange={(open: boolean) => {
          setEditDialogOpen(open);
          if (!open) setEditLesson(null);
        }}
        organizationId={organizationId}
        courseId={courseId}
        onSuccess={handleActionComplete}
      />

      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent className="max-w-[min(425px,90vw)] p-[var(--dialog-padding)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Lesson from Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{lessonToUnlink?.title}" from this course? The lesson will remain in your Lesson Library and can be re-linked later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-cancel-unlink"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (lessonToUnlink) {
                  unlinkMutation.mutate({ lessonId: lessonToUnlink.lessonId });
                }
              }}
              className="bg-destructive hover:bg-destructive/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={unlinkMutation.isPending}
              data-testid="dialog-confirm-unlink"
            >
              {unlinkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createLessonDialogOpen} onOpenChange={(open: boolean) => {
        setCreateLessonDialogOpen(open);
        if (!open) {
          setNewLessonTitle('');
          setNewLessonDescription('');
        }
      }}>
        <DialogContent className="max-w-[min(500px,95vw)] bg-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Plus className="h-5 w-5" />
              Create New Lesson
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Add a new lesson topic to your course. Choose how you want to create the content.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="lesson-title" className="text-foreground">Lesson Title</Label>
              <Input
                id="lesson-title"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                placeholder="Enter lesson title..."
                className="bg-input border-border text-foreground"
                data-testid="input-lesson-title"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lesson-description" className="text-foreground">Description (optional)</Label>
              <Textarea
                id="lesson-description"
                value={newLessonDescription}
                onChange={(e) => setNewLessonDescription(e.target.value)}
                placeholder="Brief description of what this lesson covers..."
                className="bg-input border-border text-foreground min-h-[80px]"
                data-testid="input-lesson-description"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button onClick={() => handleCreateLessonAction('generate')}
              disabled={createTopicMutation.isPending || !newLessonTitle.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
              data-testid="button-generate-with-ai"
            >
              {createTopicMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Generate with AI ({lessonGenerationCost} {LP_CREDITS_SHORT})
            </Button>
            
            <Button onClick={() => handleCreateLessonAction('upload')}
              disabled={createTopicMutation.isPending || !newLessonTitle.trim()}
              variant="secondary"
              className="w-full"
              data-testid="button-upload-content"
            >
              {createTopicMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload Content
            </Button>
            
            <Button onClick={() => handleCreateLessonAction('manual')}
              disabled={createTopicMutation.isPending || !newLessonTitle.trim()}
              variant="outline"
              className="border-border text-muted-foreground hover:bg-accent w-full"
              data-testid="button-add-manually"
            >
              {createTopicMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4 mr-2" />
              )}
              Add Manually (No Content)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pptxActionContext} onOpenChange={(open: boolean) => !open && setPptxActionContext(null)}>
        <DialogContent className="max-w-[min(520px,95vw)]">
          <DialogHeader>
            <DialogTitle>Choose Next Step</DialogTitle>
            <DialogDescription>
              Complete this step for "{pptxActionContext?.lessonTitle}" using either PPTX or video.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button className="w-full justify-start" onClick={() => {
                if (!pptxActionContext) return;
                const topic: Topic = {
                  order: pptxActionContext.topicOrder,
                  name: pptxActionContext.topicName || pptxActionContext.lessonTitle,
                  id: pptxActionContext.topicId,
                  lessonId: pptxActionContext.lessonId,
                };
                setPptxActionContext(null);
                setLocation(buildLessonWizardUrl(pptxActionContext.lessonId, topic, pptxActionContext.lessonTitle));
              }}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Generate PPTX with AI
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => {
                if (!pptxActionContext) return;
                const uploadUrl = buildPptxUploadUrl(pptxActionContext.lessonId, pptxActionContext.topicOrder);
                setPptxActionContext(null);
                setLocation(uploadUrl);
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Existing PPTX
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => {
                if (!pptxActionContext) return;
                const lessonUrl = `/lessons/${pptxActionContext.lessonId}${courseId ? `?returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : ''}`;
                setPptxActionContext(null);
                setLocation(lessonUrl);
              }}
            >
              <Video className="h-4 w-4 mr-2" />
              Upload Video
            </Button>
            <p className="text-xs text-muted-foreground">
              Tip: after required artifacts are done, you can still complete optional enhancements.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPptxActionContext(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!optionalStepsContext} onOpenChange={(open: boolean) => !open && setOptionalStepsContext(null)}>
        <DialogContent className="max-w-[min(680px,95vw)]">
          <DialogHeader>
            <DialogTitle>Complete Optional Steps</DialogTitle>
            <DialogDescription>
              This lesson meets minimum requirements. It can be published once all other lessons also meet minimum requirements. You can continue with optional enhancements below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[55vh] overflow-y-auto py-2 pr-1">
            {(optionalStepsContext?.items || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No optional steps are pending for this lesson.</p>
            ) : (
              optionalStepsContext!.items.map((item) => (
                <div key={`optional-step-${optionalStepsContext?.lessonId}-${item.id}`} className="border rounded-md p-3 bg-muted/20">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      {item.detail && <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => {
                        if (!optionalStepsContext) return;
                        const lessonData = lessonsData?.[optionalStepsContext.lessonId];
                        if (!lessonData) return;
                        executeLessonActionItem(item, optionalStepsContext.topic, lessonData);
                        setOptionalStepsContext(null);
                      }}
                      disabled={!!optionalStepsContext?.lessonId && isLessonActionPending(optionalStepsContext.lessonId, item.id)}
                    >
                      {!!optionalStepsContext?.lessonId && isLessonActionPending(optionalStepsContext.lessonId, item.id) ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          {getLessonActionPendingLabel(item)}
                        </>
                      ) : (
                        'Start'
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionalStepsContext(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Content Coach Panel Dialog */}
      <Dialog open={!!coachPanelLesson} onOpenChange={(open: boolean) => !open && setCoachPanelLesson(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {coachPanelLesson && (
            <ContentCoachPanel
              lessonId={coachPanelLesson.id}
              lessonTitle={coachPanelLesson.title}
              onClose={() => setCoachPanelLesson(null)}
              organizationId={courseOrgId || (user as any)?.organizationId}
              courseId={courseId}
              onActionComplete={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Paid Feedback Confirmation Dialog */}
      <Dialog open={confirmFeedbackOpen} onOpenChange={setConfirmFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Get Expert Feedback
            </DialogTitle>
            <DialogDescription>
              {feedbackLesson?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Get detailed AI-powered feedback on your lesson content, including a quality score and improvement suggestions.
            </p>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">Cost</span>
              <Badge variant="outline" className="text-lg">
                <Coins className="h-4 w-4 mr-1" />
                {feedbackPricingData?.creditCost || 10} LPC
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => feedbackLesson && feedbackMutation.mutate(feedbackLesson.id)}
              disabled={feedbackMutation.isPending}
            >
              {feedbackMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Fix Confirmation Dialog */}
      <Dialog open={confirmFixOpen} onOpenChange={(open: boolean) => {
        setConfirmFixOpen(open);
        if (!open) setPendingFixAction(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {pendingFixAction === 'expand_abbreviations' ? 'Confirm Abbreviation Expansion' : 'Confirm AI Fix'}
            </DialogTitle>
            <DialogDescription>
              {feedbackLesson?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {pendingFixAction === 'ai_fix' ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  AI Fix will apply the following improvements:
                </p>
                <ul className="text-sm space-y-1 list-disc pl-5">
                  {pendingImprovementTitles.length > 0 ? pendingImprovementTitles.map((title, idx) => (
                    <li key={`pending-ai-fix-${idx}`}>{title}</li>
                  )) : (
                    <li>General quality and clarity improvements based on the latest feedback report.</li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  These abbreviations will be expanded at first occurrence:
                </p>
                <ul className="text-sm space-y-1 list-disc pl-5 max-h-40 overflow-auto">
                  {expandableAbbreviations.length > 0 ? expandableAbbreviations.map((abbr, idx) => (
                    <li key={`pending-abbr-fix-${idx}`}>
                      <span className="font-mono">{abbr.abbreviation}</span> {'->'} {abbr.expandedForm} ({abbr.abbreviation})
                    </li>
                  )) : (
                    <li>No expandable abbreviations were detected in this report.</li>
                  )}
                </ul>
              </div>
            )}

            <div className="rounded-md border p-3 bg-muted/30 text-xs text-muted-foreground">
              A new content version will be saved automatically. You can compare before/after from Lesson Actions {'->'} Version History.
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">Cost</span>
              <Badge variant="outline" className="text-lg">
                <Coins className="h-4 w-4 mr-1" />
                {aiFixCost} LPC
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setConfirmFixOpen(false);
              setPendingFixAction(null);
            }}>
              Cancel
            </Button>
            <Button disabled={ aiImproveMutation.isPending || abbreviationFixMutation.isPending || !feedbackLesson?.id || (pendingFixAction === 'expand_abbreviations' && expandableAbbreviations.length === 0) } onClick={() => {
                if (!feedbackLesson?.id) return;
                if (pendingFixAction === 'expand_abbreviations') {
                  abbreviationFixMutation.mutate({
                    lessonId: feedbackLesson.id,
                    abbreviations: expandableAbbreviations,
                  });
                  return;
                }
                aiImproveMutation.mutate({
                  lessonId: feedbackLesson.id,
                  feedbackReport: feedbackData?.report,
                });
              }}
            >
              {aiImproveMutation.isPending || abbreviationFixMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Apply Fix
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Results Dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={(open: boolean) => {
        setFeedbackDialogOpen(open);
        if (!open) setFeedbackData(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Expert Feedback Results
            </DialogTitle>
            <DialogDescription>
              {feedbackLesson?.title}
            </DialogDescription>
          </DialogHeader>
          {feedbackData && (
            <div className="space-y-6 py-4">
              {/* Score overview with quality rating */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/10 border border-border">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">
                    {feedbackData.score10}/10
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Quality Score</div>
                </div>
                {feedbackData.report?.qualityGrade && (
                  <div className="text-center px-4 border-l border-border">
                    <div className={`text-3xl font-bold ${
                      feedbackData.report.qualityGrade === 'A' ? 'text-success' :
                      feedbackData.report.qualityGrade === 'B' ? 'text-primary' :
                      feedbackData.report.qualityGrade === 'C' ? 'text-warning' :
                      feedbackData.report.qualityGrade === 'D' ? 'text-warning' : 'text-destructive'
                    }`}>
                      {feedbackData.report.qualityGrade}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Rating</div>
                  </div>
                )}
                <div className="flex-1">
                  <div className="w-full bg-muted rounded-full h-3">
                    <div 
                      className="bg-primary h-3 rounded-full transition-all" 
                      style={{ width: `${(feedbackData.score10 / 10) * 100}%` }}
                    />
                  </div>
                  {feedbackData.cached && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Cached result (no credits charged)
                    </p>
                  )}
                  {feedbackData.improvement !== null && feedbackData.improvement !== undefined && (
                    <p className={`text-xs mt-2 ${feedbackData.improvement >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {feedbackData.improvement >= 0 ? '↑' : '↓'} {Math.abs(feedbackData.improvement).toFixed(1)} from previous
                    </p>
                  )}
                  {feedbackData.generatedAt && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Feedback from {new Date(feedbackData.generatedAt).toLocaleDateString(undefined, { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              </div>

              {/* 7-Dimensional Quality Rubric */}
              {feedbackData.report?.rubric && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Quality Dimensions
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(feedbackData.report.rubric).map(([dimension, data]: [string, any]) => (
                      <div key={dimension} className="flex items-center gap-3 p-2 bg-muted/30 rounded">
                        <span className="text-sm font-medium w-28 capitalize">{dimension.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              data.score >= 80 ? 'bg-success' :
                              data.score >= 60 ? 'bg-primary' :
                              data.score >= 40 ? 'bg-warning' : 'bg-destructive'
                            }`}
                            style={{ width: `${data.score}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{data.score}/100</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority Improvements */}
              {feedbackData.report?.topImprovements && feedbackData.report.topImprovements.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Priority Improvements
                  </h4>
                  <ul className="space-y-2">
                    {feedbackData.report.topImprovements.map((item: any, index: number) => (
                      <li key={`improvement-${index}-${item.title || item.priority}`} className="text-sm flex flex-col gap-1 p-3 bg-muted/30 rounded border-l-2 border-[var(--warning)]">
                        <div className="flex items-center gap-2">
                          <Badge variant={ item.priority === 'critical' ? 'destructive' : item.priority === 'important' ? 'warning' : 'secondary' } className="text-xs">
                            {item.priority}
                          </Badge>
                          <span className="text-xs text-muted-foreground capitalize">{item.category || item.dimension}</span>
                        </div>
                        <span className="font-medium text-foreground">{item.title}</span>
                        {item.description && (
                          <span className="text-muted-foreground">{item.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Strengths */}
              {feedbackData.report?.strengths && feedbackData.report.strengths.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Strengths
                  </h4>
                  <ul className="space-y-2">
                    {feedbackData.report.strengths.map((strength: string, index: number) => (
                      <li key={`strength-${index}-${strength.substring(0, 20)}`} className="text-sm text-muted-foreground flex items-start gap-2 p-2 bg-success/10 rounded">
                        <span className="text-success">✓</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bloom's Taxonomy Coverage */}
              {feedbackData.report?.bloomLevelsCovered && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Bloom's Taxonomy Coverage
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'].map((level) => {
                      const covered = feedbackData.report.bloomLevelsCovered?.includes(level);
                      return (
                        <Badge key={level} variant={covered ? 'default' : 'outline'} className={covered ? 'bg-primary' : 'text-muted-foreground'} >
                          {covered && <CheckCircle className="h-3 w-3 mr-1" />}
                          {level}
                        </Badge>
                      );
                    })}
                  </div>
                  {feedbackData.report.missingBloomLevels?.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Consider adding content for: {feedbackData.report.missingBloomLevels.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Word Count */}
              {(feedbackData.report?.wordCount !== undefined) && (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm">
                  <span className="text-muted-foreground">Content Length</span>
                  <span className="font-medium">
                    {feedbackData.report.wordCount} / {feedbackData.report.targetWordCount || 500} words
                    {feedbackData.report.wordCount >= (feedbackData.report.targetWordCount || 500) 
                      ? <CheckCircle className="h-3 w-3 inline ml-2 text-success" />
                      : <AlertTriangle className="h-3 w-3 inline ml-2 text-warning" />
                    }
                  </span>
                </div>
              )}

              {/* Remediation Actions */}
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-medium flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Take Action
                </h4>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  {feedbackLesson?.id && feedbackData?.report && (
                    <Button variant="default" className="justify-center sm:justify-start w-full sm:w-auto" disabled={aiImproveMutation.isPending} onClick={() => {
                        setPendingFixAction('ai_fix');
                        setConfirmFixOpen(true);
                      }}
                    >
                      {aiImproveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 flex-shrink-0 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2 flex-shrink-0" />
                      )}
                      {aiImproveMutation.isPending ? 'Improving...' : `AI Fix (${aiFixCost} LPC)`}
                    </Button>
                  )}
                  {feedbackLesson?.id && feedbackData?.report && (
                    <Button variant="outline" className="justify-center sm:justify-start w-full sm:w-auto" disabled={abbreviationFixMutation.isPending || expandableAbbreviations.length === 0} onClick={() => {
                        setPendingFixAction('expand_abbreviations');
                        setConfirmFixOpen(true);
                      }}
                    >
                      {abbreviationFixMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 flex-shrink-0 animate-spin" />
                      ) : (
                        <BookOpen className="h-4 w-4 mr-2 flex-shrink-0" />
                      )}
                      {abbreviationFixMutation.isPending ? 'Expanding...' : `Expand Abbreviations (${aiFixCost} LPC)`}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  AI Fix will apply the listed improvement recommendations. Expand Abbreviations will convert first occurrences to full form, for example: ALM {'->'} Application Lifecycle Management (ALM). Each fix creates a content version so you can compare before/after in Lesson Actions {'->'} Version History.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Fix Summary Dialog */}
      <Dialog open={aiFixSummaryDialogOpen} onOpenChange={setAiFixSummaryDialogOpen}>
        <DialogContent className="w-[min(95vw,32rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Improvement Complete
            </DialogTitle>
            <DialogDescription>
              {aiFixSummary?.summary || 'Your lesson content has been enhanced.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {aiFixSummary?.improvements && aiFixSummary.improvements.length > 0 && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Improvements Made</span>
                </div>
                <ul className="text-sm space-y-1">
                  {aiFixSummary.improvements.map((improvement, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="h-3 w-3 mt-1 text-success flex-shrink-0" />
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-between text-sm text-muted-foreground px-1">
              <div className="flex items-center gap-4">
                <span>Words: {aiFixSummary?.originalWordCount || 0} → {aiFixSummary?.improvedWordCount || 0}</span>
              </div>
              {aiFixSummary?.creditsCharged ? (
                <span>{aiFixSummary.creditsCharged} credits used</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Compare before/after content from Lesson Actions {'->'} Version History.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAiFixSummaryDialogOpen(false)}
              disabled={feedbackMutation.isPending}
            >
              Close
            </Button>
            <Button onClick={() => {
                if (feedbackLesson?.id) {
                  feedbackMutation.mutate(feedbackLesson.id);
                }
              }}
              className="gap-2"
              disabled={feedbackMutation.isPending}
            >
              {feedbackMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Get New Feedback ({feedbackPricingData?.creditCost ?? 5} {LP_CREDITS_SHORT})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Confirmation Modal with Validation */}
      <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
        <DialogContent className="w-[min(95vw,40rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Publish Course
            </DialogTitle>
            <DialogDescription>
              Review your course readiness before publishing. Once published, the course will be available for assignment to {learnerPluralLower}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Course Info */}
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <h4 className="font-medium mb-2">{course?.title}</h4>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {hasPublishScopeAssignment && (
                  <Badge variant="outline">
                    {assignedUnitCount > 1
                      ? `${assignedUnitCount} ${unitLower} assignments`
                      : assignedUnitCount === 1
                      ? `1 ${unitLower} assignment`
                      : 'Organization-wide assignment'}
                  </Badge>
                )}
                <Badge variant="outline">{totalCount} lessons</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="publish-language-select" className="text-sm font-medium">
                Validate publish readiness for language
              </Label>
              <Select value={selectedPublishLanguage} onValueChange={(value) => setSelectedPublishLanguage(String(value || '').toLowerCase())}>
                <SelectTrigger id="publish-language-select" className="h-9">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    new Set((existingCourseTranslations || []).map((lang) => String(lang.code || '').toLowerCase()).filter(Boolean))
                  ).map((code) => (
                    <SelectItem key={`publish-lang-${code}`} value={code}>
                      {code.toUpperCase()}
                    </SelectItem>
                  ))}
                  {!existingCourseTranslations?.some((lang) => String(lang.code || '').toLowerCase() === String(course?.languageCode || 'en').toLowerCase()) && (
                    <SelectItem value={String(course?.languageCode || 'en').toLowerCase()}>
                      {String(course?.languageCode || 'en').toUpperCase()}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Publish checks are language-aware. Select a language variant to confirm this course is fully publish-ready.
              </p>
            </div>

            {publishReadiness?.languages?.length ? (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium">Multi-language publish readiness</p>
                <div className="flex flex-wrap items-center gap-2">
                  {publishReadiness.languages.map((lang) => (
                    <Badge key={`readiness-${lang.courseId}-${lang.languageCode}`} variant="outline" className={lang.ready ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'} >
                      {lang.languageCode.toUpperCase()} {lang.ready ? 'ready' : `${lang.issues.length} issue(s)`}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Loading state */}
            {isValidating && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Validating course...</span>
              </div>
            )}

            {/* Error state */}
            {!isValidating && isValidationError && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    Unable to validate course
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  There was an error checking your course readiness. This may be due to a database update in progress. Please try again.
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchValidation()}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <RefreshCcw className="h-3 w-3 mr-2" />
                  Retry Validation
                </Button>
              </div>
            )}

            {/* Validation Results */}
            {!isValidating && publishValidation && (
              <>
                {String(selectedPublishLanguage || '').toLowerCase() !== String(course?.languageCode || 'en').toLowerCase() && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-primary">
                        Validation is showing for {selectedPublishLanguage.toUpperCase()}, but this page is on {String(course?.languageCode || 'en').toUpperCase()}.
                        Switch to the selected course variant before publishing.
                      </p>
                      {(() => {
                        const targetVariant = (existingCourseTranslations || []).find(
                          (lang) => String(lang.code || '').toLowerCase() === String(selectedPublishLanguage || '').toLowerCase()
                        );
                        if (!targetVariant || !targetVariant.courseId || targetVariant.courseId === courseId) return null;
                        return (
                          <Button size="sm" variant="outline" onClick={() => {
                              setPublishModalOpen(false);
                              setLocation(`/course-builder/${targetVariant.courseId}/lessons`);
                            }}
                          >
                            Open {selectedPublishLanguage.toUpperCase()} Variant
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {/* Errors */}
                {publishValidation.errors.length > 0 && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-medium text-destructive">
                        Issues to resolve ({publishValidation.errors.length})
                      </span>
                    </div>
                    <ul className="text-sm space-y-2 text-destructive/90">
                      {publishValidation.errors.map((error, i) => {
                        const isDepartmentError = error.toLowerCase().includes('department') && error.toLowerCase().includes('assign');
                        return (
                          <li key={i} className="flex flex-col gap-2">
                            <div className="flex items-start gap-2">
                              {isDepartmentError ? (
                                <Building2 className="h-3 w-3 mt-1 flex-shrink-0" />
                              ) : (
                                <X className="h-3 w-3 mt-1 flex-shrink-0" />
                              )}
                              <span>{error}</span>
                            </div>
                            {isDepartmentError && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-fit ml-5"
                                onClick={openAssignmentModalFromPublish}
                                data-testid="button-assign-to-departments"
                              >
                                <Building2 className="h-3 w-3 mr-2" />
                                Assign to {terminology.unitPlural}
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {publishValidation.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-warning/10 border border-[var(--warning)]/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span className="text-sm font-medium text-warning">
                        Warnings ({publishValidation.warnings.length})
                      </span>
                    </div>
                    <ul className="text-sm space-y-1 text-warning dark:text-warning">
                      {publishValidation.warnings.map((warning, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 mt-1 flex-shrink-0" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Ready to publish */}
                {publishValidation.isValid && (
                  <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium text-success">
                        Course is ready to publish!
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      All required lesson dependencies are complete. Required quizzes are linked and ready.
                    </p>
                  </div>
                )}

                {/* Lesson Details Summary */}
                {publishValidation.lessonDetails && publishValidation.lessonDetails.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2 border-b">
                      <span className="text-sm font-medium">Lesson Status</span>
                    </div>
                    <div className="divide-y max-h-[200px] overflow-y-auto">
                      {publishValidation.lessonDetails.map((lesson) => (
                        <div key={lesson.lessonId} className="px-3 py-2 text-sm flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Topic {lesson.topicOrder}:</span>
                            <span className="truncate max-w-[200px]">{lesson.lessonTitle}</span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {lesson.lessonType.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {lesson.requiresQuiz && (
                              lesson.hasQuiz ? (
                                <Badge variant="outline" >
                                  <FileQuestion className="h-3 w-3 mr-1" />
                                  Quiz
                                </Badge>
                              ) : (
                                <Badge variant="outline" >
                                  <X className="h-3 w-3 mr-1" />
                                  No Quiz
                                </Badge>
                              )
                            )}
                            {Array.isArray(lesson.missingLanguageArtifacts) && lesson.missingLanguageArtifacts.length > 0 && (
                              <Badge variant="outline" >
                                {lesson.missingLanguageArtifacts.length} translation gap(s)
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPublishModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={ !publishValidation?.isValid || publishCourseMutation.isPending || isValidating || String(selectedPublishLanguage || '').toLowerCase() !== String(course?.languageCode || 'en').toLowerCase() } onClick={() => publishCourseMutation.mutate()}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              {String(selectedPublishLanguage || '').toLowerCase() !== String(course?.languageCode || 'en').toLowerCase() ? (
                <>
                  <Globe className="h-4 w-4 mr-2" />
                  Switch to {selectedPublishLanguage.toUpperCase()} Course Variant
                </>
              ) : publishCourseMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Publish Course
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={readinessOverviewOpen} onOpenChange={setReadinessOverviewOpen}>
        <DialogContent className="w-[min(95vw,64rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Translation Readiness Overview ({readinessOverviewData.languageCode.toUpperCase()})
            </DialogTitle>
            <DialogDescription>
              See what is in place, what is missing or stale, and what to do next to publish in this language.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" >
                {readinessOverviewData.ready}/{readinessOverviewData.total} lessons ready
              </Badge>
              {readinessOverviewData.blocked > 0 ? (
                <Badge variant="outline" >
                  {readinessOverviewData.blocked} lesson(s) need remediation
                </Badge>
              ) : (
                <Badge variant="outline" >
                  Course is publish-ready in this language
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {readinessOverviewData.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked lessons found.</p>
              ) : (
                readinessOverviewData.rows.map((row) => (
                  <div key={`readiness-row-${row.lessonId}`} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Topic {row.topicOrder + 1}</span>
                        <span className="text-sm font-medium">{row.lessonTitle}</span>
                        <Badge variant="outline" className="capitalize">
                          {row.lessonType.replace('_', ' ')}
                        </Badge>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${row.isReady ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`} >
                        {row.isReady ? 'Ready' : 'Needs action'}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={`text-[10px] ${row.hasPptx ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`}>
                        PPTX {row.hasPptx ? 'OK' : 'Missing'}
                      </Badge>
                      {row.lessonType === 'content' && (
                        <Badge variant="outline" className={`text-[10px] ${row.hasQuiz ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`}>
                          Quiz {row.hasQuiz ? 'OK' : 'Missing'}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${row.hasDigest ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`}>
                        Digest {row.hasDigest ? 'OK' : 'Missing'}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${row.hasObjectives ? 'text-success border-success/40 bg-success/10' : 'text-warning border-[var(--warning)]/40 bg-warning/10'}`}>
                        Objectives {row.hasObjectives ? 'OK' : 'Missing'}
                      </Badge>
                      {row.isStale && (
                        <Badge variant="outline" >
                          Translation stale
                        </Badge>
                      )}
                    </div>

                    {row.missing.length > 0 && (
                      <p className="text-xs text-warning">
                        Missing or incorrect: {row.missing.join(', ')}
                      </p>
                    )}

                    {row.remediationSteps.length > 0 && (
                      <div className="space-y-1">
                        {row.remediationSteps.map((step, idx) => (
                          <p key={`readiness-step-${row.lessonId}-${idx}`} className="text-xs text-muted-foreground">
                            {idx + 1}. {step}
                          </p>
                        ))}
                      </div>
                    )}

                    {!row.isReady && (
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => {
                            setReadinessOverviewOpen(false);
                            setLocation(buildTranslateRemediationUrl(row.lessonId, readinessOverviewData.languageCode, row.missing));
                          }}
                        >
                          <Globe className="h-3 w-3 mr-1" />
                          Remediate In Translate
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReadinessOverviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={stepGuideFileInputRef}
        type="file"
        className="hidden"
        accept=".docx,.doc,.md,.markdown,.txt"
        onChange={handleStepGuideFileSelected}
      />

      <Sheet open={quickArtifactDrawerOpen} onOpenChange={setQuickArtifactDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Artifact Quick Access</SheetTitle>
            <SheetDescription>
              {quickArtifactContext
                ? `${quickArtifactContext.lessonTitle} • ${quickArtifactContext.artifact.replace(/_/g, ' ')}`
                : 'Choose language and version, then open the selected artifact.'}
            </SheetDescription>
          </SheetHeader>
          {quickArtifactContext && (() => {
            const lessonData = lessonsData?.[quickArtifactContext.lessonId];
            if (!lessonData) {
              return <p className="text-sm text-muted-foreground mt-4">Lesson data is not available.</p>;
            }
            const languageStates = getLanguageArtifactStates(lessonData);
            const availableLanguages = languageStates.filter((lang) =>
              getArtifactOptionsForLanguage(quickArtifactContext.artifact, lessonData, lang, artifactSelectorCache[getArtifactSelectorKey(lessonData, lang)]).length > 0
            );
            const loadingArtifactVersions = languageStates.some((lang) => {
              const cacheKey = getArtifactSelectorKey(lessonData, lang);
              return !artifactSelectorCache[cacheKey] && !!artifactSelectorLoadingKeys[cacheKey];
            });
            if (availableLanguages.length === 0) {
              return (
                <p className="text-sm text-muted-foreground mt-4">
                  {loadingArtifactVersions
                    ? 'Loading artifact versions...'
                    : 'No versions available for this artifact yet.'}
                </p>
              );
            }
            return (
              <div className="mt-4 space-y-3">
                {availableLanguages.map((lang) => {
                  const cacheKey = getArtifactSelectorKey(lessonData, lang);
                  const selectorData = artifactSelectorCache[cacheKey];
                  const options = getArtifactOptionsForLanguage(quickArtifactContext.artifact, lessonData, lang, selectorData);
                  const selectionKey = getQuickSelectionKey(lessonData.id, quickArtifactContext.artifact, lang.code);
                  const selectedValue = quickArtifactSelection[selectionKey] || options[0]?.id || "";
                  const selectedOption = options.find((o) => o.id === selectedValue) || options[0];
                  const quickActions = selectedOption
                    ? getQuickArtifactActionsForSelection(quickArtifactContext.artifact, lessonData, lang, selectedOption)
                    : [];
                  const selectedTimestamp = formatArtifactTimestamp(
                    selectedOption?.createdAt || selectedOption?.payload?.createdAt || null
                  );
                  return (
                    <div key={`${quickArtifactContext.artifact}-${lessonData.id}-${lang.code}`} className="rounded border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="px-1 py-0">{lang.code.toUpperCase()}</Badge>
                        {lang.isStale && (
                          <Badge variant="outline" className="px-1 py-0">Stale</Badge>
                        )}
                        {options.some((o) => o.active) && (
                          <Badge variant="outline" className="px-1 py-0">Active</Badge>
                        )}
                        {options.length > 1 && (
                          <Badge variant="outline" className="px-1 py-0">Other versions</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Select
                          value={selectedValue}
                          onValueChange={(value) => setQuickArtifactSelection((prev) => ({ ...prev, [selectionKey]: value }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select version" />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                {opt.label}{opt.active ? " (Active)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex flex-wrap gap-2">
                          {quickActions.map((action) => (
                            <Button key={`${selectionKey}-${action.id}`} size="sm" variant={action.primary ? 'default' : 'outline'} className="h-8 text-xs" onClick={action.onClick} disabled={!action.enabled} title={!action.enabled ? action.reason : action.label} >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {selectedTimestamp && (
                        <p className="text-[11px] text-muted-foreground">
                          Created: {selectedTimestamp}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {courseId && (
        <CourseAssignmentModal
          open={assignmentModalOpen}
          onOpenChange={setAssignmentModalOpen}
          courseId={courseId}
          courseTitle={course?.title}
          courseOrganizationId={course?.organizationId}
          onAssignmentComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
            queryClient.invalidateQueries({ queryKey: ['/api/course-assignments/course', courseId] });
            queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'validate-publish'] });
            queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'generation-readiness'] });
          }}
        />
      )}

    </QuizAdminLayout>
  );
}
