type DraftDocumentLike = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  storagePath?: string | null;
  extractedContent?: any;
};

export function isPptxDraftDocument(doc: Pick<DraftDocumentLike, "fileName" | "mimeType">): boolean {
  const fileName = String(doc.fileName || "").toLowerCase();
  const mimeType = String(doc.mimeType || "").toLowerCase();
  return (
    fileName.endsWith(".pptx") ||
    fileName.endsWith(".ppt") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  );
}

export function cleanPptxLessonTitle(fileName: string): string {
  const baseName = String(fileName || "PowerPoint Lesson")
    .replace(/\.(pptx|ppt)$/i, "")
    .replace(/^\s*\d+\s*[-_.]\s*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bEN\s*v?\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return baseName || "PowerPoint Lesson";
}

function firstUsefulTextLine(text: string, fallback: string): string {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length >= 24 && !/^slide\s+\d+\b/i.test(item));
  return line || `Source-grounded lesson from ${fallback}.`;
}

function pptxRawText(content: any): string {
  const rawText = String(content?.rawText || "").trim();
  if (rawText) return rawText;

  const sections = Array.isArray(content?.sections) ? content.sections : [];
  return sections
    .map((section: any) => `${String(section?.heading || "").trim()}\n${String(section?.content || "").trim()}`.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function pptxSlideTitles(content: any): string[] {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  return sections
    .map((section: any) => String(section?.heading || "").trim())
    .filter((heading: string) => heading && !/^slide\s+\d+\b/i.test(heading))
    .slice(0, 4);
}

function pptxSlideCount(content: any): number | null {
  const metadataCount = Number(content?.metadata?.slideCount || content?.slideCount || 0);
  if (Number.isFinite(metadataCount) && metadataCount > 0) return Math.round(metadataCount);
  const sectionsCount = Array.isArray(content?.sections) ? content.sections.length : 0;
  return sectionsCount > 0 ? sectionsCount : null;
}

export function buildPptxDocumentLessons(
  docs: DraftDocumentLike[],
  targetAudience: "beginner" | "intermediate" | "advanced" = "intermediate",
): any[] {
  const objectiveVerb: Record<"beginner" | "intermediate" | "advanced", string> = {
    beginner: "Describe",
    intermediate: "Apply",
    advanced: "Evaluate",
  };

  return docs
    .filter(isPptxDraftDocument)
    .map((doc) => {
      const content = doc.extractedContent || {};
      const title = cleanPptxLessonTitle(doc.fileName);
      const sourceContent = pptxRawText(content);
      const slideTitles = pptxSlideTitles(content);
      const objectives = slideTitles.length > 0
        ? slideTitles.map((slideTitle) => `${objectiveVerb[targetAudience]} ${slideTitle.toLowerCase()} using the uploaded presentation`)
        : [
            `${objectiveVerb[targetAudience]} the key ideas in ${title.toLowerCase()} using the uploaded presentation`,
            "Use the presentation slides as the primary lesson material",
          ];

      return {
        title,
        description: firstUsefulTextLine(sourceContent, doc.fileName),
        objectives,
        learningObjectives: objectives,
        keyTerms: [],
        assessmentIdeas: [],
        isFromContent: true,
        isSelected: true,
        lessonType: "content",
        sourceContent,
        sourceContentRaw: sourceContent,
        sourceSegmentIds: [],
        sourceAssets: [],
        sourceDocumentId: null,
        sourceDraftDocumentId: doc.id,
        sourceDocumentName: doc.fileName,
        sourceDocumentType: "pptx",
        sourcePptxStoragePath: doc.storagePath || null,
        uploadedPptxStorageKey: doc.storagePath || null,
        slideCount: pptxSlideCount(content),
        contentStatus: "ready",
        metadata: {
          sourceGrounded: true,
          generatedBy: "pptx_document_bundle",
          sourceDraftDocumentId: doc.id,
          sourceDocumentName: doc.fileName,
          sourceDocumentType: "pptx",
          sourcePptxStoragePath: doc.storagePath || null,
          slideCount: pptxSlideCount(content),
          skipSourceImageExtraction: true,
          preconvertSlidesOnFinalize: true,
        },
      };
    });
}

export function derivePptxCourseTitle(docs: DraftDocumentLike[], lessons: any[]): string {
  const cleanedTitles = docs
    .filter(isPptxDraftDocument)
    .map((doc) => cleanPptxLessonTitle(doc.fileName))
    .filter(Boolean);
  if (cleanedTitles.length === 1) return cleanedTitles[0];

  const tokenized = cleanedTitles.map((title) => title.split(/\s+/).filter(Boolean));
  const commonTokens: string[] = [];
  for (let index = 0; index < Math.min(...tokenized.map((tokens) => tokens.length)); index++) {
    const candidate = tokenized[0][index];
    if (tokenized.every((tokens) => tokens[index]?.toLowerCase() === candidate.toLowerCase())) {
      commonTokens.push(candidate);
    } else {
      break;
    }
  }

  const commonTitle = commonTokens.join(" ").trim().replace(/\bAI Tools AI$/i, "AI Tools");
  if (commonTitle.split(/\s+/).filter(Boolean).length >= 3) return commonTitle;

  const firstLessonTitle = String(lessons?.[0]?.title || "").trim();
  return firstLessonTitle || "PowerPoint Course";
}
