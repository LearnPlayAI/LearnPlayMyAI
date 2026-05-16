import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Sparkles, Upload, ArrowLeft, ArrowRight, Check, ChevronsUpDown, Search, RefreshCw, History } from "lucide-react";
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
import { apiRequest, queryClient, invalidateWalletCaches } from "@/lib/queryClient";
import { useWalletBalance, useHybridBalance } from "@/hooks/useWallet";
import { useUser } from "@/hooks/use-user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import { InsufficientCreditsModal } from "@/components/InsufficientCreditsModal";
import { useLessonCreditCosts } from "@/hooks/useLessonCreditCosts";
import { ThemeGalleryPanel } from "@/components/ThemeGalleryPanel";
import { ThemePreviewPanel } from "@/components/ThemePreviewPanel";
import { ImageStyleSelector } from "@/components/ImageStyleSelector";
import { PresentationConfigurationSection } from "@/components/PresentationConfigurationSection";
import { 
  parseGammaSlides, 
  validateGammaContent,
  type ParsedSlide,
} from "@shared/contentParsers";
import { CourseBackLink } from "@/components/CourseBackLink";

/**
 * Converts freeform prose text into Gamma slide format.
 * Used for text-input mode where users enter narrative descriptions
 * that need to be structured into slides before AI generation.
 * 
 * Gamma validation requires:
 * - At least 2 slides separated by '---'
 * - Each slide must have a title line
 * - Each slide must have 2-5 key points (separate lines)
 */
function formatProseToSlides(prose: string, lessonTitle: string): string {
  if (!prose?.trim()) return '';
  
  // Split into sentences/clauses more liberally
  // Accept any text segment separated by sentence-ending punctuation or newlines
  let segments = prose
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // If we have fewer than 4 segments, try splitting on commas/semicolons too
  if (segments.length < 4) {
    segments = prose
      .split(/(?<=[.!?;,])\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  
  // Still not enough? Split by phrases (every ~50 chars or at natural breaks)
  if (segments.length < 4 && prose.length >= 100) {
    const words = prose.split(/\s+/);
    segments = [];
    let current = '';
    for (const word of words) {
      current += (current ? ' ' : '') + word;
      if (current.length >= 40 || /[.!?,;]$/.test(word)) {
        segments.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) segments.push(current.trim());
  }
  
  // Filter out segments that are too short to be meaningful
  segments = segments.filter(s => s.length >= 5);
  
  // Need at least 4 segments to create 2 slides with 2 points each
  if (segments.length < 4) {
    return prose; // Let validation catch and show helpful error
  }
  
  const maxPointsPerSlide = 5;
  const slides: { title: string; points: string[] }[] = [];
  
  // Create as many slides as needed to fit all content (up to 10)
  let idx = 0;
  let slideNum = 0;
  
  while (idx < segments.length && slides.length < 10) {
    // Calculate how many points for this slide
    const remaining = segments.length - idx;
    const slidesLeft = 10 - slides.length;
    const pointsThisSlide = Math.min(maxPointsPerSlide, Math.max(2, Math.ceil(remaining / slidesLeft)));
    
    const slidePoints = segments.slice(idx, idx + pointsThisSlide);
    
    // Only create slide if we have at least 2 points
    if (slidePoints.length >= 2) {
      const title = slideNum === 0 
        ? (lessonTitle || 'Course Overview')
        : `Key Concepts ${slideNum + 1}`;
      
      slides.push({ title, points: slidePoints });
      slideNum++;
    }
    
    idx += pointsThisSlide;
  }
  
  // Ensure we have at least 2 slides
  if (slides.length < 2) {
    // Force 2-slide split
    const mid = Math.ceil(segments.length / 2);
    const first = segments.slice(0, mid);
    const second = segments.slice(mid);
    
    if (first.length >= 2 && second.length >= 2) {
      return [
        `${lessonTitle || 'Course Overview'}\n\n${first.slice(0, 5).join('\n')}`,
        `Key Learning Points\n\n${second.slice(0, 5).join('\n')}`
      ].join('\n\n---\n\n');
    }
    return prose;
  }
  
  return slides
    .map(slide => `${slide.title}\n\n${slide.points.join('\n')}`)
    .join('\n\n---\n\n');
}

const topicSchema = z.object({
  position: z.number().min(1).max(10),
  title: z.string(),
  role: z.enum(["overview", "slide"]),
});

const lessonSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  gradeLevel: z.string().optional(),
  department: z.string().optional(),
  subject: z.string().optional(),
  unit: z.string().optional(),
  generationMode: z.enum(["gemini-topics", "text-input", "document-upload", "manual-upload"]),
  topics: z.array(topicSchema).max(10),
  inputText: z.string().optional(),
  themeId: z.string().optional(),
  generateImages: z.boolean(),
  imageStyle: z.string().optional(),
  additionalInstructions: z.string().max(5000).optional(),
  relatedQuizId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.generationMode === "gemini-topics") {
    const filledTopics = data.topics.filter(t => t.title.trim().length > 0);
    if (filledTopics.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topics"],
        message: "At least 2 topics are required for AI-generated lessons"
      });
    }
    const hasOverview = data.topics.some(t => t.role === "overview" && t.title.trim().length > 0);
    if (!hasOverview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topics"],
        message: "An overview topic (position 1) is required"
      });
    }
  }
});

type LessonFormData = z.infer<typeof lessonSchema>;
type TopicData = z.infer<typeof topicSchema>;

const createDefaultTopics = (): TopicData[] => {
  return Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    title: "",
    role: i === 0 ? "overview" : "slide" as const,
  }));
};

// LocalStorage keys for user preferences
const THEME_PREFERENCE_KEY = "lessonWizard_themeId";
const IMAGE_STYLE_PREFERENCE_KEY = "lessonWizard_imageStyle";
const DEFAULT_GAMMA_ADDITIONAL_INSTRUCTIONS =
  "The text on each card should use the maximum available card space and not be cramped. Card text should not look cramped or be too small to read.\nWhen generating images, do NOT generate images containing text.";

export default function LessonWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const { isOrgAdmin, isTeacher, isSuperAdmin, isLoading: authLoading, impersonatedOrganization } = useAuth();
  const { costs } = useLessonCreditCosts();
  const effectiveOrgId = impersonatedOrganization?.id || user?.organizationId;
  const [step, setStep] = useState(1);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  
  const [generationMode, setGenerationMode] = useState<"gemini-topics" | "text-input" | "document-upload" | "manual-upload">(
    "text-input"
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [slideCount, setSlideCount] = useState<number | undefined>(undefined);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  
  // Quiz regeneration prompt modal state
  const [showQuizRegeneratePrompt, setShowQuizRegeneratePrompt] = useState(false);
  const [quizRegenerateLessonId, setQuizRegenerateLessonId] = useState<string | null>(null);
  const [isRegeneratingQuiz, setIsRegeneratingQuiz] = useState(false);
  // Pending redirect info to execute after modal closes
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  
  // Step 2 content hydration tracking
  // Tracks if user has manually edited Step 2 content (prevents auto-hydration from overwriting)
  const [hasUserEditedContent, setHasUserEditedContent] = useState(false);
  // Tracks the description version that was hydrated to prevent duplicate hydrations
  const [lastHydratedDescription, setLastHydratedDescription] = useState<string>("");

  // Parse query parameters for course integration
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const courseId = urlParams.get('courseId');
  const topicId = urlParams.get('topicId');
  const topicName = urlParams.get('topicName');
  const topicDescription = urlParams.get('topicDescription');
  const topicOrder = urlParams.get('topicOrder');
  const isOverviewParam = urlParams.get('isOverview');
  const isOverviewTopic = isOverviewParam === 'true';
  const prefillTitle = urlParams.get('prefillTitle');
  const returnToCourse = urlParams.get('returnToCourse');
  const isRegenerate = urlParams.get('regenerate') === 'true';
  const previousLessonId = urlParams.get('previousLessonId');
  const uploadMode = urlParams.get('uploadMode') === 'true';
  const existingLessonId = urlParams.get('lessonId'); // For regenerate/retry - load existing lesson settings

  // Redirect non-admin users
  const isAdmin = isSuperAdmin || isOrgAdmin || isTeacher;
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access lessons",
        variant: "destructive"
      });
      setLocation("/quiz-lobby");
    }
  }, [isAdmin, authLoading, setLocation, toast]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <QuizAdminLayout title="Create New Lesson" description="Generate a professional presentation with AI" activeSection="lessons">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-foreground" />
        </div>
      </QuizAdminLayout>
    );
  }

  // Don't render if not admin
  if (!isAdmin) {
    return null;
  }

  // Load saved preferences from localStorage
  const savedThemeId = typeof window !== 'undefined' ? localStorage.getItem(THEME_PREFERENCE_KEY) || "" : "";
  const savedImageStyle = typeof window !== 'undefined' ? localStorage.getItem(IMAGE_STYLE_PREFERENCE_KEY) || "photorealistic" : "photorealistic";

  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [selectedWizardVersion, setSelectedWizardVersion] = useState<string>('current');

  useEffect(() => {
    setSelectedWizardVersion('current');
  }, [existingLessonId]);

  // Gap 1 Fix: Don't seed inputText/description from URL topicDescription
  // Let hydration effect handle content population from topic sourceContent
  // This prevents short description from blocking longer sourceContent hydration
  const form = useForm<LessonFormData>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      title: prefillTitle || "",
      description: "", // Will be hydrated from topic content
      gradeLevel: "",
      department: "",
      subject: "",
      unit: "",
      generationMode: "text-input",
      topics: createDefaultTopics(),
      inputText: "", // Will be hydrated from topic sourceContent
      themeId: savedThemeId,
      generateImages: true,
      imageStyle: savedImageStyle,
      additionalInstructions: DEFAULT_GAMMA_ADDITIONAL_INSTRUCTIONS,
      relatedQuizId: "",
    },
  });

  // Save preferences to localStorage when they change
  const watchThemeId = form.watch("themeId");
  const watchImageStyle = form.watch("imageStyle");
  
  useEffect(() => {
    if (watchThemeId !== undefined) {
      localStorage.setItem(THEME_PREFERENCE_KEY, watchThemeId);
    }
  }, [watchThemeId]);
  
  useEffect(() => {
    if (watchImageStyle) {
      localStorage.setItem(IMAGE_STYLE_PREFERENCE_KEY, watchImageStyle);
    }
  }, [watchImageStyle]);

  // Step 2 content hydration from Step 1 description
  // Auto-populate inputText from description when entering Step 2, unless user has already edited content
  // IMPORTANT: This effect is DISABLED when course topic hydration is active (courseId + currentTopic)
  // because topic content should be the source of truth for course-linked lessons
  const watchDescription = form.watch("description");
  const watchInputText = form.watch("inputText");
  
  useEffect(() => {
    // Skip this effect when course topic hydration is active
    // Course-linked lessons should get inputText from topic sourceContent, not Step 1 description
    // Note: We check courseId only here; topicContent check happens in the topic hydration effect
    if (courseId) {
      return; // Let topic hydration handle inputText for course-linked lessons
    }
    
    // Only hydrate when:
    // 1. We're on Step 2
    // 2. Using text-input or gemini-topics mode (not document/manual upload which use file content)
    // 3. User hasn't manually edited the Step 2 content
    // 4. There's a description to hydrate from
    // 5. Description has changed since last hydration (allows re-hydration when Step 1 is edited)
    if (
      step === 2 &&
      (generationMode === "text-input" || generationMode === "gemini-topics") &&
      !hasUserEditedContent &&
      watchDescription &&
      watchDescription.trim() &&
      watchDescription !== lastHydratedDescription
    ) {
      form.setValue("inputText", watchDescription);
      setLastHydratedDescription(watchDescription);
    }
  }, [step, generationMode, hasUserEditedContent, watchDescription, lastHydratedDescription, form, courseId]);

  // Reset hydration state when generation mode changes (user switching tabs)
  useEffect(() => {
    // When switching modes, reset the edited flag so new mode can be hydrated
    // But preserve if switching between text-input and gemini-topics as they share the same inputText
    if (generationMode === "document-upload" || generationMode === "manual-upload") {
      // File-based modes don't use hydration, reset state
      setHasUserEditedContent(false);
      setLastHydratedDescription("");
    }
  }, [generationMode]);


  // Fetch lessons to detect when generation completes (for credit invalidation)
  const { data: lessonsData } = useQuery({
    queryKey: ["/api/lessons", effectiveOrgId],
    queryFn: () => {
      const params = new URLSearchParams({
        organizationId: effectiveOrgId || "",
      });
      return fetch(`/api/lessons?${params}`).then((r) => r.json());
    },
    enabled: !!effectiveOrgId,
    refetchInterval: (query) => {
      // Auto-poll every 5 seconds if there are lessons being generated
      const lessons = query.state.data?.lessons || [];
      const hasActiveLessons = lessons.some(
        (lesson: any) =>
          lesson.generationStatus === "pending" ||
          lesson.generationStatus === "processing" ||
          lesson.generationStatus === "polling"
      );
      return hasActiveLessons ? 5000 : false;
    },
  });

  // Fetch existing lesson for regenerate/retry scenarios
  interface ExistingLessonData {
    id: string;
    title: string;
    description?: string;
    inputText?: string;
    themeId?: string;
    department?: string;
    unit?: string;
    generationParamsKey?: string;
    generationStatus?: string;
    sourceDocumentPath?: string; // Object Storage path for uploaded source document
    gammaImageOptions?: {
      generateImages?: boolean;
      imageStyle?: string;
    };
    learningAssetContract?: Record<string, any>; // PowerPoint content - if present, lesson has been generated
  }
  
  const { data: existingLesson, isLoading: isLoadingExistingLesson } = useQuery<ExistingLessonData>({
    queryKey: ["/api/lessons", existingLessonId, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${existingLessonId}?organizationId=${effectiveOrgId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load lesson');
      }
      return response.json();
    },
    enabled: !!existingLessonId && !!effectiveOrgId,
  });

  const { data: contentVersionsData } = useQuery<any[]>({
    queryKey: ['/api/lessons', existingLessonId, 'content-versions'],
    queryFn: () => fetch(`/api/lessons/${existingLessonId}/versions?organizationId=${effectiveOrgId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!existingLessonId && !!effectiveOrgId && step === 2,
  });

  const getVersionSourceLabel = (source: string) => {
    switch (source) {
      case 'generate_overview': return 'Generated Overview';
      case 'generate_takeaways': return 'Generated Takeaways';
      case 'word_upload': return 'Word Doc Upload';
      case 'ai_improve': return 'AI Improved';
      case 'ai_fix': return 'AI Fix';
      case 'ai_topic_generation': return 'AI Topic Generation';
      default: return source;
    }
  };

  const getWizardVersionText = (versionId: string): string => {
    if (versionId === "current") {
      return String(existingLesson?.inputText || "");
    }
    const version = Array.isArray(contentVersionsData)
      ? contentVersionsData.find((v: any) => String(v.id) === String(versionId))
      : null;
    return String(version?.newContent || "");
  };

  // Fetch source document content when lesson has an uploaded source document
  // This is used to pre-populate the text input for PowerPoint generation
  interface SourceDocumentData {
    success: boolean;
    hasSourceDocument: boolean;
    extractedText?: string;
    extractedWordCount?: number;
    sourceDocumentPath?: string;
  }
  
  const { data: sourceDocumentData } = useQuery<SourceDocumentData>({
    queryKey: ["/api/lessons", existingLessonId, "source-document"],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${existingLessonId}/source-document?organizationId=${effectiveOrgId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        // Return empty data if no source document (404 is expected for lessons without uploaded docs)
        return { success: false, hasSourceDocument: false };
      }
      return response.json();
    },
    enabled: !!existingLessonId && !!effectiveOrgId && !!existingLesson?.sourceDocumentPath,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to avoid re-fetching
  });

  // Track if we've populated form from existing lesson (to prevent re-hydration)
  const [hasPopulatedFromLesson, setHasPopulatedFromLesson] = useState(false);
  
  // Track if we've populated from source document
  const [hasPopulatedFromSourceDoc, setHasPopulatedFromSourceDoc] = useState(false);

  // Track if hydration has been applied (to prevent existing lesson population from overriding)
  const [hydrationApplied, setHydrationApplied] = useState(false);
  
  // Pre-populate form with source document content when available (for lessons with uploaded Word docs)
  // This takes priority over topic sourceContent hydration
  useEffect(() => {
    if (sourceDocumentData?.hasSourceDocument && sourceDocumentData?.extractedText && !hasPopulatedFromSourceDoc && !hasUserEditedContent) {
      const currentInputText = form.getValues("inputText") || "";
      const sourceText = sourceDocumentData.extractedText;
      
      // Only populate if current inputText is empty or shorter than source content
      if (!currentInputText || currentInputText.length < sourceText.length * 0.5) {
        console.log(`[LessonWizard] Pre-populating inputText from source document (${sourceDocumentData.extractedWordCount} words)`);
        form.setValue("inputText", sourceText);
        setHasPopulatedFromSourceDoc(true);
      }
    }
  }, [sourceDocumentData, hasPopulatedFromSourceDoc, hasUserEditedContent, form]);
  
  // Pre-populate form with existing lesson settings when loaded (for regenerate/retry)
  // Priority: User-uploaded Word content (inputText) > AI topic-matched content > paragraph-distributed content
  // If existingLesson has inputText (from Upload Content Word), use it regardless of generation status
  useEffect(() => {
    if (existingLesson && !hasPopulatedFromLesson) {
      const hasGeneratedContent = existingLesson.learningAssetContract && 
                                   Object.keys(existingLesson.learningAssetContract).length > 0;
      
      // Set title always
      if (existingLesson.title) {
        form.setValue("title", existingLesson.title);
      }
      
      // Populate existing inputText for editing/review. Lock it from re-hydration only when
      // it is explicitly user-authored (uploaded source doc or user-edited marker).
      if (existingLesson.inputText) {
        const hasUserUploadedDocument = !!existingLesson.sourceDocumentPath;
        const hasExplicitUserEditedInput = Boolean((existingLesson as any)?.metadata?.userEditedInputText);
        const shouldLockExistingInputText = hasUserUploadedDocument || hasExplicitUserEditedInput;
        form.setValue("inputText", existingLesson.inputText);
        if (shouldLockExistingInputText) {
          setHasUserEditedContent(true); // Prevent hydration from overwriting user-authored content
        }
        // Also set description if the lesson has one
        if (existingLesson.description) {
          form.setValue("description", existingLesson.description);
        }
      } else if (hasGeneratedContent) {
        // For regenerate without user content, use existing description
        if (existingLesson.description) {
          form.setValue("description", existingLesson.description);
        }
      }
      // For new lessons without inputText: don't populate - let hydration handle topic sourceContent
      // Set theme if available
      if (existingLesson.themeId) {
        form.setValue("themeId", existingLesson.themeId);
      }
      // Set department and unit if available
      if (existingLesson.department) {
        form.setValue("department", existingLesson.department);
      }
      if (existingLesson.unit) {
        form.setValue("unit", existingLesson.unit);
      }
      // Set image generation options from gammaImageOptions
      if (existingLesson.gammaImageOptions) {
        if (existingLesson.gammaImageOptions.generateImages !== undefined) {
          form.setValue("generateImages", existingLesson.gammaImageOptions.generateImages);
        }
        if (existingLesson.gammaImageOptions.imageStyle) {
          form.setValue("imageStyle", existingLesson.gammaImageOptions.imageStyle);
        }
      }
      const existingAdditionalInstructions = (existingLesson as any)?.metadata?.gammaAdditionalInstructions;
      if (typeof existingAdditionalInstructions === "string" && existingAdditionalInstructions.trim()) {
        form.setValue("additionalInstructions", existingAdditionalInstructions.trim());
      } else {
        form.setValue("additionalInstructions", DEFAULT_GAMMA_ADDITIONAL_INSTRUCTIONS);
      }
      
      setHasPopulatedFromLesson(true);
      
      // Show toast to indicate we're regenerating
      if (isRegenerate) {
        toast({
          title: "Regenerating lesson",
          description: "Review and modify settings before regenerating",
        });
      }
    }
  }, [existingLesson, hasPopulatedFromLesson, form, isRegenerate, toast]);

  // Keep Step 2 text synchronized with selected version in the dropdown.
  // This prevents stale text if version IDs are not strict-equal by type.
  useEffect(() => {
    if (step !== 2) return;
    if (!Array.isArray(contentVersionsData) || contentVersionsData.length === 0) return;

    const selectedText = getWizardVersionText(selectedWizardVersion);
    const currentText = String(form.getValues("inputText") || "");
    if (selectedText === currentText) return;

    form.setValue("inputText", selectedText, { shouldDirty: false });
    setHasUserEditedContent(true);
  }, [step, selectedWizardVersion, contentVersionsData, existingLesson?.inputText, form]);

  // Compute if there are active lessons for wallet polling
  const hasActiveLessons = (lessonsData?.lessons || []).some(
    (lesson: any) =>
      lesson.generationStatus === "pending" ||
      lesson.generationStatus === "processing" ||
      lesson.generationStatus === "polling"
  );

  // Fetch user's wallet balance using shared hook
  const { data: creditBalance } = useWalletBalance({
    pollingInterval: hasActiveLessons ? 5000 : false,
  });

  // Credit cost based on generateImages setting - uses dynamic costs from hook
  // Use maximum credits for balance checking to ensure users have enough for worst case
  const watchGenerateImages = form.watch("generateImages");
  const requiredCreditsMax = watchGenerateImages 
    ? costs.creditsPerLessonWithImagesMax 
    : costs.creditsPerLessonTextOnlyMax;

  // Fetch hybrid balance (user + org wallet) for affordability checks
  const hybridBalance = useHybridBalance({
    amount: requiredCreditsMax,
    enabled: generationMode !== "manual-upload", // Don't check hybrid balance for free uploads
  });

  // Fetch organization for dynamic labeling
  const { data: organization } = useQuery({
    queryKey: ["/api/organizations", effectiveOrgId],
    enabled: !!effectiveOrgId,
  });

  // Fetch course framework for context-aware generation (needed for overview lessons)
  interface CourseTopicForLesson {
    id: string;
    order: number;
    name: string;
    description?: string;
    isOverview?: boolean;
    lessonId: string | null;
    learningObjectives?: Array<string | { objective?: string; text?: string }>;
    keyTerms?: string[];
  }
  interface CourseFrameworkData {
    id: string;
    courseId: string;
    topics: CourseTopicForLesson[];
  }
  interface CourseData {
    id: string;
    title: string;
    description?: string;
    category?: string;
    categoryId?: string;
    unitId?: string | null;
  }
  
  const { data: courseFramework } = useQuery<CourseFrameworkData>({
    queryKey: ["/api/courses", courseId, "framework"],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load course framework');
      }
      return response.json();
    },
    enabled: !!courseId && isOverviewTopic,
  });

  const { data: courseData } = useQuery<CourseData>({
    queryKey: ["/api/courses", courseId, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load course');
      }
      return response.json();
    },
    enabled: !!courseId,
  });

  // Enriched course context for lesson generation (fetches learning objectives, key terms, etc.)
  interface LearningObjective {
    id: string;
    bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
    objective: string;
    assessmentIdea?: string;
  }
  interface EnrichedTopic {
    id: string;
    order: number;
    name: string;
    description?: string;
    isOverview?: boolean;
    lessonId: string | null;
    learningObjectives?: LearningObjective[];
    keyTerms?: string[];
    prerequisiteTopicIds?: string[];
    detailedSummary?: string;
    estimatedDurationMinutes?: number;
    sourceContent?: string;
    sourceSummary?: string;
  }
  interface TopicLessonMapEntry {
    topicId: string | null;
    topicName: string;
    lessonId: string | null;
    order: number;
    isOverview: boolean;
  }

  interface CourseContextData {
    course: {
      id: string;
      title: string;
      description: string;
      targetAudience: string;
      organizationType: string;
    };
    framework: {
      topics: EnrichedTopic[];
    };
    topicLessonMap: TopicLessonMapEntry[];
    overviewLesson?: {
      id: string;
      title: string;
      synopsis: string;
    };
    existingLessons: Record<string, { id: string; title: string; synopsis: string }>;
  }

  const { data: courseContext } = useQuery<CourseContextData>({
    queryKey: ['/api/courses', courseId, 'framework', 'context'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework/context`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load course context');
      }
      return response.json();
    },
    enabled: !!courseId,
  });

  // Find the current topic from course context - match by topicId first, then by name, then by order (legacy)
  // Priority: topicId → topicName → order (legacy fallback for older links)
  const currentTopic = courseContext?.framework?.topics?.find(t => {
    // Priority 1: Match by topic ID (stable identifier)
    if (topicId && t.id === topicId) return true;
    // Priority 2: Match by topic name (reliable fallback since names are unique per course)
    if (topicName && t.name === decodeURIComponent(topicName)) return true;
    // Priority 3: Legacy fallback - match by order position (for old links without topicId/topicName)
    if (!topicId && !topicName && topicOrder && t.order === parseInt(topicOrder, 10)) return true;
    return false;
  });

  // Get prerequisite topic names for display
  const prerequisiteTopics = currentTopic?.prerequisiteTopicIds?.map(prereqId => {
    const prereqTopic = courseContext?.framework?.topics?.find(t => t.id === prereqId);
    return prereqTopic?.name;
  }).filter(Boolean) || [];

  // Get previous topics for sequential context (topics with lower order that have lessons)
  const previousTopicsWithContent = [...(courseContext?.framework?.topics || [])]
    .filter(t => !t.isOverview && t.order < (currentTopic?.order || 0) && t.lessonId)
    .sort((a, b) => a.order - b.order)
    .map(t => ({
      name: t.name,
      synopsis: courseContext?.existingLessons?.[t.id]?.synopsis || t.description || '',
    }));

  // Hydrate inputText from currentTopic's sourceContent when courseContext loads
  // This ensures the text input shows the full document content instead of just description
  // Key the hydration by topicId/topicName/topicOrder AND step to support re-hydration on step entry
  const [hydratedTopicKey, setHydratedTopicKey] = useState<string | null>(null);
  // Track which step was last hydrated to allow re-hydration when entering Step 2
  const [hydratedAtStep, setHydratedAtStep] = useState<number | null>(null);
  // Track the content length that was hydrated to re-hydrate when content arrives asynchronously
  const [hydratedContentLength, setHydratedContentLength] = useState<number>(0);
  // Derive key from topicId first, then topicName, then topicOrder for legacy support
  const currentTopicKey = topicId || (topicName ? decodeURIComponent(topicName) : null) || topicOrder || null;
  
  // Calculate topic content once for use in both hydration and warning banner
  // Note: Overview topics can also have sourceContent that should be hydrated
  // Priority: Use the LONGEST available content to maximize context for AI generation
  const sourceContentLength = (currentTopic as any)?.sourceContent?.length || 0;
  const detailedSummaryLength = (currentTopic as any)?.detailedSummary?.length || 0;
  const descriptionLength = currentTopic?.description?.length || 0;
  
  // Select the longest content available
  let baseTopicContent = '';
  if (sourceContentLength >= detailedSummaryLength && sourceContentLength >= descriptionLength) {
    baseTopicContent = (currentTopic as any)?.sourceContent || '';
  } else if (detailedSummaryLength >= sourceContentLength && detailedSummaryLength >= descriptionLength) {
    baseTopicContent = (currentTopic as any)?.detailedSummary || '';
  } else {
    baseTopicContent = currentTopic?.description || '';
  }
  
  // Enhance topic content with learning objectives and key terms for better AI generation
  let topicContent = baseTopicContent;
  if (currentTopic && !isOverviewTopic) {
    const enrichedTopic = currentTopic as any;
    const extras: string[] = [];
    
    // Add learning objectives if available
    if (enrichedTopic.learningObjectives && enrichedTopic.learningObjectives.length > 0) {
      const objectives = enrichedTopic.learningObjectives
        .map((obj: any) => `- ${typeof obj === 'string' ? obj : obj.objective || obj.text || obj}`)
        .join('\n');
      extras.push(`\n\nLearning Objectives:\n${objectives}`);
    }
    
    // Add key terms if available
    if (enrichedTopic.keyTerms && enrichedTopic.keyTerms.length > 0) {
      extras.push(`\n\nKey Terms: ${enrichedTopic.keyTerms.join(', ')}`);
    }
    
    // Append extras to base content
    if (extras.length > 0) {
      topicContent = baseTopicContent + extras.join('');
    }
  }
  const topicContentLength = topicContent?.length || 0;
  // For non-overview topics, show content status
  const hasCourseTopicContent = courseId && currentTopic && topicContentLength > 0;
  const isMissingCourseTopicContent = courseId && currentTopic && !isOverviewTopic && topicContentLength === 0;
  
  useEffect(() => {
    // COMPREHENSIVE HYDRATION LOGIC:
    // For NEW lessons from course framework: ALWAYS hydrate from topic content when entering Step 2
    // For EXISTING lessons (regenerate): Only hydrate if topic content is significantly longer (500+ chars more)
    
    // DEBUG: Always log hydration state when on Step 2 with courseId
    if (step === 2 && courseId) {
      console.log(`[LessonWizard Hydration DEBUG] Step: ${step}, courseId: ${courseId?.substring(0, 8)}...`);
      console.log(`[LessonWizard Hydration DEBUG] currentTopic found: ${!!currentTopic}, name: ${currentTopic?.name?.substring(0, 30)}...`);
      console.log(`[LessonWizard Hydration DEBUG] isOverviewTopic: ${isOverviewTopic}`);
      console.log(`[LessonWizard Hydration DEBUG] courseContext loaded: ${!!courseContext}`);
      console.log(`[LessonWizard Hydration DEBUG] topicId param: ${topicId}, topicName param: ${topicName?.substring(0, 30)}...`);
      console.log(`[LessonWizard Hydration DEBUG] Topics in framework: ${courseContext?.framework?.topics?.length || 0}`);
      if (currentTopic) {
        console.log(`[LessonWizard Hydration DEBUG] currentTopic.sourceContent length: ${(currentTopic as any)?.sourceContent?.length || 0}`);
        console.log(`[LessonWizard Hydration DEBUG] currentTopic.detailedSummary length: ${(currentTopic as any)?.detailedSummary?.length || 0}`);
        console.log(`[LessonWizard Hydration DEBUG] currentTopic.description length: ${currentTopic?.description?.length || 0}`);
        // Log which content source is being used (longest available)
        const usedSource = sourceContentLength >= detailedSummaryLength && sourceContentLength >= descriptionLength 
          ? 'sourceContent' 
          : (detailedSummaryLength >= sourceContentLength && detailedSummaryLength >= descriptionLength 
              ? 'detailedSummary' 
              : 'description');
        console.log(`[LessonWizard Hydration DEBUG] Using longest content: ${usedSource} (${topicContentLength} chars)`);
      }
    }
    
    // CRITICAL FIX: When existingLessonId is present, wait for lesson to load before hydrating
    // This ensures user-uploaded Word content (inputText) is checked BEFORE topic content
    // Priority hierarchy: User-uploaded content > AI topic-matched content > paragraph-distributed
    if (existingLessonId && isLoadingExistingLesson) {
      // Early return - don't run topic hydration until existingLesson is loaded
      // This prevents topic content from overwriting user-uploaded Word doc content
      return;
    }
    
    // IMPORTANT: A lesson is "new" if it has no generated content (PowerPoint), not just no lessonId
    // All lessons from course framework have lessonIds, but they're "new" until content is generated
    const hasGeneratedContent = existingLesson?.learningAssetContract && 
                                 Object.keys(existingLesson.learningAssetContract).length > 0;
    const isNewLesson = !hasGeneratedContent;
    
    // Gap 2 Fix: For new lessons (no PowerPoint), allow hydration once courseContext loads
    // Don't wait for existingLesson load state - use hasGeneratedContent instead
    // For regenerate (has PowerPoint), wait for existingLesson to load to get inputText length
    const existingLessonChecked = isNewLesson || (!isLoadingExistingLesson);
    
    // Get the lesson's current inputText (only relevant for regenerate)
    const lessonInputText = existingLesson?.inputText || '';
    const lessonInputTextLength = lessonInputText?.length || 0;
    
    // PRIORITY CHECK: User-uploaded Word content has a sourceDocumentPath marker
    // Use sourceDocumentPath as the reliable indicator of user-uploaded content
    // This prevents blocking topic hydration for lessons with auto-hydrated or regenerate inputText
    const hasUserUploadedDocument = !!existingLesson?.sourceDocumentPath;
    
    // Gap 1 Fix: For NEW lessons, hydrate when topic content is present (must have actual content)
    // For EXISTING lessons: Only hydrate if topic content is significantly longer (500+ chars more)
    // CRITICAL: Never hydrate if lesson has user-uploaded document (sourceDocumentPath exists)
    const topicHasMoreContent = !hasUserUploadedDocument && (topicContentLength > lessonInputTextLength + 500);
    
    // For new lessons WITHOUT user-uploaded document: hydrate when currentTopic has content
    // For existing lessons: use length heuristic (but never override user-uploaded content)
    const shouldUseTopicContent = !hasUserUploadedDocument && (isNewLesson ? (!!currentTopic && topicContentLength > 0 && lessonInputTextLength === 0) : topicHasMoreContent);
    
    // Gap 2 Fix: Include step in hydration guard AND track content length for async content arrival
    // Re-hydrate when: entering Step 2, topic changes, or content length increases (async load)
    const isNewHydrationNeeded = hydratedTopicKey !== currentTopicKey || 
                                  hydratedAtStep !== step || 
                                  (topicContentLength > hydratedContentLength && hydratedContentLength === 0);
    
    // Debug logging for hydration decisions (includes overview topics)
    if (currentTopic && step === 2) {
      console.log(`[LessonWizard Hydration] Topic: ${currentTopic.name?.substring(0, 50)}... (isOverview: ${isOverviewTopic})`);
      console.log(`[LessonWizard Hydration] Topic content: ${topicContentLength} chars`);
      console.log(`[LessonWizard Hydration] Hydrated content length: ${hydratedContentLength} chars`);
      console.log(`[LessonWizard Hydration] Lesson inputText: ${lessonInputTextLength} chars`);
      console.log(`[LessonWizard Hydration] Has user-uploaded document: ${hasUserUploadedDocument}`);
      console.log(`[LessonWizard Hydration] Has generated content (PowerPoint): ${hasGeneratedContent}`);
      console.log(`[LessonWizard Hydration] Is new lesson (no PowerPoint): ${isNewLesson}`);
      console.log(`[LessonWizard Hydration] Should use topic content: ${shouldUseTopicContent}`);
      console.log(`[LessonWizard Hydration] Step: ${step}, Hydrated at step: ${hydratedAtStep}`);
      console.log(`[LessonWizard Hydration] Has user edited: ${hasUserEditedContent}`);
      console.log(`[LessonWizard Hydration] Is new hydration needed: ${isNewHydrationNeeded}`);
    }
    
    // Gap 3 Fix: Check hasUserEditedContent to prevent overwriting user edits
    // But don't block hydration just because we auto-hydrated before
    // Skip overview topics - the overview description effect handles them with comprehensive content
    const shouldHydrate = currentTopic && 
                          courseContext && 
                          currentTopicKey && 
                          isNewHydrationNeeded &&
                          existingLessonChecked &&
                          shouldUseTopicContent &&
                          !hasUserEditedContent &&
                          !hasPopulatedFromLesson &&
                          !hasPopulatedFromSourceDoc &&
                          !isOverviewTopic &&
                          step === 2;
    
    if (shouldHydrate && topicContent) {
      console.log(`[LessonWizard Hydration] Hydrating with ${topicContentLength} chars from topic content`);
      form.setValue("inputText", topicContent);
      form.setValue("description", topicContent);
      form.setValue("generationMode", "text-input"); // Set to text-input when content is hydrated
      setGenerationMode("text-input"); // Also update local state
      setHydratedTopicKey(currentTopicKey);
      setHydratedAtStep(step);
      setHydratedContentLength(topicContentLength);
      setHydrationApplied(true); // Mark that hydration has been applied
      // Gap 3 Fix: Do NOT set hasUserEditedContent here - only user input should set this
    }
  }, [currentTopic, courseContext, currentTopicKey, hydratedTopicKey, hydratedAtStep, hydratedContentLength, isOverviewTopic, existingLessonId, existingLesson, isLoadingExistingLesson, form, step, hasUserEditedContent, topicContent, topicContentLength, courseId, topicId, topicName]);

  // Auto-hydrate department/unit from course when creating a lesson within a course context
  const [hasHydratedFromCourse, setHasHydratedFromCourse] = useState(false);
  useEffect(() => {
    if (courseData && courseId && !hasHydratedFromCourse && !existingLessonId) {
      // Populate department from course's category/categoryId
      const department = courseData.categoryId || courseData.category;
      if (department) {
        form.setValue("department", department);
      }
      // Populate unit from course's unitId
      if (courseData.unitId) {
        form.setValue("unit", courseData.unitId);
      }
      setHasHydratedFromCourse(true);
    }
  }, [courseData, courseId, hasHydratedFromCourse, existingLessonId, form]);

  // For overview lessons: Use the topic's actual content (sourceContent/detailedSummary) as the base,
  // then ENHANCE it with learning objectives from all topics for better Gamma generation
  useEffect(() => {
    if (isOverviewTopic && courseFramework?.topics && courseData && topicContent) {
      const allTopics = [...courseFramework.topics]
        .sort((a, b) => a.order - b.order)
        .filter(t => !t.isOverview && t.order > 0);
      
      // Build learning objectives section from ALL non-overview topics
      const learningObjectivesSection = allTopics
        .filter(t => t.learningObjectives && t.learningObjectives.length > 0)
        .map(t => {
          const objectives = (t.learningObjectives || [])
            .map((obj: any) => `- ${typeof obj === 'string' ? obj : obj.objective || obj.text || obj}`)
            .join('\n');
          return `${t.name}:\n${objectives}`;
        })
        .join('\n\n');
      
      // Build key terms section
      const allKeyTerms = allTopics
        .filter(t => t.keyTerms && t.keyTerms.length > 0)
        .flatMap(t => t.keyTerms as string[]);
      
      // Use the actual topic content as the BASE, then append learning objectives
      // This preserves the user's detailed course description while enhancing for AI
      let enhancedContent = topicContent;
      
      if (learningObjectivesSection) {
        enhancedContent += `\n\nLearning Objectives by Topic:\n${learningObjectivesSection}`;
      }
      
      if (allKeyTerms.length > 0) {
        enhancedContent += `\n\nKey Terms: ${Array.from(new Set(allKeyTerms)).join(', ')}`;
      }
      
      console.log(`[LessonWizard Overview] Base topicContent: ${topicContent.length} chars, enhanced to: ${enhancedContent.length} chars`);
      
      // Update both description and inputText with the enhanced content
      form.setValue('description', topicContent); // Show original in description
      form.setValue('inputText', enhancedContent); // Use enhanced for Gamma
    }
  }, [isOverviewTopic, courseFramework, courseData, form, topicContent]);

  // Fetch Gamma themes from database
  const { data: themesData } = useQuery<{ themes: Array<{ id: string; name: string; description?: string }> }>({
    queryKey: ["/api/gamma/themes"],
    enabled: !!user,
  });

  // Fetch Gamma image styles from database
  const { data: imageStylesData } = useQuery<{ styles: Array<{ id: string; styleKey: string; displayName: string; description?: string }> }>({
    queryKey: ["/api/gamma/image-styles"],
    enabled: !!user,
  });

  // Fetch organization units for cascading dropdowns
  const { data: orgUnitsData } = useQuery<{ units: Array<{ id: string; name: string; unitType: string }> }>({
    queryKey: ["/api/organizations", effectiveOrgId, "units"],
    enabled: !!effectiveOrgId,
  });

  // Watch the selected unit to fetch subjects for that unit
  const selectedGradeLevel = form.watch("gradeLevel");
  const { data: unitSubjectsData } = useQuery<Array<{ id: string; subjectId: string; subjectName: string; subjectDescription: string | null }>>({
    queryKey: ["/api/admin/units", selectedGradeLevel, "subjects"],
    enabled: !!selectedGradeLevel,
  });

  // Fetch available quizzes for linking
  const { data: quizzes } = useQuery<{ collections?: any[] }>({
    queryKey: ["/api/admin/quiz-collections", effectiveOrgId],
    enabled: !!effectiveOrgId && step === 2,
  });

  const { terminology, isResolved } = useOrganizationTerminology();
  const gradeLevelLabel = terminology?.unit || "Grade Level";
  const subjectLabel = terminology?.subject || "Subject";

  // Create lesson mutation
  const createLessonMutation = useMutation({
    mutationFn: async (data: LessonFormData) => {
      let topicsToSend: TopicData[] = [];
      
      if (data.generationMode === "gemini-topics") {
        topicsToSend = data.topics.filter(t => t.title.trim().length > 0);
      } else if (data.generationMode === "text-input" && data.inputText?.trim()) {
        const parsedSlides = parseGammaSlides(data.inputText);
        topicsToSend = parsedSlides.map((slide, index) => ({
          position: index + 1,
          title: slide.title,
          role: index === 0 ? "overview" as const : "slide" as const,
        }));
      }
      
      return await apiRequest("/api/lessons", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          topics: topicsToSend,
          organizationId: effectiveOrgId,
        }),
      });
    },
    onSuccess: async (lesson: any, variables) => {
      toast({
        title: "Lesson created",
        description: "Your lesson has been created successfully.",
      });
      
      // Link lesson to course if courseId is provided
      if (courseId && topicName && topicOrder) {
        try {
          // If this is a regeneration, archive the previous lesson first
          if (isRegenerate && previousLessonId && effectiveOrgId) {
            try {
              await apiRequest(`/api/lessons/${previousLessonId}/archive`, {
                method: "POST",
                body: JSON.stringify({
                  organizationId: effectiveOrgId,
                  deleteFiles: true, // Permanently delete files since lesson is being replaced
                }),
              });
              console.log(`Archived previous lesson: ${previousLessonId}`);
            } catch (archiveError: any) {
              console.error("Failed to archive previous lesson:", archiveError);
              // Continue with linking the new lesson even if archive fails
            }
          }
          
          await apiRequest(`/api/courses/${courseId}/lessons/${lesson.id}`, {
            method: "POST",
            body: JSON.stringify({
              topicName,
              topicOrder: parseInt(topicOrder),
              topicId: topicId || undefined,
              replacePreviousLessonId: isRegenerate ? previousLessonId : undefined,
            }),
          });
          // Invalidate the course framework query so CourseLessons page shows updated lesson status
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
          toast({
            title: isRegenerate ? "Lesson regenerated" : "Lesson linked to course",
            description: isRegenerate 
              ? "The new lesson has replaced the previous one in your course." 
              : "This lesson has been added to your course.",
          });
        } catch (error: any) {
          console.error("Failed to link lesson to course:", error);
          toast({
            variant: "destructive",
            title: "Warning",
            description: "Lesson created but failed to link to course",
          });
        }
      }
      
      // Determine inputText based on generation mode and course context
      let inputTextForGeneration = "";
      
      if (variables.generationMode === "gemini-topics") {
        // For AI Topics mode, use the user-edited inputText from the Content Preview
        // This allows users to review and modify the AI-generated content before generation
        if (variables.inputText?.trim()) {
          inputTextForGeneration = variables.inputText;
        } else {
          // Fallback: construct from topics if no inputText was generated/edited
          const topicTitles = variables.topics
            .filter(t => t.title.trim())
            .map(t => `Slide ${t.position} (${t.role}): ${t.title}`)
            .join("\n");
          inputTextForGeneration = `Create a professional presentation with the following slides:\n${topicTitles}`;
        }
      } else if (variables.generationMode === "text-input") {
        if (variables.inputText?.trim()) {
          inputTextForGeneration = variables.inputText;
        } else if (courseId && topicName && courseContext) {
          if (isOverviewTopic && courseContext.framework?.topics) {
            const allTopics = [...courseContext.framework.topics]
              .sort((a, b) => a.order - b.order)
              .filter(t => !t.isOverview && t.order > 0);
            
            const topicSummaries = allTopics
              .map((t, idx) => `${idx + 1}. ${t.name}${t.description ? `: ${t.description}` : ''}`)
              .join('\n');
            
            inputTextForGeneration = `Create a comprehensive Course Overview presentation for "${courseContext.course.title}".

TARGET AUDIENCE: ${courseContext.course.targetAudience || 'intermediate'} level learners

This is the introductory lesson that should:
1. Welcome learners to the course
2. Explain what they will learn
3. Provide an overview of all topics covered
4. Set expectations for the learning journey

Course Description: ${courseContext.course.description || 'No description provided'}

Topics Covered in This Course:
${topicSummaries}

The presentation should introduce each topic briefly and explain how they connect to form a complete learning journey.`;
          } else if (currentTopic) {
            const topicContent = currentTopic.sourceContent || currentTopic.detailedSummary || topicDescription || '';
            
            const learningObjectivesText = currentTopic.learningObjectives?.length 
              ? `\n\nLearning Objectives:\n${currentTopic.learningObjectives.map(obj => `- [${obj.bloomLevel.toUpperCase()}] ${obj.objective}`).join('\n')}`
              : '';
            
            const keyTermsText = currentTopic.keyTerms?.length
              ? `\n\nKey Terms to Introduce: ${currentTopic.keyTerms.join(', ')}`
              : '';
            
            const overviewSynopsis = courseContext.overviewLesson?.synopsis
              ? `\n\nCourse Overview Summary: ${courseContext.overviewLesson.synopsis}`
              : '';
            
            const previousTopicsText = previousTopicsWithContent.length > 0
              ? `\n\nPrevious Topics Covered:\n${previousTopicsWithContent.map(t => `- ${t.name}: ${t.synopsis.substring(0, 150)}${t.synopsis.length > 150 ? '...' : ''}`).join('\n')}`
              : '';
            
            const prerequisitesText = prerequisiteTopics.length > 0
              ? `\n\nPrerequisite Knowledge: Students should already understand ${prerequisiteTopics.join(', ')}`
              : '';
            
            inputTextForGeneration = `Create a focused lesson presentation about: ${topicName}

COURSE CONTEXT: This lesson is part of "${courseContext.course.title}"
TARGET AUDIENCE: ${courseContext.course.targetAudience || 'intermediate'} level learners
${topicContent ? `\nTopic Content:\n${topicContent}` : ''}${learningObjectivesText}${keyTermsText}${overviewSynopsis}${previousTopicsText}${prerequisitesText}

GENERATION INSTRUCTIONS:
- This is a sequential lesson within a course, so focus exclusively on this topic
- Build upon concepts from previous topics where relevant
- Introduce and define key terms clearly
- Structure content to achieve the stated learning objectives
- Provide in-depth coverage, practical examples, and key takeaways`;
          } else {
            inputTextForGeneration = `Create a focused lesson presentation about: ${topicName}

${topicDescription ? `Topic Details: ${topicDescription}` : ''}

This is a specific lesson within a course, so focus exclusively on this topic. Provide in-depth coverage, examples, and key takeaways for this subject matter only.`;
          }
        } else if (courseId && topicName && courseFramework?.topics && courseData) {
          if (isOverviewTopic) {
            const allTopics = [...courseFramework.topics]
              .sort((a, b) => a.order - b.order)
              .filter(t => !t.isOverview && t.order > 0);
            
            const topicSummaries = allTopics
              .map((t, idx) => `${idx + 1}. ${t.name}${t.description ? `: ${t.description}` : ''}`)
              .join('\n');
            
            inputTextForGeneration = `Create a comprehensive Course Overview presentation for "${courseData.title}".

This is the introductory lesson that should:
1. Welcome learners to the course
2. Explain what they will learn
3. Provide an overview of all topics covered

Course Description: ${courseData.description || 'No description provided'}

Topics Covered in This Course:
${topicSummaries}

The presentation should introduce each topic briefly and explain how they connect to form a complete learning journey.`;
          } else {
            inputTextForGeneration = `Create a focused lesson presentation about: ${topicName}

${topicDescription ? `Topic Details: ${topicDescription}` : ''}

This is a specific lesson within a course, so focus exclusively on this topic. Provide in-depth coverage, examples, and key takeaways for this subject matter only.`;
          }
        } else {
          inputTextForGeneration = variables.inputText || "";
        }
      }
      
      // Gap 5 Fix: Validate that course-linked lessons have topic content before generation
      // This prevents AI hallucination by ensuring source material is available
      // EXCEPTION: manual-upload and document-upload modes don't rely on topic content
      const isCourseLinkedLesson = courseId && topicName && !isOverviewTopic;
      const isContentGenerationMode = variables.generationMode === "text-input" || variables.generationMode === "gemini-topics";
      const hasRequiredContent = inputTextForGeneration && inputTextForGeneration.trim().length > 0;
      
      if (isCourseLinkedLesson && isContentGenerationMode && !hasRequiredContent) {
        // Block generation for course-linked lessons without topic content (only for text/AI modes)
        toast({
          variant: "destructive",
          title: "Missing Topic Content",
          description: "This lesson requires topic content from the course framework. Please ensure the topic has content uploaded or enter content manually.",
        });
        return;
      }
      
      // Start generation if we have content to generate from
      if (inputTextForGeneration) {
        startGenerationMutation.mutate({
          lessonId: lesson.id,
          inputText: inputTextForGeneration,
          themeId: variables.themeId || "",
          generateImages: variables.generateImages !== undefined ? variables.generateImages : true,
          imageStyle: variables.imageStyle || "photorealistic",
          additionalInstructions: variables.additionalInstructions || DEFAULT_GAMMA_ADDITIONAL_INSTRUCTIONS,
        });
      } else {
        // If no content provided, show error for non-manual modes
        if (variables.generationMode !== "manual-upload") {
          toast({
            variant: "destructive",
            title: "No Content",
            description: "Please enter or generate content before creating the lesson.",
          });
          return;
        }
        
        // For manual upload, redirect to appropriate location
        queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", effectiveOrgId, "assignable"] });
        queryClient.invalidateQueries({ queryKey: ["/api/lessons/assigned", effectiveOrgId] });
        
        // Redirect to course builder if returnToCourse is set
        if (returnToCourse && courseId) {
          setLocation(`/course-builder/${courseId}/lessons`);
        } else {
          setLocation("/course-builder");
        }
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create lesson",
      });
    },
  });

  // Start generation mutation
  // Uses /regenerate endpoint when isRegenerate flag is passed (avoids closure issues)
  const startGenerationMutation = useMutation({
    mutationFn: async (params: { lessonId: string; inputText: string; themeId: string; generateImages: boolean; imageStyle: string; additionalInstructions?: string; isRegenerate?: boolean }) => {
      // Use regenerate endpoint when explicitly flagged, otherwise use generate
      const endpoint = params.isRegenerate 
        ? `/api/lessons/${params.lessonId}/regenerate`
        : `/api/lessons/${params.lessonId}/generate`;
      
      return await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          organizationId: effectiveOrgId,
          inputText: params.inputText,
          themeId: params.themeId,
          generateImages: params.generateImages,
          imageStyle: params.imageStyle,
          additionalInstructions: params.additionalInstructions || DEFAULT_GAMMA_ADDITIONAL_INSTRUCTIONS,
          numCards: 10,
        }),
      });
    },
    onSuccess: async (_data, variables) => {
      toast({
        title: isRegenerate ? "Regeneration started" : "Generation started",
        description: isRegenerate 
          ? "Your lesson is being regenerated. Check the lessons page for progress."
          : "Your lesson is being generated. This may take a few minutes.",
      });
      invalidateWalletCaches();
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", effectiveOrgId, "assignable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons/assigned", effectiveOrgId] });
      
      // Determine redirect URL
      let redirectUrl = "/lessons";
      if (returnToCourse && courseId) {
        redirectUrl = `/course-builder/${courseId}/lessons`;
      }
      
      // For regeneration, check if lesson has a linked quiz and prompt user
      if (isRegenerate && variables.lessonId) {
        await checkAndPromptQuizRegeneration(variables.lessonId, redirectUrl);
      } else {
        setLocation(redirectUrl);
      }
    },
    onError: async (error: any, params) => {
      const is429Error = error.message?.includes("Generation in progress") || 
                         error.message?.includes("already have a lesson being generated");
      
      // If 429 error and we're in a course context, unlink the lesson that was just created
      if (is429Error && courseId && params.lessonId && !isRegenerate) {
        try {
          // Unlink the lesson from the course (the lesson was created but generation was blocked)
          await apiRequest(`/api/courses/${courseId}/lessons/${params.lessonId}/unlink`, {
            method: "POST",
            body: JSON.stringify({
              reason: "Generation blocked by active job - rollback",
            }),
          });
          // Invalidate course framework to remove the orphaned lesson link
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
        } catch (unlinkError) {
          console.error("Failed to rollback lesson link after 429:", unlinkError);
        }
      }
      
      toast({
        variant: "destructive",
        title: is429Error ? "Generation in progress" : "Generation failed",
        description: is429Error 
          ? "Please wait for your current lesson to finish generating before starting another."
          : (error.message || "Failed to start lesson generation"),
      });
    },
  });

  // Manual upload mutation
  const manualUploadMutation = useMutation({
    mutationFn: async (data: LessonFormData) => {
      if (!selectedFile) {
        throw new Error("No file selected");
      }

      const formData = new FormData();
      formData.append("pptxFile", selectedFile);
      formData.append("title", data.title);
      if (data.description) formData.append("description", data.description);
      formData.append("organizationId", effectiveOrgId || "");
      if (data.gradeLevel) formData.append("gradeLevel", data.gradeLevel);
      if (data.department) formData.append("department", data.department);
      if (data.subject) formData.append("subject", data.subject);
      if (data.unit) formData.append("unit", data.unit);
      if (slideCount) formData.append("slideCount", slideCount.toString());

      // Use XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error("Invalid response from server"));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || "Failed to upload lesson"));
            } catch (e) {
              reject(new Error("Failed to upload lesson"));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload cancelled"));
        });

        xhr.open("POST", "/api/lessons/manual-upload");
        xhr.send(formData);
      });
    },
    onMutate: () => {
      setUploadProgress(0);
    },
    onSuccess: async (lesson: any) => {
      try {
        // If this is a course-linked upload and regeneration, archive the old lesson first
        if (isRegenerate && previousLessonId && effectiveOrgId) {
          try {
            await apiRequest(`/api/lessons/${previousLessonId}/archive`, {
              method: 'POST',
              body: JSON.stringify({ 
                organizationId: effectiveOrgId,
                deleteFiles: true, // Permanently delete files since lesson is being replaced
              }),
            });
            console.log(`Archived previous lesson: ${previousLessonId}`);
          } catch (archiveError) {
            console.error('Failed to archive previous lesson:', archiveError);
          }
        }
        
        // If course-linked, link the new lesson to the course
        if (courseId && topicName && topicOrder) {
          await apiRequest(`/api/courses/${courseId}/lessons/${lesson.id}`, {
            method: 'POST',
            body: JSON.stringify({
              topicName,
              topicOrder: parseInt(topicOrder, 10),
              topicId: topicId || undefined,
              replacePreviousLessonId: isRegenerate ? previousLessonId : undefined,
            }),
          });
          
          // Invalidate course framework queries
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
          
          toast({
            title: isRegenerate ? "Lesson replaced" : "Lesson uploaded",
            description: isRegenerate 
              ? "The lesson has been uploaded and linked to the course."
              : "Your lesson has been uploaded and linked to the course.",
          });
        } else {
          toast({
            title: "Lesson uploaded",
            description: "Your lesson has been uploaded successfully.",
          });
        }
      } catch (linkError) {
        console.error('Failed to link lesson to course:', linkError);
        toast({
          variant: "destructive",
          title: "Linking failed",
          description: "Lesson uploaded but could not be linked to course.",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", effectiveOrgId, "assignable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons/assigned", effectiveOrgId] });
      setUploadProgress(0);
      
      // Redirect to course builder if returnToCourse is set, otherwise lessons page
      if (returnToCourse && courseId) {
        setLocation(`/course-builder/${courseId}/lessons`);
      } else {
        setLocation("/course-builder");
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload lesson",
      });
      setUploadProgress(0);
    },
  });

  // Document upload mutation (Word/PDF for AI generation)
  const documentUploadMutation = useMutation({
    mutationFn: async (data: LessonFormData) => {
      if (!selectedFile) {
        throw new Error("No file selected");
      }

      const formData = new FormData();
      formData.append("documentFile", selectedFile);
      formData.append("title", data.title);
      if (data.description) formData.append("description", data.description);
      formData.append("organizationId", effectiveOrgId || "");
      if (data.gradeLevel) formData.append("gradeLevel", data.gradeLevel);
      if (data.department) formData.append("department", data.department);
      if (data.subject) formData.append("subject", data.subject);
      if (data.unit) formData.append("unit", data.unit);
      if (data.themeId) formData.append("themeId", data.themeId);
      formData.append("generateImages", data.generateImages ? "true" : "false");
      if (data.imageStyle) formData.append("imageStyle", data.imageStyle);
      formData.append("numCards", "10");

      // Use XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error("Invalid response from server"));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || "Failed to upload document"));
            } catch (e) {
              reject(new Error("Failed to upload document"));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload cancelled"));
        });

        xhr.open("POST", "/api/lessons/document-upload");
        xhr.send(formData);
      });
    },
    onMutate: () => {
      setUploadProgress(0);
    },
    onSuccess: (lesson) => {
      toast({
        title: "Document uploaded",
        description: "AI is now generating your presentation from the document content.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", effectiveOrgId, "assignable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons/assigned", effectiveOrgId] });
      setUploadProgress(0);
      if (returnToCourse && courseId) {
        setLocation(`/course-builder/${courseId}/lessons`);
      } else {
        setLocation("/course-builder");
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload document",
      });
      setUploadProgress(0);
    },
  });

  // Unified endpoint mutation for topic-based generation with existing placeholder
  const generateForTopicMutation = useMutation({
    mutationFn: async (params: {
      courseId: string;
      topicId: string;
      existingLessonId: string;
      inputText: string;
      themeId?: string;
      generateImages: boolean;
      imageStyle: string;
    }) => {
      return await apiRequest("/api/lessons/generate-for-topic", {
        method: "POST",
        body: JSON.stringify({
          ...params,
          organizationId: effectiveOrgId,
        }),
      });
    },
    onSuccess: (lesson: any) => {
      toast({
        title: "Lesson generation started",
        description: "Your lesson is being generated. Check the course builder for progress.",
      });
      invalidateWalletCaches();
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
      // GAP 3 FIX: Stay on course builder lessons page to show progress, not lesson viewer
      // The course builder page shows generation status and allows user to see outcome
      setLocation(`/course-builder/${courseId}/lessons`);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: error.message || "Failed to start lesson generation",
      });
    },
  });

  // Check if lesson has linked quiz and show regeneration prompt
  const checkAndPromptQuizRegeneration = async (lessonId: string, redirectUrl: string) => {
    try {
      const response = await fetch(`/api/lessons/${lessonId}?organizationId=${effectiveOrgId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const lessonData = await response.json();
        // Check if lesson has a linked quiz
        if (lessonData.linkedQuizId || lessonData.hasLinkedQuiz) {
          setQuizRegenerateLessonId(lessonId);
          setPendingRedirect(redirectUrl);
          setShowQuizRegeneratePrompt(true);
          return; // Don't redirect yet, wait for modal response
        }
      }
    } catch (error) {
      console.error("Failed to check for linked quiz:", error);
    }
    // No linked quiz or error checking - proceed with redirect
    setLocation(redirectUrl);
  };

  // Handler for quiz regeneration
  const handleRegenerateQuiz = async () => {
    if (!quizRegenerateLessonId) return;
    
    setIsRegeneratingQuiz(true);
    try {
      await apiRequest(`/api/lessons/${quizRegenerateLessonId}/regenerate-quiz`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: effectiveOrgId,
        }),
      });
      toast({
        title: "Quiz regenerated successfully",
        description: "The linked quiz has been updated to match the new lesson content.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Quiz regeneration failed",
        description: error.message || "Failed to regenerate quiz. You can regenerate it later from the lesson view.",
      });
    } finally {
      setIsRegeneratingQuiz(false);
      setShowQuizRegeneratePrompt(false);
      setQuizRegenerateLessonId(null);
      if (pendingRedirect) {
        setLocation(pendingRedirect);
        setPendingRedirect(null);
      }
    }
  };

  // Handler for skipping quiz regeneration
  const handleSkipQuizRegeneration = () => {
    toast({
      title: "Quiz not updated",
      description: "You can regenerate the quiz later from the lesson view.",
    });
    setShowQuizRegeneratePrompt(false);
    setQuizRegenerateLessonId(null);
    if (pendingRedirect) {
      setLocation(pendingRedirect);
      setPendingRedirect(null);
    }
  };

  const onSubmit = (data: LessonFormData) => {
    // Handle manual upload mode separately
    if (data.generationMode === "manual-upload") {
      if (!selectedFile) {
        toast({
          variant: "destructive",
          title: "No file selected",
          description: "Please select a PPTX file to upload.",
        });
        return;
      }
      manualUploadMutation.mutate(data);
      return;
    }

    // Handle document upload mode separately
    if (data.generationMode === "document-upload") {
      if (!selectedFile) {
        toast({
          variant: "destructive",
          title: "No file selected",
          description: "Please select a Word or PDF document to upload.",
        });
        return;
      }
      
      // Check credit balance for AI generation using hybrid balance (user + org wallet)
      if (!hybridBalance.canAfford) {
        setShowInsufficientCreditsModal(true);
        return;
      }
      
      documentUploadMutation.mutate(data);
      return;
    }

    // For gemini-topics mode, validate that content has been generated
    if (data.generationMode === "gemini-topics") {
      const hasFilledTopics = data.topics.filter(t => t.title.trim()).length >= 2;
      if (!hasFilledTopics) {
        toast({
          variant: "destructive",
          title: "Topics Required",
          description: "Please fill in at least 2 topics before creating the lesson.",
        });
        return;
      }
      
      if (!data.inputText?.trim()) {
        toast({
          variant: "destructive",
          title: "Content Required",
          description: "Please click 'Generate Content' to create lesson content from your topics before creating the lesson.",
        });
        return;
      }
    }
    
    // Gap 5 Fix: For course-linked lessons in AI modes, validate substantial content exists
    // This prevents AI hallucinations from short topic descriptions
    const isAIGenerationMode = data.generationMode === "text-input" || data.generationMode === "gemini-topics";
    if (courseId && currentTopic && isAIGenerationMode) {
      const inputLength = data.inputText?.trim().length || 0;
      const minContentLength = 200; // Minimum chars to prevent short-description-based hallucination
      
      // Warn if content is too short (but still allow proceeding)
      if (inputLength < minContentLength && topicContentLength >= minContentLength) {
        // Topic has more content than what's in the form - likely hydration issue
        console.warn(`[LessonWizard] Input text (${inputLength} chars) is shorter than topic content (${topicContentLength} chars) - content may not have hydrated properly`);
        toast({
          variant: "destructive",
          title: "Content may be incomplete",
          description: "Your lesson content appears shorter than the course topic content. Please check that all content loaded correctly before generating.",
        });
        return; // Block submission until content is properly hydrated
      }
    }
    
    // Validate Gamma format for text-input mode (blocking validation)
    if (data.generationMode === "text-input") {
      if (!data.inputText?.trim()) {
        toast({
          variant: "destructive",
          title: "Content Required",
          description: "Please enter your lesson content.",
        });
        return;
      }
      
      // First, try to validate the content as-is
      let validation = validateGammaContent(data.inputText);
      
      // If validation fails, auto-format the prose into slide structure
      if (!validation.valid) {
        const formattedContent = formatProseToSlides(data.inputText, data.title);
        validation = validateGammaContent(formattedContent);
        
        if (validation.valid) {
          // Update the form data with the formatted content
          data.inputText = formattedContent;
          form.setValue('inputText', formattedContent);
          toast({
            title: "Content Formatted",
            description: "Your text has been automatically structured into slides.",
          });
        } else {
          // Still invalid after formatting - show a helpful error
          toast({
            variant: "destructive",
            title: "Content Too Short",
            description: "Please provide more content. Your lesson needs at least 4 sentences to create a meaningful presentation.",
          });
          return;
        }
      }
    }
    
    // Validate Gamma format for gemini-topics mode (non-blocking warning for edge cases)
    if (data.generationMode === "gemini-topics" && data.inputText?.trim()) {
      const validation = validateGammaContent(data.inputText);
      if (!validation.valid && validation.slides.length > 10) {
        toast({
          variant: "default",
          title: "Slide Limit",
          description: `Content has ${validation.slides.length} slides. Only the first 10 will be used.`,
        });
      }
    }

    // Check credit balance ONLY if generation will happen
    // Generation happens when we have content for AI topics or text input modes
    const hasFilledTopics = data.topics.some(t => t.title.trim());
    const willGenerate = Boolean(
      (data.generationMode === "text-input" && data.inputText) ||
      (data.generationMode === "gemini-topics" && hasFilledTopics && data.inputText)
    );
    
    if (willGenerate) {
      // Check if user has sufficient credits for generation using hybrid balance (user + org wallet)
      if (!hybridBalance.canAfford) {
        setShowInsufficientCreditsModal(true);
        return;
      }
    }

    // Use unified endpoint for topic-based generation with existing placeholder
    // This handles everything: updates lesson, courseLessons, framework, and enqueues job
    if (courseId && topicId && existingLessonId) {
      let inputTextForGeneration = "";
      
      if (data.generationMode === "gemini-topics" && data.inputText?.trim()) {
        inputTextForGeneration = data.inputText;
      } else if (data.generationMode === "text-input" && data.inputText?.trim()) {
        inputTextForGeneration = data.inputText;
      }
      
      if (!inputTextForGeneration) {
        toast({
          variant: "destructive",
          title: "No content provided",
          description: "Please provide content for lesson generation",
        });
        return;
      }
      
      generateForTopicMutation.mutate({
        courseId,
        topicId,
        existingLessonId,
        inputText: inputTextForGeneration,
        themeId: data.themeId || undefined,
        generateImages: data.generateImages,
        imageStyle: data.imageStyle || "photorealistic",
      });
      return;
    }

    // For regeneration with existing lesson, skip creation and call regenerate directly
    // NEVER create a new lesson when existingLessonId is set - reuse the existing lesson
    if (existingLessonId) {
      if (!willGenerate) {
        // No content to regenerate - show error and navigate away
        toast({
          variant: "destructive",
          title: "No content to regenerate",
          description: "Please provide content for lesson regeneration",
        });
        return;
      }
      
      // Determine input text for regeneration
      let inputTextForGeneration = "";
      
      if (data.generationMode === "gemini-topics" && data.inputText?.trim()) {
        inputTextForGeneration = data.inputText;
      } else if (data.generationMode === "text-input" && data.inputText?.trim()) {
        inputTextForGeneration = data.inputText;
      }
      
      if (inputTextForGeneration) {
        startGenerationMutation.mutate({
          lessonId: existingLessonId,
          inputText: inputTextForGeneration,
          themeId: data.themeId || "",
          generateImages: data.generateImages,
          imageStyle: data.imageStyle || "photorealistic",
          additionalInstructions: data.additionalInstructions || DEFAULT_GAMMA_ADDITIONAL_INSTRUCTIONS,
          isRegenerate: true,  // Explicitly flag as regeneration to use /regenerate endpoint
        });
        return;
      } else {
        toast({
          variant: "destructive",
          title: "No content to regenerate",
          description: "Please provide content for lesson regeneration",
        });
        return;
      }
    }

    // Proceed with creation (generation will happen in onSuccess based on generation mode)
    createLessonMutation.mutate(data);
  };

  const nextStep = () => {
    if (step === 1) {
      const title = form.getValues("title");
      if (!title) {
        form.setError("title", { message: "Title is required" });
        return;
      }
    }
    setStep(step + 1);
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  // Wait for terminology to resolve before rendering
  if (!isResolved) {
    return (
      <QuizAdminLayout title="Create New Lesson" description="Generate a professional presentation with AI" activeSection="lessons">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  // Wait for existing lesson to load before rendering (for regenerate/retry)
  if (existingLessonId && isLoadingExistingLesson) {
    return (
      <QuizAdminLayout title="Loading Lesson" description="Loading lesson settings..." activeSection="lessons">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading lesson settings...</p>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Create New Lesson" description="Generate a professional presentation with AI" activeSection="lessons">
      <CourseBackLink className="mb-4" />
      <div className="mb-[var(--space-lg)]">
        <div className="flex flex-col gap-[var(--space-md)] sm:flex-row sm:justify-between sm:items-center mb-[var(--space-md)]">
          <Button variant="ghost" onClick={() => setLocation("/course-builder")}
            className="min-h-[48px] sm:min-h-[44px] touch-manipulation self-start"
            data-testid="button-back-to-lessons"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back to Course Builder</span>
            <span className="sm:hidden">Back</span>
          </Button>
          
          {(creditBalance || !hybridBalance.isLoading) && (
            <Card
              className={cn(
                "w-full sm:w-auto",
                hybridBalance.totalAvailable < 0 ? "border-destructive" : ""
              )}
            >
              <CardContent className="p-[var(--card-padding)]">
                <div className="text-[length:var(--text-sm)] text-muted-foreground">Available Credits</div>
                <div
                  className={`text-[length:var(--text-2xl)] font-bold ${hybridBalance.totalAvailable < 0 ? 'text-destructive' : ''}`}
                  data-testid="text-credit-balance"
                >
                  {hybridBalance.totalAvailable < 0 ? '−' : ''}{Math.abs(hybridBalance.totalAvailable)}
                </div>
                <div className="text-[length:var(--text-xs)] text-muted-foreground mt-1">
                  User: {hybridBalance.userBalance} • Org: {hybridBalance.orgBalance}
                </div>
                {hybridBalance.totalAvailable < 0 && (
                  <div className="text-[length:var(--text-xs)] text-destructive/80 mt-1">
                    Negative Balance - Purchase Credits
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Progress indicator */}
        <div className="mb-[var(--space-xl)]">
          <div className="flex justify-between mb-2 gap-1">
            <span className={`text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] ${step >= 1 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              1. Basic Info
            </span>
            <span className={`text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] ${step >= 2 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              2. Content
            </span>
            <span className={`text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] ${step >= 3 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              3. Review
            </span>
          </div>
          <Progress value={(step / 3) * 100} data-testid="progress-wizard-steps" />
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-[var(--space-lg)]">
          {/* Step 1: Basic Information */}
          {step === 1 && (
            <Card>
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)]">Basic Information</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">
                  Provide basic details about your lesson
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lesson Title *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Introduction to Photosynthesis"
                          className="min-h-[44px]"
                          {...field}
                          data-testid="input-lesson-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Description (Optional)</FormLabel>
                        <Button type="button" variant="ghost" size="sm" onClick={async () => {
                            const title = form.getValues('title');
                            const topics = form.getValues('topics');
                            
                            if (!title) {
                              toast({
                                title: "Title Required",
                                description: "Please enter a lesson title first",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            try {
                              setIsGeneratingDescription(true);
                              const data = await apiRequest<{ description?: string }>('/api/ai/generate-lesson-description', {
                                method: 'POST',
                                body: JSON.stringify({
                                  lessonTitle: title,
                                  topics: topics,
                                  organizationId: effectiveOrgId,
                                  courseId: courseId || undefined,
                                  isOverview: isOverviewTopic,
                                }),
                              });
                              if (data?.description) {
                                form.setValue('description', data.description);
                                // Reset hydration state so new description can flow to Step 2
                                setHasUserEditedContent(false);
                                setLastHydratedDescription("");
                                toast({
                                  title: "Description Generated",
                                  description: "AI-generated description has been added",
                                });
                              } else {
                                toast({
                                  title: "Generation Failed",
                                  description: "No description was returned from AI",
                                  variant: "destructive",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                title: "Generation Failed",
                                description: error.message || "Failed to generate description",
                                variant: "destructive",
                              });
                            } finally {
                              setIsGeneratingDescription(false);
                            }
                          }}
                          disabled={isGeneratingDescription}
                          className="text-primary hover:text-primary/80 hover:bg-primary/10"
                          data-testid="button-generate-description"
                        >
                          {isGeneratingDescription ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-1" />
                              Generate with AI
                            </>
                          )}
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of the lesson"
                          className="min-h-[120px]"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            // Reset hydration flags when user manually edits description on Step 1
                            // This allows the new description to flow to Step 2
                            if (step === 1) {
                              setHasUserEditedContent(false);
                              setLastHydratedDescription("");
                            }
                          }}
                          data-testid="input-lesson-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Learning Objectives from Course Context */}
                {currentTopic?.learningObjectives && currentTopic.learningObjectives.length > 0 && (
                  <div className="p-[var(--card-padding)] rounded-lg border bg-primary/5 border-primary/20">
                    <h4 className="font-medium text-[length:var(--text-sm)] mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Learning Objectives
                    </h4>
                    <ul className="space-y-2">
                      {currentTopic.learningObjectives.map((obj) => (
                        <li key={obj.id} className="flex items-start gap-2 text-[length:var(--text-sm)]">
                          <Badge variant="outline" className={cn( "text-[10px] capitalize px-1.5 py-0.5 flex-shrink-0", obj.bloomLevel === 'remember' && "border-primary text-primary bg-primary/10 dark:bg-primary/20", obj.bloomLevel === 'understand' && "border-success text-success bg-success/10 dark:bg-success/20", obj.bloomLevel === 'apply' && "border-[var(--warning)]/50 text-warning bg-warning/10 dark:bg-warning/20", obj.bloomLevel === 'analyze' && "border-[var(--warning)]/50 text-warning bg-warning/10 dark:bg-warning/20", obj.bloomLevel === 'evaluate' && "border-primary text-primary bg-primary/10 dark:bg-primary/20", obj.bloomLevel === 'create' && "border-destructive text-destructive bg-destructive/10 dark:bg-destructive/20", )} >
                            {obj.bloomLevel}
                          </Badge>
                          <span className="text-muted-foreground">{obj.objective}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Prerequisite Topics from Course Context */}
                {prerequisiteTopics.length > 0 && (
                  <div className="p-[var(--card-padding)] rounded-lg border bg-muted/50">
                    <h4 className="font-medium text-[length:var(--text-sm)] mb-2">Prerequisites</h4>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      This lesson builds on: {prerequisiteTopics.join(', ')}
                    </p>
                  </div>
                )}

                {/* Key Terms from Course Context */}
                {currentTopic?.keyTerms && currentTopic.keyTerms.length > 0 && (
                  <div className="p-[var(--card-padding)] rounded-lg border bg-muted/50">
                    <h4 className="font-medium text-[length:var(--text-sm)] mb-2">Key Terms to Introduce</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTopic.keyTerms.map((term, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[length:var(--text-xs)]">
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                  <FormField
                    control={form.control}
                    name="gradeLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{gradeLevelLabel}</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("subject", "");
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="min-h-[44px]" data-testid="select-grade-level">
                              <SelectValue placeholder={`Select ${gradeLevelLabel.toLowerCase()}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {orgUnitsData?.units && orgUnitsData.units.length > 0 ? (
                              orgUnitsData.units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">No units available</div>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{subjectLabel}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!selectedGradeLevel}>
                          <FormControl>
                            <SelectTrigger className="min-h-[44px]" data-testid="select-subject">
                              <SelectValue placeholder={selectedGradeLevel ? `Select ${subjectLabel.toLowerCase()}` : `Select ${gradeLevelLabel.toLowerCase()} first`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {unitSubjectsData && unitSubjectsData.length > 0 ? (
                              unitSubjectsData.map((unitSubject) => (
                                <SelectItem key={unitSubject.subjectId} value={unitSubject.subjectId}>
                                  {unitSubject.subjectName}
                                </SelectItem>
                              ))
                            ) : selectedGradeLevel ? (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">No {subjectLabel.toLowerCase()}s available for this {gradeLevelLabel.toLowerCase()}</div>
                            ) : null}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="relatedQuizId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Link to Quiz (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="min-h-[44px]" data-testid="select-quiz">
                            <SelectValue placeholder="Select a quiz to link" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No quiz</SelectItem>
                          {quizzes?.collections?.map((quiz: any) => (
                            <SelectItem key={quiz.id} value={quiz.id}>
                              {quiz.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 2: Content Generation */}
          {step === 2 && (
            <Card>
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)]">Content Generation</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">
                  Choose how you want to create your lesson content
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                {/* Gap 7: Warning banner at Step 2 level when course topic exists but has no content */}
                {isMissingCourseTopicContent && (
                  <div className="bg-warning/10 dark:bg-warning/30 border border-[var(--warning)]/20 dark:border-[var(--warning)]/50 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-warning dark:text-warning">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-warning dark:text-warning">No Topic Content Found</h4>
                        <p className="text-sm text-warning dark:text-warning mt-1">
                          The course framework topic "{currentTopic?.name}" does not have source content uploaded.
                          Please enter lesson content manually using "Text Input".
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <Tabs value={generationMode} className="w-full">
                  <TabsList className="grid w-full grid-cols-1 gap-1 h-auto p-1">
                    <TabsTrigger value="text-input" className="min-h-[44px] touch-manipulation text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] px-2 sm:px-3" data-testid="tab-text-input">
                      <FileText className="mr-1 sm:mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Text Input</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="gemini-topics" className="space-y-[var(--space-md)] mt-[var(--space-md)]">
                    <div className="flex items-center justify-between mb-[var(--space-sm)]">
                      <div>
                        <h3 className="text-[length:var(--text-base)] font-medium">Slide Topics</h3>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">
                          Define what each slide should cover. First 3 slides are required.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={async () => {
                          const lessonTitle = form.getValues('title');
                          
                          if (!lessonTitle) {
                            toast({
                              title: "Title Required",
                              description: "Please enter a lesson title first",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          try {
                            setIsGeneratingTopics(true);
                            const data = await apiRequest<{ topics: TopicData[] }>('/api/ai/generate-lesson-topics', {
                              method: 'POST',
                              body: JSON.stringify({
                                lessonTitle,
                                organizationId: effectiveOrgId,
                              }),
                            });
                            if (data?.topics && Array.isArray(data.topics)) {
                              data.topics.forEach((topic, index) => {
                                if (index < 10) {
                                  form.setValue(`topics.${index}.title`, topic.title || "");
                                  form.setValue(`topics.${index}.position`, topic.position || index + 1);
                                  form.setValue(`topics.${index}.role`, topic.role || (index === 0 ? "overview" : "slide"));
                                }
                              });
                              toast({
                                title: "Topics Generated",
                                description: "AI-generated topics have been added to your lesson",
                              });
                            } else {
                              toast({
                                title: "Generation Failed",
                                description: "No topics were returned from AI",
                                variant: "destructive",
                              });
                            }
                          } catch (error: any) {
                            toast({
                              title: "Generation Failed",
                              description: error.message || "Failed to generate topics",
                              variant: "destructive",
                            });
                          } finally {
                            setIsGeneratingTopics(false);
                          }
                        }}
                        disabled={isGeneratingTopics}
                        className="text-primary hover:text-primary/80 hover:bg-primary/10"
                        data-testid="button-generate-topics"
                      >
                        {isGeneratingTopics ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-1" />
                            Generate Topics with AI
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
                      {Array.from({ length: 10 }, (_, index) => (
                        <FormField
                          key={index}
                          control={form.control}
                          name={`topics.${index}.title`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {index === 0 ? "Slide 1: Overview" : `Slide ${index + 1}`}
                                {index < 3 ? " *" : " (Optional)"}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={
                                    index === 0 
                                      ? "e.g., Introduction to Photosynthesis" 
                                      : `e.g., Topic for slide ${index + 1}`
                                  }
                                  className="min-h-[44px]"
                                  {...field}
                                  data-testid={`input-topic-${index + 1}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    {/* Content Preview Section - Generate and edit description from topics */}
                    <div className="mt-[var(--space-lg)] p-[var(--card-padding)] rounded-lg border bg-surface-raised border-primary/20">
                      <div className="flex items-center justify-between mb-[var(--space-sm)]">
                        <div>
                          <h3 className="text-[length:var(--text-base)] font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            Content Preview
                          </h3>
                          <p className="text-[length:var(--text-sm)] text-muted-foreground">
                            Generate content from your topics, then review and edit before creating the lesson
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={async () => {
                            const lessonTitle = form.getValues('title');
                            const topics = form.getValues('topics');
                            const filledTopics = topics.filter(t => t.title.trim());
                            
                            if (!lessonTitle) {
                              toast({
                                title: "Title Required",
                                description: "Please enter a lesson title first",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            if (filledTopics.length < 2) {
                              toast({
                                title: "Topics Required",
                                description: "Please fill in at least 2 topics before generating content",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            try {
                              setIsGeneratingDescription(true);
                              const data = await apiRequest<{ description?: string }>('/api/ai/generate-lesson-description', {
                                method: 'POST',
                                body: JSON.stringify({
                                  lessonTitle,
                                  topics: topics,
                                  organizationId: effectiveOrgId,
                                  courseId: courseId || undefined,
                                  isOverview: isOverviewTopic,
                                }),
                              });
                              if (data?.description) {
                                form.setValue('inputText', data.description);
                                form.setValue('description', data.description);
                                // Mark as edited so hydration doesn't overwrite this AI-generated content
                                setHasUserEditedContent(true);
                                setLastHydratedDescription(data.description);
                                toast({
                                  title: "Content Generated",
                                  description: "Review and edit the content below before creating your lesson",
                                });
                              } else {
                                toast({
                                  title: "Generation Failed",
                                  description: "No content was returned from AI",
                                  variant: "destructive",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                title: "Generation Failed",
                                description: error.message || "Failed to generate content",
                                variant: "destructive",
                              });
                            } finally {
                              setIsGeneratingDescription(false);
                            }
                          }}
                          disabled={isGeneratingDescription}
                          className="text-primary hover:text-primary/80 hover:bg-primary/10"
                          data-testid="button-generate-content-preview"
                        >
                          {isGeneratingDescription ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-1" />
                              Generate Content
                            </>
                          )}
                        </Button>
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="inputText"
                        render={({ field }) => (
                          <FormItem>
                            {Array.isArray(contentVersionsData) && contentVersionsData.length > 0 && (
                              <div className="flex items-center gap-2 pb-2">
                                <History className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <Select 
                                  value={selectedWizardVersion} 
                                  onValueChange={setSelectedWizardVersion}
                                >
                                  <SelectTrigger className="w-[260px] h-9 text-sm">
                                    <SelectValue placeholder="Select version" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="current">Current (Latest)</SelectItem>
                                    {contentVersionsData.map((v: any) => (
                                      <SelectItem key={v.id} value={String(v.id)}>
                                        v{v.versionNumber} - {getVersionSourceLabel(v.source)} ({new Date(v.createdAt).toLocaleDateString()})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <FormControl>
                              <Textarea
                                placeholder="Click 'Generate Content' to create lesson content from your topics, or type/paste your own content here. You can edit the generated content before creating the lesson."
                                className="min-h-[400px] bg-background/50 font-mono text-sm"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  form.setValue('description', e.target.value, { shouldDirty: true });
                                  // Mark as user-edited to prevent hydration from overwriting
                                  setHasUserEditedContent(true);
                                }}
                                data-testid="input-content-preview"
                              />
                            </FormControl>
                            <FormDescription className="text-[length:var(--text-xs)]">
                              This content will be sent to the AI presentation generator. Edit as needed before creating your lesson. If you see trailing <span className="font-mono">...</span>, those characters are part of the selected text, not UI truncation.
                            </FormDescription>
                            <div className="text-[length:var(--text-sm)] text-muted-foreground space-y-2 mt-2">
                              <p className="font-medium">Content is structured as slides separated by three dashes (---):</p>
                              <div className="bg-muted p-[var(--card-padding)] rounded-md text-[length:var(--text-sm)] font-mono overflow-x-auto">
                                <div className="mb-2">Expected Format:</div>
                                <div className="text-muted-foreground">
                                  Slide 1 Title<br/><br/>
                                  Key point 1<br/>
                                  Key point 2<br/>
                                  Key point 3<br/>
                                  ---<br/><br/>
                                  Slide 2 Title<br/><br/>
                                  Key point 1<br/>
                                  Key point 2<br/>
                                  Key point 3<br/>
                                  ---<br/><br/>
                                  ...up to 10 slides maximum
                                </div>
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <PresentationConfigurationSection
                      form={form}
                      themesData={themesData}
                      savedThemeId={savedThemeId}
                      savedImageStyle={savedImageStyle}
                    />
                  </TabsContent>

                  <TabsContent value="text-input" className="space-y-[var(--space-md)] mt-[var(--space-md)]">
                    <FormField
                      control={form.control}
                      name="inputText"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <FormLabel>Lesson Content *</FormLabel>
                            {Array.isArray(contentVersionsData) && contentVersionsData.length > 0 && (
                              <div className="flex items-center gap-2">
                                <History className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <Select 
                                  value={selectedWizardVersion} 
                                  onValueChange={setSelectedWizardVersion}
                                >
                                  <SelectTrigger className="w-[260px] h-9 text-sm">
                                    <SelectValue placeholder="Select version" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="current">Current (Latest)</SelectItem>
                                    {contentVersionsData.map((v: any) => (
                                      <SelectItem key={v.id} value={String(v.id)}>
                                        v{v.versionNumber} - {getVersionSourceLabel(v.source)} ({new Date(v.createdAt).toLocaleDateString()})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          <FormControl>
                            <Textarea
                              placeholder="Paste or type the content for your lesson. The AI will transform it into a professional presentation with 10 slides."
                              className="min-h-[400px] font-mono text-sm"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                // Mark as user-edited to prevent hydration from overwriting
                                setHasUserEditedContent(true);
                              }}
                              data-testid="input-lesson-content"
                            />
                          </FormControl>
                          <FormDescription className="text-[length:var(--text-xs)]">
                            Scroll inside the text box to review all content. If you see trailing <span className="font-mono">...</span>, those characters are part of the selected version text.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <PresentationConfigurationSection
                      form={form}
                      themesData={themesData}
                      savedThemeId={savedThemeId}
                      savedImageStyle={savedImageStyle}
                    />
                  </TabsContent>

                  <TabsContent value="document-upload" className="space-y-[var(--space-md)] mt-[var(--space-md)]">
                    <div className="space-y-[var(--space-md)]">
                      <div className="border-2 border-dashed rounded-lg p-[var(--card-padding)]">
                        <div className="flex flex-col items-center space-y-[var(--space-md)]">
                          <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                          <div className="text-center w-full">
                            <h3 className="font-medium mb-2 text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">Upload Document for AI Generation</h3>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground mb-[var(--space-md)]">
                              Upload a Word document (.docx or .doc) (max 10MB). AI will extract the text and generate a presentation.
                            </p>
                            <Input
                              type="file"
                              accept=".docx,.doc"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setSelectedFile(file);
                                }
                              }}
                              data-testid="input-document-file"
                              className="w-full max-w-md mx-auto min-h-[44px]"
                            />
                            {selectedFile && (
                              <p className="text-[length:var(--text-sm)] text-success mt-2">
                                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-secondary/5 dark:bg-secondary/10 p-[var(--card-padding)] rounded-lg">
                        <div className="flex items-start gap-[var(--space-sm)]">
                          <FileText className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
                          <div className="text-[length:var(--text-sm)] text-secondary/90 dark:text-secondary/80">
                            <p className="font-medium mb-1">How It Works</p>
                            <ul className="list-disc list-inside space-y-1">
                              <li>Text is extracted from your document</li>
                              <li>AI generates a professional presentation using the extracted content</li>
                              <li>Configure theme and image options below</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <PresentationConfigurationSection
                        form={form}
                        themesData={themesData}
                        savedThemeId={savedThemeId}
                        savedImageStyle={savedImageStyle}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="manual-upload" className="space-y-[var(--space-md)] mt-[var(--space-md)]">
                    <div className="space-y-[var(--space-md)]">
                      <div className="border-2 border-dashed rounded-lg p-[var(--card-padding)]">
                        <div className="flex flex-col items-center space-y-[var(--space-md)]">
                          <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                          <div className="text-center w-full">
                            <h3 className="font-medium mb-2 text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">Upload Your PPTX File</h3>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground mb-[var(--space-md)]">
                              Upload an existing PowerPoint presentation (max 50MB). No credits required.
                            </p>
                            <Input
                              type="file"
                              accept=".pptx"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setSelectedFile(file);
                                }
                              }}
                              data-testid="input-manual-pptx"
                              className="w-full max-w-md mx-auto min-h-[44px]"
                            />
                            {selectedFile && (
                              <p className="text-[length:var(--text-sm)] text-success mt-2">
                                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="slideCount" className="text-[length:var(--text-sm)] font-medium">
                          Number of Slides (Optional)
                        </label>
                        <Input
                          id="slideCount"
                          type="number"
                          min={1}
                          max={100}
                          placeholder="e.g., 10"
                          value={slideCount || ""}
                          onChange={(e) => setSlideCount(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                          className="min-h-[44px]"
                          data-testid="input-slide-count"
                        />
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">
                          Optionally specify the number of slides in your presentation
                        </p>
                      </div>

                      <div className="bg-secondary/5 dark:bg-secondary/10 p-[var(--card-padding)] rounded-lg">
                        <div className="flex items-start gap-[var(--space-sm)]">
                          <Check className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
                          <div className="text-[length:var(--text-sm)] text-secondary/90 dark:text-secondary/80">
                            <p className="font-medium mb-1">No Credits Required</p>
                            <p>Manual uploads bypass the AI generation and don't use any credits.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <Card>
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)]">Review & Create</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">
                  Review your lesson details before creating
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                  <div>
                    <div className="text-[length:var(--text-sm)] text-muted-foreground">Title</div>
                    <div className="font-medium text-[length:var(--text-base)]" data-testid="text-review-title">{form.getValues("title")}</div>
                  </div>
                  <div>
                    <div className="text-[length:var(--text-sm)] text-muted-foreground">{gradeLevelLabel}</div>
                    <div className="font-medium text-[length:var(--text-base)]" data-testid="text-review-grade-level">
                      {(() => {
                        const selectedId = form.getValues("gradeLevel");
                        if (!selectedId) return "Not specified";
                        const unit = orgUnitsData?.units?.find(u => u.id === selectedId);
                        return unit?.name || selectedId;
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[length:var(--text-sm)] text-muted-foreground">{subjectLabel}</div>
                    <div className="font-medium text-[length:var(--text-base)]" data-testid="text-review-subject">
                      {(() => {
                        const selectedId = form.getValues("subject");
                        if (!selectedId) return "Not specified";
                        const subject = unitSubjectsData?.find((s) => s.subjectId === selectedId);
                        return subject?.subjectName || selectedId;
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[length:var(--text-sm)] text-muted-foreground">Generation Mode</div>
                    <div className="font-medium capitalize text-[length:var(--text-base)]" data-testid="text-review-generation-mode">{generationMode.replace("-", " ")}</div>
                  </div>
                </div>

                {form.getValues("description") && (
                  <div>
                    <div className="text-[length:var(--text-sm)] text-muted-foreground">Description</div>
                    <div className="font-medium text-[length:var(--text-base)]" data-testid="text-review-description">{form.getValues("description")}</div>
                  </div>
                )}

                <div className={`p-[var(--card-padding)] rounded-lg ${
                  generationMode === "manual-upload" 
                    ? "bg-primary/10 border border-primary/50" 
                    : (!hybridBalance.canAfford)
                      ? "bg-destructive/10 border border-destructive" 
                      : "bg-muted"
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
                    <div className="flex-1">
                      <div className="font-medium text-[length:var(--text-base)]">Estimated Credit Cost</div>
                      {generationMode === "manual-upload" ? (
                        <>
                          <div className="text-[length:var(--text-sm)] text-success font-medium">
                            No credits required - manual uploads are FREE!
                          </div>
                          <div className="text-[length:var(--text-xs)] text-muted-foreground mt-1">
                            Upload your own PPTX file to bypass AI generation
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[length:var(--text-sm)] text-muted-foreground">
                            {watchGenerateImages 
                              ? `${costs.creditsPerLessonWithImagesMin}-${costs.creditsPerLessonWithImagesMax}` 
                              : `${costs.creditsPerLessonTextOnlyMin}-${costs.creditsPerLessonTextOnlyMax}`} credits will be deducted (10 cards{watchGenerateImages ? " with AI images" : ""})
                          </div>
                          {!watchGenerateImages && (
                            <div className="text-[length:var(--text-xs)] text-primary mt-1">
                              💰 Saving {costs.creditsPerLessonWithImagesMin - costs.creditsPerLessonTextOnlyMin}-{costs.creditsPerLessonWithImagesMax - costs.creditsPerLessonTextOnlyMax} credits by using placeholder images
                            </div>
                          )}
                          {creditBalance && (
                            <div className={`text-[length:var(--text-sm)] mt-1 ${(creditBalance.balance < 0 || !hybridBalance.canAfford) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              Your balance: {creditBalance.balance < 0 ? '−' : ''}{Math.abs(creditBalance.balance)} {Math.abs(creditBalance.balance) === 1 ? "credit" : "credits"}
                              {creditBalance.balance < 0 && (
                                <span className="ml-2 text-[length:var(--text-xs)] bg-destructive/20 px-2 py-0.5 rounded">NEGATIVE BALANCE</span>
                              )}
                              {hybridBalance.orgWalletEnabled && hybridBalance.canSpendOrgCredits && hybridBalance.orgBalance > 0 && (
                                <div className="text-[length:var(--text-xs)] text-success mt-1">
                                  + {hybridBalance.orgBalance} organization credits available
                                </div>
                              )}
                              {!hybridBalance.canAfford && (
                                <div className="mt-2">
                                  <Link href="/buy-credits">
                                    <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation text-[length:var(--text-xs)]" data-testid="link-buy-credits">
                                      Buy More Credits
                                    </Button>
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col gap-2 items-start sm:items-end flex-shrink-0">
                      {generationMode === "manual-upload" ? (
                        <Badge className="text-[length:var(--text-sm)] sm:text-[length:var(--text-lg)] border-0 whitespace-nowrap" data-testid="badge-credit-free">
                          0 Credits - FREE
                        </Badge>
                      ) : (
                        <>
                          <Badge variant={!hybridBalance.canAfford ? "destructive" : "secondary"} className="text-[length:var(--text-sm)] sm:text-[length:var(--text-lg)]" data-testid="badge-credit-cost">
                            {watchGenerateImages 
                              ? `${costs.creditsPerLessonWithImagesMin}-${costs.creditsPerLessonWithImagesMax}` 
                              : `${costs.creditsPerLessonTextOnlyMin}-${costs.creditsPerLessonTextOnlyMax}`} Credits
                          </Badge>
                          {!hybridBalance.canAfford && (
                            <Badge variant="destructive" data-testid="badge-insufficient-credits">Insufficient Credits</Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload Progress */}
          {manualUploadMutation.isPending && uploadProgress > 0 && (
            <Card>
              <CardContent className="p-[var(--card-padding)]">
                <div className="space-y-2">
                  <div className="flex justify-between text-[length:var(--text-sm)]">
                    <span className="text-muted-foreground">Uploading your lesson...</span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" data-testid="upload-progress" />
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">
                    Please wait while we upload your PPTX file. This may take a moment for larger files.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation buttons */}
          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 sm:gap-[var(--space-md)]">
            {step > 1 && (
              <Button type="button" variant="outline" onClick={prevStep} disabled={manualUploadMutation.isPending} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-previous" >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
            )}
            
            {step < 3 && (
              <Button type="button" onClick={nextStep} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto sm:ml-auto" data-testid="button-next" >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {step === 3 && (
              <Button type="submit" disabled={hybridBalance.isLoading || createLessonMutation.isPending || startGenerationMutation.isPending || manualUploadMutation.isPending || generateForTopicMutation.isPending} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto sm:ml-auto" data-testid="button-create-lesson" >
                {(createLessonMutation.isPending || startGenerationMutation.isPending || manualUploadMutation.isPending || generateForTopicMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {manualUploadMutation.isPending
                  ? `Uploading... ${uploadProgress}%`
                  : (createLessonMutation.isPending || startGenerationMutation.isPending 
                    ? (isRegenerate ? "Regenerating..." : "Generating...") 
                    : (isRegenerate ? "Regenerate Lesson" : "Generate Lesson"))}
                {!manualUploadMutation.isPending && <Check className="ml-2 h-4 w-4" />}
              </Button>
            )}
          </div>
        </form>
      </Form>

      <InsufficientCreditsModal
        open={showInsufficientCreditsModal}
        onOpenChange={setShowInsufficientCreditsModal}
        currentBalance={hybridBalance.totalAvailable}
        requiredCredits={requiredCreditsMax}
        includeImages={watchGenerateImages}
      />

      {/* Quiz Regeneration Prompt Modal */}
      <AlertDialog open={showQuizRegeneratePrompt} onOpenChange={(open) => {
        if (!open && !isRegeneratingQuiz) {
          handleSkipQuizRegeneration();
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              Your lesson content has changed. Would you like to regenerate the linked quiz to match the new content?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={handleSkipQuizRegeneration}
              disabled={isRegeneratingQuiz}
            >
              Skip
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRegenerateQuiz}
              disabled={isRegeneratingQuiz}
            >
              {isRegeneratingQuiz ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Quiz
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuizAdminLayout>
  );
}
