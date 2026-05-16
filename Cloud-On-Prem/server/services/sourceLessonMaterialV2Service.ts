import {
  buildSourceLessonMaterialV2,
  type SourceDocumentTypeV2,
  type SourceLessonMaterialV2,
  type SourceLessonMaterialV2Asset,
  type SourceLessonMaterialV2Range,
} from "@shared/sourceLessonMaterialV2";

type FinalizedSourceLessonMaterialInput = {
  lessonData: Record<string, any>;
  lessonInputText: string | null;
  lessonSourceAssets?: any[] | null;
  sourceDocumentId?: string | null;
  nextBoundaryTitle?: string | null;
};

type FinalizedSourceLessonMaterialResult = {
  rawInputText: string | null;
  sourceLessonContentV2: SourceLessonMaterialV2 | null;
};

function extensionToDocumentType(fileName: string | null | undefined): SourceDocumentTypeV2 | null {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "docx";
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return "pptx";
  return null;
}

function inferDocumentType(lessonData: Record<string, any>, assets: any[]): SourceDocumentTypeV2 {
  const explicit = String(lessonData.sourceDocumentType || lessonData.documentType || "").toLowerCase();
  if (explicit === "pdf" || explicit === "docx" || explicit === "pptx") return explicit;

  const fromAsset = assets
    .map((asset) => String(asset?.metadata?.sourceDocumentType || "").toLowerCase())
    .find((value) => value === "pdf" || value === "docx" || value === "pptx");
  if (fromAsset === "pdf" || fromAsset === "docx" || fromAsset === "pptx") return fromAsset;

  return extensionToDocumentType(lessonData.sourceDocumentName || lessonData.fileName) || "pdf";
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildRange(lessonData: Record<string, any>, assets: SourceLessonMaterialV2Asset[], sourceDocumentType: SourceDocumentTypeV2): SourceLessonMaterialV2Range {
  if (sourceDocumentType === "pptx") {
    const explicitStart = numberOrNull(lessonData.sourceSlideStart || lessonData.slideStart);
    const explicitEnd = numberOrNull(lessonData.sourceSlideEnd || lessonData.slideEnd);
    const assetSlides = assets
      .map((asset) => numberOrNull((asset.metadata as any)?.slide) || numberOrNull(asset.pageOrSlide))
      .filter((slide): slide is number => Boolean(slide));
    return {
      slideStart: explicitStart || (assetSlides.length > 0 ? Math.min(...assetSlides) : undefined),
      slideEnd: explicitEnd || (assetSlides.length > 0 ? Math.max(...assetSlides) : undefined),
      outlineNodeId: String(lessonData.sourceOutlineNodeId || "").trim() || undefined,
    };
  }

  const explicitStart = numberOrNull(lessonData.sourcePageStart || lessonData.pageStart);
  const explicitEnd = numberOrNull(lessonData.sourcePageEnd || lessonData.pageEnd);
  const assetPages = assets
    .map((asset) => numberOrNull(asset.pageOrSlide))
    .filter((page): page is number => Boolean(page));
  return {
    pageStart: explicitStart || (assetPages.length > 0 ? Math.min(...assetPages) : undefined),
    pageEnd: explicitEnd || (assetPages.length > 0 ? Math.max(...assetPages) : undefined),
    outlineNodeId: String(lessonData.sourceOutlineNodeId || "").trim() || undefined,
  };
}

function normalizeAssets(assets: any[]): SourceLessonMaterialV2Asset[] {
  const normalized: SourceLessonMaterialV2Asset[] = [];
  for (const asset of assets) {
    const assetId = String(asset?.assetId || asset?.id || "").trim();
    if (!assetId) continue;
    normalized.push({
        assetId,
        assetType: String(asset?.assetType || "image"),
        caption: asset?.caption || null,
        altText: asset?.altText || null,
        pageOrSlide: numberOrNull(asset?.pageOrSlide),
        metadata: asset?.metadata || {},
    });
  }
  return normalized;
}

export function buildFinalizedSourceLessonMaterialV2(input: FinalizedSourceLessonMaterialInput): FinalizedSourceLessonMaterialResult {
  const rawInputText = input.lessonInputText ? String(input.lessonInputText) : null;
  if (!rawInputText?.trim()) {
    return {
      rawInputText,
      sourceLessonContentV2: null,
    };
  }

  const normalizedAssets = normalizeAssets(Array.isArray(input.lessonSourceAssets) ? input.lessonSourceAssets : []);
  const sourceDocumentType = inferDocumentType(input.lessonData || {}, normalizedAssets);
  const sourceRange = buildRange(input.lessonData || {}, normalizedAssets, sourceDocumentType);
  const title = String(input.lessonData?.title || input.lessonData?.name || "Lesson").trim() || "Lesson";

  const material = buildSourceLessonMaterialV2({
    lessonId: input.lessonData?.lessonId || null,
    title,
    sourceDocumentId: input.sourceDocumentId || input.lessonData?.sourceDocumentId || null,
    sourceDocumentName: input.lessonData?.sourceDocumentName || input.lessonData?.fileName || null,
    sourceDocumentType,
    sourceText: rawInputText,
    objectives: Array.isArray(input.lessonData?.objectives)
      ? input.lessonData.objectives
      : Array.isArray(input.lessonData?.learningObjectives)
        ? input.lessonData.learningObjectives.map((objective: any) => typeof objective === "string" ? objective : objective?.objective).filter(Boolean)
        : [],
    sourceAssets: normalizedAssets,
    sourceRange,
    sourceSegmentIds: Array.isArray(input.lessonData?.sourceSegmentIds) ? input.lessonData.sourceSegmentIds : [],
    nextBoundaryTitle: input.nextBoundaryTitle || null,
  });

  return {
    rawInputText,
    sourceLessonContentV2: material,
  };
}
