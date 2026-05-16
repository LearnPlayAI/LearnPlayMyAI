import { createHash, randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { eq, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import { lessons, courses, courseLessons, platformPricing, creditPurchasePackages, podcastProviderCostLedger, podcastSettlementLedger, type Lesson } from "@shared/schema";
import { ObjectStorageService } from "../objectStorage";
import { ElevenLabsService, type ElevenVoice } from "./elevenLabsService";
import { LessonService } from "./lessonService";
import { resolveStoragePath } from "../utils/uploadPaths";
import { buildCanonicalStorageKey, canonicalKeyToAbsolutePath, normalizeExtension } from "../utils/storageKeyManager";
import { HybridCreditService } from "./hybridCreditService";
import { IntegrationConfigService } from "./integrationConfigService";
import { DocumentExtractorService } from "./documentExtractor";
import { ExchangeRateService } from "./exchangeRateService";

type PodcastSourceType = "sourcedb" | "word" | "pptx";
type PodcastJobStatus = "idle" | "processing" | "completed" | "failed";
type PodcastFormat = "bulletin" | "conversation";
type PodcastDuration = "short" | "default" | "long";

function normalizePodcastLanguageCode(input: string | null | undefined): string {
  const normalized = String(input || "en").trim().toLowerCase();
  return normalized || "en";
}

function isCompletedPodcastStatus(input: string | null | undefined): boolean {
  return String(input || "").trim().toLowerCase() === "completed";
}

export interface LessonPodcastDraft {
  id?: string;
  createdAt?: string;
  sourceType: PodcastSourceType;
  sourceMaterialId?: string;
  currentStep?: number;
  format?: PodcastFormat;
  duration?: PodcastDuration;
  focusTopic?: string;
  voiceId?: string;
  guestVoiceId?: string;
  voiceName?: string;
  guestVoiceName?: string;
  hostDisplayName?: string;
  guestDisplayName?: string;
  title?: string;
  notes?: string;
  scriptId?: string;
  scriptText?: string;
  textHash?: string;
  estimatedLpcCost: number;
  estimatedCharacters: number;
  updatedAt: string;
  status?: PodcastJobStatus;
}

export interface LessonPodcastScriptRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: PodcastSourceType;
  sourceMaterialId?: string;
  format: PodcastFormat;
  duration: PodcastDuration;
  focusTopic?: string;
  voiceId: string;
  guestVoiceId?: string;
  hostDisplayName?: string;
  guestDisplayName?: string;
  estimatedCharacters: number;
  estimatedLpcCost: number;
  sourceScriptId?: string;
  languageCode?: string;
  text: string;
  textHash?: string;
  scriptSegments?: Array<{
    speaker: "host" | "guest" | "narrator";
    text: string;
    voiceId?: string;
  }>;
  aiRawResponse?: any;
  aiRequestPayload?: {
    model: string;
    mode: PodcastFormat;
    sourceType: PodcastSourceType;
    sourceMaterialId?: string;
    hostVoiceId: string;
    guestVoiceId?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    languageCode: string;
    focusTopic?: string;
    duration: PodcastDuration;
  };
}

export interface LessonPodcastVersion {
  id: string;
  storageKey?: string;
  localFilePath?: string;
  createdAt: string;
  updatedAt: string;
  status: "completed" | "failed";
  sourceType: PodcastSourceType;
  format?: PodcastFormat;
  duration?: PodcastDuration;
  focusTopic?: string;
  scriptId?: string;
  voiceId: string;
  guestVoiceId?: string;
  voiceName?: string;
  guestVoiceName?: string;
  hostDisplayName?: string;
  guestDisplayName?: string;
  title?: string;
  languageCode: string;
  estimatedLpcCost: number;
  estimatedCharacters: number;
  providerUsageUnit?: "character";
  providerUsageAmount?: number;
  providerCostUsd?: number;
  providerCostLocal?: number;
  providerCostCurrency?: string;
  fxRateUsdToLocal?: number;
  effectiveProviderUsdPer1kChars?: number;
  providerUnitSource?: "direct_rate" | "topup_rate" | "subscription_blended" | "subscription_plus_topup_blended";
  effectiveLocalCurrencyPerLpc?: number;
  effectiveLocalCurrencyPerLpcSource?: "manual" | "package_floor";
  noLossFloorLpc?: number;
  pricingConfigVersion?: string;
  estimateToFinalLpcDelta?: number;
  actualLpcCost?: number;
  actualElevenCharactersUsed?: number;
  creditSource?: "user" | "organization" | "split";
  userAmountDeducted?: number;
  orgAmountDeducted?: number;
  actualCharacters?: number;
  bytes?: number;
  estimatedDurationSec?: number;
  hlsPackagingStatus?: "pending" | "ready" | "failed";
  hlsManifestKey?: string;
  hlsSegmentDirKey?: string;
  hlsErrorMessage?: string;
  errorMessage?: string;
}

export interface LessonPodcastAuditArtifact {
  id: string;
  createdAt: string;
  lessonId: string;
  organizationId: string;
  languageCode: string;
  versionId?: string;
  scriptId?: string;
  stage: "script_generation" | "audio_chunk" | "audio_generation" | "audio_generation_failed";
  artifactType: "audio/mp3" | "application/json" | "text/plain";
  label: string;
  relativePath: string;
  bytes: number;
}

interface LessonPodcastMetadata {
  draft?: LessonPodcastDraft;
  drafts?: LessonPodcastDraft[];
  scripts?: LessonPodcastScriptRecord[];
  sourceMaterials?: LessonPodcastSourceMaterial[];
  auditArtifacts?: LessonPodcastAuditArtifact[];
  currentJob?: {
    status: PodcastJobStatus;
    startedAt?: string;
    updatedAt: string;
    errorMessage?: string;
    requestedBy?: string;
    versionId?: string;
    jobPayload?: PendingPodcastJobPayload;
  };
  activeVersionId?: string | null;
  activeVersionIdsByLanguage?: Record<string, string | null>;
  versions: LessonPodcastVersion[];
}

interface PendingPodcastJobPayload {
  lessonId: string;
  organizationId: string;
  languageCode: string;
  sourceType: PodcastSourceType;
  format?: PodcastFormat;
  duration?: PodcastDuration;
  focusTopic?: string;
  scriptId?: string;
  scriptText?: string;
  voiceId: string;
  guestVoiceId?: string;
  voiceName?: string;
  guestVoiceName?: string;
  hostDisplayName?: string;
  guestDisplayName?: string;
  title?: string;
  versionId: string;
  requestedBy?: string;
}

export interface LessonPodcastSourceMaterial {
  id: string;
  sourceType: "word";
  version: number;
  originalFilename: string;
  mimeType: string;
  storageKey: string;
  localFilePath: string;
  extractedText: string;
  wordCount: number;
  createdAt: string;
  createdBy?: string;
}

export interface PodcastHlsBackfillReport {
  scannedLessons: number;
  matchedLessons: number;
  completedVersions: number;
  alreadyReady: number;
  repackaged: number;
  failed: number;
  skippedNoStorage: number;
  errors: Array<{ lessonId: string; versionId: string; message: string }>;
}

const PODCAST_METADATA_KEY = "podcast";
const WORST_CASE_LPC_PER_CHARACTER = 1;
const MAX_GENERATION_CHARACTERS = 35000;

interface PodcastPricingConfig {
  estimateLpcPerCharacter: number;
  conversationMultiplier: number;
  minLpc: number;
  maxLpc: number;
  elevenUsdPer1kChars: number;
  elevenSubscriptionUsdMonthly: number;
  elevenSubscriptionIncludedChars: number;
  elevenTopupUsdPer1kChars: number;
  elevenExpectedMonthlyChars: number;
  usePackageFloorLpcValue: boolean;
  enforceNoLossFloor: boolean;
  usdToLocalFxRate: number;
  targetMarginPercent: number;
  localCurrencyPerLpc: number;
  settlementGuardrailPct: number;
  localCurrency: string;
  configVersion: string;
}

const DEFAULT_PODCAST_PRICING: PodcastPricingConfig = {
  estimateLpcPerCharacter: 0.06,
  conversationMultiplier: 1.15,
  minLpc: 40,
  maxLpc: 0,
  elevenUsdPer1kChars: 0.3,
  elevenSubscriptionUsdMonthly: 0,
  elevenSubscriptionIncludedChars: 0,
  elevenTopupUsdPer1kChars: 0.3,
  elevenExpectedMonthlyChars: 0,
  usePackageFloorLpcValue: true,
  enforceNoLossFloor: true,
  usdToLocalFxRate: 18.5,
  targetMarginPercent: 35,
  localCurrencyPerLpc: 1,
  settlementGuardrailPct: 20,
  localCurrency: "ZAR",
  configVersion: "default-v1",
};

function safeNow(): string {
  return new Date().toISOString();
}

function estimateDurationSecFromCharacters(characters: number): number {
  // Approximate spoken characters per second around 15
  return Math.max(10, Math.round(characters / 15));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeHlsFilename(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-");
}

function runFfmpegHlsPackaging(inputFile: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";
    const runOnce = (args: string[]) =>
      new Promise<void>((resolveOnce, rejectOnce) => {
        const ffmpeg = spawn(ffmpegBinary, args, { cwd: outputDir });
        let stderr = "";
        ffmpeg.stderr.on("data", (chunk) => {
          stderr += String(chunk || "");
        });
        ffmpeg.on("error", (error) => rejectOnce(error));
        ffmpeg.on("close", (code) => {
          if (code === 0) return resolveOnce();
          rejectOnce(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        });
      });

    const fmp4Args = [
      "-y",
      "-i", inputFile,
      "-vn",
      "-c:a", "aac",
      "-b:a", "128k",
      "-f", "hls",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_type", "fmp4",
      "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", "seg_%05d.m4s",
      "index.m3u8",
    ];
    const tsFallbackArgs = [
      "-y",
      "-i", inputFile,
      "-vn",
      "-c:a", "aac",
      "-b:a", "128k",
      "-f", "hls",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_filename", "seg_%05d.ts",
      "index.m3u8",
    ];

    runOnce(fmp4Args)
      .then(() => resolve())
      .catch((fmp4Error: any) => {
        console.warn(`[LessonPodcastService] fMP4 HLS packaging failed, retrying TS segments: ${String(fmp4Error?.message || fmp4Error)}`);
        runOnce(tsFallbackArgs)
          .then(() => resolve())
          .catch((tsError) => reject(tsError));
      });
  });
}

function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function estimateLpcFromCharacters(characters: number, pricing?: Partial<PodcastPricingConfig>, mode: PodcastFormat = "bulletin"): number {
  const cfg = { ...DEFAULT_PODCAST_PRICING, ...(pricing || {}) };
  const safeCharacters = Math.max(0, Number(characters) || 0);
  const multiplier = mode === "conversation" ? Math.max(1, cfg.conversationMultiplier || 1) : 1;
  const raw = safeCharacters * Math.max(0.000001, cfg.estimateLpcPerCharacter || WORST_CASE_LPC_PER_CHARACTER) * multiplier;
  return Math.ceil(Math.max(Math.max(0, cfg.minLpc || 0), raw));
}

function parseMetadata(rawMetadata: any): LessonPodcastMetadata {
  const base = rawMetadata && typeof rawMetadata === "object" ? rawMetadata : {};
  const podcast = base[PODCAST_METADATA_KEY] && typeof base[PODCAST_METADATA_KEY] === "object"
    ? base[PODCAST_METADATA_KEY]
    : {};

  const versions = Array.isArray(podcast.versions) ? podcast.versions : [];
  const scripts = Array.isArray(podcast.scripts) ? podcast.scripts : [];
  const sourceMaterials = Array.isArray(podcast.sourceMaterials) ? podcast.sourceMaterials : [];
  const auditArtifacts = Array.isArray(podcast.auditArtifacts) ? podcast.auditArtifacts : [];
  const drafts = Array.isArray(podcast.drafts) ? podcast.drafts : [];
  const activeVersionIdsByLanguage = podcast.activeVersionIdsByLanguage && typeof podcast.activeVersionIdsByLanguage === "object"
    ? podcast.activeVersionIdsByLanguage
    : {};
  return {
    draft: podcast.draft && typeof podcast.draft === "object" ? podcast.draft : undefined,
    drafts,
    currentJob: podcast.currentJob && typeof podcast.currentJob === "object" ? podcast.currentJob : undefined,
    activeVersionId: typeof podcast.activeVersionId === "string" || podcast.activeVersionId === null
      ? podcast.activeVersionId
      : null,
    activeVersionIdsByLanguage,
    scripts,
    sourceMaterials,
    auditArtifacts,
    versions,
  };
}

function withPodcastMetadata(lessonMetadata: any, podcastMeta: LessonPodcastMetadata) {
  const base = lessonMetadata && typeof lessonMetadata === "object" ? { ...lessonMetadata } : {};
  base[PODCAST_METADATA_KEY] = podcastMeta;
  return base;
}

function normalizeTextInput(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function normalizeScriptTextInput(input: string): string {
  return String(input || "").replace(/\r\n/g, "\n").trim();
}

function sanitizeFilenameSegment(input: string, fallback: string): string {
  const ascii = String(input || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "");
  const cleaned = ascii
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return cleaned || fallback;
}

function clampPodcastTextLength(input: string): string {
  const normalized = normalizeScriptTextInput(input);
  if (normalized.length <= MAX_GENERATION_CHARACTERS) return normalized;
  return normalized.slice(0, MAX_GENERATION_CHARACTERS);
}

function hashPodcastScriptText(scriptText: string): string {
  return createHash("sha256").update(String(scriptText || "").replace(/\r\n/g, "\n")).digest("hex");
}

function sortDraftsByUpdatedAtDesc(drafts: LessonPodcastDraft[]): LessonPodcastDraft[] {
  return drafts
    .slice()
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

function getUploadsDir(): string {
  return path.join(process.cwd(), "uploads");
}

function toUploadsRelativePath(absolutePath: string): string {
  const uploadsDir = getUploadsDir();
  const relative = path.relative(uploadsDir, absolutePath);
  if (!relative || relative.startsWith("..")) {
    throw new Error("Audit artifact path must be inside uploads directory.");
  }
  return relative.split(path.sep).join("/");
}

function resolveUploadsPath(relativePath: string): string {
  const uploadsDir = getUploadsDir();
  const normalizedRelative = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const absolutePath = path.resolve(uploadsDir, normalizedRelative);
  if (!absolutePath.startsWith(path.resolve(uploadsDir) + path.sep) && absolutePath !== path.resolve(uploadsDir)) {
    throw new Error("Resolved artifact path is outside uploads directory.");
  }
  return absolutePath;
}

function splitTextForTts(input: string, maxChunkChars = 2200): string[] {
  const text = normalizeTextInput(input);
  if (!text) return [];
  if (text.length <= maxChunkChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > maxChunkChars) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, maxChunkChars)];
}

async function mergeAudioChunks(chunks: Buffer[]): Promise<Buffer> {
  if (chunks.length <= 1) return chunks[0] || Buffer.alloc(0);
  const ffmpegBinary = process.env.FFMPEG_PATH || "ffmpeg";
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lp-podcast-merge-"));
  const concatListPath = path.join(tmpRoot, "concat.txt");
  const outputPath = path.join(tmpRoot, "output.mp3");
  try {
    const listLines: string[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkPath = path.join(tmpRoot, `chunk-${String(i).padStart(4, "0")}.mp3`);
      await fs.promises.writeFile(chunkPath, chunks[i]);
      listLines.push(`file '${chunkPath.replace(/'/g, "'\\''")}'`);
    }
    await fs.promises.writeFile(concatListPath, listLines.join("\n"), "utf8");

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c", "copy",
        outputPath,
      ];
      const child = spawn(ffmpegBinary, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d) => {
        stderr += String(d || "");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      });
    });

    return await fs.promises.readFile(outputPath);
  } catch (error: any) {
    const requireFfmpeg = String(process.env.REQUIRE_FFMPEG_FOR_PODCAST || "false").toLowerCase() === "true";
    if (requireFfmpeg) {
      throw new Error(`ffmpeg audio merge failed: ${error?.message || "unknown error"}`);
    }
    return Buffer.concat(chunks);
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function resolveWordSourceMaterial(
  lesson: Lesson,
  sourceMaterialId?: string
): LessonPodcastSourceMaterial | null {
  const meta = parseMetadata(lesson.metadata);
  const sourceMaterials = Array.isArray(meta.sourceMaterials) ? meta.sourceMaterials : [];
  const words = sourceMaterials
    .filter((material) => material.sourceType === "word" && !!String(material.extractedText || "").trim());
  if (!words.length) return null;
  if (sourceMaterialId) {
    const exact = words.find((material) => material.id === sourceMaterialId);
    if (!exact) {
      throw new Error("Selected Word source version not found.");
    }
    return exact;
  }
  return words.sort((a, b) => {
    if (a.version !== b.version) return b.version - a.version;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  })[0] || null;
}

function normalizeSpeakerLine(
  line: string
): { speaker: "host" | "guest" | "narrator"; text: string } | null {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\*\*(HOST|GUEST|NARRATOR)\*\*\s*[:\-–—]\s*/i, "$1: ")
    .trim();
  const match = cleaned.match(/^(HOST|GUEST|NARRATOR)\s*[:\-–—]\s*(.+)$/i);
  if (!match) return null;
  const label = match[1].toLowerCase();
  const text = String(match[2] || "").trim();
  if (!text) return null;
  if (label === "host") return { speaker: "host", text };
  if (label === "guest") return { speaker: "guest", text };
  return { speaker: "narrator", text };
}

function splitLabeledConversationLines(input: string): string[] {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\*\*(HOST|GUEST|NARRATOR)\*\*\s*[:\-–—]?\s*/gim, "$1: ")
    // Handle inline "HOST: ... GUEST: ..." by forcing each label to line-start.
    .replace(/\s+(HOST|GUEST|NARRATOR)\s*[:\-–—]\s*/gim, "\n$1: ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function enforceConversationAlternation(
  segments: Array<{ speaker: "host" | "guest"; text: string }>
): Array<{ speaker: "host" | "guest"; text: string }> {
  if (!segments.length) return segments;
  const normalized: Array<{ speaker: "host" | "guest"; text: string }> = [];
  let expected: "host" | "guest" = "host";
  for (const segment of segments) {
    const text = String(segment.text || "").trim();
    if (!text) continue;
    normalized.push({ speaker: expected, text });
    expected = expected === "host" ? "guest" : "host";
  }
  if (!normalized.length) return normalized;
  // Requirement: start with host and end with host while alternating turns.
  if (normalized[normalized.length - 1].speaker !== "host") {
    normalized.push({
      speaker: "host",
      text: `Thanks everyone for listening. We'll continue this discussion in the next lesson.`,
    });
  }
  return normalized;
}

function normalizeConversationScriptText(scriptText: string): {
  text: string;
  hostCount: number;
  guestCount: number;
} {
  const rawLines = splitLabeledConversationLines(scriptText);
  const parsedSegments: Array<{ speaker: "host" | "guest"; text: string }> = [];
  for (const line of rawLines) {
    const parsed = normalizeSpeakerLine(line);
    if (!parsed) continue;
    if (parsed.speaker === "host" || parsed.speaker === "guest") {
      parsedSegments.push({ speaker: parsed.speaker, text: parsed.text });
    }
  }
  const alternated = enforceConversationAlternation(parsedSegments);
  let hostCount = 0;
  let guestCount = 0;
  const normalizedLines = alternated.map((segment) => {
    if (segment.speaker === "host") hostCount += 1;
    if (segment.speaker === "guest") guestCount += 1;
    return `${segment.speaker === "host" ? "HOST" : "GUEST"}: ${segment.text}`;
  });

  return {
    text: normalizedLines.join("\n"),
    hostCount,
    guestCount,
  };
}

function parseConversationTurns(scriptText: string, hostVoiceId: string, guestVoiceId: string): Array<{ voiceId: string; text: string }> {
  const normalized = normalizeConversationScriptText(scriptText);
  const lines = normalized.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const turns: Array<{ voiceId: string; text: string }> = [];
  let fallbackHost = true;

  for (const line of lines) {
    const parsed = normalizeSpeakerLine(line);
    if (parsed?.speaker === "host") {
      turns.push({ voiceId: hostVoiceId, text: parsed.text });
      continue;
    }
    if (parsed?.speaker === "guest") {
      turns.push({ voiceId: guestVoiceId, text: parsed.text });
      continue;
    }
    turns.push({ voiceId: fallbackHost ? hostVoiceId : guestVoiceId, text: line });
    fallbackHost = !fallbackHost;
  }

  return turns.filter((turn) => turn.text.length > 0);
}

async function buildScriptFromSource(
  lesson: Lesson,
  sourceType: PodcastSourceType,
  sourceMaterialId?: string
): Promise<string> {
  if (sourceType === "pptx") {
    if (!lesson.storageKey) {
      return "";
    }
    const transcriptResult = await LessonService.getOrExtractTranscript(lesson.id, lesson.organizationId);
    const transcript = transcriptResult?.transcript;
    const slides = Array.isArray((transcript as any)?.slides) ? (transcript as any).slides : [];
    const slideText = slides
      .map((slide: any, idx: number) => {
        const text = String(slide?.text || slide?.content || "").trim();
        if (!text) return "";
        return `Slide ${idx + 1}: ${text}`;
      })
      .filter(Boolean)
      .join("\n\n");
    return clampPodcastTextLength(slideText);
  }

  if (sourceType === "word") {
    const selectedWordMaterial = resolveWordSourceMaterial(lesson, sourceMaterialId);
    if (selectedWordMaterial?.extractedText) {
      return clampPodcastTextLength(String(selectedWordMaterial.extractedText || ""));
    }
  }

  const source = clampPodcastTextLength(String(lesson.inputText || ""));
  return source;
}

function parseScriptSegments(
  scriptText: string,
  mode: PodcastFormat,
  hostVoiceId: string,
  guestVoiceId?: string
): Array<{ speaker: "host" | "guest" | "narrator"; text: string; voiceId?: string }> {
  const lines = String(scriptText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  if (mode === "conversation") {
    const parseConversationOnly = (conversationLines: string[]) => {
      const parsedSegments: Array<{ speaker: "host" | "guest" | "narrator"; text: string; voiceId?: string }> = [];
      for (const line of conversationLines) {
        const parsed = normalizeSpeakerLine(line);
        if (parsed?.speaker === "host") {
          parsedSegments.push({ speaker: "host", text: parsed.text, voiceId: hostVoiceId });
        } else if (parsed?.speaker === "guest") {
          parsedSegments.push({ speaker: "guest", text: parsed.text, voiceId: guestVoiceId });
        }
      }
      return parsedSegments;
    };

    let segments = parseConversationOnly(lines);
    const hostCount = segments.filter((segment) => segment.speaker === "host").length;
    const guestCount = segments.filter((segment) => segment.speaker === "guest").length;
    if (hostCount === 0 || guestCount === 0) {
      const forced = forceConversationDialogue(lines.join("\n"));
      if (forced) {
        segments = parseConversationOnly(
          forced
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        );
      }
    }
    return segments;
  }
  return lines.map((line) => ({
    speaker: "narrator" as const,
    text: line
      .replace(/^HOST\s*[:\-–—]\s*/i, "")
      .replace(/^GUEST\s*[:\-–—]\s*/i, "")
      .replace(/^NARRATOR\s*[:\-–—]\s*/i, ""),
    voiceId: hostVoiceId,
  })).filter((s) => s.text.length > 0);
}

function getDurationDirective(duration: PodcastDuration): string {
  if (duration === "short") return "Aim for a short script (~1-2 minutes).";
  if (duration === "long") return "Aim for a long script (~6-8 minutes).";
  return "Aim for a default script length (~3-5 minutes).";
}

function forceConversationDialogue(scriptText: string): string {
  const flattened = String(scriptText || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*[-*]\s+/, "")
        .replace(/^\*\*(HOST|GUEST|NARRATOR)\*\*\s*[:\-–—]\s*/i, "")
        .replace(/^(HOST|GUEST|NARRATOR)\s*[:\-–—]\s*/i, "")
        .trim()
    )
    .filter(Boolean)
    .join(" ");

  const sentenceChunks = flattened
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = (sentenceChunks.length ? sentenceChunks : [flattened])
    .flatMap((chunk) => chunk.split(/\s{2,}|;\s+/).map((part) => part.trim()).filter(Boolean))
    .filter(Boolean);

  if (!chunks.length) return "";

  const lines: string[] = [];
  let expected: "HOST" | "GUEST" = "HOST";
  for (let i = 0; i < chunks.length; i++) {
    lines.push(`${expected}: ${chunks[i]}`);
    expected = expected === "HOST" ? "GUEST" : "HOST";
  }
  if (lines.length === 1) lines.push(`GUEST: ${chunks[0]}`);
  if (lines.length % 2 === 0) {
    lines.push("HOST: Thanks everyone for listening. We'll continue in the next lesson.");
  }

  return lines.join("\n");
}

async function buildPodcastScriptWithGemini(params: {
  sourceText: string;
  sourceType: PodcastSourceType;
  lessonTitle?: string;
  lessonDescription?: string;
  format: PodcastFormat;
  duration: PodcastDuration;
  focusTopic?: string;
  languageCode: string;
  hostVoiceName?: string;
  guestVoiceName?: string;
  hostDisplayName?: string;
  guestDisplayName?: string;
}): Promise<{ scriptText: string; raw: any; model: string }> {
  const apiKey = await IntegrationConfigService.getSecret("gemini", "apiKey");
  if (!apiKey) {
    throw new Error("Gemini API key is not configured in Integration Settings.");
  }
  const model =
    (await IntegrationConfigService.getSetting<string>("gemini", "thinkingScriptModel")) ||
    (await IntegrationConfigService.getSetting<string>("gemini", "defaultTextModel")) ||
    "gemini-2.5-pro";
  const formatInstruction =
    params.format === "conversation"
      ? [
          "Return only script lines prefixed with HOST: or GUEST:.",
          "Alternate naturally between HOST and GUEST.",
          "Do not include markdown, headings, bullets, or notes.",
          "Every spoken line must start with either HOST: or GUEST:.",
          "Include at least 10 total lines and ensure both HOST and GUEST speak multiple times.",
          "Make the exchange interpersonal: HOST asks, GUEST responds, and they react to each other.",
          "Start with a friendly greeting between HOST and GUEST.",
          "Include clarifying follow-up questions and short acknowledgements to feel conversational.",
        ].join(" ")
      : [
          "Return only spoken narration lines (no speaker labels).",
          "Do not include markdown, headings, bullets, or notes.",
          "Use concise broadcast/bulletin delivery style.",
        ].join(" ");

  const prompt = [
    `You are creating a lesson podcast script in language '${params.languageCode || "en"}'.`,
    "Treat this as an educational podcast adaptation task grounded strictly in source content.",
    `Lesson Title: ${params.lessonTitle || "Untitled Lesson"}`,
    `Lesson Description: ${params.lessonDescription || "N/A"}`,
    `Selected Source Type: ${params.sourceType}`,
    params.format === "conversation"
      ? `Host persona name: ${params.hostDisplayName || params.hostVoiceName || "HOST"}; Guest persona name: ${params.guestDisplayName || params.guestVoiceName || "GUEST"}.`
      : "",
    getDurationDirective(params.duration),
    params.focusTopic ? `Focus strongly on this topic: ${params.focusTopic}.` : "",
    params.format === "conversation"
      ? "Write a natural two-person conversation where HOST introduces ideas, GUEST reacts and adds insight, and both alternate organically."
      : "Write a clear narrator-led bulletin with concise transitions and practical takeaways.",
    formatInstruction,
    "Use only the provided source content. Do not invent facts.",
    "Source content begins:",
    params.sourceText,
    "Source content ends.",
  ].filter(Boolean).join("\n\n");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.4,
    },
  });

  let text = String(response.text || "").trim();
  if (!text) throw new Error("Gemini returned an empty podcast script.");

    if (params.format === "conversation") {
      let normalized = normalizeConversationScriptText(text);
      if (normalized.hostCount === 0 || normalized.guestCount === 0) {
      const repairPrompt = [
        "Rewrite this script into strict two-speaker dialogue format.",
        "Output only lines starting with HOST: or GUEST:.",
        "No bullets, no markdown, no narrator labels, no notes.",
        "Both speakers must appear multiple times.",
        "Script to rewrite:",
        text,
      ].join("\n\n");
      const repaired = await ai.models.generateContent({
        model,
        contents: repairPrompt,
        config: {
          temperature: 0.2,
        },
      });
      text = String(repaired.text || "").trim() || text;
      normalized = normalizeConversationScriptText(text);
      if (normalized.hostCount === 0 || normalized.guestCount === 0) {
        const forced = forceConversationDialogue(text);
        normalized = normalizeConversationScriptText(forced);
        if (normalized.hostCount === 0 || normalized.guestCount === 0) {
          throw new Error("Thinking AI did not return valid HOST/GUEST conversation output.");
        }
      }
    }
    text = normalized.text;
  } else {
    // Bulletin mode: strip accidental speaker labels and keep narrator-only output.
    text = String(text)
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^HOST\s*[:\-–—]\s*/i, "")
          .replace(/^GUEST\s*[:\-–—]\s*/i, "")
          .replace(/^NARRATOR\s*[:\-–—]\s*/i, "")
          .trim()
      )
      .filter(Boolean)
      .join("\n");
  }

  return {
    scriptText: text,
    raw: response,
    model,
  };
}

function isScriptRecordCompatible(params: {
  script?: LessonPodcastScriptRecord;
  sourceType: PodcastSourceType;
  sourceMaterialId?: string;
  format: PodcastFormat;
  duration: PodcastDuration;
  focusTopic?: string;
  voiceId: string;
  guestVoiceId?: string;
}): boolean {
  const s = params.script;
  if (!s) return false;
  const sameFocus = normalizeTextInput(s.focusTopic || "") === normalizeTextInput(params.focusTopic || "");
  return (
    s.sourceType === params.sourceType &&
    normalizeTextInput(s.sourceMaterialId || "") === normalizeTextInput(params.sourceMaterialId || "") &&
    s.format === params.format &&
    s.duration === params.duration &&
    normalizeTextInput(s.voiceId || "") === normalizeTextInput(params.voiceId || "") &&
    normalizeTextInput(s.guestVoiceId || "") === normalizeTextInput(params.guestVoiceId || "") &&
    sameFocus
  );
}

export class LessonPodcastService {
  private static processingJobs = new Set<string>();
  private static ensurePodcastSettlementTablesPromise: Promise<void> | null = null;

  private static jobKey(payload: PendingPodcastJobPayload): string {
    return `${payload.lessonId}:${payload.versionId}`;
  }

  private static enqueueProcessingJob(payload: PendingPodcastJobPayload): void {
    const key = this.jobKey(payload);
    if (this.processingJobs.has(key)) return;
    this.processingJobs.add(key);
    setImmediate(async () => {
      try {
        await this.processGeneration(payload);
      } finally {
        this.processingJobs.delete(key);
      }
    });
  }

  private static async ensurePodcastSettlementTables(): Promise<void> {
    if (!this.ensurePodcastSettlementTablesPromise) {
      this.ensurePodcastSettlementTablesPromise = (async () => {
        const providerResult: any = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM information_schema.tables
          WHERE table_schema='public'
            AND table_name='podcastProviderCostLedger'
        `);
        const settlementResult: any = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM information_schema.tables
          WHERE table_schema='public'
            AND table_name='podcastSettlementLedger'
        `);

        const providerCount = Number(
          providerResult?.rows?.[0]?.count
          ?? providerResult?.[0]?.count
          ?? 0
        );
        const settlementCount = Number(
          settlementResult?.rows?.[0]?.count
          ?? settlementResult?.[0]?.count
          ?? 0
        );
        if (providerCount < 1 || settlementCount < 1) {
          throw new Error(
            "Podcast settlement ledger tables are missing. Apply database migrations (requires 0071_podcast_ledger_tables.sql)."
          );
        }
      })().catch((error) => {
        this.ensurePodcastSettlementTablesPromise = null;
        throw error;
      });
    }
    await this.ensurePodcastSettlementTablesPromise;
  }

  static async getLesson(lessonId: string): Promise<Lesson | null> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    return lesson || null;
  }

  static getMetadata(lesson: Lesson): LessonPodcastMetadata {
    return parseMetadata(lesson.metadata);
  }

  static async saveMetadata(lesson: Lesson, podcastMeta: LessonPodcastMetadata): Promise<void> {
    const metadata = withPodcastMetadata(lesson.metadata, podcastMeta);
    await db
      .update(lessons)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(lessons.id, lesson.id));
  }

  static async getPodcastPricingConfig(): Promise<PodcastPricingConfig> {
    const [pricing] = await db
      .select()
      .from(platformPricing)
      .orderBy(sql`${platformPricing.updatedAt} DESC NULLS LAST`, sql`${platformPricing.createdAt} DESC NULLS LAST`)
      .limit(1);

    if (!pricing) return DEFAULT_PODCAST_PRICING;

    const parseNumeric = (value: unknown, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const minLpc = Math.max(0, Math.round(parseNumeric(pricing.podcastMinLpc, DEFAULT_PODCAST_PRICING.minLpc)));
    const maxLpc = 0; // Explicitly uncapped: podcast generation has no maximum LPC cap.
    const localCurrency = String(pricing.currency || DEFAULT_PODCAST_PRICING.localCurrency || "ZAR").toUpperCase();

    return {
      estimateLpcPerCharacter: clampNumber(parseNumeric(pricing.podcastEstimateLpcPerCharacter, DEFAULT_PODCAST_PRICING.estimateLpcPerCharacter), 0.000001, 1000),
      conversationMultiplier: clampNumber(parseNumeric(pricing.podcastConversationMultiplier, DEFAULT_PODCAST_PRICING.conversationMultiplier), 1, 100),
      minLpc,
      maxLpc,
      elevenUsdPer1kChars: clampNumber(parseNumeric(pricing.podcastElevenUsdPer1kChars, DEFAULT_PODCAST_PRICING.elevenUsdPer1kChars), 0.000001, 10000),
      elevenSubscriptionUsdMonthly: clampNumber(parseNumeric((pricing as any).podcastElevenSubscriptionUsdMonthly, DEFAULT_PODCAST_PRICING.elevenSubscriptionUsdMonthly), 0, 100000000),
      elevenSubscriptionIncludedChars: Math.max(0, Math.round(parseNumeric((pricing as any).podcastElevenSubscriptionIncludedChars, DEFAULT_PODCAST_PRICING.elevenSubscriptionIncludedChars))),
      elevenTopupUsdPer1kChars: clampNumber(parseNumeric((pricing as any).podcastElevenTopupUsdPer1kChars, DEFAULT_PODCAST_PRICING.elevenTopupUsdPer1kChars), 0.000001, 10000),
      elevenExpectedMonthlyChars: Math.max(0, Math.round(parseNumeric((pricing as any).podcastElevenExpectedMonthlyChars, DEFAULT_PODCAST_PRICING.elevenExpectedMonthlyChars))),
      usePackageFloorLpcValue: parseBooleanFlag((pricing as any).podcastUsePackageFloorLpcValue, DEFAULT_PODCAST_PRICING.usePackageFloorLpcValue),
      enforceNoLossFloor: parseBooleanFlag((pricing as any).podcastEnforceNoLossFloor, DEFAULT_PODCAST_PRICING.enforceNoLossFloor),
      usdToLocalFxRate: clampNumber(parseNumeric(pricing.podcastUsdToLocalFxRate, DEFAULT_PODCAST_PRICING.usdToLocalFxRate), 0.000001, 100000),
      targetMarginPercent: clampNumber(parseNumeric(pricing.podcastTargetMarginPercent, DEFAULT_PODCAST_PRICING.targetMarginPercent), 0, 99.99),
      localCurrencyPerLpc: clampNumber(parseNumeric(pricing.podcastLocalCurrencyPerLpc, DEFAULT_PODCAST_PRICING.localCurrencyPerLpc), 0.000001, 100000),
      settlementGuardrailPct: clampNumber(parseNumeric(pricing.podcastSettlementGuardrailPct, DEFAULT_PODCAST_PRICING.settlementGuardrailPct), 0, 1000),
      localCurrency,
      configVersion: `${String(pricing.id || "pricing")}:${String(pricing.updatedAt || pricing.createdAt || safeNow())}`,
    };
  }

  static async getCourseTitleForLesson(lessonId: string): Promise<string | null> {
    const [row] = await db
      .select({ courseTitle: courses.title })
      .from(courseLessons)
      .innerJoin(courses, eq(courseLessons.courseId, courses.id))
      .where(eq(courseLessons.lessonId, lessonId))
      .limit(1);
    return row?.courseTitle ? String(row.courseTitle) : null;
  }

  static async buildPodcastAudioFilename(lesson: Lesson): Promise<string> {
    const language = sanitizeFilenameSegment(lesson.languageCode || "en", "en").slice(0, 8);
    const lessonToken = sanitizeFilenameSegment(String(lesson.id || "lesson").slice(0, 8), "lesson");
    return `pod-${lessonToken}-${language}.mp3`;
  }

  static resolveEffectiveProviderUsdPer1kChars(pricing: PodcastPricingConfig): {
    providerUsdPer1kChars: number;
    providerUnitSource: "direct_rate" | "topup_rate" | "subscription_blended" | "subscription_plus_topup_blended";
  } {
    const directUsdPer1k = clampNumber(Number(pricing.elevenUsdPer1kChars || DEFAULT_PODCAST_PRICING.elevenUsdPer1kChars), 0.000001, 10000);
    const topupUsdPer1k = clampNumber(Number(pricing.elevenTopupUsdPer1kChars || directUsdPer1k), 0.000001, 10000);
    const subscriptionUsdMonthly = Math.max(0, Number(pricing.elevenSubscriptionUsdMonthly || 0));
    const includedChars = Math.max(0, Math.round(Number(pricing.elevenSubscriptionIncludedChars || 0)));
    const expectedChars = Math.max(0, Math.round(Number(pricing.elevenExpectedMonthlyChars || 0)));

    if (subscriptionUsdMonthly <= 0 || expectedChars <= 0 || includedChars <= 0) {
      if (Math.abs(topupUsdPer1k - directUsdPer1k) > 0.0000001) {
        return { providerUsdPer1kChars: topupUsdPer1k, providerUnitSource: "topup_rate" };
      }
      return { providerUsdPer1kChars: directUsdPer1k, providerUnitSource: "direct_rate" };
    }

    const extraChars = Math.max(0, expectedChars - includedChars);
    const topupUsd = (extraChars / 1000) * topupUsdPer1k;
    const blendedUsdPer1k = ((subscriptionUsdMonthly + topupUsd) / expectedChars) * 1000;
    return {
      providerUsdPer1kChars: clampNumber(blendedUsdPer1k, 0.000001, 10000),
      providerUnitSource: extraChars > 0 ? "subscription_plus_topup_blended" : "subscription_blended",
    };
  }

  static async resolveEffectiveLocalCurrencyPerLpc(pricing: PodcastPricingConfig): Promise<{ localCurrencyPerLpc: number; source: "manual" | "package_floor" }> {
    const manualLocalCurrencyPerLpc = clampNumber(Number(pricing.localCurrencyPerLpc || DEFAULT_PODCAST_PRICING.localCurrencyPerLpc), 0.000001, 100000);
    if (!pricing.usePackageFloorLpcValue) {
      return { localCurrencyPerLpc: manualLocalCurrencyPerLpc, source: "manual" };
    }

    try {
      const activePackages = await db
        .select({
          creditsAmount: creditPurchasePackages.creditsAmount,
          priceAmount: creditPurchasePackages.priceAmount,
          currency: creditPurchasePackages.currency,
        })
        .from(creditPurchasePackages)
        .where(eq(creditPurchasePackages.isActive, true));

      let packageFloorLocalPerLpc = Number.POSITIVE_INFINITY;
      for (const pkg of activePackages) {
        const credits = Number(pkg.creditsAmount || 0);
        const rawPrice = Number(pkg.priceAmount || 0);
        if (!Number.isFinite(credits) || credits <= 0 || !Number.isFinite(rawPrice) || rawPrice <= 0) continue;
        const pkgCurrency = String(pkg.currency || pricing.localCurrency || "ZAR").toUpperCase();
        let localPrice = rawPrice;
        if (pkgCurrency !== pricing.localCurrency) {
          try {
            const fx = await ExchangeRateService.getRate(pkgCurrency as any, pricing.localCurrency as any);
            if (!Number.isFinite(fx) || fx <= 0) continue;
            localPrice = rawPrice * fx;
          } catch {
            continue;
          }
        }
        const localPerLpc = localPrice / credits;
        if (Number.isFinite(localPerLpc) && localPerLpc > 0) {
          packageFloorLocalPerLpc = Math.min(packageFloorLocalPerLpc, localPerLpc);
        }
      }

      if (Number.isFinite(packageFloorLocalPerLpc) && packageFloorLocalPerLpc > 0) {
        return { localCurrencyPerLpc: clampNumber(packageFloorLocalPerLpc, 0.000001, 100000), source: "package_floor" };
      }
    } catch (error) {
      console.warn("[Podcast] Failed to derive package-floor LPC value; falling back to manual value:", (error as any)?.message || error);
    }

    return { localCurrencyPerLpc: manualLocalCurrencyPerLpc, source: "manual" };
  }

  static computeSettledLpcFromUsage(params: {
    usageCharacters: number;
    estimatedLpcCost: number;
    pricing: PodcastPricingConfig;
    effectiveProviderUsdPer1kChars?: number;
    effectiveLocalCurrencyPerLpc?: number;
  }): {
    settledLpc: number;
    providerCostUsd: number;
    providerCostLocal: number;
    fxRateUsdToLocal: number;
    effectiveProviderUsdPer1kChars: number;
    effectiveLocalCurrencyPerLpc: number;
    noLossFloorLpc: number;
    estimateToFinalLpcDelta: number;
    settlementReason: string;
  } {
    const usageCharacters = Math.max(1, Math.round(Number(params.usageCharacters) || 0));
    const effectiveProviderUsdPer1kChars = clampNumber(
      Number(params.effectiveProviderUsdPer1kChars || params.pricing.elevenUsdPer1kChars || DEFAULT_PODCAST_PRICING.elevenUsdPer1kChars),
      0.000001,
      10000
    );
    const effectiveLocalCurrencyPerLpc = clampNumber(
      Number(params.effectiveLocalCurrencyPerLpc || params.pricing.localCurrencyPerLpc || DEFAULT_PODCAST_PRICING.localCurrencyPerLpc),
      0.000001,
      100000
    );
    const providerCostUsd = (usageCharacters / 1000) * effectiveProviderUsdPer1kChars;
    const providerCostLocal = providerCostUsd * params.pricing.usdToLocalFxRate;
    const marginDenominator = Math.max(0.0001, 1 - (params.pricing.targetMarginPercent / 100));
    const targetSellLocal = providerCostLocal / marginDenominator;
    const noLossFloorLpc = Math.max(1, Math.ceil(providerCostLocal / effectiveLocalCurrencyPerLpc));
    let settled = Math.ceil(targetSellLocal / effectiveLocalCurrencyPerLpc);
    settled = Math.max(params.pricing.minLpc, settled);
    if (params.pricing.enforceNoLossFloor) {
      settled = Math.max(settled, noLossFloorLpc);
    }
    let settlementReason = "provider_cost_based";
    if (params.estimatedLpcCost > 0 && params.pricing.settlementGuardrailPct >= 0) {
      const maxAllowed = Math.ceil(params.estimatedLpcCost * (1 + (params.pricing.settlementGuardrailPct / 100)));
      if (settled > maxAllowed) {
        settled = maxAllowed;
        settlementReason = "guardrail_capped";
      }
    }
    if (params.pricing.enforceNoLossFloor && settled < noLossFloorLpc) {
      settled = noLossFloorLpc;
      settlementReason = settlementReason === "guardrail_capped" ? "guardrail_skipped_no_loss_floor" : "no_loss_floor_enforced";
    }
    const estimateToFinalLpcDelta = settled - Math.max(0, params.estimatedLpcCost || 0);
    return {
      settledLpc: Math.max(1, settled),
      providerCostUsd: Number(providerCostUsd.toFixed(6)),
      providerCostLocal: Number(providerCostLocal.toFixed(6)),
      fxRateUsdToLocal: params.pricing.usdToLocalFxRate,
      effectiveProviderUsdPer1kChars,
      effectiveLocalCurrencyPerLpc,
      noLossFloorLpc,
      estimateToFinalLpcDelta,
      settlementReason,
    };
  }

  static getActiveVersion(meta: LessonPodcastMetadata): LessonPodcastVersion | null {
    if (!meta.activeVersionId) return null;
    return meta.versions.find((v) => v.id === meta.activeVersionId) || null;
  }

  static getActiveVersionForLanguage(meta: LessonPodcastMetadata, languageCode?: string): LessonPodcastVersion | null {
    const normalizedLanguageCode = normalizePodcastLanguageCode(languageCode);
    const languageActiveId = meta.activeVersionIdsByLanguage?.[normalizedLanguageCode];
    const completed = this.getCompletedVersions(meta);
    if (languageActiveId) {
      const active = completed.find((v) =>
        v.id === languageActiveId && normalizePodcastLanguageCode(v.languageCode) === normalizedLanguageCode
      );
      if (active) return active;
    }
    const legacyActive = this.getActiveVersion(meta);
    if (legacyActive && normalizePodcastLanguageCode(legacyActive.languageCode) === normalizedLanguageCode) {
      return legacyActive;
    }
    return null;
  }

  private static setActiveVersionForLanguage(meta: LessonPodcastMetadata, languageCode: string | undefined, versionId: string) {
    const normalizedLanguageCode = normalizePodcastLanguageCode(languageCode);
    meta.activeVersionIdsByLanguage = {
      ...(meta.activeVersionIdsByLanguage || {}),
      [normalizedLanguageCode]: versionId,
    };
    meta.activeVersionId = versionId;
  }

  static estimateFromScript(
    script: string,
    options?: { mode?: PodcastFormat; pricing?: Partial<PodcastPricingConfig> }
  ): { estimatedCharacters: number; estimatedLpcCost: number; estimatedDurationSec: number } {
    const estimatedCharacters = clampPodcastTextLength(script).length;
    const mode = options?.mode || "bulletin";
    return {
      estimatedCharacters,
      estimatedLpcCost: estimateLpcFromCharacters(estimatedCharacters, options?.pricing, mode),
      estimatedDurationSec: estimateDurationSecFromCharacters(estimatedCharacters),
    };
  }

  static async applyProviderAwareEstimate(
    estimation: { estimatedCharacters: number; estimatedLpcCost: number; estimatedDurationSec: number },
    pricing: PodcastPricingConfig
  ): Promise<{ estimatedCharacters: number; estimatedLpcCost: number; estimatedDurationSec: number }> {
    const providerUnit = this.resolveEffectiveProviderUsdPer1kChars(pricing);
    const effectiveLpc = await this.resolveEffectiveLocalCurrencyPerLpc(pricing);
    const providerAware = this.computeSettledLpcFromUsage({
      usageCharacters: estimation.estimatedCharacters,
      estimatedLpcCost: 0,
      pricing,
      effectiveProviderUsdPer1kChars: providerUnit.providerUsdPer1kChars,
      effectiveLocalCurrencyPerLpc: effectiveLpc.localCurrencyPerLpc,
    });
    return {
      ...estimation,
      estimatedLpcCost: providerAware.settledLpc,
    };
  }

  static async listVoices(): Promise<ElevenVoice[]> {
    const eleven = await ElevenLabsService.getInstance();
    return eleven.listVoices();
  }

  static async getSubscriptionUsage() {
    try {
      const eleven = await ElevenLabsService.getInstance();
      return eleven.getSubscriptionUsage();
    } catch {
      return null;
    }
  }

  static async getSourcePreview(lesson: Lesson): Promise<Record<PodcastSourceType, string>> {
    const sourcedb = clampPodcastTextLength(String(lesson.inputText || ""));
    const meta = this.getMetadata(lesson);
    const sourceMaterials = Array.isArray(meta.sourceMaterials) ? meta.sourceMaterials : [];
    const latestWordMaterial = sourceMaterials
      .filter((material) => material.sourceType === "word" && !!String(material.extractedText || "").trim())
      .sort((a, b) => {
        if (a.version !== b.version) return b.version - a.version;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      })[0];
    let word = clampPodcastTextLength(String(latestWordMaterial?.extractedText || ""));
    let pptx = "";
    try {
      pptx = await buildScriptFromSource(lesson, "pptx");
    } catch (error) {
      console.warn(`[Podcast] PPTX source preview unavailable for lesson ${lesson.id}:`, (error as any)?.message || error);
      pptx = "";
    }
    return {
      sourcedb: sourcedb.slice(0, 2500),
      word: word.slice(0, 2500),
      pptx: pptx.slice(0, 2500),
    };
  }

  private static async writeAuditFile(params: {
    lesson: Lesson;
    languageCode: string;
    versionId?: string;
    scriptId?: string;
    stage: LessonPodcastAuditArtifact["stage"];
    artifactType: LessonPodcastAuditArtifact["artifactType"];
    label: string;
    filename: string;
    content: Buffer | string;
  }): Promise<LessonPodcastAuditArtifact | null> {
    const ext = normalizeExtension(path.extname(params.filename || "")) || ".bin";
    const key = buildCanonicalStorageKey({
      scope: "private",
      domain: "pod-aud",
      extension: ext,
      seed: `podcast-audit:${params.lesson.organizationId}:${params.lesson.id}:${params.languageCode}:${params.versionId || "script"}:${params.stage}:${params.filename}:${Date.now()}`,
    });
    const destination = canonicalKeyToAbsolutePath(key);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const buffer = typeof params.content === "string"
      ? Buffer.from(params.content, "utf8")
      : params.content;
    await fs.promises.writeFile(destination, buffer);
    return {
      id: randomUUID(),
      createdAt: safeNow(),
      lessonId: params.lesson.id,
      organizationId: params.lesson.organizationId,
      languageCode: params.languageCode || "en",
      versionId: params.versionId,
      scriptId: params.scriptId,
      stage: params.stage,
      artifactType: params.artifactType,
      label: params.label,
      relativePath: key.replace(/^\/+/, ""),
      bytes: buffer.length,
    };
  }

  private static addAuditArtifacts(meta: LessonPodcastMetadata, artifacts: Array<LessonPodcastAuditArtifact | null | undefined>) {
    const existing = Array.isArray(meta.auditArtifacts) ? meta.auditArtifacts : [];
    const toAdd = artifacts.filter((a): a is LessonPodcastAuditArtifact => !!a);
    meta.auditArtifacts = [...toAdd, ...existing].slice(0, 500);
  }

  private static async packageVersionToHls(params: {
    storagePath: string;
    lesson: Lesson;
    versionId: string;
    languageCode: string;
  }): Promise<{ hlsPackagingStatus: "ready" | "failed"; hlsManifestKey?: string; hlsSegmentDirKey?: string; hlsErrorMessage?: string }> {
    try {
      const resolvedAudioPath = resolveStoragePath(params.storagePath);
      if (!resolvedAudioPath || !fs.existsSync(resolvedAudioPath)) {
        return { hlsPackagingStatus: "failed", hlsErrorMessage: "Source audio missing for HLS packaging." };
      }

      const sourceDir = path.dirname(resolvedAudioPath);
      const hlsDir = path.join(sourceDir, "hls");
      await fs.promises.mkdir(hlsDir, { recursive: true });
      const existing = await fs.promises.readdir(hlsDir).catch(() => []);
      await Promise.all(existing.map((name) => fs.promises.unlink(path.join(hlsDir, name)).catch(() => undefined)));

      await runFfmpegHlsPackaging(resolvedAudioPath, hlsDir);
      const manifestPath = path.join(hlsDir, "index.m3u8");
      if (!fs.existsSync(manifestPath)) {
        return { hlsPackagingStatus: "failed", hlsErrorMessage: "HLS manifest not generated." };
      }

      return {
        hlsPackagingStatus: "ready",
        hlsManifestKey: manifestPath,
        hlsSegmentDirKey: hlsDir,
      };
    } catch (error: any) {
      return {
        hlsPackagingStatus: "failed",
        hlsErrorMessage: String(error?.message || "HLS packaging failed"),
      };
    }
  }

  static resolveAuditArtifactPath(artifact: LessonPodcastAuditArtifact): string {
    return resolveUploadsPath(artifact.relativePath);
  }

  static getAuditArtifact(meta: LessonPodcastMetadata, artifactId: string): LessonPodcastAuditArtifact | null {
    const artifacts = Array.isArray(meta.auditArtifacts) ? meta.auditArtifacts : [];
    return artifacts.find((artifact) => artifact.id === artifactId) || null;
  }

  static async buildScriptDraft(params: {
    lesson: Lesson;
    sourceType: PodcastSourceType;
    sourceMaterialId?: string;
    format: PodcastFormat;
    duration: PodcastDuration;
    focusTopic?: string;
    voiceId: string;
    guestVoiceId?: string;
    voiceName?: string;
    guestVoiceName?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    languageCode?: string;
    sourceScriptId?: string;
    scriptTextOverride?: string;
  }): Promise<{ script: LessonPodcastScriptRecord; metadata: LessonPodcastMetadata }> {
    const sourceText = await buildScriptFromSource(params.lesson, params.sourceType, params.sourceMaterialId);
    if (!sourceText || sourceText.length < 30) {
      throw new Error("Not enough source content found for this source type.");
    }

    const focusPrefix = params.focusTopic ? `Focus Topic: ${params.focusTopic}\n\n` : "";
    const durationHint = params.duration === "short"
      ? "Target length: short."
      : params.duration === "long"
        ? "Target length: long."
        : "Target length: default.";
    const payloadContent = params.scriptTextOverride
      ? clampPodcastTextLength(params.scriptTextOverride)
      : `${durationHint}\n${focusPrefix}${sourceText}`;

    let generatedScript: { scriptText: string; raw: any; model: string };
    try {
      generatedScript = await buildPodcastScriptWithGemini({
        sourceText: payloadContent,
        sourceType: params.sourceType,
        lessonTitle: params.lesson.title,
        lessonDescription: params.lesson.description || undefined,
        format: params.format,
        duration: params.duration,
        focusTopic: params.focusTopic,
        languageCode: params.languageCode || params.lesson.languageCode || "en",
        hostVoiceName: params.voiceName,
        guestVoiceName: params.guestVoiceName,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
      });
    } catch (error: any) {
      const meta = this.getMetadata(params.lesson);
      const failureArtifact = await this.writeAuditFile({
        lesson: params.lesson,
        languageCode: params.languageCode || (params.lesson.languageCode || "en"),
        stage: "script_generation",
        artifactType: "application/json",
        label: "Gemini script generation failure response",
        filename: `script-failure-${Date.now()}.json`,
        content: JSON.stringify({
          errorMessage: error?.message || "Script generation failed",
        }, null, 2),
      });
      this.addAuditArtifacts(meta, [failureArtifact]);
      const usageEvents = Array.isArray((meta as any).usageEvents) ? (meta as any).usageEvents : [];
      usageEvents.unshift({
        id: randomUUID(),
        stage: "script_generation_failed",
        createdAt: safeNow(),
        sourceType: params.sourceType,
        languageCode: params.languageCode || (params.lesson.languageCode || "en"),
        errorMessage: error?.message || "Script generation failed",
      });
      (meta as any).usageEvents = usageEvents.slice(0, 100);
      await this.saveMetadata(params.lesson, meta);
      throw error;
    }
    const scriptText = clampPodcastTextLength(generatedScript.scriptText);

    if (!scriptText || scriptText.length < 30) {
      throw new Error("Generated podcast script is too short. Adjust source, focus topic, or duration.");
    }

    const pricing = await this.getPodcastPricingConfig();
    const estimation = await this.applyProviderAwareEstimate(
      this.estimateFromScript(scriptText, { mode: params.format, pricing }),
      pricing
    );
    const scriptSegments = parseScriptSegments(scriptText, params.format, params.voiceId, params.guestVoiceId);
    if (params.format === "conversation") {
      const hostCount = scriptSegments.filter((s) => s.speaker === "host").length;
      const guestCount = scriptSegments.filter((s) => s.speaker === "guest").length;
      if (hostCount === 0 || guestCount === 0) {
        throw new Error("Conversation script must include both HOST and GUEST lines.");
      }
    }
    const now = safeNow();
    const script: LessonPodcastScriptRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format: params.format,
      duration: params.duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      estimatedCharacters: estimation.estimatedCharacters,
      estimatedLpcCost: estimation.estimatedLpcCost,
      sourceScriptId: params.sourceScriptId,
      languageCode: params.languageCode || (params.lesson.languageCode || "en"),
      text: scriptText,
      textHash: hashPodcastScriptText(scriptText),
      scriptSegments,
      aiRawResponse: generatedScript.raw || null,
      aiRequestPayload: {
        model: generatedScript.model,
        mode: params.format,
        sourceType: params.sourceType,
        sourceMaterialId: params.sourceMaterialId,
        hostVoiceId: params.voiceId,
        guestVoiceId: params.guestVoiceId,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
        languageCode: params.languageCode || (params.lesson.languageCode || "en"),
        focusTopic: params.focusTopic,
        duration: params.duration,
      },
    };

    const meta = this.getMetadata(params.lesson);
    const existingScripts = Array.isArray(meta.scripts) ? meta.scripts : [];
    meta.scripts = [script, ...existingScripts].slice(0, 30);
    const usageEvents = Array.isArray((meta as any).usageEvents) ? (meta as any).usageEvents : [];
    usageEvents.unshift({
      id: randomUUID(),
      stage: "script_generation",
      createdAt: safeNow(),
      sourceType: params.sourceType,
      languageCode: params.languageCode || (params.lesson.languageCode || "en"),
      elevenCharactersUsed: 0,
      elevenCharacterCount: null,
      elevenCharacterLimit: null,
      raw: generatedScript.raw || null,
    });
    const rawAuditArtifact = await this.writeAuditFile({
      lesson: params.lesson,
      languageCode: params.languageCode || (params.lesson.languageCode || "en"),
      scriptId: script.id,
      stage: "script_generation",
      artifactType: "application/json",
      label: "Gemini script generation response",
      filename: `script-response-${script.id}.json`,
      content: JSON.stringify(generatedScript.raw || {}, null, 2),
    });
    this.addAuditArtifacts(meta, [rawAuditArtifact]);
    (meta as any).usageEvents = usageEvents.slice(0, 100);
    await this.saveMetadata(params.lesson, meta);
    return { script, metadata: meta };
  }

  private static async createManualScriptRecord(params: {
    lesson: Lesson;
    sourceType: PodcastSourceType;
    sourceMaterialId?: string;
    format: PodcastFormat;
    duration: PodcastDuration;
    focusTopic?: string;
    voiceId: string;
    guestVoiceId?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    languageCode?: string;
    sourceScriptId?: string;
    scriptText: string;
  }): Promise<LessonPodcastScriptRecord> {
    const scriptText = clampPodcastTextLength(params.scriptText);
    const pricing = await this.getPodcastPricingConfig();
    const estimation = await this.applyProviderAwareEstimate(
      this.estimateFromScript(scriptText, { mode: params.format, pricing }),
      pricing
    );
    const now = safeNow();
    return {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format: params.format,
      duration: params.duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      estimatedCharacters: estimation.estimatedCharacters,
      estimatedLpcCost: estimation.estimatedLpcCost,
      sourceScriptId: params.sourceScriptId,
      languageCode: params.languageCode || (params.lesson.languageCode || "en"),
      text: scriptText,
      textHash: hashPodcastScriptText(scriptText),
      scriptSegments: parseScriptSegments(scriptText, params.format, params.voiceId, params.guestVoiceId),
      aiRawResponse: null,
      aiRequestPayload: {
        model: "manual-edit",
        mode: params.format,
        sourceType: params.sourceType,
        sourceMaterialId: params.sourceMaterialId,
        hostVoiceId: params.voiceId,
        guestVoiceId: params.guestVoiceId,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
        languageCode: params.languageCode || (params.lesson.languageCode || "en"),
        focusTopic: params.focusTopic,
        duration: params.duration,
      },
    };
  }

  private static async resolveScriptVersionInMetadata(params: {
    lesson: Lesson;
    meta: LessonPodcastMetadata;
    sourceType: PodcastSourceType;
    sourceMaterialId?: string;
    format: PodcastFormat;
    duration: PodcastDuration;
    focusTopic?: string;
    scriptId?: string;
    scriptText?: string;
    voiceId?: string;
    guestVoiceId?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    languageCode?: string;
  }): Promise<{ meta: LessonPodcastMetadata; id?: string; text?: string; scriptId?: string; scriptText?: string; textHash?: string }> {
    const scriptText = params.scriptText ? clampPodcastTextLength(params.scriptText) : "";
    if (!scriptText || scriptText.trim().length < 30 || !params.voiceId) {
      return { meta: params.meta, id: params.scriptId, text: scriptText || undefined, scriptId: params.scriptId, scriptText: scriptText || undefined };
    }

    const textHash = hashPodcastScriptText(scriptText);
    const scripts = Array.isArray(params.meta.scripts) ? params.meta.scripts : [];
    const compatible = (script: LessonPodcastScriptRecord | undefined) => isScriptRecordCompatible({
      script,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format: params.format,
      duration: params.duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId!,
      guestVoiceId: params.guestVoiceId,
    });
    const exactExisting = scripts.find((script) =>
      compatible(script)
      && (script.textHash || hashPodcastScriptText(script.text || "")) === textHash
    );
    if (exactExisting) {
      return { meta: params.meta, id: exactExisting.id, text: exactExisting.text, scriptId: exactExisting.id, scriptText: exactExisting.text, textHash };
    }

    const sourceScriptId = scripts.some((script) => script.id === params.scriptId) ? params.scriptId : undefined;
    const script = await this.createManualScriptRecord({
      lesson: params.lesson,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format: params.format,
      duration: params.duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      languageCode: params.languageCode,
      sourceScriptId,
      scriptText,
    });
    params.meta.scripts = [script, ...scripts].slice(0, 30);
    return { meta: params.meta, id: script.id, text: script.text, scriptId: script.id, scriptText: script.text, textHash: script.textHash };
  }

  private static async resolveDraftScriptVersion(params: Parameters<typeof LessonPodcastService.resolveScriptVersionInMetadata>[0]) {
    return this.resolveScriptVersionInMetadata(params);
  }

  private static async resolveGenerationScriptVersion(params: Parameters<typeof LessonPodcastService.resolveScriptVersionInMetadata>[0]) {
    return this.resolveScriptVersionInMetadata(params);
  }

  static async saveDraft(params: {
    lesson: Lesson;
    draftId?: string;
    createNewDraft?: boolean;
    sourceType: PodcastSourceType;
    sourceMaterialId?: string;
    currentStep?: number;
    format?: PodcastFormat;
    duration?: PodcastDuration;
    focusTopic?: string;
    voiceId?: string;
    guestVoiceId?: string;
    voiceName?: string;
    guestVoiceName?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    title?: string;
    notes?: string;
    scriptId?: string;
    scriptText?: string;
    estimatedCharacters: number;
    estimatedLpcCost: number;
  }): Promise<LessonPodcastMetadata> {
    const meta = this.getMetadata(params.lesson);
    const currentDrafts = Array.isArray(meta.drafts) ? meta.drafts : [];
    const requestedDraftId = String(params.draftId || "").trim();
    const selectedDraft = requestedDraftId
      ? currentDrafts.find((item) => String(item?.id || "").trim() === requestedDraftId)
      : meta.draft;
    const shouldStartNewDraft = !!params.createNewDraft || !selectedDraft?.id;
    const draftId = shouldStartNewDraft ? randomUUID() : selectedDraft?.id;
    const draftCreatedAt = shouldStartNewDraft ? safeNow() : (selectedDraft?.createdAt || safeNow());
    const resolved = await this.resolveDraftScriptVersion({
      lesson: params.lesson,
      meta,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format: params.format || "bulletin",
      duration: params.duration || "default",
      focusTopic: params.focusTopic,
      scriptId: params.scriptId,
      scriptText: params.scriptText,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      languageCode: params.lesson.languageCode || "en",
    });
    const resolvedScriptText = resolved.scriptText || params.scriptText;
    const resolvedScriptId = resolved.scriptId || params.scriptId;
    meta.draft = {
      id: draftId,
      createdAt: draftCreatedAt,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      currentStep: params.currentStep,
      format: params.format,
      duration: params.duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      voiceName: params.voiceName,
      guestVoiceName: params.guestVoiceName,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      title: params.title,
      notes: params.notes,
      scriptId: resolvedScriptId,
      scriptText: resolvedScriptText,
      textHash: resolvedScriptText ? hashPodcastScriptText(resolvedScriptText) : undefined,
      estimatedCharacters: params.estimatedCharacters,
      estimatedLpcCost: params.estimatedLpcCost,
      updatedAt: safeNow(),
      status: "idle",
    };
    meta.drafts = sortDraftsByUpdatedAtDesc(
      [meta.draft, ...currentDrafts.filter((item) => item?.id && item.id !== meta.draft?.id)].filter(Boolean) as LessonPodcastDraft[]
    ).slice(0, 50);
    meta.currentJob = {
      status: "idle",
      updatedAt: safeNow(),
    };
    await this.saveMetadata(params.lesson, meta);
    return meta;
  }

  static async beginGeneration(params: {
    lesson: Lesson;
    requestedBy: string;
    sourceType: PodcastSourceType;
    sourceMaterialId?: string;
    format?: PodcastFormat;
    duration?: PodcastDuration;
    focusTopic?: string;
    scriptId?: string;
    scriptText?: string;
    voiceId: string;
    guestVoiceId?: string;
    voiceName?: string;
    guestVoiceName?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    title?: string;
    notes?: string;
    languageCode?: string;
    versionId?: string;
  }): Promise<{ versionId: string; metadata: LessonPodcastMetadata }> {
    const format = params.format || "bulletin";
    const duration = params.duration || "default";
    let metaBefore = this.getMetadata(params.lesson);
    let existingScript = params.scriptId
      ? (metaBefore.scripts || []).find((s) => s.id === params.scriptId)
      : undefined;
    const compatibleExistingScript = isScriptRecordCompatible({
      script: existingScript,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format,
      duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
    }) ? existingScript : undefined;

    let resolvedScriptId = compatibleExistingScript?.id;
    let script = params.scriptText ? clampPodcastTextLength(params.scriptText) : "";
    if (script) {
      const resolvedScript = await this.resolveGenerationScriptVersion({
        lesson: params.lesson,
        meta: metaBefore,
        sourceType: params.sourceType,
        sourceMaterialId: params.sourceMaterialId,
        format,
        duration,
        focusTopic: params.focusTopic,
        voiceId: params.voiceId,
        guestVoiceId: params.guestVoiceId,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
        languageCode: params.languageCode || (params.lesson.languageCode || "en"),
        scriptId: params.scriptId,
        scriptText: script,
      });
      metaBefore = resolvedScript.meta;
      script = resolvedScript.text || script;
      resolvedScriptId = resolvedScript.id || resolvedScriptId;
      existingScript = resolvedScriptId
        ? (metaBefore.scripts || []).find((s) => s.id === resolvedScriptId)
        : existingScript;
    }
    if (!script) {
      script = compatibleExistingScript?.text || "";
    }
    if (!script) {
      const created = await this.buildScriptDraft({
        lesson: params.lesson,
        sourceType: params.sourceType,
        sourceMaterialId: params.sourceMaterialId,
        format,
        duration,
        focusTopic: params.focusTopic,
        voiceId: params.voiceId,
        guestVoiceId: params.guestVoiceId,
        voiceName: params.voiceName,
        guestVoiceName: params.guestVoiceName,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
        languageCode: params.languageCode || (params.lesson.languageCode || "en"),
        scriptTextOverride: params.scriptText,
      });
      script = created.script.text;
      resolvedScriptId = created.script.id;
    }
    if (!script || script.length < 30) {
      throw new Error("Lesson does not have enough source content to generate podcast audio.");
    }
    if (format === "conversation" && !params.guestVoiceId) {
      throw new Error("Conversation format requires a guest voice.");
    }

    if (format === "conversation") {
      const normalized = normalizeConversationScriptText(script);
      if (normalized.hostCount === 0 || normalized.guestCount === 0) {
        throw new Error("Conversation mode requires script lines prefixed with HOST: and GUEST:. Regenerate script after changing mode/voices.");
      }
      script = normalized.text;
    }

    const pricing = await this.getPodcastPricingConfig();
    const estimation = await this.applyProviderAwareEstimate(
      this.estimateFromScript(script, { mode: format, pricing }),
      pricing
    );
    const versionId = String(params.versionId || "").trim() || randomUUID();
    const now = safeNow();
    const meta = metaBefore;
    meta.draft = {
      id: randomUUID(),
      createdAt: now,
      sourceType: params.sourceType,
      sourceMaterialId: params.sourceMaterialId,
      format,
      duration,
      focusTopic: params.focusTopic,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      voiceName: params.voiceName,
      guestVoiceName: params.guestVoiceName,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      title: params.title,
      notes: params.notes,
      scriptId: resolvedScriptId,
      scriptText: script,
      textHash: script ? hashPodcastScriptText(script) : undefined,
      estimatedCharacters: estimation.estimatedCharacters,
      estimatedLpcCost: estimation.estimatedLpcCost,
      updatedAt: now,
      status: "processing",
    };
    const currentDrafts = Array.isArray(meta.drafts) ? meta.drafts : [];
    meta.drafts = sortDraftsByUpdatedAtDesc(
      [meta.draft, ...currentDrafts.filter((item) => item?.id && item.id !== meta.draft?.id)].filter(Boolean) as LessonPodcastDraft[]
    ).slice(0, 50);
    const jobPayload: PendingPodcastJobPayload = {
      lessonId: params.lesson.id,
      organizationId: params.lesson.organizationId,
      languageCode: params.languageCode || params.lesson.languageCode || "en",
      sourceType: params.sourceType,
      format,
      duration,
      focusTopic: params.focusTopic,
      scriptId: resolvedScriptId,
      scriptText: script,
      voiceId: params.voiceId,
      guestVoiceId: params.guestVoiceId,
      voiceName: params.voiceName,
      guestVoiceName: params.guestVoiceName,
      hostDisplayName: params.hostDisplayName,
      guestDisplayName: params.guestDisplayName,
      title: params.title,
      versionId,
      requestedBy: params.requestedBy,
    };
    meta.currentJob = {
      status: "processing",
      startedAt: now,
      updatedAt: now,
      requestedBy: params.requestedBy,
      versionId,
      jobPayload,
    };
    await this.saveMetadata(params.lesson, meta);

    // Fire-and-forget async generation with in-memory de-dup guard.
    this.enqueueProcessingJob(jobPayload);

    return { versionId, metadata: meta };
  }

  static async processGeneration(params: {
    lessonId: string;
    organizationId: string;
    languageCode: string;
    sourceType: PodcastSourceType;
    format?: PodcastFormat;
    duration?: PodcastDuration;
    focusTopic?: string;
    scriptId?: string;
    scriptText?: string;
    voiceId: string;
    guestVoiceId?: string;
    voiceName?: string;
    guestVoiceName?: string;
    hostDisplayName?: string;
    guestDisplayName?: string;
    title?: string;
    versionId: string;
    requestedBy?: string;
  }): Promise<void> {
    const lesson = await this.getLesson(params.lessonId);
    if (!lesson) return;

    let meta = this.getMetadata(lesson);
    const existingVersion = (meta.versions || []).find((v) => v.id === params.versionId);
    if (existingVersion?.status === "completed") {
      return;
    }

    try {
      const format = params.format || "bulletin";
      const duration = params.duration || "default";
      const metaAtStart = this.getMetadata(lesson);
      const foundScript = params.scriptId
        ? (metaAtStart.scripts || []).find((s) => s.id === params.scriptId)
        : undefined;
      let script = params.scriptText || foundScript?.text || "";
      if (!script || script.length < 30) {
        throw new Error("Not enough source content found for podcast generation.");
      }
      if (format === "conversation" && !params.guestVoiceId) {
        throw new Error("Conversation format requires host and guest voices.");
      }
      if (format === "conversation") {
        const normalized = normalizeConversationScriptText(script);
        if (normalized.hostCount === 0 || normalized.guestCount === 0) {
          throw new Error("Conversation mode requires HOST/GUEST script turns. Regenerate script after changing mode or voices.");
        }
        script = normalized.text;
      }

      const eleven = await ElevenLabsService.getInstance();
      const usageBeforeAudio = await eleven.getSubscriptionUsage();
      let audioBuffer: Buffer;
      if (format === "conversation") {
        const turns = parseConversationTurns(script, params.voiceId, params.guestVoiceId!);
        const chunks: Buffer[] = [];
        const chunkAuditArtifacts: LessonPodcastAuditArtifact[] = [];
        let chunkIndex = 0;
        for (const turn of turns) {
          const textParts = splitTextForTts(turn.text);
          for (const part of textParts) {
            const buffer = await eleven.generateSpeech({
              text: part,
              voiceId: turn.voiceId,
            });
            chunks.push(buffer);
            chunkIndex += 1;
            const chunkAudit = await this.writeAuditFile({
              lesson,
              languageCode: params.languageCode || "en",
              versionId: params.versionId,
              scriptId: params.scriptId,
              stage: "audio_chunk",
              artifactType: "audio/mp3",
              label: `Conversation chunk ${chunkIndex} (${turn.voiceId})`,
              filename: `chunk-${String(chunkIndex).padStart(4, "0")}-${turn.voiceId}.mp3`,
              content: buffer,
            });
            if (chunkAudit) {
              chunkAuditArtifacts.push(chunkAudit);
            }
          }
        }
        audioBuffer = await mergeAudioChunks(chunks);
        meta = this.getMetadata(lesson);
        this.addAuditArtifacts(meta, chunkAuditArtifacts);
        await this.saveMetadata(lesson, meta);
      } else {
        const parts = splitTextForTts(script);
        const chunks: Buffer[] = [];
        const chunkAuditArtifacts: LessonPodcastAuditArtifact[] = [];
        for (const part of parts) {
          const buffer = await eleven.generateSpeech({
            text: part,
            voiceId: params.voiceId,
          });
          chunks.push(buffer);
          const chunkIndex = chunks.length;
          const chunkAudit = await this.writeAuditFile({
            lesson,
            languageCode: params.languageCode || "en",
            versionId: params.versionId,
            scriptId: params.scriptId,
            stage: "audio_chunk",
            artifactType: "audio/mp3",
            label: `Bulletin chunk ${chunkIndex} (${params.voiceId})`,
            filename: `chunk-${String(chunkIndex).padStart(4, "0")}-${params.voiceId}.mp3`,
            content: buffer,
          });
          if (chunkAudit) {
            chunkAuditArtifacts.push(chunkAudit);
          }
        }
        audioBuffer = await mergeAudioChunks(chunks);
        meta = this.getMetadata(lesson);
        this.addAuditArtifacts(meta, chunkAuditArtifacts);
        await this.saveMetadata(lesson, meta);
      }

      const pricing = await this.getPodcastPricingConfig();
      const estimation = await this.applyProviderAwareEstimate(
        this.estimateFromScript(script, { mode: format, pricing }),
        pricing
      );
      const usageAfterAudio = await eleven.getSubscriptionUsage();
      const beforeCount = usageBeforeAudio?.characterCount ?? null;
      const afterCount = usageAfterAudio?.characterCount ?? null;
      const resolvedElevenCharactersUsed =
        typeof beforeCount === "number" && typeof afterCount === "number" && afterCount >= beforeCount
          ? Math.max(1, afterCount - beforeCount)
          : Math.max(1, estimation.estimatedCharacters);
      let actualElevenCharactersUsed = resolvedElevenCharactersUsed;
      const providerUnit = this.resolveEffectiveProviderUsdPer1kChars(pricing);
      const effectiveLpcValue = await this.resolveEffectiveLocalCurrencyPerLpc(pricing);
      const settled = this.computeSettledLpcFromUsage({
        usageCharacters: resolvedElevenCharactersUsed,
        estimatedLpcCost: estimation.estimatedLpcCost,
        pricing,
        effectiveProviderUsdPer1kChars: providerUnit.providerUsdPer1kChars,
        effectiveLocalCurrencyPerLpc: effectiveLpcValue.localCurrencyPerLpc,
      });
      let actualLpcCost = settled.settledLpc;
      const settlementCorrelationId = `podcast-${params.versionId}`;
      let deductionResult: {
        creditSource: "user" | "organization" | "split";
        userAmountDeducted: number;
        orgAmountDeducted: number;
        userTransactionId?: string;
        orgTransactionId?: string;
      } | null = null;
      let settlementWarning: string | null = null;

      if (params.requestedBy) {
        try {
          deductionResult = await HybridCreditService.deductWithFallback({
            userId: params.requestedBy,
            organizationId: lesson.organizationId,
            amount: actualLpcCost,
            type: "deduction",
            activityType: "lesson_generation",
            correlationId: settlementCorrelationId,
            description: `Podcast generation (${params.languageCode || "en"})`,
            metadata: {
              lessonId: params.lessonId,
              versionId: params.versionId,
              languageCode: params.languageCode || "en",
              estimatedCharacters: estimation.estimatedCharacters,
              estimatedLpcCost: estimation.estimatedLpcCost,
              actualElevenCharactersUsed,
              actualLpcCost,
              providerUsageUnit: "character",
              providerUsageAmount: actualElevenCharactersUsed,
              providerCostUsd: settled.providerCostUsd,
              providerCostLocal: settled.providerCostLocal,
              providerCostCurrency: pricing.localCurrency,
              fxRateUsdToLocal: settled.fxRateUsdToLocal,
              effectiveProviderUsdPer1kChars: settled.effectiveProviderUsdPer1kChars,
              providerUnitSource: providerUnit.providerUnitSource,
              effectiveLocalCurrencyPerLpc: settled.effectiveLocalCurrencyPerLpc,
              effectiveLocalCurrencyPerLpcSource: effectiveLpcValue.source,
              noLossFloorLpc: settled.noLossFloorLpc,
              pricingConfigVersion: pricing.configVersion,
              estimateToFinalLpcDelta: settled.estimateToFinalLpcDelta,
              settlementReason: settled.settlementReason,
              settlementSource:
                typeof beforeCount === "number" && typeof afterCount === "number" && afterCount >= beforeCount
                  ? "elevenlabs_delta"
                  : "estimated_fallback",
            },
          });
        } catch (settlementError: any) {
          settlementWarning = String(settlementError?.message || "LPC settlement could not be completed automatically.");
          console.warn("[Podcast] Settlement warning:", settlementWarning);
        }
      } else {
        settlementWarning = "Missing requesting user for LPC settlement.";
      }

      try {
        await this.ensurePodcastSettlementTables();
        await db
          .insert(podcastProviderCostLedger)
          .values({
            correlationId: settlementCorrelationId,
            lessonId: params.lessonId,
            organizationId: params.organizationId,
            versionId: params.versionId,
            userId: params.requestedBy || null,
            usageUnit: "character",
            usageAmount: actualElevenCharactersUsed,
            providerCostUsd: settled.providerCostUsd.toFixed(6),
            providerCurrency: "USD",
            providerUnitPriceUsd: settled.effectiveProviderUsdPer1kChars.toFixed(6),
            fxRateUsdToLocal: settled.fxRateUsdToLocal.toFixed(8),
            localCurrency: pricing.localCurrency,
            providerCostLocal: settled.providerCostLocal.toFixed(6),
            pricingConfigVersion: pricing.configVersion,
            metadata: {
              sourceType: params.sourceType,
              languageCode: params.languageCode || "en",
              format,
              duration,
              estimatedCharacters: estimation.estimatedCharacters,
              providerUnitSource: providerUnit.providerUnitSource,
              effectiveProviderUsdPer1kChars: settled.effectiveProviderUsdPer1kChars,
              settlementSource:
                typeof beforeCount === "number" && typeof afterCount === "number" && afterCount >= beforeCount
                  ? "elevenlabs_delta"
                  : "estimated_fallback",
            },
          })
          .onConflictDoNothing({ target: podcastProviderCostLedger.correlationId });

        await db
          .insert(podcastSettlementLedger)
          .values({
            correlationId: settlementCorrelationId,
            lessonId: params.lessonId,
            organizationId: params.organizationId,
            versionId: params.versionId,
            userId: params.requestedBy || null,
            estimateCharacters: estimation.estimatedCharacters,
            estimatedLpcCost: estimation.estimatedLpcCost,
            settledLpcCost: actualLpcCost,
            estimateToFinalLpcDelta: settled.estimateToFinalLpcDelta,
            settlementReason: settled.settlementReason,
            targetMarginPercent: pricing.targetMarginPercent.toFixed(2),
            localCurrencyPerLpc: settled.effectiveLocalCurrencyPerLpc.toFixed(6),
            settlementGuardrailPct: pricing.settlementGuardrailPct.toFixed(2),
            pricingConfigVersion: pricing.configVersion,
            userLedgerTransactionId: deductionResult?.userTransactionId || null,
            orgLedgerTransactionId: deductionResult?.orgTransactionId || null,
            metadata: {
              sourceType: params.sourceType,
              languageCode: params.languageCode || "en",
              format,
              duration,
              providerUsageUnit: "character",
              providerUsageAmount: actualElevenCharactersUsed,
              providerCostUsd: settled.providerCostUsd,
              providerCostLocal: settled.providerCostLocal,
              providerCostCurrency: pricing.localCurrency,
              fxRateUsdToLocal: settled.fxRateUsdToLocal,
              effectiveProviderUsdPer1kChars: settled.effectiveProviderUsdPer1kChars,
              providerUnitSource: providerUnit.providerUnitSource,
              effectiveLocalCurrencyPerLpc: settled.effectiveLocalCurrencyPerLpc,
              effectiveLocalCurrencyPerLpcSource: effectiveLpcValue.source,
              noLossFloorLpc: settled.noLossFloorLpc,
              creditSource: deductionResult?.creditSource || null,
              userAmountDeducted: deductionResult?.userAmountDeducted || 0,
              orgAmountDeducted: deductionResult?.orgAmountDeducted || 0,
              settlementWarning: settlementWarning || null,
            },
          })
          .onConflictDoNothing({ target: podcastSettlementLedger.correlationId });
      } catch (ledgerError: any) {
        console.warn("[Podcast] Settlement ledger write warning:", String(ledgerError?.message || ledgerError));
      }

      const audioFilename = await this.buildPodcastAudioFilename(lesson);
      const storageKey = buildCanonicalStorageKey({
        scope: "private",
        domain: "pod-aud",
        extension: ".mp3",
        seed: `podcast-audio:${params.organizationId}:${params.lessonId}:${params.languageCode || "en"}:${params.versionId}:${audioFilename}`,
      });
      const storagePath = canonicalKeyToAbsolutePath(storageKey);

      await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.promises.writeFile(storagePath, audioBuffer);
      const finalAudioArtifact = await this.writeAuditFile({
        lesson,
        languageCode: params.languageCode || "en",
        versionId: params.versionId,
        scriptId: params.scriptId,
        stage: "audio_generation",
        artifactType: "audio/mp3",
        label: "Final generated podcast audio",
        filename: `final-${params.versionId}.mp3`,
        content: audioBuffer,
      });
      const hlsPackaging = await this.packageVersionToHls({
        storagePath,
        lesson,
        versionId: params.versionId,
        languageCode: params.languageCode || "en",
      });

      const now = safeNow();
      const version: LessonPodcastVersion = {
        id: params.versionId,
        storageKey,
        createdAt: now,
        updatedAt: now,
        status: "completed",
        sourceType: params.sourceType,
        format,
        duration,
        focusTopic: params.focusTopic,
        scriptId: params.scriptId,
        voiceId: params.voiceId,
        guestVoiceId: params.guestVoiceId,
        voiceName: params.voiceName,
        guestVoiceName: params.guestVoiceName,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
        title: params.title,
        languageCode: params.languageCode || "en",
        estimatedLpcCost: estimation.estimatedLpcCost,
        estimatedCharacters: estimation.estimatedCharacters,
        providerUsageUnit: "character",
        providerUsageAmount: actualElevenCharactersUsed,
        providerCostUsd: settled.providerCostUsd,
        providerCostLocal: settled.providerCostLocal,
        providerCostCurrency: pricing.localCurrency,
        fxRateUsdToLocal: settled.fxRateUsdToLocal,
        effectiveProviderUsdPer1kChars: settled.effectiveProviderUsdPer1kChars,
        providerUnitSource: providerUnit.providerUnitSource,
        effectiveLocalCurrencyPerLpc: settled.effectiveLocalCurrencyPerLpc,
        effectiveLocalCurrencyPerLpcSource: effectiveLpcValue.source,
        noLossFloorLpc: settled.noLossFloorLpc,
        pricingConfigVersion: pricing.configVersion,
        estimateToFinalLpcDelta: settled.estimateToFinalLpcDelta,
        actualLpcCost,
        actualElevenCharactersUsed,
        creditSource: deductionResult?.creditSource,
        userAmountDeducted: deductionResult?.userAmountDeducted,
        orgAmountDeducted: deductionResult?.orgAmountDeducted,
        actualCharacters: script.length,
        bytes: audioBuffer.length,
        estimatedDurationSec: estimateDurationSecFromCharacters(script.length),
        hlsPackagingStatus: hlsPackaging.hlsPackagingStatus,
        hlsManifestKey: hlsPackaging.hlsManifestKey,
        hlsSegmentDirKey: hlsPackaging.hlsSegmentDirKey,
        hlsErrorMessage: hlsPackaging.hlsErrorMessage,
      };

      meta = this.getMetadata(lesson);
      const usageEvents = Array.isArray((meta as any).usageEvents) ? (meta as any).usageEvents : [];
      const used = actualElevenCharactersUsed;
      usageEvents.unshift({
        id: randomUUID(),
        stage: "audio_generation",
        createdAt: now,
        sourceType: params.sourceType,
        languageCode: params.languageCode || "en",
        versionId: params.versionId,
        elevenCharactersUsed: used,
        elevenCharacterCount: usageAfterAudio?.characterCount ?? null,
        elevenCharacterLimit: usageAfterAudio?.characterLimit ?? null,
        providerUsageUnit: "character",
        providerUsageAmount: used,
        providerCostUsd: settled.providerCostUsd,
        providerCostLocal: settled.providerCostLocal,
        providerCostCurrency: pricing.localCurrency,
        fxRateUsdToLocal: settled.fxRateUsdToLocal,
        pricingConfigVersion: pricing.configVersion,
        estimatedLpcCost: estimation.estimatedLpcCost,
        estimateToFinalLpcDelta: settled.estimateToFinalLpcDelta,
        settlementReason: settled.settlementReason,
        actualLpcCost,
        creditSource: deductionResult?.creditSource,
        errorMessage: settlementWarning || undefined,
      });
      (meta as any).usageEvents = usageEvents.slice(0, 100);
      this.addAuditArtifacts(meta, [finalAudioArtifact]);
      const existingIdx = meta.versions.findIndex((v) => v.id === params.versionId);
      if (existingIdx >= 0) {
        meta.versions[existingIdx] = version;
      } else {
        meta.versions.unshift(version);
      }
      this.setActiveVersionForLanguage(meta, params.languageCode || "en", params.versionId);
      if (meta.draft) {
        meta.draft = {
          ...meta.draft,
          currentStep: 5,
          status: "completed",
          updatedAt: now,
        };
      }
      if (meta.draft?.id) {
        const existingDrafts = Array.isArray(meta.drafts) ? meta.drafts : [];
        meta.drafts = sortDraftsByUpdatedAtDesc(
          [meta.draft, ...existingDrafts.filter((item) => item?.id && item.id !== meta.draft?.id)].filter(Boolean) as LessonPodcastDraft[]
        ).slice(0, 50);
      }
      meta.currentJob = {
        status: "completed",
        updatedAt: now,
        versionId: params.versionId,
        jobPayload: undefined,
      };

      await this.saveMetadata(lesson, meta);
    } catch (error: any) {
      const now = safeNow();
      let usageAfterFailure: any = null;
      try {
        const eleven = await ElevenLabsService.getInstance();
        usageAfterFailure = await eleven.getSubscriptionUsage();
      } catch {
        usageAfterFailure = null;
      }
      const failedVersion: LessonPodcastVersion = {
        id: params.versionId,
        storageKey: undefined,
        createdAt: now,
        updatedAt: now,
        status: "failed",
        sourceType: params.sourceType,
        format: params.format,
        duration: params.duration,
        focusTopic: params.focusTopic,
        scriptId: params.scriptId,
        voiceId: params.voiceId,
        guestVoiceId: params.guestVoiceId,
        voiceName: params.voiceName,
        guestVoiceName: params.guestVoiceName,
        hostDisplayName: params.hostDisplayName,
        guestDisplayName: params.guestDisplayName,
        title: params.title,
        languageCode: params.languageCode || "en",
        estimatedLpcCost: 0,
        estimatedCharacters: 0,
        errorMessage: error?.message || "Podcast generation failed",
      };

      meta = this.getMetadata(lesson);
      const existingIdx = meta.versions.findIndex((v) => v.id === params.versionId);
      if (existingIdx >= 0) {
        meta.versions[existingIdx] = failedVersion;
      } else {
        meta.versions.unshift(failedVersion);
      }
      meta.currentJob = {
        status: "failed",
        updatedAt: now,
        errorMessage: failedVersion.errorMessage,
        versionId: params.versionId,
        jobPayload: undefined,
      };
      if (meta.draft) {
        meta.draft = {
          ...meta.draft,
          currentStep: 5,
          status: "failed",
          updatedAt: now,
        };
      }
      if (meta.draft?.id) {
        const existingDrafts = Array.isArray(meta.drafts) ? meta.drafts : [];
        meta.drafts = sortDraftsByUpdatedAtDesc(
          [meta.draft, ...existingDrafts.filter((item) => item?.id && item.id !== meta.draft?.id)].filter(Boolean) as LessonPodcastDraft[]
        ).slice(0, 50);
      }
      const usageEvents = Array.isArray((meta as any).usageEvents) ? (meta as any).usageEvents : [];
      usageEvents.unshift({
        id: randomUUID(),
        stage: "audio_generation_failed",
        createdAt: now,
        sourceType: params.sourceType,
        languageCode: params.languageCode || "en",
        versionId: params.versionId,
        elevenCharacterCount: usageAfterFailure?.characterCount ?? null,
        elevenCharacterLimit: usageAfterFailure?.characterLimit ?? null,
        errorMessage: failedVersion.errorMessage,
      });
      const failureArtifact = await this.writeAuditFile({
        lesson,
        languageCode: params.languageCode || "en",
        versionId: params.versionId,
        scriptId: params.scriptId,
        stage: "audio_generation_failed",
        artifactType: "application/json",
        label: "Audio generation failure details",
        filename: `failure-${params.versionId}.json`,
        content: JSON.stringify({
          errorMessage: failedVersion.errorMessage,
          languageCode: params.languageCode || "en",
          versionId: params.versionId,
          sourceType: params.sourceType,
        }, null, 2),
      });
      this.addAuditArtifacts(meta, [failureArtifact]);
      (meta as any).usageEvents = usageEvents.slice(0, 100);
      await this.saveMetadata(lesson, meta);
    }
  }

  static async recoverPendingJobs(maxJobs = 20): Promise<{ recovered: number; failedMarked: number }> {
    const rows = await db
      .select()
      .from(lessons)
      .where(sql`(${lessons.metadata} -> 'podcast' -> 'currentJob' ->> 'status') = 'processing'`)
      .limit(Math.max(1, maxJobs));

    let recovered = 0;
    let failedMarked = 0;
    for (const lesson of rows) {
      const meta = this.getMetadata(lesson as Lesson);
      const payload = meta.currentJob?.jobPayload as PendingPodcastJobPayload | undefined;
      if (!payload) {
        meta.currentJob = {
          status: "failed",
          updatedAt: safeNow(),
          versionId: meta.currentJob?.versionId,
          errorMessage: "Recovered startup check: missing job payload for processing state.",
        };
        await this.saveMetadata(lesson as Lesson, meta);
        failedMarked += 1;
        continue;
      }
      const existingVersion = (meta.versions || []).find((v) => v.id === payload.versionId);
      if (isCompletedPodcastStatus(existingVersion?.status)) {
        meta.currentJob = {
          status: "completed",
          updatedAt: safeNow(),
          versionId: payload.versionId,
        };
        await this.saveMetadata(lesson as Lesson, meta);
        continue;
      }
      this.enqueueProcessingJob(payload);
      recovered += 1;
    }
    return { recovered, failedMarked };
  }

  static async setActiveVersion(lesson: Lesson, versionId: string): Promise<LessonPodcastMetadata> {
    const meta = this.getMetadata(lesson);
    const found = meta.versions.find((v) => v.id === versionId && isCompletedPodcastStatus(v.status));
    if (!found) {
      throw new Error("Podcast version not found or unavailable.");
    }
    this.setActiveVersionForLanguage(meta, found.languageCode, versionId);
    meta.currentJob = {
      status: "completed",
      updatedAt: safeNow(),
      versionId,
    };
    await this.saveMetadata(lesson, meta);
    return meta;
  }

  static async getSignedUrlForVersion(
    lesson: Lesson,
    versionId?: string,
    preferredFilename?: string
  ): Promise<{ url: string | null; version: LessonPodcastVersion | null }> {
    const meta = this.getMetadata(lesson);
    const target = versionId
      ? meta.versions.find((v) => v.id === versionId && isCompletedPodcastStatus(v.status))
      : this.getActiveVersion(meta);

    if (!target?.storageKey) {
      return { url: null, version: null };
    }

    const objectStorageService = new ObjectStorageService();
    const signedUrl = await objectStorageService.getLessonVideoSignedURL(
      target.storageKey,
      3600,
      { downloadFilename: preferredFilename }
    );
    return { url: signedUrl, version: target };
  }

  static resolveVersionForPlayback(lesson: Lesson, options?: { versionId?: string; languageCode?: string }): LessonPodcastVersion | null {
    const meta = this.getMetadata(lesson);
    const versionId = String(options?.versionId || "").trim();
    const languageCode = String(options?.languageCode || "").trim();
    if (languageCode) {
      return this.pickVersionForLanguage(meta, languageCode, versionId);
    }
    if (versionId) {
      return (meta.versions || []).find((v) => v.id === versionId && isCompletedPodcastStatus(v.status)) || null;
    }
    return this.getActiveVersion(meta);
  }

  static async ensureHlsForPlayback(
    lesson: Lesson,
    options?: { versionId?: string; languageCode?: string }
  ): Promise<LessonPodcastVersion | null> {
    const meta = this.getMetadata(lesson);
    const target = this.resolveVersionForPlayback(lesson, options);
    if (!target || !target.storageKey) return null;

    const resolvedAudioPath = resolveStoragePath(target.storageKey || "");
    const manifestExists = !!resolvedAudioPath
      && fs.existsSync(path.join(path.dirname(resolvedAudioPath), "hls", "index.m3u8"));
    if (target.hlsPackagingStatus === "ready" && manifestExists) {
      return target;
    }

    const packaging = await this.packageVersionToHls({
      storagePath: target.storageKey,
      lesson,
      versionId: target.id,
      languageCode: target.languageCode || "en",
    });

    const nextVersions = (meta.versions || []).map((version) => {
      if (version.id !== target.id) return version;
      return {
        ...version,
        updatedAt: safeNow(),
        hlsPackagingStatus: packaging.hlsPackagingStatus,
        hlsManifestKey: packaging.hlsManifestKey,
        hlsSegmentDirKey: packaging.hlsSegmentDirKey,
        hlsErrorMessage: packaging.hlsErrorMessage,
      } as LessonPodcastVersion;
    });
    meta.versions = nextVersions;
    await this.saveMetadata(lesson, meta);
    return this.resolveVersionForPlayback(lesson, options);
  }

  private static hasHlsManifestForVersion(version: LessonPodcastVersion): boolean {
    const resolvedAudioPath = resolveStoragePath(version.storageKey || "");
    if (!resolvedAudioPath || !fs.existsSync(resolvedAudioPath)) return false;
    const manifestPath = path.join(path.dirname(resolvedAudioPath), "hls", "index.m3u8");
    return fs.existsSync(manifestPath);
  }

  static async backfillHlsForCompletedVersions(options?: {
    lessonId?: string;
    organizationId?: string;
    force?: boolean;
    dryRun?: boolean;
    maxLessons?: number;
  }): Promise<PodcastHlsBackfillReport> {
    const lessonIdFilter = String(options?.lessonId || "").trim();
    const organizationIdFilter = String(options?.organizationId || "").trim();
    const force = options?.force === true;
    const dryRun = options?.dryRun === true;
    const maxLessons = Math.max(0, Number(options?.maxLessons || 0));

    const allLessons = await db.select().from(lessons);
    const report: PodcastHlsBackfillReport = {
      scannedLessons: allLessons.length,
      matchedLessons: 0,
      completedVersions: 0,
      alreadyReady: 0,
      repackaged: 0,
      failed: 0,
      skippedNoStorage: 0,
      errors: [],
    };

    const filteredLessons = allLessons.filter((lesson) => {
      if (lessonIdFilter && String(lesson.id) !== lessonIdFilter) return false;
      if (organizationIdFilter && String(lesson.organizationId) !== organizationIdFilter) return false;
      return true;
    });
    const targetLessons = maxLessons > 0 ? filteredLessons.slice(0, maxLessons) : filteredLessons;
    report.matchedLessons = targetLessons.length;

    for (const lesson of targetLessons) {
      const metadata = this.getMetadata(lesson as any);
      const completed = (metadata.versions || []).filter((version) => isCompletedPodcastStatus(version.status));
      if (completed.length === 0) continue;

      for (const version of completed) {
        report.completedVersions += 1;
        if (!version.storageKey) {
          report.skippedNoStorage += 1;
          continue;
        }

        const alreadyReady = version.hlsPackagingStatus === "ready" && this.hasHlsManifestForVersion(version);
        if (!force && alreadyReady) {
          report.alreadyReady += 1;
          continue;
        }

        if (dryRun) {
          report.repackaged += 1;
          continue;
        }

        try {
          const refreshedLesson = await this.getLesson(String(lesson.id));
          if (!refreshedLesson) {
            report.failed += 1;
            report.errors.push({
              lessonId: String(lesson.id),
              versionId: String(version.id),
              message: "Lesson not found while backfilling.",
            });
            continue;
          }

          const ensured = await this.ensureHlsForPlayback(refreshedLesson as any, {
            versionId: String(version.id),
            languageCode: String(version.languageCode || ""),
          });
          if (ensured?.hlsPackagingStatus === "ready" && this.hasHlsManifestForVersion(ensured)) {
            report.repackaged += 1;
          } else {
            report.failed += 1;
            report.errors.push({
              lessonId: String(lesson.id),
              versionId: String(version.id),
              message: String(ensured?.hlsErrorMessage || "HLS packaging did not reach ready state."),
            });
          }
        } catch (error: any) {
          report.failed += 1;
          report.errors.push({
            lessonId: String(lesson.id),
            versionId: String(version.id),
            message: String(error?.message || "Unknown HLS backfill error."),
          });
        }
      }
    }

    return report;
  }

  static getCompletedVersions(meta: LessonPodcastMetadata): LessonPodcastVersion[] {
    return (meta.versions || [])
      .filter((v) => isCompletedPodcastStatus(v.status))
      .sort((a, b) => {
        const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bt - at;
      });
  }

  static getAvailableLanguages(meta: LessonPodcastMetadata): string[] {
    return Array.from(new Set(
      this.getCompletedVersions(meta).map((v) => normalizePodcastLanguageCode(v.languageCode))
    ));
  }

  static pickVersionForLanguage(meta: LessonPodcastMetadata, languageCode: string, versionId?: string): LessonPodcastVersion | null {
    const normalizedLanguageCode = normalizePodcastLanguageCode(languageCode);
    const completed = this.getCompletedVersions(meta);
    if (versionId) {
      const exact = completed.find((v) => v.id === versionId && normalizePodcastLanguageCode(v.languageCode) === normalizedLanguageCode);
      if (exact) return exact;
    }
    const activeForLanguage = this.getActiveVersionForLanguage(meta, languageCode);
    if (activeForLanguage) return activeForLanguage;
    const byLang = completed.find((v) => normalizePodcastLanguageCode(v.languageCode) === normalizedLanguageCode);
    if (byLang) return byLang;
    if (meta.activeVersionId) {
      const active = completed.find((v) => v.id === meta.activeVersionId);
      if (active) return active;
    }
    return completed[0] || null;
  }

  static async getSignedUrlForLanguage(
    lesson: Lesson,
    languageCode: string,
    versionId?: string,
    preferredFilename?: string
  ): Promise<{ url: string | null; version: LessonPodcastVersion | null }> {
    const meta = this.getMetadata(lesson);
    const target = this.pickVersionForLanguage(meta, languageCode, versionId);
    if (!target?.storageKey) return { url: null, version: null };
    const objectStorageService = new ObjectStorageService();
    const signedUrl = await objectStorageService.getLessonVideoSignedURL(
      target.storageKey,
      3600,
      { downloadFilename: preferredFilename }
    );
    return { url: signedUrl, version: target };
  }

  static async replaceWithUploadedAudio(params: {
    lesson: Lesson;
    buffer: Buffer;
    requestedBy: string;
    filename?: string;
    title?: string;
  }): Promise<LessonPodcastMetadata> {
    const versionId = randomUUID();
    const languageCode = params.lesson.languageCode || "en";
    const audioFilename = await this.buildPodcastAudioFilename(params.lesson);
    const storageKey = buildCanonicalStorageKey({
      scope: "private",
      domain: "pod-aud",
      extension: ".mp3",
      seed: `podcast-upload:${params.lesson.organizationId}:${params.lesson.id}:${languageCode}:${versionId}:${audioFilename}`,
    });
    const storagePath = canonicalKeyToAbsolutePath(storageKey);

    await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.promises.writeFile(storagePath, params.buffer);
    const hlsPackaging = await this.packageVersionToHls({
      storagePath,
      lesson: params.lesson,
      versionId,
      languageCode,
    });

    const now = safeNow();
    const meta = this.getMetadata(params.lesson);
    const version: LessonPodcastVersion = {
      id: versionId,
      storageKey,
      createdAt: now,
      updatedAt: now,
      status: "completed",
      sourceType: "sourcedb",
      voiceId: "uploaded",
      voiceName: "Uploaded Audio",
      title: params.title || params.filename || "Uploaded Podcast Audio",
      languageCode,
      estimatedLpcCost: 0,
      estimatedCharacters: 0,
      bytes: params.buffer.length,
      estimatedDurationSec: estimateDurationSecFromCharacters(params.buffer.length / 2),
      hlsPackagingStatus: hlsPackaging.hlsPackagingStatus,
      hlsManifestKey: hlsPackaging.hlsManifestKey,
      hlsSegmentDirKey: hlsPackaging.hlsSegmentDirKey,
      hlsErrorMessage: hlsPackaging.hlsErrorMessage,
    };

    meta.versions.unshift(version);
    this.setActiveVersionForLanguage(meta, languageCode, versionId);
    meta.currentJob = {
      status: "completed",
      updatedAt: now,
      requestedBy: params.requestedBy,
      versionId,
    };

    await this.saveMetadata(params.lesson, meta);
    return meta;
  }

  static async computeEstimate(
    lesson: Lesson,
    sourceType: PodcastSourceType,
    scriptText?: string,
    sourceMaterialId?: string,
    mode: PodcastFormat = "bulletin"
  ) {
    const script = scriptText || await buildScriptFromSource(lesson, sourceType, sourceMaterialId);
    if (!script || script.length < 30) {
      throw new Error("Not enough source content found for this source type.");
    }
    const pricing = await this.getPodcastPricingConfig();
    const baseline = this.estimateFromScript(script, { mode, pricing });
    const providerUnit = this.resolveEffectiveProviderUsdPer1kChars(pricing);
    const effectiveLpc = await this.resolveEffectiveLocalCurrencyPerLpc(pricing);
    const providerAware = this.computeSettledLpcFromUsage({
      usageCharacters: baseline.estimatedCharacters,
      estimatedLpcCost: 0,
      pricing,
      effectiveProviderUsdPer1kChars: providerUnit.providerUsdPer1kChars,
      effectiveLocalCurrencyPerLpc: effectiveLpc.localCurrencyPerLpc,
    });
    return {
      ...baseline,
      estimatedLpcCost: providerAware.settledLpc,
    };
  }

  static async uploadWordSourceMaterial(params: {
    lesson: Lesson;
    buffer: Buffer;
    mimeType: string;
    originalFilename: string;
    uploadedBy?: string;
  }): Promise<{ source: LessonPodcastSourceMaterial; metadata: LessonPodcastMetadata }> {
    const isWord =
      params.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      params.mimeType === "application/msword" ||
      String(params.originalFilename || "").toLowerCase().endsWith(".docx") ||
      String(params.originalFilename || "").toLowerCase().endsWith(".doc");
    if (!isWord) {
      throw new Error("Only Word source uploads (.doc/.docx) are supported for podcast source material.");
    }

    const extraction = await DocumentExtractorService.extractText(params.buffer, params.mimeType);
    const extractedText = clampPodcastTextLength(String(extraction?.text || ""));
    if (!extractedText || extractedText.length < 30) {
      throw new Error("Uploaded document does not contain enough text for podcast script generation.");
    }

    const languageCode = params.lesson.languageCode || "en";
    const originalLower = String(params.originalFilename || "source.docx").toLowerCase();
    const extension = path.extname(originalLower) || ".docx";

    const meta = this.getMetadata(params.lesson);
    const currentSources = Array.isArray(meta.sourceMaterials) ? meta.sourceMaterials : [];
    const currentWordVersions = currentSources
      .filter((source) => source.sourceType === "word")
      .map((source) => Number(source.version || 0));
    const nextVersion = (currentWordVersions.length ? Math.max(...currentWordVersions) : 0) + 1;
    const versionBaseName = `wsrc-v${String(nextVersion).padStart(3, "0")}`;

    const storageKey = buildCanonicalStorageKey({
      scope: "private",
      domain: "pod-src",
      extension,
      seed: `podcast-source-word:${params.lesson.organizationId}:${params.lesson.id}:${languageCode}:${versionBaseName}:${params.originalFilename}`,
    });
    const storagePath = canonicalKeyToAbsolutePath(storageKey);
    await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.promises.writeFile(storagePath, params.buffer);

    const now = safeNow();
    const source: LessonPodcastSourceMaterial = {
      id: randomUUID(),
      sourceType: "word",
      version: nextVersion,
      originalFilename: params.originalFilename,
      mimeType: params.mimeType,
      storageKey,
      localFilePath: storageKey,
      extractedText,
      wordCount: extraction.wordCount || extractedText.split(/\s+/).filter(Boolean).length,
      createdAt: now,
      createdBy: params.uploadedBy,
    };

    meta.sourceMaterials = [source, ...currentSources]
      .filter((item) => item.sourceType === "word")
      .slice(0, 20);
    meta.draft = {
      ...(meta.draft || {
        sourceType: "word",
        estimatedCharacters: 0,
        estimatedLpcCost: 0,
        updatedAt: now,
      }),
      sourceType: "word",
      sourceMaterialId: source.id,
      updatedAt: now,
    };
    await this.saveMetadata(params.lesson, meta);
    return { source, metadata: meta };
  }

  static getPublicSafeState(meta: LessonPodcastMetadata) {
    const versions = (meta.versions || [])
      .filter((v) => {
        const status = String(v.status || "").trim().toLowerCase();
        return status === "completed" || status === "failed";
      })
      .map((v) => {
        const {
          hlsManifestKey: _hlsManifestKey,
          hlsSegmentDirKey: _hlsSegmentDirKey,
          ...rest
        } = v as any;
        return {
          ...rest,
          storageKey: v.storageKey ? path.basename(resolveStoragePath(v.storageKey)) : "",
        };
      });
    return {
      draft: meta.draft || null,
      drafts: sortDraftsByUpdatedAtDesc(Array.isArray(meta.drafts) ? meta.drafts : []),
      currentJob: meta.currentJob || { status: "idle", updatedAt: safeNow() },
      activeVersionId: meta.activeVersionId || null,
      activeVersionIdsByLanguage: meta.activeVersionIdsByLanguage || {},
      usageEvents: Array.isArray((meta as any).usageEvents) ? (meta as any).usageEvents : [],
      auditArtifacts: (meta.auditArtifacts || []).map((artifact) => ({
        id: artifact.id,
        createdAt: artifact.createdAt,
        languageCode: artifact.languageCode,
        versionId: artifact.versionId,
        scriptId: artifact.scriptId,
        stage: artifact.stage,
        artifactType: artifact.artifactType,
        label: artifact.label,
        bytes: artifact.bytes,
      })),
      scripts: (meta.scripts || []).map((script) => ({
        id: script.id,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        sourceType: script.sourceType,
        sourceMaterialId: script.sourceMaterialId,
        format: script.format,
        duration: script.duration,
        focusTopic: script.focusTopic,
        voiceId: script.voiceId,
        guestVoiceId: script.guestVoiceId,
        hostDisplayName: script.hostDisplayName,
        guestDisplayName: script.guestDisplayName,
        estimatedCharacters: script.estimatedCharacters,
        estimatedLpcCost: script.estimatedLpcCost,
        sourceScriptId: script.sourceScriptId,
        languageCode: script.languageCode || "en",
        hasRawResponse: !!script.aiRawResponse,
        hasSegments: Array.isArray(script.scriptSegments) && script.scriptSegments.length > 0,
      })),
      sourceMaterials: (meta.sourceMaterials || []).map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        version: source.version,
        originalFilename: source.originalFilename,
        mimeType: source.mimeType,
        wordCount: source.wordCount,
        createdAt: source.createdAt,
      })),
      versions,
    };
  }

  static async selectDraft(params: { lesson: Lesson; draftId: string }): Promise<LessonPodcastMetadata> {
    const meta = this.getMetadata(params.lesson);
    const drafts = Array.isArray(meta.drafts) ? meta.drafts : [];
    const selected = drafts.find((draft) => String(draft?.id || "").trim() === String(params.draftId || "").trim());
    if (!selected) {
      throw new Error("Draft not found.");
    }
    meta.draft = { ...selected, status: "idle", updatedAt: safeNow() };
    meta.currentJob = { status: "idle", updatedAt: safeNow() };
    await this.saveMetadata(params.lesson, meta);
    return meta;
  }

  static async deleteDraft(params: { lesson: Lesson; draftId: string }): Promise<LessonPodcastMetadata> {
    const meta = this.getMetadata(params.lesson);
    const drafts = Array.isArray(meta.drafts) ? meta.drafts : [];
    const targetId = String(params.draftId || "").trim();
    const nextDrafts = drafts.filter((draft) => String(draft?.id || "").trim() !== targetId);
    meta.drafts = nextDrafts;
    if (String(meta.draft?.id || "").trim() === targetId) {
      meta.draft = sortDraftsByUpdatedAtDesc(nextDrafts)[0];
      meta.currentJob = { status: "idle", updatedAt: safeNow() };
    }
    await this.saveMetadata(params.lesson, meta);
    return meta;
  }
}
