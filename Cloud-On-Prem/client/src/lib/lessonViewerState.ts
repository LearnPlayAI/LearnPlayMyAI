export type ViewerConversionStatus = "ready" | "pending" | "failed" | "unsupported";

export type LessonLanguageOption = {
  code: string;
  name: string;
  nativeName: string;
  lessonId: string;
  isDefault: boolean;
};

export type LessonArtifactPointer = {
  resolvedLessonId?: string | null;
  isFallback?: boolean | null;
};

export type LessonArtifactResolution = {
  sourceLanguageCode?: string | null;
  pptx?: LessonArtifactPointer | null;
  video?: LessonArtifactPointer | null;
  podcast?: LessonArtifactPointer | null;
  digest?: LessonArtifactPointer | null;
  stepGuide?: LessonArtifactPointer | null;
};

function normalizeLanguageCode(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function firstFallbackLessonId(artifactResolution?: LessonArtifactResolution | null): string {
  if (!artifactResolution) return "";
  const candidates = [
    artifactResolution.pptx,
    artifactResolution.video,
    artifactResolution.podcast,
    artifactResolution.digest,
    artifactResolution.stepGuide,
  ];
  const fallback = candidates.find((candidate) => candidate?.isFallback && candidate?.resolvedLessonId);
  return String(fallback?.resolvedLessonId || "").trim();
}

export function buildLessonLanguageOptions(params: {
  availableLanguages?: LessonLanguageOption[] | null;
  artifactResolution?: LessonArtifactResolution | null;
}): LessonLanguageOption[] {
  const result: LessonLanguageOption[] = [];
  const seen = new Set<string>();

  for (const language of params.availableLanguages || []) {
    const code = normalizeLanguageCode(language.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ ...language, code });
  }

  const sourceLanguageCode = normalizeLanguageCode(params.artifactResolution?.sourceLanguageCode);
  const sourceLessonId = firstFallbackLessonId(params.artifactResolution);
  if (sourceLanguageCode && sourceLessonId && !seen.has(sourceLanguageCode)) {
    const label = sourceLanguageCode.toUpperCase();
    result.push({
      code: sourceLanguageCode,
      name: label,
      nativeName: label,
      lessonId: sourceLessonId,
      isDefault: true,
    });
  }

  return result;
}

export function hasRenderableLessonContent(params: {
  slideImageCount?: number | null;
  viewerUrl?: string | null;
  videoUrl?: string | null;
  hasPPTX?: boolean | null;
  isLocalPptx?: boolean | null;
  conversionStatus?: ViewerConversionStatus | null;
  digestSectionCount?: number | null;
  stepGuideStepCount?: number | null;
  podcastVersionCount?: number | null;
  hasActivePodcastVersion?: boolean | null;
  sourceLessonSectionCount?: number | null;
  sourceLessonVisualCount?: number | null;
}): boolean {
  return (
    (params.slideImageCount ?? 0) > 0 ||
    !!params.viewerUrl ||
    !!params.videoUrl ||
    (!!params.hasPPTX && !!params.isLocalPptx && params.conversionStatus !== "failed" && params.conversionStatus !== "unsupported") ||
    (params.sourceLessonSectionCount ?? 0) > 0 ||
    (params.sourceLessonVisualCount ?? 0) > 0 ||
    (params.digestSectionCount ?? 0) > 0 ||
    (params.stepGuideStepCount ?? 0) > 0 ||
    (params.podcastVersionCount ?? 0) > 0 ||
    !!params.hasActivePodcastVersion
  );
}
