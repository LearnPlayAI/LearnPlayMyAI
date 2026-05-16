import { z } from "zod";

export const sourceDocumentTypeV2Schema = z.enum(["pdf", "docx", "pptx"]);

export const sourceVisualTypeV2Schema = z.enum([
  "figure",
  "embedded_image",
  "page_snapshot",
  "slide_snapshot",
  "diagram",
  "table_snapshot",
]);

export const sourceLessonBlockTypeV2Schema = z.enum([
  "heading",
  "paragraph",
  "bullet_list",
  "activity",
  "sidebar",
  "figure_ref",
  "figure",
  "callout",
]);

export const sourceLessonMaterialV2AssetSchema = z.object({
  assetId: z.string().min(1),
  assetType: z.string().min(1),
  caption: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  pageOrSlide: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const sourceLessonMaterialV2RangeSchema = z.object({
  pageStart: z.number().int().positive().nullable().optional(),
  pageEnd: z.number().int().positive().nullable().optional(),
  slideStart: z.number().int().positive().nullable().optional(),
  slideEnd: z.number().int().positive().nullable().optional(),
  outlineNodeId: z.string().nullable().optional(),
  chapterTitle: z.string().nullable().optional(),
});

export const sourceLessonMaterialV2BlockSchema = z.object({
  id: z.string().min(1),
  type: sourceLessonBlockTypeV2Schema,
  text: z.string().optional(),
  items: z.array(z.string()).optional(),
  sourcePage: z.number().int().positive().nullable().optional(),
  sourceSlide: z.number().int().positive().nullable().optional(),
  figureNumber: z.number().int().positive().nullable().optional(),
  assetIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});

export const sourceLessonMaterialV2SectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  blocks: z.array(sourceLessonMaterialV2BlockSchema),
  sourcePageStart: z.number().int().positive().nullable().optional(),
  sourcePageEnd: z.number().int().positive().nullable().optional(),
  sourceSlideStart: z.number().int().positive().nullable().optional(),
  sourceSlideEnd: z.number().int().positive().nullable().optional(),
  sourceSegmentIds: z.array(z.string()).optional(),
});

export const sourceLessonMaterialV2VisualSchema = z.object({
  id: z.string().min(1),
  visualType: sourceVisualTypeV2Schema,
  figureNumber: z.number().int().positive().nullable().optional(),
  slideNumber: z.number().int().positive().nullable().optional(),
  caption: z.string().nullable().optional(),
  page: z.number().int().positive().nullable().optional(),
  slide: z.number().int().positive().nullable().optional(),
  assetIds: z.array(z.string()).min(1),
  assetType: z.string().min(1),
  textBefore: z.string().nullable().optional(),
  textAfter: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export const sourceLessonMaterialV2Schema = z.object({
  version: z.literal(2),
  lessonId: z.string().nullable().optional(),
  title: z.string().min(1),
  sourceDocumentId: z.string().nullable().optional(),
  sourceDocumentName: z.string().nullable().optional(),
  sourceDocumentType: sourceDocumentTypeV2Schema,
  sourceTextHash: z.string().min(1),
  generation: z.object({
    method: z.string().min(1),
    generatedAt: z.string().min(1),
    deterministicStatus: z.enum(["completed", "completed_with_warnings", "blocked"]),
    aiRepairStatus: z.enum(["not_requested", "completed", "failed_validation", "failed"]).default("not_requested"),
    model: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
  }),
  quality: z.object({
    valid: z.boolean(),
    warnings: z.array(z.string()),
    blockingFindings: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  objectives: z.array(z.string()),
  sections: z.array(sourceLessonMaterialV2SectionSchema),
  visualRegistry: z.array(sourceLessonMaterialV2VisualSchema),
  sourceRange: sourceLessonMaterialV2RangeSchema,
});

export type SourceDocumentTypeV2 = z.infer<typeof sourceDocumentTypeV2Schema>;
export type SourceLessonMaterialV2Asset = z.infer<typeof sourceLessonMaterialV2AssetSchema>;
export type SourceLessonMaterialV2Range = z.infer<typeof sourceLessonMaterialV2RangeSchema>;
export type SourceLessonMaterialV2Block = z.infer<typeof sourceLessonMaterialV2BlockSchema>;
export type SourceLessonMaterialV2Section = z.infer<typeof sourceLessonMaterialV2SectionSchema>;
export type SourceLessonMaterialV2Visual = z.infer<typeof sourceLessonMaterialV2VisualSchema>;
export type SourceLessonMaterialV2 = z.infer<typeof sourceLessonMaterialV2Schema>;

export type BuildSourceLessonMaterialV2Input = {
  lessonId?: string | null;
  title: string;
  sourceDocumentId?: string | null;
  sourceDocumentName?: string | null;
  sourceDocumentType: SourceDocumentTypeV2;
  sourceText: string;
  objectives?: string[] | null;
  sourceAssets?: SourceLessonMaterialV2Asset[] | null;
  sourceRange?: SourceLessonMaterialV2Range | null;
  sourceSegmentIds?: string[] | null;
  nextBoundaryTitle?: string | null;
  generatedAt?: string | null;
};

export type SourceLessonMaterialV2Validation = {
  valid: boolean;
  warnings: string[];
  blockingFindings: string[];
  confidence: number;
};

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function slug(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "section";
}

function cleanTitle(value: string): string {
  const normalized = normalizeWhitespace(value)
    .replace(/^chapter\s+\d+\s*:\s*/i, "")
    .replace(/^\d+\.\d+(?:\.\d+)*\s+/, "")
    .trim();
  if (!normalized) return "Lesson";
  return normalized;
}

function detectFigureNumber(value: string | null | undefined): number | null {
  const match = String(value || "").match(/\bFigure\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function lineIsSectionHeading(line: string): boolean {
  return /^\d+\.\d+(?:\.\d+)*\s+.{3,}$/.test(normalizeWhitespace(line));
}

function lineIsChapterHeading(line: string): boolean {
  return /^chapter\s+\d+\b/i.test(normalizeWhitespace(line));
}

function detectChapterNumber(line: string): number | null {
  const match = normalizeWhitespace(line).match(/^chapter\s+(\d+)\b/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function lineIsBullet(line: string): boolean {
  return /^[•*-]\s+/.test(line.trim());
}

function lineIsActivity(line: string): boolean {
  return /^\d+\.\s+.{8,}$/.test(normalizeWhitespace(line));
}

function detectSectionMajorNumber(line: string): number | null {
  const match = normalizeWhitespace(line).match(/^(\d+)\.\d+(?:\.\d+)*\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function lineIsTocEntry(line: string): boolean {
  return /\.{5,}\s*\d+\s*$/.test(normalizeWhitespace(line));
}

function lineIsPageArtifact(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  return (
    /^technology grade \d+ term \d+$/i.test(normalized) ||
    /^chapter$/i.test(normalized) ||
    /^[A-Z]$/.test(normalized) ||
    /^[A-Z]\s*$/.test(normalized) ||
    /^page\s+\d+$/i.test(normalized)
  );
}

function lineStartsNextChapterPreview(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  return /^next week$/i.test(normalized) || /^in the next chapter\b/i.test(normalized);
}

function blockId(sectionIndex: number, blockIndex: number, type: string): string {
  return `v2-${sectionIndex + 1}-${blockIndex + 1}-${type}`;
}

function isInSourceRange(asset: SourceLessonMaterialV2Asset, input: BuildSourceLessonMaterialV2Input): boolean {
  const range = input.sourceRange || {};
  const position = asset.pageOrSlide || null;
  if (input.sourceDocumentType === "pptx") {
    const slide = Number((asset.metadata?.slide as number | undefined) || position || 0);
    const start = range.slideStart || range.slideEnd || null;
    const end = range.slideEnd || range.slideStart || null;
    return !start || !end || (slide >= start && slide <= end);
  }

  if (input.sourceDocumentType === "pdf") {
    const start = range.pageStart || range.pageEnd || null;
    const end = range.pageEnd || range.pageStart || null;
    return !position || !start || !end || (position >= start && position <= end);
  }

  return true;
}

function buildVisualRegistry(input: BuildSourceLessonMaterialV2Input): SourceLessonMaterialV2Visual[] {
  const seen = new Set<string>();
  return (input.sourceAssets || [])
    .filter((asset) => asset?.assetId)
    .filter((asset) => isInSourceRange(asset, input))
    .map((asset) => {
      const caption = normalizeWhitespace(asset.caption || asset.altText || "");
      const figureNumber = detectFigureNumber(caption);
      const slide = input.sourceDocumentType === "pptx"
        ? Number((asset.metadata?.slide as number | undefined) || asset.pageOrSlide || 0) || null
        : null;
      const visualType: SourceLessonMaterialV2Visual["visualType"] =
        input.sourceDocumentType === "pptx"
          ? "embedded_image"
          : figureNumber
            ? "figure"
            : asset.assetType === "page_snapshot"
              ? "page_snapshot"
              : "embedded_image";
      return {
        id: `visual-${asset.assetId}`,
        visualType,
        figureNumber,
        slideNumber: slide,
        caption: caption || null,
        page: input.sourceDocumentType === "pptx" ? null : asset.pageOrSlide || null,
        slide,
        assetIds: [asset.assetId],
        assetType: asset.assetType,
        textBefore: typeof asset.metadata?.textBefore === "string" ? asset.metadata.textBefore : null,
        textAfter: typeof asset.metadata?.textAfter === "string" ? asset.metadata.textAfter : null,
        confidence: figureNumber || slide ? 0.9 : 0.6,
      } satisfies SourceLessonMaterialV2Visual;
    })
    .filter((visual) => {
      const key = visual.assetIds.join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findVisualByFigure(
  visuals: SourceLessonMaterialV2Visual[],
  figureNumber: number | null,
  sourcePage: number | null | undefined,
  sourceSlide: number | null | undefined,
): SourceLessonMaterialV2Visual | null {
  if (!figureNumber) return null;
  const matches = visuals.filter((visual) => visual.figureNumber === figureNumber);
  if (matches.length === 0) return null;

  if (sourceSlide) {
    const nearby = matches
      .map((visual) => ({ visual, distance: Math.abs((visual.slide || sourceSlide) - sourceSlide) }))
      .filter((entry) => entry.distance <= 1)
      .sort((a, b) => a.distance - b.distance)[0];
    return nearby?.visual || null;
  }

  if (sourcePage) {
    const nearby = matches
      .map((visual) => ({ visual, distance: Math.abs((visual.page || sourcePage) - sourcePage) }))
      .filter((entry) => entry.distance <= 3)
      .sort((a, b) => a.distance - b.distance)[0];
    return nearby?.visual || null;
  }

  return matches[0] || null;
}

function findPriorVisual(visuals: SourceLessonMaterialV2Visual[], page: number | null | undefined): SourceLessonMaterialV2Visual | null {
  if (!page) return visuals[0] || null;
  return [...visuals]
    .filter((visual) => visual.page && visual.page <= page)
    .sort((a, b) => (b.page || 0) - (a.page || 0))[0] || visuals[0] || null;
}

function materialValidation(material: SourceLessonMaterialV2): SourceLessonMaterialV2Validation {
  const warnings = [...material.quality.warnings];
  const blockingFindings = [...material.quality.blockingFindings];

  if (material.sections.length === 0) {
    blockingFindings.push("V2 material has no learner sections.");
  }

  for (const section of material.sections) {
    for (const block of section.blocks) {
      if (!block.sourcePage && !block.sourceSlide) {
        warnings.push(`Block ${block.id} has no source page or slide evidence.`);
      }
      if (block.type === "figure_ref" && block.figureNumber) {
        const matched = material.visualRegistry.some((visual) => visual.figureNumber === block.figureNumber);
        if (!matched) warnings.push(`Figure ${block.figureNumber} is referenced but no matching visual was found.`);
      }
    }
  }

  const valid = blockingFindings.length === 0;
  return {
    valid,
    warnings: Array.from(new Set(warnings)),
    blockingFindings: Array.from(new Set(blockingFindings)),
    confidence: valid ? material.quality.confidence : Math.min(material.quality.confidence, 0.4),
  };
}

export function validateSourceLessonMaterialV2(material: SourceLessonMaterialV2): SourceLessonMaterialV2Validation {
  const parsed = sourceLessonMaterialV2Schema.parse(material);
  return materialValidation(parsed);
}

export function buildSourceLessonMaterialV2(input: BuildSourceLessonMaterialV2Input): SourceLessonMaterialV2 {
  const title = normalizeWhitespace(input.title || "Lesson") || "Lesson";
  const range = input.sourceRange || {};
  const sourceLines = String(input.sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const visuals = buildVisualRegistry(input);
  const warnings: string[] = [];
  const blockingFindings: string[] = [];
  const sections: SourceLessonMaterialV2Section[] = [];
  let currentSection: SourceLessonMaterialV2Section | null = null;
  let bulletBuffer: string[] = [];

  const initialPage = range.pageStart || range.pageEnd || undefined;
  const initialSlide = range.slideStart || range.slideEnd || undefined;

  const ensureSection = (sectionTitle = title): SourceLessonMaterialV2Section => {
    if (!currentSection) {
      currentSection = {
        id: `section-${sections.length + 1}-${slug(sectionTitle)}`,
        title: sectionTitle,
        blocks: [],
        sourcePageStart: initialPage,
        sourcePageEnd: initialPage,
        sourceSlideStart: initialSlide,
        sourceSlideEnd: initialSlide,
        sourceSegmentIds: input.sourceSegmentIds || undefined,
      };
      sections.push(currentSection);
    }
    return currentSection;
  };

  const pushBlock = (section: SourceLessonMaterialV2Section, block: Omit<SourceLessonMaterialV2Block, "id">) => {
    section.blocks.push({
      ...block,
      id: blockId(sections.indexOf(section), section.blocks.length, block.type),
    });
  };

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    const section = ensureSection();
    pushBlock(section, {
      type: "bullet_list",
      items: bulletBuffer,
      sourcePage: section.sourcePageStart || initialPage || null,
      sourceSlide: section.sourceSlideStart || initialSlide || null,
      confidence: 0.95,
    });
    bulletBuffer = [];
  };

  const nextBoundary = normalizeWhitespace(input.nextBoundaryTitle || "").toLowerCase();
  let currentChapterNumber: number | null = null;
  let hasStartedChapter = false;
  for (const rawLine of sourceLines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;
    if (lineIsPageArtifact(line) || lineIsTocEntry(line)) continue;
    if (nextBoundary && line.toLowerCase().startsWith(nextBoundary)) {
      blockingFindings.push(`Source text contains next boundary "${input.nextBoundaryTitle}".`);
      break;
    }
    if (lineStartsNextChapterPreview(line)) {
      warnings.push("Stopped before next chapter preview.");
      break;
    }

    const sectionMajorNumber = detectSectionMajorNumber(line);
    if (currentChapterNumber && sectionMajorNumber && sectionMajorNumber > currentChapterNumber) {
      blockingFindings.push(`Source text contains next chapter section "${line}".`);
      break;
    }

    if (lineIsChapterHeading(line)) {
      const chapterNumber = detectChapterNumber(line);
      if (chapterNumber && currentChapterNumber && chapterNumber > currentChapterNumber) {
        blockingFindings.push(`Source text contains next chapter boundary "${line}".`);
        break;
      }
      if (chapterNumber && !currentChapterNumber) currentChapterNumber = chapterNumber;
      if (hasStartedChapter && chapterNumber && chapterNumber === currentChapterNumber) {
        continue;
      }
      hasStartedChapter = true;
      flushBullets();
      currentSection = {
        id: `section-${sections.length + 1}-${slug(title)}`,
        title,
        blocks: [],
        sourcePageStart: initialPage,
        sourcePageEnd: initialPage,
        sourceSlideStart: initialSlide,
        sourceSlideEnd: initialSlide,
        sourceSegmentIds: input.sourceSegmentIds || undefined,
      };
      sections.push(currentSection);
      pushBlock(currentSection, {
        type: "heading",
        text: line,
        sourcePage: initialPage || null,
        sourceSlide: initialSlide || null,
        confidence: 0.95,
      });
      continue;
    }

    if (lineIsSectionHeading(line)) {
      flushBullets();
      const sectionTitle = cleanTitle(line);
      currentSection = {
        id: `section-${sections.length + 1}-${slug(sectionTitle)}`,
        title: sectionTitle,
        blocks: [],
        sourcePageStart: initialPage,
        sourcePageEnd: initialPage,
        sourceSlideStart: initialSlide,
        sourceSlideEnd: initialSlide,
        sourceSegmentIds: input.sourceSegmentIds || undefined,
      };
      sections.push(currentSection);
      pushBlock(currentSection, {
        type: "heading",
        text: line,
        sourcePage: initialPage || null,
        sourceSlide: initialSlide || null,
        confidence: 0.95,
      });
      continue;
    }

    if (lineIsBullet(line)) {
      bulletBuffer.push(line.replace(/^[•*-]\s+/, ""));
      continue;
    }

    flushBullets();
    const section = ensureSection();
    const figureNumber = detectFigureNumber(line);
    const referencedVisual = findVisualByFigure(
      visuals,
      figureNumber,
      section.sourcePageStart || initialPage || null,
      section.sourceSlideStart || initialSlide || null,
    );
    if (figureNumber) {
      pushBlock(section, {
        type: "figure_ref",
        text: line,
        figureNumber,
        assetIds: referencedVisual?.assetIds || [],
        sourcePage: referencedVisual?.page || section.sourcePageStart || initialPage || null,
        sourceSlide: referencedVisual?.slide || section.sourceSlideStart || initialSlide || null,
        confidence: referencedVisual ? 0.95 : 0.55,
      });
      if (referencedVisual) {
        pushBlock(section, {
          type: "figure",
          text: referencedVisual.caption || line,
          figureNumber,
          assetIds: referencedVisual.assetIds,
          sourcePage: referencedVisual.page || null,
          sourceSlide: referencedVisual.slide || null,
          confidence: referencedVisual.confidence,
        });
      } else {
        warnings.push(`Figure ${figureNumber} is referenced but no matching visual was found.`);
      }
      continue;
    }

    if (/previous page/i.test(line)) {
      const priorVisual = findPriorVisual(visuals, section.sourcePageStart || initialPage || null);
      if (priorVisual) {
        pushBlock(section, {
          type: "paragraph",
          text: line,
          sourcePage: section.sourcePageStart || initialPage || null,
          sourceSlide: section.sourceSlideStart || initialSlide || null,
          confidence: 0.9,
        });
        pushBlock(section, {
          type: "figure",
          text: priorVisual.caption || "Referenced visual",
          figureNumber: priorVisual.figureNumber || null,
          assetIds: priorVisual.assetIds,
          sourcePage: priorVisual.page || null,
          sourceSlide: priorVisual.slide || null,
          confidence: priorVisual.confidence,
        });
        continue;
      }
    }

    pushBlock(section, {
      type: lineIsActivity(line) ? "activity" : "paragraph",
      text: line,
      sourcePage: section.sourcePageStart || initialPage || null,
      sourceSlide: section.sourceSlideStart || initialSlide || null,
      confidence: 0.9,
    });
  }

  flushBullets();

  if (input.sourceDocumentType === "docx" && visuals.length > 0 && sections[0]) {
    for (const visual of visuals) {
      if (!sections.some((section) => section.blocks.some((block) => block.assetIds?.some((id) => visual.assetIds.includes(id))))) {
        pushBlock(sections[0], {
          type: "figure",
          text: visual.caption || "Document visual",
          figureNumber: visual.figureNumber || null,
          assetIds: visual.assetIds,
          sourcePage: visual.page || sections[0].sourcePageStart || null,
          confidence: visual.confidence,
        });
      }
    }
  }

  if (input.sourceDocumentType === "pptx" && visuals.length > 0 && sections[0]) {
    for (const visual of visuals) {
      if (!sections[0].blocks.some((block) => block.assetIds?.some((id) => visual.assetIds.includes(id)))) {
        pushBlock(sections[0], {
          type: "figure",
          text: visual.caption || "Slide visual",
          assetIds: visual.assetIds,
          sourceSlide: visual.slide || initialSlide || null,
          confidence: visual.confidence,
        });
      }
    }
  }

  if (sections.length === 0) {
    blockingFindings.push("No learner sections could be built from source text.");
  }

  const usedAssetIds = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const assetId of block.assetIds || []) {
        usedAssetIds.add(assetId);
      }
    }
  }
  const learnerVisuals = visuals.filter((visual) =>
    visual.assetIds.some((assetId) => usedAssetIds.has(assetId)),
  );

  const provisional: SourceLessonMaterialV2 = {
    version: 2,
    lessonId: input.lessonId || null,
    title,
    sourceDocumentId: input.sourceDocumentId || null,
    sourceDocumentName: input.sourceDocumentName || null,
    sourceDocumentType: input.sourceDocumentType,
    sourceTextHash: stableHash(input.sourceText || ""),
    generation: {
      method: "deterministic_v2",
      generatedAt: input.generatedAt || new Date().toISOString(),
      deterministicStatus: blockingFindings.length > 0
        ? "blocked"
        : warnings.length > 0
          ? "completed_with_warnings"
          : "completed",
      aiRepairStatus: "not_requested",
    },
    quality: {
      valid: blockingFindings.length === 0,
      warnings,
      blockingFindings,
      confidence: blockingFindings.length > 0 ? 0.35 : warnings.length > 0 ? 0.75 : 0.9,
    },
    objectives: Array.from(new Set((input.objectives || []).map((objective) => normalizeWhitespace(objective)).filter(Boolean))),
    sections,
    visualRegistry: learnerVisuals,
    sourceRange: range,
  };

  const validation = materialValidation(provisional);
  provisional.quality = {
    valid: validation.valid,
    warnings: validation.warnings,
    blockingFindings: validation.blockingFindings,
    confidence: validation.confidence,
  };
  provisional.generation.deterministicStatus = validation.blockingFindings.length > 0
    ? "blocked"
    : validation.warnings.length > 0
      ? "completed_with_warnings"
      : "completed";

  return sourceLessonMaterialV2Schema.parse(provisional);
}
