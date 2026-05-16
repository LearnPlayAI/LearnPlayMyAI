export type CourseLessonReadinessInput = {
  inputText?: string | null;
  sourceDocumentPath?: string | null;
  storageKey?: string | null;
  gammaCardId?: string | null;
  videoStorageKey?: string | null;
  linkedQuizId?: string | null;
  linkedQuizCount?: number | null;
  metadata?: Record<string, any> | null;
};

export function hasNativeSourceLessonMaterial(lesson: CourseLessonReadinessInput | null | undefined): boolean {
  if (!lesson) return false;

  const sourceText = String(lesson.inputText || "").trim();
  if (sourceText.length > 0) return true;

  const sourceLessonContent = lesson.metadata?.sourceLessonContentV1;
  const sectionCount = Number(sourceLessonContent?.summary?.sectionCount || 0);
  const visualCount = Number(sourceLessonContent?.summary?.visualCount || 0);
  return sectionCount > 0 || visualCount > 0;
}

export function getContentLessonReadiness(lesson: CourseLessonReadinessInput | null | undefined) {
  const hasNativeMaterial = hasNativeSourceLessonMaterial(lesson);
  const hasWord = !!lesson?.sourceDocumentPath;
  const hasLessonContent = hasNativeMaterial || hasWord;
  const hasPresentationAsset = !!lesson?.storageKey || !!lesson?.gammaCardId || !!lesson?.videoStorageKey;
  const hasQuiz = !!lesson?.linkedQuizId || Number(lesson?.linkedQuizCount || 0) > 0;

  return {
    hasNativeMaterial,
    hasWord,
    hasLessonContent,
    hasPresentationAsset,
    hasQuiz,
    digestKind: hasNativeMaterial ? ("recommended" as const) : ("required" as const),
    presentationKind: hasNativeMaterial ? ("recommended" as const) : ("required" as const),
    quizStatus: hasQuiz ? ("done" as const) : hasLessonContent ? ("todo" as const) : ("blocked" as const),
  };
}
