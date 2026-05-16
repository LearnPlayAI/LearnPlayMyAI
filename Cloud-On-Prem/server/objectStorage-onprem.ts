/**
 * On-Premises Object Storage Service — LOCAL FILESYSTEM implementation
 *
 * Drop-in replacement for objectStorage.ts (GCS-based) when running on-prem.
 * Files are stored under UPLOAD_DIR (default: ./uploads for dev, /opt/uploads for Linux production)
 *   - UPLOAD_DIR/public/   — publicly served by Nginx at /uploads/public/
 *   - UPLOAD_DIR/private/  — served via Express API at /api/files/private/
 *
 * Upload URL flow:
 *   1. Client calls an endpoint that returns `/api/upload/{uuid}`
 *   2. The UUID is stored in `pendingUploads` with destination path + 15-min TTL
 *   3. The Express server must expose POST /api/upload/:token to receive the file
 *      and write it to the destination path.
 *
 * Signed URL replacement:
 *   - GET signed URLs become `/api/files/{base64-encoded-relative-path}`
 *   - PUT signed URLs become `/api/upload/{uuid}` (token-based)
 */

import { Express, Request, Response } from "express";
import express from "express";
import { randomUUID } from "crypto";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import { createReadStream } from "fs";
import { getUploadDir, resolveStoragePath } from "./utils/uploadPaths";
import {
  buildCanonicalStorageKey,
  canonicalKeyToAbsolutePath,
  ensureCanonicalOrMapLegacy,
  isCanonicalStorageKey,
  normalizeExtension,
} from "./utils/storageKeyManager";

const UPLOAD_DIR = getUploadDir();

interface CachedLocalFile {
  file: LocalFile;
  metadata: { contentType: string; size: string };
  expiresAt: number;
}
const publicObjectCache = new Map<string, CachedLocalFile>();
const PUBLIC_OBJECT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

const collectionCoverCache = new Map<string, CachedLocalFile>();
const COLLECTION_COVER_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_COLLECTION_CACHE_SIZE = 200;

interface PendingUpload {
  destPath: string;
  expiresAt: number;
}
export const pendingUploads = new Map<string, PendingUpload>();
const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

const pendingUploadCleanupTimer = setInterval(() => {
  const now = Date.now();
  pendingUploads.forEach((entry, token) => {
    if (entry.expiresAt < now) pendingUploads.delete(token);
  });
}, 60_000);
if (typeof pendingUploadCleanupTimer.unref === "function") {
  pendingUploadCleanupTimer.unref();
}

export const objectStorageClient: any = null;

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function detectContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const fallback: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".json": "application/json",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".txt": "text/plain",
  };
  return fallback[ext] || "application/octet-stream";
}

function parseSingleByteRangeHeader(
  rangeHeader: string,
  totalBytes: number
): { start: number; end: number } | { error: true } {
  if (!rangeHeader.startsWith("bytes=")) return { error: true };
  const spec = rangeHeader.slice("bytes=".length).trim();
  // Multi-range requests are not supported on this endpoint.
  if (!spec || spec.includes(",")) return { error: true };
  const match = spec.match(/^(\d*)-(\d*)$/);
  if (!match) return { error: true };

  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return { error: true };

  // Suffix range: bytes=-N (last N bytes)
  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { error: true };
    const chunkSize = Math.min(suffixLength, totalBytes);
    return { start: totalBytes - chunkSize, end: totalBytes - 1 };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start < 0 || start >= totalBytes) return { error: true };

  let end = totalBytes - 1;
  if (endRaw) {
    end = Number(endRaw);
    if (!Number.isFinite(end) || end < start) return { error: true };
    end = Math.min(end, totalBytes - 1);
  }

  return { start, end };
}

export class LocalFile {
  public filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  createReadStream(): fs.ReadStream {
    return createReadStream(this.filePath);
  }

  async getMetadata(): Promise<[{ contentType: string; size: string }]> {
    const stats = await fs.promises.stat(this.filePath);
    return [{ contentType: detectContentType(this.filePath), size: stats.size.toString() }];
  }

  async exists(): Promise<[boolean]> {
    try {
      await fs.promises.access(this.filePath, fs.constants.F_OK);
      return [true];
    } catch {
      return [false];
    }
  }

  async download(): Promise<[Buffer]> {
    const buf = await fs.promises.readFile(this.filePath);
    return [buf];
  }

  async delete(): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async save(data: Buffer | string, _options?: any): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.promises.writeFile(this.filePath, data);
  }

  async copy(destFile: LocalFile): Promise<void> {
    await fs.promises.mkdir(path.dirname(destFile.filePath), { recursive: true });
    await fs.promises.copyFile(this.filePath, destFile.filePath);
  }
}

function resolveLocalPath(storagePath: string): string {
  if (!storagePath) {
    return storagePath;
  }
  if (isCanonicalStorageKey(storagePath)) {
    return canonicalKeyToAbsolutePath(storagePath);
  }
  return resolveStoragePath(storagePath);
}

function extFromMimeType(contentType?: string, fallback = ".bin"): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/x-zip-compressed": ".zip",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "application/json": ".json",
  };
  return normalizeExtension(map[String(contentType || "").toLowerCase()] || fallback) || fallback;
}

function createUploadToken(destPath: string): string {
  const token = randomUUID();
  pendingUploads.set(token, { destPath, expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS });
  return `/api/upload/${token}`;
}

function createSignedDownloadUrl(filePath: string, downloadFilename?: string): string {
  let relativePath = resolveStoragePath(filePath);
  if (relativePath.startsWith(UPLOAD_DIR)) {
    relativePath = relativePath.slice(UPLOAD_DIR.length);
  }
  if (relativePath.startsWith("/")) {
    relativePath = relativePath.slice(1);
  }
  const encoded = Buffer.from(relativePath, "utf-8").toString("base64url");
  if (downloadFilename && downloadFilename.trim()) {
    const params = new URLSearchParams();
    params.set("download", "1");
    params.set("filename", downloadFilename.trim());
    return `/api/files/${encoded}?${params.toString()}`;
  }
  return `/api/files/${encoded}`;
}

export function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  const pathParts = p.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

function cardImageKey(collectionName: string, cardName: string): string {
  return buildCanonicalStorageKey({
    scope: "private",
    domain: "card-img",
    extension: ".jpg",
    seed: `card:${collectionName}:${cardName}`,
  });
}

function collectionCoverKey(collectionName: string): string {
  return buildCanonicalStorageKey({
    scope: "private",
    domain: "col-cover",
    extension: ".jpg",
    seed: `cover:${collectionName}`,
  });
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): string[] {
    return [UPLOAD_DIR + "/public"];
  }

  getPrivateObjectDir(): string {
    return UPLOAD_DIR + "/private";
  }

  async searchPublicObject(filePath: string): Promise<LocalFile | null> {
    const normalizedPath = path.posix.normalize(`/${String(filePath || "")}`).replace(/^\/+/, "");
    if (!normalizedPath || normalizedPath.startsWith("..")) {
      return null;
    }

    const cached = publicObjectCache.get(normalizedPath);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.file;
    }

    const searchPaths = this.getPublicObjectSearchPaths();
    for (const searchPath of searchPaths) {
      const fullPath = path.resolve(searchPath, normalizedPath);
      const rootPath = path.resolve(searchPath);
      if (!fullPath.startsWith(`${rootPath}${path.sep}`) && fullPath !== rootPath) {
        continue;
      }
      try {
        await fs.promises.access(fullPath, fs.constants.F_OK);
        const file = new LocalFile(fullPath);
        const [metadata] = await file.getMetadata();

        if (publicObjectCache.size >= MAX_CACHE_SIZE) {
          const oldestKey = publicObjectCache.keys().next().value;
          if (oldestKey) publicObjectCache.delete(oldestKey);
        }

        publicObjectCache.set(normalizedPath, {
          file,
          metadata,
          expiresAt: Date.now() + PUBLIC_OBJECT_CACHE_TTL_MS,
        });
        return file;
      } catch {
        // not found in this path
      }
    }
    return null;
  }

  getCachedMetadata(filePath: string): { contentType: string; size: string } | null {
    const cached = publicObjectCache.get(filePath);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.metadata;
    }
    return null;
  }

  async downloadObject(file: LocalFile, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getCardImageUploadURL(collectionName: string, cardName: string): Promise<string> {
    const imagePath = canonicalKeyToAbsolutePath(cardImageKey(collectionName, cardName));
    console.log("[ObjectStorage] Generated image path:", imagePath);
    return createUploadToken(imagePath);
  }

  async getPublicObjectUploadURL(objectPath: string): Promise<string> {
    const normalized = String(objectPath || "").replace(/^\/+/, "");
    const key = normalized.startsWith("public/")
      ? `/${normalized}`
      : normalized.startsWith("k/")
        ? `/public/${normalized}`
        : buildCanonicalStorageKey({
            scope: "public",
            domain: "pubobj",
            extension: normalizeExtension(path.extname(normalized)) || ".bin",
            seed: `public-object:${normalized}:${Date.now()}`,
          });
    const fullPath = canonicalKeyToAbsolutePath(key);
    console.log("[ObjectStorage] Generated public object path:", key);
    return createUploadToken(fullPath);
  }

  async processAndUploadImage(buffer: Buffer, collectionName: string, cardName: string): Promise<void> {
    try {
      const processedBuffer = await sharp(buffer)
        .resize(800, 600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      const imagePath = canonicalKeyToAbsolutePath(cardImageKey(collectionName, cardName));

      await fs.promises.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.promises.writeFile(imagePath, processedBuffer);
    } catch (error) {
      console.error("[ObjectStorage] Error processing and uploading image:", error);
      throw error;
    }
  }

  async getCardImageFile(collectionName: string, cardName: string): Promise<LocalFile> {
    const imagePath = canonicalKeyToAbsolutePath(cardImageKey(collectionName, cardName));
    const file = new LocalFile(imagePath);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadCardImage(collectionName: string, cardName: string, res: Response) {
    try {
      const file = await this.getCardImageFile(collectionName, cardName);
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "image/jpeg",
        "Content-Length": metadata.size,
        "Cache-Control": "public, max-age=3600",
      });
      const stream = file.createReadStream();
      stream.on("error", (err: any) => {
        console.error("Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Image not found" });
      }
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }

  async deleteCardImage(collectionName: string, cardName: string): Promise<void> {
    try {
      const file = await this.getCardImageFile(collectionName, cardName);
      await file.delete();
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }

  async cardImageExists(collectionName: string, cardName: string): Promise<boolean> {
    try {
      await this.getCardImageFile(collectionName, cardName);
      return true;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return false;
      throw error;
    }
  }

  async getCollectionCoverImageUploadURL(collectionName: string): Promise<string> {
    const imagePath = canonicalKeyToAbsolutePath(collectionCoverKey(collectionName));
    console.log("[ObjectStorage] Generated collection cover image path:", imagePath);
    return createUploadToken(imagePath);
  }

  async getCollectionCoverImageFile(collectionName: string): Promise<LocalFile> {
    const cacheKey = `cover:${collectionName}`;
    const cached = collectionCoverCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.file;
    }

    const imagePath = canonicalKeyToAbsolutePath(collectionCoverKey(collectionName));
    const file = new LocalFile(imagePath);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();

    const [metadata] = await file.getMetadata();

    if (collectionCoverCache.size >= MAX_COLLECTION_CACHE_SIZE) {
      const oldestKey = collectionCoverCache.keys().next().value;
      if (oldestKey) collectionCoverCache.delete(oldestKey);
    }

    collectionCoverCache.set(cacheKey, {
      file,
      metadata,
      expiresAt: Date.now() + COLLECTION_COVER_CACHE_TTL_MS,
    });
    return file;
  }

  getCachedCollectionCoverMetadata(collectionName: string): { contentType: string; size: string } | null {
    const cacheKey = `cover:${collectionName}`;
    const cached = collectionCoverCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.metadata;
    return null;
  }

  invalidateCollectionCoverCache(collectionName: string): void {
    collectionCoverCache.delete(`cover:${collectionName}`);
  }

  async downloadCollectionCoverImage(collectionName: string, res: Response) {
    try {
      const file = await this.getCollectionCoverImageFile(collectionName);
      const cachedMeta = this.getCachedCollectionCoverMetadata(collectionName);

      if (cachedMeta) {
        res.set({
          "Content-Type": cachedMeta.contentType,
          "Content-Length": cachedMeta.size,
          "Cache-Control": "public, max-age=3600",
        });
      } else {
        const [metadata] = await file.getMetadata();
        res.set({
          "Content-Type": metadata.contentType || "image/jpeg",
          "Content-Length": metadata.size,
          "Cache-Control": "public, max-age=3600",
        });
      }

      const stream = file.createReadStream();
      stream.on("error", (err: any) => {
        console.error("Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Image not found" });
      }
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }

  async deleteCollectionCoverImage(collectionName: string): Promise<void> {
    this.invalidateCollectionCoverCache(collectionName);
    try {
      const file = await this.getCollectionCoverImageFile(collectionName);
      await file.delete();
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }

  async collectionCoverImageExists(collectionName: string): Promise<boolean> {
    try {
      await this.getCollectionCoverImageFile(collectionName);
      return true;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return false;
      throw error;
    }
  }

  // ========================================
  // COURSE THUMBNAIL MANAGEMENT
  // ========================================

  async getCourseThumbnailUploadURL(organizationId: string, courseId: string): Promise<{ uploadUrl: string; objectPath: string }> {
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "crs-thumb",
      extension: ".jpg",
      seed: `course-thumb:${organizationId}:${courseId}`,
    });
    const absolutePath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Generating course thumbnail upload URL:", objectPath);
    const uploadUrl = createUploadToken(absolutePath);
    console.log("[ObjectStorage] Generated course thumbnail upload URL successfully");
    return { uploadUrl, objectPath };
  }

  async getCourseThumbnailFile(thumbnailPath: string): Promise<LocalFile> {
    const localPath = resolveLocalPath(thumbnailPath);
    const file = new LocalFile(localPath);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async getCourseThumbnailSignedURL(thumbnailPath: string, ttlSec: number = 3600): Promise<string> {
    console.log(`[ObjectStorage] Generating course thumbnail signed URL for: ${thumbnailPath} (TTL: ${ttlSec}s)`);
    const localPath = resolveLocalPath(thumbnailPath);
    console.log("[ObjectStorage] Generated course thumbnail signed URL successfully");
    return createSignedDownloadUrl(localPath);
  }

  async deleteCourseThumbnail(thumbnailPath: string): Promise<void> {
    try {
      const file = await this.getCourseThumbnailFile(thumbnailPath);
      await file.delete();
      console.log("[ObjectStorage] Deleted course thumbnail:", thumbnailPath);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }

  async uploadCourseThumbnailFromBuffer(
    buffer: Buffer,
    organizationId: string,
    courseId: string
  ): Promise<{ objectPath: string }> {
    try {
      const processedBuffer = await sharp(buffer)
        .resize(1024, 576, { fit: "cover", position: "center", withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();

      const objectPath = buildCanonicalStorageKey({
        scope: "private",
        domain: "crs-thumb",
        extension: ".webp",
        seed: `course-thumb:${organizationId}:${courseId}:webp`,
      });
      const thumbnailPath = canonicalKeyToAbsolutePath(objectPath);

      console.log(`[ObjectStorage] Uploading AI-generated thumbnail: ${thumbnailPath} (${processedBuffer.length} bytes)`);
      await fs.promises.mkdir(path.dirname(thumbnailPath), { recursive: true });
      await fs.promises.writeFile(thumbnailPath, processedBuffer);

      console.log("[ObjectStorage] Successfully uploaded AI-generated course thumbnail");
      return { objectPath };
    } catch (error) {
      console.error("[ObjectStorage] Error uploading AI-generated thumbnail:", error);
      throw error;
    }
  }

  validateThumbnailOrgAccess(thumbnailPath: string, organizationId: string): boolean {
    const expectedPrefix = `/courses/${organizationId}/`;
    return thumbnailPath.includes(expectedPrefix);
  }

  // ========================================
  // LESSON FILE MANAGEMENT
  // ========================================

  async uploadLessonPPTX(
    organizationId: string,
    lessonId: string,
    version: number,
    buffer: Buffer,
    languageCode: string = "en"
  ): Promise<string> {
    const normalizedLanguageCode = String(languageCode || "en").trim().toLowerCase() || "en";
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-pptx",
      extension: ".pptx",
      seed: `lesson-pptx:${organizationId}:${lessonId}:${normalizedLanguageCode}:v${version}`,
    });
    const lessonPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Uploading lesson PPTX to:", lessonPath);

    try {
      await fs.promises.mkdir(path.dirname(lessonPath), { recursive: true });
      await fs.promises.writeFile(lessonPath, buffer);
      console.log(`[ObjectStorage] Uploaded PPTX successfully (${buffer.length} bytes, lang=${normalizedLanguageCode})`);
      return objectPath;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading PPTX:", error);
      throw error;
    }
  }

  async uploadLessonPDF(
    organizationId: string,
    lessonId: string,
    version: number,
    buffer: Buffer
  ): Promise<string> {
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-pdf",
      extension: ".pdf",
      seed: `lesson-pdf:${organizationId}:${lessonId}:v${version}`,
    });
    const lessonPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Uploading lesson PDF to:", lessonPath);

    try {
      await fs.promises.mkdir(path.dirname(lessonPath), { recursive: true });
      await fs.promises.writeFile(lessonPath, buffer);
      console.log(`[ObjectStorage] Uploaded PDF successfully (${buffer.length} bytes)`);
      return objectPath;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading PDF:", error);
      throw error;
    }
  }

  async uploadSourceDocument(
    organizationId: string,
    lessonId: string,
    buffer: Buffer,
    mimeType: string,
    originalFilename: string,
    languageCode: string = "en"
  ): Promise<string> {
    let extension = "bin";
    if (mimeType === "application/pdf") extension = "pdf";
    else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") extension = "docx";
    else if (mimeType === "application/msword") extension = "doc";

    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-src",
      extension: `.${extension}`,
      seed: `lesson-src:${organizationId}:${lessonId}:${languageCode}:${originalFilename}`,
    });
    const documentPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Uploading source document to:", documentPath);

    try {
      await fs.promises.mkdir(path.dirname(documentPath), { recursive: true });
      await fs.promises.writeFile(documentPath, buffer);
      console.log(`[ObjectStorage] Uploaded source document successfully (${buffer.length} bytes, ${extension})`);
      return objectPath;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading source document:", error);
      throw error;
    }
  }

  async downloadSourceDocument(sourceDocumentPath: string): Promise<Buffer> {
    console.log("[ObjectStorage] Downloading source document from:", sourceDocumentPath);
    const localPath = resolveLocalPath(sourceDocumentPath);

    try {
      await fs.promises.access(localPath, fs.constants.F_OK);
      const buffer = await fs.promises.readFile(localPath);
      console.log(`[ObjectStorage] Downloaded source document successfully (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      console.error("[ObjectStorage] Error downloading source document:", error);
      throw error;
    }
  }

  async uploadLessonVideo(
    organizationId: string,
    lessonId: string,
    buffer: Buffer,
    languageCode: string = "en"
  ): Promise<string> {
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-vid",
      extension: ".mp4",
      seed: `lesson-video:${organizationId}:${lessonId}:${languageCode}`,
    });
    const videoPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Uploading lesson video to:", videoPath);

    try {
      await fs.promises.mkdir(path.dirname(videoPath), { recursive: true });
      await fs.promises.writeFile(videoPath, buffer);
      console.log(`[ObjectStorage] Uploaded video successfully (${buffer.length} bytes)`);
      return objectPath;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading video:", error);
      throw error;
    }
  }

  async uploadLessonTranscript(
    organizationId: string,
    lessonId: string,
    version: number,
    transcriptJson: string
  ): Promise<string> {
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-trn",
      extension: ".json",
      seed: `lesson-transcript:${organizationId}:${lessonId}:v${version}`,
    });
    const transcriptPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Uploading lesson transcript to:", transcriptPath);

    try {
      await fs.promises.mkdir(path.dirname(transcriptPath), { recursive: true });
      await fs.promises.writeFile(transcriptPath, transcriptJson, "utf-8");
      console.log(`[ObjectStorage] Uploaded transcript successfully (${transcriptJson.length} bytes)`);
      return objectPath;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading transcript:", error);
      throw error;
    }
  }

  async downloadLessonTranscript(transcriptPath: string): Promise<string> {
    console.log("[ObjectStorage] Downloading lesson transcript from:", transcriptPath);
    const localPath = resolveLocalPath(transcriptPath);

    try {
      const buffer = await fs.promises.readFile(localPath, "utf-8");
      console.log(`[ObjectStorage] Downloaded transcript successfully (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      console.error("[ObjectStorage] Error downloading transcript:", error);
      throw error;
    }
  }

  async getLessonPPTXSignedURL(
    lessonPath: string,
    ttlSec: number = 900,
    options?: { downloadFilename?: string }
  ): Promise<string> {
    console.log(`[ObjectStorage] Generating signed URL for: ${lessonPath} (TTL: ${ttlSec}s)`);
    const localPath = resolveLocalPath(lessonPath);
    console.log("[ObjectStorage] Generated signed URL successfully");
    return createSignedDownloadUrl(localPath, options?.downloadFilename);
  }

  async getLessonVideoSignedURL(
    videoPath: string,
    ttlSec: number = 3600,
    options?: { downloadFilename?: string }
  ): Promise<string> {
    console.log(`[ObjectStorage] Generating video signed URL for: ${videoPath} (TTL: ${ttlSec}s)`);
    const localPath = resolveLocalPath(videoPath);
    console.log("[ObjectStorage] Generated video signed URL successfully");
    return createSignedDownloadUrl(localPath, options?.downloadFilename);
  }

  async getLessonPPTXUploadURL(
    organizationId: string,
    lessonId: string,
    version: number
  ): Promise<{ uploadUrl: string; objectPath: string }> {
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-pptx",
      extension: ".pptx",
      seed: `lesson-pptx:${organizationId}:${lessonId}:en:v${version}`,
    });
    const lessonPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Generating upload URL for:", objectPath);
    const uploadUrl = createUploadToken(lessonPath);
    console.log("[ObjectStorage] Generated upload URL successfully");
    return { uploadUrl, objectPath };
  }

  async getLessonPPTXFile(lessonPath: string): Promise<LocalFile> {
    const localPath = resolveLocalPath(lessonPath);
    const file = new LocalFile(localPath);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadLessonPPTX(lessonPath: string, res: Response) {
    try {
      const file = await this.getLessonPPTXFile(lessonPath);
      const [metadata] = await file.getMetadata();
      const filename = path.basename(lessonPath) || "lesson.pptx";

      res.set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": metadata.size,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      });

      const stream = file.createReadStream();
      stream.on("error", (err: any) => {
        console.error("Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading PPTX file:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Lesson file not found" });
      }
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }

  async downloadLessonPPTXBuffer(lessonPath: string): Promise<Buffer> {
    try {
      const file = await this.getLessonPPTXFile(lessonPath);
      const [contents] = await file.download();
      console.log(`[ObjectStorage] Downloaded PPTX buffer: ${lessonPath} (${contents.length} bytes)`);
      return contents;
    } catch (error) {
      console.error("[ObjectStorage] Error downloading PPTX buffer:", error);
      throw error;
    }
  }

  async deleteLessonPPTX(lessonPath: string): Promise<void> {
    try {
      const file = await this.getLessonPPTXFile(lessonPath);
      await file.delete();
      console.log("[ObjectStorage] Deleted lesson PPTX:", lessonPath);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }

  async deleteLessonVideo(videoPath: string): Promise<void> {
    try {
      const localPath = resolveLocalPath(videoPath);
      await fs.promises.unlink(localPath);
      console.log("[ObjectStorage] Deleted lesson video:", videoPath);
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      console.log("[ObjectStorage] Video file not found (already deleted):", videoPath);
    }
  }

  async lessonPPTXExists(lessonPath: string): Promise<boolean> {
    try {
      await this.getLessonPPTXFile(lessonPath);
      return true;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return false;
      throw error;
    }
  }

  // ========================================
  // CERTIFICATE MANAGEMENT
  // ========================================

  async uploadCertificatePDF(
    organizationId: string,
    userId: string,
    scopeId: string,
    buffer: Buffer,
    certificateId?: string
  ): Promise<string> {
    const objectPath = buildCanonicalStorageKey({
      scope: "private",
      domain: "cert",
      extension: ".pdf",
      seed: `certificate:${organizationId}:${userId}:${scopeId}:${certificateId || Date.now()}`,
    });
    const certPath = canonicalKeyToAbsolutePath(objectPath);
    console.log("[ObjectStorage] Uploading certificate PDF to:", certPath);

    try {
      await fs.promises.mkdir(path.dirname(certPath), { recursive: true });
      await fs.promises.writeFile(certPath, buffer);
      console.log(`[ObjectStorage] Uploaded certificate successfully (${buffer.length} bytes)`);
      return objectPath;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading certificate:", error);
      throw error;
    }
  }

  async deleteCertificatePDF(storagePath: string): Promise<void> {
    console.log("[ObjectStorage] Deleting certificate PDF from:", storagePath);
    const localPath = resolveLocalPath(storagePath);

    try {
      await fs.promises.unlink(localPath);
      console.log(`[ObjectStorage] Deleted certificate successfully: ${storagePath}`);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.warn(`[ObjectStorage] Certificate PDF not found (already deleted?): ${storagePath}`);
        return;
      }
      console.error("[ObjectStorage] Error deleting certificate:", error);
      throw error;
    }
  }

  async getCertificateSignedURL(certPath: string, ttlSec: number = 3600): Promise<string> {
    const localPath = resolveLocalPath(certPath);
    return createSignedDownloadUrl(localPath);
  }

  // ========================================
  // LESSON GENERATION PARAMS MANAGEMENT
  // ========================================

  buildLessonParamsPath(organizationId: string, lessonId: string): string {
    if (!organizationId || !lessonId) {
      throw new Error(`Invalid parameters: organizationId="${organizationId}", lessonId="${lessonId}"`);
    }
    return buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-prm",
      extension: ".json",
      seed: `lesson-params:${organizationId}:${lessonId}`,
    });
  }

  async uploadLessonParams(
    organizationId: string,
    lessonId: string,
    params: {
      inputText?: string;
      mainTopic?: string;
      subtopic1?: string;
      subtopic2?: string;
      themeId?: string;
      numCards?: number;
      generationMode?: string;
      sourceDocumentPath?: string;
    }
  ): Promise<string> {
    const paramsPath = this.buildLessonParamsPath(organizationId, lessonId);
    const absolutePath = canonicalKeyToAbsolutePath(paramsPath);
    console.log(`[ObjectStorage] Uploading lesson params to: ${paramsPath}`);
    console.log(`[ObjectStorage] Params content:`, JSON.stringify(params, null, 2));

    try {
      const paramsJson = JSON.stringify(params, null, 2);
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, paramsJson, "utf-8");
      console.log(`[ObjectStorage] ✅ Uploaded lesson params successfully (${paramsJson.length} bytes)`);
      return paramsPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ObjectStorage] ❌ Error uploading lesson params:", errorMessage);
      throw new Error(`Failed to upload lesson params to ${paramsPath}: ${errorMessage}`);
    }
  }

  async downloadLessonParams(
    paramsPath: string
  ): Promise<{
    inputText?: string;
    mainTopic?: string;
    subtopic1?: string;
    subtopic2?: string;
    themeId?: string;
    numCards?: number;
    generationMode?: string;
    sourceDocumentPath?: string;
  } | null> {
    try {
      console.log(`[ObjectStorage] Downloading lesson params from: ${paramsPath}`);
      const localPath = resolveLocalPath(paramsPath);

      try {
        await fs.promises.access(localPath, fs.constants.F_OK);
      } catch {
        console.warn(`[ObjectStorage] ⚠️ Lesson params not found at ${paramsPath}`);
        return null;
      }

      const contents = await fs.promises.readFile(localPath, "utf-8");
      const params = JSON.parse(contents);
      console.log(`[ObjectStorage] ✅ Retrieved lesson params (${contents.length} bytes)`);
      console.log(`[ObjectStorage] Params content:`, JSON.stringify(params, null, 2));
      return params;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ObjectStorage] ❌ Error retrieving lesson params from ${paramsPath}:`, errorMessage);
      console.warn(`[ObjectStorage] ⚠️ Regeneration will fall back to DB fields due to storage retrieval failure`);
      return null;
    }
  }

  async lessonParamsExist(organizationId: string, lessonId: string): Promise<boolean> {
    try {
      const paramsPath = this.buildLessonParamsPath(organizationId, lessonId);
      await fs.promises.access(resolveLocalPath(paramsPath), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ========================================
  // GAMMA API LOGS MANAGEMENT
  // ========================================

  buildLessonApiLogPath(organizationId: string, lessonId: string, jobId: string, attempt: number): string {
    if (!organizationId || !lessonId || !jobId) {
      throw new Error(`Invalid parameters for API log path`);
    }
    return buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-log",
      extension: ".json",
      seed: `lesson-api-log:${organizationId}:${lessonId}:${jobId}:${attempt}`,
    });
  }

  buildLessonApiLogManifestPath(organizationId: string, lessonId: string): string {
    return buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-man",
      extension: ".json",
      seed: `lesson-api-manifest:${organizationId}:${lessonId}`,
    });
  }

  async uploadLessonApiLog(
    organizationId: string,
    lessonId: string,
    jobId: string,
    attempt: number,
    logData: {
      version: number;
      request: {
        inputText: string;
        themeId: string;
        numCards: number;
        imageOptions: any;
        textOptions: any;
        timestamp: string;
      };
      pollEvents?: Array<{ timestamp: string; status: string; message?: string }>;
      response?: {
        generationId?: string;
        status?: string;
        gammaUrl?: string;
        pptxUrl?: string;
        pdfUrl?: string;
        timestamp?: string;
      };
      error?: { message: string; timestamp: string };
    }
  ): Promise<string> {
    const logPath = this.buildLessonApiLogPath(organizationId, lessonId, jobId, attempt);
    console.log(`[ObjectStorage] Uploading API log to: ${logPath}`);

    try {
      const logJson = JSON.stringify(logData, null, 2);
      const absolutePath = canonicalKeyToAbsolutePath(logPath);
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, logJson, "utf-8");
      console.log(`[ObjectStorage] ✅ Uploaded API log successfully (${logJson.length} bytes)`);
      return logPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ObjectStorage] ❌ Error uploading API log:", errorMessage);
      throw new Error(`Failed to upload API log to ${logPath}: ${errorMessage}`);
    }
  }

  async downloadLessonApiLog(logPath: string): Promise<any | null> {
    try {
      console.log(`[ObjectStorage] Downloading API log from: ${logPath}`);
      const localPath = resolveLocalPath(logPath);

      try {
        await fs.promises.access(localPath, fs.constants.F_OK);
      } catch {
        console.warn(`[ObjectStorage] ⚠️ API log not found at ${logPath}`);
        return null;
      }

      const contents = await fs.promises.readFile(localPath, "utf-8");
      const log = JSON.parse(contents);
      console.log(`[ObjectStorage] ✅ Retrieved API log (${contents.length} bytes)`);
      return log;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ObjectStorage] ❌ Error retrieving API log from ${logPath}:`, errorMessage);
      return null;
    }
  }

  async updateLessonApiLogManifest(
    organizationId: string,
    lessonId: string,
    latestSuccessfulLog: {
      jobId: string;
      attempt: number;
      logPath: string;
      timestamp: string;
      generationId?: string;
    }
  ): Promise<void> {
    const manifestPath = this.buildLessonApiLogManifestPath(organizationId, lessonId);
    console.log(`[ObjectStorage] Updating API log manifest at: ${manifestPath}`);

    try {
      const manifest = {
        version: 1,
        latestSuccessful: latestSuccessfulLog,
        updatedAt: new Date().toISOString(),
      };
      const manifestJson = JSON.stringify(manifest, null, 2);
      const absolutePath = canonicalKeyToAbsolutePath(manifestPath);
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, manifestJson, "utf-8");
      console.log(`[ObjectStorage] ✅ Updated API log manifest successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ObjectStorage] ❌ Error updating API log manifest:", errorMessage);
    }
  }

  async getLatestSuccessfulApiLog(organizationId: string, lessonId: string): Promise<any | null> {
    try {
      const manifestPath = this.buildLessonApiLogManifestPath(organizationId, lessonId);
      const localPath = resolveLocalPath(manifestPath);

      try {
        await fs.promises.access(localPath, fs.constants.F_OK);
      } catch {
        console.warn(`[ObjectStorage] ⚠️ No API log manifest found for lesson ${lessonId}`);
        return null;
      }

      const contents = await fs.promises.readFile(localPath, "utf-8");
      const manifest = JSON.parse(contents);

      if (!manifest.latestSuccessful) return null;
      return await this.downloadLessonApiLog(manifest.latestSuccessful.logPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ObjectStorage] ❌ Error retrieving latest API log:`, errorMessage);
      return null;
    }
  }

  // ========================================
  // THEME / STYLE THUMBNAILS
  // ========================================

  async uploadThemeThumbnail(themeId: string, fileBuffer: Buffer, mimeType: string): Promise<string> {
    const key = buildCanonicalStorageKey({
      scope: "public",
      domain: "theme",
      extension: extFromMimeType(mimeType, ".png"),
      seed: `theme:${themeId}:${Date.now()}`,
    });
    const fullPath = canonicalKeyToAbsolutePath(key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, fileBuffer);
    return `/api/public-objects/${key.replace(/^\/public\//, "")}`;
  }

  async deleteThemeThumbnail(thumbnailUrl: string): Promise<void> {
    try {
      const match = thumbnailUrl.match(/\/api\/public-objects\/(.+)/);
      if (!match) {
        console.warn(`[ObjectStorage] Invalid thumbnail URL format: ${thumbnailUrl}`);
        return;
      }
      const filePath = match[1];
      const publicDir = this.getPublicObjectSearchPaths()[0];
      const fullPath = path.join(publicDir, filePath);

      try {
        await fs.promises.access(fullPath, fs.constants.F_OK);
        await fs.promises.unlink(fullPath);
        console.log(`[ObjectStorage] Deleted theme thumbnail: ${filePath}`);
      } catch {
        console.warn(`[ObjectStorage] Theme thumbnail not found: ${filePath}`);
      }
    } catch (error) {
      console.error("[ObjectStorage] Error deleting theme thumbnail:", error);
      throw error;
    }
  }

  async uploadImageStyleThumbnail(styleKey: string, fileBuffer: Buffer, mimeType: string): Promise<string> {
    const key = buildCanonicalStorageKey({
      scope: "public",
      domain: "img-style",
      extension: extFromMimeType(mimeType, ".png"),
      seed: `img-style:${styleKey}`,
    });
    const fullPath = canonicalKeyToAbsolutePath(key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, fileBuffer);
    return `/api/public-objects/${key.replace(/^\/public\//, "")}`;
  }

  async deleteImageStyleThumbnail(thumbnailUrl: string): Promise<void> {
    try {
      const match = thumbnailUrl.match(/\/api\/public-objects\/(.+)/);
      if (!match) {
        console.warn(`[ObjectStorage] Invalid thumbnail URL format: ${thumbnailUrl}`);
        return;
      }
      const filePath = match[1];
      const publicDir = this.getPublicObjectSearchPaths()[0];
      const fullPath = path.join(publicDir, filePath);

      try {
        await fs.promises.access(fullPath, fs.constants.F_OK);
        await fs.promises.unlink(fullPath);
        console.log(`[ObjectStorage] Deleted image style thumbnail: ${filePath}`);
      } catch {
        console.warn(`[ObjectStorage] Image style thumbnail not found: ${filePath}`);
      }
    } catch (error) {
      console.error("[ObjectStorage] Error deleting image style thumbnail:", error);
      throw error;
    }
  }

  // ========================================
  // COURSE DRAFT DOCUMENTS
  // ========================================

  async uploadCourseDraftDocument(storagePath: string, buffer: Buffer, contentType: string): Promise<string> {
    const ext = normalizeExtension(path.extname(storagePath || "")) || extFromMimeType(contentType, ".bin");
    const canonicalKey = ensureCanonicalOrMapLegacy({
      keyOrLegacyPath: storagePath,
      fallbackScope: "private",
      fallbackDomain: "draft-doc",
      extension: ext,
      seed: storagePath,
    });
    const fullPath = canonicalKeyToAbsolutePath(canonicalKey);
    console.log("[ObjectStorage] Uploading course draft document to:", canonicalKey);

    try {
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, buffer);
      console.log(`[ObjectStorage] Uploaded course draft document successfully (${buffer.length} bytes)`);
      return canonicalKey;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading course draft document:", error);
      throw error;
    }
  }

  async uploadCourseDraftDocumentFromFile(storagePath: string, sourceFilePath: string, contentType: string): Promise<string> {
    const ext = normalizeExtension(path.extname(storagePath || "")) || extFromMimeType(contentType, ".bin");
    const canonicalKey = ensureCanonicalOrMapLegacy({
      keyOrLegacyPath: storagePath,
      fallbackScope: "private",
      fallbackDomain: "draft-doc",
      extension: ext,
      seed: storagePath,
    });
    const fullPath = canonicalKeyToAbsolutePath(canonicalKey);
    console.log("[ObjectStorage] Uploading course draft document from file to:", canonicalKey);

    try {
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.copyFile(sourceFilePath, fullPath);
      const stat = await fs.promises.stat(fullPath);
      console.log(`[ObjectStorage] Uploaded course draft document successfully (${stat.size} bytes)`);
      return canonicalKey;
    } catch (error) {
      console.error("[ObjectStorage] Error uploading course draft document from file:", error);
      throw error;
    }
  }

  async downloadCourseDraftDocument(storagePath: string): Promise<Buffer> {
    const fullPath = resolveLocalPath(storagePath);
    console.log("[ObjectStorage] Downloading course draft document from:", fullPath);

    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      const buffer = await fs.promises.readFile(fullPath);
      console.log(`[ObjectStorage] Downloaded course draft document successfully (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw error;
      const localFile = new LocalFile(fullPath);
      const [exists] = await localFile.exists();
      if (!exists) throw new ObjectNotFoundError();
      console.error("[ObjectStorage] Error downloading course draft document:", error);
      throw error;
    }
  }

  async deleteCourseDraftDocument(storagePath: string): Promise<void> {
    const fullPath = resolveLocalPath(storagePath);
    console.log("[ObjectStorage] Deleting course draft document from:", fullPath);

    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      await fs.promises.unlink(fullPath);
      console.log(`[ObjectStorage] Deleted course draft document: ${fullPath}`);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.warn(`[ObjectStorage] Course draft document not found (already deleted?): ${fullPath}`);
        return;
      }
      console.error("[ObjectStorage] Error deleting course draft document:", error);
      throw error;
    }
  }

  // ========================================
  // DURABLE COURSE SOURCE MATERIALS
  // ========================================

  async uploadCourseSourceOriginal(storagePath: string, buffer: Buffer, contentType: string): Promise<string> {
    const ext = normalizeExtension(path.extname(storagePath || "")) || extFromMimeType(contentType, ".bin");
    const canonicalKey = ensureCanonicalOrMapLegacy({
      keyOrLegacyPath: storagePath,
      fallbackScope: "private",
      fallbackDomain: "src-doc",
      extension: ext,
      seed: storagePath,
    });
    const fullPath = canonicalKeyToAbsolutePath(canonicalKey);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, buffer);
    return canonicalKey;
  }

  async downloadCourseSourceOriginal(storagePath: string): Promise<Buffer> {
    const fullPath = resolveLocalPath(storagePath);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      return await fs.promises.readFile(fullPath);
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new ObjectNotFoundError();
      throw error;
    }
  }

  async uploadCourseSourceAsset(storagePath: string, buffer: Buffer, contentType: string): Promise<string> {
    const ext = normalizeExtension(path.extname(storagePath || "")) || extFromMimeType(contentType, ".bin");
    const canonicalKey = ensureCanonicalOrMapLegacy({
      keyOrLegacyPath: storagePath,
      fallbackScope: "private",
      fallbackDomain: "source-assets",
      extension: ext,
      seed: storagePath,
    });
    const fullPath = canonicalKeyToAbsolutePath(canonicalKey);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, buffer);
    return canonicalKey;
  }

  async getCourseSourceAssetSignedURL(
    storagePath: string,
    ttlSec: number = 900,
    options?: { downloadFilename?: string }
  ): Promise<string> {
    const localPath = resolveLocalPath(storagePath);
    return createSignedDownloadUrl(localPath, options?.downloadFilename);
  }

  async deleteCourseSourceObject(storagePath: string): Promise<void> {
    const fullPath = resolveLocalPath(storagePath);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      await fs.promises.unlink(fullPath);
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }

  // ========================================
  // GENERIC OPERATIONS
  // ========================================

  async downloadFileToBuffer(storagePath: string): Promise<Buffer | null> {
    if (!storagePath) return null;

    try {
      if (storagePath.startsWith("/")) {
        const localPath = resolveLocalPath(storagePath);
        try {
          await fs.promises.access(localPath, fs.constants.F_OK);
          const buffer = await fs.promises.readFile(localPath);
          console.log(`[ObjectStorage] Downloaded file to buffer (${buffer.length} bytes): ${storagePath}`);
          return buffer;
        } catch {
          // not found at direct path
        }
      }

      const searchPaths = this.getPublicObjectSearchPaths();
      for (const searchPath of searchPaths) {
        const fullPath = path.join(searchPath, storagePath.replace(/^\/+/, ""));
        try {
          await fs.promises.access(fullPath, fs.constants.F_OK);
          const buffer = await fs.promises.readFile(fullPath);
          console.log(`[ObjectStorage] Downloaded file to buffer (${buffer.length} bytes): ${fullPath}`);
          return buffer;
        } catch {
          // not found in this search path
        }
      }

      console.warn(`[ObjectStorage] File not found for buffer download: ${storagePath}`);
      return null;
    } catch (error) {
      console.warn(`[ObjectStorage] Error downloading file to buffer: ${storagePath}`, error);
      return null;
    }
  }

  async copyObject(sourcePath: string, destPath: string): Promise<boolean> {
    try {
      const srcLocal = resolveLocalPath(sourcePath);
      const destLocal = resolveLocalPath(destPath);

      try {
        await fs.promises.access(srcLocal, fs.constants.F_OK);
      } catch {
        console.log(`[ObjectStorage] Source file not found: ${sourcePath}`);
        return false;
      }

      await fs.promises.mkdir(path.dirname(destLocal), { recursive: true });
      await fs.promises.copyFile(srcLocal, destLocal);
      console.log(`[ObjectStorage] Copied ${sourcePath} to ${destPath}`);
      return true;
    } catch (error) {
      console.error(`[ObjectStorage] Failed to copy ${sourcePath} to ${destPath}:`, error);
      return false;
    }
  }

  async deleteObject(objectPath: string): Promise<boolean> {
    try {
      const localPath = resolveLocalPath(objectPath);

      try {
        await fs.promises.access(localPath, fs.constants.F_OK);
      } catch {
        console.log(`[ObjectStorage] File not found for deletion: ${objectPath}`);
        return false;
      }

      await fs.promises.unlink(localPath);
      console.log(`[ObjectStorage] Deleted ${objectPath}`);
      return true;
    } catch (error) {
      console.error(`[ObjectStorage] Failed to delete ${objectPath}:`, error);
      return false;
    }
  }
}

export function registerUploadRoutes(app: Express): void {
  app.get('/api/files/:encodedPath', (req: Request, res: Response) => {
    try {
      const { encodedPath } = req.params;
      const relativePath = Buffer.from(encodedPath, 'base64url').toString('utf-8');

      const resolvedUploadDir = path.resolve(UPLOAD_DIR);
      const fullPath = path.resolve(path.join(UPLOAD_DIR, relativePath));

      if (!fullPath.startsWith(resolvedUploadDir)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.json': 'application/json',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.txt': 'text/plain',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('Accept-Ranges', 'bytes');
      const requestedFilename = String(req.query.filename || '').trim();
      const forceDownload = String(req.query.download || '').trim() === '1' || !!requestedFilename;
      if (forceDownload) {
        const safeRequestedFilename = requestedFilename
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const fallbackName = path.basename(fullPath);
        res.set(
          'Content-Disposition',
          `attachment; filename="${safeRequestedFilename || fallbackName}"`
        );
      }

      const stat = fs.statSync(fullPath);
      const total = stat.size;
      const rangeHeader = req.headers.range;
      let stream: fs.ReadStream;

      if (typeof rangeHeader === 'string' && rangeHeader.trim()) {
        const parsedRange = parseSingleByteRangeHeader(rangeHeader, total);
        if ('error' in parsedRange) {
          res.status(416);
          res.set('Content-Range', `bytes */${total}`);
          return res.end();
        }
        const start = parsedRange.start;
        const end = parsedRange.end;
        const chunkSize = (end - start) + 1;
        res.status(206);
        res.set('Content-Range', `bytes ${start}-${end}/${total}`);
        res.set('Content-Length', String(chunkSize));
        stream = createReadStream(fullPath, { start, end });
      } else {
        res.set('Content-Length', String(total));
        stream = createReadStream(fullPath);
      }

      stream.on('error', (err) => {
        console.error('[ObjectStorage] Error streaming file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading file' });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error('[ObjectStorage] Error serving file:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const rawParser = express.raw({ type: '*/*', limit: '100mb' });

  const handleUpload = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const pending = pendingUploads.get(token);

      if (!pending || pending.expiresAt < Date.now()) {
        if (pending) pendingUploads.delete(token);
        return res.status(404).json({ error: 'Upload token not found or expired' });
      }

      const destPath = pending.destPath;
      pendingUploads.delete(token);

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

      const body = req.body;
      if (Buffer.isBuffer(body)) {
        await fs.promises.writeFile(destPath, body);
      } else if (typeof body === 'string') {
        await fs.promises.writeFile(destPath, Buffer.from(body));
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        await fs.promises.writeFile(destPath, Buffer.concat(chunks));
      }

      console.log(`[ObjectStorage] File uploaded to: ${destPath}`);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[ObjectStorage] Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  };

  app.put('/api/upload/:token', rawParser, handleUpload);
  app.post('/api/upload/:token', rawParser, handleUpload);
}
