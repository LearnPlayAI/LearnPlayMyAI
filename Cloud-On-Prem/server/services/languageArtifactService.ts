export interface PodcastArtifactSummary {
  hasPodcast: boolean;
  hasPodcastScript: boolean;
  activePodcastVersionId: string | null;
}

export interface PodcastScriptDownloadSelection {
  versionId: string | null;
  languageCode: string | null;
  scriptId: string | null;
  scriptText: string | null;
  reason?: string | null;
}

function normalizeCode(code: string | null | undefined): string {
  return String(code || "").trim().toLowerCase();
}

function getPodcastMetadata(metadata: any): any | null {
  if (!metadata || typeof metadata !== "object") return null;
  const podcast = (metadata as any).podcast;
  return podcast && typeof podcast === "object" ? podcast : null;
}

function getCompletedVersions(metadata: any) {
  const podcast = getPodcastMetadata(metadata);
  const versions = Array.isArray(podcast?.versions) ? podcast.versions : [];
  return versions.filter((version: any) => normalizeCode(version?.status) === "completed");
}

function getPodcastScripts(metadata: any) {
  const podcast = getPodcastMetadata(metadata);
  return Array.isArray(podcast?.scripts) ? podcast.scripts : [];
}

function readScriptText(metadata: any, scriptId?: string | null): string {
  const normalizedScriptId = String(scriptId || "").trim();
  if (!normalizedScriptId) return "";

  const scripts = getPodcastScripts(metadata);
  const scriptRecord = scripts.find((script: any) => String(script?.id || "").trim() === normalizedScriptId);
  return String(scriptRecord?.text || "").trim();
}

function readAnyScriptTextForLanguage(metadata: any, languageCode?: string | null): string {
  const requestedLanguage = normalizeCode(languageCode || null);
  const scripts = getPodcastScripts(metadata);
  const candidates = requestedLanguage
    ? scripts.filter((script: any) => normalizeCode(script?.languageCode) === requestedLanguage)
    : scripts;
  for (const script of candidates) {
    const text = String(script?.text || "").trim();
    if (text) return text;
  }
  return "";
}

function readVersionScriptText(metadata: any, version: any, allowLanguageFallback = false): string {
  const directText = String(version?.text || version?.scriptText || "").trim();
  if (directText) return directText;
  const linkedText = readScriptText(metadata, version?.scriptId);
  if (linkedText) return linkedText;
  if (!allowLanguageFallback) return "";
  return readAnyScriptTextForLanguage(metadata, version?.languageCode);
}

function resolveVersionWithText(metadata: any, version: any, allowLanguageFallback = false): PodcastScriptDownloadSelection | null {
  if (!version) return null;
  const scriptText = readVersionScriptText(metadata, version, allowLanguageFallback);
  if (!scriptText) return null;
  return {
    versionId: String(version?.id || "").trim() || null,
    languageCode: normalizeCode(version?.languageCode || null) || null,
    scriptId: String(version?.scriptId || "").trim() || null,
    scriptText,
    reason: null,
  };
}

export function summarizePodcastArtifacts(metadata: any, languageCode?: string | null): PodcastArtifactSummary {
  const podcast = getPodcastMetadata(metadata);
  const targetLang = normalizeCode(languageCode || null);
  const hasPodcastScript = !!readAnyScriptTextForLanguage(metadata, targetLang);
  const completed = getCompletedVersions(metadata);
  if (!podcast || !completed.length) return { hasPodcast: false, hasPodcastScript, activePodcastVersionId: null };

  const languageScoped = targetLang
    ? completed.filter((v: any) => normalizeCode(v?.languageCode) === targetLang)
    : completed;
  if (!languageScoped.length) return { hasPodcast: false, hasPodcastScript, activePodcastVersionId: null };

  const hasLinkedPodcastScript = hasPodcastScript
    || languageScoped.some((version: any) => !!resolveVersionWithText(metadata, version));
  const activeIdRaw = String(podcast.activeVersionId || "").trim();
  const activeInLanguage = languageScoped.find((v: any) => String(v?.id || "").trim() === activeIdRaw);
  const activePodcastVersionId = String(activeInLanguage?.id || languageScoped[0]?.id || "").trim() || null;
  return {
    hasPodcast: true,
    hasPodcastScript: hasLinkedPodcastScript,
    activePodcastVersionId,
  };
}

export function resolvePodcastScriptDownloadSelection(
  metadata: any,
  params: { languageCode?: string | null; versionId?: string | null } = {}
): PodcastScriptDownloadSelection {
  const podcast = getPodcastMetadata(metadata);
  const completed = getCompletedVersions(metadata);
  const rawScripts = getPodcastScripts(metadata);
  const requestedLanguage = normalizeCode(params.languageCode || null);
  const requestedVersionId = String(params.versionId || "").trim();

  // Helper to fallback to any exact script matching criteria if version resolution fails
  const attemptDirectScriptFallback = (): PodcastScriptDownloadSelection | null => {
    if (!rawScripts || rawScripts.length === 0) return null;
    
    // If language was requested, try to find a script in that language
    if (requestedLanguage) {
      const scriptInLang = rawScripts.find((s: any) => normalizeCode(s?.languageCode) === requestedLanguage);
      if (scriptInLang && String(scriptInLang.text || "").trim()) {
        return {
          versionId: null,
          languageCode: normalizeCode(scriptInLang.languageCode || null),
          scriptId: String(scriptInLang.id || "").trim() || null,
          scriptText: String(scriptInLang.text || "").trim(),
          reason: null,
        };
      }
    }
    
    // Otherwise, just return the first available script that has text
    const anyScript = rawScripts.find((s: any) => String(s?.text || "").trim());
    if (anyScript) {
      return {
        versionId: null,
        languageCode: normalizeCode(anyScript.languageCode || requestedLanguage || null),
        scriptId: String(anyScript.id || "").trim() || null,
        scriptText: String(anyScript.text || "").trim(),
        reason: null,
      };
    }
    
    return null;
  };

  if (!podcast) {
    return {
      versionId: null,
      languageCode: requestedLanguage || null,
      scriptId: null,
      scriptText: null,
      reason: "No podcast data available.",
    };
  }

  const versionsByLanguage = requestedLanguage
    ? completed.filter((version: any) => normalizeCode(version?.languageCode) === requestedLanguage)
    : completed;

  const tryResolveFromCandidates = (candidates: any[]): PodcastScriptDownloadSelection | null => {
    for (const candidate of candidates) {
      const resolved = resolveVersionWithText(metadata, candidate);
      if (resolved) return resolved;
    }
    return null;
  };

  if (requestedVersionId && completed.length > 0) {
    const exact = completed.find((version: any) => String(version?.id || "").trim() === requestedVersionId);
    if (exact) {
      const exactResolution = resolveVersionWithText(metadata, exact, false);
      if (exactResolution) return exactResolution;

      const exactLanguage = normalizeCode(exact?.languageCode || requestedLanguage || null);
      const fallbackCandidates = exactLanguage
        ? completed.filter((version: any) => normalizeCode(version?.languageCode) === exactLanguage && String(version?.id || "").trim() !== requestedVersionId)
        : completed.filter((version: any) => String(version?.id || "").trim() !== requestedVersionId);
      const fallbackResolution = tryResolveFromCandidates(fallbackCandidates);
      if (fallbackResolution) return fallbackResolution;

      // Last fallback for legacy data: allow same-language script text lookup for the selected version.
      const exactLegacyResolution = resolveVersionWithText(metadata, exact, true);
      if (exactLegacyResolution) return exactLegacyResolution;

      // Keep version-scoped context when an exact version is requested but has no script text.
      // This allows the caller to return a precise, deterministic message to the user.
      return {
        versionId: String(exact?.id || requestedVersionId).trim() || null,
        languageCode: normalizeCode(exact?.languageCode || requestedLanguage || null) || null,
        scriptId: String(exact?.scriptId || "").trim() || null,
        scriptText: null,
        reason: "No script text found for selected podcast version.",
      };
    }
  }

  const activeIdRaw = String(podcast.activeVersionId || "").trim();
  const activeCandidate = activeIdRaw
    ? versionsByLanguage.find((version: any) => String(version?.id || "").trim() === activeIdRaw)
    : null;
  const activeResolution = resolveVersionWithText(metadata, activeCandidate);
  if (activeResolution) return activeResolution;

  const languageResolution = tryResolveFromCandidates(versionsByLanguage);
  if (languageResolution) return languageResolution;

  const anyResolution = tryResolveFromCandidates(completed);
  if (anyResolution) return anyResolution;

  // Final fallback: just grab any direct script text available 
  const directScriptFallback = attemptDirectScriptFallback();
  if (directScriptFallback) return directScriptFallback;

  return {
    versionId: null,
    languageCode: requestedLanguage || null,
    scriptId: null,
    scriptText: null,
    reason: requestedLanguage || requestedVersionId ? "No script text found for selected parameters." : "No script text available.",
  };
}
