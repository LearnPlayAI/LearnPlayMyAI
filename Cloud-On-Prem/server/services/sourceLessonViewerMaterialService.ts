import { buildSourceLessonContent, type SourceLessonContent, type SourceLessonAsset } from "@shared/sourceLessonContent";
import { sourceLessonMaterialV2Schema, type SourceLessonMaterialV2 } from "@shared/sourceLessonMaterialV2";

type ResolveViewerSourceLessonMaterialInput = {
  lesson: {
    id?: string | null;
    title?: string | null;
    inputText?: string | null;
    metadata?: any;
  };
  sourceAssets?: SourceLessonAsset[] | null;
};

export type ViewerSourceLessonMaterial = SourceLessonMaterialV2 | SourceLessonContent;

export function resolveViewerSourceLessonMaterial(input: ResolveViewerSourceLessonMaterialInput): ViewerSourceLessonMaterial | null {
  const storedV2 = input.lesson?.metadata?.sourceLessonContentV2;
  if (storedV2) {
    const parsed = sourceLessonMaterialV2Schema.safeParse(storedV2);
    if (parsed.success) return parsed.data;
  }

  const sourceText = String(input.lesson?.inputText || "").trim();
  if (!sourceText) return null;
  const metadataObjectives = Array.isArray(input.lesson?.metadata?.objectives)
    ? input.lesson.metadata.objectives
    : [];
  return buildSourceLessonContent({
    lessonId: input.lesson?.id || null,
    title: input.lesson?.title || "Lesson",
    sourceText,
    objectives: metadataObjectives,
    sourceAssets: input.sourceAssets || [],
  });
}
