import { db } from "../db";
import { courseDraftDocuments, courseDraftDocumentSegments, courseDraftFrameworks, courseSourceDocuments } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { CourseFrameworkExtractor } from "../services/courseFrameworkExtractor";
import { ObjectStorageService } from "../objectStorage";
import { ContentLanguageService } from "../services/contentLanguageService";
import { isFeatureEnabled } from "../featureFlags";
import { SourceAssetService } from "../services/sourceAssetService";
import { SourceMediaExtractor } from "../services/sourceMediaExtractor";
import type { DocumentOutlineNode } from "@shared/courseFrameworkContracts";

const objectStorage = new ObjectStorageService();
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_DOCUMENTS_PER_CYCLE = 3;
const STUCK_PROCESSING_MINUTES = Number.parseInt(process.env.COURSE_DOCUMENT_STUCK_PROCESSING_MINUTES || "", 10) || 15;

let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export class DocumentExtractionWorker {
  private static isRunning = false;

  static start(): void {
    if (this.isRunning) {
      console.log("[DocumentExtractionWorker] Already running");
      return;
    }

    console.log("[DocumentExtractionWorker] Starting worker...");
    this.isRunning = true;

    workerInterval = setInterval(async () => {
      await this.processPendingDocuments();
    }, POLL_INTERVAL);
    void this.processPendingDocuments();

    console.log(`[DocumentExtractionWorker] Started with ${POLL_INTERVAL}ms interval`);
  }

  static stop(): void {
    if (workerInterval) {
      clearInterval(workerInterval);
      workerInterval = null;
    }
    this.isRunning = false;
    console.log("[DocumentExtractionWorker] Stopped");
  }

  private static async processPendingDocuments(): Promise<void> {
    if (isProcessing) {
      return;
    }

    isProcessing = true;

    try {
      await this.recoverStuckDocuments();

      const pendingDocs = await db.query.courseDraftDocuments.findMany({
        where: eq(courseDraftDocuments.extractionStatus, 'pending'),
        limit: MAX_DOCUMENTS_PER_CYCLE,
        orderBy: (docs, { asc }) => [asc(docs.createdAt)],
      });

      if (pendingDocs.length === 0) {
        return;
      }

      console.log(`[DocumentExtractionWorker] Processing ${pendingDocs.length} pending documents`);

      for (const doc of pendingDocs) {
        await this.processDocument(doc);
      }
    } catch (error) {
      console.error("[DocumentExtractionWorker] Error processing queue:", error);
    } finally {
      isProcessing = false;
    }
  }

  private static async processDocument(doc: typeof courseDraftDocuments.$inferSelect): Promise<void> {
    const docId = doc.id;
    const startTime = Date.now();

    try {
      await db.update(courseDraftDocuments)
        .set({ 
          extractionStatus: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(courseDraftDocuments.id, docId));

      console.log(`[DocumentExtractionWorker] Processing document: ${docId} (${doc.fileName})`);

      const fileBuffer = await this.downloadFile(doc.storagePath);

      const result = await CourseFrameworkExtractor.extract(
        fileBuffer,
        doc.fileName,
        doc.mimeType
      );

      const extractedContent = CourseFrameworkExtractor.toExtractedContent(result);
      const pageTexts = (result.sections || [])
        .filter((section) => typeof section.pageNumber === "number")
        .reduce<Record<number, string[]>>((acc, section) => {
          const page = section.pageNumber!;
          acc[page] = acc[page] || [];
          acc[page].push(`${section.heading || ""}\n${section.content || ""}`.trim());
          return acc;
        }, {});

      let detectedLanguage = 'en';
      try {
        const textForDetection = result.rawText || (extractedContent as any)?.text || '';
        if (textForDetection.trim()) {
          detectedLanguage = await ContentLanguageService.detectDocumentLanguage(textForDetection);
        }
      } catch (detectErr) {
        console.warn(`[DocumentExtractionWorker] Language detection failed for document ${docId}, defaulting to en:`, detectErr);
      }

      let sourceDocument = await SourceAssetService.getSourceDocumentForDraftDocument(docId);
      if (!sourceDocument) {
        const draft = await db.query.courseDraftFrameworks.findFirst({
          where: eq(courseDraftFrameworks.id, doc.draftId),
        });
        if (draft) {
          sourceDocument = await SourceAssetService.createSourceDocument({
            organizationId: draft.organizationId,
            createdBy: draft.createdBy,
            draftId: doc.draftId,
            draftDocumentId: docId,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            fileSize: doc.fileSize,
            originalStoragePath: doc.storagePath,
            checksum: doc.checksum || null,
          });
        }
      }

      let persistedAssets: any[] = [];
      let mediaWarnings: string[] = [];
      if (sourceDocument) {
        const mediaResult = await SourceMediaExtractor.extractMedia({
          buffer: fileBuffer,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          organizationId: sourceDocument.organizationId,
          sourceDocumentId: sourceDocument.id,
          pageTexts: Object.keys(pageTexts).length > 0
            ? Object.entries(pageTexts)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([, parts]) => parts.join("\n\n"))
            : undefined,
        });
        mediaWarnings = mediaResult.warnings;
        const outline = Array.isArray((extractedContent as any).documentOutline)
          ? ((extractedContent as any).documentOutline as DocumentOutlineNode[])
          : [];
        const assetsWithOutline = mediaResult.assets.map((asset) => {
          const outlineNode = this.findOutlineNodeForPage(outline, asset.pageOrSlide ?? null);
          if (!outlineNode) return asset;
          return {
            ...asset,
            metadata: {
              ...(asset.metadata || {}),
              outlineNodeId: outlineNode.id,
              outlineNodeTitle: outlineNode.title,
              outlineNodeLevel: outlineNode.level,
            },
          };
        });
        persistedAssets = await SourceAssetService.replaceAssetsForSourceDocument({
          organizationId: sourceDocument.organizationId,
          sourceDocumentId: sourceDocument.id,
          assets: assetsWithOutline,
        });
        await db.update(courseSourceDocuments)
          .set({
            extractionStatus: 'completed',
            extractionError: mediaWarnings.length > 0 ? mediaWarnings.join('\n') : null,
            extractedTextHash: (extractedContent as any).sourceMap?.rawTextHash || null,
            pageCount: result.metadata.pageCount || null,
            slideCount: result.metadata.slideCount || null,
            updatedAt: new Date(),
          })
          .where(eq(courseSourceDocuments.id, sourceDocument.id));
      }

      const sourceAssets = persistedAssets.map((asset) => ({
        id: asset.id,
        sourceDocumentId: asset.sourceDocumentId,
        assetType: asset.assetType,
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        pageOrSlide: asset.pageOrSlide,
        caption: asset.caption,
        altText: asset.altText,
        width: asset.width,
        height: asset.height,
        extractionMethod: asset.extractionMethod,
        containsEmbeddedText: asset.containsEmbeddedText || false,
        metadata: asset.metadata || undefined,
      }));

      const outlineWithAssets = this.attachAssetIdsToOutline(
        Array.isArray((extractedContent as any).documentOutline)
          ? ((extractedContent as any).documentOutline as DocumentOutlineNode[])
          : [],
        sourceAssets,
      );

      const contentWithLanguage = {
        ...extractedContent as any,
        documentOutline: outlineWithAssets,
        sourceAssets,
        mediaWarnings,
        detectedLanguage,
      };

      await db.update(courseDraftDocuments)
        .set({
          extractionStatus: 'completed',
          extractedContent: contentWithLanguage as any,
          extractionError: null,
          updatedAt: new Date(),
        })
        .where(eq(courseDraftDocuments.id, docId));

      if (isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
        const segments = CourseFrameworkExtractor.toDraftSegments(result);
        await db.delete(courseDraftDocumentSegments).where(eq(courseDraftDocumentSegments.documentId, docId));
        if (segments.length > 0) {
          await db.insert(courseDraftDocumentSegments).values(
            segments.map((segment) => ({
              draftId: doc.draftId,
              documentId: docId,
              segmentIndex: segment.segmentIndex,
              segmentType: segment.segmentType,
              text: segment.text,
              textHash: segment.textHash,
              startOffset: segment.startOffset,
              endOffset: segment.endOffset,
              headingPath: segment.headingPath,
              pageOrSlide: segment.pageOrSlide,
              metadata: segment.metadata || null,
            }))
          );
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[DocumentExtractionWorker] Document ${docId} completed in ${duration}ms: ` +
        `${result.wordCount} words, ${result.structuredHints.length} hints`
      );

    } catch (error: any) {
      console.error(`[DocumentExtractionWorker] Failed to process document ${docId}:`, error);

      await db.update(courseDraftDocuments)
        .set({
          extractionStatus: 'failed',
          extractionError: error.message || 'Unknown extraction error',
          updatedAt: new Date(),
        })
        .where(eq(courseDraftDocuments.id, docId));
    }
  }

  private static findOutlineNodeForPage(outline: DocumentOutlineNode[], pageOrSlide: number | null): DocumentOutlineNode | null {
    if (!pageOrSlide) return null;
    const candidates = outline
      .filter((node) => {
        const start = node.pageStart || node.pageEnd || null;
        const end = node.pageEnd || node.pageStart || null;
        if (!start || !end) return false;
        return pageOrSlide >= start && pageOrSlide <= end;
      })
      .sort((a, b) => {
        const depth: Record<string, number> = {
          document: 0,
          term: 1,
          chapter: 2,
          section: 3,
          slide: 3,
          subsection: 4,
        };
        return (depth[b.level] || 0) - (depth[a.level] || 0);
      });
    return candidates[0] || null;
  }

  private static attachAssetIdsToOutline(outline: DocumentOutlineNode[], assets: Array<{ id: string; pageOrSlide?: number | null; metadata?: any }>): DocumentOutlineNode[] {
    if (outline.length === 0 || assets.length === 0) return outline;
    return outline.map((node) => {
      const directAssetIds = assets
        .filter((asset) => asset.metadata?.outlineNodeId === node.id)
        .map((asset) => asset.id);
      const rangeAssetIds = assets
        .filter((asset) => {
          const page = asset.pageOrSlide || null;
          if (!page) return false;
          const start = node.pageStart || node.pageEnd || null;
          const end = node.pageEnd || node.pageStart || null;
          return Boolean(start && end && page >= start && page <= end);
        })
        .map((asset) => asset.id);
      return {
        ...node,
        assetIds: Array.from(new Set([...(node.assetIds || []), ...directAssetIds, ...rangeAssetIds])),
      };
    });
  }

  private static async downloadFile(storagePath: string): Promise<Buffer> {
    try {
      const buffer = await objectStorage.downloadCourseDraftDocument(storagePath);
      return buffer;
    } catch (error: any) {
      console.error(`[DocumentExtractionWorker] Failed to download file: ${storagePath}`, error);
      throw new Error(`Failed to download file from storage: ${error.message}`);
    }
  }

  static getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }

  static async recoverStuckDocuments(): Promise<number> {
    const stuckDocs = await db.query.courseDraftDocuments.findMany({
      where: and(
        eq(courseDraftDocuments.extractionStatus, 'processing'),
        sql`(${courseDraftDocuments.updatedAt} is null or ${courseDraftDocuments.updatedAt} < now() - make_interval(mins => ${STUCK_PROCESSING_MINUTES}))`,
      ),
    });

    if (stuckDocs.length === 0) {
      return 0;
    }

    console.log(`[DocumentExtractionWorker] Recovering ${stuckDocs.length} stuck documents`);

    for (const doc of stuckDocs) {
      await db.update(courseDraftDocuments)
        .set({
          extractionStatus: 'pending',
          extractionError: 'Recovery: Document was stuck in processing state',
          updatedAt: new Date(),
        })
        .where(eq(courseDraftDocuments.id, doc.id));

      await db.update(courseSourceDocuments)
        .set({
          extractionStatus: 'pending',
          extractionError: 'Recovery: Source document was linked to a stuck extraction',
          updatedAt: new Date(),
        })
        .where(eq(courseSourceDocuments.draftDocumentId, doc.id));
    }

    return stuckDocs.length;
  }

  static isStaleProcessingDocument(doc: typeof courseDraftDocuments.$inferSelect): boolean {
    if (doc.extractionStatus !== 'processing') return false;
    const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : null;
    const staleBefore = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000);
    return !updatedAt || updatedAt < staleBefore;
  }
}
