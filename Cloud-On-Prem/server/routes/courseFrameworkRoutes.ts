import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { db } from '../db';
import { courseDraftFrameworks, courseDraftDocuments, courseDraftDocumentSegments, courseDraftTopicAssignments, courseDraftCoverageReports, users, organizations, lessons as lessonsTable, courseFrameworks, courses, courseVersions, courseLessons, organizationUnits, subjects, courseCategories, courseAssignments, courseSourceDocuments, courseSourceAssets, lessonContentVersions } from '@shared/schema';
import { eq, and, desc, sql, inArray, asc } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorage';
import { CourseFrameworkExtractor } from '../services/courseFrameworkExtractor';
import { CourseService } from '../services/courseService';
import { LessonService } from '../services/lessonService';
import { SourceAssetService } from '../services/sourceAssetService';
import { SourceMediaExtractor } from '../services/sourceMediaExtractor';
import { buildPptxDocumentLessons, derivePptxCourseTitle, isPptxDraftDocument } from '../services/pptxCourseLessonBuilder';
import { buildDeterministicLessonsFromTopics, normalizeCourseCreationLessonPlan } from '../services/courseCreationLessonPlan';

const objectStorage = new ObjectStorageService();
import { isTeacherOrAdmin } from '../tenantMiddleware';
import { getEffectiveOrganizationId, getEffectiveOrganization } from './shared';
import { COURSE_CATEGORIES } from '@shared/courseCategories';
import { isFeatureEnabled } from '../featureFlags';
import { storage } from '../storage';
import {
  createDraftRequestSchema,
  updateDraftRequestSchema,
  type ExtractedSection,
  type AdvisorHint,
} from '@shared/courseFrameworkContracts';
import { buildSourceLessonContent } from '@shared/sourceLessonContent';
import { buildFinalizedSourceLessonMaterialV2 } from '../services/sourceLessonMaterialV2Service';
import { courseFrameworkAIService } from '../services/courseFrameworkAIService';
import { normalizeTopicLabel, stripLessonPrefix, validateTopicName } from '../services/courseFrameworkTopicValidation';
import { getOrgTypePolicyById } from '../services/orgTypePolicy';
import { DocumentExtractionWorker } from '../workers/documentExtractionWorker';
import { contentCoachService } from '../services/contentCoachService';
import { HybridCreditService, InsufficientHybridCreditsError } from '../services/hybridCreditService';
import { healthReportPricingService } from '../services/healthReportPricingService';
import { topicAnalysisPricingService } from '../services/topicAnalysisPricingService';
import { frameworkPricingService } from '../services/frameworkPricingService';
import { randomUUID } from 'crypto';
import { COURSE_PER_TOPIC_CREDITS, COURSE_MAX_CREDITS } from '@shared/creditConstants';
import type { DocumentOutlineNode } from '@shared/courseFrameworkContracts';

const router = Router();

function resolveDocumentOutline(content: any, doc: { fileName: string; mimeType: string }): any[] {
  if (Array.isArray(content?.documentOutline) && content.documentOutline.length > 0) {
    return content.documentOutline;
  }
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  if (sections.length === 0) return [];
  return CourseFrameworkExtractor.buildDocumentOutline({
    rawText: String(content?.rawText || sections.map((section: any) => `${section.heading || ''}\n${section.content || ''}`).join('\n\n')),
    sections,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
  });
}

function normalizeOutlineMatch(text: string): string {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getDocumentOutlineSelection(draft: { courseSettings?: unknown }) {
  const selection = (((draft.courseSettings as any) || {})?.documentOutlineSelection || {}) as {
    selectedNodeIds?: string[];
    contextNodeIds?: string[];
  };
  const selectedNodeIds = new Set(
    Array.isArray(selection.selectedNodeIds)
      ? selection.selectedNodeIds.map((id) => String(id || '')).filter(Boolean)
      : [],
  );
  const contentNodeIds = new Set([
    ...selectedNodeIds,
    ...(Array.isArray(selection.contextNodeIds)
      ? selection.contextNodeIds.map((id) => String(id || '')).filter(Boolean)
      : []),
  ]);
  return { selectedNodeIds, contentNodeIds };
}

function collectSelectedOutlineNodes(
  completedDocs: Array<{ fileName: string; mimeType: string; extractedContent: any }>,
  selectedNodeIds: Set<string>,
  contentNodeIds: Set<string>,
  selectedTopicNames: string[] = [],
) {
  const selectedNodes: DocumentOutlineNode[] = [];
  const contentNodes: DocumentOutlineNode[] = [];
  const outlineById = new Map<string, DocumentOutlineNode>();
  const selectedTopicKeys = new Set(selectedTopicNames.map((name) => normalizeOutlineMatch(name)).filter(Boolean));

  for (const doc of completedDocs) {
    const outline = resolveDocumentOutline(doc.extractedContent, doc);
    for (const node of outline) {
      if (!node?.id) continue;
      outlineById.set(String(node.id), node);
      if (selectedNodeIds.has(String(node.id))) selectedNodes.push(node);
      if (contentNodeIds.has(String(node.id))) contentNodes.push(node);
    }
  }

  if (selectedNodes.length === 0 && selectedTopicKeys.size > 0) {
    for (const node of outlineById.values()) {
      const level = String(node.level || '').toLowerCase();
      if (!['chapter', 'section', 'subsection', 'slide'].includes(level)) continue;
      const nodeKey = normalizeOutlineMatch(node.title || '');
      if (!nodeKey || !selectedTopicKeys.has(nodeKey)) continue;
      selectedNodes.push(node);
      contentNodes.push(node);
    }
  }

  const lessonNodes = compactOutlineLessonNodes(selectedNodes, contentNodes, outlineById);
  return { selectedNodes, contentNodes, lessonNodes, outlineById };
}

function compactOutlineLessonNodes(
  selectedNodes: DocumentOutlineNode[],
  contentNodes: DocumentOutlineNode[],
  outlineById: Map<string, DocumentOutlineNode>,
): DocumentOutlineNode[] {
  const selectedIds = new Set(selectedNodes.map((node) => String(node.id)));
  const selectedOrContextIds = new Set([...selectedIds, ...contentNodes.map((node) => String(node.id))]);
  const candidateById = new Map<string, DocumentOutlineNode>();

  for (const node of selectedNodes) {
    const level = String(node.level || '').toLowerCase();
    if (['chapter', 'section', 'slide'].includes(level)) {
      candidateById.set(String(node.id), node);
      continue;
    }

    let assignedToParent = false;
    let parentId = String(node.parentId || '');
    while (parentId) {
      const parent = outlineById.get(parentId);
      if (!parent) break;
      const parentLevel = String(parent.level || '').toLowerCase();
      if (['chapter', 'section', 'slide'].includes(parentLevel) && selectedOrContextIds.has(String(parent.id))) {
        candidateById.set(String(parent.id), parent);
        assignedToParent = true;
        break;
      }
      parentId = String(parent.parentId || '');
    }

    if (!assignedToParent) candidateById.set(String(node.id), node);
  }

  return Array.from(candidateById.values())
    .filter((node) => ['chapter', 'section', 'subsection', 'slide'].includes(String(node.level || '').toLowerCase()))
    .sort((a, b) => (a.pageStart || 0) - (b.pageStart || 0) || (a.order || 0) - (b.order || 0));
}

function attachOutlineAssetsToLessons(lessons: any[], completedDocs: Array<{ extractedContent: any }>): any[] {
  const outlineNodes: DocumentOutlineNode[] = [];
  const assets: any[] = [];
  for (const doc of completedDocs) {
    const content = doc.extractedContent as any;
    if (Array.isArray(content?.documentOutline)) outlineNodes.push(...content.documentOutline);
    if (Array.isArray(content?.sourceAssets)) assets.push(...content.sourceAssets);
  }
  if (outlineNodes.length === 0 || assets.length === 0) return lessons;

  return lessons.map((lesson) => {
    const type = String(lesson?.lessonType || '').toLowerCase();
    if (type !== 'content') return lesson;
    const explicitNodeId = String(lesson?.sourceOutlineNodeId || '');
    const lessonKey = normalizeOutlineMatch(lesson?.title || '');
    const node = explicitNodeId
      ? outlineNodes.find((candidate) => String(candidate.id || '') === explicitNodeId)
      : outlineNodes.find((candidate) => {
          const nodeKey = normalizeOutlineMatch(candidate.title || '');
          return nodeKey === lessonKey || nodeKey.includes(lessonKey) || lessonKey.includes(nodeKey);
        });
    if (!node) return lesson;
    const pageStart = node.pageStart || node.pageEnd || null;
    const pageEnd = node.pageEnd || node.pageStart || null;
    const seenAssetIds = new Set<string>();
    const lessonAssets = assets
      .filter((asset) => {
        const metadata = asset?.metadata || {};
        if (metadata.outlineNodeId === node.id) return true;
        const page = asset?.pageOrSlide || null;
        return Boolean(page && pageStart && pageEnd && page >= pageStart && page <= pageEnd);
      })
      .sort((a, b) => {
        const typeScore = (asset: any) => asset.assetType === 'image' ? 0 : 1;
        return typeScore(a) - typeScore(b) || ((a.pageOrSlide || 0) - (b.pageOrSlide || 0));
      })
      .filter((asset) => {
        const id = String(asset?.id || '');
        if (!id) return false;
        if (seenAssetIds.has(id)) return false;
        seenAssetIds.add(id);
        return true;
      })
      .map((asset) => ({
        assetId: asset.id,
        recommendedUse: 'lesson_visual',
        caption: asset.caption || null,
        altText: asset.altText || null,
        pageOrSlide: asset.pageOrSlide || null,
      }));
    return {
      ...lesson,
      sourceAssets: lessonAssets,
      sourceOutlineNodeId: node.id,
      sourcePageStart: pageStart,
      sourcePageEnd: pageEnd,
    };
  });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const uploadDir = path.join(os.tmpdir(), 'learnplay-course-draft-uploads');
        await fs.promises.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
      } catch (error: any) {
        cb(error, '');
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.upload';
      cb(null, `draft-doc-${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  limits: {
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (CourseFrameworkExtractor.isAllowedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only Word (.docx), PowerPoint (.pptx), and PDF (.pdf) files are allowed.`));
    }
  },
});

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

async function getUserEffectiveOrganizationId(req: Request): Promise<string | null> {
  if (req.session?.context) {
    return getEffectiveOrganizationId(req.session);
  }
  
  if (!req.session.userId) {
    return null;
  }
  
  const userRoles = await storage.getUserRoles(req.session.userId);
  if (userRoles.length > 0) {
    return userRoles[0].organizationId;
  }
  
  return null;
}

async function verifyDraftAccess(
  req: Request,
  draftId: string,
  effectiveOrgId: string | null
): Promise<{ draft: typeof courseDraftFrameworks.$inferSelect | null; error: string | null; statusCode: number }> {
  if (!effectiveOrgId) {
    return { draft: null, error: 'No organization context', statusCode: 403 };
  }

  const draft = await db.query.courseDraftFrameworks.findFirst({
    where: eq(courseDraftFrameworks.id, draftId),
  });

  if (!draft) {
    return { draft: null, error: 'Draft not found', statusCode: 404 };
  }

  if (draft.organizationId !== effectiveOrgId) {
    return { draft: null, error: 'Access denied', statusCode: 403 };
  }

  return { draft, error: null, statusCode: 200 };
}

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const validation = createDraftRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validation.error.errors 
      });
    }

    const { organizationId, courseDescription } = validation.data;

    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    // Always anchor draft creation to the effective session org context (including impersonation).
    // This prevents stale client-side org IDs from causing false 403s after org switching.
    if (organizationId && organizationId !== effectiveOrgId) {
      console.warn(
        `[CourseFramework] Create draft org mismatch: requested=${organizationId}, effective=${effectiveOrgId}, user=${userId}. Using effective org.`
      );
    }
    const targetOrganizationId = effectiveOrgId;

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, targetOrganizationId),
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const [draft] = await db.insert(courseDraftFrameworks)
      .values({
        organizationId: targetOrganizationId,
        createdBy: userId,
        courseDescription: courseDescription || null,
        currentStep: 'upload',
        expiresAt,
      })
      .returning();

    console.log(`[CourseFramework] Created draft ${draft.id} for org ${targetOrganizationId} by user ${userId}`);

    res.status(201).json({
      id: draft.id,
      organizationId: draft.organizationId,
      createdBy: draft.createdBy,
      currentStep: draft.currentStep,
      createdAt: draft.createdAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('[CourseFramework] Create draft error:', error);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// Get topic analysis credit cost for regular users
// NOTE: Must be defined BEFORE /:draftId routes to avoid being caught by the param route
router.get('/topic-analysis-cost', requireAuth, async (req: Request, res: Response) => {
  try {
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const creditCost = await topicAnalysisPricingService.getTopicAnalysisCreditCost(effectiveOrgId);
    res.json({ creditCost });
  } catch (error: any) {
    console.error('[CourseFramework] Error fetching topic analysis cost:', error);
    res.status(500).json({ error: 'Failed to fetch topic analysis cost' });
  }
});

// Get framework generation credit costs for regular users
// Base cost is configurable via SuperAdmin, per-topic and max from constants
router.get('/framework-generation-cost', requireAuth, async (req: Request, res: Response) => {
  try {
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const baseCreditCost = await frameworkPricingService.getFrameworkCreditCost(effectiveOrgId);
    res.json({ 
      baseCreditCost,
      perTopicCost: COURSE_PER_TOPIC_CREDITS,
      maxCreditCost: COURSE_MAX_CREDITS,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Error fetching framework generation cost:', error);
    res.status(500).json({ error: 'Failed to fetch framework generation cost' });
  }
});

// Get AI content generation credit costs (description generation, lesson content generation)
// These operations are currently free, returning 0 cost
router.get('/content-generation-cost', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ 
      descriptionCost: 0,
      lessonContentCost: 0,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Error fetching content generation cost:', error);
    res.status(500).json({ error: 'Failed to fetch content generation cost' });
  }
});

router.get('/:draftId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const draftWithDocs = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draftWithDocs) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json({
      id: draftWithDocs.id,
      organizationId: draftWithDocs.organizationId,
      createdBy: draftWithDocs.createdBy,
      courseDescription: draftWithDocs.courseDescription,
      generatedTitle: draftWithDocs.generatedTitle,
      generatedDescription: draftWithDocs.generatedDescription,
      generatedLessons: draftWithDocs.generatedLessons,
      currentStep: draftWithDocs.currentStep,
      version: draftWithDocs.version,
      courseSettings: draftWithDocs.courseSettings,
      // Topic analysis state for persistence across navigation
      analyzedTopics: draftWithDocs.analyzedTopics,
      selectedTopics: draftWithDocs.selectedTopics,
      customTopics: draftWithDocs.customTopics,
      suggestedTitle: draftWithDocs.suggestedTitle,
      // Framework generation job status (for background processing and page reload recovery)
      generationStatus: draftWithDocs.generationStatus,
      generationError: draftWithDocs.generationError,
      generationStartedAt: draftWithDocs.generationStartedAt?.toISOString(),
      generationCompletedAt: draftWithDocs.generationCompletedAt?.toISOString(),
      documents: draftWithDocs.documents.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        extractionStatus: doc.extractionStatus,
        extractionError: doc.extractionError,
        detectedLanguage: (doc.extractedContent as any)?.detectedLanguage || null,
        createdAt: doc.createdAt?.toISOString(),
      })),
      createdAt: draftWithDocs.createdAt?.toISOString(),
      updatedAt: draftWithDocs.updatedAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('[CourseFramework] Get draft error:', error);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

router.post('/:draftId/documents', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  let tempUploadPath: string | null = null;

  try {
    const { draftId } = req.params;
    const userId = req.session.userId!;
    const file = req.file;
    tempUploadPath = file?.path || null;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    try {
      CourseFrameworkExtractor.validateFile(file.mimetype, file.size);
    } catch (validationError: any) {
      return res.status(400).json({ error: validationError.message });
    }

    const storagePath = CourseFrameworkExtractor.generateStoragePath(
      draft!.organizationId,
      userId,
      file.originalname
    );

    if (file.path) {
      await objectStorage.uploadCourseDraftDocumentFromFile(storagePath, file.path, file.mimetype);
    } else if (file.buffer) {
      await objectStorage.uploadCourseDraftDocument(storagePath, file.buffer, file.mimetype);
    } else {
      return res.status(400).json({ error: 'Uploaded file could not be read' });
    }

    const [document] = await db.insert(courseDraftDocuments)
      .values({
        draftId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storagePath,
        extractionStatus: 'pending',
      })
      .returning();

    await SourceAssetService.createSourceDocument({
      organizationId: draft!.organizationId,
      createdBy: userId,
      draftId,
      draftDocumentId: document.id,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      originalStoragePath: storagePath,
    });

    console.log(`[CourseFramework] Uploaded document ${document.id} to draft ${draftId}`);

    res.status(201).json({
      documentId: document.id,
      storagePath: document.storagePath,
      fileName: document.fileName,
      status: document.extractionStatus,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Upload document error:', error);

    res.status(500).json({ error: 'Failed to upload document' });
  } finally {
    if (tempUploadPath) {
      fs.promises.unlink(tempUploadPath).catch((cleanupError) => {
        console.warn(`[CourseFramework] Failed to remove temporary upload ${tempUploadPath}:`, cleanupError);
      });
    }
  }
});

router.get('/:draftId/documents/:docId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId, docId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const document = await db.query.courseDraftDocuments.findFirst({
      where: and(
        eq(courseDraftDocuments.id, docId),
        eq(courseDraftDocuments.draftId, draftId)
      ),
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      id: document.id,
      draftId: document.draftId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      extractionStatus: document.extractionStatus,
      extractionError: document.extractionError,
      createdAt: document.createdAt?.toISOString(),
      updatedAt: document.updatedAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('[CourseFramework] Get document error:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.get('/:draftId/documents/:docId/content', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId, docId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const document = await db.query.courseDraftDocuments.findFirst({
      where: and(
        eq(courseDraftDocuments.id, docId),
        eq(courseDraftDocuments.draftId, draftId)
      ),
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.extractionStatus === 'pending') {
      return res.status(202).json({
        status: 'pending',
        message: 'Document extraction is queued',
      });
    }

    if (document.extractionStatus === 'processing') {
      return res.status(202).json({
        status: 'processing',
        message: 'Document extraction is in progress',
      });
    }

    if (document.extractionStatus === 'failed') {
      return res.status(422).json({
        status: 'failed',
        error: document.extractionError || 'Extraction failed',
      });
    }

    const extractedContent = document.extractedContent as {
      sections: ExtractedSection[];
      documentOutline?: any[];
      metadata: any;
      sourceAssets?: any[];
      mediaWarnings?: string[];
      wordCount?: number; // Top-level wordCount from EnhancedExtractionResult
      structuredLessonHeadings?: Array<{
        index: number;
        rawHeading: string;
        normalizedTitle: string;
        lessonNumber: number | null;
        type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
      }>;
      hasExplicitLessonStructure?: boolean;
    } | null;

    if (!extractedContent) {
      return res.status(500).json({ error: 'Extracted content not available' });
    }

    // Get wordCount from top-level or from metadata
    const wordCount = extractedContent.wordCount || extractedContent.metadata?.wordCount || 0;

    const documentOutline = resolveDocumentOutline(extractedContent, document);

    res.json({
      documentId: document.id,
      fileName: document.fileName,
      status: 'completed',
      sections: extractedContent.sections,
      documentOutline,
      sourceAssets: extractedContent.sourceAssets || [],
      mediaWarnings: extractedContent.mediaWarnings || [],
      metadata: extractedContent.metadata,
      wordCount: wordCount, // Include wordCount in response
      extractedAt: document.updatedAt?.toISOString(),
      // Include structured lesson headings for zero-hallucination topic grounding
      structuredLessonHeadings: extractedContent.structuredLessonHeadings,
      hasExplicitLessonStructure: extractedContent.hasExplicitLessonStructure,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Get document content error:', error);
    res.status(500).json({ error: 'Failed to fetch document content' });
  }
});

router.get('/:draftId/source-assets', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const sourceDocs = await db.query.courseSourceDocuments.findMany({
      where: eq(courseSourceDocuments.draftId, draftId),
    });
    const docIds = sourceDocs.map(doc => doc.id);
    if (docIds.length === 0) {
      return res.json({ assets: [], documents: [] });
    }

    const assets = await db.query.courseSourceAssets.findMany({
      where: inArray(courseSourceAssets.sourceDocumentId, docIds),
      orderBy: (asset, { asc }) => [asc(asset.sourceDocumentId), asc(asset.pageOrSlide), asc(asset.createdAt)],
    });

    const documentById = new Map(sourceDocs.map(doc => [doc.id, doc]));
    const assetsWithUrls = await Promise.all(assets.map(async asset => {
      let signedUrl: string | null = null;
      try {
        signedUrl = await objectStorage.getCourseSourceAssetSignedURL(asset.storageKey, 900);
      } catch (assetError) {
        console.warn(`[CourseFramework] Failed to sign source asset ${asset.id}:`, assetError);
      }
      const sourceDoc = documentById.get(asset.sourceDocumentId);
      return {
        id: asset.id,
        sourceDocumentId: asset.sourceDocumentId,
        sourceFileName: sourceDoc?.fileName || null,
        assetType: asset.assetType,
        storageKey: asset.storageKey,
        signedUrl,
        mimeType: asset.mimeType,
        pageOrSlide: asset.pageOrSlide,
        caption: asset.caption,
        altText: asset.altText,
        width: asset.width,
        height: asset.height,
        containsEmbeddedText: asset.containsEmbeddedText || false,
        extractionMethod: asset.extractionMethod,
        metadata: asset.metadata,
      };
    }));

    res.json({
      documents: sourceDocs.map(doc => ({
        id: doc.id,
        draftDocumentId: doc.draftDocumentId,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        extractionStatus: doc.extractionStatus,
        extractionError: doc.extractionError,
        pageCount: doc.pageCount,
        slideCount: doc.slideCount,
      })),
      assets: assetsWithUrls,
    });
  } catch (error: any) {
    console.error('[CourseFramework] List source assets error:', error);
    res.status(500).json({ error: 'Failed to fetch source assets' });
  }
});

router.post('/:draftId/documents/:docId/retry', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId, docId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const document = await db.query.courseDraftDocuments.findFirst({
      where: and(eq(courseDraftDocuments.id, docId), eq(courseDraftDocuments.draftId, draftId)),
    });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.extractionStatus === 'processing' && !DocumentExtractionWorker.isStaleProcessingDocument(document)) {
      return res.status(409).json({ error: 'Document extraction already in progress' });
    }

    await db.update(courseDraftDocuments)
      .set({
        extractionStatus: 'pending',
        extractionError: null,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftDocuments.id, docId));

    if (isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
      await db.delete(courseDraftDocumentSegments).where(eq(courseDraftDocumentSegments.documentId, docId));
    }

    res.json({ success: true, status: 'pending' });
  } catch (error: any) {
    console.error('[CourseFramework] Retry extraction error:', error);
    res.status(500).json({ error: 'Failed to retry extraction' });
  }
});

router.get('/:draftId/segments', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
      return res.status(404).json({ error: 'Segment APIs are disabled' });
    }

    const { draftId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error || !draft) {
      return res.status(statusCode || 404).json({ error: error || 'Draft not found' });
    }

    const [segments, assignments] = await Promise.all([
      db.query.courseDraftDocumentSegments.findMany({
        where: eq(courseDraftDocumentSegments.draftId, draftId),
        orderBy: [asc(courseDraftDocumentSegments.documentId), asc(courseDraftDocumentSegments.segmentIndex)],
      }),
      db.query.courseDraftTopicAssignments.findMany({
        where: eq(courseDraftTopicAssignments.draftId, draftId),
      }),
    ]);

    const assignmentBySegmentId = new Map(assignments.map(item => [item.segmentId, item]));
    const topics = buildDraftTopicCandidates(draft);

    res.json({
      success: true,
      topics,
      totalSegments: segments.length,
      segments: segments.map(segment => ({
        ...segment,
        assignment: assignmentBySegmentId.get(segment.id) || null,
      })),
    });
  } catch (error: any) {
    console.error('[CourseFramework] Get segments error:', error);
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
});

const autoAssignSegmentsSchema = z.object({
  topicIds: z.array(z.string()).optional(),
  overwrite: z.boolean().optional().default(true),
  includeNonContentLessons: z.boolean().optional().default(false),
});

router.post('/:draftId/topics/auto-assign', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED')) {
      return res.status(404).json({ error: 'Topic assignment APIs are disabled' });
    }
    if (!isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
      return res.status(409).json({ error: 'Segment persistence must be enabled before assignment' });
    }

    const { draftId } = req.params;
    const userId = req.session.userId!;
    const validation = autoAssignSegmentsSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error || !draft) {
      return res.status(statusCode || 404).json({ error: error || 'Draft not found' });
    }

    const topicCandidates = buildDraftTopicCandidates(draft);
    if (topicCandidates.length === 0) {
      return res.status(400).json({
        error: 'No topic candidates available',
        message: 'Generate or define draft topics before auto-assignment.',
      });
    }

    const requestedTopicIds = new Set(validation.data.topicIds || []);
    const filteredCandidates = topicCandidates.filter(candidate => {
      const topicFilterPass = requestedTopicIds.size === 0 || requestedTopicIds.has(candidate.id);
      const lessonFilterPass = validation.data.includeNonContentLessons ? true : candidate.isContentLesson;
      return topicFilterPass && lessonFilterPass;
    });

    if (filteredCandidates.length === 0) {
      return res.status(400).json({ error: 'No eligible topics selected for assignment' });
    }

    const segments = await db.query.courseDraftDocumentSegments.findMany({
      where: eq(courseDraftDocumentSegments.draftId, draftId),
      orderBy: [asc(courseDraftDocumentSegments.documentId), asc(courseDraftDocumentSegments.segmentIndex)],
    });

    if (segments.length === 0) {
      return res.status(400).json({
        error: 'No extracted segments available',
        message: 'Upload and extract draft documents first.',
      });
    }

    const { assigned, unassignedSegmentIds } = assignSegmentsDeterministically(segments, filteredCandidates);

    if (validation.data.overwrite) {
      await db.delete(courseDraftTopicAssignments).where(eq(courseDraftTopicAssignments.draftId, draftId));
    }

    if (assigned.length > 0) {
      await db.insert(courseDraftTopicAssignments).values(
        assigned.map(item => ({
          draftId,
          topicId: item.topicId,
          segmentId: item.segmentId,
          assignmentMethod: item.assignmentMethod,
          confidence: item.confidence,
          isUserConfirmed: false,
          createdBy: userId,
        }))
      );
    }

    const coverage = await buildCoverageReportSnapshot(draftId, true);

    res.json({
      success: true,
      assignedCount: assigned.length,
      unassignedCount: unassignedSegmentIds.length,
      unassignedSegmentIds: unassignedSegmentIds.slice(0, 100),
      coverageReport: coverage,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Auto-assign segments error:', error);
    res.status(500).json({ error: 'Failed to auto-assign segments' });
  }
});

const manualAssignSegmentsSchema = z.object({
  segmentIds: z.array(z.string().uuid()).min(1),
  replace: z.boolean().optional().default(true),
});

router.post('/:draftId/topics/:topicId/assign-segments', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED')) {
      return res.status(404).json({ error: 'Topic assignment APIs are disabled' });
    }

    const { draftId, topicId } = req.params;
    const userId = req.session.userId!;
    const validation = manualAssignSegmentsSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error || !draft) {
      return res.status(statusCode || 404).json({ error: error || 'Draft not found' });
    }

    const topicCandidates = buildDraftTopicCandidates(draft);
    if (!topicCandidates.some(topic => topic.id === topicId)) {
      return res.status(400).json({ error: `Unknown topicId "${topicId}" for this draft` });
    }

    const segmentIds = Array.from(new Set(validation.data.segmentIds));
    const segments = await db.query.courseDraftDocumentSegments.findMany({
      where: and(
        eq(courseDraftDocumentSegments.draftId, draftId),
        inArray(courseDraftDocumentSegments.id, segmentIds)
      ),
    });

    if (segments.length !== segmentIds.length) {
      const found = new Set(segments.map(segment => segment.id));
      const missing = segmentIds.filter(id => !found.has(id));
      return res.status(400).json({
        error: 'Invalid segment selection',
        missingSegmentIds: missing,
      });
    }

    if (validation.data.replace) {
      await db.delete(courseDraftTopicAssignments).where(
        and(
          eq(courseDraftTopicAssignments.draftId, draftId),
          eq(courseDraftTopicAssignments.topicId, topicId)
        )
      );
    }

    await db.delete(courseDraftTopicAssignments).where(
      and(
        eq(courseDraftTopicAssignments.draftId, draftId),
        inArray(courseDraftTopicAssignments.segmentId, segmentIds)
      )
    );

    await db.insert(courseDraftTopicAssignments).values(
      segmentIds.map(segmentId => ({
        draftId,
        topicId,
        segmentId,
        assignmentMethod: 'manual',
        confidence: 1,
        isUserConfirmed: true,
        createdBy: userId,
      }))
    );

    const coverage = await buildCoverageReportSnapshot(draftId, true);

    res.json({
      success: true,
      topicId,
      assignedSegmentCount: segmentIds.length,
      coverageReport: coverage,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Assign segments error:', error);
    res.status(500).json({ error: 'Failed to assign segments to topic' });
  }
});

router.get('/:draftId/coverage', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED')) {
      return res.status(404).json({ error: 'Coverage APIs are disabled' });
    }

    const { draftId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const coverage = await buildCoverageReportSnapshot(draftId, true);
    res.json({
      success: true,
      coverageReport: coverage,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Coverage report error:', error);
    res.status(500).json({ error: 'Failed to build coverage report' });
  }
});

router.patch('/:draftId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const validation = updateDraftRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validation.error.errors 
      });
    }

    const { version, ...updates } = validation.data;

    // Version check is optional - only enforce if version is provided
    if (version !== undefined && draft!.version !== version) {
      return res.status(409).json({ 
        error: 'Version conflict',
        currentVersion: draft!.version,
        providedVersion: version,
        message: 'The draft has been modified. Please refresh and try again.',
      });
    }

    const updateData: Record<string, any> = {
      version: draft!.version + 1,
      updatedAt: new Date(),
    };

    if (updates.courseDescription !== undefined) {
      updateData.courseDescription = updates.courseDescription;
    }
    // Topic analysis state persistence
    if (updates.analyzedTopics !== undefined) {
      updateData.analyzedTopics = updates.analyzedTopics;
    }
    if (updates.selectedTopics !== undefined) {
      updateData.selectedTopics = updates.selectedTopics;
    }
    if (updates.customTopics !== undefined) {
      updateData.customTopics = updates.customTopics;
    }
    if (updates.selectedOutlineNodeIds !== undefined || updates.selectedOutlineContextNodeIds !== undefined) {
      const existingSettings = (draft!.courseSettings as Record<string, any> | null) || {};
      updateData.courseSettings = {
        ...existingSettings,
        documentOutlineSelection: {
          ...(existingSettings.documentOutlineSelection || {}),
          ...(updates.selectedOutlineNodeIds !== undefined ? { selectedNodeIds: updates.selectedOutlineNodeIds } : {}),
          ...(updates.selectedOutlineContextNodeIds !== undefined ? { contextNodeIds: updates.selectedOutlineContextNodeIds } : {}),
        },
      };
    }
    if (updates.suggestedTitle !== undefined) {
      updateData.suggestedTitle = updates.suggestedTitle;
    }
    if (updates.generatedTitle !== undefined) {
      updateData.generatedTitle = updates.generatedTitle;
    }
    if (updates.generatedDescription !== undefined) {
      updateData.generatedDescription = updates.generatedDescription;
    }
    if (updates.generatedLessons !== undefined) {
      updateData.generatedLessons = updates.generatedLessons;
    }
    if (updates.currentStep !== undefined) {
      updateData.currentStep = updates.currentStep;
    }
    if (updates.courseSettings !== undefined) {
      updateData.courseSettings = updates.courseSettings;
    }

    const [updatedDraft] = await db.update(courseDraftFrameworks)
      .set(updateData)
      .where(eq(courseDraftFrameworks.id, draftId))
      .returning();

    console.log(`[CourseFramework] Updated draft ${draftId} to version ${updatedDraft.version}`);

    res.json({
      id: updatedDraft.id,
      version: updatedDraft.version,
      currentStep: updatedDraft.currentStep,
      updatedAt: updatedDraft.updatedAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('[CourseFramework] Update draft error:', error);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

router.delete('/:draftId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const draftWithDocs = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draftWithDocs) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    for (const doc of draftWithDocs.documents) {
      try {
        await objectStorage.deleteCourseDraftDocument(doc.storagePath);
      } catch (storageError) {
        console.warn(`[CourseFramework] Failed to delete file from storage: ${doc.storagePath}`, storageError);
      }
    }

    await db.delete(courseDraftFrameworks)
      .where(eq(courseDraftFrameworks.id, draftId));

    console.log(`[CourseFramework] Deleted draft ${draftId} with ${draftWithDocs.documents.length} documents`);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[CourseFramework] Delete draft error:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

router.delete('/:draftId/documents/:docId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId, docId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const document = await db.query.courseDraftDocuments.findFirst({
      where: and(
        eq(courseDraftDocuments.id, docId),
        eq(courseDraftDocuments.draftId, draftId)
      ),
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    try {
      await objectStorage.deleteCourseDraftDocument(document.storagePath);
    } catch (storageError) {
      console.warn(`[CourseFramework] Failed to delete file from storage: ${document.storagePath}`, storageError);
    }

    await db.delete(courseDraftDocuments)
      .where(eq(courseDraftDocuments.id, docId));

    console.log(`[CourseFramework] Deleted document ${docId} from draft ${draftId}`);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[CourseFramework] Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Generate course description using AI
router.post('/:draftId/description', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const { userDescription, targetAudience } = req.body || {};
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const draft = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const completedDocs = draft.documents.filter(
      doc => doc.extractionStatus === 'completed' && doc.extractedContent
    );

    if (completedDocs.length === 0) {
      return res.status(400).json({ 
        error: 'No documents with extracted content available',
        message: 'Please upload documents first.',
      });
    }

    // Combine all document raw text
    const combinedRawText = completedDocs.map(doc => {
      const content = doc.extractedContent as { 
        rawText?: string; 
        sections?: ExtractedSection[] 
      } | null;
      
      if (content?.rawText) {
        return content.rawText;
      }
      
      // Fallback for legacy format
      return content?.sections?.map(s => `${s.heading}\n${s.content}`).join('\n\n') || '';
    }).join('\n\n');

    if (combinedRawText.length === 0) {
      return res.status(400).json({ error: 'No content available for description generation' });
    }

    const description = await courseFrameworkAIService.generateCourseDescription(
      combinedRawText,
      draft.generatedTitle || undefined,
      {
        userDescription: userDescription || undefined,
        targetAudience: targetAudience || undefined,
      }
    );

    console.log(`[CourseFramework] Generated description for draft ${draftId}`);

    res.json({
      success: true,
      description,
      disclaimer: 'This description is AI-generated. Please review and edit as needed.',
    });
  } catch (error: any) {
    console.error('[CourseFramework] Generate description error:', error);
    if (error.message?.includes('exceeds token budget')) {
      return res.status(413).json({
        error: 'Source content too large for description generation with summarization disabled',
        message: error.message,
      });
    }
    res.status(500).json({ error: 'Failed to generate description' });
  }
});

// Analyze document topics using AI
router.post('/:draftId/analyze-topics', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const userId = req.session.userId!;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const draft = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const completedDocs = draft.documents.filter(
      doc => doc.extractionStatus === 'completed' && doc.extractedContent
    );

    if (completedDocs.length === 0) {
      return res.status(400).json({ 
        error: 'No documents with extracted content available',
      });
    }

    // Optional scope: analyze a subset of completed documents (e.g., selected document in UI)
    const requestedDocumentIds = Array.isArray((req.body as any)?.documentIds)
      ? ((req.body as any).documentIds as any[])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      : [];
    const docsForAnalysis = requestedDocumentIds.length > 0
      ? completedDocs.filter((doc) => requestedDocumentIds.includes(doc.id))
      : completedDocs;
    if (requestedDocumentIds.length > 0 && docsForAnalysis.length === 0) {
      return res.status(400).json({
        error: 'No matching processed documents found for analysis',
      });
    }

    // Get credit cost and charge before analysis
    const creditCost = await topicAnalysisPricingService.getTopicAnalysisCreditCost(effectiveOrgId);
    const correlationId = `topic_analysis_${randomUUID()}`;
    
    let creditDeduction: { amount: number; creditSource: string } | null = null;
    
    try {
      const deductionResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId: effectiveOrgId,
        amount: creditCost,
        type: 'deduction',
        activityType: 'topic_analysis',
        correlationId,
        description: `AI topic analysis for course draft`,
        metadata: { draftId }
      });
      
      creditDeduction = {
        amount: creditCost,
        creditSource: deductionResult.creditSource,
      };
      
      console.log(
        `[CourseFramework] Topic analysis credits deducted: ${creditCost} credits. ` +
        `Source: ${deductionResult.creditSource}, User: ${userId}, Draft: ${draftId}`
      );
    } catch (creditError) {
      if (creditError instanceof InsufficientHybridCreditsError) {
        console.log(
          `[CourseFramework] Insufficient credits for topic analysis. ` +
          `User: ${userId}, Required: ${creditError.requiredAmount}, ` +
          `User balance: ${creditError.userBalance}, Org balance: ${creditError.orgBalance}`
        );
        return res.status(402).json({
          error: 'Insufficient credits for topic analysis',
          requiredCredits: creditCost,
          userBalance: creditError.userBalance,
          orgBalance: creditError.orgBalance,
        });
      }
      throw creditError;
    }

    // Combine selected document raw text and structural hints.
    const structuredHeadings: string[] = [];
    const sectionChunks: Array<{ heading: string; content: string }> = [];
    const combinedRawText = docsForAnalysis.map(doc => {
      const content = doc.extractedContent as { 
        rawText?: string; 
        sections?: ExtractedSection[];
        documentOutline?: any[];
        structuredLessonHeadings?: Array<{
          normalizedTitle?: string;
          type?: string;
        }>;
      } | null;
      const headings = Array.isArray(content?.structuredLessonHeadings) ? content!.structuredLessonHeadings! : [];
      for (const heading of headings) {
        const headingName = String(heading?.normalizedTitle || '').trim();
        const headingType = String(heading?.type || '').toLowerCase();
        if (!headingName) continue;
        if (headingType === 'overview' || headingType === 'takeaways') continue;
        structuredHeadings.push(headingName);
      }
      const documentOutline = resolveDocumentOutline(content, doc);
      if (documentOutline.length > 0) {
        for (const node of documentOutline) {
          const level = String(node?.level || '').toLowerCase();
          if (!['chapter', 'section', 'subsection', 'slide'].includes(level)) continue;
          const headingName = String(node?.title || '').trim();
          if (headingName) structuredHeadings.push(headingName);
        }
      }
      if (Array.isArray(content?.sections)) {
        for (const section of content.sections) {
          if (!section) continue;
          const heading = String(section.heading || '').trim();
          const sectionContent = String(section.content || '').trim();
          if (!heading && !sectionContent) continue;
          sectionChunks.push({ heading, content: sectionContent });
        }
      }
      
      if (content?.rawText) {
        return content.rawText;
      }
      
      return content?.sections?.map(s => `${s.heading}\n${s.content}`).join('\n\n') || '';
    }).join('\n\n');

    const analysis = await courseFrameworkAIService.analyzeDocumentTopics(combinedRawText, {
      structuredHeadings,
      sectionChunks,
    });
    const rejectedTopics: Array<{ name: string; reason: string }> = [];
    const cleanedTopics = analysis.topics
      .map((topic: any) => {
        const validation = validateTopicName(topic?.name || '');
        if (!validation.valid) {
          rejectedTopics.push({
            name: String(topic?.name || ''),
            reason: validation.reason || 'invalid_topic',
          });
          return null;
        }
        return {
          ...topic,
          name: validation.sanitized,
        };
      })
      .filter((topic): topic is any => Boolean(topic));

    if (cleanedTopics.length === 0) {
      return res.status(422).json({
        error: 'Topic analysis produced no valid instructional topics',
        message: 'The AI output contained only meta or generic topics. Please retry analysis.',
        rejectedTopics,
      });
    }

    console.log(
      `[CourseFramework] Analyzed topics for draft ${draftId}: ${analysis.topics.length} raw, ` +
      `${cleanedTopics.length} valid, ${rejectedTopics.length} rejected, ${analysis.wordCount} words, truncated=${analysis.wasContentTruncated}`
    );

    // Calculate average words per topic for overall content validation
    const averageWordsPerTopic = cleanedTopics.length > 0
      ? Math.floor(analysis.wordCount / cleanedTopics.length)
      : 0;
    
    // Find minimum per-topic word count for content sufficiency check
    const minTopicWordCount = cleanedTopics.length > 0
      ? Math.min(...cleanedTopics.map((t: any) => t.estimatedWordCount))
      : 0;
    
    // Warn if any topic has insufficient content
    const MIN_WORDS_PER_TOPIC = 200;
    const hasInsufficientContent = minTopicWordCount < MIN_WORDS_PER_TOPIC;
    const weakTopicCount = cleanedTopics.filter((t: any) => t.isWeakTitle === true).length;
    const lowConfidenceCount = cleanedTopics.filter((t: any) => (t.confidenceScore ?? 1) < 0.5).length;
    const lowWordTopicCount = cleanedTopics.filter((t: any) => (t.estimatedWordCount ?? 0) < MIN_WORDS_PER_TOPIC).length;
    
    if (hasInsufficientContent) {
      console.log(`[CourseFramework] ⚠️ Content validation warning: minimum topic has ${minTopicWordCount} words (minimum ${MIN_WORDS_PER_TOPIC} recommended)`);
    }

    res.json({
      success: true,
      topics: cleanedTopics,
      suggestedTitle: analysis.suggestedTitle,
      contentAnalysis: {
        totalWordCount: analysis.wordCount,
        topicCount: cleanedTopics.length,
        estimatedWordsPerTopic: averageWordsPerTopic,
        minObservedWordsPerTopic: minTopicWordCount,
        analyzedDocumentCount: docsForAnalysis.length,
        analyzedDocumentIds: docsForAnalysis.map((doc) => doc.id),
        wasContentTruncated: analysis.wasContentTruncated,
        contentSufficiency: hasInsufficientContent ? 'warning' : 'ok',
        minWordsPerTopicRecommended: MIN_WORDS_PER_TOPIC,
      },
      topicQuality: {
        weakTopicCount,
        lowConfidenceCount,
        lowWordTopicCount,
        rejectedTopicCount: rejectedTopics.length,
        rejectedTopics,
        hasIssues: weakTopicCount > 0 || lowConfidenceCount > 0 || lowWordTopicCount > 0,
      },
      creditDeduction: creditDeduction ? {
        amount: creditDeduction.amount,
        source: creditDeduction.creditSource,
      } : null,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Analyze topics error:', error);
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to analyze topics';
    let statusCode = 500;
    
    if (error.message?.includes('No active AI configuration')) {
      errorMessage = 'AI service is not configured. Please contact support.';
      statusCode = 503;
    } else if (error.message?.includes('API key')) {
      errorMessage = 'AI service configuration error. Please contact support.';
      statusCode = 503;
    } else if (error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('rate limit')) {
      errorMessage = 'AI service is temporarily busy. Please try again in a few moments.';
      statusCode = 429;
    } else if (error.message?.includes('Empty response')) {
      errorMessage = 'AI service returned an empty response. Please try again.';
      statusCode = 502;
    } else if (error.message?.includes('exceeds token budget')) {
      errorMessage = 'Source content is too large for AI topic analysis with summarization disabled.';
      statusCode = 413;
    } else if (error.code === '23505' || error.message?.includes('duplicate')) {
      // Duplicate transaction error - likely retrying a completed request
      errorMessage = 'This analysis has already been processed.';
      statusCode = 409;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

router.post('/:draftId/advisor', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const draft = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const context = {
      currentStep: draft.currentStep || 'upload',
      courseDescription: draft.courseDescription || undefined,
      generatedTitle: draft.generatedTitle || undefined,
      generatedLessons: (draft.generatedLessons as any[]) || undefined,
      documentCount: draft.documents?.length || 0,
    };

    const hint: AdvisorHint = await courseFrameworkAIService.getAdvisorHint(context);

    res.json({
      success: true,
      hint,
      disclaimer: 'This advice is AI-generated and should be reviewed before acting upon it.',
    });
  } catch (error: any) {
    console.error('[CourseFramework] Advisor error:', error);
    
    res.json({
      success: true,
      hint: {
        type: 'suggestion' as const,
        message: 'Continue building your course framework step by step.',
      },
      disclaimer: 'This is a fallback suggestion as the AI advisor is temporarily unavailable.',
    });
  }
});

router.post('/:draftId/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const { courseDescription, targetLessonCount, includeRecommendations, targetAudience } = req.body;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const draft = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    // Check if generation is already in progress
    if (draft.generationStatus === 'generating') {
      return res.json({
        success: true,
        status: 'generating',
        message: 'Framework generation is already in progress',
        draftId,
        startedAt: draft.generationStartedAt?.toISOString(),
      });
    }

    const completedDocs = draft.documents.filter(
      doc => doc.extractionStatus === 'completed' && doc.extractedContent
    );

    if (completedDocs.length === 0) {
      return res.status(400).json({ 
        error: 'No documents with extracted content available',
        message: 'Please upload and wait for document extraction to complete before generating the framework.',
      });
    }

    const userId = req.session.userId!;
    const rawSelectedTopics = Array.isArray(draft.selectedTopics)
      ? (draft.selectedTopics as any[])
          .map(topic => (typeof topic === 'string' ? topic.trim() : ''))
          .filter((topic): topic is string => Boolean(topic))
      : [];
    const rawCustomTopics = Array.isArray(draft.customTopics)
      ? (draft.customTopics as any[])
          .map(topic => {
            if (typeof topic === 'string') return topic.trim();
            if (topic && typeof topic === 'object' && typeof topic.name === 'string') return topic.name.trim();
            return '';
          })
          .filter((topic): topic is string => Boolean(topic))
      : [];
    const outlineSelectionForValidation = getDocumentOutlineSelection(draft);
    const topicValidationOptions = {
      allowDocumentOutlineLabels: outlineSelectionForValidation.selectedNodeIds.size > 0,
    };
    const invalidSelectedTopics = rawSelectedTopics
      .map(name => ({ name, validation: validateTopicName(name, topicValidationOptions) }))
      .filter(item => !item.validation.valid)
      .map(item => ({
        name: item.name,
        reason: item.validation.reason || 'invalid_topic',
      }));
    const invalidCustomTopics = rawCustomTopics
      .map(name => ({ name, validation: validateTopicName(name) }))
      .filter(item => !item.validation.valid)
      .map(item => ({
        name: item.name,
        reason: item.validation.reason || 'invalid_topic',
      }));
    if (invalidSelectedTopics.length > 0 || invalidCustomTopics.length > 0) {
      return res.status(400).json({
        error: 'Invalid topic selection',
        message: 'Selected topics include meta/generic labels. Re-run topic analysis and choose instructional topics only.',
        invalidSelectedTopics,
        invalidCustomTopics,
      });
    }
    const selectedTopics = Array.from(new Set(rawSelectedTopics.map(topic => validateTopicName(topic, topicValidationOptions).sanitized)));
    const customTopics = Array.from(new Set(rawCustomTopics.map(topic => validateTopicName(topic).sanitized)));
    const isPowerPointDocumentBundle = completedDocs.length > 0 && completedDocs.every((doc) => isPptxDraftDocument(doc));

    if (isPowerPointDocumentBundle) {
      await db.update(courseDraftFrameworks)
        .set({
          generationStatus: 'generating',
          generationError: null,
          generationStartedAt: new Date(),
          generationCompletedAt: null,
          generationMetadata: {
            ...(draft.generationMetadata as Record<string, any> || {}),
            generationMode: 'pptx_document_bundle',
            targetAudience: targetAudience || 'intermediate',
            documentCount: completedDocs.length,
            skipSourceImageExtraction: true,
            preconvertSlidesOnFinalize: true,
          },
          updatedAt: new Date(),
        })
        .where(eq(courseDraftFrameworks.id, draftId));

      res.json({
        success: true,
        status: 'generating',
        message: 'PowerPoint course generation started',
        draftId,
        startedAt: new Date().toISOString(),
      });

      setImmediate(async () => {
        try {
          const contentLessons = buildPptxDocumentLessons(
            completedDocs as any,
            (targetAudience || 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
          );
          const generatedLessons = normalizeCourseCreationLessonPlan(contentLessons);
          const generatedTitle = draft.suggestedTitle
            || draft.generatedTitle
            || derivePptxCourseTitle(completedDocs as any, contentLessons);
          const generatedDescription = courseDescription
            || draft.courseDescription
            || `Course framework created from ${contentLessons.length} uploaded PowerPoint presentation${contentLessons.length === 1 ? '' : 's'}.`;

          await db.update(courseDraftFrameworks)
            .set({
              generatedTitle,
              generatedDescription,
              generatedLessons,
              recommendedLessons: [],
              generationMetadata: {
                ...(draft.generationMetadata as Record<string, any> || {}),
                generationMode: 'pptx_document_bundle',
                documentCount: completedDocs.length,
                skipSourceImageExtraction: true,
                preconvertSlidesOnFinalize: true,
              },
              currentStep: 'review',
              generationStatus: 'completed',
              generationError: null,
              generationCompletedAt: new Date(),
              version: draft.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(courseDraftFrameworks.id, draftId));

          console.log(`[CourseFramework] PowerPoint bundle generation completed for draft ${draftId}: ${contentLessons.length} lesson(s)`);
        } catch (bgError: any) {
          console.error(`[CourseFramework] PowerPoint bundle generation error for draft ${draftId}:`, bgError);
          await db.update(courseDraftFrameworks)
            .set({
              generationStatus: 'failed',
              generationError: bgError.message || 'An unexpected error occurred during PowerPoint course generation',
              generationCompletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(courseDraftFrameworks.id, draftId));
        }
      });

      return;
    }

    const outlineSelection = getDocumentOutlineSelection(draft);
    const selectedOutline = collectSelectedOutlineNodes(
      completedDocs as any,
      outlineSelection.selectedNodeIds,
      outlineSelection.contentNodeIds,
      selectedTopics,
    );

    if (selectedOutline.lessonNodes.length > 0) {
      await ensureSelectedPdfPageSnapshots({
        draftId,
        organizationId: effectiveOrgId!,
        userId,
        completedDocs: completedDocs as any,
        selectedContentNodes: selectedOutline.contentNodes.length > 0 ? selectedOutline.contentNodes : selectedOutline.lessonNodes,
      });

      let generatedLessons = buildDeterministicLessonsFromOutlineNodes(
        selectedOutline.lessonNodes,
        selectedOutline.outlineById,
        (targetAudience || 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
      );
      generatedLessons = attachOutlineAssetsToLessons(normalizeCourseCreationLessonPlan(generatedLessons), completedDocs as any);

      const contentTitles = selectedOutline.lessonNodes.map((node) => cleanLessonTitleFromOutline(String(node.title || ''))).filter(Boolean);
      const generatedTitle = draft.suggestedTitle
        || draft.generatedTitle
        || (contentTitles.length === 1 ? contentTitles[0] : `Course: ${contentTitles.slice(0, 3).join(', ')}`)
        || 'Source-Grounded Course';
      const generatedDescription =
        courseDescription ||
        draft.courseDescription ||
        `Course framework created directly from selected source sections: ${contentTitles.slice(0, 4).join(', ')}.`;

      await db.update(courseDraftFrameworks)
        .set({
          generatedTitle,
          generatedDescription,
          generatedLessons,
          recommendedLessons: [],
          generationStatus: 'completed',
          generationError: null,
          generationStartedAt: new Date(),
          generationCompletedAt: new Date(),
          currentStep: 'review',
          generationMetadata: {
            ...(draft.generationMetadata as Record<string, any> || {}),
            generationMode: 'document_outline',
            selectedOutlineNodeIds: Array.from(outlineSelection.selectedNodeIds),
            selectedContentNodeIds: Array.from(outlineSelection.contentNodeIds),
          },
          version: draft.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(courseDraftFrameworks.id, draftId));

      return res.json({
        success: true,
        status: 'completed',
        draftId,
        generatedTitle,
        generatedDescription,
        generatedLessons,
        recommendedLessons: [],
        message: 'Source-grounded framework created from the selected document structure.',
      });
    }

    if (isFeatureEnabled('CF_V2_NO_FRAMEWORK_GENERATION')) {
      const selectedNames = selectedTopics;
      const customNames = customTopics;
      const headingTopics: string[] = [];
      for (const doc of completedDocs) {
        const content = doc.extractedContent as any;
        const headings = Array.isArray(content?.structuredLessonHeadings) ? content.structuredLessonHeadings : [];
        for (const heading of headings) {
          if (!heading || typeof heading.normalizedTitle !== 'string') continue;
          const type = String(heading.type || '').toLowerCase();
          if (type === 'overview' || type === 'takeaways') continue;
          const validated = validateTopicName(heading.normalizedTitle);
          if (validated.valid) {
            headingTopics.push(validated.sanitized);
          }
        }
        const documentOutline = resolveDocumentOutline(content, doc);
        if (documentOutline.length > 0) {
          for (const node of documentOutline) {
            const level = String(node?.level || '').toLowerCase();
            if (!['chapter', 'section', 'subsection', 'slide'].includes(level)) continue;
            const validated = validateTopicName(String(node?.title || ''));
            if (validated.valid) {
              headingTopics.push(validated.sanitized);
            }
          }
        }
      }

      const deterministicTopics = Array.from(new Set([
        ...selectedNames,
        ...customNames,
        ...headingTopics,
      ]));

      const requestedCount = Number.isInteger(targetLessonCount) && targetLessonCount > 0
        ? Number(targetLessonCount)
        : deterministicTopics.length;
      const finalTopicList = deterministicTopics.slice(0, requestedCount > 0 ? requestedCount : deterministicTopics.length);
      const resolvedTopics = finalTopicList.length > 0 ? finalTopicList : ['Source Content'];

      let generatedLessons = buildDeterministicLessonsFromTopics(
        resolvedTopics,
        (targetAudience || 'intermediate') as 'beginner' | 'intermediate' | 'advanced'
      );
      generatedLessons = normalizeCourseCreationLessonPlan(generatedLessons);

      if (isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED') && isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
        const segmentCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(courseDraftDocumentSegments)
          .where(eq(courseDraftDocumentSegments.draftId, draftId));

        if ((segmentCount[0]?.count || 0) > 0) {
          await db.delete(courseDraftTopicAssignments).where(eq(courseDraftTopicAssignments.draftId, draftId));
          const candidates = generatedLessons.map((lesson, index) => ({
            id: `lesson:${index}`,
            name: String(lesson.title || `Lesson ${index + 1}`),
            lessonIndex: index,
            isContentLesson: inferLessonType(lesson, index, generatedLessons.length) === 'content',
          }));
          const segments = await db.query.courseDraftDocumentSegments.findMany({
            where: eq(courseDraftDocumentSegments.draftId, draftId),
            orderBy: [asc(courseDraftDocumentSegments.documentId), asc(courseDraftDocumentSegments.segmentIndex)],
          });
          const assignmentResult = assignSegmentsDeterministically(segments, candidates);
          if (assignmentResult.assigned.length > 0) {
            await db.insert(courseDraftTopicAssignments).values(
              assignmentResult.assigned.map(item => ({
                draftId,
                topicId: item.topicId,
                segmentId: item.segmentId,
                assignmentMethod: item.assignmentMethod,
                confidence: item.confidence,
                isUserConfirmed: false,
                createdBy: userId,
              }))
            );
          }
          generatedLessons = normalizeCourseCreationLessonPlan(await applyAssignedSegmentsToLessons(draftId, generatedLessons));
          await buildCoverageReportSnapshot(draftId, true);
        }
      }
      generatedLessons = attachOutlineAssetsToLessons(generatedLessons, completedDocs as any);

      const generatedTitle = draft.suggestedTitle || draft.generatedTitle || draft.courseDescription || 'Source-Grounded Course';
      const generatedDescription =
        courseDescription ||
        draft.courseDescription ||
        'Course framework created directly from uploaded source documents.';

      await db.update(courseDraftFrameworks)
        .set({
          generatedTitle,
          generatedDescription,
          generatedLessons,
          recommendedLessons: [],
          generationStatus: 'completed',
          generationError: null,
          generationStartedAt: new Date(),
          generationCompletedAt: new Date(),
          currentStep: 'review',
          version: draft.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(courseDraftFrameworks.id, draftId));

      return res.json({
        success: true,
        status: 'completed',
        draftId,
        generatedTitle,
        generatedDescription,
        generatedLessons,
        recommendedLessons: [],
        message: 'Framework generation bypassed; source-grounded deterministic framework created.',
      });
    }

    // Calculate credit cost for framework generation
    const baseCreditCost = await frameworkPricingService.getFrameworkCreditCost(effectiveOrgId);
    const selectedTopicCount = selectedTopics.length + customTopics.length;
    const requestedLessonCount = Number.isInteger(targetLessonCount) && targetLessonCount > 0
      ? targetLessonCount
      : (selectedTopicCount > 0 ? selectedTopicCount : 1);
    const totalCreditCost = baseCreditCost + (selectedTopicCount * COURSE_PER_TOPIC_CREDITS);
    const correlationId = `course_framework_${randomUUID()}`;

    // Deduct credits before starting generation
    try {
      const deductionResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId: effectiveOrgId!,
        amount: totalCreditCost,
        type: 'deduction',
        activityType: 'course_framework',
        correlationId,
        description: `AI course framework generation for draft`,
        metadata: { draftId, selectedTopicCount }
      });
      
      console.log(
        `[CourseFramework] Framework generation credits deducted: ${totalCreditCost} credits. ` +
        `Source: ${deductionResult.creditSource}, User: ${userId}, Draft: ${draftId}`
      );
    } catch (creditError) {
      if (creditError instanceof InsufficientHybridCreditsError) {
        console.log(
          `[CourseFramework] Insufficient credits for framework generation. ` +
          `User: ${userId}, Required: ${creditError.requiredAmount}, ` +
          `User balance: ${creditError.userBalance}, Org balance: ${creditError.orgBalance}`
        );
        return res.status(402).json({
          error: 'Insufficient credits for framework generation',
          requiredCredits: totalCreditCost,
          userBalance: creditError.userBalance,
          orgBalance: creditError.orgBalance,
        });
      }
      throw creditError;
    }

    // Set generation status to 'generating' and return immediately
    await db.update(courseDraftFrameworks)
      .set({
        generationStatus: 'generating',
        generationError: null,
        generationStartedAt: new Date(),
        generationCompletedAt: null,
        generationMetadata: {
          courseDescription: courseDescription || draft.courseDescription,
          targetLessonCount: requestedLessonCount,
          includeRecommendations: includeRecommendations !== false,
          targetAudience: targetAudience || 'intermediate',
          documentCount: completedDocs.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(courseDraftFrameworks.id, draftId));

    console.log(`[CourseFramework] Started background generation for draft ${draftId}`);

    // Return immediately - generation will happen in background
    res.json({
      success: true,
      status: 'generating',
      message: 'Framework generation started',
      draftId,
      startedAt: new Date().toISOString(),
    });

    // Process generation in background using setImmediate
    setImmediate(async () => {
      try {
        // Use rawText-based extraction for AI analysis
        // Also collect structured lesson headings for zero-hallucination topic grounding
        let allStructuredHeadings: Array<{
          index: number;
          rawHeading: string;
          normalizedTitle: string;
          lessonNumber: number | null;
          type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
        }> = [];
        let hasExplicitLessonStructure = false;
        const outlineSelection = ((draft.courseSettings as any)?.documentOutlineSelection || {}) as {
          selectedNodeIds?: string[];
          contextNodeIds?: string[];
        };
        const selectedOutlineNodeIds = new Set(
          Array.isArray(outlineSelection.selectedNodeIds)
            ? outlineSelection.selectedNodeIds.map((id) => String(id || '')).filter(Boolean)
            : [],
        );
        const selectedOutlineContentNodeIds = new Set([
          ...selectedOutlineNodeIds,
          ...(Array.isArray(outlineSelection.contextNodeIds)
            ? outlineSelection.contextNodeIds.map((id) => String(id || '')).filter(Boolean)
            : []),
        ]);
        
        const extractedDocuments = completedDocs.map(doc => {
          const content = doc.extractedContent as { 
            rawText?: string; 
            wordCount?: number;
            sections?: ExtractedSection[];
            documentOutline?: any[];
            structuredLessonHeadings?: Array<{
              index: number;
              rawHeading: string;
              normalizedTitle: string;
              lessonNumber: number | null;
              type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
            }>;
            hasExplicitLessonStructure?: boolean;
          } | null;
          
          // Collect structured headings if available
          if (content?.hasExplicitLessonStructure && content?.structuredLessonHeadings) {
            hasExplicitLessonStructure = true;
            allStructuredHeadings = [...allStructuredHeadings, ...content.structuredLessonHeadings];
          }
          const outlineNodes = resolveDocumentOutline(content, doc);
          const selectedOutlineNodes = selectedOutlineNodeIds.size > 0
            ? outlineNodes.filter((node: any) => selectedOutlineNodeIds.has(String(node?.id || '')))
            : [];
          const selectedOutlineContentNodes = selectedOutlineContentNodeIds.size > 0
            ? outlineNodes.filter((node: any) => selectedOutlineContentNodeIds.has(String(node?.id || '')))
            : selectedOutlineNodes;
          const generationOutlineNodes = selectedOutlineNodes.length > 0
            ? selectedOutlineNodes
            : outlineNodes.filter((node: any) => ['chapter', 'section', 'subsection', 'slide'].includes(String(node?.level || '').toLowerCase()));
          if (generationOutlineNodes.length > 0) {
            const baseIndex = allStructuredHeadings.length;
            generationOutlineNodes.forEach((node: any, index: number) => {
              allStructuredHeadings.push({
                index: baseIndex + index,
                rawHeading: String(node?.title || `Topic ${index + 1}`),
                normalizedTitle: String(node?.title || `Topic ${index + 1}`),
                lessonNumber: index + 1,
                type: String(node?.level || '').toLowerCase() === 'chapter' ? 'chapter' : 'section',
              });
            });
            hasExplicitLessonStructure = true;
          }
          if (selectedOutlineContentNodes.length > 0) {
            const selectedRawText = selectedOutlineContentNodes
              .map((node: any) => `${String(node?.title || '').trim()}\n${String(node?.content || '').trim()}`.trim())
              .filter(Boolean)
              .join('\n\n');
            if (selectedRawText.trim()) {
              return {
                documentId: doc.id,
                fileName: doc.fileName,
                rawText: selectedRawText,
                wordCount: selectedRawText.split(/\s+/).filter(Boolean).length,
              };
            }
          }
          
          // If rawText is available (new format), use it
          if (content?.rawText) {
            return {
              documentId: doc.id,
              fileName: doc.fileName,
              rawText: content.rawText,
              wordCount: content.wordCount || 0,
            };
          }
          
          // Fallback: combine sections into rawText for legacy documents
          const rawText = content?.sections?.map(s => `${s.heading}\n${s.content}`).join('\n\n') || '';
          return {
            documentId: doc.id,
            fileName: doc.fileName,
            rawText,
            wordCount: rawText.split(/\s+/).length,
          };
        });
        
        // Log structured headings detection for debugging
        if (hasExplicitLessonStructure) {
          console.log(`[CourseFramework] Detected explicit lesson structure with ${allStructuredHeadings.length} headings - will enforce topic grounding`);
        }

        const framework = await courseFrameworkAIService.generateFrameworkFromRawText(extractedDocuments, {
          courseDescription: courseDescription || draft.courseDescription || undefined,
          targetLessonCount: requestedLessonCount,
          includeRecommendations: includeRecommendations !== false,
          targetAudience: targetAudience || 'intermediate',
          structuredLessonHeadings: allStructuredHeadings,
          hasExplicitLessonStructure,
          selectedTopics,
          customTopics,
        });

        if ('error' in framework && framework.error === true) {
          // Update status to failed
          await db.update(courseDraftFrameworks)
            .set({
              generationStatus: 'failed',
              generationError: framework.message,
              generationCompletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(courseDraftFrameworks.id, draftId));
          
          console.error(`[CourseFramework] Background generation failed for draft ${draftId}:`, framework.message);
          return;
        }

        // TypeScript now knows framework is GeneratedFramework after the error check above
        const generatedFramework = framework as import('../services/courseFrameworkAIService').GeneratedFramework;

        let finalizedLessons = normalizeCourseCreationLessonPlan(generatedFramework.lessons);
        if (isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED') && isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
          const segments = await db.query.courseDraftDocumentSegments.findMany({
            where: eq(courseDraftDocumentSegments.draftId, draftId),
            orderBy: [asc(courseDraftDocumentSegments.documentId), asc(courseDraftDocumentSegments.segmentIndex)],
          });

          if (segments.length > 0) {
            await db.delete(courseDraftTopicAssignments).where(eq(courseDraftTopicAssignments.draftId, draftId));
            const candidates = finalizedLessons.map((lesson, index) => ({
              id: `lesson:${index}`,
              name: String(lesson.title || `Lesson ${index + 1}`),
              lessonIndex: index,
              isContentLesson: inferLessonType(lesson, index, finalizedLessons.length) === 'content',
            }));
            const assignmentResult = assignSegmentsDeterministically(segments, candidates);
            if (assignmentResult.assigned.length > 0) {
              await db.insert(courseDraftTopicAssignments).values(
                assignmentResult.assigned.map(item => ({
                  draftId,
                  topicId: item.topicId,
                  segmentId: item.segmentId,
                  assignmentMethod: item.assignmentMethod,
                  confidence: item.confidence,
                  isUserConfirmed: false,
                  createdBy: userId,
                }))
              );
            }
            finalizedLessons = normalizeCourseCreationLessonPlan(await applyAssignedSegmentsToLessons(draftId, finalizedLessons));
            await buildCoverageReportSnapshot(draftId, true);
          }
        }
        finalizedLessons = attachOutlineAssetsToLessons(finalizedLessons, completedDocs as any);
        finalizedLessons = await courseFrameworkAIService.normalizeGeneratedLessonsSourceContent(finalizedLessons, {
          targetAudience: targetAudience || 'intermediate',
        }) as any[];

        // Update draft with generated content and set status to completed
        await db.update(courseDraftFrameworks)
          .set({
            generatedTitle: generatedFramework.title,
            generatedDescription: generatedFramework.description,
            generatedLessons: finalizedLessons,
            recommendedLessons: generatedFramework.recommendedLessons,
            generationMetadata: {
              ...(draft.generationMetadata as Record<string, any> || {}),
              ...(generatedFramework.metadata || {}),
            },
            currentStep: 'review',
            generationStatus: 'completed',
            generationError: null,
            generationCompletedAt: new Date(),
            version: draft.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(courseDraftFrameworks.id, draftId));

        console.log(`[CourseFramework] Background generation completed for draft ${draftId}: ${finalizedLessons.length} lessons`);
      } catch (bgError: any) {
        console.error(`[CourseFramework] Background generation error for draft ${draftId}:`, bgError);
        
        // Update status to failed
        await db.update(courseDraftFrameworks)
          .set({
            generationStatus: 'failed',
            generationError: bgError.message || 'An unexpected error occurred during generation',
            generationCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(courseDraftFrameworks.id, draftId));
      }
    });
  } catch (error: any) {
    console.error('[CourseFramework] Generate framework error:', error);
    
    if (error.message?.includes('AI configuration')) {
      return res.status(503).json({ 
        error: 'AI service unavailable',
        message: error.message,
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to generate framework',
      message: error.message || 'An unexpected error occurred.',
    });
  }
});

// Get framework generation status (for polling)
router.get('/:draftId/generation-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const draft = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const response: {
      status: string;
      startedAt?: string;
      completedAt?: string;
      error?: string;
      generatedTitle?: string;
      generatedDescription?: string;
      generatedLessons?: any[];
      recommendedLessons?: any[];
      generationMetadata?: any;
      version?: number;
    } = {
      status: draft.generationStatus || 'idle',
    };

    if (draft.generationStartedAt) {
      response.startedAt = draft.generationStartedAt.toISOString();
    }

    if (draft.generationCompletedAt) {
      response.completedAt = draft.generationCompletedAt.toISOString();
    }

    if (draft.generationStatus === 'failed' && draft.generationError) {
      response.error = draft.generationError;
    }

    // Include generated content if completed
    if (draft.generationStatus === 'completed' && draft.generatedLessons) {
      response.generatedTitle = draft.generatedTitle || undefined;
      response.generatedDescription = draft.generatedDescription || undefined;
      response.generatedLessons = draft.generatedLessons as any[];
      response.recommendedLessons = (draft.recommendedLessons as any[]) || [];
      response.generationMetadata = draft.generationMetadata || undefined;
      response.version = draft.version;
    }

    res.json(response);
  } catch (error: any) {
    console.error('[CourseFramework] Get generation status error:', error);
    res.status(500).json({ error: 'Failed to get generation status' });
  }
});

router.post('/:draftId/lessons/:lessonIndex/objectives', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId, lessonIndex } = req.params;
    const { targetLevel } = req.body;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const lessons = draft!.generatedLessons as any[];
    const index = parseInt(lessonIndex);

    if (!lessons || index < 0 || index >= lessons.length) {
      return res.status(400).json({ error: 'Invalid lesson index' });
    }

    const lesson = lessons[index];
    const objectives = await courseFrameworkAIService.regenerateLessonObjectives(
      lesson,
      targetLevel
    );

    lessons[index] = { ...lesson, objectives };

    const [updatedDraft] = await db.update(courseDraftFrameworks)
      .set({
        generatedLessons: lessons,
        version: draft!.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftFrameworks.id, draftId))
      .returning();

    res.json({
      success: true,
      lessonIndex: index,
      objectives,
      version: updatedDraft.version,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Regenerate objectives error:', error);
    res.status(500).json({ error: 'Failed to regenerate learning objectives' });
  }
});

router.post('/:draftId/duplicate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const userId = req.session.userId!;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft: original, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const sourceDraft = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!sourceDraft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const newDraftId = crypto.randomUUID();
    const newTitle = sourceDraft.generatedTitle ? `${sourceDraft.generatedTitle} (Copy)` : null;
    
    let clonedLessons = null;
    if (sourceDraft.generatedLessons) {
      clonedLessons = (sourceDraft.generatedLessons as any[]).map((lesson: any) => ({
        ...lesson,
        sourceDocumentId: null,
      }));
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const [newDraft] = await db.insert(courseDraftFrameworks)
      .values({
        id: newDraftId,
        organizationId: sourceDraft.organizationId,
        createdBy: userId,
        courseDescription: sourceDraft.courseDescription,
        generatedTitle: newTitle,
        generatedDescription: sourceDraft.generatedDescription,
        generatedLessons: clonedLessons,
        currentStep: 'upload',
        version: 1,
        expiresAt,
      })
      .returning();

    if (sourceDraft.documents && sourceDraft.documents.length > 0) {
      for (const doc of sourceDraft.documents) {
        await db.insert(courseDraftDocuments).values({
          id: crypto.randomUUID(),
          draftId: newDraftId,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          storagePath: doc.storagePath,
          checksum: doc.checksum,
          extractionStatus: doc.extractionStatus,
          extractedContent: doc.extractedContent,
          extractionError: doc.extractionError,
          lessonIndex: doc.lessonIndex,
        });
      }
    }

    const newDocuments = await db.select()
      .from(courseDraftDocuments)
      .where(eq(courseDraftDocuments.draftId, newDraftId));

    console.log(`[CourseFramework] Duplicated draft ${draftId} to ${newDraftId} with ${newDocuments.length} documents by user ${userId}`);

    res.status(201).json({
      id: newDraft.id,
      organizationId: newDraft.organizationId,
      createdBy: newDraft.createdBy,
      generatedTitle: newDraft.generatedTitle,
      currentStep: newDraft.currentStep,
      version: newDraft.version,
      documents: newDocuments.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        extractionStatus: doc.extractionStatus,
      })),
      createdAt: newDraft.createdAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('[CourseFramework] Duplicate draft error:', error);
    res.status(500).json({ error: 'Failed to duplicate draft' });
  }
});

// =====================================================
// LESSON CONTENT SUPPLEMENTATION ENDPOINTS
// =====================================================

const MIN_SOURCE_CONTENT_WORDS = 200;
function calculateWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function normalizeLessonTextForComparison(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[:\-–—]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DraftTopicCandidate {
  id: string;
  name: string;
  lessonIndex: number | null;
  isContentLesson: boolean;
}

const TOPIC_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'about', 'this', 'that', 'your', 'you',
  'lesson', 'module', 'chapter', 'topic', 'overview', 'introduction', 'summary', 'key',
  'takeaways', 'course', 'content',
]);

function tokenizeTopic(value: string): string[] {
  return normalizeLessonTextForComparison(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !TOPIC_STOPWORDS.has(token));
}

function inferLessonType(lesson: any, _index: number, _total: number): 'overview' | 'content' | 'key_takeaways' {
  if (lesson?.lessonType === 'overview' || lesson?.isOverview === true) {
    return 'overview';
  }
  if (lesson?.lessonType === 'key_takeaways') {
    return 'key_takeaways';
  }
  return 'content';
}

function buildDraftTopicCandidates(draft: typeof courseDraftFrameworks.$inferSelect): DraftTopicCandidate[] {
  const lessons = Array.isArray(draft.generatedLessons) ? (draft.generatedLessons as any[]) : [];

  if (lessons.length > 0) {
    return lessons.map((lesson, index) => {
      const lessonType = inferLessonType(lesson, index, lessons.length);
      const lessonTitle = String(lesson?.title || `Lesson ${index + 1}`);
      const validated = validateTopicName(lessonTitle);
      return {
        id: `lesson:${index}`,
        name: validated.valid ? validated.sanitized : lessonTitle,
        lessonIndex: index,
        isContentLesson: lessonType === 'content',
      };
    });
  }

  const selectedTopics = Array.isArray(draft.selectedTopics)
    ? (draft.selectedTopics as any[])
        .map(topic => (typeof topic === 'string' ? topic : ''))
        .map(topic => topic.trim())
        .filter(Boolean)
    : [];

  const customTopics = Array.isArray(draft.customTopics)
    ? (draft.customTopics as any[])
        .map(topic => {
          if (typeof topic === 'string') return topic.trim();
          if (topic && typeof topic === 'object' && typeof topic.name === 'string') return topic.name.trim();
          return '';
        })
        .filter(Boolean)
    : [];

  const unique = Array.from(new Set([...selectedTopics, ...customTopics]));
  return unique.map((topic, index) => {
    const validated = validateTopicName(topic);
    return {
      id: `topic:${index}`,
      name: validated.valid ? validated.sanitized : topic,
      lessonIndex: null,
      isContentLesson: true,
    };
  });
}

function scoreSegmentForTopic(
  segment: typeof courseDraftDocumentSegments.$inferSelect,
  topic: DraftTopicCandidate
): number {
  const topicNormalized = normalizeLessonTextForComparison(topic.name);
  const topicTokens = tokenizeTopic(topic.name);
  if (!topicNormalized || topicTokens.length === 0) {
    return 0;
  }

  const segmentText = normalizeLessonTextForComparison(segment.text || '');
  const headingText = normalizeLessonTextForComparison((segment.headingPath || []).join(' '));
  if (!segmentText && !headingText) {
    return 0;
  }

  let score = 0;

  if (headingText && topicNormalized && headingText.includes(topicNormalized)) {
    score += 8;
  }
  if (segmentText && topicNormalized && segmentText.includes(topicNormalized)) {
    score += 6;
  }

  const headingTokenSet = new Set(headingText.split(' ').filter(Boolean));
  const segmentTokenSet = new Set(segmentText.split(' ').filter(Boolean));
  for (const token of topicTokens) {
    if (headingTokenSet.has(token)) score += 2;
    if (segmentTokenSet.has(token)) score += 1;
  }

  return score;
}

function assignSegmentsDeterministically(
  segments: Array<typeof courseDraftDocumentSegments.$inferSelect>,
  topicCandidates: DraftTopicCandidate[]
): {
  assigned: Array<{
    segmentId: string;
    topicId: string;
    confidence: number;
    assignmentMethod: 'rules';
  }>;
  unassignedSegmentIds: string[];
} {
  const eligibleTopics = topicCandidates.filter(topic => topic.isContentLesson);
  const assigned: Array<{
    segmentId: string;
    topicId: string;
    confidence: number;
    assignmentMethod: 'rules';
  }> = [];
  const unassignedSegmentIds: string[] = [];

  for (const segment of segments) {
    let bestScore = 0;
    let bestTopicId: string | null = null;
    let tied = false;

    for (const topic of eligibleTopics) {
      const score = scoreSegmentForTopic(segment, topic);
      if (score > bestScore) {
        bestScore = score;
        bestTopicId = topic.id;
        tied = false;
      } else if (score > 0 && score === bestScore) {
        tied = true;
      }
    }

    if (bestScore <= 0 || tied || !bestTopicId) {
      unassignedSegmentIds.push(segment.id);
      continue;
    }

    assigned.push({
      segmentId: segment.id,
      topicId: bestTopicId,
      confidence: Math.min(1, bestScore / 12),
      assignmentMethod: 'rules',
    });
  }

  return { assigned, unassignedSegmentIds };
}

async function buildCoverageReportSnapshot(
  draftId: string,
  persist: boolean = true
): Promise<{
  totalSegments: number;
  assignedSegments: number;
  unassignedSegments: number;
  overlapSegments: number;
  excludedSegments: number;
  status: 'pass' | 'fail';
  details: Record<string, any>;
}> {
  const segments = await db.query.courseDraftDocumentSegments.findMany({
    where: eq(courseDraftDocumentSegments.draftId, draftId),
  });
  const assignments = await db.query.courseDraftTopicAssignments.findMany({
    where: eq(courseDraftTopicAssignments.draftId, draftId),
  });

  const segmentIds = new Set(segments.map(segment => segment.id));
  const countsBySegment = new Map<string, number>();
  const countsByTopic = new Map<string, number>();

  for (const assignment of assignments) {
    if (!segmentIds.has(assignment.segmentId)) continue;
    countsBySegment.set(assignment.segmentId, (countsBySegment.get(assignment.segmentId) || 0) + 1);
    countsByTopic.set(assignment.topicId, (countsByTopic.get(assignment.topicId) || 0) + 1);
  }

  let assignedSegments = 0;
  let overlapSegments = 0;
  const unassignedSegmentIds: string[] = [];

  for (const segment of segments) {
    const count = countsBySegment.get(segment.id) || 0;
    if (count > 0) {
      assignedSegments += 1;
    } else {
      unassignedSegmentIds.push(segment.id);
    }
    if (count > 1) {
      overlapSegments += 1;
    }
  }

  const totalSegments = segments.length;
  const unassignedSegments = Math.max(0, totalSegments - assignedSegments);
  const excludedSegments = 0;
  const status: 'pass' | 'fail' =
    totalSegments > 0 && unassignedSegments === 0 && overlapSegments === 0
      ? 'pass'
      : 'fail';

  const details = {
    byTopic: Object.fromEntries(Array.from(countsByTopic.entries())),
    unassignedSegmentIds: unassignedSegmentIds.slice(0, 200),
    unassignedSegmentCount: unassignedSegmentIds.length,
    generatedAt: new Date().toISOString(),
  };

  if (persist) {
    await db.insert(courseDraftCoverageReports).values({
      draftId,
      totalSegments,
      assignedSegments,
      unassignedSegments,
      overlapSegments,
      excludedSegments,
      status,
      details,
    });
  }

  return {
    totalSegments,
    assignedSegments,
    unassignedSegments,
    overlapSegments,
    excludedSegments,
    status,
    details,
  };
}

async function applyAssignedSegmentsToLessons(
  draftId: string,
  lessons: any[]
): Promise<any[]> {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return lessons;
  }

  const assignments = await db.query.courseDraftTopicAssignments.findMany({
    where: eq(courseDraftTopicAssignments.draftId, draftId),
    orderBy: [asc(courseDraftTopicAssignments.createdAt)],
  });
  if (assignments.length === 0) {
    return lessons;
  }

  const segmentIds = Array.from(new Set(assignments.map(assignment => assignment.segmentId)));
  const segments = await db.query.courseDraftDocumentSegments.findMany({
    where: and(
      eq(courseDraftDocumentSegments.draftId, draftId),
      inArray(courseDraftDocumentSegments.id, segmentIds)
    ),
    orderBy: [
      asc(courseDraftDocumentSegments.documentId),
      asc(courseDraftDocumentSegments.segmentIndex),
    ],
  });

  const segmentsById = new Map(segments.map(segment => [segment.id, segment]));
  const assignmentsByTopic = new Map<string, Array<typeof courseDraftTopicAssignments.$inferSelect>>();
  for (const assignment of assignments) {
    const list = assignmentsByTopic.get(assignment.topicId) || [];
    list.push(assignment);
    assignmentsByTopic.set(assignment.topicId, list);
  }

  const updatedLessons = lessons.map((lesson, index) => ({ ...lesson }));
  for (let index = 0; index < updatedLessons.length; index++) {
    const lessonType = inferLessonType(updatedLessons[index], index, updatedLessons.length);
    if (lessonType !== 'content') {
      continue;
    }
    const topicId = `lesson:${index}`;
    const topicAssignments = assignmentsByTopic.get(topicId) || [];
    const sortedSegments = topicAssignments
      .map(assignment => segmentsById.get(assignment.segmentId))
      .filter((segment): segment is typeof courseDraftDocumentSegments.$inferSelect => Boolean(segment))
      .sort((a, b) => {
        if (a.documentId !== b.documentId) return a.documentId.localeCompare(b.documentId);
        return a.segmentIndex - b.segmentIndex;
      });

    updatedLessons[index].sourceSegmentIds = sortedSegments.map(segment => segment.id);
    updatedLessons[index].sourceContent = sortedSegments.map(segment => segment.text).join('\n\n').trim();
  }

  return updatedLessons;
}

function cleanLessonTitleFromOutline(title: string): string {
  return String(title || 'Lesson')
    .replace(/^chapter\s+\d+\s*:\s*/i, '')
    .replace(/^\d+\.\d+(?:\.\d+)*\s+/, '')
    .trim() || 'Lesson';
}

function firstMeaningfulSentence(text: string): string | null {
  const cleaned = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^chapter\s+\d+\b/i.test(line) && !/^\d+\.\d+/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = cleaned.match(/[^.!?]+[.!?]/)?.[0]?.trim();
  return sentence && sentence.length >= 24 ? sentence : null;
}

function childTitlesForOutlineNode(node: DocumentOutlineNode, allNodes: Map<string, DocumentOutlineNode>): string[] {
  return Array.from(allNodes.values())
    .filter((candidate) => String(candidate.parentId || '') === String(node.id || ''))
    .filter((candidate) => ['section', 'subsection', 'slide'].includes(String(candidate.level || '').toLowerCase()))
    .sort((a, b) => (a.pageStart || 0) - (b.pageStart || 0) || (a.order || 0) - (b.order || 0))
    .map((candidate) => cleanLessonTitleFromOutline(candidate.title || ''))
    .filter(Boolean);
}

function buildDeterministicLessonsFromOutlineNodes(
  lessonNodes: DocumentOutlineNode[],
  allNodes: Map<string, DocumentOutlineNode>,
  targetAudience: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
): any[] {
  const lessons: any[] = [];
  const objectiveVerb: Record<'beginner' | 'intermediate' | 'advanced', string> = {
    beginner: 'Describe',
    intermediate: 'Apply',
    advanced: 'Evaluate',
  };

  for (const node of lessonNodes) {
    const title = cleanLessonTitleFromOutline(String(node.title || 'Lesson'));
    const childTitles = childTitlesForOutlineNode(node, allNodes).slice(0, 6);
    const description = firstMeaningfulSentence(String(node.content || ''))
      || (childTitles.length > 0
        ? `Source-grounded lesson covering ${childTitles.join(', ')}.`
        : `Source-grounded lesson covering ${title}.`);
    const objectives = childTitles.length > 0
      ? childTitles.slice(0, 4).map((childTitle) => `${objectiveVerb[targetAudience]} ${childTitle.toLowerCase()} using the source material`)
      : [
          `${objectiveVerb[targetAudience]} the key ideas in ${title.toLowerCase()} using the source material`,
          `Use the source activities and figures to check understanding of ${title.toLowerCase()}`,
        ];

    lessons.push({
      title,
      description,
      objectives,
      learningObjectives: objectives,
      keyTerms: [],
      assessmentIdeas: [],
      isFromContent: true,
      isSelected: true,
      lessonType: 'content',
      sourceContent: String(node.content || ''),
      sourceSegmentIds: [],
      sourceAssets: [],
      sourceOutlineNodeId: node.id,
      sourcePageStart: node.pageStart || null,
      sourcePageEnd: node.pageEnd || node.pageStart || null,
      contentStatus: 'ready',
      metadata: {
        sourceGrounded: true,
        generatedBy: 'document_outline',
      },
    });
  }

  return lessons;
}

function pagesForOutlineNodes(nodes: DocumentOutlineNode[]): number[] {
  const pages = new Set<number>();
  for (const node of nodes) {
    const start = Number(node.pageStart || node.pageEnd || 0);
    const end = Number(node.pageEnd || node.pageStart || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) continue;
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

function pageTextsFromExtractedContent(content: any): string[] {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const byPage = new Map<number, string[]>();
  for (const section of sections) {
    const page = Number(section?.pageNumber || 0);
    if (!Number.isFinite(page) || page <= 0) continue;
    const lines = [`${section?.heading || ''}`, `${section?.content || ''}`].map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const existing = byPage.get(page) || [];
    existing.push(lines.join('\n'));
    byPage.set(page, existing);
  }
  const maxPage = Math.max(0, ...Array.from(byPage.keys()));
  return Array.from({ length: maxPage }, (_, index) => (byPage.get(index + 1) || []).join('\n\n'));
}

async function ensureSelectedPdfPageSnapshots(input: {
  draftId: string;
  organizationId: string;
  userId: string;
  completedDocs: any[];
  selectedContentNodes: DocumentOutlineNode[];
}) {
  if (input.selectedContentNodes.length === 0) return;

  for (const doc of input.completedDocs) {
    if (!(String(doc.mimeType || '').includes('pdf') || String(doc.fileName || '').toLowerCase().endsWith('.pdf'))) continue;
    const content = doc.extractedContent as any;
    const outline = resolveDocumentOutline(content, doc);
    const outlineIds = new Set(outline.map((node: any) => String(node?.id || '')).filter(Boolean));
    const docSelectedNodes = input.selectedContentNodes.filter((node) => outlineIds.has(String(node.id || '')));
    const pages = pagesForOutlineNodes(docSelectedNodes);
    if (pages.length === 0) continue;

    const sourceDocument = await SourceAssetService.getOrCreateSourceDocument({
      organizationId: input.organizationId,
      createdBy: input.userId,
      draftId: input.draftId,
      draftDocumentId: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      originalStoragePath: doc.storagePath,
      checksum: doc.checksum || null,
    });

    const existingAssets = await db.query.courseSourceAssets.findMany({
      where: eq(courseSourceAssets.sourceDocumentId, sourceDocument.id),
    });
    const existingSnapshotPages = new Set(
      existingAssets
        .filter((asset) => asset.assetType === 'page_snapshot')
        .map((asset) => Number(asset.pageOrSlide || 0))
        .filter((page) => Number.isFinite(page) && page > 0),
    );
    const missingPages = pages.filter((page) => !existingSnapshotPages.has(page));
    if (missingPages.length === 0) {
      content.sourceAssets = existingAssets;
      continue;
    }

    const buffer = await objectStorage.downloadCourseDraftDocument(doc.storagePath);
    const extractionResult = await SourceMediaExtractor.extractPdfPageSnapshotsForPages({
      buffer,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      organizationId: input.organizationId,
      sourceDocumentId: sourceDocument.id,
      pageTexts: pageTextsFromExtractedContent(content),
      pages: missingPages,
    });
    const createdAssets = await SourceAssetService.createAssets({
      organizationId: input.organizationId,
      sourceDocumentId: sourceDocument.id,
      assets: extractionResult.assets,
    });
    const refreshedAssets = [...existingAssets, ...createdAssets].sort((a, b) => {
      const pageDiff = Number(a.pageOrSlide || 0) - Number(b.pageOrSlide || 0);
      return pageDiff || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    content.sourceAssets = refreshedAssets;
    content.mediaWarnings = Array.from(new Set([...(content.mediaWarnings || []), ...extractionResult.warnings]));

    await db.update(courseDraftDocuments)
      .set({
        extractedContent: content,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftDocuments.id, doc.id));
  }
}

function detectCrossLessonContamination(
  selectedLessons: any[]
): Array<{ lessonTitle: string; conflictingTitle: string; overlapCount: number }> {
  const issues: Array<{ lessonTitle: string; conflictingTitle: string; overlapCount: number }> = [];

  const contentLessons = selectedLessons
    .map((lesson, index) => ({ lesson, index }))
    .filter(({ lesson }) => {
      if (!lesson) return false;
      const type = String(lesson.lessonType || '').toLowerCase();
      return lesson.isOverview !== true && type !== 'overview' && type !== 'key_takeaways';
    });

  for (let i = 0; i < contentLessons.length; i++) {
    const a = contentLessons[i].lesson;
    const aSegmentIds = new Set(
      Array.isArray(a?.sourceSegmentIds)
        ? a.sourceSegmentIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
        : []
    );
    if (aSegmentIds.size === 0) continue;

    for (let j = i + 1; j < contentLessons.length; j++) {
      const b = contentLessons[j].lesson;
      const bSegmentIds = Array.isArray(b?.sourceSegmentIds)
        ? b.sourceSegmentIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (bSegmentIds.length === 0) continue;

      let overlapCount = 0;
      for (const segmentId of bSegmentIds) {
        if (aSegmentIds.has(segmentId)) {
          overlapCount += 1;
        }
      }

      if (overlapCount > 0) {
        issues.push({
          lessonTitle: a.title || 'Untitled lesson',
          conflictingTitle: b.title || 'Untitled lesson',
          overlapCount,
        });
      }
    }
  }

  return issues;
}

function detectCrossLessonHeuristicSignals(
  selectedLessons: any[]
): Array<{ lessonTitle: string; conflictingTitle: string }> {
  const issues: Array<{ lessonTitle: string; conflictingTitle: string }> = [];

  const contentLessons = selectedLessons.filter((lesson) => {
    if (!lesson) return false;
    const type = String(lesson.lessonType || '').toLowerCase();
    return lesson.isOverview !== true && type !== 'overview' && type !== 'key_takeaways';
  });

  for (const lesson of contentLessons) {
    const contentNormalized = normalizeLessonTextForComparison(lesson.sourceContent || '');
    if (!contentNormalized) continue;

    for (const other of contentLessons) {
      if (other === lesson) continue;
      const otherTitleRaw = (other.title || '').trim();
      if (!otherTitleRaw) continue;

      const otherTitleNormalized = normalizeLessonTextForComparison(otherTitleRaw);
      const otherCoreTitle = normalizeLessonTextForComparison(stripLessonPrefix(otherTitleRaw));

      // Require meaningful title fragments to reduce false positives.
      const titlePhraseHit = otherTitleNormalized.length >= 20 && contentNormalized.includes(otherTitleNormalized);
      const corePhraseHit = otherCoreTitle.length >= 16 && contentNormalized.includes(otherCoreTitle);

      if (titlePhraseHit || corePhraseHit) {
        issues.push({
          lessonTitle: lesson.title || 'Untitled lesson',
          conflictingTitle: other.title || 'Untitled lesson',
        });
      }
    }
  }

  // Deduplicate identical issue pairs.
  const dedup = new Map<string, { lessonTitle: string; conflictingTitle: string }>();
  for (const issue of issues) {
    const key = `${issue.lessonTitle}::${issue.conflictingTitle}`;
    if (!dedup.has(key)) {
      dedup.set(key, issue);
    }
  }
  return Array.from(dedup.values());
}

function recalculateLessonContentStatus(lesson: any): any {
  const sourceContent = lesson.sourceContent || '';
  const wordCount = calculateWordCount(sourceContent);
  const minRequired = MIN_SOURCE_CONTENT_WORDS;
  const deficit = Math.max(0, minRequired - wordCount);
  
  return {
    ...lesson,
    contentWordCount: wordCount,
    contentDeficit: deficit,
    contentStatus: wordCount >= minRequired ? 'ok' : 'needs_content',
    contentWarning: wordCount < minRequired 
      ? `Insufficient source content (${wordCount}/${minRequired} words). Add ${deficit} more words.`
      : undefined,
    canGenerate: wordCount >= minRequired,
  };
}

// POST /:draftId/lessons/:lessonIndex/supplement - Upload additional document content
router.post('/:draftId/lessons/:lessonIndex/supplement', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { draftId, lessonIndex: lessonIndexStr } = req.params;
    const lessonIndex = parseInt(lessonIndexStr, 10);
    const userId = req.session.userId!;
    
    if (isNaN(lessonIndex) || lessonIndex < 0) {
      return res.status(400).json({ error: 'Invalid lesson index' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error || !draft) {
      return res.status(statusCode || 404).json({ error: error || 'Draft not found' });
    }

    const lessons = (draft.generatedLessons as any[]) || [];
    if (lessonIndex >= lessons.length) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Extract content from uploaded document (DOCX/PPTX/PDF)
    const extracted = await CourseFrameworkExtractor.extract(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (!extracted.rawText || extracted.rawText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract content from uploaded document' });
    }

    const existingContent = lessons[lessonIndex].sourceContent || '';
    const separator = existingContent ? '\n\n--- Additional Content ---\n\n' : '';
    const newSourceContent = existingContent + separator + extracted.rawText.trim();
    
    // Update lesson with merged content
    lessons[lessonIndex] = {
      ...lessons[lessonIndex],
      sourceContent: newSourceContent,
    };
    
    // Recalculate content status
    lessons[lessonIndex] = recalculateLessonContentStatus(lessons[lessonIndex]);

    // Update draft with modified lessons
    const [updatedDraft] = await db.update(courseDraftFrameworks)
      .set({
        generatedLessons: lessons,
        version: draft.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftFrameworks.id, draftId))
      .returning();

    // Sync updated content to linked lesson if exists
    const updatedLessonData = lessons[lessonIndex];
    if (updatedLessonData.lessonId) {
      try {
        await db.update(lessonsTable)
          .set({ 
            inputText: newSourceContent,
            updatedAt: new Date()
          })
          .where(eq(lessonsTable.id, updatedLessonData.lessonId));
        console.log(`[CourseFramework] Synced content to lesson ${updatedLessonData.lessonId} (${updatedLessonData.contentWordCount} words)`);
      } catch (syncError) {
        console.warn(`[CourseFramework] Failed to sync content to lesson ${updatedLessonData.lessonId}:`, syncError);
        // Don't fail the request - just log the warning
      }
    }

    console.log(`[CourseFramework] Supplemented lesson ${lessonIndex} of draft ${draftId} with ${extracted.wordCount} words from ${req.file.originalname}`);

    res.json({
      success: true,
      lessonIndex,
      lesson: lessons[lessonIndex],
      addedWords: extracted.wordCount,
      newWordCount: lessons[lessonIndex].contentWordCount,
      contentStatus: lessons[lessonIndex].contentStatus,
      version: updatedDraft.version,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Supplement lesson error:', error);
    res.status(500).json({ error: 'Failed to supplement lesson content' });
  }
});

// POST /:draftId/lessons/:lessonIndex/generate-content - Generate content using Gemini AI
router.post('/:draftId/lessons/:lessonIndex/generate-content', requireAuth, async (req: Request, res: Response) => {
  try {
    if (isFeatureEnabled('CF_V2_NO_FRAMEWORK_GENERATION')) {
      return res.status(409).json({
        error: 'Lesson content generation is disabled',
        message: 'AI content generation is disabled in source-grounded mode. Use segment assignment instead.',
      });
    }

    const { draftId, lessonIndex: lessonIndexStr } = req.params;
    const lessonIndex = parseInt(lessonIndexStr, 10);
    const userId = req.session.userId!;
    
    if (isNaN(lessonIndex) || lessonIndex < 0) {
      return res.status(400).json({ error: 'Invalid lesson index' });
    }

    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error || !draft) {
      return res.status(statusCode || 404).json({ error: error || 'Draft not found' });
    }

    const lessons = (draft.generatedLessons as any[]) || [];
    if (lessonIndex >= lessons.length) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const lesson = lessons[lessonIndex];
    const currentWordCount = calculateWordCount(lesson.sourceContent || '');
    const wordsNeeded = Math.max(0, MIN_SOURCE_CONTENT_WORDS - currentWordCount) + 50; // Add buffer

    // Generate content using Gemini
    const courseTitle = draft.generatedTitle || 'Course';
    const courseDescription = draft.generatedDescription || '';
    
    const generatedContent = await courseFrameworkAIService.generateLessonContent(
      lesson.title,
      lesson.description,
      lesson.objectives || [],
      courseTitle,
      courseDescription,
      wordsNeeded,
      lesson.sourceContent || ''
    );

    if (!generatedContent || generatedContent.trim().length === 0) {
      return res.status(500).json({ 
        error: 'Failed to generate content',
        details: 'AI returned empty content. Please try again or upload a document instead.',
      });
    }

    // Merge generated content with existing
    const existingContent = lesson.sourceContent || '';
    const separator = existingContent ? '\n\n--- AI-Generated Content ---\n\n' : '';
    const newSourceContent = existingContent + separator + generatedContent;
    
    // Update lesson with generated content
    lessons[lessonIndex] = {
      ...lesson,
      sourceContent: newSourceContent,
    };
    
    // Recalculate content status
    lessons[lessonIndex] = recalculateLessonContentStatus(lessons[lessonIndex]);

    // Update draft
    const [updatedDraft] = await db.update(courseDraftFrameworks)
      .set({
        generatedLessons: lessons,
        version: draft.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftFrameworks.id, draftId))
      .returning();

    // Sync updated content to linked lesson if exists
    const updatedLessonData = lessons[lessonIndex];
    if (updatedLessonData.lessonId) {
      try {
        await db.update(lessonsTable)
          .set({ 
            inputText: newSourceContent,
            updatedAt: new Date()
          })
          .where(eq(lessonsTable.id, updatedLessonData.lessonId));
        console.log(`[CourseFramework] Synced content to lesson ${updatedLessonData.lessonId} (${updatedLessonData.contentWordCount} words)`);
      } catch (syncError) {
        console.warn(`[CourseFramework] Failed to sync content to lesson ${updatedLessonData.lessonId}:`, syncError);
        // Don't fail the request - just log the warning
      }
    }

    const generatedWords = calculateWordCount(generatedContent);
    console.log(`[CourseFramework] AI-generated ${generatedWords} words for lesson ${lessonIndex} of draft ${draftId}`);

    res.json({
      success: true,
      lessonIndex,
      lesson: lessons[lessonIndex],
      generatedWords,
      newWordCount: lessons[lessonIndex].contentWordCount,
      contentStatus: lessons[lessonIndex].contentStatus,
      version: updatedDraft.version,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Generate lesson content error:', error);
    res.status(500).json({ error: 'Failed to generate lesson content' });
  }
});

const finalizeDraftRequestSchema = z.object({
  price: z.string().optional(),
  currency: z.enum(['ZAR', 'USD', 'EUR']).optional(),
  visibility: z.enum(['public', 'org_only']).optional(),
  difficultyLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  selectedLessonIds: z.array(z.string()).min(1, 'At least one lesson must be selected'),
  generatedLessons: z.array(z.record(z.unknown())).optional(),
  categoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  subUnitId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
});

router.post('/:draftId/finalize', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const userId = req.session.userId!;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error) {
      return res.status(statusCode).json({ error });
    }

    const validation = finalizeDraftRequestSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request parameters', 
        details: validation.error.errors 
      });
    }
    const courseSettings = validation.data;
    const categoryId = req.body.categoryId || null;
    const unitId = req.body.unitId || null;
    const subjectId = req.body.subjectId || null;
    const subUnitId = req.body.subUnitId || null;
    const teamId = req.body.teamId || null;

    const policy = await getOrgTypePolicyById(effectiveOrgId!);
    if (!policy) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const finalVisibility = policy.forceFreePrice ? 'org_only' : (courseSettings.visibility || 'org_only');
    const finalPrice = policy.forceFreePrice ? '0' : (courseSettings.price || '0');

    const draftWithDocs = await db.query.courseDraftFrameworks.findFirst({
      where: eq(courseDraftFrameworks.id, draftId),
      with: {
        documents: true,
      },
    });

    if (!draftWithDocs) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (draftWithDocs.publishedCourseId) {
      return res.status(400).json({ 
        error: 'Draft already finalized',
        courseId: draftWithDocs.publishedCourseId,
      });
    }

    if (!draftWithDocs.generatedTitle) {
      return res.status(400).json({ error: 'Course title is required' });
    }

    if (!draftWithDocs.generatedDescription) {
      return res.status(400).json({ error: 'Course description is required' });
    }

    let generatedLessons = Array.isArray(courseSettings.generatedLessons) && courseSettings.generatedLessons.length > 0
      ? courseSettings.generatedLessons as any[]
      : (draftWithDocs.generatedLessons as any[]) || [];
    const firstDetectedLanguage = draftWithDocs.documents.find(doc => {
      const content = doc.extractedContent as any;
      return Boolean(content?.detectedLanguage);
    });
    const defaultLanguageCode =
      ((firstDetectedLanguage?.extractedContent as any)?.detectedLanguage as string | undefined) || 'en';

    if (isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED')) {
      generatedLessons = await applyAssignedSegmentsToLessons(draftId, generatedLessons);
      await db.update(courseDraftFrameworks)
        .set({
          generatedLessons,
          updatedAt: new Date(),
        })
        .where(eq(courseDraftFrameworks.id, draftId));
    }
    
    // Validate selectedLessonIds are within valid range - reject invalid requests
    const requestedIds = courseSettings.selectedLessonIds || [];
    if (requestedIds.length > 0) {
      const maxValidIndex = generatedLessons.length - 1;
      const invalidIds = requestedIds.filter(id => {
        const index = parseInt(id, 10);
        return isNaN(index) || index < 0 || index > maxValidIndex;
      });
      
      if (invalidIds.length > 0) {
        return res.status(400).json({ 
          error: 'Invalid lesson selection', 
          details: `Invalid lesson indices: ${invalidIds.join(', ')}. Valid range: 0-${maxValidIndex}` 
        });
      }
    }
    
    const selectedLessonIds = new Set(requestedIds);
    const selectedLessons = generatedLessons.filter((lesson, index) => {
      const lessonType = String((lesson as any)?.lessonType || '').toLowerCase();
      const isStructural =
        (lesson as any)?.isOverview === true ||
        lessonType === 'overview' ||
        lessonType === 'key_takeaways';
      return isStructural || selectedLessonIds.has(index.toString());
    });

    const selectedOverviewCount = selectedLessons.filter((lesson: any) =>
      lesson?.isOverview === true || String(lesson?.lessonType || '').toLowerCase() === 'overview'
    ).length;
    const selectedKeyTakeawaysCount = selectedLessons.filter((lesson: any) =>
      String(lesson?.lessonType || '').toLowerCase() === 'key_takeaways'
    ).length;
    const selectedContentCount = selectedLessons.filter((lesson: any) => {
      const type = String(lesson?.lessonType || '').toLowerCase();
      return lesson?.isOverview !== true && type !== 'overview' && type !== 'key_takeaways';
    }).length;

    if (selectedOverviewCount !== 1 || selectedKeyTakeawaysCount !== 1 || selectedContentCount === 0) {
      return res.status(400).json({
        error: 'Invalid lesson structure',
        message: 'Select exactly one Overview lesson, at least one content lesson, and exactly one Key Takeaways lesson before creating the course.',
        selectedOverviewCount,
        selectedContentCount,
        selectedKeyTakeawaysCount,
      });
    }

    if (isFeatureEnabled('CF_V2_FINALIZE_COVERAGE_GATE')) {
      if (!isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED') || !isFeatureEnabled('CF_V2_SEGMENTS_ENABLED')) {
        return res.status(409).json({
          error: 'Coverage gate cannot run',
          message: 'Enable CF_V2_ASSIGNMENT_ENFORCED and CF_V2_SEGMENTS_ENABLED before finalization.',
        });
      }

      const coverageReport = await buildCoverageReportSnapshot(draftId, true);
      if (coverageReport.status !== 'pass') {
        return res.status(409).json({
          error: 'Coverage gate failed',
          message: 'All extracted segments must be assigned to a single topic before finalization.',
          coverageReport,
        });
      }

      const selectedSegmentIds = new Set<string>();
      const lessonsMissingSource: string[] = [];
      for (const lesson of selectedLessons) {
        const segmentIds = Array.isArray((lesson as any).sourceSegmentIds)
          ? ((lesson as any).sourceSegmentIds as string[])
          : [];
        const lessonType = String((lesson as any).lessonType || '').toLowerCase();
        const isOverview = (lesson as any).isOverview === true || lessonType === 'overview';
        const isTakeaways = lessonType === 'key_takeaways';

        if (!isOverview && !isTakeaways && segmentIds.length === 0) {
          lessonsMissingSource.push(String((lesson as any).title || 'Untitled lesson'));
        }
        for (const segmentId of segmentIds) {
          selectedSegmentIds.add(segmentId);
        }
      }

      if (lessonsMissingSource.length > 0) {
        return res.status(409).json({
          error: 'Coverage gate failed',
          message: 'Selected content lessons must each contain assigned source segments.',
          lessons: lessonsMissingSource,
          coverageReport,
        });
      }

      if (selectedSegmentIds.size !== coverageReport.totalSegments) {
        return res.status(409).json({
          error: 'Selection would lose source content',
          message: 'Selected lessons do not cover all extracted segments. Include additional lessons or reassign segments.',
          selectedAssignedSegments: selectedSegmentIds.size,
          totalSegments: coverageReport.totalSegments,
          coverageReport,
        });
      }
    }

    const contaminationIssues = detectCrossLessonContamination(selectedLessons);
    if (contaminationIssues.length > 0) {
      const sample = contaminationIssues.slice(0, 5).map(
        issue =>
          `"${issue.lessonTitle}" and "${issue.conflictingTitle}" share ${issue.overlapCount} source segment(s)`
      );
      return res.status(400).json({
        error: 'Cross-lesson source content contamination detected',
        details: sample,
        recommendation:
          'Resolve overlapping source-segment assignments between content lessons, then retry finalize.',
      });
    }

    const heuristicSignals = detectCrossLessonHeuristicSignals(selectedLessons);
    if (heuristicSignals.length > 0) {
      const sample = heuristicSignals.slice(0, 3).map(
        issue => `"${issue.lessonTitle}" references "${issue.conflictingTitle}"`
      );
      console.warn(
        `[CourseFramework] Heuristic cross-lesson title references detected during finalize for draft ${draftId}: ${sample.join('; ')}`
      );
    }

    const result = await db.transaction(async (tx) => {
      // Create course without legacy scope fields - scope is managed via courseAssignments
      const [course] = await tx.insert(courses).values({
        title: draftWithDocs.generatedTitle!,
        description: draftWithDocs.generatedDescription,
        organizationId: effectiveOrgId!,
        createdBy: userId,
        status: 'draft',
        visibility: finalVisibility as 'public' | 'org_only',
        difficultyLevel: courseSettings.difficultyLevel || 'intermediate',
        currency: courseSettings.currency || 'ZAR',
        price: finalPrice,
        categoryId: categoryId,
        languageCode: defaultLanguageCode,
        // Note: unitId and subUnitId are no longer written here - use courseAssignments
      }).returning();

      await tx.update(courses).set({ contentGroupId: course.id }).where(eq(courses.id, course.id));

      await tx.insert(courseVersions).values({
        courseId: course.id,
        versionNumber: '1.0',
        title: course.title,
        description: course.description || '',
        thumbnailUrl: course.thumbnailUrl,
        basePrice: finalPrice,
        baseCurrency: courseSettings.currency || 'ZAR',
      });

      // If scope is provided, create a courseAssignment (single source of truth for course scope)
      if (unitId || subjectId || subUnitId || teamId) {
        // Determine assignmentScope based on hierarchy: team > unit > department
        let assignmentScope: 'department' | 'subject' | 'unit' | 'team' = unitId ? 'department' : 'subject';
        if (teamId) {
          assignmentScope = 'team';
        } else if (subUnitId) {
          assignmentScope = 'unit';
        } else if (subjectId) {
          assignmentScope = 'subject';
        }
        
        await tx.insert(courseAssignments).values({
          courseId: course.id,
          organizationId: effectiveOrgId!,
          assignedBy: userId,
          unitId: unitId || null,
          subjectId: subjectId || null,
          subUnitId: subUnitId || null,
          teamId: teamId || null,
          audience: 'learner',
          assignmentScope: assignmentScope,
          mandatory: false,
          assignedAt: new Date(),
        });
      }

      await tx.insert(courseFrameworks).values({
        courseId: course.id,
        organizationId: effectiveOrgId!,
        topics: [],
      });

      const topics = selectedLessons.map((lesson, index) => ({
        id: crypto.randomUUID(),
        order: index,
        name: lesson.title,
        description: lesson.description || '',
        detailedSummary: lesson.detailedSummary || '',
        isOverview: lesson.isOverview || String((lesson as any).lessonType || '').toLowerCase() === 'overview',
        userEditedName: false,
        userEditedDescription: false,
        lessonId: null as string | null,
        // Enriched fields for contextual lesson generation
        learningObjectives: lesson.learningObjectives || [],
        prerequisiteTopicIds: lesson.prerequisiteTopicIds || [],
        keyTerms: lesson.keyTerms || [],
        assessmentIdeas: lesson.assessmentIdeas || [],
        estimatedDurationMinutes: lesson.estimatedDurationMinutes || undefined,
        // Source document content fields
        sourceContent: lesson.sourceContent || '',
        sourceContentRaw: (lesson as any).sourceContentRaw || '',
        sourceDocumentId: lesson.sourceDocumentId || null,
        sourceAssets: Array.isArray((lesson as any).sourceAssets) ? (lesson as any).sourceAssets : [],
        sourceNormalization: (lesson as any).sourceNormalization || null,
        sourceNormalizationWarnings: Array.isArray((lesson as any).sourceNormalizationWarnings)
          ? (lesson as any).sourceNormalizationWarnings
          : [],
        sourceCitations: Array.isArray((lesson as any).sourceCitations) ? (lesson as any).sourceCitations : [],
        sourceSummary: '',
      }));

      const createdLessonIds: string[] = [];
      const pptxArtifactsToStore: Array<{
        lessonId: string;
        draftStoragePath: string;
        fileName: string;
      }> = [];

      for (let i = 0; i < selectedLessons.length; i++) {
        const lessonData = selectedLessons[i];
        const lessonType = String(lessonData.lessonType || (lessonData.isOverview ? 'overview' : 'content')).toLowerCase();
        const isStructuralLesson = lessonData.isOverview === true || lessonType === 'overview' || lessonType === 'key_takeaways';
        const lessonSourceText = String(lessonData.sourceContent || '').trim();
        const hasSourceText = lessonSourceText.length > 0;
        const isEmptyStructuralPlaceholder = isStructuralLesson && !hasSourceText;
        const lessonInputText = isStructuralLesson
          ? (hasSourceText ? lessonSourceText : null)
          : (lessonSourceText || lessonData.description || null);
        const lessonSourceAssets = Array.isArray((lessonData as any).sourceAssets) ? (lessonData as any).sourceAssets : [];
        const sourceLessonContent = lessonInputText
          ? buildSourceLessonContent({
              title: lessonData.title,
              sourceText: lessonInputText,
              objectives: Array.isArray(lessonData.objectives) ? lessonData.objectives : [],
              sourceAssets: lessonSourceAssets,
            })
          : null;
        const finalizedSourceMaterial = buildFinalizedSourceLessonMaterialV2({
          lessonData,
          lessonInputText,
          lessonSourceAssets,
          sourceDocumentId: lessonData.sourceDocumentId || null,
        });
        const sourceLessonContentV2 = finalizedSourceMaterial.sourceLessonContentV2;
        const sourcePptxStoragePath = String((lessonData as any).sourcePptxStoragePath || (lessonData as any).uploadedPptxStorageKey || '').trim();
        const sourceDocumentType = String((lessonData as any).sourceDocumentType || '').toLowerCase();
        const uploadedPptxSlideCount = Number((lessonData as any).slideCount || 0);

        const [newLesson] = await tx.insert(lessonsTable).values({
          title: lessonData.title,
          description: lessonData.description || `Lesson content for: ${lessonData.title}`,
          createdBy: userId,
          organizationId: effectiveOrgId!,
          generationMode: 'document-upload',
          generationStatus: sourceLessonContent && (!sourceLessonContentV2 || sourceLessonContentV2.quality.valid) ? 'completed' : 'pending',
          // Empty structural placeholders are generated later. User-promoted
          // structural lessons keep their selected source content.
          inputText: lessonInputText,
          slideCount: Number.isFinite(uploadedPptxSlideCount) && uploadedPptxSlideCount > 0 ? Math.round(uploadedPptxSlideCount) : undefined,
          isPublished: false,
          isArchived: false,
          languageCode: defaultLanguageCode,
          metadata: {
            objectives: lessonData.objectives || [],
            sourceDocumentId: lessonData.sourceDocumentId || null,
            sourceDraftDocumentId: (lessonData as any).sourceDraftDocumentId || null,
            sourceDocumentName: (lessonData as any).sourceDocumentName || null,
            sourceDocumentType: sourceDocumentType || null,
            sourcePptxStoragePath: sourcePptxStoragePath || null,
            sourceSegmentIds: Array.isArray(lessonData.sourceSegmentIds) ? lessonData.sourceSegmentIds : [],
            sourceAssets: lessonSourceAssets,
            sourceContentRaw: (lessonData as any).sourceContentRaw || null,
            sourceNormalization: (lessonData as any).sourceNormalization || null,
            sourceNormalizationWarnings: Array.isArray((lessonData as any).sourceNormalizationWarnings)
              ? (lessonData as any).sourceNormalizationWarnings
              : [],
            sourceCitations: Array.isArray((lessonData as any).sourceCitations) ? (lessonData as any).sourceCitations : [],
            sourceLessonContentV1: sourceLessonContent,
            sourceLessonContentV2,
            createdFromDraft: draftId,
            placeholder: isEmptyStructuralPlaceholder,
            createdDuringCourseCreation: !isEmptyStructuralPlaceholder,
            uploadedPptxArtifact: Boolean(sourcePptxStoragePath && sourceDocumentType === 'pptx'),
            preconvertSlidesOnFinalize: Boolean(sourcePptxStoragePath && sourceDocumentType === 'pptx'),
          },
        }).returning();

        if (lessonInputText) {
          await tx.insert(lessonContentVersions).values({
            lessonId: newLesson.id,
            versionNumber: 1,
            source: 'course_builder_source_v1',
            changeDescription: 'Original selected source content from course builder',
            previousContent: null,
            newContent: lessonInputText,
            previousTitle: null,
            newTitle: lessonData.title,
            previousDescription: null,
            newDescription: lessonData.description || `Lesson content for: ${lessonData.title}`,
            metadata: {
              semanticVersion: 'V1',
              sourceVersionRole: 'immutable_original',
              sourceDocumentId: lessonData.sourceDocumentId || null,
              sourceDraftDocumentId: (lessonData as any).sourceDraftDocumentId || null,
              sourceDocumentName: (lessonData as any).sourceDocumentName || null,
              selectedOutlineNodeId: (lessonData as any).sourceOutlineNodeId || null,
              lessonType,
              createdFromDraft: draftId,
              createdDuringCourseCreation: true,
            },
            createdBy: userId,
          } as any);
        }

        if (sourcePptxStoragePath && sourceDocumentType === 'pptx') {
          pptxArtifactsToStore.push({
            lessonId: newLesson.id,
            draftStoragePath: sourcePptxStoragePath,
            fileName: String((lessonData as any).sourceDocumentName || lessonData.title || 'lesson.pptx'),
          });
        }

        const lessonVisualAssetIds = lessonSourceAssets
          .filter((asset: any) => asset?.assetId && (asset.recommendedUse === 'lesson_visual' || asset.recommendedUse === 'reference'))
          .map((asset: any) => String(asset.assetId));
        if (lessonVisualAssetIds.length > 0) {
          await SourceAssetService.linkAssets({
            organizationId: effectiveOrgId!,
            assetIds: lessonVisualAssetIds,
            linkedEntityType: 'lesson',
            linkedEntityId: newLesson.id,
            recommendedUse: 'lesson_visual',
            sourceSegmentIds: lessonSourceAssets.flatMap((asset: any) => Array.isArray(asset.sourceSegmentIds) ? asset.sourceSegmentIds : []),
            createdBy: userId,
          });
        }

        await tx.insert(courseLessons).values({
          courseId: course.id,
          lessonId: newLesson.id,
          topicName: lessonData.title,
          topicOrder: i,
          lessonType: lessonData.lessonType || (lessonData.isOverview ? 'overview' : 'content'),
        });

        topics[i].lessonId = newLesson.id;
        createdLessonIds.push(newLesson.id);
      }

      await tx.update(courseFrameworks)
        .set({ topics: topics as any })
        .where(eq(courseFrameworks.courseId, course.id));

      return { course, createdLessonIds, pptxArtifactsToStore };
    });

    if (result.pptxArtifactsToStore.length > 0) {
      for (const artifact of result.pptxArtifactsToStore) {
        const pptxBuffer = await objectStorage.downloadCourseDraftDocument(artifact.draftStoragePath);
        await LessonService.storePPTX(artifact.lessonId, pptxBuffer, userId, {
          isGenerated: false,
          languageCode: defaultLanguageCode,
          awaitSlidePreconvertMs: 15000,
        });
        console.log(`[CourseFramework] Stored uploaded PowerPoint artifact for lesson ${artifact.lessonId}: ${artifact.fileName}`);
      }
    }

    await db.update(courseDraftFrameworks)
      .set({
        publishedCourseId: result.course.id,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftFrameworks.id, draftId));

    await SourceAssetService.promoteDraftSourcesToCourse(draftId, result.course.id);

    // Delete the draft after successful course creation
    try {
      // First, get documents to clean up storage
      const draftDocs = await db.query.courseDraftDocuments.findMany({
        where: eq(courseDraftDocuments.draftId, draftId),
      });
      
      // Delete files from object storage
      for (const doc of draftDocs) {
        const durableSource = await db.query.courseSourceDocuments.findFirst({
          where: eq(courseSourceDocuments.draftDocumentId, doc.id),
        });
        if (!durableSource) {
          try {
            await objectStorage.deleteCourseDraftDocument(doc.storagePath);
          } catch (storageError) {
            console.warn(`[CourseFramework] Failed to delete file from storage during finalize: ${doc.storagePath}`, storageError);
          }
        }
      }
      
      // Delete the draft (cascades to documents)
      await db.delete(courseDraftFrameworks)
        .where(eq(courseDraftFrameworks.id, draftId));
      
      console.log(`[CourseFramework] Deleted draft ${draftId} after successful course creation`);
    } catch (cleanupError) {
      // Log but don't fail - the course was created successfully
      console.error(`[CourseFramework] Failed to delete draft ${draftId} after finalize:`, cleanupError);
    }

    console.log(`[CourseFramework] Finalized draft ${draftId} -> course ${result.course.id} with ${selectedLessons.length} lessons`);

    res.json({
      success: true,
      courseId: result.course.id,
      lessonCount: selectedLessons.length,
      lessonIds: result.createdLessonIds,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Finalize draft error:', error);
    res.status(500).json({ error: 'Failed to finalize course', message: error.message });
  }
});

const createManualCourseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must not exceed 200 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description must not exceed 2000 characters'),
  numberOfContentLessons: z.number().int().min(1, 'Must have at least 1 content lesson').max(20, 'Cannot exceed 20 content lessons'),
  visibility: z.enum(['public', 'org_only']).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  subUnitId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  languageCode: z.string().min(2).max(10).optional(),
});

router.post('/create-manual', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const validation = createManualCourseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request parameters', 
        details: validation.error.errors 
      });
    }

    const { title, description, numberOfContentLessons, visibility, categoryId, unitId, subUnitId, teamId, languageCode } = validation.data;

    const policy = await getOrgTypePolicyById(effectiveOrgId);
    const finalVisibility = policy?.forceFreePrice ? 'org_only' : (visibility || 'org_only');

    const result = await db.transaction(async (tx) => {
      // Create course without legacy scope fields - scope is now managed via courseAssignments
      const [course] = await tx.insert(courses).values({
        title,
        description,
        organizationId: effectiveOrgId,
        createdBy: userId,
        status: 'draft',
        visibility: finalVisibility as 'public' | 'org_only',
        difficultyLevel: 'intermediate',
        currency: 'ZAR',
        price: '0',
        categoryId: categoryId || null,
        languageCode: languageCode || 'en',
      }).returning();

      await tx.update(courses).set({ contentGroupId: course.id }).where(eq(courses.id, course.id));

      // Create a default course assignment (single source of truth for course scope).
      // If no explicit unit/sub-unit/team was selected, scope defaults to entire organization.
      if (unitId) {
        let assignmentScope: 'department' | 'unit' | 'team' = 'department';
        if (teamId) {
          assignmentScope = 'team';
        } else if (subUnitId) {
          assignmentScope = 'unit';
        }

        await tx.insert(courseAssignments).values({
          courseId: course.id,
          organizationId: effectiveOrgId,
          assignedBy: userId,
          unitId: unitId,
          subUnitId: subUnitId || null,
          teamId: teamId || null,
          audience: 'learner',
          assignmentScope: assignmentScope,
          mandatory: false,
          assignedAt: new Date(),
        });
      } else {
        await tx.insert(courseAssignments).values({
          courseId: course.id,
          organizationId: effectiveOrgId,
          assignedBy: userId,
          unitId: null,
          subUnitId: null,
          teamId: null,
          audience: 'learner',
          assignmentScope: 'organization',
          mandatory: false,
          assignedAt: new Date(),
        });
      }

      await tx.insert(courseVersions).values({
        courseId: course.id,
        versionNumber: '1.0',
        title: course.title,
        description: course.description || '',
        thumbnailUrl: course.thumbnailUrl,
        basePrice: '0',
        baseCurrency: 'ZAR',
      });

      await tx.insert(courseFrameworks).values({
        courseId: course.id,
        organizationId: effectiveOrgId,
        topics: [],
      });

      const totalLessons = numberOfContentLessons + 2;
      const createdLessonIds: string[] = [];
      const topics: any[] = [];

      for (let i = 0; i < totalLessons; i++) {
        let lessonTitle: string;
        let lessonDescription: string;
        let isOverview = false;

        if (i === 0) {
          lessonTitle = 'Overview';
          lessonDescription = 'Course overview and introduction';
          isOverview = true;
        } else if (i === totalLessons - 1) {
          lessonTitle = 'Key Takeaways';
          lessonDescription = 'Summary and key takeaways from the course';
        } else {
          lessonTitle = `Lesson ${i}`;
          lessonDescription = `Content lesson ${i}`;
        }

        const [newLesson] = await tx.insert(lessonsTable).values({
          title: lessonTitle,
          description: lessonDescription,
          createdBy: userId,
          organizationId: effectiveOrgId,
          generationMode: 'manual',
          generationStatus: 'pending',
          inputText: null,
          isPublished: false,
          isArchived: false,
          languageCode: languageCode || 'en',
          metadata: {
            objectives: [],
            createdFromManualMode: true,
          },
        }).returning();

        await tx.insert(courseLessons).values({
          courseId: course.id,
          lessonId: newLesson.id,
          topicName: lessonTitle,
          topicOrder: i,
        });

        topics.push({
          id: crypto.randomUUID(),
          order: i,
          name: lessonTitle,
          description: lessonDescription,
          detailedSummary: '',
          isOverview,
          userEditedName: false,
          userEditedDescription: false,
          lessonId: newLesson.id,
          learningObjectives: [],
          prerequisiteTopicIds: [],
          keyTerms: [],
          assessmentIdeas: [],
          sourceContent: '',
          sourceDocumentId: null,
          sourceSummary: '',
        });

        createdLessonIds.push(newLesson.id);
      }

      await tx.update(courseFrameworks)
        .set({ topics: topics as any })
        .where(eq(courseFrameworks.courseId, course.id));

      return { course, createdLessonIds };
    });

    console.log(`[CourseFramework] Created manual course ${result.course.id} with ${result.createdLessonIds.length} lessons`);

    res.json({
      success: true,
      courseId: result.course.id,
      lessonCount: result.createdLessonIds.length,
      lessonIds: result.createdLessonIds,
    });
  } catch (error: any) {
    console.error('[CourseFramework] Create manual course error:', error);
    res.status(500).json({ error: 'Failed to create course', message: error.message });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { page = '1', limit = '10' } = req.query;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = eq(courseDraftFrameworks.organizationId, effectiveOrgId);

    const drafts = await db.query.courseDraftFrameworks.findMany({
      where: whereClause,
      orderBy: [desc(courseDraftFrameworks.updatedAt)],
      limit: limitNum,
      offset,
      with: {
        documents: {
          columns: {
            id: true,
            fileName: true,
            extractionStatus: true,
          },
        },
      },
    });

    res.json({
      items: drafts.map(draft => ({
        id: draft.id,
        organizationId: draft.organizationId,
        generatedTitle: draft.generatedTitle,
        currentStep: draft.currentStep,
        version: draft.version,
        documentCount: draft.documents.length,
        documents: draft.documents,
        createdAt: draft.createdAt?.toISOString(),
        updatedAt: draft.updatedAt?.toISOString(),
      })),
      page: pageNum,
      pageSize: limitNum,
    });
  } catch (error: any) {
    console.error('[CourseFramework] List drafts error:', error);
    res.status(500).json({ error: 'Failed to list drafts' });
  }
});

const contextRouter = Router();

contextRouter.get('/:courseId/framework/context', requireAuth, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.organizationId !== effectiveOrgId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, course.organizationId),
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      return res.status(404).json({ error: 'Course framework not found' });
    }

    const topics = (framework.topics as any[]) || [];

    const lessonIds = topics
      .filter(t => t.lessonId)
      .map(t => t.lessonId as string);

    let lessonsMap: Map<string, typeof lessonsTable.$inferSelect> = new Map();
    
    if (lessonIds.length > 0) {
      const existingLessons = await db.query.lessons.findMany({
        where: and(
          eq(lessonsTable.organizationId, effectiveOrgId),
          inArray(lessonsTable.id, lessonIds)
        ),
      });
      
      for (const lesson of existingLessons) {
        lessonsMap.set(lesson.id, lesson);
      }
    }

    const generateSynopsis = (lesson: typeof lessonsTable.$inferSelect): string => {
      if (lesson.description) {
        return lesson.description.substring(0, 500);
      }
      
      const contract = lesson.learningAssetContract as any;
      if (contract?.slides?.length > 0) {
        const firstSlide = contract.slides[0];
        const content = firstSlide.keyPoints?.join(' ') || firstSlide.title || '';
        return content.substring(0, 500);
      }
      
      return '';
    };

    let overviewLesson: { id: string; title: string; synopsis: string } | undefined;
    const existingLessonsResponse: Record<string, { id: string; title: string; synopsis: string }> = {};

    for (const topic of topics) {
      if (topic.lessonId && lessonsMap.has(topic.lessonId)) {
        const lesson = lessonsMap.get(topic.lessonId)!;
        const lessonInfo = {
          id: lesson.id,
          title: lesson.title,
          synopsis: generateSynopsis(lesson),
        };

        if (topic.isOverview === true) {
          overviewLesson = lessonInfo;
        }

        if (topic.id) {
          existingLessonsResponse[topic.id] = lessonInfo;
        }
      }
    }

    // Build explicit topic-to-lesson mapping for deterministic resolution
    // Include generationStatus so client can poll while lessons are being generated
    const topicLessonMap = topics.map(topic => {
      const lesson = topic.lessonId ? lessonsMap.get(topic.lessonId) : null;
      return {
        topicId: topic.id || null,
        topicName: topic.name,
        lessonId: topic.lessonId || null,
        order: topic.order,
        isOverview: topic.isOverview || false,
        generationStatus: lesson?.generationStatus || null,
      };
    });

    const response = {
      course: {
        id: course.id,
        title: course.title,
        description: course.description || '',
        targetAudience: course.difficultyLevel || 'intermediate',
        organizationType: organization.type || 'elearning',
      },
      framework: {
        topics: topics,
      },
      topicLessonMap,
      overviewLesson,
      existingLessons: existingLessonsResponse,
    };

    console.log(`[CourseFramework] Retrieved context for course ${courseId} with ${topics.length} topics`);

    res.json(response);
  } catch (error: any) {
    console.error('[CourseFramework] Get context error:', error);
    res.status(500).json({ error: 'Failed to fetch course context' });
  }
});

contextRouter.get('/:courseId/lessons', requireAuth, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const links = await db
      .select({
        id: courseLessons.id,
        courseId: courseLessons.courseId,
        lessonId: courseLessons.lessonId,
        topicOrder: courseLessons.topicOrder,
        topicName: courseLessons.topicName,
        primaryQuizId: courseLessons.primaryQuizId,
        lesson: {
          id: lessonsTable.id,
          title: lessonsTable.title,
          generationStatus: lessonsTable.generationStatus,
        },
      })
      .from(courseLessons)
      .leftJoin(lessonsTable, eq(courseLessons.lessonId, lessonsTable.id))
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(courseLessons.topicOrder);

    console.log(`[CourseLessons] Retrieved ${links.length} lessons for course ${courseId}`);

    res.json({ lessons: links });
  } catch (error: any) {
    console.error('[CourseLessons] Get lessons error:', error);
    res.status(500).json({ error: 'Failed to fetch course lessons' });
  }
});

const categoryRouter = Router();

interface OrgCategoryItem {
  id: string;
  name: string;
  type: 'department' | 'grade' | 'subject' | 'category';
  group?: string;
}

categoryRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const effectiveOrg = getEffectiveOrganization(req.session);
    
    if (!effectiveOrg) {
      const effectiveOrgId = await getUserEffectiveOrganizationId(req);
      if (!effectiveOrgId) {
        return res.status(403).json({ error: 'No organization context' });
      }
      
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, effectiveOrgId),
      });
      
      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      const orgType = org.type as 'education' | 'business' | 'elearning';
      return res.json(await getCategoriesForOrgType(effectiveOrgId, orgType));
    }
    
    return res.json(await getCategoriesForOrgType(effectiveOrg.orgId, effectiveOrg.orgType));
  } catch (error: any) {
    console.error('[CourseCategories] Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET: Public categories list (for browse courses page - no auth required)
categoryRouter.get('/public', async (req: Request, res: Response) => {
  try {
    // Return only DB categories for public browsing
    // Note: Only DB categories have valid UUIDs that match course.categoryId
    // Hardcoded COURSE_CATEGORIES use slug IDs which can't be used for filtering
    const dbCategories = await db.query.courseCategories.findMany();
    
    const categories: OrgCategoryItem[] = dbCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      type: 'category' as const,
      group: 'Categories',
    }));
    
    res.json({ categories, orgType: 'public' });
  } catch (error: any) {
    console.error('[CourseCategories] Get public categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

async function getCategoriesForOrgType(
  orgId: string, 
  orgType: 'education' | 'business' | 'elearning'
): Promise<{ categories: OrgCategoryItem[], orgType: string }> {
  const categories: OrgCategoryItem[] = [];
  
  if (orgType === 'elearning') {
    const dbCategories = await db.query.courseCategories.findMany({
      where: eq(courseCategories.organizationId, orgId),
    });
    
    if (dbCategories.length > 0) {
      categories.push(...dbCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        type: 'category' as const,
        group: 'Categories',
      })));
    } else {
      categories.push(...COURSE_CATEGORIES.map(cat => ({
        id: cat.slug,
        name: cat.label,
        type: 'category' as const,
        group: cat.group || 'Other',
      })));
    }
  } else if (orgType === 'business') {
    const units = await db.query.organizationUnits.findMany({
      where: and(
        eq(organizationUnits.organizationId, orgId),
        eq(organizationUnits.isActive, true)
      ),
      orderBy: [desc(organizationUnits.displayOrder)],
    });
    
    categories.push(...units.map(unit => ({
      id: unit.id,
      name: unit.name,
      type: 'department' as const,
      group: 'Departments',
    })));
  } else if (orgType === 'education') {
    const units = await db.query.organizationUnits.findMany({
      where: and(
        eq(organizationUnits.organizationId, orgId),
        eq(organizationUnits.isActive, true)
      ),
      orderBy: [desc(organizationUnits.displayOrder)],
    });
    
    categories.push(...units.map(unit => ({
      id: unit.id,
      name: unit.name,
      type: 'grade' as const,
      group: 'Grades',
    })));
    
    const subjectList = await db.query.subjects.findMany({
      where: and(
        eq(subjects.organizationId, orgId),
        eq(subjects.isActive, true),
        eq(subjects.isDeleted, false)
      ),
    });
    
    categories.push(...subjectList.map(subject => ({
      id: subject.id,
      name: subject.name,
      type: 'subject' as const,
      group: 'Subjects',
    })));
  }
  
  return { categories, orgType };
}

// POST: Create a new category (for e-learning orgs only)
categoryRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    const trimmedName = name.trim();
    
    // Generate slug from name
    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const effectiveOrg = getEffectiveOrganization(req.session);
    let orgId: string | null = null;
    
    if (effectiveOrg) {
      orgId = effectiveOrg.orgId;
    } else {
      orgId = await getUserEffectiveOrganizationId(req);
    }
    
    if (!orgId) {
      return res.status(403).json({ error: 'No organization context' });
    }
    
    // Check if category with same name already exists in this org
    const existing = await db.query.courseCategories.findFirst({
      where: and(
        eq(courseCategories.organizationId, orgId),
        sql`LOWER(${courseCategories.name}) = LOWER(${trimmedName})`
      ),
    });
    
    if (existing) {
      return res.status(409).json({ error: 'Category with this name already exists', existingCategory: existing });
    }
    
    // Create new category
    const newCategory = await db.insert(courseCategories).values({
      id: randomUUID(),
      organizationId: orgId,
      name: trimmedName,
      description: null,
      iconName: null,
    }).returning();
    
    res.status(201).json({ 
      category: newCategory[0],
      message: 'Category created successfully'
    });
  } catch (error: any) {
    console.error('[CourseCategories] Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

const contentValidationRouter = Router();

const MIN_WORDS_FOR_GENERATION = 200; // Aligned with framework generation requirement

contentValidationRouter.get('/:courseId/lessons/health', requireAuth, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });
    
    if (!course || course.organizationId !== effectiveOrgId) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const courseLessonsList = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
    });
    
    const lessonIds = courseLessonsList.map(cl => cl.lessonId);
    
    if (lessonIds.length === 0) {
      return res.json({ 
        courseId,
        lessonsTotal: 0,
        lessonsReady: 0,
        lessonsWithIssues: 0,
        overallHealth: 'empty',
        lessons: [] 
      });
    }

    const lessonRecords = await db.query.lessons.findMany({
      where: inArray(lessonsTable.id, lessonIds),
    });

    const lessonHealth = lessonRecords.map(lesson => {
      const inputText = lesson.inputText || '';
      const wordCount = inputText.split(/\s+/).filter((w: string) => w.length > 0).length;
      
      let status: 'ready' | 'warning' | 'error';
      let message: string;
      
      if (!inputText || inputText.trim().length === 0) {
        status = 'error';
        message = 'No source content available. Regenerate framework to extract content.';
      } else if (wordCount < MIN_WORDS_FOR_GENERATION) {
        status = 'warning';
        message = `Only ${wordCount} words (minimum ${MIN_WORDS_FOR_GENERATION} required)`;
      } else {
        status = 'ready';
        message = `${wordCount} words of source content`;
      }
      
      const lessonAny = lesson as any;
      return {
        lessonId: lesson.id,
        title: lesson.title,
        status,
        message,
        wordCount,
        hasBloomObjectives: !!(lessonAny.gammaLearningObjectives && Array.isArray(lessonAny.gammaLearningObjectives) && lessonAny.gammaLearningObjectives.length > 0),
        hasKeyTerms: !!(lessonAny.gammaKeyTerms && Array.isArray(lessonAny.gammaKeyTerms) && lessonAny.gammaKeyTerms.length > 0),
      };
    });

    const readyCount = lessonHealth.filter(l => l.status === 'ready').length;
    const warningCount = lessonHealth.filter(l => l.status === 'warning').length;
    const errorCount = lessonHealth.filter(l => l.status === 'error').length;
    
    let overallHealth: 'healthy' | 'warning' | 'critical' | 'empty';
    if (errorCount > 0) {
      overallHealth = 'critical';
    } else if (warningCount > 0) {
      overallHealth = 'warning';
    } else {
      overallHealth = 'healthy';
    }

    return res.json({
      courseId,
      lessonsTotal: lessonHealth.length,
      lessonsReady: readyCount,
      lessonsWithIssues: warningCount + errorCount,
      overallHealth,
      lessons: lessonHealth,
    });
  } catch (error: any) {
    console.error('[ContentValidation] Health check failed:', error);
    return res.status(500).json({ error: 'Failed to check content health' });
  }
});

contentValidationRouter.post('/:lessonId/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const lesson = await db.query.lessons.findFirst({
      where: eq(lessonsTable.id, lessonId),
    });
    
    if (!lesson || lesson.organizationId !== effectiveOrgId) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const inputText = lesson.inputText || '';
    const wordCount = inputText.split(/\s+/).filter((w: string) => w.length > 0).length;
    
    const canGenerate = wordCount >= MIN_WORDS_FOR_GENERATION;
    const lessonAny = lesson as any;
    
    return res.json({
      lessonId,
      canGenerate,
      wordCount,
      minRequired: MIN_WORDS_FOR_GENERATION,
      hasBloomObjectives: !!(lessonAny.gammaLearningObjectives && Array.isArray(lessonAny.gammaLearningObjectives) && lessonAny.gammaLearningObjectives.length > 0),
      hasKeyTerms: !!(lessonAny.gammaKeyTerms && Array.isArray(lessonAny.gammaKeyTerms) && lessonAny.gammaKeyTerms.length > 0),
      error: canGenerate ? null : `Insufficient content: ${wordCount} words (minimum ${MIN_WORDS_FOR_GENERATION} required)`,
    });
  } catch (error: any) {
    console.error('[ContentValidation] Lesson validation failed:', error);
    return res.status(500).json({ error: 'Failed to validate lesson' });
  }
});

// GAP 2 & 3 FIX: Content Coach API endpoints for AI-powered feedback
const contentCoachRouter = Router();

/**
 * POST /api/courses/drafts/:draftId/preview-feedback
 * Generate AI-powered feedback for a draft lesson (before it's saved to DB)
 * Charges LP Credits for the analysis
 */
router.post('/:draftId/preview-feedback', requireAuth, async (req: Request, res: Response) => {
  try {
    const { draftId } = req.params;
    const { lessonIndex, lessonData } = req.body;
    const userId = req.session.userId!;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }
    
    // Verify draft access
    const { draft, error, statusCode } = await verifyDraftAccess(req, draftId, effectiveOrgId);
    if (error || !draft) {
      return res.status(statusCode).json({ error });
    }
    
    // Validate lesson data
    if (!lessonData || !lessonData.title) {
      return res.status(400).json({ error: 'Lesson data with title is required' });
    }
    
    // Get credit cost for feedback
    const creditCost = await healthReportPricingService.getHealthReportCreditCost(effectiveOrgId);
    
    // Check credits
    const deductionPreview = await HybridCreditService.previewDeduction({
      userId,
      organizationId: effectiveOrgId,
      amount: creditCost,
    });
    
    if (!deductionPreview.canDeduct) {
      return res.status(402).json({
        error: 'Insufficient credits',
        required: creditCost,
        userBalance: deductionPreview.userBalance,
        orgBalance: deductionPreview.orgBalance,
        orgWalletEnabled: deductionPreview.orgWalletEnabled,
        reason: deductionPreview.reason,
      });
    }
    
    // Deduct credits
    const correlationId = `preview_feedback_${draftId}_${lessonIndex ?? 0}_${Date.now()}`;
    await HybridCreditService.deductWithFallback({
      userId,
      organizationId: effectiveOrgId,
      amount: creditCost,
      type: 'deduction',
      correlationId,
      description: `Draft lesson feedback: "${lessonData.title}"`,
      activityType: 'lesson_feedback',
      metadata: { draftId, lessonIndex },
    });
    
    // Generate preview feedback
    const courseContext = draft.generatedTitle 
      ? { title: draft.generatedTitle, description: draft.generatedDescription || undefined }
      : undefined;
    
    const feedback = await contentCoachService.generatePreviewFeedback(
      {
        title: lessonData.title,
        description: lessonData.description,
        detail: lessonData.detail,
        objectives: lessonData.objectives,
        realWorldExample: lessonData.realWorldExample,
      },
      { courseContext }
    );
    
    const score10 = Math.round(feedback.overallScore) / 10;
    
    console.log(`[PreviewFeedback] Generated feedback for draft ${draftId} lesson "${lessonData.title}": score ${score10}/10`);
    
    return res.json({
      cached: false,
      score10,
      report: feedback,
      creditsCharged: creditCost,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error.name === 'InsufficientCreditsError' || error.name === 'InsufficientHybridCreditsError') {
      return res.status(402).json({
        error: 'Insufficient credits',
        message: error.message,
      });
    }
    console.error('[PreviewFeedback] Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate preview feedback' });
  }
});

contentCoachRouter.get('/:lessonId/coach', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const forceRefresh = req.query.refresh === 'true';
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const lesson = await db.query.lessons.findFirst({
      where: eq(lessonsTable.id, lessonId),
    });
    
    if (!lesson || lesson.organizationId !== effectiveOrgId) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const feedback = await contentCoachService.getContentFeedback(lessonId, {
      forceRefresh,
    });

    return res.json(feedback);
  } catch (error: any) {
    console.error('[ContentCoach] Feedback generation failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate content feedback' });
  }
});

contentCoachRouter.get('/:courseId/coach/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const effectiveOrgId = await getUserEffectiveOrganizationId(req);
    
    if (!effectiveOrgId) {
      return res.status(403).json({ error: 'No organization context' });
    }

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });
    
    if (!course || course.organizationId !== effectiveOrgId) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const courseLessonsList = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
    });
    
    const lessonIds = courseLessonsList.map(cl => cl.lessonId);
    
    if (lessonIds.length === 0) {
      return res.json({ 
        courseId,
        lessonsAnalyzed: 0,
        averageScore: 0,
        averageGrade: 'N/A',
        lessonsNeedingAttention: 0,
      });
    }

    const lessonRecords = await db.query.lessons.findMany({
      where: inArray(lessonsTable.id, lessonIds),
    });

    let totalScore = 0;
    let analyzedCount = 0;
    let needsAttentionCount = 0;
    const lessonSummaries: Array<{lessonId: string; title: string; score: number; grade: string}> = [];

    for (const lesson of lessonRecords) {
      const inputText = lesson.inputText || '';
      const wordCount = inputText.split(/\s+/).filter((w: string) => w.length > 0).length;
      
      if (wordCount >= 50) {
        try {
          const feedback = await contentCoachService.getContentFeedback(lesson.id, { forceRefresh: false });
          analyzedCount++;
          totalScore += feedback.overallScore;
          lessonSummaries.push({
            lessonId: lesson.id,
            title: lesson.title,
            score: feedback.overallScore,
            grade: feedback.qualityGrade,
          });
          if (feedback.overallScore < 70) {
            needsAttentionCount++;
          }
        } catch {
          const estimatedScore = Math.min(100, Math.round(wordCount / 8) + 40);
          analyzedCount++;
          totalScore += estimatedScore;
          if (wordCount < 200 || estimatedScore < 70) {
            needsAttentionCount++;
          }
        }
      } else {
        needsAttentionCount++;
      }
    }

    const averageScore = analyzedCount > 0 ? Math.round(totalScore / analyzedCount) : 0;
    let averageGrade = 'F';
    if (averageScore >= 90) averageGrade = 'A';
    else if (averageScore >= 80) averageGrade = 'B';
    else if (averageScore >= 70) averageGrade = 'C';
    else if (averageScore >= 60) averageGrade = 'D';

    return res.json({
      courseId,
      lessonsAnalyzed: analyzedCount,
      totalLessons: lessonRecords.length,
      averageScore,
      averageGrade,
      lessonsNeedingAttention: needsAttentionCount,
    });
  } catch (error: any) {
    console.error('[ContentCoach] Course summary failed:', error);
    return res.status(500).json({ error: 'Failed to generate course summary' });
  }
});

function generateDeterministicUUID(seed: string): string {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

async function seedDefaultCategories(): Promise<void> {
  try {
    const existingCategories = await db.query.courseCategories.findMany();
    
    if (existingCategories.length > 0) {
      console.log(`[CourseCategories] Found ${existingCategories.length} existing categories, skipping seed`);
      return;
    }
    
    let defaultOrgId = process.env.DEFAULT_ORG_ID;
    
    if (!defaultOrgId) {
      const generalOrg = await db.query.organizations.findFirst({
        where: eq(organizations.name, 'General Org'),
      });
      if (generalOrg) {
        defaultOrgId = generalOrg.id;
      } else {
        console.log('[CourseCategories] No DEFAULT_ORG_ID and no General Org found, skipping category seed');
        return;
      }
    }
    
    console.log('[CourseCategories] Seeding default categories with deterministic IDs...');
    
    const categoriesToInsert = COURSE_CATEGORIES.map(cat => ({
      id: generateDeterministicUUID(`learnplay-category-${cat.slug}`),
      organizationId: defaultOrgId,
      name: cat.label,
      description: `Default category for ${cat.group || 'general'} courses`,
      iconName: null,
    }));
    
    await db.insert(courseCategories).values(categoriesToInsert);
    
    console.log(`[CourseCategories] Seeded ${categoriesToInsert.length} default categories`);
  } catch (error) {
    console.error('[CourseCategories] Failed to seed default categories:', error);
  }
}

export function registerCourseFrameworkRoutes(app: any) {
  app.use('/api/courses/drafts', router);
  app.use('/api/courses/categories', categoryRouter);
  app.use('/api/courses', contextRouter);
  app.use('/api/content', contentValidationRouter);
  app.use('/api/content', contentCoachRouter);
  console.log('[CourseFramework] Routes registered at /api/courses/drafts');
  console.log('[CourseCategories] Routes registered at /api/courses/categories');
  console.log('[CourseFramework] Context route registered at /api/courses/:courseId/framework/context');
  console.log('[ContentValidation] Routes registered at /api/content');
  console.log('[ContentCoach] Routes registered at /api/content/:lessonId/coach');
  
  // Data safety invariant: startup route registration must not seed persistent data.
}

export default router;
