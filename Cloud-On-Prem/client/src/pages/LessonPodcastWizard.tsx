import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePodcastScriptTools } from "@/hooks/usePodcastScriptTools";
import { apiRequest, queryClient, invalidateLanguageAwareContentCaches } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, PlusCircle, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PodcastPlayer } from "@/components/PodcastPlayer";

type PodcastSourceType = "sourcedb" | "word" | "pptx";
type PodcastFormat = "bulletin" | "conversation";
type PodcastDuration = "short" | "default" | "long";
type WizardMode = "generate" | "translate";

interface SourceOption {
  key: PodcastSourceType;
  label: string;
  enabled: boolean;
  description: string;
}

interface VoiceOption {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string | null;
  labels?: Record<string, string>;
}

interface PodcastVersion {
  id: string;
  createdAt: string;
  status: "completed" | "failed";
  languageCode?: string;
  title?: string;
  sourceType: PodcastSourceType;
  voiceId: string;
  voiceName?: string;
  guestVoiceId?: string;
  guestVoiceName?: string;
  format?: PodcastFormat;
  duration?: PodcastDuration;
  focusTopic?: string;
  scriptId?: string;
  estimatedLpcCost?: number;
  estimatedDurationSec?: number;
  actualLpcCost?: number;
  actualElevenCharactersUsed?: number;
  providerUsageUnit?: "character";
  providerUsageAmount?: number;
  providerCostUsd?: number;
  providerCostLocal?: number;
  providerCostCurrency?: string;
  fxRateUsdToLocal?: number;
  pricingConfigVersion?: string;
  estimateToFinalLpcDelta?: number;
  creditSource?: "user" | "organization" | "split";
  userAmountDeducted?: number;
  orgAmountDeducted?: number;
  errorMessage?: string;
}

interface PodcastScriptSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: PodcastSourceType;
  sourceMaterialId?: string;
  format: PodcastFormat;
  duration: PodcastDuration;
  focusTopic?: string;
  voiceId: string;
  guestVoiceId?: string;
  hostDisplayName?: string;
  guestDisplayName?: string;
  estimatedCharacters?: number;
  estimatedLpcCost?: number;
  languageCode?: string;
  sourceScriptId?: string;
  hasRawResponse?: boolean;
  hasSegments?: boolean;
}

interface PodcastStateResponse {
  lessonId: string;
  lessonTitle?: string;
  courseTitle?: string;
  languageCode: string;
  sourceAvailability: Record<PodcastSourceType, boolean>;
  sourcePreviews?: Record<PodcastSourceType, string>;
  suggestedFocusTopic?: string;
  subscriptionUsage?: {
    characterCount?: number;
    characterLimit?: number;
    nextCharacterCountResetUnix?: number | null;
  } | null;
  usageEvents?: Array<{
    id: string;
    stage: string;
    createdAt: string;
    elevenCharactersUsed?: number | null;
    elevenCharacterCount?: number | null;
    elevenCharacterLimit?: number | null;
    errorMessage?: string;
    languageCode?: string;
  }>;
  auditArtifacts?: Array<{
    id: string;
    createdAt: string;
    languageCode: string;
    versionId?: string;
    scriptId?: string;
    stage: string;
    artifactType: string;
    label: string;
    bytes: number;
  }>;
  draft: any;
  drafts?: any[];
  currentJob: { status: "idle" | "processing" | "completed" | "failed"; errorMessage?: string; updatedAt: string };
  activeVersionId: string | null;
  activeVersion?: PodcastVersion | null;
  versions: PodcastVersion[];
  scripts?: PodcastScriptSummary[];
  activeUrl: string | null;
  sourceMaterials?: Array<{
    id: string;
    sourceType: "word";
    version: number;
    originalFilename: string;
    mimeType: string;
    wordCount: number;
    createdAt: string;
  }>;
}

function getQueryParam(search: string, key: string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  return params.get(key) || "";
}

function deriveSpeakerDisplayName(voiceLabel: string, fallback: string): string {
  const raw = String(voiceLabel || "").trim();
  if (!raw) return fallback;
  const head = raw.split("-")[0]?.trim() || raw;
  const firstToken = head.split(/\s+/)[0]?.trim();
  return firstToken || fallback;
}

function normalizeForSearch(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function voiceMatchesSearch(voice: VoiceOption, searchTerm: string): boolean {
  const term = normalizeForSearch(searchTerm);
  if (!term) return true;
  const labels = Object.values(voice.labels || {}).join(" ").toLowerCase();
  return `${voice.name} ${voice.category || ""} ${labels}`.toLowerCase().includes(term);
}

function guestCompatibilityScore(hostVoice: VoiceOption | undefined, candidate: VoiceOption): number {
  if (!hostVoice || hostVoice.voiceId === candidate.voiceId) return -1;
  let score = 0;
  if ((hostVoice.category || "").toLowerCase() === (candidate.category || "").toLowerCase()) score += 4;
  const hostLabels = hostVoice.labels || {};
  const candidateLabels = candidate.labels || {};
  const matchKeys = ["accent", "language", "age", "gender", "style", "use_case"];
  for (const key of matchKeys) {
    const hostValue = normalizeForSearch(hostLabels[key] || "");
    const candidateValue = normalizeForSearch(candidateLabels[key] || "");
    if (!hostValue || !candidateValue) continue;
    if (hostValue === candidateValue) score += 3;
  }
  return score;
}

function voiceSupportsLanguage(voice: VoiceOption, languageHint: string): boolean {
  const hint = normalizeForSearch(languageHint);
  if (!hint) return true;
  const labels = voice.labels || {};
  const corpus = [
    voice.name,
    voice.category,
    labels.language,
    labels.languages,
    labels.accent,
    labels.description,
    ...Object.values(labels),
  ]
    .map((value) => normalizeForSearch(String(value || "")))
    .filter(Boolean)
    .join(" ");
  return corpus.includes(hint);
}

export default function LessonPodcastWizard() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ lessonId: string }>("/lessons/:lessonId/podcast-wizard");
  const { toast } = useToast();
  const { isSuperAdmin, isCustSuper } = useAuth();
  const { parseScriptTurns, serializeTurnsToScript, formatScriptForEditor, insertScriptTurnPair } = usePodcastScriptTools();

  const lessonId = params?.lessonId || "";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const courseId = getQueryParam(search, "courseId");
  const courseNameFromQuery = getQueryParam(search, "courseName").trim();
  const lessonTitleFromQuery = getQueryParam(search, "lessonTitle").trim();
  const returnTo = getQueryParam(search, "returnTo");
  const openStatusFromQuery = getQueryParam(search, "openStatus") === "1";
  const regenerateFromQuery = getQueryParam(search, "regenerate") === "1";
  const scriptIdFromQuery = getQueryParam(search, "scriptId").trim();
  const sourceLessonIdFromQuery = getQueryParam(search, "sourceLessonId").trim();
  const targetLanguageFromQuery = getQueryParam(search, "targetLanguageCode").trim().toLowerCase();
  const autoPrepareTranslatedScript = getQueryParam(search, "autoPrepareTranslatedScript") === "1";

  const hasSourceDbFromQuery = getQueryParam(search, "hasSourceDb") === "1";
  const hasWordFromQuery = getQueryParam(search, "hasWord") === "1";
  const hasPptxFromQuery = getQueryParam(search, "hasPptx") === "1";

  const sourceOptions: SourceOption[] = useMemo(() => ([
    { key: "sourcedb", label: "Source DB Content", enabled: hasSourceDbFromQuery, description: "Use the latest lesson source text." },
    { key: "word", label: "Word Document", enabled: hasWordFromQuery, description: "Use uploaded Word source document content." },
    { key: "pptx", label: "Presentation (PPTX)", enabled: hasPptxFromQuery, description: "Use existing presentation content as input." },
  ]), [hasPptxFromQuery, hasSourceDbFromQuery, hasWordFromQuery]);

  const firstEnabled = sourceOptions.find((o) => o.enabled)?.key || "sourcedb";
  const [selectedSource, setSelectedSource] = useState<PodcastSourceType>(firstEnabled as PodcastSourceType);
  const [selectedWordSourceMaterialId, setSelectedWordSourceMaterialId] = useState<string>("");
  const [podcastFormat, setPodcastFormat] = useState<PodcastFormat>("bulletin");
  const [duration, setDuration] = useState<PodcastDuration>("default");
  const [focusTopic, setFocusTopic] = useState("");
  const [draftName, setDraftName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [selectedGuestVoiceId, setSelectedGuestVoiceId] = useState("");
  const [hostDisplayName, setHostDisplayName] = useState("");
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [hostNameTouched, setHostNameTouched] = useState(false);
  const [guestNameTouched, setGuestNameTouched] = useState(false);
  const [hostVoiceSearch, setHostVoiceSearch] = useState("");
  const [guestVoiceSearch, setGuestVoiceSearch] = useState("");
  const [voiceFieldTouched, setVoiceFieldTouched] = useState({ hostVoice: false, guestVoice: false });
  const [voiceValidationSubmitted, setVoiceValidationSubmitted] = useState(false);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string>("");
  const [isComparePlaying, setIsComparePlaying] = useState(false);
  const [isStep2TransitionPending, setIsStep2TransitionPending] = useState(false);
  const [scriptId, setScriptId] = useState<string>("");
  const [scriptText, setScriptText] = useState("");
  const [selectedScriptVersionId, setSelectedScriptVersionId] = useState(scriptIdFromQuery);
  const [didLoadScriptFromQuery, setDidLoadScriptFromQuery] = useState(false);
  const [scriptContextKey, setScriptContextKey] = useState<string>("");
  const [isGenerationKickoffPending, setIsGenerationKickoffPending] = useState(false);
  const [hasPendingGenerationKickoff, setHasPendingGenerationKickoff] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>(targetLanguageFromQuery ? "translate" : "generate");
  const [targetLanguageCode, setTargetLanguageCode] = useState(targetLanguageFromQuery || "");
  const [step, setStep] = useState(1);
  const [forceStepOneFromRegenerate, setForceStepOneFromRegenerate] = useState(regenerateFromQuery);
  const [createNewDraftRequested, setCreateNewDraftRequested] = useState(regenerateFromQuery);
  const [replacementTitle, setReplacementTitle] = useState("");
  const [didHydrateFromDraft, setDidHydrateFromDraft] = useState(false);
  const [didAutoPrepareTranslatedScript, setDidAutoPrepareTranslatedScript] = useState(false);
  const dirtyTrackingReadyRef = useRef(false);
  const lastHydratedDraftIdRef = useRef<string | null>(null);
  const hostAudioRef = useRef<HTMLAudioElement | null>(null);
  const guestAudioRef = useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const sourceUploadInputRef = useRef<HTMLInputElement>(null);

  const currentScriptContextKey = useMemo(
    () =>
      JSON.stringify({
        sourceType: selectedSource,
        sourceMaterialId: selectedSource === "word" ? selectedWordSourceMaterialId : "",
        format: podcastFormat,
        duration,
        focusTopic: focusTopic.trim(),
        voiceId: selectedVoiceId,
        guestVoiceId: podcastFormat === "conversation" ? selectedGuestVoiceId : "",
        hostDisplayName: hostDisplayName.trim(),
        guestDisplayName: podcastFormat === "conversation" ? guestDisplayName.trim() : "",
      }),
    [selectedSource, selectedWordSourceMaterialId, podcastFormat, duration, focusTopic, selectedVoiceId, selectedGuestVoiceId, hostDisplayName, guestDisplayName]
  );

  const { data: state, isLoading: stateLoading, refetch: refetchState } = useQuery<PodcastStateResponse>({
    queryKey: ["/api/lessons", lessonId, "podcast-state"],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("organizationId", getQueryParam(search, "organizationId"));
      if (courseId) params.set("courseId", courseId);
      return apiRequest(`/api/lessons/${lessonId}/podcast/state?${params.toString()}`);
    },
    enabled: !!lessonId,
    refetchInterval: (query) => {
      const status = (query.state.data as PodcastStateResponse | undefined)?.currentJob?.status;
      if (step === 5 && (status === "processing" || hasPendingGenerationKickoff)) {
        return 3000;
      }
      return status === "processing" ? 3000 : 15000;
    },
  });

  const { data: supportedLanguages } = useQuery<Array<{ code: string; name: string; nativeName: string }>>({
    queryKey: ["/api/languages"],
  });

  const {
    data: voicesData,
    isLoading: voicesLoading,
    isError: voicesIsError,
    error: voicesError,
    refetch: refetchVoices,
  } = useQuery<{ voices: VoiceOption[] }>({
    queryKey: ["/api/podcast/voices"],
    queryFn: () => apiRequest("/api/podcast/voices"),
    enabled: step >= 2,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const resolvedSourceOptions: SourceOption[] = useMemo(
    () =>
      sourceOptions.map((option) => ({
        ...option,
        enabled: state?.sourceAvailability?.[option.key] ?? option.enabled,
      })),
    [sourceOptions, state?.sourceAvailability]
  );
  const enabledCount = resolvedSourceOptions.filter((o) => o.enabled).length;

  const voices = voicesData?.voices || [];
  const effectiveLanguageCode = (wizardMode === "translate"
    ? targetLanguageCode.trim().toLowerCase()
    : String(state?.languageCode || "en").toLowerCase()
  ).trim();
  const effectiveLanguageName = useMemo(() => {
    if (!effectiveLanguageCode) return "";
    const match = (supportedLanguages || []).find((lang) => String(lang.code).toLowerCase() === effectiveLanguageCode);
    return match?.name || match?.nativeName || effectiveLanguageCode;
  }, [supportedLanguages, effectiveLanguageCode]);
  const languageCompatibleVoices = useMemo(() => {
    if (!effectiveLanguageCode) return voices;
    const language = (supportedLanguages || []).find((lang) => String(lang.code).toLowerCase() === effectiveLanguageCode);
    const hints = Array.from(new Set([
      effectiveLanguageCode,
      normalizeForSearch(language?.name || ""),
      normalizeForSearch(language?.nativeName || ""),
    ].filter(Boolean)));
    const matched = voices.filter((voice) => hints.some((hint) => voiceSupportsLanguage(voice, hint)));
    return matched.length > 0 ? matched : voices;
  }, [voices, effectiveLanguageCode, supportedLanguages]);
  const isLanguageVoiceFallback = languageCompatibleVoices.length === voices.length
    && !!effectiveLanguageCode
    && voices.length > 0
    && !voices.some((voice) => voiceSupportsLanguage(voice, effectiveLanguageCode));
  const parsedScriptTurns = useMemo(
    () => parseScriptTurns(scriptText, { preserveWhitespace: true, preserveEmptyTurns: podcastFormat === "conversation" }),
    [parseScriptTurns, podcastFormat, scriptText]
  );
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const lessonDisplayName = useMemo(
    () => String(state?.lessonTitle || lessonTitleFromQuery || state?.suggestedFocusTopic || "").trim() || "Untitled Lesson",
    [state?.lessonTitle, lessonTitleFromQuery, state?.suggestedFocusTopic]
  );
  const courseDisplayName = useMemo(
    () => String(state?.courseTitle || courseNameFromQuery || "").trim(),
    [state?.courseTitle, courseNameFromQuery]
  );
  const defaultPodcastTitle = useMemo(() => {
    return String(state?.lessonTitle || state?.suggestedFocusTopic || "").trim() || "Lesson Podcast";
  }, [state?.lessonTitle, state?.suggestedFocusTopic]);
  const selectedVoice = voices.find((v) => v.voiceId === selectedVoiceId);
  const selectedGuestVoice = voices.find((v) => v.voiceId === selectedGuestVoiceId);
  const getVoiceDisplayName = useCallback((voiceId: string, fallback: string) => {
    const voice = voices.find((candidate) => candidate.voiceId === voiceId);
    return deriveSpeakerDisplayName(voice?.name || "", fallback);
  }, [voices]);
  const showExtendedCostDetails = isSuperAdmin || isCustSuper;
  const hostFilteredVoices = useMemo(
    () => languageCompatibleVoices.filter((voice) => voiceMatchesSearch(voice, hostVoiceSearch)),
    [languageCompatibleVoices, hostVoiceSearch]
  );
  const suggestedGuestVoices = useMemo(
    () =>
      languageCompatibleVoices
        .filter((voice) => voice.voiceId !== selectedVoiceId)
        .map((voice) => ({ voice, score: guestCompatibilityScore(selectedVoice, voice) }))
        .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name)),
    [languageCompatibleVoices, selectedVoiceId, selectedVoice]
  );
  const guestFilteredVoices = useMemo(
    () => suggestedGuestVoices.filter(({ voice }) => voiceMatchesSearch(voice, guestVoiceSearch)).map(({ voice }) => voice),
    [suggestedGuestVoices, guestVoiceSearch]
  );
  const suggestedGuestVoice = suggestedGuestVoices[0]?.voice;

  const voiceValidationErrors = useMemo(() => {
    const errors = {
      hostVoice: "",
      guestVoice: "",
      hostDisplayName: "",
      guestDisplayName: "",
    };
    if (!selectedVoiceId) errors.hostVoice = "Select a host voice.";
    if (!hostDisplayName.trim()) errors.hostDisplayName = podcastFormat === "conversation" ? "Enter a host display name." : "Enter a narrator display name.";
    if (podcastFormat === "conversation") {
      if (!selectedGuestVoiceId) errors.guestVoice = "Select a guest voice.";
      else if (selectedGuestVoiceId === selectedVoiceId) errors.guestVoice = "Host and guest voices must be different.";
      if (!guestDisplayName.trim()) errors.guestDisplayName = "Enter a guest display name.";
    }
    return errors;
  }, [selectedVoiceId, selectedGuestVoiceId, hostDisplayName, guestDisplayName, podcastFormat]);

  const hasStep2ValidationErrors = useMemo(
    () => Object.values(voiceValidationErrors).some(Boolean),
    [voiceValidationErrors]
  );
  const showValidationError = (field: keyof typeof voiceValidationErrors) => {
    if (voiceValidationSubmitted) return Boolean(voiceValidationErrors[field]);
    if (field === "hostDisplayName") return hostNameTouched && Boolean(voiceValidationErrors[field]);
    if (field === "guestDisplayName") return guestNameTouched && Boolean(voiceValidationErrors[field]);
    if (field === "hostVoice") return voiceFieldTouched.hostVoice && Boolean(voiceValidationErrors[field]);
    return voiceFieldTouched.guestVoice && Boolean(voiceValidationErrors[field]);
  };

  const voiceChecklist = useMemo(() => {
    const list = [
      { label: "Host voice selected", done: Boolean(selectedVoiceId) },
      { label: podcastFormat === "conversation" ? "Host display name set" : "Narrator display name set", done: Boolean(hostDisplayName.trim()) },
    ];
    if (podcastFormat === "conversation") {
      list.push({ label: "Guest voice selected", done: Boolean(selectedGuestVoiceId) });
      list.push({ label: "Guest display name set", done: Boolean(guestDisplayName.trim()) });
      list.push({ label: "Host and guest voices are different", done: Boolean(selectedVoiceId && selectedGuestVoiceId && selectedVoiceId !== selectedGuestVoiceId) });
    }
    return list;
  }, [selectedVoiceId, selectedGuestVoiceId, hostDisplayName, guestDisplayName, podcastFormat]);

  const applyServerDraftScript = (draft: any, options: { preserveLocalScriptText?: boolean } = {}) => {
    if (!draft) return;
    const nextScriptId = String(draft.scriptId || "").trim();
    if (nextScriptId) {
      setScriptId(nextScriptId);
      setSelectedScriptVersionId(nextScriptId);
    }
    if (!options.preserveLocalScriptText && typeof draft.scriptText === "string") {
      setScriptText(String(draft.scriptText));
    }
  };

  useEffect(() => {
    if (!state) return;
    const incomingDraftId = state.draft?.id ? String(state.draft.id) : null;
    const shouldHydrateDraftFields =
      !didHydrateFromDraft || (incomingDraftId !== null && incomingDraftId !== lastHydratedDraftIdRef.current);

    if (!shouldHydrateDraftFields) {
      if (state.draft?.updatedAt) {
        setLastDraftSavedAt(String(state.draft.updatedAt));
      }
      if (state.currentJob?.status === "processing") {
        setStep(5);
      }
      return;
    }

    if (state.draft?.id) {
      setSelectedDraftId(String(state.draft.id));
    }
    if (state.draft?.sourceType && ["sourcedb", "word", "pptx"].includes(state.draft.sourceType)) {
      setSelectedSource(state.draft.sourceType as PodcastSourceType);
    }
    if (state.draft?.sourceMaterialId) {
      setSelectedWordSourceMaterialId(String(state.draft.sourceMaterialId));
    }
    if (state.draft?.format && ["bulletin", "conversation"].includes(state.draft.format)) {
      setPodcastFormat(state.draft.format as PodcastFormat);
    }
    if (state.draft?.duration && ["short", "default", "long"].includes(state.draft.duration)) {
      setDuration(state.draft.duration as PodcastDuration);
    }
    if (state.draft?.focusTopic) {
      setFocusTopic(String(state.draft.focusTopic));
    } else if (state.suggestedFocusTopic) {
      setFocusTopic(String(state.suggestedFocusTopic));
    }
    if (state.draft?.voiceId) {
      setSelectedVoiceId(String(state.draft.voiceId));
    }
    if (state.draft?.guestVoiceId) {
      setSelectedGuestVoiceId(String(state.draft.guestVoiceId));
    }
    if (state.draft?.hostDisplayName) {
      setHostDisplayName(String(state.draft.hostDisplayName));
      setHostNameTouched(true);
    }
    if (state.draft?.guestDisplayName) {
      setGuestDisplayName(String(state.draft.guestDisplayName));
      setGuestNameTouched(true);
    }
    if (state.draft?.scriptId) {
      setScriptId(String(state.draft.scriptId));
      setSelectedScriptVersionId(String(state.draft.scriptId));
      setScriptContextKey(
        JSON.stringify({
          sourceType: state.draft.sourceType || firstEnabled,
          sourceMaterialId: state.draft.sourceType === "word" ? String(state.draft.sourceMaterialId || "") : "",
          format: state.draft.format || "bulletin",
          duration: state.draft.duration || "default",
          focusTopic: String(state.draft.focusTopic || "").trim(),
          voiceId: String(state.draft.voiceId || ""),
          guestVoiceId: String(state.draft.guestVoiceId || ""),
          hostDisplayName: String(state.draft.hostDisplayName || "").trim(),
          guestDisplayName: String(state.draft.guestDisplayName || "").trim(),
        })
      );
    }
    if (state.draft?.scriptText) {
      setScriptText(String(state.draft.scriptText));
    }
    if (state.draft?.title && String(state.draft.title).trim()) {
      setDraftName(String(state.draft.title));
    } else if (!didHydrateFromDraft) {
      setDraftName(String(state.lessonTitle || state.suggestedFocusTopic || "").trim() || "Lesson Podcast");
    }
    if (state.draft?.notes) {
      setNotes(String(state.draft.notes));
    }
    if (forceStepOneFromRegenerate) {
      setStep(1);
      setForceStepOneFromRegenerate(false);
    } else if (openStatusFromQuery) {
      setStep(5);
    } else if (state.currentJob?.status === "processing") {
      setStep(5);
    } else if (typeof state.draft?.currentStep === "number" && state.draft.currentStep >= 1 && state.draft.currentStep <= 5) {
      setStep(Number(state.draft.currentStep));
    }
    if (state.draft?.updatedAt) {
      setLastDraftSavedAt(String(state.draft.updatedAt));
    }
    setVoiceValidationSubmitted(false);
    setVoiceFieldTouched({ hostVoice: false, guestVoice: false });
    dirtyTrackingReadyRef.current = false;
    setIsDraftDirty(false);
    setDidHydrateFromDraft(true);
    lastHydratedDraftIdRef.current = incomingDraftId;
  }, [state, firstEnabled, didHydrateFromDraft, openStatusFromQuery, forceStepOneFromRegenerate]);

  useEffect(() => {
    if (voiceFieldTouched.hostVoice) return;
    if (wizardMode === "generate") return;
    if (!targetLanguageCode.trim()) return;
    const hasCurrent = languageCompatibleVoices.some((voice) => voice.voiceId === selectedVoiceId);
    if (!hasCurrent && languageCompatibleVoices.length > 0) {
      setSelectedVoiceId(languageCompatibleVoices[0].voiceId);
    }
  }, [wizardMode, targetLanguageCode, languageCompatibleVoices, selectedVoiceId, voiceFieldTouched.hostVoice]);

  useEffect(() => {
    if (voiceFieldTouched.hostVoice) return;
    if (!selectedVoiceId && languageCompatibleVoices.length > 0) {
      setSelectedVoiceId(languageCompatibleVoices[0].voiceId);
    }
  }, [languageCompatibleVoices, selectedVoiceId, voiceFieldTouched.hostVoice]);

  useEffect(() => {
    if (hostNameTouched) return;
    const fallback = podcastFormat === "conversation" ? "Host" : "Narrator";
    const selectedVoice = voices.find((voice) => voice.voiceId === selectedVoiceId);
    setHostDisplayName(deriveSpeakerDisplayName(selectedVoice?.name || "", fallback));
  }, [voices, selectedVoiceId, podcastFormat, hostNameTouched]);

  useEffect(() => {
    if (podcastFormat !== "conversation") return;
    if (guestNameTouched) return;
    const selectedGuest = voices.find((voice) => voice.voiceId === selectedGuestVoiceId);
    setGuestDisplayName(deriveSpeakerDisplayName(selectedGuest?.name || "", "Guest"));
  }, [voices, selectedGuestVoiceId, podcastFormat, guestNameTouched]);

  useEffect(() => {
    if (podcastFormat !== "conversation") return;
    if (voiceFieldTouched.guestVoice) return;
    if (!selectedVoiceId) return;
    if (
      selectedGuestVoiceId
      && selectedGuestVoiceId !== selectedVoiceId
      && languageCompatibleVoices.some((voice) => voice.voiceId === selectedGuestVoiceId)
    ) return;
    if (!suggestedGuestVoice) return;
    setSelectedGuestVoiceId(suggestedGuestVoice.voiceId);
  }, [podcastFormat, selectedVoiceId, selectedGuestVoiceId, suggestedGuestVoice, languageCompatibleVoices, voiceFieldTouched.guestVoice]);

  useEffect(() => {
    if (!targetLanguageFromQuery) return;
    if (targetLanguageCode.trim()) return;
    setTargetLanguageCode(targetLanguageFromQuery);
  }, [targetLanguageFromQuery, targetLanguageCode]);

  useEffect(() => {
    setDidAutoPrepareTranslatedScript(false);
  }, [wizardMode, targetLanguageCode]);

  useEffect(() => {
    if (wizardMode === "translate") return;
    if (!targetLanguageCode) return;
    setTargetLanguageCode("");
  }, [wizardMode, targetLanguageCode]);

  useEffect(() => {
    if (selectedSource !== "word") return;
    const sortedWordSources = (state?.sourceMaterials || [])
      .filter((item) => item.sourceType === "word")
      .slice()
      .sort((a, b) => b.version - a.version);
    if (!sortedWordSources.length) {
      setSelectedWordSourceMaterialId("");
      return;
    }
    const hasSelected = sortedWordSources.some((item) => item.id === selectedWordSourceMaterialId);
    if (!hasSelected) {
      setSelectedWordSourceMaterialId(sortedWordSources[0].id);
    }
  }, [selectedSource, selectedWordSourceMaterialId, state?.sourceMaterials]);

  useEffect(() => {
    if (!didHydrateFromDraft || step >= 5) return;
    if (!dirtyTrackingReadyRef.current) {
      dirtyTrackingReadyRef.current = true;
      return;
    }
    setIsDraftDirty(true);
  }, [
    didHydrateFromDraft,
    step,
    selectedSource,
    selectedWordSourceMaterialId,
    podcastFormat,
    duration,
    focusTopic,
    selectedVoiceId,
    selectedGuestVoiceId,
    hostDisplayName,
    guestDisplayName,
    draftName,
    notes,
    scriptId,
    scriptText,
  ]);

  const handlePodcastFormatChange = (nextValue: string) => {
    const nextFormat = nextValue as PodcastFormat;
    if (nextFormat === podcastFormat) return;
    if (podcastFormat === "conversation" && nextFormat !== "conversation") {
      const hasGuestData = Boolean(selectedGuestVoiceId || guestDisplayName.trim() || guestVoiceSearch.trim());
      if (hasGuestData) {
        const confirmed = typeof window !== "undefined"
          ? window.confirm("Switching to bulletin mode will clear guest voice settings. Continue?")
          : true;
        if (!confirmed) return;
        setSelectedGuestVoiceId("");
        setGuestDisplayName("");
        setGuestNameTouched(false);
        setGuestVoiceSearch("");
        setVoiceFieldTouched((prev) => ({ ...prev, guestVoice: false }));
      }
    }
    setVoiceValidationSubmitted(false);
    setPodcastFormat(nextFormat);
  };

  const handleComparePreview = async () => {
    const hostAudio = hostAudioRef.current;
    const guestAudio = guestAudioRef.current;
    if (!hostAudio || !guestAudio) {
      toast({
        variant: "destructive",
        title: "Preview unavailable",
        description: "Both host and guest voices need preview audio to compare.",
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
        } catch {
          toast({
            variant: "destructive",
            title: "Guest preview failed",
            description: "Unable to play guest voice preview.",
          });
        } finally {
          setIsComparePlaying(false);
        }
      };
      await hostAudio.play();
    } catch {
      setIsComparePlaying(false);
      toast({
        variant: "destructive",
        title: "Host preview failed",
        description: "Unable to play host voice preview.",
      });
    }
  };

  useEffect(() => {
    return () => {
      if (hostAudioRef.current) hostAudioRef.current.onended = null;
    };
  }, []);

  const buildPodcastRequestPayload = () => ({
    sourceType: selectedSource,
    sourceMaterialId: selectedSource === "word" ? selectedWordSourceMaterialId || undefined : undefined,
    format: podcastFormat,
    duration,
    focusTopic: focusTopic.trim() || undefined,
    scriptId: scriptId || undefined,
    scriptText: scriptText || undefined,
    voiceId: selectedVoiceId || undefined,
    guestVoiceId: podcastFormat === "conversation" ? selectedGuestVoiceId || undefined : undefined,
    voiceName: voices.find((v) => v.voiceId === selectedVoiceId)?.name,
    guestVoiceName: voices.find((v) => v.voiceId === selectedGuestVoiceId)?.name,
    hostDisplayName: hostDisplayName.trim() || undefined,
    guestDisplayName: podcastFormat === "conversation" ? guestDisplayName.trim() || undefined : undefined,
    title: draftName.trim() || defaultPodcastTitle,
    notes,
  });

  const scriptPreviewMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ scriptId: string; scriptText: string; estimatedCharacters: number; estimatedLpcCost: number; estimatedDurationSec: number }>(
        `/api/lessons/${lessonId}/podcast/script-preview?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceType: selectedSource,
            sourceMaterialId: selectedSource === "word" ? selectedWordSourceMaterialId || undefined : undefined,
            format: podcastFormat,
            duration,
            focusTopic: focusTopic.trim() || undefined,
            voiceId: selectedVoiceId || undefined,
            guestVoiceId: podcastFormat === "conversation" ? selectedGuestVoiceId || undefined : undefined,
            voiceName: voices.find((v) => v.voiceId === selectedVoiceId)?.name,
            guestVoiceName: voices.find((v) => v.voiceId === selectedGuestVoiceId)?.name,
            hostDisplayName: hostDisplayName.trim() || undefined,
            guestDisplayName: podcastFormat === "conversation" ? guestDisplayName.trim() || undefined : undefined,
          }),
        }
      ),
    onSuccess: (data) => {
      setScriptId(data.scriptId);
      setScriptText(formatScriptForEditor(data.scriptText, podcastFormat));
      setScriptContextKey(currentScriptContextKey);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Script preview failed",
        description: error?.message || "Unable to generate podcast script preview.",
      });
    },
  });

  const estimateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ estimatedCharacters: number; estimatedLpcCost: number; estimatedDurationSec: number }>(
        `/api/lessons/${lessonId}/podcast/estimate?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceType: selectedSource,
            sourceMaterialId: selectedSource === "word" ? selectedWordSourceMaterialId || undefined : undefined,
            format: podcastFormat,
            scriptText
          }),
        }
      );
    },
  });

  const loadScriptVersionMutation = useMutation({
    mutationFn: async (nextScriptId: string) =>
      apiRequest<any>(
        `/api/lessons/${lessonId}/podcast/scripts/${encodeURIComponent(nextScriptId)}?organizationId=${getQueryParam(search, "organizationId")}`
      ),
    onSuccess: (data: any) => {
      const nextFormat = (data.format === "conversation" ? "conversation" : "bulletin") as PodcastFormat;
      const nextDuration = (["short", "default", "long"].includes(String(data.duration || "")) ? data.duration : "default") as PodcastDuration;
      const nextSourceType = (["sourcedb", "word", "pptx"].includes(String(data.sourceType || "")) ? data.sourceType : "sourcedb") as PodcastSourceType;
      setSelectedScriptVersionId(String(data.id || ""));
      setScriptId(String(data.id || ""));
      setSelectedSource(nextSourceType);
      setSelectedWordSourceMaterialId(String(data.sourceMaterialId || ""));
      setPodcastFormat(nextFormat);
      setDuration(nextDuration);
      setFocusTopic(String(data.focusTopic || ""));
      setSelectedVoiceId(String(data.voiceId || ""));
      setSelectedGuestVoiceId(String(data.guestVoiceId || ""));
      setHostDisplayName(String(data.hostDisplayName || ""));
      setGuestDisplayName(String(data.guestDisplayName || ""));
      setScriptText(formatScriptForEditor(String(data.text || ""), data.format || podcastFormat));
      setScriptContextKey(JSON.stringify({
        sourceType: nextSourceType,
        sourceMaterialId: nextSourceType === "word" ? String(data.sourceMaterialId || "") : "",
        format: nextFormat,
        duration: nextDuration,
        focusTopic: String(data.focusTopic || "").trim(),
        voiceId: String(data.voiceId || ""),
        guestVoiceId: nextFormat === "conversation" ? String(data.guestVoiceId || "") : "",
        hostDisplayName: String(data.hostDisplayName || "").trim(),
        guestDisplayName: nextFormat === "conversation" ? String(data.guestDisplayName || "").trim() : "",
      }));
      setStep(3);
      setIsDraftDirty(false);
      toast({ title: "Script version loaded", description: "Edit this script or generate podcast audio from it." });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Script load failed",
        description: error?.message || "Unable to load selected script version.",
      });
    },
  });

  const buildDraftPayload = () => ({
    ...buildPodcastRequestPayload(),
    draftId: selectedDraftId || state?.draft?.id || undefined,
    createNewDraft: createNewDraftRequested,
    currentStep: step,
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/draft?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify(buildDraftPayload()),
        }
      ),
    onSuccess: (response: any) => {
      setCreateNewDraftRequested(false);
      const nextDraftId = String(response?.state?.draft?.id || "").trim();
      if (nextDraftId) {
        setSelectedDraftId(nextDraftId);
      }
      applyServerDraftScript(response?.state?.draft, { preserveLocalScriptText: true });
      const updatedAt = response?.state?.draft?.updatedAt || new Date().toISOString();
      setLastDraftSavedAt(String(updatedAt));
      setIsDraftDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      toast({ title: "Draft saved", description: "Podcast draft saved successfully." });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Draft save failed",
        description: error?.message || "Unable to save draft.",
      });
    },
  });

  const selectDraftMutation = useMutation({
    mutationFn: async (draftId: string) =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/draft/select?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify({ draftId }),
        }
      ),
    onSuccess: () => {
      setCreateNewDraftRequested(false);
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      toast({ title: "Draft loaded", description: "Selected draft is now active." });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Load draft failed",
        description: error?.message || "Unable to load selected draft.",
      });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/draft/${draftId}?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "DELETE",
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      toast({ title: "Draft deleted", description: "Selected draft was removed." });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete draft failed",
        description: error?.message || "Unable to delete selected draft.",
      });
    },
  });

  const stepDraftSaveMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/draft?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify(buildDraftPayload()),
        }
      ),
    onSuccess: (response: any) => {
      setCreateNewDraftRequested(false);
      const nextDraftId = String(response?.state?.draft?.id || "").trim();
      if (nextDraftId) {
        setSelectedDraftId(nextDraftId);
      }
      applyServerDraftScript(response?.state?.draft, { preserveLocalScriptText: true });
      const updatedAt = response?.state?.draft?.updatedAt || new Date().toISOString();
      setLastDraftSavedAt(String(updatedAt));
      setIsDraftDirty(false);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/generate?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify(buildPodcastRequestPayload()),
        }
      ),
    onSuccess: () => {
      setHasPendingGenerationKickoff(true);
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      invalidateLanguageAwareContentCaches({
        lessonId,
        courseId: courseId || undefined,
        languageCode: wizardMode === "translate" ? targetLanguageCode : (state?.languageCode || undefined),
      });
      toast({ title: "Generation started", description: "Podcast is generating in the background." });
      setStep(5);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Generation failed to start",
        description: error?.message || "Unable to start podcast generation.",
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (versionId: string) =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/active-version?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify({ versionId }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      invalidateLanguageAwareContentCaches({
        lessonId,
        courseId: courseId || undefined,
        languageCode: state?.activeVersion?.languageCode || targetLanguageCode || state?.languageCode || undefined,
      });
      toast({ title: "Active version updated", description: "Selected podcast version is now active." });
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("audio", file);
      if (replacementTitle.trim()) formData.append("title", replacementTitle.trim());
      const response = await fetch(
        `/api/lessons/${lessonId}/podcast/replace?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || json?.message || "Failed to replace podcast audio");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      invalidateLanguageAwareContentCaches({
        lessonId,
        courseId: courseId || undefined,
        languageCode: state?.activeVersion?.languageCode || targetLanguageCode || state?.languageCode || undefined,
      });
      toast({ title: "Podcast replaced", description: "Uploaded audio is now the active podcast version." });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Replace failed",
        description: error?.message || "Unable to replace podcast audio.",
      });
    },
  });

  const sourceUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("sourceFile", file);
      const response = await fetch(
        `/api/lessons/${lessonId}/podcast/source-upload?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || json?.message || "Failed to upload source document");
      }
      return json;
    },
    onSuccess: (payload: any) => {
      if (typeof window !== "undefined") {
        const nextParams = new URLSearchParams(search.replace(/^\?/, ""));
        nextParams.set("hasWord", "1");
        const nextUrl = `${window.location.pathname}?${nextParams.toString()}`;
        window.history.replaceState({}, "", nextUrl);
      }
      if (payload?.source?.id) {
        setSelectedWordSourceMaterialId(String(payload.source.id));
      }
      setSelectedSource("word");
      setScriptId("");
      setScriptText("");
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      toast({ title: "Source uploaded", description: "Word source version saved and ready for script generation." });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Source upload failed",
        description: error?.message || "Unable to upload source document.",
      });
    },
  });

  const translateGenerateMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/translate?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify({
            targetLanguageCode: targetLanguageCode.trim().toLowerCase(),
            sourceLanguageCode: state?.languageCode || "en",
            sourceLessonId: sourceLessonIdFromQuery || undefined,
            sourceScriptId: scriptId || undefined,
            sourceVersionId: state?.activeVersionId || undefined,
            ...buildPodcastRequestPayload(),
          }),
        }
      ),
    onSuccess: () => {
      setHasPendingGenerationKickoff(true);
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      invalidateLanguageAwareContentCaches({
        lessonId,
        courseId: courseId || undefined,
        languageCode: targetLanguageCode || state?.languageCode || undefined,
      });
      toast({ title: "Translation generation started", description: "Podcast translation is generating in the background." });
      setStep(5);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Podcast translation failed",
        description: error?.message || "Unable to start translated podcast generation.",
      });
    },
  });

  const prepareTranslatedScriptMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        `/api/lessons/${lessonId}/podcast/translate?organizationId=${getQueryParam(search, "organizationId")}`,
        {
          method: "POST",
          body: JSON.stringify({
            targetLanguageCode: (targetLanguageCode.trim().toLowerCase() || targetLanguageFromQuery || "").trim(),
            sourceLanguageCode: state?.languageCode || "en",
            sourceLessonId: sourceLessonIdFromQuery || undefined,
            sourceScriptId: scriptId || undefined,
            sourceVersionId: state?.activeVersionId || undefined,
            previewOnly: true,
            ...buildPodcastRequestPayload(),
          }),
        }
      ),
    onSuccess: (data: any) => {
      if (data?.scriptId) setScriptId(String(data.scriptId));
      if (data?.scriptText) {
        setScriptText(formatScriptForEditor(String(data.scriptText), podcastFormat));
      }
      setScriptContextKey(currentScriptContextKey);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId, "podcast-state"] });
      invalidateLanguageAwareContentCaches({
        lessonId,
        courseId: courseId || undefined,
        languageCode: targetLanguageCode || state?.languageCode || undefined,
      });
      toast({
        title: "Translated script prepared",
        description: "Review and edit the translated script before generation.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Prepare translated script failed",
        description: error?.message || "Unable to prepare translated podcast script.",
      });
    },
  });

  const handleNext = async () => {
    if (isStep2TransitionPending) return;
    if (step === 1) {
      if (wizardMode === "translate" && !targetLanguageCode.trim()) {
        toast({ variant: "destructive", title: "Select target language", description: "Choose a target language before continuing." });
        return;
      }
      if (!resolvedSourceOptions.some((o) => o.key === selectedSource && o.enabled)) {
        toast({ variant: "destructive", title: "Select source", description: "Choose an available source first." });
        return;
      }
      if (selectedSource === "word" && !(selectedWordSourceMaterialId || "").trim()) {
        toast({ variant: "destructive", title: "Select source version", description: "Choose a Word source version before continuing." });
        return;
      }
      await stepDraftSaveMutation.mutateAsync();
      setStep(2);
      return;
    }

    if (step === 2) {
      setVoiceValidationSubmitted(true);
      if (hasStep2ValidationErrors) {
        toast({ variant: "destructive", title: "Fix voice settings", description: "Resolve the highlighted fields before continuing." });
        return;
      }
      setIsStep2TransitionPending(true);
      try {
        await stepDraftSaveMutation.mutateAsync();
        setStep(3);
        if (!scriptText || scriptContextKey !== currentScriptContextKey) {
          setScriptId("");
          setScriptText("");
          if (wizardMode === "translate") {
            await prepareTranslatedScriptMutation.mutateAsync();
          } else {
            await scriptPreviewMutation.mutateAsync();
          }
        }
      } finally {
        setIsStep2TransitionPending(false);
      }
      return;
    }

    if (step === 3) {
      if (!scriptText || scriptText.trim().length < 30) {
        toast({ variant: "destructive", title: "Script required", description: "Generate or edit the script before continuing." });
        return;
      }
      await stepDraftSaveMutation.mutateAsync();
      estimateMutation.mutate(undefined, {
        onSuccess: () => setStep(4),
      });
    }
  };

  const handleSaveAndGenerate = async () => {
    setVoiceValidationSubmitted(true);
    if (wizardMode === "translate" && !targetLanguageCode.trim()) {
      toast({ variant: "destructive", title: "Select target language", description: "Choose a target language before starting translation." });
      return;
    }
    if (hasStep2ValidationErrors) {
      toast({ variant: "destructive", title: "Fix voice settings", description: "Resolve the highlighted fields before generating." });
      return;
    }
    if (!scriptText || scriptText.trim().length < 30) {
      toast({ variant: "destructive", title: "Script required", description: "Generate script preview before starting." });
      return;
    }
    setIsGenerationKickoffPending(true);
    try {
      await saveDraftMutation.mutateAsync();
      if (wizardMode === "translate") {
        await translateGenerateMutation.mutateAsync();
      } else {
        await generateMutation.mutateAsync();
      }
    } finally {
      setIsGenerationKickoffPending(false);
    }
  };

  useEffect(() => {
    const status = state?.currentJob?.status;
    if (!hasPendingGenerationKickoff) return;
    if (status === "processing" || status === "completed" || status === "failed") {
      setHasPendingGenerationKickoff(false);
    }
  }, [hasPendingGenerationKickoff, state?.currentJob?.status]);

  useEffect(() => {
    if (!scriptIdFromQuery || didLoadScriptFromQuery || !lessonId || !state) return;
    setDidLoadScriptFromQuery(true);
    setSelectedScriptVersionId(scriptIdFromQuery);
    loadScriptVersionMutation.mutate(scriptIdFromQuery);
  }, [scriptIdFromQuery, didLoadScriptFromQuery, lessonId, state]);

  useEffect(() => {
    if (!didHydrateFromDraft) return;
    if (!scriptContextKey) return;
    if (scriptContextKey === currentScriptContextKey) return;
    if (!scriptId && !scriptText) return;
    setScriptId("");
    setScriptText("");
  }, [didHydrateFromDraft, scriptContextKey, currentScriptContextKey, scriptId, scriptText]);

  const updateScriptTurnText = (index: number, nextText: string) => {
    const turns = parseScriptTurns(scriptText, { preserveWhitespace: true, preserveEmptyTurns: podcastFormat === "conversation" });
    if (!turns[index]) return;
    turns[index] = { ...turns[index], text: nextText };
    setScriptText(serializeTurnsToScript(turns, { preserveWhitespace: true, preserveEmptyTurns: podcastFormat === "conversation" }));
  };

  const deleteScriptTurn = (index: number) => {
    const turns = parseScriptTurns(scriptText, { preserveWhitespace: true, preserveEmptyTurns: podcastFormat === "conversation" });
    if (!turns[index]) return;
    const next = turns.filter((_, idx) => idx !== index);
    setScriptText(serializeTurnsToScript(next, { preserveWhitespace: true, preserveEmptyTurns: podcastFormat === "conversation" }));
  };

  const getScriptSpeakerDisplayName = (speaker: "host" | "guest" | "narrator") => {
    if (speaker === "host") return hostDisplayName.trim() || "Host";
    if (speaker === "guest") return guestDisplayName.trim() || "Guest";
    return hostDisplayName.trim() || "Narrator";
  };

  const addConversationTurnPair = (afterIndex: number) => {
    const turns = parseScriptTurns(scriptText, { preserveWhitespace: true, preserveEmptyTurns: true });
    const next = insertScriptTurnPair(turns, afterIndex);
    setScriptText(serializeTurnsToScript(next, { preserveWhitespace: true, preserveEmptyTurns: true }));
  };

  const getConversationInsertLabel = (afterIndex: number) => {
    const previousSpeaker = afterIndex >= 0 ? parsedScriptTurns[afterIndex]?.speaker : null;
    const firstSpeaker: "host" | "guest" = previousSpeaker === "host" ? "guest" : "host";
    const secondSpeaker: "host" | "guest" = firstSpeaker === "host" ? "guest" : "host";
    return `Insert ${getScriptSpeakerDisplayName(firstSpeaker)} + ${getScriptSpeakerDisplayName(secondSpeaker)}`;
  };

  useEffect(() => {
    if (!autoPrepareTranslatedScript) return;
    if (wizardMode !== "translate") return;
    if (!(targetLanguageCode.trim().toLowerCase() || targetLanguageFromQuery)) return;
    if (didAutoPrepareTranslatedScript) return;
    if (step !== 3) return;
    if (!selectedVoiceId) return;
    if (podcastFormat === "conversation" && !selectedGuestVoiceId) return;
    if (scriptPreviewMutation.isPending || prepareTranslatedScriptMutation.isPending) return;
    setDidAutoPrepareTranslatedScript(true);
    prepareTranslatedScriptMutation.mutate();
  }, [
    autoPrepareTranslatedScript,
    wizardMode,
    targetLanguageCode,
    targetLanguageFromQuery,
    didAutoPrepareTranslatedScript,
    step,
    selectedVoiceId,
    selectedGuestVoiceId,
    podcastFormat,
    scriptPreviewMutation.isPending,
    prepareTranslatedScriptMutation.isPending,
  ]);

  const wizardSteps = [
    { id: 1, label: "Source" },
    { id: 2, label: "Voices" },
    { id: 3, label: "Script" },
    { id: 4, label: "Estimate" },
    { id: 5, label: "Status" },
  ] as const;

  return (
    <QuizAdminLayout
      title="Podcast Generator"
      description="Create lesson podcast audio with guided steps"
      activeSection="lessons"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Podcast Wizard: Step {step} of 5</CardTitle>
            <CardDescription>
              Build podcast audio for this lesson in the background and return later anytime.
            </CardDescription>
            <div className="pt-2">
              <div className="grid grid-cols-5 gap-2">
                {wizardSteps.map((item) => {
                  const isActive = step === item.id;
                  const isDone = step > item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={async () => {
                        if (item.id === step) return;
                        if (didHydrateFromDraft && step < 5) {
                          try {
                            await stepDraftSaveMutation.mutateAsync();
                          } catch {
                            // Don't block navigation on a failed step save.
                          }
                        }
                        setStep(item.id);
                      }}
                      className={`rounded-md border px-2 py-2 text-left transition ${
                        isActive
                          ? "border-primary bg-primary/10"
                          : isDone
                            ? "border-success bg-success/10"
                            : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Step {item.id}
                      </div>
                      <div className="text-sm font-semibold">{item.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Lesson: {lessonDisplayName}</Badge>
              {!!courseDisplayName && <Badge variant="outline">Course: {courseDisplayName}</Badge>}
              <Badge variant="outline">Mode: {wizardMode === "translate" ? "Translate" : "Generate"}</Badge>
              {wizardMode === "translate" && !!targetLanguageCode.trim() && (
                <Badge variant="outline">Target: {targetLanguageCode.toUpperCase()}</Badge>
              )}
              <Badge variant={enabledCount > 0 ? "default" : "secondary"}>
                {enabledCount} source option{enabledCount === 1 ? "" : "s"} available
              </Badge>
              <Badge variant="outline">Status: {state?.currentJob?.status || "idle"}</Badge>
              {state?.draft && <Badge variant="outline">Draft available</Badge>}
            </div>
            {!!(state?.drafts?.length) && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="min-w-[280px] space-y-1">
                  <Label>Draft Versions</Label>
                  <Select
                    value={selectedDraftId}
                    onValueChange={(value) => {
                      setSelectedDraftId(value);
                      selectDraftMutation.mutate(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select draft" />
                    </SelectTrigger>
                    <SelectContent>
                      {(state?.drafts || []).map((draft: any, idx: number) => (
                        <SelectItem key={String(draft.id || `draft-${idx}`)} value={String(draft.id || "")}>
                          {String(draft.title || "Untitled Draft").trim() || "Untitled Draft"}
                          {draft.updatedAt ? ` · ${new Date(draft.updatedAt).toLocaleString()}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={() => {
                    if (!selectedDraftId) return;
                    deleteDraftMutation.mutate(selectedDraftId);
                  }}
                  disabled={!selectedDraftId || deleteDraftMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Draft
                </Button>
              </div>
            )}
            {!!(state?.scripts?.length) && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="min-w-[280px] space-y-1">
                  <Label>Script Versions</Label>
                  <Select value={selectedScriptVersionId} onValueChange={setSelectedScriptVersionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select script version" />
                    </SelectTrigger>
                    <SelectContent>
                      {(state?.scripts || []).map((script) => (
                        <SelectItem key={script.id} value={script.id}>
                          {(script.languageCode || state?.languageCode || "en").toUpperCase()}
                          {" · "}
                          {script.format === "conversation" ? "Conversation" : "Bulletin"}
                          {script.updatedAt ? ` · ${new Date(script.updatedAt).toLocaleString()}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedScriptVersionId && loadScriptVersionMutation.mutate(selectedScriptVersionId)}
                  disabled={!selectedScriptVersionId || loadScriptVersionMutation.isPending}
                >
                  {loadScriptVersionMutation.isPending ? "Loading..." : "Load Script for Editing"}
                </Button>
              </div>
            )}
            <div className="rounded-md border p-3 text-xs space-y-1">
              <p>
                ElevenLabs usage: <strong>{state?.subscriptionUsage?.characterCount ?? "-"}</strong>
                {" / "}
                <strong>{state?.subscriptionUsage?.characterLimit ?? "-"}</strong> characters
              </p>
              {typeof state?.subscriptionUsage?.nextCharacterCountResetUnix === "number" && (
                <p className="text-muted-foreground">
                  Reset at: {new Date(state.subscriptionUsage.nextCharacterCountResetUnix * 1000).toLocaleString()}
                </p>
              )}
            </div>

            {enabledCount === 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                No valid source content found. Add SourceDB text, a Word document, or a PPTX before generating podcast audio.
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 rounded-md border p-3">
                    <Label>Workflow</Label>
                    <RadioGroup
                      value={wizardMode}
                      onValueChange={(value) => setWizardMode(value as WizardMode)}
                      className="space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="generate" id="podcast-mode-generate" />
                        <div>
                          <Label htmlFor="podcast-mode-generate">Generate New Podcast</Label>
                          <p className="text-xs text-muted-foreground">Create a new podcast in the lesson language.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="translate" id="podcast-mode-translate" />
                        <div>
                          <Label htmlFor="podcast-mode-translate">Translate Existing Podcast</Label>
                          <p className="text-xs text-muted-foreground">Translate script + generate audio in a target language.</p>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <Label>Target Language</Label>
                    {wizardMode === "translate" ? (
                      <Select value={targetLanguageCode} onValueChange={setTargetLanguageCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target language" />
                        </SelectTrigger>
                        <SelectContent>
                          {(supportedLanguages || [])
                            .filter((lang) => String(lang.code).toLowerCase() !== String(state?.languageCode || "").toLowerCase())
                            .map((lang) => (
                              <SelectItem key={lang.code} value={lang.code.toLowerCase()}>
                                {lang.name} ({lang.nativeName})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={state?.languageCode || "en"}
                        readOnly
                        className="bg-muted"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Source language: {(state?.languageCode || "en").toUpperCase()}
                    </p>
                  </div>
                </div>

                <RadioGroup
                  value={selectedSource}
                  onValueChange={(value) => setSelectedSource(value as PodcastSourceType)}
                  className="space-y-2"
                >
                  {resolvedSourceOptions.map((option) => (
                    <div key={option.key} className={`rounded-md border p-3 ${option.enabled ? "" : "bg-muted/40 text-muted-foreground"}`}>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value={option.key} id={`podcast-source-${option.key}`} disabled={!option.enabled} />
                        <div className="space-y-1">
                          <Label htmlFor={`podcast-source-${option.key}`}>{option.label}</Label>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </RadioGroup>

                {(selectedSource === "sourcedb" || selectedSource === "word") && (
                  <div className="space-y-2">
                    {selectedSource === "word" && (
                      <div className="rounded-md border p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Upload a new Word source version for podcast script generation. Latest uploaded version is used for `word` source mode.
                        </p>
                        <input
                          ref={sourceUploadInputRef}
                          type="file"
                          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            sourceUploadMutation.mutate(file);
                            e.currentTarget.value = "";
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => sourceUploadInputRef.current?.click()}
                          disabled={sourceUploadMutation.isPending}
                        >
                          {sourceUploadMutation.isPending ? "Uploading..." : "Upload Word Source"}
                        </Button>
                        {!!state?.sourceMaterials?.length && (
                          <div className="space-y-2">
                            <Label>Word Source Version</Label>
                            <Select
                              value={selectedWordSourceMaterialId}
                              onValueChange={setSelectedWordSourceMaterialId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select source version" />
                              </SelectTrigger>
                              <SelectContent>
                                {(state.sourceMaterials || [])
                                  .filter((item) => item.sourceType === "word")
                                  .slice()
                                  .sort((a, b) => b.version - a.version)
                                  .map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      v{item.version} - {item.originalFilename} ({item.wordCount} words)
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                    <Label>Source Preview ({selectedSource === "sourcedb" ? "Source DB" : "Word"})</Label>
                    <Textarea
                      value={state?.sourcePreviews?.[selectedSource] || "No preview content available for this source."}
                      readOnly
                      className="min-h-[180px]"
                    />
                  </div>
                )}
                {selectedSource === "pptx" && (
                  <div className="space-y-2">
                    <Label>Source Preview (PPTX Transcript)</Label>
                    <Textarea
                      value={state?.sourcePreviews?.pptx || "No PPTX transcript preview available for this lesson."}
                      readOnly
                      className="min-h-[180px]"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Podcast Mode</Label>
                    <Select value={podcastFormat} onValueChange={handlePodcastFormatChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bulletin">Bulletin (single voice)</SelectItem>
                        <SelectItem value="conversation">Conversation (host + guest)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={duration} onValueChange={(value) => setDuration(value as PodcastDuration)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short</SelectItem>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Focus Topic</Label>
                    <Input value={focusTopic} onChange={(e) => setFocusTopic(e.target.value)} placeholder="Lesson focus topic" />
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-medium">Voice Setup Checklist</p>
                  <p className="text-xs text-muted-foreground">
                    Voice language target: <strong>{effectiveLanguageName || effectiveLanguageCode.toUpperCase() || "N/A"}</strong>
                  </p>
                  {isLanguageVoiceFallback && (
                    <p className="text-xs text-warning">
                      No strong voice-language match was found, so all available voices are shown. Choose the closest accent/tone manually.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {voiceChecklist.map((item) => (
                      <Badge key={item.label} variant={item.done ? "default" : "outline"}>
                        {item.done ? "Done" : "Pending"}: {item.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                {(isStep2TransitionPending || scriptPreviewMutation.isPending || prepareTranslatedScriptMutation.isPending) && (
                  <div className="rounded-md border border-border bg-primary/5 p-3 text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                    <span>
                      Preparing next step: {wizardMode === "translate" ? "translating and generating script preview" : "generating script preview"} now.
                    </span>
                  </div>
                )}

                <div className={podcastFormat === "conversation" ? "grid gap-3 md:grid-cols-2" : "grid gap-3"}>
                  <div className="rounded-md border p-3 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{podcastFormat === "conversation" ? "Host Role" : "Narrator Role"}</p>
                      <p className="text-xs text-muted-foreground">
                        {podcastFormat === "conversation"
                          ? "Choose the primary host voice and display name."
                          : "Choose the single narrator voice and display name."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>{podcastFormat === "conversation" ? "Host Voice Search" : "Voice Search"}</Label>
                      <Input
                        value={hostVoiceSearch}
                        onChange={(e) => setHostVoiceSearch(e.target.value)}
                        placeholder="Search by name, tone, accent, or style"
                      />
                      <p className="text-xs text-muted-foreground">Search by name, tone, accent, or style.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>{podcastFormat === "conversation" ? "Host Voice" : "Voice Selection"}</Label>
                      <Select
                          value={selectedVoiceId}
                          onValueChange={(value) => {
                            setVoiceFieldTouched((prev) => ({ ...prev, hostVoice: true }));
                            setSelectedVoiceId(value);
                            setHostDisplayName(getVoiceDisplayName(value, podcastFormat === "conversation" ? "Host" : "Narrator"));
                            setHostNameTouched(false);
                          }}
                        >
                        <SelectTrigger>
                          <SelectValue placeholder="Select host voice" />
                        </SelectTrigger>
                        <SelectContent>
                          {hostFilteredVoices.map((voice) => (
                            <SelectItem key={voice.voiceId} value={voice.voiceId}>
                              {voice.name}{voice.category ? ` (${voice.category})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showValidationError("hostVoice") && (
                        <p className="text-xs text-destructive">{voiceValidationErrors.hostVoice}</p>
                      )}
                      {!voicesLoading && !voicesIsError && hostFilteredVoices.length === 0 && (
                        <p className="text-xs text-muted-foreground">No host voices match this search. Try fewer keywords.</p>
                      )}
                      {selectedVoice?.previewUrl ? (
                        <audio
                          ref={hostAudioRef}
                          key={`host-${selectedVoice.voiceId}`}
                          controls
                          preload="none"
                          className="w-full"
                          src={selectedVoice.previewUrl}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">No preview available for selected host voice.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>{podcastFormat === "conversation" ? "Host Display Name" : "Narrator Display Name"}</Label>
                      <Input
                        value={hostDisplayName}
                        onChange={(e) => {
                          setHostNameTouched(true);
                          setHostDisplayName(e.target.value);
                        }}
                        placeholder={podcastFormat === "conversation" ? "Host" : "Narrator"}
                      />
                      {showValidationError("hostDisplayName") && (
                        <p className="text-xs text-destructive">{voiceValidationErrors.hostDisplayName}</p>
                      )}
                    </div>
                  </div>

                  {podcastFormat === "conversation" && (
                    <div className="rounded-md border p-3 space-y-3">
                      <div>
                        <p className="text-sm font-medium">Guest Role</p>
                        <p className="text-xs text-muted-foreground">Choose a complementary guest voice and guest display name.</p>
                        {!!suggestedGuestVoice && (
                          <p className="text-xs text-muted-foreground pt-1">
                            Suggested guest voice:{" "}
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() => {
                                setVoiceFieldTouched((prev) => ({ ...prev, guestVoice: true }));
                                setSelectedGuestVoiceId(suggestedGuestVoice.voiceId);
                                setGuestDisplayName(getVoiceDisplayName(suggestedGuestVoice.voiceId, "Guest"));
                                setGuestNameTouched(false);
                              }}
                            >
                              {suggestedGuestVoice.name}
                            </button>
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Guest Voice Search</Label>
                        <Input
                          value={guestVoiceSearch}
                          onChange={(e) => setGuestVoiceSearch(e.target.value)}
                          placeholder="Search by name, tone, accent, or style"
                        />
                        <p className="text-xs text-muted-foreground">Search by name, tone, accent, or style.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Guest Voice</Label>
                        <Select
                          value={selectedGuestVoiceId}
                          onValueChange={(value) => {
                            setVoiceFieldTouched((prev) => ({ ...prev, guestVoice: true }));
                            setSelectedGuestVoiceId(value);
                            setGuestDisplayName(getVoiceDisplayName(value, "Guest"));
                            setGuestNameTouched(false);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select guest voice" />
                          </SelectTrigger>
                          <SelectContent>
                            {guestFilteredVoices.map((voice) => (
                              <SelectItem key={voice.voiceId} value={voice.voiceId}>
                                {voice.name}{voice.category ? ` (${voice.category})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {showValidationError("guestVoice") && (
                          <p className="text-xs text-destructive">{voiceValidationErrors.guestVoice}</p>
                        )}
                        {!voicesLoading && !voicesIsError && guestFilteredVoices.length === 0 && (
                          <p className="text-xs text-muted-foreground">No guest voices match this search. Try fewer keywords.</p>
                        )}
                        {selectedGuestVoice?.previewUrl ? (
                          <audio
                            ref={guestAudioRef}
                            key={`guest-${selectedGuestVoice.voiceId}`}
                            controls
                            preload="none"
                            className="w-full"
                            src={selectedGuestVoice.previewUrl}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No preview available for selected guest voice.</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Guest Display Name</Label>
                        <Input
                          value={guestDisplayName}
                          onChange={(e) => {
                            setGuestNameTouched(true);
                            setGuestDisplayName(e.target.value);
                          }}
                          placeholder="Guest"
                        />
                        {showValidationError("guestDisplayName") && (
                          <p className="text-xs text-destructive">{voiceValidationErrors.guestDisplayName}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {podcastFormat === "conversation" && (
                  <div className="rounded-md border p-3 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => handleComparePreview()}
                      disabled={!selectedVoice?.previewUrl || !selectedGuestVoice?.previewUrl || isComparePlaying}
                    >
                      {isComparePlaying ? "Comparing..." : "Compare Host vs Guest"}
                    </Button>
                    <p className="text-xs text-muted-foreground">Plays host preview first, then guest preview.</p>
                  </div>
                )}

                {voicesLoading && <p className="text-xs text-muted-foreground">Loading voices from ElevenLabs...</p>}
                {voicesIsError && (
                  <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 gap-2">
                    <p className="text-xs text-destructive">
                      {String((voicesError as any)?.message || "Failed to load voices from ElevenLabs API.")}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => refetchVoices()}>
                      Retry
                    </Button>
                  </div>
                )}
                {!voicesLoading && !voicesIsError && voices.length === 0 && (
                  <p className="text-xs text-warning">
                    No voices returned by ElevenLabs API for this key. Check API key/account scope and retry.
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {(isStep2TransitionPending || scriptPreviewMutation.isPending || prepareTranslatedScriptMutation.isPending) && (
                  <div className="rounded-md border border-border bg-primary/5 p-3 text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                    <span>
                      {wizardMode === "translate"
                        ? "Preparing translated script. This step will populate automatically when ready."
                        : "Generating script preview. This step will populate automatically when ready."}
                    </span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Podcast Script Preview</Label>
                  <div className="rounded-md border bg-muted/30 p-3 min-h-[calc(100vh-340px)] space-y-2">
                    {parsedScriptTurns.length === 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          No script yet. {wizardMode === "translate"
                            ? "Click Prepare Translated Script to build translated script content from the selected source."
                            : "Click Generate Script to create one from the selected source and current step settings."}
                        </p>
                        {podcastFormat === "conversation" && (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => addConversationTurnPair(-1)}>
                              <PlusCircle className="mr-2 h-4 w-4" />
                              {getConversationInsertLabel(-1)}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {parsedScriptTurns.map((turn, idx) => (
                      <div key={`${turn.speaker}-${idx}`} className="space-y-2">
                        <div
                          className={
                            turn.speaker === "host"
                              ? "rounded-md border border-success bg-success/10 px-3 py-2"
                              : turn.speaker === "guest"
                                ? "rounded-md border border-primary bg-primary px-3 py-2"
                                : "rounded-md border border-border bg-[var(--surface-raised)] px-3 py-2"
                          }
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide">
                              {getScriptSpeakerDisplayName(turn.speaker)}
                            </p>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteScriptTurn(idx)}
                              aria-label="Delete speech section"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <Textarea
                            value={turn.text}
                            onChange={(e) => updateScriptTurnText(idx, e.target.value)}
                            className="min-h-[96px] bg-[var(--surface-raised)]"
                          />
                        </div>
                        {podcastFormat === "conversation" && (
                          <div className="flex justify-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addConversationTurnPair(idx)}
                            >
                              <PlusCircle className="mr-2 h-4 w-4" />
                              {getConversationInsertLabel(idx)}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => scriptPreviewMutation.mutate()}
                      disabled={scriptPreviewMutation.isPending}
                    >
                      {scriptPreviewMutation.isPending
                        ? "Generating script..."
                        : parsedScriptTurns.length === 0
                          ? "Generate Script"
                          : "Regenerate Script"}
                    </Button>
                    {wizardMode === "translate" && !!targetLanguageCode.trim() && (
                      <Button type="button" variant="outline" onClick={() => prepareTranslatedScriptMutation.mutate()}
                        disabled={prepareTranslatedScriptMutation.isPending}
                      >
                        {prepareTranslatedScriptMutation.isPending
                          ? "Preparing translated script..."
                          : `Prepare ${targetLanguageCode.toUpperCase()} Script`}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="podcast-draft-name">Podcast Title</Label>
                  <Input
                    id="podcast-draft-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder={defaultPodcastTitle}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="podcast-notes">Notes (optional)</Label>
                  <Textarea
                    id="podcast-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional internal notes..."
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="rounded-md border border-border bg-primary/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Primary Estimate</p>
                  <p className="text-sm text-muted-foreground">Estimated LPC (LearnPlay Credits)</p>
                  <p className="text-3xl font-bold leading-tight">{estimateMutation.data?.estimatedLpcCost ?? 0}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <p className="text-sm">Estimated characters: <strong>{estimateMutation.data?.estimatedCharacters ?? 0}</strong></p>
                  <p className="text-sm">Estimated duration: <strong>{estimateMutation.data?.estimatedDurationSec ?? 0}s</strong></p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated LPC is a pre-generation forecast. Final LPC settles after generation based on actual provider usage.
                </p>
                <p className="text-xs text-muted-foreground">
                  Script has been prepared and saved. Generation runs asynchronously in background and status updates here.
                </p>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  {(() => {
                    const currentStatus = state?.currentJob?.status || "idle";
                    const effectiveStatus = hasPendingGenerationKickoff && currentStatus === "idle"
                      ? "queued"
                      : currentStatus;
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={effectiveStatus === "failed" ? "destructive" : "outline"}>
                            {effectiveStatus}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={() => refetchState()}>
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Refresh
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setStep(3)}>
                            Edit Script & Generate New Version
                          </Button>
                        </div>
                        {(effectiveStatus === "queued" || effectiveStatus === "processing") && (
                          <div className="rounded-md border border-border bg-primary/5 p-3 text-xs text-muted-foreground mb-2">
                            {effectiveStatus === "queued"
                              ? "Generation request accepted. Waiting for worker pickup."
                              : "Generation in progress. This page auto-refreshes while processing."}
                          </div>
                        )}
                        {effectiveStatus === "processing" && <Progress value={60} className="h-2" />}
                      </>
                    );
                  })()}
                  {state?.currentJob?.errorMessage && (
                    <p className="text-xs text-destructive mt-2">{state.currentJob.errorMessage}</p>
                  )}
                  {state?.currentJob?.status === "completed" && state?.activeVersion && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>
                        Actual LPC cost charged: <strong>{state.activeVersion.actualLpcCost ?? state.activeVersion.estimatedLpcCost ?? 0}</strong>
                      </p>
                      {showExtendedCostDetails && (
                        <>
                          <p>
                            Actual ElevenLabs characters used: <strong>{state.activeVersion.actualElevenCharactersUsed ?? "-"}</strong>
                          </p>
                          {typeof state.activeVersion.providerCostUsd === "number" && (
                            <p>
                              Provider cost (USD): <strong>{state.activeVersion.providerCostUsd.toFixed(4)}</strong>
                            </p>
                          )}
                          {typeof state.activeVersion.providerCostLocal === "number" && (
                            <p>
                              Provider cost ({state.activeVersion.providerCostCurrency || "local"}):{" "}
                              <strong>{state.activeVersion.providerCostLocal.toFixed(4)}</strong>
                            </p>
                          )}
                          {typeof state.activeVersion.estimateToFinalLpcDelta === "number" && (
                            <p>
                              Estimate vs final LPC delta: <strong>{state.activeVersion.estimateToFinalLpcDelta >= 0 ? "+" : ""}{state.activeVersion.estimateToFinalLpcDelta}</strong>
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {!!(state?.usageEvents?.length) && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">ElevenLabs Usage Events</p>
                    <div className="space-y-2">
                      {(state?.usageEvents || []).slice(0, 8).map((event) => (
                        <div key={event.id} className="rounded border px-2 py-1 text-xs flex flex-wrap gap-2 items-center">
                          <Badge variant="outline">{event.stage}</Badge>
                          <span>{new Date(event.createdAt).toLocaleString()}</span>
                          {typeof event.elevenCharactersUsed === "number" && (
                            <span>Used: <strong>{event.elevenCharactersUsed}</strong></span>
                          )}
                          {typeof event.elevenCharacterCount === "number" && typeof event.elevenCharacterLimit === "number" && (
                            <span>Balance: <strong>{event.elevenCharacterCount}</strong> / {event.elevenCharacterLimit}</span>
                          )}
                          {event.errorMessage && (
                            <span className="text-destructive">{event.errorMessage}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!(state?.activeVersion?.id || state?.activeVersionId) && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Active Podcast</p>
                    <PodcastPlayer
                      lessonId={lessonId}
                      versionId={state?.activeVersion?.id || state?.activeVersionId || undefined}
                      languageCode={state?.activeVersion?.languageCode || state?.languageCode || undefined}
                      className="w-full"
                      dataTestId="audio-wizard-active-podcast"
                      debugContext="podcast_wizard_status"
                    />
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`/api/lessons/${lessonId}/podcast/download?organizationId=${getQueryParam(search, "organizationId")}&versionId=${encodeURIComponent(String(state?.activeVersion?.id || state?.activeVersionId || ""))}&languageCode=${encodeURIComponent(String(state?.activeVersion?.languageCode || state?.languageCode || "en"))}`}
                      >
                        Download MP3
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`/api/lessons/${lessonId}/podcast/script/download?organizationId=${getQueryParam(search, "organizationId")}&versionId=${encodeURIComponent(String(state?.activeVersion?.id || state?.activeVersionId || ""))}&languageCode=${encodeURIComponent(String(state?.activeVersion?.languageCode || state?.languageCode || "en"))}`}
                      >
                        Download Script (TXT)
                      </a>
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Versions</p>
                  {(state?.versions || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No versions generated yet.</p>
                  )}
                  {(state?.versions || []).map((v) => (
                    <div key={v.id} className="rounded-md border p-3 flex flex-wrap items-center gap-2">
                      <Badge variant={v.status === "completed" ? "default" : "destructive"}>{v.status}</Badge>
                      <span className="text-xs">{v.title || v.id.slice(0, 8)}</span>
                      <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                      <div className="ml-auto flex gap-2">
                        {v.status === "completed" && (
                          <>
                            <Button size="sm" variant="outline" asChild>
                              <a href={`/api/lessons/${lessonId}/podcast/stream?versionId=${v.id}`} target="_blank" rel="noreferrer">
                                <Play className="h-3 w-3 mr-1" />
                                Play
                              </a>
                            </Button>
                            <Button size="sm" onClick={() => activateMutation.mutate(v.id)}>
                              Set Active
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-medium">Replace Active Podcast with Uploaded Audio</p>
                  <Input
                    value={replacementTitle}
                    onChange={(e) => setReplacementTitle(e.target.value)}
                    placeholder="Optional version title"
                  />
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".mp3,.wav,.m4a,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      replaceMutation.mutate(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button variant="outline" onClick={() => uploadInputRef.current?.click()}
                    disabled={replaceMutation.isPending}
                  >
                    {replaceMutation.isPending ? "Uploading..." : "Upload Replacement Audio"}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              {(isGenerationKickoffPending || generateMutation.isPending) && (
                <div className="rounded-md border border-border bg-primary/5 p-3 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Starting podcast generation. Script and audio processing are running in the background.</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Draft status:{" "}
                {stepDraftSaveMutation.isPending || saveDraftMutation.isPending
                  ? "Saving..."
                  : isDraftDirty
                    ? "Unsaved changes"
                    : "All changes saved"}
                {lastDraftSavedAt ? ` · Last saved ${new Date(lastDraftSavedAt).toLocaleString()}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {step < 4 && (
                  <Button onClick={handleNext} disabled={enabledCount === 0 || estimateMutation.isPending || scriptPreviewMutation.isPending || prepareTranslatedScriptMutation.isPending || isStep2TransitionPending || stepDraftSaveMutation.isPending} >
                    {stepDraftSaveMutation.isPending
                      ? "Saving..."
                      : step === 2 && (isStep2TransitionPending || scriptPreviewMutation.isPending || prepareTranslatedScriptMutation.isPending)
                      ? (wizardMode === "translate" ? "Preparing Translated Script..." : "Generating Script...")
                      : step === 3
                        ? "Estimate LPC Cost"
                        : "Continue"}
                  </Button>
                )}
                {step === 4 && (
                  <Button onClick={handleSaveAndGenerate} disabled={saveDraftMutation.isPending || generateMutation.isPending || translateGenerateMutation.isPending} >
                    {(generateMutation.isPending || translateGenerateMutation.isPending)
                      ? "Starting..."
                      : wizardMode === "translate"
                        ? "Accept Cost & Start Translation"
                        : "Accept Cost & Generate"}
                  </Button>
                )}
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                {step < 5 && (
                  <Button variant="outline" onClick={() => saveDraftMutation.mutate()}>
                    Save Draft
                  </Button>
                )}
                {step !== 5 && (
                  <Button variant="outline" onClick={() => setStep(5)}>
                    Open Status
                  </Button>
                )}
                <Button variant="outline" onClick={() => setLocation(returnTo || (courseId ? `/course-builder/${courseId}/lessons` : "/course-builder"))}
                >
                  Back to Lessons
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
