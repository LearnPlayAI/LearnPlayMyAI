import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Globe, ArrowRight, ArrowLeft, Upload, Download, FileText, Sparkles,
  Check, Loader2, AlertCircle, Coins, History, ChevronDown, ChevronRight,
  FileUp, Wand2, Plus, RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest, invalidateWalletCaches, invalidateLanguageAwareContentCaches } from '@/lib/queryClient';
import { LP_CREDITS_SHORT } from '@shared/creditConstants';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import InlinePodcastTranslationStep from '@/components/translation/InlinePodcastTranslationStep';
import { normalizeArtifactStatusLabel, resolvePodcastAudioDisplayStatus } from '@/lib/translationFlowStatus';

type WizardStep = 'select_language' | 'translate_content' | 'review_edit' | 'podcast' | 'pptx' | 'complete';
type TranslationRunMode = 'ai' | 'manual';

const ALL_STEPS: WizardStep[] = ['select_language', 'translate_content', 'review_edit', 'pptx', 'podcast', 'complete'];

const STEP_LABELS: Record<WizardStep, string> = {
  select_language: 'Scope & Confirm',
  translate_content: 'Run Translation',
  review_edit: 'Review Outcomes',
  podcast: 'Podcast Remediation (Optional)',
  pptx: 'Presentation Remediation',
  complete: 'Finalize',
};

const stepMap: Record<string, WizardStep> = {
  'translating': 'translate_content',
  'content_translated': 'review_edit',
  'content_uploaded': 'review_edit',
  'partial_failed': 'review_edit',
  'draft_created': 'translate_content',
  'pptx_uploaded': 'pptx',
  'pptx_generating': 'pptx',
  'pptx_generated': 'pptx',
  'published': 'complete',
};

type RemediationArtifactKey =
  | 'sourceDb'
  | 'wordDocs'
  | 'pptx'
  | 'quiz'
  | 'podcastScript'
  | 'podcastAudio'
  | 'objectives'
  | 'digest'
  | 'stale'
  | 'language_variant';

type RemediationIntent = {
  enabled: boolean;
  targetLanguageCode: string | null;
  artifacts: RemediationArtifactKey[];
};

const uiCopy = {
  wizardStateUpdatedTitle: 'Wizard state updated',
  wizardStateUpdatedDescription:
    'A newer saved wizard state was detected (possibly another tab/session). Latest server state has been restored.',
  wizardStateSaveFailedTitle: 'Wizard state could not be saved',
  wizardStateSaveFailedDescription:
    'Your organization or permission context changed. Refresh and resume from the latest server state.',
  stalePodcastWarning:
    'Podcast source artifacts changed after this translation started. Refresh from latest source before continuing podcast translation.',
  footerInlineNotice: 'Complete the inline podcast steps above to enable final Next.',
  selectLanguageToContinue: 'Select a target language above to continue.',
  selectArtifactsToContinue: 'Select at least one artifact to continue.',
  selectQuizItemsToContinue: 'Select at least one quiz item or disable quiz translation.',
};

function buildVisibleWizardSteps(options: {
  includePptx: boolean;
  sourceHasPodcast: boolean;
  includePodcastTranslation: boolean;
}): WizardStep[] {
  const steps: WizardStep[] = ['select_language', 'translate_content', 'review_edit'];
  if (options.includePptx) steps.push('pptx');
  if (options.sourceHasPodcast && options.includePodcastTranslation) steps.push('podcast');
  steps.push('complete');
  return steps;
}

function isTranslationJobActive(job: any): boolean {
  if (!job) return false;
  if (typeof job?.runState?.isActive === 'boolean') {
    return job.runState.isActive;
  }
  return (
    job.status === 'pending' ||
    job.status === 'translating' ||
    job.currentStep === 'translating' ||
    job.currentStep === 'pptx_generating'
  );
}

function getRunPhase(job: any): string {
  const phase = String(job?.runState?.phase || '').trim().toLowerCase();
  if (phase) return phase;
  const current = String(job?.currentStep || '').trim().toLowerCase();
  const status = String(job?.status || '').trim().toLowerCase();
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  if (current === 'partial_failed') return 'partial_failed';
  if (current === 'published' || status === 'completed') return 'completed';
  if (['pptx_generating', 'translating'].includes(current) || status === 'translating') return 'processing';
  if (status === 'pending') return 'queued';
  if (status === 'draft' || current === 'draft_created') return 'draft';
  return 'unknown';
}

function parseRemediationIntentFromUrl(): RemediationIntent {
  if (typeof window === 'undefined') {
    return { enabled: false, targetLanguageCode: null, artifacts: [] };
  }
  const params = new URLSearchParams(window.location.search || '');
  const mode = String(params.get('mode') || '').trim().toLowerCase();
  const isRemediation = mode === 'remediate' || mode === 'remediation';
  if (!isRemediation) {
    return { enabled: false, targetLanguageCode: null, artifacts: [] };
  }
  const targetLanguageCode = String(
    params.get('targetLanguage') || params.get('targetLanguageCode') || ''
  ).trim().toLowerCase() || null;
  const artifactsRaw = String(params.get('artifacts') || '').trim();
  const artifacts = artifactsRaw
    ? artifactsRaw
        .split(',')
        .map((item) => String(item || '').trim())
        .filter(Boolean) as RemediationArtifactKey[]
    : [];
  return {
    enabled: true,
    targetLanguageCode,
    artifacts,
  };
}

function getStatusBadge(job: any) {
  const runLabel = String(job?.runState?.label || '').trim();
  const phase = getRunPhase(job);

  if (phase === 'completed') {
    return <Badge >Published</Badge>;
  }
  if (phase === 'processing' || phase === 'queued') {
    return (
      <Badge >
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        {runLabel || 'In Progress'}
      </Badge>
    );
  }
  if (phase === 'cancelled') {
    return <Badge >Cancelled</Badge>;
  }
  if (phase === 'failed' || phase === 'partial_failed') {
    if (String(job.errorMessage || '').toLowerCase().includes('cancelled by user')) {
      return <Badge >Cancelled</Badge>;
    }
    return <Badge >{phase === 'partial_failed' ? 'Partial Failure' : 'Failed'}</Badge>;
  }
  return <Badge >{runLabel || 'Draft'}</Badge>;
}

export default function TranslateLesson() {
  const [, params] = useRoute('/course-builder/:courseId/lessons/:lessonId/translate');
  const courseId = params?.courseId;
  const lessonId = params?.lessonId;
  const [, setLocation] = useLocation();
  const enhancedInlinePodcastUxEnabled = String((import.meta as any)?.env?.VITE_ENABLE_INLINE_PODCAST_UX_V2 ?? '1') !== '0';
  const { toast } = useToast();
  const docxInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const editDocxInputRef = useRef<HTMLInputElement>(null);

  const [showLanding, setShowLanding] = useState(true);
  const [currentStep, setCurrentStep] = useState<WizardStep>('select_language');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [translatedLessonId, setTranslatedLessonId] = useState<string | null>(null);
  const [translationJobId, setTranslationJobId] = useState<string | null>(null);
  const [hasTriggeredCurrentRun, setHasTriggeredCurrentRun] = useState(false);
  const [translatedQuizIds, setTranslatedQuizIds] = useState<string[]>([]);
  const [creditsCharged, setCreditsCharged] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [pptxVersionHistoryOpen, setPptxVersionHistoryOpen] = useState(false);
  const [includePodcastTranslation, setIncludePodcastTranslation] = useState(true);
  const [runMode, setRunMode] = useState<TranslationRunMode>('ai');
  const [retranslateExisting, setRetranslateExisting] = useState(false);
  const [podcastDraftState, setPodcastDraftState] = useState<{
    subStep: number;
    selectedSourceScriptId: string;
    podcastFormat: 'bulletin' | 'conversation';
    duration: 'short' | 'default' | 'long';
    focusTopic: string;
    selectedVoiceId: string;
    selectedGuestVoiceId: string;
    hostDisplayName: string;
    guestDisplayName: string;
    scriptId: string;
    scriptText: string;
    estimatedLpcCost: number | null;
    estimatedCharacters: number | null;
    hasTriggeredGeneration: boolean;
  }>({
    subStep: 1,
    selectedSourceScriptId: '',
    podcastFormat: 'bulletin',
    duration: 'default',
    focusTopic: '',
    selectedVoiceId: '',
    selectedGuestVoiceId: '',
    hostDisplayName: 'Host',
    guestDisplayName: 'Guest',
    scriptId: '',
    scriptText: '',
    estimatedLpcCost: null,
    estimatedCharacters: null,
    hasTriggeredGeneration: false,
  });
  const [persistedPodcastWizardState, setPersistedPodcastWizardState] = useState<any | null>(null);
  const [podcastInlineState, setPodcastInlineState] = useState({
    hasPreparedScript: false,
    hasTriggeredGeneration: false,
    hasCompletedAudio: false,
  });
  const lastTrackedStepRef = useRef<string | null>(null);
  const lastAppliedWizardStateRef = useRef<string | null>(null);
  const remediationIntentAppliedRef = useRef(false);
  const persistWizardStateTimerRef = useRef<number | null>(null);
  const pendingWizardPersistRef = useRef<any | null>(null);
  const clientSessionIdRef = useRef<string>(
    `tw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  const lastLocalWizardPersistAtRef = useRef<number>(0);
  const lastCrossTabNoticeRef = useRef<string | null>(null);
  const persistStateErrorNoticeRef = useRef<string | null>(null);
  const autoTriggeredPptxRef = useRef<string | null>(null);
  const [applyLanguageToAll, setApplyLanguageToAll] = useState(true);
  const [artifactLanguageMap, setArtifactLanguageMap] = useState<Record<string, string>>({});
  const [translationSelection, setTranslationSelection] = useState({
    includeSourceDb: true,
    includeWordDocs: true,
    includeQuiz: true,
    includePodcastScript: false,
    includePodcastAudio: false,
    includePptx: false,
    includeObjectives: false,
    includeDigest: false,
    pptxMode: 'translate_source' as 'translate_source' | 'generate_new',
    selectedSourceContentVersionId: 'current',
    selectedWordDocVersionId: 'current',
    selectedPptxVersionId: 'current',
    selectedPodcastScriptVersionId: '',
    selectedPodcastAudioVersionId: '',
    selectedQuizIds: [] as string[],
  });
  const remediationIntent = useMemo(() => parseRemediationIntentFromUrl(), []);

  const { data: course } = useQuery<{ id: string; title: string; organizationId: string }>({
    queryKey: ['/api/courses', courseId],
    enabled: !!courseId,
  });

  const organizationId = course?.organizationId || '';
  const courseTitle = course?.title || 'Course';

  const { data: lessonData } = useQuery<{ id: string; title: string; languageCode?: string }>({
    queryKey: ['/api/lessons', lessonId],
    enabled: !!lessonId && !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load lesson');
      return response.json();
    },
  });

  const lessonTitle = lessonData?.title || 'Lesson';
  const sourceLanguageCode = lessonData?.languageCode;

  const { data: translationPreflight } = useQuery<{
    translatableArtifactsFound?: boolean;
    blockers?: string[];
    availability: Record<string, boolean>;
    defaults: {
      includeSourceDb: boolean;
      includeWordDocs: boolean;
      includeQuiz: boolean;
      includePodcastScript: boolean;
      includePodcastAudio: boolean;
      includePptx: boolean;
      includeObjectives?: boolean;
      includeDigest?: boolean;
      pptxMode: 'translate_source' | 'generate_new';
      selectedSourceContentVersionId?: string;
      selectedWordDocVersionId?: string;
      selectedPptxVersionId?: string;
      selectedPodcastScriptVersionId?: string | null;
      selectedPodcastAudioVersionId?: string | null;
      selectedQuizIds?: string[];
    };
    artifacts?: Record<string, { versions: Array<any> }>;
    counts: { linkedQuizCount: number };
    pricing: {
      creditsPerLessonTranslation: number;
      creditsPerQuizTranslation: number;
      creditsPerTranslatedPptxGeneration: number;
      estimatedSelectedDefaults: number;
    };
    targetCoverage?: Record<string, any>;
  }>({
    queryKey: ['/api/lessons', lessonId, 'translation-preflight', organizationId, selectedLanguage || 'source'],
    enabled: !!lessonId && !!organizationId,
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId });
      if (selectedLanguage) params.set('targetLanguageCode', selectedLanguage);
      const response = await fetch(`/api/lessons/${lessonId}/translation-preflight?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load translation preflight');
      return response.json();
    },
  });

  useEffect(() => {
    if (!translationPreflight?.defaults) return;
    setTranslationSelection((prev) => ({
      ...prev,
      ...translationPreflight.defaults,
      includePodcastScript: false,
      includePodcastAudio: false,
      selectedQuizIds: Array.isArray(translationPreflight.defaults.selectedQuizIds)
        ? translationPreflight.defaults.selectedQuizIds
        : prev.selectedQuizIds,
      selectedPodcastScriptVersionId: translationPreflight.defaults.selectedPodcastScriptVersionId || prev.selectedPodcastScriptVersionId,
      selectedPodcastAudioVersionId: translationPreflight.defaults.selectedPodcastAudioVersionId || prev.selectedPodcastAudioVersionId,
    }));
    if (selectedLanguage && (translationPreflight?.availability?.podcastScript || translationPreflight?.availability?.podcastAudio)) {
      const missingPodcast =
        translationPreflight?.targetCoverage?.podcastScript === false ||
        translationPreflight?.targetCoverage?.podcastAudio === false;
      if (missingPodcast) setIncludePodcastTranslation(true);
    }
  }, [translationPreflight?.defaults, translationPreflight?.targetCoverage, translationPreflight?.availability, selectedLanguage]);

  useEffect(() => {
    if (!remediationIntent.enabled) return;
    if (remediationIntentAppliedRef.current) return;
    setShowLanding(false);
    setCurrentStep('select_language');
    setRetranslateExisting(true);
    if (remediationIntent.targetLanguageCode) {
      setSelectedLanguage(remediationIntent.targetLanguageCode);
    }
  }, [remediationIntent.enabled, remediationIntent.targetLanguageCode]);

  useEffect(() => {
    if (!remediationIntent.enabled) return;
    if (remediationIntentAppliedRef.current) return;
    if (!translationPreflight?.defaults) return;

    const targetLang = remediationIntent.targetLanguageCode || selectedLanguage || '';
    const requested = new Set(remediationIntent.artifacts || []);
    const includeAllFromStale = requested.has('stale');
    const includeLanguageVariantBootstrap = requested.has('language_variant');

    const includeSourceDb = includeAllFromStale || includeLanguageVariantBootstrap || requested.has('sourceDb');
    const includeWordDocs = includeAllFromStale || requested.has('wordDocs');
    const includePptx = includeAllFromStale || includeLanguageVariantBootstrap || requested.has('pptx');
    const includeQuiz = includeAllFromStale || requested.has('quiz');
    const includeObjectives = includeAllFromStale || includeLanguageVariantBootstrap || requested.has('objectives');
    const includeDigest = includeAllFromStale || includeLanguageVariantBootstrap || requested.has('digest');
    const includePodcastScript = includeAllFromStale || requested.has('podcastScript');
    const includePodcastAudio = includeAllFromStale || requested.has('podcastAudio');

    setShowLanding(false);
    setCurrentStep('select_language');
    setRetranslateExisting(true);
    setHasTriggeredCurrentRun(false);
    setTranslatedLessonId(null);
    setTranslationJobId(null);
    setError(null);

    if (targetLang) {
      setSelectedLanguage(targetLang);
    }

    setTranslationSelection((prev) => ({
      ...prev,
      includeSourceDb: includeSourceDb && (translationPreflight?.availability?.sourceDb ?? false),
      includeWordDocs: includeWordDocs && (translationPreflight?.availability?.wordDocs ?? false),
      includeQuiz: includeQuiz && (translationPreflight?.availability?.quiz ?? false),
      includePodcastScript: includePodcastScript && (translationPreflight?.availability?.podcastScript ?? false),
      includePodcastAudio: includePodcastAudio && (translationPreflight?.availability?.podcastAudio ?? false),
      includePptx: includePptx && (translationPreflight?.availability?.pptx ?? false),
      includeObjectives,
      includeDigest: includeDigest && (translationPreflight?.availability?.digest ?? false),
      pptxMode: 'translate_source',
      selectedSourceContentVersionId: translationPreflight.defaults.selectedSourceContentVersionId || prev.selectedSourceContentVersionId,
      selectedWordDocVersionId: translationPreflight.defaults.selectedWordDocVersionId || prev.selectedWordDocVersionId,
      selectedPptxVersionId: translationPreflight.defaults.selectedPptxVersionId || prev.selectedPptxVersionId,
      selectedPodcastScriptVersionId: translationPreflight.defaults.selectedPodcastScriptVersionId || prev.selectedPodcastScriptVersionId,
      selectedPodcastAudioVersionId: translationPreflight.defaults.selectedPodcastAudioVersionId || prev.selectedPodcastAudioVersionId,
      selectedQuizIds: Array.isArray(translationPreflight.defaults.selectedQuizIds)
        ? translationPreflight.defaults.selectedQuizIds
        : prev.selectedQuizIds,
    }));

    remediationIntentAppliedRef.current = true;
  }, [
    remediationIntent.enabled,
    remediationIntent.targetLanguageCode,
    remediationIntent.artifacts,
    translationPreflight?.defaults,
    translationPreflight?.availability,
    selectedLanguage,
  ]);

  useEffect(() => {
    if (!selectedLanguage || !applyLanguageToAll) return;
    setArtifactLanguageMap((prev) => ({
      ...prev,
      sourceDb: selectedLanguage,
      wordDocs: selectedLanguage,
      quiz: selectedLanguage,
      podcastScript: selectedLanguage,
      podcastAudio: selectedLanguage,
      pptx: selectedLanguage,
      objectives: selectedLanguage,
      digest: selectedLanguage,
    }));
  }, [selectedLanguage, applyLanguageToAll]);

  const { data: sourcePodcastState } = useQuery<any>({
    queryKey: ['/api/lessons', lessonId, 'podcast-state', 'source-lesson'],
    enabled: !!lessonId && !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${lessonId}/podcast/state?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      return response.json();
    },
  });

  const { data: translatedPodcastState } = useQuery<any>({
    queryKey: ['/api/lessons', translatedLessonId, 'podcast-state', 'translated-lesson'],
    enabled: !!translatedLessonId && !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${translatedLessonId}/podcast/state?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      return response.json();
    },
    refetchInterval: 12000,
  });

  const backUrl = `/course-builder/${courseId}/lessons`;
  const sourceHasPodcast = ((sourcePodcastState?.versions?.length || 0) > 0) || ((sourcePodcastState?.scripts?.length || 0) > 0);
  const visibleSteps = useMemo(
    () =>
      buildVisibleWizardSteps({
        includePptx: translationSelection.includePptx,
        sourceHasPodcast,
        includePodcastTranslation,
      }),
    [translationSelection.includePptx, sourceHasPodcast, includePodcastTranslation]
  );
  const currentStepIndex = Math.max(visibleSteps.indexOf(currentStep), 0);
  const progress = ((currentStepIndex + 1) / Math.max(visibleSteps.length, 1)) * 100;

  const { data: supportedLanguages } = useQuery<Array<{ code: string; name: string; nativeName: string }>>({
    queryKey: ['/api/languages'],
    enabled: !!organizationId,
  });

  const { data: pricing } = useQuery<{ creditsPerLessonTranslation?: number; creditsPerQuizTranslation?: number; creditsPerTranslatedPptxGeneration?: number }>({
    queryKey: ['/api/translation-pricing'],
    enabled: !!organizationId,
  });

  const { data: translationVersionData, refetch: refetchVersions } = useQuery<{ textVersions: Array<{ id: string; versionNumber: number; createdAt: string; changeDescription?: string }>; pptxVersions: Array<{ id: string; version: number; createdAt: string; gammaCardId?: string }> }>({
    queryKey: ['/api/lessons', translatedLessonId, 'translation-versions'],
    enabled: !!translatedLessonId && (currentStep === 'review_edit' || currentStep === 'pptx'),
    queryFn: async () => {
      if (!translatedLessonId) return { textVersions: [], pptxVersions: [] };
      const params = new URLSearchParams();
      if (selectedLanguage) params.set('languageCode', selectedLanguage);
      const response = await fetch(`/api/lessons/${translatedLessonId}/translation-versions?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load translation versions');
      return await response.json();
    },
  });
  const textVersions = translationVersionData?.textVersions || [];
  const pptxVersions = translationVersionData?.pptxVersions || [];

  useEffect(() => {
    if (visibleSteps.includes(currentStep)) return;
    if (currentStep === 'podcast') {
      setCurrentStep('complete');
      return;
    }
    if (currentStep === 'pptx') {
      setCurrentStep(sourceHasPodcast && includePodcastTranslation ? 'podcast' : 'complete');
      return;
    }
    setCurrentStep('select_language');
  }, [visibleSteps, currentStep, sourceHasPodcast, includePodcastTranslation]);

  const { data: allTranslationJobs, refetch: refetchAllTranslationJobs } = useQuery<{ jobs: Array<any> }>({
    queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', 'all-jobs'],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/lessons/${lessonId}/translation-wizard-state?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch translation jobs');
      return response.json();
    },
    enabled: !!organizationId && !!lessonId,
    refetchInterval: (query) => {
      const jobs = (query.state.data as { jobs?: Array<any> } | undefined)?.jobs || [];
      const hasActiveJobs = jobs.some(isTranslationJobActive);
      return hasActiveJobs ? 3000 : false;
    },
  });

  const deduplicatedJobs = useMemo(() => {
    if (!allTranslationJobs?.jobs?.length) return [];
    const seen = new Map<string, any>();
    for (const job of allTranslationJobs.jobs) {
      const lang = job.targetLanguageCode;
      if (!lang) continue;
      const existing = seen.get(lang);
      if (!existing) {
        seen.set(lang, job);
        continue;
      }

      // Prefer active jobs for resume so users land on the latest in-flight state.
      if (isTranslationJobActive(job) && !isTranslationJobActive(existing)) {
        seen.set(lang, job);
      }
    }
    return Array.from(seen.values());
  }, [allTranslationJobs]);

  const activeLanguageCodes = useMemo(() => {
    return new Set(
      deduplicatedJobs
        .filter(job => job.status !== 'failed')
        .map(job => job.targetLanguageCode)
    );
  }, [deduplicatedJobs]);

  const selectedLanguageJob = useMemo(() => {
    if (!selectedLanguage) return null;
    return deduplicatedJobs.find((job) => job.targetLanguageCode === selectedLanguage) || null;
  }, [deduplicatedJobs, selectedLanguage]);

  const hasActiveSelectedJob = useMemo(() => {
    return isTranslationJobActive(selectedLanguageJob);
  }, [selectedLanguageJob]);

  useEffect(() => {
    if (!selectedLanguage) return;
    setRetranslateExisting(Boolean(selectedLanguageJob || translationPreflight?.targetCoverage?.hasTargetLesson));
  }, [selectedLanguage, selectedLanguageJob, translationPreflight?.targetCoverage?.hasTargetLesson]);

  const { data: translationJobStatus, refetch: refetchTranslationJobStatus } = useQuery<{ jobs: Array<any> }>({
    queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', selectedLanguage, 'poll'],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId });
      if (selectedLanguage) params.append('targetLanguageCode', selectedLanguage);
      const response = await fetch(`/api/lessons/${lessonId}/translation-wizard-state?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    enabled: !!organizationId && !!selectedLanguage && !showLanding && (isTranslating || hasActiveSelectedJob),
    refetchInterval: (query) => {
      const job = (query.state.data as { jobs?: Array<any> } | undefined)?.jobs?.[0];
      return isTranslationJobActive(job) || hasActiveSelectedJob ? 3000 : false;
    },
  });

  const lastPolledStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!translationJobStatus?.jobs?.length) return;
    const job = translationJobStatus.jobs[0];
    const polledState = `${job.id}:${job.status}:${job.currentStep}:${String(job?.runState?.phase || '')}`;
    const stateChanged = lastPolledStateRef.current !== polledState;
    const phase = getRunPhase(job);
    const explicitRunStep = String(job?.runState?.step || '').trim().toLowerCase();
    const mappedLegacyStep = stepMap[String(job?.currentStep || '').trim().toLowerCase()] || '';
    const normalizedStep = explicitRunStep || mappedLegacyStep || String(job.currentStep || '').trim().toLowerCase();

    if (!translatedLessonId && job.lessonId) {
      setTranslatedLessonId(job.lessonId);
    }

    if (isTranslationJobActive(job) && !isTranslating) {
      setIsTranslating(true);
    }

    if (normalizedStep === 'translate_content' && currentStep !== 'translate_content') {
      setCurrentStep('translate_content');
    }

    if (normalizedStep === 'pptx' && currentStep !== 'pptx' && phase === 'processing') {
      setCurrentStep('pptx');
    }

    if (phase === 'completed') {
      setIsTranslating(false);
      if (currentStep === 'translate_content') {
        setCurrentStep('review_edit');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/lessons'] });
      if (stateChanged) {
        toast({
          title: 'Translation Complete',
          description: 'AI translation has finished successfully.',
        });
      }
    }

    if (phase === 'failed') {
      setIsTranslating(false);
      setError(job.errorMessage || 'Translation failed');
      if (stateChanged) {
        toast({
          title: 'Translation Failed',
          description: job.errorMessage || 'The AI translation encountered an error.',
          variant: 'destructive',
        });
      }
    }

    const terminalPhases = new Set(['completed', 'partial_failed', 'failed', 'cancelled', 'awaiting_user']);
    if (terminalPhases.has(phase) && currentStep === 'translate_content') {
      setCurrentStep('review_edit');
    }

    if (!isTranslationJobActive(job) && phase !== 'failed' && isTranslating) {
      setIsTranslating(false);
    }

    lastPolledStateRef.current = polledState;
  }, [translationJobStatus, isTranslating, translatedLessonId, currentStep]);

  const targetLanguageOptions = useMemo(() => {
    return (supportedLanguages || []).filter(
      (lang) => lang.code !== sourceLanguageCode
    );
  }, [supportedLanguages, sourceLanguageCode]);

  const activeJobDetails = (
    translationJobStatus?.jobs?.[0]
    || ((retranslateExisting && !hasTriggeredCurrentRun) ? null : selectedLanguageJob)
  ) as any;
  const artifactStatuses = ((activeJobDetails?.translationPackage?.assets || {}) as Record<string, string>);
  const artifactMessages = ((activeJobDetails?.translationPackage?.assetMessages || {}) as Record<string, string | null>);
  const artifactActionPlan = (activeJobDetails?.artifactActionPlan || []) as Array<{
    asset: string;
    status: string;
    stale?: boolean;
    isBlocking?: boolean;
    actionKey: string;
    actionLabel: string;
    actionHint?: string;
    targetStep?: WizardStep;
    severity?: "info" | "warning" | "error";
  }>;
  const hasCompletedTargetLanguagePodcastAudio = useMemo(() => {
    if (!translatedPodcastState?.versions?.length || !selectedLanguage) return false;
    return translatedPodcastState.versions.some((version: any) =>
      String(version?.languageCode || '').toLowerCase() === String(selectedLanguage).toLowerCase()
      && String(version?.status || '').toLowerCase() === 'completed'
    );
  }, [translatedPodcastState?.versions, selectedLanguage]);
  const displayArtifactStatuses = useMemo(() => {
    const entries = Object.entries(artifactStatuses || {}).map(([asset, status]) => {
      if (asset === 'podcastAudio') {
        return [asset, resolvePodcastAudioDisplayStatus({
          rawStatus: String(status || ''),
          podcastJobStatus: String(translatedPodcastState?.currentJob?.status || ''),
          hasCompletedTargetLanguageAudio: hasCompletedTargetLanguagePodcastAudio,
        })] as const;
      }
      return [asset, status] as const;
    });
    return Object.fromEntries(entries) as Record<string, string>;
  }, [artifactStatuses, translatedPodcastState?.currentJob?.status, hasCompletedTargetLanguagePodcastAudio]);
  const primaryArtifactStatusEntries = useMemo(
    () => Object.entries(displayArtifactStatuses).filter(([_, status]) => String(status) !== 'deferred_optional'),
    [displayArtifactStatuses]
  );
  const deferredOptionalArtifactEntries = useMemo(
    () => Object.entries(displayArtifactStatuses).filter(([_, status]) => String(status) === 'deferred_optional'),
    [displayArtifactStatuses]
  );
  const blockingActionItems = useMemo(
    () => artifactActionPlan.filter((item) => item.isBlocking),
    [artifactActionPlan]
  );
  const hasBlockingRemediationActions = blockingActionItems.length > 0;
  const hasUnsettledRequiredArtifacts = useMemo(() => {
    return primaryArtifactStatusEntries.some(([_, rawStatus]) => {
      const status = String(rawStatus || '').trim().toLowerCase();
      return !['completed', 'failed', 'cancelled', 'skipped'].includes(status);
    });
  }, [primaryArtifactStatusEntries]);
  const isActiveJobStillRunning = isTranslationJobActive(activeJobDetails);
  const failedArtifactKeys = Object.entries(artifactStatuses)
    .filter(([_, status]) => status === 'failed')
    .map(([key]) => key);
  const staleArtifactKeys = Object.entries((activeJobDetails?.translationPackage?.staleMap || {}) as Record<string, any>)
    .filter(([_, payload]) => payload?.stale === true)
    .map(([key]) => key);
  const hasPodcastSourceDrift = staleArtifactKeys.includes('podcastScript') || staleArtifactKeys.includes('podcastAudio');

  const selectedLanguageName = (supportedLanguages || []).find(l => l.code === selectedLanguage)?.name || selectedLanguage;
  const availableLanguagesForSelection = useMemo(() => {
    const base = [...targetLanguageOptions];
    if (!selectedLanguage) return base;
    const alreadyIncluded = base.some((lang) => lang.code === selectedLanguage);
    if (alreadyIncluded) return base;
    const selected = (supportedLanguages || []).find((lang) => lang.code === selectedLanguage);
    if (!selected) return base;
    if (retranslateExisting || !!selectedLanguageJob) {
      return [selected, ...base];
    }
    return base;
  }, [targetLanguageOptions, selectedLanguage, supportedLanguages, retranslateExisting, selectedLanguageJob]);
  const artifactConfig = [
    { key: 'sourceDb', includeKey: 'includeSourceDb', versionKey: 'selectedSourceContentVersionId', label: 'Source DB' },
    { key: 'wordDocs', includeKey: 'includeWordDocs', versionKey: 'selectedWordDocVersionId', label: 'Word source' },
    { key: 'pptx', includeKey: 'includePptx', versionKey: 'selectedPptxVersionId', label: 'PPTX' },
    { key: 'quiz', includeKey: 'includeQuiz', versionKey: '', label: 'Quiz' },
    { key: 'objectives', includeKey: 'includeObjectives', versionKey: '', label: 'Learning objectives' },
    { key: 'digest', includeKey: 'includeDigest', versionKey: '', label: 'Lesson digest' },
  ] as const;

  const selectedArtifactSummary: Array<{ key: string; label: string; version: string; language: string }> = [
    ...artifactConfig
      .filter((artifact) => (translationSelection as any)[artifact.includeKey] === true)
      .map((artifact) => {
      const versions = (translationPreflight?.artifacts?.[artifact.key]?.versions || []) as Array<any>;
      const selectedVersionId = artifact.versionKey ? (translationSelection as any)[artifact.versionKey] : null;
      const selectedVersion = selectedVersionId ? versions.find((v: any) => String(v.id) === String(selectedVersionId)) : null;
      const language = (artifactLanguageMap as any)[artifact.key] || selectedLanguage || '';
      return {
        key: artifact.key,
        label: artifact.label,
        version: String(selectedVersion?.label || (versions[0]?.label ?? 'Current')),
        language,
      };
    }),
    ...(sourceHasPodcast && includePodcastTranslation
      ? [
          {
            key: 'podcastScript',
            label: 'Podcast script',
            version: 'Translate script in podcast step',
            language: selectedLanguage || '',
          },
          {
            key: 'podcastAudio',
            label: 'Podcast audio',
            version: 'Generate target-language audio in podcast step',
            language: selectedLanguage || '',
          },
        ]
      : []),
  ];
  const selectedArtifactKeys = useMemo(
    () => artifactConfig
      .filter((artifact) => (translationSelection as any)[artifact.includeKey] === true)
      .map((artifact) => artifact.key),
    [artifactConfig, translationSelection]
  );
  const selectedArtifactTargetLanguages = useMemo(
    () => selectedArtifactKeys
      .map((artifactKey) => String((artifactLanguageMap as any)[artifactKey] || '').trim().toLowerCase())
      .filter((code) => code.length > 0),
    [selectedArtifactKeys, artifactLanguageMap]
  );
  const hasMissingSelectedArtifactTargetLanguage = useMemo(
    () => !applyLanguageToAll
      && selectedArtifactKeys.length > 0
      && selectedArtifactKeys.some((artifactKey) => !String((artifactLanguageMap as any)[artifactKey] || '').trim()),
    [applyLanguageToAll, selectedArtifactKeys, artifactLanguageMap]
  );
  const hasMismatchedSelectedArtifactTargetLanguages = useMemo(
    () => !applyLanguageToAll
      && selectedArtifactTargetLanguages.length > 1
      && new Set(selectedArtifactTargetLanguages).size > 1,
    [applyLanguageToAll, selectedArtifactTargetLanguages]
  );
  const inferredArtifactTargetLanguage = useMemo(
    () => !applyLanguageToAll && selectedArtifactTargetLanguages.length > 0
      ? selectedArtifactTargetLanguages[0]
      : '',
    [applyLanguageToAll, selectedArtifactTargetLanguages]
  );
  const effectiveTargetLanguage = useMemo(
    () => String(selectedLanguage || '').trim().toLowerCase() || inferredArtifactTargetLanguage,
    [selectedLanguage, inferredArtifactTargetLanguage]
  );
  const canRunTranslationWithSelectedLanguages = useMemo(() => {
    if (!effectiveTargetLanguage) return false;
    if (applyLanguageToAll) return true;
    if (hasMissingSelectedArtifactTargetLanguage) return false;
    if (hasMismatchedSelectedArtifactTargetLanguages) return false;
    return true;
  }, [
    effectiveTargetLanguage,
    applyLanguageToAll,
    hasMissingSelectedArtifactTargetLanguage,
    hasMismatchedSelectedArtifactTargetLanguages,
  ]);

  const selectedContentCount = Object.entries(translationSelection)
    .filter(([key, value]) => (
      ['includeSourceDb', 'includeWordDocs', 'includeQuiz', 'includePptx', 'includeObjectives', 'includeDigest'].includes(key) && value === true
    ))
    .length + (sourceHasPodcast && includePodcastTranslation ? 1 : 0);
  const linkedQuizCount = translationPreflight?.counts?.linkedQuizCount || 0;
  const selectedQuizCount = translationSelection.includeQuiz ? translationSelection.selectedQuizIds.length : 0;
  const quizSelectionMissing = translationSelection.includeQuiz && linkedQuizCount > 0 && selectedQuizCount === 0;
  const includeLessonCoreBillable = translationSelection.includeSourceDb || translationSelection.includeWordDocs || translationSelection.includeObjectives;
  const lessonCredits = (translationPreflight?.pricing?.creditsPerLessonTranslation ?? pricing?.creditsPerLessonTranslation ?? 10);
  const quizCredits = (translationPreflight?.pricing?.creditsPerQuizTranslation ?? pricing?.creditsPerQuizTranslation ?? 5);
  const pptxCredits = (translationPreflight?.pricing?.creditsPerTranslatedPptxGeneration ?? pricing?.creditsPerTranslatedPptxGeneration ?? 50);
  const lessonCoreSelectedLabels = [
    translationSelection.includeSourceDb ? 'Source DB' : null,
    translationSelection.includeWordDocs ? 'Word source' : null,
    translationSelection.includeObjectives ? 'Objectives' : null,
  ].filter(Boolean).join(', ');
  const estimatedSelectedCredits = (() => {
    let total = 0;
    if (includeLessonCoreBillable) total += lessonCredits;
    if (translationSelection.includeQuiz) total += selectedQuizCount * quizCredits;
    if (translationSelection.includePptx && translationSelection.pptxMode === 'generate_new') total += pptxCredits;
    return total;
  })();
  const artifactLabelByKey = Object.fromEntries(artifactConfig.map((item) => [item.key, item.label]));

  const getLanguageName = (code: string) => {
    return (supportedLanguages || []).find(l => l.code === code)?.name || code;
  };

  const resetWizardState = () => {
    setCurrentStep('select_language');
    setSelectedLanguage('');
    setTranslatedLessonId(null);
    setTranslationJobId(null);
    setHasTriggeredCurrentRun(false);
    setTranslatedQuizIds([]);
    setCreditsCharged(0);
    setIsTranslating(false);
    setIsUploading(false);
    setError(null);
    setVersionHistoryOpen(false);
    setPptxVersionHistoryOpen(false);
    setRetranslateExisting(false);
    setRunMode('ai');
    setPersistedPodcastWizardState(null);
    setPodcastDraftState({
      subStep: 1,
      selectedSourceScriptId: '',
      podcastFormat: 'bulletin',
      duration: 'default',
      focusTopic: '',
      selectedVoiceId: '',
      selectedGuestVoiceId: '',
      hostDisplayName: 'Host',
      guestDisplayName: 'Guest',
      scriptId: '',
      scriptText: '',
      estimatedLpcCost: null,
      estimatedCharacters: null,
      hasTriggeredGeneration: false,
    });
    setPodcastInlineState({
      hasPreparedScript: false,
      hasTriggeredGeneration: false,
      hasCompletedAudio: false,
    });
  };

  const trackFunnelEvent = async (
    eventName: string,
    details?: Record<string, any>,
  ) => {
    if (!lessonId || !organizationId) return;
    try {
      await apiRequest(`/api/lessons/${lessonId}/translation-funnel-event?organizationId=${organizationId}`, {
        method: 'POST',
        body: JSON.stringify({
          eventName,
          step: currentStep,
          targetLanguageCode: selectedLanguage || null,
          translatedLessonId,
          translationJobId,
          dedupeSeed: `${eventName}:${currentStep}:${selectedLanguage || 'none'}:${translatedLessonId || lessonId}:${Math.floor(Date.now() / 60000)}`,
          metadata: details || {},
        }),
      });
    } catch {
      // non-blocking instrumentation
    }
  };

  const handleResumeJob = (job: any) => {
    resetWizardState();

    if (job.targetLanguageCode) {
      setSelectedLanguage(job.targetLanguageCode);
    }
    if (job.lessonId) {
      setTranslatedLessonId(job.lessonId);
    }
    if (job.id) {
      setTranslationJobId(String(job.id));
    }
    setHasTriggeredCurrentRun(true);
    if (job.creditsCharged) {
      setCreditsCharged(job.creditsCharged);
    }

    const resumeStep = String(job?.runState?.step || '').trim() as WizardStep;
    if (resumeStep && ALL_STEPS.includes(resumeStep)) {
      setCurrentStep(resumeStep);
    } else if (job.currentStep === 'published') {
      setCurrentStep('complete');
    } else {
      const mappedStep = stepMap[job.currentStep] || 'select_language';
      setCurrentStep(mappedStep);
    }

    if (isTranslationJobActive(job)) {
      setIsTranslating(true);
    }

    const phase = getRunPhase(job);
    if (phase === 'failed' || phase === 'partial_failed') {
      setError(job.errorMessage || 'Translation failed');
    }

    setShowLanding(false);
  };

  const handleRetranslateExistingLanguage = (job: any) => {
    resetWizardState();
    if (job.targetLanguageCode) {
      setSelectedLanguage(job.targetLanguageCode);
    }
    setTranslatedLessonId(null);
    setTranslationJobId(null);
    setRetranslateExisting(true);
    setHasTriggeredCurrentRun(false);
    setCurrentStep('select_language');
    setShowLanding(false);
  };

  const handleStartNew = () => {
    resetWizardState();
    setCurrentStep('select_language');
    setShowLanding(false);
  };

  const handleBackToLanding = () => {
    resetWizardState();
    setShowLanding(true);
    queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', 'all-jobs'] });
  };

  const invalidateTranslationCaches = (targetLanguageCode?: string | null) => {
    invalidateLanguageAwareContentCaches({
      lessonId: lessonId || undefined,
      courseId: courseId || undefined,
      languageCode: targetLanguageCode || selectedLanguage || undefined,
    });
    queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', 'all-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', selectedLanguage, 'poll'] });
    queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'translation-preflight', organizationId] });
    if (translatedLessonId) {
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', translatedLessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', translatedLessonId, 'viewer'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', translatedLessonId, 'translation-versions'] });
    }
  };

  const handleRefreshFromLatestSource = () => {
    const staleSet = new Set(staleArtifactKeys);
    const isMissingTarget = (artifactKey: string) =>
      !!selectedLanguage &&
      translationPreflight?.availability?.[artifactKey] === true &&
      translationPreflight?.targetCoverage?.[artifactKey] === false;
    setRetranslateExisting(true);
    setHasTriggeredCurrentRun(false);
    setTranslatedLessonId(null);
    setTranslationJobId(null);
    if (staleSet.size > 0) {
      setTranslationSelection((prev) => ({
        ...prev,
        includeSourceDb: staleSet.has('sourceDb') || isMissingTarget('sourceDb'),
        includeWordDocs: staleSet.has('wordDocs') || isMissingTarget('wordDocs'),
        includeQuiz: staleSet.has('quiz') || isMissingTarget('quiz'),
        includePodcastScript: staleSet.has('podcastScript') || isMissingTarget('podcastScript'),
        includePodcastAudio: staleSet.has('podcastAudio') || isMissingTarget('podcastAudio'),
        includePptx: staleSet.has('pptx') || isMissingTarget('pptx'),
        includeObjectives: staleSet.has('objectives') || isMissingTarget('objectives'),
        includeDigest: staleSet.has('digest') || isMissingTarget('digest'),
      }));
    }
    setCurrentStep('select_language');
    invalidateTranslationCaches(selectedLanguage || null);
    refetchAllTranslationJobs();
    refetchTranslationJobStatus();
    toast({
      title: 'Refresh Translation',
      description: staleSet.size > 0
        ? 'Only the stale artifact selections have been enabled. Continue to refresh those translations from latest source.'
        : 'Choose artifacts and continue to re-translate this existing target language from updated source content.',
    });
  };

  useEffect(() => {
    if (showLanding) return;
    if (!activeJobDetails?.id) return;
    const restoreKey = `${activeJobDetails.id}:${selectedLanguage || 'none'}`;
    if (lastAppliedWizardStateRef.current === restoreKey) return;

    const wizardState = activeJobDetails?.translationPackage?.wizardState;
    if (!wizardState || typeof wizardState !== 'object') {
      lastAppliedWizardStateRef.current = restoreKey;
      return;
    }
    const remoteUpdatedAtRaw = String((wizardState as any).updatedAt || '').trim();
    const remoteUpdatedAt = remoteUpdatedAtRaw ? new Date(remoteUpdatedAtRaw).getTime() : 0;
    const remoteSessionId = String((wizardState as any).clientSessionId || '').trim();
    if (
      remoteSessionId &&
      remoteSessionId !== clientSessionIdRef.current &&
      remoteUpdatedAt > (lastLocalWizardPersistAtRef.current || 0)
    ) {
      const noticeKey = `${activeJobDetails.id}:${remoteUpdatedAt}:${remoteSessionId}`;
      if (lastCrossTabNoticeRef.current !== noticeKey) {
        lastCrossTabNoticeRef.current = noticeKey;
        toast({
          title: uiCopy.wizardStateUpdatedTitle,
          description: uiCopy.wizardStateUpdatedDescription,
        });
      }
    }

    const restoredIncludePodcastTranslation =
      typeof wizardState.includePodcastTranslation === 'boolean'
        ? wizardState.includePodcastTranslation
        : includePodcastTranslation;
    const restoredVisibleSteps = buildVisibleWizardSteps({
      includePptx: translationSelection.includePptx,
      sourceHasPodcast,
      includePodcastTranslation: restoredIncludePodcastTranslation,
    });

    const persistedStep = String(wizardState.parentStep || '').trim();
    if ((ALL_STEPS as string[]).includes(persistedStep)) {
      let normalizedPersistedStep: WizardStep = 'select_language';
      if (restoredVisibleSteps.includes(persistedStep as WizardStep)) {
        normalizedPersistedStep = persistedStep as WizardStep;
      } else if (persistedStep === 'pptx') {
        normalizedPersistedStep = sourceHasPodcast && restoredIncludePodcastTranslation ? 'podcast' : 'complete';
      } else if (persistedStep === 'podcast') {
        normalizedPersistedStep = 'complete';
      }
      if (currentStep !== normalizedPersistedStep) {
        setCurrentStep(normalizedPersistedStep);
      }
    }

    if (typeof wizardState.includePodcastTranslation === 'boolean') {
      setIncludePodcastTranslation(wizardState.includePodcastTranslation);
    }

    if (wizardState.podcast && typeof wizardState.podcast === 'object') {
      setPersistedPodcastWizardState(wizardState.podcast);
      setPodcastDraftState((prev) => ({ ...prev, ...wizardState.podcast }));
    }

    lastAppliedWizardStateRef.current = restoreKey;
  }, [showLanding, activeJobDetails?.id, activeJobDetails?.translationPackage?.wizardState, selectedLanguage, currentStep, toast, sourceHasPodcast, includePodcastTranslation, translationSelection.includePptx]);

  const persistWizardStateMutation = useMutation({
    mutationFn: async (payload: {
      organizationId: string;
      targetLanguageCode: string;
      translatedLessonId: string;
      translationJobId?: string | null;
      wizardState: Record<string, any>;
    }) => apiRequest(`/api/lessons/${lessonId}/translation-wizard-state`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSettled: () => {
      const queuedPayload = pendingWizardPersistRef.current;
      if (!queuedPayload) return;
      pendingWizardPersistRef.current = null;
      persistWizardStateMutation.mutate(queuedPayload);
    },
    onError: (error: any) => {
      const message = String(error?.message || '');
      const isPermissionProblem = /access denied|organization mismatch|403/i.test(message);
      if (!isPermissionProblem) return;
      const key = `${selectedLanguage || 'none'}:${translatedLessonId || 'none'}:${message}`;
      if (persistStateErrorNoticeRef.current === key) return;
      persistStateErrorNoticeRef.current = key;
      toast({
        title: uiCopy.wizardStateSaveFailedTitle,
        description: uiCopy.wizardStateSaveFailedDescription,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (showLanding) return;
    if (!organizationId || !selectedLanguage || !translatedLessonId) return;

    if (persistWizardStateTimerRef.current) {
      window.clearTimeout(persistWizardStateTimerRef.current);
    }

    const activeJobId = translationJobId || selectedLanguageJob?.id || null;
    persistWizardStateTimerRef.current = window.setTimeout(() => {
      const remoteWizardState = activeJobDetails?.translationPackage?.wizardState;
      if (remoteWizardState && typeof remoteWizardState === 'object') {
        const remoteSessionId = String((remoteWizardState as any).clientSessionId || '').trim();
        const remoteUpdatedAtRaw = String((remoteWizardState as any).updatedAt || '').trim();
        const remoteUpdatedAt = remoteUpdatedAtRaw ? new Date(remoteUpdatedAtRaw).getTime() : 0;
        if (
          remoteSessionId &&
          remoteSessionId !== clientSessionIdRef.current &&
          remoteUpdatedAt > (lastLocalWizardPersistAtRef.current || 0)
        ) {
          return;
        }
      }
      const payload = {
        organizationId,
        targetLanguageCode: selectedLanguage,
        translatedLessonId,
        translationJobId: activeJobId ? String(activeJobId) : null,
        wizardState: {
          version: 1,
          clientSessionId: clientSessionIdRef.current,
          parentStep: currentStep,
          includePodcastTranslation,
          targetLanguageCode: selectedLanguage,
          translatedLessonId,
          podcast: podcastDraftState,
        },
      };
      lastLocalWizardPersistAtRef.current = Date.now();
      if (persistWizardStateMutation.isPending) {
        pendingWizardPersistRef.current = payload;
        return;
      }
      persistWizardStateMutation.mutate(payload);
    }, 500);

    return () => {
      if (persistWizardStateTimerRef.current) {
        window.clearTimeout(persistWizardStateTimerRef.current);
        persistWizardStateTimerRef.current = null;
      }
    };
  }, [
    showLanding,
    organizationId,
    selectedLanguage,
    translatedLessonId,
    translationJobId,
    selectedLanguageJob?.id,
    currentStep,
    includePodcastTranslation,
    podcastDraftState,
    persistWizardStateMutation.isPending,
    activeJobDetails?.translationPackage?.wizardState,
  ]);

  useEffect(() => {
    if (showLanding) return;
    const key = `${currentStep}:${selectedLanguage || 'none'}:${translatedLessonId || 'none'}`;
    if (lastTrackedStepRef.current === key) return;
    lastTrackedStepRef.current = key;
    void trackFunnelEvent('translation_step_viewed', {
      includePodcastTranslation,
      sourceHasPodcast,
    });
  }, [currentStep, selectedLanguage, translatedLessonId, showLanding, includePodcastTranslation, sourceHasPodcast]);

  const isInlinePodcastNavOwned = currentStep === 'podcast' && sourceHasPodcast && includePodcastTranslation && enhancedInlinePodcastUxEnabled;

  useEffect(() => {
    if (!isInlinePodcastNavOwned) return;
    void trackFunnelEvent('podcast_parent_next_disabled_viewed', {
      reason: 'inline_podcast_flow_owns_navigation',
      sourceHasPodcast,
      includePodcastTranslation,
      hasPreparedScript: podcastInlineState.hasPreparedScript,
      hasTriggeredGeneration: podcastInlineState.hasTriggeredGeneration,
      hasCompletedAudio: podcastInlineState.hasCompletedAudio,
    });
  }, [
    isInlinePodcastNavOwned,
    sourceHasPodcast,
    includePodcastTranslation,
    podcastInlineState.hasPreparedScript,
    podcastInlineState.hasTriggeredGeneration,
    podcastInlineState.hasCompletedAudio,
  ]);

  const translateMutation = useMutation({
    mutationFn: async () => {
      const activePodcastVersion = sourcePodcastState?.activeVersion || null;
      return await apiRequest(`/api/lessons/${lessonId}/translate`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          targetLanguageCode: effectiveTargetLanguage,
          translationOptions: {
            ...translationSelection,
            includePodcastScript: translationSelection.includePodcastScript || translationSelection.includePodcastAudio,
            includePodcastInNextStep: includePodcastTranslation && sourceHasPodcast,
            targetLanguageByArtifact: artifactLanguageMap,
            retranslateExistingTargetLanguage: retranslateExisting,
          },
          podcastConfig: {
            sourceType: activePodcastVersion?.sourceType || 'sourcedb',
            voiceId: activePodcastVersion?.voiceId,
            guestVoiceId: activePodcastVersion?.guestVoiceId,
            format: activePodcastVersion?.format,
            duration: activePodcastVersion?.duration,
            hostDisplayName: activePodcastVersion?.hostDisplayName,
            guestDisplayName: activePodcastVersion?.guestDisplayName,
          },
        }),
      });
    },
    onSuccess: (data: any) => {
      setHasTriggeredCurrentRun(true);
      setTranslatedLessonId(data.translatedLessonId);
      setTranslationJobId(data.jobId || null);
      setTranslatedQuizIds(data.translatedQuizIds || []);
      setCreditsCharged(prev => prev + (data.creditsCharged || 0));

      if (data.status === 'translating') {
        setIsTranslating(true);
        toast({
          title: 'Translation Started',
          description: `AI translation is processing in the background. ${data.creditsCharged || 0} ${LP_CREDITS_SHORT} charged.`,
        });
      } else {
        setIsTranslating(false);
        setCurrentStep('review_edit');
        toast({
          title: 'Translation Complete',
          description: `Lesson translated successfully. ${data.creditsCharged || 0} ${LP_CREDITS_SHORT} charged.`,
        });
      }

      invalidateTranslationCaches(data?.targetLanguageCode || effectiveTargetLanguage || null);
      invalidateWalletCaches();
      void trackFunnelEvent('translation_ai_started', {
        selectedContentCount,
        estimatedSelectedCredits,
        includePodcastTranslation,
      });
    },
    onError: (err: any) => {
      setIsTranslating(false);
      const msg = err.message || 'Translation failed';
      setError(msg);
      if (err?.statusCode === 429 && err?.jobId && err?.translatedLessonId) {
        setHasTriggeredCurrentRun(true);
        setTranslationJobId(String(err.jobId));
        setTranslatedLessonId(String(err.translatedLessonId));
        setCurrentStep('translate_content');
        setError(null);
        toast({
          title: 'Translation Already Running',
          description: 'A translation is already in progress for this lesson and language. Resuming that run.',
        });
      } else if (msg.includes('402') || msg.includes('Insufficient credits') || err?.status === 402 || err?.statusCode === 402) {
        setHasTriggeredCurrentRun(false);
        toast({
          title: 'Insufficient Credits',
          description: 'You do not have enough credits for this translation. Please purchase more credits.',
          variant: 'destructive',
        });
      } else {
        setHasTriggeredCurrentRun(false);
        toast({
          title: 'Translation Failed',
          description: msg,
          variant: 'destructive',
        });
      }
    },
  });


  const createDraftMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/lessons/${lessonId}/create-translation-draft`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          targetLanguageCode: selectedLanguage,
        }),
      });
    },
    onSuccess: (data: any) => {
      setHasTriggeredCurrentRun(true);
      setTranslatedLessonId(data.translatedLessonId);
      setTranslationJobId(null);
      setTranslatedQuizIds(data.translatedQuizIds || []);
      setCreditsCharged(prev => prev + 0);
      setIsTranslating(false);
      setCurrentStep('review_edit');
      invalidateTranslationCaches(data?.targetLanguageCode || selectedLanguage || null);
      toast({
        title: 'Draft Created',
        description: `Translation draft created for free. You can now download, translate, and re-upload the content.`,
      });
      void trackFunnelEvent('translation_manual_draft_created', {
        selectedContentCount,
        includePodcastTranslation,
      });
    },
    onError: (err: any) => {
      setIsTranslating(false);
      setHasTriggeredCurrentRun(false);
      const msg = err.message || 'Failed to create translation draft';
      setError(msg);
      toast({
        title: 'Draft Creation Failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  const retryTranslationMutation = useMutation({
    mutationFn: async (opts?: { retryFailedOnly?: boolean }) => {
      return await apiRequest(`/api/lessons/${translatedLessonId}/retry-translation`, {
        method: 'POST',
        body: JSON.stringify({ organizationId, retryFailedOnly: opts?.retryFailedOnly === true }),
      });
    },
    onSuccess: (data: any) => {
      setHasTriggeredCurrentRun(true);
      setTranslationJobId(data.jobId || null);
      setIsTranslating(true);
      setError(null);
      setCreditsCharged(prev => prev + (data.creditsCharged || 0));
      toast({
        title: 'Retry Started',
        description: 'Translation retry is processing in the background.',
      });
      invalidateWalletCaches();
      invalidateTranslationCaches(selectedLanguage || null);
      void trackFunnelEvent('translation_retry_started', {
        retryFailedOnly: data?.retryMode === 'failed_only',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Retry Failed',
        description: err.message || 'Failed to retry translation',
        variant: 'destructive',
      });
    },
  });

  const cancelTranslationMutation = useMutation({
    mutationFn: async (payload?: { targetLanguageCode?: string; translationJobId?: string | null }) => {
      return await apiRequest(`/api/lessons/${lessonId}/cancel-translation`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          targetLanguageCode: payload?.targetLanguageCode || selectedLanguage || undefined,
          translationJobId: payload?.translationJobId || translationJobId || undefined,
        }),
      });
    },
    onSuccess: (data: any) => {
      const cancelledJobId = String(data?.jobId || '');
      const matchesCurrentJob = cancelledJobId && cancelledJobId === String(translationJobId || '');
      if (matchesCurrentJob || !translationJobId) {
        setIsTranslating(false);
        setTranslationJobId(null);
        setError('Translation cancelled. You can start over when ready.');
      }
      toast({
        title: 'Translation Cancelled',
        description: 'The active translation run has been stopped.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', 'all-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'translation-wizard-state', selectedLanguage, 'poll'] });
      void trackFunnelEvent('translation_cancelled', {
        cancelledJobId: data?.jobId || null,
        targetLanguageCode: data?.targetLanguageCode || selectedLanguage || null,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Cancel Failed',
        description: err.message || 'Failed to cancel translation',
        variant: 'destructive',
      });
    },
  });

  const handleAITranslate = () => {
    if (translateMutation.isPending || isTranslating) return;
    const selectedArtifacts = selectedArtifactKeys;
    if (selectedArtifacts.length === 0) {
      setError('Select at least one artifact to translate.');
      return;
    }
    if (!effectiveTargetLanguage) {
      setError('Select a target language to continue.');
      return;
    }
    if (hasMissingSelectedArtifactTargetLanguage) {
      setError('Select a target language for each selected artifact.');
      return;
    }
    if (hasMismatchedSelectedArtifactTargetLanguages) {
      setError('All selected artifacts must use the same target language in this run.');
      return;
    }
    if (quizSelectionMissing) {
      setError('Select at least one quiz item or disable quiz translation.');
      return;
    }
    if (!applyLanguageToAll) {
      const incompatible = selectedArtifacts.find((artifactKey) => {
        const artifactLang = String(artifactLanguageMap[artifactKey] || '').trim().toLowerCase();
        return !artifactLang || artifactLang !== effectiveTargetLanguage;
      });
      if (incompatible) {
        setError('All selected artifacts must use the same target language in this run.');
        return;
      }
    }
    if (!selectedLanguage && effectiveTargetLanguage) {
      setSelectedLanguage(effectiveTargetLanguage);
    }
    setIsTranslating(true);
    setError(null);
    setHasTriggeredCurrentRun(true);
    void trackFunnelEvent('translation_ai_start_clicked', {
      selectedContentCount,
      estimatedSelectedCredits,
    });
    translateMutation.mutate();
  };

  const handleManualTranslate = () => {
    if (createDraftMutation.isPending || isTranslating) return;
    setIsTranslating(true);
    setError(null);
    setHasTriggeredCurrentRun(true);
    void trackFunnelEvent('translation_manual_start_clicked', {
      selectedContentCount,
    });
    createDraftMutation.mutate();
  };

  const handleDownloadSourceContent = async () => {
    try {
      const response = await fetch(
        `/api/lessons/${lessonId}/export-content?organizationId=${organizationId}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to download source content');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lessonTitle}_source.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: 'Download Failed',
        description: err.message || 'Failed to download source content',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadTranslatedContent = async () => {
    if (!translatedLessonId) return;
    try {
      const response = await fetch(
        `/api/lessons/${translatedLessonId}/export-content?organizationId=${organizationId}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to download translated content');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lessonTitle}_${selectedLanguageName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: 'Download Failed',
        description: err.message || 'Failed to download translated content',
        variant: 'destructive',
      });
    }
  };

  const handleUploadTranslatedContent = async (file: File) => {
    if (!translatedLessonId) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organizationId', organizationId);

      const response = await fetch(
        `/api/lessons/${translatedLessonId}/upload-translated-content`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      );
      if (!response.ok) {
        const errData = await response.json();
        if (response.status === 409) {
          toast({
            title: 'Upload Blocked',
            description: errData.error || 'Cannot upload content while PPTX generation is in progress.',
            variant: 'destructive',
          });
          setError(errData.error || 'Upload blocked - generation in progress');
          return;
        }
        throw new Error(errData.message || errData.error || 'Upload failed');
      }
      toast({
        title: 'Content Uploaded',
        description: 'Translated content has been updated successfully.',
      });
      refetchVersions();
      invalidateTranslationCaches(selectedLanguage || null);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      toast({
        title: 'Upload Failed',
        description: err.message || 'Failed to upload translated content',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadPptx = async (file: File) => {
    if (!translatedLessonId) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organizationId', organizationId);

      const response = await fetch(
        `/api/lessons/${translatedLessonId}/upload-translated-pptx`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      );
      if (!response.ok) {
        const errData = await response.json();
        if (response.status === 409) {
          toast({
            title: 'Upload Blocked',
            description: errData.error || 'Cannot upload PPTX while generation is in progress.',
            variant: 'destructive',
          });
          setError(errData.error || 'Upload blocked - generation in progress');
          return;
        }
        throw new Error(errData.message || errData.error || 'Upload failed');
      }
      toast({
        title: 'PPTX Uploaded',
        description: 'Translated PPTX has been uploaded successfully.',
      });
      refetchVersions();
      invalidateTranslationCaches(selectedLanguage || null);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      toast({
        title: 'Upload Failed',
        description: err.message || 'Failed to upload PPTX',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const translateSourcePptxMutation = useMutation({
    mutationFn: async () => {
      if (!translatedLessonId) throw new Error('No translated lesson selected');
      return await apiRequest(`/api/lessons/${translatedLessonId}/translate-source-pptx`, {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Translated PPTX Created',
        description: `Created v${data.version} from source PPTX text translation and prepared viewer slides.`,
      });
      refetchVersions();
      invalidateTranslationCaches(selectedLanguage || null);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to translate source PPTX');
      toast({
        title: 'PPTX Translation Failed',
        description: err.message || 'Failed to translate source PPTX',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (currentStep !== 'pptx') return;
    if (!translatedLessonId) return;
    if (!translationSelection.includePptx) return;
    if (translationSelection.pptxMode !== 'translate_source') return;
    if (translateSourcePptxMutation.isPending) return;
    if ((pptxVersions || []).length > 0) return;
    const rawPptxStatus = String(displayArtifactStatuses?.pptx || '').trim().toLowerCase();
    if (!['queued', 'pending', 'processing'].includes(rawPptxStatus)) return;

    const triggerKey = `${translatedLessonId}:${selectedLanguage || 'none'}:${rawPptxStatus}`;
    if (autoTriggeredPptxRef.current === triggerKey) return;
    autoTriggeredPptxRef.current = triggerKey;
    translateSourcePptxMutation.mutate();
  }, [
    currentStep,
    translatedLessonId,
    translationSelection.includePptx,
    translationSelection.pptxMode,
    translateSourcePptxMutation.isPending,
    displayArtifactStatuses?.pptx,
    pptxVersions,
    selectedLanguage,
  ]);

  const hasProceedablePptxOutcome = useMemo(() => {
    if (!translationSelection.includePptx) return true;
    const pptxStatus = String(displayArtifactStatuses?.pptx || '').trim().toLowerCase();
    if (['completed', 'pptx_uploaded', 'uploaded'].includes(pptxStatus)) return true;
    return (pptxVersions?.length || 0) > 0;
  }, [translationSelection.includePptx, displayArtifactStatuses?.pptx, pptxVersions]);


  const handleClose = () => {
    setLocation(backUrl);
  };

  const handleNext = () => {
    if (currentStep === 'select_language') {
      if (!canProceed()) return;
      if (!selectedLanguage && effectiveTargetLanguage) {
        setSelectedLanguage(effectiveTargetLanguage);
      }
      setCurrentStep('translate_content');
      if (runMode === 'manual') {
        handleManualTranslate();
      } else {
        handleAITranslate();
      }
      return;
    }
    if (currentStep === 'review_edit') {
      setError(null);
      if (!translationSelection.includePptx) {
        if (sourceHasPodcast && includePodcastTranslation) {
          setCurrentStep('podcast');
        } else {
          setCurrentStep('complete');
        }
        return;
      }
      setCurrentStep('pptx');
      return;
    }
    if (currentStep === 'pptx') {
      setError(null);
      if (sourceHasPodcast && includePodcastTranslation) {
        setCurrentStep('podcast');
      } else {
        setCurrentStep('complete');
      }
      return;
    }
    if (currentStep === 'podcast') {
      setError(null);
      setCurrentStep('complete');
      return;
    }
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < visibleSteps.length) {
      setError(null);
      setCurrentStep(visibleSteps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setError(null);
      setCurrentStep(visibleSteps[prevIndex]);
    }
  };

  const handleArtifactAction = (item: {
    actionKey: string;
    targetStep?: WizardStep;
  }) => {
    if (item.actionKey === 'go_to_pptx') {
      setCurrentStep('pptx');
      return;
    }
    if (item.actionKey === 'go_to_podcast') {
      setCurrentStep('podcast');
      return;
    }
    if (item.actionKey === 'retry_failed_only') {
      retryTranslationMutation.mutate({ retryFailedOnly: true });
      return;
    }
    if (item.actionKey === 'refresh_source' || item.actionKey === 'restart_remediation') {
      handleRefreshFromLatestSource();
      return;
    }
    if (item.actionKey === 'wait_for_processing') {
      refetchTranslationJobStatus();
      refetchAllTranslationJobs();
      return;
    }
    if (item.targetStep) {
      setCurrentStep(item.targetStep);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'select_language':
        return canRunTranslationWithSelectedLanguages
          && selectedContentCount > 0
          && !quizSelectionMissing
          && (translationPreflight?.translatableArtifactsFound !== false);
      case 'translate_content':
        return hasTriggeredCurrentRun && !!translatedLessonId && !isTranslating;
      case 'review_edit':
        return !!translatedLessonId && !hasBlockingRemediationActions && !hasUnsettledRequiredArtifacts && !isActiveJobStillRunning;
      case 'podcast':
        if (!sourceHasPodcast || !includePodcastTranslation) return true;
        return podcastInlineState.hasTriggeredGeneration || podcastInlineState.hasCompletedAudio;
      case 'pptx':
        if (!translationSelection.includePptx) return true;
        return hasProceedablePptxOutcome;
      case 'complete':
        return false;
      default:
        return false;
    }
  };

  const getNextDisabledReason = (): string | null => {
    if (canProceed()) return null;
    switch (currentStep) {
      case 'select_language':
        if (!effectiveTargetLanguage) return uiCopy.selectLanguageToContinue;
        if (hasMissingSelectedArtifactTargetLanguage) return 'Select a target language for each selected artifact.';
        if (hasMismatchedSelectedArtifactTargetLanguages) return 'All selected artifacts must use the same target language in this run.';
        if (selectedContentCount === 0) return uiCopy.selectArtifactsToContinue;
        if (quizSelectionMissing) return uiCopy.selectQuizItemsToContinue;
        if (translationPreflight?.translatableArtifactsFound === false) {
          return translationPreflight?.blockers?.[0] || 'No translatable artifacts found yet';
        }
        return 'Complete the required selections to continue.';
      case 'translate_content':
        if (!hasTriggeredCurrentRun) return 'Start translation to continue.';
        return 'Wait for translation step to finish before continuing.';
      case 'review_edit':
        if (isActiveJobStillRunning) return 'Translation is still processing required artifacts.';
        if (hasUnsettledRequiredArtifacts) return 'Wait for all required artifact translations to settle before continuing.';
        return hasBlockingRemediationActions
          ? 'Complete required remediation actions listed above before continuing.'
          : 'Complete required review actions before continuing.';
      case 'podcast':
        return uiCopy.footerInlineNotice;
      case 'pptx': {
        if (!translationSelection.includePptx) return null;
        const pptxStatus = String(displayArtifactStatuses?.pptx || '').trim().toLowerCase();
        if (translateSourcePptxMutation.isPending || ['queued', 'pending', 'processing'].includes(pptxStatus)) {
          return 'Wait for PPTX translation to finish before continuing.';
        }
        if (pptxStatus === 'failed') {
          return 'PPTX translation failed. Complete a PPTX action on this step before continuing.';
        }
        if (hasProceedablePptxOutcome) return null;
        return 'Complete translated PPTX before continuing.';
      }
      default:
        return 'Complete this step to continue.';
    }
  };
  const nextDisabledReason = getNextDisabledReason();
  const selectStepCtaLabel = runMode === 'manual' ? 'Create Draft' : 'Start Translation Run';
  const selectStepBusy = runMode === 'manual' ? createDraftMutation.isPending : (translateMutation.isPending || isTranslating);
  const runLifecycleLabel = useMemo(() => {
    if (!hasTriggeredCurrentRun) return 'Not started';
    const explicit = String(activeJobDetails?.runState?.label || '').trim();
    if (explicit) return explicit;
    const phase = getRunPhase(activeJobDetails);
    if (phase === 'failed') return 'Failed';
    if (phase === 'completed') return 'Completed';
    if (phase === 'processing') return 'Processing';
    if (phase === 'awaiting_user') return 'Action required';
    if (phase === 'partial_failed') return 'Partial failure';
    if (phase === 'draft') return 'Draft';
    if (phase === 'queued') return 'Queued';
    return 'In progress';
  }, [hasTriggeredCurrentRun, activeJobDetails?.runState?.label, activeJobDetails?.currentStep, activeJobDetails?.status]);

  const breadcrumbNav = (
    <div className="mb-6">
      <Link to={backUrl}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Course Lessons
        </Button>
      </Link>
      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
        <Link to="/course-builder" className="hover:text-primary transition-colors">Course Builder</Link>
        <span>›</span>
        <Link to={backUrl} className="hover:text-primary transition-colors">{courseTitle}</Link>
        <span>›</span>
        <span className="text-foreground">Translate Lesson</span>
      </div>
    </div>
  );

  if (showLanding) {
    return (
      <QuizAdminLayout title="Translate Lesson" description={`Translating: ${lessonTitle}`}>
        {breadcrumbNav}

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Translate Lesson
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Translating: <span className="text-primary">{lessonTitle}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {deduplicatedJobs.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Existing Translations</h3>
                <div className="space-y-2">
                  {deduplicatedJobs.map((job) => (
                    (() => {
                      const hasStaleAssets = Object.values((job?.translationPackage?.staleMap || {}) as Record<string, any>)
                        .some((payload: any) => payload?.stale === true);
                      const phase = getRunPhase(job);
                      const needsRemediation = phase === 'failed'
                        || phase === 'partial_failed'
                        || hasStaleAssets;
                      const resumeLabel = phase === 'completed'
                        ? 'View'
                        : (needsRemediation ? 'Continue Remediation' : 'Resume');
                      return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{getLanguageName(job.targetLanguageCode)}</span>
                          {getStatusBadge(job)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleResumeJob(job)}
                        >
                          {resumeLabel}
                        </Button>
                        {phase === 'completed' && (
                          <Button variant="outline" size="sm" onClick={() => handleRetranslateExistingLanguage(job)}
                            disabled={translateMutation.isPending || isTranslating}
                          >
                            Re-translate
                          </Button>
                        )}
                        {isTranslationJobActive(job) && (
                          <Button variant="outline" size="sm" onClick={() => cancelTranslationMutation.mutate({
                              targetLanguageCode: job.targetLanguageCode,
                              translationJobId: job.id,
                            })}
                            disabled={cancelTranslationMutation.isPending}
                          >
                            {cancelTranslationMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                      );
                    })()
                  ))}
                </div>
              </section>
            )}

            {deduplicatedJobs.length > 0 && <Separator className="border-border" />}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">New Translation</h3>
              {targetLanguageOptions.length > 0 ? (
                <Button className="hover:opacity-90" onClick={handleStartNew} >
                  <Plus className="h-4 w-4 mr-2" />
                  Start or Update Translation
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No additional target languages are configured.
                </p>
              )}
            </section>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Translate Lesson" description={`Translating: ${lessonTitle}`}>
      {breadcrumbNav}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Translate Lesson
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Step {currentStepIndex + 1} of {visibleSteps.length}: {STEP_LABELS[currentStep]}
            {lessonTitle && (
              <span className="block mt-1 text-xs">
                Translating: <span className="text-primary">{lessonTitle}</span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between rounded border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Translation run status</span>
            <Badge variant="outline">{runLifecycleLabel}</Badge>
          </div>

          {error && currentStep !== 'translate_content' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="py-4 min-h-[300px]">
            {currentStep === 'select_language' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Globe className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Select Target Language</h3>
                    <p className="text-sm text-muted-foreground">Choose the language to translate this lesson into</p>
                  </div>
                </div>

                {isActiveJobStillRunning && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <AlertDescription className="text-sm text-muted-foreground">
                      Translation is still processing ({String(activeJobDetails?.runState?.label || activeJobDetails?.currentStep || activeJobDetails?.status || 'in progress')}).
                      Review actions will unlock when required artifacts settle.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  {retranslateExisting && (
                    <Alert>
                      <RefreshCw className="h-4 w-4" />
                      <AlertDescription>
                        Re-translate mode: this run will update the existing target-language translation using your current artifact selections.
                      </AlertDescription>
                    </Alert>
                  )}
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger className="bg-muted border-border text-foreground">
                      <SelectValue placeholder="Select target language" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLanguagesForSelection.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name} ({lang.nativeName}){activeLanguageCodes.has(lang.code) ? ' - update existing' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sourceLanguageCode && (
                    <p className="text-xs text-muted-foreground">
                      Source language: <Badge variant="outline" className="ml-1">{sourceLanguageCode}</Badge>
                    </p>
                  )}
                  {!effectiveTargetLanguage && (
                    <p className="text-xs text-warning">
                      Select a target language to continue.
                    </p>
                  )}
                </div>

                <Card className="bg-muted/40 border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Translation Scope Picker</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Select artifact type, exact source version, and target language mapping before execution.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {!translationPreflight?.translatableArtifactsFound && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {translationPreflight?.blockers?.[0] || 'No translatable artifacts found yet'}
                        </AlertDescription>
                      </Alert>
                    )}

                    <label className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                      <span className="text-xs text-muted-foreground">Apply one target language to all selected artifacts</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={applyLanguageToAll}
                        onChange={(e) => setApplyLanguageToAll(e.target.checked)}
                      />
                    </label>

                    {sourceHasPodcast && (
                      <label className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                        <div>
                          <span className="text-xs text-foreground font-medium">Include podcast translation and generation</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Optional. Decision is made here and carried through the wizard.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={includePodcastTranslation}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIncludePodcastTranslation(checked);
                            void trackFunnelEvent('podcast_option_toggled', { enabled: checked, location: 'select_language' });
                          }}
                        />
                      </label>
                    )}
                    <div className="rounded border border-border px-3 py-3">
                      <p className="text-xs font-medium text-foreground mb-2">Execution mode</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={runMode === 'ai' ? 'default' : 'outline'}
                          className="justify-start"
                          onClick={() => setRunMode('ai')}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Auto Run
                        </Button>
                        <Button
                          type="button"
                          variant={runMode === 'manual' ? 'default' : 'outline'}
                          className="justify-start"
                          onClick={() => setRunMode('manual')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Manual Draft
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {runMode === 'manual'
                          ? 'Creates a draft so you can upload your own translated content in the next step.'
                          : 'Starts one translation run for all selected artifacts and shows live per-artifact progress.'}
                      </p>
                    </div>

                    {artifactConfig.map((artifact) => {
                      const available = artifact.key === 'objectives'
                        ? true
                        : (translationPreflight?.availability?.[artifact.key] ?? false);
                      const checked = (translationSelection as any)[artifact.includeKey] === true;
                      const versions = (translationPreflight?.artifacts?.[artifact.key]?.versions || []) as Array<any>;
                      const selectedVersionId = artifact.versionKey ? (translationSelection as any)[artifact.versionKey] : '';
                      const languageValue = (artifactLanguageMap as any)[artifact.key] || selectedLanguage || '';

                      return (
                        <div key={artifact.key} className="rounded border border-border px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">
                              {artifact.label}
                              {artifact.key === 'quiz' && linkedQuizCount > 0 ? ` (${linkedQuizCount})` : ''}
                            </span>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              onChange={(e) => {
                                const value = e.target.checked;
                                setTranslationSelection((prev) => ({ ...prev, [artifact.includeKey]: value } as any));
                              }}
                            />
                          </div>

                          {checked && artifact.versionKey && versions.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Selected source version</p>
                              <Select
                                value={selectedVersionId || String(versions[0]?.id || '')}
                                onValueChange={(value) =>
                                  setTranslationSelection((prev) => ({ ...prev, [artifact.versionKey]: value } as any))
                                }
                              >
                                <SelectTrigger className="bg-background border-border h-9">
                                  <SelectValue placeholder="Select version" />
                                </SelectTrigger>
                                <SelectContent>
                                  {versions.map((version: any) => (
                                    <SelectItem key={String(version.id)} value={String(version.id)}>
                                      {String(version.label || version.id)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {checked && artifact.key === 'quiz' && versions.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-muted-foreground">Quiz items</p>
                              {versions.map((quiz: any) => {
                                const selected = translationSelection.selectedQuizIds.includes(String(quiz.id));
                                return (
                                  <label key={String(quiz.id)} className="flex items-center justify-between rounded border border-border/60 px-2 py-1 text-xs">
                                    <span className="truncate pr-2">{quiz.label}</span>
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5"
                                      checked={selected}
                                      onChange={(e) => {
                                        const value = e.target.checked;
                                        setTranslationSelection((prev) => ({
                                          ...prev,
                                          selectedQuizIds: value
                                            ? Array.from(new Set([...prev.selectedQuizIds, String(quiz.id)]))
                                            : prev.selectedQuizIds.filter((id) => String(id) !== String(quiz.id)),
                                        }));
                                      }}
                                    />
                                  </label>
                                );
                              })}
                              {quizSelectionMissing && (
                                <p className="text-xs text-warning">Select at least one quiz item or turn quiz translation off.</p>
                              )}
                            </div>
                          )}

                          {checked && !applyLanguageToAll && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Target language for this artifact</p>
                              <Select
                                value={languageValue || selectedLanguage}
                                onValueChange={(value) => setArtifactLanguageMap((prev) => ({ ...prev, [artifact.key]: value }))}
                              >
                                <SelectTrigger className="bg-background border-border h-9">
                                  <SelectValue placeholder="Select target language" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(supportedLanguages || []).map((lang) => (
                                    <SelectItem key={lang.code} value={lang.code}>
                                      {lang.name} ({lang.nativeName})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {translationSelection.includePptx && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <Button type="button" variant={translationSelection.pptxMode === 'translate_source' ? 'default' : 'outline'} className="justify-start" onClick={() => setTranslationSelection((prev) => ({ ...prev, pptxMode: 'translate_source' }))}
                        >
                          Translate source PPTX text
                        </Button>
                        <Button type="button" variant={translationSelection.pptxMode === 'generate_new' ? 'default' : 'outline'} className="justify-start" onClick={() => setTranslationSelection((prev) => ({ ...prev, pptxMode: 'generate_new' }))}
                        >
                          Generate new translated PPTX
                        </Button>
                      </div>
                    )}

                    {selectedContentCount === 0 && (
                      <p className="text-xs text-destructive">Select at least one artifact to continue.</p>
                    )}
                    {quizSelectionMissing && (
                      <p className="text-xs text-warning">Quiz translation is selected but no quiz items are selected.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-muted/30 border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">What Will Be Translated</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {selectedArtifactSummary.length === 0 ? (
                      <p className="text-muted-foreground">No artifacts selected yet.</p>
                    ) : (
                      selectedArtifactSummary.map((item) => (
                        <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-muted-foreground">{item.version}</span>
                          <Badge variant="outline">
                            {item.language || selectedLanguage
                              ? String(item.language || selectedLanguage).toUpperCase()
                              : 'Select target language'}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Separator className="border-border" />

                <Card className="bg-muted/50 border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Coins className="h-4 w-4 text-primary" />
                      Cost Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lesson core bundle ({lessonCoreSelectedLabels || 'none selected'})</span>
                      <span className="text-primary font-medium">{includeLessonCoreBillable ? lessonCredits : 0} {LP_CREDITS_SHORT}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quiz translation ({selectedQuizCount} selected × {quizCredits})</span>
                      <span className="text-primary font-medium">{translationSelection.includeQuiz ? selectedQuizCount * quizCredits : 0} {LP_CREDITS_SHORT}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PPTX generation ({translationSelection.includePptx && translationSelection.pptxMode === 'generate_new' ? 'selected' : 'not selected'})</span>
                      <span className="text-primary font-medium">{translationSelection.includePptx && translationSelection.pptxMode === 'generate_new' ? pptxCredits : 0} {LP_CREDITS_SHORT}</span>
                    </div>
                    <Separator className="border-border" />
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-foreground">Estimated selected total</span>
                      <span className="text-primary">{estimatedSelectedCredits} {LP_CREDITS_SHORT}</span>
                    </div>
                    <p className="text-xs text-muted-foreground italic">Included in this run at no extra credit cost: digest, podcast script translation, source PPTX text translation, manual uploads.</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {currentStep === 'translate_content' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Translate Content</h3>
                    <p className="text-sm text-muted-foreground">
                      Translating to <Badge variant="outline" >{selectedLanguageName}</Badge>
                    </p>
                  </div>
                </div>

                {hasTriggeredCurrentRun && translatedLessonId && isTranslating ? (
                  <Card className="bg-muted/50 border-border">
                    <CardContent className="pt-6 text-center space-y-4">
                      <Loader2 className="h-12 w-12 text-primary mx-auto animate-spin" />
                      <h4 className="text-lg font-semibold text-foreground">Translation In Progress...</h4>
                      <p className="text-sm text-muted-foreground">
                        AI is translating your lesson content and quizzes to {selectedLanguageName}.
                        This typically takes 30-60 seconds.
                      </p>
                      <p className="text-xs text-primary font-medium">
                        You can leave this page and come back later. Your progress is saved.
                      </p>
                      <div className="flex justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                            refetchTranslationJobStatus();
                            refetchAllTranslationJobs();
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-2" />
                          Refresh status
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => cancelTranslationMutation.mutate({
                            targetLanguageCode: selectedLanguage || undefined,
                            translationJobId: activeJobDetails?.id ? String(activeJobDetails.id) : null,
                          })}
                          disabled={cancelTranslationMutation.isPending}
                        >
                          {cancelTranslationMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          ) : null}
                          Cancel translation
                        </Button>
                      </div>
                      {creditsCharged > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {creditsCharged} {LP_CREDITS_SHORT} charged
                        </p>
                      )}
                      {Object.keys(artifactStatuses).length > 0 && (
                        <div className="text-left text-xs rounded-md border border-border/60 bg-background/40 p-3 space-y-1">
                          {activeJobDetails?.progressByArtifact && (
                            <div className="mb-2 text-[11px] text-muted-foreground">
                              Progress: {activeJobDetails.progressByArtifact.completed}/{activeJobDetails.progressByArtifact.total} completed,
                              {` `}{activeJobDetails.progressByArtifact.failed} failed
                            </div>
                          )}
                          {primaryArtifactStatusEntries.map(([asset, status]) => (
                            <div key={asset} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="capitalize">{artifactLabelByKey[asset] || asset}</span>
                                {String(status) === 'skipped' && artifactMessages?.[asset] && (
                                  <p className="text-[11px] text-muted-foreground">{artifactMessages[asset]}</p>
                                )}
                              </div>
                              <Badge variant="outline" className="uppercase shrink-0">
                                {normalizeArtifactStatusLabel(String(status))}
                              </Badge>
                            </div>
                          ))}
                          {deferredOptionalArtifactEntries.length > 0 && (
                            <div className="mt-2 rounded border border-border bg-muted/40 p-2 space-y-1">
                              <p className="text-[11px] font-medium text-foreground">Deferred To Optional Podcast Step</p>
                              {deferredOptionalArtifactEntries.map(([asset, status]) => (
                                <div key={asset} className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <span className="capitalize">{artifactLabelByKey[asset] || asset}</span>
                                    <p className="text-[11px] text-muted-foreground">
                                      {artifactMessages?.[asset] || 'Will continue in the optional podcast step if enabled.'}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="uppercase shrink-0">
                                    {normalizeArtifactStatusLabel(String(status))}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : error && hasTriggeredCurrentRun && translatedLessonId && !isTranslating ? (
                  <Card className="bg-destructive/10 border-destructive/30">
                    <CardContent className="pt-6 text-center space-y-3">
                      <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
                      <h4 className="text-lg font-semibold text-foreground">Translation Failed</h4>
                      <p className="text-sm text-muted-foreground">{error}</p>
                      <p className="text-xs text-muted-foreground">Your credits have been refunded.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="outline" onClick={() => retryTranslationMutation.mutate({})}
                          disabled={retryTranslationMutation.isPending}
                        >
                          {retryTranslationMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Retry Translation
                        </Button>
                        {failedArtifactKeys.length > 0 && (
                          <Button variant="outline" onClick={() => retryTranslationMutation.mutate({ retryFailedOnly: true })}
                            disabled={retryTranslationMutation.isPending}
                          >
                            Retry Failed Only
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : error && !translatedLessonId ? (
                  <Card className="bg-destructive/10 border-destructive/30">
                    <CardContent className="pt-6 text-center space-y-3">
                      <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
                      <h4 className="text-lg font-semibold text-foreground">Translation Failed</h4>
                      <p className="text-sm text-muted-foreground">{error}</p>
                      <Button variant="outline" onClick={() => {
                          setError(null);
                        }}
                      >
                        Try Again
                      </Button>
                    </CardContent>
                  </Card>
                ) : hasTriggeredCurrentRun && translatedLessonId ? (
                  <Card className="bg-success/10 border-success/30">
                    <CardContent className="pt-6 text-center space-y-3">
                      <Check className="h-12 w-12 text-success mx-auto" />
                      <h4 className="text-lg font-semibold text-foreground">Translation Complete!</h4>
                      <p className="text-sm text-muted-foreground">
                        {creditsCharged} {LP_CREDITS_SHORT} charged. You can review and edit the translation in the next step.
                      </p>
                      {translatedQuizIds.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {translatedQuizIds.length} quiz{translatedQuizIds.length > 1 ? 'zes' : ''} also translated
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card
                      className={`cursor-pointer transition-all hover:border-border bg-muted/50 border-border ${isTranslating ? 'opacity-75 pointer-events-none' : ''}`}
                      onClick={handleAITranslate}
                    >
                      <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                          {isTranslating ? (
                            <Loader2 className="h-6 w-6 text-primary animate-spin" />
                          ) : (
                            <Sparkles className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <CardTitle className="text-base">AI Translate</CardTitle>
                        <CardDescription className="text-muted-foreground">
                          {isTranslating
                            ? 'Translating... This may take a moment.'
                            : `Automatically translate selected artifacts (${estimatedSelectedCredits} ${LP_CREDITS_SHORT})`}
                        </CardDescription>
                      </CardHeader>
                    </Card>

                    <Card className="bg-muted/50 border-border">
                      <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                          <Download className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-base">Translate Manually</CardTitle>
                        <CardDescription className="text-muted-foreground">
                          Download source content, translate yourself, and upload in the next step
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Button variant="outline" className="w-full" onClick={handleDownloadSourceContent} >
                          <Download className="h-4 w-4 mr-2" />
                          Download Source Content
                        </Button>
                        <p className="text-xs text-muted-foreground text-center italic">
                          Free — creates a draft record so you can upload your own translation.
                        </p>
                        <Button variant="outline" className="w-full" onClick={handleManualTranslate} disabled={isTranslating} >
                          {isTranslating ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4 mr-2" />
                          )}
                          Create Draft & Continue
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {currentStep === 'review_edit' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Review & Edit Translation</h3>
                    <p className="text-sm text-muted-foreground">Download, edit, and re-upload the translated content</p>
                  </div>
                </div>

                {artifactActionPlan.length > 0 && (
                  <Card className="bg-muted/40 border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Next Remediation Actions</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Follow these actions to resolve remaining translation gaps for selected artifacts.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {artifactActionPlan.map((item, idx) => (
                        <div
                          key={`artifact-action-${item.asset}-${item.actionKey}-${idx}`}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border border-border/60 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">
                              {item.asset} • {normalizeArtifactStatusLabel(String(item.status || ''))}
                              {item.isBlocking ? ' • Required' : ' • Optional'}
                            </p>
                            {item.actionHint && (
                              <p className="text-xs text-muted-foreground">{item.actionHint}</p>
                            )}
                          </div>
                          <Button size="sm" variant={item.isBlocking ? 'default' : 'outline'} onClick={() => handleArtifactAction(item)}
                            disabled={retryTranslationMutation.isPending}
                            className="self-start sm:self-auto"
                          >
                            {item.actionLabel}
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {Object.keys(artifactStatuses).length > 0 && (
                    <div className="md:col-span-2 rounded border border-border bg-muted/30 p-3 space-y-2">
                      <div className="text-sm font-medium">Artifact Translation Results</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {primaryArtifactStatusEntries.map(([asset, status]) => (
                          <div key={asset} className="flex items-start justify-between rounded border border-border/60 px-2 py-1 text-xs gap-2">
                            <div className="min-w-0">
                              <span className="capitalize">{artifactLabelByKey[asset] || asset}</span>
                              {String(status) === 'skipped' && artifactMessages?.[asset] && (
                                <p className="text-[11px] text-muted-foreground">{artifactMessages[asset]}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="uppercase">
                              {normalizeArtifactStatusLabel(String(status))}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      {deferredOptionalArtifactEntries.length > 0 && (
                        <div className="rounded border border-border bg-muted/40 p-2 space-y-2">
                          <div className="text-xs font-medium text-foreground">Deferred To Optional Podcast Step</div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {deferredOptionalArtifactEntries.map(([asset, status]) => (
                              <div key={asset} className="flex items-start justify-between rounded border border-border px-2 py-1 text-xs gap-2">
                                <div className="min-w-0">
                                  <span className="capitalize">{artifactLabelByKey[asset] || asset}</span>
                                  <p className="text-[11px] text-muted-foreground">
                                    {artifactMessages?.[asset] || 'Will continue in the optional podcast step if enabled.'}
                                  </p>
                                </div>
                                <Badge variant="outline" className="uppercase">
                                  {normalizeArtifactStatusLabel(String(status))}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {failedArtifactKeys.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-destructive">Some artifacts failed: {failedArtifactKeys.join(', ')}</span>
                          <Button size="sm" variant="outline" onClick={() => retryTranslationMutation.mutate({ retryFailedOnly: true })}
                            disabled={retryTranslationMutation.isPending}
                          >
                            Retry failed only
                          </Button>
                        </div>
                      )}
                      {staleArtifactKeys.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-warning">
                            Source changed after translation for: {staleArtifactKeys.join(', ')}. Refresh translation before publishing.
                          </span>
                          <Button size="sm" variant="outline" onClick={handleRefreshFromLatestSource} >
                            Refresh From Latest Source
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <Button variant="outline" className="h-auto py-4" onClick={handleDownloadTranslatedContent} >
                    <div className="flex flex-col items-center gap-2">
                      <Download className="h-6 w-6" />
                      <span>Download as Word Document</span>
                      <span className="text-xs text-muted-foreground">Review and edit offline</span>
                    </div>
                  </Button>

                  <Button variant="outline" className="h-auto py-4" onClick={() => editDocxInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <div className="flex flex-col items-center gap-2">
                      {isUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <Upload className="h-6 w-6" />
                      )}
                      <span>{isUploading ? 'Uploading...' : 'Upload Edited Document'}</span>
                      <span className="text-xs text-muted-foreground">.docx format</span>
                    </div>
                  </Button>
                </div>

                <input
                  ref={editDocxInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadTranslatedContent(file);
                    if (editDocxInputRef.current) editDocxInputRef.current.value = '';
                  }}
                />

                <Collapsible open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-primary hover:text-foreground transition-colors w-full">
                    {versionHistoryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <History className="h-4 w-4" />
                    Version History
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <ScrollArea className="max-h-48">
                      {textVersions.length > 0 ? (
                        <div className="space-y-2">
                          {textVersions.map((version) => (
                            <div key={version.id} className="flex items-center justify-between p-2 rounded bg-muted/50 border border-border text-sm">
                              <div>
                                <span className="text-foreground font-medium">v{version.versionNumber}</span>
                                {version.changeDescription && (
                                  <span className="text-muted-foreground ml-2">— {version.changeDescription}</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(version.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No edited text versions yet. Version history appears after upload/edit revisions.</p>
                      )}
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>

                {sourceHasPodcast && translatedLessonId && (
                  <Alert>
                    <AlertCircle className="h-4 w-4 text-primary" />
                    <AlertDescription className="text-sm text-muted-foreground">
                      Podcast translation is {includePodcastTranslation ? 'enabled' : 'disabled'} for this run (set on Step 1).
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {currentStep === 'podcast' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Globe className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Podcast (Optional)</h3>
                    <p className="text-sm text-muted-foreground">Translate and generate podcast audio without leaving this wizard</p>
                  </div>
                </div>

                {sourceHasPodcast && translatedLessonId ? (
                  <div className="space-y-4">
                    {hasPodcastSourceDrift && (
                      <Alert >
                        <AlertCircle className="h-4 w-4 text-primary" />
                        <AlertDescription className="text-foreground text-sm flex items-center justify-between gap-3">
                          <span>{uiCopy.stalePodcastWarning}</span>
                          <Button size="sm" variant="outline" onClick={handleRefreshFromLatestSource}>Refresh</Button>
                        </AlertDescription>
                      </Alert>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Podcast translation was configured on Step 1 and is currently enabled for this run.
                    </p>

                    {includePodcastTranslation ? (
                      <InlinePodcastTranslationStep
                        sourceLessonId={lessonId || ''}
                        translatedLessonId={translatedLessonId}
                        organizationId={organizationId}
                        courseId={courseId}
                        targetLanguageCode={selectedLanguage}
                        targetLanguageName={selectedLanguageName || selectedLanguage}
                        sourceLanguageCode={sourceLanguageCode}
                        funnelContext={{
                          translationJobId,
                          orchestrationCorrelationId: translationJobId
                            ? `translation-job-${translationJobId}`
                            : `translation-lesson-${translatedLessonId}`,
                          onTrackFunnelEvent: (eventName: string, details?: Record<string, any>) =>
                            trackFunnelEvent(eventName, details),
                        }}
                        sourceContractChanged={hasPodcastSourceDrift}
                        onRequestSourceRefresh={handleRefreshFromLatestSource}
                        enhancedUxEnabled={enhancedInlinePodcastUxEnabled}
                        persistedState={persistedPodcastWizardState}
                        onPersistStateChange={setPodcastDraftState}
                        onCompletionStateChange={setPodcastInlineState}
                      />
                    ) : (
                      <Card className="bg-muted/30 border-border">
                        <CardContent className="pt-6 space-y-2">
                          <p className="text-sm text-foreground">Podcast step will be skipped for this translation run.</p>
                          <p className="text-xs text-muted-foreground">You can still use the standalone podcast studio from lesson actions later.</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card className="bg-muted/30 border-border">
                    <CardContent className="pt-6 space-y-2">
                      <p className="text-sm text-foreground">No source podcast artifacts were found for this lesson.</p>
                      <p className="text-xs text-muted-foreground">We will skip podcast translation and continue with lesson artifact flow.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {currentStep === 'pptx' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <FileUp className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Presentation (PPTX)</h3>
                    <p className="text-sm text-muted-foreground">Upload or generate a translated PPTX presentation</p>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm text-muted-foreground">
                    PPTX status: <span className="font-medium text-foreground">{normalizeArtifactStatusLabel(String(displayArtifactStatuses?.pptx || 'pending'))}</span>
                    {translateSourcePptxMutation.isPending ? ' • Translating source text now.' : ''}
                    {(pptxVersions?.length || 0) > 0 ? ` • ${pptxVersions.length} version(s) available.` : ''}
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card
                    className="cursor-pointer transition-all hover:border-border bg-muted/50 border-border"
                    onClick={() => pptxInputRef.current?.click()}
                  >
                    <CardHeader className="text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                        {isUploading ? (
                          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <CardTitle className="text-base">Upload PPTX</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Upload your own translated presentation (Free)
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card
                    className="cursor-pointer transition-all hover:border-border bg-muted/50 border-border"
                    onClick={() => setLocation(`/lessons/new?org=${organizationId}&lessonId=${translatedLessonId}&courseId=${courseId}&returnToCourse=true&returnTo=${encodeURIComponent(backUrl)}`)}
                  >
                    <CardHeader className="text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                        <Wand2 className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-base">Generate with AI</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Full lesson generation experience with AI
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:border-border bg-muted/50 border-border ${translateSourcePptxMutation.isPending ? 'opacity-75 pointer-events-none' : ''}`}
                    onClick={() => translateSourcePptxMutation.mutate()}
                  >
                    <CardHeader className="text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                        {translateSourcePptxMutation.isPending ? (
                          <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        ) : (
                          <FileText className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <CardTitle className="text-base">Translate Source PPTX Text</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Preserve the existing presentation design and translate only text content
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>

                <input
                  ref={pptxInputRef}
                  type="file"
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadPptx(file);
                    if (pptxInputRef.current) pptxInputRef.current.value = '';
                  }}
                />

                <Collapsible open={pptxVersionHistoryOpen} onOpenChange={setPptxVersionHistoryOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-primary hover:text-foreground transition-colors w-full">
                    {pptxVersionHistoryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <History className="h-4 w-4" />
                    PPTX Version History
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <ScrollArea className="max-h-48">
                      {pptxVersions.length > 0 ? (
                        <div className="space-y-2">
                          {pptxVersions.map((version) => (
                            <div key={version.id} className="flex items-center justify-between p-2 rounded bg-muted/50 border border-border text-sm">
                              <div>
                                <span className="text-foreground font-medium">v{version.version}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(version.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No PPTX version history available</p>
                      )}
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>

                <div className="text-center">
                  <Button variant="ghost" onClick={() => setCurrentStep('complete')}
                  >
                    Skip PPTX →
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 'complete' && (
              <div className="space-y-6 text-center py-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="h-8 w-8 text-success" />
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground">Translation Complete!</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Your lesson has been translated successfully.
                  </p>
                </div>

                <Card className="bg-muted/50 border-border text-left">
                  <CardContent className="pt-6 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Language</span>
                      <span className="text-foreground font-medium">{selectedLanguageName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credits Used</span>
                      <span className="text-primary font-medium">{creditsCharged} {LP_CREDITS_SHORT}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline" >DRAFT</Badge>
                    </div>
                    {translatedQuizIds.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Quizzes Translated</span>
                        <span className="text-foreground">{translatedQuizIds.length}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Alert className="text-left">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-muted-foreground text-sm">
                    This translation is saved as a draft. Publish it from the lesson list when ready.
                  </AlertDescription>
                </Alert>

                {sourceHasPodcast && (
                  <Alert className="text-left">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    <AlertDescription className="text-muted-foreground text-sm">
                      Podcast translation and generation is now part of this same wizard flow.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <div>
              {currentStepIndex > 0 && currentStep !== 'complete' && (
                <Button variant="outline" onClick={handleBack} >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {currentStep === 'complete' ? (
                <>
                  <Button variant="outline" onClick={handleBackToLanding} >
                    <Globe className="h-4 w-4 mr-2" />
                    Translate to Another Language
                  </Button>
                  <Button onClick={handleClose} className="hover:opacity-90">
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={handleClose} >
                    Cancel
                  </Button>
                  {isInlinePodcastNavOwned ? (
                    <div className="text-xs text-muted-foreground px-2 py-1 rounded border border-border bg-muted/30" role="status" aria-live="polite">
                      {uiCopy.footerInlineNotice}
                    </div>
                  ) : currentStep !== 'translate_content' && (
                    <div className="flex items-center gap-2">
                      {!canProceed() && nextDisabledReason && (
                        <p className="text-xs text-muted-foreground max-w-[280px] text-right">
                          {nextDisabledReason}
                        </p>
                      )}
                      <Button
                        onClick={handleNext}
                        disabled={!canProceed() || (currentStep === 'select_language' && selectStepBusy)}
                        className="hover:opacity-90"
                      >
                        {currentStep === 'select_language' ? (
                          <>
                            {selectStepBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            {selectStepBusy ? 'Starting...' : selectStepCtaLabel}
                          </>
                        ) : (
                          <>
                            Next
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </QuizAdminLayout>
  );
}
