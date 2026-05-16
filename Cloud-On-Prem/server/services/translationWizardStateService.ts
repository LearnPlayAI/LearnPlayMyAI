type WizardParentStep = "select_language" | "translate_content" | "review_edit" | "podcast" | "pptx" | "complete";

export interface TranslationWizardStateInput {
  version?: unknown;
  clientSessionId?: unknown;
  parentStep?: unknown;
  includePodcastTranslation?: unknown;
  targetLanguageCode?: unknown;
  translatedLessonId?: unknown;
  podcast?: {
    subStep?: unknown;
    selectedSourceScriptId?: unknown;
    podcastFormat?: unknown;
    duration?: unknown;
    focusTopic?: unknown;
    selectedVoiceId?: unknown;
    selectedGuestVoiceId?: unknown;
    hostDisplayName?: unknown;
    guestDisplayName?: unknown;
    scriptId?: unknown;
    scriptText?: unknown;
    estimatedLpcCost?: unknown;
    estimatedCharacters?: unknown;
    hasTriggeredGeneration?: unknown;
  } | unknown;
}

export function sanitizeTranslationWizardState(params: {
  input: TranslationWizardStateInput;
  userId: string;
  translatedLessonId: string;
  fallbackTargetLanguageCode?: string | null;
}) {
  const { input, userId, translatedLessonId, fallbackTargetLanguageCode } = params;
  const allowedParentSteps: WizardParentStep[] = ["select_language", "translate_content", "review_edit", "podcast", "pptx", "complete"];

  const parentStepRaw = String(input?.parentStep || "").trim().toLowerCase();
  const includePodcastTranslation = input?.includePodcastTranslation === true;
  const podcastInput = input?.podcast && typeof input.podcast === "object" ? input.podcast as any : {};

  const parsedSubStep = Number(podcastInput?.subStep || 1);
  const boundedSubStep = Number.isFinite(parsedSubStep) ? Math.max(1, Math.min(5, Math.floor(parsedSubStep))) : 1;
  const clientSessionIdRaw = String(input?.clientSessionId || '').trim();
  const clientSessionId = clientSessionIdRaw ? clientSessionIdRaw.slice(0, 128) : null;

  return {
    version: 1,
    clientSessionId,
    parentStep: (allowedParentSteps.includes(parentStepRaw as WizardParentStep) ? parentStepRaw : "select_language") as WizardParentStep,
    includePodcastTranslation,
    targetLanguageCode: String(input?.targetLanguageCode || fallbackTargetLanguageCode || "").trim().toLowerCase() || null,
    translatedLessonId,
    podcast: {
      subStep: boundedSubStep,
      selectedSourceScriptId: String(podcastInput?.selectedSourceScriptId || ""),
      podcastFormat: podcastInput?.podcastFormat === "conversation" ? "conversation" : "bulletin",
      duration: podcastInput?.duration === "short" || podcastInput?.duration === "long" ? podcastInput.duration : "default",
      focusTopic: typeof podcastInput?.focusTopic === "string" ? podcastInput.focusTopic : "",
      selectedVoiceId: typeof podcastInput?.selectedVoiceId === "string" ? podcastInput.selectedVoiceId : "",
      selectedGuestVoiceId: typeof podcastInput?.selectedGuestVoiceId === "string" ? podcastInput.selectedGuestVoiceId : "",
      hostDisplayName: typeof podcastInput?.hostDisplayName === "string" ? podcastInput.hostDisplayName : "",
      guestDisplayName: typeof podcastInput?.guestDisplayName === "string" ? podcastInput.guestDisplayName : "",
      scriptId: typeof podcastInput?.scriptId === "string" ? podcastInput.scriptId : "",
      scriptText: typeof podcastInput?.scriptText === "string" ? podcastInput.scriptText : "",
      estimatedLpcCost: Number.isFinite(Number(podcastInput?.estimatedLpcCost)) ? Number(podcastInput.estimatedLpcCost) : null,
      estimatedCharacters: Number.isFinite(Number(podcastInput?.estimatedCharacters)) ? Number(podcastInput.estimatedCharacters) : null,
      hasTriggeredGeneration: podcastInput?.hasTriggeredGeneration === true,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
}
