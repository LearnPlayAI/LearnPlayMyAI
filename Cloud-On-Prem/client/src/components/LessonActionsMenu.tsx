import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePresentationVersions, useDownloadPresentationVersion, useQuizOutdatedStatus } from "@/hooks/useLessonVersions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MoreVertical,
  Eye,
  Pencil,
  Download,
  Archive,
  ArchiveRestore,
  Trash2,
  RefreshCw,
  Sparkles,
  Upload,
  Loader2,
  Unlink,
  Wand2,
  FileText,
  ArrowLeftRight,
  PenTool,
  GraduationCap,
  AlertTriangle,
  History,
  Globe,
  Mic,
  CheckCircle2,
  Lightbulb,
  ArrowLeftRight as CompareIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest, queryClient, invalidateWalletCaches, invalidateLessonCaches } from "@/lib/queryClient";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import { LessonEditDialog } from "@/components/LessonEditDialog";
import { LessonContentDiffModal } from "@/components/LessonContentDiffModal";
import { LessonVersionHistory } from "@/components/LessonVersionHistory";
import { isValidDownloadUrl, safeDownload, generatePptxFilename, sanitizeFilename } from "@/lib/downloadHelper";
import { getLessonActionMenuResetState } from "@/lib/lessonNavigationState";

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  generationStatus: string;
  isArchived?: boolean;
  isPublished?: boolean;
  storageKey?: string;
  videoStorageKey?: string;
  inputText?: string;
  sourceDocumentPath?: string;
  themeId?: string;
  department?: string;
  unit?: string;
  errorMessage?: string;
  presentationVersionId?: string;
  slideContentHash?: string;
  gammaCardId?: string;
  linkedQuizId?: string | null;
  linkedQuizName?: string | null;
  linkedQuizCount?: number;
}

export interface LessonActionsMenuProps {
  lesson: Lesson;
  context: 'library' | 'course-builder';
  organizationId: string;
  /** When true, disables Generate/Re-generate buttons (another lesson is currently generating) */
  isAnyLessonGenerating?: boolean;
  organizationType?: string;
  courseId?: string;
  topicId?: string;
  topicName?: string;
  topicOrder?: number;
  courseLessonType?: 'overview' | 'content' | 'key_takeaways';
  /** When true, hides quiz generation options (overview lessons don't require quizzes) */
  isOverviewLesson?: boolean;
  showView?: boolean;
  showEdit?: boolean;
  showGenerateQuiz?: boolean;
  showDownloadPPTX?: boolean;
  showReplacePPTX?: boolean;
  showUploadPPTX?: boolean;
  showUploadVideo?: boolean;
  showRegenerate?: boolean;
  showGenerate?: boolean;
  showDelete?: boolean;
  showArchive?: boolean;
  showRemoveFromCourse?: boolean;
  showSetCourseLessonType?: boolean;
  showUploadContent?: boolean;
  showViewChanges?: boolean;
  showEditQuiz?: boolean;
  showViewLastReport?: boolean;
  onViewLastReport?: (lessonId?: string) => void;
  showGetFeedback?: boolean;
  onGetFeedback?: (lessonId?: string) => void;
  showSetLearningObjectives?: boolean;
  onSetLearningObjectives?: (lessonId?: string) => void;
  showViewContent?: boolean;
  showGenerateSourceDbContent?: boolean;
  generateSourceDbContentLabel?: string;
  canGenerateSourceDbContent?: boolean;
  isGeneratingSourceDbContent?: boolean;
  sourceDbContentBlockedReason?: string;
  onGenerateSourceDbContent?: (lessonId: string) => void;
  hideMenu?: boolean;
  onActionComplete?: () => void;
  onUploadContentSuccess?: (result: { extractedWordCount: number; extractedText: string; detectedLanguage?: string }) => void;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}

export function LessonActionsMenu({
  lesson,
  context,
  organizationId,
  organizationType = "education",
  isAnyLessonGenerating = false,
  courseId,
  topicId,
  topicName,
  topicOrder,
  courseLessonType = 'content',
  isOverviewLesson = false,
  showView = true,
  showEdit = true,
  showGenerateQuiz = true,
  showDownloadPPTX = true,
  showReplacePPTX = true,
  showUploadPPTX = false,
  showUploadVideo = true,
  showRegenerate = true,
  showGenerate = false,
  showDelete = false,
  showArchive = true,
  showRemoveFromCourse = false,
  showSetCourseLessonType = false,
  showUploadContent = false,
  showViewChanges = true,
  showEditQuiz = false,
  showViewLastReport = false,
  onViewLastReport,
  showGetFeedback = false,
  onGetFeedback,
  showSetLearningObjectives = false,
  onSetLearningObjectives,
  showViewContent = false,
  showGenerateSourceDbContent = false,
  generateSourceDbContentLabel = 'Generate Source DB Content',
  canGenerateSourceDbContent = false,
  isGeneratingSourceDbContent = false,
  sourceDbContentBlockedReason,
  onGenerateSourceDbContent,
  hideMenu = false,
  onActionComplete,
  onUploadContentSuccess,
  triggerClassName = "h-8 sm:h-9 touch-manipulation flex-shrink-0 px-2 whitespace-nowrap text-xs sm:text-sm",
  triggerStyle,
}: LessonActionsMenuProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learnerPlural: 'Learners',
  };
  
  const lessonId = typeof lesson.id === 'string' 
    ? lesson.id 
    : (lesson.id && typeof lesson.id === 'object' && 'id' in (lesson.id as any)) 
      ? String((lesson.id as any).id)
      : String(lesson.id);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [videoUploadDialogOpen, setVideoUploadDialogOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [uploadContentDialogOpen, setUploadContentDialogOpen] = useState(false);
  const [contentDiffModalOpen, setContentDiffModalOpen] = useState(false);
  const [pptxPickerOpen, setPptxPickerOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [deleteSourceContentConfirmOpen, setDeleteSourceContentConfirmOpen] = useState(false);
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [manageVersionsOpen, setManageVersionsOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [viewContentDialogOpen, setViewContentDialogOpen] = useState(false);
  const [languagePickerMode, setLanguagePickerMode] = useState<null | 'regenerate' | 'edit-quiz' | 'download-pptx' | 'download-video' | 'download-word-doc' | 'replace-pptx' | 'get-feedback' | 'view-last-report' | 'view-ai-changes' | 'upload-content'>(null);
  const [downloadLangLessonId, setDownloadLangLessonId] = useState<string | null>(null);
  const [langPptxPickerOpen, setLangPptxPickerOpen] = useState(false);
  const [viewContentLangLessonId, setViewContentLangLessonId] = useState(lessonId);
  const [sourceContentLangLessonId, setSourceContentLangLessonId] = useState(lessonId);
  const [contentDiffLessonId, setContentDiffLessonId] = useState(lessonId);
  const [uploadContentTargetLessonId, setUploadContentTargetLessonId] = useState(lessonId);
  const [selectedSourceVersion, setSelectedSourceVersion] = useState<string>('current');
  const [selectedDocVersion, setSelectedDocVersion] = useState<string>('current');
  const [viewContentMode, setViewContentMode] = useState<'edit' | 'compare'>('edit');
  const [compareBaseVersionId, setCompareBaseVersionId] = useState<string>('current');
  const [compareTargetVersionId, setCompareTargetVersionId] = useState<string>('current');
  const [feedbackMode, setFeedbackMode] = useState<'quick' | 'deep' | 'compare'>('quick');
  const [viewContentDraftText, setViewContentDraftText] = useState<string>("");
  const [viewContentDirty, setViewContentDirty] = useState(false);
  const [viewContentFeedback, setViewContentFeedback] = useState<any | null>(null);
  const [viewContentFeedbackMeta, setViewContentFeedbackMeta] = useState<{
    contentHash: string;
    feedbackMode: 'quick' | 'deep' | 'compare';
    baseVersionId?: string;
    compareTargetVersionId?: string;
  } | null>(null);

  useEffect(() => {
    const resetState = getLessonActionMenuResetState(lessonId);
    setDownloadingVersionId(null);
    setDownloadLangLessonId(null);
    setLangPptxPickerOpen(false);
    setViewContentLangLessonId(resetState.viewContentLangLessonId);
    setSourceContentLangLessonId(resetState.sourceContentLangLessonId);
    setContentDiffLessonId(resetState.contentDiffLessonId);
    setUploadContentTargetLessonId(resetState.uploadContentTargetLessonId);
    setSelectedSourceVersion(resetState.selectedSourceVersion);
    setSelectedDocVersion(resetState.selectedDocVersion);
    setCompareBaseVersionId(resetState.compareBaseVersionId);
    setCompareTargetVersionId(resetState.compareTargetVersionId);
    setFeedbackMode(resetState.feedbackMode);
    setViewContentDraftText("");
    setViewContentDirty(false);
    setViewContentFeedback(null);
    setViewContentFeedbackMeta(null);
    setLanguagePickerMode(null);
  }, [lessonId]);

  const buildContentStudioUrl = (targetLessonId: string, opts?: { autoFeedback?: boolean }) => {
    const returnToParam = courseId ? `returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}` : "";
    const courseParam = courseId ? `courseId=${encodeURIComponent(String(courseId))}` : "";
    const orgParam = organizationId ? `organizationId=${encodeURIComponent(String(organizationId))}` : "";
    const feedbackParam = opts?.autoFeedback ? "autofeedback=1" : "";
    const query = [returnToParam, courseParam, orgParam, feedbackParam].filter(Boolean).join("&");
    return `/lessons/${targetLessonId}/content-studio${query ? `?${query}` : ""}`;
  };

  const { data: languageVariants, isLoading: languageVariantsLoading } = useQuery<Array<{
    code: string; name: string; nativeName: string; lessonId: string; isDefault: boolean;
    hasPptx: boolean; hasWordDoc: boolean; hasContent: boolean; quizIds: string[];
    generationStatus?: string | null;
  }>>({
    queryKey: ['/api/lessons', lessonId, 'languages-details'],
    queryFn: () => fetch(`/api/lessons/${lessonId}/languages?details=true`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!languagePickerMode || viewContentDialogOpen || contentDialogOpen,
  });

  const { data: viewContentData } = useQuery<{ text?: string; source?: 'inputText' | 'sourceDocument'; extractedWordCount?: number }>({
    queryKey: ['/api/lessons', viewContentLangLessonId, 'source-document', organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${viewContentLangLessonId}/source-document?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        return { text: '' };
      }
      return response.json();
    },
    enabled: viewContentDialogOpen,
  });

  const hashText = (value: string): string => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return String(hash);
  };

  const currentContentText = useMemo(
    () => String(viewContentData?.text || lesson.inputText || ""),
    [viewContentData?.text, lesson.inputText]
  );

  const { data: sourceContentLangData, isLoading: sourceContentLangLoading } = useQuery<{text: string}>({
    queryKey: ['/api/lessons', sourceContentLangLessonId, 'source-document'],
    queryFn: () => fetch(`/api/lessons/${sourceContentLangLessonId}/source-document?organizationId=${organizationId}`).then(r => r.json()),
    enabled: contentDialogOpen && sourceContentLangLessonId !== lessonId,
  });

  useEffect(() => {
    if (!languagePickerMode || languageVariantsLoading || !languageVariants) return;
    const filteredVariants = languagePickerMode === 'edit-quiz'
      ? languageVariants.filter(v => v.quizIds && v.quizIds.length > 0)
      : languagePickerMode === 'download-pptx'
      ? languageVariants.filter(v => v.hasPptx)
      : languagePickerMode === 'download-word-doc'
      ? languageVariants.filter(v => v.hasWordDoc)
      : languageVariants;
    if (filteredVariants.length > 1) return;
    if (languagePickerMode === 'regenerate') {
      const targetLessonId = filteredVariants[0]?.lessonId || lessonId;
      const topicIdParam = topicId ? `&topicId=${topicId}` : '';
      const topicNameParam = topicName ? `&topicName=${encodeURIComponent(topicName)}` : '';
      const topicOrderParam = topicOrder !== undefined ? `&topicOrder=${topicOrder}` : '';
      const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
      const wizardUrl = courseId
        ? `/lessons/new?org=${organizationId}&courseId=${courseId}${topicIdParam}${topicNameParam}${topicOrderParam}&lessonId=${targetLessonId}&regenerate=true${returnParams}`
        : `/lessons/new?org=${organizationId}&lessonId=${targetLessonId}&regenerate=true`;
      setLanguagePickerMode(null);
      setLocation(wizardUrl);
    } else if (languagePickerMode === 'edit-quiz') {
      const targetQuizId = filteredVariants[0]?.quizIds?.[0] || lesson.linkedQuizId;
      const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
      setLanguagePickerMode(null);
      setLocation(`/quiz-card-manager?quizId=${targetQuizId}&mode=edit${returnParams}`);
    } else if (languagePickerMode === 'download-pptx') {
      if (filteredVariants.length === 0) {
        const hasGeneratingVariant = languageVariants.some((variant) => {
          const status = String(variant.generationStatus || '').toLowerCase();
          return status === 'processing' || status === 'polling' || status === 'pending';
        });
        setLanguagePickerMode(null);
        if (hasGeneratingVariant) {
          toast({
            title: "PPTX is still being finalized",
            description: "The presentation file is still processing. Please try again shortly.",
          });
        } else {
          toast({ variant: "destructive", title: "No PPTX available", description: "No languages have a presentation available for download." });
        }
      } else if (filteredVariants.length === 1) {
        const targetLessonId = filteredVariants[0].lessonId;
        setLanguagePickerMode(null);
        if (targetLessonId === lessonId) {
          if (hasMultipleVersions) {
            setPptxPickerOpen(true);
          } else {
            downloadMutation.mutate();
          }
        } else {
          setDownloadLangLessonId(targetLessonId);
        }
      }
    } else if (languagePickerMode === 'download-video') {
      const videoVariants = filteredVariants.filter(v => v.lessonId);
      if (videoVariants.length <= 1) {
        const targetLessonId = videoVariants[0]?.lessonId || lessonId;
        setLanguagePickerMode(null);
        if (targetLessonId === lessonId) {
          downloadVideoMutation.mutate();
        } else {
          (async () => {
            try {
              const response = await fetch(`/api/lessons/${targetLessonId}/download-video?organizationId=${organizationId}`, { credentials: 'include' });
              if (!response.ok) throw new Error('Download failed');
              const data = await response.json();
              if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                const filename = data.filename || `${sanitizeFilename(lesson.title)}.mp4`;
                await safeDownload(data.downloadUrl, filename, (error) => {
                  toast({ variant: "destructive", title: "Download failed", description: error });
                });
              }
            } catch (e) {
              toast({ variant: "destructive", title: "Download failed", description: "Could not download video" });
            }
          })();
        }
      }
    } else if (languagePickerMode === 'download-word-doc') {
      if (filteredVariants.length === 0) {
        setLanguagePickerMode(null);
        toast({ variant: "destructive", title: "No Word Doc available", description: "No languages have a source document available for download." });
      } else if (filteredVariants.length === 1) {
        const targetLessonId = filteredVariants[0].lessonId;
        setLanguagePickerMode(null);
        (async () => {
          try {
            const response = await fetch(`/api/lessons/${targetLessonId}/download-source-document?organizationId=${organizationId}`, { credentials: 'include' });
            if (!response.ok) throw new Error('Download failed');
            const data = await response.json();
            if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
              const filename = data.filename || `${sanitizeFilename(lesson.title)}.docx`;
              await safeDownload(data.downloadUrl, filename, (error) => {
                toast({ variant: "destructive", title: "Download failed", description: error });
              });
            }
          } catch (e) {
            toast({ variant: "destructive", title: "Download failed", description: "Could not download document" });
          }
        })();
      }
    } else if (languagePickerMode === 'replace-pptx') {
      if (filteredVariants.length <= 1) {
        const targetLessonId = filteredVariants[0]?.lessonId || lessonId;
        setLanguagePickerMode(null);
        const currentPath = window.location.pathname + window.location.search;
        const returnTo = encodeURIComponent(currentPath);
        setLocation(`/course-builder/${courseId}/upload/${topicOrder}?lessonId=${targetLessonId}&returnTo=${returnTo}&courseId=${courseId}`);
      }
    } else if (languagePickerMode === 'get-feedback') {
      // If there is only one language option, run feedback immediately.
      if (filteredVariants.length <= 1) {
        const targetLessonId = filteredVariants[0]?.lessonId || lessonId;
        setLanguagePickerMode(null);
        onGetFeedback?.(targetLessonId);
      }
      return;
    } else if (languagePickerMode === 'view-last-report') {
      const targetLessonId = filteredVariants[0]?.lessonId || lessonId;
      setLanguagePickerMode(null);
      onViewLastReport?.(targetLessonId);
    } else if (languagePickerMode === 'view-ai-changes') {
      const targetLessonId = filteredVariants[0]?.lessonId || lessonId;
      setLanguagePickerMode(null);
      setContentDiffLessonId(targetLessonId);
      setContentDiffModalOpen(true);
    } else if (languagePickerMode === 'upload-content') {
      const targetLessonId = filteredVariants[0]?.lessonId || lessonId;
      setLanguagePickerMode(null);
      setUploadContentTargetLessonId(targetLessonId);
      setUploadContentDialogOpen(true);
    }
  }, [languagePickerMode, languageVariants, languageVariantsLoading, onGetFeedback, onViewLastReport]);

  const { data: langVersionsData } = useQuery<{
    versions: Array<{ id: string; version: number; isGenerated: boolean; createdAt: string }>;
    currentVersion: number;
  }>({
    queryKey: ['/api/lessons', downloadLangLessonId, 'presentation-versions'],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${downloadLangLessonId}/presentation-versions?organizationId=${organizationId}&prefetchSlides=1`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch versions');
      return response.json();
    },
    enabled: !!downloadLangLessonId && downloadLangLessonId !== lessonId,
  });

  useEffect(() => {
    if (!downloadLangLessonId || downloadLangLessonId === lessonId || !langVersionsData) return;

    const versions = langVersionsData?.versions || [];
    if (versions.length === 0) {
      toast({ variant: "destructive", title: "No PPTX available", description: "No presentation versions found for this language." });
      setDownloadLangLessonId(null);
    } else if (versions.length === 1) {
      const version = versions[0];
      (async () => {
        try {
          const response = await apiRequest(`/api/lessons/${downloadLangLessonId}/presentation-versions/${version.id}/download?organizationId=${organizationId}`, { method: "GET" });
          if (response?.downloadUrl && isValidDownloadUrl(response.downloadUrl)) {
            const filename = response.filename || generatePptxFilename(lesson.title, version.version);
            await safeDownload(response.downloadUrl, filename, (error) => {
              toast({ variant: "destructive", title: "Download failed", description: error });
            });
            toast({ title: "Download started", description: "Your PPTX file is downloading" });
          }
        } catch (error: any) {
          toast({ variant: "destructive", title: "Download failed", description: error.message });
        }
        setDownloadLangLessonId(null);
      })();
    } else {
      setLangPptxPickerOpen(true);
    }
  }, [downloadLangLessonId, langVersionsData]);

  const { data: allVersionsData, isLoading: versionsLoading } = useQuery<{
    organizationId: string;
    variants: Array<{
      lessonId: string;
      languageCode: string;
      isDefaultLanguage: boolean;
      activeLessonVersionId: string | null;
      currentTitle: string;
      updatedAt: string | null;
      hasPptx: boolean;
      hasVideo: boolean;
      hasWordDoc: boolean;
      versions: Array<{
        id: string | null;
        versionNumber: number;
        title: string;
        languageCode: string;
        changeDescription: string | null;
        createdAt: string | null;
        isCurrentState: boolean;
      }>;
    }>;
  }>({
    queryKey: ['/api/lessons', lessonId, 'all-versions'],
    queryFn: () => fetch(`/api/lessons/${lessonId}/all-versions`, { credentials: 'include' }).then(r => r.json()),
    enabled: manageVersionsOpen,
  });

  const setActiveVersionMutation = useMutation({
    mutationFn: async ({ targetLessonId, versionId }: { targetLessonId: string; versionId: string | null }) => {
      return await apiRequest(`/api/lessons/${targetLessonId}/active-version`, {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'all-versions'] });
      toast({ title: 'Active version updated', description: `${terminology.learnerPlural} will now see the selected version.` });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update version', description: error.message, variant: 'destructive' });
    },
  });

  const { data: presentationVersions, refetch: refetchVersions } = usePresentationVersions(
    lessonId,
    organizationId
  );
  const hasMultipleVersions = (presentationVersions?.versions?.length || 0) > 1;

  const downloadVersionMutation = useDownloadPresentationVersion(lessonId, organizationId);

  // Fetch quiz outdated status to show regeneration recommendation
  const { data: quizOutdatedStatus } = useQuizOutdatedStatus(
    lessonId,
    organizationId
  );
  const hasOutdatedQuizzes = quizOutdatedStatus?.hasOutdatedQuizzes ?? false;

  const { data: lessonContent, isLoading: contentLoading } = useQuery<{text: string}>({
    queryKey: ['/api/lessons', lessonId, 'source-document'],
    queryFn: () => fetch(`/api/lessons/${lessonId}/source-document?organizationId=${organizationId}`).then(r => r.json()),
    enabled: contentDialogOpen && !!lesson.sourceDocumentPath,
  });

  const contentVersionsLessonId = viewContentDialogOpen
    ? viewContentLangLessonId
    : contentDialogOpen
      ? sourceContentLangLessonId
      : lessonId;

  const { data: contentVersions, isLoading: contentVersionsLoading } = useQuery<any[]>({
    queryKey: ['/api/lessons', contentVersionsLessonId, 'content-versions'],
    queryFn: () => fetch(`/api/lessons/${contentVersionsLessonId}/versions?organizationId=${organizationId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: (contentDialogOpen || viewContentDialogOpen) && !!contentVersionsLessonId,
  });

  const normalizeVersionId = (value: unknown): string => String(value ?? "");

  const contentVersionsWithCurrent = useMemo(() => {
    const list = Array.isArray(contentVersions) ? [...contentVersions] : [];
    const hasCurrent = list.some((v: any) => normalizeVersionId(v?.id).startsWith("current-"));
    if (!hasCurrent) {
      list.unshift({
        id: "current",
        versionNumber: (list[0]?.versionNumber || 0) + 1,
        source: "current_state",
        createdAt: new Date().toISOString(),
        newContent: currentContentText,
        previousContent: list[0]?.newContent || currentContentText,
      });
    }
    return list;
  }, [contentVersions, currentContentText]);

  const getVersionContent = (versionId: string): string => {
    if (versionId === "current" || versionId.startsWith("current-")) {
      return currentContentText;
    }
    const match = contentVersionsWithCurrent.find((v: any) => normalizeVersionId(v.id) === normalizeVersionId(versionId));
    return String(match?.newContent || "");
  };

  const computeLineDiff = (oldText: string, newText: string): Array<{ type: "same" | "added" | "removed"; text: string }> => {
    const oldLines = String(oldText || "").split("\n");
    const newLines = String(newText || "").split("\n");
    const result: Array<{ type: "same" | "added" | "removed"; text: string }> = [];
    let i = 0;
    let j = 0;
    while (i < oldLines.length || j < newLines.length) {
      const oldLine = oldLines[i];
      const newLine = newLines[j];
      if (i >= oldLines.length) {
        result.push({ type: "added", text: newLine || "" });
        j++;
      } else if (j >= newLines.length) {
        result.push({ type: "removed", text: oldLine || "" });
        i++;
      } else if (oldLine === newLine) {
        result.push({ type: "same", text: newLine || "" });
        i++;
        j++;
      } else if (newLines.slice(j + 1, j + 4).includes(oldLine)) {
        result.push({ type: "added", text: newLine || "" });
        j++;
      } else if (oldLines.slice(i + 1, i + 4).includes(newLine)) {
        result.push({ type: "removed", text: oldLine || "" });
        i++;
      } else {
        result.push({ type: "removed", text: oldLine || "" });
        result.push({ type: "added", text: newLine || "" });
        i++;
        j++;
      }
    }
    return result;
  };

  const getVersionSourceLabel = (source: string) => {
    switch (source) {
      case 'current_state': return 'Current Version';
      case 'initial_state': return 'Initial Version';
      case 'generate_overview': return 'Generated Overview';
      case 'generate_takeaways': return 'Generated Takeaways';
      case 'word_upload': return 'Word Doc Upload';
      case 'ai_improve': return 'AI Improved';
      case 'ai_fix': return 'AI Fix';
      case 'manual_edit': return 'Manual Edit';
      case 'version_restore': return 'Set as Current';
      case 'initial_version_restore': return 'Initial Restored';
      default: return source;
    }
  };

  useEffect(() => {
    if (!viewContentDialogOpen) return;
    const currentText = getVersionContent('current');
    if (selectedDocVersion === 'current' || selectedDocVersion.startsWith('current-')) {
      setViewContentDraftText(currentText);
      setViewContentDirty(false);
    }
    if (!compareBaseVersionId || compareBaseVersionId === 'current') {
      setCompareBaseVersionId('current');
    }
    if (!compareTargetVersionId || compareTargetVersionId === 'current') {
      const candidate = contentVersionsWithCurrent.find((v: any) => !String(v.id).startsWith('current-') && v.id !== 'current');
      setCompareTargetVersionId(candidate?.id || 'current');
    }
  }, [
    viewContentDialogOpen,
    currentContentText,
    selectedDocVersion,
    contentVersionsWithCurrent,
    compareBaseVersionId,
    compareTargetVersionId,
  ]);

  useEffect(() => {
    if (!viewContentDialogOpen) return;
    setSelectedDocVersion('current');
    setCompareBaseVersionId('current');
    setCompareTargetVersionId('current');
    setViewContentDraftText(currentContentText);
    setViewContentDirty(false);
    setViewContentFeedback(null);
    setViewContentFeedbackMeta(null);
  }, [viewContentDialogOpen, contentVersionsLessonId, currentContentText]);

  useEffect(() => {
    if (!contentDialogOpen) return;
    setSelectedSourceVersion('current');
  }, [contentDialogOpen, sourceContentLangLessonId, contentVersionsLessonId]);

  useEffect(() => {
    if (!viewContentFeedbackMeta) return;
    const activeHash = hashText(viewContentDraftText);
    if (viewContentFeedbackMeta.contentHash !== activeHash && feedbackMode !== 'compare') {
      // Keep the feedback visible, but mark stale via rendering logic.
      return;
    }
  }, [viewContentDraftText, viewContentFeedbackMeta, feedbackMode]);

  const isCompleted = lesson.generationStatus === "completed";
  const isPending = lesson.generationStatus === "pending";
  const isFailed = lesson.generationStatus === "failed";
  const isProcessing = lesson.generationStatus === "processing" || lesson.generationStatus === "polling";
  const hasPPTX = !!lesson.storageKey;
  const hasInputText = !!lesson.inputText;
  const hasLessonContent = hasInputText || !!lesson.sourceDocumentPath;
  const hasPodcastSourceDb = !!lesson.inputText;
  const hasPodcastWord = !!lesson.sourceDocumentPath;
  const hasPodcastPptx =
    !!lesson.storageKey ||
    !!lesson.gammaCardId ||
    !!lesson.presentationVersionId ||
    !!lesson.slideContentHash;
  const canGeneratePodcast = hasPodcastSourceDb || hasPodcastWord || hasPodcastPptx;
  const podcastMeta = (lesson as any).metadata && typeof (lesson as any).metadata === 'object'
    ? ((lesson as any).metadata as any).podcast
    : null;
  const digestCacheByKey = (lesson as any)?.metadata?.lessonDigestV1?.byKey;
  const hasLessonDigest = !!digestCacheByKey && typeof digestCacheByKey === 'object'
    && Object.values(digestCacheByKey).some((entry: any) => Array.isArray(entry?.sections) && entry.sections.length > 0);
  const podcastVersions = Array.isArray(podcastMeta?.versions) ? podcastMeta.versions : [];
  const hasCompletedPodcast = podcastVersions.some((v: any) => v?.status === 'completed');
  const podcastJobStatus = typeof podcastMeta?.currentJob?.status === 'string'
    ? String(podcastMeta.currentJob.status)
    : 'idle';
  const podcastStatusVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
    podcastJobStatus === 'completed'
      ? 'default'
      : podcastJobStatus === 'failed'
        ? 'destructive'
        : podcastJobStatus === 'processing'
          ? 'secondary'
          : 'outline';
  const canRegenerate = (isFailed || isCompleted) && hasInputText && !!lesson.gammaCardId;
  // Only allow retry for pending lessons that have inputText (wizard-based generation)
  // Manual upload lessons cannot be retried via wizard
  const canRetryPending = isPending && hasInputText;
  // Check if lesson has an existing presentation (whether from Gamma or manual upload)
  const hasExistingPresentation = !!lesson.presentationVersionId || !!lesson.slideContentHash || !!lesson.gammaCardId || !!lesson.storageKey;
  
  // Determine if generation buttons should be disabled (another lesson is generating)
  // Don't block if THIS lesson is the one currently actively generating (processing/polling)
  // isPending means queued but not started - those should be blocked if another is active
  // Note: isProcessing already includes both 'processing' and 'polling' statuses
  const isCurrentLessonGenerating = isProcessing;
  const shouldBlockGeneration = isAnyLessonGenerating && !isCurrentLessonGenerating;

  const archiveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/lessons/${lessonId}/archive`, {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson archived",
        description: "The lesson has been archived successfully.",
      });
      invalidateLessonCaches({ lessonId, courseId });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Archive failed",
        description: error.message || "Failed to archive lesson",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/lessons/${lessonId}/restore`, {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson restored",
        description: "The lesson has been restored successfully.",
      });
      invalidateLessonCaches({ lessonId, courseId });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Restore failed",
        description: error.message || "Failed to restore lesson",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/lessons/${lessonId}?organizationId=${organizationId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson deleted",
        description: "The lesson has been permanently deleted.",
      });
      invalidateLessonCaches({ lessonId, courseId });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Failed to delete lesson",
      });
    },
  });

  const uploadVideoMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) {
        throw new Error("No video file selected");
      }

      const formData = new FormData();
      formData.append("videoFile", videoFile);

      const response = await fetch(
        `/api/lessons/${lessonId}/upload-video?organizationId=${organizationId}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload video");
      }

      return response.json();
    },
    onSuccess: () => {
      const action = lesson.videoStorageKey ? "replaced" : "uploaded";
      toast({
        title: `Video ${action}`,
        description: `Your lesson video has been ${action} successfully.`,
      });
      invalidateLessonCaches({ lessonId, courseId });
      setVideoUploadDialogOpen(false);
      setVideoFile(null);
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload video",
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
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
      invalidateLessonCaches({ lessonId, courseId });
      setUnlinkDialogOpen(false);
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Unlink failed",
        description: error.message || "Failed to remove lesson from course",
      });
    },
  });

  const setCourseLessonTypeMutation = useMutation({
    mutationFn: async (lessonType: 'overview' | 'content' | 'key_takeaways') => {
      if (!courseId) {
        throw new Error("Course ID is required");
      }
      return await apiRequest(`/api/courses/${courseId}/lessons/${lessonId}/type`, {
        method: "PATCH",
        body: JSON.stringify({ lessonType }),
      });
    },
    onSuccess: (_data, lessonType) => {
      const label = lessonType === 'overview'
        ? 'Overview'
        : lessonType === 'key_takeaways'
          ? 'Key Takeaways'
          : 'Content';
      toast({
        title: "Lesson role updated",
        description: `"${lesson.title}" is now marked as ${label}.`,
      });
      invalidateLessonCaches({ lessonId, courseId });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Role update failed",
        description: error.message || "Failed to update lesson role",
      });
    },
  });

  const uploadContentMutation = useMutation({
    mutationFn: async () => {
      if (!contentFile) {
        throw new Error("No file selected");
      }

      const formData = new FormData();
      formData.append("document", contentFile);

      const response = await fetch(
        `/api/lessons/${uploadContentTargetLessonId}/supplement?organizationId=${organizationId}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload content");
      }

      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Content Uploaded Successfully',
        description: 'Run "Get Feedback" to analyze your new content for quality and improvements.',
        duration: 5000,
      });
      invalidateLessonCaches({ lessonId: uploadContentTargetLessonId || lessonId, courseId });
      if (uploadContentTargetLessonId && uploadContentTargetLessonId !== lessonId) {
        invalidateLessonCaches({ lessonId, courseId });
      }
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: ['/api/content', courseId, 'lessons/health'] });
      }
      setUploadContentDialogOpen(false);
      setContentFile(null);
      onActionComplete?.();
      onUploadContentSuccess?.({
        extractedWordCount: data.extractedWordCount,
        extractedText: data.extractedText,
        detectedLanguage: data.detectedLanguage,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload content",
      });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        `/api/lessons/${lessonId}/download?organizationId=${organizationId}`,
        { method: "GET" }
      );
      return response;
    },
    onSuccess: async (data: any) => {
      if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
        const filename = data.filename || generatePptxFilename(lesson.title);
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
            description: "Your PPTX file is downloading",
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Download failed",
          description: "Invalid download URL received from server",
        });
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error.message || "Failed to download PPTX",
      });
    },
  });

  const downloadVideoMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        `/api/lessons/${lessonId}/download-video?organizationId=${organizationId}`,
        { method: "GET" }
      );
      return response;
    },
    onSuccess: async (data: any) => {
      if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
        const filename = data.filename || `${sanitizeFilename(lesson.title)}.mp4`;
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
            description: "Your video file is downloading",
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Download failed",
          description: "Invalid download URL received from server",
        });
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error.message || "Failed to download video",
      });
    },
  });

  const deleteSourceContentMutation = useMutation({
    mutationFn: async () => {
      const targetLessonId = sourceContentLangLessonId || lessonId;
      return await apiRequest(
        `/api/lessons/${targetLessonId}/source-document?organizationId=${organizationId}`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      const targetLessonId = sourceContentLangLessonId || lessonId;
      toast({
        title: "Source content deleted",
        description: "The source content has been removed from this lesson.",
      });
      invalidateLessonCaches({ lessonId: targetLessonId, courseId });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', targetLessonId, 'source-document'] });
      queryClient.invalidateQueries({ queryKey: ['/api/content'] });
      setContentDialogOpen(false);
      setDeleteSourceContentConfirmOpen(false);
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Failed to delete source content",
      });
    },
  });

  const saveViewContentMutation = useMutation({
    mutationFn: async () => {
      if (!(selectedDocVersion === 'current' || selectedDocVersion.startsWith('current-'))) {
        throw new Error("Only the current version can be edited.");
      }
      return await apiRequest(
        `/api/lessons/${viewContentLangLessonId}/source-document?organizationId=${organizationId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            text: viewContentDraftText,
            changeDescription: "Manual edit from Lesson Source Content dialog",
          }),
        }
      );
    },
    onSuccess: () => {
      toast({
        title: "Source content saved",
        description: "A new source content version was created and set as current.",
      });
      setViewContentDirty(false);
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', viewContentLangLessonId, 'source-document', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', viewContentLangLessonId, 'content-versions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
      invalidateLessonCaches({ lessonId: viewContentLangLessonId || lessonId, courseId });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "Failed to save source content",
      });
    },
  });

  const regenerateDigestMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/lessons/${lessonId}/digest/regenerate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: hasLessonDigest ? "Lesson digest updated" : "Lesson digest generated",
        description: "Guided lesson text is ready for learners.",
      });
      invalidateLessonCaches({ lessonId, courseId });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'viewer'] });
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Digest generation failed",
        description: error.message || "Failed to generate lesson digest",
      });
    },
  });

  const triggerDigestRegeneration = () => {
    if (regenerateDigestMutation.isPending) return;
    toast({
      title: hasLessonDigest ? "Regenerating lesson digest..." : "Generating lesson digest...",
      description: "AI generation started. This may take a few seconds.",
    });
    regenerateDigestMutation.mutate();
  };

  const previewViewContentFeedbackMutation = useMutation({
    mutationFn: async () => {
      const compareBaseText = feedbackMode === 'compare' ? getVersionContent(compareBaseVersionId) : '';
      const targetText = feedbackMode === 'compare'
        ? getVersionContent(compareTargetVersionId)
        : viewContentDraftText;
      return await apiRequest(
        `/api/lessons/${viewContentLangLessonId}/source-document/feedback-preview?organizationId=${organizationId}`,
        {
          method: "POST",
          body: JSON.stringify({
            text: targetText,
            mode: feedbackMode,
            compareBaseText,
          }),
        }
      );
    },
    onSuccess: (data: any) => {
      setViewContentFeedback(data?.actionable || data?.report || null);
      setViewContentFeedbackMeta({
        contentHash: hashText(
          feedbackMode === 'compare'
            ? getVersionContent(compareTargetVersionId)
            : viewContentDraftText
        ),
        feedbackMode,
        baseVersionId: feedbackMode === 'compare' ? compareBaseVersionId : undefined,
        compareTargetVersionId: feedbackMode === 'compare' ? compareTargetVersionId : undefined,
      });
      toast({
        title: "Feedback generated",
        description: feedbackMode === 'compare'
          ? "AI compare feedback is ready for selected versions."
          : "AI feedback is ready for the current draft content.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Feedback failed",
        description: error.message || "Could not generate feedback",
      });
    },
  });

  if (hideMenu) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClassName} style={triggerStyle} data-testid={`button-menu-${lesson.id}`} >
            <MoreVertical className="h-4 w-4 mr-1" />
            <span className="sm:hidden">Actions</span>
            <span className="hidden sm:inline">Lesson Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showView && typeof lesson.id === 'string' && (
            <DropdownMenuItem
              onClick={() => setLocation(`/lessons/${lessonId}${courseId ? `?returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : ''}`)}
              data-testid={`button-view-${lesson.id}`}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
          )}
          {showEdit && (
            <DropdownMenuItem
              onClick={() => setEditDialogOpen(true)}
              data-testid={`button-edit-${lesson.id}`}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {showViewContent && (
            <DropdownMenuItem
              onClick={() => setLocation(buildContentStudioUrl(lessonId))}
              disabled={!hasLessonContent}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Lesson Content (DB)
            </DropdownMenuItem>
          )}
          {showViewLastReport && (
            <DropdownMenuItem onClick={() => setLanguagePickerMode('view-last-report')}>
              <History className="h-4 w-4 mr-2 text-primary" />
              View Last Report
            </DropdownMenuItem>
          )}
          {showGetFeedback && (
            hasInputText ? (
              <DropdownMenuItem
                onClick={() => setLocation(buildContentStudioUrl(lessonId, { autoFeedback: true }))}
                data-testid={`button-get-feedback-${lesson.id}`}
              >
                <GraduationCap className="mr-2 h-4 w-4" />
                Get Feedback
              </DropdownMenuItem>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem
                        disabled
                        data-testid={`button-get-feedback-${lesson.id}`}
                      >
                        <GraduationCap className="mr-2 h-4 w-4" />
                        Get Feedback
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>No source content available for feedback</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          )}
          {showSetLearningObjectives && (
            <DropdownMenuItem
              onClick={() => onSetLearningObjectives?.(lessonId)}
              data-testid={`button-set-learning-objectives-${lesson.id}`}
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              Set Learning Objectives
            </DropdownMenuItem>
          )}
          {context === 'course-builder' && showGenerateSourceDbContent && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                if (!canGenerateSourceDbContent || isGeneratingSourceDbContent) return;
                onGenerateSourceDbContent?.(lessonId);
              }}
              onClick={(event) => {
                event.preventDefault();
                if (!canGenerateSourceDbContent || isGeneratingSourceDbContent) return;
                onGenerateSourceDbContent?.(lessonId);
              }}
              disabled={!canGenerateSourceDbContent || isGeneratingSourceDbContent}
              title={!canGenerateSourceDbContent ? (sourceDbContentBlockedReason || 'Complete prerequisites before generating source DB content.') : undefined}
              data-testid={`button-generate-source-db-content-${lesson.id}`}
            >
              <Sparkles className={`mr-2 h-4 w-4 ${isGeneratingSourceDbContent ? 'animate-pulse' : ''}`} />
              {isGeneratingSourceDbContent ? 'Generating Source DB Content...' : generateSourceDbContentLabel}
            </DropdownMenuItem>
          )}
          {context === 'course-builder' && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                if (!hasLessonContent) return;
                triggerDigestRegeneration();
              }}
              onClick={(event) => {
                event.preventDefault();
                if (!hasLessonContent) return;
                triggerDigestRegeneration();
              }}
              disabled={!hasLessonContent || regenerateDigestMutation.isPending}
              data-testid={`button-generate-lesson-digest-${lesson.id}`}
            >
              <FileText className={`mr-2 h-4 w-4 ${regenerateDigestMutation.isPending ? 'animate-pulse' : ''}`} />
              {!hasLessonContent
                ? 'Generate Lesson Digest (Source Content Required)'
                : regenerateDigestMutation.isPending
                ? (hasLessonDigest ? 'Regenerating Lesson Digest...' : 'Generating Lesson Digest...')
                : (hasLessonDigest ? 'Regenerate Lesson Digest' : 'Generate Lesson Digest')}
            </DropdownMenuItem>
          )}
          {showViewChanges && (
            <DropdownMenuItem
              onClick={() => setLanguagePickerMode('view-ai-changes')}
              disabled={!(lesson as any).hasContentVersions && !hasInputText}
              data-testid={`button-view-changes-${lesson.id}`}
            >
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              View AI Changes
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setManageVersionsOpen(true)}
            data-testid={`button-manage-versions-${lesson.id}`}
          >
            <History className="mr-2 h-4 w-4" />
            Manage Versions
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setVersionHistoryOpen(true)}
            data-testid={`button-version-history-${lesson.id}`}
          >
            <History className="h-4 w-4 mr-2" />
            Version History
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {lesson.sourceDocumentPath && (
            <DropdownMenuItem
              onClick={() => setContentDialogOpen(true)}
              data-testid={`button-view-source-content-${lesson.id}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              View Source Content
            </DropdownMenuItem>
          )}
          {lesson.sourceDocumentPath && (
            <DropdownMenuItem
              onClick={() => setLanguagePickerMode('download-word-doc')}
              data-testid={`button-download-word-doc-${lesson.id}`}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Word Doc
            </DropdownMenuItem>
          )}
          {showGenerateQuiz && !isOverviewLesson && (
            <>
              {hasOutdatedQuizzes && (
                <div className="px-2 py-1.5 text-xs text-warning dark:text-warning bg-warning/10 dark:bg-warning/30 mx-1 my-1 rounded flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>Presentation updated. Consider regenerating the quiz to reflect latest content.</span>
                </div>
              )}
              <DropdownMenuItem
                onClick={() => {
                  if (!hasLessonContent) return;
                  const params = new URLSearchParams();
                  params.set('lessonId', lessonId);
                  params.set('organizationId', organizationId);
                  if (courseId) {
                    params.set('courseId', courseId);
                    params.set('returnTo', `/course-builder/${courseId}/lessons`);
                  }
                  setLocation(`/quiz-wizard?${params.toString()}`);
                }}
                disabled={!hasLessonContent}
                data-testid={`button-generate-quiz-${lesson.id}`}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {hasOutdatedQuizzes ? 'Regenerate Quiz (AI)' : 'Generate Quiz (AI)'}
              </DropdownMenuItem>
            </>
          )}
          {context === 'course-builder' && courseId && (
            <DropdownMenuItem
              onClick={() => {
                if (!canGeneratePodcast) return;
                const params = new URLSearchParams();
                params.set('organizationId', organizationId);
                params.set('courseId', courseId);
                params.set('courseName', String((lesson as any)?.courseName || '').trim());
                params.set('lessonTitle', lesson.title || '');
                params.set('returnTo', `/course-builder/${courseId}/lessons`);
                if (hasCompletedPodcast) params.set('regenerate', '1');
                if (hasPodcastSourceDb) params.set('hasSourceDb', '1');
                if (hasPodcastWord) params.set('hasWord', '1');
                if (hasPodcastPptx) params.set('hasPptx', '1');
                setLocation(`/lessons/${lessonId}/podcast-wizard?${params.toString()}`);
              }}
              disabled={!canGeneratePodcast}
              data-testid={`button-generate-podcast-${lesson.id}`}
            >
              <Mic className="mr-2 h-4 w-4" />
              <span className="mr-2">{hasCompletedPodcast ? 'Regenerate Podcast' : 'Generate Podcast'}</span>
              {podcastJobStatus !== 'idle' && (
                <Badge variant={podcastStatusVariant} className="px-1.5 py-0">
                  {podcastJobStatus}
                </Badge>
              )}
            </DropdownMenuItem>
          )}
          {context === 'course-builder' && hasCompletedPodcast && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  window.open(
                    `/api/lessons/${lessonId}/podcast/download?organizationId=${organizationId}`,
                    "_blank"
                  );
                }}
                data-testid={`button-download-podcast-${lesson.id}`}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Podcast (MP3)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  window.open(
                    `/api/lessons/${lessonId}/podcast/script/download?organizationId=${organizationId}`,
                    "_blank"
                  );
                }}
                data-testid={`button-download-podcast-script-${lesson.id}`}
              >
                <FileText className="mr-2 h-4 w-4" />
                Download Podcast Script
              </DropdownMenuItem>
              {courseId && (
                <DropdownMenuItem
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set('organizationId', organizationId);
                    params.set('courseId', courseId);
                    params.set('courseName', String((lesson as any)?.courseName || '').trim());
                    params.set('lessonTitle', lesson.title || '');
                    params.set('openStatus', '1');
                    params.set('returnTo', `/course-builder/${courseId}/lessons`);
                    if (hasPodcastSourceDb) params.set('hasSourceDb', '1');
                    if (hasPodcastWord) params.set('hasWord', '1');
                    if (hasPodcastPptx) params.set('hasPptx', '1');
                    setLocation(`/lessons/${lessonId}/podcast-wizard?${params.toString()}`);
                  }}
                  data-testid={`button-replace-podcast-${lesson.id}`}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Replace Podcast Audio
                </DropdownMenuItem>
              )}
            </>
          )}
          {showEditQuiz && isCompleted && lesson.linkedQuizId && (
            <DropdownMenuItem
              onClick={() => {
                setLanguagePickerMode('edit-quiz');
              }}
              data-testid={`button-edit-quiz-${lesson.id}`}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Quiz
            </DropdownMenuItem>
          )}
          {showDownloadPPTX && (isCompleted || hasPPTX) && (
            <DropdownMenuItem
              onClick={() => {
                setLanguagePickerMode('download-pptx');
              }}
              disabled={downloadMutation.isPending}
              data-testid={`button-download-${lesson.id}`}
            >
              <Download className={`mr-2 h-4 w-4 ${downloadMutation.isPending ? 'animate-pulse' : ''}`} />
              {downloadMutation.isPending ? 'Downloading...' : 'Download PPTX'}
            </DropdownMenuItem>
          )}
          {showReplacePPTX && hasPPTX && courseId && topicOrder !== undefined && (
            <DropdownMenuItem
              onClick={() => {
                setLanguagePickerMode('replace-pptx');
              }}
              data-testid={`button-replace-pptx-${lesson.id}`}
            >
              <Upload className="mr-2 h-4 w-4" />
              Replace PPTX
            </DropdownMenuItem>
          )}
          {showUploadPPTX && courseId && topicOrder !== undefined && (
            <DropdownMenuItem
              onClick={() => setLocation(`/course-builder/${courseId}/upload/${topicOrder}?lessonId=${lessonId}&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}`)}
              data-testid={`button-upload-pptx-${lesson.id}`}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Presentation
            </DropdownMenuItem>
          )}
          {showGenerate && courseId && (
            shouldBlockGeneration ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled
                      className="opacity-50 cursor-not-allowed"
                      data-testid={`button-generate-${lesson.id}`}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Generate PPTX
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Wait for current generation to complete</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  const lessonTitle = lesson.title || '';
                  const topicIdParam = topicId ? `&topicId=${topicId}` : '';
                  const topicNameParam = topicName ? `&topicName=${encodeURIComponent(topicName)}` : '';
                  const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
                  setLocation(`/lessons/new?courseId=${courseId}${topicIdParam}${topicNameParam}&topicOrder=${topicOrder}&prefillTitle=${encodeURIComponent(lessonTitle)}&returnToCourse=true${lessonId ? `&lessonId=${lessonId}` : ''}${returnParams}`);
                }}
                data-testid={`button-generate-${lesson.id}`}
              >
                <Wand2 className="mr-2 h-4 w-4" />
                Generate PPTX
              </DropdownMenuItem>
            )
          )}
          {showDelete && !isCompleted && (
            <DropdownMenuItem
              onClick={() => setUnlinkDialogOpen(true)}
              className="text-destructive focus:text-destructive"
              data-testid={`button-delete-pending-${lesson.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          )}
          {showUploadVideo && (
            <DropdownMenuItem
              onClick={() => setVideoUploadDialogOpen(true)}
              data-testid={`button-upload-video-${lesson.id}`}
            >
              <Upload className="mr-2 h-4 w-4" />
              {lesson.videoStorageKey ? "Replace Video" : "Upload Video"}
            </DropdownMenuItem>
          )}
          {showUploadVideo && lesson.videoStorageKey && (
            <DropdownMenuItem
              onClick={() => setLanguagePickerMode('download-video')}
              disabled={downloadVideoMutation.isPending}
              data-testid={`button-download-video-${lesson.id}`}
            >
              <Download className={`mr-2 h-4 w-4 ${downloadVideoMutation.isPending ? 'animate-pulse' : ''}`} />
              {downloadVideoMutation.isPending ? 'Downloading...' : 'Download Video'}
            </DropdownMenuItem>
          )}
          {showUploadContent && (
            <DropdownMenuItem
              onClick={() => setLanguagePickerMode('upload-content')}
              data-testid={`button-upload-content-${lesson.id}`}
            >
              <FileText className="mr-2 h-4 w-4" />
              Upload Content (Word)
            </DropdownMenuItem>
          )}
          {context === 'course-builder' && showSetCourseLessonType && (
            <>
              <DropdownMenuSeparator />
              {courseLessonType !== 'overview' && (
                <DropdownMenuItem
                  onClick={() => setCourseLessonTypeMutation.mutate('overview')}
                  disabled={setCourseLessonTypeMutation.isPending}
                  data-testid={`button-set-overview-${lesson.id}`}
                >
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Set as Overview
                </DropdownMenuItem>
              )}
              {courseLessonType !== 'key_takeaways' && (
                <DropdownMenuItem
                  onClick={() => setCourseLessonTypeMutation.mutate('key_takeaways')}
                  disabled={setCourseLessonTypeMutation.isPending}
                  data-testid={`button-set-key-takeaways-${lesson.id}`}
                >
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Set as Key Takeaways
                </DropdownMenuItem>
              )}
              {courseLessonType !== 'content' && (
                <DropdownMenuItem
                  onClick={() => setCourseLessonTypeMutation.mutate('content')}
                  disabled={setCourseLessonTypeMutation.isPending}
                  data-testid={`button-set-content-${lesson.id}`}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Set as Content Lesson
                </DropdownMenuItem>
              )}
            </>
          )}
          {showRegenerate && canRegenerate && (
            shouldBlockGeneration ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled
                      className="opacity-50 cursor-not-allowed"
                      data-testid={`button-regenerate-${lesson.id}`}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate PPTX
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Wait for current generation to complete</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  setLanguagePickerMode('regenerate');
                }}
                data-testid={`button-regenerate-${lesson.id}`}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate PPTX
              </DropdownMenuItem>
            )
          )}
          {canRetryPending && (
            shouldBlockGeneration ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled
                      className="opacity-50 cursor-not-allowed"
                      data-testid={`button-retry-generation-${lesson.id}`}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {hasExistingPresentation ? "Retry Generation" : "Generate PPTX"}
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Wait for current generation to complete</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  // Include topicId and topicName for proper topic content hydration
                  const topicIdParam = topicId ? `&topicId=${topicId}` : '';
                  const topicNameParam = topicName ? `&topicName=${encodeURIComponent(topicName)}` : '';
                  const topicOrderParam = topicOrder !== undefined ? `&topicOrder=${topicOrder}` : '';
                  const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
                  const wizardUrl = courseId 
                    ? `/lessons/new?org=${organizationId}&courseId=${courseId}${topicIdParam}${topicNameParam}${topicOrderParam}&lessonId=${lessonId}${returnParams}`
                    : `/lessons/new?org=${organizationId}&lessonId=${lessonId}`;
                  setLocation(wizardUrl);
                }}
                data-testid={`button-retry-generation-${lesson.id}`}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {hasExistingPresentation ? "Retry Generation" : "Generate PPTX"}
              </DropdownMenuItem>
            )
          )}
          
          {context === 'course-builder' && showRemoveFromCourse && !(showDelete && !isCompleted) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setUnlinkDialogOpen(true)}
                className="text-warning focus:text-warning"
                data-testid={`button-unlink-${lesson.id}`}
              >
                <Unlink className="mr-2 h-4 w-4" />
                Remove from Course
              </DropdownMenuItem>
            </>
          )}
          
          {context === 'library' && showArchive && (
            <>
              <DropdownMenuSeparator />
              {!lesson.isArchived ? (
                <DropdownMenuItem
                  onClick={() => archiveMutation.mutate()}
                  data-testid={`button-archive-${lesson.id}`}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={() => restoreMutation.mutate()}
                    data-testid={`button-restore-${lesson.id}`}
                  >
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => deleteMutation.mutate()}
                    className="text-destructive"
                    data-testid={`button-delete-${lesson.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Permanently
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <LessonEditDialog
        lesson={lesson}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        organizationId={organizationId}
        organizationType={organizationType}
        courseId={courseId}
        onSuccess={onActionComplete}
      />

      <Dialog open={videoUploadDialogOpen} onOpenChange={(open) => {
        setVideoUploadDialogOpen(open);
        if (!open) setVideoFile(null);
      }}>
        <DialogContent className="w-[min(95vw,28rem)] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-lg)]">
              {lesson.videoStorageKey ? "Replace" : "Upload"} Video Walkthrough
            </DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Upload an MP4 video walkthrough of this lesson (maximum 1GB)
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-[var(--space-md)]">
            <div className="space-y-[var(--space-sm)]">
              <Label htmlFor="video-file" className="text-[length:var(--text-sm)]">MP4 Video File</Label>
              <Input
                id="video-file"
                type="file"
                accept=".mp4,video/mp4"
                className="min-h-[44px]"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setVideoFile(file);
                }}
                data-testid="input-video-file"
              />
              {videoFile && (
                <p className="text-[length:var(--text-sm)] text-success">
                  Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => {
                setVideoUploadDialogOpen(false);
                setVideoFile(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => uploadVideoMutation.mutate()}
              disabled={!videoFile || uploadVideoMutation.isPending}
              className="min-h-[44px] touch-manipulation"
              data-testid="button-upload-video"
            >
              {uploadVideoMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {lesson.videoStorageKey ? "Replacing..." : "Uploading..."}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {lesson.videoStorageKey ? "Replace" : "Upload"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadContentDialogOpen} onOpenChange={(open) => {
        setUploadContentDialogOpen(open);
        if (!open) {
          setContentFile(null);
          setUploadContentTargetLessonId(lessonId);
        }
      }}>
        <DialogContent className="w-[min(95vw,28rem)] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-lg)]">Upload Content (Word Document)</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Upload a Word document to supplement or replace the lesson's source content. 
              This will extract the text and update the lesson's input material.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-[var(--space-md)]">
            <div className="space-y-[var(--space-sm)]">
              <Label htmlFor="content-file" className="text-[length:var(--text-sm)]">Word Document (.docx)</Label>
              <Input
                id="content-file"
                type="file"
                accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                className="min-h-[44px]"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setContentFile(file);
                }}
                data-testid="input-content-file"
              />
              {contentFile && (
                <p className="text-[length:var(--text-sm)] text-success">
                  Selected: {contentFile.name} ({(contentFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => {
                setUploadContentDialogOpen(false);
                setContentFile(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => uploadContentMutation.mutate()}
              disabled={!contentFile || uploadContentMutation.isPending}
              className="min-h-[44px] touch-manipulation"
              data-testid="button-confirm-upload-content"
            >
              {uploadContentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent className="max-w-[min(425px,90vw)] p-[var(--dialog-padding)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Lesson from Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{lesson.title}" from this course? The lesson will remain in your Lesson Library and can be re-linked later.
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
              onClick={() => unlinkMutation.mutate()}
              className="bg-warning hover:bg-warning/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-confirm-unlink"
            >
              {unlinkMutation.isPending ? 'Removing...' : 'Remove from Course'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LessonContentDiffModal
        open={contentDiffModalOpen}
        onOpenChange={(open) => {
          setContentDiffModalOpen(open);
          if (!open) setContentDiffLessonId(lessonId);
        }}
        lessonId={contentDiffLessonId}
        lessonTitle={lesson.title}
      />

      <Dialog open={pptxPickerOpen} onOpenChange={setPptxPickerOpen}>
        <DialogContent className="w-[min(95vw,28rem)] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-lg)]">Select PPTX Version to Download</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Choose which version to download. AI-generated versions are preserved permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-[var(--space-sm)]">
            {presentationVersions?.versions && presentationVersions.versions.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {(() => {
                  const versions = presentationVersions.versions;
                  const latestUserUploadedId = versions
                    .filter(v => !v.isGenerated)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;
                  
                  return versions
                    .filter(v => v.isGenerated || v.id === latestUserUploadedId)
                    .map((version) => {
                      const isCurrent = version.version === presentationVersions.currentVersion;
                      const createdDate = new Date(version.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      const isDownloading = downloadingVersionId === version.id;
                      return (
                        <Button key={version.id} variant="outline" className={`w-full justify-between p-3 h-auto ${ isCurrent ? 'border-border bg-primary/5' : '' }`} disabled={isDownloading} onClick={async () => {
                            setDownloadingVersionId(version.id);
                            try {
                              const data = await downloadVersionMutation.mutateAsync(version.id);
                              if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                const filename = data.filename || generatePptxFilename(lesson.title, version.version);
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
                                  setPptxPickerOpen(false);
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
                          data-testid={`download-version-${version.version}`}
                        >
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[length:var(--text-sm)]">
                                Version {version.version}
                              </span>
                              <Badge variant={version.isGenerated ? "default" : "secondary"} className="px-1.5 py-0" >
                                {version.isGenerated ? 'AI Generated' : 'Uploaded'}
                              </Badge>
                              {isCurrent && (
                                <Badge variant="outline" className="px-1.5 py-0">
                                  Current
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {createdDate}
                            </span>
                          </div>
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 flex-shrink-0" />
                          )}
                        </Button>
                      );
                    });
                })()}
              </div>
            ) : (
              <p className="text-[length:var(--text-sm)] text-muted-foreground text-center py-4">
                No version history available
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => setPptxPickerOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={langPptxPickerOpen} onOpenChange={(open) => {
        setLangPptxPickerOpen(open);
        if (!open) setDownloadLangLessonId(null);
      }}>
        <DialogContent className="w-[min(95vw,28rem)] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-lg)]">Select PPTX Version to Download</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Choose which version to download for this language.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-[var(--space-sm)]">
            {langVersionsData?.versions && langVersionsData.versions.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {(() => {
                  const versions = langVersionsData.versions;
                  const latestUserUploadedId = versions
                    .filter((v: any) => !v.isGenerated)
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;

                  return versions
                    .filter((v: any) => v.isGenerated || v.id === latestUserUploadedId)
                    .map((version: any) => {
                      const isCurrent = version.version === langVersionsData.currentVersion;
                      const createdDate = new Date(version.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      });
                      const isDownloading = downloadingVersionId === version.id;
                      return (
                        <Button key={version.id} variant="outline" className={`w-full justify-between p-3 h-auto ${isCurrent ? 'border-border bg-primary/5' : ''}`} disabled={isDownloading} onClick={async () => {
                            setDownloadingVersionId(version.id);
                            try {
                              const data = await apiRequest(`/api/lessons/${downloadLangLessonId}/presentation-versions/${version.id}/download?organizationId=${organizationId}`, { method: "GET" });
                              if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                const filename = data.filename || generatePptxFilename(lesson.title, version.version);
                                const success = await safeDownload(data.downloadUrl, filename, (error) => {
                                  toast({ variant: "destructive", title: "Download failed", description: error });
                                });
                                if (success) {
                                  toast({ title: "Download started", description: `Downloading version ${version.version}` });
                                  setLangPptxPickerOpen(false);
                                  setDownloadLangLessonId(null);
                                }
                              }
                            } catch (error: any) {
                              toast({ variant: "destructive", title: "Download failed", description: error.message || "Failed to download version" });
                            }
                            setDownloadingVersionId(null);
                          }}
                        >
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[length:var(--text-sm)]">
                                Version {version.version}
                              </span>
                              <Badge variant={version.isGenerated ? "default" : "secondary"} className="px-1.5 py-0" >
                                {version.isGenerated ? 'AI Generated' : 'Uploaded'}
                              </Badge>
                              {isCurrent && (
                                <Badge variant="outline" className="px-1.5 py-0">
                                  Current
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {createdDate}
                            </span>
                          </div>
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 flex-shrink-0" />
                          )}
                        </Button>
                      );
                    });
                })()}
              </div>
            ) : (
              <p className="text-[length:var(--text-sm)] text-muted-foreground text-center py-4">
                No version history available
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => { setLangPptxPickerOpen(false); setDownloadLangLessonId(null); }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contentDialogOpen} onOpenChange={(open) => {
        setContentDialogOpen(open);
        if (!open) {
          setSourceContentLangLessonId(lessonId);
          setSelectedSourceVersion('current');
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Source Content: {lesson.title}</DialogTitle>
            <DialogDescription>The uploaded source document content for this lesson</DialogDescription>
          </DialogHeader>
          {(() => {
            const wordDocLangs = (languageVariants || []).filter(v => v.hasWordDoc);
            if (wordDocLangs.length > 1) {
              return (
                <div className="flex items-center gap-2 pb-2">
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Select value={sourceContentLangLessonId} onValueChange={setSourceContentLangLessonId}>
                    <SelectTrigger className="w-[200px] min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {wordDocLangs.map((v) => (
                        <SelectItem key={v.lessonId} value={v.lessonId}>
                          {v.name} ({v.code.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return null;
          })()}
          {Array.isArray(contentVersions) && contentVersions.length > 0 && (
            <div className="flex items-center gap-2 pb-2 border-b">
              <History className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select value={selectedSourceVersion} onValueChange={setSelectedSourceVersion}>
                <SelectTrigger className="w-[280px] min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current Version</SelectItem>
                  {contentVersions.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.versionNumber} - {getVersionSourceLabel(v.source)} ({new Date(v.createdAt).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none flex-1 overflow-y-auto">
            {(() => {
              if (selectedSourceVersion !== 'current' && Array.isArray(contentVersions)) {
                const version = contentVersions.find((v: any) => v.id === selectedSourceVersion);
                if (version) {
                  return <pre className="whitespace-pre-wrap text-sm">{version.newContent}</pre>;
                }
              }
              if (sourceContentLangLessonId !== lessonId ? sourceContentLangLoading : contentLoading) {
                return <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;
              }
              const text = sourceContentLangLessonId !== lessonId ? sourceContentLangData?.text : lessonContent?.text;
              return text ? (
                <pre className="whitespace-pre-wrap text-sm">{text}</pre>
              ) : (
                <p className="text-muted-foreground">No source content available</p>
              );
            })()}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-4 border-t">
              <Button variant="destructive" onClick={() => setDeleteSourceContentConfirmOpen(true)}
              disabled={!(
                (sourceContentLangLessonId !== lessonId
                  ? !!sourceContentLangData?.text
                  : !!lessonContent?.text
                )
              ) || deleteSourceContentMutation.isPending}
              className="min-h-[44px] touch-manipulation"
              data-testid="button-delete-source-content"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Content
            </Button>
            <Button variant="outline" onClick={() => setContentDialogOpen(false)}
              className="min-h-[44px] touch-manipulation"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteSourceContentConfirmOpen} onOpenChange={setDeleteSourceContentConfirmOpen}>
        <AlertDialogContent className="max-w-[min(425px,90vw)] p-[var(--dialog-padding)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Source Content</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this source content? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-cancel-delete-source-content"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSourceContentMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="dialog-confirm-delete-source-content"
            >
              {deleteSourceContentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Content'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!languagePickerMode} onOpenChange={(open) => {
        if (!open) setLanguagePickerMode(null);
      }}>
        <DialogContent className="w-[min(95vw,28rem)] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-lg)]">
              {languagePickerMode === 'regenerate' ? 'Select Language to Regenerate PPTX' 
                : languagePickerMode === 'edit-quiz' ? 'Select Language to Edit Quiz'
                : languagePickerMode === 'download-pptx' ? 'Select Language to Download PPTX'
                : languagePickerMode === 'download-video' ? 'Select Language to Download Video'
                : languagePickerMode === 'download-word-doc' ? 'Select Language to Download Word Doc'
                : languagePickerMode === 'replace-pptx' ? 'Select Language to Replace PPTX'
                : languagePickerMode === 'get-feedback' ? 'Select Language for Feedback'
                : languagePickerMode === 'view-last-report' ? 'Select Language to View Report'
                : languagePickerMode === 'view-ai-changes' ? 'Select Language to View Changes'
                : languagePickerMode === 'upload-content' ? 'Select Language to Upload Content'
                : 'Select Language'}
            </DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              {languagePickerMode === 'regenerate'
                ? 'Choose which language version to regenerate.'
                : languagePickerMode === 'edit-quiz' ? 'Choose which language version of the quiz to edit.'
                : languagePickerMode === 'download-pptx' ? 'Choose which language version to download.'
                : languagePickerMode === 'download-video' ? 'Choose which language version of the video to download.'
                : languagePickerMode === 'download-word-doc' ? 'Choose which language version of the document to download.'
                : languagePickerMode === 'replace-pptx' ? 'Choose which language version to upload/replace the presentation for.'
                : languagePickerMode === 'get-feedback' ? 'Choose which language version to get expert feedback for.'
                : languagePickerMode === 'view-last-report' ? 'Choose which language version report to view.'
                : languagePickerMode === 'view-ai-changes' ? 'Choose which language version changes to compare.'
                : languagePickerMode === 'upload-content' ? 'Choose which language version to upload content for.'
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-[var(--space-sm)]">
            {languageVariantsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (() => {
              const filteredVariants = languagePickerMode === 'edit-quiz'
                ? (languageVariants || []).filter(v => v.quizIds && v.quizIds.length > 0)
                : languagePickerMode === 'download-pptx'
                ? (languageVariants || []).filter(v => v.hasPptx)
                : languagePickerMode === 'download-word-doc'
                ? (languageVariants || []).filter(v => v.hasWordDoc)
                : (languageVariants || []);

              const shouldAutoRedirectSingleOption = languagePickerMode !== 'get-feedback';
              if (shouldAutoRedirectSingleOption && filteredVariants.length <= 1 && languageVariants && !languageVariantsLoading) {
                return (
                  <p className="text-muted-foreground text-center py-4 text-sm">
                    Redirecting...
                  </p>
                );
              }

              return (
                <div className="space-y-2">
                  {filteredVariants.map((variant) => (
                    <Button key={variant.lessonId} variant="outline" className="w-full justify-start p-3 h-auto min-h-[44px] touch-manipulation" onClick={() => {
                        if (languagePickerMode === 'regenerate') {
                          const topicIdParam = topicId ? `&topicId=${topicId}` : '';
                          const topicNameParam = topicName ? `&topicName=${encodeURIComponent(topicName)}` : '';
                          const topicOrderParam = topicOrder !== undefined ? `&topicOrder=${topicOrder}` : '';
                          const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
                          const wizardUrl = courseId
                            ? `/lessons/new?org=${organizationId}&courseId=${courseId}${topicIdParam}${topicNameParam}${topicOrderParam}&lessonId=${variant.lessonId}&regenerate=true${returnParams}`
                            : `/lessons/new?org=${organizationId}&lessonId=${variant.lessonId}&regenerate=true`;
                          setLanguagePickerMode(null);
                          setLocation(wizardUrl);
                        } else if (languagePickerMode === 'edit-quiz' && variant.quizIds.length > 0) {
                          const returnParams = courseId ? `&returnTo=${encodeURIComponent(`/course-builder/${courseId}/lessons`)}&courseId=${courseId}` : '';
                          setLanguagePickerMode(null);
                          setLocation(`/quiz-card-manager?quizId=${variant.quizIds[0]}&mode=edit${returnParams}`);
                        } else if (languagePickerMode === 'download-pptx') {
                          setLanguagePickerMode(null);
                          if (variant.lessonId === lessonId) {
                            if (hasMultipleVersions) {
                              setPptxPickerOpen(true);
                            } else {
                              downloadMutation.mutate();
                            }
                          } else {
                            setDownloadLangLessonId(variant.lessonId);
                          }
                        } else if (languagePickerMode === 'download-video') {
                          setLanguagePickerMode(null);
                          if (variant.lessonId === lessonId) {
                            downloadVideoMutation.mutate();
                          } else {
                            (async () => {
                              try {
                                const response = await fetch(`/api/lessons/${variant.lessonId}/download-video?organizationId=${organizationId}`, { credentials: 'include' });
                                if (!response.ok) throw new Error('Download failed');
                                const data = await response.json();
                                if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                  const filename = data.filename || `${sanitizeFilename(lesson.title)}.mp4`;
                                  await safeDownload(data.downloadUrl, filename, (error) => {
                                    toast({ variant: "destructive", title: "Download failed", description: error });
                                  });
                                } else {
                                  toast({ variant: "destructive", title: "Download failed", description: "Invalid download URL received" });
                                }
                              } catch (e) {
                                toast({ variant: "destructive", title: "Download failed", description: "Could not download video" });
                              }
                            })();
                          }
                        } else if (languagePickerMode === 'download-word-doc') {
                          setLanguagePickerMode(null);
                          (async () => {
                            try {
                              const response = await fetch(`/api/lessons/${variant.lessonId}/download-source-document?organizationId=${organizationId}`, { credentials: 'include' });
                              if (!response.ok) throw new Error('Download failed');
                              const data = await response.json();
                              if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                const filename = data.filename || `${sanitizeFilename(lesson.title)}.docx`;
                                await safeDownload(data.downloadUrl, filename, (error) => {
                                  toast({ variant: "destructive", title: "Download failed", description: error });
                                });
                              } else {
                                toast({ variant: "destructive", title: "Download failed", description: "Invalid download URL received" });
                              }
                            } catch (e) {
                              toast({ variant: "destructive", title: "Download failed", description: "Could not download document" });
                            }
                          })();
                        } else if (languagePickerMode === 'replace-pptx') {
                          setLanguagePickerMode(null);
                          const currentPath = window.location.pathname + window.location.search;
                          const returnTo = encodeURIComponent(currentPath);
                          setLocation(`/course-builder/${courseId}/upload/${topicOrder}?lessonId=${variant.lessonId}&returnTo=${returnTo}&courseId=${courseId}`);
                        } else if (languagePickerMode === 'get-feedback') {
                          setLanguagePickerMode(null);
                          onGetFeedback?.(variant.lessonId);
                        } else if (languagePickerMode === 'view-last-report') {
                          setLanguagePickerMode(null);
                          onViewLastReport?.(variant.lessonId);
                        } else if (languagePickerMode === 'view-ai-changes') {
                          setLanguagePickerMode(null);
                          setContentDiffLessonId(variant.lessonId);
                          setContentDiffModalOpen(true);
                        } else if (languagePickerMode === 'upload-content') {
                          setLanguagePickerMode(null);
                          setUploadContentTargetLessonId(variant.lessonId);
                          setUploadContentDialogOpen(true);
                        }
                      }}
                      data-testid={`lang-picker-${variant.code}`}
                    >
                      <Globe className="mr-2 h-4 w-4 flex-shrink-0" />
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{variant.name}</span>
                        {variant.nativeName !== variant.name && (
                          <span className="text-muted-foreground text-sm">({variant.nativeName})</span>
                        )}
                        <Badge variant={variant.isDefault ? 'default' : 'outline'} className="uppercase text-xs">
                          {variant.code}
                        </Badge>
                        {variant.isDefault && (
                          <Badge variant="secondary" className="text-xs">Source</Badge>
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              );
            })()}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => setLanguagePickerMode(null)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LessonVersionHistory
        lessonId={lessonId}
        open={versionHistoryOpen}
        onOpenChange={setVersionHistoryOpen}
      />

      {/* View Content Dialog */}
      <Dialog open={viewContentDialogOpen} onOpenChange={(open) => {
        setViewContentDialogOpen(open);
        if (!open) {
          setViewContentLangLessonId(lessonId);
          setSelectedDocVersion('current');
          setViewContentDirty(false);
          setViewContentDraftText("");
          setViewContentFeedback(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Lesson Source Content</DialogTitle>
            <DialogDescription>{lesson.title}</DialogDescription>
          </DialogHeader>
          {(() => {
            const contentLangs = (languageVariants || []).filter(v => v.hasContent);
            if (contentLangs.length > 1) {
              return (
                <div className="flex items-center gap-2 pb-2">
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Select value={viewContentLangLessonId} onValueChange={setViewContentLangLessonId}>
                    <SelectTrigger className="w-[200px] min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contentLangs.map((v) => (
                        <SelectItem key={v.lessonId} value={v.lessonId}>
                          {v.name} ({v.code.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return null;
          })()}
          {Array.isArray(contentVersionsWithCurrent) && contentVersionsWithCurrent.length > 0 && (
            <div className="flex items-center gap-2 pb-2 border-b">
              <History className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select
                value={selectedDocVersion}
                onValueChange={(nextValue) => {
                  if (
                    viewContentDirty &&
                    selectedDocVersion === 'current' &&
                    nextValue !== selectedDocVersion &&
                    !window.confirm("You have unsaved changes. Switch versions and discard unsaved edits?")
                  ) {
                    return;
                  }
                  setSelectedDocVersion(nextValue);
                  const nextText = getVersionContent(nextValue);
                  if (nextValue === 'current' || nextValue.startsWith('current-')) {
                    setViewContentDraftText(nextText);
                    setViewContentDirty(false);
                  }
                }}
              >
                <SelectTrigger className="w-[280px] min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current Version</SelectItem>
                  {contentVersionsWithCurrent
                      .filter((v: any) => !(normalizeVersionId(v.id).startsWith('current-') || normalizeVersionId(v.id) === 'current'))
                      .map((v: any) => (
                    <SelectItem key={normalizeVersionId(v.id)} value={normalizeVersionId(v.id)}>
                      v{v.versionNumber} - {getVersionSourceLabel(v.source)} ({new Date(v.createdAt).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={feedbackMode} onValueChange={(value: string) => setFeedbackMode((value as 'quick' | 'deep' | 'compare'))}>
                <SelectTrigger className="w-[150px] min-h-[44px] touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick Review</SelectItem>
                  <SelectItem value="deep">Deep Review</SelectItem>
                  <SelectItem value="compare">Compare Review</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={viewContentMode === 'compare' ? 'default' : 'outline'} size="sm" onClick={() => setViewContentMode(viewContentMode === 'compare' ? 'edit' : 'compare')}
              >
                <CompareIcon className="h-4 w-4 mr-1" />
                {viewContentMode === 'compare' ? 'Edit Mode' : 'Compare Mode'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => previewViewContentFeedbackMutation.mutate()}
                disabled={
                  previewViewContentFeedbackMutation.isPending ||
                  (feedbackMode === 'compare'
                    ? !getVersionContent(compareBaseVersionId).trim() || !getVersionContent(compareTargetVersionId).trim()
                    : !viewContentDraftText.trim())
                }
              >
                {previewViewContentFeedbackMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Getting Feedback...
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-4 w-4 mr-1" />
                    Get Feedback
                  </>
                )}
              </Button>
            </div>
          )}
          <div className="text-xs text-muted-foreground pb-2">
            Source: {viewContentData?.source === 'sourceDocument' ? 'Original uploaded document' : 'Lesson content (database)'}
            {typeof viewContentData?.extractedWordCount === 'number' ? ` | ${viewContentData.extractedWordCount} words` : ''}
          </div>
          {!Array.isArray(contentVersionsWithCurrent) || contentVersionsWithCurrent.length === 0 ? (
            <div className="pb-2">
              <Button variant="outline" size="sm" onClick={() => previewViewContentFeedbackMutation.mutate()}
                disabled={previewViewContentFeedbackMutation.isPending || !viewContentDraftText.trim()}
              >
                {previewViewContentFeedbackMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Getting Feedback...
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-4 w-4 mr-1" />
                    Get Feedback
                  </>
                )}
              </Button>
            </div>
          ) : null}
          {viewContentMode === 'compare' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Base Version</Label>
                <Select value={compareBaseVersionId} onValueChange={setCompareBaseVersionId}>
                  <SelectTrigger className="min-h-[40px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current Version</SelectItem>
                    {contentVersionsWithCurrent
                      .filter((v: any) => !(normalizeVersionId(v.id).startsWith('current-') || normalizeVersionId(v.id) === 'current'))
                      .map((v: any) => (
                      <SelectItem key={`base-${normalizeVersionId(v.id)}`} value={normalizeVersionId(v.id)}>
                        v{v.versionNumber} - {getVersionSourceLabel(v.source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Compare Version</Label>
                <Select value={compareTargetVersionId} onValueChange={setCompareTargetVersionId}>
                  <SelectTrigger className="min-h-[40px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current Version</SelectItem>
                    {contentVersionsWithCurrent
                      .filter((v: any) => !(normalizeVersionId(v.id).startsWith('current-') || normalizeVersionId(v.id) === 'current'))
                      .map((v: any) => (
                      <SelectItem key={`cmp-${normalizeVersionId(v.id)}`} value={normalizeVersionId(v.id)}>
                        v{v.versionNumber} - {getVersionSourceLabel(v.source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            {(() => {
              if (viewContentMode === 'compare') {
                const baseText = getVersionContent(compareBaseVersionId);
                const compareText = getVersionContent(compareTargetVersionId);
                if (compareBaseVersionId === compareTargetVersionId) {
                  return (
                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                      No differences. Select two different versions to compare.
                    </div>
                  );
                }
                const diffRows = computeLineDiff(baseText, compareText);
                return (
                  <div className="rounded-md border">
                    {diffRows.map((row, idx) => (
                      <div
                        key={`diff-row-${idx}`}
                        className={
                          row.type === 'added'
                            ? 'px-3 py-1 text-sm bg-success/10 text-success'
                            : row.type === 'removed'
                              ? 'px-3 py-1 text-sm bg-destructive/10 text-destructive line-through'
                              : 'px-3 py-1 text-sm bg-background'
                        }
                      >
                        {row.text || <span className="italic text-muted-foreground">(empty line)</span>}
                      </div>
                    ))}
                  </div>
                );
              }
              if (selectedDocVersion !== 'current' && !selectedDocVersion.startsWith('current-') && Array.isArray(contentVersionsWithCurrent)) {
                const version = contentVersionsWithCurrent.find((v: any) => normalizeVersionId(v.id) === normalizeVersionId(selectedDocVersion));
                if (version) {
                  return (
                    <Textarea
                      value={String(version.newContent || "")}
                      readOnly
                      className="min-h-[42vh] whitespace-pre-wrap text-sm leading-relaxed"
                    />
                  );
                }
              }
              return (
                <Textarea
                  value={viewContentDraftText}
                  onChange={(e) => {
                    setViewContentDraftText(e.target.value);
                    setViewContentDirty(true);
                  }}
                  className="min-h-[42vh] whitespace-pre-wrap text-sm leading-relaxed"
                  placeholder="No content available for this lesson."
                />
              );
            })()}
          </div>
          {!!viewContentFeedback && (
            <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/20">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Feedback Score: {Math.round(Number(viewContentFeedback?.overallScore || 0))} / 100
              </div>
              {!!viewContentFeedbackMeta && viewContentFeedbackMeta.contentHash !== hashText(
                feedbackMode === 'compare'
                  ? getVersionContent(compareTargetVersionId)
                  : viewContentDraftText
              ) && (
                <div className="text-warning bg-warning/10 border border-[var(--warning)]/20 rounded p-2">
                  Feedback is outdated for the current text. Regenerate feedback to refresh recommendations.
                </div>
              )}
              <div className="text-muted-foreground">
                {String(viewContentFeedback?.summary || "Feedback generated successfully.")}
              </div>
              {Array.isArray(viewContentFeedback?.strengths) && viewContentFeedback.strengths.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold">Strengths</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {viewContentFeedback.strengths.slice(0, 4).map((s: string, idx: number) => (
                      <li key={`strength-${idx}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(viewContentFeedback?.prioritizedActions) && viewContentFeedback.prioritizedActions.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Lightbulb className="h-3.5 w-3.5 text-warning" />
                    Priority Actions
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {viewContentFeedback.prioritizedActions.slice(0, 5).map((imp: any) => (
                      <li key={imp.id || imp.title}>
                        <span className="font-medium">{String(imp.title || "Improve content")}</span>
                        {imp.description ? `: ${String(imp.description)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(viewContentFeedback?.weakestDimensions) && viewContentFeedback.weakestDimensions.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold">Weakest Dimensions</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {viewContentFeedback.weakestDimensions.slice(0, 2).map((entry: any, idx: number) => (
                        <div key={`rubric-${idx}`} className="rounded border p-2 bg-background/70">
                          <div className="font-medium">{String(entry?.name || "Dimension")} ({Number(entry?.score || 0)})</div>
                          <div className="text-muted-foreground">{String(entry?.whyItMatters || "")}</div>
                          {Array.isArray(entry?.nextSteps) && entry.nextSteps.length > 0 && (
                            <ul className="list-disc pl-4 mt-1">
                              {entry.nextSteps.slice(0, 2).map((step: string, stepIdx: number) => (
                                <li key={`next-${idx}-${stepIdx}`}>{step}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {(selectedDocVersion === 'current' || selectedDocVersion.startsWith('current-')) && viewContentMode !== 'compare' && (
              <Button onClick={() => saveViewContentMutation.mutate()}
                disabled={!viewContentDirty || saveViewContentMutation.isPending || !viewContentDraftText.trim()}
              >
                {saveViewContentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            )}
            {selectedDocVersion !== 'current' && !selectedDocVersion.startsWith('current-') && viewContentMode !== 'compare' && (
              <Button variant="outline" onClick={() => {
                  const versionText = getVersionContent(selectedDocVersion);
                  setSelectedDocVersion('current');
                  setViewContentDraftText(versionText);
                  setViewContentDirty(true);
                  toast({
                    title: "Version prepared for restore",
                    description: "Save to create a new current version from this historic snapshot.",
                  });
                }}
              >
                Restore As New Current
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewContentDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageVersionsOpen} onOpenChange={setManageVersionsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Versions</DialogTitle>
            <DialogDescription>
              Set which version learners see for each language.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {versionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allVersionsData?.variants && allVersionsData.variants.length > 0 ? (
              <div className="space-y-6">
                {allVersionsData.variants.map((variant) => (
                  <div key={variant.lessonId} className="border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant={variant.isDefaultLanguage ? 'default' : 'outline'} className="uppercase text-xs">
                        {variant.languageCode}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">{variant.currentTitle}</span>
                      {variant.isDefaultLanguage && (
                        <Badge variant="secondary" className="text-xs">Source</Badge>
                      )}
                    </div>
                    {(variant.hasPptx || variant.hasVideo || variant.hasWordDoc) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {variant.hasPptx && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                              try {
                                const response = await fetch(`/api/lessons/${variant.lessonId}/download?organizationId=${allVersionsData?.organizationId}`, { credentials: 'include' });
                                if (!response.ok) throw new Error('Download failed');
                                const data = await response.json();
                                if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                  const filename = data.filename || generatePptxFilename(variant.currentTitle);
                                  await safeDownload(data.downloadUrl, filename, (error) => {
                                    toast({ variant: "destructive", title: "Download failed", description: error });
                                  });
                                } else {
                                  toast({ variant: "destructive", title: "Download failed", description: "Invalid download URL received" });
                                }
                              } catch (e) {
                                toast({ variant: "destructive", title: "Download failed", description: "Could not download PPTX" });
                              }
                            }}
                          >
                            <Download className="h-3 w-3" />
                            PPTX
                          </Button>
                        )}
                        {variant.hasVideo && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                              try {
                                const response = await fetch(`/api/lessons/${variant.lessonId}/download-video?organizationId=${allVersionsData?.organizationId}`, { credentials: 'include' });
                                if (!response.ok) throw new Error('Download failed');
                                const data = await response.json();
                                if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                  const filename = data.filename || `${sanitizeFilename(variant.currentTitle)}.mp4`;
                                  await safeDownload(data.downloadUrl, filename, (error) => {
                                    toast({ variant: "destructive", title: "Download failed", description: error });
                                  });
                                } else {
                                  toast({ variant: "destructive", title: "Download failed", description: "Invalid download URL received" });
                                }
                              } catch (e) {
                                toast({ variant: "destructive", title: "Download failed", description: "Could not download video" });
                              }
                            }}
                          >
                            <Download className="h-3 w-3" />
                            Video
                          </Button>
                        )}
                        {variant.hasWordDoc && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                              try {
                                const response = await fetch(`/api/lessons/${variant.lessonId}/download-source-document?organizationId=${allVersionsData?.organizationId}`, { credentials: 'include' });
                                if (!response.ok) throw new Error('Download failed');
                                const data = await response.json();
                                if (data?.downloadUrl && isValidDownloadUrl(data.downloadUrl)) {
                                  const filename = data.filename || `${sanitizeFilename(variant.currentTitle)}.docx`;
                                  await safeDownload(data.downloadUrl, filename, (error) => {
                                    toast({ variant: "destructive", title: "Download failed", description: error });
                                  });
                                } else {
                                  toast({ variant: "destructive", title: "Download failed", description: "Invalid download URL received" });
                                }
                              } catch (e) {
                                toast({ variant: "destructive", title: "Download failed", description: "Could not download document" });
                              }
                            }}
                          >
                            <FileText className="h-3 w-3" />
                            Word Doc
                          </Button>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      {variant.versions.map((version, idx) => {
                        const isActive = version.isCurrentState
                          ? !variant.activeLessonVersionId
                          : variant.activeLessonVersionId === version.id;
                        return (
                          <div
                            key={version.id || `current-${idx}`}
                            className={`flex items-center justify-between p-3 rounded-md border ${
                              isActive ? 'border-primary bg-primary/5' : 'border-border'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {version.isCurrentState ? 'Current State' : `Version ${version.versionNumber}`}
                                </span>
                                {isActive && (
                                  <Badge variant="default" className="text-xs">Active</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {version.changeDescription || version.title}
                              </p>
                              {version.createdAt && (
                                <p className="text-xs text-muted-foreground">
                                  {new Date(version.createdAt).toLocaleDateString()} {new Date(version.createdAt).toLocaleTimeString()}
                                </p>
                              )}
                            </div>
                            {!isActive && (
                              <Button variant="outline" size="sm" onClick={() => setActiveVersionMutation.mutate({
                                  targetLessonId: variant.lessonId,
                                  versionId: version.isCurrentState ? null : version.id,
                                })}
                                disabled={setActiveVersionMutation.isPending}
                              >
                                {setActiveVersionMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Set Active'
                                )}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No version history available.</p>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
