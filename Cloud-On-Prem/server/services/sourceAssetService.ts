import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  courseSourceAssetLinks,
  courseSourceAssets,
  courseSourceDocuments,
} from "@shared/schema";
import type { sourceAssetUseSchema } from "@shared/courseFrameworkContracts";
import type { z } from "zod";

type SourceAssetUse = z.infer<typeof sourceAssetUseSchema>;

type SourceAssetLike = {
  id: string;
  caption?: string | null;
  altText?: string | null;
  pageOrSlide?: number | null;
};

export class SourceAssetService {
  static toLessonSourceAssetRefs(assets: SourceAssetLike[], recommendedUse: SourceAssetUse) {
    return assets
      .filter((asset) => String(asset.id || "").trim().length > 0)
      .map((asset) => ({
        assetId: asset.id,
        recommendedUse,
        caption: asset.caption || null,
        altText: asset.altText || null,
        pageOrSlide: asset.pageOrSlide || null,
      }));
  }

  static async createSourceDocument(input: {
    organizationId: string;
    createdBy: string;
    draftId?: string | null;
    draftDocumentId?: string | null;
    courseId?: string | null;
    fileName: string;
    mimeType: string;
    fileSize: number;
    originalStoragePath: string;
    checksum?: string | null;
  }) {
    const [row] = await db.insert(courseSourceDocuments).values(input).returning();
    return row;
  }

  static async getSourceDocumentForDraftDocument(draftDocumentId: string) {
    return db.query.courseSourceDocuments.findFirst({
      where: eq(courseSourceDocuments.draftDocumentId, draftDocumentId),
    });
  }

  static async getOrCreateSourceDocument(input: {
    organizationId: string;
    createdBy: string;
    draftId: string;
    draftDocumentId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    originalStoragePath: string;
    checksum?: string | null;
  }) {
    const existing = await this.getSourceDocumentForDraftDocument(input.draftDocumentId);
    if (existing) return existing;
    return this.createSourceDocument(input);
  }

  static async createAssets(input: {
    organizationId: string;
    sourceDocumentId: string;
    assets: Array<{
      assetType: string;
      storageKey: string;
      mimeType: string;
      pageOrSlide?: number | null;
      caption?: string | null;
      altText?: string | null;
      width?: number | null;
      height?: number | null;
      textBefore?: string | null;
      textAfter?: string | null;
      containsEmbeddedText?: boolean;
      extractionMethod: string;
      metadata?: Record<string, unknown> | null;
    }>;
  }) {
    if (input.assets.length === 0) return [];
    return db
      .insert(courseSourceAssets)
      .values(
        input.assets.map((asset) => ({
          ...asset,
          organizationId: input.organizationId,
          sourceDocumentId: input.sourceDocumentId,
          containsEmbeddedText: asset.containsEmbeddedText || false,
          metadata: asset.metadata || null,
        })),
      )
      .returning();
  }

  static async replaceAssetsForSourceDocument(input: {
    organizationId: string;
    sourceDocumentId: string;
    assets: Parameters<typeof SourceAssetService.createAssets>[0]["assets"];
  }) {
    await db
      .delete(courseSourceAssets)
      .where(eq(courseSourceAssets.sourceDocumentId, input.sourceDocumentId));
    return this.createAssets(input);
  }

  static async listAssetsForDraft(draftId: string) {
    const docs = await db.query.courseSourceDocuments.findMany({
      where: eq(courseSourceDocuments.draftId, draftId),
    });
    if (docs.length === 0) return [];
    const docIds = docs.map((doc) => doc.id);
    return db.query.courseSourceAssets.findMany({
      where: inArray(courseSourceAssets.sourceDocumentId, docIds),
      orderBy: (assets, { asc }) => [asc(assets.sourceDocumentId), asc(assets.pageOrSlide), asc(assets.createdAt)],
    });
  }

  static async promoteDraftSourcesToCourse(draftId: string, courseId: string) {
    await db
      .update(courseSourceDocuments)
      .set({ courseId, draftId: null, updatedAt: new Date() })
      .where(eq(courseSourceDocuments.draftId, draftId));
  }

  static async linkAssets(input: {
    organizationId: string;
    assetIds: string[];
    linkedEntityType: string;
    linkedEntityId: string;
    recommendedUse: SourceAssetUse;
    sourceSegmentIds?: string[];
    createdBy?: string | null;
  }) {
    const uniqueAssetIds = Array.from(new Set(input.assetIds.filter(Boolean)));
    if (uniqueAssetIds.length === 0) return [];
    await db.delete(courseSourceAssetLinks).where(
      and(
        eq(courseSourceAssetLinks.linkedEntityType, input.linkedEntityType),
        eq(courseSourceAssetLinks.linkedEntityId, input.linkedEntityId),
        eq(courseSourceAssetLinks.recommendedUse, input.recommendedUse),
      ),
    );
    return db
      .insert(courseSourceAssetLinks)
      .values(
        uniqueAssetIds.map((assetId) => ({
          organizationId: input.organizationId,
          assetId,
          linkedEntityType: input.linkedEntityType,
          linkedEntityId: input.linkedEntityId,
          recommendedUse: input.recommendedUse,
          sourceSegmentIds: input.sourceSegmentIds || null,
          createdBy: input.createdBy || null,
        })),
      )
      .returning();
  }
}
