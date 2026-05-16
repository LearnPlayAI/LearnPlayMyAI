import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import unzipper from "unzipper";
import { ObjectStorageService } from "../objectStorage";
import { buildCanonicalStorageKey, normalizeExtension } from "../utils/storageKeyManager";

const execFileAsync = promisify(execFile);
const objectStorage = new ObjectStorageService();
const DEFAULT_PDF_SNAPSHOT_MAX_PAGES = 25;
const DEFAULT_PDF_IMAGE_MAX_PAGES = 500;
const DEFAULT_PDF_IMAGE_MAX_ASSETS = 400;

export type ExtractedSourceAsset = {
  assetType: "image" | "page_snapshot" | "slide_snapshot" | "table_snapshot";
  storageKey: string;
  mimeType: string;
  pageOrSlide: number | null;
  caption: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  textBefore?: string | null;
  textAfter?: string | null;
  containsEmbeddedText: boolean;
  extractionMethod: string;
  metadata?: Record<string, unknown>;
};

export type SourceMediaExtractionResult = {
  assets: ExtractedSourceAsset[];
  warnings: string[];
};

type ExtractMediaInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  organizationId: string;
  sourceDocumentId: string;
  pageTexts?: string[];
};

function mimeFromExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

function inferCaption(pageText: string | undefined, pageNumber: number): string {
  const match = String(pageText || "").match(/Figure\s+\d+[^\n]*/i);
  return match?.[0]?.trim() || `Page ${pageNumber}`;
}

function inferPageContext(pageText: string | undefined, caption: string): { textBefore: string | null; textAfter: string | null } {
  const text = String(pageText || "").replace(/\s+/g, " ").trim();
  if (!text) return { textBefore: null, textAfter: null };
  const captionText = String(caption || "").trim();
  const index = captionText ? text.toLowerCase().indexOf(captionText.toLowerCase()) : -1;
  if (index >= 0) {
    return {
      textBefore: text.slice(Math.max(0, index - 160), index + captionText.length).trim() || null,
      textAfter: text.slice(index, Math.min(text.length, index + captionText.length + 160)).trim() || null,
    };
  }
  return {
    textBefore: text.slice(0, 180).trim() || null,
    textAfter: text.slice(Math.max(0, text.length - 180)).trim() || null,
  };
}

function inferSlideNumberFromPath(filePath: string): number | null {
  const slideMatch = filePath.match(/slide(\d+)\.xml/i);
  if (slideMatch) return Number.parseInt(slideMatch[1], 10);
  const imageMatch = filePath.match(/image(\d+)/i);
  if (imageMatch) return Number.parseInt(imageMatch[1], 10);
  return null;
}

async function getImageMetadata(buffer: Buffer): Promise<{ width: number | null; height: number | null }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || null,
      height: metadata.height || null,
    };
  } catch {
    return { width: null, height: null };
  }
}

export class SourceMediaExtractor {
  static async extractMedia(input: ExtractMediaInput): Promise<SourceMediaExtractionResult> {
    if (input.mimeType === "application/pdf" || input.mimeType.includes("pdf")) {
      return this.extractPdfPageSnapshots(input);
    }
    if (input.mimeType.includes("wordprocessingml") || input.fileName.toLowerCase().endsWith(".docx")) {
      return this.extractZipImages(input, "word/media/", "docx-media");
    }
    if (input.mimeType.includes("presentationml") || input.fileName.toLowerCase().endsWith(".pptx")) {
      return this.extractZipImages(input, "ppt/media/", "pptx-media");
    }
    return { assets: [], warnings: [`Unsupported media extraction type: ${input.mimeType}`] };
  }

  static async extractPdfPageSnapshotsForPages(
    input: ExtractMediaInput & { pages: number[] },
  ): Promise<SourceMediaExtractionResult> {
    if (!(input.mimeType === "application/pdf" || input.mimeType.includes("pdf"))) {
      return { assets: [], warnings: [`Selected page snapshots are only supported for PDF files.`] };
    }

    const pages = Array.from(
      new Set(
        (input.pages || [])
          .map((page) => Number.parseInt(String(page), 10))
          .filter((page) => Number.isFinite(page) && page > 0),
      ),
    ).sort((a, b) => a - b);

    if (pages.length === 0) return { assets: [], warnings: [] };

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "learnplay-source-pdf-selected-"));
    const pdfPath = path.join(tempDir, "input.pdf");
    const warnings: string[] = [];
    const assets: ExtractedSourceAsset[] = [];

    try {
      await fs.writeFile(pdfPath, input.buffer);
      for (const pageNumber of pages) {
        const outputPrefix = path.join(tempDir, `selected-page-${pageNumber}`);
        try {
          await execFileAsync("pdftoppm", ["-png", "-r", "96", "-f", String(pageNumber), "-l", String(pageNumber), pdfPath, outputPrefix]);
          const files = (await fs.readdir(tempDir))
            .filter((file) => file.startsWith(`selected-page-${pageNumber}-`) && file.endsWith(".png"))
            .sort();
          const file = files[0];
          if (!file) {
            warnings.push(`No page snapshot was produced for page ${pageNumber}.`);
            continue;
          }

          const buffer = await fs.readFile(path.join(tempDir, file));
          const metadata = await getImageMetadata(buffer);
          const caption = inferCaption(input.pageTexts?.[pageNumber - 1], pageNumber);
          const context = inferPageContext(input.pageTexts?.[pageNumber - 1], caption);
          const storageKey = buildCanonicalStorageKey({
            scope: "private",
            domain: "source-assets",
            extension: ".png",
            seed: `${input.organizationId}:${input.sourceDocumentId}:pdf-page-selected:${pageNumber}`,
          });
          const uploadedKey = await objectStorage.uploadCourseSourceAsset(storageKey, buffer, "image/png");
          assets.push({
            assetType: "page_snapshot",
            storageKey: uploadedKey,
            mimeType: "image/png",
            pageOrSlide: pageNumber,
            caption,
            altText: caption,
            width: metadata.width,
            height: metadata.height,
            textBefore: context.textBefore,
            textAfter: context.textAfter,
            containsEmbeddedText: true,
            extractionMethod: "pdftoppm-selected",
            metadata: {
              sourceFileName: input.fileName,
              sourceDocumentType: "pdf",
              selectedPageSnapshot: true,
              page: pageNumber,
            },
          });
        } catch (pageError: any) {
          warnings.push(`Selected page snapshot failed for page ${pageNumber}: ${pageError?.message || String(pageError)}`);
        }
      }
    } catch (error: any) {
      warnings.push(`Selected PDF page snapshot extraction failed: ${error?.message || String(error)}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    return { assets, warnings };
  }

  private static async extractPdfPageSnapshots(input: ExtractMediaInput): Promise<SourceMediaExtractionResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "learnplay-source-pdf-"));
    const pdfPath = path.join(tempDir, "input.pdf");
    const outputPrefix = path.join(tempDir, "page");
    const warnings: string[] = [];
    const assets: ExtractedSourceAsset[] = [];

    try {
      await fs.writeFile(pdfPath, input.buffer);
      const maxSnapshotPages = Number.parseInt(process.env.SOURCE_PDF_SNAPSHOT_MAX_PAGES || "", 10);
      const snapshotPageLimit = Number.isFinite(maxSnapshotPages) && maxSnapshotPages > 0 ? maxSnapshotPages : DEFAULT_PDF_SNAPSHOT_MAX_PAGES;
      const maxImagePages = Number.parseInt(process.env.SOURCE_PDF_IMAGE_MAX_PAGES || "", 10);
      const imagePageLimit = Number.isFinite(maxImagePages) && maxImagePages > 0 ? maxImagePages : DEFAULT_PDF_IMAGE_MAX_PAGES;
      try {
        const imageAssets = await this.extractPdfEmbeddedImages(input, tempDir, pdfPath, imagePageLimit);
        assets.push(...imageAssets);
      } catch (imageError: any) {
        warnings.push(`PDF embedded image extraction failed: ${imageError?.message || String(imageError)}`);
      }
      await execFileAsync("pdftoppm", ["-png", "-r", "96", "-f", "1", "-l", String(snapshotPageLimit), pdfPath, outputPrefix]);
      const files = (await fs.readdir(tempDir))
        .filter((file) => /^page-\d+\.png$/.test(file))
        .sort();

      for (const file of files) {
        const pageMatch = file.match(/page-(\d+)\.png/);
        const pageNumber = pageMatch ? Number.parseInt(pageMatch[1], 10) : assets.length + 1;
        const buffer = await fs.readFile(path.join(tempDir, file));
        const metadata = await getImageMetadata(buffer);
        const caption = inferCaption(input.pageTexts?.[pageNumber - 1], pageNumber);
        const context = inferPageContext(input.pageTexts?.[pageNumber - 1], caption);
        const storageKey = buildCanonicalStorageKey({
          scope: "private",
          domain: "source-assets",
          extension: ".png",
          seed: `${input.organizationId}:${input.sourceDocumentId}:pdf-page:${pageNumber}`,
        });
        const uploadedKey = await objectStorage.uploadCourseSourceAsset(storageKey, buffer, "image/png");
        assets.push({
          assetType: "page_snapshot",
          storageKey: uploadedKey,
          mimeType: "image/png",
          pageOrSlide: pageNumber,
          caption,
          altText: caption,
          width: metadata.width,
          height: metadata.height,
          textBefore: context.textBefore,
          textAfter: context.textAfter,
          containsEmbeddedText: true,
          extractionMethod: "pdftoppm",
          metadata: {
            sourceFileName: input.fileName,
            sourceDocumentType: "pdf",
            page: pageNumber,
            snapshotPageLimit,
          },
        });
      }
      if (files.length >= snapshotPageLimit) {
        warnings.push(`PDF page snapshots were limited to the first ${snapshotPageLimit} pages. Increase SOURCE_PDF_SNAPSHOT_MAX_PAGES for fuller page snapshot coverage.`);
      }
    } catch (error: any) {
      warnings.push(`PDF media extraction failed: ${error?.message || String(error)}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    return { assets, warnings };
  }

  private static async extractPdfEmbeddedImages(
    input: ExtractMediaInput,
    tempDir: string,
    pdfPath: string,
    pageLimit: number,
  ): Promise<ExtractedSourceAsset[]> {
    const maxAssets = Number.parseInt(process.env.SOURCE_PDF_IMAGE_MAX_ASSETS || "", 10);
    const imageAssetLimit = Number.isFinite(maxAssets) && maxAssets > 0 ? maxAssets : DEFAULT_PDF_IMAGE_MAX_ASSETS;
    const listResult = await execFileAsync("pdfimages", ["-list", "-f", "1", "-l", String(pageLimit), pdfPath]);
    const rows = String(listResult.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d+\s+\d+\s+/.test(line))
      .slice(0, imageAssetLimit);
    if (rows.length === 0) return [];

    const imagePrefix = path.join(tempDir, "embedded");
    await execFileAsync("pdfimages", ["-png", "-f", "1", "-l", String(pageLimit), pdfPath, imagePrefix]);
    const files = (await fs.readdir(tempDir))
      .filter((file) => /^embedded-\d+\.(?:png|ppm|pbm|jpg|jpeg)$/i.test(file))
      .sort();
    const assets: ExtractedSourceAsset[] = [];

    for (let index = 0; index < Math.min(files.length, rows.length); index++) {
      const rowParts = rows[index].split(/\s+/);
      const pageNumber = Number.parseInt(rowParts[0], 10) || null;
      const file = files[index];
      const buffer = await fs.readFile(path.join(tempDir, file));
      const mimeType = mimeFromExtension(file);
      const metadata = await getImageMetadata(buffer);
      if ((metadata.width || 0) < 80 || (metadata.height || 0) < 80) {
        continue;
      }
      const ext = normalizeExtension(path.extname(file)) || extensionFromMime(mimeType);
      const caption = pageNumber ? inferCaption(input.pageTexts?.[pageNumber - 1], pageNumber) : `Figure ${assets.length + 1}`;
      const context = pageNumber ? inferPageContext(input.pageTexts?.[pageNumber - 1], caption) : { textBefore: null, textAfter: null };
      const storageKey = buildCanonicalStorageKey({
        scope: "private",
        domain: "source-assets",
        extension: ext,
        seed: `${input.organizationId}:${input.sourceDocumentId}:pdf-image:${index}:${pageNumber || "unknown"}`,
      });
      const uploadedKey = await objectStorage.uploadCourseSourceAsset(storageKey, buffer, mimeType);
      assets.push({
        assetType: "image",
        storageKey: uploadedKey,
        mimeType,
        pageOrSlide: pageNumber,
        caption,
        altText: caption,
        width: metadata.width,
        height: metadata.height,
        textBefore: context.textBefore,
        textAfter: context.textAfter,
        containsEmbeddedText: false,
        extractionMethod: "pdfimages",
        metadata: {
          sourceFileName: input.fileName,
          sourceDocumentType: "pdf",
          imageIndex: index,
          page: pageNumber,
          imagePageLimit: pageLimit,
        },
      });
    }

    return assets;
  }

  private static async extractZipImages(
    input: ExtractMediaInput,
    mediaPrefix: "word/media/" | "ppt/media/",
    extractionMethod: "docx-media" | "pptx-media",
  ): Promise<SourceMediaExtractionResult> {
    const assets: ExtractedSourceAsset[] = [];
    const warnings: string[] = [];

    try {
      const directory = await unzipper.Open.buffer(input.buffer);
      const mediaFiles = directory.files
        .filter((file) => !file.type || file.type === "File")
        .filter((file) => file.path.startsWith(mediaPrefix))
        .filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file.path));

      for (let index = 0; index < mediaFiles.length; index++) {
        const file = mediaFiles[index];
        const buffer = await file.buffer();
        const mimeType = mimeFromExtension(file.path);
        const ext = normalizeExtension(path.extname(file.path)) || extensionFromMime(mimeType);
        const metadata = await getImageMetadata(buffer);
        const pageOrSlide = extractionMethod === "pptx-media" ? inferSlideNumberFromPath(file.path) : null;
        const leaf = path.basename(file.path, path.extname(file.path));
        const caption = extractionMethod === "pptx-media"
          ? `Slide ${pageOrSlide || assets.length + 1} image`
          : `Document image ${assets.length + 1}`;
        const storageKey = buildCanonicalStorageKey({
          scope: "private",
          domain: "source-assets",
          extension: ext,
          seed: `${input.organizationId}:${input.sourceDocumentId}:${file.path}`,
        });
        const uploadedKey = await objectStorage.uploadCourseSourceAsset(storageKey, buffer, mimeType);
        assets.push({
          assetType: "image",
          storageKey: uploadedKey,
          mimeType,
          pageOrSlide,
          caption,
          altText: caption,
          width: metadata.width,
          height: metadata.height,
          containsEmbeddedText: false,
          extractionMethod,
          metadata: {
            sourceFileName: input.fileName,
            sourceDocumentType: extractionMethod === "pptx-media" ? "pptx" : "docx",
            packagePath: file.path,
            originalName: leaf,
            documentOrdinal: index + 1,
            slide: pageOrSlide,
            contextConfidence: pageOrSlide ? "medium" : "low",
          },
        });
      }
    } catch (error: any) {
      warnings.push(`${extractionMethod} extraction failed: ${error?.message || String(error)}`);
    }

    return { assets, warnings };
  }
}
