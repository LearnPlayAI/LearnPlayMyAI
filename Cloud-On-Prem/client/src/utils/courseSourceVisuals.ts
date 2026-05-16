export interface CourseSourceAssetLike {
  id: string;
  assetType?: string | null;
  pageOrSlide?: number | null;
  caption?: string | null;
  sourceFileName?: string | null;
  metadata?: Record<string, any> | null;
}

export interface CourseLessonLike {
  sourceAssets?: Array<{ assetId?: string | null }> | null;
  sourceOutlineNodeId?: string | null;
  sourcePageStart?: number | string | null;
  sourcePageEnd?: number | string | null;
  sourceContent?: string | null;
}

export interface LessonVisualGroups<TAsset extends CourseSourceAssetLike> {
  linked: TAsset[];
  recommended: TAsset[];
  other: TAsset[];
  pageStart: number | null;
  pageEnd: number | null;
}

function toPage(value: unknown): number | null {
  const page = Number(value || 0);
  return Number.isFinite(page) && page > 0 ? page : null;
}

function pageInRange(page: number | null, start: number | null, end: number | null): boolean {
  if (!page || !start || !end) return false;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return page >= low && page <= high;
}

function isLikelyFrontMatter(asset: CourseSourceAssetLike): boolean {
  const page = toPage(asset.pageOrSlide);
  if (!page || page > 5) return false;
  const label = `${asset.caption || ""} ${asset.sourceFileName || ""}`.toLowerCase();
  return /logo|foundation|cover|creative commons|licen[cs]e|copyright|title/.test(label);
}

function assetTypeScore(asset: CourseSourceAssetLike): number {
  if (asset.assetType === "image") return 0;
  if (asset.assetType === "page_snapshot") return 1;
  return 2;
}

function sortByLessonRelevance<TAsset extends CourseSourceAssetLike>(
  assets: TAsset[],
  lesson: CourseLessonLike,
  linkedIds: Set<string>,
): TAsset[] {
  const pageStart = toPage(lesson.sourcePageStart);
  const pageEnd = toPage(lesson.sourcePageEnd);
  const outlineNodeId = String(lesson.sourceOutlineNodeId || "");

  return [...assets].sort((a, b) => {
    const linkedDelta = Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id));
    if (linkedDelta) return linkedDelta;

    const outlineDelta =
      Number(outlineNodeId && b.metadata?.outlineNodeId === outlineNodeId) -
      Number(outlineNodeId && a.metadata?.outlineNodeId === outlineNodeId);
    if (outlineDelta) return outlineDelta;

    const aPage = toPage(a.pageOrSlide);
    const bPage = toPage(b.pageOrSlide);
    const rangeDelta =
      Number(pageInRange(bPage, pageStart, pageEnd)) -
      Number(pageInRange(aPage, pageStart, pageEnd));
    if (rangeDelta) return rangeDelta;

    const frontMatterDelta = Number(isLikelyFrontMatter(a)) - Number(isLikelyFrontMatter(b));
    if (frontMatterDelta) return frontMatterDelta;

    const typeDelta = assetTypeScore(a) - assetTypeScore(b);
    if (typeDelta) return typeDelta;

    return (aPage || 0) - (bPage || 0);
  });
}

export function groupSourceVisualsForLesson<TAsset extends CourseSourceAssetLike>(
  lesson: CourseLessonLike,
  sourceAssets: TAsset[],
): LessonVisualGroups<TAsset> {
  const linkedIds = new Set(
    Array.isArray(lesson.sourceAssets)
      ? lesson.sourceAssets.map((item) => String(item.assetId || "")).filter(Boolean)
      : [],
  );
  const pageStart = toPage(lesson.sourcePageStart);
  const pageEnd = toPage(lesson.sourcePageEnd);
  const outlineNodeId = String(lesson.sourceOutlineNodeId || "");

  const linked = sortByLessonRelevance(
    sourceAssets.filter((asset) => linkedIds.has(asset.id)),
    lesson,
    linkedIds,
  );

  const recommended = sortByLessonRelevance(
    sourceAssets.filter((asset) => {
      if (linkedIds.has(asset.id)) return false;
      const page = toPage(asset.pageOrSlide);
      if (outlineNodeId && asset.metadata?.outlineNodeId === outlineNodeId) return true;
      return pageInRange(page, pageStart, pageEnd);
    }),
    lesson,
    linkedIds,
  );

  const selectedIds = new Set([...linked, ...recommended].map((asset) => asset.id));
  const other = sortByLessonRelevance(
    sourceAssets.filter((asset) => !selectedIds.has(asset.id)),
    lesson,
    linkedIds,
  );

  return {
    linked,
    recommended,
    other,
    pageStart,
    pageEnd,
  };
}

export function cleanLessonSourceContent(rawContent: string): string {
  const lines = String(rawContent || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const seenStructuralLines = new Set<string>();
  const cleaned: string[] = [];

  for (const line of lines) {
    const compact = line.replace(/\s+/g, " ");
    const normalized = compact.toLowerCase();

    if (/^figure\s+\d+$/i.test(compact)) continue;
    if (/^page\s+\d+$/i.test(compact)) continue;
    if (/^\d+\s*$/.test(compact)) continue;
    if (/\.{5,}\s*\d+\s*$/.test(compact)) continue;
    if (/^next week$/i.test(compact) || /^in the next chapter\b/i.test(compact)) break;

    const isRepeatedHeader =
      /^technology grade \d+ term \d+$/i.test(compact) ||
      /^chapter\s+\d+:/i.test(compact);
    if (isRepeatedHeader) {
      if (seenStructuralLines.has(normalized)) continue;
      seenStructuralLines.add(normalized);
    }

    const isHeading =
      /^chapter\s+\d+:/i.test(compact) ||
      /^\d+\.\d+(?:\.\d+)*\s+/.test(compact) ||
      /^[A-Z][A-Za-z\s,:'’-]{2,45}$/.test(compact);
    const isBullet = /^[•*-]\s+/.test(compact);
    const isNumberedTask = /^\d+\.\s+/.test(compact);
    const previous = cleaned[cleaned.length - 1] || "";
    const previousEndsSentence = /[.!?:;)]$/.test(previous);
    const shouldJoin =
      cleaned.length > 0 &&
      !isHeading &&
      !isBullet &&
      !isNumberedTask &&
      !previousEndsSentence &&
      !/^[•*-]\s+/.test(previous) &&
      !/^\d+\.\s+/.test(previous);

    if (shouldJoin) {
      cleaned[cleaned.length - 1] = `${previous} ${compact}`;
    } else {
      cleaned.push(compact);
    }
  }

  return cleaned.join("\n");
}
