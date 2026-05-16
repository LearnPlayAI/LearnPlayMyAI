import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  lessonContentVersions,
  lessonPresentationVersions,
} from "@shared/schema";
import { db } from "../db";
import { LessonService } from "./lessonService";
import { ObjectStorageService } from "../objectStorage";
import { DocumentExtractorService } from "./documentExtractor";
import { LessonPodcastService } from "./lessonPodcastService";

export type LessonSourceType = "manual_topic" | "sourcedb" | "pptx" | "word" | "podcast";

export type LessonSourceSelection = {
  sourceType: LessonSourceType;
  versionRef?: string;
  languageCode?: string;
};

export type LessonSourceOption = {
  id: string;
  sourceType: LessonSourceType;
  versionRef: string;
  label: string;
  createdAt: string | null;
  languageCode: string;
  isActive: boolean;
  wordCount: number;
  description: string;
};

export type LessonSourceContract = {
  sourceType: LessonSourceType;
  versionRef: string;
  label: string;
  languageCode: string;
  createdAt: string | null;
  contentLength: number;
  contentHash: string;
  resolverVersion: string;
  selectedAt?: string;
  selectedBy?: string | null;
  warning?: string;
};

export type ResolvedLessonSource = {
  sourceType: LessonSourceType;
  versionRef: string;
  label: string;
  content: string | null;
  languageCode: string;
  createdAt: string | null;
  warning?: string;
};

const RESOLVER_VERSION = "v1";

function normalizeText(input: unknown): string {
  return String(input || "").trim();
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fallbackIso(...values: unknown[]): string | null {
  for (const value of values) {
    const iso = toIso(value);
    if (iso) return iso;
  }
  return null;
}

function buildContentHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function formatTranscriptForPrompt(transcript: any): string {
  const allSlides = Array.isArray(transcript?.slides) ? transcript.slides : [];
  if (allSlides.length === 0) return "";

  return allSlides
    .map((slide: any, index: number) => {
      const slideTitle = normalizeText(slide?.title);
      const slideText = normalizeText(slide?.text || slide?.content || slide?.body);
      return `[Slide ${index + 1}]${slideTitle ? ` ${slideTitle}` : ""}\n${slideText}`;
    })
    .join("\n\n");
}

async function resolveSourceDbContent(params: {
  lessonId: string;
  organizationId: string;
  versionRef?: string;
}): Promise<ResolvedLessonSource> {
  const lesson = await LessonService.getLessonById(params.lessonId, params.organizationId);
  if (!lesson) throw new Error("Lesson not found");

  const rawVersionRef = normalizeText(params.versionRef || "current").toLowerCase();
  const lessonLanguage = normalizeText(lesson.languageCode || "en") || "en";

  const versions = await db
    .select({
      id: lessonContentVersions.id,
      versionNumber: lessonContentVersions.versionNumber,
      previousContent: lessonContentVersions.previousContent,
      newContent: lessonContentVersions.newContent,
      createdAt: lessonContentVersions.createdAt,
    })
    .from(lessonContentVersions)
    .where(eq(lessonContentVersions.lessonId, params.lessonId))
    .orderBy(desc(lessonContentVersions.createdAt));

  const versionsAsc = [...versions].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.versionNumber || 0) - Number(b.versionNumber || 0);
  });

  const firstHistorical = versionsAsc[0];
  const initialText = firstHistorical
    ? normalizeText(firstHistorical.previousContent) || normalizeText(firstHistorical.newContent) || normalizeText(lesson.inputText)
    : normalizeText(lesson.inputText);
  const currentText = normalizeText(lesson.inputText) || normalizeText(versions[0]?.newContent);

  if (rawVersionRef === "initial") {
    return {
      sourceType: "sourcedb",
      versionRef: "initial",
      label: "Source DB - Initial Version",
      content: initialText || null,
      languageCode: lessonLanguage,
      createdAt: fallbackIso(firstHistorical?.createdAt, lesson.createdAt, lesson.updatedAt),
    };
  }

  if (rawVersionRef === "current") {
    return {
      sourceType: "sourcedb",
      versionRef: "current",
      label: "Source DB - Current Version",
      content: currentText || null,
      languageCode: lessonLanguage,
      createdAt: fallbackIso(lesson.updatedAt, lesson.createdAt),
    };
  }

  if (rawVersionRef.startsWith("content:")) {
    const contentVersionId = rawVersionRef.slice("content:".length).trim();
    const selected = versions.find((v) => v.id === contentVersionId);
    if (!selected) {
      throw new Error("Selected Source DB version was not found");
    }
    const selectedText = normalizeText(selected.newContent) || normalizeText(selected.previousContent);
    return {
      sourceType: "sourcedb",
      versionRef: `content:${selected.id}`,
      label: `Source DB - Version ${selected.versionNumber}`,
      content: selectedText || null,
      languageCode: lessonLanguage,
      createdAt: fallbackIso(selected.createdAt),
    };
  }

  throw new Error("Invalid Source DB version selection");
}

async function resolvePptxContent(params: {
  lessonId: string;
  organizationId: string;
  versionRef?: string;
}): Promise<ResolvedLessonSource> {
  const lesson = await LessonService.getLessonById(params.lessonId, params.organizationId);
  if (!lesson) throw new Error("Lesson not found");

  const rawVersionRef = normalizeText(params.versionRef || "current").toLowerCase();
  const lessonLanguage = normalizeText(lesson.languageCode || "en") || "en";

  if (rawVersionRef === "current") {
    const transcript = await LessonService.getLessonTranscript(params.lessonId, params.organizationId);
    const promptText = formatTranscriptForPrompt(transcript?.transcript || transcript);
    return {
      sourceType: "pptx",
      versionRef: "current",
      label: "PPTX - Current Version",
      content: promptText || null,
      languageCode: lessonLanguage,
      createdAt: fallbackIso(lesson.updatedAt, lesson.createdAt),
      warning: lesson.transcriptStatus === "processing"
        ? "PPTX transcript is still processing. Quiz/objective quality may be lower until extraction completes."
        : undefined,
    };
  }

  if (!rawVersionRef.startsWith("pptx:")) {
    throw new Error("Invalid PPTX version selection");
  }

  const versionId = rawVersionRef.slice("pptx:".length).trim();
  const [version] = await db
    .select({
      id: lessonPresentationVersions.id,
      version: lessonPresentationVersions.version,
      storageKey: lessonPresentationVersions.storageKey,
      createdAt: lessonPresentationVersions.createdAt,
    })
    .from(lessonPresentationVersions)
    .where(
      and(
        eq(lessonPresentationVersions.id, versionId),
        eq(lessonPresentationVersions.lessonId, params.lessonId),
        sql`COALESCE(${lessonPresentationVersions.languageCode}, 'en') = ${lessonLanguage}`
      )
    )
    .limit(1);

  if (!version?.storageKey) {
    throw new Error("Selected PPTX version was not found");
  }

  const objectStorage = new ObjectStorageService();
  const buffer = await objectStorage.downloadLessonPPTXBuffer(version.storageKey);
  const { PptxExtractor } = await import("./pptxExtractor");
  const extractor = new PptxExtractor();
  const transcript = await extractor.extractFromBuffer(buffer);
  const promptText = formatTranscriptForPrompt(transcript);

  return {
    sourceType: "pptx",
    versionRef: `pptx:${version.id}`,
    label: `PPTX - Version ${version.version}`,
    content: promptText || null,
    languageCode: lessonLanguage,
    createdAt: fallbackIso(version.createdAt),
  };
}

async function resolveWordSourceContent(params: {
  lessonId: string;
  organizationId: string;
}): Promise<ResolvedLessonSource> {
  const lesson = await LessonService.getLessonById(params.lessonId, params.organizationId);
  if (!lesson) throw new Error("Lesson not found");
  if (!lesson.sourceDocumentPath) {
    throw new Error("No Word source document is available for this lesson");
  }

  const lessonLanguage = normalizeText(lesson.languageCode || "en") || "en";
  const objectStorage = new ObjectStorageService();
  const sourceBuffer = await objectStorage.downloadSourceDocument(lesson.sourceDocumentPath);
  const extracted = await DocumentExtractorService.extractTextFromDocx(sourceBuffer);
  return {
    sourceType: "word",
    versionRef: "word:latest",
    label: "Word Document - Latest",
    content: normalizeText(extracted?.text) || null,
    languageCode: lessonLanguage,
    createdAt: fallbackIso(lesson.updatedAt, lesson.createdAt),
  };
}

async function resolvePodcastScriptContent(params: {
  lessonId: string;
  organizationId: string;
  versionRef?: string;
}): Promise<ResolvedLessonSource> {
  const lesson = await LessonService.getLessonById(params.lessonId, params.organizationId);
  if (!lesson) throw new Error("Lesson not found");

  const rawVersionRef = normalizeText(params.versionRef || "active").toLowerCase();
  const lessonLanguage = normalizeText(lesson.languageCode || "en") || "en";
  const meta = LessonPodcastService.getMetadata(lesson as any);
  const completed = (meta.versions || []).filter((v: any) => v?.status === "completed");
  if (completed.length === 0) {
    throw new Error("No completed podcast versions are available for this lesson");
  }

  let selectedVersion: any | undefined;
  if (rawVersionRef === "active") {
    selectedVersion = completed.find((v: any) => v.id === meta.activeVersionId) || completed[0];
  } else if (rawVersionRef.startsWith("podcast:")) {
    const versionId = rawVersionRef.slice("podcast:".length).trim();
    selectedVersion = completed.find((v: any) => v.id === versionId);
  }

  if (!selectedVersion) {
    throw new Error("Selected podcast version was not found");
  }

  const scriptId = normalizeText(selectedVersion.scriptId);
  const script = (meta.scripts || []).find((item: any) => item.id === scriptId);
  const scriptText = normalizeText(script?.text);
  if (!scriptText) {
    throw new Error("Selected podcast version has no script text available");
  }

  return {
    sourceType: "podcast",
    versionRef: `podcast:${selectedVersion.id}`,
    label: `Podcast Script - Version ${String(selectedVersion.id || "").slice(0, 8)}`,
    content: scriptText,
    languageCode: normalizeText(selectedVersion.languageCode || lessonLanguage) || lessonLanguage,
    createdAt: fallbackIso(selectedVersion.createdAt, lesson.updatedAt, lesson.createdAt),
  };
}

export async function resolveLessonSourceSelection(params: {
  lessonId: string;
  organizationId: string;
  selection: LessonSourceSelection;
  allowManualTopic?: boolean;
}): Promise<ResolvedLessonSource> {
  const sourceType = params.selection?.sourceType;
  if (!sourceType) {
    throw new Error("Source selection is required");
  }

  switch (sourceType) {
    case "manual_topic": {
      if (!params.allowManualTopic) {
        throw new Error("Manual topic mode is not allowed for this action");
      }
      const lesson = await LessonService.getLessonById(params.lessonId, params.organizationId);
      if (!lesson) throw new Error("Lesson not found");
      const lessonLanguage = normalizeText(lesson.languageCode || "en") || "en";
      return {
        sourceType,
        versionRef: "manual_topic",
        label: "Manual Topic",
        content: null,
        languageCode: lessonLanguage,
        createdAt: null,
      };
    }
    case "sourcedb":
      return resolveSourceDbContent({
        lessonId: params.lessonId,
        organizationId: params.organizationId,
        versionRef: params.selection.versionRef,
      });
    case "pptx":
      return resolvePptxContent({
        lessonId: params.lessonId,
        organizationId: params.organizationId,
        versionRef: params.selection.versionRef,
      });
    case "word":
      return resolveWordSourceContent({
        lessonId: params.lessonId,
        organizationId: params.organizationId,
      });
    case "podcast":
      return resolvePodcastScriptContent({
        lessonId: params.lessonId,
        organizationId: params.organizationId,
        versionRef: params.selection.versionRef,
      });
    default:
      throw new Error("Unsupported source selection");
  }
}

export async function getLessonSourceOptions(params: {
  lessonId: string;
  organizationId: string;
  includeManualTopic?: boolean;
}): Promise<{
  lessonId: string;
  languageCode: string;
  defaultSelection: LessonSourceSelection;
  options: LessonSourceOption[];
}> {
  const lesson = await LessonService.getLessonById(params.lessonId, params.organizationId);
  if (!lesson) throw new Error("Lesson not found");

  const lessonLanguage = normalizeText(lesson.languageCode || "en") || "en";
  const options: LessonSourceOption[] = [];

  const contentVersions = await db
    .select({
      id: lessonContentVersions.id,
      versionNumber: lessonContentVersions.versionNumber,
      previousContent: lessonContentVersions.previousContent,
      newContent: lessonContentVersions.newContent,
      createdAt: lessonContentVersions.createdAt,
    })
    .from(lessonContentVersions)
    .where(eq(lessonContentVersions.lessonId, params.lessonId))
    .orderBy(desc(lessonContentVersions.createdAt));

  const versionsAsc = [...contentVersions].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.versionNumber || 0) - Number(b.versionNumber || 0);
  });

  const firstHistorical = versionsAsc[0];
  const initialText = firstHistorical
    ? normalizeText(firstHistorical.previousContent) || normalizeText(firstHistorical.newContent) || normalizeText(lesson.inputText)
    : normalizeText(lesson.inputText);
  const currentText = normalizeText(lesson.inputText) || normalizeText(contentVersions[0]?.newContent);

  if (initialText) {
    options.push({
      id: `source-initial-${params.lessonId}`,
      sourceType: "sourcedb",
      versionRef: "initial",
      label: "Source DB - Initial Version",
      createdAt: fallbackIso(firstHistorical?.createdAt, lesson.createdAt, lesson.updatedAt),
      languageCode: lessonLanguage,
      isActive: false,
      wordCount: initialText.split(/\s+/).filter(Boolean).length,
      description: "First saved Source DB content for this lesson language.",
    });
  }

  if (currentText) {
    options.push({
      id: `source-current-${params.lessonId}`,
      sourceType: "sourcedb",
      versionRef: "current",
      label: "Source DB - Current Version (Active)",
      createdAt: fallbackIso(lesson.updatedAt, lesson.createdAt),
      languageCode: lessonLanguage,
      isActive: true,
      wordCount: currentText.split(/\s+/).filter(Boolean).length,
      description: "Current active Source DB content used by the lesson.",
    });
  }

  contentVersions.forEach((version) => {
    const versionText = normalizeText(version.newContent) || normalizeText(version.previousContent);
    options.push({
      id: `source-content-${version.id}`,
      sourceType: "sourcedb",
      versionRef: `content:${version.id}`,
      label: `Source DB - Version ${version.versionNumber}`,
      createdAt: fallbackIso(version.createdAt),
      languageCode: lessonLanguage,
      isActive: false,
      wordCount: versionText ? versionText.split(/\s+/).filter(Boolean).length : 0,
      description: "Saved Source DB historical version.",
    });
  });

  const presentationVersions = await db
    .select({
      id: lessonPresentationVersions.id,
      version: lessonPresentationVersions.version,
      createdAt: lessonPresentationVersions.createdAt,
    })
    .from(lessonPresentationVersions)
    .where(
      and(
        eq(lessonPresentationVersions.lessonId, params.lessonId),
        sql`COALESCE(${lessonPresentationVersions.languageCode}, 'en') = ${lessonLanguage}`
      )
    )
    .orderBy(desc(lessonPresentationVersions.version));

  const currentPresentationVersion = Number(lesson.currentSlideVersion || 0);
  presentationVersions.forEach((version) => {
    options.push({
      id: `pptx-${version.id}`,
      sourceType: "pptx",
      versionRef: `pptx:${version.id}`,
      label: `PPTX - Version ${version.version}${version.version === currentPresentationVersion ? " (Active)" : ""}`,
      createdAt: fallbackIso(version.createdAt, lesson.updatedAt, lesson.createdAt),
      languageCode: lessonLanguage,
      isActive: version.version === currentPresentationVersion,
      wordCount: 0,
      description: "Presentation file version for transcript-based generation.",
    });
  });

  if (lesson.sourceDocumentPath) {
    options.push({
      id: `word-latest-${params.lessonId}`,
      sourceType: "word",
      versionRef: "word:latest",
      label: "Word Document - Latest",
      createdAt: fallbackIso(lesson.updatedAt, lesson.createdAt),
      languageCode: lessonLanguage,
      isActive: false,
      wordCount: 0,
      description: "Latest uploaded lesson source document.",
    });
  }

  const podcastMeta = LessonPodcastService.getMetadata(lesson);
  const podcastCompleted = (podcastMeta.versions || []).filter((v: any) => v?.status === "completed");
  podcastCompleted.forEach((version: any) => {
    options.push({
      id: `podcast-${version.id}`,
      sourceType: "podcast",
      versionRef: `podcast:${version.id}`,
      label: `Podcast Script - Version ${String(version.id || "").slice(0, 8)}${version.id === podcastMeta.activeVersionId ? " (Active)" : ""}`,
      createdAt: fallbackIso(version.createdAt, lesson.updatedAt, lesson.createdAt),
      languageCode: normalizeText(version.languageCode || lessonLanguage) || lessonLanguage,
      isActive: version.id === podcastMeta.activeVersionId,
      wordCount: 0,
      description: "Podcast script text extracted from a completed podcast version.",
    });
  });

  if (params.includeManualTopic) {
    options.push({
      id: "manual-topic",
      sourceType: "manual_topic",
      versionRef: "manual_topic",
      label: "Manual Topic Only",
      createdAt: null,
      languageCode: lessonLanguage,
      isActive: false,
      wordCount: 0,
      description: "Do not use lesson source text; generate from topic criteria only.",
    });
  }

  const defaultSelection =
    options.find((option) => option.sourceType === "sourcedb" && option.versionRef === "current") ||
    options.find((option) => option.sourceType === "pptx" && option.isActive) ||
    options.find((option) => option.sourceType === "word") ||
    options.find((option) => option.sourceType === "podcast" && option.isActive) ||
    options.find((option) => option.sourceType === "manual_topic") ||
    null;

  return {
    lessonId: params.lessonId,
    languageCode: lessonLanguage,
    defaultSelection: defaultSelection
      ? {
          sourceType: defaultSelection.sourceType,
          versionRef: defaultSelection.versionRef,
          languageCode: defaultSelection.languageCode,
        }
      : { sourceType: "manual_topic", versionRef: "manual_topic", languageCode: lessonLanguage },
    options,
  };
}

export function buildSourceContract(params: {
  resolved: ResolvedLessonSource;
  content: string;
  selectedAt?: string;
  selectedBy?: string | null;
}): LessonSourceContract {
  const content = normalizeText(params.content);
  return {
    sourceType: params.resolved.sourceType,
    versionRef: params.resolved.versionRef,
    label: params.resolved.label,
    languageCode: params.resolved.languageCode,
    createdAt: params.resolved.createdAt,
    contentLength: content.length,
    contentHash: buildContentHash(content),
    resolverVersion: RESOLVER_VERSION,
    selectedAt: params.selectedAt,
    selectedBy: params.selectedBy,
    warning: params.resolved.warning,
  };
}
