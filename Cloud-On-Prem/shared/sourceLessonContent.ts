export type SourceLessonAsset = {
  assetId?: string | null;
  id?: string | null;
  signedUrl?: string | null;
  caption?: string | null;
  altText?: string | null;
  pageOrSlide?: number | null;
  containsEmbeddedText?: boolean | null;
  recommendedUse?: string | null;
};

export type SourceLessonVisual = {
  assetId: string;
  signedUrl?: string | null;
  caption?: string | null;
  altText?: string | null;
  pageOrSlide?: number | null;
  containsEmbeddedText?: boolean | null;
};

export type SourceLessonActivity = {
  id: string;
  prompt: string;
  sourcePage?: number | null;
};

export type SourceLessonSection = {
  id: string;
  title: string;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  paragraphs: string[];
  activities: SourceLessonActivity[];
  visuals: SourceLessonVisual[];
};

export type SourceLessonContent = {
  version: 1;
  lessonId?: string | null;
  title: string;
  generatedFrom: "source";
  generatedAt: string;
  objectives: string[];
  sections: SourceLessonSection[];
  summary: {
    sectionCount: number;
    activityCount: number;
    totalVisuals: number;
    sourceWordCount: number;
  };
};

export type BuildSourceLessonContentInput = {
  lessonId?: string | null;
  title: string;
  sourceText: string;
  objectives?: string[] | null;
  sourceAssets?: SourceLessonAsset[] | null;
  generatedAt?: string;
};

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function makeId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function stripSectionNumber(value: string): string {
  return normalizeWhitespace(value).replace(/^\d+\.\d+(?:\.\d+)*\s+/, "").trim();
}

function isNoiseLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  if (!normalized) return true;
  if (/^page\s+\d+$/i.test(normalized)) return true;
  if (/^technology\s+grade\s+\d+\s+t\s*e\s*r\s*m\s+\d+$/i.test(normalized)) return true;
  if (/^chapter\s+\d+\s*:/i.test(normalized)) return true;
  if (/^chapter\s+\d+$/i.test(normalized)) return true;
  if (/^\d+\s+technology\s+grade\s+\d+\s+t\s*e\s*r\s*m\s+\d+$/i.test(normalized)) return true;
  if (/^next week$/i.test(normalized)) return true;
  return false;
}

function detectPage(line: string): number | null {
  const match = normalizeWhitespace(line).match(/^page\s+(\d+)$/i);
  if (!match) return null;
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) && page > 0 ? page : null;
}

function isSectionHeading(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  if (/^\d+\.\d+(?:\.\d+)*\s+.{3,}$/.test(normalized)) {
    return !/\.{3,}/.test(normalized);
  }
  return false;
}

function isActivityLine(line: string): boolean {
  return /^\d+\.\s+.{8,}$/.test(normalizeWhitespace(line));
}

function cleanParagraph(line: string): string {
  return normalizeWhitespace(line)
    .replace(/\.{3,}\s*\d+\s*$/, "")
    .trim();
}

function toVisual(asset: SourceLessonAsset): SourceLessonVisual | null {
  const assetId = String(asset.assetId || asset.id || "").trim();
  if (!assetId) return null;
  return {
    assetId,
    signedUrl: asset.signedUrl || null,
    caption: asset.caption || null,
    altText: asset.altText || asset.caption || null,
    pageOrSlide: asset.pageOrSlide || null,
    containsEmbeddedText: asset.containsEmbeddedText || false,
  };
}

export function buildSourceLessonContent(input: BuildSourceLessonContentInput): SourceLessonContent {
  const title = normalizeWhitespace(input.title || "Lesson") || "Lesson";
  const lines = String(input.sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections: SourceLessonSection[] = [];
  let currentPage: number | null = null;
  let currentSection: SourceLessonSection | null = null;

  const ensureSection = () => {
    if (!currentSection) {
      currentSection = {
        id: makeId("section", sections.length),
        title,
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
        paragraphs: [],
        activities: [],
        visuals: [],
      };
      sections.push(currentSection);
    }
    return currentSection;
  };

  for (const rawLine of lines) {
    const detectedPage = detectPage(rawLine);
    if (detectedPage) {
      currentPage = detectedPage;
      if (currentSection) {
        currentSection.sourcePageEnd = detectedPage;
      }
      continue;
    }

    if (isNoiseLine(rawLine)) continue;
    const cleaned = cleanParagraph(rawLine);
    if (!cleaned) continue;

    if (isSectionHeading(cleaned)) {
      currentSection = {
        id: makeId("section", sections.length),
        title: stripSectionNumber(cleaned),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
        paragraphs: [],
        activities: [],
        visuals: [],
      };
      sections.push(currentSection);
      continue;
    }

    const section = ensureSection();
    if (currentPage) {
      section.sourcePageStart = section.sourcePageStart || currentPage;
      section.sourcePageEnd = currentPage;
    }
    if (isActivityLine(cleaned)) {
      section.activities.push({
        id: makeId(`${section.id}-activity`, section.activities.length),
        prompt: cleaned,
        sourcePage: currentPage,
      });
    } else {
      section.paragraphs.push(cleaned);
    }
  }

  const normalizedAssets = (input.sourceAssets || [])
    .map(toVisual)
    .filter((visual): visual is SourceLessonVisual => Boolean(visual));
  const uniqueAssets = new Map<string, SourceLessonVisual>();
  for (const visual of normalizedAssets) {
    const key = `${visual.assetId}`;
    if (!uniqueAssets.has(key)) uniqueAssets.set(key, visual);
  }

  for (const section of sections) {
    const pageStart = section.sourcePageStart || section.sourcePageEnd || null;
    const pageEnd = section.sourcePageEnd || section.sourcePageStart || null;
    section.visuals = Array.from(uniqueAssets.values())
      .filter((visual) => {
        const page = visual.pageOrSlide || null;
        return Boolean(page && pageStart && pageEnd && page >= pageStart && page <= pageEnd);
      })
      .slice(0, 12);
  }

  const fallbackVisuals = Array.from(uniqueAssets.values()).slice(0, 12);
  if (sections.length === 1 && sections[0].visuals.length === 0) {
    sections[0].visuals = fallbackVisuals;
  }

  const filteredSections = sections.filter(
    (section) => section.paragraphs.length > 0 || section.activities.length > 0 || section.visuals.length > 0,
  );

  return {
    version: 1,
    lessonId: input.lessonId || null,
    title,
    generatedFrom: "source",
    generatedAt: input.generatedAt || new Date().toISOString(),
    objectives: Array.from(new Set((input.objectives || []).map((item) => normalizeWhitespace(item)).filter(Boolean))),
    sections: filteredSections,
    summary: {
      sectionCount: filteredSections.length,
      activityCount: filteredSections.reduce((total, section) => total + section.activities.length, 0),
      totalVisuals: uniqueAssets.size,
      sourceWordCount: normalizeWhitespace(input.sourceText || "").split(/\s+/).filter(Boolean).length,
    },
  };
}
