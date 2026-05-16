export type PodcastVersionSummary = {
  id: string;
  languageCode?: string | null;
  status?: string | null;
  createdAt?: string | null;
  isActive?: boolean | null;
};

export type LessonActionMenuResetState = {
  viewContentLangLessonId: string;
  sourceContentLangLessonId: string;
  contentDiffLessonId: string;
  uploadContentTargetLessonId: string;
  selectedSourceVersion: string;
  selectedDocVersion: string;
  compareBaseVersionId: string;
  compareTargetVersionId: string;
  feedbackMode: 'quick' | 'deep' | 'compare';
};

function normalizeLanguageCode(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeInternalPath(value: unknown): string | null {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  if (!candidate.startsWith('/')) return null;
  if (candidate.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) return null;
  return candidate;
}

function getPodcastVersionTimestamp(version: PodcastVersionSummary): number {
  const parsed = Date.parse(String(version.createdAt || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getPreferredPodcastVersionId(params: {
  podcastVersions: PodcastVersionSummary[];
  languageCode?: string | null;
  activePodcastVersionId?: string | null;
}): string {
  const completedVersions = Array.isArray(params.podcastVersions)
    ? params.podcastVersions.filter((version) => normalizeLanguageCode(version.status) === 'completed')
    : [];
  if (!completedVersions.length) return '';

  const normalizedLanguageCode = normalizeLanguageCode(params.languageCode);
  const activeVersionId = String(params.activePodcastVersionId || '').trim();

  const scopedVersions = normalizedLanguageCode
    ? completedVersions.filter((version) => normalizeLanguageCode(version.languageCode) === normalizedLanguageCode)
    : completedVersions;

  if (!scopedVersions.length) return '';

  const activeScopedVersion = activeVersionId
    ? scopedVersions.find((version) => String(version.id) === activeVersionId)
    : null;
  if (activeScopedVersion) {
    return String(activeScopedVersion.id);
  }

  const preferredVersion = [...scopedVersions].sort((left, right) => {
    const leftActive = activeVersionId && String(left.id) === activeVersionId ? 1 : 0;
    const rightActive = activeVersionId && String(right.id) === activeVersionId ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const leftFlag = left.isActive ? 1 : 0;
    const rightFlag = right.isActive ? 1 : 0;
    if (leftFlag !== rightFlag) {
      return rightFlag - leftFlag;
    }

    const leftTime = getPodcastVersionTimestamp(left);
    const rightTime = getPodcastVersionTimestamp(right);
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return String(left.id).localeCompare(String(right.id));
  })[0];

  return String(preferredVersion?.id || '');
}

export function buildLessonVariantSearchParams(params: {
  courseId?: string | null;
  returnTo?: string | null;
  languageCode: string;
}): string {
  const searchParams = new URLSearchParams();
  const courseId = String(params.courseId || '').trim();
  const returnTo = normalizeInternalPath(params.returnTo);
  const languageCode = normalizeLanguageCode(params.languageCode);

  if (courseId) searchParams.set('courseId', courseId);
  if (returnTo) searchParams.set('returnTo', returnTo);
  if (languageCode) searchParams.set('languageCode', languageCode);

  return searchParams.toString();
}

export function resolveLessonViewerBackTarget(params: {
  returnTo?: string | null;
  courseId?: string | null;
  courseUrl?: string | null;
  defaultUrl: string;
}): string {
  const returnTo = normalizeInternalPath(params.returnTo);
  if (returnTo) return returnTo;

  const courseUrl = normalizeInternalPath(params.courseUrl);
  if (courseUrl) return courseUrl;

  const courseId = String(params.courseId || '').trim();
  if (courseId && params.courseUrl) {
    return params.courseUrl;
  }

  return params.defaultUrl;
}

export function resolvePodcastSelection(params: {
  podcastVersions: PodcastVersionSummary[];
  requestedLanguageCode?: string | null;
  requestedPodcastVersionId?: string | null;
  activePodcastLanguageCode?: string | null;
  activePodcastVersionId?: string | null;
}): { selectedPodcastLanguage: string; selectedPodcastVersionId: string } {
  const completedVersions = Array.isArray(params.podcastVersions)
    ? params.podcastVersions.filter((version) => normalizeLanguageCode(version.status) === 'completed')
    : [];
  const languageOptions = Array.from(
    new Set(completedVersions.map((version) => normalizeLanguageCode(version.languageCode)).filter(Boolean))
  );
  const activeLanguageCode = normalizeLanguageCode(params.activePodcastLanguageCode) || 'en';

  const requestedVersion = normalizeLanguageCode(params.requestedPodcastVersionId)
    ? completedVersions.find((version) => String(version.id) === String(params.requestedPodcastVersionId).trim())
    : null;
  if (requestedVersion) {
    const requestedVersionLanguage = normalizeLanguageCode(requestedVersion.languageCode) || activeLanguageCode;
    return {
      selectedPodcastLanguage: requestedVersionLanguage || 'en',
      selectedPodcastVersionId: String(requestedVersion.id),
    };
  }

  const requestedLanguageCode = normalizeLanguageCode(params.requestedLanguageCode);
  const preferredLanguage = requestedLanguageCode && languageOptions.includes(requestedLanguageCode)
    ? requestedLanguageCode
    : (languageOptions.includes(activeLanguageCode)
      ? activeLanguageCode
      : (languageOptions[0] || 'en'));
  const preferredVersionId = getPreferredPodcastVersionId({
    podcastVersions: completedVersions,
    languageCode: preferredLanguage,
    activePodcastVersionId: params.activePodcastVersionId || null,
  });
  const preferredVersion = preferredVersionId
    ? completedVersions.find((version) => String(version.id) === preferredVersionId)
    : null;

  return {
    selectedPodcastLanguage: preferredLanguage,
    selectedPodcastVersionId: preferredVersion ? String(preferredVersion.id) : '',
  };
}

export function getLessonActionMenuResetState(lessonId: string): LessonActionMenuResetState {
  return {
    viewContentLangLessonId: lessonId,
    sourceContentLangLessonId: lessonId,
    contentDiffLessonId: lessonId,
    uploadContentTargetLessonId: lessonId,
    selectedSourceVersion: 'current',
    selectedDocVersion: 'current',
    compareBaseVersionId: 'current',
    compareTargetVersionId: 'current',
    feedbackMode: 'quick',
  };
}
