// @ts-nocheck
import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";
import { createHash, randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "../db";
import * as schema from "@shared/schema";
import { resolveStoragePath } from "../utils/uploadPaths";
import {
  COURSE_TRANSFER_PACKAGE_VERSION,
  EXCLUDED_ENTITY_TABLES,
  INCLUDED_ENTITY_TABLES,
  OPTIONAL_ENTITY_TABLES,
  assertChecksum,
  computeChecksumsForDirectory,
  deepRewriteObject,
  decryptProtectedTransferPackageIfNeeded,
  extractZipSafely,
  filterIncludedTables,
  remapIdsForBundle,
  rewriteFileReferencesInRecord,
  validateExtractedPackageLayout,
  validateManifestOrThrow,
  writeProtectedTransferPackage,
} from "./courseTransferUtils";
import {
  authorizeCourseTransferExport,
  unwrapCourseTransferDataKeyForImport,
} from "./courseTransferAuthorityService";
import { buildCanonicalStorageKey, normalizeExtension } from "../utils/storageKeyManager";
import { PptxHtmlConverterService } from "./pptxHtmlConverterService";

const PACKAGE_ROOT = path.join(os.tmpdir(), "learnplay-course-transfer");

const FILE_REFERENCE_FIELD_HINTS = [
  "thumbnailUrl",
  "storageKey",
  "sourceDocumentPath",
  "generationParamsKey",
  "videoStorageKey",
  "transcriptKey",
  "imageKey",
  "originalStoragePath",
  "filePath",
  "localFilePath",
  "relativePath",
  "hlsManifestKey",
  "hlsSegmentDirKey",
] as const;

const INFORMATIONAL_FILE_REFERENCE_KEYS = [
  "packagePath",
] as const;

const INTERNAL_DOCUMENT_PACKAGE_ROOTS = [
  "_rels/",
  "docprops/",
  "ppt/",
  "word/",
  "xl/",
] as const;

const TABLE_IMPORT_ORDER = [
  "courses",
  "courseFrameworks",
  "lessons",
  "quizCollections",
  "courseLessons",
  "quizCards",
  "lessonSlides",
  "lessonPresentationVersions",
  "lessonContentVersions",
  "lessonVersions",
  "lessonQuizLinks",
  "courseSourceDocuments",
  "courseSourceAssets",
  "courseSourceAssetLinks",
  "quizCollectionVersions",
  "quizCardVersions",
  "courseVersions",
  "courseTags",
] as const;

type TransferPhase =
  | "validating"
  | "collecting_metadata"
  | "collecting_files"
  | "packaging"
  | "finalizing"
  | "extracting"
  | "rewriting_files"
  | "importing_data"
  | "converting_slide_images"
  | "completed"
  | "failed";

type TransferJob = {
  id: string;
  type: "export" | "import";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  progress: number;
  phase: TransferPhase;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
  userId: string;
  courseId?: string;
  cancelRequested?: boolean;
  error?: string;
  details?: any;
  downloadPath?: string;
};

type ExportSelectionOptions = {
  includeArtifacts?: boolean;
  failOnMissingArtifacts?: boolean;
  selectedArtifactPaths?: string[];
};

type ImportRunOptions = {
  mode?: "create_new" | "merge_append_versions";
  targetCourseId?: string | null;
};

type CourseTransferImportPlan = {
  mode: "create_new" | "merge_append_versions";
  organizationId: string;
  userId: string;
  importedCourseId: string;
  sourceCourse: any;
  rows: Record<string, any[]>;
};

type MergeExistingIdSets = {
  courses: Set<string>;
  lessons: Set<string>;
  quizCollections: Set<string>;
  quizCards: Set<string>;
};

type ImportCourseMatch = {
  id: string;
  title: string;
  languageCode: string | null;
  status: string | null;
  contentGroupId?: string | null;
  matchReason?: string;
  matchConfidence?: number;
  createdAt?: any;
  updatedAt?: any;
};

type FileExportEntry = {
  sourcePath: string;
  packagePath: string;
  sha256: string;
  sizeBytes: number;
  sourceRootPath?: string;
  relativeSourcePath?: string;
  originalSourcePath?: string;
  sourceStorageClass?: string;
  artifactKind?: string;
  targetStorageStrategy?: "rewrite_to_target_upload_root";
};

type ExportArtifactIssue = {
  sourcePath: string;
  reason: string;
};

type ExportArtifactSummary = {
  discovered: string[];
  selected: string[];
  exportedFileCount: number;
  exportedBytes: number;
  missing: ExportArtifactIssue[];
};

type CourseFamilySummary = {
  courseCount: number;
  versionCount: number;
  translationCount: number;
  languageCodes: string[];
  lessonCount: number;
  quizCount: number;
};

const transferJobs = new Map<string, TransferJob>();

function nowIso() {
  return new Date().toISOString();
}

function createJob(input: {
  type: "export" | "import";
  organizationId: string;
  userId: string;
  courseId?: string;
}): TransferJob {
  const job: TransferJob = {
    id: randomUUID(),
    type: input.type,
    status: "queued",
    progress: 0,
    phase: "validating",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    organizationId: input.organizationId,
    userId: input.userId,
    courseId: input.courseId,
  };
  transferJobs.set(job.id, job);
  return job;
}

function updateJob(jobId: string, patch: Partial<TransferJob>) {
  const current = transferJobs.get(jobId);
  if (!current) return;
  transferJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  });
}

function throwIfCanceled(jobId: string): void {
  const job = transferJobs.get(jobId);
  if (job?.cancelRequested) {
    const error: any = new Error("Transfer canceled by user");
    error.code = "JOB_CANCELED";
    throw error;
  }
}

function hashStable(input: string): string {
  return createHash("sha1").update(String(input || "")).digest("hex").slice(0, 16);
}

function shortPackageLeaf(sourcePath: string, fallbackExt = ".bin"): string {
  const ext = (path.extname(sourcePath || "") || fallbackExt).toLowerCase();
  const token = hashStable(sourcePath || randomUUID());
  return `f-${token}${ext}`;
}

function looksLikeFileReferenceKey(key: string): boolean {
  const normalized = String(key || "").trim();
  if (!normalized) return false;
  if ((FILE_REFERENCE_FIELD_HINTS as readonly string[]).includes(normalized)) return true;
  return /(key|path|file|manifest|directory|dir)$/i.test(normalized);
}

function isProbablyStoragePath(value: any): value is string {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  ) {
    return false;
  }
  if (trimmed.startsWith("/private/") || trimmed.startsWith("private/")) return true;
  if (trimmed.startsWith("/public/") || trimmed.startsWith("public/")) return true;
  if (trimmed.includes("/uploads/private/") || trimmed.includes("/uploads/public/")) return true;
  if (trimmed.startsWith("/opt/") && trimmed.includes("/uploads/")) return true;
  if (/^[a-zA-Z0-9._/-]+\.(pptx|docx|doc|pdf|json|mp4|mp3|m3u8|m4s|ts|png|jpg|jpeg|webp)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function isInternalDocumentPackagePath(value: string): boolean {
  const normalized = String(value || "").replace(/\\/g, "/").trim().toLowerCase();
  if (!normalized || normalized.startsWith("/") || normalized.includes("/uploads/")) return false;
  if (normalized === "[content_types].xml") return true;
  return (INTERNAL_DOCUMENT_PACKAGE_ROOTS as readonly string[]).some((prefix) => normalized.startsWith(prefix));
}

function isExportableArtifactReference(key: string, value: string): boolean {
  const normalizedKey = String(key || "").trim();
  if ((INFORMATIONAL_FILE_REFERENCE_KEYS as readonly string[]).includes(normalizedKey)) {
    return false;
  }
  if (isInternalDocumentPackagePath(value)) {
    return false;
  }
  return looksLikeFileReferenceKey(normalizedKey) && isProbablyStoragePath(value);
}

function classifyStoragePath(sourcePath: string): string {
  const normalized = String(sourcePath || "").replace(/\\/g, "/");
  if (normalized.includes("/uploads/private/") || normalized.startsWith("/private/") || normalized.startsWith("private/")) {
    return "private_upload";
  }
  if (normalized.includes("/uploads/public/") || normalized.startsWith("/public/") || normalized.startsWith("public/")) {
    return "public_upload";
  }
  if (normalized.startsWith("/opt/learnplay/")) {
    return "learnplay_runtime_upload";
  }
  if (path.posix.isAbsolute(normalized)) {
    return "absolute_filesystem";
  }
  return "relative_upload";
}

function classifyArtifactKind(sourcePath: string): string {
  const lower = String(sourcePath || "").toLowerCase();
  if (lower.endsWith(".m3u8") || lower.includes("/hls/")) return "hls";
  if (/\.(mp4|webm|mov)$/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a)$/.test(lower)) return "audio";
  if (/\.(pptx|ppt)$/.test(lower)) return "presentation";
  if (/\.(docx|doc|pdf)$/.test(lower)) return "source_document";
  if (/\.(png|jpg|jpeg|webp|gif|svg)$/.test(lower)) return "image";
  if (/\.(json|txt|md)$/.test(lower)) return "metadata";
  return "binary";
}

function buildCourseFamilySummary(bundle: Record<string, any[]>): CourseFamilySummary {
  const courses = Array.isArray(bundle.courses) ? bundle.courses : [];
  const languageCodes = Array.from(
    new Set([
      ...courses.map((row) => normalizeLanguageCode(row.languageCode || "en")),
      ...(bundle.lessons || []).map((row) => normalizeLanguageCode(row.languageCode || "en")),
      ...(bundle.lessonVersions || []).map((row) => normalizeLanguageCode(row.languageCode || "en")),
      ...(bundle.lessonPresentationVersions || []).map((row) => normalizeLanguageCode(row.languageCode || "en")),
      ...(bundle.quizCollections || []).map((row) => normalizeLanguageCode(row.languageCode || "en")),
    ].filter(Boolean))
  ).sort();
  const versionCount =
    (bundle.courseVersions || []).length +
    (bundle.lessonVersions || []).length +
    (bundle.lessonPresentationVersions || []).length +
    (bundle.lessonContentVersions || []).length +
    (bundle.quizCollectionVersions || []).length +
    (bundle.quizCardVersions || []).length;

  return {
    courseCount: courses.length,
    versionCount,
    translationCount: Math.max(0, languageCodes.length - 1),
    languageCodes,
    lessonCount: (bundle.lessons || []).length,
    quizCount: (bundle.quizCollections || []).length,
  };
}

function mergeRowsById<T extends Record<string, any>>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const id = String(row?.id || "");
    if (!id || byId.has(id)) continue;
    byId.set(id, row);
  }
  return Array.from(byId.values());
}

function collectContentGroupIds(rows: any[]): string[] {
  return Array.from(
    new Set(
      (rows || [])
        .map((row) => String(row?.contentGroupId || "").trim())
        .filter(Boolean)
    )
  );
}

function sanitizeFileName(name: string): string {
  return String(name || "file").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function isIsoDateLike(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function normalizeTemporalColumns<T extends Record<string, any>>(row: T): T {
  const next: Record<string, any> = { ...row };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== "string") continue;
    const keyLooksTemporal = key.endsWith("At") || key.endsWith("Date");
    if (!keyLooksTemporal) continue;
    if (!isIsoDateLike(value)) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      next[key] = parsed;
    }
  }
  return next as T;
}

function buildImportStoragePath(params: {
  organizationId: string;
  courseId: string;
  sourcePath: string;
  importBatchId?: string;
  sourceRootPath?: string;
  relativeSourcePath?: string;
}): string {
  const ext = normalizeExtension(path.extname(params.sourcePath || "")) || ".bin";
  return buildCanonicalStorageKey({
    scope: "private",
    domain: "cti",
    extension: ext,
    seed: [
      "course-transfer-import",
      params.organizationId,
      params.courseId,
      params.importBatchId || "batch",
      params.sourceRootPath || "",
      params.relativeSourcePath || "",
      params.sourcePath || "",
      randomUUID(),
    ].join(":"),
  });
}

function buildImportDirectoryRoot(params: {
  organizationId: string;
  courseId: string;
  sourceRootPath: string;
  importBatchId?: string;
}): string {
  return buildCanonicalStorageKey({
    scope: "private",
    domain: "cti",
    seed: [
      "course-transfer-import-directory",
      params.organizationId,
      params.courseId,
      params.importBatchId || "batch",
      params.sourceRootPath || "",
      randomUUID(),
    ].join(":"),
  });
}

function sanitizeRelativeArtifactPath(input: string): string {
  const raw = String(input || "").replace(/\\/g, "/").trim();
  if (!raw || path.posix.isAbsolute(raw)) {
    throw new Error(`Unsafe artifact relative path: ${input}`);
  }
  const segments = raw.split("/").filter(Boolean);
  if (!segments.length || segments.includes("..")) {
    throw new Error(`Unsafe artifact relative path: ${input}`);
  }
  const normalized = path.posix.normalize(raw).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe artifact relative path: ${input}`);
  }
  return normalized;
}

function collectStringFileReferences(input: any, acc: Set<string>, pathStack: string[] = []) {
  if (Array.isArray(input)) {
    for (const item of input) collectStringFileReferences(item, acc, pathStack);
    return;
  }
  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const nextPath = [...pathStack, key];
      if (typeof value === "string" && isExportableArtifactReference(key, value)) {
        acc.add(value);
      } else {
        collectStringFileReferences(value, acc, nextPath);
      }
    }
  }
}

function sourceAssetIdsFromLessonMetadata(input: any): string[] {
  const refs = Array.isArray(input?.sourceAssets) ? input.sourceAssets : [];
  return Array.from(
    new Set(
      refs
        .map((ref: any) => String(ref?.assetId || ref?.id || "").trim())
        .filter(Boolean)
    )
  );
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      out.push(abs);
    }
  }
  await walk(rootDir);
  return out;
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function zipDirectory(params: {
  sourceDir: string;
  outputZipPath: string;
}): Promise<void> {
  await fs.promises.mkdir(path.dirname(params.outputZipPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(params.outputZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", resolve);
    out.on("error", reject);
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(params.sourceDir, false);
    archive.finalize().catch(reject);
  });
}

async function ensureCourseExportAccess(courseId: string, organizationId: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, courseId), eq(schema.courses.organizationId, organizationId)))
    .limit(1);

  if (!course) {
    throw new Error("Course not found or not accessible for this organization");
  }

  return course;
}

async function collectCourseBundle(courseId: string): Promise<Record<string, any[]>> {
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
  if (!course) throw new Error("Course not found");

  const siblingCourses = course.contentGroupId
    ? await db
        .select()
        .from(schema.courses)
        .where(and(eq(schema.courses.organizationId, course.organizationId), eq(schema.courses.contentGroupId, course.contentGroupId)))
    : [course];
  const siblingCourseIds = Array.from(new Set(siblingCourses.map((row) => row.id).filter(Boolean)));

  const courseFrameworks = siblingCourseIds.length
    ? await db.select().from(schema.courseFrameworks).where(inArray(schema.courseFrameworks.courseId, siblingCourseIds))
    : [];
  const courseLessons = siblingCourseIds.length
    ? await db.select().from(schema.courseLessons).where(inArray(schema.courseLessons.courseId, siblingCourseIds))
    : [];
  const directLessonIds = Array.from(new Set(courseLessons.map((row) => row.lessonId).filter(Boolean)));

  const directLessons = directLessonIds.length
    ? await db.select().from(schema.lessons).where(inArray(schema.lessons.id, directLessonIds))
    : [];
  const lessonContentGroupIds = Array.from(new Set([
    ...collectContentGroupIds(directLessons),
    ...directLessonIds,
  ].filter(Boolean)));
  const translatedLessons = lessonContentGroupIds.length
    ? await db.select().from(schema.lessons).where(inArray(schema.lessons.contentGroupId, lessonContentGroupIds))
    : [];
  const lessons = mergeRowsById([...directLessons, ...translatedLessons]);
  const lessonIds = Array.from(new Set(lessons.map((row) => row.id).filter(Boolean)));

  const lessonSlides = lessonIds.length
    ? await db.select().from(schema.lessonSlides).where(inArray(schema.lessonSlides.lessonId, lessonIds))
    : [];
  const lessonPresentationVersions = lessonIds.length
    ? await db.select().from(schema.lessonPresentationVersions).where(inArray(schema.lessonPresentationVersions.lessonId, lessonIds))
    : [];
  const lessonContentVersions = lessonIds.length
    ? await db.select().from(schema.lessonContentVersions).where(inArray(schema.lessonContentVersions.lessonId, lessonIds))
    : [];
  const lessonVersions = lessonIds.length
    ? await db.select().from(schema.lessonVersions).where(inArray(schema.lessonVersions.lessonId, lessonIds))
    : [];
  const lessonQuizLinks = lessonIds.length
    ? await db.select().from(schema.lessonQuizLinks).where(inArray(schema.lessonQuizLinks.lessonId, lessonIds))
    : [];

  const directQuizIds = Array.from(new Set([
    ...lessonQuizLinks.map((row) => row.quizId),
    ...courseLessons.map((row) => row.primaryQuizId),
    ...lessons.map((row) => row.relatedQuizId),
  ].filter(Boolean)));

  const directQuizCollections = directQuizIds.length
    ? await db.select().from(schema.quizCollections).where(inArray(schema.quizCollections.id, directQuizIds))
    : [];
  const quizContentGroupIds = Array.from(new Set([
    ...collectContentGroupIds(directQuizCollections),
    ...directQuizIds,
  ].filter(Boolean)));
  const translatedQuizCollections = quizContentGroupIds.length
    ? await db.select().from(schema.quizCollections).where(inArray(schema.quizCollections.contentGroupId, quizContentGroupIds))
    : [];
  const allQuizCollections = mergeRowsById([...directQuizCollections, ...translatedQuizCollections]);
  const quizIds = Array.from(new Set(allQuizCollections.map((row) => row.id).filter(Boolean)));

  const quizCollections = allQuizCollections;
  const quizCards = quizIds.length
    ? await db.select().from(schema.quizCards).where(inArray(schema.quizCards.collectionId, quizIds))
    : [];

  const cardIds = Array.from(new Set(quizCards.map((row) => row.id).filter(Boolean)));

  const quizCollectionVersions = quizIds.length
    ? await db.select().from(schema.quizCollectionVersions).where(inArray(schema.quizCollectionVersions.collectionId, quizIds))
    : [];
  const quizCardVersions = cardIds.length
    ? await db.select().from(schema.quizCardVersions).where(inArray(schema.quizCardVersions.cardId, cardIds))
    : [];

  const courseVersions = siblingCourseIds.length
    ? await db.select().from(schema.courseVersions).where(inArray(schema.courseVersions.courseId, siblingCourseIds))
    : [];
  const courseTags = siblingCourseIds.length
    ? await db.select().from(schema.courseTags).where(inArray(schema.courseTags.courseId, siblingCourseIds))
    : [];

  const metadataSourceAssetIds = Array.from(
    new Set(
      lessons.flatMap((lesson: any) => sourceAssetIdsFromLessonMetadata(lesson.metadata || {}))
    )
  );
  const quizSourceAssetStorageKeys = Array.from(
    new Set(
      quizCards
        .map((card: any) => String(card.imageKey || "").trim())
        .filter((key) => key.includes("/source-asset/") || key.includes("/source-assets/"))
    )
  );

  const courseSourceDocumentsByCourse = siblingCourseIds.length
    ? await db.select().from(schema.courseSourceDocuments).where(inArray(schema.courseSourceDocuments.courseId, siblingCourseIds))
    : [];
  const sourceDocIdsByCourse = courseSourceDocumentsByCourse.map((row) => row.id).filter(Boolean);
  const courseSourceAssetsByCourse = sourceDocIdsByCourse.length
    ? await db.select().from(schema.courseSourceAssets).where(inArray(schema.courseSourceAssets.sourceDocumentId, sourceDocIdsByCourse))
    : [];

  const extraCourseSourceAssetsById = metadataSourceAssetIds.length
    ? await db.select().from(schema.courseSourceAssets).where(inArray(schema.courseSourceAssets.id, metadataSourceAssetIds))
    : [];
  const extraCourseSourceAssetsByStorageKey = quizSourceAssetStorageKeys.length
    ? await db.select().from(schema.courseSourceAssets).where(inArray(schema.courseSourceAssets.storageKey, quizSourceAssetStorageKeys))
    : [];
  const courseSourceAssets = mergeRowsById([
    ...courseSourceAssetsByCourse,
    ...extraCourseSourceAssetsById,
    ...extraCourseSourceAssetsByStorageKey,
  ]);
  const courseSourceAssetIds = Array.from(new Set(courseSourceAssets.map((row) => row.id).filter(Boolean)));
  const sourceDocumentIds = Array.from(new Set([
    ...sourceDocIdsByCourse,
    ...courseSourceAssets.map((row) => row.sourceDocumentId).filter(Boolean),
  ]));
  const extraCourseSourceDocuments = sourceDocumentIds.length
    ? await db.select().from(schema.courseSourceDocuments).where(inArray(schema.courseSourceDocuments.id, sourceDocumentIds))
    : [];
  const courseSourceDocuments = mergeRowsById([
    ...courseSourceDocumentsByCourse,
    ...extraCourseSourceDocuments,
  ]);

  const linkedEntityIds = Array.from(new Set([
    ...siblingCourseIds,
    ...lessonIds,
    ...quizIds,
    ...cardIds,
  ].filter(Boolean)));
  const sourceLinksByAsset = courseSourceAssetIds.length
    ? await db.select().from(schema.courseSourceAssetLinks).where(inArray(schema.courseSourceAssetLinks.assetId, courseSourceAssetIds))
    : [];
  const sourceLinksByEntity = linkedEntityIds.length
    ? await db.select().from(schema.courseSourceAssetLinks).where(inArray(schema.courseSourceAssetLinks.linkedEntityId, linkedEntityIds))
    : [];
  const courseSourceAssetLinks = mergeRowsById([
    ...sourceLinksByAsset,
    ...sourceLinksByEntity,
  ]).filter((row) => courseSourceAssetIds.includes(row.assetId));

  return {
    courses: siblingCourses,
    courseFrameworks,
    courseLessons,
    lessons,
    lessonSlides,
    lessonPresentationVersions,
    lessonContentVersions,
    lessonVersions,
    lessonQuizLinks,
    quizCollections,
    quizCards,
    quizCollectionVersions,
    quizCardVersions,
    courseVersions,
    courseTags,
    courseSourceDocuments,
    courseSourceAssets,
    courseSourceAssetLinks,
  };
}

function selectArtifactPaths(params: {
  discovered: Set<string>;
  selectedArtifactPaths?: string[];
}): string[] {
  const discovered = Array.from(params.discovered.values());
  const requested = Array.isArray(params.selectedArtifactPaths)
    ? params.selectedArtifactPaths.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!requested.length) return discovered;
  const include = new Set(requested);
  return discovered.filter((item) => include.has(item));
}

async function discoverCourseArtifacts(bundle: Record<string, any[]>): Promise<string[]> {
  const refs = new Set<string>();
  collectStringFileReferences(bundle, refs);
  for (const ref of Array.from(refs.values())) {
    const storageKey = String(ref || "").trim();
    if (!storageKey.toLowerCase().endsWith(".pptx")) continue;
    const slidesDir = PptxHtmlConverterService.getSlidesDir(storageKey);
    if (fs.existsSync(slidesDir)) {
      refs.add(slidesDir);
    }
  }
  return Array.from(refs.values()).sort();
}

async function writeExportPackage(params: {
  bundle: Record<string, any[]>;
  course: any;
  jobId: string;
  userId: string;
  options?: ExportSelectionOptions;
}): Promise<{ zipPath: string; manifest: any; packageDir: string; artifactSummary: ExportArtifactSummary }> {
  const packageDir = path.join(PACKAGE_ROOT, params.jobId, "payload");
  await fs.promises.mkdir(path.join(packageDir, "data"), { recursive: true });
  await fs.promises.mkdir(path.join(packageDir, "files"), { recursive: true });

  const includedBundle = filterIncludedTables(params.bundle);
  for (const [tableName, rows] of Object.entries(includedBundle)) {
    await fs.promises.writeFile(
      path.join(packageDir, "data", `${tableName}.json`),
      JSON.stringify(rows, null, 2),
      "utf-8"
    );
  }

  const includeArtifacts = params.options?.includeArtifacts !== false;
  const failOnMissingArtifacts = params.options?.failOnMissingArtifacts !== false;
  const discoveredArtifacts = includeArtifacts ? await discoverCourseArtifacts(includedBundle) : [];
  const selectedArtifacts = includeArtifacts
    ? selectArtifactPaths({
        discovered: new Set(discoveredArtifacts),
        selectedArtifactPaths: params.options?.selectedArtifactPaths,
      })
    : [];
  const pptxSlideDirSourceMap = new Map<string, string>();
  for (const sourcePath of selectedArtifacts) {
    if (!String(sourcePath || "").toLowerCase().endsWith(".pptx")) continue;
    const slidesDir = PptxHtmlConverterService.getSlidesDir(sourcePath);
    if (selectedArtifacts.includes(slidesDir)) {
      pptxSlideDirSourceMap.set(slidesDir, sourcePath);
    }
  }

  const fileEntries: FileExportEntry[] = [];
  const missingArtifacts: ExportArtifactIssue[] = [];
  let exportedBytes = 0;

  for (const sourcePath of selectedArtifacts) {
    throwIfCanceled(params.jobId);

    try {
      const resolvedPath = resolveStoragePath(sourcePath);
      const stat = await fs.promises.stat(resolvedPath).catch(() => null);

      if (!stat) {
        missingArtifacts.push({ sourcePath, reason: "file_or_directory_not_found" });
        continue;
      }

      if (stat.isDirectory()) {
        const files = await listFilesRecursively(resolvedPath);
        if (!files.length) {
          missingArtifacts.push({ sourcePath, reason: "directory_is_empty" });
          continue;
        }
        const sourceRootPath = sourcePath;
        for (const absFilePath of files) {
          const relFromRoot = path.relative(resolvedPath, absFilePath).replace(/\\/g, "/");
          const digest = await sha256File(absFilePath);
          const fileStat = await fs.promises.stat(absFilePath);
          const relExt = path.extname(relFromRoot || "") || ".bin";
          const shortLeaf = `d-${hashStable(`${sourceRootPath}/${relFromRoot}`)}${relExt.toLowerCase()}`;
          const packagePath = path.posix.join("files", hashStable(sourceRootPath), shortLeaf);
          const fullPath = path.join(packageDir, packagePath);
          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.promises.copyFile(absFilePath, fullPath);
          exportedBytes += fileStat.size;
          fileEntries.push({
            sourcePath: path.posix.join(sourcePath.replace(/\\/g, "/"), relFromRoot).replace(/\/+/g, "/"),
            packagePath,
            sha256: digest,
            sizeBytes: fileStat.size,
            sourceRootPath,
            relativeSourcePath: relFromRoot,
            originalSourcePath: path.posix.join(sourcePath.replace(/\\/g, "/"), relFromRoot).replace(/\/+/g, "/"),
            associatedPptxStorageKey: pptxSlideDirSourceMap.get(sourcePath),
            sourceStorageClass: classifyStoragePath(sourcePath),
            artifactKind: classifyArtifactKind(relFromRoot),
            targetStorageStrategy: "rewrite_to_target_upload_root",
          });
        }
        continue;
      }

      const digest = await sha256File(resolvedPath);
      const statSafe = await fs.promises.stat(resolvedPath);
      const packagePath = path.posix.join("files", hashStable(sourcePath), shortPackageLeaf(sourcePath, ".bin"));
      const fullPath = path.join(packageDir, packagePath);
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.copyFile(resolvedPath, fullPath);
      exportedBytes += statSafe.size;
      fileEntries.push({
        sourcePath,
        packagePath,
        sha256: digest,
        sizeBytes: statSafe.size,
        originalSourcePath: sourcePath,
        sourceStorageClass: classifyStoragePath(sourcePath),
        artifactKind: classifyArtifactKind(sourcePath),
        targetStorageStrategy: "rewrite_to_target_upload_root",
      });
    } catch (error) {
      missingArtifacts.push({
        sourcePath,
        reason: `export_failed:${String(error?.message || error || "unknown")}`,
      });
    }
  }

  if (missingArtifacts.length) {
    console.warn(`[CourseTransfer] Missing artifacts detected during export`, missingArtifacts);
    if (failOnMissingArtifacts) {
      throw new Error(
        `Export blocked: ${missingArtifacts.length} selected artifact(s) could not be packaged.`
      );
    }
  }

  const checksums = await computeChecksumsForDirectory(packageDir);
  const familySummary = buildCourseFamilySummary(includedBundle);

  const manifest = {
    packageVersion: COURSE_TRANSFER_PACKAGE_VERSION,
    sourceAppVersion: process.env.npm_package_version || "unknown",
    exportedAt: nowIso(),
    sourceCourse: {
      id: params.course.id,
      title: params.course.title,
      language: params.course.languageCode || "en",
      contentGroupId: params.course.contentGroupId || undefined,
      org: {
        id: params.course.organizationId,
      },
    },
    compatibility: {
      minPackageVersion: "1.0.0",
    },
    include: [...INCLUDED_ENTITY_TABLES],
    exclude: [...EXCLUDED_ENTITY_TABLES],
    files: fileEntries,
    checksums,
    familySummary,
    clonePolicy: {
      fullFamily: true,
      importDefaultMode: "create_new",
      importedCourseStatus: "draft",
      targetOrgResolution: "authenticated_or_impersonated",
    },
    artifactPortability: {
      packageContainsSelectedArtifacts: includeArtifacts,
      targetStorageStrategy: "rewrite_to_target_upload_root",
      originalPathsAreInformational: true,
    },
    selection: {
      includeArtifacts,
      selectedArtifactCount: selectedArtifacts.length,
      failOnMissingArtifacts,
    },
    artifactSummary: {
      discoveredCount: discoveredArtifacts.length,
      selectedCount: selectedArtifacts.length,
      missingCount: missingArtifacts.length,
      exportedBytes,
    },
  };

  await fs.promises.writeFile(path.join(packageDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  await fs.promises.writeFile(path.join(packageDir, "checksums.json"), JSON.stringify(checksums, null, 2), "utf-8");

  const rawZipPath = path.join(PACKAGE_ROOT, params.jobId, `course-${params.course.id}-payload.zip`);
  await zipDirectory({ sourceDir: packageDir, outputZipPath: rawZipPath });

  const zipPath = path.join(PACKAGE_ROOT, params.jobId, `course-${params.course.id}-export.zip`);
  const transferAuthorization = await authorizeCourseTransferExport({
    organizationId: params.course.organizationId,
    courseId: params.course.id,
    userId: params.userId,
    manifestSummary: {
      sourceCourseId: params.course.id,
      sourceCourseTitle: params.course.title,
      exportedAt: manifest.exportedAt,
      familySummary,
    },
  });
  await writeProtectedTransferPackage({
    rawZipPath,
    outputZipPath: zipPath,
    sourceContext: transferAuthorization.sourceContext,
    exportAuthorization: transferAuthorization.exportAuthorization,
    transferPublicKeyPem: transferAuthorization.transferPublicKeyPem,
    manifestSummary: {
      sourceCourseId: params.course.id,
      sourceCourseTitle: params.course.title,
      sourceOrganizationId: params.course.organizationId,
    },
  });

  return {
    zipPath,
    manifest,
    packageDir,
    artifactSummary: {
      discovered: discoveredArtifacts,
      selected: selectedArtifacts,
      exportedFileCount: fileEntries.length,
      exportedBytes,
      missing: missingArtifacts,
    },
  };
}

async function parseTransferPackageFromZip(zipPath: string): Promise<{
  workDir: string;
  manifest: any;
  dataBundle: Record<string, any[]>;
}> {
  const packageZip = await decryptProtectedTransferPackageIfNeeded({
    zipPath,
    unwrapDataKey: unwrapCourseTransferDataKeyForImport,
  });
  const { outputDir } = await extractZipSafely({ zipPath: packageZip.zipPath });
  if (packageZip.cleanupDir) {
    try {
      await fs.promises.rm(packageZip.cleanupDir, { recursive: true, force: true });
    } catch {
      // The extracted payload is authoritative after this point.
    }
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Package missing required manifest.json");
  }

  const manifestRaw = JSON.parse(await fs.promises.readFile(manifestPath, "utf-8"));
  const manifest = validateManifestOrThrow(manifestRaw);

  const checksumsPath = path.join(outputDir, "checksums.json");
  const declaredChecksums: Record<string, string> = fs.existsSync(checksumsPath)
    ? JSON.parse(await fs.promises.readFile(checksumsPath, "utf-8"))
    : manifest.checksums || {};

  for (const [relPath, expected] of Object.entries(declaredChecksums)) {
    const abs = path.join(outputDir, relPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Package integrity check failed; missing file: ${relPath}`);
    }
    assertChecksum({ expected, filePath: abs, label: relPath });
  }

  validateExtractedPackageLayout({
    extractedDir: outputDir,
    manifest,
    enforceChecksums: false,
  });

  const dataBundle: Record<string, any[]> = {};
  const optionalTables = new Set(OPTIONAL_ENTITY_TABLES as readonly string[]);
  for (const table of INCLUDED_ENTITY_TABLES) {
    const filePath = path.join(outputDir, "data", `${table}.json`);
    if (!fs.existsSync(filePath) && optionalTables.has(table)) {
      dataBundle[table] = [];
      continue;
    }
    dataBundle[table] = JSON.parse(await fs.promises.readFile(filePath, "utf-8"));
    if (!Array.isArray(dataBundle[table])) {
      throw new Error(`Invalid data payload for table ${table}; expected array`);
    }
  }

  return { workDir: outputDir, manifest, dataBundle: filterIncludedTables(dataBundle) };
}

function normalizeImportedBundleForInsert(params: {
  bundle: Record<string, any[]>;
  organizationId: string;
  userId: string;
  filePathMap: Record<string, string>;
  idMap: Record<string, string>;
}): Record<string, any[]> {
  const rewritten = deepRewriteObject(params.bundle, {
    idMap: {},
    filePathMap: params.filePathMap,
  });

  rewritten.courses = (rewritten.courses || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    organizationId: params.organizationId,
    createdBy: params.userId,
    status: "draft",
    visibility: row.visibility === "public" ? "org_only" : row.visibility,
    unitId: null,
    subUnitId: null,
    teamId: null,
    categoryId: null,
    sourceVersionCourseId: null,
    cloneMapping: null,
    contentGroupId: row.contentGroupId ? params.idMap[row.contentGroupId] || params.idMap[row.id] : params.idMap[row.id],
    averageRating: "0.00",
    totalRatings: 0,
  }));

  rewritten.courseFrameworks = (rewritten.courseFrameworks || []).map((row: any) => {
    const rewrittenRow = deepRewriteObject(row, { idMap: params.idMap, filePathMap: params.filePathMap });
    return {
      ...rewrittenRow,
      id: params.idMap[row.id],
      courseId: params.idMap[row.courseId],
      organizationId: params.organizationId,
    };
  });

  rewritten.lessons = (rewritten.lessons || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    organizationId: params.organizationId,
    createdBy: params.userId,
    publishedBy: null,
    isPublished: false,
    viewCount: 0,
    completionCount: 0,
    relatedQuizId: row.relatedQuizId ? params.idMap[row.relatedQuizId] || null : null,
    activeLessonVersionId: row.activeLessonVersionId ? params.idMap[row.activeLessonVersionId] || null : null,
    contentGroupId: row.contentGroupId ? params.idMap[row.contentGroupId] || params.idMap[row.id] : params.idMap[row.id],
  }));

  rewritten.courseLessons = (rewritten.courseLessons || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    courseId: params.idMap[row.courseId],
    lessonId: params.idMap[row.lessonId],
    primaryQuizId: row.primaryQuizId ? params.idMap[row.primaryQuizId] || null : null,
  }));

  rewritten.quizCollections = (rewritten.quizCollections || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    organizationId: params.organizationId,
    createdBy: params.userId,
    contentGroupId: row.contentGroupId ? params.idMap[row.contentGroupId] || params.idMap[row.id] : params.idMap[row.id],
  }));

  rewritten.quizCards = (rewritten.quizCards || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    collectionId: params.idMap[row.collectionId],
  }));

  rewritten.lessonSlides = (rewritten.lessonSlides || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    lessonId: params.idMap[row.lessonId],
  }));

  rewritten.lessonPresentationVersions = (rewritten.lessonPresentationVersions || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    lessonId: params.idMap[row.lessonId],
    createdBy: params.userId,
  }));

  rewritten.lessonContentVersions = (rewritten.lessonContentVersions || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    lessonId: params.idMap[row.lessonId],
    createdBy: params.userId,
  }));

  rewritten.lessonVersions = (rewritten.lessonVersions || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    lessonId: params.idMap[row.lessonId],
    organizationId: params.organizationId,
    editedBy: params.userId,
    publishedBy: params.userId,
    relatedQuizId: row.relatedQuizId ? params.idMap[row.relatedQuizId] || null : null,
    lessonSnapshot: deepRewriteObject(row.lessonSnapshot || {}, {
      idMap: params.idMap,
      filePathMap: params.filePathMap,
    }),
  }));

  rewritten.lessonQuizLinks = (rewritten.lessonQuizLinks || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    lessonId: params.idMap[row.lessonId],
    quizId: params.idMap[row.quizId],
  }));

  rewritten.quizCollectionVersions = (rewritten.quizCollectionVersions || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    collectionId: params.idMap[row.collectionId],
    organizationId: params.organizationId,
    editedBy: params.userId,
    collectionSnapshot: deepRewriteObject(row.collectionSnapshot || {}, {
      idMap: params.idMap,
      filePathMap: params.filePathMap,
    }),
  }));

  rewritten.quizCardVersions = (rewritten.quizCardVersions || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    cardId: params.idMap[row.cardId],
    collectionId: params.idMap[row.collectionId],
    editedBy: params.userId,
    cardSnapshot: deepRewriteObject(row.cardSnapshot || {}, {
      idMap: params.idMap,
      filePathMap: params.filePathMap,
    }),
  }));

  rewritten.courseVersions = (rewritten.courseVersions || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    courseId: params.idMap[row.courseId],
    previousVersionId: row.previousVersionId ? params.idMap[row.previousVersionId] || null : null,
  }));

  rewritten.courseTags = (rewritten.courseTags || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    organizationId: params.organizationId,
    courseId: params.idMap[row.courseId],
  }));

  rewritten.courseSourceDocuments = (rewritten.courseSourceDocuments || []).map((row: any) => {
    const rewrittenPaths = rewriteFileReferencesInRecord(row, params.filePathMap);
    return {
      ...rewrittenPaths,
      id: params.idMap[row.id],
      organizationId: params.organizationId,
      createdBy: params.userId,
      draftId: null,
      draftDocumentId: null,
      courseId: row.courseId ? params.idMap[row.courseId] || null : null,
      originalStoragePath: rewriteFileReferencesInRecord({ originalStoragePath: row.originalStoragePath }, params.filePathMap).originalStoragePath,
    };
  });

  rewritten.courseSourceAssets = (rewritten.courseSourceAssets || []).map((row: any) => ({
    ...rewriteFileReferencesInRecord(row, params.filePathMap),
    id: params.idMap[row.id],
    sourceDocumentId: params.idMap[row.sourceDocumentId],
    organizationId: params.organizationId,
  }));

  rewritten.courseSourceAssetLinks = (rewritten.courseSourceAssetLinks || []).map((row: any) => ({
    ...row,
    id: params.idMap[row.id],
    organizationId: params.organizationId,
    assetId: params.idMap[row.assetId],
    linkedEntityId: params.idMap[row.linkedEntityId] || row.linkedEntityId,
    createdBy: params.userId,
  }));

  return rewritten;
}

async function copyImportedFiles(params: {
  extractedDir: string;
  manifest: any;
  organizationId: string;
  targetCourseId: string;
  jobId: string;
}): Promise<{ filePathMap: Record<string, string>; copiedPaths: string[]; copiedRoots: string[] }> {
  const filePathMap: Record<string, string> = {};
  const copiedPaths: string[] = [];
  const copiedRoots = new Set<string>();
  const directoryRootMap = new Map<string, string>();
  const importBatchId = params.jobId;

  const manifestFiles = [...(params.manifest.files || [])].sort((a: any, b: any) => {
    const aDependsOnImportedPptx = String(a?.associatedPptxStorageKey || "").trim() ? 1 : 0;
    const bDependsOnImportedPptx = String(b?.associatedPptxStorageKey || "").trim() ? 1 : 0;
    return aDependsOnImportedPptx - bDependsOnImportedPptx;
  });

  for (const file of manifestFiles) {
    throwIfCanceled(params.jobId);
    const sourceAbs = path.join(params.extractedDir, file.packagePath);
    if (!fs.existsSync(sourceAbs)) {
      throw new Error(`Missing package binary: ${file.packagePath}`);
    }
    const srcRoot = file.sourceRootPath ? String(file.sourceRootPath).replace(/\\/g, "/") : "";
    const relNorm = file.relativeSourcePath ? sanitizeRelativeArtifactPath(String(file.relativeSourcePath)) : "";
    let newPath: string;
    if (srcRoot && relNorm) {
      let targetRoot = directoryRootMap.get(srcRoot);
      if (!targetRoot) {
        const associatedPptxStorageKey = String(file.associatedPptxStorageKey || "").trim();
        const importedPptxStorageKey = associatedPptxStorageKey ? filePathMap[associatedPptxStorageKey] : "";
        targetRoot = importedPptxStorageKey
          ? PptxHtmlConverterService.getSlidesDir(importedPptxStorageKey)
          : buildImportDirectoryRoot({
              organizationId: params.organizationId,
              courseId: params.targetCourseId,
              sourceRootPath: srcRoot,
              importBatchId,
            });
        directoryRootMap.set(srcRoot, targetRoot);
        copiedRoots.add(resolveStoragePath(targetRoot));
        filePathMap[srcRoot] = targetRoot;
      }
      newPath = path.posix.join(targetRoot, relNorm);
    } else {
      newPath = buildImportStoragePath({
        organizationId: params.organizationId,
        courseId: params.targetCourseId,
        sourcePath: file.sourcePath,
        importBatchId,
        sourceRootPath: file.sourceRootPath,
        relativeSourcePath: file.relativeSourcePath,
      });
    }
    const absTarget = resolveStoragePath(newPath);
    await fs.promises.mkdir(path.dirname(absTarget), { recursive: true });
    await fs.promises.copyFile(sourceAbs, absTarget);
    filePathMap[file.sourcePath] = newPath;
    copiedPaths.push(absTarget);
  }

  return { filePathMap, copiedPaths, copiedRoots: Array.from(copiedRoots.values()) };
}

function collectImportedPptxStorageKeys(plan: CourseTransferImportPlan): string[] {
  const keys = new Set<string>();
  const collect = (value: any) => {
    const storageKey = String(value || "").trim();
    if (storageKey.toLowerCase().endsWith(".pptx")) {
      keys.add(storageKey);
    }
  };

  for (const row of plan.rows.lessons || []) collect(row.storageKey);
  for (const row of plan.rows.lessonPresentationVersions || []) collect(row.storageKey);
  for (const row of plan.rows.lessonVersions || []) collect(row.storageKey);
  return Array.from(keys);
}

async function preconvertImportedPptxSlideImages(params: {
  importPlan: CourseTransferImportPlan;
  jobId: string;
}): Promise<{
  available: boolean;
  reason?: string;
  attempted: number;
  ready: number;
  failed: Array<{ storageKey: string; error: string }>;
}> {
  const storageKeys = collectImportedPptxStorageKeys(params.importPlan);
  const summary = {
    available: true,
    reason: undefined as string | undefined,
    attempted: storageKeys.length,
    ready: 0,
    failed: [] as Array<{ storageKey: string; error: string }>,
  };

  if (storageKeys.length === 0) {
    return summary;
  }

  const support = await PptxHtmlConverterService.checkSlideImageConversionAvailable();
  if (!support.available) {
    return {
      ...summary,
      available: false,
      reason: support.reason || "Slide image conversion dependencies are unavailable",
    };
  }

  for (const storageKey of storageKeys) {
    throwIfCanceled(params.jobId);
    try {
      const existing = await PptxHtmlConverterService.slideImagesExist(storageKey);
      if (existing.exists && existing.slideCount > 0) {
        summary.ready += 1;
        continue;
      }
      const result = await PptxHtmlConverterService.convertPptxToSlides(storageKey);
      if (result.success && (result.slideCount || 0) > 0) {
        summary.ready += 1;
      } else {
        summary.failed.push({
          storageKey,
          error: result.error || "Slide conversion completed without slide images",
        });
      }
    } catch (error: any) {
      summary.failed.push({
        storageKey,
        error: error?.message || "Slide conversion failed",
      });
    }
  }

  return summary;
}

async function cleanupFiles(pathsToDelete: string[]) {
  for (const filePath of pathsToDelete) {
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // ignore
    }
  }
}

async function cleanupDirectories(pathsToDelete: string[]) {
  for (const dirPath of pathsToDelete) {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function retainExistingIds(tx: any, table: any, ids: Set<string>): Promise<Set<string>> {
  const input = Array.from(ids).filter(Boolean);
  if (!input.length) return new Set<string>();
  const rows = await tx.select({ id: table.id }).from(table).where(inArray(table.id, input));
  return new Set(rows.map((row: any) => String(row.id || "")).filter(Boolean));
}

async function hardenImportedBundleForeignKeysForInsert(tx: any, bundle: Record<string, any[]>): Promise<void> {
  const idsInBundle = (table: string) => new Set((bundle[table] || []).map((row: any) => String(row.id || "")).filter(Boolean));
  const courseIds = idsInBundle("courses");
  const lessonIds = idsInBundle("lessons");
  const quizCollectionIds = idsInBundle("quizCollections");
  const quizCardIds = idsInBundle("quizCards");
  const sourceDocumentIds = idsInBundle("courseSourceDocuments");
  const sourceAssetIds = idsInBundle("courseSourceAssets");

  const referencedCourseIds = new Set<string>();
  const referencedLessonIds = new Set<string>();
  const referencedQuizCollectionIds = new Set<string>();
  const referencedQuizCardIds = new Set<string>();
  const referencedSourceDocumentIds = new Set<string>();
  const referencedSourceAssetIds = new Set<string>();

  const collect = (set: Set<string>, value: unknown) => {
    const normalized = String(value || "").trim();
    if (normalized) set.add(normalized);
  };

  for (const row of bundle.courseFrameworks || []) collect(referencedCourseIds, row.courseId);
  for (const row of bundle.courseLessons || []) {
    collect(referencedCourseIds, row.courseId);
    collect(referencedLessonIds, row.lessonId);
    collect(referencedQuizCollectionIds, row.primaryQuizId);
  }
  for (const row of bundle.lessons || []) collect(referencedQuizCollectionIds, row.relatedQuizId);
  for (const row of bundle.quizCards || []) collect(referencedQuizCollectionIds, row.collectionId);
  for (const row of bundle.lessonSlides || []) collect(referencedLessonIds, row.lessonId);
  for (const row of bundle.lessonPresentationVersions || []) collect(referencedLessonIds, row.lessonId);
  for (const row of bundle.lessonContentVersions || []) collect(referencedLessonIds, row.lessonId);
  for (const row of bundle.lessonVersions || []) collect(referencedLessonIds, row.lessonId);
  for (const row of bundle.lessonQuizLinks || []) {
    collect(referencedLessonIds, row.lessonId);
    collect(referencedQuizCollectionIds, row.quizId);
  }
  for (const row of bundle.quizCollectionVersions || []) collect(referencedQuizCollectionIds, row.collectionId);
  for (const row of bundle.quizCardVersions || []) {
    collect(referencedQuizCardIds, row.cardId);
    collect(referencedQuizCollectionIds, row.collectionId);
  }
  for (const row of bundle.courseVersions || []) collect(referencedCourseIds, row.courseId);
  for (const row of bundle.courseTags || []) collect(referencedCourseIds, row.courseId);
  for (const row of bundle.courseSourceDocuments || []) collect(referencedCourseIds, row.courseId);
  for (const row of bundle.courseSourceAssets || []) {
    collect(referencedSourceDocumentIds, row.sourceDocumentId);
  }
  for (const row of bundle.courseSourceAssetLinks || []) {
    collect(referencedSourceAssetIds, row.assetId);
  }

  const externalCourseIds = new Set(Array.from(referencedCourseIds).filter((id) => !courseIds.has(id)));
  const externalLessonIds = new Set(Array.from(referencedLessonIds).filter((id) => !lessonIds.has(id)));
  const externalQuizCollectionIds = new Set(Array.from(referencedQuizCollectionIds).filter((id) => !quizCollectionIds.has(id)));
  const externalQuizCardIds = new Set(Array.from(referencedQuizCardIds).filter((id) => !quizCardIds.has(id)));
  const externalSourceDocumentIds = new Set(Array.from(referencedSourceDocumentIds).filter((id) => !sourceDocumentIds.has(id)));
  const externalSourceAssetIds = new Set(Array.from(referencedSourceAssetIds).filter((id) => !sourceAssetIds.has(id)));

  const existingCourseIds = await retainExistingIds(tx, schema.courses, externalCourseIds);
  const existingLessonIds = await retainExistingIds(tx, schema.lessons, externalLessonIds);
  const existingQuizCollectionIds = await retainExistingIds(tx, schema.quizCollections, externalQuizCollectionIds);
  const existingQuizCardIds = await retainExistingIds(tx, schema.quizCards, externalQuizCardIds);
  const existingSourceDocumentIds = await retainExistingIds(tx, schema.courseSourceDocuments, externalSourceDocumentIds);
  const existingSourceAssetIds = await retainExistingIds(tx, schema.courseSourceAssets, externalSourceAssetIds);

  const hasCourse = (id: unknown) => {
    const value = String(id || "").trim();
    return !!value && (courseIds.has(value) || existingCourseIds.has(value));
  };
  const hasLesson = (id: unknown) => {
    const value = String(id || "").trim();
    return !!value && (lessonIds.has(value) || existingLessonIds.has(value));
  };
  const hasQuizCollection = (id: unknown) => {
    const value = String(id || "").trim();
    return !!value && (quizCollectionIds.has(value) || existingQuizCollectionIds.has(value));
  };
  const hasQuizCard = (id: unknown) => {
    const value = String(id || "").trim();
    return !!value && (quizCardIds.has(value) || existingQuizCardIds.has(value));
  };
  const hasSourceDocument = (id: unknown) => {
    const value = String(id || "").trim();
    return !!value && (sourceDocumentIds.has(value) || existingSourceDocumentIds.has(value));
  };
  const hasSourceAsset = (id: unknown) => {
    const value = String(id || "").trim();
    return !!value && (sourceAssetIds.has(value) || existingSourceAssetIds.has(value));
  };

  bundle.courseFrameworks = (bundle.courseFrameworks || []).filter((row: any) => hasCourse(row.courseId));
  bundle.courseLessons = (bundle.courseLessons || [])
    .filter((row: any) => hasCourse(row.courseId) && hasLesson(row.lessonId))
    .map((row: any) => ({
      ...row,
      primaryQuizId: row.primaryQuizId && hasQuizCollection(row.primaryQuizId) ? row.primaryQuizId : null,
    }));
  bundle.lessons = (bundle.lessons || []).map((row: any) => ({
    ...row,
    relatedQuizId: row.relatedQuizId && hasQuizCollection(row.relatedQuizId) ? row.relatedQuizId : null,
  }));
  bundle.quizCards = (bundle.quizCards || []).filter((row: any) => hasQuizCollection(row.collectionId));
  bundle.lessonSlides = (bundle.lessonSlides || []).filter((row: any) => hasLesson(row.lessonId));
  bundle.lessonPresentationVersions = (bundle.lessonPresentationVersions || []).filter((row: any) => hasLesson(row.lessonId));
  bundle.lessonContentVersions = (bundle.lessonContentVersions || []).filter((row: any) => hasLesson(row.lessonId));
  bundle.lessonVersions = (bundle.lessonVersions || []).filter((row: any) => hasLesson(row.lessonId));
  bundle.lessonQuizLinks = (bundle.lessonQuizLinks || []).filter((row: any) => hasLesson(row.lessonId) && hasQuizCollection(row.quizId));
  bundle.quizCollectionVersions = (bundle.quizCollectionVersions || []).filter((row: any) => hasQuizCollection(row.collectionId));
  bundle.quizCardVersions = (bundle.quizCardVersions || []).filter((row: any) => hasQuizCard(row.cardId) && (!row.collectionId || hasQuizCollection(row.collectionId)));
  bundle.courseVersions = (bundle.courseVersions || []).filter((row: any) => hasCourse(row.courseId));
  bundle.courseTags = (bundle.courseTags || []).filter((row: any) => hasCourse(row.courseId));
  bundle.courseSourceDocuments = (bundle.courseSourceDocuments || []).map((row: any) => ({
    ...row,
    courseId: row.courseId && hasCourse(row.courseId) ? row.courseId : null,
    draftId: null,
    draftDocumentId: null,
  }));
  bundle.courseSourceAssets = (bundle.courseSourceAssets || []).filter((row: any) => hasSourceDocument(row.sourceDocumentId));
  bundle.courseSourceAssetLinks = (bundle.courseSourceAssetLinks || []).filter((row: any) => hasSourceAsset(row.assetId));
}

function buildCourseTransferImportPlan(params: {
  bundle: Record<string, any[]>;
  organizationId: string;
  userId: string;
  filePathMap: Record<string, string>;
  idMap: Record<string, string>;
  sourceCourse: any;
  importedCourseId: string;
  mode: "create_new" | "merge_append_versions";
}): CourseTransferImportPlan {
  const rows = normalizeImportedBundleForInsert({
    bundle: params.bundle,
    organizationId: params.organizationId,
    userId: params.userId,
    filePathMap: params.filePathMap,
    idMap: params.idMap,
  });

  return {
    mode: params.mode,
    organizationId: params.organizationId,
    userId: params.userId,
    importedCourseId: params.importedCourseId,
    sourceCourse: params.sourceCourse,
    rows,
  };
}

function rowsForPlan(plan: CourseTransferImportPlan, table: string): any[] {
  return (plan.rows[table] || []).map((row: any) => normalizeTemporalColumns(row));
}

async function insertRows(tx: any, table: any, rows: any[]) {
  if (!rows.length) return;
  await tx.insert(table).values(rows as any);
}

async function insertCourseShells(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.courses, rowsForPlan(plan, "courses"));
  await insertRows(tx, schema.courseFrameworks, rowsForPlan(plan, "courseFrameworks"));
}

async function insertLessonShells(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.lessons, rowsForPlan(plan, "lessons"));
}

async function insertQuizCollections(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.quizCollections, rowsForPlan(plan, "quizCollections"));
}

async function insertCourseLessonLinks(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.courseLessons, rowsForPlan(plan, "courseLessons"));
  await insertRows(tx, schema.lessonQuizLinks, rowsForPlan(plan, "lessonQuizLinks"));
}

async function insertQuizCards(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.quizCards, rowsForPlan(plan, "quizCards"));
}

async function insertLessonArtifactsAndVersions(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.lessonSlides, rowsForPlan(plan, "lessonSlides"));
  await insertRows(tx, schema.lessonPresentationVersions, rowsForPlan(plan, "lessonPresentationVersions"));
  await insertRows(tx, schema.lessonContentVersions, rowsForPlan(plan, "lessonContentVersions"));
  await insertRows(tx, schema.lessonVersions, rowsForPlan(plan, "lessonVersions"));
}

async function insertQuizVersionHistory(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.quizCollectionVersions, rowsForPlan(plan, "quizCollectionVersions"));
  await insertRows(tx, schema.quizCardVersions, rowsForPlan(plan, "quizCardVersions"));
}

async function insertCourseVersionHistory(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.courseVersions, rowsForPlan(plan, "courseVersions"));
  await insertRows(tx, schema.courseTags, rowsForPlan(plan, "courseTags"));
}

async function insertCourseSourceRecords(tx: any, plan: CourseTransferImportPlan) {
  await insertRows(tx, schema.courseSourceDocuments, rowsForPlan(plan, "courseSourceDocuments"));
  await insertRows(tx, schema.courseSourceAssets, rowsForPlan(plan, "courseSourceAssets"));
  await insertRows(tx, schema.courseSourceAssetLinks, rowsForPlan(plan, "courseSourceAssetLinks"));
}

async function assertNoDanglingImportPlanReferences(tx: any, plan: CourseTransferImportPlan) {
  const idsInPlan = (table: string) => new Set((plan.rows[table] || []).map((row: any) => String(row.id || "")).filter(Boolean));
  const courseIds = idsInPlan("courses");
  const lessonIds = idsInPlan("lessons");
  const quizCollectionIds = idsInPlan("quizCollections");
  const quizCardIds = idsInPlan("quizCards");
  const sourceDocumentIds = idsInPlan("courseSourceDocuments");
  const sourceAssetIds = idsInPlan("courseSourceAssets");

  const referencedCourseIds = new Set<string>();
  const referencedLessonIds = new Set<string>();
  const referencedQuizCollectionIds = new Set<string>();
  const referencedQuizCardIds = new Set<string>();
  const referencedSourceDocumentIds = new Set<string>();
  const referencedSourceAssetIds = new Set<string>();
  const collect = (set: Set<string>, value: any) => {
    const normalized = String(value || "").trim();
    if (normalized) set.add(normalized);
  };

  for (const row of plan.rows.courseFrameworks || []) collect(referencedCourseIds, row.courseId);
  for (const row of plan.rows.courseLessons || []) {
    collect(referencedCourseIds, row.courseId);
    collect(referencedLessonIds, row.lessonId);
    collect(referencedQuizCollectionIds, row.primaryQuizId);
  }
  for (const row of plan.rows.lessons || []) collect(referencedQuizCollectionIds, row.relatedQuizId);
  for (const row of plan.rows.quizCards || []) collect(referencedQuizCollectionIds, row.collectionId);
  for (const row of plan.rows.lessonSlides || []) collect(referencedLessonIds, row.lessonId);
  for (const row of plan.rows.lessonPresentationVersions || []) collect(referencedLessonIds, row.lessonId);
  for (const row of plan.rows.lessonContentVersions || []) collect(referencedLessonIds, row.lessonId);
  for (const row of plan.rows.lessonVersions || []) {
    collect(referencedLessonIds, row.lessonId);
    collect(referencedQuizCollectionIds, row.relatedQuizId);
  }
  for (const row of plan.rows.lessonQuizLinks || []) {
    collect(referencedLessonIds, row.lessonId);
    collect(referencedQuizCollectionIds, row.quizId);
  }
  for (const row of plan.rows.quizCollectionVersions || []) collect(referencedQuizCollectionIds, row.collectionId);
  for (const row of plan.rows.quizCardVersions || []) {
    collect(referencedQuizCardIds, row.cardId);
    collect(referencedQuizCollectionIds, row.collectionId);
  }
  for (const row of plan.rows.courseVersions || []) collect(referencedCourseIds, row.courseId);
  for (const row of plan.rows.courseTags || []) collect(referencedCourseIds, row.courseId);
  for (const row of plan.rows.courseSourceDocuments || []) collect(referencedCourseIds, row.courseId);
  for (const row of plan.rows.courseSourceAssets || []) collect(referencedSourceDocumentIds, row.sourceDocumentId);
  for (const row of plan.rows.courseSourceAssetLinks || []) collect(referencedSourceAssetIds, row.assetId);

  const existingCourseIds = await retainExistingIds(tx, schema.courses, new Set(Array.from(referencedCourseIds).filter((id) => !courseIds.has(id))));
  const existingLessonIds = await retainExistingIds(tx, schema.lessons, new Set(Array.from(referencedLessonIds).filter((id) => !lessonIds.has(id))));
  const existingQuizCollectionIds = await retainExistingIds(tx, schema.quizCollections, new Set(Array.from(referencedQuizCollectionIds).filter((id) => !quizCollectionIds.has(id))));
  const existingQuizCardIds = await retainExistingIds(tx, schema.quizCards, new Set(Array.from(referencedQuizCardIds).filter((id) => !quizCardIds.has(id))));
  const existingSourceDocumentIds = await retainExistingIds(tx, schema.courseSourceDocuments, new Set(Array.from(referencedSourceDocumentIds).filter((id) => !sourceDocumentIds.has(id))));
  const existingSourceAssetIds = await retainExistingIds(tx, schema.courseSourceAssets, new Set(Array.from(referencedSourceAssetIds).filter((id) => !sourceAssetIds.has(id))));

  const missing: string[] = [];
  const hasCourse = (id: any) => !id || courseIds.has(String(id)) || existingCourseIds.has(String(id));
  const hasLesson = (id: any) => !id || lessonIds.has(String(id)) || existingLessonIds.has(String(id));
  const hasQuizCollection = (id: any) => !id || quizCollectionIds.has(String(id)) || existingQuizCollectionIds.has(String(id));
  const hasQuizCard = (id: any) => !id || quizCardIds.has(String(id)) || existingQuizCardIds.has(String(id));
  const hasSourceDocument = (id: any) => !id || sourceDocumentIds.has(String(id)) || existingSourceDocumentIds.has(String(id));
  const hasSourceAsset = (id: any) => !id || sourceAssetIds.has(String(id)) || existingSourceAssetIds.has(String(id));

  for (const row of plan.rows.courseFrameworks || []) if (!hasCourse(row.courseId)) missing.push(`courseFrameworks.courseId:${row.courseId}`);
  for (const row of plan.rows.courseLessons || []) {
    if (!hasCourse(row.courseId)) missing.push(`courseLessons.courseId:${row.courseId}`);
    if (!hasLesson(row.lessonId)) missing.push(`courseLessons.lessonId:${row.lessonId}`);
    if (!hasQuizCollection(row.primaryQuizId)) missing.push(`courseLessons.primaryQuizId:${row.primaryQuizId}`);
  }
  for (const row of plan.rows.lessons || []) if (!hasQuizCollection(row.relatedQuizId)) missing.push(`lessons.relatedQuizId:${row.relatedQuizId}`);
  for (const row of plan.rows.quizCards || []) if (!hasQuizCollection(row.collectionId)) missing.push(`quizCards.collectionId:${row.collectionId}`);
  for (const row of plan.rows.lessonSlides || []) if (!hasLesson(row.lessonId)) missing.push(`lessonSlides.lessonId:${row.lessonId}`);
  for (const row of plan.rows.lessonPresentationVersions || []) if (!hasLesson(row.lessonId)) missing.push(`lessonPresentationVersions.lessonId:${row.lessonId}`);
  for (const row of plan.rows.lessonContentVersions || []) if (!hasLesson(row.lessonId)) missing.push(`lessonContentVersions.lessonId:${row.lessonId}`);
  for (const row of plan.rows.lessonVersions || []) {
    if (!hasLesson(row.lessonId)) missing.push(`lessonVersions.lessonId:${row.lessonId}`);
    if (!hasQuizCollection(row.relatedQuizId)) missing.push(`lessonVersions.relatedQuizId:${row.relatedQuizId}`);
  }
  for (const row of plan.rows.lessonQuizLinks || []) {
    if (!hasLesson(row.lessonId)) missing.push(`lessonQuizLinks.lessonId:${row.lessonId}`);
    if (!hasQuizCollection(row.quizId)) missing.push(`lessonQuizLinks.quizId:${row.quizId}`);
  }
  for (const row of plan.rows.quizCollectionVersions || []) if (!hasQuizCollection(row.collectionId)) missing.push(`quizCollectionVersions.collectionId:${row.collectionId}`);
  for (const row of plan.rows.quizCardVersions || []) {
    if (!hasQuizCard(row.cardId)) missing.push(`quizCardVersions.cardId:${row.cardId}`);
    if (!hasQuizCollection(row.collectionId)) missing.push(`quizCardVersions.collectionId:${row.collectionId}`);
  }
  for (const row of plan.rows.courseVersions || []) if (!hasCourse(row.courseId)) missing.push(`courseVersions.courseId:${row.courseId}`);
  for (const row of plan.rows.courseTags || []) if (!hasCourse(row.courseId)) missing.push(`courseTags.courseId:${row.courseId}`);
  for (const row of plan.rows.courseSourceDocuments || []) if (!hasCourse(row.courseId)) missing.push(`courseSourceDocuments.courseId:${row.courseId}`);
  for (const row of plan.rows.courseSourceAssets || []) if (!hasSourceDocument(row.sourceDocumentId)) missing.push(`courseSourceAssets.sourceDocumentId:${row.sourceDocumentId}`);
  for (const row of plan.rows.courseSourceAssetLinks || []) if (!hasSourceAsset(row.assetId)) missing.push(`courseSourceAssetLinks.assetId:${row.assetId}`);

  if (missing.length) {
    throw new Error(`Import package contains unresolved course references after normalization: ${missing.slice(0, 8).join(", ")}`);
  }
}

async function verifyCourseTransferImportPlanResult(tx: any, plan: CourseTransferImportPlan) {
  const [course] = await tx
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.id, plan.importedCourseId))
    .limit(1);

  if (!course) {
    throw new Error("Import verification failed: imported course record was not created");
  }

  const expectedLessonLinks = (plan.rows.courseLessons || []).filter((row: any) => String(row.courseId || "") === plan.importedCourseId);
  if (expectedLessonLinks.length) {
    const links = await tx
      .select({ id: schema.courseLessons.id })
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.courseId, plan.importedCourseId))
      .limit(1);
    if (!links.length) {
      throw new Error("Import verification failed: imported course has no lesson links");
    }
  }
}

async function executeCourseTransferImportPlan(tx: any, plan: CourseTransferImportPlan) {
  await hardenImportedBundleForeignKeysForInsert(tx, plan.rows);
  await assertNoDanglingImportPlanReferences(tx, plan);

  await insertCourseShells(tx, plan);
  await insertLessonShells(tx, plan);
  await insertQuizCollections(tx, plan);
  await insertCourseLessonLinks(tx, plan);
  await insertQuizCards(tx, plan);
  await insertLessonArtifactsAndVersions(tx, plan);
  await insertQuizVersionHistory(tx, plan);
  await insertCourseVersionHistory(tx, plan);
  await insertCourseSourceRecords(tx, plan);

  await verifyCourseTransferImportPlanResult(tx, plan);
}

async function executeCourseTransferImportPlanInTransaction(plan: CourseTransferImportPlan) {
  await db.transaction(async (tx) => {
    await executeCourseTransferImportPlan(tx, plan);
  });
}

function normalizeLanguageCode(value: any): string {
  const normalized = String(value || "en").trim().toLowerCase();
  return normalized || "en";
}

function normalizeMatchText(value: any): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeTitleLanguageKey(input: { title?: any; name?: any; languageCode?: any }): string {
  const text = normalizeMatchText(input.title ?? input.name);
  const language = normalizeLanguageCode(input.languageCode);
  return text ? `title:${text}|lang:${language}` : "";
}

function statusPreference(status: any): number {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return 0;
  if (normalized === "draft") return 1;
  if (normalized === "inactive") return 2;
  if (normalized === "archived") return 3;
  return 4;
}

function timeValue(value: any): number {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreImportCourseMatch(candidate: ImportCourseMatch, source: {
  title?: any;
  languageCode?: any;
  contentGroupId?: any;
}): ImportCourseMatch | null {
  const sourceLanguage = normalizeLanguageCode(source.languageCode);
  const candidateLanguage = normalizeLanguageCode(candidate.languageCode || "en");
  if (candidateLanguage !== sourceLanguage) return null;

  const sourceContentGroupId = String(source.contentGroupId || "").trim();
  const candidateContentGroupId = String(candidate.contentGroupId || "").trim();
  if (sourceContentGroupId && candidateContentGroupId && sourceContentGroupId === candidateContentGroupId) {
    return {
      ...candidate,
      matchReason: "Same course family",
      matchConfidence: 100,
    };
  }

  if (makeTitleLanguageKey({ title: candidate.title, languageCode: candidate.languageCode })
    === makeTitleLanguageKey({ title: source.title, languageCode: source.languageCode })) {
    return {
      ...candidate,
      matchReason: "Same title and language",
      matchConfidence: 80,
    };
  }

  return null;
}

async function findImportMergeCandidates(params: {
  organizationId: string;
  sourceCourse: any;
}): Promise<ImportCourseMatch[]> {
  const sourceTitle = String(params.sourceCourse?.title || "").trim();
  const sourceContentGroupId = String(params.sourceCourse?.contentGroupId || "").trim();
  if (!sourceTitle && !sourceContentGroupId) return [];

  const rows = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      languageCode: schema.courses.languageCode,
      status: schema.courses.status,
      contentGroupId: schema.courses.contentGroupId,
      createdAt: schema.courses.createdAt,
      updatedAt: schema.courses.updatedAt,
    })
    .from(schema.courses)
    .where(eq(schema.courses.organizationId, params.organizationId));

  const scored = rows
    .map((row) => scoreImportCourseMatch(row, {
      title: sourceTitle,
      languageCode: params.sourceCourse?.languageCode || params.sourceCourse?.language || "en",
      contentGroupId: sourceContentGroupId,
    }))
    .filter(Boolean) as ImportCourseMatch[];

  return scored.sort((a, b) => {
    const confidenceDelta = (b.matchConfidence || 0) - (a.matchConfidence || 0);
    if (confidenceDelta) return confidenceDelta;
    const statusDelta = statusPreference(a.status) - statusPreference(b.status);
    if (statusDelta) return statusDelta;
    const updatedDelta = timeValue(b.updatedAt) - timeValue(a.updatedAt);
    if (updatedDelta) return updatedDelta;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function makeEntityMatchKey(input: {
  contentGroupId?: any;
  languageCode?: any;
}): string {
  const language = normalizeLanguageCode(input.languageCode);
  const contentGroup = String(input.contentGroupId || "").trim();
  if (!contentGroup) return "";
  return `cg:${contentGroup}|lang:${language}`;
}

async function applyMergeEntityOverrides(params: {
  bundle: Record<string, any[]>;
  organizationId: string;
  sourceCourseId: string;
  targetCourseId: string;
  idMap: Record<string, string>;
}): Promise<{
  primaryCourseId: string;
  existingIds: MergeExistingIdSets;
}> {
  const existingIds: MergeExistingIdSets = {
    courses: new Set<string>(),
    lessons: new Set<string>(),
    quizCollections: new Set<string>(),
    quizCards: new Set<string>(),
  };

  const [targetCourse] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      organizationId: schema.courses.organizationId,
      languageCode: schema.courses.languageCode,
      contentGroupId: schema.courses.contentGroupId,
    })
    .from(schema.courses)
    .where(and(eq(schema.courses.id, params.targetCourseId), eq(schema.courses.organizationId, params.organizationId)))
    .limit(1);
  if (!targetCourse) {
    throw new Error("Merge target course not found in this organization");
  }

  const importedCourses = Array.isArray(params.bundle.courses) ? params.bundle.courses : [];
  const importedSourceCourse = importedCourses.find((row: any) => String(row?.id || "") === params.sourceCourseId);
  if (!importedSourceCourse) {
    throw new Error("Import package source course is missing");
  }
  const sourceLanguage = normalizeLanguageCode(importedSourceCourse.languageCode || "en");
  const targetLanguage = normalizeLanguageCode(targetCourse.languageCode || "en");
  if (sourceLanguage !== targetLanguage) {
    throw new Error("Merge target language does not match source course language");
  }
  const sourceContentGroupId = String(importedSourceCourse.contentGroupId || "").trim();
  const targetContentGroupId = String(targetCourse.contentGroupId || "").trim();
  const sameContentGroup = !!sourceContentGroupId && !!targetContentGroupId && targetContentGroupId === sourceContentGroupId;
  const sameTitleAndLanguage = makeTitleLanguageKey({
    title: importedSourceCourse.title,
    languageCode: importedSourceCourse.languageCode,
  }) === makeTitleLanguageKey({
    title: targetCourse.title,
    languageCode: targetCourse.languageCode,
  });
  if (!sameContentGroup && !sameTitleAndLanguage) {
    throw new Error("Merge target course does not match the package course family");
  }

  const orgCourses = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      languageCode: schema.courses.languageCode,
      contentGroupId: schema.courses.contentGroupId,
      status: schema.courses.status,
      updatedAt: schema.courses.updatedAt,
    })
    .from(schema.courses)
    .where(eq(schema.courses.organizationId, params.organizationId));

  const orgCourseByKey = new Map<string, { id: string }>();
  const orgCourseByTitleLanguage = new Map<string, { id: string }>();
  const orderedOrgCourses = [...orgCourses].sort((a, b) => {
    const statusDelta = statusPreference(a.status) - statusPreference(b.status);
    if (statusDelta) return statusDelta;
    return timeValue(b.updatedAt) - timeValue(a.updatedAt);
  });
  for (const course of orderedOrgCourses) {
    const key = makeEntityMatchKey({
      contentGroupId: course.contentGroupId,
      languageCode: course.languageCode,
    });
    if (key && !orgCourseByKey.has(key)) {
      orgCourseByKey.set(key, { id: course.id });
    }
    const titleKey = makeTitleLanguageKey({
      title: course.title,
      languageCode: course.languageCode,
    });
    if (titleKey && !orgCourseByTitleLanguage.has(titleKey)) {
      orgCourseByTitleLanguage.set(titleKey, { id: course.id });
    }
  }

  for (const importedCourse of importedCourses) {
    const oldId = String(importedCourse.id || "");
    if (!oldId) continue;
    if (oldId === params.sourceCourseId) {
      params.idMap[oldId] = params.targetCourseId;
      existingIds.courses.add(params.targetCourseId);
      continue;
    }
    const match = orgCourseByKey.get(
      makeEntityMatchKey({
        contentGroupId: importedCourse.contentGroupId,
        languageCode: importedCourse.languageCode,
      })
    ) || orgCourseByTitleLanguage.get(
      makeTitleLanguageKey({
        title: importedCourse.title,
        languageCode: importedCourse.languageCode,
      })
    );
    if (match?.id) {
      params.idMap[oldId] = match.id;
      existingIds.courses.add(match.id);
    }
  }

  const importedCourseLessons = Array.isArray(params.bundle.courseLessons) ? params.bundle.courseLessons : [];
  const importedLessonsById = new Map<string, any>();
  for (const lesson of Array.isArray(params.bundle.lessons) ? params.bundle.lessons : []) {
    const id = String(lesson.id || "");
    if (id) importedLessonsById.set(id, lesson);
  }

  const mappedCourseIds = Array.from(new Set(importedCourses.map((row: any) => params.idMap[String(row.id || "")]).filter(Boolean)));
  const existingLessonRows = mappedCourseIds.length
    ? await db
        .select({
          lessonId: schema.lessons.id,
          courseId: schema.courseLessons.courseId,
          title: schema.lessons.title,
          languageCode: schema.lessons.languageCode,
          contentGroupId: schema.lessons.contentGroupId,
        })
        .from(schema.courseLessons)
        .innerJoin(schema.lessons, eq(schema.lessons.id, schema.courseLessons.lessonId))
        .where(inArray(schema.courseLessons.courseId, mappedCourseIds))
    : [];

  const lessonLookupByCourse = new Map<string, Map<string, string>>();
  const lessonTitleLookupByCourse = new Map<string, Map<string, string>>();
  for (const row of existingLessonRows) {
    const courseId = String(row.courseId);
    if (!lessonLookupByCourse.has(courseId)) lessonLookupByCourse.set(courseId, new Map<string, string>());
    if (!lessonTitleLookupByCourse.has(courseId)) lessonTitleLookupByCourse.set(courseId, new Map<string, string>());
    const key = makeEntityMatchKey({
      contentGroupId: row.contentGroupId,
      languageCode: row.languageCode,
    });
    if (key) {
      lessonLookupByCourse.get(courseId)!.set(key, String(row.lessonId));
    }
    const titleKey = makeTitleLanguageKey({
      title: row.title,
      languageCode: row.languageCode,
    });
    if (titleKey) {
      lessonTitleLookupByCourse.get(courseId)!.set(titleKey, String(row.lessonId));
    }
  }

  for (const row of importedCourseLessons) {
    const importedLessonId = String(row.lessonId || "");
    const importedCourseId = String(row.courseId || "");
    const mappedCourseId = params.idMap[importedCourseId];
    if (!importedLessonId || !mappedCourseId) continue;
    const importedLesson = importedLessonsById.get(importedLessonId);
    if (!importedLesson) continue;
    const key = makeEntityMatchKey({
      contentGroupId: importedLesson.contentGroupId,
      languageCode: importedLesson.languageCode,
    });
    if (!key) continue;
    const existingLessonId = lessonLookupByCourse.get(mappedCourseId)?.get(key)
      || lessonTitleLookupByCourse.get(mappedCourseId)?.get(
        makeTitleLanguageKey({
          title: importedLesson.title,
          languageCode: importedLesson.languageCode,
        })
      );
    if (existingLessonId) {
      params.idMap[importedLessonId] = existingLessonId;
      existingIds.lessons.add(existingLessonId);
    }
  }

  const importedQuizCollections = Array.isArray(params.bundle.quizCollections) ? params.bundle.quizCollections : [];
  const existingQuizCollections = await db
    .select({
      id: schema.quizCollections.id,
      name: schema.quizCollections.name,
      languageCode: schema.quizCollections.languageCode,
      contentGroupId: schema.quizCollections.contentGroupId,
    })
    .from(schema.quizCollections)
    .where(eq(schema.quizCollections.organizationId, params.organizationId));

  const quizCollectionLookup = new Map<string, string>();
  const quizCollectionTitleLookup = new Map<string, string>();
  for (const row of existingQuizCollections) {
    const key = makeEntityMatchKey({
      contentGroupId: row.contentGroupId,
      languageCode: row.languageCode,
    });
    if (key && !quizCollectionLookup.has(key)) {
      quizCollectionLookup.set(key, String(row.id));
    }
    const titleKey = makeTitleLanguageKey({
      name: row.name,
      languageCode: row.languageCode,
    });
    if (titleKey && !quizCollectionTitleLookup.has(titleKey)) {
      quizCollectionTitleLookup.set(titleKey, String(row.id));
    }
  }

  for (const importedCollection of importedQuizCollections) {
    const oldId = String(importedCollection.id || "");
    if (!oldId) continue;
    const existingId = quizCollectionLookup.get(
      makeEntityMatchKey({
        contentGroupId: importedCollection.contentGroupId,
        languageCode: importedCollection.languageCode,
      })
    ) || quizCollectionTitleLookup.get(
      makeTitleLanguageKey({
        name: importedCollection.name,
        languageCode: importedCollection.languageCode,
      })
    );
    if (existingId) {
      params.idMap[oldId] = existingId;
      existingIds.quizCollections.add(existingId);
    }
  }

  const importedCards = Array.isArray(params.bundle.quizCards) ? params.bundle.quizCards : [];
  const mappedCollectionIds = Array.from(
    new Set(importedCards.map((row: any) => params.idMap[String(row.collectionId || "")]).filter(Boolean))
  );
  const existingCards = mappedCollectionIds.length
    ? await db
        .select({
          id: schema.quizCards.id,
          collectionId: schema.quizCards.collectionId,
          displayOrder: schema.quizCards.displayOrder,
          questionType: schema.quizCards.questionType,
          question: schema.quizCards.question,
        })
        .from(schema.quizCards)
        .where(inArray(schema.quizCards.collectionId, mappedCollectionIds))
    : [];

  const cardLookup = new Map<string, string>();
  for (const card of existingCards) {
    const key = `${card.collectionId}|${card.displayOrder}|${String(card.questionType || "")}|${String(card.question || "").trim().toLowerCase()}`;
    if (!cardLookup.has(key)) {
      cardLookup.set(key, String(card.id));
    }
  }

  for (const importedCard of importedCards) {
    const oldId = String(importedCard.id || "");
    const mappedCollectionId = params.idMap[String(importedCard.collectionId || "")];
    if (!oldId || !mappedCollectionId) continue;
    const key = `${mappedCollectionId}|${importedCard.displayOrder}|${String(importedCard.questionType || "")}|${String(importedCard.question || "").trim().toLowerCase()}`;
    const existingCardId = cardLookup.get(key);
    if (existingCardId) {
      params.idMap[oldId] = existingCardId;
      existingIds.quizCards.add(existingCardId);
    }
  }

  return {
    primaryCourseId: params.idMap[params.sourceCourseId] || params.targetCourseId,
    existingIds,
  };
}

function rebaseNumericVersions(rows: any[], opts: {
  idField: string;
  versionField: string;
  existingIds: Set<string>;
  maxById: Map<string, number>;
}) {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const entityId = String(row?.[opts.idField] || "");
    if (!entityId || !opts.existingIds.has(entityId)) continue;
    if (!grouped.has(entityId)) grouped.set(entityId, []);
    grouped.get(entityId)!.push(row);
  }

  for (const [entityId, group] of grouped.entries()) {
    const uniqueSourceVersions = Array.from(
      new Set(group.map((row) => Number(row?.[opts.versionField] || 0)).filter((value) => Number.isFinite(value)))
    ).sort((a, b) => a - b);
    let next = (opts.maxById.get(entityId) || 0) + 1;
    const sourceToNew = new Map<number, number>();
    for (const sourceVersion of uniqueSourceVersions) {
      sourceToNew.set(sourceVersion, next++);
    }
    for (const row of group) {
      const sourceVersion = Number(row?.[opts.versionField] || 0);
      if (sourceToNew.has(sourceVersion)) {
        row[opts.versionField] = sourceToNew.get(sourceVersion);
      }
    }
  }
}

function parseCourseVersionParts(version: string): { major: number; minor: number } {
  const raw = String(version || "").trim();
  const match = /^(\d+)\.(\d+)$/.exec(raw);
  if (match) {
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
    };
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return {
      major: Math.floor(numeric),
      minor: Math.round((numeric - Math.floor(numeric)) * 10),
    };
  }
  return { major: 1, minor: 0 };
}

async function prepareBundleForMergeAppend(params: {
  bundle: Record<string, any[]>;
  organizationId: string;
  existingIds: MergeExistingIdSets;
  tx?: any;
}) {
  const tx = params.tx || db;
  const lessonIds = Array.from(params.existingIds.lessons);
  const collectionIds = Array.from(params.existingIds.quizCollections);
  const cardIds = Array.from(params.existingIds.quizCards);
  const courseIds = Array.from(params.existingIds.courses);

  const lessonVersionMax = new Map<string, number>();
  const lessonPresentationVersionMax = new Map<string, number>();
  const lessonContentVersionMax = new Map<string, number>();
  const lessonSlideVersionMax = new Map<string, number>();
  const quizCollectionVersionMax = new Map<string, number>();
  const quizCardVersionMax = new Map<string, number>();
  const courseVersionMax = new Map<string, { major: number; minor: number; latestId: string | null }>();

  if (lessonIds.length) {
    await tx
      .select({ id: schema.lessons.id })
      .from(schema.lessons)
      .where(inArray(schema.lessons.id, lessonIds))
      .for("update");

    const lessonVersionsRows = await tx
      .select({
        lessonId: schema.lessonVersions.lessonId,
        versionNumber: schema.lessonVersions.versionNumber,
      })
      .from(schema.lessonVersions)
      .where(inArray(schema.lessonVersions.lessonId, lessonIds));
    for (const row of lessonVersionsRows) {
      const key = String(row.lessonId);
      const value = Number(row.versionNumber || 0);
      lessonVersionMax.set(key, Math.max(lessonVersionMax.get(key) || 0, value));
    }

    const lessonPresentationRows = await tx
      .select({
        lessonId: schema.lessonPresentationVersions.lessonId,
        version: schema.lessonPresentationVersions.version,
      })
      .from(schema.lessonPresentationVersions)
      .where(inArray(schema.lessonPresentationVersions.lessonId, lessonIds));
    for (const row of lessonPresentationRows) {
      const key = String(row.lessonId);
      const value = Number(row.version || 0);
      lessonPresentationVersionMax.set(key, Math.max(lessonPresentationVersionMax.get(key) || 0, value));
    }

    const lessonContentRows = await tx
      .select({
        lessonId: schema.lessonContentVersions.lessonId,
        versionNumber: schema.lessonContentVersions.versionNumber,
      })
      .from(schema.lessonContentVersions)
      .where(inArray(schema.lessonContentVersions.lessonId, lessonIds));
    for (const row of lessonContentRows) {
      const key = String(row.lessonId);
      const value = Number(row.versionNumber || 0);
      lessonContentVersionMax.set(key, Math.max(lessonContentVersionMax.get(key) || 0, value));
    }

    const lessonSlideRows = await tx
      .select({
        lessonId: schema.lessonSlides.lessonId,
        version: schema.lessonSlides.version,
      })
      .from(schema.lessonSlides)
      .where(inArray(schema.lessonSlides.lessonId, lessonIds));
    for (const row of lessonSlideRows) {
      const key = String(row.lessonId);
      const value = Number(row.version || 0);
      lessonSlideVersionMax.set(key, Math.max(lessonSlideVersionMax.get(key) || 0, value));
    }
  }

  if (collectionIds.length) {
    await tx
      .select({ id: schema.quizCollections.id })
      .from(schema.quizCollections)
      .where(inArray(schema.quizCollections.id, collectionIds))
      .for("update");

    const rows = await tx
      .select({
        collectionId: schema.quizCollectionVersions.collectionId,
        versionNumber: schema.quizCollectionVersions.versionNumber,
      })
      .from(schema.quizCollectionVersions)
      .where(inArray(schema.quizCollectionVersions.collectionId, collectionIds));
    for (const row of rows) {
      const key = String(row.collectionId);
      const value = Number(row.versionNumber || 0);
      quizCollectionVersionMax.set(key, Math.max(quizCollectionVersionMax.get(key) || 0, value));
    }
  }

  if (cardIds.length) {
    await tx
      .select({ id: schema.quizCards.id })
      .from(schema.quizCards)
      .where(inArray(schema.quizCards.id, cardIds))
      .for("update");

    const rows = await tx
      .select({
        cardId: schema.quizCardVersions.cardId,
        versionNumber: schema.quizCardVersions.versionNumber,
      })
      .from(schema.quizCardVersions)
      .where(inArray(schema.quizCardVersions.cardId, cardIds));
    for (const row of rows) {
      const key = String(row.cardId);
      const value = Number(row.versionNumber || 0);
      quizCardVersionMax.set(key, Math.max(quizCardVersionMax.get(key) || 0, value));
    }
  }

  if (courseIds.length) {
    await tx
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(inArray(schema.courses.id, courseIds))
      .for("update");

    const rows = await tx
      .select({
        courseId: schema.courseVersions.courseId,
        id: schema.courseVersions.id,
        versionNumber: schema.courseVersions.versionNumber,
        createdAt: schema.courseVersions.createdAt,
      })
      .from(schema.courseVersions)
      .where(inArray(schema.courseVersions.courseId, courseIds))
      .orderBy(desc(schema.courseVersions.createdAt));
    for (const row of rows) {
      const key = String(row.courseId);
      const versionParts = parseCourseVersionParts(String(row.versionNumber || ""));
      const current = courseVersionMax.get(key);
      if (!current) {
        courseVersionMax.set(key, {
          major: versionParts.major,
          minor: versionParts.minor,
          latestId: row.id || null,
        });
        continue;
      }
      if (
        versionParts.major > current.major ||
        (versionParts.major === current.major && versionParts.minor > current.minor)
      ) {
        courseVersionMax.set(key, {
          major: versionParts.major,
          minor: versionParts.minor,
          latestId: row.id || current.latestId || null,
        });
      }
    }
  }

  rebaseNumericVersions(params.bundle.lessonVersions || [], {
    idField: "lessonId",
    versionField: "versionNumber",
    existingIds: params.existingIds.lessons,
    maxById: lessonVersionMax,
  });
  rebaseNumericVersions(params.bundle.lessonPresentationVersions || [], {
    idField: "lessonId",
    versionField: "version",
    existingIds: params.existingIds.lessons,
    maxById: lessonPresentationVersionMax,
  });
  rebaseNumericVersions(params.bundle.lessonContentVersions || [], {
    idField: "lessonId",
    versionField: "versionNumber",
    existingIds: params.existingIds.lessons,
    maxById: lessonContentVersionMax,
  });
  rebaseNumericVersions(params.bundle.lessonSlides || [], {
    idField: "lessonId",
    versionField: "version",
    existingIds: params.existingIds.lessons,
    maxById: lessonSlideVersionMax,
  });
  rebaseNumericVersions(params.bundle.quizCollectionVersions || [], {
    idField: "collectionId",
    versionField: "versionNumber",
    existingIds: params.existingIds.quizCollections,
    maxById: quizCollectionVersionMax,
  });
  rebaseNumericVersions(params.bundle.quizCardVersions || [], {
    idField: "cardId",
    versionField: "versionNumber",
    existingIds: params.existingIds.quizCards,
    maxById: quizCardVersionMax,
  });

  const byCourse = new Map<string, any[]>();
  for (const row of params.bundle.courseVersions || []) {
    const courseId = String(row.courseId || "");
    if (!courseId || !params.existingIds.courses.has(courseId)) continue;
    if (!byCourse.has(courseId)) byCourse.set(courseId, []);
    byCourse.get(courseId)!.push(row);
  }
  for (const [courseId, rows] of byCourse.entries()) {
    rows.sort((a, b) => {
      const aDate = new Date(a.createdAt || 0).getTime();
      const bDate = new Date(b.createdAt || 0).getTime();
      if (aDate !== bDate) return aDate - bDate;
      return String(a.id).localeCompare(String(b.id));
    });
    const currentMax = courseVersionMax.get(courseId) || { major: 1, minor: 0, latestId: null };
    let previousId: string | null = currentMax.latestId || null;
    let nextMinor = currentMax.minor + 1;
    for (const row of rows) {
      row.versionNumber = `${currentMax.major}.${nextMinor++}`;
      row.previousVersionId = previousId;
      previousId = String(row.id || previousId || "");
    }
  }

  params.bundle.courses = (params.bundle.courses || []).filter((row: any) => !params.existingIds.courses.has(String(row.id || "")));
  params.bundle.lessons = (params.bundle.lessons || []).filter((row: any) => !params.existingIds.lessons.has(String(row.id || "")));
  params.bundle.quizCollections = (params.bundle.quizCollections || []).filter(
    (row: any) => !params.existingIds.quizCollections.has(String(row.id || ""))
  );
  params.bundle.quizCards = (params.bundle.quizCards || []).filter((row: any) => !params.existingIds.quizCards.has(String(row.id || "")));
  params.bundle.courseFrameworks = (params.bundle.courseFrameworks || []).filter(
    (row: any) => !params.existingIds.courses.has(String(row.courseId || ""))
  );

  const existingCourseLessonPairs = new Set<string>();
  if ((params.bundle.courseLessons || []).length) {
    const candidateCourseIds = Array.from(new Set((params.bundle.courseLessons || []).map((row: any) => String(row.courseId || "")).filter(Boolean)));
    const candidateLessonIds = Array.from(new Set((params.bundle.courseLessons || []).map((row: any) => String(row.lessonId || "")).filter(Boolean)));
    if (candidateCourseIds.length && candidateLessonIds.length) {
      const rows = await tx
        .select({
          courseId: schema.courseLessons.courseId,
          lessonId: schema.courseLessons.lessonId,
        })
        .from(schema.courseLessons)
        .where(and(inArray(schema.courseLessons.courseId, candidateCourseIds), inArray(schema.courseLessons.lessonId, candidateLessonIds)));
      for (const row of rows) {
        existingCourseLessonPairs.add(`${row.courseId}|${row.lessonId}`);
      }
    }
  }
  params.bundle.courseLessons = (params.bundle.courseLessons || []).filter((row: any) => {
    const key = `${String(row.courseId || "")}|${String(row.lessonId || "")}`;
    return key !== "|" && !existingCourseLessonPairs.has(key);
  });

  const existingLessonQuizPairs = new Set<string>();
  if ((params.bundle.lessonQuizLinks || []).length) {
    const lessonIdsForQuery = Array.from(new Set((params.bundle.lessonQuizLinks || []).map((row: any) => String(row.lessonId || "")).filter(Boolean)));
    if (lessonIdsForQuery.length) {
      const rows = await tx
        .select({
          lessonId: schema.lessonQuizLinks.lessonId,
          quizId: schema.lessonQuizLinks.quizId,
        })
        .from(schema.lessonQuizLinks)
        .where(inArray(schema.lessonQuizLinks.lessonId, lessonIdsForQuery));
      for (const row of rows) {
        existingLessonQuizPairs.add(`${row.lessonId}|${row.quizId}`);
      }
    }
  }
  params.bundle.lessonQuizLinks = (params.bundle.lessonQuizLinks || []).filter((row: any) => {
    const key = `${String(row.lessonId || "")}|${String(row.quizId || "")}`;
    return key !== "|" && !existingLessonQuizPairs.has(key);
  });

  const existingCourseTags = new Set<string>();
  if ((params.bundle.courseTags || []).length) {
    const courseIdsForQuery = Array.from(new Set((params.bundle.courseTags || []).map((row: any) => String(row.courseId || "")).filter(Boolean)));
    if (courseIdsForQuery.length) {
      const rows = await tx
        .select({
          courseId: schema.courseTags.courseId,
          tagName: schema.courseTags.tagName,
        })
        .from(schema.courseTags)
        .where(inArray(schema.courseTags.courseId, courseIdsForQuery));
      for (const row of rows) {
        existingCourseTags.add(`${row.courseId}|${String(row.tagName || "").trim().toLowerCase()}`);
      }
    }
  }
  params.bundle.courseTags = (params.bundle.courseTags || []).filter((row: any) => {
    const key = `${String(row.courseId || "")}|${String(row.tagName || "").trim().toLowerCase()}`;
    return key !== "|" && !existingCourseTags.has(key);
  });
}

export class CourseTransferService {
  static getJob(jobId: string): TransferJob | null {
    return transferJobs.get(jobId) || null;
  }

  static async buildExportPreflight(params: {
    courseId: string;
    organizationId: string;
    selectedArtifactPaths?: string[];
  }): Promise<{
    course: { id: string; title: string; languageCode: string | null };
    includedTables: string[];
    rowCounts: Record<string, number>;
    familySummary: CourseFamilySummary;
    artifacts: { discovered: string[]; selected: string[] };
    missingSelected: ExportArtifactIssue[];
    estimatedBytes: number;
    clonePolicy: {
      fullFamily: true;
      importDefaultMode: "create_new";
      importedCourseStatus: "draft";
      targetOrgResolution: "authenticated_or_impersonated";
    };
    artifactPortability: {
      packageContainsSelectedArtifacts: boolean;
      targetStorageStrategy: "rewrite_to_target_upload_root";
      originalPathsAreInformational: true;
    };
  }> {
    const course = await ensureCourseExportAccess(params.courseId, params.organizationId);
    const bundle = await collectCourseBundle(params.courseId);
    const includedBundle = filterIncludedTables(bundle);
    const discovered = await discoverCourseArtifacts(includedBundle);
    const selected = selectArtifactPaths({
      discovered: new Set(discovered),
      selectedArtifactPaths: params.selectedArtifactPaths,
    });

    const missingSelected: ExportArtifactIssue[] = [];
    let estimatedBytes = 0;
    for (const sourcePath of selected) {
      const resolved = resolveStoragePath(sourcePath);
      try {
        const stat = await fs.promises.stat(resolved);
        if (stat.isFile()) {
          estimatedBytes += stat.size;
          continue;
        }
        if (stat.isDirectory()) {
          const files = await listFilesRecursively(resolved);
          if (!files.length) {
            missingSelected.push({ sourcePath, reason: "directory_is_empty" });
            continue;
          }
          for (const absFilePath of files) {
            const fStat = await fs.promises.stat(absFilePath);
            estimatedBytes += fStat.size;
          }
          continue;
        }
        missingSelected.push({ sourcePath, reason: "unsupported_fs_node" });
      } catch {
        missingSelected.push({ sourcePath, reason: "file_or_directory_not_found" });
      }
    }

    return {
      course: {
        id: course.id,
        title: course.title,
        languageCode: course.languageCode || null,
      },
      includedTables: [...INCLUDED_ENTITY_TABLES],
      rowCounts: Object.fromEntries(INCLUDED_ENTITY_TABLES.map((table) => [table, includedBundle[table]?.length || 0])),
      familySummary: buildCourseFamilySummary(includedBundle),
      artifacts: {
        discovered,
        selected,
      },
      missingSelected,
      estimatedBytes,
      clonePolicy: {
        fullFamily: true,
        importDefaultMode: "create_new",
        importedCourseStatus: "draft",
        targetOrgResolution: "authenticated_or_impersonated",
      },
      artifactPortability: {
        packageContainsSelectedArtifacts: true,
        targetStorageStrategy: "rewrite_to_target_upload_root",
        originalPathsAreInformational: true,
      },
    };
  }

  static async analyzeImportPackage(params: {
    zipPath: string;
    organizationId: string;
  }): Promise<{
    manifest: any;
    rowCounts: Record<string, number>;
    familySummary: CourseFamilySummary;
    targetOrganizationId: string;
    defaultMode: "create_new";
    importedCourseStatus: "draft";
    artifactPortability: {
      packageContainsSelectedArtifacts: boolean;
      targetStorageStrategy: "rewrite_to_target_upload_root";
      originalPathsAreInformational: boolean;
    };
    matchingCourses: Array<{
      id: string;
      title: string;
      languageCode: string | null;
      status: string | null;
      matchReason?: string;
      matchConfidence?: number;
      autoSelected?: boolean;
    }>;
    autoMergeTargetCourse: {
      id: string;
      title: string;
      languageCode: string | null;
      status: string | null;
      matchReason?: string;
      matchConfidence?: number;
    } | null;
    suggestedMode: "create_new" | "merge_append_versions";
  }> {
    let extractedDir = "";
    try {
      const parsed = await parseTransferPackageFromZip(params.zipPath);
      extractedDir = parsed.workDir;
      const manifestSourceCourseId = String(parsed.manifest?.sourceCourse?.id || "");
      const sourceCourse = (parsed.dataBundle.courses || []).find((row: any) => String(row.id || "") === manifestSourceCourseId)
        || (parsed.dataBundle.courses || [])[0]
        || parsed.manifest?.sourceCourse
        || {};
      const filteredMatches = await findImportMergeCandidates({
        organizationId: params.organizationId,
        sourceCourse: {
          ...sourceCourse,
          title: sourceCourse.title || parsed.manifest?.sourceCourse?.title,
          languageCode: sourceCourse.languageCode || parsed.manifest?.sourceCourse?.language,
          contentGroupId: sourceCourse.contentGroupId || parsed.manifest?.sourceCourse?.contentGroupId,
        },
      });
      const autoMergeTargetCourse = filteredMatches[0] || null;

      return {
        manifest: parsed.manifest,
        rowCounts: Object.fromEntries(INCLUDED_ENTITY_TABLES.map((table) => [table, parsed.dataBundle[table]?.length || 0])),
        familySummary: parsed.manifest.familySummary || buildCourseFamilySummary(parsed.dataBundle),
        targetOrganizationId: params.organizationId,
        defaultMode: "create_new",
        importedCourseStatus: "draft",
        artifactPortability: {
          packageContainsSelectedArtifacts: Array.isArray(parsed.manifest?.files) && parsed.manifest.files.length > 0,
          targetStorageStrategy: "rewrite_to_target_upload_root",
          originalPathsAreInformational: parsed.manifest?.artifactPortability?.originalPathsAreInformational !== false,
        },
        matchingCourses: filteredMatches.map((row) => ({
          id: row.id,
          title: row.title,
          languageCode: row.languageCode || null,
          status: row.status || null,
          matchReason: row.matchReason,
          matchConfidence: row.matchConfidence,
          autoSelected: row.id === autoMergeTargetCourse?.id,
        })),
        autoMergeTargetCourse: autoMergeTargetCourse ? {
          id: autoMergeTargetCourse.id,
          title: autoMergeTargetCourse.title,
          languageCode: autoMergeTargetCourse.languageCode || null,
          status: autoMergeTargetCourse.status || null,
          matchReason: autoMergeTargetCourse.matchReason,
          matchConfidence: autoMergeTargetCourse.matchConfidence,
        } : null,
        suggestedMode: filteredMatches.length ? "merge_append_versions" : "create_new",
      };
    } finally {
      try {
        if (extractedDir) {
          await fs.promises.rm(extractedDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  static async startExportJob(params: {
    courseId: string;
    organizationId: string;
    userId: string;
    options?: ExportSelectionOptions;
  }): Promise<TransferJob> {
    const job = createJob({
      type: "export",
      organizationId: params.organizationId,
      userId: params.userId,
      courseId: params.courseId,
    });

    setImmediate(async () => {
      try {
        updateJob(job.id, { status: "running", phase: "validating", progress: 5 });
        throwIfCanceled(job.id);
        const course = await ensureCourseExportAccess(params.courseId, params.organizationId);

        updateJob(job.id, { phase: "collecting_metadata", progress: 25 });
        throwIfCanceled(job.id);
        const bundle = await collectCourseBundle(params.courseId);

        updateJob(job.id, { phase: "collecting_files", progress: 55 });
        throwIfCanceled(job.id);
        const { zipPath, manifest, artifactSummary } = await writeExportPackage({
          bundle,
          course,
          jobId: job.id,
          userId: params.userId,
          options: params.options,
        });

        updateJob(job.id, {
          status: "completed",
          phase: "completed",
          progress: 100,
          downloadPath: zipPath,
          details: {
            manifest,
            courseId: params.courseId,
            artifactSummary,
          },
        });
      } catch (error: any) {
        console.error("[CourseTransfer] Export job failed", error);
        if (error?.code === "JOB_CANCELED") {
          updateJob(job.id, {
            status: "canceled",
            phase: "failed",
            progress: 100,
            error: "Transfer canceled",
          });
          return;
        }
        updateJob(job.id, {
          status: "failed",
          phase: "failed",
          progress: 100,
          error: error?.message || "Export failed",
        });
      }
    });

    return job;
  }

  static async startImportJob(params: {
    zipPath: string;
    organizationId: string;
    userId: string;
    options?: ImportRunOptions;
  }): Promise<TransferJob> {
    const job = createJob({
      type: "import",
      organizationId: params.organizationId,
      userId: params.userId,
    });

    setImmediate(async () => {
      const copiedPaths: string[] = [];
      const copiedRoots: string[] = [];
      let extractedDir = "";

      try {
        updateJob(job.id, { status: "running", phase: "validating", progress: 10 });
        throwIfCanceled(job.id);
        const parsed = await parseTransferPackageFromZip(params.zipPath);
        extractedDir = parsed.workDir;

        throwIfCanceled(job.id);
        const idMaps = remapIdsForBundle(parsed.dataBundle);
        const manifestSourceCourseId = String(parsed.manifest?.sourceCourse?.id || "");
        const sourceCourse = (parsed.dataBundle.courses || []).find((row: any) => String(row.id || "") === manifestSourceCourseId)
          || (parsed.dataBundle.courses || [])[0];
        if (!sourceCourse) {
          throw new Error("Import package has no course record");
        }

        const importMode = params.options?.mode || "create_new";
        let targetCourseIdForFiles = idMaps.allIdMap[sourceCourse.id];
        let mergeExistingIds: MergeExistingIdSets | null = null;

        if (importMode === "merge_append_versions") {
          let targetCourseId = params.options?.targetCourseId || null;
          if (!targetCourseId) {
            const candidates = await findImportMergeCandidates({
              organizationId: params.organizationId,
              sourceCourse,
            });
            targetCourseId = candidates[0]?.id || null;
          }
          if (!targetCourseId) {
            throw new Error("No matching target course was found for merge + append mode");
          }
          const mergeResult = await applyMergeEntityOverrides({
            bundle: parsed.dataBundle,
            organizationId: params.organizationId,
            sourceCourseId: sourceCourse.id,
            targetCourseId,
            idMap: idMaps.allIdMap,
          });
          params.options = {
            ...(params.options || {}),
            targetCourseId,
          };
          targetCourseIdForFiles = mergeResult.primaryCourseId;
          mergeExistingIds = mergeResult.existingIds;
        }

        if (!targetCourseIdForFiles) {
          throw new Error("Failed to map course ID during import");
        }

        updateJob(job.id, { phase: "rewriting_files", progress: 45 });
        const copied = await copyImportedFiles({
          extractedDir,
          manifest: parsed.manifest,
          organizationId: params.organizationId,
          targetCourseId: targetCourseIdForFiles,
          jobId: job.id,
        });

        copiedPaths.push(...copied.copiedPaths);
        copiedRoots.push(...copied.copiedRoots);

        updateJob(job.id, { phase: "importing_data", progress: 70 });
        throwIfCanceled(job.id);
        const importedCourseId = importMode === "merge_append_versions"
          ? params.options?.targetCourseId || targetCourseIdForFiles
          : targetCourseIdForFiles;
        const importPlan = buildCourseTransferImportPlan({
          bundle: parsed.dataBundle,
          organizationId: params.organizationId,
          userId: params.userId,
          filePathMap: copied.filePathMap,
          idMap: idMaps.allIdMap,
          sourceCourse,
          importedCourseId,
          mode: importMode,
        });

        if (importMode === "merge_append_versions" && mergeExistingIds) {
          await db.transaction(async (tx) => {
            await prepareBundleForMergeAppend({
              bundle: importPlan.rows,
              organizationId: params.organizationId,
              existingIds: mergeExistingIds,
              tx,
            });
            await executeCourseTransferImportPlan(tx, importPlan);
          });
        } else {
          await executeCourseTransferImportPlanInTransaction(importPlan);
        }

        updateJob(job.id, { phase: "converting_slide_images", progress: 88 });
        const slideImageSummary = await preconvertImportedPptxSlideImages({
          importPlan,
          jobId: job.id,
        });

        updateJob(job.id, {
          status: "completed",
          phase: "completed",
          progress: 100,
          details: {
            importedCourseId,
            importedCourseTitle: importPlan.rows.courses?.[0]?.title || sourceCourse.title || "Imported course",
            importedCounts: Object.fromEntries(INCLUDED_ENTITY_TABLES.map((table) => [table, importPlan.rows[table]?.length || 0])),
            familySummary: parsed.manifest.familySummary || buildCourseFamilySummary(parsed.dataBundle),
            targetOrganizationId: params.organizationId,
            importedCourseStatus: "draft",
            copiedArtifactCount: copied.copiedPaths.length,
            slideImageSummary,
            mode: importMode,
            targetCourseId: params.options?.targetCourseId || null,
          },
        });
      } catch (error: any) {
        console.error("[CourseTransfer] Import job failed", error);
        await cleanupFiles(copiedPaths);
        await cleanupDirectories(copiedRoots);
        if (error?.code === "JOB_CANCELED") {
          updateJob(job.id, {
            status: "canceled",
            phase: "failed",
            progress: 100,
            error: "Transfer canceled",
          });
          return;
        }
        updateJob(job.id, {
          status: "failed",
          phase: "failed",
          progress: 100,
          error: error?.message || "Import failed",
        });
      } finally {
        try {
          if (extractedDir) {
            await fs.promises.rm(extractedDir, { recursive: true, force: true });
          }
        } catch {
          // ignore
        }
        try {
          await fs.promises.unlink(params.zipPath);
        } catch {
          // ignore
        }
      }
    });

    return job;
  }

  static requestCancel(jobId: string, organizationId: string): TransferJob | null {
    const current = transferJobs.get(jobId);
    if (!current) return null;
    if (current.organizationId !== organizationId) return null;
    if (current.status === "completed" || current.status === "failed" || current.status === "canceled") {
      return current;
    }
    updateJob(jobId, { cancelRequested: true });
    return transferJobs.get(jobId) || null;
  }
}
