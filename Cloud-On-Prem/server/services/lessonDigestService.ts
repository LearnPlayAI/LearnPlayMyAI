import { eq } from "drizzle-orm";
import { db } from "../db";
import { lessons, lessonVersions, type Lesson } from "@shared/schema";
import { GoogleGenAI } from "@google/genai";
import { AIService } from "../ai/aiService";

type LessonDigestSectionId =
  | "overview"
  | "key_concepts"
  | "how_it_works"
  | "real_world"
  | "key_takeaways"
  | "key_terms";

export interface LessonDigestSection {
  id: LessonDigestSectionId;
  title: string;
  summary?: string;
  paragraphs: string[];
  bullets: string[];
  sourceChunkIds: string[];
}

export interface LessonDigestChunk {
  id: string;
  title: string;
  text: string;
}

export interface LessonDigestPayload {
  schemaVersion: "v1";
  languageCode: string;
  versionRef: string;
  generatedAt: string;
  groundingScore?: number;
  groundingPassed?: boolean;
  sections: LessonDigestSection[];
  sourceChunks: LessonDigestChunk[];
}

interface StoredDigestCache {
  byKey?: Record<string, LessonDigestPayload>;
  metrics?: {
    cacheHits?: number;
    generated?: number;
    lastCacheHitAt?: string;
    lastGeneratedAt?: string;
    lastGenerationMs?: number;
    lastGroundingScore?: number;
  };
}

type SourceBlock = {
  id: string;
  title: string;
  text: string;
};

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitParagraphs(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toBulletsFromParagraphs(paragraphs: string[], max = 6): string[] {
  const bullets: string[] = [];
  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    for (const sentence of sentences) {
      bullets.push(sentence);
      if (bullets.length >= max) return bullets;
    }
  }
  return bullets;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

function wordCount(value: string): number {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function deriveVersionRef(lesson: Lesson): string {
  const languageCode = String(lesson.languageCode || "en").trim() || "en";
  const activeVersionId = String(lesson.activeLessonVersionId || "").trim();
  if (activeVersionId) return `${languageCode}:${activeVersionId}`;
  return `${languageCode}:lesson-${lesson.id}:${new Date(lesson.updatedAt || lesson.createdAt || Date.now()).getTime()}`;
}

function collectSourceBlocks(lesson: Lesson): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  const pushBlock = (id: string, title: string, text: string | null | undefined) => {
    const normalized = normalizeWhitespace(String(text || ""));
    if (!normalized) return;
    blocks.push({ id, title, text: normalized });
  };

  pushBlock("lesson-description", "Lesson Description", lesson.description);
  pushBlock("lesson-input", "Lesson Core Content", lesson.inputText);
  pushBlock("lesson-detail", "Lesson Detail", lesson.detail);
  pushBlock("lesson-real-world", "Real-World Example", lesson.realWorldExample);

  const contractSlides = Array.isArray((lesson as any)?.learningAssetContract?.slides)
    ? (lesson as any).learningAssetContract.slides
    : [];
  for (const slide of contractSlides) {
    const position = Number(slide?.position || 0);
    const title = String(slide?.title || "").trim();
    const keyPoints = Array.isArray(slide?.keyPoints)
      ? slide.keyPoints.map((point: any) => String(point || "").trim()).filter(Boolean)
      : [];
    if (!title && keyPoints.length === 0) continue;
    pushBlock(
      `slide-${position || blocks.length + 1}`,
      title ? `Slide ${position || "?"}: ${title}` : `Slide ${position || "?"}`,
      keyPoints.join("\n")
    );
  }

  const rawParagraphs = dedupeStrings(
    blocks.flatMap((block) => splitParagraphs(block.text))
  );
  const rawSentenceBullets = dedupeStrings(
    blocks.flatMap((block) => toBulletsFromParagraphs(splitParagraphs(block.text), 12))
  );

  if (rawParagraphs.length > 0) {
    pushBlock("derived-paragraphs", "Derived Paragraphs", rawParagraphs.slice(0, 16).join("\n\n"));
  }
  if (rawSentenceBullets.length > 0) {
    pushBlock("derived-bullets", "Derived Key Statements", rawSentenceBullets.slice(0, 16).join("\n"));
  }

  return blocks.slice(0, 32);
}

function extractKeyTerms(blocks: SourceBlock[]): string[] {
  const terms = new Set<string>();
  const candidateRegexes = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
    /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})\b/g,
    /\b([a-zA-Z][a-zA-Z0-9-]{3,})\s*:\s*/g,
  ];
  for (const block of blocks) {
    const text = block.text;
    for (const regex of candidateRegexes) {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        const candidate = String(match[1] || "").trim();
        if (!candidate) continue;
        const normalized = candidate.toLowerCase();
        if (["this", "that", "with", "from", "into", "your", "lesson"].includes(normalized)) continue;
        terms.add(candidate);
        if (terms.size >= 10) return Array.from(terms);
      }
    }
  }
  return Array.from(terms);
}

function takeParagraphs(blocks: SourceBlock[], count: number): { paragraphs: string[]; sourceChunkIds: string[] } {
  const paragraphs: string[] = [];
  const sourceChunkIds: string[] = [];
  for (const block of blocks) {
    const parts = splitParagraphs(block.text);
    if (parts.length === 0) continue;
    for (const part of parts) {
      paragraphs.push(part);
      sourceChunkIds.push(block.id);
      if (paragraphs.length >= count) {
        return { paragraphs: dedupeStrings(paragraphs), sourceChunkIds: dedupeStrings(sourceChunkIds) };
      }
    }
  }
  return { paragraphs: dedupeStrings(paragraphs), sourceChunkIds: dedupeStrings(sourceChunkIds) };
}

function takeBullets(blocks: SourceBlock[], count: number): { bullets: string[]; sourceChunkIds: string[] } {
  const bullets: string[] = [];
  const sourceChunkIds: string[] = [];
  for (const block of blocks) {
    const fromBlock = toBulletsFromParagraphs(splitParagraphs(block.text), count);
    if (fromBlock.length === 0) continue;
    for (const bullet of fromBlock) {
      bullets.push(bullet);
      sourceChunkIds.push(block.id);
      if (bullets.length >= count) {
        return { bullets: dedupeStrings(bullets), sourceChunkIds: dedupeStrings(sourceChunkIds) };
      }
    }
  }
  return { bullets: dedupeStrings(bullets), sourceChunkIds: dedupeStrings(sourceChunkIds) };
}

function buildDigestFromBlocks(lesson: Lesson, blocks: SourceBlock[]): LessonDigestPayload {
  const versionRef = deriveVersionRef(lesson);
  const languageCode = String(lesson.languageCode || "en").trim() || "en";
  const generatedAt = new Date().toISOString();

  const firstBlocks = blocks.slice(0, 6);
  const laterBlocks = blocks.slice(3);

  const overview = takeParagraphs(firstBlocks.length ? firstBlocks : blocks, 2);
  const keyConcepts = takeBullets(blocks, 6);
  const howItWorks = takeParagraphs(laterBlocks.length ? laterBlocks : blocks, 3);
  const realWorld = takeParagraphs(
    blocks.filter((block) => block.id.includes("real-world") || /example|case/i.test(block.title)),
    2
  );
  const takeaways = takeBullets(blocks.slice().reverse(), 5);
  const keyTerms = extractKeyTerms(blocks).slice(0, 8);

  const fallbackParagraph = normalizeWhitespace(lesson.description || lesson.inputText || lesson.detail || "No lesson content available.");
  const fallbackSentence = splitSentences(fallbackParagraph)[0] || fallbackParagraph;

  const sectionsBase: LessonDigestSection[] = [
    {
      id: "overview",
      title: "Overview",
      summary: fallbackSentence,
      paragraphs: overview.paragraphs.length ? overview.paragraphs : [fallbackParagraph],
      bullets: [],
      sourceChunkIds: overview.sourceChunkIds.length ? overview.sourceChunkIds : [blocks[0]?.id || "lesson-description"],
    },
    {
      id: "key_concepts",
      title: "Key Concepts",
      summary: "Core ideas from the lesson content.",
      paragraphs: [],
      bullets: keyConcepts.bullets,
      sourceChunkIds: keyConcepts.sourceChunkIds,
    },
    {
      id: "how_it_works",
      title: "How It Works",
      summary: "Step-by-step explanation grounded in the lesson material.",
      paragraphs: howItWorks.paragraphs,
      bullets: [],
      sourceChunkIds: howItWorks.sourceChunkIds,
    },
    {
      id: "real_world",
      title: "Real-World Context",
      summary: "Practical context and examples from the lesson.",
      paragraphs: realWorld.paragraphs,
      bullets: [],
      sourceChunkIds: realWorld.sourceChunkIds,
    },
    {
      id: "key_takeaways",
      title: "Key Takeaways",
      summary: "High-impact points to remember.",
      paragraphs: [],
      bullets: takeaways.bullets,
      sourceChunkIds: takeaways.sourceChunkIds,
    },
    {
      id: "key_terms",
      title: "Key Terms",
      summary: "Important terms appearing in this lesson.",
      paragraphs: [],
      bullets: keyTerms,
      sourceChunkIds: keyTerms.length ? blocks.map((block) => block.id) : [],
    },
  ];
  const sections: LessonDigestSection[] = sectionsBase.map((section) => ({
    ...section,
    paragraphs: dedupeStrings(section.paragraphs || []).slice(0, 6),
    bullets: dedupeStrings(section.bullets || []).slice(0, 10),
    sourceChunkIds: dedupeStrings(section.sourceChunkIds || []),
  }));

  const normalizedSections = sections.filter((section) => (section.paragraphs.length + section.bullets.length) > 0);

  return {
    schemaVersion: "v1",
    languageCode,
    versionRef,
    generatedAt,
    sections: normalizedSections,
    sourceChunks: blocks.map((block) => ({
      id: block.id,
      title: block.title,
      text: block.text.slice(0, 2500),
    })),
  };
}

function parseJsonFromModelText(rawText: string): any {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("Gemini returned empty digest payload.");
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    throw new Error("Gemini returned invalid JSON for lesson digest.");
  }
}

async function buildDigestWithGemini(
  lesson: Lesson,
  blocks: SourceBlock[],
  languageCode: string
): Promise<LessonDigestPayload> {
  const aiResult = await AIService.getActiveConfigWithError("text");
  if (!aiResult.success || !aiResult.service) {
    throw new Error(aiResult.error?.message || "Gemini integration is not configured.");
  }

  const apiKey = String((aiResult.service as any).apiKey || "").trim();
  const modelName = String((aiResult.service as any).modelName || "gemini-2.5-flash").trim();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured in Integration Settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const sourceChunks = blocks.map((block) => ({
    id: block.id,
    title: block.title,
    text: block.text.slice(0, 2500),
  }));
  const sourceChunkIds = sourceChunks.map((chunk) => chunk.id);
  const sourcePayload = JSON.stringify(sourceChunks, null, 2);
  const allowedSectionIds: LessonDigestSectionId[] = [
    "overview",
    "key_concepts",
    "how_it_works",
    "real_world",
    "key_takeaways",
    "key_terms",
  ];

  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const retryDirective = attempt === 1
        ? ""
        : `\nRETRY: previous output failed validation (${String(lastError?.message || "invalid structure")}). Keep every statement strictly grounded in provided source chunks and include sourceChunkIds for each section.`;
      const response = await ai.models.generateContent({
        model: modelName,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 4800,
        },
        contents:
`You generate a grounded lesson digest in language "${languageCode}".
Use ONLY the supplied source chunks. No external facts, no assumptions, no hallucinations.

Return strict JSON object with:
{
  "sections": [
    {
      "id": "overview|key_concepts|how_it_works|real_world|key_takeaways|key_terms",
      "title": "string",
      "summary": "string optional",
      "paragraphs": ["string"],
      "bullets": ["string"],
      "sourceChunkIds": ["chunk-id"]
    }
  ]
}

Rules:
- Include these core sections in this exact order:
  1) overview
  2) key_concepts
  3) how_it_works (optional, only if source describes processes/steps)
  4) real_world (optional, only if source contains practical applications or if you can derive one safely)
  5) key_takeaways
  6) key_terms (optional, only if source contains specialized vocabulary)
- Overview needs at least 2 substantive paragraphs.
- key_concepts/key_takeaways each need at least 6 bullets.
- key_terms needs at least 6 bullets in format "Term — grounded explanation".
- Every section must include sourceChunkIds from the provided chunk IDs.
- Use learner-friendly wording while preserving depth.
- Total digest target length: 450-1200 words.
- Use only this source data:
${sourcePayload}${retryDirective}`,
      });
      const raw = String((response as any)?.text || "").trim();
      const parsed = parseJsonFromModelText(raw);
      const parsedSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
      const sections: LessonDigestSection[] = parsedSections
        .map((section: any) => {
          const id = String(section?.id || "").trim() as LessonDigestSectionId;
          if (!allowedSectionIds.includes(id)) return null;
          const title = String(section?.title || id.replace(/_/g, " ")).trim();
          const summary = String(section?.summary || "").trim();
          const paragraphs = dedupeStrings(
            (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
              .map((value: any) => String(value || "").trim())
              .filter(Boolean)
          ).slice(0, 6);
          const bullets = dedupeStrings(
            (Array.isArray(section?.bullets) ? section.bullets : [])
              .map((value: any) => String(value || "").trim())
              .filter(Boolean)
          ).slice(0, 10);
          const ids = dedupeStrings(
            (Array.isArray(section?.sourceChunkIds) ? section.sourceChunkIds : [])
              .map((value: any) => String(value || "").trim())
              .filter((idValue: string) => sourceChunkIds.includes(idValue))
          );
          if (paragraphs.length + bullets.length === 0) return null;
          if (ids.length === 0) return null;
          return {
            id,
            title: title || id,
            summary: summary || undefined,
            paragraphs,
            bullets,
            sourceChunkIds: ids,
          } as LessonDigestSection;
        })
        .filter((section: LessonDigestSection | null): section is LessonDigestSection => !!section);

      if (sections.length < 4) {
        throw new Error("Digest contained too few valid sections.");
      }
      const richness = validateDigestRichness(sections);
      if (!richness.passed) {
        throw new Error(richness.reason);
      }

      return {
        schemaVersion: "v1",
        languageCode,
        versionRef: deriveVersionRef(lesson),
        generatedAt: new Date().toISOString(),
        sections,
        sourceChunks,
      };
    } catch (error: any) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "Failed to generate lesson digest with Gemini.");
}

function validateDigestRichness(sections: LessonDigestSection[]): { passed: boolean; reason: string } {
  const order: LessonDigestSectionId[] = [
    "overview",
    "key_concepts",
    "key_takeaways",
  ];
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const id of order) {
    if (!byId.has(id)) {
      return { passed: false, reason: `Digest missing required section: ${id}` };
    }
  }

  const narrativeIds: LessonDigestSectionId[] = ["overview"];
  for (const id of narrativeIds) {
    const section = byId.get(id);
    if (section && (section.paragraphs || []).length < 2) {
      return { passed: false, reason: `Section ${id} needs at least 2 paragraphs.` };
    }
  }

  const bulletIds: LessonDigestSectionId[] = ["key_concepts", "key_takeaways"];
  for (const id of bulletIds) {
    const section = byId.get(id);
    if (section && (section.bullets || []).length < 5) {
      return { passed: false, reason: `Section ${id} needs at least 5 bullets.` };
    }
  }

  const totalWords = sections.reduce((sum, section) => {
    const sectionText = [
      section.summary || "",
      ...(section.paragraphs || []),
      ...(section.bullets || []),
    ].join(" ");
    return sum + wordCount(sectionText);
  }, 0);
  if (totalWords < 320) {
    return { passed: false, reason: `Digest too short (${totalWords} words).` };
  }

  return { passed: true, reason: "ok" };
}

function tokenizeForCoverage(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreCoverage(statement: string, sourceText: string): number {
  const statementTokens = Array.from(new Set(tokenizeForCoverage(statement)));
  if (statementTokens.length === 0) return 1;
  const sourceSet = new Set(tokenizeForCoverage(sourceText));
  let hits = 0;
  for (const token of statementTokens) {
    if (sourceSet.has(token)) hits += 1;
  }
  return hits / statementTokens.length;
}

function validateDigestGrounding(payload: LessonDigestPayload): {
  passed: boolean;
  overallScore: number;
  failedSections: string[];
} {
  const chunkById = new Map(payload.sourceChunks.map((chunk) => [chunk.id, chunk]));
  let totalScore = 0;
  let totalCount = 0;
  const failedSections: string[] = [];

  for (const section of payload.sections) {
    const statements = [
      ...(section.summary ? [section.summary] : []),
      ...(section.paragraphs || []),
      ...(section.bullets || []),
    ].filter(Boolean);
    if (statements.length === 0) continue;
    const sourceText = (section.sourceChunkIds || [])
      .map((id) => chunkById.get(id)?.text || "")
      .join("\n");
    if (!sourceText.trim()) {
      failedSections.push(section.id);
      continue;
    }

    let sectionTotal = 0;
    for (const statement of statements) {
      const score = scoreCoverage(statement, sourceText);
      totalScore += score;
      totalCount += 1;
      sectionTotal += score;
    }
    const sectionAverage = sectionTotal / statements.length;
    let threshold = 0.45;
    if (section.id === "real_world") threshold = 0.15; // Leniency for real world analogies which introduce external nouns
    
    if (sectionAverage < threshold) {
      failedSections.push(section.id);
    }
  }

  const overallScore = totalCount > 0 ? totalScore / totalCount : 1;
  return {
    passed: failedSections.length === 0,
    overallScore,
    failedSections,
  };
}

export class LessonDigestService {
  private static async resolveLessonState(
    lesson: Lesson,
    options?: { versionId?: string; languageCode?: string }
  ): Promise<{ lessonState: Lesson; versionRef: string; languageCode: string }> {
    const requestedVersionId = String(options?.versionId || "").trim();
    const requestedLanguageCode = String(options?.languageCode || "").trim();
    if (!requestedVersionId) {
      const lessonLanguage = requestedLanguageCode || String(lesson.languageCode || "en").trim() || "en";
      return {
        lessonState: {
          ...lesson,
          languageCode: lessonLanguage,
        } as Lesson,
        versionRef: deriveVersionRef({
          ...lesson,
          languageCode: lessonLanguage,
        } as Lesson),
        languageCode: lessonLanguage,
      };
    }

    const [versionRow] = await db
      .select({
        id: lessonVersions.id,
        lessonId: lessonVersions.lessonId,
        languageCode: lessonVersions.languageCode,
        createdAt: lessonVersions.createdAt,
        lessonSnapshot: lessonVersions.lessonSnapshot,
      })
      .from(lessonVersions)
      .where(eq(lessonVersions.id, requestedVersionId))
      .limit(1);

    if (!versionRow || String(versionRow.lessonId) !== String(lesson.id)) {
      throw new Error("Requested lesson version was not found for digest generation.");
    }

    const snapshot = (versionRow.lessonSnapshot && typeof versionRow.lessonSnapshot === "object")
      ? (versionRow.lessonSnapshot as Record<string, any>)
      : {};
    const languageCode = requestedLanguageCode || String(versionRow.languageCode || snapshot.languageCode || lesson.languageCode || "en").trim() || "en";
    const lessonState = {
      ...lesson,
      ...snapshot,
      id: lesson.id,
      organizationId: lesson.organizationId,
      languageCode,
      activeLessonVersionId: requestedVersionId,
      updatedAt: versionRow.createdAt || lesson.updatedAt,
    } as Lesson;

    return {
      lessonState,
      versionRef: `${languageCode}:version:${requestedVersionId}`,
      languageCode,
    };
  }

  static async getOrCreateDigest(
    lesson: Lesson,
    options?: { versionId?: string; languageCode?: string; forceRegenerate?: boolean; skipPersist?: boolean }
  ): Promise<LessonDigestPayload> {
    const forceRegenerate = options?.forceRegenerate === true;
    const skipPersist = options?.skipPersist === true;
    const startedAt = Date.now();

    const { lessonState, versionRef, languageCode } = await this.resolveLessonState(lesson, options);
    const cacheKey = `${languageCode}::${versionRef}`;

    const metadataObject = (lesson.metadata && typeof lesson.metadata === "object")
      ? { ...(lesson.metadata as Record<string, any>) }
      : {};
    const cache = (metadataObject.lessonDigestV1 && typeof metadataObject.lessonDigestV1 === "object")
      ? (metadataObject.lessonDigestV1 as StoredDigestCache)
      : {};

    const cached = cache.byKey?.[cacheKey];
    if (!forceRegenerate && cached && Array.isArray(cached.sections) && cached.sections.length > 0) {
      console.log(`[LessonDigest] cache_hit lesson=${lesson.id} key=${cacheKey}`);
      if (!skipPersist) {
        const nextMetrics = {
          ...(cache.metrics || {}),
          cacheHits: Number(cache.metrics?.cacheHits || 0) + 1,
          lastCacheHitAt: new Date().toISOString(),
        };
        await db
          .update(lessons)
          .set({
            metadata: {
              ...metadataObject,
              lessonDigestV1: {
                ...cache,
                metrics: nextMetrics,
              },
            },
          })
          .where(eq(lessons.id, lesson.id));
      }
      return cached;
    }

    const sourceBlocks = collectSourceBlocks(lessonState);
    if (sourceBlocks.length === 0) {
      throw new Error("No source content available to build grounded lesson digest.");
    }
    const digest = await buildDigestWithGemini(lessonState, sourceBlocks, languageCode);
    digest.languageCode = languageCode;
    digest.versionRef = versionRef;

    const validation = validateDigestGrounding(digest);
    digest.groundingScore = Number(validation.overallScore.toFixed(4));
    digest.groundingPassed = validation.passed;

    if (!validation.passed) {
      throw new Error(`Digest grounding validation failed for sections: ${validation.failedSections.join(", ")}`);
    }
    console.log(
      `[LessonDigest] generated lesson=${lesson.id} key=${cacheKey} score=${digest.groundingScore} ` +
      `sections=${digest.sections.length} chunks=${digest.sourceChunks.length}`
    );

    if (!skipPersist) {
      const durationMs = Date.now() - startedAt;
      const nextByKey = {
        ...(cache.byKey || {}),
        [cacheKey]: digest,
      };
      const nextMetrics = {
        ...(cache.metrics || {}),
        generated: Number(cache.metrics?.generated || 0) + 1,
        lastGeneratedAt: new Date().toISOString(),
        lastGenerationMs: durationMs,
        lastGroundingScore: digest.groundingScore,
      };

      await db
        .update(lessons)
        .set({
          metadata: {
            ...metadataObject,
            lessonDigestV1: {
              byKey: nextByKey,
              metrics: nextMetrics,
            },
          },
        })
        .where(eq(lessons.id, lesson.id));
    }

    return digest;
  }

  static async regenerateDigest(
    lesson: Lesson,
    options?: { versionId?: string; languageCode?: string }
  ): Promise<LessonDigestPayload> {
    return this.getOrCreateDigest(lesson, {
      ...(options || {}),
      forceRegenerate: true,
    });
  }

  static async invalidateDigestForLesson(lessonId: string, options?: { languageCode?: string }): Promise<void> {
    const [lesson] = await db
      .select({
        id: lessons.id,
        metadata: lessons.metadata,
      })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    if (!lesson) return;

    const metadataObject = (lesson.metadata && typeof lesson.metadata === "object")
      ? { ...(lesson.metadata as Record<string, any>) }
      : {};
    const cache = (metadataObject.lessonDigestV1 && typeof metadataObject.lessonDigestV1 === "object")
      ? (metadataObject.lessonDigestV1 as StoredDigestCache)
      : {};

    const languageFilter = String(options?.languageCode || "").trim().toLowerCase();
    const sourceByKey = cache.byKey || {};
    const nextByKey: Record<string, LessonDigestPayload> = {};
    for (const [key, value] of Object.entries(sourceByKey)) {
      if (!languageFilter) continue;
      const lang = String(value?.languageCode || "").trim().toLowerCase();
      if (lang === languageFilter) continue;
      nextByKey[key] = value;
    }

    await db
      .update(lessons)
      .set({
        metadata: {
          ...metadataObject,
          lessonDigestV1: {
            byKey: nextByKey,
            metrics: cache.metrics || {},
          },
        },
      })
      .where(eq(lessons.id, lessonId));
  }

  static getDigestMetrics(lesson: Lesson): {
    cacheHits: number;
    generated: number;
    lastCacheHitAt: string | null;
    lastGeneratedAt: string | null;
    lastGenerationMs: number | null;
    lastGroundingScore: number | null;
    entryCount: number;
    languages: string[];
  } {
    const metadataObject = (lesson.metadata && typeof lesson.metadata === "object")
      ? { ...(lesson.metadata as Record<string, any>) }
      : {};
    const cache = (metadataObject.lessonDigestV1 && typeof metadataObject.lessonDigestV1 === "object")
      ? (metadataObject.lessonDigestV1 as StoredDigestCache)
      : {};
    const byKey = cache.byKey || {};
    const entries = Object.values(byKey);
    const languages = Array.from(new Set(entries.map((entry) => String(entry.languageCode || "").trim()).filter(Boolean)));
    return {
      cacheHits: Number(cache.metrics?.cacheHits || 0),
      generated: Number(cache.metrics?.generated || 0),
      lastCacheHitAt: cache.metrics?.lastCacheHitAt || null,
      lastGeneratedAt: cache.metrics?.lastGeneratedAt || null,
      lastGenerationMs: Number.isFinite(Number(cache.metrics?.lastGenerationMs))
        ? Number(cache.metrics?.lastGenerationMs)
        : null,
      lastGroundingScore: Number.isFinite(Number(cache.metrics?.lastGroundingScore))
        ? Number(cache.metrics?.lastGroundingScore)
        : null,
      entryCount: entries.length,
      languages,
    };
  }
}
