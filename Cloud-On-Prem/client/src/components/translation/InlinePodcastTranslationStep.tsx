import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { usePodcastScriptTools } from '@/hooks/usePodcastScriptTools';
import { apiRequest, invalidateLanguageAwareContentCaches, queryClient } from '@/lib/queryClient';
import { Loader2, Languages, Mic2, BarChart3, Radio, Search, Play, Trash2 } from 'lucide-react';

interface VoiceOption {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string | null;
  labels?: Record<string, string>;
}

interface PodcastStateResponse {
  languageCode?: string;
  sourceAvailability?: Record<'sourcedb' | 'word' | 'pptx', boolean>;
  sourcePreviews?: Record<'sourcedb' | 'word' | 'pptx', string>;
  suggestedFocusTopic?: string;
  sourceMaterials?: Array<{ id: string; sourceType: 'word'; version: number; originalFilename: string; createdAt: string }>;
  scripts?: Array<{
    id: string;
    languageCode?: string;
    format?: PodcastFormat;
    duration?: PodcastDuration;
    sourceType?: PodcastSourceType;
    sourceMaterialId?: string;
    focusTopic?: string;
    voiceId?: string;
    guestVoiceId?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  currentJob?: { status: 'idle' | 'processing' | 'completed' | 'failed'; errorMessage?: string; updatedAt?: string };
  versions?: Array<{
    id: string;
    status?: 'completed' | 'failed';
    languageCode?: string;
    createdAt?: string;
    title?: string;
    format?: PodcastFormat;
    duration?: PodcastDuration;
    sourceType?: PodcastSourceType;
    sourceMaterialId?: string;
    voiceId?: string;
    guestVoiceId?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
  }>;
}

type PodcastSourceType = 'sourcedb' | 'word' | 'pptx';
type PodcastFormat = 'bulletin' | 'conversation';
type PodcastDuration = 'short' | 'default' | 'long';

type CompletionState = {
  hasPreparedScript: boolean;
  hasTriggeredGeneration: boolean;
  hasCompletedAudio: boolean;
};

interface InlinePodcastTranslationStepProps {
  sourceLessonId: string;
  translatedLessonId: string;
  organizationId: string;
  courseId?: string;
  targetLanguageCode: string;
  targetLanguageName: string;
  sourceLanguageCode?: string;
  funnelContext?: {
    translationJobId?: string | null;
    orchestrationCorrelationId?: string | null;
    onTrackFunnelEvent?: (eventName: string, details?: Record<string, any>) => Promise<void> | void;
  };
  onCompletionStateChange?: (state: CompletionState) => void;
  sourceContractChanged?: boolean;
  onRequestSourceRefresh?: () => void;
  enhancedUxEnabled?: boolean;
  persistedState?: {
    subStep?: number;
    selectedSourceScriptId?: string;
    podcastFormat?: PodcastFormat;
    duration?: PodcastDuration;
    focusTopic?: string;
    selectedVoiceId?: string;
    selectedGuestVoiceId?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    scriptId?: string;
    scriptText?: string;
    estimatedLpcCost?: number | null;
    estimatedCharacters?: number | null;
    hasTriggeredGeneration?: boolean;
  } | null;
  onPersistStateChange?: (state: {
    subStep: number;
    selectedSourceScriptId: string;
    podcastFormat: PodcastFormat;
    duration: PodcastDuration;
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
  }) => void;
}

function getStatusBadgeClass(status: string): string {
  if (status === 'completed') return 'border-border text-foreground';
  if (status === 'processing') return 'border-border text-foreground';
  if (status === 'failed') return 'border-border text-destructive';
  return 'border-border text-muted-foreground';
}

function statusLabel(status: string): string {
  if (status === 'processing') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return 'Not started';
}

const copy = {
  headerGuidancePrefix: "Use these inline steps to progress through podcast translation. The main page",
  headerGuidanceSuffix: "button is enabled once this optional flow is complete.",
  sourceChangedNotice:
    "Source content changed after this translation started. Refresh from latest source and re-prepare script to keep podcast output consistent.",
  refreshFromLatestSource: "Refresh From Latest Source",
  voiceChecklistTitle: "Voice setup checklist",
  blockedPrepare: "Refresh from latest source before preparing a translated script.",
  blockedEstimate: "Refresh from latest source before estimating audio generation.",
  blockedGenerate: "Refresh from latest source before generating translated podcast audio.",
};

const turnTheme = {
  host: {
    shell: 'border-border bg-primary/5',
    chip: 'bg-primary text-primary-foreground',
    label: 'Host',
    accent: 'bg-primary',
  },
  guest: {
    shell: 'border-secondary/20 bg-secondary/5',
    chip: 'bg-secondary text-secondary-foreground',
    label: 'Guest',
    accent: 'bg-secondary',
  },
  narrator: {
    shell: 'border-border bg-muted/40',
    chip: 'bg-muted text-muted-foreground',
    label: 'Narrator',
    accent: 'bg-muted-foreground',
  },
} as const;

export default function InlinePodcastTranslationStep({
  sourceLessonId,
  translatedLessonId,
  organizationId,
  courseId,
  targetLanguageCode,
  targetLanguageName,
  sourceLanguageCode,
  funnelContext,
  onCompletionStateChange,
  sourceContractChanged = false,
  onRequestSourceRefresh,
  enhancedUxEnabled = true,
  persistedState,
  onPersistStateChange,
}: InlinePodcastTranslationStepProps) {
  const { toast } = useToast();
  const { parseScriptTurns, serializeTurnsToScript, formatScriptForEditor } = usePodcastScriptTools();
  const appliedPersistedStateRef = useRef(false);
  const [subStep, setSubStep] = useState(1);
  const [selectedSourceScriptId, setSelectedSourceScriptId] = useState('');
  const [podcastFormat, setPodcastFormat] = useState<PodcastFormat>('bulletin');
  const [duration, setDuration] = useState<PodcastDuration>('default');
  const [focusTopic, setFocusTopic] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedGuestVoiceId, setSelectedGuestVoiceId] = useState('');
  const [hostDisplayName, setHostDisplayName] = useState('Host');
  const [guestDisplayName, setGuestDisplayName] = useState('Guest');
  const [scriptId, setScriptId] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [scriptPreparedContextKey, setScriptPreparedContextKey] = useState('');
  const [estimatedLpcCost, setEstimatedLpcCost] = useState<number | null>(null);
  const [estimatedCharacters, setEstimatedCharacters] = useState<number | null>(null);
  const [hasTriggeredGeneration, setHasTriggeredGeneration] = useState(false);
  const [hostVoiceSearch, setHostVoiceSearch] = useState('');
  const [guestVoiceSearch, setGuestVoiceSearch] = useState('');
  const [voiceValidationSubmitted, setVoiceValidationSubmitted] = useState(false);
  const [isComparePlaying, setIsComparePlaying] = useState(false);
  const [hostNameTouched, setHostNameTouched] = useState(false);
  const [guestNameTouched, setGuestNameTouched] = useState(false);
  const [lastStatusCheckedAt, setLastStatusCheckedAt] = useState<Date | null>(null);
  const hostAudioRef = useRef<HTMLAudioElement | null>(null);
  const guestAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    appliedPersistedStateRef.current = false;
  }, [translatedLessonId, targetLanguageCode]);

  useEffect(() => {
    if (appliedPersistedStateRef.current) return;
    if (!persistedState || typeof persistedState !== 'object') return;
    appliedPersistedStateRef.current = true;
    if (persistedState?.subStep) setSubStep(Number(persistedState.subStep) || 1);
    if (persistedState?.selectedSourceScriptId) setSelectedSourceScriptId(String(persistedState.selectedSourceScriptId));
    if (persistedState?.podcastFormat) setPodcastFormat(persistedState.podcastFormat as PodcastFormat);
    if (persistedState?.duration) setDuration(persistedState.duration as PodcastDuration);
    if (typeof persistedState?.focusTopic === 'string') setFocusTopic(persistedState.focusTopic);
    if (typeof persistedState?.selectedVoiceId === 'string') setSelectedVoiceId(persistedState.selectedVoiceId);
    if (typeof persistedState?.selectedGuestVoiceId === 'string') setSelectedGuestVoiceId(persistedState.selectedGuestVoiceId);
    if (typeof persistedState?.hostDisplayName === 'string') setHostDisplayName(persistedState.hostDisplayName);
    if (typeof persistedState?.guestDisplayName === 'string') setGuestDisplayName(persistedState.guestDisplayName);
    if (typeof persistedState?.scriptId === 'string') setScriptId(persistedState.scriptId);
    if (typeof persistedState?.scriptText === 'string') setScriptText(persistedState.scriptText);
    if (typeof persistedState?.estimatedLpcCost === 'number') setEstimatedLpcCost(persistedState.estimatedLpcCost);
    if (typeof persistedState?.estimatedCharacters === 'number') setEstimatedCharacters(persistedState.estimatedCharacters);
    if (typeof persistedState?.hasTriggeredGeneration === 'boolean') setHasTriggeredGeneration(persistedState.hasTriggeredGeneration);
  }, [persistedState]);

  const podcastStateQuery = useQuery<PodcastStateResponse>({
    queryKey: ['/api/lessons', translatedLessonId, 'podcast-state', 'inline-translation'],
    enabled: !!translatedLessonId && !!organizationId,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('organizationId', organizationId);
      if (courseId) params.set('courseId', courseId);
      return apiRequest(`/api/lessons/${translatedLessonId}/podcast/state?${params.toString()}`);
    },
    refetchInterval: (q) => {
      const status = (q.state.data as PodcastStateResponse | undefined)?.currentJob?.status;
      return status === 'processing' ? 3000 : 12000;
    },
  });

  const sourcePodcastStateQuery = useQuery<PodcastStateResponse>({
    queryKey: ['/api/lessons', sourceLessonId, 'podcast-state', 'inline-source-state'],
    enabled: !!sourceLessonId && !!organizationId,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('organizationId', organizationId);
      if (courseId) params.set('courseId', courseId);
      return apiRequest(`/api/lessons/${sourceLessonId}/podcast/state?${params.toString()}`);
    },
    refetchInterval: 12000,
  });

  const { data: voicesData, isLoading: voicesLoading } = useQuery<{ voices: VoiceOption[] }>({
    queryKey: ['/api/podcast/voices'],
    enabled: subStep >= 2,
    queryFn: async () => apiRequest('/api/podcast/voices'),
  });

  const voices = voicesData?.voices || [];

  const sourceScripts = useMemo(() => {
    const scripts = sourcePodcastStateQuery.data?.scripts || [];
    const fromLanguage = (sourceLanguageCode || '').toLowerCase();
    if (!fromLanguage) return scripts;
    const filtered = scripts.filter((script: any) => String(script.languageCode || '').toLowerCase() === fromLanguage);
    return filtered.length > 0 ? filtered : scripts;
  }, [sourcePodcastStateQuery.data?.scripts, sourceLanguageCode]);

  const selectedSourceScript = useMemo(() =>
    sourceScripts.find((script: any) => String(script.id) === String(selectedSourceScriptId)) || null,
  [sourceScripts, selectedSourceScriptId]);
  const selectedHostVoice = useMemo(
    () => voices.find((voice) => String(voice.voiceId) === String(selectedVoiceId)) || null,
    [voices, selectedVoiceId]
  );
  const selectedGuestVoice = useMemo(
    () => voices.find((voice) => String(voice.voiceId) === String(selectedGuestVoiceId)) || null,
    [voices, selectedGuestVoiceId]
  );
  const hostVoicePreviewKey = selectedHostVoice
    ? `${selectedHostVoice.voiceId}:${selectedHostVoice.previewUrl || 'preview'}`
    : 'host-preview-empty';
  const guestVoicePreviewKey = selectedGuestVoice
    ? `${selectedGuestVoice.voiceId}:${selectedGuestVoice.previewUrl || 'preview'}`
    : 'guest-preview-empty';
  const parsedScriptTurns = useMemo(() => parseScriptTurns(scriptText), [parseScriptTurns, scriptText]);
  const hostFilteredVoices = useMemo(() => {
    const term = hostVoiceSearch.trim().toLowerCase();
    if (!term) return voices;
    return voices.filter((voice) => {
      const labels = Object.values(voice.labels || {}).join(' ').toLowerCase();
      return `${voice.name} ${voice.category || ''} ${labels}`.toLowerCase().includes(term);
    });
  }, [voices, hostVoiceSearch]);
  const guestFilteredVoices = useMemo(() => {
    const pool = voices.filter((voice) => voice.voiceId !== selectedVoiceId);
    const term = guestVoiceSearch.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((voice) => {
      const labels = Object.values(voice.labels || {}).join(' ').toLowerCase();
      return `${voice.name} ${voice.category || ''} ${labels}`.toLowerCase().includes(term);
    });
  }, [voices, guestVoiceSearch, selectedVoiceId]);

  const stepProgress = (subStep / 5) * 100;

  const hasCompletedAudio = useMemo(() => {
    const versions = podcastStateQuery.data?.versions || [];
    return versions.some((v) => String(v.languageCode || '').toLowerCase() === targetLanguageCode.toLowerCase() && v.status === 'completed');
  }, [podcastStateQuery.data?.versions, targetLanguageCode]);

  useEffect(() => {
    if (!sourceScripts.length) {
      setSelectedSourceScriptId('');
      return;
    }
    if (!sourceScripts.find((script) => String(script.id) === String(selectedSourceScriptId))) {
      setSelectedSourceScriptId(String(sourceScripts[0].id));
    }
  }, [sourceScripts, selectedSourceScriptId]);

  useEffect(() => {
    if (!focusTopic.trim() && podcastStateQuery.data?.suggestedFocusTopic) {
      setFocusTopic(String(podcastStateQuery.data.suggestedFocusTopic));
    }
  }, [podcastStateQuery.data?.suggestedFocusTopic, focusTopic]);

  useEffect(() => {
    if (!selectedSourceScript) return;
    setPodcastFormat((selectedSourceScript.format || 'bulletin') as PodcastFormat);
    setDuration((selectedSourceScript.duration || 'default') as PodcastDuration);
    setFocusTopic((prev) => prev.trim() ? prev : String(selectedSourceScript.focusTopic || ''));
  }, [selectedSourceScript]);

  useEffect(() => {
    if (!voices.length) return;
    const hasCurrentHost = !!selectedVoiceId && voices.some((voice) => voice.voiceId === selectedVoiceId);
    if (hasCurrentHost) return;
    if (selectedSourceScript?.voiceId && voices.some((voice) => voice.voiceId === selectedSourceScript.voiceId)) {
      setSelectedVoiceId(selectedSourceScript.voiceId);
      return;
    }
    setSelectedVoiceId(voices[0].voiceId);
  }, [voices, selectedVoiceId, selectedSourceScript?.voiceId]);

  useEffect(() => {
    if (podcastFormat !== 'conversation') return;
    const hasCurrentGuest = !!selectedGuestVoiceId && voices.some((voice) => voice.voiceId === selectedGuestVoiceId);
    if (!hasCurrentGuest) {
      if (selectedSourceScript?.guestVoiceId && voices.some((voice) => voice.voiceId === selectedSourceScript.guestVoiceId)) {
        setSelectedGuestVoiceId(selectedSourceScript.guestVoiceId);
        return;
      }
      const fallback = voices.find((voice) => voice.voiceId !== selectedVoiceId)?.voiceId || '';
      if (fallback) {
        setSelectedGuestVoiceId(fallback);
        return;
      }
    }
    if (selectedGuestVoiceId === selectedVoiceId) {
      const fallback = voices.find((voice) => voice.voiceId !== selectedVoiceId)?.voiceId || '';
      setSelectedGuestVoiceId(fallback);
    }
  }, [podcastFormat, selectedGuestVoiceId, selectedVoiceId, voices, selectedSourceScript?.guestVoiceId]);

  useEffect(() => {
    if (!selectedSourceScript) return;
    if (selectedSourceScript.hostDisplayName && !hostNameTouched && (!hostDisplayName.trim() || hostDisplayName === 'Host')) {
      setHostDisplayName(selectedSourceScript.hostDisplayName);
    }
    if (selectedSourceScript.guestDisplayName && !guestNameTouched && (!guestDisplayName.trim() || guestDisplayName === 'Guest')) {
      setGuestDisplayName(selectedSourceScript.guestDisplayName);
    }
  }, [selectedSourceScript, hostDisplayName, guestDisplayName, hostNameTouched, guestNameTouched]);

  useEffect(() => {
    if (!selectedHostVoice || hostNameTouched) return;
    if (!hostDisplayName.trim() || hostDisplayName === 'Host') {
      setHostDisplayName(selectedHostVoice.name);
    }
  }, [selectedHostVoice, hostDisplayName, hostNameTouched]);

  useEffect(() => {
    if (!selectedGuestVoice || guestNameTouched) return;
    if (!guestDisplayName.trim() || guestDisplayName === 'Guest') {
      setGuestDisplayName(selectedGuestVoice.name);
    }
  }, [selectedGuestVoice, guestDisplayName, guestNameTouched]);

  useEffect(() => {
    hostAudioRef.current?.pause();
    hostAudioRef.current?.load();
  }, [hostVoicePreviewKey]);

  useEffect(() => {
    guestAudioRef.current?.pause();
    guestAudioRef.current?.load();
  }, [guestVoicePreviewKey]);

  useEffect(() => {
    onCompletionStateChange?.({
      hasPreparedScript: scriptText.trim().length > 0,
      hasTriggeredGeneration,
      hasCompletedAudio,
    });
  }, [onCompletionStateChange, scriptText, hasTriggeredGeneration, hasCompletedAudio]);

  useEffect(() => {
    onPersistStateChange?.({
      subStep,
      selectedSourceScriptId,
      podcastFormat,
      duration,
      focusTopic,
      selectedVoiceId,
      selectedGuestVoiceId,
      hostDisplayName,
      guestDisplayName,
      scriptId,
      scriptText,
      estimatedLpcCost,
      estimatedCharacters,
      hasTriggeredGeneration,
    });
  }, [
    onPersistStateChange,
    subStep,
    selectedSourceScriptId,
    podcastFormat,
    duration,
    focusTopic,
    selectedVoiceId,
    selectedGuestVoiceId,
    hostDisplayName,
    guestDisplayName,
    scriptId,
    scriptText,
    estimatedLpcCost,
    estimatedCharacters,
    hasTriggeredGeneration,
  ]);

  const scriptPreviewMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ organizationId });
      return apiRequest(`/api/lessons/${translatedLessonId}/podcast/translate?${params.toString()}`, {
        method: 'POST',
        body: JSON.stringify({
          previewOnly: true,
          targetLanguageCode: targetLanguageCode.toLowerCase(),
          sourceLanguageCode: String(selectedSourceScript?.languageCode || sourceLanguageCode || 'en').toLowerCase(),
          sourceLessonId,
          sourceScriptId: selectedSourceScriptId || undefined,
          sourceMaterialId: selectedSourceScript?.sourceMaterialId || undefined,
          sourceType: selectedSourceScript?.sourceType || 'sourcedb',
          format: podcastFormat,
          duration,
          focusTopic: focusTopic.trim() || undefined,
          voiceId: selectedVoiceId,
          guestVoiceId: podcastFormat === 'conversation' ? selectedGuestVoiceId || undefined : undefined,
          hostDisplayName: hostDisplayName.trim() || undefined,
          guestDisplayName: podcastFormat === 'conversation' ? guestDisplayName.trim() || undefined : undefined,
          title: `${focusTopic || targetLanguageName} Podcast`,
          notes: 'Prepared from inline lesson translation flow',
          integrationContext: {
            translationJobId: funnelContext?.translationJobId || null,
            translatedLessonId,
            orchestrationCorrelationId: funnelContext?.orchestrationCorrelationId || null,
            source: 'inline_translation_wizard',
          },
        }),
      });
    },
    onSuccess: (data: any) => {
      if (data?.scriptId) setScriptId(String(data.scriptId));
      if (data?.scriptText) {
        setScriptText(formatScriptForEditor(String(data.scriptText), podcastFormat));
      }
      setScriptPreparedContextKey(currentScriptContextKey);
      toast({ title: 'Translated script prepared', description: 'Review and edit the translated podcast script before generation.' });
      void funnelContext?.onTrackFunnelEvent?.('podcast_script_prepared', {
        scriptId: data?.scriptId || null,
        orchestrationCorrelationId: data?.orchestrationCorrelationId || funnelContext?.orchestrationCorrelationId || null,
      });
      setSubStep(3);
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', translatedLessonId, 'podcast-state'] });
    },
    onError: (err: any) => {
      toast({ title: 'Script preparation failed', description: err?.message || 'Unable to prepare translated script.', variant: 'destructive' });
    },
  });

  const estimateMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ organizationId });
      return apiRequest(`/api/lessons/${translatedLessonId}/podcast/estimate?${params.toString()}`, {
        method: 'POST',
        body: JSON.stringify({
          sourceType: selectedSourceScript?.sourceType || 'sourcedb',
          sourceMaterialId: selectedSourceScript?.sourceMaterialId || undefined,
          format: podcastFormat,
          scriptText,
        }),
      });
    },
    onSuccess: (data: any) => {
      setEstimatedLpcCost(Number(data?.estimatedLpcCost || 0));
      setEstimatedCharacters(Number(data?.estimatedCharacters || 0));
      void funnelContext?.onTrackFunnelEvent?.('podcast_estimate_ready', {
        estimatedLpcCost: Number(data?.estimatedLpcCost || 0),
        estimatedCharacters: Number(data?.estimatedCharacters || 0),
      });
      setSubStep(4);
    },
    onError: (err: any) => {
      toast({ title: 'Estimate failed', description: err?.message || 'Unable to estimate podcast generation.', variant: 'destructive' });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ organizationId });
      return apiRequest(`/api/lessons/${translatedLessonId}/podcast/translate?${params.toString()}`, {
        method: 'POST',
        body: JSON.stringify({
          targetLanguageCode: targetLanguageCode.toLowerCase(),
          sourceLanguageCode: String(selectedSourceScript?.languageCode || sourceLanguageCode || 'en').toLowerCase(),
          sourceLessonId,
          sourceScriptId: selectedSourceScriptId || undefined,
          scriptId: scriptId || undefined,
          scriptText: scriptText.trim() || undefined,
          sourceMaterialId: selectedSourceScript?.sourceMaterialId || undefined,
          sourceType: selectedSourceScript?.sourceType || 'sourcedb',
          format: podcastFormat,
          duration,
          focusTopic: focusTopic.trim() || undefined,
          voiceId: selectedVoiceId,
          guestVoiceId: podcastFormat === 'conversation' ? selectedGuestVoiceId || undefined : undefined,
          hostDisplayName: hostDisplayName.trim() || undefined,
          guestDisplayName: podcastFormat === 'conversation' ? guestDisplayName.trim() || undefined : undefined,
          title: `${focusTopic || targetLanguageName} Podcast`,
          notes: 'Generated from inline lesson translation flow',
          integrationContext: {
            translationJobId: funnelContext?.translationJobId || null,
            translatedLessonId,
            orchestrationCorrelationId: funnelContext?.orchestrationCorrelationId || null,
            source: 'inline_translation_wizard',
          },
        }),
      });
    },
    onSuccess: () => {
      setHasTriggeredGeneration(true);
      toast({ title: 'Podcast generation started', description: 'Translated podcast generation is now running in the background.' });
      void funnelContext?.onTrackFunnelEvent?.('podcast_generation_started', {
        orchestrationCorrelationId: funnelContext?.orchestrationCorrelationId || null,
      });
      setSubStep(5);
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', translatedLessonId, 'podcast-state'] });
      invalidateLanguageAwareContentCaches({
        lessonId: translatedLessonId,
        courseId: courseId || undefined,
        languageCode: targetLanguageCode,
      });
    },
    onError: (err: any) => {
      toast({ title: 'Podcast generation failed to start', description: err?.message || 'Unable to start podcast generation.', variant: 'destructive' });
    },
  });

  const currentJobStatus = podcastStateQuery.data?.currentJob?.status || 'idle';

  const canContinueFromSetup = !!selectedSourceScript
    && !!selectedVoiceId
    && (podcastFormat !== 'conversation' || (!!selectedGuestVoiceId && selectedGuestVoiceId !== selectedVoiceId));
  const voiceValidationErrors = useMemo(() => {
    const errors: { hostVoice?: string; guestVoice?: string; hostDisplayName?: string; guestDisplayName?: string } = {};
    if (!selectedVoiceId) errors.hostVoice = 'Select a host voice.';
    if (!hostDisplayName.trim()) {
      errors.hostDisplayName = podcastFormat === 'conversation'
        ? 'Enter a host display name.'
        : 'Enter a narrator display name.';
    }
    if (podcastFormat === 'conversation') {
      if (!selectedGuestVoiceId) errors.guestVoice = 'Select a guest voice.';
      else if (selectedGuestVoiceId === selectedVoiceId) errors.guestVoice = 'Host and guest voices must be different.';
      if (!guestDisplayName.trim()) errors.guestDisplayName = 'Enter a guest display name.';
    }
    return errors;
  }, [selectedVoiceId, selectedGuestVoiceId, hostDisplayName, guestDisplayName, podcastFormat]);
  const hasVoiceValidationErrors = useMemo(
    () => Object.values(voiceValidationErrors).some(Boolean),
    [voiceValidationErrors]
  );
  const currentScriptContextKey = useMemo(
    () => [
      selectedSourceScriptId,
      podcastFormat,
      duration,
      focusTopic.trim(),
      selectedVoiceId,
      selectedGuestVoiceId,
      hostDisplayName.trim(),
      guestDisplayName.trim(),
    ].join('|'),
    [
      selectedSourceScriptId,
      podcastFormat,
      duration,
      focusTopic,
      selectedVoiceId,
      selectedGuestVoiceId,
      hostDisplayName,
      guestDisplayName,
    ]
  );

  const canOpenPodcastSubStep = (step: number) => {
    if (step <= subStep) return true;
    if (step === 2) return !!selectedSourceScript;
    if (step === 3) return canContinueFromSetup && !hasVoiceValidationErrors;
    if (step === 4) return scriptText.trim().length >= 30;
    if (step === 5) return hasTriggeredGeneration || hasCompletedAudio || currentJobStatus === 'processing';
    return false;
  };

  const refetchPodcastStatus = async () => {
    setLastStatusCheckedAt(new Date());
    await podcastStateQuery.refetch();
  };

  const handleComparePreview = async () => {
    const hostAudio = hostAudioRef.current;
    const guestAudio = guestAudioRef.current;
    if (!hostAudio || !guestAudio) {
      toast({
        variant: 'destructive',
        title: 'Preview unavailable',
        description: 'Both host and guest preview audio are required.',
      });
      return;
    }
    try {
      setIsComparePlaying(true);
      hostAudio.pause();
      guestAudio.pause();
      hostAudio.currentTime = 0;
      guestAudio.currentTime = 0;
      hostAudio.onended = async () => {
        try {
          guestAudio.currentTime = 0;
          await guestAudio.play();
        } finally {
          setIsComparePlaying(false);
        }
      };
      await hostAudio.play();
    } catch {
      setIsComparePlaying(false);
      toast({
        variant: 'destructive',
        title: 'Preview playback failed',
        description: 'Unable to play selected voice previews.',
      });
    }
  };

  useEffect(() => {
    return () => {
      if (hostAudioRef.current) hostAudioRef.current.onended = null;
    };
  }, []);

  useEffect(() => {
    if (!scriptPreparedContextKey) return;
    if (scriptPreparedContextKey === currentScriptContextKey) return;
    if (!scriptText && !scriptId) return;
    setScriptId('');
    setScriptText('');
    setEstimatedLpcCost(null);
    setEstimatedCharacters(null);
    if (subStep > 2) setSubStep(2);
  }, [scriptPreparedContextKey, currentScriptContextKey, scriptText, scriptId, subStep]);

  useEffect(() => {
    if (currentJobStatus === 'processing') {
      setHasTriggeredGeneration(true);
    }
  }, [currentJobStatus]);

  useEffect(() => {
    if (!hasCompletedAudio) return;
    invalidateLanguageAwareContentCaches({
      lessonId: translatedLessonId,
      courseId: courseId || undefined,
      languageCode: targetLanguageCode,
    });
  }, [hasCompletedAudio, translatedLessonId, courseId, targetLanguageCode]);

  useEffect(() => {
    if (subStep !== 5) return;
    void funnelContext?.onTrackFunnelEvent?.('podcast_status_step_viewed', {
      hasCompletedAudio,
      currentJobStatus,
    });
  }, [subStep, hasCompletedAudio, currentJobStatus, funnelContext]);

  useEffect(() => {
    void funnelContext?.onTrackFunnelEvent?.('podcast_substep_viewed', {
      subStep,
      hasPreparedScript: scriptText.trim().length > 0,
      hasTriggeredGeneration,
      hasCompletedAudio,
    });
  }, [subStep, scriptText, hasTriggeredGeneration, hasCompletedAudio, funnelContext]);

  useEffect(() => {
    if (!selectedSourceScript) return;
    void funnelContext?.onTrackFunnelEvent?.('podcast_source_script_selected', {
      sourceScriptId: selectedSourceScript.id,
      sourceLanguageCode: selectedSourceScript.languageCode || null,
      sourceFormat: selectedSourceScript.format || null,
      sourceDuration: selectedSourceScript.duration || null,
    });
  }, [selectedSourceScriptId]);

  const updateScriptTurnText = (index: number, nextText: string) => {
    const turns = parseScriptTurns(scriptText);
    if (!turns[index]) return;
    turns[index] = { ...turns[index], text: nextText };
    setScriptText(formatScriptForEditor(serializeTurnsToScript(turns), podcastFormat));
  };

  const deleteScriptTurn = (index: number) => {
    const turns = parseScriptTurns(scriptText);
    if (!turns[index]) return;
    const next = turns.filter((_, idx) => idx !== index);
    setScriptText(formatScriptForEditor(serializeTurnsToScript(next), podcastFormat));
  };

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-4 w-4" />
            Podcast Translation and Generation
          </CardTitle>
          <CardDescription>
            Keep everything in one flow. Translate the podcast script into {targetLanguageName} and generate the target-language audio.
          </CardDescription>
          <Progress value={stepProgress} className="h-2" />
          {enhancedUxEnabled && (
            <p className="text-xs text-muted-foreground">
              {copy.headerGuidancePrefix} <span className="font-medium text-foreground">Next</span> {copy.headerGuidanceSuffix}
            </p>
          )}
          <div className={`${enhancedUxEnabled ? 'grid grid-cols-2 md:grid-cols-5' : 'flex flex-wrap'} gap-2`} role="tablist" aria-label="Podcast translation steps">
            {[1, 2, 3, 4, 5].map((step) => (
              (() => {
                const canOpen = canOpenPodcastSubStep(step);
                return (
              <Button key={step} type="button" size="sm" variant={subStep === step ? 'default' : (subStep > step ? 'secondary' : 'outline')}
                onClick={() => {
                  if (!canOpen) return;
                  setSubStep(step);
                  void funnelContext?.onTrackFunnelEvent?.('podcast_substep_selected', { subStep: step });
                }}
                disabled={!canOpen}
                aria-current={subStep === step ? 'step' : undefined}
                className={enhancedUxEnabled ? 'justify-start gap-2' : ''}
              >
                {enhancedUxEnabled && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">
                    {step}
                  </span>
                )}
                <span>
                  {step === 1 && 'Setup'}
                  {step === 2 && 'Voices'}
                  {step === 3 && 'Script'}
                  {step === 4 && 'Estimate'}
                  {step === 5 && 'Status'}
                </span>
              </Button>
                );
              })()
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sourceContractChanged && (
            <div className="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              {copy.sourceChangedNotice}
              {onRequestSourceRefresh && (
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={onRequestSourceRefresh}>{copy.refreshFromLatestSource}</Button>
                </div>
              )}
            </div>
          )}
          {currentJobStatus === 'processing' && (
            <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-foreground">
              A translated podcast generation job is already in progress for this lesson. You can continue to the Status step to monitor progress.
            </div>
          )}
          {subStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Target language</p>
                  <Input value={targetLanguageName} disabled />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Source language</p>
                  <Input value={String(selectedSourceScript?.languageCode || sourceLanguageCode || 'en').toUpperCase()} disabled />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Source script version</p>
                {sourceScripts.length > 0 ? (
                  <Select value={selectedSourceScriptId} onValueChange={setSelectedSourceScriptId}>
                    <SelectTrigger aria-label="Select source script version">
                      <SelectValue placeholder="Select source script version" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceScripts.map((script: any) => (
                        <SelectItem key={String(script.id)} value={String(script.id)}>
                          {[
                            String(script.languageCode || sourceLanguageCode || 'en').toUpperCase(),
                            script.format === 'conversation' ? 'Conversation' : 'Bulletin',
                            script.updatedAt ? new Date(script.updatedAt).toLocaleDateString() : 'Version',
                          ].join(' • ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-foreground">
                    No source podcast script was found for this lesson. Generate a source-language podcast first, then return to translate.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Format</p>
                  <Input value={podcastFormat === 'conversation' ? 'Conversation' : 'Bulletin'} disabled />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Duration</p>
                  <Input value={duration === 'default' ? 'Default' : duration === 'short' ? 'Short' : 'Long'} disabled />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Format and duration are locked to the selected source script for translation consistency. Use the standalone podcast wizard to create a new format from scratch.
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Focus topic</p>
                <Input value={focusTopic} onChange={(e) => setFocusTopic(e.target.value)} placeholder="Optional podcast focus topic" />
              </div>

              <div className="flex justify-end sticky bottom-2 sm:static z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 p-2 rounded-md border border-border">
                <Button onClick={() => setSubStep(2)} disabled={!selectedSourceScript}>Continue to Voices</Button>
              </div>
            </div>
          )}

          {subStep === 2 && (
            <div className="space-y-4">
              {enhancedUxEnabled && (
                <div className="rounded border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-foreground mb-2">{copy.voiceChecklistTitle}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <p>{selectedVoiceId ? '✓' : '•'} Host voice selected</p>
                    <p>{hostDisplayName.trim() ? '✓' : '•'} {podcastFormat === 'conversation' ? 'Host display name set' : 'Narrator display name set'}</p>
                    {podcastFormat === 'conversation' && (
                      <>
                        <p>{selectedGuestVoiceId ? '✓' : '•'} Guest voice selected</p>
                        <p>{selectedGuestVoiceId && selectedGuestVoiceId !== selectedVoiceId ? '✓' : '•'} Host/guest voices are different</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Host voice</p>
                  {enhancedUxEnabled && (
                    <div className="relative mb-2">
                      <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={hostVoiceSearch}
                        onChange={(e) => setHostVoiceSearch(e.target.value)}
                        placeholder="Search voices by name or style"
                        className="pl-7 h-8"
                      />
                    </div>
                  )}
                  <Select value={selectedVoiceId} onValueChange={(value) => {
                    setSelectedVoiceId(value);
                    setVoiceValidationSubmitted(false);
                  }} disabled={voicesLoading}>
                    <SelectTrigger aria-label="Host voice"><SelectValue placeholder={voicesLoading ? 'Loading voices...' : 'Select host voice'} /></SelectTrigger>
                    <SelectContent>
                      {hostFilteredVoices.map((voice) => (
                        <SelectItem key={voice.voiceId} value={voice.voiceId}>
                          {voice.name}{voice.category ? ` (${voice.category})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {voiceValidationSubmitted && voiceValidationErrors.hostVoice && (
                    <p className="text-xs text-destructive mt-1">{voiceValidationErrors.hostVoice}</p>
                  )}
                  {enhancedUxEnabled && !voicesLoading && hostFilteredVoices.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">No host voices match this search.</p>
                  )}
                  {enhancedUxEnabled && selectedHostVoice?.previewUrl ? (
                    <audio
                      key={hostVoicePreviewKey}
                      ref={hostAudioRef}
                      className="w-full h-8 mt-2"
                      controls
                      preload="metadata"
                      playsInline
                      src={selectedHostVoice.previewUrl}
                    />
                  ) : enhancedUxEnabled ? (
                    <p className="text-xs text-muted-foreground mt-1">No preview available for selected host voice.</p>
                  ) : null}
                </div>
                {podcastFormat === 'conversation' && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Guest voice</p>
                    {enhancedUxEnabled && (
                      <div className="relative mb-2">
                        <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={guestVoiceSearch}
                          onChange={(e) => setGuestVoiceSearch(e.target.value)}
                          placeholder="Search guest voices"
                          className="pl-7 h-8"
                        />
                      </div>
                    )}
                    <Select value={selectedGuestVoiceId} onValueChange={(value) => {
                      setSelectedGuestVoiceId(value);
                      setVoiceValidationSubmitted(false);
                    }} disabled={voicesLoading}>
                      <SelectTrigger aria-label="Guest voice"><SelectValue placeholder="Select guest voice" /></SelectTrigger>
                      <SelectContent>
                        {guestFilteredVoices.map((voice) => (
                          <SelectItem key={voice.voiceId} value={voice.voiceId}>
                            {voice.name}{voice.category ? ` (${voice.category})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {voiceValidationSubmitted && voiceValidationErrors.guestVoice && (
                      <p className="text-xs text-destructive mt-1">{voiceValidationErrors.guestVoice}</p>
                    )}
                    {enhancedUxEnabled && !voicesLoading && guestFilteredVoices.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">No guest voices match this search.</p>
                    )}
                    {enhancedUxEnabled && selectedGuestVoice?.previewUrl ? (
                      <audio
                        key={guestVoicePreviewKey}
                        ref={guestAudioRef}
                        className="w-full h-8 mt-2"
                        controls
                        preload="metadata"
                        playsInline
                        src={selectedGuestVoice.previewUrl}
                      />
                    ) : enhancedUxEnabled ? (
                      <p className="text-xs text-muted-foreground mt-1">No preview available for selected guest voice.</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Host display name</p>
                  <Input value={hostDisplayName} onChange={(e) => {
                    setHostNameTouched(true);
                    setHostDisplayName(e.target.value);
                  }} />
                  {voiceValidationSubmitted && voiceValidationErrors.hostDisplayName && (
                    <p className="text-xs text-destructive mt-1">{voiceValidationErrors.hostDisplayName}</p>
                  )}
                </div>
                {podcastFormat === 'conversation' && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Guest display name</p>
                    <Input value={guestDisplayName} onChange={(e) => {
                      setGuestNameTouched(true);
                      setGuestDisplayName(e.target.value);
                    }} />
                    {voiceValidationSubmitted && voiceValidationErrors.guestDisplayName && (
                      <p className="text-xs text-destructive mt-1">{voiceValidationErrors.guestDisplayName}</p>
                    )}
                  </div>
                )}
              </div>
              {!canContinueFromSetup && (
                <p className="text-xs text-muted-foreground">
                  Finish selecting a host voice and, for conversation mode, a different guest voice before continuing.
                </p>
              )}
              {enhancedUxEnabled && podcastFormat === 'conversation' && (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => { void handleComparePreview(); }}
                    disabled={!selectedHostVoice?.previewUrl || !selectedGuestVoice?.previewUrl || isComparePlaying}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {isComparePlaying ? 'Playing...' : 'Compare Host/Guest Previews'}
                  </Button>
                </div>
              )}

              <div className="flex justify-between sticky bottom-2 sm:static z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 p-2 rounded-md border border-border">
                <Button variant="outline" onClick={() => setSubStep(1)}>Back</Button>
                <Button onClick={() => {
                    setVoiceValidationSubmitted(true);
                    if (hasVoiceValidationErrors) {
                      void funnelContext?.onTrackFunnelEvent?.('podcast_prepare_script_blocked', {
                        reason: 'validation_errors',
                        podcastFormat,
                        hasHostVoice: !!selectedVoiceId,
                        hasGuestVoice: !!selectedGuestVoiceId,
                      });
                      return;
                    }
                    setSubStep(3);
                  }}
                  disabled={voicesLoading || !canContinueFromSetup || hasVoiceValidationErrors}
                >
                  Continue to Script
                </Button>
              </div>
            </div>
          )}

          {subStep === 3 && (
            <div className="space-y-4">
              <Card className="border-border bg-muted/20">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-sm">Translated Script</CardTitle>
                  <CardDescription>
                    Edit each speaker turn inline. The speaker labels stay internal so the generated audio keeps the right voices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs text-muted-foreground">
                    Podcast script translation is included at no extra LPC cost in this run.
                  </div>
                  <div className="space-y-3">
                    {parsedScriptTurns.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                        No translated script yet. Click Prepare Translated Script to build the translated script from the selected source.
                      </div>
                    )}
                    {parsedScriptTurns.map((turn, idx) => {
                      const theme = turnTheme[turn.speaker];
                      const speakerLabel =
                        turn.speaker === 'host'
                          ? (hostDisplayName.trim() || theme.label)
                          : turn.speaker === 'guest'
                            ? (guestDisplayName.trim() || theme.label)
                            : theme.label;
                      return (
                        <Card key={`${turn.speaker}-${idx}`} className={`overflow-hidden border ${theme.shell} shadow-sm`}>
                          <div className={`h-1.5 ${theme.accent}`} />
                          <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge className={`${theme.chip} border-0 text-[11px] uppercase tracking-wide`}>
                                  {speakerLabel}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Turn {idx + 1}
                                </span>
                              </div>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteScriptTurn(idx)}
                                aria-label={`Delete ${speakerLabel} turn`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <Textarea
                              value={turn.text}
                              onChange={(e) => updateScriptTurnText(idx, e.target.value)}
                              className="min-h-[120px] rounded-xl border-border bg-background/80 shadow-none resize-y focus-visible:ring-primary/40"
                              aria-label={`${speakerLabel} script text`}
                            />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={() => {
                        if (sourceContractChanged) {
                          toast({
                            title: 'Source changed',
                            description: copy.blockedPrepare,
                            variant: 'destructive',
                          });
                          void funnelContext?.onTrackFunnelEvent?.('podcast_prepare_script_blocked', { reason: 'source_changed' });
                          return;
                        }
                        if (hasVoiceValidationErrors) {
                          setVoiceValidationSubmitted(true);
                          return;
                        }
                        if (parsedScriptTurns.length > 0 && !window.confirm('Re-prepare will replace the translated script currently on this page. Continue?')) {
                          return;
                        }
                        scriptPreviewMutation.mutate();
                      }}
                      disabled={scriptPreviewMutation.isPending}
                    >
                      {scriptPreviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mic2 className="h-4 w-4 mr-2" />}
                      {parsedScriptTurns.length === 0 ? 'Prepare Translated Script' : 'Re-prepare Translated Script'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <div className="flex justify-between sticky bottom-2 sm:static z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 p-2 rounded-md border border-border">
                <Button variant="outline" onClick={() => setSubStep(2)}>Back</Button>
                <Button onClick={() => {
                    if (sourceContractChanged) {
                      toast({
                        title: 'Source changed',
                        description: copy.blockedEstimate,
                        variant: 'destructive',
                      });
                      return;
                    }
                    estimateMutation.mutate();
                  }}
                  disabled={estimateMutation.isPending || scriptText.trim().length < 30}
                >
                  {estimateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                  Estimate Audio Generation
                </Button>
              </div>
            </div>
          )}

          {subStep === 4 && (
            <div className="space-y-4">
              <Card className="border-border bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-sm">Estimate Preview</CardTitle>
                  <CardDescription>Transparent breakdown before generation starts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Script characters</span><span>{estimatedCharacters ?? '—'}</span></div>
                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Estimated audio generation cost</div>
                    <div className="text-2xl font-semibold text-primary">{estimatedLpcCost ?? '—'} {estimatedLpcCost !== null ? 'LPC' : ''}</div>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Estimated audio generation cost</span><span>{estimatedLpcCost ?? '—'} LPC</span></div>
                  <Separator />
                  <div className="text-xs text-muted-foreground">Lesson digest and podcast script translation are included at no extra LPC cost in this translation run.</div>
                </CardContent>
              </Card>
              <div className="flex justify-between sticky bottom-2 sm:static z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 p-2 rounded-md border border-border">
                <Button variant="outline" onClick={() => setSubStep(3)}>Back</Button>
                <Button onClick={() => {
                    if (sourceContractChanged) {
                      toast({
                        title: 'Source changed',
                        description: copy.blockedGenerate,
                        variant: 'destructive',
                      });
                      void funnelContext?.onTrackFunnelEvent?.('podcast_generate_blocked', { reason: 'source_changed' });
                      return;
                    }
                    generateMutation.mutate();
                  }}
                  disabled={generateMutation.isPending || scriptText.trim().length < 30}
                >
                  {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Radio className="h-4 w-4 mr-2" />}
                  Generate Translated Podcast Audio
                </Button>
              </div>
            </div>
          )}

          {subStep === 5 && (
            <div className="space-y-4">
              <Card className="border-border bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-sm">Generation Status</CardTitle>
                  <CardDescription>
                    Track translated podcast generation without leaving this wizard.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3" aria-live="polite">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current job</span>
                    <Badge variant="outline" className={getStatusBadgeClass(currentJobStatus)}>{statusLabel(currentJobStatus)}</Badge>
                  </div>
                  {podcastStateQuery.data?.currentJob?.errorMessage && (
                    <p className="text-xs text-destructive">{podcastStateQuery.data.currentJob.errorMessage}</p>
                  )}
                  <Button variant="outline" onClick={() => void refetchPodcastStatus()} disabled={podcastStateQuery.isFetching}>
                    {podcastStateQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Refresh Status
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {lastStatusCheckedAt
                      ? `Last checked ${lastStatusCheckedAt.toLocaleTimeString()}`
                      : 'Status refreshes automatically while generation is running.'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm">Target Language Versions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(podcastStateQuery.data?.versions || [])
                    .filter((version) => String(version.languageCode || '').toLowerCase() === targetLanguageCode.toLowerCase())
                    .slice(0, 5)
                    .map((version) => (
                      <div key={version.id} className="flex items-center justify-between rounded border border-border/70 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{version.title || `Podcast ${version.id.slice(0, 8)}`}</p>
                          <p className="text-muted-foreground">{version.createdAt ? new Date(version.createdAt).toLocaleString() : '—'}</p>
                          {String(version.status || '').toLowerCase() === 'completed' && (
                            <audio
                              className="mt-2 h-8 w-full"
                              controls
                              preload="metadata"
                              src={`/api/lessons/${translatedLessonId}/podcast/download?organizationId=${encodeURIComponent(organizationId)}&versionId=${encodeURIComponent(String(version.id))}&languageCode=${encodeURIComponent(targetLanguageCode.toLowerCase())}`}
                            />
                          )}
                        </div>
                        <Badge variant="outline" className={getStatusBadgeClass(String(version.status || 'idle'))}>{statusLabel(String(version.status || 'idle'))}</Badge>
                      </div>
                    ))}
                  {!hasCompletedAudio && (
                    <p className="text-xs text-muted-foreground">No completed target-language audio yet. Generation may still be running.</p>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between sticky bottom-2 sm:static z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 p-2 rounded-md border border-border">
                <Button variant="outline" onClick={() => setSubStep(4)}>Back</Button>
                <Button onClick={() => setSubStep(1)} variant="outline">Edit Settings</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/20">
        <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
          <p><span className="font-medium text-foreground">Included in this translation run at no extra LPC:</span> lesson digest and podcast script translation.</p>
          <p>Podcast audio generation uses podcast pricing and is shown in the estimate step before generation.</p>
          <p>All progress is saved server-side; you can safely refresh and return.</p>
        </CardContent>
      </Card>
    </div>
  );
}
