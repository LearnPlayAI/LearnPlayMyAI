import { z } from "zod";

// ========================================
// COURSE FRAMEWORK GENERATOR API CONTRACTS
// ========================================

// ==================== Bloom's Taxonomy Types ====================

export const bloomLevelSchema = z.enum([
  "remember",
  "understand", 
  "apply",
  "analyze",
  "evaluate",
  "create"
]);

export const learningObjectiveSchema = z.object({
  id: z.string().uuid(),
  bloomLevel: bloomLevelSchema,
  objective: z.string().min(1, "Objective text is required"),
  assessmentIdea: z.string().optional(),
});

// ==================== Lesson Schemas ====================

export const lessonTypeSchema = z.enum(["overview", "content", "key_takeaways"]);

export const sourceAssetTypeSchema = z.enum([
  "image",
  "page_snapshot",
  "slide_snapshot",
  "table_snapshot",
]);

export const sourceAssetUseSchema = z.enum([
  "lesson_visual",
  "quiz_stimulus",
  "reference",
]);

export const sourceAssetSchema = z.object({
  id: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  assetType: sourceAssetTypeSchema,
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  pageOrSlide: z.number().int().positive().nullable().optional(),
  caption: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  extractionMethod: z.string().min(1),
  containsEmbeddedText: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const sourceAssetRefSchema = z.object({
  assetId: z.string().min(1),
  recommendedUse: sourceAssetUseSchema,
  caption: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  pageOrSlide: z.number().int().positive().nullable().optional(),
  sourceSegmentIds: z.array(z.string()).optional(),
});

export const generatedLessonSchema = z.object({
  title: z.string().min(1, "Lesson title is required"),
  description: z.string().min(1, "Lesson description is required"),
  objectives: z.array(z.string()).min(1, "At least one learning objective is required"),
  isFromContent: z.boolean().default(false),
  isSelected: z.boolean().default(true),
  sourceDocumentId: z.string().nullable().optional(),
  isOverview: z.boolean().default(false).optional(),
  lessonType: lessonTypeSchema.default("content").optional(),
  detail: z.string().optional(),
  realWorldExample: z.string().optional(),
  detailedSummary: z.string().optional(),
  learningObjectives: z.array(learningObjectiveSchema).optional(),
  keyTerms: z.array(z.string()).optional(),
  assessmentIdeas: z.array(z.string()).optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  prerequisiteTopicIds: z.array(z.string()).optional(),
  sourceContent: z.string().optional(),
  sourceSegmentIds: z.array(z.string().uuid()).optional(),
  contentStatus: z.enum(['ok', 'needs_content']).optional(),
  contentWordCount: z.number().int().nonnegative().optional(),
  contentDeficit: z.number().int().nonnegative().optional(),
  contentWarning: z.string().optional(),
  canGenerate: z.boolean().optional(),
  aiCoachFeedback: z.any().optional(),
  feedbackGeneratedAt: z.string().optional(),
  feedbackScore10: z.number().optional(),
  sourceAssets: z.array(sourceAssetRefSchema).optional(),
  sourceContentRaw: z.string().optional(),
  sourceNormalization: z.record(z.unknown()).optional(),
  sourceNormalizationWarnings: z.array(z.string()).optional(),
  sourceCitations: z.array(z.record(z.unknown())).optional(),
});

export const recommendedLessonSchema = z.object({
  title: z.string().min(1, "Lesson title is required"),
  description: z.string().min(1, "Lesson description is required"),
  objectives: z.array(z.string()).min(1, "At least one learning objective is required"),
  rationale: z.string().min(1, "Rationale for recommendation is required"),
});

// ==================== Document Extraction Schemas ====================

export const extractedSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  pageNumber: z.number().int().positive().optional(),
  type: z.enum(["title", "heading", "paragraph", "list", "table", "image_caption", "code", "other"]),
  metadata: z.record(z.unknown()).optional(),
});

export const extractedTableCellSchema = z.object({
  text: z.string(),
  rowIndex: z.number().int().nonnegative(),
  columnIndex: z.number().int().nonnegative(),
  isHeader: z.boolean().default(false),
  rowSpan: z.number().int().positive().default(1),
  colSpan: z.number().int().positive().default(1),
});

export const extractedTableSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().positive(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  cells: z.array(extractedTableCellSchema),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  nearbyHeading: z.string().nullable().optional(),
  markdown: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const documentOutlineNodeLevelSchema = z.enum([
  "document",
  "term",
  "chapter",
  "section",
  "subsection",
  "slide",
]);

export const documentOutlineNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  level: documentOutlineNodeLevelSchema,
  parentId: z.string().nullable().optional(),
  order: z.number().int().nonnegative(),
  pageStart: z.number().int().positive().nullable().optional(),
  pageEnd: z.number().int().positive().nullable().optional(),
  wordCount: z.number().int().nonnegative(),
  content: z.string().optional(),
  sourceSectionIndexes: z.array(z.number().int().nonnegative()).optional(),
  assetIds: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Structural hints detected from document formatting (optional, for reference only)
export const structuralHintSchema = z.object({
  text: z.string(),
  hintType: z.enum(["bold", "caps", "numbered", "heading", "bullet"]),
  position: z.number().int().nonnegative(),
});

// New extraction result that includes raw text for AI analysis
// Source mapping for zero-hallucination validation
export const sourceSpanSchema = z.object({
  sectionId: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  textSpan: z.string(),
  confidence: z.number().min(0).max(1),
});

export const sourceMapSchema = z.object({
  documentId: z.string(),
  documentName: z.string(),
  rawTextHash: z.string(),
  sections: z.array(sourceSpanSchema),
  extractedAt: z.string(),
});

export const extractedContentSchema = z.object({
  rawText: z.string(), // Full document text for AI analysis
  wordCount: z.number().int().nonnegative(),
  structuredHints: z.array(structuralHintSchema).optional(), // Optional formatting hints
  sections: z.array(extractedSectionSchema).optional(), // Legacy sections (if headings found)
  tables: z.array(extractedTableSchema).optional(),
  documentOutline: z.array(documentOutlineNodeSchema).optional(),
  sourceAssets: z.array(sourceAssetSchema).optional(),
  sourceMap: sourceMapSchema.optional(), // Source mapping for validation
  metadata: z.object({
    fileName: z.string(),
    mimeType: z.string(),
    fileSize: z.number().int().positive(),
    pageCount: z.number().int().positive().optional(),
    slideCount: z.number().int().positive().optional(),
    extractedAt: z.string().datetime(),
  }),
});

export const documentExtractionResponseSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  extractedContent: extractedContentSchema.optional(),
  sections: z.array(extractedSectionSchema).optional(), // Legacy compatibility
  error: z.string().nullable().optional(),
  extractedAt: z.string().datetime().optional(),
});

// ==================== Content Health Schemas ====================

export const contentWarningSchema = z.object({
  lessonIndex: z.number().int().nonnegative(),
  title: z.string(),
  wordCount: z.number().int().nonnegative(),
  deficit: z.number().int().nonnegative(),
  minRequired: z.number().int().positive(),
  status: z.enum(['ok', 'needs_content']),
});

export const contentHealthSchema = z.object({
  totalLessons: z.number().int().nonnegative(),
  lessonsWithSufficientContent: z.number().int().nonnegative(),
  lessonsNeedingContent: z.number().int().nonnegative(),
  overallStatus: z.enum(['healthy', 'warning', 'critical']),
});

// ==================== Framework Generation Schemas ====================

export const frameworkGenerationRequestSchema = z.object({
  draftId: z.string().min(1, "Draft ID is required"),
  courseDescription: z.string().optional(),
  includeRecommendations: z.boolean().default(true),
  targetAudience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  maxLessons: z.number().int().min(1).max(50).default(10),
});

export const frameworkGenerationResponseSchema = z.object({
  draftId: z.string(),
  generatedTitle: z.string(),
  generatedDescription: z.string(),
  generatedLessons: z.array(generatedLessonSchema),
  recommendedLessons: z.array(recommendedLessonSchema).optional(),
  advisorHints: z.array(z.lazy(() => advisorHintSchema)).optional(),
  version: z.number().int().positive(),
  contentWarnings: z.array(contentWarningSchema).optional(),
  contentHealth: contentHealthSchema.optional(),
  coverageReport: z.object({
    totalSegments: z.number().int().nonnegative(),
    assignedSegments: z.number().int().nonnegative(),
    unassignedSegments: z.number().int().nonnegative(),
    overlapSegments: z.number().int().nonnegative(),
    excludedSegments: z.number().int().nonnegative(),
    status: z.enum(["pass", "fail"]),
    details: z.record(z.unknown()).optional(),
  }).optional(),
});

// ==================== Advisor Hints ====================

export const advisorHintSchema = z.object({
  type: z.enum(["suggestion", "warning", "best_practice", "missing_content"]),
  message: z.string(),
  relatedLessonIndex: z.number().int().nonnegative().optional(),
  actionSuggestion: z.string().optional(),
});

// ==================== Draft Management Schemas ====================

export const createDraftRequestSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  courseDescription: z.string().optional(),
});

export const createDraftResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdBy: z.string(),
  currentStep: z.enum(["upload", "select_content", "generate", "review", "complete"]),
  createdAt: z.string().datetime(),
});

export const updateDraftRequestSchema = z.object({
  courseDescription: z.string().optional(),
  // Topic analysis state (persisted for navigation)
  // Supports both legacy string format and new object format with word counts
  analyzedTopics: z.array(z.union([
    z.string(),
    z.object({ name: z.string(), estimatedWordCount: z.number().optional() })
  ])).optional(),
  selectedTopics: z.array(z.string()).optional(),
  customTopics: z.array(z.object({
    name: z.string(),
    documentId: z.string().optional(),
  })).optional(),
  selectedOutlineNodeIds: z.array(z.string()).optional(),
  selectedOutlineContextNodeIds: z.array(z.string()).optional(),
  suggestedTitle: z.string().optional(),
  generatedTitle: z.string().optional(),
  generatedDescription: z.string().optional(),
  generatedLessons: z.array(generatedLessonSchema).optional(),
  currentStep: z.enum(["upload", "select_content", "generate", "review", "complete"]).optional(),
  version: z.number().int().positive().optional(), // Made optional for topic-only updates
  courseSettings: z.object({
    categoryId: z.string().uuid().optional(),
    documentOutlineSelection: z.object({
      selectedNodeIds: z.array(z.string()).optional(),
      contextNodeIds: z.array(z.string()).optional(),
      selectedDocumentId: z.string().optional(),
    }).optional(),
  }).optional(),
});

// ==================== Document Upload Schemas ====================

export const uploadDocumentRequestSchema = z.object({
  draftId: z.string().min(1, "Draft ID is required"),
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().min(1, "MIME type is required"),
  fileSize: z.number().int().positive("File size must be positive"),
});

export const uploadDocumentResponseSchema = z.object({
  documentId: z.string(),
  uploadUrl: z.string().url().optional(),
  storagePath: z.string(),
});

// ==================== Error Envelope Types ====================

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: apiErrorSchema.optional(),
  });

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    hasMore: z.boolean(),
  });

// ==================== Type Exports ====================

export type BloomLevel = z.infer<typeof bloomLevelSchema>;
export type LearningObjective = z.infer<typeof learningObjectiveSchema>;
export type LessonType = z.infer<typeof lessonTypeSchema>;
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;
export type RecommendedLesson = z.infer<typeof recommendedLessonSchema>;
export type ExtractedSection = z.infer<typeof extractedSectionSchema>;
export type ExtractedTable = z.infer<typeof extractedTableSchema>;
export type ExtractedTableCell = z.infer<typeof extractedTableCellSchema>;
export type DocumentOutlineNode = z.infer<typeof documentOutlineNodeSchema>;
export type StructuralHint = z.infer<typeof structuralHintSchema>;
export type ExtractedContent = z.infer<typeof extractedContentSchema>;
export type DocumentExtractionResponse = z.infer<typeof documentExtractionResponseSchema>;
export type FrameworkGenerationRequest = z.infer<typeof frameworkGenerationRequestSchema>;
export type FrameworkGenerationResponse = z.infer<typeof frameworkGenerationResponseSchema>;
export type AdvisorHint = z.infer<typeof advisorHintSchema>;
export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>;
export type CreateDraftResponse = z.infer<typeof createDraftResponseSchema>;
export type UpdateDraftRequest = z.infer<typeof updateDraftRequestSchema>;
export type UploadDocumentRequest = z.infer<typeof uploadDocumentRequestSchema>;
export type UploadDocumentResponse = z.infer<typeof uploadDocumentResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ContentWarning = z.infer<typeof contentWarningSchema>;
export type ContentHealth = z.infer<typeof contentHealthSchema>;

// ==================== Wizard Step Constants ====================

export const WIZARD_STEPS = ["upload", "select_content", "generate", "review", "complete"] as const;
export type WizardStep = typeof WIZARD_STEPS[number];

export const EXTRACTION_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type ExtractionStatus = typeof EXTRACTION_STATUSES[number];
