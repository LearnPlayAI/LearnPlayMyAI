import { and, eq } from "drizzle-orm";
import mammoth from "mammoth";
import { db } from "../db";
import { lessons, type Lesson } from "@shared/schema";

const MAX_GUIDE_CHARACTERS = 120_000;
const MAX_STORED_VERSIONS_PER_LANGUAGE = 30;
const MAX_IMAGE_URLS_PER_STEP = 12;
const MAX_TOTAL_IMAGE_URLS = 12;
const MAX_DATA_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_DATA_IMAGE_BYTES = 8 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 15_000;
const PARSE_CONCURRENCY_LIMIT = 2;
const SAFE_RELATIVE_IMAGE_PREFIXES = ["/uploads/", "/api/uploads/", "/public/"];

const allowedImageHosts = new Set(
  String(process.env.STEP_GUIDE_IMAGE_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

export class StepGuideVersionNotFoundError extends Error {
  constructor(message = "Step-by-step guide version not found.") {
    super(message);
    this.name = "StepGuideVersionNotFoundError";
  }
}

export type StepGuideStep = {
  id: string;
  title: string;
  content: string;
  commands: string[];
  imageUrls: string[];
};

export type StepByStepGuidePayload = {
  schemaVersion: "v1";
  languageCode: string;
  versionRef: string;
  generatedAt: string;
  sourceType: "upload" | "translated" | "manual";
  sourceFilename?: string;
  summary?: string;
  steps: StepGuideStep[];
};

type StoredGuideVersion = StepByStepGuidePayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: string | null;
  sourceMimeType?: string | null;
  translatedFromLanguageCode?: string | null;
};

type StepGuideLanguageBucket = {
  activeVersionId?: string;
  versions?: StoredGuideVersion[];
};

type StoredStepGuideCache = {
  byLanguage?: Record<string, StepGuideLanguageBucket>;
};

class ParseSemaphore {
  private inFlight = 0;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.inFlight < PARSE_CONCURRENCY_LIMIT) {
      this.inFlight += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

const parseSemaphore = new ParseSemaphore();

function normalizeLanguageCode(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "en";
}

function normalizeOptionalLanguageCode(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function cleanText(value: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function sanitizeHtml(rawHtml: string): string {
  let html = String(rawHtml || "").trim();
  if (!html) return "";
  html = html.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript:/gi, "");
  return html;
}

function stripHtml(html: string): string {
  return cleanText(
    String(html || "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

function decodeHtmlEntities(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToGuideText(html: string): string {
  if (!html) return "";
  const withStructure = String(html)
    .replace(
      /<\s*pre[^>]*>\s*<\s*code[^>]*>([\s\S]*?)<\s*\/\s*code\s*>\s*<\s*\/\s*pre\s*>/gi,
      (_m, code) => `\n\`\`\`\n${decodeHtmlEntities(String(code || ""))}\n\`\`\`\n`
    )
    .replace(
      /<\s*pre[^>]*>([\s\S]*?)<\s*\/\s*pre\s*>/gi,
      (_m, code) => `\n\`\`\`\n${decodeHtmlEntities(String(code || ""))}\n\`\`\`\n`
    )
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|section|article|blockquote|pre|h[1-6]|tr|td|th|figcaption)\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*(ul|ol|table)\s*>/gi, "\n\n")
    .replace(/<\s*code[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/gi, (_m, code) => decodeHtmlEntities(String(code || "")))
    .replace(/<\s*strong[^>]*>([\s\S]*?)<\s*\/\s*strong\s*>/gi, (_m, text) => decodeHtmlEntities(String(text || "")))
    .replace(/<\s*b[^>]*>([\s\S]*?)<\s*\/\s*b\s*>/gi, (_m, text) => decodeHtmlEntities(String(text || "")))
    .replace(/<\s*em[^>]*>([\s\S]*?)<\s*\/\s*em\s*>/gi, (_m, text) => decodeHtmlEntities(String(text || "")))
    .replace(/<\s*i[^>]*>([\s\S]*?)<\s*\/\s*i\s*>/gi, (_m, text) => decodeHtmlEntities(String(text || "")))
    .replace(/<[^>]+>/g, " ");
  return cleanText(decodeHtmlEntities(withStructure));
}

function isSafeDataImageUrl(value: string): boolean {
  const match = String(value || "").trim().match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return false;
  const base64Payload = match[2] || "";
  const approxBytes = Math.floor((base64Payload.length * 3) / 4);
  return approxBytes > 0 && approxBytes <= MAX_DATA_IMAGE_BYTES;
}

function getDataImageBytes(value: string): number {
  const match = String(value || "").trim().match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return 0;
  const base64Payload = match[2] || "";
  return Math.floor((base64Payload.length * 3) / 4);
}

function isSafeImageUrl(rawValue: string): boolean {
  const value = String(rawValue || "").trim();
  if (!value) return false;
  if (value.startsWith("data:image/")) {
    return isSafeDataImageUrl(value);
  }

  if (value.startsWith("/")) {
    return SAFE_RELATIVE_IMAGE_PREFIXES.some((prefix) => value.startsWith(prefix));
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (allowedImageHosts.size === 0) return false;
  return allowedImageHosts.has(host);
}

function extractImageUrls(rawHtml: string, rawText: string): string[] {
  const htmlMatches = Array.from(String(rawHtml || "").matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)).map((m) => String(m[1] || "").trim());
  const markdownMatches = Array.from(String(rawText || "").matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)).map((m) => String(m[1] || "").trim());
  const candidates = dedupe([...htmlMatches, ...markdownMatches]);
  const accepted: string[] = [];
  let totalDataImageBytes = 0;

  for (const candidate of candidates) {
    if (!isSafeImageUrl(candidate)) continue;
    if (candidate.startsWith("data:image/")) {
      const dataBytes = getDataImageBytes(candidate);
      if (dataBytes <= 0) continue;
      if (totalDataImageBytes + dataBytes > MAX_TOTAL_DATA_IMAGE_BYTES) continue;
      totalDataImageBytes += dataBytes;
    }
    accepted.push(candidate);
    if (accepted.length >= MAX_TOTAL_IMAGE_URLS) break;
  }

  return accepted;
}

function extractCommands(rawText: string): string[] {
  const text = String(rawText || "");
  const blocks = Array.from(text.matchAll(/```(?:bash|sh|shell|zsh|powershell|cmd)?\s*([\s\S]*?)```/gi)).map((m) => cleanText(m[1] || ""));
  const lineCommands = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(\$|>|sudo\s+|npm\s+|pnpm\s+|yarn\s+|python\s+|pip\s+|git\s+|docker\s+)/i.test(line));
  return dedupe([...blocks, ...lineCommands]).slice(0, 20);
}

function toStepTitle(index: number, chunk: string): string {
  const firstLine = String(chunk || "").split("\n")[0]?.trim() || "";
  const explicit = firstLine.replace(/^\s*(step\s*\d+[:.-]?|\d+[).:-])\s*/i, "").trim();
  if (explicit.length >= 3 && explicit.length <= 120) return explicit;
  return `Step ${index}`;
}

function normalizeForCompare(value: string): string {
  return String(value || "")
    .replace(/[*#`_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isStepBoundaryText(text: string): boolean {
  const line = String(text || "").split("\n")[0]?.trim() || "";
  if (!line) return false;
  return /^((step\s*\d+)|(#\d+)|(\d+[).:-]))(?:\s+|$)/i.test(line);
}

function extractImageUrlsFromHtmlBlock(blockHtml: string): string[] {
  return dedupe(
    Array.from(String(blockHtml || "").matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)).map((m) => String(m[1] || "").trim())
  ).filter(isSafeImageUrl);
}

function buildStepsFromHtml(rawHtml: string): StepGuideStep[] {
  const html = String(rawHtml || "").trim();
  if (!html) return [];

  type DraftStep = { title: string; chunks: string[]; commands: string[]; imageUrls: string[] };
  const steps: DraftStep[] = [];
  let current: DraftStep = { title: "Step 1", chunks: [], commands: [], imageUrls: [] };
  const acceptedImageUrls = new Set<string>();
  let totalAcceptedUrls = 0;
  let totalDataImageBytes = 0;

  const tryAcceptImageUrl = (candidate: string): string | null => {
    const value = String(candidate || "").trim();
    if (!value) return null;
    if (!isSafeImageUrl(value)) return null;
    if (acceptedImageUrls.has(value)) return value;
    if (totalAcceptedUrls >= MAX_TOTAL_IMAGE_URLS) return null;

    if (value.startsWith("data:image/")) {
      const dataBytes = getDataImageBytes(value);
      if (dataBytes <= 0) return null;
      if (totalDataImageBytes + dataBytes > MAX_TOTAL_DATA_IMAGE_BYTES) return null;
      totalDataImageBytes += dataBytes;
    }

    acceptedImageUrls.add(value);
    totalAcceptedUrls += 1;
    return value;
  };

  const commitCurrent = () => {
    const merged = cleanText(current.chunks.join("\n\n"));
    const hasText = merged.length > 0;
    const hasImages = current.imageUrls.length > 0;
    if (!hasText && !hasImages) return;

    const title = current.title || toStepTitle(steps.length + 1, merged);
    const lines = merged.split("\n");
    const first = lines[0] || "";
    const normalizedTitle = normalizeForCompare(title);
    const normalizedFirst = normalizeForCompare(first);
    const content = normalizedTitle && normalizedFirst === normalizedTitle
      ? (cleanText(lines.slice(1).join("\n")) || merged)
      : merged;

    steps.push({
      title,
      chunks: [content || merged],
      commands: dedupe(current.commands).slice(0, 20),
      imageUrls: dedupe(current.imageUrls).slice(0, MAX_IMAGE_URLS_PER_STEP),
    });
  };

  const extractCommandsFromBlock = (block: string, text: string): string[] => {
    const preCommands = Array.from(String(block || "").matchAll(/<\s*pre[^>]*>([\s\S]*?)<\s*\/\s*pre\s*>/gi))
      .map((m) => htmlToGuideText(String(m[1] || "")))
      .filter(Boolean);
    return dedupe([...preCommands, ...extractCommands(text)]).slice(0, 20);
  };

  const appendBlock = (block: string) => {
    const imageUrlsInBlock: string[] = [];
    if (/<img\b/i.test(block)) {
      const imageUrls = extractImageUrlsFromHtmlBlock(block);
      for (const imageUrl of imageUrls) {
        const accepted = tryAcceptImageUrl(imageUrl);
        if (accepted) imageUrlsInBlock.push(accepted);
      }
    }
    const text = htmlToGuideText(block);
    if (text) {
      const blockCommands = extractCommandsFromBlock(block, text);
      if (isStepBoundaryText(text) && (current.chunks.length > 0 || current.imageUrls.length > 0)) {
        commitCurrent();
        current = {
          title: toStepTitle(steps.length + 1, text),
          chunks: [text],
          commands: blockCommands,
          imageUrls: [],
        };
      } else {
        if (!current.title || /^step\s+\d+$/i.test(current.title)) {
          current.title = toStepTitle(steps.length + 1, text);
        }
        current.chunks.push(text);
        current.commands.push(...blockCommands);
      }
    }
    if (imageUrlsInBlock.length > 0) {
      current.imageUrls.push(...imageUrlsInBlock);
    }
  };

  const tableRows = Array.from(String(html).matchAll(/<\s*tr[^>]*>([\s\S]*?)<\s*\/\s*tr\s*>/gi)).map((m) => String(m[0] || ""));
  if (tableRows.length >= 2) {
    for (let idx = 0; idx < tableRows.length; idx += 1) {
      const rowBlock = tableRows[idx];
      const rowText = htmlToGuideText(rowBlock);
      const normalizedRow = normalizeForCompare(rowText);
      const isHeaderLike =
        idx === 0 &&
        !isStepBoundaryText(rowText) &&
        /(step|description|instruction|command|code|image)/i.test(rowText) &&
        rowText.split(/\s+/).length <= 16;
      if (isHeaderLike && !extractImageUrlsFromHtmlBlock(rowBlock).length) {
        continue;
      }
      appendBlock(rowBlock);
      if (normalizedRow && tableRows.length > 2) {
        commitCurrent();
        current = { title: `Step ${steps.length + 1}`, chunks: [], commands: [], imageUrls: [] };
      }
    }
  } else {
    const blockMatches = String(html).match(
      /<(?:h[1-6]|p|li|div|section|article|blockquote|pre|figure|figcaption|tr|td|th)[^>]*>[\s\S]*?<\/(?:h[1-6]|p|li|div|section|article|blockquote|pre|figure|figcaption|tr|td|th)>|<img[^>]*>/gi
    ) || [];
    if (!blockMatches.length) return [];
    for (const block of blockMatches) {
      appendBlock(block);
    }
  }

  commitCurrent();

  return steps.map((step, idx) => {
    const content = cleanText(step.chunks.join("\n\n")).slice(0, 8_000);
    return {
      id: `step-${idx + 1}`,
      title: step.title || `Step ${idx + 1}`,
      content,
      commands: dedupe([...step.commands, ...extractCommands(content)]).slice(0, 20),
      imageUrls: dedupe(step.imageUrls).slice(0, MAX_IMAGE_URLS_PER_STEP),
    };
  }).filter((step) => step.content.length > 0 || step.imageUrls.length > 0);
}

function chunkByHeadingsOrNumbers(text: string): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const headingChunks = cleaned
    .split(/\n(?=\s*#{1,6}\s+)/)
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (headingChunks.length >= 2) return headingChunks;

  const numberedChunks = cleaned
    .split(/\n(?=\s*(?:step\s*\d+[:.-]?|\d+[).:-])\s+)/i)
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (numberedChunks.length >= 2) return numberedChunks;

  const paragraphChunks = cleaned
    .split(/\n\s*\n+/)
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (paragraphChunks.length >= 2) return paragraphChunks.slice(0, 12);

  return [cleaned];
}

function buildSteps(rawText: string, imageUrls: string[]): StepGuideStep[] {
  const htmlSteps = buildStepsFromHtml(rawText.startsWith("<") ? rawText : "");
  if (htmlSteps.length > 0) return htmlSteps;

  const chunks = chunkByHeadingsOrNumbers(rawText).slice(0, 20);
  if (chunks.length === 0) {
    return [{
      id: "step-1",
      title: "Step 1",
      content: "No guide content was detected.",
      commands: [],
      imageUrls: [],
    }];
  }

  const safeGlobalImages = dedupe(imageUrls).filter(isSafeImageUrl).slice(0, MAX_TOTAL_IMAGE_URLS);
  const usedGlobalImages = new Set<string>();
  const baseSteps = chunks.map((chunk, idx) => {
    const content = cleanText(chunk).slice(0, 8_000);
    const title = toStepTitle(idx + 1, content);
    const contentLines = content.split("\n");
    const firstLine = String(contentLines[0] || "").trim();
    const normalizedTitle = normalizeForCompare(title);
    const normalizedFirstLine = normalizeForCompare(firstLine);
    const finalContent = normalizedFirstLine && normalizedFirstLine === normalizedTitle
      ? cleanText(contentLines.slice(1).join("\n"))
      : content;
    const stepImageUrls = extractImageUrls("", finalContent || content).slice(0, MAX_IMAGE_URLS_PER_STEP);
    for (const stepImageUrl of stepImageUrls) {
      usedGlobalImages.add(stepImageUrl);
    }
    return {
      id: `step-${idx + 1}`,
      title,
      content: finalContent || content,
      commands: extractCommands(finalContent || content),
      imageUrls: stepImageUrls,
    };
  });

  const unmatchedImages = safeGlobalImages.filter((url) => !usedGlobalImages.has(url));
  if (baseSteps.length > 0 && unmatchedImages.length > 0) {
    const firstStep = baseSteps[0];
    firstStep.imageUrls = dedupe([...firstStep.imageUrls, ...unmatchedImages]).slice(0, MAX_IMAGE_URLS_PER_STEP);
  }

  return baseSteps;
}

export const stepGuideParserTestUtils = {
  buildSteps,
  buildStepsFromHtml,
  extractCommands,
  htmlToGuideText,
};

function summarizeGuide(steps: StepGuideStep[]): string {
  if (!steps.length) return "";
  const first = steps[0];
  if (first?.title) return first.title;
  const snippet = String(first?.content || "").split("\n")[0] || "";
  return snippet.slice(0, 120);
}

async function parseGuideBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
}): Promise<{ text: string; html: string; imageUrls: string[] }> {
  const mimeType = String(params.mimeType || "").toLowerCase();
  const filename = String(params.originalFilename || "").toLowerCase();

  if (
    mimeType.includes("word") ||
    filename.endsWith(".docx") ||
    filename.endsWith(".doc")
  ) {
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ buffer: params.buffer }),
      mammoth.extractRawText({ buffer: params.buffer }),
    ]);

    const html = sanitizeHtml(String(htmlResult.value || ""));
    const structuredFromHtml = htmlToGuideText(html);
    const rawText = cleanText(String(textResult.value || ""));
    const text = structuredFromHtml || rawText || stripHtml(html);
    return {
      text: text.slice(0, MAX_GUIDE_CHARACTERS),
      html,
      imageUrls: extractImageUrls(html, text),
    };
  }

  const text = cleanText(params.buffer.toString("utf8")).slice(0, MAX_GUIDE_CHARACTERS);
  return {
    text,
    html: "",
    imageUrls: extractImageUrls("", text),
  };
}

async function parseGuideBufferWithGuards(params: {
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
}): Promise<{ text: string; html: string; imageUrls: string[] }> {
  await parseSemaphore.acquire();
  try {
    let timer: NodeJS.Timeout | null = null;
    return await Promise.race([
      parseGuideBuffer(params),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Guide parsing timed out. Please upload a smaller file.")), PARSE_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  } finally {
    parseSemaphore.release();
  }
}

function getGuideCacheFromMetadata(metadata: Record<string, any>): StoredStepGuideCache {
  const cache = metadata.lessonStepGuideV1 && typeof metadata.lessonStepGuideV1 === "object"
    ? (metadata.lessonStepGuideV1 as StoredStepGuideCache)
    : {};
  return {
    byLanguage: cache.byLanguage && typeof cache.byLanguage === "object" ? { ...cache.byLanguage } : {},
  };
}

function getGuideCache(lesson: Lesson): StoredStepGuideCache {
  const metadata = lesson.metadata && typeof lesson.metadata === "object"
    ? (lesson.metadata as Record<string, any>)
    : {};
  return getGuideCacheFromMetadata(metadata);
}

async function mutateLessonStepGuideMetadataWithRetry(
  lessonId: string,
  mutator: (cache: StoredStepGuideCache, metadata: Record<string, any>) => Record<string, any>
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [row] = await db
      .select({
        id: lessons.id,
        metadata: lessons.metadata,
        updatedAt: lessons.updatedAt,
      })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (!row) {
      throw new Error("Lesson not found while persisting step-by-step guide.");
    }

    const metadata = row.metadata && typeof row.metadata === "object"
      ? { ...(row.metadata as Record<string, any>) }
      : {};
    const cache = getGuideCacheFromMetadata(metadata);
    const nextMetadata = mutator(cache, metadata);

    const baseSet = {
      metadata: nextMetadata,
      updatedAt: new Date(),
    };

    const updateWhere = row.updatedAt
      ? and(eq(lessons.id, row.id), eq(lessons.updatedAt, row.updatedAt))
      : eq(lessons.id, row.id);

    const updatedRows = await db
      .update(lessons)
      .set(baseSet)
      .where(updateWhere)
      .returning({ id: lessons.id });

    if (updatedRows.length > 0) return;
  }

  throw new Error("Failed to persist step-by-step guide due to concurrent updates. Please retry.");
}

function buildGuidePayload(params: {
  languageCode: string;
  sourceFilename: string;
  sourceType: "upload" | "translated" | "manual";
  rawText: string;
  rawHtml?: string;
  imageUrls: string[];
}): StepByStepGuidePayload {
  const languageCode = normalizeLanguageCode(params.languageCode);
  const steps = buildSteps(params.rawHtml ? params.rawHtml : params.rawText, params.imageUrls);
  return {
    schemaVersion: "v1",
    languageCode,
    versionRef: `${languageCode}:guide:${Date.now()}`,
    generatedAt: new Date().toISOString(),
    sourceType: params.sourceType,
    sourceFilename: params.sourceFilename || undefined,
    summary: summarizeGuide(steps),
    steps,
  };
}

export function summarizeStepGuideArtifacts(
  metadata: any,
  languageCode?: string | null,
  options?: { allowFallback?: boolean }
): {
  hasStepGuide: boolean;
  activeStepGuideVersionId: string | null;
} {
  if (!metadata || typeof metadata !== "object") {
    return { hasStepGuide: false, activeStepGuideVersionId: null };
  }
  const cache = (metadata as any).lessonStepGuideV1;
  if (!cache || typeof cache !== "object") {
    return { hasStepGuide: false, activeStepGuideVersionId: null };
  }
  const byLanguage = cache.byLanguage && typeof cache.byLanguage === "object" ? cache.byLanguage : {};
  const normalizedRequested = normalizeLanguageCode(languageCode || "");
  const allowFallback = options?.allowFallback === true;

  const bucket = normalizedRequested
    ? (byLanguage[normalizedRequested] || (allowFallback ? byLanguage.en || Object.values(byLanguage)[0] : null))
    : Object.values(byLanguage)[0];

  const versions = Array.isArray((bucket as any)?.versions) ? (bucket as any).versions : [];
  const hasStepGuide = versions.length > 0;
  const activeStepGuideVersionId = String((bucket as any)?.activeVersionId || versions[0]?.id || "").trim() || null;
  return { hasStepGuide, activeStepGuideVersionId };
}

export class LessonStepGuideService {
  static async getGuide(
    lesson: Lesson,
    options?: { languageCode?: string | null; versionId?: string | null; allowFallback?: boolean }
  ): Promise<StepByStepGuidePayload | null> {
    const requestedLanguage = normalizeLanguageCode(options?.languageCode || lesson.languageCode || "en");
    const requestedVersionId = String(options?.versionId || "").trim();
    const allowFallback = options?.allowFallback !== false;
    const cache = getGuideCache(lesson);
    const byLanguage = cache.byLanguage || {};

    const allVersions = Object.values(byLanguage)
      .flatMap((bucket) => (Array.isArray(bucket?.versions) ? bucket.versions : []));

    if (requestedVersionId) {
      const explicit = allVersions.find((version) => String(version?.id || "").trim() === requestedVersionId);
      if (!explicit) {
        throw new StepGuideVersionNotFoundError();
      }
      return {
        schemaVersion: "v1",
        languageCode: explicit.languageCode,
        versionRef: explicit.versionRef,
        generatedAt: explicit.generatedAt,
        sourceType: explicit.sourceType,
        sourceFilename: explicit.sourceFilename,
        summary: explicit.summary,
        steps: Array.isArray(explicit.steps) ? explicit.steps : [],
      };
    }

    const bucket = byLanguage[requestedLanguage]
      || (allowFallback ? byLanguage.en || Object.values(byLanguage)[0] : null);
    if (!bucket) return null;

    const versions = Array.isArray(bucket.versions) ? bucket.versions : [];
    if (!versions.length) return null;

    const activeId = String(bucket.activeVersionId || "").trim();
    const selected = versions.find((version) => String(version.id || "").trim() === activeId) || versions[0];
    if (!selected) return null;

    return {
      schemaVersion: "v1",
      languageCode: selected.languageCode,
      versionRef: selected.versionRef,
      generatedAt: selected.generatedAt,
      sourceType: selected.sourceType,
      sourceFilename: selected.sourceFilename,
      summary: selected.summary,
      steps: Array.isArray(selected.steps) ? selected.steps : [],
    };
  }

  static async getGuideState(
    lesson: Lesson,
    options?: { languageCode?: string | null }
  ): Promise<{
    languageCode: string;
    activeVersionId: string | null;
    versions: Array<{
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      stepCount: number;
      sourceFilename?: string;
      sourceType: string;
    }>;
  }> {
    const requestedLanguage = normalizeLanguageCode(options?.languageCode || lesson.languageCode || "en");
    const cache = getGuideCache(lesson);
    const byLanguage = cache.byLanguage || {};
    const bucket = byLanguage[requestedLanguage] || {};
    const versions = Array.isArray((bucket as StepGuideLanguageBucket).versions)
      ? (bucket as StepGuideLanguageBucket).versions || []
      : [];
    const activeVersionId = String((bucket as StepGuideLanguageBucket).activeVersionId || versions[0]?.id || "").trim() || null;

    return {
      languageCode: requestedLanguage,
      activeVersionId,
      versions: versions.map((version) => ({
        id: version.id,
        title: version.summary || version.steps?.[0]?.title || "Step-by-Step Guide",
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        stepCount: Array.isArray(version.steps) ? version.steps.length : 0,
        sourceFilename: version.sourceFilename,
        sourceType: version.sourceType,
      })),
    };
  }

  static async uploadGuide(params: {
    lesson: Lesson;
    languageCode?: string | null;
    mimeType: string;
    originalFilename: string;
    buffer: Buffer;
    uploadedBy?: string | null;
  }): Promise<{
    payload: StepByStepGuidePayload;
    versionId: string;
    languageCode: string;
  }> {
    const lesson = params.lesson;
    const languageCode = normalizeLanguageCode(params.languageCode || lesson.languageCode || "en");
    const parsed = await parseGuideBufferWithGuards({
      buffer: params.buffer,
      mimeType: params.mimeType,
      originalFilename: params.originalFilename,
    });

    if (!parsed.text || parsed.text.trim().length < 12) {
      throw new Error("Guide content is too short. Please upload a document with practical step-by-step instructions.");
    }

    const payload = buildGuidePayload({
      languageCode,
      sourceFilename: params.originalFilename,
      sourceType: "upload",
      rawText: parsed.text,
      rawHtml: parsed.html,
      imageUrls: parsed.imageUrls,
    });

    const now = new Date().toISOString();
    const versionId = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    await mutateLessonStepGuideMetadataWithRetry(lesson.id, (cache, metadata) => {
      const byLanguage = cache.byLanguage || {};
      const bucket: StepGuideLanguageBucket = byLanguage[languageCode] && typeof byLanguage[languageCode] === "object"
        ? { ...(byLanguage[languageCode] as StepGuideLanguageBucket) }
        : {};

      const version: StoredGuideVersion = {
        ...payload,
        id: versionId,
        createdAt: now,
        updatedAt: now,
        uploadedBy: params.uploadedBy || null,
        sourceMimeType: params.mimeType || null,
      };

      const existing = Array.isArray(bucket.versions) ? bucket.versions : [];
      bucket.versions = [version, ...existing].slice(0, MAX_STORED_VERSIONS_PER_LANGUAGE);
      bucket.activeVersionId = version.id;
      byLanguage[languageCode] = bucket;

      return {
        ...metadata,
        lessonStepGuideV1: {
          byLanguage,
        },
      };
    });

    return {
      payload,
      versionId,
      languageCode,
    };
  }

  static async setActiveVersion(params: {
    lesson: Lesson;
    versionId: string;
    languageCode?: string | null;
  }): Promise<void> {
    const lesson = params.lesson;
    const requestedLanguage = normalizeLanguageCode(params.languageCode || lesson.languageCode || "en");
    const versionId = String(params.versionId || "").trim();
    if (!versionId) throw new Error("versionId is required");

    await mutateLessonStepGuideMetadataWithRetry(lesson.id, (cache, metadata) => {
      const byLanguage = cache.byLanguage || {};
      const bucket = byLanguage[requestedLanguage] && typeof byLanguage[requestedLanguage] === "object"
        ? { ...(byLanguage[requestedLanguage] as StepGuideLanguageBucket) }
        : null;

      if (!bucket) {
        throw new Error(`No step-by-step guide versions found for language ${requestedLanguage}.`);
      }

      const versions = Array.isArray(bucket.versions) ? bucket.versions : [];
      const found = versions.find((version) => String(version.id || "").trim() === versionId);
      if (!found) {
        throw new StepGuideVersionNotFoundError("Step-by-step guide version not found for this language.");
      }

      bucket.activeVersionId = versionId;
      byLanguage[requestedLanguage] = bucket;

      return {
        ...metadata,
        lessonStepGuideV1: {
          byLanguage,
        },
      };
    });
  }

  static async saveTranslatedGuide(params: {
    lesson: Lesson;
    languageCode: string;
    sourceFilename?: string;
    steps: StepGuideStep[];
    translatedFromLanguageCode?: string | null;
  }): Promise<void> {
    const languageCode = normalizeLanguageCode(params.languageCode);
    const payload: StepByStepGuidePayload = {
      schemaVersion: "v1",
      languageCode,
      versionRef: `${languageCode}:guide:${Date.now()}`,
      generatedAt: new Date().toISOString(),
      sourceType: "translated",
      sourceFilename: params.sourceFilename,
      summary: summarizeGuide(params.steps || []),
      steps: Array.isArray(params.steps) ? params.steps : [],
    };

    const now = new Date().toISOString();
    const versionId = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    await mutateLessonStepGuideMetadataWithRetry(params.lesson.id, (cache, metadata) => {
      const byLanguage = cache.byLanguage || {};
      const bucket: StepGuideLanguageBucket = byLanguage[languageCode] && typeof byLanguage[languageCode] === "object"
        ? { ...(byLanguage[languageCode] as StepGuideLanguageBucket) }
        : {};

      const version: StoredGuideVersion = {
        ...payload,
        id: versionId,
        createdAt: now,
        updatedAt: now,
        translatedFromLanguageCode: normalizeOptionalLanguageCode(params.translatedFromLanguageCode),
      };

      const existing = Array.isArray(bucket.versions) ? bucket.versions : [];
      bucket.versions = [version, ...existing].slice(0, MAX_STORED_VERSIONS_PER_LANGUAGE);
      bucket.activeVersionId = version.id;
      byLanguage[languageCode] = bucket;

      return {
        ...metadata,
        lessonStepGuideV1: {
          byLanguage,
        },
      };
    });
  }
}
